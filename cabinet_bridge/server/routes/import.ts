import { Express } from "express";
import express from "express";
import { storage, sqlite } from "../storage";

function decodeXMLEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseXmlTags(xmlText: string) {
  const map = new Map<string, string>();
  const tagRegex = /<([a-zA-Z0-9_]+)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRegex.exec(xmlText)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!map.has(tagName)) {
      map.set(tagName, decodeXMLEntities(match[2]));
    }
  }
  return map;
}

const DB_METADATA_COLS: Record<string, string> = {
  description: "description",
  releaseYear: "release_year",
  developer: "developer",
  publisher: "publisher",
  genre: "genre",
  players: "players",
  artUrl: "art_url",
  rating: "rating",
  playCount: "play_count",
  lastPlayed: "last_played",
  scrapeStatus: "scrape_status",
};

const METADATA_FIELDS = Object.keys(DB_METADATA_COLS);

function batchUpdateRomMetadata(updates: { id: number; meta: Record<string, any> }[]) {
  if (updates.length === 0) return;

  // Deduplicate and merge by ROM ID to avoid duplicate WHEN clauses in CASE statements
  const mergedMap = new Map<number, Record<string, any>>();
  for (const { id, meta } of updates) {
    const existing = mergedMap.get(id);
    if (!existing) {
      mergedMap.set(id, { ...meta });
    } else {
      Object.assign(existing, meta);
    }
  }

  const dedupedUpdates = Array.from(mergedMap.entries()).map(([id, meta]) => ({ id, meta }));
  const batchSize = 200;

  for (let i = 0; i < dedupedUpdates.length; i += batchSize) {
    const batch = dedupedUpdates.slice(i, i + batchSize);
    const ids = batch.map((u) => u.id);

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const col of METADATA_FIELDS) {
      const dbCol = DB_METADATA_COLS[col];
      let caseSql = `"${dbCol}" = CASE "id" `;
      let hasColUpdate = false;
      for (const u of batch) {
        if (u.meta[col] !== undefined) {
          caseSql += `WHEN ? THEN ? `;
          params.push(u.id, u.meta[col]);
          hasColUpdate = true;
        }
      }
      if (hasColUpdate) {
        caseSql += `ELSE "${dbCol}" END`;
        setClauses.push(caseSql);
      }
    }

    if (setClauses.length > 0) {
      const sqlStr = `UPDATE "uploaded_roms" SET ${setClauses.join(", ")} WHERE "id" IN (${ids.map(() => "?").join(",")})`;
      params.push(...ids);
      sqlite.prepare(sqlStr).run(...params);
    }
  }
}

export function registerImportRoutes(app: Express) {
  // ── EmulationStation gamelist.xml import ──────────────────────────────────
  app.post("/api/import/emulationstation", express.raw({ limit: "50mb", type: ["text/xml", "application/xml", "application/octet-stream", "text/plain"] }), async (req, res) => {
    try {
      const xml = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : (typeof req.body === "string" ? req.body : "");
      const gameBlocks = [...xml.matchAll(/<game[^>]*>([\s\S]*?)<\/game>/gi)];
      const roms = await storage.listUploadedRoms();

      // Pre-build O(1) lookup maps for matching
      const baseNameMap = new Map<string, typeof roms[0]>();
      const titleMap = new Map<string, typeof roms[0]>();
      for (const r of roms) {
        const baseName = r.originalName.replace(/\..*$/, "").toLowerCase();
        if (!baseNameMap.has(baseName)) {
          baseNameMap.set(baseName, r);
        }
        const t = r.title.toLowerCase();
        if (!titleMap.has(t)) {
          titleMap.set(t, r);
        }
      }

      const results: { title: string; updated: boolean; reason?: string }[] = [];
      const updates: { id: number; meta: Record<string, any> }[] = [];

      for (const block of gameBlocks) {
        const inner = block[1];
        const tags = parseXmlTags(inner);

        const path2 = tags.get("path") ?? null;
        const name = tags.get("name") ?? null;
        if (!path2 && !name) continue;

        const baseName = path2 ? path2.split(/[\/\\]/).pop()?.replace(/\..*$/, "").toLowerCase() : null;
        let match = baseName ? baseNameMap.get(baseName) : undefined;
        if (!match && name) {
          match = titleMap.get(name.toLowerCase());
        }

        if (!match) {
          results.push({ title: name ?? path2 ?? "?", updated: false, reason: "no matching ROM" });
          continue;
        }

        const meta: Record<string, any> = {};
        const desc = tags.get("desc");
        const date = tags.get("releasedate");
        const dev = tags.get("developer");
        const pub = tags.get("publisher");
        const genre = tags.get("genre");
        const players = tags.get("players");
        const image = tags.get("image");
        const rating = tags.get("rating");
        const playcount = tags.get("playcount");
        const lastplayed = tags.get("lastplayed");

        if (desc) meta.description = desc.slice(0, 2000);
        if (date) { const y = Number(date.slice(0, 4)); if (y >= 1970 && y <= 2030) meta.releaseYear = y; }
        if (dev) meta.developer = dev.slice(0, 256);
        if (pub) meta.publisher = pub.slice(0, 256);
        if (genre) meta.genre = genre.slice(0, 256);
        if (players) meta.players = players.slice(0, 16);
        if (image && image.startsWith("http")) meta.artUrl = image;
        if (rating) { const r = parseFloat(rating); if (!isNaN(r)) meta.rating = Math.round(r * 5); } // ES rating is 0..1, our app is 0..5
        if (playcount) { const pc = parseInt(playcount, 10); if (!isNaN(pc)) meta.playCount = pc; }
        if (lastplayed) {
          // ES lastplayed is usually YYYYMMDDTHHMMSS
          const y = parseInt(lastplayed.slice(0, 4), 10);
          const m = parseInt(lastplayed.slice(4, 6), 10) - 1;
          const d = parseInt(lastplayed.slice(6, 8), 10);
          const ts = new Date(y, m, d).getTime();
          if (!isNaN(ts)) meta.lastPlayed = ts;
        }

        if (Object.keys(meta).length > 0) {
          if (meta.artUrl || meta.description || meta.developer || meta.publisher || meta.genre) {
            meta.scrapeStatus = "matched";
          }
          updates.push({ id: match.id, meta });
        }
        results.push({ title: match.title, updated: true });
      }

      batchUpdateRomMetadata(updates);

      res.json({ imported: results.filter((r) => r.updated).length, skipped: results.filter((r) => !r.updated).length, results });
    } catch (err) {
      console.error("[Import] EmulationStation sync error:", err);
      res.status(400).json({ message: String(err) });
    }
  });

  // ── LaunchBox XML import ───────────────────────────────────────────────────
  app.post("/api/import/launchbox", express.raw({ limit: "50mb", type: ["text/xml", "application/xml", "application/octet-stream", "text/plain"] }), async (req, res) => {
    try {
      const xml = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : (typeof req.body === "string" ? req.body : "");
      const gameBlocks = [...xml.matchAll(/<Game>([\s\S]*?)<\/Game>/gi)];
      const roms = await storage.listUploadedRoms();

      // Pre-build O(1) lookup maps for matching
      const baseNameMap = new Map<string, typeof roms[0]>();
      const titleMap = new Map<string, typeof roms[0]>();
      for (const r of roms) {
        const baseName = r.originalName.replace(/\..*$/, "").toLowerCase();
        if (!baseNameMap.has(baseName)) {
          baseNameMap.set(baseName, r);
        }
        const t = r.title.toLowerCase();
        if (!titleMap.has(t)) {
          titleMap.set(t, r);
        }
      }

      const results: { title: string; updated: boolean; reason?: string }[] = [];
      const updates: { id: number; meta: Record<string, any> }[] = [];

      for (const block of gameBlocks) {
        const inner = block[1];
        const tags = parseXmlTags(inner);

        const title = tags.get("title") ?? null;
        const appPath = tags.get("applicationpath") ?? null;
        if (!title && !appPath) continue;

        const baseName = appPath ? appPath.split(/[\/\\]/).pop()?.replace(/\..*$/, "").toLowerCase() : null;
        let match = baseName ? baseNameMap.get(baseName) : undefined;
        if (!match && title) {
          match = titleMap.get(title.toLowerCase());
        }

        if (!match) {
          results.push({ title: title ?? appPath ?? "?", updated: false, reason: "no matching ROM" });
          continue;
        }

        const meta: Record<string, any> = {};
        const overview = tags.get("notes") ?? tags.get("overview");
        const releaseDate = tags.get("releasedate");
        const developer = tags.get("developer");
        const publisher = tags.get("publisher");
        const genre = tags.get("genre") ?? tags.get("genres");
        const maxPlayers = tags.get("maxplayers");
        const starRating = tags.get("starrating");
        const playCount = tags.get("playcount");

        if (overview) meta.description = overview.slice(0, 2000);
        if (releaseDate) {
          const y = Number(releaseDate.slice(0, 4));
          if (y >= 1970 && y <= 2030) meta.releaseYear = y;
        }
        if (developer) meta.developer = developer.slice(0, 256);
        if (publisher) meta.publisher = publisher.slice(0, 256);
        if (genre) meta.genre = genre.split(";")[0].trim().slice(0, 256);
        if (maxPlayers) meta.players = maxPlayers.trim().slice(0, 16);
        if (starRating) { const r = parseFloat(starRating); if (!isNaN(r)) meta.rating = Math.round(r); }
        if (playCount) { const pc = parseInt(playCount, 10); if (!isNaN(pc)) meta.playCount = pc; }

        if (Object.keys(meta).length > 0) {
          if (meta.description || meta.developer || meta.publisher || meta.genre) {
            meta.scrapeStatus = "matched";
          }
          updates.push({ id: match.id, meta });
        }
        results.push({ title: match.title, updated: true });
      }

      batchUpdateRomMetadata(updates);

      res.json({ imported: results.filter((r) => r.updated).length, skipped: results.filter((r) => !r.updated).length, results });
    } catch (err) {
      console.error("[Import] LaunchBox sync error:", err);
      res.status(400).json({ message: String(err) });
    }
  });
}

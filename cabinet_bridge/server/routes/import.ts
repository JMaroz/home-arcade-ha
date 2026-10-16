import { Express } from "express";
import express from "express";
import { storage, db, sqlite } from "../storage";
import { uploadedRoms, UploadedRom } from "@shared/schema";
import { eq } from "drizzle-orm";

function decodeXMLEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Builds O(1) lookup maps for matching ROMs by normalized base file name and title.
 */
function buildRomLookupMaps(roms: UploadedRom[]) {
  const romsByBaseName = new Map<string, UploadedRom>();
  const romsByTitle = new Map<string, UploadedRom>();

  for (const r of roms) {
    if (r.originalName) {
      const baseName = r.originalName.replace(/\..*$/, "").toLowerCase();
      if (baseName && !romsByBaseName.has(baseName)) {
        romsByBaseName.set(baseName, r);
      }
    }
    if (r.title) {
      const titleKey = r.title.toLowerCase();
      if (titleKey && !romsByTitle.has(titleKey)) {
        romsByTitle.set(titleKey, r);
      }
    }
  }

  return { romsByBaseName, romsByTitle };
}

let cachedPreparedUpdateStmt: any = null;
function getPreparedUpdateStmt() {
  if (!cachedPreparedUpdateStmt && sqlite) {
    cachedPreparedUpdateStmt = sqlite.prepare(`
      UPDATE uploaded_roms SET
        description = COALESCE(@description, description),
        release_year = COALESCE(@releaseYear, release_year),
        developer = COALESCE(@developer, developer),
        publisher = COALESCE(@publisher, publisher),
        genre = COALESCE(@genre, genre),
        players = COALESCE(@players, players),
        art_url = COALESCE(@artUrl, art_url),
        scrape_status = COALESCE(@scrapeStatus, scrape_status),
        rating = COALESCE(@rating, rating),
        play_count = COALESCE(@playCount, play_count),
        last_played = COALESCE(@lastPlayed, last_played)
      WHERE id = @id
    `);
  }
  return cachedPreparedUpdateStmt;
}

export function registerImportRoutes(app: Express) {
  // ── EmulationStation gamelist.xml import ──────────────────────────────────
  app.post("/api/import/emulationstation", express.raw({ limit: "50mb", type: ["text/xml", "application/xml", "application/octet-stream", "text/plain"] }), async (req, res) => {
    try {
      const xml = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : (typeof req.body === "string" ? req.body : "");
      const gameBlocks = [...xml.matchAll(/<game[^>]*>([\s\S]*?)<\/game>/gi)];
      const roms = await storage.listUploadedRoms();
      const { romsByBaseName, romsByTitle } = buildRomLookupMaps(roms);
      const results: { title: string; updated: boolean; reason?: string }[] = [];
      const stmt = getPreparedUpdateStmt();

      db.transaction((tx: any) => {
        for (const block of gameBlocks) {
          const inner = block[1];
          const get = (tag: string) => {
            const m = inner.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
            return m ? decodeXMLEntities(m[1]) : null;
          };
          const path2 = get("path");
          const name = get("name");
          if (!path2 && !name) continue;

          const baseName = path2 ? path2.split(/[\/\\]/).pop()?.replace(/\..*$/, "").toLowerCase() : null;
          const nameKey = name ? name.toLowerCase() : null;

          let match: UploadedRom | undefined;
          if (baseName) match = romsByBaseName.get(baseName);
          if (!match && nameKey) match = romsByTitle.get(nameKey);

          if (!match) {
            results.push({ title: name ?? path2 ?? "?", updated: false, reason: "no matching ROM" });
            continue;
          }

          const meta: Record<string, any> = {};
          const desc = get("desc");
          const date = get("releasedate");
          const dev = get("developer");
          const pub = get("publisher");
          const genre = get("genre");
          const players = get("players");
          const image = get("image");
          const rating = get("rating");
          const playcount = get("playcount");
          const lastplayed = get("lastplayed");

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
            if (stmt) {
              stmt.run({
                id: match.id,
                description: meta.description ?? null,
                releaseYear: meta.releaseYear ?? null,
                developer: meta.developer ?? null,
                publisher: meta.publisher ?? null,
                genre: meta.genre ?? null,
                players: meta.players ?? null,
                artUrl: meta.artUrl ?? null,
                scrapeStatus: meta.scrapeStatus ?? null,
                rating: meta.rating ?? null,
                playCount: meta.playCount ?? null,
                lastPlayed: meta.lastPlayed ?? null,
              });
            } else {
              tx.update(uploadedRoms).set(meta).where(eq(uploadedRoms.id, match.id)).run();
            }
          }
          results.push({ title: match.title, updated: true });
        }
      });
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
      const { romsByBaseName, romsByTitle } = buildRomLookupMaps(roms);
      const results: { title: string; updated: boolean; reason?: string }[] = [];
      const stmt = getPreparedUpdateStmt();

      db.transaction((tx: any) => {
        for (const block of gameBlocks) {
          const inner = block[1];
          const get = (tag: string) => {
            const m = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
            return m ? decodeXMLEntities(m[1]) : null;
          };

          const title = get("Title");
          const appPath = get("ApplicationPath");
          if (!title && !appPath) continue;

          const baseName = appPath ? appPath.split(/[\/\\]/).pop()?.replace(/\..*$/, "").toLowerCase() : null;
          const titleKey = title ? title.toLowerCase() : null;

          let match: UploadedRom | undefined;
          if (baseName) match = romsByBaseName.get(baseName);
          if (!match && titleKey) match = romsByTitle.get(titleKey);

          if (!match) {
            results.push({ title: title ?? appPath ?? "?", updated: false, reason: "no matching ROM" });
            continue;
          }

          const meta: Record<string, any> = {};
          const overview = get("Notes") ?? get("Overview");
          const releaseDate = get("ReleaseDate");
          const developer = get("Developer");
          const publisher = get("Publisher");
          const genre = get("Genre") ?? get("Genres");
          const maxPlayers = get("MaxPlayers");
          const starRating = get("StarRating");
          const playCount = get("PlayCount");

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
            if (stmt) {
              stmt.run({
                id: match.id,
                description: meta.description ?? null,
                releaseYear: meta.releaseYear ?? null,
                developer: meta.developer ?? null,
                publisher: meta.publisher ?? null,
                genre: meta.genre ?? null,
                players: meta.players ?? null,
                artUrl: meta.artUrl ?? null,
                scrapeStatus: meta.scrapeStatus ?? null,
                rating: meta.rating ?? null,
                playCount: meta.playCount ?? null,
                lastPlayed: meta.lastPlayed ?? null,
              });
            } else {
              tx.update(uploadedRoms).set(meta).where(eq(uploadedRoms.id, match.id)).run();
            }
          }
          results.push({ title: match.title, updated: true });
        }
      });
      res.json({ imported: results.filter((r) => r.updated).length, skipped: results.filter((r) => !r.updated).length, results });
    } catch (err) {
      console.error("[Import] LaunchBox sync error:", err);
      res.status(400).json({ message: String(err) });
    }
  });
}

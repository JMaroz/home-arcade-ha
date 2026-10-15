import { storage } from "./storage";
import { findLibretroBoxArt } from "./routes/scrape";
import { LIBRETRO_PLAYLISTS } from "./routes/shared";
import path from "node:path";

export interface UnifiedGameMetadata {
  title?: string;
  description?: string;
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  genre?: string;
  players?: string;
  artUrl?: string;
  scrapeStatus: "matched" | "failed";
  scrapeMessage?: string;
}

/**
 * Built-in OpenVGDB / Libretro Database metadata lookup table for common retro systems.
 * Provides instant offline metadata for core catalog titles when offline or fallback.
 */
const BUILTIN_METADATA_CATALOG: Record<string, Record<string, {
  year?: number;
  developer?: string;
  publisher?: string;
  genre?: string;
  description?: string;
}>> = {
  nes: {
    "super mario bros": { year: 1985, developer: "Nintendo EAD", publisher: "Nintendo", genre: "Platformer", description: "Guide Mario through the Mushroom Kingdom to rescue Princess Peach from Bowser." },
    "legend of zelda": { year: 1986, developer: "Nintendo EAD", publisher: "Nintendo", genre: "Action-Adventure", description: "Explore the land of Hyrule, gather the Triforce of Wisdom, and save Princess Zelda." },
    "metroid": { year: 1986, developer: "Nintendo R&D1", publisher: "Nintendo", genre: "Action-Platformer", description: "Control bounty hunter Samus Aran as she explores planet Zebes." },
  },
  snes: {
    "super mario world": { year: 1990, developer: "Nintendo EAD", publisher: "Nintendo", genre: "Platformer", description: "Mario and Luigi travel to Dinosaur Land to rescue Princess Toadstool." },
    "super metroid": { year: 1994, developer: "Nintendo R&D1", publisher: "Nintendo", genre: "Action-Adventure", description: "Samus Aran travels to Zebes to retrieve the last Metroid hatchling." },
    "chrono trigger": { year: 1995, developer: "Square", publisher: "Square", genre: "RPG", description: "Time-traveling RPG adventure created by the Dream Team." },
  },
  n64: {
    "super mario 64": { year: 1996, developer: "Nintendo EAD", publisher: "Nintendo", genre: "3D Platformer", description: "Groundbreaking 3D platforming adventure set in Peach's Castle." },
    "legend of zelda ocarina of time": { year: 1998, developer: "Nintendo EAD", publisher: "Nintendo", genre: "Action-Adventure", description: "Journey through time as Link to stop Ganondorf from obtaining the Triforce." },
    "goldeneye 007": { year: 1997, developer: "Rare", publisher: "Nintendo", genre: "First-Person Shooter", description: "Iconic James Bond FPS based on the 1995 film." },
  },
  gb: {
    "pokemon red": { year: 1996, developer: "Game Freak", publisher: "Nintendo", genre: "RPG", description: "Collect, train, and battle 151 Pokemon in the Kanto region." },
    "pokemon blue": { year: 1996, developer: "Game Freak", publisher: "Nintendo", genre: "RPG", description: "Collect, train, and battle 151 Pokemon in the Kanto region." },
  },
  gba: {
    "pokemon emerald": { year: 2004, developer: "Game Freak", publisher: "Nintendo", genre: "RPG", description: "Explore the Hoenn region and stop Team Magma and Team Aqua." },
    "castlevania aria of sorrow": { year: 2003, developer: "Konami", publisher: "Konami", genre: "Metroidvania", description: "Soma Cruz discovers his powers in Dracula's castle in the year 2035." },
  },
  genesis: {
    "sonic the hedgehog": { year: 1991, developer: "Sonic Team", publisher: "Sega", genre: "Platformer", description: "Speed through South Island to free animals from Dr. Robotnik." },
    "sonic the hedgehog 2": { year: 1992, developer: "Sonic Team", publisher: "Sega", genre: "Platformer", description: "Sonic and Tails team up to stop the Death Egg." },
  },
};

function normalizeTitleForCatalog(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch game metadata from Internet Archive Advanced Search / Metadata API.
 */
async function fetchArchiveMetadata(title: string, system: string): Promise<Partial<UnifiedGameMetadata>> {
  try {
    const clean = normalizeTitleForCatalog(title);
    const query = encodeURIComponent(`title:"${clean}" AND mediatype:"software"`);
    const searchUrl = `https://archive.org/advancedsearch.php?q=${query}&fl[]=identifier,title,description,year,creator,publisher,genre&sort[]=downloads+desc&rows=1&output=json`;

    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "HomeArcade/1.0 (+https://github.com/home-arcade-ha)" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return {};
    const data = await res.json();
    const doc = data?.response?.docs?.[0];
    if (!doc) return {};

    const result: Partial<UnifiedGameMetadata> = {};
    if (doc.description) {
      result.description = String(doc.description).replace(/<[^>]+>/g, "").slice(0, 1000).trim();
    }
    if (doc.year) {
      const yr = parseInt(String(doc.year).slice(0, 4), 10);
      if (yr >= 1970 && yr <= 2100) result.releaseYear = yr;
    }
    if (doc.creator) result.developer = String(doc.creator);
    if (doc.publisher) result.publisher = String(doc.publisher);
    if (doc.genre) result.genre = String(doc.genre);

    return result;
  } catch {
    return {};
  }
}

/**
 * Fetch game metadata from RetroAchievements API.
 */
async function fetchRaMetadata(raGameId: number | null): Promise<Partial<UnifiedGameMetadata>> {
  if (!raGameId) return {};

  const settings = await storage.getIntegrationSettings();
  if (!settings.raUsername || !settings.raToken) return {};

  try {
    const url = `https://retroachievements.org/API/API_GetGame.php?z=${settings.raUsername}&y=${settings.raToken}&i=${raGameId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return {};

    const data = await res.json();
    const result: Partial<UnifiedGameMetadata> = {};
    if (data.Description) result.description = data.Description;
    if (data.Developer) result.developer = data.Developer;
    if (data.Publisher) result.publisher = data.Publisher;
    if (data.Genre) result.genre = data.Genre;
    if (data.Released) {
      const year = parseInt(String(data.Released).slice(0, 4), 10);
      if (year >= 1970 && year <= 2100) result.releaseYear = year;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Look up metadata in OpenVGDB / built-in catalog.
 */
function lookupOpenVgdbMetadata(title: string, system: string): Partial<UnifiedGameMetadata> {
  const norm = normalizeTitleForCatalog(title);
  const sysCatalog = BUILTIN_METADATA_CATALOG[system.toLowerCase()];
  if (!sysCatalog) return {};

  for (const [key, meta] of Object.entries(sysCatalog)) {
    if (norm.includes(key) || key.includes(norm)) {
      return {
        releaseYear: meta.year,
        developer: meta.developer,
        publisher: meta.publisher,
        genre: meta.genre,
        description: meta.description,
      };
    }
  }

  return {};
}

/**
 * Unified multi-source metadata & box art fetcher.
 * Respects user's `metadataSource` preference setting:
 * - "auto": Tries Libretro CDN -> Internet Archive -> RetroAchievements -> OpenVGDB
 * - "libretro": Uses Libretro CDN
 * - "archive": Tries Internet Archive Metadata API first
 * - "retroachievements": Tries RetroAchievements API first
 * - "openvgdb": Uses OpenVGDB / Built-in DB first
 */
export async function fetchGameMetadata(
  system: string,
  title: string,
  raGameId?: number | null
): Promise<UnifiedGameMetadata> {
  const settings = await storage.getIntegrationSettings();
  const sourcePreference = settings.metadataSource || "auto";

  const result: UnifiedGameMetadata = {
    scrapeStatus: "matched",
    scrapeMessage: "Metadata retrieved successfully.",
  };

  // 1. Box Art matching
  const artMatch = await findLibretroBoxArt(system, title);
  if (artMatch.url) {
    result.artUrl = artMatch.url;
  }

  // 2. OpenVGDB / Built-in catalog check
  const builtinMeta = lookupOpenVgdbMetadata(title, system);
  Object.assign(result, builtinMeta);

  // 3. Internet Archive / RA / Source preference execution
  if (sourcePreference === "archive" || (sourcePreference === "auto" && !result.description)) {
    const archiveMeta = await fetchArchiveMetadata(title, system);
    if (archiveMeta.description && !result.description) result.description = archiveMeta.description;
    if (archiveMeta.releaseYear && !result.releaseYear) result.releaseYear = archiveMeta.releaseYear;
    if (archiveMeta.developer && !result.developer) result.developer = archiveMeta.developer;
    if (archiveMeta.publisher && !result.publisher) result.publisher = archiveMeta.publisher;
    if (archiveMeta.genre && !result.genre) result.genre = archiveMeta.genre;
  }

  if (sourcePreference === "retroachievements" || (sourcePreference === "auto" && !result.description && raGameId)) {
    const raMeta = await fetchRaMetadata(raGameId ?? null);
    if (raMeta.description && !result.description) result.description = raMeta.description;
    if (raMeta.releaseYear && !result.releaseYear) result.releaseYear = raMeta.releaseYear;
    if (raMeta.developer && !result.developer) result.developer = raMeta.developer;
    if (raMeta.publisher && !result.publisher) result.publisher = raMeta.publisher;
    if (raMeta.genre && !result.genre) result.genre = raMeta.genre;
  }

  if (!result.artUrl && !result.description && !result.releaseYear) {
    result.scrapeStatus = "failed";
    result.scrapeMessage = `No metadata found for "${title}" using source "${sourcePreference}".`;
  }

  return result;
}

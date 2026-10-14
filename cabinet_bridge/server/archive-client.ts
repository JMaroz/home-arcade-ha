import { ROM_EXTENSIONS, LIBRETRO_PLAYLISTS } from "./routes/shared";
import { REQUIRED_BIOS, CORE_PERFORMANCE_TIERS, type PerformanceTier } from "@shared/bios-metadata";
import { dataPath } from "./data-dir";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

export interface ArchiveGameItem {
  id: string;
  fileName: string;
  title: string;
  system: string;
  size: number;
  downloadUrl: string;
  artUrl: string;
  region: string;
  crc32?: string;
  md5?: string;
  format?: string;
}

export interface ArchivePlatformMeta {
  system: string;
  name: string;
  fullSetName: string;
  fullSetSize: number; // in bytes
  fullSetDownloadUrl: string;
  itemIdentifier: string;
  totalGames: number;
  hwTier: PerformanceTier;
  hwBadge: "optimal" | "playable" | "heavy";
  hwNotice?: string;
  biosStatus: "ok" | "missing" | "not_required";
  missingBiosFiles?: string[];
  isFullSetRecommended: boolean;
}

export interface PlatformArchiveConfig {
  name: string;
  archiveZipFile: string;
  fullSetBytes: number;
  identifier: string;
  mirrors?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Verified Repositories (Retro Best, Hearto 1G1R, Tiny Best Set: GO!)
// ─────────────────────────────────────────────────────────────────────────────

export const RETRO_BEST_PLATFORMS: Record<string, PlatformArchiveConfig> = {
  nes: {
    name: "Nintendo Entertainment System",
    archiveZipFile: "Nintendo - NES.zip",
    fullSetBytes: 37_586_409,
    identifier: "retro-roms-best-set",
  },
  snes: {
    name: "Super Nintendo",
    archiveZipFile: "Nintendo - SNES.zip",
    fullSetBytes: 358_430_770,
    identifier: "retro-roms-best-set",
  },
  gb: {
    name: "Game Boy",
    archiveZipFile: "Nintendo - Game Boy.zip",
    fullSetBytes: 17_930_965,
    identifier: "retro-roms-best-set",
  },
  gbc: {
    name: "Game Boy Color",
    archiveZipFile: "Nintendo - Game Boy Color.zip",
    fullSetBytes: 70_119_545,
    identifier: "retro-roms-best-set",
  },
  gba: {
    name: "Game Boy Advance",
    archiveZipFile: "Nintendo - Game Boy Advance.zip",
    fullSetBytes: 755_555_700,
    identifier: "retro-roms-best-set",
  },
  n64: {
    name: "Nintendo 64",
    archiveZipFile: "Nintendo - N64.zip",
    fullSetBytes: 1_542_179_454,
    identifier: "retro-roms-best-set",
  },
  genesis: {
    name: "Sega Genesis / Mega Drive",
    archiveZipFile: "Sega - Genesis.zip",
    fullSetBytes: 126_266_376,
    identifier: "retro-roms-best-set",
  },
  sms: {
    name: "Sega Master System",
    archiveZipFile: "Sega - Master System.zip",
    fullSetBytes: 7_776_753,
    identifier: "retro-roms-best-set",
  },
  gamegear: {
    name: "Sega Game Gear",
    archiveZipFile: "Sega - Game Gear.zip",
    fullSetBytes: 7_776_920,
    identifier: "retro-roms-best-set",
  },
  atari2600: {
    name: "Atari 2600",
    archiveZipFile: "Atari - 2600.zip",
    fullSetBytes: 244_718,
    identifier: "retro-roms-best-set",
  },
  pce: {
    name: "PC Engine / TurboGrafx-16",
    archiveZipFile: "NEC - TurboGrafx-16.zip",
    fullSetBytes: 19_541_713,
    identifier: "retro-roms-best-set",
  },
  nds: {
    name: "Nintendo DS",
    archiveZipFile: "Nintendo - DS.zip",
    fullSetBytes: 5_862_619_752,
    identifier: "retro-roms-best-set",
  },
  arcade: {
    name: "Arcade (Mame 2003 Plus)",
    archiveZipFile: "Arcade - Mame 2003 Plus.zip",
    fullSetBytes: 1_231_249_870,
    identifier: "retro-roms-best-set",
  },
  neogeo: {
    name: "SNK Neo Geo",
    archiveZipFile: "SNK - NEO GEO.zip",
    fullSetBytes: 2_492_129_927,
    identifier: "retro-roms-best-set",
  },
  ps1: {
    name: "Sony PlayStation",
    archiveZipFile: "Sony - PS1 (A-L).zip",
    fullSetBytes: 36_347_206_461,
    identifier: "retro-roms-best-set",
  },
  psp: {
    name: "PlayStation Portable",
    archiveZipFile: "Sony - PSP (A-G).zip",
    fullSetBytes: 27_718_719_571,
    identifier: "retro-roms-best-set",
  },
  dreamcast: {
    name: "Sega Dreamcast",
    archiveZipFile: "Sega - Dreamcast.zip",
    fullSetBytes: 40_768_515_668,
    identifier: "retro-roms-best-set",
  },
  saturn: {
    name: "Sega Saturn",
    archiveZipFile: "Sega - Saturn.zip",
    fullSetBytes: 18_229_042_021,
    identifier: "retro-roms-best-set",
  },
};

export const TINY_BEST_PLATFORMS: Record<string, PlatformArchiveConfig> = {
  nes: { name: "Nintendo Entertainment System", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  snes: { name: "Super Nintendo", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  gb: { name: "Game Boy", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  gbc: { name: "Game Boy Color", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  gba: { name: "Game Boy Advance", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  genesis: { name: "Sega Genesis / Mega Drive", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  arcade: { name: "Arcade", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  neogeo: { name: "SNK Neo Geo", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  pce: { name: "PC Engine / TurboGrafx-16", archiveZipFile: "tiny-best-set-go-games.zip", fullSetBytes: 5_661_993_084, identifier: "tiny-best-set-go" },
  ps1: { name: "Sony PlayStation", archiveZipFile: "tiny-best-set-go-expansion-64-games.zip", fullSetBytes: 50_672_120_295, identifier: "tiny-best-set-go" },
};

export const ARCHIVE_PLATFORMS: Record<string, PlatformArchiveConfig> = {
  nes: {
    name: "Nintendo Entertainment System",
    archiveZipFile: "hearto_1g1r_collection/Nintendo - Nintendo Entertainment System.zip",
    fullSetBytes: 197_132_288, // ~188 MB
    identifier: "hearto-1g1r-collection",
  },
  snes: {
    name: "Super Nintendo",
    archiveZipFile: "hearto_1g1r_collection/Nintendo - Super Nintendo Entertainment System.zip",
    fullSetBytes: 1_823_465_472, // ~1.7 GB
    identifier: "hearto-1g1r-collection",
  },
  gb: {
    name: "Game Boy",
    archiveZipFile: "hearto_1g1r_collection/Nintendo - Game Boy.zip",
    fullSetBytes: 134_217_728, // ~128 MB
    identifier: "hearto-1g1r-collection",
  },
  gbc: {
    name: "Game Boy Color",
    archiveZipFile: "hearto_1g1r_collection/Nintendo - Game Boy Color.zip",
    fullSetBytes: 473_956_352, // ~452 MB
    identifier: "hearto-1g1r-collection",
  },
  gba: {
    name: "Game Boy Advance",
    archiveZipFile: "hearto_1g1r_collection/Nintendo - Game Boy Advance.zip",
    fullSetBytes: 8_092_844_032, // ~7.7 GB
    identifier: "hearto-1g1r-collection",
  },
  genesis: {
    name: "Sega Genesis / Mega Drive",
    archiveZipFile: "hearto_1g1r_collection/Sega - Mega Drive - Genesis.zip",
    fullSetBytes: 774_897_664, // ~739 MB
    identifier: "hearto-1g1r-collection",
  },
  sms: {
    name: "Sega Master System",
    archiveZipFile: "hearto_1g1r_collection/Sega - Master System - Mark III.zip",
    fullSetBytes: 51_380_224, // ~49 MB
    identifier: "hearto-1g1r-collection",
  },
  gamegear: {
    name: "Sega Game Gear",
    archiveZipFile: "hearto_1g1r_collection/Sega - Game Gear.zip",
    fullSetBytes: 68_157_440, // ~65 MB
    identifier: "hearto-1g1r-collection",
  },
  atari2600: {
    name: "Atari 2600",
    archiveZipFile: "hearto_1g1r_collection/Atari - 2600.zip",
    fullSetBytes: 2_621_440, // ~2.5 MB
    identifier: "hearto-1g1r-collection",
  },
  atari7800: {
    name: "Atari 7800",
    archiveZipFile: "hearto_1g1r_collection/Atari - 7800.zip",
    fullSetBytes: 2_267_904, // ~2.1 MB
    identifier: "hearto-1g1r-collection",
  },
  pce: {
    name: "PC Engine / TurboGrafx-16",
    archiveZipFile: "NEC - PC Engine - TurboGrafx 16.zip",
    fullSetBytes: 72_351_744, // ~69 MB
    identifier: "hearto-1g1r-collection",
  },
  n64: {
    name: "Nintendo 64",
    archiveZipFile: "hearto_1g1r_collection/Nintendo - Nintendo 64.zip",
    fullSetBytes: 5_307_039_744, // ~5.0 GB
    identifier: "hearto-1g1r-collection",
  },
  ps1: {
    name: "Sony PlayStation",
    archiveZipFile: "",
    fullSetBytes: 300_000_000_000,
    identifier: "chd_psx",
  },
  ps2: {
    name: "Sony PlayStation 2",
    archiveZipFile: "",
    fullSetBytes: 800_000_000_000,
    identifier: "chd_ps2",
  },
  psp: {
    name: "PlayStation Portable",
    archiveZipFile: "",
    fullSetBytes: 250_000_000_000,
    identifier: "chd_psp",
  },
};

export function resolvePlatformConfig(
  system: string,
  source: string = "retro-best",
  customId?: string
): PlatformArchiveConfig | null {
  if (source === "tiny-best") {
    return TINY_BEST_PLATFORMS[system] || RETRO_BEST_PLATFORMS[system] || ARCHIVE_PLATFORMS[system] || null;
  }
  if (source === "hearto-1g1r" || source === "nointro-curated") {
    return ARCHIVE_PLATFORMS[system] || RETRO_BEST_PLATFORMS[system] || null;
  }
  if (source === "custom") {
    const base = RETRO_BEST_PLATFORMS[system] || ARCHIVE_PLATFORMS[system];
    if (!base) return null;
    return {
      ...base,
      identifier: customId?.trim() || "retro-roms-best-set",
      archiveZipFile: "",
    };
  }
  return RETRO_BEST_PLATFORMS[system] || ARCHIVE_PLATFORMS[system] || null;
}

// Simple in-memory cache with TTL 1 hour
interface CachedCatalog {
  fetchedAt: number;
  games: ArchiveGameItem[];
}
const catalogCache = new Map<string, CachedCatalog>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function cleanGameTitle(rawName: string): { title: string; region: string } {
  const base = rawName.replace(/\.[^.]+$/, "");
  const regionMatch = base.match(/\(([^)]+)\)/);
  const region = regionMatch ? regionMatch[1] : "World";
  const title = base.replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "").trim();
  return { title, region };
}

export function getDeterministicBoxArtUrl(system: string, baseName: string): string {
  const playlist = LIBRETRO_PLAYLISTS[system];
  if (!playlist) return "";
  const clean = baseName.replace(/\.[^.]+$/, "").trim();
  return `https://thumbnails.libretro.com/${encodeURIComponent(playlist)}/Named_Boxarts/${encodeURIComponent(clean)}.png`;
}

export async function checkSystemBiosStatus(system: string): Promise<{
  status: "ok" | "missing" | "not_required";
  missingFiles: string[];
}> {
  const required = REQUIRED_BIOS[system];
  if (!required || required.length === 0) {
    return { status: "not_required", missingFiles: [] };
  }

  const biosDir = path.resolve(dataPath("bios"));
  const missingFiles: string[] = [];

  for (const b of required) {
    const p = path.join(biosDir, b.filename);
    if (!existsSync(p)) {
      missingFiles.push(b.filename);
    }
  }

  return {
    status: missingFiles.length === 0 ? "ok" : "missing",
    missingFiles,
  };
}

export function getSystemHwBadge(system: string): {
  tier: PerformanceTier;
  badge: "optimal" | "playable" | "heavy";
  notice?: string;
} {
  const isArm64 = process.arch === "arm64";
  const tierInfo = CORE_PERFORMANCE_TIERS[system];
  const tier: PerformanceTier = tierInfo ? (isArm64 ? tierInfo.arm64 : tierInfo.x64) : "good";

  if (tier === "excellent" || tier === "good") {
    return { tier, badge: "optimal" };
  }
  if (tier === "playable") {
    return { tier, badge: "playable", notice: isArm64 ? "Consigliato streaming nativo su Raspberry Pi" : undefined };
  }
  return {
    tier,
    badge: "heavy",
    notice: isArm64 ? "Richiede hardware potente o RPi 5 con Native Runner" : undefined,
  };
}

export async function getSystemCatalogMeta(
  system: string,
  source: string = "retro-best",
  customId?: string
): Promise<ArchivePlatformMeta | null> {
  const config = resolvePlatformConfig(system, source, customId);
  if (!config) return null;

  const bios = await checkSystemBiosStatus(system);
  const hw = getSystemHwBadge(system);

  const isFullSetRecommended = Boolean(
    config.archiveZipFile && config.fullSetBytes > 0 && config.fullSetBytes <= 2_500_000_000 // Under 2.5 GB
  );

  return {
    system,
    name: config.name,
    fullSetName: config.archiveZipFile ? path.basename(config.archiveZipFile) : "",
    fullSetSize: config.fullSetBytes,
    fullSetDownloadUrl: config.archiveZipFile
      ? `https://archive.org/download/${config.identifier}/${encodeURIComponent(config.archiveZipFile)}`
      : "",
    itemIdentifier: config.identifier,
    totalGames: 0,
    hwTier: hw.tier,
    hwBadge: hw.badge,
    hwNotice: hw.notice,
    biosStatus: bios.status,
    missingBiosFiles: bios.missingFiles,
    isFullSetRecommended,
  };
}

export async function listAllSystemMetas(
  source: string = "retro-best",
  customId?: string
): Promise<ArchivePlatformMeta[]> {
  const systemMap = source === "tiny-best"
    ? TINY_BEST_PLATFORMS
    : source === "hearto-1g1r"
      ? ARCHIVE_PLATFORMS
      : RETRO_BEST_PLATFORMS;

  const metas: ArchivePlatformMeta[] = [];
  for (const sys of Object.keys(systemMap)) {
    const meta = await getSystemCatalogMeta(sys, source, customId);
    if (meta) metas.push(meta);
  }
  return metas;
}

export function isPlatformFile(
  fileName: string,
  system: string,
  identifier: string,
  allowedExts: Set<string>
): boolean {
  const lower = fileName.toLowerCase();
  const ext = path.extname(lower);

  // Exclude non-game files and auxiliary IA files
  if (
    lower.endsWith("_meta.xml") ||
    lower.endsWith("_files.xml") ||
    lower.endsWith(".torrent") ||
    lower.endsWith("_meta.sqlite") ||
    lower.endsWith("_reviews.xml") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".html") ||
    lower.endsWith(".txt")
  ) {
    return false;
  }

  // If this is a zip pack collection (e.g. retro-roms-best-set or hearto-1g1r-collection)
  if (identifier === "retro-roms-best-set" || identifier === "hearto-1g1r-collection") {
    if (ext !== ".zip" && ext !== ".7z") return false;

    switch (system) {
      case "nes":
        return (/(?:^|[^a-z])nes(?:[^a-z]|$)/.test(lower) || lower.includes("nintendo entertainment system")) && !lower.includes("snes");
      case "snes":
        return /(?:^|[^a-z])snes(?:[^a-z]|$)/.test(lower) || lower.includes("super nintendo");
      case "gb":
        return lower.includes("game boy") && !lower.includes("color") && !lower.includes("advance");
      case "gbc":
        return lower.includes("game boy color");
      case "gba":
        return lower.includes("game boy advance");
      case "n64":
        return /(?:^|[^a-z])n64(?:[^a-z]|$)/.test(lower) || lower.includes("nintendo 64");
      case "genesis":
        return lower.includes("genesis") || lower.includes("mega drive");
      case "sms":
        return lower.includes("master system");
      case "gamegear":
        return lower.includes("game gear");
      case "atari2600":
        return lower.includes("2600");
      case "atari7800":
        return lower.includes("7800");
      case "pce":
        return lower.includes("turbografx") || lower.includes("pc engine");
      case "nds":
        return lower.includes("nintendo - ds") || lower.includes("nintendo ds");
      case "arcade":
        return lower.includes("mame") || lower.includes("arcade");
      case "neogeo":
        return lower.includes("neo geo");
      case "ps1":
        return lower.includes("ps1") || (lower.includes("playstation") && !lower.includes("portable") && !lower.includes("psp"));
      case "psp":
        return lower.includes("psp");
      case "dreamcast":
        return lower.includes("dreamcast");
      case "saturn":
        return lower.includes("saturn");
      default:
        return false;
    }
  }

  if (identifier === "tiny-best-set-go") {
    if (ext === ".zip" || ext === ".7z") {
      if (system === "ps1") {
        return lower.includes("expansion-64") || lower.includes("expansion-128");
      }
      return lower.includes("tiny-best-set-go-games");
    }
    return allowedExts.has(ext);
  }

  // For individual ROM / disc collections (e.g. chd_psx, chd_ps2, custom)
  return allowedExts.has(ext) || ext === ".zip" || ext === ".7z";
}

export async function fetchPlatformGames(
  system: string,
  credentials?: { accessKey?: string; secretKey?: string },
  source: string = "retro-best",
  customId?: string
): Promise<ArchiveGameItem[]> {
  const config = resolvePlatformConfig(system, source, customId);
  if (!config) return [];

  const cacheKey = `${source}:${system}:${config.identifier}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.games;
  }

  const allowedExts = new Set(ROM_EXTENSIONS[system] ?? []);
  const headers: Record<string, string> = {
    "User-Agent": "HomeArcade/1.0 (+https://github.com/home-arcade-ha)",
  };

  if (credentials?.accessKey && credentials?.secretKey) {
    headers["Authorization"] = `LOW ${credentials.accessKey.trim()}:${credentials.secretKey.trim()}`;
  }

  const url = `https://archive.org/metadata/${config.identifier}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`Internet Archive metadata API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawFiles = Array.isArray(data.files) ? data.files : [];
  const games: ArchiveGameItem[] = [];

  for (const file of rawFiles) {
    const fileName = String(file.name ?? "");
    if (!isPlatformFile(fileName, system, config.identifier, allowedExts)) {
      continue;
    }

    const { title, region } = cleanGameTitle(path.basename(fileName));
    const size = typeof file.size === "string" ? parseInt(file.size, 10) : Number(file.size || 0);

    const downloadUrl = `https://archive.org/download/${config.identifier}/${encodeURIComponent(fileName)}`;
    const artUrl = getDeterministicBoxArtUrl(system, fileName);

    games.push({
      id: `${config.identifier}/${fileName}`,
      fileName: path.basename(fileName),
      title,
      system,
      size,
      downloadUrl,
      artUrl,
      region,
      crc32: file.crc32,
      md5: file.md5,
      format: file.format,
    });
  }

  catalogCache.set(cacheKey, { fetchedAt: Date.now(), games });
  return games;
}

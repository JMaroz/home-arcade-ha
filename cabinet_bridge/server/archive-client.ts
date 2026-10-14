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

// ─────────────────────────────────────────────────────────────────────────────
// Default Verified Repositories (1G1R No-Intro / Hearto Collection)
// ─────────────────────────────────────────────────────────────────────────────

export const ARCHIVE_PLATFORMS: Record<string, {
  name: string;
  archiveZipFile: string;
  fullSetBytes: number;
  identifier: string;
  mirrors?: string[];
}> = {
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
    archiveZipFile: "hearto_1g1r_collection/NEC - PC Engine - TurboGrafx 16.zip",
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
    fullSetBytes: 300_000_000_000, // Multi-CD disc sets (only single games recommended)
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

export async function getSystemCatalogMeta(system: string): Promise<ArchivePlatformMeta | null> {
  const config = ARCHIVE_PLATFORMS[system];
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

export async function listAllSystemMetas(): Promise<ArchivePlatformMeta[]> {
  const metas: ArchivePlatformMeta[] = [];
  for (const sys of Object.keys(ARCHIVE_PLATFORMS)) {
    const meta = await getSystemCatalogMeta(sys);
    if (meta) metas.push(meta);
  }
  return metas;
}

export async function fetchPlatformGames(
  system: string,
  credentials?: { accessKey?: string; secretKey?: string }
): Promise<ArchiveGameItem[]> {
  const config = ARCHIVE_PLATFORMS[system];
  if (!config) return [];

  const cacheKey = `${system}:${config.identifier}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.games;
  }

  const allowedExts = new Set(ROM_EXTENSIONS[system] ?? []);
  const headers: Record<string, string> = {
    "User-Agent": "HomeArcade/1.0 (+https://github.com/home-arcade-ha)",
  };

  if (credentials?.accessKey && credentials?.secretKey) {
    headers["Authorization"] = `LOW ${credentials.accessKey}:${credentials.secretKey}`;
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
    const ext = path.extname(fileName).toLowerCase();

    // Check if it's a ROM file directly or part of platform directory
    if (!allowedExts.has(ext) && ext !== ".zip" && ext !== ".7z") continue;

    // Filter out internal metadata or torrent files
    if (fileName.endsWith("_meta.xml") || fileName.endsWith("_files.xml") || fileName.endsWith(".torrent")) {
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

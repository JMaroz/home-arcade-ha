/**
 * scanner.ts
 *
 * Enhanced ROM scanner — v2.1 (Performance Optimized)
 *
 * Polls every 60 seconds. Uses async FS calls and bulk DB inserts
 * to prevent blocking the Node.js event loop during large library scans.
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "node:crypto";

import { slugify, titleFromFileName, extractUploadedSlug } from "./routes/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Lookup tables
// ─────────────────────────────────────────────────────────────────────────────

export const EXT_TO_SYSTEM: Record<string, string> = {
  ".m3u":  "ps1",
  ".nes":  "nes",
  ".smc":  "snes",  ".sfc":  "snes",
  ".md":   "genesis", ".gen": "genesis", ".bin": "genesis",
  ".z64":  "n64",  ".n64":  "n64",  ".v64":  "n64",
  ".gb":   "gb",
  ".gbc":  "gbc",
  ".gba":  "gba",
  ".nds":  "nds",
  ".3ds":  "3ds",
  ".cue":  "ps1",  ".img":  "ps1",  ".chd": "ps1",
  ".iso":  "ps2",
  ".cso":  "psp",  ".pbp":  "psp",
  ".gdi":  "dreamcast", ".cdi": "dreamcast",
  ".zip":  "arcade", ".rom":  "arcade",
  ".7z":   "arcade",
  ".a26":  "atari2600",
  ".a52":  "atari5200",
  ".a78":  "atari7800",
  ".lnx":  "lynx",
  ".pce":  "pce",
  ".ngp":  "ngp",  ".ngc":  "ngp",
  ".ws":   "wonderswan", ".wsc": "wonderswan",
};

export const FOLDER_TO_SYSTEM: Record<string, string> = {
  "nes": "nes", "famicom": "nes",
  "snes": "snes", "supernintendo": "snes",
  "n64": "n64", "nintendo64": "n64",
  "gb": "gb", "gameboy": "gb",
  "gbc": "gbc", "gameboycolor": "gbc",
  "gba": "gba", "gameboyadvance": "gba",
  "nds": "nds", "ds": "nds", "nintendods": "nds",
  "3ds": "3ds", "gamecube": "gamecube", "gc": "gamecube", "wii": "wii",
  "ps1": "ps1", "psx": "ps1", "playstation": "ps1",
  "ps2": "ps2", "playstation2": "ps2", "psp": "psp", "playstationportable": "psp",
  "genesis": "genesis", "megadrive": "genesis",
  "mastersystem": "sms", "sms": "sms",
  "gamegear": "gamegear", "gg": "gamegear",
  "32x": "sega32x", "sega32x": "sega32x",
  "segacd": "segacd", "megacd": "segacd",
  "saturn": "saturn", "dreamcast": "dreamcast", "dc": "dreamcast",
  "atari2600": "atari2600", "2600": "atari2600",
  "atari5200": "atari5200", "5200": "atari5200",
  "atari7800": "atari7800", "7800": "atari7800",
  "lynx": "lynx", "neogeo": "neogeo", "neo": "neogeo",
  "ngp": "ngp", "neogeopocket": "ngp",
  "arcade": "arcade", "mame": "arcade", "fba": "arcade", "fbneo": "arcade",
  "pcengine": "pce", "tg16": "pce", "turbografx": "pce", "pce": "pce",
  "wonderswan": "wonderswan", "ws": "wonderswan",
  "c64": "c64", "commodore64": "c64", "amiga": "amiga", "dos": "dos",
  "pc88": "pc88", "scummvm": "scummvm",
};

const ROM_EXTENSIONS = new Set(Object.keys(EXT_TO_SYSTEM));
const MAX_DEPTH = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScannerStatus {
  enabled: boolean;
  watchDir: string | null;
  watchPaths: string[];
  lastScanAt: number | null;
  lastScanFound: number;
  totalScanned: number;
  watching: boolean;
  error: string | null;
  pathStats: Record<string, { found: number; imported: number; lastScanAt: number | null; error: string | null }>;
}

export type ScannerEvent =
  | { type: "start"; watchPaths: string[] }
  | { type: "discover"; path: string; found: number }
  | { type: "processing"; current: number; total: number; fileName: string; system: string }
  | { type: "imported"; fileName: string; system: string; title: string; romHash: string }
  | { type: "pruned"; id: number; title: string; path: string }
  | { type: "complete"; totalFound: number; totalImported: number; totalPruned: number; durationMs: number }
  | { type: "error"; message: string };

export type ScannerEventListener = (event: ScannerEvent) => void;

export type AddRomsBulkFn = (roms: any[]) => Promise<void>;
export type ListFilenamesFn = () => Promise<string[]>;
export type GetNasPathsFn = () => Promise<string[]>;
export type ListWatchRomsFn = () => Promise<Array<{ id: number; title: string; filePath: string; fileName: string; romHash?: string | null }>>;
export type DeleteRomFn = (id: number) => Promise<boolean>;
export type UpdateRomHashFn = (id: number, hash: string) => Promise<void>;

/** Compute MD5 hash using standard streaming pipeline (optional maxBytes for large files) */
export async function computeFileHash(filePath: string, maxBytes?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fsSync.createReadStream(filePath, {
      highWaterMark: 1024 * 1024,
      end: maxBytes ? maxBytes - 1 : undefined,
    });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

// ponytail: scanner de-prioritizzato a safety net passivo; la scoperta e download primari sono gestiti da archive-downloader
const POLL_INTERVAL_MS = 3_600_000; // 1 hour passive background check to avoid I/O thrashing 

let _addRomsBulk: AddRomsBulkFn | null = null;
let _listFilenames: ListFilenamesFn | null = null;
let _getNasPaths: GetNasPathsFn | null = null;
let _listWatchRoms: ListWatchRomsFn | null = null;
let _deleteRom: DeleteRomFn | null = null;
let _updateRomHash: UpdateRomHashFn | null = null;
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _envPaths: string[] = [];
let _isScanning = false;

const _eventListeners = new Set<ScannerEventListener>();

export function subscribeScannerEvents(listener: ScannerEventListener): () => void {
  _eventListeners.add(listener);
  return () => {
    _eventListeners.delete(listener);
  };
}

function emitEvent(event: ScannerEvent): void {
  for (const listener of _eventListeners) {
    try {
      listener(event);
    } catch (err) {
      console.warn("[Scanner] Event listener threw error:", err);
    }
  }
}

let _status: ScannerStatus = {
  enabled:       false,
  watchDir:      null,
  watchPaths:    [],
  lastScanAt:    null,
  lastScanFound: 0,
  totalScanned:  0,
  watching:      false,
  error:         null,
  pathStats:     {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normaliseFolder(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inferSystem(filePath: string, rootPath: string): string {
  const relative = path.relative(rootPath, filePath);
  const parts = relative.split(path.sep);
  for (let i = parts.length - 2; i >= 0; i--) {
    const key = normaliseFolder(parts[i]);
    if (FOLDER_TO_SYSTEM[key]) return FOLDER_TO_SYSTEM[key];
  }
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_SYSTEM[ext] ?? "arcade";
}

/** Async recursive ROM collection */
async function collectRomFilesAsync(dir: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await collectRomFilesAsync(fullPath, depth + 1)));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ROM_EXTENSIONS.has(ext)) results.push(fullPath);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Scanner] Unable to read directory ${dir}: ${msg}`);
  }
  return results;
}

async function scanPath(
  rootPath: string,
  existingNames: Set<string>,
): Promise<any[]> {
  const newRoms: any[] = [];
  
  if (!fsSync.existsSync(rootPath)) {
    _status.pathStats[rootPath] = { found: 0, imported: 0, lastScanAt: Date.now(), error: `Path not found: ${rootPath}` };
    return newRoms;
  }

  console.log(`[Scanner] Scanning ${rootPath}`);
  const romFiles = await collectRomFilesAsync(rootPath);
  emitEvent({ type: "discover", path: rootPath, found: romFiles.length });

  let fileIndex = 0;
  for (const filePath of romFiles) {
    fileIndex++;
    const fileName = path.basename(filePath);
    if (existingNames.has(fileName)) continue;

    const ext      = path.extname(fileName).toLowerCase();
    const system   = inferSystem(filePath, rootPath);
    const baseName = path.basename(fileName, ext);
    const title    = baseName.replace(/[_\-.]+/g, " ").trim();
    const slug =
      baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
      + "-" + Date.now().toString(36)
      + Math.random().toString(36).slice(2, 5);

    let isPlaylist = false;
    let m3uContent: string | null = null;
    let discNumber: number | null = null;
    let discGroup: string | null = null;

    emitEvent({
      type: "processing",
      current: fileIndex,
      total: romFiles.length,
      fileName,
      system,
    });

    if (ext === ".m3u") {
      isPlaylist = true;
      try {
        const raw = await fs.readFile(filePath, "utf8");
        m3uContent = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      } catch { /* ignore */ }

      // Skip orphaned .m3u files whose referenced disc files do not exist in the directory
      const refs = (m3uContent ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      const m3uDir = path.dirname(filePath);
      const siblingFiles = romFiles
        .filter((f) => path.dirname(f) === m3uDir && path.extname(f).toLowerCase() !== ".m3u")
        .map((f) => path.basename(f));

      const hasMatchingDisc = refs.some((ref) => {
        const refBase = path.basename(ref).toLowerCase();
        const targetSlug = slugify(titleFromFileName(ref));
        return siblingFiles.some(
          (sf) =>
            sf.toLowerCase() === refBase ||
            (targetSlug && extractUploadedSlug(sf, system) === targetSlug)
        );
      });

      if (!hasMatchingDisc) {
        console.log(`[Scanner] Skipping orphaned M3U playlist with missing disc files: ${fileName}`);
        continue;
      }
    } else {
      const discMatch = title.match(/\s*[\(\[](?:disc|disk|cd)\s*(\d+)[\)\]]|\s+(?:disc|disk|cd)\s*(\d+)/i);
      discNumber = discMatch ? parseInt(discMatch[1] ?? discMatch[2], 10) : null;
      if (discMatch) {
        const cleanTitle = title.replace(discMatch[0], "").trim();
        discGroup = `${system}/${slugify(cleanTitle)}`;
      }
    }

    try {
      const stat = await fs.stat(filePath);
      const romHash = stat.size > 32 * 1024 * 1024
        ? await computeFileHash(filePath, 2 * 1024 * 1024).catch(() => null)
        : await computeFileHash(filePath).catch(() => null);

      newRoms.push({
        title, system, slug,
        originalName: fileName,
        fileName,
        filePath,
        size: stat.size,
        mimeType: "application/octet-stream",
        isPlaylist,
        m3uContent,
        discNumber,
        discGroup,
        romHash,
        createdAt: Date.now(),
      });
      existingNames.add(fileName);

      emitEvent({
        type: "imported",
        fileName,
        system,
        title,
        romHash: romHash ?? "",
      });
    } catch {
      // skip individual errors
    }
  }

  _status.pathStats[rootPath] = { found: romFiles.length, imported: newRoms.length, lastScanAt: Date.now(), error: null };
  console.log(`[Scanner] ${rootPath}: ${romFiles.length} ROM file(s), ${newRoms.length} new import(s).`);
  return newRoms;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scan loop
// ─────────────────────────────────────────────────────────────────────────────

let _activeScanPromise: Promise<void> | null = null;

async function doScan(): Promise<void> {
  if (_activeScanPromise) {
    return _activeScanPromise;
  }
  if (!_addRomsBulk || !_listFilenames) return;

  _activeScanPromise = (async () => {
    _isScanning = true;
    const startTime = Date.now();

    try {
      const nasPaths = _getNasPaths ? (await _getNasPaths().catch(() => [])) : [];
      const allPaths = Array.from(new Set([..._envPaths, ...nasPaths].filter(Boolean)));

      if (allPaths.length === 0) {
        _status.watchPaths = [];
        _status.watchDir = null;
        emitEvent({
          type: "complete",
          totalFound: 0,
          totalImported: 0,
          totalPruned: 0,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      console.log(`[Scanner] Watch paths: ${allPaths.join(", ")}`);
      _status.watchPaths = allPaths;
      _status.watchDir   = allPaths.join(", ");
      _status.enabled    = true;
      _status.watching   = true;

      emitEvent({ type: "start", watchPaths: allPaths });

      // ── Auto-reconciliation of deleted / moved files ─────────────────────────
      let totalPruned = 0;
      if (_listWatchRoms && _deleteRom) {
        try {
          const existingRoms = await _listWatchRoms();
          for (const r of existingRoms) {
            const isWatched = allPaths.some((wp) => {
              const resolvedWp = path.resolve(wp);
              const resolvedFp = path.resolve(r.filePath);
              return resolvedFp === resolvedWp || resolvedFp.startsWith(resolvedWp + path.sep);
            });
            if (isWatched && !fsSync.existsSync(r.filePath)) {
              console.log(`[Scanner] Reconciliation: pruned missing file ${r.title} (${r.filePath})`);
              await _deleteRom(r.id);
              totalPruned++;
              emitEvent({ type: "pruned", id: r.id, title: r.title, path: r.filePath });
            } else if (isWatched && _updateRomHash && !r.romHash && fsSync.existsSync(r.filePath)) {
              // Backfill hash if missing
              try {
                const s = fsSync.statSync(r.filePath);
                const h = s.size > 32 * 1024 * 1024
                  ? await computeFileHash(r.filePath, 2 * 1024 * 1024)
                  : await computeFileHash(r.filePath);
                await _updateRomHash(r.id, h);
              } catch { /* ignore */ }
            }
          }
        } catch (recErr) {
          console.warn("[Scanner] Reconciliation check warning:", recErr);
        }
      }

      const existingNames = new Set(await _listFilenames());
      let allNewRoms: any[] = [];
      let totalDiscovered = 0;

      for (const p of allPaths) {
        const newRoms = await scanPath(p, existingNames);
        totalDiscovered += (_status.pathStats[p]?.found ?? 0);
        allNewRoms.push(...newRoms);
      }

      if (allNewRoms.length > 0) {
        console.log(`[Scanner] Found ${allNewRoms.length} new ROM(s). Inserting...`);
        await _addRomsBulk(allNewRoms);
        console.log(`[Scanner] Successfully imported ${allNewRoms.length} games.`);
      }

      _status.lastScanAt    = Date.now();
      _status.lastScanFound = allNewRoms.length;
      _status.totalScanned += allNewRoms.length;
      _status.error         = null;

      emitEvent({
        type: "complete",
        totalFound: totalDiscovered,
        totalImported: allNewRoms.length,
        totalPruned,
        durationMs: Date.now() - startTime,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      _status.error = msg;
      emitEvent({ type: "error", message: msg });
      console.error("[Scanner] scan error:", msg);
    } finally {
      _isScanning = false;
      _activeScanPromise = null;
    }
  })();

  return _activeScanPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function initScanner(
  watchDir: string,
  addRomsBulk: AddRomsBulkFn,
  listFilenames: ListFilenamesFn,
  getNasPaths?: GetNasPathsFn,
  listWatchRoms?: ListWatchRomsFn,
  deleteRom?: DeleteRomFn,
  updateRomHash?: UpdateRomHashFn,
  autoStart = true,
): () => Promise<void> {
  _addRomsBulk   = addRomsBulk;
  _listFilenames = listFilenames;
  _getNasPaths   = getNasPaths ?? null;
  _listWatchRoms = listWatchRoms ?? null;
  _deleteRom     = deleteRom ?? null;
  _updateRomHash = updateRomHash ?? null;

  _envPaths = watchDir.split(",").map((p) => p.trim()).filter(Boolean);

  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(doScan, POLL_INTERVAL_MS);

  if (autoStart) {
    // Background the initial scan so boot isn't blocked
    void doScan();
  }
  return doScan;
}

export function stopScanner(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

export function refreshNasPaths(getNasPaths: GetNasPathsFn): void {
  _getNasPaths = getNasPaths;
}

export async function scanNow(onEvent?: ScannerEventListener): Promise<ScannerStatus> {
  if (onEvent) {
    const unsub = subscribeScannerEvents(onEvent);
    try {
      await doScan();
    } finally {
      unsub();
    }
  } else {
    await doScan();
  }
  return getStatus();
}

export function getStatus(): ScannerStatus {
  return { ..._status, pathStats: { ..._status.pathStats } };
}

export interface DetectedFolder {
  folderName: string;
  fullPath: string;
  platformId: string | null;
  detectionMethod: "exact" | "alias" | "manual" | null;
  fileCount: number;
  sampleFiles: string[];
}

export function detectPlatformFolders(rootPath: string): DetectedFolder[] {
  const results: DetectedFolder[] = [];
  try {
    const topLevel = fsSync.readdirSync(rootPath, { withFileTypes: true });
    for (const entry of topLevel) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(rootPath, entry.name);
      const key = normaliseFolder(entry.name);
      const platformId = FOLDER_TO_SYSTEM[key] ?? null;

      let files: string[] = [];
      try {
        files = fsSync.readdirSync(folderPath)
          .filter((f) => ROM_EXTENSIONS.has(path.extname(f).toLowerCase()));
      } catch { /* skip */ }

      results.push({
        folderName: entry.name,
        fullPath: folderPath,
        platformId,
        detectionMethod: platformId ? (FOLDER_TO_SYSTEM[entry.name.toLowerCase()] ? "exact" : "alias") : null,
        fileCount: files.length,
        sampleFiles: files.slice(0, 5),
      });
    }
  } catch { /* ignore */ }
  return results;
}

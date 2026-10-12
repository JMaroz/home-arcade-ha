import path from "node:path";
import zlib from "node:zlib";
import fs from "node:fs";
import { ROM_EXTENSIONS } from "./shared";
import { FOLDER_TO_SYSTEM } from "../scanner";


/**
 * Minimal ZIP extractor using Node built-in zlib.
 * Returns { buffer, fileName } for the first entry whose extension is in
 * allowedExtensions, or null when no matching entry is found.
 */
export async function extractFirstRomFromZip(
  zipBuffer: Buffer,
  allowedExtensions: string[],
): Promise<{ buffer: Buffer; fileName: string } | null> {
  let offset = 0;
  while (offset + 30 < zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize    = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength    = zipBuffer.readUInt16LE(offset + 26);
    const extraLength       = zipBuffer.readUInt16LE(offset + 28);
    const fileName          = zipBuffer.subarray(offset + 30, offset + 30 + fileNameLength).toString("utf8");
    const dataStart         = offset + 30 + fileNameLength + extraLength;
    const dataEnd           = dataStart + compressedSize;

    const ext = path.extname(fileName).toLowerCase();
    if (allowedExtensions.includes(ext) && !fileName.startsWith("__MACOSX")) {
      const compressed = zipBuffer.subarray(dataStart, dataEnd);
      try {
        const buffer =
          compressionMethod === 0
            ? compressed
            : await new Promise<Buffer>((resolve, reject) => {
                zlib.inflateRaw(compressed, (err, result) => {
                  err ? reject(err) : resolve(result);
                });
              });
        return { buffer, fileName: path.basename(fileName) };
      } catch {
        // corrupt entry — try next
      }
    }
    offset = dataEnd;
  }
  return null;
}

export function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function titleFromFileName(fileName: string) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/\s*\([A-Z][a-zA-Z,\s]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*\((Rev|v|Beta|Proto|Demo|Sample|Hack|Alt|Unl)[^)]*\)/gi, "")
    .replace(/\s*\(Dis[ck][^)]*\)/gi, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "rom"
  );
}

/**
 * Extracts the slug portion from an uploaded ROM filename of the form
 * `<system>_<slug>_<7..10-char-base36>.<ext>` (e.g. `ps1_ape_escape_mqwatvdb.chd` -> `ape_escape`),
 * or falls back to `slugify(titleFromFileName(fileName))`.
 */
export function extractUploadedSlug(fileName: string, system?: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  const re = system
    ? new RegExp(`^${system.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(.+)_[a-z0-9]{7,10}$`, "i")
    : /^[a-z0-9]+_(.+)_[a-z0-9]{7,10}$/i;
  const match = base.match(re);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return slugify(titleFromFileName(fileName));
}

export function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function significantTokens(value: string) {
  const noise = new Set([
    "u", "usa", "us", "eng", "snes", "sfc", "smc", "rev", "version",
  ]);
  const roman: Record<string, string> = {
    i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
  };
  const rawTokens = value.split(/\s+/).filter(Boolean);
  return rawTokens
    .filter((token, index, tokens) => {
      if (noise.has(token)) return false;
      if (token === "v" && /^\d+$/.test(tokens[index + 1] ?? "")) return false;
      if (/^\d+$/.test(token) && tokens[index - 1] === "v") return false;
      return true;
    })
    .map((token) => roman[token] ?? token);
}

export function normalizeSearchTitle(value: string) {
  return significantTokens(normalizeTitle(value)).join(" ");
}

export function numberTokens(tokens: string[]) {
  return tokens.filter((token) => /^\d+$/.test(token));
}

// ── Content-type auto-detection for upload ─────────────────────────────────

const EXT_TO_SYSTEMS: Record<string, string[]> = buildExtToSystems();

function buildExtToSystems(): Record<string, string[]> {
  // Invert ROM_EXTENSIONS (system → ext[]) to ext → system[],
  // then merge with additional systems from scanner that aren't in the client.
  const map: Record<string, Set<string>> = {};
  for (const [sys, exts] of Object.entries(ROM_EXTENSIONS)) {
    for (const ext of exts) {
      if (!map[ext]) map[ext] = new Set();
      map[ext].add(sys);
    }
  }
  // Additional systems from scanner that aren't in ROM_EXTENSIONS
  const extra: Record<string, string> = {
    ".3ds": "3ds",  ".a26": "atari2600",  ".a52": "atari5200",
    ".lnx": "lynx", ".ngp": "ngp",  ".ngc": "ngp",
    ".ws": "wonderswan",  ".wsc": "wonderswan",
    ".pce": "pcengine",
  };
  for (const [ext, sys] of Object.entries(extra)) {
    if (!map[ext]) map[ext] = new Set();
    map[ext].add(sys);
  }
  // Manual additions for M3U: disc-based systems not yet in ROM_EXTENSIONS
  if (map[".m3u"]) {
    map[".m3u"].add("saturn");
    map[".m3u"].add("segacd");
    map[".m3u"].add("pce");
  }
  const result: Record<string, string[]> = {};
  for (const [ext, sysSet] of Object.entries(map)) {
    result[ext] = [...sysSet];
  }
  return result;
}

/**
 * Peek inside a ZIP buffer to read the filename of the first entry.
 * Returns null if the buffer isn't a valid ZIP or has no entries.
 */
function firstZipEntryName(buf: Buffer): string | null {
  if (buf.length < 30) return null;
  const sig = buf.readUInt32LE(0);
  if (sig !== 0x04034b50) return null;
  const fileNameLength = buf.readUInt16LE(26);
  const extraLength    = buf.readUInt16LE(28);
  const nameStart = 30;
  const nameEnd   = nameStart + fileNameLength;
  if (nameEnd > buf.length) return null;
  return buf.subarray(nameStart, nameEnd).toString("utf8");
}

/**
 * Detect the most likely system(s) for a given ROM file.
 *
 * @param fileName   Original file name (with extension).
 * @param magicBytes First 64 KB of the file content.
 * @param folderName Optional folder name (for webkitdirectory context).
 * @returns          Sorted candidate system IDs and a confidence level.
 */
export function detectSystemFromContent(
  fileName: string,
  magicBytes: Buffer,
  folderName?: string,
): { candidates: string[]; confidence: "high" | "medium" | "low" } {
  const ext = path.extname(fileName).toLowerCase();
  let candidates = EXT_TO_SYSTEMS[ext] ?? [];

  // ── Magic-byte disambiguation for ambiguous extensions ──────────────
  if (ext === ".bin") {
    const hasSega = magicBytes.length > 0x100 &&
      magicBytes.slice(0x100, 0x104).toString("ascii") === "SEGA";
    const hasCd001 = magicBytes.includes("CD001");

    if (hasSega) {
      candidates = candidates.filter((s) =>
        ["genesis", "segacd", "sega32x", "mastersystem"].includes(s)
      );
    } else if (hasCd001) {
      candidates = ["ps1"];
    } else {
      // PS1 audio .bin tracks start with CD sync pattern (00 FF FF FF FF FF FF 00)
      // or contain raw 16-bit PCM data. No reliable magic byte check.
      // Since PS1 audio bins are far more common in upload scenarios than
      // Genesis .bin ROMs, prefer ps1 when ambiguous.
      const firstByte = magicBytes[0];
      if (firstByte === 0x00) {
        // CD audio sector sync → almost certainly PS1
        candidates = ["ps1"];
      } else {
        // Still ambiguous — prefer ps1 over genesis for upload use-case
        candidates = ["ps1", ...candidates.filter((c) => c !== "ps1")];
      }
    }
  }

  if (ext === ".iso") {
    // Primary volume descriptor at LBA 16 (offset 0x8000) → "CD001"
    const ps1Match = magicBytes.includes("CD001") ||
      (magicBytes.length > 0x8001 &&
       magicBytes.slice(0x8001, 0x8006).toString("ascii") === "CD001");
    if (ps1Match) {
      candidates = ["ps1"];
    }
    // PS2 ISOs sometimes have "PLAYSTATION" or "PlayStation2" near offset 0
    const ps2Match = magicBytes.includes("PlayStation2") ||
      magicBytes.includes("PS2");
    if (ps2Match && !candidates.includes("ps2")) {
      candidates.push("ps2");
    }
    if (candidates.length > 1) {
      // Keep multiple ISO candidates but deduplicate
      candidates = [...new Set(candidates)];
    }
  }

  if (ext === ".chd") {
    // CHD header starts with "MComprHD"
    const isChd = magicBytes.slice(0, 8).toString("ascii") === "MComprHD";
    if (!isChd) candidates = [];
  }

  if (ext === ".m3u") {
    // Peek at first non-empty line to detect the referenced file's extension
    const content = magicBytes.toString("utf8").split("\n").map(l => l.trim()).find(l => l.length > 0 && !l.startsWith("#"));
    if (content) {
      const refExt = path.extname(content).toLowerCase();
      const refCands = EXT_TO_SYSTEMS[refExt];
      if (refCands && refCands.length > 0) {
        candidates = refCands;
      }
    }
  }

  if (ext === ".zip" || ext === ".7z") {
    if (ext === ".zip" && magicBytes.readUInt32LE(0) === 0x04034b50) {
      const innerName = firstZipEntryName(magicBytes);
      if (innerName) {
        const innerExt = path.extname(innerName).toLowerCase();
        const innerCands = EXT_TO_SYSTEMS[innerExt] ?? [];
        if (innerCands.length > 0) {
          candidates = innerCands;
        }
      }
    }
    // If inner extension doesn't narrow it (e.g. nested .zip),
    // keep the broad list from extension table.
  }

  // ── Folder name bonus ──────────────────────────────────────────────
  if (folderName && candidates.length > 1) {
    const normalizedFolder = folderName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const folderMatch = FOLDER_TO_SYSTEM[normalizedFolder];
    if (folderMatch && candidates.includes(folderMatch)) {
      // Boost — move to front
      candidates = [folderMatch, ...candidates.filter((c) => c !== folderMatch)];
    }
  }

  // ── Confidence ─────────────────────────────────────────────────────
  let confidence: "high" | "medium" | "low" = "low";
  if (candidates.length === 1) confidence = "high";
  else if (candidates.length <= 3) confidence = "medium";
  else confidence = "low";

  return { candidates, confidence };
}

export function getAbsoluteFilePath(
  rom: { filePath: string; system: string; fileName: string },
  watchPaths: string[]
): string {
  const directPath = path.resolve(rom.filePath);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const normalisedPath = rom.filePath.replace(/\\/g, "/");
  const sysSegment = `/${rom.system.toLowerCase()}/`;
  const sysIdx = normalisedPath.toLowerCase().indexOf(sysSegment);
  
  if (sysIdx !== -1) {
    const relativePath = normalisedPath.slice(sysIdx + 1);
    for (const wp of watchPaths) {
      const localPath = path.resolve(wp, relativePath);
      if (fs.existsSync(localPath)) {
        return localPath;
      }
    }
  }
  
  return directPath;
}



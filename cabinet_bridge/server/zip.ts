import zlib from "node:zlib";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import child_process from "node:child_process";
import { pipeline } from "node:stream/promises";

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export interface ExtractedArchiveItem {
  name: string;
  filePath: string;
  size: number;
}

export interface ExtractArchiveOptions {
  flatten?: boolean;
  onProgress?: (current: number, total: number, entryName: string) => void;
}

export interface CentralDirectoryEntry {
  name: string;
  size: number;
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

type ArchiverBinary = "7zz" | "7z" | "unzip" | "none";
let _detectedArchiver: ArchiverBinary | null = null;

export function getSystemArchiver(): ArchiverBinary {
  if (_detectedArchiver !== null) return _detectedArchiver;

  for (const bin of ["7zz", "7z", "unzip"] as const) {
    try {
      const res = child_process.spawnSync(bin, ["--help"], { stdio: "ignore" });
      if (!res.error) {
        _detectedArchiver = bin;
        return bin;
      }
    } catch {}
  }

  _detectedArchiver = "none";
  return "none";
}

export function _setSystemArchiverForTest(tool: ArchiverBinary | null) {
  _detectedArchiver = tool;
}

/**
 * Creates a standard PKZip buffer from an array of file entries.
 * Uses native node:zlib deflateRaw and CRC32 without external dependencies.
 */
export async function createZip(entries: ZipEntry[]): Promise<Buffer> {
  const parts: Buffer[] = [];
  const centralDirHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const uncompressedData = entry.data;
    const crc = (zlib as any).crc32 ? (zlib as any).crc32(uncompressedData) : 0;

    const compressedData = await new Promise<Buffer>((resolve, reject) => {
      zlib.deflateRaw(uncompressedData, (err, result) => (err ? reject(err) : resolve(result)));
    });

    // Local file header (30 bytes + nameBuf.length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);          // version needed
    localHeader.writeUInt16LE(0, 6);           // flags
    localHeader.writeUInt16LE(8, 8);           // compression: deflate
    localHeader.writeUInt16LE(0, 10);          // mod time
    localHeader.writeUInt16LE(0, 12);          // mod date
    localHeader.writeUInt32LE(crc, 14);        // crc32
    localHeader.writeUInt32LE(compressedData.length, 18); // compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28);          // extra field length

    parts.push(localHeader, nameBuf, compressedData);

    // Central directory file header (46 bytes + nameBuf.length)
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);    // signature
    cdHeader.writeUInt16LE(20, 4);             // version made by
    cdHeader.writeUInt16LE(20, 6);             // version needed
    cdHeader.writeUInt16LE(0, 8);              // flags
    cdHeader.writeUInt16LE(8, 10);             // compression: deflate
    cdHeader.writeUInt16LE(0, 12);             // mod time
    cdHeader.writeUInt16LE(0, 14);             // mod date
    cdHeader.writeUInt32LE(crc, 16);           // crc32
    cdHeader.writeUInt32LE(compressedData.length, 20); // compressed size
    cdHeader.writeUInt32LE(uncompressedData.length, 24); // uncompressed size
    cdHeader.writeUInt16LE(nameBuf.length, 28); // name length
    cdHeader.writeUInt16LE(0, 30);             // extra length
    cdHeader.writeUInt16LE(0, 32);             // comment length
    cdHeader.writeUInt16LE(0, 34);             // disk number start
    cdHeader.writeUInt16LE(0, 36);             // internal attrs
    cdHeader.writeUInt32LE(0, 38);             // external attrs
    cdHeader.writeUInt32LE(offset, 42);        // local header relative offset

    centralDirHeaders.push(cdHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressedData.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const h of centralDirHeaders) {
    cdSize += h.length;
    parts.push(h);
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // signature
  eocd.writeUInt16LE(0, 4);                   // disk number
  eocd.writeUInt16LE(0, 6);                   // cd start disk
  eocd.writeUInt16LE(entries.length, 8);      // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);     // total entries
  eocd.writeUInt32LE(cdSize, 12);             // central dir size
  eocd.writeUInt32LE(cdStart, 16);            // central dir offset
  eocd.writeUInt16LE(0, 20);                  // comment length
  parts.push(eocd);

  return Buffer.concat(parts);
}

/**
 * Extracts entries from a ZIP buffer safely, preventing path traversal / zip-slip.
 * Supports progress callback for archives.
 * Note: For large archives (> 2GB), use extractZipArchive() to stream directly to disk.
 */
export async function extractZip(
  zipBuffer: Buffer,
  onProgress?: (current: number, total: number, entryName: string) => void
): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let offset = 0;

  // First pass: scan headers to determine total entries count
  let totalEntries = 0;
  let scanOffset = 0;
  while (scanOffset + 30 <= zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(scanOffset);
    if (sig !== 0x04034b50) break;
    const compressedSize = zipBuffer.readUInt32LE(scanOffset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(scanOffset + 26);
    const extraLength = zipBuffer.readUInt16LE(scanOffset + 28);
    scanOffset += 30 + fileNameLength + extraLength + compressedSize;
    totalEntries++;
  }

  let processedCount = 0;
  while (offset + 30 <= zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // End of local files / start of central dir

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraLength = zipBuffer.readUInt16LE(offset + 28);
    const rawFileName = zipBuffer.subarray(offset + 30, offset + 30 + fileNameLength).toString("utf8");
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length) break;

    // Sanitize file name & guard against Zip Slip
    const normalized = path.normalize(rawFileName.replace(/\\/g, "/")).replace(/^(\.\.(\/|\\|$))+/, "");
    if (
      !normalized.startsWith("__MACOSX") &&
      !normalized.includes("..") &&
      !path.isAbsolute(normalized) &&
      !normalized.endsWith("/")
    ) {
      const compressed = zipBuffer.subarray(dataStart, dataEnd);
      let data: Buffer;
      if (compressionMethod === 0) {
        data = Buffer.from(compressed);
      } else if (compressionMethod === 8) {
        data = await new Promise<Buffer>((resolve, reject) => {
          zlib.inflateRaw(compressed, (err, result) => (err ? reject(err) : resolve(result)));
        });
      } else {
        // unsupported compression, skip
        offset = dataEnd;
        continue;
      }
      entries.push({ name: normalized, data });
    }

    processedCount++;
    if (onProgress && totalEntries > 0) {
      onProgress(processedCount, totalEntries, normalized);
    }

    offset = dataEnd;
  }

  return entries;
}

/**
 * Reads End of Central Directory (EOCD) with ZIP64 support without loading the file into memory.
 */
async function parseEOCD(
  fh: fs.FileHandle,
  fileSize: number
): Promise<{ cdEntries: number; cdSize: number; cdOffset: number }> {
  const readSize = Math.min(fileSize, 65536 + 22);
  const buf = Buffer.alloc(readSize);
  await fh.read(buf, 0, readSize, fileSize - readSize);

  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP archive: End of Central Directory (EOCD) not found");
  }

  let cdEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdSize = Number(buf.readUInt32LE(eocdOffset + 12));
  let cdOffset = Number(buf.readUInt32LE(eocdOffset + 16));

  // Check for ZIP64 EOCD Locator immediately preceding EOCD (20 bytes)
  const locatorPos = eocdOffset - 20;
  if (locatorPos >= 0 && buf.readUInt32LE(locatorPos) === 0x07064b50) {
    const zip64EOCDOffset = Number(buf.readBigUInt64LE(locatorPos + 8));
    const zip64Buf = Buffer.alloc(56);
    await fh.read(zip64Buf, 0, 56, zip64EOCDOffset);
    if (zip64Buf.readUInt32LE(0) === 0x06064b50) {
      cdEntries = Number(zip64Buf.readBigUInt64LE(32));
      cdSize = Number(zip64Buf.readBigUInt64LE(40));
      cdOffset = Number(zip64Buf.readBigUInt64LE(48));
    }
  }

  return { cdEntries, cdSize, cdOffset };
}

/**
 * Lists all file entries in a ZIP archive by reading its Central Directory (supports ZIP64).
 * Memory footprint: only the Central Directory bytes (typically a few KB to a few MB).
 */
export async function listZipArchive(archivePath: string): Promise<CentralDirectoryEntry[]> {
  const fh = await fs.open(archivePath, "r");
  try {
    const stat = await fh.stat();
    const { cdSize, cdOffset } = await parseEOCD(fh, stat.size);

    const cdBuf = Buffer.alloc(cdSize);
    await fh.read(cdBuf, 0, cdSize, cdOffset);

    const entries: CentralDirectoryEntry[] = [];
    let pos = 0;

    while (pos + 46 <= cdBuf.length) {
      if (cdBuf.readUInt32LE(pos) !== 0x02014b50) break;

      const compressionMethod = cdBuf.readUInt16LE(pos + 10);
      let compressedSize = Number(cdBuf.readUInt32LE(pos + 20));
      let uncompressedSize = Number(cdBuf.readUInt32LE(pos + 24));
      const nameLen = cdBuf.readUInt16LE(pos + 28);
      const extraLen = cdBuf.readUInt16LE(pos + 30);
      const commentLen = cdBuf.readUInt16LE(pos + 32);
      let localHeaderOffset = Number(cdBuf.readUInt32LE(pos + 42));

      const rawName = cdBuf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
      const extraStart = pos + 46 + nameLen;
      const extraEnd = extraStart + extraLen;

      // Parse ZIP64 extra field (Header ID 0x0001)
      let extraPos = extraStart;
      while (extraPos + 4 <= extraEnd) {
        const headerId = cdBuf.readUInt16LE(extraPos);
        const dataSize = cdBuf.readUInt16LE(extraPos + 2);
        if (headerId === 0x0001) {
          let fieldPos = extraPos + 4;
          if (uncompressedSize === 0xFFFFFFFF && fieldPos + 8 <= extraEnd) {
            uncompressedSize = Number(cdBuf.readBigUInt64LE(fieldPos));
            fieldPos += 8;
          }
          if (compressedSize === 0xFFFFFFFF && fieldPos + 8 <= extraEnd) {
            compressedSize = Number(cdBuf.readBigUInt64LE(fieldPos));
            fieldPos += 8;
          }
          if (localHeaderOffset === 0xFFFFFFFF && fieldPos + 8 <= extraEnd) {
            localHeaderOffset = Number(cdBuf.readBigUInt64LE(fieldPos));
            fieldPos += 8;
          }
        }
        extraPos += 4 + dataSize;
      }

      pos = extraEnd + commentLen;

      const normalized = path.normalize(rawName.replace(/\\/g, "/")).replace(/^(\.\.(\/|\\|$))+/, "");
      if (
        !normalized.endsWith("/") &&
        !normalized.startsWith("__MACOSX") &&
        !path.basename(normalized).startsWith(".") &&
        !normalized.includes("..") &&
        !path.isAbsolute(normalized)
      ) {
        entries.push({
          name: normalized,
          size: uncompressedSize,
          compressedSize,
          compressionMethod,
          localHeaderOffset,
        });
      }
    }

    return entries;
  } finally {
    await fh.close();
  }
}

/**
 * Pure Node.js streaming ZIP extractor fallback (supports ZIP64).
 * Streams directly from disk to disk via zlib.createInflateRaw().
 */
async function extractWithNodeStream(
  archivePath: string,
  destDir: string,
  entries: CentralDirectoryEntry[],
  flatten: boolean,
  onProgress?: (current: number, total: number, entryName: string) => void
): Promise<void> {
  const fh = await fs.open(archivePath, "r");
  try {
    let index = 0;
    for (const entry of entries) {
      index++;
      onProgress?.(index, entries.length, entry.name);
      const finalName = flatten ? path.basename(entry.name) : entry.name;
      const targetPath = path.resolve(destDir, finalName);
      if (!targetPath.startsWith(path.resolve(destDir))) {
        continue; // Zip Slip protection
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Read 30-byte local file header to find exact data offset
      const localHdr = Buffer.alloc(30);
      await fh.read(localHdr, 0, 30, entry.localHeaderOffset);
      if (localHdr.readUInt32LE(0) !== 0x04034b50) {
        continue;
      }

      const localNameLen = localHdr.readUInt16LE(26);
      const localExtraLen = localHdr.readUInt16LE(28);
      const dataStart = entry.localHeaderOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + entry.compressedSize;

      const readStream = fsSync.createReadStream(archivePath, {
        start: dataStart,
        end: dataEnd - 1,
      });
      const writeStream = fsSync.createWriteStream(targetPath);

      if (entry.compressionMethod === 0) {
        await pipeline(readStream, writeStream);
      } else if (entry.compressionMethod === 8) {
        await pipeline(readStream, zlib.createInflateRaw(), writeStream);
      }
    }
  } finally {
    await fh.close();
  }
}

async function extractWith7z(
  bin: "7zz" | "7z",
  archivePath: string,
  destDir: string,
  flatten: boolean
): Promise<void> {
  const cmd = flatten ? "e" : "x";
  const args = [
    cmd,
    "-y",
    "-aoa",
    `-o${destDir}`,
    archivePath,
    "-xr!__MACOSX",
    "-xr!.*",
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = child_process.spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve();
      } else {
        reject(new Error(`${bin} failed with exit code ${code}: ${stderr.slice(0, 300)}`));
      }
    });
  });
}

async function extractWithUnzip(
  archivePath: string,
  destDir: string,
  flatten: boolean
): Promise<void> {
  const args = ["-o", "-q"];
  if (flatten) {
    args.push("-j");
  }
  args.push(archivePath, "-d", destDir, "-x", "__MACOSX*", "*/.*");

  await new Promise<void>((resolve, reject) => {
    const proc = child_process.spawn("unzip", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve();
      } else {
        reject(new Error(`unzip failed with exit code ${code}: ${stderr.slice(0, 300)}`));
      }
    });
  });
}

/**
 * Extracts a ZIP archive on disk directly to a destination directory.
 * - Supports arbitrary file sizes (> 2GB, > 4GB, 50GB+) with zero memory buffering.
 * - Prefers native system archivers (7zz, 7z, unzip) for C-speed multi-threaded extraction.
 * - Falls back to pure Node.js stdlib streaming decompression when CLI archivers are absent.
 */
export async function extractZipArchive(
  archivePath: string,
  destDir: string,
  options?: ExtractArchiveOptions
): Promise<ExtractedArchiveItem[]> {
  await fs.mkdir(destDir, { recursive: true });
  const flatten = options?.flatten ?? true;

  // 1. Read central directory to determine items in the archive
  const entries = await listZipArchive(archivePath);
  if (entries.length === 0) {
    return [];
  }

  // 2. Extract using system CLI or pure Node.js streaming fallback
  const tool = getSystemArchiver();
  let extractedViaCli = false;

  if (tool === "7zz" || tool === "7z") {
    try {
      await extractWith7z(tool, archivePath, destDir, flatten);
      extractedViaCli = true;
    } catch (err: any) {
      console.warn(`[ZIP] ${tool} CLI failed, falling back to Node stream:`, err?.message);
    }
  } else if (tool === "unzip") {
    try {
      await extractWithUnzip(archivePath, destDir, flatten);
      extractedViaCli = true;
    } catch (err: any) {
      console.warn(`[ZIP] unzip CLI failed, falling back to Node stream:`, err?.message);
    }
  }

  if (!extractedViaCli) {
    await extractWithNodeStream(archivePath, destDir, entries, flatten, options?.onProgress);
  }

  // 3. Inspect target files on disk and return valid extracted items
  const items: ExtractedArchiveItem[] = [];
  let inspectIndex = 0;
  for (const entry of entries) {
    inspectIndex++;
    if (extractedViaCli) {
      options?.onProgress?.(inspectIndex, entries.length, entry.name);
    }
    const finalName = flatten ? path.basename(entry.name) : entry.name;
    const targetPath = path.resolve(destDir, finalName);
    try {
      const s = await fs.stat(targetPath);
      if (s.isFile()) {
        items.push({
          name: entry.name,
          filePath: targetPath,
          size: s.size,
        });
      }
    } catch {
      // Entry was skipped or filtered out
    }
  }

  return items;
}

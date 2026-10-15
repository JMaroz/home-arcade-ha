import zlib from "node:zlib";
import path from "node:path";

export interface ZipEntry {
  name: string;
  data: Buffer;
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
 * Supports progress callback for large archives.
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

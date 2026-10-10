import zlib from "node:zlib";

export interface ExtractedFile {
  name: string;
  data: Buffer;
}

/**
 * Extracts files from a ZIP buffer using pure Node.js stdlib (node:zlib).
 * Works for standard DEFLATE (method 8) and STORED (method 0) entries.
 */
export function extractZipBuffer(zipBuffer: Buffer): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  let offset = 0;

  while (offset + 30 <= zipBuffer.length) {
    const signature = zipBuffer.readUInt32LE(offset);
    // 0x04034b50 -> Local file header signature ("PK\x03\x04")
    if (signature !== 0x04034b50) {
      break;
    }

    const method = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
    const filenameLen = zipBuffer.readUInt16LE(offset + 26);
    const extraLen = zipBuffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const nameEnd = nameStart + filenameLen;
    if (nameEnd > zipBuffer.length) break;

    const filename = zipBuffer.toString("utf8", nameStart, nameEnd);
    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length) break;

    // Skip directories
    if (!filename.endsWith("/")) {
      const compressedData = zipBuffer.subarray(dataStart, dataEnd);
      let extractedData: Buffer;

      if (method === 0) {
        // Stored (no compression)
        extractedData = Buffer.from(compressedData);
      } else if (method === 8) {
        // Deflate
        extractedData = zlib.inflateRawSync(compressedData);
      } else {
        throw new Error(`Unsupported compression method in ZIP: ${method}`);
      }

      files.push({ name: filename, data: extractedData });
    }

    // Move to next entry: header + filename + extra + compressed data
    offset = dataEnd;
  }

  return files;
}

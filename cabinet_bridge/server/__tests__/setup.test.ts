import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { extractZipBuffer } from "../utils/zip";
import { getLibretroBuildbotUrl, ESSENTIAL_NATIVE_CORES } from "../../shared/core-metadata";
import { checkSetupStatus } from "../routes/setup";

describe("Native Core Metadata & Buildbot URLs", () => {
  it("should have valid essential native cores defined", () => {
    expect(ESSENTIAL_NATIVE_CORES.length).toBeGreaterThanOrEqual(8);
    const n64 = ESSENTIAL_NATIVE_CORES.find(c => c.id === "parallel_n64");
    expect(n64).toBeDefined();
    expect(n64?.name).toBe("parallel_n64_libretro.so");
    expect(n64?.archive).toBe("parallel_n64_libretro.so.zip");
  });

  it("should construct valid Libretro buildbot URLs for aarch64 and x86_64", () => {
    const armUrl = getLibretroBuildbotUrl("aarch64", "parallel_n64_libretro.so.zip");
    expect(armUrl).toBe("https://buildbot.libretro.com/nightly/linux/aarch64/latest/parallel_n64_libretro.so.zip");

    const x64Url = getLibretroBuildbotUrl("x86_64", "pcsx_rearmed_libretro.so.zip");
    expect(x64Url).toBe("https://buildbot.libretro.com/nightly/linux/x86_64/latest/pcsx_rearmed_libretro.so.zip");
  });
});

describe("Pure Node.js ZIP Extraction Utility", () => {
  it("should extract DEFLATE compressed files from a valid ZIP buffer", () => {
    const filename = "test_core_libretro.so";
    const content = Buffer.from("MAGIC_LIBRETRO_ELF_BINARY_DATA_FOR_TESTING");
    const compressed = zlib.deflateRawSync(content);

    // Build standard PKZip local file header
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // Signature PK\x03\x04
    header.writeUInt16LE(20, 4);         // Version needed
    header.writeUInt16LE(0, 6);          // Flags
    header.writeUInt16LE(8, 8);          // Method 8 = Deflate
    header.writeUInt16LE(0, 10);         // Mod time
    header.writeUInt16LE(0, 12);         // Mod date
    header.writeUInt32LE(0x12345678, 14);// CRC32 dummy
    header.writeUInt32LE(compressed.length, 18); // Compressed size
    header.writeUInt32LE(content.length, 22);    // Uncompressed size
    header.writeUInt16LE(filename.length, 26);   // Filename length
    header.writeUInt16LE(0, 28);                 // Extra field length

    const zipBuffer = Buffer.concat([header, Buffer.from(filename, "utf8"), compressed]);

    const extracted = extractZipBuffer(zipBuffer);
    expect(extracted.length).toBe(1);
    expect(extracted[0].name).toBe(filename);
    expect(extracted[0].data.toString("utf8")).toBe(content.toString("utf8"));
  });

  it("should extract STORED (uncompressed) files from a valid ZIP buffer", () => {
    const filename = "uncompressed.txt";
    const content = Buffer.from("PLAIN_TEXT_UNCOMPRESSED_DATA");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8); // Method 0 = Stored
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(filename.length, 26);
    header.writeUInt16LE(0, 28);

    const zipBuffer = Buffer.concat([header, Buffer.from(filename, "utf8"), content]);

    const extracted = extractZipBuffer(zipBuffer);
    expect(extracted.length).toBe(1);
    expect(extracted[0].name).toBe(filename);
    expect(extracted[0].data.toString("utf8")).toBe(content.toString("utf8"));
  });
});

describe("Setup Status Service", () => {
  it("should return detailed setup status including cores and bios", async () => {
    const status = await checkSetupStatus();
    expect(status).toBeDefined();
    expect(typeof status.isComplete).toBe("boolean");
    expect(["aarch64", "x86_64"]).toContain(status.arch);
    expect(Array.isArray(status.cores)).toBe(true);
    expect(Array.isArray(status.bios)).toBe(true);
    expect(status.cores.length).toBe(ESSENTIAL_NATIVE_CORES.length);
    expect(Array.isArray(status.watchPaths)).toBe(true);
    expect(Array.isArray(status.suggestedLocations)).toBe(true);
    expect(status.suggestedLocations.length).toBeGreaterThanOrEqual(3);
    const sambaLoc = status.suggestedLocations.find((l: any) => l.id === "samba");
    expect(sambaLoc).toBeDefined();
    expect(sambaLoc?.path).toBe("/share/roms");
  });
});

describe("Native Streaming & Runner Manager", () => {
  it("should map supported gaming systems to valid Libretro cores", async () => {
    const { SYSTEM_TO_NATIVE_CORE } = await import("../../shared/core-metadata");
    expect(SYSTEM_TO_NATIVE_CORE["n64"]).toBe("parallel_n64_libretro.so");
    expect(SYSTEM_TO_NATIVE_CORE["ps1"]).toBe("pcsx_rearmed_libretro.so");
    expect(SYSTEM_TO_NATIVE_CORE["snes"]).toBe("snes9x_libretro.so");
    expect(SYSTEM_TO_NATIVE_CORE["genesis"]).toBe("genesis_plus_gx_libretro.so");
    expect(SYSTEM_TO_NATIVE_CORE["arcade"]).toBe("fbneo_libretro.so");
  });

  it("should reject startSession when ROM does not exist", async () => {
    const { StreamRunnerManager } = await import("../stream/runner-manager");
    await expect(StreamRunnerManager.startSession(999999)).rejects.toThrow("ROM with ID 999999 not found");
  });
});

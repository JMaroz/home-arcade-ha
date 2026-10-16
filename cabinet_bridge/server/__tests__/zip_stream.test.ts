import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createZip,
  extractZipArchive,
  listZipArchive,
  _setSystemArchiverForTest,
  getSystemArchiver,
} from "../zip";

describe("Disk-to-Disk Large ZIP Stream & Decompression", () => {
  let tempDir: string;
  let zipPath: string;
  let destDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zip-stream-test-"));
    zipPath = path.join(tempDir, "test-archive.zip");
    destDir = path.join(tempDir, "extracted");
    await fs.mkdir(destDir, { recursive: true });
    // Reset archiver detection between tests
    _setSystemArchiverForTest(null);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
    _setSystemArchiverForTest(null);
  });

  it("lists entries from archive central directory without reading file into memory", async () => {
    const file1 = Buffer.from("CRASH_BANDICOOT_PS1_ISO_DATA");
    const file2 = Buffer.from("SPYRO_THE_DRAGON_PS1_ISO_DATA");

    const zipBuf = await createZip([
      { name: "games/crash.chd", data: file1 },
      { name: "games/spyro.chd", data: file2 },
    ]);
    await fs.writeFile(zipPath, zipBuf);

    const entries = await listZipArchive(zipPath);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name).sort()).toEqual(["games/crash.chd", "games/spyro.chd"]);
    expect(entries.find((e) => e.name === "games/crash.chd")?.size).toBe(file1.length);
    expect(entries.find((e) => e.name === "games/spyro.chd")?.size).toBe(file2.length);
  });

  it("extracts and flattens files directly to destination directory using available system archiver", async () => {
    const fileA = Buffer.from("ROM_DATA_A_".repeat(200));
    const fileB = Buffer.from("ROM_DATA_B_".repeat(500));

    const zipBuf = await createZip([
      { name: "folder1/gameA.rom", data: fileA },
      { name: "folder2/sub/gameB.rom", data: fileB },
    ]);
    await fs.writeFile(zipPath, zipBuf);

    const extracted = await extractZipArchive(zipPath, destDir, { flatten: true });
    expect(extracted).toHaveLength(2);

    const destA = path.join(destDir, "gameA.rom");
    const destB = path.join(destDir, "gameB.rom");

    expect(fsSync.existsSync(destA)).toBe(true);
    expect(fsSync.existsSync(destB)).toBe(true);

    const contentA = await fs.readFile(destA);
    const contentB = await fs.readFile(destB);

    expect(contentA.equals(fileA)).toBe(true);
    expect(contentB.equals(fileB)).toBe(true);
  });

  it("extracts files using pure Node.js stdlib streaming fallback when no CLI tool is used", async () => {
    // Force pure Node.js streaming fallback
    _setSystemArchiverForTest("none");
    expect(getSystemArchiver()).toBe("none");

    const payload1 = Buffer.from("SUPER_MARIO_WORLD_SNES_ROM_BINARY_DATA".repeat(150));
    const payload2 = Buffer.from("CHRONO_TRIGGER_SNES_ROM_BINARY_DATA".repeat(300));

    const zipBuf = await createZip([
      { name: "snes/mario.sfc", data: payload1 },
      { name: "snes/chrono.sfc", data: payload2 },
    ]);
    await fs.writeFile(zipPath, zipBuf);

    const extracted = await extractZipArchive(zipPath, destDir, { flatten: true });
    expect(extracted).toHaveLength(2);

    const out1 = path.join(destDir, "mario.sfc");
    const out2 = path.join(destDir, "chrono.sfc");

    expect(fsSync.existsSync(out1)).toBe(true);
    expect(fsSync.existsSync(out2)).toBe(true);

    expect(await fs.readFile(out1)).toEqual(payload1);
    expect(await fs.readFile(out2)).toEqual(payload2);
  });

  it("protects against Zip Slip traversal and avoids writing outside destination directory", async () => {
    _setSystemArchiverForTest("none");

    const legitimate = Buffer.from("LEGITIMATE_ROM_DATA");
    const malicious = Buffer.from("MALICIOUS_ROOT_OVERWRITE");

    const zipBuf = await createZip([
      { name: "../../outside.txt", data: malicious },
      { name: "safe_game.rom", data: legitimate },
    ]);
    await fs.writeFile(zipPath, zipBuf);

    const extracted = await extractZipArchive(zipPath, destDir, { flatten: true });

    // The malicious file must NOT escape destDir
    const escapedFile = path.resolve(destDir, "../../outside.txt");
    expect(fsSync.existsSync(escapedFile)).toBe(false);

    // The safe game must exist
    const safeFile = path.join(destDir, "safe_game.rom");
    expect(fsSync.existsSync(safeFile)).toBe(true);
    expect(await fs.readFile(safeFile)).toEqual(legitimate);
  });
});

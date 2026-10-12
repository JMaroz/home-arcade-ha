import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  computeFileHash,
  initScanner,
  stopScanner,
  scanNow,
  subscribeScannerEvents,
  detectPlatformFolders,
  type ScannerEvent,
} from "../scanner";

let testDir: string;

describe("Scanner Module — Advanced Hashing, SSE Events & Reconciliation", () => {
  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join("/tmp", "scanner-test-"));
  });

  afterEach(() => {
    stopScanner();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("computeFileHash returns correct MD5 digest for a file", async () => {
    const filePath = path.join(testDir, "test-rom.bin");
    const content = Buffer.from("super-mario-world-data-test-12345");
    fs.writeFileSync(filePath, content);

    const expectedHash = crypto.createHash("md5").update(content).digest("hex");
    const hash = await computeFileHash(filePath);

    expect(hash).toBe(expectedHash);
  });

  it("scanNow computes romHash, imports new ROMs, and streams real-time events", async () => {
    const snesDir = path.join(testDir, "snes");
    fs.mkdirSync(snesDir, { recursive: true });

    const romPath = path.join(snesDir, "Chrono Trigger.sfc");
    fs.writeFileSync(romPath, Buffer.from("dummy-snes-rom-data"));

    const importedRoms: any[] = [];
    const events: ScannerEvent[] = [];

    initScanner(
      testDir,
      async (roms) => {
        importedRoms.push(...roms);
      },
      async () => [],
      undefined,
      undefined,
      undefined,
      undefined,
      false // autoStart = false
    );

    await scanNow((evt) => {
      events.push(evt);
    });

    // Verify imported ROM data
    expect(importedRoms.length).toBe(1);
    expect(importedRoms[0].system).toBe("snes");
    expect(importedRoms[0].title).toBe("Chrono Trigger");
    expect(importedRoms[0].romHash).toBeTruthy();
    expect(importedRoms[0].romHash).toBe(crypto.createHash("md5").update(Buffer.from("dummy-snes-rom-data")).digest("hex"));

    // Verify events were streamed
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("start");
    expect(eventTypes).toContain("discover");
    expect(eventTypes).toContain("processing");
    expect(eventTypes).toContain("imported");
    expect(eventTypes).toContain("complete");
  });

  it("scanNow auto-reconciles and prunes files deleted from disk", async () => {
    const snesDir = path.join(testDir, "snes");
    fs.mkdirSync(snesDir, { recursive: true });

    const romPath = path.join(snesDir, "Deleted Game.sfc");
    fs.writeFileSync(romPath, Buffer.from("to-be-deleted"));

    const deletedIds: number[] = [];
    const events: ScannerEvent[] = [];

    // Simulate that the DB currently has a ROM at this path
    const mockDbRoms = [
      { id: 42, title: "Deleted Game", filePath: romPath, fileName: "Deleted Game.sfc", romHash: "abc" },
    ];

    initScanner(
      testDir,
      async () => {},
      async () => ["Deleted Game.sfc"],
      undefined,
      async () => mockDbRoms,
      async (id) => {
        deletedIds.push(id);
        return true;
      },
      undefined,
      false // autoStart = false
    );

    // Now delete the file on disk before scan
    fs.unlinkSync(romPath);

    await scanNow((evt) => {
      events.push(evt);
    });

    // Reconciliation should have identified that the file is gone
    expect(deletedIds).toContain(42);
    const prunedEvents = events.filter((e) => e.type === "pruned");
    expect(prunedEvents.length).toBe(1);
    if (prunedEvents[0].type === "pruned") {
      expect(prunedEvents[0].id).toBe(42);
      expect(prunedEvents[0].title).toBe("Deleted Game");
    }
  });

  it("detectPlatformFolders identifies platform folders with sample files", () => {
    const gbaDir = path.join(testDir, "gba");
    fs.mkdirSync(gbaDir, { recursive: true });
    fs.writeFileSync(path.join(gbaDir, "pokemon.gba"), "dummy");

    const folders = detectPlatformFolders(testDir);
    expect(folders.length).toBe(1);
    expect(folders[0].folderName).toBe("gba");
    expect(folders[0].platformId).toBe("gba");
    expect(folders[0].fileCount).toBe(1);
  });

  it("scanNow imports M3U matching slug-renamed CHD and skips orphaned M3U with missing disc files", async () => {
    const ps1Dir = path.join(testDir, "ps1");
    fs.mkdirSync(ps1Dir, { recursive: true });

    // Slug-renamed CHD on disk
    fs.writeFileSync(path.join(ps1Dir, "ps1_ape_escape_mqwatvdb.chd"), "chd-data");
    // Valid M3U referencing original No-Intro filename (with CRLF)
    fs.writeFileSync(path.join(ps1Dir, "Ape Escape (USA).m3u"), "Ape Escape (USA).chd\r\n");
    // Orphaned M3U referencing a non-existent CHD
    fs.writeFileSync(path.join(ps1Dir, "Missing Game (USA).m3u"), "Missing Game (USA).chd\r\n");

    const importedRoms: any[] = [];
    initScanner(
      testDir,
      async (roms) => {
        importedRoms.push(...roms);
      },
      async () => [],
      undefined,
      undefined,
      undefined,
      undefined,
      false
    );

    await scanNow();

    const importedNames = importedRoms.map((r) => r.fileName);
    expect(importedNames).toContain("ps1_ape_escape_mqwatvdb.chd");
    expect(importedNames).toContain("Ape Escape (USA).m3u");
    expect(importedNames).not.toContain("Missing Game (USA).m3u");

    const validM3u = importedRoms.find((r) => r.fileName === "Ape Escape (USA).m3u");
    expect(validM3u?.m3uContent).not.toContain("\r");
  });
});


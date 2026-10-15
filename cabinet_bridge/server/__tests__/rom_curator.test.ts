import { describe, it, expect, beforeEach, vi } from "vitest";
import { analyzeLibraryCuration, executeDeduplication } from "../rom-curator";
import { storage } from "../storage";

vi.mock("../storage", () => ({
  storage: {
    getIntegrationSettings: vi.fn().mockResolvedValue({ language: "it", archiveSource: "retro-best" }),
    listUploadedRoms: vi.fn().mockResolvedValue([
      {
        id: 1,
        title: "Super Mario 64 (USA)",
        system: "n64",
        originalName: "Super Mario 64 (USA).z64",
        filePath: "/roms/n64/Super Mario 64 (USA).z64",
        size: 8388608,
        favorite: false,
        playCount: 0,
        isPlaylist: false,
      },
      {
        id: 2,
        title: "Super Mario 64 (Europe) (En,Fr,De,It)",
        system: "n64",
        originalName: "Super Mario 64 (Europe) (En,Fr,De,It).z64",
        filePath: "/roms/n64/Super Mario 64 (Europe) (En,Fr,De,It).z64",
        size: 8388608,
        favorite: true,
        playCount: 5,
        isPlaylist: false,
      },
      {
        id: 3,
        title: "Super Mario 64 (Japan)",
        system: "n64",
        originalName: "Super Mario 64 (Japan).z64",
        filePath: "/roms/n64/Super Mario 64 (Japan).z64",
        size: 8388608,
        favorite: false,
        playCount: 0,
        isPlaylist: false,
      },
    ]),
    getUploadedRom: vi.fn().mockImplementation((id: number) => {
      if (id === 1) return Promise.resolve({ id: 1, title: "Super Mario 64 (USA)", filePath: "/roms/n64/Super Mario 64 (USA).z64", size: 8388608 });
      if (id === 3) return Promise.resolve({ id: 3, title: "Super Mario 64 (Japan)", filePath: "/roms/n64/Super Mario 64 (Japan).z64", size: 8388608 });
      return Promise.resolve(null);
    }),
    deleteUploadedRom: vi.fn().mockResolvedValue(true),
  },
}));

describe("ROM Curator Utility", () => {
  it("detects duplicate groups and recommends preferred language/region ROM", async () => {
    const report = await analyzeLibraryCuration();

    expect(report.scannedRomsCount).toBe(3);
    expect(report.duplicateGroupCount).toBe(1);
    expect(report.redundantRomsCount).toBe(2);
    expect(report.userLanguage).toBe("it");

    const group = report.duplicateGroups[0];
    expect(group.system).toBe("n64");
    // Europe version includes Italian & is favorited, so recommendedRomId should be 2
    expect(group.recommendedRomId).toBe(2);
    expect(group.redundantRomIds).toContain(1);
    expect(group.redundantRomIds).toContain(3);
  });

  it("executes deduplication and removes redundant entries", async () => {
    const result = await executeDeduplication();
    expect(result.deletedCount).toBe(2);
    expect(result.freedBytes).toBe(8388608 * 2);
  });
});

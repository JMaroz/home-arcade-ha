import { describe, it, expect } from "vitest";
import { getDownloadRefetchInterval } from "@/components/GlobalDownloadBanner";

describe("getDownloadRefetchInterval", () => {
  it("returns 1500 when active download jobs exist", () => {
    const jobsWithDownloading = [
      { id: "1", system: "snes", title: "Game", fileName: "game.zip", status: "downloading" as const, progress: 10, downloadedBytes: 100, totalBytes: 1000, speedBytesPerSec: 50 },
    ];
    expect(getDownloadRefetchInterval(jobsWithDownloading)).toBe(1500);

    const jobsWithExtracting = [
      { id: "2", system: "ps1", title: "Game 2", fileName: "game2.zip", status: "extracting" as const, progress: 80, downloadedBytes: 1000, totalBytes: 1000, speedBytesPerSec: 0 },
    ];
    expect(getDownloadRefetchInterval(jobsWithExtracting)).toBe(1500);

    const jobsWithPending = [
      { id: "3", system: "gba", title: "Game 3", fileName: "game3.zip", status: "pending" as const, progress: 0, downloadedBytes: 0, totalBytes: 500, speedBytesPerSec: 0 },
    ];
    expect(getDownloadRefetchInterval(jobsWithPending)).toBe(1500);

    const jobsWithIndexing = [
      { id: "4", system: "n64", title: "Game 4", fileName: "game4.zip", status: "indexing" as const, progress: 100, downloadedBytes: 500, totalBytes: 500, speedBytesPerSec: 0 },
    ];
    expect(getDownloadRefetchInterval(jobsWithIndexing)).toBe(1500);
  });

  it("returns false when jobs list is empty or undefined", () => {
    expect(getDownloadRefetchInterval([])).toBe(false);
    expect(getDownloadRefetchInterval(undefined)).toBe(false);
  });

  it("returns false when all jobs are terminal (completed, error, cancelled)", () => {
    const terminalJobs = [
      { id: "1", system: "snes", title: "Game 1", fileName: "game1.zip", status: "completed" as const, progress: 100, downloadedBytes: 1000, totalBytes: 1000, speedBytesPerSec: 0 },
      { id: "2", system: "snes", title: "Game 2", fileName: "game2.zip", status: "error" as const, progress: 50, downloadedBytes: 500, totalBytes: 1000, speedBytesPerSec: 0 },
      { id: "3", system: "snes", title: "Game 3", fileName: "game3.zip", status: "cancelled" as const, progress: 20, downloadedBytes: 200, totalBytes: 1000, speedBytesPerSec: 0 },
    ];
    expect(getDownloadRefetchInterval(terminalJobs)).toBe(false);
  });
});

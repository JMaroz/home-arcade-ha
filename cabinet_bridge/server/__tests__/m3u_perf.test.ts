import { describe, it, expect, beforeEach } from "vitest";
import { storage, db } from "../storage";
import { uploadedRoms } from "@shared/schema";
import { sql } from "drizzle-orm";

describe("generateM3uForAllDiscGroups Performance & Correctness", () => {
  beforeEach(async () => {
    // Clear uploaded_roms table before test
    db.delete(uploadedRoms).run();
  });

  it("benchmark generateM3uForAllDiscGroups on 200 disc groups", async () => {
    const NUM_GROUPS = 200;
    const DISCS_PER_GROUP = 3;

    // Seed database in a single transaction for speed
    db.transaction((tx: any) => {
      for (let i = 0; i < NUM_GROUPS; i++) {
        const discGroup = `disc_group_perf_${i}`;
        const title = `Final Fantasy ${i}`;
        const system = "ps1";

        for (let d = 1; d <= DISCS_PER_GROUP; d++) {
          const discNumber = d;
          const slug = `ps1_ff_${i}_d${d}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
          const originalName = `${title} (Disc ${d}).chd`;
          const fileName = `${slug}.chd`;

          tx.insert(uploadedRoms).values({
            title,
            system,
            slug,
            originalName,
            fileName,
            filePath: `/share/roms/${system}/${fileName}`,
            size: 1024,
            mimeType: "application/octet-stream",
            isPlaylist: false,
            discNumber,
            discGroup,
            parentM3uId: null,
            createdAt: Date.now(),
          }).run();
        }
      }
    });

    const initialCount = await storage.countUploadedRoms(false);
    expect(initialCount).toBe(NUM_GROUPS * DISCS_PER_GROUP);

    const startTime = performance.now();
    await storage.generateM3uForAllDiscGroups();
    const durationMs = performance.now() - startTime;

    console.log(`[PERF BENCHMARK] generateM3uForAllDiscGroups (${NUM_GROUPS} disc groups): ${durationMs.toFixed(2)} ms`);

    // Verification
    const playlists = (await storage.listUploadedRoms(false)).filter((r) => r.isPlaylist);
    expect(playlists.length).toBe(NUM_GROUPS);

    // Verify first disc group's siblings are correctly linked to generated M3U
    const firstGroupDisc1 = (await storage.listRomsByDiscGroup("disc_group_perf_0"))
      .filter((r) => !r.isPlaylist);
    expect(firstGroupDisc1.length).toBe(DISCS_PER_GROUP);
    const m3u = playlists.find((p) => p.discGroup === "disc_group_perf_0");
    expect(m3u).toBeDefined();

    for (const sib of firstGroupDisc1) {
      expect(sib.parentM3uId).toBe(m3u!.id);
    }
  });
});

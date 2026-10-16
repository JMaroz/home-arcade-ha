import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storage, sqlite as storageSqlite, db as storageDb } from '../storage';
import { uploadedRoms } from '@shared/schema';
import { eq } from 'drizzle-orm';

vi.mock('../log', () => ({
  log: vi.fn(),
}));

vi.mock('../data-dir', () => ({
  dataPath: vi.fn((p) => p),
  ensureDir: vi.fn(),
  getDataDir: vi.fn(() => '/tmp'),
}));

describe('generateM3uForAllDiscGroups', () => {
  beforeEach(() => {
    storageSqlite.prepare('DELETE FROM uploaded_roms').run();
  });

  it('correctly creates M3U playlist and links sibling disc ROMs', async () => {
    const insertStmt = storageSqlite.prepare(`
      INSERT INTO uploaded_roms
        (title, system, slug, original_name, file_name, file_path, size, mime_type, created_at, disc_group, disc_number, is_playlist, parent_m3u_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    // Disc 2 inserted before Disc 1 to verify ordering
    insertStmt.run('Final Fantasy VII', 'psx', 'ff7_d2', 'FF7 (Disc 2).chd', 'ff7_d2.chd', '/roms/psx/ff7_d2.chd', 1000, 'app/bin', 1000, 'ff7_group', 2, 0);
    insertStmt.run('Final Fantasy VII', 'psx', 'ff7_d1', 'FF7 (Disc 1).chd', 'ff7_d1.chd', '/roms/psx/ff7_d1.chd', 1000, 'app/bin', 1000, 'ff7_group', 1, 0);

    // Run optimization
    await storage.generateM3uForAllDiscGroups();

    // Verify M3U playlist record created
    const playlists = storageSqlite.prepare('SELECT * FROM uploaded_roms WHERE is_playlist = 1 AND disc_group = ?').all('ff7_group') as any[];
    expect(playlists).toHaveLength(1);
    const m3u = playlists[0];
    expect(m3u.title).toBe('Final Fantasy VII');
    expect(m3u.m3u_content).toBe('FF7 (Disc 1).chd\nFF7 (Disc 2).chd');

    // Verify siblings linked to parent_m3u_id
    const siblings = storageSqlite.prepare('SELECT * FROM uploaded_roms WHERE is_playlist = 0 AND disc_group = ?').all('ff7_group') as any[];
    expect(siblings).toHaveLength(2);
    expect(siblings[0].parent_m3u_id).toBe(m3u.id);
    expect(siblings[1].parent_m3u_id).toBe(m3u.id);
  });

  it('skips disc groups that already have an M3U playlist', async () => {
    const insertStmt = storageSqlite.prepare(`
      INSERT INTO uploaded_roms
        (title, system, slug, original_name, file_name, file_path, size, mime_type, created_at, disc_group, disc_number, is_playlist, parent_m3u_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    // Existing M3U
    insertStmt.run('Existing Game', 'psx', 'eg_m3u', 'Existing.m3u', 'eg.m3u', '/roms/psx/eg.m3u', 100, 'text/plain', 1000, 'eg_group', null, 1);
    insertStmt.run('Existing Game', 'psx', 'eg_d1', 'Existing (Disc 1).chd', 'eg_d1.chd', '/roms/psx/eg_d1.chd', 1000, 'app/bin', 1000, 'eg_group', 1, 0);
    insertStmt.run('Existing Game', 'psx', 'eg_d2', 'Existing (Disc 2).chd', 'eg_d2.chd', '/roms/psx/eg_d2.chd', 1000, 'app/bin', 1000, 'eg_group', 2, 0);

    await storage.generateM3uForAllDiscGroups();

    const playlists = storageSqlite.prepare('SELECT * FROM uploaded_roms WHERE is_playlist = 1 AND disc_group = ?').all('eg_group') as any[];
    expect(playlists).toHaveLength(1);
    expect(playlists[0].slug).toBe('eg_m3u'); // No duplicate created
  });

  it('measures execution time for generateM3uForAllDiscGroups with 1000 disc groups', async () => {
    const NUM_GROUPS = 1000;

    const insertStmt = storageSqlite.prepare(`
      INSERT INTO uploaded_roms
        (title, system, slug, original_name, file_name, file_path, size, mime_type, created_at, disc_group, disc_number, is_playlist, parent_m3u_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    const insertTransaction = storageSqlite.transaction(() => {
      for (let i = 0; i < NUM_GROUPS; i++) {
        const groupName = `psx_game_${i}`;
        // Disc 1
        insertStmt.run(
          `Game ${i}`,
          'psx',
          `psx_game_${i}_d1_${i}`,
          `Game ${i} (Disc 1).chd`,
          `psx_game_${i}_d1.chd`,
          `/roms/psx/psx_game_${i}_d1.chd`,
          1000000,
          'application/octet-stream',
          Date.now(),
          groupName,
          1,
          0
        );
        // Disc 2
        insertStmt.run(
          `Game ${i}`,
          'psx',
          `psx_game_${i}_d2_${i}`,
          `Game ${i} (Disc 2).chd`,
          `psx_game_${i}_d2.chd`,
          `/roms/psx/psx_game_${i}_d2.chd`,
          1000000,
          'application/octet-stream',
          Date.now(),
          groupName,
          2,
          0
        );

        // For half of the groups (even indices), insert an existing M3U playlist
        if (i % 2 === 0) {
          insertStmt.run(
            `Game ${i}`,
            'psx',
            `psx_m3u_${i}`,
            `Game ${i}.m3u`,
            `psx_m3u_${i}.m3u`,
            `/roms/psx/psx_m3u_${i}.m3u`,
            100,
            'text/plain',
            Date.now(),
            groupName,
            null,
            1
          );
        }
      }
    });

    insertTransaction();

    const startTime = performance.now();
    await storage.generateM3uForAllDiscGroups();
    const endTime = performance.now();

    const durationMs = endTime - startTime;
    console.log(`\n[BENCHMARK OPTIMIZED] generateM3uForAllDiscGroups duration for ${NUM_GROUPS} groups: ${durationMs.toFixed(2)} ms\n`);

    expect(durationMs).toBeGreaterThan(0);
  });
});

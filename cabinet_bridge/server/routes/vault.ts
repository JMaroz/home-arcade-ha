import { Express } from "express";
import express from "express";
import { storage } from "../storage";
import { log } from "../log";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { ensureDriveFolder, uploadToDrive, downloadFromDrive } from "../google-drive";
import { dataPath } from "../data-dir";
import { SAVE_BACKUP_DIR } from "./shared";
import { getAbsoluteFilePath } from "./utils";
import { createZip, extractZip, type ZipEntry } from "../zip";
import { WebDavClient } from "../webdav";
import { analyzeLibraryCuration, executeDeduplication } from "../rom-curator";

export function registerVaultRoutes(app: Express) {
  /**
   * Curation Analysis Report
   * Analyzes installed ROMs for duplicate region/language versions and missing platform titles.
   */
  app.get("/api/vault/curation-analysis", async (_req, res) => {
    try {
      const report = await analyzeLibraryCuration();
      res.json(report);
    } catch (err: any) {
      log(`Vault curation analysis failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Language-Aware 1G1R Auto-Deduplication
   * Deletes redundant duplicate ROMs while preserving user language preference.
   */
  app.post("/api/vault/deduplicate", express.json(), async (req, res) => {
    try {
      const targetRomIds = req.body?.targetRomIds ? (req.body.targetRomIds as number[]) : undefined;
      const result = await executeDeduplication({ targetRomIds });
      log(`Vault deduplicate: removed ${result.deletedCount} redundant ROMs, freed ${Math.round(result.freedBytes / 1024 / 1024)} MB`, "vault");
      res.json({ success: true, ...result });
    } catch (err: any) {
      log(`Vault deduplicate failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Library Health Summary
   * Returns counts of games missing specific metadata.
   */
  app.get("/api/vault/health", async (_req, res) => {
    try {
      const roms = await storage.listUploadedRoms();
      const bios = await storage.getBiosStatus();
      const [unplayed, duplicateGroups, failedScrapes] = await Promise.all([
        storage.countUnplayedRoms(),
        storage.getDuplicateGroups(),
        storage.countFailedScrapes(),
      ]);
      
      const summary = {
        total: roms.length,
        missingArt: roms.filter(r => !r.artUrl).length,
        missingDescription: roms.filter(r => !r.description).length,
        missingYear: roms.filter(r => !r.releaseYear).length,
        missingGenre: roms.filter(r => !r.genre).length,
        failedScrapes,
        unplayed,
        duplicateGroups: duplicateGroups.length,
        bios,
      };

      log(`Vault health: ${summary.total} ROMs, ${summary.failedScrapes} failed, ${summary.unplayed} unplayed, ${summary.duplicateGroups} dup groups`, "vault");
      res.json(summary);
    } catch (err: any) {
      log(`Vault health failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Storage Snapshot
   * Returns a complete overview of ROM storage: total size, per-system
   * breakdown, disk usage, watch-path file counts, and cache sizes.
   */
  app.get("/api/vault/storage-snapshot", async (_req, res) => {
    try {
      const snapshot = await storage.getStorageSnapshot();
      res.json(snapshot);
    } catch (err: any) {
      log(`Storage snapshot failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Batch Deduplicate
   * Removes duplicate database entries (keeps the first entry per hash).
   * Does not delete the actual file on disk.
   */
  app.post("/api/vault/dedup", async (_req, res) => {
    try {
      const result = await storage.deleteDuplicateRoms();
      log(`Vault dedup: removed ${result.deletedCount} entries, kept ${result.keptCount} groups`, "vault");
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Batch Delete Unplayed
   * Removes ROM files and database entries for unplayed games.
   * Optional query param ?system= to scope to one system.
   */
  app.post("/api/vault/delete-unplayed", async (req, res) => {
    try {
      const system = req.query.system ? String(req.query.system) : undefined;
      const roms = await storage.listUploadedRoms();
      const toDelete = roms.filter(r => {
        const isUnplayed = r.minutesPlayed == null || r.minutesPlayed === 0;
        return system ? isUnplayed && r.system === system : isUnplayed;
      });

      let deletedCount = 0;
      for (const rom of toDelete) {
        const removed = await storage.deleteUploadedRomWithFile(rom.id);
        if (removed) deletedCount++;
      }

      log(`Vault delete-unplayed: removed ${deletedCount} entries (system: ${system ?? "all"})`, "vault");
      res.json({ success: true, deletedCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Batch Delete Failed Scrapes
   * Removes ROM files and database entries where scraping failed.
   */
  app.post("/api/vault/delete-failed", async (_req, res) => {
    try {
      const roms = await storage.listUploadedRoms();
      const failed = roms.filter(r => r.scrapeStatus === "failed");

      let deletedCount = 0;
      for (const rom of failed) {
        const removed = await storage.deleteUploadedRomWithFile(rom.id);
        if (removed) deletedCount++;
      }

      log(`Vault delete-failed: removed ${deletedCount} entries`, "vault");
      res.json({ success: true, deletedCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Batch Delete by System
   * Removes all ROM files and database entries for a given system.
   */
  app.post("/api/vault/delete-system", async (req, res) => {
    try {
      const system = req.body?.system as string | undefined;
      if (!system) {
        res.status(400).json({ message: "Missing system in request body." });
        return;
      }

      const roms = await storage.listUploadedRoms();
      const toDelete = roms.filter(r => r.system === system);

      let deletedCount = 0;
      for (const rom of toDelete) {
        const removed = await storage.deleteUploadedRomWithFile(rom.id);
        if (removed) deletedCount++;
      }

      log(`Vault delete-system: removed ${deletedCount} entries for system ${system}`, "vault");
      res.json({ success: true, system, deletedCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Reset Library: Batch Delete All ROMs
   * Deletes all uploaded ROM files and database entries without touching saves.
   */
  app.post("/api/vault/delete-all-roms", async (_req, res) => {
    try {
      const result = await storage.deleteAllUploadedRomsWithFiles();
      log(`Vault delete-all-roms: removed ${result.deletedCount} ROMs`, "vault");
      res.json({ success: true, ...result });
    } catch (err: any) {
      log(`Vault delete-all-roms failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Clear Art Cache
   * Deletes cached box art and banner images from the art-cache folder.
   */
  app.post("/api/vault/clear-art-cache", async (_req, res) => {
    try {
      const artCacheDir = dataPath("art-cache");
      let deletedCount = 0;
      if (existsSync(artCacheDir)) {
        const files = await fs.readdir(artCacheDir);
        for (const f of files) {
          try {
            await fs.unlink(path.join(artCacheDir, f));
            deletedCount++;
          } catch {}
        }
      }
      log(`Vault clear-art-cache: deleted ${deletedCount} cached images`, "vault");
      res.json({ success: true, deletedCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Library Audit
   * Checks every ROM in the database against the filesystem.
   * Identifies dead links and duplicate files.
   */
  app.get("/api/vault/audit", async (_req, res) => {
    try {
      const roms = await storage.listUploadedRoms();
      const deadLinks: any[] = [];
      const hashGroups: Record<string, any[]> = {};

      const settings = await storage.getIntegrationSettings();
      const watchPaths = (settings.libraryWatchPaths ?? "")
        .split(",")
        .map((p) => path.resolve(p.trim()))
        .filter(Boolean);

      for (const rom of roms) {
        const resolvedPath = getAbsoluteFilePath(rom, watchPaths);
        // Check if file exists
        if (!existsSync(resolvedPath)) {
          deadLinks.push({ id: rom.id, title: rom.title, path: rom.filePath });
        }

        // Group by hash for duplicates
        if (rom.romHash) {
          if (!hashGroups[rom.romHash]) hashGroups[rom.romHash] = [];
          hashGroups[rom.romHash].push({ id: rom.id, title: rom.title, system: rom.system });
        }
      }

      const duplicates = Object.values(hashGroups).filter(group => group.length > 1);

      res.json({
        deadLinks,
        duplicates
      });
    } catch (err: any) {
      log(`Vault audit failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Batch Prune Dead Links
   * Removes database entries for files that no longer exist.
   */
  app.post("/api/vault/prune", async (_req, res) => {
    try {
      const roms = await storage.listUploadedRoms();
      let count = 0;

      const settings = await storage.getIntegrationSettings();
      const watchPaths = (settings.libraryWatchPaths ?? "")
        .split(",")
        .map((p) => path.resolve(p.trim()))
        .filter(Boolean);

      for (const rom of roms) {
        const resolvedPath = getAbsoluteFilePath(rom, watchPaths);
        if (!existsSync(resolvedPath)) {
          await storage.deleteUploadedRom(rom.id);
          count++;
        }
      }

      log(`Vault prune: removed ${count} dead links`, "vault");
      res.json({ success: true, removedCount: count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Test Google Drive Connection
   */
  app.get("/api/vault/test-drive", async (_req, res) => {
    try {
      const folderId = await ensureDriveFolder();
      res.json({ ok: true, message: `Successfully connected to Google Drive. Saves folder ID: ${folderId}`, folderId });
    } catch (err: any) {
      log(`Drive test failed: ${err.message}`, "cloud");
      res.status(500).json({ ok: false, message: err.message });
    }
  });

  /**
   * Bulk Sync Local Saves to Cloud
   */
  app.post("/api/vault/cloud-sync", async (_req, res) => {
    try {
      const roms = await storage.listUploadedRoms();
      const settings = await storage.getIntegrationSettings();
      
      let uploadCount = 0;
      let downloadCount = 0;

      for (const rom of roms) {
        const slots = await storage.listAllRomSaveSlots(rom.id);
        for (const slot of slots) {
          const localPath = path.join(SAVE_BACKUP_DIR, slot.userId, String(rom.id), `slot-${slot.slot}.state`);
          const driveFileName = `${slot.userId}_${rom.id}_slot-${slot.slot}.state`;

          // 1. Try to download newer version
          const downloaded = await downloadFromDrive(driveFileName, localPath).catch(() => false);
          if (downloaded) downloadCount++;

          // 2. Upload local if it exists
          if (existsSync(localPath)) {
            await uploadToDrive(localPath, driveFileName).catch(() => {});
            uploadCount++;
          }
        }
      }

      res.json({ success: true, uploaded: uploadCount, downloaded: downloadCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Export all battery saves and state files as a ZIP archive.
   */
  app.get("/api/vault/saves-export", async (_req, res) => {
    try {
      if (!existsSync(SAVE_BACKUP_DIR)) {
        return res.status(404).json({ message: "No saves directory found." });
      }

      const entries: ZipEntry[] = [];

      async function collectFiles(dir: string, rel = "") {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = rel ? `${rel}/${item.name}` : item.name;
          if (item.isDirectory()) {
            await collectFiles(fullPath, relativePath);
          } else if (item.isFile()) {
            const data = await fs.readFile(fullPath);
            entries.push({ name: relativePath, data });
          }
        }
      }

      await collectFiles(SAVE_BACKUP_DIR);

      if (entries.length === 0) {
        return res.status(404).json({ message: "No save files to export." });
      }

      const zipBuffer = await createZip(entries);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="homearcade-saves-${new Date().toISOString().slice(0, 10)}.zip"`,
      );
      res.setHeader("Content-Length", String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (err: any) {
      log(`Saves export failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });

  /**
   * Import battery saves and state files from an uploaded ZIP archive.
   */
  app.post(
    "/api/vault/saves-import",
    express.raw({
      type: ["application/zip", "application/octet-stream", "application/x-zip-compressed"],
      limit: "256mb",
    }),
    async (req, res) => {
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          return res.status(400).json({ message: "Invalid or empty ZIP archive" });
        }

        const entries = await extractZip(body);
        if (entries.length === 0) {
          return res.status(400).json({ message: "No valid files found in ZIP archive" });
        }

        await fs.mkdir(SAVE_BACKUP_DIR, { recursive: true });
        let restoredCount = 0;

        for (const entry of entries) {
          const targetPath = path.resolve(SAVE_BACKUP_DIR, entry.name);
          if (!targetPath.startsWith(path.resolve(SAVE_BACKUP_DIR))) {
            continue;
          }
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, entry.data);
          restoredCount++;
        }

        log(`Restored ${restoredCount} save files from ZIP import`, "vault");
        res.json({ success: true, restoredCount });
      } catch (err: any) {
        log(`Saves import failed: ${err.message}`, "vault");
        res.status(500).json({ message: err.message });
      }
    },
  );

  /**
   * Test WebDAV connection credentials.
   */
  app.post("/api/vault/webdav-test", express.json(), async (req, res) => {
    try {
      const settings = await storage.getIntegrationSettings();
      const url = req.body.url || settings.webdavUrl;
      const username = req.body.username !== undefined ? req.body.username : settings.webdavUsername;
      const password = req.body.password !== undefined ? req.body.password : settings.webdavPassword;

      if (!url) {
        return res.status(400).json({ ok: false, message: "WebDAV URL is required" });
      }

      const client = new WebDavClient({ url, username, password });
      const result = await client.testConnection();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message });
    }
  });

  /**
   * Sync saves to WebDAV storage.
   */
  app.post("/api/vault/webdav-sync", express.json(), async (_req, res) => {
    try {
      const settings = await storage.getIntegrationSettings();
      if (!settings.webdavUrl) {
        return res.status(400).json({ message: "WebDAV is not configured in settings." });
      }

      const client = new WebDavClient({
        url: settings.webdavUrl,
        username: settings.webdavUsername,
        password: settings.webdavPassword,
      });

      const result = await client.syncSaves(SAVE_BACKUP_DIR);
      await storage.saveIntegrationSettings({
        ...settings,
        webdavLastSync: Date.now(),
      });

      log(`WebDAV sync finished: uploaded ${result.uploaded}, failed ${result.failed}`, "vault");
      res.json({ success: true, ...result });
    } catch (err: any) {
      log(`WebDAV sync failed: ${err.message}`, "vault");
      res.status(500).json({ message: err.message });
    }
  });
}

import type { Express } from "express";
import express from "express";
import { storage } from "../storage";
import { 
  listAllSystemMetas, 
  getSystemCatalogMeta, 
  fetchPlatformGames 
} from "../archive-client";
import { 
  startArchiveDownload, 
  getActiveDownloadJobs, 
  cancelDownloadJob 
} from "../archive-downloader";

export function registerArchiveRoutes(app: Express) {
  // GET /api/archive/systems
  // Returns overview of all available systems with full-set sizes, HW badges, and BIOS status
  app.get("/api/archive/systems", async (_req, res) => {
    try {
      const systems = await listAllSystemMetas();
      res.json(systems);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to list archive systems", error: err?.message });
    }
  });

  // GET /api/archive/systems/:system
  app.get("/api/archive/systems/:system", async (req, res) => {
    try {
      const meta = await getSystemCatalogMeta(req.params.system);
      if (!meta) return res.status(404).json({ message: "System not supported in archive catalog" });
      res.json(meta);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch system meta", error: err?.message });
    }
  });

  // GET /api/archive/catalog?system=nes
  // Returns the list of games available for download for a given system
  app.get("/api/archive/catalog", async (req, res) => {
    try {
      const system = String(req.query.system ?? "");
      if (!system) {
        return res.status(400).json({ message: "Missing required query parameter: system" });
      }

      const settings = await storage.getIntegrationSettings();
      const credentials = (settings.archiveAccessKey && settings.archiveSecretKey)
        ? { accessKey: settings.archiveAccessKey, secretKey: settings.archiveSecretKey }
        : undefined;

      const games = await fetchPlatformGames(system, credentials);
      res.json(games);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch catalog from Internet Archive", error: err?.message });
    }
  });

  // POST /api/archive/download
  // Starts a download job (single game or full set)
  app.post("/api/archive/download", express.json(), async (req, res) => {
    try {
      const { system, title, fileName, downloadUrl, expectedSize, isFullSet } = req.body ?? {};

      if (!system || !fileName || !downloadUrl) {
        return res.status(400).json({ message: "Missing required fields: system, fileName, downloadUrl" });
      }

      const job = await startArchiveDownload({
        system,
        title: title || fileName,
        fileName,
        downloadUrl,
        expectedSize: Number(expectedSize || 0),
        isFullSet: Boolean(isFullSet),
      });

      res.status(202).json(job);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to start download" });
    }
  });

  // GET /api/archive/downloads
  // Returns active and recent download jobs
  app.get("/api/archive/downloads", (_req, res) => {
    try {
      const jobs = getActiveDownloadJobs();
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to get download jobs", error: err?.message });
    }
  });

  // POST /api/archive/cancel/:jobId
  app.post("/api/archive/cancel/:jobId", (req, res) => {
    try {
      const cancelled = cancelDownloadJob(req.params.jobId);
      if (!cancelled) {
        return res.status(404).json({ message: "Active job not found or already completed" });
      }
      res.json({ success: true, message: "Download cancelled" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to cancel job", error: err?.message });
    }
  });
}

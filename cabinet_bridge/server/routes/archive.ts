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
  // GET /api/archive/keys-status
  // Returns whether S3 credentials are configured and a masked key preview
  app.get("/api/archive/keys-status", async (_req, res) => {
    try {
      const settings = await storage.getIntegrationSettings();
      const hasKeys = Boolean(settings.archiveAccessKey && settings.archiveSecretKey);
      const masked = hasKeys && settings.archiveAccessKey
        ? `${settings.archiveAccessKey.slice(0, 4)}...${settings.archiveAccessKey.slice(-3)}`
        : undefined;

      res.json({
        hasKeys,
        accessKeyMasked: masked,
        archiveSource: settings.archiveSource || "retro-best",
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to get keys status", error: err?.message });
    }
  });

  // POST /api/archive/validate-keys
  // Validates S3 keys against Internet Archive tasks service and saves them on success
  app.post("/api/archive/validate-keys", express.json(), async (req, res) => {
    try {
      const { accessKey, secretKey, save = true } = req.body ?? {};
      const settings = await storage.getIntegrationSettings();
      const finalAccess = (accessKey ?? settings.archiveAccessKey ?? "").trim();
      const finalSecret = (secretKey ?? settings.archiveSecretKey ?? "").trim();

      if (!finalAccess || !finalSecret) {
        return res.status(400).json({
          valid: false,
          message: "Inserisci sia l'Access Key che la Secret Key per la convalida.",
        });
      }

      const testRes = await fetch("https://archive.org/services/tasks.php", {
        headers: {
          "Authorization": `LOW ${finalAccess}:${finalSecret}`,
          "User-Agent": "HomeArcade/1.0 (+https://github.com/home-arcade-ha)",
        },
        signal: AbortSignal.timeout(12_000),
      }).catch((fetchErr: any) => {
        throw new Error(`Connessione a archive.org fallita: ${fetchErr?.message || fetchErr}`);
      });

      if (testRes.status === 200) {
        if (save) {
          await storage.saveIntegrationSettings({
            ...settings,
            archiveAccessKey: finalAccess,
            archiveSecretKey: finalSecret,
          });
        }
        return res.json({
          valid: true,
          message: "Credenziali S3 Internet Archive convalidate con successo!",
        });
      }

      if (testRes.status === 401 || testRes.status === 403) {
        return res.status(401).json({
          valid: false,
          message: "Credenziali S3 non valide o rifiutate da Internet Archive (HTTP 401 Unauthorized).",
        });
      }

      return res.status(502).json({
        valid: false,
        message: `Internet Archive ha risposto con codice HTTP ${testRes.status}.`,
      });
    } catch (err: any) {
      res.status(500).json({
        valid: false,
        message: err?.message || "Errore durante la convalida delle credenziali S3",
      });
    }
  });

  // GET /api/archive/systems
  // Returns overview of all available systems with full-set sizes, HW badges, and BIOS status
  app.get("/api/archive/systems", async (_req, res) => {
    try {
      const settings = await storage.getIntegrationSettings();
      const systems = await listAllSystemMetas(settings.archiveSource, settings.archiveCustomId);
      res.json(systems);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to list archive systems", error: err?.message });
    }
  });

  // GET /api/archive/systems/:system
  app.get("/api/archive/systems/:system", async (req, res) => {
    try {
      const settings = await storage.getIntegrationSettings();
      const meta = await getSystemCatalogMeta(req.params.system, settings.archiveSource, settings.archiveCustomId);
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

      const games = await fetchPlatformGames(
        system, 
        credentials, 
        settings.archiveSource, 
        settings.archiveCustomId
      );
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

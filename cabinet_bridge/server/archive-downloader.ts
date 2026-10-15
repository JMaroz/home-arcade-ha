import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { storage } from "./storage";
import { extractZip } from "./zip";
import { log } from "./log";
import { getDeterministicBoxArtUrl } from "./archive-client";
import { titleFromFileName, slugify } from "./routes/utils";
import { ROM_ROOT } from "./routes/shared";

export type DownloadStatus = "pending" | "downloading" | "extracting" | "indexing" | "completed" | "error" | "cancelled";

export interface DownloadJob {
  id: string;
  system: string;
  title: string;
  fileName: string;
  url: string;
  isFullSet: boolean;
  status: DownloadStatus;
  progress: number; // 0 - 100
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  error?: string;
  extractionProgress?: {
    current: number;
    total: number;
    currentFileName?: string;
  };
  startedAt: number;
  completedAt?: number;
}

const activeJobs = new Map<string, { job: DownloadJob; abortController: AbortController }>();
const completedJobs: DownloadJob[] = [];
const MAX_COMPLETED_HISTORY = 30;

export function getActiveDownloadJobs(): DownloadJob[] {
  const active = Array.from(activeJobs.values()).map(v => ({ ...v.job }));
  return [...active, ...completedJobs.slice(0, MAX_COMPLETED_HISTORY)];
}

export function cancelDownloadJob(id: string): boolean {
  const entry = activeJobs.get(id);
  if (!entry) return false;
  entry.abortController.abort();
  entry.job.status = "cancelled";
  entry.job.error = "Download annullato dall'utente";
  activeJobs.delete(id);
  completedJobs.unshift(entry.job);
  return true;
}

export async function startArchiveDownload(options: {
  system: string;
  title: string;
  fileName: string;
  downloadUrl: string;
  expectedSize: number;
  isFullSet?: boolean;
}): Promise<DownloadJob> {
  const settings = await storage.getIntegrationSettings();
  let baseDest = settings.defaultRomDirectory ? path.resolve(settings.defaultRomDirectory) : ROM_ROOT;
  let systemDir = path.join(baseDest, options.system);

  // 1. Ensure target directory exists
  try {
    await fs.mkdir(systemDir, { recursive: true });
  } catch (err: any) {
    if (baseDest !== ROM_ROOT && (err.code === "EACCES" || err.code === "EPERM" || err.code === "ENOENT")) {
      baseDest = ROM_ROOT;
      systemDir = path.join(baseDest, options.system);
      await fs.mkdir(systemDir, { recursive: true });
    } else {
      throw err;
    }
  }

  // 2. Pre-flight check: verify free disk space
  if (options.expectedSize > 0) {
    try {
      const s = await fs.statfs(systemDir);
      const freeBytes = s.bavail * s.bsize;
      const requiredBytes = Math.ceil(options.expectedSize * 1.25);
      if (freeBytes < requiredBytes) {
        const freeMb = Math.round(freeBytes / 1024 / 1024);
        const reqMb = Math.round(requiredBytes / 1024 / 1024);
        throw new Error(`Spazio su disco insufficiente: richiesti ~${reqMb} MB, disponibili ${freeMb} MB.`);
      }
    } catch (statErr: any) {
      if (statErr.message.includes("Spazio su disco insufficiente")) {
        throw statErr;
      }
      log(`Warning checking statfs on ${systemDir}: ${statErr.message}`, "archive");
    }
  }

  const jobId = crypto.randomUUID();
  const abortController = new AbortController();

  const job: DownloadJob = {
    id: jobId,
    system: options.system,
    title: options.title,
    fileName: options.fileName,
    url: options.downloadUrl,
    isFullSet: Boolean(options.isFullSet),
    status: "pending",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: options.expectedSize || 0,
    speedBytesPerSec: 0,
    startedAt: Date.now(),
  };

  activeJobs.set(jobId, { job, abortController });

  // Execute download asynchronously in background
  void (async () => {
    const finalFilePath = path.join(systemDir, options.fileName);
    const partFilePath = `${finalFilePath}.part`;

    try {
      job.status = "downloading";
      log(`[ArchiveDownloader] Starting download for "${options.title}" from ${options.downloadUrl}`, "archive");

      // Check existing partial file for resumable download (HTTP Range)
      let existingBytes = 0;
      try {
        const stat = await fs.stat(partFilePath);
        existingBytes = stat.size;
      } catch {
        existingBytes = 0;
      }

      let currentUrl = options.downloadUrl;
      let res!: Response;
      let redirectCount = 0;
      const MAX_REDIRECTS = 8;
      let isPartial = false;

      while (true) {
        const requestHeaders: Record<string, string> = {
          "User-Agent": "HomeArcade/1.0 (+https://github.com/home-arcade-ha)",
        };

        if (existingBytes > 0) {
          requestHeaders["Range"] = `bytes=${existingBytes}-`;
        }

        const parsedUrl = new URL(currentUrl);
        if (
          settings.archiveAccessKey &&
          settings.archiveSecretKey &&
          (parsedUrl.hostname === "archive.org" || parsedUrl.hostname.endsWith(".archive.org"))
        ) {
          requestHeaders["Authorization"] = `LOW ${settings.archiveAccessKey.trim()}:${settings.archiveSecretKey.trim()}`;
        }

        res = await fetch(currentUrl, {
          headers: requestHeaders,
          signal: abortController.signal,
          redirect: "manual",
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) {
            throw new Error(`HTTP ${res.status} redirect without Location header`);
          }
          if (++redirectCount > MAX_REDIRECTS) {
            throw new Error(`Troppi redirect HTTP (${redirectCount})`);
          }
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }

        break;
      }

      if (res.status === 206) {
        isPartial = true;
        job.downloadedBytes = existingBytes;
        const contentRange = res.headers.get("content-range");
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)/);
          if (match) {
            job.totalBytes = parseInt(match[1], 10);
          }
        }
        if (!job.totalBytes && res.headers.get("content-length")) {
          job.totalBytes = existingBytes + parseInt(res.headers.get("content-length")!, 10);
        }
        log(`[ArchiveDownloader] Resuming download for "${options.title}" from byte ${existingBytes}`, "archive");
      } else if (res.ok) {
        job.downloadedBytes = 0;
        const contentLength = res.headers.get("content-length");
        if (contentLength) {
          job.totalBytes = parseInt(contentLength, 10);
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            "Internet Archive richiede credenziali S3 valide (Access Key / Secret Key) per il download di questa collezione (HTTP 401/403)."
          );
        }
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error("No response body received from server");
      }

      let lastBytes = job.downloadedBytes;
      let lastTime = Date.now();
      const hash = crypto.createHash("md5");

      const progressTransform = new Transform({
        transform(chunk, _encoding, callback) {
          job.downloadedBytes += chunk.length;
          hash.update(chunk);

          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          if (elapsed >= 0.5) {
            job.speedBytesPerSec = Math.round((job.downloadedBytes - lastBytes) / elapsed);
            lastBytes = job.downloadedBytes;
            lastTime = now;
            if (job.totalBytes > 0) {
              job.progress = Math.min(99, Math.round((job.downloadedBytes / job.totalBytes) * 100));
            }
          }

          callback(null, chunk);
        },
      });

      const writeStream = fsSync.createWriteStream(partFilePath, { flags: isPartial ? "a" : "w" });
      // @ts-expect-error Node.js web readable stream compatibility
      await pipeline(res.body, progressTransform, writeStream);

      const md5Hash = hash.digest("hex");

      // 3. Decompression or final rename
      const isZip = options.fileName.toLowerCase().endsWith(".zip");
      const isArcadeSingle = !job.isFullSet && (options.system === "arcade" || options.system === "neogeo");
      const shouldDecompress = isZip && (job.isFullSet || !isArcadeSingle);

      if (shouldDecompress) {
        job.status = "extracting";
        job.progress = 0;
        log(`[ArchiveDownloader] Extracting zip ${options.fileName}...`, "archive");

        const zipData = await fs.readFile(partFilePath);
        const entries = await extractZip(zipData, (current, total, entryName) => {
          job.extractionProgress = { current, total, currentFileName: entryName };
          job.progress = Math.min(99, Math.round((current / total) * 100));
        });

        job.status = "indexing";
        let importedCount = 0;

        for (const entry of entries) {
          const entryBase = path.basename(entry.name);
          const lowerBase = entryBase.toLowerCase();

          // Skip MacOS metadata, hidden files, and auxiliary IA metadata files
          if (
            entryBase.startsWith(".") ||
            lowerBase.endsWith("_meta.xml") ||
            lowerBase.endsWith("_files.xml") ||
            lowerBase.endsWith(".torrent") ||
            lowerBase.endsWith("_meta.sqlite") ||
            lowerBase.endsWith("_reviews.xml")
          ) {
            continue;
          }

          const entryDest = path.join(systemDir, entryBase);
          await fs.writeFile(entryDest, entry.data);

          const entryMd5 = crypto.createHash("md5").update(entry.data).digest("hex");
          const cleanTitle = titleFromFileName(entryBase);
          const slug = slugify(cleanTitle) + "-" + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4);

          await storage.createUploadedRom({
            title: cleanTitle,
            system: options.system,
            slug,
            originalName: entryBase,
            fileName: entryBase,
            filePath: entryDest,
            size: entry.data.length,
            mimeType: "application/octet-stream",
            artUrl: getDeterministicBoxArtUrl(options.system, cleanTitle),
            romHash: entryMd5,
            scrapeStatus: "matched",
            favorite: false,
            createdAt: Date.now(),
          }).catch((err) => {
            log(`[ArchiveDownloader] Item import warn: ${err.message}`, "archive");
          });

          importedCount++;
        }

        // Clean part file after successful extraction
        await fs.unlink(partFilePath).catch(() => {});
        if (fsSync.existsSync(finalFilePath)) {
          await fs.unlink(finalFilePath).catch(() => {});
        }

        if (importedCount === 0) {
          log(`[ArchiveDownloader] Warning: No valid entries extracted from ${options.fileName}`, "archive");
        }
      } else {
        // Atomic rename from .part to final destination
        await fs.rename(partFilePath, finalFilePath);

        job.status = "indexing";
        job.progress = 100;

        const baseSlug = slugify(options.title || titleFromFileName(options.fileName));
        const slug = `${options.system}_${baseSlug}_${Date.now().toString(36)}`;
        const artUrl = getDeterministicBoxArtUrl(options.system, options.fileName);

        await storage.createUploadedRom({
          title: options.title || titleFromFileName(options.fileName),
          system: options.system,
          slug,
          originalName: options.fileName,
          fileName: options.fileName,
          filePath: finalFilePath,
          size: job.downloadedBytes,
          mimeType: "application/octet-stream",
          artUrl,
          romHash: md5Hash,
          scrapeStatus: "matched",
          favorite: false,
          createdAt: Date.now(),
        });
      }

      job.status = "completed";
      job.progress = 100;
      job.completedAt = Date.now();
      log(`[ArchiveDownloader] Download completed successfully: ${options.title}`, "archive");
    } catch (err: any) {
      if (fsSync.existsSync(partFilePath)) {
        await fs.unlink(partFilePath).catch(() => {});
      }
      job.status = job.status === "cancelled" ? "cancelled" : "error";
      job.error = err?.message || String(err);
      log(`[ArchiveDownloader] Download failed for ${options.title}: ${job.error}`, "archive");
    } finally {
      activeJobs.delete(jobId);
      completedJobs.unshift(job);
    }
  })();

  return job;
}

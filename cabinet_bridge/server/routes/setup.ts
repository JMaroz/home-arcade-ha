import type { Express } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { dataPath, ensureDir } from "../data-dir";
import { ESSENTIAL_NATIVE_CORES, getLibretroBuildbotUrl } from "@shared/core-metadata";
import { REQUIRED_BIOS } from "@shared/bios-metadata";
import { extractZipBuffer } from "../utils/zip";
import { storage } from "../storage";

const CORES_DIR = path.resolve(dataPath("cores"));
const BIOS_DIR = path.resolve(dataPath("bios"));

function detectBuildbotArch(): "aarch64" | "x86_64" {
  return process.arch === "arm64" ? "aarch64" : "x86_64";
}

async function getMd5(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("md5").update(buffer).digest("hex");
  } catch {
    return "";
  }
}

interface BootstrapProgress {
  active: boolean;
  stage: "idle" | "cores" | "bios" | "complete" | "error";
  totalItems: number;
  completedItems: number;
  currentItem: string;
  error?: string;
}

let currentProgress: BootstrapProgress = {
  active: false,
  stage: "idle",
  totalItems: 0,
  completedItems: 0,
  currentItem: "",
};

export async function checkSetupStatus() {
  await ensureDir(CORES_DIR);
  await ensureDir(BIOS_DIR);

  const arch = detectBuildbotArch();

  const coreStatuses = await Promise.all(
    ESSENTIAL_NATIVE_CORES.map(async (c) => {
      const corePath = path.join(CORES_DIR, c.name);
      try {
        const stat = await fs.stat(corePath);
        return {
          id: c.id,
          name: c.name,
          label: c.label,
          system: c.system,
          installed: stat.isFile() && stat.size > 0,
          size: stat.size,
        };
      } catch {
        // Fallback check for n64 if parallel_n64 is missing but mupen64plus_next is already installed
        if (c.system === "n64") {
          const altPath = path.join(CORES_DIR, "mupen64plus_next_libretro.so");
          try {
            const stat = await fs.stat(altPath);
            if (stat.isFile() && stat.size > 0) {
              return {
                id: c.id,
                name: "mupen64plus_next_libretro.so",
                label: c.label,
                system: c.system,
                installed: true,
                size: stat.size,
              };
            }
          } catch {}
        }
        // Fallback check for ps2 if pcsx2 is missing but play_libretro is installed
        if (c.system === "ps2") {
          const altPath = path.join(CORES_DIR, "play_libretro.so");
          try {
            const stat = await fs.stat(altPath);
            if (stat.isFile() && stat.size > 0) {
              return {
                id: c.id,
                name: "play_libretro.so",
                label: c.label,
                system: c.system,
                installed: true,
                size: stat.size,
              };
            }
          } catch {}
        }
        return {
          id: c.id,
          name: c.name,
          label: c.label,
          system: c.system,
          installed: false,
          size: 0,
        };
      }
    })
  );

  const allBiosEntries = Object.values(REQUIRED_BIOS).flat();
  const biosStatuses = await Promise.all(
    allBiosEntries.map(async (b) => {
      const biosPath = path.join(BIOS_DIR, b.filename);
      try {
        const stat = await fs.stat(biosPath);
        const actualMd5 = await getMd5(biosPath);
        const verified = actualMd5 === b.md5 || b.md5 === "00000000000000000000000000000000";
        return {
          filename: b.filename,
          label: b.label || b.filename,
          installed: stat.isFile() && stat.size > 0,
          verified,
          hasSourceUrl: Boolean(b.sourceUrl),
        };
      } catch {
        return {
          filename: b.filename,
          label: b.label || b.filename,
          installed: false,
          verified: false,
          hasSourceUrl: Boolean(b.sourceUrl),
        };
      }
    })
  );

  const missingCores = coreStatuses.filter((c) => !c.installed);
  const downloadableBios = biosStatuses.filter((b) => b.hasSourceUrl);
  const missingDownloadableBios = downloadableBios.filter((b) => !b.installed || !b.verified);

  const isComplete = missingCores.length === 0 && missingDownloadableBios.length === 0;

  const settings = await storage.getIntegrationSettings();
  const watchPaths = settings.libraryWatchPaths
    ? settings.libraryWatchPaths.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  const internalStoragePath = path.resolve(dataPath("rom-storage"));
  const suggestedLocations = [
    {
      id: "samba",
      label: "Cartella Samba Locale",
      path: "/share/roms",
      description: "Accessibile in rete locale (es. \\\\homeassistant\\share\\roms)",
    },
    {
      id: "media",
      label: "SSD Esterno / Hard Disk USB",
      path: "/media/roms",
      description: "Unità USB o dischi esterni collegati al Raspberry Pi (/media)",
    },
    {
      id: "internal",
      label: "Storage Interno Add-on",
      path: internalStoragePath,
      description: "Memoria persistente interna (/data/rom-storage)",
    },
  ];

  return {
    isComplete,
    arch,
    cores: coreStatuses,
    bios: biosStatuses,
    totalCores: coreStatuses.length,
    installedCores: coreStatuses.length - missingCores.length,
    totalBios: downloadableBios.length,
    installedBios: downloadableBios.length - missingDownloadableBios.length,
    watchPaths,
    defaultRomDirectory: settings.defaultRomDirectory || "/share/roms",
    suggestedLocations,
    progress: currentProgress,
  };
}

export function registerSetupRoutes(app: Express) {
  // GET /api/setup/status
  app.get("/api/setup/status", async (_req, res) => {
    try {
      const status = await checkSetupStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ message: "Failed to check setup status", error: String(err) });
    }
  });

  // GET /api/setup/progress
  app.get("/api/setup/progress", (_req, res) => {
    res.json(currentProgress);
  });

  // POST /api/setup/rom-folder
  app.post("/api/setup/rom-folder", async (req, res) => {
    try {
      const folderPath = String(req.body?.path || "").trim();
      if (!folderPath) {
        return res.status(400).json({ message: "Path is required" });
      }

      try {
        await fs.mkdir(folderPath, { recursive: true });
      } catch (err) {
        const stat = await fs.stat(folderPath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
          return res.status(400).json({ message: `Cannot access directory: ${String(err)}` });
        }
      }

      const settings = await storage.getIntegrationSettings();
      const existing = settings.libraryWatchPaths
        ? settings.libraryWatchPaths.split(",").map((p) => p.trim()).filter(Boolean)
        : [];

      if (!existing.includes(folderPath)) {
        existing.push(folderPath);
      }

      await storage.saveIntegrationSettings({
        ...settings,
        defaultRomDirectory: folderPath,
        libraryWatchPaths: existing.join(", "),
      });

      res.json({
        success: true,
        path: folderPath,
        defaultRomDirectory: folderPath,
        watchPaths: existing,
        message: "ROM folder configured successfully",
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to configure ROM folder", error: String(err) });
    }
  });

  // POST /api/setup/bootstrap
  app.post("/api/setup/bootstrap", async (_req, res) => {
    if (currentProgress.active) {
      return res.status(409).json({ message: "Bootstrap already in progress", progress: currentProgress });
    }

    const arch = detectBuildbotArch();
    await ensureDir(CORES_DIR);
    await ensureDir(BIOS_DIR);

    const initialStatus = await checkSetupStatus();
    const missingCores = ESSENTIAL_NATIVE_CORES.filter(
      (c) => !initialStatus.cores.find((sc) => sc.id === c.id && sc.installed)
    );

    const allBiosEntries = Object.values(REQUIRED_BIOS).flat();
    const missingBios = allBiosEntries.filter(
      (b) => b.sourceUrl && !initialStatus.bios.find((sb) => sb.filename === b.filename && sb.installed && sb.verified)
    );

    const totalToDownload = missingCores.length + missingBios.length;
    if (totalToDownload === 0) {
      return res.json({ success: true, message: "All cores and BIOS files are already installed." });
    }

    currentProgress = {
      active: true,
      stage: "cores",
      totalItems: totalToDownload,
      completedItems: 0,
      currentItem: "Starting setup...",
    };

    // Run download in background and respond immediately with tracking status
    res.status(202).json({
      message: "Bootstrap process started",
      totalItems: totalToDownload,
      missingCores: missingCores.length,
      missingBios: missingBios.length,
    });

    (async () => {
      const failedItems: string[] = [];
      try {
        // Step 1: Download missing Libretro native cores
        for (const core of missingCores) {
          currentProgress.stage = "cores";
          currentProgress.currentItem = `Downloading core: ${core.label}`;

          const url = getLibretroBuildbotUrl(arch, core.archive);
          try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
            if (!resp.ok) throw new Error(`Buildbot returned ${resp.status}`);

            const arrayBuf = await resp.arrayBuffer();
            const zipBuffer = Buffer.from(arrayBuf);
            const extracted = extractZipBuffer(zipBuffer);

            const soFile = extracted.find((f) => f.name.endsWith(".so"));
            if (!soFile) throw new Error(`No .so file found in archive ${core.archive}`);

            const destPath = path.join(CORES_DIR, core.name);
            const tmpPath = destPath + ".tmp";
            await fs.writeFile(tmpPath, soFile.data);
            await fs.rename(tmpPath, destPath);
          } catch (err) {
            console.error(`[Setup] Error downloading core ${core.name}:`, err);
            failedItems.push(core.label);
          }

          currentProgress.completedItems++;
        }

        // Step 2: Download missing BIOS files
        currentProgress.stage = "bios";
        for (const bios of missingBios) {
          if (!bios.sourceUrl) continue;
          currentProgress.currentItem = `Downloading BIOS: ${bios.label || bios.filename}`;

          const destPath = path.join(BIOS_DIR, bios.filename);
          const tmpPath = destPath + ".tmp";
          try {
            const resp = await fetch(bios.sourceUrl, { signal: AbortSignal.timeout(60_000) });
            if (!resp.ok) throw new Error(`Source returned ${resp.status}`);

            const arrayBuf = await resp.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);

            await fs.writeFile(tmpPath, buffer);
            await fs.rename(tmpPath, destPath);

            // Verify MD5
            const isCatchAll = bios.md5 === "00000000000000000000000000000000";
            if (!isCatchAll) {
              const actualMd5 = await getMd5(destPath);
              if (actualMd5 !== bios.md5) {
                console.warn(`[Setup] MD5 mismatch for ${bios.filename}: expected ${bios.md5}, got ${actualMd5}`);
              }
            }
          } catch (err) {
            console.error(`[Setup] Error downloading BIOS ${bios.filename}:`, err);
            await fs.unlink(tmpPath).catch(() => {});
            failedItems.push(bios.label || bios.filename);
          }

          currentProgress.completedItems++;
        }

        currentProgress.stage = "complete";
        if (failedItems.length > 0) {
          currentProgress.currentItem = `Setup completato con avvisi (non scaricati: ${failedItems.join(", ")})`;
        } else {
          currentProgress.currentItem = "Setup complete! Native engine ready.";
        }
      } catch (err) {
        currentProgress.stage = "error";
        currentProgress.error = String(err);
      } finally {
        currentProgress.active = false;
      }
    })();
  });
}

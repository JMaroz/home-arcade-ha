import type { Express } from "express";
import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { dataPath, ensureDir } from "../data-dir";
import { REQUIRED_BIOS, CORE_PERFORMANCE_TIERS } from "@shared/bios-metadata";

const BIOS_ROOT = path.resolve(dataPath("bios"));

async function getMd5(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("md5").update(buffer).digest("hex");
  } catch {
    return "";
  }
}

function detectArch(): "arm64" | "x64" {
  const arch = process.arch;
  if (arch === "arm64") return "arm64";
  return "x64";
}

// Prevent concurrent downloads of the same file
const activeDownloads = new Set<string>();

export function registerBiosRoutes(app: Express) {
  ensureDir(BIOS_ROOT);

  // Get status of all required BIOS files
  app.get("/api/bios", async (_req, res) => {
    const arch = detectArch();
    const status: Record<string, Array<{ filename: string; exists: boolean; verified: boolean; label?: string; sourceUrl?: string }>> = {};
    
    for (const [core, files] of Object.entries(REQUIRED_BIOS)) {
      status[core] = await Promise.all(
        files.map(async (meta) => {
          const filePath = path.join(BIOS_ROOT, meta.filename);
          try {
            await fs.access(filePath);
            const actualMd5 = await getMd5(filePath);
            const isVerified = actualMd5 === meta.md5 || meta.md5 === "00000000000000000000000000000000";
            return { 
              filename: meta.filename, 
              exists: true, 
              verified: isVerified,
              label: meta.label,
              sourceUrl: meta.sourceUrl,
            };
          } catch {
            return { filename: meta.filename, exists: false, verified: false, label: meta.label, sourceUrl: meta.sourceUrl };
          }
        })
      );
    }
    
    res.json({ cores: status, arch });
  });

  // Upload a BIOS file
  app.post(
    "/api/bios/upload",
    express.raw({ type: "*/*", limit: "50mb" }),
    async (req, res) => {
      const rawFilename = decodeURIComponent(String(req.header("x-bios-filename") ?? ""));
      
      if (!rawFilename) {
        return res.status(400).json({ message: "No filename provided." });
      }

      const allAllowedFiles = Object.values(REQUIRED_BIOS).flat();
      const matchedMeta = allAllowedFiles.find(
        (m) => m.filename.toLowerCase() === rawFilename.toLowerCase()
      );

      if (!matchedMeta) {
        return res.status(400).json({ message: `Filename '${rawFilename}' is not a recognized BIOS file.` });
      }

      const canonicalFilename = matchedMeta.filename;

      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (body.length === 0) {
        return res.status(400).json({ message: "Empty file body." });
      }

      const filePath = path.join(BIOS_ROOT, canonicalFilename);
      await fs.writeFile(filePath, body);

      res.status(201).json({ success: true, filename: canonicalFilename });
    }
  );

  // Download a BIOS file from retrobios
  app.post(
    "/api/bios/download",
    express.json(),
    async (req, res) => {
      const { filename } = req.body as { filename?: string };

      if (!filename) {
        return res.status(400).json({ message: "No filename provided." });
      }

      const allAllowedFiles = Object.values(REQUIRED_BIOS).flat();
      const matchedMeta = allAllowedFiles.find(
        (m) => m.filename.toLowerCase() === filename.toLowerCase()
      );

      if (!matchedMeta) {
        return res.status(400).json({ message: `Filename '${filename}' is not a recognized BIOS file.` });
      }

      if (!matchedMeta.sourceUrl) {
        return res.status(400).json({ message: `'${filename}' is not available for download. Upload it manually.` });
      }

      if (activeDownloads.has(matchedMeta.filename)) {
        return res.status(409).json({ message: `Download of '${matchedMeta.filename}' is already in progress.` });
      }

      const canonicalFilename = matchedMeta.filename;
      const filePath = path.join(BIOS_ROOT, canonicalFilename);
      const tmpPath = filePath + ".tmp";

      activeDownloads.add(canonicalFilename);

      try {
        let response = await fetch(matchedMeta.sourceUrl, {
          signal: AbortSignal.timeout(60_000),
        });

        // Fallback: If 404, try swapping uppercase/lowercase extension (.bin <-> .BIN)
        if (response.status === 404 && matchedMeta.sourceUrl) {
          const altUrl = matchedMeta.sourceUrl.endsWith(".bin")
            ? matchedMeta.sourceUrl.slice(0, -4) + ".BIN"
            : matchedMeta.sourceUrl.endsWith(".BIN")
              ? matchedMeta.sourceUrl.slice(0, -4) + ".bin"
              : null;
          if (altUrl) {
            const altResp = await fetch(altUrl, { signal: AbortSignal.timeout(60_000) });
            if (altResp.ok) response = altResp;
          }
        }

        if (!response.ok) {
          throw new Error(`Server returned ${response.status} ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        if (buffer.length === 0) {
          throw new Error("Downloaded file is empty.");
        }

        // Write to temp file first, then rename atomically
        await fs.writeFile(tmpPath, buffer);
        await fs.rename(tmpPath, filePath);

        // Verify MD5 (skip catch-all checksum)
        const isCatchAll = matchedMeta.md5 === "00000000000000000000000000000000";
        if (!isCatchAll) {
          const actualMd5 = await getMd5(filePath);
          if (actualMd5 !== matchedMeta.md5) {
            await fs.unlink(filePath).catch(() => {});
            throw new Error(`Checksum mismatch: expected ${matchedMeta.md5}, got ${actualMd5}`);
          }
        }

        res.json({ success: true, filename: canonicalFilename, verified: isCatchAll || true });
      } catch (err) {
        await fs.unlink(tmpPath).catch(() => {});
        await fs.unlink(filePath).catch(() => {});
        const message = err instanceof Error ? err.message : "Download failed";
        res.status(502).json({ message });
      } finally {
        activeDownloads.delete(canonicalFilename);
      }
    }
  );

  // Serve BIOS file for the emulator
  app.get("/api/bios/file/:filename", async (req, res) => {
    const rawFilename = req.params.filename;
    const safeFilename = path.basename(rawFilename);
    if (!safeFilename || safeFilename === "." || safeFilename === ".." || rawFilename.includes("..")) {
      return res.status(400).json({ message: "Invalid BIOS filename." });
    }
    const filePath = path.join(BIOS_ROOT, safeFilename);

    try {
      await fs.access(filePath);
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.sendFile(filePath);
    } catch {
      res.status(404).json({ message: "BIOS file not found." });
    }
  });
}

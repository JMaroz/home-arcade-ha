import type { Express } from "express";
import os from "node:os";
import fs from "node:fs/promises";
import { CORE_PERFORMANCE_TIERS } from "@shared/bios-metadata";

let cachedCpuModel: string | null | undefined = undefined;

async function getCpuModel(): Promise<string | null> {
  if (cachedCpuModel !== undefined) {
    return cachedCpuModel;
  }

  if (process.platform !== "linux") {
    cachedCpuModel = null;
    return null;
  }

  try {
    const cpuinfo = await fs.readFile("/proc/cpuinfo", "utf-8");
    const piMatch = cpuinfo.match(/^Model\s*:\s*(.+)$/m);
    if (piMatch) {
      cachedCpuModel = piMatch[1].trim();
    } else {
      const modelMatch = cpuinfo.match(/^model name\s*:\s*(.+)$/m);
      if (modelMatch) {
        cachedCpuModel = modelMatch[1].trim();
      } else {
        cachedCpuModel = null;
      }
    }
  } catch {
    cachedCpuModel = null;
  }

  return cachedCpuModel;
}

export function registerSystemRoutes(app: Express) {
  app.get("/api/system", async (_req, res) => {
    const cpuModel = await getCpuModel();
    const arch = process.arch === "arm64" ? "arm64" : "x64";

    const cores: Record<string, string> = {};
    for (const [core, tiers] of Object.entries(CORE_PERFORMANCE_TIERS)) {
      cores[core] = tiers[arch as keyof typeof tiers] ?? "playable";
    }

    res.json({
      arch,
      platform: process.platform,
      cpuModel,
      cores,
    });
  });
}

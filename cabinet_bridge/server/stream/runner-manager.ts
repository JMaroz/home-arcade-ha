import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { dataPath, ensureDir } from "../data-dir";
import { SYSTEM_TO_NATIVE_CORE } from "@shared/core-metadata";
import { storage } from "../storage";

export interface StreamSession {
  sessionId: string;
  romId: number;
  system: string;
  romPath: string;
  corePath: string;
  port: number;
  process?: ChildProcess;
  createdAt: number;
  lastHeartbeat: number;
  status: "starting" | "ready" | "active" | "stopped" | "error";
  error?: string;
}

const activeSessions = new Map<string, StreamSession>();

// Finds an available ephemeral port on loopback
async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Failed to get port address")));
        return;
      }
      const port = addr.port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on("error", reject);
  });
}

async function waitForPortReady(port: number, timeoutMs = 3000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(300) });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return false;
}

function getRunnerBinaryPath(): string | null {
  // Check candidate locations for native runner binary
  const candidates = [
    path.resolve(process.cwd(), "bin/homearcade-runner"),
    path.resolve(process.cwd(), "dist/homearcade-runner"),
    path.resolve(process.cwd(), "server/native-runner/homearcade-runner"),
    path.resolve(process.cwd(), "server/native-runner/bin/runner"),
    "/usr/local/bin/homearcade-runner",
  ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export class StreamRunnerManager {
  static async startSession(romId: number): Promise<{ sessionId: string; port: number }> {
    const rom = await storage.getUploadedRom(romId);
    if (!rom) {
      throw new Error(`ROM with ID ${romId} not found`);
    }

    let coreFilename = SYSTEM_TO_NATIVE_CORE[rom.system.toLowerCase()];
    if (!coreFilename) {
      throw new Error(`No native Libretro core defined for system: ${rom.system}`);
    }

    const coresDir = path.resolve(dataPath("cores"));
    await ensureDir(coresDir);
    let corePath = path.join(coresDir, coreFilename);

    try {
      await fs.access(corePath);
    } catch {
      // Fallback for n64: support both parallel_n64 and mupen64plus_next
      if (rom.system.toLowerCase() === "n64") {
        const altCore = coreFilename === "parallel_n64_libretro.so" ? "mupen64plus_next_libretro.so" : "parallel_n64_libretro.so";
        const altPath = path.join(coresDir, altCore);
        try {
          await fs.access(altPath);
          coreFilename = altCore;
          corePath = altPath;
        } catch {
          throw new Error(`Native core '${coreFilename}' is not installed in ${coresDir}. Please run First-Run Setup.`);
        }
      } else {
        throw new Error(`Native core '${coreFilename}' is not installed in ${coresDir}. Please run First-Run Setup.`);
      }
    }

    const romPath = path.resolve(rom.filePath);
    try {
      await fs.access(romPath);
    } catch {
      throw new Error(`ROM file not found at path: ${romPath}`);
    }

    const sessionId = crypto.randomUUID();
    const port = await getAvailablePort();
    const runnerBin = getRunnerBinaryPath();

    const session: StreamSession = {
      sessionId,
      romId,
      system: rom.system,
      romPath,
      corePath,
      port,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: "starting",
    };

    activeSessions.set(sessionId, session);

    if (runnerBin) {
      const child = spawn(
        runnerBin,
        [
          "--session", sessionId,
          "--port", String(port),
          "--rom", romPath,
          "--core", corePath,
          "--system", rom.system,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          detached: false,
        }
      );

      child.stdout?.on("data", (d) => {
        console.log(`[native-runner:${sessionId.slice(0, 8)}] ${d.toString().trim()}`);
      });

      child.stderr?.on("data", (d) => {
        console.error(`[native-runner:${sessionId.slice(0, 8)}] ${d.toString().trim()}`);
      });

      child.on("exit", (code) => {
        console.log(`[native-runner:${sessionId.slice(0, 8)}] exited with code ${code}`);
        session.status = "stopped";
        activeSessions.delete(sessionId);
      });

      session.process = child;
      const ready = await waitForPortReady(port, 3000);
      if (!ready && child.exitCode === null) {
        console.warn(`[native-runner:${sessionId.slice(0, 8)}] Runner port ${port} did not respond to /health within 3000ms; proceeding.`);
      }
      session.status = "ready";
    } else {
      // In development or when runner binary is not built, mark as ready for mock/fallback signaling
      console.warn(`[native-runner] Binary not found; session ${sessionId} initialized in test/fallback mode.`);
      session.status = "ready";
    }

    // Auto-cleanup stale session after 15 minutes of inactivity
    setTimeout(() => {
      const s = activeSessions.get(sessionId);
      if (s && Date.now() - s.lastHeartbeat > 15 * 60 * 1000) {
        this.stopSession(sessionId);
      }
    }, 15 * 60 * 1000);

    return { sessionId, port };
  }

  static getSession(sessionId: string): StreamSession | undefined {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.lastHeartbeat = Date.now();
    }
    return session;
  }

  static async relaySignal(
    sessionId: string,
    offer: { sdp: string; type: string }
  ): Promise<{ sdp: string; type: string }> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const runnerBin = getRunnerBinaryPath();
    if (!runnerBin) {
      throw new Error("Runner binary not found on host. Please launch using Browser WebAssembly.");
    }

    // Forward offer to runner's local HTTP signaling port with retry backoff
    let res: Response | null = null;
    let lastErr: any = null;
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        res = await fetch(`http://127.0.0.1:${session.port}/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(offer),
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 60 * attempt));
        }
      }
    }

    if (!res || !res.ok) {
      const errDetail = res ? `status ${res.status}: ${await res.text().catch(() => "")}` : (lastErr?.message || "connection refused");
      throw new Error(`Runner signaling error: ${errDetail}`);
    }

    session.status = "active";
    return (await res.json()) as { sdp: string; type: string };
  }

  static async relayCandidate(sessionId: string, candidate: unknown): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session || !getRunnerBinaryPath()) return;

    await fetch(`http://127.0.0.1:${session.port}/candidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    }).catch(() => {});
  }

  static stopSession(sessionId: string): void {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    if (session.process && !session.process.killed) {
      try {
        session.process.kill("SIGTERM");
      } catch {}
    }

    activeSessions.delete(sessionId);
  }

  static stopAll(): void {
    for (const [id] of activeSessions) {
      this.stopSession(id);
    }
  }
}

// Cleanup on exit
process.on("SIGINT", () => StreamRunnerManager.stopAll());
process.on("SIGTERM", () => StreamRunnerManager.stopAll());

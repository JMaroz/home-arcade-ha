import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { dataPath, ensureDir } from "../data-dir";
import { SYSTEM_TO_NATIVE_CORE } from "@shared/core-metadata";
import { storage } from "../storage";
import { SAVE_BACKUP_DIR } from "../routes/shared";
import { uploadToDrive } from "../google-drive";
import { uploadToOneDrive } from "../onedrive";

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
const runnerLogs: string[] = [];

export function appendRunnerLog(msg: string) {
  runnerLogs.push(`[${new Date().toISOString()}] ${msg}`);
  if (runnerLogs.length > 200) runnerLogs.shift();
}

export function getRunnerLogs(): string[] {
  return [...runnerLogs];
}

function getHostIps(): string[] {
  if (process.env.CABINET_HOST_IP) {
    return process.env.CABINET_HOST_IP.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const ips: string[] = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const list = nets[name];
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) {
        const parts = iface.address.split(".").map(Number);
        // Exclude Docker internal bridge IPs (172.16.0.0 - 172.31.255.255)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
          continue;
        }
        // Exclude link-local IPs (169.254.0.0/16)
        if (parts[0] === 169 && parts[1] === 254) {
          continue;
        }
        if (!ips.includes(iface.address)) {
          ips.push(iface.address);
        }
      }
    }
  }
  return ips;
}

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
      } else if (rom.system.toLowerCase() === "ps2") {
        const altCore = coreFilename === "pcsx2_libretro.so" ? "play_libretro.so" : "pcsx2_libretro.so";
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

    let bootRom = rom;
    if (rom.isPlaylist) {
      const children = await storage.resolveM3uDiscs(rom);
      if (children.length === 1) {
        bootRom = children[0];
      } else if (children.length === 0) {
        throw new Error(`M3U playlist "${rom.title}" references missing disc files on disk.`);
      }
    }

    const romPath = path.resolve(bootRom.filePath);
    try {
      await fs.access(romPath);
    } catch {
      throw new Error(`ROM file not found at path: ${romPath}`);
    }

    // If still an M3U playlist (e.g. multi-disc), sanitize CRLF to LF so cores parse filenames cleanly
    if (bootRom.isPlaylist || romPath.toLowerCase().endsWith(".m3u")) {
      try {
        const raw = await fs.readFile(romPath, "utf8");
        if (raw.includes("\r")) {
          await fs.writeFile(romPath, raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
        }
      } catch (err) {
        console.warn(`[native-runner] Could not sanitize M3U line endings in ${romPath}:`, err);
      }
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
      // PS2 emulation is CPU intensive on ARM/SBCs; limit target FPS to 30 to stabilize frame pacing and prevent thermal throttling
      const sysLower = rom.system.toLowerCase();
      const targetFps = sysLower === "ps2" ? 30 : 60;

      const spawnArgs = [
        "--session", sessionId,
        "--port", String(port),
        "--rom", romPath,
        "--core", corePath,
        "--system", rom.system,
        "--fps", String(targetFps),
      ];
      const hostIps = getHostIps();
      if (hostIps.length > 0) {
        spawnArgs.push("--host-ip", hostIps.join(","));
      }

      const child = spawn(
        runnerBin,
        spawnArgs,
        {
          stdio: ["ignore", "pipe", "pipe"],
          detached: false,
        }
      );

      child.stdout?.on("data", (d) => {
        const text = d.toString().trim();
        console.log(`[native-runner:${sessionId.slice(0, 8)}] ${text}`);
        appendRunnerLog(`[${sessionId.slice(0, 8)}] ${text}`);
      });

      child.stderr?.on("data", (d) => {
        const text = d.toString().trim();
        console.error(`[native-runner:${sessionId.slice(0, 8)}] ${text}`);
        appendRunnerLog(`[${sessionId.slice(0, 8)}] ERR: ${text}`);
      });

      child.on("exit", (code) => {
        const text = `exited with code ${code}`;
        console.log(`[native-runner:${sessionId.slice(0, 8)}] ${text}`);
        appendRunnerLog(`[${sessionId.slice(0, 8)}] ${text}`);
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
    offer: { sdp: string; type: string },
    peerId?: string,
    player?: number
  ): Promise<{ sdp: string; type: string }> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const runnerBin = getRunnerBinaryPath();
    if (!runnerBin) {
      throw new Error("Runner binary not found on host. Please launch using Browser WebAssembly.");
    }

    const queryParams = new URLSearchParams();
    if (peerId) queryParams.set("peerId", peerId);
    if (player !== undefined) queryParams.set("player", String(player));
    const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : "";

    // Forward offer to runner's local HTTP signaling port with retry backoff
    let res: Response | null = null;
    let lastErr: any = null;
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        res = await fetch(`http://127.0.0.1:${session.port}/offer${queryStr}`, {
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

  static async relayCandidate(sessionId: string, candidate: unknown, peerId?: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session || !getRunnerBinaryPath()) return;

    const queryStr = peerId ? `?peerId=${encodeURIComponent(peerId)}` : "";
    await fetch(`http://127.0.0.1:${session.port}/candidate${queryStr}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    }).catch(() => {});
  }

  static async getPeers(sessionId: string): Promise<{ count: number; peers: Array<{ id: string; playerSlot: number; state: string }> }> {
    const session = this.getSession(sessionId);
    if (!session || !getRunnerBinaryPath()) {
      return { count: 0, peers: [] };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${session.port}/peers`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        return (await res.json()) as { count: number; peers: Array<{ id: string; playerSlot: number; state: string }> };
      }
    } catch {}
    return { count: 0, peers: [] };
  }

  static joinSession(sessionId: string): { sessionId: string; romId: number; system: string; playerIndex: number } {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status === "stopped" || session.status === "error") {
      throw new Error(`Session ${sessionId} is no longer active`);
    }
    return {
      sessionId,
      romId: session.romId,
      system: session.system,
      playerIndex: 1,
    };
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

  static async saveState(
    sessionId: string,
    slot = 0,
    userId = "default"
  ): Promise<{ ok: boolean; slot: number; size: number }> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const runnerBin = getRunnerBinaryPath();
    if (!runnerBin) {
      const dir = path.join(SAVE_BACKUP_DIR, userId, String(session.romId));
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `slot-${slot}.state`);
      const dummyState = Buffer.from(`MOCK-STATE-ROM-${session.romId}-SLOT-${slot}-${Date.now()}`);
      await fs.writeFile(filePath, dummyState);
      await storage.upsertRomSaveSlot({
        romId: session.romId,
        userId,
        slot,
        label: slot === 0 ? "Quick Save" : `Slot ${slot}`,
        updatedAt: Date.now(),
      });
      return { ok: true, slot, size: dummyState.length };
    }

    const res = await fetch(`http://127.0.0.1:${session.port}/save?slot=${slot}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Runner save error: ${errText || res.statusText}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      throw new Error("Empty save state received from runner");
    }

    const dir = path.join(SAVE_BACKUP_DIR, userId, String(session.romId));
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `slot-${slot}.state`);
    await fs.writeFile(filePath, buf);

    await storage.upsertRomSaveSlot({
      romId: session.romId,
      userId,
      slot,
      label: slot === 0 ? "Quick Save" : `Slot ${slot}`,
      updatedAt: Date.now(),
    });

    const settings = await storage.getIntegrationSettings();
    if (settings.cloudSaveEnabled) {
      const driveFileName = `${userId}_${session.romId}_slot-${slot}.state`;
      uploadToDrive(filePath, driveFileName).catch(() => {});
    }
    if (settings.oneDriveSyncEnabled) {
      const oneDriveFileName = `${userId}_${session.romId}_slot-${slot}.state`;
      uploadToOneDrive(filePath, oneDriveFileName).catch(() => {});
    }

    return { ok: true, slot, size: buf.length };
  }

  static async loadState(
    sessionId: string,
    slot = 0,
    userId = "default"
  ): Promise<{ ok: boolean; slot: number }> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const dir = path.join(SAVE_BACKUP_DIR, userId, String(session.romId));
    const filePath = path.join(dir, `slot-${slot}.state`);

    let buf: Buffer;
    try {
      buf = await fs.readFile(filePath);
    } catch {
      throw new Error(`Nessun salvataggio trovato per lo Slot ${slot}`);
    }

    const runnerBin = getRunnerBinaryPath();
    if (!runnerBin) {
      return { ok: true, slot };
    }

    const res = await fetch(`http://127.0.0.1:${session.port}/load?slot=${slot}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(buf),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Runner load error: ${errText || res.statusText}`);
    }

    return { ok: true, slot };
  }

  static async getSlots(
    sessionId: string,
    userId = "default"
  ): Promise<Array<{ slot: number; label: string; updatedAt: number }>> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const slots = await storage.listRomSaveSlots(session.romId, userId);
    return slots.map((s) => ({
      slot: s.slot,
      label: s.label,
      updatedAt: s.updatedAt,
    }));
  }

  static getDebugInfo() {
    return {
      runnerBin: getRunnerBinaryPath(),
      hostIps: getHostIps(),
      activeSessions: Array.from(activeSessions.values()).map((s) => ({
        sessionId: s.sessionId,
        romId: s.romId,
        system: s.system,
        port: s.port,
        status: s.status,
        hasProcess: !!s.process,
        pid: s.process?.pid ?? null,
        exitCode: s.process?.exitCode ?? null,
        uptimeMs: Date.now() - s.createdAt,
      })),
      logs: getRunnerLogs(),
    };
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

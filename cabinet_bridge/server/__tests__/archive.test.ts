import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import http from "node:http";
import { registerArchiveRoutes } from "../routes/archive";
import { findLibretroBoxArt } from "../routes/scrape";
import { 
  listAllSystemMetas, 
  getDeterministicBoxArtUrl, 
  getSystemCatalogMeta,
  ARCHIVE_PLATFORMS 
} from "../archive-client";

describe("Internet Archive ROM Management & Deterministic Box Art", () => {
  describe("Deterministic Libretro Box Art Resolution", () => {
    it("returns direct canonical Named_Boxarts URL when title has No-Intro region tag", async () => {
      const res = await findLibretroBoxArt("nes", "Super Mario Bros. (USA)");
      expect(res.url).toBe("https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20Bros.%20(USA).png");
      expect(res.message).toContain("Direct canonical Libretro Named_Boxarts match");
    });

    it("handles Europe and World tags deterministically", async () => {
      const res = await findLibretroBoxArt("snes", "Chrono Trigger (Japan)");
      expect(res.url).toBe("https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Chrono%20Trigger%20(Japan).png");
      expect(res.message).toContain("Direct canonical");
    });

    it("generates direct deterministic box art URL via helper", () => {
      const url = getDeterministicBoxArtUrl("nes", "The Legend of Zelda (USA)");
      expect(url).toBe("https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/The%20Legend%20of%20Zelda%20(USA).png");
    });
  });

  describe("Archive Client Catalog & Hardware Gating", () => {
    it("returns supported archive systems with valid metadata", async () => {
      const systems = await listAllSystemMetas();
      expect(systems.length).toBeGreaterThan(0);

      const nes = systems.find(s => s.system === "nes");
      expect(nes).toBeDefined();
      expect(nes?.isFullSetRecommended).toBe(true);
      expect(nes?.hwTier).toBeDefined();

      const ps1 = systems.find(s => s.system === "ps1");
      expect(ps1).toBeDefined();
      // PS1 optical discs should not recommend full sets
      expect(ps1?.isFullSetRecommended).toBe(false);
    });

    it("verifies platform repository configurations", () => {
      expect(ARCHIVE_PLATFORMS["nes"]).toBeDefined();
      expect(ARCHIVE_PLATFORMS["nes"].archiveZipFile).toContain("Nintendo Entertainment System");
      expect(ARCHIVE_PLATFORMS["snes"]).toBeDefined();
      expect(ARCHIVE_PLATFORMS["ps1"]).toBeDefined();
    });
  });

  describe("Archive Endpoints Integration (Native HTTP)", () => {
    let server: Server;
    let port: number;

    beforeAll(async () => {
      const app = express();
      app.use(express.json());
      registerArchiveRoutes(app);
      server = createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const addr = server.address() as { port: number };
      port = addr.port;
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    async function api(method: string, path: string, body?: unknown) {
      return new Promise<{ status: number; body: any }>((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = http.request({
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: payload ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          } : {},
        }, (res) => {
          let raw = "";
          res.on("data", chunk => { raw += chunk; });
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode || 500, body: JSON.parse(raw) });
            } catch {
              resolve({ status: res.statusCode || 500, body: raw });
            }
          });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
      });
    }

    it("GET /api/archive/systems returns list of platforms", async () => {
      const { status, body } = await api("GET", "/api/archive/systems");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((s: any) => s.system === "nes")).toBe(true);
    });

    it("POST /api/archive/download validates required parameters", async () => {
      const { status, body } = await api("POST", "/api/archive/download", {});
      expect(status).toBe(400);
      expect(body.message).toContain("Missing required fields");
    });

    it("GET /api/archive/keys-status returns keys status", async () => {
      const { status, body } = await api("GET", "/api/archive/keys-status");
      expect(status).toBe(200);
      expect(typeof body.hasKeys).toBe("boolean");
      expect(body.archiveSource).toBeDefined();
    });

    it("POST /api/archive/validate-keys validates presence of credentials", async () => {
      const { status, body } = await api("POST", "/api/archive/validate-keys", {
        accessKey: "",
        secretKey: "",
      });
      expect(status).toBe(400);
      expect(body.valid).toBe(false);
      expect(body.message).toContain("Inserisci sia l'Access Key che la Secret Key");
    });

    it("GET /api/archive/downloads returns active download jobs list", async () => {
      const { status, body } = await api("GET", "/api/archive/downloads");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("Platform File Filtering and Curated Sets", () => {
    it("filters files strictly per system so platforms do not bleed into each other", async () => {
      const { isPlatformFile } = await import("../archive-client");
      const emptyExts = new Set<string>();

      // retro-roms-best-set tests
      expect(isPlatformFile("Nintendo - NES.zip", "nes", "retro-roms-best-set", emptyExts)).toBe(true);
      expect(isPlatformFile("Nintendo - SNES.zip", "nes", "retro-roms-best-set", emptyExts)).toBe(false);
      expect(isPlatformFile("Nintendo - NES.zip", "snes", "retro-roms-best-set", emptyExts)).toBe(false);
      expect(isPlatformFile("Nintendo - SNES.zip", "snes", "retro-roms-best-set", emptyExts)).toBe(true);

      // Game Boy discrimination
      expect(isPlatformFile("Nintendo - Game Boy.zip", "gb", "retro-roms-best-set", emptyExts)).toBe(true);
      expect(isPlatformFile("Nintendo - Game Boy Color.zip", "gb", "retro-roms-best-set", emptyExts)).toBe(false);
      expect(isPlatformFile("Nintendo - Game Boy Advance.zip", "gb", "retro-roms-best-set", emptyExts)).toBe(false);
      expect(isPlatformFile("Nintendo - Game Boy Color.zip", "gbc", "retro-roms-best-set", emptyExts)).toBe(true);
      expect(isPlatformFile("Nintendo - Game Boy Advance.zip", "gba", "retro-roms-best-set", emptyExts)).toBe(true);

      // Metadata exclusion
      expect(isPlatformFile("retro-roms-best-set_files.xml", "nes", "retro-roms-best-set", emptyExts)).toBe(false);
      expect(isPlatformFile("retro-roms-best-set_archive.torrent", "nes", "retro-roms-best-set", emptyExts)).toBe(false);
    });
  });
});

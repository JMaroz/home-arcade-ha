import { Express } from "express";
import { storage } from "../storage";
import { 
  getUserFromRequest, SAVE_BACKUP_DIR
} from "./shared";
import { insertUserProfileSchema, insertRomSaveSlotSchema } from "@shared/schema";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import { startGameSession, endGameSession, touchSessionActivity, getActiveSession } from "../gameSession";
import { uploadToDrive, downloadFromDrive } from "../google-drive";

export function registerProfileRoutes(app: Express) {
  app.get("/api/profiles", async (_req, res) => {
    try {
      const profiles = await storage.listProfiles();
      res.json(profiles);
    } catch (err: any) {
      console.error("GET /api/profiles error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.post("/api/profiles", express.json(), async (req, res) => {
    try {
      const parsed = insertUserProfileSchema.safeParse({
        ...req.body,
        createdAt: Date.now(),
      });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const created = await storage.createProfile(parsed.data.name, parsed.data.color || "#8b5cf6");
      res.status(201).json(created);
    } catch (err: any) {
      console.error("POST /api/profiles error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.put("/api/profiles/:id", async (req, res) => {
    res.status(501).json({ message: "Update profile not implemented in storage." });
  });

  app.delete("/api/profiles/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (id === 1) return res.status(400).json({ message: "Default profile cannot be deleted." });
      const deleted = await storage.deleteProfile(id);
      if (!deleted) return res.status(404).json({ message: "Profile not found." });
      res.json({ deleted: true, id });
    } catch (err: any) {
      console.error("DELETE /api/profiles/:id error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.get("/api/profiles/:profileId/controls/:core", async (req, res) => {
    try {
      const profileId = Number(req.params.profileId);
      const core = req.params.core;
      const port = Number(req.query.port ?? 0);
      const coreKey = port === 1 ? `${core}_p2` : core;
      const bindings = await storage.getProfileControlBindings(profileId, coreKey);
      res.json(bindings);
    } catch (err: any) {
      console.error("GET /api/profiles/:profileId/controls/:core error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.put("/api/profiles/:profileId/controls/:core", express.json(), async (req, res) => {
    try {
      const profileId = Number(req.params.profileId);
      const core = req.params.core;
      const port = Number(req.query.port ?? 0);
      const coreKey = port === 1 ? `${core}_p2` : core;
      const bindings = req.body as Record<number, string>;
      await storage.setProfileControlBindings(profileId, coreKey, bindings);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("PUT /api/profiles/:profileId/controls/:core error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.delete("/api/profiles/:profileId/controls/:core", async (req, res) => {
    try {
      const profileId = Number(req.params.profileId);
      const port = Number(req.query.port ?? 0);
      const coreKey = port === 1 ? `${req.params.core}_p2` : req.params.core;
      await storage.setProfileControlBindings(profileId, coreKey, {});
      res.json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /api/profiles/:profileId/controls/:core error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.get("/api/profiles/:profileId/gamepad-bindings/:gamepadId", async (req, res) => {
    try {
      const profileId = Number(req.params.profileId);
      const port = Number(req.query.port ?? 0);
      const gamepadId = port === 1 ? `${req.params.gamepadId}_p2` : req.params.gamepadId;
      const romId = req.query.romId ? Number(req.query.romId) : undefined;
      const bindings = await storage.getGamepadBindings(profileId, gamepadId, romId);
      res.json(bindings);
    } catch (err: any) {
      console.error("GET /api/profiles/:profileId/gamepad-bindings/:gamepadId error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.put("/api/profiles/:profileId/gamepad-bindings/:gamepadId", express.json(), async (req, res) => {
    try {
      const profileId = Number(req.params.profileId);
      const port = Number(req.query.port ?? 0);
      const gamepadId = port === 1 ? `${req.params.gamepadId}_p2` : req.params.gamepadId;
      const romId = req.query.romId ? Number(req.query.romId) : undefined;
      const bindings = req.body;
      if (typeof bindings !== "object" || bindings === null) {
        return res.status(400).json({ message: "bindings must be an object" });
      }
      await storage.setGamepadBindings(profileId, gamepadId, bindings, romId);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("PUT /api/profiles/:profileId/gamepad-bindings/:gamepadId error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.delete("/api/profiles/:profileId/gamepad-bindings/:gamepadId", async (req, res) => {
    try {
      const profileId = Number(req.params.profileId);
      const port = Number(req.query.port ?? 0);
      const gamepadId = port === 1 ? `${req.params.gamepadId}_p2` : req.params.gamepadId;
      await storage.setGamepadBindings(profileId, gamepadId, {});
      res.json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /api/profiles/:profileId/gamepad-bindings/:gamepadId error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.get("/api/roms/:id/save-states/latest", async (req, res) => {
    try {
      const romId = Number(req.params.id);
      const { userId } = getUserFromRequest(req);
      const slots = await storage.listRomSaveSlots(romId, userId);
      if (slots.length === 0) return res.json(null);
      const latest = slots.reduce((prev, curr) => (prev.updatedAt > curr.updatedAt ? prev : curr));
      res.json(latest);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/roms/:id/save-states", async (req, res) => {
    try {
      const romId = Number(req.params.id);
      const rom = await storage.getUploadedRom(romId);
      if (!rom) return res.status(404).json({ message: "Uploaded ROM not found." });

      const { userId } = getUserFromRequest(req);
      const slots = await storage.listRomSaveSlots(romId, userId);
      res.json(slots);
    } catch (err: any) {
      console.error("GET /api/roms/:id/save-states error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.put("/api/roms/:id/save-states/:slot", express.json(), async (req, res) => {
    try {
      const romId = Number(req.params.id);
      const slot = Number(req.params.slot);
      const rom = await storage.getUploadedRom(romId);
      if (!rom) return res.status(404).json({ message: "Uploaded ROM not found." });

      const parsed = z.object({ label: z.string().trim().min(1).max(48).optional() }).safeParse(req.body ?? {});
      if (!Number.isInteger(slot) || slot < 0 || slot > 9 || !parsed.success) {
        return res.status(400).json({ message: "Save slot must be 0-9." });
      }

      const { userId } = getUserFromRequest(req);
      const saveSlot = insertRomSaveSlotSchema.parse({
        romId,
        userId,
        slot,
        label: parsed.data.label || `Slot ${slot}`,
        updatedAt: Date.now(),
        romHash: rom.romHash,
      });
      const saved = await storage.upsertRomSaveSlot(saveSlot);
      res.json(saved);
    } catch (err: any) {
      console.error("PUT /api/roms/:id/save-states/:slot error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.delete("/api/roms/:id/save-states/:slot", async (req, res) => {
    try {
      const romId = Number(req.params.id);
      const slot = Number(req.params.slot);
      const rom = await storage.getUploadedRom(romId);
      if (!rom) return res.status(404).json({ message: "Uploaded ROM not found." });
      if (!Number.isInteger(slot) || slot < 0 || slot > 9) return res.status(400).json({ message: "Save slot must be 0-9." });

      const { userId: delUserId } = getUserFromRequest(req);
      await storage.deleteRomSaveSlot(romId, slot, delUserId);
      res.status(204).end();
    } catch (err: any) {
      console.error("DELETE /api/roms/:id/save-states/:slot error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.get("/api/roms/:id/save-backups", async (req, res) => {
    try {
      const romId = Number(req.params.id);
      const rom = await storage.getUploadedRom(romId);
      if (!rom) return res.status(404).json({ message: "Uploaded ROM not found." });

      const { userId } = getUserFromRequest(req);
      const slots = await storage.listRomSaveSlots(romId, userId);
      res.json({ slots });
    } catch (err: any) {
      console.error("GET /api/roms/:id/save-backups error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.get("/api/roms/:id/save-backup/:slot", async (req, res) => {
    try {
      const romId = Number(req.params.id);
      const slot = req.params.slot; // can be "auto" or a number
      const rom = await storage.getUploadedRom(romId);
      if (!rom) return res.status(404).json({ message: "ROM not found." });

      const { userId } = getUserFromRequest(req);
      const localPath = path.join(SAVE_BACKUP_DIR, userId, String(romId), `slot-${slot}.state`);
      const driveFileName = `${userId}_${romId}_slot-${slot}.state`;

      // Try downloading newer version from cloud if enabled
      const settings = await storage.getIntegrationSettings();
      if (settings.cloudSaveEnabled) {
        try { await downloadFromDrive(driveFileName, localPath); } catch (e) { console.warn("[Cloud] Sync failed:", e); }
      }

      const resolved = path.resolve(localPath);
      if (!resolved.startsWith(path.resolve(SAVE_BACKUP_DIR))) {
        console.warn(`[Profiles] Access denied to path: ${resolved}`);
        return res.status(403).json({ message: "Access denied." });
      }
      res.sendFile(resolved);
    } catch (err: any) {
      console.error("GET /api/roms/:id/save-backup/:slot error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.put("/api/roms/:id/save-backup/:slot", express.raw({ type: "application/octet-stream", limit: "64mb" }), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const slot = req.params.slot;
      const rom = await storage.getUploadedRom(id);
      if (!rom) return res.status(404).json({ message: "ROM not found." });

      const { userId } = getUserFromRequest(req);
      const dir = path.join(SAVE_BACKUP_DIR, userId, String(id));
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `slot-${slot}.state`);

      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        console.warn(`[Profiles] Empty backup payload received for ROM ${id} slot ${slot}`);
        return res.status(400).json({ message: "No data." });
      }
      if (buf.length > 64 * 1024 * 1024) return res.status(413).json({ message: "Backup too large." });
      
      await fs.writeFile(filePath, buf);
      console.log(`[Profiles] Saved backup for ROM ${id} slot ${slot} (${buf.length} bytes)`);

      // Upload to cloud if enabled
      const settings = await storage.getIntegrationSettings();
      if (settings.cloudSaveEnabled) {
        const driveFileName = `${userId}_${id}_slot-${slot}.state`;
        uploadToDrive(filePath, driveFileName).catch(e => console.error("[Cloud] Upload failed:", e));
      }

      res.json({ ok: true, slot, size: buf.length });
    } catch (err: any) {
      console.error("PUT /api/roms/:id/save-backup/:slot error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.put("/api/roms/:id/save-thumb/:slot", express.json(), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const slot = req.params.slot;
      const rom = await storage.getUploadedRom(id);
      if (!rom) return res.status(404).json({ message: "ROM not found." });

      const { userId } = getUserFromRequest(req);
      const { dataUrl } = req.body;
      if (!dataUrl || !dataUrl.startsWith("data:image/jpeg;base64,")) return res.status(400).json({ message: "Invalid thumbnail." });

      const dir = path.join(SAVE_BACKUP_DIR, userId, String(id));
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `slot-${slot}.jpg`);
      
      const base64 = dataUrl.split(",")[1];
      await fs.writeFile(filePath, Buffer.from(base64, "base64"));
      console.log(`[Profiles] Saved thumbnail for ROM ${id} slot ${slot}`);

      // Upload thumbnail to cloud if enabled
      const settings = await storage.getIntegrationSettings();
      if (settings.cloudSaveEnabled) {
        const driveFileName = `${userId}_${id}_slot-${slot}.jpg`;
        uploadToDrive(filePath, driveFileName).catch(e => console.error("[Cloud] Thumb upload failed:", e));
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error("PUT /api/roms/:id/save-thumb/:slot error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.get("/api/roms/:id/save-thumb/:slot", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const slot = req.params.slot;
      const { userId } = getUserFromRequest(req);
      const filePath = path.join(SAVE_BACKUP_DIR, userId, String(id), `slot-${slot}.jpg`);
      try {
        await fs.access(filePath);
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.sendFile(path.resolve(filePath));
      } catch {
        res.status(404).send("Not found");
      }
    } catch (err: any) {
      console.error("GET /api/roms/:id/save-thumb/:slot error:", err);
      res.status(500).json({ message: err.message, stack: err.stack });
    }
  });

  app.post("/api/roms/:id/play-session", express.json(), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { event, durationSeconds } = z.object({
        event: z.enum(["started", "ended", "touch"]),
        durationSeconds: z.number().int().min(0).optional(),
      }).parse(req.body);

      const { userId } = getUserFromRequest(req);
      const profiles = await storage.listProfiles();
      const activeProfile = profiles.find(p => String(p.id) === String(userId)) ?? profiles[0];
      const profileName = activeProfile?.name ?? "Player 1";

      if (event === "started") {
        const result = await startGameSession(id, profileName);
        return res.json(result);
      } else if (event === "ended") {
        const result = await endGameSession(durationSeconds);
        return res.json(result);
      } else {
        touchSessionActivity();
        return res.json({ ok: true });
      }
    } catch (err: any) {
      console.error("POST /api/roms/:id/play-session error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/roms/exit", async (_req, res) => {
    try {
      const result = await endGameSession();
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/roms/exit error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/now-playing", (_req, res) => {
    const session = getActiveSession();
    if (session.romId && session.title) {
      res.json({
        playing: true,
        id: session.romId,
        title: session.title,
        system: session.system,
        startedAt: session.startedAt,
        profileName: session.profileName,
      });
    } else {
      res.json({ playing: false });
    }
  });
}

import type { Express } from "express";
import { StreamRunnerManager } from "../stream/runner-manager";

export function registerStreamRoutes(app: Express) {
  // POST /api/stream/start/:romId
  app.post("/api/stream/start/:romId", async (req, res) => {
    try {
      const romId = Number(req.params.romId);
      if (!romId || Number.isNaN(romId)) {
        return res.status(400).json({ message: "Invalid ROM ID" });
      }

      const { sessionId, port } = await StreamRunnerManager.startSession(romId);
      res.json({
        sessionId,
        port,
        status: "ready",
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
    } catch (err: unknown) {
      console.error("[stream] Failed to start session:", err);
      res.status(500).json({
        message: "Failed to start streaming session",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/stream/signal/:sessionId
  app.post("/api/stream/signal/:sessionId", async (req, res) => {
    try {
      const sessionId = req.params.sessionId;
      const peerId = typeof req.query.peerId === "string" ? req.query.peerId : undefined;
      const player = typeof req.query.player === "string" ? Number(req.query.player) : undefined;
      const { sdp, type } = req.body;
      if (!sdp || !type) {
        return res.status(400).json({ message: "Missing sdp or type in signal request" });
      }

      const answer = await StreamRunnerManager.relaySignal(sessionId, { sdp, type }, peerId, player);
      res.json(answer);
    } catch (err: unknown) {
      console.error(`[stream] Signal error for session ${req.params.sessionId}:`, err);
      res.status(500).json({
        message: "Signaling failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/stream/candidate/:sessionId
  app.post("/api/stream/candidate/:sessionId", async (req, res) => {
    try {
      const sessionId = req.params.sessionId;
      const peerId = typeof req.query.peerId === "string" ? req.query.peerId : undefined;
      await StreamRunnerManager.relayCandidate(sessionId, req.body, peerId);
      res.json({ success: true });
    } catch {
      res.json({ success: false });
    }
  });

  // POST /api/stream/join/:sessionId
  app.post("/api/stream/join/:sessionId", (req, res) => {
    try {
      const info = StreamRunnerManager.joinSession(req.params.sessionId);
      res.json({
        ...info,
        status: "ready",
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
    } catch (err: unknown) {
      res.status(404).json({
        message: "Cannot join session",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/stream/peers/:sessionId
  app.get("/api/stream/peers/:sessionId", async (req, res) => {
    try {
      const peers = await StreamRunnerManager.getPeers(req.params.sessionId);
      res.json(peers);
    } catch (err: unknown) {
      res.status(500).json({
        message: "Failed to retrieve peers",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // GET /api/stream/status/:sessionId
  app.get("/api/stream/status/:sessionId", (req, res) => {
    const session = StreamRunnerManager.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    res.json({
      sessionId: session.sessionId,
      status: session.status,
      createdAt: session.createdAt,
      lastHeartbeat: session.lastHeartbeat,
    });
  });

  // POST /api/stream/stop/:sessionId
  app.post("/api/stream/stop/:sessionId", (req, res) => {
    StreamRunnerManager.stopSession(req.params.sessionId);
    res.json({ success: true });
  });
}


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
      const { sdp, type } = req.body;
      if (!sdp || !type) {
        return res.status(400).json({ message: "Missing sdp or type in signal request" });
      }

      const answer = await StreamRunnerManager.relaySignal(sessionId, { sdp, type });
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
      await StreamRunnerManager.relayCandidate(sessionId, req.body);
      res.json({ success: true });
    } catch {
      res.json({ success: false });
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

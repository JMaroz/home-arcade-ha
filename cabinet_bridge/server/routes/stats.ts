import { Express } from "express";
import { storage } from "../storage";

export function registerStatsRoutes(app: Express) {
  app.get("/api/sessions", async (_req, res) => {
    try {
      const sessions = await storage.listRecentSessions(100);
      const normalized = sessions.map((s: any) => ({
        id: s.id,
        romId: s.romId,
        title: s.romTitle || s.title || "Unknown Game",
        romTitle: s.romTitle || s.title || "Unknown Game",
        system: s.romSystem || s.system || "generic",
        romSystem: s.romSystem || s.system || "generic",
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.durationSeconds,
      }));
      res.json(normalized);
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });


  app.get("/api/stats/summary", async (_req, res) => {
    try {
      const summary = await storage.getPlayStatsSummary();
      const hallOfFame = await storage.getHallOfFame(3);
      const recentSessions = await storage.listRecentSessions(5);
      
      res.json({
        summary,
        hallOfFame,
        recentSessions
      });
    } catch (err) {
      res.status(500).json({ message: String(err) });
    }
  });
}

import { storage } from "./storage";
import { publishGameStarted, publishGameEnded } from "./haPublisher";
import { updateNowPlaying, updateActiveSession } from "./routes/shared";
import { log } from "./log";

export interface ActiveSessionState {
  sessionId: number | null;
  romId: number | null;
  title: string | null;
  system: string | null;
  startedAt: number;
  lastActivity: number;
  profileName: string;
}

let activeSession: ActiveSessionState = {
  sessionId: null,
  romId: null,
  title: null,
  system: null,
  startedAt: 0,
  lastActivity: 0,
  profileName: "Player 1",
};

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Start a new centralized game session */
export async function startGameSession(
  romId: number,
  profileName = "Player 1"
): Promise<{ ok: boolean; sessionId: number | null }> {
  try {
    // If a session is already active, cleanly end it first
    if (activeSession.sessionId) {
      await endGameSession().catch(() => {});
    }

    const rom = await storage.getUploadedRom(romId);
    if (!rom) {
      return { ok: false, sessionId: null };
    }

    const now = Date.now();
    await storage.markUploadedRomPlayed(rom.id).catch(() => {});
    const sessionId = await storage
      .createPlaySession(rom.id, rom.title, rom.system, now)
      .catch(() => null);

    activeSession = {
      sessionId,
      romId: rom.id,
      title: rom.title,
      system: rom.system,
      startedAt: now,
      lastActivity: now,
      profileName,
    };

    updateNowPlaying({
      id: rom.id,
      title: rom.title,
      system: rom.system,
      startedAt: now,
    });
    updateActiveSession(sessionId, now);

    publishGameStarted({
      romId: rom.id,
      title: rom.title,
      system: rom.system,
      profileName,
      playCount: rom.playCount ?? 0,
      genre: rom.genre ?? undefined,
      developer: rom.developer ?? undefined,
      releaseYear: rom.releaseYear ?? undefined,
      artUrl: rom.artUrl ?? undefined,
    }).catch((err) => {
      log(`Failed to publish game start: ${err}`, "ha");
    });

    return { ok: true, sessionId };
  } catch (err) {
    log(`Error starting game session for ROM ${romId}: ${err}`, "session");
    return { ok: false, sessionId: null };
  }
}

/** End the current active game session */
export async function endGameSession(
  explicitDurationSeconds?: number
): Promise<{ ok: boolean; durationSeconds: number }> {
  const current = { ...activeSession };
  if (!current.sessionId && !current.romId) {
    updateNowPlaying(null);
    updateActiveSession(null, 0);
    return { ok: true, durationSeconds: 0 };
  }

  const endedAt = Date.now();
  let durationSeconds = explicitDurationSeconds;
  if (durationSeconds === undefined || durationSeconds < 0) {
    durationSeconds = Math.max(1, Math.round((endedAt - current.startedAt) / 1000));
  }

  // Reset active session state immediately
  activeSession = {
    sessionId: null,
    romId: null,
    title: null,
    system: null,
    startedAt: 0,
    lastActivity: 0,
    profileName: "Player 1",
  };
  updateNowPlaying(null);
  updateActiveSession(null, 0);

  if (current.sessionId) {
    await storage.endPlaySession(current.sessionId, endedAt, durationSeconds).catch(() => {});
  }
  if (current.romId) {
    await storage.incrementRomMinutesPlayed(current.romId, durationSeconds / 60).catch(() => {});
  }

  if (current.romId && current.title && current.system) {
    publishGameEnded({
      romId: current.romId,
      title: current.title,
      system: current.system,
      profileName: current.profileName,
      durationSeconds,
    }).catch((err) => {
      log(`Failed to publish game end: ${err}`, "ha");
    });
  }

  return { ok: true, durationSeconds };
}

/** Keep session alive / touch activity timestamp */
export function touchSessionActivity(): void {
  if (activeSession.sessionId) {
    activeSession.lastActivity = Date.now();
  }
}

/** Check if session timed out due to 30min inactivity */
export async function checkInactivityTimeout(): Promise<void> {
  if (!activeSession.sessionId || activeSession.startedAt === 0) return;
  const idleMs = Date.now() - activeSession.lastActivity;
  if (idleMs >= INACTIVITY_TIMEOUT_MS) {
    log(
      `Session for "${activeSession.title}" timed out after ${Math.round(
        idleMs / 60000
      )}m of inactivity. Finalizing.`,
      "session"
    );
    await endGameSession().catch(() => {});
  }
}

/** Get active session details */
export function getActiveSession(): ActiveSessionState {
  return { ...activeSession };
}

// Background cleanup check every 60 seconds
setInterval(() => {
  checkInactivityTimeout().catch(() => {});
}, 60_000).unref();

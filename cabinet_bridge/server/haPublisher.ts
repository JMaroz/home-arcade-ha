/**
 * haPublisher.ts
 * Pushes HomeArcade game state to Home Assistant as sensor entities.
 *
 * Uses the Supervisor token (available inside the HA add-on) so no manual
 * long-lived token is required. Falls back to the user-configured haToken
 * if SUPERVISOR_TOKEN is not set (e.g. running outside HA for development).
 *
 * Entities published:
 *   sensor.homearcade_game          — title of the current game ("idle" when none)
 *   sensor.homearcade_system        — console/system id (e.g. "nes", "snes")
 *   sensor.homearcade_player        — active profile name
 *   sensor.homearcade_session_start — ISO timestamp when the session started
 *   sensor.homearcade_play_count    — total play count for the current game
 *   binary_sensor.homearcade_active — "on" while a game is running
 */

import { storage } from "./storage";
import { log } from "./log";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GameStartedPayload {
  title: string;
  system: string;
  romId: number;
  profileName: string;
  playCount?: number;
  genre?: string;
  developer?: string;
  releaseYear?: number;
  artUrl?: string;
}

export interface GameEndedPayload {
  romId: number;
  title: string;
  system: string;
  profileName: string;
  durationSeconds: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSupervisorToken(): string | null {
  return process.env.SUPERVISOR_TOKEN ?? process.env.HASSIO_TOKEN ?? null;
}

async function getToken(): Promise<string | null> {
  const supervisorToken = getSupervisorToken();
  if (supervisorToken) return supervisorToken;
  const settings = await storage.getIntegrationSettings();
  return settings.haToken || null;
}

async function getBaseUrl(): Promise<string> {
  // Inside the add-on, always use the Supervisor proxy
  if (getSupervisorToken()) return "http://supervisor/core";
  const settings = await storage.getIntegrationSettings();
  return settings.haBaseUrl || "https://homeassistant.local:8123";
}

async function pushEvent(eventType: string, eventData: Record<string, unknown> = {}): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;

  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/events/${eventType}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    log(`Network error pushing event ${eventType}: ${err instanceof Error ? err.message : String(err)}`, "ha");
    return false;
  }
}

async function pushState(
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): Promise<boolean> {
  const token = await getToken();
  if (!token) {
    log(`No token for ${entityId}`, "ha");
    return false;
  }

  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/states/${entityId}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state, attributes }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log(`Failed to push ${entityId}: ${res.status} ${text.slice(0, 100)}`, "ha");
      return false;
    } else {
      log(`Pushed ${entityId} -> ${state}`, "ha");
      return true;
    }
  } catch (err) {
    log(`Network error pushing ${entityId}: ${err instanceof Error ? err.message : String(err)}`, "ha");
    return false;
  }
}

// ... (GameStartedPayload/GameEndedPayload interfaces)

/** Push all entities when a game starts */
export async function publishGameStarted(payload: GameStartedPayload): Promise<void> {
  const settings = await storage.getIntegrationSettings();
  if (!settings.haPublishEntities) {
    log("Publishing disabled in settings", "ha");
    return;
  }

  log(`Publishing game start: ${payload.title}`, "ha");
  const startedAt = new Date().toISOString();

  await Promise.all([
    pushState("binary_sensor.homearcade_active", "on", {
      friendly_name: "HomeArcade Active",
      device_class: "running",
      game: payload.title,
      system: payload.system.toUpperCase(),
      profile: payload.profileName,
      art_url: payload.artUrl ?? "",
      genre: payload.genre ?? "Unknown",
      developer: payload.developer ?? "Unknown",
      release_year: payload.releaseYear ?? null,
      netplay_nickname: settings.netplayNickname,
      netplay_port: settings.netplayPort,
    }),
    pushState("sensor.homearcade_game", payload.title, {
      friendly_name: "HomeArcade Game",
      icon: "mdi:gamepad-variant",
      rom_id: payload.romId,
      system: payload.system.toUpperCase(),
      system_id: payload.system,
      genre: payload.genre ?? "Unknown",
      developer: payload.developer ?? "Unknown",
      release_year: payload.releaseYear ?? null,
      art_url: payload.artUrl ?? "",
      profile: payload.profileName,
      netplay_nickname: settings.netplayNickname,
      netplay_port: settings.netplayPort,
    }),
    pushState("sensor.homearcade_system", payload.system.toUpperCase(), {
      friendly_name: "HomeArcade System",
      icon: "mdi:controller-classic",
      system_id: payload.system,
    }),
    pushState("sensor.homearcade_player", payload.profileName, {
      friendly_name: "HomeArcade Player",
      icon: "mdi:account-circle",
    }),
    pushState("sensor.homearcade_session_start", startedAt, {
      friendly_name: "HomeArcade Session Start",
      icon: "mdi:clock-start",
      device_class: "timestamp",
    }),
    pushState("sensor.homearcade_play_count", String(payload.playCount ?? 0), {
      friendly_name: "HomeArcade Play Count",
      icon: "mdi:counter",
      unit_of_measurement: "plays",
      state_class: "total_increasing",
    }),
    pushEvent("homearcade_game_started", {
      game: payload.title,
      system: payload.system.toUpperCase(),
      system_id: payload.system,
      rom_id: payload.romId,
      profile: payload.profileName,
      genre: payload.genre ?? "Unknown",
      developer: payload.developer ?? "Unknown",
      release_year: payload.releaseYear ?? null,
      art_url: payload.artUrl ?? "",
    }),
  ]);
}

/** Push all entities when a game ends */
export async function publishGameEnded(payload: GameEndedPayload): Promise<void> {
  const settings = await storage.getIntegrationSettings();
  if (!settings.haPublishEntities) return;

  log(`Publishing game end: ${payload.title}`, "ha");
  await Promise.all([
    pushState("binary_sensor.homearcade_active", "off", {
      friendly_name: "HomeArcade Active",
      device_class: "running",
      last_game: payload.title,
      last_system: payload.system.toUpperCase(),
      last_duration_seconds: payload.durationSeconds,
      last_duration_minutes: Math.round(payload.durationSeconds / 60),
    }),
    pushState("sensor.homearcade_game", "idle", {
      friendly_name: "HomeArcade Game",
      icon: "mdi:gamepad-variant-outline",
      last_game: payload.title,
      last_system: payload.system.toUpperCase(),
      last_duration_seconds: payload.durationSeconds,
      last_duration_minutes: Math.round(payload.durationSeconds / 60),
    }),
    pushState("sensor.homearcade_system", "idle", {
      friendly_name: "HomeArcade System",
      icon: "mdi:controller-classic-outline",
    }),
    pushState("sensor.homearcade_session_start", "unavailable", {
      friendly_name: "HomeArcade Session Start",
      icon: "mdi:clock-start",
    }),
    pushEvent("homearcade_game_ended", {
      game: payload.title,
      system: payload.system.toUpperCase(),
      system_id: payload.system,
      rom_id: payload.romId,
      profile: payload.profileName,
      duration_seconds: payload.durationSeconds,
      duration_minutes: Math.round(payload.durationSeconds / 60),
    }),
  ]);
}

/** Push a one-off test to verify connectivity */
export async function publishTestPing(): Promise<{ ok: boolean; error?: string }> {
  log("Test ping requested", "ha");
  const token = await getToken();
  if (!token) return { ok: false, error: "No token available. Set SUPERVISOR_TOKEN or configure haToken." };

  const success = await pushState("sensor.homearcade_test", "connected", {
    friendly_name: "HomeArcade Test",
    icon: "mdi:check-circle",
    tested_at: new Date().toISOString()
  });

  if (success) {
    log("Test ping successful", "ha");
    return { ok: true };
  } else {
    log("Test ping failed", "ha");
    return { ok: false, error: "Failed to reach Home Assistant. Check URL and Token." };
  }
}

/** Push the 'idle' state for all sensors to ensure discovery in HA */
export async function pushInitialEntities(): Promise<{ ok: boolean; error?: string }> {
  log("Initial entities push requested", "ha");
  const token = await getToken();
  if (!token) return { ok: false, error: "No token available" };

  const results = await Promise.all([
    pushState("binary_sensor.homearcade_active", "off", {
      friendly_name: "HomeArcade Active",
      device_class: "running",
    }),
    pushState("sensor.homearcade_game", "idle", {
      friendly_name: "HomeArcade Game",
      icon: "mdi:gamepad-variant-outline",
    }),
    pushState("sensor.homearcade_system", "idle", {
      friendly_name: "HomeArcade System",
      icon: "mdi:controller-classic-outline",
    }),
    pushState("sensor.homearcade_player", "none", {
      friendly_name: "HomeArcade Player",
      icon: "mdi:account-circle-outline",
    }),
    pushState("sensor.homearcade_session_start", "unavailable", {
      friendly_name: "HomeArcade Session Start",
      icon: "mdi:clock-start",
    }),
    pushState("sensor.homearcade_play_count", "0", {
      friendly_name: "HomeArcade Play Count",
      icon: "mdi:counter",
      unit_of_measurement: "plays",
      state_class: "total_increasing",
    }),
  ]);

  const allOk = results.every(r => r === true);
  if (allOk) {
    log("Initial entities push complete", "ha");
    return { ok: true };
  } else {
    log("Initial entities push partially or fully failed", "ha");
    return { ok: false, error: "Push failed. Check server logs for details." };
  }
}

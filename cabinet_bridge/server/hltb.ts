/**
 * HowLongToBeat integration
 *
 * Wraps the `howlongtobeat` npm package with a SQLite-backed cache so we only
 * hit the HLTB servers once per ROM (refreshed after 7 days or on demand).
 *
 * Negative responses (403, 404, or no matches) are cached for 24 hours to prevent
 * hammering the upstream service and avoid spamming server logs.
 * An in-memory circuit breaker backs off for 15 minutes when HLTB blocks requests (403).
 */

import { createRequire } from 'module';
import { storage } from './storage.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { HowLongToBeatService } = require('howlongtobeat') as any;

const hltbService = new HowLongToBeatService();

/** 7-day TTL for successful cached results */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 24-hour TTL for negative results (no match, blocked, or network failure) */
export const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Circuit breaker cooldown duration (15 minutes) when upstream is blocked or down */
export const CIRCUIT_BREAKER_COOLDOWN_MS = 15 * 60 * 1000;

let circuitBreakerUntil = 0;

export function isHltbCircuitBreakerOpen(): boolean {
  return Date.now() < circuitBreakerUntil;
}

export function tripHltbCircuitBreaker(reason: string) {
  circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  console.warn(`[HLTB] Upstream service unavailable (${reason}). Pausing remote lookups for 15 minutes.`);
}

export function resetHltbCircuitBreakerForTest() {
  circuitBreakerUntil = 0;
}

export interface HltbResult {
  romId: number;
  hltbTitle: string | null;
  /** Minutes for main story, or null if HLTB has no data */
  mainStory: number | null;
  /** Minutes for main story + extras */
  mainExtra: number | null;
  /** Minutes for 100% completion */
  completionist: number | null;
  cachedAt: number;
}

/** Strips release tags like (USA), [T-En], etc. to increase search hit rates */
export function cleanTitleForHltb(title: string): string {
  return title
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/[_]+/g, ' ')
    .trim();
}

/**
 * Returns HLTB times for a ROM, using the SQLite cache when fresh.
 * Pass `forceRefresh = true` to bypass the cache.
 */
export async function getHltbData(
  romId: number,
  title: string,
  forceRefresh = false,
): Promise<HltbResult | null> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await storage.getHltbCache(romId);
    if (cached) {
      const isNegative = !cached.hltbTitle && !cached.mainStory && !cached.mainExtra && !cached.completionist;
      const ttl = isNegative ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
      if (Date.now() - cached.cachedAt < ttl) {
        return cached;
      }
    }
  }

  // If circuit breaker is active, skip remote call
  if (isHltbCircuitBreakerOpen()) {
    return null;
  }

  const query = cleanTitleForHltb(title);
  if (!query) {
    return null;
  }

  // Fetch from HLTB
  try {
    const results = await hltbService.search(query);
    if (!Array.isArray(results) || results.length === 0) {
      const emptyData: HltbResult = {
        romId,
        hltbTitle: null,
        mainStory: null,
        mainExtra: null,
        completionist: null,
        cachedAt: Date.now(),
      };
      await storage.saveHltbCache(emptyData);
      return emptyData;
    }

    const best = results[0];
    const data: HltbResult = {
      romId,
      hltbTitle: best.name ?? null,
      mainStory: best.gameplayMain ? Math.round(best.gameplayMain * 60) : null,
      mainExtra: best.gameplayMainExtra ? Math.round(best.gameplayMainExtra * 60) : null,
      completionist: best.gameplayCompletionist ? Math.round(best.gameplayCompletionist * 60) : null,
      cachedAt: Date.now(),
    };
    await storage.saveHltbCache(data);
    return data;
  } catch (err: any) {
    const is403 = err?.response?.status === 403 || String(err).includes('403');
    if (is403) {
      tripHltbCircuitBreaker('HTTP 403 Forbidden - anti-bot challenge active');
    } else {
      console.warn(`[HLTB] Fetch error for "${query}":`, err?.message || err);
    }

    // Cache negative result so we don't repeat the failing request for this ROM
    const emptyData: HltbResult = {
      romId,
      hltbTitle: null,
      mainStory: null,
      mainExtra: null,
      completionist: null,
      cachedAt: Date.now(),
    };
    try {
      await storage.saveHltbCache(emptyData);
    } catch {}

    return emptyData;
  }
}

/** Formats a minutes value as a human-readable string, e.g. "8½h" or "45m" */
export function formatHltbTime(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  // Round to nearest half-hour for display cleanliness
  return m >= 45 ? `${h + 1}h` : m >= 15 ? `${h}½h` : `${h}h`;
}

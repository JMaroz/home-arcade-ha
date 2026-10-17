import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanTitleForHltb,
  formatHltbTime,
  getHltbData,
  isHltbCircuitBreakerOpen,
  tripHltbCircuitBreaker,
  resetHltbCircuitBreakerForTest,
  CACHE_TTL_MS,
  NEGATIVE_CACHE_TTL_MS,
} from '../hltb';
import { storage } from '../storage';

describe('HLTB Helper Functions', () => {
  describe('cleanTitleForHltb', () => {
    it('removes region and version tags in parentheses', () => {
      expect(cleanTitleForHltb("Disney's Hercules Action Game (USA) (Rerelease)")).toBe("Disney's Hercules Action Game");
      expect(cleanTitleForHltb("Super Mario World (Europe) (En,Fr,De)")).toBe("Super Mario World");
    });

    it('removes translation and dump tags in brackets', () => {
      expect(cleanTitleForHltb("Final Fantasy IV [T-En by J2E v1.0]")).toBe("Final Fantasy IV");
    });

    it('replaces underscores with spaces', () => {
      expect(cleanTitleForHltb("Castlevania_Symphony_of_the_Night")).toBe("Castlevania Symphony of the Night");
    });

    it('trims extra whitespace', () => {
      expect(cleanTitleForHltb("   Crash Bandicoot (USA)   ")).toBe("Crash Bandicoot");
    });
  });

  describe('formatHltbTime', () => {
    it('returns a dash for null, undefined, or zero', () => {
      expect(formatHltbTime(null)).toBe('—');
      expect(formatHltbTime(undefined)).toBe('—');
      expect(formatHltbTime(0)).toBe('—');
    });

    it('formats minutes under 1 hour', () => {
      expect(formatHltbTime(45)).toBe('45m');
      expect(formatHltbTime(15)).toBe('15m');
    });

    it('formats exact hours', () => {
      expect(formatHltbTime(60)).toBe('1h');
      expect(formatHltbTime(120)).toBe('2h');
    });

    it('rounds to half-hour representation', () => {
      expect(formatHltbTime(90)).toBe('1½h');
      expect(formatHltbTime(75)).toBe('1½h'); // 15m remainder
      expect(formatHltbTime(110)).toBe('2h'); // 50m remainder rounded up
    });
  });
});

describe('HLTB Circuit Breaker', () => {
  beforeEach(() => {
    resetHltbCircuitBreakerForTest();
  });

  it('is closed by default', () => {
    expect(isHltbCircuitBreakerOpen()).toBe(false);
  });

  it('opens when tripped', () => {
    tripHltbCircuitBreaker('403 Forbidden test');
    expect(isHltbCircuitBreakerOpen()).toBe(true);
  });

  it('resets cleanly', () => {
    tripHltbCircuitBreaker('403 Forbidden test');
    expect(isHltbCircuitBreakerOpen()).toBe(true);
    resetHltbCircuitBreakerForTest();
    expect(isHltbCircuitBreakerOpen()).toBe(false);
  });
});

describe('getHltbData Caching and Resilience', () => {
  beforeEach(() => {
    resetHltbCircuitBreakerForTest();
    vi.restoreAllMocks();
  });

  it('returns valid cached entry without hitting upstream', async () => {
    const cachedEntry = {
      romId: 101,
      hltbTitle: 'Chrono Trigger',
      mainStory: 1380,
      mainExtra: 1620,
      completionist: 2400,
      cachedAt: Date.now() - 1000,
    };
    vi.spyOn(storage, 'getHltbCache').mockResolvedValue(cachedEntry);

    const result = await getHltbData(101, 'Chrono Trigger');
    expect(result).toEqual(cachedEntry);
  });

  it('respects negative cache entries within NEGATIVE_CACHE_TTL_MS', async () => {
    const negativeEntry = {
      romId: 102,
      hltbTitle: null,
      mainStory: null,
      mainExtra: null,
      completionist: null,
      cachedAt: Date.now() - 1000,
    };
    vi.spyOn(storage, 'getHltbCache').mockResolvedValue(negativeEntry);

    const result = await getHltbData(102, 'Some Obscure Homebrew');
    expect(result).toEqual(negativeEntry);
  });

  it('returns null immediately when circuit breaker is active', async () => {
    vi.spyOn(storage, 'getHltbCache').mockResolvedValue(null);
    tripHltbCircuitBreaker('test');

    const result = await getHltbData(103, 'Hercules');
    expect(result).toBeNull();
  });

  it('handles empty query gracefully', async () => {
    vi.spyOn(storage, 'getHltbCache').mockResolvedValue(null);
    const result = await getHltbData(104, '   (USA)   ');
    expect(result).toBeNull();
  });
});

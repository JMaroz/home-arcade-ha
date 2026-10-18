/**
 * PlayStats — displays system-level play statistics from play_sessions and uploaded_roms.
 * Shows total time, sessions, unique games, average session duration, top systems, top games, and recent sessions.
 */
import React, { useState, useEffect, useCallback } from "react";
import { SYSTEMS } from "@/data/library";
import { apiUrl } from "@/lib/queryClient";
import { Clock, Gamepad2, Trophy, History, RefreshCw, Sparkles, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlaySession {
  id: number;
  romId?: number;
  title?: string;
  romTitle?: string;
  system?: string;
  romSystem?: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
}

interface StatsSummary {
  totalMinutes: number;
  totalGames: number;
  playedGamesCount: number;
  sessionCount: number;
  avgSessionMinutes: number;
  favoriteCount: number;
}

interface SystemStat {
  system: string;
  label: string;
  totalMinutes: number;
  count: number;
}

interface GameStat {
  title: string;
  system: string;
  totalMinutes: number;
  count: number;
}

function formatDuration(minutes: number): string {
  if (minutes < 1 && minutes > 0) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function PlayStats() {
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const [sessionsRes, summaryRes] = await Promise.all([
        fetch(apiUrl("/api/sessions")).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(apiUrl("/api/stats/summary")).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setSessions(Array.isArray(sessionsRes) ? sessionsRes : []);
      if (summaryRes && summaryRes.summary) {
        setSummary(summaryRes.summary);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="size-5 animate-spin mr-2" />
        <span className="font-mono text-xs uppercase tracking-widest">Loading stats…</span>
      </div>
    );
  }

  // Calculate totals
  const totalMinutesFromSessions = sessions.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0) / 60,
    0
  );
  const effectiveTotalMinutes = Math.max(
    totalMinutesFromSessions,
    summary?.totalMinutes ?? 0
  );
  const effectiveSessionCount = Math.max(
    sessions.length,
    summary?.sessionCount ?? 0
  );
  const playedGamesCount = summary?.playedGamesCount ?? 0;
  const avgMinutes =
    effectiveSessionCount > 0
      ? Math.round(effectiveTotalMinutes / effectiveSessionCount)
      : 0;

  // Per-system & Per-game aggregation
  const systemMap = new Map<string, SystemStat>();
  const gameMap = new Map<string, GameStat>();

  for (const s of sessions) {
    const title = s.title || s.romTitle || "Unknown";
    const system = s.system || s.romSystem || "generic";
    const mins = (s.durationSeconds ?? 0) / 60;

    // System
    const existingSys = systemMap.get(system) ?? {
      system,
      label: SYSTEMS.find((sys) => sys.id === system)?.name ?? system.toUpperCase(),
      totalMinutes: 0,
      count: 0,
    };
    existingSys.totalMinutes += mins;
    existingSys.count += 1;
    systemMap.set(system, existingSys);

    // Game
    const key = `${title}::${system}`;
    const existingGame = gameMap.get(key) ?? {
      title,
      system,
      totalMinutes: 0,
      count: 0,
    };
    existingGame.totalMinutes += mins;
    existingGame.count += 1;
    gameMap.set(key, existingGame);
  }

  const topSystems = Array.from(systemMap.values())
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 6);
  const topGames = Array.from(gameMap.values())
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 8);
  const maxSystemMins = topSystems[0]?.totalMinutes || 1;

  // Recent sessions (last 10 with duration)
  const recent = [...sessions]
    .filter((s) => s.durationSeconds !== undefined && s.durationSeconds !== null)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Header controls */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Play Statistics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggregated gameplay metrics, session history, and library engagement.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-sidebar/30 p-4 relative overflow-hidden">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
            <Clock className="size-4" />
          </div>
          <div className="font-display text-2xl sm:text-3xl font-black tracking-tight">
            {formatDuration(effectiveTotalMinutes)}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Total Play Time
          </div>
        </div>

        <div className="rounded-xl border border-border bg-sidebar/30 p-4 relative overflow-hidden">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
            <BarChart2 className="size-4" />
          </div>
          <div className="font-display text-2xl sm:text-3xl font-black tracking-tight">
            {effectiveSessionCount}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Sessions Logged
          </div>
        </div>

        <div className="rounded-xl border border-border bg-sidebar/30 p-4 relative overflow-hidden">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
            <Gamepad2 className="size-4" />
          </div>
          <div className="font-display text-2xl sm:text-3xl font-black tracking-tight">
            {playedGamesCount || gameMap.size}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Games Played
          </div>
        </div>

        <div className="rounded-xl border border-border bg-sidebar/30 p-4 relative overflow-hidden">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
            <Sparkles className="size-4" />
          </div>
          <div className="font-display text-2xl sm:text-3xl font-black tracking-tight">
            {avgMinutes > 0 ? `${avgMinutes}m` : "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Avg Session
          </div>
        </div>
      </div>

      {/* Top Systems */}
      {topSystems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <Trophy className="size-3.5 text-primary" />
            Top Systems
          </div>
          <div className="rounded-xl border border-border bg-sidebar/20 p-4 space-y-3">
            {topSystems.map((stat) => (
              <div key={stat.system} className="flex items-center gap-3">
                <div className="w-24 shrink-0 font-mono text-xs text-right text-foreground font-semibold truncate">
                  {stat.label}
                </div>
                <div className="flex-1 h-4 rounded-full bg-sidebar/60 border border-border/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(4, (stat.totalMinutes / maxSystemMins) * 100))}%` }}
                  />
                </div>
                <div className="w-20 shrink-0 font-mono text-xs text-right text-muted-foreground">
                  {formatDuration(stat.totalMinutes)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Games */}
      {topGames.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <Gamepad2 className="size-3.5 text-primary" />
            Top Games
          </div>
          <div className="rounded-xl border border-border bg-sidebar/20 divide-y divide-border/60 overflow-hidden">
            {topGames.map((stat, i) => (
              <div key={`${stat.title}-${stat.system}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sidebar/30 transition-colors">
                <div className="w-6 shrink-0 font-mono text-xs font-bold text-primary text-center">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs font-semibold truncate text-foreground">{stat.title}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {SYSTEMS.find((s) => s.id === stat.system)?.name ?? stat.system.toUpperCase()}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDuration(stat.totalMinutes)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {recent.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <History className="size-3.5 text-primary" />
            Recent Sessions
          </div>
          <div className="rounded-xl border border-border bg-sidebar/20 divide-y divide-border/60 overflow-hidden">
            {recent.map((s) => {
              const title = s.title || s.romTitle || "Game Session";
              const system = s.system || s.romSystem || "generic";
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-sidebar/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-semibold truncate text-foreground">{title}</div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                      {SYSTEMS.find((sys) => sys.id === system)?.name ?? system.toUpperCase()} · {formatRelative(s.startedAt)}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    {s.durationSeconds ? formatDuration(s.durationSeconds / 60) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {sessions.length === 0 && effectiveTotalMinutes === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Gamepad2 className="size-10 mx-auto mb-3 opacity-30 text-primary" />
          <div className="font-display text-sm font-bold text-foreground">No play sessions logged yet</div>
          <div className="font-mono text-xs mt-1 max-w-sm mx-auto text-muted-foreground">
            Launch any game from your library to start recording play time, console stats, and Home Assistant activity.
          </div>
        </div>
      )}
    </div>
  );
}
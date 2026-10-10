import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GameArt } from "@/components/GameArt";
import { WarpLinkDialog } from "@/components/WarpLinkDialog";
import { NetplayLobbyDialog } from "@/components/NetplayLobbyDialog";
import { SYSTEMS, type Game, gameLaunchEndpoint } from "@/data/library";
import { useIntegration, formatRelative } from "@/lib/integration";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { GameCollectionWithItems, UploadedRom, RomSaveSlot, GameCheatCode } from "@shared/schema";
import { Heart, Play, Clock, Users, Star, Folder, Plus, ChevronDown, ChevronUp, Hash, Loader2, ImagePlus, Trash2, Save, Zap, ToggleLeft, ToggleRight, Database, Check, Wifi, Timer, QrCode, Cpu, Globe } from "lucide-react";
import { Stat, HltbStat, SaveSlotCard, CheatRow } from "@/components/GameDetailSubComponents";

// ── HLTB helpers ──────────────────────────────────────────────────────────────────────────────────

interface HltbData {
  found: boolean;
  hltbTitle?: string | null;
  mainStory?: number | null;
  mainExtra?: number | null;
  completionist?: number | null;
}

/** Converts stored minutes → readable string, e.g. 510 → "8½h", 45 → "45m" */
function formatHltbTime(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return m >= 45 ? `${h + 1}h` : m >= 15 ? `${h}½h` : `${h}h`;
}

export function GameDetailDialog({
  game,
  onClose,
  onToggleFav,
  onRate,
  collections,
  onCreateCollection,
  onToggleCollection,
  onSetStatus,
  profileId = 1,
}: {
  game: Game | null;
  onClose: () => void;
  onToggleFav: (g: Game) => void;
  onRate: (g: Game, rating: number) => void;
  collections: GameCollectionWithItems[];
  onCreateCollection: () => void;
  onToggleCollection: (collectionId: number, game: Game, selected: boolean) => void;
  onSetStatus?: (g: Game, status: string) => void;
  profileId?: number;
}) {
  const { dispatch, config } = useIntegration();
  const { toast } = useToast();
  const [launching, setLaunching] = useState(false);
  const [wheelArtError, setWheelArtError] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [scrapingArt, setScrapingArt] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showWarp, setShowWarp] = useState(false);
  const [netplayOpen, setNetplayOpen] = useState(false);
  useEffect(() => { 
    setVideoPlaying(false); 
    setShowWarp(false); 
    setNetplayOpen(false);
  }, [game?.id]);
  const [selectedRomId, setSelectedRomId] = useState<number | null>(null);
  const [engine, setEngine] = useState<"native" | "wasm">(() => {
    try {
      return (localStorage.getItem("ha_arcade_engine_preference") as "native" | "wasm") || "native";
    } catch {
      return "native";
    }
  });

  const handleSetEngine = (newEngine: "native" | "wasm") => {
    setEngine(newEngine);
    try {
      localStorage.setItem("ha_arcade_engine_preference", newEngine);
    } catch {}
  };

  const { data: raProgress, isLoading: loadingRa } = useQuery({
    queryKey: ["ra-progress", game?.raGameId],
    queryFn: async () => {
      if (!game?.raGameId) return null;
      const res = await fetch(apiUrl(`/api/retroachievements/user-progress/${game.raGameId}`));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!game?.raGameId && !!config.raUsername && !!config.raToken,
  });

  // ── HowLongToBeat ────────────────────────────────────────────────────────────────────────────────
  const { data: hltbData } = useQuery<HltbData>({
    queryKey: ["hltb", game?.romId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/roms/${game!.romId}/hltb`));
      if (!res.ok) return { found: false };
      return res.json();
    },
    enabled: !!game?.romId,
    staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days — matches server cache TTL
  });

  const hasHltb = hltbData?.found && (hltbData.mainStory || hltbData.mainExtra || hltbData.completionist);

  const { data: saveSlots = [], refetch: refetchSlots } = useQuery<RomSaveSlot[]>({
    queryKey: ["save-states", game?.romId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/roms/${game!.romId}/save-states`));
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!game?.romId,
  });

  const latestSave = saveSlots.length > 0 
    ? saveSlots.reduce((prev, curr) => (prev.updatedAt > curr.updatedAt ? prev : curr))
    : null;

  const deleteSlot = async (slot: number) => {
    if (!game?.romId) return;
    await apiRequest("DELETE", `/api/roms/${game.romId}/save-states/${slot}`);
    await refetchSlots();
  };

  const [cheatDesc, setCheatDesc] = useState("");
  const [cheatCode, setCheatCode] = useState("");
  const [addingCheat, setAddingCheat] = useState(false);
  const [fetchingCheats, setFetchingCheats] = useState(false);
  const [fetchedCheats, setFetchedCheats] = useState<{ desc: string; code: string; selected: boolean }[] | null>(null);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);

  const { data: cheats = [], refetch: refetchCheats } = useQuery<GameCheatCode[]>({
    queryKey: ["cheats", game?.romId, profileId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/roms/${game!.romId}/cheats?profileId=${profileId}`));
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!game?.romId,
  });

  const addCheat = async () => {
    if (!game?.romId || !cheatDesc.trim() || !cheatCode.trim()) return;
    setAddingCheat(true);
    try {
      await apiRequest("POST", `/api/roms/${game.romId}/cheats`, {
        description: cheatDesc.trim(),
        code: cheatCode.trim(),
        profileId,
      });
      setCheatDesc("");
      setCheatCode("");
      await refetchCheats();
    } finally {
      setAddingCheat(false);
    }
  };

  const toggleCheat = async (id: number, enabled: boolean) => {
    await apiRequest("PATCH", `/api/cheats/${id}`, { enabled });
    await refetchCheats();
  };

  const deleteCheat = async (id: number) => {
    await apiRequest("DELETE", `/api/cheats/${id}`);
    await refetchCheats();
  };

  const fetchCheatsFromDb = async () => {
    if (!game?.romId) return;
    setFetchingCheats(true);
    setFetchedCheats(null);
    setFetchMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/roms/${game.romId}/fetch-cheats`));
      const data = await res.json() as { cheats: { desc: string; code: string }[]; message?: string };
      if (data.cheats.length === 0) {
        setFetchMsg(data.message ?? "No cheats found.");
      } else {
        setFetchedCheats(data.cheats.map((c) => ({ ...c, selected: false })));
      }
    } catch {
      setFetchMsg("Network error. Check your connection.");
    } finally {
      setFetchingCheats(false);
    }
  };

  const importSelectedCheats = async () => {
    if (!game?.romId || !fetchedCheats) return;
    const selected = fetchedCheats.filter((c) => c.selected);
    for (const c of selected) {
      await apiRequest("POST", `/api/roms/${game.romId}/cheats`, {
        description: c.desc,
        code: c.code,
        profileId,
      });
    }
    await refetchCheats();
    setFetchedCheats(null);
  };

  const refreshArt = useCallback(async () => {
    if (!game?.romId) return;
    setScrapingArt(true);
    try {
      const res = await apiRequest("POST", `/api/roms/${game.romId}/scrape-art`);
      const data = await res.json() as UploadedRom;
      await queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      if (data.artUrl) {
        toast({ title: "Art updated", description: "Cover art fetched successfully." });
      } else {
        toast({ title: "No art found", description: "ScreenScraper couldn't match this title.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Art refresh failed", description: String(err), variant: "destructive" });
    } finally {
      setScrapingArt(false);
    }
  }, [game, toast]);

  if (!game) return null;
  const system = SYSTEMS.find((s) => s.id === game.system);
  const endpoint = gameLaunchEndpoint(game);

  const launch = async () => {
    const romId = selectedRomId || game.romId;
    if (romId) {
      setLaunching(true);
      const returnTo = encodeURIComponent(window.location.href);
      const playerPath = engine === "native" ? `/api/roms/${romId}/stream-player` : `/api/roms/${romId}/player`;
      const playerUrl = apiUrl(`${playerPath}?return=${returnTo}&profile=${profileId}`);
      try {
        const probe = await fetch(playerUrl, { method: "HEAD" });
        if (!probe.ok) {
          const msg =
            probe.status === 404
              ? "This ROM file is missing from the server. It may have been deleted. Try re-uploading it."
              : probe.status === 403
              ? "Access denied. Make sure you are logged into Home Assistant."
              : probe.status >= 500
              ? "The HomeArcade server encountered an error. Try restarting the add-on from Home Assistant."
              : `Launch failed (error ${probe.status}). Try restarting the HomeArcade add-on.`;
          toast({ title: "Couldn't start the game", description: msg, variant: "destructive" });
          setLaunching(false);
          return;
        }
      } catch {
        toast({
          title: "Can't reach HomeArcade",
          description: "The add-on isn't responding. Check that HomeArcade is running in Home Assistant, then try again.",
          variant: "destructive",
        });
        setLaunching(false);
        return;
      }
      onClose();
      window.location.href = playerUrl;
      return;
    }
    void dispatch({
      actionId: `launch_game:${game.id}`,
      label: `Launch ${game.title}`,
      endpoint,
      onSettle: onClose,
    });
  };

  // Community score: ScreenScraper is /20 scale; convert to /10 for display
  const scoreDisplay = game.communityScore != null
    ? `${(game.communityScore / 2).toFixed(1)}/10`
    : null;

  // Genre pills (comma-separated string → array)
  const genrePills = game.genre
    ? game.genre.split(",").map((g) => g.trim()).filter(Boolean)
    : [];

  const showWheelArt = !!game.wheelArtUrl && !wheelArtError;

  // Play time display
  const playTimeDisplay = (() => {
    const m = game.minutesPlayed ?? 0;
    if (!m) return "—";
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
  })();

  // Description: clamp unless expanded
  const descLong = game.description && game.description.length > 220;

  return (
    <Dialog open={!!game} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[92dvh] p-0 overflow-y-auto bg-card border-card-border shadow-2xl"
        data-testid="dialog-game-detail"
      >
        <div className="grid sm:grid-cols-[220px_1fr]">
          {/* Left panel — box art / video preview */}
          <div className="relative sm:h-auto h-48 group">
            {videoPlaying && game.romId ? (
              <div className="absolute inset-0 bg-black flex items-center justify-center">
                <video
                  src={apiUrl(`/api/roms/${game.romId}/video`)}
                  autoPlay
                  controls
                  muted
                  loop
                  className="w-full h-full object-contain"
                  onError={() => setVideoPlaying(false)}
                />
              </div>
            ) : (
              <>
                <div className="absolute inset-0">
                  <GameArt game={game} />
                </div>
                {showWheelArt && (
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-3 px-3 pointer-events-none">
                    <img
                      src={game.wheelArtUrl!}
                      alt={`${game.title} logo`}
                      onError={() => setWheelArtError(true)}
                      className="max-h-14 max-w-full object-contain drop-shadow-lg"
                      style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.7))" }}
                      decoding="async"
                    />
                  </div>
                )}
              </>
            )}
            {/* Hover controls: video toggle + refresh art + deep scan */}
            <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
              {game.romId && game.videoUrl && (
                <button
                  type="button"
                  onClick={() => setVideoPlaying((v) => !v)}
                  className="flex items-center gap-1.5 rounded-md border border-white/20 bg-black/55 backdrop-blur-sm px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider text-white/80 hover:bg-black/75 hover:text-white focus:outline-none"
                  aria-label={videoPlaying ? "Show box art" : "Play video preview"}
                  data-testid="button-video-preview"
                >
                  <Play className="size-3" />
                  {videoPlaying ? "Box art" : "Preview"}
                </button>
              )}
              {game.romId && (
                <button
                  type="button"
                  onClick={refreshArt}
                  disabled={scrapingArt}
                  className="flex items-center gap-1.5 rounded-md border border-white/20 bg-black/55 backdrop-blur-sm px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider text-white/80 hover:bg-black/75 hover:text-white focus:outline-none"
                  aria-label="Refresh cover art"
                  data-testid="button-refresh-art"
                >
                  {scrapingArt ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
                  {scrapingArt ? "Scraping…" : "Refresh art"}
                </button>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="p-5 sm:p-6 flex flex-col gap-4 min-w-0">
            {/* Header */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span>{system?.shortName}</span>
                {game.year > 0 && (
                  <>
                    <span>·</span>
                    <span>{game.year}</span>
                  </>
                )}
              </div>
              <DialogTitle
                className="font-display text-xl font-bold leading-tight"
                data-testid="text-game-title"
              >
                {game.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {game.description || `Details for ${game.title}`}
              </DialogDescription>
              {(game.developer || game.publisher) && (
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex flex-wrap gap-x-3">
                  {game.developer && <span>{game.developer}</span>}
                  {game.developer && game.publisher && <span>·</span>}
                  {game.publisher && <span>{game.publisher}</span>}
                </div>
              )}
              {genrePills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {genrePills.map((g) => (
                    <span
                      key={g}
                      className="inline-flex items-center rounded-full border border-border bg-background/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {/* Description with expand/collapse */}
              {game.description && (
                <div className="pt-1">
                  <p className={`text-sm text-muted-foreground leading-relaxed ${descExpanded ? "" : "line-clamp-3"}`}>
                    {game.description}
                  </p>
                  {descLong && (
                    <button
                      type="button"
                      onClick={() => setDescExpanded((v) => !v)}
                      className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-primary hover:underline focus:outline-none"
                      data-testid="button-expand-desc"
                    >
                      {descExpanded
                        ? <><ChevronUp className="size-3" /> Show less</>
                        : <><ChevronDown className="size-3" /> Show more</>}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <Stat icon={<Star className="size-3.5" />} label="Community" value={scoreDisplay ?? "—"} />
              <Stat icon={<Users className="size-3.5" />} label="Players" value={game.players !== "Uploaded ROM" ? (game.players || "—") : "—"} />
              <Stat icon={<Clock className="size-3.5" />} label="Play time" value={playTimeDisplay} />
              <Stat icon={<Hash className="size-3.5" />} label="Play count" value={game.playCount != null && game.playCount > 0 ? String(game.playCount) : "—"} />
            </div>

            {/* HowLongToBeat row */}
            {hasHltb && (
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Timer className="size-3.5 text-muted-foreground" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    How Long to Beat
                  </span>
                  {hltbData?.hltbTitle && hltbData.hltbTitle !== game.title && (
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground/40 truncate max-w-[120px]" title={hltbData.hltbTitle}>
                      matched: {hltbData.hltbTitle}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <HltbStat label="Main Story" value={formatHltbTime(hltbData?.mainStory)} />
                  <HltbStat label="Main + Extras" value={formatHltbTime(hltbData?.mainExtra)} />
                  <HltbStat label="Completionist" value={formatHltbTime(hltbData?.completionist)} />
                </div>
              </div>
            )}

            {/* Your Rating */}
            <div className="rounded-md border border-border bg-background/50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Your Rating
              </div>
              <div
                className="flex items-center gap-1"
                role="radiogroup"
                aria-label={`Rate ${game.title}`}
                data-testid="group-game-rating"
              >
                {[1, 2, 3, 4, 5].map((rating) => {
                  const selected = game.rating === rating;
                  return (
                    <button
                      key={rating}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Rate ${rating} out of 5`}
                      onClick={() => onRate(game, rating)}
                      className="size-9 rounded-md border border-border bg-background/70 flex items-center justify-center hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      data-testid={`button-rate-${rating}`}
                    >
                      <Star
                        className={`size-4 ${
                          game.rating >= rating ? "fill-primary text-primary" : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  );
                })}
                {game.rating > 0 ? (
                  <button
                    type="button"
                    onClick={() => onRate(game, 0)}
                    className="ml-2 h-9 px-3 rounded-md border border-border bg-background/70 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    data-testid="button-clear-rating"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            {/* RetroAchievements Progress */}
            {raProgress && raProgress.NumAchievements > 0 && (
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    RetroAchievements
                  </div>
                  <div className="font-mono text-[10px] text-primary">
                    {raProgress.NumAwarded} / {raProgress.NumAchievements}
                  </div>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${(raProgress.NumAwarded / raProgress.NumAchievements) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Cheats */}
            {game.romId && (
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="size-3.5 text-muted-foreground" />
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex-1">
                    Cheats
                  </div>
                  {cheats.length > 0 && (
                    <span className="font-mono text-[9px] text-muted-foreground/50 mr-1">
                      {cheats.filter((c) => c.enabled).length}/{cheats.length} active
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setFetchedCheats(null); setFetchMsg(null); void fetchCheatsFromDb(); }}
                    disabled={fetchingCheats}
                    title="Fetch codes from libretro database"
                    className="text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
                  >
                    {fetchingCheats
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <Database className="size-3.5" />}
                  </button>
                </div>
                {/* Fetched cheats panel */}
                {fetchMsg && (
                  <p className="font-mono text-[10px] text-muted-foreground/50 text-center py-1 mb-2">{fetchMsg}</p>
                )}
                {fetchedCheats && fetchedCheats.length > 0 && (
                  <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-primary/70">
                        {fetchedCheats.filter((c) => c.selected).length} of {fetchedCheats.length} selected
                      </span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setFetchedCheats((p) => p?.map((c) => ({ ...c, selected: true })) ?? null)}
                          className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground">All</button>
                        <button type="button" onClick={() => setFetchedCheats((p) => p?.map((c) => ({ ...c, selected: false })) ?? null)}
                          className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground">None</button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
                      {fetchedCheats.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFetchedCheats((p) => p?.map((x, j) => j === i ? { ...x, selected: !x.selected } : x) ?? null)}
                          className={"w-full flex items-start gap-2 rounded px-2 py-1.5 text-left transition-colors " + (c.selected ? "bg-primary/15 text-foreground" : "hover:bg-muted/40 text-muted-foreground")}
                        >
                          <span className={"mt-0.5 size-3.5 shrink-0 rounded border flex items-center justify-center " + (c.selected ? "border-primary bg-primary" : "border-border")}>
                            {c.selected && <Check className="size-2.5 text-primary-foreground" />}
                          </span>
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-medium truncate">{c.desc}</div>
                            <div className="font-mono text-[10px] text-muted-foreground/60 truncate">{c.code}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void importSelectedCheats()}
                      disabled={fetchedCheats.filter((c) => c.selected).length === 0}
                      className="mt-1.5 w-full rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Add {fetchedCheats.filter((c) => c.selected).length} cheat{fetchedCheats.filter((c) => c.selected).length === 1 ? "" : "s"}
                    </button>
                  </div>
                )}
                {/* Add form */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Description"
                    value={cheatDesc}
                    onChange={(e) => setCheatDesc(e.target.value)}
                    className="flex-1 min-w-0 rounded-md border border-border bg-background/70 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="text"
                    placeholder="Code"
                    value={cheatCode}
                    onChange={(e) => setCheatCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") void addCheat(); }}
                    className="w-[90px] shrink-0 rounded-md border border-border bg-background/70 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => void addCheat()}
                    disabled={addingCheat || !cheatDesc.trim() || !cheatCode.trim()}
                    className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {addingCheat ? <Loader2 className="size-3 animate-spin" /> : "+ Add"}
                  </button>
                </div>
                {/* Cheat list */}
                {cheats.length === 0 ? (
                  <p className="font-mono text-[10px] text-muted-foreground/40 text-center py-2">
                    No cheats yet. Add a GameShark or Action Replay code above.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {cheats.map((c) => (
                      <CheatRow
                        key={c.id}
                        cheat={c}
                        onToggle={() => toggleCheat(c.id, !c.enabled)}
                        onDelete={() => deleteCheat(c.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Save States */}
            {saveSlots.length > 0 && (
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Save className="size-3.5 text-muted-foreground" />
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Save States
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {saveSlots.map((s) => (
                    <SaveSlotCard
                      key={s.slot}
                      slot={s}
                      romId={game.romId!}
                      onDelete={() => deleteSlot(s.slot)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Discs (Multi-Disc Set) */}
            {game.isMultiDisc && game.discIds && (
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Discs in this set
                </div>
                <div className="flex flex-wrap gap-2">
                  {game.discIds.map((id, index) => {
                    const isSelected = (selectedRomId || game.romId) === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedRomId(id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          isSelected
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border bg-background/70 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                        data-testid={`button-disc-${index + 1}`}
                      >
                        Disc {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Play Status */}
            {game.romId && onSetStatus ? (
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Play Status
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Play status" data-testid="group-play-status">
                  {([
                    { id: "backlog", label: "Backlog" },
                    { id: "playing", label: "Playing" },
                    { id: "completed", label: "Completed" },
                    { id: "dropped", label: "Dropped" },
                  ] as const).map(({ id, label }) => {
                    const active = (game.playStatus ?? "unset") === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onSetStatus(game, active ? "unset" : id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border bg-background/70 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                        data-testid={`button-status-${id}`}
                      >
                        {label}
                        {active && <span className="text-primary/70">×</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Collections */}
            {game.romId ? (
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Collections
                  </div>
                  <button
                    type="button"
                    onClick={onCreateCollection}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    data-testid="button-dialog-create-collection"
                  >
                    <Plus className="size-3" /> New
                  </button>
                </div>
                {collections.length > 0 ? (
                  <div className="flex flex-wrap gap-2" data-testid="group-game-collections">
                    {collections.map((collection) => {
                      const selected = collection.romIds.includes(game.romId!);
                      return (
                        <button
                          key={collection.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onToggleCollection(collection.id, game, !selected)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            selected
                              ? "border-primary/60 bg-primary/15 text-primary"
                              : "border-border bg-background/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                          data-testid={`button-toggle-collection-${collection.id}`}
                        >
                          <Folder className="size-3" />
                          {collection.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-collections">
                    Create a collection like RPGs, Couch Co-op, or Backlog, then add this game to it.
                  </p>
                )}
              </div>
            ) : null}

            {/* Emulation Engine Selector */}
            {game.romId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 pb-1 border-t border-border/40">
                <span className="text-[11px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Cpu className="size-3 text-primary" /> Engine:
                </span>
                <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSetEngine("native")}
                    className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-colors flex items-center gap-1.5 ${
                      engine === "native"
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-engine-native"
                    title="Runs natively at 60 FPS on Raspberry Pi 5 with WebRTC low-latency streaming"
                  >
                    <Zap className="size-3 fill-current" /> Native (Pi 5)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetEngine("wasm")}
                    className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-colors flex items-center gap-1.5 ${
                      engine === "wasm"
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-engine-wasm"
                    title="Runs inside your client web browser via WebAssembly (EmulatorJS)"
                  >
                    <Globe className="size-3" /> WebAssembly
                  </button>
                </div>
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="lg"
                onClick={launch}
                className="font-mono uppercase tracking-wider gap-2"
                data-testid="button-detail-launch"
              >
                <Play className="size-4 fill-current" />{" "}
                {launching
                  ? "Launching…"
                  : game.romId
                  ? engine === "native"
                    ? "Play (Native Stream)"
                    : "Play (WASM)"
                  : "Launch"}
              </Button>
              {latestSave && (
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={launch}
                  className="font-mono uppercase tracking-wider gap-2 border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary"
                  data-testid="button-detail-resume"
                >
                  <Zap className="size-4 fill-current" /> Resume
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                onClick={() => setShowWarp(true)}
                className="font-mono uppercase tracking-wider gap-2"
                data-testid="button-detail-warp"
              >
                <QrCode className="size-4" /> Warp
              </Button>
              {game.romId && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setNetplayOpen(true)}
                  className="font-mono uppercase tracking-wider gap-2"
                  data-testid="button-detail-netplay"
                >
                  <Wifi className="size-4" /> Netplay
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                onClick={() => onToggleFav(game)}
                data-testid="button-detail-fav"
                aria-pressed={!!game.favorite}
              >
                <Heart
                  className={`size-4 ${
                    game.favorite ? "fill-primary text-primary" : ""
                  }`}
                />
                {game.favorite ? "Favorited" : "Favorite"}
              </Button>
              <Button size="lg" variant="ghost" onClick={onClose} data-testid="button-detail-close">
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      <WarpLinkDialog
        game={showWarp ? game : null}
        slot={latestSave?.slot}
        onClose={() => setShowWarp(false)}
      />
      {game.romId && (
        <NetplayLobbyDialog
          game={game}
          open={netplayOpen}
          profileId={profileId}
          onClose={() => setNetplayOpen(false)}
        />
      )}
    </Dialog>
  );
}

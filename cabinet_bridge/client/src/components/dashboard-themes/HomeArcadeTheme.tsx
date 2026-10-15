import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { uploadedRomToGame, GAMES, SYSTEMS, type Game, type System, type SystemId } from "@/data/library";
import { GameDetailDialog } from "@/components/GameDetailDialog";
import { WelcomeDialog } from "@/components/WelcomeDialog";
import { GameCardSkeleton } from "@/components/GameCardSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/queryClient";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIntegration } from "@/lib/integration";
import { useGameDialogState } from "@/lib/useGameDialogState";
import type { UploadedRom, GameCollectionWithItems, RomSaveSlot, GameCheatCode } from "@shared/schema";
import {
  Play,
  Settings,
  Star,
  ChevronRight,
  Clock,
  Zap,
  Save,
  Trophy,
  History,
  Folder,
  Loader2,
  ImagePlus,
  Database,
  Check,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Timer,
  Info,
  LayoutGrid,
  Camera,
  QrCode,
  Wifi,
  X,
  ChevronDown,
  ChevronUp,
  Gamepad,
  List,
  Search,
  Upload,
  ArrowLeft,
  CloudDownload,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGridNav } from "@/lib/useGridNav";
import Fuse from "fuse.js";
import { useLocation } from "wouter";
import { WarpLinkDialog } from "@/components/WarpLinkDialog";
import { FilterBar, type SortOption, type FilterStatus } from "@/components/FilterBar";
import { ArchiveDownloadDialog } from "@/components/ArchiveDownloadDialog";

// ── sub-components ────────────────────────────────────────────────────────────

/**
 * WarpScanner — QR Code scanner for mobile "Warp" play.
 */
export function WarpScanner({
  onScan,
  onClose
}: {
  onScan: (url: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.isSecureContext) {
      setError("Camera access requires a secure context (HTTPS).");
      return;
    }

    const scanner = new Html5Qrcode("warp-scanner-viewport");
    let mounted = true;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 20,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1.0
          },
          (text) => {
            if (text.includes("/api/roms/") && text.includes("warp=true")) {
              if (mounted) {
                scanner.stop().then(() => {
                  if (mounted) onScan(text);
                }).catch(e => console.error("Stop failed", e));
              }
            }
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Scanner failed", err);
        if (mounted) {
          setError(err?.message || "Failed to access camera.");
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (scanner.isScanning) {
        scanner.stop().catch(e => console.error("Scanner cleanup failed", e));
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="w-full max-w-sm aspect-square relative rounded-3xl overflow-hidden border-2 border-primary shadow-[0_0_50px_rgba(var(--primary),0.3)] bg-neutral-900">
        <div id="warp-scanner-viewport" className="w-full h-full" />
        {error ? (
          <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center p-8 text-center">
            <div className="size-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <X className="size-7 text-destructive" />
            </div>
            <div className="text-sm font-bold text-white mb-2">Scanner Error</div>
            <div className="text-[11px] text-white/50 leading-relaxed mb-6">{error}</div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="rounded-xl border-white/10 hover:bg-white/5">Retry</Button>
          </div>
        ) : (
          <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40" />
        )}
      </div>
      <p className="mt-8 text-white/60 text-xs font-bold uppercase tracking-widest text-center max-w-[240px]">Scan the Warp Link on your PC to continue playing</p>
      <Button onClick={onClose} variant="outline" className="mt-12 w-full max-w-xs h-14 rounded-2xl border-white/10 bg-white/5 font-black uppercase tracking-widest">Cancel Scan</Button>
    </div>
  );
}

export default function HomeArcadeTheme() {
  const { config } = useIntegration();
  const { t } = useTranslation();

  const {
    data: pageData,
    isLoading: isRomsLoading,
    refetch: refetchRoms,
  } = useQuery<{ roms: UploadedRom[]; total: number; hasMore: boolean }>({
    queryKey: ["/api/roms", { excludeChildren: true }],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/roms?exclude_children=true"));
      if (!res.ok) throw new Error("Failed to fetch roms");
      return res.json();
    },
  });

  const allRoms = useMemo(() => pageData?.roms ?? [], [pageData?.roms]);
  const totalGames = pageData?.total ?? allRoms.length;

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  useEffect(() => {
    const handleOpenArchive = () => setArchiveDialogOpen(true);
    window.addEventListener("homearcade:open-archive-download", handleOpenArchive);
    return () => window.removeEventListener("homearcade:open-archive-download", handleOpenArchive);
  }, []);

  const { data: collections = [] } = useQuery<GameCollectionWithItems[]>({ queryKey: ["/api/collections"] });

  const {
    selectedGame: dialogGame,
    openGame,
    closeGame,
    handleToggleFav,
    handleRate,
    handleCreateCollection,
    handleToggleCollection,
    handleSetStatus,
  } = useGameDialogState();

  // ── Portal View State ──────────────────────────────────────────────────────
  const [view, setView] = useState<"portals" | "system">("portals");
  const [activeSystemId, setActiveSystemId] = useState<SystemId | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // ── Sort/Filter State (persisted to localStorage) ──────────────────────────
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const stored = localStorage.getItem("cabinet_sort");
    return (stored as SortOption) || "title";
  });
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(() => {
    const stored = localStorage.getItem("cabinet_filter_status");
    return (stored as FilterStatus) || "all";
  });

  // Persist sort/filter preferences
  useEffect(() => { localStorage.setItem("cabinet_sort", sortBy); }, [sortBy]);
  useEffect(() => { localStorage.setItem("cabinet_filter_status", filterStatus); }, [filterStatus]);
  const [activeGameIdx, setActiveGameIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter games based on current view/system
  const allGames = useMemo(() => {
    const uploaded = allRoms.map(uploadedRomToGame);
    return [...uploaded, ...GAMES];
  }, [allRoms]);

  const [downloadDialogSystem, setDownloadDialogSystem] = useState<string>("nes");

  const openArchiveForSystem = useCallback((sysId: string) => {
    setDownloadDialogSystem(sysId);
    setArchiveDialogOpen(true);
  }, []);

  const sortedSystems = useMemo(() => {
    return [...SYSTEMS].map((system) => {
      const count = allGames.filter((g) => g.system === system.id).length;
      return { ...system, installedCount: count };
    }).sort((a, b) => {
      if (a.installedCount > 0 && b.installedCount === 0) return -1;
      if (a.installedCount === 0 && b.installedCount > 0) return 1;
      if (a.installedCount !== b.installedCount) return b.installedCount - a.installedCount;
      return a.shortName.localeCompare(b.shortName);
    });
  }, [allGames]);

  const filteredGames = useMemo(() => {
    let list = allGames;

    // Filter by active system portal
    if (activeSystemId) {
      list = list.filter(g => g.system === activeSystemId);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const fuse = new Fuse(list, {
        keys: ["title", "system", "genre", "developer", "publisher"],
        threshold: 0.35,
        distance: 100,
      });
      list = fuse.search(searchQuery.trim()).map((r) => r.item);
    }

    // Apply playStatus filter
    if (filterStatus !== "all") {
      list = list.filter(g => {
        const status = (g as any).playStatus ?? "unset";
        return status === filterStatus;
      });
    }

    // Sort: default to A-Z within portals, Recent in global (only when not searching/filtering)
    const effectiveSort = searchQuery || filterStatus !== "all" ? sortBy : (activeSystemId ? "title" : "lastPlayed");

    return [...list].sort((a, b) => {
      switch (effectiveSort) {
        case "title": return a.title.localeCompare(b.title);
        case "year": return (a.year || 0) - (b.year || 0);
        case "rating": return (b.rating || 0) - (a.rating || 0);
        case "playCount": return (b.minutesPlayed ?? 0) - (a.minutesPlayed ?? 0);
        case "lastPlayed":
        default: return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
      }
    });
  }, [allGames, activeSystemId, searchQuery, sortBy, filterStatus]);

  const activeGame = filteredGames[activeGameIdx];

  // Windowed rendering for large libraries to prevent DOM/image overload
  const BATCH_SIZE = 48;
  const [displayLimit, setDisplayLimit] = useState(BATCH_SIZE);

  useEffect(() => {
    setDisplayLimit(BATCH_SIZE);
  }, [activeSystemId, searchQuery, sortBy, filterStatus, view]);

  // Expand batch if keyboard navigation reaches near current limit
  useEffect(() => {
    if (activeGameIdx >= displayLimit - 12 && displayLimit < filteredGames.length) {
      setDisplayLimit((prev) => Math.min(filteredGames.length, prev + BATCH_SIZE));
    }
  }, [activeGameIdx, displayLimit, filteredGames.length]);

  const displayedGames = useMemo(() => {
    return filteredGames.slice(0, displayLimit);
  }, [filteredGames, displayLimit]);

  // Debounced active game for background fanart to avoid heavy blur thrashing on rapid focus change
  const [bgGame, setBgGame] = useState<Game | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setBgGame(activeGame ?? null);
    }, 150);
    return () => clearTimeout(timer);
  }, [activeGame]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + clientHeight) < 500) {
      setDisplayLimit((prev) => (prev < filteredGames.length ? Math.min(filteredGames.length, prev + BATCH_SIZE) : prev));
    }
  }, [filteredGames.length]);

  // Grid Navigation
  const gridRef = useRef<HTMLDivElement>(null);
  const { focusedIndex, setFocusedIndex } = useGridNav({
    count: view === "system" || searchQuery ? filteredGames.length : sortedSystems.length,
    gridRef,
    disabled: !!dialogGame,
    mapping: config.uiGamepadMapping,
    onActivate: (idx) => {
      if (view === "portals" && !searchQuery) {
        const sys = sortedSystems[idx];
        if (sys) {
          setActiveSystemId(sys.id as SystemId);
          setView("system");
          setActiveGameIdx(0);
        }
      } else {
        const game = filteredGames[idx];
        if (game) openGame(game);
      }
    },
    onFocusChange: (idx) => {
      if (idx >= 0 && (view === "system" || searchQuery)) setActiveGameIdx(idx);
    },
    onFav: () => {},
  });

  // Sync manual mouse selection back to grid nav focus
  useEffect(() => {
    if (activeGameIdx !== focusedIndex) setFocusedIndex(activeGameIdx);
  }, [activeGameIdx, focusedIndex, setFocusedIndex]);

  // Handle system switching via portal clicks
  const enterPortal = (sysId: SystemId) => {
    setActiveSystemId(sysId);
    setView("system");
    setSearchQuery("");
    setActiveGameIdx(0);
    setFocusedIndex(0);
  };

  const backToPortals = () => {
    setView("portals");
    setActiveSystemId(null);
    setSearchQuery("");
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0c] text-white select-none overflow-hidden font-sans relative">
      
      {/* Background Fanart (Debounced & Lightweight) */}
      {(view === "system" || searchQuery) && bgGame && (
        <div key={bgGame.id} className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-300">
          {bgGame.artUrl ? (
            <img
              src={apiUrl(bgGame.romId ? `/api/roms/${bgGame.romId}/art` : `/api/art?url=${encodeURIComponent(bgGame.artUrl)}`)}
              className="w-full h-full object-cover opacity-15 blur-md scale-105 will-change-transform"
              alt=""
              decoding="async"
            />
          ) : (
            <div className="w-full h-full opacity-10" style={{ background: `radial-gradient(circle at center, hsl(${bgGame.art[0]}), #000 80%)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c] via-transparent to-[#0c0c0c]/90" />
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        
        {/* Header / Search */}
        <header className="shrink-0 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {view === "system" && !searchQuery && (
                <Button variant="ghost" size="icon" onClick={backToPortals} className="rounded-full bg-white/5 hover:bg-white/10 text-white/60">
                  <ArrowLeft className="size-5" />
                </Button>
              )}
              <h1 className="font-display text-2xl font-black tracking-tight flex items-center gap-2">
                {searchQuery ? "Search Results" : view === "system" ? SYSTEMS.find(s => s.id === activeSystemId)?.name : "Game Library"}
                <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em] ml-2">
                  {view === "portals" && !searchQuery ? `${totalGames} Titles` : `${filteredGames.length} / ${totalGames} Titles`}
                </span>
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative group hidden sm:block">
                <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" />
                <Input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search titles..."
                  className="w-48 md:w-64 h-9 pl-9 bg-white/5 border-white/5 rounded-full text-xs font-medium focus:ring-primary/40 focus:border-primary/40 group-hover:bg-white/10 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Filter / Sort Toolbar */}
          {(view === "system" || searchQuery) && (
            <FilterBar
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterStatus={filterStatus}
              onFilterChange={setFilterStatus}
              totalGames={filteredGames.length}
            />
          )}
        </header>

        <main ref={gridRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 pb-24 scrollbar-none overscroll-contain">
          <AnimatePresence mode="wait">
            
            {/* 1. PORTALS VIEW (Default Landing) */}
            {view === "portals" && !searchQuery && (
              <motion.div key="portals" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.4, ease: "easeOut" }}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
              >
                {sortedSystems.map((system) => {
                  const count = system.installedCount;
                  return (
                    <motion.div key={system.id} whileHover={{ scale: 1.02, y: -4 }} whileTap={{ scale: 0.98 }} onClick={() => enterPortal(system.id as SystemId)}
                      className="group relative aspect-[16/11] rounded-3xl overflow-hidden border border-white/5 text-left transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] cursor-pointer"
                      style={{ background: `linear-gradient(135deg, hsl(${system.art[0]}) 0%, hsl(${system.art[1]}) 100%)` }}
                    >
                      {system.image && (
                        <img src={system.image.url} alt="" loading="lazy" decoding="async" className="absolute -right-4 -bottom-4 h-4/5 object-contain opacity-40 group-hover:scale-110 group-hover:opacity-70 transition-all duration-700 pointer-events-none" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute inset-0 p-5 flex flex-col justify-between">
                        <div className="font-black text-xs text-white/40 tracking-[0.2em]">{system.mono}</div>
                        <div>
                          <div className="font-display text-lg font-black uppercase leading-tight text-white drop-shadow-lg">{system.shortName}</div>
                          <div className="text-[10px] font-mono uppercase tracking-widest mt-1 font-bold flex items-center gap-1.5 text-white/70">
                            <span className={count > 0 ? "text-emerald-400 font-bold" : "text-white/40"}>
                              {count} {count === 1 ? "Game" : "Games"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-0 rounded-3xl border-2 border-white/0 group-hover:border-white/20 transition-colors pointer-events-none" />
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* 2. GAME GRID VIEW (Drill-down or Search) */}
            {(view === "system" || searchQuery) && (
              <motion.div key="grid" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}
                className="grid gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8"
              >
                {view === "system" && activeSystemId && (
                  <div className="col-span-full mb-3 p-4 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white">{SYSTEMS.find(s => s.id === activeSystemId)?.name}</span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">({filteredGames.length} installati)</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sfoglia i titoli installati o scarica nuove ROM per questa console direttamente da Internet Archive.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openArchiveForSystem(activeSystemId)}
                      className="gap-2 font-bold text-xs rounded-xl shadow-lg shadow-primary/20"
                    >
                      <CloudDownload className="size-4" />
                      Scarica ROM per {SYSTEMS.find(s => s.id === activeSystemId)?.shortName}
                    </Button>
                  </div>
                )}

                {isRomsLoading ? (
                  <GameCardSkeleton count={18} />
                ) : filteredGames.length === 0 ? (
                  <div className="col-span-full py-16 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="size-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <CloudDownload className="size-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-display text-lg font-black uppercase text-foreground">
                        {searchQuery ? "Nessun gioco trovato" : `Nessun gioco per ${SYSTEMS.find(s => s.id === activeSystemId)?.name}`}
                      </h3>
                      <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                        {searchQuery
                          ? "Nessun titolo corrisponde alla tua ricerca."
                          : "Non hai ancora giochi installati per questa console. Clicca sul pulsante in basso per scaricare singoli giochi o l'intera collezione."}
                      </p>
                    </div>
                    {activeSystemId && !searchQuery ? (
                      <Button
                        onClick={() => openArchiveForSystem(activeSystemId)}
                        className="gap-2 text-xs font-bold uppercase rounded-xl px-5 py-2.5 shadow-lg shadow-primary/20"
                      >
                        <CloudDownload className="size-4" /> Scarica ROM per {SYSTEMS.find(s => s.id === activeSystemId)?.shortName}
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => setSearchQuery("")} className="mt-2 text-xs">
                        Pulisci Ricerca
                      </Button>
                    )}
                  </div>
                ) : (
                  displayedGames.map((game, i) => {
                    const isActive = i === activeGameIdx;
                    return (
                      <div
                        key={game.id}
                        data-testid={`card-game-${game.id}`}
                        onClick={() => openGame(game)}
                        className={`relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer group transition-transform duration-150 will-change-transform hover:scale-105 ${
                          isActive
                            ? "scale-105 ring-2 ring-primary shadow-[0_0_30px_rgba(var(--primary),0.25)] z-10"
                            : "ring-1 ring-white/10 hover:ring-white/25"
                        }`}
                      >
                        <div className="absolute inset-0 bg-neutral-900/50 flex items-center justify-center">
                          {game.artUrl ? (
                            <img
                              src={apiUrl(game.romId ? `/api/roms/${game.romId}/art` : `/api/art?url=${encodeURIComponent(game.artUrl)}`)}
                              className="w-full h-full object-cover"
                              alt=""
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="text-[10px] font-black uppercase text-white/20 px-2 text-center leading-tight">
                              {game.title}
                            </span>
                          )}
                        </div>
                        {isActive && (
                          <div className="absolute inset-0 ring-2 ring-primary rounded-xl pointer-events-none animate-pulse" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}

            {/* Library Counter / Load More */}
            {(view === "system" || searchQuery) && (
              <div className="flex flex-col items-center pt-6 pb-4 gap-2">
                <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
                  Showing {displayedGames.length} of {filteredGames.length} games
                </span>
                {displayedGames.length < filteredGames.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDisplayLimit((prev) => Math.min(filteredGames.length, prev + BATCH_SIZE))}
                    className="text-xs text-white/40 hover:text-white hover:bg-white/5 rounded-full px-4"
                  >
                    Load More ({filteredGames.length - displayedGames.length} remaining)
                  </Button>
                )}
              </div>
            )}
          </AnimatePresence>

          <GameDetailDialog
            game={dialogGame}
            onClose={closeGame}
            onToggleFav={handleToggleFav}
            onRate={handleRate}
            collections={collections}
            onCreateCollection={handleCreateCollection}
            onToggleCollection={handleToggleCollection}
            onSetStatus={handleSetStatus}
          />
        </main>
      </div>

      <WelcomeDialog hasRoms={allRoms.length > 0} />

      <ArchiveDownloadDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        initialSystem={downloadDialogSystem}
        onDownloadComplete={() => {
          void refetchRoms();
        }}
      />
    </div>
  );
}

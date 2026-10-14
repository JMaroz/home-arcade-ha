import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  CloudDownload, 
  Search, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  HardDrive, 
  Cpu, 
  ShieldAlert, 
  Trash2, 
  Download,
  FolderOpen
} from "lucide-react";
import { SYSTEMS } from "@/data/library";

interface ArchivePlatformMeta {
  system: string;
  name: string;
  fullSetName: string;
  fullSetSize: number;
  fullSetDownloadUrl: string;
  itemIdentifier: string;
  totalGames: number;
  hwTier: string;
  hwBadge: "optimal" | "playable" | "heavy";
  hwNotice?: string;
  biosStatus: "ok" | "missing" | "not_required";
  missingBiosFiles?: string[];
  isFullSetRecommended: boolean;
}

interface ArchiveGameItem {
  id: string;
  fileName: string;
  title: string;
  system: string;
  size: number;
  downloadUrl: string;
  artUrl: string;
  region: string;
}

interface DownloadJob {
  id: string;
  system: string;
  title: string;
  fileName: string;
  status: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(0)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(0)} KB`;
  return `${bytes} B`;
}

export interface ArchiveDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSystem?: string;
  onDownloadComplete?: () => void;
}

export function ArchiveDownloadDialog({
  open,
  onOpenChange,
  initialSystem = "nes",
  onDownloadComplete,
}: ArchiveDownloadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSystem, setSelectedSystem] = useState(initialSystem);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch available systems overview
  const { data: systems = [], isLoading: loadingSystems } = useQuery<ArchivePlatformMeta[]>({
    queryKey: ["/api/archive/systems"],
    enabled: open,
  });

  // Fetch games for selected system
  const { data: games = [], isLoading: loadingGames, error: gamesError } = useQuery<ArchiveGameItem[]>({
    queryKey: ["/api/archive/catalog", selectedSystem],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/archive/catalog?system=${selectedSystem}`));
      if (!res.ok) throw new Error("Impossibile caricare il catalogo per questo sistema");
      return res.json();
    },
    enabled: open && Boolean(selectedSystem),
  });

  // Track active downloads
  const { data: downloadJobs = [] } = useQuery<DownloadJob[]>({
    queryKey: ["/api/archive/downloads"],
    enabled: open,
    refetchInterval: open ? 1500 : false,
  });

  // Trigger callback when any download completes
  const prevCompletedCount = React.useRef(0);
  React.useEffect(() => {
    const completedCount = downloadJobs.filter(j => j.status === "completed").length;
    if (completedCount > prevCompletedCount.current) {
      onDownloadComplete?.();
    }
    prevCompletedCount.current = completedCount;
  }, [downloadJobs, onDownloadComplete]);

  const activeMeta = systems.find((s) => s.system === selectedSystem);

  const handleDownloadSingle = async (game: ArchiveGameItem) => {
    setDownloadingId(game.id);
    try {
      const res = await apiRequest("POST", "/api/archive/download", {
        system: game.system,
        title: game.title,
        fileName: game.fileName,
        downloadUrl: game.downloadUrl,
        expectedSize: game.size,
        isFullSet: false,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Download non avviato");
      }
      toast({
        title: "Download Avviato",
        description: `Download in corso per "${game.title}". Verrà indicizzato automaticamente.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/archive/downloads"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/vault/storage-snapshot"] });
    } catch (err: any) {
      toast({
        title: "Errore Download",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadFullSet = async () => {
    if (!activeMeta?.fullSetDownloadUrl) return;
    if (!confirm(`Sei sicuro di voler scaricare l'intera libreria per ${activeMeta.name} (${fmtBytes(activeMeta.fullSetSize)})?`)) return;

    try {
      const res = await apiRequest("POST", "/api/archive/download", {
        system: activeMeta.system,
        title: `Collezione Completa ${activeMeta.name}`,
        fileName: activeMeta.fullSetName,
        downloadUrl: activeMeta.fullSetDownloadUrl,
        expectedSize: activeMeta.fullSetSize,
        isFullSet: true,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Download collezione non avviato");
      }
      toast({
        title: "Download Collezione Avviato",
        description: `Download e unzipping in corso per ${activeMeta.name}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/archive/downloads"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/vault/storage-snapshot"] });
    } catch (err: any) {
      toast({
        title: "Errore Download Collezione",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const filteredGames = games.filter((g) =>
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6 bg-[#0f0f14] border-white/10 shadow-2xl text-foreground">
        <DialogHeader className="shrink-0 space-y-1 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2 text-primary font-mono text-[10px] uppercase tracking-widest">
            <CloudDownload className="size-3.5" />
            Internet Archive Game Downloader
          </div>
          <DialogTitle className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            Scarica Giochi Direttamente nella Libreria
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sfoglia collezioni No-Intro 1G1R verificate. I giochi scaricati vengono salvati nella cartella predefinita con copertina istantanea.
          </DialogDescription>
        </DialogHeader>

        {/* Platform Selector Tabs */}
        <div className="py-2 shrink-0 overflow-x-auto flex gap-1.5 scrollbar-none border-b border-white/5">
          {systems.map((s) => (
            <button
              key={s.system}
              onClick={() => setSelectedSystem(s.system)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedSystem === s.system
                  ? "bg-primary text-black font-bold shadow-md shadow-primary/20"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{s.name}</span>
              {s.hwBadge === "optimal" ? (
                <span className="size-1.5 rounded-full bg-emerald-400" />
              ) : s.hwBadge === "playable" ? (
                <span className="size-1.5 rounded-full bg-amber-400" />
              ) : (
                <span className="size-1.5 rounded-full bg-rose-400" />
              )}
            </button>
          ))}
        </div>

        {/* Platform Details Header Banner */}
        {activeMeta && (
          <div className="my-2 p-3 rounded-xl border border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{activeMeta.name}</span>
                {activeMeta.biosStatus === "missing" ? (
                  <Badge variant="destructive" className="text-[10px] gap-1 font-mono">
                    <ShieldAlert className="size-3" /> BIOS Richiesto ({activeMeta.missingBiosFiles?.join(", ")})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 font-mono">
                    BIOS OK
                  </Badge>
                )}
                {activeMeta.hwBadge === "optimal" && (
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 font-mono">
                    HW Ottimale (60 FPS)
                  </Badge>
                )}
                {activeMeta.hwNotice && (
                  <span className="text-[10px] text-amber-300 font-mono">⚠️ {activeMeta.hwNotice}</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Item Archive: <code className="font-mono text-[10px]">{activeMeta.itemIdentifier}</code>
              </p>
            </div>

            {activeMeta.isFullSetRecommended && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadFullSet}
                className="gap-2 text-xs border-primary/30 text-primary hover:bg-primary/10"
              >
                <Download className="size-3.5" />
                Scarica Tutta la Console ({fmtBytes(activeMeta.fullSetSize)})
              </Button>
            )}
          </div>
        )}

        {/* Active Downloads Status Banner (if any) */}
        {downloadJobs.filter(j => j.status === "downloading" || j.status === "extracting" || j.status === "indexing").length > 0 && (
          <div className="my-1 p-2.5 rounded-lg border border-primary/30 bg-primary/5 space-y-1.5 shrink-0">
            {downloadJobs
              .filter(j => j.status === "downloading" || j.status === "extracting" || j.status === "indexing")
              .map(j => (
                <div key={j.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="truncate max-w-[280px] text-white flex items-center gap-1.5">
                      <Loader2 className="size-3 animate-spin text-primary" />
                      {j.title} ({j.status})
                    </span>
                    <span className="text-primary font-bold">{j.progress}%</span>
                  </div>
                  <Progress value={j.progress} className="h-1.5 bg-white/10" />
                </div>
              ))}
          </div>
        )}

        {/* Search Input */}
        <div className="relative my-1 shrink-0">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Cerca tra i giochi disponibili per ${activeMeta?.name ?? selectedSystem}...`}
            className="pl-9 bg-white/5 border-white/10 text-xs font-sans h-9 text-white placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Game List Area */}
        <div className="flex-1 min-h-0 pt-1">
          {loadingGames ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span className="text-xs font-mono">Interrogazione catalogo Internet Archive...</span>
            </div>
          ) : gamesError ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-rose-400">
              <AlertCircle className="size-6" />
              <span className="text-xs">Errore nel caricamento dei metadati dal repository.</span>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <FolderOpen className="size-6 opacity-40" />
              <span className="text-xs">Nessun gioco trovato per questa ricerca.</span>
            </div>
          ) : (
            <ScrollArea className="h-[360px] pr-2">
              <div className="space-y-1">
                {filteredGames.map((game) => (
                  <div
                    key={game.id}
                    className="p-2.5 rounded-lg border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] transition-colors flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">{game.title}</span>
                        <Badge variant="secondary" className="font-mono text-[9px] uppercase px-1 py-0 h-4">
                          {game.region}
                        </Badge>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
                        {game.fileName} • {fmtBytes(game.size)}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDownloadSingle(game)}
                      disabled={downloadingId === game.id}
                      className="gap-1.5 text-xs shrink-0 font-medium h-7"
                    >
                      {downloadingId === game.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <CloudDownload className="size-3 text-primary" />
                      )}
                      Scarica
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from "react";
import { useIntegration } from "@/lib/integration";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CloudDownload,
  FolderOpen,
  HardDrive,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Server,
  Layers,
  Sparkles,
  Key,
  Globe,
  Database,
  UploadCloud,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { DirectoryPickerDialog } from "@/components/DirectoryPickerDialog";
import { ArchiveDownloadDialog } from "@/components/ArchiveDownloadDialog";
import { RomUpload } from "@/components/RomUpload";
import { SYSTEMS } from "@/data/library";
import type { StorageSnapshot } from "@shared/schema";

function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(0)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(0)} KB`;
  return `${bytes} B`;
}

function systemLabel(slug: string): string {
  const found = SYSTEMS.find((s) => s.id === slug);
  return found?.shortName ?? slug.toUpperCase();
}

export function GamesStorageSettings() {
  const { config, setConfig, saveStatus } = useIntegration();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dirPickerOpen, setDirPickerOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [showManualUpload, setShowManualUpload] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [deletingSystem, setDeletingSystem] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isValidatingKeys, setIsValidatingKeys] = useState(false);

  const [analyzingCuration, setAnalyzingCuration] = useState(false);
  const [curationReport, setCurationReport] = useState<any | null>(null);
  const [isDeduplicating, setIsDeduplicating] = useState(false);

  const [isScraping, setIsScraping] = useState(false);

  const handleScrapeAll = async () => {
    setIsScraping(true);
    try {
      const res = await apiRequest("POST", "/api/roms/scrape-all");
      const data = await res.json().catch(() => ({}));
      toast({
        title: "Aggiornamento Completato",
        description: data.message || "Tutti i metadati e le copertine sono stati aggiornati.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      void refetchStorage();
    } catch (err: any) {
      toast({ title: "Errore Scansione", description: err.message, variant: "destructive" });
    } finally {
      setIsScraping(false);
    }
  };

  const handleScrapeMissing = async () => {
    setIsScraping(true);
    try {
      const res = await apiRequest("POST", "/api/roms/scrape-missing");
      const data = await res.json().catch(() => ({}));
      toast({
        title: "Recupero Completato",
        description: data.message || "Recupero metadati e copertine mancanti completato.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      void refetchStorage();
    } catch (err: any) {
      toast({ title: "Errore Scansione", description: err.message, variant: "destructive" });
    } finally {
      setIsScraping(false);
    }
  };

  const handleRunCurationAnalysis = async () => {
    setAnalyzingCuration(true);
    try {
      const res = await apiRequest("GET", "/api/vault/curation-analysis");
      const data = await res.json();
      setCurationReport(data);
      toast({
        title: "Analisi Curation Completata",
        description: `Trovati ${data.duplicateGroupCount} gruppi di duplicati e ${data.redundantRomsCount} ROM ridondanti.`,
      });
    } catch (err: any) {
      toast({ title: "Errore Analisi", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzingCuration(false);
    }
  };

  const handleExecuteDeduplication = async () => {
    if (!confirm(`Vuoi procedere con l'eliminazione automatica 1G1R dei duplicati ridondanti? Verrà conservata la versione migliore per lingua (${config.language?.toUpperCase() ?? "EN"}).`)) {
      return;
    }
    setIsDeduplicating(true);
    try {
      const res = await apiRequest("POST", "/api/vault/deduplicate");
      const data = await res.json();
      toast({
        title: "Deduplicazione Completata",
        description: `Rimossi ${data.deletedCount} duplicati, liberati ${fmtBytes(data.freedBytes)}.`,
      });
      setCurationReport(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      void refetchStorage();
    } catch (err: any) {
      toast({ title: "Errore Deduplicazione", description: err.message, variant: "destructive" });
    } finally {
      setIsDeduplicating(false);
    }
  };

  // Storage Snapshot Query
  const { data: storageData, isLoading: loadingStorage, refetch: refetchStorage, isRefetching } = useQuery<StorageSnapshot>({
    queryKey: ["/api/vault/storage-snapshot"],
  });

  const handleValidateS3Keys = async () => {
    if (!config.archiveAccessKey || !config.archiveSecretKey) {
      toast({
        title: "Campi Mancanti",
        description: "Inserisci sia l'Access Key che la Secret Key prima della convalida.",
        variant: "destructive",
      });
      return;
    }
    setIsValidatingKeys(true);
    try {
      const res = await apiRequest("POST", "/api/archive/validate-keys", {
        accessKey: config.archiveAccessKey,
        secretKey: config.archiveSecretKey,
        save: true,
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(data.message || "Convalida fallita");
      }
      toast({
        title: "Chiavi Valide",
        description: "Le credenziali S3 sono state convalidate da Internet Archive e memorizzate.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/archive/keys-status"] });
    } catch (err: any) {
      toast({
        title: "Convalida Fallita",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsValidatingKeys(false);
    }
  };

  const diskInfo = storageData?.romStorage?.disk;
  const diskPct = diskInfo
    ? Math.round(((diskInfo.totalBytes - diskInfo.freeBytes) / diskInfo.totalBytes) * 100)
    : null;
  const isLowSpace = diskInfo ? diskInfo.freeBytes < 2 * 1024 * 1024 * 1024 : false; // < 2 GB

  // Handler: Change default destination folder
  const handleSelectFolder = (newPath: string) => {
    setConfig({
      defaultRomDirectory: newPath,
      libraryWatchPaths: newPath,
    });
    toast({
      title: "Cartella Aggiornata",
      description: `Nuova destinazione: ${newPath}`,
    });
    void refetchStorage();
  };

  // Handler: Delete single platform ROMs
  const handleDeleteSystem = async (system: string, count: number) => {
    if (!confirm(`Sei sicuro di voler eliminare tutti i ${count} giochi per "${systemLabel(system)}"? Verranno rimossi i file e liberato spazio su disco.`)) {
      return;
    }
    setDeletingSystem(system);
    try {
      const res = await apiRequest("POST", "/api/vault/delete-system", { system });
      if (!res.ok) throw new Error("Impossibile eliminare i giochi del sistema");
      toast({
        title: "Piattaforma Eliminata",
        description: `Rimossi i giochi per ${systemLabel(system)}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      void refetchStorage();
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setDeletingSystem(null);
    }
  };

  // Handler: Delete all downloaded ROMs
  const handleDeleteAllRoms = async () => {
    const total = storageData?.totalRoms ?? 0;
    if (total === 0) {
      toast({ title: "Nessun Gioco", description: "La libreria è già vuota." });
      return;
    }
    const confirmed = prompt(`ATTENZIONE: Verranno eliminati TUTTI i ${total} giochi scaricati dalla libreria.\nI tuoi salvataggi rimarranno intatti.\n\nDigita "ELIMINA" per confermare:`);
    if (confirmed !== "ELIMINA") return;

    setIsDeletingAll(true);
    try {
      const res = await apiRequest("POST", "/api/vault/delete-all-roms");
      if (!res.ok) throw new Error("Impossibile reimpostare la libreria");
      toast({
        title: "Libreria Resettata",
        description: "Tutti i giochi sono stati rimossi. Lo spazio su disco è stato liberato.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      void refetchStorage();
    } catch (err: any) {
      toast({ title: "Errore Reset", description: err.message, variant: "destructive" });
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Handler: Clear art cache
  const handleClearArtCache = async () => {
    setIsClearingCache(true);
    try {
      const res = await apiRequest("POST", "/api/vault/clear-art-cache");
      const data = await res.json();
      toast({
        title: "Cache Svuotata",
        description: `Rimosse ${data.deletedCount ?? 0} immagini dalla cache locale.`,
      });
      void refetchStorage();
    } catch (err: any) {
      toast({ title: "Errore Pulizia", description: err.message, variant: "destructive" });
    } finally {
      setIsClearingCache(false);
    }
  };

  // Handler: Trigger on-demand manual local scan
  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      const res = await apiRequest("POST", "/api/scanner/scan-now");
      if (!res.ok) throw new Error("Scansione fallita");
      toast({
        title: "Scansione Manuale Completata",
        description: "Verifica dei file locali completata con successo.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      void refetchStorage();
    } catch (err: any) {
      toast({ title: "Errore Scansione", description: err.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6 text-foreground max-w-4xl">
      {/* ── CARD 1: SORGENTI DI DOWNLOAD (GAME SOURCES) ───────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="size-4 text-primary" />
              Sorgenti dei Giochi (Cloud Repositories)
            </h3>
            <p className="text-xs text-muted-foreground">
              Scegli il catalogo cloud da cui sfogliare e scaricare i giochi. I metadati e le copertine vengono abbinati automaticamente.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
            1G1R Verified
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {[
            {
              id: "retro-best",
              label: "Internet Archive — Retro Roms 'Best' Set",
              desc: "Consigliato: collezione curata retro-roms-best-set per console retrò con copertine automatiche deterministiche.",
            },
            {
              id: "tiny-best",
              label: "Internet Archive — Tiny Best Set: GO!",
              desc: "Celebre selezione compatta tiny-best-set-go per console retrò, arcade e PlayStation.",
            },
            {
              id: "hearto-1g1r",
              label: "Internet Archive — Hearto 1G1R Set",
              desc: "Archivio completo 1G1R compresso diviso per piattaforma e pronto all'uso.",
            },
            {
              id: "nointro-curated",
              label: "Internet Archive — No-Intro Curated (CHD/1G1R)",
              desc: "Immagini disco CHD complete e romset No-Intro curati senza duplicati.",
            },
            {
              id: "custom",
              label: "Sorgente Personalizzata (Archive.org ID)",
              desc: "Specifica un identificatore di collezione arbitrario presente su Internet Archive.",
            },
          ].map((src) => (
            <div
              key={src.id}
              onClick={() => {
                setConfig({ archiveSource: src.id as any });
              }}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                config.archiveSource === src.id
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-white/5 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{src.label}</span>
                {config.archiveSource === src.id && (
                  <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{src.desc}</p>
            </div>
          ))}
        </div>

        {config.archiveSource === "custom" && (
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-mono text-muted-foreground">ID Collezione Archive.org:</label>
            <Input
              value={config.archiveCustomId || ""}
              onChange={(e) => setConfig({ archiveCustomId: e.target.value })}
              placeholder="es. my-custom-romset-collection"
              className="bg-white/5 border-white/10 text-xs font-mono"
            />
          </div>
        )}

        {/* Metadata Source Option */}
        <div className="pt-3 border-t border-white/5 space-y-2">
          <label className="text-xs font-bold text-white flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            Sorgente Preferita Metadati e Copertine:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: "auto", label: "Auto (Multi-Source)" },
              { id: "libretro", label: "Libretro CDN" },
              { id: "archive", label: "Internet Archive" },
              { id: "retroachievements", label: "RetroAchievements" },
              { id: "openvgdb", label: "OpenVGDB / Built-in" },
            ].map((m) => (
              <Button
                key={m.id}
                type="button"
                variant={config.metadataSource === m.id ? "default" : "outline"}
                size="sm"
                onClick={() => setConfig({ metadataSource: m.id as any })}
                className="text-xs h-8 justify-start"
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Optional S3 Credentials Toggle */}
        <div className="pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowCredentials(!showCredentials)}
            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-white transition-colors"
          >
            <Key className="size-3 text-primary" />
            <span>Credenziali Archive.org S3 (Richieste per Download ROM)</span>
            {showCredentials ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>

          {showCredentials && (
            <div className="mt-3 p-3.5 rounded-lg bg-black/40 border border-white/5 space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Internet Archive richiede una coppia di chiavi API S3 per autorizzare il download delle ROM. Puoi generarle gratuitamente su{" "}
                <a
                  href="https://archive.org/account/s3.php"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  archive.org/account/s3.php
                </a>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">Access Key:</label>
                  <Input
                    value={config.archiveAccessKey || ""}
                    onChange={(e) => setConfig({ archiveAccessKey: e.target.value })}
                    placeholder="e.g. s3_access_key"
                    className="bg-white/5 border-white/10 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">Secret Key:</label>
                  <Input
                    type="password"
                    value={config.archiveSecretKey || ""}
                    onChange={(e) => setConfig({ archiveSecretKey: e.target.value })}
                    placeholder="e.g. s3_secret_key"
                    className="bg-white/5 border-white/10 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleValidateS3Keys}
                  disabled={isValidatingKeys || !config.archiveAccessKey || !config.archiveSecretKey}
                  className="text-xs gap-1.5 font-bold"
                >
                  {isValidatingKeys ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Convalida in corso...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3" />
                      Test e Convalida Chiavi S3
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open("https://archive.org/account/s3.php", "_blank", "noopener,noreferrer")}
                  className="text-xs border-white/10 gap-1 text-muted-foreground hover:text-white"
                >
                  <Globe className="size-3" />
                  Apri Pagina Chiavi
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CARD 2: CARTELLA DI DESTINAZIONE & STATO DISCO ───────────────────── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardDrive className="size-4 text-primary" />
              Cartella di Destinazione Giochi & Storage
            </h3>
            <p className="text-xs text-muted-foreground">
              Directory in cui vengono archiviati i file scaricati e caricati. Monitoraggio in tempo reale dello spazio libero.
            </p>
          </div>
          {isLowSpace && (
            <Badge variant="destructive" className="font-mono text-[10px] gap-1">
              <ShieldAlert className="size-3" /> Spazio Quasi Esaurito (&lt; 2 GB)
            </Badge>
          )}
        </div>

        {/* Current Path Selector */}
        <div className="flex items-center gap-2 pt-1">
          <Input
            readOnly
            value={config.defaultRomDirectory || "/share/roms"}
            className="font-mono text-xs bg-white/5 border-white/10 text-white flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleScrapeMissing}
            disabled={isScraping}
            className="text-xs gap-1.5"
          >
            {isScraping ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3 text-primary" />}
            Recupera Metadati Mancanti
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleScrapeAll}
            disabled={isScraping}
            className="text-xs gap-1.5"
          >
            {isScraping ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3 text-primary" />}
            Aggiorna Tutti i Metadati & Copertine
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDirPickerOpen(true)}
            className="gap-1.5 text-xs shrink-0"
          >
            <FolderOpen className="size-3.5 text-primary" />
            Sfoglia Cartella...
          </Button>
        </div>

        {/* Disk Space Bar */}
        {diskInfo && (
          <div className="p-3.5 rounded-lg bg-black/30 border border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Spazio Utilizzato su Disco:</span>
              <span className="text-white font-bold">
                {diskPct}% ({fmtBytes(diskInfo.totalBytes - diskInfo.freeBytes)} di {fmtBytes(diskInfo.totalBytes)})
              </span>
            </div>
            <Progress value={diskPct ?? 0} className={`h-2 ${isLowSpace ? "bg-rose-950" : "bg-white/10"}`} />
            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-0.5">
              <span>{fmtBytes(storageData?.totalSize ?? 0)} occupati dai giochi</span>
              <span className={`font-bold ${isLowSpace ? "text-rose-400" : "text-emerald-400"}`}>
                {fmtBytes(diskInfo.freeBytes)} Liberi
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── CARD 3: LIBRERIA SCARICATA (BREAKDOWN PER CONSOLE) ──────────────── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="size-4 text-primary" />
              Libreria Installata ({storageData?.totalRoms ?? 0} giochi • {fmtBytes(storageData?.totalSize ?? 0)})
            </h3>
            <p className="text-xs text-muted-foreground">
              Elenco dei giochi suddivisi per piattaforma con possibilità di rimozione selettiva.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setArchiveDialogOpen(true)}
              className="gap-1.5 text-xs bg-primary text-black font-bold hover:bg-primary/90"
            >
              <CloudDownload className="size-3.5" />
              Scarica da Internet Archive
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refetchStorage()}
              disabled={isRefetching}
              className="size-8 p-0 text-muted-foreground"
            >
              <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* System Breakdown Table */}
        {loadingStorage ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Caricamento statistiche libreria...
          </div>
        ) : (storageData?.bySystem ?? []).length === 0 ? (
          <div className="py-8 text-center space-y-2 border border-dashed border-white/10 rounded-lg">
            <CloudDownload className="size-8 text-muted-foreground/40 mx-auto" />
            <p className="text-xs text-muted-foreground">Nessun gioco scaricato nella cartella attiva.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setArchiveDialogOpen(true)}
              className="text-xs gap-1.5"
            >
              <Sparkles className="size-3 text-primary" />
              Sfoglia il Catalogo Giochi
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-72 pr-2">
            <div className="space-y-1">
              {(storageData?.bySystem ?? []).map((sys) => (
                <div
                  key={sys.system}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="size-2 rounded-full bg-primary shrink-0" />
                    <span className="text-xs font-bold text-white truncate">{systemLabel(sys.system)}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                      <span>{sys.count} giochi</span>
                      <span className="w-16 text-right font-medium text-white">{fmtBytes(sys.size)}</span>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteSystem(sys.system, sys.count)}
                      disabled={deletingSystem === sys.system}
                      className="size-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title={`Elimina tutti i giochi per ${systemLabel(sys.system)}`}
                    >
                      {deletingSystem === sys.system ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ── CARD 5: ROM CURATION & DEDUPLICAZIONE 1G1R (LANGUAGE-AWARE) ─────── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              Curation Libreria & Deduplicazione 1G1R (Lingua: {config.language?.toUpperCase() ?? "EN"})
            </h3>
            <p className="text-xs text-muted-foreground">
              Analizza la tua collezione per individuare copie doppie regionali o di versione (1 Game 1 Region) e scoprire quali titoli mancano per ogni console.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleRunCurationAnalysis}
            disabled={analyzingCuration}
            className="text-xs gap-1.5 font-bold"
          >
            {analyzingCuration ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            Esegui Analisi Curation
          </Button>
        </div>

        {curationReport && (
          <div className="p-4 rounded-lg bg-black/40 border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
              <div className="text-xs font-mono space-x-3 text-muted-foreground">
                <span>Scansionati: <b className="text-white">{curationReport.scannedRomsCount}</b></span>
                <span>Gruppi Duplicati: <b className="text-amber-400">{curationReport.duplicateGroupCount}</b></span>
                <span>Ridondanti: <b className="text-rose-400">{curationReport.redundantRomsCount}</b></span>
                <span>Spazio Recuperabile: <b className="text-emerald-400">{fmtBytes(curationReport.totalSpaceReclaimableBytes)}</b></span>
              </div>
              {curationReport.redundantRomsCount > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleExecuteDeduplication}
                  disabled={isDeduplicating}
                  className="text-xs gap-1 font-bold"
                >
                  {isDeduplicating ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                  Auto-Pulizia 1G1R ({curationReport.redundantRomsCount} Duplicati)
                </Button>
              )}
            </div>

            {curationReport.duplicateGroups.length === 0 ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> Nessun duplicato trovato! La tua libreria è già curata in modalità 1G1R.
              </p>
            ) : (
              <ScrollArea className="max-h-60 pr-2">
                <div className="space-y-2">
                  {curationReport.duplicateGroups.map((grp: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>{grp.baseTitle} ({systemLabel(grp.system)})</span>
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                          {grp.roms.length} Versioni
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{grp.reason}</p>
                      <div className="text-[10px] font-mono space-y-0.5 pt-1">
                        {grp.roms.map((r: any) => (
                          <div
                            key={r.id}
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              r.id === grp.recommendedRomId ? "bg-emerald-950/40 text-emerald-300 font-bold" : "text-muted-foreground"
                            }`}
                          >
                            <span>{r.id === grp.recommendedRomId ? "✓ [1G1R Kept] " : "✗ [Redundant] "}{r.title}</span>
                            <span>{fmtBytes(r.size)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>

      {/* ── CARD 4: MANUTENZIONE & RESET GLOBALE ─────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Server className="size-4 text-primary" />
          Manutenzione & Reset della Libreria
        </h3>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearArtCache}
            disabled={isClearingCache}
            className="text-xs gap-1.5"
          >
            {isClearingCache ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3 text-primary" />}
            Svuota Cache Immagini
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualScan}
            disabled={isScanning}
            className="text-xs gap-1.5"
          >
            {isScanning ? <Loader2 className="size-3 animate-spin" /> : <HardDrive className="size-3 text-primary" />}
            Rileva File Locali (Manuale)
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDeleteAllRoms}
            disabled={isDeletingAll || (storageData?.totalRoms ?? 0) === 0}
            className="text-xs gap-1.5 ml-auto font-bold"
          >
            {isDeletingAll ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            Elimina Tutti i Giochi (Reset Libreria)
          </Button>
        </div>
      </div>

      {/* ── SECONDARY ACCORDION: MANUAL UPLOAD DRAWER ───────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
        <button
          type="button"
          onClick={() => setShowManualUpload(!showManualUpload)}
          className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <UploadCloud className="size-4 text-primary" />
            Hai già delle ROM sul computer? Carica file manuali
          </span>
          {showManualUpload ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showManualUpload && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <RomUpload />
          </div>
        )}
      </div>

      {/* Directory Picker Dialog Modal */}
      <DirectoryPickerDialog
        open={dirPickerOpen}
        onOpenChange={setDirPickerOpen}
        onSelect={handleSelectFolder}
        title="Seleziona Cartella ROM"
        description="Scegli la cartella sul disco host in cui salvare e leggere le ROM."
      />

      {/* Archive Download Dialog Modal */}
      <ArchiveDownloadDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
      />
    </div>
  );
}

/**
 * LibrarySettings — ROM Management tab content for Settings page.
 * Reorganized into modular sub-sections:
 * 1. Folders & Scanning (with real-time SSE scan monitor & targeted scrape)
 * 2. ROM Transfer (Chunked upload & Direct network storage / SMB guidance)
 * 3. Health & Maintenance (Storage overview, health metrics, deduplication, clean unplayed)
 * 4. Backup & Sync (One-click ZIP export/import & native WebDAV sync)
 * 5. Smart Collections (Smart filter collection creator)
 */
import React, { useState, useRef, useEffect } from "react";
import { useIntegration } from "@/lib/integration";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, apiUrl } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  ScanLine,
  Loader2,
  FolderOpen,
  ImageIcon,
  RefreshCw,
  Trash2,
  Copy,
  Link,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  ShieldAlert,
  Upload,
  Cloud,
  Archive,
  Download,
  HardDrive,
  Activity,
  Layers,
  Network,
  ArrowRight,
  Cpu,
  Zap,
} from "lucide-react";
import { SetupWizardDialog, openSetupWizard } from "@/components/SetupWizardDialog";
import { RomUpload } from "@/components/RomUpload";
import { DirectoryPickerDialog } from "@/components/DirectoryPickerDialog";
import { MoveAllRomsDialog } from "@/components/MoveAllRomsDialog";
import { StorageOverview } from "@/components/StorageOverview";
import { Section } from "./SettingsShared";
import type { SmartFilterRules } from "@shared/schema";

interface ScannerStatusData {
  enabled: boolean;
  watchDir: string | null;
  watchPaths: string[];
  lastScanAt: number | null;
  lastScanFound: number;
  totalScanned: number;
  watching: boolean;
  error: string | null;
  pathStats?: Record<string, { found: number; imported: number; lastScanAt: number | null; error: string | null }>;
}

function splitWatchPaths(value: string | undefined): string[] {
  return (value ?? "").split(",").map((p) => p.trim()).filter(Boolean);
}

interface VaultHealth {
  total: number;
  missingArt: number;
  missingDescription: number;
  missingYear: number;
  missingGenre: number;
  failedScrapes: number;
  unplayed: number;
  duplicateGroups: number;
}

interface VaultAudit {
  deadLinks: Array<{ id: number; title: string; path: string }>;
  duplicates: Array<Array<{ id: number; title: string; system: string }>>;
}

function HealthCard({
  icon,
  label,
  count,
  total,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const percentage = total > 0 ? Math.round(((total - count) / total) * 100) : 100;
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`size-8 rounded-lg flex items-center justify-center ${colorClass}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="font-display font-black text-xl leading-none mt-0.5">
            {total - count}
            <span className="text-muted-foreground/30 text-sm font-medium"> / {total}</span>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-tighter text-muted-foreground">
          <span>{percentage}% Complete</span>
          <span>{count} missing</span>
        </div>
        <Progress value={percentage} className="h-1 rounded-full" />
      </div>
    </div>
  );
}

const ALL_SYSTEMS = [
  { id: "nes", label: "NES" },
  { id: "snes", label: "SNES" },
  { id: "genesis", label: "Genesis" },
  { id: "n64", label: "N64" },
  { id: "gb", label: "GB" },
  { id: "gbc", label: "GBC" },
  { id: "gba", label: "GBA" },
  { id: "nds", label: "NDS" },
  { id: "ps1", label: "PS1" },
  { id: "ps2", label: "PS2" },
  { id: "psp", label: "PSP" },
  { id: "dreamcast", label: "DC" },
  { id: "arcade", label: "Arcade" },
];

const ALL_STATUSES = [
  { id: "unset", label: "Unset" },
  { id: "playing", label: "Playing" },
  { id: "beaten", label: "Beaten" },
  { id: "completed", label: "Completed" },
];

// ── Section 1: Cartelle & Scansione ──────────────────────────────────────────
function ScannerStatusSection() {
  const { t } = useTranslation();
  const { config, setConfig } = useIntegration();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [refreshingArt, setRefreshingArt] = useState(false);
  const [scrapingMissing, setScrapingMissing] = useState(false);
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [artProgress, setArtProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  const [scanStreamProgress, setScanStreamProgress] = useState<{
    active: boolean;
    currentPath: string;
    found: number;
    imported: number;
    pruned: number;
    recentFile: string;
  } | null>(null);

  const { data: status } = useQuery<ScannerStatusData>({ queryKey: ["/api/scanner/status"], refetchInterval: 30_000 });
  const { data: debugInfo } = useQuery<{ romRoot: string }>({ queryKey: ["/api/debug"], refetchInterval: false });

  const handleClearLibrary = async () => {
    if (!confirm("This will permanently delete all ROMs and their files from the directory. Are you sure?")) return;
    setClearing(true);
    try {
      const res = await apiRequest("DELETE", "/api/roms");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Error");
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/scanner/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vault/health"] });
      toast({
        title: "Library cleared",
        description: `${data.romsRemoved} ROM(s) removed (${data.filesRemoved} files deleted, ${data.filesFailed} files failed).`,
      });
    } catch (err) {
      toast({ title: "Failed to clear library", description: String(err), variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  const handleScanStream = async () => {
    if (scanning) return;
    setScanning(true);
    setScanStreamProgress({
      active: true,
      currentPath: "Initializing scan…",
      found: 0,
      imported: 0,
      pruned: 0,
      recentFile: "",
    });

    try {
      const res = await fetch(apiUrl("/api/scanner/scan-stream"), { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Stream not readable");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "scanning_path") {
              setScanStreamProgress((prev) => (prev ? { ...prev, currentPath: event.path } : null));
            } else if (event.type === "rom_found") {
              setScanStreamProgress((prev) =>
                prev ? { ...prev, found: prev.found + 1, recentFile: event.file } : null,
              );
            } else if (event.type === "pruned") {
              setScanStreamProgress((prev) => (prev ? { ...prev, pruned: prev.pruned + 1 } : null));
            } else if (event.type === "progress") {
              setScanStreamProgress((prev) =>
                prev ? { ...prev, found: event.found, imported: event.imported } : null,
              );
            } else if (event.type === "complete") {
              toast({
                title: "Scan completed",
                description: `Imported ${event.totalImported} new ROMs, reconciled ${event.totalPruned} removed files.`,
              });
            }
          } catch {}
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/scanner/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vault/health"] });
    } catch (err: any) {
      toast({ title: "Scan error", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
      setTimeout(() => setScanStreamProgress(null), 4000);
    }
  };

  const handleScrapeMissing = async () => {
    if (scrapingMissing || refreshingArt) return;
    setScrapingMissing(true);
    setArtProgress(null);

    try {
      const res = await fetch(apiUrl("/api/roms/scrape-missing"), { method: "POST" });
      if (!res.ok) throw new Error(res.statusText);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Body reader not available");

      const decoder = new TextDecoder();
      let buffer = "";
      let matched = 0;
      let failed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "start") {
              setArtProgress({ current: 0, total: data.total, title: `Targeted scrape (0/${data.total})` });
            } else if (data.type === "progress") {
              setArtProgress({ current: data.current, total: data.total, title: `Scraping: ${data.title}` });
            } else if (data.type === "result") {
              if (data.status === "success") matched++;
              else failed++;
            } else if (data.type === "complete") {
              toast({
                title: "Targeted scrape complete!",
                description: `Enriched ${matched} games (${failed} not found).`,
              });
            }
          } catch {}
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vault/health"] });
    } catch (err: any) {
      toast({ title: "Targeted scrape error", description: err.message, variant: "destructive" });
    } finally {
      setScrapingMissing(false);
      setArtProgress(null);
    }
  };

  const handleRefreshArt = async () => {
    if (refreshingArt || scrapingMissing) return;
    setRefreshingArt(true);
    setArtProgress(null);

    try {
      const res = await fetch(apiUrl("/api/roms/scrape-all"), { method: "POST" });
      if (!res.ok) throw new Error(res.statusText);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Body reader not available");

      const decoder = new TextDecoder();
      let buffer = "";
      let artMatched = 0;
      let artFailed = 0;
      let metaMatched = 0;
      let metaFailed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "start") {
              setArtProgress({ current: 0, total: data.total, title: `Scraping art (0/${data.total})` });
            } else if (data.type === "phase_change" && data.phase === "meta") {
              setArtProgress({ current: 0, total: data.total, title: `Scraping metadata (0/${data.total})` });
            } else if (data.type === "progress") {
              if (data.phase === "meta") {
                setArtProgress({
                  current: data.current,
                  total: data.total,
                  title: `Scraping metadata (${data.current}/${data.total}): ${data.title}`,
                });
              } else {
                setArtProgress({
                  current: data.current,
                  total: data.total,
                  title: `Scraping art (${data.current}/${data.total}): ${data.title}`,
                });
              }
            } else if (data.type === "result") {
              if (data.phase === "meta") {
                if (data.status === "success") metaMatched++;
                else metaFailed++;
              } else {
                if (data.status === "success") artMatched++;
                else artFailed++;
              }
            } else if (data.type === "complete") {
              const parts: string[] = [];
              if (artMatched > 0 || artFailed > 0) parts.push(`Art: ${artMatched} matched, ${artFailed} failed`);
              if (metaMatched > 0 || metaFailed > 0) parts.push(`Meta: ${metaMatched} matched, ${metaFailed} failed`);
              if (parts.length === 0) parts.push("Nothing to scrape");
              toast({ title: "Scrape complete!", description: parts.join(" · ") });
            }
          } catch {}
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vault/health"] });
    } catch (err: any) {
      toast({ title: "Scrape error", description: err.message, variant: "destructive" });
    } finally {
      setRefreshingArt(false);
      setArtProgress(null);
    }
  };

  const addWatchPath = (path: string) => {
    const nextPaths = Array.from(new Set([...splitWatchPaths(config.libraryWatchPaths), path]));
    setConfig({ libraryWatchPaths: nextPaths.join(", ") });
    toast({ title: "ROM directory added", description: `${path} will be scanned automatically.` });
  };

  return (
    <div className="space-y-6">
      <Section
        title={t("settings.sections.scanner.title", "Cartelle & Scansione")}
        description={t(
          "settings.sections.scanner.enabledDescription",
          "Gestisci le directory monitorate e avvia scansioni on-demand con streaming del progresso in tempo reale.",
        )}
      >
        <div className="space-y-6">
          {/* Setup Wizard Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-primary/20 flex items-center justify-center text-primary border border-primary/30 shrink-0">
                <Sparkles className="size-4" />
              </div>
              <div>
                <div className="font-bold text-xs text-foreground flex items-center gap-2">
                  Configurazione Guidata (Setup Wizard)
                  <span className="text-[10px] font-mono text-primary font-normal bg-primary/10 px-1.5 py-0.5 rounded">Samba &bull; SSD &bull; Cores</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Riconfigura guidata: seleziona cartelle Samba o SSD, scarica core nativi e verifica i file BIOS.
                </div>
              </div>
            </div>
            <Button
              type="button"
              onClick={openSetupWizard}
              variant="default"
              size="sm"
              className="gap-2 font-mono uppercase text-xs shrink-0 self-end sm:self-center"
            >
              <Zap className="size-3.5 fill-current" />
              Avvia Setup Wizard
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Watch Directories
            </Label>
            <div className="flex gap-2">
              <Input
                value={config.libraryWatchPaths}
                onChange={(e) => setConfig({ libraryWatchPaths: e.target.value })}
                placeholder="e.g. /media/usb-drive/roms, /media/roms, /data/rom-storage"
                className="font-mono text-sm"
              />
              <Button type="button" variant="outline" onClick={() => setDirectoryPickerOpen(true)} className="gap-1.5">
                <FolderOpen className="size-4" />
                Browse
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Separate multiple paths with commas. These folders are scanned automatically with streaming hash and
              auto-reconciliation. In Home Assistant add-ons, external drives mapped as media are visible as{" "}
              <code className="bg-muted px-1 rounded text-[9px]">/media/...</code>.
            </p>
            <DirectoryPickerDialog
              open={directoryPickerOpen}
              onOpenChange={setDirectoryPickerOpen}
              onSelect={addWatchPath}
            />
            {debugInfo?.romRoot && (
              <a
                href={`${window.location.origin}/#${debugInfo.romRoot}`}
                className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-accent hover:text-accent/80 transition-colors"
                title={debugInfo.romRoot}
              >
                <FolderOpen className="size-3" />
                ROM Storage: {debugInfo.romRoot}
              </a>
            )}
          </div>

          {/* Real-time SSE Scan Monitor Card */}
          {scanStreamProgress && (
            <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScanLine className="size-4 text-primary animate-pulse" />
                  <span className="font-mono text-xs font-bold text-primary uppercase tracking-wider">
                    Scansione in tempo reale (SSE)
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span>
                    Trovate: <strong className="text-foreground">{scanStreamProgress.found}</strong>
                  </span>
                  <span>
                    Importate: <strong className="text-green-400">{scanStreamProgress.imported}</strong>
                  </span>
                  <span>
                    Riconciliate: <strong className="text-amber-400">{scanStreamProgress.pruned}</strong>
                  </span>
                </div>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground truncate">
                {scanStreamProgress.currentPath}
                {scanStreamProgress.recentFile && (
                  <span className="ml-2 text-foreground font-medium">({scanStreamProgress.recentFile})</span>
                )}
              </div>
              <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-pulse w-full rounded-full" />
              </div>
            </div>
          )}

          {artProgress && (
            <div className="p-3 rounded-lg border border-accent/30 bg-accent/5 space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-accent">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="size-3 animate-spin" />
                  {artProgress.title}
                </span>
                <span>
                  {artProgress.total > 0 ? Math.round((artProgress.current / artProgress.total) * 100) : 0}%
                </span>
              </div>
              <Progress
                value={artProgress.total > 0 ? Math.round((artProgress.current / artProgress.total) * 100) : 0}
                className="h-1 rounded-full"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div className="flex-1 min-w-[200px] space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Status</span>
                {status?.watching ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
                    {t("common.ui.active")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-muted-foreground bg-muted/20 px-2 py-0.5 rounded-full border border-white/5">
                    Idle
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground font-mono">
                <span>
                  Total ROMs: <span className="text-foreground">{status?.totalScanned ?? 0}</span>
                </span>
                {status?.lastScanAt ? (
                  <span>
                    Last run: <span className="text-foreground">{new Date(status.lastScanAt).toLocaleTimeString()}</span>
                  </span>
                ) : null}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleScanStream}
              disabled={scanning || refreshingArt || scrapingMissing}
              className="gap-1.5 h-9 px-4 font-black uppercase tracking-wider text-[10px] bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary"
            >
              {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <ScanLine className="size-3.5" />}
              Scansiona Ora (Live)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScrapeMissing}
              disabled={scanning || refreshingArt || scrapingMissing}
              className="gap-1.5 h-9 px-4 font-black uppercase tracking-wider text-[10px] bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 text-amber-400"
              title="Scrape metadata only for ROMs missing artwork"
            >
              {scrapingMissing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Scrape Titoli Mancanti
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshArt}
              disabled={scanning || refreshingArt || scrapingMissing}
              className="gap-1.5 h-9 px-4 font-black uppercase tracking-wider text-[10px] bg-accent/10 border-accent/20 hover:bg-accent/20 text-accent"
              title="Refresh all ROM artwork and metadata"
            >
              {refreshingArt ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
              Re-Scrape Totale
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLibrary}
              disabled={clearing || scanning || refreshingArt || scrapingMissing}
              className="gap-1.5 h-9 px-4 font-black uppercase tracking-wider text-[10px] text-destructive/80 border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
            >
              {clearing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Clear All
            </Button>
          </div>

          {status?.error && (
            <p className="text-xs text-destructive font-mono bg-destructive/10 p-3 rounded-lg border border-destructive/20">
              {status.error}
            </p>
          )}

          {status?.pathStats && Object.keys(status.pathStats).length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Scanner diagnostics
              </p>
              <div className="space-y-2">
                {Object.entries(status.pathStats).map(([scanPath, stat]) => (
                  <div
                    key={scanPath}
                    className="grid gap-1 rounded-lg border border-white/5 bg-background/30 p-3 font-mono text-[10px] text-muted-foreground md:grid-cols-[1fr_auto_auto] md:items-center"
                  >
                    <span className="truncate text-foreground" title={scanPath}>
                      {scanPath}
                    </span>
                    <span>
                      {stat.found} ROM(s), {stat.imported} new
                    </span>
                    <span className={stat.error ? "text-destructive" : "text-green-400"}>{stat.error ?? "OK"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Section 2: Trasferimento ROM (Chunked Upload & SMB Direct Guidance) ─────
function RomTransferSection() {
  return (
    <div className="space-y-8">
      <Section
        title="Trasferimento ROM Resiliente (Chunked Upload)"
        description="Carica file singoli o cartelle intere. I file grandi (PS1, PS2, Saturn, fino a 8GB) vengono suddivisi automaticamente in blocchi da 16MB con retry e ripresa automatica."
      >
        <div className="p-4 rounded-xl border border-border bg-sidebar/20">
          <RomUpload system={undefined} variant="inline" />
        </div>
      </Section>

      <div className="p-5 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
            <Network className="size-5" />
          </div>
          <div>
            <h4 className="font-display font-bold text-sm text-foreground">
              Guida: Trasferimento Diretto via Rete / SMB (Samba Share)
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Consigliato per librerie di centinaia di gigabyte o file ISO multi-disco.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Se utilizzi l&apos;add-on ufficiale Home Assistant <strong>Samba Share</strong>, puoi copiare i tuoi file
          direttamente nella cartella <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">/media</code> o{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">/share</code> del tuo server senza passare dal
          browser. Aggiungi poi il percorso (es. <code className="bg-muted px-1 rounded text-[10px]">/media/roms</code>)
          nella scheda <em>Cartelle & Scansione</em> per il rilevamento istantaneo con hashing automatico.
        </p>
      </div>
    </div>
  );
}

// ── Section 3: Salute & Manutenzione ─────────────────────────────────────────
function LibraryHealthSection() {
  const { toast } = useToast();
  const [auditing, setAuditing] = useState(false);
  const [moveAllOpen, setMoveAllOpen] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const { data: health, refetch: refetchHealth } = useQuery<VaultHealth>({ queryKey: ["/api/vault/health"] });
  const { data: audit, refetch: refetchAudit } = useQuery<VaultAudit>({
    queryKey: ["/api/vault/audit"],
    enabled: false,
  });

  const runAudit = async () => {
    setAuditing(true);
    await refetchAudit();
    setAuditing(false);
  };

  const pruneDeadLinks = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vault/prune");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Cleanup complete", description: `Removed ${data.removedCount} dead entries.` });
      void refetchHealth();
      void refetchAudit();
    },
  });

  return (
    <div className="space-y-8">
      <Section title="Library Health" description="Audit in tempo reale della copertura dei metadati e dello stato di archiviazione.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <HealthCard
            icon={<ImageIcon className="size-4 text-pink-400" />}
            label="Box Artwork"
            count={health?.missingArt ?? 0}
            total={health?.total ?? 0}
            colorClass="bg-pink-400/10"
          />
          <HealthCard
            icon={<FileText className="size-4 text-blue-400" />}
            label="Descriptions"
            count={health?.missingDescription ?? 0}
            total={health?.total ?? 0}
            colorClass="bg-blue-400/10"
          />
          <HealthCard
            icon={<Sparkles className="size-4 text-amber-400" />}
            label="Meta Completeness"
            count={health?.missingYear ?? 0}
            total={health?.total ?? 0}
            colorClass="bg-amber-400/10"
          />
        </div>
      </Section>

      <Separator className="bg-border/60" />
      <StorageOverview />

      <Separator className="bg-border/60" />
      <Section title="Strumenti di Manutenzione" description="Workflow automatizzati per pulire, ottimizzare e riparare la libreria.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-sidebar/20">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="size-5 text-destructive" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Prune Dead Links</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Rimuovi voci di file eliminati dal disco.</div>
              </div>
            </div>
            <Button
              onClick={() => pruneDeadLinks.mutate()}
              disabled={pruneDeadLinks.isPending}
              variant="outline"
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10 border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
            >
              {pruneDeadLinks.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5" />}
              Pulisci File Mancanti
            </Button>
          </div>

          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-sidebar/20">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-accent/10 flex items-center justify-center">
                <FolderOpen className="size-5 text-accent" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Move All ROMs</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Sposta tutte le ROM in una nuova cartella con suddivisione per sistema.</div>
              </div>
            </div>
            <Button
              onClick={() => setMoveAllOpen(true)}
              variant="outline"
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10 border-accent/20 hover:bg-accent/10 hover:text-accent"
            >
              <FolderOpen className="size-3.5" />
              Sposta tutte le ROM…
            </Button>
          </div>

          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-sidebar/20">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Copy className="size-5 text-amber-500" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Remove Duplicates</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Rimuovi voci duplicate nel DB per ROM con hash identico.</div>
              </div>
            </div>
            <Button
              onClick={async () => {
                if (!confirm(`Eliminare ${health?.duplicateGroups ?? 0} gruppi duplicati? La prima voce per hash verrà conservata.`))
                  return;
                await apiRequest("POST", "/api/vault/dedup");
                void refetchHealth();
              }}
              variant="outline"
              disabled={!health?.duplicateGroups}
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10 border-amber-500/20 hover:bg-amber-500/10 hover:text-amber-500"
            >
              <Copy className="size-3.5" />
              {health?.duplicateGroups ? `Rimuovi ${health.duplicateGroups} Duplicati` : "Nessun Duplicato"}
            </Button>
          </div>

          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-sidebar/20">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <FileText className="size-5 text-blue-500" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Clean Unplayed ROMs</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Rimuovi ROM mai giocate (file + database).</div>
              </div>
            </div>
            <Button
              onClick={async () => {
                if (!confirm(`Eliminare ${health?.unplayed ?? 0} ROM mai giocate? L'operazione rimuove file e voci dal DB.`))
                  return;
                await apiRequest("POST", "/api/vault/delete-unplayed");
                void refetchHealth();
              }}
              variant="outline"
              disabled={!health?.unplayed}
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10 border-blue-500/20 hover:bg-blue-500/10 hover:text-blue-500"
            >
              <FileText className="size-3.5" />
              {health?.unplayed ? `Rimuovi ${health.unplayed} Non Giocate` : "Tutte Giocate"}
            </Button>
          </div>

          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-sidebar/20">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="size-5 text-destructive" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Clear Failed Scrapes</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Rimuovi ROM senza scraping riuscito.</div>
              </div>
            </div>
            <Button
              onClick={async () => {
                if (!confirm(`Eliminare ${health?.failedScrapes ?? 0} ROM con scraping fallito? Rimuove file e database.`))
                  return;
                await apiRequest("POST", "/api/vault/delete-failed");
                void refetchHealth();
              }}
              variant="outline"
              disabled={!health?.failedScrapes}
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10 border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
            >
              <AlertCircle className="size-3.5" />
              {health?.failedScrapes ? `Rimuovi ${health.failedScrapes} Scrape Falliti` : "Nessun Errore Scrape"}
            </Button>
          </div>

          <div className="flex flex-col gap-4 p-5 rounded-xl border border-primary/30 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Setup Wizard & Manutenzione</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Riconfigura cartelle Samba/SSD, scarica o ripristina i motori di emulazione e i file BIOS in /data.</div>
              </div>
            </div>
            <Button
              onClick={openSetupWizard}
              variant="default"
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10"
            >
              <Zap className="size-3.5 fill-current" />
              Rilancia Setup Wizard
            </Button>
          </div>
        </div>
      </Section>

      <Separator className="bg-border/60" />
      <Section title="Collection Audit" description="Verifica duplicati e inconsistenze nella tua collezione.">
        <div className="space-y-6">
          <Button
            onClick={runAudit}
            disabled={auditing}
            variant="secondary"
            className="gap-2 font-black uppercase text-[10px] tracking-widest h-10"
          >
            {auditing ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Avvia Audit Inconsistenze
          </Button>

          {audit && (
            <div className="grid gap-6 animate-in fade-in slide-in-from-top-2 duration-500">
              {audit.duplicates.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-500 font-mono text-[10px] uppercase tracking-widest">
                    <Copy className="size-3.5" /> Gruppi Duplicati ({audit.duplicates.length})
                  </div>
                  <div className="space-y-2">
                    {audit.duplicates.map((group, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-[11px] font-mono"
                      >
                        {group.map((g) => `${g.system.toUpperCase()}: ${g.title}`).join(" ↔ ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audit.deadLinks.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-destructive font-mono text-[10px] uppercase tracking-widest">
                    <Link className="size-3.5" /> File Scomparsi ({audit.deadLinks.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-destructive/20 bg-destructive/5 divide-y divide-destructive/10">
                    {audit.deadLinks.map((link) => (
                      <div key={link.id} className="p-2 text-[10px] font-mono text-muted-foreground truncate">
                        {link.title} <span className="opacity-40 ml-2">({link.path})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audit.duplicates.length === 0 && audit.deadLinks.length === 0 && (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-green-500/20 bg-green-500/5 text-green-500">
                  <CheckCircle2 className="size-5" />
                  <div className="text-xs font-bold uppercase tracking-widest">Libreria al 100% integra</div>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <MoveAllRomsDialog open={moveAllOpen} onOpenChange={setMoveAllOpen} />
    </div>
  );
}

// ── Section 4: Backup & Sincronizzazione (ZIP One-Click & WebDAV) ────────────
function BackupSyncSection() {
  const { config, setConfig } = useIntegration();
  const { toast } = useToast();
  const [testingWebDav, setTestingWebDav] = useState(false);
  const [syncingWebDav, setSyncingWebDav] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportZip = () => {
    window.location.href = apiUrl("/api/vault/saves-export");
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingZip(true);
    try {
      const res = await fetch(apiUrl("/api/vault/saves-import"), {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      if (!res.ok) {
        let msg = "Ripristino fallito";
        try {
          msg = (await res.json()).message || msg;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      toast({
        title: "Salvataggi ripristinati con successo",
        description: `Importati ${data.restoredCount} file di salvataggio e stati.`,
      });
    } catch (err: any) {
      toast({ title: "Errore ripristino salvataggi", description: err.message, variant: "destructive" });
    } finally {
      setImportingZip(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTestWebDav = async () => {
    setTestingWebDav(true);
    try {
      const res = await fetch(apiUrl("/api/vault/webdav-test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: config.webdavUrl,
          username: config.webdavUsername,
          password: config.webdavPassword,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "WebDAV Connesso", description: data.message });
      } else {
        toast({ title: "Connessione Fallita", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Errore Connessione", description: err.message, variant: "destructive" });
    } finally {
      setTestingWebDav(false);
    }
  };

  const handleSyncWebDav = async () => {
    setSyncingWebDav(true);
    try {
      const res = await fetch(apiUrl("/api/vault/webdav-sync"), { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sincronizzazione fallita");
      toast({
        title: "Sincronizzazione WebDAV Completata",
        description: `Caricati ${data.uploaded} salvataggi sulla cartella remota (${data.failed} falliti).`,
      });
      setConfig({ webdavLastSync: Date.now() });
    } catch (err: any) {
      toast({ title: "Sincronizzazione Fallita", description: err.message, variant: "destructive" });
    } finally {
      setSyncingWebDav(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Archivio ZIP One-Click ────────────────────────────────────────── */}
      <Section
        title="Archivio Salvataggi One-Click (ZIP)"
        description="Scarica o ripristina un archivio compresso di tutti i salvataggi in-game (.srm, .sav) e savestates per tutti i profili e giochi."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex flex-col justify-between p-5 rounded-xl border border-border bg-sidebar/20 gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Download className="size-5" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Esporta Archivio Salvataggi</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Genera e scarica un file ZIP contenente tutti i salvataggi e screenshot.
                </div>
              </div>
            </div>
            <Button
              onClick={handleExportZip}
              variant="outline"
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10 border-primary/20 hover:bg-primary/10 hover:text-primary"
            >
              <Download className="size-3.5" />
              Scarica Backup ZIP
            </Button>
          </div>

          <div className="flex flex-col justify-between p-5 rounded-xl border border-border bg-sidebar/20 gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <Archive className="size-5" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Ripristina Archivio Salvataggi</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Carica un archivio ZIP esportato in precedenza per ripristinare i salvataggi.
                </div>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".zip,application/zip"
              className="hidden"
              onChange={handleImportZip}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={importingZip}
              variant="outline"
              className="w-full gap-2 font-black uppercase text-[10px] tracking-widest h-10 border-accent/20 hover:bg-accent/10 hover:text-accent"
            >
              {importingZip ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
              Carica e Ripristina ZIP
            </Button>
          </div>
        </div>
      </Section>

      <Separator className="bg-border/60" />

      {/* ── Sincronizzazione WebDAV Nativa ───────────────────────────────── */}
      <Section
        title="Sincronizzazione WebDAV (Nextcloud / NAS Synology / TrueNAS)"
        description="Sincronizza in modo automatico e nativo i tuoi salvataggi con qualsiasi server WebDAV standard, senza dipendenze proprietarie."
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Cloud className="size-5 text-primary" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Sincronizzazione WebDAV</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                  {config.webdavSyncEnabled ? "Attiva" : "Disattivata"}
                  {config.webdavLastSync
                    ? ` · Ultima sincronizzazione: ${new Date(config.webdavLastSync).toLocaleString()}`
                    : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {config.webdavSyncEnabled && (
                <Button
                  onClick={handleSyncWebDav}
                  disabled={syncingWebDav || !config.webdavUrl}
                  variant="ghost"
                  size="sm"
                  className="gap-2 h-9 px-3 font-black uppercase tracking-wider text-[10px] text-primary hover:text-primary hover:bg-primary/10"
                >
                  {syncingWebDav ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Sincronizza Ora
                </Button>
              )}
              <Switch
                checked={config.webdavSyncEnabled}
                onCheckedChange={(v) => setConfig({ webdavSyncEnabled: v })}
              />
            </div>
          </div>

          <div className="grid gap-4 p-5 rounded-xl border border-border bg-sidebar/10">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-mono tracking-wider opacity-60">WebDAV Server URL</Label>
              <Input
                value={config.webdavUrl}
                onChange={(e) => setConfig({ webdavUrl: e.target.value })}
                placeholder="https://nextcloud.example.com/remote.php/dav/files/username/"
                className="font-mono text-xs h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Supporta Nextcloud, Synology WebDAV Server, TrueNAS, QNAP o qualsiasi endpoint HTTP/HTTPS WebDAV.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-mono tracking-wider opacity-60">Username</Label>
                <Input
                  value={config.webdavUsername}
                  onChange={(e) => setConfig({ webdavUsername: e.target.value })}
                  placeholder="utente"
                  className="font-mono text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-mono tracking-wider opacity-60">
                  Password o App Token
                </Label>
                <Input
                  type="password"
                  value={config.webdavPassword}
                  onChange={(e) => setConfig({ webdavPassword: e.target.value })}
                  placeholder="••••••••••••"
                  className="font-mono text-xs h-9"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                onClick={handleTestWebDav}
                disabled={testingWebDav || !config.webdavUrl}
                variant="outline"
                size="sm"
                className="gap-2 h-9 px-4 font-black uppercase tracking-wider text-[10px]"
              >
                {testingWebDav ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Test Connessione
              </Button>
              <Button
                onClick={handleSyncWebDav}
                disabled={syncingWebDav || !config.webdavUrl}
                size="sm"
                className="gap-2 h-9 px-4 font-black uppercase tracking-wider text-[10px]"
              >
                {syncingWebDav ? <Loader2 className="size-3.5 animate-spin" /> : <Cloud className="size-3.5" />}
                Salva & Sincronizza
              </Button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── Section 5: Collezioni Smart ─────────────────────────────────────────────
function SmartFilterCollectionCreator() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [systems, setSystems] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<number>(0);
  const [minMinutes, setMinMinutes] = useState<number>(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [genre, setGenre] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const handleCreate = async () => {
    if (!name.trim()) return;
    const rules: SmartFilterRules = {};
    if (systems.length) rules.systems = systems;
    if (statuses.length) rules.playStatus = statuses;
    if (minRating > 0) rules.minRating = minRating;
    if (minMinutes > 0) rules.minMinutesPlayed = minMinutes;
    if (favoritesOnly) rules.favorites = true;
    if (genre.trim()) rules.genre = genre.trim();
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/collections/smart", { name: name.trim(), rules });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Error");
      await queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({ title: "Smart filter created", description: `"${name.trim()}" will update automatically.` });
      setOpen(false);
      setName("");
      setSystems([]);
      setStatuses([]);
      setMinRating(0);
      setMinMinutes(0);
      setFavoritesOnly(false);
      setGenre("");
    } catch (err) {
      toast({ title: "Failed to create", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title={t("settings.sections.smartFilters.title", "Collezioni Smart")}
      description={t(
        "settings.sections.smartFilters.description",
        "Collezioni dinamiche basate su regole (console, ore di gioco, valutazione, stato) che si aggiornano da sole.",
      )}
    >
      {!open ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5"
          data-testid="button-create-smart-filter"
        >
          <Sparkles className="size-3.5" /> {t("settings.buttons.create", "Crea Nuova Collezione Smart")}
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-black/30 p-4 space-y-4">
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("home.prompts.collectionName", "Nome Collezione")}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Currently Playing"
              data-testid="input-smart-filter-name"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("nav.browseSystems", "Console")} <span className="opacity-50">(vuoto = tutte)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SYSTEMS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSystems((s) => toggle(s, id))}
                  className={`px-2.5 py-1 rounded-full border font-mono text-[10px] uppercase tracking-wider transition-all ${
                    systems.includes(id)
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("history.stats.playStatus", "Stato Gioco")} <span className="opacity-50">(vuoto = qualsiasi)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_STATUSES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatuses((s) => toggle(s, id))}
                  className={`px-2.5 py-1 rounded-full border font-mono text-[10px] uppercase tracking-wider transition-all ${
                    statuses.includes(id)
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Valutazione minima (0 = qualsiasi)
              </Label>
              <select
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-border bg-background/50 px-2 font-mono text-xs text-foreground"
                data-testid="select-smart-filter-min-rating"
              >
                <option value={0}>Qualsiasi</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Tempo minimo di gioco
              </Label>
              <select
                value={minMinutes}
                onChange={(e) => setMinMinutes(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-border bg-background/50 px-2 font-mono text-xs text-foreground"
              >
                <option value={0}>Qualsiasi</option>
                <option value={10}>10 min</option>
                <option value={60}>1 ora</option>
                <option value={300}>5 ore</option>
                <option value={1200}>20 ore</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Genere contiene
              </Label>
              <Input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g. RPG"
                className="font-mono text-xs"
                data-testid="input-smart-filter-genre"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch id="sf-favorites" checked={favoritesOnly} onCheckedChange={setFavoritesOnly} />
              <Label htmlFor="sf-favorites" className="text-sm">
                Solo Preferiti
              </Label>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="gap-1.5"
              data-testid="button-save-smart-filter"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {t("settings.buttons.create", "Crea Collezione")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("settings.buttons.cancel", "Annulla")}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

type LibrarySubTab = "folders" | "transfer" | "health" | "backup" | "smart";

export function LibrarySettings() {
  const [activeTab, setActiveTab] = useState<LibrarySubTab>("folders");

  const tabs: { id: LibrarySubTab; label: string; icon: React.ReactNode }[] = [
    { id: "folders", label: "Cartelle & Scansione", icon: <FolderOpen className="size-3.5" /> },
    { id: "transfer", label: "Trasferimento ROM", icon: <Upload className="size-3.5" /> },
    { id: "health", label: "Salute & Manutenzione", icon: <Activity className="size-3.5" /> },
    { id: "backup", label: "Backup & Sync", icon: <Cloud className="size-3.5" /> },
    { id: "smart", label: "Collezioni Smart", icon: <Sparkles className="size-3.5" /> },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ── Sub-navigation Pill Bar ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-xl border border-white/5 bg-white/[0.02]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs uppercase tracking-wider font-semibold transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div className="pt-2">
        {activeTab === "folders" && <ScannerStatusSection />}
        {activeTab === "transfer" && <RomTransferSection />}
        {activeTab === "health" && <LibraryHealthSection />}
        {activeTab === "backup" && <BackupSyncSection />}
        {activeTab === "smart" && <SmartFilterCollectionCreator />}
      </div>
    </div>
  );
}

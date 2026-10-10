import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DirectoryPickerDialog } from "@/components/DirectoryPickerDialog";
import {
  Cpu,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  Zap,
  Check,
  FolderOpen,
  Network,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Layers,
} from "lucide-react";

interface SuggestedLocation {
  id: string;
  label: string;
  path: string;
  description: string;
}

interface SetupStatus {
  isComplete: boolean;
  arch: string;
  totalCores: number;
  installedCores: number;
  totalBios: number;
  installedBios: number;
  watchPaths?: string[];
  suggestedLocations?: SuggestedLocation[];
  cores: Array<{
    id: string;
    name: string;
    label: string;
    system: string;
    installed: boolean;
    size: number;
  }>;
  bios: Array<{
    filename: string;
    label: string;
    installed: boolean;
    verified: boolean;
    hasSourceUrl: boolean;
  }>;
  progress: {
    active: boolean;
    stage: "idle" | "cores" | "bios" | "complete" | "error";
    totalItems: number;
    completedItems: number;
    currentItem: string;
    error?: string;
  };
}

interface SetupWizardDialogProps {
  forceOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SetupWizardDialog({ forceOpen, onOpenChange }: SetupWizardDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Selected ROM path
  const [selectedRomPath, setSelectedRomPath] = useState<string>("/share/roms");

  const { data: status, refetch: refetchStatus } = useQuery<SetupStatus>({
    queryKey: ["/api/setup/status"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/setup/status"));
      if (!res.ok) throw new Error("Failed to load setup status");
      return res.json();
    },
    staleTime: 5000,
  });

  // Track progress if active
  const { data: liveProgress } = useQuery({
    queryKey: ["/api/setup/progress"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/setup/progress"));
      if (!res.ok) throw new Error("Failed to poll progress");
      return res.json();
    },
    enabled: bootstrapping || status?.progress?.active,
    refetchInterval: bootstrapping || status?.progress?.active ? 1000 : false,
  });

  // Populate default path when status is loaded
  useEffect(() => {
    if (status?.watchPaths && status.watchPaths.length > 0) {
      setSelectedRomPath(status.watchPaths[0]);
    } else if (status?.suggestedLocations && status.suggestedLocations.length > 0) {
      setSelectedRomPath(status.suggestedLocations[0].path);
    }
  }, [status]);

  // Auto-open on initial load if setup is not complete and user hasn't dismissed it
  useEffect(() => {
    if (forceOpen !== undefined) {
      setOpen(forceOpen);
      if (forceOpen) setStep(1);
      return;
    }
    const hasCompleted = localStorage.getItem("ha_setup_wizard_completed");
    if (status && !status.isComplete && !dismissed && !hasCompleted) {
      setOpen(true);
    }
  }, [status, dismissed, forceOpen]);

  // Sync bootstrap state
  useEffect(() => {
    if (liveProgress?.active) {
      setBootstrapping(true);
    } else if (bootstrapping && liveProgress?.stage === "complete") {
      setBootstrapping(false);
      void refetchStatus();
      void queryClient.invalidateQueries({ queryKey: ["/api/setup/status"] });
      toast({
        title: "Motori e BIOS Installati",
        description: "I file di runtime sono stati configurati con successo in /data.",
      });
      // Move to step 3 when download finishes
      setStep(3);
    } else if (bootstrapping && liveProgress?.stage === "error") {
      setBootstrapping(false);
      toast({
        title: "Download Non Riuscito",
        description: liveProgress.error || "Errore durante il download dei componenti.",
        variant: "destructive",
      });
    }
  }, [liveProgress, bootstrapping, refetchStatus, toast]);

  const handleStartBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await apiRequest("POST", "/api/setup/bootstrap");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to trigger bootstrap");
      }
    } catch (err: unknown) {
      setBootstrapping(false);
      toast({
        title: "Errore Avvio Download",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleSaveRomFolder = async () => {
    if (!selectedRomPath.trim()) {
      toast({ title: "Percorso Richiesto", description: "Seleziona o digita una cartella per le ROM.", variant: "destructive" });
      return;
    }
    setSavingFolder(true);
    try {
      const res = await apiRequest("POST", "/api/setup/rom-folder", { path: selectedRomPath.trim() });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Impossibile salvare la cartella ROM");
      }
      toast({
        title: "Cartella Giochi Configurata",
        description: `Percorso impostato su: ${selectedRomPath.trim()}`,
      });
      void refetchStatus();
      setStep(2);
    } catch (err: unknown) {
      toast({
        title: "Errore Configurazione Cartella",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSavingFolder(false);
    }
  };

  const handleCompleteSetup = async () => {
    localStorage.setItem("ha_setup_wizard_completed", "true");
    setOpen(false);
    onOpenChange?.(false);
    toast({
      title: "Configurazione Completata! 🎮",
      description: "Benvenuto in HomeArcade. Avvio scansione iniziale della libreria...",
    });
    // Trigger initial scan in background
    try {
      await apiRequest("POST", "/api/scanner/scan-now");
      void queryClient.invalidateQueries({ queryKey: ["/api/roms"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
    } catch {
      // Ignored non-critical background scan trigger
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setOpen(false);
    onOpenChange?.(false);
  };

  const activeProgress = liveProgress || status?.progress;
  const progressPercent = activeProgress && activeProgress.totalItems > 0
    ? Math.round((activeProgress.completedItems / activeProgress.totalItems) * 100)
    : 0;

  const isCoresAndBiosComplete = Boolean(status?.isComplete);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !bootstrapping) {
            handleDismiss();
          }
        }}
      >
        <DialogContent className="max-w-xl bg-card border-border/80 shadow-2xl p-6 sm:rounded-xl">
          <DialogHeader className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/20 text-primary border border-primary/30">
                  <Sparkles className="size-5 fill-current" />
                </span>
                <div>
                  <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                    HomeArcade Setup Wizard
                    {status?.arch && (
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {status.arch}
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Configurazione guidata rapida per Home Assistant & Raspberry Pi
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={`size-2.5 rounded-full transition-colors ${
                      step === s ? "bg-primary" : step > s ? "bg-primary/40" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Stepper tabs header */}
            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-border/40 text-[11px] font-mono">
              <div
                className={`py-1 px-2 rounded text-center transition-colors ${
                  step === 1 ? "bg-primary/15 text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                1. Cartella ROM
              </div>
              <div
                className={`py-1 px-2 rounded text-center transition-colors ${
                  step === 2 ? "bg-primary/15 text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                2. Motori & BIOS
              </div>
              <div
                className={`py-1 px-2 rounded text-center transition-colors ${
                  step === 3 ? "bg-primary/15 text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                3. Pronto!
              </div>
            </div>
          </DialogHeader>

          {/* ── STEP 1: CARTELLA GIOCHI (ROM STORAGE) ───────────────────────── */}
          {step === 1 && (
            <div className="space-y-4 py-3">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <FolderOpen className="size-4 text-primary" /> Dove si trovano i tuoi giochi?
                </h4>
                <p className="text-xs text-muted-foreground">
                  Seleziona o sfoglia la cartella in cui caricare o recuperare le tue ROM. Puoi usare una condivisione Samba locale o un disco SSD esterno collegato al Raspberry Pi.
                </p>
              </div>

              {/* Quick source cards */}
              <div className="space-y-2">
                <div
                  onClick={() => setSelectedRomPath("/share/roms")}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedRomPath === "/share/roms"
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Network className="size-4 text-primary" /> Samba Share Locale
                    </span>
                    <Badge variant="secondary" className="font-mono text-[9px]">/share/roms</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ideale per trasferire giochi da PC tramite la rete locale (<code className="font-mono text-[10px]">\\homeassistant\share\roms</code>).
                  </p>
                </div>

                <div
                  onClick={() => setSelectedRomPath("/media/roms")}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedRomPath === "/media/roms"
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <HardDrive className="size-4 text-primary" /> SSD Esterno / Hard Disk USB
                    </span>
                    <Badge variant="secondary" className="font-mono text-[9px]">/media/roms</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ideale se colleghi un disco esterno USB o SSD al Raspberry Pi montato su <code className="font-mono text-[10px]">/media</code>.
                  </p>
                </div>

                <div
                  onClick={() => setSelectedRomPath(pathOrDefault(status?.suggestedLocations?.find(l => l.id === "internal")?.path, "/data/rom-storage"))}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedRomPath.includes("rom-storage")
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Layers className="size-4 text-primary" /> Storage Interno Add-on
                    </span>
                    <Badge variant="secondary" className="font-mono text-[9px]">/data/rom-storage</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Memoria persistente interna dell'add-on, comoda per iniziare subito con upload diretto dal browser.
                  </p>
                </div>
              </div>

              {/* Path input & custom folder browse button */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-mono uppercase text-muted-foreground">
                  Percorso selezionato:
                </label>
                <div className="flex gap-2">
                  <Input
                    value={selectedRomPath}
                    onChange={(e) => setSelectedRomPath(e.target.value)}
                    placeholder="/share/roms o /media/roms"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    className="gap-1.5 text-xs shrink-0"
                  >
                    <FolderOpen className="size-3.5" /> Sfoglia...
                  </Button>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-xs text-muted-foreground">
                  Annulla
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveRomFolder}
                  disabled={savingFolder || !selectedRomPath.trim()}
                  className="gap-1.5 text-xs font-mono uppercase tracking-wider"
                >
                  {savingFolder ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Salvataggio...
                    </>
                  ) : (
                    <>
                      Conferma Cartella <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: MOTORI & BIOS (RUNTIME DOWNLOAD) ───────────────────── */}
          {step === 2 && (
            <div className="space-y-4 py-3">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Cpu className="size-4 text-primary" /> Motori di Emulazione & BIOS
                </h4>
                <p className="text-xs text-muted-foreground">
                  Per mantenere l'immagine Docker snella (&lt;65 MB), i core nativi e i file di sistema vengono scaricati su richiesta direttamente nella memoria persistente (<code className="font-mono text-[10px]">/data</code>) del Raspberry Pi.
                </p>
              </div>

              {/* Status summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Cpu className="size-3.5 text-primary" /> Core Nativi
                    </span>
                    {status && (
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {status.installedCores} / {status.totalCores}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Core Libretro {status?.arch || "AArch64"} a 60 FPS (N64, PS1, Saturn, Arcade)
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <HardDrive className="size-3.5 text-primary" /> BIOS di Sistema
                    </span>
                    {status && (
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {status.installedBios} / {status.totalBios}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Verificati con checksum MD5 (~9.5 MB totali)
                  </p>
                </div>
              </div>

              {/* Progress or status box */}
              {bootstrapping || activeProgress?.active ? (
                <div className="space-y-2 p-3.5 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-2 text-foreground">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      {activeProgress?.stage === "cores" && "Download core nativi in corso..."}
                      {activeProgress?.stage === "bios" && "Download BIOS di sistema..."}
                      {activeProgress?.stage === "complete" && "Download completato!"}
                      {(!activeProgress?.stage || activeProgress?.stage === "idle") && "Preparazione download..."}
                    </span>
                    <span className="font-mono text-xs text-primary font-bold">
                      {progressPercent}%
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-2 bg-secondary" />
                  <p className="text-[11px] font-mono text-muted-foreground truncate">
                    {activeProgress?.currentItem || "Connessione al Libretro Buildbot..."}
                  </p>
                </div>
              ) : isCoresAndBiosComplete ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">Tutti i core e i BIOS sono già pronti!</p>
                    <p className="text-muted-foreground">
                      I giochi funzioneranno con lo streaming nativo WebRTC a 60 FPS sul tuo Raspberry Pi.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                    <AlertCircle className="size-3.5" /> Download al Primo Avvio
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Facendo clic su "Inizializza Motori & BIOS", i file verranno scaricati e verificati automaticamente. L'operazione richiede circa 1-2 minuti.
                  </p>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(1)}
                  disabled={bootstrapping}
                  className="gap-1 text-xs"
                >
                  <ArrowLeft className="size-3.5" /> Indietro
                </Button>

                {!bootstrapping && !isCoresAndBiosComplete ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep(3)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Salta (solo Browser WASM)
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleStartBootstrap}
                      className="gap-2 font-mono uppercase tracking-wider text-xs"
                    >
                      <Download className="size-3.5" /> Inizializza Motori & BIOS
                    </Button>
                  </div>
                ) : isCoresAndBiosComplete ? (
                  <Button
                    size="sm"
                    onClick={() => setStep(3)}
                    className="gap-1.5 font-mono uppercase tracking-wider text-xs"
                  >
                    Continua <ArrowRight className="size-3.5" />
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" /> Attendere completamento...
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: PRONTO AL GIOCO (RIEPILOGO & AVVIO) ────────────────── */}
          {step === 3 && (
            <div className="space-y-4 py-3">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-400" /> Setup Completato con Successo!
                </h4>
                <p className="text-xs text-muted-foreground">
                  Ecco il riepilogo della tua configurazione HomeArcade per Home Assistant:
                </p>
              </div>

              <div className="space-y-2.5 p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <FolderOpen className="size-3.5 text-primary" /> Cartella Monitorata:
                  </span>
                  <span className="font-mono font-semibold text-foreground truncate max-w-[240px]">
                    {selectedRomPath}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Zap className="size-3.5 text-primary" /> Motore Streaming Nativo:
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                    60 FPS WebRTC ({status?.arch || "aarch64"})
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <HardDrive className="size-3.5 text-primary" /> File BIOS & Core:
                  </span>
                  <span className="font-mono text-foreground font-semibold">
                    {status?.installedCores ?? 8} Core / {status?.installedBios ?? 4} BIOS
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Puoi aggiungere altre cartelle o modificare i percorsi in qualsiasi momento dalle impostazioni di HomeArcade in <strong>Libreria &gt; Cartelle &amp; Scansione</strong>.
              </p>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(2)}
                  className="gap-1 text-xs"
                >
                  <ArrowLeft className="size-3.5" /> Indietro
                </Button>

                <Button
                  size="sm"
                  onClick={handleCompleteSetup}
                  className="gap-2 font-mono uppercase tracking-wider text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Check className="size-3.5" /> Completa Setup e Avvia Arcade
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Directory picker sub-dialog */}
      <DirectoryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(newPath) => {
          setSelectedRomPath(newPath);
          setPickerOpen(false);
        }}
        title="Seleziona Cartella ROM"
        description="Sfoglia le cartelle montate in Home Assistant (/share, /media, /data)."
      />
    </>
  );
}

function pathOrDefault(val: string | undefined, fallback: string): string {
  return val && val.trim().length > 0 ? val : fallback;
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Cpu,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  Zap,
  Check,
} from "lucide-react";

interface SetupStatus {
  isComplete: boolean;
  arch: string;
  totalCores: number;
  installedCores: number;
  totalBios: number;
  installedBios: number;
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
  const [bootstrapping, setBootstrapping] = useState(false);

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

  // Auto-open on initial load if setup is not complete and user hasn't dismissed it
  useEffect(() => {
    if (forceOpen !== undefined) {
      setOpen(forceOpen);
      return;
    }
    if (status && !status.isComplete && !dismissed) {
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
        title: "Setup Complete",
        description: "Native Libretro cores and BIOS files have been installed successfully.",
      });
    } else if (bootstrapping && liveProgress?.stage === "error") {
      setBootstrapping(false);
      toast({
        title: "Setup Failed",
        description: liveProgress.error || "An error occurred during bootstrap.",
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
        title: "Setup Initialization Failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
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

  const isComplete = status?.isComplete;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !bootstrapping) {
          handleDismiss();
        }
      }}
    >
      <DialogContent className="max-w-lg bg-card border-border/80 shadow-2xl p-6 sm:rounded-xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/20 text-primary border border-primary/30">
              <Zap className="size-5 fill-current" />
            </span>
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Native Emulation Setup
                {status?.arch && (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {status.arch}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Download optimized Libretro cores and BIOS files into persistent storage (<code className="text-foreground font-mono">/data</code>) for high-performance native streaming on Raspberry Pi.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Status summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <Cpu className="size-3.5 text-primary" /> Native Cores
                </span>
                {status && (
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {status.installedCores} / {status.totalCores}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Libretro AArch64 / x86_64 cores (N64, PS1, Saturn, Arcade)
              </p>
            </div>

            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <HardDrive className="size-3.5 text-primary" /> System BIOS
                </span>
                {status && (
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {status.installedBios} / {status.totalBios}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Verified MD5 checksums (~9.5 MB total, preserved in backups)
              </p>
            </div>
          </div>

          {/* Progress or Status detail */}
          {bootstrapping || activeProgress?.active ? (
            <div className="space-y-2 p-3.5 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  {activeProgress?.stage === "cores" && "Downloading native cores..."}
                  {activeProgress?.stage === "bios" && "Downloading system BIOS..."}
                  {activeProgress?.stage === "complete" && "Setup finished!"}
                  {(!activeProgress?.stage || activeProgress?.stage === "idle") && "Preparing download..."}
                </span>
                <span className="font-mono text-xs text-primary font-bold">
                  {progressPercent}%
                </span>
              </div>
              <Progress value={progressPercent} className="h-2 bg-secondary" />
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                {activeProgress?.currentItem || "Contacting Libretro Buildbot..."}
              </p>
            </div>
          ) : isComplete ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">All cores and essential BIOS are ready</p>
                <p className="text-muted-foreground">
                  Games will run with native WebRTC streaming at 60 FPS on your Raspberry Pi.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <AlertCircle className="size-3.5" /> First-Run Download Required
              </div>
              <p className="text-[11px] leading-relaxed">
                To keep the Home Arcade add-on Docker image under 80 MB, native cores and BIOS are downloaded directly into persistent storage on first launch.
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
          {!bootstrapping && !isComplete ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Skip (Browser WASM only)
              </Button>
              <Button
                size="sm"
                onClick={handleStartBootstrap}
                className="gap-2 font-mono uppercase tracking-wider text-xs"
              >
                <Download className="size-3.5" /> Initialize Cores & BIOS
              </Button>
            </>
          ) : isComplete ? (
            <div className="w-full flex justify-end">
              <Button
                size="sm"
                onClick={handleDismiss}
                className="gap-1.5 font-mono uppercase tracking-wider text-xs"
              >
                <Check className="size-3.5" /> Continue to Arcade
              </Button>
            </div>
          ) : (
            <div className="w-full flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Please keep this window open while downloading...
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

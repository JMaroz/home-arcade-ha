import React, { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CloudDownload, Loader2, CheckCircle2, AlertCircle, Archive } from "lucide-react";

interface DownloadJob {
  id: string;
  system: string;
  title: string;
  fileName: string;
  status: "pending" | "downloading" | "extracting" | "indexing" | "completed" | "error" | "cancelled";
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  error?: string;
  extractionProgress?: {
    current: number;
    total: number;
    currentFileName?: string;
  };
}

function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function GlobalDownloadBanner() {
  const { toast } = useToast();
  const prevStatusesRef = useRef<Record<string, string>>({});

  const { data: downloadJobs = [] } = useQuery<DownloadJob[]>({
    queryKey: ["/api/archive/downloads"],
    refetchInterval: 1500,
  });

  // Track status changes and trigger toasts
  useEffect(() => {
    const prevStatuses = prevStatusesRef.current;
    const newStatuses: Record<string, string> = {};

    for (const job of downloadJobs) {
      newStatuses[job.id] = job.status;
      const prev = prevStatuses[job.id];

      if (prev && prev !== job.status) {
        if (job.status === "extracting") {
          toast({
            title: "Decompressione Iniziata",
            description: `Unzipping dei file in corso per "${job.title}". Questa operazione potrebbe richiedere alcuni minuti...`,
          });
        } else if (job.status === "completed") {
          toast({
            title: "Download e Decompressione Completati",
            description: `"${job.title}" è stato scaricato, estratto e aggiunto alla libreria!`,
          });
        } else if (job.status === "error") {
          toast({
            title: "Errore Download / Estrazione",
            description: job.error || `Impossibile completare il download per "${job.title}".`,
            variant: "destructive",
          });
        }
      }
    }

    prevStatusesRef.current = newStatuses;
  }, [downloadJobs, toast]);

  const activeJobs = downloadJobs.filter(
    (j) => j.status === "downloading" || j.status === "extracting" || j.status === "indexing" || j.status === "pending"
  );

  if (activeJobs.length === 0) {
    return null;
  }

  const primaryJob = activeJobs[0];

  const openDownloader = () => {
    window.dispatchEvent(new Event("homearcade:open-archive-download"));
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 max-w-sm w-full bg-[#14141d]/95 backdrop-blur-md border border-primary/30 shadow-2xl rounded-2xl p-3.5 text-white animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-7 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            {primaryJob.status === "extracting" ? (
              <Archive className="size-3.5 animate-bounce" />
            ) : (
              <CloudDownload className="size-3.5 animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">{primaryJob.title}</div>
            <div className="text-[10px] font-mono text-muted-foreground truncate">
              {primaryJob.status === "extracting"
                ? primaryJob.extractionProgress
                  ? `Estrazione file ${primaryJob.extractionProgress.current}/${primaryJob.extractionProgress.total}...`
                  : "Estrazione archivio in corso..."
                : primaryJob.status === "indexing"
                ? "Indicizzazione nella libreria..."
                : `${fmtBytes(primaryJob.downloadedBytes)} / ${fmtBytes(primaryJob.totalBytes)} (${fmtBytes(primaryJob.speedBytesPerSec)}/s)`}
            </div>
          </div>
        </div>

        <Badge
          variant="outline"
          className="shrink-0 font-mono text-[9px] uppercase tracking-wider bg-primary/10 border-primary/30 text-primary"
        >
          {primaryJob.status === "extracting" ? (
            <span className="flex items-center gap-1">
              <Loader2 className="size-2.5 animate-spin" /> Estrazione
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Loader2 className="size-2.5 animate-spin" /> {primaryJob.status}
            </span>
          )}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span>Avanzamento</span>
          <span className="font-bold text-primary">{primaryJob.progress}%</span>
        </div>
        <Progress value={primaryJob.progress} className="h-1.5 bg-white/10" />
      </div>

      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-white/10">
        <span className="text-[10px] font-mono text-muted-foreground">
          {activeJobs.length > 1 ? `+${activeJobs.length - 1} altri download in coda` : "Background process"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={openDownloader}
          className="h-6 text-[10px] px-2.5 text-primary hover:text-white hover:bg-primary/20 rounded-lg font-bold uppercase tracking-wider"
        >
          Apri Downloader
        </Button>
      </div>
    </div>
  );
}

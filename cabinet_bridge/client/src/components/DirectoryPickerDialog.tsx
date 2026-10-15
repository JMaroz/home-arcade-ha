import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiUrl } from "@/lib/queryClient";
import { FolderOpen, ChevronLeft, HardDrive, Plus, Loader2 } from "lucide-react";

interface DirectoryEntry {
  name: string;
  path: string;
  readable: boolean;
}

interface DirectoryRoot {
  id: string;
  label: string;
  path: string;
  available: boolean;
}

interface DirectoryBrowseResponse {
  currentPath: string;
  parentPath: string | null;
  roots: DirectoryRoot[];
  directories: DirectoryEntry[];
}

interface DirectoryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  /** Override the title text */
  title?: string;
  /** Override the description text */
  description?: string;
  /** Show "suggested" quick-root buttons alongside the normal browse roots */
  suggestedRoots?: { label: string; path: string }[];
}

export function DirectoryPickerDialog({
  open,
  onOpenChange,
  onSelect,
  title = "Choose ROM directory",
  description = "Browse paths visible inside the HomeArcade add-on. External drives are usually under /media or /mnt.",
  suggestedRoots,
}: DirectoryPickerDialogProps) {
  const { toast } = useToast();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [browseData, setBrowseData] = useState<DirectoryBrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrentPath(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = currentPath ? `?path=${encodeURIComponent(currentPath)}` : "";
    fetch(apiUrl(`/api/filesystem/directories${params}`))
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
        return res.json() as Promise<DirectoryBrowseResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setBrowseData(data);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast({ title: "Unable to browse folders", description: message, variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath, open, toast]);

  const allRoots = [
    ...(suggestedRoots?.map((r) => ({
      id: `suggested-${r.label}`,
      label: r.label,
      path: r.path,
      available: true,
    })) ?? []),
    ...(browseData?.roots ?? []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => e.stopPropagation()}
        onInteractOutside={(e) => e.stopPropagation()}
        className="sm:max-w-2xl bg-[#0c0c0c] border-white/10 text-white max-h-[92dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
            <FolderOpen className="size-5 text-accent" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-white/45">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {allRoots.map((root) => (
              <Button
                key={root.id}
                type="button"
                variant={browseData?.currentPath === root.path ? "default" : "outline"}
                size="sm"
                disabled={!root.available || loading}
                onClick={() => setCurrentPath(root.path)}
                className="gap-1.5 text-[10px] font-black uppercase tracking-wider"
                title={root.path}
              >
                <HardDrive className="size-3.5" />
                {root.label}
              </Button>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current directory</p>
                <p className="truncate font-mono text-xs text-foreground" title={browseData?.currentPath}>
                  {browseData?.currentPath ?? "Loading..."}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!browseData?.parentPath || loading}
                  onClick={() => browseData?.parentPath && setCurrentPath(browseData.parentPath)}
                  className="gap-1.5"
                >
                  <ChevronLeft className="size-3.5" />
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!browseData?.currentPath}
                  onClick={() => {
                    if (!browseData?.currentPath) return;
                    onSelect(browseData.currentPath);
                    onOpenChange(false);
                  }}
                  className="gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Use this
                </Button>
              </div>
            </div>

            <ScrollArea className="h-72">
              <div className="space-y-1 p-2">
                {loading ? (
                  <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Loading directories...
                  </div>
                ) : error ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
                ) : browseData?.directories.length ? (
                  browseData.directories.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      disabled={!entry.readable}
                      onClick={() => setCurrentPath(entry.path)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-mono text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      title={entry.path}
                    >
                      <FolderOpen className="size-4 shrink-0 text-accent" />
                      <span className="truncate">{entry.name}</span>
                      {!entry.readable && <span className="ml-auto text-[9px] uppercase tracking-widest text-destructive">Unreadable</span>}
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col h-40 items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
                    <FolderOpen className="size-6 opacity-40" />
                    <span>No subdirectories found.</span>
                    <span className="leading-relaxed text-muted-foreground/60">
                      Mount external storage in Settings → System → Storage in Home Assistant, then refresh.
                    </span>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
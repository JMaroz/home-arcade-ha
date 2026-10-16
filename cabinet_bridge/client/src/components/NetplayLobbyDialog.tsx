/**
 * NetplayLobbyDialog
 *
 * Shows open netplay rooms for this server, lets the user host a new room
 * (getting back a shareable 6-char code) or join an existing one by code.
 * Once both players are connected the game launches automatically.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";
import { Wifi, WifiOff, Copy, Users, Loader2, ArrowRight } from "lucide-react";
import type { Game } from "@/data/library";

interface OpenRoom {
  code: string;
  romHash: string | null;
  createdAt: number;
}

export function NetplayLobbyDialog({
  game,
  open,
  profileId = 1,
  onClose,
}: {
  game: Game;
  open: boolean;
  profileId?: number;
  onClose: () => void;
}) {
  const [view, setView]             = useState<"lobby" | "hosting" | "joining">("lobby");
  const [dispCode, setDispCode]     = useState("");
  const [joinCode, setJoinCode]     = useState("");
  const [peerJoined, setPeerJoined] = useState(false);
  const [wsStatus, setWsStatus]     = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  // Use a ref so WS message handlers always see the latest code
  const codeRef = useRef("");
  const wsRef   = useRef<WebSocket | null>(null);

  // List open rooms, refreshed every 5 s
  const { data: rooms = [] } = useQuery<OpenRoom[]>({
    queryKey: ["/api/netplay/rooms"],
    refetchInterval: 5_000,
  });

  const wsUrl = apiUrl("/api/netplay").replace(/^http/, "ws");

  const launchNetplay = useCallback(
    (role: "host" | "client", code: string) => {
      if (!game.romId) return;
      const returnTo = encodeURIComponent(window.location.href);
      window.location.href = apiUrl(
        `/api/roms/${game.romId}/player?return=${returnTo}&profile=${profileId}&netplay_role=${role}&netplay_room=${code}`,
      );
    },
    [game.romId, profileId],
  );

  const openWs = useCallback(
    (firstMessage: any) => {
      if (wsRef.current) wsRef.current.close();
      setWsStatus("connecting");
      setErrorMsg(null);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        // Always include ROM hash if we have it
        if (game.romHash) firstMessage.romHash = game.romHash;
        ws.send(JSON.stringify(firstMessage));
      };

      ws.onerror = () => setWsStatus("error");

      ws.onmessage = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data as string) as Record<string, unknown>;
          const type = msg.type as string | undefined;

          if (type === "room-created") {
            const code = msg.room as string;
            codeRef.current = code;
            setDispCode(code);
            setView("hosting");
            return;
          }

          if (type === "room-joined") {
            const code = msg.room as string;
            codeRef.current = code;
            setDispCode(code);
            setView("joining");
            // Brief render, then navigate
            setTimeout(() => launchNetplay("client", code), 600);
            return;
          }

          if (type === "peer-joined") {
            setPeerJoined(true);
            setTimeout(() => launchNetplay("host", codeRef.current), 800);
            return;
          }

          if (type === "error") {
            setWsStatus("error");
            setErrorMsg(msg.message as string);
          }
        } catch { /* binary relay data — ignore in lobby */ }
      };

      ws.onclose = () => setWsStatus((s) => (s === "connecting" ? "error" : s));
    },
    [wsUrl, launchNetplay, game.romHash],
  );

  const handleHostRoom = () => openWs({ type: "create-room" });

  const handleJoinCode = (code: string) => {
    if (code.length !== 6) return;
    openWs({ type: "join-room", room: code });
  };

  // Clean up WS on unmount
  useEffect(() => () => { wsRef.current?.close(); }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md bg-card border-card-border max-h-[92dvh] overflow-y-auto"
        data-testid="dialog-netplay-lobby"
      >
        <DialogTitle className="flex items-center gap-3 font-display text-xl text-white pb-2 border-b border-white/10">
          <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(236,72,153,0.3)]">
            <Wifi className="size-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-mono uppercase tracking-widest text-primary/80">Multiplayer</span>
            <span className="leading-none">{game.title}</span>
          </div>
        </DialogTitle>

        {/* ── Lobby ─────────────────────────────────────────────── */}
        {view === "lobby" && (
          <div className="space-y-6 pt-4">
            {/* WebRTC Stream Co-Op Recommended Banner */}
            <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold text-sky-300 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sky-400 animate-pulse" />
                  WebRTC Stream Co-Op (Consigliato)
                </span>
                <span className="text-[9px] font-mono font-bold text-sky-400/80 uppercase">Zero Desync</span>
              </div>
              <p className="text-[11px] text-sky-100/70 leading-relaxed">
                Condividi lo schermo a 60 FPS con un amico sul cellulare o PC tramite codice QR. Nessun download di ROM per il secondo giocatore.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  if (!game.romId) return;
                  const returnTo = encodeURIComponent(window.location.href);
                  window.location.href = apiUrl(`/api/roms/${game.romId}/stream-player?return=${returnTo}&profile=${profileId}`);
                }}
                className="w-full h-9 bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-bold uppercase tracking-wider gap-2 mt-1"
              >
                Avvia Stream Co-Op (Host)
              </Button>
            </div>

            {/* Open rooms */}
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                  <Users className="size-3" /> Open rooms
                </p>
                <span className="text-[9px] font-mono text-primary animate-pulse uppercase tracking-wider">Auto-refreshing</span>
              </div>
              
              <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                {rooms.length === 0 ? (
                  <div className="py-12 text-center rounded-2xl border border-dashed border-white/10 bg-black/20 backdrop-blur-md">
                    <WifiOff className="size-8 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">No open rooms yet.</p>
                    <p className="text-[10px] text-muted-foreground/50 uppercase tracking-tight">Host one below to play with friends</p>
                  </div>
                ) : (
                  rooms.map((r) => {
                    const isCompatible = !r.romHash || !game.romHash || r.romHash === game.romHash;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => isCompatible && handleJoinCode(r.code)}
                        disabled={!isCompatible}
                        className={`w-full group relative overflow-hidden rounded-xl border transition-all duration-300 ${
                          isCompatible 
                            ? "bg-gradient-to-r from-white/5 to-white/[0.02] border-white/10 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_20px_rgba(236,72,153,0.1)] active:scale-[0.98]" 
                            : "opacity-40 cursor-not-allowed bg-black/40 border-white/5"
                        }`}
                        data-testid={`button-join-open-room-${r.code}`}
                      >
                        {isCompatible && (
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                        <div className="relative z-10 flex items-center justify-between px-4 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-display text-lg tracking-[0.3em] font-black text-white group-hover:text-primary transition-colors">
                              {r.code}
                            </span>
                            {!isCompatible && (
                              <span className="px-1.5 py-0.5 rounded-sm bg-red-500/20 text-[8px] text-red-400 font-bold uppercase tracking-widest border border-red-500/30">ROM Mismatch</span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 text-right">
                             <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono font-bold uppercase">
                                <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
                                1/2 players
                             </div>
                             <span className="text-[9px] text-muted-foreground/60 font-mono italic">
                               Started {formatAge(r.createdAt)} ago
                             </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="relative">
               <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none z-20" />
               <div className="grid grid-cols-1 gap-4 pt-2">
                  {/* Host new room */}
                  <Button
                    size="lg"
                    onClick={handleHostRoom}
                    disabled={wsStatus === "connecting"}
                    className="w-full h-14 relative group overflow-hidden bg-primary hover:bg-primary/90 text-white border-b-4 border-black/20 active:border-b-0 active:translate-y-[2px] transition-all"
                    data-testid="button-host-room"
                  >
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center justify-center gap-3 font-display font-black uppercase tracking-widest">
                      {wsStatus === "connecting"
                        ? <Loader2 className="size-5 animate-spin" />
                        : <Wifi className="size-5" />}
                      Host New Room
                    </div>
                  </Button>

                  {/* Join by code */}
                  <div className="relative group">
                    <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-primary/30 to-blue-500/30 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                    <div className="relative flex gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10 group-focus-within:border-primary/50 transition-all">
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                        onKeyDown={(e) => e.key === "Enter" && handleJoinCode(joinCode)}
                        placeholder="ROOM CODE"
                        maxLength={6}
                        className="flex-1 bg-transparent px-4 py-2 font-display text-lg tracking-[0.4em] font-black text-white placeholder:text-white/10 focus:outline-none uppercase"
                        data-testid="input-join-room-code"
                      />
                      <Button
                        onClick={() => handleJoinCode(joinCode)}
                        disabled={joinCode.length !== 6 || wsStatus === "connecting"}
                        variant="secondary"
                        className="h-10 px-6 font-display font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-white border-white/10"
                        data-testid="button-join-room"
                      >
                        Join
                      </Button>
                    </div>
                  </div>
               </div>
            </div>

            {(wsStatus === "error" || errorMsg) && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in slide-in-from-top-2 duration-300">
                <WifiOff className="size-5 shrink-0" />
                <p className="text-[11px] font-mono font-black uppercase tracking-tight leading-tight">
                  {errorMsg || "Signaling server disconnected. Please try again."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Hosting ───────────────────────────────────────────── */}
        {view === "hosting" && (
          <div className="space-y-6 pt-4 animate-in zoom-in-95 duration-300">
            <div className="relative group">
              <div className="absolute -inset-2 rounded-2xl bg-primary/20 blur-xl animate-pulse opacity-50" />
              <div className="relative rounded-2xl border-2 border-primary/50 bg-black/60 p-8 text-center space-y-4 shadow-[0_0_40px_rgba(236,72,153,0.2)]">
                <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-primary/80 font-black">
                  Lobby Active
                </p>
                <div className="relative flex items-center justify-center">
                  <p
                    className="font-display text-6xl font-black tracking-[0.2em] text-white select-all drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                    data-testid="text-room-code"
                  >
                    {dispCode}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(dispCode);
                    // Could add a local "Copied" toast here if needed
                  }}
                  className="h-8 gap-2 text-[10px] text-primary hover:text-primary hover:bg-primary/10 font-black uppercase tracking-widest"
                  data-testid="button-copy-room-code"
                >
                  <Copy className="size-3" /> Copy Code
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {peerJoined ? (
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-green-500/50 bg-green-500/10 text-green-400 animate-bounce">
                  <Users className="size-5" />
                  <p className="text-xs font-display font-black uppercase tracking-widest">
                    Player 2 Connected!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-4">
                  <div className="flex gap-2">
                    <div className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                    <div className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                    <div className="size-2 rounded-full bg-primary animate-bounce" />
                  </div>
                  <p className="text-[11px] font-mono font-black text-muted-foreground uppercase tracking-widest">
                    Waiting for Peer...
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => { wsRef.current?.close(); setView("lobby"); setDispCode(""); setPeerJoined(false); setWsStatus("idle"); }}
                className="w-full h-12 text-white/50 hover:text-white border-white/10 hover:bg-white/5 font-display font-black uppercase tracking-widest"
              >
                Close Room
              </Button>
            </div>
          </div>
        )}

        {/* ── Joining ───────────────────────────────────────────── */}
        {view === "joining" && (
          <div className="space-y-6 pt-4 text-center animate-in zoom-in-95 duration-300">
            <div className="rounded-2xl border-2 border-green-500/50 bg-black/60 p-8 space-y-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-green-400 font-black">
                Joining Session
              </p>
              <p className="font-display text-5xl font-black tracking-[0.2em] text-white">
                {dispCode}
              </p>
            </div>
            
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="size-10 text-green-400 animate-spin" />
              <p className="text-xs font-display font-black text-white/50 uppercase tracking-widest animate-pulse">
                Synchronizing Game State...
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatAge(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

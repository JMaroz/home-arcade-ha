import { escapeHtml } from "./utils";

interface StreamPlayerOptions {
  title: string;
  returnTo: string;
  romId: number;
  system: string;
  profileId?: number;
}

export function renderStreamPlayerPage({
  title,
  returnTo,
  romId,
  system,
  profileId = 1,
}: StreamPlayerOptions): string {
  const safeTitle = escapeHtml(title);
  const safeReturnTo = JSON.stringify(returnTo);
  const safeSystem = escapeHtml(system || "generic");
  const wasmPlayerUrl = `/api/roms/${romId}/player?return=${encodeURIComponent(returnTo)}&profile=${profileId}&engine=wasm`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${safeTitle} · Native Stream · HomeArcade</title>
    <style>
      html, body {
        width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #000;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        color: #fff;
      }
      #video-container {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: #000;
      }
      video {
        width: 100%; height: 100%; object-fit: contain; max-width: 100vw; max-height: 100vh;
        image-rendering: pixelated; image-rendering: crisp-edges;
      }
      .hud-overlay {
        position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: rgba(5, 5, 10, 0.92); z-index: 1000; padding: 24px; text-align: center;
        transition: opacity 300ms ease, visibility 300ms ease;
      }
      .hud-overlay.is-hidden {
        opacity: 0; visibility: hidden; pointer-events: none;
      }
      .hud-card {
        max-width: 440px; width: 100%; background: rgba(18, 18, 28, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 28px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
      }
      .hud-title {
        font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;
        color: #ec4899; margin-bottom: 8px;
      }
      .hud-subtitle {
        font-size: 13px; color: rgba(255, 255, 255, 0.7); margin-bottom: 20px; line-height: 1.5;
      }
      .spinner {
        display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(236, 72, 153, 0.3);
        border-radius: 50%; border-top-color: #ec4899; animation: spin 1s ease-in-out infinite; margin-bottom: 16px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 12px 20px; border-radius: 12px; font-weight: 700; font-size: 12px;
        letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; text-decoration: none;
        transition: all 180ms ease; border: none; outline: none; margin: 4px;
      }
      .btn-primary { background: #ec4899; color: #fff; }
      .btn-primary:hover { background: #db2777; transform: translateY(-1px); }
      .btn-secondary { background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.15); }
      .btn-secondary:hover { background: rgba(255, 255, 255, 0.18); }
      .menu-btn {
        position: fixed; z-index: 999; top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left));
        background: rgba(10, 10, 18, 0.7); border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff; padding: 10px 18px; border-radius: 999px; font-weight: 800; font-size: 11px;
        letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; backdrop-filter: blur(12px);
      }
      .menu-btn:hover { background: rgba(236, 72, 153, 0.4); border-color: #ec4899; }
      .stats-badge {
        position: fixed; z-index: 999; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));
        background: rgba(10, 10, 18, 0.7); border: 1px solid rgba(255, 255, 255, 0.15);
        color: #10b981; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
        backdrop-filter: blur(8px);
      }
    </style>
  </head>
  <body>
    <div id="video-container">
      <video id="remote-video" autoplay playsinline muted></video>
    </div>

    <button id="menu-trigger" class="menu-btn">Menu</button>
    <div id="stats" class="stats-badge">STREAM · 60 FPS</div>

    <!-- Loading / Status HUD -->
    <div id="status-hud" class="hud-overlay">
      <div class="hud-card">
        <div id="hud-spinner" class="spinner"></div>
        <div id="hud-title" class="hud-title">Connecting Stream</div>
        <div id="hud-sub" class="hud-subtitle">
          Initializing Native Libretro WebRTC engine on Raspberry Pi...
        </div>
        <div id="hud-actions" style="display: none; margin-top: 16px;">
          <a href="${wasmPlayerUrl}" class="btn btn-primary">
            ▶ Play with WebAssembly
          </a>
          <button id="retry-btn" class="btn btn-secondary">
            Retry Connection
          </button>
        </div>
      </div>
    </div>

    <!-- Pause/Arcade Menu Modal -->
    <div id="menu-overlay" class="hud-overlay is-hidden">
      <div class="hud-card">
        <div class="hud-title">${safeTitle}</div>
        <div class="hud-subtitle">Native Low-Latency Stream · ${safeSystem.toUpperCase()}</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="btn-unmute" class="btn btn-secondary">🔊 Unmute Audio</button>
          <button id="btn-fullscreen" class="btn btn-secondary">⛶ Toggle Fullscreen</button>
          <a href="${wasmPlayerUrl}" class="btn btn-secondary">
            🌐 Switch to WebAssembly Engine
          </a>
          <button id="btn-resume" class="btn btn-primary">Resume Game</button>
          <button id="btn-exit" class="btn btn-secondary" style="border-color: rgba(239, 68, 68, 0.3); color: #fca5a5;">
            Exit to HomeArcade
          </button>
        </div>
      </div>
    </div>

    <script>
      (function() {
        const returnUrl = ${safeReturnTo};
        const romId = ${romId};
        const video = document.getElementById("remote-video");
        const statusHud = document.getElementById("status-hud");
        const hudTitle = document.getElementById("hud-title");
        const hudSub = document.getElementById("hud-sub");
        const hudSpinner = document.getElementById("hud-spinner");
        const hudActions = document.getElementById("hud-actions");
        const menuOverlay = document.getElementById("menu-overlay");
        const menuBtn = document.getElementById("menu-trigger");
        const retryBtn = document.getElementById("retry-btn");
        const btnResume = document.getElementById("btn-resume");
        const btnExit = document.getElementById("btn-exit");
        const btnFullscreen = document.getElementById("btn-fullscreen");
        const btnUnmute = document.getElementById("btn-unmute");
        const statsBadge = document.getElementById("stats");

        let pc = null;
        let dataChannel = null;
        let sessionId = null;
        let pollGamepadInterval = null;

        function showError(title, message) {
          statusHud.classList.remove("is-hidden");
          hudSpinner.style.display = "none";
          hudTitle.textContent = title;
          hudTitle.style.color = "#ef4444";
          hudSub.textContent = message;
          hudActions.style.display = "block";
        }

        async function initWebRTC() {
          statusHud.classList.remove("is-hidden");
          hudSpinner.style.display = "inline-block";
          hudActions.style.display = "none";
          hudTitle.textContent = "Connecting Stream";
          hudTitle.style.color = "#ec4899";
          hudSub.textContent = "Negotiating WebRTC PeerConnection with Raspberry Pi...";

          try {
            // 1. Start streaming session
            const startRes = await fetch("/api/stream/start/" + romId, { method: "POST" });
            if (!startRes.ok) {
              const err = await startRes.json().catch(() => ({}));
              throw new Error(err.message || "Failed to start streaming session");
            }
            const startData = await startRes.json();
            sessionId = startData.sessionId;

            // 2. Create PeerConnection
            pc = new RTCPeerConnection({
              iceServers: startData.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]
            });

            // 3. Setup transceivers for receiving video and audio
            pc.addTransceiver("video", { direction: "recvonly" });
            pc.addTransceiver("audio", { direction: "recvonly" });

            // 4. Create DataChannel for low-latency gamepad & keyboard input
            dataChannel = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
            dataChannel.onopen = () => {
              console.log("[stream] Input DataChannel opened");
              startInputLoop();
            };

            pc.ontrack = (event) => {
              console.log("[stream] Received remote track:", event.track.kind);
              if (event.streams && event.streams[0]) {
                video.srcObject = event.streams[0];
              } else {
                const stream = new MediaStream([event.track]);
                video.srcObject = stream;
              }
              statusHud.classList.add("is-hidden");
            };

            pc.onicecandidate = (event) => {
              if (event.candidate && sessionId) {
                fetch("/api/stream/candidate/" + sessionId, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(event.candidate)
                }).catch(() => {});
              }
            };

            pc.onconnectionstatechange = () => {
              console.log("[stream] WebRTC connection state:", pc.connectionState);
              if (pc.connectionState === "connected") {
                statusHud.classList.add("is-hidden");
                statsBadge.textContent = "CONNECTED · 60 FPS";
              } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
                showError("Stream Disconnected", "The connection to the native emulation runner was lost.");
              }
            };

            // 5. Create and send SDP Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const signalRes = await fetch("/api/stream/signal/" + sessionId, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
            });

            if (!signalRes.ok) {
              const sigErr = await signalRes.json().catch(() => ({}));
              throw new Error(sigErr.message || "Failed to exchange SDP signal with runner");
            }

            const answer = await signalRes.json();
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

          } catch (err) {
            console.error("[stream] Setup failed:", err);
            showError("Native Stream Unavailable", (err && err.message) || String(err));
          }
        }

        // Input loop sending gamepad buttons over DataChannel
        function startInputLoop() {
          if (pollGamepadInterval) clearInterval(pollGamepadInterval);
          pollGamepadInterval = setInterval(() => {
            if (!dataChannel || dataChannel.readyState !== "open") return;
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = gamepads[0];
            if (gp) {
              const buttons = gp.buttons.map(b => b.pressed ? 1 : 0);
              const axes = gp.axes.map(a => Math.round(a * 100) / 100);
              dataChannel.send(JSON.stringify({ type: "pad", b: buttons, a: axes }));
            }
          }, 16); // ~60 Hz
        }

        // Keyboard forwarding
        window.addEventListener("keydown", (e) => {
          if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(JSON.stringify({ type: "key", state: "down", code: e.code }));
          }
        });
        window.addEventListener("keyup", (e) => {
          if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(JSON.stringify({ type: "key", state: "up", code: e.code }));
          }
        });

        // UI Event Listeners
        menuBtn.addEventListener("click", () => menuOverlay.classList.remove("is-hidden"));
        btnResume.addEventListener("click", () => menuOverlay.classList.add("is-hidden"));
        retryBtn.addEventListener("click", () => initWebRTC());
        btnUnmute.addEventListener("click", () => {
          video.muted = false;
          video.play().catch(() => {});
          btnUnmute.textContent = video.muted ? "🔊 Unmute Audio" : "🔇 Mute Audio";
        });
        btnFullscreen.addEventListener("click", () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        });
        btnExit.addEventListener("click", () => {
          if (sessionId) {
            fetch("/api/stream/stop/" + sessionId, { method: "POST" }).catch(() => {});
          }
          window.location.href = returnUrl || "/";
        });

        // Start connection
        initWebRTC();
      })();
    </script>
  </body>
</html>`;
}

import { escapeHtml } from "./utils";

interface StreamPlayerOptions {
  title: string;
  returnTo: string;
  romId: number;
  system: string;
  profileId?: number;
  ingressBase?: string;
}

export function renderStreamPlayerPage({
  title,
  returnTo,
  romId,
  system,
  profileId = 1,
  ingressBase = "",
}: StreamPlayerOptions): string {
  const safeTitle = escapeHtml(title);
  const safeReturnTo = JSON.stringify(returnTo);
  const safeSystem = escapeHtml(system || "generic");
  const safeIngressBase = JSON.stringify(ingressBase);
  const wasmPlayerUrl = `${ingressBase}/api/roms/${romId}/player?return=${encodeURIComponent(returnTo)}&profile=${profileId}&engine=wasm`;

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
        position: fixed; z-index: 999; top: max(12px, env(safe-area-inset-top));
        background: rgba(10, 10, 18, 0.75); border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff; padding: 8px 16px; border-radius: 999px; font-weight: 800; font-size: 11px;
        letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; backdrop-filter: blur(12px);
        transition: all 180ms ease;
      }
      .menu-btn:hover { background: rgba(236, 72, 153, 0.4); border-color: #ec4899; }
      #menu-trigger { left: max(12px, env(safe-area-inset-left)); }
      #coop-trigger { left: max(96px, calc(env(safe-area-inset-left) + 84px)); border-color: rgba(56, 189, 248, 0.4); }
      #coop-trigger:hover { background: rgba(56, 189, 248, 0.3); border-color: #38bdf8; }
      #hud-trigger { left: max(184px, calc(env(safe-area-inset-left) + 172px)); border-color: rgba(16, 185, 129, 0.4); }
      #hud-trigger:hover { background: rgba(16, 185, 129, 0.3); border-color: #10b981; }

      .stats-badge {
        position: fixed; z-index: 999; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));
        background: rgba(10, 10, 18, 0.75); border: 1px solid rgba(255, 255, 255, 0.15);
        color: #10b981; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
        backdrop-filter: blur(8px); cursor: pointer; user-select: none;
      }
      .stats-badge:hover { border-color: #10b981; }
      .qr-box {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: #fff; padding: 12px; border-radius: 12px; margin: 16px auto; width: 180px; height: 180px;
      }
      .qr-box img { width: 100%; height: 100%; image-rendering: pixelated; }
      .copy-input-row {
        display: flex; gap: 8px; width: 100%; margin-top: 8px;
      }
      .copy-input {
        flex: 1; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0; padding: 8px 12px; border-radius: 8px; font-size: 11px; font-family: inherit;
        outline: none; text-overflow: ellipsis;
      }
      .telemetry-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 16px 0; text-align: left;
      }
      .telemetry-item {
        background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px; padding: 10px 14px;
      }
      .telemetry-label {
        font-size: 10px; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); letter-spacing: 0.08em;
      }
      .telemetry-val {
        font-size: 15px; font-weight: 800; color: #fff; margin-top: 2px;
      }
    </style>
  </head>
  <body>
    <div id="video-container">
      <video id="remote-video" autoplay playsinline muted></video>
    </div>

    <button id="menu-trigger" class="menu-btn">Menu</button>
    <button id="coop-trigger" class="menu-btn">👥 Co-Op</button>
    <button id="hud-trigger" class="menu-btn">📊 Stats</button>
    <div id="stats" class="stats-badge" title="Click or press 'H' / Select+Start to toggle HUD">STREAM · 60 FPS</div>

    <!-- Loading / Status HUD -->
    <div id="status-hud" class="hud-overlay">
      <div class="hud-card">
        <div id="hud-spinner" class="spinner"></div>
        <div id="hud-title" class="hud-title">Connecting Stream</div>
        <div id="hud-sub" class="hud-subtitle">
          Initializing Native Libretro WebRTC engine on Raspberry Pi...
        </div>
        <div id="hud-actions" style="display: none; margin-top: 16px;">
          <a href="${wasmPlayerUrl}" class="btn btn-primary wasm-fallback-link">
            ▶ Play with WebAssembly
          </a>
          <button id="retry-btn" class="btn btn-secondary">
            Retry Connection
          </button>
        </div>
      </div>
    </div>

    <!-- Co-Op Multiplayer Modal -->
    <div id="coop-overlay" class="hud-overlay is-hidden">
      <div class="hud-card" style="max-width: 480px;">
        <div class="hud-title" style="color: #38bdf8;">👥 Couch & Cloud Co-Op</div>
        <div class="hud-subtitle">
          Invite a second player on your local network or mobile phone to play together in real-time.
        </div>
        <div class="qr-box">
          <img id="coop-qr-img" alt="Co-Op Join QR Code" />
        </div>
        <div class="copy-input-row">
          <input id="coop-link-input" class="copy-input" readonly value="" />
          <button id="btn-copy-coop" class="btn btn-primary" style="background: #0284c7; white-space: nowrap; margin: 0;">
            Copy Link
          </button>
        </div>
        <div style="margin-top: 16px;">
          <button id="btn-close-coop" class="btn btn-secondary" style="width: 100%;">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Real-Time Telemetry Modal -->
    <div id="telemetry-overlay" class="hud-overlay is-hidden">
      <div class="hud-card" style="max-width: 480px;">
        <div class="hud-title" style="color: #10b981;">📊 Streaming Telemetry</div>
        <div class="hud-subtitle">Real-time WebRTC & Libretro metrics</div>
        <div class="telemetry-grid">
          <div class="telemetry-item">
            <div class="telemetry-label">Network Ping (RTT)</div>
            <div id="tel-rtt" class="telemetry-val">-- ms</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">Display Framerate</div>
            <div id="tel-fps" class="telemetry-val">60 FPS</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">Inbound Bitrate</div>
            <div id="tel-bitrate" class="telemetry-val">-- Mbps</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">Player Slot</div>
            <div id="tel-slot" class="telemetry-val" style="color: #ec4899;">P1 (Host)</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">Video / Audio Codec</div>
            <div class="telemetry-val" style="font-size: 12px;">VP8 / Opus 48kHz</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">Connected Peers</div>
            <div id="tel-peers" class="telemetry-val" style="color: #38bdf8;">1 active</div>
          </div>
        </div>
        <button id="btn-close-telemetry" class="btn btn-primary" style="background: #059669; width: 100%;">
          Close HUD
        </button>
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
          <button id="btn-open-coop-menu" class="btn btn-secondary" style="border-color: rgba(56, 189, 248, 0.4);">
            👥 Invite Player 2 (Co-Op)
          </button>
          <a href="${wasmPlayerUrl}" class="btn btn-secondary wasm-fallback-link">
            🌐 Switch to WebAssembly Engine
          </a>
          <button id="btn-resume" class="btn btn-primary">Resume Game</button>
          <button id="btn-exit" class="btn btn-secondary" style="border-color: rgba(239, 68, 68, 0.3); color: #fca5a5;">
            Exit Game
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
        const coopOverlay = document.getElementById("coop-overlay");
        const telemetryOverlay = document.getElementById("telemetry-overlay");
        const menuBtn = document.getElementById("menu-trigger");
        const coopBtn = document.getElementById("coop-trigger");
        const hudBtn = document.getElementById("hud-trigger");
        const retryBtn = document.getElementById("retry-btn");
        const btnResume = document.getElementById("btn-resume");
        const btnExit = document.getElementById("btn-exit");
        const btnFullscreen = document.getElementById("btn-fullscreen");
        const btnUnmute = document.getElementById("btn-unmute");
        const btnCopyCoop = document.getElementById("btn-copy-coop");
        const btnCloseCoop = document.getElementById("btn-close-coop");
        const btnCloseTelemetry = document.getElementById("btn-close-telemetry");
        const btnOpenCoopMenu = document.getElementById("btn-open-coop-menu");
        const coopLinkInput = document.getElementById("coop-link-input");
        const coopQrImg = document.getElementById("coop-qr-img");
        const statsBadge = document.getElementById("stats");

        // Telemetry DOM elements
        const telRtt = document.getElementById("tel-rtt");
        const telFps = document.getElementById("tel-fps");
        const telBitrate = document.getElementById("tel-bitrate");
        const telSlot = document.getElementById("tel-slot");
        const telPeers = document.getElementById("tel-peers");

        let pc = null;
        let dataChannel = null;
        let sessionId = null;
        let peerId = "peer-" + Math.random().toString(36).substring(2, 9);

        // URL parsing for Guest Co-Op join
        const urlParams = new URLSearchParams(window.location.search);
        const querySession = urlParams.get("session");
        const queryPlayer = urlParams.get("player");
        const isGuest = queryPlayer === "1" || (querySession && urlParams.get("join") === "1");
        const myPlayerSlot = isGuest ? 1 : 0;

        if (isGuest) {
          coopBtn.style.display = "none";
          if (btnOpenCoopMenu) btnOpenCoopMenu.style.display = "none";
          statsBadge.textContent = "P2 · GUEST · 60 FPS";
          telSlot.textContent = "Player 2 (Guest)";
          telSlot.style.color = "#38bdf8";
        }

        const serverIngressBase = ${safeIngressBase};
        const path = window.location.pathname;
        const apiIdx = path.indexOf("/api/roms");
        const ingressBase = apiIdx !== -1 ? path.substring(0, apiIdx) : serverIngressBase;
        const wasmUrl = ingressBase + "/api/roms/" + romId + "/player?return=" + encodeURIComponent(returnUrl) + "&profile=" + ${profileId} + "&engine=wasm";

        document.querySelectorAll(".wasm-fallback-link").forEach((link) => {
          link.setAttribute("href", wasmUrl);
        });

        function showError(title, message) {
          statusHud.classList.remove("is-hidden");
          hudSpinner.style.display = "none";
          hudTitle.textContent = title;
          hudTitle.style.color = "#ef4444";
          hudSub.textContent = message;
          hudActions.style.display = "block";
        }

        function updateCoopInvite() {
          if (!sessionId) return;
          const host = window.location.origin;
          const inviteUrl = host + window.location.pathname + "?stream=1&session=" + sessionId + "&player=1";
          coopLinkInput.value = inviteUrl;
          // Lightweight QR code via standard data image service
          coopQrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" + encodeURIComponent(inviteUrl);
        }

        async function initWebRTC() {
          statusHud.classList.remove("is-hidden");
          hudSpinner.style.display = "inline-block";
          hudActions.style.display = "none";
          hudTitle.textContent = isGuest ? "Joining Co-Op Session" : "Connecting Stream";
          hudTitle.style.color = "#ec4899";
          hudSub.textContent = isGuest
            ? "Connecting as Player 2 to host session " + (querySession ? querySession.slice(0, 8) : "") + "..."
            : "Negotiating WebRTC PeerConnection with Raspberry Pi...";

          try {
            let startData = null;
            if (isGuest && querySession) {
              sessionId = querySession;
              const joinRes = await fetch(ingressBase + "/api/stream/join/" + sessionId, { method: "POST" });
              if (!joinRes.ok) {
                throw new Error("Unable to join streaming session. The host may have closed the game.");
              }
              startData = await joinRes.json();
            } else {
              const startRes = await fetch(ingressBase + "/api/stream/start/" + romId, { method: "POST" });
              if (!startRes.ok) {
                let errMsg = "Failed to start streaming session (HTTP " + startRes.status + ")";
                try {
                  const errData = await startRes.json();
                  errMsg = errData.error || errData.message || errMsg;
                } catch (_) {
                  const text = await startRes.text().catch(() => "");
                  if (text) errMsg += ": " + text.slice(0, 100);
                }
                throw new Error(errMsg);
              }
              startData = await startRes.json();
              sessionId = startData.sessionId;
            }

            updateCoopInvite();

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
              console.log("[stream] Input DataChannel opened for slot P" + (myPlayerSlot + 1));
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
                const candUrl = ingressBase + "/api/stream/candidate/" + sessionId + "?peerId=" + encodeURIComponent(peerId);
                fetch(candUrl, {
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
                statsBadge.textContent = (isGuest ? "P2" : "P1") + " · CONNECTED · 60 FPS";
              } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
                showError("Stream Disconnected", "The connection to the native emulation runner was lost.");
              }
            };

            // 5. Create and send SDP Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const signalUrl = ingressBase + "/api/stream/signal/" + sessionId + "?peerId=" + encodeURIComponent(peerId) + "&player=" + myPlayerSlot;
            const signalRes = await fetch(signalUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
            });

            if (!signalRes.ok) {
              let sigMsg = "Failed to exchange SDP signal with runner (HTTP " + signalRes.status + ")";
              try {
                const sigErr = await signalRes.json();
                sigMsg = sigErr.error || sigErr.message || sigMsg;
              } catch (_) {
                const text = await signalRes.text().catch(() => "");
                if (text) sigMsg += ": " + text.slice(0, 100);
              }
              throw new Error(sigMsg);
            }

            const answer = await signalRes.json();
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

          } catch (err) {
            console.error("[stream] Setup failed:", err);
            showError("Native Stream Unavailable", (err && err.message) || String(err));
          }
        }

        // ── Ultra-low Latency Input Loop (5-Byte Binary DataChannel) ──
        const inputBuffer = new Uint8Array(5);
        const activeKeys = new Set();
        let inputLoopRunning = false;
        let audioUnlocked = false;

        function unlockAudio() {
          if (audioUnlocked) return;
          audioUnlocked = true;
          if (video) {
            video.muted = false;
            video.play().catch(() => {});
            if (btnUnmute) btnUnmute.textContent = "🔇 Mute Audio";
          }
        }

        document.addEventListener("pointerdown", unlockAudio, { once: true });
        document.addEventListener("keydown", unlockAudio, { once: true });

        const KEY_MAP = {
          "KeyZ": 0, "KeyJ": 0,             // B
          "KeyA": 1, "KeyU": 1,             // Y
          "ShiftLeft": 2, "ShiftRight": 2,  // Select
          "Enter": 3,                       // Start
          "ArrowUp": 4,                     // Up
          "ArrowDown": 5,                   // Down
          "ArrowLeft": 6,                   // Left
          "ArrowRight": 7,                  // Right
          "KeyX": 8, "KeyK": 8,             // A
          "KeyS": 9, "KeyI": 9,             // X
          "KeyQ": 10,                       // L
          "KeyW": 11,                       // R
        };

        window.addEventListener("keydown", (e) => {
          unlockAudio();
          if (e.code === "KeyH") {
            telemetryOverlay.classList.toggle("is-hidden");
          }
          activeKeys.add(e.code);
        });
        window.addEventListener("keyup", (e) => {
          activeKeys.delete(e.code);
        });

        let prevSelectStart = false;

        function pollInput() {
          if (dataChannel && dataChannel.readyState === "open") {
            let mask = 0;
            let axisX = 0;
            let axisY = 0;

            // 1. Native Gamepad Input
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = gamepads[0];
            if (gp) {
              unlockAudio();
              const b = gp.buttons;
              if (b[0] && b[0].pressed) mask |= (1 << 0);   // B
              if (b[2] && b[2].pressed) mask |= (1 << 1);   // Y
              if (b[8] && b[8].pressed) mask |= (1 << 2);   // Select
              if (b[9] && b[9].pressed) mask |= (1 << 3);   // Start
              if (b[12] && b[12].pressed) mask |= (1 << 4); // Up
              if (b[13] && b[13].pressed) mask |= (1 << 5); // Down
              if (b[14] && b[14].pressed) mask |= (1 << 6); // Left
              if (b[15] && b[15].pressed) mask |= (1 << 7); // Right
              if (b[1] && b[1].pressed) mask |= (1 << 8);   // A
              if (b[3] && b[3].pressed) mask |= (1 << 9);   // X
              if (b[4] && b[4].pressed) mask |= (1 << 10);  // L
              if (b[5] && b[5].pressed) mask |= (1 << 11);  // R
              if (b[6] && b[6].pressed) mask |= (1 << 12);  // L2
              if (b[7] && b[7].pressed) mask |= (1 << 13);  // R2
              if (b[10] && b[10].pressed) mask |= (1 << 14);// L3
              if (b[11] && b[11].pressed) mask |= (1 << 15);// R3

              if (gp.axes && gp.axes.length >= 2) {
                axisX = Math.max(-128, Math.min(127, Math.round(gp.axes[0] * 127)));
                axisY = Math.max(-128, Math.min(127, Math.round(gp.axes[1] * 127)));
              }

              // Select + Start toggle telemetry HUD
              const selectPressed = Boolean(b[8] && b[8].pressed);
              const startPressed = Boolean(b[9] && b[9].pressed);
              if (selectPressed && startPressed) {
                if (!prevSelectStart) {
                  telemetryOverlay.classList.toggle("is-hidden");
                }
                prevSelectStart = true;
              } else {
                prevSelectStart = false;
              }
            }

            // 2. Keyboard Input Overlay
            for (const code of activeKeys) {
              const bit = KEY_MAP[code];
              if (bit !== undefined) {
                mask |= (1 << bit);
              }
            }

            // Pack 5 bytes: [playerSlot, mask_lo, mask_hi, axisX, axisY]
            inputBuffer[0] = myPlayerSlot;
            inputBuffer[1] = mask & 0xFF;
            inputBuffer[2] = (mask >> 8) & 0xFF;
            inputBuffer[3] = (axisX < 0 ? 256 + axisX : axisX) & 0xFF;
            inputBuffer[4] = (axisY < 0 ? 256 + axisY : axisY) & 0xFF;

            dataChannel.send(inputBuffer);
          }
          requestAnimationFrame(pollInput);
        }

        function startInputLoop() {
          if (!inputLoopRunning) {
            inputLoopRunning = true;
            requestAnimationFrame(pollInput);
          }
        }

        // ── Real-Time Diagnostics & WebRTC Stats HUD ──
        let lastBytes = 0;
        let lastStatsTime = Date.now();
        setInterval(async () => {
          if (!pc || pc.connectionState !== "connected") return;
          try {
            const stats = await pc.getStats();
            let rttMs = null;
            let fps = null;
            let currentBytes = 0;

            stats.forEach(report => {
              if (report.type === "candidate-pair" && report.state === "succeeded") {
                if (typeof report.currentRoundTripTime === "number") {
                  rttMs = Math.round(report.currentRoundTripTime * 1000);
                }
              }
              if (report.type === "inbound-rtp" && report.kind === "video") {
                if (typeof report.framesPerSecond === "number") {
                  fps = Math.round(report.framesPerSecond);
                }
                if (typeof report.bytesReceived === "number") {
                  currentBytes = report.bytesReceived;
                }
              }
            });

            const now = Date.now();
            const elapsedSec = (now - lastStatsTime) / 1000;
            let mbps = null;
            if (lastBytes > 0 && elapsedSec > 0 && currentBytes >= lastBytes) {
              mbps = (((currentBytes - lastBytes) * 8) / (elapsedSec * 1000 * 1000)).toFixed(1);
            }
            lastBytes = currentBytes;
            lastStatsTime = now;

            const parts = [];
            parts.push(isGuest ? "P2" : "P1");
            parts.push(fps ? (fps + " FPS") : "60 FPS");
            if (rttMs !== null) parts.push(rttMs + "ms RTT");
            if (mbps !== null) parts.push(mbps + " Mbps");
            statsBadge.textContent = parts.join(" · ");

            // Update Telemetry Panel
            if (rttMs !== null) telRtt.textContent = rttMs + " ms";
            if (fps !== null) telFps.textContent = fps + " FPS";
            if (mbps !== null) telBitrate.textContent = mbps + " Mbps";
          } catch (_) {}
        }, 1000);

        // Periodically poll active peers count
        setInterval(async () => {
          if (!sessionId) return;
          try {
            const res = await fetch(ingressBase + "/api/stream/peers/" + sessionId);
            if (res.ok) {
              const data = await res.json();
              if (telPeers) telPeers.textContent = data.count + " active";
            }
          } catch (_) {}
        }, 3000);

        // UI Event Listeners
        menuBtn.addEventListener("click", () => menuOverlay.classList.remove("is-hidden"));
        coopBtn.addEventListener("click", () => {
          updateCoopInvite();
          coopOverlay.classList.remove("is-hidden");
        });
        if (btnOpenCoopMenu) {
          btnOpenCoopMenu.addEventListener("click", () => {
            menuOverlay.classList.add("is-hidden");
            updateCoopInvite();
            coopOverlay.classList.remove("is-hidden");
          });
        }
        hudBtn.addEventListener("click", () => telemetryOverlay.classList.remove("is-hidden"));
        statsBadge.addEventListener("click", () => telemetryOverlay.classList.toggle("is-hidden"));

        btnResume.addEventListener("click", () => menuOverlay.classList.add("is-hidden"));
        btnCloseCoop.addEventListener("click", () => coopOverlay.classList.add("is-hidden"));
        btnCloseTelemetry.addEventListener("click", () => telemetryOverlay.classList.add("is-hidden"));
        retryBtn.addEventListener("click", () => initWebRTC());

        btnCopyCoop.addEventListener("click", async () => {
          if (!coopLinkInput.value) return;
          try {
            await navigator.clipboard.writeText(coopLinkInput.value);
            btnCopyCoop.textContent = "Copied! ✓";
            setTimeout(() => { btnCopyCoop.textContent = "Copy Link"; }, 2000);
          } catch (_) {
            coopLinkInput.select();
            document.execCommand("copy");
            btnCopyCoop.textContent = "Copied! ✓";
            setTimeout(() => { btnCopyCoop.textContent = "Copy Link"; }, 2000);
          }
        });

        btnUnmute.addEventListener("click", () => {
          unlockAudio();
          video.muted = !video.muted;
          if (!video.muted) video.play().catch(() => {});
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
          // Only the host stops the stream session; guests cleanly leave
          if (!isGuest && sessionId) {
            fetch(ingressBase + "/api/stream/stop/" + sessionId, { method: "POST" }).catch(() => {});
          }
          window.location.href = returnUrl || (ingressBase + "/");
        });

        // Start connection
        initWebRTC();
      })();
    </script>
  </body>
</html>`;
}

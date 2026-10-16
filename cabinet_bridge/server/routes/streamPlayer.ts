import { escapeHtml } from "./utils";

interface StreamPlayerOptions {
  title: string;
  returnTo: string;
  romId: number;
  system: string;
  profileId?: number;
  ingressBase?: string;
  configuredAspectRatio?: string;
  wasmMode?: "always" | "fallback" | "disabled";
}

export function renderStreamPlayerPage({
  title,
  returnTo,
  romId,
  system,
  profileId = 1,
  ingressBase = "",
  configuredAspectRatio = "auto",
  wasmMode = "fallback",
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
        background: #000; overflow: hidden;
      }
      #video-wrapper {
        position: relative; display: flex; align-items: center; justify-content: center;
        max-width: 100vw; max-height: 100vh;
        transition: width 150ms ease, height 150ms ease;
      }
      #video-wrapper.aspect-4-3 {
        aspect-ratio: 4 / 3;
        width: min(100vw, calc(100vh * (4 / 3)));
        height: min(100vh, calc(100vw * (3 / 4)));
      }
      #video-wrapper.aspect-16-9 {
        aspect-ratio: 16 / 9;
        width: min(100vw, calc(100vh * (16 / 9)));
        height: min(100vh, calc(100vw * (9 / 16)));
      }
      #video-wrapper.aspect-3-2 {
        aspect-ratio: 3 / 2;
        width: min(100vw, calc(100vh * (3 / 2)));
        height: min(100vh, calc(100vw * (2 / 3)));
      }
      #video-wrapper.aspect-10-9 {
        aspect-ratio: 10 / 9;
        width: min(100vw, calc(100vh * (10 / 9)));
        height: min(100vh, calc(100vw * (9 / 10)));
      }
      #video-wrapper.aspect-1-1 {
        aspect-ratio: 1 / 1;
        width: min(100vw, 100vh);
        height: min(100vh, 100vw);
      }
      #video-wrapper.aspect-fill {
        width: 100vw;
        height: 100vh;
      }
      video {
        width: 100%; height: 100%; object-fit: fill;
        image-rendering: pixelated; image-rendering: crisp-edges;
      }
      .hud-overlay {
        position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        background: rgba(5, 5, 10, 0.92); z-index: 1000;
        padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        box-sizing: border-box;
        overflow-y: auto; -webkit-overflow-scrolling: touch;
        text-align: center;
        transition: opacity 300ms ease, visibility 300ms ease;
      }
      .hud-overlay.is-hidden {
        opacity: 0; visibility: hidden; pointer-events: none;
      }
      .hud-card {
        max-width: 440px; width: 100%; background: rgba(18, 18, 28, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 24px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
        margin: auto 0;
        max-height: calc(100dvh - 32px);
        overflow-y: auto;
        overscroll-behavior: contain;
        box-sizing: border-box;
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
      .btn-xs { padding: 6px 12px; font-size: 10px; border-radius: 8px; margin: 0; }
      .slot-row {
        display: flex; align-items: center; justify-content: space-between;
        background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px; padding: 10px 14px; gap: 8px;
      }
      .slot-info { display: flex; flex-direction: column; text-align: left; flex: 1; }
      .slot-title { font-size: 12px; font-weight: 800; color: #fff; }
      .slot-time { font-size: 10px; color: rgba(255, 255, 255, 0.5); margin-top: 2px; }
      .slot-actions { display: flex; gap: 6px; }
      .menu-btn {
        position: fixed; z-index: 999; top: max(12px, env(safe-area-inset-top));
        background: rgba(10, 10, 18, 0.75); border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff; padding: 8px 16px; border-radius: 999px; font-weight: 800; font-size: 11px;
        letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; backdrop-filter: blur(12px);
        transition: all 180ms ease;
      }
      .menu-btn:hover { background: rgba(236, 72, 153, 0.4); border-color: #ec4899; }
      #menu-trigger { left: max(12px, env(safe-area-inset-left)); }

      /* Touch & On-Screen Gamepad Overlay */
      .virtual-controller {
        position: fixed; inset: 0; pointer-events: none; z-index: 950;
        user-select: none; -webkit-user-select: none; touch-action: none;
        transition: opacity 200ms ease;
      }
      .virtual-controller.is-hidden {
        opacity: 0; pointer-events: none; display: none;
      }
      .v-btn {
        pointer-events: auto; touch-action: none; position: absolute;
        background: rgba(255, 255, 255, 0.14); border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%; color: #fff; font-weight: 800; font-size: 14px;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        cursor: pointer; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
        transition: transform 60ms ease, background 60ms ease, border-color 60ms ease;
      }
      .v-btn:active, .v-btn.is-pressed {
        background: rgba(236, 72, 153, 0.65) !important;
        border-color: #ec4899 !important;
        transform: scale(0.92);
      }
      .v-dpad {
        position: absolute; left: max(20px, env(safe-area-inset-left)); bottom: max(24px, env(safe-area-inset-bottom));
        width: 144px; height: 144px; pointer-events: none;
      }
      .v-dpad-btn {
        position: absolute; width: 46px; height: 46px; border-radius: 12px; font-size: 16px;
      }
      .v-dpad-up    { top: 0; left: 49px; }
      .v-dpad-down  { bottom: 0; left: 49px; }
      .v-dpad-left  { top: 49px; left: 0; }
      .v-dpad-right { top: 49px; right: 0; }

      .v-actions {
        position: absolute; right: max(20px, env(safe-area-inset-right)); bottom: max(24px, env(safe-area-inset-bottom));
        width: 144px; height: 144px; pointer-events: none;
      }
      .v-act-btn {
        position: absolute; width: 46px; height: 46px; border-radius: 50%; font-size: 15px; font-weight: 900;
      }
      .v-btn-a { right: 0; top: 49px; background: rgba(16, 185, 129, 0.28); border-color: rgba(16, 185, 129, 0.55); }
      .v-btn-b { left: 49px; bottom: 0; background: rgba(239, 68, 68, 0.28); border-color: rgba(239, 68, 68, 0.55); }
      .v-btn-x { left: 49px; top: 0; background: rgba(59, 130, 246, 0.28); border-color: rgba(59, 130, 246, 0.55); }
      .v-btn-y { left: 0; top: 49px; background: rgba(234, 179, 8, 0.28); border-color: rgba(234, 179, 8, 0.55); }

      /* Ergonomic Shoulder Clusters directly above D-Pad (Left) and Action Buttons (Right) */
      .v-shoulders-left {
        position: absolute;
        left: max(20px, env(safe-area-inset-left));
        bottom: calc(max(24px, env(safe-area-inset-bottom)) + 160px);
        display: flex; gap: 10px; pointer-events: none;
      }
      .v-shoulders-right {
        position: absolute;
        right: max(20px, env(safe-area-inset-right));
        bottom: calc(max(24px, env(safe-area-inset-bottom)) + 160px);
        display: flex; gap: 10px; pointer-events: none;
      }
      .v-shoulder-btn {
        position: relative; width: 64px; height: 36px; border-radius: 18px; font-size: 12px; letter-spacing: 0.05em;
      }

      /* Virtual Analog Thumbsticks */
      .v-stick {
        position: absolute; width: 104px; height: 104px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.07); border: 2px solid rgba(255, 255, 255, 0.22);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.35);
        pointer-events: auto; touch-action: none;
        display: flex; align-items: center; justify-content: center;
      }
      .v-stick.is-active {
        border-color: rgba(236, 72, 153, 0.75);
        background: rgba(236, 72, 153, 0.14);
      }
      .v-stick-left {
        left: calc(max(20px, env(safe-area-inset-left)) + 162px);
        bottom: max(24px, env(safe-area-inset-bottom));
      }
      .v-stick-right {
        right: calc(max(20px, env(safe-area-inset-right)) + 162px);
        bottom: max(24px, env(safe-area-inset-bottom));
      }
      .v-stick-thumb {
        width: 44px; height: 44px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.55), rgba(236, 72, 153, 0.45));
        border: 2px solid rgba(255, 255, 255, 0.6);
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
        pointer-events: none; font-size: 9px; font-weight: 800; color: rgba(255, 255, 255, 0.85);
        display: flex; align-items: center; justify-content: center;
        will-change: transform;
      }

      /* Center Menu Buttons (SELECT / START) — relative flex items so they never overlap */
      .v-menu-btns {
        position: absolute; left: 50%; transform: translateX(-50%); bottom: max(18px, env(safe-area-inset-bottom));
        display: flex; align-items: center; justify-content: center; gap: 14px; pointer-events: none;
      }
      .v-btn-pill {
        position: relative; width: 74px; height: 32px; border-radius: 16px; font-size: 11px; letter-spacing: 0.08em;
      }

      @media (max-width: 720px) {
        .v-stick { width: 88px; height: 88px; }
        .v-stick-thumb { width: 38px; height: 38px; }
        .v-stick-left {
          left: calc(max(14px, env(safe-area-inset-left)) + 148px);
          bottom: calc(max(20px, env(safe-area-inset-bottom)) + 48px);
        }
        .v-stick-right {
          right: calc(max(14px, env(safe-area-inset-right)) + 148px);
          bottom: calc(max(20px, env(safe-area-inset-bottom)) + 48px);
        }
      }

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
      <div id="video-wrapper" class="aspect-4-3">
        <video id="remote-video" autoplay playsinline muted></video>
      </div>
    </div>

    <!-- On-Screen Virtual Gamepad Overlay (Touch & Click) -->
    <div id="virtual-controller" class="virtual-controller is-hidden">
      <!-- Left Shoulder Triggers (L + ZL) -->
      <div id="v-shoulders-left" class="v-shoulders-left">
        <div id="v-btn-l" class="v-btn v-shoulder-btn" data-btn="10">L</div>
        <div id="v-btn-zl" class="v-btn v-shoulder-btn" data-btn="12">ZL</div>
      </div>

      <!-- Right Shoulder Triggers (ZR + R) -->
      <div id="v-shoulders-right" class="v-shoulders-right">
        <div id="v-btn-zr" class="v-btn v-shoulder-btn" data-btn="13">ZR</div>
        <div id="v-btn-r" class="v-btn v-shoulder-btn" data-btn="11">R</div>
      </div>

      <!-- D-Pad (Left) -->
      <div class="v-dpad">
        <div class="v-btn v-dpad-btn v-dpad-up" data-btn="4">▲</div>
        <div class="v-btn v-dpad-btn v-dpad-down" data-btn="5">▼</div>
        <div class="v-btn v-dpad-btn v-dpad-left" data-btn="6">◀</div>
        <div class="v-btn v-dpad-btn v-dpad-right" data-btn="7">▶</div>
      </div>

      <!-- Left Analog Stick -->
      <div id="v-stick-left" class="v-stick v-stick-left" style="display: none;">
        <div class="v-stick-thumb">L</div>
      </div>

      <!-- Center Menu Buttons (Select / Start) -->
      <div class="v-menu-btns">
        <div class="v-btn v-btn-pill" data-btn="2">SELECT</div>
        <div class="v-btn v-btn-pill" data-btn="3" style="background: rgba(236, 72, 153, 0.35); border-color: #ec4899;">START</div>
      </div>

      <!-- Right Analog Stick -->
      <div id="v-stick-right" class="v-stick v-stick-right" style="display: none;">
        <div class="v-stick-thumb">R</div>
      </div>

      <!-- Action Buttons (Right) -->
      <div class="v-actions">
        <div id="v-btn-y" class="v-btn v-act-btn v-btn-y" data-btn="1">Y</div>
        <div id="v-btn-x" class="v-btn v-act-btn v-btn-x" data-btn="9">X</div>
        <div id="v-btn-b" class="v-btn v-act-btn v-btn-b" data-btn="0">B</div>
        <div id="v-btn-a" class="v-btn v-act-btn v-btn-a" data-btn="8">A</div>
      </div>
    </div>

    <button id="menu-trigger" class="menu-btn">Menu</button>
    <div id="stats" class="stats-badge" title="Click or press 'H' / Select+Start to toggle HUD">STREAM · 60 FPS</div>
    <div id="gamepad-toast" style="display: none; position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2000; background: rgba(16, 185, 129, 0.92); color: #fff; font-weight: 700; font-size: 12px; padding: 8px 18px; border-radius: 9999px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); pointer-events: none; backdrop-filter: blur(8px); transition: opacity 0.3s ease;"></div>

    <!-- Video Stream Warning / Fallback Banner -->
    ${wasmMode !== "disabled" ? `
    <div id="stream-warning-banner" style="display: none; position: fixed; top: max(56px, calc(env(safe-area-inset-top) + 48px)); left: 50%; transform: translateX(-50%); z-index: 998; background: rgba(30, 20, 10, 0.95); border: 1px solid #f59e0b; color: #fef3c7; padding: 12px 20px; border-radius: 12px; font-size: 11px; max-width: 90vw; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.6); backdrop-filter: blur(8px);">
      <div style="font-weight: 700; margin-bottom: 4px; color: #fbbf24;">⚠️ Schermo nero? Native runner in anteprima</div>
      <div style="font-size: 10px; color: rgba(254, 243, 199, 0.85); margin-bottom: 8px; line-height: 1.4;">
        Nessun fotogramma video decodificato dal flusso nativo. Passa al motore WebAssembly per giocare subito.
      </div>
      <a href="${wasmPlayerUrl}" class="btn btn-primary wasm-fallback-link" style="padding: 8px 16px; font-size: 11px; margin: 0; background: #f59e0b; color: #000; font-weight: 800;">
        ▶ Gioca con WebAssembly (EmulatorJS)
      </a>
    </div>` : ""}

    <!-- Loading / Status HUD -->
    <div id="status-hud" class="hud-overlay">
      <div class="hud-card">
        <div id="hud-spinner" class="spinner"></div>
        <div id="hud-title" class="hud-title">Connecting Stream</div>
        <div id="hud-sub" class="hud-subtitle">
          Initializing Native Libretro WebRTC engine on Raspberry Pi...
        </div>
        <div id="hud-actions" style="display: none; margin-top: 16px;">
          ${wasmMode !== "disabled" ? `
          <a href="${wasmPlayerUrl}" class="btn btn-primary wasm-fallback-link">
            ▶ Play with WebAssembly
          </a>` : ""}
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

    <!-- Save & Load Slots Modal -->
    <div id="slots-overlay" class="hud-overlay is-hidden">
      <div class="hud-card" style="max-width: 480px;">
        <div class="hud-title" style="color: #ec4899;">💾 Slot di Salvataggio</div>
        <div class="hud-subtitle">Salvataggi nativi Libretro salvati in HA (/share) e sincronizzabili su Cloud</div>
        <div id="slots-list" style="display: flex; flex-direction: column; gap: 8px; margin: 16px 0; text-align: left;">
          <div style="color: rgba(255,255,255,0.6); font-size: 12px; padding: 12px;">Caricamento slot in corso...</div>
        </div>
        <button id="btn-close-slots" class="btn btn-secondary" style="width: 100%;">
          Chiudi
        </button>
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
          <!-- Save & Load Controls -->
          <div id="save-load-section" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button id="btn-quick-save" class="btn btn-primary" style="background: #ec4899; margin: 0;">💾 Salva Rapido</button>
              <button id="btn-quick-load" class="btn btn-secondary" style="border-color: #ec4899; color: #f472b6; margin: 0;">📂 Carica Rapido</button>
            </div>
            <button id="btn-open-slots-menu" class="btn btn-secondary" style="border-color: rgba(236, 72, 153, 0.4);">
              🗃️ Gestione Slot (0 - 4)...
            </button>
          </div>

          <button id="btn-unmute" class="btn btn-secondary">🔊 Unmute Audio</button>
          <button id="btn-fullscreen" class="btn btn-secondary">⛶ Toggle Fullscreen</button>
          <button id="btn-aspect" class="btn btn-secondary" style="border-color: rgba(234, 179, 8, 0.4);">
            📐 Aspect Ratio: 4:3
          </button>
          <button id="btn-toggle-pad" class="btn btn-secondary" style="border-color: rgba(236, 72, 153, 0.4);">
            🎮 Mostra/Nascondi Controller su Schermo
          </button>
          <button id="btn-open-coop-menu" class="btn btn-secondary" style="border-color: rgba(56, 189, 248, 0.4);">
            👥 Invite Player 2 (Co-Op)
          </button>
          <button id="btn-open-telemetry-menu" class="btn btn-secondary" style="border-color: rgba(16, 185, 129, 0.4);">
            📊 Statistiche & Telemetria
          </button>
          ${wasmMode !== "disabled" ? `
          <a href="${wasmPlayerUrl}" class="btn btn-secondary wasm-fallback-link">
            🌐 Switch to WebAssembly Engine
          </a>` : ""}
          <button id="btn-resume" class="btn btn-primary">Resume Game</button>
          <button id="btn-exit" class="btn btn-secondary" style="border-color: rgba(239, 68, 68, 0.3); color: #fca5a5;">
            Exit Game
          </button>

          <!-- Keyboard & Gamepad Legend -->
          <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; font-size: 11px; text-align: left; line-height: 1.6; color: rgba(255,255,255,0.85); margin-top: 4px;">
            <div style="font-weight: 800; color: #ec4899; text-transform: uppercase; margin-bottom: 4px; font-size: 10px; letter-spacing: 0.08em;">🎮 Mappatura Comandi</div>
            <div>• <b style="color: #fff;">Enter</b>: START &nbsp;|&nbsp; <b style="color: #fff;">Shift</b>: SELECT</div>
            <div>• <b style="color: #fff;">Frecce</b>: D-Pad / Analogico</div>
            <div id="legend-actions">• <b style="color: #fff;">X / K</b>: Tasto A &nbsp;|&nbsp; <b style="color: #fff;">Z / J</b>: Tasto B</div>
            <div id="legend-extra">• <b style="color: #fff;">S / I</b>: Tasto X &nbsp;|&nbsp; <b style="color: #fff;">A / U</b>: Tasto Y</div>
            <div id="legend-shoulders">• <b style="color: #fff;">Q / W</b>: Dorsali L / R &nbsp;|&nbsp; <b style="color: #fff;">E / R</b>: ZL / ZR</div>
            <div style="color: #10b981; margin-top: 4px;">• Gamepad USB/Bluetooth plug & play</div>
          </div>
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
        const slotsOverlay = document.getElementById("slots-overlay");
        const slotsList = document.getElementById("slots-list");
        const btnCloseSlots = document.getElementById("btn-close-slots");
        const btnOpenSlotsMenu = document.getElementById("btn-open-slots-menu");
        const btnQuickSave = document.getElementById("btn-quick-save");
        const btnQuickLoad = document.getElementById("btn-quick-load");
        const saveLoadSection = document.getElementById("save-load-section");
        const btnOpenTelemetryMenu = document.getElementById("btn-open-telemetry-menu");
        const menuBtn = document.getElementById("menu-trigger");
        const virtualController = document.getElementById("virtual-controller");
        const btnTogglePad = document.getElementById("btn-toggle-pad");
        const retryBtn = document.getElementById("retry-btn");
        const btnResume = document.getElementById("btn-resume");
        const btnExit = document.getElementById("btn-exit");
        const btnFullscreen = document.getElementById("btn-fullscreen");
        const btnUnmute = document.getElementById("btnUnmute") || document.getElementById("btn-unmute");
        const btnAspect = document.getElementById("btn-aspect");
        const videoWrapper = document.getElementById("video-wrapper");
        const btnCopyCoop = document.getElementById("btn-copy-coop");
        const btnCloseCoop = document.getElementById("btn-close-coop");
        const btnCloseTelemetry = document.getElementById("btn-close-telemetry");
        const btnOpenCoopMenu = document.getElementById("btn-open-coop-menu");
        const coopLinkInput = document.getElementById("coop-link-input");
        const coopQrImg = document.getElementById("coop-qr-img");
        const statsBadge = document.getElementById("stats");

        // Aspect ratio handling & persistence
        const systemName = ${JSON.stringify(system.toLowerCase())};

        // Platform-aware virtual controls configuration (Shoulders, Action Buttons & Analog Thumbsticks)
        (function configurePlatformVirtualControls(sys) {
          const noShoulderSystems = new Set([
            "nes", "gb", "gbc", "mastersystem", "gamegear", "atari2600",
            "atari5200", "atari7800", "coleco", "ngp", "wonderswan"
          ]);
          const dualShoulderSystems = new Set([
            "ps1", "ps2", "n64", "gc", "dreamcast", "saturn", "arcade", "mame", "fbneo"
          ]);
          const leftStickSystems = new Set([
            "n64", "ps1", "ps2", "psp", "dreamcast", "saturn", "gc", "nds", "3ds", "arcade", "mame", "fbneo"
          ]);
          const rightStickSystems = new Set([
            "n64", "ps1", "ps2", "gc"
          ]);

          const twoButtonSystems = new Set([
            "nes", "gb", "gbc", "gba", "atari2600", "atari7800", "mastersystem", "gamegear", "ngp", "wonderswan"
          ]);
          const segaThreeButtonSystems = new Set([
            "genesis", "megadrive", "md", "segacd", "32x"
          ]);
          const playstationSystems = new Set([
            "ps1", "ps2", "psp"
          ]);

          const shLeft = document.getElementById("v-shoulders-left");
          const shRight = document.getElementById("v-shoulders-right");
          const btnL = document.getElementById("v-btn-l");
          const btnR = document.getElementById("v-btn-r");
          const btnZl = document.getElementById("v-btn-zl");
          const btnZr = document.getElementById("v-btn-zr");
          const stickLeft = document.getElementById("v-stick-left");
          const stickRight = document.getElementById("v-stick-right");

          const btnY = document.getElementById("v-btn-y");
          const btnX = document.getElementById("v-btn-x");
          const btnB = document.getElementById("v-btn-b");
          const btnA = document.getElementById("v-btn-a");

          // 1. Shoulders visibility and labels
          if (noShoulderSystems.has(sys)) {
            if (shLeft) shLeft.style.display = "none";
            if (shRight) shRight.style.display = "none";
          } else if (!dualShoulderSystems.has(sys)) {
            if (btnZl) btnZl.style.display = "none";
            if (btnZr) btnZr.style.display = "none";
          }

          if (playstationSystems.has(sys)) {
            if (btnL) btnL.textContent = "L1";
            if (btnR) btnR.textContent = "R1";
            if (btnZl) btnZl.textContent = "L2";
            if (btnZr) btnZr.textContent = "R2";
            if (sys === "psp") {
              if (btnZl) btnZl.style.display = "none";
              if (btnZr) btnZr.style.display = "none";
            }
          } else if (sys === "n64") {
            if (btnL) btnL.textContent = "L";
            if (btnR) btnR.textContent = "R";
            if (btnZl) btnZl.textContent = "Z";
            if (btnZr) btnZr.style.display = "none";
          }

          // 2. Action buttons configuration & platform styling
          if (playstationSystems.has(sys)) {
            // PlayStation Shapes: △ (Triangle, top), ◯ (Circle, right), ✕ (Cross, bottom), ▢ (Square, left)
            if (btnX) {
              btnX.textContent = "△";
              btnX.style.background = "rgba(16, 185, 129, 0.32)";
              btnX.style.borderColor = "rgba(16, 185, 129, 0.75)";
              btnX.style.fontSize = "18px";
            }
            if (btnA) {
              btnA.textContent = "◯";
              btnA.style.background = "rgba(239, 68, 68, 0.32)";
              btnA.style.borderColor = "rgba(239, 68, 68, 0.75)";
              btnA.style.fontSize = "18px";
            }
            if (btnB) {
              btnB.textContent = "✕";
              btnB.style.background = "rgba(59, 130, 246, 0.32)";
              btnB.style.borderColor = "rgba(59, 130, 246, 0.75)";
              btnB.style.fontSize = "18px";
            }
            if (btnY) {
              btnY.textContent = "▢";
              btnY.style.background = "rgba(236, 72, 153, 0.32)";
              btnY.style.borderColor = "rgba(236, 72, 153, 0.75)";
              btnY.style.fontSize = "18px";
            }
          } else if (twoButtonSystems.has(sys)) {
            // NES / Game Boy / GBA: Only B and A buttons
            if (btnX) btnX.style.display = "none";
            if (btnY) btnY.style.display = "none";
            if (btnB) {
              btnB.textContent = "B";
              btnB.style.background = "rgba(239, 68, 68, 0.32)";
              btnB.style.borderColor = "rgba(239, 68, 68, 0.75)";
            }
            if (btnA) {
              btnA.textContent = "A";
              btnA.style.background = "rgba(239, 68, 68, 0.32)";
              btnA.style.borderColor = "rgba(239, 68, 68, 0.75)";
            }
          } else if (segaThreeButtonSystems.has(sys)) {
            // Sega Genesis 3-button layout: A (left), B (bottom), C (right)
            if (btnX) btnX.style.display = "none";
            if (btnY) {
              btnY.textContent = "A";
              btnY.style.background = "rgba(59, 130, 246, 0.32)";
              btnY.style.borderColor = "rgba(59, 130, 246, 0.75)";
            }
            if (btnB) {
              btnB.textContent = "B";
              btnB.style.background = "rgba(234, 179, 8, 0.32)";
              btnB.style.borderColor = "rgba(234, 179, 8, 0.75)";
            }
            if (btnA) {
              btnA.textContent = "C";
              btnA.style.background = "rgba(239, 68, 68, 0.32)";
              btnA.style.borderColor = "rgba(239, 68, 68, 0.75)";
            }
          }

          // Update Pause Menu keyboard legend based on platform
          const legAct = document.getElementById("legend-actions");
          const legExtra = document.getElementById("legend-extra");
          const legSh = document.getElementById("legend-shoulders");
          if (playstationSystems.has(sys)) {
            if (legAct) legAct.innerHTML = '• <b style="color: #fff;">X / K</b>: ◯ (Cerchio) &nbsp;|&nbsp; <b style="color: #fff;">Z / J</b>: ✕ (Croce)';
            if (legExtra) legExtra.innerHTML = '• <b style="color: #fff;">S / I</b>: △ (Triangolo) &nbsp;|&nbsp; <b style="color: #fff;">A / U</b>: ▢ (Quadrato)';
            if (legSh) legSh.innerHTML = sys === "psp" ? '• <b style="color: #fff;">Q / W</b>: Dorsali L / R' : '• <b style="color: #fff;">Q / W</b>: L1 / R1 &nbsp;|&nbsp; <b style="color: #fff;">E / R</b>: L2 / R2';
          } else if (twoButtonSystems.has(sys)) {
            if (legAct) legAct.innerHTML = '• <b style="color: #fff;">X / K</b>: Tasto A &nbsp;|&nbsp; <b style="color: #fff;">Z / J</b>: Tasto B';
            if (legExtra) legExtra.style.display = "none";
            if (noShoulderSystems.has(sys) && legSh) legSh.style.display = "none";
          }

          // 3. Analog sticks
          if (stickLeft) {
            stickLeft.style.display = leftStickSystems.has(sys) ? "flex" : "none";
          }
          if (stickRight) {
            stickRight.style.display = rightStickSystems.has(sys) ? "flex" : "none";
          }
        })(systemName);

        function getSystemDefaultAspect(sys) {
          if (sys === "gba") return "3:2";
          if (sys === "gb" || sys === "gbc" || sys === "gamegear" || sys === "ngp") return "10:9";
          if (sys === "psp") return "16:9";
          return "4:3";
        }

        const aspectOptions = ["4:3", "16:9", "fill"];
        const defaultAspect = getSystemDefaultAspect(systemName);
        if (defaultAspect === "3:2") {
          aspectOptions.splice(1, 0, "3:2");
        } else if (defaultAspect === "10:9") {
          aspectOptions.splice(1, 0, "10:9");
        }

        let savedAspect = null;
        try {
          savedAspect = localStorage.getItem("cabinet_stream_aspect_" + systemName) ||
                        localStorage.getItem("cabinet_stream_aspect_global");
        } catch (_) {}

        const initialConfigured = ${JSON.stringify(configuredAspectRatio)};
        let activeAspect = savedAspect || (initialConfigured && initialConfigured !== "auto" ? initialConfigured : defaultAspect);

        function applyAspectRatio(aspect) {
          activeAspect = aspect;
          if (videoWrapper) {
            videoWrapper.classList.remove("aspect-4-3", "aspect-16-9", "aspect-3-2", "aspect-10-9", "aspect-1-1", "aspect-fill");
            const cls = "aspect-" + (aspect === "fill" ? "fill" : aspect.replace(":", "-"));
            videoWrapper.classList.add(cls);
          }
          if (btnAspect) {
            const label = aspect === "fill" ? "Stretch (Fill)" : aspect;
            btnAspect.textContent = "📐 Aspect Ratio: " + label;
          }
          try {
            localStorage.setItem("cabinet_stream_aspect_" + systemName, aspect);
          } catch (_) {}
        }

        applyAspectRatio(activeAspect);

        if (btnAspect) {
          btnAspect.addEventListener("click", () => {
            const curIdx = aspectOptions.indexOf(activeAspect);
            const nextIdx = (curIdx + 1) % aspectOptions.length;
            applyAspectRatio(aspectOptions[nextIdx]);
          });
        }

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
          if (saveLoadSection) saveLoadSection.style.display = "none";
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

        const wasmFallbackEnabled = ${wasmMode !== "disabled"};
        const wasmAutoFallback = ${wasmMode === "fallback"};

        ${wasmMode !== "disabled" ? `
        document.querySelectorAll(".wasm-fallback-link").forEach((link) => {
          link.setAttribute("href", wasmUrl);
        });` : ""}

        function showError(title, message) {
          statusHud.classList.remove("is-hidden");
          hudSpinner.style.display = "none";
          hudTitle.textContent = title;
          hudTitle.style.color = "#ef4444";
          hudSub.textContent = message;
          hudActions.style.display = "block";
          if (wasmAutoFallback && !isGuest && wasmFallbackEnabled) {
            hudSub.textContent = message + " — Switching to WebAssembly in 3s...";
            setTimeout(() => {
              window.location.href = wasmUrl;
            }, 3000);
          }
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

            function applyZeroDelay(receiver) {
              if (!receiver) return;
              try {
                if ("playoutDelayHint" in receiver) {
                  receiver.playoutDelayHint = 0;
                }
                if ("jitterBufferTarget" in receiver) {
                  receiver.jitterBufferTarget = 0;
                }
              } catch (_) {}
            }

            // 3. Setup transceivers for receiving video and audio with zero playout delay
            const videoTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
            const audioTransceiver = pc.addTransceiver("audio", { direction: "recvonly" });
            applyZeroDelay(videoTransceiver.receiver);
            applyZeroDelay(audioTransceiver.receiver);

            // 4. Create DataChannel for low-latency gamepad & keyboard input
            dataChannel = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
            dataChannel.onopen = () => {
              console.log("[stream] Input DataChannel opened for slot P" + (myPlayerSlot + 1));
              startInputLoop();
            };

            pc.ontrack = (event) => {
              console.log("[stream] Received remote track:", event.track.kind);
              applyZeroDelay(event.receiver);
              let stream = video.srcObject;
              if (!stream || !(stream instanceof MediaStream)) {
                stream = new MediaStream();
                video.srcObject = stream;
              }
              if (!stream.getTracks().some((t) => t.id === event.track.id)) {
                stream.addTrack(event.track);
              }
              video.play().catch(() => {});
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
                try {
                  pc.getReceivers().forEach(applyZeroDelay);
                } catch (_) {}
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

        // ── Ultra-low Latency Input Loop (7-Byte Binary DataChannel) ──
        const inputBuffer = new Uint8Array(7);
        const activeKeys = new Set();
        let inputLoopRunning = false;
        let audioUnlocked = false;

        function unlockAudio() {
          if (audioUnlocked) return;
          audioUnlocked = true;
          if (video) {
            video.muted = false;
            video.volume = 1.0;
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
          "KeyE": 12,                       // ZL / L2
          "KeyR": 13,                       // ZR / R2
        };

        window.addEventListener("keydown", (e) => {
          unlockAudio();
          if (e.code === "KeyH") {
            e.preventDefault();
            e.stopPropagation();
            telemetryOverlay.classList.toggle("is-hidden");
            return;
          }
          if (e.code === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            menuOverlay.classList.toggle("is-hidden");
            return;
          }
          if (KEY_MAP[e.code] !== undefined) {
            e.preventDefault();
            e.stopPropagation();
            if (!activeKeys.has(e.code)) {
              activeKeys.add(e.code);
              sendInputIfChanged(true);
            }
          }
        });
        window.addEventListener("keyup", (e) => {
          if (KEY_MAP[e.code] !== undefined) {
            e.preventDefault();
            e.stopPropagation();
            activeKeys.delete(e.code);
            sendInputIfChanged(true);
          }
        });

        let prevSelectStart = false;
        let virtualButtonsMask = 0;
        let virtualLeftAxisX = 0;
        let virtualLeftAxisY = 0;
        let virtualRightAxisX = 0;
        let virtualRightAxisY = 0;

        let toastTimeout = null;
        function showGamepadToast(msg) {
          const toast = document.getElementById("gamepad-toast");
          if (!toast) return;
          toast.textContent = msg;
          toast.style.display = "block";
          toast.style.opacity = "1";
          if (toastTimeout) clearTimeout(toastTimeout);
          toastTimeout = setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => { toast.style.display = "none"; }, 300);
          }, 2400);
        }

        let physicalGamepadDetected = false;

        function setVirtualPadVisible(visible) {
          if (!virtualController) return;
          if (visible) {
            virtualController.classList.remove("is-hidden");
          } else {
            virtualController.classList.add("is-hidden");
          }
          try {
            localStorage.setItem("ha_arcade_touch_controller", visible ? "1" : "0");
          } catch (_) {}
        }

        function toggleVirtualPad() {
          if (!virtualController) return;
          const isHidden = virtualController.classList.contains("is-hidden");
          if (isHidden) {
            localStorage.setItem("ha_arcade_touch_controller_forced", "1");
          } else {
            localStorage.removeItem("ha_arcade_touch_controller_forced");
          }
          setVirtualPadVisible(isHidden);
        }

        // Automatic Gamepad Connection / Disconnection listeners
        window.addEventListener("gamepadconnected", (e) => {
          unlockAudio();
          physicalGamepadDetected = true;
          const padName = e.gamepad && e.gamepad.id ? e.gamepad.id.split("(")[0].trim() : "Controller";
          showGamepadToast("🎮 " + padName + " connesso");
          const userForced = localStorage.getItem("ha_arcade_touch_controller_forced");
          if (!userForced) {
            setVirtualPadVisible(false);
          }
        });

        window.addEventListener("gamepaddisconnected", () => {
          const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
          if (gamepads.length === 0) {
            physicalGamepadDetected = false;
            showGamepadToast("🎮 Controller disconnesso");
            const isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
            if (isTouchDevice) {
              setVirtualPadVisible(true);
            }
          }
        });

        // Virtual Touch Button handlers with Pointer Events
        document.querySelectorAll(".v-btn").forEach((btn) => {
          const btnCode = parseInt(btn.getAttribute("data-btn") || "-1", 10);
          if (btnCode < 0) return;

          btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            unlockAudio();
            virtualButtonsMask |= (1 << btnCode);
            btn.classList.add("is-pressed");
            try { btn.setPointerCapture(e.pointerId); } catch (_) {}
            sendInputIfChanged(true);
          });

          const release = (e) => {
            e.preventDefault();
            e.stopPropagation();
            virtualButtonsMask &= ~(1 << btnCode);
            btn.classList.remove("is-pressed");
            try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
            sendInputIfChanged(true);
          };

          btn.addEventListener("pointerup", release);
          btn.addEventListener("pointercancel", release);
          btn.addEventListener("pointerleave", release);
        });

        // Virtual Analog Thumbstick handlers with Pointer Capture
        function bindVirtualStick(stickId, onMove) {
          const stickEl = document.getElementById(stickId);
          if (!stickEl) return;
          const thumbEl = stickEl.querySelector(".v-stick-thumb");
          let activePointerId = null;

          const updateStick = (clientX, clientY) => {
            const rect = stickEl.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const maxRadius = Math.max(24, rect.width * 0.35);
            let dx = clientX - centerX;
            let dy = clientY - centerY;
            const dist = Math.hypot(dx, dy);
            if (dist > maxRadius) {
              const scale = maxRadius / dist;
              dx *= scale;
              dy *= scale;
            }
            if (thumbEl) {
              thumbEl.style.transform = "translate3d(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px, 0)";
            }
            const normX = Math.max(-128, Math.min(127, Math.round((dx / maxRadius) * 127)));
            const normY = Math.max(-128, Math.min(127, Math.round((dy / maxRadius) * 127)));
            onMove(normX, normY);
          };

          stickEl.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            unlockAudio();
            activePointerId = e.pointerId;
            stickEl.classList.add("is-active");
            try { stickEl.setPointerCapture(e.pointerId); } catch (_) {}
            updateStick(e.clientX, e.clientY);
          });

          stickEl.addEventListener("pointermove", (e) => {
            if (activePointerId !== e.pointerId) return;
            e.preventDefault();
            e.stopPropagation();
            updateStick(e.clientX, e.clientY);
          });

          const releaseStick = (e) => {
            if (activePointerId !== null && e.pointerId !== activePointerId) return;
            e.preventDefault();
            e.stopPropagation();
            activePointerId = null;
            stickEl.classList.remove("is-active");
            if (thumbEl) {
              thumbEl.style.transform = "translate3d(0px, 0px, 0)";
            }
            onMove(0, 0);
            try { stickEl.releasePointerCapture(e.pointerId); } catch (_) {}
          };

          stickEl.addEventListener("pointerup", releaseStick);
          stickEl.addEventListener("pointercancel", releaseStick);
        }

        bindVirtualStick("v-stick-left", (x, y) => {
          virtualLeftAxisX = x;
          virtualLeftAxisY = y;
          sendInputIfChanged(true);
        });
        bindVirtualStick("v-stick-right", (x, y) => {
          virtualRightAxisX = x;
          virtualRightAxisY = y;
          sendInputIfChanged(true);
        });

        // Initialize virtual pad from localStorage or auto-enable on touch devices if no gamepad is active
        try {
          const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
          const storedPad = localStorage.getItem("ha_arcade_touch_controller");
          const userForced = localStorage.getItem("ha_arcade_touch_controller_forced");
          const isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

          if (userForced === "1" || storedPad === "1") {
            setVirtualPadVisible(true);
          } else if (storedPad === "0") {
            setVirtualPadVisible(false);
          } else if (gamepads.length > 0) {
            setVirtualPadVisible(false);
          } else if (isTouchDevice) {
            setVirtualPadVisible(true);
          }
        } catch (_) {}

        let lastMask = -1;
        let lastAxisX = 0;
        let lastAxisY = 0;
        let lastRightAxisX = 0;
        let lastRightAxisY = 0;
        let lastSendTime = 0;

        function sendInputIfChanged(force) {
          if (!dataChannel || dataChannel.readyState !== "open") return;
          // Avoid SCTP queue buffer bloat during momentary network jitter
          if (dataChannel.bufferedAmount > 1024) return;

          let mask = 0;
          let axisX = 0;
          let axisY = 0;
          let rightAxisX = 0;
          let rightAxisY = 0;

          // 1. Native Gamepad Input
          const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
          const gp = gamepads[0];
          if (gp) {
            unlockAudio();
            const b = gp.buttons;

            // Auto-hide virtual overlay on first physical button press or analog movement
            if (!physicalGamepadDetected) {
              const hasActivity = b.some((btn) => btn && btn.pressed) ||
                (gp.axes && gp.axes.some((a) => Math.abs(a) > 0.3));
              if (hasActivity) {
                physicalGamepadDetected = true;
                const userForced = localStorage.getItem("ha_arcade_touch_controller_forced");
                if (!userForced && virtualController && !virtualController.classList.contains("is-hidden")) {
                  setVirtualPadVisible(false);
                  showGamepadToast("🎮 Gamepad attivo — Touch Pad nascosto");
                }
              }
            }
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
            if (b[6] && b[6].pressed) mask |= (1 << 12);  // L2 / ZL
            if (b[7] && b[7].pressed) mask |= (1 << 13);  // R2 / ZR
            if (b[10] && b[10].pressed) mask |= (1 << 14);// L3
            if (b[11] && b[11].pressed) mask |= (1 << 15);// R3

            if (gp.axes && gp.axes.length >= 2) {
              axisX = Math.max(-128, Math.min(127, Math.round(gp.axes[0] * 127)));
              axisY = Math.max(-128, Math.min(127, Math.round(gp.axes[1] * 127)));
            }
            if (gp.axes && gp.axes.length >= 4) {
              rightAxisX = Math.max(-128, Math.min(127, Math.round(gp.axes[2] * 127)));
              rightAxisY = Math.max(-128, Math.min(127, Math.round(gp.axes[3] * 127)));
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

          // 3. Virtual Touch Controller Overlay (Buttons + Dual Analog Thumbsticks)
          mask |= virtualButtonsMask;
          if (virtualLeftAxisX !== 0 || virtualLeftAxisY !== 0) {
            axisX = virtualLeftAxisX;
            axisY = virtualLeftAxisY;
          }
          if (virtualRightAxisX !== 0 || virtualRightAxisY !== 0) {
            rightAxisX = virtualRightAxisX;
            rightAxisY = virtualRightAxisY;
          }

          // D-Pad to Analog fallback if left analog stick is centered
          if (axisX === 0 && axisY === 0) {
            if (mask & (1 << 4)) axisY = -128; // Up
            if (mask & (1 << 5)) axisY = 127;  // Down
            if (mask & (1 << 6)) axisX = -128; // Left
            if (mask & (1 << 7)) axisX = 127;  // Right
          }

          const now = performance.now();
          const changed = (mask !== lastMask || axisX !== lastAxisX || axisY !== lastAxisY ||
                           rightAxisX !== lastRightAxisX || rightAxisY !== lastRightAxisY);
          const heartbeat = (now - lastSendTime >= 100);

          if (changed || force || heartbeat) {
            inputBuffer[0] = myPlayerSlot;
            inputBuffer[1] = mask & 0xFF;
            inputBuffer[2] = (mask >> 8) & 0xFF;
            inputBuffer[3] = (axisX < 0 ? 256 + axisX : axisX) & 0xFF;
            inputBuffer[4] = (axisY < 0 ? 256 + axisY : axisY) & 0xFF;
            inputBuffer[5] = (rightAxisX < 0 ? 256 + rightAxisX : rightAxisX) & 0xFF;
            inputBuffer[6] = (rightAxisY < 0 ? 256 + rightAxisY : rightAxisY) & 0xFF;

            try {
              dataChannel.send(inputBuffer);
              lastMask = mask;
              lastAxisX = axisX;
              lastAxisY = axisY;
              lastRightAxisX = rightAxisX;
              lastRightAxisY = rightAxisY;
              lastSendTime = now;
            } catch (_) {}
          }
        }

        function pollInput() {
          sendInputIfChanged(false);
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
        let connectedSeconds = 0;
        setInterval(async () => {
          if (!pc || pc.connectionState !== "connected") return;
          try {
            connectedSeconds++;
            const isRendering = (video.videoWidth > 0 && video.videoHeight > 0);
            const warningBanner = document.getElementById("stream-warning-banner");
            if (!isRendering && connectedSeconds >= 4 && warningBanner) {
              warningBanner.style.display = "block";
            } else if (isRendering && warningBanner) {
              warningBanner.style.display = "none";
            }

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

        // ── Save & Load State Management ──
        async function saveSlot(slot) {
          if (!sessionId) return;
          try {
            showGamepadToast("💾 Salvataggio in corso...");
            const res = await fetch(ingressBase + "/api/stream/" + sessionId + "/save/" + slot, {
              method: "POST"
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || err.error || "Errore salvataggio");
            }
            showGamepadToast("💾 " + (slot === 0 ? "Salvataggio Rapido" : "Slot " + slot) + " completato!");
          } catch (e) {
            showGamepadToast("❌ Errore: " + (e.message || String(e)));
          }
        }

        async function loadSlot(slot) {
          if (!sessionId) return;
          try {
            showGamepadToast("📂 Caricamento in corso...");
            const res = await fetch(ingressBase + "/api/stream/" + sessionId + "/load/" + slot, {
              method: "POST"
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || err.error || "Errore caricamento");
            }
            showGamepadToast("📂 " + (slot === 0 ? "Salvataggio Rapido" : "Slot " + slot) + " caricato!");
            menuOverlay.classList.add("is-hidden");
            if (slotsOverlay) slotsOverlay.classList.add("is-hidden");
          } catch (e) {
            showGamepadToast("❌ " + (e.message || String(e)));
          }
        }

        async function refreshSlotsModal() {
          if (!sessionId || !slotsList) return;
          slotsList.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-size: 12px; padding: 12px; text-align: center;">Caricamento slot...</div>';
          try {
            const res = await fetch(ingressBase + "/api/stream/" + sessionId + "/slots");
            const savedSlots = res.ok ? await res.json() : [];
            const slotMap = new Map();
            if (Array.isArray(savedSlots)) {
              savedSlots.forEach(s => slotMap.set(s.slot, s));
            }

            slotsList.innerHTML = "";
            for (let i = 0; i <= 4; i++) {
              const info = slotMap.get(i);
              const hasSave = !!info;
              const title = i === 0 ? "Slot 0 (Rapido)" : "Slot " + i;
              const dateStr = hasSave ? new Date(info.updatedAt).toLocaleString() : "Nessun dato salvato";

              const row = document.createElement("div");
              row.className = "slot-row";
              row.innerHTML = \`
                <div class="slot-info">
                  <div class="slot-title">\${title}</div>
                  <div class="slot-time">\${dateStr}</div>
                </div>
                <div class="slot-actions">
                  <button class="btn btn-primary btn-xs btn-save-slot" data-slot="\${i}">Salva</button>
                  <button class="btn btn-secondary btn-xs btn-load-slot" data-slot="\${i}" \${hasSave ? "" : "disabled style='opacity: 0.35; cursor: not-allowed;'"}>Carica</button>
                </div>
              \`;

              const saveBtn = row.querySelector(".btn-save-slot");
              if (saveBtn) {
                saveBtn.addEventListener("click", async () => {
                  await saveSlot(i);
                  refreshSlotsModal();
                });
              }

              const loadBtn = row.querySelector(".btn-load-slot");
              if (loadBtn && hasSave) {
                loadBtn.addEventListener("click", () => {
                  loadSlot(i);
                });
              }

              slotsList.appendChild(row);
            }
          } catch (e) {
            slotsList.innerHTML = '<div style="color: #ef4444; font-size: 12px; padding: 12px;">Impossibile recuperare gli slot</div>';
          }
        }

        // UI Event Listeners
        menuBtn.addEventListener("click", () => menuOverlay.classList.remove("is-hidden"));

        if (btnQuickSave) {
          btnQuickSave.addEventListener("click", async () => {
            await saveSlot(0);
          });
        }
        if (btnQuickLoad) {
          btnQuickLoad.addEventListener("click", async () => {
            await loadSlot(0);
          });
        }
        if (btnOpenSlotsMenu) {
          btnOpenSlotsMenu.addEventListener("click", () => {
            menuOverlay.classList.add("is-hidden");
            refreshSlotsModal();
            if (slotsOverlay) slotsOverlay.classList.remove("is-hidden");
          });
        }
        if (btnCloseSlots) {
          btnCloseSlots.addEventListener("click", () => {
            if (slotsOverlay) slotsOverlay.classList.add("is-hidden");
            menuOverlay.classList.remove("is-hidden");
          });
        }

        if (btnTogglePad) {
          btnTogglePad.addEventListener("click", () => {
            toggleVirtualPad();
            menuOverlay.classList.add("is-hidden");
          });
        }
        if (btnOpenCoopMenu) {
          btnOpenCoopMenu.addEventListener("click", () => {
            menuOverlay.classList.add("is-hidden");
            updateCoopInvite();
            coopOverlay.classList.remove("is-hidden");
          });
        }
        if (btnOpenTelemetryMenu) {
          btnOpenTelemetryMenu.addEventListener("click", () => {
            menuOverlay.classList.add("is-hidden");
            telemetryOverlay.classList.remove("is-hidden");
          });
        }
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

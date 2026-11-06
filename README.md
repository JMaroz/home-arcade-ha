<p align="center">
  <img src="docs/assets/banner.png" alt="HomeArcade Banner" width="100%" />
</p>

# HomeArcade

<p align="center">
  <strong>The Ultimate Cloud & In-Browser Retro Gaming Console for Home Assistant</strong><br />
  <em>Turn any screen, TV, browser, or DIY arcade cabinet into a high-performance retro gaming center.</em>
</p>

<p align="center">
  <a href="https://github.com/JMaroz/HomeArcade-HA/releases"><img src="https://img.shields.io/badge/version-2.66.5-6366f1?style=for-the-badge&logo=github" alt="Version 2.66.5" /></a>
  <a href="https://www.home-assistant.io"><img src="https://img.shields.io/badge/Home%20Assistant-Add--on-41bdf5?style=for-the-badge&logo=home-assistant&logoColor=white" alt="Home Assistant Add-on" /></a>
  <img src="https://img.shields.io/badge/Architecture-amd64%20%7C%20aarch64-f59e0b?style=for-the-badge&logo=docker&logoColor=white" alt="Architectures amd64 and aarch64" />
  <img src="https://img.shields.io/badge/Engine-Native%20WebRTC%20%2B%20WASM-ef4444?style=for-the-badge&logo=webrtc&logoColor=white" alt="Native WebRTC and WASM" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://my.home-assistant.io/redirect/supervisor_add_repo/?repository_url=https%3A%2F%2Fgithub.com%2FJMaroz%2FHomeArcade-HA" target="_blank">
    <img src="https://my.home-assistant.io/badges/supervisor_add_repo.svg" alt="Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled." />
  </a>
</p>

---

## 🌟 Why HomeArcade?

**HomeArcade** is not just another ROM launcher—it is an all-in-one retro gaming ecosystem engineered specifically for **Home Assistant**. It combines the nostalgia of classic consoles with the modern superpower of your smart home.

Play instantly with zero client installation, sync live game telemetry to Home Assistant to trigger immersive room lighting, challenge friends across the world with peer-to-peer Netplay, or build the DIY arcade cabinet of your dreams with full gamepad-driven navigation and Kiosk mode.

```
       ┌────────────────────────────────────────────────────────┐
       │             🏠 HOME ASSISTANT ECOSYSTEM                │
       └───────────────────────────┬────────────────────────────┘
                                   │
              ┌────────────────────┴───────────────────┐
              ▼                                        ▼
   ⚡ Dual-Engine Emulation                🏠 Smart Home Synergy
   ├─ Native Go/CGO Libretro (WebRTC 60FPS)├─ Live Entities & Telemetry
   └─ Universal WebAssembly Fallback       └─ Lovelace Dashboard Card
              │                                        │
              ▼                                        ▼
   🎮 10-Foot Arcade & Couch UI            📦 Intelligent ROM Vault
   ├─ Full Gamepad / Stick Navigation      ├─ In-App Internet Archive Downloader
   ├─ Instant Warp Link (QR Handoff)       ├─ Auto-Detection & M3U Multi-Disc
   └─ Netplay 6-Char P2P Lobbies           └─ Cloud Save Sync (GDrive/OneDrive/WebDAV)
```

---

## ✨ Features You'll Love

### ⚡ Dual-Engine Streaming: Native WebRTC + WASM Fallback
- **Host-Accelerated Native Runner**: Runs official Libretro cores directly on your server host via Go & CGO, streaming crisp 60 FPS video and low-latency audio via **WebRTC**. Experience demanding systems (PS1, N64, Dreamcast, PS2, PSP, Arcade) without taxing your client device.
- **Universal WebAssembly Fallback**: Integrated client-side WASM engine (EmulatorJS) ensures you can play anywhere, on any browser, behind any proxy—even on zero-privilege restricted corporate networks.

### 🏠 Deep Smart Home Automation
- **Native Home Assistant Sensors**: Automatically exposes `sensor.homearcade_game`, `sensor.homearcade_system`, `sensor.homearcade_player`, and `binary_sensor.homearcade_active` directly in your entity registry.
- **Dynamic Automations**: Dim the living room lights when a game starts, turn on marquee LED backlights matching console colors, pause background music, or broadcast achievements via TTS speakers!
- **Lovelace Custom Card**: Drop the included `homearcade-card.js` onto any Home Assistant dashboard to display what's currently playing and browse your recently played shelf.

### 🎮 Built for Cabinets, TVs, and Living Rooms (10-Foot UI)
- **Full Gamepad Navigation**: Navigate your entire game collection, menus, and dialogs using your controller's D-pad or analog stick (`useGridNav`). No mouse or keyboard required.
- **Interactive Button Remapping**: Visually configure button mappings for retro pads, arcade encoders, and modern gamepads with live visual feedback.
- **Kiosk Mode**: One-click lockdown mode that hides settings and history—perfect for family gatherings, kids, or public arcade machines.
- **"Surprise Me" Wheel**: Can't decide what to play? Spin the interactive arcade wheel and let fate choose your next adventure.

### 🌐 Instant Multiplayer Netplay
- **One-Click Rooms**: Host a multiplayer session and get an instant 6-character room code.
- **Remote Play with Friends**: Works seamlessly over the internet via Home Assistant Cloud (Nabu Casa) or Cloudflare tunnels—no complicated router port forwarding needed.

### 📱 Seamless Mobile Handoff (Warp Link)
- **QR Code Game Handoff**: Playing on the big screen and need to leave the couch? Scan the **Warp Link QR code** with your phone or tablet to resume your session instantly in the palm of your hand, complete with a haptic on-screen touch controller.

### 📦 Automated ROM Vault & Library Curation
- **Built-in Internet Archive Downloader**: Browse, search, and download games straight into your storage directories directly from the UI.
- **Binary Header Inspection**: Automatically identifies the correct console and system from file magic bytes—no strict folder hierarchies or filename renames needed.
- **Multi-Disc M3U Synthesis**: Automatically identifies multi-disc games (e.g. *Final Fantasy VII*, *Metal Gear Solid*), generates virtual M3U playlists, and enables on-the-fly virtual disc swapping.
- **Zero-Auth Box Art Scraper**: Instantly pulls high-res covers from the Libretro CDN and SteamGridDB without requiring paid API accounts.
- **Multi-Cloud Save Sync**: Backup and sync your save states and memory cards with Google Drive, Microsoft OneDrive, or any WebDAV provider.
- **Storage Health & Mover**: Monitor disk health, detect duplicate ROMs, clean up dead files, and relocate your entire library between drives in one click.

### 🏆 RetroAchievements & HowLongToBeat
- **RetroAchievements Integration**: Log in with your RetroAchievements credentials to earn trophies and track hardcore badges in real-time.
- **HLTB Estimates**: See HowLongToBeat completion times right on each game card before diving into a 60-hour RPG.

---

## 🕹️ Supported Systems (24+ Consoles & Arcades)

HomeArcade supports over two dozen legendary systems, powered by industry-standard Libretro cores:

| Category | Systems & Consoles | Cores | Supported Formats |
|---|---|---|---|
| **Arcade & Neo Geo** | Arcade (MAME), Neo Geo AES/MVS | `mame2003_plus`, `fbneo` | `.zip` |
| **8-Bit Era** | NES / Famicom, Sega Master System, Atari 2600, Atari 7800 | `fceumm`, `smsgg`, `stella2014`, `prosystem` | `.nes`, `.sms`, `.a26`, `.a78`, `.bin`, `.zip` |
| **16-Bit Era** | SNES / Super Famicom, Sega Genesis / Mega Drive, TurboGrafx-16 / PC Engine | `snes9x`, `genesis_plus_gx`, `pce` | `.smc`, `.sfc`, `.md`, `.smd`, `.pce`, `.bin`, `.zip` |
| **CD & Add-on Era** | Sega CD, Sega 32X, Atari Lynx | `genesis_plus_gx`, `picodrive`, `mednafen_lynx` | `.cue+.bin`, `.chd`, `.iso`, `.32x`, `.lnx`, `.zip` |
| **32-Bit / 64-Bit** | PlayStation (PS1), Nintendo 64, Sega Saturn, Virtual Boy | `pcsx_rearmed`, `mupen64plus_next`, `yabause`, `beetle_vb` | `.chd`, `.pbp`, `.cue`, `.iso`, `.n64`, `.z64`, `.v64`, `.zip` |
| **6th Gen & Handhelds** | PlayStation 2 (PS2), Dreamcast, PSP, Nintendo DS, GBA, GBC, GB, Game Gear | `pcsx2`, `reicast`, `ppsspp`, `melonds`, `mgba`, `gambatte`, `smsgg` | `.iso`, `.cso`, `.chd`, `.gdi`, `.cdi`, `.nds`, `.gba`, `.gbc`, `.gb`, `.gg`, `.zip` |

---

## 🚀 Quick Start Guide

### 1. Add Repository
Click the **My Home Assistant** button below to add this repository directly to your Home Assistant instance:

[![Add Repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_repo.svg)](https://my.home-assistant.io/redirect/supervisor_add_repo/?repository_url=https%3A%2F%2Fgithub.com%2FJMaroz%2FHomeArcade-HA)

*Or manually in Home Assistant:*
1. Navigate to **Settings → Apps → Add-ons → Add-on Store**.
2. Click the three-dots menu (**⋮**) in the top right corner → **Repositories**.
3. Add: `https://github.com/JMaroz/HomeArcade-HA`

### 2. Install & Start
1. Search for **HomeArcade** in the store.
2. Click **Install** (compilation/download takes ~2–4 minutes).
3. Toggle **Show in sidebar**, then click **Start**.

### 3. Add ROMs & Play
1. Open **HomeArcade** from your Home Assistant sidebar.
2. Drop ROMs directly into the upload area or browse the built-in **Internet Archive** downloader.
3. Plug in any USB or Bluetooth gamepad, click on a game card, and hit **Play**!

---

## 💡 Smart Home Integration

HomeArcade automatically synchronizes with Home Assistant using the Supervisor API.

### Published Entities
| Entity ID | Type | Description |
|---|---|---|
| `sensor.homearcade_game` | Sensor | Title of the currently running game (`idle` when none) |
| `sensor.homearcade_system` | Sensor | Active system identifier (e.g. `snes`, `ps1`, `arcade`) |
| `sensor.homearcade_player` | Sensor | Active player profile name |
| `sensor.homearcade_session_start` | Sensor | ISO timestamp when the current session began |
| `sensor.homearcade_play_count` | Sensor | Total play count for the active title |
| `binary_sensor.homearcade_active` | Binary Sensor | `on` while any game session is actively running |

### Example Automation: Cinematic Gaming Lights
Drop this YAML into your Home Assistant automations (`automations.yaml`):

```yaml
alias: "HomeArcade: Game Mode Ambiance"
description: "Dim lights and set arcade colors when a game begins"
trigger:
  - platform: state
    entity_id: binary_sensor.homearcade_active
    to: "on"
action:
  - action: light.turn_on
    target:
      entity_id: light.living_room_lights
    data:
      brightness_pct: 20
      rgb_color: [255, 0, 128] # Synthwave neon pink
```

---

## 🛠️ Architecture & Tech Stack

HomeArcade is built by engineers who care about speed, modularity, and low-latency interaction:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (BROWSER / TV)                         │
│  React 19.3 • Tailwind CSS v4.3 • Vite 8.3 • TanStack Query • Wouter   │
│  Framer Motion • Radix UI • WebRTC MediaStream & DataChannel Client    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ WebRTC / REST / WebSocket
┌───────────────────────────────────▼────────────────────────────────────┐
│                    NODE.JS SERVICE (EXPRESS 5)                         │
│  better-sqlite3 • Drizzle ORM • HA Supervisor Ingress & Telemetry      │
│  ROM Header Classifier • Internet Archive Engine • Cloud Sync Hub      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC / Signaling
┌───────────────────────────────────▼────────────────────────────────────┐
│                NATIVE RUNNER DAEMON (GO + CGO)                         │
│  Pion WebRTC • Libretro Native Cores (.so) • AV Encoder Pipeline       │
└────────────────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19.3, Tailwind CSS v4.3 with CSS-first design tokens (`@theme inline`), Vite 8.3, TanStack Query v5, Framer Motion, and accessible Radix UI primitives.
- **Server**: Express 5 on Node.js 22, `better-sqlite3` embedded relational engine with Drizzle ORM for robust migrations and sub-millisecond queries.
- **Native WebRTC Runner**: Pure Go runtime utilizing CGO to interface directly with headless Libretro cores, encoding audio and video frames with sub-frame input latency over Pion WebRTC.
- **HA Ingress Shielding**: Dynamic `<base>` tag injection and reverse proxy path normalization, ensuring seamless operation inside HA sandboxed iframes and remote URLs.
- **Multi-Arch Docker**: Native OCI containers compiled for `linux/amd64` (Intel/AMD Mini PCs) and `linux/arm64` (Raspberry Pi 4/5, Home Assistant Green/Yellow).

---

## ❓ FAQ & Troubleshooting

<details>
<summary><strong>Do I need to upload BIOS files?</strong></summary>
Most 8-bit and 16-bit systems (NES, SNES, Genesis, GB) do not require BIOS files. Disc-based systems (PS1, PS2, Sega CD, Saturn) and systems like GBA or Neo Geo run best with their official BIOS. You can upload and verify them in <strong>Settings → Firmware & BIOS</strong> (MD5 checksums are verified automatically).
</details>

<details>
<summary><strong>How do I play with friends outside my local network?</strong></summary>
If you use <a href="https://www.nabucasa.com/">Home Assistant Cloud (Nabu Casa)</a>, Cloudflare Tunnel, or a secure reverse proxy, simply give your friend a Home Assistant user login and your public URL. Once they open HomeArcade, tap the <strong>Netplay icon</strong> on any game, host a room, and share the 6-character room code!
</details>

<details>
<summary><strong>How does Kiosk Mode work on an arcade cabinet?</strong></summary>
Toggle Kiosk Mode in <strong>Settings → Library</strong>. This locks the interface to game browsing and playing, hiding administrative settings, download tools, and history. To exit Kiosk Mode, navigate directly to <code>/#/settings</code> in your browser address bar.
</details>

<details>
<summary><strong>Where are ROMs and saves stored?</strong></summary>
Files are safely stored in your Home Assistant persistent storage directory (<code>/data</code>, mapped to <code>media/</code> or <code>share/</code> depending on configuration). You can also configure external USB drives and network shares using the built-in storage manager.
</details>

<details>
<summary><strong>How do I report bugs or request features?</strong></summary>
Please open an issue on our official <a href="https://github.com/JMaroz/HomeArcade-HA/issues">GitHub Issues</a> tracker. Include your hardware platform (RPi 4/5, x86_64), browser, and add-on logs.
</details>

---

## 🤝 Community & Support

HomeArcade is free, open-source software built for the retro gaming and Home Assistant communities.

- 🐛 **Found a bug?** [Open an issue on GitHub](https://github.com/JMaroz/HomeArcade-HA/issues)
- 📝 **Full Version History:** See [CHANGELOG.md](CHANGELOG.md) for detailed release logs.
- ❤️ **Love HomeArcade?** Star the repository on GitHub and share your arcade setups with the community!

[![Venmo](https://img.shields.io/badge/Support-Venmo-3D95CE?style=for-the-badge&logo=venmo&logoColor=white)](https://venmo.com/vincusmalincus)

---

<p align="center">
  <sub>Built with ❤️ for retrogaming enthusiasts, smart home builders, and arcade cabinet makers everywhere.</sub>
</p>

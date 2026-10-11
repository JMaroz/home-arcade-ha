# HomeArcade — Home Assistant Add-on

The premium retro gaming frontend designed specifically for Home Assistant. Manage ROMs, browse consoles, stream gameplay via low-latency WebRTC, and launch games directly from your Home Assistant sidebar or TV.

## Installation & Setup

1. In Home Assistant, navigate to **Settings → Add-ons → Add-on Store**.
2. Click the three dots (⋮) in the top right corner and select **Repositories**.
3. Add the repository URL:
   ```text
   https://github.com/JMaroz/HomeArcade-HA
   ```
4. Find **HomeArcade** in the store list and click **Install**.
5. Once installation finishes, start the add-on and toggle **Show in sidebar**.

## Accessing HomeArcade

- **Sidebar (Ingress)**: HomeArcade seamlessly integrates into the Home Assistant interface via Ingress on port `5000`.
- **Direct Port Access**: You can optionally configure port `9876` (or any custom port) mapped to `5000/tcp` in the add-on Network configuration tab for standalone browser access or dedicated arcade displays.

## Add-on Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `data_dir` | string | `/data` | Base directory for persistent SQLite database, cache, and ROM files. |
| `rom_watch_dir` | string | `""` | Optional filesystem path to monitor for auto-importing ROMs. |
| `max_upload_mb` | integer | `8192` | Maximum upload ceiling per ROM file in megabytes (16 to 16384 MB). |
| `steamgriddb_api_key` | string | `""` | Optional API key for scraping artwork, logos, and hero covers from SteamGridDB. |

## Persistence & Storage

All vital data is persisted in `/data` inside the supervisor-managed volume:
- `/data/data.db`: SQLite database storing game metadata, settings, and controller mappings.
- `/data/rom-storage/`: Uploaded ROM files structured by console slug.
- `/data/system-image-cache/`: Cached console artwork and game covers.
- `/data/cores/`: Downloaded emulation cores and WebAssembly binaries.

Backup exclusion rules are pre-configured to avoid bloating Home Assistant backups with transient cache files.

## Emulation & Streaming

- **Dual-Engine Architecture**: HomeArcade supports both in-browser client emulation (via EmulatorJS / RetroArch WASM) and server-side hardware-accelerated WebRTC streaming for heavier consoles (e.g., PS1, N64).
- **Controller Support**: Full Gamepad API integration with custom button mapping profiles per console and per player.

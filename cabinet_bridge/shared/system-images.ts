// Shared registry of console hardware photos used by the Browse Systems tiles.
// Single source of truth for both the client (metadata) and the server (proxy
// fetching the upstream Wikimedia Commons URL and caching it on disk).

export type SystemImageId =
  | "nes"
  | "snes"
  | "n64"
  | "gba"
  | "genesis"
  | "ps1"
  | "ps2"
  | "arcade"
  | "dreamcast"
  | "gb"
  | "gbc"
  | "nds"
  | "psp";

export interface SystemImage {
  id: SystemImageId;
  /** Upstream Wikimedia Commons thumbnail URL (640px wide where available). */
  url: string;
  /** Display name of the photo subject. */
  source: string;
  /** Wikimedia Commons file page for attribution. */
  sourceUrl: string;
  /** Short license tag (e.g. "Public domain", "CC-BY-SA-3.0"). */
  license: string;
}

/**
 * Illustrated icons of each console by KyleBing.
 * https://github.com/KyleBing/retro-game-console-icons
 *
 * These provide a cleaner, consistent aesthetic for system tiles.
 * We fall back to Libretro / RetroArch assets for systems not in the KyleBing set (e.g. PS2).
 */
export const SYSTEM_IMAGES: Record<SystemImageId, SystemImage> = {
  nes: {
    id: "nes",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/FC.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  snes: {
    id: "snes",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/SFC.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  n64: {
    id: "n64",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/N64.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  gba: {
    id: "gba",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/GBA.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  genesis: {
    id: "genesis",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/MD.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  ps1: {
    id: "ps1",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/PS.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  ps2: {
    id: "ps2",
    url: "https://raw.githubusercontent.com/libretro/retroarch-assets/master/xmb/retrosystem/png/Sony%20-%20PlayStation%202.png",
    source: "Libretro / RetroArch",
    sourceUrl: "https://github.com/libretro/retroarch-assets",
    license: "CC-BY-4.0",
  },
  arcade: {
    id: "arcade",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/ARCADE.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  dreamcast: {
    id: "dreamcast",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/DC.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  gb: {
    id: "gb",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/GB.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  gbc: {
    id: "gbc",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/GBC.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  nds: {
    id: "nds",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/NDS.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
  psp: {
    id: "psp",
    url: "https://raw.githubusercontent.com/KyleBing/retro-game-console-icons/main/series_trimui/600w@2x/PSP.png",
    source: "KyleBing",
    sourceUrl: "https://github.com/KyleBing/retro-game-console-icons",
    license: "CC-BY-NC-4.0",
  },
};

/** Same-origin proxy URL for a given system id. */
export function systemImageProxyPath(id: SystemImageId): string {
  return `/api/system-images/${id}`;
}

export function isSystemImageId(value: string): value is SystemImageId {
  return value in SYSTEM_IMAGES;
}

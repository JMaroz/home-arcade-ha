export interface NativeCoreEntry {
  id: string;
  name: string;
  archive: string;
  system: string;
  label: string;
}

export const ESSENTIAL_NATIVE_CORES: NativeCoreEntry[] = [
  { id: "parallel_n64", name: "parallel_n64_libretro.so", archive: "parallel_n64_libretro.so.zip", system: "n64", label: "Nintendo 64" },
  { id: "pcsx_rearmed", name: "pcsx_rearmed_libretro.so", archive: "pcsx_rearmed_libretro.so.zip", system: "ps1", label: "PlayStation 1" },
  { id: "snes9x", name: "snes9x_libretro.so", archive: "snes9x_libretro.so.zip", system: "snes", label: "Super Nintendo" },
  { id: "genesis_plus_gx", name: "genesis_plus_gx_libretro.so", archive: "genesis_plus_gx_libretro.so.zip", system: "genesis", label: "Sega Genesis / CD / MS" },
  { id: "mgba", name: "mgba_libretro.so", archive: "mgba_libretro.so.zip", system: "gba", label: "Game Boy Advance" },
  { id: "fceumm", name: "fceumm_libretro.so", archive: "fceumm_libretro.so.zip", system: "nes", label: "Nintendo Entertainment System" },
  { id: "fbneo", name: "fbneo_libretro.so", archive: "fbneo_libretro.so.zip", system: "arcade", label: "Arcade / Neo Geo" },
  { id: "gambatte", name: "gambatte_libretro.so", archive: "gambatte_libretro.so.zip", system: "gb", label: "Game Boy / Color" },
  { id: "yabause", name: "yabause_libretro.so", archive: "yabause_libretro.so.zip", system: "saturn", label: "Sega Saturn" },
  { id: "flycast", name: "flycast_libretro.so", archive: "flycast_libretro.so.zip", system: "dreamcast", label: "Sega Dreamcast" },
  { id: "ppsspp", name: "ppsspp_libretro.so", archive: "ppsspp_libretro.so.zip", system: "psp", label: "PlayStation Portable" },
  { id: "pcsx2", name: "pcsx2_libretro.so", archive: "pcsx2_libretro.so.zip", system: "ps2", label: "PlayStation 2" },
];

export function getLibretroBuildbotUrl(arch: "aarch64" | "x86_64", archiveName: string): string {
  return `https://buildbot.libretro.com/nightly/linux/${arch}/latest/${archiveName}`;
}

export const SYSTEM_TO_NATIVE_CORE: Record<string, string> = {
  n64: "parallel_n64_libretro.so",
  ps1: "pcsx_rearmed_libretro.so",
  snes: "snes9x_libretro.so",
  genesis: "genesis_plus_gx_libretro.so",
  megadrive: "genesis_plus_gx_libretro.so",
  gba: "mgba_libretro.so",
  nes: "fceumm_libretro.so",
  arcade: "fbneo_libretro.so",
  mame: "fbneo_libretro.so",
  neogeo: "fbneo_libretro.so",
  gb: "gambatte_libretro.so",
  gbc: "gambatte_libretro.so",
  saturn: "yabause_libretro.so",
  dreamcast: "flycast_libretro.so",
  psp: "ppsspp_libretro.so",
  ps2: "pcsx2_libretro.so",
};

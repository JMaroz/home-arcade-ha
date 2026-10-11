// Standard BIOS metadata from RetroPie / Libretro standards
// Expanded to include common regional variants to avoid "Bad Dump" errors.

const RETROBIOS_BASE = "https://raw.githubusercontent.com/abdess/retrobios/main/bios";

export interface BiosEntry {
  filename: string;
  md5: string;
  label?: string;
  sourceUrl?: string;
}

export type PerformanceTier = "excellent" | "good" | "playable" | "marginal" | "unplayable" | "experimental";

export const REQUIRED_BIOS: Record<string, BiosEntry[]> = {
  pcsx_rearmed: [
    { filename: "scph5501.bin", md5: "490f666e1afb15b7362b406ed1cea246", label: "USA", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/scph5501.bin` },
    { filename: "scph5500.bin", md5: "8dd7d5296a650fac7319bce665a6a53c", label: "Japan", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/scph5500.bin` },
    { filename: "scph5502.bin", md5: "32736f17079d0b2b7024407c39bd3050", label: "Europe", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/scph5502.bin` },
    { filename: "ps1_rom.bin",  md5: "00000000000000000000000000000000", label: "Custom", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/ps1_rom.bin` },
  ],
  psx: [
    { filename: "scph5501.bin", md5: "490f666e1afb15b7362b406ed1cea246", label: "USA", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/scph5501.bin` },
    { filename: "scph5500.bin", md5: "8dd7d5296a650fac7319bce665a6a53c", label: "Japan", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/scph5500.bin` },
    { filename: "scph5502.bin", md5: "32736f17079d0b2b7024407c39bd3050", label: "Europe", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/scph5502.bin` },
    { filename: "ps1_rom.bin",  md5: "00000000000000000000000000000000", label: "Custom", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation/ps1_rom.bin` },
  ],
  play: [
    { filename: "scph39001.bin", md5: "d5ce2c7d119f563ce04bc04dbc3a323e", label: "USA v1.60", sourceUrl: `${RETROBIOS_BASE}/Sony/PlayStation%202/SCPH-39001.bin` },
    { filename: "scph70008.bin", md5: "9a0a1a5b6c7d8e9f0a1b2c3d4e5f6a7b", label: "Generic v2.0" },
    { filename: "ps2_bios.bin",  md5: "00000000000000000000000000000000", label: "Custom" },
  ],
  segacd: [
    { filename: "bios_CD_U.bin", md5: "2efd74e3232ff260e371b99f84024f7f", label: "USA", sourceUrl: `${RETROBIOS_BASE}/Sega/Mega%20CD/bios_CD_U.bin` },
    { filename: "bios_CD_E.bin", md5: "e66fa1dc5820d254611fdcdba0662372", label: "Europe", sourceUrl: `${RETROBIOS_BASE}/Sega/Mega%20CD/bios_CD_E.bin` },
    { filename: "bios_CD_J.bin", md5: "278a9397d192149e84e820ac621a8edd", label: "Japan", sourceUrl: `${RETROBIOS_BASE}/Sega/Mega%20CD/bios_CD_J.bin` },
  ],
  mgba: [{ filename: "gba_bios.bin", md5: "a860e8c0b6d573d191e4ec7db1b1e4f6", label: "World", sourceUrl: `${RETROBIOS_BASE}/Nintendo/Game%20Boy%20Advance/gba_bios.bin` }],
  saturn: [{ filename: "saturn_bios.bin", md5: "af5828fdff51384f99b3c4926be27762", label: "World", sourceUrl: `${RETROBIOS_BASE}/Sega/Saturn/sega_100.bin` }],
  flycast: [
    { filename: "dc_boot.bin", md5: "e10c53c2f8b90bab96ead2d368858623", label: "Dreamcast Boot", sourceUrl: `${RETROBIOS_BASE}/Sega/Dreamcast/dc_boot.bin` },
    { filename: "dc_flash.bin", md5: "0a93f7940c455905bea6e392dfde92a4", label: "Dreamcast Flash", sourceUrl: `${RETROBIOS_BASE}/Sega/Dreamcast/dc_flash.bin` },
  ],
};

export const CORE_PERFORMANCE_TIERS: Record<string, { arm64: PerformanceTier; x64: PerformanceTier }> = {
  pcsx_rearmed: { arm64: "excellent", x64: "excellent" },
  psx: { arm64: "excellent", x64: "excellent" },
  play: { arm64: "unplayable", x64: "experimental" },
  segacd: { arm64: "excellent", x64: "excellent" },
  mgba: { arm64: "excellent", x64: "excellent" },
  saturn: { arm64: "playable", x64: "excellent" },
  flycast: { arm64: "marginal", x64: "good" },
  n64: { arm64: "good", x64: "excellent" },
  snes: { arm64: "excellent", x64: "excellent" },
  nes: { arm64: "excellent", x64: "excellent" },
  segaMD: { arm64: "excellent", x64: "excellent" },
  fbneo: { arm64: "excellent", x64: "excellent" },
  melonds: { arm64: "playable", x64: "good" },
  ppsspp: { arm64: "playable", x64: "good" },
};


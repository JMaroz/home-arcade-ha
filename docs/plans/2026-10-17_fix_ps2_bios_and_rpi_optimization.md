# Piano di Lavoro: Fix Download BIOS PS2 & Analisi Ottimizzazione Emulazione su Raspberry Pi

- **Data**: 2026-10-17
- **Autore**: Antigravity
- **Stato**: In corso

## Obiettivo
1. Risolvere l'errore 404/502 nel download del BIOS PS2 europeo (`scph70004.bin`) e garantire la robustezza delle URL e dei checksum dei BIOS PS2.
2. Analizzare approfonditamente l'hardware del Raspberry Pi (specificamente Raspberry Pi 5 come rilevato nei log) e fornire la migliore strategia/architettura per ottimizzare l'esecuzione della PS2, comparandola con come fa Libretro e con le soluzioni standalone.

## Scope & Non-Goals
- **In Scope**:
  - Correzione della URL di upstream di `scph70004.bin` (il file su GitHub `retrobios` ha estensione maiuscola `.BIN` ed era richiesta minuscola `.bin`).
  - Correzione del checksum MD5 di `scph70004.bin` (era presente un valore fittizio/placeholder `9a0a1a5b6c7d8e9f...`).
  - Resilienza fallback nel download BIOS (`server/routes/bios.ts` e `server/routes/setup.ts`) in caso di variazioni case-sensitive upstream (`.bin` vs `.BIN`).
  - Test unitari per verificare la validità dei metadati e il corretto funzionamento.
  - Documentazione e spiegazione architetturale per l'ottimizzazione PS2 su Raspberry Pi (RPi 5, VideoCore VII, limiti Libretro/Play! vs PCSX2 standalone, WebRTC streaming).
- **Non-Goals**:
  - Riscrittura del native runner da C/Go a un emulatore standalone esterno non containerizzato.
  - Supporto per hardware legacy pre-RPi 4.

## Task Checklist
- [x] Creazione del piano di lavoro in `docs/plans/2026-10-17_fix_ps2_bios_and_rpi_optimization.md`
- [x] Aggiornamento metadati BIOS in `cabinet_bridge/shared/bios-metadata.ts` con URL esatta (`SCPH-70004.BIN`) e MD5 effettivo (`dc752f160044f2ed5fc1f4964db2a095`) per i core `play`, `pcsx2`, `ps2`
- [x] Aggiunta di fallback automatico case-insensitive (estensione `.BIN`/`.bin`) nel downloader di `cabinet_bridge/server/routes/bios.ts` e `setup.ts`
- [x] Implementazione del limite target FPS a 30 per PS2 in `runner-manager.ts` (`--fps 30`) e HUD telemetry in `streamPlayer.ts`
- [x] Verifica dei test con `pnpm test` e type-checking con `pnpm check`
- [x] Aggiornamento `docs/HANDOFF.md`
- [x] Report dettagliato all'utente su causa radice e analisi di ottimizzazione Raspberry Pi vs Libretro

## Strategia di Verifica
- `pnpm test` in `cabinet_bridge/` per confermare che l'intera suite di test passi.
- `pnpm check` in `cabinet_bridge/` per validare l'assenza di errori di tipo TypeScript.
- Test con `curl` dell'endpoint o validazione diretta del download e hashing.

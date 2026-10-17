# Project Handoff: PS2 BIOS Fix & PS2 30 FPS Native Optimization

## Stato Corrente
- **Risoluzione Errore Download BIOS PS2**: Risolto l'errore HTTP 404/502 al download di `scph70004.bin` (Europe v2.0). Causa radice: upstream GitHub `retrobios` ha il file nominato `SCPH-70004.BIN` (maiuscolo) e l'MD5 nel codice era una sequenza fittizia. Aggiornato l'URL con l'estensione corretta e l'MD5 effettivo (`dc752f160044f2ed5fc1f4964db2a095`).
- **Resilienza Case-Sensitivity**: Aggiunto fallback automatico nei downloader (`server/routes/bios.ts` e `server/routes/setup.ts`) per testare estensioni alternate `.BIN`/`.bin` in caso di HTTP 404 da repository upstream case-sensitive.
- **Limite 30 FPS per PS2 Operativo**: Implementato il flag `--fps 30` in `StreamRunnerManager.startSession` (`server/stream/runner-manager.ts`) specifico per `system: "ps2"`, dimezzando il carico di emulazione e codifica video VP8/WebRTC su Raspberry Pi 5.
- **Aggiornamento Telemetria e HUD**: In `server/routes/streamPlayer.ts`, le etichette di stato e HUD si adattano dinamicamente al framerate target di sistema (30 FPS per PS2, 60 FPS per gli altri sistemi).
- **Test di Validazione**: Test unitari in `server/__tests__/core-health.test.ts` estesi e passati (12/12 test). Type-check `tsc` superato con 0 errori.

## File Rilevanti
- `cabinet_bridge/shared/bios-metadata.ts`: Corretta URL a `SCPH-70004.BIN` e MD5 reale per i profili `play`, `pcsx2`, `ps2`.
- `cabinet_bridge/server/routes/bios.ts`: Fallback automatico su 404 invertendo `.bin` <-> `.BIN`.
- `cabinet_bridge/server/routes/setup.ts`: Fallback case-insensitive analogo nel bootstrap setup iniziale.
- `cabinet_bridge/server/stream/runner-manager.ts`: Passaggio automatico di `--fps 30` al native runner per ROM PS2.
- `cabinet_bridge/server/routes/streamPlayer.ts`: HUD e telemetria WebRTC calibrati a 30 FPS default per PS2.
- `cabinet_bridge/server/__tests__/core-health.test.ts`: Test unitari per BIOS PS2 e rendering HUD 30 FPS.
- `docs/plans/2026-10-17_fix_ps2_bios_and_rpi_optimization.md`: Piano operativo completato.

## Prossimi Passi (Next Steps)
1. Eseguire commit atomico (`fix: resolve ps2 bios 404 and enforce 30 fps cap for ps2 streaming`).
2. Testare dal client browser l'avvio di un titolo PS2 per osservare l'HUD a 30 FPS e la riduzione di carico termico/CPU su Raspberry Pi 5.

## Comandi Utili
- `pnpm check`: Type-check TypeScript (0 errori).
- `pnpm test server/__tests__/core-health.test.ts`: Esecuzione test unitari BIOS e HUD stream (12 test passati).
- `pnpm build`: Build di produzione client e server.

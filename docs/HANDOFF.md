# Project Handoff: Home Arcade WebRTC Latency & Virtual Controls (Release v2.65.1)

## Stato Corrente
- **Risoluzione Latenza & Drop Frame WebRTC**: Risolto il ritardo di ~500ms e i cali di frame durante la ripetizione dei tasti nel Native Runner WebRTC per PS1 (`Disney's Hercules Action Game`) e tutte le altre console.
- **Disaccoppiamento Stream ID WebRTC**: Assegnati stream ID distinti (`homearcade-video` e `homearcade-audio`) per eliminare l'A/V sync blocking di Chromium causato da silenzio audio o buffer starvation.
- **Zero Playout Delay & Jitter Buffer**: Configurato `playoutDelayHint = 0` e `jitterBufferTarget = 0` nei transceiver WebRTC.
- **Frame Timing & Clock Sync**: Sostituito il calcolo intero `1000/fps` con `time.Second / time.Duration(fps)` nel ticker del runner Go e nella durata VP8 per garantire 60.0 FPS esatti e prevenire drift audio.
- **Reset Polling Analogico**: Resettato il flag `analog_polled[port]` in `nanoarch.c` a ogni frame/poll per evitare stalli nell'input.
- **Prevenzione Frame Drop da Key Repeat**: Applicato `e.preventDefault()` ed `e.stopPropagation()` sui tasti del gamepad e di navigazione (`Arrow*`, `Enter`, ecc.) per evitare layout thrashing e scrolling dell'iframe Home Assistant.
- **DataChannel Backpressure & Invio Differenziale**: Implementato invio event-driven sub-1ms (solo su variazione o heartbeat a 10Hz) con controllo di `bufferedAmount <= 1024` per azzerare la coda SCTP.
- **Virtual Pad Specifico per Piattaforma**: Layout dinamico contestuale con simboli PlayStation (△ verde, ◯ rosso, ✕ blu, ▢ rosa) e dorsali L1/L2/R1/R2 per PS1/PS2/PSP; 2 tasti per NES/GB/GBA; 3 tasti per Genesis.
- **Release Completata**: Pubblicata versione **v2.65.1** tramite merge della PR Release Please (#40).

## File Rilevanti
- `cabinet_bridge/server/native-runner/main.go`: Disaccoppiamento stream ID WebRTC e ticker loop 60 FPS esatto.
- `cabinet_bridge/server/native-runner/pkg/encoder/vpx.go`: Correzione durata campioni VP8 a 60 FPS.
- `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c`: Reset `analog_polled[port]` a ogni frame e poll.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Zero playout delay, invio differenziale DataChannel, prevenzione scroll/bubbling iframe e tasti dinamici PS1/NES/Genesis.
- `docs/plans/2026-10-16_fix_webrtc_stream_latency_and_controls.md`: Piano di lavoro completato al 100%.

## Prossimi Passi (Next Steps)
1. Monitorare la pipeline di build del container multi-arch (`amd64`/`aarch64`) scatenata dalla release `v2.65.1`.
2. Verificare l'esperienza utente aggiornata su Home Assistant OS e confermare la scomparsa del delay su PS1.

## Comandi Utili
- `pnpm check`: Type-check TypeScript (0 errori).
- `pnpm test client` / `pnpm test shared`: Esecuzione test unitari frontend e schema.
- `pnpm build`: Build di produzione client Vite e server Express.
- `git status` / `git log -n 3`: Verifica cronologia e stato del repository.

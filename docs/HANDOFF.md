# Project Handoff: Home Arcade WebRTC Latency & Virtual Controls

## Stato Corrente
- Risolti i problemi di latenza comandi (~500ms delay) e cali di frame su ripetizione tasti nel Native Runner WebRTC per PS1 e tutte le piattaforme.
- Disaccoppiati gli stream WebRTC audio/video (`homearcade-video` e `homearcade-audio`) per eliminare l'A/V sync blocking di Chromium durante silence/caricamenti.
- Azzerato il playout delay e il jitter buffer (`playoutDelayHint = 0`, `jitterBufferTarget = 0`).
- Corretto il frame timing del runner Go (`time.Second / time.Duration(fps)`) per eliminare il drift audio a 60 FPS esatti.
- Resettato il flag di polling analogico in `nanoarch.c` a ogni frame/poll per evitare stalli nell'input.
- Eliminati i cali di frame prevenendo lo scrolling e l'event bubbling con `e.preventDefault()` / `e.stopPropagation()` sui tasti gamepad/mappati.
- Ottimizzato il DataChannel con invio differenziale a bassa latenza sub-1ms (solo su variazione stato o heartbeat 100ms) e backpressure check su `bufferedAmount`.
- Implementati controlli virtuali a schermo dinamici e coerenti con la piattaforma emulata (forme PlayStation △, ◯, ✕, ▢ e dorsali L1/L2/R1/R2 per PS1/PS2/PSP; 2 tasti per NES/GB/GBA; 3 tasti per Genesis).
- Validati con successo `pnpm check`, `pnpm test client`, `pnpm test shared` e `pnpm build`.

## File Rilevanti
- `cabinet_bridge/server/native-runner/main.go`: Disaccoppiamento stream ID WebRTC e correzione ticker loop nativo.
- `cabinet_bridge/server/native-runner/pkg/encoder/vpx.go`: Correzione calcolo durata campioni VP8 a 60 FPS.
- `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c`: Reset di `analog_polled[port]` per prevenire blocco dell'input polling.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Zero playout delay/jitter buffer, invio differenziale DataChannel, soppressione scroll su key repeat e controlli touch contestuali alla console.
- `docs/plans/2026-10-16_fix_webrtc_stream_latency_and_controls.md`: Piano di lavoro dettagliato e verifiche completate.

## Prossimi Passi (Next Steps)
1. Eseguire commit atomico e push su `main`.
2. Verificare l'apertura della Release PR su GitHub da parte di Release Please e completarne il merge.
3. Testare in ambiente reale Home Assistant Add-on con ROM PS1 (`Disney's Hercules Action Game`).

## Comandi Utili
- `pnpm check`: Type check statico del progetto.
- `pnpm test`: Esecuzione suite di test Vitest.
- `pnpm build`: Build di produzione client Vite e server Express.
- `git status` / `git diff`: Verifica dello stato del repository.

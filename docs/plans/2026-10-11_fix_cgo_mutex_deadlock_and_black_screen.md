# Piano: Risoluzione Deadlock Cgo Mutex e Schermo Nero WebRTC

## Obiettivo
Eliminare il blocco ricorsivo del mutex Go in `CgoLibretroSession` che causa il congelamento permanente dell'emulatore all'avvio (`retro_init` / `Load`) e durante il rendering dei frame (`retro_run` / `Step`). Supportare il formato colore `0RGB1555`, gestire il disallineamento dello stride/pitch video e garantire che i frame video e audio vengano codificati e trasmessi a 60 FPS senza deadlock.

## Scope & Non-Goals
- **Scope**:
  - Separare `s.mu` in `CgoLibretroSession` in mutex distinti per stato (`stateMu`), buffer video (`frameMu`) e audio (`audioMu`).
  - Rimuovere il lock esteso in `Load()` per consentire ai callback Cgo del core (`coreEnvironment`, `core_log_cgo`) di eseguire senza deadlock ricorsivo.
  - Evitare di trattenere mutex durante l'invocazione di `C.same_thread(s.fnRetroRun)` in `Step()`.
  - Gestire il disallineamento del pitch in `coreVideoRefresh` scompattando le scanline riga per riga nel buffer compatto.
  - Aggiungere il convertitore BT.601 per `PixelFormat0RGB1555` in `pkg/encoder/yuv.go` con test di regressione.
  - Migliorare la terminazione pulita di `same_thread_stop` in `nanoarch.c` e connettere `RETRO_ENVIRONMENT_GET_LOG_INTERFACE` e `RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE`.
- **Non-Goals**:
  - Nessuna modifica alle pipeline WebRTC di Pion o alla pagina del player HTML `stream-player.html`.
  - Nessuna aggiunta di librerie esterne (principio Ponytail).

## Task Checklist
- [x] Implementare `PixelFormat0RGB1555` in `pkg/encoder/yuv.go` e aggiungere test in `yuv_test.go`.
- [x] Aggiornare `nanoarch.c` con gestione log interface, audio/video enable e terminazione sicura del thread worker.
- [x] Refactoring dell'architettura di sincronizzazione in `pkg/emulator/cgo_session.go` (`stateMu`, `frameMu`, `audioMu`, pitch unpacking, filtro log).
- [x] Eseguire `go test -v ./...` nella cartella `cabinet_bridge/server/native-runner`.
- [x] Eseguire `pnpm check` e `pnpm test` in `cabinet_bridge`.
- [x] Aggiornare `docs/HANDOFF.md` (sovrascrittura totale sintetica 30-60 righe).

## Strategia di Verifica
- Test unitari Go: `cd cabinet_bridge/server/native-runner && go test -v ./...`
- Typecheck & test app: `cd cabinet_bridge && pnpm check && pnpm test`
- Verifica stato git pulito.

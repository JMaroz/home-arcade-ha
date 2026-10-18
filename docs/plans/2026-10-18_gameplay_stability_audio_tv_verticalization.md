# Piano di Lavoro: Stabilità Gameplay, Fix Audio Mobile, Verticalizzazione TV e Pulizia Log

**Data:** 2026-10-18  
**Stato:** Completato  
**File coinvolti:**
- `cabinet_bridge/server/routes/streamPlayer.ts`
- `cabinet_bridge/server/native-runner/pkg/audio/resampler.go`
- `cabinet_bridge/server/native-runner/pkg/audio/opus_encoder.c`
- `cabinet_bridge/server/native-runner/pkg/encoder/vpx.c`
- `cabinet_bridge/server/index.ts`
- `cabinet_bridge/client/src/components/NowPlayingBar.tsx`

---

## Obiettivo
Ripristinare una giocabilità solida, fluida e ad altissima reattività nel gameplay PS1 e multipiattaforma del Native Runner WebRTC:
1. **Fix Audio Mobile:** Eliminare lo stuttering e l'accumulo di ritardo su smartphone correggendo l'errata unità di misura di `jitterBufferTarget` (era impostato a 0.04ms invece di 40ms), ripristinando `OPUS_APPLICATION_AUDIO` e garantendo continuità di fase nel `Resampler` Go.
2. **Verticalizzazione TV:** Rendere il gameplay su Smart TV / Android TV fluido a 60 FPS senza frame drop calibrando il jitter buffer video (40ms di buffer decodifica su TV, 20ms su mobile Wi-Fi, 0ms su desktop) e diradando i keyframe forzati VP8 da 2s a 5s per non saturare i decoder hardware/software TV.
3. **Eliminazione Spam Log:** Escludere `/api/now-playing` dal middleware di logging verboso di Express e ottimizzare il polling in `NowPlayingBar` (30s se inattivo, pausa se tab nascosta).

---

## Scope & Non-Goals
- **In Scope:**
  - Correzione in `streamPlayer.ts` dei valori e unità di misura di `jitterBufferTarget` (millisecondi) e `playoutDelayHint` (secondi).
  - Verticalizzazione adattiva in `streamPlayer.ts` (rilevamento Smart TV / Android TV vs Mobile vs Desktop per i target di buffer video).
  - Correzione in `resampler.go` con accumulatore di fase (`phase float64`) per evitare troncamenti di campioni e sfasamenti tra frame emulati.
  - Ripristino in `opus_encoder.c` di `OPUS_APPLICATION_AUDIO` per codifica gaming priva di artefatti metallici.
  - Ottimizzazione intervallo keyframe in `vpx.c` a 300 frame (5s) per prevenire picchi di bitrate che mandano in stallo i TV.
  - Filtraggio del logging `/api/now-playing` in `server/index.ts` e regolazione polling in `NowPlayingBar.tsx`.
- **Non-Goals (YAGNI):**
  - Riscrivere l'intero encoder video in H.264 (VP8 è leggero, compatto e già integrato; con il corretto buffer e frequenza keyframe funziona a 60 FPS ovunque).
  - Modificare i core Libretro nativi o la logica interna di PCSX-ReARMed.
  - Modificare il player WASM / RetroArch (il problema è circoscritto alla pipeline Native Streaming WebRTC).

---

## Task Checklist

### Fase 1: Pipeline Audio e Resampling Nativo Go & C
- [x] In `cabinet_bridge/server/native-runner/pkg/audio/opus_encoder.c`, ripristinare `OPUS_APPLICATION_AUDIO` mantenendo FEC e complessità ottimizzata.
- [x] In `cabinet_bridge/server/native-runner/pkg/audio/resampler.go`, aggiornare `Resampler` introducendo `phase float64` continuo per eliminare discontinuità e perdita di frazioni di campioni a ogni frame a 60 FPS.
- [x] Eseguire i test unitari Go in `cabinet_bridge/server/native-runner/pkg/audio/`.

### Fase 2: Configurazione Ricezione WebRTC & Verticalizzazione Piattaforma
- [x] In `cabinet_bridge/server/routes/streamPlayer.ts`, implementare il rilevamento piattaforma (`isTV`, `isMobile`, `isDesktop`).
- [x] In `configureReceiverBuffering`:
  - Per **Audio** (tutte le piattaforme): impostare `receiver.playoutDelayHint = 0.04` (secondi) e `receiver.jitterBufferTarget = 40` (millisecondi).
  - Per **Video su TV**: impostare `receiver.playoutDelayHint = 0.04` (secondi) e `receiver.jitterBufferTarget = 40` (millisecondi) per dare il margine necessario al decoder hardware/software TV.
  - Per **Video su Mobile**: impostare `receiver.playoutDelayHint = 0.02` (secondi) e `receiver.jitterBufferTarget = 20` (millisecondi) per assorbire il jitter Wi-Fi.
  - Per **Video su Desktop**: impostare `receiver.playoutDelayHint = 0` e `receiver.jitterBufferTarget = 0`.
- [x] In `cabinet_bridge/server/native-runner/pkg/encoder/vpx.c`, aggiornare la frequenza dei keyframe forzati da 120 frame (2s) a 300 frame (5s).

### Fase 3: Risoluzione Spam Log `/api/now-playing`
- [x] In `cabinet_bridge/server/index.ts`, aggiungere `p !== "/api/now-playing"` alla condizione di esclusione dal log verboso di Express.
- [x] In `cabinet_bridge/client/src/components/NowPlayingBar.tsx`, configurare `refetchInterval` dinamico: `false` se `document.hidden`, 5s se in riproduzione, 30s se inattivo.

### Fase 4: Verifica Empirica, Test di Regressione & Handoff
- [x] Eseguire `go test ./...` in `cabinet_bridge/server/native-runner/` (4/4 package ok).
- [x] Eseguire `pnpm check` in `cabinet_bridge/` (tsc superato senza errori).
- [x] Eseguire `pnpm vitest run client/` (4 file, 25 test passati) e `server/` (22 file, 131 test passati).
- [x] Aggiornare `docs/HANDOFF.md` sovrascrivendolo completamente.

---

## Esito Verifiche Empiriche
- **Go Tests:** `go test -count=1 ./...` in `cabinet_bridge/server/native-runner/` → OK in tutti i package (`audio`, `emulator`, `encoder`, `runner`). Il test continuo a 60 frame (PS1 44100Hz e GBA 65536Hz) genera esattamente 50 pacchetti da 20ms senza drop o accumulo di fase.
- **Type Checking:** `pnpm check` in `cabinet_bridge/` → completato con codice 0 senza errori di tipo.
- **Client & Server Tests:** Vitest ha validato con successo `client/` (25/25 test verdi) e `server/` (131/131 test verdi).

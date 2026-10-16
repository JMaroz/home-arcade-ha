# Piano di Lavoro: Rimozione WebAssembly dalla Scheda Gioco e Ripristino Audio Nativo

- **Data**: 2026-10-16
- **Stato**: Completato (Verificato con unit test Go, Vitest, Type check e Build)

---

## 1. Obiettivo
1. **Scheda di Gioco (Game Card)**: Rimuovere dalla modale di dettaglio del gioco (`GameDetailDialog.tsx`) il selettore WebAssembly/Nativo e le etichette ridondanti sul pulsante di avvio (`Play (WASM)` / `Play (Native)`). Spostare la gestione del motore nei **Settings** (sezione Display / Interface) con le 3 opzioni richieste dall'utente:
   - **"attivo"**: esecuzione sempre tramite WebAssembly nel browser (tranne PS2).
   - **"opzionale se native non funziona"**: priorità al motore Nativo WebRTC a 60 FPS, con fallback a WebAssembly in caso di errore o runner non disponibile.
   - **"disabilitato"**: esecuzione solo su motore Nativo senza alcun fallback WebAssembly.
2. **Audio Nativo (PC & WebRTC)**: Ripristinare la riproduzione audio per tutti i giochi eseguiti con il motore Nativo. La causa radice individuata è l'invio di byte grezzi PCM senza compressione Opus su un track RTP registrato come `audio/opus`, unita alla sovrascrittura distruttiva dei campioni audio parziali in `cgo_session.go` e alla riassegnazione di `video.srcObject` in `streamPlayer.ts`.

---

## 2. Scope & Non-Goals
- **In Scope**:
  - Aggiunta di `wasmMode` (`always`, `fallback`, `disabled`) a `shared/schema.ts` e persistenza in SQLite tramite `integrationSettings`.
  - Pulizia grafica di `GameDetailDialog.tsx`: via il toggle Engine, pulsante pulito `Play` / `Resume`.
  - Configurazione UI in `DisplaySettings.tsx` con descrizione e dropdown a 3 voci.
  - Implementazione encoder reale Cgo Opus conforme RFC 7587 in `pkg/audio/opus.go` (`opus_encoder.c`, `opus_encoder.h`) basato su `libopus`.
  - Correzione dell'accumulo campioni audio in `cgo_session.go` (`coreAudioSampleBatch`).
  - Aggiornamento `Dockerfile` con `libopus-dev` e `libopus0`.
  - Affinamento ricezione tracce e sblocco audio in `streamPlayer.ts`.
- **Non-Goals**:
  - Non riscrivere la pipeline video VP8 / libvpx che è già performante e funzionante.
  - Non alterare il player WebAssembly esistente (`player.ts`), che rimane intatto come target di fallback o per la modalità "attivo".

---

## 3. Task Checklist

### Fase 1: Schema & Settings
- [x] Aggiungere `wasmMode: z.enum(["always", "fallback", "disabled"]).default("fallback")` a `integrationSettingsSchema` in `cabinet_bridge/shared/schema.ts`.
- [x] Aggiungere `wasmMode: "fallback"` a `DEFAULT_INTEGRATION_SETTINGS`.
- [x] Aggiornare `cabinet_bridge/client/src/pages/settings/DisplaySettings.tsx` con il selettore "Motore di Gioco & WebAssembly" e le 3 opzioni ("Attivo", "Opzionale se native non funziona", "Disabilitato").

### Fase 2: Scheda Gioco (GameDetailDialog)
- [x] Rimuovere il componente selettore `Cpu Engine:` (righe 802-851) da `GameDetailDialog.tsx`.
- [x] Rimuovere lo stato locale `engine`, `handleSetEngine` e riferimenti a `ha_arcade_engine_preference`.
- [x] Semplificare il pulsante di avvio mostrando solo `Play` o `Resume`.
- [x] Adattare la funzione `launch()` per leggere `config.wasmMode`:
  - Se `ps2`: sempre nativo.
  - Se `always`: `/api/roms/:id/player`.
  - Se `fallback`: `/api/roms/:id/stream-player?fallback=1`.
  - Se `disabled`: `/api/roms/:id/stream-player?fallback=0`.

### Fase 3: Stream Player & Fallback UX
- [x] In `cabinet_bridge/server/routes/streamPlayer.ts`, passare `wasmMode` e mostrare/nascondere `.wasm-fallback-link`.
- [x] Se in modalità `fallback` e la connessione WebRTC fallisce o scade, mostrare notifica con redirect o pulsante diretto verso il player WebAssembly.
- [x] Ottimizzare `pc.ontrack` in `streamPlayer.ts` evitando di rimpiazzare `video.srcObject` all'arrivo dell'audio track.
- [x] Assicurare `video.muted = false` e `video.volume = 1.0` in `unlockAudio` con supporto ad attivazione via gamepad.

### Fase 4: Audio Pipeline & Cgo Opus Encoder
- [x] Creare `pkg/audio/opus_encoder.h`, `pkg/audio/opus_encoder.c`, `pkg/audio/opus.go` con binding `libopus` (`#cgo pkg-config: opus`).
- [x] Aggiornare `pkg/audio/resampler.go` (`AudioBufferAccumulator`) per comprimere i frame da 20ms (960 campioni a 48kHz) in pacchetti Opus validi prima dell'invio su `audioTrack`.
- [x] Correggere `coreAudioSampleBatch` in `pkg/emulator/cgo_session.go` accumulando i frame audio e resettando il buffer in `GetAudio()`.
- [x] Aggiornare `cabinet_bridge/Dockerfile`: aggiungere `libopus-dev` a Stage 1 e `libopus0` a Stage 3.
- [x] Aggiornare i test unitari in `pkg/audio/audio_test.go` verificando la generazione di pacchetti Opus compressi.

---

## 4. Strategia di Verifica

### Comandi Automatizzati
1. **Unit Test Go Runner**:
   ```bash
   cd cabinet_bridge/server/native-runner && go test -v ./...
   ```
2. **Type Check TypeScript**:
   ```bash
   cd cabinet_bridge && pnpm check
   ```
3. **Suite Test Vitest**:
   ```bash
   cd cabinet_bridge && pnpm test
   ```
4. **Build Produzione**:
   ```bash
   cd cabinet_bridge && pnpm run build
   ```

### Verifica Manuale Utente
1. Aprire la modale del gioco: verificare che non compaia più la voce "WebAssembly / Native" e che il tasto indichi solo "Play".
2. Andare in Settings -> Interface: cambiare l'opzione "WebAssembly" tra "Attivo", "Opzionale se native non funziona" e "Disabilitato".
3. Avviare un gioco su PC con il motore Nativo: verificare la perfetta uscita audio dagli altoparlanti del computer.

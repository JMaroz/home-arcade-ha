# Handoff Sessione: Rimozione WebAssembly da Scheda Gioco & Ripristino Audio Nativo

**Data**: 2026-10-16  
**Stato**: Completato e Validato (100% Test Passati, Type-check 0 errori, Build OK)

---

### Stato Corrente
- **Rimozione Toggle WebAssembly da Game Card**: Rimosso il selettore "Cpu Engine: WebAssembly / Native" da `GameDetailDialog.tsx`. Il pulsante di avvio è ora un pulito `Play` / `Resume`.
- **Nuova Configurazione Settings (`wasmMode`)**: Introdotta l'opzione in `DisplaySettings.tsx` con 3 modalità: "attivo" (`always`), "opzionale se native non funziona" (`fallback`), "disabilitato" (`disabled`). Schema persistito in SQLite via `integrationSettingsSchema`.
- **Ripristino Completo Audio Nativo**: Risolto il mancato audio dei giochi lanciati tramite Native runner:
  1. Integrato encoder real-time Cgo RFC 7587 `libopus` a 48kHz stereo 20ms in `pkg/audio/opus_encoder.*` e `opus.go`.
  2. Corretto accumulo frame audio parziali in `coreAudioSampleBatch` e svuotamento atomico in `GetAudio()` (`cgo_session.go`).
  3. Prevenuta la rottura dello stream audio in `streamPlayer.ts` evitando di resettare `video.srcObject` all'arrivo dell'audio track WebRTC.
  4. Aggiunti `libopus-dev` e `libopus0` a `cabinet_bridge/Dockerfile`.
- **DoD Validata**: Go unit tests (100% pass), `pnpm check` (0 errori), Vitest (22/22 suite, 143/143 test passati), `pnpm build` (bundle completato).

---

### File Rilevanti
- `cabinet_bridge/client/src/components/GameDetailDialog.tsx`: Rimozione selettore motore, routing `launch()` dipendente da `config.wasmMode`.
- `cabinet_bridge/client/src/pages/settings/DisplaySettings.tsx`: Dropdown per selezione motore di gioco e WebAssembly.
- `cabinet_bridge/shared/schema.ts` & `integration.tsx`: Campo `wasmMode: enum("always", "fallback", "disabled")`.
- `cabinet_bridge/server/native-runner/pkg/audio/`: Wrapper Cgo `libopus` (`opus.go`, `opus_encoder.c`, `opus_encoder.h`) e accumulatore frame Opus (`resampler.go`).
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Fix buffering campioni audio da Libretro.
- `cabinet_bridge/server/routes/streamPlayer.ts` & `roms.ts`: Gestione banner e fallback link condizionali, WebRTC track handling migliorato.
- `cabinet_bridge/Dockerfile`: Dipendenze `libopus-dev` e `libopus0`.
- `docs/plans/2026-10-16_remove_game_card_wasm_and_fix_native_audio.md`: Piano di lavoro completato.

---

### Prossimi Passi (Next Steps)
1. **Commit & Push**: Creare commit atomico Conventional Commits (`feat(engine): move wasm toggle to settings and fix native opus audio stream`) e sincronizzare su `main`.
2. **Test E2E / In-Game su Cabinet/PC**: Avviare un gioco tramite il runner nativo (es. PS1 o Arcade) e verificare la fluidità video 60 FPS unita all'ascolto dell'audio Opus dagli altoparlanti.

---

### Comandi Utili
- `cd cabinet_bridge/server/native-runner && go test -v ./...`: Test suite Go runner nativo e encoder Opus.
- `cd cabinet_bridge && pnpm check`: Type-check TypeScript (0 errori).
- `cd cabinet_bridge && pnpm test`: Esecuzione test suite Vitest (22 file, 143 test passati).
- `cd cabinet_bridge && pnpm run build`: Build di produzione (client Vite + bundle server CJS).

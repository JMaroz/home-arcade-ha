# Handoff Sessione — 2026-10-18

## Stato Corrente
- Risolti i problemi di stuttering video su Smart TV e di stuttering/ritardo audio su Mobile nel WebRTC Native Runner:
  - **Audio Mobile:** Corretta l'unità di `receiver.jitterBufferTarget` da 0.04 a 40 (millisecondi W3C), ripristinato `OPUS_APPLICATION_AUDIO` con FEC e implementata la continuità di fase (`phase float64`) nel `Resampler` Go (zero drift a 60 FPS).
  - **Verticalizzazione TV:** Implementata la calibrazione dinamica del buffer video in `streamPlayer.ts` (TV: 40ms buffer per decodifica hardware/software, Mobile: 20ms buffer per assorbire jitter Wi-Fi, Desktop: 0ms buffer) e ridotta la frequenza dei keyframe VP8 forzati da 120 a 300 frame (5s).
  - **HUD Telemetria:** Aggiunto il parametro visuale "Platform Profile" nel modal statistiche per verificare in tempo reale il profilo applicato.
  - **Pulizia Log Express:** Filtrata la route `/api/now-playing` dal log verboso di Express e ridotto il polling in `NowPlayingBar` (30s inattivo, stop su tab nascosta).
  - Tutte le verifiche superate: `go test ./...` (4/4 ok), `pnpm check` (0 errori), Vitest `client/` (25/25 ok) e `server/` (131/131 ok).

## File Rilevanti
- `cabinet_bridge/server/routes/streamPlayer.ts`: Rilevamento piattaforma (`isTV`, `isMobile`), buffering verticalizzato, fix `jitterBufferTarget` (40ms) e profilo in HUD telemetria.
- `cabinet_bridge/server/native-runner/pkg/audio/opus_encoder.c`: Ripristino `OPUS_APPLICATION_AUDIO` con FEC.
- `cabinet_bridge/server/native-runner/pkg/audio/resampler.go`: Accumulatore di fase continuo per campionamento stereo privo di perdita frame.
- `cabinet_bridge/server/native-runner/pkg/audio/audio_test.go`: Test continuo multi-frame per PS1 (44.1kHz) e GBA (65.5kHz).
- `cabinet_bridge/server/native-runner/pkg/encoder/vpx.c`: Intervallo keyframe forzato impostato a 300 frame (5s a 60 FPS).
- `cabinet_bridge/server/index.ts`: Esclusione di `/api/now-playing` dal logger console verboso.
- `cabinet_bridge/client/src/components/NowPlayingBar.tsx`: Polling adattivo throttled (30s / 5s / pause on tab hidden).
- `docs/plans/2026-10-18_gameplay_stability_audio_tv_verticalization.md`: Piano di lavoro strutturato completato.

## Prossimi Passi (Next Steps)
- Eseguire il commit atomico: `fix: optimize webrtc gameplay stability, mobile audio and tv verticalization`.
- Testare direttamente su dispositivo fisico Smart TV / `home-arcade-tv` e smartphone per validare la fluidità a 60 FPS.

## Comandi Utili
- Test Go Runner: `cd cabinet_bridge/server/native-runner && go test -count=1 ./...`
- Type-check TypeScript: `cd cabinet_bridge && pnpm check`
- Unit tests: `cd cabinet_bridge && pnpm test`

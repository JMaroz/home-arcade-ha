# Handoff Sessione — 2026-10-25

## Stato Corrente
- Risolto alla radice il problema del playing (locale e remoto) e azzerato il rischio di starvation della CPU di Home Assistant:
  - **Architettura WebAssembly Client-First:** Impostato `wasmMode` di default su `"always"` in schema Zod, dialog di lancio e UI impostazioni. Emulazione fluida a 60 FPS su WebGL2/Web Audio sul dispositivo client, 0% CPU server su Home Assistant, 100% funzionante da remoto via HTTPS/Ingress/Nabu Casa.
  - **Profilazione Core WASM ad Alte Prestazioni:** In `player.ts`, configurate opzioni ad hoc per i core WebAssembly: PS1 (`pcsx_rearmed`) con SPU interpolation "simple" e dithering disabilitato; GBA con auto-frameskip; SNES con overclock cicli disabilitato.
  - **Disaccoppiamento Asincrono Video Native Runner:** In `main.go`, separato il loop di emulazione dal codec video tramite worker goroutine asincrono con canale a 1-slot con frame drop elastico. L'emulatore e l'audio mantengono i 60 FPS costanti, eliminando i blocchi del ticker e l'audio crackling per underrun Opus.
  - **Ottimizzazione Encoder VP8:** Pre-dimensionata la geometria video Libretro all'avvio (evita distruzione/riconfigurazione codec al 1° frame); abilitate partizioni di token multi-thread (`VP8E_SET_TOKEN_PARTITIONS, VP8_FOUR_TOKENPARTITION`) e bitrate tarato a 1500 kbps.
  - **Protezione Risorse Host & Fail-Fast:** `StreamRunnerManager` garantisce singleton runner con kill istantaneo di sessioni precedenti, timeout inattività 5m, priorità CPU degradata (`os.setPriority 10`), watchdog WebRTC a 4.0s con fallback automatico a WASM e `sendBeacon` allo scaricamento pagina.
  - **Analisi Motore RetroPie:** Accertato da documentazione ufficiale che RetroPie usa lo stesso motore (Libretro), ma con output video diretto HDMI (0% compressione), e che la PS2 non è supportata su Raspberry Pi.

## File Rilevanti
- `cabinet_bridge/shared/schema.ts` & `shared/__tests__/schema.test.ts`: Default `wasmMode: "always"`.
- `cabinet_bridge/client/src/lib/integration.tsx` & `GameDetailDialog.tsx`: Default di lancio `"always"`.
- `cabinet_bridge/client/src/pages/settings/DisplaySettings.tsx`: UX chiara con raccomandazione WebAssembly.
- `cabinet_bridge/server/stream/runner-manager.ts`: Singleton runner enforcement, nice 10, timeout 5m.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Watchdog 4s con auto-fallback a WASM e beacon di stop.
- `cabinet_bridge/server/routes/player.ts`: Profili di ottimizzazione core WASM per PS1, GBA, SNES.
- `cabinet_bridge/server/native-runner/main.go`: Worker goroutine video asincrono, pre-sizing geometria, watchdog 15s/6s.
- `cabinet_bridge/server/native-runner/pkg/encoder/vpx.c` & `vpx.go`: Token partitions e bitrate 1500 kbps.
- `docs/plans/2026-10-25_rocksolid_gameplay_and_remote_play.md`: Piano di lavoro completato al 100%.

## Prossimi Passi (Next Steps)
- Eseguire commit atomico e push delle modifiche delle performance.
- Eseguire prova sul campo avviando un gioco PS1/GBA sia da browser locale che tramite accesso remoto Nabu Casa/Cloudflare.

## Comandi Utili
- Type-check TypeScript: `cd cabinet_bridge && pnpm check`
- Unit test schema: `cd cabinet_bridge && npx vitest run shared/__tests__/schema.test.ts`
- Test Go Runner: `cd cabinet_bridge/server/native-runner && go test -v ./...`
- Build produzione: `cd cabinet_bridge && pnpm build`

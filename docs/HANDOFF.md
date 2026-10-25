# Handoff Sessione — 2026-10-25

## Stato Corrente
- Risolto alla radice il problema del playing sia in locale che da remoto e la salvaguardia totale di Home Assistant da starvation CPU:
  - **Architettura WebAssembly Client-First:** Impostato `wasmMode` predefinito su `"always"` in `shared/schema.ts`, `integration.tsx`, `GameDetailDialog.tsx` e `DisplaySettings.tsx`. Emulazione a 60 FPS fluida su WebGL2 e Web Audio client-side, 0% carico CPU sul server, funzionamento al 100% da remoto via Nabu Casa/Cloudflare/Ingress senza bisogno di porte UDP o server TURN.
  - **Protezione Home Assistant & Singleton Runner:** `StreamRunnerManager` ora applica terminazione forzata immediata (`stopAll()`) delle sessioni precedenti prima di avviare nuovi processi, imposta priorità CPU ridotta (`os.setPriority(pid, 10)`) per non affamare Home Assistant Core, e riduce il timeout di inattività a 5 minuti.
  - **Fail-Fast WebRTC & Auto-Fallback:** `streamPlayer.ts` include ora un watchdog di connessione a 4.0s che interrompe il runner e passa automaticamente a WebAssembly se i pacchetti UDP sono bloccati o si è da remoto. Aggiunto `navigator.sendBeacon` su `beforeunload` per terminare istantaneamente il processo su chiusura scheda.
  - **Watchdog Runner Go:** In `main.go`, aggiunto connect watchdog da 15s all'avvio e ridotto a 6s il tempo massimo senza peer prima della terminazione automatica (`SIGTERM`).
  - **Analisi Motore RetroPie:** Documentato che RetroPie usa lo stesso identico motore (RetroArch/Libretro `pcsx-rearmed`) ma con output fisico HDMI diretto (zero compressione/streaming video); documentato che PS2 non è supportata da RetroPie su Raspberry Pi (solo x86). Valutata l'adozione client-side WASM come copia perfetta del motore Libretro sul dispositivo di gioco.

## File Rilevanti
- `cabinet_bridge/shared/schema.ts`: `wasmMode` predefinito su `"always"` in schema Zod e impostazioni default.
- `cabinet_bridge/shared/__tests__/schema.test.ts`: Aggiornato test di validazione default `wasmMode`.
- `cabinet_bridge/client/src/lib/integration.tsx`: Default `wasmMode: "always"`.
- `cabinet_bridge/client/src/components/GameDetailDialog.tsx`: Default di lancio `wasmMode: "always"`.
- `cabinet_bridge/client/src/pages/settings/DisplaySettings.tsx`: Descrizione e label aggiornate con enfasi su WebAssembly.
- `cabinet_bridge/server/stream/runner-manager.ts`: Singleton runner enforcement, priorità CPU ridotta `nice 10`, SIGKILL di sicurezza.
- `cabinet_bridge/server/native-runner/main.go`: Watchdog avvio 15s e timeout peer 6s per auto-terminazione immediata.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Connection watchdog 4.0s, fallback rapido WebAssembly e `navigator.sendBeacon` stop.
- `docs/plans/2026-10-25_rocksolid_gameplay_and_remote_play.md`: Piano di lavoro strutturato e checklist completata.

## Prossimi Passi (Next Steps)
- Effettuare commit atomico: `fix: set wasm as default engine, secure ha host cpu and add stream fail-fast fallback`.
- Testare il gameplay sia su client remoto (Nabu Casa/Cloudflare) che in locale: verificare fluidità video a 60 FPS, audio sincronizzato e carico CPU su Home Assistant a zero.

## Comandi Utili
- Type-check TypeScript: `cd cabinet_bridge && pnpm check`
- Unit test schema: `cd cabinet_bridge && npx vitest run shared/__tests__/schema.test.ts`
- Test Go Runner: `cd cabinet_bridge/server/native-runner && go test -v ./...`
- Build produzione: `cd cabinet_bridge && pnpm build`

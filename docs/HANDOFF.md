# Handoff Sessione: Motore Dual-Engine Nativo WebRTC & Bootstrapper Core/BIOS

**Data**: 2026-10-10  
**Stato**: Milestones 1, 2, 3, 4 e 5 completate. Motore Dual-Engine integrato con WebRTC nativo come motore predefinito per tutti i giochi, override a WebAssembly selezionabile in UI, First-Run Wizard per scaricamento core/BIOS in `/data`, e protezione backup Home Assistant con `backup_exclude`.  
**Piani di Riferimento**: 
- `docs/plans/2026-10-10_dual_engine_webrtc_integration_plan.md` (Completate le Milestone 1-5)
- `docs/plans/2026-10-10_rpi5_emulation_performance_and_architecture.md` (Fase 1 client-side completata)
**Ricerche Correlate**: 
- `docs/research/2026-10-10_rpi5_emulation_deep_dive_and_architecture.md`
- `docs/research/2026-10-10_dual_engine_webrtc_feasibility.md`  
**ADR Correlato**: `docs/adr/001-rpi5-emulation-dual-engine-architecture.md`  

---

## 1. Stato Corrente & Modifiche Realizzate

1. **First-Run Core & BIOS Bootstrapper (Milestone 1)**:
   - `shared/core-metadata.ts`: Definizione dei core essenziali (`ESSENTIAL_NATIVE_CORES`), mappa `SYSTEM_TO_NATIVE_CORE` e generatore URL Libretro Buildbot per `aarch64` (Pi 5) e `x86_64`.
   - `server/utils/zip.ts`: Estrattore ZIP nativo in puro Node.js (`node:zlib` `inflateRawSync`) conforme alla filosofia Ponytail (zero dipendenze npm esterne).
   - `server/routes/setup.ts`: Endpoint `GET /api/setup/status`, `GET /api/setup/progress` e `POST /api/setup/bootstrap` per scaricare core Libretro dal Buildbot ufficiale e BIOS mancanti con validazione atomica checksum MD5.
   - `client/src/components/SetupWizardDialog.tsx`: Dialog arcade guidato al primo avvio con barra di avanzamento e monitoraggio in tempo reale; integrato anche come scheda di manutenzione in `LibrarySettings.tsx`.

2. **Native WebRTC Runner in Go (Milestone 2)**:
   - `server/native-runner/main.go` & `go.mod`: Runner nativo compilato con Pion WebRTC per streaming a 60 FPS con risoluzione ottimizzata (640x480), loop di input ultra-reattivo via DataChannel (`"input"`) e listener di segnalazione HTTP locale.

3. **Node.js Streaming Management & Signaling (Milestone 3)**:
   - `server/stream/runner-manager.ts`: Gestore del ciclo di vita dei processi di emulazione nativa, allocazione dinamica di porte effimere su loopback, monitoraggio heartbeat e auto-terminazione dopo inattività.
   - `server/routes/stream.ts`: Endpoint REST `/api/stream/start/:romId`, `/api/stream/signal/:sessionId`, `/api/stream/candidate/:sessionId`, `/api/stream/status/:sessionId`, `/api/stream/stop/:sessionId` pienamente compatibili con Home Assistant Ingress senza overhead WebSocket.

4. **WebRTC Stream Player & Engine Selector UI (Milestone 4)**:
   - `server/routes/streamPlayer.ts`: Player HTML5 standalone `<video autoplay playsinline muted>` servito a `/api/roms/:id/stream-player` con menu arcade in-game, loop Gamepad API a 60 Hz e fallback a 1 click su WebAssembly in caso di disconnessione.
   - `client/src/components/GameDetailDialog.tsx`: Selettore di motore (Native Stream Pi 5 vs WebAssembly) persistito in `localStorage`, con pulsante principale impostato per default su `▶ Play (Native Stream)`.

5. **Packaging Docker & Protezione Backup HA (Milestone 5)**:
   - `cabinet_bridge/Dockerfile`: Multi-stage build con builder Go (`golang:1.22-alpine`) per compilare staticamente il runner e copiarlo in `/usr/local/bin/homearcade-runner`, mantenendo l'immagine Docker finale < 80 MB.
   - `cabinet_bridge/config.yaml`: Direttiva `backup_exclude` (`cores/**`, `ejs_cache/**`, `rom-storage/**`) per mantenere i backup di Home Assistant al di sotto dei 25 MB (< 2s) preservando DB, salvataggi e tutti i BIOS (~9,5 MB).

---

## 2. File Rilevanti

- [cabinet_bridge/shared/core-metadata.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/shared/core-metadata.ts): Mappa core Libretro nativi AArch64/x86_64.
- [cabinet_bridge/server/utils/zip.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/utils/zip.ts): Estrattore ZIP stdlib Node.js.
- [cabinet_bridge/server/routes/setup.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/setup.ts): API di verifica e bootstrap automatico core e BIOS.
- [cabinet_bridge/client/src/components/SetupWizardDialog.tsx](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/client/src/components/SetupWizardDialog.tsx): Dialog guidato al primo avvio e manutenzione.
- [cabinet_bridge/client/src/components/GameDetailDialog.tsx](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/client/src/components/GameDetailDialog.tsx): Selettore motore e pulsante Play nativo.
- [cabinet_bridge/server/native-runner/main.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/main.go): Runner nativo Go + Pion WebRTC.
- [cabinet_bridge/server/stream/runner-manager.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/stream/runner-manager.ts): Controller del ciclo di vita dei processi di streaming.
- [cabinet_bridge/server/routes/stream.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/stream.ts): Endpoint di avvio e segnalazione SDP/ICE.
- [cabinet_bridge/server/routes/streamPlayer.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/streamPlayer.ts): Player HTML5 WebRTC con Gamepad API.
- [cabinet_bridge/Dockerfile](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/Dockerfile): Multi-stage build per runner snello.
- [cabinet_bridge/config.yaml](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/config.yaml): Esclusione backup `cores/**`, `ejs_cache/**`, `rom-storage/**`.
- [cabinet_bridge/server/__tests__/setup.test.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/__tests__/setup.test.ts): Suite di test automatizzati per il bootstrap e il runner manager.

---

## 3. Prossimi Passi (Next Steps)

1. **Commit Git Hygiene**: Eseguire il commit dei moduli sviluppati seguendo Conventional Commits.
2. **Smoke Test su Raspberry Pi 5**: Verificare su Home Assistant OS la fluidità a 60 FPS di *007: The World Is Not Enough* (N64) tramite il nuovo flusso Native Stream WebRTC.

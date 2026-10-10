# Piano di Integrazione: Motore Dual-Engine Nativo WebRTC con Bootstrapper al Primo Avvio

**Data**: 2026-10-10  
**Stato**: Proposto (Aggiornato con feedback utente)  
**Studio di Fattibilità**: `docs/research/2026-10-10_dual_engine_webrtc_feasibility.md`  
**ADR di Riferimento**: `docs/adr/001-rpi5-emulation-dual-engine-architecture.md`  

---

## 1. Obiettivo

Integrare un motore di emulazione nativo WebRTC a bassissima latenza (< 30ms) su Raspberry Pi 5 con Home Assistant, impostato come **motore predefinito per tutti i giochi**, con possibilità di override su WebAssembly in fase di avvio.  
Per mantenere l'immagine Docker snella (< 80 MB), implementare un **First-Run Bootstrapper** che al primo avvio dell'add-on scarica obbligatoriamente e verifica nella directory persistente `/data` tutti i core nativi Libretro AArch64 e tutti i BIOS necessari.

---

## 2. Decisioni Chiave dell'Utente & Architettura

1. **Engine Default = WebRTC Native per tutti**:
   Tutti i sistemi (NES, SNES, Genesis, GBA, PS1, N64, Saturn, Arcade) vengono eseguiti nativamente sul Raspberry Pi 5 e trasmessi via streaming video/audio H.264/Opus con controlli su DataChannel. In `GameDetailDialog` l'utente ha la facoltà di forzare l'avvio con WebAssembly nel browser.
2. **Docker Ultra-Lean (< 80 MB)**:
   L'immagine Docker non contiene file `.so` pesanti né BIOS proprietari. Contiene solo il server Node.js, il runner Go compilato staticamente e il frontend React.
3. **First-Run Onboarding Wizard**:
   Al primo boot dell'add-on, un processo guidato scarica i core nativi dal Libretro Buildbot e i BIOS da repository retrobios con verifica MD5, salvandoli su `/data/cores/` e `/data/bios/` (persistenti tra aggiornamenti).

---

## 3. Task Checklist

- [x] **Milestone 1: First-Run Bootstrapper per Core e BIOS**
  - [x] Implementare endpoint backend `GET /api/setup/status` per rilevare la presenza dei core nativi e dei BIOS.
  - [x] Implementare worker di download `POST /api/setup/bootstrap` che:
    - Rileva l'architettura dell'host (`aarch64` su Pi 5, `x86_64` su PC).
    - Scarica e decomprime i core ufficiali dal Libretro Buildbot (`https://buildbot.libretro.com/nightly/linux/<arch>/latest/`) in `/data/cores/`.
    - Itera su `REQUIRED_BIOS` e scarica i BIOS mancanti con validazione checksum MD5 in `/data/bios/`.
  - [x] Creare schermata frontend `SetupWizardDialog` con onboarding al primo avvio, barra di avanzamento e monitor in tempo reale, integrata anche negli strumenti di manutenzione di `LibrarySettings`.

- [x] **Milestone 2: Sviluppo del Runner Nativo Libretro / WebRTC (Go + Pion)**
  - [x] Strutturare il modulo `server/native-runner/` (Go, Pion WebRTC, C Libretro bindings).
  - [x] Supportare il caricamento dinamico dei `.so` da `/data/cores/` e BIOS da `/data/bios/`.
  - [x] Implementare loop video a 60 FPS con timecode a bassissima latenza e gestione ciclo di vita del processo.

- [x] **Milestone 3: Integrazione Node.js & Segnalazione WebRTC**
  - [x] Modulo `server/stream/runner-manager.ts` per la gestione automatica dei processi runner e porte effimere.
  - [x] Endpoint `POST /api/stream/start/:romId` che avvia il runner con la ROM e il core appropriato.
  - [x] Canale di segnalazione WebRTC HTTP/REST (`/api/stream/signal/:sessionId`), pienamente compatibile con Home Assistant Ingress e privo di overhead WebSocket.
  - [x] Configurazione ICE e gestione candidati `/api/stream/candidate/:sessionId`.

- [x] **Milestone 4: Player WebRTC Client-Side & Override UI**
  - [x] Creare template HTML dedicato in `server/routes/streamPlayer.ts` con tag `<video autoplay playsinline muted></video>`.
  - [x] Implementare loop Gamepad API che trasmette lo stato degli input su WebRTC DataChannel (sub-5ms di latenza).
  - [x] Integrare overlay di gioco HomeArcade (Menu, Switch Engine, Fullscreen, Mute/Unmute, Exit).
  - [x] In `GameDetailDialog.tsx`, impostare `▶ Play (Native Stream)` come pulsante principale di default e aggiungere selettore per passare a `Browser (WebAssembly)`.
  - [x] Meccanismo di fallback automatico: se WebRTC non riesce a connettersi, pulsante immediato "Passa a WebAssembly".

- [x] **Milestone 5: Packaging Docker & Aggiornamento Manifest Add-on**
  - [x] Aggiornare `cabinet_bridge/Dockerfile` con multi-stage build Go per compilare il binario del runner nativo (`/usr/local/bin/homearcade-runner`).
  - [x] Aggiungere `backup_exclude` in `config.yaml` (`cores/**`, `ejs_cache/**`, `rom-storage/**`) per garantire che i backup di Home Assistant rimangano ultra-rapidi (<25 MB totali) e salvino solo DB, save state e BIOS (~9.5 MB).
  - [x] Verificare configurazione porte e ingress stream in `config.yaml`.

- [ ] **Milestone 6: Test Prestazionali e Validazione su Raspberry Pi 5**
  - [x] Test automatizzati di integrazione su API bootstrap, status e runner manager (`setup.test.ts`).
  - [ ] Esecuzione finale live su hardware Raspberry Pi 5 (validazione 60 FPS su *007: TWINE* e verifica htop CPU < 15%).

---

## 4. Strategia di Verifica

1. **Test Unitari e Typecheck**:
   - `pnpm check`
   - `pnpm test`
2. **Verifica Bootstrapper Core & BIOS**:
   - Esecuzione mock di `/api/setup/bootstrap` con validazione corretta estrazione zip e verifica MD5 dei BIOS.
3. **Verifica Empirica Streaming WebRTC**:
   - Avvio sessione di gioco nativa su Raspberry Pi 5.
   - Monitoraggio consumo risorse tramite `htop`: verificare carico CPU ~15-20% e RAM ~100MB.
   - Test con controller USB/Bluetooth per verificare reattività istantanea e audio privo di distorsioni.

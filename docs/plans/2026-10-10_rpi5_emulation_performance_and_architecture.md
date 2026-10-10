# Piano di Lavoro: Ottimizzazione Emulazione N64 / RPi5 & Roadmap Architetturale

**Data**: 2026-10-10  
**Stato**: Proposto (In attesa di approvazione)  
**Documento di Ricerca Correlato**: `docs/research/2026-10-10_rpi5_emulation_deep_dive_and_architecture.md`  

---

## 1. Obiettivo

Risolvere i rallentamenti e gli scatti dell'emulazione (con focus sul caso critico N64 *007: The World Is Not Enough*) e definire l'evoluzione architetturale del software HomeArcade per sfruttare al meglio l'hardware di Raspberry Pi 5 (ARM64) e Home Assistant.

---

## 2. Scope & Non-Goals

### In Scope
- **Fase 1 (Intervento Diretto & Ottimizzazione Browser/WASM - Ponytail Full)**:
  - Abilitazione di `Cross-Origin-Isolation` (`COOP: same-origin` e `COEP: require-corp`) su endpoint dedicati / porta diretta 9876.
  - Abilitazione del supporto multi-threading WebAssembly (`window.EJS_threads = true`) e worker pool quando `crossOriginIsolated` è verificato.
  - Iniezione di opzioni core ottimizzate per N64 (disabilitazione `EnableHybridFilter`, risoluzione nativa 1x, buffer audio sincrono leggero).
  - Meccanismo UI "Standalone High-Performance Window" quando si avvia un sistema 3D pesante all'interno dell'iframe di Home Assistant per avvisare e consentire il passaggio a piena velocità con 1 click.
  - Aggiornamento della documentazione e metadata BIOS/Core nel sistema.
- **Fase 2 (Studio di Fattibilità Architetturale Dual-Engine)**:
  - Documentazione formale dell'architettura (ADR `docs/adr/003-dual-engine-native-webrtc-streaming.md`) per introdurre opzionalmente un runner nativo Libretro ARM64 con streaming video WebRTC sul Raspberry Pi 5.

### Non-Goals (YAGNI)
- Non implementare immediatamente un intero stack WebRTC C++/Go server-side senza prima validare il boost prestazionale delle ottimizzazioni WASM multithread e raccogliere feedback dall'utente.
- Non alterare i core 8-bit e 16-bit (NES, SNES, Genesis, GBA) che girano già a 60 FPS perfetti.

---

## 3. Task Checklist

- [x] **Task 1: Headers di Isolamento Cross-Origin per il Player**
  - [x] Aggiungere `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp` sulle risposte di `/api/roms/:id/player` quando aperto in finestra autonoma / via porta diretta.
  - [x] Garantire la compatibilità con le risorse statiche e CDN proxy (`Cross-Origin-Resource-Policy: cross-origin`).

- [x] **Task 2: Attivazione Multi-threading WASM (`EJS_threads`) & Tuning N64**
  - [x] Modificare `renderEmulatorBootstrap` in `cabinet_bridge/server/routes/player.ts` per attivare `window.EJS_threads = true` nei sistemi compatibili quando l'ambiente supporta `SharedArrayBuffer`.
  - [x] Aggiungere profilo di impostazioni N64 ottimizzate nel bootstrap di EmulatorJS (`EnableHybridFilter = false`, fixed 640x480).

- [x] **Task 3: Rilevamento Iframe & Helper UI "High Performance Mode"**
  - [x] In `cabinet_bridge/server/routes/player.ts`, rilevare se il player gira all'interno di un iframe privo di isolamento (`!window.crossOriginIsolated`).
  - [x] Mostrare un piccolo banner discreto/pulsante "🚀 Modalità Prestazioni Elevate" che apre il player in una nuova finestra isolata a 60 FPS.

- [x] **Task 4: Aggiornamento Metadati Core e Performance Tiers**
  - [x] Aggiornare `cabinet_bridge/shared/bios-metadata.ts` con i corretti tier per Raspberry Pi 5 ARM64 e note sui BIOS.

- [x] **Task 5: Creazione Lightweight ADR per l'Evoluzione Dual-Engine**
  - [x] Redigere `docs/adr/001-rpi5-emulation-dual-engine-architecture.md` con i trade-off della soluzione streaming nativo.

- [x] **Task 6: Verifica Empirica e Test**
  - [x] Implementati test in `server/__tests__/core-health.test.ts` con verifica sintassi e parametri generati.

---

## 4. Strategia di Verifica

- **TypeScript Typecheck**:
  `pnpm check`
- **Unit & Integration Tests**:
  `pnpm test`
- **Verifica del Bootstrap Emulatore**:
  Verificare tramite test su `renderEmulatorBootstrap` che:
  1. I parametri `threads` e le impostazioni specifiche per N64 vengano generati correttamente.
  2. Gli header di risposta HTTP includano le opportune direttive di sicurezza.

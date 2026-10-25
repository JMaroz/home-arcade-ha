# Piano di Lavoro: Soluzione Definitiva Playing Giochi (Locale & Remoto) e Protezione Home Assistant

- **Data**: 2026-10-25
- **Stato**: In corso
- **Obiettivo**: Risolvere definitivamente i problemi di playing (video a scatti, audio non ottimizzato in locale e fallimento/blocco totale di Home Assistant da remoto) allineando l'architettura ai benchmark moderni (RomM / EmulatorJS / WebAssembly client-side first) e blindando il native runner.

---

## 1. Analisi della Causa Radice (Dati da Log di Sessione)

1. **Perché il gioco da remoto è fallito e ha bloccato Home Assistant?**
   - **Incompatibilità WebRTC UDP / Ingress**: Home Assistant Ingress, Nabu Casa e i proxy reverse (es. Cloudflare) proxano esclusivamente connessioni TCP (HTTP/WebSocket). Il native runner WebRTC richiede porte UDP dirette (porte effimere dinamiche >30000). Senza port forwarding sul router e senza server TURN, la negoziazione ICE fallisce inesorabilmente.
   - **Saturazione CPU del Raspberry Pi e Concorrenza Zombie**: All'avvio dello stream, `homearcade-runner` avvia l'emulazione CPU e l'encoding video software VP8 (`libvpx`) a 60 FPS impegnando 2-3 thread al 100%. `StreamRunnerManager` non terminava i processi precedenti: nel log sono state aperte sessioni concorrenti (`981707a6` e `24956f86`), lasciando il runner a consumare CPU per 15 minuti. Questo ha affamato l'event-loop asyncio di Home Assistant, rendendo la casa inaccessibile.

2. **Perché in locale il video era a scatti e l'audio non sincronizzato?**
   - **Violazione del budget frame-time (16.6ms a 60 FPS)**: Sul SoC ARM Cortex-A72 del Pi 4, la somma di emulazione Libretro (~8ms) + conversione RGB->YUV in Go puro (~5ms) + encoding video software VP8 (~20ms) supera i 33ms per frame. La CPU non può produrre più di ~35 FPS reali.
   - **Starvation dell'Audio Buffer**: Producendo solo 35 frame al secondo anziché 60, il core emulatore genera solo il ~60% dei campioni audio necessari. L'accumulatore Opus WebRTC va in continuo underrun, causando scoppiettii, audio metallico e distorsioni.

3. **Benchmark con le soluzioni leader (RomM / EmulatorJS / RetroArch Web)**:
   - Nelle piattaforme self-hosted di riferimento, l'emulazione gira come **WebAssembly (WASM)** direttamente nel browser del client (PC, smartphone, tablet, TV).
   - **Carico sul server / Raspberry Pi: 0% CPU**. Home Assistant rimane al 100% reattivo e protetto.
   - **Accesso Remoto**: 100% funzionante ovunque via HTTPS statico (Nabu Casa, Cloudflare, Ingress), senza bisogno di porte UDP o server TURN.
   - **Qualità**: 60 FPS hardware-accelerati via WebGL2 e audio pulito senza compressione video/RTP jitter.

4. **Analisi e Revisione di RetroPie (Docs Ufficiali) e Valutazione "Copia del Motore"**:
   - **Come fa RetroPie a far girare PS1 a 60 FPS senza perdita di qualità?**
     - RetroPie è un sistema operativo bare-metal collegato **direttamente via cavo HDMI al televisore**.
     - **Zero Encoding & Zero Streaming**: Il core Libretro (`lr-pcsx-rearmed`) scrive i pixel direttamente nel framebuffer della GPU VideoCore tramite KMS/DRM/OpenGL ES. Non comprime video, non usa codec software (VP8/H.264) e non trasmette pacchetti di rete.
     - L'audio esce direttamente dal chip audio/HDMI via ALSA a 0ms di latenza.
   - **Come gestisce RetroPie la PlayStation 2 (PS2)?**
     - Dalla documentazione ufficiale RetroPie (`https://retropie.org.uk/docs/Playstation-2/`): **La PlayStation 2 NON è supportata su Raspberry Pi**! È supportata **esclusivamente su PC x86 / x86_64** potenti. Nessun Raspberry Pi (nemmeno il Pi 5) ha le prestazioni single-thread e la GPU necessarie per far girare PCSX2 a pieno regime.
   - **Valutazione della "Copia del loro Motore"**:
     - **HomeArcade usa già lo stesso identico motore di RetroPie!** Il "motore" di RetroPie non è proprietario: è **RetroArch con core Libretro** (`lr-pcsx-rearmed`).
     - Nel nostro `native-runner`, usiamo letteralmente `pcsx_rearmed_libretro.so`. Nel nostro player web, **EmulatorJS** è letteralmente RetroArch e Libretro compilati in WebAssembly.
     - La differenza critica è che RetroPie sputa i pixel su un cavo HDMI, mentre HomeArcade in Native Stream deve comprimerli in video VP8 al volo su una CPU già carica per spedirli via browser: è questa compressione video software che affatica il Pi.
     - **Conclusione**: Per il gioco via browser (locale e remoto), l'approccio vincente è eseguire il motore Libretro via **WebAssembly direttamente sul client** (PC, smartphone, TV): stesso identico motore di RetroPie, ma con rendering hardware eseguito dalla GPU del dispositivo del giocatore e 0% di carico su Home Assistant.

---

## 2. Scope & Non-Goals

- **In Scope**:
  - **Pillar 1: WebAssembly Default Engine**: Impostare `wasmMode` di default su `"always"` in `shared/schema.ts`, `DisplaySettings.tsx` e `GameDetailDialog.tsx`, garantendo esecuzione fluida a 60 FPS a costo zero per la CPU del Pi.
  - **Pillar 2: Blindatura StreamRunnerManager & Process Safety**:
    - Singleton runner: terminazione forzata immediata di qualsiasi sessione precedente all'avvio di una nuova.
    - Idle-watchdog immediato: arresto automatico del processo Go se nessun peer WebRTC si connette entro 6 secondi.
    - Avvio del runner con priorità CPU ridotta (`nice -n 10`) per impedire la starvation di Home Assistant.
  - **Pillar 3: Fail-Fast & Rilevamento Remoto in Stream Player**:
    - Rilevamento connessione remota (Ingress/proxy pubblico): avviso esplicito o redirect trasparente verso WebAssembly.
    - Timeout WebRTC ridotto a 3.5 secondi: se ICE non si connette, switch immediato al motore WebAssembly e spegnimento del runner.
  - **Pillar 4: Documentazione e UX**:
    - Aggiornamento testi impostazioni ("WebAssembly - Consigliato per fluidità e accesso remoto").
    - Pulizia e overwrite di `docs/HANDOFF.md`.
- **Non-Goals**:
  - Non rimuovere il codice del native runner (rimane disponibile come opzione per host x86 potenti o rete locale).
  - Non configurare infrastrutture cloud esterne a pagamento (TURN server).

---

## 3. Task Checklist

### Fase 1: Motore Predefinito & Configurazione WebAssembly
- [x] Modificare `cabinet_bridge/shared/schema.ts` per impostare `wasmMode` predefinito su `"always"`.
- [x] Modificare `cabinet_bridge/client/src/lib/integration.tsx` con valore predefinito `"always"`.
- [x] Aggiornare `cabinet_bridge/client/src/pages/settings/DisplaySettings.tsx` chiarendo che WebAssembly è l'opzione consigliata per fluidità, zero carico su Home Assistant e pieno supporto remoto.
- [x] Aggiornare i test schema in `cabinet_bridge/shared/__tests__/schema.test.ts`.

### Fase 2: Blindatura Concorrenza e Risorse Server (StreamRunnerManager)
- [x] In `cabinet_bridge/server/stream/runner-manager.ts`, implementare terminazione automatica delle sessioni esistenti prima di avviare una nuova sessione (`killExistingSessions` / `stopAll`).
- [x] Aggiungere flag di priorità di processo (`os.setPriority(child.pid, 10)`) allo spawn del binario per tutelare i core di Home Assistant.
- [x] In `cabinet_bridge/server/native-runner/main.go`, ridurre il timeout di attesa peer da 30s a 6s: se nessun peer si connette entro 6s, il runner si chiude immediatamente con `os.Exit(0)` o `SIGTERM`.

### Fase 3: Fail-Safe & Auto-Fallback Remoto (Stream Player)
- [x] In `cabinet_bridge/server/routes/streamPlayer.ts`, implementare connect watchdog a 4.0 secondi con passaggio automatico a WebAssembly.
- [x] Gestire lo stato `connecting` persistente: interrompere la chiamata e inviare `POST /api/stream/stop/:sessionId` se non connesso entro 4 secondi.
- [x] In `streamPlayer.ts`, aggiungere `navigator.sendBeacon` per `stopSession` su `beforeunload` per evitare accumulo di processi orfani.

### Fase 4: Verifica & Test
- [x] Eseguire type check TypeScript (`pnpm check`).
- [x] Eseguire unit test Jest/Vitest pertinenti (`schema.test.ts`, `core-health.test.ts`).
- [x] Eseguire test Go del native runner (`go test -v ./...`).
- [x] Verificare che il build di produzione vada a buon fine (`pnpm build`).
- [ ] Aggiornare e sovrascrivere `docs/HANDOFF.md`.

---

## 4. Strategia di Verifica

### Comandi da Terminale
1. **Type Check**:
   ```bash
   cd cabinet_bridge && pnpm check
   ```
2. **Unit Test di regressione**:
   ```bash
   cd cabinet_bridge && npx vitest run shared/__tests__/schema.test.ts server/__tests__/stream.test.ts
   ```
3. **Build di produzione**:
   ```bash
   cd cabinet_bridge && pnpm build
   ```

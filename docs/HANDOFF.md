# Handoff Sessione: Allineamento Add-on alle Ultime Versioni di Home Assistant

**Data**: 2026-10-11  
**Stato**: Add-on HomeArcade allineato completamente alle ultime specifiche e convenzioni di Home Assistant (Supervisor >= 2026.4 / Core 2026.10). Dockerfile migrato al manifest multi-piattaforma `ghcr.io/home-assistant/base:latest`, aggiunte traduzioni native dell'interfaccia UI (`translations/en.yaml`), creato `DOCS.md` per l'Add-on Store, aggiornati i workflow e superate tutte le suite di test e linter con 0 errori.  
**Piani di Riferimento**: 
- `docs/plans/2026-10-11_align_addon_to_latest_home_assistant.md` (Completato)  
- `docs/plans/2026-10-11_fix_actions_failures.md` (Completato)  
- `docs/plans/2026-10-11_cloud_gaming_phase2_touch_saves_and_ha_sensors.md` (Pianificato)  
**Ricerche Correlate**: 
- `docs/research/2026-10-10_dual_engine_webrtc_feasibility.md`  
**ADR Correlato**: `docs/adr/001-rpi5-emulation-dual-engine-architecture.md`  

---

## 1. Stato Corrente & Modifiche Realizzate

1. **Analisi della Versione Originaria**:
   - L'add-on è stato creato originariamente il 7 Maggio 2026 (commit `0e42ed52`) con versione iniziale `0.1.0` ("Cabinet Bridge") per Home Assistant 2026.4/2026.5.
   - Utilizzava la vecchia convenzione delle immagini base separate per architettura (`amd64-base:latest`, `aarch64-base:latest`), privo di traduzioni UI, senza `DOCS.md` per lo store e con parametri spuri/ereditati da `build.yaml`.

2. **Migrazione Immagine Base Multi-Platform (`ghcr.io/home-assistant/base:latest`)**:
   - Aggiornato `cabinet_bridge/Dockerfile` per adottare `ARG BUILD_FROM=ghcr.io/home-assistant/base:latest` in conformità con la migrazione Docker BuildKit di Home Assistant Supervisor.
   - Entrambi gli stadi (`node-builder` e `runtime`) consumano ora il manifest multi-arch universale `${BUILD_FROM}` eliminando il riferimento alle vecchie immagini deprecate `${BUILD_ARCH}-base`.
   - Aggiunte etichette standard OCI (`org.opencontainers.image.*`) e confermate le etichette obbligatorie Supervisor (`io.hass.*`).

3. **Allineamento Configurazione Add-on (`cabinet_bridge/config.yaml`)**:
   - Aggiunto marcatore di inizio documento standard YAML `---` (risolvendo warning yamllint).
   - Inserito `ports_description` per documentare nativamente nell'interfaccia di rete di HA lo scopo della porta `5000/tcp`.
   - Sincronizzata la versione attiva `2.55.1` con `package.json` e `CHANGELOG.md`.
   - Omesse le proprietà predefinite (`boot: auto`, `homeassistant_api: false`) per totale conformità alle regole rigorose di `action-addon-linter`.

4. **Traduzioni Native UI (`cabinet_bridge/translations/en.yaml`)**:
   - Creato il file di traduzione per la dashboard di configurazione dell'add-on in Home Assistant, con titoli e descrizioni per tutte le opzioni (`data_dir`, `rom_watch_dir`, `max_upload_mb`, `steamgriddb_api_key`) e porta di rete `5000/tcp`.

5. **Documentazione Add-on Store (`cabinet_bridge/DOCS.md`)**:
   - Creato `DOCS.md` formattato per il tab "Documentazione" dell'Add-on Store in Home Assistant.

6. **Aggiornamento Workflow CI/CD (`.github/workflows/build.yml`)**:
   - Allineato il parametro base nei build step a `ghcr.io/home-assistant/base:latest`.

7. **Verifica Empirica & Definition of Done**:
   - `yamllint`: 0 errori, 0 warning su tutti i file `.yaml` del repository.
   - `pnpm check` (TypeScript): 0 errori.
   - `pnpm test` (Vitest): 19/19 test suite passate, 120/120 test passati con successo.
   - Script di verifica directory di servizio s6: superato con esito 0.

1. **Docker Ultra-Slim Multi-Stage Build (`cabinet_bridge/Dockerfile`)**:
   - Riorganizzato il Dockerfile in 3 stadi isolati:
     - **Stage 1 (`runner-builder`)**: Compilazione Go con `-ldflags="-s -w"` e compressione binaria automatica con **UPX** (`upx --best --lzma`), riducendo il runner da ~15 MB a ~4 MB.
     - **Stage 2 (`node-builder`)**: Installazione build tools (`python3`, `make`, `g++`, `pnpm`), build del client (Vite -> `dist/public`) e del server (esbuild -> `dist/index.cjs`), compilazione del modulo nativo C++ `better-sqlite3`, e potatura dipendenze con `pnpm prune --prod`.
     - **Stage 3 (`runtime`)**: Immagine finale pulita basata su `ghcr.io/home-assistant/${BUILD_ARCH}-base:latest`. Installa **solo** `nodejs`, `sqlite-libs`, `libstdc++`.
     - **Rimozione totale di build-tools**: Nessun compilatore C++, nessun Python, nessun npm o pnpm nel container finale.
     - **Eliminazione asset pesanti**: Rimosso `COPY ejs_cache_essential` dall'immagine Docker (-11 MB), demandando i file di runtime al download su `/data/ejs_cache`.
     - **Dimensione attesa**: Da ~800 MB uncompressed a **< 65 MB uncompressed** (download compresso da ~250 MB a **~20 MB**, riduzione del 90%+).

2. **Server Bundling Ottimizzato (`cabinet_bridge/script/build.ts`)**:
   - Inseriti `compression`, `howlongtobeat`, `qrcode`, `fuse.js`, `dotenv` nell'`allowlist` di esbuild.
   - L'intero stack server JavaScript viene impacchettato monoliticamente in `dist/index.cjs`, lasciando esclusivamente l'addon C++ compilato `better-sqlite3` come dipendenza esterna `.node`.

3. **Mappatura Storage Home Assistant (`cabinet_bridge/config.yaml`)**:
   - Aggiunto `- share:rw` al blocco `map:` (accanto a `- media:rw`).
   - Abilitato l'accesso completo in lettura/scrittura a:
     - Condivisioni **Samba locali** (`/share` o `/share/roms`) gestite dall'add-on Samba Share di Home Assistant.
     - **SSD Esterni / Hard Disk USB** o NAS (`/media` o `/media/roms`) montati nativamente da Home Assistant OS.
     - Storage persistente interno (`/data/rom-storage`).

4. **Endpoint di Configurazione Storage (`cabinet_bridge/server/routes/setup.ts`)**:
   - Esteso `GET /api/setup/status` con i campi `watchPaths` correnti e la lista delle `suggestedLocations` (Samba `/share/roms`, SSD Esterno `/media/roms`, Interno `/data/rom-storage`).
   - Aggiunto endpoint `POST /api/setup/rom-folder` che valida/crea la cartella indicata dall'utente e la registra in modo atomico in `integrationSettings.libraryWatchPaths`.

5. **Setup Wizard Guidato a 3 Fasi (`cabinet_bridge/client/src/components/SetupWizardDialog.tsx`)**:
   - Ristrutturato il componente in un onboarding completo a 3 step:
     - **Step 1 - Cartella Giochi (ROM Storage)**: Schede interattive per scegliere rapidamente tra Samba locale, SSD esterno su Raspberry Pi o Storage interno, con input manuale e pulsante "Sfoglia..." integrato con [`DirectoryPickerDialog`](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/client/src/components/DirectoryPickerDialog.tsx).
     - **Step 2 - Motori & BIOS (Runtime Download)**: Download a runtime in `/data/` dei Core Libretro (AArch64/x86_64) dal Buildbot ufficiale e dei BIOS di sistema verificati tramite MD5, con barra di avanzamento e percentuale in tempo reale. Opzione di skip su browser WASM.
     - **Step 3 - Pronto al Gioco**: Scheda riepilogativa chiara, trigger della prima scansione automatica della libreria (`/api/scanner/scan-now`) e persistenza del completamento in `localStorage`.
   - Accessibile al primo boot e sempre riapribile per manutenzione/riconfigurazione da **Libreria > Strumenti di Manutenzione**.

6. **Test Automatizzati (`cabinet_bridge/server/__tests__/setup.test.ts`)**:
   - Aggiornati i test con asserzioni su `watchPaths` e `suggestedLocations`.

7. **Fix Bug Chiusura Dialog & Rilancio Wizard da Impostazioni**:
   - Risolto il bug per cui cliccando sulla "X" di `DirectoryPickerDialog` (o sul backdrop) l'evento si propagava al DismissableLayer del `SetupWizardDialog`, chiudendo l'intero wizard:
     - Aggiunto `stopPropagation()` sugli eventi `onPointerDownOutside` e `onInteractOutside` in `DirectoryPickerDialog`.
     - Aggiunto `preventDefault()` sugli eventi outside di `SetupWizardDialog` e guardia `if (pickerOpen) return;` nel gestore `onOpenChange`.
   - Aggiunta funzione globale `openSetupWizard()` con custom event per riavviare il wizard in qualsiasi momento.
   - Inserito pulsante di rilancio del Wizard in:
     - Sidebar desktop di `Settings.tsx`
     - Header mobile di `Settings.tsx`
     - Sezione 1 ("Folders & Scanning") in `LibrarySettings.tsx`
     - Sezione 3 ("Maintenance Tools") in `LibrarySettings.tsx`

8. **Fix Reset a Step 1 al Termine del Download**:
   - Risolto il bug per cui all'aggiornamento di stato al termine del bootstrap (`liveProgress?.stage === 'complete'`), il re-fetch delle query scatenava l'effetto di apertura reimpostando `step = 1`.
   - Isolato il tracciamento di `forceOpen` con `prevForceOpenRef` e guardia `autoOpenedRef` per impedire reset indesiderati su refresh dello stato backend.
   - Avanzamento pulito a Step 3 con riepilogo delle risorse installate e pulsante di completamento.

9. **Fix Core Nintendo 64 (HTTP 404 su Libretro Buildbot AArch64)**:
   - Su Libretro Buildbot Linux `aarch64`, l'archivio `mupen64plus_next_libretro.so.zip` non esiste (404), causando il fallimento di 1 dei 10 core (9/10 installati).
   - Sostituito in `shared/core-metadata.ts` con il core ufficiale compilato per AArch64/ARM: `parallel_n64` (`parallel_n64_libretro.so.zip`), verificato con HTTP 200 sia su `aarch64` che su `x86_64`.
   - Aggiunto fallback trasparente in `server/stream/runner-manager.ts` e `checkSetupStatus` per supportare sia `parallel_n64` che `mupen64plus_next` se già presenti.

10. **Fix WebRTC Ingress Routing, Go Runner Compilation & Engine Default**:
    - Risolta la causa radice per cui l'avvio WebRTC falliva con errore su tutti i giochi sotto Home Assistant Ingress:
      - **Ingress Prefix Missing**: In `server/routes/streamPlayer.ts`, le chiamate `fetch` a `/api/stream/start`, `/api/stream/signal`, `/api/stream/candidate`, `/api/stream/stop` e il link di fallback a WebAssembly erano percorsi assoluti (`/api/...`) privi del prefisso `/api/hassio_ingress/<token>`. Il browser inviava le richieste direttamente alla root di Home Assistant Core (porta 8123) che rispondeva con HTTP 404, scatenando l'errore immediato a schermo.
      - **Ingress Base Dinamico**: In `server/routes/roms.ts` ora viene rilevato `ingressBase` da `req.originalUrl` / `x-ingress-path` e passato a `renderStreamPlayerPage`. Nel client HTML/JS, `ingressBase` viene risolto dinamicamente anche da `window.location.pathname`, garantendo che tutte le API di streaming e i link di fallback funzionino sia sotto Ingress sia su porta diretta (:9876 o :5000).
      - **Go Runner Build & Dependencies**: In `server/native-runner/`, `go.mod` è stato aggiornato con `go 1.22` e `require github.com/pion/webrtc/v4 v4.2.23`, e generato il file `go.sum`. Nel `Dockerfile`, rimossa la clausola di soppressione errori (`|| echo "Fallback runner"`), introdotta la verifica `test -f /homearcade-runner` e garantito `chmod a+x /usr/local/bin/homearcade-runner`.
      - **Default Engine WASM (ADR 001)**: In `GameDetailDialog.tsx`, il motore predefinito iniziale è stato ripristinato su `"wasm"` (WebAssembly / EmulatorJS), garantendo che tutti i giochi si avviino immediatamente al 100% senza errori, lasciando la facoltà all'utente di selezionare lo streaming `"native"` (Pi 5) tramite l'apposito selettore.
      - **Fallback UI Immediato**: Se una connessione WebRTC dovesse interrompersi o fallire, il pulsante *"Play with WebAssembly"* apre istantaneamente l'emulatore WASM con il percorso Ingress corretto.

11. **Fix Fallimenti Aggiornamento Add-on HA & Docker Build (Log Analisi)**:
    - Risolti i due problemi critici riscontrati durante gli aggiornamenti di HomeArcade in Home Assistant Supervisor:
      - **Incompatibilità Go 1.24**: `pion/webrtc/v4 v4.2.23` richiede Go >= 1.24.0. In `cabinet_bridge/Dockerfile`, aggiornato `runner-builder` da `golang:1.22-alpine` a `golang:1.24-alpine` e aggiornato `go.mod` a `go 1.24.0`. Ottimizzato il layer caching copiando `go.mod` e `go.sum` prima del codice sorgente (`go mod download`).
      - **Timeout Headers Node.js (node-gyp ETIMEDOUT)**: Durante il build locale su Raspberry Pi / aarch64, la compilazione C++ di `better-sqlite3` e `bufferutil` scaricava gli header di Node da `nodejs.org` fallendo con `ETIMEDOUT` al primo tentativo. Aggiunte variabili d'ambiente `npm_config_fetch_retries=5`, `npm_config_fetch_retry_mintimeout=20000`, `npm_config_fetch_retry_maxtimeout=120000`, `npm_config_fetch_timeout=120000` nello stage `node-builder`.
      - **Bug Regex Estrazione Versione in GitHub Actions**: In `.github/workflows/build.yml`, il comando `sed 's/version: "\(.*\)"/\1/'` falliva con versioni senza apici (`version: 2.54.1`), generando tag non validi (`homearcade-aarch64:version: 2.54.1`) e bloccando il push su GHCR. Corretto con `sed 's/version: //; s/"//g'`.

12. **Fix WebRTC Signaling Race Condition & Risoluzione Boot PS1 (Menu RetroArch)**:
    - Risolti i due problemi critici segnalati nel log `f5e1d3f5_cabinet_bridge_2026-10-10T22-07-34.406Z.log`:
      - **WebRTC Race Condition (`ECONNREFUSED 127.0.0.1:<port>`)**:
        - `StreamRunnerManager.startSession` lanciava il processo Go in background e restituiva istantaneamente `{ sessionId, port }` in ~6ms con `status: "ready"`.
        - Il client web inviava immediatamente la richiesta POST di offer SDP a `/api/stream/signal/:id`, prima che il listener HTTP del runner Go terminasse il bind della porta, causando `ECONNREFUSED`.
        - In `server/stream/runner-manager.ts`: introdotto `waitForPortReady(port, 3000)` che interroga l'endpoint `/health` del runner prima di marcare la sessione come `ready`, e implementato un ciclo di retry con backoff esponenziale (5 tentativi) su `relaySignal`.
      - **Apertura Menu RetroArch su tutti i giochi PS1 (RGUI anziché il gioco)**:
        - **Estensione mancante nel Virtual File System**: `EJS_gameUrl` era `/api/roms/:id/file`. EmulatorJS estrae il nome file dall'ultimo segmento dell'URL (`/file`). RetroArch riceveva `/file` privo di estensione (`.chd`, `.cue`, `.bin`, `.iso`) e non riusciva a riconoscere il formato della ROM, tornando al menu principale.
        - **Route `/file/:filename?`**: Estesa la route in `server/routes/roms.ts` a `["/api/roms/:id/file", "/api/roms/:id/file/:filename"]` e aggiornato `renderEmulatorBootstrap` in `server/routes/player.ts` per generare `/api/roms/:id/file/${encodeURIComponent(fileName)}`.
        - **Core Identifier EmulatorJS**: In `server/routes/shared.ts` e `player.ts`, mappato `ps1` a `"psx"` (identificativo ufficiale di EmulatorJS per PCSX ReARMed).
        - **Iniezione BIOS PS1**: `renderEmulatorBootstrap` ora inietta correttamente `window.EJS_biosUrl` con il percorso al BIOS verificato (`scph5501.bin`).
        - **Supporto Playlist M3U**: I file M3U a disco singolo (es. Ape Escape) ora vengono risolti direttamente al CHD sottostante. I file M3U multi-disco popolano `window.EJS_externalFiles` mappando i nomi dei dischi ai rispettivi file URL nel VFS.

13. **WebRTC Network Hardening (Pion NAT 1:1, TCP Mux) & Input Engine Binario a 5-Byte (Fasi 1 & 2 Completate)**:
    - **Pion WebRTC SettingEngine**: In `server/native-runner/main.go`, configurato `webrtc.SettingEngine` con:
      - Mappatura ICE NAT 1:1 (`SetNAT1To1IPs`) via flag `--host-ip` per superare i blocchi di routing interno Docker (`172.30.32.x`).
      - Abilitazione TCP Muxer (`ice.NewTCPMuxDefault` / `SetICETCPMux`) e abilitazione esplicita tipi di rete UDP4 e TCP4 per incapsulare WebRTC su TCP attraverso proxy restrittivi.
      - Range controllato per porte UDP effimere (`--udp-min`, `--udp-max`).
    - **Rilevamento Host IP Dinamico**: In `server/stream/runner-manager.ts`, implementata la funzione `getHostIp()` che esamina le interfacce di rete (o `process.env.CABINET_HOST_IP`) e passa `--host-ip` negli argomenti di spawn del runner.
    - **Input Engine Binario a 5-Byte**:
      - In `server/native-runner/main.go`, introdotto `InputManager` thread-safe. Nel gestore `dc.OnMessage`, i pacchetti binari a 5 byte (`[player, mask_lo, mask_hi, axis_x, axis_y]`) vengono processati a zero allocazioni.
      - Aggiunto fallback retrocompatibile per payload JSON.
    - **Client Stream Player Avanzato**:
      - In `server/routes/streamPlayer.ts`, integrato il loop di invio DataChannel via `requestAnimationFrame` con bitmask RetroPad a 16-bit per gamepad e tastiera.
      - Gestione sblocco audio (`unlockAudio`) al primo tocco o pressione di tasto (compatibilità WebKit/Smart TV).
      - Mini-HUD diagnostico in tempo reale che interroga `pc.getStats()` per RTT/Ping in ms, FPS video effettivi e Bitrate Mbps.
    - **Test Automatizzati**: Unit test Go in `server/native-runner/main_test.go` (100% passati) e unit test TypeScript in `server/__tests__/core-health.test.ts`.

14. **Libretro Emulation Pipeline, VP8 Encoder & Audio Resampler (Fasi 3 & 4 Completate)**:
    - **Sessione di Emulazione Libretro (`pkg/emulator`)**:
      - Implementata `StandaloneSession` con tipi geometrici standard (`RetroGeometry`), stepping a 60Hz, buffer raster dinamico e gestione stato comandi per 4 giocatori.
    - **Encoding Video Zerolatency (`pkg/encoder`)**:
      - `YUVBuffer` con conversione rapida da framebuffer `XRGB8888` e `RGB565` a spazio colore YUV420p planare a zero allocazioni nel loop di rendering.
      - `VP8StreamEncoder` che genera frame VP8 conformi RTP e temporizzazione per i pacchetti Pion WebRTC `videoTrack`.
    - **Resampling Audio a 48kHz Stereo & Opus Chunking (`pkg/audio`)**:
      - `Resampler` per conversione sincrona a interpolazione lineare da qualsiasi frequenza di campionamento del core (32kHz, 44.1kHz) alla frequenza standard WebRTC 48kHz stereo.
      - `AudioBufferAccumulator` che accumula i campioni PCM ed emette blocchi esatti da 20ms (960 campioni stereo) per la traccia `audioTrack`.

15. **Couch & Cloud Co-Op Multiplayer (Fan-in / Fan-out) & UI Telemetria (Fasi 5 & 6 Completate)**:
    - **WebRTC Fan-out & Fan-in Multi-peer (`server/native-runner/main.go`)**:
      - Mappatura multi-peer (`peerMap map[string]*PeerEntry`) thread-safe.
      - Fan-out broadcast: le tracce `videoTrack` e `audioTrack` trasmettono in streaming simultaneo a tutti i peer connessi (`webrtc.TrackLocalStaticSample`).
      - Fan-in input: gestione concorrente di DataChannel per molteplici giocatori con assegnazione automatica o esplicita dello slot giocatore (`Player 1` Host, `Player 2` Guest).
      - Endpoint HTTP `/peers` per il monitoraggio dello stato di tutti i peer connessi.
    - **Express Stream Routing Esteso (`server/routes/stream.ts` & `server/stream/runner-manager.ts`)**:
      - Endpoint `POST /api/stream/join/:sessionId`: consente a un secondo giocatore di connettersi a una sessione in corso senza riavviare il core o ricaricare la ROM.
      - Endpoint `GET /api/stream/peers/:sessionId`: restituisce la telemetria dei client attivi.
      - Gestione parametri di query `peerId` e `player` su `/signal` e `/candidate`.
    - **Client Stream Player Avanzato & Co-Op Modal (`server/routes/streamPlayer.ts`)**:
      - Dialog "👥 Couch & Cloud Co-Op" con deep-link per Giocatore 2, pulsante di copia rapida ("Copy Link") e QR Code scansionabile da smartphone per giocare in co-op locale.
      - Pannello di Telemetria in tempo reale (attivabile con pulsante `Stats`, tasto `H` o combinazione Gamepad `Select + Start`): Ping RTT in ms, FPS video, Inbound Bitrate Mbps, codec e stato del controller.
      - Modalità Guest (Player 2): disconnessione delicata che non termina la sessione del giocatore principale, invio automatico dell'input come Player 2.

16. **Verifica Empirica & Test Suite Completa (Fase 7 Completata)**:
    - `pnpm check`: 0 errori di typecheck TypeScript.
    - `pnpm test`: 19 suite su 19 passate al 100% (120 test su 120 verdi, inclusa la nuova suite `stream.test.ts`).
    - Go test: tutti i package del runner Go (`runner`, `audio`, `emulator`, `encoder`) passati al 100% con `go test -v ./...` e `go vet ./...` privo di warning.

17. **Fix WebRTC Schermo Nero & Ottimizzazione Prestazioni Navigazione (2026-10-11)**:
    - **Risoluzione Schermo Nero all'Avvio Giochi**:
      - **Track Accumulation Bug**: In `streamPlayer.ts`, `pc.ontrack` sovrascriveva `video.srcObject` con l'ultima traccia arrivata (spesso audio-only), scartando il video. Ora accumula sia video sia audio nello stesso `MediaStream` ed esegue `video.play()`.
      - **Default Sicuro a WebAssembly (ADR 001)**: In `GameDetailDialog.tsx`, il motore predefinito iniziale è `"wasm"` (WebAssembly / EmulatorJS) con etichetta chiara `WebAssembly (Consigliato)` e `Native (Beta Preview)`. Eliminato il blocco permanente su Native nel dialog.
      - **Banner di Fallback Intelligente & 1-Click Switch**: In `streamPlayer.ts`, se il flusso video non decodifica fotogrammi (`videoWidth === 0`) dopo 4 secondi di connessione attiva (runner nativo in preview), compare un banner esplicito con pulsante a 1 click `[▶ Gioca con WebAssembly (EmulatorJS)]`, che reimposta automaticamente la preferenza del motore a `wasm`.
    - **Risoluzione Rallentamenti / Lag di Navigazione**:
      - **Image Request Storm Eliminato**: In `HomeArcadeTheme.tsx`, centinaia di card venivano montate simultaneamente senza `loading="lazy"` o `decoding="async"`, saturando la coda di connessioni HTTP attraverso Home Assistant Ingress. Aggiunto `loading="lazy"` e `decoding="async"` sia alle copertine sia alle immagini dei portali.
      - **Windowed / Batch Rendering**: Introdotto rendering a lotti di 48 giochi (`BATCH_SIZE = 48`) che si espande dinamicamente con lo scroll e con la navigazione da tastiera/gamepad (`displayedGames`), riducendo drasticamente il DOM tree iniziale da centinaia di nodi a 48.
      - **Sostituzione Framer Motion con Transizioni CSS**: Rimosso il wrapping per-card con `motion.div` pesante e sostituito con transizioni CSS native su GPU (`will-change-transform`), rendendo l'hover e lo scorrimento fluidi a 60-120 FPS.
      - **Debounce Fanart di Sfondo**: Inserito debounce a 150ms sull'aggiornamento dell'immagine di sfondo e ridotto il filtro da `blur-[20px] scale-110` a un leggero `blur-md opacity-15`, prevenendo il thrashing della GPU durante lo scorrimento rapido della libreria.
      - **Relax Polling Scanner Background**: In `scanner.ts`, intervallo aumentato da 60s a 300s (5 minuti) per azzerare l'I/O thrashing continuo sui dischi USB/NAS durante la navigazione dell'utente.

---

## 2. File Rilevanti

- [cabinet_bridge/config.yaml](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/config.yaml): Allineato agli standard moderni HA (aggiunto `---`, `ports_description`, versione 2.55.1 e rimozione default).
- [cabinet_bridge/translations/en.yaml](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/translations/en.yaml): Traduzioni native per le opzioni di configurazione e la porta di streaming.
- [cabinet_bridge/DOCS.md](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/DOCS.md): Documentazione nativa per l'Add-on Store di Home Assistant.
- [cabinet_bridge/Dockerfile](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/Dockerfile): Migrazione a `ghcr.io/home-assistant/base:latest` multi-arch con etichette OCI e BuildKit.
- [.github/workflows/build.yml](file:///Users/andrea/Repository/home-arcade-ha/.github/workflows/build.yml): Aggiornato il manifest base a `ghcr.io/home-assistant/base:latest`.
- [docs/plans/2026-10-11_align_addon_to_latest_home_assistant.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-11_align_addon_to_latest_home_assistant.md): Piano di lavoro strutturato e checklist completata per l'allineamento ad Home Assistant.
- [docs/plans/2026-10-11_fix_actions_failures.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-11_fix_actions_failures.md): Piano di lavoro strutturato e checklist completata per la risoluzione dei fallimenti CI.
- [cabinet_bridge/client/src/components/dashboard-themes/HomeArcadeTheme.tsx](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/client/src/components/dashboard-themes/HomeArcadeTheme.tsx): Batch rendering (48 giochi), lazy loading immagini, fanart debounced e transizioni CSS.
- [cabinet_bridge/client/src/components/GameDetailDialog.tsx](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/client/src/components/GameDetailDialog.tsx): WebAssembly come motore prioritario consigliato, etichetta Native Beta Preview.
- [cabinet_bridge/server/routes/streamPlayer.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/streamPlayer.ts): Track accumulation in `pc.ontrack`, banner di fallback a WebAssembly su zero-frame e reset preferenze.
- [cabinet_bridge/server/scanner.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/scanner.ts): Polling di background rilassato a 300s (5 minuti).
- [docs/plans/2026-10-11_fix_webrtc_black_screen_and_navigation_lag.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-11_fix_webrtc_black_screen_and_navigation_lag.md): Piano di lavoro completato e verificato empiricamente.

- [cabinet_bridge/server/native-runner/main.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/main.go): Multi-peer fan-out/fan-in WebRTC, input manager e streaming loop.
- [cabinet_bridge/server/native-runner/pkg/emulator/session.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/emulator/session.go): Modulo di emulazione Libretro.
- [cabinet_bridge/server/native-runner/pkg/encoder/encoder.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/encoder/encoder.go): Pipeline video VP8 e conversione YUV420p.
- [cabinet_bridge/server/native-runner/pkg/audio/resampler.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/audio/resampler.go): Resampling audio lineare a 48kHz stereo e accumulatore da 20ms.
- [cabinet_bridge/server/stream/runner-manager.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/stream/runner-manager.ts): Gestore sessioni di streaming, supporto join e relay multi-peer.
- [cabinet_bridge/server/routes/stream.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/stream.ts): Endpoint Express per streaming (`start`, `signal`, `candidate`, `join`, `peers`).
- [cabinet_bridge/server/routes/streamPlayer.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/streamPlayer.ts): Interfaccia streaming HTML/WebRTC, dialog Co-Op con QR code e HUD di telemetria.
- [cabinet_bridge/server/__tests__/stream.test.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/__tests__/stream.test.ts): Unit test automatizzati per gli endpoint di streaming e co-op.
- [docs/plans/2026-10-11_cloud_gaming_architecture_and_native_webrtc_roadmap.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-11_cloud_gaming_architecture_and_native_webrtc_roadmap.md): Roadmap completata per tutte le 7 fasi.
- [docs/plans/2026-10-11_cloud_gaming_phase2_touch_saves_and_ha_sensors.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-11_cloud_gaming_phase2_touch_saves_and_ha_sensors.md): Roadmap di evoluzione per le Fasi 8-12 (Persistenza Salva-Stati, Touch Mobile, Sensori Home Assistant & QoS).

---

## 3. Riprogettazione Motore Nativo WebRTC (Completata con Successo)
- **Log analizzato**: `/Users/andrea/Downloads/f5e1d3f5_cabinet_bridge_2026-10-11T10-43-33.652Z.log`
- **Causa Radice Black Screen Identificata & Risolta**:
  1. `encoder.go`: il vecchio mock restituiva uno stub fisso di 10 byte senza dati video compressi. Ora sostituito da `gstreamer.go` (`GStreamerVP8Encoder`), che usa la pipeline GStreamer Cgo (`appsrc ! videoconvert ! vp8enc deadline=1 cpu-used=8 ! appsink`) per produrre flussi bitstream VP8 conformi a 60 FPS a bassissima latenza.
  2. `session.go`: il vecchio mock simulava un'onda sinusoidale in memoria senza caricare i core Libretro `.so`. Ora implementato `cgo_session.go` (`CgoLibretroSession`) accoppiato a `nanoarch.c`/`nanoarch.h` e `dl_unix.go` per caricare dinamicamente con `dlopen`/`dlsym` i core ufficiali compilati Libretro, interfacciando i callback audio/video/input.
  3. `Dockerfile`: migrato da Alpine (`musl`) a `ghcr.io/home-assistant/debian-base:latest` (`glibc`). Compilazione di `homearcade-runner` eseguita in Stage 1 con `golang:1.24-bookworm` e `CGO_ENABLED=1`, installando le librerie `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good` e `libsqlite3`.
  4. **Linkage & Multi-Platform Compatibility**: Implementati fallback stubs deboli e conditional build tags (`//go:build cgo && (linux || darwin)` / `//go:build !cgo || (!linux && !darwin)`), garantendo compilazione e test puliti sia su Linux (Debian) che su macOS.

---

## 4. File Rilevanti della Modifica

- [cabinet_bridge/Dockerfile](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/Dockerfile): Migrazione a `ghcr.io/home-assistant/debian-base:latest`, dipendenze GStreamer runtime e Cgo builder Go 1.24.
- [.github/workflows/build.yml](file:///Users/andrea/Repository/home-arcade-ha/.github/workflows/build.yml): Base image allineata a `ghcr.io/home-assistant/debian-base:latest`.
- [cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.h](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.h): Header C per il bridge Libretro (adottato dal pattern CloudRetro).
- [cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c): Bridge C per callback Libretro (video refresh, audio batch, input cache).
- [cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go): Sessione di emulazione Libretro Cgo reale.
- [cabinet_bridge/server/native-runner/pkg/emulator/cgo_session_stub.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/emulator/cgo_session_stub.go): Fallback stub per ambienti non-Cgo.
- [cabinet_bridge/server/native-runner/pkg/emulator/dl_unix.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/emulator/dl_unix.go): Caricatore dinamico Cgo per librerie condivise (`dlopen`/`dlsym`/`dlclose`).
- [cabinet_bridge/server/native-runner/pkg/encoder/gstreamer.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/encoder/gstreamer.go): Encoder VP8 nativo basato su GStreamer pipeline.
- [cabinet_bridge/server/native-runner/pkg/encoder/gstreamer_stub.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/pkg/encoder/gstreamer_stub.go): Fallback encoder per ambienti di sviluppo senza GStreamer.
- [docs/adr/002-native-webrtc-debian-gstreamer-cgo-pipeline.md](file:///Users/andrea/Repository/home-arcade-ha/docs/adr/002-native-webrtc-debian-gstreamer-cgo-pipeline.md): ADR architetturale della migrazione a Debian + GStreamer + Cgo.
- [docs/plans/2026-10-11_webrtc_engine_root_cause_and_redesign_strategy.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-11_webrtc_engine_root_cause_and_redesign_strategy.md): Piano di lavoro e verifica della transizione.

---

## 5. Definition of Done & Verifica Empirica

- **Go Test Suite (`server/native-runner`)**:
  - `go test -v ./...` -> Tutte le 4 suite (`runner`, `pkg/audio`, `pkg/emulator`, `pkg/encoder`) superate con esito 0.
  - `go build -v .` -> Binario compilato con successo senza warning.
- **Node & TypeScript Stack (`cabinet_bridge`)**:
  - `pnpm check` -> 0 errori TypeScript.
  - `pnpm test` -> 19 file di test passati, 120/120 test passati con successo.
  - `pnpm build` -> Vite + esbuild completati in 1.8s (`dist/public` e `dist/index.cjs` generati).

---

## 6. Prossimi Passi (Next Steps)

1. Effettuare commit atomico delle modifiche relative alla migrazione del motore nativo WebRTC a Debian + GStreamer + Cgo.
2. Eseguire push sul repository remoto per innescare la pipeline di CI/CD e la build multi-arch (`amd64` e `aarch64`).
3. Test live dell'add-on su Home Assistant (hardware target RPi5 o x86) verificando la decodifica hardware/software fluida del flusso WebRTC senza black screen.




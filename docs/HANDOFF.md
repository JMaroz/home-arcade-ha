# Handoff Sessione: Docker Slimming al Minimo, Mappatura Storage (Samba/SSD) & Setup Wizard a 3 Fasi

**Data**: 2026-10-10  
**Stato**: Completate tutte le milestone per il ridimensionamento al minimo dell'immagine Docker, l'integrazione delle cartelle di gioco Samba/SSD esterno e l'evoluzione del Setup Wizard in un onboarding guidato a 3 fasi.  
**Piani di Riferimento**: 
- `docs/plans/2026-10-10_docker_slimming_and_runtime_setup_wizard.md` (Completato)
- `docs/plans/2026-10-10_dual_engine_webrtc_integration_plan.md` (Completato)  
**Ricerche Correlate**: 
- `docs/research/2026-10-10_dual_engine_webrtc_feasibility.md`  
**ADR Correlato**: `docs/adr/001-rpi5-emulation-dual-engine-architecture.md`  

---

## 1. Stato Corrente & Modifiche Realizzate

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

---

## 2. File Rilevanti

- [cabinet_bridge/server/native-runner/main.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/main.go): SettingEngine NAT 1:1, TCP Muxer, e InputManager binario.
- [cabinet_bridge/server/native-runner/main_test.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/main_test.go): Unit test per InputManager ed endpoint `/health`.
- [cabinet_bridge/server/stream/runner-manager.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/stream/runner-manager.ts): `getHostIp()` e passaggio `--host-ip`.
- [cabinet_bridge/server/routes/streamPlayer.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/streamPlayer.ts): DataChannel binario a 5-byte, unlockAudio e monitoraggio stats RTT/FPS.
- [cabinet_bridge/server/__tests__/core-health.test.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/__tests__/core-health.test.ts): Unit test per bootstrap PS1 e native stream player.
- [docs/plans/2026-10-11_cloud_gaming_architecture_and_native_webrtc_roadmap.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-11_cloud_gaming_architecture_and_native_webrtc_roadmap.md): Piano di lavoro strutturato per l'evoluzione del runner nativo WebRTC.

---

## 3. Prossimi Passi (Next Steps)

1. **Esecuzione Fase 3 del Piano Cloud Gaming (Core Libretro Cgo & Video Encoding)**:
   - Creare il modulo Cgo in `server/native-runner/pkg/emulator/libretro` per caricare dinamicamente i core `.so` già scaricati in `/data/cores/`.
   - Implementare la conversione pixel RGB -> YUV420p rapida ed encoder software zerolatency (`libx264` / `libvpx`).
2. **Esecuzione Fase 4 (Resampling Audio & Opus Streaming)**:
   - Resampler sincrono da 32kHz/44.1kHz a 48kHz stereo a 20ms per frame.
3. **Esecuzione Fase 5 (Multiplayer Couch Co-Op con QR Code)**:
   - Supporto sessioni multi-peer Fan-in / Fan-out per giocare in 2 sulla stessa ROM.


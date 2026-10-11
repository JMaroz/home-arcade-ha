# Piano di Lavoro: Risoluzione WebRTC Signaling & Fix Avvio Giochi PS1 (Menu RetroArch)

**Data**: 2026-10-11  
**Stato**: Proposto  
**Riferimento Log**: `f5e1d3f5_cabinet_bridge_2026-10-10T22-07-34.406Z.log`  

---

## 1. Obiettivo

1. Risolvere definitivamente la causa radice del crash del WebRTC Stream Player evidenziato nei log (`ECONNREFUSED 127.0.0.1:<port>` durante la fase di signaling) e definire l'architettura tecnica necessaria per lo streaming nativo server-side a bassa latenza su Raspberry Pi 5.
2. Risolvere la causa radice per cui l'avvio di qualsiasi gioco PS1 apre il **Menu principale di RetroArch** (RGUI) anziché avviare il gioco, ripristinando il corretto caricamento di ROM CHD/BIN/CUE, BIOS autentico PS1 e playlist multi-disco M3U.

---

## 2. Scope & Non-Goals

- **In Scope**:
  - **Fix Race Condition Signaling WebRTC**: In `StreamRunnerManager.startSession`, attendere che il demone runner abbia aperto il socket HTTP locale prima di rispondere a Express e al client; aggiungere polling e retry resiliente su `relaySignal`.
  - **Fix Extension & File Route in `EJS_gameUrl`**: Aggiornare la route `/api/roms/:id/file/:filename?` e l'iniezione in `player.ts` per includere il nome file reale (`.chd`, `.iso`, `.cue`, `.pbp`), consentendo a RetroArch di identificare il formato ed eseguire il gioco.
  - **Iniezione Corretta BIOS (`window.EJS_biosUrl`)**: Ripristinare il passaggio del file BIOS autentico (`scph5501.bin` / `scph5500.bin` / `scph5502.bin`) in `player.ts`, evitando fallimenti dell'HLE BIOS interno di PCSX ReARMed.
  - **Allineamento Nome Core PS1 per EmulatorJS**: Impostare `EJS_core = "psx"` per la PlayStation 1 (lo standard ufficiale di EmulatorJS, che carica `pcsx_rearmed`).
  - **Supporto Multi-Disco M3U con `window.EJS_externalFiles`**: Supportare sia i file M3U a disco singolo (risolti al CHD sottostante) sia i multi-disco caricando i dischi referenziati nel VFS di EmulatorJS.
  - **Ricerca Architetturale Comparativa**: Confronto con progetti di successo (CloudRetro, RomM, go2rtc) per l'implementazione del runner nativo.
- **Non-Goals** (YAGNI):
  - Non riscrivere l'intero core Cgo Libretro in un unico commit senza prima stabilizzare il bootstrap e il rendering WASM.
  - Non alterare i sistemi 8/16-bit che già funzionano regolarmente.

---

## 3. Task Checklist

- [x] **Fase 1: Diagnosi & Fix Root Cause Avvio PS1 (Menu RetroArch)**
  - [x] Aggiornare `server/routes/roms.ts`:
    - Aggiungere il parametro opzionale `:filename?` alla route `/api/roms/:id/file/:filename?` per consentire URL con estensione esplicita.
    - Se una ROM è un file M3U con 1 solo disco referenziato, risolvere direttamente il file figlio `.chd` associato.
  - [x] Aggiornare `server/routes/player.ts`:
    - Includere il filename reale codificato nell'URL di `window.EJS_gameUrl` (`.../api/roms/${romId}/file/${encodeURIComponent(romFileName)}`).
    - Iniettare `window.EJS_biosUrl = ${JSON.stringify(biosUrl)};` quando un BIOS è disponibile.
    - Mappare il core per PS1 come `"psx"` (richiesto dal parser di EmulatorJS).
    - Per i giochi multi-disco M3U con dischi figli, popolare `window.EJS_externalFiles` mappando i nomi dei file `.chd` ai rispettivi endpoint di download.

- [x] **Fase 2: Fix Race Condition WebRTC Signaling (ECONNREFUSED)**
  - [x] In `server/stream/runner-manager.ts`:
    - In `startSession`: implementare un ciclo di attesa attiva (`waitForPortReady(port, 3000)`) con connessione di probe a `127.0.0.1:port/health` prima di restituire `{ sessionId, port }` e impostare lo stato `ready`.
    - In `relaySignal`: aggiungere retry automatico con backoff (fino a 5 tentativi) per proteggere da micro-ritardi del processo Go.
  - [x] In `server/native-runner/main.go`:
    - Verificato endpoint `/health` e gestione shutdown.

- [x] **Fase 3: Ricerca e Roadmap Runner Nativo WebRTC (CloudRetro Pattern)**
  - [x] Documentare l'architettura comparativa con CloudRetro (`giongto35/cloud-game`) e go2rtc:
    - Binding Cgo con `libretro.h` (`retro_init`, `retro_load_game`, `retro_run`).
    - Encoder software `x264` ultrafast / VP8 e audio Opus.
    - Esposizione range UDP (`config.yaml`) o abilitazione TCP ICE candidates in Pion WebRTC.

- [x] **Fase 4: Verifica Empirica & Test**
  - [x] Verificare che `pnpm check` (tsc) e `pnpm test` (vitest 18/18 files, 113/113 tests) passino senza errori.
  - [x] Aggiunto unit test in `core-health.test.ts` per il rendering di `EJS_gameUrl` con estensione, `EJS_biosUrl`, `EJS_externalFiles` e core `psx`.
  - [x] Aggiornare `docs/HANDOFF.md`.

---

## 4. Strategia di Verifica

```bash
cd cabinet_bridge
pnpm check
pnpm test
```
Verifica delle risposte HTTP delle route `/api/roms/:id/file/test.chd` e generazione corretta dello script `bootstrap.js`.

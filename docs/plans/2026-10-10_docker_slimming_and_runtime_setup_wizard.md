# Piano di Lavoro: Riduzione Immagine Docker al Minimo & Runtime Setup Wizard

**Data**: 2026-10-10  
**Stato**: Proposto (In attesa di approvazione)  
**Obiettivo Principale**: Ridurre la dimensione dell'immagine Docker da ~800 MB a < 65 MB uncompressed (< 25 MB compressa), trasformare il Setup Wizard in un onboarding guidato a 3 fasi per scaricare a runtime core e BIOS, e configurare la cartella delle ROM (Samba locale `/share` o SSD/USB esterno `/media` collegato al Raspberry Pi).

---

## 1. Obiettivo

1. **Docker Ultra-Slim (< 65 MB uncompressed, < 25 MB download)**:
   - Implementare un **Multi-Stage Build** a 3 stadi in `cabinet_bridge/Dockerfile`:
     - Stage 1 (`node-builder`): installa `python3`, `make`, `g++`, compila `better-sqlite3`, builda client Vite e crea il bundle esbuild del server (`dist/index.cjs`).
     - Stage 2 (`runner-builder`): compila il runner nativo Go con `-ldflags="-s -w"` e compressione opzionale UPX.
     - Stage 3 (`runtime`): immagine finale pulita basata su `ghcr.io/home-assistant/${BUILD_ARCH}-base:latest`. Installa **solo** `nodejs`, `sqlite-libs`, `libstdc++`. Elimina tutti i compilatori, npm, pnpm e codice sorgente grezzo.
   - Rimuovere `ejs_cache_essential` dal layer Docker: spostare i file pesanti su download a runtime in `/data/ejs_cache`.
2. **Setup Wizard a 3 Fasi (Onboarding)**:
   - **Fase 1: Cartella Giochi (ROM Storage)**: scelta o rilevamento tra Storage Interno (`/data/rom-storage`), Samba Share (`/share` o `/share/roms`), o SSD esterno collegato al Raspberry Pi (`/media`). Integrazione con `DirectoryPickerDialog`.
   - **Fase 2: Componenti Runtime (Cores & BIOS)**: download a runtime con barra di avanzamento e verifica checksum MD5 dei core Libretro (AArch64 / x86_64), core WASM e BIOS in `/data` persistente.
   - **Fase 3: Pronto al Gioco**: riepilogo, avvio scansione automatica della cartella e accesso alla libreria.
3. **Mappatura Storage Home Assistant (`config.yaml`)**:
   - Aggiungere `- share:rw` accanto a `- media:rw` per consentire l'accesso diretto alla cartella condivisa di Samba Share e a tutte le risorse di rete e dischi SSD esterni montati da HA OS.

---

## 2. Scope & Non-Goals

### In Scope
- Refactoring `cabinet_bridge/Dockerfile` con multi-stage build rigorosa.
- Aggiornamento `cabinet_bridge/config.yaml` per mappare `share:rw`.
- Ottimizzazione bundling esbuild in `script/build.ts` per includere tutte le dipendenze JS nel bundle, isolando solo il binario nativo `better-sqlite3`.
- Evoluzione di `SetupWizardDialog.tsx` in un wizard multi-step strutturato:
  - Step 1: Selezione & test percorso ROM (Samba `/share`, SSD esterno `/media`, interno `/data`).
  - Step 2: Download a runtime di Core e BIOS in `/data/` persistente.
  - Step 3: Scansione iniziale e completamento.
- Endpoint backend dedicati in `server/routes/setup.ts` e `server/routes/filesystem.ts` per salvare la cartella ROM selezionata in `integrationSettings.libraryWatchPaths`.

### Non-Goals (YAGNI / Ponytail)
- Non riscrivere il motore di emulazione o i runner WebRTC/WASM (riuso completo del codice esistente).
- Non aggiungere dipendenze o librerie esterne per wizard o animazioni (riuso dei componenti UI shadcn/Radix esistenti: Dialog, Button, Progress, Badge, RadioGroup/Tabs).
- Non gestire formattazione o partizionamento di dischi (compito delegato nativamente a Home Assistant OS in *Sistema -> Archiviazione*).

---

## 3. Task Checklist

- [x] **Milestone 1: Analisi & Ottimizzazione Dockerfile (Multi-Stage Build)**
  - [x] Riorganizzare `cabinet_bridge/Dockerfile` in 3 stadi separati (`runner-builder`, `node-builder`, `runtime`).
  - [x] Nello stadio `runtime`, installare esclusivamente `nodejs`, `sqlite-libs`, `libstdc++`.
  - [x] Rimuovere da runtime `python3`, `make`, `g++`, `npm`, `pnpm` e tutti i file sorgente TypeScript.
  - [x] Copiare nel runtime solo `dist/`, `migrations/`, `better-sqlite3` compilato e il binario runner Go compresso.
  - [x] Rimuovere `COPY ejs_cache_essential` dal Dockerfile per eliminare 11 MB di asset statici dall'immagine.

- [x] **Milestone 2: Mappatura Storage & Accesso a Samba ed SSD Esterno**
  - [x] Aggiornare `cabinet_bridge/config.yaml` aggiungendo `- share:rw` in `map:`.
  - [x] Verificare in `server/routes/filesystem.ts` che `/share` e `/media` siano sempre tra le radici suggerite per la navigazione.
  - [x] Creare/aggiornare endpoint in `server/routes/setup.ts` per impostare e validare la cartella ROM iniziale (`POST /api/setup/rom-folder`).

- [x] **Milestone 3: Evoluzione Setup Wizard (UI Multi-Step)**
  - [x] Ristrutturare `SetupWizardDialog.tsx` con navigazione a step:
    - Step 1: Storage / Cartella ROM (opzioni rapide: `/share/roms`, `/media/roms`, `/data/rom-storage`, oppure "Sfoglia..." con `DirectoryPickerDialog`).
    - Step 2: Download Runtime (Core nativi AArch64/x86_64, Core WASM, BIOS essenziali).
    - Step 3: Riepilogo & Avvio prima scansione.
  - [x] Integrare la memorizzazione dello stato del setup per non riproporre il wizard dopo il completamento.
  - [x] Garantire la riapribilità manuale da `LibrarySettings` in caso di riconfigurazione.

- [x] **Milestone 4: Verifica Empirica & Test**
  - [x] Aggiornare test unitari `server/__tests__/setup.test.ts` con asserzioni per le nuove proprietà di storage.
  - [x] Verificare consistenza manifest `config.yaml` con mapping `media:rw` e `share:rw`.
  - [x] Aggiornare `docs/HANDOFF.md`.

- [x] **Milestone 5: Bug Fixes Setup Wizard & Core N64 Libretro**
  - [x] Fix propagazione eventi dismiss `DirectoryPickerDialog`: aggiunto `stopPropagation` e guardie su `pickerOpen` per prevenire la chiusura accidentale del wizard al click sulla "X".
  - [x] Fix rilancio Setup Wizard da Impostazioni: introdotto `openSetupWizard()` globale e aggiunto pulsanti in `Settings.tsx` e `LibrarySettings.tsx`.
  - [x] Fix reset Step 1 al termine del download: eliminato reset indiscriminato di `step` su ogni re-fetch di `status` in `SetupWizardDialog.tsx`, isolando la transizione di apertura con `useRef`.
  - [x] Fix download core N64 (404 su Libretro Buildbot per `aarch64`): sostituito `mupen64plus_next` con `parallel_n64` (`parallel_n64_libretro.so.zip`), con fallback bidirezionale nel runner e nel controllo stato.

---

## 4. Strategia di Verifica

1. **TypeScript Type Check**:
   ```bash
   pnpm check
   ```
2. **Unit & Integration Tests**:
   ```bash
   pnpm test
   ```
3. **Verifica Validità Manifest Add-on**:
   ```bash
   # Verifica sintassi YAML e mapping
   grep -A 5 "map:" cabinet_bridge/config.yaml
   ```
4. **Verifica Esclusioni Backup**:
   ```bash
   grep -A 5 "backup_exclude:" cabinet_bridge/config.yaml
   ```

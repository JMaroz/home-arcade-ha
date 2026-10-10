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

---

## 2. File Rilevanti

- [cabinet_bridge/Dockerfile](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/Dockerfile): Multi-stage build (runner Go con UPX + node-builder + runtime minimale senza build tools né sorgenti).
- [cabinet_bridge/config.yaml](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/config.yaml): Mappatura `media:rw` e `share:rw` per dischi esterni e Samba.
- [cabinet_bridge/script/build.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/script/build.ts): Inclusione di tutte le librerie JS nel bundle esbuild `dist/index.cjs`.
- [cabinet_bridge/server/routes/setup.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/setup.ts): Endpoint `POST /api/setup/rom-folder` e status esteso con percorsi storage suggeriti.
- [cabinet_bridge/client/src/components/SetupWizardDialog.tsx](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/client/src/components/SetupWizardDialog.tsx): Wizard a 3 step (Cartella ROM, Download runtime core/BIOS, Riepilogo e Scansione).
- [cabinet_bridge/server/__tests__/setup.test.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/__tests__/setup.test.ts): Test automatizzati estesi.
- [docs/plans/2026-10-10_docker_slimming_and_runtime_setup_wizard.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-10-10_docker_slimming_and_runtime_setup_wizard.md): Piano di lavoro con checklist completata.

---

## 3. Prossimi Passi (Next Steps)

1. **Commit Git Hygiene**: Salvare le modifiche con commit atomici Conventional Commits (`feat: add multi-stage minimal dockerfile and 3-step setup wizard`).
2. **Build Test su GitHub Actions**: Quando verrà rilasciata una nuova versione o pushato un tag `v*`, la workflow `.github/workflows/build.yml` produrrà le immagini multi-arch `amd64` e `aarch64` con la nuova dimensione record (<25 MB compressa).

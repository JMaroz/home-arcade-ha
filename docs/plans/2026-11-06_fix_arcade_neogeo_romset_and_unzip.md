# Piano di Lavoro: Fix Arcade e Neo Geo (Romset Unknown & Unzip Bug)

**Data**: 2026-11-06  
**Stato**: Completato (Verificato con test Go, TypeScript typecheck, Vitest e Build)  

---

## 1. Obiettivo
Risolvere definitivamente l'errore `FBNeo Error: Romset is unknown` che impedisce l'avvio dei giochi Arcade e Neo Geo, ripristinando il corretto caricamento diretto degli archivi `.zip` da parte dei core Libretro (`fbneo` e `mame2003_plus`), garantendo la presenza e localizzazione del BIOS `neogeo.zip` e allineando il core al romset scaricato da Internet Archive.

---

## 2. Analisi della Causa Radice (Root Cause)

### A. Bug Critico Unzip in Native Runner (`cgo_session.go`)
- **Comportamento precedente**: In `cgo_session.go`, per ogni file con estensione `.zip`, la funzione `extractZippedRom` estraeva tutti i file in una cartella temporanea `/tmp/arcade-rom-*` e seleziona il singolo file interno più grande (es. `201-c1.c1` per `mslug.zip` o `af_u22.bin` per `aerofgt.zip`), passando quel singolo chip a `retro_load_game`.
- **Perché falliva**:
  1. I core Arcade e Neo Geo (`FBNeo`, `MAME`) **non caricano singoli file di chip ROM**, ma richiedono l'intero archivio `.zip` intatto.
  2. Il core estrae il `basename` dal percorso passato (`mslug` o `aerofgt`) per identificare il driver hardware. Ricevendo `201-c1.c1`, cerca un driver inesistente chiamato `201-c1` e restituisce immediatamente l'errore:  
     `FBNeo Error: Romset is unknown. THIS IS NOT A BUG !`
  3. Lo standard Libretro (`libretro.h`) definisce specificamente `sysInfo.block_extract = true` per vietare esplicitamente al frontend di estrarre gli archivi per i core arcade, e indica `valid_extensions = "zip|7z"`. HomeArcade ignorava `block_extract`.
  4. L'estrazione in `/tmp/arcade-rom-*` isolava inoltre il gioco dal file di BIOS `neogeo.zip` presente nella cartella delle ROM (`/media/.../Roms/neogeo/`).

### B. Discrepanza Core / Romset per il pacchetto "Arcade"
- **Comportamento precedente**: Il pacchetto Internet Archive predefinito per il sistema `arcade` in `archive-client.ts` è `Arcade - Mame 2003 Plus.zip` (romset MAME 0.78 / 0.78+ del 2003).
- **Core configurato**: In `shared/core-metadata.ts`, il sistema `arcade` era mappato esclusivamente su `fbneo_libretro.so` (FinalBurn Neo v1.0.0.03).
- **Perché falliva**: FBNeo e MAME 2003-Plus utilizzano database di ROM e checksum differenti. Anche passando il file `.zip` integro, FBNeo rifiutava le ROM MAME 0.78 le cui CRC32 o composizione non corrispondono al DAT FBNeo v1.0.0.03.

---

## 3. Scope & Non-Goals

### In Scope
1. **Native Runner (`cgo_session.go` & `main.go`)**:
   - Rispettare `sysInfo.block_extract`.
   - Se `block_extract == true`, o `valid_extensions` contiene `zip`/`7z`, o il sistema è `arcade`/`neogeo`/`mame`, **NON estrarre lo zip** e passare il file `.zip` direttamente a `retro_load_game`.
   - Passare `system` a `CreateActiveSession` in `main.go`.
2. **Supporto BIOS Neo Geo**:
   - Assicurare che `neogeo.zip` sia accessibile sia nella cartella ROM che nella cartella di sistema `/data/bios/` (copia/symlink automatico).
   - Registrare `neogeo.zip` nei metadati BIOS (`bios-metadata.ts`).
3. **Integrazione Core MAME 2003-Plus**:
   - Aggiungere `mame2003_plus_libretro.so` a `ESSENTIAL_NATIVE_CORES` e download da Libretro Buildbot in `setup.ts`.
   - Supportare `mame2003_plus` per il sistema `arcade` con fallback su `fbneo`.

### Non-Goals
- Modificare i core WASM di EmulatorJS (il problema è specifico del Native Runner WebRTC).
- Re-pack o re-dumping dei file ZIP degli utenti.

---

## 4. Task Checklist

- [x] **Fase 1: Fix Native Runner (`cgo_session.go` & `main.go`)**
  - [x] Aggiungere il controllo `sysInfo.block_extract` dalla struct `retro_system_info`.
  - [x] Aggiungere controllo su `valid_extensions` (presenza di `zip`/`7z`) e target system (`arcade`, `mame`, `neogeo`).
  - [x] Bypassare `extractZippedRom` quando l'archivio non deve essere estratto, garantendo `needFullPath` e passaggio del path `.zip` reale.
  - [x] Aggiungere unit test in Go in `server/native-runner/pkg/emulator/zip_test.go`.

- [x] **Fase 2: Gestione BIOS Neo Geo (`neogeo.zip`)**
  - [x] Inserire `neogeo: [{ filename: "neogeo.zip", ... }]` in `cabinet_bridge/shared/bios-metadata.ts`.
  - [x] In `runner-manager.ts`, se il gioco è `neogeo`, verificare la presenza di `neogeo.zip` nella cartella della ROM e garantirne la sincronizzazione in `/data/bios/neogeo.zip`.

- [x] **Fase 3: Supporto Core MAME 2003-Plus per Arcade**
  - [x] Aggiungere `mame2003_plus` a `cabinet_bridge/shared/core-metadata.ts` con URL Buildbot Libretro.
  - [x] Aggiornare `runner-manager.ts` per supportare `mame2003_plus_libretro.so` come core preferito se presente per `arcade` con fallback su `fbneo`.
  - [x] Aggiornare `setup.ts` per scaricare e verificare `mame2003_plus_libretro.so`.

- [x] **Fase 4: Verifica Empirica e Test di Regressione**
  - [x] Eseguire la suite unit test Go: `cd cabinet_bridge/server/native-runner && go test -v ./pkg/emulator/...`.
  - [x] Eseguire typecheck e test TypeScript: `tsc --noEmit && vitest run`.
  - [x] Aggiornare `docs/HANDOFF.md`.

---

## 5. Strategia di Verifica

```bash
# 1. Verifica unit test Go (compreso test no-extract per arcade/neogeo)
cd cabinet_bridge/server/native-runner && /usr/local/bin/go test -v ./pkg/emulator/...

# 2. Verifica typecheck TypeScript
cd cabinet_bridge && ./node_modules/.bin/tsc --noEmit

# 3. Verifica suite Vitest
cd cabinet_bridge && ./node_modules/.bin/vitest run server/__tests__/core-health.test.ts server/__tests__/setup.test.ts

# 4. Verifica build di produzione
cd cabinet_bridge && ./node_modules/.bin/tsx script/build.ts
```

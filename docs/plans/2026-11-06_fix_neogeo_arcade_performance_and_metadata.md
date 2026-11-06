# Piano di Lavoro: Fix Performance Neo Geo (Stuttering & Audio Desync) e Risoluzione Metadati/Copertine Arcade

**Data**: 2026-11-06  
**Stato**: Completato  

---

## 1. Obiettivo
Risolvere la causa radice della lentezza, dei blocchi/scatti e della desincronizzazione audio/video riscontrata durante l'esecuzione di Metal Slug (e giochi Neo Geo/Arcade) sul Native Runner WebRTC, e implementare la mappatura canonica dei driver arcade MAME/Neo Geo (es. `mslug` → `Metal Slug - Super Vehicle-001`) per garantire il recupero automatico e retroattivo di copertine ufficiali Libretro, titoli puliti e descrizioni complete.

---

## 2. Analisi della Causa Radice (Root Cause)

### A. Performance, Stuttering e Desincronizzazione Audio
1. **Bug Cumulativo nei Timestamp RTP (`main.go` & `vpx.go`)**:
   - Quando il worker di encoding video scarta frame in coda (`videoQueue`) perché la CPU impiega più di 16.6ms, il frame successivo viene inviato con una durata fissa `Duration: v.duration` (16.666 ms).
   - Pion WebRTC accumula il timestamp RTP sommando `sample.Duration`. Se 1 o più frame sono scartati, il timestamp video NON riflette il tempo reale trascorso ma rimane indietro.
   - L'audio (`Opus`), invece, continua ad avanzare a tempo reale (50 pacchetti da 20 ms al secondo).
   - Il clock video rimane indietro di secondi rispetto a quello audio. Il client WebRTC del browser, rilevando timestamp video nel passato rispetto all'audio, congela o scarta i frame video e manda l'audio fuori sincro.
2. **Penalizzazione Priorità CPU (`nice +10`) in `runner-manager.ts`**:
   - `os.setPriority(child.pid, 10)` forza il processo emulatore in bassa priorità sul kernel Linux. Quando Home Assistant o altri processi generano I/O o attività, l'emulatore viene de-prioritizzato, causando frame drop immediati.
3. **Overhead di Encoding VP8 a 640x480**:
   - La risoluzione nativa Neo Geo è 320x224. Codificare a 640x480 @ 60 FPS software via CPU richiede 4 volte più risorse di calcolo.

### B. Metadati e Copertine Assenti per Nomi Driver Brevi (`mslug`, `kof98`, ecc.)
1. **Driver Shortnames 8.3 MAME / FBNeo**:
   - I file ROM arcade e Neo Geo scaricati (es. da Internet Archive) mantengono obbligatoriamente i nomi dei chip/driver (es. `mslug.zip`, `garou.zip`, `kof98.zip`).
   - L'importatore esegue `titleFromFileName("mslug.zip")` che genera il titolo `"Mslug"`.
2. **Mancata Corrispondenza su Libretro Thumbnails e Scraper**:
   - Nel repository Libretro (`SNK - Neo Geo/Named_Boxarts/`), le copertine usano i nomi canonici No-Intro/FBNeo (es. `Metal Slug - Super Vehicle-001.png`). Non esiste `Mslug.png`.
   - La ricerca fuzzy fallisce (0 token in comune tra `mslug` e `metal slug`), generando una URL rotta `.../Mslug.png` che restituisce 404 e fa fallire il proxy con 502.
   - Le descrizioni falliscono perché né OpenVGDB né Internet Archive riconoscono il titolo `"mslug"`.

---

## 3. Scope & Non-Goals

### In Scope
1. **Fix Native Runner WebRTC (`server/native-runner/`)**:
   - Calcolare la durata reale dei campioni video (`media.Sample.Duration`) in base al tempo reale trascorso o al numero di frame emulati dall'ultimo frame inviato, azzerando il drift A/V.
   - Rimuovere la penalizzazione `nice +10` in `runner-manager.ts` per garantire scheduling normale (priorità 0).
2. **Catalogo Driver Arcade & Neo Geo (`shared/arcade-catalog.ts`)**:
   - Creare un catalogo compatto nativo per i 140 giochi commerciali Neo Geo e i principali classici Arcade, mappando driver name (es. `mslug`), titolo canonico Libretro, titolo pulito UI, anno, sviluppatore e genere.
3. **Integrazione Scraper e Importatore**:
   - In `archive-downloader.ts`, `scanner.ts`, `metadata-fetcher.ts` e `scrape.ts`, intercettare i giochi Neo Geo / Arcade e risolvere il nome driver nel titolo canonico prima dello scraping.
4. **Tool di Migrazione Retroattiva**:
   - Aggiornare `POST /api/roms/scrape-missing` e `POST /api/roms/scrape-all` affinché i giochi Neo Geo già presenti nel DB con titolo abbreviato vengano automaticamente rinominati e arricchiti di copertina e metadati.

### Non-Goals
- Rinominare i file `.zip` fisici su disco (FBNeo e MAME richiedono tassativamente i file zip con nome driver originale).
- Sostituire il codec VP8 con codec non universali senza supporto WebRTC nativo.

---

## 4. Task Checklist

- [x] **Fase 1: Fix Native Runner WebRTC & Frame Pacing**
  - [x] In `server/native-runner/main.go`, calcolare la durata dinamica reale per ogni frame inviato a `videoTrack.WriteSample` in base ai frame scartati o al delta temporale effettivo (`CalculateSampleDuration`).
  - [x] In `cabinet_bridge/server/stream/runner-manager.ts`, rimuovere la penalizzazione CPU (`os.setPriority(child.pid, 10)` -> priorità normale 0).
  - [x] Verificare la sincronizzazione A/V con i test unitari Go in `server/native-runner/` (`TestCalculateSampleDuration`).

- [x] **Fase 2: Catalogo MVS & Arcade Driver Mapping**
  - [x] Creare `cabinet_bridge/shared/arcade-catalog.ts` con i mapping ufficiali per l'intero set Neo Geo MVS (140 giochi) e i principali titoli Arcade.
  - [x] Aggiungere test unitari in `cabinet_bridge/shared/__tests__/arcade-catalog.test.ts`.

- [x] **Fase 3: Integrazione Scraper & Importazione**
  - [x] In `cabinet_bridge/server/metadata-fetcher.ts`, integrare il catalogo arcade per risolvere `system === "neogeo" || system === "arcade"`.
  - [x] In `cabinet_bridge/server/routes/scrape.ts`, risolvere il nome driver prima di interrogare Libretro Thumbnails.
  - [x] In `cabinet_bridge/server/archive-downloader.ts`, assegnare il titolo canonico all'estrazione degli archivi arcade.

- [x] **Fase 4: Migrazione Retroattiva & Endpoint Scrape**
  - [x] In `cabinet_bridge/server/routes/scrape.ts`, arricchire `scrape-missing` e `scrape-all` per aggiornare i titoli troncati esistenti.
  - [x] Verificare con test unitari Vitest e typecheck TypeScript (`tsc --noEmit` e `vitest run`).

---

## 5. Strategia di Verifica

1. **Test Unitari Go**:
   ```bash
   cd cabinet_bridge/server/native-runner && /usr/local/bin/go test -v ./...
   ```
2. **Typecheck TypeScript**:
   ```bash
   cd cabinet_bridge && ./node_modules/.bin/tsc --noEmit
   ```
3. **Test Unitari Vitest**:
   ```bash
   cd cabinet_bridge && ./node_modules/.bin/vitest run
   ```
4. **Verifica Build**:
   ```bash
   cd cabinet_bridge && ./node_modules/.bin/tsx script/build.ts
   ```

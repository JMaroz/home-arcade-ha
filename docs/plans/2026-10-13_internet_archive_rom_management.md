# Piano di Lavoro: Gestione ROM Internet Archive First, Metadata Overhaul & Settings Redesign

**Data**: 2026-10-13  
**Stato**: Pronto per l'implementazione (Ready)  

---

## Obiettivo
Rivedere radicalmente le fondamenta della gestione delle ROM e dei metadati in HomeArcade:
1. Sostituire il fragile sistema euristico di scraping (regex HTML su directory, fuzzy matching) e il polling continuo del file system con un modello **"Internet Archive First"**, in cui ROM e metadati (titolo, anno, sviluppatore, hash, box art deterministica) provengono direttamente e con precisione matematica dai cataloghi canonici 1G1R No-Intro.
2. Riprogettare completamente la sezione Impostazioni Libreria, sostituendo la schermata sovraccarica con un pannello pulito e modulare **"Giochi & Archiviazione" (Games & Storage)**:
   - Gestione delle sorgenti di download (Internet Archive No-Intro, Hearto/Tiny Best Set, Myrient, sorgenti custom e chiavi S3 opzionali).
   - Scelta e monitoraggio della cartella di destinazione (`defaultRomDirectory`) con barra visuale dello spazio disco (`statfs`).
   - Contatore e breakdown dei giochi installati per console con dimensione occupata.
   - Azioni di eliminazione selettiva per singola console e reset completo dei giochi (preservando i salvataggi).
3. Consentire il download sia del singolo gioco sia della piattaforma completa (con pre-flight quota check, salvaguardie hardware e verifica BIOS).

---

## Scope & Non-Goals (YAGNI & Ponytail)

### Scope (In-Perimeter)
1. **Metadata & Scraping Overhaul**:
   - Sostituzione del fuzzy regex matching di `scrape.ts` con URL deterministiche delle copertine Libretro basate su standard No-Intro 1G1R (`${CDN}/${playlist}/Named_Boxarts/${cleanTitle}.png`).
   - Popolamento istantaneo dei metadati (titolo, anno, genere, sviluppatore, hash) al momento del download dal manifest dell'item IA.
2. **Nuova Sezione Impostazioni ("Giochi & Archiviazione")**:
   - **Card 1 (Sorgenti di Download)**: Selezione repository IA/No-Intro predefinito, mirror Myrient, ID custom e credenziali S3 opzionali.
   - **Card 2 (Cartella & Spazio Disco)**: Percorso `defaultRomDirectory`, `DirectoryPickerDialog`, barra grafica spazio disco con allarme < 2 GB.
   - **Card 3 (Libreria Scaricata & Breakdown)**: Contatore totale giochi e GB, lista per piattaforma con numero giochi e dimensione occupata.
   - **Card 4 (Manutenzione & Eliminazione)**: Eliminazione selettiva per piattaforma (`delete-system`), reset totale giochi scaricati, pulizia cache copertine orfane, pulsante per scansione manuale locale on-demand.
3. **Backend Archive & Download Engine (Stdlib Node.js)**:
   - Client REST per interrogare `/metadata/{id}` di Archive.org.
   - Streaming downloader con report di avanzamento percentuale e quota check preventivo (`statfs`).
   - Supporto a download singolo gioco e full set per piattaforme cartuccia 8/16-bit.
   - Hardware detection (`aarch64` vs `x86_64`) e BIOS gating (`REQUIRED_BIOS`) con installazione rapida in 1-click.
4. **Onboarding Integration**:
   - Configurazione di `defaultRomDirectory` al First-Run Setup Wizard (Step 1).

### Non-Goals (Esclusioni Consapevoli / YAGNI)
- **NO runtime o CLI Python esterne**: Nessun uso del tool `ia` Python o binari esterni. Esclusivamente Node.js stdlib HTTP e streaming.
- **NO BitTorrent**: Escluso P2P per evitare consumo elevato di RAM e porte aperte su Home Assistant; esclusivamente download HTTP Range diretti.
- **NO polling continuo ogni 5 minuti**: Rimozione del loop periodico aggressivo sui dischi; la sincronizzazione locale avviene su richiesta dell'utente tramite pulsante dedicato.

---

## Task Checklist

### Fase 1: Schema DB & Backend Storage Breakdown
- [x] **1.1 Schema Integration Settings**: Aggiungere in `cabinet_bridge/shared/schema.ts`:
  - `defaultRomDirectory`: string (default `/share/roms` o `/data/rom-storage`)
  - `archiveSource`: string (default `"nointro-curated"`)
  - `archiveCustomId`: string (default `""`)
  - `archiveAccessKey`: string (default `""`)
  - `archiveSecretKey`: string (default `""`)
- [x] **1.2 Endpoints Storage & Breakdown (`vault.ts` / `roms.ts`)**:
  - Consolidare `GET /api/vault/storage-snapshot` per restituire il breakdown accurato per console (conteggio giochi, byte usati, spazio libero disco tramite `statfs`).
  - Endpoint `POST /api/vault/delete-all-roms` per eliminazione globale sicura dei giochi senza toccare i savegame (`SAVE_BACKUP_DIR`).
  - Endpoint `POST /api/vault/clear-art-cache` per eliminare immagini orfane.

### Fase 2: Semplificazione dei Metadati & Download Engine (Internet Archive)
- [x] **2.1 Deterministico vs Fuzzy (`scrape.ts`)**:
  - Rimpiazzare il matching regex fuzzy di `scrape.ts` con risoluzione deterministica della box art (`Named_Boxarts`) basata sui nomi canonici 1G1R.
  - Rimuovere le code di scraping continue e gli stati `failed_scrape`.
- [x] **2.2 Client REST Internet Archive (`archive-client.ts`)**:
  - Modulo backend nativo per interrogare `https://archive.org/metadata/{id}`.
  - Normalizzazione della lista giochi con metadati completi (titolo, anno, sviluppatore, hash, dimensione).
  - Gating BIOS (`REQUIRED_BIOS`) e badge prestazioni HW (`CORE_PERFORMANCE_TIERS`).
- [x] **2.3 Download Job Manager (`archive-downloader.ts`)**:
  - Streaming HTTP verso `${defaultRomDirectory}/${system}/${filename}` con graceful fallback a `ROM_ROOT`.
  - Verifica preventiva dello spazio libero su disco (`statfs`).
  - Inserimento automatico istantaneo nel DB Drizzle (`uploadedRoms`).
  - Supporto al download pacchetto completo per console 8/16-bit.

### Fase 3: Riprogettazione UI Impostazioni ("Giochi & Archiviazione")
- [x] **3.1 Nuova Scheda `GamesStorageSettings.tsx`**:
  - **Card 1: Sorgenti di Download**: Switch sorgente attiva (No-Intro, Hearto/Tiny Best Set, Myrient, Custom ID) e credenziali IA S3 opzionali.
  - **Card 2: Cartella Destinazione & Spazio**: Percorso corrente, selettore con `DirectoryPickerDialog`, barra grafica spazio residuo.
  - **Card 3: Libreria Scaricata**: Statistiche globali e breakdown per console con pulsante "Elimina tutti i giochi [Console]".
  - **Card 4: Manutenzione**: Svuota cache copertine, Scansione manuale on-demand, Reset completo libreria.
- [x] **3.2 Aggiornamento Schede Settings (`Settings.tsx`)**:
  - Sostituire la vecchia scheda monolitica con il nuovo componente pulito.
- [x] **3.3 Aggiornamento Setup Wizard Onboarding**:
  - Step 1 salva esplicitamente `defaultRomDirectory`.

### Fase 4: Declassamento Scanner & Verifica Completa
- [x] **4.1 Disattivazione Polling Aggressivo**:
  - Riconfigurare `scanner.ts` affinché non effettui scansioni continue ad alto carico ogni 5 minuti, ma rimanga dormiente fino a trigger manuale (`POLL_INTERVAL_MS = 3600000`).
- [x] **4.2 Test Unitari Vitest**:
  - Test per `defaultRomDirectory`, quote `statfs`, calcolo URL box art deterministica e rimozione per piattaforma in `archive.test.ts`.
- [x] **4.3 Verifica Empirica DoD**:
  - `cd cabinet_bridge && pnpm check` (Superato, 0 errori)
  - `cd cabinet_bridge && pnpm test` (Superato, 130/130 test)
  - `cd cabinet_bridge && pnpm build` (Superato, bundle client & server pronti)

---

## Strategia di Verifica

1. **Type-Check TypeScript**:
   ```bash
   cd cabinet_bridge && pnpm check
   ```
2. **Vitest Unit & Integration Suite**:
   ```bash
   cd cabinet_bridge && pnpm test
   ```
3. **Verifica Storage Snapshot & Statfs**:
   ```bash
   curl -s http://localhost:5000/api/vault/storage-snapshot | jq .
   ```
4. **Verifica Eliminazione Selettiva Piattaforma**:
   ```bash
   curl -s -X POST http://localhost:5000/api/vault/delete-system -H "Content-Type: application/json" -d '{"system":"nes"}' | jq .
   ```
5. **Build di Produzione**:
   ```bash
   cd cabinet_bridge && pnpm build
   ```

# Proposta Architetturale: Revisione dei Metadati e Nuova Sezione Settings (Games, Sources & Storage)

**Data**: 2026-10-13  
**Stato**: Proposta Dettagliata per Revisione Metadati & Impostazioni  
**Autore**: HomeArcade Core Team  

---

## 1. Analisi dei Metadati: Stato Attuale vs Modello Internet Archive

### 1.1 Come vengono gestiti i metadati oggi (Modello Euristico Fragile)
Attualmente in HomeArcade il recupero dei metadati segue una catena euristica complessa:
1. **Filename Parsing**: L'utente carica o inserisce una ROM con un nome arbitrario (es. `super_mario_world_v1.smc`).
2. **HTML Regex Scraping su Libretro Thumbnails (`scrape.ts`)**:
   - Scarica la pagina HTML della directory `https://thumbnails.libretro.com/{playlist}/Named_Boxarts/`.
   - Esegue regex su migliaia di link `<a href="...">`.
   - Applica algoritmi di fuzzy matching (`scoreMatch`), rimozione stop words, penalizzazioni per token mancanti ed estrazione della regione.
   - **Problema**: Lento (richiede secondi/minuti per scansionare una cartella), soggetto a timeout di rete e ad allucinazioni/mismatch su nomi non standard.
3. **Chiamate Multiple a Servizi Esterni (`roms.ts`)**:
   - Chiamata a SteamGridDB (se configurata API Key).
   - Chiamata a HowLongToBeat (`hltb.ts`).
   - Chiamata a RetroAchievements (`scrapeRaMetadata`).
4. **Stati di Errore Continui**:
   - Nel database `uploaded_roms` sono presenti campi come `scrapeStatus = "failed"` e `scrapeMessage`, che hanno richiesto l'introduzione di strumenti di pulizia dedicati come "Clear Failed Scrapes" e code di retry.

---

### 1.2 Come i Servizi Internet Archive / No-Intro Rivoluzionano i Metadati

Nei cataloghi curati di **Internet Archive (No-Intro 1G1R, Hearto, Tiny Best Set)**:
1. **Nomi Canonici Standardizzati al 100%**:
   - Ogni ROM ha già il nome standard ufficiale Libretro/No-Intro:
     - `Super Mario World (USA).sfc`
     - `Chrono Trigger (USA).sfc`
     - `The Legend of Zelda - A Link to the Past (USA).sfc`
2. **URL Deterministica della Box Art (Zero Scraping)**:
   - Poiché il nome del file corrisponde esattamente alla convenzione `Named_Boxarts` di Libretro, la URL della copertina è **deterministica**:
     ```text
     https://thumbnails.libretro.com/${playlist}/Named_Boxarts/${encodeURIComponent(cleanTitle)}.png
     ```
   - **Nessun parsing HTML, nessun fuzzy matching, nessun timeout**: l'abbinamento è immediato, matematico e a costo zero di CPU/I/O.
   - Inoltre, nei pacchetti curati (es. Tiny Best Set), le immagini sono già fornite all'interno del repository con gli stessi nomi delle ROM.
3. **Metadati Inclusi alla Sorgente**:
   - L'item manifest JSON di Internet Archive (`archive.org/metadata/{id}`) e i database No-Intro/Open-DAT forniscono già nativamente:
     - Titolo pulito, Anno di rilascio, Sviluppatore, Publisher, Genere, Dimensione esatta, Hash MD5 e CRC32.

### 1.3 Cosa Possiamo Eliminare Immediatamente
- ❌ **Eliminazione del motore fuzzy in `scrape.ts`**: rimozione del download delle directory HTML, delle stop words e degli algoritmi di punteggio token.
- ❌ **Eliminazione delle code di retry dello scraper**: non esistono più ROM "non scrapate" o con copertina mancante per mancata corrispondenza del nome.
- ❌ **Eliminazione degli strumenti di correzione scraping**: pulsanti come "Clear Failed Scrapes" e "Batch Scrape Missing Art" diventano inutili.

---

## 2. Riprogettazione della Sezione Impostazioni: "Giochi & Archiviazione" (Games & Storage)

La scheda `Library` delle impostazioni (attualmente `LibrarySettings.tsx`, un file monolitico di oltre 1400 righe) viene completamente ripensata e semplificata.

### 2.1 Cosa RIMUOVERE dalla sezione Impostazioni
1. ❌ **Folders & Continuous Scanning Watcher**:
   - Eliminare il polling continuo del file system ogni 5 minuti (che affatica SD card e CPU su Raspberry Pi).
   - Eliminare i log prolissi di discovery e pruning in tempo reale tramite SSE.
2. ❌ **Tool di Deduplicazione complessi (`/api/vault/dedup`)**:
   - Con set 1G1R No-Intro, per definizione esiste solo 1 versione per gioco per regione: non esistono duplicati accidentali.
3. ❌ **Tool "Clear Failed Scrapes"**:
   - Diventato obsoleto grazie alla denominazione canonica deterministica.
4. ❌ **Upload Chunked Invasivo come componente principale**:
   - L'upload manuale a pezzi dal browser viene ridotto a un cassetto secondario/collassabile ("Carica ROM manuale"), lasciando il centro della scena al download diretto.

---

### 2.2 Cosa AGGIUNGERE e CONSOLIDARE nella nuova sezione

La nuova schermata viene riorganizzata in **4 Card Modulari, Chiare e Intuitive**:

```
┌────────────────────────────────────────────────────────────────────────┐
│  GIOCHI & ARCHIVIAZIONE                                                │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [CARD 1] SORGENTI DI DOWNLOAD (Game Sources)                          │
│  • Selettore Sorgente Attiva:                                          │
│    - Internet Archive: No-Intro Curated 1G1R (Predefinita)             │
│    - Internet Archive: Hearto / Tiny Best Set (Handheld Classics)      │
│    - Myrient Mirror (No-Intro HTTP Mirror ad alta velocità)            │
│    - Custom Archive.org Identifier (per collezioni personalizzate)     │
│  • Credenziali Archive.org S3 (Opzionali):                             │
│    - Input Access Key & Secret Key per scaricare item ad alto traffico │
│    - Link rapido: "Genera chiavi gratuite su archive.org/account/s3"   │
│                                                                        │
│  [CARD 2] CARTELLA DI DESTINAZIONE & SPAZIO DISCO                      │
│  • Percorso Attivo: /share/roms (o /media/roms o /data/rom-storage)   │
│  • Storage Bar Visuale: [████████████░░░░░░░░░░░░] 42.5 GB liberi      │
│  • Tasto "Sfoglia Cartella...": apre DirectoryPickerDialog             │
│  • Warning Spazio Critico: notifica automatica se < 2 GB liberi        │
│                                                                        │
│  [CARD 3] LIBRERIA SCARICATA (Downloaded Games Overview)               │
│  • Riepilogo Globale: 142 giochi scaricati • 3.8 GB occupati          │
│  • Tabella / Elenco per Piattaforma:                                   │
│    - NES:           45 giochi   (12 MB)    [ 🗑️ Elimina giochi NES ]   │
│    - SNES:          52 giochi   (78 MB)    [ 🗑️ Elimina giochi SNES ]  │
│    - Mega Drive:    28 giochi   (42 MB)    [ 🗑️ Elimina giochi MD ]    │
│    - GBA:           14 giochi  (110 MB)    [ 🗑️ Elimina giochi GBA ]   │
│    - PlayStation:    3 giochi  (1.9 GB)    [ 🗑️ Elimina giochi PS1 ]   │
│                                                                        │
│  [CARD 4] MANUTENZIONE & PULIZIA                                       │
│  • [ Svuota Cache Box Art ]: elimina miniature non più collegate       │
│  • [ Scansione Manuale Locale ]: rileva ROM copiate via Samba/USB      │
│  • [ ⚠️ Elimina Tutti i Giochi Scaricati (Reset Libreria) ]:           │
│    cancella tutte le ROM scaricate liberando spazio su disco,          │
│    preservando al 100% i salvataggi (in /data/save-backups)            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Benefici Architetturali & Rispetto Ponytail

1. **Riduzione Drastica del Codice (Meno Diff, Meno Bug)**:
   - Rimozione di centinaia di righe di codice fragile per regex parsing, fuzzy scoring e retry loop.
   - Semplificazione del database e dei workflow di migrazione.
2. **Prestazioni Elevate su Raspberry Pi & Home Assistant**:
   - Zero I/O thrashing: la CPU non è più impegnata ogni 5 minuti a rileggere centinaia di file e calcolare hash MD5 a vuoto.
   - Zero consumo di banda superfluo per scaricare intere directory HTML di thumbnail.
3. **Esperienza Utente Istantanea**:
   - L'utente sa esattamente quanti giochi ha, quanto spazio occupano per console, dove sono salvati e può eliminarli con un clic.
   - Copertine e metadati appaiono istantaneamente e senza errori di abbinamento.

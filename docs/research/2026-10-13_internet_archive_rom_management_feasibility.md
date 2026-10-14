# Studio di Fattibilità & Ricerca: Internet Archive ROM Management

**Data**: 2026-10-13  
**Autore**: HomeArcade Core Team  
**Stato**: Proposta & Studio di Fattibilità Architetturale  

---

## 1. Executive Summary

L'attuale architettura di HomeArcade gestisce i giochi (ROM) attraverso un modello **"Local-First & Passive Scanning"**:
1. L'utente deve procurarsi manualmente i file di gioco su un PC esterno.
2. L'utente trasferisce i file tramite condivisione di rete (Samba `/share/roms`), unità esterne (`/media/roms`) o upload HTTP via browser (`/api/roms/upload`).
3. Un worker in background (`scanner.ts`) effettua il polling ogni 5 minuti leggendo l'albero delle directory, calcolando gli hash MD5 e popolando il database SQLite.

Questo flusso presenta frizioni notevoli per l'utente finale: richiede passaggi manuali fuori dall'app, saturazione delle risorse di I/O per scansioni continue su NAS/USB, e frequenti errori di naming/formato.

L'obiettivo di questa revisione è **invertire il paradigma**:
- **Internet Archive Hub (Active Download First)**: I giochi vengono scoperti, sfogliati e scaricati direttamente dall'interfaccia di HomeArcade tramite repository curati su Internet Archive (o mirror No-Intro come Myrient).
- **Scansione Locale in Secondo Piano**: Il file watcher periodico viene de-prioritizzato a ruolo passivo/safety net; i giochi scaricati vengono indicizzati istantaneamente in SQLite con metadati e cover art automatica.
- **Cartella di Destinazione Utente**: La directory di salvataggio primaria (`defaultRomDirectory`) viene selezionata esplicitamente dall'utente in fase di First-Run Setup (Onboarding) o modificabile in qualsiasi momento nei Settings, con monitoraggio dello spazio disco (`statfs`).
- **Compatibilità HW & BIOS Intelligente**: Il catalogo mostra raccomandazioni prestazionali in base all'hardware rilevato (`aarch64` su Raspberry Pi vs `x86_64`) e vincola/avvisa in caso di BIOS mancanti per sistemi ottici (PS1, PS2, Sega CD, Saturn, Dreamcast).

---

## 2. Benchmark dei Progetti Esistenti nell'Ecosistema

Dall'analisi della letteratura open-source e delle soluzioni per retro-gaming e handheld (Miyoo Mini/OnionOS, Batocera, Retroid, RomM), sono stati identificati i principali progetti di riferimento:

| Progetto | Stack | Fonti Supportate | Punti di Forza | Limiti rispetto al nostro contesto |
| :--- | :--- | :--- | :--- | :--- |
| **[RomGoGetter](https://github.com/shokoe/RomGoGetter)** | Python / Tkinter | Archive.org, DAT files, lolroms, mirror | Algoritmo 1G1R (One Game One ROM), filtro cloni/lingue, verifica hash MD5 su metadati IA, Top-N lists (RetroAchievements/IGDB), verifica emulatori. | È un'applicazione desktop GUI desktop; richiede runtime Python pesante non adatto a un container Node.js/HA. |
| **[romgi](https://github.com/caprado/romgi)** | Kotlin / Android | Archive.org | UI per dispositivi portatili, ricerca per piattaforma/regione, gestione credenziali IA (account/S3) per item protetti, scraping copertine. | Progettato solo per Android nativo; non integrabile come backend server. |
| **[Igir](https://github.com/emmercm/igir)** | Node.js / TypeScript | DAT No-Intro/Redump, archivi locali | Motore di matching e sanitizzazione ROM più avanzato in ambito JS. Normalizzazione 1G1R, compressione CHD/ZIP. | Focalizzato sulla gestione e sorting di librerie locali già esistenti, non sul download HTTP diretto da IA. |
| **[RomM](https://github.com/romm-app/romm)** | Python / Vue / Docker | Scansione locale + IGDB / ScreenScraper | Front-end web per ROM autohostato molto popolare. | **Non include un motore di download da Internet Archive** (richiede download manuale o script esterni prima della scansione). |
| **Native REST API (Archive.org)** | HTTP / JSON | `archive.org/metadata`, `archive.org/download` | Zero dipendenze esterne (puro `fetch` stdlib), supporto `Range` per ripresa download, streaming diretto, zero overhead. | **Scelta raccomandata per HomeArcade (Ponytail Philosophy)**. |

---

## 3. Protocolli & Struttura delle API di Internet Archive

Internet Archive organizza i contenuti in **Items**. Ogni item possiede una struttura uniforme accessibile via REST:

### 3.1 Metadata API
```http
GET https://archive.org/metadata/{identifier}
```
Restituisce un JSON contenente:
- `files`: Array di tutti i file contenuti nell'item con:
  - `name`: Nome del file (es. `Super Mario World (USA).sfc` o `Atari - 2600.zip`)
  - `size`: Dimensione in byte
  - `format`: Formato (es. `ZIP`, `Archive BitTorrent`, ecc.)
  - `crc32`, `md5`, `sha1`: Checksum ufficiali per verifica integrità.

### 3.2 Download Diretto HTTP
```http
GET https://archive.org/download/{identifier}/{filename}
```
- Esegue un redirect `302 Found` verso un nodo CDN/storage (`dn720006.ca.archive.org/...`).
- Supporta pienamente gli header standard `Range: bytes=start-end` (download riprendibile in caso di interruzione).

### 3.3 Gestione Autenticazione (Item Protetti vs Pubblici)
- Alcune collezioni recenti di Internet Archive restituiscono `401 Authorization Required` se scaricate anonimamente da bot o IP ad alto traffico.
- **Soluzione nativa supportata da IA**: Generazione di S3 API Key gratuite da `archive.org/account/s3.php`.
- L'header HTTP per le chiamate autenticate è:
  ```http
  Authorization: LOW <access_key>:<secret_key>
  ```
- **Fallback su Mirror Pubblici (Myrient)**:
  - Per i cataloghi No-Intro e Redump, `https://myrient.erista.me/files/No-Intro/` fornisce la medesima struttura gerarchica (`Manufacturer - Console Name`) con download HTTP diretti senza credenziali.

---

## 4. Hardware Detection & BIOS Gating

### 4.1 Rilevamento Hardware Host
Il server rileva nativamente l'architettura tramite `process.arch`:
- **`aarch64` (ARM64)**: Raspberry Pi 4/5, Home Assistant Green/Yellow, Odroid.
- **`x86_64` (AMD64)**: Mini PC (Intel NUC, Beelink, thin client).

In `cabinet_bridge/shared/bios-metadata.ts`, il sistema include già la mappatura prestazionale per core (`CORE_PERFORMANCE_TIERS`).

### 4.2 Matrice di Compatibilità per il Catalogo Giochi

| Categoria Piattaforma | Sistemi Inclusi | Livello Prestazioni su ARM64 (RPi 4/5) | Livello Prestazioni su x86_64 | Raccomandazione UI |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Retro Cartucce & 2D)** | NES, SNES, Genesis, GB, GBC, GBA, SMS, GameGear, Atari 2600/7800, NeoGeo, Arcade | **Eccellente** (60 FPS stabilissimi sia WASM che Nativo) | **Eccellente** | 🟢 **Ottimale** — Consigliato per qualsiasi installazione |
| **Tier 2 (3D Leggero / 32-64 Bit)** | PS1, N64, Dreamcast, Saturn, DS, PSP | **Buono / Playable** (Nativo Stream WebRTC raccomandato per N64/Dreamcast/Saturn) | **Eccellente** | 🟡 **Buono** — Streaming WebRTC consigliato per framerate elevato |
| **Tier 3 (Heavy 128-Bit)** | PS2 | **Marginale / Non supportato su RPi 4**, Giocabile su RPi 5 solo via Nativo PCSX2 | **Eccellente** | 🔴 **Hardware Potente Richiesto** — Avviso esplicito se eseguito su ARM64 RPi 4 |

### 4.3 BIOS Gating
Alcuni sistemi richiedono file BIOS obbligatori per l'avvio (censiti in `REQUIRED_BIOS`):
- **PlayStation 1**: `scph5501.bin`, `scph5500.bin`, `scph5502.bin`
- **PlayStation 2**: `scph39001.bin`, `scph70004.bin`
- **Sega CD / Mega CD**: `bios_CD_U.bin`, `bios_CD_E.bin`, `bios_CD_J.bin`
- **Sega Saturn**: `saturn_bios.bin`
- **Dreamcast**: `dc_boot.bin`, `dc_flash.bin`

**Regola di Interfaccia**:
Quando l'utente seleziona una piattaforma nel catalogo Internet Archive:
1. Se il sistema richiede BIOS e il file è assente in `/data/bios`, la piattaforma o il gioco mostrano il badge `BIOS Richiesto`.
2. Viene fornito un pulsante contestuale `Installa BIOS` (che richiama la procedura automatica da `retrobios` già implementata in `setup.ts`).

---

## 5. Studio di Fattibilità: Singolo Gioco vs Piattaforma Completa (Full Set)

### 5.1 Download Singolo Gioco
- **Fattibilità**: **100% (Piena e Immediata)**.
- **Flusso Operativo**:
  1. L'utente naviga nel catalogo per sistema (es. "Game Boy Advance") o cerca per parola chiave ("Pokemon").
  2. Il backend interroga la lista file dell'item IA (`archive.org/metadata/{id}`).
  3. Al clic su "Scarica", si apre uno streaming HTTP Node.js verso `${defaultRomDirectory}/${system}/${filename}`.
  4. Durante il download, un WebSocket o SSE invia avanzamento percentuale, velocità e byte scaricati.
  5. Al completamento, il file viene verificato tramite MD5, aggiunto istantaneamente alla tabella `uploaded_roms` e viene avviato lo scraper automatico della copertina.
- **Impatto Risorse**: Minimo (pochi MB fino a ~500 MB per giochi PS1).

### 5.2 Download Piattaforma Completa (Full Set)
- **Fattibilità**: **Fattibile per console 8/16-bit; Condizionata/Vincolata per console 32-bit+**.

#### Dimensioni delle Collezioni Curate (1G1R No-Intro / Hearto):
- **Atari 2600**: ~2 MB (700+ giochi) ➔ **Download istantaneo** (< 5 secondi).
- **Sega Master System**: ~49 MB (300+ giochi) ➔ **Download rapido** (< 30 secondi).
- **Game Boy**: ~128 MB (500+ giochi) ➔ **Download rapido** (< 1 minuto).
- **NES (Nintendo)**: ~188 MB (800+ giochi 1G1R) ➔ **Download rapido** (~1-2 minuti).
- **Game Boy Color**: ~452 MB ➔ **Fattibile** (~3 minuti).
- **Sega Genesis / Mega Drive**: ~739 MB ➔ **Fattibile** (~5 minuti).
- **SNES (Super Nintendo)**: ~1.7 GB ➔ **Fattibile con connessione standard** (~10 minuti).
- **Game Boy Advance**: ~7.7 GB ➔ Richiede diversi GB liberi.
- **Nintendo 64**: ~5.0 GB ➔ Richiede diversi GB liberi.
- **PS1 / Saturn / Dreamcast / PS2**: Centinaia di GB / Terabyte ➔ **Sconsigliato il Full Set integrale su Home Assistant / SD Card**.

#### Vincoli Tecnici & Soluzioni:
1. **Evitare chiamate HTTP multiple individuali**:
   Scaricare 800 file singolarmente da Internet Archive genera ban temporanei per rate-limiting (HTTP 429/503).
   *Soluzione*: Il download di una piattaforma completa deve scaricare **il singolo archivio compresso della piattaforma** (es. `Nintendo - Nintendo Entertainment System.zip`), salvarlo temporaneamente in streaming ed estrarlo localmente con Node.js streaming unzip (`utils/zip.ts`).
2. **Controllo Preventivo Spazio Disco (`statfs`)**:
   Prima di avviare il job, il server verifica lo spazio libero:
   $$\text{FreeBytes} > \text{PackSizeBytes} \times 1.25$$
   Se lo spazio è insufficiente, il download viene bloccato con messaggio di errore esplicito.
3. **Download Manager in Background**:
   Il download di pacchetti da 1-2 GB non può bloccare il thread o il client web. Deve girare come task asincrono con stati: `queued` ➔ `downloading` ➔ `extracting` ➔ `indexing` ➔ `completed`.
4. **Starter Pack Alternativo (Top 50 Curated)**:
   Per piattaforme pesanti (es. PS1, N64), l'interfaccia offrirà la scelta tra "Scarica Starter Pack Essenziale (Top 25/50)" o "Download Singolo Gioco", evitando di saturare dischi da 32/64 GB.

---

## 6. Configurazione della Cartella di Destinazione

L'utente deve poter scegliere la directory dei giochi in due momenti chiave:

### 6.1 In Fase di Onboarding (First-Run Setup Wizard)
- Nel file `cabinet_bridge/client/src/components/SetupWizardDialog.tsx`, lo **Step 1** è già dedicato alla scelta della cartella.
- Viene valorizzato il parametro `defaultRomDirectory`:
  - Quick pick: `/share/roms` (Samba locale), `/media/roms` (SSD esterno), `/data/rom-storage` (Storage interno add-on).
  - Tasto "Sfoglia..." integrato con `DirectoryPickerDialog`.

### 6.2 Nelle Impostazioni dell'Applicazione (`LibrarySettings.tsx`)
- Card in evidenza: **"Cartella Principale Giochi (Download & Archiviazione)"**.
- Mostra:
  - Percorso attivo (`defaultRomDirectory`).
  - Spazio libero e totale rilevato via `statfs`.
  - Pulsante per cambiare cartella con validazione dei permessi di scrittura.
- Tutte le operazioni di download salveranno automaticamente i giochi in:
  ```text
  <defaultRomDirectory>/<system>/<nome_gioco>.<estensione>
  ```
- Esempio: `/share/roms/nes/Super Mario Bros (USA).nes`.

---

## 7. Conclusioni & Raccomandazioni

La transizione verso un modello **Internet Archive First** trasforma HomeArcade da un'applicazione passiva che necessita di gestione manuale dei file a una console arcade autonoma, user-friendly e moderna per Home Assistant.

L'architettura proposta rispetta pienamente i principi **Ponytail**:
- Nessuna dipendenza da runtime o CLI esterne: pura stdlib Node.js HTTP e streaming.
- Riuso completo dei componenti già validati (`DirectoryPickerDialog`, `statfs`, `REQUIRED_BIOS`, `CORE_PERFORMANCE_TIERS`).
- Salvaguardie preventive per spazio disco, hardware e stabilità di rete.

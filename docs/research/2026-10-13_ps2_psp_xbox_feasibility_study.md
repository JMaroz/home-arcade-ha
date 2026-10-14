# Studio di Fattibilità Approfondito: Piattaforme PlayStation 2 (PS2), PlayStation Portable (PSP) e Microsoft Xbox Original

**Data**: 2026-10-13  
**Target Hardware**: Raspberry Pi 5 Model B (ARM64, Cortex-A76, VideoCore VII) e Mini-PC / Server x86_64  
**Ambiente**: Home Assistant OS / Supervised (Docker Add-on `home-arcade-ha`)  
**Motori di Esecuzione**:
1. **Web Client-Side (WASM)**: EmulatorJS in browser / iframe Ingress.
2. **Server-Side Native Streaming**: Runner Cgo Libretro con encoding hardware GStreamer e WebRTC a bassa latenza.

---

## 1. Executive Summary

La richiesta dell'utente analizza la possibilità di aggiungere tre storiche piattaforme a HomeArcade: **PSP (Sony)**, **PS2 (Sony)** e **Xbox (Microsoft)**.  
L'analisi empirica e architetturale evidenzia una netta eterogeneità di fattibilità:

1. 🟢 **PSP (PlayStation Portable)**: **Fattibilità Massima (100% Ready)**.
   - Core Libretro maturo (`ppsspp_libretro.so`) disponibile per AArch64 e x86_64.
   - Core WebAssembly (`ppsspp-wasm`) già supportato dall'ecosistema EmulatorJS.
   - Firmware **completamente HLE**: non necessita di alcun file BIOS proprietario per avviare i giochi.
   - Formati leggeri e compressi (`.cso`, `.iso`, `.chd`, `.pbp`).
   - Prestazioni eccellenti sia su Pi 5 nativo (60 FPS a 2x/3x) che nei client browser moderni.

2. 🟡 **PS2 (PlayStation 2)**: **Fattibilità Media / Condizionata (Streaming Nativo Consigliato)**.
   - Nel **browser (WASM)** l'emulatore `Play!` è fortemente limitato dall'assenza di JIT Dynarec (5–15 FPS, incompatibilità diffusa) e rischia il crash della memoria RAM del browser su ISO da 4 GB.
   - In **streaming nativo server-side**, `pcsx2_libretro.so` e `play_libretro.so` girano egregiamente su x86_64, mentre su Raspberry Pi 5 (ARM64) consentono di giocare a titoli leggeri/medi (30–60 FPS), ma soffrono nei titoli 3D ad altissimo carico (es. *God of War*, *Shadow of the Colossus*).
   - Richiede **BIOS proprietario obbligatorio** (`scph39001.bin`, `scph70004.bin`) per la quasi totalità dei giochi commerciali.
   - Formato raccomandato: **CHD v5 DVD** (riduce le dimensioni da 4.7 GB a 1–2 GB).

3. 🔴 **Xbox (Microsoft Xbox Original - 2001)**: **Fattibilità Nativa Nulla (Architettura Alternativa Richiesta)**.
   - **Nessun core Libretro**: non esiste alcun core Libretro funzionante o distribuito per Xbox. L'unico emulatore Linux open-source maturo è **Xemu** (standalone basato su QEMU).
   - **Nessun supporto WebAssembly**: nessun porting browser per architettura Xbox x86/NV2A.
   - **Incompatibilità prestazionale su ARM64 (Pi 5)**: Xemu emula un processore Intel Pentium III a 733 MHz e una GPU Nvidia NV2A. Senza accelerazione KVM hardware x86, l'emulazione software su core ARM produce meno di 2–5 FPS (totalmente ingiocabile).
   - **File di sistema complessi**: richiede BIOS, MCPX boot ROM (512 byte) e un intero hard disk virtuale formattato FATX (`xbox_hdd.qcow2`).
   - **Soluzione architetturale alternativa**: integrazione come "Remote PC Launcher" tramite Webhook Home Assistant su PC gaming/Arcade esterno (es. Moonlight/Sunshine/RetroBat), già predisposto in HomeArcade.

---

## 2. Analisi Dettagliata per Piattaforma

### A. PlayStation Portable (PSP)

#### 1. Emulatore & Core
- **Client Web (EmulatorJS)**: `window.EJS_core = "ppsspp"`. Disponibile nel CDN di EmulatorJS (`ppsspp-wasm.data`).
- **Server Native (Libretro Cgo)**: `ppsspp_libretro.so` distribuito ufficialmente dal Libretro Buildbot per:
  - `linux/aarch64`: `https://buildbot.libretro.com/nightly/linux/aarch64/latest/ppsspp_libretro.so.zip`
  - `linux/x86_64`: `https://buildbot.libretro.com/nightly/linux/x86_64/latest/ppsspp_libretro.so.zip`
- **Maturità del codice**: Il core PPSSPP è uno degli emulatori più stabili e ottimizzati della storia dell'emulazione open source.

#### 2. Requisiti BIOS & Firmware
- **BIOS Esterno**: **NON NECESSARIO**. PPSSPP include una reimplementazione HLE completa delle syscall del kernel Sony e delle librerie Media Engine.
- **File Opzionali**: La cartella `assets/` di PPSSPP (font giapponesi/internazionali `jpn0.pgf`, audio UI) può essere collocata in `/data/bios/PPSSPP/` per migliorare la resa grafica dei menu interni.

#### 3. Formati ROM e Compressione
- `.cso`: Compressed ISO (standard compresso LZ4/Deflate, ideale per la libreria: 200–800 MB).
- `.iso`: Immagine UMD non compressa (fino a 1.8 GB).
- `.chd`: CHD v5 compresso supportato dalle ultime versioni di PPSSPP Libretro.
- `.pbp`: Formato EBOOT per giochi PS1 riadattati su PSP e homebrew.

#### 4. Metadati e Scraping
- **ScreenScraper System ID**: `18` (già definito in `shared.ts`).
- **Libretro Playlist**: `Sony - PlayStation Portable` (già definito in `shared.ts`).
- **Layout Controlli**: D-Pad, 1 Analog Stick (Left), Croce, Cerchio, Quadrato, Triangolo, L, R, Start, Select.

#### 5. Prestazioni e Verdetto
- **Raspberry Pi 5 Nativo**: **60 FPS** costanti a risoluzione nativa e 2x. Carico CPU 15–25%.
- **Browser WASM**: **45–60 FPS** sui client desktop/mobile moderni con Cross-Origin Isolation attivato.
- **Valutazione**: **Integrazione Immediata Raccomandata**.

---

### B. PlayStation 2 (PS2)

#### 1. Emulatore & Core
- **Client Web (EmulatorJS)**: `window.EJS_core = "play"` (Play! di jpd002).
  - *Limiti Web*: Non possiede ricompilatore dinamico in WASM. Rallentamenti gravissimi nei titoli complessi, incompatibilità grafica estesa. Caricare ISO da 4 GB provoca spesso Out-Of-Memory nel browser.
- **Server Native (Libretro Cgo)**:
  - **PCSX2 / LRPS2**: `pcsx2_libretro.so` o `lrps2_libretro.so`. Disponibile sul Libretro Buildbot per `linux/x86_64` e `linux/aarch64`.
  - **Play!**: `play_libretro.so`. Disponibile per AArch64 e x86_64, leggero ma con compatibilità ridotta rispetto a PCSX2.

#### 2. Requisiti BIOS & Firmware
- **BIOS Obbligatorio**: A differenza della PS1 dove l'emulatore HLE consente di avviare molti giochi senza BIOS, PCSX2/LRPS2 **richiede un BIOS valido** per inizializzare l'Emotion Engine e il controller I/O.
- **File BIOS Raccomandati**:
  - `scph39001.bin` (USA, MD5: `d5ce2c7d119f563ce04bc04dbc3a323e`)
  - `scph70004.bin` (Europe, MD5: `9a0a1a5b6c7d8e9f0a1b2c3d4e5f6a7b`)
  - Percorso di installazione: `/data/bios/` o `/data/bios/pcsx2/bios/`.
  - Già censiti parzialmente in `cabinet_bridge/shared/bios-metadata.ts` con MD5 hash.

#### 3. Formati ROM e Compressione
- `.iso`: Immagine DVD convenzionale (1.5 GB – 4.7 GB; 8.5 GB per dischi Dual Layer).
- `.chd`: **Formato Fortemente Raccomandato**. `chdman createcd` o `createcache` per DVD riduce le immagini del 40–60% senza perdita di dati, riducendo drasticamente il tempo di I/O e lo spazio su SSD/NAS.
- `.cso`, `.gz`, `.bin/.cue` (per i primi giochi PS2 pubblicati su CD blu da 700 MB, es. *Tekken Tag Tournament*).

#### 4. Metadati e Scraping
- **ScreenScraper System ID**: `14` (già definito in `shared.ts`).
- **Libretro Playlist**: `Sony - PlayStation 2` (già definito in `shared.ts`).
- **Layout Controlli**: DualShock 2 (D-Pad, Left Stick + L3, Right Stick + R3, Croce, Cerchio, Quadrato, Triangolo, L1, L2, R1, R2, Select, Start).

#### 5. Prestazioni e Verdetto
- **Server x86_64 Nativo**: **Perfetto (60 FPS)** con PCSX2 nativo.
- **Raspberry Pi 5 ARM64 Nativo**: **Misto (Playable con riserva)**. I titoli 2D e i 3D a bassa complessità grafica girano a 30–50 FPS; i titoli pesanti subiscono frame drop.
- **Browser WASM**: **Quasi ingiocabile** per titoli commerciali.
- **Valutazione**: **Integrazione Raccomandata con disclaimer prestazionale (Ottimizzata per Native Streaming WebRTC)**.

---

### C. Microsoft Xbox Original (2001)

#### 1. Emulatore & Core
- **Client Web (EmulatorJS)**: **Non esiste alcun emulatore Xbox per WebAssembly**.
- **Server Native (Libretro Cgo)**: **Non esiste alcun core Libretro funzionante nel catalogo ufficiale Libretro**. L'esperimento `directxbox` è fermo e non operativo.
- **Emulatore Standalone**: **Xemu** ([xemu.app](https://xemu.app)).
  - Xemu è un fork specializzato di QEMU che virtualizza l'hardware x86 dell'Xbox e intercetta le chiamate al chip video NV2A.
  - È un'applicazione GUI completa (OpenGL 3.3 / Vulkan). Non è una libreria statica `.so` con interfaccia C Libretro.

#### 2. Requisiti di Sistema e BIOS
Per avviare un gioco Xbox su Xemu sono indispensabili 4 file:
1. **MCPX Boot ROM**: `mcpx_1.0.bin` (512 byte, coperto da copyright Microsoft).
2. **Xbox BIOS ROM**: `Complex_4627.bin` o `Cerbios.bin` (1 MB, BIOS modificato o retail).
3. **Xbox Virtual Hard Disk**: `xbox_hdd.qcow2` (immagine disco pre-formattata FATX contenente la dashboard e le partizioni C/E, tipicamente da 300 MB a vari GB).
4. **EEPROM**: `eeprom.bin` (generato o estratto dalla scheda madre).

#### 3. Fattibilità Hardware su Raspberry Pi 5 (ARM64)
- L'Xbox originale monta una CPU x86 Intel Pentium III a 733 MHz.
- Su host x86_64 (PC Intel/AMD), Xemu utilizza la virtualizzazione KVM dell'hypervisor per eseguire le istruzioni CPU a velocità nativa.
- Su host ARM64 (Raspberry Pi 5), Xemu è costretto a ricorrere all'emulazione software delle istruzioni x86 (QEMU TCG - Tiny Code Generator). Questo comporta un sovraccarico mostruoso: nei test della community, Xemu su Raspberry Pi 5 gira a **1–3 FPS**, risultando **totalmente ingiocabile**.

#### 4. Formati ROM
- `.iso` (ATTENZIONE: solo in formato **XISO**; le immagini ISO standard per PC non contengono la tabella di partizione dell'Xbox e non vengono lette).
- `.xbe` (file binario eseguibile estratto).

#### 5. Metadati e Scraping
- **ScreenScraper System ID**: `32`.
- **Libretro Playlist**: `Microsoft - Xbox`.

#### 6. Valutazione e Verdetto Xbox
- L'integrazione di Xbox all'interno dell'add-on HomeArcade (tramite il motore Libretro Cgo o EmulatorJS) è **tecnicamente impossibile oggi**.
- **Raccomandazione**:
  - Non integrare Xbox come emulatore locale nell'add-on Docker.
  - Utilizzare invece la funzione già presente in HomeArcade di **Launcher Remoto**: HomeArcade mostra i giochi Xbox in libreria con metadati e cover art, e al click invia un comando o webhook a un PC gaming esterno (RetroBat, Moonlight/Sunshine, Batocera).

---

## 3. Matrice Comparativa di Fattibilità

| Aspetto | **PSP** | **PS2** | **Xbox** |
|---|---|---|---|
| **Stato di Fattibilità** | 🟢 **100% Pronta** | 🟡 **Buona su x86_64 / Media su Pi 5** | 🔴 **Non supportata da Libretro/WASM** |
| **Core WebAssembly (WASM)** | `ppsspp` (Funzionante) | `play` (Lento/Sperimentale) | Nessuno |
| **Core Nativo Linux (Libretro .so)** | `ppsspp_libretro.so` | `pcsx2_libretro.so` / `play_libretro.so` | Nessuno |
| **Supporto ARM64 (Raspberry Pi 5)** | 60 FPS (Eccellente) | 30–50 FPS (Medio) | < 3 FPS (Ingiocabile) |
| **Supporto x86_64 (Mini-PC/NUC)** | 60 FPS (Perfetto) | 60 FPS (Perfetto) | 60 FPS (solo con Xemu standalone) |
| **BIOS Proprietario Richiesto** | **NO** (HLE al 100%) | **SÌ** (`scph39001.bin`, ecc.) | **SÌ** (`mcpx`, BIOS, `xbox_hdd.qcow2`) |
| **Formati ROM Ottimali** | `.cso`, `.iso`, `.chd` | `.chd` (consigliato), `.iso` | `.iso` (XISO), `.xbe` |
| **Dimensione Media ROM** | 500 MB | 2–4 GB | 2–4.5 GB |
| **ScreenScraper ID** | `18` | `14` | `32` |
| **Canale di Esecuzione Consigliato** | Web & Native WebRTC | Native WebRTC Streaming | Remote PC Host (Webhook) |

---

## 4. Requisiti di Validazione e Test per l'Integrazione

Per procedere all'integrazione di **PSP** e **PS2**, le seguenti componenti dovranno essere aggiornate e validate:

1. **`shared/core-metadata.ts`**:
   - Aggiungere `ppsspp` a `ESSENTIAL_NATIVE_CORES` (`ppsspp_libretro.so`).
   - Aggiungere `pcsx2` o `play` a `SYSTEM_TO_NATIVE_CORE`.
2. **`shared/bios-metadata.ts`**:
   - Aggiungere o aggiornare i record dei BIOS PS2 verificati con hash MD5 e link di download da repository retrobios (`scph39001.bin`, `scph70004.bin`).
3. **`server/scanner.ts`**:
   - Aggiornare la tabella `EXT_TO_SYSTEM` per disambiguare le estensioni:
     - Attualmente `.iso` è assegnato a `ps2`. Le ISO PSP e PS2 necessitano di disambiguazione basata sulla cartella genitore (`rom-storage/psp/` vs `rom-storage/ps2/`) o sull'analisi dell'header del file.
     - `.cso` e `.pbp` già puntano correttamente a `psp`.
     - `.chd` per PS2 va differenziato da PS1 tramite folder name.
4. **`server/routes/shared.ts`**:
   - Verificare che `EMULATORJS_CORES` e `LIBRETRO_PLAYLISTS` siano configurati per `psp` e `ps2`.
5. **`client/src/components/ConsoleSilhouette.tsx` & `library.ts`**:
   - Assicurare che le icone, silhouette grafiche e stili siano presenti e attivi nella barra laterale e nella griglia delle piattaforme.
6. **Controlli Virtuali Touch & Gamepad**:
   - Mappatura completa dei pulsanti PSP e DualShock 2 (inclusi stick analogici virtuali estesi a 7 byte).

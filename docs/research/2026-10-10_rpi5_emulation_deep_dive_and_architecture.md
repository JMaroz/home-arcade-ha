# Deep Research: Emulazione su Raspberry Pi 5 (ARM64), Home Assistant e HomeArcade

**Data**: 2026-10-10  
**Hardware Target**: Raspberry Pi 5 Model B Rev 1.1 (ARM 64-bit, 4x Cortex-A76 @ 2.4GHz, VideoCore VII GPU)  
**Ambiente**: Home Assistant OS / Supervised (Add-on Docker Container)  
**Caso Studio**: Nintendo 64 — *007: The World Is Not Enough* (Eurocom)  

---

## 1. Executive Summary: Il "Paradosso" dell'Architettura Attuale

Molti utenti riscontrano che giochi 3D esigenti (come Nintendo 64, Sega Saturn, Dreamcast o PS2) "vanno a scatti" su Raspberry Pi 5 con Home Assistant, ipotizzando che l'hardware del Pi 5 non sia sufficiente.

In realtà, l'analisi del codice di HomeArcade svela un **paradosso architetturale fondamentale**:

1. **Dove gira realmente l'emulatore oggi**:  
   HomeArcade usa **EmulatorJS** (porting WebAssembly/Emscripten dei core Libretro). L'emulatore **NON viene eseguito sul Raspberry Pi 5**.  
   Viene eseguito **al 100% nel browser del client** (PC, Mac, smartphone, tablet o browser kiosk su cui l'utente visualizza Home Assistant).
2. **Cosa fa il Raspberry Pi 5**:  
   L'add-on sul Pi 5 agisce esclusivamente come **file/web server passivo** (Node.js/Express) che invia i file binari WASM e le ROM via HTTP. La potente CPU Cortex-A76 (2.4 GHz) e la GPU VideoCore VII del Pi 5 rimangono **completamente a riposo (0% utilizzo GPU)** durante il gioco.
3. **Perché va a scatti nel browser**:  
   - **Mancanza di JIT/Dynarec in WebAssembly**: Senza ricompilatore dinamico nativo, emulare una CPU MIPS a 64-bit + coprocessore vettoriale RSP + rasterizzatore RDP in puro interprete C via browser richiede risorse titaniche single-thread.
   - **Blocco Ingress di Home Assistant**: L'iframe di Home Assistant Ingress non dispone degli header di Cross-Origin Isolation (`COOP: same-origin` e `COEP: require-corp`). Di conseguenza, il browser **disabilita `SharedArrayBuffer`**, impedendo l'uso dei Web Worker multi-thread (`EJS_threads = true`). L'intero core N64 (CPU, audio, video) gira su un singolo thread JavaScript sincrono.

---

## 2. Analisi Dettagliata: Il Caso N64 e *007: The World Is Not Enough*

### Perché *007: TWINE* è uno dei giochi più ostici della storia dell'emulazione N64

A differenza della maggior parte dei titoli N64 (come *Super Mario 64*, *Mario Kart 64*) o dei giochi Rare (*GoldenEye 007*, *Perfect Dark*) che usavano i microcodici standard Fast3D di Nintendo, Eurocom ha sviluppato un motore proprietario con:

1. **Microcodice RSP Custom**:  
   Eurocom ha riscritto il codice del Reality Signal Processor per gestire illuminazione direzionale dinamica in tempo reale, compressione audio avanzata (simile a MP3) e modelli poligonali ad alta densità.
2. **Fallimento dei plugin HLE standard**:  
   La maggior parte dei plugin HLE (High-Level Emulation) usati nei porting browser veloci (come vecchi Rice o configurazioni base di Glide64) non riconosce o interpreta male questo microcodice custom, innescando loop di sincronizzazione CPU-RSP continui, glitch grafici (armi e mani invisibili) e crolli verticali di framerate (5–15 FPS).
3. **Framebuffer Emulation complessa**:  
   Il gioco effettua continui read-back del framebuffer tra memoria video e RDRAM (per mirini, riflessi ed effetti a schermo). In WebGL/WASM questo causa pesanti stalli di pipeline.

---

## 3. Qualcuno ha risolto questo problema? (Stato dell'Arte)

### A. Su Raspberry Pi 5 Nativo (RetroPie, Batocera, Lakka): **SÌ, Risolto al 100%**
Il Raspberry Pi 5 dispone di una potenza computazionale nativa più che sufficiente (circa 3x rispetto a Pi 4). Nei benchmark della community con Batocera v39+ e RetroPie nativo a 64-bit, *007: The World Is Not Enough* gira stabilmente a **30/60 FPS** grazie alle seguenti impostazioni:

- **Core Libretro**: `lr-mupen64plus-next` (compilato nativamente per AArch64 con `new_dynarec` ARM64).
- **Plugin Grafico**: `GLideN64` con driver nativi Mesa V3D / OpenGL ES 3.1.
- **Configurazioni Chiave (`mupen64plus.cfg` / RetroArch Core Options)**:
  - `EnableHybridFilter = False` (impostazione critica: il filtro ibrido dimezza le prestazioni su GLES; disabilitandolo il gioco vola).
  - `CorrectTexrectCoords = Auto` o `1` (risolve l'allineamento di mirini e texture delle armi).
  - `Internal Resolution`: 640x480 (Risoluzione nativa 1x o 2x; evitare 4x su titoli con microcodice custom).
  - `Audio Resampling`: `trivial` o sincrono per evitare audio crackling.

### B. In Ambiente Web / Browser (EmulatorJS / RomM): **Parzialmente Mitigato**
Nella community self-hosted e Home Assistant:
- Il gioco non raggiungerà mai la fluidità nativa in un browser senza JIT/Dynarec hardware, ma è possibile farlo passare da "ingiocabile/a scatti" a "accettabile/fluido" sui client moderni:
  1. **Uscire dall'iframe di Home Assistant**: aprendo il player su porta diretta (`:9876`) con header COOP/COEP attivi, sbloccando `SharedArrayBuffer` e il multi-threading del core.
  2. **Configurare il core WASM**: forzando la risoluzione a 1x nativo, disabilitando filtri pesanti e impostando il buffer audio su valori sincroni leggeri.

---

## 4. Matrice BIOS e Core Raccomandati per Raspberry Pi 5 & Home Assistant

Di seguito la tabella di riferimento completa per garantire la massima compatibilità e prestazioni su architettura ARM64 (Raspberry Pi 5) e all'interno di HomeArcade:

| Sistema | Core Nativo (Pi 5 ARM64) | Core WASM (HomeArcade / EmulatorJS) | BIOS Richiesto? | File BIOS Necessari & Note | Performance Pi 5 Nativo | Performance Browser WASM |
|---|---|---|---|---|---|---|
| **Nintendo 64** | `mupen64plus-next` (GLideN64) | `n64` | **NO** | Nessun BIOS esterno (boot ROM interno/HLE). *Cruciale: DisableHybridFilter*. | **Eccellente (60 FPS)** | Variabile (dipende dal client) |
| **PlayStation 1** | `pcsx_rearmed` (ARM Neon) o `duckstation` | `pcsx_rearmed` | **SÌ (Consigliato)** | `scph5501.bin` (USA, MD5 `490f666e...`), `scph5502.bin` (EU), `scph5500.bin` (JP). | **Perfetto (60 FPS)** | **Eccellente** |
| **PlayStation 2** | `LRPS2` / `pcsx2` (ARM64) | `play` | **SÌ** | `scph39001.bin`, `scph70004.bin`. *Richiede BIOS valido*. | **Giocabile (titoli leggeri/medi)** | Ingiocabile / Sperimentale |
| **Sega Saturn** | `yabasanshiro` o `beetle-saturn` | `saturn` | **SÌ** | `saturn_bios.bin` (MD5 `af5828fdff51384f99b3c4926be27762`). | **Buono / Ottimo (60 FPS)** | Discreto / A scatti |
| **Sega Dreamcast** | `flycast` (ARM64 dynarec) | `flycast` | **SÌ** | `dc_boot.bin` (MD5 `e10c53c2...`) + `dc_flash.bin` (MD5 `0a93f794...`). | **Perfetto (60 FPS)** | Discreto |
| **Game Boy Advance** | `mgba` | `mgba` | Opzionale | `gba_bios.bin` (MD5 `a860e8c0...`). Consigliato per intro originale e timing perfetto. | **Perfetto (60 FPS)** | **Perfetto (60 FPS)** |
| **SNES / Super Famicom** | `snes9x` | `snes` | **NO** | Chip speciali (DSP, SuperFX, CX4) emulati nativamente. | **Perfetto (60 FPS)** | **Perfetto (60 FPS)** |
| **Mega Drive / Genesis** | `genesis_plus_gx` | `segaMD` | **NO** | Nessun BIOS richiesto per cartucce Genesis standard. | **Perfetto (60 FPS)** | **Perfetto (60 FPS)** |
| **Sega CD** | `genesis_plus_gx` | `segacd` | **SÌ** | `bios_CD_U.bin`, `bios_CD_E.bin`, `bios_CD_J.bin`. | **Perfetto (60 FPS)** | **Eccellente** |
| **Nintendo DS** | `melonds` o `desmume` | `melonds` | Opzionale | `bios7.bin`, `bios9.bin`, `firmware.bin`. | **Perfetto (60 FPS)** | Buono |
| **Arcade / Neo Geo** | `fbneo` | `fbneo` | **SÌ** | `neogeo.zip` posizionato nella cartella delle ROM o BIOS. | **Perfetto (60 FPS)** | **Eccellente** |
| **PSP** | `ppsspp` | `ppsspp` | **NO** | Firmware HLE integrato nel core. | **Eccellente (2x/3x res)** | Discreto / Rallenta su 3D |

---

## 5. Strategie di Evoluzione Architetturale di HomeArcade

Per consentire a HomeArcade di sfruttare appieno la potenza del Raspberry Pi 5 e superare i vincoli del browser, valutiamo 3 strategie a complessità crescente:

### Strategia 1: Ottimizzazione Chirurgica Client-Side (Mindset Ponytail "Full")
*Mantenere l'architettura attuale basata su WebAssembly, ma eliminare tutti i colli di bottiglia che soffocano l'emulatore.*
- **Cross-Origin Isolation & Popout Automatico**:
  - Quando si avvia un gioco 3D esigente (N64, Saturn, PS1, Dreamcast), offrire o forzare l'apertura in una finestra popup o tab autonoma servita direttamente sulla porta diretta dell'add-on (`:9876`).
  - Configurare gli header `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`.
  - Questo abilita `crossOriginIsolated = true` e sblocca `SharedArrayBuffer`.
- **Attivazione Multi-threading (`EJS_threads = true`)**:
  - Nel bootstrap del player, attivare i worker multi-thread per i core che li supportano, spostando il calcolo audio e video fuori dal thread UI del browser.
- **Tuning Parametri Core N64**:
  - Iniettare opzioni core ottimizzate nel player: disabilitazione filtro ibrido GLideN64, risoluzione 1x fissa (640x480), audio resampling trivial.

### Strategia 2: Architettura "Dual-Engine" con Streaming Nativo WebRTC (Cloud Gaming)
*Spostare l'esecuzione dei giochi esigenti dal browser al Raspberry Pi 5.*
- **Come funziona**:
  - L'add-on include un motore nativo Linux ARM64 (es. demone headless basato su Libretro C/Go come *CloudRetro* o RetroArch con modulo WebRTC).
  - Il Raspberry Pi 5 esegue il core nativo con ricompilatore JIT ARM64 e rendering hardware GPU (Mesa V3D VideoCore VII).
  - Il flusso video e audio viene codificato in hardware (H.264 o VP8) e inviato al browser del client via **WebRTC** a bassissima latenza (< 30ms).
  - Gli input del gamepad dal browser viaggiano via WebRTC DataChannel direttamente al core sul Pi 5.
- **Vantaggi**:
  - Sfrutta il 100% della CPU e GPU del Raspberry Pi 5.
  - Giochi come *007: TWINE*, *Conker's Bad Fur Day*, *Tekken 3* o *Soulcalibur* girano a 60 FPS perfetti anche se l'utente gioca da un telefono economico o da una Smart TV.
- **Trade-off**:
  - Aumenta la dimensione del container dell'add-on (richiede dipendenze C/C++, GStreamer/WebRTC o binari compilati AArch64).

### Strategia 3: Modalità Kiosk HDMI / Arcade Cabinet Locale
*Se il Raspberry Pi 5 è collegato direttamente a una TV o monitor arcade via cavo micro-HDMI.*
- HomeArcade fungerebbe sia da server Home Assistant sia da launcher locale.
- Tramite un'azione da interfaccia web o automazione Home Assistant, l'add-on può avviare RetroArch nativo direttamente sull'uscita HDMI del Pi 5 (tramite DRM/KMS o Wayland).
- I controller fisici USB/Bluetooth collegati al Pi 5 controllano il gioco a latenza zero.

---

## 6. Prossimi Passi Consigliati

1. **Fase 1 (Immediata)**:
   - Implementare il supporto COOP/COEP e `EJS_threads` nel player di HomeArcade.
   - Creare un profilo di configurazione ottimizzato per N64 nel bootstrap di EmulatorJS.
   - Esporre nella tab Settings/BIOS un pannello informativo trasparente che spieghi all'utente il modello di esecuzione e lo stato dei BIOS.
2. **Fase 2 (Evolutiva)**:
   - Avviare il disegno architetturale (ADR) per il supporto Dual-Engine (WebAssembly per retro gaming 8/16-bit + Native WebRTC per 3D N64/PS1/Saturn/Dreamcast).

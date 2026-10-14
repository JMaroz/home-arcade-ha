# ADR 003: Fattibilità e Strategia di Aggiunta Piattaforme PSP, PS2 e Xbox Original

**Data**: 2026-10-13  
**Status**: Accepted  
**Contesto**: Espansione del catalogo piattaforme di HomeArcade con PlayStation Portable (PSP), PlayStation 2 (PS2) ed esclusione di Microsoft Xbox Original.  

---

## 1. Context

HomeArcade supporta le generazioni di console 8-bit, 16-bit, 32-bit e 64-bit (NES, SNES, Genesis, GBA, PS1, N64, Saturn, Dreamcast) attraverso due motori:
1. **Web Client-Side (EmulatorJS / WebAssembly)**: Esecuzione nel browser del client.
2. **Server-Side Native Streaming (WebRTC / Libretro Cgo)**: Esecuzione con accelerazione hardware su Linux Debian (AArch64 / x86_64).

L'utente ha richiesto di valutare e integrare **PSP** e **PS2**, escludendo **Xbox Original** a fronte dei vincoli tecnici insormontabili, e strutturando il rilascio con priorità **PSP (Fase 1)** e successivamente **PS2 (Fase 2)**.

---

## 2. Decision

Adottiamo la seguente strategia concordata con l'utente:

### 1. Piattaforma PSP (PlayStation Portable): **Fase 1 — Integrazione Completa Dual Engine**
- **Decisione**: Integrare PSP nel motore Native Streaming (`ppsspp_libretro.so`) e Web (EmulatorJS `ppsspp-wasm`).
- **Motivazione**: PPSSPP è eccezionalmente stabile, dispone di core Libretro compilati per AArch64 e x86_64, emula il firmware via HLE senza richiedere alcun file BIOS proprietario, e gira a 60 FPS stabili su Raspberry Pi 5.
- **Formati supportati**: `.cso` (consigliato per efficienza spazio), `.iso`, `.chd`, `.pbp`.

### 2. Piattaforma PS2 (PlayStation 2): **Fase 2 — Esclusivamente Native Streaming WebRTC**
- **Decisione**: Per PS2 abilitare **esclusivamente l'opzione Native Streaming** (`pcsx2_libretro.so` o `play_libretro.so` su AArch64 / x86_64). L'opzione WebAssembly (WASM `Play!`) viene completamente rimossa per PS2.
- **Motivazione**: Il core WASM per PS2 produce prestazioni inaccettabili (5–15 FPS) e causa frequenti crash per saturazione memoria nel browser; il motore nativo offre invece prestazioni nettamente superiori a 60 FPS con JIT e accelerazione hardware.
- **Requisiti BIOS**: Richiedere il caricamento di un BIOS valido (`scph39001.bin`, `scph70004.bin`) nel First-Run Setup o tramite la tab BIOS Settings.
- **Formati supportati**: `.chd` (consigliatissimo formato DVD), `.iso`, `.cso`.

### 3. Piattaforma Xbox (Microsoft Xbox Original): **Esclusione Totale**
- **Decisione**: **Esclusa totalmente** dal perimetro di HomeArcade.
- **Motivazione**: Assenza di core Libretro, assenza di porting WASM, e incompatibilità computazionale di Xemu su Raspberry Pi 5 ARM64 (< 2–3 FPS).

---

## 3. Consequences

### Vantaggi
- **Zero Debito Tecnico Fragile**: Si evita di integrare hack instabili o emulatori insostenibili per l'architettura ARM64 del Raspberry Pi 5.
- **Esperienza Utente Chiara**: L'utente sa esattamente che PSP funziona ovunque, PS2 dà il massimo in streaming e con BIOS, e Xbox non rischia di mandare in crash l'add-on su Home Assistant.
- **Espansione Immediata**: PSP e PS2 arricchiscono enormemente il catalogo giocabile di HomeArcade.

### Limiti Noti & Debito Accettato
- La disambiguazione automatica dei file `.iso` richiede che l'utente organizzi le cartelle (`rom-storage/psp/` vs `rom-storage/ps2/`) oppure che l'uploader legga la signature dell'header ISO.
- Su Raspberry Pi 5 (4 core Cortex-A76), titoli PS2 estremamente pesanti (es. *God of War*, *Gran Turismo 4*) possono mostrare frame drop e richiedere frame skipping.

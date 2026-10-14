# Piano di Lavoro: Integrazione Piattaforme PSP (Fase 1) e PS2 Native (Fase 2)

**Data**: 2026-10-13  
**Stato**: In Esecuzione — Fase 1 (PSP)  
**Riferimento**: `docs/research/2026-10-13_ps2_psp_xbox_feasibility_study.md`, `docs/adr/003-platforms-feasibility-psp-ps2-xbox.md`

---

## 1. Obiettivo

Estendere l'architettura di HomeArcade per supportare:
1. **PSP (Fase 1)**: Supporto completo Dual Engine (WebAssembly `ppsspp-wasm` e Native Streaming `ppsspp_libretro.so`), zero BIOS richiesto, formati `.cso`, `.iso`, `.chd`, `.pbp`.
2. **PS2 (Fase 2)**: Supporto **esclusivo Native Streaming WebRTC** (`pcsx2_libretro.so` o `play_libretro.so`), con rimozione del player WASM per PS2 per garantire 60 FPS ed eliminare crash di memoria nel browser; supporto BIOS obbligatorio (`scph39001.bin`, `scph70004.bin`) e formato consigliato `.chd`.
3. **Xbox**: Esclusa totalmente dal perimetro (YAGNI).

---

## 2. Scope & Non-Goals

### In Scope
- **Fase 1 (PSP)**:
  - Registrazione `ppsspp` in `ESSENTIAL_NATIVE_CORES` e `SYSTEM_TO_NATIVE_CORE`.
  - Disambiguazione estensioni nello scanner (`.cso`, `.pbp`, `.iso` in cartelle `/psp/`).
  - Layout controlli virtuali PSP (D-Pad, Stick analogico sinistro, Croce/Cerchio/Quadrato/Triangolo, L, R).
  - First-Run Setup Wizard per download automatico di `ppsspp_libretro.so`.
- **Fase 2 (PS2)**:
  - Registrazione `pcsx2` / `play` in `SYSTEM_TO_NATIVE_CORE` e `core-metadata.ts`.
  - Censimento BIOS PS2 con hash MD5 e download nel Setup Wizard.
  - Forzatura del player Native Streaming WebRTC per PS2 (`GameDetailDialog.tsx` forza `stream-player` ed elimina l'opzione WASM).
  - Disambiguazione `.iso` e `.chd` per PS2.
- **Validazione**:
  - `pnpm check`, `pnpm test`, test di regressione scanner e metadati.

### Non-Goals
- Nessun emulatore locale per Xbox (esclusa come concordato).
- Nessun player WASM per PS2 (rimosso come concordato per prestazioni e stabilità).

---

## 3. Task Checklist

### Fase 1: Integrazione PSP (PlayStation Portable)
- [x] Aggiornare `cabinet_bridge/shared/core-metadata.ts` con il core `ppsspp` in `ESSENTIAL_NATIVE_CORES` e `SYSTEM_TO_NATIVE_CORE`.
- [x] Aggiungere `".chd"` alla lista `ROM_EXTENSIONS.psp` in `cabinet_bridge/server/routes/shared.ts`.
- [x] Verificare la disambiguazione delle cartelle in `scanner.ts` affinché `.iso` dentro cartelle `/psp/` o `/playstationportable/` sia assegnato a `psp`.
- [x] Aggiungere/verificare i mapping dei controlli PSP in `ControlsSettings.tsx` e la gestione analogico/dorsali in `player.ts` e `streamPlayer.ts`.
- [x] Eseguire `pnpm check` e verificare i test unitari.

### Fase 2: Integrazione PS2 (PlayStation 2 - Esclusivo Native Streaming)
- [x] Censire i file BIOS ufficiali PS2 (`scph39001.bin`, `scph70004.bin`) in `cabinet_bridge/shared/bios-metadata.ts` con MD5 hash e URL retrobios.
- [x] Mappare `ps2: "pcsx2_libretro.so"` in `SYSTEM_TO_NATIVE_CORE` (con fallback opzionale `play_libretro.so`).
- [x] Modificare `cabinet_bridge/client/src/components/GameDetailDialog.tsx`: quando `game.system === "ps2"`, forzare automaticamente `engine = "native"` e nascondere il selettore WASM, visualizzando un badge informativo "Native WebRTC (Prestazioni massime)".
- [x] Aggiungere i controlli completi DualShock 2 (Dual Analog Stick, D-Pad, L1/L2/R1/R2) in `ControlsSettings.tsx`.
- [x] Eseguire `pnpm check` e test di regressione completi.

### Fase 3: Validazione & Test
- [x] Verificare con `pnpm check` l'assenza di errori TypeScript.
- [x] Eseguire i test unitari di regressione (`pnpm test`).
- [x] Verificare il rilevamento dei file ROM PSP/PS2 e lo scaricamento dei core via Setup Wizard.

---

## 4. Strategia di Verifica

- **Type-Check**: `cd cabinet_bridge && pnpm check`
- **Unit Test**: `cd cabinet_bridge && pnpm test`
- **Scanner Verification**: Test con file di test `.cso`, `.iso`, `.chd` simulati nelle cartelle `rom-storage/psp/` e `rom-storage/ps2/`.
- **Setup API Test**: Chiamata a `GET /api/setup/status` per verificare che i core `ppsspp` e i BIOS `ps2` siano rilevati e tracciati.

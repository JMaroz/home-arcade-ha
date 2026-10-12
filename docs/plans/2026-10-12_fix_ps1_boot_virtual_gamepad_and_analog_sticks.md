# Piano: Risoluzione Boot PS1 M3U/CHD, Input Virtual Gamepad Multi-Core, Allineamento Dorsali ZL/ZR e Stick Analogici

## Obiettivo
Risolvere i quattro problemi riscontrati dai test e dai log dell'istanza locale (`192.168.1.67`):
1. **Boot Giochi PS1 (M3U ↔ CHD)**:
   - Dai log (`pcsx_rearmed_libretro.so: Could't open '.../Ace Combat 3 - Electrosphere (USA).chd'`), i file `.m3u` puntano al nome originale mentre i file `.chd` sul disco sono stati rinominati in `${system}_${slug}_${id}.chd` (90 su 106 matchano per slug; 16 sono `.m3u` orfani di 22 byte privi di `.chd` su disco).
   - Risolvere automaticamente il mapping M3U ↔ CHD tramite slug/numero disco in `scanner.ts`, `runner-manager.ts`, `routes/roms.ts` e `cgo_session.go`, collegando `parentM3uId` (nascondendo i doppioni `.chd` grezzi) e rimuovendo/nascondendo i `.m3u` orfani privi di disco.
2. **Funzionamento Virtual Gamepad su tutti i Core (GBA, GBC, SNES, PS1, ecc.)**:
   - Abilitare il supporto completo a `RETRO_ENVIRONMENT_GET_INPUT_BITMASKS` e `RETRO_DEVICE_ID_JOYPAD_MASK` (`id == 256`) in `nanoarch.c` (dove `(buttons >> 256) & 1` azzerava tutti i tasti tranne `B` sui core come `mgba` che usano i bitmask di default, mentre `parallel_n64` funzionava perché leggeva `RETRO_DEVICE_ANALOG`).
   - Invocare `retro_set_controller_port_device(0..1, RETRO_DEVICE_JOYPAD)` in `cgo_session.go` dopo `retro_load_game`.
   - Correggere la gestione touch/pointer in `streamPlayer.ts` e il bug CSS `opacity` duplicato in `player.ts`.
3. **Allineamento Pulsanti Virtual Gamepad e Dorsali L/ZL & R/ZR**:
   - Correggere in `streamPlayer.ts` il bug CSS `.v-btn { position: absolute }` che faceva collassare `.v-menu-btns` sovrapponendo `START` sopra `SELECT`.
   - Riposizionare i pulsanti dorsali subito sopra il D-Pad (sinistra) e i tasti azione (destra), adattandoli automaticamente alla console:
     - `L` (`bit 10`) + `ZL` (`bit 12`) e `ZR` (`bit 13`) + `R` (`bit 11`) su `ps1`, `ps2`, `n64` (`Z`), `dreamcast`, `saturn`, `gc`, `arcade`.
     - Solo `L` + `R` su `gba`, `snes`, `psp`, `nds`, `3ds`.
     - Nessun dorsale su console a 2 tasti (`nes`, `gb`, `gbc`, `mastersystem`, `gamegear`, `atari2600`, ecc.).
4. **Inclusione Joystick Analogici Virtuali (Left & Right Stick)**:
   - Estendere il pacchetto binario DataChannel WebRTC da 5 a 7 byte (`[player, btn_lo, btn_hi, lx, ly, rx, ry]`) tra `streamPlayer.ts`, `main.go` e `cgo_session.go` (`input_cache_set_port` in `nanoarch.c` supporta già `lx, ly, rx, ry`).
   - Aggiungere i thumbstick analogici virtuali trascinabili (simultanei al D-Pad) sulle piattaforme supportate:
     - **Dual Stick (Left + Right Stick)**: `ps1`, `ps2`, `gc`, `n64` (Left Stick + C-Stick/Right).
     - **Single Stick (Left Stick)**: `dreamcast`, `saturn`, `psp`, `nds`, `3ds`, `arcade`, `mame`, `fbneo`.
     - **Solo D-Pad**: console 2D (`gba`, `gbc`, `gb`, `snes`, `nes`, `genesis`, ecc.).
   - Allineare il supporto analogico ed estetico anche nel fallback WASM (`player.ts`).

## Scope & Non-Goals
- **Scope**:
  - `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c` (bitmask `RETRO_DEVICE_ID_JOYPAD_MASK`, `RETRO_ENVIRONMENT_GET_INPUT_BITMASKS`).
  - `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go` (`resolveM3uFile` con fallback slug/disco, `retro_set_controller_port_device`, `SetInput` con `RightAxisX/Y`).
  - `cabinet_bridge/server/native-runner/pkg/emulator/types.go` & `main.go` (pacchetto binario 7 byte con `RightAxisX/Y` retrocompatibile a 5 byte).
  - `cabinet_bridge/server/scanner.ts`, `cabinet_bridge/server/stream/runner-manager.ts`, `cabinet_bridge/server/routes/roms.ts` (risoluzione M3U ↔ CHD tramite slug + pulizia/filtro `.m3u` orfani privi di file `.chd`).
  - `cabinet_bridge/server/routes/streamPlayer.ts` & `cabinet_bridge/server/routes/player.ts` (fix layout flex/absolute, dorsali adattivi `L/ZL/R/ZR`, thumbstick analogici virtuali Left/Right).
- **Non-Goals**:
  - Nessuna dipendenza esterna per il virtual joystick (implementazione pura Pointer Events + CSS).
  - Nessuna modifica distruttiva ai file `.chd` esistenti su disco USB.

## Task Checklist
- [x] **Task 1 (Native Input & Bitmasks)**: Aggiornare `nanoarch.c`, `types.go`, `cgo_session.go` e `main.go` per supportare `RETRO_ENVIRONMENT_GET_INPUT_BITMASKS`, `RETRO_DEVICE_ID_JOYPAD_MASK` (256), `retro_set_controller_port_device` e il secondo stick analogico (`rx, ry` a 7 byte).
- [x] **Task 2 (PS1 M3U ↔ CHD Resolution & Orphans)**: Aggiornare `cgo_session.go` (`resolveM3uFile`), `scanner.ts`, `runner-manager.ts` e `routes/roms.ts` per risolvere i riferimenti `.m3u` verso i file `${system}_${slug}_${id}.chd`, collegare `parentM3uId` per nascondere i doppioni `.chd` e rimuovere dal DB i `.m3u` orfani i cui dischi non esistono su disco.
- [x] **Task 3 (Virtual Gamepad Layout, ZL/ZR & Analog Sticks)**: Aggiornare `streamPlayer.ts` e `player.ts` correggendo la sovrapposizione `SELECT`/`START`, posizionando i dorsali contestuali (`L/ZL`, `R/ZR`) sopra i cluster laterali e aggiungendo i joystick analogici virtuali trascinabili (Left/Right Stick simultanei al D-Pad) per le piattaforme supportate.
- [x] **Task 4 (Test & Verifica)**: Aggiungere/aggiornare i test unitari Go (`native-runner`) e Vitest (`cabinet_bridge`), eseguire `go test ./...`, `pnpm check` e `pnpm test`.
- [x] **Task 5 (Handoff)**: Sovrascrivere `docs/HANDOFF.md` con lo stato aggiornato.

## Strategia di Verifica
- Test unitari Go Native Runner: `cd cabinet_bridge/server/native-runner && go test -v ./...`
- Type-check TypeScript: `cd cabinet_bridge && pnpm check`
- Test unitari Vitest: `cd cabinet_bridge && pnpm test`

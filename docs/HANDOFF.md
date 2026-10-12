# Handoff — HomeArcade HA Add-on

## Stato Corrente
- **Data**: 2026-10-12
- **Obiettivo Raggiunto**: Risolti i 4 problemi riscontrati su `192.168.1.67`:
  1. **Boot PS1 M3U ↔ CHD e Pulizia Orfani**:
     - Risoluzione automatica dei file `.m3u` verso i file rinominati `${system}_${slug}_${id}.chd` su disco sia nel runner nativo Go (`resolveM3uFile` in `cgo_session.go`) sia lato Express/SQLite (`storage.resolveM3uDiscs`, `storage.reconcileM3uPlaylists`, `scanner.ts`, `runner-manager.ts`, `routes/roms.ts`).
     - All'avvio (`index.ts`) e ad ogni scansione (`scanner.ts` / `addScannedRomsBulk`), i `.m3u` validi vengono collegati ai relativi `.chd` tramite `parentM3uId` (nascondendo i doppioni grezzi in libreria) e i `.m3u` orfani privi di disco vengono rimossi.
  2. **Virtual Gamepad Funzionante su Tutti i Core (GBA, GBC, SNES, PS1, N64, ecc.)**:
     - Abilitato `RETRO_ENVIRONMENT_GET_INPUT_BITMASKS` (51) e corretto `core_input_state_cgo` in `nanoarch.c` per restituire l'intera maschera a 16 bit quando `id == RETRO_DEVICE_ID_JOYPAD_MASK` (`256`), risolvendo il bug per cui `(buttons >> 256) & 1` azzerava tutti i tasti tranne `B` su ARM64 in core come `mgba_libretro.so`.
     - Aggiunta chiamata `retro_set_controller_port_device(0..1, RETRO_DEVICE_JOYPAD)` in `cgo_session.go` e fallback automatico da Left Stick a D-Pad digitale per i giochi che non interrogano `RETRO_DEVICE_ANALOG`.
  3. **Allineamento Pulsanti Virtual Gamepad e Dorsali L/ZL & ZR/R**:
     - Corretto `.v-btn-pill { position: relative; }` in `streamPlayer.ts` (evitando la sovrapposizione di `START` e `SELECT`) e il bug CSS `opacity` duplicato in `player.ts`.
     - Riposizionati i dorsali `L + ZL` (sinistra) e `ZR + R` (destra) sopra i cluster laterali con visibilità contestuale per piattaforma.
  4. **Joystick Analogici Virtuali (Left & Right Stick)**:
     - Esteso il protocollo binario WebRTC DataChannel da 5 a 7 byte (`[player, btn_lo, btn_hi, lx, ly, rx, ry]`, retrocompatibile a 5 byte) e aggiunti i thumbstick analogici virtuali trascinabili simultanei al D-Pad (`Left + Right Stick` su `ps1`, `ps2`, `n64`, `gc`; `Left Stick` su `dreamcast`, `saturn`, `psp`, `nds`, `3ds`, `arcade`).

## File Rilevanti
- `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c` — Supporto `RETRO_DEVICE_ID_JOYPAD_MASK` (256), `RETRO_ENVIRONMENT_GET_INPUT_BITMASKS`, fallback analogico→digitale e trigger `L2`/`R2`.
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go` — `resolveM3uFile` con fallback slug `<sys>_<slug>_<id>.chd`, `retro_set_controller_port_device`, `RightAxisX/Y`.
- `cabinet_bridge/server/native-runner/main.go` & `pkg/emulator/types.go` — Pacchetto binario DataChannel a 7 byte per dual analog stick.
- `cabinet_bridge/server/routes/utils.ts` & `cabinet_bridge/server/storage.ts` — `extractUploadedSlug`, `resolveM3uDiscs` e `reconcileM3uPlaylists`.
- `cabinet_bridge/server/scanner.ts`, `cabinet_bridge/server/stream/runner-manager.ts`, `cabinet_bridge/server/routes/roms.ts` — Filtro `.m3u` orfani e risoluzione dischi M3U.
- `cabinet_bridge/server/routes/streamPlayer.ts` & `cabinet_bridge/server/routes/player.ts` — Fix layout `SELECT`/`START`, dorsali `L/ZL/ZR/R` e thumbstick analogici virtuali.
- `docs/plans/2026-10-12_fix_ps1_boot_virtual_gamepad_and_analog_sticks.md` — Piano di lavoro completato.

## Prossimi Passi (Next Steps)
1. Effettuare il commit e il push delle modifiche per generare la nuova build dell'add-on Home Assistant.
2. Aggiornare e riavviare l'add-on sull'istanza `192.168.1.67` (la riconciliazione M3U ↔ CHD verrà eseguita automaticamente al boot).
3. Verificare dal browser/mobile l'avvio dei giochi PS1 e il nuovo controller touch (D-Pad + Stick Analogici + ZL/ZR).

## Comandi Utili
- Test Go Native Runner: `cd cabinet_bridge/server/native-runner && go test -v ./...`
- Type-check TypeScript: `cd cabinet_bridge && pnpm check`
- Unit Test Vitest: `cd cabinet_bridge && pnpm test`

# Handoff Sessione — 2026-11-06

## Stato Corrente
- Risolto alla radice l'errore `FBNeo Error: Romset is unknown` per Arcade e Neo Geo nel Native Runner WebRTC:
  - **Preservazione ZIP per Core Arcade & Neo Geo:** In `cgo_session.go`, introdotta la funzione `ShouldExtractZippedRom` che rispetta `sysInfo.block_extract`, le estensioni dichiarate dal core e il tipo di sistema (`arcade`, `neogeo`, `mame`). Gli archivi `.zip` non vengono più estratti a singoli chip in `/tmp`, passando l'archivio intatto al core per il corretto lookup del driver hardware.
  - **Isolamento Console Tradizionali:** I giochi per console domestiche/portatili (NES, SNES, N64, GBA, ecc.) continuano a essere estratti in `/tmp` come in precedenza se il core non accetta direttamente `.zip`.
  - **Sincronizzazione BIOS Neo Geo:** In `runner-manager.ts`, se il gioco è Neo Geo e `neogeo.zip` è presente nella cartella della ROM (es. su chiavetta USB), viene sincronizzato automaticamente in `/data/bios/neogeo.zip` prima del boot. `neogeo.zip` aggiunto anche a `REQUIRED_BIOS`.
  - **Supporto MAME 2003-Plus:** Aggiunto `mame2003_plus_libretro.so` a `ESSENTIAL_NATIVE_CORES` e scaricabile da `setup.ts`, con priorità o fallback per il romset `Arcade - Mame 2003 Plus` scaricato da Internet Archive.

## File Rilevanti
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Controllo `block_extract`, valid extensions e sistema; bypass di `extractZippedRom` per archivi arcade/neogeo.
- `cabinet_bridge/server/native-runner/pkg/emulator/types.go` & `session.go`: Aggiunto `SetSystem` all'interfaccia `EmulatorSession` e propagazione del sistema in sessione.
- `cabinet_bridge/server/native-runner/main.go`: Propagazione del flag `--system` alla creazione della sessione emulatore.
- `cabinet_bridge/server/native-runner/pkg/emulator/zip_test.go`: Suite di unit test table-driven per `ShouldExtractZippedRom` (console vs arcade).
- `cabinet_bridge/server/stream/runner-manager.ts`: Priorità core `mame2003_plus`/`fbneo` per `arcade` e auto-sync di `neogeo.zip` verso la directory BIOS.
- `cabinet_bridge/shared/core-metadata.ts`: Registrazione `mame2003_plus` nei core nativi essenziali.
- `cabinet_bridge/shared/bios-metadata.ts`: Registrazione `neogeo.zip` in `REQUIRED_BIOS` e tier performance per `mame2003_plus`.
- `cabinet_bridge/server/routes/setup.ts`: Supporto download e verifica di `mame2003_plus_libretro.so`.
- `cabinet_bridge/server/__tests__/setup.test.ts`: Allineamento test fixture player con `wasmMode: "fallback"`.
- `docs/plans/2026-11-06_fix_arcade_neogeo_romset_and_unzip.md`: Piano di lavoro completato e verificato.

## Prossimi Passi (Next Steps)
- Eseguire commit atomico: `fix(arcade): prevent zip extraction for arcade/neogeo and sync neogeo bios`.
- Eseguire test congiunto su Home Assistant avviando sia Metal Slug (Neo Geo) che un titolo Arcade (MAME 2003-Plus).

## Comandi Utili
- Test Unitari Go Native Runner: `cd cabinet_bridge/server/native-runner && go test -v ./pkg/emulator/...`
- Typecheck TypeScript: `cd cabinet_bridge && ./node_modules/.bin/tsc --noEmit`
- Unit Test Vitest Mirati: `cd cabinet_bridge && ./node_modules/.bin/vitest run server/__tests__/core-health.test.ts server/__tests__/setup.test.ts`
- Build Produzione: `cd cabinet_bridge && ./node_modules/.bin/tsx script/build.ts`

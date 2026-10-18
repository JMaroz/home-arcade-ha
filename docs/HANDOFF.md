# Project Handoff: Stream Player Mobile Optimizations & Settings Firmware Direct View

## Stato Corrente
- **Audio WebRTC & Resampling**: Sample rate dinamico libretro in `main.go`, libopus con Low Delay e FEC al 5% in `opus_encoder.c`, buffer audio calibrato a 40ms e video a zero-delay in `streamPlayer.ts`.
- **Controlli Touch Mobile & Menu**: `#menu-trigger` centrato in alto, blocco globale di context menu/callout, D-pad con sliding continuo multidirezionale via pointer capture in `streamPlayer.ts`.
- **Focus Modality (Touch/Mouse vs Gamepad TV)**: Rimosso focus automatico invasivo all'apertura del menu per puntatori touch/mouse; bordo e scale 104% attivi solo con gamepad (`.gamepad-nav-active`) o tastiera (`:focus-visible`).
- **Settings Firmware Tab**: Rimosso il wrapper collassabile `<Section>` in `Settings.tsx`. Aprendo la scheda "Firmware", `<BiosManager />` è ora esposto direttamente e visibile per intero senza click intermedi.
- **Verifica Empirica**:
  - `pnpm check`: 0 errori TypeScript.
  - `pnpm test client`: 4 suite passate, 25/25 test superati.
  - `go test -count=1 ./...`: 4/4 package Go superati.

## File Rilevanti
- `cabinet_bridge/client/src/pages/Settings.tsx`: Rimosso `<Section>` per visualizzazione diretta di `<BiosManager />`.
- `cabinet_bridge/server/native-runner/main.go`: Sample rate dinamico audio per core libretro.
- `cabinet_bridge/server/native-runner/pkg/audio/opus_encoder.c`: Bassa latenza e In-band FEC su libopus.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Calibrazione buffer audio/video, sliding touch D-pad, menu al centro e focus modality.
- `docs/plans/2026-10-18_expose_firmware_tab_content.md`: Piano di lavoro per l'esposizione diretta del tab firmware.
- `docs/plans/2026-10-18_fix_mobile_audio_touch_controls_and_menu_focus.md`: Piano di lavoro audio, touch e focus stream.

## Prossimi Passi (Next Steps)
1. Eseguire commit atomici delle modifiche (`fix(stream): ...` e `feat(settings): expose firmware bios manager directly without collapse`).
2. Verifica visiva sul client (scheda Settings -> Firmware) e prova di streaming su dispositivo mobile.

## Comandi Utili
- `pnpm check`: Type-check TypeScript in `cabinet_bridge/`.
- `pnpm test client`: Test unitari Vitest per il frontend.
- `go test -count=1 ./...`: Test Go nativi in `cabinet_bridge/server/native-runner/`.
- `pnpm build`: Build di produzione client e server.

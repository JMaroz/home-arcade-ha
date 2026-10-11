# Piano: Controller Overlay Virtuale & Mappatura Input N64

## Obiettivo
Fornire un controller su schermo (Touch / Virtual Gamepad) in `streamPlayer.ts` per consentire di giocare via browser su dispositivi touch (smartphone, tablet) o con click del mouse, abilitare il fallback automatico D-Pad -> Stick Analogico per i giochi 3D (N64/PS1), supportare il Controller Pak virtuale per N64 e mostrare la guida ai comandi da tastiera e gamepad.

## Scope & Non-Goals
- **Scope**:
  - Aggiungere overlay gamepad virtuale reattivo e traslucido in `streamPlayer.ts` (D-Pad, A, B, X, Y, L, R, Z, Start, Select).
  - Aggiungere pulsante `🎮 Pad` nella barra in alto per mostrare/nascondere il controller virtuale (con persistenza in `localStorage`).
  - Mappare D-Pad su Levetta Analogica in `nanoarch.c` quando non è presente un input analogico fisico.
  - Abilitare il Controller Pak virtuale (`memory`) per i core N64 (`parallel_n64`, `mupen64plus_next`) in `coreEnvironment`.
  - Aggiungere sezione guida controlli (tastiera + gamepad) nel menu di pausa in `streamPlayer.ts`.
- **Non-Goals**:
  - Nessuna dipendenza esterna o librerie terze di virtual gamepad (YAGNI, puro HTML/CSS/JS nativo).

## Task Checklist
- [x] Implementare fallback D-Pad -> Stick Analogico in `pkg/emulator/nanoarch.c`.
- [x] Configurare `parallel-n64-pak1` e `mupen64plus-pak1` su `"memory"` in `pkg/emulator/cgo_session.go`.
- [x] Aggiungere HTML/CSS e logica multi-touch del Gamepad Virtuale in `routes/streamPlayer.ts`.
- [x] Aggiungere guida controlli e toggle `🎮 Pad` in `streamPlayer.ts`.
- [x] Eseguire test unitari Go (`go test -v ./...`) e test Vitest (`pnpm test`).
- [x] Aggiornare `docs/HANDOFF.md`.

## Strategia di Verifica
- Test Go: `cd cabinet_bridge/server/native-runner && go test -v ./...`
- Test Vitest: `cd cabinet_bridge && pnpm test`
- Verifica manuale browser con toggle controller e pressione tasto Start.

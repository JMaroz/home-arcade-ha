# Piano di Lavoro: Navigazione Menu TV con Gamepad, Salvataggi e Ottimizzazione Polling

Data: 2026-10-17
Task: `tv_gamepad_menu_and_saving`

## Obiettivo
Abilitare l'utilizzo completo del menu in-game da TV tramite Gamepad (D-Pad, levette analogiche, tasti A/B), garantire la persistenza dei salvataggi (Auto-Save su disconnessione / uscita) ed eliminare il traffico di polling inutile rilevato nei log.

## Scope & Non-Goals
- **In Scope**:
  - Hotkey gamepad per aprire/chiudere il menu di gioco in `streamPlayer.ts` (`Select + Start`, `Guide/Home` button 16, o `L3 + R3`).
  - Navigazione spaziale D-Pad (Up, Down, Left, Right) e levetta analogica sinistra con focus visibile ad alto contrasto (10-foot TV).
  - Tasto A (button 0) per conferma/click e Tasto B (button 1) per ritorno/chiusura menu.
  - Inibizione dell'invio comandi al gioco (DataChannel) mentre il menu o i sottomenu (slot, co-op, telemetria) sono aperti.
  - Salvataggio automatico (Auto-Save) alla disconnessione / chiusura scheda (`beforeunload`, `connectionstatechange`).
  - Ottimizzazione polling `/api/stream/peers/:sessionId` in `streamPlayer.ts` (solo a telemetria aperta).
  - Prompt dedicato per il fix del polling incontrollato dell'app su `/api/archive/downloads`.
- **Non-Goals (YAGNI)**:
  - Riscrivere l'intero frontend React con librerie pesanti esterne (es. Norigin). Usiamo Vanilla JS leggero e nativo in `streamPlayer.ts`.

## Task Checklist
- [x] Creare il piano di lavoro e verificare l'ambiente git pulito.
- [x] Implementare in `streamPlayer.ts`:
  - [x] Hotkey gamepad per aprire/chiudere il menu in-game (`Select + Start`, `Guide`, `L3 + R3`).
  - [x] Blocco invio input gameplay a menu aperto.
  - [x] Sistema di navigazione spaziale D-Pad e tasti A/B per tutti i modal (`menuOverlay`, `slotsOverlay`, `telemetryOverlay`, `coopOverlay`).
  - [x] Focus ring ad alta visibilità (bordo rosa neon + glow) per schermi TV.
  - [x] Auto-save su disconnessione / uscita (`onbeforeunload`, `connectionstatechange`).
  - [x] Ottimizzazione polling `peers` a telemetria chiusa.
- [x] Verificare persistenza salvataggi nel runner nativo / `runner-manager.ts`.
- [x] Validare TypeScript e test (`pnpm check`, `pnpm test`).
- [x] Preparare il prompt per la correzione del polling in `GlobalDownloadBanner.tsx`.
- [x] Aggiornare `docs/HANDOFF.md` e spuntare la checklist.

## Strategia di Verifica
1. `pnpm check` (verifica tipi TypeScript).
2. `pnpm test` (unit test Vitest).
3. Test simulazione input Gamepad e apertura menu.

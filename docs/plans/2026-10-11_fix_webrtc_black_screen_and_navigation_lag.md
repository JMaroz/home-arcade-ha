# Plan: Fix WebRTC Black Screen & App Navigation Performance

**Data**: 2026-10-11
**Obiettivo**: Risolvere la causa radice dello schermo nero all'avvio dei giochi (WebRTC) e i rallentamenti/lag dell'app durante la navigazione tra le sezioni e portali di gioco.

## Scope & Non-Goals
- **In Scope**:
  - Correggere `streamPlayer.ts`: aggregazione corretta delle tracce `video` e `audio` in `pc.ontrack`, autoplay handling, rilevamento video stream assente/zero-bitrate con banner/fallback immediato a 1 click su WebAssembly (EmulatorJS).
  - Correggere `GameDetailDialog.tsx`: default sicuro a WebAssembly (`wasm`), etichettare chiaramente `Native (Beta Preview)` e non bloccare tutti i lanci futuri su Native se il server/runner non invia video.
  - Ottimizzare `HomeArcadeTheme.tsx`:
    - Aggiungere `loading="lazy"` e `decoding="async"` a tutte le immagini delle copertine dei giochi per eliminare l'ondata di centinaia di richieste HTTP simultanee all'apertura del portale (es. PS1 con 450 giochi).
    - Windowing/batching del rendering dei giochi (es. renderizzare un lotto iniziale di 48 giochi ed espandere allo scroll, invece di montare 500+ nodi contemporaneamente).
    - Ottimizzare la transizione del fanart di sfondo per non ricalcolare blur pesanti su ogni cambio rapido di focus.
    - Sostituire animazioni Framer Motion pesanti per-card con transizioni CSS native dove opportuno.
  - Ottimizzare `scanner.ts`: allentare il polling di background da 60s a 300s (5 minuti) per eliminare l'I/O thrashing continuo sui dischi USB/NAS durante l'uso dell'app.
- **Non-Goals**:
  - Non riscrivere il motore Cgo Libretro in Go in questo task (richiede toolchain C cross-compilata e compilazione nativa ARM64 per Raspberry Pi).

## Task Checklist
- [x] Creare il piano di lavoro in `docs/plans/2026-10-11_fix_webrtc_black_screen_and_navigation_lag.md`
- [x] Ottimizzare `HomeArcadeTheme.tsx` (lazy image loading, windowed list/batching, lightweight transitions)
- [x] Ottimizzare `scanner.ts` (POLL_INTERVAL_MS a 300_000 ms)
- [x] Correggere `streamPlayer.ts` (`pc.ontrack` track accumulation, fallback WebAssembly banner e rilevamento zero video)
- [x] Aggiornare `GameDetailDialog.tsx` (default sicuro a WebAssembly, etichettatura chiara di Native Beta)
- [x] Eseguire `pnpm check` e `pnpm test` da `cabinet_bridge/`
- [x] Aggiornare `docs/HANDOFF.md`

## Strategia di Verifica
1. `pnpm check` (Type-check TypeScript senza errori).
2. `pnpm test` (Tutti i test unitari passano).
3. Verifica manuale logica stream player e batch rendering.

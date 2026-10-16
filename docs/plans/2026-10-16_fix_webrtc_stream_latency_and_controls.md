# Piano di Fix: Latenza WebRTC, Sincronizzazione Audio/Video e Controlli Virtuali Coerenti

## Obiettivo
Eliminare il ritardo di ~500ms nei comandi e i cali di frame durante la ripetizione dei tasti nel Native Runner WebRTC, ripristinando una giocabilità fluida a 60 FPS a bassissima latenza (sub-30ms) su PS1 e tutte le piattaforme. Rendere i comandi a schermo (pulsanti d-pad / action buttons / dorsali) contestualizzati e coerenti con la console emulata (simboli PlayStation per PS1/PS2/PSP, layout 2 tasti per NES/GB/GBA, 3 tasti per Genesis, ecc.).

## Scope & Non-Goals
- **In Scope**:
  - WebRTC jitter buffer & playout delay minimization: `playoutDelayHint = 0`, `jitterBufferTarget = 0`.
  - Disaccoppiamento stream ID audio/video (`homearcade-video` vs `homearcade-audio`) per impedire che l'A/V sync di Chromium blocchi/bufferizzi i frame video durante underflow o silenzio audio.
  - Correzione timer ciclo nativo in Go: divisione intera errata `1000/60 = 16ms` (62.5 FPS) sostituita con `time.Second / time.Duration(fps)` (60.0 FPS esatti) per evitare drift e svuotamento continuo del buffer audio.
  - Reset di `analog_polled[port]` in `nanoarch.c` a ogni frame/poll per evitare che il fallback D-pad/analogico rimanga bloccato.
  - Prevenzione del layout thrashing e scroll browser/iframe su ripetizione tasti (`e.preventDefault()` sui tasti mappati in `keydown`).
  - Ottimizzazione invio DataChannel: invio differenziale con deduplicazione (solo su variazione stato o heartbeat periodico) per evitare accodamento SCTP e congestione.
  - Layout e styling dinamico del virtual controller a schermo: mapping e labeling specifico per piattaforma (PS1/PS2/PSP con △, ◯, ✕, ▢ e L1/L2/R1/R2; NES/GB/GBC con solo B/A; GBA con B/A/L/R; Genesis con A/B/C; SNES standard).
- **Non-Goals**:
  - Riscrivere l'encoder VP8 o Opus (sono già performanti in C nativo).
  - Modificare il motore WebAssembly / EmulatorJS (il problema risiede nel native streaming player).

## Task Checklist
- [x] **Task 1: WebRTC Jitter Buffer & Playout Delay Optimization (`streamPlayer.ts`)**
  - [x] Aggiungere `receiver.playoutDelayHint = 0` e `jitterBufferTarget = 0` in `pc.ontrack` e al completamento della negoziazione.
  - [x] Verificare che il video venga riprodotto in modalità real-time non bufferizzata.
- [x] **Task 2: Disaccoppiamento Stream ID WebRTC (`native-runner/main.go`)**
  - [x] Assegnare stream ID distinti alle tracce video (`homearcade-video`) e audio (`homearcade-audio`) per eliminare la dipendenza da lip-sync bloccante in Chromium/WebKit.
  - [x] Garantire che l'accumulatore audio non causi buchi temporali o desync dopo pause/caricamenti.
- [x] **Task 3: Correzione Frame Timing e Drift FPS (`native-runner/main.go`, `vpx.go`)**
  - [x] Sostituire `time.Duration(1000/fps) * time.Millisecond` con `time.Second / time.Duration(fps)` nel ticker di emulazione e nella durata dei campioni VP8.
  - [x] Verificare che il clock a 60 FPS corrisponda esattamente a 60 Hz senza drenare il buffer audio 44.1kHz.
- [x] **Task 4: Reset Input Cache & Fallback Polling (`nanoarch.c`)**
  - [x] Resettare `input_cache.analog_polled[port] = 0` all'inizio di ogni frame e in `input_cache_set_port`.
- [x] **Task 5: Fix Drop Frame da Ripetizione Tasti & Throttling DataChannel (`streamPlayer.ts`)**
  - [x] Invocare `e.preventDefault()` su tutti i tasti intercettati dal gamepad virtuale/mappati per evitare tentativi di scroll del browser/iframe parent in Home Assistant.
  - [x] Inviare i pacchetti DataChannel solo su cambio di stato effettivo (maschera o assi modificati) o a intervallo di heartbeat (100ms), controllando `dataChannel.bufferedAmount`.
- [x] **Task 6: Virtual Controller Specifico per Piattaforma (`streamPlayer.ts`)**
  - [x] PS1 / PS2 / PSP: Simboli geometrici colorati (△ verde in alto, ◯ rosso a destra, ✕ blu in basso, ▢ rosa a sinistra) e dorsali `L1`, `L2`, `R1`, `R2`.
  - [x] NES / GB / GBC: Solo due tasti frontali (`B` e `A`), nascondendo `X` e `Y` e le spalle.
  - [x] GBA: Solo `B`, `A` e dorsali `L`, `R`.
  - [x] Genesis / Mega Drive: Tasti `A`, `B`, `C`.
  - [x] SNES / Altri: Layout a quattro tasti Nintendo `Y`, `X`, `B`, `A`.
- [x] **Task 7: Test di regressione e verifica typecheck**
  - [x] Eseguire `pnpm check` per validare TypeScript.
  - [x] Eseguire test mirati per stream/runner.

## Strategia di Verifica
1. **Type Check**: `pnpm check` in `cabinet_bridge/`.
2. **Ispezione codice**: Controllo dei selettori DOM, delle etichette tasti per `system = "ps1"`, del ticker di Go e delle impostazioni WebRTC.
3. **Analisi Log**: Verificare che le statistiche di frame video e audio avanzino sincrone a 60 FPS senza stalli o dilatazioni del buffer.

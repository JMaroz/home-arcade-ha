# Piano di Lavoro: Fix Audio WebRTC, D-Pad Virtuale e Focus Menu Mobile/PC

**Data:** 2026-10-18  
**Stato:** In Pianificazione  
**File coinvolti:**
- `cabinet_bridge/server/routes/streamPlayer.ts`
- `cabinet_bridge/server/native-runner/main.go`
- `cabinet_bridge/server/native-runner/pkg/audio/opus_encoder.c`
- `cabinet_bridge/server/native-runner/pkg/audio/resampler.go`
- `cabinet_bridge/server/native-runner/pkg/emulator/session.go`

---

## Obiettivo
Risolvere i tre problemi riscontrati durante il gameplay da smartphone e PC:
1. **Audio a scatti e drop di frame:** eliminare lo stuttering audio WebRTC calibrando il jitter buffer (evitando target 0 su audio), correggendo il resampler Go con la reale frequenza di campionamento del core (GBA 65536Hz, N64 32040Hz, PS1 44100Hz) e configurando Opus in modalità low-delay con FEC.
2. **D-pad virtuale e focus "Menu" con apertura toast Copia/Selezione:** posizionare il pulsante Menu in alto al centro (lontano dalla zona di presa dei pollici), disabilitare globalmente `contextmenu`, `-webkit-touch-callout` e `user-select`, e implementare lo sliding continuo sul D-pad virtuale.
3. **Focus evidenziato non necessario all'apertura del menu:** mostrare l'outline di focus rosa e il ridimensionamento solo durante la navigazione con Gamepad fisico (modalità TV/Couch) o `:focus-visible` da tastiera, rimuovendolo completamente quando si apre o naviga il menu da touch o mouse (telefono/PC).

---

## Scope & Non-Goals
- **In Scope:**
  - Aggiornamento della pagina HTML/JS `renderStreamPlayerPage` in `streamPlayer.ts`.
  - Correzione in `main.go` dell'inizializzazione di `AudioBufferAccumulator` con `geom.SampleRate`.
  - Ottimizzazione libopus C in `opus_encoder.c` (`OPUS_APPLICATION_RESTRICTED_LOWDELAY`, `OPUS_SET_INBAND_FEC`).
  - Separazione tra `applyZeroDelay` video (playout 0) e audio (gestione jitter buffer NetEQ con safety margin).
  - Test unitari Go e TypeScript per garantire regression-free.
- **Non-Goals (YAGNI):**
  - Riscrivere l'intero frontend React (il player streaming è un template HTML standalone ad altissime prestazioni per iframe HA).
  - Aggiungere configurazioni audio complesse nelle impostazioni utente (risoluzione root-cause trasparente).

---

## Task Checklist

### Fase 1: Audio Pipeline & WebRTC Resilience
- [x] In `cabinet_bridge/server/native-runner/main.go`, inizializzare `audioAccumulator` usando la reale frequenza del core `geom.SampleRate` restituita da `emuSession.GetGeometry()` invece di 44100 hardcoded.
- [x] In `cabinet_bridge/server/native-runner/pkg/audio/opus_encoder.c`, impostare `OPUS_APPLICATION_RESTRICTED_LOWDELAY` e abilitare FEC (`OPUS_SET_INBAND_FEC(1)`, `OPUS_SET_PACKET_LOSS_PERC(5)`).
- [x] In `cabinet_bridge/server/routes/streamPlayer.ts`, separare `applyZeroDelay`:
  - Per il video receiver: mantenere `playoutDelayHint = 0` e `jitterBufferTarget = 0`.
  - Per l'audio receiver: NON azzerare il jitter buffer (`jitterBufferTarget = 0.04` per assorbire jitter Wi-Fi e sfasamenti senza buffer starvation/crackling).

### Fase 2: Touch Controls, Prevenzione Context Menu & Riposizionamento Menu
- [x] In `cabinet_bridge/server/routes/streamPlayer.ts`, aggiungere regole CSS globali anti-selezione (`user-select: none !important; -webkit-touch-callout: none !important; -webkit-user-select: none !important; touch-action: none;`).
- [x] Aggiungere `window.addEventListener("contextmenu", (e) => e.preventDefault());` per impedire l'apertura del menu nativo Android/iOS "Copia / Seleziona tutto".
- [x] Riposizionare `#menu-trigger` in alto al centro (`left: 50%; transform: translateX(-50%); top: max(10px, env(safe-area-inset-top));`) per liberare completamente l'angolo superiore sinistro dal pollice del giocatore.
- [x] Implementare lo sliding touch sul container `.v-dpad` per permettere cambi di direzione fluidi (4 direzioni + diagonali) senza dover sollevare il dito.

### Fase 3: Modality Focus Management (Touch/Mouse vs Gamepad)
- [x] In `cabinet_bridge/server/routes/streamPlayer.ts`, limitare l'evidenziazione invasiva `.btn:focus` a `.btn:focus-visible` e `.gamepad-nav-active .btn:focus`.
- [x] Modificare `openModal(modal)` per evitare `preferred.focus()` visibile quando il modal è aperto da click del mouse o tocco su schermo.
- [x] Attivare `.gamepad-nav-active` esclusivamente quando l'utente interagisce tramite Gamepad fisico (D-Pad, Stick, o Select+Start) o frecce tastiera, garantendo la navigazione TV senza disturbare la fruizione su smartphone o mouse PC.

### Fase 4: Verifica Empirica & Regression Testing
- [x] Eseguire `go test ./...` in `cabinet_bridge/server/native-runner`.
- [x] Eseguire `pnpm check` (TypeScript compilation).
- [x] Eseguire `pnpm test client`.
- [x] Aggiornare `docs/HANDOFF.md`.

---

## Strategia di Verifica
- **Build & Types:** `pnpm check` deve restituire exit code 0.
- **Go Suite:** `go test ./...` deve passare al 100%.
- **Client Tests:** `pnpm test client` deve passare 25/25.
- **Ispezione codice:** verificare che nessuna selezione testo o focus ring appaia su click/touch.

# Piano di Lavoro: Ripristino Statistiche di Gioco e Potenziamento Automazioni Home Assistant

**Data**: 2026-10-18  
**Stato**: Pronto per esecuzione  
**Autore**: Antigravity  

---

## 1. Obiettivo
Risolvere la causa radice per cui le statistiche di gioco restano permanentemente a zero (0 min, 0 sessioni) e riprogettare l'integrazione con Home Assistant affinché lo stato del cabinato, i sensori e le automazioni vengano attivati correttamente e in modo resiliente durante le sessioni di gioco (sia WASM che Native Streaming).

---

## 2. Root Cause Analysis
1. **Mancata invocazione del tracciamento di sessione**:
   - L'endpoint `POST /api/roms/:id/play-session` esiste in `cabinet_bridge/server/routes/profiles.ts`, ma nessun componente (player WASM `player.ts`, native-runner `streamPlayer.ts`, né UI client) lo chiama mai all'avvio o alla chiusura del gioco. La tabella SQLite `play_sessions` rimane a 0 righe e `minutes_played` delle ROM non viene mai incrementato.
2. **Ingress Path & URL Resolution in `PlayStats.tsx`**:
   - `PlayStats.tsx` effettua un `fetch("/api/sessions")` senza prefisso `apiUrl()`, fallendo quando eseguito all'interno dell'iframe Ingress di Home Assistant.
3. **Discrepanza di schema Drizzle vs Client**:
   - `play_sessions` in Drizzle ORM espone le proprietà `romTitle` e `romSystem`. `PlayStats.tsx` legge invece `s.title` e `s.system`, risultando in valori `undefined`.
4. **Endpoint `POST /api/roms/exit` mancante**:
   - In `NowPlayingBar.tsx` il pulsante di uscita tenta di invocare `POST /api/roms/exit`, che non è registrato sul server Express, fallendo e lasciando lo stato `nowPlayingRom` orfano.
5. **Configurazione Home Assistant Add-on incompleta**:
   - In `config.yaml` è presente solo `hassio_api: true`, mentre la specifica Home Assistant richiede `homeassistant_api: true` per autorizzare il container a dialogare con la REST API di Home Assistant Core (`/api/states/...`).
   - In `haPublisher.ts`, la URL del proxy Supervisor è configurata su `http://supervisor/homeassistant` anziché `http://supervisor/core`, generando richieste 404/403 verso il Core.
   - Le funzioni di notifica entità `publishGameStarted` e `publishGameEnded` non venivano mai attivate.

---

## 3. Scope & Non-Goals
- **In Scope**:
  - Tracciamento centralizzato lato server per avvio e chiusura sessioni (WASM + Native Streaming).
  - Meccanismo di sicurezza con timeout a 30 minuti per ripulire sessioni zombie orfane.
  - Implementazione dell'endpoint `POST /api/roms/exit` e chiusura ordinata al cambio/uscita gioco.
  - Aggiornamento di `config.yaml` con `homeassistant_api: true`.
  - Correzione dell'URL del proxy in `haPublisher.ts` (`http://supervisor/core`).
  - Arricchimento degli attributi pubblicati su Home Assistant (console, durata, artwork URL, eventi `homearcade_game_started`/`ended`).
  - Aggiornamento e potenziamento della pagina `AutomationsSettings.tsx` con nuovi esempi di automazioni (scene RGB dinamiche per console, commutazione TV HDMI, alert durata).
  - Riprogettazione della UI `PlayStats.tsx` (Total Play Time, Sessions, Giochi Unici, Durata Media, barre Top Systems/Top Games, timeline sessioni recenti).
  - Test automatici e verifica statica con `pnpm check` e test client.
- **Non-Goals**:
  - Creazione di una nuova integrazione HACS personalizzata (l'add-on dialoga nativamente via Supervisor Core REST API come progettato).
  - Polling intensivo dal browser (adottato approccio centralizzato lato server su richiesta esplicita).

---

## 4. Task Checklist

### Fase 1: Motore Sessioni & Backend Storage
- [x] Implementare la gestione centralizzata della sessione di gioco in `server/routes/shared.ts` e `server/routes/profiles.ts` o servizio dedicato:
  - Registrazione sessione su avvio gioco (`POST /api/roms/:id/play-session` con `event: "started"`).
  - Chiusura sessione (`event: "ended"` o `POST /api/roms/exit`).
  - Calcolo durata esatta e incremento di `uploadedRoms.minutesPlayed`.
  - Timeout di sicurezza a 30 minuti per auto-chiusura di sessioni inattive.
- [x] Implementare `POST /api/roms/exit` sul server per consentire l'uscita pulita da `NowPlayingBar` e dai player.
- [x] Collegare l'avvio e la chiusura della sessione sia in:
  - WASM player (`cabinet_bridge/server/routes/player.ts` su `window.EJS_onGameStart` e pulsante exit/pagehide beacon).
  - Streaming player (`cabinet_bridge/server/routes/stream.ts` / `runner-manager.ts` su `startSession` e `stopSession`).
- [x] Unificare e correggere `GET /api/sessions`: restituire oggetti normalizzati contenenti sia `romTitle`/`title` che `romSystem`/`system`.

### Fase 2: Connessione Home Assistant & Automations
- [x] Aggiungere `homeassistant_api: true` in `cabinet_bridge/config.yaml`.
- [x] Aggiornare `cabinet_bridge/server/haPublisher.ts`:
  - Correggere `getBaseUrl()` su `http://supervisor/core`.
  - Assicurare che `publishGameStarted` e `publishGameEnded` inviino attributi completi (artUrl, console, durata in minuti, timestamp).
  - Inviare gli eventi HA `homearcade_game_started` e `homearcade_game_ended`.
- [x] Aggiornare `cabinet_bridge/client/src/pages/settings/AutomationsSettings.tsx`:
  - Test ping funzionante con feedback chiaro.
  - Nuovi modelli YAML di automazioni (luci RGB basate su console, TV HDMI input, alert tempo di gioco).

### Fase 3: Frontend Stats Dashboard
- [x] Aggiornare `cabinet_bridge/client/src/components/PlayStats.tsx`:
  - Utilizzare `apiUrl("/api/sessions")` e `apiUrl("/api/stats/summary")`.
  - Risolvere il mapping di `romTitle` e `romSystem`.
  - Mostrare metriche arricchite: Total Play Time, Total Sessions, Unique Games, Average Duration, barre di avanzamento per Top Systems e Top Games, lista dettagliata delle sessioni recenti.

### Fase 4: Verifica Empirica & Documentazione
- [x] Eseguire `pnpm check` (Type-check TypeScript).
- [x] Eseguire la suite di test client e server con `pnpm test client` e `pnpm vitest run server/__tests__/gameSession.test.ts`.
- [x] Aggiornare `docs/HANDOFF.md` sovrascrivendolo completamente secondo le linee guida.

---

## 5. Strategia di Verifica
1. **Type-checking**: `pnpm check` da terminale per escludere qualsiasi regressione TypeScript.
2. **Test Unitari**: `pnpm test client` per verificare la logica dei componenti e utility.
3. **Simulazione Flusso API**:
   - Avvio sessione tramite API -> verifica creazione record in `play_sessions` e `nowPlayingRom`.
   - Chiusura sessione -> verifica popolamento `durationSeconds`, aggiornamento `minutesPlayed` e chiamata a `haPublisher`.
   - Verifica risposta di `/api/sessions` e `/api/stats/summary`.
4. **Verifica Configurazione Add-on**:
   - Controllo formale di `config.yaml` per confermare `homeassistant_api: true`.

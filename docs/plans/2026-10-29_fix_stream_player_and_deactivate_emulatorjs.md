# Piano di Lavoro: Ripristino Streaming Nativo WebRTC e Disattivazione EmulatorJS

- **Data**: 2026-10-29
- **Stato**: Completato (Verificato con Type check, Vitest e Build)
- **Obiettivo**: Risolvere il mancato avvio dei giochi, eliminare l'errore 403 Forbidden sui percorsi ROM esterni, rimuovere il loop del pulsante "Passa a WebAssembly" e disattivare EmulatorJS impostando lo Streaming Nativo WebRTC (Go + Libretro) come motore primario ed esclusivo a 60 FPS.

---

## 1. Analisi del Log & Root Cause

Dal log `/Users/andrea/Downloads/f5e1d3f5_cabinet_bridge_2026-10-29T20-55-20.027Z.log`:
1. **Lock-in su EmulatorJS**: Il commit `c51529a` ha impostato `wasmMode: "always"` come default. Il client indirizzava forzatamente tutti i lanci verso `/api/roms/:id/player` (EmulatorJS).
2. **Errore 403 Forbidden su disco USB**: Alla riga 1651 del log, EmulatorJS tenta `GET /api/roms/843/file/...` ma `safeRoots` in `routes/roms.ts:970` controllava solo `ROM_ROOT` e `watchPaths`, escludendo `settings.defaultRomDirectory` (`/media/usb-JMicron_Tech.../Roms`). La richiesta veniva respinta con 403 e il gioco non caricava.
3. **Loop "Mostra lo stesso contenuto"**: Il pulsante "Passa a WebAssembly" in `streamPlayer.ts` punta a `/api/roms/:id/player?engine=wasm`. Con la ROM bloccata in 403, EmulatorJS fallisce e reindirizza alla pagina di partenza (`returnTo`), creando l'effetto di ricaricare sempre la stessa pagina.
4. **WebRTC watchdog prematuro**: Il timeout di 4 secondi in `streamPlayer.ts` uccideva il runner Go nativo (`/api/stream/stop`) prima che finisse di caricare l'immagine CD da disco esterno.

---

## 2. Scope & Non-Goals

- **In Scope**:
  - Impostare `wasmMode` predefinito su `"disabled"` (Streaming Nativo puro, zero EmulatorJS).
  - Reindirizzamento trasparente 302 da `/api/roms/:id/player` verso `/api/roms/:id/stream-player` quando `wasmMode === "disabled"`.
  - Inclusione di `settings.defaultRomDirectory` in `safeRoots` di `server/routes/roms.ts`.
  - Rimozione banner e pulsanti di fallback verso EmulatorJS in `streamPlayer.ts`.
  - Rimozione watchdog distruttivo a 4 secondi in `streamPlayer.ts` con incremento a 15s non distruttivo.
  - Aggiornamento testi impostazioni in `DisplaySettings.tsx`.
  - Aggiornamento test unitari e sovrascrittura di `docs/HANDOFF.md`.
- **Non-Goals**:
  - Non cancellare fisicamente i file statici di EmulatorJS (rimangono come asset statici isolati se un domani servisse una retrocompatibilità di emergenza).

---

## 3. Task Checklist

- [x] **Fase 1: Schema & Valori Predefiniti**
  - [x] Cambiare `wasmMode` default da `"always"` a `"disabled"` in `cabinet_bridge/shared/schema.ts`.
  - [x] Cambiare `defaultConfig.wasmMode` in `cabinet_bridge/client/src/lib/integration.tsx`.
  - [x] Aggiornare `cabinet_bridge/shared/__tests__/schema.test.ts`.

- [x] **Fase 2: Interfaccia Utente & Impostazioni**
  - [x] Aggiornare `DisplaySettings.tsx` con testi chiari per lo Streaming Nativo e la disattivazione di EmulatorJS.
  - [x] Blindare `GameDetailDialog.tsx` per garantire che con `wasmMode: "disabled"` il target sia sempre lo stream nativo (`/api/roms/:id/stream-player`).

- [x] **Fase 3: Server Routes & Fix 403**
  - [x] In `cabinet_bridge/server/routes/roms.ts`, aggiungere `settings.defaultRomDirectory` a `safeRoots` in `/api/roms/:id/file/:filename`.
  - [x] In `cabinet_bridge/server/routes/roms.ts`, implementare redirect 302 a `stream-player` in `/api/roms/:id/player` se `wasmMode === "disabled"`.

- [x] **Fase 4: Stream Player Hardening**
  - [x] In `cabinet_bridge/server/routes/streamPlayer.ts`, sopprimere banner e pulsanti fallback quando `wasmMode === "disabled"`.
  - [x] Rimuovere l'arresto forzato della sessione dopo 4 secondi e portare il watchdog a 15s con retry manuale.

- [x] **Fase 5: Verifica & Handoff**
  - [x] Eseguire `pnpm check`.
  - [x] Eseguire test mirati Vitest (`schema.test.ts`, `core-health.test.ts`).
  - [x] Eseguire `pnpm build`.
  - [x] Sovrascrivere `docs/HANDOFF.md`.

---

## 4. Strategia di Verifica

```bash
cd cabinet_bridge && pnpm check
cd cabinet_bridge && npx vitest run shared/__tests__/schema.test.ts server/__tests__/core-health.test.ts
cd cabinet_bridge && pnpm build
```

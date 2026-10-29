# Handoff Sessione — 2026-10-29

## Stato Corrente
- Risolto alla radice il problema del mancato avvio dei giochi e completata la disattivazione di EmulatorJS in favore dello Streaming Nativo WebRTC (Go + Libretro cgo a 60 FPS):
  - **Streaming Nativo WebRTC Predefinito:** `wasmMode` impostato di default su `"disabled"` nello schema Zod (`shared/schema.ts`), in `integration.tsx` e nel dialog di lancio (`GameDetailDialog.tsx`).
  - **Disattivazione Completa EmulatorJS:** Reindirizzamento trasparente HTTP 302 in `/api/roms/:id/player` verso `/api/roms/:id/stream-player` quando `wasmMode === "disabled"`, eliminando l'uso di EmulatorJS.
  - **Fix Root-Cause 403 Forbidden su Drive Esterni:** Inclusa `settings.defaultRomDirectory` nella lista `safeRoots` di `server/routes/roms.ts:970`, consentendo l'accesso legittimo alle ROM situate su drive USB (`/media/...`) o cartelle Samba.
  - **Hardening Stream Player & Rimozione Watchdog Prematuro:** Eliminato il timer da 4.0 secondi che uccideva la sessione e tentava il fallback forzato; sostituito con tolleranza estesa a 15 secondi non distruttiva e soppressione di tutti i banner/link a EmulatorJS quando disattivato.
  - **UX Impostazioni Aggiornata:** `DisplaySettings.tsx` riflette chiaramente lo Streaming Nativo come opzione primaria consigliata a 60 FPS con EmulatorJS disattivato.

## File Rilevanti
- `cabinet_bridge/shared/schema.ts` & `shared/__tests__/schema.test.ts`: Default `wasmMode: "disabled"`.
- `cabinet_bridge/client/src/lib/integration.tsx` & `GameDetailDialog.tsx`: Default lancio su Streaming Nativo (`fallback=0`).
- `cabinet_bridge/client/src/pages/settings/DisplaySettings.tsx`: Opzioni interfaccia con Streaming Nativo primario e disattivazione EmulatorJS.
- `cabinet_bridge/server/routes/roms.ts`: Aggiunta `defaultRomDirectory` a `safeRoots` (fix 403) e redirect 302 a `stream-player`.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Default `wasmMode: "disabled"`, rimozione banner e watchdog 15s non distruttivo.
- `cabinet_bridge/server/__tests__/core-health.test.ts` & `stream.test.ts`: Test allineati alle nuove opzioni di fallback.
- `docs/plans/2026-10-29_fix_stream_player_and_deactivate_emulatorjs.md`: Piano operativo completato.

## Prossimi Passi (Next Steps)
- Eseguire commit atomico e push: `fix(stream): prioritize native runner, fix 403 on external drives and deactivate emulatorjs`.
- Verificare sul campo l'avvio immediato dei titoli PS1 e GBA su Raspberry Pi.

## Comandi Utili
- Type-check TypeScript: `cd cabinet_bridge && pnpm check`
- Unit test mirati: `cd cabinet_bridge && npx vitest run shared/__tests__/schema.test.ts server/__tests__/core-health.test.ts`
- Build produzione: `cd cabinet_bridge && pnpm build`

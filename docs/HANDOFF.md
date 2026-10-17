# Project Handoff: TV Gamepad Navigation, Auto-Save & Download Polling Optimization

## Stato Corrente
- **In-Game Menu su TV via Gamepad**: Aggiunta la rilevazione universale della combo controller (`Select + Start`, `Guide / Home` button 16, o `L3 + R3`) in `streamPlayer.ts` per aprire e chiudere il menu in-game senza richiedere tastiera o mouse.
- **Navigazione Spaziale D-Pad & Focus Trap**: Quando un modal (`menuOverlay`, `slotsOverlay`, `telemetryOverlay`, `coopOverlay`) è aperto, i comandi del gamepad vengono inibiti verso l'emulatore (neutral input). Navigazione tra elementi con D-Pad e levetta analogica sinistra (algoritmo geometrico 2D nearest-neighbor), conferma con Tasto A e chiusura con Tasto B.
- **Auto-Save su Disconnessione / Uscita**: Salvataggio automatico persistente nello Slot 0 (`fetch(..., { keepalive: true })`) su `beforeunload`, `visibilitychange` hidden, disconnessione WebRTC o click su "Exit Game".
- **Ottimizzazione Polling Archive Downloads**: In `GlobalDownloadBanner.tsx`, sostituito il polling incondizionato a 1500ms con una funzione callback su `useQuery`. Quando ci sono job attivi (`downloading`, `extracting`, `indexing`, `pending`), l'intervallo è impostato a 1500ms; quando non ci sono job attivi o la lista è vuota, il polling si disattiva (`false`). Quando un nuovo download viene avviato, l'invalidazione della query riavvia immediatamente il polling automatico.
- **Verifica Empirica**:
  - `pnpm check`: 0 errori TypeScript.
  - `pnpm vitest run client/`: 4 suite superate, 25 test passati al 100%.

## File Rilevanti
- `cabinet_bridge/client/src/components/GlobalDownloadBanner.tsx`: Callback condizionale `refetchInterval` ed esportazione `getDownloadRefetchInterval`.
- `cabinet_bridge/client/src/__tests__/globalDownloadBanner.test.ts`: Test unitari per il calcolo dell'intervallo di refetch in base allo stato dei job.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Focus styling TV, hotkey gamepad, navigazione spaziale D-Pad, inibizione gameplay input a menu aperto, auto-save persistente e throttling polling peers.
- `docs/HANDOFF.md`: Snapshot istantaneo del progetto aggiornato.

## Prossimi Passi (Next Steps)
1. Eseguire commit atomico su `home-arcade-ha` (`perf(client): optimize archive downloads query polling in GlobalDownloadBanner`).
2. Procedere con l'implementazione del piano Android TV in `home-arcade-tv` (icona, caroselli per piattaforma, dettagli gioco e fix focus player).

## Comandi Utili
- `pnpm check`: Type-check TypeScript in `cabinet_bridge`.
- `pnpm vitest run client/`: Esecuzione test unitari client.
- `pnpm build`: Build di produzione bundle client e server.

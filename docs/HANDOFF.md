# Handoff Sessione: WebRTC Player UI Cleanup, Architettura Save/Load, Backup HA/Cloud & Unificazione Co-Op

**Data**: 2026-10-16  
**Stato**: Completato e Validato (100% Test Passati: 22/22 suite Vitest, 147 test, Go tests 100%, Type-check 0 errori, Build OK)

---

### Stato Corrente
- **UI WebRTC Player & Scroll Mobile**: Rimossi i pulsanti ridondanti dalla barra superiore (`Pad`, `Co-Op`, `Stats`), lasciando solo `Menu` e il badge FPS/RTT. Aggiunto scroll touch verticale (`overflow-y: auto`, `overscroll-behavior: contain`, safe-area insets) su tutti i modali HUD per schermi smartphone portrait/landscape.
- **Architettura Universale Save/Load**: Implementate le API Cgo Libretro `retro_serialize` / `retro_unserialize` protette da mutex nel runner nativo Go (`/save`, `/load`) e integrate in Express (`/api/stream/:sessionId/save`, `/load`, `/slots`).
- **Salvataggi Home Assistant (`/share`)**: Percorso salvataggi impostato su `/share/homearcade/saves/` quando montato da Home Assistant (incluso in automatico nei backup completi HA e accessibile da Samba SMB), con fallback locale a `save-backups`.
- **Integrazione Cloud OneDrive & Google Drive**: Creato modulo `onedrive.ts` con Microsoft Graph API (OAuth2 refresh token, upload, download, test, sync bidirezionale) e aggiunta scheda di configurazione OneDrive in `ServicesSettings.tsx`.
- **Unificazione Co-Op**: WebRTC Single-Host Fan-out Co-Op confermata come architettura di riferimento (zero desync, zero download ROM per l'ospite, 60 FPS 3D, QR code immediato). Aggiunto banner promozionale e avvio WebRTC Co-Op in `NetplayLobbyDialog.tsx`.
- **DoD Validata**: Go tests (100% pass), `pnpm check` (0 errori), Vitest (22 file, 147 test passati), `pnpm build` (bundle completato).

---

### File Rilevanti
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go` & `main.go`: Serializzazione/deserializzazione atomica Libretro ed endpoint HTTP `/save` e `/load`.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Pulizia top bar, scroll touch modali, Quick Save, Quick Load, modale Gestione Slot 0-4, telemetria e Co-Op nel menu.
- `cabinet_bridge/server/stream/runner-manager.ts` & `server/routes/stream.ts`: Metodi `saveState`, `loadState`, `getSlots` e relative rotte Express.
- `cabinet_bridge/server/routes/shared.ts`: Risoluzione cartella `SAVE_BACKUP_DIR` prioritizzando `/share/homearcade/saves`.
- `cabinet_bridge/server/onedrive.ts` & `server/routes/vault.ts`: Modulo Microsoft Graph e rotte `/api/vault/onedrive-test` e `/onedrive-sync`.
- `cabinet_bridge/client/src/pages/settings/ServicesSettings.tsx`: Sezione OneDrive con credenziali, switch sync, test connessione e sync manuale.
- `cabinet_bridge/client/src/components/NetplayLobbyDialog.tsx`: Banner e avvio rapido WebRTC Stream Co-Op.
- `cabinet_bridge/server/__tests__/stream.test.ts`: Test di regressione per top-bar pulita, save/load/slots e scroll overlay.

---

### Prossimi Passi (Next Steps)
1. **Commit & Push**: Creare commit atomico Conventional Commits (`feat(stream): clean up webrtc toolbar, add libretro save/load states, ha share backup, onedrive sync and stream coop`) e sincronizzare su `main`.
2. **Test E2E su Dispositivo Mobile**: Lanciare un gioco in streaming WebRTC da smartphone per testare lo scorrimento del menu, il salvataggio rapido (Slot 0), la gestione slot 0-4 e la scansione del QR code Co-Op da un secondo telefono.

---

### Comandi Utili
- `cd cabinet_bridge/server/native-runner && go test -v ./...`: Test suite Go runner nativo (save/load, encoder, m3u).
- `cd cabinet_bridge && pnpm check`: Type-check TypeScript (0 errori).
- `cd cabinet_bridge && pnpm test`: Esecuzione test suite Vitest (22 file, 147 test passati).
- `cd cabinet_bridge && pnpm run build`: Build di produzione (Vite + esbuild).

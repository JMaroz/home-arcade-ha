# Piano di Lavoro: WebRTC UI Cleanup, Architettura Universale Save/Load, Backup HA/Cloud & Unificazione Co-Op

## Obiettivo Generale
Completare l'ecosistema del player e della gestione di gioco di HomeArcade per il rilascio ufficiale dell'add-on Home Assistant, articolato in 4 macro-aree:
1. **UI & Usabilità WebRTC Player**: Rimozione controlli ridondanti dalla barra superiore (`Pad`, `Co-Op`, `Stats`), scroll touch fluido per smartphone (portrait e landscape) su tutti i modali HUD.
2. **Architettura Universale Save/Load (Save States & SRAM)**: Implementazione nel runner nativo Go/Cgo delle funzioni universali Libretro `retro_serialize`/`retro_unserialize`, con integrazione REST Express e controlli nel menu di pausa (Quick Save, Quick Load, Gestione Slot 0-4).
3. **Revisione Gestione Salvataggi (Home Assistant & Cloud)**:
   - Salvataggi posizionati di default su `/share/homearcade/saves/`: inclusi automaticamente nei backup di sistema di Home Assistant e accessibili via Samba/SMB share da PC/Mac/Steam Deck.
   - Supporto **OneDrive** (Microsoft Graph API) e **Google Drive** per il cloud sync bidirezionale automatico dei salvataggi.
   - Download esportazione ZIP e ripristino upload ZIP dei salvataggi accessibile sia dalle impostazioni sia dal player.
4. **Revisione e Unificazione Co-Op (WebRTC vs Netplay WASM)**:
   - Analisi comparativa approfondita e convergenza sulla tecnologia migliore: il **WebRTC Single-Host Fan-out Co-Op** (zero desync, zero download ROM per l'ospite, supporto 60 FPS su PS1/N64/Dreamcast, QR code per secondo giocatore da smartphone).
   - Unificazione dell'avvio multiplayer da Home (`GameDetailDialog.tsx`) e gestione in-game.

---

## Analisi Comparativa & Decisioni Tecniche

### 1. Dove posizionare i salvataggi in Home Assistant?
- **Analisi**: Gli add-on di Home Assistant montano `/share:rw`. Quando l'utente esegue un backup completo (Full Backup) di Home Assistant, il sistema include sempre la cartella `/share`. Se memorizziamo i salvataggi in `/share/homearcade/saves/`:
  - **Backup automatico HA**: Qualsiasi backup programmato di Home Assistant salverà tutti gli `.state` e `.srm`.
  - **Accessibilità Samba**: L'utente può aprire `\\homeassistant\share\homearcade\saves` dal PC e spostare i salvataggi su RetroArch, Anbernic, Steam Deck o viceversa.
  - **Fallback resiliente**: Se l'add-on gira fuori da HA (es. dev environment locale), fa fallback automatico su `/data/save-backups`.

### 2. Backup Cloud: OneDrive, Google Drive & ZIP Export/Import
- **Google Drive**: Già strutturato (`google-drive.ts`), sincronizza i file `.state` tramite le API v3.
- **OneDrive**: Implementazione del modulo `onedrive.ts` basato su Microsoft Graph REST API:
  - Refresh token OAuth2 tramite `https://login.microsoftonline.com/common/oauth2/v2.0/token`.
  - Upload file save states in `/me/drive/root:/HomeArcade_Saves/${filename}:/content`.
  - Download e verifica timestamp.
- **Archivio ZIP**: Gli endpoint `/api/vault/saves-export` e `/api/vault/saves-import` sono già presenti nel backend; verranno collegati e verificati con la nuova cartella `/share/homearcade/saves/`.

### 3. Co-Op WebRTC vs Netplay WASM: Qual è migliore e perché?
| Caratteristica | Netplay Tradizionale (WASM / EmulatorJS) | WebRTC Stream Co-Op (Native Runner) |
| :--- | :--- | :--- |
| **Download ROM per Player 2** | **Obbligatorio** (Player 2 deve scaricare l'intera ROM) | **Nessuno** (Player 2 riceve solo il video WebRTC) |
| **Sincronizzazione / Desync** | **Rischio elevato di desync** (due emulatori separati su due browser diversi) | **Zero desync matematico** (un solo emulatore gira sul server) |
| **Prestazioni su Mobile / 3D** | Spesso a scatti su smartphone per PS1, N64, Dreamcast | **60 FPS stabili** (anche su smartphone entry-level) |
| **Accesso Giocatore 2** | Codice stanza complesso e attesa nel lobby | **QR Code istantaneo** (il secondo giocatore gioca subito dal telefono) |
| **Latenza** | Dipende dal lockstep e dal browser più lento | **Minima** (< 15-20 ms via WebRTC UDP DataChannel) |

**Verdetto**: Il **WebRTC Stream Co-Op è di gran lunga la soluzione superiore** e più adatta a un rilascio moderno in cloud gaming. L'esperienza da `GameDetailDialog` verrà allineata per avviare direttamente la sessione Co-Op con QR code e link di condivisione immediato.

---

## Scope & Non-Goals
- **In Scope**:
  - `cabinet_bridge/server/routes/streamPlayer.ts`: rimozione pulsanti top-bar, scroll touch mobile, comandi Save/Load, Statistiche, Co-Op.
  - `cabinet_bridge/server/routes/shared.ts` e `data-dir.ts`: configurazione cartella salvataggi predefinita `/share/homearcade/saves/` con fallback `/data/save-backups`.
  - `cabinet_bridge/server/native-runner/`: implementazione Libretro Cgo `Serialize()`/`Unserialize()` e rotte HTTP `/save` e `/load`.
  - `cabinet_bridge/server/stream/runner-manager.ts` & `routes/stream.ts`: endpoint `/api/stream/:sessionId/save/:slot` e `/load/:slot`.
  - `cabinet_bridge/server/onedrive.ts` & `routes/vault.ts`: integrazione OneDrive Graph API e sincronizzazione salvataggi.
  - `cabinet_bridge/shared/schema.ts` e `client/src/pages/settings/LibrarySettings.tsx`: configurazione credenziali OneDrive e opzioni di sincronizzazione.
  - `cabinet_bridge/client/src/components/GameDetailDialog.tsx`: avvio unificato Co-Op WebRTC con QR code.
- **Non-Goals**:
  - Non riscrivere il core di EmulatorJS WASM (rimane disponibile come fallback legacy).

---

## Task Checklist

### Fase 1: Pulizia Top-Bar & Scroll Mobile (`streamPlayer.ts`)
- [x] Rimuovere `#pad-trigger`, `#coop-trigger`, `#hud-trigger` dall'HTML.
- [x] Pulire relative regole CSS di posizionamento orizzontale.
- [x] Configurare `.hud-overlay` con `overflow-y: auto`, `box-sizing: border-box`, safe-area insets.
- [x] Configurare `.hud-card` con `margin: auto`, `max-height: min(90vh, calc(100dvh - 32px))`, `overflow-y: auto`, `-webkit-overflow-scrolling: touch`, `overscroll-behavior: contain`.
- [x] Aggiungere nel menu di pausa il pulsante `#btn-open-telemetry-menu` ("📊 Statistiche di Streaming & Telemetria").

### Fase 2: Architettura Universale Save/Load nel Runner Nativo
- [x] In `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`:
  - Caricare i simboli Libretro `retro_serialize_size`, `retro_serialize`, `retro_unserialize`.
  - Implementare `Serialize() ([]byte, error)` e `Unserialize(data []byte) error` su thread di emulazione.
- [x] In `cabinet_bridge/server/native-runner/main.go`:
  - Registrare gli endpoint HTTP `/save` e `/load` invocabili da Express.
- [x] Test unitari Go: verificare il corretto ciclo di serializzazione/deserializzazione.

### Fase 3: Cartella Salvataggi Home Assistant & Endpoint Express
- [x] In `cabinet_bridge/server/routes/shared.ts`:
  - Risolvere `SAVE_BACKUP_DIR`: verificare se `/share` esiste ed è scrivibile -> `/share/homearcade/saves`, altrimenti fallback a `dataPath("save-backups")`.
- [x] In `cabinet_bridge/server/stream/runner-manager.ts`:
  - Implementare `saveSessionState(sessionId, slot)` e `loadSessionState(sessionId, slot)`.
  - Salvataggio del file binario `slot-<slot>.state` in `SAVE_BACKUP_DIR` e aggiornamento `romSaveSlots` in SQLite.
- [x] In `cabinet_bridge/server/routes/stream.ts`:
  - Esporre `POST /api/stream/:sessionId/save/:slot`
  - Esporre `POST /api/stream/:sessionId/load/:slot`
  - Esporre `GET /api/stream/:sessionId/slots`

### Fase 4: Integrazione OneDrive, Google Drive & Export/Import ZIP
- [x] Creare `cabinet_bridge/server/onedrive.ts`:
  - Gestione token refresh OAuth2 (`login.microsoftonline.com`).
  - Funzioni `uploadToOneDrive(localPath, remoteName)` e `downloadFromOneDrive(remoteName, localPath)`.
  - Test di connessione `testOneDriveConnection()`.
- [x] In `cabinet_bridge/shared/schema.ts`:
  - Aggiungere campi OneDrive in `integrationSettingsSchema`: `oneDriveClientId`, `oneDriveClientSecret`, `oneDriveRefreshToken`, `oneDriveSyncEnabled`.
- [x] In `cabinet_bridge/server/routes/vault.ts`:
  - Endpoint `/api/vault/onedrive-test` e `/api/vault/onedrive-sync`.
  - Verifica degli endpoint ZIP `/api/vault/saves-export` e `/api/vault/saves-import` con la nuova cartella salvataggi `/share`.
- [x] In `cabinet_bridge/client/src/pages/settings/ServicesSettings.tsx`:
  - Aggiungere la sezione di configurazione OneDrive accanto a Google Drive e WebDAV.

### Fase 5: Unificazione Co-Op & Controlli nel Player WebRTC
- [x] In `streamPlayer.ts`:
  - Aggiungere al Menu di Pausa:
    - `💾 Salva Stato Rapido (Slot 0)`
    - `📂 Carica Stato Rapido (Slot 0)`
    - `🗂️ Gestisci Slot di Salvataggio...` (modale slot 0..4 con data/ora e bottoni Salva/Carica)
    - `👥 Invita Giocatore 2 (Co-Op Cloud & Couch)` (apre modale con QR code e link rapido)
  - Toast non invasivo di conferma salvataggio/caricamento.
- [x] In `NetplayLobbyDialog.tsx`:
  - Banner consigliato "WebRTC Stream Co-Op (Consigliato)" con avvio istantaneo host e condivisione QR code/link.

### Fase 6: Verifica Empirica, Test & Handoff
- [x] Eseguire `cd cabinet_bridge/server/native-runner && go test -v ./...`.
- [x] Eseguire `pnpm vitest run server/__tests__/stream.test.ts`.
- [x] Eseguire `pnpm check`.
- [x] Eseguire `pnpm build`.
- [ ] Aggiornare `docs/HANDOFF.md` (sovrascrittura totale, sintesi 30-60 righe).

---

## Strategia di Verifica
```bash
# Test Unitari Go (Runner e Cgo Session)
cd cabinet_bridge/server/native-runner && go test -v ./...

# Test Vitest (Routes Stream, Save/Load, Vault)
cd ../.. && pnpm vitest run server/__tests__/stream.test.ts

# TypeScript Check
pnpm check

# Production Build Client & Server
pnpm build
```

# Handoff Sessione: WebRTC Real VP8 (libvpx) & Zipped ROMs Extraction

**Data**: 2026-10-11  
**Stato**: Risolta la causa radice del caricamento fallito delle ROM (`retro_load_game` returned false): le ROM nella libreria HA sono archivi `.zip`, che i core Libretro nativi non decomprimono. Implementata estrazione automatica e isolata in directory temporanea tramite `archive/zip` stdlib Go con selezione del file primario, pulizia atomica a fine sessione, encoder VP8 Cgo `libvpx` e bump versione add-on a `2.57.1`.

---

## 1. Stato Corrente & Risoluzione Radice
- **Root-Cause Caricamento ROM**: Le ROM della libreria (es. ROM 251 `007 The World Is Not Enough`) risiedono compresse in `.zip`. I core Libretro ufficiali si aspettano il file reale uncompressed (`.z64`, `.sfc`, `.cue`/`.bin`), fallendo su byte `PK\x03\x04` e ricadendo in sessione standalone fittizia.
- **Estrazione Trasparente `.zip` (`cgo_session.go`)**:
  - Funzione `extractZippedRom` stdlib con protezione anti-zip-slip.
  - Scoring intelligente dei file interni (`.m3u` > `.cue` > estensioni valide fornite da `retro_get_system_info` > file più grande).
  - Gestione duale: `need_fullpath` (file path su disco) vs in-memory buffer (`gi.data`), con callback `cleanup` per `os.RemoveAll` alla chiusura.
  - Supporto per `CABINET_DATA_DIR` in `GET_SYSTEM_DIRECTORY` (`bios`) e `GET_SAVE_DIRECTORY` (`saves`).
- **Encoder VP8 Nativo `libvpx`**: Cgo real-time (`g_lag_in_frames=0`, `cpu-used=8`) e rimozione delle 60+ librerie GStreamer dal Dockerfile in favore di `libvpx7`.
- **Version Bump**: Incrementata versione a `2.57.1` in `config.yaml` e `package.json` per scatenare la notifica di aggiornamento in Home Assistant Supervisor.

---

## 2. File Rilevanti
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Estrazione ROM `.zip`, query `retro_get_system_info`, caricamento core e pulizia temp.
- `cabinet_bridge/server/native-runner/pkg/emulator/zip_test.go`: Unit test per l'estrazione e il filtraggio dei file zip.
- `cabinet_bridge/server/native-runner/pkg/emulator/session.go`: Fix import `log` e logging trasparente su caricamento Cgo.
- `cabinet_bridge/config.yaml` & `package.json`: Version bump a 2.57.1.
- `docs/plans/2026-10-11_webrtc_engine_root_cause_and_redesign_strategy.md`: Piano aggiornato.

---

## 3. Prossimi Passi (Next Steps)
1. **Push su GitHub (`main`)**: Eseguire commit e push atomico delle modifiche.
2. **Aggiornamento Add-on su Home Assistant**: Andare su *Impostazioni -> Componenti aggiuntivi -> HomeArcade*, cliccare su *Cerca aggiornamenti* (o *Ricostruisci*) per avviare il container `2.57.1`.
3. **Validazione Empirica Player WebRTC**: Avviare ROM 251 o qualsiasi gioco in modalità WebRTC e verificare l'avvio a 60 FPS con audio Opus e controlli reattivi.

---

## 4. Comandi Utili
```bash
# Esecuzione test unitari Go (emulator, libvpx, audio)
cd cabinet_bridge/server/native-runner && go test -v -count=1 ./...

# Validazione TypeScript e test Vitest
cd cabinet_bridge && pnpm check && pnpm test
```

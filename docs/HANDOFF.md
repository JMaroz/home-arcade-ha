# Handoff Sessione: WebRTC Streaming Fix (Cgo Pointer Panic & Host Network)

**Data**: 2026-10-11  
**Stato**: Risolti i due problemi bloccanti del motore WebRTC identificati dai log di runtime (`cgo argument has Go pointer to unpinned Go pointer` e freeze della negoziazione ICE in `connecting`).

---

## 1. Stato Corrente & Risultato
- **Cgo Pointer Panic risolto**: Sostituita l'allocazione Go-pointer non-pinned di `struct retro_game_info` con `bridge_load_game` in C (`nanoarch.c`), che alloca la struct sullo stack C. I giochi su disco (`.chd`, `.iso`, `.cue`, `.m3u`, `.pbp`, `.cso`) e ROM > 16MB usano caricamento diretto via path (`need_fullpath`, zero memory spike). I file piccoli sono allocati sull'heap C con `C.CBytes`.
- **ICE Candidate Routing corretto**: In `runner-manager.ts:getHostIp()`, filtrati gli IP interni dei bridge Docker (`172.16.0.0/12`) e link-local (`169.254.0.0/16`), esponendo l'IP LAN reale ai client WebRTC.
- **Home Assistant Host Network**: Abilitato `host_network: true` in `cabinet_bridge/config.yaml` e rimossi `ports`/`network` per conformità alle policy linter di Home Assistant e consentire la ricezione diretta del traffico UDP WebRTC.
- **Verifica DoD**: Tutti i test e build superati con successo (`go test` 4/4 pkg ok, `pnpm check` ok, `pnpm test` 120/120 ok, `pnpm build` ok).

---

## 2. File Rilevanti
- `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.h` & `nanoarch.c`: Funzione ponte `bridge_load_game` con struct C sicura.
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Gestione path-based per disk/large ROMs e `C.CBytes` per piccoli file.
- `cabinet_bridge/server/stream/runner-manager.ts`: Filtro subnet Docker bridge per rilevamento corretto IP host LAN.
- `cabinet_bridge/config.yaml`: Abilitazione `host_network: true` e rimozione `ports`/`ports_description`.
- `cabinet_bridge/translations/en.yaml`: Rimozione sezione `network` orfana per compatibilità linter HA.
- `docs/plans/2026-10-11_webrtc_engine_root_cause_and_redesign_strategy.md`: Piano aggiornato con i task di runtime completati.

---

## 3. Prossimi Passi (Next Steps)
1. **Push & Deploy Release**:
   - Effettuare commit e push del fix su `main`.
   - Verificare il workflow di build CI e il rilascio su GHCR.
2. **Test End-to-End su Home Assistant**:
   - Aggiornare l'add-on su Home Assistant OS e avviare un gioco via WebRTC (es. PS1/CHD o SNES).
   - Verificare nei log l'assenza di panic cgo e la transizione dello stato ICE a `connected`.
   - Confermare ricezione video fluido a 60 FPS e audio Opus nel browser.

---

## 4. Comandi Utili
```bash
# Eseguire test Go del native-runner
cd cabinet_bridge/server/native-runner && go test -v -count=1 ./...

# Typecheck e test applicativi
cd cabinet_bridge && pnpm check && pnpm test

# Build di produzione
cd cabinet_bridge && pnpm build
```

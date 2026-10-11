# Handoff Sessione: Controller Overlay Virtuale & Mappatura Input N64

**Data**: 2026-10-11  
**Stato**: Flusso WebRTC nativo funzionante su Home Assistant (Raspberry Pi). Gamepad virtuale universale (tutti i sistemi Libretro) con auto-hide intelligente al rilevamento di controller fisici/remoti (Bluetooth/USB) e auto-restore alla disconnessione.

---

## 1. Stato Corrente
- **Supporto Multi-Sistema (Tutti i Core)**:
  - Mappatura standard universale **Libretro RetroPad** a 16 bit: NES, SNES, GBA, Genesis/Mega Drive, PS1, N64, Arcade/MAME, Neo Geo, ecc.
  - Fallback D-Pad -> Levetta Analogica per giochi 3D (N64/PS1) e auto-rilevamento Memory Pak (`pak1 = memory`).
- **Auto-Hide & Auto-Restore Gamepad Fisici**:
  - `gamepadconnected` / primo input fisico: nasconde automaticamente il virtual pad e mostra toast non invasivo (`🎮 [Nome] connesso`).
  - `gamepaddisconnected`: se non rimangono controller e ci si trova su un dispositivo touch, il virtual pad viene ripristinato automaticamente.
  - Possibilità di forzare la visualizzazione manuale in qualsiasi momento tramite il toggle `🎮 Pad`.
- **Pulizia Repository**:
  - Dev server locale su `localhost:5001` fermato, binari e cartelle di test rimosse.

---

## 2. File Rilevanti
- `cabinet_bridge/server/routes/streamPlayer.ts`: Toast gamepad, auto-hide/restore su eventi gamepad e primo input, overlay touch HTML/CSS/JS e legenda comandi.
- `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c`: Fallback D-Pad digitale -> stick analogico per 3D games.
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Emulazione Controller Pak (`memory`) per N64.
- `docs/plans/2026-10-11_touch_controller_overlay_and_n64_controls.md`: Piano operativo completato.

---

## 3. Prossimi Passi (Next Steps)
1. **Commit & Push su `main`**:
   - Creare commit convenzionale (`feat(stream): auto-hide touch overlay on gamepad connection and multi-system support`).
   - Pushare su `origin main` per avviare il workflow di build Docker.
2. **Aggiornamento Add-on su Home Assistant**:
   - In Home Assistant -> Componenti aggiuntivi -> Raccolta -> Controlla aggiornamenti -> **Aggiorna/Ricostruisci** HomeArcade.
3. **Verifica Operativa**:
   - Connettere un controller Bluetooth/USB su PC o smartphone: verificare scomparsa del virtual pad e comparsa del toast verde.

---

## 4. Comandi Utili
```bash
# Esecuzione test unitari Go
cd cabinet_bridge/server/native-runner && go test -v ./...

# Typecheck, test e build cabinet_bridge
cd cabinet_bridge && pnpm check && pnpm test && pnpm build
```

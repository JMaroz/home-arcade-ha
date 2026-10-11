# Handoff Sessione: Controller Overlay Virtuale & Mappatura Input N64

**Data**: 2026-10-11  
**Stato**: Flusso WebRTC nativo funzionante su Home Assistant (Raspberry Pi). Aggiunto controller virtuale touch su schermo in `streamPlayer.ts`, emulazione Controller Pak (`memory`) per N64 e fallback automatico D-Pad -> Levetta Analogica per giochi 3D (N64/PS1).

---

## 1. Stato Corrente
- **Streaming WebRTC**: Flusso funzionante a 58-60 FPS con ~17ms RTT su Raspberry Pi.
- **Controller Virtuale Touch**:
  - Aggiunto overlay multi-touch traslucido su schermo (D-Pad, A, B, X, Y, L, R, Z, Start, Select) con gestione Pointer Events nativa (`pointerdown`, `pointerup`, `setPointerCapture`).
  - Toggle `🎮 Pad` nella barra superiore e nel menu di pausa con persistenza `localStorage` e auto-abilitazione su dispositivi touch.
- **Input N64 & 3D Games**:
  - In `nanoarch.c`: D-Pad digitale mappato automaticamente sullo stick analogico quando non vi è asse analogico fisico.
  - In `cgo_session.go`: risposto a `RETRO_ENVIRONMENT_GET_VARIABLE` per `parallel-n64-pak1` e `mupen64plus-pak1` con valore `"memory"` (simula Controller Pak inserito).
- **Legenda Controlli**:
  - Aggiunto promemoria comandi (Enter=Start, Frecce=D-Pad/Stick, X/K=A, Z/J=B, S/I=X, A/U=Y, Q/W=L/R) nel menu di gioco.
- **Pulizia**: Fermato dev server locale, eliminati binari e directory core temporanee, aggiornato `.gitignore`.

---

## 2. File Rilevanti
- `cabinet_bridge/server/routes/streamPlayer.ts`: Overlay touch HTML/CSS/JS, toggle virtual pad, estensione pollInput con `virtualButtonsMask` e legenda tastiera/gamepad.
- `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c`: Fallback da D-Pad digitale a levetta analogica per `RETRO_DEVICE_INDEX_ANALOG_LEFT`.
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Risposta variabile per Memory Pak N64.
- `.gitignore`: Esclusione binari compilati e cartella `cores/` runtime.
- `docs/plans/2026-10-11_touch_controller_overlay_and_n64_controls.md`: Piano operativo completato.

---

## 3. Prossimi Passi (Next Steps)
1. **Commit & Push su `main`**:
   - Creare commit convenzionale (`feat(stream): add touch virtual gamepad and n64 controller pak emulation`).
   - Pushare su `origin main` per generare la nuova release e scatenare la build Docker multi-arch su GitHub Actions.
2. **Aggiornamento Add-on su Home Assistant**:
   - In Home Assistant -> Componenti aggiuntivi -> Raccolta -> Controlla aggiornamenti -> **Aggiorna/Ricostruisci** HomeArcade.
3. **Verifica Operativa**:
   - Aprire lo stream player su tablet/smartphone o browser desktop.
   - Verificare che il prompt N64 non richieda più il Controller Pak e che sia possibile premere Start per proseguire direttamente con il gioco.

---

## 4. Comandi Utili
```bash
# Esecuzione test unitari Go
cd cabinet_bridge/server/native-runner && go test -v ./...

# Typecheck, test e build cabinet_bridge
cd cabinet_bridge && pnpm check && pnpm test && pnpm build
```

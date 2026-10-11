# Handoff Sessione: Risoluzione Deadlock Cgo Mutex e Schermo Nero WebRTC

**Data**: 2026-10-11  
**Stato**: Identificata empiricamente la causa radice del congelamento all'avvio dell'emulazione (`retro_init` / `Load`) e durante il rendering dei frame (`retro_run` / `Step`): deadlock ricorsivo e tra thread sul mutex Go `s.mu` (non rientrante). Riorganizzata la sincronizzazione con mutex separati, gestito l'unpacking di stride/pitch e supportato il formato colore `0RGB1555`.

---

## 1. Stato Corrente & Causa Radice
- **Causa Radice Isolata dai Log Live**:
  - `s.Load()` acquisiva `s.mu.Lock()` invocando `retro_init` / `retro_load_game`, che a sua volta scatenava `coreEnvironment(SET_PIXEL_FORMAT)` che invocava `s.mu.Lock()` sullo stesso goroutine, congelando il processo all'infinito.
  - `s.Step()` acquisiva `s.mu.Lock()` mentre attendeva il pthread worker `run_loop`, il quale invocava `coreVideoRefresh` che tentava di acquisire lo stesso `s.mu.Lock()`, creando un cross-thread deadlock permanente.
- **Risoluzione Implementata**:
  - `cgo_session.go`: Rimosso lock da `Load()`, separati `stateMu` (stato/lifecycle), `frameMu` (framebuffer e geometria) e `audioMu` (audio PCM). `Step()` non trattiene mutex durante `C.same_thread(fn)`.
  - In `coreVideoRefresh`: scompattamento riga per riga quando `pitch != width * bytesPerPixel`.
  - In `coreLog`: corretto il filtro log (`level < RETRO_LOG_INFO`) per non sopprimere WARN ed ERROR.
  - In `nanoarch.c`: collegato `RETRO_ENVIRONMENT_GET_LOG_INTERFACE` e `RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE`; migliorata la terminazione con `pthread_join`.
  - In `pkg/encoder/yuv.go`: implementato convertitore BT.601 per `PixelFormat0RGB1555` con test unitario dedicato.

---

## 2. File Rilevanti
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Sincronizzazione non bloccante e rimozione deadlock ricorsivo.
- `cabinet_bridge/server/native-runner/pkg/emulator/nanoarch.c`: Logging e A/V enable callbacks, pthread lifecycle pulito.
- `cabinet_bridge/server/native-runner/pkg/encoder/yuv.go`: Supporto `PixelFormat0RGB1555`.
- `cabinet_bridge/server/native-runner/pkg/encoder/yuv_test.go`: Test unitario per `PixelFormat0RGB1555`.
- `docs/plans/2026-10-11_fix_cgo_mutex_deadlock_and_black_screen.md`: Piano operativo completato.

---

## 3. Prossimi Passi (Next Steps)
1. **Commit & Push su `main`**:
   - Eseguire commit convenzionale (`fix(stream): eliminate recursive cgo mutex deadlock in retro_init and step`).
   - Pushare su GitHub per scatenare la build Docker automatica o rilasciare la nuova versione.
2. **Aggiornamento Add-on su Home Assistant**:
   - In Home Assistant -> Componenti aggiuntivi -> Raccolta -> Controlla aggiornamenti -> **Aggiorna/Ricostruisci** HomeArcade.
3. **Verifica Empirica**:
   - Avviare il gioco da `http://192.168.1.67:8123/.../stream-player` e verificare che i log in `http://192.168.1.67:5000/api/stream/debug` mostrino `[runner:stream] Stats @ 60 frames: ... KB`.

---

## 4. Comandi Utili
```bash
# Esecuzione test unitari Go
cd cabinet_bridge/server/native-runner && go test -v ./...

# Typecheck e test cabinet_bridge
cd cabinet_bridge && pnpm check && pnpm test
```

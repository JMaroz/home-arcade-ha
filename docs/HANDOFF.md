# Handoff Sessione: WebRTC Real VP8 Encoder (libvpx Cgo) & Live Instance Debug

**Data**: 2026-10-11  
**Stato**: Effettuato debug in tempo reale su Chromium contro l'istanza Home Assistant live (`192.168.1.67:5000`). Connessione WebRTC riuscita (ICE connected, RTT 3ms, DataChannel P1 aperto), ma isolata la causa esatta dello schermo nero: i frame inviati erano stub incompleti di 10 byte o scartati dalla pipeline. Sostituito GStreamer con encoder Cgo nativo `libvpx` (`vpx.c`/`vpx.go`) con supporto per risoluzioni dinamiche dei core e formati I420.

---

## 1. Stato Corrente & Risoluzione Radice
- **Diagnosi Empirica Live (Chromium Headless)**:
  - Il PeerConnection stabiliva la connessione (`connected`) e riceveva i track `video` e `audio`.
  - Tuttavia, `videoReadyState` rimaneva bloccato a `0` (`HAVE_NOTHING`): Chromium scartava il flusso perché non conteneva partizioni VP8 decodificabili (solo 10 byte di header stub).
- **Encoder Cgo Nativo `libvpx`**:
  - Implementato `vpx.c`, `vpx.h`, `vpx.go` con `vpx_codec_encode` in modalità `VPX_DL_REALTIME`, `g_lag_in_frames=0` (zero delay) e `cpu-used=8`.
  - Supporto risoluzioni dinamiche: rileva le dimensioni native del core Libretro (es. GBA 240x160, SNES 256x224, PS1 320x240) e aggiorna i piani I420 al volo.
  - Corretto il calcolo del pitch e bytes-per-pixel in `cgo_session.go:coreVideoRefresh` per formati RGB565 e XRGB8888.
- **Semplificazione Architetturale Docker**:
  - Eliminata la complessa catena di dipendenze GStreamer (60+ librerie).
  - Aggiunti `libvpx-dev` nello stadio di compilazione e `libvpx7` nell'immagine runtime Debian.
- **Verifica DoD**:
  - Test unitario `TestVpxVideoEncoder_RealFrameEncode` superato con frame reali di 6,162 byte e sync code standard `0x9D, 0x01, 0x2A`.
  - Suite completa: `go test` (4/4 package OK), `pnpm check` (0 errori), `pnpm test` (120/120 OK), `pnpm build` (OK).

---

## 2. File Rilevanti
- `cabinet_bridge/server/native-runner/pkg/encoder/vpx.h` & `vpx.c`: Wrapper C per `libvpx` VP8 real-time encoder.
- `cabinet_bridge/server/native-runner/pkg/encoder/vpx.go`: Binding Cgo per la conversione YUV420p e pacchettizzazione VP8.
- `cabinet_bridge/server/native-runner/pkg/encoder/encoder.go`: Interfaccia `VideoEncoder` aggiornata con dimensioni dinamiche.
- `cabinet_bridge/server/native-runner/main.go`: Passaggio della geometria reale del core a `videoEncoder.Encode`.
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go`: Calcolo esatto dei byte di frame in base al pitch.
- `cabinet_bridge/Dockerfile`: Migrazione dipendenze da GStreamer a `libvpx7`.

---

## 3. Prossimi Passi (Next Steps)
1. **Push su GitHub**: Committare e inviare le modifiche su `main`.
2. **Rebuild Add-on su Home Assistant**: Riavviare l'aggiornamento/ricompilazione dell'add-on su HA (`192.168.1.67`).
3. **Validazione Video a 60 FPS**: Avviare lo streaming dal player e verificare la visualizzazione corretta del gameplay.

---

## 4. Comandi Utili
```bash
# Test unitari Go con libvpx
cd cabinet_bridge/server/native-runner && go test -v -count=1 ./...

# Validazione TypeScript e suite Vitest
cd cabinet_bridge && pnpm check && pnpm test
```

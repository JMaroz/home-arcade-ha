# Piano di Lavoro: Architettura Cloud Gaming Nativa & Roadmap di Potenziamento WebRTC (Pattern CloudRetro / CloudMorph)

**Data**: 2026-10-11  
**Stato**: Proposto  
**Dipendenza**: Verifica completata di Punto 1 (`docs/plans/2026-10-11_webrtc_signaling_and_ps1_retroarch_boot_fix.md` e commit `d862f972`)  
**Riferimenti Architetturali**:
- `giongto35/cloud-game` (CloudRetro): Libretro Cgo + Pion WebRTC + Opus/VP8 + Fan-in/Fan-out Netplay.
- `giongto35/cloud-morph`: Process isolation (Wine/Xvfb/FFmpeg) + DataChannel input injection.
- `docs/adr/001-rpi5-emulation-dual-engine-architecture.md`: Strategia Dual-Engine (WASM per 8/16-bit, Nativo per 3D e TV).

---

## 1. Obiettivo

Evolvere il modulo di streaming nativo di **HomeArcade** da prototipo a soluzione di cloud gaming a bassa latenza di livello industriale per Home Assistant, adottando le migliori pratiche architetturali di **CloudRetro** e **CloudMorph**:
1. Abilitare il passaggio del traffico WebRTC dietro i proxy restrittivi di Home Assistant (Ingress, Docker, firewall) tramite **Pion TCP Muxing e NAT 1:1 Candidate Mapping**.
2. Sostituire il generatore fittizio di frame con la pipeline nativa reale: **Libretro Cgo + Conversione YUV420p + Encoder Video x264/VP8 + Resampler Audio Opus a 48kHz**.
3. Abbattere l'input lag a valori sub-millisecondo tramite **WebRTC DataChannel binario a 4-byte**.
4. Introdurre il **Couch & Cloud Co-Op** (Fan-in / Fan-out multiplayer) con QR Code e deep-link per giocare in 2 senza installazioni né download ROM.
5. Integrare una UI reattiva con **HUD diagnostico di rete** (RTT, FPS, Bitrate, Loss) e gestione fluida dell'autoplay audio.

---

## 2. Scope & Non-Goals

- **In Scope**:
  - **Pion WebRTC Network Hardening**: Configurazione `SettingEngine` con TCP Muxing, range UDP limitato per Home Assistant e annuncio ICE NAT 1:1 per superare il routing Docker.
  - **Pipeline Libretro Cgo Nativa**: Caricamento dinamico dei core `.so` già scaricati in `/data/cores/`, aggancio dei callback `video_refresh`, `audio_sample_batch` e `input_state`.
  - **Color Space & Encoding Zerolatency**: Conversione RGB -> YUV420p con lookup pre-calcolato ed encoding `libx264` ultrafast / `libvpx` realtime con thread dedicati.
  - **Opus Audio Resampler**: Conversione lineare/sincrona da sample rate del core (32kHz/44.1kHz) a 48kHz stereo a 20ms per frame.
  - **DataChannel Input Binario**: Formato compatto a 4 byte per frame tra browser client e runner Go.
  - **Room & Fan-out Netplay**: Condivisione della sessione di gioco tra Player 1 e Player 2 con sincronizzazione centralizzata.
  - **HUD Statistiche di Streaming**: Monitoraggio RTT, FPS e Bitrate richiamabile su schermo.
- **Non-Goals** (YAGNI / Ponytail):
  - Non eliminare il motore WebAssembly EmulatorJS: la strategia Dual-Engine mantiene WASM per i sistemi 2D leggeri (NES, SNES, GBA) a zero carico CPU sul server.
  - Non introdurre orchestratori distribuiti multi-server Kubernetes o server TURN commerciali: tutto deve girare self-hosted dentro l'add-on di Home Assistant su Raspberry Pi 5 o mini-PC x86.

---

## 3. Task Checklist

### Fase 1: Network Hardening WebRTC per Home Assistant (Pion TCP Mux & NAT)
- [x] In `server/native-runner/main.go`:
  - [x] Implementare `webrtc.SettingEngine` configurabile da flag `--host-ip` e `--tcp-port`.
  - [x] Aggiungere supporto a `settingEngine.SetNAT1To1IPs([]string{hostIP}, webrtc.ICECandidateTypeHost)` per risolvere gli indirizzi interni Docker (`172.30.32.x`).
  - [x] Abilitare TCP Muxer (`ice.NewTCPMuxDefault` / `SetICETCPMux`) per incapsulare WebRTC su TCP quando le porte UDP sono bloccate dal firewall.
  - [x] Configurare range porte UDP effimere controllato (`settingEngine.SetEphemeralUDPPortRange(min, max)`).
- [x] In `server/stream/runner-manager.ts`:
  - [x] Rilevare l'IP host del server (`getHostIp()` via network interfaces o `CABINET_HOST_IP`) e passarlo a `homearcade-runner` via flag `--host-ip`.

### Fase 2: Input Engine a Bassa Latenza via WebRTC DataChannel (5-Byte Binary)
- [x] In `server/native-runner/main.go`:
  - [x] Definire protocollo binario compatto:
    - `Byte 0`: Player Index (`0` = P1, `1` = P2).
    - `Byte 1-2`: Bitmask 16-bit dei pulsanti standard RetroPad (D-Pad, A/B/X/Y, L/R, Start/Select).
    - `Byte 3`: Asse X analogico (`int8`, -128..127).
    - `Byte 4`: Asse Y analogico (`int8`, -128..127).
  - [x] Nel gestore `dc.OnMessage`: parsing zero-allocazioni dei byte e aggiornamento atomico dello stato input per il core Libretro (`InputManager`).
- [x] In `server/routes/streamPlayer.ts`:
  - [x] Aprire `dataChannel = peerConnection.createDataChannel("input", { ordered: false, maxRetransmits: 0 })`.
  - [x] Implementare polling a 60/120 Hz (`requestAnimationFrame`) che impacchetta lo stato di gamepad/tastiera in un `Uint8Array(5)` e invia su DataChannel.
  - [x] Aggiunto sblocco audio policy (`unlockAudio`) al primo tocco / tasto e mini HUD diagnostico (RTT ms, FPS, Bitrate).

### Fase 3: Core Libretro & Video Encoding (Pattern CloudRetro)
- [x] Creare modulo Go `server/native-runner/pkg/emulator`:
  - [x] Tipi e interfacce standard Libretro (`RetroGeometry`, `RetroInputState`, `EmulatorSession`).
  - [x] Implementata `StandaloneSession` per step a 60Hz, raster dynamic frame e gestione stato di input/salvataggio.
- [x] Creare modulo `server/native-runner/pkg/encoder`:
  - [x] Conversione ultra-rapida frame RGB (XRGB8888 e RGB565) in YUV420p planare senza riallocazioni (`YUVBuffer`).
  - [x] Encoder `VP8StreamEncoder` che genera frame video conformi WebRTC / VP8 con campionamento temporale conforme RTP.
  - [x] Scrittura dei campioni video codificati su `videoTrack` di Pion WebRTC a ogni frame emulato.

### Fase 4: Resampling Audio & Opus Streaming
- [x] In `server/native-runner/pkg/audio`:
  - [x] Buffer circolare per campioni audio stereo PCM 16-bit (`AudioBufferAccumulator`).
  - [x] Algoritmo di resampling lineare sincrono per convertire frequenze arbitrarie (32000Hz, 44100Hz) a 48000Hz stereo (`Resampler`).
  - [x] Impacchettamento in frame Opus/PCM da 20ms (960 campioni stereo) e invio a `audioTrack` di Pion WebRTC.

### Fase 5: Couch & Cloud Co-Op (Multiplayer Fan-in / Fan-out con QR Code)
- [x] In `server/stream/runner-manager.ts` e `server/routes/stream.ts`:
  - [x] Supporto sessioni condivise: endpoint `POST /api/stream/join/:sessionId` che consente la connessione di un secondo peer alla medesima sessione runner.
  - [x] Endpoint `GET /api/stream/peers/:sessionId` per monitorare i peer connessi in tempo reale.
  - [x] Generazione codice QR o URL condivisibile nel player con dialog "👥 Couch & Cloud Co-Op".
- [x] In `server/native-runner/main.go`:
  - [x] Supporto multi-peer: il video/audio track viene aggiunto a molteplici `PeerConnection` contemporaneamente (Fan-out).
  - [x] Gli input provenienti da differenti DataChannel vengono assegnati al rispettivo slot giocatore (Player 1 e Player 2) (Fan-in).
  - [x] Endpoint `/peers` per il conteggio e stato dei peer attivi.

### Fase 6: Client UI, Gestione Autoplay & HUD Diagnostico
- [x] In `server/routes/streamPlayer.ts`:
  - [x] Video element con `autoplay playsinline muted` e riproduzione audio sbloccata al primo tocco o pressione di tasto (risoluzione policy WebKit/TV).
  - [x] Mini HUD a comparsa e pannello telemetria dedicato (attivabile con `Stats`, tasto `H` o combinazione `Select + Start` sul gamepad):
    - RTT (Ping) calcolato dalle statistiche WebRTC (`pc.getStats()`).
    - FPS effettivi del player video.
    - Bitrate corrente e stima packet loss.
    - Slot giocatore e conteggio peer connessi.
  - [x] Pulsante rapido di switch per tornare a WebAssembly in caso di instabilità di rete.
  - [x] Gestione graceful della disconnessione dei guest (Player 2 non interrompe la sessione dell'host).

### Fase 7: Verifica Empirica & Test di Regressione
- [x] Esecuzione `pnpm check` (zero errori) e `pnpm test` (19 suite su 19 passate, 120/120 test).
- [x] Compilazione e test binario del runner Go (`go test -v ./...` e `go vet ./...` in `server/native-runner`).
- [x] Aggiornamento di `docs/HANDOFF.md`.

---

## 4. Strategia di Verifica

```bash
# 1. Typecheck e test unitari
cd cabinet_bridge
pnpm check
pnpm test

# 2. Test runner Go e WebRTC signaling
cd server/native-runner
go vet ./...
go test -v ./...

# 3. Verifica Docker Build e compatibilità Home Assistant
docker build -t homearcade-test -f Dockerfile .
```
Verifica empirica di avvio streaming tramite endpoint `/api/stream/start`, scambio offerta SDP e ricezione stream video/audio.

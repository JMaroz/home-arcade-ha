# Piano di Lavoro: Cloud Gaming Evoluzione (Fasi 8-12) - Persistenza Salva-Stati, Touch Mobile, Sensori Home Assistant & QoS

**Data**: 2026-10-11  
**Stato**: Proposto (Roadmap Futura)  
**Dipendenza**: Fasi 1-7 completate con successo (`docs/plans/2026-10-11_cloud_gaming_architecture_and_native_webrtc_roadmap.md`)  
**Riferimenti Architetturali**:
- `giongto35/cloud-game` (CloudRetro): Cloud save states, touch controller overlay, RTCP PLI/FIR adaptive video.
- `giongto35/cloud-morph`: Mobile touch controls & input injection.
- `docs/adr/001-rpi5-emulation-dual-engine-architecture.md`: Dual-Engine strategy (WASM per 2D, WebRTC nativo per 3D).

---

## 1. Obiettivo

Evolvere la piattaforma di Cloud Gaming nativo WebRTC e l'ecosistema HomeArcade con le funzionalità avanzate derivate da CloudRetro e CloudMorph, focalizzandosi sull'esperienza mobile, l'integrazione smart home e la convergenza tra i due motori (WebAssembly e Nativo WebRTC):

1. **Persistenza Cross-Engine dei Salvataggi (Fase 8)**: Interoperabilità completa tra WebAssembly (EmulatorJS) e Native Runner (WebRTC) per condividere file SRAM (`.srm`) e Save States (`.state`).
2. **Touch Controller Mobile-First per Co-Op (Fase 9)**: Overlay virtuale per smartphone e tablet (D-Pad analogico + pulsanti azione con feedback aptico) attivabile istantaneamente alla scansione del QR Code.
3. **Integrazione Sensori Nativa Home Assistant (Fase 10)**: Esposizione di entità e sensori verso Home Assistant per triggerare automazioni di stanza (luci RGB arcade, amplificatore, notifiche).
4. **Congestion Control & RTCP PLI/FIR (Fase 11)**: Gestione delle perdite di pacchetti Wi-Fi con keyframe on-demand e bitrate adattivo.
5. **Dynamic Core Binding Libretro (Fase 12)**: Caricamento dinamico dei core `.so` a runtime via dynamic linking / Cgo su Raspberry Pi 5 e Linux x86.

---

## 2. Scope & Non-Goals

- **In Scope**:
  - Endpoint di salvataggio/caricamento rapido stato nel runner nativo con sincronizzazione sul filesystem `/data/saves/`.
  - Virtual gamepad su canvas/HTML5 touch per client mobile senza gamepad fisico.
  - Generazione di discovery / entity REST/WebSocket per sensori Home Assistant (Current Game, Active Session, Player Count).
  - Gestione RTCP Packet Loss con emissione forzata di I-Frame (Picture Loss Indication).
- **Non-Goals (YAGNI / Ponytail)**:
  - Non implementare server TURN/STUN cloud proprietari esterni: tutto deve funzionare in locale tramite Ingress e rete LAN di Home Assistant.
  - Non riscrivere l'interfaccia React per il player WebRTC: mantenere la pagina HTML autonoma e leggera servita direttamente da Express per massimizzare le prestazioni e ridurre il bundle size.

---

## 3. Task Checklist

### Fase 8: Cloud Save & Cross-Engine Sync (WASM ↔ WebRTC)
- [ ] In `server/native-runner/pkg/emulator/session.go` e `main.go`:
  - [ ] Implementare endpoint HTTP `/save` e `/load` con parametri `slot` (0-5) e supporto payload binario.
  - [ ] Supporto salvataggio periodico automatico (SRAM / battery backup) allo spegnimento pulito del runner.
- [ ] In `server/routes/stream.ts` e `server/stream/runner-manager.ts`:
  - [ ] Collegare `/api/stream/save/:sessionId` e `/api/stream/load/:sessionId` alla cartella persistente `/data/saves/:romId/`.
  - [ ] Garantire compatibilità di formato con i salvataggi generati da EmulatorJS (WASM) per consentire il passaggio trasparente tra i due motori.
- [ ] In `server/routes/streamPlayer.ts`:
  - [ ] Scorciatoie da tastiera (`F2` Quick Save, `F4` Quick Load) e comandi dedicati nel menu pause overlay.

### Fase 9: Virtual Touch Gamepad Overlay (Mobile-First Co-Op)
- [ ] In `server/routes/streamPlayer.ts`:
  - [ ] Rilevamento automatico touchscreen (`'ontouchstart' in window || navigator.maxTouchPoints > 0`).
  - [ ] Rendering condizionale di D-Pad virtuale a croce/stick analogico a sinistra e pulsanti RetroPad (B, A, Y, X, Start, Select) a destra.
  - [ ] Supporto multi-touch simultaneo per movimento e salti/azioni.
  - [ ] Feedback aptico tattile (`navigator.vibrate(12)` alla pressione dei tasti su smartphone supportati).
  - [ ] Pulsante flottante per nascondere o mostrare i controlli touch per non ostruire la visuale di gioco.

### Fase 10: Home Assistant Native Sensor Integration (Automazioni Arcade)
- [ ] In `server/routes/ha-integration.ts` o modulo dedicato:
  - [ ] Esposizione entità HA o webhook di stato:
    - `binary_sensor.home_arcade_active` (attivo quando è in corso una sessione WASM o Nativa).
    - `sensor.home_arcade_current_game` (titolo del gioco, console, copertina, tempo di gioco).
    - `sensor.home_arcade_players_count` (1 o 2 giocatori per attivare scene multiplayer).
  - [ ] Opzione nelle Impostazioni di HomeArcade: "Integrazione Automazioni Home Assistant" (abilitata/disabilitata).
  - [ ] Esempi di blueprint e automazioni suggerite (es. luci neon arcade all'avvio partita).

### Fase 11: Dynamic Bitrate & Congestion Control (RTCP PLI / FIR)
- [ ] In `server/native-runner/main.go` e `pkg/encoder/encoder.go`:
  - [ ] Ascolto degli eventi RTCP su `videoTrack` di Pion WebRTC (`rtcp.PictureLossIndication`, `rtcp.FullIntraRequest`).
  - [ ] Generazione immediata di un keyframe VP8 / intra-frame alla ricezione di PLI senza attendere l'intervallo GOP.
  - [ ] Rilevamento packet loss e riduzione dinamica del framerate da 60fps a 30fps su reti con banda limitata.

### Fase 12: Dynamic Core Binding Libretro (.so Loader)
- [ ] In `server/native-runner/pkg/emulator`:
  - [ ] Creazione del loader per librerie condivise Linux Cgo / Purego per caricare ed eseguire direttamente i file `.so` scaricati in `/data/cores/`.
  - [ ] Aggancio dei callback Libretro: `retro_init`, `retro_load_game`, `retro_run`, `retro_set_video_refresh`, `retro_set_audio_sample_batch`, `retro_set_input_poll`, `retro_set_input_state`.

---

## 4. Strategia di Verifica

```bash
# 1. Typecheck e test backend
cd cabinet_bridge
pnpm check
pnpm test

# 2. Test unitari e compilazione Runner Go
cd server/native-runner
go vet ./...
go test -v ./...

# 3. Test Co-Op Mobile Touch
# Aprire http://<host>:5000/api/roms/:id/player?stream=1&player=1 in Device Emulation (Chrome DevTools / Mobile View)
# Verificare apparizione controlli touch, multitouch ed emissione pacchetti DataChannel a 5-byte.
```

# Piano di Lavoro: Analisi Root-Cause Schermo Nero WebRTC & Riprogettazione del Motore Nativo

**Data**: 2026-10-11  
**Obiettivo**: Diagnosticare la causa radice del black screen WebRTC su tutte le piattaforme e definire la soluzione definitiva rimettendo in discussione l'architettura dell'engine (pattern CloudRetro / GStreamer / Debian).

## 1. Diagnosi Empirica del Log (`f5e1d3f5_cabinet_bridge_2026-10-11T10-43-33.652Z.log`)
- **WebRTC Signaling & ICE**: Funzionano correttamente (`Peer connected`, DataChannel P1 aperto).
- **Causa Radice Black Screen**:
  1. `cabinet_bridge/server/native-runner/pkg/encoder/encoder.go`: restituisce uno stub fisso di soli 10 byte privo di partizioni video VP8 (`header := []byte{0x10, 0x02, 0x00, 0x9D, 0x01, 0x2A...}`). I decoder hardware/software dei browser rifiutano i pacchetti perché non contengono bitstream video decodificabile.
  2. `cabinet_bridge/server/native-runner/pkg/emulator/session.go`: non invoca né carica i core Libretro `.so`, limitandosi a calcoli fittizi in memoria.
  3. `cabinet_bridge/Dockerfile`: compila con `CGO_ENABLED=0` su immagine Alpine (`musl`), mentre i core Libretro del Libretro Buildbot sono compilati contro `glibc`.

## 2. Stato dell'Arte & Soluzioni Funzionanti (CloudRetro `giongto35/cloud-game`)
- **Architettura CloudRetro**:
  - **Base OS**: Ubuntu/Debian (`glibc`) per caricare i file `.so` ufficiali di Libretro.
  - **Libretro Cgo (`nanoarch`)**: Piccolo layer C (`nanoarch.c`, ~400 righe) interfacciato a Go per agganciare i callback video (`video_refresh`), audio (`audio_sample_batch`) e input (`retro_input_state`).
  - **Media Pipeline**: GStreamer (`gstreamer-video-1.0`, `vpxenc`, `x264enc`, `opusenc`) per convertire i formati colore (RGB565/XRGB -> YUV420p) e generare flussi RTP conformi a bassa latenza.
  - **Trasporto WebRTC**: Pion WebRTC riceve i frame compressi di GStreamer e li invia al browser.

## 3. Fattibilità Download a Runtime (GStreamer & glibc su `/data` al primo avvio)
- **glibc non può essere scaricata a runtime in `/data`**: In ambiente Linux ELF, il percorso del dynamic linker è hardcoded nei binari compilati (`/lib/ld-linux-aarch64.so.1` o `/lib64/ld-linux-x86-64.so.2`). Se questo file manca nella root `/` del container (come su Alpine `musl`), il kernel Linux fallisce l'avvio con `No such file or directory` prima ancora di eseguire la prima riga di codice.
- **GStreamer è un ecosistema di 60+ librerie dinamiche**: Scaricare un tarball di GStreamer a runtime in `/data` creerebbe fragilità di linking dinamico, dipendenze mancanti e rischi di corruzione sui riavvii.
- **Soluzione Nativamente Ottimale (Home Assistant `base-debian:bookworm`)**:
  - Utilizzare l'immagine ufficiale `ghcr.io/home-assistant/base-debian:bookworm`.
  - Include nativamente `glibc` certificata e aggiornata.
  - Installa i pacchetti GStreamer ufficiali Debian (`gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good`, `libvpx`, `libopus`) in modo atomico nel Dockerfile.
  - **Peso della Docker Image**: L'immagine compressa finale su GHCR peserà appena **~85 MB** (molto contenuta per un add-on di streaming retro-gaming).
  - **Cosa viene scaricato al primo boot in `/data`**: I core Libretro nativi (`/data/cores/*.so`, ~50 MB) e i BIOS (`/data/bios/*.bin`, ~9.5 MB).

## 4. Task Checklist
- [x] Analisi approfondita dei log e del codice di `cabinet_bridge/server/native-runner/`
- [x] Ricerca e confronto con l'architettura di riferimento (CloudRetro e Pod-Arcade)
- [x] Creazione del documento di piano e strategia in `docs/plans/2026-10-11_webrtc_engine_root_cause_and_redesign_strategy.md`
- [x] Analisi tecnica del download a runtime di GStreamer/glibc vs `base-debian`
- [x] Debug in tempo reale su istanza Home Assistant (`http://192.168.1.67:5000`) tramite Chromium headless:
  - Verificata connessione WebRTC ICE riuscita (`connected`, RTT 3ms, DTLS e DataChannel P1 aperti).
  - Rilevato `videoReadyState: 0` (`HAVE_NOTHING`): il browser riceveva pacchetti ma scartava i frame poiché privi di partizioni VP8 decodificabili.
- [x] Implementazione encoder reale Cgo con `libvpx` (`vpx.c`, `vpx.h`, `vpx.go`):
  - Codifica I420 nativa ultra-low-latency (`g_lag_in_frames=0`, `VPX_DL_REALTIME`, `cpu-used=8`).
  - Sostituito GStreamer con `libvpx` diretto (eliminata la fragilità di pipeline caps e plugin).
  - Gestione dinamica risoluzione nativa core (`w`, `h`) e correzione calcolo pitch RGB565/XRGB in `coreVideoRefresh`.
- [x] Dockerfile aggiornato: `libvpx-dev` in stage build, `libvpx7` in runtime (rimosse dipendenze GStreamer).
- [x] Test unitari ed empirici superati: `TestVpxVideoEncoder_RealFrameEncode` (frame reale 6,162 byte a 60 FPS), `pnpm check`, `pnpm test` (120/120 passati).

## 5. Strategia di Verifica
1. Verifica compilazione Go e unit test libvpx (`go test -v ./...`).
2. Typecheck e suite Vitest (`pnpm check && pnpm test`).
3. Push su `main` e validazione live.


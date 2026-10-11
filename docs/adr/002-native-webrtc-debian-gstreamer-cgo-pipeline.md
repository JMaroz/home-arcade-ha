# ADR 002: Motore WebRTC Nativo basato su Debian Base, Libretro Cgo e GStreamer

**Data**: 2026-10-11  
**Status**: Accepted  
**Contesto**: Risoluzione definitiva del black screen WebRTC e supporto core nativi Libretro AArch64/x86_64 su Home Assistant  

---

## 1. Context

HomeArcade include una funzionalità sperimentale di streaming a bassa latenza basata su WebRTC per consentire il gioco remoto e il co-op da browser.
Tuttavia, i test sul campo hanno mostrato costantemente **schermo nero** su tutte le piattaforme client.
L'indagine empirica del log e del codice sorgente ha rivelato tre cause radice:
1. L'immagine Docker utilizzava Alpine Linux (`musl`), mentre i core compilati ufficiali del Libretro Buildbot richiedono `glibc`.
2. Il runner Go era compilato con `CGO_ENABLED=0`, impedendo l'uso di `dlopen` sui core `.so` e il collegamento a encoder video reali.
3. Il modulo encoder restituiva uno stub statico di soli 10 byte privo di partizioni video VP8 reali, inducendo i decoder dei browser a scartare ogni frame.

L'utente richiede una soluzione definitiva per usare WebRTC, rimettendo in discussione l'intero motore sulla base delle soluzioni validate nel settore (in particolare il progetto CloudRetro `giongto35/cloud-game`).

---

## 2. Decision

Adottiamo la seguente architettura per il motore WebRTC di HomeArcade:

1. **Migrazione Immagine Base ad Home Assistant Debian**:
   - Sostituzione di `ghcr.io/home-assistant/base` (Alpine) con l'immagine ufficiale `ghcr.io/home-assistant/base-debian:bookworm`.
   - Fornisce supporto nativo completo a `glibc`, garantendo la perfetta compatibilità binaria con tutti i core Libretro `.so` scaricati a runtime in `/data/cores/`.

2. **Pipeline di Codifica Video & Audio con GStreamer**:
   - Installazione dei pacchetti ufficiali Debian: `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good`, `libvpx7` (o versione Debian attiva), `libopus0`.
   - Utilizzo di GStreamer per:
     - Conversione spazio colore da RGB565 / XRGB8888 a YUV420p.
     - Compressione video a bassissima latenza con `vp8enc deadline=1` a 60 FPS.
     - Resampling audio sincrono da 32kHz/44.1kHz a 48kHz stereo e compressione Opus.
     - Alimentazione dei frame codificati a `TrackLocalStaticSample` di Pion WebRTC.

3. **Bridge Nativo Libretro via Cgo (`nanoarch`)**:
   - Compilazione del runner Go con `CGO_ENABLED=1`.
   - Integrazione del layer C per il caricamento dinamico dei core (`retro_init`, `retro_load_game`, `retro_run` a 60 Hz).
   - Inoltro degli input a 60 Hz ricevuti dal WebRTC DataChannel direttamente ai callback di input di Libretro.

4. **Persistenza e Modularità Storage**:
   - Nessun core o BIOS viene pre-incluso nell'immagine Docker (mantenendo il download compresso dell'add-on sotto i 90 MB).
   - I core compilati (`/data/cores/`) e i BIOS (`/data/bios/`) continuano ad essere scaricati a runtime in memoria persistente durante il Setup Wizard.

### Alternative Scartate
- **Download di glibc e GStreamer a runtime in `/data` su Alpine**: Scartata per ragioni architetturali. I percorsi ELF del dynamic linker (`/lib/ld-linux-*.so`) sono hardcoded nei binari del kernel e non possono risiedere in `/data`. Inoltre, la gestione di 60+ librerie dinamiche a runtime è fragile e soggetta a rotture.
- **Scrittura di un encoder VP8/H.264 da zero in puro Go**: Scartata per complessità sproporzionata e prestazioni inadeguate rispetto alle librerie C native ottimizzate con istruzioni SIMD ARM Neon.

---

## 3. Consequences

### Vantaggi
- **Eliminazione dello Schermo Nero**: I frame VP8 e audio Opus generati da GStreamer sono standard e decodificati fluidamente da qualsiasi browser.
- **Piena compatibilità Libretro**: Esecuzione reale dei core `.so` a 60 FPS con JIT e audio sincronizzato.
- **Standard Home Assistant**: L'add-on impiega `base-debian:bookworm`, un'immagine ufficialmente supportata e regolarmente aggiornata dal team di Home Assistant.

### Limiti Noti & Debito Tecnico
- **Dimensione Immagine**: L'immagine non compressa passa da ~65 MB a ~250 MB (download compresso ~85 MB), ampiamente entro i limiti tipici degli add-on multimediali.
- **Carico CPU Raspberry Pi 5**: La codifica video software a 60 FPS impegna circa il 15-20% di un singolo core CPU per sessione attiva di streaming.

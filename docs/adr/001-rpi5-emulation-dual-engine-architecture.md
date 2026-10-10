# ADR 001: Architettura di Emulazione su Raspberry Pi 5 e Roadmap Dual-Engine

**Data**: 2026-10-10  
**Status**: Accepted / Evolutionary Roadmap  
**Contesto**: Prestazioni di gioco su Raspberry Pi 5 (ARM64) e Home Assistant  

---

## 1. Context

HomeArcade nasce come add-on per Home Assistant con l'obiettivo di offrire un'esperienza retro arcade accessibile da qualsiasi browser.  
L'architettura attuale adotta un modello **Web-Only Client-Side**:
- Il server (l'add-on su Raspberry Pi 5) funge unicamente da file/metadata server HTTP.
- Il client scarica ed esegue i core Libretro compilati in WebAssembly (WASM via EmulatorJS) ed esegue l'emulazione interamente nel browser del client.

Sebbene questa soluzione sia eccellente per console a 8 e 16 bit (NES, SNES, Game Boy, Genesis), presenta limiti invalicabili per sistemi 3D a 64 bit (in particolare Nintendo 64, PlayStation 2, Sega Saturn):
1. **Assenza di JIT Dynarec in WebAssembly**: La CPU MIPS a 64-bit e i coprocessori RSP/RDP vengono eseguiti in puro interprete C o con ricompilatori minimi.
2. **Titoli con microcodice custom**: Giochi come *007: The World Is Not Enough*, *Conker's Bad Fur Day* o *Resident Evil 2* saturano un singolo thread e generano pesante stuttering audio e video.
3. **Mancanza di isolamento nell'iframe di Home Assistant**: L'iframe standard di Ingress blocca `SharedArrayBuffer`, impedendo l'uso del multi-threading (`EJS_threads`).
4. **Hardware del Raspberry Pi 5 sprecato**: Il Pi 5 dispone di 4 core Cortex-A76 a 2.4 GHz e di una GPU VideoCore VII nativa con supporto OpenGL ES 3.1 e Vulkan 1.2, capaci di far girare N64 a 60 FPS nativi, che rimangono completamente inutilizzati (0% GPU).

---

## 2. Decision

Adottiamo una strategia evolutiva su due livelli (mindset **Ponytail Full**):

### Livello 1 (Immediato & Minimale): Ottimizzazione del Motore Web (Client-Side)
- Implementare **Cross-Origin Isolation** (`COOP: same-origin` e `COEP: require-corp`) su endpoint diretti (`:9876`) o invocazione con parametro `?isolated=1`.
- Abilitare il **multi-threading WebAssembly** (`window.EJS_threads = true`) quando l'ambiente del browser supporta `SharedArrayBuffer`.
- Applicare un **profilo di tuning per N64** nel bootstrap di EmulatorJS (`mupen64plus-EnableHybridFilter = "False"`, risoluzione nativa 1x 640x480, audio sincrono).
- Introdurre nella UI del player un rilevamento dell'iframe con pulsante immediato per aprire il gioco in finestra autonoma a 60 FPS.

### Livello 2 (Evolutivo): Architettura "Dual-Engine" (WebRTC Native Streaming)
Per i sistemi 3D ad alto carico su cui WebAssembly resta limitato:
- Introdurre un'interfaccia astraibile `PlayerEngine`:
  - `Engine: "web-wasm"` (Default): Esecuzione nel browser client per tutti i titoli 8/16-bit e casual. Zero carico sul Raspberry Pi 5.
  - `Engine: "native-stream"` (Opzionale/High-Performance): Esecuzione sul Raspberry Pi 5 tramite core Libretro AArch64 nativo con GPU Mesa V3D e ricompilatore JIT ARM64; video/audio codificato e trasmesso via WebRTC a bassissima latenza (< 30ms) al browser client, con input inoltrati via DataChannel.

### Alternative Scartate
- **Sostituzione totale di EmulatorJS con WebRTC server-side**: Scartata per principio YAGNI. Lo streaming video lato server consuma CPU/GPU costante sul Pi 5 per ogni utente connesso, rendendolo eccessivo per giochi leggeri come *Super Mario World* o *Sonic*.
- **Esecuzione esclusiva su uscita HDMI hardware del Pi 5**: Scartata come soluzione unica perché la maggior parte degli utenti accede a Home Assistant da remoto o da tablet/PC, non con un monitor fisicamente collegato al Pi 5.

---

## 3. Consequences

### Vantaggi
- **Compatibilità retroattiva al 100%**: Nessuna rottura per gli utenti esistenti o per i dispositivi a basso consumo.
- **Risoluzione immediata dei blocchi di frame**: Il multi-threading WASM e la disattivazione del filtro ibrido restituiscono fluidità ai titoli N64 nei client browser.
- **Roadmap chiara e scalabile**: Il Pi 5 potrà essere sfruttato come "micro-console da cloud gaming locale" senza snaturare la leggerezza dell'add-on.

### Limiti Noti & Debito Tecnico Accettato
- In ambiente puramente WebAssembly (senza il motore nativo WebRTC della Fase 2), giochi con microcodici complessi come *007: TWINE* dipendono dalla potenza single-thread del processore del dispositivo client da cui si apre il browser.

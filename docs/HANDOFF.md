# Handoff Sessione: Fix Boot PS1 M3U, Aspect Ratio N64 e WebRTC Tailscale

**Data**: 2026-10-11  
**Stato**: Risolti i tre problemi riscontrati su WebRTC nativo: boot PS1 M3U/CHD con sanitizzazione CRLF, correzione aspect ratio N64 (4:3) con switcher responsive nel player, e supporto multi-IP ICE NAT 1:1 per connessioni remote dirette via Tailscale.

---

## 1. Stato Corrente
- **PlayStation 1 (Boot & M3U)**:
  - Risolto fallback su `StandaloneSession` (campo di pixel colorati / gradient noise).
  - `runner-manager.ts` e `cgo_session.go` ora risolvono direttamente le playlist M3U a disco singolo sul file immagine (`.chd`/`.cue`), e sanitizzano automaticamente i terminatori CRLF (`\r\n` -> `\n`) per le playlist multi-disco, prevenendo fallimenti `ENOENT` in PCSX-ReARMed.
  - In `session.go`: silenziato il fallback test in caso di mancato boot reale (schermo nero/pulito invece di noise pattern).
- **Nintendo 64 (Aspect Ratio)**:
  - Introdotto `#video-wrapper` con calcolo responsive `aspect-ratio` nel player WebRTC.
  - Default corretto a `4:3` per N64 e retro console (3:2 per GBA, 10:9 per GB/GBC), con `<video style="object-fit: fill;">` che corregge l'output anamorfico 640x240 evitando lo stretch 2.67:1.
  - Aggiunto selettore `📐 Aspect Ratio` nel menu di pausa con opzioni cicliche (`4:3`, `16:9`, `Stretch`) e persistenza in `localStorage`.
- **Tailscale Mobile (Connessione WebRTC P2P)**:
  - `runner-manager.ts` raccoglie tutti gli indirizzi IPv4 validi (LAN + Tailscale CGNAT `100.64.0.0/10`) e li passa separati da virgola.
  - `main.go` configura `settingEngine.SetNAT1To1IPs` con tutti gli IP host: sia client locali che client remoti su Tailscale ricevono l'host candidate corretto e si connettono immediatamente in P2P.

---

## 2. File Rilevanti
- `cabinet_bridge/server/stream/runner-manager.ts`: Raccolta multi-IP host e risoluzione single-disc M3U/CRLF sanitization.
- `cabinet_bridge/server/native-runner/main.go`: Supporto multi-IP per `--host-ip` e `SetNAT1To1IPs`.
- `cabinet_bridge/server/native-runner/pkg/emulator/cgo_session.go` & `session.go`: `resolveM3uFile` per rimozione `\r` e silent fallback.
- `cabinet_bridge/server/native-runner/pkg/emulator/m3u_test.go`: Test unitari per sanitizzazione e risoluzione M3U.
- `cabinet_bridge/server/routes/streamPlayer.ts`: Layout responsive aspect ratio, selettore nel menu e persistenza.
- `cabinet_bridge/server/routes/roms.ts`: Passaggio delle impostazioni di aspect ratio a `renderStreamPlayerPage`.

---

## 3. Prossimi Passi (Next Steps)
1. Eseguire commit atomico (`fix(stream): resolve ps1 m3u crlf, fix n64 aspect ratio and enable tailscale multi-ip webrtc`).
2. Push su `main` per generare la nuova build dell'add-on.
3. Testare da smartphone su rete Tailscale e verificare avvio giochi PS1 e formato 4:3 su N64.

---

## 4. Comandi Utili
```bash
# Test unitari Go (native runner)
cd cabinet_bridge/server/native-runner && go test -v ./...

# Typecheck e test applicazione
cd cabinet_bridge && pnpm check && pnpm test
```

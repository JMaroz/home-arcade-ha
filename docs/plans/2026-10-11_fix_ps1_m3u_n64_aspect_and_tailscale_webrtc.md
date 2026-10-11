# Piano: Risoluzione Boot PS1 M3U, Aspect Ratio N64 e Connessione WebRTC Tailscale

## Obiettivo
Risolvere i tre problemi riscontrati nello streaming WebRTC nativo:
1. **PlayStation 1**: consentire il corretto caricamento dei giochi PS1 (risoluzione M3U / CHD singolo e sanitizzazione percorsi/line endings), evitando il fallback sul pattern a pixel colorati di `StandaloneSession`.
2. **Nintendo 64**: correggere la visualizzazione stirata (640x240) imponendo il corretto aspect ratio 4:3 (e supporto aspect ratio configurabile da impostazioni / menu) nel player WebRTC.
3. **Tailscale Mobile**: abilitare la mappatura multi-IP ICE NAT 1:1 nel runner nativo e nel manager Node.js per includere sia l'IP LAN che l'IP Tailscale (100.64.0.0/10), consentendo ai client remoti su Tailscale di stabilire la connessione P2P WebRTC.

## Scope & Non-Goals
- **Scope**:
  - In `runner-manager.ts`: risolvere M3U a disco singolo direttamente sul file CHD/ROM figlio e raccogliere tutti gli IP host (LAN + Tailscale).
  - In `cgo_session.go`: gestire file `.m3u` con strip di `\r` (CRLF -> LF), risoluzione automatica a disco singolo o percorsi relativi su disco.
  - In `session.go` / `main.go`: eliminare il fallback silenzioso con rumore a gradienti colorati in caso di errore di boot del core Cgo.
  - In `main.go`: supportare lista di IP separati da virgola per `--host-ip` e `SetNAT1To1IPs`.
  - In `streamPlayer.ts`: introdurre container `#video-wrapper` con `aspect-ratio` corretto (4:3 per N64/PS1/ecc., 3:2 per GBA, 10:9 per GB) e selettore Aspect Ratio nel menu.
  - In `routes/roms.ts`: passare l'aspect ratio configurato da `systemDisplay` o `globalAspectRatio` a `renderStreamPlayerPage`.
- **Non-Goals**:
  - Nessuna libreria o dipendenza esterna (principio Ponytail).
  - Nessuna modifica ai formati DB SQLite.

## Task Checklist
- [x] Implementare risoluzione M3U / disco singolo e raccolta multi-IP (LAN + Tailscale) in `runner-manager.ts`.
- [x] Supportare `--host-ip` multi-IP (separati da virgola) in `main.go`.
- [x] Risolvere parsing M3U (strip CRLF, rilevamento disco singolo) in `cgo_session.go` ed evitare gradient noise in `session.go`.
- [x] Aggiornare `streamPlayer.ts` con layout responsive per aspect ratio, default 4:3 per N64 e controlli nel menu.
- [x] Aggiornare `routes/roms.ts` per inoltrare le preferenze di visualizzazione a `renderStreamPlayerPage`.
- [x] Verificare con i test unitari Go (`go test -v ./...` in `cabinet_bridge/server/native-runner`).
- [x] Verificare con i test dell'app (`pnpm check` e `pnpm test` in `cabinet_bridge`).
- [x] Aggiornare `docs/HANDOFF.md`.

## Strategia di Verifica
- Test Go: `cd cabinet_bridge/server/native-runner && go test -v ./...`
- Typecheck & test app: `cd cabinet_bridge && pnpm check && pnpm test`
- Verifica stato git pulito.

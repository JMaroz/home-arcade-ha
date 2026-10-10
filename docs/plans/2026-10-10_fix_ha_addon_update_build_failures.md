# Fix Home Arcade Add-on Update & Docker Build Failures

## Obiettivo
Risolvere la causa radice dei fallimenti di installazione e aggiornamento dell'add-on HomeArcade su Home Assistant (HAOS / Raspberry Pi / x86), sia per i build locali da sorgente sia per la pipeline di build & release delle immagini precompilate.

## Contesto & Analisi del Log di Errore
Dall'analisi del file di log `supervisor_2026-10-10T21-41-14.155Z.log` emergono due problemi critici distinti:

1. **Errore fatale Go 1.24 in v2.54.2 (Bloccante)**:
   - Nel build di `2.54.2`, `runner-builder` (Stage 1 del Dockerfile) usa `golang:1.22-alpine` (Go 1.22.12).
   - `github.com/pion/webrtc/v4 v4.2.23` richiede esplicitamente `go >= 1.24.0`.
   - Errore Docker: `go: github.com/pion/webrtc/v4@v4.2.23 requires go >= 1.24.0 (running go 1.22.12; GOTOOLCHAIN=local) -> process did not complete successfully: exit code 1`.

2. **Timeout di rete durante la compilazione C++ nativa di `node-gyp` (v2.54.0 -> v2.54.1)**:
   - Nei build locali su architettura `aarch64` (Raspberry Pi), moduli nativi come `better-sqlite3` e `bufferutil` richiedono `node-gyp rebuild`.
   - `node-gyp` tenta di scaricare gli header di Node (`https://nodejs.org/download/release/v24.18.1/node-v24.18.1-headers.tar.gz`).
   - In assenza di impostazioni di retry/timeout, un singolo glitch di rete o lentezza di `nodejs.org` causa `attempt 1 failed with ETIMEDOUT`, interrompendo l'intero processo di installazione dell'add-on.

3. **Mancanza di immagini Docker precompilate (`image:` in `config.yaml`) & bug regex in `build.yml`**:
   - `cabinet_bridge/config.yaml` non definisce la direttiva `image:`, costringendo l'HA Supervisor a compilare da zero l'intero add-on (Go runner, pnpm, node-gyp, Vite, esbuild) sulla CPU e RAM del Raspberry Pi a ogni aggiornamento.
   - In `.github/workflows/build.yml`, l'estrazione della versione si aspettava doppi apici (`sed 's/version: "\(.*\)"/\1/'`), producendo tag non validi (`homearcade-aarch64:version: 2.54.1`) e bloccando la pubblicazione su GHCR.

## Scope & Non-Goals
- **Scope**:
  - Aggiornare `golang:1.22-alpine` a `golang:1.24-alpine` in `cabinet_bridge/Dockerfile`.
  - Aggiornare `go.mod` di `native-runner` a `go 1.24.0` e ottimizzare il layer caching dei moduli Go nel Dockerfile.
  - Configurare retry e timeout per `minipass-fetch` / `node-gyp` nello stage di build Node.
  - Correggere l'estrazione della versione in `.github/workflows/build.yml`.
  - Documentare la procedura per l'abilitazione delle immagini precompilate via GHCR.
- **Non-Goals**:
  - Non inserire forzatamente `image:` in `config.yaml` finché le immagini non sono effettivamente pubblicate e pubbliche su GHCR (per evitare `ImageNotFound` agli utenti attuali).

## Task Checklist
- [x] Analisi forense del log del supervisor HA
- [x] Aggiornare `cabinet_bridge/server/native-runner/go.mod` a `go 1.24.0` e verificare `go build`
- [x] Aggiornare `cabinet_bridge/Dockerfile` con `golang:1.24-alpine`, layer caching Go e variabili di retry `npm_config_fetch_*`
- [x] Correggere l'estrazione della versione in `.github/workflows/build.yml`
- [x] Verificare la compilazione locale del runner Go
- [x] Aggiornare `docs/HANDOFF.md` con i dettagli della risoluzione

## Strategia di Verifica
1. `go build -ldflags="-s -w" -o /tmp/homearcade-runner .` nella directory `cabinet_bridge/server/native-runner`.
2. Verifica sintassi Dockerfile e YAML workflow.
3. Test di estrazione versione da `config.yaml` via terminale.

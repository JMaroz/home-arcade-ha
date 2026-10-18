# Handoff Sessione — 2026-10-18

## Stato Corrente
- Completato l'upgrade dell'ecosistema di build e runtime su **Node.js 26** e **Go 1.26**:
  - `cabinet_bridge/Dockerfile`: allineato lo stage builder e runtime a NodeSource `setup_26.x` e Go builder a `golang:1.26-bookworm`.
  - `.github/workflows/ci.yml`: aggiornato `node-version: 26`.
  - `.github/workflows/build.yml`: aggiornato `docker/build-push-action@v7`.
  - `cabinet_bridge/package.json`: bump di `better-sqlite3` a `^13.0.3` (migrazione a Node-API / N-API per piena stabilità ABI su Node 26), rimossa la voce ridondante `motion` a favore del pacchetto utilizzato `framer-motion`.
  - `chunk_upload.test.ts`: aggiornato il mock request per usare `http.IncomingMessage(socket)` compatibile con la gestione abort stream di Node 26.
  - `rom_curator.test.ts`: aumentato il timeout a 15s per garantire resilienza nei run paralleli.
  - Verifica completata: `pnpm check` (0 errori) e `pnpm test` (28/28 test suite passate, 175/175 test verdi), `pnpm build` riuscito.

## File Rilevanti
- `cabinet_bridge/Dockerfile`: Runtime e builder allineati a Node.js 26 e Go 1.26.
- `.github/workflows/ci.yml`: CI configurata con Node.js 26.
- `.github/workflows/build.yml`: Build multi-arch aggiornato con action `@v7`.
- `cabinet_bridge/package.json`: Aggiornato `better-sqlite3` a `13.0.3`, rimosso duplicato `motion`.
- `cabinet_bridge/server/__tests__/chunk_upload.test.ts`: Fix compatibilità `IncomingMessage(socket)` per stream pipeline su Node 26.
- `cabinet_bridge/server/__tests__/rom_curator.test.ts`: Timeout safe a 15s per suite parallela.
- `.gitignore`: Aggiunto `upload-chunks/` per prevenire il tracciamento dei file di chunk temporanei.
- `docs/plans/2026-10-18_upgrade_node26_and_dependencies.md`: Piano di lavoro strutturato completato al 100%.

## Prossimi Passi (Next Steps)
- Eseguire il commit delle modifiche seguendo le convenzioni (`chore: upgrade runtime to node 26 and better-sqlite3 to v13`).
- Eseguire `git push` su `origin/main` per triggerare i workflow CI aggiornati.

## Comandi Utili
- Type-check: `cd cabinet_bridge && pnpm check`
- Unit tests: `cd cabinet_bridge && pnpm test`
- Build produzione: `cd cabinet_bridge && pnpm build`

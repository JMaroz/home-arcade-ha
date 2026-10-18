# Piano di Lavoro: Upgrade Node.js 26 e Allineamento Dipendenze

**Data:** 2026-10-18  
**Stato:** In bozza / Pronto all'esecuzione  

---

## Obiettivo
Allineare l'infrastruttura di runtime (Docker, CI e ambiente locale) su **Node.js 26** e aggiornare le dipendenze chiave correlate (`better-sqlite3` a v13 per il supporto N-API, rimozione duplicato `framer-motion` a favore di `motion`, aggiornamento action CI `docker/build-push-action@v7`).

---

## Scope & Non-Goals (Ponytail / YAGNI)
- **In Scope:**
  - Aggiornamento di `cabinet_bridge/Dockerfile` a NodeSource `setup_26.x`.
  - Aggiornamento di `.github/workflows/ci.yml` a `node-version: 26`.
  - Aggiornamento di `.github/workflows/build.yml` a `docker/build-push-action@v7`.
  - Aggiornamento di `better-sqlite3` a `^13.0.3` e `@types/better-sqlite3` per compatibilità nativa Node-API su Node 26.
  - Aggiornamento `@types/node` a `^26.x`.
  - Rimozione di `framer-motion` duplicato da `package.json` (mantenendo `motion`).
  - Verifica tramite `pnpm check` e `pnpm test`.
- **Non-Goals:**
  - Non effettuare migrazioni a breaking changes non richieste su librerie UI stabili o Drizzle ORM (rimanere su `0.45.x`).
  - Nessun refactoring dell'architettura Express o TanStack Query.

---

## Task Checklist
- [x] Creazione del piano di lavoro in `docs/plans/2026-10-18_upgrade_node26_and_dependencies.md`
- [x] Aggiornamento `cabinet_bridge/Dockerfile` (`setup_26.x`, `golang:1.26-bookworm`)
- [x] Aggiornamento `.github/workflows/ci.yml` (`node-version: 26`)
- [x] Aggiornamento `.github/workflows/build.yml` (`docker/build-push-action@v7`)
- [x] Aggiornamento dipendenze in `cabinet_bridge/package.json` (`better-sqlite3@13.0.3`, rimozione `motion` duplicato non usato, fix compatibilità `IncomingMessage` in `chunk_upload.test.ts`)
- [x] Esecuzione `pnpm install` e verifica `pnpm check`
- [x] Esecuzione suite di test `pnpm test` (28/28 file passati, 175/175 test verdi)
- [x] Aggiornamento `docs/HANDOFF.md`

---

## Strategia di Verifica
1. `node -v` $\rightarrow$ verifica versione Node locale (26.x)
2. `cd cabinet_bridge && pnpm check` $\rightarrow$ type-checking TypeScript senza errori
3. `cd cabinet_bridge && pnpm test` $\rightarrow$ esecuzione suite vitest con caricamento binding `better-sqlite3` via N-API

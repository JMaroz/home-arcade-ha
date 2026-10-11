# Piano di Allineamento Add-on alle Ultime Versioni di Home Assistant

## Obiettivo
Allineare HomeArcade (`cabinet_bridge`) alle specifiche, convenzioni e standard più recenti di Home Assistant (Supervisor >= 2026.4 / Core 2026.10), aggiornando l'immagine base unificata multi-piattaforma, i metadati di configurazione, i file di traduzione UI, la documentazione e i workflow di build/linting.

## Scope & Non-Goals
- **In Scope**:
  - Verifica della versione originaria dell'add-on e documentazione dello storico.
  - Aggiornamento `Dockerfile` a `ghcr.io/home-assistant/base:latest` multi-piattaforma con standard BuildKit e OCI labels.
  - Pulizia e aggiornamento `config.yaml` (rimozione `build_from` obsoleto, aggiunta `stage: stable`, `ports_description`, fix formato YAML `---`).
  - Creazione di `translations/en.yaml` per le opzioni di configurazione e le descrizioni delle porte nell'interfaccia utente di Home Assistant.
  - Creazione di `DOCS.md` nella cartella dell'add-on per il tab documentazione in Home Assistant.
  - Aggiornamento dei workflow GitHub Actions (`build.yml`, `lint.yml`) per usare `ghcr.io/home-assistant/base:latest` e il linter aggiornato.
  - Verifica empirica con test suite e linter.
- **Non-Goals (YAGNI)**:
  - Nessuna modifica alla logica applicativa del backend Node.js o frontend React.
  - Nessuna aggiunta di dipendenze esterne.

## Task Checklist
- [x] Creare il file di piano `docs/plans/2026-10-11_align_addon_to_latest_home_assistant.md`
- [x] Aggiornare `cabinet_bridge/config.yaml` agli standard moderni HA
- [x] Creare `cabinet_bridge/translations/en.yaml` con dizionario opzioni e network
- [x] Creare `cabinet_bridge/DOCS.md` per l'Add-on Store di Home Assistant
- [x] Aggiornare `cabinet_bridge/Dockerfile` con `ghcr.io/home-assistant/base:latest` multi-arch e OCI labels
- [x] Aggiornare `.github/workflows/build.yml`
- [x] Eseguire verifica empirica (`yamllint`, `pnpm check`, `pnpm test`)
- [ ] Aggiornare `docs/HANDOFF.md`

## Strategia di Verifica
1. `PYTHONPATH=.venv/lib/python3.14/site-packages python3 .venv/bin/yamllint -c .yamllint cabinet_bridge/config.yaml repository.yaml`
2. `pnpm check`
3. `pnpm test`
4. Controllo `git diff` e `git status`

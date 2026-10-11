# Fix Fallimento GitHub Actions (Home Assistant Add-on Lint)

## Obiettivo
Risolvere la causa del fallimento sistematico delle GitHub Actions (`Lint & Validation` -> `Home Assistant Add-on Lint`) conformando il file `cabinet_bridge/config.yaml` alle specifiche e alle regole contrattuali del linter ufficiale Home Assistant (`frenck/action-addon-linter@v2`).

## Analisi Root Cause
Dai log dei workflow eseguiti su GitHub Actions (`gh run view 38131649307` e precedenti):
1. **`build_from`**: proprietà inattesa/non consentita in `config.yaml` (`Additional properties are not allowed ('build_from' was unexpected)`). Home Assistant ha deprecato `build.yaml` in favore di BuildKit nativo direttamente nel Dockerfile, e `build_from` non fa parte dello schema di `config.yaml`.
2. **`homeassistant_api: false`**: rimossa perché `false` è il valore predefinito (`'homeassistant_api' should be removed, it uses a default value`).
3. **`boot: auto`**: rimossa perché `auto` è il valore predefinito (`'boot' should be removed, it uses a default value`).

## Scope & Non-Goals
- **In Scope**:
  - Rimozione delle 3 proprietà non conformi da `cabinet_bridge/config.yaml` (`build_from`, `homeassistant_api`, `boot`).
  - Verifica della validità di `cabinet_bridge/config.yaml` e dei workflow CI.
  - Verifica TypeScript (`pnpm check`) e linting service s6.
- **Non-Goals (YAGNI)**:
  - Non modificare il Dockerfile (già usa `ARG BUILD_ARCH` con `ghcr.io/home-assistant/${BUILD_ARCH}-base:latest`).
  - Non alterare le altre pipeline o dipendenze non correlate.

## Task Checklist
- [x] Analisi dei log di errore di GitHub Actions tramite GitHub CLI e individuazione delle 3 violazioni contrattuali.
- [x] Rimozione di `build_from`, `homeassistant_api: false`, e `boot: auto` da `cabinet_bridge/config.yaml`.
- [x] Validazione sintassi YAML e rispetto della DoD (`pnpm check`, verifica s6).
- [x] Aggiornamento della documentazione (`docs/HANDOFF.md`) e commit con Conventional Commits.

## Strategia di Verifica
1. `pnpm check` in `cabinet_bridge/` per confermare che il type-check rimanga valido.
2. Esecuzione dello script di verifica s6 locale (come in CI).
3. `git diff cabinet_bridge/config.yaml` per confermare la rimozione minimale e pulita dei campi contestati.

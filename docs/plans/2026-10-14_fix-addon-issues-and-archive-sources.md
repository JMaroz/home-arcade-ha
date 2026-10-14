# Piano di Lavoro: Risoluzione Problemi Add-on, Validazione S3 Keys & Nuove Sorgenti Giochi (2026-10-14)

## Obiettivo
Risolvere i 7 problemi segnalati che rendono l'add-on HomeArcade inutilizzabile e implementare il flusso di accreditamento obbligatorio con validazione delle chiavi Internet Archive S3:
1. Scansione cartella in loop continuo / autosave impazzito.
2. Configurazioni superflue/obsolete nel tab Configurazione dell'add-on di Home Assistant.
3. Flusso Gatekeeper con Validazione S3 Keys: senza chiavi valide la ricerca e il catalogo non vengono mostrati; l'utente viene guidato ad aprire `archive.org/account/s3.php`, incollare le chiavi e validarle con test live prima di accedere al catalogo.
4. Selezione giochi da scaricare che mostrava sempre gli stessi file per qualsiasi piattaforma.
5. Download fallito con HTTP 401 Unauthorized (preservazione header `Authorization` sui redirect cross-host verso `dn*.ca.archive.org`).
6. Selezione delle sorgenti giochi che non aveva effetto nel backend.
7. Rimozione del mirror Myrient (chiuso/inutilizzabile) e aggiunta sorgenti curate (**Retro Roms "Best" Set**, **Tiny Best Set: GO!**, e Custom Collection).

## Scope & Non-Goals
- **In Scope**:
  - `server/routes/archive.ts`: nuovi endpoint `POST /api/archive/validate-keys` e `GET /api/archive/keys-status` per verificare in tempo reale le credenziali S3 contro l'API `https://archive.org/services/tasks.php` (`Authorization: LOW <accessKey>:<secretKey>`).
  - `client/src/components/ArchiveDownloadDialog.tsx`: visualizzazione condizionale / Gatekeeper: se le chiavi S3 non sono configurate o non valide, mostrare la schermata di configurazione con pulsante di apertura diretta ad `archive.org/account/s3.php`, input per Access/Secret Key, e validazione live. Solo a validazione avvenuta sbloccare il catalogo di ricerca e download.
  - `client/src/lib/integration.tsx`: fix loop infinito autosave settings (`[config, saveStatus]`).
  - `server/scanner.ts`: ottimizzazione hashing (evitare blocco sincrono MD5 su file giganti durante scansione).
  - `cabinet_bridge/config.yaml`, `translations/en.yaml`, `DOCS.md`: pulizia opzioni add-on (`data_dir` e `rom_watch_dir` rimosse; mantenute `max_upload_mb` e `steamgriddb_api_key`).
  - `server/archive-client.ts` & `server/routes/archive.ts`: supporto reale per `archiveSource` (`retro-best`, `tiny-best`, `hearto-1g1r`, `nointro-curated`, `custom`), filtraggio rigoroso dei giochi per singola piattaforma.
  - `server/archive-downloader.ts`: gestione manuale dei redirect per preservare l'header `Authorization: LOW <accessKey>:<secretKey>` verso i server storage di Internet Archive (`*.archive.org`), gestione errori 401/403 espliciti.
  - `client/src/pages/settings/GamesStorageSettings.tsx`: aggiornamento UI sorgenti (rimozione Myrient, aggiunta Retro Roms Best Set e Tiny Best Set GO, test credenziali integrato).
  - `shared/schema.ts`: aggiornamento enum `archiveSource`.
- **Non-Goals (YAGNI / Ponytail)**:
  - Nessuna dipendenza npm aggiuntiva (usiamo `fetch` nativo e standard library).
  - Nessun client BitTorrent headless: solo download HTTP/HTTPS diretto via stream con ripresa e progresso.

## Task Checklist
- [x] **Task 1: Fix Loop Infinito Autosave & Hashing Scanner**
  - [x] Rimuovere `saveStatus` dalle dipendenze di `useEffect` in `cabinet_bridge/client/src/lib/integration.tsx`.
  - [x] Ottimizzare `computeFileHash` in `cabinet_bridge/server/scanner.ts` per evitare calcoli MD5 sincroni pesanti su file > 32MB durante la scansione directory.
- [x] **Task 2: Pulizia Opzioni Add-on Home Assistant**
  - [x] Rimuovere `data_dir` e `rom_watch_dir` da `cabinet_bridge/config.yaml` (`options` e `schema`).
  - [x] Aggiornare `translations/en.yaml`, `DOCS.md`.
- [x] **Task 3: Backend Archive S3 Key Validation Endpoint**
  - [x] Implementare `POST /api/archive/validate-keys` e `GET /api/archive/keys-status` in `server/routes/archive.ts`.
  - [x] Effettuare richiesta test su `https://archive.org/services/tasks.php` con header `Authorization: LOW <accessKey>:<secretKey>`.
  - [x] Se valida, memorizzare in `storage.saveIntegrationSettings` e restituire esito positivo; altrimenti restituire errore dettagliato.
- [x] **Task 4: Gatekeeper UI in ArchiveDownloadDialog & GamesStorageSettings**
  - [x] In `ArchiveDownloadDialog.tsx`, verificare la presenza e validità delle chiavi S3 tramite `GET /api/archive/keys-status`.
  - [x] Se non presenti o non validate, bloccare la vista del catalogo e mostrare la card di onboarding guidato:
    - Spiegazione dell'obbligo di autenticazione IA.
    - Pulsante "Apri archive.org/account/s3.php" (apertura in nuova scheda).
    - Campi per Access Key e Secret Key.
    - Pulsante "Verifica e Salva Chiavi" collegato a `/api/archive/validate-keys`.
  - [x] Al completamento con successo della validazione, transizione immediata al catalogo giochi e sblocco completo di ricerca e download.
- [x] **Task 5: Backend Archive Client Multi-Source & Platform Filtering**
  - [x] Aggiornare `shared/schema.ts` con il nuovo enum `archiveSource`: `["retro-best", "tiny-best", "hearto-1g1r", "nointro-curated", "custom"]`.
  - [x] Rendere `server/archive-client.ts` e `server/routes/archive.ts` sensibili a `settings.archiveSource` e `settings.archiveCustomId`.
  - [x] Filtrare rigorosamente i giochi restituiti da `fetchPlatformGames(system)` affinché ogni console mostri solo i file pertinenti e non l'intero set globale di archivi.
- [x] **Task 6: Fix Download 401 & Preservazione Authorization su Redirect IA**
  - [x] Implementare redirect manuale in `cabinet_bridge/server/archive-downloader.ts` per preservare `Authorization: LOW ...` e User-Agent sui redirect `302/301` verso nodi storage IA (`dn*.archive.org` / `ia*.archive.org`).
  - [x] Gestire in modo amichevole e chiaro gli errori 401/403.
- [x] **Task 7: Aggiornamento Frontend Impostazioni Storage**
  - [x] In `GamesStorageSettings.tsx`, sostituire Myrient con "Retro Roms 'Best' Set" e "Tiny Best Set: GO!".
  - [x] Aggiungere lo stato visivo di validazione delle chiavi S3 con test integrato e feedback immediato.
- [x] **Task 8: Test & Validazione**
  - [x] Eseguire `pnpm check` (tsc).
  - [x] Eseguire la suite di test `pnpm test` (vitest - 20 suite, 133 test passati).
  - [x] Aggiornare `docs/HANDOFF.md`.

## Strategia di Verifica
1. `pnpm --dir cabinet_bridge check`: Type-check TypeScript completato con 0 errori.
2. `pnpm --dir cabinet_bridge test`: Unit test Vitest per routes, archive, scanner tutti passati (20/20 test files, 133/133 test).
3. `pnpm run build`: Build di produzione (client Vite + bundle Node.js esbuild) eseguita con successo.

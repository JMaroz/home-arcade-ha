# Handoff Sessione: Risoluzione Add-on, S3 Keys Gatekeeper & Sorgenti Archive

**Data**: 2026-10-14  
**Stato**: Completato e Verificato con Successo (DoD Validata)

---

### Stato Corrente
- **Gatekeeper Autenticazione S3**: Senza credenziali S3 configurate, il catalogo e la ricerca in `ArchiveDownloadDialog` vengono bloccati. Viene presentata una schermata di onboarding con link diretto a `archive.org/account/s3.php`, input per Access/Secret Key e validazione live via `POST /api/archive/validate-keys` prima dello sblocco.
- **Fix Download 401 Unauthorized**: Implementato redirect manuale in `archive-downloader.ts` per preservare l'header `Authorization: LOW ...` verso i nodi di storage (`*.archive.org`), evitando la rimozione automatica dell'header da parte di WHATWG Fetch.
- **Filtro Rigoroso Piattaforme**: Implementata la funzione `isPlatformFile` in `archive-client.ts`; la selezione di una console mostra unicamente i file e i pack pertinenti, eliminando la duplicazione dell'intero set globale su tutte le schede.
- **Supporto Multi-Sorgente**: Aggiunte le sorgenti `retro-best` (**Retro Roms "Best" Set**) e `tiny-best` (**Tiny Best Set: GO!**), rimosso il mirror dismesso Myrient e collegato `archiveSource` nei resolver dei metadati.
- **Fix Loop Autosave & Scanner**: Rimosso `saveStatus` dalle dipendenze di `useEffect` in `integration.tsx` per fermare le continue chiamate `PUT /api/settings/integration`. Ottimizzato l'hashing in `scanner.ts` per file superiori a 32 MB.
- **Pulizia Manifest Add-on**: Rimosse le opzioni ridondanti `data_dir` e `rom_watch_dir` da `config.yaml`, `translations/en.yaml` e `DOCS.md`.

---

### File Rilevanti
- `cabinet_bridge/client/src/components/ArchiveDownloadDialog.tsx`: Schermata Gatekeeper con link S3 diretto, validazione live e sblocco catalogo.
- `cabinet_bridge/server/routes/archive.ts`: Endpoints `POST /api/archive/validate-keys` e `GET /api/archive/keys-status`, sorgenti dinamiche.
- `cabinet_bridge/server/archive-downloader.ts`: Loop manuale di redirect HTTP con persistenza credenziali S3 e gestione errori 401.
- `cabinet_bridge/server/archive-client.ts`: Configurazioni multi-sorgente (`retro-best`, `tiny-best`, `hearto-1g1r`) e filtro `isPlatformFile`.
- `cabinet_bridge/client/src/pages/settings/GamesStorageSettings.tsx`: Aggiornamento schede sorgenti e pulsante test credenziali S3.
- `cabinet_bridge/client/src/lib/integration.tsx`: Eliminazione loop infinito autosave.
- `cabinet_bridge/server/scanner.ts`: Hashing bound su file > 32 MB e chiusura stream SSE.
- `cabinet_bridge/config.yaml`: Rimozione opzioni obsolete `data_dir` e `rom_watch_dir`.

---

### Prossimi Passi (Next Steps)
1. **Verifica Installazione Add-on HA**: Ricostruire/aggiornare l'add-on in Home Assistant OS e verificare che la scheda Configurazione mostri solo `max_upload_mb` e `steamgriddb_api_key`.
2. **Test Download Reale su HA**: Inserire le proprie chiavi S3 nell'interfaccia dell'add-on, verificare lo sblocco immediato del catalogo ed effettuare il download di un set di giochi.
3. **Monitoraggio Spazio Storage**: Verificare che la decompressione dei set estratti su `/data/roms` o mount Samba mantenga le quote disco corrette.

---

### Comandi Utili
- `cd cabinet_bridge && pnpm check`: Type check TypeScript (0 errori).
- `cd cabinet_bridge && pnpm test`: Esecuzione test suite Vitest (20 suite, 133 test passati).
- `cd cabinet_bridge && pnpm run build`: Build di produzione client Vite + bundle server CJS.
- `PORT=5001 pnpm dev`: Avvio dev server locale (evita conflitto porta 5000 AirPlay su macOS).

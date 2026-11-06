# Handoff Sessione — 2026-11-06

## Stato Corrente
- **Completate con successo tutte le 4 fasi del piano** [docs/plans/2026-11-06_fix_neogeo_arcade_performance_and_metadata.md](file:///Users/andrea/Repository/home-arcade-ha/docs/plans/2026-11-06_fix_neogeo_arcade_performance_and_metadata.md):
  1. **Pacing WebRTC & Frame Duration Fix**: Implementata in `native-runner/main.go` la funzione `CalculateSampleDuration` che calcola la durata reale del sample RTP in base ai frame emulati dall'ultimo frame inviato, azzerando la deriva cumulativa video rispetto all'audio Opus quando intervengono frame drop.
  2. **Priorità CPU Ripristinata**: Rimosso il depotenziamento `os.setPriority(child.pid, 10)` in `runner-manager.ts` e impostato priorità standard `0`.
  3. **Catalogo Driver Arcade & Neo Geo**: Creato [cabinet_bridge/shared/arcade-catalog.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/shared/arcade-catalog.ts) con mappature canoniche No-Intro / Libretro, titoli puliti e metadati per i 140 giochi Neo Geo MVS e principali classici arcade.
  4. **Integrazione Scraper, Downloader e Migrazione Retroattiva**: `findLibretroBoxArt`, `metadata-fetcher`, `archive-downloader` e `routes/roms.ts` risolvono automaticamente i nomi brevi (`mslug` → `Metal Slug - Super Vehicle-001`). Gli endpoint `scrape-missing` e `scrape-all` riconciliano retroattivamente i giochi esistenti nel DB.
- Tutti i test Go (100%), Typecheck TypeScript (`tsc --noEmit`), suite Vitest (30 suite, 186 test) e build di produzione completati con successo.

## File Rilevanti
- [cabinet_bridge/server/native-runner/main.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/main.go): Fix durata sample RTP e pacing asincrono video.
- [cabinet_bridge/server/native-runner/main_test.go](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/native-runner/main_test.go): Test unitari del calcolo della durata del sample video.
- [cabinet_bridge/server/stream/runner-manager.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/stream/runner-manager.ts): Priorità normale CPU (0) per il Native Runner.
- [cabinet_bridge/shared/arcade-catalog.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/shared/arcade-catalog.ts): Catalogo ufficiale MVS Neo Geo e Arcade.
- [cabinet_bridge/shared/__tests__/arcade-catalog.test.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/shared/__tests__/arcade-catalog.test.ts): Test di risoluzione driver e alias.
- [cabinet_bridge/server/metadata-fetcher.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/metadata-fetcher.ts): Recupero metadati canonici per driver arcade.
- [cabinet_bridge/server/routes/scrape.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/scrape.ts): Matching copertine dirette Libretro e migrazione titoli esistenti.
- [cabinet_bridge/server/archive-downloader.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/archive-downloader.ts): Assegnazione titolo canonico durante download o estrazione set.
- [cabinet_bridge/server/routes/roms.ts](file:///Users/andrea/Repository/home-arcade-ha/cabinet_bridge/server/routes/roms.ts): Risoluzione titolo canonico all'upload di file zip arcade.

## Prossimi Passi (Next Steps)
- Eseguire in UI "Scrape Missing" o "Scrape All" dalla sezione Manutenzione / Libreria per aggiornare le copertine e i titoli dei giochi Neo Geo già presenti nel DB.
- Avviare Metal Slug in HomeArcade e verificare la perfetta fluidità e sincronizzazione audio/video.

## Comandi Utili
- Test Unitari Go: `cd cabinet_bridge/server/native-runner && /usr/local/bin/go test -v ./...`
- Typecheck TypeScript: `cd cabinet_bridge && ./node_modules/.bin/tsc --noEmit`
- Test Vitest: `cd cabinet_bridge && ./node_modules/.bin/vitest run`
- Build Produzione: `cd cabinet_bridge && ./node_modules/.bin/tsx script/build.ts`

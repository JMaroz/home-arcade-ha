# Handoff Sessione: Fix Decompressione Archivi ZIP > 2GB & Sincronizzazione v2.64.0

**Data**: 2026-10-16  
**Stato**: Allineato con origin/main (v2.64.0), Conflitti Risolti e DoD Validata (100% Pass)

---

### Stato Corrente
- **Sincronizzazione con Remote**: Eseguito `git fetch origin` e `git pull origin main` integrando i 30 commit remoti fino al rilascio `v2.64.0` (inclusi `GlobalDownloadBanner`, metadata scraper, single-rom decompression e curator).
- **Risoluzione Conflitti e Decompressione > 2GB**: Risolto il conflitto in `archive-downloader.ts` e `zip.ts`. La decompressione precedente usava `fs.readFile` in memoria provocando `RangeError [ERR_FS_FILE_TOO_LARGE]` su file > 2GB. È stata integrata l'estrazione disk-to-disk streaming (`extractZipArchive`) con notifica progressi integrata con `job.extractionProgress` e `GlobalDownloadBanner`.
- **Supporto ZIP64 e Multi-tool**: `zip.ts` rileva `7zz`, `7z` o `unzip` sul sistema (inclusi nel runtime container tramite `Dockerfile`), con fallback su streaming Node.js (`zlib.createInflateRaw` + Central Directory ZIP64). Zero buffering in RAM.
- **DoD e Validazione Completa**: `pnpm check` (0 errori), `pnpm test` (22 suite passate, 141 test passati), `pnpm build` (bundle completato con successo).

---

### File Rilevanti
- `cabinet_bridge/server/zip.ts`: Implementata `extractZipArchive`, `listZipArchive` (ZIP64 streaming parser), supporto callback `onProgress` e fallback streaming puro Node.js.
- `cabinet_bridge/server/archive-downloader.ts`: Decompressione disk-to-disk senza `fs.readFile`, calcolo MD5 in streaming con `computeFileHash`, e report progresso a `job.extractionProgress`.
- `cabinet_bridge/Dockerfile`: Aggiunti `unzip` e `7zip` nei pacchetti Debian Bookworm per accelerare l'estrazione nell'add-on HA.
- `cabinet_bridge/server/__tests__/zip_stream.test.ts`: Suite di test per streaming ZIP, appiattimento, fallback Node.js e protezione Zip Slip.
- `docs/plans/2026-10-16_fix-zip-decompression-large-files.md`: Piano operativo completato e tracciato.

---

### Prossimi Passi (Next Steps)
1. **Commit & Push**: Creare commit Conventional Commits (`fix: stream zip decompression to support files larger than 2gb`) e fare push su `origin/main`.
2. **Test Download Reale su HA**: Verificare su Home Assistant il download di un set di grandi dimensioni (es. PSX > 2GB o Tiny Best Set) controllando che `GlobalDownloadBanner` mostri correttamente avanzamento download ed estrazione senza errori di memoria.

---

### Comandi Utili
- `cd cabinet_bridge && pnpm check`: Type-check TypeScript (0 errori).
- `cd cabinet_bridge && pnpm test`: Esecuzione test suite completa (22 suite, 141 test passati).
- `cd cabinet_bridge && pnpm run build`: Build di produzione client Vite + bundle server CJS.
- `PORT=5001 pnpm dev`: Avvio dev server locale (evita conflitto porta 5000 AirPlay su macOS).

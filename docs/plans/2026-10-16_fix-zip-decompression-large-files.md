# Piano di Lavoro: Risoluzione Decompressione File ZIP > 2GB (Archive Downloads & Full Sets)

## Obiettivo
Consentire all'add-on di scaricare e decomprimere correttamente archivi ZIP di qualsiasi dimensione (> 2GB, > 4GB, inclusi ZIP64 e collezioni complete da 30-50GB come PS1 e Tiny Best Set) eliminando il caricamento in memoria (`Buffer.constants.MAX_LENGTH` limit / `ERR_FS_FILE_TOO_LARGE`) e adottando un'estrazione streaming su disco (disk-to-disk) ad alte prestazioni.

## Scope & Non-Goals
- **In Scope:**
  - `cabinet_bridge/server/zip.ts`: implementazione di `extractZipArchive(zipPath, destDir, options)` con supporto disk-to-disk per archivi di dimensioni arbitrarie e callback `onProgress`. Riconoscimento ed esecuzione nativa di tool di sistema (`7zz`, `7z`, `unzip`) con fallback su streaming Node.js stdlib (Central Directory / ZIP64 / inflateRaw stream).
  - `cabinet_bridge/server/archive-downloader.ts`: sostituzione di `fs.readFile(partFilePath)` + `extractZip(zipData)` con `extractZipArchive(partFilePath, systemDir)` mantenendo le novità da `origin/main` (integrazione metadata scraping, unificazione progress bar `GlobalDownloadBanner`, hashing incrementale).
  - `cabinet_bridge/Dockerfile`: installazione di `unzip` e `7zip` nell'immagine runtime Debian Bookworm per garantire estrazione nativa multi-thread ultra-rapida in produzione.
  - Test unitari in `server/__tests__/zip_stream.test.ts` per validare l'estrazione disk-to-disk, gestione path traversal (Zip Slip), file annidati e sanitizzazione.
  - Sincronizzazione con `origin/main` (v2.64.0) e validazione su tutte le 22 suite di test.
- **Non-Goals:**
  - Sostituire `createZip` o `extractZip` in-memory usati per i backup di salvataggio leggeri (vault/saves).
  - Modificare il core Libretro o l'emulatore.

## Task Checklist
- [x] Eseguire `git fetch origin` e `git pull origin main` per allineare il branch locale (avanzato di 30 commit alla v2.64.0).
- [x] Integrare e risolvere i conflitti tra le modifiche remote (`GlobalDownloadBanner`, metadata scraping, decompressione singoli/full set) e l'estrazione streaming disk-to-disk.
- [x] Creare/aggiornare `extractZipArchive` in `cabinet_bridge/server/zip.ts` con supporto streaming disk-to-disk, `onProgress`, auto-detection di `7z`/`7zz`/`unzip` e fallback puro Node.js per ZIP/ZIP64.
- [x] Aggiornare `cabinet_bridge/server/archive-downloader.ts` per utilizzare `extractZipArchive`, `computeFileHash` e indicizzare i file estratti direttamente dal filesystem.
- [x] Aggiornare `cabinet_bridge/Dockerfile` per installare `unzip` e `7zip` nell'immagine runtime Debian.
- [x] Creare test dedicati per `extractZipArchive` in `cabinet_bridge/server/__tests__/zip_stream.test.ts`.
- [x] Verificare che `pnpm check`, `pnpm test` (22/22 suite, 141/141 test passati) e `pnpm build` passino con esito positivo.
- [x] Aggiornare `docs/HANDOFF.md` sovrascrivendo l'intero file in formato compatto (30-60 righe).

## Strategia di Verifica
- Esecuzione `pnpm check` da `cabinet_bridge/` per verificare il type checking TypeScript (0 errori).
- Esecuzione `pnpm vitest run server/__tests__/zip_stream.test.ts` (4/4 test passati).
- Esecuzione `pnpm test` (22 suite passate, 141 test passati).
- Esecuzione `pnpm build` (build client Vite + bundle server CJS completata in 3.3s).

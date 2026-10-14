# Handoff Sessione: Internet Archive First, Metadata & Storage Overhaul

**Data**: 2026-10-14  
**Stato**: Completato e Verificato con Successo (DoD Validata)

---

### Stato Corrente
- **Internet Archive First Management**: Implementato download diretto 1G1R No-Intro sia per singolo gioco che per collezioni complete da Internet Archive, con pre-flight quota check (`statfs`), BIOS gating (`REQUIRED_BIOS`) e badge prestazionali HW (`CORE_PERFORMANCE_TIERS`).
- **Metadata Deterministici**: Sostituito lo scraping euristico/fuzzy con risoluzione deterministica $1:1$ delle copertine Libretro (`thumbnails.libretro.com/{playlist}/Named_Boxarts/{cleanTitle}.png`).
- **Riprogettazione Impostazioni ("Giochi & Archiviazione")**:
  - Nuova scheda `GamesStorageSettings.tsx` con 4 card modulari (Sorgenti IA/Myrient/S3, Cartella ROM & Spazio Disco con allarmi, Libreria scaricata con contatore e rimozione per singola console, Manutenzione e reset totale libreria preservando i salvataggi).
  - Integrata in `Settings.tsx` e collegata al First-Run `SetupWizardDialog.tsx`.
  - Empty state reattivo e pulsante rapido "Scarica Giochi" integrati in `HomeArcadeTheme.tsx`.
- **Scanner Passivo**: Declassato il loop aggressivo a intervallo di 1 ora con trigger on-demand.

---

### File Rilevanti
- `cabinet_bridge/server/archive-client.ts`: Client REST metadata Archive.org, cataloghi No-Intro e gating hardware.
- `cabinet_bridge/server/archive-downloader.ts`: Streaming Range HTTP, quota check preventivo e auto-indicizzazione DB con fallback a `ROM_ROOT`.
- `cabinet_bridge/server/routes/archive.ts`: Endpoints `/api/archive/systems`, `/catalog`, `/download`, `/downloads`, `/cancel/:jobId`.
- `cabinet_bridge/server/routes/scrape.ts`: Risoluzione deterministica box art e gestione estensioni con `path.extname`.
- `cabinet_bridge/client/src/pages/settings/GamesStorageSettings.tsx`: Pannello Impostazioni "Giochi & Archiviazione".
- `cabinet_bridge/client/src/components/ArchiveDownloadDialog.tsx`: Dialog modale per sfogliare e scaricare titoli/full set.
- `cabinet_bridge/client/src/components/dashboard-themes/HomeArcadeTheme.tsx`: Header button e empty state per download istantaneo.
- `cabinet_bridge/server/__tests__/archive.test.ts`: Suite di test nativi per box art deterministica e rotte Archive.

---

### Prossimi Passi (Next Steps)
1. **Verifica End-to-End su Home Assistant**: Validare il download di un set di giochi reale dentro l'iframe Ingress su Home Assistant OS con mount Samba `/share/roms`.
2. **Supporto Mirror Aggiuntivi**: Eventuale aggiunta di mirror diretti opzionali (es. WebDAV privato o server NAS locale) nel selettore delle sorgenti di `GamesStorageSettings`.
3. **Integrazione Piattaforme Future**: Collegare i cataloghi di PSP, PS2 e Xbox (documentati in `docs/adr/003-platforms-feasibility-psp-ps2-xbox.md`) quando i rispettivi runner saranno attivi.

---

### Comandi Utili
- `cd cabinet_bridge && pnpm check`: Type check TypeScript (0 errori).
- `cd cabinet_bridge && pnpm test`: Esecuzione test suite Vitest (20 suite, 130 test passati).
- `cd cabinet_bridge && pnpm build`: Build di produzione client Vite + bundle server CJS.
- `PORT=5001 pnpm dev`: Avvio dev server locale (evita conflitto porta 5000 AirPlay su macOS).

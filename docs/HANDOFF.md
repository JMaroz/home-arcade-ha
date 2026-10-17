# Project Handoff: PS2 System Image Fix & HLTB Resilience

## Stato Corrente
- **Validazione Performance PS1**: Verificato il log di sessione di 5 minuti su *Disney's Hercules Action Game* (PS1, core `pcsx_rearmed` aarch64 Dynarec). Confermato rendering a 60.00 FPS costanti con 0 frame drop (17.700 frame consegnati), latenza canali di controllo a 3.89ms e salvataggi istantanei (47ms).
- **Risoluzione 404 Immagine Console PS2**: Sostituito l'URL errato di KyleBing con l'asset ufficiale Libretro/RetroArch (`Sony - PlayStation 2.png` da `libretro/retroarch-assets`).
- **Resilienza HowLongToBeat (HLTB)**: 
  - Risolto il flooding di errori 403 causati dalle protezioni anti-bot upstream di HowLongToBeat.
  - Introdotti negative caching SQLite (24h) e circuit breaker in memoria con cooldown di 15 minuti su blocchi 403.
  - Aggiunta sanitizzazione automatica del titolo (`cleanTitleForHltb`) e log informativo pulito senza stack trace.
  - L'endpoint `/api/roms/:id/hltb` risponde istantaneamente con `{ found: false }` per le ROM non trovate o durante i blocchi upstream.

## File Rilevanti
- `cabinet_bridge/shared/system-images.ts`: Aggiornato URL per la silhouette console PS2 a Libretro/RetroArch.
- `cabinet_bridge/server/hltb.ts`: Implementati circuit breaker, negative caching (24h TTL) e sanitizzazione titoli.
- `cabinet_bridge/server/routes/roms.ts`: Gestione sicura del fallback `{ found: false }` su record negativi HLTB.
- `cabinet_bridge/server/__tests__/hltb.test.ts`: Suite di test unitari per helper HLTB, circuit breaker e caching (15 test passati).
- `docs/plans/2026-10-17_fix-ps2-system-image-and-hltb-resilience.md`: Piano di lavoro completato.

## Prossimi Passi (Next Steps)
1. Eseguire commit atomico (`fix: resolve ps2 system image 404 and improve hltb resilience`).
2. Rilasciare aggiornamento su GitHub se si desidera includere le correzioni nella prossima build.

## Comandi Utili
- `pnpm check`: Type-check TypeScript (0 errori).
- `pnpm test server/__tests__/hltb.test.ts`: Esecuzione test unitari HLTB (15 test).
- `pnpm test shared/__tests__/system-images.test.ts`: Test del registry console (7 test).
- `pnpm build`: Build di produzione client Vite e server Express.

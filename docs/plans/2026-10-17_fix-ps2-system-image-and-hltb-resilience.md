# Piano: Fix PS2 System Image 404 e Resilienza HowLongToBeat (HLTB)

## Obiettivo
Risolvere le due anomalie identificate nell'analisi del log di sessione:
1. Eliminare l'errore 404 continuo su `GET /api/system-images/ps2` sostituendo l'URL non esistente con l'icona ufficiale Libretro/RetroArch (`Sony - PlayStation 2.png`).
2. Rendere resiliente il servizio HowLongToBeat (`cabinet_bridge/server/hltb.ts`):
   - Introdurre negative caching (`hltb_cache`) quando HLTB non trova il gioco o restituisce 403 / errori di rete, evitando di rieseguire richieste a vuoto ad ogni click.
   - Implementare un circuit-breaker in memoria: in caso di blocco 403 o down del servizio upstream, evitare di bloccare o rallentare le richieste client per un periodo di cooldown (15 minuti).
   - Silenziare il log spam sostituendo lo stack trace di `console.error` con un log pulito/informativo.

## Scope & Non-Goals
- **In Scope**:
  - `cabinet_bridge/shared/system-images.ts`: Aggiornamento della configurazione per `ps2`.
  - `cabinet_bridge/server/hltb.ts`: Gestione errori 403, negative caching in `storage.saveHltbCache`, circuit breaker in memoria con cooldown.
  - `cabinet_bridge/server/routes/roms.ts`: Gestione sicura del fallback per risultati con HLTB non trovato o nullo.
  - Test unitari per `system-images` e `hltb`.
- **Non-Goals (YAGNI)**:
  - Non aggiungere nuove dipendenze pesanti o scraper headless (Puppeteer/Playwright) per bypassare Cloudflare.
  - Non toccare l'emulatore o il protocollo WebRTC che funzionano già a 60 FPS costanti.

## Task Checklist
- [x] 1. Aggiornare l'entry `ps2` in `cabinet_bridge/shared/system-images.ts` con l'URL valido Libretro/RetroArch.
- [x] 2. Aggiornare `cabinet_bridge/server/hltb.ts` con negative caching, circuit-breaker e logging pulito per 403.
- [x] 3. Verificare `cabinet_bridge/server/routes/roms.ts` per garantire risposta coerente `{ found: false }` sui record negativi.
- [x] 4. Aggiungere test unitario per `hltb.ts` (caching, fallback su errore, circuit breaker).
- [x] 5. Eseguire verifica empirica (`pnpm check` e `pnpm test shared/__tests__/system-images.test.ts` e test HLTB).
- [x] 6. Aggiornare `docs/HANDOFF.md`.

## Strategia di Verifica
- `pnpm check` da `cabinet_bridge/` per type-check TypeScript.
- `pnpm test shared/__tests__/system-images.test.ts` per validità del registry console.
- Test unitario dedicato a HLTB per verificare che:
  - Un risultato cached non chiami upstream.
  - Un errore 403 salvi il record negativo e ritorni `found: false`.
  - Il circuit breaker risponda istantaneamente senza ulteriori chiamate durante il cooldown.

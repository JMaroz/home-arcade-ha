# Piano di Lavoro: Elevazione README (Product Marketing & Tech Leadership Showcase)

**Data**: 2026-11-06  
**Autore**: Product Marketing Manager & Tech Leader  
**Stato**: In corso  

---

## 1. Obiettivo
Riscrivere e trasformare radicalmente il file `README.md` principale del progetto. Il nuovo README deve:
1. **Celebrare l'identità e il valore di HomeArcade**: non solo un add-on tecnico, ma una vera e propria console cloud retrogaming integrata nello smart home per TV, PC, tablet, mobile e cabinati arcade fai-da-te.
2. **Elevare i successi ingegneristici (Tech Leader)**: mostrare con orgoglio l'architettura dual-engine (Native CGO Libretro + WebRTC streaming 60FPS a bassissima latenza + WASM fallback), stack React 19 + Tailwind v4 + Vite 8, Drizzle ORM + better-sqlite3, auto-detection binario, integrazione entità HA e multi-arch RPi/x86.
3. **Migliorare la UX per l'utente (Product Marketing)**: badge professionali (incluso One-Click Add to Home Assistant), guide chiare, showcase delle feature d'eccellenza (Internet Archive downloader, Warp Link QR, Netplay multiplayer, automazioni luci smart home, RetroAchievements, Kiosk mode).
4. **Sincronizzare le informazioni**: aggiornare versione a 2.66.5 (post rilascio v2.66.5), correggere percorsi rotti di screenshot/asset, rimuovere lo storico changelog prolisso a favore del link a `CHANGELOG.md`.

---

## 2. Scope & Non-Goals

### In Scope
- Creazione della struttura README di classe mondiale (Hero, Value Prop, Feature Highlights, Supported Systems, Tech Architecture, Quick Start, Home Assistant Integration & Automations, FAQ, Community).
- Rimozione del changelog monolitico e obsoleto dal README (reindirizzando a `CHANGELOG.md`).
- Aggiunta del badge interattivo "My Home Assistant" (One-Click Repository Install).
- Valorizzazione grafica con asset esistenti (`docs/assets/banner.png`, `social-preview.png`).
- Sintesi chiara dei comandi di configurazione e risoluzione problemi.

### Non-Goals (YAGNI)
- Modifica al codice TypeScript, Go o configurazioni Docker (questo task riguarda puramente documentazione e presentazione di prodotto).
- Creazione di nuovi screenshot esterni non presenti nel repo (usare gli asset consolidati in `docs/assets/`).

---

## 3. Task Checklist
- [x] Analisi approfondita delle feature reali del codebase (WebRTC Go runner, Internet Archive, HA publisher, Lovelace card, cloud sync, ecc.)
- [x] Stesura del piano di lavoro formale in `docs/plans/`
- [x] Redazione e applicazione del nuovo `README.md`
- [x] Validazione visiva e dei link (markdown linting, badge check, file anchors)
- [x] Aggiornamento snapshot `docs/HANDOFF.md`

---

## 4. Strategia di Verifica
- Verifica integrità sintassi markdown.
- Verifica coerenza versione (`2.66.4` da `config.yaml`).
- Verifica URL del repository (`https://github.com/JMaroz/HomeArcade-HA`).
- Controllo assenza link a immagini inesistenti (es. rimozione `docs/screenshots/`).

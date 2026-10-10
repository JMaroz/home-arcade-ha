# Fix WebRTC Stream Player Ingress Routing, Go Runner Compilation & Engine Default

**Data**: 2026-10-10  
**Stato**: In corso  
**Issue**: L'avvio dei giochi con motore WebRTC fallisce sistematicamente ("Con tutti i giochi da errore"), con schermata di errore nel player e fallback a WebAssembly non funzionante sotto Ingress.

---

## 1. Obiettivo

Risolvere la causa radice del mancato funzionamento di WebRTC e degli errori al lancio dei giochi:
1. Risolvere l'assenza del prefisso Home Assistant Ingress (`/api/hassio_ingress/<token>`) in `server/routes/streamPlayer.ts` per tutte le chiamate API (`/api/stream/start`, `/api/stream/signal`, `/api/stream/candidate`, `/api/stream/stop`) e nel link di fallback WASM.
2. Correggere `go.mod` e `go.sum` nel runner Go (`server/native-runner/`) e rendere la build del binario `/homearcade-runner` deterministica nel `Dockerfile` (rimuovendo il silent failure `|| echo "Fallback runner"`).
3. Ripristinare `"wasm"` (WebAssembly) come motore predefinito sicuro e stabile in `GameDetailDialog.tsx` come sancito da ADR 001, mantenendo `"native"` selezionabile dall'utente.

---

## 2. Scope & Non-Goals

- **In Scope**:
  - Prefisso Ingress dinamico (rilevamento sia server-side via `req.originalUrl` / `x-ingress-path` sia client-side via `window.location.pathname`) in `streamPlayer.ts`.
  - Fix delle chiamate `fetch` e del link `wasmPlayerUrl` in `streamPlayer.ts`.
  - Fix dipendenze Go (Pion WebRTC v4) in `server/native-runner/go.mod` e `go.sum` con Go 1.22.
  - Verifica della presenza del binario del runner nativo in `Dockerfile`.
  - Impostazione di default su `"wasm"` in `GameDetailDialog.tsx`.
  - Test automatici per verificare che `streamPlayer` includa l'ingressBase e che le route rispondano correttamente.
- **Non-Goals** (YAGNI):
  - Non riscrivere l'architettura dei core Libretro o aggiungere encoder hardware ffmpeg/gstreamer complessi in questa fase.
  - Non rimuovere la funzionalità di streaming WebRTC, bensì renderla funzionante e priva di 404 sotto Ingress.

---

## 3. Task Checklist

- [x] **Fase 1: Fix Ingress Routing in Stream Player**
  - [x] Aggiornare `server/routes/roms.ts` per estrarre `ingressBase` e passarlo a `renderStreamPlayerPage`.
  - [x] Aggiornare `server/routes/streamPlayer.ts` per rilevare dinamicamente `ingressBase` nel browser e utilizzarlo in tutte le chiamate `fetch` (`/api/stream/*`) e nei link (`/api/roms/*/player`).
  - [x] Migliorare la gestione degli errori in `streamPlayer.ts` per mostrare il messaggio di errore reale ritornato dal server.
- [x] **Fase 2: Fix Build Runner Go e Dockerfile**
  - [x] Allineare `go.mod` a `go 1.22` compatibile con `golang:1.22-alpine`.
  - [x] Verificare che `go.sum` includa tutti i moduli Pion v4.
  - [x] Aggiornare `Dockerfile` per fallire immediatamente se `go build` fallisce e garantire `chmod a+x` del binario.
- [x] **Fase 3: Default Engine Stabile in UI**
  - [x] Impostare il default di `engine` in `GameDetailDialog.tsx` su `"wasm"`, consentendo lo switch manuale su `"native"`.
- [x] **Fase 4: Verifica Empirica & Test**
  - [x] Compilazione verificata con `go build` per il runner Go.
  - [x] Unit test per rendering e routing Ingress dello stream player aggiunti in `setup.test.ts`.
  - [x] Aggiornare `docs/HANDOFF.md`.

---

## 4. Strategia di Verifica

```bash
cd cabinet_bridge
pnpm check
pnpm test
```

# Piano di Lavoro: Esposizione Diretta del Contenuto Tab Firmware (Settings)

## Obiettivo
Rimuovere il wrapper collassabile `<Section>` all'interno del tab "Firmware" (`health`) in `Settings.tsx`, esponendo direttamente `<BiosManager />` in modo che all'apertura del tab tutto il contenuto (specifiche di sistema, stato dei BIOS per core, pulsanti di download/upload) sia immediatamente visibile senza richiedere un'azione manuale di espansione.

## Scope & Non-Goals
- **Scope**:
  - Modifica di `cabinet_bridge/client/src/pages/Settings.tsx` per rimuovere `<Section>` e renderizzare `<BiosManager />` come contenuto diretto del tab.
  - Pulizia degli import (`Section` non più necessario in `Settings.tsx`).
- **Non-Goals (YAGNI)**:
  - Nessuna modifica interna a `BiosManager.tsx` o `SettingsShared.tsx`.
  - Nessuna modifica a chiavi i18n o API backend di gestione BIOS.

## Task Checklist
- [x] Rimuovere il wrapper `<Section>` attorno a `<BiosManager />` in `Settings.tsx`
- [x] Rimuovere l'import di `Section` da `Settings.tsx`
- [x] Eseguire `pnpm check` (typecheck)
- [x] Eseguire `pnpm test client` (unit test)
- [x] Aggiornare `docs/HANDOFF.md` sovrascrivendolo

## Strategia di Verifica
- `pnpm check` da `cabinet_bridge/` per verificare che non vi siano errori di tipo TypeScript o import pendenti.
- `pnpm test client` da `cabinet_bridge/` per verificare i test di regressione del client.

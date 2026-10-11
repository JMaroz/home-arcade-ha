# Handoff Sessione: Diagnostica Live, Ring Buffer Log Runner & Bump 2.57.2

**Data**: 2026-10-11  
**Stato**: Identificato empiricamente che l'istanza Home Assistant a `192.168.1.67` stava ancora eseguendo la vecchia build (stesso Ingress token attivo, mancato rebuild/update del container). Aggiunto endpoint di telemetria e diagnostica `/api/stream/debug`, buffer circolare per i log stdout/stderr del runner, panic recovery nel media loop, lettura dinamica della versione da `package.json`, e bump dell'add-on a `2.57.2`.

---

## 1. Stato Corrente & Diagnosi Empirica
- **Causa Schermo Nero Corrente su HA**:
  - Il token di Ingress (`_WmZNdMkVWC-nTaDAEHsnrwL5QAusz-LsFA0d1dEwXA`) è rimasto invariato per oltre 1 ora: l'add-on non è stato riavviato né aggiornato/ricostruito.
  - L'istanza in esecuzione conteneva la vecchia build che non estraeva le ROM `.zip` e non disponeva del nuovo encoder Cgo `libvpx`.
- **Miglioramenti Diagnostici Implementati**:
  - `cabinet_bridge/server/stream/runner-manager.ts`: Buffer circolare di 200 righe (`runnerLogs`) che cattura in tempo reale stdout, stderr ed exit code di `homearcade-runner`.
  - `cabinet_bridge/server/routes/stream.ts`: Nuovo endpoint `GET /api/stream/debug` per ispezionare stato processi, percorsi binari e log del runner via HTTP.
  - `cabinet_bridge/server/native-runner/main.go`: Panic recovery in `runMediaStreamLoop()`, log di progresso e statistiche streaming ogni 5 secondi (`[runner:stream] Stats @ N frames`).
  - `cabinet_bridge/server/index.ts`: Corretta la lettura dinamica della versione dell'app direttamente da `package.json` in `/api/debug`.
- **Version Bump**: Incrementata versione a `2.57.2` in `config.yaml` e `package.json`.

---

## 2. File Rilevanti
- `cabinet_bridge/server/native-runner/main.go`: Panic recovery e statistiche periodiche frame video/audio.
- `cabinet_bridge/server/stream/runner-manager.ts`: Ring buffer `runnerLogs` e `getDebugInfo()`.
- `cabinet_bridge/server/routes/stream.ts`: Endpoint `GET /api/stream/debug`.
- `cabinet_bridge/server/index.ts`: Lettura dinamica `pkg.version` in `/api/debug`.
- `cabinet_bridge/config.yaml` & `package.json`: Version bump a 2.57.2.

---

## 3. Prossimi Passi (Next Steps)
1. **Aggiornamento Add-on su Home Assistant**:
   - In Home Assistant andare su **Impostazioni** -> **Componenti aggiuntivi** -> **Raccolta di componenti aggiuntivi**.
   - Cliccare sui tre puntini in alto a destra (⋮) -> **Controlla aggiornamenti**.
   - Sulla scheda **HomeArcade** cliccare **Aggiorna** (o **Ricostruisci**). Attendere il completamento della build Docker.
2. **Validazione Empirica**:
   - Aprire `http://192.168.1.67:5000/api/stream/debug` per verificare che il runner sia attivo e privo di errori.
   - Avviare ROM 251 da Home Assistant e verificare la riproduzione video a 60 FPS.

---

## 4. Comandi Utili
```bash
# Verifica endpoint debug dell'istanza in esecuzione
curl -s http://192.168.1.67:5000/api/stream/debug

# Test unitari Go
cd cabinet_bridge/server/native-runner && go test -v ./...

# Validazione TypeScript
cd cabinet_bridge && pnpm check
```

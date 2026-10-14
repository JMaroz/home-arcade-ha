# ADR 004: Internet Archive ROM Management Architecture

**Status**: Accepted  
**Date**: 2026-10-13  
**Deciders**: HomeArcade Core Team  

---

## Context
In precedenza, HomeArcade si basava interamente sul caricamento manuale dei giochi da parte dell'utente e su un loop di scansione del file system locale (`scanner.ts`) eseguito ogni 5 minuti su percorsi come `/share/roms` o unità USB. Questo approccio comportava:
1. Elevata frizione utente (necessità di procurarsi ROM altrove, trasferirle via Samba o browser, attendere la scansione).
2. Thrashing di I/O costante su dispositivi a basse risorse (es. Raspberry Pi 4 con SD card o NAS di rete).
3. Nomi file eterogenei o incorretti che causavano fallimenti nello scraping dei metadati e delle copertine.

L'utente richiede di rivedere le fondamenta della gestione delle ROM mettendo in secondo piano la scansione del file system locale e abilitando il download diretto dei giochi tramite Internet Archive, consentendo di scegliere se scaricare singoli titoli o l'intero set di una piattaforma, configurando la cartella di destinazione in onboarding o nelle impostazioni, e adattando la disponibilità in base all'hardware e ai BIOS installati.

---

## Decision

1. **Adozione di un Modello "Internet Archive First"**:
   - Introduzione di un modulo nativo `archive-downloader` in Node.js che interagisce direttamente con l'API REST di Internet Archive (`https://archive.org/metadata/{id}` e `https://archive.org/download/{id}/{file}`) e mirror No-Intro compatibili.
   - Esclusione consapevole di dipendenze binarie pesanti (es. CLI Python `ia` o container esterni), privilegiando le API native standard di Node.js (`fetch`, `node:stream`, `node:fs/promises`, `statfs`) in linea con la filosofia **Ponytail**.

2. **Declassamento della Scansione Locale a Livello Secondario**:
   - Lo scanner periodico automatico viene de-prioritizzato: la scoperta dei giochi avviene nel catalogo cloud.
   - Ogni gioco o set scaricato da Internet Archive viene registrato e indicizzato istantaneamente nel database Drizzle (`uploadedRoms`), avviando lo scraping della copertina senza dover attendere il ciclo dello scanner.
   - La scansione locale rimane attiva unicamente come salvaguardia per importare file aggiunti manualmente dall'utente.

3. **Configurazione Esplicita della Cartella di Destinazione (`defaultRomDirectory`)**:
   - Aggiunto il parametro di configurazione persistente `defaultRomDirectory` sia al First-Run Setup Wizard (Step 1 dell'Onboarding) sia alle Impostazioni (`LibrarySettings`).
   - Tutti i download (e gli upload) vengono archiviati sistematicamente in `${defaultRomDirectory}/${system}/${filename}`.
   - Integrazione della verifica preventiva dello spazio su disco tramite `statfs`.

4. **Fattibilità Download: Singolo Gioco vs Piattaforma Completa**:
   - **Singolo Gioco**: Sempre consentito tramite streaming diretto HTTP, con notifica di avanzamento in tempo reale e salvataggio immediato.
   - **Piattaforma Completa (Full Set)**:
     - Abilitato per sistemi cartridge/2D leggeri (Atari, NES, SNES, Genesis, GB, GBC) scaricando il singolo archivio 1G1R aggregato per evitare blocchi da rate limit di Archive.org.
     - Blocco preventivo tramite `statfs` se lo spazio libero è inferiore alla dimensione del pacchetto + 25%.
     - Per sistemi pesanti ottici/32-bit+ (PS1, PS2, PSP, Dreamcast), la UI privilegia il download di singoli titoli o "Starter Pack Curati", scoraggiando il full set integrale per preservare lo storage locale.

5. **Hardware Awareness & BIOS Gating**:
   - Integrazione con i tier prestazionali (`CORE_PERFORMANCE_TIERS`) e architettura host (`aarch64` vs `x86_64`): il catalogo contrassegna i giochi con badge di compatibilità (Ottimale, Discreto, Hardware Potente Richiesto).
   - Verifica dello stato dei file BIOS (`REQUIRED_BIOS`) prima del download o dell'avvio, con pulsante per il download automatico in 1-click dei BIOS mancanti.

---

## Consequences

### Vantaggi (Pros)
- **Zero Frizione per l'Utente**: HomeArcade diventa una console plug-and-play autonoma; l'utente può popolare la propria libreria con i classici preferiti direttamente dalla dashboard.
- **Integrità e Naming Perfetto**: I cataloghi No-Intro / 1G1R garantiscono nomi file standardizzati, zero dump corrotti e scraping immediato della box art al 100%.
- **Zero Dipendenze Esterne**: Rispetto rigoroso dei principi Ponytail (nessun pacchetto Python o eseguibile aggiuntivo nell'add-on).
- **Protezione dello Storage**: Il controllo preventivo con `statfs` previene la saturazione imprevista delle schede microSD di Home Assistant.

### Limiti & Debito Tecnico Accettato (Cons)
- **Banda e Rate Limiting di Internet Archive**: Archive.org può occasionalmente applicare limitazioni di velocità o richiedere autenticazione gratuita per alcuni set; per mitigare ciò viene supportato l'inserimento opzionale delle credenziali S3 IA e il fallback su mirror No-Intro pubblici come Myrient.
- **Complessità Task in Background**: Il download di pacchetti completi (es. SNES da 1.7 GB) richiede la gestione di un worker asincrono per il download e l'estrazione con notifica di avanzamento al client.

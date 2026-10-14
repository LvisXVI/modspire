# Modpack-Werkstatt

An independent, free Windows desktop app for planning Minecraft Java modpacks. Describe the kind of pack you want, find candidates on Modrinth, optionally use CurseForge with your own API key, and review compatibility before choosing mods. The app has no subscription or paid feature tier.

This is an independent project. It is not affiliated with or endorsed by Modbot, Modrinth, CurseForge, Microsoft, Mojang, or OpenAI. It takes inspiration from prompt-led modpack workflows without using Modbot branding or assets.

## Features
AI Integration With:
ChatGPT Personal Subscription
Ollama
OpenAI API Key
OmniRoute
...
PackLab, See General Pack Diagnostics
Mod-Creator (Non Tested)
Ai Chat
4 ui´s
different designs + backrounds
Crash Report reader
Modrinth integration + Pack Importer
Theoretical Curseforce Integration IF u have an API key.
Web Version
PackLab:
<img width="1316" height="736" alt="Screenshot 2026-10-14 134951" src="https://github.com/user-attachments/assets/0c031a82-3125-441d-9ea1-3a6ccdb31638" />

4 Uis:
<img width="987" height="478" alt="grafik" src="https://github.com/user-attachments/assets/6cedf8a2-262f-4be3-be21-53320dc9b86f" />

Classic UI as Example:
<img width="1422" height="930" alt="Screenshot 2026-10-14 135126" src="https://github.com/user-attachments/assets/e50c1cf4-90d2-41ad-812e-6c97ce76114b" />


## Build and AI access

Mod search does not require an AI account. ChatGPT account sharing, direct OpenAI/Claude APIs, local Ollama/Bionic models, and an OmniRoute endpoint are optional AI routes. OmniRoute's `auto` mode chooses a model from the providers configured in that OmniRoute service; it cannot configure providers or add credits on the user's behalf. OmniRoute endpoint credentials are stored encrypted on the local Windows account. Local-model feature support varies by runtime and model; this project has not been tested against every local model and does not guarantee compatibility with every model or cloud agent. See [PUBLIC-TEST-DISCLAIMER.md](PUBLIC-TEST-DISCLAIMER.md).

## Test-project notice

This is an independent, non-profit test project provided for evaluation and experimentation. It is not a production-ready or security-certified mod manager. Mod metadata, compatibility claims, model responses, and third-party services can be incomplete, change, or fail. Back up modpacks and configuration before testing. AI requests and uploaded media are sent to the provider selected by the user; review that provider's privacy and usage terms before sending data. Minecraft and third-party service names belong to their respective owners. See the full [test disclaimer](PUBLIC-TEST-DISCLAIMER.md) and [third-party notices](THIRD-PARTY-NOTICES.md).


## What is not implemented yet

The current test-run checks the pack with the connected AI. It does not yet download mod files, install a loader or create a Minecraft Launcher installation, and it does not start Minecraft through to a loaded test world. The app describes those limits in its UI rather than claiming an in-game test has passed.

## Run from source

Requirements: Windows 10 or 11, Node.js 22+, and pnpm.

```powershell
pnpm install
pnpm start
pnpm test
pnpm dist
```

The portable `.exe` is written to `release/`. `pnpm test` runs the browser, Electron, provider, performance, catalog, theme, and smoke tests in `tests/`.

On first launch, choose a local display name. It is stored in the app's Windows user-data folder and does not have to be unique. ChatGPT login and plan sharing are separate; a username does not create an account or remove provider usage limits. ChatGPT sharing availability and limits are controlled by OpenAI. CurseForge requires the user's own approved API key.

## Lokale Web-Version

Der Button **Web-Version** in der Sidebar öffnet dieselbe Werkstatt im Standardbrowser unter einer lokalen `127.0.0.1`-Adresse. Die Desktop-App muss währenddessen geöffnet bleiben; sie stellt Katalogsuche, Kontoverbindungen, lokale Modelle, Spracheingabe, Dateiimporte und Exporte bereit. Es wird keine Website veröffentlicht.

Alle vier UI-Ansichten und die gespeicherten Design-Einstellungen werden übernommen. Pack-Projekte nutzen denselben lokalen Speicher. Während der Browser bearbeitet, pausiert die Desktop-Bearbeitung. **Zur Desktop-App** speichert die letzten Änderungen und übernimmt die Browser-Einstellungen zurück. Ein zusätzlicher Browser-Tab bleibt gesperrt, damit er keine ältere Pack-Auswahl zurückschreiben kann.

Vor einem Wechsel müssen laufende Antworten, Mod-Suchen und Abhängigkeitsprüfungen fertig sein. Die Eingaben sind nur während des kurzen Speichervorgangs gesperrt. Wenn du den Browser schließt, kannst du nach einer kurzen Verbindungsfrist über den Rückkehrbutton im Desktop-Fenster weiterarbeiten.

Die Website selbst läuft lokal. Katalogabfragen und ausdrücklich gesendete KI-Anfragen verwenden weiterhin die eingerichteten Anbieter. Zugangsdaten bleiben im Desktop-Dienst; die Browseransicht erhält keine gespeicherten API-Schlüssel.

## Privacy

Project content and the display name are stored locally. Chat messages and attached video frames are sent to the AI provider only after you submit them. Credentials are encrypted with Windows DPAPI-backed Electron `safeStorage` where available. Mod catalog queries are sent to Modrinth, or to CurseForge when its key is configured.

## Licensing

Original Modpack-Werkstatt files are licensed under MIT; see [LICENSE](LICENSE). The bundled Sign in with ChatGPT DevKit has a separate noncommercial licence at `vendor/siwc-local/DEVKIT-LICENSE`. Because that licence restricts commercial use, the combined repository is source-available for noncommercial use, but the whole app cannot honestly be described as OSI-compliant open source while that DevKit is included. Its terms cannot be expanded by the app's MIT licence. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

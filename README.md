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
https://private-user-images.githubusercontent.com/244184864/673328603-e1637de9-18c4-4717-a53d-48dfe151d745.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3OTE5ODAwNzIsIm5iZiI6MTc5MTk3OTc3MiwicGF0aCI6Ii8yNDQxODQ4NjQvNjczMzI4NjAzLWUxNjM3ZGU5LTE4YzQtNDcxNy1hNTNkLTQ4ZGZlMTUxZDc0NS5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYxMDE0JTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MTAxNFQxMjA5MzJaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT0zM2I4MTE4Yzg1ZmQwNTU2NWMxODE4MmFmNTgzMGMyY2M3NGZhY2ZmOGY5Zjc3ZWM3ODMxYjYyZDhhZGJjYTBjJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCZyZXNwb25zZS1jb250ZW50LXR5cGU9aW1hZ2UlMkZwbmcifQ.dzf8E4gWPz2LJMo1S1vYeO5cr9FtQEU7o13VjGq5L_Y
4 Uis:
https://private-user-images.githubusercontent.com/244184864/673329201-1962a865-6125-457d-9c5a-155c3e26695f.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3OTE5ODAwNzIsIm5iZiI6MTc5MTk3OTc3MiwicGF0aCI6Ii8yNDQxODQ4NjQvNjczMzI5MjAxLTE5NjJhODY1LTYxMjUtNDU3ZC05YzVhLTE1NWMzZTI2Njk1Zi5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYxMDE0JTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MTAxNFQxMjA5MzJaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT1jODE2NWFjZjgzMTdmNjI2M2NkMjgzMGVmZTNiOTBiMzM5NmExNTM4ZWM2ZWM2MmRmM2JjOGM4ZGQ4ODIxZjkzJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCZyZXNwb25zZS1jb250ZW50LXR5cGU9aW1hZ2UlMkZwbmcifQ.5ducyTaFuWThvA9EpaBX7y-5wyfpVJjtdgx5wJGsVzI
Classic UI as Example:
https://private-user-images.githubusercontent.com/244184864/673329678-794e51f0-e814-4658-86b2-72b4c9440266.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3OTE5ODAwNzIsIm5iZiI6MTc5MTk3OTc3MiwicGF0aCI6Ii8yNDQxODQ4NjQvNjczMzI5Njc4LTc5NGU1MWYwLWU4MTQtNDY1OC04NmIyLTcyYjRjOTQ0MDI2Ni5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYxMDE0JTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MTAxNFQxMjA5MzJaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT0wNzUwNDIxMTM5ZjAwZDg0MWM1NDBiMTQ4ZjM3MzI5ZjUwMWUzYzRkYzk1ZDBiMDEyM2Y5YjNlNDhhNWFmNWMwJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCZyZXNwb25zZS1jb250ZW50LXR5cGU9aW1hZ2UlMkZwbmcifQ.rt1f4knFqu-0sCrflfwvMYrsjiG7HWKGPIysHBG_4qA


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

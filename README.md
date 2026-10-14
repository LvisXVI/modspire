<div align="center">
  <img src="assets/brand/modspire-hero.png" alt="Modspire — Minecraft Modpack Studio" width="100%">
  <p><strong>A Windows desktop studio for planning Minecraft Java modpacks.</strong></p>
  <p>
    <a href="https://github.com/LvisXVI/modspire/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/LvisXVI/modspire?label=release&color=79d7d3"></a>
    <img alt="Windows desktop app" src="https://img.shields.io/badge/platform-Windows-15263a?logo=windows&logoColor=white">
    <img alt="Current test build" src="https://img.shields.io/badge/status-community%20test-8b7cf6">
    <a href="docs/wiki/README.md"><img alt="Project wiki" src="https://img.shields.io/badge/docs-wiki-1c3b50"></a>
  </p>
  <p><a href="https://github.com/LvisXVI/modspire/releases/latest">Download the latest build</a> · <a href="https://github.com/LvisXVI/modspire/wiki">Open the GitHub Wiki</a> · <a href="https://github.com/LvisXVI/modspire/releases/latest/download/Modspire-Promo-v0.2.88.mp4">Watch the short Modspire promo</a> · <a href="https://github.com/LvisXVI/modspire/releases/latest/download/Modspire-App-Preview-0.2.88.webm">Watch the real app recording</a></p>
</div>

## The studio

Modspire helps you shape a Minecraft Java modpack around the experience you want. Search the real Modrinth catalog, compare suggestions, keep each pack's setup and chat together, and review compatibility notes before you choose.

The gallery below uses captures of the actual app. The interface panels in these images are screenshots, not generated mockups.

<p align="center"><img src="assets/brand/modspire-features.png" alt="Real Modspire screens for AI-assisted planning, Modrinth search, appearance, and pack organization" width="100%"></p>

### Screens from the app

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/rounded/ai-pack-assistant.png" alt="Modspire Pack Assistant with contextual follow-up choices" width="100%"><br><strong>Pack Assistant</strong><br>Discuss an idea and refine the pack with contextual choices.</td>
    <td width="50%"><img src="docs/screenshots/rounded/modrinth-search-and-selection.png" alt="Modrinth search results with Minecraft version and loader context" width="100%"><br><strong>Modrinth catalog</strong><br>Search, filter, and add compatible candidates to your pack.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/rounded/designs-and-minecraft-backgrounds.png" alt="Modspire appearance settings and Minecraft backgrounds" width="100%"><br><strong>Appearance</strong><br>Choose among four layouts, themes, and Minecraft backgrounds.</td>
    <td width="50%"><img src="docs/screenshots/rounded/local-web.png" alt="Modspire running locally in a web browser" width="100%"><br><strong>Local web view</strong><br>Open the same local workspace in your browser while the desktop app is running.</td>
  </tr>
</table>

## What you can do

- Keep multiple pack projects with separate Minecraft version, loader, selections, and chat history.
- Describe a play style to the Pack Assistant and review Modrinth suggestions before adding or removing mods.
- Search Modrinth directly without an AI account; filter by topic, version, loader, category, environment, and popularity.
- Add several candidates or a filtered pack foundation together, check dependencies, and review compatibility notes.
- Import a Modrinth share code, public pack link, or `.mrpack` into an editable project; export the selected project afterward.
- Use the AI Mod Creator to develop a mod idea into a specification and starter-code outline.
- Review a pack in Pack Lab with mod roles, category balance, snapshots, crash-log notes, and related diagnostics.
- Switch between four layouts, choose themed surfaces and Minecraft backgrounds, and save the appearance on this device.
- Run the local web view from the desktop app; it stays on `127.0.0.1` and uses the same local projects.
- Choose among ChatGPT account access, optional OpenAI or Anthropic API providers, local Ollama/Bionic models, and compatible OmniRoute endpoints.

The app can organize a pack and review metadata. It does **not** download every mod, install a Minecraft loader, or prove that a pack starts in a game world. See [the test-project disclaimer](PUBLIC-TEST-DISCLAIMER.md).

## AI and local models

Mod search works without AI. AI access is optional. Available routes depend on the account, provider, model, and local runtime configured on the computer. OmniRoute's `auto` selection uses the providers already configured in that OmniRoute service; Modspire does not add credits or configure those upstream providers. Local-model feature support varies, and this project has not been tested with every model or agent.

Credentials are stored by the desktop service and encrypted with Windows DPAPI-backed Electron `safeStorage` where available. Chat text and media are sent to the selected AI provider only when submitted. Review that provider's privacy and usage terms.

## Get started

Download the latest Windows build from [GitHub Releases](https://github.com/LvisXVI/modspire/releases/latest), or run the source on Windows 10/11 with Node.js 22+ and pnpm:

```powershell
pnpm install
pnpm start
pnpm test
pnpm dist
```

The portable executable is written to `release/`. The first launch asks for a local display name. That name is not an account, and it does not remove limits imposed by AI providers. CurseForge search requires the user's own approved API key; without one, search falls back to Modrinth.

## Local web view

The **Web Version** button opens the same workspace in the default browser at a local `127.0.0.1` address. Keep the desktop app open while using it. Project data and provider credentials stay in the desktop service; the browser does not receive saved API keys. The app pauses desktop editing during the browser session to avoid conflicting changes.

## Project docs

The [project wiki](docs/wiki/README.md) covers setup, providers, search, design modes, privacy, troubleshooting, and development. The [test disclaimer](PUBLIC-TEST-DISCLAIMER.md) and [third-party notices](THIRD-PARTY-NOTICES.md) explain the project's limits and bundled dependencies.

## Licensing

Original Modspire files are licensed under MIT; see [LICENSE](LICENSE). The bundled Sign in with ChatGPT DevKit has a separate noncommercial licence at `vendor/siwc-local/DEVKIT-LICENSE`. This combined repository is source-available under multiple licences, not an OSI-compliant open-source release. Client integrations written independently are distinct from the DevKit bundle, but the DevKit's own terms still apply to its code.

Modspire is independent and is not affiliated with or endorsed by Microsoft, Mojang, Modrinth, CurseForge, or OpenAI. Minecraft and third-party service names belong to their respective owners.

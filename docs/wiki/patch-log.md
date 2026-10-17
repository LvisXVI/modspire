# Modspire Patch Log

This is a retrospective feature history for the project, from its first locally archived build through Modspire 0.2.93. It combines the surviving local build archive, public GitHub releases, the current source, and the project documentation.

## How to read this history

- The local archive contains builds beginning with **0.1.0**, followed by the **0.2.x** development line.
- The first public GitHub release that is still available in the release history is **0.2.86**. The repository source history starts later, with the 0.2.87 source snapshot.
- Individual change notes were not kept for every early local build. To avoid inventing which exact build introduced a feature, this log groups the early work into a development era and gives precise notes for the releases whose release records are available.
- This page documents the project through **0.2.93**. It does not claim that every mod, Minecraft version, AI model, or provider is compatible.

## First builds — 0.1.0 to 0.2.0

The first archived Windows builds established Modspire’s original purpose: a desktop workspace for planning Minecraft Java modpacks. The project then moved into the 0.2.x line and was iterated through many private/local builds before the public release history began. The early per-build change notes were not preserved, so the capabilities below are listed as the accumulated product scope rather than assigned to unsupported exact version numbers.

## 0.2.x development — 0.2.1 to 0.2.85

The accumulated planning studio grew to include:

- **Pack projects:** create and switch between separate modpack projects, each with its own Minecraft version, mod loader, selected mods, and chat history. Project data can be saved and exported locally.
- **Pack Assistant:** describe a play style or theme in chat, receive contextual mod ideas, continue from suggested reply buttons, and use the current project and selected mods as context.
- **Catalog search:** search Modrinth without an AI connection; narrow results by game version, loader, category, environment, topic, and popularity; inspect mod details; and add or remove candidates.
- **Pack recommendations:** request themed suggestions, alternatives, compatible pack foundations, and related directions. Recommendations account for the current setup and already selected mods, with duplicate avoidance and relevance/popularity sorting.
- **Pack imports and dependencies:** import supported Modrinth share codes, public pack links, and `.mrpack` manifests into an editable project; inspect dependencies and compatibility notes; and export project selections.
- **Optional catalog source:** CurseForge search is available when the user supplies an approved API key; Modrinth remains the fallback when that key is absent.
- **Pack Lab and diagnostics:** inspect mod roles and category balance, review compatibility signals and project snapshots, and analyze crash/error logs for likely mod conflicts.
- **AI provider choices:** use the connected ChatGPT account where available, or configure supported API providers, local Ollama/Bionic runtimes, and compatible OmniRoute endpoints. AI is optional for catalog search and pack organization.
- **AI Mod Creator:** turn a mod idea into a structured specification and starter-code outline, with an item concept preview for supported creator flows. This is a planning aid, not a compiled or installed Minecraft mod.
- **Appearance studio:** choose among four distinct UI layouts, visual themes, opacity/glass treatments, and Minecraft-inspired backgrounds; save the chosen appearance on the device.
- **Local web view:** open the same project workspace in a browser through the desktop app’s loopback service.

These capabilities are documented in the first preserved public release notes at 0.2.86; the available evidence does not identify the precise early build in which each one first appeared.

## 0.2.86 — first preserved public release

The public release introduced a complete Windows/source snapshot and documented the accumulated feature set: Pack Lab diagnostics, four selectable layouts, custom themes and animated Minecraft backgrounds, AI-assisted pack planning, Modrinth search and pack import, optional CurseForge integration, crash-log analysis, the local browser view, and the experimental Mod Creator blueprint.

The release notes listed ChatGPT account access, Ollama, OpenAI API, and OmniRoute as AI routes. Provider/model availability and upstream limits still depend on the user’s own account and local configuration.

## 0.2.87 — source snapshot and English-first setup

- Published the complete app source, assets, tests, documentation, and project guides in the repository.
- New installations start in English; a previously saved language choice remains in effect.
- Included the portable Windows build and a short preview video.

## 0.2.88 — Modspire rebrand

- Renamed Modpack-Werkstatt to **Modspire** across the app and project materials, and changed the GitHub repository identity.
- Added the new app icon, real-app screenshots, refreshed README artwork, and a promotional cut assembled from real app footage.
- Published the app tour and updated source archive while preserving the existing Windows app-data location and project export format.

## 0.2.89 — desktop workflow polish

- Refined spacing, typography, focus feedback, hover states, scrollbars, chat surfaces, and Pack Lab meters across all four UI modes.
- Added `Ctrl+K` and `/` shortcuts for Modrinth search and an inline clear control.
- Applied the shared visual refinements to the local web view and portable build.

## 0.2.90 — theme contrast and readability

- Corrected overview-card and Pack Assistant recommendation contrast across themes and layouts.
- Updated UI 3 Pack Lab labels, values, fields, notes, and telemetry for its dark palette.
- Removed a startup label that overlapped the desktop toolbar and added browser regression checks for contrast.

## 0.2.91 — portable updater and motion

- Added an in-app updater for the portable Windows build. It checks GitHub Releases, streams download progress, verifies the downloaded asset’s SHA-256 digest, preserves a rollback copy, and restarts into the update.
- Added an animated startup sequence and refined section, chat, control, and website transitions.
- Refined the GitHub Pages hero, demo interactions, icon sizing, and landing-page hierarchy.

## 0.2.92 — Crash Analyzer and Modrinth weekly favorites

- Added a Pack Assistant ranking for Modrinth projects by weekly follower growth, with an all-time follows view and direct add-to-pack controls.
- Weekly growth is based on daily snapshots stored locally because the Modrinth search API provides a total follows count, not a weekly ranking. Until seven days of local history are collected, the UI clearly shows all-time data.
- Expanded Crash Analyzer diagnoses with likely causes, log excerpts, explicitly identified mod IDs when supported by evidence, nearby mods marked as unconfirmed, and suggested next checks. The AI handoff includes these fields.
- Reduced Crash Analyzer refresh work by reading only the recent log tail needed for its display.

## 0.2.93 — Scannable Modrinth catalog

- Added a saved List/Cards switch to the catalog. List mode uses the full content width for more readable results; Cards mode keeps room for gallery previews.
- Made Relevance, Downloads, Followers, Newest, and Recently updated sorting visible above results. Sorting reorders AI suggestions immediately and applies to classic Modrinth searches, including paging.
- Preserved follower and project-date metadata during result normalization so follower and date-based sorting use actual Modrinth data.
- Preserved search filters, descriptions, compatibility metadata, add/remove actions, and the selected pack workflow.

## Current scope and limits at 0.2.93

Modspire plans packs, searches catalog metadata, and organizes selections. It does not download every mod automatically, install Minecraft loaders, or prove that a project launches successfully in Minecraft. CurseForge requires the user’s own API key. AI availability, privacy, cost, model capabilities, and compatibility depend on the connected account, provider, and local runtime; not every local model or agent has been tested. See [AI, privacy, and limits](ai-privacy.md), [getting started](getting-started.md), and the [community test disclaimer](../../PUBLIC-TEST-DISCLAIMER.md).

## Sources

- [Public GitHub releases](https://github.com/LvisXVI/modspire/releases)
- [Current source changelog](../../CHANGELOG.md)
- [Project README and current feature list](../../README.md)

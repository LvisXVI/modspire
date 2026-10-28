# Changelog

Notable user-facing changes are documented here. This project follows Keep a Changelog conventions.

For the retrospective history from the first local build and a consolidated feature list, see the [Modspire patch log](docs/wiki/patch-log.md).

## [0.3.10] — Dialogs close properly, calmer top bar (2026-10-28)

### Changed
- **Every dialog now closes with Escape or a click on the dimmed area around it** (settings, designs, test run, mod picker, history and the rest); some of them used to trap you.
- **Top of the app:** one consistent look for the title, action buttons and the pack setup strip in all five layouts, with readable selects on light layouts.
- **Pack lab** shows one short note instead of four empty analysis cards while the pack has no mods; "Komfort" and "Vielfalt" are translated.

## [0.3.9] — Clearer chat, calmer picker (2026-10-28)

### Changed
- **Mod picker:** one unified mod card in every layout, with a 16:9 gallery, a three-line description and a clean footer in the large picker window. The star glyph now shows on every card.
- **Chat:** the inline picker is paged (six cards, "show more") instead of a nested scroll area, and follow-up ideas are cut to five with the rest under "more ideas". The chat now follows the light or dark tone of the active UI and theme.
- **Pack assistant** has a new avatar, and the pack name field reads as a title with a clear "Saved" status.
- **Design dialog:** options, wallpapers and sliders use the dialog's own text colour, so the selected option is no longer white on white.
- **Clarity:** empty-pack actions (filter, copy, export) are hidden until there are mods, the redundant version chip is gone, icon-only navigation items get labels, and small hints share one readable size.

## [0.3.8] — Mod Studio 1.0.0 (2026-10-28)

### Changed
- Embedded Mod Studio is now **1.0.0**, the first full release after the alpha series: it brings its own app icon (a pixel-art block with a pencil) in the launcher, tray and browser tab, and the removal of the last alpha wording.

## [0.3.7] — New icon, personal desktop shortcut (2026-10-27)

### Changed
- New Modspire icon: a spire of grass, stone and diamond blocks crowned by a crystal spark, on a glass tile. The app icon now carries seven sizes (16–256 px) with a simplified drawing for the small ones, so it stays sharp in the taskbar, Explorer and on the desktop.
- The personal desktop shortcut created after you choose your name on first start uses the new icon with your initial as a badge, drawn sharp at every size.

### Fixed
- The personal desktop shortcut of the portable build pointed to its temporary unpack folder and stopped working once the app was closed; it now points to the EXE you started.

## [0.3.6] — Calmer surfaces, new sidebar, resizable window (2026-10-27)

### Changed
- One surface system in all five layouts and every theme: panel rows no longer paint their own slightly different backgrounds; cards, fields and tiles share one subtle tint derived from the panel colour. The stripes and off-colour boxes (for example the navy bars in the mod view) are gone.
- Sidebar buttons redesigned in every layout: rounded, gentle hover lift, an accent marker on the active page and a visible keyboard focus. UI 4 and UI 5 get a compact icon rail with centred, larger icons; the label stays as a tooltip.
- Consistent rounding: fields 12 px, cards 18–20 px, panels 24 px; a small guard rounds any square box left over.

### Fixed
- The window can be resized again by dragging its edges (a transparent window cannot be resized on Windows).

## [0.3.5] — UI audit fixes (2026-10-27)

### Fixed
- Top bar: a long pack name no longer runs under the buttons ("Saved" and the language button overlapped it). With less room the secondary buttons collapse to icons with tooltips.
- Setup strip labels never break mid-word and the status chip stays on one line.
- Unreadable text found by an automated audit of all 9 themes × 5 layouts × 4 views at two window sizes: Pack Lab cards and tiles in UI 4 and Glass, "Your pack" heading, the setup strip in Modern + Emerald, the status chip in Modern + Nether, and the search shortcut hint.
- A new contrast guard checks text against its real background after every theme, layout or view change and switches unreadable text to dark or light ink.
- "KI-Hinweise" is translated in the English interface.

## [0.3.4] — Blockbench built in, new chat (2026-10-27)

### Added
- Embedded Mod Studio 0.1.0-alpha.12 contains the full **Blockbench 5.2.2** editor (GPL-3.0, unmodified). "Edit in Blockbench" opens it inside the app with three guided steps (build shape, paint texture, preview in game), hints for each step, undo/redo, a short first-run guide and a guard against losing unsaved changes. "Apply" or Ctrl+S takes the model back into the project.
- Launch animation: a glass droplet intro over the Minecraft scene, then the app fades in. Views and dialogs open with softer transitions.
- **Animated backgrounds:** blocky Minecraft clouds drift across the sky wallpapers, plus one effect per scene – a swaying aurora, falling cherry petals, crystal sparkles, forest fireflies and rising Nether embers. The "move backgrounds" switch turns everything off and is now also in the quick Designs menu; reduced-motion systems get a still background.

### Changed
- The AI chat is redesigned in all five layouts and all themes: message bubbles (yours on the right in the accent colour), suggestions aligned under the latest answer instead of repeated after every reply, a single rounded composer with a focus glow, round send and voice buttons, and messages that slide in.

### Fixed
- Assistant messages could be light grey on light grey in some layout/theme combinations; chat surfaces now derive from the panel's own text colour.
- Adding a mod from the chat no longer pushes the list down under the cursor: the "added to your pack" note floats in the corner.
- The launch intro no longer scales the app while it is hidden, so early clicks land where they should.

## [0.3.3] — Lighter build, Studio alpha 10 (2026-10-27)

### Changed
- Embedded Mod Studio updated to 0.1.0-alpha.11: Liquid Glass is its default surface, with a one-click Workshop/Glass switch in the top bar.

### Fixed
- Mod Studio no longer reverts an edit (for example a freshly typed element name) when a save that started earlier finishes afterwards.
- Minecraft wallpapers ship as WebP instead of PNG (7.2 MB → 0.8 MB), so backgrounds decode faster and the portable build is smaller. README-only brand artwork is no longer packaged.

## [0.3.2] — Liquid Glass (2026-10-26)

### Added
- **UI Version 5 · Liquid Glass**: a fifth layout choice with frosted, light-catching panels over a Minecraft scene, floating rail and top bar, spring-loaded controls, a pointer-following highlight and soft view, message and dialog transitions. It reuses the UI 4 structure, so every view and control keeps working; reduced-motion turns the animation off.

### Fixed
- UI 2 (Modern) on dark themes such as Aurora: headings, pack titles and snapshot names were white on light cards. They now follow the layout's own ink colour; the hero no longer sits on a half-filled strip, and the "Your mods" tiles use tinted glass instead of saturated slabs with faint text.
- Chat follow-ups in all layouts: "Continue with one click" chips and "20 more directions" are one calm chip cloud with a pill toggle instead of nested bordered boxes.
- UI 3 on bright wallpapers (Fluid): the dashboard gets its own frosted backing so the title and buttons stay readable.
- English interface: sign-in buttons, chat starters (Magic, Combat), dashboard labels, the welcome message and about 40 tooltips were still German.
- Classic overview uses more of wide screens.

## [0.3.1] — Local preview (2026-10-25)

### Added
- Integrate the real Minecraft Mod Studio in all four Modspire layouts. It opens in the browser on a private loopback server, shares Studio's existing local projects, supports source export and supported JAR builds, and includes checksum-verified JDK/Gradle build runtimes. Studio projects stay separate from modpacks; embedded Studio updates ship with Modspire.

### Fixed
- Keep the Studio chat send control enabled after a completed AI answer, and preserve existing element models when repairing malformed AI element IDs.
- Block external origins and Host-header rebinding against the embedded Studio server.

## [Unreleased] — 0.3.0 local preview

### Added
- Compare any two saved Pack Lab snapshots, including added, removed and changed mod versions and game setup.
- Keep personal cross-pack mod bookmarks with editable notes.
- Preview compatible Modrinth version updates, choose individual versions, and save a snapshot before applying them.
- Explain required dependencies and client/server environments in the selection and Pack Lab.
- Export installable `.mrpack` archives with exact Modrinth versions, required dependencies, hashes, download URLs and a verified loader version. CurseForge entries and unverified shader engines produce actionable errors; shader export currently requires a compatible selected official Iris runtime on Fabric or NeoForge.
- Improve the website's download and interactive-demo paths, mobile layout and keyboard navigation, with a clearly labeled unreleased preview separate from the current 0.2.98 download.

### Fixed
- Preserve exact version pins during import and dependency resolution, explain shared dependency parents, and reject contradictory pins.
- Preserve resource packs, shader packs and server-only entries on archive import; resolve externally hosted Modrinth files by their verified hashes.
- Keep snapshots and exact loader versions isolated when switching pack projects.
- Discard obsolete update checks after pack, setup or selection changes.

## [0.2.98] - 2026-10-19

### Added
- Undo and redo mod selection changes, including batch additions and clearing a pack, with toolbar controls and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y outside text inputs and dialogs.
- Optional names for local pack snapshots in Pack Lab, with the existing quick-save fallback.
- Include validated Modrinth and CurseForge project links in copied mod lists alongside Minecraft version, loader and dependency labels.

### Fixed
- Invalidate pending dependency responses when clearing or undoing the selection or restoring a snapshot, so an older result cannot restore removed mods.
- Limit selection history to 30 steps in the current session and reset it when switching projects, Minecraft versions or loaders.

## [0.2.97] - 2026-10-17

### Fixed
- Preserved the inline mod-suggestion list position when adding/removing a mod or changing suggestion order.
- Restored the chat viewport synchronously during updates so back-to-back renders cannot capture an intermediate collapsed position.
- Prevented pointer focus from scrolling chat controls, retained relevant control focus, and limited message entrance animation to new rows.
- Corrected washed-out inline suggestion descriptions, metadata and badges using a matched theme foreground/background pair.
- Added browser and full Electron click regressions for chat/picker scrolling, plus 4.5:1 inline-card contrast coverage across four UIs and nine themes.

## [0.2.96] - 2026-10-17

### Added
- Added an optional local OpenCode connection with server address, protected password storage, connected-provider model discovery, and direct model selection in the chat.
- Added a managed OpenCode server start button for an installed Windows CLI. App-owned servers use a generated protected password and stop when Modspire exits; existing servers are reused.
- Routed OpenCode answers through the existing Pack Assistant, Mod Creator, catalog-suggestion parser, and compatibility report workflows, including the local browser view.

### Safety and compatibility
- OpenCode chat sessions use a separate directory, deny all tools, and are cleaned up after each response. Only loopback server addresses are accepted.
- Restricted free OpenCode models are disabled: a live test of the official free tier rejected external use even through the OpenCode server. Connect a compatible provider inside OpenCode instead; provider charges and limits still apply.
- Verified a real response through OpenCode 1.19.3 and local Ollama/Qwen, plus native server startup, settings persistence, errors and model selection.

## [0.2.95] - 2026-10-17

### Improved
- Refined all four desktop UI layouts while preserving the existing navigation, chat, catalog, creator, and Pack Lab workflows.
- Matched UI 4 surfaces and accents to the selected world theme, keeping glass treatments blurred and readable instead of inheriting unrelated light surfaces.
- Unified the Pack Assistant suggestion tray contrast in Modern UI and improved selected-theme color consistency in UI 4.

### Fixed
- Corrected low-contrast legacy controls and surfaces that appeared pale or washed out in UI 4.
- Added regression coverage for all four layouts, theme-bound UI 4 colors, readable assistant controls, and scrollable content.

## [0.2.94] - 2026-10-17

### Improved
- Added a short, consistent transition when switching between the main desktop sections, with cleanup when navigation changes mid-animation.
- Clarified the glass theme names and tuning: Crystal Glass is a cool-blue, stronger-blur surface; Frosted Teal uses a softer teal blur, and the opacity control now reaches its advertised minimum.
- Updated theme descriptions, color swatches, and translations to match the actual appearance.

### Fixed
- Added browser regression coverage for section transitions, localized theme labels, and glass opacity/blur behavior.

## [0.2.93] - 2026-10-17

### Improved
- Added a persistent compact list/cards switch to the Modrinth catalog so large result sets are easier to scan without hiding descriptions, compatibility, download counts, or add/remove actions.
- Moved catalog sorting into the visible results toolbar; relevance, downloads, followers, newest, and recently updated can be applied to current suggestions, while classic catalog searches also request the selected order from Modrinth.
- Preserved Modrinth follower, creation, and update metadata through result normalization so every sort order has the data it needs.
- Defaulted new catalog sessions to the compact list and saved the user's layout choice locally.
- Kept gallery previews available in card mode and retained the existing detail dialog, filters, paging, and pack actions.

## [0.2.92] - 2026-10-17

### Added
- Added a weekly Modrinth favorites ranking in the Pack Assistant, with a switch to all-time follows and immediate add-to-pack actions. Modrinth exposes total follows rather than weekly deltas, so the app stores private local daily snapshots and shows a clear all-time fallback until a week of history is available.
- Expanded the local Crash Analyzer with plain-language causes, log evidence, cautious mod attribution, and practical next checks; the chat handoff now includes the diagnosis details.

### Improved
- Crash diagnostics now read only the newest entries needed by the UI instead of parsing the entire log history on every refresh.
- Kept the existing chat, catalog, and pack workflows intact while adding the favorites panel.

## [0.2.91] - 2026-10-14

### Added
- Added an in-app updater for the portable Windows build. It checks GitHub Releases, streams download progress, verifies the release SHA-256 digest, preserves a rollback copy, and restarts into the new version.
- Added a short Modspire startup sequence and refined desktop section, chat, and control transitions.
- Refined the GitHub Pages experience with a staged hero entrance, tactile button feedback, consistent icon sizing, and smoother demo-row changes.

### Changed
- App and website motion remains enabled regardless of the operating system's reduced-motion preference, as requested.
- Improved the landing page's editorial hierarchy and control polish while retaining its app demo, downloads, source, release, and wiki links.

## [0.2.90] - 2026-10-14

### Fixed
- Improved contrast for overview cards and Pack Assistant recommendations across all four UI modes and theme palettes.
- Aligned UI 3 Pack Lab fields and telemetry with its dark theme so labels, values, and notes remain readable.
- Removed a transient startup credit that overlapped the desktop toolbar.

## [0.2.89] - 2026-10-14

### Changed
- Refined desktop spacing, typography, focus states, hover feedback, scrollbars, chat surfaces, and Pack Lab meters across all four UI modes.
- Added Ctrl+K and `/` shortcuts for Modrinth search, plus an inline clear control; both preserve the existing search workflow.
- Included the shared polish layer in the local web version and portable Windows build.

## [0.2.88] - 2026-10-14

### Added
- Rebranded the desktop app and project materials as **Modspire**, with a new Windows icon, polished README artwork, and rounded screenshots from the real app.
- Added a concise promotional video assembled from the current app recording, plus the full real app preview as release media.

### Changed
- Renamed the GitHub project to `LvisXVI/modspire` and updated repository links and product metadata.
- Kept the existing Windows app-data location and project export format so existing installs and saved packs remain compatible.

## [0.2.87] - 2026-10-14

### Changed
- Start new installations in English while preserving an explicitly saved language choice.

## [0.2.86] - 2026-10-14

### Added
- Published the first preserved public release with four UI layouts, theme and animated-background controls, AI-assisted pack planning, Modrinth search and imports, optional CurseForge search, Pack Lab diagnostics, crash-log analysis, a local browser view, and the experimental Mod Creator blueprint.

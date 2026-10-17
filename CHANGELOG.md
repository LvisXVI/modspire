# Changelog

Notable user-facing changes are documented here. This project follows Keep a Changelog conventions.

For the retrospective history from the first local build and a consolidated feature list, see the [Modspire patch log](docs/wiki/patch-log.md).

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

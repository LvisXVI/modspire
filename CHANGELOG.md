# Changelog

Notable user-facing changes are documented here. This project follows Keep a Changelog conventions.

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

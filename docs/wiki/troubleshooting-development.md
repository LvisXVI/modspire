# Troubleshooting and development

## Common issues

- **No AI response:** Open Settings and verify the selected provider, endpoint, model, and key. Local services must be running and reachable at their loopback URL. An API key does not guarantee provider quota.
- **No search result:** Clear restrictive version/loader/category filters, check the query spelling, or try a broader related phrase. The catalog is external and may temporarily fail.
- **A mod is missing or duplicated:** Check the pack tray first; already selected projects are filtered from AI suggestions. Remove the existing entry with minus and search the exact title or project slug.
- **Glass looks too clear:** Select Crystal Glass or Translucent, choose a wallpaper, and raise the glass-surface opacity slider. The window remains a tinted blur.
- **A panel does not scroll:** Place the pointer over the panel content and use the wheel; nested card areas may scroll independently. If it persists, include the layout, theme, window size, and a screenshot in a report.
- **Voice input does not start:** Check Windows microphone privacy permission and the selected input device. Speech recognition can depend on Windows services and language availability.

## Development

Requirements: Windows 10/11, Node.js 22+, and pnpm. From the repository root:

```powershell
pnpm install
pnpm test
pnpm start
pnpm dist
```

`pnpm test` runs browser and Electron integration checks in `tests/`; `pnpm dist` creates a portable Windows build in `release/`. Keep generated builds, user settings, API keys, personal data, and local pack exports out of commits.

For UI work, add a focused regression check for the observed behavior, run the affected test and then the full suite, and inspect the result in the actual Electron window when the change affects native behavior.

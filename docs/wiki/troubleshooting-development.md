# 🧰 Troubleshooting and development

## 🩹 Common issues

- **The assistant does not answer:** In **Settings → Connections**, check the selected provider, endpoint, model, and key. Start a local model service first. A saved API key does not guarantee quota or provider availability.
- **Search returns too little or nothing:** Clear version, loader, or category filters; check the spelling; then try a broader phrase. Catalog results depend on external service availability.
- **A suggestion is already in the pack:** Review **Your Pack** and remove the existing entry with **−**. Identity matching may not recognize every renamed or related catalog project.
- **A glass theme looks too clear:** Choose the intended theme and wallpaper, then increase the surface opacity in appearance settings. Glass surfaces use a tinted blur for readability.
- **A section does not scroll:** Move the pointer over the content area and use the wheel. If the issue remains, note the UI layout, theme, window size, and panel; a screenshot helps reproduce clipping or nested-scroll issues.
- **Voice input will not start:** Check Windows microphone privacy access, the selected input device, and speech-language support on the device.

## 🧑‍💻 Run from source

Development targets Windows 10/11 with Node.js 22+ and pnpm. From the repository root:

```powershell
pnpm install
pnpm test
pnpm start
pnpm dist
```

`pnpm test` runs the project checks in `tests/`; `pnpm dist` creates a portable Windows build in `release/`. Keep generated builds, local settings, API keys, personal data, and pack exports out of commits.

For UI changes, add a focused regression check for the reported behavior, run the affected test and the project suite, and inspect the real Electron window when native behavior is involved.

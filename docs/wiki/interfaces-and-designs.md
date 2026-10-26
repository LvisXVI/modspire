# 🎨 Interfaces and designs

## 🪟 Five ways to work

The Design Manager lets you switch between five layouts while keeping the active pack and chat state:

1. **Classic Workshop** — the original compact workbench layout.
2. **Modern Overview** — dashboard-style navigation and a larger pack overview.
3. **UI 3** — a studio workspace with a clean presentation and Minecraft-world themes.
4. **UI 4** — an expanded gaming workspace with a dedicated concept-preview area.
5. **UI 5 · Liquid Glass** — the UI 4 structure as frosted, light-catching glass over a Minecraft scene (your chosen wallpaper, or the aurora lake), with a floating rail and top bar, spring-loaded controls, a pointer-following highlight and soft view, message and dialog transitions. Every UI 4 view and control stays the same; reduced motion turns the animation off.

The Chat, Mod Selection, pack tools, and settings are available throughout the app. **Mod Studio** starts the bundled, real Minecraft Mod Studio server and opens its editor in your default browser at `127.0.0.1`. It supports projects, pixel textures, Blockbench models, AI assistance, source ZIP export and supported JAR builds. This is the local application, not the simulated website demo. Keep Modspire open while working in Studio; subsequent clicks reopen the same running server.

Existing Studio projects and its encrypted account settings remain in `%LOCALAPPDATA%\ModStudio`, separate from Modspire pack data. The first launch extracts the bundled JDK 25 and Gradle 9.8.2 into that folder after checksum verification. The verified build target is currently **Fabric / Minecraft 26.2 / items and blocks**; other selectable loaders and versions are not guaranteed build targets. The first build needs internet access for Minecraft/Fabric dependencies. AI requires a Studio account connection or an available local Ollama model. Embedded Studio updates ship through Modspire.

## 🌌 Themes, worlds, and glass

Choose a color theme and wallpaper in the appearance settings. Crystal Glass and Translucent use tinted, blurred surfaces; they are not intended to show the desktop through the app. Adjust surface opacity to balance the wallpaper with text contrast. Polarlicht uses colored light accents tuned to preserve legibility.

Minecraft-inspired wallpapers can move subtly. Use the motion control to turn that animation off; system reduced-motion preferences are respected in supported transitions.

## ♿ Readability and input

Keep enough contrast between text, controls, and the selected surface. Main actions support keyboard focus, and focus indicators help show where keyboard input will go. If a layout clips content or a panel stops scrolling, include the UI number, theme, window size, and the affected section in a bug report.

🧰 See [Troubleshooting and development](troubleshooting-development.md) for reporting details.

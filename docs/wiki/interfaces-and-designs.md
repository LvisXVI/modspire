# Interfaces and designs

## Four UI layouts

The design manager switches between four layouts while preserving the same pack and chat state:

1. **Classic workshop** — compact navigation and the original workbench arrangement.
2. **Modern overview** — dashboard navigation and a larger overview of the active pack.
3. **UI Version 3** — studio-style workspace with a clean mode and Minecraft-world themes.
4. **UI Version 4** — expanded gaming workspace with a separate creator preview area.

Chat, mod catalog, pack tools, settings, and mod creator remain available across layouts. The layout switch does not change a modpack's underlying data.

## Themes, wallpapers, and glass

Themes control the palette; wallpapers are selected separately. Crystal Glass and Translucent use tinted, blurred surfaces rather than desktop see-through. The shared glass-surface opacity slider applies across designs and persists locally. Polarlicht uses a subdued colored glow to keep text readable.

Minecraft wallpapers may use subtle motion. The motion setting can be switched off; reduced-motion system preferences are respected where implemented.

For readability, keep text/background contrast in mind when customizing colors. The app uses keyboard-focus outlines and semantic controls for major actions; report any inaccessible or low-contrast state with the UI layout and theme name.

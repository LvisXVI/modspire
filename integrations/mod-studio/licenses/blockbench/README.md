# Blockbench (bundled, unmodified)

Mod Studio ships the web build of [Blockbench](https://www.blockbench.net/) by JannisX11 and contributors in `public/blockbench/`, so models can be edited inside the app without an internet connection.

- Version: 5.2.2, built with `npm ci && npm run build-web` from tag [`v5.2.2`](https://github.com/JannisX11/blockbench/tree/v5.2.2) (commit `c9ace42ef1b770bdadfe656729c7833b8feb37d2`).
- Licence: GNU General Public License v3.0 – see [`LICENSE.MD`](LICENSE.MD). The complete corresponding source code is available at the tag above.
- Changes: none. Only the files needed by the web app are included (no Electron sources, no source map). Mod Studio talks to it through Blockbench's own global API (`loadModelFile`, `Codecs.project.compile`) from the parent page; it is a separate program, not linked into Mod Studio's code.
- Network: Mod Studio serves it with a Content-Security-Policy that only allows connections to the local app, so Blockbench's usage statistics and online plugin store are not reached.

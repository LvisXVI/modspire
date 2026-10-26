# Integrated Mod Studio

`Mod Studio` in all four layouts starts the real editor in the system browser. The server runs in an Electron utility process on an ephemeral IPv4 loopback port. Repeated opens reuse the process; closing Modspire shuts it down. This does not activate the Modspire local-web editing lock or modify the active modpack.

## Source and builds

The runtime under `integrations/mod-studio` is an explicit snapshot of `server/`, `public/`, `licenses/` and `package.json` from [Minecraft Mod Studio](https://github.com/LvisXVI/minecraft-mod-studio). `manifest.json` records the base source revision and SHA-256 of each included file; the file hashes include any local integration fixes. Project data, tokens, `.env`, generated builds and the simulated `docs/demo` are never included.

To refresh the snapshot and stage its two build archives:

```powershell
npm run studio:sync -- C:\path\to\minecraft-mod-studio
npm run dist
```

The source checkout must contain the original Studio distribution's verified JDK and Gradle archives in `.runtime/downloads`. The sync command checks their pinned SHA-256 values and copies them into the ignored `.mod-studio-runtime` staging directory. `predist` verifies the snapshot and archives before packaging. Do not commit runtime archives or private Studio data. Electron supplies the Node runtime, so no second Node distribution is needed.

The portable application includes the editor/backend and both build archives as `extraResources`, outside ASAR so the Windows build and credential scripts can execute. On first open the runtime archives are verified and extracted into `%LOCALAPPDATA%\ModStudio\modspire-runtime`. System Java, PATH and installed Gradle are not modified. Source and JAR exports are real; the current verified generator supports Fabric 26.2 items and blocks. Initial builds download game/loader dependencies from upstream repositories.

## Security and lifecycle

The dedicated IPC accepts no arbitrary URL or command. The parent only opens the loopback origin returned by its own worker. The server checks Host, Origin and Fetch Metadata, and requires its own Origin for writes. External-site requests and DNS rebinding are rejected. The generic external-link IPC remains HTTPS-only. Studio keeps its existing encrypted credentials and independent project schema. Its standalone installer is disabled in this embedded context; component updates come through Modspire.

## Licensing

The Mod Studio snapshot retains its upstream package license (`UNLICENSED`); bundling here is at the project owner's request and does not relicense it under Modspire's MIT license. Font notices are included in `integrations/mod-studio/licenses`. The unchanged Temurin archive includes GPL-2.0 with Classpath Exception notices, and Gradle includes Apache-2.0 notices. The archives and extracted distributions retain those license files.

## Verification

`node tests/mod-studio-browser.cjs` opens the real local application through Modspire's Electron IPC using isolated test projects. It verifies all four navigation layouts, state isolation, persisted editing, actual ZIP export, toolchain readiness, process reuse, request-origin checks and shutdown. It does not use a live AI account or spend model credits.

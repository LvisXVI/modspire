# Contributing to Modspire

Thanks for trying Modspire. Useful contributions include reproducible bug reports, clearer docs, translations, accessibility fixes and focused code changes.

## Try the app

Download the Windows portable build from [Releases](https://github.com/LvisXVI/modspire/releases/latest), or try the [browser demo](https://lvisxvi.github.io/modspire/#demo). The demo uses sample data; the desktop app performs actual catalog lookups.

A useful first test: choose a Minecraft version and loader, search the catalog, switch list/cards, add and remove a mod, switch UI/theme, and reopen your project. Report the version and exact steps if anything fails.

Use [Issues](https://github.com/LvisXVI/modspire/issues) for bugs and [Discussions](https://github.com/LvisXVI/modspire/discussions) for questions and ideas. Do not post credentials or private logs.

## Work on the source

On Windows with Node.js 22+ and pnpm:

```powershell
pnpm install
pnpm start
pnpm test
pnpm dist
```

Before opening a pull request, describe the user-visible problem, keep the change focused and run checks relevant to it. Include screenshots for visual changes and verify more than one UI mode and theme. Keep saved project data, provider routes, accessibility and existing workflows intact.

Original app code is MIT licensed. Bundled dependencies have their own terms; read [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) before redistributing. Do not add third-party code, images or recordings without permission. AI-assisted contributions are welcome when reviewed and tested; explain their use when relevant and follow any destination community's disclosure rules.

# Public test project notice

Modpack-Werkstatt is an independent, non-profit test project. It is provided for evaluation and experimentation and is not production-ready, security-certified, or guaranteed to work with every Minecraft setup, local model, cloud model, or agent.

## Compatibility and reliability

- Local model runtimes expose different APIs and capabilities. Tool calling, structured output, image input, context size, and streaming vary by runtime and model. The app handles mod suggestion search itself where it can parse model text, but compatibility with every local or cloud model is not guaranteed.
- Modrinth, CurseForge, OmniRoute, ChatGPT, OpenAI, Claude, Ollama, Bionic/LM Studio, and other external services may change availability, policies, APIs, rate limits, and prices without notice.
- AI-generated descriptions, recommendations, code, and compatibility assessments can be wrong or incomplete. Review changes before applying them. Back up modpacks and configuration before testing.
- The app does not guarantee that a generated pack launches successfully or that every selected mod works together.

## Data and credentials

Pack projects are stored locally. When the user submits a prompt, selected images/video frames, or other content to an AI feature, that content is sent to the provider configured for that feature. Mod catalog searches are sent to the selected catalog service. API keys configured in the desktop app are encrypted using the current Windows account's secure storage when available. Users should review each provider's privacy, retention, and usage terms and should never publish API keys, tokens, personal data, or private pack files in issues.

## Licensing and affiliation

The original application files use the MIT License, while bundled third-party components retain their own licenses. In particular, the included Sign in with ChatGPT DevKit is noncommercial; consult [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and its bundled license before redistribution. This project is not affiliated with or endorsed by Mojang, Microsoft, Modrinth, CurseForge, OpenAI, Anthropic, or OmniRoute.

Use is at your own risk. The application is provided without warranty; see [LICENSE](LICENSE).

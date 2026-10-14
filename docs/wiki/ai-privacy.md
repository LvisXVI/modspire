# 🧠 AI, privacy, and limitations

## 🔌 Provider choices

| Route | What it uses | Setup |
| --- | --- | --- |
| Local Ollama / Bionic (LM Studio) | A model served by a local endpoint | Run the model service, then choose its endpoint and model in Settings. |
| OpenAI API | API usage billed by the configured OpenAI account | Add your own API key in Settings. |
| Anthropic API | API usage billed by the configured Anthropic account | Add your own API key in Settings. |
| OmniRoute | A compatible router and the providers configured inside it | Configure the endpoint, any required key, and a model or automatic routing. |
| ChatGPT account access | The bundled Sign in with ChatGPT DevKit, if present | Sign in explicitly; availability and use are subject to service terms and the component's separate licence. |

Automatic selection uses routes the app can detect as configured. It cannot create accounts, add credits, or guarantee remaining quota or uptime.

## 🔒 What leaves your device

Pack projects and appearance preferences are stored locally. When you submit a chat message, its text and any attached media are sent to the selected AI route. Catalog searches go to Modrinth or, when configured, CurseForge. Video frames are extracted locally and sent only when you submit the message. The desktop app protects saved provider credentials with Windows DPAPI-backed Electron `safeStorage` where available.

Review the privacy and usage terms of each provider. Do not put credentials, personal data, or private pack files in public source commits or issue reports.

## 🧪 Compatibility and accuracy

The app has not been tested with every local model or cloud agent. Tool calling, structured output, image input, streaming, context length, and speed vary by provider and model. Modspire performs catalog lookup itself, but suggestions and compatibility notes can still be wrong. Review each result and test the pack in Minecraft.

The app does not claim a mod was installed or a pack launched unless that action was separately implemented and verified. See the [community test disclaimer](../../PUBLIC-TEST-DISCLAIMER.md).

## ⚖️ Licensing

Original app files are MIT licensed. The bundled ChatGPT DevKit has separate noncommercial terms. Because the repository includes that restricted component, the combined project is source-available under multiple licences rather than an OSI-compliant open-source release. Read [LICENSE](../../LICENSE) and [third-party notices](../../THIRD-PARTY-NOTICES.md) before redistributing.

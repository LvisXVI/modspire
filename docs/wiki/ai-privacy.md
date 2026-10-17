# 🧠 AI, privacy, and limitations

## 🔌 Provider choices

| Route | What it uses | Setup |
| --- | --- | --- |
| Local Ollama / Bionic (LM Studio) | A model served by a local endpoint | Run the model service, then choose its endpoint and model in Settings. |
| OpenAI API | API usage billed by the configured OpenAI account | Add your own API key in Settings. |
| Anthropic API | API usage billed by the configured Anthropic account | Add your own API key in Settings. |
| OpenCode | A local OpenCode server and its connected providers | Install the OpenCode CLI, connect a provider there, then use the OpenCode settings card and chat model picker. |
| OmniRoute | A compatible router and the providers configured inside it | Configure the endpoint, any required key, and a model or automatic routing. |
| ChatGPT account access | The bundled Sign in with ChatGPT DevKit, if present | Sign in explicitly; availability and use are subject to service terms and the component's separate licence. |

Automatic selection uses routes the app can detect as configured. It cannot create accounts, add credits, or guarantee remaining quota or uptime.

## OpenCode setup

1. Install the OpenCode CLI (`npm install -g opencode-ai`) and configure an AI provider in OpenCode using its own setup flow.
2. In Modspire Settings, open the OpenCode card. Keep the default `http://127.0.0.1:4096` address unless your server uses another local port.
3. Click **Start OpenCode server**, or start an existing server with `opencode serve --hostname 127.0.0.1 --port 4096`. Supply its server username/password if it is protected.
4. Test the connection, load models and select an available model in the chat's model picker. OpenCode is used only when explicitly selected; the existing automatic routing remains unchanged.

An app-started server receives a randomly generated password stored through the desktop credential service, and stops with the app. Modspire denies tools in its isolated OpenCode sessions and removes those temporary sessions afterward. Model providers still receive submitted chat/context and any supported image attachments. No provider credentials are copied out of OpenCode.

**Free-tier limitation:** a live request through OpenCode 1.19.3 was rejected by the OpenCode free service as restricted to its own client. Known restricted free models are disabled in Modspire; connecting the server does not grant access to those models or remove quotas. A real local Ollama/Qwen response through OpenCode was verified. Other providers and account plans need individual testing.

Official server documentation: https://opencode.ai/docs/server/

## 🔒 What leaves your device

Pack projects and appearance preferences are stored locally. When you submit a chat message, its text and any attached media are sent to the selected AI route. Catalog searches go to Modrinth or, when configured, CurseForge. Video frames are extracted locally and sent only when you submit the message. The desktop app protects saved provider credentials with Windows DPAPI-backed Electron `safeStorage` where available.

Review the privacy and usage terms of each provider. Do not put credentials, personal data, or private pack files in public source commits or issue reports.

## 🧪 Compatibility and accuracy

The app has not been tested with every local model or cloud agent. Tool calling, structured output, image input, streaming, context length, and speed vary by provider and model. Modspire performs catalog lookup itself, but suggestions and compatibility notes can still be wrong. Review each result and test the pack in Minecraft.

The app does not claim a mod was installed or a pack launched unless that action was separately implemented and verified. See the [community test disclaimer](../../PUBLIC-TEST-DISCLAIMER.md).

## ⚖️ Licensing

Original app files are MIT licensed. The bundled ChatGPT DevKit has separate noncommercial terms. Because the repository includes that restricted component, the combined project is source-available under multiple licences rather than an OSI-compliant open-source release. Read [LICENSE](../../LICENSE) and [third-party notices](../../THIRD-PARTY-NOTICES.md) before redistributing.

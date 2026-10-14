# AI, privacy, and limitations

## Provider choices

| Route | What it uses | Setup |
|---|---|---|
| Local Ollama/Bionic (LM Studio) | A model served by a local loopback endpoint | Install and run the model service, then choose a model in Settings |
| OpenAI API | OpenAI API usage billed under the configured API account | Add an API key in Settings |
| Claude API | Anthropic API usage billed under the configured API account | Add an API key in Settings |
| OmniRoute | A compatible router endpoint and its configured models | Configure the local/remote endpoint, key, and model or `auto` |
| ChatGPT account sharing | The bundled Sign in with ChatGPT DevKit, when present | Explicit account sign-in and plan-sharing consent; subject to its separate licence and service terms |

Automatic provider selection only uses routes that the app can detect as configured. It does not create provider accounts, obtain credits, or guarantee a model has remaining quota.

## Data flow

Pack projects and design preferences are stored locally. Submitting a chat prompt or selected media sends that content to the selected AI provider. Mod catalog searches are sent to Modrinth or, when configured, CurseForge. Credentials are stored through the app's protected local settings path when supported. Do not put secrets, personal data, or private pack files in GitHub issues or public commits.

## Compatibility

The app has not been tested with every local model or cloud agent. Tool calling, structured output, image input, streaming, context length, and speed differ by model. The mod search layer handles much of catalog lookup independently of model tool calling, but responses and recommendations can still be wrong. Always review suggestions and test a pack in Minecraft.

Video frames are extracted locally and only sent when the user submits the message. The app does not claim that a generated mod or pack has been installed or launched unless a separate test actually verifies it.

## Licences

Original app files are MIT licensed. The included ChatGPT DevKit has separate noncommercial terms; see the root [third-party notices](../../THIRD-PARTY-NOTICES.md) and the DevKit's own licence. This bundled repository is not an OSI-compliant open-source release while that restricted component is included.

import type { ChatGPTClient, ChatGPTConfig } from "./types.js";
export { ChatGPTError } from "./errors.js";
export type { ChatGPTClient, ChatGPTConfig, ChatGPTModel, CredentialEncryption, LoginProfile, ResponseInputMessage, SessionError, SessionIdentity, SessionState, SignInOptions, StreamResponseOptions } from "./types.js";
export declare const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";
/** Create one instance in your local runtime; expose only safe methods over your app's IPC. */
export declare function createChatGPT(config: ChatGPTConfig): ChatGPTClient;
//# sourceMappingURL=index.d.ts.map
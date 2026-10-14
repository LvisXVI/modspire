import { ChatGPTError } from "./errors.js";
import type { ChatGPTConfig, PendingRefresh, StoredConnection } from "./types.js";
export declare const identityVerificationUnavailable: () => ChatGPTError;
interface AuthorizationOptions {
    reconsent?: boolean;
    /** Save the issued registration separately before the one-time code exchange. */
    onRegistration?: (clientId: string) => Promise<void>;
}
export declare function authorize(config: ChatGPTConfig, previous: StoredConnection | undefined, hostId: string, signal: AbortSignal, options?: AuthorizationOptions): Promise<StoredConnection>;
export declare function refreshConnection(previous: StoredConnection, signal: AbortSignal, persistRotation: (rotation: PendingRefresh) => Promise<void>): Promise<StoredConnection>;
export declare function revokeConnection(connection: StoredConnection): Promise<void>;
export {};
//# sourceMappingURL=oauth.d.ts.map
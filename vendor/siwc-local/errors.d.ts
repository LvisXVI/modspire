import type { SessionError } from "./types.js";
interface ErrorDiagnostics {
    requestId?: string;
    param?: string;
    responseShape?: string;
}
export declare class ChatGPTError extends Error implements SessionError {
    readonly code: string;
    readonly retryable: boolean;
    readonly status?: number;
    readonly requestId?: string;
    readonly param?: string;
    readonly responseShape?: string;
    constructor(code: string, message: string, retryable?: boolean, status?: number, diagnostics?: ErrorDiagnostics);
    toJSON(): SessionError;
}
export declare function apiError(body: unknown, status?: number, requestId?: string | null): ChatGPTError;
export declare function isObject(value: unknown): value is Record<string, unknown>;
export declare function asError(error: unknown): ChatGPTError;
export declare function requiresReauthentication(error: ChatGPTError): boolean;
export declare function fetchRemote(url: string, init?: RequestInit, timeoutMs?: number): Promise<Response>;
export declare function jsonResponse(response: Response): Promise<unknown>;
export {};
//# sourceMappingURL=errors.d.ts.map
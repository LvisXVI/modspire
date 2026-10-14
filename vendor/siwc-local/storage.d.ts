import type { CredentialEncryption, StoredState } from "./types.js";
/** All reads and mutations run under one interprocess lock. Never expose this store to a renderer. */
export declare class ConnectionStore {
    #private;
    readonly directory: string;
    constructor(directory: string, encryption: CredentialEncryption);
    withLock<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T>;
    read(): Promise<StoredState | undefined>;
    /** This file belongs to the runtime, independently of login/profile files. */
    getHostId(): Promise<string>;
    write(record: StoredState): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map
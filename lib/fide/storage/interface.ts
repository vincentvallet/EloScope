export interface FideStorage {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  setJSONIfNew(key: string, value: unknown): Promise<boolean>;
  acquireLock(key: string, value: { owner: string; expiresAt: string }, now: Date): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

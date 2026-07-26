import { FideCircuitBreaker } from "./rate-limit";
import type { FideStorage } from "./storage/interface";
import { fideStorage } from "./storage";
import { readFideCache, writeFideCache } from "./cache";
import { FideSourceError, classifyFideError } from "./errors";

const USER_AGENT = "EloScope/1.0 (+mail@vincentvallet.com)";
const allowedHosts = new Set(["ratings.fide.com"]);

type ClientOptions = {
  fetch?: typeof fetch;
  storage?: FideStorage;
  timeoutMs?: number;
  maxBytes?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  retries?: number;
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: (entry: Record<string, unknown>) => void;
};

export class FideClient {
  private readonly fetcher: typeof fetch;
  private readonly storage: FideStorage;
  private readonly breaker = new FideCircuitBreaker();
  private queue = Promise.resolve();
  private lastRequestAt = 0;
  constructor(private readonly options: ClientOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.storage = options.storage ?? fideStorage();
  }

  async html(urlValue: string, options: { cacheKey?: string; ttlMs?: number; signal?: AbortSignal; headers?: Record<string, string> } = {}) {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) throw new FideSourceError("NETWORK", "Source FIDE non autorisée", url.toString());
    const cacheKey = options.cacheKey ?? `fide/http/${encodeURIComponent(url.pathname + url.search)}.json`;
    const cached = await readFideCache<string>(this.storage, cacheKey);
    if (cached) return { body: cached.value, source: "cache" as const, fetchedAt: cached.fetchedAt };
    const task = this.queue.then(() => this.request(url, options.signal, options.headers));
    this.queue = task.then(() => undefined, () => undefined);
    try {
      const body = await task;
      const saved = await writeFideCache(this.storage, cacheKey, body, url.toString(), options.ttlMs ?? 24 * 60 * 60_000);
      return { body, source: "network" as const, fetchedAt: saved.fetchedAt };
    } catch (error) {
      const stale = await readFideCache<string>(this.storage, cacheKey, true);
      if (stale) return { body: stale.value, source: "stale-cache" as const, fetchedAt: stale.fetchedAt };
      throw classifyFideError(error);
    }
  }

  async json<T>(urlValue: string, options: { cacheKey?: string; ttlMs?: number; signal?: AbortSignal; headers?: Record<string, string> } = {}) {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) throw new FideSourceError("NETWORK", "Source FIDE non autorisée", url.toString());
    const cacheKey = options.cacheKey ?? `fide/http/${encodeURIComponent(url.pathname + url.search)}.json`;
    const cached = await readFideCache<T>(this.storage, cacheKey);
    if (cached) return { value: cached.value, source: "cache" as const, fetchedAt: cached.fetchedAt };
    const task = this.queue.then(() => this.request(url, options.signal, options.headers, true));
    this.queue = task.then(() => undefined, () => undefined);
    try {
      const body = await task;
      const value = JSON.parse(body.replace(/^\uFEFF|^ï»¿/, "")) as T;
      const saved = await writeFideCache(this.storage, cacheKey, value, url.toString(), options.ttlMs ?? 24 * 60 * 60_000);
      return { value, source: "network" as const, fetchedAt: saved.fetchedAt };
    } catch (error) {
      const stale = await readFideCache<T>(this.storage, cacheKey, true);
      if (stale) return { value: stale.value, source: "stale-cache" as const, fetchedAt: stale.fetchedAt };
      throw classifyFideError(error);
    }
  }

  private async request(url: URL, parentSignal?: AbortSignal, extraHeaders: Record<string, string> = {}, expectJson = false) {
    const retries = this.options.retries ?? 1;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      this.breaker.assertAvailable();
      const delayMin = this.options.minDelayMs ?? 800;
      const delayMax = this.options.maxDelayMs ?? 1500;
      const due = this.lastRequestAt + delayMin + (this.options.random ?? Math.random)() * (delayMax - delayMin);
      if (due > Date.now()) await (this.options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(due - Date.now());
      const controller = new AbortController();
      const abort = () => controller.abort(parentSignal?.reason);
      parentSignal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => controller.abort("timeout"), this.options.timeoutMs ?? 15_000);
      try {
        this.lastRequestAt = Date.now();
        const response = await this.fetcher(url, {
          headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml", ...extraHeaders },
          redirect: "follow",
          signal: controller.signal,
        });
        if (!response.ok) {
          const code = response.status === 403 ? "HTTP_403"
            : response.status === 429 ? "HTTP_429"
              : response.status === 500 ? "HTTP_500"
                : response.status === 503 ? "HTTP_503"
                  : response.status === 404 ? "NOT_FOUND" : "NETWORK";
          throw new FideSourceError(code, `FIDE HTTP ${response.status}`, url.toString(), response.status);
        }
        const type = response.headers.get("content-type") ?? "";
        if (expectJson ? !/application\/json|text\/html/i.test(type) : !/text\/html|application\/xhtml\+xml/i.test(type)) {
          throw new FideSourceError("UNEXPECTED_HTML", "Type de réponse FIDE inattendu", url.toString(), response.status);
        }
        const declared = Number(response.headers.get("content-length"));
        const limit = this.options.maxBytes ?? 5_000_000;
        if (declared > limit) throw new Error("Réponse FIDE trop volumineuse");
        const body = await response.text();
        if (new TextEncoder().encode(body).byteLength > limit) throw new Error("Réponse FIDE trop volumineuse");
        this.breaker.success();
        this.options.logger?.({ source: "fide", status: response.status, url: url.pathname, bytes: body.length, attempt });
        return body;
      } catch (error) {
        const classified = controller.signal.aborted && !parentSignal?.aborted
          ? new FideSourceError("TIMEOUT", `Délai FIDE dépassé après ${this.options.timeoutMs ?? 15_000} ms`, url.toString())
          : classifyFideError(error);
        this.breaker.failure();
        this.options.logger?.({
          source: "fide",
          status: classified.status ?? "error",
          errorCode: classified.code,
          url: url.toString(),
          attempt,
          message: classified.message,
        });
        if (
          parentSignal?.aborted
          || attempt === retries
          || ["HTTP_403", "HTTP_429", "HTTP_503"].includes(classified.code)
        ) throw classified;
        await (this.options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(500 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
        parentSignal?.removeEventListener("abort", abort);
      }
    }
    throw new Error("Source FIDE indisponible");
  }

  status() { return this.breaker.state(); }
}

export { USER_AGENT as FIDE_USER_AGENT };

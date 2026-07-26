export type FideErrorCode =
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP_403"
  | "HTTP_429"
  | "HTTP_500"
  | "HTTP_503"
  | "UNEXPECTED_HTML"
  | "NOT_FOUND"
  | "EMPTY_PERIOD"
  | "PARSE_PROFILE"
  | "PARSE_CALCULATIONS"
  | "PARSE_EVENT"
  | "STORAGE_WRITE"
  | "UNKNOWN";

export class FideSourceError extends Error {
  constructor(
    public readonly code: FideErrorCode,
    message: string,
    public readonly url?: string,
    public readonly status?: number,
    public readonly parser?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FideSourceError";
  }
}

export function classifyFideError(error: unknown) {
  if (error instanceof FideSourceError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout/i.test(message)) return new FideSourceError("TIMEOUT", message, undefined, undefined, undefined, { cause: error });
  if (/fetch failed|network|dns|getaddrinfo|econn/i.test(message)) return new FideSourceError("NETWORK", message, undefined, undefined, undefined, { cause: error });
  return new FideSourceError("UNKNOWN", message || "Erreur inconnue", undefined, undefined, undefined, { cause: error });
}

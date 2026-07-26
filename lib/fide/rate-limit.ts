export class FideCircuitOpenError extends Error {
  constructor(public readonly retryAt: string) {
    super("Source FIDE temporairement indisponible");
  }
}

export class FideCircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  constructor(private readonly threshold = 3, private readonly cooldownMs = 10 * 60_000) {}
  assertAvailable(now = Date.now()) {
    if (this.openUntil > now) throw new FideCircuitOpenError(new Date(this.openUntil).toISOString());
  }
  success() { this.failures = 0; this.openUntil = 0; }
  failure(now = Date.now()) {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openUntil = now + this.cooldownMs;
  }
  state(now = Date.now()) {
    return { failures: this.failures, open: this.openUntil > now, retryAt: this.openUntil ? new Date(this.openUntil).toISOString() : undefined };
  }
}

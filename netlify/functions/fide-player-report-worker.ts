import type { Config } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";
import { buildGlobalReport } from "../../lib/fide/report";

const MAX_PROGRESSIVE_HOPS = 120;
const WORKER_BUDGET_MS = 12 * 60_000;
const BETWEEN_PERIODS_MS = 3_000;

export default async function fidePlayerReportWorker(request: Request) {
  const secret = await ensureInternalSecret(catalogStorage());
  if (request.headers.get("x-eloscope-sync-secret") !== secret) {
    console.warn(JSON.stringify({ event: "fide_player_report_rejected" }));
    return new Response(null, { status: 401 });
  }
  const body = await request.json().catch(() => null) as { ffeCode?: string; attemptId?: string; hop?: number } | null;
  if (!body?.ffeCode || !/^[A-Z]\d{5}$/i.test(body.ffeCode)) return new Response(null, { status: 400 });
  const startedAt = Date.now();
  let hop = Math.max(0, body.hop ?? 0);
  let attemptId = body.attemptId;
  let result;
  do {
    console.log(JSON.stringify({
      event: "fide_player_report_start",
      ffeCode: body.ffeCode.toUpperCase(),
      attemptId,
      hop,
    }));
    result = await buildGlobalReport(body.ffeCode, { attemptId });
    attemptId = result.metadata?.attemptId ?? attemptId;
    console.log(JSON.stringify({
      event: "fide_player_report_batch_complete",
      ffeCode: body.ffeCode.toUpperCase(),
      attemptId,
      hop,
      state: result.state,
      progress: result.metadata?.progress,
      stage: result.metadata?.currentStage,
      retryCount: result.metadata?.retryCount,
      lastErrorCode: result.metadata?.lastErrorCode,
      nextRetryAt: result.metadata?.nextRetryAt,
    }));
    if (
      result.state !== "queued"
      || hop >= MAX_PROGRESSIVE_HOPS
      || Date.now() - startedAt >= WORKER_BUDGET_MS
    ) break;
    hop += 1;
    await new Promise((resolve) => setTimeout(resolve, BETWEEN_PERIODS_MS));
  } while (true);

  if (result.state === "queued" && hop < MAX_PROGRESSIVE_HOPS) {
    const response = await fetch(new URL("/.netlify/functions/fide-player-report-worker", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
      body: JSON.stringify({ ffeCode: body.ffeCode, attemptId, hop: hop + 1 }),
    });
    console.log(JSON.stringify({
      event: "fide_player_report_next_batch",
      ffeCode: body.ffeCode.toUpperCase(),
      hop: hop + 1,
      accepted: response.ok,
    }));
  }
  return new Response(null, { status: 202 });
}

export const config: Config = {
  background: true,
  path: "/.netlify/functions/fide-player-report-worker",
};

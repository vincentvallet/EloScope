import type { Config } from "@netlify/functions";
import { runHistoricalBackfillBatch } from "../../lib/ffe-catalog/backfill";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";

const MAX_CHAIN_HOPS = 40;

export default async function ffeHistoryBackfillWorker(request: Request) {
  const storage = catalogStorage();
  const secret = await ensureInternalSecret(storage);
  if (request.headers.get("x-eloscope-sync-secret") !== secret) {
    console.warn(JSON.stringify({ event: "ffe_history_backfill_rejected" }));
    return;
  }
  const payload = await request.json().catch(() => ({})) as { hop?: number };
  const hop = Math.max(0, payload.hop ?? 0);
  const result = await runHistoricalBackfillBatch(storage);
  console.log(JSON.stringify({
    event: "ffe_history_backfill_batch_complete",
    hop,
    contact: "mail@vincentvallet.com",
    ...result,
    state: undefined,
  }));
  if ("shouldContinue" in result && result.shouldContinue && hop < MAX_CHAIN_HOPS) {
    const response = await fetch(new URL("/.netlify/functions/ffe-history-backfill-worker", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
      body: JSON.stringify({ hop: hop + 1 }),
    });
    console.log(JSON.stringify({
      event: "ffe_history_backfill_next_dispatched",
      hop: hop + 1,
      accepted: response.ok,
      status: response.status,
    }));
  }
}

export const config: Config = {
  background: true,
  path: "/.netlify/functions/ffe-history-backfill-worker",
};


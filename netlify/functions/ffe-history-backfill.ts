import type { Config, Context } from "@netlify/functions";
import {
  ensureHistoricalBackfillState, requeueOneFailedMonth,
} from "../../lib/ffe-catalog/backfill";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";

export default async function ffeHistoryBackfill(_request: Request, context: Context) {
  const storage = catalogStorage();
  await requeueOneFailedMonth(storage);
  const state = await ensureHistoricalBackfillState(storage);
  if (!state.pendingMonths.length || (state.nextResumeAt && state.nextResumeAt > new Date().toISOString())) {
    console.log(JSON.stringify({
      event: "ffe_history_backfill_watchdog_idle",
      pendingMonths: state.pendingMonths.length,
      failedMonths: Object.keys(state.failedMonths).length,
    }));
    return;
  }
  const secret = await ensureInternalSecret(storage);
  const response = await fetch(new URL("/.netlify/functions/ffe-history-backfill-worker", context.site.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
    body: JSON.stringify({ hop: 0 }),
  });
  console.log(JSON.stringify({
    event: "ffe_history_backfill_watchdog_dispatched",
    accepted: response.ok,
    status: response.status,
  }));
}

export const config: Config = { schedule: "*/10 * * * *" };


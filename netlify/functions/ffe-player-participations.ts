import type { Config, Context } from "@netlify/functions";
import { catalogWorkIsActive } from "../../lib/ffe-players/coordinator";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";

export default async function ffePlayerParticipations(_request: Request, context: Context) {
  const storage = catalogStorage();
  if (await catalogWorkIsActive(storage)) {
    console.log(JSON.stringify({ event: "ffe_player_backfill_idle", reason: "catalog-priority" }));
    return;
  }
  const secret = await ensureInternalSecret(storage);
  const response = await fetch(new URL("/.netlify/functions/ffe-player-participations-worker", context.site.url), {
    method: "POST",
    headers: { "x-eloscope-sync-secret": secret },
  });
  console.log(JSON.stringify({
    event: "ffe_player_backfill_dispatched",
    accepted: response.ok,
    status: response.status,
  }));
}

export const config: Config = { schedule: "3,13,23,33,43,53 * * * *" };

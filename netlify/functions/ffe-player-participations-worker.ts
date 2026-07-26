import type { Config } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";
import { playerStorage } from "../../lib/ffe-players/storage";
import { runCoordinatedPlayerBackfill } from "../../lib/ffe-players/coordinator";

export default async function ffePlayerParticipationsWorker(request: Request) {
  const catalog = catalogStorage();
  const secret = await ensureInternalSecret(catalog);
  if (request.headers.get("x-eloscope-sync-secret") !== secret) {
    console.warn(JSON.stringify({ event: "ffe_player_backfill_rejected" }));
    return;
  }
  const result = await runCoordinatedPlayerBackfill({
    catalogStorage: catalog,
    playerStorage: playerStorage(),
  });
  console.log(JSON.stringify({
    event: "ffe_player_backfill_batch_complete",
    contact: "mail@vincentvallet.com",
    ...result,
    state: undefined,
  }));
}

export const config: Config = {
  background: true,
  path: "/.netlify/functions/ffe-player-participations-worker",
};

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
  const body = await request.json().catch(() => ({})) as { hop?: number };
  const hop = Math.max(0, body.hop ?? 0);
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
  const state = "state" in result ? result.state : undefined;
  if (state && state.pendingTournamentCount > 0 && hop < 40) {
    const response = await fetch(new URL("/.netlify/functions/ffe-player-participations-worker", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
      body: JSON.stringify({ hop: hop + 1 }),
    });
    console.log(JSON.stringify({
      event: "ffe_player_backfill_next_batch",
      hop: hop + 1,
      accepted: response.ok,
      pendingTournamentCount: state.pendingTournamentCount,
    }));
  }
}

export const config: Config = {
  background: true,
  path: "/.netlify/functions/ffe-player-participations-worker",
};

import type { Config } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";
import { buildGlobalReport } from "../../lib/fide/report";

export default async function fidePlayerReportWorker(request: Request) {
  const secret = await ensureInternalSecret(catalogStorage());
  if (request.headers.get("x-eloscope-sync-secret") !== secret) {
    console.warn(JSON.stringify({ event: "fide_player_report_rejected" }));
    return new Response(null, { status: 401 });
  }
  const body = await request.json().catch(() => null) as { ffeCode?: string } | null;
  if (!body?.ffeCode || !/^[A-Z]\d{5}$/i.test(body.ffeCode)) return new Response(null, { status: 400 });
  const result = await buildGlobalReport(body.ffeCode);
  console.log(JSON.stringify({
    event: "fide_player_report_complete",
    ffeCode: body.ffeCode.toUpperCase(),
    state: result.state,
    progress: result.metadata?.progress,
  }));
  return new Response(null, { status: 202 });
}

export const config: Config = {
  background: true,
  path: "/.netlify/functions/fide-player-report-worker",
};

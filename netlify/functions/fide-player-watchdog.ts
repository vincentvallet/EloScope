import type { Config, Context } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";
import { fideStorage } from "../../lib/fide/storage";
import type { PlayerReportMetadata } from "../../lib/fide/types";

export default async function fidePlayerWatchdog(_request: Request, context: Context) {
  const storage = fideStorage();
  const keys = (await storage.list("fide/player-reports/")).filter((key) => key.endsWith("/metadata.json"));
  for (const key of keys) {
    const metadata = await storage.getJSON<PlayerReportMetadata>(key);
    if (!metadata || !["queued", "partial", "error"].includes(metadata.status)) continue;
    if (metadata.retryAfter && Date.parse(metadata.retryAfter) > Date.now()) continue;
    const secret = await ensureInternalSecret(catalogStorage());
    const response = await fetch(new URL("/.netlify/functions/fide-player-report-worker", context.site.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
      body: JSON.stringify({ ffeCode: metadata.ffeCode }),
    });
    console.log(JSON.stringify({ event: "fide_watchdog_dispatch", ffeCode: metadata.ffeCode, accepted: response.ok }));
    return;
  }
  console.log(JSON.stringify({ event: "fide_watchdog_idle", cachedReports: keys.length }));
}

export const config: Config = { schedule: "27 */6 * * *" };

import type { Config, Context } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";

export default async function ffeCatalogSync(_request: Request, context: Context) {
  const storage = catalogStorage();
  const secret = await ensureInternalSecret(storage);
  const response = await fetch(new URL("/.netlify/functions/ffe-catalog-sync-worker", context.site.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
    body: JSON.stringify({ mode: "daily" }),
  });
  console.log(JSON.stringify({
    event: "ffe_catalog_scheduled_dispatch",
    contact: "mail@vincentvallet.com",
    accepted: response.ok,
    status: response.status,
  }));
}

export const config: Config = { schedule: "17 2 * * *" };

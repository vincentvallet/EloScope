import type { Config } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";

export default async function ffeCatalogAnnouncements(request: Request) {
  const storage = catalogStorage();
  const secret = await ensureInternalSecret(storage);
  const workerUrl = new URL("/.netlify/functions/ffe-catalog-announcements-worker", request.url);
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { "x-eloscope-sync-secret": secret },
  });
  return new Response(null, { status: response.ok ? 202 : 502 });
}

export const config: Config = {
  schedule: "47 3 * * *",
};

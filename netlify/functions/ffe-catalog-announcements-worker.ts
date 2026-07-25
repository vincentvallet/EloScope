import type { Config } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret, runAnnouncementSync } from "../../lib/ffe-catalog/sync";

export default async function ffeCatalogAnnouncementsWorker(request: Request) {
  const storage = catalogStorage();
  const secret = await ensureInternalSecret(storage);
  if (request.headers.get("x-eloscope-sync-secret") !== secret) return;
  try {
    const result = await runAnnouncementSync(storage);
    console.log(JSON.stringify({ event: "ffe_catalog_announcements_complete", ...result }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "ffe_catalog_announcements_failed",
      error: error instanceof Error ? error.message : String(error),
      contact: "mail@vincentvallet.com",
    }));
    throw error;
  }
}

export const config: Config = {
  background: true,
  path: "/.netlify/functions/ffe-catalog-announcements-worker",
};

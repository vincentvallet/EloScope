import type { Config } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret, runCatalogSync } from "../../lib/ffe-catalog/sync";

export default async function ffeCatalogSyncWorker(request: Request) {
  const storage = catalogStorage();
  const secret = await ensureInternalSecret(storage);
  if (request.headers.get("x-eloscope-sync-secret") !== secret) {
    console.warn(JSON.stringify({ event: "ffe_catalog_sync_rejected", contact: "mail@vincentvallet.com" }));
    return;
  }
  const payload = await request.json().catch(() => ({})) as { mode?: "daily" | "initial" };
  try {
    const result = await runCatalogSync(storage, payload.mode === "initial" ? "initial" : "daily");
    console.log(JSON.stringify({ event: "ffe_catalog_sync_complete", contact: "mail@vincentvallet.com", ...result }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "ffe_catalog_sync_failed",
      contact: "mail@vincentvallet.com",
      error: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }
}

export const config: Config = {
  background: true,
  path: "/.netlify/functions/ffe-catalog-sync-worker",
};

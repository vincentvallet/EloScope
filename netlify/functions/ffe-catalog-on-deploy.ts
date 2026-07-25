import type { DeploySucceededEvent } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";
import type { CatalogSyncStatus } from "../../lib/ffe-catalog/types";

const deployHandler = {
  async deploySucceeded(event: DeploySucceededEvent) {
    if (event.deploy.context !== "production") return;
    const storage = catalogStorage();
    const status = await storage.getJSON<CatalogSyncStatus>("metadata/sync-status.json");
    const staleRefresh = status?.isRefreshing && status.lastAttemptAt
      && Date.now() - new Date(status.lastAttemptAt).getTime() > 10 * 60_000;
    if ((status?.itemCount ?? 0) > 0 && !staleRefresh) {
      console.log(JSON.stringify({ event: "ffe_catalog_deploy_check", catalogExists: true, itemCount: status!.itemCount }));
      return;
    }
    const secret = await ensureInternalSecret(storage);
    const [response, announcementsResponse] = await Promise.all([
      fetch(new URL("/.netlify/functions/ffe-catalog-sync-worker", event.site.url), {
        method: "POST",
        headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
        body: JSON.stringify({ mode: "initial" }),
      }),
      fetch(new URL("/.netlify/functions/ffe-catalog-announcements-worker", event.site.url), {
        method: "POST",
        headers: { "x-eloscope-sync-secret": secret },
      }),
    ]);
    console.log(JSON.stringify({
      event: "ffe_catalog_initialization_dispatched",
      contact: "mail@vincentvallet.com",
      accepted: response.ok,
      announcementsAccepted: announcementsResponse.ok,
      status: response.status,
    }));
  },
};

export default deployHandler;

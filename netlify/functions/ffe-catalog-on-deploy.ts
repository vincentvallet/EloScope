import type { DeploySucceededEvent } from "@netlify/functions";
import { catalogStorage } from "../../lib/ffe-catalog/storage";
import { ensureInternalSecret } from "../../lib/ffe-catalog/sync";
import type { CatalogSyncStatus } from "../../lib/ffe-catalog/types";

const deployHandler = {
  async deploySucceeded(event: DeploySucceededEvent) {
    if (event.deploy.context !== "production") return;
    const storage = catalogStorage();
    const status = await storage.getJSON<CatalogSyncStatus>("metadata/sync-status.json");
    if ((status?.itemCount ?? 0) > 0) {
      console.log(JSON.stringify({ event: "ffe_catalog_deploy_check", catalogExists: true, itemCount: status!.itemCount }));
      return;
    }
    const secret = await ensureInternalSecret(storage);
    const response = await fetch(new URL("/.netlify/functions/ffe-catalog-sync-worker", event.site.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
      body: JSON.stringify({ mode: "initial" }),
    });
    console.log(JSON.stringify({
      event: "ffe_catalog_initialization_dispatched",
      contact: "mail@vincentvallet.com",
      accepted: response.ok,
      status: response.status,
    }));
  },
};

export default deployHandler;

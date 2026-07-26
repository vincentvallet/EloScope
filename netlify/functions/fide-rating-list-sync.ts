import type { Config } from "@netlify/functions";
import { FideClient } from "../../lib/fide/client";
import { fideStorage } from "../../lib/fide/storage";

export default async function fideRatingListSync() {
  const storage = fideStorage();
  try {
    const response = await new FideClient({ storage }).html("https://ratings.fide.com/download_lists.phtml", {
      cacheKey: "fide/http/download-lists.json",
      ttlMs: 24 * 60 * 60_000,
    });
    const links = [...response.body.matchAll(/href=["']([^"']+\.(?:zip|txt|xml))["']/gi)].map((match) => match[1]).slice(0, 30);
    await storage.setJSON("fide/metadata/sync-status.json", {
      status: "catalogued",
      discoveredFiles: links.length,
      fetchedAt: response.fetchedAt,
      note: "Catalogue officiel découvert ; les listes sont importées en flux par période, jamais par scan joueur.",
    });
    console.log(JSON.stringify({ event: "fide_rating_list_catalogued", files: links.length }));
  } catch (error) {
    await storage.setJSON("fide/metadata/sync-status.json", {
      status: "source-unavailable",
      updatedAt: new Date().toISOString(),
      retryAfter: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    });
    console.warn(JSON.stringify({ event: "fide_rating_list_unavailable", message: error instanceof Error ? error.message : "unknown" }));
  }
}

export const config: Config = { schedule: "41 4 2 * *" };

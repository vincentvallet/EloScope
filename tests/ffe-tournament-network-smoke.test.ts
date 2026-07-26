import { describe, expect, it } from "vitest";
import { normalizeFfeTournamentUrl } from "@/lib/ffe-url";
import { FfeResultsAdapter } from "@/lib/importers/ffe";

const network = process.env.FFE_NETWORK_SMOKE === "1" ? describe : describe.skip;

network("smoke réseau fiche tournoi FFE", () => {
  it("valide la fiche 67414 et exécute le pipeline serveur avec un nombre borné de requêtes", async () => {
    const normalized = normalizeFfeTournamentUrl("https://echecs.asso.fr/FicheTournoi.aspx?Ref=67414");
    expect(normalized.ref).toBe("67414");
    expect(normalized.url).toBe("https://echecs.asso.fr/FicheTournoi.aspx?Ref=67414");
    const adapter = new FfeResultsAdapter();
    const source = await adapter.fetchSource(normalized.url);
    const report = adapter.normalize(await adapter.parseSource(source));
    expect(source.sourceUrl).toBe(normalized.url);
    expect(report.report.title.length).toBeGreaterThan(3);
    expect(report.players.length).toBeGreaterThan(0);
  }, 30_000);
});

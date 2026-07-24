import { describe, expect, it } from "vitest";
import { parseFfeHtml, validateFfeUrl } from "@/lib/importers/ffe";
import { ManualCsvAdapter } from "@/lib/importers/csv";

describe("import FFE", () => {
  it("refuse les domaines et protocoles non autorisés", () => {
    expect(() => validateFfeUrl("http://127.0.0.1/results")).toThrow();
    expect(() => validateFfeUrl("https://example.com/results")).toThrow();
    expect(validateFfeUrl("https://www.echecs.asso.fr/FicheTournoi.aspx")).toBeInstanceOf(URL);
  });
  it("détecte les colonnes variables, accents, espaces et demi-points", () => {
    const parsed = parseFfeHtml(`<h2>Open d’Été</h2><table><tr><th>Nom joueur</th><th>Elo</th><th>Ronde 1</th></tr><tr><td>Léa&nbsp;Martin</td><td>1842</td><td>&frac12;</td></tr></table>`);
    expect(parsed.title).toBe("Open d’Été");
    expect(parsed.rows[0]).toEqual(["Léa Martin","1842","½"]);
  });
});

describe("import CSV", () => {
  it("normalise un fichier français", async () => {
    const adapter = new ManualCsvAdapter();
    const parsed = await adapter.parseSource({ kind:"csv", content:"Joueur;Elo;Club;Score\nLéa Martin;1842;Lille;6,5", fetchedAt:"" });
    const normalized = adapter.normalize(parsed);
    expect(normalized.players[0]).toMatchObject({ name:"Léa Martin", rating:1842, club:"Lille", score:6.5 });
  });
});

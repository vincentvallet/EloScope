import { describe, expect, it } from "vitest";
import {
  americanGridUrl,
  FfeResultsAdapter,
  parseFfeHtml,
  parseFfeParticipants,
  tournamentSourceUrls,
  validateFfeUrl,
} from "@/lib/importers/ffe";

const gridFixture = `
<table><tbody>
  <tr class="papi_titre"><td colspan="12">Open officiel 2026<br>Grille américaine après la ronde 2</td></tr>
  <tr class="papi_small_t">
    <td>Pl</td><td>&nbsp;</td><td>Nom</td><td>Rapide</td><td>Cat.</td><td>Fede</td><td>Ligue</td>
    <td>R 1</td><td>R 2</td><td>Pts</td><td>Tr.</td><td>Perf</td>
  </tr>
  <tr class="papi_small_f">
    <td>1</td><td></td><td><div class="papi_joueur_box"><b>Élodie Martin</b><div class="data"><table><tr><td>bruit détail</td></tr></table></div></div></td>
    <td>1842 F</td><td>SenF</td><td><img src="flags/FRA.GIF"></td><td>HDF</td>
    <td>+ 2B</td><td>= 2N</td><td>1½</td><td>3½</td><td>1920</td>
  </tr>
  <tr class="papi_small_p">
    <td>2</td><td></td><td><div class="papi_joueur_box"><b>Hugo Bernard</b></div></td>
    <td>1798 F</td><td>SenM</td><td><img src="flags/BEL.GIF"></td><td>HDF</td>
    <td>- 1N</td><td>= 1B</td><td>½</td><td>2½</td><td>1760</td>
  </tr>
</tbody></table>`;

const participantsFixture = `
<table><tbody>
  <tr class="papi_titre"><td colspan="8">Open officiel 2026<br>Liste des participants</td></tr>
  <tr class="papi_liste_t">
    <td>Nr</td><td>&nbsp;</td><td>Nom</td><td>Rapide</td><td>Cat.</td><td>Fede</td><td>Ligue</td><td>Club</td>
  </tr>
  <tr class="papi_liste_f">
    <td>1</td><td></td><td>Élodie Martin</td><td>1842 F</td><td>SenF</td><td><img src="flags/FRA.GIF"></td><td>HDF</td><td>Échiquier du Nord</td>
  </tr>
  <tr class="papi_liste_c">
    <td>2</td><td></td><td>Hugo Bernard</td><td>1798 F</td><td>SenM</td><td><img src="flags/BEL.GIF"></td><td>HDF</td><td>Club de Lille</td>
  </tr>
</tbody></table>`;

describe("import FFE", () => {
  it("refuse les domaines et protocoles non autorisés", () => {
    expect(() => validateFfeUrl("http://127.0.0.1/results")).toThrow();
    expect(() => validateFfeUrl("https://example.com/results")).toThrow();
    expect(validateFfeUrl("https://www.echecs.asso.fr/Resultats.aspx?URL=x")).toBeInstanceOf(URL);
  });

  it("convertit un lien de classement en grille américaine", () => {
    const url = americanGridUrl("https://echecs.asso.fr/Resultats.aspx?URL=Tournois/Id/68186/68186&Action=Cl");
    expect(url.searchParams.get("Action")).toBe("Ga");
  });

  it("dérive la liste des participants et la grille depuis la fiche tournoi", () => {
    const urls = tournamentSourceUrls("https://echecs.asso.fr/FicheTournoi.aspx?Ref=70244");
    expect(urls.participants.searchParams.get("Action")).toBe("Ls");
    expect(urls.grid.searchParams.get("Action")).toBe("Ga");
    expect(urls.grid.searchParams.get("URL")).toBe("Tournois/Id/70244/70244");
  });

  it("parse la structure FFE, les accents, fédérations, demi-points et rondes", async () => {
    const parsed = parseFfeHtml(gridFixture);
    expect(parsed.title).toBe("Open officiel 2026");
    expect(parsed.currentRound).toBe(2);
    expect(parsed.rows[0][2]).toBe("Élodie Martin");
    expect(parsed.rows[0][5]).toBe("FRA");

    const participants = parseFfeParticipants(participantsFixture);
    expect(participants[0]).toMatchObject({ name: "Élodie Martin", club: "Échiquier du Nord" });
    const normalized = new FfeResultsAdapter().normalize({ ...parsed, participants });
    expect(normalized.players[0]).toMatchObject({
      name: "Élodie Martin",
      rating: 1842,
      federation: "FRA",
      club: "Échiquier du Nord",
      score: 1.5,
      performance: 1920,
    });
    expect(normalized.players[0].rounds[0]).toMatchObject({
      result: 1,
      color: "WHITE",
      opponentName: "Hugo Bernard",
      opponentRating: 1798,
    });
  });

  it("remonte une erreur claire lorsqu’aucune grille n’est présente", () => {
    const parsed = parseFfeHtml("<html><body><table></table></body></html>");
    expect(parsed.rows).toEqual([]);
    expect(parsed.warnings[0]).toContain("Aucune grille américaine");
  });

  it("calcule une performance et des départages lorsque la FFE ne les publie pas", () => {
    const normalized = new FfeResultsAdapter().normalize({
      title: "Tournoi sans colonnes calculées",
      currentRound: 1,
      headers: ["Pl", "Nom", "Rapide", "R 1", "Pts"],
      rows: [
        ["1", "Alice", "1800", "+ 2B", "1"],
        ["2", "Bruno", "1700", "- 1N", "0"],
      ],
      warnings: [],
    });
    expect(normalized.players.every((player) => player.performance != null)).toBe(true);
    expect(normalized.players[0].tieBreaks).toMatchObject({
      "Buchholz calculé": 0,
      "Sonneborn-Berger calculé": 0,
      "Progressif calculé": 1,
    });
    expect(normalized.players[1].tieBreaks["Buchholz calculé"]).toBe(1);
  });
});

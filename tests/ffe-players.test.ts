import { describe, expect, it } from "vitest";
import { parsePlayerDirectory } from "@/lib/ffe-players/directory-parser";
import { playerDirectoryForm } from "@/lib/ffe-players/aspnet-form";
import { identityConfidence, normalizePlayerName } from "@/lib/ffe-players/identity";
import { MemoryPlayerStorage } from "@/lib/ffe-players/storage";
import { savePlayerProfiles, searchPlayers } from "@/lib/ffe-players/search";
import type { FfePlayerProfile, PlayerTournamentParticipation } from "@/lib/ffe-players/types";

const directoryFixture = `
<table>
  <tr class="liste_titre"><td>NrFFE</td><td>Nom et Prénom</td><td>Af.</td><td>Info</td><td>Elo</td><td>Rapide</td><td>Blitz</td><td>Cat</td><td>M.</td><td>Club</td></tr>
  <tr class="liste_clair"><td>A12345</td><td>DUPONT Élodie-Anne</td><td>A</td><td><a href="FicheJoueur.aspx?Id=101">+</a></td><td>1842 F</td><td>1770 F</td><td>1701 F</td><td>SenF</td><td></td><td>Échiquier des Lilas</td></tr>
  <tr class="liste_fonce"><td>B54321</td><td>DUPONT Élodie-Anne</td><td>A</td><td><a href="FicheJoueur.aspx?Id=202">+</a></td><td>1530 F</td><td>1490 F</td><td></td><td>SenF</td><td></td><td>Cavalier Bleu</td></tr>
</table>`;

describe("annuaire joueurs FFE", () => {
  it("parse les codes, identifiants liés, accents, tirets, Elo et clubs sans fusionner les homonymes", () => {
    const players = parsePlayerDirectory(directoryFixture, "2026-01-01T00:00:00.000Z");
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      ffeCode: "A12345",
      ffeInternalId: "101",
      displayName: "Élodie-Anne DUPONT",
      standardRating: 1842,
      currentClubName: "Échiquier des Lilas",
    });
    expect(players[0].normalizedName).toBe("ELODIE-ANNE DUPONT");
    expect(players[1].ffeCode).toBe("B54321");
  });

  it("normalise accents, apostrophes et espaces", () => {
    expect(normalizePlayerName("  L’Hôpital   Marie-Claire ")).toBe("L'HOPITAL MARIE-CLAIRE");
  });

  it("prépare les recherches nom-prénom dans les deux ordres et les préfixes", () => {
    expect(playerDirectoryForm("DUPONT Marie").get("JoueurNom")).toBe("DUPONT*");
    expect(playerDirectoryForm("DUPONT Marie").get("JoueurPrenom")).toBe("Marie*");
    expect(playerDirectoryForm("Marie Dupont", true).get("JoueurNom")).toBe("Dupont*");
    expect(playerDirectoryForm("A12345").get("JoueurNom")).toBe("A12345");
  });

  it("classe le code exact avant le nom et garde deux codes distincts", async () => {
    const storage = new MemoryPlayerStorage();
    const parsed = parsePlayerDirectory(directoryFixture);
    const client = { search: async () => parsed };
    const result = await searchPlayers(storage, client as never, "A12345");
    expect(result[0].ffeCode).toBe("A12345");
    expect((await storage.list("players/profiles/"))).toHaveLength(2);
  });

  it("n'accorde une correspondance forte de nom qu'avec un indice concordant", () => {
    const profile: FfePlayerProfile = parsePlayerDirectory(directoryFixture)[0];
    expect(identityConfidence(profile, { name: "Élodie-Anne Dupont", club: "Échiquier des Lilas" })).toBe("strong_name_match");
    expect(identityConfidence(profile, { name: "Élodie-Anne Dupont", club: "Autre Club", rating: 1200 })).toBe("ambiguous");
    expect(identityConfidence(profile, { name: "Autre Personne", ffeCode: "A12345" })).toBe("exact_ffe_code");
  });

  it("rattache les participations déjà indexées lorsqu'un profil est recherché plus tard", async () => {
    const storage = new MemoryPlayerStorage();
    const profile = parsePlayerDirectory(directoryFixture)[0];
    const participation = {
      id: "67414:1",
      playerKey: "name:ELODIE-ANNE DUPONT",
      playerNameAtTournament: "Élodie-Anne DUPONT",
      normalizedPlayerName: "ELODIE-ANNE DUPONT",
      tournamentRef: "67414",
      tournamentTitle: "Open test",
      clubAtTournament: "Échiquier des Lilas",
      hasOfficialResults: true,
      canOpenReport: true,
      identityConfidence: "ambiguous",
      sourceUrl: "https://echecs.asso.fr/FicheTournoi.aspx?Ref=67414",
      indexedAt: "2026-01-01T00:00:00.000Z",
    } satisfies PlayerTournamentParticipation;
    await storage.setJSON("participations/by-name/ELODIE-ANNE-DUPONT/67414-1.json", participation);
    await savePlayerProfiles(storage, [profile]);
    expect(await storage.getJSON<PlayerTournamentParticipation>(
      "players/by-code/A12345/participations/67414.json",
    )).toMatchObject({ ffeCode: "A12345", identityConfidence: "strong_name_match" });
  });

  it("reste indexé avec 30 000 tournois et 300 000 participations simulées", async () => {
    const profile = parsePlayerDirectory(directoryFixture)[0];
    let reads = 0;
    const largeIndexedStorage = {
      async getJSON<T>(key: string) {
        reads += 1;
        return (key === "players/profiles/A12345.json" ? profile : null) as T | null;
      },
      async setJSON() {},
      async list(prefix = "") {
        reads += 1;
        if (prefix === "indexes/player-prefix/DUP/") return ["indexes/player-prefix/DUP/A12345.json"];
        return [];
      },
      simulatedTournamentCount: 30_000,
      simulatedParticipationCount: 300_000,
    };
    const started = performance.now();
    const result = await searchPlayers(largeIndexedStorage, { search: async () => [] } as never, "Dupont");
    expect(result[0].ffeCode).toBe("A12345");
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(reads).toBeLessThan(10);
  });
});

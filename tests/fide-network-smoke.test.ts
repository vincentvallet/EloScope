import { describe, expect, it } from "vitest";
import { FfePlayersClient } from "@/lib/ffe-players/client";
import { FideClient } from "@/lib/fide/client";
import { normalizeFideId } from "@/lib/fide/identity/normalize-fide-id";
import { parseFideProfile } from "@/lib/fide/parsers/profile";
import { MemoryFideStorage } from "@/lib/fide/storage/memory";
import { MemoryPlayerStorage } from "@/lib/ffe-players/storage";
import { buildGlobalReport } from "@/lib/fide/report";
import { FfeResultsAdapter } from "@/lib/importers/ffe";
import { savePlayerProfiles } from "@/lib/ffe-players/search";
import { indexTournamentParticipations } from "@/lib/ffe-players/participation-index";

describe.skipIf(process.env.FIDE_NETWORK_SMOKE !== "1")("smoke réseau FFE/FIDE borné", () => {
  it("résout uniquement l'identité de validation et lit son profil officiel sans conserver le HTML", async () => {
    const ffe = new FfePlayersClient();
    const directory = await ffe.search("W16194", 1);
    const profile = await ffe.enrich(directory.find((item) => item.ffeCode === "W16194")!);
    expect(profile.displayName).toMatch(/Vincent VALLET/i);
    expect(normalizeFideId(profile.fideId!)).toBe("637610");
    const isolatedStorage = new MemoryFideStorage();
    const fideClient = new FideClient({ storage: isolatedStorage });
    const response = await fideClient.html("https://ratings.fide.com/profile/637610", {
      cacheKey: "fide/players/637610/profile-html.json",
    });
    const fide = parseFideProfile(response.body, "637610", response.fetchedAt);
    expect(fide).toMatchObject({
      fideId: "637610",
      standardRating: expect.any(Number),
      federationCode: "FRA",
      federationFlag: "🇫🇷",
      birthYear: 1986,
    });
    expect(fide.fideTitle).toBeUndefined();
    expect(fide.ratings.length).toBeGreaterThan(12);
    const periods = fide.ratings.map((item) => item.period).sort();
    expect(Date.parse(periods.at(-1)!) - Date.parse(periods[0])).toBeGreaterThan(3 * 365 * 24 * 60 * 60_000);
    const players = new MemoryPlayerStorage();
    await savePlayerProfiles(players, [profile]);
    const ffeTournament = new FfeResultsAdapter();
    const tournamentSource = await ffeTournament.fetchSource("https://echecs.asso.fr/FicheTournoi.aspx?Ref=40880");
    const tournament = ffeTournament.normalize(await ffeTournament.parseSource(tournamentSource));
    expect(tournament.players.some((player) => /VALLET Vincent/i.test(player.name))).toBe(true);
    await indexTournamentParticipations(players, "40880", tournament);
    expect(await players.getJSON("players/by-code/W16194/participations/40880.json")).toMatchObject({
      ffeCode: "W16194",
      tournamentRef: "40880",
      identityConfidence: "strong_name_match",
    });
    const built = await buildGlobalReport("W16194", {
      fide: isolatedStorage,
      players,
      client: fideClient,
    });
    expect(built).toMatchObject({ state: "ready", report: { ffeCode: "W16194", fideId: "637610" } });
    expect(built.report?.careerEvents?.length).toBeGreaterThan(0);
    expect(built.report?.careerEvents?.some((event) => !event.ffeTournamentRef)).toBe(true);
    expect((await isolatedStorage.list()).some((key) => key === "fide/player-reports/W16194/report.json")).toBe(true);
  }, 120_000);
});

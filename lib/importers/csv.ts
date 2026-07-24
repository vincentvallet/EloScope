import type { NormalizedTournament, ParsedTournament, RawTournamentSource, TournamentSourceAdapter } from "./types";

function parseCsvLine(line: string, separator: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === separator && !quoted) {
      cells.push(current.trim()); current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

export class ManualCsvAdapter implements TournamentSourceAdapter {
  id = "manual-csv";
  name = "Fichier CSV manuel";
  canHandle(input: string) { return input.toLowerCase().endsWith(".csv") || input.includes("\n"); }
  async fetchSource(input: string): Promise<RawTournamentSource> {
    return { kind: "csv", content: input, fetchedAt: new Date().toISOString() };
  }
  async parseSource(source: RawTournamentSource): Promise<ParsedTournament> {
    const clean = source.content.replace(/^\uFEFF/, "").replace(/\u00A0/g, " ").trim();
    const lines = clean.split(/\r?\n/).filter(Boolean);
    const separator = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
    const [headers = [], ...rows] = lines.map((line) => parseCsvLine(line, separator));
    return { headers, rows, warnings: headers.length ? [] : ["En-têtes absents"] };
  }
  normalize(parsed: ParsedTournament): NormalizedTournament {
    const aliases: Record<string, string[]> = {
      name: ["joueur", "nom", "player", "playername"],
      rating: ["elo", "classement", "rating"],
      club: ["club", "clubname"],
      score: ["score", "points"],
    };
    const normalizedHeaders = parsed.headers.map((header) =>
      header.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s/g, "")
    );
    const indexOf = (key: string) => normalizedHeaders.findIndex((header) => aliases[key].includes(header));
    return {
      report: { sourceType: "CSV", importedAt: new Date().toISOString() },
      players: parsed.rows.map((row) => ({
        name: row[indexOf("name")] || null,
        rating: Number(row[indexOf("rating")]) || null,
        club: row[indexOf("club")] || null,
        score: Number(row[indexOf("score")].replace(",", ".")) || 0,
      })),
      warnings: [...parsed.warnings, ...(indexOf("name") < 0 ? ["Colonne joueur introuvable"] : [])],
    };
  }
}

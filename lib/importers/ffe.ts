import type {
  ImportedPlayer,
  ImportedRound,
  NormalizedTournament,
  ParsedTournament,
  RawTournamentSource,
  TournamentSourceAdapter,
} from "./types";

const ALLOWED_HOSTS = new Set(["echecs.asso.fr", "www.echecs.asso.fr"]);
const MAX_BYTES = 2_000_000;

export function validateFfeUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Seules les URL HTTPS du domaine echecs.asso.fr sont autorisées.");
  }
  if (url.username || url.password || url.port) throw new Error("URL non autorisée.");
  return url;
}

export function americanGridUrl(input: string) {
  const url = validateFfeUrl(input);
  if (/\/Resultats\.aspx$/i.test(url.pathname) && url.searchParams.has("URL")) {
    url.searchParams.set("Action", "Ga");
  }
  return url;
}

function cleanText(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&frac12;|&#189;/gi, "½")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHalfNumber(value: string) {
  const normalized = cleanText(value).replace("½", ".5").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cellText(cell: string, header: string) {
  if (/fede/i.test(header)) {
    const source = cell.match(/<img[^>]+src\s*=\s*["']?([^"' >]+)/i)?.[1] ?? "";
    const match = source.match(/\/([A-Z]{3})\.(?:gif|png)$/i);
    if (match) return match[1].toUpperCase();
  }
  const withoutDetails = cell.replace(/<div[^>]+class\s*=\s*["']?data["']?[^>]*>[\s\S]*$/i, "");
  return cleanText(withoutDetails);
}

function findBalancedTable(html: string, position: number) {
  const start = html.lastIndexOf("<table", position);
  if (start < 0) return "";
  const tagPattern = /<\/?table\b[^>]*>/gi;
  tagPattern.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    if (/^<table/i.test(match[0])) depth += 1;
    else depth -= 1;
    if (depth === 0) return html.slice(start, tagPattern.lastIndex);
  }
  return "";
}

function directRows(table: string) {
  const rows: string[] = [];
  const tagPattern = /<\/?(?:table|tr)\b[^>]*>/gi;
  let tableDepth = 0;
  let rowStart = -1;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(table))) {
    const tag = match[0].toLowerCase();
    if (tag.startsWith("<table")) tableDepth += 1;
    else if (tag.startsWith("</table")) tableDepth -= 1;
    else if (tag.startsWith("<tr") && tableDepth === 1 && rowStart < 0) rowStart = match.index;
    else if (tag.startsWith("</tr") && tableDepth === 1 && rowStart >= 0) {
      rows.push(table.slice(rowStart, tagPattern.lastIndex));
      rowStart = -1;
    }
  }
  return rows;
}

function directCells(row: string) {
  const cells: string[] = [];
  const tagPattern = /<\/?(?:table|td|th)\b[^>]*>/gi;
  let tableDepth = 0;
  let cellStart = -1;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(row))) {
    const tag = match[0].toLowerCase();
    if (tag.startsWith("<table")) tableDepth += 1;
    else if (tag.startsWith("</table")) tableDepth -= 1;
    else if (/^<t[dh]/i.test(tag) && tableDepth === 0 && cellStart < 0) cellStart = tagPattern.lastIndex;
    else if (/^<\/t[dh]/i.test(tag) && tableDepth === 0 && cellStart >= 0) {
      cells.push(row.slice(cellStart, match.index));
      cellStart = -1;
    }
  }
  return cells;
}

export function parseFfeHtml(html: string): ParsedTournament {
  const gridPosition = html.search(/grille am.ricaine/i);
  if (gridPosition < 0) {
    return {
      headers: [],
      rows: [],
      warnings: ["Aucune grille américaine n’a été détectée dans cette page FFE."],
    };
  }

  const table = findBalancedTable(html, gridPosition);
  const rowsHtml = directRows(table);
  const titleRow = rowsHtml.find((row) => /papi_titre/i.test(row) && /grille am.ricaine/i.test(cleanText(row))) ?? "";
  const titleText = cleanText(titleRow);
  const title = titleText.replace(/\s*grille am.ricaine.*$/i, "").trim();
  const currentRound = Number(titleText.match(/ronde\s+(\d+)/i)?.[1] ?? 0);
  const headerRow = rowsHtml.find((row) => /papi_(?:small|liste)_t/i.test(row)) ?? "";
  const headers = directCells(headerRow).map(cleanText);
  const rows = rowsHtml
    .filter((row) => /papi_(?:small|liste)_[fp]/i.test(row))
    .map((row) => directCells(row).map((cell, index) => cellText(cell, headers[index] ?? "")));

  const warnings: string[] = [];
  if (!headers.some((header) => /^Nom$/i.test(header))) warnings.push("Colonne joueur non reconnue.");
  if (!headers.some((header) => /^R\s*\d+$/i.test(header))) warnings.push("Aucune ronde détaillée reconnue.");
  if (!rows.length) warnings.push("La grille ne contient aucun joueur exploitable.");
  return { title, currentRound, headers, rows, warnings };
}

function parseRound(notation: string, round: number): ImportedRound {
  const compact = cleanText(notation);
  const opponentRank = Number(compact.match(/(\d+)/)?.[1] ?? 0) || undefined;
  const marker = compact.charAt(0);
  const result = marker === "+" ? 1 : marker === "=" ? 0.5 : marker === "-" ? 0 : null;
  const suffix = compact.match(/([BN])$/i)?.[1]?.toUpperCase();
  return {
    round,
    notation: compact,
    opponentRank,
    color: suffix === "B" ? "WHITE" : suffix === "N" ? "BLACK" : "UNKNOWN",
    result,
    played: result !== null && !!opponentRank,
  };
}

export class FfeResultsAdapter implements TournamentSourceAdapter {
  id = "ffe-results";
  name = "Fédération Française des Échecs";

  canHandle(input: string) {
    try { americanGridUrl(input); return true; } catch { return false; }
  }

  async fetchSource(input: string): Promise<RawTournamentSource> {
    const current = americanGridUrl(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;

    try {
      response = await fetch(current, {
        redirect: "follow",
        headers: { accept: "text/html,application/xhtml+xml" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    validateFfeUrl(response.url);
    if (!response.ok) throw new Error(`La source FFE ne répond pas actuellement (${response.status}).`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("La page reçue n’est pas une grille HTML.");
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error("La grille FFE dépasse la taille autorisée.");
    const content = await response.text();
    if (new TextEncoder().encode(content).byteLength > MAX_BYTES) throw new Error("La grille FFE dépasse la taille autorisée.");
    return { kind: "html", content, fetchedAt: new Date().toISOString() };
  }

  async parseSource(source: RawTournamentSource) {
    return parseFfeHtml(source.content);
  }

  normalize(parsed: ParsedTournament): NormalizedTournament {
    const normalizedHeaders = parsed.headers.map((header) =>
      header.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    );
    const find = (...patterns: RegExp[]) =>
      normalizedHeaders.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    const rankIndex = find(/^pl$/);
    const nameIndex = find(/^nom$/);
    const ratingIndex = find(/^elo$/, /standard/, /rapide/, /blitz/);
    const categoryIndex = find(/^cat/);
    const federationIndex = find(/^fede/);
    const leagueIndex = find(/^ligue/);
    const scoreIndex = find(/^pts/);
    const performanceIndex = find(/^perf/);
    const tieBreakIndexes = parsed.headers
      .map((header, index) => (/^(tr\.|cu\.|buch)/i.test(header) ? index : -1))
      .filter((index) => index >= 0);
    const roundIndexes = parsed.headers
      .map((header, index) => (/^R\s*\d+$/i.test(header) ? index : -1))
      .filter((index) => index >= 0);

    const players: ImportedPlayer[] = parsed.rows.map((row, playerIndex) => {
      const rank = Number(row[rankIndex]) || playerIndex + 1;
      const rounds = roundIndexes.map((index, roundIndex) => parseRound(row[index] ?? "", roundIndex + 1));
      return {
        id: `ffe-${rank}`,
        rank,
        name: row[nameIndex] || `Joueur ${rank}`,
        rating: Number((row[ratingIndex] ?? "").match(/\d+/)?.[0]) || undefined,
        category: row[categoryIndex] || undefined,
        federation: row[federationIndex] || undefined,
        league: row[leagueIndex] || undefined,
        score: parseHalfNumber(row[scoreIndex] ?? "0"),
        performance: Number((row[performanceIndex] ?? "").match(/\d+/)?.[0]) || undefined,
        tieBreaks: Object.fromEntries(tieBreakIndexes.map((index) => [
          parsed.headers[index],
          row[index] ? parseHalfNumber(row[index]) : null,
        ])),
        rounds,
      };
    });

    const byRank = new Map(players.map((player) => [player.rank, player]));
    for (const player of players) {
      for (const round of player.rounds) {
        const opponent = round.opponentRank ? byRank.get(round.opponentRank) : undefined;
        if (opponent) {
          round.opponentName = opponent.name;
          round.opponentRating = opponent.rating;
        }
      }
    }

    return {
      report: {
        title: parsed.title || "Tournoi FFE importé",
        sourceType: "FFE",
        currentRound: parsed.currentRound || roundIndexes.length,
        totalRounds: roundIndexes.length,
        status: "UNKNOWN",
        ratingType: normalizedHeaders.some((header) => /blitz/.test(header))
          ? "BLITZ"
          : normalizedHeaders.some((header) => /rapide/.test(header))
            ? "RAPID"
            : "STANDARD",
        importedAt: new Date().toISOString(),
      },
      players,
      warnings: parsed.warnings,
    };
  }
}

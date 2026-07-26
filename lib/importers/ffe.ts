import type {
  ImportedPlayer,
  ImportedRound,
  NormalizedTournament,
  ParsedParticipant,
  ParsedTournament,
  RawTournamentSource,
  TournamentSourceAdapter,
} from "./types";
import { estimatePerformance } from "@/lib/rating/engine";
import { normalizeFfeTournamentUrl } from "@/lib/ffe-url";

const ALLOWED_HOSTS = new Set(["echecs.asso.fr", "www.echecs.asso.fr"]);
// Large Swiss-system grids can legitimately exceed 2 MB (Cappelle 2026 is
// about 2.64 MB). Keep a strict cap while allowing these major events.
const MAX_BYTES = 4_000_000;
const FFE_PAGE_TIMEOUT_MS = 15_000;

export function validateFfeUrl(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Seules les URL du domaine echecs.asso.fr sont autorisées.");
  }
  if (url.username || url.password || url.port) throw new Error("URL non autorisée.");
  url.protocol = "https:";
  url.hostname = "echecs.asso.fr";
  return url;
}

export function tournamentSourceUrls(input: string) {
  const url = validateFfeUrl(input);
  let tournamentId = "";
  if (/\/FicheTournoi\.aspx$/i.test(url.pathname)) {
    const normalized = normalizeFfeTournamentUrl(url.toString());
    tournamentId = normalized.ref;
    url.href = normalized.url;
  } else if (/\/Resultats\.aspx$/i.test(url.pathname)) {
    tournamentId = url.searchParams.get("URL")?.match(/Tournois\/Id\/(\d+)\//i)?.[1] ?? "";
  }
  if (!/^\d+$/.test(tournamentId)) {
    throw new Error("Utilisez le lien de la fiche du tournoi FFE (FicheTournoi.aspx?Ref=…).");
  }
  const base = `${url.origin}/Resultats.aspx?URL=Tournois/Id/${tournamentId}/${tournamentId}`;
  return {
    tournamentId,
    fiche: new URL(`${url.origin}/FicheTournoi.aspx?Ref=${tournamentId}`),
    participants: new URL(`${base}&Action=Ls`),
    grid: new URL(`${base}&Action=Ga`),
  };
}

export function americanGridUrl(input: string) {
  return tournamentSourceUrls(input).grid;
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

export function parseFfeParticipants(html: string): ParsedParticipant[] {
  const listPosition = html.search(/liste des participants/i);
  if (listPosition < 0) return [];
  const table = findBalancedTable(html, listPosition);
  const rowsHtml = directRows(table);
  const headerRow = rowsHtml.find((row) => /papi_liste_t/i.test(row)) ?? "";
  const headers = directCells(headerRow).map(cleanText);
  const normalizedHeaders = headers.map((header) =>
    header.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  );
  const find = (...patterns: RegExp[]) =>
    normalizedHeaders.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  const nameIndex = find(/^nom$/);
  const ratingIndex = find(/^elo$/, /standard/, /rapide/, /blitz/);
  const categoryIndex = find(/^cat/);
  const federationIndex = find(/^fede/);
  const leagueIndex = find(/^ligue/);
  const clubIndex = find(/^club$/);

  return rowsHtml
    .filter((row) => /papi_liste_[fc]/i.test(row))
    .map((row) => directCells(row).map((cell, index) => cellText(cell, headers[index] ?? "")))
    .filter((row) => nameIndex >= 0 && !!row[nameIndex])
    .map((row) => ({
      name: row[nameIndex],
      rating: Number((row[ratingIndex] ?? "").match(/\d+/)?.[0]) || undefined,
      category: row[categoryIndex] || undefined,
      federation: row[federationIndex] || undefined,
      league: row[leagueIndex] || undefined,
      club: row[clubIndex] || undefined,
    }));
}

function normalizedPlayerName(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
}

async function fetchFfePage(url: URL, signal: AbortSignal) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "fr-FR,fr;q=0.9",
      "user-agent": "Mozilla/5.0 (compatible; EloScope/1.0; +https://echecs.asso.fr/)",
    },
    signal,
  });
  validateFfeUrl(response.url);
  if (!response.ok) throw new Error(`La source FFE ne répond pas actuellement (${response.status}).`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("La page reçue n’est pas une page HTML FFE.");
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("La page FFE dépasse la taille autorisée.");
  const content = await response.text();
  if (new TextEncoder().encode(content).byteLength > MAX_BYTES) {
    throw new Error("La page FFE dépasse la taille autorisée.");
  }
  return content;
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
    const urls = tournamentSourceUrls(input);
    const fetchWithTimeout = async (url: URL) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FFE_PAGE_TIMEOUT_MS);
      try { return await fetchFfePage(url, controller.signal); } finally { clearTimeout(timeout); }
    };
    const content = await fetchWithTimeout(urls.grid);
    const participantsContent = await fetchWithTimeout(urls.participants);
    return {
      kind: "html",
      content,
      participantsContent,
      sourceUrl: urls.fiche.toString(),
      fetchedAt: new Date().toISOString(),
    };
  }

  async parseSource(source: RawTournamentSource) {
    const parsed = parseFfeHtml(source.content);
    const participants = source.participantsContent ? parseFfeParticipants(source.participantsContent) : [];
    if (!participants.length) parsed.warnings.push("La liste des participants et des clubs n’a pas pu être lue.");
    return { ...parsed, participants, sourceUrl: source.sourceUrl };
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
      .map((header, index) => (/^(tr\.?|cu\.?|buch|bu\.?|sb|sonn|pro|dep)/i.test(header) ? index : -1))
      .filter((index) => index >= 0);
    const roundIndexes = parsed.headers
      .map((header, index) => (/^R\s*\d+$/i.test(header) ? index : -1))
      .filter((index) => index >= 0);

    const participantsByName = new Map(
      (parsed.participants ?? []).map((participant) => [normalizedPlayerName(participant.name), participant])
    );
    const players: ImportedPlayer[] = parsed.rows.map((row, playerIndex) => {
      const rank = Number(row[rankIndex]) || playerIndex + 1;
      const rounds = roundIndexes.map((index, roundIndex) => parseRound(row[index] ?? "", roundIndex + 1));
      const name = row[nameIndex] || `Joueur ${rank}`;
      const participant = participantsByName.get(normalizedPlayerName(name));
      return {
        id: `ffe-${rank}`,
        rank,
        name,
        rating: Number((row[ratingIndex] ?? "").match(/\d+/)?.[0]) || participant?.rating,
        category: row[categoryIndex] || participant?.category,
        federation: row[federationIndex] || participant?.federation,
        league: row[leagueIndex] || participant?.league,
        club: participant?.club,
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
      if (player.performance == null) {
        player.performance = estimatePerformance(player.rounds.map((round) => ({
          round: round.round,
          opponentName: round.opponentName,
          opponentRating: round.opponentRating,
          color: round.color === "WHITE" ? "WHITE" : round.color === "BLACK" ? "BLACK" : "UNKNOWN",
          result: round.result,
          tournamentPoints: round.result ?? 0,
          played: round.played,
          rated: round.played && round.opponentRating != null,
          bye: !round.played && /exempt/i.test(round.notation),
          forfeit: !round.played && /forfait|[<>]/i.test(round.notation),
          sourceNotation: round.notation,
        })));
      }
      if (!Object.keys(player.tieBreaks).length) {
        let progressive = 0;
        let cumulative = 0;
        let buchholz = 0;
        let sonnebornBerger = 0;
        for (const round of player.rounds) {
          cumulative += round.result ?? 0;
          progressive += cumulative;
          const opponent = round.opponentRank ? byRank.get(round.opponentRank) : undefined;
          if (opponent && round.played) {
            buchholz += opponent.score;
            sonnebornBerger += opponent.score * (round.result ?? 0);
          }
        }
        player.tieBreaks = {
          "Buchholz calculé": Number(buchholz.toFixed(2)),
          "Sonneborn-Berger calculé": Number(sonnebornBerger.toFixed(2)),
          "Progressif calculé": Number(progressive.toFixed(2)),
        };
      }
    }

    return {
      report: {
        title: parsed.title || "Tournoi FFE importé",
        sourceType: "FFE",
        sourceUrl: parsed.sourceUrl,
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

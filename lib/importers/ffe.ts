import type { NormalizedTournament, ParsedTournament, RawTournamentSource, TournamentSourceAdapter } from "./types";

const ALLOWED_HOSTS = new Set(["echecs.asso.fr", "www.echecs.asso.fr"]);
const MAX_BYTES = 2_000_000;

export function validateFfeUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("URL FFE non autorisée");
  }
  if (url.username || url.password || url.port) throw new Error("URL non autorisée");
  return url;
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&frac12;|&#189;/gi, "½")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFfeHtml(html: string): ParsedTournament {
  const title = decodeEntities(html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? "") || undefined;
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? "";
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => decodeEntities(cell[1]))
  ).filter((row) => row.length);
  const [headers = [], ...body] = rows;
  const warnings = [];
  if (!table) warnings.push("Aucune grille américaine détectée");
  if (!headers.some((header) => /joueur|nom/i.test(header))) warnings.push("Colonne joueur non reconnue");
  return { title, headers, rows: body, warnings };
}

export class FfeResultsAdapter implements TournamentSourceAdapter {
  id = "ffe-results";
  name = "Fédération Française des Échecs";
  canHandle(input: string) { try { validateFfeUrl(input); return true; } catch { return false; } }
  async fetchSource(input: string): Promise<RawTournamentSource> {
    const url = validateFfeUrl(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "error",
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      if (!response.ok) throw new Error(`Source FFE indisponible (${response.status})`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) throw new Error("Type de contenu non pris en charge");
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_BYTES) throw new Error("Réponse trop volumineuse");
      const content = await response.text();
      if (new TextEncoder().encode(content).byteLength > MAX_BYTES) throw new Error("Réponse trop volumineuse");
      return { kind: "html", content, fetchedAt: new Date().toISOString() };
    } finally { clearTimeout(timer); }
  }
  async parseSource(source: RawTournamentSource) { return parseFfeHtml(source.content); }
  normalize(parsed: ParsedTournament): NormalizedTournament {
    const normalized = parsed.headers.map((header) => header.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase());
    const find = (patterns: RegExp[]) => normalized.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    const name = find([/joueur/,/^nom/]), rating = find([/elo/,/classement/]), category = find([/categorie/,/cat\./]), performance = find([/perf/]);
    const roundColumns = normalized.map((header, index) => (/^r(onde)?\s*\d+/.test(header) ? index : -1)).filter((index) => index >= 0);
    return {
      report: { title: parsed.title, sourceType: "FFE", importedAt: new Date().toISOString(), totalRounds: roundColumns.length },
      players: parsed.rows.map((row) => ({
        name: name >= 0 ? row[name] : null,
        rating: rating >= 0 ? Number(row[rating].replace(/\D/g, "")) || null : null,
        category: category >= 0 ? row[category] || null : null,
        performance: performance >= 0 ? Number(row[performance].replace(/\D/g, "")) || null : null,
        rounds: roundColumns.map((index) => row[index] || null),
      })),
      warnings: parsed.warnings,
    };
  }
}

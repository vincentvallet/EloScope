import { AspNetPostBackClient, extractHiddenFields } from "./aspnet-postback";
import { parseTournamentList } from "./parsers/results-list";
import { parseTournamentDetails } from "./parsers/tournament-details";

const BASE = "https://www.echecs.asso.fr";
const cache = new Map<string, { expiresAt: number; html: string }>();

export class FfeCatalogClient {
  private readonly asp: AspNetPostBackClient;
  private robotsChecked = false;
  private robotsRequests = 0;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    delayMs = 450,
    jitterMs = 0,
  ) {
    this.asp = new AspNetPostBackClient(fetcher, delayMs, jitterMs);
  }

  get requestCount() {
    return this.asp.requestCount + this.robotsRequests;
  }

  private async checkRobots(signal?: AbortSignal) {
    if (this.robotsChecked) return;
    this.robotsRequests += 1;
    const response = await this.fetcher(`${BASE}/robots.txt`, {
      signal,
      headers: { "user-agent": "EloScope/1.0 (+mail@vincentvallet.com)" },
    }).catch(() => null);
    if (response?.ok) {
      const rules = (await response.text()).toLowerCase();
      if (/user-agent:\s*\*[\s\S]*disallow:\s*\/\s*(?:\r?\n|$)/.test(rules)) {
        throw new Error("Le robots.txt de la FFE interdit cette collecte");
      }
    }
    this.robotsChecked = true;
  }

  async resultsMonth(year: number, month: number, signal?: AbortSignal) {
    return (await this.resultsMonthWithStats(year, month, signal)).items;
  }

  async resultsMonthWithStats(year: number, month: number, signal?: AbortSignal) {
    await this.checkRobots(signal);
    const url = `${BASE}/ListeTournois.aspx?Action=RES&Annee=${year}&Mois=${month}`;
    const pages = await this.asp.pages(url, { maxPages: 80, signal });
    return {
      items: pages.flatMap((page) => parseTournamentList(page.html, url, new Date(), "results")),
      pageCount: pages.length,
      requestCount: this.requestCount,
    };
  }

  async committee(departmentCode: string, signal?: AbortSignal) {
    await this.checkRobots(signal);
    const url = `${BASE}/ListeTournois.aspx?Action=TOURNOICOMITE&ComiteRef=${encodeURIComponent(departmentCode)}`;
    const pages = await this.asp.pages(url, { maxPages: 80, signal });
    return pages.flatMap((page) => parseTournamentList(page.html, url, new Date(), "committee"));
  }

  async announcements(cadence: "Lent" | "UneHeure" | "Rapide" | "Blitz", signal?: AbortSignal) {
    await this.checkRobots(signal);
    const url = `${BASE}/Tournois.aspx`;
    const first = await this.asp.get(url, signal);
    const fields = extractHiddenFields(first.html);
    fields["ctl00$ContentPlaceHolderMain$DropAnnonces"] = cadence;
    fields["ctl00$ContentPlaceHolderMain$CmdAnnonces.x"] = "1";
    fields["ctl00$ContentPlaceHolderMain$CmdAnnonces.y"] = "1";
    const response = await this.asp.postForm(url, fields, signal);
    const pages = await this.asp.pagesFrom(response.url, response, { maxPages: 80, signal });
    return pages.flatMap((page) => parseTournamentList(page.html, response.url, new Date(), "calendar"));
  }

  async detail(ffeRef: string, signal?: AbortSignal) {
    if (!/^\d+$/.test(ffeRef)) throw new Error("Référence FFE invalide");
    const url = `${BASE}/FicheTournoi.aspx?Ref=${ffeRef}`;
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return parseTournamentDetails(cached.html, url);
    const response = await this.asp.get(url, signal);
    cache.set(url, { html: response.html, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return parseTournamentDetails(response.html, url);
  }
}

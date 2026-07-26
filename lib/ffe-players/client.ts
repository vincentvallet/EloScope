import { playerDirectoryForm } from "./aspnet-form";
import { parsePlayerDirectory } from "./directory-parser";
import { parsePlayerDetail } from "./player-detail-parser";
import type { FfePlayerProfile } from "./types";

const USER_AGENT = "EloScope/1.0 (+mail@vincentvallet.com)";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 15_000;
let ffeRequestQueue = Promise.resolve();

async function ffeHtml(url: string, init?: RequestInit) {
  const previous = ffeRequestQueue;
  let release = () => {};
  ffeRequestQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": USER_AGENT,
        ...init?.headers,
      },
    });
    const final = new URL(response.url);
    if (final.protocol !== "https:" || !/(^|\.)echecs\.asso\.fr$/i.test(final.hostname)) {
      throw new Error("Redirection FFE non autorisée");
    }
    if (!response.ok) throw new Error(`L'annuaire FFE ne répond pas (${response.status}).`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new Error("Réponse FFE trop volumineuse.");
    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_BYTES) throw new Error("Réponse FFE trop volumineuse.");
    return html;
  } finally {
    clearTimeout(timer);
    release();
  }
}

export class FfePlayersClient {
  async search(query: string, maxResults = 20): Promise<FfePlayerProfile[]> {
    const request = async (reverse = false) => parsePlayerDirectory(await ffeHtml(
      "https://www.echecs.asso.fr/ListeJoueurs.aspx?Action=FFE",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: playerDirectoryForm(query, reverse),
      },
    ));
    let items = await request();
    if (!items.length && query.trim().includes(" ") && !/^[A-Z]\d{5}$/i.test(query.trim())) items = await request(true);
    return items.slice(0, maxResults);
  }

  async enrich(profile: FfePlayerProfile) {
    if (!profile.sourceUrl) return profile;
    const detail = parsePlayerDetail(await ffeHtml(profile.sourceUrl));
    return { ...profile, ...detail };
  }
}

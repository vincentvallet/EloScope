import { load } from "cheerio";

export type AspNetPage = {
  html: string;
  url: string;
  pageIndex: number;
};

type PostBack = { target: string; argument: string };

export function extractHiddenFields(html: string) {
  const $ = load(html);
  return Object.fromEntries(
    $("input[type=hidden][name]").toArray().map((element) => {
      const input = $(element);
      return [input.attr("name")!, input.attr("value") ?? ""];
    }),
  );
}

export function extractPostBacks(html: string) {
  const $ = load(html);
  const seen = new Set<string>();
  const postbacks: PostBack[] = [];
  $("a[href*='__doPostBack']").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const match = href.match(/__doPostBack\(['"]([^'"]+)['"],['"]([^'"]*)['"]\)/);
    if (!match || !/pager/i.test(match[1])) return;
    // Header and footer pagers target different controls but represent the
    // same page. Canonicalizing by argument halves requests to the FFE.
    const key = match[2];
    if (!seen.has(key)) {
      seen.add(key);
      postbacks.push({ target: match[1], argument: match[2] });
    }
  });
  return postbacks;
}

export class AspNetPostBackClient {
  private cookie = "";

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly delayMs = 350,
  ) {}

  private async request(url: string, init?: RequestInit) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const timeout = AbortSignal.timeout(12_000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      try {
        const response = await this.fetcher(url, {
          ...init,
          signal,
          redirect: "follow",
          headers: {
            accept: "text/html,application/xhtml+xml",
            "accept-language": "fr-FR,fr;q=0.9",
            "user-agent": "EloScope/1.0 (+mail@vincentvallet.com)",
            ...(this.cookie ? { cookie: this.cookie } : {}),
            ...init?.headers,
          },
        });
        if (!response.ok) {
          if (response.status < 500 && response.status !== 429) throw new Error(`FFE HTTP ${response.status}`);
          throw new Error(`FFE HTTP ${response.status}`);
        }
        const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
        const cookies = getSetCookie ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie") ?? ""];
        if (cookies.filter(Boolean).length) this.cookie = cookies.map((value) => value.split(";")[0]).join("; ");
        const declaredSize = Number(response.headers.get("content-length") ?? 0);
        if (declaredSize > 2_000_000) throw new Error("Page FFE trop volumineuse");
        const html = await response.text();
        if (new TextEncoder().encode(html).byteLength > 2_000_000) throw new Error("Page FFE trop volumineuse");
        return { html, url: response.url };
      } catch (error) {
        lastError = error;
        if (init?.signal?.aborted || attempt === 2 || (error instanceof Error && /FFE HTTP 4\d\d/.test(error.message) && !/429/.test(error.message))) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
      }
    }
    throw lastError;
  }

  async get(url: string, signal?: AbortSignal) {
    return this.request(url, { signal });
  }

  async postForm(url: string, fields: Record<string, string>, signal?: AbortSignal) {
    const body = new URLSearchParams(fields);
    return this.request(url, {
      method: "POST",
      body,
      signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  }

  async pages(url: string, options: { maxPages?: number; signal?: AbortSignal } = {}) {
    const first = await this.get(url, options.signal);
    return this.pagesFrom(first.url || url, first, options);
  }

  async pagesFrom(
    url: string,
    first: { html: string; url: string },
    options: { maxPages?: number; signal?: AbortSignal } = {},
  ) {
    const maxPages = options.maxPages ?? 50;
    const pages: AspNetPage[] = [{ ...first, pageIndex: 1 }];
    const queue = extractPostBacks(first.html);
    const visited = new Set<string>(["1"]);
    const fingerprints = new Set([fingerprint(first.html)]);
    while (queue.length && pages.length < maxPages) {
      const postback = queue.shift()!;
      const signature = postback.argument;
      if (visited.has(signature)) continue;
      visited.add(signature);
      if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      const fields = extractHiddenFields(pages.at(-1)!.html);
      fields.__EVENTTARGET = postback.target;
      fields.__EVENTARGUMENT = postback.argument;
      const next = await this.postForm(url, fields, options.signal);
      const nextFingerprint = fingerprint(next.html);
      if (fingerprints.has(nextFingerprint)) continue;
      fingerprints.add(nextFingerprint);
      pages.push({ ...next, pageIndex: pages.length + 1 });
      for (const candidate of extractPostBacks(next.html)) {
        const candidateSignature = candidate.argument;
        if (!visited.has(candidateSignature)) queue.push(candidate);
      }
    }
    return pages;
  }
}

function fingerprint(html: string) {
  const refs = [...html.matchAll(/FicheTournoi\.aspx\?Ref=(\d+)/gi)].map((match) => match[1]);
  return refs.join(",");
}

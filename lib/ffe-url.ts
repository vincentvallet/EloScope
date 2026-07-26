const ALLOWED_FFE_HOSTS = new Set(["echecs.asso.fr", "www.echecs.asso.fr"]);
export const FFE_TOURNAMENT_URL_ERROR = "Ce lien ne correspond pas à une fiche de tournoi FFE valide.";

export type NormalizedFfeTournamentUrl = {
  ref: string;
  url: string;
};

export function normalizeFfeTournamentUrl(input: string): NormalizedFfeTournamentUrl {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error(FFE_TOURNAMENT_URL_ERROR);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || !ALLOWED_FFE_HOSTS.has(parsed.hostname.toLowerCase())
    || parsed.username
    || parsed.password
    || parsed.port
    || !/^\/FicheTournoi\.aspx$/i.test(parsed.pathname)
  ) {
    throw new Error(FFE_TOURNAMENT_URL_ERROR);
  }
  const ref = parsed.searchParams.get("Ref");
  if (!ref || !/^\d+$/.test(ref)) throw new Error(FFE_TOURNAMENT_URL_ERROR);
  return {
    ref,
    url: `https://echecs.asso.fr/FicheTournoi.aspx?Ref=${ref}`,
  };
}

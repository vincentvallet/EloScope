export function playerDirectoryForm(query: string, reverse = false) {
  const normalized = query.trim();
  const code = /^[A-Z]\d{5}$/i.test(normalized);
  const rawWords = normalized.split(/\s+/);
  const words = reverse && rawWords.length > 1
    ? [rawWords.at(-1)!, ...rawWords.slice(0, -1)]
    : rawWords;
  const name = code ? normalized.toUpperCase() : `${words[0]}${words[0]?.endsWith("*") ? "" : "*"}`;
  return new URLSearchParams({
    JoueurNom: name,
    ...(words.length > 1 ? { JoueurPrenom: `${words.slice(1).join(" ")}*` } : {}),
  });
}

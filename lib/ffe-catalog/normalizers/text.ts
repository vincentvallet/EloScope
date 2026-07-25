export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, " ")
    .replace(/[‐‑‒–—-]/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function inferCadence(...values: Array<string | undefined>) {
  const text = normalizeSearchText(values.filter(Boolean).join(" "));
  if (/\bblitz\b/.test(text)) return "blitz" as const;
  if (/\brapid(e)?\b|1\s*h\s*ko/.test(text)) return "rapid" as const;
  if (/\bstandard\b|\blent(e)?\b|1h30|90\s*min/.test(text)) return "standard" as const;
  return "unknown" as const;
}

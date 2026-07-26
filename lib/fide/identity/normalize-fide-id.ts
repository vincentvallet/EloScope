export function normalizeFideId(value: string | number) {
  const digits = String(value).trim().replace(/\D/g, "");
  if (!digits || digits.length > 12) throw new Error("Identifiant FIDE invalide");
  return digits.replace(/^0+(?=\d)/, "");
}

export function isFideId(value: string) {
  try {
    return /^\d{4,12}$/.test(normalizeFideId(value));
  } catch {
    return false;
  }
}

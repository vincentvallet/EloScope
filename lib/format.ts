const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export const formatNumber = (value: number) => numberFormat.format(value);
export const formatScore = (value: number) =>
  Number.isInteger(value) ? String(value) : String(value).replace(".5", "½");
export const signed = (value: number, digits = 1) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value))}`;
export const initials = (name: string) =>
  name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

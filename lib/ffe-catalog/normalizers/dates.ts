import { normalizeSearchText } from "./text";

const MONTHS: Record<string, number> = {
  janv: 1, janvier: 1, fevr: 2, fevrier: 2, mars: 3, avr: 4, avril: 4,
  mai: 5, juin: 6, juil: 7, juillet: 7, aout: 8, sept: 9, septembre: 9,
  oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12,
};

export function parseFrenchMonth(value: string) {
  const key = normalizeSearchText(value).replace(/\./g, "").split(" ")[0];
  return MONTHS[key];
}

export function isoDate(year: number, month: number, day: number) {
  if (!year || !month || !day || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

export function parsePartialFrenchDate(value: string, fallbackYear?: number, fallbackMonth?: number) {
  const normalized = normalizeSearchText(value);
  const match = normalized.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/);
  if (!match) return undefined;
  return isoDate(Number(match[3] ?? fallbackYear), parseFrenchMonth(match[2]) ?? fallbackMonth ?? 0, Number(match[1]));
}

export function parseFrenchDateRange(value: string) {
  const normalized = normalizeSearchText(value);
  const matches = [...normalized.matchAll(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/g)];
  if (!matches.length) return {};
  const dates = matches.map((m) => isoDate(Number(m[3]), parseFrenchMonth(m[2]), Number(m[1]))).filter(Boolean) as string[];
  return { startDate: dates[0], endDate: dates.at(-1) };
}

export function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addUtcMonths(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

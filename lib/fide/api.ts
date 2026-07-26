import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server-rate-limit";

export function validateFfeCode(value: string) {
  const code = value.toUpperCase();
  return /^[A-Z]\d{5}$/.test(code) ? code : null;
}

export function fideApiAllowed(request: Request, scope: string, limit = 30) {
  const ip = request.headers.get("x-nf-client-connection-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  return checkRateLimit(`fide:${scope}:${ip}`, limit, 60_000);
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function pageParams(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get("page")) || 1));
  const pageSize = Math.max(1, Math.min(50, Number(url.searchParams.get("pageSize")) || 20));
  return { page, pageSize };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: items.length, pageCount: Math.max(1, Math.ceil(items.length / pageSize)) },
  };
}

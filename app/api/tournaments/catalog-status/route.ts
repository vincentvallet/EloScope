import { NextResponse } from "next/server";
import { catalogStorage } from "@/lib/ffe-catalog/storage";
import { getCatalogStatus } from "@/lib/ffe-catalog/status";

export async function GET() {
  return NextResponse.json(await getCatalogStatus(catalogStorage()), {
    headers: { "cache-control": "public, max-age=10, stale-while-revalidate=30" },
  });
}

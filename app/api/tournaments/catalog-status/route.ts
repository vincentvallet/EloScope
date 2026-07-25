import { NextResponse } from "next/server";
import { catalogStorage } from "@/lib/ffe-catalog/storage";
import type { CatalogSyncStatus } from "@/lib/ffe-catalog/types";

export async function GET() {
  const status = await catalogStorage().getJSON<CatalogSyncStatus>("metadata/sync-status.json");
  return NextResponse.json(status ?? {
    lastAttemptAt: undefined,
    lastSuccessfulSyncAt: undefined,
    isRefreshing: false,
    itemCount: 0,
    updatedMonths: [],
    source: "FFE",
  });
}

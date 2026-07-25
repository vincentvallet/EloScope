import type { CatalogStorage } from "../types";
import { MemoryCatalogStorage } from "./memory";
import { NetlifyBlobCatalogStorage } from "./netlify";

const memory = new MemoryCatalogStorage();

export function catalogStorage(): CatalogStorage {
  const isNetlify = process.env.NETLIFY === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.NETLIFY_DEV;
  return isNetlify ? new NetlifyBlobCatalogStorage() : memory;
}

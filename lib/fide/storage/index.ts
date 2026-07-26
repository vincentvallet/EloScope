import { MemoryFideStorage } from "./memory";
import { NetlifyBlobFideStorage } from "./netlify-blobs";

const memory = new MemoryFideStorage();

export function fideStorage() {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.ELOSCOPE_FIDE_STORAGE === "memory") return memory;
  const netlify = process.env.NETLIFY === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.NETLIFY_DEV;
  return netlify ? new NetlifyBlobFideStorage() : memory;
}

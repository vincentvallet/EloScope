import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

// Netlify uses Nitro's serverless adapter. Keep this configuration separate
// from vite.config.ts, which remains dedicated to Cloudflare/Sites builds.
export default defineConfig({
  plugins: [vinext(), tailwindcss(), nitro()],
});

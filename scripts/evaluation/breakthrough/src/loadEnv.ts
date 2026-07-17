/**
 * Load local env before any production import graph that touches supabaseAdmin.
 * Must be the first import from the harness CLI.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // optional
}

// Assemble-only can run with stubs; generate modes need real OpenRouter keys.
process.env.NEXT_PUBLIC_SUPABASE_URL ??=
  "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  "breakthrough-eval-non-production-stub-key";

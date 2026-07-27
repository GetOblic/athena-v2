/**
 * Server-only Athena Product Knowledge loader.
 * Reads knowledge/athena-product-knowledge.md as UTF-8. No cache, parse, or transform.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function getProductKnowledge(): string {
  return readFileSync(
    join(process.cwd(), "knowledge", "athena-product-knowledge.md"),
    "utf8",
  );
}

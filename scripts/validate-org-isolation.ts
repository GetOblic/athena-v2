/**
 * Lightweight validation for organization-scoped service signatures.
 * Run: npx tsx scripts/validate-org-isolation.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "services");
const requiredPatterns = [
  /organizationId: string/,
  /\.eq\("organization_id", organizationId\)/,
];

const serviceFiles = collectTsFiles(root);
const missing: string[] = [];

for (const file of serviceFiles) {
  const content = readFileSync(file, "utf8");
  const exportsListQueries =
    content.includes(".from(") &&
    !file.endsWith("organizationService.ts") &&
    !file.endsWith("aiService.ts") &&
    !file.endsWith("eventBus.ts") &&
    !file.endsWith("brainProcessor.ts");

  if (!exportsListQueries) {
    continue;
  }

  const hasOrgScope =
    content.includes("organizationId") ||
    content.includes("organization_id");

  if (!hasOrgScope) {
    missing.push(file.replace(`${process.cwd()}/`, ""));
  }
}

if (missing.length > 0) {
  console.error("Services missing organization scoping:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("Organization isolation validation passed.");

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

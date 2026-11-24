import type { ExtractionRun, NormalizedProduct } from "./types";

export function formatSummary(run: ExtractionRun): string {
  const lines = [
    `${run.sourceWebsite} (${run.adapter})`,
    `Entry: ${run.entryUrl}`,
    `Category: ${run.categoryUrl ?? "none"}`,
    `Minimum variations: ${run.minDistinctColorPatterns}`,
    `Product URLs discovered: ${run.stats.productUrlsDiscovered}`,
    `Product URLs not opened: ${run.stats.productUrlsNotOpened}`,
    `Families discovered: ${run.stats.familiesDiscovered}`,
    `Families analyzed: ${run.stats.familiesAnalyzed}`,
    `Matching families: ${run.stats.matchingFamilies}`,
    `Duplicate families removed: ${run.stats.duplicateFamiliesRemoved}`,
    `Requests: ${run.stats.requests}`,
    `Elapsed: ${(run.stats.elapsedMs / 1000).toFixed(1)}s`,
    `Errors: ${run.stats.errors.length}`,
  ];
  if (run.deduplication) {
    lines.push(
      `Dedup confirmed: ${run.deduplication.confirmed} family=${run.deduplication.familyId ?? "unknown"}`,
    );
  }
  if (run.lengthInvestigation) {
    lines.push(`Length check: ${run.lengthInvestigation.note}`);
  }
  const example = run.matches[0];
  if (example) {
    lines.push(`Example: ${describeMatch(example)}`);
  } else {
    lines.push("Example: no family met the threshold in this sample.");
  }
  for (const error of run.stats.errors.slice(0, 5)) {
    lines.push(`Error: ${error.message} (${error.url})`);
  }
  return lines.join("\n");
}

function describeMatch(product: NormalizedProduct): string {
  const name = product.productName ?? "unnamed";
  const colors = product.colorPatternNames.join(", ");
  return `${name} — ${product.distinctVariationCount} variations [${colors}] — ${product.productUrl}`;
}

export function formatRefilterSummary(input: {
  source: string;
  minDistinctColorPatterns: number;
  analyzed: number;
  matching: number;
  examples: NormalizedProduct[];
}): string {
  const lines = [
    `Refilter ${input.source}`,
    "Network requests: 0",
    `Minimum variations: ${input.minDistinctColorPatterns}`,
    `Families analyzed: ${input.analyzed}`,
    `Matching families: ${input.matching}`,
  ];
  for (const example of input.examples.slice(0, 5)) {
    lines.push(describeMatch(example));
  }
  return lines.join("\n");
}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { applyVariationThreshold, matchingFamilies } from "./filter";
import { runExtraction } from "./runExtraction";
import { formatRefilterSummary, formatSummary } from "./summary";
import type { ExtractionRun } from "./types";

type CliArgs = {
  url: string | null;
  refilter: string | null;
  minVariations: number;
  output: string | null;
  help: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    url: null,
    refilter: null,
    minVariations: 4,
    output: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") args.help = true;
    else if (token === "--url") args.url = argv[++index] ?? null;
    else if (token === "--refilter") args.refilter = argv[++index] ?? null;
    else if (token === "--output") args.output = argv[++index] ?? null;
    else if (token === "--min-variations") {
      args.minVariations = Number(argv[++index]);
    } else {
      throw new Error(`UNKNOWN_ARGUMENT ${token ?? ""}`);
    }
  }
  return args;
}

function helpText(): string {
  return [
    "Local clothing extraction prototype.",
    "node --import tsx prototype/monitor/cli.ts --url https://www.breal.net/ --min-variations 4",
    "node --import tsx prototype/monitor/cli.ts --refilter /tmp/athena-monitor-prototype/breal.net.json --min-variations 6",
    "Supported sites: breal.net, bonoboplanet.com, cache-cache.fr, toscane-boutique.fr",
  ].join("\n");
}

function defaultOutput(run: ExtractionRun): string {
  const directory = "/tmp/athena-monitor-prototype";
  mkdirSync(directory, { recursive: true });
  return path.join(directory, `${run.sourceWebsite}.json`);
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.url && !args.refilter)) {
    console.log(helpText());
    return;
  }
  if (!Number.isInteger(args.minVariations) || args.minVariations < 1) {
    throw new Error("INVALID_THRESHOLD");
  }

  if (args.refilter) {
    const saved = JSON.parse(readFileSync(args.refilter, "utf8")) as ExtractionRun;
    const families = applyVariationThreshold(saved.families, args.minVariations);
    const matches = matchingFamilies(families);
    console.log(
      formatRefilterSummary({
        source: args.refilter,
        minDistinctColorPatterns: args.minVariations,
        analyzed: families.length,
        matching: matches.length,
        examples: matches,
      }),
    );
    if (args.output) {
      writeJson(args.output, {
        refilter: true,
        networkRequests: 0,
        minDistinctColorPatterns: args.minVariations,
        families,
        matches,
      });
      console.log(`JSON: ${args.output}`);
    }
    return;
  }

  const run = await runExtraction({
    url: args.url ?? "",
    minDistinctColorPatterns: args.minVariations,
  });
  const output = args.output ?? defaultOutput(run);
  writeJson(output, run);
  console.log(formatSummary(run));
  console.log(`JSON: ${output}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BlindPair } from "./blind";
import { formatBlindMarkdown } from "./blind";
import type { StagePromptPair } from "./assemble";
import { outDir, reportsDir } from "./paths";

export function ensureArtifactDirs(runId: string, cwd = process.cwd()) {
  const root = join(outDir(cwd), runId);
  mkdirSync(join(root, "prompts"), { recursive: true });
  mkdirSync(join(root, "raw"), { recursive: true });
  mkdirSync(join(root, "blind"), { recursive: true });
  mkdirSync(join(root, "meta"), { recursive: true });
  mkdirSync(reportsDir(cwd), { recursive: true });
  return root;
}

export function writeStagePrompts(input: {
  runRoot: string;
  prospectId: string;
  pair: StagePromptPair;
}) {
  const base = join(
    input.runRoot,
    "prompts",
    input.prospectId,
    input.pair.stage,
  );
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, "standard.txt"), input.pair.standardPrompt, "utf8");
  writeFileSync(
    join(base, "breakthrough.txt"),
    input.pair.breakthroughPrompt,
    "utf8",
  );
  writeFileSync(
    join(base, "integrity.json"),
    JSON.stringify(
      {
        stage: input.pair.stage,
        standardPromptSha256: input.pair.standardPromptSha256,
        breakthroughPromptSha256: input.pair.breakthroughPromptSha256,
        doctrineHash: input.pair.doctrineHash,
        doctrineVersion: input.pair.doctrineVersion,
        resolvedModel: input.pair.resolvedModel,
        llmRole: input.pair.llmRole,
        integrityOk: input.pair.integrityOk,
        integrityErrors: input.pair.integrityErrors,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function writeBlindPair(input: {
  runRoot: string;
  pair: BlindPair;
}) {
  writeFileSync(
    join(input.runRoot, "blind", `${input.pair.pairId}.md`),
    formatBlindMarkdown(input.pair),
    "utf8",
  );
  writeFileSync(
    join(input.runRoot, "meta", `${input.pair.pairId}.mapping.json`),
    JSON.stringify(
      {
        pairId: input.pair.pairId,
        mapping: input.pair.mapping,
        note: "Reveal only after blinded scoring.",
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function writeRunReport(input: {
  cwd?: string;
  runId: string;
  report: Record<string, unknown>;
}) {
  const path = join(reportsDir(input.cwd), `${input.runId}.json`);
  writeFileSync(path, JSON.stringify(input.report, null, 2), "utf8");
  return path;
}

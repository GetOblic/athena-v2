/**
 * Gate 3C — client-safe initial-research marker and held Prospect Generate.
 * No provider calls, database writes, or live research.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { DiscussionRegenerationProvider } from "../../components/discussions/DiscussionRegenerationProvider";
import { ProspectRefreshIntelligenceButton } from "../../components/prospects/ProspectRefreshIntelligenceButton";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { emptyRegenerationSnapshot } from "../../lib/discussionRegenerationStatus";
import {
  readInitialResearchOrchestration as readSharedOrchestration,
} from "../../lib/websiteLearning/initialResearchOrchestration";
import {
  describeIdentityInitialResearch,
  describeProspectGenerateHold,
  describeProspectInitialResearch,
  emptyInitialResearchStatus,
  presentIdentityInitialResearch,
  presentProspectInitialResearch,
  prospectGenerateHeldForInitialResearch,
  serializeInitialResearchStatus,
  type ProspectProgressKind,
} from "../../lib/websiteLearning/initialResearchProgress";
import {
  buildInitialResearchProgress,
  readInitialResearchOrchestration as readPolicyOrchestration,
} from "../../services/websiteLearning/deepScrape/initialResearchPolicy";

const ROOT = process.cwd();
const POLICY = "services/websiteLearning/deepScrape/initialResearchPolicy.ts";
const PROGRESS = "lib/websiteLearning/initialResearchProgress.ts";
const MARKER = "lib/websiteLearning/initialResearchOrchestration.ts";

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const NODE_BUILTINS = new Set([
  "fs",
  "dns",
  "net",
  "child_process",
  "worker_threads",
  "module",
  "tls",
  "http",
  "https",
  "os",
  "crypto",
  "stream",
  "buffer",
  "zlib",
  "path",
  "url",
  "util",
  "perf_hooks",
  "async_hooks",
  "vm",
  "cluster",
  "dgram",
  "readline",
]);

const CODE_EXT = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".cjs"];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function isClientModule(source: string): boolean {
  const header = source.split("\n").slice(0, 30).join("\n");
  return /(?:^|\n)\s*["']use client["']/.test(header);
}

function runtimeSpecifiers(source: string): string[] {
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  const specs: string[] = [];
  const withoutTypeOnly = cleaned
    .replace(/\bimport\s+type\s+[\s\S]*?\sfrom\s*["'][^"']+["']\s*;?/g, "")
    .replace(/\bexport\s+type\s+[\s\S]*?\sfrom\s*["'][^"']+["']\s*;?/g, "");
  const body = withoutTypeOnly.replace(
    /\bexport\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
    (_full, names: string, spec: string) => {
      const parts = names
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const runtime = parts.some((part) => !/^type\s+/.test(part));
      if (runtime) specs.push(spec);
      return "";
    },
  );
  for (const match of body.matchAll(
    /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g,
  )) {
    specs.push(match[1]);
  }
  for (const match of body.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
    specs.push(match[1]);
  }
  for (const match of body.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specs.push(match[1]);
  }
  return specs;
}

function resolveSpecifier(
  fromFile: string,
  spec: string,
): { kind: "node"; spec: string } | { kind: "external" } | { kind: "local"; file: string } {
  if (spec.startsWith("node:") || NODE_BUILTINS.has(spec)) {
    return { kind: "node", spec };
  }
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return { kind: "external" };
  const base = spec.startsWith("@/")
    ? join(ROOT, spec.slice(2))
    : join(dirname(fromFile), spec);
  const candidates = [
    base,
    ...CODE_EXT.map((ext) => `${base}${ext}`),
    ...CODE_EXT.map((ext) => join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return { kind: "local", file: candidate };
    }
  }
  throw new Error(`Unresolved import "${spec}" from ${fromFile}`);
}

const importCache = new Map<string, { local: string[]; node: string[] }>();

function moduleImports(file: string): { local: string[]; node: string[] } {
  const cached = importCache.get(file);
  if (cached) return cached;
  const local: string[] = [];
  const node: string[] = [];
  for (const spec of runtimeSpecifiers(readFileSync(file, "utf8"))) {
    const resolved = resolveSpecifier(file, spec);
    if (resolved.kind === "node") node.push(resolved.spec);
    else if (resolved.kind === "local") local.push(resolved.file);
  }
  const result = { local, node };
  importCache.set(file, result);
  return result;
}

function graphFrom(entry: string): { files: string[]; node: string[] } {
  const files: string[] = [];
  const node: string[] = [];
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    files.push(file);
    const imports = moduleImports(file);
    node.push(...imports.node.map((spec) => `${file} -> ${spec}`));
    queue.push(...imports.local);
  }
  return { files, node };
}

const policyReach = new Map<string, boolean>();

function reachesPolicy(file: string, stack = new Set<string>()): boolean {
  const known = policyReach.get(file);
  if (known != null) return known;
  if (stack.has(file)) return false;
  if (file.endsWith(`/${POLICY}`)) {
    policyReach.set(file, true);
    return true;
  }
  stack.add(file);
  let found = false;
  for (const next of moduleImports(file).local) {
    if (reachesPolicy(next, stack)) {
      found = true;
      break;
    }
  }
  stack.delete(file);
  policyReach.set(file, found);
  return found;
}

const stubRouter = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

function renderButton(
  props: Partial<React.ComponentProps<typeof ProspectRefreshIntelligenceButton>> = {},
): string {
  return renderWithRouter(
    createElement(ProspectRefreshIntelligenceButton, {
      prospectId: "prospect-1",
      initialResearchCopy: en.prospects.initialResearch,
      ...props,
    }),
  );
}

function renderWithRouter(children: ReactNode): string {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: stubRouter },
      createElement(
        DiscussionRegenerationProvider,
        {
          discussionId: null,
          initialSnapshot: emptyRegenerationSnapshot(),
        },
        children,
      ),
    ),
  );
}

function openingTag(html: string, action: string): string {
  const match = html.match(
    new RegExp(`<button\\b[^>]*data-prospect-header-action="${action}"[^>]*>`),
  );
  assert.ok(match, `missing ${action} button`);
  return match[0];
}

function isDisabled(tag: string): boolean {
  return /(?:\s|^)disabled(?:=|"|\s|>)/.test(tag);
}

describe("initial research client boundary", () => {
  it("keeps the progress module free of Node and the server policy", () => {
    const progress = read(PROGRESS);
    const marker = read(MARKER);
    const policy = read(POLICY);
    assert.match(progress, /initialResearchOrchestration/);
    assert.doesNotMatch(progress, /initialResearchPolicy|node:dns|node:net|urlSafety/);
    assert.doesNotMatch(marker, /^\s*import\s/m);
    assert.doesNotMatch(marker, /from\s+["'][^"']+["']|node:|urlSafety/);
    assert.match(policy, /initialResearchOrchestration/);
    assert.doesNotMatch(policy, /function readInitialResearchOrchestration/);
    assert.equal(readSharedOrchestration, readPolicyOrchestration);

    const progressGraph = graphFrom(join(ROOT, PROGRESS));
    assert.deepEqual(progressGraph.node, []);
    assert.equal(
      progressGraph.files.some((file) => file.endsWith(POLICY)),
      false,
    );
    assert.equal(
      progressGraph.files.some((file) => file.includes("urlSafety")),
      false,
    );

    const clientFiles = ["app", "components", "lib"].flatMap((dir) =>
      listSourceFiles(join(ROOT, dir)).filter((file) =>
        isClientModule(readFileSync(file, "utf8")),
      ),
    );
    assert.ok(clientFiles.length > 0);
    const policyImporters = clientFiles.filter((file) => reachesPolicy(file));
    assert.deepEqual(policyImporters, []);
  });

  it("parses the orchestration marker exactly once", () => {
    const cases: Array<{
      progress: Record<string, unknown> | null;
      expected: ReturnType<typeof readSharedOrchestration>;
    }> = [
      { progress: null, expected: null },
      { progress: {}, expected: null },
      {
        progress: { orchestration: { role: "manual" } },
        expected: null,
      },
      {
        progress: { orchestration: ["initial_research"] },
        expected: null,
      },
      {
        progress: buildInitialResearchProgress(),
        expected: {
          role: "initial_research",
          fallback: "idle",
          failureCode: null,
          failureMessage: null,
          fallbackAttempts: 0,
        },
      },
      {
        progress: {
          orchestration: {
            role: "initial_research",
            fallback: "pending",
            failureCode: "  ",
            failureMessage: "Website unavailable",
            fallbackAttempts: 2,
          },
        },
        expected: {
          role: "initial_research",
          fallback: "pending",
          failureCode: null,
          failureMessage: "Website unavailable",
          fallbackAttempts: 2,
        },
      },
      {
        progress: {
          orchestration: {
            role: "initial_research",
            fallback: "unknown",
            failureCode: "NO_PAGES",
            fallbackAttempts: -3,
          },
        },
        expected: {
          role: "initial_research",
          fallback: "idle",
          failureCode: "NO_PAGES",
          failureMessage: null,
          fallbackAttempts: 0,
        },
      },
    ];

    for (const entry of cases) {
      assert.deepEqual(readSharedOrchestration(entry.progress), entry.expected);
      assert.deepEqual(readPolicyOrchestration(entry.progress), entry.expected);
    }
  });

  it("still presents Identity and Prospect initial research", () => {
    const job = {
      id: "job-1",
      status: "processing",
      current_stage: "crawling",
      progress: buildInitialResearchProgress(),
      promoted_at: null,
      follow_on_generation_job_id: null,
      error_metadata: null,
      updated_at: "2026-10-18T10:00:00.000Z",
    };
    const research = serializeInitialResearchStatus(job);
    assert.equal(research.applies, true);
    assert.equal(research.fallback, "idle");

    const identity = describeIdentityInitialResearch({
      brainStatus: "processing",
      research,
      labels: en.identity.brainStatusValues,
      copy: en.identity.initialResearch,
    });
    assert.equal(identity.view.kind, "researching");
    assert.equal(identity.label, "Researching your website");
    assert.equal(identity.notice, null);

    const prospect = describeProspectInitialResearch({
      displayStatus: "Queued",
      hasCurrentVersion: false,
      research,
      generation: null,
      existingLabel: "Athena is starting",
      failedLabel: "Intelligence failed",
      copy: en.prospects.initialResearch,
    });
    assert.equal(prospect.view.kind, "researching");
    assert.equal(prospect.label, "Researching website");
    assert.equal(prospect.notice, null);

    const generating = presentProspectInitialResearch({
      displayStatus: "Queued",
      hasCurrentVersion: false,
      research: { ...research, status: "awaiting_follow_on", promoted: true },
      generation: { status: "processing", inFlight: true, evidenceFree: false },
    });
    assert.equal(generating.kind, "generating");

    const evidenceFree = presentProspectInitialResearch({
      displayStatus: "Queued",
      hasCurrentVersion: false,
      research: { ...research, researchFailed: true, fallback: "pending" },
      generation: { status: "queued", inFlight: true, evidenceFree: true },
    });
    assert.equal(evidenceFree.kind, "evidence_free_generating");

    const manual = serializeInitialResearchStatus({
      ...job,
      id: "job-2",
      progress: { pagesCrawled: 2 },
    });
    assert.equal(manual.applies, false);
    assert.equal(
      presentIdentityInitialResearch({
        brainStatus: "ready",
        research: manual,
      }).kind,
      "brain_status",
    );
    assert.equal(
      presentProspectInitialResearch({
        displayStatus: "Ready",
        hasCurrentVersion: true,
        research: manual,
        generation: null,
      }).kind,
      "existing",
    );
    assert.deepEqual(emptyInitialResearchStatus().applies, false);
  });
});

describe("prospect generate during initial research", () => {
  const active: ProspectProgressKind[] = [
    "researching",
    "generating",
    "evidence_free_generating",
  ];
  const open: Array<ProspectProgressKind | null> = [
    "existing",
    "ready",
    "failed",
    null,
  ];

  it("disables Generate for the three active views without calling it an error", () => {
    for (const kind of active) {
      const hold = describeProspectGenerateHold({
        kind,
        copy: en.prospects.initialResearch,
      });
      assert.equal(prospectGenerateHeldForInitialResearch(kind), true);
      assert.equal(hold.held, true);
      assert.equal(hold.impliesError, false);
      assert.equal(
        hold.label,
        kind === "researching"
          ? "Researching website"
          : "Generating Intelligence",
      );
      assert.doesNotMatch(hold.label, /fail|error|try again/i);

      const html = renderButton({ initialResearchKind: kind });
      const tag = openingTag(html, "generate");
      assert.equal(isDisabled(tag), true);
      assert.match(tag, /aria-busy="true"/);
      assert.match(html, new RegExp(hold.label));
      assert.doesNotMatch(html, /text-red-300|Processing Failed|Try generating again/);
    }

    const french = renderWithRouter(
      createElement(ProspectRefreshIntelligenceButton, {
        prospectId: "prospect-1",
        initialResearchKind: "researching",
        initialResearchCopy: fr.prospects.initialResearch,
      }),
    );
    assert.match(french, /Recherche du site/);
    assert.doesNotMatch(french, /Researching website|text-red-300/);
  });

  it("leaves Generate available when initial research is terminal or absent", () => {
    for (const kind of open) {
      assert.equal(prospectGenerateHeldForInitialResearch(kind), false);
      const hold = describeProspectGenerateHold({
        kind,
        copy: en.prospects.initialResearch,
      });
      assert.equal(hold.held, false);
      assert.equal(hold.impliesError, false);
    }

    const absent = renderButton();
    const generate = openingTag(absent, "generate");
    assert.equal(isDisabled(generate), false);
    assert.match(absent, /Generate prospect intelligence/);
    assert.doesNotMatch(generate, /aria-busy/);

    const ready = renderButton({
      hasCurrentVersion: true,
      intelligenceStatus: "Ready",
      initialResearchKind: "ready",
    });
    const refresh = openingTag(ready, "refresh");
    assert.equal(isDisabled(refresh), false);
    assert.match(ready, /Refresh intelligence/);

    const failed = renderButton({
      intelligenceStatus: "Processing Failed",
      initialResearchKind: "failed",
    });
    const retry = openingTag(failed, "generate");
    assert.equal(isDisabled(retry), false);
    assert.match(failed, /Try generating again/);
  });

  it("keeps Free visibility, refresh coalescing, and manual website research", () => {
    const hidden = renderButton({
      showGenerate: false,
      initialResearchKind: "researching",
    });
    assert.doesNotMatch(hidden, /data-prospect-header-action="generate"/);
    assert.doesNotMatch(hidden, /data-prospect-header-action="refresh"/);

    const page = read("app/prospects/[id]/page.tsx");
    const refreshButton = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    const manual = read("components/prospects/ProspectDeepScrapeWebsiteButton.tsx");
    const refreshRoute = read("app/api/prospects/[id]/refresh/route.ts");

    assert.match(page, /shouldShowProspectGenerate/);
    assert.match(page, /offerFullIntelligence && showGenerate/);
    assert.match(page, /showGenerate=\{showGenerate\}/);
    assert.match(page, /initialResearchKind=\{initialResearchPresentation\.view\.kind\}/);
    assert.match(page, /intelligenceStatus=\{intelligenceReadiness\}/);
    assert.match(
      page,
      /showDeepScrape && hasCurrentVersion && Boolean\(prospect\.website\)/,
    );
    assert.match(
      page,
      /initiallyAvailable=\{hasCurrentVersion && Boolean\(prospect\.website\)\}/,
    );
    assert.match(refreshButton, /\/api\/prospects\/\$\{prospectId\}\/refresh/);
    assert.match(refreshButton, /if \(queueingKind \|\| isGenerating\) return/);
    assert.match(refreshButton, /disabled=\{busy\}/);
    assert.doesNotMatch(manual, /initialResearch|describeProspectGenerateHold/);
    assert.match(manual, /method: "POST"/);
    assert.match(manual, /if \(!available\) return/);
    assert.match(refreshRoute, /assertCurrentFreeConvertGeneration/);
    assert.match(refreshRoute, /enqueueFreeConvertProspectGeneration/);
    assert.match(refreshRoute, /ensureProspectGenerationQueued/);
    assert.match(refreshRoute, /triggerType: "manual_refresh"/);
  });
});

describe("initial research six-language catalog parity", () => {
  const identityKeys = Object.keys(en.identity.initialResearch).sort();
  const prospectKeys = Object.keys(en.prospects.initialResearch).sort();

  it("keeps the same initial-research keys in every catalog", () => {
    assert.deepEqual(identityKeys, [
      "compilationFailed",
      "researchContinuing",
      "researchFailedReady",
      "researching",
      "retry",
      "terminalFailed",
      "training",
    ]);
    assert.deepEqual(prospectKeys, [
      "generating",
      "researching",
      "usingAvailableInformation",
    ]);
    for (const messages of Object.values(DICTIONARIES)) {
      assert.deepEqual(
        Object.keys(messages.identity.initialResearch).sort(),
        identityKeys,
      );
      assert.deepEqual(
        Object.keys(messages.prospects.initialResearch).sort(),
        prospectKeys,
      );
      for (const key of prospectKeys) {
        const text =
          messages.prospects.initialResearch[
            key as keyof typeof en.prospects.initialResearch
          ];
        assert.equal(typeof text, "string");
        assert.ok(text.trim().length > 0);
        const hold = describeProspectGenerateHold({
          kind: key === "researching" ? "researching" : "generating",
          copy: messages.prospects.initialResearch,
        });
        if (key !== "usingAvailableInformation") {
          assert.equal(hold.impliesError, false);
          assert.equal(hold.label, text);
        }
      }
    }
  });
});

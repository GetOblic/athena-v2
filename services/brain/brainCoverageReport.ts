import {
  BRAIN_COVERAGE_MATRIX,
  BRAIN_COVERAGE_AUDIT_VERSION,
  BRAIN_COVERAGE_BEFORE_AUDIT_PERCENT,
  calculateBrainCoveragePercent,
  listGenerationCoverageWorkflows,
  listMvpDeferredFields,
  listUnusedStoredIntelligence,
  type BrainCoverageEntry,
} from "@/services/brain/brainCoverageMatrix";

export const BRAIN_COVERAGE_AFTER_SPRINT_13_PERCENT = 96;

export type BrainCoverageCategoryReport = {
  category: string;
  coveragePercent: number;
  totalFields: number;
  consumedFields: number;
  mvpDeferredFields: number;
  remainingExclusions: string[];
};

export type BrainCoverageFinalReport = {
  version: string;
  coverageBeforePercent: number;
  coverageAfterSprint13Percent: number;
  coverageAfterPercent: number;
  categories: BrainCoverageCategoryReport[];
  mvpDeferred: BrainCoverageEntry[];
  storedOnlyDocumented: BrainCoverageEntry[];
  generationWorkflows: string[];
  performanceSafeguards: string[];
  organizationIsolation: string[];
};

function categoryCoverage(entries: BrainCoverageEntry[]): BrainCoverageCategoryReport {
  const category = entries[0]?.category ?? "Unknown";
  const applicable = entries.filter((entry) => entry.status !== "mvp_deferred");
  const consumed = applicable.filter((entry) => entry.status === "consumed").length;
  const mvpDeferred = entries.filter((entry) => entry.status === "mvp_deferred").length;

  return {
    category,
    coveragePercent:
      applicable.length > 0 ? Math.round((consumed / applicable.length) * 100) : 100,
    totalFields: entries.length,
    consumedFields: consumed,
    mvpDeferredFields: mvpDeferred,
    remainingExclusions: entries
      .filter((entry) => entry.status === "mvp_deferred")
      .map((entry) => entry.input),
  };
}

export function buildBrainCoverageFinalReport(): BrainCoverageFinalReport {
  const categories = [...new Set(BRAIN_COVERAGE_MATRIX.map((entry) => entry.category))].map(
    (category) =>
      categoryCoverage(
        BRAIN_COVERAGE_MATRIX.filter((entry) => entry.category === category),
      ),
  );

  return {
    version: BRAIN_COVERAGE_AUDIT_VERSION,
    coverageBeforePercent: BRAIN_COVERAGE_BEFORE_AUDIT_PERCENT,
    coverageAfterSprint13Percent: BRAIN_COVERAGE_AFTER_SPRINT_13_PERCENT,
    coverageAfterPercent: calculateBrainCoveragePercent(),
    categories,
    mvpDeferred: listMvpDeferredFields(),
    storedOnlyDocumented: listUnusedStoredIntelligence(),
    generationWorkflows: listGenerationCoverageWorkflows(),
    performanceSafeguards: [
      "Single resolveStoredHomepageLearning source — no duplicate homepage fetch in Brain pipeline",
      "Executive Strategy built once per understanding bundle and reused across workflows",
      "Executive Marketing Strategy deterministic — no additional AI calls",
      "Generation bundle cached for 30s; understanding bundle cached for 30s",
      "No additional database queries introduced in Sprint 14 completion",
    ],
    organizationIsolation: [
      "Strategy fingerprints include organizationId",
      "Brain context scoped by organizationId on all queries",
      "Generation contracts assert organization match",
      "Tenant scope enforced on identity and knowledge operations",
    ],
  };
}

export function formatBrainCoverageFinalReport(
  report: BrainCoverageFinalReport = buildBrainCoverageFinalReport(),
): string {
  const lines = [
    "ATHENA BRAIN COVERAGE — MVP COMPLETION REPORT",
    "",
    `Version: ${report.version}`,
    `Coverage before Sprint 13 audit: ${report.coverageBeforePercent}%`,
    `Coverage after Sprint 13 audit: ${report.coverageAfterSprint13Percent}%`,
    `Coverage after Sprint 14 completion: ${report.coverageAfterPercent}%`,
    "",
    "CATEGORIES:",
    ...report.categories.map(
      (category) =>
        `- ${category.category}: ${category.coveragePercent}% (${category.consumedFields}/${category.totalFields - category.mvpDeferredFields} applicable consumed)`,
    ),
    "",
    "MVP DEFERRED:",
    ...report.mvpDeferred.map(
      (entry) => `- ${entry.input}: ${entry.notes ?? "Intentionally excluded from MVP."}`,
    ),
    "",
    "GENERATION WORKFLOWS:",
    ...report.generationWorkflows.map((workflow) => `- ${workflow}`),
    "",
    "PERFORMANCE SAFEGUARDS:",
    ...report.performanceSafeguards.map((item) => `- ${item}`),
    "",
    "ORGANIZATION ISOLATION:",
    ...report.organizationIsolation.map((item) => `- ${item}`),
  ];

  return lines.join("\n");
}

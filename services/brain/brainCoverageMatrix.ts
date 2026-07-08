export type BrainCoverageStatus =
  | "consumed"
  | "partial"
  | "stored"
  | "ignored"
  | "mvp_deferred";

export type BrainCoverageLayer =
  | "brain_context"
  | "executive_memory"
  | "executive_learning"
  | "executive_understanding"
  | "executive_strategy"
  | "executive_marketing_strategy"
  | "generation_contracts"
  | "generation_outputs";

export type BrainCoverageEntry = {
  input: string;
  category: string;
  captured: boolean;
  stored: boolean;
  learned: boolean;
  status: BrainCoverageStatus;
  layers: BrainCoverageLayer[];
  influencesReasoning: boolean;
  influencesMarketingStrategy: boolean;
  influencesGeneration: boolean;
  influencesFutureLearning: boolean;
  notes?: string;
};

export const BRAIN_COVERAGE_AUDIT_VERSION = "brain_coverage_audit_v1";

export const BRAIN_COVERAGE_BEFORE_AUDIT_PERCENT = 72;

export const BRAIN_COVERAGE_MATRIX: BrainCoverageEntry[] = [
  {
    input: "Business Name (greeting_name)",
    category: "Athena Brain Profile",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["brain_context", "executive_understanding", "generation_contracts"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
  },
  {
    input: "Business Description (about_you)",
    category: "Athena Brain Profile",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_understanding",
      "executive_strategy",
      "generation_contracts",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: false,
  },
  {
    input: "Website URL",
    category: "Athena Brain Profile",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["brain_context", "executive_understanding", "generation_contracts"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
  },
  {
    input: "Homepage Knowledge",
    category: "Athena Brain Profile",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_understanding",
      "executive_strategy",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes: "Stored on identity compile; consumed via homepage_learning and synthesized profile fields.",
  },
  {
    input: "Business Knowledge (expertise)",
    category: "Athena Brain Profile",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_understanding",
      "executive_strategy",
      "generation_contracts",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: false,
  },
  {
    input: "Master Identity Profile (voice, persona, rules)",
    category: "Athena Brain Profile",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_understanding",
      "generation_contracts",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes: "Nested profile fields extracted via masterProfileHelpers.",
  },
  {
    input: "Knowledge Base assets",
    category: "Knowledge Base",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_understanding",
      "generation_contracts",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: true,
  },
  {
    input: "Intelligence Domains",
    category: "Intelligence Domains",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_learning",
      "executive_understanding",
      "executive_strategy",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
    notes: "Domain terminology and competitors now populated from intelligence raw_json.",
  },
  {
    input: "Discussion content and metadata",
    category: "Discussions",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_learning",
      "executive_understanding",
      "executive_strategy",
      "generation_outputs",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
  },
  {
    input: "Discussion updates (thread)",
    category: "Discussions",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_learning",
      "executive_understanding",
      "generation_outputs",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: true,
  },
  {
    input: "Discussion priority",
    category: "Discussions",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["brain_context", "executive_understanding"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "Now included in discussion memory and priority rationale.",
  },
  {
    input: "Discussion status",
    category: "Discussions",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: ["brain_context", "executive_learning", "executive_understanding"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: true,
  },
  {
    input: "Discussion tags",
    category: "Discussions",
    captured: false,
    stored: false,
    learned: false,
    status: "mvp_deferred",
    layers: [],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "No discussion tag schema in MVP.",
  },
  {
    input: "Briefing approvals",
    category: "Executive decisions",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_learning",
      "executive_understanding",
      "executive_strategy",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
    notes: "Approval also creates knowledge assets reactively.",
  },
  {
    input: "Briefing revisions / rejections",
    category: "Executive decisions",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: ["brain_context", "executive_learning", "executive_strategy"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: true,
  },
  {
    input: "Opportunity status progression",
    category: "Executive decisions",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_learning",
      "executive_understanding",
      "executive_strategy",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: false,
    influencesFutureLearning: true,
  },
  {
    input: "Refresh activity (updates, re-analysis, blueprint regen)",
    category: "Refresh behaviour",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "executive_learning",
      "executive_strategy",
      "executive_marketing_strategy",
      "generation_outputs",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
    notes: "refreshLearning now influences risk and direction; marketing refresh preserves strategy.",
  },
  {
    input: "Strategic Blueprint approvals",
    category: "Executive decisions",
    captured: false,
    stored: false,
    learned: false,
    status: "mvp_deferred",
    layers: ["generation_outputs"],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes: "Blueprint status defaults to ready; no approval workflow in MVP.",
  },
  {
    input: "Identity documents upload",
    category: "Knowledge Base",
    captured: true,
    stored: true,
    learned: false,
    status: "mvp_deferred",
    layers: [],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "Schema exists; Brain ingestion not wired in MVP.",
  },
  {
    input: "Domain group URL / member count",
    category: "Intelligence Domains",
    captured: true,
    stored: true,
    learned: false,
    status: "stored",
    layers: ["brain_context"],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "Stored on community record; not required for executive judgment in MVP.",
  },
];

export function calculateBrainCoveragePercent(
  matrix: BrainCoverageEntry[] = BRAIN_COVERAGE_MATRIX,
): number {
  const applicable = matrix.filter((entry) => entry.status !== "mvp_deferred");
  if (applicable.length === 0) {
    return 100;
  }

  const score = applicable.reduce((total, entry) => {
    if (entry.status === "consumed") {
      return total + 1;
    }
    if (entry.status === "partial") {
      return total + 0.5;
    }
    if (entry.status === "stored") {
      return total + 0.25;
    }
    return total;
  }, 0);

  return Math.round((score / applicable.length) * 100);
}

export function listUnusedStoredIntelligence(
  matrix: BrainCoverageEntry[] = BRAIN_COVERAGE_MATRIX,
): BrainCoverageEntry[] {
  return matrix.filter(
    (entry) =>
      entry.stored &&
      (entry.status === "stored" || entry.status === "ignored") &&
      entry.notes,
  );
}

export function listGenerationCoverageWorkflows(): string[] {
  return [
    "discussion_analysis",
    "executive_briefing",
    "strategic_blueprint",
    "deployment_asset",
  ];
}

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

export const BRAIN_COVERAGE_AUDIT_VERSION = "brain_coverage_audit_v2_mvp_complete";

export const BRAIN_COVERAGE_BEFORE_AUDIT_PERCENT = 72;

export const BRAIN_COVERAGE_MATRIX: BrainCoverageEntry[] = [
  {
    input: "Business Name (greeting_name)",
    category: "Brain Inputs",
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
    category: "Brain Inputs",
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
    category: "Brain Inputs",
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
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_memory",
      "executive_understanding",
      "executive_strategy",
      "executive_marketing_strategy",
      "generation_outputs",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes:
      "Single source: resolveStoredHomepageLearning from master_profile.homepage_learning (set at identity compile).",
  },
  {
    input: "Business Knowledge (expertise)",
    category: "Brain Inputs",
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
    category: "Brain Inputs",
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
    category: "Brain Inputs",
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
    input: "Knowledge asset rating",
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["brain_context", "executive_understanding"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes: "High-rated assets prioritized in knowledge memory ordering and supporting evidence.",
  },
  {
    input: "Intelligence Domains",
    category: "Brain Inputs",
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
  },
  {
    input: "Domain member count",
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["brain_context", "executive_understanding"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "Contributes to domain maturity assessment in executive reasoning.",
  },
  {
    input: "Domain group URL",
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "mvp_deferred",
    layers: [],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "MVP Deferred: navigation/display field only — not an executive judgment signal.",
  },
  {
    input: "Discussion content and metadata",
    category: "Brain Inputs",
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
    input: "Discussion ai_notes",
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["executive_understanding", "generation_outputs"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes: "Included in supporting evidence when present on focus discussion.",
  },
  {
    input: "Discussion updates (thread)",
    category: "Learning",
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
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["brain_context", "executive_understanding"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
  },
  {
    input: "Discussion status",
    category: "Learning",
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
    category: "Brain Inputs",
    captured: false,
    stored: false,
    learned: false,
    status: "mvp_deferred",
    layers: [],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "MVP Deferred: no discussion tag schema exists.",
  },
  {
    input: "Briefing approvals",
    category: "Learning",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_learning",
      "executive_understanding",
      "executive_strategy",
      "executive_marketing_strategy",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
    notes: "Approval creates knowledge assets reactively.",
  },
  {
    input: "Briefing revisions / rejections",
    category: "Learning",
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
    input: "Briefing operator notes",
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: ["executive_understanding", "generation_outputs"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes: "Included in supporting evidence when present on linked briefing.",
  },
  {
    input: "Briefing approved_by",
    category: "Brain Inputs",
    captured: false,
    stored: false,
    learned: false,
    status: "mvp_deferred",
    layers: [],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "MVP Deferred: audit field typed but not populated until CRM integration.",
  },
  {
    input: "Opportunity status progression",
    category: "Learning",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "brain_context",
      "executive_learning",
      "executive_understanding",
      "executive_strategy",
      "executive_marketing_strategy",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: false,
    influencesFutureLearning: true,
  },
  {
    input: "Refresh activity",
    category: "Learning",
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
  },
  {
    input: "Strategic Blueprint approvals",
    category: "Outputs",
    captured: false,
    stored: false,
    learned: false,
    status: "mvp_deferred",
    layers: ["generation_outputs"],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: true,
    influencesFutureLearning: false,
    notes: "MVP Deferred: blueprint status defaults to ready; no approval workflow.",
  },
  {
    input: "Identity documents upload",
    category: "Brain Inputs",
    captured: true,
    stored: true,
    learned: false,
    status: "mvp_deferred",
    layers: [],
    influencesReasoning: false,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "MVP Deferred: schema exists; document ingestion deferred until upload UI ships.",
  },
  {
    input: "Dashboard metrics / scores",
    category: "Outputs",
    captured: true,
    stored: false,
    learned: false,
    status: "consumed",
    layers: ["brain_context", "executive_understanding"],
    influencesReasoning: true,
    influencesMarketingStrategy: false,
    influencesGeneration: false,
    influencesFutureLearning: false,
    notes: "Operational memory feeds priority assessment; not LLM-generated.",
  },
  {
    input: "Discussion Analysis output",
    category: "Outputs",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "executive_understanding",
      "executive_strategy",
      "executive_marketing_strategy",
      "generation_contracts",
      "generation_outputs",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
  },
  {
    input: "Executive Briefing output",
    category: "Outputs",
    captured: true,
    stored: true,
    learned: true,
    status: "consumed",
    layers: [
      "executive_understanding",
      "executive_strategy",
      "generation_contracts",
      "generation_outputs",
    ],
    influencesReasoning: true,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
  },
  {
    input: "Strategic Asset Blueprint output",
    category: "Outputs",
    captured: true,
    stored: true,
    learned: false,
    status: "consumed",
    layers: [
      "executive_marketing_strategy",
      "generation_contracts",
      "generation_outputs",
    ],
    influencesReasoning: false,
    influencesMarketingStrategy: true,
    influencesGeneration: true,
    influencesFutureLearning: true,
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

export function listMvpDeferredFields(
  matrix: BrainCoverageEntry[] = BRAIN_COVERAGE_MATRIX,
): BrainCoverageEntry[] {
  return matrix.filter((entry) => entry.status === "mvp_deferred");
}

export function listUnusedStoredIntelligence(
  matrix: BrainCoverageEntry[] = BRAIN_COVERAGE_MATRIX,
): BrainCoverageEntry[] {
  return matrix.filter(
    (entry) => entry.status === "mvp_deferred" && entry.stored && entry.notes,
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

export function assertNoBrainBypassInGenerationAssembly(source: string): boolean {
  return (
    source.includes("assembleExecutiveGenerationContextBlock") &&
    source.includes("executiveStrategy") &&
    !source.includes("LEGACY_PRODUCTION_SPECS_PROMPT")
  );
}

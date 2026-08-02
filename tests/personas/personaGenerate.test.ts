import "./personaTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  formatPersonaPortfolioForCoveragePlanner,
  parsePersonaPortfolioCoveragePlan,
  type PersonaPortfolioCoveragePlan,
} from "../../lib/personas/coveragePlanner";
import { buildPersonaCoveragePlannerPrompt } from "../../services/ai/prompts/personaCoveragePlannerPrompt";
import { buildPersonaGenerationPrompt } from "../../services/ai/prompts/personaGenerationPrompt";
import {
  blankGeneratedCandidateReferenceWebsite,
  dimensionMeaningfullyDiffers,
  evaluatePersonaNovelty,
  formatBrainContextForPersonaGeneration,
  formatExistingPersonasBlock,
  generatePersonaCandidate,
  isSubstantiveDimensionText,
  MIN_STRATEGIC_DIMENSION_DIFFERENCES,
  normalizeComparableText,
  normalizePersonaGenerationInstruction,
  PERSONA_GENERATION_EXISTING_PERSONA_LIMIT,
  PERSONA_GENERATION_INSTRUCTION_MAX_LENGTH,
  parsePersonaGenerationCandidate,
  PersonaGenerationError,
  selectExistingPersonasForGeneration,
  summarizeExistingPersonasForGeneration,
  validatePersonaGenerationCandidate,
} from "../../services/personas/personaGeneration";
import { personaCandidateToFormState } from "../../components/personas/personaFormFields";
import type { Persona } from "../../services/personas/personaService";
import type { BrainEngineContext } from "../../services/brain/brainContextTypes";

const STUB_COVERAGE_PLAN: PersonaPortfolioCoveragePlan = {
  planningSummary:
    "Strong executive coverage; limited operational buyer representation.",
  generationGuidance:
    "Generate an operational buyer such as an Operations Manager who evaluates day-to-day clinic workflow tools.",
  explanation:
    "This Persona was generated because the organization currently has strong executive coverage but very limited operational buyer representation.",
  promptVersion: "persona_coverage_planner_v1",
};

async function stubPlanCoverage(): Promise<PersonaPortfolioCoveragePlan> {
  return STUB_COVERAGE_PLAN;
}

const ROOT = join(process.cwd());
const ORG = "11111111-1111-1111-1111-111111111111";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function makePersona(partial: Partial<Persona> & { id: string }): Persona {
  return {
    id: partial.id,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00.000Z",
    organization_id: partial.organization_id ?? ORG,
    user_id: partial.user_id ?? null,
    community_id: partial.community_id ?? null,
    linked_discussion_id: partial.linked_discussion_id ?? null,
    persona_name: partial.persona_name ?? null,
    short_description: partial.short_description ?? null,
    category: partial.category ?? null,
    gender_identity: partial.gender_identity ?? null,
    age_range: partial.age_range ?? null,
    birth_year_approx: partial.birth_year_approx ?? null,
    generation: partial.generation ?? null,
    cultural_background: partial.cultural_background ?? null,
    country: partial.country ?? null,
    state: partial.state ?? null,
    city: partial.city ?? null,
    location_summary: partial.location_summary ?? null,
    languages: partial.languages ?? null,
    relationship_status: partial.relationship_status ?? null,
    household: partial.household ?? null,
    income_range: partial.income_range ?? null,
    purchasing_power: partial.purchasing_power ?? null,
    education: partial.education ?? null,
    occupation: partial.occupation ?? null,
    seniority: partial.seniority ?? null,
    industry_context: partial.industry_context ?? null,
    lifestyle: partial.lifestyle ?? null,
    interests: partial.interests ?? null,
    digital_behavior: partial.digital_behavior ?? null,
    brands_influences: partial.brands_influences ?? null,
    values_text: partial.values_text ?? null,
    aesthetic_preferences: partial.aesthetic_preferences ?? null,
    preferred_imagery: partial.preferred_imagery ?? null,
    goals: partial.goals ?? null,
    needs: partial.needs ?? null,
    pain_points: partial.pain_points ?? null,
    fears: partial.fears ?? null,
    motivations: partial.motivations ?? null,
    objections: partial.objections ?? null,
    buying_triggers: partial.buying_triggers ?? null,
    decision_criteria: partial.decision_criteria ?? null,
    purchase_behavior: partial.purchase_behavior ?? null,
    typical_concerns: partial.typical_concerns ?? null,
    communication_style: partial.communication_style ?? null,
    preferred_channels: partial.preferred_channels ?? null,
    reference_website: partial.reference_website ?? null,
    notes: partial.notes ?? null,
    additional_context: partial.additional_context ?? null,
    ads_content: partial.ads_content ?? null,
    source: partial.source ?? "manual",
    status: partial.status ?? "Queued",
    lifecycle_status: partial.lifecycle_status ?? "New",
    opportunity_score: partial.opportunity_score ?? null,
    priority: partial.priority ?? 1,
    profile_json: partial.profile_json ?? null,
    raw_json: partial.raw_json ?? null,
    reference_website_intelligence:
      partial.reference_website_intelligence ?? null,
    last_activity: partial.last_activity ?? null,
    import_batch_id: partial.import_batch_id ?? null,
    last_deep_scrape_at: partial.last_deep_scrape_at ?? null,
    last_deep_scrape_pages: partial.last_deep_scrape_pages ?? null,
  };
}

function makeBrain(): BrainEngineContext {
  return {
    organization: { id: ORG, name: "Acme", slug: "acme" },
    scope: "organization",
    identity: {
      identity: {
        userId: "user-1",
        greetingName: "Laurent",
        aboutYou: "Aesthetic clinic growth advisor",
        expertise: "Clinic marketing",
        website: "https://example.com",
        brainStatus: "trained",
        masterProfile: { positioning: "premium clinic growth" },
        masterProfileVersion: "1",
        homepageLearning: null,
      },
      missingFields: [],
      isBrainTrained: true,
      completenessScore: 80,
    },
    businessMemory: {
      identity: {
        userId: "user-1",
        greetingName: "Laurent",
        aboutYou: "Aesthetic clinic growth advisor",
        expertise: "Clinic marketing",
        website: "https://example.com",
        brainStatus: "trained",
        masterProfile: { positioning: "premium clinic growth" },
        masterProfileVersion: "1",
        homepageLearning: null,
      },
      missingFields: [],
      isBrainTrained: true,
      completenessScore: 80,
    },
    domainMemory: {
      domains: [],
      totalDomains: 0,
      activeDomainCount: 0,
      focusDomainId: null,
    },
    discussionMemory: {
      recentDiscussions: [],
      recentAnalyzedDiscussions: [],
      highIntentDiscussions: [],
      monitoringDiscussions: [],
      recurringThemes: [],
      lifecycleDistribution: {},
      focus: null,
    },
    opportunityMemory: {
      recentOpportunities: [],
      highestScoring: null,
      queues: {
        immediateAction: [],
        highIntent: [],
        monitor: [],
        lowPriority: [],
      },
      statusDistribution: {},
      focus: null,
    },
    briefingMemory: {
      recentBriefings: [],
      approvedBriefings: [],
      needsRevisionBriefings: [],
      rejectedBriefings: [],
      draftBriefings: [],
      statusDistribution: {},
      buyerStageDistribution: {},
      focus: null,
    },
    assetMemory: {
      recentBlueprints: [],
      focusBlueprint: null,
      assetTypes: [],
      businessGoals: ["Grow premium consults"],
      targetAudiences: ["Clinic owners"],
      averageEstimatedReuse: null,
      deploymentAssetFields: {
        source: null,
        suggestedCta: null,
        recommendedResponse: null,
        cta: null,
        parsedAssetCount: 0,
      },
    },
    knowledgeMemory: {
      assets: [
        {
          id: "k1",
          title: "Premium consult playbook",
          category: "strategy",
          assetType: "note",
          summary: "How premium clinics convert consults",
          communityId: null,
          sourceType: null,
          sourceId: null,
          rating: 5,
          timesUsed: 1,
          tags: ["premium"],
        },
      ],
      approvedBriefingKnowledgeCount: 0,
      communityIntelligence: [],
      productionIntelligence: [],
      knowledgeConfidence: 70,
      knowledgeConfidenceDelta: null,
    },
    feedbackSignals: {
      briefingStatuses: {
        draft: 0,
        approved: 0,
        needsRevision: 0,
        rejected: 0,
      },
      opportunitySalesStatuses: {},
      discussionLifecycleStatuses: {},
      approvalCount: 0,
      revisionRequestCount: 0,
      hasGeneratedAssets: false,
      missingAssetPrompts: 0,
      staleDiscussionCount: 0,
      deploymentReadinessDistribution: {},
      focusSignals: {
        briefingStatus: null,
        opportunityStatus: null,
        discussionStatus: null,
        hasLinkedBlueprint: false,
        hasDeploymentAssets: false,
      },
    },
    contextSummary: {
      scope: "organization",
      totalDomains: 0,
      totalDiscussionsConsidered: 0,
      totalOpportunitiesConsidered: 0,
      totalBriefingsConsidered: 0,
      totalKnowledgeAssetsConsidered: 1,
      highestOpportunityScore: null,
      pendingBriefingCount: 0,
      approvedBriefingCount: 0,
      needsRevisionCount: 0,
      missingBrainSetupFields: [],
      warnings: [],
    },
    builtAt: "2026-08-02T00:00:00.000Z",
  };
}

const baseExisting = makePersona({
  id: "p1",
  persona_name: "Growth-Minded Clinic Owner",
  category: "Buyer",
  occupation: "Clinic Owner",
  seniority: "Owner",
  industry_context: "Medical aesthetics",
  short_description: "Owner seeking steady patient growth",
  country: "United States",
  state: "Texas",
  city: "Austin",
  location_summary: "Austin metro aesthetic clinics",
  goals: "Increase consult bookings",
  needs: "Reliable patient pipeline",
  motivations: "Scale without burnout",
  pain_points: "Inconsistent lead quality",
  fears: "Wasting ad spend",
  objections: "Agencies overpromise",
  buying_triggers: "Seeing peers grow",
  decision_criteria: "Proof and clarity",
  purchase_behavior: "Compares providers carefully",
  lifestyle: "Busy operator",
  additional_context: "Prefers practical guidance over hype",
});

const distinctCandidate = {
  persona_name: "Skeptical Operations Director",
  category: "Evaluator",
  occupation: "Operations Director",
  seniority: "Director",
  industry_context: "Multi-location aesthetics groups",
  short_description: "Ops leader who blocks weak vendor pitches",
  country: "United States",
  state: "California",
  city: "Los Angeles",
  location_summary: "Southern California multi-site groups",
  goals: "Standardize intake quality across locations",
  needs: "Operational controls and risk reduction",
  motivations: "Protect brand reputation while scaling",
  pain_points: "Fragmented processes across clinics",
  fears: "Compliance and patient experience failures",
  objections: "Distrusts unproven marketing systems",
  buying_triggers: "Audit findings and board pressure",
  decision_criteria: "Governance, ROI evidence, implementation plan",
  purchase_behavior: "Runs pilot with strict KPIs",
  lifestyle: "Process-driven executive",
  additional_context: "Needs vendor accountability and phased rollout",
};

describe("persona generation — instruction normalization", () => {
  it("accepts empty optional instruction", () => {
    assert.equal(normalizePersonaGenerationInstruction(""), null);
    assert.equal(normalizePersonaGenerationInstruction("   "), null);
    assert.equal(normalizePersonaGenerationInstruction(null), null);
    assert.equal(normalizePersonaGenerationInstruction(undefined), null);
  });

  it("normalizes and length-limits non-empty instruction", () => {
    const normalized = normalizePersonaGenerationInstruction(
      "  Generate a skeptical buyer.  \n\n\nKeep it premium.  ",
    );
    assert.equal(normalized, "Generate a skeptical buyer.\n\nKeep it premium.");

    const long = "x".repeat(PERSONA_GENERATION_INSTRUCTION_MAX_LENGTH + 50);
    const limited = normalizePersonaGenerationInstruction(long);
    assert.ok(limited);
    assert.ok(limited!.length <= PERSONA_GENERATION_INSTRUCTION_MAX_LENGTH);
  });

  it("includes non-empty instruction as guidance in the prompt", () => {
    const prompt = buildPersonaGenerationPrompt({
      brainContextBlock: "{}",
      existingPersonasBlock: "None",
      instruction: "Generate a clinic owner in California.",
    });
    assert.match(prompt, /OPTIONAL USER GUIDANCE \(NOT TRUSTED FACTUAL BUSINESS DATA\)/);
    assert.match(prompt, /Generate a clinic owner in California\./);
  });

  it("works when optional instruction is empty", () => {
    const prompt = buildPersonaGenerationPrompt({
      brainContextBlock: "{}",
      existingPersonasBlock: "None",
      instruction: null,
    });
    assert.match(prompt, /No optional instruction was provided/);
  });
});

describe("persona generation — existing Persona bounding", () => {
  it("bounds existing Persona context", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      makePersona({
        id: `p-${index}`,
        persona_name: `Persona ${index}`,
        occupation: index % 2 === 0 ? "Owner" : null,
        goals: index % 3 === 0 ? "Grow" : null,
        pain_points: index % 5 === 0 ? "Leads" : null,
        additional_context: index < 5 ? "Rich strategic context for ranking" : null,
      }),
    );

    const selected = selectExistingPersonasForGeneration(many);
    assert.ok(selected.length <= PERSONA_GENERATION_EXISTING_PERSONA_LIMIT);

    const summaries = summarizeExistingPersonasForGeneration(many);
    assert.ok(summaries.length <= PERSONA_GENERATION_EXISTING_PERSONA_LIMIT);

    const block = formatExistingPersonasBlock(summaries);
    assert.ok(block.length > 0);
    assert.ok(block.length <= 8_000);
  });
});

describe("persona generation — reference_website blanking", () => {
  it("blanks client website when the model returns https://getoblic.com", async () => {
    const result = await generatePersonaCandidate({
      organizationId: ORG,
      instruction: null,
      deps: {
        requestId: "req-blank-getoblic",
        buildBrain: async () => makeBrain(),
        getPersonas: async () => [],
        planCoverage: stubPlanCoverage,
        generateReview: async () =>
          JSON.stringify({
            ...distinctCandidate,
            reference_website: "https://getoblic.com",
          }),
      },
    });

    assert.equal(result.candidate.reference_website, "");
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.candidate, "reference_website"),
      true,
    );
  });

  it("blanks any other model-supplied URL", async () => {
    const result = await generatePersonaCandidate({
      organizationId: ORG,
      instruction: null,
      deps: {
        requestId: "req-blank-other-url",
        buildBrain: async () => makeBrain(),
        getPersonas: async () => [],
        planCoverage: stubPlanCoverage,
        generateReview: async () =>
          JSON.stringify({
            ...distinctCandidate,
            reference_website: "https://some-other-business.example",
          }),
      },
    });

    assert.equal(result.candidate.reference_website, "");
  });

  it("remains valid when the model omits reference_website", async () => {
    const withoutWebsite = { ...distinctCandidate };
    delete (withoutWebsite as { reference_website?: string }).reference_website;

    const parsed = parsePersonaGenerationCandidate(
      JSON.stringify(withoutWebsite),
    );
    assert.equal(parsed.reference_website, null);

    const result = await generatePersonaCandidate({
      organizationId: ORG,
      instruction: null,
      deps: {
        requestId: "req-omit-website",
        buildBrain: async () => makeBrain(),
        getPersonas: async () => [],
        planCoverage: stubPlanCoverage,
        generateReview: async () => JSON.stringify(withoutWebsite),
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.candidate.reference_website, "");
    assert.equal(result.candidate.persona_name, distinctCandidate.persona_name);
  });

  it("parse and validate always blank reference_website server-side", () => {
    const parsed = parsePersonaGenerationCandidate(
      JSON.stringify({
        ...distinctCandidate,
        reference_website: "https://getoblic.com",
      }),
    );
    assert.equal(parsed.reference_website, null);

    const validated = validatePersonaGenerationCandidate(
      {
        ...distinctCandidate,
        reference_website: "https://example.com/persona",
      },
      ORG,
    );
    assert.equal(validated.reference_website, null);

    const blanked = blankGeneratedCandidateReferenceWebsite({
      persona_name: "Ops",
      reference_website: "https://getoblic.com",
    });
    assert.equal(blanked.reference_website, null);
  });

  it("prompt forbids copying client website into reference_website", () => {
    const prompt = buildPersonaGenerationPrompt({
      brainContextBlock: '{"identity":{"website":"https://getoblic.com"}}',
      existingPersonasBlock: "None",
      instruction: null,
    });
    assert.match(prompt, /Never set reference_website/);
    assert.match(prompt, /Do not copy the client organization's website/);
    assert.match(prompt, /Do not perform web search/);
  });
});

describe("persona generation — structured output and novelty", () => {
  it("parses valid structured output into a review candidate", () => {
    const candidate = parsePersonaGenerationCandidate(
      JSON.stringify(distinctCandidate),
    );
    assert.equal(candidate.persona_name, distinctCandidate.persona_name);
    assert.equal(candidate.occupation, distinctCandidate.occupation);
    const validated = validatePersonaGenerationCandidate(candidate, ORG);
    assert.equal(validated.persona_name, distinctCandidate.persona_name);
  });

  it("rejects blank candidate", () => {
    assert.throws(
      () => validatePersonaGenerationCandidate({}, ORG),
      /BLANK_CANDIDATE/,
    );
  });

  it("handles malformed JSON", () => {
    assert.throws(
      () => parsePersonaGenerationCandidate("not-json {{{"),
      /MALFORMED_JSON/,
    );
  });

  it("strips nested objects and unknown fields from structured output", () => {
    const candidate = parsePersonaGenerationCandidate(
      JSON.stringify({
        persona_name: "Ops Lead",
        goals: "Improve intake quality",
        nested: { evil: true },
        linked_discussion_id: "should-strip",
        organization_id: "should-strip",
        goals_structured: ["a", "b"],
        occupation: { title: "Director" },
      }),
    );
    assert.equal(candidate.persona_name, "Ops Lead");
    assert.equal(candidate.goals, "Improve intake quality");
    assert.equal(candidate.occupation, null);
    assert.equal(
      Object.prototype.hasOwnProperty.call(candidate, "linked_discussion_id"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(candidate, "organization_id"),
      false,
    );
  });

  it("rejects placeholder content", () => {
    assert.throws(
      () =>
        validatePersonaGenerationCandidate(
          {
            persona_name: "TBD",
            goals: "placeholder",
          },
          ORG,
        ),
      /PLACEHOLDER_CONTENT/,
    );
  });

  it("candidate blanks do not count as strategic differences", () => {
    assert.equal(
      dimensionMeaningfullyDiffers(
        "",
        normalizeComparableText(
          "Increase consult bookings | Reliable patient pipeline",
        ),
      ),
      false,
    );
    assert.equal(isSubstantiveDimensionText("dallas"), false);
    assert.equal(isSubstantiveDimensionText("the and of"), false);
  });

  it("existing blank + substantive candidate may count as a gap", () => {
    assert.equal(
      dimensionMeaningfullyDiffers(
        normalizeComparableText(
          "Standardize intake quality across multi-site groups",
        ),
        "",
      ),
      true,
    );
  });

  it("sparse candidate cannot pass three dimensions through omissions", () => {
    const sparse = {
      persona_name: "Almost Empty Persona",
      short_description: "Barely filled",
      // Intentionally omit strategic dimensions that existing Persona has.
      city: "Dallas",
    };
    const novelty = evaluatePersonaNovelty(sparse, [baseExisting]);
    assert.equal(novelty.passes, false);
    assert.ok(
      novelty.maxDifferencesAgainstClosest < MIN_STRATEGIC_DIMENSION_DIFFERENCES,
    );
  });

  it("same archetype with different name and city fails novelty", () => {
    const sameArchetype = {
      persona_name: "Different Display Name",
      category: baseExisting.category,
      occupation: baseExisting.occupation,
      seniority: baseExisting.seniority,
      industry_context: baseExisting.industry_context,
      short_description: baseExisting.short_description,
      country: baseExisting.country,
      state: baseExisting.state,
      city: "Houston",
      location_summary: baseExisting.location_summary,
      goals: baseExisting.goals,
      needs: baseExisting.needs,
      motivations: baseExisting.motivations,
      pain_points: baseExisting.pain_points,
      fears: baseExisting.fears,
      objections: baseExisting.objections,
      buying_triggers: baseExisting.buying_triggers,
      decision_criteria: baseExisting.decision_criteria,
      purchase_behavior: baseExisting.purchase_behavior,
      lifestyle: baseExisting.lifestyle,
      additional_context: baseExisting.additional_context,
    };

    const novelty = evaluatePersonaNovelty(sameArchetype, [baseExisting]);
    assert.equal(novelty.passes, false);
  });

  it("fails novelty validation for a superficial duplicate", () => {
    const superficial = {
      persona_name: "Growth-Minded Clinic Owner II",
      category: "Buyer",
      occupation: "Clinic Owner",
      seniority: "Owner",
      industry_context: "Medical aesthetics",
      short_description: "Owner seeking steady patient growth",
      country: "United States",
      state: "Texas",
      city: "Dallas",
      location_summary: "Austin metro aesthetic clinics",
      goals: "Increase consult bookings",
      needs: "Reliable patient pipeline",
      motivations: "Scale without burnout",
      pain_points: "Inconsistent lead quality",
      fears: "Wasting ad spend",
      objections: "Agencies overpromise",
      buying_triggers: "Seeing peers grow",
      decision_criteria: "Proof and clarity",
      purchase_behavior: "Compares providers carefully",
      lifestyle: "Busy operator",
      additional_context: "Prefers practical guidance over hype",
    };

    const novelty = evaluatePersonaNovelty(superficial, [baseExisting]);
    assert.equal(novelty.passes, false);
    assert.ok(
      novelty.maxDifferencesAgainstClosest < MIN_STRATEGIC_DIMENSION_DIFFERENCES,
    );
  });

  it("different vocabulary for the same goals and objections is treated conservatively", () => {
    // Heavy lexical overlap on strategic content; renamed shell fields only.
    const paraphrased = {
      persona_name: "Expansion Focused Practice Leader",
      category: "Buyer",
      occupation: "Clinic Owner",
      seniority: "Owner",
      industry_context: "Medical aesthetics",
      short_description: "Owner seeking steady patient growth",
      country: "United States",
      state: "Texas",
      city: "Austin",
      location_summary: "Austin metro aesthetic clinics",
      goals: "Increase consult bookings and grow the patient pipeline",
      needs: "Reliable patient pipeline for steady growth",
      motivations: "Scale the clinic without burnout",
      pain_points: "Inconsistent lead quality from marketing",
      fears: "Wasting ad spend on weak leads",
      objections: "Agencies overpromise outcomes",
      buying_triggers: "Seeing peers grow with proof",
      decision_criteria: "Proof and clarity before buying",
      purchase_behavior: "Compares providers carefully before committing",
      lifestyle: "Busy operator running a clinic",
      additional_context: "Prefers practical guidance over hype",
    };

    const novelty = evaluatePersonaNovelty(paraphrased, [baseExisting]);
    assert.equal(novelty.passes, false);
  });

  it("passes novelty when differing across meaningful strategic dimensions", () => {
    const novelty = evaluatePersonaNovelty(distinctCandidate, [baseExisting]);
    assert.equal(novelty.passes, true);
    assert.ok(
      novelty.maxDifferencesAgainstClosest >= MIN_STRATEGIC_DIMENSION_DIFFERENCES,
    );
  });

  it("zero existing Personas allows a valid candidate", () => {
    const novelty = evaluatePersonaNovelty(distinctCandidate, []);
    assert.equal(novelty.passes, true);
  });

  it("must pass against every existing Persona, not an aggregate", () => {
    const secondExisting = makePersona({
      id: "p2",
      persona_name: "Skeptical Operations Director Clone Base",
      category: distinctCandidate.category,
      occupation: distinctCandidate.occupation,
      seniority: distinctCandidate.seniority,
      industry_context: distinctCandidate.industry_context,
      short_description: distinctCandidate.short_description,
      country: distinctCandidate.country,
      state: distinctCandidate.state,
      city: distinctCandidate.city,
      location_summary: distinctCandidate.location_summary,
      goals: distinctCandidate.goals,
      needs: distinctCandidate.needs,
      motivations: distinctCandidate.motivations,
      pain_points: distinctCandidate.pain_points,
      fears: distinctCandidate.fears,
      objections: distinctCandidate.objections,
      buying_triggers: distinctCandidate.buying_triggers,
      decision_criteria: distinctCandidate.decision_criteria,
      purchase_behavior: distinctCandidate.purchase_behavior,
      lifestyle: distinctCandidate.lifestyle,
      additional_context: distinctCandidate.additional_context,
    });

    const novelty = evaluatePersonaNovelty(distinctCandidate, [
      baseExisting,
      secondExisting,
    ]);
    assert.equal(novelty.passes, false);
  });
});

describe("persona generation — portfolio coverage planner", () => {
  it("formats the complete portfolio for planner reasoning", () => {
    const block = formatPersonaPortfolioForCoveragePlanner([
      baseExisting,
      makePersona({
        id: "p-ops",
        persona_name: "Ops Lead",
        occupation: "Operations Manager",
        seniority: "Manager",
      }),
    ]);
    assert.match(block, /Total Personas in portfolio: 2/);
    assert.match(block, /Clinic Owner/);
    assert.match(block, /Ops Lead/);
    assert.match(block, /Operations Manager/);
  });

  it("parses planner JSON into guidance and explanation", () => {
    const plan = parsePersonaPortfolioCoveragePlan(
      JSON.stringify({
        planningSummary: "Concentrated on executives.",
        generationGuidance: "Generate a procurement lead.",
        explanation:
          "The portfolio contains several SMB Personas but almost no enterprise decision makers.",
      }),
    );
    assert.ok(plan);
    assert.equal(plan!.generationGuidance, "Generate a procurement lead.");
    assert.match(plan!.explanation, /enterprise decision makers/);
  });

  it("planner prompt optimizes for portfolio completeness", () => {
    const prompt = buildPersonaCoveragePlannerPrompt({
      brainContextBlock: '{"organization":{"name":"Acme"}}',
      portfolioBlock: "Persona 1: occupation=Clinic Owner",
      instruction: null,
    });
    assert.match(prompt, /Portfolio Coverage Planner/i);
    assert.match(prompt, /portfolio completeness/i);
    assert.match(prompt, /Do not optimize for novelty alone/i);
    assert.match(prompt, /COMPLETE PERSONA PORTFOLIO/);
  });

  it("plans before generation and returns non-persistent coverage insight", async () => {
    let plannedPersonas: Persona[] | null = null;
    let generationPrompt = "";

    const result = await generatePersonaCandidate({
      organizationId: ORG,
      instruction: null,
      deps: {
        requestId: "req-coverage-plan",
        buildBrain: async () => makeBrain(),
        getPersonas: async () => [baseExisting],
        planCoverage: async (input) => {
          plannedPersonas = input.personas;
          return STUB_COVERAGE_PLAN;
        },
        generateReview: async (prompt) => {
          generationPrompt = prompt;
          return JSON.stringify(distinctCandidate);
        },
      },
    });

    assert.ok(plannedPersonas);
    assert.equal(plannedPersonas!.length, 1);
    assert.match(generationPrompt, /PORTFOLIO COVERAGE PLAN/);
    assert.match(generationPrompt, /operational buyer/);
    assert.equal(
      result.portfolioCoverageInsight,
      STUB_COVERAGE_PLAN.explanation,
    );
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /masterProfile/);
    assert.doesNotMatch(serialized, /embedding/i);
  });

  it("generation prompt includes coverage plan guidance when provided", () => {
    const prompt = buildPersonaGenerationPrompt({
      brainContextBlock: "{}",
      existingPersonasBlock: "None",
      instruction: null,
      coveragePlanBlock:
        "Generation guidance: Generate a Private Equity Partner buyer.",
    });
    assert.match(prompt, /PORTFOLIO COVERAGE PLAN/);
    assert.match(prompt, /Private Equity Partner/);
    assert.match(prompt, /strengthens portfolio coverage/i);
  });
});

describe("persona generation — orchestration", () => {
  it("ignores client organizationId and does not persist", async () => {
    let createCalls = 0;
    let capturedOrg: string | null = null;
    let modelCalls = 0;

    const result = await generatePersonaCandidate({
      organizationId: ORG,
      instruction: "",
      clientOrganizationId: "should-never-be-used",
      deps: {
        requestId: "req-org-isolation",
        buildBrain: async (organizationId) => {
          capturedOrg = organizationId;
          return makeBrain();
        },
        getPersonas: async () => [baseExisting],
        planCoverage: stubPlanCoverage,
        generateReview: async () => {
          modelCalls += 1;
          createCalls += 0;
          return JSON.stringify(distinctCandidate);
        },
      },
    });

    assert.equal(capturedOrg, ORG);
    assert.equal(result.ok, true);
    assert.equal(result.candidate.persona_name, distinctCandidate.persona_name);
    assert.equal(modelCalls, 1);
    assert.equal(createCalls, 0);
    assert.equal(result.portfolioCoverageInsight, STUB_COVERAGE_PLAN.explanation);
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.candidate, "organization_id"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(result, "brain"),
      false,
    );
  });

  it("does not return full private Brain context in the result", async () => {
    const brain = makeBrain();
    const brainBlock = formatBrainContextForPersonaGeneration(brain);
    assert.match(brainBlock, /Aesthetic clinic growth advisor/);

    const result = await generatePersonaCandidate({
      organizationId: ORG,
      instruction: "Generate a skeptical buyer.",
      deps: {
        requestId: "req-no-brain-leak",
        buildBrain: async () => brain,
        getPersonas: async () => [],
        planCoverage: stubPlanCoverage,
        generateReview: async (prompt) => {
          assert.match(prompt, /Generate a skeptical buyer\./);
          assert.match(prompt, /Aesthetic clinic growth advisor/);
          return JSON.stringify(distinctCandidate);
        },
      },
    });

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /masterProfile/);
    assert.doesNotMatch(serialized, /homepageLearning/);
    assert.doesNotMatch(serialized, /Premium consult playbook/);
    assert.equal(result.candidate.occupation, distinctCandidate.occupation);
  });

  it("retries once after novelty failure, then errors on second failure", async () => {
    let calls = 0;
    const duplicate = {
      persona_name: "Near Duplicate",
      category: baseExisting.category,
      occupation: baseExisting.occupation,
      seniority: baseExisting.seniority,
      industry_context: baseExisting.industry_context,
      short_description: baseExisting.short_description,
      country: baseExisting.country,
      state: baseExisting.state,
      city: "Houston",
      location_summary: baseExisting.location_summary,
      goals: baseExisting.goals,
      needs: baseExisting.needs,
      motivations: baseExisting.motivations,
      pain_points: baseExisting.pain_points,
      fears: baseExisting.fears,
      objections: baseExisting.objections,
      buying_triggers: baseExisting.buying_triggers,
      decision_criteria: baseExisting.decision_criteria,
      purchase_behavior: baseExisting.purchase_behavior,
      lifestyle: baseExisting.lifestyle,
      additional_context: baseExisting.additional_context,
    };

    await assert.rejects(
      () =>
        generatePersonaCandidate({
          organizationId: ORG,
          instruction: null,
          deps: {
            requestId: "req-novelty-retry",
            buildBrain: async () => makeBrain(),
            getPersonas: async () => [baseExisting],
            planCoverage: stubPlanCoverage,
            generateReview: async (prompt) => {
              calls += 1;
              if (calls === 2) {
                assert.match(prompt, /NOVELTY RETRY CONSTRAINT/);
              }
              return JSON.stringify(duplicate);
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof PersonaGenerationError);
        assert.equal(error.code, "NOVELTY_FAILED");
        return true;
      },
    );

    assert.equal(calls, 2);
  });

  it("succeeds on novelty retry after first superficial candidate", async () => {
    let calls = 0;
    const duplicate = {
      persona_name: "Almost Same",
      category: baseExisting.category,
      occupation: baseExisting.occupation,
      seniority: baseExisting.seniority,
      industry_context: baseExisting.industry_context,
      short_description: baseExisting.short_description,
      country: baseExisting.country,
      state: baseExisting.state,
      city: "San Antonio",
      location_summary: baseExisting.location_summary,
      goals: baseExisting.goals,
      needs: baseExisting.needs,
      motivations: baseExisting.motivations,
      pain_points: baseExisting.pain_points,
      fears: baseExisting.fears,
      objections: baseExisting.objections,
      buying_triggers: baseExisting.buying_triggers,
      decision_criteria: baseExisting.decision_criteria,
      purchase_behavior: baseExisting.purchase_behavior,
      lifestyle: baseExisting.lifestyle,
      additional_context: baseExisting.additional_context,
    };

    const result = await generatePersonaCandidate({
      organizationId: ORG,
      instruction: "Surprise me",
      deps: {
        requestId: "req-novelty-recover",
        buildBrain: async () => makeBrain(),
        getPersonas: async () => [baseExisting],
        planCoverage: stubPlanCoverage,
        generateReview: async () => {
          calls += 1;
          return JSON.stringify(calls === 1 ? duplicate : distinctCandidate);
        },
      },
    });

    assert.equal(calls, 2);
    assert.equal(result.attempts, 2);
    assert.equal(result.candidate.persona_name, distinctCandidate.persona_name);
    assert.equal(result.portfolioCoverageInsight, STUB_COVERAGE_PLAN.explanation);
  });
});

describe("persona generation — route and UI contracts", () => {
  it("generate route uses org context, request id, and no persistence", () => {
    const route = read("app/api/personas/generate/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /generatePersonaCandidate/);
    assert.match(route, /ATHENA_REQUEST_ID_HEADER/);
    assert.match(route, /maxDuration = 90/);
    assert.match(route, /clientOrganizationId/);
    assert.match(route, /portfolioCoverageInsight/);
    assert.doesNotMatch(route, /createPersona\(/);
    assert.doesNotMatch(route, /importPersonaManual/);
    assert.doesNotMatch(route, /enqueueDiscussionGenerationJob/);
    assert.doesNotMatch(route, /from\("personas"\)\.insert/);
  });

  it("confirmed create uses existing POST /api/personas with source generated", () => {
    const form = read("components/personas/PersonaGenerateForm.tsx");
    assert.match(form, /\/api\/personas\/generate/);
    assert.match(form, /\/api\/personas"/);
    assert.match(form, /source:\s*"generated"/);
    assert.match(form, /Generate Again/);
    assert.match(form, /Clear Candidate/);
    assert.match(form, /Create Persona/);
    assert.match(form, /Portfolio Coverage Insight/);
    assert.match(form, /Athena selected this Persona because:/);
    assert.match(form, /portfolioCoverageInsight/);
    assert.match(form, /body: JSON\.stringify\(\{\s*instruction,/);
    assert.match(form, /candidateHasMeaningfulContent/);
    assert.match(form, /requestLockRef/);
    assert.match(form, /type="button"/);

    const createFn = form.match(
      /async function createPersona\(\) \{[\s\S]*?\n  \}/,
    )?.[0];
    assert.ok(createFn, "createPersona function should exist");
    assert.match(
      createFn!,
      /body: JSON\.stringify\(\{\s*\.\.\.candidate,\s*source: "generated",\s*\}\)/,
    );
    assert.doesNotMatch(createFn!, /\binstruction\b/);
    assert.doesNotMatch(createFn!, /portfolioCoverageInsight/);
    assert.doesNotMatch(createFn!, /\/api\/personas\/generate/);
  });

  it("review form keeps Reference Website editable; create posts candidate edits", () => {
    const form = read("components/personas/PersonaGenerateForm.tsx");
    assert.match(form, /Reference Website/);
    assert.match(
      form,
      /setCandidateField\("reference_website", event\.target\.value\)/,
    );
    assert.match(
      form,
      /body: JSON\.stringify\(\{\s*\.\.\.candidate,\s*source: "generated",\s*\}\)/,
    );

    const formState = personaCandidateToFormState({
      persona_name: "Ops Lead",
      reference_website: "",
    });
    assert.equal(formState.reference_website, "");
    formState.reference_website = "https://research.example/segment";
    assert.equal(
      formState.reference_website,
      "https://research.example/segment",
    );
  });

  it("import page keeps Manual Create and CSV Import unchanged in behavior contracts", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(forms, /Manual Create/);
    assert.match(forms, /PersonaCsvImport/);
    assert.match(forms, /PersonaGenerateForm/);
    assert.match(forms, /fetch\("\/api\/personas"/);
    assert.doesNotMatch(forms, /source:\s*"generated"/);

    const createRoute = read("app/api/personas/route.ts");
    assert.match(createRoute, /importPersonaManual/);
    assert.match(createRoute, /source: text\("source", "source"\)/);

    const importer = read("services/personas/personaImporter.ts");
    assert.match(
      importer,
      /source: normalizeOptionalText\(row\.source\) \?\? source/,
    );
    assert.match(importer, /ensurePersonaGenerationQueued/);

    const csv = read("components/personas/PersonaCsvImport.tsx");
    assert.match(csv, /\/api\/personas\/import\/preview/);
    assert.match(csv, /\/api\/personas\/import/);
  });

  it("generation service uses full org Brain builder and existing AI client", () => {
    const service = read("services/personas/personaGeneration.ts");
    assert.match(service, /buildBrainContextForOrganization/);
    assert.match(service, /generateReview/);
    assert.match(service, /getPersonas/);
    assert.match(service, /planPersonaPortfolioCoverage/);
    assert.match(service, /portfolioCoverageInsight/);
    assert.match(service, /preparePersonaCreateRow/);
    assert.match(service, /hasMeaningfulPersonaContent/);
    assert.match(service, /blankGeneratedCandidateReferenceWebsite/);
    assert.match(service, /MIN_STRATEGIC_DIMENSION_DIFFERENCES = 3/);
    assert.doesNotMatch(service, /createPersona\(/);
    assert.doesNotMatch(service, /productKnowledge/i);
    assert.doesNotMatch(service, /embedding/i);

    const planner = read("lib/personas/coveragePlanner.ts");
    assert.match(planner, /planPersonaPortfolioCoverage/);
    assert.match(planner, /formatPersonaPortfolioForCoveragePlanner/);
    assert.doesNotMatch(planner, /embedding/i);
    assert.doesNotMatch(planner, /vector/i);
    assert.doesNotMatch(planner, /from\("personas"\)\.insert/);
  });
});

describe("persona creation blocks — collapsible layout and state", () => {
  it("all three blocks start collapsed by default", () => {
    const block = read("components/personas/PersonaCreationBlock.tsx");
    assert.match(block, /defaultOpen = false/);
    assert.match(block, /useState\(defaultOpen\)/);
    assert.match(block, /type="button"/);
    assert.match(block, /aria-expanded=\{open\}/);
    assert.match(block, /aria-controls=\{panelId\}/);
    assert.match(block, /id=\{panelId\}/);
    assert.match(block, /hidden=\{!open\}/);

    const forms = read("components/personas/PersonaImportForms.tsx");
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    const csv = read("components/personas/PersonaCsvImport.tsx");

    assert.match(forms, /title="Manual Create"/);
    assert.match(forms, /panelId="persona-creation-manual"/);
    assert.doesNotMatch(forms, /defaultOpen=\{true\}/);

    assert.match(generate, /title="Generate Persona"/);
    assert.match(generate, /panelId="persona-creation-generate"/);
    assert.doesNotMatch(generate, /defaultOpen=\{true\}/);

    assert.match(csv, /title="CSV Import"/);
    assert.match(csv, /panelId="persona-creation-csv"/);
    assert.doesNotMatch(csv, /defaultOpen=\{true\}/);
  });

  it("each block expands independently with its own open state", () => {
    const block = read("components/personas/PersonaCreationBlock.tsx");
    assert.match(block, /const \[open, setOpen\] = useState\(defaultOpen\)/);
    assert.match(
      block,
      /onClick=\{\(\) => setOpen\(\(previous\) => !previous\)\}/,
    );

    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(forms, /PersonaCreationBlock/);
    assert.match(forms, /PersonaGenerateForm/);
    assert.match(forms, /PersonaCsvImport/);
    // Three distinct panel ids — independent disclosure instances.
    assert.match(forms, /persona-creation-manual/);
    assert.match(
      read("components/personas/PersonaGenerateForm.tsx"),
      /persona-creation-generate/,
    );
    assert.match(
      read("components/personas/PersonaCsvImport.tsx"),
      /persona-creation-csv/,
    );
  });

  it("desktop DOM order places Manual and Generate before CSV", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(
      forms,
      /grid gap-8 lg:grid-cols-2[\s\S]*Manual Create[\s\S]*PersonaGenerateForm[\s\S]*PersonaCsvImport/,
    );
    const manualIndex = forms.indexOf('title="Manual Create"');
    const generateIndex = forms.indexOf("<PersonaGenerateForm");
    const csvIndex = forms.indexOf("<PersonaCsvImport");
    assert.ok(manualIndex > 0);
    assert.ok(generateIndex > manualIndex);
    assert.ok(csvIndex > generateIndex);
  });

  it("collapse keeps form trees mounted so session state is preserved", () => {
    const block = read("components/personas/PersonaCreationBlock.tsx");
    // Keep-mounted pattern: hidden toggle always renders children.
    assert.match(block, /hidden=\{!open\}/);
    assert.match(block, /<div id=\{panelId\} hidden=\{!open\}>[\s\S]*\{children\}/);
    assert.doesNotMatch(block, /\{open \?\s*\([\s\S]*\{children\}/);

    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(forms, /const \[manual, setManual\]/);
    assert.match(forms, /value=\{manual\.persona_name/);

    const generate = read("components/personas/PersonaGenerateForm.tsx");
    assert.match(generate, /const \[instruction, setInstruction\]/);
    assert.match(generate, /const \[candidate, setCandidate\]/);
    assert.match(generate, /value=\{instruction\}/);
    assert.match(generate, /value=\{candidate\.reference_website/);

    const csv = read("components/personas/PersonaCsvImport.tsx");
    assert.match(csv, /const \[csvFile, setCsvFile\]/);
    assert.match(csv, /const \[preview, setPreview\]/);
    assert.match(csv, /PersonaCreationBlock/);
  });

  it("disclosure buttons do not submit forms", () => {
    const block = read("components/personas/PersonaCreationBlock.tsx");
    assert.match(block, /type="button"/);
    assert.doesNotMatch(block, /type="submit"/);
  });
});

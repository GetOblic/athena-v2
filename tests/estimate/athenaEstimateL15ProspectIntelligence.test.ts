/**
 * Athena Estimate V27 L15 — Prospect intelligence composition + generation freeze.
 */
import "./../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildEstimateUserPrompt } from "../../services/ai/prompts/estimate/estimateUserPrompt";
import {
  ESTIMATE_GROUNDING_RULES,
} from "../../services/ai/prompts/estimate/estimateSharedConstraints";
import { ESTIMATE_SYSTEM_PROMPT } from "../../services/ai/prompts/estimate/estimateSystemPrompt";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import { validateEstimateProspectGenerationContext } from "../../services/estimate/athenaEstimateProspectContext";
import type { AthenaEstimate } from "../../services/estimate/athenaEstimateService";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
  ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
  type AthenaEstimatePackage,
  type EstimateRequest,
} from "../../services/estimate/athenaEstimateTypes";
import { ESTIMATE_CONTEXT_LIMITS } from "../../services/estimate/estimateContextComposer";
import { executeClaimedEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor";
import type { AthenaEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";
import { runEstimateGenerationPipeline } from "../../services/estimate/estimateGenerationPipeline";
import {
  assembleProspectCommercialTargetBlock,
  composeEstimateProspectGenerationContext,
  ESTIMATE_PROSPECT_COMMERCIAL_TARGET_HEADER,
  ESTIMATE_PROSPECT_CONTEXT_LIMITS,
  EstimateProspectContextCompositionError,
  formatBlueprintCommercialFieldsForEstimate,
  formatProspectWebsiteIntelligenceForEstimate,
} from "../../services/estimate/estimateProspectContextComposer";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const REQUEST: EstimateRequest = {
  projectNeed: "Rebuild the marketing site with CMS and analytics.",
  additionalContext: "Need staging + training.",
  timeframe: "1_3_months",
};

const METHODOLOGY = {
  configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  revisionId: "rev-estimate-method-001",
  instructionText:
    "Price for mid-market delivery complexity with clear contingency.",
  configured: true as const,
  updatedAt: "2026-08-09T00:00:00.000Z",
  updatedBy: "super-admin",
};

const ORG_ID = "org-33333333-3333-4333-8333-333333333333";
const PROSPECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DISCUSSION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EV_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function samplePackage(): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 18000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 14000, currencyCode: "USD" },
      high: { amount: 24000, currencyCode: "USD" },
    },
    scopeInterpretation: "Full marketing site rebuild.",
    pricingRationale: "Scope supports mid-market fee.",
    keyPriceDrivers: ["CMS", "Analytics", "Design", "Training"],
    suggestedClientPositioning: "Fixed-scope launch.",
    risksAndAssumptions: ["Assumes brand assets", "Assumes one decision maker"],
    geographyLabel: null,
    currencyResolution: "fallback",
    guidanceDisclaimer: "Guidance only.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: METHODOLOGY.revisionId,
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

function stubProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: PROSPECT_ID,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    organization_id: ORG_ID,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    business_name: "ABC Dental",
    website: "https://abcdental.example",
    linkedin: "https://linkedin.com/in/secret",
    facebook: null,
    instagram: null,
    industry: "Healthcare",
    category: "Dental",
    country: "United States",
    state: "CA",
    city: "San Diego",
    address: "100 Main St",
    company_size: "11-50",
    revenue: "$2M",
    employee_count: "25",
    technologies: "Dentrix, Weave",
    pain_points: "Low new-patient conversion",
    decision_maker: "Practice Manager",
    first_name: "Jane",
    last_name: "Doe",
    external_contact_id: "ext-123",
    timezone: "America/Los_Angeles",
    job_title: "Owner",
    email: "jane@abcdental.example",
    phone: "+1-555-0100",
    whatsapp_number: "+1-555-0101",
    getoblic_type: null,
    google_business_url: null,
    notes: "Prefers phased rollout.",
    additional_context: " competes with corporate DSOs.",
    source: "manual",
    status: "active",
    lifecycle_status: "active",
    ads_content: "Google Ads: new patient special $99 exam.",
    opportunity_score: 80,
    priority: 1,
    website_intelligence: {
      provider: "homepage_only",
      url: "https://abcdental.example",
      title: "ABC Dental",
      positioning: "Family dental care in San Diego",
      services: "General dentistry, implants",
      contact_information: "jane@abcdental.example / +1-555-0100",
      email: "should-not-appear@example.com",
    },
    raw_json: { secret: true },
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

function stubExecutiveVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: EV_ID,
    discussion_id: DISCUSSION_ID,
    organization_id: ORG_ID,
    user_id: null,
    version_number: 2,
    is_current: true,
    generated_at: "2026-08-08T00:00:00.000Z",
    generation_duration_ms: 1000,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "executive_intelligence_v1",
    regeneration_run_id: null,
    analysis_id: "analysis-1",
    opportunity_id: "opp-1",
    review_id: "review-1",
    blueprint_id: "blueprint-1",
    intelligence: {
      analysis: {
        id: "analysis-1",
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
        discussion_id: DISCUSSION_ID,
        user_id: null,
        community_id: null,
        status: "ready",
        summary: "Strong local dental demand with weak digital funnel.",
        sentiment: "positive",
        intent: "buy",
        buyer_stage: "consideration",
        pain_points: "Inconsistent lead follow-up",
        opportunity_detected: true,
        opportunity_title: "Website conversion rebuild",
        opportunity_reason: "Traffic without booking path",
        recommended_action: "Rebuild site + booking",
        suggested_cta: "DEPLOYMENT ASSET PAYLOAD SHOULD NOT BE REQUIRED",
        risk_level: "medium",
        confidence: 0.8,
        strategy_key: "standard",
        strategy_prompt_version: null,
        analysis_prompt_version: null,
        model: null,
        generation_time_ms: null,
        raw_json: null,
      },
      opportunity: {
        id: "opp-1",
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
        discussion_id: DISCUSSION_ID,
        community_id: null,
        type: "growth",
        status: "open",
        score: 70,
        urgency: "medium",
        intent: "buy",
        risk_level: "low",
        title: "New patient acquisition site",
        reason: "Local search demand",
        recommended_action: "Launch conversion-focused site",
        suggested_cta: null,
        assigned_to: null,
        due_at: null,
        ai_summary: "High-intent local searchers.",
        ai_recommendation: "Prioritize booking UX.",
        raw_json: null,
      },
      briefing: {
        id: "review-1",
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
        discussion_id: DISCUSSION_ID,
        opportunity_id: "opp-1",
        status: "ready",
        summary: "Pitch a fixed-scope website + booking rebuild.",
        pain_points: "No online booking",
        buyer_stage: "consideration",
        recommended_response: "Lead with conversion lift.",
        cta: "Book strategy call",
        confidence: 0.7,
        raw_json: null,
        model: null,
        prompt_version: null,
        generation_time_ms: null,
        version: 1,
        approved_by: null,
        approved_at: null,
        notes: "Keep clinical tone.",
      },
      blueprint: {
        id: "blueprint-1",
        user_id: null,
        discussion_id: DISCUSSION_ID,
        opportunity_id: "opp-1",
        briefing_id: "review-1",
        asset_title: "New Patient Booking Guide",
        asset_type: "pdf",
        business_goal: "Increase booked exams",
        target_audience: "Local families",
        priority: "high",
        estimated_reuse: 3,
        image_prompt: "SECRET IMAGE PROMPT",
        pdf_prompt: "SECRET PDF PROMPT",
        social_prompt: "SECRET SOCIAL PROMPT",
        trend_social_prompt: "SECRET TREND PROMPT",
        notes: "Use calm clinical visuals.",
        status: "ready",
        raw_json: null,
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
      },
    },
    created_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

function queuedEstimate(overrides: Partial<AthenaEstimate> = {}): AthenaEstimate {
  return {
    id: "est-11111111-1111-4111-8111-111111111111",
    licensee_account_id: "lic-22222222-2222-4222-8222-222222222222",
    organization_id: ORG_ID,
    requested_by: "master-44444444-4444-4444-8444-444444444444",
    organization_name_snapshot: "Acme Co",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
    request_json: REQUEST,
    status: "Queued",
    generation_stage: "assembling_context",
    package_json: null,
    error_code: null,
    error_message: null,
    currency_code: null,
    geography_label: null,
    currency_resolution: null,
    instruction_config_key: null,
    instruction_revision_id: null,
    instruction_configured: false,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function claimedJob(
  overrides: Partial<AthenaEstimateGenerationJob> = {},
): AthenaEstimateGenerationJob {
  const estimate = queuedEstimate();
  return {
    id: "job-55555555-5555-4555-8555-555555555555",
    licensee_account_id: estimate.licensee_account_id,
    organization_id: estimate.organization_id,
    estimate_id: estimate.id,
    status: "processing",
    generation_stage: "asserting_authorization",
    attempt_count: 1,
    max_attempts: 3,
    claimed_by: "worker-1",
    claim_token: "claim-token",
    claimed_at: "2026-08-09T00:00:00.000Z",
    claim_expires_at: "2026-08-09T01:00:00.000Z",
    heartbeat_at: "2026-08-09T00:00:00.000Z",
    next_attempt_at: null,
    error_code: null,
    error_message: null,
    error_metadata: null,
    requested_by: estimate.requested_by,
    started_at: "2026-08-09T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function mockJobOps() {
  const completes: Array<Record<string, unknown>> = [];
  const fails: Array<Record<string, unknown>> = [];
  return {
    completes,
    fails,
    ops: {
      heartbeat: async () => claimedJob(),
      complete: async (input: {
        packageJson: Record<string, unknown>;
        prospectGenerationContextJson?: Record<string, unknown> | null;
      }) => {
        completes.push(input as unknown as Record<string, unknown>);
        return claimedJob({ status: "completed", generation_stage: "completed" });
      },
      fail: async (input: {
        errorCode: string;
        retryable?: boolean;
        failedStage?: string | null;
      }) => {
        fails.push(input as unknown as Record<string, unknown>);
        return claimedJob({
          status: input.retryable ? "retryable" : "failed",
          error_code: input.errorCode,
          generation_stage: input.failedStage ?? "failed",
        });
      },
    },
  };
}

describe("Athena Estimate L15 — Prospect intelligence composition + freeze", () => {
  it("1/2/3. Org-only: no Prospect fetch, no Prospect section, frozen context null", async () => {
    const jobOps = mockJobOps();
    let prospectFetchCount = 0;
    let capturedPromptProspect: string | null | undefined = "sentinel";

    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "lic",
            organizationId: ORG_ID,
            relationshipId: "rel",
          }),
          getMethodology: async () => METHODOLOGY,
          composeProspectContext: async () => {
            prospectFetchCount += 1;
            throw new Error("org-only must not compose Prospect");
          },
          prospectContextDeps: {
            getProspectById: async () => {
              prospectFetchCount += 1;
              throw new Error("org-only must not fetch Prospect");
            },
          },
          runPipeline: async (input) => {
            capturedPromptProspect =
              input.prospectCommercialTargetIntelligence ?? null;
            const prompt = buildEstimateUserPrompt({
              trustedContext: "ORG TRUSTED",
              operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nwork",
              methodologyInstructionText: METHODOLOGY.instructionText,
              methodologyRevisionId: METHODOLOGY.revisionId,
              geoCurrency: {
                geographyLabel: null,
                currencyCode: "USD",
                currencyResolution: "fallback",
              },
              request: REQUEST,
              prospectCommercialTargetIntelligence:
                input.prospectCommercialTargetIntelligence,
            });
            // No Prospect section block — grounding may still name the trust class.
            assert.doesNotMatch(
              prompt,
              /PROSPECT COMMERCIAL TARGET INTELLIGENCE\n\(Trusted Athena evidence about the commercial target/,
            );
            assert.doesNotMatch(prompt, /prospect_id:/);
            return {
              package: samplePackage(),
              context: {
                organizationId: ORG_ID,
                trusted: {} as never,
                composedTrustedContext: "ORG TRUSTED",
                operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nwork",
                geoCurrency: {
                  geographyLabel: null,
                  currencyCode: "USD",
                  currencyResolution: "fallback" as const,
                },
                meta: {} as never,
              },
            };
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(prospectFetchCount, 0);
    assert.equal(capturedPromptProspect, null);
    assert.equal(jobOps.completes.length, 1);
    assert.equal(jobOps.completes[0]?.prospectGenerationContextJson, null);
  });

  it("4/5. Prospect fetched with estimate organization_id; wrong org fail closed", async () => {
    const fetches: Array<{ id: string; org: string }> = [];
    const result = await composeEstimateProspectGenerationContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      capturedAt: "2026-08-09T12:00:00.000Z",
      deps: {
        getProspectById: async (id, organizationId) => {
          fetches.push({ id, org: organizationId });
          return stubProspect();
        },
      },
    });
    assert.deepEqual(fetches, [{ id: PROSPECT_ID, org: ORG_ID }]);
    assert.equal(result.frozenContext.prospectId, PROSPECT_ID);

    await assert.rejects(
      () =>
        composeEstimateProspectGenerationContext({
          prospectId: PROSPECT_ID,
          organizationId: ORG_ID,
          deps: { getProspectById: async () => null },
        }),
      EstimateProspectContextCompositionError,
    );
  });

  it("6. Removed Prospect before worker fail closed (not org-only)", async () => {
    const jobOps = mockJobOps();
    let pipelineCalled = false;
    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () =>
            queuedEstimate({
              prospect_id: null,
              prospect_business_name_snapshot: "ABC Dental",
            }),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "lic",
            organizationId: ORG_ID,
            relationshipId: "rel",
          }),
          getMethodology: async () => METHODOLOGY,
          runPipeline: async () => {
            pipelineCalled = true;
            throw new Error("must not run");
          },
          jobOps: jobOps.ops,
        },
      },
    );
    assert.equal(status, "failed");
    assert.equal(pipelineCalled, false);
    assert.equal(jobOps.fails[0]?.errorCode, "PROSPECT_TARGET_UNAVAILABLE");
    assert.equal(jobOps.fails[0]?.retryable, false);
    assert.equal(jobOps.completes.length, 0);
  });

  it("7/8/9/10/11. Profile fields included; contact PII excluded; notes/ads/website bounded", async () => {
    const { composedText, frozenContext } =
      await composeEstimateProspectGenerationContext({
        prospectId: PROSPECT_ID,
        organizationId: ORG_ID,
        capturedAt: "2026-08-09T12:00:00.000Z",
        deps: {
          getProspectById: async () => stubProspect(),
        },
      });

    assert.match(composedText, /business_name: ABC Dental/);
    assert.match(composedText, /industry: Healthcare/);
    assert.match(composedText, /city: San Diego/);
    assert.match(composedText, /decision_maker: Practice Manager/);
    assert.match(composedText, /job_title: Owner/);
    assert.match(composedText, /notes:/);
    assert.match(composedText, /Prefers phased rollout/);
    assert.match(composedText, /additional_context:/);
    assert.match(composedText, /ads content/i);
    assert.match(composedText, /Google Ads/);
    assert.match(composedText, /website intelligence/i);
    assert.match(composedText, /Family dental care/);

    assert.doesNotMatch(composedText, /jane@abcdental\.example/);
    assert.doesNotMatch(composedText, /\+1-555-0100/);
    assert.doesNotMatch(composedText, /\+1-555-0101/);
    assert.doesNotMatch(composedText, /first_name/);
    assert.doesNotMatch(composedText, /last_name/);
    assert.doesNotMatch(composedText, /external_contact_id/);
    assert.doesNotMatch(composedText, /should-not-appear@example\.com/);

    assert.equal(frozenContext.available.profile, true);
    assert.equal(frozenContext.available.notesOrAdditionalContext, true);
    assert.equal(frozenContext.available.adsContent, true);
    assert.equal(frozenContext.available.websiteIntelligence, true);
    assert.ok(
      composedText.length <= ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
    );
  });

  it("12/14. Missing website intelligence / Current EV still allowed", async () => {
    const noOptional = await composeEstimateProspectGenerationContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      capturedAt: "2026-08-09T12:00:00.000Z",
      deps: {
        getProspectById: async () =>
          stubProspect({
            website_intelligence: null,
            linked_discussion_id: null,
            ads_content: null,
            notes: null,
            additional_context: null,
          }),
        getCurrentExecutiveVersion: async () => {
          throw new Error("must not load EV without linked discussion");
        },
      },
    });
    assert.equal(noOptional.frozenContext.available.websiteIntelligence, false);
    assert.equal(noOptional.frozenContext.available.executiveIntelligence, false);
    assert.equal(noOptional.frozenContext.sources.executiveVersionId, null);
    assert.match(noOptional.composedText, /business_name: ABC Dental/);
  });

  it("13/15/16/17. Current EV + commercial blueprint included; prompts excluded; only Current EV", async () => {
    let historicalCalled = false;
    const { composedText, frozenContext } =
      await composeEstimateProspectGenerationContext({
        prospectId: PROSPECT_ID,
        organizationId: ORG_ID,
        capturedAt: "2026-08-09T12:00:00.000Z",
        deps: {
          getProspectById: async () =>
            stubProspect({ linked_discussion_id: DISCUSSION_ID }),
          getCurrentExecutiveVersion: async (discussionId, organizationId) => {
            assert.equal(discussionId, DISCUSSION_ID);
            assert.equal(organizationId, ORG_ID);
            return stubExecutiveVersion() as never;
          },
          getAssetBlueprintById: async () => {
            historicalCalled = true;
            throw new Error("blueprint already on Current EV");
          },
        },
      });

    assert.equal(historicalCalled, false);
    assert.match(composedText, /Current Executive Intelligence/);
    assert.match(composedText, /Strong local dental demand/);
    assert.match(composedText, /Strategic Asset Blueprint/);
    assert.match(composedText, /asset_title: New Patient Booking Guide/);
    assert.match(composedText, /business_goal: Increase booked exams/);
    assert.doesNotMatch(composedText, /SECRET IMAGE PROMPT/);
    assert.doesNotMatch(composedText, /SECRET PDF PROMPT/);
    assert.doesNotMatch(composedText, /SECRET SOCIAL PROMPT/);
    assert.doesNotMatch(composedText, /SECRET TREND PROMPT/);
    assert.doesNotMatch(composedText, /image_prompt/);
    assert.equal(frozenContext.available.executiveIntelligence, true);
    assert.equal(frozenContext.available.strategicAssetBlueprint, true);
    assert.equal(frozenContext.sources.linkedDiscussionId, DISCUSSION_ID);
    assert.equal(frozenContext.sources.executiveVersionId, EV_ID);

    const blueprintOnly = formatBlueprintCommercialFieldsForEstimate(
      stubExecutiveVersion().intelligence.blueprint as never,
    );
    assert.doesNotMatch(blueprintOnly, /image_prompt|pdf_prompt|social_prompt/);
  });

  it("18. No unrelated Prospect/Discussion/Opportunity library loads", () => {
    const composer = read(
      "services/estimate/estimateProspectContextComposer.ts",
    );
    assert.match(composer, /getProspectById/);
    assert.match(composer, /getCurrentExecutiveVersion/);
    assert.doesNotMatch(composer, /getProspects\(|listProspects/);
    assert.doesNotMatch(composer, /listDiscussions|getDiscussions/);
    assert.doesNotMatch(composer, /listOpportunities|getOpportunities/);
    assert.doesNotMatch(composer, /getPersonas|listPersonas/);
    assert.doesNotMatch(composer, /listSeoReports/);
    assert.doesNotMatch(composer, /listExecutiveVersions/);
  });

  it("19/20/21. Hard cap <= 12,000; business_name survives; deterministic truncation", () => {
    const huge = "X".repeat(8_000);
    const first = assembleProspectCommercialTargetBlock({
      businessName: "Keep Me Dental",
      prospectId: PROSPECT_ID,
      profile: `business_name: Keep Me Dental\nindustry: ${huge}`,
      notes: `notes:\n${huge}`,
      painTech: `pain_points:\n${huge}`,
      ads: `ads:\n${huge}`,
      website: `website:\n${huge}`,
      executive: `executive:\n${huge}`,
      blueprint: `blueprint:\n${huge}`,
    });
    const second = assembleProspectCommercialTargetBlock({
      businessName: "Keep Me Dental",
      prospectId: PROSPECT_ID,
      profile: `business_name: Keep Me Dental\nindustry: ${huge}`,
      notes: `notes:\n${huge}`,
      painTech: `pain_points:\n${huge}`,
      ads: `ads:\n${huge}`,
      website: `website:\n${huge}`,
      executive: `executive:\n${huge}`,
      blueprint: `blueprint:\n${huge}`,
    });

    assert.ok(first.composedText.length <= 12_000);
    assert.equal(first.composedText, second.composedText);
    assert.match(first.composedText, /business_name: Keep Me Dental/);
    assert.match(
      first.composedText,
      new RegExp(ESTIMATE_PROSPECT_COMMERCIAL_TARGET_HEADER),
    );
  });

  it("22/23/24. Existing org/methodology/operator budgets unchanged", () => {
    assert.equal(ESTIMATE_CONTEXT_LIMITS.trustedTotalMaxChars, 40_000);
    assert.equal(ESTIMATE_CONTEXT_LIMITS.operatorGuidanceMaxChars, 4_000);
    assert.equal(ESTIMATE_CONTEXT_LIMITS.totalMaxChars, 44_000);
    assert.equal(ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS, 6_000);
    assert.equal(ESTIMATE_PROSPECT_CONTEXT_LIMITS.blockHardCap, 12_000);
    assert.equal(ESTIMATE_PROSPECT_CONTEXT_LIMITS.profileMaxChars, 2_000);
    assert.equal(ESTIMATE_PROSPECT_CONTEXT_LIMITS.notesMaxChars, 2_500);
    assert.equal(ESTIMATE_PROSPECT_CONTEXT_LIMITS.adsMaxChars, 1_000);
    assert.equal(ESTIMATE_PROSPECT_CONTEXT_LIMITS.websiteMaxChars, 5_000);
    assert.equal(ESTIMATE_PROSPECT_CONTEXT_LIMITS.executiveMaxChars, 3_000);
    assert.equal(ESTIMATE_PROSPECT_CONTEXT_LIMITS.blueprintMaxChars, 1_500);

    const orgComposer = read("services/estimate/estimateContextComposer.ts");
    assert.doesNotMatch(orgComposer, /PROSPECT COMMERCIAL TARGET/);
    assert.doesNotMatch(orgComposer, /composeEstimateProspectGenerationContext/);
  });

  it("25. Prompt contains Prospect trust-class framing only when targeted", () => {
    const prospectSection =
      /PROSPECT COMMERCIAL TARGET INTELLIGENCE\n(?:\(Trusted Athena evidence about the commercial target|business_name:)/;

    const orgPrompt = buildEstimateUserPrompt({
      trustedContext: "ORG",
      operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nx",
      methodologyInstructionText: "method",
      methodologyRevisionId: "rev",
      geoCurrency: {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
      request: REQUEST,
    });
    // Org-only must not emit a Prospect section (grounding may mention the class).
    assert.doesNotMatch(orgPrompt, prospectSection);
    assert.doesNotMatch(orgPrompt, /prospect_id:/);

    const prospectPrompt = buildEstimateUserPrompt({
      trustedContext: "ORG",
      operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nx",
      methodologyInstructionText: "method",
      methodologyRevisionId: "rev",
      geoCurrency: {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
      request: REQUEST,
      prospectCommercialTargetIntelligence:
        "PROSPECT COMMERCIAL TARGET INTELLIGENCE\nbusiness_name: ABC Dental",
    });
    assert.match(prospectPrompt, prospectSection);
    assert.match(ESTIMATE_GROUNDING_RULES, /PROSPECT COMMERCIAL TARGET INTELLIGENCE \(when present\)/);
    assert.match(ESTIMATE_SYSTEM_PROMPT, /PROSPECT COMMERCIAL TARGET INTELLIGENCE when present/);
  });

  it("26/27/28/29/30/31. Same estimate_v1; freeze equals prompt block; atomic complete", async () => {
    const jobOps = mockJobOps();
    const capturedAt = "2026-08-09T15:30:00.000Z";
    let promptBlock: string | null = null;

    const composed = await composeEstimateProspectGenerationContext({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      capturedAt,
      deps: {
        getProspectById: async () =>
          stubProspect({ linked_discussion_id: DISCUSSION_ID }),
        getCurrentExecutiveVersion: async () => stubExecutiveVersion() as never,
      },
    });

    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () =>
            queuedEstimate({
              prospect_id: PROSPECT_ID,
              prospect_business_name_snapshot: "ABC Dental",
            }),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "lic",
            organizationId: ORG_ID,
            relationshipId: "rel",
          }),
          getMethodology: async () => METHODOLOGY,
          composeProspectContext: async () => composed,
          runPipeline: async (input) => {
            promptBlock = input.prospectCommercialTargetIntelligence ?? null;
            assert.equal(promptBlock, composed.composedText);
            const pkg = await runEstimateGenerationPipeline({
              organizationId: ORG_ID,
              request: REQUEST,
              methodology: METHODOLOGY,
              prospectCommercialTargetIntelligence: promptBlock,
              deps: {
                composeContext: async () => ({
                  organizationId: ORG_ID,
                  trusted: {} as never,
                  composedTrustedContext: "ORG TRUSTED",
                  operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nwork",
                  geoCurrency: {
                    geographyLabel: null,
                    currencyCode: "USD",
                    currencyResolution: "fallback" as const,
                  },
                  meta: {} as never,
                }),
                generateReview: async () => JSON.stringify(samplePackage()),
              },
            });
            assert.equal(pkg.package.schemaVersion, "estimate_v1");
            return pkg;
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(promptBlock, composed.composedText);
    const frozen = jobOps.completes[0]?.prospectGenerationContextJson as Record<
      string,
      unknown
    >;
    const validated = validateEstimateProspectGenerationContext(frozen);
    assert.equal(validated.composedText, composed.composedText);
    assert.equal(validated.available.executiveIntelligence, true);
    assert.equal(validated.sources.executiveVersionId, EV_ID);
    assert.equal(validated.sources.linkedDiscussionId, DISCUSSION_ID);
    assert.ok(jobOps.completes[0]?.packageJson);
    assert.equal(
      (jobOps.completes[0]?.packageJson as { schemaVersion: string })
        .schemaVersion,
      "estimate_v1",
    );
  });

  it("32. Rename between create/generation: snapshot unchanged; freeze uses live name", async () => {
    const jobOps = mockJobOps();
    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () =>
            queuedEstimate({
              prospect_id: PROSPECT_ID,
              prospect_business_name_snapshot: "Old Dental Name",
            }),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "lic",
            organizationId: ORG_ID,
            relationshipId: "rel",
          }),
          getMethodology: async () => METHODOLOGY,
          composeProspectContext: async (input) => {
            const result = await composeEstimateProspectGenerationContext({
              ...input,
              capturedAt: "2026-08-09T16:00:00.000Z",
              deps: {
                getProspectById: async () =>
                  stubProspect({ business_name: "New Dental Name" }),
              },
            });
            return result;
          },
          runPipeline: async () => ({
            package: samplePackage(),
            context: {
              organizationId: ORG_ID,
              trusted: {} as never,
              composedTrustedContext: "ORG",
              operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nx",
              geoCurrency: {
                geographyLabel: null,
                currencyCode: "USD",
                currencyResolution: "fallback" as const,
              },
              meta: {} as never,
            },
          }),
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "completed");
    const frozen = validateEstimateProspectGenerationContext(
      jobOps.completes[0]?.prospectGenerationContextJson,
    );
    assert.equal(frozen.businessName, "New Dental Name");
    assert.match(frozen.composedText, /business_name: New Dental Name/);
    // Creation snapshot remains Old Dental Name on the Estimate row input above;
    // executor must not write/update that column during generation.
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    assert.match(
      executor,
      /Snapshot column is creation-time identity — never rewrite here/,
    );
    assert.doesNotMatch(
      executor,
      /\.update\([\s\S]*prospect_business_name_snapshot/,
    );
  });

  it("33/34. Public DTO omits frozen context; Ask Athena uses freeze server-side only (no live compose)", () => {
    const estimate = queuedEstimate({
      status: "Ready",
      package_json: samplePackage(),
      prospect_id: PROSPECT_ID,
      prospect_business_name_snapshot: "ABC Dental",
      prospect_generation_context_json: {
        schemaVersion: "estimate_prospect_context_v1",
        prospectId: PROSPECT_ID,
        businessName: "ABC Dental",
        capturedAt: "2026-08-09T12:00:00.000Z",
        composedText: "secret freeze",
        available: {
          profile: true,
          notesOrAdditionalContext: false,
          adsContent: false,
          websiteIntelligence: false,
          executiveIntelligence: false,
          strategicAssetBlueprint: false,
        },
        sources: { linkedDiscussionId: null, executiveVersionId: null },
      },
    });
    const detail = toPublicAthenaEstimateDetail(estimate, true) as unknown as Record<
      string,
      unknown
    >;
    const summary = toPublicAthenaEstimateSummary(
      estimate,
      true,
    ) as unknown as Record<string, unknown>;
    assert.equal("prospectGenerationContext" in detail, false);
    assert.equal("prospect_generation_context_json" in detail, false);
    assert.equal("prospectGenerationContext" in summary, false);

    const askContext = read(
      "services/estimateConversation/estimateConversationContext.ts",
    );
    // L17: Ask Athena reads Estimate-row freeze; must not live-compose Prospect intel.
    assert.match(askContext, /prospect_generation_context_json/);
    assert.match(askContext, /validateEstimateProspectGenerationContext/);
    assert.doesNotMatch(askContext, /composeEstimateProspectGenerationContext/);
    assert.doesNotMatch(askContext, /getProspectById/);
    const askPanel = read(
      "components/licensee/estimate/EstimateAskAthenaPanel.tsx",
    );
    assert.doesNotMatch(
      askPanel,
      /prospect_generation_context|EstimateProspectGenerationContext/,
    );
  });

  it("35/36/37. Non-interference markers + website formatter sanity", () => {
    assert.equal(
      existsSync(
        join(ROOT, "services/estimate/estimateProspectContextComposer.ts"),
      ),
      true,
    );
    const quotePage = read("app/licensee/quote/page.tsx");
    assert.doesNotMatch(quotePage, /composeEstimateProspectGenerationContext/);
    const seoComposer = read("services/seo/seoContextComposer.ts");
    assert.doesNotMatch(seoComposer, /composeEstimateProspectGenerationContext/);

    const website = formatProspectWebsiteIntelligenceForEstimate({
      provider: "homepage_only",
      positioning: "Local clinic",
      contact_information: "secret@example.com",
    });
    assert.match(website, /Local clinic/);
    assert.doesNotMatch(website, /secret@example\.com/);
  });
});

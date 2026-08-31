import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollapsiblePromptBlock } from "../../components/assetBlueprints/CollapsiblePromptBlock";
import { StrategicAssetBlueprint } from "../../components/assetBlueprints/StrategicAssetBlueprint";
import { StrategicAssetBlueprintEmpty } from "../../components/assetBlueprints/StrategicAssetBlueprintEmpty";
import { CopyButton } from "../../components/deployment/CopyButton";
import { BriefingStatusBadge } from "../../components/briefings/BriefingStatusBadge";
import {
  buildDeploymentAssetCards,
  DeploymentAssets,
} from "../../components/deployment/DeploymentAssets";
import { DeploymentReadinessBadge } from "../../components/queues/DeploymentReadinessBadge";
import { OpportunityStatusBadge } from "../../components/queues/OpportunityStatusBadge";
import { getBriefingListSummary } from "../../lib/briefingDisplay";
import { normalizeBriefingStatus } from "../../lib/briefingStatus";
import {
  buildWhyNowSummary,
  classifyOpportunityPriority,
} from "../../lib/opportunityPriority";
import { normalizeOpportunityStatus } from "../../lib/opportunityStatus";
import {
  getBriefingDeploymentAssetsChrome,
  getBriefingStatusLabelMap,
  getBriefingStrategicAssetBlueprintChrome,
  getLocalizedBriefingListSummary,
  getLocalizedBriefingQueueTitle,
  getLocalizedBriefingStatusLabel,
} from "../../lib/tenantI18n/briefingPresentation";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  getAssetCopyChrome,
  getLocalizedDeploymentReadinessLabel,
  getLocalizedOpportunityQueueTitle,
  getLocalizedOpportunityStatusLabel,
  getLocalizedWhyNowSummary,
  getOpportunityDeploymentAssetsChrome,
  getOpportunityStatusLabelMap,
  getOpportunityStrategicAssetBlueprintChrome,
} from "../../lib/tenantI18n/opportunityPresentation";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import type { Opportunity } from "../../services/opportunityService";
import type { AthenaReview } from "../../services/reviewService";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listTsFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(relative));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(
      ...collectKeyPaths((value as Record<string, unknown>)[key], next),
    );
  }
  return paths;
}

const DICTIONARIES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const STORED_OPPORTUNITY_TITLE = "Lyon boutique expansion lead";
const STORED_RATIONALE = "Generated rationale must remain verbatim.";
const STORED_RECOMMENDATION = "Generated recommended action must remain verbatim.";
const STORED_BRIEFING_SUMMARY = "Generated briefing summary must remain verbatim.";
const STORED_PAIN_POINTS = "Generated pain points must remain verbatim.";
const STORED_SOURCE_NAME = "Maison Dupont discussion";
const STORED_URGENCY = "crise-boutique-72h";
const STORED_ASSET_TITLE = "Generated Deployment Asset title must remain verbatim.";
const STORED_ASSET_BODY = "Generated Deployment Asset body must remain verbatim.";
const STORED_BLUEPRINT_TITLE = "Generated Strategic Asset Blueprint title must remain verbatim.";
const STORED_BLUEPRINT_PROMPT = "Generated image prompt must remain verbatim.";

function sampleBriefing(overrides: Partial<AthenaReview> = {}): AthenaReview {
  return {
    id: "brief-1",
    created_at: "2026-08-20T15:04:00.000Z",
    updated_at: "2026-08-20T15:10:00.000Z",
    discussion_id: "disc-1",
    opportunity_id: "opp-1",
    status: "draft",
    summary: STORED_BRIEFING_SUMMARY,
    pain_points: STORED_PAIN_POINTS,
    buyer_stage: "Consideration",
    recommended_response: null,
    cta: null,
    confidence: 82,
    raw_json: null,
    model: "claude-sonnet-4",
    prompt_version: null,
    generation_time_ms: 12000,
    version: 1,
    approved_by: null,
    approved_at: null,
    notes: null,
    ...overrides,
  };
}

function sampleOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    created_at: "2026-08-20T15:04:00.000Z",
    updated_at: "2026-08-20T15:10:00.000Z",
    discussion_id: "disc-1",
    community_id: null,
    type: "opportunity",
    status: "pending",
    score: 70,
    urgency: STORED_URGENCY,
    intent: "high",
    risk_level: null,
    title: STORED_OPPORTUNITY_TITLE,
    reason: STORED_RATIONALE,
    recommended_action: STORED_RECOMMENDATION,
    suggested_cta: null,
    assigned_to: null,
    due_at: null,
    ai_summary: null,
    ai_recommendation: null,
    raw_json: null,
    ...overrides,
  };
}

function sampleBlueprint(
  overrides: Partial<AthenaAssetBlueprint> = {},
): AthenaAssetBlueprint {
  return {
    id: "bp-1",
    user_id: null,
    discussion_id: "disc-1",
    opportunity_id: "opp-1",
    briefing_id: "brief-1",
    asset_title: STORED_BLUEPRINT_TITLE,
    asset_type: "lead-magnet",
    business_goal: "Generated business goal must remain verbatim.",
    target_audience: "Generated audience must remain verbatim.",
    priority: "high",
    estimated_reuse: 4,
    image_prompt: STORED_BLUEPRINT_PROMPT,
    pdf_prompt: "Generated PDF prompt must remain verbatim.",
    social_prompt: "Generated social prompt must remain verbatim.",
    trend_social_prompt: "Generated trend social prompt must remain verbatim.",
    notes: "Generated notes must remain verbatim.",
    status: "ready",
    raw_json: null,
    created_at: "2026-08-20T15:04:00.000Z",
    updated_at: "2026-08-20T15:10:00.000Z",
    ...overrides,
  };
}

describe("V31 L3.7 tenant opportunities + briefings — list chrome", () => {
  it("keeps English Opportunities and Briefings list chrome canonical", () => {
    assert.equal(en.opportunities.title, "Opportunities");
    assert.equal(en.opportunities.eyebrow, "Sales Queue");
    assert.equal(en.opportunities.emptyTitle, "No opportunities in queue.");
    assert.equal(en.opportunities.actionOpen, "Open");
    assert.equal(en.briefings.title, "Briefings");
    assert.equal(en.briefings.eyebrow, "Editorial Review");
    assert.equal(en.briefings.emptyTitle, "No briefings generated yet.");
    assert.equal(en.briefings.actionOpen, "Open Briefing");
    const opportunityPage = read("app/opportunities/page.tsx");
    const briefingPage = read("app/briefings/page.tsx");
    assert.match(opportunityPage, /getTenantLocalization/);
    assert.match(briefingPage, /getTenantLocalization/);
    assert.match(opportunityPage, /TenantBackLink/);
    assert.match(briefingPage, /TenantBackLink/);
    assert.match(opportunityPage, /copy\.title/);
    assert.match(briefingPage, /copy\.title/);
    assert.equal((opportunityPage.match(/getTenantLocalization\(\)/g) ?? []).length, 1);
    assert.equal((briefingPage.match(/getTenantLocalization\(\)/g) ?? []).length, 1);
  });

  it("localizes Opportunities and Briefings list chrome in all five non-English languages", () => {
    for (const [language, dictionary] of Object.entries(DICTIONARIES) as Array<
      [OrganizationLanguage, TenantMessages]
    >) {
      if (language === "en") continue;
      assert.notEqual(dictionary.opportunities.subtitle, en.opportunities.subtitle);
      assert.notEqual(dictionary.opportunities.emptyCta, en.opportunities.emptyCta);
      assert.notEqual(dictionary.briefings.subtitle, en.briefings.subtitle);
      assert.notEqual(dictionary.briefings.emptyCta, en.briefings.emptyCta);
    }
    assert.match(fr.opportunities.title, /Opportunit/i);
    assert.match(es.opportunities.emptyTitle, /oportunidad/i);
    assert.match(itMessages.briefings.actionOpen, /briefing/i);
    assert.match(de.opportunities.eyebrow, /Vertrieb/i);
    assert.match(pt.briefings.emptyTitle, /briefing/i);
  });

  it("keeps persisted opportunity titles and generated briefing summaries verbatim", () => {
    const opportunityPage = read("app/opportunities/page.tsx");
    const briefingPage = read("app/briefings/page.tsx");
    assert.match(opportunityPage, /\{opportunity\.title\}/);
    assert.match(briefingPage, /getLocalizedBriefingListSummary/);
    assert.doesNotMatch(opportunityPage, /translateOpportunity|localizeTitle/);
    assert.doesNotMatch(briefingPage, /translateBriefing|localizeSummary/);
    assert.doesNotMatch(fr.opportunities.title, new RegExp(STORED_OPPORTUNITY_TITLE));
    assert.doesNotMatch(fr.briefings.title, new RegExp(STORED_BRIEFING_SUMMARY));
    const stored = sampleBriefing();
    assert.equal(
      getLocalizedBriefingListSummary(stored, fr.briefings.untitled),
      STORED_BRIEFING_SUMMARY,
    );
    assert.equal(getBriefingListSummary(stored), STORED_BRIEFING_SUMMARY);
  });

  it("keeps stored status and filter tokens canonical", () => {
    const control = read("components/opportunities/OpportunityStatusControl.tsx");
    assert.match(control, /<option key=\{option\} value=\{option\}>/);
    assert.match(control, /JSON\.stringify\(\{ status: nextStatus \}\)/);
    assert.equal(normalizeOpportunityStatus("approved_for_outreach"), "approved_for_outreach");
    assert.equal(normalizeBriefingStatus("needs_revision"), "needs_revision");
    assert.equal(
      getLocalizedOpportunityStatusLabel(fr, "approved_for_outreach"),
      fr.opportunities.status.approvedForOutreach,
    );
    assert.notEqual(
      getLocalizedOpportunityStatusLabel(fr, "approved_for_outreach"),
      "approved_for_outreach",
    );
    assert.equal(
      getLocalizedBriefingStatusLabel(es, "needs_revision"),
      es.briefings.status.needsRevision,
    );
    const queue = read("services/queueService.ts");
    assert.doesNotMatch(queue, /tenantI18n|getLocalizedOpportunityQueueTitle/);
    assert.match(queue, /key,/);
    const list = read("app/opportunities/page.tsx");
    assert.match(list, /key=\{section\.key\}/);
    assert.match(list, /getLocalizedOpportunityQueueTitle\(\s*messages,\s*section\.key/);
  });
});

describe("V31 L3.7 tenant opportunities + briefings — detail chrome", () => {
  it("localizes Opportunity detail chrome and keeps stored values verbatim", () => {
    const page = read("app/opportunities/[id]/page.tsx");
    assert.match(page, /getTenantLocalization/);
    assert.match(page, /TenantBackLink/);
    assert.match(page, /detail\.eyebrow/);
    assert.match(page, /\{opportunity\.title\}/);
    assert.match(page, /opportunity\.recommended_action/);
    assert.match(page, /opportunity\.ai_recommendation/);
    assert.match(page, /opportunity\.ai_summary/);
    assert.match(page, /opportunity\.reason/);
    assert.match(page, /briefing\?\.summary/);
    assert.match(page, /getLocalizedWhyNowSummary/);
    assert.doesNotMatch(page, /translateOpportunity|localizeTitle|localizeReason/);
    assert.equal(en.opportunities.detail.eyebrow, "Opportunity");
    assert.notEqual(fr.opportunities.detail.subtitle, en.opportunities.detail.subtitle);
  });

  it("localizes Briefing detail chrome and keeps generated body verbatim", () => {
    const page = read("app/briefings/[id]/page.tsx");
    assert.match(page, /getTenantLocalization/);
    assert.match(page, /TenantBackLink/);
    assert.match(page, /detail\.eyebrow/);
    assert.match(page, /value=\{review\.summary\}/);
    assert.match(page, /value=\{review\.pain_points\}/);
    assert.match(page, /value=\{review\.buyer_stage\}/);
    assert.doesNotMatch(page, /translateBriefing|localizeSummary|localizePainPoints/);
    assert.equal(en.briefings.detail.title, "Executive Briefing");
    assert.notEqual(fr.briefings.detail.subtitle, en.briefings.detail.subtitle);
  });

  it("localizes status and stage presentation only", () => {
    assert.equal(getLocalizedOpportunityStatusLabel(en, "pending"), "Pending");
    assert.equal(getLocalizedOpportunityStatusLabel(fr, "pending"), "En attente");
    assert.equal(getLocalizedBriefingStatusLabel(en, "draft"), "Draft");
    assert.equal(getLocalizedBriefingStatusLabel(de, "draft"), de.briefings.status.draft);
    assert.equal(getLocalizedOpportunityQueueTitle(en, "immediate_action"), "Immediate Action");
    assert.notEqual(
      getLocalizedOpportunityQueueTitle(pt, "immediate_action"),
      "Immediate Action",
    );
    assert.equal(getLocalizedBriefingQueueTitle(en, "needs_revision"), "Needs Revision");
    assert.notEqual(
      getLocalizedBriefingQueueTitle(itMessages, "needs_revision"),
      "Needs Revision",
    );
    const frenchBadge = renderToStaticMarkup(
      createElement(OpportunityStatusBadge, {
        status: "qualified",
        label: getLocalizedOpportunityStatusLabel(fr, "qualified"),
      }),
    );
    assert.match(frenchBadge, /Qualifi/i);
    assert.doesNotMatch(frenchBadge, />Qualified</);
    const spanishBriefing = renderToStaticMarkup(
      createElement(BriefingStatusBadge, {
        status: "approved",
        label: getLocalizedBriefingStatusLabel(es, "approved"),
      }),
    );
    assert.match(spanishBriefing, /Aprobad/i);
    const englishDefault = renderToStaticMarkup(
      createElement(OpportunityStatusBadge, { status: "won" }),
    );
    assert.match(englishDefault, /Won/);
  });

  it("keeps source names and generated recommendation/rationale verbatim", () => {
    const page = read("app/opportunities/[id]/page.tsx");
    assert.match(page, /opportunity\.discussion_id/);
    assert.match(page, /href=\{\`\/discussions\/\$\{opportunity\.discussion_id\}\`\}/);
    assert.doesNotMatch(fr.opportunities.detail.viewSourceDiscussion, new RegExp(STORED_SOURCE_NAME));
    assert.doesNotMatch(fr.opportunities.detail.recommendedAction, new RegExp(STORED_RECOMMENDATION));
    assert.doesNotMatch(fr.opportunities.detail.whyNow, new RegExp(STORED_RATIONALE));
    const whyNow = read("lib/opportunityPriority.ts");
    assert.match(whyNow, /Urgency is \{value\}\./);
    assert.doesNotMatch(whyNow, /tenantI18n/);
  });

  it("does not invent date presentation on Opportunity or Briefing surfaces", () => {
    for (const file of [
      "app/opportunities/page.tsx",
      "app/opportunities/[id]/page.tsx",
      "app/briefings/page.tsx",
      "app/briefings/[id]/page.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /formatTenantDate|formatTenantDateTime/);
      assert.doesNotMatch(source, /created_at|updated_at|approved_at/);
    }
  });

  it("does not invent delete controls on Opportunity or Briefing surfaces", () => {
    for (const file of [
      "app/opportunities/page.tsx",
      "app/opportunities/[id]/page.tsx",
      "app/briefings/page.tsx",
      "app/briefings/[id]/page.tsx",
      "components/opportunities/OpportunityStatusControl.tsx",
      "components/briefings/BriefingStatusPanel.tsx",
    ]) {
      assert.doesNotMatch(read(file), /ConfirmDeleteControl|deleteConfirm|method: "DELETE"/);
    }
  });
});

describe("V31 L3.7 tenant opportunities + briefings — generation and errors", () => {
  it("localizes Briefing generation chrome without changing request semantics", () => {
    const button = read("components/opportunities/GenerateReviewButton.tsx");
    const route = read("app/api/opportunities/[id]/review/route.ts");
    const prompt = read("services/ai/prompts/opportunityReviewPrompt.ts");
    assert.match(button, /chrome\?\.refresh \?\? "Refresh Executive Briefing"/);
    assert.match(button, /`\/api\/opportunities\/\$\{opportunityId\}\/review`/);
    assert.match(button, /method: "POST"/);
    assert.doesNotMatch(button, /JSON\.stringify/);
    assert.doesNotMatch(button, /language:/);
    assert.doesNotMatch(button, /getTenantLocalization|navigator\.language/);
    assert.doesNotMatch(route, /tenantI18n|language:/);
    assert.doesNotMatch(prompt, /tenantI18n/);
    assert.match(prompt, /OPPORTUNITY_REVIEW_PROMPT_VERSION/);
    assert.equal(en.opportunities.detail.refreshBriefing, "Refresh Executive Briefing");
    assert.notEqual(
      fr.opportunities.detail.refreshingBriefing,
      en.opportunities.detail.refreshingBriefing,
    );
  });

  it("keeps briefing approve/revision action tokens canonical", () => {
    const panel = read("components/briefings/BriefingStatusPanel.tsx");
    assert.match(panel, /JSON\.stringify\(\{ action \}\)/);
    assert.match(panel, /updateStatus\("approve"\)/);
    assert.match(panel, /updateStatus\("request_revision"\)/);
    assert.doesNotMatch(panel, /language:/);
    assert.doesNotMatch(panel, /getTenantLocalization|navigator\.language/);
    const route = read("app/api/reviews/[id]/status/route.ts");
    assert.match(route, /action === "approve"/);
    assert.match(route, /action === "request_revision"/);
    assert.doesNotMatch(route, /tenantI18n/);
  });

  it("preserves arbitrary server error text and localizes only fallbacks", () => {
    const control = read("components/opportunities/OpportunityStatusControl.tsx");
    const button = read("components/opportunities/GenerateReviewButton.tsx");
    const panel = read("components/briefings/BriefingStatusPanel.tsx");
    assert.match(control, /data\.error \|\|/);
    assert.match(control, /chrome\?\.statusUpdateFailed/);
    assert.match(button, /data\.error \|\|/);
    assert.match(button, /chrome\?\.refreshFailed/);
    assert.match(panel, /data\.error \|\|/);
    assert.match(panel, /chrome\?\.statusUpdateFailed/);
    assert.doesNotMatch(control, /translateError|localizeErrorMessage/);
    assert.doesNotMatch(button, /translateError|localizeErrorMessage/);
    assert.doesNotMatch(panel, /translateError|localizeErrorMessage/);
  });

  it("localizes application-owned untitled fallback only", () => {
    const empty = sampleBriefing({ summary: "", raw_json: null });
    assert.equal(getBriefingListSummary(empty), "Untitled briefing");
    assert.equal(
      getLocalizedBriefingListSummary(empty, fr.briefings.untitled),
      fr.briefings.untitled,
    );
    assert.notEqual(fr.briefings.untitled, "Untitled briefing");
    const display = read("lib/briefingDisplay.ts");
    assert.doesNotMatch(display, /tenantI18n/);
  });
});

describe("V31 L3.7 tenant opportunities + briefings — shared chrome", () => {
  it("keeps shared badges free of tenantI18n imports and English defaults intact", () => {
    for (const file of [
      "components/queues/OpportunityStatusBadge.tsx",
      "components/briefings/BriefingStatusBadge.tsx",
      "components/queues/DeploymentReadinessBadge.tsx",
      "components/queues/QueueSectionHeader.tsx",
      "components/navigation/EntityNavigationCard.tsx",
      "components/assetBlueprints/StrategicAssetBlueprintEmpty.tsx",
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
      "components/deployment/DeploymentAssets.tsx",
    ]) {
      assert.doesNotMatch(read(file), /tenantI18n|getTenantLocalization/);
    }
    const empty = renderToStaticMarkup(createElement(StrategicAssetBlueprintEmpty));
    assert.match(empty, /Strategic Output/);
    assert.match(empty, /Strategic Asset Blueprint/);
    const frenchEmpty = renderToStaticMarkup(
      createElement(StrategicAssetBlueprintEmpty, {
        eyebrow: fr.opportunities.detail.blueprintEmptyEyebrow,
        message: fr.opportunities.detail.blueprintEmptyMessage,
      }),
    );
    assert.match(frenchEmpty, /Strategic Asset Blueprint/);
    assert.notEqual(
      fr.opportunities.detail.blueprintEmptyEyebrow,
      "Strategic Output",
    );
    const englishReady = renderToStaticMarkup(
      createElement(DeploymentReadinessBadge, { briefingStatus: "approved" }),
    );
    assert.match(englishReady, /Ready/);
    const frenchReady = renderToStaticMarkup(
      createElement(DeploymentReadinessBadge, {
        briefingStatus: "approved",
        label: getLocalizedDeploymentReadinessLabel(fr, "approved"),
      }),
    );
    assert.match(frenchReady, /Prêt/);
  });

  it("does not let localized labels become query or API tokens", () => {
    const map = getOpportunityStatusLabelMap(fr);
    assert.equal(map.pending, fr.opportunities.status.pending);
    const briefingMap = getBriefingStatusLabelMap(de);
    assert.equal(briefingMap.draft, de.briefings.status.draft);
    const control = read("components/opportunities/OpportunityStatusControl.tsx");
    assert.match(control, /value=\{option\}/);
    assert.doesNotMatch(control, /value=\{chrome/);
    const named = interpolateTenantMessage(fr.opportunities.openOpportunityAria, {
      title: STORED_OPPORTUNITY_TITLE,
    });
    assert.match(named, new RegExp(STORED_OPPORTUNITY_TITLE));
    const statusLib = read("lib/opportunityStatus.ts");
    assert.match(statusLib, /token === "approved_for_outreach"/);
    assert.doesNotMatch(statusLib, /Approuvée|Aprobada|Approvata/);
    const briefingLib = read("lib/briefingStatus.ts");
    assert.match(briefingLib, /status === "needs_revision"/);
    assert.doesNotMatch(briefingLib, /Révision requise|Necesita revisión/);
  });
});

describe("V31 L3.7 tenant opportunities + briefings — boundaries", () => {
  it("does not change Ads, SEO, Social Planner, Personas, Prospects, or Discussions chrome imports", () => {
    for (const file of [
      "app/ads/page.tsx",
      "app/seo/page.tsx",
      "app/social-planner/page.tsx",
      "app/personas/page.tsx",
      "app/prospects/page.tsx",
      "app/discussions/page.tsx",
    ]) {
      if (!existsSync(join(ROOT, file))) continue;
      assert.doesNotMatch(read(file), /messages\.opportunities|messages\.briefings/);
    }
  });

  it("does not add generation-language, Client resolvers, providers, or browser locale authority", () => {
    const hits: string[] = [];
    for (const dir of [
      "workers",
      "services/ai/prompts",
      "services/identity/prompts",
      "services/assetBlueprints/prompts",
      "services/brain",
      "services/generationJobs",
    ]) {
      for (const file of listTsFiles(dir)) {
        if (/tenantI18n|lib\/tenantI18n/.test(read(file))) {
          hits.push(file);
        }
      }
    }
    assert.deepEqual(hits, []);
    assert.equal(
      existsSync(
        join(ROOT, "components/tenantI18n/TenantLocalizationProvider.tsx"),
      ),
      false,
    );
    for (const file of [
      "components/opportunities/OpportunityStatusControl.tsx",
      "components/opportunities/GenerateReviewButton.tsx",
      "components/briefings/BriefingStatusPanel.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /getTenantLocalization/);
      assert.doesNotMatch(source, /resolveOrganizationLanguage/);
      assert.doesNotMatch(source, /navigator\.language/);
      assert.doesNotMatch(source, /document\.cookie/);
    }
  });

  it("leaves Licensee, Super Admin, and login unchanged", () => {
    for (const file of [
      "app/login/page.tsx",
      "app/licensee/page.tsx",
      "app/super/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /messages\.opportunities|messages\.briefings/);
      assert.doesNotMatch(read(file), /getTenantLocalization/);
    }
  });

  it("keeps all six dictionaries structurally complete after L3.7 expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("opportunities.actionOpen"));
    assert.ok(canonical.includes("opportunities.status.approvedForOutreach"));
    assert.ok(canonical.includes("opportunities.detail.refreshBriefing"));
    assert.ok(canonical.includes("briefings.actionOpen"));
    assert.ok(canonical.includes("briefings.status.needsRevision"));
    assert.ok(canonical.includes("briefings.detail.approve"));
    assert.ok(canonical.includes("copyChrome.done"));
    assert.ok(canonical.includes("copyChrome.continue"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra keys`,
      );
    }
  });

  it("preserves locked terms", () => {
    for (const dictionary of Object.values(DICTIONARIES)) {
      assert.match(dictionary.opportunities.emptyBody, /Athena/);
      assert.match(
        dictionary.opportunities.detail.blueprintEmptyMessage,
        /Strategic Asset Blueprint/,
      );
      assert.match(
        dictionary.briefings.detail.blueprintEmptyMessage,
        /Strategic Asset Blueprint/,
      );
    }
  });
});

describe("V31 L3.7 tenant opportunities + briefings — why-now composition", () => {
  it("keeps the English urgency template canonical and localizes the French template", () => {
    assert.equal(en.opportunities.detail.whyNowUrgency, "Urgency is {value}.");
    assert.equal(fr.opportunities.detail.whyNowUrgency, "L’urgence est {value}.");
    assert.notEqual(fr.opportunities.detail.whyNowUrgency, en.opportunities.detail.whyNowUrgency);
    const opportunity = sampleOpportunity();
    assert.equal(
      buildWhyNowSummary(opportunity, STORED_BRIEFING_SUMMARY),
      `Urgency is ${STORED_URGENCY}. ${STORED_RECOMMENDATION} ${STORED_BRIEFING_SUMMARY}`,
    );
    assert.equal(
      getLocalizedWhyNowSummary(en, opportunity, STORED_BRIEFING_SUMMARY),
      `Urgency is ${STORED_URGENCY}. ${STORED_RECOMMENDATION} ${STORED_BRIEFING_SUMMARY}`,
    );
    assert.equal(
      getLocalizedWhyNowSummary(fr, opportunity, STORED_BRIEFING_SUMMARY),
      `L’urgence est ${STORED_URGENCY}. ${STORED_RECOMMENDATION} ${STORED_BRIEFING_SUMMARY}`,
    );
  });

  it("keeps es/it/de/pt why-now templates and embeds stored urgency verbatim", () => {
    for (const dictionary of [es, itMessages, de, pt]) {
      assert.match(dictionary.opportunities.detail.whyNowUrgency, /\{value\}/);
      assert.notEqual(
        dictionary.opportunities.detail.whyNowUrgency,
        en.opportunities.detail.whyNowUrgency,
      );
    }
    const opportunity = sampleOpportunity({ urgency: STORED_URGENCY });
    for (const dictionary of [es, itMessages, de, pt]) {
      const summary = getLocalizedWhyNowSummary(
        dictionary,
        opportunity,
        STORED_BRIEFING_SUMMARY,
      );
      assert.match(summary ?? "", new RegExp(STORED_URGENCY));
      assert.match(summary ?? "", new RegExp(STORED_RECOMMENDATION));
      assert.match(summary ?? "", new RegExp(STORED_BRIEFING_SUMMARY));
      assert.doesNotMatch(summary ?? "", /Urgency is /);
    }
  });

  it("keeps generated reason/recommendation verbatim and does not change domain tokens", () => {
    const opportunity = sampleOpportunity({
      recommended_action: null,
      reason: STORED_RATIONALE,
    });
    const english = buildWhyNowSummary(opportunity, null);
    assert.equal(english, `Urgency is ${STORED_URGENCY}.`);
    const reasonOnly = sampleOpportunity({
      urgency: null,
      recommended_action: null,
      ai_recommendation: null,
      reason: STORED_RATIONALE,
    });
    assert.equal(buildWhyNowSummary(reasonOnly, null), STORED_RATIONALE);
    assert.equal(
      getLocalizedWhyNowSummary(fr, reasonOnly, null),
      STORED_RATIONALE,
    );
    assert.equal(
      classifyOpportunityPriority(sampleOpportunity({ score: 80, status: "pending" })),
      classifyOpportunityPriority(sampleOpportunity({ score: 80, status: "pending" })),
    );
    const helper = read("lib/opportunityPriority.ts");
    assert.doesNotMatch(helper, /tenantI18n|getTenantLocalization/);
    const presentation = read("lib/tenantI18n/opportunityPresentation.ts");
    assert.match(presentation, /getLocalizedWhyNowSummary/);
    assert.match(presentation, /buildWhyNowSummary/);
  });
});

describe("V31 L3.7 tenant opportunities + briefings — asset chrome", () => {
  it("passes localized DeploymentAssets and StrategicAssetBlueprint chrome from Opportunity and Briefing pages", () => {
    const opportunityPage = read("app/opportunities/[id]/page.tsx");
    const briefingPage = read("app/briefings/[id]/page.tsx");
    assert.match(opportunityPage, /getOpportunityDeploymentAssetsChrome\(messages\)/);
    assert.match(
      opportunityPage,
      /getOpportunityStrategicAssetBlueprintChrome\(messages\)/,
    );
    assert.match(briefingPage, /getBriefingDeploymentAssetsChrome\(messages\)/);
    assert.match(briefingPage, /getBriefingStrategicAssetBlueprintChrome\(messages\)/);
    assert.notEqual(
      fr.opportunities.detail.deploymentAssetsHelp,
      en.opportunities.detail.deploymentAssetsHelp,
    );
    assert.notEqual(
      fr.briefings.detail.blueprintHelp,
      en.briefings.detail.blueprintHelp,
    );
  });

  it("keeps English asset chrome defaults when no chrome props are supplied", () => {
    const deployment = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: [
          {
            title: STORED_ASSET_TITLE,
            objective: "Generated objective must remain verbatim.",
            content: STORED_ASSET_BODY,
          },
        ],
      }),
    );
    assert.match(deployment, /Deployment Assets/);
    assert.match(deployment, /Ready-to-use content generated from Athena/);
    assert.match(deployment, new RegExp(STORED_ASSET_TITLE));
    const cards = buildDeploymentAssetCards([
      {
        title: STORED_ASSET_TITLE,
        objective: "Generated objective must remain verbatim.",
        content: STORED_ASSET_BODY,
      },
    ]);
    assert.equal(cards[0]?.text, STORED_ASSET_BODY);
    assert.equal(cards[0]?.label, STORED_ASSET_TITLE);

    const blueprint = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, {
        blueprint: sampleBlueprint({ asset_title: "" }),
      }),
    );
    assert.match(blueprint, /Strategic Output/);
    assert.match(blueprint, /Strategic Asset Blueprint/);
    assert.match(blueprint, /Ready to Produce/);
    assert.match(blueprint, /Asset Overview/);
    assert.match(blueprint, /Untitled Asset/);
    assert.match(blueprint, /Business goal/);
    assert.match(blueprint, /Image Prompt/);
    assert.match(blueprint, /Generated business goal must remain verbatim/);
    const source = read("components/assetBlueprints/StrategicAssetBlueprint.tsx");
    assert.match(source, /text=\{imagePromptText\}/);
    assert.match(source, /text=\{blueprint\.social_prompt\}/);
    assert.match(source, /text=\{blueprint\.trend_social_prompt\}/);
    assert.match(source, /text=\{blueprint\.notes\}/);
    assert.doesNotMatch(source, /translatePrompt|localizeBlueprint/);
  });

  it("localizes Opportunity/Briefing asset chrome and keeps generated asset content verbatim", () => {
    const deployment = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: [
          {
            title: STORED_ASSET_TITLE,
            objective: "Generated objective must remain verbatim.",
            content: STORED_ASSET_BODY,
          },
        ],
        chrome: getOpportunityDeploymentAssetsChrome(fr),
      }),
    );
    assert.match(deployment, /Deployment Assets/);
    assert.match(deployment, /Contenu prêt à l’emploi/);
    assert.doesNotMatch(deployment, /Ready-to-use content generated from Athena/);
    assert.match(deployment, new RegExp(STORED_ASSET_TITLE));
    const cards = buildDeploymentAssetCards([
      {
        title: STORED_ASSET_TITLE,
        objective: "Generated objective must remain verbatim.",
        content: STORED_ASSET_BODY,
      },
    ]);
    assert.equal(cards[0]?.text, STORED_ASSET_BODY);
    assert.equal(cards[0]?.label, STORED_ASSET_TITLE);

    const briefingDeployment = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: [
          {
            title: STORED_ASSET_TITLE,
            objective: "Generated objective must remain verbatim.",
            content: STORED_ASSET_BODY,
          },
        ],
        chrome: getBriefingDeploymentAssetsChrome(es),
      }),
    );
    assert.match(briefingDeployment, /Contenido listo para usar/);
    assert.match(briefingDeployment, new RegExp(STORED_ASSET_TITLE));

    const blueprint = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, {
        blueprint: sampleBlueprint(),
        chrome: getOpportunityStrategicAssetBlueprintChrome(fr),
      }),
    );
    assert.match(blueprint, /Livrable stratégique/);
    assert.match(blueprint, /Strategic Asset Blueprint/);
    assert.match(blueprint, /Prêt à produire/);
    assert.match(blueprint, /Prompt image/);
    assert.doesNotMatch(blueprint, /Ready to Produce/);
    assert.doesNotMatch(blueprint, /Untitled Asset/);
    assert.match(blueprint, new RegExp(STORED_BLUEPRINT_TITLE));
    assert.match(blueprint, /Generated business goal must remain verbatim/);
    assert.match(blueprint, /Generated audience must remain verbatim/);

    const briefingBlueprint = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, {
        blueprint: sampleBlueprint(),
        chrome: getBriefingStrategicAssetBlueprintChrome(de),
      }),
    );
    assert.match(briefingBlueprint, /Strategisches Ergebnis/);
    assert.match(briefingBlueprint, /Bild-Prompt/);
    assert.match(briefingBlueprint, new RegExp(STORED_BLUEPRINT_TITLE));
  });

  it("does not import Opportunity/Briefing chrome builders into shared EI workspace", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.doesNotMatch(workspace, /getOpportunityDeploymentAssetsChrome/);
    assert.doesNotMatch(workspace, /getBriefingDeploymentAssetsChrome/);
    assert.doesNotMatch(workspace, /getOpportunityStrategicAssetBlueprintChrome/);
    assert.doesNotMatch(workspace, /getBriefingStrategicAssetBlueprintChrome/);
    assert.doesNotMatch(workspace, /tenantI18n\/opportunityPresentation/);
    assert.doesNotMatch(workspace, /getTenantLocalization|getTenantMessages/);
    assert.match(workspace, /chrome=\{assetChrome\}/);
  });

  it("keeps shared asset components free of tenantI18n imports", () => {
    for (const file of [
      "components/deployment/DeploymentAssets.tsx",
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
      "components/assetBlueprints/CollapsiblePromptBlock.tsx",
      "components/deployment/CopyButton.tsx",
      "components/deployment/ContinueButton.tsx",
      "lib/opportunityPriority.ts",
      "lib/blueprintReadiness.ts",
    ]) {
      assert.doesNotMatch(read(file), /tenantI18n|getTenantLocalization|navigator\.language/);
    }
  });
});

describe("V31 L3.7 tenant opportunities + briefings — nested copy chrome", () => {
  it("localizes Opportunity and Briefing Deployment Asset copy chrome", () => {
    const opportunityPage = read("app/opportunities/[id]/page.tsx");
    const briefingPage = read("app/briefings/[id]/page.tsx");
    const deployment = read("components/deployment/DeploymentAssets.tsx");
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.match(opportunityPage, /getOpportunityDeploymentAssetsChrome\(messages\)/);
    assert.match(briefingPage, /getBriefingDeploymentAssetsChrome\(messages\)/);
    assert.match(deployment, /copyChrome=\{chrome\?\.copy\}/);
    assert.match(block, /chrome=\{copyChrome\}/);

    const opportunityCopy = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: STORED_ASSET_TITLE,
        description: "Generated objective must remain verbatim.",
        text: STORED_ASSET_BODY,
        defaultOpen: true,
        copyChrome: getOpportunityDeploymentAssetsChrome(fr).copy,
      }),
    );
    assert.match(opportunityCopy, />Copier</);
    assert.match(opportunityCopy, />Continuer</);
    assert.doesNotMatch(opportunityCopy, />Copy</);
    assert.doesNotMatch(opportunityCopy, />Continue</);
    assert.match(opportunityCopy, new RegExp(STORED_ASSET_TITLE));
    assert.match(opportunityCopy, new RegExp(STORED_ASSET_BODY));

    const briefingCopy = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: STORED_ASSET_TITLE,
        text: STORED_ASSET_BODY,
        defaultOpen: true,
        copyChrome: getBriefingDeploymentAssetsChrome(es).copy,
      }),
    );
    assert.match(briefingCopy, />Copiar</);
    assert.match(briefingCopy, />Continuar</);
    assert.doesNotMatch(briefingCopy, />Copy</);
    assert.match(briefingCopy, new RegExp(STORED_ASSET_BODY));
  });

  it("localizes Opportunity and Briefing Strategic Asset Blueprint copy chrome", () => {
    const opportunityPage = read("app/opportunities/[id]/page.tsx");
    const briefingPage = read("app/briefings/[id]/page.tsx");
    const blueprint = read("components/assetBlueprints/StrategicAssetBlueprint.tsx");
    assert.match(
      opportunityPage,
      /getOpportunityStrategicAssetBlueprintChrome\(messages\)/,
    );
    assert.match(briefingPage, /getBriefingStrategicAssetBlueprintChrome\(messages\)/);
    assert.equal((blueprint.match(/copyChrome=\{chrome\?\.copy\}/g) ?? []).length, 5);

    const opportunityCopy = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: "Image Prompt",
        text: STORED_BLUEPRINT_PROMPT,
        defaultOpen: true,
        copyChrome: getOpportunityStrategicAssetBlueprintChrome(fr).copy,
      }),
    );
    assert.match(opportunityCopy, />Copier</);
    assert.match(opportunityCopy, />Continuer</);
    assert.match(opportunityCopy, new RegExp(STORED_BLUEPRINT_PROMPT));

    const briefingCopy = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: "Image Prompt",
        text: STORED_BLUEPRINT_PROMPT,
        defaultOpen: true,
        copyChrome: getBriefingStrategicAssetBlueprintChrome(de).copy,
      }),
    );
    assert.match(briefingCopy, />Kopieren</);
    assert.match(briefingCopy, />Weiter</);
    assert.match(briefingCopy, new RegExp(STORED_BLUEPRINT_PROMPT));
  });

  it("keeps English copy defaults when localized chrome is omitted", () => {
    const english = renderToStaticMarkup(
      createElement(CopyButton, { text: STORED_ASSET_BODY }),
    );
    assert.match(english, />Copy</);
    assert.match(english, />Continue</);
    assert.doesNotMatch(english, />Copier</);
    assert.doesNotMatch(english, />Done</);

    const openDefault = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: STORED_ASSET_TITLE,
        text: STORED_ASSET_BODY,
        defaultOpen: true,
      }),
    );
    assert.match(openDefault, />Copy</);
    assert.match(openDefault, />Continue</);
    assert.match(openDefault, new RegExp(STORED_ASSET_BODY));

    const source = read("components/deployment/CopyButton.tsx");
    assert.match(source, /copy: chrome\?\.copy \?\? "Copy"/);
    assert.match(source, /copied: chrome\?\.copied \?\? "Copied"/);
    assert.match(source, /done: chrome\?\.done \?\? "Done"/);
    assert.match(source, /continue: chrome\?\.continue \?\? "Continue"/);
    assert.doesNotMatch(source, /tenantI18n|getTenantLocalization|navigator\.language/);
    const continueSource = read("components/deployment/ContinueButton.tsx");
    assert.match(continueSource, /label \?\? "Continue"/);
    assert.doesNotMatch(
      continueSource,
      /tenantI18n|getTenantLocalization|navigator\.language/,
    );
  });

  it("localizes French copy-state chrome and keeps es/it/de/pt keys", () => {
    const french = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_ASSET_BODY,
        initiallyDone: true,
        chrome: getAssetCopyChrome(fr),
      }),
    );
    assert.match(french, />Copier</);
    assert.match(french, />Continuer</);
    assert.match(french, />Terminé</);
    assert.doesNotMatch(french, />Copy</);
    assert.doesNotMatch(french, />Done</);
    assert.equal(fr.copyChrome.done, "Terminé");
    assert.equal(fr.common.copied, "Copié");
    assert.notEqual(fr.copyChrome.continue, en.copyChrome.continue);
    assert.notEqual(fr.copyChrome.copyFailed, en.copyChrome.copyFailed);

    for (const dictionary of [es, itMessages, de, pt]) {
      assert.ok(dictionary.copyChrome.done.trim());
      assert.ok(dictionary.copyChrome.continue.trim());
      assert.ok(dictionary.copyChrome.copyFailed.trim());
      assert.ok(dictionary.copyChrome.saveDoneFailed.trim());
      assert.ok(dictionary.copyChrome.copyToClipboard.trim());
      assert.notEqual(dictionary.copyChrome.done, en.copyChrome.done);
      assert.notEqual(dictionary.copyChrome.continue, en.copyChrome.continue);
    }
    assert.equal(getAssetCopyChrome(es).copy, es.common.copy);
    assert.equal(getAssetCopyChrome(itMessages).continue, itMessages.copyChrome.continue);
    assert.equal(getAssetCopyChrome(de).done, de.copyChrome.done);
    assert.equal(getAssetCopyChrome(pt).copyFailed, pt.copyChrome.copyFailed);
  });

  it("keeps copied generated asset and blueprint content verbatim", () => {
    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(copy, /const value = text \?\? ""/);
    assert.match(copy, /await writeClipboardText\(value\)/);
    assert.doesNotMatch(copy, /translateText|localizeCopied|localizeContent/);
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.match(block, /text=\{content\}/);
    const cards = buildDeploymentAssetCards([
      {
        title: STORED_ASSET_TITLE,
        objective: "Generated objective must remain verbatim.",
        content: STORED_ASSET_BODY,
      },
    ]);
    assert.equal(cards[0]?.text, STORED_ASSET_BODY);
    const blueprint = read("components/assetBlueprints/StrategicAssetBlueprint.tsx");
    assert.match(blueprint, /text=\{imagePromptText\}/);
    assert.match(blueprint, /text=\{blueprint\.social_prompt\}/);
    assert.match(blueprint, /text=\{blueprint\.notes\}/);
    const rendered = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_BLUEPRINT_PROMPT,
        chrome: getAssetCopyChrome(fr),
      }),
    );
    assert.doesNotMatch(rendered, new RegExp(STORED_BLUEPRINT_PROMPT));
    assert.match(rendered, />Copier</);
  });

  it("does not change copy or clipboard behavior semantics", () => {
    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(copy, /ACK_MS = 2000/);
    assert.match(copy, /writeClipboardText/);
    assert.match(copy, /\/api\/asset-interactions/);
    assert.match(copy, /sourceType: tracking\.sourceType/);
    assert.match(copy, /assetType: tracking\.assetType/);
    assert.match(copy, /if \(!tracking\)/);
    assert.match(copy, /response\.ok && payload\.ok/);
    const continueSource = read("components/deployment/ContinueButton.tsx");
    assert.match(continueSource, /continueInExternalWorkspace/);
    assert.match(continueSource, /showToast\(result\.toast\)/);
    const sequence = read(
      "services/assetContinuation/continueInExternalWorkspace.ts",
    );
    assert.match(sequence, /writeClipboard\(value\)/);
    assert.doesNotMatch(sequence, /tenantI18n|getAssetCopyChrome/);
  });

  it("keeps shared tag controls tenant-neutral after EI copy chrome wiring", () => {
    const tags = read("components/deployment/AssetUsageTagControls.tsx");
    assert.match(tags, /ASSET_USAGE_TAG_LABELS/);
    assert.doesNotMatch(tags, /tenantI18n|copyChrome/);
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.doesNotMatch(workspace, /getTenantLocalization|getTenantMessages/);
    assert.match(workspace, /chrome=\{assetChrome\}/);
  });
});

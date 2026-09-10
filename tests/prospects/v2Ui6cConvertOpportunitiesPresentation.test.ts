/**
 * V2-UI-6C — Convert Opportunities presentation.
 * Source-contract checks only. Does not generate, persist, or alter backend tokens.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isTenantNavActive,
  localizeTenantNav,
} from "../../components/dashboard/tenantNavigation";
import {
  deriveProspectLibrarySummary,
  formatProspectLibrarySummary,
} from "../../lib/prospects/prospectLibrarySummary";
import { groupProspectOutreachAssets } from "../../lib/prospects/prospectOutreachAssetGroups";
import { PROSPECT_LIFECYCLE_STATUSES } from "../../services/prospects/prospectLifecycle";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
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

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const CONVERT_ROUTES = [
  ["app/prospects/page.tsx", '/prospects"'],
  ["app/prospects/import/page.tsx", "/prospects/import"],
  ["app/prospects/find/page.tsx", "/prospects/find"],
  ["app/prospects/[id]/page.tsx", "`/prospects/${id}`"],
] as const;

describe("V2-UI-6C Convert Opportunities presentation", () => {
  it("wraps Convert Opportunities routes in TenantAppShell and removes standalone chrome", () => {
    for (const [file, pathFragment] of CONVERT_ROUTES) {
      const source = read(file);
      assert.match(source, /TenantAppShell/);
      assert.match(
        source,
        new RegExp(pathFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      assert.doesNotMatch(source, /AthenaBrandLink/);
      assert.doesNotMatch(source, /TenantBackLink/);
    }
  });

  it("activates Convert Opportunities on library, import, find, and detail routes", () => {
    const items = localizeTenantNav(en);
    const convert = items.find((item) => item.key === "convertOpportunities");
    assert.ok(convert);
    for (const path of [
      "/prospects",
      "/prospects/import",
      "/prospects/find",
      "/prospects/abc",
    ]) {
      assert.equal(isTenantNavActive(path, convert), true, path);
    }
    assert.equal(isTenantNavActive("/personas", convert), false);
    assert.equal(isTenantNavActive("/opportunities", convert), false);
  });

  it("uses accepted Convert Opportunities landing chrome", () => {
    assert.equal(en.prospects.eyebrow, "Convert Opportunities");
    assert.equal(en.prospects.title, "Convert Opportunities");
    assert.equal(
      en.prospects.question,
      "Who should I focus on, what matters about them, and what should I do next?",
    );
    assert.equal(en.prospects.list.importCta, "Add prospect");
    const page = read("app/prospects/page.tsx");
    assert.match(page, /copy\.question/);
    assert.doesNotMatch(page, /Find businesses|Search GetOblic|Estimate/);
    assert.doesNotMatch(page, /Opportunity leaderboard|forecast|pipeline/);
  });

  it("replaces the wide operator table with cards and hides Opportunity Score", () => {
    const library = read("components/prospects/ProspectsLibraryClient.tsx");
    const card = read("components/prospects/ProspectLibraryCard.tsx");
    assert.match(library, /grid-cols-1 gap-4 md:grid-cols-2/);
    assert.doesNotMatch(library, /min-w-\[1100px\]/);
    assert.doesNotMatch(library, /sortScore|Opportunity Score/);
    assert.doesNotMatch(library, /display_opportunity_score_label/);
    assert.doesNotMatch(card, /Opportunity Score|display_opportunity_score_label/);
    assert.match(library, /Working status/);
    assert.match(card, /getProspectWorkingStatusLabel/);
    assert.match(card, /getProspectIntelligenceStatusLabel/);
    assert.match(library, /href=\{`\/prospects\/\$\{prospect\.id\}`\}/);
    assert.doesNotMatch(library, /Proposal|Customer/);
  });

  it("preserves the exact persisted lifecycle set without Proposal or Customer", () => {
    assert.deepEqual([...PROSPECT_LIFECYCLE_STATUSES], [
      "New",
      "Reviewing",
      "Outreach Planned",
      "Contacted",
      "Follow-up",
      "Engaged",
      "Qualified",
      "Not a Fit",
      "Completed",
    ]);
    assert.ok(!PROSPECT_LIFECYCLE_STATUSES.includes("Proposal" as never));
    assert.ok(!PROSPECT_LIFECYCLE_STATUSES.includes("Customer" as never));
  });

  it("keeps working status visible on the mobile card contract", () => {
    const library = read("components/prospects/ProspectLibraryCard.tsx");
    const working = library.slice(
      library.indexOf("getProspectWorkingStatusLabel"),
    );
    assert.doesNotMatch(
      working.slice(0, 400),
      /hidden lg:block|hidden sm:block/,
    );
  });

  it("keeps GetOblic discovery as Find opportunities without claim or Estimate chrome", () => {
    const library = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(library, /\/prospects\/find/);
    assert.match(library, /findOpportunitiesCta/);
    assert.doesNotMatch(library, /Search GetOblic|Find businesses/);
    assert.doesNotMatch(library, /claim listing|allocation remaining|KB sync/);
    assert.doesNotMatch(library, /\/licensee\/estimate/);

    const importPage = read("app/prospects/import/page.tsx");
    const importForms = read("components/prospects/ProspectImportForms.tsx");
    for (const source of [importPage, importForms]) {
      assert.doesNotMatch(source, /Search GetOblic|Find businesses/);
      assert.doesNotMatch(source, /claim listing|allocation remaining|KB sync/);
      assert.doesNotMatch(source, /\/licensee\/estimate/);
      assert.doesNotMatch(source, /GetOblicOpportunityDiscovery/);
    }

    const detail = read("app/prospects/[id]/page.tsx");
    assert.doesNotMatch(detail, /GetOblicOpportunityDiscovery/);
    assert.doesNotMatch(detail, /\/api\/getoblic-directory\/search/);
    assert.match(detail, /GetOblicWebsiteCompletionCard/);
    assert.doesNotMatch(detail, /claim listing|allocation remaining|KB sync/);
    assert.doesNotMatch(detail, /\/licensee\/estimate/);
  });

  it("does not invent a persisted next-action task", () => {
    const detail = read("app/prospects/[id]/page.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const intelligence = read(
      "components/prospects/ProspectIntelligenceSections.tsx",
    );
    for (const source of [detail, workspace, intelligence]) {
      assert.doesNotMatch(source, /Next task|Next action due|Assigned action/);
      assert.doesNotMatch(source, /marked done automatically/);
    }
    const recommendation = read(
      "components/prospects/ProspectAthenaRecommendation.tsx",
    );
    assert.match(recommendation, /recommended_action/);
    assert.match(recommendation, /convert\.recommendedHelper/);
  });

  it("adopts TenantAppShell on import with manual first and CSV collapsed", () => {
    const page = read("app/prospects/import/page.tsx");
    const forms = read("components/prospects/ProspectImportForms.tsx");
    assert.match(page, /copy\.import\.createTitle/);
    assert.match(forms, /copy\.manualTitle/);
    const manualIndex = forms.indexOf("copy.manualTitle");
    const csvIndex = forms.indexOf("copy.csvTitle");
    assert.ok(manualIndex > 0 && csvIndex > manualIndex);
    assert.match(forms, /lg:max-w-6xl/);
    assert.match(forms, /moreAboutTitle/);
    assert.match(forms, /advancedSystemTitle/);
    assert.match(forms, /body: JSON\.stringify\(manual\)/);
    assert.match(forms, /\["linkedin", "LinkedIn URL"\]/);
    assert.doesNotMatch(forms, /lg:grid-cols-2">\s*<section/);
  });

  it("widens expanded Add one business and two-columns essential fields at lg+", () => {
    const forms = read("components/prospects/ProspectImportForms.tsx");
    const block = read("components/prospects/ProspectCreationBlock.tsx");
    const csv = read("components/prospects/ProspectCsvImport.tsx");

    const manualSection = forms.slice(
      forms.indexOf("copy.manualTitle") > 0
        ? forms.lastIndexOf("<section", forms.indexOf("copy.manualTitle"))
        : 0,
      forms.indexOf("<ProspectCreationBlock"),
    );
    assert.match(
      manualSection,
      /mx-auto w-full min-w-0 max-w-3xl[\s\S]*lg:max-w-6xl/,
    );
    assert.match(
      manualSection,
      /grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2/,
    );
    assert.match(manualSection, /PRIMARY_FULL_WIDTH_FIELD_KEYS\.has\(key\) \? "lg:col-span-2"/);
    assert.match(forms, /\["business_name", "website", "decision_maker"\]/);
    assert.match(
      manualSection,
      /meta\.notes[\s\S]*lg:col-span-2[\s\S]*meta\.additionalContext/,
    );
    assert.match(manualSection, /className="block min-w-0 text-sm text-white\/50 lg:col-span-2"/);

    assert.match(forms, /useState\(false\)/);
    assert.match(forms, /defaultOpen=\{false\}/);
    assert.match(forms, /moreAboutTitle/);
    assert.match(forms, /advancedSystemTitle/);
    assert.match(forms, /open \? "lg:col-span-2"/);

    const csvBlock = forms.slice(forms.indexOf("<ProspectCreationBlock"));
    assert.match(csvBlock, /copy\.csvTitle/);
    assert.match(csvBlock, /panelId="prospect-import-csv"/);
    assert.match(csvBlock, /className="mx-auto w-full min-w-0 max-w-3xl"/);
    assert.doesNotMatch(csvBlock, /lg:max-w-6xl/);
    assert.doesNotMatch(csvBlock, /defaultOpen=\{true\}/);

    assert.match(block, /defaultOpen = false/);
    assert.match(block, /expandedClassName/);
    assert.doesNotMatch(csv, /lg:max-w-6xl/);
    assert.doesNotMatch(csv, /lg:grid-cols-2/);

    for (const key of [
      "business_name",
      "website",
      "decision_maker",
      "first_name",
      "last_name",
      "job_title",
      "email",
      "phone",
      "category",
      "industry",
      "city",
      "state",
      "country",
      "address",
      "whatsapp_number",
      "linkedin",
      "facebook",
      "instagram",
      "google_business_url",
      "company_size",
      "revenue",
      "employee_count",
      "technologies",
      "pain_points",
      "source",
      "timezone",
      "external_contact_id",
      "getoblic_type",
      "notes",
      "additional_context",
      "ads_content",
    ]) {
      assert.match(forms, new RegExp(key));
    }
    assert.match(forms, /body: JSON\.stringify\(manual\)/);
  });

  it("redesigns prospect detail around the accepted question and CTA state machine", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const header = read("components/prospects/ProspectDetailHeader.tsx");
    const sections = read(
      "components/prospects/ProspectIntelligenceSections.tsx",
    );
    assert.match(page, /copy\.detail\.question/);
    assert.match(page, /hasCurrentVersion=\{hasCurrentVersion\}/);
    assert.match(page, /intelligenceStatus=\{intelligenceReadiness\}/);
    assert.match(page, /ProspectDetailHeader/);
    assert.match(page, /ProspectIntelligenceScore/);
    assert.match(page, /computeProspectIntelligenceCompleteness/);
    assert.doesNotMatch(page, /TractionPageHeader/);
    assert.doesNotMatch(page, /DiscussionWorkflowStrip/);
    assert.doesNotMatch(page, /workflowProgress|workflowAnalysis/);
    assert.doesNotMatch(page, /HeaderMetric|xl:grid-cols-4/);
    assert.doesNotMatch(page, /copy\.detail\.opportunityScore/);
    assert.doesNotMatch(header, /opportunityScore|Opportunity Score/);
    assert.match(page, /savedBanner|processingBanner|failedBanner/);
    assert.doesNotMatch(page, /ProspectHeaderDeleteButton/);
    assert.match(page, /sourceKind="prospect"/);
    assert.match(page, /tenantMessages=\{messages\}/);
    assert.match(page, /GetOblicListingReleaseControl/);
    assert.match(sections, /ProspectExecutiveSnapshot/);
    assert.match(sections, /ProspectAthenaRecommendation/);
    assert.match(sections, /defaultOpen=\{false\}/);
    assert.doesNotMatch(page, /\/licensee\/estimate/);
  });

  it("gates workspace restructuring to sourceKind === prospect", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /isProspect && tenantMessages/);
    assert.match(workspace, /ProspectIntelligenceSections/);
    assert.match(workspace, /groupProspectOutreachAssets/);
    assert.match(workspace, /!isPersona && !isProspect/);
    assert.match(workspace, /sourceKind === "prospect"/);
    assert.match(
      workspace,
      /chrome\?\.deploymentAssetsTitle \?\? "Deployment Assets"/,
    );
    assert.match(
      workspace,
      /chrome\?\.strategicBlueprintTitle \?\? "Strategic Asset Blueprint"/,
    );
  });

  it("groups outreach drafts collapsed and other drafts collapsed", () => {
    const grouped = groupProspectOutreachAssets([
      {
        assetKey: "email_outreach",
        title: "Personalized Outreach Email",
        objective: "",
        content: "Hello",
      },
      {
        assetKey: "newsletter_idea",
        title: "Newsletter Idea",
        objective: "",
        content: "Idea",
      },
    ]);
    assert.equal(grouped.outreach.length, 1);
    assert.equal(grouped.other.length, 1);
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const outreachBlock = workspace.slice(
      workspace.indexOf("outreach-drafts-"),
      workspace.indexOf("other-drafts-"),
    );
    assert.match(outreachBlock, /defaultOpen=\{false\}/);
    assert.match(workspace, /otherDrafts/);
    assert.doesNotMatch(outreachBlock, /defaultOpen\s*$/);
  });

  it("derives factual summary only from loaded rows", () => {
    const summary = deriveProspectLibrarySummary([
      { display_lifecycle_status: "New", display_status: "Ready" },
      { display_lifecycle_status: "Follow-up", display_status: "Processing" },
      { display_lifecycle_status: "Engaged", display_status: "Ready" },
    ]);
    assert.deepEqual(summary, {
      total: 3,
      newCount: 1,
      followUpCount: 1,
      ready: 2,
      generating: 1,
    });
    const label = formatProspectLibrarySummary(
      summary,
      {
        prospectsOne: "1 prospect",
        prospectsMany: "{count} prospects",
        newOne: "1 new",
        newMany: "{count} new",
        followUpOne: "1 follow-up",
        followUpMany: "{count} follow-up",
        readyOne: "1 with intelligence ready",
        readyMany: "{count} with intelligence ready",
        generatingOne: "1 still generating",
        generatingMany: "{count} still generating",
      },
      interpolateTenantMessage,
    );
    assert.equal(
      label,
      "3 prospects · 1 new · 1 follow-up · 2 with intelligence ready · 1 still generating",
    );
  });

  it("aligns new Convert chrome keys across six dictionaries", () => {
    const required = [
      "prospects.question",
      "prospects.convert.whatAthenaRecommends",
      "prospects.convert.outreachDrafts",
      "prospects.list.createFirstCta",
      "prospects.import.createTitle",
      "prospects.detail.refreshIntelligence",
      "prospects.detail.savedBanner",
      "prospects.list.findOpportunitiesCta",
      "prospects.find.title",
      "prospects.websiteCompletion.heading",
      "prospects.websiteCompletion.addWebsiteToStartResearch",
      "prospects.convert.saved",
      "prospects.readiness.saved",
      "prospects.score.label",
      "prospects.score.help",
      "prospects.detail.askAthena",
      "prospects.detail.openWebsite",
      "prospects.detail.editProfile",
    ];
    const canonical = collectKeyPaths(en);
    for (const path of required) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        required.filter((item) => !paths.includes(item)),
        [],
        `${language} missing Convert keys`,
      );
    }
    assert.notEqual(fr.prospects.list.importCta, en.prospects.list.importCta);
    assert.notEqual(es.prospects.title, en.prospects.title);
    assert.notEqual(de.prospects.convert.whyMatters, en.prospects.convert.whyMatters);
  });

  it("keeps Ask Athena read-only and Add information queue semantics", () => {
    const conversation = read(
      "components/prospects/ProspectConversationPanel.tsx",
    );
    const append = read(
      "components/prospects/AppendProspectInformationForm.tsx",
    );
    assert.match(conversation, /sessionStorage/);
    assert.match(conversation, /does not change the saved prospect intelligence/);
    assert.doesNotMatch(conversation, /onApply|Apply to intelligence/);
    assert.match(append, /`\/api\/prospects\/\$\{prospectId\}\/updates`/);
    assert.match(append, /trackQueuedGeneration\(baseline\)/);
    assert.match(append, /JSON\.stringify\(\{ body \}\)/);
  });

  it("keeps website research eligibility-gated and prospect-specific", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const button = read(
      "components/prospects/ProspectDeepScrapeWebsiteButton.tsx",
    );
    assert.match(
      page,
      /initiallyAvailable=\{hasCurrentVersion && Boolean\(prospect\.website\)\}/,
    );
    assert.match(button, /\/api\/prospects\/\$\{props\.prospectId\}\/deep-scrape/);
    assert.doesNotMatch(page, /\/api\/identity\/.*deep-scrape/);
  });

  it("keeps Persona and Discussion workspace presentation contracts", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /isPersona/);
    assert.match(workspace, /PersonaAudienceJourney/);
    assert.match(workspace, /AthenaRecommendationRibbon/);
    assert.match(workspace, /ExecutiveIntelligenceCard/);
    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /DiscussionWorkflowStrip/);
    const personaPage = read("app/personas/[id]/page.tsx");
    assert.match(personaPage, /sourceKind="persona"/);
    assert.doesNotMatch(personaPage, /ProspectIntelligenceSections/);
  });
});

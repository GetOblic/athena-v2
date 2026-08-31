import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExecutiveIntelligenceCard } from "../../components/discussions/ExecutiveIntelligenceCard";
import { localizeDeepScrapeStage } from "../../lib/tenantI18n/deepScrapeProgress";
import {
  formatTenantDate,
  toFormattingLocale,
} from "../../lib/tenantI18n/format";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  getLocalizedPersonaLifecycleLabel,
  getLocalizedPersonaReadinessLabel,
} from "../../lib/tenantI18n/personaPresentation";
import {
  getLocalizedProspectHomepageLearning,
  getLocalizedProspectLifecycleLabel,
  getLocalizedProspectReadinessLabel,
  getLocalizedProspectVerdict,
  resolveProspectHomepageLearningKey,
} from "../../lib/tenantI18n/prospectPresentation";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";
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

const STORED_PERSONA_NAME = "Lyon Boutique Buyer";
const STORED_PROSPECT_NAME = "Maison Dupont SARL";
const STORED_EI_SUMMARY = "Generated persona assessment must remain verbatim.";
const STORED_EI_REASON = "Generated prospect reason must remain verbatim.";

function sampleAnalysis(): DiscussionAnalysis {
  return {
    id: "analysis-1",
    created_at: "2026-08-20T15:04:00.000Z",
    updated_at: "2026-08-20T15:10:00.000Z",
    discussion_id: "disc-1",
    organization_id: "org-1",
    user_id: null,
    community_id: null,
    status: "review_ready",
    summary: STORED_EI_SUMMARY,
    sentiment: "neutral",
    intent: "high",
    buyer_stage: "consideration",
    pain_points: "Generated pain points must remain verbatim.",
    opportunity_detected: true,
    opportunity_title: "Stored opportunity title",
    opportunity_reason: STORED_EI_REASON,
    recommended_action: "Generated recommended action must remain verbatim.",
    suggested_cta: "",
    risk_level: "medium",
    confidence: 82,
    strategy_key: "elevate",
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: "claude-sonnet-4",
    generation_time_ms: 12000,
    raw_json: null,
  };
}

describe("V31 L3.6 tenant personas + prospects — list chrome", () => {
  it("keeps English Persona and Prospect list chrome canonical", () => {
    assert.equal(en.personas.title, "Personas");
    assert.equal(en.personas.list.createCta, "Create or Import Personas");
    assert.equal(en.personas.list.emptyTitle, "No Personas yet");
    assert.equal(en.prospects.title, "Prospects");
    assert.equal(en.prospects.list.importCta, "Import Prospects");
    assert.equal(en.prospects.list.emptyTitle, "No prospects found.");
    const personaPage = read("app/personas/page.tsx");
    const prospectPage = read("app/prospects/page.tsx");
    assert.match(personaPage, /getTenantLocalization/);
    assert.match(prospectPage, /getTenantLocalization/);
    assert.match(personaPage, /TenantBackLink/);
    assert.match(prospectPage, /TenantBackLink/);
    assert.match(personaPage, /copy\.title/);
    assert.match(prospectPage, /copy\.title/);
  });

  it("localizes Persona and Prospect list chrome in all five non-English languages", () => {
    for (const [language, dictionary] of Object.entries(DICTIONARIES) as Array<
      [OrganizationLanguage, TenantMessages]
    >) {
      if (language === "en") continue;
      assert.notEqual(dictionary.personas.subtitle, en.personas.subtitle);
      assert.notEqual(
        dictionary.personas.list.createCta,
        en.personas.list.createCta,
      );
      assert.notEqual(dictionary.prospects.subtitle, en.prospects.subtitle);
      assert.notEqual(
        dictionary.prospects.list.importCta,
        en.prospects.list.importCta,
      );
    }
    assert.match(fr.personas.list.createCta, /Persona/i);
    assert.match(es.prospects.list.importCta, /Prospect/i);
    assert.match(itMessages.personas.list.emptyTitle, /Persona/i);
    assert.match(de.prospects.list.emptyTitle, /Prospect/i);
    assert.match(pt.personas.list.search, /Pesquis/i);
  });

  it("keeps persisted Persona and Prospect names and values verbatim", () => {
    const personaList = read("components/personas/PersonasLibraryClient.tsx");
    const prospectList = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(personaList, /persona\.display_label/);
    assert.match(personaList, /persona\.short_description/);
    assert.match(prospectList, /prospect\.business_name/);
    assert.doesNotMatch(personaList, /translatePersona|localizePersonaName/);
    assert.doesNotMatch(prospectList, /translateProspect|localizeBusinessName/);
    assert.doesNotMatch(fr.personas.title, new RegExp(STORED_PERSONA_NAME));
    assert.doesNotMatch(fr.prospects.title, new RegExp(STORED_PROSPECT_NAME));
  });

  it("keeps stored filter and status tokens canonical", () => {
    const personaList = read("components/personas/PersonasLibraryClient.tsx");
    const prospectList = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(personaList, /<option key=\{value\} value=\{value\}>/);
    assert.match(prospectList, /<option key=\{value\} value=\{value\}>/);
    assert.match(personaList, /persona\.display_lifecycle_status !== status/);
    assert.equal(getLocalizedPersonaLifecycleLabel(fr, "In Use"), "En usage");
    assert.equal(getLocalizedProspectLifecycleLabel(fr, "Follow-up"), "Suivi");
    assert.equal(getLocalizedPersonaLifecycleLabel(en, "In Use"), "In Use");
    assert.equal(
      getLocalizedProspectLifecycleLabel(en, "Outreach Planned"),
      "Outreach Planned",
    );
  });
});

describe("V31 L3.6 tenant personas + prospects — detail chrome", () => {
  it("localizes Persona detail chrome and keeps stored values verbatim", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /getTenantLocalization/);
    assert.match(page, /TenantBackLink/);
    assert.match(page, /copy\.detail\.eyebrow/);
    assert.match(page, /\{displayLabel\}/);
    assert.match(page, /\{persona\.short_description\}/);
    assert.match(page, /\{persona\.ads_content\}/);
    assert.match(page, /chrome=\{copy\.metadata\}/);
    assert.doesNotMatch(page, /translatePersona|localizeDisplayLabel/);
    assert.equal(en.personas.detail.eyebrow, "Persona");
    assert.notEqual(fr.personas.detail.summary, en.personas.detail.summary);
  });

  it("localizes Prospect detail chrome and keeps persisted values verbatim", () => {
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /getTenantLocalization/);
    assert.match(page, /TenantBackLink/);
    assert.match(page, /copy\.detail\.eyebrow/);
    assert.match(page, /\{prospect\.business_name\}/);
    assert.match(page, /\{prospect\.ads_content\}/);
    assert.match(page, /chrome=\{copy\.metadata\}/);
    assert.doesNotMatch(page, /translateProspect|localizeBusinessName/);
    assert.equal(en.prospects.detail.eyebrow, "Prospect Intelligence");
    assert.notEqual(fr.prospects.detail.subtitle, en.prospects.detail.subtitle);
  });

  it("keeps edit/save payloads verbatim", () => {
    const personaMeta = read("components/personas/PersonaMetadataEditor.tsx");
    const prospectMeta = read("components/prospects/ProspectMetadataEditor.tsx");
    assert.match(personaMeta, /body: JSON\.stringify\(form\)/);
    assert.match(prospectMeta, /body: JSON\.stringify\(form\)/);
    assert.match(personaMeta, /method: "PATCH"/);
    assert.match(prospectMeta, /method: "PATCH"/);
    assert.doesNotMatch(personaMeta, /translateForm|localizeFieldValue/);
    assert.doesNotMatch(prospectMeta, /translateForm|localizeFieldValue/);
    assert.match(prospectMeta, /<option key=\{value\} value=\{value\}>/);
    assert.match(prospectMeta, /<option value="">\{chrome\?\.notSet \?\? "Not set"\}<\/option>/);
  });

  it("localizes delete confirmation without embedding stored names", () => {
    assert.doesNotMatch(en.personas.detail.deleteConfirm, /\{name\}|\{persona\}/);
    assert.doesNotMatch(en.prospects.detail.deleteConfirm, /\{name\}|\{prospect\}/);
    assert.doesNotMatch(
      fr.personas.detail.deleteConfirm,
      new RegExp(STORED_PERSONA_NAME),
    );
    assert.doesNotMatch(
      fr.prospects.detail.deleteConfirm,
      new RegExp(STORED_PROSPECT_NAME),
    );
    const personaDelete = read("components/personas/PersonaHeaderDeleteButton.tsx");
    const prospectDelete = read(
      "components/prospects/ProspectHeaderDeleteButton.tsx",
    );
    assert.match(
      personaDelete,
      /Delete this Persona permanently\? The Persona, its linked intelligence Discussion, and generated intelligence will be removed\. This cannot be undone\./,
    );
    assert.match(
      prospectDelete,
      /Delete this Prospect permanently\? The Prospect, its linked Discussion, and generated intelligence will be removed\. This cannot be undone\./,
    );
  });

  it("localizes status and stage presentation only", () => {
    assert.equal(
      getLocalizedPersonaLifecycleLabel(fr, "Researching"),
      "Recherche",
    );
    assert.equal(
      getLocalizedPersonaReadinessLabel(fr, "Profile Created"),
      "Profil créé",
    );
    assert.equal(
      getLocalizedProspectLifecycleLabel(es, "Outreach Planned"),
      "Prospección planificada",
    );
    assert.equal(
      getLocalizedProspectReadinessLabel(de, "Ready"),
      "Bereit",
    );
    assert.equal(
      getLocalizedProspectVerdict(fr, "Worth pursuing"),
      fr.prospects.executive.verdictWorthPursuing,
    );
    assert.equal(getLocalizedPersonaLifecycleLabel(fr, "Custom Token"), "Custom Token");
    const personaLifecycle = read(
      "components/personas/PersonaLifecycleStatusControl.tsx",
    );
    const prospectLifecycle = read(
      "components/prospects/ProspectLifecycleStatusControl.tsx",
    );
    assert.match(personaLifecycle, /value=\{option\}/);
    assert.match(prospectLifecycle, /value=\{option\}/);
    assert.match(
      personaLifecycle,
      /body: JSON\.stringify\(\{ lifecycle_status: nextStatus \}\)/,
    );
    assert.match(
      prospectLifecycle,
      /body: JSON\.stringify\(\{ lifecycle_status: nextStatus \}\)/,
    );
    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(prospectPage, /clientStatusLabel: lifecycleStatus/);
  });

  it("formats Persona and Prospect dates with the tenant locale", () => {
    const personaPage = read("app/personas/[id]/page.tsx");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(personaPage, /formatDate\(persona\.created_at, language\)/);
    assert.match(personaPage, /return formatTenantDate\(value, language\)/);
    assert.match(prospectPage, /formatTenantDate\(prospect\.created_at, language\)/);
    assert.doesNotMatch(personaPage, /toLocaleDateString\("en-US"/);
    assert.doesNotMatch(prospectPage, /toLocaleDateString\("en-US"/);
    assert.equal(toFormattingLocale("fr"), "fr-FR");
    assert.equal(toFormattingLocale("pt"), "pt-PT");
    const stamp = "2026-08-20T15:04:00.000Z";
    assert.ok(formatTenantDate(stamp, "fr"));
    assert.ok(formatTenantDate(stamp, "de"));
  });
});

describe("V31 L3.6 tenant personas + prospects — conversation", () => {
  it("localizes conversation chrome and example prompts", () => {
    const personaPanel = read("components/personas/PersonaConversationPanel.tsx");
    const prospectPanel = read(
      "components/prospects/ProspectConversationPanel.tsx",
    );
    assert.match(personaPanel, /chrome\?\.title \?\? "Ask Athena about this Persona"/);
    assert.match(personaPanel, /chrome\?\.send \?\? "Send"/);
    assert.match(prospectPanel, /chrome\?: ProspectConversationChrome/);
    assert.equal(
      en.personas.conversation.example1,
      "What motivates this Persona most strongly?",
    );
    assert.notEqual(
      fr.personas.conversation.example1,
      en.personas.conversation.example1,
    );
    assert.notEqual(
      fr.prospects.conversation.example1,
      en.prospects.conversation.example1,
    );
    assert.match(fr.personas.conversation.title, /Ask Athena/);
    assert.match(fr.prospects.conversation.askAthena, /Ask Athena/);
  });

  it("keeps historical messages verbatim and request semantics unchanged", () => {
    const personaPanel = read("components/personas/PersonaConversationPanel.tsx");
    const prospectPanel = read(
      "components/prospects/ProspectConversationPanel.tsx",
    );
    assert.match(personaPanel, /\{message\.content\}/);
    assert.match(prospectPanel, /message\.content/);
    assert.match(personaPanel, /postPersonaConversation\(\{/);
    assert.match(personaPanel, /personaId,/);
    assert.match(personaPanel, /executiveVersionId,/);
    assert.match(personaPanel, /assetReference: assetReference \?\? null,/);
    assert.doesNotMatch(personaPanel, /language:/);
    assert.doesNotMatch(prospectPanel, /language:/);
    assert.doesNotMatch(personaPanel, /navigator\.language|getTenantLocalization/);
    assert.doesNotMatch(prospectPanel, /navigator\.language|getTenantLocalization/);
  });
});

describe("V31 L3.6 tenant personas + prospects — Executive Intelligence", () => {
  it("localizes Persona and Prospect EI chrome and keeps generated values verbatim", () => {
    const personaPage = read("app/personas/[id]/page.tsx");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(personaPage, /chrome=\{executive\}/);
    assert.match(prospectPage, /chrome=\{executive\}/);
    assert.match(prospectPage, /conversationChrome=\{copy\.conversation\}/);
    assert.match(personaPage, /locale=\{locale\}/);
    assert.match(prospectPage, /locale=\{locale\}/);
    assert.equal(en.personas.executive.heading, "Executive Intelligence");
    assert.equal(
      en.personas.executive.analysisAssetsTitle,
      "Persona Analysis Assets",
    );
    assert.notEqual(
      fr.personas.executive.whatMatters,
      en.personas.executive.whatMatters,
    );
    assert.notEqual(
      fr.prospects.executive.currentVersionExpanded,
      en.prospects.executive.currentVersionExpanded,
    );

    const frenchCard = renderToStaticMarkup(
      createElement(ExecutiveIntelligenceCard, {
        analysis: sampleAnalysis(),
        chrome: fr.personas.executive,
      }),
    );
    assert.match(frenchCard, new RegExp(STORED_EI_SUMMARY));
    assert.match(frenchCard, /Generated pain points must remain verbatim\./);
    assert.match(frenchCard, /Generated recommended action must remain verbatim\./);
    assert.doesNotMatch(frenchCard, /doit rester verbatim/);
  });

  it("keeps shared EI English defaults when chrome is omitted", () => {
    const englishCard = renderToStaticMarkup(
      createElement(ExecutiveIntelligenceCard, {
        analysis: sampleAnalysis(),
      }),
    );
    assert.match(englishCard, /Executive Intelligence/);
    assert.match(englishCard, /What matters in 30 seconds/);
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /chrome\?: DiscussionExecutiveChrome/);
    assert.doesNotMatch(workspace, /getTenantLocalization|getTenantMessages/);
    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /chrome=\{executive\}/);
    assert.match(discussionPage, /messages\.discussions\.executive/);
  });
});

describe("V31 L3.6 tenant personas + prospects — Deep Scrape and refresh", () => {
  it("localizes Persona Deep Scrape presentation from structured fields", () => {
    const button = read("components/personas/PersonaDeepScrapeWebsiteButton.tsx");
    const status = read("app/api/personas/[id]/deep-scrape/status/route.ts");
    assert.match(button, /localizeDeepScrapeStage\(payload\.job, messages\)/);
    assert.doesNotMatch(button, /payload\.job\?\.label \?\? "Queued"/);
    assert.doesNotMatch(button, /setResearchState\(payload\.researchState/);
    assert.match(status, /pagesTarget:/);
    assert.match(status, /pagesRendered:/);
    assert.match(status, /phase:/);
    assert.match(status, /researchState:/);
    assert.match(status, /formatDeepScrapeStatusLabel/);
    const localized = localizeDeepScrapeStage(
      {
        status: "processing",
        stage: "crawling",
        pagesCrawled: 3,
        pagesTarget: 12,
      },
      fr.personas.deepScrape,
    );
    assert.match(localized, /3/);
    assert.match(localized, /12/);
    assert.notEqual(localized, en.personas.deepScrape.crawlingWithTarget);
  });

  it("localizes Prospect Deep Scrape presentation without parsing the server label", () => {
    const button = read("components/prospects/ProspectDeepScrapeWebsiteButton.tsx");
    const status = read("app/api/prospects/[id]/deep-scrape/status/route.ts");
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(button, /localizeDeepScrapeStage\(payload\.job, messages\)/);
    assert.doesNotMatch(button, /payload\.job\?\.label \?\? "Queued"/);
    assert.match(button, /if \(!available\) \{\s*return null;\s*\}/s);
    assert.match(
      page,
      /initiallyAvailable=\{hasCurrentVersion && Boolean\(prospect\.website\)\}/,
    );
    assert.match(
      status,
      /available:\s*Boolean\(currentVersion\) && Boolean\(prospect\.website\?\.trim\(\)\)/,
    );
    assert.match(status, /pagesTarget:/);
    assert.match(status, /pagesRendered:/);
    assert.match(status, /phase:/);
    assert.match(status, /formatDeepScrapeStatusLabel/);
    const localized = localizeDeepScrapeStage(
      {
        status: "processing",
        stage: "crawling",
        phase: "rendering",
        pagesRendered: 2,
        pagesTarget: 8,
      },
      fr.prospects.deepScrape,
    );
    assert.match(localized, /2/);
    assert.match(localized, /8/);
  });

  it("localizes Refresh Intelligence chrome without changing request semantics", () => {
    const refresh = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    const generate = read(
      "components/personas/PersonaGenerateIntelligenceButton.tsx",
    );
    assert.match(refresh, /chrome\?\.generateIntelligence \?\? "Generate Intelligence"/);
    assert.match(generate, /chrome\?\.generateIntelligence \?\? "Generate Intelligence"/);
    assert.match(refresh, /`\/api\/prospects\/\$\{prospectId\}\/refresh`/);
    assert.match(generate, /`\/api\/personas\/\$\{personaId\}\/refresh`/);
    assert.match(refresh, /method: "POST"/);
    assert.doesNotMatch(refresh, /language:/);
    assert.doesNotMatch(generate, /language:/);
    assert.doesNotMatch(refresh, /JSON\.stringify/);
    assert.equal(en.prospects.detail.generateIntelligence, "Generate Intelligence");
    assert.notEqual(
      fr.prospects.detail.generatingIntelligence,
      en.prospects.detail.generatingIntelligence,
    );
  });
});

describe("V31 L3.6 tenant personas + prospects — homepage and errors", () => {
  it("localizes homepage-learning chrome from structured conditions", () => {
    assert.equal(
      resolveProspectHomepageLearningKey({ website: null }),
      "none",
    );
    assert.equal(
      resolveProspectHomepageLearningKey({
        website: "https://example.com",
        websiteError: "timeout",
      }),
      "incomplete",
    );
    assert.equal(
      resolveProspectHomepageLearningKey({
        website: "https://example.com",
        scrapedAt: "2026-08-20T12:00:00.000Z",
      }),
      "learned",
    );
    assert.equal(
      getLocalizedProspectHomepageLearning(fr, "learned"),
      fr.prospects.homepage.homepageLearned,
    );
    assert.notEqual(
      getLocalizedProspectHomepageLearning(fr, "incomplete"),
      "Homepage learning incomplete — generation continued with available fields",
    );
    const homepage = read("components/prospects/ProspectHomepageIntelligence.tsx");
    assert.match(homepage, /value: raw\.trim\(\)/);
    assert.doesNotMatch(homepage, /translateSection|localizeValue/);
  });

  it("preserves arbitrary server error text and localizes only fallbacks", () => {
    const personaLifecycle = read(
      "components/personas/PersonaLifecycleStatusControl.tsx",
    );
    const refresh = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.match(personaLifecycle, /typeof payload\.error === "string"/);
    assert.match(refresh, /typeof payload\.error === "string"/);
    assert.match(
      refresh,
      /chrome\?\.generateFailed \?\? "Generate Intelligence failed\."/,
    );
    assert.doesNotMatch(refresh, /translateError|localizeErrorMessage/);
  });
});

describe("V31 L3.6 tenant personas + prospects — boundaries", () => {
  it("does not change Opportunities, Briefings, Ads, SEO, or Social Planner", () => {
    for (const file of [
      "app/opportunities/page.tsx",
      "app/briefings/page.tsx",
      "app/ads/page.tsx",
      "app/seo/page.tsx",
      "app/social-planner/page.tsx",
    ]) {
      if (!existsSync(join(ROOT, file))) continue;
      assert.doesNotMatch(read(file), /messages\.personas|messages\.prospects/);
    }
  });

  it("does not regress Discussion L3.5 or add generation/provider/browser locale authority", () => {
    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /messages\.discussions\.executive/);
    assert.match(discussionPage, /chrome=\{executive\}/);
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
      "components/personas/PersonaConversationPanel.tsx",
      "components/prospects/ProspectConversationPanel.tsx",
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /getTenantLocalization/);
      assert.doesNotMatch(source, /resolveOrganizationLanguage/);
      assert.doesNotMatch(source, /navigator\.language/);
    }
  });

  it("leaves Licensee, Super Admin, and login unchanged", () => {
    for (const file of [
      "app/login/page.tsx",
      "app/licensee/page.tsx",
      "app/super/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /messages\.personas|messages\.prospects/);
      assert.doesNotMatch(read(file), /getTenantLocalization/);
    }
  });

  it("keeps all six dictionaries structurally complete after L3.6 expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("personas.list.createCta"));
    assert.ok(canonical.includes("personas.detail.generateIntelligence"));
    assert.ok(canonical.includes("personas.conversation.example1"));
    assert.ok(canonical.includes("personas.deepScrape.button"));
    assert.ok(canonical.includes("personas.executive.analysisAssetsTitle"));
    assert.ok(canonical.includes("prospects.list.importCta"));
    assert.ok(canonical.includes("prospects.detail.refreshQueued"));
    assert.ok(canonical.includes("prospects.conversation.askAthena"));
    assert.ok(canonical.includes("prospects.deepScrape.pagesAnalyzed"));
    assert.ok(canonical.includes("prospects.homepage.homepageLearned"));
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

  it("preserves locked terms and interpolates without translating stored names", () => {
    const named = interpolateTenantMessage(
      fr.personas.conversation.usingArchivedNamed,
      { label: STORED_PERSONA_NAME },
    );
    assert.match(named, new RegExp(STORED_PERSONA_NAME));
    for (const dictionary of Object.values(DICTIONARIES)) {
      assert.match(dictionary.personas.conversation.athena, /Athena/);
      assert.match(dictionary.prospects.deepScrape.button, /Deep Scrape/);
      assert.match(dictionary.prospects.detail.thinkDifferently, /Think Differently/);
      assert.match(dictionary.personas.executive.heading, /Executive Intelligence/);
    }
  });
});

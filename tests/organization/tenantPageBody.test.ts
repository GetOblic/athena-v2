import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeAttentionList } from "../../components/home/HomeAttentionList";
import { HomeDomainCard } from "../../components/home/HomeDomainCard";
import { GettingStartedConversationPanel } from "../../components/getting-started/GettingStartedConversationPanel";
import { IdentityConversationPanel } from "../../components/identity/IdentityConversationPanel";
import { IdentityExecutiveIntelligence } from "../../components/identity/IdentityExecutiveIntelligence";
import { getLocalizedBrainStatus } from "../../lib/tenantI18n/brainStatus";
import { tenantConversationWrapperChrome } from "../../lib/tenantI18n/conversationChrome";
import { localizeDeepScrapeStage } from "../../lib/tenantI18n/deepScrapeProgress";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { BUSINESS_MODEL_FIELD_LABELS } from "../../services/identity/identityExecutiveIntelligence";
import {
  ORGANIZATION_LANGUAGE_LABELS,
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

function collectLeaves(
  value: unknown,
  prefix = "",
): Array<{ path: string; text: string }> {
  if (typeof value === "string") {
    return prefix ? [{ path: prefix, text: value }] : [];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as object).flatMap((key) =>
    collectLeaves(
      (value as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

const DICTIONARIES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const STORED_OPPORTUNITY_TITLE = "Acme expansion in Lyon";
const STORED_GREETING_NAME = "Laurent";
const STORED_EI_SUMMARY = "Generated executive summary stays English.";

function dashboardPageUses(messages: TenantMessages): string[] {
  return [
    messages.dashboard.eyebrow,
    messages.dashboard.subtitle,
    messages.dashboard.define.title,
    messages.dashboard.visibility.title,
    messages.dashboard.traction.title,
    messages.dashboard.convert.title,
    messages.dashboard.attention.title,
    messages.dashboard.goodMorning,
    messages.dashboard.goodAfternoon,
    messages.dashboard.goodEvening,
  ];
}

describe("V31 L3.3 tenant page body — dashboard", () => {
  it("keeps English Command Center chrome canonical", () => {
    const html = renderToStaticMarkup(
      createElement(HomeAttentionList, {
        title: en.dashboard.attention.title,
        intro: en.dashboard.attention.intro,
        items: [],
        emptyLabel: en.dashboard.attention.empty,
      }),
    );
    assert.match(html, /What needs attention/);
    assert.match(html, /Open items from your current workspace state/);
    assert.equal(en.dashboard.eyebrow, "Command Center");
    assert.equal(
      en.dashboard.subtitle,
      "Here is where your business stands, and what you can work on now.",
    );
    assert.equal(en.dashboard.goodMorning, "Good morning");
    assert.equal(en.dashboard.goodAfternoon, "Good afternoon");
    assert.equal(en.dashboard.goodEvening, "Good evening");
    const page = read("app/page.tsx");
    assert.match(page, /messages\.dashboard\[timeGreetingKey\(\)\]/);
    assert.match(page, /const hour = new Date\(\)\.getHours\(\)/);
    assert.match(page, /if \(hour < 12\) return "goodMorning"/);
    assert.match(page, /if \(hour < 18\) return "goodAfternoon"/);
    assert.match(page, /loadHomeSnapshot/);
    assert.doesNotMatch(page, /TodaysIntelligence/);
  });

  it("translates Command Center chrome in all five non-English languages", () => {
    for (const language of ["fr", "es", "it", "de", "pt"] as const) {
      const messages = DICTIONARIES[language];
      const html = renderToStaticMarkup(
        createElement(HomeAttentionList, {
          title: messages.dashboard.attention.title,
          intro: messages.dashboard.attention.intro,
          items: [],
          emptyLabel: messages.dashboard.attention.empty,
        }),
      );
      assert.notEqual(messages.dashboard.eyebrow, en.dashboard.eyebrow);
      assert.notEqual(
        messages.dashboard.attention.title,
        en.dashboard.attention.title,
      );
      assert.match(
        html,
        new RegExp(
          messages.dashboard.attention.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      );
      assert.doesNotMatch(html, /What needs attention/);
      for (const greeting of dashboardPageUses(messages)) {
        assert.ok(greeting.trim());
      }
    }
  });

  it("keeps dynamic Command Center entity values verbatim", () => {
    const html = renderToStaticMarkup(
      createElement(HomeDomainCard, {
        stageNumber: 2,
        icon: "visibility",
        title: fr.dashboard.visibility.title,
        question: fr.dashboard.visibility.question,
        tone: "ready",
        statusLabel: fr.dashboard.visibility.labelReady,
        statusLine: fr.dashboard.visibility.statusReady,
        details: [`${STORED_OPPORTUNITY_TITLE} · SEO Intelligence · 1 Sep 2026`],
        ctaLabel: fr.dashboard.visibility.ctaReview,
        href: "/seo",
      }),
    );
    assert.match(html, /Acme expansion in Lyon/);
    assert.doesNotMatch(html, /expansion à Lyon/);
  });

  it("localizes time greetings without changing hour logic", () => {
    const page = read("app/page.tsx");
    assert.match(page, /function timeGreetingKey/);
    assert.doesNotMatch(page, /timeZone|Intl\.DateTimeFormat|navigator\.language/);
    assert.equal(fr.dashboard.goodMorning, "Bonjour");
    assert.equal(es.dashboard.goodMorning, "Buenos días");
    assert.equal(itMessages.dashboard.goodMorning, "Buongiorno");
    assert.equal(de.dashboard.goodMorning, "Guten Morgen");
    assert.equal(pt.dashboard.goodMorning, "Bom dia");
    assert.equal(en.dashboard.greetingFallback, "there");
    assert.notEqual(STORED_GREETING_NAME, en.dashboard.greetingFallback);
  });
});

describe("V31 L3.3 tenant page body — getting started", () => {
  it("localizes page title, guidance, workflow, and best practices", () => {
    assert.equal(en.gettingStarted.title, "Welcome to Athena");
    assert.equal(fr.gettingStarted.title, "Bienvenue dans Athena");
    assert.notEqual(fr.gettingStarted.intro, en.gettingStarted.intro);
    assert.notEqual(fr.gettingStarted.step1Title, en.gettingStarted.step1Title);
    assert.notEqual(fr.gettingStarted.practice1, en.gettingStarted.practice1);
    assert.equal(en.gettingStarted.workflowBlueprints, "Strategic Asset Blueprint");
    assert.equal(fr.gettingStarted.workflowBlueprints, "Strategic Asset Blueprint");
    assert.equal(en.gettingStarted.workflowDeploymentAssets, "Deployment Assets");
    const page = read("app/getting-started/page.tsx");
    assert.match(page, /copy\.title/);
    assert.match(page, /copy\.intro/);
    assert.match(page, /copy\.workflowConversation/);
    assert.match(page, /copy\.practice1/);
    assert.match(page, /getTenantLocalization/);
  });

  it("localizes conversation wrapper chrome and example prompts", () => {
    const page = read("app/getting-started/page.tsx");
    assert.match(page, /copy\.conversationTitle/);
    assert.match(page, /copy\.example1/);
    assert.match(page, /tenantConversationWrapperChrome\(messages\)/);
    assert.equal(fr.gettingStarted.example1, "Que dois-je terminer en premier ?");
    assert.notEqual(fr.gettingStarted.example1, en.gettingStarted.example1);
    const french = renderToStaticMarkup(
      createElement(GettingStartedConversationPanel, {
        title: fr.gettingStarted.conversationTitle,
        description: fr.gettingStarted.conversationDescription,
        placeholder: fr.gettingStarted.conversationPlaceholder,
        examplePrompts: [
          fr.gettingStarted.example1,
          fr.gettingStarted.example2,
          fr.gettingStarted.example3,
          fr.gettingStarted.example4,
          fr.gettingStarted.example5,
          fr.gettingStarted.example6,
        ],
        ...tenantConversationWrapperChrome(fr),
      }),
    );
    assert.match(french, /Ask Athena/);
    assert.match(french, /comment cela fonctionne/);
    assert.doesNotMatch(french, /Ask Athena how it works/);

    const english = renderToStaticMarkup(
      createElement(GettingStartedConversationPanel),
    );
    assert.match(english, /Ask Athena how it works/);
  });

  it("does not translate historical conversation messages or request construction", () => {
    const wrapper = read(
      "components/getting-started/GettingStartedConversationPanel.tsx",
    );
    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(wrapper, /GETTING_STARTED_CONVERSATION_ENDPOINT/);
    assert.match(wrapper, /\/api\/getting-started\/conversation/);
    assert.match(panel, /\{message\.content\}/);
    assert.doesNotMatch(wrapper, /getTenantLocalization|resolveOrganizationLanguage/);
    assert.doesNotMatch(wrapper, /navigator\.language/);
  });
});

describe("V31 L3.3 tenant page body — Athena Brain", () => {
  it("localizes Brain page and form labels while keeping stored values verbatim", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /copy\.greetingLabel/);
    assert.match(page, /copy\.voiceLabel/);
    assert.match(page, /copy\.knowledgeLabel/);
    assert.match(page, /copy\.websiteLabel/);
    assert.match(page, /defaultValue=\{identity\?\.greeting_name/);
    assert.match(page, /defaultValue=\{identity\?\.about_you/);
    assert.match(page, /defaultValue=\{identity\?\.expertise/);
    assert.match(page, /defaultValue=\{identity\?\.website/);
    assert.equal(en.identity.greetingLabel, "What should Athena call you?");
    assert.notEqual(fr.identity.greetingLabel, en.identity.greetingLabel);
    assert.equal(en.identity.accountLanguage, "Account Language");
    assert.notEqual(fr.identity.accountLanguage, en.identity.accountLanguage);
  });

  it("keeps Account Language read-only and autonyms from ORGANIZATION_LANGUAGE_LABELS", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /organizationLanguageLabel\(language\)/);
    assert.doesNotMatch(page, /<select/);
    assert.doesNotMatch(page, /updateOrganizationLanguage/);
    for (const file of [
      "lib/tenantI18n/messages/en.ts",
      "lib/tenantI18n/messages/fr.ts",
      "app/identity/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /ORGANIZATION_LANGUAGE_LABELS/);
    }
    assert.equal(ORGANIZATION_LANGUAGE_LABELS.fr, "Français");
    assert.equal(ORGANIZATION_LANGUAGE_LABELS.de, "Deutsch");
    assert.equal(ORGANIZATION_LANGUAGE_LABELS.pt, "Português");
    for (const language of ORGANIZATION_LANGUAGES) {
      for (const leaf of collectLeaves(DICTIONARIES[language])) {
        for (const label of Object.values(ORGANIZATION_LANGUAGE_LABELS)) {
          assert.notEqual(leaf.text, label);
        }
      }
    }
  });

  it("does not mutate BUSINESS_MODEL_FIELD_LABELS and localizes UI labels independently", () => {
    assert.equal(
      BUSINESS_MODEL_FIELD_LABELS.business_overview,
      "Business Overview",
    );
    assert.equal(en.identity.businessModel.business_overview, "Business Overview");
    assert.notEqual(
      fr.identity.businessModel.business_overview,
      BUSINESS_MODEL_FIELD_LABELS.business_overview,
    );
    const ei = read("components/identity/IdentityExecutiveIntelligence.tsx");
    assert.match(ei, /messages\.businessModel\[key\]/);
    assert.doesNotMatch(ei, /BUSINESS_MODEL_FIELD_LABELS/);
    const context = read(
      "services/identityConversation/identityConversationContext.ts",
    );
    assert.match(context, /BUSINESS_MODEL_FIELD_LABELS/);
    assert.doesNotMatch(context, /tenantI18n/);
  });

  it("keeps generated Executive Intelligence body verbatim", () => {
    const html = renderToStaticMarkup(
      createElement(IdentityExecutiveIntelligence, {
        identity: {
          id: "id-1",
          user_id: "user-1",
          organization_id: "org-1",
          greeting_name: "Laurent",
          about_you: "voice",
          expertise: "knowledge",
          website: "https://example.com",
          brain_status: "ready",
          brain_last_updated: "2026-08-31T12:00:00.000Z",
          master_profile: {
            executive_intelligence: {
              executive_summary: STORED_EI_SUMMARY,
              confidence_level: "strong",
              confidence_reasons: ["Stored reason stays English."],
              voice_alignment: "strong",
              business_knowledge_coverage: "developing",
              website_evidence_coverage: "limited",
              business_model: { business_overview: "Stored overview stays." },
              hidden_signals: [],
              calibration_gaps: [],
            },
          },
          master_profile_version: "1",
          master_profile_generated_at: "2026-08-31T12:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-31T12:00:00.000Z",
        },
        messages: fr.identity,
        language: "fr",
      }),
    );
    assert.match(html, /Generated executive summary stays English\./);
    assert.match(html, /Stored reason stays English\./);
    assert.match(html, /Executive Intelligence/);
    assert.match(html, /Carte de compréhension/);
    assert.doesNotMatch(html, /What Athena understands about your business/);
    const ei = read("components/identity/IdentityExecutiveIntelligence.tsx");
    assert.match(ei, /\{value\}/);
    assert.match(ei, /messages\.businessModel\[key\]/);
  });

  it("localizes Brain confirmation, brand, workspace, and GetOblic chrome", () => {
    const brand = read("components/identity/BrandIdentitySection.tsx");
    assert.match(brand, /messages\.removeLogoConfirm/);
    assert.match(brand, /messages\.removePictureConfirm/);
    assert.match(brand, /Remove the client logo\?/);
    assert.match(brand, /Remove the profile picture\?/);
    assert.equal(fr.identity.brand.removeLogoConfirm, "Supprimer le logo client ?");
    const workspace = read(
      "components/identity/AiWorkspacePreferencesSection.tsx",
    );
    assert.match(workspace, /messages\.preferredWorkspace/);
    assert.doesNotMatch(workspace, /organization language|Account Language/);
    const getoblic = read("components/identity/GetOblicLinksCard.tsx");
    assert.match(getoblic, /messages\?/);
    assert.match(getoblic, /deleteConfirm/);
    assert.match(getoblic, /GetOblic Links/);
    assert.doesNotMatch(getoblic, /GETOBLIC_LINK_TEMPLATES\[.*\]\.label/);
  });

  it("localizes Brain conversation wrapper independently of defaults", () => {
    const french = renderToStaticMarkup(
      createElement(IdentityConversationPanel, {
        opaqueScope: "abcdef0123456789",
        title: fr.identity.conversationTitle,
        description: fr.identity.conversationDescription,
        examplePrompts: [fr.identity.example1],
        ...tenantConversationWrapperChrome(fr),
      }),
    );
    assert.match(french, /Ask Athena/);
    assert.match(french, /propos de votre activité/);
    assert.doesNotMatch(french, /Ask Athena about your business/);
    const english = renderToStaticMarkup(
      createElement(IdentityConversationPanel, {
        opaqueScope: "abcdef0123456789",
      }),
    );
    assert.match(english, /Ask Athena about your business/);
    assert.equal(
      en.identity.example1,
      "What does Athena currently understand about my business?",
    );
    assert.notEqual(fr.identity.example1, en.identity.example1);
  });

  it("localizes Deep Scrape presentation from stage codes without changing job stages", () => {
    const button = read("components/identity/DeepScrapeWebsiteButton.tsx");
    assert.match(button, /localizeDeepScrapeStage/);
    assert.match(button, /localizeDeepScrapeStage\(payload\.job, messages\)/);
    assert.doesNotMatch(button, /setLabel\(payload\.isActive \? payload\.job\?\.label/);
    assert.doesNotMatch(button, /job\.label\s*\.match|label\.split|parse.*label/i);
    assert.match(button, /Intl\.DateTimeFormat\(locale/);
    const types = read(
      "services/websiteLearning/deepScrape/deepScrapeJobTypes.ts",
    );
    assert.match(types, /formatDeepScrapeStatusLabel/);
    assert.doesNotMatch(types, /tenantI18n/);
    assert.equal(en.identity.deepScrape.button, "Deep Scrape Website");
    assert.notEqual(fr.identity.deepScrape.queued, "Queued");
  });

  it("maps stored brain_status tokens to localized presentation without mutating storage", () => {
    const stored = "ready";
    assert.equal(getLocalizedBrainStatus(en, stored), "Ready");
    assert.equal(stored, "ready");
    assert.equal(en.identity.brainStatusValues.ready, "Ready");
    assert.equal(en.identity.brainStatusValues.pending, "Pending");
    assert.equal(getLocalizedBrainStatus(fr, "ready"), "Prêt");
    assert.equal(getLocalizedBrainStatus(es, "ready"), "Listo");
    assert.equal(getLocalizedBrainStatus(itMessages, "ready"), "Pronto");
    assert.equal(getLocalizedBrainStatus(de, "ready"), "Bereit");
    assert.equal(getLocalizedBrainStatus(pt, "ready"), "Pronto");
    assert.notEqual(fr.identity.brainStatusValues.ready, "ready");
    assert.notEqual(fr.identity.brainStatusValues.ready, "Ready");
    assert.notEqual(es.identity.brainStatusValues.pending, "Pending");
    assert.notEqual(itMessages.identity.brainStatusValues.pending, "Pending");
    assert.notEqual(de.identity.brainStatusValues.pending, "Pending");
    assert.notEqual(pt.identity.brainStatusValues.pending, "Pending");
    assert.equal(getLocalizedBrainStatus(en, null), "Pending");
    assert.equal(getLocalizedBrainStatus(fr, undefined), "En attente");
    const page = read("app/identity/page.tsx");
    assert.match(page, /getLocalizedBrainStatus\(messages, identity\?\.brain_status\)/);
    assert.doesNotMatch(page, /identity\?\.brain_status \?\? "pending"/);
    const service = read("services/identity/identityService.ts");
    assert.match(service, /brain_status: "ready"/);
    assert.match(service, /brain_status: "processing"/);
    assert.doesNotMatch(service, /tenantI18n|getLocalizedBrainStatus/);
    assert.equal("ready" in en.status, false);
  });

  it("localizes Deep Scrape X-of-Y and rendering progress from structured fields", () => {
    const crawlingJob = {
      status: "processing",
      stage: "crawling",
      pagesCrawled: 3,
      pagesTarget: 10,
    };
    assert.equal(
      localizeDeepScrapeStage(crawlingJob, en.identity.deepScrape),
      "Crawling 3 of 10 candidate pages",
    );
    assert.equal(
      localizeDeepScrapeStage(crawlingJob, fr.identity.deepScrape),
      "Exploration de 3 pages candidates sur 10",
    );
    assert.match(
      localizeDeepScrapeStage(crawlingJob, es.identity.deepScrape),
      /3/,
    );
    assert.match(
      localizeDeepScrapeStage(crawlingJob, itMessages.identity.deepScrape),
      /3/,
    );
    assert.match(
      localizeDeepScrapeStage(crawlingJob, de.identity.deepScrape),
      /3/,
    );
    assert.match(
      localizeDeepScrapeStage(crawlingJob, pt.identity.deepScrape),
      /3/,
    );
    assert.notEqual(
      localizeDeepScrapeStage(crawlingJob, es.identity.deepScrape),
      en.identity.deepScrape.crawlingWithTarget,
    );
    const renderingJob = {
      status: "processing",
      stage: "crawling",
      phase: "rendering",
      pagesRendered: 2,
      pagesTarget: 10,
    };
    assert.equal(
      localizeDeepScrapeStage(renderingJob, en.identity.deepScrape),
      "Rendering JavaScript page 2 of 10",
    );
    assert.equal(
      localizeDeepScrapeStage(renderingJob, fr.identity.deepScrape),
      "Rendu JavaScript de la page 2 sur 10",
    );
    assert.doesNotMatch(
      localizeDeepScrapeStage(
        { ...renderingJob, label: "Rendering JavaScript page 2 of 10" } as never,
        fr.identity.deepScrape,
      ),
      /Rendering JavaScript page/,
    );
    const helper = read("lib/tenantI18n/deepScrapeProgress.ts");
    assert.doesNotMatch(helper, /job\.label|label\.match|label\.split|JSON\.parse/);
    const statusRoute = read("app/api/identity/deep-scrape/status/route.ts");
    assert.match(statusRoute, /pagesTarget:/);
    assert.match(statusRoute, /pagesRendered:/);
    assert.match(statusRoute, /phase:/);
    assert.match(statusRoute, /latest\.progress\?\.pagesTarget/);
    assert.match(statusRoute, /latest\.progress\?\.pagesRendered/);
    assert.match(statusRoute, /latest\.progress\?\.phase/);
    assert.doesNotMatch(statusRoute, /tenantI18n/);
    const types = read(
      "services/websiteLearning/deepScrape/deepScrapeJobTypes.ts",
    );
    assert.match(types, /Rendering JavaScript page \$\{rendered\} of \$\{target\}/);
    assert.doesNotMatch(types, /tenantI18n/);
  });

  it("localizes Identity flash chrome from stable codes", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /copy\.flashSaved/);
    assert.match(page, /copy\.flashBrandSaved/);
    assert.match(page, /brandError=not_found|localizeFlashError/);
    assert.match(page, /workspaceError=invalid/);
    assert.match(page, /redirect\("\/identity\?saved=true"\)/);
    assert.equal(en.identity.flashSaved, "Athena Brain trained successfully.");
    assert.notEqual(fr.identity.flashSaved, en.identity.flashSaved);
  });

  it("formats Brain timestamps with the accepted locale mapping", () => {
    const page = read("app/identity/page.tsx");
    const ei = read("components/identity/IdentityExecutiveIntelligence.tsx");
    const deep = read("components/identity/DeepScrapeWebsiteButton.tsx");
    assert.match(page, /formatTenantDateTime\(identity\.brain_last_updated, language\)/);
    assert.match(ei, /formatTenantDateTime\(/);
    assert.match(deep, /en-US/);
    assert.doesNotMatch(page, /toLocaleString\(\)/);
    assert.doesNotMatch(ei, /toLocaleString\(\)/);
  });
});

describe("V31 L3.3 tenant page body — boundaries", () => {
  it("does not let workers or generation modules import tenantI18n", () => {
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
  });

  it("does not add user-entered or persisted-content translation helpers", () => {
    for (const file of listTsFiles("lib/tenantI18n")) {
      const source = read(file);
      assert.doesNotMatch(source, /translateUser|translatePersisted|translateGenerated/);
    }
    assert.equal(existsSync(join(ROOT, "lib/tenantI18n/translateContent.ts")), false);
  });

  it("does not let Client modules resolve organization language or browser locale", () => {
    const forbidden = [
      /resolveOrganizationLanguage/,
      /getTenantLocalization/,
      /navigator\.language/,
      /accept-language/i,
      /document\.cookie/,
    ];
    const clientHits: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of listTsFiles(dir)) {
        const source = read(file);
        if (!source.includes('"use client"')) continue;
        if (forbidden.some((pattern) => pattern.test(source))) {
          clientHits.push(file);
        }
      }
    }
    assert.deepEqual(clientHits, []);
  });

  it("does not localize Licensee, Super Admin, or login", () => {
    for (const file of [
      "app/login/page.tsx",
      "app/licensee/page.tsx",
      "app/super/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /getTenantLocalization|tenantI18n\/messages/);
    }
  });

  it("keeps dictionaries complete after L3.3 expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("dashboard.goodMorning"));
    assert.ok(canonical.includes("gettingStarted.step1Title"));
    assert.ok(canonical.includes("identity.accountLanguage"));
    assert.ok(canonical.includes("identity.businessModel.business_overview"));
    assert.ok(canonical.includes("identity.deepScrape.queued"));
    assert.ok(canonical.includes("identity.brainStatusValues.ready"));
    assert.ok(canonical.includes("identity.deepScrape.crawlingWithTarget"));
    assert.ok(canonical.includes("identity.deepScrape.renderingWithTarget"));
    assert.ok(canonical.includes("conversation.readOnlyNotice"));
    assert.ok(canonical.includes("intelligenceDomains.title"));
    assert.ok(canonical.includes("inbox.title"));
    assert.ok(canonical.includes("discussions.queueInReview"));
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

  it("interpolates chrome placeholders without translating values", () => {
    assert.equal(
      interpolateTenantMessage(en.dashboard.scoreLabel, { score: 91 }),
      "Score 91",
    );
    assert.equal(
      interpolateTenantMessage(fr.identity.getoblic.deleteConfirm, {
        slug: "lyon-offer",
      }).includes("lyon-offer"),
      true,
    );
  });
});

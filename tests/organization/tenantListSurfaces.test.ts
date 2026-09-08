import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CaptureDiscussionForm } from "../../components/inbox/CaptureDiscussionForm";
import { CreateIntelligenceDomainForm } from "../../components/intelligenceDomains/CreateIntelligenceDomainForm";
import { DiscussionAgeBadge } from "../../components/discussions/DiscussionAgeBadge";
import { DiscussionLifecycleBadge } from "../../components/discussions/DiscussionLifecycleBadge";
import { IntelligenceDomainStatusBadge } from "../../components/intelligenceDomains/IntelligenceDomainStatusBadge";
import { getDiscussionAgeKey } from "../../lib/discussionAge";
import {
  classifyDiscussionQueue,
  getDiscussionActionLabel,
  getDiscussionLifecycle,
  getDiscussionQueueTitle,
  normalizeDiscussionLifecycleKey,
} from "../../lib/discussionStatus";
import { formatTenantDate, toFormattingLocale } from "../../lib/tenantI18n/format";
import {
  getLocalizedDiscussionActionLabel,
  getLocalizedDiscussionAgeLabel,
  getLocalizedDiscussionLifecycleLabel,
  getLocalizedDiscussionQueueTitle,
} from "../../lib/tenantI18n/discussionPresentation";
import { getLocalizedIntelligenceDomainStatus } from "../../lib/tenantI18n/intelligenceDomainStatus";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import type { Discussion } from "../../services/discussionService";
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

const STORED_DOMAIN_NAME = "Lyon B2B SaaS Founders";
const STORED_DISCUSSION_TITLE = "Acme pricing objection in Lyon";
const STORED_DISCUSSION_BODY = "Generated excerpt must remain verbatim.";
const STORED_AUTHOR = "Marie Dupont";

function sampleDiscussion(overrides: Partial<Discussion> = {}): Discussion {
  return {
    id: "disc-1",
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-20T12:00:00.000Z",
    community_id: "comm-1",
    platform: "linkedin",
    title: STORED_DISCUSSION_TITLE,
    author: STORED_AUTHOR,
    url: "https://example.com/thread",
    body: STORED_DISCUSSION_BODY,
    status: "New",
    priority: 1,
    opportunity_score: 88,
    sentiment: null,
    summary: null,
    ai_notes: null,
    last_activity: "2026-08-20T15:04:00.000Z",
    raw_json: null,
    ...overrides,
  };
}

function createDomainFormHtml(messages: TenantMessages["intelligenceDomains"]) {
  return renderToStaticMarkup(
    createElement(CreateIntelligenceDomainForm, {
      action: async () => undefined,
      messages,
    }),
  );
}

function captureFormHtml(messages: TenantMessages["inbox"]) {
  return renderToStaticMarkup(
    createElement(CaptureDiscussionForm, {
      intelligenceDomains: [
        { id: "domain-1", name: STORED_DOMAIN_NAME },
      ],
      messages,
    }),
  );
}

describe("V31 L3.4 tenant list surfaces — Intelligence Domains", () => {
  it("keeps English Intelligence Domains body canonical", () => {
    const html = createDomainFormHtml(en.intelligenceDomains);
    assert.match(html, /Create Intelligence Domain/);
    assert.match(html, /Create Domain/);
    assert.match(html, /e\.g\. Executive Coaching/);
    assert.match(html, /value="active"/);
    assert.match(html, /value="inactive"/);
    assert.equal(en.intelligenceDomains.title, "Intelligence Domains");
    assert.equal(en.intelligenceDomains.eyebrow, "Market Context");
    assert.equal(
      en.intelligenceDomains.empty,
      "No Intelligence Domains yet. Create your first domain to tell Athena which market context to use.",
    );
    const page = read("app/intelligence-domains/page.tsx");
    assert.match(page, /copy\.title/);
    assert.match(page, /copy\.subtitle/);
    assert.match(page, /copy\.empty/);
    assert.match(page, /TenantAppShell/);
    assert.doesNotMatch(page, /DashboardSidebar/);
    assert.doesNotMatch(page, /AthenaBrandLink/);
    assert.match(page, /getTenantLocalization\(\)/);
    assert.equal((page.match(/getTenantLocalization\(\)/g) ?? []).length, 1);
  });

  it("localizes Intelligence Domains body chrome in all six languages", () => {
    assert.equal(fr.intelligenceDomains.title, "Intelligence Domains");
    assert.equal(es.intelligenceDomains.title, "Intelligence Domains");
    assert.equal(itMessages.intelligenceDomains.title, "Intelligence Domains");
    assert.equal(de.intelligenceDomains.title, "Intelligence Domains");
    assert.equal(pt.intelligenceDomains.title, "Intelligence Domains");
    assert.equal(fr.intelligenceDomains.eyebrow, "Contexte de marché");
    assert.equal(es.intelligenceDomains.eyebrow, "Contexto de mercado");
    assert.equal(itMessages.intelligenceDomains.eyebrow, "Contesto di mercato");
    assert.equal(de.intelligenceDomains.eyebrow, "Marktkontext");
    assert.equal(pt.intelligenceDomains.eyebrow, "Contexto de mercado");
    assert.notEqual(fr.intelligenceDomains.createCta, en.intelligenceDomains.createCta);
    assert.notEqual(es.intelligenceDomains.empty, en.intelligenceDomains.empty);
    assert.notEqual(itMessages.intelligenceDomains.createHelp, en.intelligenceDomains.createHelp);
    assert.notEqual(de.intelligenceDomains.priorityHelp, en.intelligenceDomains.priorityHelp);
    assert.notEqual(pt.intelligenceDomains.editTitle, en.intelligenceDomains.editTitle);

    const french = createDomainFormHtml(fr.intelligenceDomains);
    assert.match(french, /Créer un Intelligence Domain/);
    assert.match(french, /Créer le domaine/);
    assert.doesNotMatch(french, /Create Domain/);
    assert.match(french, /value="active"/);
    assert.match(french, /value="inactive"/);
  });

  it("renders persisted domain names verbatim and keeps routes unchanged", () => {
    const card = read(
      "components/intelligenceDomains/IntelligenceDomainRowActions.tsx",
    );
    assert.match(card, /\{domain\.group_name\}/);
    assert.match(card, /\{domain\.notes\}/);
    assert.match(card, /\{domain\.niche \|\| "—"\}/);
    assert.match(card, /href=\{`\/communities\/\$\{domain\.id\}`\}/);
    assert.match(card, /fetch\(`\/api\/communities\/\$\{domain\.id\}`/);
    assert.match(card, /value="active"/);
    assert.match(card, /value="inactive"/);
    assert.match(card, /nextStatus = isActive \? "inactive" : "active"/);
    assert.doesNotMatch(card, /resolveOrganizationLanguage|navigator\.language/);
    const page = read("app/intelligence-domains/page.tsx");
    assert.match(page, /redirect\("\/intelligence-domains\?created=true"\)/);
    assert.match(page, /redirect\("\/intelligence-domains\?error=create_failed"\)/);
    assert.doesNotMatch(page, /translateDomain|translatePersisted/);
  });
});

describe("V31 L3.4 tenant list surfaces — Inbox", () => {
  it("localizes Inbox title, fields, empty-option chrome, and keeps stored values verbatim", () => {
    const english = captureFormHtml(en.inbox);
    assert.match(english, /Capture Discussion|Import Discussion/);
    assert.match(english, /No Intelligence Domain selected/);
    assert.match(english, /Lyon B2B SaaS Founders/);
    assert.equal(en.inbox.title, "Capture Discussion");
    assert.equal(en.inbox.eyebrow, "Athena Inbox");

    const french = captureFormHtml(fr.inbox);
    assert.match(french, /Capturer une discussion|Importer la discussion/);
    assert.match(french, /Aucun Intelligence Domain sélectionné/);
    assert.match(french, /Lyon B2B SaaS Founders/);
    assert.doesNotMatch(french, /Import Discussion/);
    assert.notEqual(fr.inbox.title, en.inbox.title);
    assert.notEqual(es.inbox.titlePlaceholder, en.inbox.titlePlaceholder);
    assert.notEqual(itMessages.inbox.importCta, en.inbox.importCta);
    assert.notEqual(de.inbox.subtitle, en.inbox.subtitle);
    assert.notEqual(pt.inbox.domainHelp, en.inbox.domainHelp);

    const page = read("app/inbox/page.tsx");
    assert.match(page, /copy\.title/);
    assert.match(page, /copy\.subtitle/);
    assert.match(page, /TenantAppShell/);
    assert.doesNotMatch(page, /TenantBackLink/);
    assert.doesNotMatch(page, /AthenaBrandLink/);
    assert.match(page, /getIntelligenceDomainName\(domain\)/);
    assert.match(page, /getTenantLocalization\(\)/);
    const form = read("components/inbox/CaptureDiscussionForm.tsx");
    assert.match(form, /value=\{title\}/);
    assert.match(form, /value=\{author\}/);
    assert.match(form, /value=\{body\}/);
    assert.match(form, /communityId: domainId \|\| null/);
    assert.match(form, /option value=""/);
  });

  it("does not send translated labels as backend query values", () => {
    const form = read("components/inbox/CaptureDiscussionForm.tsx");
    assert.match(
      form,
      /body: JSON\.stringify\(\{[\s\S]*communityId: domainId \|\| null/,
    );
    assert.match(form, /platform: platform\.trim\(\)/);
    assert.match(form, /title: title\.trim\(\)/);
    assert.doesNotMatch(form, /messages\.(inbox|domainLabel).*communityId/);
    const domainsPage = read("app/intelligence-domains/page.tsx");
    assert.match(domainsPage, /status: String\(formData\.get\("status"\) \?\? "active"\)/);
    const card = read(
      "components/intelligenceDomains/IntelligenceDomainRowActions.tsx",
    );
    assert.match(card, /body: JSON\.stringify\(\{[\s\S]*status,/);
    assert.match(card, /status: nextStatus/);
  });

  it("formats discussion-list dates with the accepted tenant locale mapping", () => {
    const page = read("app/discussions/page.tsx");
    assert.match(page, /formatTenantDate\(value, language\)/);
    assert.doesNotMatch(page, /toLocaleDateString\("en-US"/);
    assert.doesNotMatch(page, /navigator\.language/);
    assert.equal(toFormattingLocale("en"), "en-US");
    assert.equal(toFormattingLocale("fr"), "fr-FR");
    assert.equal(toFormattingLocale("es"), "es-ES");
    assert.equal(toFormattingLocale("it"), "it-IT");
    assert.equal(toFormattingLocale("de"), "de-DE");
    assert.equal(toFormattingLocale("pt"), "pt-PT");
    const formatted = formatTenantDate("2026-08-20T15:04:00.000Z", "fr");
    assert.ok(formatted);
    assert.notEqual(formatted, formatTenantDate("2026-08-20T15:04:00.000Z", "en"));
  });
});

describe("V31 L3.4 tenant list surfaces — Discussions list", () => {
  it("localizes list chrome while keeping titles, excerpts, and names verbatim", () => {
    const page = read("app/discussions/page.tsx");
    assert.match(page, /copy\.title/);
    assert.match(page, /copy\.emptyTitle/);
    assert.match(page, /copy\.colDomain/);
    assert.match(page, /getLocalizedDiscussionQueueTitle\(messages, section\.key\)/);
    assert.match(page, /getLocalizedDiscussionActionLabel/);
    assert.match(page, /\{discussion\.title\}/);
    assert.match(page, /title: discussion\.title/);
    assert.match(page, /\{domain\?\.group_name \?\? "—"\}/);
    assert.doesNotMatch(page, /discussion\.body/);
    assert.doesNotMatch(page, /translateDiscussion|translateTitle/);
    assert.equal(en.discussions.title, "Athena Inbox");
    assert.equal(en.discussions.emptyCta, "Open Capture Inbox");
    assert.notEqual(fr.discussions.emptyTitle, en.discussions.emptyTitle);
    assert.notEqual(es.discussions.colLastActivity, en.discussions.colLastActivity);
    assert.notEqual(itMessages.discussions.actionAnalyze, en.discussions.actionAnalyze);
    assert.notEqual(de.discussions.queueInReview, en.discussions.queueInReview);
    assert.notEqual(pt.discussions.eyebrow, en.discussions.eyebrow);
    assert.equal(fr.discussions.colDomain, "Intelligence Domain");
  });

  it("localizes discussion statuses at the presentation layer only", () => {
    const stored = "reviewing";
    assert.equal(normalizeDiscussionLifecycleKey(stored), "reviewing");
    assert.equal(getDiscussionQueueTitle("in_review"), "In Review");
    assert.equal(getDiscussionActionLabel("new"), "Analyze");
    assert.equal(getLocalizedDiscussionQueueTitle(en, "in_review"), "In Review");
    assert.equal(getLocalizedDiscussionQueueTitle(fr, "in_review"), "En revue");
    assert.equal(getLocalizedDiscussionQueueTitle(es, "in_review"), "En revisión");
    assert.equal(getLocalizedDiscussionQueueTitle(itMessages, "in_review"), "In revisione");
    assert.equal(getLocalizedDiscussionQueueTitle(de, "in_review"), "In Prüfung");
    assert.equal(getLocalizedDiscussionQueueTitle(pt, "in_review"), "Em revisão");
    assert.equal(getLocalizedDiscussionLifecycleLabel(fr, "completed"), "Terminé");
    assert.equal(getLocalizedDiscussionActionLabel(fr, "new"), "Analyser");
    assert.equal(getLocalizedDiscussionActionLabel(fr, "processed"), "Ouvrir");
    assert.equal(stored, "reviewing");
    assert.equal(classifyDiscussionQueue(true, "reviewing"), "in_review");
    assert.equal(classifyDiscussionQueue(false, "completed"), "new");

    const discussion = sampleDiscussion({ status: "Reviewing" });
    const lifecycle = getDiscussionLifecycle(discussion, true);
    assert.equal(lifecycle.key, "reviewing");
    assert.equal(lifecycle.label, "Reviewing");
    const frenchBadge = renderToStaticMarkup(
      createElement(DiscussionLifecycleBadge, {
        discussion,
        hasAnalysis: true,
        label: getLocalizedDiscussionLifecycleLabel(fr, lifecycle.key),
      }),
    );
    assert.match(frenchBadge, /En revue/);
    assert.doesNotMatch(frenchBadge, />Reviewing</);

    const englishDefault = renderToStaticMarkup(
      createElement(DiscussionLifecycleBadge, {
        discussion,
        hasAnalysis: true,
      }),
    );
    assert.match(englishDefault, /Reviewing/);
  });

  it("keeps stored status tokens and queue keys unchanged", () => {
    const statusLib = read("lib/discussionStatus.ts");
    assert.match(statusLib, /export type DiscussionQueueKey = "new" \| "in_review" \| "processed"/);
    assert.match(statusLib, /label: "New"/);
    assert.match(statusLib, /label: "Reviewing"/);
    assert.match(statusLib, /in_review: "In Review"/);
    assert.match(statusLib, /processed: "Processed"/);
    assert.doesNotMatch(statusLib, /tenantI18n|getTenantMessages/);
    const queue = read("services/queueService.ts");
    assert.match(queue, /title: getDiscussionQueueTitle\(key\)/);
    assert.match(queue, /classifyDiscussionQueue\(hasAnalysis, discussion\.status\)/);
    const page = read("app/discussions/page.tsx");
    assert.match(page, /key=\{section\.key\}/);
    assert.doesNotMatch(page, /section\.title/);
  });

  it("localizes list pagination/loading/error chrome keys and age badges", () => {
    assert.equal(en.errors.unableToLoad, "Unable to load");
    assert.notEqual(fr.errors.unableToLoad, en.errors.unableToLoad);
    assert.equal(getLocalizedDiscussionAgeLabel(en, "fresh"), "Fresh");
    assert.equal(getLocalizedDiscussionAgeLabel(fr, "fresh"), "Récent");
    assert.equal(getLocalizedDiscussionAgeLabel(de, "dormant"), "Ruhend");
    const discussion = sampleDiscussion();
    const ageKey = getDiscussionAgeKey(discussion);
    const frenchAge = renderToStaticMarkup(
      createElement(DiscussionAgeBadge, {
        discussion,
        label: getLocalizedDiscussionAgeLabel(fr, ageKey),
      }),
    );
    assert.doesNotMatch(frenchAge, />Fresh<|>Active<|>Cooling<|>Dormant</);
    const englishAge = renderToStaticMarkup(
      createElement(DiscussionAgeBadge, { discussion }),
    );
    assert.match(englishAge, /Fresh|Active|Cooling|Dormant/);
    const page = read("app/discussions/page.tsx");
    assert.match(page, /copy\.emptyTitle/);
    assert.match(page, /copy\.emptyBody/);
    assert.match(page, /TenantAppShell/);
    assert.doesNotMatch(page, /TenantBackLink/);
    assert.doesNotMatch(page, /AthenaBrandLink/);
  });
});

describe("V31 L3.4 tenant list surfaces — communities list chrome", () => {
  it("localizes application-owned community list chrome and keeps persisted names verbatim", () => {
    assert.equal(read("app/communities/page.tsx").includes('redirect("/intelligence-domains")'), true);
    const card = read(
      "components/intelligenceDomains/IntelligenceDomainRowActions.tsx",
    );
    assert.match(card, /\{domain\.group_name\}/);
    assert.match(card, /\{domain\.notes\}/);
    assert.equal(en.intelligenceDomains.marketLabel, "Market:");
    assert.notEqual(fr.intelligenceDomains.marketLabel, en.intelligenceDomains.marketLabel);
    const frenchStatus = getLocalizedIntelligenceDomainStatus(fr, "active");
    assert.equal(frenchStatus, "Actif");
    assert.equal(getLocalizedIntelligenceDomainStatus(en, "inactive"), "Inactive");
    const stored = "active";
    assert.equal(getLocalizedIntelligenceDomainStatus(es, stored), "Activo");
    assert.equal(stored, "active");

    const englishBadge = renderToStaticMarkup(
      createElement(IntelligenceDomainStatusBadge, { status: "active" }),
    );
    assert.match(englishBadge, /Active/);
    const frenchBadge = renderToStaticMarkup(
      createElement(IntelligenceDomainStatusBadge, {
        status: "active",
        label: getLocalizedIntelligenceDomainStatus(fr, "active"),
      }),
    );
    assert.match(frenchBadge, /Actif/);
    assert.doesNotMatch(frenchBadge, />Active</);
  });
});

describe("V31 L3.4 tenant list surfaces — boundaries", () => {
  it("leaves shared Discussion list badges and EI components free of tenantI18n imports", () => {
    const list = read("app/discussions/page.tsx");
    assert.match(list, /getTenantLocalization/);
    assert.doesNotMatch(list, /discussions\.detail|discussions\.executive/);

    for (const file of [
      "components/discussions/DiscussionLifecycleBadge.tsx",
      "components/discussions/DiscussionAgeBadge.tsx",
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
      "components/discussions/ExecutiveIntelligenceCard.tsx",
      "components/discussions/ExecutiveGenerationPanel.tsx",
      "components/discussions/DiscussionStatusControl.tsx",
    ]) {
      assert.doesNotMatch(read(file), /tenantI18n|getTenantLocalization/);
    }
  });

  it("does not change workers, generation, prompts, or Client language resolution", () => {
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

    const forbidden = [
      /resolveOrganizationLanguage/,
      /getTenantLocalization/,
      /navigator\.language/,
      /accept-language/i,
      /document\.cookie/,
    ];
    const clientHits: string[] = [];
    for (const file of [
      "components/inbox/CaptureDiscussionForm.tsx",
      "components/intelligenceDomains/IntelligenceDomainRowActions.tsx",
      "components/discussions/DiscussionLifecycleBadge.tsx",
      "components/discussions/DiscussionAgeBadge.tsx",
    ]) {
      const source = read(file);
      if (forbidden.some((pattern) => pattern.test(source))) {
        clientHits.push(file);
      }
    }
    assert.deepEqual(clientHits, []);
    assert.equal(
      existsSync(
        join(ROOT, "components/tenantI18n/TenantLocalizationProvider.tsx"),
      ),
      false,
    );
  });

  it("leaves Licensee, Super Admin, and login unchanged", () => {
    for (const file of [
      "app/login/page.tsx",
      "app/licensee/page.tsx",
      "app/super/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /getTenantLocalization|tenantI18n\/messages/);
      assert.doesNotMatch(read(file), /intelligenceDomains|inbox\.title|discussions\.queue/);
    }
  });

  it("keeps all six dictionaries structurally complete after L3.4 expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("intelligenceDomains.createCta"));
    assert.ok(canonical.includes("intelligenceDomains.statusActive"));
    assert.ok(canonical.includes("inbox.importCta"));
    assert.ok(canonical.includes("inbox.domainNone"));
    assert.ok(canonical.includes("discussions.queueProcessed"));
    assert.ok(canonical.includes("discussions.lifecycleReviewing"));
    assert.ok(canonical.includes("discussions.ageDormant"));
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

  it("does not let translated filter or status tokens reach query semantics", () => {
    assert.equal(interpolateTenantMessage(fr.discussions.openDiscussionAria, {
      title: STORED_DISCUSSION_TITLE,
    }).includes(STORED_DISCUSSION_TITLE), true);
    const statusLib = read("lib/discussionStatus.ts");
    assert.match(statusLib, /token === "reviewing"/);
    assert.match(statusLib, /token === "completed" \|\| token === "done"/);
    assert.doesNotMatch(statusLib, /En revue|Terminé|Completado/);
    const queue = read("services/queueService.ts");
    assert.doesNotMatch(queue, /getLocalizedDiscussionQueueTitle|tenantI18n/);
    const card = read(
      "components/intelligenceDomains/IntelligenceDomainRowActions.tsx",
    );
    assert.match(card, /<option value="active">/);
    assert.match(card, /<option value="inactive">/);
    assert.doesNotMatch(card, /value=\{messages\.statusActive\}/);
  });
});

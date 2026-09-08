import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscussionAgeBadge } from "../../components/discussions/DiscussionAgeBadge";
import { DiscussionLifecycleBadge } from "../../components/discussions/DiscussionLifecycleBadge";
import { DiscussionWorkflowStrip } from "../../components/discussions/DiscussionWorkflowStrip";
import { ExecutiveIntelligenceCard } from "../../components/discussions/ExecutiveIntelligenceCard";
import { ExecutiveGenerationPanel } from "../../components/discussions/ExecutiveGenerationPanel";
import { RegenerationCompleteToast } from "../../components/discussions/RegenerationCompleteToast";
import { RegenerationMetadata } from "../../components/discussions/RegenerationMetadata";
import { AthenaRecommendationRibbon } from "../../components/discussions/AthenaRecommendationRibbon";
import { getDiscussionAgeKey } from "../../lib/discussionAge";
import {
  DISCUSSION_STATUS_OPTIONS,
  getDiscussionLifecycle,
} from "../../lib/discussionStatus";
import { presentAnalysisStatus } from "../../lib/discussionExecutiveChrome";
import {
  formatTenantDate,
  formatTenantDateTime,
  toFormattingLocale,
} from "../../lib/tenantI18n/format";
import {
  getLocalizedAnalysisStatusLabel,
  getLocalizedAthenaVerdict,
  getLocalizedDiscussionAgeLabel,
  getLocalizedDiscussionLifecycleLabel,
  getLocalizedDiscussionStatusOptionLabel,
  getLocalizedDiscussionStoredStatusLabel,
  getLocalizedEiConfidenceLabel,
  getLocalizedResponseTiming,
} from "../../lib/tenantI18n/discussionPresentation";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import type { Discussion } from "../../services/discussionService";
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

const STORED_TITLE = "Acme pricing objection in Lyon";
const STORED_BODY = "We cannot approve this quote without a 20% discount.";
const STORED_AUTHOR = "Marie Dupont";
const STORED_URL = "https://example.com/thread/lyon-pricing";
const STORED_SUMMARY =
    "Generated executive summary must remain verbatim.";
const STORED_REASON = "Generated opportunity reason must remain verbatim.";
const STORED_RECOMMENDATION =
    "Generated recommended action must remain verbatim.";
const STORED_PAIN = "Generated pain points must remain verbatim.";
const STORED_SIGNAL = "Generated buyer stage must remain verbatim.";

function sampleDiscussion(overrides: Partial<Discussion> = {}): Discussion {
  return {
    id: "disc-1",
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-20T12:00:00.000Z",
    community_id: "comm-1",
    platform: "linkedin",
    title: STORED_TITLE,
    author: STORED_AUTHOR,
    url: STORED_URL,
    body: STORED_BODY,
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

function sampleAnalysis(
  overrides: Partial<DiscussionAnalysis> = {},
): DiscussionAnalysis {
  return {
    id: "analysis-1",
    created_at: "2026-08-20T15:04:00.000Z",
    updated_at: "2026-08-20T15:10:00.000Z",
    discussion_id: "disc-1",
    organization_id: "org-1",
    user_id: null,
    community_id: null,
    status: "review_ready",
    summary: STORED_SUMMARY,
    sentiment: "neutral",
    intent: "high",
    buyer_stage: STORED_SIGNAL,
    pain_points: STORED_PAIN,
    opportunity_detected: true,
    opportunity_title: "Stored opportunity title",
    opportunity_reason: STORED_REASON,
    recommended_action: STORED_RECOMMENDATION,
    suggested_cta: "",
    risk_level: "medium",
    confidence: 82,
    strategy_key: "elevate",
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: "claude-sonnet-4",
    generation_time_ms: 12000,
    raw_json: null,
    ...overrides,
  };
}

function cardHtml(
  messages: TenantMessages,
  analysis: DiscussionAnalysis = sampleAnalysis(),
) {
  return renderToStaticMarkup(
    createElement(ExecutiveIntelligenceCard, {
      analysis,
      chrome: messages.discussions.executive,
    }),
  );
}

describe("V31 L3.5 tenant discussion detail — chrome", () => {
  it("keeps English detail chrome canonical", () => {
    assert.equal(en.discussions.detail.backToDiscussions, "← Back to Discussions");
    assert.equal(en.discussions.detail.notFound, "Discussion not found");
    assert.equal(en.discussions.detail.eyebrow, "Discussion Intelligence");
    assert.equal(en.discussions.detail.generateIntelligence, "Generate Intelligence");
    assert.equal(en.discussions.executive.heading, "Executive Intelligence");
    assert.equal(en.discussions.executive.whatMatters, "What matters in 30 seconds");
    const page = read("app/discussions/[id]/page.tsx");
    assert.match(page, /getTenantLocalization/);
    assert.match(page, /TenantAppShell/);
    assert.match(page, /TenantBackLink/);
    assert.doesNotMatch(page, /AthenaBrandLink/);
    assert.doesNotMatch(page, /DashboardSidebar/);
    assert.match(page, /copy\.backToDiscussions/);
    assert.match(page, /\{discussion\.title\}/);
    assert.match(page, /\{originalBody \|\| copy\.emptyBody\}/);
    assert.match(page, /assetChrome=\{getSharedAssetChrome\(messages\)\}/);
  });

  it("localizes detail chrome in all five non-English languages", () => {
    for (const [language, dictionary] of Object.entries(DICTIONARIES) as Array<
      [OrganizationLanguage, TenantMessages]
    >) {
      if (language === "en") continue;
      assert.notEqual(
        dictionary.discussions.detail.backToDiscussions,
        en.discussions.detail.backToDiscussions,
      );
      assert.notEqual(
        dictionary.discussions.detail.eyebrow,
        en.discussions.detail.eyebrow,
      );
      assert.notEqual(
        dictionary.discussions.detail.generateIntelligence,
        en.discussions.detail.generateIntelligence,
      );
      assert.notEqual(
        dictionary.discussions.executive.whatMatters,
        en.discussions.executive.whatMatters,
      );
      assert.notEqual(
        dictionary.discussions.executive.emptyDiscussion,
        en.discussions.executive.emptyDiscussion,
      );
    }
    assert.match(fr.discussions.detail.backToDiscussions, /discussions/i);
    assert.match(es.discussions.detail.notFound, /discusi/i);
    assert.match(itMessages.discussions.detail.statusControlLabel, /discussione/i);
    assert.match(de.discussions.detail.workflowProgress, /Workflow/i);
    assert.match(pt.discussions.detail.appendCta, /reprocess/i);
  });

  it("keeps discussion title, body, author, source URL, and user content verbatim", () => {
    const page = read("app/discussions/[id]/page.tsx");
    assert.match(page, /\{discussion\.title\}/);
    assert.match(page, /\{originalBody \|\| copy\.emptyBody\}/);
    assert.match(page, /value=\{discussion\.author\}/);
    assert.match(page, /value=\{discussion\.url\}/);
    assert.match(page, /\{update\.body\}/);
    assert.match(page, /\{update\.author \? <span>\{update\.author\}/);
    assert.doesNotMatch(page, /translateDiscussion|localizeBody|i18n\.title/);
    const frenchCard = cardHtml(fr);
    assert.match(frenchCard, new RegExp(STORED_SUMMARY));
    assert.match(frenchCard, new RegExp(STORED_PAIN));
    assert.match(frenchCard, new RegExp(STORED_RECOMMENDATION));
    assert.doesNotMatch(frenchCard, /Résumé exécutif généré/);
  });
});

describe("V31 L3.5 tenant discussion detail — status", () => {
  it("localizes lifecycle and age presentation without changing stored tokens", () => {
    const stored = "Reviewing";
    assert.equal(getLocalizedDiscussionStoredStatusLabel(en, stored), "Reviewing");
    assert.equal(getLocalizedDiscussionStoredStatusLabel(fr, stored), "En revue");
    assert.equal(getLocalizedDiscussionStoredStatusLabel(es, stored), "En revisión");
    assert.equal(getLocalizedDiscussionStoredStatusLabel(itMessages, stored), "In revisione");
    assert.equal(getLocalizedDiscussionStoredStatusLabel(de, stored), "In Prüfung");
    assert.equal(getLocalizedDiscussionStoredStatusLabel(pt, stored), "Em revisão");
    assert.equal(stored, "Reviewing");
    assert.equal(getLocalizedDiscussionStatusOptionLabel(fr, "Completed"), "Terminé");
    assert.equal(getLocalizedDiscussionStatusOptionLabel(en, "New"), "New");

    const discussion = sampleDiscussion({ status: "Completed" });
    const lifecycle = getDiscussionLifecycle(discussion, true);
    assert.equal(lifecycle.key, "completed");
    const frenchBadge = renderToStaticMarkup(
      createElement(DiscussionLifecycleBadge, {
        discussion,
        hasAnalysis: true,
        label: getLocalizedDiscussionLifecycleLabel(fr, lifecycle.key),
      }),
    );
    assert.match(frenchBadge, /Terminé/);
    assert.doesNotMatch(frenchBadge, />Completed</);
    const ageKey = getDiscussionAgeKey(discussion);
    const frenchAge = renderToStaticMarkup(
      createElement(DiscussionAgeBadge, {
        discussion,
        label: getLocalizedDiscussionAgeLabel(fr, ageKey),
      }),
    );
    assert.match(
      frenchAge,
      new RegExp(getLocalizedDiscussionAgeLabel(fr, ageKey)),
    );
  });

  it("keeps DiscussionStatusControl API tokens canonical", () => {
    const control = read("components/discussions/DiscussionStatusControl.tsx");
    assert.match(control, /JSON\.stringify\(\{ status: nextStatus \}\)/);
    assert.match(control, /DISCUSSION_STATUS_OPTIONS\.map/);
    assert.match(control, /value=\{option\}/);
    assert.match(control, /statusLabels\?\.\[option\] \?\? option/);
    assert.doesNotMatch(control, /tenantI18n|getTenantLocalization/);
    assert.doesNotMatch(control, /value=\{statusLabels/);
    for (const option of DISCUSSION_STATUS_OPTIONS) {
      assert.notEqual(
        getLocalizedDiscussionStatusOptionLabel(fr, option),
        option,
      );
    }
    assert.equal(getLocalizedDiscussionStatusOptionLabel(fr, "New"), "Nouveau");
    assert.equal(getLocalizedDiscussionStatusOptionLabel(fr, "Completed"), "Terminé");
  });
});

describe("V31 L3.5 tenant discussion detail — Executive Intelligence", () => {
  it("localizes EI chrome, generation CTA, progress, empty, and failure fallbacks", () => {
    const englishCard = cardHtml(en);
    assert.match(englishCard, /Executive Intelligence/);
    assert.match(englishCard, /What matters in 30 seconds/);
    const frenchCard = cardHtml(fr);
    assert.match(frenchCard, /L’essentiel en 30 secondes/);
    assert.doesNotMatch(frenchCard, /What matters in 30 seconds/);

    const panel = renderToStaticMarkup(
      createElement(ExecutiveGenerationPanel, {
        startedAtMs: Date.now(),
        chrome: fr.discussions.executive,
      }),
    );
    assert.match(panel, /L’Executive Intelligence est en cours de régénération/);
    assert.match(panel, /Compréhension de la discussion/);
    assert.doesNotMatch(panel, /Understanding discussion/);

    const toast = renderToStaticMarkup(
      createElement(RegenerationCompleteToast, {
        visible: true,
        onViewAnalysis: () => undefined,
        onDismiss: () => undefined,
        title: fr.discussions.executive.toastTitle,
        body: fr.discussions.executive.toastBody,
        viewLabel: fr.discussions.executive.toastView,
        dismissLabel: fr.discussions.executive.toastDismiss,
      }),
    );
    assert.match(toast, /Executive Intelligence prête/);
    assert.match(toast, /Voir l’analyse mise à jour/);

    assert.equal(
      fr.discussions.executive.emptyDiscussion.includes("Athena"),
      true,
    );
    assert.notEqual(
      fr.discussions.executive.generationFailed,
      en.discussions.executive.generationFailed,
    );
    assert.equal(
      en.discussions.detail.generateIntelligence,
      "Generate Intelligence",
    );
    assert.notEqual(
      fr.discussions.detail.generatingIntelligence,
      en.discussions.detail.generatingIntelligence,
    );
  });

  it("localizes confidence and analysis status presentation only", () => {
    const storedStatus = "review_ready";
    assert.equal(
      getLocalizedAnalysisStatusLabel(en, storedStatus),
      "Review ready",
    );
    assert.equal(
      getLocalizedAnalysisStatusLabel(fr, storedStatus),
      "Prêt pour revue",
    );
    assert.equal(storedStatus, "review_ready");
    assert.equal(
      presentAnalysisStatus("review_ready", fr.discussions.executive),
      "Prêt pour revue",
    );
    assert.equal(presentAnalysisStatus("unknown_token", fr.discussions.executive), "unknown_token");
    assert.equal(presentAnalysisStatus("draft", null), "draft");

    assert.equal(getLocalizedEiConfidenceLabel(en, "High"), "High");
    assert.equal(getLocalizedEiConfidenceLabel(fr, "High"), "Élevée");
    assert.equal(getLocalizedEiConfidenceLabel(es, "Low"), "Baja");
    assert.equal(getLocalizedAthenaVerdict(fr, "Worth pursuing"), "À poursuivre");
    assert.equal(getLocalizedResponseTiming(de, "Respond today"), "Heute antworten");

    const frenchCard = cardHtml(fr, sampleAnalysis({ confidence: 82 }));
    assert.match(frenchCard, /Élevée/);
    assert.doesNotMatch(frenchCard, />High</);
  });

  it("keeps generated EI summary, reasons, recommendations, and evidence verbatim", () => {
    const frenchCard = cardHtml(fr);
    assert.match(frenchCard, new RegExp(STORED_SUMMARY));
    assert.match(frenchCard, new RegExp(STORED_PAIN));
    assert.match(frenchCard, new RegExp(STORED_RECOMMENDATION));
    assert.match(frenchCard, new RegExp(STORED_SIGNAL));
    const ribbon = renderToStaticMarkup(
      createElement(AthenaRecommendationRibbon, {
        analysis: sampleAnalysis(),
        chrome: fr.discussions.executive,
      }),
    );
    assert.match(ribbon, /À poursuivre|Surveiller|Priorité faible/);
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /analysisDisplay\.summary/);
    assert.match(workspace, /analysisDisplay\.opportunity_reason/);
    assert.match(workspace, /analysisDisplay\.recommended_action/);
    assert.match(workspace, /version\.models_used/);
    assert.doesNotMatch(workspace, /translateAnalysis|localizeSummary/);
  });
});

describe("V31 L3.5 tenant discussion detail — dates and confirmations", () => {
  it("formats discussion-detail and EI timestamps with the tenant locale", () => {
    const page = read("app/discussions/[id]/page.tsx");
    assert.match(page, /formatTenantDateTime\(update\.capturedAt, language\)/);
    assert.match(page, /locale=\{locale\}/);
    assert.doesNotMatch(page, /toLocaleString\("en-US"/);
    const stamp = "2026-08-20T15:04:00.000Z";
    assert.equal(toFormattingLocale("fr"), "fr-FR");
    assert.ok(formatTenantDateTime(stamp, "fr"));
    assert.ok(formatTenantDate(stamp, "de"));
    const metadata = renderToStaticMarkup(
      createElement(RegenerationMetadata, {
        analysis: sampleAnalysis(),
        generatedAt: stamp,
        chrome: fr.discussions.executive,
        locale: "fr-FR",
      }),
    );
    assert.match(metadata, /Générée/);
    assert.doesNotMatch(metadata, /Generated:/);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /new Intl\.DateTimeFormat\(locale/);
    assert.match(workspace, /toLocaleString\("en-GB"/);
  });

  it("localizes delete confirmation chrome and keeps persisted titles out of the message", () => {
    assert.doesNotMatch(
      en.discussions.detail.deleteConfirm,
      /\{title\}|\{discussion\}/,
    );
    assert.match(
      fr.discussions.detail.deleteConfirm,
      /Supprimer définitivement cette discussion/,
    );
    assert.doesNotMatch(fr.discussions.detail.deleteConfirm, new RegExp(STORED_TITLE));
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /messages\?\.deleteConfirm/);
    assert.match(
      header,
      /Delete this discussion permanently\? This cannot be undone\./,
    );
  });
});

describe("V31 L3.5 tenant discussion detail — boundaries", () => {
  it("does not change Discussion list, personas, prospects, or generation", () => {
    const list = read("app/discussions/page.tsx");
    assert.match(list, /getLocalizedDiscussionQueueTitle/);
    assert.doesNotMatch(list, /discussions\.detail|chrome=\{executive\}/);
    assert.equal(existsSync(join(ROOT, "app/communities/[id]/page.tsx")), true);
    const community = read("app/communities/[id]/page.tsx");
    assert.doesNotMatch(community, /discussions\.detail/);

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
    assert.doesNotMatch(
      read("app/api/discussions/[id]/analyze/route.ts"),
      /tenantI18n|organizationLanguage|language:/,
    );
    assert.doesNotMatch(
      read("components/discussions/DiscussionRegenerationProvider.tsx"),
      /tenantI18n/,
    );
  });

  it("does not add a Client language resolver, browser locale, or global provider", () => {
    const forbidden = [
      /resolveOrganizationLanguage/,
      /getTenantLocalization/,
      /navigator\.language/,
      /accept-language/i,
      /document\.cookie/,
    ];
    const clientHits: string[] = [];
    for (const file of [
      "components/discussions/DiscussionStatusControl.tsx",
      "components/discussions/DiscussionHeaderActions.tsx",
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
      "components/discussions/ExecutiveIntelligenceCard.tsx",
      "components/discussions/ExecutiveGenerationPanel.tsx",
      "components/discussions/DiscussionRegenerationProvider.tsx",
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
      assert.doesNotMatch(read(file), /discussions\.detail|discussions\.executive/);
    }
  });

  it("keeps all six dictionaries structurally complete after L3.5 expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("discussions.detail.backToDiscussions"));
    assert.ok(canonical.includes("discussions.detail.generateIntelligence"));
    assert.ok(canonical.includes("discussions.executive.heading"));
    assert.ok(canonical.includes("discussions.executive.analysisStatusReviewReady"));
    assert.ok(canonical.includes("discussions.executive.generationFailed"));
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

  it("does not localize update_location on Discussion EI and keeps workflow helper English", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const card = read("components/discussions/ExecutiveIntelligenceCard.tsx");
    assert.doesNotMatch(workspace, /update_location/);
    assert.doesNotMatch(card, /update_location/);
    const workflow = read("lib/discussionWorkflow.ts");
    assert.match(workflow, /label: "Analysis"/);
    assert.match(workflow, /Current Status: \$\{statusLabel\}/);
    const strip = renderToStaticMarkup(
      createElement(DiscussionWorkflowStrip, {
        steps: [
          {
            key: "analysis",
            label: fr.discussions.detail.workflowAnalysis,
            complete: true,
            current: false,
          },
        ],
        title: fr.discussions.detail.workflowProgress,
      }),
    );
    assert.match(strip, /Progression du workflow/);
    assert.match(strip, /Analyse/);
  });

  it("interpolates archived viewing chrome without translating generated timestamps", () => {
    const when = "20 août 2026, 17:04";
    const text = interpolateTenantMessage(
      fr.discussions.executive.viewingArchived,
      { when },
    );
    assert.match(text, /20 août 2026, 17:04/);
    assert.match(text, /Athena/);
  });
});

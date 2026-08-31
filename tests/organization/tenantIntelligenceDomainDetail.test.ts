import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DomainHealthCard } from "../../components/intelligenceDomains/DomainHealthCard";
import { DomainIntelligenceSections } from "../../components/intelligenceDomains/DomainIntelligenceSections";
import { DomainLearningEmptyState } from "../../components/intelligenceDomains/DomainLearningEmptyState";
import { IntelligenceDomainStatusBadge } from "../../components/intelligenceDomains/IntelligenceDomainStatusBadge";
import { LearningTimeline } from "../../components/intelligenceDomains/LearningTimeline";
import { getDomainHealthStateColor } from "../../lib/domainHealthDisplay";
import {
  formatTenantTimelineDateTime,
  formatTenantTimelineDateTimeLocale,
  toFormattingLocale,
} from "../../lib/tenantI18n/format";
import {
  getLocalizedDomainHealthLabel,
  getLocalizedDomainIntelligenceSectionTitle,
  getLocalizedDomainLearningEventTitle,
} from "../../lib/tenantI18n/intelligenceDomainPresentation";
import { getLocalizedIntelligenceDomainStatus } from "../../lib/tenantI18n/intelligenceDomainStatus";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import type { CommunityIntelligence } from "../../services/communityIntelligenceService";
import type { DomainHealth, DomainLearningEvent } from "../../services/intelligenceDomainService";
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

const PRODUCT_TERMS = [
  "Athena",
  "ATHENA",
  "GetOblic",
  "Ask Athena",
  "Think Differently",
  "Athena Brain",
  "Intelligence OS",
  "Deep Scrape",
  "Executive Intelligence",
  "Strategic Asset Blueprint",
  "Social Planner",
  "Intelligence Domains",
  "Deployment Assets",
] as const;

const STORED_EXECUTIVE =
  "Generated executive summary must remain verbatim.";
const STORED_TERMINOLOGY = "Generated terminology must remain verbatim.";
const STORED_TIMELINE_DETAIL =
  "Generated timeline excerpt must remain verbatim.";
const ARBITRARY_ERROR = "WORKER_DOMAIN_TIMEOUT: upstream model 503";

function sampleHealth(
  overrides: Partial<DomainHealth> = {},
): DomainHealth {
  return {
    statusLabel: "Active",
    isActive: true,
    knowledgeConfidence: 72,
    confidenceDelta: 4,
    healthLabel: "Mature",
    healthTone: "strong",
    ...overrides,
  };
}

function sampleEvent(
  overrides: Partial<DomainLearningEvent> = {},
): DomainLearningEvent {
  return {
    id: "intel-1",
    title: "Domain intelligence refreshed",
    detail: STORED_TIMELINE_DETAIL,
    timestamp: "2026-08-20T15:04:00.000Z",
    kind: "intelligence",
    ...overrides,
  };
}

function sampleIntelligence(
  overrides: Partial<CommunityIntelligence> = {},
): CommunityIntelligence {
  return {
    id: "intel-1",
    organization_id: "org-1",
    community_id: "comm-1",
    created_at: "2026-08-20T15:04:00.000Z",
    updated_at: "2026-08-20T15:04:00.000Z",
    status: "ready",
    executive_summary: STORED_EXECUTIVE,
    market_trends: "Generated trends must remain verbatim.",
    recurring_pain_points: null,
    recurring_objections: "Generated objections must remain verbatim.",
    recurring_questions: "Generated questions must remain verbatim.",
    buyer_stage_distribution: null,
    high_value_opportunities: null,
    recommended_campaigns: null,
    recommended_content: "Generated content angles must remain verbatim.",
    recommended_lead_magnets: null,
    recommended_webinars: null,
    strategic_recommendations: "Generated competitors must remain verbatim.",
    confidence: 81,
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: null,
    generation_time_ms: null,
    raw_json: {
      terminology: STORED_TERMINOLOGY,
    },
    ...overrides,
  };
}

describe("V31 L3.10.1 tenant Intelligence Domain detail — authority", () => {
  it("resolves tenant localization once at the /communities/[id] server boundary", () => {
    const page = read("app/communities/[id]/page.tsx");
    assert.match(page, /getTenantLocalization\(\)/);
    assert.equal((page.match(/getTenantLocalization\(\)/g) ?? []).length, 1);
    assert.match(page, /const \[\{ language, locale, messages \}/);
    assert.doesNotMatch(page, /navigator\.language|accept-language/i);
    assert.doesNotMatch(page, /document\.cookie/);
    assert.doesNotMatch(page, /TenantLocalizationProvider/);
    assert.equal(
      existsSync(join(ROOT, "app/intelligence-domains/[id]/page.tsx")),
      false,
    );
    assert.equal(
      read("app/communities/page.tsx").includes(
        'redirect("/intelligence-domains")',
      ),
      true,
    );
  });

  it("does not add Client or browser language authority", () => {
    const forbidden = [
      /resolveOrganizationLanguage/,
      /getTenantLocalization/,
      /navigator\.language/,
      /accept-language/i,
      /document\.cookie/,
    ];
    const clientHits: string[] = [];
    for (const file of [
      "components/intelligenceDomains/IntelligenceDomainHeaderActions.tsx",
      "components/communities/GenerateCommunityIntelligenceButton.tsx",
      "components/intelligenceDomains/IntelligenceDomainStatusBadge.tsx",
      "components/branding/AthenaBrandLink.tsx",
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
});

describe("V31 L3.10.1 tenant Intelligence Domain detail — chrome", () => {
  it("keeps English detail chrome canonical", () => {
    assert.equal(
      en.intelligenceDomains.detail.backToDomains,
      "← Back to Intelligence Domains",
    );
    assert.equal(
      en.intelligenceDomains.detail.notFound,
      "Intelligence Domain not found",
    );
    assert.equal(en.intelligenceDomains.detail.eyebrow, "Intelligence Domain");
    assert.equal(
      en.intelligenceDomains.detail.subtitle,
      "Executive intelligence for this monitored market domain.",
    );
    assert.equal(
      en.intelligenceDomains.detail.understandingTitle,
      "Athena's Understanding",
    );
    assert.equal(en.intelligenceDomains.detail.confidenceLabel, "Confidence:");
    assert.equal(en.intelligenceDomains.detail.notesTitle, "Notes");
    assert.equal(en.intelligenceDomains.detail.notesEmpty, "No notes yet.");
    assert.equal(
      en.intelligenceDomains.detail.refreshIntelligence,
      "Refresh Intelligence",
    );
    assert.equal(en.intelligenceDomains.open, "Open");
    const page = read("app/communities/[id]/page.tsx");
    assert.match(page, /TenantBackLink/);
    assert.match(page, /copy\.backToDomains/);
    assert.match(page, /\{community\.group_name\}/);
    assert.match(page, /\{community\.notes \|\| copy\.notesEmpty\}/);
    assert.match(page, /\{discussion\.title\}/);
    assert.match(page, /\{discussion\.status\}/);
    assert.match(page, /\{latestIntelligence\.executive_summary\}/);
  });

  it("localizes French detail chrome", () => {
    assert.equal(
      fr.intelligenceDomains.detail.backToDomains,
      "← Retour aux Intelligence Domains",
    );
    assert.equal(
      fr.intelligenceDomains.detail.understandingTitle,
      "La compréhension d’Athena",
    );
    assert.notEqual(
      fr.intelligenceDomains.detail.subtitle,
      en.intelligenceDomains.detail.subtitle,
    );
    assert.notEqual(
      fr.intelligenceDomains.detail.refreshIntelligence,
      en.intelligenceDomains.detail.refreshIntelligence,
    );
    assert.equal(fr.intelligenceDomains.open, "Ouvrir");
    assert.equal(fr.chrome.logOut, "Se déconnecter");
    assert.equal(fr.chrome.tagline, "Intelligence OS");
  });

  it("has structurally complete Spanish, Italian, German, and Portuguese keys", () => {
    const canonical = collectKeyPaths(en.intelligenceDomains.detail);
    assert.ok(canonical.includes("backToDomains"));
    assert.ok(canonical.includes("healthMature"));
    assert.ok(canonical.includes("eventIntelligence"));
    assert.ok(canonical.includes("sectionTerminology"));
    for (const language of ["es", "it", "de", "pt"] as OrganizationLanguage[]) {
      const paths = collectKeyPaths(DICTIONARIES[language].intelligenceDomains.detail);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing detail keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra detail keys`,
      );
      assert.notEqual(
        DICTIONARIES[language].intelligenceDomains.detail.subtitle,
        en.intelligenceDomains.detail.subtitle,
        `${language} subtitle should be localized`,
      );
    }
  });

  it("keeps all six dictionaries structurally identical", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("intelligenceDomains.detail.backToDomains"));
    assert.ok(canonical.includes("intelligenceDomains.detail.eventImport"));
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

  it("keeps locked product terms exact", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      if (language === "en") continue;
      const other = DICTIONARIES[language];
      assert.equal(other.chrome.tagline, "Intelligence OS");
      assert.equal(other.intelligenceDomains.title, "Intelligence Domains");
      assert.match(other.intelligenceDomains.detail.backToDomains, /Intelligence Domains/);
      assert.match(other.intelligenceDomains.detail.eyebrow, /Intelligence Domain/);
      assert.match(other.intelligenceDomains.detail.understandingTitle, /Athena/);
    }
    const englishLeaves = collectKeyPaths(en.intelligenceDomains.detail);
    for (const language of ORGANIZATION_LANGUAGES) {
      if (language === "en") continue;
      const dictionary = DICTIONARIES[language].intelligenceDomains.detail;
      const english = en.intelligenceDomains.detail;
      for (const path of englishLeaves) {
        const englishValue = path
          .split(".")
          .reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], english);
        const translated = path
          .split(".")
          .reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], dictionary);
        if (typeof englishValue !== "string" || typeof translated !== "string") {
          continue;
        }
        for (const term of PRODUCT_TERMS) {
          if (!englishValue.includes(term)) continue;
          assert.ok(
            translated.includes(term),
            `${language} intelligenceDomains.detail.${path} must keep "${term}"`,
          );
        }
      }
    }
  });
});

describe("V31 L3.10.1 tenant Intelligence Domain detail — persisted values", () => {
  it("keeps stored group_name, notes, discussion titles, and generated intelligence verbatim", () => {
    const page = read("app/communities/[id]/page.tsx");
    assert.match(page, /\{community\.group_name\}/);
    assert.match(page, /\{community\.notes \|\| copy\.notesEmpty\}/);
    assert.match(page, /\{community\.niche\}/);
    assert.match(page, /\{community\.platform\}/);
    assert.match(page, /\{community\.owner\}/);
    assert.match(page, /\{community\.group_url\}/);
    assert.match(page, /\{discussion\.title\}/);
    assert.match(page, /\{discussion\.opportunity_score\}/);
    assert.match(page, /\{latestIntelligence\.executive_summary\}/);
    assert.doesNotMatch(page, /translate\(community\.group_name/);
    const html = renderToStaticMarkup(
      createElement(DomainIntelligenceSections, {
        intelligence: sampleIntelligence(),
        messages: fr,
      }),
    );
    assert.match(html, new RegExp(STORED_TERMINOLOGY));
    assert.match(html, /Generated questions must remain verbatim/);
    assert.doesNotMatch(html, /Terminologie[\s\S]*Generated terminology must remain verbatim[\s\S]*Terminologie/);
  });

  it("keeps raw discussion.status and active/inactive DB tokens unchanged", () => {
    const page = read("app/communities/[id]/page.tsx");
    assert.match(page, /\{discussion\.status\}/);
    assert.doesNotMatch(page, /getLocalizedDiscussionStoredStatusLabel/);
    const header = read(
      "components/intelligenceDomains/IntelligenceDomainHeaderActions.tsx",
    );
    assert.match(header, /<option value="active">/);
    assert.match(header, /<option value="inactive">/);
    assert.match(header, /domain\.status === "active" \? "inactive" : "active"/);
    assert.match(header, /JSON\.stringify\(\{\s*status: nextStatus/);
    assert.doesNotMatch(header, /value=\{messages\?\.statusActive\}/);
    assert.match(header, /method: "PATCH"/);
    assert.match(header, /method: "DELETE"/);
    assert.match(header, /router\.push\("\/intelligence-domains"\)/);
  });
});

describe("V31 L3.10.1 tenant Intelligence Domain detail — status and health", () => {
  it("localizes status badge presentation without changing the stored token", () => {
    assert.equal(getLocalizedIntelligenceDomainStatus(en, "active"), "Active");
    assert.equal(getLocalizedIntelligenceDomainStatus(fr, "active"), "Actif");
    assert.equal(getLocalizedIntelligenceDomainStatus(fr, "inactive"), "Inactif");
    const page = read("app/communities/[id]/page.tsx");
    assert.match(page, /status=\{community\.status\}/);
    assert.match(page, /getLocalizedIntelligenceDomainStatus\(messages, community\.status\)/);
    const english = renderToStaticMarkup(
      createElement(IntelligenceDomainStatusBadge, {
        status: "active",
        size: "lg",
        label: getLocalizedIntelligenceDomainStatus(en, "active"),
      }),
    );
    assert.match(english, /Active/);
    const french = renderToStaticMarkup(
      createElement(IntelligenceDomainStatusBadge, {
        status: "active",
        size: "lg",
        label: getLocalizedIntelligenceDomainStatus(fr, "active"),
      }),
    );
    assert.match(french, /Actif/);
    assert.doesNotMatch(french, />Active</);
  });

  it("keeps health-state tokens canonical and localizes the visible label from the token", () => {
    assert.equal(getLocalizedDomainHealthLabel(en, "Mature"), "Mature");
    assert.equal(getLocalizedDomainHealthLabel(fr, "Mature"), "Mature");
    assert.equal(getLocalizedDomainHealthLabel(fr, "Learning"), "Apprentissage");
    assert.equal(getLocalizedDomainHealthLabel(fr, "Building"), "Construction");
    assert.equal(getLocalizedDomainHealthLabel(fr, "Confident"), "Confiant");
    assert.equal(getLocalizedDomainHealthLabel(es, "unknown-token"), "unknown-token");
    const card = read("components/intelligenceDomains/DomainHealthCard.tsx");
    assert.match(card, /getDomainHealthStateColor\(health\.healthLabel\)/);
    assert.match(card, /\{healthLabel\}/);
    assert.doesNotMatch(card, /getLocalizedDomainHealthLabel\(.*health\.healthLabel\)/);
    const english = renderToStaticMarkup(
      createElement(DomainHealthCard, {
        health: sampleHealth(),
        copy: en.intelligenceDomains.detail,
        healthLabel: getLocalizedDomainHealthLabel(en, "Mature"),
      }),
    );
    assert.match(english, /Mature/);
    assert.match(english, /Domain Health/);
    const french = renderToStaticMarkup(
      createElement(DomainHealthCard, {
        health: sampleHealth(),
        copy: fr.intelligenceDomains.detail,
        healthLabel: getLocalizedDomainHealthLabel(fr, "Mature"),
      }),
    );
    assert.match(french, /Santé du domaine/);
    assert.match(french, /Mature/);
    assert.equal(
      getDomainHealthStateColor("Mature"),
      "text-[var(--athena-success)]",
    );
    assert.equal(
      getDomainHealthStateColor("Learning"),
      "text-white/55",
    );
  });
});

describe("V31 L3.10.1 tenant Intelligence Domain detail — timeline and sections", () => {
  it("localizes timeline titles from event.kind and keeps detail verbatim", () => {
    assert.equal(
      getLocalizedDomainLearningEventTitle(en, "intelligence"),
      "Domain intelligence refreshed",
    );
    assert.equal(
      getLocalizedDomainLearningEventTitle(fr, "intelligence"),
      "Intelligence du domaine actualisée",
    );
    assert.equal(
      getLocalizedDomainLearningEventTitle(fr, "import"),
      "Discussion importée",
    );
    assert.equal(
      getLocalizedDomainLearningEventTitle(fr, "analysis"),
      "Discussion analysée",
    );
    assert.equal(
      getLocalizedDomainLearningEventTitle(fr, "unknown-kind", "Raw title"),
      "Raw title",
    );
    const html = renderToStaticMarkup(
      createElement(LearningTimeline, {
        events: [sampleEvent()],
        messages: fr,
        language: "fr",
        locale: "fr-FR",
      }),
    );
    assert.match(html, /Intelligence du domaine actualisée/);
    assert.match(html, new RegExp(STORED_TIMELINE_DETAIL));
    assert.doesNotMatch(html, />Domain intelligence refreshed</);
    const timeline = read("components/intelligenceDomains/LearningTimeline.tsx");
    assert.match(timeline, /getLocalizedDomainLearningEventTitle/);
    assert.match(timeline, /event\.kind/);
    assert.match(timeline, /\{event\.detail\}/);
    assert.doesNotMatch(timeline, /toLocaleString\("en-US"\)/);
    assert.doesNotMatch(timeline, /en-US/);
    assert.match(timeline, /formatTenantTimelineDateTimeLocale/);
    assert.match(timeline, /event\.timestamp/);
    assert.doesNotMatch(timeline, /event\.kind\s*=/);
    assert.match(timeline, /\{event\.detail\}/);
  });

  it("protects the Learning Timeline date-shape contract in the current formatter", () => {
    const formatSource = read("lib/tenantI18n/format.ts");
    const timeline = read("components/intelligenceDomains/LearningTimeline.tsx");
    const start = formatSource.indexOf("const TIMELINE_DATETIME_FORMAT");
    assert.ok(start >= 0, "TIMELINE_DATETIME_FORMAT must exist");
    const end = formatSource.indexOf("};", start);
    const timelineFormat = formatSource.slice(start, end + 2);
    assert.match(timelineFormat, /month:\s*"short"/);
    assert.match(timelineFormat, /day:\s*"numeric"/);
    assert.match(timelineFormat, /hour:\s*"numeric"/);
    assert.match(timelineFormat, /minute:\s*"2-digit"/);
    assert.doesNotMatch(timelineFormat, /year:/);
    assert.doesNotMatch(timelineFormat, /weekday:/);
    assert.doesNotMatch(timelineFormat, /timeZone:/);
    assert.doesNotMatch(timelineFormat, /second:/);
    const generalStart = formatSource.indexOf("const DATETIME_FORMAT");
    const generalEnd = formatSource.indexOf("};", generalStart);
    const generalFormat = formatSource.slice(generalStart, generalEnd + 2);
    assert.match(generalFormat, /year:\s*"numeric"/);
    assert.notEqual(timelineFormat.includes("year:"), true);
    assert.match(timeline, /formatTenantTimelineDateTimeLocale/);
    assert.match(timeline, /formatTenantTimelineDateTime/);
    assert.match(timeline, /event\.timestamp/);
    assert.doesNotMatch(timeline, /toLocaleString\("en-US"\)/);
    assert.doesNotMatch(timeline, /en-US/);
    assert.doesNotMatch(
      read("services/intelligenceDomainService.ts"),
      /tenantI18n/,
    );
  });

  it("formats timeline dates with the tenant locale and preserves month/day/time", () => {
    const stamp = "2026-08-20T15:04:00.000Z";
    const timelineOptions: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    const expectedLocales = {
      en: "en-US",
      fr: "fr-FR",
      es: "es-ES",
      it: "it-IT",
      de: "de-DE",
      pt: "pt-PT",
    } as const satisfies Record<OrganizationLanguage, string>;

    for (const language of ORGANIZATION_LANGUAGES) {
      const locale = expectedLocales[language];
      assert.equal(toFormattingLocale(language), locale);
      const formatted = formatTenantTimelineDateTime(stamp, language);
      assert.equal(
        formatted,
        formatTenantTimelineDateTimeLocale(stamp, locale),
      );
      assert.equal(
        formatted,
        new Intl.DateTimeFormat(locale, timelineOptions).format(
          new Date(stamp),
        ),
      );
      const types = new Set(
        new Intl.DateTimeFormat(locale, timelineOptions)
          .formatToParts(new Date(stamp))
          .map((part) => part.type),
      );
      assert.equal(types.has("month"), true, `${language} month`);
      assert.equal(types.has("day"), true, `${language} day`);
      assert.equal(types.has("hour"), true, `${language} hour`);
      assert.equal(types.has("minute"), true, `${language} minute`);
      assert.equal(types.has("year"), false, `${language} year absent`);
      assert.doesNotMatch(formatted, /2026/);
      const html = renderToStaticMarkup(
        createElement(LearningTimeline, {
          events: [sampleEvent({ timestamp: stamp, kind: "intelligence" })],
          messages: DICTIONARIES[language],
          language,
          locale,
        }),
      );
      assert.equal(html.includes(formatted), true);
      assert.equal(html.includes(STORED_TIMELINE_DETAIL), true);
      assert.doesNotMatch(html, /2026/);
    }

    assert.notEqual(
      formatTenantTimelineDateTime(stamp, "fr"),
      formatTenantTimelineDateTime(stamp, "en"),
    );
    const formatSource = read("lib/tenantI18n/format.ts");
    assert.match(formatSource, /TIMELINE_DATETIME_FORMAT/);
    assert.doesNotMatch(
      formatSource.slice(
        formatSource.indexOf("TIMELINE_DATETIME_FORMAT"),
        formatSource.indexOf(
          "}",
          formatSource.indexOf("TIMELINE_DATETIME_FORMAT"),
        ) + 1,
      ),
      /year:|weekday:|timeZone:|second:/,
    );
    const page = read("app/communities/[id]/page.tsx");
    assert.match(page, /language=\{language\}/);
    assert.match(page, /locale=\{locale\}/);
  });

  it("localizes intelligence section headings and keeps generated values verbatim", () => {
    assert.equal(
      getLocalizedDomainIntelligenceSectionTitle(en, "terminology"),
      "Terminology",
    );
    assert.equal(
      getLocalizedDomainIntelligenceSectionTitle(fr, "terminology"),
      "Terminologie",
    );
    const html = renderToStaticMarkup(
      createElement(DomainIntelligenceSections, {
        intelligence: sampleIntelligence(),
        messages: fr,
      }),
    );
    assert.match(html, /Terminologie/);
    assert.match(html, /Concurrents \/ Alternatives/);
    assert.match(html, new RegExp(STORED_TERMINOLOGY));
    assert.doesNotMatch(html, />Terminology</);
  });

  it("localizes the learning empty-state chrome", () => {
    const english = renderToStaticMarkup(
      createElement(DomainLearningEmptyState, {
        copy: en.intelligenceDomains.detail,
      }),
    );
    assert.match(english, /Learning Phase/);
    const french = renderToStaticMarkup(
      createElement(DomainLearningEmptyState, {
        copy: fr.intelligenceDomains.detail,
      }),
    );
    assert.match(french, /Phase d’apprentissage/);
    assert.match(french, /Athena est prête à apprendre ce marché/);
  });
});

describe("V31 L3.10.1 tenant Intelligence Domain detail — session and refresh", () => {
  it("passes localized logout and session chrome to AthenaBrandLink", () => {
    const page = read("app/communities/[id]/page.tsx");
    assert.match(page, /logoutLabel=\{messages\.chrome\.logOut\}/);
    assert.match(page, /sessionActionsLabel=\{messages\.chrome\.sessionActions\}/);
    assert.match(page, /tagline=\{messages\.chrome\.tagline\}/);
    const brand = read("components/branding/AthenaBrandLink.tsx");
    assert.match(brand, /tagline = "Intelligence OS"/);
    assert.doesNotMatch(brand, /getTenantLocalization|tenantI18n\/messages/);
  });

  it("does not add a language field to the refresh request", () => {
    const button = read(
      "components/communities/GenerateCommunityIntelligenceButton.tsx",
    );
    assert.match(
      button,
      /`\/api\/communities\/\$\{communityId\}\/intelligence`/,
    );
    assert.match(button, /method: "POST"/);
    assert.doesNotMatch(button, /language:/);
    assert.doesNotMatch(button, /locale:/);
    assert.doesNotMatch(button, /JSON\.stringify/);
    assert.match(
      button,
      /chrome\?\.refreshIntelligence \?\? "Refresh Intelligence"/,
    );
    assert.match(
      button,
      /chrome\?\.refreshFailed \?\? "Failed to generate community intelligence"/,
    );
    assert.match(button, /chrome\?\.unknownError \?\? "Unknown error"/);
  });

  it("preserves arbitrary server error text", () => {
    const header = read(
      "components/intelligenceDomains/IntelligenceDomainHeaderActions.tsx",
    );
    const button = read(
      "components/communities/GenerateCommunityIntelligenceButton.tsx",
    );
    assert.match(header, /payload\.error \|\| updateFailed/);
    assert.match(header, /saveError instanceof Error \? saveError\.message/);
    assert.match(button, /data\.error \|\| refreshFailed/);
    assert.match(button, /err instanceof Error \? err\.message/);
    assert.doesNotMatch(header, /translateError|localizeError/);
    assert.doesNotMatch(button, /translateError|localizeError/);
    assert.equal(
      interpolateTenantMessage(fr.intelligenceDomains.detail.disableConfirmLinkedOne, {
        count: 1,
      }).includes("Athena"),
      true,
    );
    assert.ok(ARBITRARY_ERROR.includes("WORKER_DOMAIN_TIMEOUT"));
  });
});

describe("V31 L3.10.1 tenant Intelligence Domain detail — generation and boundaries", () => {
  it("does not import tenantI18n into intelligenceDomainService, prompts, or workers", () => {
    assert.doesNotMatch(
      read("services/intelligenceDomainService.ts"),
      /tenantI18n/,
    );
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
      read("app/api/communities/[id]/intelligence/route.ts"),
      /tenantI18n|language:/,
    );
    assert.doesNotMatch(
      read("app/api/communities/[id]/production-intelligence/route.ts"),
      /tenantI18n|language:/,
    );
    const service = read("services/intelligenceDomainService.ts");
    assert.match(service, /title: "Domain intelligence refreshed"/);
    assert.match(service, /kind: "intelligence"/);
    assert.match(service, /title: "Discussion imported"/);
    assert.match(service, /kind: "import"/);
  });

  it("does not start L3.11 and keeps import / login / Licensee isolation", () => {
    assert.doesNotMatch(
      read("app/personas/page.tsx"),
      /intelligenceDomains\.detail/,
    );
    assert.doesNotMatch(
      read("app/prospects/page.tsx"),
      /intelligenceDomains\.detail/,
    );
    assert.doesNotMatch(
      read("components/deployment/CopyButton.tsx"),
      /intelligenceDomains\.detail/,
    );
    assert.doesNotMatch(
      read("components/deployment/ContinueButton.tsx"),
      /intelligenceDomains\.detail/,
    );
    assert.equal(
      existsSync(join(ROOT, "app/intelligence-domains/[id]/page.tsx")),
      false,
    );
    assert.doesNotMatch(
      read("app/login/page.tsx"),
      /getTenantLocalization|intelligenceDomains\.detail/,
    );
    assert.doesNotMatch(
      read("app/licensee/page.tsx"),
      /getTenantLocalization|intelligenceDomains\.detail/,
    );
    assert.doesNotMatch(
      read("app/super/page.tsx"),
      /getTenantLocalization|intelligenceDomains\.detail/,
    );
  });
});

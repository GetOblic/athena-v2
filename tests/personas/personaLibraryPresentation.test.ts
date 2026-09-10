import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { PersonasLibraryClient } from "../../components/personas/PersonasLibraryClient";
import { TractionPageHeader } from "../../components/traction/TractionPageHeader";
import { TractionSiblingNav } from "../../components/traction/TractionSiblingNav";
import {
  DEFAULT_PERSONA_LIBRARY_SORT,
  sortPersonaLibraryRows,
} from "../../lib/personas/personaLibrarySort";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import type { PersonaLibraryRow } from "../../services/personas/personaLibraryEnrichment";

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

function row(
  partial: Partial<PersonaLibraryRow> & {
    id: string;
    display_label: string;
    updated_at: string;
  },
): PersonaLibraryRow {
  return {
    id: partial.id,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: partial.updated_at,
    organization_id: "org-a",
    user_id: null,
    community_id: null,
    persona_name: partial.display_label,
    short_description:
      "short_description" in partial
        ? (partial.short_description ?? null)
        : "Busy hair salon owner juggling bookings.",
    category:
      "category" in partial ? (partial.category ?? null) : "Small Business Owner",
    gender_identity: null,
    age_range: null,
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: null,
    state: null,
    city: null,
    location_summary: null,
    languages: null,
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: null,
    seniority: null,
    industry_context: null,
    lifestyle: null,
    interests: null,
    digital_behavior: null,
    brands_influences: null,
    values_text: null,
    aesthetic_preferences: null,
    preferred_imagery: null,
    goals: null,
    needs: null,
    pain_points: null,
    fears: null,
    motivations: null,
    objections: null,
    buying_triggers: null,
    decision_criteria: null,
    purchase_behavior: null,
    typical_concerns: null,
    communication_style: null,
    preferred_channels: null,
    reference_website: partial.reference_website ?? "https://example.com",
    notes: null,
    additional_context: null,
    ads_content: null,
    source: "manual",
    status: "Ready",
    lifecycle_status: "New",
    opportunity_score: 77,
    priority: 1,
    profile_json: null,
    raw_json: null,
    reference_website_intelligence: null,
    last_activity: null,
    import_batch_id: null,
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
    display_label: partial.display_label,
    display_status: partial.display_status ?? "Ready",
    display_lifecycle_status: partial.display_lifecycle_status ?? "New",
    display_opportunity_score: 77,
    display_opportunity_score_label: "77",
    display_location:
      "display_location" in partial
        ? (partial.display_location ?? null)
        : "South Florida",
    display_reference_website: "example.com",
    display_confidence: partial.display_confidence ?? null,
  };
}

describe("persona library sort", () => {
  it("defaults to recently updated and sorts names and dates", () => {
    assert.equal(DEFAULT_PERSONA_LIBRARY_SORT, "updated_desc");
    const rows = [
      row({
        id: "old",
        display_label: "Zed",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "new",
        display_label: "Ann",
        updated_at: "2026-09-01T00:00:00.000Z",
      }),
    ];
    assert.deepEqual(
      sortPersonaLibraryRows(rows, "updated_desc").map((item) => item.id),
      ["new", "old"],
    );
    assert.deepEqual(
      sortPersonaLibraryRows(rows, "updated_asc").map((item) => item.id),
      ["old", "new"],
    );
    assert.deepEqual(
      sortPersonaLibraryRows(rows, "name_asc").map((item) => item.id),
      ["new", "old"],
    );
    assert.deepEqual(
      sortPersonaLibraryRows(rows, "name_desc").map((item) => item.id),
      ["old", "new"],
    );
  });

  it("sorts confidence with unscored last and newer updated as the tie-break", () => {
    const rows = [
      row({
        id: "high-old",
        display_label: "High old",
        updated_at: "2026-01-01T00:00:00.000Z",
        display_confidence: 90,
      }),
      row({
        id: "high-new",
        display_label: "High new",
        updated_at: "2026-09-01T00:00:00.000Z",
        display_confidence: 90,
      }),
      row({
        id: "mid",
        display_label: "Mid",
        updated_at: "2026-08-01T00:00:00.000Z",
        display_confidence: 70,
      }),
      row({
        id: "low",
        display_label: "Low",
        updated_at: "2026-07-01T00:00:00.000Z",
        display_confidence: 40,
      }),
      row({
        id: "zero",
        display_label: "Zero",
        updated_at: "2026-09-08T00:00:00.000Z",
        display_confidence: 0,
      }),
      row({
        id: "missing",
        display_label: "Missing",
        updated_at: "2026-09-09T00:00:00.000Z",
        display_confidence: null,
      }),
    ];

    assert.deepEqual(
      sortPersonaLibraryRows(rows, "confidence_desc").map((item) => item.id),
      ["high-new", "high-old", "mid", "low", "missing", "zero"],
    );
    assert.deepEqual(
      sortPersonaLibraryRows(rows, "confidence_asc").map((item) => item.id),
      ["low", "mid", "high-new", "high-old", "missing", "zero"],
    );
  });
});

describe("persona library presentation", () => {
  it("moves Create audience into the header and removes the toolbar duplicate", () => {
    const page = read("app/personas/page.tsx");
    const client = read("components/personas/PersonasLibraryClient.tsx");
    const header = read("components/traction/TractionPageHeader.tsx");
    assert.match(page, /action=\{/);
    assert.match(page, /UserPlus/);
    assert.match(page, /href="\/personas\/import"/);
    assert.match(page, /copy\.list\.createCta/);
    assert.match(header, /action\?: ReactNode/);
    assert.match(client, /emptyTitle/);
    assert.doesNotMatch(client, /href="\/personas\/import"/);
    assert.doesNotMatch(client, /createFirstCta/);
    assert.doesNotMatch(client, /sortCreated|value="created"/);
    assert.match(client, /confidence_desc/);
    assert.match(client, /persona\.short_description/);
    assert.match(client, /const shortDescription = persona\.short_description/);
    assert.match(client, /PersonaConfidenceScore[\s\S]*shortDescription \?/);
    assert.match(client, /line-clamp-2/);
    assert.doesNotMatch(client, /line-clamp-3/);
    assert.doesNotMatch(client, /sm:hidden|md:hidden|lg:hidden|max-sm:hidden/);
    assert.doesNotMatch(client, /Opportunity Score|display_opportunity_score_label/);
    assert.match(client, /persona\.reference_website/);
    assert.doesNotMatch(
      client,
      /persona\.display_reference_website \?/,
    );
    assert.match(client, /display_lifecycle_status !== "New"/);
    assert.match(client, /const PAGE_SIZE = 25/);
  });

  it("renders a condensed scored card and hides New lifecycle plus opportunity", () => {
    const html = renderToStaticMarkup(
      createElement(PersonasLibraryClient, {
        personas: [
          row({
            id: "p1",
            display_label: "Maria Rodriguez, Salon Owner",
            updated_at: "2026-09-08T00:00:00.000Z",
            display_confidence: 90,
            display_status: "Ready",
            display_lifecycle_status: "New",
          }),
        ],
        messages: en,
        language: "en",
      }),
    );
    assert.match(html, /Maria Rodriguez, Salon Owner/);
    assert.match(html, /Small Business Owner · South Florida/);
    assert.match(html, /Busy hair salon owner juggling bookings/);
    assert.match(html, /line-clamp-2/);
    assert.match(html, /90%/);
    assert.match(html, /High/);
    assert.match(html, /Intelligence ready/);
    assert.match(html, /Updated/);
    assert.match(html, /<option value="New">New<\/option>/);
    assert.doesNotMatch(html, /text-white\/40">New</);
    assert.doesNotMatch(html, /Opportunity Score/);
    assert.doesNotMatch(html, /example\.com/);
    assert.match(html, /href="\/personas\/p1"/);
    assert.match(html, /Recently updated/);
    assert.match(html, /Confidence: highest/);
    assert.doesNotMatch(html, />Created</);
  });

  it("keeps short_description visible with confidence and invents no fallback", () => {
    const client = read("components/personas/PersonasLibraryClient.tsx");
    assert.match(client, /persona\.short_description/);
    assert.match(client, /line-clamp-2/);
    assert.doesNotMatch(
      client,
      /shortDescription \?\? (persona\.(category|display_location|additional_context)|messages)/,
    );
    assert.doesNotMatch(client, /display_opportunity_score_label/);

    const scored = renderToStaticMarkup(
      createElement(PersonasLibraryClient, {
        personas: [
          row({
            id: "described",
            display_label: "Described audience",
            updated_at: "2026-09-08T00:00:00.000Z",
            display_confidence: 90,
            short_description: "Busy hair salon owner juggling bookings.",
          }),
        ],
        messages: en,
        language: "en",
      }),
    );
    assert.match(scored, /Busy hair salon owner juggling bookings/);
    assert.match(scored, /line-clamp-2/);
    assert.match(scored, /90%/);
    assert.doesNotMatch(scored, /Opportunity Score/);

    const missing = renderToStaticMarkup(
      createElement(PersonasLibraryClient, {
        personas: [
          row({
            id: "blank",
            display_label: "Blank description audience",
            updated_at: "2026-09-08T00:00:00.000Z",
            display_confidence: 90,
            category: "Small Business Owner",
            display_location: "South Florida",
            short_description: "   ",
          }),
        ],
        messages: en,
        language: "en",
      }),
    );
    assert.match(missing, /Blank description audience/);
    assert.match(missing, /Small Business Owner · South Florida/);
    assert.match(missing, /90%/);
    assert.doesNotMatch(missing, /line-clamp-2/);
    assert.doesNotMatch(missing, /Busy hair salon owner/);
    assert.doesNotMatch(missing, /Opportunity Score/);
    assert.doesNotMatch(missing, />77</);
  });

  it("omits confidence for unscored personas and keeps distinct empty messaging", () => {
    const unscored = renderToStaticMarkup(
      createElement(PersonasLibraryClient, {
        personas: [
          row({
            id: "p2",
            display_label: "Unscored audience",
            updated_at: "2026-09-08T00:00:00.000Z",
            display_confidence: 0,
            display_status: "Profile Created",
            category: null,
            display_location: null,
            short_description: null,
          }),
        ],
        messages: en,
        language: "en",
      }),
    );
    assert.doesNotMatch(unscored, /0%/);
    assert.doesNotMatch(unscored, /Low/);
    assert.doesNotMatch(unscored, /line-clamp-2/);
    assert.doesNotMatch(unscored, /Busy hair salon owner/);
    assert.doesNotMatch(unscored, /Opportunity Score/);
    assert.doesNotMatch(unscored, /77/);
    assert.match(unscored, /Audience saved · intelligence not generated yet/);

    const empty = renderToStaticMarkup(
      createElement(PersonasLibraryClient, {
        personas: [],
        messages: en,
      }),
    );
    assert.match(empty, /No audiences are defined yet/);
    assert.doesNotMatch(empty, /Create audience/);
    assert.doesNotMatch(empty, /Define your first audience/);

    const errored = renderToStaticMarkup(
      createElement(PersonasLibraryClient, {
        personas: [],
        loadError: "boom",
        messages: en,
      }),
    );
    assert.match(errored, /Unable to load audiences/);
    assert.match(errored, /boom/);
  });

  it("keeps Traction sibling routes and does not add Create audience to Ads or Social", () => {
    const personas = read("app/personas/page.tsx");
    const ads = read("app/ads/page.tsx");
    const social = read("app/social-planner/page.tsx");
    const nav = read("components/traction/TractionSiblingNav.tsx");
    assert.match(personas, /help: copy\.traction\.audiencesHelp/);
    assert.match(personas, /help: copy\.traction\.advertisingHelp/);
    assert.match(personas, /help: copy\.traction\.socialHelp/);
    assert.match(ads, /href: "\/personas"/);
    assert.match(ads, /href: "\/ads"/);
    assert.match(ads, /href: "\/social-planner"/);
    assert.match(ads, /current: true/);
    assert.doesNotMatch(ads, /createCta|Create audience|UserPlus/);
    assert.doesNotMatch(ads, /action=\{/);
    assert.match(social, /href: "\/personas"/);
    assert.match(social, /href: "\/ads"/);
    assert.match(social, /href: "\/social-planner"/);
    assert.doesNotMatch(social, /createCta|Create audience|UserPlus/);
    assert.doesNotMatch(social, /action=\{/);
    assert.match(nav, /sm:grid-cols-3/);
    assert.match(nav, /Users/);
    assert.match(nav, /Megaphone/);
    assert.match(nav, /MessagesSquare/);

    const html = renderToStaticMarkup(
      createElement(TractionSiblingNav, {
        links: [
          { href: "/personas", label: "Audiences" },
          { href: "/ads", label: "Advertising", current: true },
          { href: "/social-planner", label: "Social Content" },
        ],
      }),
    );
    assert.match(html, /Audiences/);
    assert.match(html, /Advertising/);
    assert.match(html, /Social Content/);
    assert.match(html, /href="\/personas"/);
    assert.match(html, /href="\/social-planner"/);
    assert.doesNotMatch(html, /href="\/ads"/);
    assert.doesNotMatch(html, /Create audience/);

    const personasNav = renderToStaticMarkup(
      createElement(TractionSiblingNav, {
        links: [
          {
            href: "/personas",
            label: en.personas.traction.audiences,
            help: en.personas.traction.audiencesHelp,
            current: true,
          },
          {
            href: "/ads",
            label: en.personas.traction.advertising,
            help: en.personas.traction.advertisingHelp,
          },
          {
            href: "/social-planner",
            label: en.personas.traction.socialContent,
            help: en.personas.traction.socialHelp,
          },
        ],
      }),
    );
    assert.match(
      personasNav,
      /Understand who you want to reach and what matters to them/,
    );
    assert.equal(
      (personasNav.match(/mt-1 text-sm leading-6 text-white\/50/g) ?? []).length,
      3,
    );

    const defaultHeader = renderToStaticMarkup(
      createElement(TractionPageHeader, {
        eyebrow: "Generate Traction",
        title: "Advertising",
        subtitle: "Campaigns",
      }),
    );
    assert.match(defaultHeader, /Advertising/);
    assert.doesNotMatch(defaultHeader, /Create audience/);
  });

  it("adds the new sort keys across all six locales without dropping identity or SEO keys", () => {
    const required = [
      "personas.list.sortRecentlyUpdated",
      "personas.list.sortOldestUpdated",
      "personas.list.sortNameAsc",
      "personas.list.sortNameDesc",
      "personas.list.sortConfidenceHigh",
      "personas.list.sortConfidenceLow",
      "personas.list.sortCreated",
      "personas.executive.confidence",
      "personas.executive.confidenceHigh",
      "identity.knowledgeScore",
      "seo.visibility.contentCoverageScore",
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
        `${language} missing persona list keys`,
      );
    }
    assert.equal(en.personas.list.sortRecentlyUpdated, "Recently updated");
    assert.notEqual(
      fr.personas.list.sortRecentlyUpdated,
      en.personas.list.sortRecentlyUpdated,
    );
    assert.equal(en.identity.knowledgeScore, en.identity.knowledgeScore);
    assert.ok(en.seo.visibility.contentCoverageScore);
  });
});

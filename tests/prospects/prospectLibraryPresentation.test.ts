/**
 * Prospect library redesign — sort, pagination, card grammar, capacity,
 * completeness, intelligence freshness, and Release CTA.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { GetOblicListingCapacitySummary } from "../../components/prospects/GetOblicListingCapacitySummary";
import { ProspectIntelligenceScore } from "../../components/prospects/ProspectIntelligenceScore";
import { ProspectLibraryCard } from "../../components/prospects/ProspectLibraryCard";
import { isInteractiveListRowTarget } from "../../components/ui/athenaIntelligenceRow";
import { formatProspectLibraryIntelligenceDate } from "../../lib/prospects/prospectLibraryFreshness";
import { shouldShowProspectLibraryReleaseCta } from "../../lib/prospects/prospectLibraryPresentation";
import {
  DEFAULT_PROSPECT_LIBRARY_SORT,
  PROSPECT_LIBRARY_PAGE_SIZE,
  buildProspectLibraryView,
  filterProspectLibraryRows,
  sortProspectLibraryRows,
} from "../../lib/prospects/prospectLibrarySort";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import { computeProspectIntelligenceCompleteness } from "../../services/prospects/prospectIntelligenceCompleteness";
import type { Prospect } from "../../services/prospects/prospectService";
import type { ActiveGetOblicRelationshipStatus } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import type { ProspectDisplayStatus } from "../../services/prospects/prospectDisplay";
import type { ProspectLifecycleStatus } from "../../services/prospects/prospectLifecycle";

type ProspectLibraryRow = Prospect & {
  display_status: ProspectDisplayStatus;
  display_lifecycle_status: ProspectLifecycleStatus;
  display_opportunity_score: number | null;
  display_opportunity_score_label: string;
  display_completeness_score: number;
  display_intelligence_generated_at: string | null;
  getoblic_relationship_status: ActiveGetOblicRelationshipStatus | null;
};

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

function prospect(partial: Partial<Prospect> & { id: string }): Prospect {
  return {
    id: partial.id,
    created_at: partial.created_at ?? "2026-07-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-09-01T00:00:00.000Z",
    organization_id: partial.organization_id ?? "org-a",
    user_id: null,
    community_id: null,
    linked_discussion_id: partial.linked_discussion_id ?? null,
    business_name: partial.business_name ?? "Acme Dental",
    website: partial.website ?? "https://acme.example",
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: partial.industry ?? "Healthcare",
    category: partial.category ?? "Dental",
    country: partial.country ?? "United States",
    state: partial.state ?? "FL",
    city: partial.city ?? "Miami",
    address: null,
    company_size: null,
    revenue: null,
    employee_count: null,
    technologies: null,
    pain_points: null,
    decision_maker: partial.decision_maker ?? "Jane Decision",
    first_name: null,
    last_name: null,
    external_contact_id: null,
    timezone: null,
    job_title: null,
    email: partial.email ?? "jane@acme.example",
    phone: null,
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: null,
    notes: null,
    additional_context: null,
    source: partial.source ?? "manual",
    status: partial.status ?? "Ready",
    lifecycle_status: partial.lifecycle_status ?? "New",
    ads_content: null,
    opportunity_score: partial.opportunity_score ?? 88,
    priority: 1,
    website_intelligence: partial.website_intelligence ?? null,
    raw_json: null,
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
  };
}

function row(
  partial: Partial<ProspectLibraryRow> & {
    id: string;
    business_name?: string;
    updated_at?: string;
  },
): ProspectLibraryRow {
  const base = prospect(partial);
  return {
    ...base,
    display_status: partial.display_status ?? "Ready",
    display_lifecycle_status: partial.display_lifecycle_status ?? "New",
    display_opportunity_score: 88,
    display_opportunity_score_label: "88",
    display_completeness_score: partial.display_completeness_score ?? 72,
    display_intelligence_generated_at:
      "display_intelligence_generated_at" in partial
        ? (partial.display_intelligence_generated_at ?? null)
        : "2026-09-10T12:00:00.000Z",
    getoblic_relationship_status:
      "getoblic_relationship_status" in partial
        ? (partial.getoblic_relationship_status ?? null)
        : null,
  };
}

describe("prospect library sort", () => {
  it("defaults to recently updated and sorts names, dates, and completeness", () => {
    assert.equal(DEFAULT_PROSPECT_LIBRARY_SORT, "updated_desc");
    const rows = [
      row({
        id: "old",
        business_name: "Zed Clinic",
        updated_at: "2026-01-01T00:00:00.000Z",
        display_completeness_score: 40,
      }),
      row({
        id: "new",
        business_name: "Ann Dental",
        updated_at: "2026-09-01T00:00:00.000Z",
        display_completeness_score: 90,
      }),
    ];
    assert.deepEqual(
      sortProspectLibraryRows(rows, "updated_desc").map((item) => item.id),
      ["new", "old"],
    );
    assert.deepEqual(
      sortProspectLibraryRows(rows, "updated_asc").map((item) => item.id),
      ["old", "new"],
    );
    assert.deepEqual(
      sortProspectLibraryRows(rows, "name_asc").map((item) => item.id),
      ["new", "old"],
    );
    assert.deepEqual(
      sortProspectLibraryRows(rows, "name_desc").map((item) => item.id),
      ["old", "new"],
    );
    assert.deepEqual(
      sortProspectLibraryRows(rows, "score_desc").map((item) => item.id),
      ["new", "old"],
    );
    assert.deepEqual(
      sortProspectLibraryRows(rows, "score_asc").map((item) => item.id),
      ["old", "new"],
    );
  });

  it("uses prospect.updated_at for recency sort, not intelligence generated_at", () => {
    const rows = [
      row({
        id: "stale-record",
        business_name: "Stale Record",
        updated_at: "2026-01-01T00:00:00.000Z",
        display_intelligence_generated_at: "2026-09-10T00:00:00.000Z",
      }),
      row({
        id: "fresh-record",
        business_name: "Fresh Record",
        updated_at: "2026-09-09T00:00:00.000Z",
        display_intelligence_generated_at: "2026-02-01T00:00:00.000Z",
      }),
    ];
    assert.deepEqual(
      sortProspectLibraryRows(rows, "updated_desc").map((item) => item.id),
      ["fresh-record", "stale-record"],
    );
  });

  it("breaks completeness ties with recently updated", () => {
    const rows = [
      row({
        id: "high-old",
        business_name: "High old",
        updated_at: "2026-01-01T00:00:00.000Z",
        display_completeness_score: 90,
      }),
      row({
        id: "high-new",
        business_name: "High new",
        updated_at: "2026-09-01T00:00:00.000Z",
        display_completeness_score: 90,
      }),
      row({
        id: "low",
        business_name: "Low",
        updated_at: "2026-08-01T00:00:00.000Z",
        display_completeness_score: 20,
      }),
    ];
    assert.deepEqual(
      sortProspectLibraryRows(rows, "score_desc").map((item) => item.id),
      ["high-new", "high-old", "low"],
    );
  });
});

describe("prospect library pagination", () => {
  it("filters, then sorts, then paginates with PAGE_SIZE 10", () => {
    assert.equal(PROSPECT_LIBRARY_PAGE_SIZE, 10);
    const rows = Array.from({ length: 14 }, (_, index) =>
      row({
        id: `p-${String(index).padStart(2, "0")}`,
        business_name:
          index === 0 ? "Zebra hidden" : `Alpha ${String(index).padStart(2, "0")}`,
        updated_at: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        display_lifecycle_status: index === 13 ? "Engaged" : "Reviewing",
        website: index === 2 ? "https://search-me.example" : "https://other.example",
        decision_maker: index === 3 ? "Hidden Decision Maker" : "Other Person",
      }),
    );

    const reviewing = filterProspectLibraryRows(rows, {
      query: "",
      status: "Reviewing",
    });
    assert.equal(reviewing.length, 13);

    const searched = filterProspectLibraryRows(rows, {
      query: "search-me.example",
      status: "all",
    });
    assert.deepEqual(
      searched.map((item) => item.id),
      ["p-02"],
    );

    const byDecisionMaker = filterProspectLibraryRows(rows, {
      query: "hidden decision maker",
      status: "all",
    });
    assert.deepEqual(
      byDecisionMaker.map((item) => item.id),
      ["p-03"],
    );

    const page1 = buildProspectLibraryView(reviewing, {
      query: "",
      status: "all",
      sort: "name_asc",
      page: 1,
    });
    assert.equal(page1.filtered.length, 13);
    assert.equal(page1.pageRows.length, 10);
    assert.equal(page1.currentPage, 1);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.pageRows[0]?.business_name, "Alpha 01");
    assert.ok(!page1.pageRows.some((item) => item.id === "p-00"));

    const page2 = buildProspectLibraryView(reviewing, {
      query: "",
      status: "all",
      sort: "name_asc",
      page: 2,
    });
    assert.equal(page2.pageRows.length, 3);
    assert.equal(page2.currentPage, 2);
  });

  it("documents that search, filter, and sort reset page in the client", () => {
    const client = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(client, /setQuery\(event\.target\.value\);\s*setPage\(1\)/);
    assert.match(client, /setStatus\(event\.target\.value\);\s*setPage\(1\)/);
    assert.match(client, /setSort\(next\);\s*setPage\(1\)/);
    assert.doesNotMatch(client, /searchParams|useSearchParams/);
  });
});

describe("prospect library presentation", () => {
  it("uses the cyan list grammar, completeness ring, and intelligence chip", () => {
    const html = renderToStaticMarkup(
      createElement(ProspectLibraryCard, {
        prospect: row({
          id: "p1",
          business_name: "Harbor Dental",
          display_status: "Ready",
          display_lifecycle_status: "New",
          display_completeness_score: 84,
          display_intelligence_generated_at: "2026-09-10T12:00:00.000Z",
        }),
        messages: en,
        language: "en",
      }),
    );
    assert.match(html, /Harbor Dental/);
    assert.match(html, /Dental · Miami, FL, United States/);
    assert.match(html, /84%/);
    assert.match(html, /Prospect Completeness/);
    assert.match(html, /data-prospect-completeness-size="list"/);
    assert.match(html, /Intelligence ready/);
    assert.match(html, /Intelligence · /);
    assert.doesNotMatch(html, />Created</);
    assert.doesNotMatch(html, /Opportunity Score/);
    assert.doesNotMatch(html, /https:\/\/acme\.example/);
    assert.doesNotMatch(html, /Jane Decision/);
    assert.doesNotMatch(html, /jane@acme\.example/);
    assert.doesNotMatch(html, /text-white\/40">New</);
    const client = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(client, /href=\{`\/prospects\/\$\{prospect\.id\}`\}/);
    assert.match(client, /Recently updated/);
    assert.match(client, /Completeness: high to low/);
    assert.doesNotMatch(client, /value="created"/);
  });

  it("omits intelligence date when no current version exists and never labels updated_at as freshness", () => {
    const html = renderToStaticMarkup(
      createElement(ProspectLibraryCard, {
        prospect: row({
          id: "p2",
          business_name: "Blank Intelligence",
          updated_at: "2026-08-01T00:00:00.000Z",
          display_status: "Saved",
          display_lifecycle_status: "Reviewing",
          display_intelligence_generated_at: null,
        }),
        messages: en,
        language: "en",
      }),
    );
    assert.match(html, /Blank Intelligence/);
    assert.match(html, /Saved/);
    assert.match(html, /Reviewing/);
    assert.doesNotMatch(html, /Intelligence · /);
    assert.doesNotMatch(html, /Aug 1, 2026/);
    assert.doesNotMatch(html, /data-intelligence-generated-at/);
  });

  it("shows Release for claiming and linked, not remote_missing", () => {
    const claiming = renderToStaticMarkup(
      createElement(ProspectLibraryCard, {
        prospect: row({
          id: "claiming-1",
          business_name: "Claiming Biz",
          getoblic_relationship_status: "claiming",
        }),
        messages: en,
        release: "Release GetOblic listing",
      }),
    );
    const linked = renderToStaticMarkup(
      createElement(ProspectLibraryCard, {
        prospect: row({
          id: "linked-1",
          business_name: "Linked Biz",
          getoblic_relationship_status: "linked",
        }),
        messages: en,
        release: "Release GetOblic listing",
      }),
    );
    const missing = renderToStaticMarkup(
      createElement(ProspectLibraryCard, {
        prospect: row({
          id: "missing-1",
          business_name: "Missing Biz",
          getoblic_relationship_status: "remote_missing",
        }),
        messages: en,
        release: "Release GetOblic listing",
      }),
    );
    assert.match(claiming, /data-prospect-library-release="claiming"/);
    assert.match(claiming, /Release GetOblic listing/);
    assert.match(linked, /data-prospect-library-release="linked"/);
    assert.match(linked, /Release GetOblic listing/);
    assert.doesNotMatch(missing, /data-prospect-library-release/);
    assert.doesNotMatch(missing, /Release GetOblic listing/);
    assert.equal(shouldShowProspectLibraryReleaseCta("claiming"), true);
    assert.equal(shouldShowProspectLibraryReleaseCta("linked"), true);
    assert.equal(shouldShowProspectLibraryReleaseCta("remote_missing"), false);
    assert.equal(shouldShowProspectLibraryReleaseCta("released"), false);
  });

  it("keeps nested Release clicks from counting as row navigation", () => {
    const client = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(client, /AthenaIntelligenceListRow/);
    assert.match(client, /GetOblicListingReleaseControl/);
    assert.match(client, /shouldShowProspectLibraryReleaseCta/);
    const release = read("components/prospects/GetOblicListingReleaseControl.tsx");
    assert.match(
      release,
      /\/api\/prospects\/\$\{prospectId\}\/getoblic-directory\/release/,
    );
    assert.match(release, /router\.refresh\(\)/);
    const button = {
      closest: (selector: string) =>
        selector.includes("button") ? {} : null,
    };
    assert.equal(
      isInteractiveListRowTarget(button as unknown as Element),
      true,
    );
  });

  it("does not mount Description or Knowledge Base outbound actions on list cards", () => {
    const client = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.doesNotMatch(client, /GetOblicListingOutboundControls/);
    assert.doesNotMatch(client, /Send Description|Send Knowledge Base/);
  });

  it("renders a list-sized completeness ring without forking the algorithm", () => {
    const list = renderToStaticMarkup(
      createElement(ProspectIntelligenceScore, {
        score: 64,
        messages: en.prospects.score,
        size: "list",
      }),
    );
    const detail = renderToStaticMarkup(
      createElement(ProspectIntelligenceScore, {
        score: 64,
        messages: en.prospects.score,
      }),
    );
    assert.match(list, /data-prospect-completeness-size="list"/);
    assert.match(list, /width:44px/);
    assert.match(detail, /data-prospect-completeness-size="detail"/);
    assert.match(detail, /width:72px/);
    assert.match(list, /Prospect Completeness/);
    assert.doesNotMatch(list, /Opportunity Score/);

    const enrichment = read("services/prospects/prospectLibraryEnrichment.ts");
    assert.match(enrichment, /computeProspectIntelligenceCompleteness/);
    assert.match(enrichment, /display_completeness_score/);
    assert.match(enrichment, /generated_at/);
    assert.match(enrichment, /display_intelligence_generated_at/);
    assert.match(enrichment, /getoblic_relationship_status/);
    assert.doesNotMatch(enrichment, /wordpress_listing_id/);
  });
});

describe("prospect library capacity", () => {
  it("loads current-organization capacity on the library page", () => {
    const page = read("app/prospects/page.tsx");
    assert.match(page, /requireCurrentOrganizationContext/);
    assert.match(page, /getGetOblicListingCapacity\(organizationId\)/);
    assert.match(page, /GetOblicListingCapacitySummary/);
    assert.doesNotMatch(page, /licensee|monthly_allowance|this month|reset/i);
    assert.doesNotMatch(page, /getProspects\(/);
  });

  it("treats unconfigured as distinct from capacity 0", () => {
    const configured = renderToStaticMarkup(
      createElement(GetOblicListingCapacitySummary, {
        capacity: {
          configured: true,
          listingCapacity: 3,
          currentlyHeld: 2,
          available: 1,
        },
        messages: en.prospects.list,
      }),
    );
    const zero = renderToStaticMarkup(
      createElement(GetOblicListingCapacitySummary, {
        capacity: {
          configured: true,
          listingCapacity: 0,
          currentlyHeld: 0,
          available: 0,
        },
        messages: en.prospects.list,
      }),
    );
    const unconfigured = renderToStaticMarkup(
      createElement(GetOblicListingCapacitySummary, {
        capacity: {
          configured: false,
          code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
        },
        messages: en.prospects.list,
      }),
    );
    assert.match(configured, /GetOblic listing capacity/);
    assert.match(configured, /Capacity/);
    assert.match(configured, />3</);
    assert.match(configured, /Currently held/);
    assert.match(configured, />2</);
    assert.match(configured, /Available/);
    assert.match(configured, /data-getoblic-capacity-available="1"/);
    assert.match(zero, /data-getoblic-capacity="configured"/);
    assert.match(zero, /data-getoblic-capacity-available="0"/);
    assert.match(unconfigured, /data-getoblic-capacity="unconfigured"/);
    assert.match(
      unconfigured,
      /GetOblic listing capacity is not configured for this workspace/,
    );
    assert.doesNotMatch(configured, /this month|monthly|reset/i);
    assert.doesNotMatch(zero, /this month|monthly|reset/i);
    assert.doesNotMatch(unconfigured, /this month|monthly|reset/i);
    assert.doesNotMatch(unconfigured, /unlimited/i);
  });
});

describe("prospect library intelligence freshness", () => {
  it("formats current-version generated_at and omits absent values", () => {
    assert.match(
      formatProspectLibraryIntelligenceDate(
        "2026-09-10T12:00:00.000Z",
        "en",
        "Intelligence",
      ) ?? "",
      /Intelligence · /,
    );
    assert.equal(
      formatProspectLibraryIntelligenceDate(null, "en", "Intelligence"),
      null,
    );
    assert.equal(
      formatProspectLibraryIntelligenceDate("not-a-date", "en", "Intelligence"),
      null,
    );
    const card = read("components/prospects/ProspectLibraryCard.tsx");
    const client = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(card, /display_intelligence_generated_at/);
    assert.doesNotMatch(
      card,
      /formatTenantDate\(prospect\.updated_at/,
    );
    assert.doesNotMatch(card, /scraped_at|job\.created_at/);
    assert.doesNotMatch(client, /formatTenantDate\(prospect\.updated_at/);
  });

  it("computes list completeness from the shared algorithm", () => {
    const score = computeProspectIntelligenceCompleteness({
      prospect: prospect({
        id: "complete",
        business_name: "Harbor Dental",
        category: "Dental",
        city: "Miami",
        email: "hello@harbor.example",
        website: "https://harbor.example",
      }),
      hasCurrentExecutiveVersion: true,
      hasActiveGetOblicListingLink: true,
    }).score;
    assert.equal(typeof score, "number");
    assert.ok(score > 0);
    assert.ok(score <= 100);
    const enrichment = read("services/prospects/prospectLibraryEnrichment.ts");
    assert.match(enrichment, /buildProspectLibraryCompleteness/);
    assert.match(enrichment, /computeProspectIntelligenceCompleteness/);
  });
});

describe("prospect library i18n", () => {
  it("adds library keys across all six locales without exposing internals", () => {
    const required = [
      "prospects.list.sortRecentlyUpdated",
      "prospects.list.sortOldestUpdated",
      "prospects.list.sortNameAsc",
      "prospects.list.sortNameDesc",
      "prospects.list.sortCompletenessHigh",
      "prospects.list.sortCompletenessLow",
      "prospects.list.capacityTitle",
      "prospects.list.capacityLabel",
      "prospects.list.currentlyHeldLabel",
      "prospects.list.availableLabel",
      "prospects.list.capacityUnconfigured",
      "prospects.list.intelligenceDateLabel",
      "prospects.list.openProspectAria",
      "prospects.list.pageOf",
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
        `${language} missing prospect library keys`,
      );
    }
    assert.equal(en.prospects.list.sortRecentlyUpdated, "Recently updated");
    assert.equal(
      en.prospects.list.sortCompletenessHigh,
      "Completeness: high to low",
    );
    assert.notEqual(
      fr.prospects.list.sortRecentlyUpdated,
      en.prospects.list.sortRecentlyUpdated,
    );
    for (const language of ORGANIZATION_LANGUAGES) {
      const list = JSON.stringify(DICTIONARIES[language].prospects.list);
      assert.doesNotMatch(list, /monthly_allowance/);
      assert.doesNotMatch(list, /display_opportunity_score/);
      assert.doesNotMatch(list, /relationship_status/);
    }
  });
});

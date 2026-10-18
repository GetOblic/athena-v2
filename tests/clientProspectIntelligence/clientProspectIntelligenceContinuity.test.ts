import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, it } from "node:test";
import { ClientProspectIntelligenceNavGate } from "../../components/dashboard/ClientProspectIntelligenceNavGate";
import { ClientProspectIntelligenceNavLink } from "../../components/dashboard/ClientProspectIntelligenceNavLink";
import { TenantNavList } from "../../components/dashboard/TenantSidebar";
import {
  localizeTenantNav,
  tenantNavDefs,
} from "../../components/dashboard/tenantNavigation";
import {
  ClientProspectIntelligenceUnavailable,
  ClientProspectIntelligenceWorkspace,
} from "../../components/clientProspectIntelligence/ClientProspectIntelligenceWorkspace";
import { CLIENT_PROSPECT_INTELLIGENCE_HREF } from "../../lib/clientProspectIntelligence/clientProspectIntelligencePath";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { authorizeClientProspectConversionRows } from "../../services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import { hashProspectDirectoryArtifactContent } from "../../services/prospects/prospectDirectoryArtifacts";
import {
  loadClientProspectIntelligence,
  retainAuthorizedExecutiveVersions,
  selectSingleCurrentExecutiveVersion,
  sourceProspectMatchesConversion,
} from "../../services/clientProspectIntelligence/clientProspectIntelligenceRead";
import type { ExecutiveIntelligenceVersion } from "../../services/executiveVersions/executiveVersionTypes";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();
const CLIENT_ORG = "44444444-4444-4444-8444-444444444444";
const FOREIGN_CLIENT = "55555555-5555-4555-8555-555555555555";
const SOURCE_ORG = "33333333-3333-4333-8333-333333333333";
const FOREIGN_ORG = "99999999-9999-4999-8999-999999999999";
const LICENSEE_ID = "11111111-1111-4111-8111-111111111111";
const PROSPECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DISCUSSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CATALOGS: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

type ConversionRow = {
  prospect_id: string;
  source_organization_id: string;
  client_organization_id: string;
  licensee_account_id: string;
  licensee_sub_account_id: string | null;
  status: string;
};

type Fixture = {
  conversions: ConversionRow[];
  prospects: Array<Record<string, unknown>>;
  discussions: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
let writes: string[] = [];
let queries: Array<{ table: string; filters: Record<string, string> }> = [];

function activeConversion(overrides: Partial<ConversionRow> = {}): ConversionRow {
  return {
    prospect_id: PROSPECT_ID,
    source_organization_id: SOURCE_ORG,
    client_organization_id: CLIENT_ORG,
    licensee_account_id: LICENSEE_ID,
    licensee_sub_account_id: "66666666-6666-4666-8666-666666666666",
    status: "active",
    ...overrides,
  };
}

function prospectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROSPECT_ID,
    organization_id: SOURCE_ORG,
    business_name: "Harbor Practice",
    lifecycle_status: "New",
    linked_discussion_id: DISCUSSION_ID,
    website: "https://harbor.example",
    website_intelligence: {
      provider: "deep_v1",
      url: "https://harbor.example",
      scraped_at: "2026-10-01T12:00:00.000Z",
      pages_analyzed: 2,
      pages: [
        {
          url: "https://harbor.example",
          title: "Home",
          page_type: "home",
          excerpt: "Welcome",
        },
      ],
      business_knowledge: { positioning: "Harbor dentistry" },
      positioning: "Harbor dentistry",
    },
    generated_listing_description: {
      description: "A calm harbor practice.",
      generatedAt: "2026-10-02T00:00:00.000Z",
    },
    ...overrides,
  };
}

function versionRow(input: {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  summary: string;
  organizationId?: string;
  intelligence?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    discussion_id: DISCUSSION_ID,
    organization_id: input.organizationId ?? SOURCE_ORG,
    user_id: null,
    version_number: input.versionNumber,
    is_current: input.isCurrent,
    generated_at: "2026-10-01T12:00:00.000Z",
    generation_duration_ms: null,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "executive_intelligence_v1",
    regeneration_run_id: null,
    analysis_id: null,
    opportunity_id: null,
    review_id: null,
    blueprint_id: null,
    created_at: "2026-10-01T12:00:00.000Z",
    intelligence: input.intelligence ?? {
      analysis: {
        id: input.id,
        summary: input.summary,
        confidence: 70,
        suggested_cta: null,
      },
    },
  };
}

function richFixture(): Fixture {
  return {
    conversions: [activeConversion()],
    prospects: [prospectRow()],
    discussions: [
      {
        id: DISCUSSION_ID,
        organization_id: SOURCE_ORG,
        platform: "prospect_intelligence",
        title: "Original prospect discussion",
        summary: "Practice overview",
        body: "The owner described the practice.",
      },
    ],
    versions: [
      versionRow({
        id: "version-current",
        versionNumber: 2,
        isCurrent: true,
        summary: "Current executive summary",
        intelligence: {
          analysis: {
            id: "analysis-current",
            summary: "Current executive summary",
            confidence: 82,
            suggested_cta:
              "PERSONALIZED_OUTREACH_EMAIL:\nHello from the current version.\n\nKNOWLEDGE_BASE_ENHANCEMENT:\nOpen Tuesday through Friday.\n",
          },
          opportunity: {
            title: "Current opportunity",
            reason: "The site shows no online booking.",
            recommended_action: "Offer a visit.",
          },
          briefing: {
            summary: "Current briefing",
            recommended_response: "Send the note",
            cta: "Book a visit",
            pain_points: "No online booking",
          },
          blueprint: {
            asset_title: "Current blueprint",
            business_goal: "Fill the calendar",
            target_audience: "Local families",
            priority: "High",
            notes: "Use the published hours",
          },
        },
      }),
      versionRow({
        id: "version-history",
        versionNumber: 1,
        isCurrent: false,
        summary: "Historical executive summary",
      }),
      versionRow({
        id: "version-foreign",
        versionNumber: 9,
        isCurrent: false,
        summary: "FOREIGN SECRET",
        organizationId: FOREIGN_ORG,
      }),
    ],
    jobs: [
      {
        id: "job-1",
        organization_id: SOURCE_ORG,
        source_type: "prospect",
        prospect_id: PROSPECT_ID,
        root_url: "https://harbor.example",
        status: "completed",
        pages_analyzed: 2,
        normalized_domain: "harbor.example",
        current_stage: "completed",
      },
    ],
    artifacts: [],
  };
}

function rowsFor(fixture: Fixture, table: string, filters: Record<string, string>) {
  const source =
    table === "licensee_prospect_client_conversions"
      ? fixture.conversions
      : table === "prospects"
        ? fixture.prospects
        : table === "discussions"
          ? fixture.discussions
          : table === "athena_executive_intelligence_versions"
            ? fixture.versions
            : table === "athena_website_deep_scrape_jobs"
              ? fixture.jobs
              : table === "prospect_directory_artifacts"
                ? fixture.artifacts
                : [];
  return source.filter((row) =>
    Object.entries(filters).every(([column, value]) => row[column] === value),
  );
}

function install(fixture: Fixture) {
  writes = [];
  queries = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    let limitCount: number | null = null;
    const finish = () => {
      queries.push({ table, filters: { ...filters } });
      const rows = rowsFor(fixture, table, filters);
      return limitCount == null ? rows : rows.slice(0, limitCount);
    };
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      order() {
        return builder;
      },
      limit(count: number) {
        limitCount = count;
        return builder;
      },
      insert() {
        writes.push(`${table}.insert`);
        return builder;
      },
      update() {
        writes.push(`${table}.update`);
        return builder;
      },
      delete() {
        writes.push(`${table}.delete`);
        return builder;
      },
      upsert() {
        writes.push(`${table}.upsert`);
        return builder;
      },
      async maybeSingle() {
        const rows = finish();
        if (rows.length > 1) {
          return { data: null, error: { message: "multiple rows" } };
        }
        return { data: rows[0] ?? null, error: null };
      },
      then(
        onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({ data: finish(), error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return builder;
  };
}

function restore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    paths.push(
      ...collectKeyPaths(
        (value as Record<string, unknown>)[key],
        prefix ? `${prefix}.${key}` : key,
      ),
    );
  }
  return paths;
}

describe("client prospect intelligence continuity", () => {
  afterEach(() => {
    restore();
  });

  it("grants access for one active conversion and reads source intelligence", async () => {
    const fixture = richFixture();
    const before = structuredClone(fixture);
    install(fixture);

    const result = await loadClientProspectIntelligence(CLIENT_ORG);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.view.businessName, "Harbor Practice");
    assert.equal(result.view.prospect.organization_id, SOURCE_ORG);
    assert.equal(result.view.discussion?.title, "Original prospect discussion");
    assert.equal(result.view.websiteSections[0]?.text, "Harbor dentistry");
    assert.equal(result.view.generatedDescription, "A calm harbor practice.");
    assert.equal(result.view.deepScrape?.pagesAnalyzed, 2);
    assert.equal(result.view.deepScrape?.jobStatus, "completed");
    assert.equal(result.view.deepScrape?.pages[0]?.title, "Home");
    assert.equal(result.view.currentVersion?.versionNumber, 2);
    assert.match(
      result.view.currentVersion?.analysis?.summary ?? "",
      /Current executive summary/,
    );
    assert.equal(result.view.currentVersion?.briefing?.summary, "Current briefing");
    assert.equal(result.view.currentVersion?.blueprint?.title, "Current blueprint");
    assert.equal(
      result.view.currentVersion?.deploymentAssets[0]?.content,
      "Hello from the current version.",
    );
    assert.equal(
      result.view.currentVersion?.knowledgeBase,
      "Open Tuesday through Friday.",
    );
    assert.deepEqual(
      result.view.historicalVersions.map((version) => version.versionNumber),
      [1],
    );
    assert.equal(
      result.view.historicalVersions[0]?.analysis?.summary,
      "Historical executive summary",
    );
    assert.equal(JSON.stringify(result).includes("FOREIGN SECRET"), false);
    assert.deepEqual(writes, []);
    assert.deepEqual(fixture, before);
    assert.equal(
      queries.some(
        (query) =>
          query.table === "prospects" &&
          query.filters.id === PROSPECT_ID &&
          query.filters.organization_id === SOURCE_ORG,
      ),
      true,
    );
    assert.equal(
      queries.some(
        (query) =>
          query.table === "prospects" &&
          query.filters.organization_id === CLIENT_ORG,
      ),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "athena_identity"),
      false,
    );
    assert.equal(result.view.savedDescription, null);
    assert.equal(result.view.savedKnowledgeBase, null);
  });

  it("reads saved source artifacts for one active conversion without writing", async () => {
    const savedDescription = "Saved harbor description";
    const savedKnowledge = "Saved harbor facts";
    const fixture = richFixture();
    const versionBefore = structuredClone(fixture.versions);
    fixture.artifacts = [
      {
        prospect_id: PROSPECT_ID,
        organization_id: SOURCE_ORG,
        artifact_type: "description",
        revision: 2,
        content: savedDescription,
        content_sha256: hashProspectDirectoryArtifactContent(savedDescription),
        origin: "edited",
        source_executive_version_id: null,
        saved_at: "2026-10-03T00:00:00.000Z",
        saved_by_organization_id: SOURCE_ORG,
      },
      {
        prospect_id: PROSPECT_ID,
        organization_id: SOURCE_ORG,
        artifact_type: "knowledge_base",
        revision: 1,
        content: savedKnowledge,
        content_sha256: hashProspectDirectoryArtifactContent(savedKnowledge),
        origin: "generated",
        source_executive_version_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        saved_at: "2026-10-03T00:00:00.000Z",
        saved_by_organization_id: SOURCE_ORG,
      },
      {
        prospect_id: PROSPECT_ID,
        organization_id: FOREIGN_ORG,
        artifact_type: "description",
        revision: 1,
        content: "Foreign directory secret",
        content_sha256: hashProspectDirectoryArtifactContent(
          "Foreign directory secret",
        ),
        origin: "generated",
        source_executive_version_id: null,
        saved_at: "2026-10-03T00:00:00.000Z",
        saved_by_organization_id: FOREIGN_ORG,
      },
      {
        prospect_id: PROSPECT_ID,
        organization_id: CLIENT_ORG,
        artifact_type: "description",
        revision: 1,
        content: "Client-owned directory secret",
        content_sha256: hashProspectDirectoryArtifactContent(
          "Client-owned directory secret",
        ),
        origin: "generated",
        source_executive_version_id: null,
        saved_at: "2026-10-03T00:00:00.000Z",
        saved_by_organization_id: CLIENT_ORG,
      },
    ];
    const before = structuredClone(fixture);
    install(fixture);

    const result = await loadClientProspectIntelligence(CLIENT_ORG);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.view.savedDescription?.content, savedDescription);
    assert.equal(result.view.savedDescription?.revision, 2);
    assert.equal(result.view.savedDescription?.organizationId, SOURCE_ORG);
    assert.equal(result.view.savedKnowledgeBase?.content, savedKnowledge);
    assert.equal(
      result.view.currentVersion?.knowledgeBase,
      "Open Tuesday through Friday.",
    );
    assert.equal(result.view.generatedDescription, "A calm harbor practice.");
    assert.equal(JSON.stringify(result).includes("Foreign directory secret"), false);
    assert.equal(
      JSON.stringify(result).includes("Client-owned directory secret"),
      false,
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(fixture.versions, versionBefore);
    assert.deepEqual(fixture, before);
    assert.equal(
      queries.some(
        (query) =>
          query.table === "prospect_directory_artifacts" &&
          query.filters.prospect_id === PROSPECT_ID &&
          query.filters.organization_id === SOURCE_ORG,
      ),
      true,
    );
    assert.equal(
      queries.some(
        (query) =>
          query.table === "prospect_directory_artifacts" &&
          (query.filters.organization_id === CLIENT_ORG ||
            query.filters.organization_id === FOREIGN_ORG),
      ),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "athena_identity"),
      false,
    );

    const html = renderToStaticMarkup(
      createElement(ClientProspectIntelligenceWorkspace, {
        view: result.view,
        messages: en,
        language: "en",
      }),
    );
    assert.match(html, /Saved harbor description/);
    assert.match(html, /Saved harbor facts/);
    assert.match(html, /Open Tuesday through Friday/);
    assert.match(html, /data-getoblic-content-editor="description"/);
    assert.match(html, /data-getoblic-content-editor="knowledge_base"/);
    assert.match(html, /data-getoblic-content-revision="2"/);
    assert.doesNotMatch(html, /Foreign directory secret|Client-owned directory secret/);
  });

  it("denies a reversed conversion before reading the Prospect", async () => {
    install({
      ...richFixture(),
      conversions: [activeConversion({ status: "reversed" })],
    });
    const result = await loadClientProspectIntelligence(CLIENT_ORG);
    assert.deepEqual(result, { ok: false, reason: "no_active_conversion" });
    assert.equal(
      queries.some((query) => query.table === "prospects"),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "prospect_directory_artifacts"),
      false,
    );
  });

  it("denies a foreign client organization", async () => {
    install(richFixture());
    const result = await loadClientProspectIntelligence(FOREIGN_CLIENT);
    assert.deepEqual(result, { ok: false, reason: "no_active_conversion" });
    assert.equal(
      queries.some((query) => query.table === "prospects"),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "prospect_directory_artifacts"),
      false,
    );
  });

  it("fails closed when more than one active conversion is visible", async () => {
    install({
      ...richFixture(),
      conversions: [
        activeConversion(),
        activeConversion({
          prospect_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        }),
      ],
    });
    const result = await loadClientProspectIntelligence(CLIENT_ORG);
    assert.deepEqual(result, { ok: false, reason: "ambiguous_conversion" });
    assert.equal(
      queries.some((query) => query.table === "prospects"),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "prospect_directory_artifacts"),
      false,
    );
    assert.deepEqual(writes, []);
  });

  it("requires the source Prospect to belong to the conversion source organization", async () => {
    install({
      ...richFixture(),
      prospects: [prospectRow({ organization_id: CLIENT_ORG })],
    });
    const result = await loadClientProspectIntelligence(CLIENT_ORG);
    assert.deepEqual(result, { ok: false, reason: "source_mismatch" });
    assert.equal(sourceProspectMatchesConversion(null, {
      prospectId: PROSPECT_ID,
      sourceOrganizationId: SOURCE_ORG,
    }), false);
    assert.equal(
      sourceProspectMatchesConversion(
        { id: PROSPECT_ID, organization_id: CLIENT_ORG },
        { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      ),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "prospect_directory_artifacts"),
      false,
    );
  });

  it("keeps missing intelligence as empty sections without writing", async () => {
    const fixture = richFixture();
    fixture.prospects = [
      prospectRow({
        linked_discussion_id: null,
        website_intelligence: null,
        generated_listing_description: null,
        website: null,
      }),
    ];
    fixture.discussions = [];
    fixture.versions = [];
    fixture.jobs = [];
    const before = structuredClone(fixture);
    install(fixture);
    const result = await loadClientProspectIntelligence(CLIENT_ORG);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.view.discussion, null);
    assert.deepEqual(result.view.websiteSections, []);
    assert.equal(result.view.generatedDescription, null);
    assert.equal(result.view.savedDescription, null);
    assert.equal(result.view.savedKnowledgeBase, null);
    assert.equal(result.view.deepScrape, null);
    assert.equal(result.view.currentVersion, null);
    assert.deepEqual(result.view.historicalVersions, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(fixture, before);
  });

  it("classifies reversed, foreign, incomplete, and ambiguous rows without a query", () => {
    assert.equal(
      authorizeClientProspectConversionRows({
        clientOrganizationId: CLIENT_ORG,
        rows: [activeConversion({ status: "reversed" })],
      }).ok,
      false,
    );
    assert.equal(
      authorizeClientProspectConversionRows({
        clientOrganizationId: FOREIGN_CLIENT,
        rows: [activeConversion()],
      }).reason,
      "client_mismatch",
    );
    assert.equal(
      authorizeClientProspectConversionRows({
        clientOrganizationId: CLIENT_ORG,
        rows: [activeConversion(), activeConversion()],
      }).reason,
      "ambiguous_conversion",
    );
    assert.equal(
      authorizeClientProspectConversionRows({
        clientOrganizationId: CLIENT_ORG,
        rows: [activeConversion({ licensee_account_id: "" })],
      }).reason,
      "incomplete_conversion",
    );
    assert.equal(
      authorizeClientProspectConversionRows({
        clientOrganizationId: "",
        rows: [],
      }).reason,
      "missing_client_organization",
    );
  });

  it("does not treat two current versions as a single current version", () => {
    const versions = [
      { id: "a", is_current: true },
      { id: "b", is_current: true },
    ] as ExecutiveIntelligenceVersion[];
    assert.equal(selectSingleCurrentExecutiveVersion(versions), null);
    assert.deepEqual(
      retainAuthorizedExecutiveVersions(
        [
          {
            id: "kept",
            discussion_id: DISCUSSION_ID,
            organization_id: SOURCE_ORG,
          },
          {
            id: "dropped",
            discussion_id: DISCUSSION_ID,
            organization_id: FOREIGN_ORG,
          },
        ] as ExecutiveIntelligenceVersion[],
        { discussionId: DISCUSSION_ID, sourceOrganizationId: SOURCE_ORG },
      ).map((version) => version.id),
      ["kept"],
    );
  });

  it("does not import generation, hydration, or Brain training", () => {
    const authority = read(
      "services/clientProspectIntelligence/clientProspectIntelligenceAuthority.ts",
    );
    const service = read(
      "services/clientProspectIntelligence/clientProspectIntelligenceRead.ts",
    );
    const page = read("app/prospect-intelligence/page.tsx");
    const route = read(
      "app/api/client-prospect-intelligence/availability/route.ts",
    );
    const combined = `${authority}\n${service}\n${page}\n${route}`;
    assert.match(authority, /getActiveConversionForClientOrganization/);
    assert.match(authority, /\.limit\(2\)/);
    assert.doesNotMatch(
      combined,
      /hydrateLicenseeProspectClientIntelligence|publishExecutiveIntelligenceVersion|ensureCurrentLiveIntelligenceIsVersioned|getExecutiveVersionsForDiscussionPage|deepScrapeExecutor|generationJobExecutor|trainAthena|identityService/,
    );
    assert.doesNotMatch(authority, /\.(insert|update|delete|upsert|rpc)\(/);
    assert.doesNotMatch(service, /\.(insert|update|delete|upsert|rpc)\(/);
    assert.doesNotMatch(page, /searchParams|prospectId|sourceOrganizationId/);
    assert.doesNotMatch(
      page,
      /ExecutiveIntelligenceWorkspace|ProspectDeepScrapeWebsiteButton|ProspectRefreshIntelligenceButton|ProspectConvertToClientAction|GetOblicListing/,
    );
    assert.match(route, /json\(authority\.ok === true\)/);
    assert.doesNotMatch(route, /searchParams|request\.json|prospect_id/);
    assert.equal(
      read("app/prospect-intelligence/page.tsx").includes("/prospects"),
      false,
    );
  });

  it("renders retained intelligence, shared editors, and no outbound controls", async () => {
    install(richFixture());
    const loaded = await loadClientProspectIntelligence(CLIENT_ORG);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    const html = renderToStaticMarkup(
      createElement(ClientProspectIntelligenceWorkspace, {
        view: loaded.view,
        messages: en,
        language: "en",
      }),
    );
    assert.match(html, /Harbor Practice/);
    assert.match(html, /Original prospect discussion/);
    assert.match(html, /Harbor dentistry/);
    assert.match(html, /A calm harbor practice/);
    assert.match(html, /Current executive summary/);
    assert.match(html, /Open Tuesday through Friday/);
    assert.match(html, /Historical executive summary/);
    assert.match(html, /data-client-prospect-intelligence="workspace"/);
    assert.doesNotMatch(html, /Train Athena|Claim listing|Release listing/);
    assert.match(html, /Send Description to GetOblic/);
    assert.match(html, /Send Knowledge Base to GetOblic/);
    assert.doesNotMatch(html, /<form/);
    assert.match(html, /data-getoblic-content-editor="description"/);
    assert.match(html, /data-getoblic-content-editor="knowledge_base"/);
    assert.match(html, /data-getoblic-content-surface="client"/);
    assert.match(html, /data-getoblic-content-persistence="suggestion"/);

    const empty = renderToStaticMarkup(
      createElement(ClientProspectIntelligenceWorkspace, {
        view: {
          ...loaded.view,
          discussion: null,
          websiteSections: [],
          generatedDescription: null,
          deepScrape: null,
          currentVersion: null,
          historicalVersions: [],
        },
        messages: en,
        language: "en",
      }),
    );
    assert.match(empty, /No current Executive Intelligence version is stored/);
    assert.match(empty, /No generated Description is stored/);
    assert.match(empty, /No historical Executive Intelligence versions are stored/);
  });

  it("keeps Prospect Intelligence out of the base navigation and adds it only as an extra row", () => {
    assert.deepEqual(
      tenantNavDefs.map((item) => item.key),
      [
        "home",
        "defineYourBusiness",
        "buildVisibility",
        "generateTraction",
        "convertOpportunities",
        "athenaInbox",
        "settings",
        "gettingStarted",
        "intelligenceDomains",
        "discussions",
        "ads",
        "socialPlanner",
        "opportunities",
        "briefings",
        "needHelp",
      ],
    );
    assert.equal(
      localizeTenantNav(en).some((item) => item.href === CLIENT_PROSPECT_INTELLIGENCE_HREF),
      false,
    );
    assert.deepEqual(
      tenantNavDefs
        .filter((item) => item.section === "growth")
        .map((item) => ("stageNumber" in item ? item.stageNumber : null)),
      [1, 2, 3, 4],
    );

    const items = localizeTenantNav(en);
    const plain = renderToStaticMarkup(
      createElement(TenantNavList, {
        currentPath: "/",
        items,
        yourGrowthLabel: en.nav.yourGrowth,
        utilitiesLabel: en.nav.utilities,
        moreToolsLabel: en.nav.moreTools,
      }),
    );
    assert.match(plain, /Convert Opportunities/);
    assert.match(plain, /Define Your Business/);
    assert.doesNotMatch(plain, /prospect-intelligence/);

    const withEntry = renderToStaticMarkup(
      createElement(TenantNavList, {
        currentPath: CLIENT_PROSPECT_INTELLIGENCE_HREF,
        items,
        yourGrowthLabel: en.nav.yourGrowth,
        utilitiesLabel: en.nav.utilities,
        moreToolsLabel: en.nav.moreTools,
        trailingGrowth: createElement(ClientProspectIntelligenceNavLink, {
          label: en.nav.prospectIntelligence,
          currentPath: CLIENT_PROSPECT_INTELLIGENCE_HREF,
        }),
      }),
    );
    assert.match(withEntry, /Convert Opportunities/);
    assert.match(withEntry, /href="\/prospect-intelligence"/);
    assert.match(withEntry, /Prospect Intelligence/);
    assert.match(withEntry, /aria-current="page"/);

    const hidden = renderToStaticMarkup(
      createElement(ClientProspectIntelligenceNavGate, {
        label: en.nav.prospectIntelligence,
        currentPath: "/",
      }),
    );
    assert.equal(hidden.includes("prospect-intelligence"), false);

    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    assert.match(sidebar, /ClientProspectIntelligenceNavGate/);
    assert.match(mobile, /ClientProspectIntelligenceNavGate/);
    assert.match(shell, /prospectIntelligenceLabel=\{messages\.nav\.prospectIntelligence\}/);
    assert.match(sidebar, /trailingGrowth/);
    assert.match(mobile, /trailingGrowth/);
  });

  it("localizes the workspace and nav label in six languages", () => {
    const canonical = collectKeyPaths(en.clientProspectIntelligence);
    assert.ok(canonical.includes("jobStatus.completed"));
    assert.ok(canonical.includes("knowledgeBaseEmpty"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const messages = CATALOGS[language];
      assert.deepEqual(
        collectKeyPaths(messages.clientProspectIntelligence),
        canonical,
      );
      assert.ok(messages.nav.prospectIntelligence.trim().length > 0);
      const html = renderToStaticMarkup(
        createElement(ClientProspectIntelligenceUnavailable, {
          copy: messages.clientProspectIntelligence,
        }),
      );
      assert.match(html, new RegExp(messages.clientProspectIntelligence.eyebrow));
      assert.match(html, /data-client-prospect-intelligence="unavailable"/);
    }
    assert.notEqual(fr.nav.prospectIntelligence, en.nav.prospectIntelligence);
    assert.notEqual(es.nav.prospectIntelligence, en.nav.prospectIntelligence);
    assert.notEqual(itMessages.nav.prospectIntelligence, en.nav.prospectIntelligence);
    assert.notEqual(de.nav.prospectIntelligence, en.nav.prospectIntelligence);
    assert.notEqual(pt.nav.prospectIntelligence, en.nav.prospectIntelligence);
  });
});

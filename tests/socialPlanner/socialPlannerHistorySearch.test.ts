import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  SOCIAL_CALENDAR_HISTORY_MAX_LIMIT,
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  toSocialCalendarListItemDto,
  type SocialCalendarListItemDto,
} from "../../services/socialPlanner/socialCalendarDto";
import {
  buildSocialCalendarHistorySearchCorpus,
  filterSocialCalendarsByHistorySearch,
  paginateSocialCalendarHistoryItems,
  socialCalendarMatchesHistorySearch,
} from "../../services/socialPlanner/socialCalendarHistorySearch";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  SOCIAL_CALENDAR_LIBRARY_SELECT,
  buildSocialCalendarHistoryPagination,
  listSocialCalendars,
  normalizeSocialCalendarHistoryLimit,
  normalizeSocialCalendarHistoryPage,
  normalizeSocialCalendarHistoryQuery,
  normalizeSocialCalendarHistorySearch,
} from "../../services/socialPlanner/socialCalendarService";
import { SOCIAL_CALENDAR_WHY_THIS_WEEK_SUMMARY_MAX_CHARS as PACKAGE_WHY_MAX } from "../../services/socialPlanner/socialCalendarPersistedPackage";
import { buildSocialPlannerDateSearchAliases } from "../../components/socialPlanner/socialPlannerDates";
import { TEST_FOREIGN_ORG, TEST_ORG } from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listItem(
  overrides: Partial<SocialCalendarListItemDto> = {},
): SocialCalendarListItemDto {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    periodStart: "2026-08-24",
    periodEnd: "2026-08-30",
    status: "Ready",
    generationMode: "standard",
    generationStage: "finalizing",
    versionNumber: 1,
    sourceCalendarId: null,
    rootCalendarId: null,
    strategySummary: "A balanced family-care week with education.",
    whyThisWeekWorks: "This week balances authority and personality.",
    assetCount: 7,
    assetTypes: [
      "carousel",
      "talking_head_video",
      "branded_graphic",
      "checklist",
      "poll",
    ],
    families: ["secret-family-xyz"],
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    error: null,
    ...overrides,
  };
}

function libraryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: TEST_ORG,
    period_start: "2026-08-24",
    period_end: "2026-08-30",
    generation_mode: "standard",
    generation_stage: "queued",
    version_number: 1,
    source_calendar_id: null,
    root_calendar_id: null,
    status: "Queued",
    package_json: null,
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function calendarId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function sortLibraryRows(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return [...rows].sort((left, right) => {
    const created = String(right.created_at).localeCompare(String(left.created_at));
    if (created !== 0) return created;
    return String(right.id).localeCompare(String(left.id));
  });
}

type LibraryQueryLog = {
  table: string | null;
  select: string | null;
  countExact: boolean;
  eq: Array<[string, unknown]>;
  order: Array<[string, { ascending?: boolean }]>;
  range: Array<[number, number]>;
  limit: number[];
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function installLibraryMock(rows: Record<string, unknown>[]): LibraryQueryLog {
  const log: LibraryQueryLog = {
    table: null,
    select: null,
    countExact: false,
    eq: [],
    order: [],
    range: [],
    limit: [],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    log.table = table;
    let from: number | null = null;
    let to: number | null = null;
    const builder = {
      select(columns: string, opts?: { count?: string }) {
        log.select = columns;
        log.countExact = opts?.count === "exact";
        return builder;
      },
      eq(column: string, value: unknown) {
        log.eq.push([column, value]);
        return builder;
      },
      order(column: string, opts: { ascending?: boolean }) {
        log.order.push([column, opts]);
        return builder;
      },
      range(start: number, end: number) {
        log.range.push([start, end]);
        from = start;
        to = end;
        return builder;
      },
      limit(value: number) {
        log.limit.push(value);
        return builder;
      },
      then(
        onfulfilled?: (value: {
          data: Record<string, unknown>[];
          error: null;
          count: number;
        }) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) {
        const organizationId = log.eq.find(([column]) => column === "organization_id")?.[1];
        const scoped = rows.filter((row) => row.organization_id === organizationId);
        const sorted = sortLibraryRows(scoped);
        const sliced =
          from != null && to != null ? sorted.slice(from, to + 1) : sorted;
        return Promise.resolve({
          data: sliced,
          error: null,
          count: scoped.length,
        }).then(onfulfilled, onrejected);
      },
    };
    return builder;
  };

  return log;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("Social Planner history query normalization", () => {
  it("defaults page to 1 and limit to 25, and clamps limit at 50", () => {
    assert.equal(SOCIAL_CALENDAR_HISTORY_PAGE_SIZE, 25);
    assert.equal(SOCIAL_CALENDAR_HISTORY_MAX_LIMIT, 50);
    assert.deepEqual(normalizeSocialCalendarHistoryQuery({}), {
      search: "",
      page: 1,
      limit: 25,
    });
    assert.equal(normalizeSocialCalendarHistoryPage("0"), 1);
    assert.equal(normalizeSocialCalendarHistoryPage("-3"), 1);
    assert.equal(normalizeSocialCalendarHistoryPage("abc"), 1);
    assert.equal(normalizeSocialCalendarHistoryPage(null), 1);
    assert.equal(normalizeSocialCalendarHistoryPage("3"), 3);
    assert.equal(normalizeSocialCalendarHistoryLimit(undefined), 25);
    assert.equal(normalizeSocialCalendarHistoryLimit("nope"), 25);
    assert.equal(normalizeSocialCalendarHistoryLimit("0"), 25);
    assert.equal(normalizeSocialCalendarHistoryLimit("80"), 50);
    assert.equal(normalizeSocialCalendarHistoryLimit("25"), 25);
    assert.equal(normalizeSocialCalendarHistorySearch("  August  "), "August");
    assert.equal(normalizeSocialCalendarHistorySearch("   "), "");
  });

  it("computes total, totalPages, and hasMore for frozen pages", () => {
    const first = buildSocialCalendarHistoryPagination(1, 25, 51);
    assert.deepEqual(first, {
      page: 1,
      limit: 25,
      total: 51,
      totalPages: 3,
      hasMore: true,
    });
    const last = buildSocialCalendarHistoryPagination(3, 25, 51);
    assert.deepEqual(last, {
      page: 3,
      limit: 25,
      total: 51,
      totalPages: 3,
      hasMore: false,
    });
    assert.deepEqual(buildSocialCalendarHistoryPagination(1, 25, 0), {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasMore: false,
    });
  });
});

describe("Social Planner library pagination", () => {
  it("returns the newest 25 first and reaches calendar 51+ on a later page", async () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      libraryRow({
        id: calendarId(index + 1),
        created_at: new Date(
          Date.parse("2026-08-21T12:00:00.000Z") - index * 60_000,
        ).toISOString(),
      }),
    );
    const log = installLibraryMock(rows);

    const first = await listSocialCalendars(TEST_ORG, { page: 1, limit: 25 });
    assert.equal(first.calendars.length, 25);
    assert.equal(first.calendars[0]?.id, calendarId(1));
    assert.equal(first.calendars[24]?.id, calendarId(25));
    assert.deepEqual(first.pagination, {
      page: 1,
      limit: 25,
      total: 51,
      totalPages: 3,
      hasMore: true,
    });
    assert.deepEqual(log.range, [[0, 24]]);
    assert.deepEqual(log.order, [
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    assert.equal(log.countExact, true);
    assert.deepEqual(log.eq, [["organization_id", TEST_ORG]]);
    assert.equal(log.limit.length, 0);

    const last = await listSocialCalendars(TEST_ORG, { page: 3, limit: 25 });
    assert.equal(last.calendars.length, 1);
    assert.equal(last.calendars[0]?.id, calendarId(51));
    assert.equal(last.pagination.hasMore, false);
    assert.equal(last.pagination.totalPages, 3);
    assert.ok(last.calendars.every((calendar) => calendar.id !== first.calendars[0]?.id));
  });

  it("keeps created_at DESC + id DESC stable when timestamps collide", async () => {
    const createdAt = "2026-08-21T12:00:00.000Z";
    installLibraryMock([
      libraryRow({ id: calendarId(1), created_at: createdAt }),
      libraryRow({ id: calendarId(2), created_at: createdAt }),
      libraryRow({ id: calendarId(3), created_at: createdAt }),
    ]);

    const result = await listSocialCalendars(TEST_ORG, { page: 1, limit: 25 });
    assert.deepEqual(
      result.calendars.map((calendar) => calendar.id),
      [calendarId(3), calendarId(2), calendarId(1)],
    );
  });

  it("does not load the full organization on empty-search browse", async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      libraryRow({
        id: calendarId(index + 1),
        created_at: new Date(
          Date.parse("2026-08-21T12:00:00.000Z") - index * 60_000,
        ).toISOString(),
      }),
    );
    const log = installLibraryMock(rows);
    const result = await listSocialCalendars(TEST_ORG, { search: "   ", page: 1 });
    assert.equal(result.calendars.length, 25);
    assert.deepEqual(log.range, [[0, 24]]);
    assert.equal(log.select, SOCIAL_CALENDAR_LIBRARY_SELECT);
    assert.match(SOCIAL_CALENDAR_LIBRARY_SELECT, /package_json/);
    assert.doesNotMatch(
      SOCIAL_CALENDAR_LIBRARY_SELECT,
      /provenance_json|calendar_context_json|revision_context_json|user_guidance/,
    );
  });
});

describe("Social Planner full-history search", () => {
  it("reaches a match beyond the first 50 calendars", async () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      libraryRow({
        id: calendarId(index + 1),
        created_at: new Date(
          Date.parse("2026-08-21T12:00:00.000Z") - index * 60_000,
        ).toISOString(),
        status: index === 59 ? "Ready" : "Queued",
        package_json:
          index === 59
            ? {
                strategySummary: "UniqueDeepHistoryStrategy",
                whyThisWeekWorks: "Visible why for the deep calendar.",
                assets: [{ assetType: "poll" }],
              }
            : null,
      }),
    );
    const log = installLibraryMock(rows);
    const result = await listSocialCalendars(TEST_ORG, {
      search: "UniqueDeepHistoryStrategy",
      page: 1,
      limit: 25,
    });

    assert.equal(result.calendars.length, 1);
    assert.equal(result.calendars[0]?.id, calendarId(60));
    assert.equal(result.pagination.total, 1);
    assert.equal(log.range.length, 0);
    assert.equal(log.countExact, false);
    assert.deepEqual(log.eq, [["organization_id", TEST_ORG]]);
  });

  it("paginates search matches at 25 per page", async () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      libraryRow({
        id: calendarId(index + 1),
        created_at: new Date(
          Date.parse("2026-08-21T12:00:00.000Z") - index * 60_000,
        ).toISOString(),
        status: "Ready",
        package_json: {
          strategySummary: "Shared searchable strategy",
          whyThisWeekWorks: "Shared why excerpt",
          assets: [{ assetType: "poll" }],
        },
      }),
    );
    installLibraryMock(rows);

    const page1 = await listSocialCalendars(TEST_ORG, {
      search: "Shared searchable strategy",
      page: 1,
      limit: 25,
    });
    const page2 = await listSocialCalendars(TEST_ORG, {
      search: "Shared searchable strategy",
      page: 2,
      limit: 25,
    });

    assert.equal(page1.calendars.length, 25);
    assert.equal(page2.calendars.length, 5);
    assert.equal(page1.pagination.total, 30);
    assert.equal(page1.pagination.hasMore, true);
    assert.equal(page2.pagination.hasMore, false);
    const ids = [...page1.calendars, ...page2.calendars].map((calendar) => calendar.id);
    assert.equal(new Set(ids).size, 30);
  });

  it("does not surface another organization's calendars", async () => {
    installLibraryMock([
      libraryRow({
        id: calendarId(1),
        organization_id: TEST_ORG,
        status: "Ready",
        package_json: {
          strategySummary: "Home organization strategy",
          whyThisWeekWorks: "Home why",
          assets: [{ assetType: "poll" }],
        },
      }),
      libraryRow({
        id: calendarId(99),
        organization_id: TEST_FOREIGN_ORG,
        status: "Ready",
        package_json: {
          strategySummary: "ForeignOrganizationStrategy",
          whyThisWeekWorks: "Foreign why",
          assets: [{ assetType: "poll" }],
        },
      }),
    ]);

    const result = await listSocialCalendars(TEST_ORG, {
      search: "ForeignOrganizationStrategy",
    });
    assert.equal(result.calendars.length, 0);
    assert.equal(result.pagination.total, 0);
    assert.ok(result.calendars.every((calendar) => calendar.organization_id === TEST_ORG));
  });
});

describe("Social Planner searchable corpus", () => {
  it("matches visible card fields and date aliases, case-insensitively", () => {
    const ready = listItem();
    const queries = [
      "August",
      "Aug 24",
      "August 24",
      "August 24 2026",
      "2026",
      "24",
      "2026-08-24",
      "A balanced family-care week",
      "This week balances authority",
      "Ready",
      "7 assets",
      "Carousel",
      "Talking Head Video",
    ];
    for (const query of queries) {
      assert.equal(socialCalendarMatchesHistorySearch(ready, query), true, query);
      assert.equal(
        socialCalendarMatchesHistorySearch(ready, query.toUpperCase()),
        true,
        query.toUpperCase(),
      );
    }

    const generating = listItem({
      status: "Queued",
      strategySummary: null,
      whyThisWeekWorks: null,
      assetCount: 0,
      assetTypes: [],
    });
    assert.equal(socialCalendarMatchesHistorySearch(generating, "Generating"), true);
    assert.equal(socialCalendarMatchesHistorySearch(generating, "Queued"), false);

    const failed = listItem({ status: "Processing Failed" });
    assert.equal(socialCalendarMatchesHistorySearch(failed, "Failed"), true);
    assert.equal(socialCalendarMatchesHistorySearch(failed, "Processing Failed"), false);

    const revised = listItem({
      generationMode: "think_differently",
      versionNumber: 3,
    });
    assert.equal(socialCalendarMatchesHistorySearch(revised, "Think Differently"), true);
    assert.equal(socialCalendarMatchesHistorySearch(revised, "Version 3"), true);
    assert.equal(socialCalendarMatchesHistorySearch(listItem(), "Standard"), false);
    assert.equal(socialCalendarMatchesHistorySearch(listItem(), "Version 1"), false);
  });

  it("searches only the first four visible asset-type labels on Ready cards", () => {
    const ready = listItem();
    assert.equal(socialCalendarMatchesHistorySearch(ready, "Checklist"), true);
    assert.equal(socialCalendarMatchesHistorySearch(ready, "Poll"), false);
    const queued = listItem({
      status: "Queued",
      assetCount: 7,
      assetTypes: ["poll"],
    });
    assert.equal(socialCalendarMatchesHistorySearch(queued, "7 assets"), false);
    assert.equal(socialCalendarMatchesHistorySearch(queued, "Poll"), false);
  });

  it("does not match hidden metadata or static chrome", () => {
    const ready = listItem({
      sourceCalendarId: "source-secret-id",
      rootCalendarId: "root-secret-id",
      generationStage: "secret-generation-stage",
      families: ["secret-family-xyz"],
    });
    const corpus = buildSocialCalendarHistorySearchCorpus(ready);
    assert.doesNotMatch(corpus, /source-secret-id|root-secret-id|secret-generation-stage|secret-family-xyz/);
    assert.doesNotMatch(corpus, /Athena is still planning|Open Calendar|Newest first/);
    assert.equal(socialCalendarMatchesHistorySearch(ready, "source-secret-id"), false);
    assert.equal(socialCalendarMatchesHistorySearch(ready, "secret-family-xyz"), false);
    assert.equal(socialCalendarMatchesHistorySearch(ready, "secret-generation-stage"), false);
  });

  it("searches the card whyThisWeekWorks excerpt, not the truncated tail", () => {
    assert.equal(PACKAGE_WHY_MAX, 180);
    const hiddenTail = "UNIQUE_HIDDEN_WHY_TAIL";
    const whyThisWeekWorks = `${"Visible why excerpt for the card. ".repeat(8)}${hiddenTail}`;
    const item = toSocialCalendarListItemDto(
      mapSocialCalendarRow(
        libraryRow({
          status: "Ready",
          package_json: {
            strategySummary: "Visible strategy",
            whyThisWeekWorks,
            assets: [{ assetType: "poll" }],
          },
        }),
      ),
    );
    assert.ok((item.whyThisWeekWorks ?? "").includes("Visible why excerpt"));
    assert.ok(!(item.whyThisWeekWorks ?? "").includes(hiddenTail));
    assert.equal(socialCalendarMatchesHistorySearch(item, "Visible why excerpt"), true);
    assert.equal(socialCalendarMatchesHistorySearch(item, hiddenTail), false);
  });

  it("returns zero results for an unknown needle and can paginate filtered matches", () => {
    const items = [
      listItem({ id: calendarId(1) }),
      listItem({ id: calendarId(2), strategySummary: "Another visible strategy" }),
    ];
    assert.deepEqual(filterSocialCalendarsByHistorySearch(items, "zzz-no-such-calendar"), []);
    const many = Array.from({ length: 30 }, (_, index) =>
      listItem({ id: calendarId(index + 1) }),
    );
    const page1 = paginateSocialCalendarHistoryItems(
      filterSocialCalendarsByHistorySearch(many, "Ready"),
      1,
      25,
    );
    const page2 = paginateSocialCalendarHistoryItems(
      filterSocialCalendarsByHistorySearch(many, "Ready"),
      2,
      25,
    );
    assert.equal(page1.length, 25);
    assert.equal(page2.length, 5);
  });

  it("builds deterministic date aliases without an external parser", () => {
    const aliases = buildSocialPlannerDateSearchAliases("2026-08-24");
    for (const expected of [
      "2026-08-24",
      "August",
      "Aug",
      "24",
      "2026",
      "Aug 24",
      "August 24",
      "August 24 2026",
    ]) {
      assert.ok(aliases.includes(expected), expected);
    }
    assert.doesNotMatch(read("components/socialPlanner/socialPlannerDates.ts"), /chrono|luxon|date-fns|nlp/i);
    assert.doesNotMatch(
      read("services/socialPlanner/socialCalendarHistorySearch.ts"),
      /package_json::text|ilike\(|last week|next Monday/,
    );
  });
});

describe("Social Planner history search UI and polling", () => {
  it("places Prospects-style search between create and Your Social Calendars", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    const createIdx = workspace.indexOf("<SocialPlannerCreateForm");
    const searchIdx = workspace.indexOf("Search calendars, dates, strategy, asset types");
    const historyIdx = workspace.indexOf("<SocialPlannerHistory");
    assert.ok(createIdx >= 0 && searchIdx > createIdx && historyIdx > searchIdx);
    assert.match(workspace, /className="mt-2 w-full rounded-2xl border border-white\/10 bg-black\/30 px-4 py-3 text-sm text-white outline-none"/);
    assert.match(history, /Your Social Calendars/);
    assert.match(history, /No calendars match your search/);
    assert.doesNotMatch(workspace, /\bStatus\b|\bSort\b|Import/);
    assert.doesNotMatch(history, /\bStatus\b|\bSort\b|Import Prospects|infinite scroll|pageNumbers/);
  });

  it("uses Prospects Previous \/ Next chrome and Showing X–Y of Z", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /Showing \{rangeStart\}–\{rangeEnd\} of \{pagination\.total\}/);
    assert.match(history, />\s*Previous\s*</);
    assert.match(history, />\s*Next\s*</);
    assert.match(history, /disabled=\{pagination\.page <= 1\}/);
    assert.match(history, /disabled=\{pagination\.page >= pagination\.totalPages\}/);
    assert.match(history, /showPagination = pagination\.total > pagination\.limit/);
    assert.doesNotMatch(history, /type="number"|pageNumbers|Load more/);
  });

  it("keeps search visible with zero results and resets to page 1 on search change", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(workspace, /function handleSearchChange/);
    assert.match(workspace, /setPage\(1\)/);
    assert.match(workspace, /void loadHistory\(value, 1\)/);
    assert.match(history, /hasSearch = search\.trim\(\)\.length > 0/);
    assert.match(history, /No calendars match your search/);
    assert.doesNotMatch(workspace, /useSearchParams|replaceState|searchParams\.set\("page"/);
  });

  it("polls the current search\/page\/limit through one history loop", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(
      workspace,
      /fetchSocialCalendarHistory\(\{\s*search: nextSearch,\s*page: nextPage,\s*limit,/,
    );
    assert.match(workspace, /await loadHistory\(search, page\)/);
    assert.equal((workspace.match(/setInterval/g) || []).length, 1);
    assert.equal((workspace.match(/fetchSocialCalendarHistory\(/g) || []).length, 1);
    assert.doesNotMatch(workspace, /fetchSocialCalendarDetail/);
    assert.doesNotMatch(workspace, /setSearch\(""\)/);
    assert.match(workspace, /latestRequestKeyRef/);
    assert.match(workspace, /isSocialPlannerInFlight\(item\.status\)/);
  });

  it("encodes client search and returns calendars plus pagination", () => {
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    const page = read("app/social-planner/page.tsx");
    assert.match(client, /new URLSearchParams\(\)/);
    assert.match(client, /params\.set\("search", search\)/);
    assert.match(client, /calendars: payload\.calendars/);
    assert.match(client, /pagination/);
    assert.match(page, /search: ""/);
    assert.match(page, /page: 1/);
    assert.match(page, /limit: SOCIAL_CALENDAR_HISTORY_PAGE_SIZE/);
    assert.match(page, /redirect\(`\/social-planner\/\$\{requestedId\}`\)/);
  });
});

describe("Social Planner history search non-interference", () => {
  it("does not alter create routing, detail, memory, or migrations", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const service = read("services/socialPlanner/socialCalendarService.ts");
    const route = read("app/api/social-planner/route.ts");
    const detailPage = read("app/social-planner/[id]/page.tsx");

    assert.match(workspace, /router\.push\(`\/social-planner\/\$\{created\.id\}`\)/);
    assert.match(service, /export async function listReadySocialCalendarsForMemory/);
    assert.match(service, /\.limit\(input\.limit\)/);
    assert.match(route, /export async function POST\(request: Request\) \{/);
    assert.match(route, /createSocialCalendarWithJob/);
    assert.doesNotMatch(detailPage, /fetchSocialCalendarHistory|SOCIAL_CALENDAR_HISTORY_PAGE_SIZE/);
    assert.equal(existsSync(join(ROOT, "app/social-planner/[id]/page.tsx")), true);

    const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    const socialMigrations = migrations.filter((name) => name.includes("social_calendar"));
    assert.deepEqual(socialMigrations, [
      "20260819000001_create_athena_social_calendars.sql",
      "20260820000001_create_athena_social_calendar_conversation.sql",
    ]);
    assert.doesNotMatch(service, /search_text|create or replace function/i);
    assert.doesNotMatch(route, /organizationId: url\.searchParams/);
  });
});

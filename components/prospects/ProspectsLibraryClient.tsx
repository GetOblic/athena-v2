"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Filter, Search } from "lucide-react";
import { AthenaIntelligenceListRow } from "@/components/ui/AthenaIntelligenceListRow";
import { GetOblicListingReleaseControl } from "@/components/prospects/GetOblicListingReleaseControl";
import { ProspectLibraryCard } from "@/components/prospects/ProspectLibraryCard";
import { PROSPECT_LIFECYCLE_STATUSES } from "@/services/prospects/prospectLifecycle";
import type { ProspectLibraryRow } from "@/services/prospects/prospectLibraryEnrichment";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  PROSPECT_CARD_SURFACE_CLASS,
  PROSPECT_LIBRARY_PRIMARY_ACTION,
  PROSPECT_LIBRARY_SECONDARY_ACTION,
  PROSPECT_TOOLBAR_FIELD_CLASS,
  PROSPECT_TOOLBAR_SURFACE_CLASS,
  shouldShowProspectLibraryReleaseCta,
} from "@/lib/prospects/prospectLibraryPresentation";
import { getProspectWorkingStatusLabel } from "@/lib/prospects/prospectReadinessPresentation";
import {
  DEFAULT_PROSPECT_LIBRARY_SORT,
  PROSPECT_LIBRARY_PAGE_SIZE,
  buildProspectLibraryView,
  isProspectLibrarySortKey,
  type ProspectLibrarySortKey,
} from "@/lib/prospects/prospectLibrarySort";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type ProspectsLibraryClientProps = {
  prospects: ProspectLibraryRow[];
  messages?: TenantMessages;
  language?: OrganizationLanguage;
};

export function ProspectsLibraryClient({
  prospects,
  messages,
  language = "en",
}: ProspectsLibraryClientProps) {
  const list = messages?.prospects.list;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<ProspectLibrarySortKey>(
    DEFAULT_PROSPECT_LIBRARY_SORT,
  );
  const [page, setPage] = useState(1);

  const statuses = useMemo(() => {
    const set = new Set(
      prospects.map((prospect) => prospect.display_lifecycle_status),
    );
    for (const option of PROSPECT_LIFECYCLE_STATUSES) {
      set.add(option);
    }
    return ["all", ...Array.from(set).sort()];
  }, [prospects]);

  const { filtered, pageRows, currentPage, totalPages } = useMemo(
    () =>
      buildProspectLibraryView(prospects, {
        query,
        status,
        sort,
        page,
      }),
    [prospects, query, sort, status, page],
  );

  if (prospects.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-8 text-left sm:p-10">
        <h2 className="text-2xl font-semibold">
          {list?.emptyTitle ?? "No prospects yet."}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/50">
          {list?.emptyBody ??
            "A prospect is a business you want Athena to understand and help you pursue."}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-7 text-white/40">
          {list?.emptySupport ??
            "Add one so Athena can learn who they are, what may matter, and how to approach them."}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-7 text-white/35">
          {list?.emptyHelp ??
            "Athena can write prospect intelligence and outreach drafts from the information you provide. A website helps."}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/prospects/find"
            className={PROSPECT_LIBRARY_PRIMARY_ACTION}
          >
            {list?.findOpportunitiesCta ?? "Find opportunities"}
          </Link>
          <Link
            href="/prospects/import"
            className={PROSPECT_LIBRARY_SECONDARY_ACTION}
          >
            {list?.addProspectYourselfCta ??
              list?.createFirstCta ??
              list?.importCta ??
              "Add a prospect yourself"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={PROSPECT_TOOLBAR_SURFACE_CLASS}>
        <label className="block text-sm text-white/50">
          <span className="inline-flex items-center gap-1.5">
            <Search className="size-3.5" aria-hidden="true" />
            {list?.search ?? "Search"}
          </span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={
              list?.searchPlaceholder ??
              "Business, website, decision maker, category…"
            }
            className={`mt-2 ${PROSPECT_TOOLBAR_FIELD_CLASS}`}
          />
        </label>
        <label className="block text-sm text-white/50">
          <span className="inline-flex items-center gap-1.5">
            <Filter className="size-3.5" aria-hidden="true" />
            {list?.status ?? "Working status"}
          </span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={`mt-2 ${PROSPECT_TOOLBAR_FIELD_CLASS}`}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value === "all"
                  ? (list?.allStatuses ?? "All statuses")
                  : messages
                    ? getProspectWorkingStatusLabel(messages, value)
                    : value}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-white/50">
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
            {list?.sort ?? "Sort"}
          </span>
          <select
            value={sort}
            onChange={(event) => {
              const next = event.target.value;
              if (isProspectLibrarySortKey(next)) {
                setSort(next);
                setPage(1);
              }
            }}
            className={`mt-2 ${PROSPECT_TOOLBAR_FIELD_CLASS}`}
          >
            <option value="updated_desc">
              {list?.sortRecentlyUpdated ?? "Recently updated"}
            </option>
            <option value="updated_asc">
              {list?.sortOldestUpdated ?? "Oldest updated"}
            </option>
            <option value="name_asc">
              {list?.sortNameAsc ?? "Name A–Z"}
            </option>
            <option value="name_desc">
              {list?.sortNameDesc ?? "Name Z–A"}
            </option>
            <option value="score_desc">
              {list?.sortCompletenessHigh ?? "Completeness: high to low"}
            </option>
            <option value="score_asc">
              {list?.sortCompletenessLow ?? "Completeness: low to high"}
            </option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-10 text-center">
          <h2 className="text-2xl font-semibold">
            {list?.filterEmptyTitle ?? "No prospects found."}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            {list?.filterEmptyBody ??
              "Try a different search or working-status filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pageRows.map((prospect) => {
            const releaseStatus = prospect.getoblic_relationship_status;
            return (
              <AthenaIntelligenceListRow
                key={prospect.id}
                href={`/prospects/${prospect.id}`}
                ariaLabel={
                  messages
                    ? interpolateTenantMessage(
                        messages.prospects.list.openProspectAria,
                        { name: prospect.business_name },
                      )
                    : prospect.business_name
                }
                className={PROSPECT_CARD_SURFACE_CLASS}
              >
                <ProspectLibraryCard
                  prospect={prospect}
                  messages={messages}
                  language={language}
                  release={
                    messages &&
                    shouldShowProspectLibraryReleaseCta(releaseStatus) ? (
                      <GetOblicListingReleaseControl
                        prospectId={prospect.id}
                        relationshipStatus={releaseStatus}
                        messages={messages}
                      />
                    ) : null
                  }
                />
              </AthenaIntelligenceListRow>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && totalPages > 1 ? (
        <div className="flex flex-col gap-3 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {interpolateTenantMessage(
              list?.showing ?? "Showing {start}–{end} of {total}",
              {
                start: (currentPage - 1) * PROSPECT_LIBRARY_PAGE_SIZE + 1,
                end: Math.min(
                  currentPage * PROSPECT_LIBRARY_PAGE_SIZE,
                  filtered.length,
                ),
                total: filtered.length,
              },
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-30"
            >
              {list?.previous ?? "Previous"}
            </button>
            <span className="tabular-nums text-white/55">
              {interpolateTenantMessage(
                list?.pageOf ?? "Page {current} of {total}",
                { current: currentPage, total: totalPages },
              )}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-30"
            >
              {list?.next ?? "Next"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

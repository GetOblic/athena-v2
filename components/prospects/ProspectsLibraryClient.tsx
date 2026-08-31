"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS } from "@/components/ui/athenaIntelligenceRow";
import { PROSPECT_LIFECYCLE_STATUSES } from "@/services/prospects/prospectLifecycle";
import type { ProspectLibraryRow } from "@/services/prospects/prospectLibraryEnrichment";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  getLocalizedProspectLifecycleLabel,
  getLocalizedProspectReadinessLabel,
} from "@/lib/tenantI18n/prospectPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type ProspectsLibraryClientProps = {
  prospects: ProspectLibraryRow[];
  messages?: TenantMessages;
  language?: OrganizationLanguage;
};

const PAGE_SIZE = 25;

function formatDate(
  value: string | null | undefined,
  language: OrganizationLanguage,
  emptyValue: string,
) {
  if (!value) return emptyValue;
  return formatTenantDate(value, language) || emptyValue;
}

export function ProspectsLibraryClient({
  prospects,
  messages,
  language = "en",
}: ProspectsLibraryClientProps) {
  const list = messages?.prospects.list;
  const emptyValue = messages?.prospects.emptyValue ?? "—";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"updated" | "created" | "score" | "name">(
    "updated",
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let rows = prospects.filter((prospect) => {
      if (
        status !== "all" &&
        prospect.display_lifecycle_status !== status
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        prospect.business_name,
        prospect.website,
        prospect.decision_maker,
        prospect.category,
        prospect.industry,
        prospect.email,
        prospect.city,
        prospect.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });

    rows = [...rows].sort((a, b) => {
      if (sort === "name") {
        return a.business_name.localeCompare(b.business_name);
      }
      if (sort === "score") {
        return (
          (b.display_opportunity_score ?? -1) -
          (a.display_opportunity_score ?? -1)
        );
      }
      if (sort === "created") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

    return rows;
  }, [prospects, query, sort, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 md:grid-cols-3">
          <label className="block text-sm text-white/50">
            {list?.search ?? "Search"}
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
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
            />
          </label>
          <label className="block text-sm text-white/50">
            {list?.status ?? "Status"}
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value === "all"
                    ? (list?.allStatuses ?? "All statuses")
                    : messages
                      ? getLocalizedProspectLifecycleLabel(messages, value)
                      : value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-white/50">
            {list?.sort ?? "Sort"}
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as typeof sort)
              }
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="updated">{list?.sortUpdated ?? "Updated"}</option>
              <option value="created">{list?.sortCreated ?? "Created"}</option>
              <option value="score">
                {list?.sortScore ?? "Opportunity Score"}
              </option>
              <option value="name">{list?.sortName ?? "Business Name"}</option>
            </select>
          </label>
        </div>

        <Link
          href="/prospects/import"
          className="inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          {list?.importCta ?? "Import Prospects"}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
          <h2 className="text-2xl font-semibold">
            {list?.emptyTitle ?? "No prospects found."}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            {list?.emptyBody ??
              "Import a business manually or via CSV to start Prospect Intelligence."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
          <div className="grid min-w-[1100px] grid-cols-[1.4fr_1.2fr_1fr_1fr_160px_120px_110px_110px] gap-4 border-b border-white/10 px-6 py-4 text-xs uppercase tracking-[0.2em] text-white/35">
            <div>{list?.colBusinessName ?? "Business Name"}</div>
            <div>{list?.colWebsite ?? "Website"}</div>
            <div>{list?.colDecisionMaker ?? "Decision Maker"}</div>
            <div>{list?.colCategory ?? "Category"}</div>
            <div>{list?.colStatus ?? "Status"}</div>
            <div>{list?.colScore ?? "Opportunity Score"}</div>
            <div>{list?.colCreated ?? "Created"}</div>
            <div>{list?.colUpdated ?? "Updated"}</div>
          </div>

          {pageRows.map((prospect) => (
            <Link
              key={prospect.id}
              href={`/prospects/${prospect.id}`}
              className={`grid min-w-[1100px] grid-cols-[1.4fr_1.2fr_1fr_1fr_160px_120px_110px_110px] gap-4 px-6 py-5 text-sm transition hover:bg-white/[0.03] ${ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS}`}
            >
              <div className="font-medium text-white">
                {prospect.business_name}
              </div>
              <div className="truncate text-white/55">
                {prospect.website || emptyValue}
              </div>
              <div className="text-white/55">
                {prospect.decision_maker || emptyValue}
              </div>
              <div className="text-white/55">
                {prospect.category || emptyValue}
              </div>
              <div>
                <div className="text-[var(--athena-orange)]">
                  {messages
                    ? getLocalizedProspectLifecycleLabel(
                        messages,
                        prospect.display_lifecycle_status,
                      )
                    : prospect.display_lifecycle_status}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  {messages
                    ? getLocalizedProspectReadinessLabel(
                        messages,
                        prospect.display_status,
                      )
                    : prospect.display_status}
                </div>
              </div>
              <div>{prospect.display_opportunity_score_label}</div>
              <div className="text-white/45">
                {formatDate(prospect.created_at, language, emptyValue)}
              </div>
              <div className="text-white/45">
                {formatDate(prospect.updated_at, language, emptyValue)}
              </div>
            </Link>
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-white/45">
          <div>
            {interpolateTenantMessage(
              list?.showing ?? "Showing {start}–{end} of {total}",
              {
                start: (currentPage - 1) * PAGE_SIZE + 1,
                end: Math.min(currentPage * PAGE_SIZE, filtered.length),
                total: filtered.length,
              },
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-30"
            >
              {list?.previous ?? "Previous"}
            </button>
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
      )}
    </div>
  );
}

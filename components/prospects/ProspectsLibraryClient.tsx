"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PROSPECT_LIFECYCLE_STATUSES } from "@/services/prospects/prospectLifecycle";
import type { ProspectLibraryRow } from "@/services/prospects/prospectLibraryEnrichment";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  getProspectIntelligenceStatusLabel,
  getProspectWorkingStatusLabel,
} from "@/lib/prospects/prospectReadinessPresentation";
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

function formatProspectLocation(prospect: ProspectLibraryRow): string {
  return [prospect.city, prospect.state, prospect.country]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
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
  const [sort, setSort] = useState<"updated" | "created" | "name">("updated");
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
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            {list?.findOpportunitiesCta ?? "Find opportunities"}
          </Link>
          <Link
            href="/prospects/import"
            className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white sm:w-auto"
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-3">
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
            {list?.status ?? "Working status"}
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
                      ? getProspectWorkingStatusLabel(messages, value)
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
              <option value="name">{list?.sortName ?? "Name"}</option>
            </select>
          </label>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/prospects/find"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            {list?.findOpportunitiesCta ?? "Find opportunities"}
          </Link>
          <Link
            href="/prospects/import"
            className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            {list?.importCta ?? "Add prospect"}
          </Link>
        </div>
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
            const categoryOrIndustry =
              prospect.category?.trim() || prospect.industry?.trim() || "";
            const location = formatProspectLocation(prospect);
            const meta = [categoryOrIndustry, location]
              .filter(Boolean)
              .join(" · ");
            return (
              <Link
                key={prospect.id}
                href={`/prospects/${prospect.id}`}
                className="min-w-0 rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5 transition hover:border-white/20 hover:bg-white/[0.03]"
              >
                <h3 className="break-words text-lg font-semibold text-white">
                  {prospect.business_name}
                </h3>
                {meta ? (
                  <p className="mt-2 break-words text-sm text-white/50">
                    {meta}
                  </p>
                ) : null}
                {prospect.decision_maker ? (
                  <p className="mt-2 break-words text-sm text-white/55">
                    {prospect.decision_maker}
                  </p>
                ) : null}
                <div className="mt-3 text-sm text-[var(--athena-orange)]">
                  {messages
                    ? getProspectWorkingStatusLabel(
                        messages,
                        prospect.display_lifecycle_status,
                      )
                    : prospect.display_lifecycle_status}
                </div>
                <div className="mt-1 text-sm text-white/45">
                  {messages
                    ? getProspectIntelligenceStatusLabel(
                        messages,
                        prospect.display_status,
                      )
                    : prospect.display_status}
                </div>
                <div className="mt-3 text-xs text-white/40">
                  {formatDate(prospect.updated_at, language, emptyValue)}
                </div>
                {prospect.website ? (
                  <div className="mt-1 truncate text-sm text-white/40">
                    {prospect.website}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col gap-3 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
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

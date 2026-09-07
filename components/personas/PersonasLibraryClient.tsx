"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PERSONA_LIFECYCLE_STATUSES } from "@/services/personas/personaLifecycle";
import type { PersonaLibraryRow } from "@/services/personas/personaLibraryEnrichment";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  getAudienceIntelligenceStatusLabel,
  getAudienceWorkingStatusLabel,
} from "@/lib/personas/audienceReadinessPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type PersonasLibraryClientProps = {
  personas: PersonaLibraryRow[];
  loadError?: string | null;
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

export function PersonasLibraryClient({
  personas,
  loadError = null,
  messages,
  language = "en",
}: PersonasLibraryClientProps) {
  const list = messages?.personas.list;
  const emptyValue = messages?.personas.emptyValue ?? "—";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"updated" | "created" | "name">("updated");
  const [page, setPage] = useState(1);

  const statuses = useMemo(() => {
    return ["all", ...PERSONA_LIFECYCLE_STATUSES];
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let rows = personas.filter((persona) => {
      if (
        status !== "all" &&
        persona.display_lifecycle_status !== status
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        persona.persona_name,
        persona.display_label,
        persona.short_description,
        persona.category,
        persona.city,
        persona.state,
        persona.country,
        persona.languages,
        persona.occupation,
        persona.additional_context,
        persona.reference_website,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });

    rows = [...rows].sort((a, b) => {
      if (sort === "name") {
        return a.display_label.localeCompare(b.display_label);
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
  }, [personas, query, sort, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  if (loadError) {
    return (
      <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-10 text-center">
        <h2 className="text-2xl font-semibold text-rose-100">
          {messages?.personas.loadErrorTitle ?? "Unable to load audiences"}
        </h2>
        <p className="mx-auto mt-4 max-w-xl break-words text-sm leading-7 text-rose-100/70">
          {loadError}
        </p>
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-8 text-left sm:p-10">
        <h2 className="text-2xl font-semibold">
          {list?.emptyTitle ?? "No audiences are defined yet."}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/50">
          {list?.emptyBody ??
            "Athena needs audience context to reason more specifically about who you want to reach."}
        </p>
        <Link
          href="/personas/import"
          className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white sm:w-auto"
        >
          {list?.createFirstCta ?? "Define your first audience"}
        </Link>
      </div>
    );
  }

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
                "Name, description, category, location…"
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
                      ? getAudienceWorkingStatusLabel(messages, value)
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

        <Link
          href="/personas/import"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white sm:w-auto"
        >
          {list?.createCta ?? "Create audience"}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-10 text-center">
          <h2 className="text-2xl font-semibold">
            {list?.filterEmptyTitle ?? "No audiences found."}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            {list?.filterEmptyBody ??
              "Try a different search or working-status filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pageRows.map((persona) => {
            const meta = [
              persona.category,
              persona.display_location,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Link
                key={persona.id}
                href={`/personas/${persona.id}`}
                className="min-w-0 rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5 transition hover:border-white/20 hover:bg-white/[0.03]"
              >
                <h3 className="break-words text-lg font-semibold text-white">
                  {persona.display_label}
                </h3>
                {persona.short_description ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/55">
                    {persona.short_description}
                  </p>
                ) : null}
                <div className="mt-3 text-sm text-[var(--athena-orange)]">
                  {messages
                    ? getAudienceIntelligenceStatusLabel(
                        messages,
                        persona.display_status,
                      )
                    : persona.display_status}
                </div>
                <div className="mt-1 hidden text-xs text-white/35 lg:block">
                  {messages
                    ? getAudienceWorkingStatusLabel(
                        messages,
                        persona.display_lifecycle_status,
                      )
                    : persona.display_lifecycle_status}
                </div>
                {meta ? (
                  <div className="mt-3 text-sm text-white/50">{meta}</div>
                ) : null}
                {persona.display_reference_website ? (
                  <div className="mt-1 truncate text-sm text-white/40">
                    {persona.display_reference_website}
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-white/40">
                  {formatDate(persona.updated_at, language, emptyValue)}
                </div>
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

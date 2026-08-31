"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS } from "@/components/ui/athenaIntelligenceRow";
import { PERSONA_LIFECYCLE_STATUSES } from "@/services/personas/personaLifecycle";
import type { PersonaLibraryRow } from "@/services/personas/personaLibraryEnrichment";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  getLocalizedPersonaLifecycleLabel,
  getLocalizedPersonaReadinessLabel,
} from "@/lib/tenantI18n/personaPresentation";
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
  const [sort, setSort] = useState<"updated" | "created" | "score" | "name">(
    "updated",
  );
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
      if (sort === "score") {
        const aScore =
          a.display_opportunity_score == null
            ? Number.NEGATIVE_INFINITY
            : a.display_opportunity_score;
        const bScore =
          b.display_opportunity_score == null
            ? Number.NEGATIVE_INFINITY
            : b.display_opportunity_score;
        return bScore - aScore;
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
          {messages?.personas.loadErrorTitle ?? "Unable to load Personas"}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-rose-100/70">
          {loadError}
        </p>
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
        <h2 className="text-2xl font-semibold">
          {list?.emptyTitle ?? "No Personas yet"}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
          {list?.emptyBody ??
            "Personas represent clientele types or customer archetypes. Create one manually or import a CSV to start building your Persona library."}
        </p>
        <Link
          href="/personas/import"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          {list?.createCta ?? "Create or Import Personas"}
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
                      ? getLocalizedPersonaLifecycleLabel(messages, value)
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
              <option value="name">{list?.sortName ?? "Persona Name"}</option>
            </select>
          </label>
        </div>

        <Link
          href="/personas/import"
          className="inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          {list?.createCta ?? "Create or Import Personas"}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
          <h2 className="text-2xl font-semibold">
            {list?.filterEmptyTitle ?? "No personas found."}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            {list?.filterEmptyBody ??
              "Try a different search or lifecycle filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
          <div className="grid min-w-[1100px] grid-cols-[1.4fr_1.2fr_1fr_1fr_160px_120px_110px_110px] gap-4 border-b border-white/10 px-6 py-4 text-xs uppercase tracking-[0.2em] text-white/35">
            <div>{list?.colPersona ?? "Persona"}</div>
            <div>{list?.colReferenceWebsite ?? "Reference Website"}</div>
            <div>{list?.colCategory ?? "Category"}</div>
            <div>{list?.colLocation ?? "Location"}</div>
            <div>{list?.colStatus ?? "Status"}</div>
            <div>{list?.colScore ?? "Opportunity Score"}</div>
            <div>{list?.colCreated ?? "Created"}</div>
            <div>{list?.colUpdated ?? "Updated"}</div>
          </div>

          {pageRows.map((persona) => (
            <Link
              key={persona.id}
              href={`/personas/${persona.id}`}
              className={`grid min-w-[1100px] grid-cols-[1.4fr_1.2fr_1fr_1fr_160px_120px_110px_110px] gap-4 px-6 py-5 text-sm transition hover:bg-white/[0.03] ${ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS}`}
            >
              <div className="font-medium text-white">
                {persona.display_label}
              </div>
              <div className="truncate text-white/55">
                {persona.display_reference_website || emptyValue}
              </div>
              <div className="text-white/55">
                {persona.category || emptyValue}
              </div>
              <div className="text-white/55">
                {persona.display_location || emptyValue}
              </div>
              <div>
                <div className="text-[var(--athena-orange)]">
                  {messages
                    ? getLocalizedPersonaLifecycleLabel(
                        messages,
                        persona.display_lifecycle_status,
                      )
                    : persona.display_lifecycle_status}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  {messages
                    ? getLocalizedPersonaReadinessLabel(
                        messages,
                        persona.display_status,
                      )
                    : persona.display_status}
                </div>
              </div>
              <div>{persona.display_opportunity_score_label}</div>
              <div className="text-white/45">
                {formatDate(persona.created_at, language, emptyValue)}
              </div>
              <div className="text-white/45">
                {formatDate(persona.updated_at, language, emptyValue)}
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

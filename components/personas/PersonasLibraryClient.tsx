"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpDown, Filter, Search, Users } from "lucide-react";
import { PersonaConfidenceScore } from "@/components/personas/PersonaConfidenceScore";
import { PERSONA_LIFECYCLE_STATUSES } from "@/services/personas/personaLifecycle";
import type { PersonaLibraryRow } from "@/services/personas/personaLibraryEnrichment";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  getAudienceIntelligenceStatusLabel,
  getAudienceWorkingStatusLabel,
} from "@/lib/personas/audienceReadinessPresentation";
import {
  PERSONA_CARD_ICON_WELL_CLASS,
  PERSONA_CARD_SURFACE_CLASS,
  PERSONA_TOOLBAR_FIELD_CLASS,
  PERSONA_TOOLBAR_SURFACE_CLASS,
  personaIntelligenceChipClass,
} from "@/lib/personas/personaPagePresentation";
import {
  DEFAULT_PERSONA_LIBRARY_SORT,
  isPersonaLibrarySortKey,
  sortPersonaLibraryRows,
  type PersonaLibrarySortKey,
} from "@/lib/personas/personaLibrarySort";
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
  const [sort, setSort] = useState<PersonaLibrarySortKey>(
    DEFAULT_PERSONA_LIBRARY_SORT,
  );
  const [page, setPage] = useState(1);

  const statuses = useMemo(() => {
    return ["all", ...PERSONA_LIFECYCLE_STATUSES];
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = personas.filter((persona) => {
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

    return sortPersonaLibraryRows(rows, sort);
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={PERSONA_TOOLBAR_SURFACE_CLASS}>
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
              "Name, description, category, location…"
            }
            className={`mt-2 ${PERSONA_TOOLBAR_FIELD_CLASS}`}
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
            className={`mt-2 ${PERSONA_TOOLBAR_FIELD_CLASS}`}
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
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
            {list?.sort ?? "Sort"}
          </span>
          <select
            value={sort}
            onChange={(event) => {
              const next = event.target.value;
              if (isPersonaLibrarySortKey(next)) {
                setSort(next);
              }
            }}
            className={`mt-2 ${PERSONA_TOOLBAR_FIELD_CLASS}`}
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
            <option value="confidence_desc">
              {list?.sortConfidenceHigh ?? "Confidence: highest"}
            </option>
            <option value="confidence_asc">
              {list?.sortConfidenceLow ?? "Confidence: lowest"}
            </option>
          </select>
        </label>
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
            const intelligenceLabel = messages
              ? getAudienceIntelligenceStatusLabel(
                  messages,
                  persona.display_status,
                )
              : persona.display_status;
            const showLifecycle =
              persona.display_lifecycle_status !== "New";
            const updatedLabel = [
              messages?.personas.detail.updated ?? "Updated",
              formatDate(persona.updated_at, language, emptyValue),
            ]
              .filter(Boolean)
              .join(" ");
            const shortDescription = persona.short_description?.trim() ?? "";
            return (
              <Link
                key={persona.id}
                href={`/personas/${persona.id}`}
                className={PERSONA_CARD_SURFACE_CLASS}
              >
                <div className="flex items-start gap-3">
                  <div className={PERSONA_CARD_ICON_WELL_CLASS} aria-hidden="true">
                    <Users className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-base font-semibold text-white sm:text-lg">
                      {persona.display_label}
                    </h3>
                    {meta ? (
                      <p className="mt-0.5 truncate text-xs text-white/45">
                        {meta}
                      </p>
                    ) : null}
                  </div>
                  {messages ? (
                    <PersonaConfidenceScore
                      confidence={persona.display_confidence}
                      messages={messages.personas}
                    />
                  ) : null}
                </div>
                {shortDescription ? (
                  <p className="mt-2.5 line-clamp-2 break-words text-sm leading-6 text-white/60">
                    {shortDescription}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {intelligenceLabel ? (
                        <span
                          className={personaIntelligenceChipClass(
                            persona.display_status,
                          )}
                        >
                          <span
                            className="size-1.5 rounded-full bg-current"
                            aria-hidden="true"
                          />
                          {intelligenceLabel}
                        </span>
                      ) : null}
                      {showLifecycle ? (
                        <span className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-white/40">
                          {messages
                            ? getAudienceWorkingStatusLabel(
                                messages,
                                persona.display_lifecycle_status,
                              )
                            : persona.display_lifecycle_status}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 text-xs text-white/35">
                      {updatedLabel}
                    </div>
                  </div>
                  <ArrowRight
                    className="size-4 shrink-0 text-white/35"
                    aria-hidden="true"
                  />
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

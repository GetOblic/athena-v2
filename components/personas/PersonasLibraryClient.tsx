"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS } from "@/components/ui/athenaIntelligenceRow";
import { PERSONA_LIFECYCLE_STATUSES } from "@/services/personas/personaLifecycle";
import type { PersonaLibraryRow } from "@/services/personas/personaLibraryEnrichment";

type PersonasLibraryClientProps = {
  personas: PersonaLibraryRow[];
  loadError?: string | null;
};

const PAGE_SIZE = 25;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PersonasLibraryClient({
  personas,
  loadError = null,
}: PersonasLibraryClientProps) {
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
          Unable to load Personas
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
        <h2 className="text-2xl font-semibold">No Personas yet</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
          Personas represent clientele types or customer archetypes. Create one
          manually or import a CSV to start building your Persona library.
        </p>
        <Link
          href="/personas/import"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          Create or Import Personas
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 md:grid-cols-3">
          <label className="block text-sm text-white/50">
            Search
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Name, description, category, location…"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
            />
          </label>
          <label className="block text-sm text-white/50">
            Status
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
                  {value === "all" ? "All statuses" : value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-white/50">
            Sort
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as typeof sort)
              }
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="score">Opportunity Score</option>
              <option value="name">Persona Name</option>
            </select>
          </label>
        </div>

        <Link
          href="/personas/import"
          className="inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          Create or Import Personas
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
          <h2 className="text-2xl font-semibold">No personas found.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            Try a different search or lifecycle filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
          <div className="grid min-w-[1100px] grid-cols-[1.4fr_1.2fr_1fr_1fr_160px_120px_110px_110px] gap-4 border-b border-white/10 px-6 py-4 text-xs uppercase tracking-[0.2em] text-white/35">
            <div>Persona</div>
            <div>Reference Website</div>
            <div>Category</div>
            <div>Location</div>
            <div>Status</div>
            <div>Opportunity Score</div>
            <div>Created</div>
            <div>Updated</div>
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
                {persona.display_reference_website || "—"}
              </div>
              <div className="text-white/55">{persona.category || "—"}</div>
              <div className="text-white/55">
                {persona.display_location || "—"}
              </div>
              <div>
                <div className="text-[var(--athena-orange)]">
                  {persona.display_lifecycle_status}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  {persona.display_status}
                </div>
              </div>
              <div>{persona.display_opportunity_score_label}</div>
              <div className="text-white/45">
                {formatDate(persona.created_at)}
              </div>
              <div className="text-white/45">
                {formatDate(persona.updated_at)}
              </div>
            </Link>
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-white/45">
          <div>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              className="rounded-full border border-white/10 px-4 py-2 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

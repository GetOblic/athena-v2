"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SeoGenerationTypeBadge } from "@/components/seo/SeoGenerationTypeBadge";
import { SeoReportHeaderDeleteButton } from "@/components/seo/SeoReportHeaderDeleteButton";
import { ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS } from "@/components/ui/athenaIntelligenceRow";
import type { PublicSeoReportSummary } from "@/services/seo/seoReportPublic";

type SeoLibraryClientProps = {
  reports: PublicSeoReportSummary[];
  loadError?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SeoLibraryClient({
  reports,
  loadError = null,
}: SeoLibraryClientProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return reports;
    return reports.filter((report) => {
      const haystack = [report.name, report.status, report.summary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [reports, query]);

  if (loadError) {
    return (
      <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-10 text-center">
        <h2 className="text-2xl font-semibold text-rose-100">
          Unable to load SEO Intelligence
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-rose-100/70">
          {loadError}
        </p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
        <h2 className="text-2xl font-semibold">No SEO reports yet</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/50">
          Choose SEO Intelligence for strategic, content-focused guidance, or
          Technical SEO for evidence-backed technical optimization. A brief is
          optional.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/seo/new"
            className="inline-flex rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white"
          >
            Generate SEO Intelligence
          </Link>
          <Link
            href="/seo/new"
            className="inline-flex rounded-2xl bg-[var(--athena-success)] px-6 py-3 text-sm font-semibold text-white"
          >
            Generate Technical SEO
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search SEO reports"
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none md:max-w-md"
        />
        <div className="flex flex-wrap gap-3">
          <Link
            href="/seo/new"
            className="inline-flex rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white"
          >
            Generate SEO Intelligence
          </Link>
          <Link
            href="/seo/new"
            className="inline-flex rounded-2xl bg-[var(--athena-success)] px-6 py-3 text-sm font-semibold text-white"
          >
            Generate Technical SEO
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((report) => (
          <div
            key={report.id}
            className={`${ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS} flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between`}
          >
            <Link href={`/seo/${report.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-lg font-semibold">{report.name}</div>
                <SeoGenerationTypeBadge
                  generationType={report.generationType ?? "intelligence"}
                />
              </div>
              <div className="mt-2 text-sm text-white/50">
                {report.summary ||
                  (report.generationType === "technical"
                    ? "Technical SEO report pending"
                    : "SEO Intelligence report pending")}
              </div>
              <div className="mt-2 text-xs text-white/35">
                {formatDate(report.createdAt)} · {report.status}
              </div>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/seo/${report.id}`}
                className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80"
              >
                Open
              </Link>
              <SeoReportHeaderDeleteButton reportId={report.id} />
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/50">No reports match your search.</p>
      ) : null}
    </div>
  );
}

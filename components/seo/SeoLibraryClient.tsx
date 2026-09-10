"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SeoGenerationTypeBadge } from "@/components/seo/SeoGenerationTypeBadge";
import { SeoReportHeaderDeleteButton } from "@/components/seo/SeoReportHeaderDeleteButton";
import { SEO_HISTORY_ROW_CLASS } from "@/components/seo/seoPagePresentation";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import {
  getLocalizedSeoLensLabel,
  getLocalizedSeoReportStatusLabel,
  getSeoConfirmDeleteChrome,
} from "@/lib/tenantI18n/seoPresentation";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { PublicSeoReportSummary } from "@/services/seo/seoReportPublic";

type SeoLibraryClientProps = {
  reports: PublicSeoReportSummary[];
  loadError?: string | null;
  messages?: TenantMessages;
  language?: OrganizationLanguage;
};

function formatDate(
  value: string | null | undefined,
  language: OrganizationLanguage,
  emptyValue: string,
) {
  if (!value) return emptyValue;
  return formatTenantDate(value, language) || emptyValue;
}

export function SeoLibraryClient({
  reports,
  loadError = null,
  messages,
  language = "en",
}: SeoLibraryClientProps) {
  const copy = messages?.seo ?? en.seo;
  const dictionary = messages ?? en;
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
          {copy.unableToLoad}
        </h2>
        <p className="mx-auto mt-4 max-w-xl break-words text-sm leading-7 text-rose-100/70">
          {loadError}
        </p>
      </div>
    );
  }

  if (reports.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{copy.visibility.historyTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-white/50">
          {copy.visibility.historyIntro}
        </p>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={copy.searchPlaceholder}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none md:max-w-md"
      />

      <div className="space-y-3">
        {filtered.map((report) => (
          <div key={report.id} className={SEO_HISTORY_ROW_CLASS}>
            <Link href={`/seo/${report.id}`} className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <SeoGenerationTypeBadge
                  generationType={report.generationType ?? "intelligence"}
                  label={getLocalizedSeoLensLabel(
                    dictionary,
                    report.generationType ?? "intelligence",
                  )}
                />
                <div className="min-w-0 break-words text-lg font-semibold">
                  {report.name}
                </div>
              </div>
              <div className="mt-2 text-sm text-white/50">
                {formatDate(report.createdAt, language, copy.emptyValue)} ·{" "}
                {getLocalizedSeoReportStatusLabel(dictionary, report.status)}
                {report.status !== "Ready"
                  ? ` · ${copy.visibility.analysisNotFinished}`
                  : null}
              </div>
            </Link>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={`/seo/${report.id}`}
                className="w-full rounded-2xl border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white/80 sm:w-auto"
              >
                {copy.actionOpen}
              </Link>
              <SeoReportHeaderDeleteButton
                reportId={report.id}
                confirmMessage={copy.delete.confirm}
                errorFallback={copy.delete.failed}
                chrome={getSeoConfirmDeleteChrome(dictionary)}
              />
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/50">{copy.noSearchMatch}</p>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { WEBSITE_INTELLIGENCE_MAX_PAGES } from "@/services/prospects/prospectWebsiteUrl";

type HomepageSection = {
  key: string;
  label: string;
  value: string;
};

type AnalyzedPage = {
  label: string;
  url?: string;
};

type ProspectHomepageIntelligenceProps = {
  websiteIntelligence: Record<string, unknown> | null | undefined;
  scrapeStatus: string;
};

const SECTION_DEFS: Array<{ key: string; label: string }> = [
  { key: "positioning", label: "Positioning" },
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "about", label: "About" },
  { key: "target_audience", label: "Target Audience" },
  { key: "messaging", label: "Messaging" },
  { key: "value_proposition", label: "Value Proposition" },
  { key: "cta", label: "Calls to Action" },
  { key: "differentiators", label: "Differentiators" },
  { key: "trust_signals", label: "Trust Signals" },
  { key: "contact_information", label: "Contact Information" },
  { key: "brand_tone", label: "Brand Tone" },
];

const BUSINESS_KNOWLEDGE_DEFS: Array<{ key: string; label: string }> = [
  { key: "overview", label: "Business Overview" },
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "pricing", label: "Pricing" },
  { key: "consultations", label: "Consultations" },
  { key: "policies", label: "Policies" },
  { key: "technology", label: "Technology" },
  { key: "equipment", label: "Equipment" },
  { key: "brands", label: "Brands" },
  { key: "team", label: "Team" },
  { key: "faq", label: "Frequently Asked Questions" },
  { key: "customer_information", label: "Important Customer Information" },
  { key: "appointment_process", label: "Appointment Process" },
  { key: "preparation", label: "Preparation Instructions" },
  { key: "aftercare", label: "Aftercare" },
  { key: "restrictions", label: "Restrictions" },
  { key: "opening_hours", label: "Opening Hours" },
  { key: "contact", label: "Contact" },
];

function sectionsFromIntelligence(
  websiteIntelligence: Record<string, unknown> | null | undefined,
): HomepageSection[] {
  if (!websiteIntelligence) return [];

  return SECTION_DEFS.flatMap(({ key, label }) => {
    const raw = websiteIntelligence[key];
    if (typeof raw !== "string" || !raw.trim()) return [];
    return [{ key, label, value: raw.trim() }];
  });
}

function businessKnowledgeSections(
  websiteIntelligence: Record<string, unknown> | null | undefined,
): HomepageSection[] {
  if (!websiteIntelligence) return [];
  const knowledge = websiteIntelligence.business_knowledge;
  if (!knowledge || typeof knowledge !== "object") return [];

  const record = knowledge as Record<string, unknown>;
  return BUSINESS_KNOWLEDGE_DEFS.flatMap(({ key, label }) => {
    const raw = record[key];
    if (typeof raw !== "string" || !raw.trim()) return [];
    return [{ key: `bk_${key}`, label, value: raw.trim() }];
  });
}

function analyzedPages(
  websiteIntelligence: Record<string, unknown> | null | undefined,
): AnalyzedPage[] {
  if (!websiteIntelligence || !Array.isArray(websiteIntelligence.pages)) {
    return [];
  }

  return websiteIntelligence.pages.flatMap((page) => {
    if (!page || typeof page !== "object") return [];
    const label =
      typeof (page as { label?: unknown }).label === "string"
        ? (page as { label: string }).label.trim()
        : "";
    if (!label) return [];
    const url =
      typeof (page as { url?: unknown }).url === "string"
        ? (page as { url: string }).url
        : undefined;
    return [{ label, url }];
  });
}

export function ProspectHomepageIntelligence({
  websiteIntelligence,
  scrapeStatus,
}: ProspectHomepageIntelligenceProps) {
  const sections = sectionsFromIntelligence(websiteIntelligence);
  const knowledgeSections = businessKnowledgeSections(websiteIntelligence);
  const pages = analyzedPages(websiteIntelligence);
  const pagesAnalyzed =
    typeof websiteIntelligence?.pages_analyzed === "number"
      ? websiteIntelligence.pages_analyzed
      : pages.length > 0
        ? pages.length
        : sections.length > 0
          ? 1
          : 0;
  const pagesLimit =
    typeof websiteIntelligence?.pages_limit === "number"
      ? websiteIntelligence.pages_limit
      : WEBSITE_INTELLIGENCE_MAX_PAGES;

  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  function toggle(key: string) {
    setOpenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const hasContent = sections.length > 0 || knowledgeSections.length > 0;

  return (
    <section className="mt-8">
      <div className="text-sm text-white/40">Website Analysis</div>
      <div className="mt-2 text-xs text-white/35">{scrapeStatus}</div>

      {(pagesAnalyzed > 0 || pages.length > 0) && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
            Pages analyzed
          </div>
          <div className="mt-2 text-lg font-semibold text-white/85">
            {pagesAnalyzed} / {pagesLimit}
          </div>
          {pages.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {pages.map((page) => (
                <li
                  key={`${page.label}-${page.url ?? ""}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/55"
                  title={page.url}
                >
                  {page.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!hasContent ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/50">
          No website intelligence captured yet.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(knowledgeSections.length > 0 ? knowledgeSections : sections).map(
            (section) => {
              const open = openKeys.has(section.key);
              return (
                <article
                  key={section.key}
                  className="rounded-2xl border border-white/10 bg-black/25"
                >
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-white/[0.02]"
                    aria-expanded={open}
                  >
                    <span className="text-sm font-medium text-white/70">
                      {section.label}
                    </span>
                    <span className="text-xs text-white/30">
                      {open ? "▲" : "▼"}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-white/10 px-5 pb-5 pt-4">
                      <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">
                        {section.value}
                      </p>
                    </div>
                  )}
                </article>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}

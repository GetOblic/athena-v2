"use client";

import { useState } from "react";

type HomepageSection = {
  key: string;
  label: string;
  value: string;
};

type ProspectHomepageChrome = {
  title: string;
  empty: string;
  positioning: string;
  products: string;
  services: string;
  about: string;
  targetAudience: string;
  messaging: string;
  valueProposition: string;
  cta: string;
  differentiators: string;
  trustSignals: string;
  contactInformation: string;
  brandTone: string;
};

type ProspectHomepageIntelligenceProps = {
  websiteIntelligence: Record<string, unknown> | null | undefined;
  scrapeStatus: string;
  chrome?: ProspectHomepageChrome | null;
};

const SECTION_DEFS: Array<{
  key: string;
  label: string;
  chromeKey: keyof ProspectHomepageChrome;
}> = [
  { key: "positioning", label: "Positioning", chromeKey: "positioning" },
  { key: "products", label: "Products", chromeKey: "products" },
  { key: "services", label: "Services", chromeKey: "services" },
  { key: "about", label: "About", chromeKey: "about" },
  { key: "target_audience", label: "Target Audience", chromeKey: "targetAudience" },
  { key: "messaging", label: "Messaging", chromeKey: "messaging" },
  {
    key: "value_proposition",
    label: "Value Proposition",
    chromeKey: "valueProposition",
  },
  { key: "cta", label: "Calls to Action", chromeKey: "cta" },
  {
    key: "differentiators",
    label: "Differentiators",
    chromeKey: "differentiators",
  },
  { key: "trust_signals", label: "Trust Signals", chromeKey: "trustSignals" },
  {
    key: "contact_information",
    label: "Contact Information",
    chromeKey: "contactInformation",
  },
  { key: "brand_tone", label: "Brand Tone", chromeKey: "brandTone" },
];

function sectionsFromIntelligence(
  websiteIntelligence: Record<string, unknown> | null | undefined,
  chrome?: ProspectHomepageChrome | null,
): HomepageSection[] {
  if (!websiteIntelligence) return [];

  return SECTION_DEFS.flatMap(({ key, label, chromeKey }) => {
    const raw = websiteIntelligence[key];
    if (typeof raw !== "string" || !raw.trim()) return [];
    return [
      {
        key,
        label: chrome?.[chromeKey] ?? label,
        value: raw.trim(),
      },
    ];
  });
}

export function ProspectHomepageIntelligence({
  websiteIntelligence,
  scrapeStatus,
  chrome = null,
}: ProspectHomepageIntelligenceProps) {
  const sections = sectionsFromIntelligence(websiteIntelligence, chrome);
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

  return (
    <section className="mt-8">
      <div className="text-sm text-white/40">
        {chrome?.title ?? "Homepage Intelligence"}
      </div>
      <div className="mt-2 text-xs text-white/35">{scrapeStatus}</div>

      {sections.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/50">
          {chrome?.empty ?? "No homepage intelligence captured yet."}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {sections.map((section) => {
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
          })}
        </div>
      )}
    </section>
  );
}

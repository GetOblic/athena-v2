"use client";

import { Globe } from "lucide-react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  PROSPECT_DETAIL_ANCHORS,
  PROSPECT_DETAIL_ICON,
  PROSPECT_WEBSITE_SURFACE,
} from "@/lib/prospects/prospectDetailPresentation";

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
  heading?: string;
  help?: string;
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
  heading,
  help,
}: ProspectHomepageIntelligenceProps) {
  const sections = sectionsFromIntelligence(websiteIntelligence, chrome);

  return (
    <AthenaCollapsibleSection
      id={PROSPECT_DETAIL_ANCHORS.website}
      title={heading ?? chrome?.title ?? "Website research"}
      summary={help ?? scrapeStatus}
      defaultOpen={false}
      tone="intelligence"
      icon={<Globe />}
      iconClassName={PROSPECT_DETAIL_ICON.blue}
      className={PROSPECT_WEBSITE_SURFACE}
    >
      <div className="text-xs text-white/35">{scrapeStatus}</div>

      {sections.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/50">
          {chrome?.empty ?? "No homepage intelligence captured yet."}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {sections.map((section) => (
            <AthenaCollapsibleSection
              key={section.key}
              title={section.label}
              defaultOpen={false}
              tone="intelligence"
              iconSize="sm"
              iconClassName={PROSPECT_DETAIL_ICON.blue}
              className="!rounded-2xl"
            >
              <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">
                {section.value}
              </p>
            </AthenaCollapsibleSection>
          ))}
        </div>
      )}
    </AthenaCollapsibleSection>
  );
}

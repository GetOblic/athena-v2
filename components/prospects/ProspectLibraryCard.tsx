import type { ReactNode } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { ProspectIntelligenceScore } from "@/components/prospects/ProspectIntelligenceScore";
import type { ProspectLibraryRow } from "@/services/prospects/prospectLibraryEnrichment";
import {
  getProspectIntelligenceStatusLabel,
  getProspectWorkingStatusLabel,
} from "@/lib/prospects/prospectReadinessPresentation";
import { formatProspectLibraryIntelligenceDate } from "@/lib/prospects/prospectLibraryFreshness";
import {
  PROSPECT_CARD_ICON_WELL_CLASS,
  PROSPECT_WORKING_STATUS_CHIP_CLASS,
  shouldShowProspectLibraryReleaseCta,
} from "@/lib/prospects/prospectLibraryPresentation";
import { prospectIntelligenceChipClass } from "@/lib/prospects/prospectDetailPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type ProspectLibraryCardProps = {
  prospect: ProspectLibraryRow;
  messages?: TenantMessages;
  language?: OrganizationLanguage;
  release?: ReactNode;
};

function formatProspectLocation(prospect: ProspectLibraryRow): string {
  return [prospect.city, prospect.state, prospect.country]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function ProspectLibraryCard({
  prospect,
  messages,
  language = "en",
  release,
}: ProspectLibraryCardProps) {
  const list = messages?.prospects.list;
  const categoryOrIndustry =
    prospect.category?.trim() || prospect.industry?.trim() || "";
  const location = formatProspectLocation(prospect);
  const meta = [categoryOrIndustry, location].filter(Boolean).join(" · ");
  const intelligenceLabel = messages
    ? getProspectIntelligenceStatusLabel(messages, prospect.display_status)
    : prospect.display_status;
  const showLifecycle = prospect.display_lifecycle_status !== "New";
  const intelligenceDate = formatProspectLibraryIntelligenceDate(
    prospect.display_intelligence_generated_at,
    language,
    list?.intelligenceDateLabel ?? "Intelligence",
  );
  const releaseStatus = prospect.getoblic_relationship_status;
  const showRelease = shouldShowProspectLibraryReleaseCta(releaseStatus);

  return (
    <div data-prospect-library-card={prospect.id}>
      <div className="flex items-start gap-3">
        <div className={PROSPECT_CARD_ICON_WELL_CLASS} aria-hidden="true">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold text-white sm:text-lg">
            {prospect.business_name}
          </h3>
          {meta ? (
            <p className="mt-0.5 truncate text-xs text-white/45">{meta}</p>
          ) : null}
        </div>
        {messages ? (
          <ProspectIntelligenceScore
            score={prospect.display_completeness_score}
            messages={messages.prospects.score}
            size="list"
          />
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {intelligenceLabel ? (
              <span
                className={prospectIntelligenceChipClass(prospect.display_status)}
              >
                <span
                  className="size-1.5 rounded-full bg-current"
                  aria-hidden="true"
                />
                {intelligenceLabel}
              </span>
            ) : null}
            {showLifecycle ? (
              <span className={PROSPECT_WORKING_STATUS_CHIP_CLASS}>
                {messages
                  ? getProspectWorkingStatusLabel(
                      messages,
                      prospect.display_lifecycle_status,
                    )
                  : prospect.display_lifecycle_status}
              </span>
            ) : null}
          </div>
          {intelligenceDate ? (
            <div
              className="mt-1.5 text-xs text-white/35"
              data-intelligence-generated-at={
                prospect.display_intelligence_generated_at
              }
            >
              {intelligenceDate}
            </div>
          ) : null}
        </div>
        <ArrowRight
          className="size-4 shrink-0 text-white/35"
          aria-hidden="true"
        />
      </div>
      {showRelease ? (
        <div className="mt-4" data-prospect-library-release={releaseStatus}>
          {release}
        </div>
      ) : null}
    </div>
  );
}

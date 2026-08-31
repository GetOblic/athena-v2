import type { CommunityIntelligence } from "@/services/communityIntelligenceService";
import {
  getDomainIntelligenceEmptyMessage,
  getDomainIntelligenceSections,
} from "@/lib/domainIntelligenceDisplay";
import { getLocalizedDomainIntelligenceSectionTitle } from "@/lib/tenantI18n/intelligenceDomainPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type DomainIntelligenceSectionsProps = {
  intelligence: CommunityIntelligence | null;
  messages?: TenantMessages;
};

export function DomainIntelligenceSections({
  intelligence,
  messages,
}: DomainIntelligenceSectionsProps) {
  const sections = getDomainIntelligenceSections(intelligence);
  const emptyMessage = messages
    ? messages.intelligenceDomains.detail.sectionEmpty
    : getDomainIntelligenceEmptyMessage();

  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      {sections.map((section) => (
        <div
          key={section.key}
          className="rounded-2xl border border-white/10 bg-black/20 p-5"
        >
          <div className="text-sm font-semibold text-white/70">
            {messages
              ? getLocalizedDomainIntelligenceSectionTitle(
                  messages,
                  section.key,
                  section.title,
                )
              : section.title}
          </div>
          <div className="mt-3 text-sm leading-7 text-white/60">
            {section.value || emptyMessage}
          </div>
        </div>
      ))}
    </div>
  );
}

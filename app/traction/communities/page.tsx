export const dynamic = "force-dynamic";

import { Group } from "lucide-react";
import { CommunityIntelligenceWorkspace } from "@/components/communityIntelligence/CommunityIntelligenceWorkspace";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { TractionSiblingNav } from "@/components/traction/TractionSiblingNav";
import { COMMUNITY_PAGE_HEADER_ICON } from "@/lib/communityIntelligence/communityIntelligencePresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { loadFreeProgressionState } from "@/services/organization/freeProgressionState";

export default async function TractionCommunitiesPage() {
  const [{ messages }, freeProgression] = await Promise.all([
    getTenantLocalization(),
    loadFreeProgressionState(),
  ]);
  const copy = messages.communityIntelligence;
  const traction = messages.personas.traction;

  return (
    <TenantAppShell
      currentPath="/traction/communities"
      messages={messages}
      {...freeProgression}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className={COMMUNITY_PAGE_HEADER_ICON} aria-hidden="true">
          <Group className="size-5" />
        </span>
      </div>
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        question={copy.question}
        subtitle={copy.subtitle}
      >
        <TractionSiblingNav
          links={[
            {
              href: "/personas",
              label: traction.audiences,
              help: traction.audiencesHelp,
            },
            {
              href: "/ads",
              label: traction.advertising,
              help: traction.advertisingHelp,
            },
            {
              href: "/social-planner",
              label: traction.socialContent,
              help: traction.socialHelp,
            },
            {
              href: "/traction/communities",
              label: copy.navLabel,
              help: copy.navHelp,
              current: true,
            },
          ]}
        />
      </TractionPageHeader>
      <CommunityIntelligenceWorkspace messages={messages} />
    </TenantAppShell>
  );
}

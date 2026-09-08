export const dynamic = "force-dynamic";

import Link from "next/link";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { DiscussionAgeBadge } from "@/components/discussions/DiscussionAgeBadge";
import { DiscussionLifecycleBadge } from "@/components/discussions/DiscussionLifecycleBadge";
import { QueueSectionHeader } from "@/components/queues/QueueSectionHeader";
import { AthenaIntelligenceListRow } from "@/components/ui/AthenaIntelligenceListRow";
import { getDiscussionAgeKey } from "@/lib/discussionAge";
import { getDiscussionLifecycle } from "@/lib/discussionStatus";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import {
  getLocalizedDiscussionActionLabel,
  getLocalizedDiscussionAgeLabel,
  getLocalizedDiscussionLifecycleLabel,
  getLocalizedDiscussionQueueTitle,
} from "@/lib/tenantI18n/discussionPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import { getCommunities } from "@/services/communityService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getDiscussionQueues } from "@/services/queueService";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

const listGridClass =
  "grid grid-cols-[1.1fr_1.8fr_90px_120px_100px_120px_120px] items-center gap-4";

function formatLastActivity(
  value: string | null,
  language: OrganizationLanguage,
) {
  if (!value) return "—";
  return formatTenantDate(value, language) || "—";
}

export default async function DiscussionsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();

  const [queues, communities, analyzedDiscussionIds, { language, messages }] =
    await Promise.all([
      getDiscussionQueues(organizationId),
      getCommunities(organizationId),
      getAnalyzedDiscussionIds(organizationId),
      getTenantLocalization(),
    ]);
  const copy = messages.discussions;

  const domainById = new Map(communities.map((community) => [community.id, community]));
  const totalCount = queues.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <TenantAppShell currentPath="/discussions" messages={messages}>
      <div className="mb-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
          {copy.title}
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {copy.subtitle}
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
          <h2 className="text-2xl font-semibold">{copy.emptyTitle}</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            {copy.emptyBody}
          </p>
          <Link
            href="/inbox"
            className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            {copy.emptyCta}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
          <div
            className={`${listGridClass} border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35`}
          >
            <div>{copy.colDomain}</div>
            <div>{copy.colTitle}</div>
            <div>{copy.colScore}</div>
            <div>{copy.colStatus}</div>
            <div>{copy.colAge}</div>
            <div>{copy.colLastActivity}</div>
            <div>{copy.colAction}</div>
          </div>

          {queues.map((section) => {
            if (section.items.length === 0) {
              return null;
            }

            return (
              <div key={section.key}>
                <QueueSectionHeader
                  title={getLocalizedDiscussionQueueTitle(messages, section.key)}
                  count={section.items.length}
                />

                {section.items.map((discussion) => {
                  const domain = discussion.community_id
                    ? domainById.get(discussion.community_id)
                    : undefined;
                  const hasAnalysis = analyzedDiscussionIds.has(discussion.id);
                  const lifecycle = getDiscussionLifecycle(
                    discussion,
                    hasAnalysis,
                  );

                  return (
                    <AthenaIntelligenceListRow
                      key={discussion.id}
                      href={`/discussions/${discussion.id}`}
                      ariaLabel={interpolateTenantMessage(
                        copy.openDiscussionAria,
                        { title: discussion.title },
                      )}
                      className={`${listGridClass} px-6 py-5 text-sm transition hover:bg-white/[0.03]`}
                    >
                      <div className="text-white/50">
                        {domain?.group_name ?? "—"}
                      </div>

                      <div className="font-medium text-white">
                        {discussion.title}
                      </div>

                      <div className="text-2xl font-semibold text-[var(--athena-orange)]">
                        {discussion.opportunity_score}
                      </div>

                      <div>
                        <DiscussionLifecycleBadge
                          discussion={discussion}
                          hasAnalysis={hasAnalysis}
                          label={getLocalizedDiscussionLifecycleLabel(
                            messages,
                            lifecycle.key,
                          )}
                        />
                      </div>

                      <div>
                        <DiscussionAgeBadge
                          discussion={discussion}
                          label={getLocalizedDiscussionAgeLabel(
                            messages,
                            getDiscussionAgeKey(discussion),
                          )}
                        />
                      </div>

                      <div className="text-white/50">
                        {formatLastActivity(discussion.last_activity, language)}
                      </div>

                      <Link
                        href={`/discussions/${discussion.id}`}
                        className="inline-flex shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                      >
                        {getLocalizedDiscussionActionLabel(
                          messages,
                          section.key,
                        )}
                      </Link>
                    </AthenaIntelligenceListRow>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </TenantAppShell>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { BriefingStatusBadge } from "@/components/briefings/BriefingStatusBadge";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { QueueSectionHeader } from "@/components/queues/QueueSectionHeader";
import { AthenaIntelligenceListRow } from "@/components/ui/AthenaIntelligenceListRow";
import {
  getLocalizedBriefingListSummary,
  getLocalizedBriefingQueueTitle,
  getLocalizedBriefingStatusLabel,
} from "@/lib/tenantI18n/briefingPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getBriefingQueues } from "@/services/queueService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

const listGridClass =
  "grid grid-cols-[minmax(0,1fr)_160px_120px_160px] items-center gap-4";

export default async function BriefingsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [queues, { messages }] = await Promise.all([
    getBriefingQueues(organizationId),
    getTenantLocalization(),
  ]);
  const copy = messages.briefings;
  const totalCount = queues.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <TenantAppShell currentPath="/briefings" messages={messages}>
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
          <h2 className="text-2xl font-semibold">
            {copy.emptyTitle}
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            {copy.emptyBody}
          </p>

          <Link
            href="/opportunities"
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
            <div className="pr-4">{copy.colSummary}</div>
            <div>{copy.colStatus}</div>
            <div>{copy.colConfidence}</div>
            <div>{copy.colAction}</div>
          </div>

          {queues.map((section) => {
            if (section.items.length === 0) {
              return null;
            }

            return (
              <div key={section.key}>
                <QueueSectionHeader
                  title={getLocalizedBriefingQueueTitle(messages, section.key)}
                  count={section.items.length}
                />

                {section.items.map((briefing) => {
                  const summary = getLocalizedBriefingListSummary(
                    briefing,
                    copy.untitled,
                  );

                  return (
                    <AthenaIntelligenceListRow
                      key={briefing.id}
                      href={`/briefings/${briefing.id}`}
                      ariaLabel={interpolateTenantMessage(
                        copy.openBriefingAria,
                        { summary },
                      )}
                      className={`${listGridClass} px-6 py-5 text-sm transition hover:bg-white/[0.03]`}
                    >
                      <div className="line-clamp-2 pr-4 font-medium leading-6 text-white">
                        {summary}
                      </div>

                      <div>
                        <BriefingStatusBadge
                          status={briefing.status}
                          label={getLocalizedBriefingStatusLabel(
                            messages,
                            briefing.status,
                          )}
                        />
                      </div>

                      <div className="font-semibold text-[var(--athena-orange)]">
                        {briefing.confidence}%
                      </div>

                      <div>
                        <Link
                          href={`/briefings/${briefing.id}`}
                          className="inline-flex rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                        >
                          {copy.actionOpen}
                        </Link>
                      </div>
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

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  HELP_BODY_CLASS,
  HELP_ICON_WELL,
  HELP_META_CLASS,
  HELP_PRIMARY_CTA_CLASS,
  HELP_STEP_ITEM_CLASS,
  HELP_STEP_LIST_CLASS,
} from "@/lib/gettingStarted/helpCenterPresentation";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { HelpCenterCopy, HelpResolvedTopic } from "@/lib/gettingStarted/helpCenterTopics";
import { HelpTopicSection } from "@/components/getting-started/HelpTopicSection";

type HelpWorkflowListProps = {
  copy: HelpCenterCopy;
  topics: HelpResolvedTopic[];
  openTopicIds: ReadonlySet<string>;
  onToggleTopic: (id: string, open: boolean) => void;
  icon?: ReactNode;
};

export function HelpWorkflowList({
  copy,
  topics,
  openTopicIds,
  onToggleTopic,
  icon,
}: HelpWorkflowListProps) {
  return (
    <div className="space-y-4">
      {topics.map((topic) => (
        <HelpTopicSection
          key={topic.id}
          id={topic.definition.anchor}
          title={topic.title}
          summary={topic.summary}
          accent={topic.definition.accent}
          icon={icon}
          open={openTopicIds.has(topic.id)}
          onOpenChange={(open) => onToggleTopic(topic.id, open)}
        >
          <HelpTopicBody copy={copy} topic={topic} />
        </HelpTopicSection>
      ))}
    </div>
  );
}

export function HelpTopicBody({
  copy,
  topic,
}: {
  copy: HelpCenterCopy;
  topic: HelpResolvedTopic;
}) {
  return (
    <div>
      {topic.what ? <p className={HELP_BODY_CLASS}>{topic.what}</p> : null}
      {topic.why ? <p className={`mt-3 ${HELP_BODY_CLASS}`}>{topic.why}</p> : null}
      {topic.body ? (
        <p className={`mt-3 ${HELP_BODY_CLASS}`}>{topic.body}</p>
      ) : null}

      {topic.steps.length > 0 ? (
        <ol className={HELP_STEP_LIST_CLASS}>
          {topic.steps.map((step, index) => (
            <li key={`${topic.id}-step-${index}`} className={HELP_STEP_ITEM_CLASS}>
              <span className="mt-0.5 shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                {interpolateTenantMessage(copy.stepLabel, { n: index + 1 })}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {topic.expect ? (
        <p className={HELP_META_CLASS}>
          <span className="font-medium text-white/60">{copy.expectLabel}: </span>
          {topic.expect}
        </p>
      ) : null}

      {topic.trouble ? (
        <p className={HELP_META_CLASS}>
          <span className="font-medium text-white/60">{copy.troubleLabel}: </span>
          {topic.trouble}
        </p>
      ) : null}

      {topic.cta && topic.definition.primaryCta ? (
        <div className="mt-5">
          <Link
            href={topic.definition.primaryCta}
            className={HELP_PRIMARY_CTA_CLASS}
          >
            {topic.cta}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function HelpIconWell({
  accent,
  children,
}: {
  accent: HelpResolvedTopic["definition"]["accent"];
  children: ReactNode;
}) {
  return (
    <span className={HELP_ICON_WELL[accent]} aria-hidden="true">
      {children}
    </span>
  );
}

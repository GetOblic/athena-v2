"use client";

import Link from "next/link";
import { Brain, Search, Target, Users } from "lucide-react";
import {
  HELP_OUTCOME_ORDER,
  getHelpTopic,
} from "@/lib/gettingStarted/helpCenterCatalog";
import {
  HELP_BODY_CLASS,
  HELP_ICON_WELL,
  HELP_META_CLASS,
  HELP_NESTED_CARD_CLASS,
  HELP_PRIMARY_CTA_CLASS,
  HELP_SURFACE,
} from "@/lib/gettingStarted/helpCenterPresentation";
import {
  resolveHelpTopic,
  type HelpCenterCopy,
} from "@/lib/gettingStarted/helpCenterTopics";
const OUTCOME_ICONS = {
  "outcome-define": Brain,
  "outcome-visibility": Search,
  "outcome-traction": Target,
  "outcome-convert": Users,
} as const;

type HelpOutcomeGridProps = {
  copy: HelpCenterCopy;
};

export function HelpOutcomeGrid({ copy }: HelpOutcomeGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {HELP_OUTCOME_ORDER.map((id) => {
        const definition = getHelpTopic(id);
        if (!definition) return null;
        const topic = resolveHelpTopic(definition, copy);
        const Icon = OUTCOME_ICONS[id];
        const outcomeCopy = readOutcomeCopy(copy, definition.copyPath[1]);

        return (
          <article
            key={id}
            id={definition.anchor}
            className={`${HELP_SURFACE[definition.accent]} p-5 sm:p-6`}
          >
            <div className="flex items-start gap-3">
              <span className={HELP_ICON_WELL[definition.accent]} aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-tight text-white">
                  {topic.title}
                </h3>
                <p className={`mt-3 ${HELP_BODY_CLASS}`}>{outcomeCopy.purpose}</p>
              </div>
            </div>

            <dl className="mt-5 space-y-3">
              <div className={HELP_NESTED_CARD_CLASS}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.outcomes.summary}
                </dt>
                <dd className={`mt-2 ${HELP_BODY_CLASS}`}>{outcomeCopy.uses}</dd>
              </div>
              <p className={HELP_META_CLASS}>{outcomeCopy.canDo}</p>
              <p className={HELP_META_CLASS}>{outcomeCopy.ready}</p>
            </dl>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-white/70">
                {outcomeCopy.moreTitle}
              </summary>
              <p className={`mt-3 ${HELP_BODY_CLASS}`}>{outcomeCopy.moreBody}</p>
            </details>

            {topic.cta && definition.primaryCta ? (
              <Link href={definition.primaryCta} className={`mt-5 ${HELP_PRIMARY_CTA_CLASS}`}>
                {topic.cta}
              </Link>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function readOutcomeCopy(
  copy: HelpCenterCopy,
  key: string | undefined,
): {
  purpose: string;
  uses: string;
  canDo: string;
  ready: string;
  moreTitle: string;
  moreBody: string;
} {
  const fallback = {
    purpose: "",
    uses: "",
    canDo: "",
    ready: "",
    moreTitle: copy.moreLabel,
    moreBody: "",
  };
  if (!key) return fallback;
  const value = copy.outcomes[key as keyof typeof copy.outcomes];
  if (!value || typeof value === "string") return fallback;
  return {
    purpose: value.purpose,
    uses: value.uses,
    canDo: value.canDo,
    ready: value.ready,
    moreTitle: value.moreTitle,
    moreBody: value.moreBody,
  };
}

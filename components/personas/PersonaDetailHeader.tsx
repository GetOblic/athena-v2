"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquare, MessageSquarePlus, Users } from "lucide-react";
import {
  PERSONA_DETAIL_ANCHORS,
  PERSONA_DISCUSS_EVENT,
  PERSONA_TEACH_EVENT,
} from "@/lib/personas/personaDetailPresentation";
import {
  PERSONA_CARD_ICON_WELL_CLASS,
  PERSONA_CTA_GROUP_LABEL,
  PERSONA_HEADER_OBSERVATION_CLASS,
  PERSONA_HEADER_PRIMARY_CLASS,
  personaIntelligenceChipClass,
} from "@/lib/personas/personaPagePresentation";
import type { PersonaDisplayReadiness } from "@/services/personas/personaDisplay";

type PersonaDetailHeaderProps = {
  backLabel: string;
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  intelligenceLabel: string;
  intelligenceStatus: PersonaDisplayReadiness | string;
  metaLine?: ReactNode;
  discussLabel: string;
  observationLabel: string;
  intelligenceGroupLabel: string;
  audienceToolsGroupLabel: string;
  intelligenceActions: ReactNode;
  audienceToolsActions: ReactNode;
  utilityActions: ReactNode;
  destructiveAction: ReactNode;
  showObservation?: boolean;
  canInitiateAsk?: boolean;
};

function PersonaHeaderActionGroup({
  name,
  label,
  children,
}: {
  name: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div data-persona-header-actions={name}>
      {label ? <div className={PERSONA_CTA_GROUP_LABEL}>{label}</div> : null}
      <div
        className={
          label
            ? "mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
            : "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function PersonaDetailHeader({
  backLabel,
  eyebrow,
  title,
  subtitle,
  intelligenceLabel,
  intelligenceStatus,
  metaLine,
  discussLabel,
  observationLabel,
  intelligenceGroupLabel,
  audienceToolsGroupLabel,
  intelligenceActions,
  audienceToolsActions,
  utilityActions,
  destructiveAction,
  showObservation = true,
  canInitiateAsk = true,
}: PersonaDetailHeaderProps) {
  return (
    <header data-persona-journey="header" className="mb-8">
      <Link
        href="/personas"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {backLabel}
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className={PERSONA_CARD_ICON_WELL_CLASS} aria-hidden="true">
              <Users className="size-5" />
            </span>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200/85">
              {eyebrow}
            </div>
            <span className={personaIntelligenceChipClass(intelligenceStatus)}>
              {intelligenceLabel}
            </span>
          </div>

          <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          {subtitle?.trim() ? (
            <p className="mt-3 max-w-3xl text-base leading-7 text-white/50">
              {subtitle}
            </p>
          ) : null}
          {metaLine ? (
            <div className="mt-3 text-sm text-white/45">{metaLine}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <PersonaHeaderActionGroup
          name="intelligence"
          label={intelligenceGroupLabel}
        >
          <button
            type="button"
            data-persona-header-action="discuss"
            className={PERSONA_HEADER_PRIMARY_CLASS}
            onClick={() => {
              if (typeof window === "undefined") return;
              window.dispatchEvent(new Event(PERSONA_DISCUSS_EVENT));
              window.setTimeout(() => {
                document
                  .getElementById(PERSONA_DETAIL_ANCHORS.conversation)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
                if (canInitiateAsk) {
                  document
                    .getElementById(PERSONA_DETAIL_ANCHORS.conversationInput)
                    ?.focus();
                }
              }, 0);
            }}
          >
            <MessageSquare className="size-4" />
            {discussLabel}
          </button>
          {showObservation ? (
            <button
              type="button"
              data-persona-header-action="observation"
              className={PERSONA_HEADER_OBSERVATION_CLASS}
              onClick={() => {
                if (typeof window === "undefined") return;
                window.dispatchEvent(new Event(PERSONA_TEACH_EVENT));
                window.setTimeout(() => {
                  document
                    .getElementById(PERSONA_DETAIL_ANCHORS.observation)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  document
                    .getElementById(PERSONA_DETAIL_ANCHORS.observationField)
                    ?.focus();
                }, 40);
              }}
            >
              <MessageSquarePlus className="size-4" />
              {observationLabel}
            </button>
          ) : null}
          {intelligenceActions}
        </PersonaHeaderActionGroup>

        <PersonaHeaderActionGroup
          name="audience-tools"
          label={audienceToolsGroupLabel}
        >
          {audienceToolsActions}
        </PersonaHeaderActionGroup>

        <PersonaHeaderActionGroup name="utility">
          {utilityActions}
        </PersonaHeaderActionGroup>
        <PersonaHeaderActionGroup name="destructive">
          {destructiveAction}
        </PersonaHeaderActionGroup>
      </div>
    </header>
  );
}

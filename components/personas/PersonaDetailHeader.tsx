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
  primaryActions: ReactNode;
  utilityActions: ReactNode;
  destructiveAction: ReactNode;
};

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
  primaryActions,
  utilityActions,
  destructiveAction,
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

      <div className="mt-8 space-y-3">
        <div
          data-persona-header-actions="workflow"
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <div data-persona-header-actions="primary">
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
                  document
                    .getElementById(PERSONA_DETAIL_ANCHORS.conversationInput)
                    ?.focus();
                }, 0);
              }}
            >
              <MessageSquare className="size-4" />
              {discussLabel}
            </button>
          </div>
          <div
            data-persona-header-actions="secondary"
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
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
            {primaryActions}
          </div>
        </div>
        <div
          data-persona-header-actions="utility"
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        >
          {utilityActions}
        </div>
        <div data-persona-header-actions="destructive">{destructiveAction}</div>
      </div>
    </header>
  );
}

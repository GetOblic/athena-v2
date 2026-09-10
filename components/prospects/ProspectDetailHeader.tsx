"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
} from "lucide-react";
import {
  PROSPECT_ADD_OBSERVATION_EVENT,
  PROSPECT_ASK_ATHENA_EVENT,
  PROSPECT_BACK_LINK_CLASS,
  PROSPECT_CTA_GROUP_LABEL,
  PROSPECT_DETAIL_ANCHORS,
  PROSPECT_EDIT_PROFILE_EVENT,
  PROSPECT_HEADER_ICON_WELL,
  PROSPECT_PRIMARY_ACTION,
  PROSPECT_SECONDARY_VIOLET_ACTION,
  PROSPECT_UTILITY_CYAN_ACTION,
  PROSPECT_UTILITY_VIOLET_ACTION,
  dispatchProspectDetailEvent,
  focusProspectAnchor,
  prospectIntelligenceChipClass,
} from "@/lib/prospects/prospectDetailPresentation";

type ProspectDetailHeaderProps = {
  backHref?: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  question?: string | null;
  subtitle?: string | null;
  websiteHref?: string | null;
  websiteLabel?: string | null;
  intelligenceLabel: string;
  intelligenceStatus: string;
  ready: boolean;
  hasDiscussion: boolean;
  askAthenaLabel: string;
  addObservationLabel: string;
  editProfileLabel: string;
  openWebsiteLabel: string;
  completenessScore: ReactNode;
  generateActions: ReactNode;
  researchAction: ReactNode;
  lifecycleAction: ReactNode;
  directoryAction?: ReactNode;
  intelligenceGroupLabel: string;
  prospectToolsLabel: string;
  directoryGroupLabel: string;
};

function ProspectHeaderActionGroup({
  name,
  label,
  children,
}: {
  name: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div data-prospect-header-actions={name}>
      {label ? <div className={PROSPECT_CTA_GROUP_LABEL}>{label}</div> : null}
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

export function ProspectDetailHeader({
  backHref = "/prospects",
  backLabel,
  eyebrow,
  title,
  question,
  subtitle,
  websiteHref,
  websiteLabel,
  intelligenceLabel,
  intelligenceStatus,
  ready,
  hasDiscussion,
  askAthenaLabel,
  addObservationLabel,
  editProfileLabel,
  openWebsiteLabel,
  completenessScore,
  generateActions,
  researchAction,
  lifecycleAction,
  directoryAction = null,
  intelligenceGroupLabel,
  prospectToolsLabel,
  directoryGroupLabel,
}: ProspectDetailHeaderProps) {
  const askAthenaButton = hasDiscussion ? (
    <button
      type="button"
      data-prospect-header-action="ask-athena"
      className={ready ? PROSPECT_PRIMARY_ACTION : PROSPECT_SECONDARY_VIOLET_ACTION}
      onClick={() => {
        dispatchProspectDetailEvent(PROSPECT_ASK_ATHENA_EVENT);
        focusProspectAnchor(
          PROSPECT_DETAIL_ANCHORS.conversation,
          PROSPECT_DETAIL_ANCHORS.conversationInput,
        );
      }}
    >
      <MessageSquare className="size-4" />
      {askAthenaLabel}
    </button>
  ) : null;

  const observationButton = hasDiscussion ? (
    <button
      type="button"
      data-prospect-header-action="observation"
      className={PROSPECT_UTILITY_VIOLET_ACTION}
      onClick={() => {
        dispatchProspectDetailEvent(PROSPECT_ADD_OBSERVATION_EVENT);
        focusProspectAnchor(
          PROSPECT_DETAIL_ANCHORS.observation,
          PROSPECT_DETAIL_ANCHORS.observationField,
          40,
        );
      }}
    >
      <MessageSquarePlus className="size-4" />
      {addObservationLabel}
    </button>
  ) : null;

  const editButton = (
    <button
      type="button"
      data-prospect-header-action="edit-profile"
      className={PROSPECT_UTILITY_VIOLET_ACTION}
      onClick={() => {
        dispatchProspectDetailEvent(PROSPECT_EDIT_PROFILE_EVENT);
        focusProspectAnchor(PROSPECT_DETAIL_ANCHORS.profile, undefined, 40);
      }}
    >
      <Pencil className="size-4" />
      {editProfileLabel}
    </button>
  );

  const openWebsiteButton = websiteHref ? (
    <a
      href={websiteHref}
      target="_blank"
      rel="noopener noreferrer"
      data-prospect-header-action="open-website"
      className={PROSPECT_UTILITY_CYAN_ACTION}
    >
      <ExternalLink className="size-4" />
      {openWebsiteLabel}
    </a>
  ) : null;

  const toolActions = [openWebsiteButton, editButton, observationButton].filter(
    Boolean,
  );

  return (
    <header data-prospect-detail="header" className="mb-8">
      <Link href={backHref} className={PROSPECT_BACK_LINK_CLASS}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {backLabel}
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className={PROSPECT_HEADER_ICON_WELL} aria-hidden="true">
              <Building2 className="size-5" />
            </span>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-200/85">
              {eyebrow}
            </div>
            <span className={prospectIntelligenceChipClass(intelligenceStatus)}>
              {intelligenceLabel}
            </span>
          </div>

          <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          {question?.trim() ? (
            <p className="mt-3 max-w-3xl text-base leading-7 text-white/55">
              {question}
            </p>
          ) : null}
          {subtitle?.trim() ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
              {subtitle}
            </p>
          ) : null}
          {websiteHref ? (
            <p className="mt-3 text-sm">
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sky-200 underline underline-offset-2"
              >
                {websiteLabel || websiteHref}
              </a>
            </p>
          ) : null}
        </div>
        <div className="shrink-0">{completenessScore}</div>
      </div>

      <div className="mt-8 space-y-6">
        <ProspectHeaderActionGroup
          name="intelligence"
          label={intelligenceGroupLabel}
        >
          {ready ? (
            <>
              {askAthenaButton}
              {generateActions}
            </>
          ) : (
            <>
              {generateActions}
              {askAthenaButton}
            </>
          )}
          {researchAction}
        </ProspectHeaderActionGroup>

        {toolActions.length > 0 ? (
          <ProspectHeaderActionGroup name="tools" label={prospectToolsLabel}>
            {openWebsiteButton}
            {editButton}
            {observationButton}
          </ProspectHeaderActionGroup>
        ) : null}

        {lifecycleAction ? (
          <ProspectHeaderActionGroup name="lifecycle">
            {lifecycleAction}
          </ProspectHeaderActionGroup>
        ) : null}

        {directoryAction ? (
          <ProspectHeaderActionGroup
            name="directory"
            label={directoryGroupLabel}
          >
            {directoryAction}
          </ProspectHeaderActionGroup>
        ) : null}
      </div>
    </header>
  );
}

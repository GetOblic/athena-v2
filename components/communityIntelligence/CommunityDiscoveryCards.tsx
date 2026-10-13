"use client";

import { useId, useState, type ReactNode } from "react";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  COMMUNITY_CARD_CLASS,
  COMMUNITY_FIELD_HELP_CLASS,
  COMMUNITY_FIELD_LABEL_CLASS,
  COMMUNITY_NOTE_CLASS,
  COMMUNITY_SECONDARY_CLASS,
  COMMUNITY_SUGGESTION_CLASS,
} from "@/lib/communityIntelligence/communityIntelligencePresentation";
import type {
  CommunityDiscoveryCard,
  CommunityDiscoveryUiError,
  SavedCommunityCard,
} from "@/lib/communityIntelligence/communityDiscoveryClient";
import { ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH } from "@/services/communityDiscovery/communityDiscoveryLimits";

export type CommunitySaveNotice =
  | { tone: "saving" | "saved" | "duplicate" }
  | { tone: "error"; error: CommunityDiscoveryUiError };

type CommunityCopy = TenantMessages["communityIntelligence"];

function FacebookGroupLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={COMMUNITY_SECONDARY_CLASS}
    >
      {label}
    </a>
  );
}

function saveLabel(copy: CommunityCopy, notice: CommunitySaveNotice | undefined): string {
  if (notice?.tone === "saving") return copy.saving;
  if (notice?.tone === "saved" || notice?.tone === "duplicate") return copy.savedAction;
  return copy.save;
}

function saveMessage(
  copy: CommunityCopy,
  notice: CommunitySaveNotice | undefined,
): string | null {
  if (notice?.tone === "duplicate") return copy.alreadySaved;
  if (notice?.tone === "saved") return copy.saved;
  if (notice?.tone === "error") return copy.errors[notice.error];
  return null;
}

function SuggestedContributionField({
  suggestion,
  copy,
}: {
  suggestion: string;
  copy: CommunityCopy;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState(suggestion);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4">
      <label className={COMMUNITY_FIELD_LABEL_CLASS} htmlFor={fieldId}>
        {copy.suggestedContributionLabel}
      </label>
      <textarea
        id={fieldId}
        value={draft}
        maxLength={ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH}
        className={`mt-2 ${COMMUNITY_SUGGESTION_CLASS}`}
        onChange={(event) => {
          setDraft(event.target.value);
          setCopied(false);
        }}
      />
      <p className={`mt-2 ${COMMUNITY_FIELD_HELP_CLASS}`}>{copy.suggestedContributionHelp}</p>
      <button type="button" className={`mt-3 ${COMMUNITY_SECONDARY_CLASS}`} onClick={() => void onCopy()}>
        {copied ? copy.copiedSuggestion : copy.copySuggestion}
      </button>
    </div>
  );
}

export function CommunityDiscoveryCards({
  cards,
  copy,
  notices,
  onSave,
}: {
  cards: CommunityDiscoveryCard[];
  copy: CommunityCopy;
  notices: Record<string, CommunitySaveNotice | undefined>;
  onSave: (canonicalUrl: string) => void;
}) {
  return (
    <div className="space-y-4">
      {cards.map((card) => {
        const notice = notices[card.canonicalUrl];
        const message = saveMessage(copy, notice);
        return (
          <article key={card.canonicalUrl} className={COMMUNITY_CARD_CLASS}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/80">
              {copy.platformFacebook}
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
              {card.displayName}
            </h3>
            <p className="mt-2 break-all text-sm leading-6 text-white/55">
              {card.canonicalUrl}
            </p>
            {card.explanation ? (
              <div className="mt-4">
                <div className={COMMUNITY_FIELD_LABEL_CLASS}>{copy.relevance}</div>
                <p className="mt-2 text-sm leading-6 text-white/75">{card.explanation}</p>
              </div>
            ) : (
              <div className="mt-4">
                <div className={COMMUNITY_FIELD_LABEL_CLASS}>
                  {copy.qualificationUnavailable}
                </div>
                <p className={`mt-2 ${COMMUNITY_FIELD_HELP_CLASS}`}>
                  {copy.qualificationUnavailableHelp}
                </p>
              </div>
            )}
            {card.engagementGuidance ? (
              <div className="mt-4">
                <div className={COMMUNITY_FIELD_LABEL_CLASS}>
                  {copy.engagementGuidanceLabel}
                </div>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  {card.engagementGuidance}
                </p>
              </div>
            ) : null}
            {card.suggestedContribution ? (
              <SuggestedContributionField
                key={`${card.canonicalUrl}:${card.suggestedContribution}`}
                suggestion={card.suggestedContribution}
                copy={copy}
              />
            ) : card.readyToPasteUnavailable ? (
              <p className={`mt-4 ${COMMUNITY_FIELD_HELP_CLASS}`}>
                {copy.readyToPasteUnavailable}
              </p>
            ) : null}
            {card.listingSnippet ? (
              <div className="mt-4">
                <div className={COMMUNITY_FIELD_LABEL_CLASS}>{copy.listingText}</div>
                <p className="mt-2 text-sm leading-6 text-white/60">{card.listingSnippet}</p>
              </div>
            ) : null}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <FacebookGroupLink href={card.canonicalUrl} label={copy.openGroup} />
              <button
                type="button"
                className={COMMUNITY_SECONDARY_CLASS}
                disabled={notice?.tone === "saving" || notice?.tone === "saved" || notice?.tone === "duplicate"}
                onClick={() => onSave(card.canonicalUrl)}
              >
                {saveLabel(copy, notice)}
              </button>
            </div>
            {message ? (
              <p className="mt-3 text-sm leading-6 text-white/60">{message}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function SavedCommunityCards({
  saves,
  copy,
}: {
  saves: SavedCommunityCard[];
  copy: CommunityCopy;
}) {
  return (
    <div className="space-y-4">
      {saves.map((save) => (
        <article key={save.id} className={COMMUNITY_CARD_CLASS}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/80">
            {copy.platformFacebook}
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
            {save.displayName}
          </h3>
          <p className="mt-2 break-all text-sm leading-6 text-white/55">
            {save.canonicalUrl}
          </p>
          <p className="mt-3 text-sm text-white/70">
            {interpolateTenantMessage(copy.savedAs, {
              qualification:
                save.qualification === "relevant"
                  ? copy.qualificationRelevant
                  : copy.qualificationNotRelevant,
            })}
          </p>
          {save.notes ? <p className={`mt-3 ${COMMUNITY_NOTE_CLASS}`}>{save.notes}</p> : null}
          <div className="mt-5">
            <FacebookGroupLink href={save.canonicalUrl} label={copy.openGroup} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function CommunityPanel({
  className,
  title,
  children,
}: {
  className: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {title ? <h2 className="text-base font-semibold text-white">{title}</h2> : null}
      <div className={title ? "mt-2" : undefined}>{children}</div>
    </div>
  );
}

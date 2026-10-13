"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  COMMUNITY_CARD_CLASS,
  COMMUNITY_FIELD_HELP_CLASS,
  COMMUNITY_FIELD_LABEL_CLASS,
  COMMUNITY_SECONDARY_CLASS,
  COMMUNITY_SUGGESTION_CLASS,
} from "@/lib/communityIntelligence/communityIntelligencePresentation";
import {
  savedCommunityMatchesSearch,
  savedCommunityNotesClientError,
  savedCommunityNotesRequestText,
  type CommunityDiscoveryCard,
  type CommunityDiscoveryUiError,
  type SavedCommunityCard,
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
            ) : card.relevanceNoteUnavailable ? (
              <div className="mt-4">
                <div className={COMMUNITY_FIELD_LABEL_CLASS}>
                  {copy.relevanceNoteUnavailable}
                </div>
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

export type SaveCommunityNotes = (input: {
  canonicalUrl: string;
  qualification: SavedCommunityCard["qualification"];
  notes: string;
}) => Promise<
  | { ok: true; save: SavedCommunityCard }
  | { ok: false; error: CommunityDiscoveryUiError }
>;

export type RemoveSavedCommunity = (
  saveId: string,
) => Promise<{ ok: true } | { ok: false; error: CommunityDiscoveryUiError }>;

type SavedNotesNotice =
  | { tone: "saving" | "saved" | "cleared" }
  | { tone: "error"; error: CommunityDiscoveryUiError };

function notesNoticeCopy(
  copy: CommunityCopy,
  notice: SavedNotesNotice | null,
): { text: string; alert: boolean } | null {
  if (!notice) return null;
  if (notice.tone === "error") return { text: copy.errors[notice.error], alert: true };
  if (notice.tone === "saving") return { text: copy.saving, alert: false };
  if (notice.tone === "saved") return { text: copy.notesSaved, alert: false };
  return { text: copy.notesCleared, alert: false };
}

function SavedCommunityNotesEditor({
  save,
  copy,
  onSaveNotes,
}: {
  save: SavedCommunityCard;
  copy: CommunityCopy;
  onSaveNotes: SaveCommunityNotes;
}) {
  const fieldId = useId();
  const helpId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const persisted = save.notes ?? "";
  const [draft, setDraft] = useState(persisted);
  const [accepted, setAccepted] = useState(persisted);
  const [holdPersisted, setHoldPersisted] = useState<string | null>(null);
  const [notice, setNotice] = useState<SavedNotesNotice | null>(null);
  const savingRef = useRef(false);

  // A successful save adopts the server note immediately. Hold the pre-save
  // value so a stale render cannot put it back. A dirty draft is also left
  // alone when a refresh changes the stored note.
  if (holdPersisted !== null && persisted !== holdPersisted) {
    setHoldPersisted(null);
  }
  const ignoringStalePersisted = holdPersisted !== null && persisted === holdPersisted;
  if (!ignoringStalePersisted && persisted !== accepted) {
    setAccepted(persisted);
    if (draft === accepted) {
      setDraft(persisted);
      setNotice(null);
    }
  }

  function onDraftChange(value: string, element: HTMLTextAreaElement) {
    if (savedCommunityNotesClientError(value)) {
      const tracker = (
        element as HTMLTextAreaElement & {
          _valueTracker?: { setValue: (next: string) => void };
        }
      )._valueTracker;
      // React will not write an unchanged value prop back over a rejected paste.
      tracker?.setValue(value);
      element.value = draft;
      setNotice({ tone: "error", error: "invalidNotes" });
      return;
    }
    setDraft(value);
    setNotice(null);
  }

  function blockLineBreak(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
    }
  }

  useEffect(() => {
    const element = fieldRef.current;
    if (!element) return;
    function blockBeforeInput(event: Event) {
      const inputType = (event as InputEvent).inputType;
      if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
        event.preventDefault();
      }
    }
    element.addEventListener("beforeinput", blockBeforeInput);
    return () => element.removeEventListener("beforeinput", blockBeforeInput);
  }, []);

  async function onSave() {
    if (savingRef.current) return;
    if (savedCommunityNotesClientError(draft)) {
      setNotice({ tone: "error", error: "invalidNotes" });
      return;
    }
    savingRef.current = true;
    setNotice({ tone: "saving" });
    try {
      const result = await onSaveNotes({
        canonicalUrl: save.canonicalUrl,
        qualification: save.qualification,
        notes: savedCommunityNotesRequestText(draft),
      });
      if (!result.ok) {
        setNotice({ tone: "error", error: result.error });
        return;
      }
      const next = result.save.notes ?? "";
      if (persisted !== next) setHoldPersisted(persisted);
      setDraft(next);
      setAccepted(next);
      setNotice(next ? { tone: "saved" } : { tone: "cleared" });
    } catch {
      setNotice({ tone: "error", error: "saveFailed" });
    } finally {
      savingRef.current = false;
    }
  }

  const saving = notice?.tone === "saving";
  const feedback = notesNoticeCopy(copy, notice);

  return (
    <div className="mt-4">
      <label className={COMMUNITY_FIELD_LABEL_CLASS} htmlFor={fieldId}>
        {copy.notesLabel}
      </label>
      <textarea
        id={fieldId}
        ref={fieldRef}
        data-saved-notes={save.id}
        value={draft}
        rows={3}
        disabled={saving}
        aria-invalid={notice?.tone === "error"}
        aria-describedby={helpId}
        className={`mt-2 ${COMMUNITY_SUGGESTION_CLASS}`}
        onKeyDown={blockLineBreak}
        onPaste={(event) => {
          const pasted = event.clipboardData?.getData("text") ?? "";
          const element = event.currentTarget;
          const start = element.selectionStart ?? element.value.length;
          const end = element.selectionEnd ?? element.value.length;
          const next = `${element.value.slice(0, start)}${pasted}${element.value.slice(end)}`;
          if (savedCommunityNotesClientError(next)) {
            event.preventDefault();
            setNotice({ tone: "error", error: "invalidNotes" });
          }
        }}
        onChange={(event) => onDraftChange(event.target.value, event.target)}
      />
      <p id={helpId} className={`mt-2 ${COMMUNITY_FIELD_HELP_CLASS}`}>
        {copy.notesHelp}
      </p>
      <button
        type="button"
        data-saved-notes-action={save.id}
        className={`mt-3 ${COMMUNITY_SECONDARY_CLASS}`}
        disabled={saving}
        onClick={() => void onSave()}
      >
        {saving ? copy.saving : copy.saveNotes}
      </button>
      {feedback ? (
        <p
          data-saved-notes-status={save.id}
          className={`mt-3 text-sm leading-6 ${feedback.alert ? "text-rose-100" : "text-white/60"}`}
          role={feedback.alert ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

export function SavedCommunityCards({
  saves,
  copy,
  onSaveNotes,
  onRemove = async () => ({ ok: false, error: "removeFailed" }),
  searchQuery = "",
}: {
  saves: SavedCommunityCard[];
  copy: CommunityCopy;
  onSaveNotes: SaveCommunityNotes;
  onRemove?: RemoveSavedCommunity;
  searchQuery?: string;
}) {
  return (
    <div className="space-y-4">
      {saves.map((save) => {
        const matches = savedCommunityMatchesSearch(save, searchQuery);
        return (
        <article
          key={save.id}
          hidden={!matches}
          className={COMMUNITY_CARD_CLASS}
          data-saved-community={save.id}
        >
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
          <SavedCommunityNotesEditor save={save} copy={copy} onSaveNotes={onSaveNotes} />
          <SavedCommunityActions save={save} copy={copy} onRemove={onRemove} />
        </article>
        );
      })}
    </div>
  );
}

function SavedCommunityActions({
  save,
  copy,
  onRemove,
}: {
  save: SavedCommunityCard;
  copy: CommunityCopy;
  onRemove: RemoveSavedCommunity;
}) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<CommunityDiscoveryUiError | null>(null);

  async function onRemoveClick() {
    if (removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = await onRemove(save.id);
      if (!result.ok) setRemoveError(result.error);
    } catch {
      setRemoveError("removeFailed");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <FacebookGroupLink href={save.canonicalUrl} label={copy.openGroup} />
        <button
          type="button"
          data-saved-remove={save.id}
          className={COMMUNITY_SECONDARY_CLASS}
          disabled={removing}
          onClick={() => void onRemoveClick()}
        >
          {removing ? copy.removing : copy.removeFromSaved}
        </button>
      </div>
      {removeError ? (
        <p
          data-saved-remove-status={save.id}
          className="mt-3 text-sm leading-6 text-rose-100"
          role="alert"
        >
          {copy.errors[removeError]}
        </p>
      ) : null}
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

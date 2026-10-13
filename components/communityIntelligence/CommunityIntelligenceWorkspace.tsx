"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Group, LoaderCircle } from "lucide-react";
import {
  CommunityDiscoveryCards,
  CommunityPanel,
  SavedCommunityCards,
  type CommunitySaveNotice,
} from "@/components/communityIntelligence/CommunityDiscoveryCards";
import {
  COMMUNITY_DISCOVERY_CLIENT_TIMEOUT_MS,
  appendCommunityDiscoveryCards,
  canonicalManualFacebookGroupUrl,
  communityDiscoveryRefreshPlan,
  readCommunityDiscoverySessionToken,
  requestCommunityDiscovery,
  requestMoreCommunities,
  requestRemoveSavedCommunity,
  requestSaveCommunity,
  requestSavedCommunities,
  requestUpdateSavedCommunityNotes,
  savedCommunityMatchesSearch,
  restoreCommunityDiscovery,
  writeCommunityDiscoverySessionToken,
  type CommunityDiscoveryCard,
  type CommunityDiscoveryUiError,
  type SavedCommunityCard,
} from "@/lib/communityIntelligence/communityDiscoveryClient";
import {
  COMMUNITY_CARD_CLASS,
  COMMUNITY_COMPOSER_SURFACE,
  COMMUNITY_EMPTY_CLASS,
  COMMUNITY_ERROR_CLASS,
  COMMUNITY_FIELD_HELP_CLASS,
  COMMUNITY_FIELD_LABEL_CLASS,
  COMMUNITY_INPUT_CLASS,
  COMMUNITY_NOTE_CLASS,
  COMMUNITY_PRIMARY_CLASS,
  COMMUNITY_SECONDARY_CLASS,
  COMMUNITY_STATUS_CLASS,
  COMMUNITY_TAB_CLASS,
  COMMUNITY_TAB_CURRENT_CLASS,
  COMMUNITY_TAB_IDLE_CLASS,
  COMMUNITY_TEXTAREA_CLASS,
} from "@/lib/communityIntelligence/communityIntelligencePresentation";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH,
  COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH,
} from "@/services/communityDiscovery/communityDiscoveryLimits";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;

type WorkspaceView = "discover" | "saved";

function mergeSaved(
  current: SavedCommunityCard[],
  save: SavedCommunityCard,
): SavedCommunityCard[] {
  const without = current.filter((item) => item.canonicalUrl !== save.canonicalUrl);
  return [save, ...without];
}

export function CommunityIntelligenceWorkspace({
  messages,
}: {
  messages: TenantMessages;
}) {
  const copy = messages.communityIntelligence;
  const [view, setView] = useState<WorkspaceView>("discover");
  const [objective, setObjective] = useState("");
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [cards, setCards] = useState<CommunityDiscoveryCard[]>([]);
  const [qualificationUnavailable, setQualificationUnavailable] = useState(false);
  const [moreAvailable, setMoreAvailable] = useState(false);
  const [searchExhausted, setSearchExhausted] = useState(false);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [findingMore, setFindingMore] = useState(false);
  const [recovery, setRecovery] = useState<"active" | "lost" | null>(null);
  const [discoveryError, setDiscoveryError] = useState<CommunityDiscoveryUiError | null>(
    null,
  );
  const [saves, setSaves] = useState<SavedCommunityCard[]>([]);
  const [savesState, setSavesState] = useState<"loading" | "ready" | "error">("loading");
  const [savesError, setSavesError] = useState<CommunityDiscoveryUiError | null>(null);
  const [notices, setNotices] = useState<Record<string, CommunitySaveNotice | undefined>>(
    {},
  );
  const [manualUrl, setManualUrl] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<CommunityDiscoveryUiError | null>(null);
  const [manualSaved, setManualSaved] = useState<SavedCommunityCard | null>(null);
  const [manualDuplicate, setManualDuplicate] = useState(false);
  const [savedQuery, setSavedQuery] = useState("");
  const searchId = useRef(0);
  const findMoreLock = useRef(false);

  useEffect(() => {
    let active = true;
    if (communityDiscoveryRefreshPlan(readCommunityDiscoverySessionToken()) === "restore") {
      const token = readCommunityDiscoverySessionToken();
      if (token) {
        void restoreCommunityDiscovery(token).then((result) => {
          if (!active) return;
          setRecovery(result.ok ? result.discovery.recovery ?? "lost" : "lost");
        });
      }
    }
    void requestSavedCommunities().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setSavesState("error");
        setSavesError(result.error);
        return;
      }
      setSaves(result.saves);
      setSavesState("ready");
      setSavesError(null);
      setNotices((current) => {
        const next = { ...current };
        for (const save of result.saves) {
          if (!next[save.canonicalUrl]) next[save.canonicalUrl] = { tone: "saved" };
        }
        return next;
      });
    });
    return () => {
      active = false;
      searchId.current += 1;
    };
  }, []);

  async function refreshSaves(): Promise<
    | { ok: true; saves: SavedCommunityCard[] }
    | { ok: false; error: CommunityDiscoveryUiError }
  > {
    const result = await requestSavedCommunities();
    if (!result.ok) {
      setSavesState("error");
      setSavesError(result.error);
      return result;
    }
    setSaves(result.saves);
    setSavesState("ready");
    setSavesError(null);
    setNotices((current) => {
      const next = { ...current };
      for (const save of result.saves) {
        if (!next[save.canonicalUrl] || next[save.canonicalUrl]?.tone === "error") {
          next[save.canonicalUrl] = { tone: "saved" };
        }
      }
      return next;
    });
    return result;
  }

  function rememberSession(sessionToken: string | null) {
    if (sessionToken) writeCommunityDiscoverySessionToken(sessionToken);
  }

  async function onFind(event: FormEvent) {
    event.preventDefault();
    if (searching || findingMore || findMoreLock.current) return;
    const trimmed = objective.trim();
    if (
      trimmed.length < COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH ||
      trimmed.length > COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH ||
      CONTROL_CHARACTER.test(objective)
    ) {
      setDiscoveryError("invalidObjective");
      return;
    }

    const generation = searchId.current + 1;
    searchId.current = generation;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, COMMUNITY_DISCOVERY_CLIENT_TIMEOUT_MS);

    setSearching(true);
    setDiscoveryError(null);
    try {
      const result = await requestCommunityDiscovery(trimmed, controller.signal);
      if (generation !== searchId.current) return;
      setHasSearched(true);
      if (!result.ok) {
        setCards([]);
        setQualificationUnavailable(false);
        setMoreAvailable(false);
        setSearchExhausted(false);
        setContinuationToken(null);
        setRecovery(null);
        setDiscoveryError(timedOut ? "providerTimeout" : result.error);
        return;
      }
      if (result.discovery.recovery) {
        setCards([]);
        setQualificationUnavailable(false);
        setMoreAvailable(false);
        setSearchExhausted(false);
        setContinuationToken(null);
        setRecovery(result.discovery.recovery);
        setDiscoveryError(null);
        return;
      }
      setCards(result.discovery.cards);
      setQualificationUnavailable(result.discovery.qualificationUnavailable);
      setMoreAvailable(result.discovery.continuation.moreAvailable);
      setSearchExhausted(result.discovery.continuation.exhausted);
      setContinuationToken(result.discovery.continuation.token);
      setRecovery(null);
      rememberSession(result.discovery.continuation.sessionToken);
    } finally {
      clearTimeout(timer);
      if (generation === searchId.current) setSearching(false);
    }
  }

  async function onFindMore() {
    if (searching || findingMore || findMoreLock.current || !continuationToken) return;
    const trimmed = objective.trim();
    findMoreLock.current = true;
    const generation = searchId.current + 1;
    searchId.current = generation;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, COMMUNITY_DISCOVERY_CLIENT_TIMEOUT_MS);
    setFindingMore(true);
    setDiscoveryError(null);
    try {
      const result = await requestMoreCommunities(
        trimmed,
        continuationToken,
        controller.signal,
      );
      if (generation !== searchId.current) return;
      if (!result.ok) {
        setDiscoveryError(timedOut ? "providerTimeout" : result.error);
        return;
      }
      if (result.discovery.recovery) {
        setRecovery(result.discovery.recovery);
        return;
      }
      setCards((current) =>
        appendCommunityDiscoveryCards(current, result.discovery.cards),
      );
      setQualificationUnavailable(result.discovery.qualificationUnavailable);
      setMoreAvailable(result.discovery.continuation.moreAvailable);
      setSearchExhausted(result.discovery.continuation.exhausted);
      setContinuationToken(result.discovery.continuation.token);
      setRecovery(null);
      rememberSession(result.discovery.continuation.sessionToken);
    } finally {
      clearTimeout(timer);
      findMoreLock.current = false;
      if (generation === searchId.current) setFindingMore(false);
    }
  }

  async function onSave(canonicalUrl: string) {
    const current = notices[canonicalUrl];
    if (current?.tone === "saving" || current?.tone === "saved" || current?.tone === "duplicate") {
      return;
    }
    setNotices((existing) => ({ ...existing, [canonicalUrl]: { tone: "saving" } }));
    const listed = await refreshSaves();
    if (!listed.ok) {
      setNotices((existing) => ({
        ...existing,
        [canonicalUrl]: { tone: "error", error: listed.error },
      }));
      return;
    }
    if (listed.saves.some((save) => save.canonicalUrl === canonicalUrl)) {
      setNotices((existing) => ({ ...existing, [canonicalUrl]: { tone: "duplicate" } }));
      return;
    }
    const saved = await requestSaveCommunity(canonicalUrl);
    if (!saved.ok) {
      setNotices((existing) => ({
        ...existing,
        [canonicalUrl]: { tone: "error", error: saved.error },
      }));
      return;
    }
    setSaves((existing) => mergeSaved(existing, saved.save));
    setNotices((existing) => ({ ...existing, [canonicalUrl]: { tone: "saved" } }));
  }

  async function onManualSave(event: FormEvent) {
    event.preventDefault();
    if (manualSaving) return;
    const canonicalUrl = canonicalManualFacebookGroupUrl(manualUrl);
    if (!canonicalUrl) {
      setManualError("invalidCommunityUrl");
      setManualSaved(null);
      setManualDuplicate(false);
      return;
    }

    setManualSaving(true);
    setManualError(null);
    setManualSaved(null);
    setManualDuplicate(false);
    try {
      const listed = await refreshSaves();
      if (!listed.ok) {
        setManualError(listed.error);
        return;
      }
      const known = listed.saves.find((save) => save.canonicalUrl === canonicalUrl);
      if (known) {
        setManualSaved(known);
        setManualDuplicate(true);
        setNotices((existing) => ({ ...existing, [canonicalUrl]: { tone: "duplicate" } }));
        return;
      }
      const saved = await requestSaveCommunity(canonicalUrl);
      if (!saved.ok) {
        setManualError(saved.error);
        return;
      }
      setSaves((existing) => mergeSaved(existing, saved.save));
      setManualSaved(saved.save);
      setNotices((existing) => ({ ...existing, [canonicalUrl]: { tone: "saved" } }));
    } finally {
      setManualSaving(false);
    }
  }

  async function onSaveNotes(input: {
    canonicalUrl: string;
    qualification: SavedCommunityCard["qualification"];
    notes: string;
  }) {
    const saved = await requestUpdateSavedCommunityNotes(input);
    if (saved.ok) {
      setSaves((existing) => {
        const index = existing.findIndex(
          (item) => item.canonicalUrl === saved.save.canonicalUrl,
        );
        // A notes response must not put a removed card back on the list.
        if (index === -1) return existing;
        const next = existing.slice();
        next[index] = saved.save;
        return next;
      });
    }
    return saved;
  }

  async function onRemoveSaved(saveId: string) {
    const result = await requestRemoveSavedCommunity(saveId);
    if (result.ok) {
      setSaves((existing) => existing.filter((item) => item.id !== saveId));
    }
    return result;
  }

  const objectiveCount = interpolateTenantMessage(copy.objectiveCount, {
    count: objective.length,
    max: COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH,
  });
  const canSearch =
    !searching &&
    !findingMore &&
    objective.trim().length >= COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH &&
    objective.trim().length <= COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH;
  const canSaveManual = !manualSaving && manualUrl.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={copy.title}>
        <button
          type="button"
          role="tab"
          aria-selected={view === "discover"}
          className={`${COMMUNITY_TAB_CLASS} ${view === "discover" ? COMMUNITY_TAB_CURRENT_CLASS : COMMUNITY_TAB_IDLE_CLASS}`}
          onClick={() => setView("discover")}
        >
          {copy.viewDiscover}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "saved"}
          className={`${COMMUNITY_TAB_CLASS} ${view === "saved" ? COMMUNITY_TAB_CURRENT_CLASS : COMMUNITY_TAB_IDLE_CLASS}`}
          onClick={() => setView("saved")}
        >
          {copy.viewSaved}
        </button>
      </div>

      {view === "discover" ? (
        <div className="space-y-6">
          <form className={COMMUNITY_COMPOSER_SURFACE} onSubmit={onFind}>
            <div className="mb-5 flex items-center gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(52,211,153,0.32)] bg-[rgba(52,211,153,0.12)] text-emerald-200"
                aria-hidden="true"
              >
                <Group className="size-5" />
              </span>
              <h2 className="text-lg font-semibold text-white">{copy.objectiveLabel}</h2>
            </div>
            <label className="block" htmlFor="community-discovery-objective">
              <span className="sr-only">{copy.objectiveLabel}</span>
              <textarea
                id="community-discovery-objective"
                value={objective}
                maxLength={COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH}
                placeholder={copy.objectivePlaceholder}
                disabled={searching}
                aria-busy={searching}
                className={COMMUNITY_TEXTAREA_CLASS}
                onChange={(event) => setObjective(event.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={COMMUNITY_FIELD_HELP_CLASS}>{copy.objectiveHelp}</p>
              <p className="text-xs tabular-nums text-white/35">{objectiveCount}</p>
            </div>
            <div className="mt-5">
              <button type="submit" className={COMMUNITY_PRIMARY_CLASS} disabled={!canSearch}>
                {searching ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {searching ? copy.searching : copy.findCommunities}
              </button>
            </div>
          </form>

          <p className={COMMUNITY_NOTE_CLASS}>{copy.independenceNote}</p>

          <aside className={COMMUNITY_NOTE_CLASS}>
            <div className={COMMUNITY_FIELD_LABEL_CLASS}>{copy.followUpLabel}</div>
            <p className="mt-2">{copy.suggestedConversationFollowUp}</p>
          </aside>

          {searching ? (
            <CommunityPanel className={COMMUNITY_STATUS_CLASS} title={copy.searching}>
              <p>{copy.searchingHelp}</p>
            </CommunityPanel>
          ) : null}

          {discoveryError ? (
            <div className={COMMUNITY_ERROR_CLASS} role="alert">
              {copy.errors[discoveryError]}
            </div>
          ) : null}

          <form className={COMMUNITY_COMPOSER_SURFACE} onSubmit={onManualSave}>
            <label className="block" htmlFor="community-manual-url">
              <span className={COMMUNITY_FIELD_LABEL_CLASS}>{copy.manualUrlLabel}</span>
              <input
                id="community-manual-url"
                type="url"
                inputMode="url"
                value={manualUrl}
                placeholder={copy.manualUrlPlaceholder}
                disabled={manualSaving}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={manualError === "invalidCommunityUrl"}
                className={`mt-2 ${COMMUNITY_INPUT_CLASS}`}
                onChange={(event) => {
                  setManualUrl(event.target.value);
                  setManualError(null);
                  setManualSaved(null);
                  setManualDuplicate(false);
                }}
              />
            </label>
            <p className={`mt-3 ${COMMUNITY_FIELD_HELP_CLASS}`}>{copy.manualUrlHelp}</p>
            <div className="mt-5">
              <button
                type="submit"
                className={COMMUNITY_PRIMARY_CLASS}
                disabled={!canSaveManual}
              >
                {manualSaving ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {manualSaving ? copy.saving : copy.saveManualUrl}
              </button>
            </div>
          </form>

          {manualError ? (
            <div className={COMMUNITY_ERROR_CLASS} role="alert">
              {copy.errors[manualError]}
            </div>
          ) : null}

          {manualSaved ? (
            <article className={COMMUNITY_CARD_CLASS}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/80">
                {copy.platformFacebook}
              </div>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                {manualSaved.displayName}
              </h3>
              <p className="mt-2 break-all text-sm leading-6 text-white/55">
                {manualSaved.canonicalUrl}
              </p>
              <div className="mt-5">
                <a
                  href={manualSaved.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={COMMUNITY_SECONDARY_CLASS}
                >
                  {copy.openGroup}
                </a>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/60">
                {manualDuplicate ? copy.alreadySaved : copy.saved}
              </p>
            </article>
          ) : null}

          {!searching && qualificationUnavailable && cards.length > 0 ? (
            <CommunityPanel
              className={COMMUNITY_STATUS_CLASS}
              title={copy.qualificationUnavailable}
            >
              <p>{copy.qualificationUnavailableHelp}</p>
            </CommunityPanel>
          ) : null}

          {recovery && !searching ? (
            <CommunityPanel className={COMMUNITY_STATUS_CLASS} title={copy.searchRecoveryTitle}>
              <p>
                {recovery === "active" ? copy.searchRecoveryActive : copy.searchRecoveryLost}
              </p>
            </CommunityPanel>
          ) : null}

          {!searching && hasSearched && cards.length === 0 && !discoveryError && !recovery ? (
            <CommunityPanel className={COMMUNITY_EMPTY_CLASS} title={copy.emptyResultsTitle}>
              <p className="text-sm leading-6 text-white/55">{copy.emptyResultsBody}</p>
            </CommunityPanel>
          ) : null}

          {!hasSearched && !searching && !discoveryError && !recovery ? (
            <CommunityPanel className={COMMUNITY_EMPTY_CLASS} title={copy.emptyBeforeTitle}>
              <p className="text-sm leading-6 text-white/55">{copy.emptyBeforeBody}</p>
            </CommunityPanel>
          ) : null}

          {!searching && cards.length > 0 ? (
            <section className="space-y-4" aria-label={copy.resultsTitle}>
              <h2 className="text-lg font-semibold text-white">{copy.resultsTitle}</h2>
              <CommunityDiscoveryCards
                cards={cards}
                copy={copy}
                notices={notices}
                onSave={onSave}
              />
              {moreAvailable ? (
                <button
                  type="button"
                  className={COMMUNITY_SECONDARY_CLASS}
                  disabled={findingMore}
                  onClick={() => void onFindMore()}
                >
                  {findingMore ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {findingMore ? copy.findingMore : copy.findMoreCommunities}
                </button>
              ) : null}
              {searchExhausted && !moreAvailable ? (
                <p className={COMMUNITY_FIELD_HELP_CLASS}>{copy.findMoreExhausted}</p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <section className="space-y-4" aria-label={copy.savedTitle}>
          <div>
            <h2 className="text-lg font-semibold text-white">{copy.savedTitle}</h2>
            <p className={`mt-2 ${COMMUNITY_FIELD_HELP_CLASS}`}>{copy.savedHelp}</p>
            <p className={`mt-2 ${COMMUNITY_FIELD_HELP_CLASS}`}>{copy.removeHelp}</p>
          </div>
          {savesState === "loading" ? (
            <CommunityPanel className={COMMUNITY_STATUS_CLASS}>
              <p>{copy.savesLoading}</p>
            </CommunityPanel>
          ) : null}
          {savesState === "error" && savesError ? (
            <div className="space-y-3">
              <div className={COMMUNITY_ERROR_CLASS} role="alert">
                {copy.errors[savesError]}
              </div>
              <button
                type="button"
                className={COMMUNITY_SECONDARY_CLASS}
                onClick={() => {
                  setSavesState("loading");
                  void refreshSaves();
                }}
              >
                {messages.common.retry}
              </button>
            </div>
          ) : null}
          {savesState === "ready" && saves.length === 0 ? (
            <CommunityPanel className={COMMUNITY_EMPTY_CLASS} title={copy.savedEmptyTitle}>
              <p className="text-sm leading-6 text-white/55">{copy.savedEmptyBody}</p>
            </CommunityPanel>
          ) : null}
          {savesState === "ready" && saves.length > 0 ? (
            <>
              <div>
                <label className={COMMUNITY_FIELD_LABEL_CLASS} htmlFor="saved-community-search">
                  {copy.savedSearchLabel}
                </label>
                <input
                  id="saved-community-search"
                  type="search"
                  value={savedQuery}
                  placeholder={copy.savedSearchPlaceholder}
                  autoComplete="off"
                  className={`mt-2 ${COMMUNITY_INPUT_CLASS}`}
                  aria-describedby="saved-community-search-help"
                  onChange={(event) => setSavedQuery(event.target.value)}
                />
                <p id="saved-community-search-help" className={`mt-2 ${COMMUNITY_FIELD_HELP_CLASS}`}>
                  {copy.savedSearchHelp}
                </p>
              </div>
              {saves.every((save) => !savedCommunityMatchesSearch(save, savedQuery)) ? (
                <CommunityPanel className={COMMUNITY_EMPTY_CLASS} title={copy.savedSearchEmptyTitle}>
                  <p className="text-sm leading-6 text-white/55">{copy.savedSearchEmptyBody}</p>
                </CommunityPanel>
              ) : null}
              <SavedCommunityCards
                saves={saves}
                copy={copy}
                searchQuery={savedQuery}
                onSaveNotes={onSaveNotes}
                onRemove={onRemoveSaved}
              />
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

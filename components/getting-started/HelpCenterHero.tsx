"use client";

import { Sparkles } from "lucide-react";
import { HELP_SECTION_ANCHORS } from "@/lib/gettingStarted/helpCenterCatalog";
import type { HelpCenterCopy } from "@/lib/gettingStarted/helpCenterTopics";
import {
  HELP_ASK_CTA_CLASS,
  HELP_ASK_CTA_HINT_CLASS,
  HELP_CLEAR_SEARCH_CLASS,
  HELP_EYEBROW_CLASS,
  HELP_HERO_CLASS,
  HELP_INTRO_CLASS,
  HELP_SEARCH_FIELD_CLASS,
  HELP_SEARCH_WRAP_CLASS,
  HELP_TAGLINE_CLASS,
  HELP_TITLE_CLASS,
} from "@/lib/gettingStarted/helpCenterPresentation";

type HelpCenterHeroProps = {
  copy: HelpCenterCopy;
  query: string;
  onQueryChange: (value: string) => void;
  onAskAthena: () => void;
};

export function HelpCenterHero({
  copy,
  query,
  onQueryChange,
  onAskAthena,
}: HelpCenterHeroProps) {
  return (
    <header className={HELP_HERO_CLASS}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <div className={HELP_EYEBROW_CLASS}>{copy.eyebrow}</div>
          <h1 className={HELP_TITLE_CLASS}>{copy.title}</h1>
          <p className={HELP_TAGLINE_CLASS}>{copy.tagline}</p>
          <p className={HELP_INTRO_CLASS}>{copy.intro}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <a
            href={`#${HELP_SECTION_ANCHORS.ask}`}
            data-help-ask-cta=""
            className={HELP_ASK_CTA_CLASS}
            onClick={onAskAthena}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {copy.askAthenaCta}
          </a>
          <p className={`${HELP_ASK_CTA_HINT_CLASS} lg:text-right`}>
            {copy.askAthenaHint}
          </p>
        </div>
      </div>

      <div className={HELP_SEARCH_WRAP_CLASS}>
        <label
          htmlFor="help-center-topic-filter"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40"
        >
          {copy.findTopicLabel}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            id="help-center-topic-filter"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={copy.findTopicPlaceholder}
            className={HELP_SEARCH_FIELD_CLASS}
            autoComplete="off"
          />
          {query.trim() ? (
            <button
              type="button"
              className={HELP_CLEAR_SEARCH_CLASS}
              onClick={() => onQueryChange("")}
            >
              {copy.findTopicClear}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Compass,
  CircleHelp,
  ListChecks,
  Sparkles,
  Wrench,
} from "lucide-react";
import { GettingStartedConversationPanel } from "@/components/getting-started/GettingStartedConversationPanel";
import { HelpCenterHero } from "@/components/getting-started/HelpCenterHero";
import { HelpCenterTopicNav } from "@/components/getting-started/HelpCenterTopicNav";
import { HelpOutcomeGrid } from "@/components/getting-started/HelpOutcomeGrid";
import { HelpTopicSection } from "@/components/getting-started/HelpTopicSection";
import {
  HelpTopicBody,
  HelpWorkflowList,
} from "@/components/getting-started/HelpWorkflowList";
import {
  HELP_QUICK_START_ORDER,
  HELP_SECTION_ANCHORS,
  getHelpTopic,
  isHelpAskDestination,
  isHelpTopicId,
  listHelpTopicsBySection,
} from "@/lib/gettingStarted/helpCenterCatalog";
import {
  HELP_ASK_DESTINATION_CLASS,
  HELP_ASK_DESTINATION_HEADER_CLASS,
  HELP_ASK_INNER_CLASS,
  HELP_BODY_CLASS,
  HELP_EMPTY_STATE_CLASS,
  HELP_ICON_WELL,
  HELP_NESTED_CARD_CLASS,
  HELP_PAGE_STACK_CLASS,
  HELP_PRIMARY_CTA_CLASS,
  HELP_SECONDARY_CTA_CLASS,
  HELP_SURFACE,
} from "@/lib/gettingStarted/helpCenterPresentation";
import {
  filterHelpTopics,
  resolveHelpTopic,
  type HelpCenterCopy,
} from "@/lib/gettingStarted/helpCenterTopics";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { AthenaConversationChrome } from "@/components/conversation/AthenaConversationPanel";

type HelpCenterViewProps = {
  copy: HelpCenterCopy;
  initialTopicId?: string | null;
  conversationChrome: {
    chrome: AthenaConversationChrome;
    clearLabel: string;
    submitLabel: string;
    emptyStateTitle: string;
    readOnlyNotice: string;
  };
};

const DEFAULT_OPEN_TOPICS = new Set<string>([
  "start-here",
  ...HELP_QUICK_START_ORDER,
]);

export function HelpCenterView({
  copy,
  initialTopicId,
  conversationChrome,
}: HelpCenterViewProps) {
  const [query, setQuery] = useState("");
  const [conversationOpen, setConversationOpen] = useState(() =>
    isHelpAskDestination(initialTopicId),
  );
  const [pendingAskScroll, setPendingAskScroll] = useState(false);
  const [openTopicIds, setOpenTopicIds] = useState<Set<string>>(() => {
    const next = new Set(DEFAULT_OPEN_TOPICS);
    if (initialTopicId && isHelpTopicId(initialTopicId)) {
      next.add(initialTopicId);
    }
    return next;
  });
  const [openSections, setOpenSections] = useState({
    start: true,
    quickStart: true,
    concepts: Boolean(initialTopicId && getHelpTopic(initialTopicId)?.section === "concepts"),
    howTo: Boolean(initialTopicId && getHelpTopic(initialTopicId)?.section === "how-to"),
    tools: Boolean(initialTopicId && getHelpTopic(initialTopicId)?.section === "tools"),
    troubleshoot: Boolean(
      initialTopicId && getHelpTopic(initialTopicId)?.section === "troubleshoot",
    ),
  });

  function openAskAthena({ scroll }: { scroll: boolean }) {
    setQuery("");
    setConversationOpen(true);
    if (scroll) setPendingAskScroll(true);
  }

  useEffect(() => {
    if (isHelpAskDestination(initialTopicId)) {
      openAskAthena({ scroll: true });
      return;
    }
    if (!initialTopicId || !isHelpTopicId(initialTopicId)) return;
    const topic = getHelpTopic(initialTopicId);
    if (!topic) return;

    setOpenTopicIds((current) => {
      const next = new Set(current);
      next.add(initialTopicId);
      return next;
    });
    setOpenSections((current) => ({
      ...current,
      start: topic.section === "start" ? true : current.start,
      quickStart: topic.section === "quick-start" ? true : current.quickStart,
      concepts: topic.section === "concepts" ? true : current.concepts,
      howTo: topic.section === "how-to" ? true : current.howTo,
      tools: topic.section === "tools" ? true : current.tools,
      troubleshoot: topic.section === "troubleshoot" ? true : current.troubleshoot,
    }));

    const node = document.getElementById(topic.anchor);
    node?.scrollIntoView({ block: "start" });
  }, [initialTopicId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isHelpAskDestination(window.location.hash)) {
      openAskAthena({ scroll: true });
    }

    function onHashChange() {
      if (isHelpAskDestination(window.location.hash)) {
        openAskAthena({ scroll: true });
      }
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!pendingAskScroll || query.trim()) return;
    document.getElementById(HELP_SECTION_ANCHORS.ask)?.scrollIntoView({
      block: "start",
    });
    setPendingAskScroll(false);
  }, [pendingAskScroll, query]);

  const searching = query.trim().length > 0;
  const matches = useMemo(
    () => (searching ? filterHelpTopics(copy, query) : []),
    [copy, query, searching],
  );

  function toggleTopic(id: string, open: boolean) {
    setOpenTopicIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const quickStartTopics = HELP_QUICK_START_ORDER.map((id) => {
    const definition = getHelpTopic(id);
    return definition ? resolveHelpTopic(definition, copy) : null;
  }).filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));

  const conceptTopics = listHelpTopicsBySection("concepts").map((topic) =>
    resolveHelpTopic(topic, copy),
  );
  const howToTopics = listHelpTopicsBySection("how-to").map((topic) =>
    resolveHelpTopic(topic, copy),
  );
  const toolTopics = listHelpTopicsBySection("tools").filter(
    (topic) => topic.id !== "tool-legacy-note",
  );
  const legacyNote = getHelpTopic("tool-legacy-note");
  const troubleshootTopics = listHelpTopicsBySection("troubleshoot").map((topic) =>
    resolveHelpTopic(topic, copy),
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-8">
      <div>
        <HelpCenterHero
          copy={copy}
          query={query}
          onQueryChange={setQuery}
          onAskAthena={() => openAskAthena({ scroll: true })}
        />
        <div className="mb-8 lg:hidden">
          <HelpCenterTopicNav copy={copy} />
        </div>

        {searching ? (
          <section
            aria-live="polite"
            className="mb-8 space-y-4"
          >
            <div>
              <h2 className="text-2xl font-semibold text-white">
                {copy.findTopicResults}
              </h2>
              <p className="mt-2 text-sm text-white/50">
                {interpolateTenantMessage(copy.findTopicCount, {
                  count: matches.length,
                })}
              </p>
            </div>
            {matches.length === 0 ? (
              <div className={HELP_EMPTY_STATE_CLASS}>
                <p className={HELP_BODY_CLASS}>{copy.findTopicEmpty}</p>
              </div>
            ) : (
              <HelpWorkflowList
                copy={copy}
                topics={matches.map((topic) => ({
                  ...topic,
                }))}
                openTopicIds={new Set(matches.map((topic) => topic.id))}
                onToggleTopic={toggleTopic}
              />
            )}
          </section>
        ) : (
          <div className={HELP_PAGE_STACK_CLASS}>
            <HelpTopicSection
              id={HELP_SECTION_ANCHORS.start}
              title={copy.startHere.title}
              summary={copy.startHere.summary}
              accent="orange"
              icon={<Compass className="size-5" />}
              open={openSections.start}
              onOpenChange={(open) =>
                setOpenSections((current) => ({ ...current, start: open }))
              }
            >
              <div className="space-y-4">
                <p className={HELP_BODY_CLASS}>{copy.startHere.whatAthena}</p>
                <p className={HELP_BODY_CLASS}>{copy.startHere.operatingModel}</p>
                <p className={HELP_BODY_CLASS}>{copy.startHere.relationship}</p>
                <div className={`${HELP_NESTED_CARD_CLASS} border-[rgba(0,208,132,0.22)]`}>
                  <p className={HELP_BODY_CLASS}>{copy.startHere.homeVsHelp}</p>
                </div>
              </div>
            </HelpTopicSection>

            <HelpTopicSection
              id={HELP_SECTION_ANCHORS.quickStart}
              title={copy.quickStart.title}
              summary={copy.quickStart.summary}
              accent="green"
              icon={<ListChecks className="size-5" />}
              open={openSections.quickStart}
              onOpenChange={(open) =>
                setOpenSections((current) => ({ ...current, quickStart: open }))
              }
            >
              <div className="space-y-4">
                {quickStartTopics.map((topic, index) => (
                  <article
                    key={topic.id}
                    id={topic.definition.anchor}
                    className={`${HELP_SURFACE[topic.definition.accent]} p-5`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/40">
                      {interpolateTenantMessage(copy.stepLabel, { n: index + 1 })}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold text-white">
                      {topic.title}
                    </h3>
                    <HelpTopicBody copy={copy} topic={topic} />
                  </article>
                ))}
              </div>
            </HelpTopicSection>

            <section>
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                  {copy.outcomes.title}
                </div>
                <p className="mt-2 text-sm text-white/50">{copy.outcomes.summary}</p>
              </div>
              <HelpOutcomeGrid copy={copy} />
            </section>

            <HelpTopicSection
              id={HELP_SECTION_ANCHORS.concepts}
              title={copy.concepts.title}
              summary={copy.concepts.summary}
              accent="sky"
              icon={<BookOpen className="size-5" />}
              open={openSections.concepts}
              onOpenChange={(open) =>
                setOpenSections((current) => ({ ...current, concepts: open }))
              }
            >
              <HelpWorkflowList
                copy={copy}
                topics={conceptTopics}
                openTopicIds={openTopicIds}
                onToggleTopic={toggleTopic}
              />
            </HelpTopicSection>

            <HelpTopicSection
              id={HELP_SECTION_ANCHORS.howTo}
              title={copy.howTo.title}
              summary={copy.howTo.summary}
              accent="violet"
              icon={<CircleHelp className="size-5" />}
              open={openSections.howTo}
              onOpenChange={(open) =>
                setOpenSections((current) => ({ ...current, howTo: open }))
              }
            >
              <HelpWorkflowList
                copy={copy}
                topics={howToTopics}
                openTopicIds={openTopicIds}
                onToggleTopic={toggleTopic}
              />
            </HelpTopicSection>

            <HelpTopicSection
              id={HELP_SECTION_ANCHORS.tools}
              title={copy.tools.title}
              summary={copy.tools.summary}
              accent="muted"
              icon={<Wrench className="size-5" />}
              open={openSections.tools}
              onOpenChange={(open) =>
                setOpenSections((current) => ({ ...current, tools: open }))
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                {toolTopics.map((definition) => {
                  const topic = resolveHelpTopic(definition, copy);
                  return (
                    <article
                      key={topic.id}
                      id={definition.anchor}
                      className={`${HELP_SURFACE[definition.accent]} p-5`}
                    >
                      <h3 className="text-lg font-semibold text-white">{topic.title}</h3>
                      <p className={`mt-3 ${HELP_BODY_CLASS}`}>{topic.body}</p>
                      {topic.cta && definition.primaryCta ? (
                        <Link
                          href={definition.primaryCta}
                          className={`mt-4 ${HELP_SECONDARY_CTA_CLASS}`}
                        >
                          {topic.cta}
                        </Link>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {legacyNote ? (
                <div className="mt-4">
                  <HelpTopicSection
                    id={legacyNote.anchor}
                    title={resolveHelpTopic(legacyNote, copy).title}
                    summary={resolveHelpTopic(legacyNote, copy).summary}
                    accent="muted"
                    defaultOpen={false}
                  >
                    <p className={HELP_BODY_CLASS}>
                      {resolveHelpTopic(legacyNote, copy).body}
                    </p>
                  </HelpTopicSection>
                </div>
              ) : null}
            </HelpTopicSection>

            <HelpTopicSection
              id={HELP_SECTION_ANCHORS.troubleshoot}
              title={copy.troubleshoot.title}
              summary={copy.troubleshoot.summary}
              accent="muted"
              icon={<CircleHelp className="size-5" />}
              open={openSections.troubleshoot}
              onOpenChange={(open) =>
                setOpenSections((current) => ({ ...current, troubleshoot: open }))
              }
            >
              <HelpWorkflowList
                copy={copy}
                topics={troubleshootTopics}
                openTopicIds={openTopicIds}
                onToggleTopic={toggleTopic}
              />
            </HelpTopicSection>

            <section
              id={HELP_SECTION_ANCHORS.ask}
              data-help-ask-destination=""
              className={HELP_ASK_DESTINATION_CLASS}
            >
              <div className={HELP_ASK_DESTINATION_HEADER_CLASS}>
                <span className={HELP_ICON_WELL.green} aria-hidden="true">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-success)]">
                    {copy.askAthenaCta}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/70">
                    {copy.askAthenaHint}
                  </p>
                </div>
              </div>
              <div className={HELP_ASK_INNER_CLASS}>
                <GettingStartedConversationPanel
                  title={copy.conversationTitle}
                  description={copy.conversationDescription}
                  placeholder={copy.conversationPlaceholder}
                  inputLabel={copy.conversationInputLabel}
                  examplePrompts={[
                    copy.example1,
                    copy.example2,
                    copy.example3,
                    copy.example4,
                    copy.example5,
                    copy.example6,
                  ]}
                  chrome={conversationChrome.chrome}
                  clearLabel={conversationChrome.clearLabel}
                  submitLabel={conversationChrome.submitLabel}
                  emptyStateTitle={conversationChrome.emptyStateTitle}
                  readOnlyNotice={conversationChrome.readOnlyNotice}
                  open={conversationOpen}
                  onOpenChange={setConversationOpen}
                />
              </div>
            </section>

            <section className={`${HELP_SURFACE.orange} p-8 text-center`}>
              <h2 className="text-3xl font-semibold">{copy.footer.title}</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
                {copy.footer.body}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/" className={HELP_PRIMARY_CTA_CLASS}>
                  {copy.footer.homeCta}
                </Link>
                <Link href="/identity" className={HELP_SECONDARY_CTA_CLASS}>
                  {copy.footer.brainCta}
                </Link>
              </div>
            </section>
          </div>
        )}
      </div>

      <aside className="mt-8 hidden lg:block">
        <HelpCenterTopicNav copy={copy} />
      </aside>
    </div>
  );
}

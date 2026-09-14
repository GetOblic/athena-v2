/**
 * Resolves Help Center catalog rows against localized messages.
 */

import {
  HELP_CENTER_TOPICS,
  type HelpTopicDefinition,
  type HelpTopicId,
  getHelpTopic,
  listSearchableHelpTopics,
} from "@/lib/gettingStarted/helpCenterCatalog";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type HelpCenterCopy = TenantMessages["gettingStarted"];

export type HelpResolvedTopic = {
  id: HelpTopicId;
  definition: HelpTopicDefinition;
  title: string;
  summary: string;
  body: string;
  steps: string[];
  expect: string | null;
  trouble: string | null;
  cta: string | null;
  why: string | null;
  what: string | null;
  keywords: string;
  searchText: string;
};

type TopicCopy = {
  title?: string;
  summary?: string;
  body?: string;
  expect?: string;
  trouble?: string;
  cta?: string;
  why?: string;
  what?: string;
  keywords?: string;
  steps?: Record<string, string>;
};

function readCopyPath(copy: HelpCenterCopy, path: readonly string[]): TopicCopy {
  let current: unknown = copy;
  for (const key of path) {
    if (!current || typeof current !== "object") return {};
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === "object" ? (current as TopicCopy) : {};
}

function orderedSteps(steps: Record<string, string> | undefined): string[] {
  if (!steps) return [];
  return Object.keys(steps)
    .sort()
    .map((key) => steps[key])
    .filter((value): value is string => Boolean(value));
}

export function resolveHelpTopic(
  definition: HelpTopicDefinition,
  copy: HelpCenterCopy,
): HelpResolvedTopic {
  const topicCopy = readCopyPath(copy, definition.copyPath);
  const steps = orderedSteps(topicCopy.steps);
  const title = topicCopy.title ?? "";
  const summary = topicCopy.summary ?? "";
  const body = topicCopy.body ?? "";
  const expect = topicCopy.expect ?? null;
  const trouble = topicCopy.trouble ?? null;
  const cta = topicCopy.cta ?? null;
  const why = topicCopy.why ?? null;
  const what = topicCopy.what ?? null;
  const keywords = topicCopy.keywords ?? "";
  const searchText = [
    title,
    summary,
    body,
    why,
    what,
    expect,
    trouble,
    keywords,
    ...steps,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return {
    id: definition.id,
    definition,
    title,
    summary,
    body,
    steps,
    expect,
    trouble,
    cta,
    why,
    what,
    keywords,
    searchText,
  };
}

export function resolveHelpTopics(copy: HelpCenterCopy): HelpResolvedTopic[] {
  return HELP_CENTER_TOPICS.map((topic) => resolveHelpTopic(topic, copy));
}

export function resolveHelpTopicById(
  id: string,
  copy: HelpCenterCopy,
): HelpResolvedTopic | null {
  const definition = getHelpTopic(id);
  return definition ? resolveHelpTopic(definition, copy) : null;
}

export function filterHelpTopics(
  copy: HelpCenterCopy,
  query: string,
): HelpResolvedTopic[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];

  return listSearchableHelpTopics()
    .map((topic) => resolveHelpTopic(topic, copy))
    .filter((topic) => topic.searchText.includes(normalized));
}

export function helpTopicMatchesQuery(
  topic: HelpResolvedTopic,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return topic.searchText.includes(normalized);
}

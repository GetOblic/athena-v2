/**
 * Shared prompt trust wrappers and truncation helpers for scoped conversations.
 */

import type { AthenaConversationContextSection } from "@/services/athenaConversation/athenaConversationTypes";

export const UNTRUSTED_OPEN = "<<<UNTRUSTED_SOURCE_DATA>>>";
export const UNTRUSTED_CLOSE = "<<<END_UNTRUSTED_SOURCE_DATA>>>";
export const TRUSTED_OPEN = "<<<ATHENA_CONTEXT>>>";
export const TRUSTED_CLOSE = "<<<END_ATHENA_CONTEXT>>>";

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
}

export function wrapUntrusted(
  label: string,
  content: string,
  sectionType?: string,
): string {
  return [
    UNTRUSTED_OPEN,
    `trust: untrusted_source_data`,
    ...(sectionType ? [`type: ${sectionType}`] : []),
    `label: ${label}`,
    content,
    UNTRUSTED_CLOSE,
  ].join("\n");
}

export function wrapContext(
  label: string,
  trust: string,
  content: string,
  sectionType?: string,
): string {
  return [
    TRUSTED_OPEN,
    `trust: ${trust}`,
    ...(sectionType ? [`type: ${sectionType}`] : []),
    `label: ${label}`,
    content,
    TRUSTED_CLOSE,
  ].join("\n");
}

export function renderContextSection(
  section: AthenaConversationContextSection,
): string {
  if (section.trust === "untrusted_source_data") {
    return wrapUntrusted(section.label, section.content, section.type);
  }
  return wrapContext(
    section.label,
    section.trust,
    section.content,
    section.type,
  );
}

export function joinPromptParts(parts: string[]): string {
  return parts.filter((part) => part.trim()).join("\n\n");
}

/**
 * Truncates lowest-priority sections first when assembled context exceeds budget.
 * Higher keepPriority = truncated earlier.
 */
export function buildBoundedContextBlock(input: {
  meta: string;
  missing: string;
  sections: AthenaConversationContextSection[];
  keepPriority: (type: string) => number;
  maxChars: number;
}): string {
  type MutableSection = {
    keepPriority: number;
    section: AthenaConversationContextSection;
  };

  const mutableSections: MutableSection[] = input.sections.map((section) => ({
    keepPriority: input.keepPriority(section.type),
    section: { ...section },
  }));

  const renderAll = () =>
    joinPromptParts([
      input.meta,
      input.missing,
      ...mutableSections.map((item) => renderContextSection(item.section)),
    ]);

  let joined = renderAll();
  if (joined.length <= input.maxChars) {
    return joined;
  }

  const truncateOrder = mutableSections
    .map((item, index) => ({ index, keepPriority: item.keepPriority }))
    .sort((a, b) => b.keepPriority - a.keepPriority);

  for (const { index } of truncateOrder) {
    joined = renderAll();
    if (joined.length <= input.maxChars) {
      break;
    }

    const overflow = joined.length - input.maxChars;
    const current = mutableSections[index];
    const content = current.section.content;
    if (content.length <= overflow + 80) {
      mutableSections[index] = {
        ...current,
        section: { ...current.section, content: "" },
      };
      continue;
    }

    const keep = Math.max(0, content.length - overflow - 40);
    mutableSections[index] = {
      ...current,
      section: {
        ...current.section,
        content: `${content.slice(0, keep)}\n\n[truncated]`,
      },
    };
  }

  joined = renderAll();
  if (joined.length > input.maxChars) {
    joined = `${joined.slice(0, Math.max(0, input.maxChars - 24))}\n\n[context truncated]`;
  }
  return joined;
}

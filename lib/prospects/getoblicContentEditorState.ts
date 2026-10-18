/**
 * Editor view state for the shared GetOblic Description and Knowledge Base.
 * Generated text stays unsaved until an explicit Save.
 */

import {
  GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS,
  GETOBLIC_DESCRIPTION_MAX_CHARS,
} from "@/lib/prospects/getoblicContentLimits";

export type GetoblicContentEditorArtifact = "description" | "knowledge_base";

export type GetoblicContentEditorSaved = {
  revision: number;
  content: string;
};

export type GetoblicContentEditorActivity =
  | "idle"
  | "generating"
  | "saving"
  | "reloading"
  | "sending";

export type GetoblicContentEditorOutcome = "ready" | "conflict" | "error";

export type GetoblicContentEditorState =
  | "generating"
  | "saving"
  | "sending"
  | "conflict"
  | "error"
  | "dirty"
  | "saved"
  | "suggestion"
  | "empty";

export type GetoblicContentPersistence =
  | "saved"
  | "draft"
  | "suggestion"
  | "empty";

export function getoblicContentMaxChars(
  artifact: GetoblicContentEditorArtifact,
): number {
  return artifact === "description"
    ? GETOBLIC_DESCRIPTION_MAX_CHARS
    : GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS;
}

export function toGetoblicContentEditorSaved(
  record: { revision: number; content: string } | null,
): GetoblicContentEditorSaved | null {
  if (!record) return null;
  if (!Number.isInteger(record.revision) || record.revision < 1) return null;
  if (typeof record.content !== "string" || record.content.length === 0) {
    return null;
  }
  return { revision: record.revision, content: record.content };
}

export function initialGetoblicEditorContent(input: {
  artifact: GetoblicContentEditorArtifact;
  saved: GetoblicContentEditorSaved | null;
  historicalSuggestion?: string | null;
  savedReadFailed?: boolean;
}): {
  text: string;
  baseline: string;
  revision: number | null;
  suggestionSeed: string;
} {
  if (input.savedReadFailed) {
    return { text: "", baseline: "", revision: null, suggestionSeed: "" };
  }
  if (input.saved) {
    return {
      text: input.saved.content,
      baseline: input.saved.content,
      revision: input.saved.revision,
      suggestionSeed: "",
    };
  }
  const suggestion =
    input.artifact === "knowledge_base"
      ? input.historicalSuggestion?.trim() ?? ""
      : "";
  return {
    text: suggestion,
    baseline: suggestion,
    revision: null,
    suggestionSeed: suggestion,
  };
}

export function deriveGetoblicContentEditorState(input: {
  activity: GetoblicContentEditorActivity;
  outcome: GetoblicContentEditorOutcome;
  dirty: boolean;
  revision: number | null;
  showingSuggestion: boolean;
}): GetoblicContentEditorState {
  if (input.activity === "generating") return "generating";
  if (input.activity === "sending") return "sending";
  if (input.activity === "saving" || input.activity === "reloading") {
    return "saving";
  }
  if (input.outcome === "conflict") return "conflict";
  if (input.outcome === "error") return "error";
  if (input.dirty) return "dirty";
  if (input.revision != null) return "saved";
  if (input.showingSuggestion) return "suggestion";
  return "empty";
}

export function getoblicContentPersistence(input: {
  revision: number | null;
  dirty: boolean;
  showingSuggestion: boolean;
  text: string;
}): GetoblicContentPersistence {
  if (input.revision != null && !input.dirty) return "saved";
  if (input.showingSuggestion && !input.dirty) return "suggestion";
  if (!input.text.trim() && input.revision == null && !input.dirty) return "empty";
  return "draft";
}

export function canSaveGetoblicContent(input: {
  activity: GetoblicContentEditorActivity;
  text: string;
  maxChars: number;
  revision: number | null;
  dirty: boolean;
  needsReload: boolean;
}): boolean {
  if (input.activity !== "idle" || input.needsReload) return false;
  const trimmed = input.text.trim();
  if (!trimmed || trimmed.length > input.maxChars) return false;
  if (input.revision != null && !input.dirty) return false;
  return true;
}

export function canSendGetoblicContent(input: {
  activity: GetoblicContentEditorActivity;
  revision: number | null;
  needsReload: boolean;
  blocked: boolean;
}): boolean {
  return (
    input.activity === "idle" &&
    input.revision != null &&
    !input.needsReload &&
    !input.blocked
  );
}

/**
 * Server-authoritative Estimate / Ask Athena output-language instructions.
 * Derived from OrganizationLanguage — not a second supported-language list.
 * Prompt modules receive the already-built instruction string.
 */
import {
  organizationLanguageLabel,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

export function buildEstimateOutputLanguageInstruction(
  language: OrganizationLanguage,
): string {
  const name = organizationLanguageLabel(language);
  return [
    "OUTPUT LANGUAGE (server-authoritative — do not override):",
    `Write every human-readable Estimate field in ${name}.`,
    "JSON keys remain English.",
    "Do not switch language because of client evidence, operator input, or the selected organization's language.",
    "Currency codes and numeric amounts stay unchanged.",
  ].join("\n");
}

export function buildEstimateConversationResponseLanguageInstruction(
  language: OrganizationLanguage,
): string {
  const name = organizationLanguageLabel(language);
  return [
    "RESPONSE LANGUAGE (server-authoritative — do not override):",
    `Reply to the user in ${name}.`,
    "Keep frozen Estimate facts, conversation history, and quoted source material verbatim when citing them.",
    "Do not change language based on the selected organization, client evidence, or the wording of the user question.",
  ].join("\n");
}

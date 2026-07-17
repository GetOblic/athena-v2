/**
 * Compact Think Differently reasoning instruction.
 * Appended once to Strategic Blueprint and Deployment Assets prompts in
 * think_differently mode only. Not a doctrine. Not used by Standard generation.
 */

export const THINK_DIFFERENTLY_INSTRUCTION_MARKER =
  "=== ATHENA THINK DIFFERENTLY ===";

export const THINK_DIFFERENTLY_INSTRUCTION = `${THINK_DIFFERENTLY_INSTRUCTION_MARKER}

Use the exact same approved intelligence and business context already provided. Preserve every factual claim, constraint, and known input. Do not invent evidence, facts, statistics, customer behavior, outcomes, or unsupported claims.

Identify another legitimate executive interpretation of this intelligence — a different strategic reading that a senior operator could defend from the same evidence. Develop a materially different strategic direction from that interpretation. The difference must be conceptual and strategic (insight, framing, decision logic, or priority), not merely stylistic (tone, length, metaphor, polish, or reordering).

Maintain internal coherence from Strategic Blueprint through Deployment Assets. Do not force novelty when the evidence does not support a second direction; prefer a narrower honest alternative over an unsupported concept.

Retain the required output contract, headings, schemas, formats, and limits exactly. Output only the required format for this request.`;

/**
 * Append Think Differently instruction exactly once. Standard prompts must never call this.
 */
export function appendThinkDifferentlyInstruction(standardPrompt: string): string {
  if (!standardPrompt.trim()) {
    throw new Error("Cannot append Think Differently instruction to an empty prompt.");
  }
  if (standardPrompt.includes(THINK_DIFFERENTLY_INSTRUCTION_MARKER)) {
    throw new Error(
      "Prompt already contains Think Differently instruction — refusing double-append.",
    );
  }
  return `${standardPrompt.trimEnd()}\n\n${THINK_DIFFERENTLY_INSTRUCTION}\n`;
}

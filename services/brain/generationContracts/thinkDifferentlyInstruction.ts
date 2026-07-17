/**
 * Compact Think Differently reasoning instruction.
 * Appended once to Strategic Blueprint and Deployment Assets prompts in
 * think_differently mode only. Not a doctrine. Not used by Standard generation.
 */

export const THINK_DIFFERENTLY_INSTRUCTION_MARKER =
  "=== ATHENA THINK DIFFERENTLY ===";

export const THINK_DIFFERENTLY_INSTRUCTION = `${THINK_DIFFERENTLY_INSTRUCTION_MARKER}

Use the exact same approved intelligence and business context already provided. Preserve every factual claim, constraint, and known input. Do not invent evidence, facts, statistics, customer behavior, outcomes, or unsupported claims.

Before selecting the alternative strategy, deliberately question the assumptions that naturally lead to the most obvious recommendation. Consider whether another experienced executive, looking at exactly the same intelligence, could reasonably prioritize a different constraint, objective, leverage point, competitive advantage, or definition of the core problem.

Identify the strongest defensible alternative executive interpretation of the intelligence. Do not select the second-most-obvious variation of the original direction. Develop a materially different strategic thesis from the same evidence.

The difference must alter at least one substantive executive dimension, such as:

- what the true business problem is;
- what opportunity should be prioritized;
- which leverage point creates the greatest value;
- which audience or stakeholder matters most;
- how the business should position itself;
- what sequence of actions should be taken;
- what commercial or operational objective should lead the strategy.

Do not treat a change in wording, channel, content format, tactic, example, tone, metaphor, emphasis, or ordering as a different strategy.

Maintain one coherent alternative direction from Strategic Blueprint through Deployment Assets. Deployment Assets must operationalize the new strategic thesis rather than returning to the most obvious or previously favored strategy.

Do not force novelty when the evidence does not support a second direction. Prefer a narrower honest alternative over an unsupported concept.

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

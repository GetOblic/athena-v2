import { DOCTRINE_APPEND_DELIMITER } from "./constants";
import { appendBreakthroughDoctrine } from "./doctrine";
import { sha256Text } from "./hash";

export type PromptIntegrityResult = {
  ok: boolean;
  standardPromptSha256: string;
  breakthroughPromptSha256: string;
  doctrineHash: string;
  errors: string[];
};

/**
 * Verify Breakthrough === Standard + single doctrine append (byte-exact rebuild).
 */
export function verifyBreakthroughAppendIntegrity(input: {
  standardPrompt: string;
  breakthroughPrompt: string;
  doctrineText: string;
  doctrineHash: string;
}): PromptIntegrityResult {
  const errors: string[] = [];
  const standardPromptSha256 = sha256Text(input.standardPrompt);
  const breakthroughPromptSha256 = sha256Text(input.breakthroughPrompt);

  if (input.standardPrompt.includes("ATHENA BREAKTHROUGH DOCTRINE")) {
    errors.push("Standard prompt must not contain Breakthrough doctrine.");
  }

  const expected = appendBreakthroughDoctrine(
    input.standardPrompt,
    input.doctrineText,
  );
  if (expected !== input.breakthroughPrompt) {
    errors.push(
      "Breakthrough prompt is not Standard + single doctrine append.",
    );
  }

  const delimiterCount = input.breakthroughPrompt.split(
    DOCTRINE_APPEND_DELIMITER,
  ).length - 1;
  if (delimiterCount !== 1) {
    errors.push(
      `Expected exactly one doctrine delimiter; found ${delimiterCount}.`,
    );
  }

  return {
    ok: errors.length === 0,
    standardPromptSha256,
    breakthroughPromptSha256,
    doctrineHash: input.doctrineHash,
    errors,
  };
}

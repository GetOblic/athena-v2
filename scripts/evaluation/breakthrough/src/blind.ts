import { randomInt } from "node:crypto";
import type { PilotAssetKey } from "./constants";
import { PILOT_ASSET_META } from "./constants";

export type BlindPair = {
  pairId: string;
  prospectId: string;
  assetKey: PilotAssetKey;
  displayName: string;
  outputA: string;
  outputB: string;
  /** Revealed only after scoring — stored in sidecar metadata, not blind pack. */
  mapping: {
    A: "standard" | "breakthrough";
    B: "standard" | "breakthrough";
  };
};

export function buildBlindPair(input: {
  prospectId: string;
  assetKey: PilotAssetKey;
  standardText: string;
  breakthroughText: string;
}): BlindPair {
  const standardFirst = randomInt(2) === 0;
  const mapping = standardFirst
    ? ({ A: "standard", B: "breakthrough" } as const)
    : ({ A: "breakthrough", B: "standard" } as const);

  return {
    pairId: `${input.prospectId}__${input.assetKey}`,
    prospectId: input.prospectId,
    assetKey: input.assetKey,
    displayName: PILOT_ASSET_META[input.assetKey].displayName,
    outputA: standardFirst ? input.standardText : input.breakthroughText,
    outputB: standardFirst ? input.breakthroughText : input.standardText,
    mapping,
  };
}

export function formatBlindMarkdown(pair: BlindPair): string {
  return `# Blind review pair

Prospect: \`${pair.prospectId}\`
Asset: **${pair.displayName}** (\`${pair.assetKey}\`)

Score Output A and Output B without knowing the generation mode.
Do not infer mode from style alone.

## Output A

${pair.outputA || "_(empty)_"}

## Output B

${pair.outputB || "_(empty)_"}

## Scorecard (fill after reading)

- relevance A/B (1-5):
- originality A/B (1-5):
- ownability A/B (1-5):
- strategic depth A/B (1-5):
- clarity A/B (1-5):
- commercial usefulness A/B (1-5):
- brand fit A/B (1-5):
- memorability A/B (1-5):
- execution feasibility A/B (1-5):
- factual grounding A/B (1-5):
- contract compliance A/B (1-5):
- material fabrication A/B (Y/N):
- interchangeable A/B (Y/N):
- cliché dependence A/B (Y/N):
- deployable this week A/B (Y/N):
- preferred: A / B / Tie
- strategic difference explainable (Y/N):
- style-only difference (Y/N):
- notes:
`;
}

/**
 * Clipboard / Continue payload for one Social Planner daily asset.
 * Pure and deterministic. No I/O. Omits internal generation metadata.
 */

import type {
  SocialCalendarAssetV1,
  SocialPlannerProductionSpec,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  humanizeSocialPlannerToken,
  socialPlannerAssetTypeLabel,
  socialPlannerObjectiveLabel,
  socialPlannerPlatformLabel,
} from "@/components/socialPlanner/socialPlannerLabels";

function trimmed(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

function labeledLine(label: string, value: string | null | undefined): string | null {
  const next = trimmed(value);
  return next ? `${label}: ${next}` : null;
}

function joinLines(lines: Array<string | null | undefined>): string | null {
  const present = lines
    .map((line) => (typeof line === "string" ? line.trimEnd() : ""))
    .filter((line) => line.length > 0);
  return present.length > 0 ? present.join("\n") : null;
}

function joinBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => block?.trim())
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

function serializeSlides(
  slides: Extract<SocialPlannerProductionSpec, { kind: "carousel" }>["slides"],
): string | null {
  const blocks = slides.map((slide) =>
    joinLines([
      `Slide ${slide.index}`,
      labeledLine("Headline", slide.headline),
      labeledLine("Body", slide.body),
      labeledLine("Visual Note", slide.visualNote),
    ]),
  );
  return joinBlocks(blocks) || null;
}

function serializeShots(
  shots: Extract<SocialPlannerProductionSpec, { kind: "video" }>["shotPlan"],
): string | null {
  const blocks = shots.map((shot) =>
    joinLines([
      `Shot ${shot.shot}`,
      labeledLine("Action", shot.action),
      labeledLine("Framing", shot.framing),
    ]),
  );
  return joinBlocks(blocks) || null;
}

function serializeSections(
  sections: Extract<SocialPlannerProductionSpec, { kind: "document" }>["sections"],
): string | null {
  const blocks = sections.map((section, index) =>
    joinLines([
      `Section ${index + 1}`,
      labeledLine("Heading", section.heading),
      labeledLine("Content", section.content),
    ]),
  );
  return joinBlocks(blocks) || null;
}

function serializeOptions(options: string[] | null): string | null {
  if (!options || options.length === 0) return null;
  const lines = options.map((option) => trimmed(option)).filter(Boolean);
  if (lines.length === 0) return null;
  return ["Options", ...lines.map((option) => `- ${option}`)].join("\n");
}

export function serializeSocialCalendarProductionSpec(
  spec: SocialPlannerProductionSpec,
): string {
  if (spec.kind === "static") {
    return joinBlocks([
      "Production Specification",
      joinLines([
        labeledLine("Kind", "Static"),
        labeledLine("Image Prompt", spec.imagePrompt),
        labeledLine("Composition", spec.composition),
        labeledLine("Setting", spec.setting),
        labeledLine("Subjects", spec.subjects),
        labeledLine("Overlay Guidance", spec.overlayCopyGuidance),
        labeledLine("Visual Tone", spec.visualTone),
      ]),
    ]);
  }

  if (spec.kind === "carousel") {
    return joinBlocks([
      "Production Specification",
      joinLines([
        labeledLine("Kind", "Carousel"),
        labeledLine("Visual Direction", spec.visualDirection),
        labeledLine("Slide Count", String(spec.slideCount)),
      ]),
      serializeSlides(spec.slides),
      labeledLine("Design Prompt", spec.designPrompt),
    ]);
  }

  if (spec.kind === "video") {
    return joinBlocks([
      "Production Specification",
      joinLines([
        labeledLine("Kind", "Video"),
        labeledLine("Video Concept", spec.videoConcept),
        labeledLine("Hook", spec.hook),
      ]),
      joinBlocks(["Scene / Shot Plan", serializeShots(spec.shotPlan)]),
      joinLines([
        labeledLine("Dialogue", spec.dialogue),
        labeledLine("Environment", spec.environment),
        labeledLine("Production Direction", spec.productionDirection),
        labeledLine("Visual Tone", spec.visualTone),
      ]),
    ]);
  }

  if (spec.kind === "document") {
    return joinBlocks([
      "Production Specification",
      joinLines([
        labeledLine("Kind", "Document"),
        labeledLine("Document Concept", spec.documentConcept),
      ]),
      serializeSections(spec.sections),
      labeledLine("Design Prompt", spec.designPrompt),
    ]);
  }

  return joinBlocks([
    "Production Specification",
    joinLines([
      labeledLine("Kind", "Engagement"),
      labeledLine("Engagement Type", humanizeSocialPlannerToken(spec.engagementType)),
      labeledLine("Prompt", spec.prompt),
    ]),
    serializeOptions(spec.options),
    labeledLine("Visual Support", spec.visualSupport),
  ]);
}

export function serializeSocialCalendarAsset(asset: SocialCalendarAssetV1): string {
  const opportunityLabels = asset.calendarAnchors
    .map((anchor) => trimmed(anchor.label))
    .filter((label): label is string => Boolean(label));

  return joinBlocks([
    joinLines([
      labeledLine("Date", asset.date),
      labeledLine("Weekday", asset.weekday),
      labeledLine("Asset Type", socialPlannerAssetTypeLabel(asset.assetType)),
      labeledLine("Objective", socialPlannerObjectiveLabel(asset.primaryObjective)),
      labeledLine("Audience", asset.audience),
      labeledLine("Concept", asset.concept),
      labeledLine("Hook", asset.hook),
      opportunityLabels.length > 0
        ? labeledLine("Calendar Opportunity", opportunityLabels.join("; "))
        : null,
    ]),
    serializeSocialCalendarProductionSpec(asset.productionSpec),
    trimmed(asset.socialCopy)
      ? joinLines(["Social Copy", trimmed(asset.socialCopy)])
      : null,
    labeledLine("CTA", asset.cta),
    asset.recommendedPlatforms.length > 0
      ? labeledLine(
          "Recommended Platforms",
          asset.recommendedPlatforms.map(socialPlannerPlatformLabel).join(", "),
        )
      : null,
  ]);
}

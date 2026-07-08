import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";

export type BlueprintReadinessBadge = {
  key: string;
  label: string;
};

export function formatBlueprintReadiness(
  blueprint: Pick<
    AthenaAssetBlueprint,
    "image_prompt" | "pdf_prompt" | "social_prompt" | "notes"
  >,
): BlueprintReadinessBadge[] {
  const badges: BlueprintReadinessBadge[] = [];

  if (blueprint.pdf_prompt?.trim()) {
    badges.push({ key: "pdf", label: "PDF" });
  }

  if (blueprint.image_prompt?.trim()) {
    badges.push({ key: "image", label: "Image" });
  }

  if (blueprint.social_prompt?.trim()) {
    badges.push({ key: "social", label: "Carousel / Social" });
  }

  const notes = blueprint.notes?.trim() ?? "";
  if (notes) {
    const lower = notes.toLowerCase();
    if (lower.includes("lead magnet") || lower.includes("lead-magnet")) {
      badges.push({ key: "lead-magnet", label: "Lead Magnet" });
    } else if (lower.includes("email")) {
      badges.push({ key: "email", label: "Email" });
    } else if (!badges.some((badge) => badge.key === "social")) {
      badges.push({ key: "other", label: "Other" });
    }
  }

  return badges;
}

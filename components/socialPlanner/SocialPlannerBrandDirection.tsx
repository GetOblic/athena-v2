import {
  formatBlueprintBrandDirectionSuffix,
  type BlueprintBrandDirectionInput,
} from "@/services/identity/blueprintBrandDirection";
import { SOCIAL_DETAIL_BRAND_DIRECTION_SURFACE } from "@/lib/socialPlanner/socialPlannerDetailPresentation";

/**
 * Presentation adapter for Athena's existing Brand Direction contract.
 * Renders the canonical formatter output; invents nothing.
 */
export function SocialPlannerBrandDirection({
  brandDirection = null,
}: {
  brandDirection?: BlueprintBrandDirectionInput | null;
}) {
  const text = formatBlueprintBrandDirectionSuffix(brandDirection);
  if (!text) return null;

  return (
    <div
      data-brand-direction=""
      className={SOCIAL_DETAIL_BRAND_DIRECTION_SURFACE}
    >
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/70">
        {text}
      </p>
    </div>
  );
}

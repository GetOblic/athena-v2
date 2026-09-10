import {
  formatConfidenceLabel,
  formatConfidencePercent,
} from "@/lib/confidenceDisplay";
import {
  PERSONA_CONFIDENCE_BAND_CLASS,
  PERSONA_CONFIDENCE_DETAIL_RING_PX,
  PERSONA_CONFIDENCE_RING_COLOR,
  PERSONA_CONFIDENCE_RING_PX,
  PERSONA_CONFIDENCE_SURFACE,
} from "@/lib/personas/personaPagePresentation";
import { isPersonaLibraryConfidenceAvailable } from "@/lib/personas/personaLibrarySort";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type PersonaConfidenceScoreProps = {
  confidence: number | null | undefined;
  messages: TenantMessages["personas"];
  size?: "list" | "detail";
};

function localizedBandLabel(
  confidence: number,
  messages: TenantMessages["personas"],
): string {
  const token = formatConfidenceLabel(confidence);
  if (token === "High") return messages.executive.confidenceHigh;
  if (token === "Medium") return messages.executive.confidenceMedium;
  return messages.executive.confidenceLow;
}

export function PersonaConfidenceScore({
  confidence,
  messages,
  size = "list",
}: PersonaConfidenceScoreProps) {
  if (!isPersonaLibraryConfidenceAvailable(confidence)) {
    return null;
  }

  const value = confidence;
  const band = formatConfidenceLabel(value);
  const percent = formatConfidencePercent(value);
  const ringPx =
    size === "detail"
      ? PERSONA_CONFIDENCE_DETAIL_RING_PX
      : PERSONA_CONFIDENCE_RING_PX;

  return (
    <div
      className={PERSONA_CONFIDENCE_SURFACE[band]}
      data-persona-confidence="ring"
      data-persona-confidence-size={size}
    >
      <div className="flex items-center gap-2">
        <div
          className="relative grid shrink-0 place-items-center"
          style={{
            width: ringPx,
            height: ringPx,
          }}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${PERSONA_CONFIDENCE_RING_COLOR[band]} ${value}%, rgba(255,255,255,0.08) 0)`,
            }}
          />
          <div className="absolute inset-[4px] rounded-full bg-[var(--athena-card)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums text-white">
            {percent}
          </p>
          <p className={PERSONA_CONFIDENCE_BAND_CLASS[band]}>
            {localizedBandLabel(value, messages)}
          </p>
        </div>
      </div>
      <span className="sr-only">
        {messages.executive.confidence} {percent}
      </span>
    </div>
  );
}

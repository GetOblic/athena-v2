import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  PROSPECT_COMPLETENESS_BAND_CLASS,
  PROSPECT_COMPLETENESS_RING_COLOR,
  PROSPECT_COMPLETENESS_RING_PX,
  PROSPECT_COMPLETENESS_SURFACE,
} from "@/lib/prospects/prospectDetailPresentation";
import { PROSPECT_COMPLETENESS_LIST_RING_PX } from "@/lib/prospects/prospectLibraryPresentation";
import {
  prospectCompletenessBand,
  type ProspectCompletenessBand,
} from "@/services/prospects/prospectIntelligenceCompleteness";

type ProspectScoreCopy = TenantMessages["prospects"]["score"];

type ProspectIntelligenceScoreProps = {
  score: number;
  messages: ProspectScoreCopy;
  size?: "list" | "detail";
};

function bandLabel(
  band: ProspectCompletenessBand,
  messages: ProspectScoreCopy,
): string {
  if (band === "Low") return messages.bandLow;
  if (band === "Medium") return messages.bandMedium;
  if (band === "Strong") return messages.bandStrong;
  return messages.bandExcellent;
}

export function ProspectIntelligenceScore({
  score,
  messages,
  size = "detail",
}: ProspectIntelligenceScoreProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const band = prospectCompletenessBand(clamped);
  const percent = `${clamped}%`;
  const ringPx =
    size === "list"
      ? PROSPECT_COMPLETENESS_LIST_RING_PX
      : PROSPECT_COMPLETENESS_RING_PX;

  return (
    <div
      className={PROSPECT_COMPLETENESS_SURFACE[band]}
      data-prospect-completeness="ring"
      data-prospect-completeness-band={band}
      data-prospect-completeness-size={size}
      title={messages.help}
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
              background: `conic-gradient(${PROSPECT_COMPLETENESS_RING_COLOR[band]} ${clamped}%, rgba(255,255,255,0.08) 0)`,
            }}
          />
          <div className="absolute inset-[4px] rounded-full bg-[var(--athena-card)]" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
            {messages.label}
          </p>
          <p className="text-sm font-semibold tabular-nums text-white">
            {percent}
          </p>
          <p className={PROSPECT_COMPLETENESS_BAND_CLASS[band]}>
            {bandLabel(band, messages)}
          </p>
        </div>
      </div>
      <span className="sr-only">
        {messages.label} {percent}. {messages.help}
      </span>
    </div>
  );
}

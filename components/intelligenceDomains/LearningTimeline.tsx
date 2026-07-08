import type {
  DomainLearningEvent,
  DomainLearningEventKind,
} from "@/services/intelligenceDomainService";

type LearningTimelineProps = {
  events: DomainLearningEvent[];
};

const BADGE_STYLES: Record<DomainLearningEventKind, string> = {
  import: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  analysis: "border-purple-500/30 bg-purple-500/10 text-purple-200",
  regeneration: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  update: "border-white/15 bg-white/5 text-white/70",
  opportunity: "border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 text-[var(--athena-orange)]",
  briefing: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  blueprint: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  intelligence: "border-sky-500/30 bg-sky-500/10 text-sky-200",
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LearningTimeline({ events }: LearningTimelineProps) {
  return (
    <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <h2 className="text-xl font-semibold">Learning Timeline</h2>
      <p className="mt-2 text-sm text-white/45">
        Recent signals Athena used to understand this domain.
      </p>

      {events.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/45">
          Athena will populate this timeline as more discussions are analyzed
          and domain intelligence is refreshed.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${BADGE_STYLES[event.kind]}`}
                  >
                    {event.title}
                  </span>
                </div>
                <div className="text-xs text-white/35">
                  {formatTimestamp(event.timestamp)}
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                {event.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

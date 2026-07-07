import type { DomainLearningEvent } from "@/services/intelligenceDomainService";

type LearningTimelineProps = {
  events: DomainLearningEvent[];
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
                <div className="font-medium text-white">{event.title}</div>
                <div className="text-xs text-white/35">
                  {formatTimestamp(event.timestamp)}
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/55">
                {event.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

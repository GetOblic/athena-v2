import type { ConvertState } from "@/lib/home/homeDomainState";
import { HOME_PANEL_SURFACE_CLASS } from "@/lib/home/homePresentation";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type HomeOpportunityPipelineProps = {
  state: ConvertState;
  messages: TenantMessages["dashboard"]["pipeline"];
};

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number | null;
  tone?: "default" | "ready" | "progress" | "attention" | "danger" | "strong";
}) {
  const toneClass =
    tone === "ready"
      ? "text-[var(--athena-success)]"
      : tone === "progress"
        ? "text-[var(--athena-warning)]"
        : tone === "attention"
          ? "text-[var(--athena-warning)]"
          : tone === "danger"
            ? "text-[var(--athena-danger)]"
            : tone === "strong"
              ? "text-sky-200"
              : "text-white";

  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {label}
      </dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function HomeOpportunityPipeline({
  state,
  messages,
}: HomeOpportunityPipelineProps) {
  if (state.kind === "unknown") {
    return (
      <section
        className={HOME_PANEL_SURFACE_CLASS}
        data-home-pipeline="unknown"
      >
        <h2 className="text-lg font-semibold text-white">{messages.title}</h2>
        <p className="mt-3 text-sm leading-6 text-white/50">
          {messages.unavailable}
        </p>
      </section>
    );
  }

  const chips = [
    { key: "new", count: state.newCount ?? 0, label: messages.chipNew },
    {
      key: "reviewing",
      count: state.reviewingCount ?? 0,
      label: messages.chipReviewing,
    },
    {
      key: "followUp",
      count: state.followUpCount ?? 0,
      label: messages.chipFollowUp,
    },
  ].filter((chip) => chip.count > 0);

  return (
    <section className={HOME_PANEL_SURFACE_CLASS} data-home-pipeline="ready">
      <h2 className="text-lg font-semibold text-white">{messages.title}</h2>
      <dl className="mt-5 grid grid-cols-2 gap-5">
        <Metric label={messages.working} value={state.workingCount ?? 0} />
        <Metric
          label={messages.strong}
          value={state.strongCount ?? 0}
          tone="strong"
        />
      </dl>
      <p className="mt-1 text-[11px] text-white/35">{messages.strongHint}</p>

      <div className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {messages.intelligence}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric
            label={messages.ready}
            value={state.readyCount ?? 0}
            tone="ready"
          />
          <Metric
            label={messages.missing}
            value={state.missingCount ?? 0}
            tone="attention"
          />
          <Metric
            label={messages.inProgress}
            value={state.inProgressCount ?? 0}
            tone="progress"
          />
          <Metric
            label={messages.failed}
            value={state.failedCount ?? 0}
            tone="danger"
          />
        </dl>
      </div>

      {chips.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/50"
            >
              {interpolateTenantMessage(chip.label, { count: chip.count })}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

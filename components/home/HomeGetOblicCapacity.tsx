import type { CapacityState } from "@/lib/home/homeDomainState";
import { HOME_PANEL_SURFACE_CLASS } from "@/lib/home/homePresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type HomeGetOblicCapacityProps = {
  state: CapacityState;
  messages: TenantMessages["dashboard"]["capacity"];
};

export function HomeGetOblicCapacity({
  state,
  messages,
}: HomeGetOblicCapacityProps) {
  if (state.kind === "unknown") {
    return (
      <section
        className={HOME_PANEL_SURFACE_CLASS}
        data-home-capacity="unknown"
      >
        <h2 className="text-lg font-semibold text-white">{messages.title}</h2>
        <p className="mt-3 text-sm leading-6 text-white/50">
          {messages.unavailable}
        </p>
      </section>
    );
  }

  if (state.kind === "unconfigured") {
    return (
      <section
        className={HOME_PANEL_SURFACE_CLASS}
        data-home-capacity="unconfigured"
      >
        <h2 className="text-lg font-semibold text-white">{messages.title}</h2>
        <p className="mt-3 text-sm leading-6 text-white/50">
          {messages.unconfigured}
        </p>
      </section>
    );
  }

  const breakdown = [
    state.claiming != null
      ? { key: "claiming", label: messages.claiming, value: state.claiming }
      : null,
    state.linked != null
      ? { key: "linked", label: messages.linked, value: state.linked }
      : null,
    state.remoteMissing != null && state.remoteMissing > 0
      ? {
          key: "remoteMissing",
          label: messages.remoteMissing,
          value: state.remoteMissing,
        }
      : null,
  ].filter((item): item is { key: string; label: string; value: number } =>
    Boolean(item),
  );

  return (
    <section
      className={`${HOME_PANEL_SURFACE_CLASS} bg-[linear-gradient(180deg,rgba(56,189,248,0.06),transparent_62%)]`}
      data-home-capacity="configured"
      data-home-capacity-available={state.available}
    >
      <h2 className="text-lg font-semibold text-white">{messages.title}</h2>
      <dl className="mt-5 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {messages.capacityLabel}
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-white">
            {state.listingCapacity}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {messages.currentlyHeldLabel}
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-white">
            {state.currentlyHeld}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200/70">
            {messages.availableLabel}
          </dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-sky-200">
            {state.available}
          </dd>
        </div>
      </dl>
      {breakdown.length > 0 ? (
        <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/45">
          {breakdown.map((item) => (
            <div key={item.key} className="inline-flex items-center gap-2">
              <dt>{item.label}</dt>
              <dd className="tabular-nums text-white/70">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

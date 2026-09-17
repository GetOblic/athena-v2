import Link from "next/link";
import { Brain, Search, Target, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FreeStarterHome } from "@/components/home/FreeStarterHome";
import { UpgradeCompletionCard } from "@/components/upgrade/UpgradeCompletionCard";
import type { FreeStarterHomeView } from "@/lib/home/freeStarterHome";
import {
  type FreeTrainedCapabilityId,
  type FreeTrainedCapabilityStatus,
  type FreeTrainedHomeView,
} from "@/lib/home/freeTrainedHome";
import {
  HOME_PANEL_SURFACE_CLASS,
  HOME_READINESS_SURFACE_CLASS,
} from "@/lib/home/homePresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

const STATUS_TONE: Record<FreeTrainedCapabilityStatus, string> = {
  available: "text-[var(--athena-orange)]",
  delivered: "text-[var(--athena-success)]",
  processing: "text-[var(--athena-warning)]",
  failed: "text-[var(--athena-danger)]",
};

const STATUS_BAR: Record<FreeTrainedCapabilityStatus, string> = {
  available: "border-l-[var(--athena-orange)]",
  delivered: "border-l-[var(--athena-success)]",
  processing: "border-l-[var(--athena-warning)]",
  failed: "border-l-[var(--athena-danger)]",
};

type FreeTrainedHomeProps = {
  starter: FreeStarterHomeView;
  view: FreeTrainedHomeView;
  messages: TenantMessages;
};

function tractionStageTone(
  statuses: readonly FreeTrainedCapabilityStatus[],
): FreeTrainedCapabilityStatus {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("available")) return "available";
  if (statuses.includes("processing")) return "processing";
  return "delivered";
}

function statusLabel(
  status: FreeTrainedCapabilityStatus,
  copy: TenantMessages["dashboard"]["freeProgression"],
): string {
  if (status === "available") return copy.statusAvailable;
  if (status === "delivered") return copy.statusDelivered;
  if (status === "failed") return copy.statusFailed;
  return copy.statusProcessing;
}

function CapabilityCard({
  title,
  capability,
  copy,
  icon: Icon,
  featured,
}: {
  title: string;
  capability: FreeTrainedHomeView["capabilities"][FreeTrainedCapabilityId];
  copy: TenantMessages["dashboard"]["freeProgression"];
  icon: LucideIcon;
  featured?: boolean;
}) {
  const interactive = Boolean(capability.href);
  const className = `${HOME_READINESS_SURFACE_CLASS} border-l-2 ${STATUS_BAR[capability.status]} ${
    featured ? "ring-1 ring-[rgba(255,102,0,0.18)]" : ""
  } ${interactive ? focusRingClassName : ""}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-xl border border-white/8 bg-white/[0.04] text-white/60">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          {statusLabel(capability.status, copy)}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${STATUS_TONE[capability.status]}`}>
        {capability.statusLine}
      </p>
      {capability.href ? (
        <div className="mt-4 text-sm font-semibold text-[var(--athena-orange)]">
          {capability.ctaLabel} →
        </div>
      ) : null}
    </>
  );

  if (!capability.href) {
    return (
      <article
        data-free-trained-capability={capability.id}
        data-free-trained-status={capability.status}
        className={className}
      >
        {content}
      </article>
    );
  }

  return (
    <Link
      href={capability.href}
      data-free-trained-capability={capability.id}
      data-free-trained-status={capability.status}
      className={className}
    >
      {content}
    </Link>
  );
}

export function FreeTrainedHome({
  starter,
  view,
  messages,
}: FreeTrainedHomeProps) {
  const copy = messages.dashboard.freeProgression;
  const dash = messages.dashboard;
  const primary = view.primaryNext;
  const tractionTone = tractionStageTone([
    view.capabilities.audience.status,
    view.capabilities.advertising.status,
    view.capabilities.social.status,
  ]);
  const starterSection = (
    <div
      data-free-trained-starter={view.starterPlacement}
      className={
        view.starterPlacement === "primary"
          ? "mt-8"
          : `${HOME_PANEL_SURFACE_CLASS} mt-6`
      }
    >
      <FreeStarterHome
        initialView={starter}
        messages={messages}
        variant="section"
      />
    </div>
  );

  return (
    <div
      data-home-surface="free-trained"
      data-free-trained-story={view.story}
      data-home-continuation-prominence={view.continuationProminence ?? "none"}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {messages.dashboard.freeStarter.eyebrow}
      </div>
      <h1 className="mt-4 text-5xl font-semibold tracking-tight">{view.title}</h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
        {view.body}
      </p>

      {primary && primary.mode === "link" && primary.href ? (
        <div className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
            {copy.nextTitle}
          </p>
          <Link
            href={primary.href}
            data-free-trained-primary={primary.id}
            className={`mt-3 inline-flex rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 ${focusRingClassName}`}
          >
            {primary.label}
          </Link>
        </div>
      ) : null}

      {primary?.mode === "starter" ? (
        <div className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
            {copy.nextTitle}
          </p>
          <div data-free-trained-primary="social">{starterSection}</div>
        </div>
      ) : view.starterPlacement === "primary" ? (
        starterSection
      ) : null}

      <section className="mt-10" data-free-trained-progression="">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.progressionTitle}
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
          {copy.progressionIntro}
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Link
            href="/identity"
            data-free-trained-capability="define"
            data-free-trained-status="delivered"
            className={`${HOME_READINESS_SURFACE_CLASS} border-l-2 border-l-[var(--athena-success)] ${focusRingClassName}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-xl border border-white/8 bg-white/[0.04] text-white/60">
                <Brain size={16} aria-hidden="true" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                {copy.statusDelivered}
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-white">
              {dash.define.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--athena-success)]">
              {copy.defineDelivered}
            </p>
            <div className="mt-4 text-sm font-semibold text-[var(--athena-orange)]">
              {copy.defineCta} →
            </div>
          </Link>

          <CapabilityCard
            title={dash.visibility.title}
            capability={view.capabilities.visibility}
            copy={copy}
            icon={Search}
            featured={primary?.id === "visibility"}
          />

          <article
            className={`${HOME_READINESS_SURFACE_CLASS} border-l-2 ${STATUS_BAR[tractionTone]}`}
            data-free-trained-stage="traction"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-xl border border-white/8 bg-white/[0.04] text-white/60">
                <Target size={16} aria-hidden="true" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                {dash.traction.title}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {(
                [
                  ["audience", copy.itemAudience],
                  ["advertising", copy.itemAdvertising],
                  ["social", copy.itemSocial],
                ] as const
              ).map(([id, title]) => {
                const capability = view.capabilities[id];
                const row = (
                  <>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {title}
                      </div>
                      <p
                        className={`mt-1 text-sm leading-6 ${STATUS_TONE[capability.status]}`}
                      >
                        {capability.statusLine}
                      </p>
                    </div>
                    {capability.href ? (
                      <span className="shrink-0 text-sm font-semibold text-[var(--athena-orange)]">
                        {capability.ctaLabel} →
                      </span>
                    ) : null}
                  </>
                );
                const rowClass = `flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 ${
                  primary?.id === id ? "ring-1 ring-[rgba(255,102,0,0.18)]" : ""
                }`;
                if (!capability.href) {
                  return (
                    <div
                      key={id}
                      data-free-trained-capability={id}
                      data-free-trained-status={capability.status}
                      className={rowClass}
                    >
                      {row}
                    </div>
                  );
                }
                return (
                  <Link
                    key={id}
                    href={capability.href}
                    data-free-trained-capability={id}
                    data-free-trained-status={capability.status}
                    className={`${rowClass} ${focusRingClassName}`}
                  >
                    {row}
                  </Link>
                );
              })}
            </div>
          </article>

          <CapabilityCard
            title={dash.convert.title}
            capability={view.capabilities.convert}
            copy={copy}
            icon={Users}
            featured={primary?.id === "convert"}
          />
        </div>
      </section>

      {view.starterPlacement === "after-progression" ? starterSection : null}

      {view.continuation ? (
        <div
          className={
            view.continuationProminence === "elevated" ? "mt-10" : "mt-10 max-w-3xl"
          }
          data-home-continuation={view.continuationProminence}
        >
          <UpgradeCompletionCard {...view.continuation} />
        </div>
      ) : null}
    </div>
  );
}

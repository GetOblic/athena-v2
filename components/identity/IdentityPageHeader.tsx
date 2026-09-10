import type { ReactNode } from "react";

type IdentityPageHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusValue: string;
  lastTrainedLabel: string;
  lastTrainedValue: string;
  knowledgeScore: ReactNode;
};

export function IdentityPageHeader({
  eyebrow,
  title,
  subtitle,
  statusLabel,
  statusValue,
  lastTrainedLabel,
  lastTrainedValue,
  knowledgeScore,
}: IdentityPageHeaderProps) {
  return (
    <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {eyebrow}
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:mt-4 sm:text-5xl">
          {title}
        </h1>

        <p className="mt-3 max-w-3xl text-base leading-7 text-white/50 sm:mt-4">
          {subtitle}
        </p>

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-white/40">{statusLabel}</span>{" "}
            <span className="font-medium text-white/70">{statusValue}</span>
          </div>
          <div>
            <span className="text-white/40">{lastTrainedLabel}</span>{" "}
            <span className="font-medium text-white/70">{lastTrainedValue}</span>
          </div>
        </div>
      </div>

      <div className="w-full shrink-0 lg:w-auto">{knowledgeScore}</div>
    </div>
  );
}

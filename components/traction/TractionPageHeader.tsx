import type { ReactNode } from "react";

type TractionPageHeaderProps = {
  eyebrow: string;
  title: string;
  question?: string;
  subtitle?: string;
  badge?: ReactNode;
  children?: ReactNode;
};

export function TractionPageHeader({
  eyebrow,
  title,
  question,
  subtitle,
  badge,
  children,
}: TractionPageHeaderProps) {
  return (
    <div className="mb-8 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {eyebrow}
        </div>
        {badge}
      </div>
      <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h1>
      {question?.trim() ? (
        <p className="mt-4 max-w-3xl text-lg leading-8 text-white/70">
          {question}
        </p>
      ) : null}
      {subtitle?.trim() ? (
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {subtitle}
        </p>
      ) : null}
      {children}
    </div>
  );
}

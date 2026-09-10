import type { ReactNode } from "react";

type VisibilityPageHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  badge?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function VisibilityPageHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  action,
  children,
}: VisibilityPageHeaderProps) {
  return (
    <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {eyebrow}
          </div>
          {badge}
        </div>
        <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight text-white sm:mt-4 sm:text-5xl">
          {title}
        </h1>
        {subtitle.trim() ? (
          <p className="mt-3 max-w-3xl text-base leading-7 text-white/50 sm:mt-4">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
      {action ? (
        <div className="w-full shrink-0 lg:w-auto">{action}</div>
      ) : null}
    </div>
  );
}

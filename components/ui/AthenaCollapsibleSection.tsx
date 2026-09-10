"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

type AthenaCollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional controlled open state (e.g. open from Discuss with Athena). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional eyebrow above the title */
  eyebrow?: string;
  /** Optional one-line summary shown under the title (especially when collapsed). */
  summary?: string;
  /** Optional meta row under the title (stars, reading time, badges). */
  headerMeta?: ReactNode;
  /** When true, toggle control shows Expand/Collapse labels beside the arrow. */
  showToggleLabel?: boolean;
  toggleLabels?: { expand: string; collapse: string } | null;
  className?: string;
  contentClassName?: string;
  /** Keep a live processing / status badge visible in the header */
  headerAside?: ReactNode;
  /** Optional actions rendered before the chevron. Clicks do not toggle. */
  headerActions?: ReactNode;
  /** Optional mark rendered beside the title. */
  icon?: ReactNode;
  /** Identity page cards use a denser, accent-aware header. Other surfaces stay default. */
  tone?: "default" | "identity" | "intelligence";
  /** Optional tinted icon-container classes (Identity accent system). */
  iconClassName?: string;
  /** Nested diagnostic cards can use a smaller icon well. */
  iconSize?: "lg" | "sm";
  /** Stable section id that stays mounted while the body is collapsed. */
  id?: string;
};

/**
 * Accessible disclosure for large Prospect/Discussion workspace blocks.
 * Uses a real button header — never nests interactive controls inside another button.
 */
export function AthenaCollapsibleSection({
  title,
  children,
  defaultOpen = false,
  open: openControlled,
  onOpenChange,
  eyebrow,
  summary,
  headerMeta,
  showToggleLabel = false,
  toggleLabels = null,
  className = "",
  contentClassName = "",
  headerAside,
  headerActions,
  icon,
  tone = "default",
  iconClassName = "",
  iconSize = "lg",
  id,
}: AthenaCollapsibleSectionProps) {
  const [openUncontrolled, setOpenUncontrolled] = useState(defaultOpen);
  const isControlled = openControlled !== undefined;
  const open = isControlled ? openControlled : openUncontrolled;
  const panelId = useId();
  const polishedTone = tone === "identity" || tone === "intelligence";
  const hasHeaderActions = Boolean(headerActions);
  const iconWellClass =
    iconSize === "sm"
      ? "flex size-8 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4"
      : "flex size-10 shrink-0 items-center justify-center rounded-2xl [&_svg]:size-5";

  function setOpen(next: boolean) {
    if (!isControlled) {
      setOpenUncontrolled(next);
    }
    onOpenChange?.(next);
  }

  const chevron = (
    <span
      className={
        polishedTone
          ? "flex shrink-0 items-center gap-1.5 text-white/50"
          : "shrink-0 self-center text-xs text-white/45"
      }
      aria-hidden="true"
    >
      {polishedTone ? (
        <>
          {showToggleLabel ? (
            <span className="text-[11px] font-medium text-white/40">
              {open
                ? (toggleLabels?.collapse ?? "▲ Collapse")
                : (toggleLabels?.expand ?? "▼ Expand")}
            </span>
          ) : null}
          <ChevronDown
            className={`size-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </>
      ) : showToggleLabel ? (
        open ? (
          toggleLabels?.collapse ?? "▲ Collapse"
        ) : (
          toggleLabels?.expand ?? "▼ Expand"
        )
      ) : open ? (
        "▲"
      ) : (
        "▼"
      )}
    </span>
  );

  return (
    <section
      id={id}
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] ${polishedTone ? "transition-[border-color,box-shadow] duration-200" : ""} ${className}`}
    >
      <div
        className={
          polishedTone
            ? `flex items-stretch justify-between ${hasHeaderActions ? "flex-wrap" : ""}`
            : `flex items-start justify-between gap-4 px-6 py-5 sm:px-8 ${hasHeaderActions ? "flex-wrap" : ""}`
        }
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={
            polishedTone
              ? "flex min-h-[72px] min-w-0 flex-1 items-center gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] sm:min-h-[76px] sm:px-7"
              : "flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
          }
          aria-expanded={open}
          aria-controls={panelId}
        >
          {icon ? (
            <span
              className={
                polishedTone
                  ? `${iconWellClass} ${iconClassName}`
                  : "flex size-7 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/55"
              }
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                {eyebrow}
              </div>
            ) : null}
            <h2
              className={
                polishedTone
                  ? `text-lg font-semibold tracking-tight text-white sm:text-xl ${eyebrow ? "mt-1.5" : ""}`
                  : `text-xl font-semibold text-white ${eyebrow ? "mt-2" : ""}`
              }
            >
              {title}
            </h2>
            {headerMeta ? <div className="mt-2">{headerMeta}</div> : null}
            {summary ? (
              <p
                className={
                  polishedTone
                    ? "mt-1 line-clamp-2 text-[13px] leading-5 text-white/45 sm:line-clamp-1 sm:text-sm"
                    : "mt-2 line-clamp-2 text-sm leading-6 text-white/55"
                }
              >
                {summary}
              </p>
            ) : null}
          </div>
          {hasHeaderActions ? null : chevron}
        </button>
        {hasHeaderActions ? (
          <div
            className={
              polishedTone
                ? "order-3 flex w-full min-w-0 flex-wrap items-center gap-2 px-5 pb-3 sm:order-none sm:w-auto sm:flex-none sm:px-2 sm:pb-0"
                : "order-3 flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:order-none sm:w-auto"
            }
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {headerActions}
          </div>
        ) : null}
        {hasHeaderActions ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={
              polishedTone
                ? "order-2 flex shrink-0 items-center px-4 text-white/50 transition-colors duration-200 hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] sm:order-none sm:pr-7"
                : "order-2 shrink-0 self-center text-xs text-white/45 sm:order-none"
            }
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={title}
          >
            {chevron}
          </button>
        ) : null}
        {headerAside ? (
          <div
            className={
              polishedTone
                ? "shrink-0 self-center pr-5 pt-1 sm:pr-7"
                : "shrink-0 pt-1"
            }
          >
            {headerAside}
          </div>
        ) : null}
      </div>

      {open ? (
        <div
          id={panelId}
          className={`border-t border-white/10 px-6 pb-8 pt-6 sm:px-8 ${contentClassName}`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

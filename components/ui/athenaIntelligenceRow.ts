/**
 * Shared outline for clickable intelligence list rows.
 * Matches executive card outline values; applies to data rows only.
 */
export const ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS =
  "border border-[rgba(255,102,0,0.18)] hover:border-[rgba(255,102,0,0.35)] focus-visible:border-[rgba(255,102,0,0.35)] focus-visible:outline-none";

/** Interactive children that must not trigger duplicate row navigation. */
export function isInteractiveListRowTarget(
  target: EventTarget | null,
): boolean {
  if (
    !target ||
    typeof (target as { closest?: unknown }).closest !== "function"
  ) {
    return false;
  }

  return Boolean(
    (target as Element).closest(
      "a,button,input,select,textarea,label,[role='button']",
    ),
  );
}

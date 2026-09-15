/**
 * Presentation-only visibility for the Prospect-detail GetOblic Release action.
 * Pure helper: no React, no browser APIs, no database, no client directive.
 * Does not change claim, release, or conversion domain semantics.
 */

export function shouldShowGetOblicListingReleaseAction(input: {
  relationshipStatus: string | null | undefined;
  conversionStatus: "none" | "active" | "reversed";
}): boolean {
  if (input.conversionStatus === "active") {
    return false;
  }
  return (
    input.relationshipStatus === "claiming" ||
    input.relationshipStatus === "linked"
  );
}

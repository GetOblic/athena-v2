/**
 * PDF presentation rule for the known system-generated Estimate guidance.
 * Stored draft and issued appendix text is not rewritten.
 * A section is omitted only when its heading is the English seed heading
 * and its body is one of the two server-authored guidance disclaimers.
 */

import {
  CLIENT_QUOTE_APPENDIX_HEADINGS,
  collapseClientQuoteWhitespace,
} from "@/services/clientQuote/clientQuoteSeed";
import {
  ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
  ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK,
} from "@/services/estimate/estimatePackageNormalization";

const INTERNAL_GUIDANCE_BODIES = new Set([
  collapseClientQuoteWhitespace(ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED),
  collapseClientQuoteWhitespace(ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK),
]);

export function isInternalEstimateGuidanceAppendixSection(section: {
  heading: string;
  body: string;
}): boolean {
  if (section.heading.trim() !== CLIENT_QUOTE_APPENDIX_HEADINGS.guidance) {
    return false;
  }
  return INTERNAL_GUIDANCE_BODIES.has(collapseClientQuoteWhitespace(section.body));
}

export function clientQuotePdfVisibleAppendixSections<
  T extends { heading: string; body: string },
>(sections: readonly T[]): T[] {
  return sections.filter(
    (section) => !isInternalEstimateGuidanceAppendixSection(section),
  );
}

import {
  SEO_REPORT_DISCLAIMER,
  SEO_TECHNICAL_REPORT_DISCLAIMER,
} from "@/services/seo/seoReportTypes";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export function prospectSafeDisclaimerBody(input: {
  persisted: string | null | undefined;
  messages: TenantMessages;
  generationType: "intelligence" | "technical";
}): string {
  const copy = input.messages.seo.prospectPdf;
  const persisted = String(input.persisted ?? "").trim();
  if (persisted === SEO_REPORT_DISCLAIMER) {
    return copy.disclaimerIntelligence;
  }
  if (persisted === SEO_TECHNICAL_REPORT_DISCLAIMER) {
    return copy.disclaimerTechnical;
  }
  if (persisted) {
    return persisted;
  }
  return input.generationType === "technical"
    ? copy.disclaimerTechnical
    : copy.disclaimerIntelligence;
}

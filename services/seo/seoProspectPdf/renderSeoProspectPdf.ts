import { getTenantMessages } from "@/lib/tenantI18n/getTenantMessages";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import {
  isSeoTechnicalPackage,
  type SeoReportPackage,
} from "@/services/seo/seoReportTypes";
import { loadSeoProspectPdfBrandAssets } from "@/services/seo/seoProspectPdf/loadSeoProspectPdfBrandAssets";
import { renderSeoProspectPdfShell } from "@/services/seo/seoProspectPdf/seoProspectPdfShell";
import { buildTechnicalHealthPdfModel } from "@/services/seo/seoProspectPdf/technicalHealthPdfAdapter";
import { buildVisibilityStrategyPdfModel } from "@/services/seo/seoProspectPdf/visibilityStrategyPdfAdapter";
import type {
  SeoProspectPdfBrandAssets,
  SeoProspectPdfParties,
} from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";

export async function renderSeoProspectPdf(input: {
  pkg: SeoReportPackage;
  parties: SeoProspectPdfParties;
  language: OrganizationLanguage;
  reportDateIso: string;
  brand?: SeoProspectPdfBrandAssets;
}): Promise<Buffer> {
  const brand =
    input.brand ??
    (await loadSeoProspectPdfBrandAssets(input.parties.sender.organizationId));
  const messages = getTenantMessages(input.language);
  const model = isSeoTechnicalPackage(input.pkg)
    ? buildTechnicalHealthPdfModel({
        pkg: input.pkg,
        messages,
        language: input.language,
        reportDateIso: input.reportDateIso,
      })
    : buildVisibilityStrategyPdfModel({
        pkg: input.pkg,
        messages,
        language: input.language,
        reportDateIso: input.reportDateIso,
      });

  return renderSeoProspectPdfShell({
    model,
    parties: input.parties,
    brand,
    messages,
  });
}

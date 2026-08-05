"use client";

import { WebsiteAnalyzedPagesList } from "@/components/websiteLearning/WebsiteAnalyzedPagesList";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import type { SeoWebsitePagesAnalyzed } from "@/services/seo/seoReportTypes";
import { emptySeoWebsitePagesAnalyzed } from "@/services/seo/seoWebsitePagesSnapshot";

type SeoWebsitePagesAnalyzedSectionProps = {
  inventory: SeoWebsitePagesAnalyzed | null | undefined;
};

export function SeoWebsitePagesAnalyzedSection({
  inventory,
}: SeoWebsitePagesAnalyzedSectionProps) {
  const snapshot = inventory ?? emptySeoWebsitePagesAnalyzed();
  const pageCount =
    snapshot.pages.length > 0
      ? snapshot.pages.length
      : snapshot.pagesAnalyzedCount;
  const countLabel = `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;

  return (
    <AthenaCollapsibleSection
      title="Website Pages Analyzed"
      defaultOpen={false}
      showToggleLabel
      summary={countLabel}
      contentClassName="space-y-4"
    >
      <WebsiteAnalyzedPagesList
        pages={snapshot.pages}
        emptyMessage="No website page inventory was captured for this report. Run Website Deep Scrape on Athena Brain, then regenerate SEO Intelligence."
      />
    </AthenaCollapsibleSection>
  );
}

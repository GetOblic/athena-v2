"use client";

import type { ReactNode } from "react";
import { WebsiteAnalyzedPagesList } from "@/components/websiteLearning/WebsiteAnalyzedPagesList";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import type { SeoWebsitePagesAnalyzed } from "@/services/seo/seoReportTypes";
import { emptySeoWebsitePagesAnalyzed } from "@/services/seo/seoWebsitePagesSnapshot";

export type SeoWebsitePagesAnalyzedChrome = {
  title?: string;
  pageCountOne?: string;
  pageCountMany?: string;
  emptyMessage?: string;
  untitledPage?: string;
  expand?: string;
  collapse?: string;
};

type SeoWebsitePagesAnalyzedSectionProps = {
  inventory: SeoWebsitePagesAnalyzed | null | undefined;
  chrome?: SeoWebsitePagesAnalyzedChrome | null;
  icon?: ReactNode;
  iconClassName?: string;
  className?: string;
  tone?: "default" | "intelligence";
};

export function SeoWebsitePagesAnalyzedSection({
  inventory,
  chrome,
  icon,
  iconClassName,
  className,
  tone = "default",
}: SeoWebsitePagesAnalyzedSectionProps) {
  const snapshot = inventory ?? emptySeoWebsitePagesAnalyzed();
  const pageCount =
    snapshot.pages.length > 0
      ? snapshot.pages.length
      : snapshot.pagesAnalyzedCount;
  const countTemplate =
    pageCount === 1
      ? (chrome?.pageCountOne ?? "{count} page")
      : (chrome?.pageCountMany ?? "{count} pages");
  const countLabel = countTemplate.includes("{count}")
    ? countTemplate.replace("{count}", String(pageCount))
    : `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;

  return (
    <AthenaCollapsibleSection
      title={chrome?.title ?? "Website Pages Analyzed"}
      defaultOpen={false}
      showToggleLabel={tone === "default"}
      toggleLabels={
        chrome?.expand && chrome?.collapse
          ? { expand: chrome.expand, collapse: chrome.collapse }
          : null
      }
      summary={countLabel}
      contentClassName="space-y-4"
      icon={icon}
      iconClassName={iconClassName}
      className={className}
      tone={tone}
    >
      <WebsiteAnalyzedPagesList
        pages={snapshot.pages}
        emptyMessage={
          chrome?.emptyMessage ??
          "No website page inventory was captured for this report. Run Website Deep Scrape on Athena Brain, then regenerate SEO Intelligence."
        }
        untitledLabel={chrome?.untitledPage}
      />
    </AthenaCollapsibleSection>
  );
}

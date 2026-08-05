/**
 * Shared Deep Website Intelligence page inventory list.
 * Used by Athena Brain (Identity) and SEO Intelligence report provenance.
 */

export type WebsiteAnalyzedPageListItem = {
  title: string | null;
  url: string;
  pageType: string | null;
};

type WebsiteAnalyzedPagesListProps = {
  pages: WebsiteAnalyzedPageListItem[];
  emptyMessage?: string;
};

export function WebsiteAnalyzedPagesList({
  pages,
  emptyMessage = "No website pages were available as evidence.",
}: WebsiteAnalyzedPagesListProps) {
  if (pages.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/55">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {pages.map((page) => (
        <li
          key={page.url}
          className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
        >
          <div className="text-sm font-medium text-white/80">
            {page.title?.trim() || "Untitled page"}
          </div>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all text-xs text-[var(--athena-orange)] underline-offset-2 hover:underline"
          >
            {page.url}
          </a>
          {page.pageType?.trim() ? (
            <div className="mt-1 text-xs text-white/40">{page.pageType}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

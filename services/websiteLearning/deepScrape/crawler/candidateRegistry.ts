/**
 * In-memory candidate registry for priority upgrades during a crawl.
 * Does not persist HTML or page bodies.
 */

import {
  compareRankedCandidates,
  crawleeForefrontForScore,
  scoreDeepScrapeCandidate,
  strongerProvenance,
  type DiscoveryProvenance,
  type RankedUrlCandidate,
} from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";

export type CandidateRegistryEntry = RankedUrlCandidate & {
  enqueued: boolean;
  forefront: boolean;
  priorityUpgraded: boolean;
};

export class DeepScrapeCandidateRegistry {
  private readonly entries = new Map<string, CandidateRegistryEntry>();
  private pageCapSkips = 0;
  private priorityUpgrades = 0;
  private rejectedBeforeFetch = 0;

  get size(): number {
    return this.entries.size;
  }

  getEntry(url: string): CandidateRegistryEntry | null {
    return this.entries.get(url) ?? null;
  }

  list(): CandidateRegistryEntry[] {
    return [...this.entries.values()].sort(compareRankedCandidates);
  }

  observe(input: {
    url: string;
    rootUrl: string;
    provenance: DiscoveryProvenance;
    anchorText?: string | null;
  }): {
    ranked: RankedUrlCandidate;
    upgraded: boolean;
    created: boolean;
  } {
    const ranked = scoreDeepScrapeCandidate({
      url: input.url,
      rootUrl: input.rootUrl,
      provenance: input.provenance,
      anchorText: input.anchorText,
      sameDomain: true,
    });
    const prior = this.entries.get(ranked.normalizedUrl);
    if (!prior) {
      const entry: CandidateRegistryEntry = {
        ...ranked,
        enqueued: false,
        forefront: crawleeForefrontForScore(ranked.totalScore),
        priorityUpgraded: false,
      };
      this.entries.set(ranked.normalizedUrl, entry);
      if (ranked.rejectedBeforeFetch) this.rejectedBeforeFetch += 1;
      return { ranked: entry, upgraded: false, created: true };
    }

    const nextProvenance = strongerProvenance(
      prior.provenance,
      ranked.provenance,
    );
    const rescored = scoreDeepScrapeCandidate({
      url: ranked.normalizedUrl,
      rootUrl: input.rootUrl,
      provenance: nextProvenance,
      anchorText: ranked.anchorText ?? prior.anchorText,
      sameDomain: true,
    });
    const upgraded =
      nextProvenance !== prior.provenance ||
      rescored.totalScore > prior.totalScore;
    if (upgraded) {
      this.priorityUpgrades += 1;
      this.entries.set(ranked.normalizedUrl, {
        ...prior,
        ...rescored,
        enqueued: prior.enqueued,
        forefront: crawleeForefrontForScore(rescored.totalScore),
        priorityUpgraded: true,
        inPrimaryNavigation:
          nextProvenance === "primary_navigation" || prior.inPrimaryNavigation,
        inSecondaryNavigation:
          nextProvenance === "secondary_navigation" ||
          prior.inSecondaryNavigation,
        inFooterNavigation:
          nextProvenance === "footer_navigation" || prior.inFooterNavigation,
      });
    }
    return {
      ranked: this.entries.get(ranked.normalizedUrl)!,
      upgraded,
      created: false,
    };
  }

  markEnqueued(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    entry.enqueued = true;
  }

  recordPageCapSkip(): void {
    this.pageCapSkips += 1;
  }

  summary(acceptedByProvenance: Record<string, number> = {}) {
    const list = this.list();
    const byProvenance: Record<string, number> = {};
    for (const entry of list) {
      byProvenance[entry.provenance] =
        (byProvenance[entry.provenance] ?? 0) + 1;
    }
    const scores = list.map((entry) => entry.totalScore);
    scores.sort((a, b) => b - a);
    return {
      candidatesDiscovered: list.length,
      primaryNavigationCandidates: byProvenance.primary_navigation ?? 0,
      sitemapCandidates: byProvenance.sitemap ?? 0,
      contentLinkCandidates: byProvenance.content_link ?? 0,
      candidatesRejectedBeforeFetch: this.rejectedBeforeFetch,
      priorityUpgrades: this.priorityUpgrades,
      pageCapSkips: this.pageCapSkips,
      scoreDistribution: {
        max: scores[0] ?? 0,
        p50: scores[Math.floor(scores.length / 2)] ?? 0,
        min: scores[scores.length - 1] ?? 0,
      },
      topCandidates: list.slice(0, 15).map((entry) => ({
        path: entry.arborescence.normalizedPath,
        score: entry.totalScore,
        provenance: entry.provenance,
        pageType: entry.pageType,
        factors: entry.factors.slice(0, 6),
      })),
      candidatesByProvenance: byProvenance,
      acceptedByProvenance,
      priorityMateriallyChangedOrder:
        this.priorityUpgrades > 0 ||
        (byProvenance.primary_navigation ?? 0) > 0,
    };
  }
}

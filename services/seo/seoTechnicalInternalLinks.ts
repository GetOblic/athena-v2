/**
 * Bounded internal-link evidence packaging and recommendation edge validation.
 * AI may polish anchors/rationale; it must not invent unsupported link edges.
 */

import type { SeoTechnicalDeterministicEvidence } from "@/services/seo/seoTechnicalAnalyzer";
import type { SeoTechnicalInternalLinkRecommendation } from "@/services/seo/seoReportTypes";

export type SeoTechnicalLinkEdgeSample = {
  sourceUrl: string;
  destinationUrl: string;
  anchor: string | null;
  provenance: string | null;
};

function normalizeUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export function corpusUrlKeys(
  evidence: SeoTechnicalDeterministicEvidence,
): Set<string> {
  return new Set(evidence.pages.map((page) => normalizeUrlKey(page.url)));
}

export function evidencedLinkEdgeKeys(
  evidence: SeoTechnicalDeterministicEvidence,
): Set<string> {
  const keys = new Set<string>();
  for (const edge of evidence.internalLinks.linkEdgeSamples) {
    keys.add(
      `${normalizeUrlKey(edge.sourceUrl)}→${normalizeUrlKey(edge.destinationUrl)}`,
    );
  }
  return keys;
}

/**
 * Keep only recommended links where both ends are in the analyzed corpus and
 * deterministic sample evidence already establishes the source→destination edge.
 */
export function filterEvidenceBackedRecommendedLinks(
  recommendedLinks: SeoTechnicalInternalLinkRecommendation[],
  evidence: SeoTechnicalDeterministicEvidence,
): {
  kept: SeoTechnicalInternalLinkRecommendation[];
  rejectedUnsupported: number;
} {
  const corpus = corpusUrlKeys(evidence);
  const edges = evidencedLinkEdgeKeys(evidence);
  const kept: SeoTechnicalInternalLinkRecommendation[] = [];
  let rejectedUnsupported = 0;

  for (const link of recommendedLinks) {
    const fromKey = normalizeUrlKey(link.fromUrl);
    const toKey = normalizeUrlKey(link.toUrl);
    const inCorpus = corpus.has(fromKey) && corpus.has(toKey);
    const evidenced = edges.has(`${fromKey}→${toKey}`);
    if (inCorpus && evidenced) {
      kept.push(link);
    } else {
      rejectedUnsupported += 1;
    }
  }

  return { kept, rejectedUnsupported };
}

const REDIRECT_CHAIN_REMEDIATION_PATTERN =
  /\b(optimize|fix|reduce|collapse|shorten|eliminate)\b.{0,40}\bredirect\s*chains?\b|\bredirect\s*chains?\b.{0,40}\b(optimize|fix|reduce|collapse|shorten|eliminate)\b/i;

export function textClaimsRedirectChainRemediation(text: string): boolean {
  return REDIRECT_CHAIN_REMEDIATION_PATTERN.test(text);
}

export function hasRedirectChainRemediationEvidence(
  evidence: SeoTechnicalDeterministicEvidence,
): boolean {
  return evidence.crawl.redirectChainCandidatePages > 0;
}

/**
 * Strip redirect-chain remediation recommendations when only single-hop / none exist.
 * Preserves informational notes that do not recommend chain optimization.
 */
export function filterRedirectRemediationRecommendations(
  recommendations: string[],
  evidence: SeoTechnicalDeterministicEvidence,
): string[] {
  if (hasRedirectChainRemediationEvidence(evidence)) {
    return recommendations;
  }
  return recommendations.filter(
    (item) => !textClaimsRedirectChainRemediation(item),
  );
}

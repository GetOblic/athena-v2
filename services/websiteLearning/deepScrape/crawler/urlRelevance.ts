/**
 * Site-structure-aware URL relevance scoring for Deep Scrape Phase A.
 * Shared by Prospect and Brain — no source-type branches.
 */

import { canonicalizePageUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export const DISCOVERY_PROVENANCES = [
  "primary_navigation",
  "secondary_navigation",
  "footer_navigation",
  "content_link",
  "sitemap",
  "structured_data",
  "redirect_target",
  "unknown",
] as const;

export type DiscoveryProvenance = (typeof DISCOVERY_PROVENANCES)[number];

export type ScoreFactor = {
  reason: string;
  value: number;
};

export type PathArborescence = {
  normalizedPath: string;
  pathDepth: number;
  parentPath: string | null;
  isHomepageChild: boolean;
  hasQueryParams: boolean;
  suspectedTechnicalOrArchive: boolean;
  semanticClass:
    | "homepage"
    | "services"
    | "products"
    | "solutions"
    | "pricing"
    | "training"
    | "about"
    | "team"
    | "faq"
    | "contact"
    | "locations"
    | "testimonials"
    | "case_studies"
    | "portfolio"
    | "policies"
    | "commercial"
    | "evergreen"
    | "other"
    | "invalid";
};

export type RankedUrlCandidate = {
  url: string;
  normalizedUrl: string;
  provenance: DiscoveryProvenance;
  inPrimaryNavigation: boolean;
  inSecondaryNavigation: boolean;
  inFooterNavigation: boolean;
  sameDomain: boolean;
  arborescence: PathArborescence;
  totalScore: number;
  factors: ScoreFactor[];
  pageType: string;
  rejectedBeforeFetch: boolean;
  rejectionReason: string | null;
  anchorText?: string | null;
};

const PROVENANCE_STRENGTH: Record<DiscoveryProvenance, number> = {
  primary_navigation: 100,
  secondary_navigation: 80,
  sitemap: 70,
  structured_data: 65,
  content_link: 50,
  footer_navigation: 40,
  redirect_target: 30,
  unknown: 10,
};

const SEMANTIC_PATH_RULES: Array<{
  type: PathArborescence["semanticClass"];
  pattern: RegExp;
  score: number;
  factor: string;
}> = [
  {
    type: "services",
    pattern:
      /\/(services?|treatments?|procedures?|offerings?|what-we-do)(\/|$)/i,
    score: 45,
    factor: "SEMANTIC_SERVICES_PATH",
  },
  {
    type: "products",
    pattern: /\/(products?|shop|store|catalog)(\/|$)/i,
    score: 45,
    factor: "SEMANTIC_PRODUCTS_PATH",
  },
  {
    type: "solutions",
    pattern: /\/(solutions?|platforms?)(\/|$)/i,
    score: 45,
    factor: "SEMANTIC_SOLUTIONS_PATH",
  },
  {
    type: "pricing",
    pattern: /\/(pricing|plans?|packages?|membership|financing)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_PRICING_PATH",
  },
  {
    type: "training",
    pattern:
      /\/(training|courses?|academy|education|workshops?|classes?)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_TRAINING_PATH",
  },
  {
    type: "about",
    pattern: /\/(about|our-story|who-we-are|company|mission)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_ABOUT_PATH",
  },
  {
    type: "team",
    pattern:
      /\/(team|people|leadership|staff|founders?|providers?|doctors?|practitioners?)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_TEAM_PATH",
  },
  {
    type: "faq",
    pattern: /\/(faq|faqs|questions?|aftercare|policies?)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_FAQ_PATH",
  },
  {
    type: "contact",
    pattern: /\/(contact|get-in-touch|book|booking|schedule|appointments?)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_CONTACT_PATH",
  },
  {
    type: "locations",
    pattern: /\/(locations?|clinics?|studios?|find-us|directions)(\/|$)/i,
    score: 30,
    factor: "SEMANTIC_LOCATION_PATH",
  },
  {
    type: "testimonials",
    pattern: /\/(testimonials?|reviews?|social-proof)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_TESTIMONIALS_PATH",
  },
  {
    type: "case_studies",
    pattern: /\/(case-stud(?:y|ies)|success-stor(?:y|ies)|clients?)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_CASE_STUDIES_PATH",
  },
  {
    type: "portfolio",
    pattern: /\/(portfolio|gallery|work|projects?|before-and-after)(\/|$)/i,
    score: 35,
    factor: "SEMANTIC_PORTFOLIO_PATH",
  },
  {
    type: "commercial",
    pattern: /\/(landing|offer|demo|trial|consult)(\/|$)/i,
    score: 30,
    factor: "SEMANTIC_COMMERCIAL_PATH",
  },
  {
    type: "policies",
    pattern: /\/(privacy|terms|cookie|gdpr|legal)(\/|$)/i,
    score: -40,
    factor: "SEMANTIC_POLICY_PATH",
  },
];

const HARD_REJECT_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  {
    reason: "ATTACHMENT_OR_MEDIA",
    pattern:
      /\/(wp-content\/uploads|wp-includes|wp-json|feed|rss|atom)(\/|$)/i,
  },
  {
    reason: "ATTACHMENT_OR_MEDIA",
    pattern: /\.(pdf|png|jpe?g|gif|webp|svg|mp4|mp3|zip|docx?|xlsx?|pptx?)(\?|$)/i,
  },
  {
    reason: "API_OR_FEED",
    pattern: /\/(api|graphql|rest|json)(\/|$)/i,
  },
  {
    reason: "PROTOCOL_NON_HTTP",
    pattern: /^(mailto|tel|javascript|data):/i,
  },
];

const LOW_VALUE_PATH_PATTERNS: Array<{ reason: string; value: number; pattern: RegExp }> =
  [
    {
      reason: "LOGIN_CART_ACCOUNT_SEARCH",
      value: -60,
      pattern:
        /\/(login|log-in|signin|sign-in|signup|sign-up|register|account|auth|sso|cart|checkout|basket|payment|billing|search|calendar)(\/|$)/i,
    },
    {
      reason: "TAG_CATEGORY_ARCHIVE_PAGINATION",
      value: -50,
      pattern:
        /\/(tag|tags|category|categories|author|archive|archives|page\/\d+)(\/|$)/i,
    },
  ];

const ANCHOR_BOOSTS: Array<{ reason: string; value: number; pattern: RegExp }> = [
  {
    reason: "ANCHOR_SERVICES",
    value: 20,
    pattern:
      /\b(services?|treatments?|procedures?|products?|solutions?|pricing|membership|financing|training|courses?|academy)\b/i,
  },
  {
    reason: "ANCHOR_ABOUT_TEAM",
    value: 15,
    pattern:
      /\b(about|team|providers?|doctors?|practitioners?|locations?|contact|faq|testimonials?|case studies|portfolio|gallery|aftercare)\b/i,
  },
];

export function provenanceStrength(provenance: DiscoveryProvenance): number {
  return PROVENANCE_STRENGTH[provenance] ?? 0;
}

export function strongerProvenance(
  left: DiscoveryProvenance,
  right: DiscoveryProvenance,
): DiscoveryProvenance {
  return provenanceStrength(left) >= provenanceStrength(right) ? left : right;
}

export function buildPathArborescence(url: string): PathArborescence {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const normalizedPath = `/${segments.join("/")}` || "/";
    const pathDepth = segments.length;
    const parentPath =
      pathDepth <= 0
        ? null
        : pathDepth === 1
          ? "/"
          : `/${segments.slice(0, -1).join("/")}`;
    let semanticClass: PathArborescence["semanticClass"] = "other";
    if (pathDepth === 0) semanticClass = "homepage";
    else {
      for (const rule of SEMANTIC_PATH_RULES) {
        if (rule.pattern.test(normalizedPath)) {
          semanticClass = rule.type;
          break;
        }
      }
      if (
        semanticClass === "other" &&
        pathDepth <= 2 &&
        !/\d{4}/.test(normalizedPath)
      ) {
        semanticClass = "evergreen";
      }
    }
    const suspectedTechnicalOrArchive = LOW_VALUE_PATH_PATTERNS.some((entry) =>
      entry.pattern.test(`${normalizedPath}${parsed.search}`),
    );
    return {
      normalizedPath: normalizedPath === "" ? "/" : normalizedPath,
      pathDepth,
      parentPath,
      isHomepageChild: pathDepth === 1,
      hasQueryParams: Boolean(parsed.search && parsed.search.length > 1),
      suspectedTechnicalOrArchive,
      semanticClass,
    };
  } catch {
    return {
      normalizedPath: "/",
      pathDepth: 0,
      parentPath: null,
      isHomepageChild: false,
      hasQueryParams: false,
      suspectedTechnicalOrArchive: true,
      semanticClass: "invalid",
    };
  }
}

export function scoreDeepScrapeCandidate(input: {
  url: string;
  rootUrl: string;
  provenance?: DiscoveryProvenance;
  anchorText?: string | null;
  sameDomain?: boolean;
}): RankedUrlCandidate {
  const provenance = input.provenance ?? "unknown";
  const normalizedUrl = canonicalizePageUrl(input.url) ?? input.url;
  const arborescence = buildPathArborescence(normalizedUrl);
  const factors: ScoreFactor[] = [];
  let rejectedBeforeFetch = false;
  let rejectionReason: string | null = null;

  const hardReject = HARD_REJECT_PATTERNS.find((entry) =>
    entry.pattern.test(normalizedUrl),
  );
  if (hardReject || arborescence.semanticClass === "invalid") {
    rejectedBeforeFetch = true;
    rejectionReason = hardReject?.reason ?? "INVALID_URL";
  }
  if (input.sameDomain === false) {
    rejectedBeforeFetch = true;
    rejectionReason = "CROSS_DOMAIN";
  }

  if (!rejectedBeforeFetch) {
    switch (provenance) {
      case "primary_navigation":
        factors.push({ reason: "PRIMARY_NAVIGATION", value: 100 });
        break;
      case "secondary_navigation":
        factors.push({ reason: "SECONDARY_NAVIGATION", value: 55 });
        break;
      case "footer_navigation":
        factors.push({ reason: "FOOTER_NAVIGATION", value: 10 });
        break;
      case "sitemap":
        factors.push({ reason: "SITEMAP_URL", value: 45 });
        break;
      case "structured_data":
        factors.push({ reason: "STRUCTURED_DATA", value: 40 });
        break;
      case "content_link":
        factors.push({ reason: "CONTENT_BODY_LINK", value: 15 });
        break;
      case "redirect_target":
        factors.push({ reason: "REDIRECT_TARGET", value: 20 });
        break;
      default:
        factors.push({ reason: "UNKNOWN_PROVENANCE", value: 5 });
        break;
    }

    if (arborescence.isHomepageChild) {
      factors.push({ reason: "HOMEPAGE_DIRECT_CHILD", value: 80 });
    }

    if (arborescence.pathDepth === 0) {
      factors.push({ reason: "PATH_DEPTH_0", value: 5 });
      factors.push({ reason: "HOMEPAGE", value: 110 });
    } else if (arborescence.pathDepth === 1) {
      factors.push({ reason: "PATH_DEPTH_1", value: 25 });
    } else if (arborescence.pathDepth === 2) {
      factors.push({ reason: "PATH_DEPTH_2", value: 10 });
    } else {
      factors.push({ reason: "PATH_DEPTH_3_PLUS", value: -15 });
    }

    for (const rule of SEMANTIC_PATH_RULES) {
      if (rule.pattern.test(arborescence.normalizedPath)) {
        factors.push({ reason: rule.factor, value: rule.score });
        break;
      }
    }

    if (arborescence.hasQueryParams) {
      factors.push({ reason: "QUERY_PARAMETERS", value: -25 });
    }

    for (const entry of LOW_VALUE_PATH_PATTERNS) {
      if (entry.pattern.test(arborescence.normalizedPath)) {
        factors.push({ reason: entry.reason, value: entry.value });
      }
    }

    const anchor = (input.anchorText ?? "").trim();
    if (anchor) {
      for (const boost of ANCHOR_BOOSTS) {
        if (boost.pattern.test(anchor)) {
          factors.push({ reason: boost.reason, value: boost.value });
          break;
        }
      }
    }
  }

  const totalScore = rejectedBeforeFetch
    ? -10_000
    : factors.reduce((sum, factor) => sum + factor.value, 0);

  return {
    url: input.url,
    normalizedUrl,
    provenance,
    inPrimaryNavigation: provenance === "primary_navigation",
    inSecondaryNavigation: provenance === "secondary_navigation",
    inFooterNavigation: provenance === "footer_navigation",
    sameDomain: input.sameDomain !== false,
    arborescence,
    totalScore,
    factors,
    pageType:
      arborescence.semanticClass === "invalid"
        ? "invalid"
        : arborescence.semanticClass,
    rejectedBeforeFetch,
    rejectionReason,
    anchorText: input.anchorText ?? null,
  };
}

export function compareRankedCandidates(
  left: RankedUrlCandidate,
  right: RankedUrlCandidate,
): number {
  if (right.totalScore !== left.totalScore) {
    return right.totalScore - left.totalScore;
  }
  return left.normalizedUrl.localeCompare(right.normalizedUrl);
}

/**
 * Rank crawl candidates for queueing. Cap applies to queue size, not acceptance.
 */
export function rankCrawlCandidates(input: {
  urls: Array<{
    url: string;
    provenance?: DiscoveryProvenance;
    anchorText?: string | null;
  }>;
  rootUrl: string;
  maxQueue: number;
}): RankedUrlCandidate[] {
  const byUrl = new Map<string, RankedUrlCandidate>();

  for (const entry of input.urls) {
    const ranked = scoreDeepScrapeCandidate({
      url: entry.url,
      rootUrl: input.rootUrl,
      provenance: entry.provenance,
      anchorText: entry.anchorText,
      sameDomain: true,
    });
    if (ranked.rejectedBeforeFetch) continue;
    const prior = byUrl.get(ranked.normalizedUrl);
    if (!prior) {
      byUrl.set(ranked.normalizedUrl, ranked);
      continue;
    }
    const mergedProvenance = strongerProvenance(
      prior.provenance,
      ranked.provenance,
    );
    if (
      mergedProvenance !== prior.provenance ||
      ranked.totalScore > prior.totalScore
    ) {
      byUrl.set(
        ranked.normalizedUrl,
        scoreDeepScrapeCandidate({
          url: ranked.normalizedUrl,
          rootUrl: input.rootUrl,
          provenance: mergedProvenance,
          anchorText: ranked.anchorText ?? prior.anchorText,
          sameDomain: true,
        }),
      );
    }
  }

  return [...byUrl.values()]
    .sort(compareRankedCandidates)
    .slice(0, Math.max(1, input.maxQueue));
}

export function crawleeForefrontForScore(score: number): boolean {
  // Primary-nav / homepage-child class scores typically clear 150+.
  return score >= 150;
}

/**
 * Deterministic geography → currency resolution for Athena Estimate (V26 L3).
 *
 * Uses TRUSTED Athena evidence only. Never uses operator project guidance.
 * Never calls external FX / market APIs. Never invents geography from TLD alone.
 */

import type { AthenaEstimateCurrencyResolution } from "@/services/estimate/athenaEstimateTypes";
import type { IdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import type { DeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export type EstimateGeoCurrencyResult = {
  geographyLabel: string | null;
  currencyCode: string;
  currencyResolution: AthenaEstimateCurrencyResolution;
  evidenceSource: string | null;
};

export const ESTIMATE_CURRENCY_FALLBACK: EstimateGeoCurrencyResult = {
  geographyLabel: null,
  currencyCode: "USD",
  currencyResolution: "fallback",
  evidenceSource: null,
};

/**
 * Bounded country/region → ISO 4217 mapping (code-controlled).
 * Keys are lowercase aliases matched against trusted text.
 */
export const ESTIMATE_COUNTRY_CURRENCY_MAP: ReadonlyArray<{
  aliases: readonly string[];
  geographyLabel: string;
  currencyCode: string;
}> = [
  {
    aliases: ["united states", "usa", "u.s.", "u.s.a.", "us", "america"],
    geographyLabel: "United States",
    currencyCode: "USD",
  },
  {
    aliases: ["united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales"],
    geographyLabel: "United Kingdom",
    currencyCode: "GBP",
  },
  {
    aliases: ["canada", "canadian"],
    geographyLabel: "Canada",
    currencyCode: "CAD",
  },
  {
    aliases: ["australia", "australian"],
    geographyLabel: "Australia",
    currencyCode: "AUD",
  },
  {
    aliases: ["new zealand"],
    geographyLabel: "New Zealand",
    currencyCode: "NZD",
  },
  {
    aliases: ["israel", "israeli"],
    geographyLabel: "Israel",
    currencyCode: "ILS",
  },
  {
    aliases: ["france", "french"],
    geographyLabel: "France",
    currencyCode: "EUR",
  },
  {
    aliases: ["germany", "german", "deutschland"],
    geographyLabel: "Germany",
    currencyCode: "EUR",
  },
  {
    aliases: ["spain", "spanish", "españa", "espana"],
    geographyLabel: "Spain",
    currencyCode: "EUR",
  },
  {
    aliases: ["italy", "italian", "italia"],
    geographyLabel: "Italy",
    currencyCode: "EUR",
  },
  {
    aliases: ["netherlands", "holland", "dutch"],
    geographyLabel: "Netherlands",
    currencyCode: "EUR",
  },
  {
    aliases: ["belgium", "belgian"],
    geographyLabel: "Belgium",
    currencyCode: "EUR",
  },
  {
    aliases: ["ireland", "irish", "republic of ireland"],
    geographyLabel: "Ireland",
    currencyCode: "EUR",
  },
  {
    aliases: ["portugal", "portuguese"],
    geographyLabel: "Portugal",
    currencyCode: "EUR",
  },
  {
    aliases: ["austria", "austrian"],
    geographyLabel: "Austria",
    currencyCode: "EUR",
  },
  {
    aliases: ["switzerland", "swiss"],
    geographyLabel: "Switzerland",
    currencyCode: "CHF",
  },
  {
    aliases: ["sweden", "swedish"],
    geographyLabel: "Sweden",
    currencyCode: "SEK",
  },
  {
    aliases: ["norway", "norwegian"],
    geographyLabel: "Norway",
    currencyCode: "NOK",
  },
  {
    aliases: ["denmark", "danish"],
    geographyLabel: "Denmark",
    currencyCode: "DKK",
  },
  {
    aliases: ["finland", "finnish"],
    geographyLabel: "Finland",
    currencyCode: "EUR",
  },
  {
    aliases: ["poland", "polish"],
    geographyLabel: "Poland",
    currencyCode: "PLN",
  },
  {
    aliases: ["czech republic", "czechia", "czech"],
    geographyLabel: "Czechia",
    currencyCode: "CZK",
  },
  {
    aliases: ["singapore"],
    geographyLabel: "Singapore",
    currencyCode: "SGD",
  },
  {
    aliases: ["hong kong"],
    geographyLabel: "Hong Kong",
    currencyCode: "HKD",
  },
  {
    aliases: ["japan", "japanese"],
    geographyLabel: "Japan",
    currencyCode: "JPY",
  },
  {
    aliases: ["south korea", "korea", "korean", "republic of korea"],
    geographyLabel: "South Korea",
    currencyCode: "KRW",
  },
  {
    aliases: ["india", "indian"],
    geographyLabel: "India",
    currencyCode: "INR",
  },
  {
    aliases: ["brazil", "brazilian", "brasil"],
    geographyLabel: "Brazil",
    currencyCode: "BRL",
  },
  {
    aliases: ["mexico", "mexican"],
    geographyLabel: "Mexico",
    currencyCode: "MXN",
  },
  {
    aliases: ["argentina", "argentine"],
    geographyLabel: "Argentina",
    currencyCode: "ARS",
  },
  {
    aliases: ["south africa", "rsa"],
    geographyLabel: "South Africa",
    currencyCode: "ZAR",
  },
  {
    aliases: ["united arab emirates", "uae", "dubai", "abu dhabi"],
    geographyLabel: "United Arab Emirates",
    currencyCode: "AED",
  },
  {
    aliases: ["saudi arabia", "ksa"],
    geographyLabel: "Saudi Arabia",
    currencyCode: "SAR",
  },
];

/** Phrases that indicate multi-geo / non-specific reach — never derive currency. */
const AMBIGUOUS_GEO_PATTERNS: readonly RegExp[] = [
  /\bworldwide\b/i,
  /\bglobal\b/i,
  /\binternational\b/i,
  /\bremote[- ]first\b/i,
  /\bonline[- ]only\b/i,
  /\beverywhere\b/i,
  /\bmulti[- ]country\b/i,
  /\bmultiple countries\b/i,
  /\bserving customers worldwide\b/i,
  /\bacross the (world|globe)\b/i,
];

function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isAmbiguousGeographyText(value: string): boolean {
  const text = normalizeEvidenceText(value);
  if (!text) return true;
  return AMBIGUOUS_GEO_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Match a trusted evidence string to a single country mapping.
 * Conservative: ambiguous multi-geo language → no match.
 * Multiple distinct country hits → no match (ambiguous).
 */
export function matchCountryFromTrustedText(
  value: string,
): { geographyLabel: string; currencyCode: string } | null {
  const text = normalizeEvidenceText(value);
  if (!text || isAmbiguousGeographyText(text)) {
    return null;
  }

  const lower = text.toLowerCase();
  const hits: Array<{ geographyLabel: string; currencyCode: string }> = [];

  for (const entry of ESTIMATE_COUNTRY_CURRENCY_MAP) {
    const matched = entry.aliases.some((alias) => {
      if (alias.length <= 3) {
        // Short aliases need word boundaries to avoid false positives (e.g. "us" in "business").
        const re = new RegExp(`\\b${alias.replace(/\./g, "\\.")}\\b`, "i");
        return re.test(text);
      }
      return lower.includes(alias);
    });
    if (matched) {
      hits.push({
        geographyLabel: entry.geographyLabel,
        currencyCode: entry.currencyCode,
      });
    }
  }

  const unique = Array.from(
    new Map(hits.map((hit) => [hit.geographyLabel, hit])).values(),
  );
  if (unique.length !== 1) {
    return null;
  }
  return unique[0] ?? null;
}

/**
 * Domain / TLD alone must never establish geography.
 * Exported for tests — always returns null by design.
 */
export function geographyFromDomainOrTld(urlOrHost: string): null {
  void urlOrHost;
  return null;
}

export type EstimateGeoCurrencyEvidence = {
  /** Free-text geographic_reach from Identity Executive Intelligence. */
  executiveGeographicReach?: string | null;
  /** Deep website contact / address-like trusted text. */
  deepWebsiteContactInformation?: string | null;
  /** Optional structured country if a future org field exposes it. */
  structuredCountry?: string | null;
  /** Optional structured address country. */
  structuredAddressCountry?: string | null;
};

/**
 * Resolve geography + currency from trusted evidence with conservative precedence:
 * 1. structuredCountry / structuredAddressCountry
 * 2. Executive Intelligence geographic_reach
 * 3. Deep website contact_information
 * Else exact USD fallback.
 */
export function resolveEstimateGeoCurrency(
  evidence: EstimateGeoCurrencyEvidence,
): EstimateGeoCurrencyResult {
  const candidates: Array<{ text: string; source: string }> = [];

  if (evidence.structuredCountry?.trim()) {
    candidates.push({
      text: evidence.structuredCountry.trim(),
      source: "structured_country",
    });
  }
  if (evidence.structuredAddressCountry?.trim()) {
    candidates.push({
      text: evidence.structuredAddressCountry.trim(),
      source: "structured_address_country",
    });
  }
  if (evidence.executiveGeographicReach?.trim()) {
    candidates.push({
      text: evidence.executiveGeographicReach.trim(),
      source: "executive_intelligence.geographic_reach",
    });
  }
  if (evidence.deepWebsiteContactInformation?.trim()) {
    candidates.push({
      text: evidence.deepWebsiteContactInformation.trim(),
      source: "deep_website.contact_information",
    });
  }

  for (const candidate of candidates) {
    const match = matchCountryFromTrustedText(candidate.text);
    if (match) {
      return {
        geographyLabel: match.geographyLabel,
        currencyCode: match.currencyCode,
        currencyResolution: "derived",
        evidenceSource: candidate.source,
      };
    }
  }

  return { ...ESTIMATE_CURRENCY_FALLBACK };
}

export function extractGeoEvidenceFromExecutiveIntelligence(
  executive: IdentityExecutiveIntelligence | null | undefined,
): string | null {
  const reach = executive?.business_model?.geographic_reach;
  if (typeof reach !== "string" || !reach.trim()) return null;
  return reach.trim();
}

export function extractGeoEvidenceFromDeepWebsite(
  intelligence: DeepWebsiteIntelligence | null | undefined,
): string | null {
  if (!intelligence) return null;
  const contact =
    intelligence.business_knowledge?.contact_information ||
    intelligence.contact_information ||
    "";
  if (typeof contact === "string" && contact.trim()) {
    return contact.trim();
  }
  return null;
}

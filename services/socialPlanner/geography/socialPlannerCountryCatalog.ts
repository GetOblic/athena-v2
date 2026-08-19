/**
 * Bounded country catalog for Social Planner jurisdiction matching.
 *
 * Mirrors the countries Athena already recognizes in Estimate geo-currency,
 * plus ISO 3166-1 alpha-2 codes and a conservative hemisphere classification.
 * Countries that straddle the equator are hemisphere "unknown".
 *
 * This is not a geocoder and not a worldwide gazetteer.
 */

import type { SocialPlannerHemisphere } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";

export type SocialPlannerCountryEntry = {
  country: string;
  countryCode: string;
  aliases: readonly string[];
  hemisphere: SocialPlannerHemisphere;
};

export const SOCIAL_PLANNER_COUNTRY_CATALOG: readonly SocialPlannerCountryEntry[] =
  [
    {
      country: "United States",
      countryCode: "US",
      aliases: ["united states", "usa", "u.s.", "u.s.a."],
      hemisphere: "northern",
    },
    {
      country: "United Kingdom",
      countryCode: "GB",
      aliases: [
        "united kingdom",
        "uk",
        "u.k.",
        "great britain",
        "britain",
        "england",
        "scotland",
        "wales",
      ],
      hemisphere: "northern",
    },
    {
      country: "Canada",
      countryCode: "CA",
      aliases: ["canada", "canadian"],
      hemisphere: "northern",
    },
    {
      country: "Australia",
      countryCode: "AU",
      aliases: ["australia", "australian"],
      hemisphere: "southern",
    },
    {
      country: "New Zealand",
      countryCode: "NZ",
      aliases: ["new zealand"],
      hemisphere: "southern",
    },
    {
      country: "Israel",
      countryCode: "IL",
      aliases: ["israel", "israeli"],
      hemisphere: "northern",
    },
    {
      country: "France",
      countryCode: "FR",
      aliases: ["france", "french"],
      hemisphere: "northern",
    },
    {
      country: "Germany",
      countryCode: "DE",
      aliases: ["germany", "german", "deutschland"],
      hemisphere: "northern",
    },
    {
      country: "Spain",
      countryCode: "ES",
      aliases: ["spain", "spanish", "españa", "espana"],
      hemisphere: "northern",
    },
    {
      country: "Italy",
      countryCode: "IT",
      aliases: ["italy", "italian", "italia"],
      hemisphere: "northern",
    },
    {
      country: "Netherlands",
      countryCode: "NL",
      aliases: ["netherlands", "holland", "dutch"],
      hemisphere: "northern",
    },
    {
      country: "Belgium",
      countryCode: "BE",
      aliases: ["belgium", "belgian"],
      hemisphere: "northern",
    },
    {
      country: "Ireland",
      countryCode: "IE",
      aliases: ["ireland", "irish", "republic of ireland"],
      hemisphere: "northern",
    },
    {
      country: "Portugal",
      countryCode: "PT",
      aliases: ["portugal", "portuguese"],
      hemisphere: "northern",
    },
    {
      country: "Austria",
      countryCode: "AT",
      aliases: ["austria", "austrian"],
      hemisphere: "northern",
    },
    {
      country: "Switzerland",
      countryCode: "CH",
      aliases: ["switzerland", "swiss"],
      hemisphere: "northern",
    },
    {
      country: "Sweden",
      countryCode: "SE",
      aliases: ["sweden", "swedish"],
      hemisphere: "northern",
    },
    {
      country: "Norway",
      countryCode: "NO",
      aliases: ["norway", "norwegian"],
      hemisphere: "northern",
    },
    {
      country: "Denmark",
      countryCode: "DK",
      aliases: ["denmark", "danish"],
      hemisphere: "northern",
    },
    {
      country: "Finland",
      countryCode: "FI",
      aliases: ["finland", "finnish"],
      hemisphere: "northern",
    },
    {
      country: "Poland",
      countryCode: "PL",
      aliases: ["poland", "polish"],
      hemisphere: "northern",
    },
    {
      country: "Czechia",
      countryCode: "CZ",
      aliases: ["czech republic", "czechia", "czech"],
      hemisphere: "northern",
    },
    {
      country: "Singapore",
      countryCode: "SG",
      aliases: ["singapore"],
      hemisphere: "northern",
    },
    {
      country: "Hong Kong",
      countryCode: "HK",
      aliases: ["hong kong"],
      hemisphere: "northern",
    },
    {
      country: "Japan",
      countryCode: "JP",
      aliases: ["japan", "japanese"],
      hemisphere: "northern",
    },
    {
      country: "South Korea",
      countryCode: "KR",
      aliases: ["south korea", "republic of korea"],
      hemisphere: "northern",
    },
    {
      country: "India",
      countryCode: "IN",
      aliases: ["india", "indian"],
      hemisphere: "northern",
    },
    {
      country: "Brazil",
      countryCode: "BR",
      aliases: ["brazil", "brazilian", "brasil"],
      hemisphere: "unknown",
    },
    {
      country: "Mexico",
      countryCode: "MX",
      aliases: ["mexico", "mexican"],
      hemisphere: "northern",
    },
    {
      country: "Argentina",
      countryCode: "AR",
      aliases: ["argentina", "argentine"],
      hemisphere: "southern",
    },
    {
      country: "South Africa",
      countryCode: "ZA",
      aliases: ["south africa", "rsa"],
      hemisphere: "southern",
    },
    {
      country: "United Arab Emirates",
      countryCode: "AE",
      aliases: ["united arab emirates", "uae"],
      hemisphere: "northern",
    },
    {
      country: "Saudi Arabia",
      countryCode: "SA",
      aliases: ["saudi arabia", "ksa"],
      hemisphere: "northern",
    },
  ];

const COUNTRY_BY_CODE = new Map(
  SOCIAL_PLANNER_COUNTRY_CATALOG.map((entry) => [entry.countryCode, entry]),
);

const STRUCTURED_CODE_ALIASES: Record<string, string> = {
  UK: "GB",
  GBR: "GB",
  USA: "US",
};

export function findSocialPlannerCountryByCode(
  countryCode: string,
): SocialPlannerCountryEntry | null {
  const normalized = countryCode.trim().toUpperCase();
  const mapped = STRUCTURED_CODE_ALIASES[normalized] ?? normalized;
  return COUNTRY_BY_CODE.get(mapped) ?? null;
}

export function findSocialPlannerCountryByLabel(
  country: string,
): SocialPlannerCountryEntry | null {
  const lower = country.trim().toLowerCase();
  if (!lower) return null;
  return (
    SOCIAL_PLANNER_COUNTRY_CATALOG.find(
      (entry) => entry.country.toLowerCase() === lower,
    ) ?? null
  );
}

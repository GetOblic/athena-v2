/**
 * Shared helpers for reading nested master_profile fields into Brain layers.
 */

function readNestedValue(
  profile: Record<string, unknown>,
  path: string[],
): unknown {
  let current: unknown = profile;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function collectStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\n,;|/]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function extractVoiceFromMasterProfile(
  masterProfile: Record<string, unknown> | null,
  expertise: string | null,
): string | null {
  if (!masterProfile) {
    return expertise?.trim() || null;
  }

  for (const key of ["voice", "brand_voice", "tone"]) {
    const value = masterProfile[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const voiceSummary = readNestedValue(masterProfile, ["voice", "summary"]);
  if (typeof voiceSummary === "string" && voiceSummary.trim()) {
    const tone = collectStringArray(readNestedValue(masterProfile, ["voice", "tone"]));
    return tone.length
      ? `${voiceSummary.trim()} (${tone.slice(0, 3).join(", ")})`
      : voiceSummary.trim();
  }

  const personaSummary = readNestedValue(masterProfile, ["persona", "summary"]);
  if (typeof personaSummary === "string" && personaSummary.trim()) {
    return personaSummary.trim();
  }

  return expertise?.trim() || null;
}

export function extractBusinessConstraintsFromMasterProfile(
  masterProfile: Record<string, unknown> | null,
): string[] {
  if (!masterProfile) {
    return [];
  }

  const constraints: string[] = [];
  const topLevelKeys = [
    "constraints",
    "business_constraints",
    "rules",
    "professional_rules",
    "do_not",
  ];

  for (const key of topLevelKeys) {
    constraints.push(...collectStringArray(masterProfile[key]));
  }

  constraints.push(
    ...collectStringArray(readNestedValue(masterProfile, ["expertise", "rules"])),
  );
  constraints.push(
    ...collectStringArray(
      readNestedValue(masterProfile, ["generation_rules", "never_do"]),
    ),
  );

  const alwaysDo = collectStringArray(
    readNestedValue(masterProfile, ["generation_rules", "always_do"]),
  );
  for (const rule of alwaysDo) {
    constraints.push(`Always: ${rule}`);
  }

  return [...new Set(constraints.map((item) => item.trim()).filter(Boolean))];
}

export function extractTerminologyFromMasterProfile(
  masterProfile: Record<string, unknown> | null,
): string[] {
  if (!masterProfile) {
    return [];
  }

  const terms: string[] = [];

  for (const key of ["terminology", "methodology", "keywords"]) {
    terms.push(...collectStringArray(masterProfile[key]));
  }

  terms.push(
    ...collectStringArray(
      readNestedValue(masterProfile, ["expertise", "professional_terms"]),
    ),
  );
  terms.push(
    ...collectStringArray(readNestedValue(masterProfile, ["expertise", "methodologies"])),
  );
  terms.push(
    ...collectStringArray(readNestedValue(masterProfile, ["expertise", "frameworks"])),
  );
  terms.push(
    ...collectStringArray(readNestedValue(masterProfile, ["persona", "positioning"])),
  );

  return [...new Set(terms.map((item) => item.trim()).filter(Boolean))];
}

export function extractAudienceSignalsFromMasterProfile(
  masterProfile: Record<string, unknown> | null,
): {
  primaryAudiences: string[];
  commonObjections: string[];
  commonQuestions: string[];
  offers: string[];
} {
  if (!masterProfile) {
    return {
      primaryAudiences: [],
      commonObjections: [],
      commonQuestions: [],
      offers: [],
    };
  }

  return {
    primaryAudiences: collectStringArray(
      readNestedValue(masterProfile, ["audience", "primary_audiences"]),
    ),
    commonObjections: collectStringArray(
      readNestedValue(masterProfile, ["audience", "common_objections"]),
    ),
    commonQuestions: collectStringArray(
      readNestedValue(masterProfile, ["audience", "common_questions"]),
    ),
    offers: collectStringArray(readNestedValue(masterProfile, ["business", "offers"])),
  };
}

export function extractHomepageLearningFromMasterProfile(
  masterProfile: Record<string, unknown> | null,
): string | null {
  if (!masterProfile) {
    return null;
  }

  for (const key of ["homepage_learning", "homepage"]) {
    const value = masterProfile[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const personaSummary = readNestedValue(masterProfile, ["persona", "summary"]);
  const positioning = collectStringArray(
    readNestedValue(masterProfile, ["persona", "positioning"]),
  );
  const offers = collectStringArray(readNestedValue(masterProfile, ["business", "offers"]));

  const synthesized = [
    typeof personaSummary === "string" ? personaSummary.trim() : "",
    positioning.length ? `Positioning: ${positioning.join("; ")}` : "",
    offers.length ? `Offers: ${offers.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return synthesized || null;
}

/**
 * Canonical homepage intelligence source for all Brain layers.
 * Read from stored master_profile only — never re-fetch the website here.
 */
export function resolveStoredHomepageLearning(input: {
  masterProfile: Record<string, unknown> | null;
}): string | null {
  return extractHomepageLearningFromMasterProfile(input.masterProfile);
}

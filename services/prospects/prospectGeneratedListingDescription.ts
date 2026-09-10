export const GETOBLIC_DESCRIPTION_MAX_CHARS = 4000;

export type ProspectGeneratedListingDescription = {
  description: string;
  generatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function parseProspectGeneratedListingDescription(
  value: unknown,
): ProspectGeneratedListingDescription | null {
  const record = asRecord(value);
  if (!record) return null;

  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  const generatedAt =
    typeof record.generatedAt === "string" ? record.generatedAt.trim() : "";
  if (!description || !generatedAt) return null;
  if (description.length > GETOBLIC_DESCRIPTION_MAX_CHARS) return null;

  return { description, generatedAt };
}

export type StrategicBlueprintArtifact = {
  asset_title: string;
  asset_type: string;
  business_goal: string;
  target_audience: string;
  priority: string;
  estimated_reuse: number;
  image_prompt: string;
  pdf_prompt: string;
  social_prompt: string;
  notes: string;
  asset_objective?: string;
  business_objective?: string;
  buyer_stage?: string;
  primary_pain_point?: string;
  core_message?: string;
  desired_transformation?: string;
  executive_rationale?: string;
  supporting_evidence?: string[];
  sophistication_level?: string;
  strategic_angle?: string;
  production_specs?: Record<string, unknown>;
};

export type StrategicBlueprintValidationResult = {
  valid: boolean;
  errors: string[];
  artifact: StrategicBlueprintArtifact;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function resolveWhyThisAsset(parsed: Record<string, unknown>): string {
  const direct = String(parsed.why_this_asset ?? parsed.whyThisAsset ?? "").trim();
  if (direct) {
    return direct;
  }

  const notesRaw = parsed.notes;
  if (notesRaw && typeof notesRaw === "object" && !Array.isArray(notesRaw)) {
    return String((notesRaw as Record<string, unknown>).whyThisAsset ?? "").trim();
  }

  return "";
}

function resolveNotesText(parsed: Record<string, unknown>): string {
  const notesRaw = parsed.notes;

  if (notesRaw && typeof notesRaw === "object" && !Array.isArray(notesRaw)) {
    const notesObject = notesRaw as Record<string, unknown>;
    const text = String(notesObject.text ?? notesObject.summary ?? "").trim();
    return text;
  }

  return String(notesRaw ?? "").trim();
}

export function normalizeStrategicBlueprintArtifact(
  parsed: Record<string, unknown>,
): StrategicBlueprintArtifact {
  const assetObjective = String(
    parsed.asset_objective ?? parsed.core_message ?? "",
  );
  const businessObjective = String(
    parsed.business_objective ?? parsed.business_goal ?? "",
  );
  const executiveRationale = String(parsed.executive_rationale ?? "");
  const supportingEvidence = asStringArray(parsed.supporting_evidence);
  const sophisticationLevel = String(parsed.sophistication_level ?? "");
  const strategicAngle = String(parsed.strategic_angle ?? "");
  const buyerStage = String(parsed.buyer_stage ?? "");
  const primaryPainPoint = String(parsed.primary_pain_point ?? "");
  const whyThisAsset = resolveWhyThisAsset(parsed);
  const notesText = resolveNotesText(parsed);

  const businessGoal =
    String(parsed.business_goal ?? "").trim() ||
    [assetObjective, businessObjective].filter(Boolean).join("\n\n");

  const targetAudience =
    String(parsed.target_audience ?? "").trim() ||
    [buyerStage, sophisticationLevel].filter(Boolean).join(" — ");

  const notesParts = [
    whyThisAsset ? `Why this asset: ${whyThisAsset}` : "",
    executiveRationale ? `Executive rationale: ${executiveRationale}` : "",
    strategicAngle ? `Strategic angle: ${strategicAngle}` : "",
    primaryPainPoint ? `Primary pain point: ${primaryPainPoint}` : "",
    supportingEvidence.length
      ? `Supporting evidence: ${supportingEvidence.join("; ")}`
      : "",
    notesText,
  ].filter(Boolean);

  return {
    asset_title: String(parsed.asset_title ?? "Strategic Asset"),
    asset_type: String(parsed.asset_type ?? "pdf_guide"),
    business_goal: businessGoal,
    target_audience: targetAudience,
    priority: String(parsed.priority ?? "medium"),
    estimated_reuse: Math.max(1, Math.min(5, Number(parsed.estimated_reuse ?? 3))),
    image_prompt: String(parsed.image_prompt ?? ""),
    pdf_prompt: String(parsed.pdf_prompt ?? ""),
    social_prompt: String(parsed.social_prompt ?? ""),
    notes: notesParts.join("\n\n"),
    asset_objective: assetObjective || undefined,
    business_objective: businessObjective || undefined,
    buyer_stage: buyerStage || undefined,
    primary_pain_point: primaryPainPoint || undefined,
    core_message: String(parsed.core_message ?? "") || undefined,
    desired_transformation: String(parsed.desired_transformation ?? "") || undefined,
    executive_rationale: executiveRationale || undefined,
    supporting_evidence: supportingEvidence.length ? supportingEvidence : undefined,
    sophistication_level: sophisticationLevel || undefined,
    strategic_angle: strategicAngle || undefined,
    production_specs:
      parsed.production_specs && typeof parsed.production_specs === "object"
        ? (parsed.production_specs as Record<string, unknown>)
        : undefined,
  };
}

export function validateStrategicBlueprintArtifact(
  parsed: Record<string, unknown>,
): StrategicBlueprintValidationResult {
  const errors: string[] = [];
  const artifact = normalizeStrategicBlueprintArtifact(parsed);

  if (!String(parsed.asset_title ?? artifact.asset_title).trim()) {
    errors.push("Missing asset_title.");
  }

  if (
    !artifact.pdf_prompt.trim() &&
    !artifact.image_prompt.trim() &&
    !artifact.social_prompt.trim() &&
    !artifact.notes.trim()
  ) {
    errors.push("Blueprint missing executable prompts or notes.");
  }

  return {
    valid: errors.length === 0,
    errors,
    artifact,
  };
}

export function strategicBlueprintReviewText(
  artifact: StrategicBlueprintArtifact,
): string {
  return [
    artifact.asset_title,
    artifact.asset_type,
    artifact.business_goal,
    artifact.executive_rationale,
    artifact.notes,
    artifact.pdf_prompt,
    artifact.image_prompt,
    artifact.social_prompt,
  ]
    .filter(Boolean)
    .join("\n");
}

import { NextResponse } from "next/server";
import { importPersonaManual } from "@/services/personas/personaImporter";
import { toPublicPersona } from "@/services/personas/personaPublic";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function rowFromBody(body: Record<string, unknown>) {
  const text = (snake: string, camel: string) =>
    String(body[snake] ?? body[camel] ?? "") || null;

  return {
    persona_name: text("persona_name", "personaName"),
    short_description: text("short_description", "shortDescription"),
    category: text("category", "category"),
    gender_identity: text("gender_identity", "genderIdentity"),
    age_range: text("age_range", "ageRange"),
    birth_year_approx: text("birth_year_approx", "birthYearApprox"),
    generation: text("generation", "generation"),
    cultural_background: text("cultural_background", "culturalBackground"),
    country: text("country", "country"),
    state: text("state", "state"),
    city: text("city", "city"),
    location_summary: text("location_summary", "locationSummary"),
    languages: text("languages", "languages"),
    relationship_status: text("relationship_status", "relationshipStatus"),
    household: text("household", "household"),
    income_range: text("income_range", "incomeRange"),
    purchasing_power: text("purchasing_power", "purchasingPower"),
    education: text("education", "education"),
    occupation: text("occupation", "occupation"),
    seniority: text("seniority", "seniority"),
    industry_context: text("industry_context", "industryContext"),
    lifestyle: text("lifestyle", "lifestyle"),
    interests: text("interests", "interests"),
    digital_behavior: text("digital_behavior", "digitalBehavior"),
    brands_influences: text("brands_influences", "brandsInfluences"),
    values_text: text("values_text", "valuesText"),
    aesthetic_preferences: text(
      "aesthetic_preferences",
      "aestheticPreferences",
    ),
    preferred_imagery: text("preferred_imagery", "preferredImagery"),
    goals: text("goals", "goals"),
    needs: text("needs", "needs"),
    pain_points: text("pain_points", "painPoints"),
    fears: text("fears", "fears"),
    motivations: text("motivations", "motivations"),
    objections: text("objections", "objections"),
    buying_triggers: text("buying_triggers", "buyingTriggers"),
    decision_criteria: text("decision_criteria", "decisionCriteria"),
    purchase_behavior: text("purchase_behavior", "purchaseBehavior"),
    typical_concerns: text("typical_concerns", "typicalConcerns"),
    communication_style: text("communication_style", "communicationStyle"),
    preferred_channels: text("preferred_channels", "preferredChannels"),
    reference_website: text("reference_website", "referenceWebsite"),
    notes: text("notes", "notes"),
    additional_context: text("additional_context", "additionalContext"),
    ads_content: text("ads_content", "adsContent"),
    source: text("source", "source"),
  };
}

/** Manual Persona create — synchronous persistence only (Stage 2). */
export async function POST(request: Request) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const body = (await request.json()) as Record<string, unknown>;
    const row = rowFromBody(body);

    const result = await importPersonaManual({
      organizationId,
      userId,
      row,
    });

    if (result.duplicate) {
      return json({
        ok: true,
        success: true,
        duplicate: true,
        persona: toPublicPersona(result.persona),
        personaId: result.persona.id,
        message: "Persona already exists.",
      });
    }

    return json(
      {
        ok: true,
        success: true,
        duplicate: false,
        invalidReferenceWebsite: result.invalidReferenceWebsite,
        persona: toPublicPersona(result.persona),
        personaId: result.persona.id,
        message: "Persona created.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "CREATE_FAILED",
          message:
            error instanceof Error ? error.message : "Persona create failed.",
        },
      },
      400,
    );
  }
}

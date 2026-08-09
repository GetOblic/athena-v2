import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
  getEstimatePricingMethodologyInstructionForSuperAdmin,
  updateEstimatePricingMethodologyInstructionForSuperAdmin,
} from "@/services/estimate/estimatePricingMethodologyInstruction";
import { StrategicBlueprintInstructionError } from "@/services/superAdmin/strategicBlueprintInstructions";
import { SuperAdminAccessError } from "@/services/superAdmin/superAdminIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function serializeInstruction(instruction: {
  configKey: string;
  configured: boolean;
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  return {
    configKey: instruction.configKey,
    configured: instruction.configured,
    instructionText: instruction.instructionText,
    revisionId: instruction.revisionId,
    updatedAt: instruction.updatedAt,
    updatedBy: instruction.updatedBy,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const { instruction } =
      await getEstimatePricingMethodologyInstructionForSuperAdmin(user.id);
    return NextResponse.json(
      { ok: true, instruction: serializeInstruction(instruction) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return jsonError(403, "NOT_SUPER_ADMIN", error.message);
    }
    if (error instanceof StrategicBlueprintInstructionError) {
      return jsonError(500, error.code, error.message);
    }
    console.error("[SUPER_ADMIN] estimate_pricing_methodology_get_failed", error);
    return jsonError(
      500,
      "ESTIMATE_PRICING_METHODOLOGY_GET_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to read Estimate pricing methodology.",
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  // Never trust client config_key / revision_id — server fixes the key.
  const rest = { ...body };
  delete rest.config_key;
  delete rest.configKey;
  delete rest.revision_id;
  delete rest.revisionId;

  if (typeof rest.instructionText !== "string") {
    return jsonError(
      400,
      "INVALID_INSTRUCTION",
      "instructionText must be a string.",
    );
  }

  const instructionText = rest.instructionText;
  if (instructionText.length > ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS) {
    return jsonError(
      400,
      "INSTRUCTION_TOO_LONG",
      `Estimate pricing methodology must be at most ${ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS} characters.`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const { instruction } =
      await updateEstimatePricingMethodologyInstructionForSuperAdmin({
        actorUserId: user.id,
        instructionText,
      });

    return NextResponse.json(
      { ok: true, instruction: serializeInstruction(instruction) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return jsonError(403, "NOT_SUPER_ADMIN", error.message);
    }
    if (error instanceof StrategicBlueprintInstructionError) {
      const status = error.code === "INSTRUCTION_TOO_LONG" ? 400 : 500;
      return jsonError(status, error.code, error.message);
    }
    console.error(
      "[SUPER_ADMIN] estimate_pricing_methodology_update_failed",
      error,
    );
    return jsonError(
      500,
      "ESTIMATE_PRICING_METHODOLOGY_UPDATE_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to update Estimate pricing methodology.",
    );
  }
}

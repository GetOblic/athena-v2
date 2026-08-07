import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  StrategicBlueprintInstructionError,
  getTrendSocialPromptInstructionForSuperAdmin,
  updateTrendSocialPromptInstructionForSuperAdmin,
} from "@/services/superAdmin/strategicBlueprintInstructions";
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
  key: string;
  configured: boolean;
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  return {
    key: instruction.key,
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
    const { instruction } = await getTrendSocialPromptInstructionForSuperAdmin(
      user.id,
    );
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
    console.error("[SUPER_ADMIN] trend_social_prompt_get_failed", error);
    return jsonError(
      500,
      "TREND_SOCIAL_PROMPT_GET_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to read Trend Social Prompt instruction.",
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: { instructionText?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  if (typeof body.instructionText !== "string") {
    return jsonError(
      400,
      "INVALID_INSTRUCTION",
      "instructionText must be a string.",
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
      await updateTrendSocialPromptInstructionForSuperAdmin({
        actorUserId: user.id,
        instructionText: body.instructionText,
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
      return jsonError(500, error.code, error.message);
    }
    console.error("[SUPER_ADMIN] trend_social_prompt_update_failed", error);
    return jsonError(
      500,
      "TREND_SOCIAL_PROMPT_UPDATE_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to update Trend Social Prompt instruction.",
    );
  }
}

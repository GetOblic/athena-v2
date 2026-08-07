import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logSuperAdminAudit } from "@/services/superAdmin/superAdminAuditLog";
import {
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT,
  type ActiveStrategicBlueprintInstruction,
  type StrategicBlueprintInstructionKey,
  type TrendSocialPromptConfigProvenance,
} from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import {
  requireGetOblicSuperAdmin,
  type GetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";

export {
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT,
  type ActiveStrategicBlueprintInstruction,
  type StrategicBlueprintInstructionKey,
  type TrendSocialPromptConfigProvenance,
};

export type StrategicBlueprintInstructionRecord = {
  id: string;
  config_key: string;
  instruction_text: string;
  revision_id: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export class StrategicBlueprintInstructionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StrategicBlueprintInstructionError";
    this.code = code;
  }
}

function isMissingInstructionRelationError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "PGRST205" || error.code === "42P01") {
    return true;
  }

  const message = error.message?.toLowerCase() || "";
  return message.includes("getoblic_strategic_blueprint_instructions");
}

function toActiveInstruction(
  row: StrategicBlueprintInstructionRecord | null,
): ActiveStrategicBlueprintInstruction {
  const instructionText = String(row?.instruction_text ?? "").trim();
  const configured = Boolean(row && instructionText.length > 0);

  return {
    key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
    configured,
    instructionText: configured ? instructionText : "",
    revisionId: configured ? row?.revision_id ?? null : null,
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };
}

/**
 * Server-side read of the active Trend Social Prompt instruction.
 * Uses service-role only. Does not require Super Admin identity — generation
 * workers may call this without exposing Super Admin APIs to tenants.
 */
export async function getActiveTrendSocialPromptInstruction(): Promise<ActiveStrategicBlueprintInstruction> {
  const { data, error } = await supabaseAdmin
    .from("getoblic_strategic_blueprint_instructions")
    .select(
      "id, config_key, instruction_text, revision_id, updated_by, created_at, updated_at",
    )
    .eq("config_key", TREND_SOCIAL_PROMPT_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingInstructionRelationError(error)) {
      return toActiveInstruction(null);
    }
    console.error(
      "getoblic_strategic_blueprint_instructions read failed:",
      error,
    );
    throw new StrategicBlueprintInstructionError(
      "INSTRUCTION_READ_FAILED",
      error.message || "Failed to read Trend Social Prompt instruction.",
    );
  }

  return toActiveInstruction(
    (data as StrategicBlueprintInstructionRecord | null) ?? null,
  );
}

export function toTrendSocialPromptConfigProvenance(
  instruction: ActiveStrategicBlueprintInstruction,
): TrendSocialPromptConfigProvenance {
  return {
    key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
    revision_id: instruction.configured ? instruction.revisionId : null,
    configured: instruction.configured,
  };
}

/**
 * Super Admin read — real DB Super Admin authority required.
 * Marker cookie alone must never authorize this path.
 */
export async function getTrendSocialPromptInstructionForSuperAdmin(
  actorUserId: string,
): Promise<{
  superAdmin: GetOblicSuperAdmin;
  instruction: ActiveStrategicBlueprintInstruction;
}> {
  const superAdmin = await requireGetOblicSuperAdmin(actorUserId);
  const instruction = await getActiveTrendSocialPromptInstruction();
  return { superAdmin, instruction };
}

/**
 * Super Admin write — real DB Super Admin authority required.
 * Regenerates revision_id so future generations can record provenance.
 */
export async function updateTrendSocialPromptInstructionForSuperAdmin(input: {
  actorUserId: string;
  instructionText: string;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  instruction: ActiveStrategicBlueprintInstruction;
}> {
  const superAdmin = await requireGetOblicSuperAdmin(input.actorUserId);
  const instructionText = String(input.instructionText ?? "");
  const now = new Date().toISOString();
  const revisionId = crypto.randomUUID();

  const { data, error } = await supabaseAdmin
    .from("getoblic_strategic_blueprint_instructions")
    .upsert(
      {
        config_key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
        instruction_text: instructionText,
        revision_id: revisionId,
        updated_by: superAdmin.user_id,
        updated_at: now,
      },
      { onConflict: "config_key" },
    )
    .select(
      "id, config_key, instruction_text, revision_id, updated_by, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    await logSuperAdminAudit({
      actorUserId: superAdmin.user_id,
      action: "update_strategic_blueprint_instruction",
      metadata: {
        config_key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      },
      success: false,
      reason: error?.message || "Instruction update failed.",
    });
    throw new StrategicBlueprintInstructionError(
      "INSTRUCTION_UPDATE_FAILED",
      error?.message || "Failed to update Trend Social Prompt instruction.",
    );
  }

  const row = data as StrategicBlueprintInstructionRecord;
  const instruction = toActiveInstruction(row);

  await logSuperAdminAudit({
    actorUserId: superAdmin.user_id,
    action: "update_strategic_blueprint_instruction",
    metadata: {
      config_key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      revision_id: row.revision_id,
      instruction_char_count: instructionText.length,
      configured: instruction.configured,
    },
    success: true,
  });

  return { superAdmin, instruction };
}

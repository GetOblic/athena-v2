import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logSuperAdminAudit } from "@/services/superAdmin/superAdminAuditLog";
import {
  GOVERNED_INSTRUCTION_CONFIG_KEYS,
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT,
  isGovernedInstructionConfigKey,
  type ActiveGovernedInstruction,
  type ActiveStrategicBlueprintInstruction,
  type GovernedInstructionConfigKey,
  type StrategicBlueprintInstructionKey,
  type TrendSocialPromptConfigProvenance,
} from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import {
  requireGetOblicSuperAdmin,
  type GetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";

export {
  GOVERNED_INSTRUCTION_CONFIG_KEYS,
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT,
  isGovernedInstructionConfigKey,
  type ActiveGovernedInstruction,
  type ActiveStrategicBlueprintInstruction,
  type GovernedInstructionConfigKey,
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
  configKey: GovernedInstructionConfigKey,
): ActiveGovernedInstruction {
  const instructionText = String(row?.instruction_text ?? "").trim();
  const configured = Boolean(row && instructionText.length > 0);

  return {
    key: configKey,
    configured,
    instructionText: configured ? instructionText : "",
    revisionId: configured ? row?.revision_id ?? null : null,
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };
}

function assertAllowlistedConfigKey(
  configKey: string,
): asserts configKey is GovernedInstructionConfigKey {
  if (!isGovernedInstructionConfigKey(configKey)) {
    throw new StrategicBlueprintInstructionError(
      "UNSUPPORTED_CONFIG_KEY",
      "Unsupported governed instruction config key.",
    );
  }
}

/**
 * Generic server-side read of an active governed instruction by allowlisted key.
 * Service-role only. Does not require Super Admin identity.
 */
export async function getActiveGovernedInstruction(
  configKey: GovernedInstructionConfigKey,
): Promise<ActiveGovernedInstruction> {
  assertAllowlistedConfigKey(configKey);

  const { data, error } = await supabaseAdmin
    .from("getoblic_strategic_blueprint_instructions")
    .select(
      "id, config_key, instruction_text, revision_id, updated_by, created_at, updated_at",
    )
    .eq("config_key", configKey)
    .maybeSingle();

  if (error) {
    if (isMissingInstructionRelationError(error)) {
      return toActiveInstruction(null, configKey);
    }
    console.error(
      "getoblic_strategic_blueprint_instructions read failed:",
      error,
    );
    throw new StrategicBlueprintInstructionError(
      "INSTRUCTION_READ_FAILED",
      error.message || "Failed to read governed instruction.",
    );
  }

  return toActiveInstruction(
    (data as StrategicBlueprintInstructionRecord | null) ?? null,
    configKey,
  );
}

/**
 * Generic Super Admin upsert for an allowlisted governed instruction key.
 * Regenerates revision_id so future generations can record provenance.
 * Does not silently truncate instruction text.
 */
export async function upsertGovernedInstructionForSuperAdmin(input: {
  actorUserId: string;
  configKey: GovernedInstructionConfigKey;
  instructionText: string;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  instruction: ActiveGovernedInstruction;
}> {
  assertAllowlistedConfigKey(input.configKey);
  const superAdmin = await requireGetOblicSuperAdmin(input.actorUserId);
  const instructionText = String(input.instructionText ?? "");
  const now = new Date().toISOString();
  const revisionId = crypto.randomUUID();

  const { data, error } = await supabaseAdmin
    .from("getoblic_strategic_blueprint_instructions")
    .upsert(
      {
        config_key: input.configKey,
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
        config_key: input.configKey,
      },
      success: false,
      reason: error?.message || "Instruction update failed.",
    });
    throw new StrategicBlueprintInstructionError(
      "INSTRUCTION_UPDATE_FAILED",
      error?.message || "Failed to update governed instruction.",
    );
  }

  const row = data as StrategicBlueprintInstructionRecord;
  const instruction = toActiveInstruction(row, input.configKey);

  await logSuperAdminAudit({
    actorUserId: superAdmin.user_id,
    action: "update_strategic_blueprint_instruction",
    metadata: {
      config_key: input.configKey,
      revision_id: row.revision_id,
      instruction_char_count: instructionText.length,
      configured: instruction.configured,
    },
    success: true,
  });

  return { superAdmin, instruction };
}

/**
 * Server-side read of the active Trend Social Prompt instruction.
 * Uses service-role only. Does not require Super Admin identity — generation
 * workers may call this without exposing Super Admin APIs to tenants.
 */
export async function getActiveTrendSocialPromptInstruction(): Promise<ActiveStrategicBlueprintInstruction> {
  return getActiveGovernedInstruction(TREND_SOCIAL_PROMPT_CONFIG_KEY);
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
  // Keep Super Admin gate in this product wrapper (V25 contract / tests).
  await requireGetOblicSuperAdmin(input.actorUserId);
  // Product identity remains Trend Social (config_key: TREND_SOCIAL_PROMPT_CONFIG_KEY).
  return upsertGovernedInstructionForSuperAdmin({
    actorUserId: input.actorUserId,
    configKey: TREND_SOCIAL_PROMPT_CONFIG_KEY,
    instructionText: input.instructionText,
  });
}

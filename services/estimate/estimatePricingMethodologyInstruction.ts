/**
 * Athena Estimate pricing methodology — Super Admin governed instruction wrappers.
 *
 * Dynamic commercial methodology is Super Admin controlled.
 * Static security / evidence / grounding constraints remain code controlled.
 *
 * Changing methodology affects FUTURE Estimate generations only.
 * Historical Ready Estimates remain unchanged.
 *
 * L4 establishes the configured:false / provenance read contract.
 * L5 executor fails generation with ESTIMATE_INSTRUCTION_NOT_CONFIGURED when absent.
 */

import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
} from "@/services/estimate/athenaEstimateTypes";
import {
  StrategicBlueprintInstructionError,
  getActiveGovernedInstruction,
  upsertGovernedInstructionForSuperAdmin,
  type ActiveGovernedInstruction,
} from "@/services/superAdmin/strategicBlueprintInstructions";
import {
  requireGetOblicSuperAdmin,
  type GetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";

export { ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS };

/**
 * Later generation/worker failure code when methodology is absent/empty.
 * L4 does not implement worker failure — contract constant only.
 */
export const ESTIMATE_INSTRUCTION_NOT_CONFIGURED =
  "ESTIMATE_INSTRUCTION_NOT_CONFIGURED" as const;

export type ActiveEstimatePricingMethodologyInstruction = {
  configKey: typeof ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY;
  revisionId: string | null;
  instructionText: string;
  configured: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type EstimatePricingMethodologyProvenance = {
  configKey: typeof ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY;
  revisionId: string | null;
  configured: boolean;
};

function toEstimateInstruction(
  instruction: ActiveGovernedInstruction,
): ActiveEstimatePricingMethodologyInstruction {
  return {
    configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
    revisionId: instruction.configured ? instruction.revisionId : null,
    instructionText: instruction.configured ? instruction.instructionText : "",
    configured: instruction.configured,
    updatedAt: instruction.updatedAt,
    updatedBy: instruction.updatedBy,
  };
}

/**
 * Server-side read for future Estimate generation / workers.
 * Does not require Super Admin identity.
 */
export async function getActiveEstimatePricingMethodologyInstruction(): Promise<ActiveEstimatePricingMethodologyInstruction> {
  const instruction = await getActiveGovernedInstruction(
    ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  );
  return toEstimateInstruction(instruction);
}

export function toEstimatePricingMethodologyProvenance(
  instruction: ActiveEstimatePricingMethodologyInstruction,
): EstimatePricingMethodologyProvenance {
  return {
    configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
    revisionId: instruction.configured ? instruction.revisionId : null,
    configured: instruction.configured,
  };
}

/**
 * Super Admin read — genuine GetOblic Super Admin required.
 * Marker cookie alone must never authorize this path.
 */
export async function getEstimatePricingMethodologyInstructionForSuperAdmin(
  actorUserId: string,
): Promise<{
  superAdmin: GetOblicSuperAdmin;
  instruction: ActiveEstimatePricingMethodologyInstruction;
}> {
  const superAdmin = await requireGetOblicSuperAdmin(actorUserId);
  const instruction = await getActiveEstimatePricingMethodologyInstruction();
  return { superAdmin, instruction };
}

/**
 * Super Admin write — genuine GetOblic Super Admin required.
 * Rejects oversized input (> 6,000). Whitespace-only yields configured=false.
 * Does not invent a default commercial methodology.
 */
export async function updateEstimatePricingMethodologyInstructionForSuperAdmin(input: {
  actorUserId: string;
  instructionText: string;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  instruction: ActiveEstimatePricingMethodologyInstruction;
}> {
  await requireGetOblicSuperAdmin(input.actorUserId);

  const instructionText = String(input.instructionText ?? "");
  if (instructionText.length > ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS) {
    throw new StrategicBlueprintInstructionError(
      "INSTRUCTION_TOO_LONG",
      `Estimate pricing methodology must be at most ${ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS} characters.`,
    );
  }

  const { superAdmin, instruction } =
    await upsertGovernedInstructionForSuperAdmin({
      actorUserId: input.actorUserId,
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      instructionText,
    });

  return {
    superAdmin,
    instruction: toEstimateInstruction(instruction),
  };
}

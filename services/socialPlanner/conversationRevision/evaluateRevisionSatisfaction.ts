/**
 * Deterministic satisfaction of enforceable conversation-revision directives.
 * Free-text tone / creative direction is generation guidance only.
 */

import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION,
  type SocialPlannerConversationRevisionBriefV1,
  type SocialPlannerRevisionSatisfactionResult,
  type SocialPlannerRevisionSatisfactionViolation,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import { majorFingerprintKey } from "@/services/socialPlanner/diversity/socialPlannerSimilarity";

export function resolveRevisionDateSets(input: {
  brief: SocialPlannerConversationRevisionBriefV1;
  periodDates: readonly string[];
}): { preservedDates: string[]; revisedDates: string[] } {
  const revised = new Set(input.brief.dayChanges.map((change) => change.date));
  const preserved = input.periodDates.filter((date) => {
    if (revised.has(date)) return false;
    if (input.brief.preserve.includes(date)) return true;
    return input.brief.dayChanges.length > 0;
  });
  return {
    preservedDates: preserved,
    revisedDates: input.periodDates.filter((date) => revised.has(date)),
  };
}

export function evaluateRevisionSatisfaction(input: {
  candidatePackage: SocialCalendarPackageV1;
  sourcePackage: SocialCalendarPackageV1;
  brief: SocialPlannerConversationRevisionBriefV1;
}): SocialPlannerRevisionSatisfactionResult {
  const violations: SocialPlannerRevisionSatisfactionViolation[] = [];
  const enforcedDirectives: string[] = [];
  const { preservedDates, revisedDates } = resolveRevisionDateSets({
    brief: input.brief,
    periodDates: input.candidatePackage.period.dates,
  });

  const candidateByDate = new Map(
    input.candidatePackage.assets.map((asset) => [asset.date, asset]),
  );
  const sourceByDate = new Map(
    input.sourcePackage.assets.map((asset) => [asset.date, asset]),
  );

  for (const change of input.brief.dayChanges) {
    const candidate = candidateByDate.get(change.date);
    if (!candidate) {
      violations.push({
        code: "MISSING_REVISED_DAY",
        message: `Requested change for ${change.date} is missing from the candidate week.`,
        candidateDate: change.date,
      });
      continue;
    }
    if (change.requestedAssetType) {
      enforcedDirectives.push(`requestedAssetType:${change.date}`);
      if (candidate.assetType !== change.requestedAssetType) {
        violations.push({
          code: "REQUESTED_ASSET_TYPE",
          message: `${change.date} must use asset type ${change.requestedAssetType}.`,
          candidateDate: change.date,
        });
      }
    }
    if (change.requestedObjective) {
      enforcedDirectives.push(`requestedObjective:${change.date}`);
      if (candidate.primaryObjective !== change.requestedObjective) {
        violations.push({
          code: "REQUESTED_OBJECTIVE",
          message: `${change.date} must use objective ${change.requestedObjective}.`,
          candidateDate: change.date,
        });
      }
    }
  }

  if (input.brief.global.avoidFormats?.length) {
    enforcedDirectives.push("avoidFormats");
    for (const asset of input.candidatePackage.assets) {
      if (input.brief.global.avoidFormats.includes(asset.assetType)) {
        violations.push({
          code: "AVOID_FORMAT",
          message: `${asset.date} uses avoided format ${asset.assetType}.`,
          candidateDate: asset.date,
        });
      }
    }
  }

  for (const date of preservedDates) {
    const candidate = candidateByDate.get(date);
    const source = sourceByDate.get(date);
    if (!candidate || !source) continue;
    enforcedDirectives.push(`preserve:${date}`);
    if (
      majorFingerprintKey(candidate.creativeFingerprint) !==
      majorFingerprintKey(source.creativeFingerprint)
    ) {
      violations.push({
        code: "PRESERVE_DAY",
        message: `${date} should remain compatible with the source day.`,
        candidateDate: date,
      });
    }
  }

  return {
    accepted: violations.length === 0,
    algorithmVersion: SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION,
    preservedDates,
    revisedDates,
    enforcedDirectives: [...new Set(enforcedDirectives)],
    violations,
  };
}

export function formatRevisionSatisfactionViolations(
  result: SocialPlannerRevisionSatisfactionResult,
): string[] {
  return result.violations.map((violation) =>
    violation.candidateDate
      ? `${violation.message} (${violation.candidateDate} / ${violation.code})`
      : `${violation.message} (${violation.code})`,
  );
}

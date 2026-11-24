/**
 * Extensible confirmed-criterion registry.
 * Gate 3B registers one comparison: distinctColorPatternCount >= minimum.
 * Unknown ids fail closed. Nothing in this module calls a model.
 */

import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import type { MonitorCriterion } from "@/services/monitor/monitorTypes";

export type MonitorCriterionDefinition = {
  id: "distinctColorPatternCount";
  operator: "gte";
  validate(value: unknown): MonitorCriterion;
  match(distinctVariationCount: number | null, criterion: MonitorCriterion): boolean | null;
};

function readMinimum(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new MonitorOperationError(
      "INVALID_CONFIGURATION",
      "Criterion minimum must be an integer from 1 to 100.",
    );
  }
  return value;
}

const DISTINCT_COLOR_PATTERN_COUNT: MonitorCriterionDefinition = {
  id: "distinctColorPatternCount",
  operator: "gte",
  validate(value: unknown): MonitorCriterion {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new MonitorOperationError("INVALID_CONFIGURATION", "Criterion is required.");
    }
    const record = value as Record<string, unknown>;
    if (record.id !== "distinctColorPatternCount" || record.operator !== "gte") {
      throw new MonitorOperationError(
        "INVALID_CONFIGURATION",
        "Unsupported Monitor criterion.",
      );
    }
    return {
      id: "distinctColorPatternCount",
      operator: "gte",
      minimum: readMinimum(record.minimum),
    };
  },
  match(distinctVariationCount, criterion) {
    if (distinctVariationCount == null) return null;
    if (!Number.isInteger(distinctVariationCount) || distinctVariationCount < 0) {
      return null;
    }
    return distinctVariationCount >= criterion.minimum;
  },
};

const REGISTRY: readonly MonitorCriterionDefinition[] = [DISTINCT_COLOR_PATTERN_COUNT];

export function listMonitorCriterionIds(): readonly string[] {
  return REGISTRY.map((definition) => definition.id);
}

export function parseMonitorCriterion(value: unknown): MonitorCriterion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MonitorOperationError("INVALID_CONFIGURATION", "Criterion is required.");
  }
  const id = (value as { id?: unknown }).id;
  const definition = REGISTRY.find((item) => item.id === id);
  if (!definition) {
    throw new MonitorOperationError("INVALID_CONFIGURATION", "Unsupported Monitor criterion.");
  }
  return definition.validate(value);
}

export function matchMonitorCriterion(
  criterion: MonitorCriterion,
  distinctVariationCount: number | null,
): boolean | null {
  const definition = REGISTRY.find(
    (item) => item.id === criterion.id && item.operator === criterion.operator,
  );
  if (!definition) return null;
  return definition.match(distinctVariationCount, criterion);
}

export function criteriaIdentityEqual(
  left: MonitorCriterion,
  right: MonitorCriterion,
): boolean {
  return left.id === right.id && left.operator === right.operator;
}

export function criteriaDeepEqual(
  left: MonitorCriterion,
  right: MonitorCriterion,
): boolean {
  return criteriaIdentityEqual(left, right) && left.minimum === right.minimum;
}

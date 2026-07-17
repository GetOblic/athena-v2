import {
  extractProspectDeploymentAssetSections,
} from "@/lib/prospectDeploymentAssetContract";
import type { PilotAssetKey } from "./constants";
import { PILOT_DEPLOYMENT_ASSET_KEYS, PILOT_STRATEGIC_ASSET_KEYS } from "./constants";

function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function extractPilotDeploymentAssets(
  rawResponse: string,
): Partial<Record<(typeof PILOT_DEPLOYMENT_ASSET_KEYS)[number], string>> {
  const sections = extractProspectDeploymentAssetSections(rawResponse);
  const byKey = new Map(sections.map((section) => [section.key, section.content]));
  const result: Partial<
    Record<(typeof PILOT_DEPLOYMENT_ASSET_KEYS)[number], string>
  > = {};

  for (const key of PILOT_DEPLOYMENT_ASSET_KEYS) {
    const content = byKey.get(key as never);
    if (content?.trim()) {
      result[key] = content.trim();
    } else {
      // Fallback: naive heading scrape for optional keys not in required extractor
      const match = rawResponse.match(
        new RegExp(
          `(?:^|\\n)${key}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z0-9_]+:|$)`,
          "i",
        ),
      );
      if (match?.[1]?.trim()) {
        result[key] = match[1].trim();
      }
    }
  }

  return result;
}

export function extractPilotStrategicAssets(
  rawResponse: string,
): Partial<Record<(typeof PILOT_STRATEGIC_ASSET_KEYS)[number], string>> {
  try {
    const parsed = JSON.parse(stripJsonFence(rawResponse)) as Record<
      string,
      unknown
    >;
    const result: Partial<
      Record<(typeof PILOT_STRATEGIC_ASSET_KEYS)[number], string>
    > = {};
    for (const key of PILOT_STRATEGIC_ASSET_KEYS) {
      const value = String(parsed[key] ?? "").trim();
      if (value) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function extractPilotAsset(
  assetKey: PilotAssetKey,
  deploymentRaw: string | null,
  strategicRaw: string | null,
): string | null {
  if (
    (PILOT_DEPLOYMENT_ASSET_KEYS as readonly string[]).includes(assetKey) &&
    deploymentRaw
  ) {
    return extractPilotDeploymentAssets(deploymentRaw)[
      assetKey as (typeof PILOT_DEPLOYMENT_ASSET_KEYS)[number]
    ] ?? null;
  }
  if (
    (PILOT_STRATEGIC_ASSET_KEYS as readonly string[]).includes(assetKey) &&
    strategicRaw
  ) {
    return extractPilotStrategicAssets(strategicRaw)[
      assetKey as (typeof PILOT_STRATEGIC_ASSET_KEYS)[number]
    ] ?? null;
  }
  return null;
}

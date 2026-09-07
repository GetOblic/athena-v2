/**
 * Pure deterministic Home attention rules. No I/O, no writes, no AI.
 */

import type { HomeDomainResult } from "@/services/home/homeReadService";

export type HomeAttentionDomain =
  | "define"
  | "visibility"
  | "traction"
  | "convert";

export type HomeAttentionId =
  | "trainAthena"
  | "completeDefinition"
  | "establishVisibility"
  | "reviewFailedVisibility"
  | "defineFirstAudience"
  | "findProspects"
  | "reviewNewProspects"
  | "followUpProspects"
  | "reviewNewAndFollowUp";

export type HomeAttentionHref =
  | "/identity"
  | "/seo"
  | "/personas"
  | "/prospects";

export type HomeAttentionItem = {
  domain: HomeAttentionDomain;
  id: HomeAttentionId;
  href: HomeAttentionHref;
};

export type HomeAttentionDefineData = {
  brainStatus: string | null;
  hasVoice: boolean;
  hasKnowledge: boolean;
  hasWebsite: boolean;
};

export type HomeAttentionInput = {
  define: HomeDomainResult<HomeAttentionDefineData | null>;
  visibility: HomeDomainResult<{ status: string } | null>;
  traction: HomeDomainResult<{ audienceCount: number }>;
  convert: HomeDomainResult<{
    total: number;
    newCount: number;
    followUpCount: number;
  }>;
};

function missingCore(data: HomeAttentionDefineData): boolean {
  return !data.hasVoice || !data.hasKnowledge || !data.hasWebsite;
}

export function buildHomeAttention(
  input: HomeAttentionInput,
): HomeAttentionItem[] {
  const items: HomeAttentionItem[] = [];

  if (input.define.status === "ok") {
    const data = input.define.data;
    if (
      data == null ||
      (data.brainStatus !== "ready" && data.brainStatus !== "processing")
    ) {
      items.push({
        domain: "define",
        id: "trainAthena",
        href: "/identity",
      });
    } else if (data.brainStatus === "ready" && missingCore(data)) {
      items.push({
        domain: "define",
        id: "completeDefinition",
        href: "/identity",
      });
    }
  }

  if (input.visibility.status === "ok") {
    if (input.visibility.data == null) {
      items.push({
        domain: "visibility",
        id: "establishVisibility",
        href: "/seo",
      });
    } else if (input.visibility.data.status === "Processing Failed") {
      items.push({
        domain: "visibility",
        id: "reviewFailedVisibility",
        href: "/seo",
      });
    }
  }

  if (
    input.traction.status === "ok" &&
    input.traction.data.audienceCount === 0
  ) {
    items.push({
      domain: "traction",
      id: "defineFirstAudience",
      href: "/personas",
    });
  }

  if (input.convert.status === "ok") {
    const { total, newCount, followUpCount } = input.convert.data;
    if (total === 0) {
      items.push({
        domain: "convert",
        id: "findProspects",
        href: "/prospects",
      });
    } else if (newCount > 0 && followUpCount > 0) {
      items.push({
        domain: "convert",
        id: "reviewNewAndFollowUp",
        href: "/prospects",
      });
    } else if (newCount > 0) {
      items.push({
        domain: "convert",
        id: "reviewNewProspects",
        href: "/prospects",
      });
    } else if (followUpCount > 0) {
      items.push({
        domain: "convert",
        id: "followUpProspects",
        href: "/prospects",
      });
    }
  }

  return items;
}

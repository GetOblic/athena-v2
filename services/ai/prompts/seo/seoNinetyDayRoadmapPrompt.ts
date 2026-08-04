import { SEO_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/seo/seoSharedConstraints";
import type { SeoReportBriefMode } from "@/services/seo/seoReportTypes";
import { SEO_REPORT_DISCLAIMER } from "@/services/seo/seoReportTypes";

export const SEO_NINETY_DAY_ROADMAP_PROMPT_VERSION =
  "seo_ninety_day_roadmap_v1";

export function buildSeoNinetyDayRoadmapPrompt(input: {
  organizationContext: string;
  briefMode: SeoReportBriefMode;
  priorSections: unknown;
}): string {
  return `
OBJECTIVE:
Produce the final SEO Intelligence package wrapper fields and the 90-Day SEO Roadmap.

PROMPT VERSION:
${SEO_NINETY_DAY_ROADMAP_PROMPT_VERSION}

BRIEF MODE:
${input.briefMode}

PRIOR SECTIONS (stay consistent; do not contradict):
${JSON.stringify(input.priorSections, null, 2)}

TRUSTED + GUIDANCE CONTEXT:
${input.organizationContext}

REQUIRED JSON SHAPE:
{
  "reportName": string,
  "briefMode": "inferred" | "guided",
  "ninetyDayRoadmap": {
    "overview": string,
    "items": [
      {
        "priority": "P0" | "P1" | "P2" | "P3",
        "recommendation": string,
        "reason": string,
        "expectedBusinessImpact": string,
        "estimatedEffort": "low" | "medium" | "high",
        "athenaEvidence": string[]
      }
    ]
  },
  "disclaimer": string
}

FIELD RULES:
- reportName: concise operator-facing report title.
- briefMode must equal "${input.briefMode}".
- ninetyDayRoadmap.items: at least 4 prioritized recommendations synthesizing prior sections.
- Each item must include priority, reason, expected business impact, estimated effort, and Athena evidence.
- Prefer business-growth content actions over technical SEO chores.
- disclaimer must explain the report is inferred from Athena organization intelligence and is not based on Search Console / Analytics / Semrush / Ahrefs / PageSpeed / keyword databases.
- Suggested disclaimer text (may paraphrase while keeping meaning):
${SEO_REPORT_DISCLAIMER}

${SEO_SHARED_OUTPUT_RULES}
`.trim();
}

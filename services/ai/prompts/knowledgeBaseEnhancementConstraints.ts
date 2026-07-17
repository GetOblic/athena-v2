/**
 * Knowledge Base Enhancement — Prospect Deployment Asset generation contract.
 * Factual operational knowledge for GetOblic Voice AI — never invent facts.
 */

export const KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES = `
KNOWLEDGE BASE ENHANCEMENT formatting (always generate this heading; content may be shorter when verified facts are sparse):
KNOWLEDGE_BASE_ENHANCEMENT:
## Business Overview
- [verified concise facts]

## Services and Products

### [Service or Product Name]
- Overview:
- Who it is for:
- How it works:
- Pricing:
- Consultation:
- Duration or process:
- Preparation:
- Aftercare:
- Restrictions:

## Team and Expertise
- [verified people, roles, credentials, specializations]

## Pricing and Consultations
- [verified pricing and consultation facts]

## Locations, Hours and Contact
- [verified operational facts]

## Booking and Appointment Process
- [verified booking information]

## Policies and Terms
- [verified cancellation, deposit, refund, rescheduling, eligibility or other terms]

## Frequently Asked Questions
- [concise factual answers supported by source material]

## Information Requiring Verification
- [missing, ambiguous, or conflicting information]

Rules for Knowledge Base Enhancement:
- Produce structured operational business knowledge for GetOblic Voice AI knowledge bases, listings, and support agents.
- This is NOT marketing copy, SEO content, a sales pitch, or a Strategic Blueprint.
- Use only verified Prospect source intelligence already available (metadata, Notes, Additional Context, stored homepage intelligence, factual Ads Content).
- Factual, structured, concise, conversational enough for voice AI.
- Never invent services, prices, staff, credentials, hours, policies, or unsupported claims.
- Omit unknown information. Do not output empty sections.
- Consolidate repeated facts. Mark ambiguity under Information Requiring Verification.
- Omit navigation filler, social links, CTAs, forms, and promotional language.
- If Prospect information is sparse, produce a shorter factual package — do not fabricate structure fillers.
`.trim();

/**
 * Expanded Knowledge Base contract when Deep Website Intelligence (deep_v1) is available.
 * Still factual-only; never invent. Bound length but materially richer than ordinary KB.
 */
export const KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES = `
KNOWLEDGE BASE ENHANCEMENT formatting for Deep Website Intelligence prospects
(always generate this heading; use Unknown or Unverified Information for gaps):
KNOWLEDGE_BASE_ENHANCEMENT:
## Business Overview
- [verified facts from deep website intelligence + prospect metadata]

## Leadership / Practitioners
- [people, roles, credentials — unknown if not verified]

## Services and Treatments
- [offerings, modalities, packages — from deep intelligence / site pages]

## Target Clients
- [who they serve — only if evidenced]

## Problems Addressed
- [problems the business solves — only if evidenced]

## Methodology / Process
- [how delivery works — only if evidenced]

## Differentiators
- [explicit differentiators only]

## Credibility and Evidence
- [reviews, case studies, credentials, years — only if evidenced]

## Location and Service Area
- [locations, catchment, remote options]

## Contact and Booking Details
- [phone, email, booking path, hours]

## Frequently Asked Questions
- [FAQ content from deep intelligence]

## Common Concerns / Objections
- [only if evidenced in source material]

## Key Messaging and Positioning
- [positioning language grounded in deep intelligence]

## Important Operational Details
- [pricing signals, consult process, aftercare, restrictions]

## Unknown or Unverified Information
- [explicit list of missing facts — never invent fillers]

## Source Coverage Summary
- [pages_analyzed / crawl summary when available; note homepage-only if applicable]

Deep Knowledge Base rules:
- Derive ONLY from Prospect metadata, Discussion bridge content, homepage intelligence, and Deep Website Intelligence (provider deep_v1).
- Do not invent claims. Label unknowns under Unknown or Unverified Information.
- This asset may be materially longer than ordinary optional Knowledge Base output, but stay within a bounded practical ceiling suitable for AI receptionist / sales / content use.
- Preserve concise bullet formatting; prefer coverage over marketing tone.
- Do not force this expanded length for prospects without deep_v1 website intelligence.
`.trim();

export function isDeepV1WebsiteIntelligenceProvider(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const provider = (value as Record<string, unknown>).provider;
  return provider === "deep_v1";
}

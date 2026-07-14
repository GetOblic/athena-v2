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

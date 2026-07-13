/**
 * Knowledge Base Enhancement generation contract — Prospect Deployment Assets only.
 * Uses existing Prospect source material; never invents facts or scrapes.
 */

export const KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES = `
KNOWLEDGE BASE ENHANCEMENT formatting (required when enough verified facts exist):
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
- Transform only verified Prospect information already available in source intelligence.
- Suitable for GetOblic AI Receptionists, business listings, customer-support agents, voice AI, and sales/service teams.
- Factual, concise, conversational enough for voice AI.
- No hype, no testimonials, no marketing copy, no SEO article, no sales pitch.
- Do not invent services, prices, staff, credentials, hours, policies, or unsupported medical/legal/financial/operational claims.
- Do not scrape or request new website data.
- Do not treat other generated Deployment Assets as factual sources.
- Do not transform Email Outreach, Blog Post Idea, Substack Post, or Reddit Post into apparent business facts.
- Use Prospect metadata, Notes, Additional Context, stored homepage intelligence, and Ads Content only when they contain factual business information.
- Only include sections supported by available information. Do not output empty sections.
- Consolidate repeated facts. Mark ambiguity under Information Requiring Verification.
- Omit irrelevant navigation, social links, CTAs, forms, and marketing filler.
- If Prospect information is sparse, create a shorter factual package. Do not fabricate content to fill the structure.
`.trim();

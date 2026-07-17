/**
 * Hidden Gems — Prospect Deployment Asset generation contract.
 * Surfaces non-obvious intelligence from the complete learned website corpus.
 */

export const HIDDEN_GEMS_GENERATION_RULES = `
HIDDEN GEMS formatting:
HIDDEN_GEMS:
- **Finding:** [specific overlooked signal grounded in the learned website corpus]
  - **Why it matters:** [why an ordinary visitor or seller would miss the commercial value]
  - **Opportunity:** [implication, angle, or next move — inference labeled as implication, not fact]

Rules for Hidden Gems:
- Surface valuable business intelligence an ordinary website visitor would probably miss when browsing only the homepage or a few obvious pages.
- Use the COMPLETE website intelligence available in this prompt at generation time:
  - homepage-level intelligence when that is all that exists;
  - deep-scrape / multi-page corpus (pages, business_knowledge, crawl_summary, FAQs, policies, service pages, blog posts, team pages, case studies, secondary navigation) when present.
- Do NOT merely summarize the website.
- Do NOT repeat the main Prospect Analysis or Executive Briefing.
- Identify overlooked signals such as: underemphasized expertise; unusual service combinations; buried differentiators; strong educational material; credibility signals; founder/team expertise; hidden audience segments; specialized processes; recurring customer concerns; referral opportunities; geographic opportunities; partnership opportunities; commercial gaps; content opportunities; positioning contradictions; valuable information buried in secondary pages; capabilities that appear more valuable than the website presentation suggests.
- Prioritize quality over quantity. Include only material findings.
- When the corpus is limited, produce fewer findings rather than weak filler.
- When deep scrape provides strong evidence, surface genuinely non-obvious intelligence from secondary pages.
- Distinguish evidence from inference. Do not invent facts.
- Do not claim that a page or fact was found unless supported by the learned website corpus in this prompt.
- Avoid generic observations that could apply to any business in the category.
- This is analyst-grade intelligence, not a website summary and not Knowledge Base Enhancement.
`.trim();

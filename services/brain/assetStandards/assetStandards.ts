import type { ExecutiveAssetStandard } from "@/services/brain/assetStandards/assetStandardsTypes";
import { EXECUTIVE_ASSET_STANDARDS_VERSION } from "@/services/brain/assetStandards/assetStandardsTypes";

function baseStandard(
  assetType: string,
  config: Omit<ExecutiveAssetStandard, "assetType" | "standardVersion">,
): ExecutiveAssetStandard {
  return {
    assetType,
    standardVersion: EXECUTIVE_ASSET_STANDARDS_VERSION,
    ...config,
  };
}

export const PDF_STANDARD: ExecutiveAssetStandard = baseStandard("pdf", {
  assetPurpose:
    "Deliver a premium educational document that builds authority and guides a decision.",
  businessObjective:
    "Convert interest into qualified engagement through structured executive education.",
  expectedAudience:
    "Prospects seeking depth, clarity, and a credible framework — not surface-level tips.",
  expectedReadingDepth:
    "8–12 pages with scannable hierarchy and deep enough substance for a second read.",
  expectedStructure: [
    "Executive cover with transformation promise",
    "Executive summary",
    "Problem framing",
    "Decision framework",
    "Comparison tables",
    "Callout boxes for key insights",
    "Action plan",
    "CTA page",
  ],
  expectedSectionOrder: [
    "Cover",
    "Executive summary",
    "Context and stakes",
    "Framework or methodology",
    "Comparison or options matrix",
    "Implementation action plan",
    "Proof or evidence callouts",
    "Next step CTA",
  ],
  expectedEducationalDepth:
    "Teach a repeatable framework with examples, trade-offs, and decision criteria — not generic advice.",
  expectedExecutiveQuality:
    "Premium editorial tone, professional document hierarchy, no plain Word-style formatting.",
  expectedVisualGuidance:
    "Cover typography hierarchy, section dividers, icon-led headers, diagram-friendly whitespace, branded accent color.",
  expectedCtaPlacement:
    "Soft CTA after executive summary; primary CTA on dedicated final page with one clear next step.",
  expectedReusability:
    "Repurpose sections into email snippets, carousel slides, webinar outline, and sales one-pager.",
  commonMistakesToAvoid: [
    "Plain Word-style walls of text without hierarchy",
    "Generic titles like 'Ultimate Guide' without a specific promise",
    "Missing comparison tables or decision frameworks",
    "No executive summary or action plan",
    "CTA buried inside body copy instead of a dedicated closing page",
  ],
  qualityChecklist: [
    "Executive title states audience + transformation",
    "Professional cover with visual hierarchy",
    "Logical section flow with numbered framework",
    "At least one comparison table or decision matrix",
    "Callout boxes for insights, warnings, and takeaways",
    "Action plan with sequenced steps",
    "Premium educational tone throughout",
    "Dedicated CTA page with single primary action",
  ],
});

export const CAROUSEL_STANDARD: ExecutiveAssetStandard = baseStandard("carousel", {
  assetPurpose:
    "Deliver a paced visual narrative that educates quickly and earns engagement.",
  businessObjective:
    "Drive awareness and micro-conversions through structured slide-by-slide education.",
  expectedAudience:
    "Social scrollers who need immediate relevance and progressive insight.",
  expectedReadingDepth:
    "6–8 slides, one idea per slide, readable in under 90 seconds.",
  expectedStructure: [
    "Hook slide",
    "Pain validation",
    "Education slide",
    "Framework slide",
    "Transformation slide",
    "Proof or example slide",
    "CTA slide",
  ],
  expectedSectionOrder: [
    "Hook",
    "Pain validation",
    "Insight or myth-bust",
    "Framework or steps",
    "Transformation outcome",
    "Proof or credibility",
    "CTA",
  ],
  expectedEducationalDepth:
    "One actionable insight per slide with progressive build — not feature lists.",
  expectedExecutiveQuality:
    "Each slide has a headline, supporting line, and visual purpose — no dense paragraphs.",
  expectedVisualGuidance:
    "Strong typographic contrast, consistent slide template, icon or diagram per slide, visual pacing with breathing room.",
  expectedCtaPlacement:
    "Final slide only — one CTA with one action; no premature selling before slide 5.",
  expectedReusability:
    "Extract hook and framework slides for stories, PDF outline, and email teaser sequence.",
  commonMistakesToAvoid: [
    "Multiple ideas crammed on one slide",
    "Hook slide that sells instead of earns attention",
    "Missing pain validation before education",
    "No visual pacing or slide purpose labels",
    "CTA on every slide",
  ],
  qualityChecklist: [
    "Slide 1 hook stops the scroll",
    "Slide 2 validates audience pain",
    "Education slide teaches one clear insight",
    "Framework slide shows structured steps",
    "Transformation slide states outcome",
    "CTA slide has single action",
    "Each slide specifies visual purpose",
    "Copy blocks are paste-ready per slide",
  ],
});

export const EMAIL_STANDARD: ExecutiveAssetStandard = baseStandard("email", {
  assetPurpose:
    "Move a prospect from interest to action through a structured email sequence.",
  businessObjective:
    "Nurture trust and advance the conversation with value-first messaging.",
  expectedAudience:
    "Prospects who opted in or engaged — expecting relevance, not bulk marketing.",
  expectedReadingDepth:
    "5-email arc; each email readable in under 2 minutes with one core idea.",
  expectedStructure: [
    "Subject line",
    "Preview text",
    "Opening hook",
    "Personalization bridge",
    "Value body",
    "Action block",
    "Closing sign-off",
  ],
  expectedSectionOrder: [
    "Email 1: Value introduction",
    "Email 2: Pain amplification",
    "Email 3: Framework reveal",
    "Email 4: Proof or case angle",
    "Email 5: Primary CTA",
  ],
  expectedEducationalDepth:
    "Each email teaches one concept and connects to the next — not repetitive pitches.",
  expectedExecutiveQuality:
    "Human, credible, non-spam tone with clear paragraph rhythm and one CTA per email.",
  expectedVisualGuidance:
    "Short paragraphs, bold key lines, optional bullet block, minimal links, mobile-first length.",
  expectedCtaPlacement:
    "One primary CTA per email, placed after value delivery — never in the first paragraph.",
  expectedReusability:
    "Repurpose subject lines for social, body frameworks for PDF sections, CTA copy for landing page.",
  commonMistakesToAvoid: [
    "Subject lines that overpromise or spam",
    "Opening with a pitch instead of relevance",
    "No personalization bridge to audience context",
    "Multiple competing CTAs in one email",
    "Identical structure across all five emails",
  ],
  qualityChecklist: [
    "Subject line is specific and curiosity-led",
    "Preview text complements subject",
    "Opening earns attention within two lines",
    "Personalization references audience pain or stage",
    "Value section delivers one insight",
    "Single action CTA with clear next step",
    "Follow-up expectations defined between emails",
    "Sequence builds narrative arc across 5 emails",
  ],
});

export const LANDING_PAGE_STANDARD: ExecutiveAssetStandard = baseStandard(
  "landing_page",
  {
    assetPurpose:
      "Convert qualified traffic through a structured persuasion hierarchy.",
    businessObjective:
      "Turn interest into opt-in, booking, or purchase with executive clarity.",
    expectedAudience:
      "Warm or intent-driven visitors evaluating fit and credibility.",
    expectedReadingDepth:
      "Single scrolling page, scannable in 2–3 minutes with clear section breaks.",
    expectedStructure: [
      "Hero",
      "Problem",
      "Solution",
      "Benefits",
      "Proof",
      "FAQ",
      "CTA",
      "Trust elements",
    ],
    expectedSectionOrder: [
      "Hero promise",
      "Problem agitation",
      "Solution framework",
      "Benefits with outcomes",
      "Social proof or evidence",
      "FAQ objection handling",
      "Primary CTA block",
      "Trust strip or credentials",
    ],
    expectedEducationalDepth:
      "Explain the transformation mechanism — not just features — with outcome-led benefits.",
    expectedExecutiveQuality:
      "Executive polish: crisp headlines, outcome-led copy, no clutter, strong visual hierarchy.",
    expectedVisualGuidance:
      "Hero with headline/subhead/CTA above fold, icon-led benefit grid, testimonial or proof band, FAQ accordion structure.",
    expectedCtaPlacement:
      "Primary CTA in hero and repeated once after proof; secondary CTA optional in FAQ section.",
    expectedReusability:
      "Hero copy for ads, benefits for carousel, FAQ for email objections, proof for PDF.",
    commonMistakesToAvoid: [
      "Hero without a clear promise",
      "Feature lists instead of outcome benefits",
      "Missing proof or trust elements",
      "FAQ that ignores real objections",
      "Multiple competing CTAs with different actions",
    ],
    qualityChecklist: [
      "Hero states promise + audience + CTA",
      "Problem section mirrors buyer pain",
      "Solution presents a named framework",
      "Benefits are outcome-led",
      "Proof section includes credible evidence",
      "FAQ addresses top objections",
      "CTA block has one primary action",
      "Trust elements visible near conversion points",
    ],
  },
);

export const VIDEO_STANDARD: ExecutiveAssetStandard = baseStandard("video", {
  assetPurpose:
    "Deliver a compelling visual narrative that educates and converts in short form.",
  businessObjective:
    "Build trust quickly and drive a single next action through paced storytelling.",
  expectedAudience:
    "Viewers with limited attention who need immediate relevance and emotional pacing.",
  expectedReadingDepth:
    "60–90 second script with timed scenes and on-screen text cues.",
  expectedStructure: [
    "Opening hook",
    "Problem scene",
    "Insight scene",
    "Framework scene",
    "Proof scene",
    "CTA scene",
  ],
  expectedSectionOrder: [
    "Hook (0–5s)",
    "Problem (5–20s)",
    "Insight or reframe (20–35s)",
    "Framework or steps (35–55s)",
    "Proof or credibility (55–70s)",
    "CTA (70–90s)",
  ],
  expectedEducationalDepth:
    "One core framework delivered visually — not multiple concepts.",
  expectedExecutiveQuality:
    "Punchy voiceover lines, on-screen text reinforcement, intentional emotional pacing.",
  expectedVisualGuidance:
    "Scene-by-scene visual cues, b-roll suggestions, text overlay timing, pattern interrupt at hook.",
  expectedCtaPlacement:
    "Verbal and on-screen CTA in final 15 seconds only.",
  expectedReusability:
    "Hook clip for social, framework segment for carousel, script sections for webinar opening.",
  commonMistakesToAvoid: [
    "Slow opening without a hook",
    "Talking head without visual cues",
    "Multiple CTAs throughout the video",
    "No timed scene progression",
    "Generic stock footage descriptions",
  ],
  qualityChecklist: [
    "Opening hook within first 5 seconds",
    "Scene progression is timed and purposeful",
    "Emotional pacing builds toward CTA",
    "Visual cues specified per scene",
    "On-screen text supports voiceover",
    "CTA timing specified in final scene",
    "Script is paste-ready for production tools",
  ],
});

export const LEAD_MAGNET_STANDARD: ExecutiveAssetStandard = baseStandard(
  "lead_magnet",
  {
    assetPurpose:
      "Exchange high-value educational content for permission to continue the conversation.",
    businessObjective:
      "Grow qualified leads by solving one specific problem completely.",
    expectedAudience:
      "Problem-aware prospects seeking a quick win or diagnostic tool.",
    expectedReadingDepth:
      "Short-form resource (checklist, template, or mini-guide) consumable in 5–10 minutes.",
    expectedStructure: [
      "Magnet title with specific outcome",
      "Problem snapshot",
      "Quick diagnostic or assessment",
      "Actionable template or checklist",
      "Next step CTA",
    ],
    expectedSectionOrder: [
      "Title + outcome promise",
      "Who this is for",
      "Problem snapshot",
      "Tool, template, or checklist body",
      "How to apply it",
      "CTA to next conversation step",
    ],
    expectedEducationalDepth:
      "Deliver one complete quick win — not a teaser for unrelated content.",
    expectedExecutiveQuality:
      "Professional, focused, immediately usable — feels like a consultant's tool, not a blog post.",
    expectedVisualGuidance:
      "Clean cover, checkbox or worksheet layout, fill-in fields where applicable, branded header/footer.",
    expectedCtaPlacement:
      "CTA after the tool is delivered — invite one specific next step.",
    expectedReusability:
      "Expand into PDF guide, email sequence teaser, carousel hook, landing page offer.",
    commonMistakesToAvoid: [
      "Vague title without a specific outcome",
      "Lead magnet that is mostly promotional",
      "No usable template or checklist inside",
      "Too broad — tries to solve every problem",
      "Weak CTA with no clear next step",
    ],
    qualityChecklist: [
      "Title promises a specific outcome",
      "Audience qualification is explicit",
      "Contains a usable tool or checklist",
      "Problem snapshot matches buyer stage",
      "Professional visual layout specified",
      "CTA invites one next conversation step",
      "Resource feels complete, not a teaser",
    ],
  },
);

export const WEBINAR_STANDARD: ExecutiveAssetStandard = baseStandard("webinar", {
  assetPurpose:
    "Deliver a structured live or recorded teaching session that builds authority and converts.",
  businessObjective:
    "Educate at depth while creating a natural conversion moment.",
  expectedAudience:
    "Engaged prospects willing to invest 30–45 minutes for structured learning.",
  expectedReadingDepth:
    "45-minute agenda with teaching beats, engagement prompts, and conversion segment.",
  expectedStructure: [
    "Intro and credibility",
    "Problem framing",
    "Teaching framework",
    "Live example or walkthrough",
    "Q&A prompts",
    "Offer or CTA segment",
  ],
  expectedSectionOrder: [
    "Welcome and promise (5 min)",
    "Credibility and stakes (5 min)",
    "Core teaching framework (20 min)",
    "Example or demo (10 min)",
    "Q&A engagement (5 min)",
    "CTA and next steps (5 min)",
  ],
  expectedEducationalDepth:
    "Teach one framework thoroughly with examples — not a product demo disguised as training.",
  expectedExecutiveQuality:
    "Agenda-driven, engagement prompts at transitions, executive facilitator tone.",
  expectedVisualGuidance:
    "Slide deck outline per segment, diagram slides for framework, example slide, CTA slide.",
  expectedCtaPlacement:
    "Conversion segment in final 5 minutes after value is fully delivered.",
  expectedReusability:
    "Recording clips for social, framework slides for PDF, Q&A for FAQ content.",
  commonMistakesToAvoid: [
    "Pitch-heavy opening before teaching",
    "No engagement prompts or transitions",
    "Framework too shallow for session length",
    "Missing Q&A or interaction design",
    "CTA before teaching is complete",
  ],
  qualityChecklist: [
    "Agenda with timed segments",
    "Credibility established early",
    "Teaching framework is named and structured",
    "Live example or walkthrough included",
    "Engagement prompts at transitions",
    "Q&A segment designed",
    "CTA timed after value delivery",
  ],
});

export const CHECKLIST_STANDARD: ExecutiveAssetStandard = baseStandard("checklist", {
  assetPurpose:
    "Provide an immediately actionable verification tool the audience can apply today.",
  businessObjective:
    "Help prospects self-diagnose and recognize the need for deeper engagement.",
  expectedAudience:
    "Busy operators who want clarity fast — checklist consumers, not long-form readers.",
  expectedReadingDepth:
    "1–2 pages, checkbox-driven, completable in 5 minutes.",
  expectedStructure: [
    "Title with diagnostic promise",
    "When to use this checklist",
    "Grouped checklist sections",
    "Scoring or interpretation guide",
    "Recommended next step",
  ],
  expectedSectionOrder: [
    "Title and outcome",
    "Instructions",
    "Section A checklist items",
    "Section B checklist items",
    "Section C checklist items",
    "Interpretation guide",
    "Next step CTA",
  ],
  expectedEducationalDepth:
    "Each item tests a specific criterion — grouped by theme with clear pass/fail logic.",
  expectedExecutiveQuality:
    "Professional worksheet feel — not a bullet list pasted into a document.",
  expectedVisualGuidance:
    "Checkbox layout, section headers, optional score column, clean margins, icon per section.",
  expectedCtaPlacement:
    "After interpretation guide — one CTA based on score outcome.",
  expectedReusability:
    "Items become carousel slides, PDF appendix, email audit prompt, webinar worksheet.",
  commonMistakesToAvoid: [
    "Generic checklist items that apply to everyone",
    "No grouping or interpretation guide",
    "Missing 'when to use' context",
    "Plain bullet list without checkbox structure",
    "No connection between score and next step",
  ],
  qualityChecklist: [
    "Title states diagnostic outcome",
    "Items are specific and testable",
    "Sections are logically grouped",
    "Interpretation guide explains results",
    "Checkbox layout specified",
    "CTA matches score outcomes",
    "Completable in under 5 minutes",
  ],
});

export const FRAMEWORK_STANDARD: ExecutiveAssetStandard = baseStandard("framework", {
  assetPurpose:
    "Teach a named decision or implementation framework the audience can reuse.",
  businessObjective:
    "Position the business as the authority on a repeatable methodology.",
  expectedAudience:
    "Consideration-stage buyers evaluating approach and fit.",
  expectedReadingDepth:
    "Medium depth — framework explanation plus application examples in 4–6 sections.",
  expectedStructure: [
    "Framework name and promise",
    "When to use it",
    "Core principles",
    "Step-by-step framework",
    "Application examples",
    "Common pitfalls",
    "CTA",
  ],
  expectedSectionOrder: [
    "Framework introduction",
    "Context and when to apply",
    "Principles or pillars",
    "Sequential steps",
    "Example applications",
    "Pitfalls and anti-patterns",
    "Next step CTA",
  ],
  expectedEducationalDepth:
    "Named framework with defined steps, decision criteria, and examples — not abstract concepts.",
  expectedExecutiveQuality:
    "Consultant-grade structure with diagrams, decision points, and executive summary.",
  expectedVisualGuidance:
    "Framework diagram, step flowchart, comparison matrix, callout boxes for principles.",
  expectedCtaPlacement:
    "After pitfalls section — invite application support or deeper resource.",
  expectedReusability:
    "Framework name and steps become carousel, webinar core, PDF chapter, sales conversation tool.",
  commonMistakesToAvoid: [
    "Unnamed or generic framework",
    "Steps without decision criteria",
    "No examples of application",
    "Missing pitfalls or anti-patterns",
    "Framework too complex for audience stage",
  ],
  qualityChecklist: [
    "Framework has a distinct name",
    "Steps are sequential and actionable",
    "Principles support each step",
    "At least one application example",
    "Pitfalls section included",
    "Diagram or flowchart specified",
    "CTA connects framework to next step",
  ],
});

export function formatExecutiveAssetStandardForPrompt(
  standard: ExecutiveAssetStandard,
): string {
  const sections = [
    "EXECUTIVE ASSET STANDARDS:",
    "",
    "These are quality frameworks for excellent execution — not content templates.",
    "Specify how the asset should be structured and polished; do not hard-code wording.",
    "",
    `- Asset type: ${standard.assetType}`,
    `- Standard version: ${standard.standardVersion}`,
    `- Asset purpose: ${standard.assetPurpose}`,
    `- Business objective: ${standard.businessObjective}`,
    `- Expected audience: ${standard.expectedAudience}`,
    `- Expected reading depth: ${standard.expectedReadingDepth}`,
    "",
    "EXPECTED STRUCTURE:",
    ...standard.expectedStructure.map((item) => `- ${item}`),
    "",
    "EXPECTED SECTION ORDER:",
    ...standard.expectedSectionOrder.map((item, index) => `${index + 1}. ${item}`),
    "",
    "EXECUTION QUALITY:",
    `- Educational depth: ${standard.expectedEducationalDepth}`,
    `- Executive quality: ${standard.expectedExecutiveQuality}`,
    `- Visual guidance: ${standard.expectedVisualGuidance}`,
    `- CTA placement: ${standard.expectedCtaPlacement}`,
    `- Reusability: ${standard.expectedReusability}`,
    "",
    "COMMON MISTAKES TO AVOID:",
    ...standard.commonMistakesToAvoid.map((item) => `- ${item}`),
    "",
    "QUALITY CHECKLIST:",
    ...standard.qualityChecklist.map((item) => `- ${item}`),
    "",
    "INSTRUCTIONS:",
    "Blueprint prompts must reflect this standard's structure, polish, and hierarchy.",
    "Specify expected document quality, visual sophistication, and professional structure.",
    "Do not produce generic templates — produce execution specifications.",
  ];

  return sections.join("\n").trim();
}


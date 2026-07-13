/**
 * Merge multi-page extracts into one consolidated Business Brain package.
 */

import type { PageContentExtract } from "@/services/prospects/prospectWebsiteExtraction";

export type BusinessKnowledgePackage = {
  overview: string;
  products: string;
  services: string;
  pricing: string;
  consultations: string;
  policies: string;
  technology: string;
  equipment: string;
  brands: string;
  team: string;
  faq: string;
  customer_information: string;
  appointment_process: string;
  preparation: string;
  aftercare: string;
  restrictions: string;
  opening_hours: string;
  contact: string;
};

export type MergedWebsiteKnowledge = {
  business_knowledge: BusinessKnowledgePackage;
  /** Backward-compatible homepage-style fields filled from the merged brain. */
  positioning: string;
  products: string;
  services: string;
  about: string;
  target_audience: string;
  messaging: string;
  value_proposition: string;
  cta: string;
  differentiators: string;
  trust_signals: string;
  contact_information: string;
  brand_tone: string;
  headings: string;
  paragraphs: string;
};

function uniqueLines(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned.length < 3) continue;
    const key = cleaned.toLowerCase().replace(/^•\s*/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned.startsWith("•") ? cleaned : `• ${cleaned}`);
    if (out.length >= limit) break;
  }
  return out;
}

function joinSection(values: string[], limit: number): string {
  return uniqueLines(values, limit).join("\n");
}

function collectMatching(
  pages: PageContentExtract[],
  predicate: (text: string, page: PageContentExtract) => boolean,
): string[] {
  const values: string[] = [];
  for (const page of pages) {
    const pool = [
      ...page.headings,
      ...page.subheadings,
      ...page.paragraphs,
      ...page.lists.flatMap((block) => block.split("\n")),
      ...page.tables.flatMap((block) => block.split("\n")),
      ...page.facts,
      ...page.faq,
    ];
    for (const text of pool) {
      if (predicate(text, page)) {
        values.push(text.replace(/^•\s*/, ""));
      }
    }
  }
  return values;
}

function labelIs(page: PageContentExtract, labels: string[]): boolean {
  return labels.some(
    (label) => page.label.toLowerCase() === label.toLowerCase(),
  );
}

export function mergeWebsiteKnowledge(
  pages: PageContentExtract[],
): MergedWebsiteKnowledge {
  const overview = joinSection(
    [
      ...pages.flatMap((page) => page.headings.slice(0, 2)),
      ...collectMatching(pages, (text, page) =>
        labelIs(page, ["Home", "About"]) ||
        /\b(?:we (?:are|provide|offer)|our (?:clinic|practice|mission|story))\b/i.test(
          text,
        ),
      ),
    ],
    12,
  );

  const products = joinSection(
    collectMatching(
      pages,
      (text, page) =>
        labelIs(page, ["Products"]) ||
        /\bproducts?\b|\bpackages?\b|\bmemberships?\b/i.test(text),
    ),
    20,
  );

  const services = joinSection(
    collectMatching(
      pages,
      (text, page) =>
        labelIs(page, ["Services", "Process"]) ||
        /\bservices?\b|\btreatments?\b|\bsolutions?\b/i.test(text),
    ),
    24,
  );

  const pricing = joinSection(
    [
      ...pages.flatMap((page) =>
        labelIs(page, ["Pricing"]) ? page.tables : [],
      ),
      ...collectMatching(
        pages,
        (text, page) =>
          labelIs(page, ["Pricing"]) ||
          /\$\s?\d|\bfrom\b|\bstarts at\b|\bpricing\b|\brates?\b/i.test(text),
      ),
    ],
    20,
  );

  const consultations = joinSection(
    collectMatching(
      pages,
      (text) =>
        /\bconsult(?:ation|ations)?\b|\bevaluation\b|\bassessment\b/i.test(text),
    ),
    12,
  );

  const policies = joinSection(
    collectMatching(
      pages,
      (text, page) =>
        labelIs(page, ["Policies"]) ||
        /\bpolic(?:y|ies)\b|\bcancellation\b|\brefund\b|\breschedul/i.test(text),
    ),
    16,
  );

  const technology = joinSection(
    collectMatching(
      pages,
      (text, page) =>
        labelIs(page, ["Technology"]) ||
        /\btechnology\b|\blaser\b|\bdevice\b|\bplatform\b/i.test(text),
    ),
    14,
  );

  const equipment = joinSection(
    collectMatching(pages, (text) =>
      /\bequipment\b|\bmachine\b|\bsystem\b|\bdevice\b/i.test(text),
    ),
    12,
  );

  const brands = joinSection(
    collectMatching(pages, (text) =>
      /\bbrand\b|\busing\b|\bfeaturing\b|\bpowered by\b/i.test(text),
    ),
    12,
  );

  const team = joinSection(
    collectMatching(
      pages,
      (text, page) =>
        labelIs(page, ["Team"]) ||
        /\bdr\.?\b|\bprovider\b|\bspecialist\b|\bteam\b|\bstaff\b/i.test(text),
    ),
    16,
  );

  const faq = joinSection(
    [
      ...pages.flatMap((page) => page.faq),
      ...collectMatching(pages, (text, page) => labelIs(page, ["FAQ"])),
    ],
    24,
  );

  const appointmentProcess = joinSection(
    collectMatching(
      pages,
      (text, page) =>
        labelIs(page, ["Booking", "Process"]) ||
        /\bbook\b|\bappointment\b|\bschedule\b|\bhow it works\b/i.test(text),
    ),
    16,
  );

  const preparation = joinSection(
    collectMatching(pages, (text) =>
      /\bprepar(?:e|ation)\b|\bbefore (?:your|the)\b|\bavoid\b/i.test(text),
    ),
    12,
  );

  const aftercare = joinSection(
    collectMatching(pages, (text) =>
      /\baftercare\b|\bafter (?:your|the|treatment)\b|\brecovery\b/i.test(text),
    ),
    12,
  );

  const restrictions = joinSection(
    collectMatching(pages, (text) =>
      /\brestrictions?\b|\bnot (?:recommended|suitable)\b|\bcontraindic/i.test(
        text,
      ),
    ),
    12,
  );

  const openingHours = joinSection(
    collectMatching(pages, (text) =>
      /\bhours?\b|\bmonday\b|\btuesday\b|\bopen\b|\bclosed\b/i.test(text),
    ),
    12,
  );

  const contact = joinSection(
    collectMatching(
      pages,
      (text, page) =>
        labelIs(page, ["Contact", "Locations"]) ||
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{7,}\d/i.test(
          text,
        ),
    ),
    12,
  );

  const customerInformation = joinSection(
    [
      ...policies.split("\n"),
      ...appointmentProcess.split("\n").slice(0, 6),
      ...openingHours.split("\n").slice(0, 4),
    ].filter(Boolean),
    16,
  );

  const business_knowledge: BusinessKnowledgePackage = {
    overview,
    products,
    services,
    pricing,
    consultations,
    policies,
    technology,
    equipment,
    brands,
    team,
    faq,
    customer_information: customerInformation,
    appointment_process: appointmentProcess,
    preparation,
    aftercare,
    restrictions,
    opening_hours: openingHours,
    contact,
  };

  const allHeadings = uniqueLines(
    pages.flatMap((page) => [...page.headings, ...page.subheadings]),
    30,
  ).map((line) => line.replace(/^•\s*/, ""));

  const allParagraphs = uniqueLines(
    pages.flatMap((page) => page.paragraphs),
    24,
  ).map((line) => line.replace(/^•\s*/, ""));

  return {
    business_knowledge,
    positioning: joinSection(
      [
        pages[0]?.title ?? "",
        ...pages.flatMap((page) => page.headings.slice(0, 1)),
        ...overview.split("\n").slice(0, 3),
      ].filter(Boolean),
      4,
    ).replace(/^• /gm, ""),
    products: products || business_knowledge.products,
    services: services || business_knowledge.services,
    about: overview,
    target_audience: joinSection(
      collectMatching(pages, (text) =>
        /\bfor (?:patients|clients|women|men|teams|companies)\b|\bbuilt for\b/i.test(
          text,
        ),
      ),
      8,
    ),
    messaging: joinSection(allParagraphs.slice(0, 4), 4).replace(/^• /gm, ""),
    value_proposition: joinSection(
      collectMatching(pages, (text) =>
        /\bhelp\b|\benable\b|\bbenefit\b|\bwhy (?:choose|us)\b/i.test(text),
      ),
      8,
    ),
    cta: joinSection(
      collectMatching(pages, (text) =>
        /\bbook\b|\bschedule\b|\bcontact\b|\bget started\b|\bcall\b/i.test(text),
      ),
      8,
    ),
    differentiators: joinSection(
      collectMatching(pages, (text) =>
        /\bunlike\b|\bunique\b|\bonly\b|\bdifferent\b|\badvantage\b/i.test(text),
      ),
      8,
    ),
    trust_signals: joinSection(
      collectMatching(pages, (text) =>
        /\bcertified\b|\bawarded?\b|\btrusted\b|\byears?\b|\bboard[- ]certified\b/i.test(
          text,
        ),
      ),
      8,
    ),
    contact_information: contact,
    brand_tone: allParagraphs.join(" ").length > 400
      ? "Professional / commercial"
      : "Concise / direct",
    headings: allHeadings.join("\n"),
    paragraphs: allParagraphs.join("\n"),
  };
}

export function emptyBusinessKnowledge(): BusinessKnowledgePackage {
  return {
    overview: "",
    products: "",
    services: "",
    pricing: "",
    consultations: "",
    policies: "",
    technology: "",
    equipment: "",
    brands: "",
    team: "",
    faq: "",
    customer_information: "",
    appointment_process: "",
    preparation: "",
    aftercare: "",
    restrictions: "",
    opening_hours: "",
    contact: "",
  };
}

export function formatBusinessKnowledgeForPipeline(
  knowledge: BusinessKnowledgePackage,
): string {
  const sections: Array<[string, string]> = [
    ["Business Overview", knowledge.overview],
    ["Products", knowledge.products],
    ["Services", knowledge.services],
    ["Pricing", knowledge.pricing],
    ["Consultations", knowledge.consultations],
    ["Policies", knowledge.policies],
    ["Technology", knowledge.technology],
    ["Equipment", knowledge.equipment],
    ["Brands", knowledge.brands],
    ["Team", knowledge.team],
    ["Frequently Asked Questions", knowledge.faq],
    ["Important Customer Information", knowledge.customer_information],
    ["Appointment Process", knowledge.appointment_process],
    ["Preparation Instructions", knowledge.preparation],
    ["Aftercare", knowledge.aftercare],
    ["Restrictions", knowledge.restrictions],
    ["Opening Hours", knowledge.opening_hours],
    ["Contact", knowledge.contact],
  ];

  return sections
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}:\n${value.trim()}`)
    .join("\n\n");
}

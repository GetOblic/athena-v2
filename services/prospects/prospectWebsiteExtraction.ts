/**
 * Rich content extraction from a single HTML page for Prospect website learning.
 * Strips navigation/footer/cookie noise and limits testimonial volume.
 */

export type PageContentExtract = {
  url: string;
  title: string | null;
  label: string;
  headings: string[];
  subheadings: string[];
  paragraphs: string[];
  lists: string[];
  tables: string[];
  faq: string[];
  facts: string[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function uniquePreserve(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned.length < 3) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function removeNoiseRegions(html: string): string {
  return html
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ")
    .replace(
      /<(?:div|section|form)\b[^>]*(?:cookie|consent|newsletter|popup|modal|subscribe)[^>]*>[\s\S]*?<\/(?:div|section|form)>/gi,
      " ",
    )
    .replace(
      /<(?:div|section)\b[^>]*(?:testimonial|review|social|share)[^>]*>[\s\S]*?<\/(?:div|section)>/gi,
      " ",
    );
}

function extractMatches(html: string, pattern: RegExp): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const text = stripTags(match[1] ?? "");
    if (text.length >= 2) values.push(text);
  }
  return values;
}

function isTestimonialLike(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("★★") ||
    lower.includes("testimonial") ||
    lower.includes("google review") ||
    /\b\d(\.\d)?\s*\/\s*5\b/.test(lower) ||
    (lower.includes("review") && lower.length < 220)
  );
}

function extractListBlocks(html: string): string[] {
  const blocks: string[] = [];
  for (const match of html.matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const items = extractMatches(match[2] ?? "", /<li\b[^>]*>([\s\S]*?)<\/li>/gi)
      .filter((item) => !isTestimonialLike(item))
      .slice(0, 20);
    if (items.length === 0) continue;
    blocks.push(items.map((item) => `• ${item}`).join("\n"));
  }
  return blocks;
}

function extractTables(html: string): string[] {
  const tables: string[] = [];
  for (const match of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows: string[] = [];
    for (const rowMatch of (match[1] ?? "").matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi,
    )) {
      const cells = extractMatches(
        rowMatch[1] ?? "",
        /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi,
      );
      if (cells.length > 0) {
        rows.push(cells.join(" | "));
      }
    }
    if (rows.length > 0) {
      tables.push(rows.slice(0, 20).join("\n"));
    }
  }
  return tables;
}

function extractFaqPairs(html: string, headings: string[]): string[] {
  const faq: string[] = [];
  for (const match of html.matchAll(
    /<(?:details|div|section)\b[^>]*(?:faq|accordion|question)[^>]*>([\s\S]*?)<\/(?:details|div|section)>/gi,
  )) {
    const text = stripTags(match[1] ?? "");
    if (text.length >= 20 && text.length <= 800) {
      faq.push(text);
    }
  }

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (!/\?$/.test(heading) && !/\bfaq\b/i.test(heading)) continue;
    faq.push(heading);
  }

  return uniquePreserve(faq, 20);
}

function extractFacts(paragraphs: string[], lists: string[]): string[] {
  const factKeywords = [
    "open",
    "hour",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "cancel",
    "policy",
    "price",
    "$",
    "from ",
    "starts at",
    "book",
    "consult",
    "appointment",
    "prepare",
    "aftercare",
    "avoid",
    "require",
    "located",
    "phone",
    "email",
  ];
  const candidates = [
    ...paragraphs,
    ...lists.flatMap((block) => block.split("\n")),
  ];
  return uniquePreserve(
    candidates.filter((text) => {
      const lower = text.toLowerCase();
      if (isTestimonialLike(text)) return false;
      return factKeywords.some((keyword) => lower.includes(keyword));
    }),
    40,
  );
}

export function extractPageContent(
  html: string,
  url: string,
  label: string,
): PageContentExtract {
  const cleaned = removeNoiseRegions(html);
  const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : null;

  const headings = uniquePreserve(
    extractMatches(cleaned, /<h1[^>]*>([\s\S]*?)<\/h1>/gi),
    12,
  );
  const subheadings = uniquePreserve(
    [
      ...extractMatches(cleaned, /<h2[^>]*>([\s\S]*?)<\/h2>/gi),
      ...extractMatches(cleaned, /<h3[^>]*>([\s\S]*?)<\/h3>/gi),
    ],
    24,
  );

  const paragraphs = uniquePreserve(
    extractMatches(cleaned, /<p[^>]*>([\s\S]*?)<\/p>/gi).filter((value) => {
      if (value.length < 35 || value.length > 900) return false;
      return !isTestimonialLike(value);
    }),
    30,
  );

  const lists = uniquePreserve(extractListBlocks(cleaned), 20);
  const tables = uniquePreserve(extractTables(cleaned), 8);
  const faq = extractFaqPairs(cleaned, [...headings, ...subheadings]);
  const facts = extractFacts(paragraphs, lists);

  return {
    url,
    title,
    label,
    headings,
    subheadings,
    paragraphs,
    lists,
    tables,
    faq,
    facts,
  };
}

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPECTED_FIXTURE_SLOTS } from "./constants";
import { fixturesDir } from "./paths";

export type ProspectFixture = {
  id: string;
  slot: (typeof EXPECTED_FIXTURE_SLOTS)[number];
  businessType: string;
  evidenceRichness: "sparse" | "medium" | "rich" | "medium-rich";
  notes: string;
  context: {
    organizationName: string;
    greetingName: string;
    aboutYou: string;
    expertise: string;
    website: string;
    businessName: string;
    industry: string;
    category: string;
    city: string | null;
    summary: string;
    painPoints: string[];
    buyerStage: string;
    websiteSummary: string;
    businessKnowledge: string[];
    sourceBody: string;
  };
};

function isSlot(value: string): value is ProspectFixture["slot"] {
  return (EXPECTED_FIXTURE_SLOTS as readonly string[]).includes(value);
}

export function validateProspectFixture(
  value: unknown,
  fileName: string,
): ProspectFixture {
  if (!value || typeof value !== "object") {
    throw new Error(`Fixture ${fileName}: expected object.`);
  }
  const record = value as Record<string, unknown>;
  const context = record.context;
  if (!context || typeof context !== "object") {
    throw new Error(`Fixture ${fileName}: missing context.`);
  }
  const ctx = context as Record<string, unknown>;
  const slot = String(record.slot ?? "");
  if (!isSlot(slot)) {
    throw new Error(`Fixture ${fileName}: invalid slot ${slot}.`);
  }
  const richness = String(record.evidenceRichness ?? "");
  if (!["sparse", "medium", "rich", "medium-rich"].includes(richness)) {
    throw new Error(`Fixture ${fileName}: invalid evidenceRichness.`);
  }
  const notes = String(record.notes ?? "");
  if (!/synthetic fixture only/i.test(notes)) {
    throw new Error(
      `Fixture ${fileName}: notes must declare "Synthetic fixture only".`,
    );
  }

  return {
    id: String(record.id ?? "").trim(),
    slot,
    businessType: String(record.businessType ?? "").trim(),
    evidenceRichness: richness as ProspectFixture["evidenceRichness"],
    notes: String(record.notes ?? "").trim(),
    context: {
      organizationName: String(ctx.organizationName ?? "Synthetic Org"),
      greetingName: String(ctx.greetingName ?? "Operator"),
      aboutYou: String(ctx.aboutYou ?? ""),
      expertise: String(ctx.expertise ?? ""),
      website: String(ctx.website ?? "https://example.test"),
      businessName: String(ctx.businessName ?? ""),
      industry: String(ctx.industry ?? ""),
      category: String(ctx.category ?? ""),
      city: ctx.city == null ? null : String(ctx.city),
      summary: String(ctx.summary ?? ""),
      painPoints: Array.isArray(ctx.painPoints)
        ? ctx.painPoints.map((item) => String(item))
        : [],
      buyerStage: String(ctx.buyerStage ?? "consideration"),
      websiteSummary: String(ctx.websiteSummary ?? ""),
      businessKnowledge: Array.isArray(ctx.businessKnowledge)
        ? ctx.businessKnowledge.map((item) => String(item))
        : [],
      sourceBody: String(ctx.sourceBody ?? ""),
    },
  };
}

export function loadProspectFixtures(cwd = process.cwd()): ProspectFixture[] {
  const dir = fixturesDir(cwd);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (files.length !== 8) {
    throw new Error(`Expected 8 prospect fixtures; found ${files.length}.`);
  }

  const fixtures = files.map((fileName) => {
    const raw = readFileSync(join(dir, fileName), "utf8");
    return validateProspectFixture(JSON.parse(raw), fileName);
  });

  const slots = new Set(fixtures.map((fixture) => fixture.slot));
  for (const expected of EXPECTED_FIXTURE_SLOTS) {
    if (!slots.has(expected)) {
      throw new Error(`Missing fixture slot ${expected}.`);
    }
  }

  return fixtures;
}

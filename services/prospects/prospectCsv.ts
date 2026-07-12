/**
 * Pure CSV helpers for Prospect Intelligence imports.
 */

export type ProspectCsvRow = {
  business_name?: string | null;
  website?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  industry?: string | null;
  category?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  company_size?: string | null;
  revenue?: string | null;
  employee_count?: string | null;
  technologies?: string | null;
  pain_points?: string | null;
  decision_maker?: string | null;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  google_business_url?: string | null;
  notes?: string | null;
  additional_context?: string | null;
  source?: string | null;
};

/** Minimal CSV parser supporting quoted fields. */
export function parseProspectCsv(text: string): ProspectCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];

  const rows = lines.map(parseCsvLine);
  const headers = rows[0].map((header) =>
    header.trim().toLowerCase().replace(/\s+/g, "_"),
  );

  const alias: Record<string, keyof ProspectCsvRow> = {
    business_name: "business_name",
    business: "business_name",
    company: "business_name",
    company_name: "business_name",
    name: "business_name",
    website: "website",
    url: "website",
    linkedin: "linkedin",
    linkedin_url: "linkedin",
    facebook: "facebook",
    facebook_url: "facebook",
    instagram: "instagram",
    instagram_url: "instagram",
    industry: "industry",
    category: "category",
    country: "country",
    state: "state",
    city: "city",
    address: "address",
    company_size: "company_size",
    size: "company_size",
    revenue: "revenue",
    employee_count: "employee_count",
    employees: "employee_count",
    technologies: "technologies",
    technology: "technologies",
    tech_stack: "technologies",
    pain_points: "pain_points",
    pain_point: "pain_points",
    decision_maker: "decision_maker",
    contact: "decision_maker",
    contact_name: "decision_maker",
    job_title: "job_title",
    title: "job_title",
    email: "email",
    phone: "phone",
    google_business_url: "google_business_url",
    google_business: "google_business_url",
    gbp: "google_business_url",
    notes: "notes",
    additional_context: "additional_context",
    context: "additional_context",
    source: "source",
  };

  return rows.slice(1).map((cells) => {
    const row: ProspectCsvRow = {};
    headers.forEach((header, index) => {
      const key = alias[header];
      if (!key) return;
      row[key] = cells[index]?.trim() || null;
    });
    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

import * as cheerio from "cheerio";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function typeIncludes(node: JsonRecord, typeName: string): boolean {
  const value = node["@type"];
  if (typeof value === "string") return value.toLowerCase() === typeName.toLowerCase();
  if (Array.isArray(value)) {
    return value.some(
      (entry) => typeof entry === "string" && entry.toLowerCase() === typeName.toLowerCase(),
    );
  }
  return false;
}

function flattenNodes(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap((entry) => flattenNodes(entry));
  const record = asRecord(value);
  if (!record) return [];
  const graph = record["@graph"];
  if (Array.isArray(graph)) return graph.flatMap((entry) => flattenNodes(entry));
  return [record];
}

export function readJsonLd(html: string): {
  product: JsonRecord | null;
  breadcrumbNames: string[];
} {
  const $ = cheerio.load(html);
  const nodes: JsonRecord[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();
    if (!raw.trim()) return;
    try {
      nodes.push(...flattenNodes(JSON.parse(raw)));
    } catch {
      // Untrusted pages can contain broken JSON-LD. Skip that block.
    }
  });

  const product = nodes.find((node) => typeIncludes(node, "Product")) ?? null;
  const breadcrumb = nodes.find((node) => typeIncludes(node, "BreadcrumbList"));
  const breadcrumbNames: string[] = [];
  const items = breadcrumb ? breadcrumb.itemListElement : null;
  if (Array.isArray(items)) {
    const ordered = items
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => Boolean(item))
      .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0));
    for (const item of ordered) {
      if (typeof item.name === "string") breadcrumbNames.push(item.name);
    }
  }
  return { product, breadcrumbNames };
}

export function jsonLdString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = jsonLdString(entry);
      if (text) return text;
    }
  }
  return null;
}

export function jsonLdPrice(product: JsonRecord | null): {
  price: number | null;
  currency: string | null;
} {
  const offer = asRecord(product?.offers) ?? (Array.isArray(product?.offers) ? asRecord(product?.offers[0]) : null);
  if (!offer) return { price: null, currency: null };
  const raw = offer.price;
  const numeric = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  const currency = typeof offer.priceCurrency === "string" ? offer.priceCurrency : null;
  return {
    price: Number.isFinite(numeric) ? numeric : null,
    currency,
  };
}

export function jsonLdBrand(product: JsonRecord | null): string | null {
  const brand = product?.brand;
  if (typeof brand === "string") return brand;
  const record = asRecord(brand);
  return typeof record?.name === "string" ? record.name : null;
}

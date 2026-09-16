import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { resolveSeoProspectPdfColors } from "@/services/seo/seoProspectPdf/seoProspectPdfColors";
import { mapBrandFontToPdfKit } from "@/services/seo/seoProspectPdf/seoProspectPdfFonts";
import {
  collectPdfKitBuffer,
  createSeoProspectPdfDocument,
} from "@/services/seo/seoProspectPdf/seoProspectPdfKit";
import {
  parseSeoProspectPdfScore,
  sanitizeSeoProspectPdfText,
} from "@/services/seo/seoProspectPdf/seoProspectPdfText";
import {
  SEO_PROSPECT_PDF_PAGE as PAGE,
  SEO_PROSPECT_PDF_SPACE as SPACE,
  SEO_PROSPECT_PDF_TYPE as TYPE,
} from "@/services/seo/seoProspectPdf/seoProspectPdfTokens";
import type {
  SeoProspectPdfBlock,
  SeoProspectPdfBrandAssets,
  SeoProspectPdfCalloutTone,
  SeoProspectPdfCardVariant,
  SeoProspectPdfDocumentModel,
  SeoProspectPdfField,
  SeoProspectPdfFontFamily,
  SeoProspectPdfListVariant,
  SeoProspectPdfMetricRow,
  SeoProspectPdfPageRecord,
  SeoProspectPdfParties,
  SeoProspectPdfPriorityTone,
  SeoProspectPdfResolvedColors,
  SeoProspectPdfSafeImage,
  SeoProspectPdfSection,
} from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";

const LEFT = PAGE.marginLeft;
const WIDTH = PAGE.contentWidth;
const RIGHT = LEFT + WIDTH;

function txt(value: string): string {
  return sanitizeSeoProspectPdfText(value);
}

function toneAccent(
  tone: SeoProspectPdfPriorityTone,
  colors: SeoProspectPdfResolvedColors,
): string {
  if (tone === "critical") return colors.accent;
  if (tone === "high") return colors.primary;
  if (tone === "medium") return colors.secondary;
  return colors.muted;
}

function listAccent(
  variant: SeoProspectPdfListVariant,
  colors: SeoProspectPdfResolvedColors,
): { mark: string; ink: string } {
  if (variant === "positive") {
    return { mark: colors.primary, ink: colors.strengthInk };
  }
  if (variant === "attention") {
    return { mark: colors.attentionInk, ink: colors.attentionInk };
  }
  if (variant === "missing") {
    return { mark: colors.accent, ink: colors.ink };
  }
  if (variant === "opportunity") {
    return { mark: colors.secondary, ink: colors.ink };
  }
  return { mark: colors.secondary, ink: colors.ink };
}

function calloutSurface(
  tone: SeoProspectPdfCalloutTone,
  colors: SeoProspectPdfResolvedColors,
): { fill: string; rule: string; label: string } {
  if (tone === "strength") {
    return {
      fill: colors.strengthSurface,
      rule: colors.primary,
      label: colors.strengthInk,
    };
  }
  if (tone === "attention") {
    return {
      fill: colors.attentionSurface,
      rule: colors.attentionInk,
      label: colors.attentionInk,
    };
  }
  return {
    fill: colors.surface,
    rule: colors.primary,
    label: colors.secondary,
  };
}

function tryDrawImage(
  doc: PDFKit.PDFDocument,
  image: SeoProspectPdfSafeImage,
  x: number,
  y: number,
  options: PDFKit.Mixins.ImageOption,
): number {
  try {
    const startY = y;
    doc.image(image.bytes, x, y, options);
    const height =
      typeof options.fit?.[1] === "number"
        ? options.fit[1]
        : typeof options.height === "number"
          ? options.height
          : 36;
    return startY + height;
  } catch {
    console.warn("[SEO_PROSPECT_PDF] brand_image_omitted");
    return y;
  }
}

function drawFramedImage(
  doc: PDFKit.PDFDocument,
  image: SeoProspectPdfSafeImage,
  x: number,
  y: number,
  size: { width: number; height: number },
  rule: string,
): void {
  try {
    doc.save();
    doc
      .roundedRect(x, y, size.width, size.height, 3)
      .lineWidth(0.8)
      .strokeColor(rule)
      .stroke();
    doc
      .roundedRect(x + 1.25, y + 1.25, size.width - 2.5, size.height - 2.5, 2)
      .clip();
    doc.image(image.bytes, x + 1.25, y + 1.25, {
      fit: [size.width - 2.5, size.height - 2.5],
      align: "center",
      valign: "center",
    });
    doc.restore();
  } catch {
    console.warn("[SEO_PROSPECT_PDF] brand_image_omitted");
  }
}

export class SeoProspectPdfShell {
  private readonly doc: PDFKit.PDFDocument;
  private readonly colors: SeoProspectPdfResolvedColors;
  private readonly fonts: SeoProspectPdfFontFamily;
  private pageNumber = 1;
  private mode: "cover" | "body" | "close" = "cover";
  private currentSectionTitle = "";

  constructor(
    private readonly input: {
      model: SeoProspectPdfDocumentModel;
      parties: SeoProspectPdfParties;
      brand: SeoProspectPdfBrandAssets;
      messages: TenantMessages;
    },
  ) {
    this.colors = resolveSeoProspectPdfColors(input.brand.identity);
    this.fonts = mapBrandFontToPdfKit(input.brand.identity?.brand_font);
    this.doc = createSeoProspectPdfDocument({
      title: `${input.model.lens} — ${input.parties.subject.name}`,
      author: input.parties.sender.name,
      subject: input.model.analyzedDomain
        ? `${input.parties.subject.name} · ${input.model.analyzedDomain}`
        : input.parties.subject.name,
    });
    this.doc.on("pageAdded", () => {
      this.pageNumber += 1;
      if (this.mode === "body") this.drawChrome();
    });
  }

  async render(): Promise<Buffer> {
    const finished = collectPdfKitBuffer(this.doc);
    this.mode = "cover";
    this.withFixedPage(() => this.drawCover());
    this.currentSectionTitle =
      this.input.model.sections[0]?.title ?? this.input.model.lens;
    this.mode = "body";
    this.doc.addPage();
    this.drawBody();
    this.mode = "close";
    this.doc.addPage();
    this.withFixedPage(() => this.drawClose());
    this.doc.end();
    return finished;
  }

  private withFixedPage(draw: () => void) {
    const margins = this.doc.page.margins;
    const previous = {
      top: margins.top,
      bottom: margins.bottom,
      left: margins.left,
      right: margins.right,
    };
    margins.top = 0;
    margins.bottom = 0;
    margins.left = 0;
    margins.right = 0;
    draw();
    margins.top = previous.top;
    margins.bottom = previous.bottom;
    margins.left = previous.left;
    margins.right = previous.right;
  }

  private drawCover() {
    const { doc, colors, fonts, input } = this;
    const { model, parties, brand, messages } = input;
    const copy = messages.seo.prospectPdf;
    const wash = colors.coverWash ?? colors.primaryTint;

    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(wash);
    doc.restore();
    doc.save();
    doc.rect(0, 0, PAGE.coverLeftRule, doc.page.height).fill(colors.primary);
    doc.restore();

    const identityTop = 56;
    const portrait = { width: 92, height: 112 };
    const nameWidth = brand.profilePicture ? WIDTH - portrait.width - 20 : WIDTH;
    if (brand.logo) {
      tryDrawImage(doc, brand.logo, LEFT, identityTop, {
        fit: [228, 64],
      });
    }
    if (brand.profilePicture) {
      drawFramedImage(
        doc,
        brand.profilePicture,
        RIGHT - portrait.width,
        identityTop,
        portrait,
        colors.rule,
      );
    }

    let cursorY = identityTop + (brand.logo ? 76 : 0);
    doc
      .font(fonts.regular)
      .fontSize(TYPE.coverEyebrow)
      .fillColor(colors.secondary)
      .text(txt(copy.presentedBy).toUpperCase(), LEFT, cursorY, {
        width: nameWidth,
      });
    cursorY = doc.y + 5;
    doc
      .font(fonts.bold)
      .fontSize(14)
      .fillColor(colors.ink)
      .text(txt(parties.sender.name), LEFT, cursorY, { width: nameWidth });

    const ruleY = Math.max(
      doc.y + 22,
      identityTop + (brand.profilePicture ? portrait.height : 0) + 22,
    );
    doc
      .moveTo(LEFT, ruleY)
      .lineTo(RIGHT, ruleY)
      .strokeColor(colors.primary)
      .lineWidth(SPACE.brandRule)
      .stroke();

    cursorY = ruleY + 58;
    doc
      .font(fonts.regular)
      .fontSize(TYPE.coverEyebrow)
      .fillColor(colors.accent)
      .text(txt(copy.seoIntelligenceReport).toUpperCase(), LEFT, cursorY, {
        width: WIDTH,
      });
    cursorY = doc.y + 10;

    doc
      .font(fonts.bold)
      .fontSize(TYPE.coverTitle)
      .fillColor(colors.primary)
      .text(txt(model.lens), LEFT, cursorY, { width: WIDTH, lineGap: 2 });
    cursorY = doc.y + 28;

    doc
      .font(fonts.regular)
      .fontSize(TYPE.coverPrepared)
      .fillColor(colors.muted)
      .text(txt(copy.preparedFor).toUpperCase(), LEFT, cursorY, {
        width: WIDTH,
      });
    cursorY = doc.y + 6;
    doc
      .font(fonts.bold)
      .fontSize(TYPE.coverSubject)
      .fillColor(colors.ink)
      .text(txt(parties.subject.name), LEFT, cursorY, { width: WIDTH });

    const panelTop = 668;
    const panelHeight = 118;
    doc.save();
    doc
      .rect(LEFT, panelTop, WIDTH, panelHeight)
      .fill(colors.paper);
    doc.restore();
    doc
      .moveTo(LEFT, panelTop)
      .lineTo(RIGHT, panelTop)
      .strokeColor(colors.primary)
      .lineWidth(1.25)
      .stroke();

    let metaY = panelTop + 18;
    if (model.analyzedDomain) {
      this.coverMeta(copy.analyzedDomain, model.analyzedDomain, metaY);
      metaY = doc.y + 8;
    }
    this.coverMeta(copy.reportDate, model.reportDateLabel, metaY);
    metaY = doc.y + 8;
    if (model.capturedAtLabel) {
      this.coverMeta(copy.websiteCaptured, model.capturedAtLabel, metaY);
    }
  }

  private coverMeta(label: string, value: string, y: number) {
    const { doc, colors, fonts } = this;
    doc
      .font(fonts.regular)
      .fontSize(TYPE.coverMetaLabel)
      .fillColor(colors.muted)
      .text(txt(label).toUpperCase(), LEFT + 16, y, {
        width: 168,
      });
    doc
      .font(fonts.bold)
      .fontSize(TYPE.coverMetaValue)
      .fillColor(colors.ink)
      .text(txt(value), LEFT + 186, y, { width: WIDTH - 202 });
  }

  private drawBody() {
    const { input } = this;
    let sectionNumber = 0;
    input.model.sections.forEach((section, index) => {
      this.currentSectionTitle = section.title;
      const next = input.model.sections[index + 1];
      if (section.role === "appendix") {
        this.beginAppendix();
        this.appendixHeading(section);
      } else if (section.role === "methodology") {
        this.methodologyHeading(section);
      } else {
        sectionNumber = section.number ?? sectionNumber + 1;
        this.sectionHeading(sectionNumber, section.title, section.role);
      }
      for (const block of section.blocks) {
        this.drawBlock(block, section);
      }
      const after =
        section.role === "snapshot" && next?.role === "snapshot"
          ? SPACE.snapshotGap
          : SPACE.afterSection;
      this.doc.y += after - SPACE.afterBlock;
    });
  }

  private drawBlock(block: SeoProspectPdfBlock, section: SeoProspectPdfSection) {
    switch (block.type) {
      case "lede":
        this.lede(block.text);
        return;
      case "paragraph":
        this.bodyText(block.text);
        return;
      case "note":
        this.note(block.text, section.role === "notes" || section.role === "methodology");
        return;
      case "bullets":
        this.bullets(block.items);
        return;
      case "fields":
        this.fields(block.entries);
        return;
      case "score":
        this.score(block);
        return;
      case "priorityItem":
        this.priorityItem(block);
        return;
      case "pageCard":
        this.pageCard(block);
        return;
      case "code":
        this.code(block.text);
        return;
      case "callout":
        this.callout(block);
        return;
      case "subsection":
        this.subsection(block.title);
        return;
      case "categoryList":
        this.categoryList(block);
        return;
      case "metricRows":
        this.metricRows(block.entries);
        return;
      case "pageRecord":
        this.pageRecord(block);
        return;
    }
  }

  private sectionHeading(
    index: number,
    title: string,
    role?: SeoProspectPdfSection["role"],
  ) {
    const quiet = role === "notes";
    this.ensureSpace(quiet ? 46 : 58);
    const number = String(index).padStart(2, "0");
    const y = this.doc.y;
    const box = 18;
    this.doc.save();
    this.doc.roundedRect(LEFT, y, box, box, 2).fill(this.colors.primary);
    this.doc.restore();
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.sectionNumber)
      .fillColor(this.colors.onPrimary)
      .text(number, LEFT, y + 4.5, {
        width: box,
        align: "center",
        lineBreak: false,
      });
    this.doc
      .font(this.fonts.bold)
      .fontSize(quiet ? TYPE.subsection : TYPE.sectionTitle)
      .fillColor(this.colors.ink)
      .text(txt(title), LEFT + box + 10, y + (quiet ? 3 : 1), {
        width: WIDTH - box - 10,
      });
    const ruleY = Math.max(this.doc.y, y + box) + 8;
    this.doc
      .moveTo(LEFT, ruleY)
      .lineTo(RIGHT, ruleY)
      .strokeColor(this.colors.rule)
      .lineWidth(SPACE.rule)
      .stroke();
    this.doc.y = ruleY + 12;
  }

  private beginAppendix() {
    if (this.doc.y > PAGE.marginTop + 4) {
      this.doc.addPage();
    }
  }

  private appendixHeading(section: SeoProspectPdfSection) {
    this.ensureSpace(section.subtitle ? 64 : 48);
    const copy = this.input.messages.seo.prospectPdf;
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.label)
      .fillColor(this.colors.secondary)
      .text(txt(section.eyebrow ?? copy.appendix).toUpperCase(), LEFT, this.doc.y, {
        width: WIDTH,
      });
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.subsection)
      .fillColor(this.colors.ink)
      .text(txt(section.title), LEFT, this.doc.y + 4, { width: WIDTH });
    if (section.subtitle) {
      this.doc
        .font(this.fonts.regular)
        .fontSize(TYPE.metadata)
        .fillColor(this.colors.muted)
        .text(txt(section.subtitle), LEFT, this.doc.y + 3, { width: WIDTH });
    }
    this.doc
      .moveTo(LEFT, this.doc.y + 8)
      .lineTo(RIGHT, this.doc.y + 8)
      .strokeColor(this.colors.rule)
      .lineWidth(SPACE.rule)
      .stroke();
    this.doc.y += 14;
  }

  private methodologyHeading(section: SeoProspectPdfSection) {
    this.ensureSpace(40);
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.label)
      .fillColor(this.colors.muted)
      .text(txt(section.title).toUpperCase(), LEFT, this.doc.y, {
        width: WIDTH,
      });
    this.doc.moveDown(0.45);
  }

  private subsection(title: string) {
    if (!title.trim()) return;
    this.ensureSpace(28);
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.subsection)
      .fillColor(this.colors.ink)
      .text(txt(title), LEFT, this.doc.y, { width: WIDTH });
    this.doc.moveDown(0.28);
  }

  private lede(text: string) {
    if (!text.trim()) return;
    this.ensureSpace(36);
    this.doc
      .font(this.fonts.regular)
      .fontSize(TYPE.lede)
      .fillColor(this.colors.ink)
      .text(txt(text), LEFT, this.doc.y, { width: WIDTH, lineGap: 3.2 });
    this.doc.y += SPACE.afterParagraph;
  }

  private bodyText(text: string) {
    if (!text.trim()) return;
    this.ensureSpace(24);
    this.doc
      .font(this.fonts.regular)
      .fontSize(TYPE.body)
      .fillColor(this.colors.ink)
      .text(txt(text), LEFT, this.doc.y, { width: WIDTH, lineGap: 2.8 });
    this.doc.y += SPACE.afterParagraph;
  }

  private note(text: string, subdued: boolean) {
    if (!text.trim()) return;
    const height = this.measure(text, TYPE.metadata, 2) + 16;
    this.ensureSpace(Math.min(height, 48));
    const y = this.doc.y;
    if (subdued) {
      this.doc.save();
      this.doc.roundedRect(LEFT, y, WIDTH, height, 3).fill(this.colors.surface);
      this.doc.restore();
      this.doc
        .font(this.fonts.regular)
        .fontSize(TYPE.metadata)
        .fillColor(this.colors.muted)
        .text(txt(text), LEFT + 10, y + 8, { width: WIDTH - 20, lineGap: 2 });
      this.doc.y = y + height + 8;
      return;
    }
    this.doc
      .font(this.fonts.regular)
      .fontSize(TYPE.metadata)
      .fillColor(this.colors.muted)
      .text(txt(text), LEFT, y, { width: WIDTH, lineGap: 2 });
    this.doc.y += SPACE.afterParagraph;
  }

  private bullets(items: string[]) {
    const usable = items.map((item) => item.trim()).filter(Boolean);
    if (!usable.length) return;
    for (const item of usable) {
      this.ensureSpace(20);
      this.bulletLine(item);
    }
    this.doc.y += 6;
  }

  private bulletLine(item: string) {
    const y = this.doc.y;
    this.doc
      .font(this.fonts.regular)
      .fontSize(TYPE.body)
      .fillColor(this.colors.ink)
      .text("•", LEFT, y, { width: 12, lineBreak: false });
    this.doc.text(txt(item), LEFT + 14, y, { width: WIDTH - 14, lineGap: 2 });
    this.doc.y += SPACE.listGap;
  }

  private categoryList(block: {
    variant: SeoProspectPdfListVariant;
    label: string;
    items: string[];
  }) {
    const usable = block.items.map((item) => item.trim()).filter(Boolean);
    if (!usable.length) return;
    this.ensureSpace(34);
    const accent = listAccent(block.variant, this.colors);
    const y = this.doc.y;
    this.doc.save();
    this.doc.rect(LEFT, y + 3, 7, 7).fill(accent.mark);
    this.doc.restore();
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.label)
      .fillColor(accent.ink)
      .text(txt(block.label).toUpperCase(), LEFT + 14, y + 1, {
        width: WIDTH - 14,
      });
    this.doc.y += 8;
    for (const item of usable) {
      this.ensureSpace(18);
      this.bulletLine(item);
    }
    this.doc.y += 8;
  }

  private fields(entries: SeoProspectPdfField[]) {
    const usable = entries.filter((entry) => entry.value.trim());
    if (!usable.length) return;
    for (const entry of usable) {
      this.keepFieldTogether(entry);
    }
    this.doc.y += 4;
  }

  private keepFieldTogether(entry: SeoProspectPdfField) {
    const needed = 16 + this.measure(entry.value, TYPE.body, 2);
    this.ensureSpace(Math.min(needed, 72));
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.label)
      .fillColor(this.colors.secondary)
      .text(txt(entry.label), LEFT, this.doc.y, { width: WIDTH });
    this.doc
      .font(this.fonts.regular)
      .fontSize(TYPE.body)
      .fillColor(this.colors.ink)
      .text(txt(entry.value), LEFT, this.doc.y + 2, {
        width: WIDTH,
        lineGap: 2.2,
      });
    this.doc.y += 8;
  }

  private score(block: {
    label: string;
    value: string;
    help: string;
    max?: number;
  }) {
    const numeric = parseSeoProspectPdfScore(block.value);
    const max = block.max ?? 100;
    const cardHeight = 92;
    this.ensureSpace(cardHeight + 28);
    const y = this.doc.y;
    this.doc.save();
    this.doc.roundedRect(LEFT, y, WIDTH, cardHeight, 4).fill(this.colors.surface);
    this.doc.restore();
    this.doc.save();
    this.doc.rect(LEFT, y, 4, cardHeight).fill(this.colors.primary);
    this.doc.restore();

    const valueX = LEFT + 18;
    if (numeric != null) {
      this.doc
        .font(this.fonts.bold)
        .fontSize(TYPE.kpiValue)
        .fillColor(this.colors.primary)
        .text(txt(block.value), valueX, y + 12, { width: 88, lineBreak: false });
      this.doc
        .font(this.fonts.regular)
        .fontSize(TYPE.kpiDenom)
        .fillColor(this.colors.muted)
        .text(`/${max}`, valueX + 78, y + 32, { width: 40, lineBreak: false });
    } else {
      this.doc
        .font(this.fonts.bold)
        .fontSize(18)
        .fillColor(this.colors.primary)
        .text(txt(block.value), valueX, y + 22, { width: 150 });
    }
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.label)
      .fillColor(this.colors.secondary)
      .text(txt(block.label).toUpperCase(), LEFT + 176, y + 22, {
        width: WIDTH - 194,
      });

    const trackY = y + 62;
    const trackX = LEFT + 18;
    const trackW = WIDTH - 36;
    this.doc.save();
    this.doc.roundedRect(trackX, trackY, trackW, 6, 3).fill(this.colors.surfaceMuted);
    this.doc.restore();
    if (numeric != null) {
      const fill = Math.max(0.04, Math.min(1, numeric / max)) * trackW;
      this.doc.save();
      this.doc.roundedRect(trackX, trackY, fill, 6, 3).fill(this.colors.accent);
      this.doc.restore();
    }
    this.doc.y = y + cardHeight + 8;
    if (block.help.trim()) {
      this.doc
        .font(this.fonts.regular)
        .fontSize(TYPE.metadata)
        .fillColor(this.colors.muted)
        .text(txt(block.help), LEFT, this.doc.y, { width: WIDTH, lineGap: 1.8 });
      this.doc.y += 8;
    }
  }

  private metricRows(entries: SeoProspectPdfMetricRow[]) {
    const usable = entries.filter((entry) => entry.value.trim());
    if (!usable.length) return;
    this.ensureSpace(24 + usable.length * 22);
    for (const entry of usable) {
      this.ensureSpace(24);
      const y = this.doc.y;
      this.doc
        .font(this.fonts.regular)
        .fontSize(TYPE.metadata)
        .fillColor(this.colors.ink)
        .text(txt(entry.label), LEFT, y, { width: WIDTH - 56 });
      this.doc
        .font(this.fonts.bold)
        .fontSize(TYPE.metadata)
        .fillColor(this.colors.primary)
        .text(txt(entry.value), LEFT + WIDTH - 52, y, {
          width: 52,
          align: "right",
        });
      const trackY = y + 13;
      this.doc.save();
      this.doc.roundedRect(LEFT, trackY, WIDTH, 3.5, 1.5).fill(this.colors.surfaceMuted);
      this.doc.restore();
      if (entry.percent != null) {
        const fill = Math.max(0.03, Math.min(1, entry.percent / 100)) * WIDTH;
        this.doc.save();
        this.doc.roundedRect(LEFT, trackY, fill, 3.5, 1.5).fill(this.colors.primary);
        this.doc.restore();
      }
      this.doc.y = y + 22;
    }
    this.doc.y += 6;
  }

  private callout(block: {
    tone: SeoProspectPdfCalloutTone;
    label: string;
    text: string;
  }) {
    if (!block.text.trim()) return;
    const pad = 12;
    const textHeight = this.measure(block.text, TYPE.body, 2.2);
    const height = pad * 2 + 14 + textHeight;
    this.ensureSpace(height + 8);
    const y = this.doc.y;
    const surface = calloutSurface(block.tone, this.colors);
    this.doc.save();
    this.doc.roundedRect(LEFT, y, WIDTH, height, 3).fill(surface.fill);
    this.doc.restore();
    this.doc.save();
    this.doc.rect(LEFT, y, 3.5, height).fill(surface.rule);
    this.doc.restore();
    this.doc
      .font(this.fonts.bold)
      .fontSize(TYPE.label)
      .fillColor(surface.label)
      .text(txt(block.label).toUpperCase(), LEFT + 14, y + 10, {
        width: WIDTH - 24,
      });
    this.doc
      .font(this.fonts.regular)
      .fontSize(TYPE.body)
      .fillColor(this.colors.ink)
      .text(txt(block.text), LEFT + 14, this.doc.y + 3, {
        width: WIDTH - 24,
        lineGap: 2.2,
      });
    this.doc.y = y + height + 10;
  }

  private priorityItem(block: {
    tone: SeoProspectPdfPriorityTone;
    eyebrow: string;
    title: string;
    entries: SeoProspectPdfField[];
  }) {
    const first = block.entries.find((entry) => entry.value.trim());
    const headerNeed = 54 + this.measure(block.title, 11.5, 2);
    const firstNeed = first
      ? 18 + this.measure(first.value, TYPE.body, 2.2)
      : 0;
    this.ensureSpace(Math.min(headerNeed + Math.min(firstNeed, 36), 140));

    const accent = toneAccent(block.tone, this.colors);
    const filled = block.tone === "critical" || block.tone === "high";
    const y = this.doc.y;
    this.doc.save();
    this.doc.rect(LEFT, y, 3.5, 22).fill(accent);
    this.doc.restore();
    this.priorityBadge(block.eyebrow, accent, filled, LEFT + 12, y);
    this.doc
      .font(this.fonts.bold)
      .fontSize(12)
      .fillColor(this.colors.ink)
      .text(txt(block.title), LEFT + 12, this.doc.y + 6, { width: WIDTH - 12 });
    this.doc.y += 8;
    this.fields(block.entries);
  }

  private priorityBadge(
    label: string,
    accent: string,
    filled: boolean,
    x: number,
    y: number,
  ) {
    const text = txt(label).toUpperCase();
    this.doc.font(this.fonts.bold).fontSize(TYPE.badge);
    const width = Math.min(this.doc.widthOfString(text) + 12, 220);
    this.doc.save();
    if (filled) {
      this.doc.roundedRect(x, y, width, 16, 2).fill(accent);
    } else {
      this.doc
        .roundedRect(x, y, width, 16, 2)
        .lineWidth(0.8)
        .strokeColor(accent)
        .stroke();
    }
    this.doc.restore();
    this.doc
      .fillColor(filled ? this.readableBadgeText(accent) : accent)
      .text(text, x, y + 4, {
        width,
        align: "center",
        lineBreak: false,
      });
    this.doc.y = y + 16;
  }

  private readableBadgeText(fill: string): string {
    return fill === this.colors.accent
      ? this.colors.onAccent
      : this.colors.onPrimary;
  }

  private pageCard(block: {
    title: string;
    entries: SeoProspectPdfField[];
    variant?: SeoProspectPdfCardVariant;
    badge?: string;
  }) {
    const variant = block.variant ?? "metadata";
    if (variant === "inventory") {
      this.inventoryRow(block);
      return;
    }
    if (variant === "metadata") {
      this.metadataRecord(block);
      return;
    }
    this.opportunityCard(block);
  }

  private opportunityCard(block: {
    title: string;
    entries: SeoProspectPdfField[];
    badge?: string;
  }) {
    const first = block.entries.find((entry) => entry.value.trim());
    this.ensureSpace(
      48 + this.measure(block.title, 12, 2) + (first ? 20 : 0),
    );
    const y = this.doc.y;
    this.doc.save();
    this.doc.rect(LEFT, y, 3.5, 20).fill(this.colors.accent);
    this.doc.restore();
    if (block.badge) {
      this.doc
        .font(this.fonts.bold)
        .fontSize(TYPE.badge)
        .fillColor(this.colors.accent)
        .text(txt(block.badge).toUpperCase(), LEFT + 12, y, {
          width: WIDTH - 12,
        });
    }
    this.doc
      .font(this.fonts.bold)
      .fontSize(12)
      .fillColor(this.colors.ink)
      .text(txt(block.title), LEFT + 12, this.doc.y + (block.badge ? 3 : 0), {
        width: WIDTH - 12,
      });
    this.doc.y += 8;
    this.fields(
      block.entries.map((entry) => ({
        ...entry,
        label: entry.label,
      })),
    );
  }

  private inventoryRow(block: {
    title: string;
    entries: SeoProspectPdfField[];
  }) {
    this.ensureSpace(36);
    const y = this.doc.y;
    this.doc
      .moveTo(LEFT, y)
      .lineTo(RIGHT, y)
      .strokeColor(this.colors.rule)
      .lineWidth(0.4)
      .stroke();
    this.doc
      .font(this.fonts.bold)
      .fontSize(9.5)
      .fillColor(this.colors.ink)
      .text(txt(block.title), LEFT, y + 6, { width: WIDTH });
    const url = block.entries.find((entry) => /url/i.test(entry.label))?.value;
    const pageType = block.entries.find((entry) =>
      /type|tipo|typ/i.test(entry.label),
    )?.value;
    if (url) {
      this.doc
        .font(this.fonts.regular)
        .fontSize(8)
        .fillColor(this.colors.muted)
        .text(txt(url), LEFT, this.doc.y + 2, { width: WIDTH });
    }
    if (pageType) {
      this.doc
        .font(this.fonts.regular)
        .fontSize(7.5)
        .fillColor(this.colors.secondary)
        .text(txt(pageType), LEFT, this.doc.y + 1, { width: WIDTH });
    }
    this.doc.y += SPACE.appendixRow;
  }

  private metadataRecord(block: {
    title: string;
    entries: SeoProspectPdfField[];
  }) {
    const usable = block.entries.filter((entry) => entry.value.trim());
    this.ensureSpace(32);
    const y = this.doc.y;
    this.doc
      .moveTo(LEFT, y)
      .lineTo(RIGHT, y)
      .strokeColor(this.colors.rule)
      .lineWidth(0.45)
      .stroke();
    this.doc
      .font(this.fonts.bold)
      .fontSize(9.5)
      .fillColor(this.colors.primary)
      .text(txt(block.title), LEFT, y + 7, { width: WIDTH });
    this.doc.y += 4;
    const compact = usable.filter((entry) => entry.value.length <= 36);
    const long = usable.filter((entry) => entry.value.length > 36);
    for (let i = 0; i < compact.length; i += 2) {
      const left = compact[i];
      const right = compact[i + 1];
      this.ensureSpace(22);
      const rowY = this.doc.y;
      this.compactMetaCell(left, LEFT, rowY, (WIDTH - 16) / 2);
      if (right) {
        this.compactMetaCell(
          right,
          LEFT + (WIDTH + 16) / 2,
          rowY,
          (WIDTH - 16) / 2,
        );
      }
      this.doc.y = rowY + 22;
    }
    for (const entry of long) {
      this.keepFieldTogether(entry);
    }
    this.doc.y += 4;
  }

  private compactMetaCell(
    entry: SeoProspectPdfField,
    x: number,
    y: number,
    width: number,
  ) {
    this.doc
      .font(this.fonts.regular)
      .fontSize(7)
      .fillColor(this.colors.muted)
      .text(txt(entry.label), x, y, { width, lineBreak: false });
    this.doc
      .font(this.fonts.regular)
      .fontSize(8.5)
      .fillColor(this.colors.ink)
      .text(txt(entry.value), x, y + 9, { width, lineBreak: false });
  }

  private pageRecord(block: SeoProspectPdfPageRecord) {
    const copy = this.input.messages.seo.prospectPdf;
    const firstComparison = block.comparisons[0];
    const firstValue =
      firstComparison?.current ?? firstComparison?.recommended ?? "";
    const startNeed =
      10 +
      this.measure(block.title, 9.5, 1.2) +
      (block.url ? this.measure(block.url, 8, 1.2) + 3 : 0) +
      (block.meta.length ? 11 : 0) +
      (block.issues.length ? 16 : 0) +
      (firstComparison ? 20 + Math.min(this.measure(firstValue, 8, 1.4, WIDTH - 78), 22) : 0);
    this.ensureSpace(startNeed);

    const y = this.doc.y;
    this.doc
      .moveTo(LEFT, y)
      .lineTo(RIGHT, y)
      .strokeColor(this.colors.rule)
      .lineWidth(0.4)
      .stroke();
    this.doc
      .font(this.fonts.bold)
      .fontSize(9.5)
      .fillColor(this.colors.ink)
      .text(txt(block.title), LEFT, y + 6, { width: WIDTH });
    if (block.url) {
      this.doc
        .font(this.fonts.regular)
        .fontSize(8)
        .fillColor(this.colors.muted)
        .text(txt(block.url), LEFT, this.doc.y + 1, { width: WIDTH });
    }
    if (block.meta.length) {
      this.doc
        .font(this.fonts.regular)
        .fontSize(7)
        .fillColor(this.colors.secondary)
        .text(block.meta.map((item) => txt(item)).join("  ·  "), LEFT, this.doc.y + 3, {
          width: WIDTH,
        });
    }
    if (block.issues.length) {
      this.ensureSpace(18);
      this.doc
        .font(this.fonts.bold)
        .fontSize(7)
        .fillColor(this.colors.muted)
        .text(txt(copy.issueFlags).toUpperCase(), LEFT, this.doc.y + 5, {
          width: WIDTH,
        });
      this.doc
        .font(this.fonts.regular)
        .fontSize(7.5)
        .fillColor(this.colors.ink)
        .text(block.issues.map((item) => txt(item)).join("  ·  "), LEFT, this.doc.y + 1, {
          width: WIDTH,
        });
    }
    for (const comparison of block.comparisons) {
      this.comparisonGroup(comparison, copy.currentLabel, copy.recommendedLabel);
    }
    this.doc.y += SPACE.appendixRow;
  }

  private comparisonGroup(
    comparison: { label: string; current?: string; recommended?: string },
    currentLabel: string,
    recommendedLabel: string,
  ) {
    const first = comparison.current ?? comparison.recommended;
    if (!first) return;
    this.ensureSpace(14 + Math.min(this.measure(first, 8, 1.4, WIDTH - 78), 20));
    this.doc
      .font(this.fonts.bold)
      .fontSize(7)
      .fillColor(this.colors.secondary)
      .text(txt(comparison.label).toUpperCase(), LEFT, this.doc.y + 6, {
        width: WIDTH,
      });
    this.doc.y += 2;
    if (comparison.current) {
      this.comparisonLine(currentLabel, comparison.current, false);
    }
    if (comparison.recommended) {
      this.comparisonLine(recommendedLabel, comparison.recommended, true);
    }
  }

  private comparisonLine(label: string, value: string, emphasis: boolean) {
    const labelWidth = 78;
    const valueWidth = WIDTH - labelWidth;
    const size = emphasis ? 8.5 : 8;
    const valueHeight = this.measure(value, size, 1.4, valueWidth);
    this.ensureSpace(Math.max(11, valueHeight) + 2);
    const y = this.doc.y;
    this.doc
      .font(this.fonts.regular)
      .fontSize(7)
      .fillColor(this.colors.muted)
      .text(txt(label), LEFT, y, { width: labelWidth });
    this.doc
      .font(emphasis ? this.fonts.bold : this.fonts.regular)
      .fontSize(size)
      .fillColor(this.colors.ink)
      .text(txt(value), LEFT + labelWidth, y, {
        width: valueWidth,
        lineGap: 1.4,
      });
    this.doc.y = y + Math.max(11, valueHeight) + 2;
  }

  private code(text: string) {
    const snippet = text.trim();
    if (!snippet) return;
    const pad = 10;
    const innerWidth = WIDTH - pad * 2;
    const textHeight = this.measure(
      snippet,
      TYPE.code,
      1.4,
      innerWidth,
      "Courier",
    );
    const height = textHeight + pad * 2;
    const pageCapacity =
      this.doc.page.height - PAGE.marginTop - PAGE.bottomGuard - 16;
    if (height > pageCapacity) {
      this.ensureSpace(36);
      this.doc
        .font("Courier")
        .fontSize(TYPE.code)
        .fillColor(this.colors.ink)
        .text(txt(snippet), LEFT, this.doc.y, {
          width: WIDTH,
          lineGap: 1.4,
        });
      this.doc.font(this.fonts.regular);
      this.doc.y += 10;
      return;
    }
    this.ensureSpace(height + 8);
    const y = this.doc.y;
    this.doc.save();
    this.doc.roundedRect(LEFT, y, WIDTH, height, 3).fill(this.colors.codeSurface);
    this.doc.restore();
    this.doc
      .font("Courier")
      .fontSize(TYPE.code)
      .fillColor(this.colors.ink)
      .text(txt(snippet), LEFT + pad, y + pad, {
        width: innerWidth,
        lineGap: 1.4,
      });
    this.doc.font(this.fonts.regular);
    this.doc.y = y + height + 10;
  }

  private drawClose() {
    const { doc, colors, fonts, input } = this;
    const { parties, brand, messages, model } = input;
    const copy = messages.seo.prospectPdf;
    const wash = colors.coverWash ?? colors.primaryTint;

    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(wash);
    doc.restore();
    doc.save();
    doc.rect(0, 0, PAGE.coverLeftRule, doc.page.height).fill(colors.primary);
    doc.restore();
    doc.save();
    doc.rect(0, 0, doc.page.width, 10).fill(colors.primary);
    doc.restore();

    const identityTop = 88;
    if (brand.logo) {
      tryDrawImage(doc, brand.logo, LEFT, identityTop, {
        fit: [200, 56],
      });
    }
    if (brand.profilePicture) {
      drawFramedImage(
        doc,
        brand.profilePicture,
        RIGHT - 92,
        identityTop,
        { width: 92, height: 112 },
        colors.rule,
      );
    }

    let y = identityTop + 140;
    doc
      .font(fonts.regular)
      .fontSize(TYPE.closeEyebrow)
      .fillColor(colors.accent)
      .text(txt(copy.readyToTurnThisIntoAction).toUpperCase(), LEFT, y, {
        width: WIDTH,
      });
    y = doc.y + 16;
    doc
      .font(fonts.bold)
      .fontSize(TYPE.closeTitle)
      .fillColor(colors.primary)
      .text(txt(copy.commercialCta), LEFT, y, { width: WIDTH, lineGap: 3 });
    y = doc.y + 18;
    doc
      .font(fonts.bold)
      .fontSize(TYPE.closeBrand)
      .fillColor(colors.ink)
      .text(txt(copy.commercialClose), LEFT, y, { width: WIDTH });

    doc
      .moveTo(LEFT, 690)
      .lineTo(RIGHT, 690)
      .strokeColor(colors.primary)
      .lineWidth(1)
      .stroke();
    doc
      .font(fonts.regular)
      .fontSize(TYPE.body)
      .fillColor(colors.ink)
      .text(
        interpolateTenantMessage(copy.preparedForBy, {
          subject: parties.subject.name,
          sender: parties.sender.name,
        }),
        LEFT,
        708,
        { width: WIDTH },
      );
    if (model.analyzedDomain) {
      doc
        .font(fonts.regular)
        .fontSize(TYPE.metadata)
        .fillColor(colors.muted)
        .text(txt(model.analyzedDomain), LEFT, doc.y + 6, { width: WIDTH });
    }
  }

  private drawChrome() {
    this.drawHeader();
    this.drawFooter();
  }

  private drawHeader() {
    const { doc, colors, fonts, input, currentSectionTitle } = this;
    const copy = input.messages.seo.prospectPdf;
    const previousBottom = doc.page.margins.bottom;
    const previousX = doc.x;
    const previousY = doc.y;
    doc.page.margins.bottom = 0;
    const label = currentSectionTitle
      ? interpolateTenantMessage(copy.runningHeader, {
          lens: input.model.lens,
          section: currentSectionTitle,
        })
      : input.model.lens;
    doc.save();
    doc
      .font(fonts.regular)
      .fontSize(TYPE.header)
      .fillColor(colors.muted)
      .text(txt(label).toUpperCase(), LEFT, PAGE.headerY, {
        width: WIDTH,
        lineBreak: false,
      });
    doc
      .moveTo(LEFT, PAGE.headerY + 16)
      .lineTo(RIGHT, PAGE.headerY + 16)
      .strokeColor(colors.rule)
      .lineWidth(0.45)
      .stroke();
    doc.restore();
    doc.page.margins.bottom = previousBottom;
    doc.x = previousX;
    doc.y = previousY;
  }

  private drawFooter() {
    const { doc, colors, fonts, input, pageNumber } = this;
    const { parties, model, messages } = input;
    const copy = messages.seo.prospectPdf;
    const y = doc.page.height - PAGE.footerY;
    const center = model.analyzedDomain
      ? model.analyzedDomain
      : parties.subject.name;
    const previousBottom = doc.page.margins.bottom;
    const previousX = doc.x;
    const previousY = doc.y;
    doc.page.margins.bottom = 0;
    doc.save();
    doc
      .moveTo(LEFT, y - 10)
      .lineTo(RIGHT, y - 10)
      .strokeColor(colors.rule)
      .lineWidth(0.5)
      .stroke();
    doc
      .font(fonts.regular)
      .fontSize(TYPE.footer)
      .fillColor(colors.secondary)
      .text(txt(parties.sender.name), LEFT, y, {
        width: 168,
        lineBreak: false,
      })
      .text(txt(center), LEFT + 168, y, {
        width: 170,
        lineBreak: false,
        align: "center",
      })
      .text(
        interpolateTenantMessage(copy.pageLabel, { page: pageNumber }),
        LEFT + 338,
        y,
        { width: 149, align: "right", lineBreak: false },
      );
    doc.restore();
    doc.page.margins.bottom = previousBottom;
    doc.x = previousX;
    doc.y = previousY;
  }

  private measure(
    text: string,
    size: number,
    lineGap: number,
    width: number = WIDTH,
    font?: string,
  ): number {
    this.doc.font(font ?? this.fonts.regular).fontSize(size);
    return this.doc.heightOfString(txt(text), { width, lineGap });
  }

  private ensureSpace(needed: number) {
    const limit = this.doc.page.height - PAGE.bottomGuard;
    if (this.doc.y + needed > limit) {
      this.doc.addPage();
    }
  }
}

export async function renderSeoProspectPdfShell(input: {
  model: SeoProspectPdfDocumentModel;
  parties: SeoProspectPdfParties;
  brand: SeoProspectPdfBrandAssets;
  messages: TenantMessages;
}): Promise<Buffer> {
  return new SeoProspectPdfShell(input).render();
}

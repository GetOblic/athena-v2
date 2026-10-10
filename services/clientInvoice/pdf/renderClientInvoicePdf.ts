/**
 * Issued client invoice PDF.
 * Commercial content and branding come only from the immutable
 * client_invoice_issued_v1 snapshot. Billing frequency and per-frequency
 * totals are read from that snapshot. They are not recalculated, combined,
 * or annualized. Quote validity is not an invoice due date.
 * The live Estimate, quotation row, organization brand, and issuer profile
 * are not read. Logo bytes, when present, are the quote-owned copy named
 * by the frozen snapshot.
 *
 * Layout, theme, money formatting, and logo checks reuse the quotation PDF.
 */

import PDFDocument from "pdfkit";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import { collectPdfKitBuffer } from "@/services/seo/seoProspectPdf/seoProspectPdfKit";
import {
  formatClientQuotePdfIssueDate,
  formatClientQuotePdfMoney,
  formatClientQuotePdfQuantity,
  formatClientQuotePdfValidUntil,
  sanitizeClientQuotePdfText,
  wrapClientQuotePdfTokens,
} from "@/services/clientQuote/pdf/clientQuotePdfFormat";
import {
  clientQuotePdfBillingFrequencyLabel,
  clientQuotePdfFrequencyTotalLabel,
} from "@/services/clientQuote/pdf/clientQuotePdfLabels";
import {
  downloadClientQuoteLogoFromStorage,
  resolveClientQuotePdfLogo,
  type ClientQuotePdfImage,
  type ClientQuotePdfLogoDownload,
} from "@/services/clientQuote/pdf/clientQuotePdfLogo";
import { resolveClientQuotePdfTheme, type ClientQuotePdfTheme } from "@/services/clientQuote/pdf/clientQuotePdfTheme";
import {
  clientQuotePdfFrequencyGroups,
  clientQuotePdfShouldAdvance,
} from "@/services/clientQuote/pdf/renderClientQuotePdf";
import {
  emptyClientQuoteIssuedBrand,
  isClientQuoteBillingFrequency,
  type ClientQuoteBillingFrequency,
  type ClientQuoteFrequencyTotals,
  type ClientQuoteIssuedBrandSnapshot,
  type ClientQuoteLineItem,
  type ClientQuotePostalAddress,
  type ClientQuoteTotals,
} from "@/services/clientQuote/clientQuoteTypes";
import {
  clientInvoicePdfLabels,
  type ClientInvoicePdfLabels,
} from "@/services/clientInvoice/pdf/clientInvoicePdfLabels";
import type { ClientInvoiceIssuedSnapshotV1 } from "@/services/clientInvoice/clientInvoiceTypes";

const PAGE = {
  marginLeft: 46,
  marginRight: 46,
  marginTop: 18,
  marginBottom: 54,
  continuationTop: 58,
  accent: 6,
} as const;

const LEFT = PAGE.marginLeft;
const WIDTH = 595.28 - PAGE.marginLeft - PAGE.marginRight;
const RIGHT = LEFT + WIDTH;
const QTY_W = 52;
const PRICE_W = 86;
const AMOUNT_W = 90;
const DESC_W = WIDTH - QTY_W - PRICE_W - AMOUNT_W;

type Align = "left" | "right" | "center";

function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = sanitizeClientQuotePdfText(value).trim();
  return text || null;
}

function addressLines(address: ClientQuotePostalAddress): string[] {
  const lines: string[] = [];
  const line1 = clean(address.line1);
  const line2 = clean(address.line2);
  if (line1) lines.push(line1);
  if (line2) lines.push(line2);
  const locality = [clean(address.city), clean(address.region)].filter(Boolean).join(", ");
  const cityLine = [locality, clean(address.postalCode)].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  const country = clean(address.country);
  if (country) lines.push(country);
  return lines;
}

function partyLines(input: {
  title: string | null;
  subtitle: string | null;
  contact: string | null;
  address: string[];
  channels: string[];
  note: string | null;
}): string {
  return [
    input.title,
    input.subtitle,
    input.contact,
    ...input.address,
    ...input.channels,
    input.note,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function snapshotBrand(
  snapshot: ClientInvoiceIssuedSnapshotV1,
): ClientQuoteIssuedBrandSnapshot {
  return snapshot.brand ?? emptyClientQuoteIssuedBrand();
}

class ClientInvoicePdfLayout {
  private readonly doc: PDFKit.PDFDocument;
  private readonly theme: ClientQuotePdfTheme;
  private readonly labels: ClientInvoicePdfLabels;
  private readonly language: OrganizationLanguage;
  private y: number = PAGE.marginTop;
  private contentStart: number = PAGE.marginTop;
  private repeatTableHeader = false;

  constructor(
    private readonly snapshot: ClientInvoiceIssuedSnapshotV1,
    private readonly logo: ClientQuotePdfImage | null,
  ) {
    this.language = snapshot.contentLanguage;
    this.labels = clientInvoicePdfLabels(this.language);
    this.theme = resolveClientQuotePdfTheme(snapshotBrand(snapshot));
    const title = sanitizeClientQuotePdfText(
      `${this.labels.documentTitle} ${snapshot.invoiceNumber}`,
    ).slice(0, 180);
    const author = sanitizeClientQuotePdfText(snapshot.issuer.legalName).slice(0, 180);
    const subject = sanitizeClientQuotePdfText(snapshot.projectTitle).slice(0, 180);
    this.doc = new PDFDocument({
      size: "A4",
      compress: false,
      bufferPages: true,
      autoFirstPage: true,
      margins: {
        top: PAGE.marginTop,
        bottom: PAGE.marginBottom,
        left: PAGE.marginLeft,
        right: PAGE.marginRight,
      },
      info: {
        Title: title,
        Author: author,
        Subject: subject,
        Creator: author,
      },
    });
  }

  async render(): Promise<Buffer> {
    const finished = collectPdfKitBuffer(this.doc);
    this.drawFirstPage();
    this.drawProject();
    this.drawServices();
    this.drawFinancialSummary();
    this.drawNarrative(
      this.labels.paymentTerms,
      [clean(this.snapshot.paymentTerms.summary), clean(this.snapshot.paymentTerms.scheduleNote)]
        .filter((line): line is string => Boolean(line))
        .join("\n\n"),
    );
    const instructions = clean(this.snapshot.paymentInstructions);
    if (instructions) this.drawNarrative(this.labels.paymentInstructions, instructions);
    this.drawSourceQuote();
    this.stampFooters();
    this.doc.end();
    return finished;
  }

  private limitY(): number {
    return this.doc.page.height - PAGE.marginBottom;
  }

  private freshContentTop(): number {
    return PAGE.continuationTop;
  }

  private ensure(height: number) {
    if (
      clientQuotePdfShouldAdvance({
        cursor: this.y,
        bottom: this.limitY(),
        pageStart: this.contentStart,
        blockHeight: height,
      })
    ) {
      this.newPage();
    }
  }

  private newPage() {
    const repeat = this.repeatTableHeader;
    this.repeatTableHeader = false;
    this.doc.addPage();
    this.drawContinuationHeader();
    this.y = this.freshContentTop();
    this.contentStart = this.y;
    this.doc.x = LEFT;
    this.doc.y = this.y;
    this.repeatTableHeader = repeat;
    if (repeat) this.drawTableHeader();
  }

  private advance(amount: number) {
    this.y += amount;
    this.doc.y = this.y;
  }

  private measure(
    text: string,
    font: string,
    size: number,
    width: number,
    lineGap = 1.4,
  ): number {
    this.doc.font(font).fontSize(size);
    const height = this.doc.heightOfString(text || " ", { width, lineGap });
    return Math.max(height, size);
  }

  private paint(
    text: string,
    x: number,
    y: number,
    width: number,
    font: string,
    size: number,
    color: string,
    lineGap: number,
    height: number,
    align: Align = "left",
  ) {
    this.doc.font(font).fontSize(size).fillColor(color).text(text, x, y, {
      width,
      height: Math.max(height, size) + 1,
      lineGap,
      align,
      lineBreak: true,
    });
  }

  private paintSingle(
    text: string,
    x: number,
    y: number,
    width: number,
    font: string,
    size: number,
    color: string,
    align: Align = "left",
  ) {
    this.doc.font(font).fontSize(size).fillColor(color).text(text, x, y, {
      width,
      height: size + 3,
      align,
      lineBreak: false,
      ellipsis: true,
    });
  }

  private withOpenMargins(draw: () => void) {
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
    const previousX = this.doc.x;
    const previousY = this.doc.y;
    draw();
    margins.top = previous.top;
    margins.bottom = previous.bottom;
    margins.left = previous.left;
    margins.right = previous.right;
    this.doc.x = previousX;
    this.doc.y = previousY;
  }

  private flowText(
    text: string,
    x: number,
    width: number,
    font: string,
    size: number,
    color: string,
    lineGap = 1.6,
  ) {
    const source = wrapClientQuotePdfTokens(text);
    const paragraphs = source.split("\n");
    for (let index = 0; index < paragraphs.length; index += 1) {
      let remaining = paragraphs[index] ?? "";
      if (!remaining.trim()) {
        this.advance(size * 0.42);
        continue;
      }
      let guard = 0;
      while (remaining && guard < 400) {
        guard += 1;
        const available = this.limitY() - this.y;
        const height = this.measure(remaining, font, size, width, lineGap);
        if (height <= available) {
          this.paint(remaining, x, this.y, width, font, size, color, lineGap, height);
          this.advance(height);
          break;
        }
        if (available < size + lineGap + 2) {
          this.newPage();
          continue;
        }
        const fitted = this.fitPrefix(remaining, font, size, width, available, lineGap);
        if (!fitted) {
          this.newPage();
          continue;
        }
        const fittedHeight = this.measure(fitted, font, size, width, lineGap);
        this.paint(fitted, x, this.y, width, font, size, color, lineGap, fittedHeight);
        this.advance(fittedHeight);
        remaining = remaining.slice(fitted.length).replace(/^\s+/, "");
      }
    }
  }

  private fitPrefix(
    text: string,
    font: string,
    size: number,
    width: number,
    available: number,
    lineGap: number,
  ): string {
    const capacity = this.limitY() - this.freshContentTop();
    const words = text.split(/(\s+)/);
    if (words.length === 0) return "";
    const firstHeight = this.measure(words[0] ?? "", font, size, width, lineGap);
    if (firstHeight > available && firstHeight <= capacity) return "";
    if (firstHeight > capacity) return words[0] ?? "";
    let best = "";
    let low = 1;
    let high = words.length;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = words.slice(0, mid).join("");
      if (this.measure(candidate, font, size, width, lineGap) <= available) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }

  private drawFirstPage() {
    this.withOpenMargins(() => {
      this.doc.rect(0, 0, this.doc.page.width, PAGE.accent).fill(this.theme.accent);
    });
    this.y = 22;
    this.contentStart = this.y;
    const headerBottom = this.drawLetterhead();
    this.y = headerBottom + 16;
    this.drawMetaStrip();
    this.advance(14);
    this.drawParties();
  }

  private drawLetterhead(): number {
    const { fonts } = this.theme;
    const rightW = 210;
    const leftW = WIDTH - rightW - 16;
    const top = this.y;
    let leftBottom = top;
    if (this.logo) {
      try {
        this.doc.image(this.logo.bytes, LEFT, top, {
          fit: [168, 46],
          valign: "center",
        });
        leftBottom = top + 50;
      } catch {
        console.warn("[CLIENT_INVOICE_PDF] logo_omitted", { reason: "embed_failed" });
        leftBottom = this.drawWordmark(top, leftW);
      }
    } else {
      leftBottom = this.drawWordmark(top, leftW);
    }

    const title = this.labels.documentTitle;
    const number = sanitizeClientQuotePdfText(this.snapshot.invoiceNumber);
    this.paintSingle(title, RIGHT - rightW, top, rightW, fonts.bold, 11, this.theme.accent, "right");
    this.paint(
      number,
      RIGHT - rightW,
      top + 16,
      rightW,
      fonts.bold,
      16,
      this.theme.ink,
      0,
      22,
      "right",
    );
    return Math.max(leftBottom, top + 42);
  }

  private drawWordmark(top: number, width: number): number {
    const { fonts } = this.theme;
    const legal = sanitizeClientQuotePdfText(this.snapshot.issuer.legalName);
    const trading = clean(this.snapshot.issuer.tradingName);
    const legalHeight = this.measure(legal, fonts.bold, 16, width, 0);
    this.paint(legal, LEFT, top, width, fonts.bold, 16, this.theme.ink, 0, legalHeight);
    let bottom = top + legalHeight;
    if (trading && trading !== legal) {
      const tradingHeight = this.measure(trading, fonts.regular, 10, width, 0);
      this.paint(
        trading,
        LEFT,
        bottom + 2,
        width,
        fonts.regular,
        10,
        this.theme.muted,
        0,
        tradingHeight,
      );
      bottom += tradingHeight + 2;
    }
    return bottom;
  }

  private drawMetaStrip() {
    const { fonts } = this.theme;
    const labels = this.labels;
    const cells = [
      {
        label: labels.invoiceNumber,
        value: sanitizeClientQuotePdfText(this.snapshot.invoiceNumber),
      },
      {
        label: labels.issueDate,
        value: formatClientQuotePdfValidUntil(this.snapshot.issueDate, this.language),
      },
      {
        label: labels.paymentDueDate,
        value: formatClientQuotePdfValidUntil(this.snapshot.paymentDueDate, this.language),
      },
    ].filter((cell) => cell.value);
    if (cells.length === 0) return;
    const gap = 10;
    const cellW = (WIDTH - gap * (cells.length - 1)) / cells.length;
    const height = 42;
    this.ensure(height);
    cells.forEach((cell, index) => {
      const x = LEFT + index * (cellW + gap);
      this.doc.save();
      this.doc.roundedRect(x, this.y, cellW, height, 4).fill(this.theme.surface);
      this.doc.restore();
      this.paintSingle(cell.label, x + 10, this.y + 7, cellW - 20, fonts.bold, 7.5, this.theme.accent);
      this.paintSingle(cell.value, x + 10, this.y + 20, cellW - 20, fonts.regular, 10, this.theme.ink);
    });
    this.advance(height);
  }

  private issuerBlock(): string {
    const issuer = this.snapshot.issuer;
    const contact = [clean(issuer.contactName), clean(issuer.jobTitle)].filter(Boolean).join(" · ");
    const channels = [clean(issuer.phone), clean(issuer.email), clean(issuer.website)].filter(
      (line): line is string => Boolean(line),
    );
    const registration = clean(issuer.registrationNumber);
    if (registration) channels.push(`${this.labels.registration} ${registration}`);
    const tax = clean(issuer.taxIdentifier);
    if (tax) {
      const taxLabel = clean(issuer.taxIdentifierLabel) ?? this.labels.taxIdentifier;
      channels.push(`${taxLabel} ${tax}`);
    }
    return partyLines({
      title: clean(issuer.legalName),
      subtitle: clean(issuer.tradingName),
      contact: contact || null,
      address: addressLines(issuer.postalAddress),
      channels,
      note: clean(issuer.additionalNote),
    });
  }

  private customerBlock(): string {
    const customer = this.snapshot.customer;
    const contact = [clean(customer.contactName), clean(customer.jobTitle)].filter(Boolean).join(" · ");
    const channels = [clean(customer.phone), clean(customer.email)].filter(
      (line): line is string => Boolean(line),
    );
    const tax = clean(customer.taxIdentifier);
    if (tax) channels.push(`${this.labels.taxIdentifier} ${tax}`);
    return partyLines({
      title: clean(customer.name),
      subtitle: null,
      contact: contact || null,
      address: addressLines(customer.postalAddress),
      channels,
      note: null,
    });
  }

  private drawParties() {
    const gap = 12;
    const colW = (WIDTH - gap) / 2;
    const innerW = colW - 24;
    const { fonts } = this.theme;
    const left = this.issuerBlock();
    const right = this.customerBlock();
    const leftHeight = this.measure(left, fonts.regular, 9, innerW, 1.5);
    const rightHeight = this.measure(right, fonts.regular, 9, innerW, 1.5);
    const bodyHeight = Math.max(leftHeight, rightHeight);
    const cardHeight = 22 + bodyHeight + 16;
    const capacity = this.limitY() - this.freshContentTop();
    if (cardHeight > capacity) {
      this.drawNarrative(this.labels.preparedBy, left);
      this.drawNarrative(this.labels.preparedFor, right);
      return;
    }
    this.ensure(cardHeight);
    this.drawPartyCard(LEFT, this.labels.preparedBy, left, colW, cardHeight);
    this.drawPartyCard(LEFT + colW + gap, this.labels.preparedFor, right, colW, cardHeight);
    this.advance(cardHeight);
  }

  private drawPartyCard(
    x: number,
    label: string,
    body: string,
    width: number,
    height: number,
  ) {
    const { fonts } = this.theme;
    this.doc.save();
    this.doc.roundedRect(x, this.y, width, height, 6).fill(this.theme.surface);
    this.doc.rect(x, this.y, width, 3).fill(this.theme.accent);
    this.doc.restore();
    this.paintSingle(label, x + 12, this.y + 10, width - 24, fonts.bold, 8, this.theme.accent);
    this.paint(
      body,
      x + 12,
      this.y + 24,
      width - 24,
      fonts.regular,
      9,
      this.theme.ink,
      1.5,
      height - 36,
    );
  }

  private drawProject() {
    const title = sanitizeClientQuotePdfText(this.snapshot.projectTitle);
    const scope = clean(this.snapshot.scopeSummary) ?? "";
    const { fonts } = this.theme;
    this.advance(18);
    const titleHeight = this.measure(title, fonts.bold, 18, WIDTH, 1);
    const firstLine = scope.split("\n").find((line) => line.trim()) ?? " ";
    const lead = Math.min(this.measure(firstLine, fonts.regular, 10, WIDTH, 1.8), 28);
    this.ensure(titleHeight + 22 + lead);
    this.paint(title, LEFT, this.y, WIDTH, fonts.bold, 18, this.theme.ink, 1, titleHeight);
    this.advance(titleHeight + 8);
    if (!scope) return;
    this.paintSingle(this.labels.scope, LEFT, this.y, WIDTH, fonts.bold, 8, this.theme.accent);
    this.advance(14);
    this.flowText(scope, LEFT, WIDTH, fonts.regular, 10, this.theme.ink, 1.8);
  }

  private drawServices() {
    const { fonts } = this.theme;
    this.advance(16);
    this.ensure(36);
    this.paintSingle(this.labels.services, LEFT, this.y, WIDTH, fonts.bold, 8, this.theme.accent);
    this.advance(14);
    this.drawTableHeader();
    this.repeatTableHeader = true;
    for (const line of this.snapshot.lineItems) {
      this.drawLineItem(line);
    }
    this.repeatTableHeader = false;
  }

  private drawTableHeader() {
    const { fonts } = this.theme;
    const height = 22;
    const y = this.y;
    this.doc.save();
    this.doc.rect(LEFT, y, WIDTH, height).fill(this.theme.primary);
    this.doc.restore();
    const color = this.theme.onPrimary;
    const textY = y + 6;
    this.paintSingle(this.labels.description, LEFT + 8, textY, DESC_W - 12, fonts.bold, 8, color);
    this.paintSingle(this.labels.quantity, LEFT + DESC_W, textY, QTY_W - 6, fonts.bold, 8, color, "right");
    this.paintSingle(
      this.labels.unitPrice,
      LEFT + DESC_W + QTY_W,
      textY,
      PRICE_W - 6,
      fonts.bold,
      8,
      color,
      "right",
    );
    this.paintSingle(
      this.labels.amount,
      LEFT + DESC_W + QTY_W + PRICE_W,
      textY,
      AMOUNT_W - 8,
      fonts.bold,
      8,
      color,
      "right",
    );
    this.y = y + height;
    this.doc.y = this.y;
  }

  private money(amountMinor: number): string {
    return formatClientQuotePdfMoney(
      amountMinor,
      this.snapshot.currencyCode,
      this.snapshot.currencyScale,
      this.language,
    );
  }

  private lineBillingCaption(line: ClientQuoteLineItem): string | null {
    if (!isClientQuoteBillingFrequency(line.billingFrequency)) return null;
    const frequency = clientQuotePdfBillingFrequencyLabel(this.labels, line.billingFrequency);
    return `${this.labels.billing}: ${frequency}`;
  }

  private drawLineItem(line: ClientQuoteLineItem) {
    const { fonts } = this.theme;
    const description = wrapClientQuotePdfTokens(line.description);
    const caption = this.lineBillingCaption(line);
    const descWidth = DESC_W - 16;
    const descHeight = this.measure(description, fonts.regular, 9, descWidth, 1.4);
    const captionHeight = caption
      ? this.measure(caption, fonts.regular, 8, descWidth, 0.4)
      : 0;
    const captionBlock = caption ? captionHeight + 3 : 0;
    const rowHeight = Math.max(descHeight, 12) + captionBlock + 12;
    const capacity = this.limitY() - this.freshContentTop() - 22;
    if (rowHeight <= capacity) {
      this.ensure(rowHeight);
      const y = this.y;
      this.paint(
        description,
        LEFT + 8,
        y + 6,
        descWidth,
        fonts.regular,
        9,
        this.theme.ink,
        1.4,
        descHeight,
      );
      if (caption) {
        this.paint(
          caption,
          LEFT + 8,
          y + 6 + Math.max(descHeight, 12) + 2,
          descWidth,
          fonts.regular,
          8,
          this.theme.muted,
          0.4,
          captionHeight,
        );
      }
      this.paintAmountRow(y + 6, line);
      this.y = y + rowHeight;
      this.doc.y = this.y;
      this.drawRowRule();
      return;
    }
    this.ensure(caption ? 42 : 28);
    this.paintAmountRow(this.y + 2, line);
    this.advance(16);
    if (caption) {
      const height = this.measure(caption, fonts.regular, 8, descWidth, 0.4);
      if (this.limitY() - this.y < height + 4) this.newPage();
      this.paint(
        caption,
        LEFT + 8,
        this.y,
        descWidth,
        fonts.regular,
        8,
        this.theme.muted,
        0.4,
        height,
      );
      this.advance(height + 4);
    }
    this.flowText(description, LEFT + 8, descWidth, fonts.regular, 9, this.theme.ink, 1.4);
    this.advance(6);
    this.drawRowRule();
  }

  private paintAmountRow(y: number, line: ClientQuoteLineItem) {
    const { fonts } = this.theme;
    const quantity = formatClientQuotePdfQuantity(line.quantity, this.language);
    this.paintSingle(quantity, LEFT + DESC_W, y, QTY_W - 6, fonts.regular, 9, this.theme.ink, "right");
    this.paintSingle(
      this.money(line.unitPriceMinor),
      LEFT + DESC_W + QTY_W,
      y,
      PRICE_W - 6,
      fonts.regular,
      9,
      this.theme.ink,
      "right",
    );
    this.paintSingle(
      this.money(line.lineTotalMinor),
      LEFT + DESC_W + QTY_W + PRICE_W,
      y,
      AMOUNT_W - 8,
      fonts.bold,
      9,
      this.theme.ink,
      "right",
    );
  }

  private drawRowRule() {
    this.doc.save();
    this.doc
      .moveTo(LEFT, this.y)
      .lineTo(RIGHT, this.y)
      .strokeColor(this.theme.rule)
      .lineWidth(0.6)
      .stroke();
    this.doc.restore();
  }

  private frequencyTotalHeading(frequency: ClientQuoteBillingFrequency): string {
    return clientQuotePdfFrequencyTotalLabel(this.labels, frequency);
  }

  /**
   * A snapshot without frequency groups keeps one unlabeled total.
   * A single one-time group stays unlabeled. Any other single cadence
   * is named. Mixed groups render one block each and never paint a
   * combined or annualized figure.
   */
  private drawFinancialSummary() {
    const groups = clientQuotePdfFrequencyGroups(this.snapshot.frequencyTotals);
    if (groups.length === 0) {
      this.drawTotalsBlock(this.snapshot.totals, null);
      return;
    }
    if (groups.length === 1) {
      const group = groups[0];
      const heading =
        group.billingFrequency === "one_time"
          ? null
          : this.frequencyTotalHeading(group.billingFrequency);
      this.drawTotalsBlock(group.totals, heading);
      return;
    }
    this.drawMixedFrequencySummary(groups);
  }

  private drawMixedFrequencySummary(groups: readonly ClientQuoteFrequencyTotals[]) {
    const { fonts } = this.theme;
    const title = this.labels.frequencyTotalsTitle;
    const titleHeight = this.measure(title, fonts.bold, 8, WIDTH, 0.6);
    this.advance(16);
    this.ensure(titleHeight + 160);
    this.paint(
      title,
      LEFT,
      this.y,
      WIDTH,
      fonts.bold,
      8,
      this.theme.accent,
      0.6,
      titleHeight,
    );
    this.advance(titleHeight + 2);
    for (const group of groups) {
      this.drawTotalsBlock(group.totals, this.frequencyTotalHeading(group.billingFrequency));
    }
  }

  private drawTotalsBlock(totals: ClientQuoteTotals, heading: string | null) {
    const { fonts } = this.theme;
    const taxLabel =
      this.snapshot.tax.kind === "percentage" && clean(this.snapshot.tax.label)
        ? `${this.labels.tax} · ${clean(this.snapshot.tax.label)}`
        : this.labels.tax;
    const rows = [
      { label: this.labels.subtotal, value: this.money(totals.subtotalMinor) },
      { label: this.labels.discount, value: this.money(totals.discountMinor) },
      { label: this.labels.taxableAmount, value: this.money(totals.taxableMinor) },
      { label: taxLabel, value: this.money(totals.taxMinor) },
    ];
    const boxW = 268;
    const labelW = 148;
    const valueW = boxW - labelW - 8;
    const rowH = rows.reduce((sum, row) => {
      return sum + Math.max(16, this.measure(row.label, fonts.regular, 9, labelW, 0.5) + 4);
    }, 0);
    const headingHeight = heading
      ? this.measure(heading, fonts.bold, 8, boxW, 0.4) + 6
      : 0;
    const block = headingHeight + rowH + 36;
    this.advance(12);
    this.ensure(block);
    const x = RIGHT - boxW;
    if (heading) {
      const textHeight = headingHeight - 6;
      this.paint(
        heading,
        x,
        this.y,
        boxW,
        fonts.bold,
        8,
        this.theme.accent,
        0.4,
        textHeight,
        "right",
      );
      this.advance(headingHeight);
    }
    let cursor = this.y;
    for (const row of rows) {
      const height = Math.max(16, this.measure(row.label, fonts.regular, 9, labelW, 0.5) + 4);
      this.paint(row.label, x, cursor, labelW, fonts.regular, 9, this.theme.muted, 0.5, height - 4);
      this.paintSingle(row.value, x + labelW, cursor, valueW, fonts.regular, 9, this.theme.ink, "right");
      cursor += height;
    }
    const totalH = 28;
    this.doc.save();
    this.doc.roundedRect(x, cursor + 4, boxW, totalH, 4).fill(this.theme.primary);
    this.doc.restore();
    this.paintSingle(
      this.labels.total,
      x + 10,
      cursor + 12,
      80,
      fonts.bold,
      11,
      this.theme.onPrimary,
    );
    this.paintSingle(
      this.money(totals.totalMinor),
      x + 90,
      cursor + 12,
      boxW - 102,
      fonts.bold,
      12,
      this.theme.onPrimary,
      "right",
    );
    this.y = cursor + 4 + totalH;
    this.doc.y = this.y;
  }

  private drawNarrative(title: string, body: string) {
    const text = clean(body);
    if (!text) return;
    const { fonts } = this.theme;
    this.advance(16);
    const first = text.split("\n").find((line) => line.trim()) ?? " ";
    const lead = Math.min(this.measure(first, fonts.regular, 10, WIDTH, 1.7), 32);
    this.ensure(22 + lead);
    this.paintSingle(title, LEFT, this.y, WIDTH, fonts.bold, 8, this.theme.accent);
    this.advance(14);
    this.flowText(text, LEFT, WIDTH, fonts.regular, 10, this.theme.ink, 1.7);
  }

  private drawSourceQuote() {
    const number = clean(this.snapshot.sourceQuote.quoteNumber);
    if (!number) return;
    const issued = formatClientQuotePdfIssueDate(
      this.snapshot.sourceQuote.quoteIssuedAt,
      this.language,
    );
    const issuedLine = issued
      ? interpolateTenantMessage(this.labels.sourceQuoteIssued, { date: issued })
      : "";
    this.drawNarrative(
      this.labels.sourceQuote,
      [number, issuedLine].filter((line) => line).join("\n"),
    );
  }

  private drawContinuationHeader() {
    const { fonts } = this.theme;
    const legal = sanitizeClientQuotePdfText(this.snapshot.issuer.legalName);
    const number = sanitizeClientQuotePdfText(this.snapshot.invoiceNumber);
    const nameWidth = WIDTH * 0.58;
    this.withOpenMargins(() => {
      this.doc.rect(0, 0, this.doc.page.width, PAGE.accent).fill(this.theme.accent);
      this.paintSingle(legal, LEFT, 18, nameWidth - 12, fonts.bold, 9, this.theme.ink);
      this.paintSingle(
        `${this.labels.documentTitle} ${number}`,
        LEFT + nameWidth,
        18,
        WIDTH - nameWidth,
        fonts.regular,
        9,
        this.theme.muted,
        "right",
      );
      this.doc.save();
      this.doc
        .moveTo(LEFT, 40)
        .lineTo(RIGHT, 40)
        .strokeColor(this.theme.rule)
        .lineWidth(0.6)
        .stroke();
      this.doc.restore();
    });
  }

  private stampFooters() {
    const range = this.doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      this.doc.switchToPage(range.start + index);
      this.drawFooter(index + 1, range.count);
    }
  }

  private drawFooter(page: number, pages: number) {
    const { fonts } = this.theme;
    const y = this.doc.page.height - 36;
    const legal = sanitizeClientQuotePdfText(this.snapshot.issuer.legalName);
    const label = interpolateTenantMessage(this.labels.page, { page, pages });
    this.withOpenMargins(() => {
      this.doc.save();
      this.doc
        .moveTo(LEFT, y - 8)
        .lineTo(RIGHT, y - 8)
        .strokeColor(this.theme.rule)
        .lineWidth(0.6)
        .stroke();
      this.doc.restore();
      this.paintSingle(legal, LEFT, y, WIDTH * 0.68, fonts.regular, 8, this.theme.muted);
      this.paintSingle(label, LEFT, y, WIDTH, fonts.regular, 8, this.theme.muted, "right");
    });
  }
}

export async function renderIssuedClientInvoicePdf(
  snapshot: ClientInvoiceIssuedSnapshotV1,
  options?: { downloadLogo?: ClientQuotePdfLogoDownload },
): Promise<Buffer> {
  const brand = snapshotBrand(snapshot);
  const logo = await resolveClientQuotePdfLogo({
    quoteId: snapshot.sourceQuote.quoteId,
    logo: brand.logo,
    download: options?.downloadLogo ?? downloadClientQuoteLogoFromStorage,
  });
  return new ClientInvoicePdfLayout(snapshot, logo.image).render();
}

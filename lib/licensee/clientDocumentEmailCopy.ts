/**
 * Plain-text Gmail subjects and bodies for issued client documents.
 * Language follows the frozen document, not the Licensee Master UI.
 * The message names the document, the project, the recipient, the issuer,
 * and the PDF file. It does not carry amounts, scope, payment directions,
 * tax identifiers, or Athena identifiers.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";

const SUBJECT_MAX = 120;
const ELLIPSIS = "…";

type DocumentKind = "quote" | "invoice";

type LanguageCopy = {
  quoteTitle: string;
  invoiceTitle: string;
  helloNamed: (name: string) => string;
  helloPlain: string;
  quoteIntro: (number: string, project: string) => string;
  quoteIntroBare: (number: string) => string;
  invoiceIntro: (number: string, project: string) => string;
  invoiceIntroBare: (number: string) => string;
  attachment: (filename: string) => string;
  regards: string;
};

const COPY: Record<OrganizationLanguage, LanguageCopy> = {
  en: {
    quoteTitle: "Quotation",
    invoiceTitle: "Invoice",
    helloNamed: (name) => `Hello ${name},`,
    helloPlain: "Hello,",
    quoteIntro: (number, project) =>
      `Please find our quotation ${number} for ${project}.`,
    quoteIntroBare: (number) => `Please find our quotation ${number}.`,
    invoiceIntro: (number, project) =>
      `Please find our invoice ${number} for ${project}.`,
    invoiceIntroBare: (number) => `Please find our invoice ${number}.`,
    attachment: (filename) => `PDF file: ${filename}`,
    regards: "Kind regards,",
  },
  fr: {
    quoteTitle: "Devis",
    invoiceTitle: "Facture",
    helloNamed: (name) => `Bonjour ${name},`,
    helloPlain: "Bonjour,",
    quoteIntro: (number, project) =>
      `Veuillez trouver notre devis ${number} pour ${project}.`,
    quoteIntroBare: (number) => `Veuillez trouver notre devis ${number}.`,
    invoiceIntro: (number, project) =>
      `Veuillez trouver notre facture ${number} pour ${project}.`,
    invoiceIntroBare: (number) => `Veuillez trouver notre facture ${number}.`,
    attachment: (filename) => `Fichier PDF : ${filename}`,
    regards: "Cordialement,",
  },
  es: {
    quoteTitle: "Presupuesto",
    invoiceTitle: "Factura",
    helloNamed: (name) => `Hola ${name},`,
    helloPlain: "Hola,",
    quoteIntro: (number, project) =>
      `Adjuntamos nuestro presupuesto ${number} para ${project}.`,
    quoteIntroBare: (number) => `Adjuntamos nuestro presupuesto ${number}.`,
    invoiceIntro: (number, project) =>
      `Adjuntamos nuestra factura ${number} para ${project}.`,
    invoiceIntroBare: (number) => `Adjuntamos nuestra factura ${number}.`,
    attachment: (filename) => `Archivo PDF: ${filename}`,
    regards: "Un saludo,",
  },
  it: {
    quoteTitle: "Preventivo",
    invoiceTitle: "Fattura",
    helloNamed: (name) => `Buongiorno ${name},`,
    helloPlain: "Buongiorno,",
    quoteIntro: (number, project) =>
      `Inviamo il nostro preventivo ${number} per ${project}.`,
    quoteIntroBare: (number) => `Inviamo il nostro preventivo ${number}.`,
    invoiceIntro: (number, project) =>
      `Inviamo la nostra fattura ${number} per ${project}.`,
    invoiceIntroBare: (number) => `Inviamo la nostra fattura ${number}.`,
    attachment: (filename) => `File PDF: ${filename}`,
    regards: "Cordiali saluti,",
  },
  de: {
    quoteTitle: "Angebot",
    invoiceTitle: "Rechnung",
    helloNamed: (name) => `Guten Tag ${name},`,
    helloPlain: "Guten Tag,",
    quoteIntro: (number, project) =>
      `anbei unser Angebot ${number} für ${project}.`,
    quoteIntroBare: (number) => `anbei unser Angebot ${number}.`,
    invoiceIntro: (number, project) =>
      `anbei unsere Rechnung ${number} für ${project}.`,
    invoiceIntroBare: (number) => `anbei unsere Rechnung ${number}.`,
    attachment: (filename) => `PDF-Datei: ${filename}`,
    regards: "Mit freundlichen Grüßen",
  },
  pt: {
    quoteTitle: "Orçamento",
    invoiceTitle: "Fatura",
    helloNamed: (name) => `Olá ${name},`,
    helloPlain: "Olá,",
    quoteIntro: (number, project) =>
      `Segue o nosso orçamento ${number} para ${project}.`,
    quoteIntroBare: (number) => `Segue o nosso orçamento ${number}.`,
    invoiceIntro: (number, project) =>
      `Segue a nossa fatura ${number} para ${project}.`,
    invoiceIntroBare: (number) => `Segue a nossa fatura ${number}.`,
    attachment: (filename) => `Ficheiro PDF: ${filename}`,
    regards: "Com os melhores cumprimentos,",
  },
};

function codePoints(value: string): string[] {
  return Array.from(value);
}

function sliceCodePoints(value: string, count: number): string {
  if (count <= 0) return "";
  return codePoints(value).slice(0, count).join("");
}

export function singleLine(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

function limitSubject(title: string, documentNumber: string, projectTitle: string): string {
  const head = [title, documentNumber].filter(Boolean).join(" ");
  const project = singleLine(projectTitle);
  const full = project ? `${head} — ${project}` : head;
  if (codePoints(full).length <= SUBJECT_MAX) return full;
  const room = SUBJECT_MAX - codePoints(head).length - codePoints(" — ").length - 1;
  if (project && room >= 1) {
    return `${head} — ${sliceCodePoints(project, room).trimEnd()}${ELLIPSIS}`;
  }
  if (codePoints(head).length <= SUBJECT_MAX) return head;
  if (SUBJECT_MAX <= 1) return sliceCodePoints(ELLIPSIS, SUBJECT_MAX);
  return `${sliceCodePoints(head, SUBJECT_MAX - 1).trimEnd()}${ELLIPSIS}`;
}

export function clientDocumentEmailMessage(input: {
  kind: DocumentKind;
  language: OrganizationLanguage;
  documentNumber: string;
  projectTitle: string;
  greetingName: string;
  issuerName: string;
  pdfFilename: string;
}): { subject: string; body: string } {
  const copy = COPY[input.language];
  const title = input.kind === "quote" ? copy.quoteTitle : copy.invoiceTitle;
  const number = singleLine(input.documentNumber);
  const project = singleLine(input.projectTitle);
  const greeting = singleLine(input.greetingName);
  const issuer = singleLine(input.issuerName);
  const filename = singleLine(input.pdfFilename);
  const intro =
    input.kind === "quote"
      ? project
        ? copy.quoteIntro(number, project)
        : copy.quoteIntroBare(number)
      : project
        ? copy.invoiceIntro(number, project)
        : copy.invoiceIntroBare(number);
  const lines = [
    greeting ? copy.helloNamed(greeting) : copy.helloPlain,
    "",
    intro,
    "",
    copy.attachment(filename),
    "",
    copy.regards,
  ];
  if (issuer) lines.push(issuer);
  return {
    subject: limitSubject(title, number, project),
    body: lines.join("\n"),
  };
}

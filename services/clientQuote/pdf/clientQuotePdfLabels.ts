/**
 * Document chrome for an issued client quotation.
 * Selected from the snapshot content language, never the browser
 * or the current Master UI language. User narrative is not stored here.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";

export type ClientQuotePdfLabels = {
  documentTitle: string;
  preparedBy: string;
  preparedFor: string;
  quoteNumber: string;
  issueDate: string;
  validUntil: string;
  validForDays: string;
  scope: string;
  services: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  subtotal: string;
  discount: string;
  taxableAmount: string;
  tax: string;
  total: string;
  paymentTerms: string;
  commercialNotes: string;
  appendix: string;
  page: string;
  registration: string;
  taxIdentifier: string;
};

const LABELS: Record<OrganizationLanguage, ClientQuotePdfLabels> = {
  en: {
    documentTitle: "Quotation",
    preparedBy: "Prepared by",
    preparedFor: "Prepared for",
    quoteNumber: "Quote number",
    issueDate: "Issue date",
    validUntil: "Valid until",
    validForDays: "Valid for {days} days",
    scope: "Scope",
    services: "Services",
    description: "Description",
    quantity: "Quantity",
    unitPrice: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    discount: "Discount",
    taxableAmount: "Taxable amount",
    tax: "Tax",
    total: "Total",
    paymentTerms: "Payment terms",
    commercialNotes: "Commercial notes",
    appendix: "Appendix",
    page: "Page {page} of {pages}",
    registration: "Registration",
    taxIdentifier: "Tax ID",
  },
  fr: {
    documentTitle: "Devis",
    preparedBy: "Préparé par",
    preparedFor: "Préparé pour",
    quoteNumber: "Numéro de devis",
    issueDate: "Date d'émission",
    validUntil: "Valable jusqu'au",
    validForDays: "Valable {days} jours",
    scope: "Périmètre",
    services: "Prestations",
    description: "Description",
    quantity: "Quantité",
    unitPrice: "Prix unitaire",
    amount: "Montant",
    subtotal: "Sous-total",
    discount: "Remise",
    taxableAmount: "Montant imposable",
    tax: "Taxe",
    total: "Total",
    paymentTerms: "Conditions de paiement",
    commercialNotes: "Notes commerciales",
    appendix: "Annexe",
    page: "Page {page} sur {pages}",
    registration: "Immatriculation",
    taxIdentifier: "Identifiant fiscal",
  },
  es: {
    documentTitle: "Presupuesto",
    preparedBy: "Preparado por",
    preparedFor: "Preparado para",
    quoteNumber: "Número de presupuesto",
    issueDate: "Fecha de emisión",
    validUntil: "Válido hasta",
    validForDays: "Válido durante {days} días",
    scope: "Alcance",
    services: "Servicios",
    description: "Descripción",
    quantity: "Cantidad",
    unitPrice: "Precio unitario",
    amount: "Importe",
    subtotal: "Subtotal",
    discount: "Descuento",
    taxableAmount: "Base imponible",
    tax: "Impuesto",
    total: "Total",
    paymentTerms: "Condiciones de pago",
    commercialNotes: "Notas comerciales",
    appendix: "Anexo",
    page: "Página {page} de {pages}",
    registration: "Registro",
    taxIdentifier: "Identificación fiscal",
  },
  it: {
    documentTitle: "Preventivo",
    preparedBy: "Preparato da",
    preparedFor: "Preparato per",
    quoteNumber: "Numero di preventivo",
    issueDate: "Data di emissione",
    validUntil: "Valido fino al",
    validForDays: "Valido per {days} giorni",
    scope: "Ambito",
    services: "Servizi",
    description: "Descrizione",
    quantity: "Quantità",
    unitPrice: "Prezzo unitario",
    amount: "Importo",
    subtotal: "Subtotale",
    discount: "Sconto",
    taxableAmount: "Imponibile",
    tax: "Imposta",
    total: "Totale",
    paymentTerms: "Condizioni di pagamento",
    commercialNotes: "Note commerciali",
    appendix: "Appendice",
    page: "Pagina {page} di {pages}",
    registration: "Registrazione",
    taxIdentifier: "Codice fiscale",
  },
  de: {
    documentTitle: "Angebot",
    preparedBy: "Erstellt von",
    preparedFor: "Erstellt für",
    quoteNumber: "Angebotsnummer",
    issueDate: "Ausstellungsdatum",
    validUntil: "Gültig bis",
    validForDays: "Gültig für {days} Tage",
    scope: "Leistungsumfang",
    services: "Leistungen",
    description: "Beschreibung",
    quantity: "Menge",
    unitPrice: "Einzelpreis",
    amount: "Betrag",
    subtotal: "Zwischensumme",
    discount: "Rabatt",
    taxableAmount: "Steuerpflichtiger Betrag",
    tax: "Steuer",
    total: "Gesamt",
    paymentTerms: "Zahlungsbedingungen",
    commercialNotes: "Kommerzielle Hinweise",
    appendix: "Anhang",
    page: "Seite {page} von {pages}",
    registration: "Register",
    taxIdentifier: "Steuer-ID",
  },
  pt: {
    documentTitle: "Orçamento",
    preparedBy: "Preparado por",
    preparedFor: "Preparado para",
    quoteNumber: "Número do orçamento",
    issueDate: "Data de emissão",
    validUntil: "Válido até",
    validForDays: "Válido por {days} dias",
    scope: "Âmbito",
    services: "Serviços",
    description: "Descrição",
    quantity: "Quantidade",
    unitPrice: "Preço unitário",
    amount: "Montante",
    subtotal: "Subtotal",
    discount: "Desconto",
    taxableAmount: "Valor tributável",
    tax: "Imposto",
    total: "Total",
    paymentTerms: "Condições de pagamento",
    commercialNotes: "Notas comerciais",
    appendix: "Anexo",
    page: "Página {page} de {pages}",
    registration: "Registo",
    taxIdentifier: "Identificação fiscal",
  },
};

export const CLIENT_QUOTE_PDF_LABEL_KEYS = Object.keys(
  LABELS.en,
) as Array<keyof ClientQuotePdfLabels>;

export function clientQuotePdfLabels(
  language: OrganizationLanguage | string,
): ClientQuotePdfLabels {
  if (language in LABELS) {
    return LABELS[language as OrganizationLanguage];
  }
  return LABELS.en;
}

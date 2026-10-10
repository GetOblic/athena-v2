/**
 * Document chrome for an issued client invoice.
 * Selected from the snapshot content language, never the browser
 * or the current Master UI language. User narrative is not stored here.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";

export type ClientInvoicePdfLabels = {
  documentTitle: string;
  preparedBy: string;
  preparedFor: string;
  invoiceNumber: string;
  issueDate: string;
  paymentDueDate: string;
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
  paymentInstructions: string;
  sourceQuote: string;
  sourceQuoteIssued: string;
  page: string;
  registration: string;
  taxIdentifier: string;
  billing: string;
  frequencyOneTime: string;
  frequencyMonthly: string;
  frequencyQuarterly: string;
  frequencyAnnually: string;
  frequencyTotalsTitle: string;
  frequencyTotal: string;
};

const LABELS: Record<OrganizationLanguage, ClientInvoicePdfLabels> = {
  en: {
    documentTitle: "Invoice",
    preparedBy: "Prepared by",
    preparedFor: "Prepared for",
    invoiceNumber: "Invoice number",
    issueDate: "Issue date",
    paymentDueDate: "Payment due",
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
    paymentInstructions: "Payment instructions",
    sourceQuote: "Source quotation",
    sourceQuoteIssued: "Issued {date}",
    page: "Page {page} of {pages}",
    registration: "Registration",
    taxIdentifier: "Tax ID",
    billing: "Billing",
    frequencyOneTime: "One-time",
    frequencyMonthly: "Monthly",
    frequencyQuarterly: "Quarterly",
    frequencyAnnually: "Annually",
    frequencyTotalsTitle: "Totals by billing frequency",
    frequencyTotal: "{frequency} total",
  },
  fr: {
    documentTitle: "Facture",
    preparedBy: "Préparé par",
    preparedFor: "Préparé pour",
    invoiceNumber: "Numéro de facture",
    issueDate: "Date d'émission",
    paymentDueDate: "Échéance",
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
    paymentInstructions: "Instructions de paiement",
    sourceQuote: "Devis d'origine",
    sourceQuoteIssued: "Émis le {date}",
    page: "Page {page} sur {pages}",
    registration: "Immatriculation",
    taxIdentifier: "Identifiant fiscal",
    billing: "Facturation",
    frequencyOneTime: "Ponctuel",
    frequencyMonthly: "Mensuel",
    frequencyQuarterly: "Trimestriel",
    frequencyAnnually: "Annuel",
    frequencyTotalsTitle: "Totaux par fréquence de facturation",
    frequencyTotal: "Total {frequency}",
  },
  es: {
    documentTitle: "Factura",
    preparedBy: "Preparado por",
    preparedFor: "Preparado para",
    invoiceNumber: "Número de factura",
    issueDate: "Fecha de emisión",
    paymentDueDate: "Vencimiento",
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
    paymentInstructions: "Instrucciones de pago",
    sourceQuote: "Presupuesto de origen",
    sourceQuoteIssued: "Emitido el {date}",
    page: "Página {page} de {pages}",
    registration: "Registro",
    taxIdentifier: "Identificación fiscal",
    billing: "Facturación",
    frequencyOneTime: "Pago único",
    frequencyMonthly: "Mensual",
    frequencyQuarterly: "Trimestral",
    frequencyAnnually: "Anual",
    frequencyTotalsTitle: "Totales por frecuencia de facturación",
    frequencyTotal: "Total {frequency}",
  },
  it: {
    documentTitle: "Fattura",
    preparedBy: "Preparato da",
    preparedFor: "Preparato per",
    invoiceNumber: "Numero di fattura",
    issueDate: "Data di emissione",
    paymentDueDate: "Scadenza",
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
    paymentInstructions: "Istruzioni di pagamento",
    sourceQuote: "Preventivo di origine",
    sourceQuoteIssued: "Emesso il {date}",
    page: "Pagina {page} di {pages}",
    registration: "Registrazione",
    taxIdentifier: "Codice fiscale",
    billing: "Fatturazione",
    frequencyOneTime: "Una tantum",
    frequencyMonthly: "Mensile",
    frequencyQuarterly: "Trimestrale",
    frequencyAnnually: "Annuale",
    frequencyTotalsTitle: "Totali per frequenza di fatturazione",
    frequencyTotal: "Totale {frequency}",
  },
  de: {
    documentTitle: "Rechnung",
    preparedBy: "Erstellt von",
    preparedFor: "Erstellt für",
    invoiceNumber: "Rechnungsnummer",
    issueDate: "Ausstellungsdatum",
    paymentDueDate: "Fällig am",
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
    paymentInstructions: "Zahlungsanweisungen",
    sourceQuote: "Ursprungsangebot",
    sourceQuoteIssued: "Ausgestellt am {date}",
    page: "Seite {page} von {pages}",
    registration: "Register",
    taxIdentifier: "Steuer-ID",
    billing: "Abrechnung",
    frequencyOneTime: "Einmalig",
    frequencyMonthly: "Monatlich",
    frequencyQuarterly: "Vierteljährlich",
    frequencyAnnually: "Jährlich",
    frequencyTotalsTitle: "Summen nach Abrechnungsrhythmus",
    frequencyTotal: "{frequency} gesamt",
  },
  pt: {
    documentTitle: "Fatura",
    preparedBy: "Preparado por",
    preparedFor: "Preparado para",
    invoiceNumber: "Número da fatura",
    issueDate: "Data de emissão",
    paymentDueDate: "Vencimento",
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
    paymentInstructions: "Instruções de pagamento",
    sourceQuote: "Orçamento de origem",
    sourceQuoteIssued: "Emitido em {date}",
    page: "Página {page} de {pages}",
    registration: "Registo",
    taxIdentifier: "Identificação fiscal",
    billing: "Faturação",
    frequencyOneTime: "Pontual",
    frequencyMonthly: "Mensal",
    frequencyQuarterly: "Trimestral",
    frequencyAnnually: "Anual",
    frequencyTotalsTitle: "Totais por frequência de faturação",
    frequencyTotal: "Total {frequency}",
  },
};

export const CLIENT_INVOICE_PDF_LABEL_KEYS = Object.keys(
  LABELS.en,
) as Array<keyof ClientInvoicePdfLabels>;

export function clientInvoicePdfLabels(
  language: OrganizationLanguage | string,
): ClientInvoicePdfLabels {
  if (language in LABELS) {
    return LABELS[language as OrganizationLanguage];
  }
  return LABELS.en;
}

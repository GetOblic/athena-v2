"use client";

import { useFormStatus } from "react-dom";

const fieldClassName =
  "rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/90 shadow-inner shadow-black/20 outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

export type BusinessInformationValues = {
  legal_name: string;
  address: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  business_email: string;
  decision_maker: string;
  job_title: string;
  registration_number: string;
  tax_identifier: string;
  tax_identifier_label: string;
  whatsapp_number: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  google_business_url: string;
  category: string;
  industry: string;
  timezone: string;
};

type BusinessMessages = {
  eyebrow: string;
  title: string;
  description: string;
  tradingName: string;
  tradingNameHelp: string;
  legalName: string;
  address: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  businessEmail: string;
  decisionMaker: string;
  jobTitle: string;
  registrationNumber: string;
  taxIdentifier: string;
  taxIdentifierLabel: string;
  classificationTitle: string;
  communicationTitle: string;
  onlinePresenceTitle: string;
  category: string;
  industry: string;
  timezone: string;
  whatsappNumber: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  googleBusiness: string;
  save: string;
  saving: string;
};

const DEFAULT_BUSINESS_MESSAGES: BusinessMessages = {
  eyebrow: "Business Information",
  title: "Business Information",
  description:
    "Commercial details for this account. Website, logo, and brand colors stay in their existing sections.",
  tradingName: "Business Name",
  tradingNameHelp: "The account display name. It is not edited here.",
  legalName: "Legal Name",
  address: "Address",
  addressLine2: "Address Line 2",
  city: "City",
  state: "State",
  postalCode: "Postal Code",
  country: "Country",
  phone: "Phone",
  businessEmail: "Business Email",
  decisionMaker: "Decision Maker",
  jobTitle: "Job Title",
  registrationNumber: "Registration Number",
  taxIdentifier: "Tax Identifier",
  taxIdentifierLabel: "Tax Identifier Label",
  classificationTitle: "Business Classification",
  communicationTitle: "Business Communication",
  onlinePresenceTitle: "Online Presence",
  category: "Category",
  industry: "Industry",
  timezone: "Timezone",
  whatsappNumber: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  googleBusiness: "Google Business Profile",
  save: "Save Business Information",
  saving: "Saving…",
};

const PROFILE_FIELDS = [
  ["legal_name", "legalName"],
  ["address", "address"],
  ["address_line2", "addressLine2"],
  ["city", "city"],
  ["state", "state"],
  ["postal_code", "postalCode"],
  ["country", "country"],
  ["decision_maker", "decisionMaker"],
  ["job_title", "jobTitle"],
  ["registration_number", "registrationNumber"],
  ["tax_identifier", "taxIdentifier"],
  ["tax_identifier_label", "taxIdentifierLabel"],
] as const satisfies ReadonlyArray<
  readonly [keyof BusinessInformationValues, keyof BusinessMessages]
>;

const CLASSIFICATION_FIELDS = [
  ["category", "category"],
  ["industry", "industry"],
  ["timezone", "timezone"],
] as const satisfies ReadonlyArray<
  readonly [keyof BusinessInformationValues, keyof BusinessMessages]
>;

const COMMUNICATION_FIELDS = [
  ["business_email", "businessEmail"],
  ["phone", "phone"],
  ["whatsapp_number", "whatsappNumber"],
] as const satisfies ReadonlyArray<
  readonly [keyof BusinessInformationValues, keyof BusinessMessages]
>;

const ONLINE_PRESENCE_FIELDS = [
  ["facebook", "facebook"],
  ["instagram", "instagram"],
  ["linkedin", "linkedin"],
  ["google_business_url", "googleBusiness"],
] as const satisfies ReadonlyArray<
  readonly [keyof BusinessInformationValues, keyof BusinessMessages]
>;

type BusinessInformationSectionProps = {
  tradingName: string;
  initialValues: BusinessInformationValues;
  saveBusinessInformation: (formData: FormData) => Promise<void>;
  error?: string | null;
  messages?: BusinessMessages;
};

function SaveBusinessButton({
  saveLabel,
  savingLabel,
}: {
  saveLabel: string;
  savingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-fit items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? savingLabel : saveLabel}
    </button>
  );
}

function CommercialFields({
  fields,
  values,
  messages,
}: {
  fields: ReadonlyArray<
    readonly [keyof BusinessInformationValues, keyof BusinessMessages]
  >;
  values: BusinessInformationValues;
  messages: BusinessMessages;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map(([name, labelKey]) => (
        <label key={name} className="grid gap-2" htmlFor={name}>
          <span className="text-sm font-medium text-white/80">
            {messages[labelKey]}
          </span>
          <input
            id={name}
            name={name}
            type="text"
            defaultValue={values[name]}
            className={fieldClassName}
            autoComplete="off"
          />
        </label>
      ))}
    </div>
  );
}

function CommercialFieldGroup({
  title,
  fields,
  values,
  messages,
}: {
  title: string;
  fields: ReadonlyArray<
    readonly [keyof BusinessInformationValues, keyof BusinessMessages]
  >;
  values: BusinessInformationValues;
  messages: BusinessMessages;
}) {
  return (
    <div className="grid gap-4">
      <h3 className="text-xs font-semibold tracking-[0.14em] text-white/40 uppercase">
        {title}
      </h3>
      <CommercialFields fields={fields} values={values} messages={messages} />
    </div>
  );
}

export function BusinessInformationSection({
  tradingName,
  initialValues,
  saveBusinessInformation,
  error = null,
  messages = DEFAULT_BUSINESS_MESSAGES,
}: BusinessInformationSectionProps) {
  return (
    <section className="grid gap-8">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-white/40 uppercase">
          {messages.eyebrow}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-white/45">
          {messages.description}
        </p>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium text-white/80">
          {messages.tradingName}
        </span>
        <p className="text-sm text-white/90">{tradingName || "—"}</p>
        <p className="text-sm text-white/40">{messages.tradingNameHelp}</p>
      </div>

      <form action={saveBusinessInformation} className="grid gap-6">
        <CommercialFields
          fields={PROFILE_FIELDS}
          values={initialValues}
          messages={messages}
        />
        <CommercialFieldGroup
          title={messages.classificationTitle}
          fields={CLASSIFICATION_FIELDS}
          values={initialValues}
          messages={messages}
        />
        <CommercialFieldGroup
          title={messages.communicationTitle}
          fields={COMMUNICATION_FIELDS}
          values={initialValues}
          messages={messages}
        />
        <CommercialFieldGroup
          title={messages.onlinePresenceTitle}
          fields={ONLINE_PRESENCE_FIELDS}
          values={initialValues}
          messages={messages}
        />

        {error ? (
          <p className="text-sm text-rose-300/90" role="alert">
            {error}
          </p>
        ) : null}

        <SaveBusinessButton
          saveLabel={messages.save}
          savingLabel={messages.saving}
        />
      </form>
    </section>
  );
}

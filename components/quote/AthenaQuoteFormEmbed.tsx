"use client";

import Script from "next/script";

const FORM_ID = "NQfn7tnDbGyyq9JVei6Q";
const FORM_NAME = "Request a GetOblic Fulfillment Quote";
const FORM_SRC = `https://go.getoblic.com/widget/form/${FORM_ID}`;
const SCRIPT_SRC = "https://go.getoblic.com/js/form_embed.js";
const SCRIPT_ID = "ghl-athena-quote-form-embed";
const IFRAME_ID = `inline-${FORM_ID}`;

/**
 * GoHighLevel fulfillment-quote embed for Athena Quote.
 * Uses next/script with a stable id so the GHL loader is not injected twice.
 * The embed script owns dynamic iframe height after load.
 */
export function AthenaQuoteFormEmbed() {
  return (
    <div className="relative w-full overflow-hidden rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
      <div className="min-h-[720px] w-full">
        <iframe
          src={FORM_SRC}
          id={IFRAME_ID}
          title={FORM_NAME}
          className="block w-full border-0"
          style={{
            width: "100%",
            minHeight: 720,
            height: "100%",
            border: "none",
            borderRadius: 8,
          }}
          data-layout='{"id":"INLINE"}'
          data-trigger-type="alwaysShow"
          data-trigger-value=""
          data-activation-type="alwaysActivated"
          data-activation-value=""
          data-deactivation-type="neverDeactivate"
          data-deactivation-value=""
          data-form-name={FORM_NAME}
          data-height="undefined"
          data-layout-iframe-id={IFRAME_ID}
          data-form-id={FORM_ID}
        />
      </div>

      <Script src={SCRIPT_SRC} strategy="afterInteractive" id={SCRIPT_ID} />
    </div>
  );
}

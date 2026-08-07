import { redirect } from "next/navigation";

/** Athena Quote lives in the Master Licensee console. */
export default function AthenaQuoteRedirectPage() {
  redirect("/licensee/quote");
}

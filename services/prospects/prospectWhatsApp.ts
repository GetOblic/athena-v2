/**
 * WhatsApp number helpers — link generation only; never mutate stored values.
 */

/** Digits-only wa.me URL, or null when the value cannot form a usable number. */
export function buildWhatsAppMeUrl(value?: string | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }
  return `https://wa.me/${digits}`;
}

/**
 * Local QR generation helpers (browser). No external QR services.
 */

export async function renderGetOblicQrDataUrl(
  value: string,
  size = 240,
): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: {
      dark: "#0b0b0f",
      light: "#ffffff",
    },
  });
}

export function downloadDataUrlPng(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

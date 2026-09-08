import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Server-only secret encryption. Do not import from browser / client components.
 * Format: v1.{iv}.{tag}.{ciphertext} with base64url components.
 */

const SECRET_VERSION = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_BYTE_LENGTH = 32;
const KEY_HEX_LENGTH = 64;
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

export class EncryptedSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptedSecretError";
  }
}

function readEncryptionKey(): Buffer {
  const hex = process.env.ATHENA_SECRET_ENCRYPTION_KEY;
  if (typeof hex !== "string" || hex.length === 0) {
    throw new EncryptedSecretError(
      "ATHENA_SECRET_ENCRYPTION_KEY is not configured.",
    );
  }
  if (hex.length !== KEY_HEX_LENGTH || !KEY_HEX_PATTERN.test(hex)) {
    throw new EncryptedSecretError(
      "ATHENA_SECRET_ENCRYPTION_KEY must be exactly 64 hex characters.",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTE_LENGTH) {
    throw new EncryptedSecretError(
      "ATHENA_SECRET_ENCRYPTION_KEY must decode to 32 bytes.",
    );
  }
  return key;
}

function decodeBase64UrlPart(value: string, label: string): Buffer {
  if (!value || /[+/]/.test(value) || value.includes("=")) {
    throw new EncryptedSecretError(`Stored secret ${label} is malformed.`);
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    throw new EncryptedSecretError(`Stored secret ${label} is malformed.`);
  }
  if (decoded.length === 0) {
    throw new EncryptedSecretError(`Stored secret ${label} is malformed.`);
  }
  const reencoded = decoded.toString("base64url");
  if (reencoded !== value) {
    throw new EncryptedSecretError(`Stored secret ${label} is malformed.`);
  }
  return decoded;
}

export function encryptSecret(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EncryptedSecretError("Secret plaintext must be a non-empty string.");
  }

  const key = readEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new EncryptedSecretError("Encryption produced an invalid auth tag.");
  }

  return [
    SECRET_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EncryptedSecretError("Stored secret is malformed.");
  }

  const parts = value.split(".");
  if (parts.length !== 4) {
    throw new EncryptedSecretError("Stored secret is malformed.");
  }

  const [version, ivPart, tagPart, ciphertextPart] = parts;
  if (version !== SECRET_VERSION) {
    throw new EncryptedSecretError("Stored secret version is unsupported.");
  }

  const iv = decodeBase64UrlPart(ivPart ?? "", "iv");
  const tag = decodeBase64UrlPart(tagPart ?? "", "tag");
  const ciphertext = decodeBase64UrlPart(ciphertextPart ?? "", "ciphertext");
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new EncryptedSecretError("Stored secret is malformed.");
  }

  const key = readEncryptionKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new EncryptedSecretError("Stored secret is malformed.");
  }
}

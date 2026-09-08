import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  EncryptedSecretError,
} from "../../lib/serverEncryptedSecret";

const VALID_KEY = "0".repeat(64);
const OTHER_KEY = "1".repeat(64);

const originalKey = process.env.ATHENA_SECRET_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.ATHENA_SECRET_ENCRYPTION_KEY;
  } else {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = originalKey;
  }
});

describe("serverEncryptedSecret", () => {
  it("round-trips plaintext", () => {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = VALID_KEY;
    const plaintext = "GetOblic-account-password";
    const stored = encryptSecret(plaintext);
    assert.equal(decryptSecret(stored), plaintext);
  });

  it("uses a different IV and ciphertext for the same input", () => {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = VALID_KEY;
    const first = encryptSecret("same-secret");
    const second = encryptSecret("same-secret");
    assert.notEqual(first, second);
    assert.equal(decryptSecret(first), "same-secret");
    assert.equal(decryptSecret(second), "same-secret");
  });

  it("rejects a missing key", () => {
    delete process.env.ATHENA_SECRET_ENCRYPTION_KEY;
    assert.throws(
      () => encryptSecret("secret"),
      (error: unknown) => {
        assert.ok(error instanceof EncryptedSecretError);
        assert.match(error.message, /not configured/);
        return true;
      },
    );
  });

  it("rejects a malformed key", () => {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = "abc";
    assert.throws(
      () => encryptSecret("secret"),
      (error: unknown) => {
        assert.ok(error instanceof EncryptedSecretError);
        assert.match(error.message, /64 hex/);
        return true;
      },
    );

    process.env.ATHENA_SECRET_ENCRYPTION_KEY = "g".repeat(64);
    assert.throws(
      () => encryptSecret("secret"),
      (error: unknown) => error instanceof EncryptedSecretError,
    );
  });

  it("rejects an empty plaintext", () => {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = VALID_KEY;
    assert.throws(
      () => encryptSecret(""),
      (error: unknown) => error instanceof EncryptedSecretError,
    );
  });

  it("rejects a malformed stored payload", () => {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = VALID_KEY;
    for (const payload of [
      "",
      "not-a-secret",
      "v2.a.b.c",
      "v1.only-two",
      "v1.+++.tag.ciphertext",
    ]) {
      assert.throws(
        () => decryptSecret(payload),
        (error: unknown) => error instanceof EncryptedSecretError,
      );
    }
  });

  it("rejects tampered ciphertext and auth tag", () => {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = VALID_KEY;
    const stored = encryptSecret("original-password");
    const [version, iv, tag, ciphertext] = stored.split(".");
    assert.ok(version && iv && tag && ciphertext);

    const tamperedTag = `${version}.${iv}.${tag.slice(0, -2)}aa.${ciphertext}`;
    const tamperedCiphertext = `${version}.${iv}.${tag}.${ciphertext.slice(0, -2)}aa`;

    assert.throws(
      () => decryptSecret(tamperedTag),
      (error: unknown) => error instanceof EncryptedSecretError,
    );
    assert.throws(
      () => decryptSecret(tamperedCiphertext),
      (error: unknown) => error instanceof EncryptedSecretError,
    );
  });

  it("fails closed when decrypting with a different key", () => {
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = VALID_KEY;
    const stored = encryptSecret("original-password");
    process.env.ATHENA_SECRET_ENCRYPTION_KEY = OTHER_KEY;
    assert.throws(
      () => decryptSecret(stored),
      (error: unknown) => error instanceof EncryptedSecretError,
    );
  });
});

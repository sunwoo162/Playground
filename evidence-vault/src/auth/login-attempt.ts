import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type LoginAttempt = {
  state: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
};

function keyFromSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("session_secret_too_short");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function sanitizeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  try {
    const base = new URL("https://evidence-vault.invalid");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function sealLoginAttempt(attempt: LoginAttempt, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(attempt), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ciphertext, tag].map((part) => part.toString("base64url")).join(".");
}

export function openLoginAttempt(sealed: string, secret: string, now = Date.now()): LoginAttempt {
  try {
    const [ivValue, ciphertextValue, tagValue, extra] = sealed.split(".");
    if (!ivValue || !ciphertextValue || !tagValue || extra) throw new Error("invalid_parts");
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(plaintext.toString("utf8")) as Partial<LoginAttempt>;
    if (
      typeof parsed.state !== "string" || !parsed.state ||
      typeof parsed.verifier !== "string" || !parsed.verifier ||
      typeof parsed.expiresAt !== "number"
    ) {
      throw new Error("invalid_payload");
    }
    if (parsed.expiresAt <= now) throw new Error("oauth_attempt_expired");
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      returnTo: sanitizeReturnTo(parsed.returnTo),
      expiresAt: parsed.expiresAt,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "oauth_attempt_expired") throw error;
    throw new Error("oauth_attempt_invalid");
  }
}

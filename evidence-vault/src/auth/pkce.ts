import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

function base64url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export function createPkceAttempt() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier, "ascii").digest());
  const state = base64url(randomBytes(24));
  return { verifier, challenge, state };
}

export function statesMatch(expected: string, actual: string | null | undefined) {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function healthPayload() {
  return { ok: true as const, service: "evidence-vault" as const };
}

import { and, eq } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { cases, vaultItems } from "@/src/db/schema";
import type { OwnedResourceKey } from "./vault-repository";

export async function getCase({ ownerUserId, id }: OwnedResourceKey) {
  const [row] = await getDb()
    .select({ caseRow: cases })
    .from(cases)
    .innerJoin(vaultItems, eq(cases.vaultItemId, vaultItems.id))
    .where(and(eq(cases.id, id), eq(vaultItems.userId, ownerUserId)))
    .limit(1);
  return row?.caseRow ?? null;
}

import { and, eq } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { vaultItems } from "@/src/db/schema";

export type OwnedResourceKey = { ownerUserId: string; id: string };

export async function getVaultItem({ ownerUserId, id }: OwnedResourceKey) {
  const [row] = await getDb()
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, ownerUserId)))
    .limit(1);
  return row ?? null;
}

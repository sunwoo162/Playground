import { and, eq } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { cases, exportPackets, vaultItems } from "@/src/db/schema";
import type { OwnedResourceKey } from "./vault-repository";

export async function getExportPacket({ ownerUserId, id }: OwnedResourceKey) {
  const [row] = await getDb()
    .select({ exportRow: exportPackets })
    .from(exportPackets)
    .innerJoin(cases, eq(exportPackets.caseId, cases.id))
    .innerJoin(vaultItems, eq(cases.vaultItemId, vaultItems.id))
    .where(and(eq(exportPackets.id, id), eq(vaultItems.userId, ownerUserId)))
    .limit(1);
  return row?.exportRow ?? null;
}

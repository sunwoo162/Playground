import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { evidenceFiles } from "@/src/db/schema";
import type { OwnedResourceKey } from "./vault-repository";

export async function getEvidenceFile({ ownerUserId, id }: OwnedResourceKey) {
  const [row] = await getDb()
    .select()
    .from(evidenceFiles)
    .where(
      and(
        eq(evidenceFiles.id, id),
        eq(evidenceFiles.userId, ownerUserId),
        isNull(evidenceFiles.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { appSessions, users } from "@/src/db/schema";

export async function createSessionRecord(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  const [row] = await getDb().insert(appSessions).values(input).returning();
  return row;
}

export async function findActiveSessionByHash(tokenHash: string, now = new Date()) {
  const [row] = await getDb()
    .select({ session: appSessions, user: users })
    .from(appSessions)
    .innerJoin(users, eq(appSessions.userId, users.id))
    .where(
      and(
        eq(appSessions.tokenHash, tokenHash),
        isNull(appSessions.revokedAt),
        isNull(users.deletedAt),
        gt(appSessions.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function revokeSessionByHash(tokenHash: string, revokedAt = new Date()) {
  await getDb()
    .update(appSessions)
    .set({ revokedAt })
    .where(and(eq(appSessions.tokenHash, tokenHash), isNull(appSessions.revokedAt)));
}

import type { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Runs fn while holding a database lock, so two people can't grab the same slot at once.
 * The slot check inside fn must happen after the lock is taken.
 */
export async function withBookingLock<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    return fn(tx);
  });
}

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export async function getSettings() {
  return db.businessSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

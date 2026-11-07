import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Tolerate a connection string pasted with quotes or a "psql" prefix.
function cleanDbUrl(raw?: string) {
  return (raw ?? "")
    .trim()
    .replace(/^psql\s+/i, "")
    .replace(/^DATABASE_URL\s*=\s*/i, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

const url = cleanDbUrl(process.env.DATABASE_URL);

export const db =
  globalForPrisma.prisma ?? new PrismaClient(url ? { datasourceUrl: url } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export async function getSettings() {
  return db.businessSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

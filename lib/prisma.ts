import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient(process.env.LEASING_DATABASE_URL ? { datasourceUrl: process.env.LEASING_DATABASE_URL } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
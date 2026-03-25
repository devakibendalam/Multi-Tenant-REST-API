import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getDeadLetterJobs(tenantId?: string): Promise<unknown[]> {
  const where: Record<string, unknown> = { status: "DEAD_LETTER" };
  if (tenantId) {
    where.tenantId = tenantId;
  }

  return prisma.emailLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

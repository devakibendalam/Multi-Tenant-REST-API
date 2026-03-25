import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { hashApiKey } from "../utils/hash";

const prisma = new PrismaClient();

export async function createTenant(
  name: string,
  ownerEmail: string,
  ownerName: string
): Promise<{ tenant: unknown; user: unknown; rawApiKey: string }> {
  const tenantId = uuidv4();
  const userId = uuidv4();

  // Generate API key
  const rawApiKey = `vgs_${uuidv4().replace(/-/g, "")}`;
  const keyPrefix = rawApiKey.substring(0, 12);
  const keyHash = await hashApiKey(rawApiKey);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { id: tenantId, name },
    });

    const user = await tx.user.create({
      data: {
        id: userId,
        email: ownerEmail,
        name: ownerName,
        role: "OWNER",
        tenantId: tenant.id,
      },
    });

    await tx.apiKey.create({
      data: {
        id: uuidv4(),
        keyHash,
        keyPrefix,
        tenantId: tenant.id,
        userId: user.id,
        isActive: true,
      },
    });

    return { tenant, user };
  });

  return {
    tenant: result.tenant,
    user: result.user,
    rawApiKey,
  };
}

export async function getTenant(tenantId: string): Promise<unknown> {
  // TENANT ISOLATION: Always filter by tenantId
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      },
      _count: {
        select: { apiKeys: true, auditLogs: true },
      },
    },
  });
}

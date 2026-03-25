import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { hashApiKey } from "../utils/hash";
import { config } from "../config";
import { ApiError } from "../utils/apiError";

const prisma = new PrismaClient();

export async function rotateApiKey(
  tenantId: string,
  userId: string,
  currentApiKeyId: string
): Promise<{
  newRawKey: string;
  newKeyPrefix: string;
  oldKeyPrefix: string;
  gracePeriodMinutes: number;
}> {
  // Verify the current key belongs to this tenant
  const currentKey = await prisma.apiKey.findFirst({
    where: { id: currentApiKeyId, tenantId, isActive: true },
  });

  if (!currentKey) {
    throw ApiError.notFound("API key not found");
  }

  // Generate new API key
  const newRawKey = `vgs_${uuidv4().replace(/-/g, "")}`;
  const newKeyPrefix = newRawKey.substring(0, 12);
  const newKeyHash = await hashApiKey(newRawKey);

  const graceMinutes = config.apiKeyRotationGraceMinutes;
  const expiresAt = new Date(Date.now() + graceMinutes * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // Mark the old key as expiring (grace period)
    await tx.apiKey.update({
      where: { id: currentApiKeyId },
      data: {
        expiresAt,
        rotatedAt: new Date(),
      },
    });

    // Create the new key
    await tx.apiKey.create({
      data: {
        id: uuidv4(),
        keyHash: newKeyHash,
        keyPrefix: newKeyPrefix,
        tenantId,
        userId,
        isActive: true,
      },
    });
  });

  return {
    newRawKey,
    newKeyPrefix,
    oldKeyPrefix: currentKey.keyPrefix,
    gracePeriodMinutes: graceMinutes,
  };
}

export async function listApiKeys(tenantId: string): Promise<unknown[]> {
  // TENANT ISOLATION: Always filter by tenantId
  return prisma.apiKey.findMany({
    where: { tenantId },
    select: {
      id: true,
      keyPrefix: true,
      isActive: true,
      expiresAt: true,
      rotatedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

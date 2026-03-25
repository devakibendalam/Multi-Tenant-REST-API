import { Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest, TenantContext } from "../types";
import { ApiError } from "../utils/apiError";
import { verifyApiKey } from "../utils/hash";

const prisma = new PrismaClient();

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers["x-api-key"] as string;

    if (!apiKey) {
      throw ApiError.unauthorized("Missing X-API-Key header");
    }

    // Extract the prefix to narrow down candidates
    const keyPrefix = apiKey.substring(0, 12);

    // Find all active keys with this prefix (including recently rotated keys)
    const candidates = await prisma.apiKey.findMany({
      where: {
        keyPrefix,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        tenant: true,
      },
    });

    if (candidates.length === 0) {
      throw ApiError.unauthorized("Invalid or expired API key");
    }

    // Verify against each candidate using Argon2
    let matchedKey: (typeof candidates)[0] | null = null;
    for (const candidate of candidates) {
      const isValid = await verifyApiKey(apiKey, candidate.keyHash);
      if (isValid) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      throw ApiError.unauthorized("Invalid or expired API key");
    }

    // Find the user associated with this key
    const user = await prisma.user.findFirst({
      where: {
        id: matchedKey.userId,
        tenantId: matchedKey.tenantId,
      },
    });

    if (!user) {
      throw ApiError.unauthorized("User not found for this API key");
    }

    // Set the tenant context
    req.tenantContext = {
      tenantId: matchedKey.tenantId,
      userId: user.id,
      userRole: user.role as "OWNER" | "MEMBER",
      apiKeyPrefix: matchedKey.keyPrefix,
      apiKeyId: matchedKey.id,
    };

    next();
  } catch (error) {
    next(error);
  }
}

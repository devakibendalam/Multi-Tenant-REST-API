import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { rotateApiKey, listApiKeys } from "../services/apiKey.service";
import { createAuditLog } from "../services/audit.service";
import { enqueueEmail } from "../queues/emailQueue";
import { ApiError } from "../utils/apiError";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handleRotateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();

    const result = await rotateApiKey(
      req.tenantContext.tenantId,
      req.tenantContext.userId,
      req.tenantContext.apiKeyId
    );

    // Audit log
    await createAuditLog(
      req.tenantContext,
      "API_KEY_ROTATED",
      "api_key",
      req.tenantContext.apiKeyId,
      { keyPrefix: result.oldKeyPrefix },
      { keyPrefix: result.newKeyPrefix },
      req.ip || "unknown"
    );

    // Queue notification email to Owner
    const owner = await prisma.user.findFirst({
      where: { id: req.tenantContext.userId },
      include: { tenant: true },
    });

    if (owner) {
      await enqueueEmail(
        req.tenantContext.tenantId,
        owner.email,
        "API_KEY_ROTATED",
        {
          ownerName: owner.name,
          tenantName: owner.tenant.name,
          oldKeyPrefix: result.oldKeyPrefix,
          newKeyPrefix: result.newKeyPrefix,
          rotatedAt: new Date().toISOString(),
        }
      );
    }

    res.json({
      data: {
        newApiKey: result.newRawKey,
        newKeyPrefix: result.newKeyPrefix,
        oldKeyPrefix: result.oldKeyPrefix,
        gracePeriodMinutes: result.gracePeriodMinutes,
        warning:
          "Save this API key now. It will never be shown again. The old key will expire in " +
          result.gracePeriodMinutes +
          " minutes.",
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function handleListApiKeys(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();
    const keys = await listApiKeys(req.tenantContext.tenantId);
    res.json({ data: keys });
  } catch (error) {
    next(error);
  }
}

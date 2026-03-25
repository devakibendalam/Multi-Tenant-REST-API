import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { getAuditLogs, verifyAuditChain } from "../services/audit.service";
import { ApiError } from "../utils/apiError";

export async function handleGetAuditLogs(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();

    const { userId, action, resourceType, startDate, endDate, cursor, limit } =
      req.query;

    const result = await getAuditLogs(req.tenantContext.tenantId, {
      userId: userId as string,
      action: action as string,
      resourceType: resourceType as string,
      startDate: startDate as string,
      endDate: endDate as string,
      cursor: cursor as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleVerifyAuditChain(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();

    const result = await verifyAuditChain(req.tenantContext.tenantId);

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { createTenant, getTenant } from "../services/tenant.service";
import { createAuditLog } from "../services/audit.service";
import { ApiError } from "../utils/apiError";

export async function handleCreateTenant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, ownerEmail, ownerName } = req.body;

    if (!name || !ownerEmail || !ownerName) {
      throw ApiError.badRequest("name, ownerEmail, and ownerName are required");
    }

    const result = await createTenant(name, ownerEmail, ownerName);

    res.status(201).json({
      data: {
        tenant: result.tenant,
        user: result.user,
        apiKey: result.rawApiKey,
        warning: "Save this API key now. It will never be shown again.",
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function handleGetTenant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) {
      throw ApiError.unauthorized();
    }

    // TENANT ISOLATION: Only fetch the tenant from the resolved context
    const tenant = await getTenant(req.tenantContext.tenantId);

    if (!tenant) {
      throw ApiError.notFound("Tenant not found");
    }

    res.json({ data: tenant });
  } catch (error) {
    next(error);
  }
}

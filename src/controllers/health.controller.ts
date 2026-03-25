import { Request, Response, NextFunction } from "express";
import { getHealthStatus } from "../services/health.service";
import { getMetrics } from "../services/metrics.service";
import { config } from "../config";
import { ApiError } from "../utils/apiError";

function verifyInternalKey(req: Request): void {
  const apiKey = req.headers["x-internal-key"] as string;
  if (!apiKey || apiKey !== config.internalApiKey) {
    throw ApiError.unauthorized(
      "Invalid or missing internal API key. Use X-Internal-Key header."
    );
  }
}

export async function handleHealthCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    verifyInternalKey(req);
    const health = await getHealthStatus();
    const statusCode = health.status === "healthy" ? 200 : 503;
    res.status(statusCode).json({ data: health });
  } catch (error) {
    next(error);
  }
}

export async function handleMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    verifyInternalKey(req);

    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      throw ApiError.badRequest("tenantId query parameter is required");
    }

    const metrics = await getMetrics(tenantId);
    res.json({ data: metrics });
  } catch (error) {
    next(error);
  }
}

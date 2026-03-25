import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { ApiError } from "../utils/apiError";
import {
  checkGlobalRateLimit,
  checkEndpointRateLimit,
  checkBurstRateLimit,
  trackRequest,
} from "../services/rateLimiter.service";

export async function rateLimiterMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.tenantContext) {
    next();
    return;
  }

  const { tenantId, apiKeyPrefix } = req.tenantContext;
  const endpoint = `${req.method}:${req.route?.path || req.path}`;

  try {
    // Check all three tiers in order
    // Tier 1: Burst protection (per API key, 50 req per 5 seconds)
    const burstResult = await checkBurstRateLimit(apiKeyPrefix);
    if (burstResult.remaining <= 0) {
      setRateLimitHeaders(res, burstResult);
      throw ApiError.rateLimited("Burst rate limit exceeded", {
        tier: "burst",
        limit: burstResult.limit,
        current: burstResult.current,
        resetInSeconds: burstResult.resetInSeconds,
      });
    }

    // Tier 2: Endpoint limit (per tenant per endpoint)
    const endpointResult = await checkEndpointRateLimit(tenantId, endpoint);
    if (endpointResult.remaining <= 0) {
      setRateLimitHeaders(res, endpointResult);
      throw ApiError.rateLimited("Endpoint rate limit exceeded", {
        tier: "endpoint",
        limit: endpointResult.limit,
        current: endpointResult.current,
        resetInSeconds: endpointResult.resetInSeconds,
      });
    }

    // Tier 3: Global limit (per tenant, 1000 req per minute)
    const globalResult = await checkGlobalRateLimit(tenantId);
    if (globalResult.remaining <= 0) {
      setRateLimitHeaders(res, globalResult);
      throw ApiError.rateLimited("Global rate limit exceeded", {
        tier: "global",
        limit: globalResult.limit,
        current: globalResult.current,
        resetInSeconds: globalResult.resetInSeconds,
      });
    }

    // Set rate limit headers using global tier (most relevant to the user)
    setRateLimitHeaders(res, globalResult);

    // Track the request for metrics
    await trackRequest(tenantId, endpoint);

    next();
  } catch (error) {
    next(error);
  }
}

function setRateLimitHeaders(
  res: Response,
  info: { limit: number; remaining: number; resetInSeconds: number }
): void {
  res.set("X-RateLimit-Limit", info.limit.toString());
  res.set("X-RateLimit-Remaining", info.remaining.toString());
  res.set("X-RateLimit-Reset", info.resetInSeconds.toString());
}

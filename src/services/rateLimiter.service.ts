import { getRedisClient } from "../config/redis";
import { config } from "../config";
import { RateLimitInfo } from "../types";
import { enqueueEmail } from "../queues/emailQueue";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Sliding Window Rate Limiter using Redis sorted sets.
 *
 * Unlike a fixed window that resets at exact intervals (allowing burst at boundaries),
 * a sliding window considers requests over a rolling time period.
 *
 * Algorithm:
 * 1. Use a Redis sorted set where each member is a unique request ID
 *    and the score is the request timestamp in milliseconds.
 * 2. On each request:
 *    a. Remove all entries older than the window
 *    b. Count remaining entries
 *    c. If count < limit, add the new request
 *    d. If count >= limit, reject
 * 3. Set TTL on the key to auto-clean after the window expires
 */
async function slidingWindowCheck(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; current: number; resetInSeconds: number }> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - windowMs;
  const uniqueId = `${now}:${Math.random().toString(36).substring(2)}`;

  // Use a transaction for atomicity
  const pipeline = redis.multi();

  // Step 1: Remove expired entries (outside the sliding window)
  pipeline.zremrangebyscore(key, "-inf", windowStart);

  // Step 2: Count current entries in the window
  pipeline.zcard(key);

  // Execute to get count
  const results = await pipeline.exec();

  if (!results) {
    return {
      allowed: false,
      current: 0,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  const currentCount = (results[1]?.[1] as number) || 0;

  if (currentCount >= limit) {
    // Find the oldest entry to calculate reset time
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    let resetInSeconds = Math.ceil(windowMs / 1000);
    if (oldest.length >= 2) {
      const oldestTimestamp = parseInt(oldest[1], 10);
      resetInSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
      if (resetInSeconds < 1) resetInSeconds = 1;
    }

    return { allowed: false, current: currentCount, resetInSeconds };
  }

  // Step 3: Add the new request
  await redis.zadd(key, now, uniqueId);
  // Step 4: Set TTL to auto-cleanup
  await redis.pexpire(key, windowMs);

  return {
    allowed: true,
    current: currentCount + 1,
    resetInSeconds: Math.ceil(windowMs / 1000),
  };
}

export async function checkGlobalRateLimit(
  tenantId: string
): Promise<RateLimitInfo> {
  const key = `ratelimit:global:${tenantId}`;
  const limit = config.rateLimit.global;
  const windowMs = 60 * 1000; // 1 minute

  const result = await slidingWindowCheck(key, limit, windowMs);

  // Check if we should send a rate limit warning email (at 80%)
  const threshold = Math.floor(limit * 0.8);
  if (result.current === threshold) {
    await sendRateLimitWarning(tenantId, result.current, limit);
  }

  // Track metrics
  if (!result.allowed) {
    await trackRateLimitBreach(tenantId, "global");
  }

  return {
    tier: "global",
    limit,
    current: result.current,
    remaining: Math.max(0, limit - result.current),
    resetInSeconds: result.resetInSeconds,
  };
}

export async function checkEndpointRateLimit(
  tenantId: string,
  endpoint: string
): Promise<RateLimitInfo> {
  // Find matching endpoint config
  let limit = 100; // default
  for (const [pattern, configLimit] of Object.entries(
    config.endpointRateLimits
  )) {
    const regexPattern = pattern.replace(/\*/g, "[^/]+");
    if (new RegExp(`^${regexPattern}$`).test(endpoint)) {
      limit = configLimit;
      break;
    }
  }

  const key = `ratelimit:endpoint:${tenantId}:${endpoint}`;
  const windowMs = 60 * 1000; // 1 minute

  const result = await slidingWindowCheck(key, limit, windowMs);

  if (!result.allowed) {
    await trackRateLimitBreach(tenantId, "endpoint");
  }

  return {
    tier: "endpoint",
    limit,
    current: result.current,
    remaining: Math.max(0, limit - result.current),
    resetInSeconds: result.resetInSeconds,
  };
}

export async function checkBurstRateLimit(
  apiKeyPrefix: string
): Promise<RateLimitInfo> {
  const key = `ratelimit:burst:${apiKeyPrefix}`;
  const limit = config.rateLimit.burst;
  const windowMs = config.rateLimit.burstWindow * 1000; // 5 seconds

  const result = await slidingWindowCheck(key, limit, windowMs);

  return {
    tier: "burst",
    limit,
    current: result.current,
    remaining: Math.max(0, limit - result.current),
    resetInSeconds: result.resetInSeconds,
  };
}

async function sendRateLimitWarning(
  tenantId: string,
  current: number,
  limit: number
): Promise<void> {
  try {
    // Check if we already sent a warning in the last hour
    const redis = getRedisClient();
    const warningKey = `ratelimit:warning_sent:${tenantId}`;
    const alreadySent = await redis.get(warningKey);

    if (alreadySent) return; // Max one warning per hour

    // Find tenant owner
    const owner = await prisma.user.findFirst({
      where: { tenantId, role: "OWNER" },
      include: { tenant: true },
    });

    if (owner) {
      await enqueueEmail(tenantId, owner.email, "RATE_LIMIT_WARNING", {
        ownerName: owner.name,
        tenantName: owner.tenant.name,
        percentage: Math.round((current / limit) * 100).toString(),
        currentCount: current.toString(),
        limit: limit.toString(),
      });

      // Set flag for 1 hour
      await redis.set(warningKey, "1", "EX", 3600);
    }
  } catch (err) {
    console.error("Failed to send rate limit warning:", err);
  }
}

async function trackRateLimitBreach(
  tenantId: string,
  tier: string
): Promise<void> {
  try {
    const redis = getRedisClient();
    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    await redis.hincrby(
      `metrics:rate_limit_breaches:${tenantId}:${periodKey}`,
      tier,
      1
    );
  } catch (err) {
    console.error("Failed to track rate limit breach:", err);
  }
}

export async function trackRequest(
  tenantId: string,
  endpoint: string
): Promise<void> {
  try {
    const redis = getRedisClient();
    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;

    const pipeline = redis.multi();
    pipeline.hincrby(`metrics:requests:${tenantId}:${periodKey}`, "total", 1);
    pipeline.hincrby(`metrics:requests:${tenantId}:${periodKey}`, endpoint, 1);
    await pipeline.exec();
  } catch (err) {
    console.error("Failed to track request:", err);
  }
}

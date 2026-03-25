import { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../config/redis";

// Store response times in Redis for the last 60 seconds
export function responseTimeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - startTime;
    try {
      const redis = getRedisClient();
      const now = Date.now();
      // Add to sorted set with score as timestamp
      await redis.zadd("response_times", now, `${now}:${duration}`);
      // Remove entries older than 60 seconds
      await redis.zremrangebyscore("response_times", "-inf", now - 60000);
    } catch (err) {
      // Don't fail the request if metrics tracking fails
    }
  });

  next();
}

export async function getAverageResponseTime(): Promise<number> {
  try {
    const redis = getRedisClient();
    const now = Date.now();
    const entries = await redis.zrangebyscore(
      "response_times",
      now - 60000,
      now
    );

    if (entries.length === 0) return 0;

    const totalTime = entries.reduce((sum, entry) => {
      const duration = parseInt(entry.split(":")[1], 10);
      return sum + (isNaN(duration) ? 0 : duration);
    }, 0);

    return Math.round(totalTime / entries.length);
  } catch {
    return 0;
  }
}

import { PrismaClient } from "@prisma/client";
import { getRedisClient } from "../config/redis";
import { getEmailQueue } from "../queues/emailQueue";
import { getAverageResponseTime } from "../middleware/responseTime";

const prisma = new PrismaClient();

export async function getHealthStatus(): Promise<{
  status: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: string; latency?: number };
    redis: { status: string; latency?: number };
    queue: {
      status: string;
      pending: number;
      failed: number;
    };
    averageResponseTime: number;
  };
}> {
  const checks = {
    database: { status: "unhealthy", latency: 0 },
    redis: { status: "unhealthy", latency: 0 },
    queue: { status: "unhealthy", pending: 0, failed: 0 },
    averageResponseTime: 0,
  };

  // Check database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "healthy", latency: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: "unhealthy", latency: 0 };
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    const redis = getRedisClient();
    await redis.ping();
    checks.redis = { status: "healthy", latency: Date.now() - redisStart };
  } catch (err) {
    checks.redis = { status: "unhealthy", latency: 0 };
  }

  // Check Queue
  try {
    const queue = getEmailQueue();
    const pending = await queue.getWaitingCount();
    const failed = await queue.getFailedCount();
    checks.queue = { status: "healthy", pending, failed };
  } catch (err) {
    checks.queue = { status: "unhealthy", pending: 0, failed: 0 };
  }

  // Average response time
  checks.averageResponseTime = await getAverageResponseTime();

  const overallStatus =
    checks.database.status === "healthy" && checks.redis.status === "healthy"
      ? "healthy"
      : "degraded";

  return {
    status: overallStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks,
  };
}

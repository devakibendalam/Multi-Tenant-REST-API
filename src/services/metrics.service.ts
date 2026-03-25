import { PrismaClient } from "@prisma/client";
import { getRedisClient } from "../config/redis";

const prisma = new PrismaClient();

export async function getMetrics(tenantId: string): Promise<{
  tenantId: string;
  billingPeriod: string;
  totalRequests: number;
  requestsByEndpoint: Record<string, number>;
  rateLimitBreaches: Record<string, number>;
  emailDelivery: {
    total: number;
    sent: number;
    failed: number;
    deadLetter: number;
    successRate: number;
  };
}> {
  const redis = getRedisClient();
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;

  // Get request metrics from Redis
  const requestMetrics = await redis.hgetall(
    `metrics:requests:${tenantId}:${periodKey}`
  );
  const totalRequests = parseInt(requestMetrics.total || "0", 10);

  const requestsByEndpoint: Record<string, number> = {};
  for (const [key, value] of Object.entries(requestMetrics)) {
    if (key !== "total") {
      requestsByEndpoint[key] = parseInt(value, 10);
    }
  }

  // Get rate limit breach counts
  const breachMetrics = await redis.hgetall(
    `metrics:rate_limit_breaches:${tenantId}:${periodKey}`
  );
  const rateLimitBreaches: Record<string, number> = {};
  for (const [key, value] of Object.entries(breachMetrics)) {
    rateLimitBreaches[key] = parseInt(value, 10);
  }

  // Get email delivery stats — TENANT ISOLATION at query level
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const emailStats = await prisma.emailLog.groupBy({
    by: ["status"],
    where: {
      tenantId,
      createdAt: { gte: startOfMonth },
    },
    _count: true,
  });

  const emailDelivery = {
    total: 0,
    sent: 0,
    failed: 0,
    deadLetter: 0,
    successRate: 0,
  };

  for (const stat of emailStats) {
    const count = stat._count;
    emailDelivery.total += count;
    switch (stat.status) {
      case "SENT":
        emailDelivery.sent = count;
        break;
      case "FAILED":
        emailDelivery.failed = count;
        break;
      case "DEAD_LETTER":
        emailDelivery.deadLetter = count;
        break;
    }
  }

  emailDelivery.successRate =
    emailDelivery.total > 0
      ? Math.round((emailDelivery.sent / emailDelivery.total) * 100)
      : 100;

  return {
    tenantId,
    billingPeriod: periodKey,
    totalRequests,
    requestsByEndpoint,
    rateLimitBreaches,
    emailDelivery,
  };
}

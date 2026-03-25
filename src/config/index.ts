import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  database: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/velozity?schema=public",
  },

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },

  internalApiKey:
    process.env.INTERNAL_API_KEY || "internal-secret-key-change-in-production",

  smtp: {
    host: process.env.SMTP_HOST || "smtp.ethereal.email",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },

  rateLimit: {
    global: parseInt(process.env.RATE_LIMIT_GLOBAL || "1000", 10),
    burst: parseInt(process.env.RATE_LIMIT_BURST || "50", 10),
    burstWindow: parseInt(process.env.RATE_LIMIT_BURST_WINDOW || "5", 10),
  },

  apiKeyRotationGraceMinutes: parseInt(
    process.env.API_KEY_ROTATION_GRACE_MINUTES || "15",
    10
  ),

  endpointRateLimits: {
    "POST:/api/tenants/*/users": 20,
    "POST:/api/api-keys/rotate": 5,
    "GET:/api/audit": 100,
    "GET:/api/users": 200,
    "POST:/api/tenants": 10,
  } as Record<string, number>,
};

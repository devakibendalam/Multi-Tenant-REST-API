import Redis from "ioredis";

describe("Sliding Window Rate Limiter", () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    });
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up test keys
    const keys = await redis.keys("test:ratelimit:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  async function slidingWindowCheck(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; count: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const uniqueId = `${now}:${Math.random().toString(36).substring(2)}`;

    // Remove expired entries
    await redis.zremrangebyscore(key, "-inf", windowStart);

    // Count current entries
    const count = await redis.zcard(key);

    if (count >= limit) {
      return { allowed: false, count };
    }

    // Add new entry
    await redis.zadd(key, now, uniqueId);
    await redis.pexpire(key, windowMs);

    return { allowed: true, count: count + 1 };
  }

  test("should allow requests under the limit", async () => {
    const key = "test:ratelimit:under_limit";
    const limit = 5;
    const windowMs = 10000;

    for (let i = 0; i < limit; i++) {
      const result = await slidingWindowCheck(key, limit, windowMs);
      expect(result.allowed).toBe(true);
    }
  });

  test("should reject requests over the limit", async () => {
    const key = "test:ratelimit:over_limit";
    const limit = 3;
    const windowMs = 10000;

    // Fill up the limit
    for (let i = 0; i < limit; i++) {
      const result = await slidingWindowCheck(key, limit, windowMs);
      expect(result.allowed).toBe(true);
    }

    // Next request should be rejected
    const rejected = await slidingWindowCheck(key, limit, windowMs);
    expect(rejected.allowed).toBe(false);
  });

  test("sliding window should allow requests after old ones expire", async () => {
    const key = "test:ratelimit:sliding";
    const limit = 2;
    const windowMs = 1000; // 1 second window

    // Fill up limit
    for (let i = 0; i < limit; i++) {
      await slidingWindowCheck(key, limit, windowMs);
    }

    // Should be rejected
    let result = await slidingWindowCheck(key, limit, windowMs);
    expect(result.allowed).toBe(false);

    // Wait for window to pass
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Should be allowed again (sliding window expired)
    result = await slidingWindowCheck(key, limit, windowMs);
    expect(result.allowed).toBe(true);
  });

  test("sliding window boundary test: requests at edges", async () => {
    const key = "test:ratelimit:boundary";
    const limit = 3;
    const windowMs = 2000; // 2 second window

    // Add 2 requests
    await slidingWindowCheck(key, limit, windowMs);
    await slidingWindowCheck(key, limit, windowMs);

    // Wait 1 second (still within window)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Add 1 more — should be allowed (3 total, at limit)
    const result = await slidingWindowCheck(key, limit, windowMs);
    expect(result.allowed).toBe(true);

    // Next should be rejected (4th in window)
    const rejected = await slidingWindowCheck(key, limit, windowMs);
    expect(rejected.allowed).toBe(false);

    // Wait another 1.1 seconds — first 2 requests should expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Should be allowed again
    const afterExpiry = await slidingWindowCheck(key, limit, windowMs);
    expect(afterExpiry.allowed).toBe(true);
  });
});

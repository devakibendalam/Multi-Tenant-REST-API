# Velozity Multi-Tenant REST API

A production-grade backend API for a B2B SaaS platform with multi-tenant isolation, intelligent rate limiting, queue-based transactional email engine, and tamper-evident audit trail.

---

## 🛠 Tech Stack

- **Runtime:** Node.js 22 with TypeScript
- **Framework:** Express 5 — chosen for its mature ecosystem, extensive middleware support, and familiarity. Express 5 includes native Promise support for route handlers, removing the need for wrapper utilities. While Fastify offers better raw performance, Express's ecosystem maturity and the project's emphasis on correctness over throughput made it the pragmatic choice.
- **Database:** PostgreSQL 18 with Prisma ORM — Prisma provides type-safe queries with transparent SQL generation (unlike Sequelize), making tenant isolation verifiable at the query level.
- **Cache/Queue:** Redis 8 — used for both sliding window rate limiting (sorted sets) and BullMQ job queues.
- **Email Queue:** BullMQ — chosen over Bull because it's the actively maintained successor with better TypeScript support, built-in dead letter queue handling, and more flexible worker architecture. It's Redis-backed and supports exponential backoff retries natively.
- **Email:** Nodemailer with Ethereal (test SMTP)

---

## 🚀 Local Setup (Docker)

### 📌 Prerequisites

- Docker Desktop installed and running
- Git

### ⚙️ Steps

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd velozity-multi-tenant-api

# 2. Start all services
docker compose up --build
```

---

## 🌱 Auto Seeding

The application automatically seeds data on startup.

### ✅ What this does:

- 2 tenants (Acme Corporation, Globex Industries)
- 3 users per tenant (1 Owner + 2 Members)
- 1 API key per tenant
- 12 audit log entries per tenant with valid chain hashes

### 🔐 IMPORTANT

Copy the API keys from the output (shown only once):

```text
🔑 API Keys (SAVE THESE - shown only once):
   Acme Corporation: vgs_a1b2c3d4e5f6g7h8i9j0k1l2m3n4
   Globex Industries: vgs_x9y8z7w6v5u4t3s2r1q0p9o8n7m6
```

👉 Save these keys — required for API testing.

---

## ▶️ Run the Application

```
http://localhost:3000
```

Expected response:

```json
{
  "message": "Velozity Multi-Tenant API",
  "version": "1.0.0"
}
```

---

## 🧪 Run Tests

```bash
docker compose exec api npm test
```

---

## 🧠 Architecture Decisions

### 1️⃣ Multi-Tenant Isolation

- API Key Resolution: Every request resolves the tenant from the API key hash — the tenant ID is never accepted from user input.
- Query-Level Isolation: Every Prisma query includes tenantId in the where clause. This is enforced at the database query level.
- API Key Hashing: Keys are hashed with Argon2id before storage. The raw key is returned only once.
- Key Rotation: Old keys get a 15-minute grace period before expiration.

---

### 2️⃣ Sliding Window Rate Limiter

Unlike a fixed window counter, the sliding window algorithm evaluates requests over a rolling time window.

#### ⚙️ Implementation (Redis Sorted Sets)

- Each request stored with timestamp as score
- `ZREMRANGEBYSCORE` → remove expired entries
- `ZCARD` → count current requests
- `ZADD` → add new request if under limit
- Reject with **429** if limit exceeded
- `PEXPIRE` → automatic cleanup

#### 🎯 Why it matters

Prevents **2x burst issue** at window boundaries.

#### 📊 Rate Limit Tiers

- **Burst:** 50 req / 5 sec per API key
- **Endpoint:** Configurable per route
- **Global:** 1000 req / min per tenant

---

### 3️⃣ Audit Chain Mechanism

Blockchain-like tamper-evident logging:

- Each entry hash includes previous hash
- Chain breaks if any entry is modified
- `/audit/verify` recomputes and validates chain

#### 🔒 Hash Formula

```text
SHA256(action + resourceType + resourceId + previousValue + newValue + userId + apiKeyPrefix + ipAddress + tenantId + sequence + previousHash)
```

#### 🛑 Database-Level Protection

```sql
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only. UPDATE and DELETE operations are not permitted.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

---

### 4️⃣ Queue-Based Email Engine

- All emails processed via BullMQ
- 3 retries with exponential backoff (2s, 4s, 8s)
- Dead letter queue for failed jobs
- Delivery logs stored in DB
- Ethereal SMTP for testing (preview URLs logged)

---

### 5️⃣ Cursor-Based Pagination

- Base64 encoded cursor
- No OFFSET scanning
- Consistent results during inserts
- Better performance on large datasets

---

## ⚠️ Known Limitations

- ❗ No Redis Lua (small race condition in multi-instance setups)
- ❗ Audit triggers must be manually applied
- ❗ Emails are not реально delivered (Ethereal only)
- ❗ No JWT/session authentication
- ❗ Single database (row-level isolation only)

---

## 📬 API Documentation

👉 [https://documenter.getpostman.com/view/27348979/2sBXiknB5B](https://documenter.getpostman.com/view/27348979/2sBXiknB5B)

---

## 🧪 Testing with Postman

1. Import `postman/velozity-api.postman_collection.json`
2. Set variables:

   - `tenant1ApiKey` → from seed output
   - `internalApiKey` → `internal-secret-key-change-in-production`

3. Use headers:

   - `X-API-Key`
   - `X-Internal-Key`

---

## 📡 API Endpoints Overview

| Method | Path                 | Auth     | Description   |
| ------ | -------------------- | -------- | ------------- |
| POST   | /api/tenants         | None     | Create tenant |
| GET    | /api/tenants/me      | API Key  | Get tenant    |
| GET    | /api/users           | API Key  | List users    |
| GET    | /api/users/:userId   | API Key  | Get user      |
| POST   | /api/users           | Owner    | Create user   |
| PATCH  | /api/users/:userId   | Owner    | Update user   |
| DELETE | /api/users/:userId   | Owner    | Delete user   |
| GET    | /api/api-keys        | API Key  | List keys     |
| POST   | /api/api-keys/rotate | Owner    | Rotate key    |
| GET    | /api/audit           | API Key  | Audit logs    |
| GET    | /api/audit/verify    | API Key  | Verify chain  |
| GET    | /api/health          | Internal | Health check  |
| GET    | /api/metrics         | Internal | Metrics       |

---

## ✍️ Explanation

Hardest Problem: Implementing the sliding window rate limiter with correct behavior at window boundaries was the most challenging aspect. A naive fixed-window approach fails at boundaries — allowing 2x burst. Using Redis sorted sets with ZREMRANGEBYSCORE and ZADD within a pipeline ensures correct sliding behavior while maintaining performance. Testing confirmed that requests at window edges are properly counted across the rolling window.

Tenant Isolation at Query Level: Every database query passes through service functions that require tenantId as a mandatory parameter — it's never optional. The tenant ID is extracted from the API key during authentication (not from user input), and every Prisma where clause includes tenantId. This means even if middleware were bypassed, the queries themselves would still be scoped. For example, getUserById(tenantId, userId) uses findFirst({ where: { id: userId, tenantId } }) — a user from another tenant simply doesn't exist in the query's perspective.

What I'd Do Differently: I would implement the sliding window rate limiter using a Redis Lua script for full atomicity. Currently, the ZREMRANGEBYSCORE, ZCARD, and ZADD operations are sent sequentially, creating a small race condition window in multi-instance deployments. A Lua script would execute all operations atomically on the Redis server.

```

```

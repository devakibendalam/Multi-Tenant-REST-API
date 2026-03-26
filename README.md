# Velozity Multi-Tenant REST API
A production-grade backend API for a B2B SaaS platform with multi-tenant isolation, intelligent rate limiting, queue-based transactional email engine, and tamper-evident audit trail.

---
## 🛠 Tech Stack
- **Runtime:** Node.js 24 with TypeScript
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
git clone https://github.com/devakibendalam/Multi-Tenant-REST-API
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
```text
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
- **API Key Resolution:** Every request resolves the tenant from the API key hash — the tenant ID is never accepted from user input.
- **Query-Level Isolation:** Every Prisma query includes tenantId in the where clause. This is not just middleware filtering — it's enforced at the database query level. A user from Tenant A structurally cannot query Tenant B's data because tenantId is a mandatory parameter in every service function.
- **API Key Hashing:** Keys are hashed with Argon2id before storage. The raw key is returned only once at creation.
- **Key Rotation:** Old keys get a 15-minute grace period (expiration timestamp), after which they're rejected during authentication.
---
### 2️⃣ Sliding Window Rate Limiter
Unlike a fixed window counter that resets at interval boundaries (allowing 2x burst at boundaries), the sliding window algorithm considers requests over a rolling time period.
#### ⚙️ Implementation using Redis Sorted Sets:
- Each request is stored as a member in a sorted set with the timestamp as the score.
- On each new request:
  - `ZREMRANGEBYSCORE` removes all entries older than now - windowMs
  - `ZCARD` counts remaining entries
  - If count < limit: `ZADD` the new request
  - If count >= limit: reject with **429**
- `PEXPIRE` sets TTL for automatic cleanup.
- **Why it matters:** At a window boundary in a fixed window system, a client could make `limit` requests at the end of window 1 and `limit` more at the start of window 2 — effectively 2x the limit in a short burst. The sliding window prevents this by always looking at the rolling window.
#### 📊 Rate Limit Tiers
- **Burst:** (50 req/5s per API key) — stops rapid-fire abuse
- **Endpoint:** (configurable per route/minute per tenant) — prevents abuse of expensive endpoints
- **Global:** (1000 req/minute per tenant) — overall tenant cap
---
### 3️⃣ Audit Chain Mechanism
The audit trail implements a blockchain-like hash chain:
- 🔒 **Hash Formula:** Each entry's hash is computed from ```SHA256(action + resourceType + resourceId + previousValue + newValue + userId + apiKeyPrefix + ipAddress + tenantId + sequence + previousHash)```
- Each entry stores its own chainHash and the previousHash (hash of the preceding entry)
- The first entry in a tenant's chain has previousHash = null
- The /audit/verify endpoint recomputes the entire chain from scratch and compares each computed hash against the stored hash
- If any entry was modified, deleted, or inserted, the chain breaks at that point
- **Database-level append-only:** The audit_logs table should have a PostgreSQL trigger that prevents UPDATE and DELETE operations. This can be added via a raw SQL migration:
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
All emails are sent asynchronously through BullMQ:
- Email jobs have 3 retry attempts with exponential backoff (2s, 4s, 8s)
- Failed jobs after max retries are marked as DEAD_LETTER in the database
- Every email attempt is logged with: recipient, template, status, attempt count, timestamps
- Templates are defined as structured objects separate from the sending logic
- Uses Ethereal for test SMTP — preview URLs are logged to console
---
### 5️⃣ Cursor-Based Pagination
Audit logs use cursor-based pagination instead of offset:
- Cursor is a base64-encoded JSON containing the last item's ID
- This provides consistent results even as new entries are added
- More efficient for large datasets (no OFFSET scan)
---
## ⚠️ Known Limitations
- ❗ Single-instance rate limiting: The sliding window implementation works correctly but doesn't use Lua scripts for full atomicity — in a multi-instance deployment, there's a small race condition window. Production would need a Redis Lua script.
- ❗ No real email delivery: Uses Ethereal test SMTP — emails are captured but not actually delivered.
- ❗ No JWT/session auth: Authentication is purely API-key-based as specified. A production system would typically add JWT for web sessions.
- ❗ Single database: All tenants share one database with row-level isolation. For very large deployments, database-per-tenant would be more scalable.
---
## 📬 API Documentation
👉 [https://documenter.getpostman.com/view/27348979/2sBXiknB5B](https://documenter.getpostman.com/view/27348979/2sBXiknB5B)

---
## 🧪 Testing with Postman
1. Import `postman/velozity-api.postman_collection.json`
2. Set variables:
   - `tenant1ApiKey` → from seed output
   - `tenant2ApiKey` → from seed output
   - `internalApiKey` → `internal-secret-key-change-in-production`
3. Use headers:
   - `X-API-Key`
   - `X-Internal-Key`
---
## 📡 API Endpoints Overview
| Method     | Path                 | Auth     | Description   |
|------------| -------------------- | -------- | ------------- |
| **POST**   | /api/tenants         | None     | Create tenant |
| **GET**    | /api/tenants/me      | API Key  | Get tenant    |
| **GET**    | /api/users           | API Key  | List users    |
| **GET**    | /api/users/:userId   | API Key  | Get user      |
| **POST**   | /api/users           | Owner    | Create user   |
| **PATCH**  | /api/users/:userId   | Owner    | Update user   |
| **DELETE** | /api/users/:userId   | Owner    | Delete user   |
| **GET**    | /api/api-keys        | API Key  | List keys     |
| **POST**   | /api/api-keys/rotate | Owner    | Rotate key    |
| **GET**    | /api/audit           | API Key  | Audit logs    |
| **GET**    | /api/audit/verify    | API Key  | Verify chain  |
| **GET**    | /api/health          | Internal | Health check  |
| **GET**    | /api/metrics         | Internal | Metrics       |
---
## ✍️ Explanation
Hardest Problem: Implementing the sliding window rate limiter with correct behavior at window boundaries was the most challenging aspect. A naive fixed-window approach fails at boundaries — allowing 2x burst. Using Redis sorted sets with ZREMRANGEBYSCORE and ZADD within a pipeline ensures correct sliding behavior while maintaining performance. Testing confirmed that requests at window edges are properly counted across the rolling window.

Tenant Isolation at Query Level: Every database query passes through service functions that require tenantId as a mandatory parameter — it's never optional. The tenant ID is extracted from the API key during authentication (not from user input), and every Prisma where clause includes tenantId. This means even if middleware were bypassed, the queries themselves would still be scoped. For example, getUserById(tenantId, userId) uses findFirst({ where: { id: userId, tenantId } }) — a user from another tenant simply doesn't exist in the query's perspective.

What I'd Do Differently: I would implement the sliding window rate limiter using a Redis Lua script for full atomicity. Currently, the ZREMRANGEBYSCORE, ZCARD, and ZADD operations are sent sequentially, creating a small race condition window in multi-instance deployments. A Lua script would execute all operations atomically on the Redis server.
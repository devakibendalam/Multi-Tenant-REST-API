# Velozity Multi-Tenant REST API

A production-grade backend API for a B2B SaaS platform with multi-tenant isolation, intelligent rate limiting, queue-based transactional email engine, and tamper-evident audit trail.

## Tech Stack

- **Runtime:** Node.js 22 with TypeScript
- **Framework:** Express 5 — chosen for its mature ecosystem, extensive middleware support, and familiarity. Express 5 includes native Promise support for route handlers, removing the need for wrapper utilities. While Fastify offers better raw performance, Express's ecosystem maturity and the project's emphasis on correctness over throughput made it the pragmatic choice.
- **Database:** PostgreSQL 17 with Prisma ORM — Prisma provides type-safe queries with transparent SQL generation (unlike Sequelize), making tenant isolation verifiable at the query level.
- **Cache/Queue:** Redis 7 — used for both sliding window rate limiting (sorted sets) and BullMQ job queues.
- **Email Queue:** BullMQ — chosen over Bull because it's the actively maintained successor with better TypeScript support, built-in dead letter queue handling, and more flexible worker architecture. It's Redis-backed and supports exponential backoff retries natively.
- **Email:** Nodemailer with Ethereal (test SMTP)

## Local Setup (Docker)

### Prerequisites

- Docker Desktop installed and running
- Git

### Steps

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd velozity-multi-tenant-api

# 2. Start all services
docker compose up --build

# 3. In a new terminal, run database migrations
docker compose exec api npx prisma migrate dev --name init

# 4. Run the seed script
docker compose exec api npm run seed

# 5. The API is now running at http://localhost:3000
```

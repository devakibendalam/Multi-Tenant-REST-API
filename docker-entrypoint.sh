#!/bin/sh
set -e

echo "🔄 Waiting for PostgreSQL to be ready..."
until npx prisma db push --skip-generate 2>/dev/null; do
  echo "⏳ PostgreSQL is unavailable - sleeping 2s..."
  sleep 2
done
echo "✅ PostgreSQL is ready!"

echo "🔄 Waiting for Redis to be ready..."
until node -e "
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || 'redis', port: 6379, maxRetriesPerRequest: 1, lazyConnect: true });
redis.connect().then(() => { redis.disconnect(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  echo "⏳ Redis is unavailable - sleeping 2s..."
  sleep 2
done
echo "✅ Redis is ready!"

echo "🔄 Running database migrations..."

# Try migrate deploy first (for fresh or properly migrated databases)
if npx prisma migrate deploy 2>/dev/null; then
  echo "✅ Migrations applied successfully!"
else
  echo "⚠️  migrate deploy failed, trying db push instead..."
  # Fallback: use db push (syncs schema without migration history)
  npx prisma db push --accept-data-loss
  echo "✅ Database schema synced with db push!"
fi

echo "🔄 Checking if seed is needed..."
npm run seed
echo "✅ Seed check complete!"

echo "🚀 Starting application..."
exec "$@"
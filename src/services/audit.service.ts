import { PrismaClient } from "@prisma/client";
import { computeChainHash } from "../utils/auditChain";
import { AuditLogEntry, PaginatedResult, TenantContext } from "../types";
import { decodeCursor, encodeCursor } from "../utils/pagination";

const prisma = new PrismaClient();

export async function createAuditLog(
  tenantContext: TenantContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  previousValue: unknown,
  newValue: unknown,
  ipAddress: string
): Promise<void> {
  const { tenantId, userId, apiKeyPrefix } = tenantContext;

  // Get the last audit log entry for this tenant to build the chain
  const lastEntry = await prisma.auditLog.findFirst({
    where: { tenantId },
    orderBy: { sequence: "desc" },
  });

  const sequence = (lastEntry?.sequence || 0) + 1;
  const previousHash = lastEntry?.chainHash || null;

  const entry: AuditLogEntry = {
    action,
    resourceType,
    resourceId,
    previousValue,
    newValue,
    userId,
    apiKeyPrefix,
    ipAddress,
    tenantId,
    sequence,
  };

  const chainHash = computeChainHash(entry, previousHash);

  // TENANT ISOLATION AT QUERY LEVEL: tenantId is always included
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      resourceType,
      resourceId,
      previousValue: previousValue as any,
      newValue: newValue as any,
      apiKeyPrefix,
      ipAddress,
      chainHash,
      previousHash,
      sequence,
    },
  });
}

export async function getAuditLogs(
  tenantId: string,
  filters: {
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
    cursor?: string;
    limit?: number;
  }
): Promise<PaginatedResult<unknown>> {
  const limit = Math.min(filters.limit || 20, 100);
  const cursorData = decodeCursor(filters.cursor);

  // Build WHERE clause — ALWAYS includes tenantId for tenant isolation
  const where: Record<string, unknown> = { tenantId };

  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.resourceType) where.resourceType = filters.resourceType;

  if (filters.startDate || filters.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filters.startDate) createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) createdAt.lte = new Date(filters.endDate);
    where.createdAt = createdAt;
  }

  // Cursor-based pagination
  const queryArgs: Record<string, unknown> = {
    where,
    take: limit + 1, // Fetch one extra to determine if there are more
    orderBy: { sequence: "desc" as const },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  };

  if (cursorData) {
    queryArgs.cursor = { id: cursorData.id };
    queryArgs.skip = 1; // Skip the cursor item itself
  }

  const logs = await prisma.auditLog.findMany(queryArgs as any);

  const hasMore = logs.length > limit;
  const data = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor =
    hasMore && data.length > 0 ? encodeCursor(data[data.length - 1].id) : null;

  return {
    data,
    pagination: {
      nextCursor,
      hasMore,
      limit,
    },
  };
}

export async function verifyAuditChain(tenantId: string): Promise<{
  intact: boolean;
  totalEntries: number;
  brokenAtEntryId?: string;
  brokenAtSequence?: number;
  message: string;
}> {
  // Fetch ALL audit log entries for this tenant in sequence order
  // TENANT ISOLATION: filtered by tenantId
  const logs = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { sequence: "asc" },
  });

  if (logs.length === 0) {
    return {
      intact: true,
      totalEntries: 0,
      message: "No audit log entries found for this tenant.",
    };
  }

  let previousHash: string | null = null;

  for (const log of logs) {
    const entry: AuditLogEntry = {
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      previousValue: log.previousValue,
      newValue: log.newValue,
      userId: log.userId,
      apiKeyPrefix: log.apiKeyPrefix,
      ipAddress: log.ipAddress,
      tenantId: log.tenantId,
      sequence: log.sequence,
    };

    const expectedHash = computeChainHash(entry, previousHash);

    if (log.chainHash !== expectedHash) {
      return {
        intact: false,
        totalEntries: logs.length,
        brokenAtEntryId: log.id,
        brokenAtSequence: log.sequence,
        message: `Audit chain integrity broken at entry ID ${log.id} (sequence ${log.sequence}). The hash does not match the expected value, indicating possible tampering.`,
      };
    }

    // Also verify the previous hash pointer
    if (log.previousHash !== previousHash) {
      return {
        intact: false,
        totalEntries: logs.length,
        brokenAtEntryId: log.id,
        brokenAtSequence: log.sequence,
        message: `Previous hash pointer mismatch at entry ID ${log.id} (sequence ${log.sequence}).`,
      };
    }

    previousHash = log.chainHash;
  }

  return {
    intact: true,
    totalEntries: logs.length,
    message: `Audit chain is intact. All ${logs.length} entries verified successfully.`,
  };
}

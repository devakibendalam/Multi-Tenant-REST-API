import * as crypto from "crypto";
import { AuditLogEntry } from "../types";

export function computeChainHash(
  entry: AuditLogEntry,
  previousHash: string | null
): string {
  const payload = JSON.stringify({
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    previousValue: entry.previousValue,
    newValue: entry.newValue,
    userId: entry.userId,
    apiKeyPrefix: entry.apiKeyPrefix,
    ipAddress: entry.ipAddress,
    tenantId: entry.tenantId,
    sequence: entry.sequence,
    previousHash: previousHash,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

import { Request } from "express";

export interface TenantContext {
  tenantId: string;
  userId: string;
  userRole: "OWNER" | "MEMBER";
  apiKeyPrefix: string;
  apiKeyId: string;
}

export interface AuthenticatedRequest extends Request {
  tenantContext?: TenantContext;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface RateLimitInfo {
  tier: string;
  limit: number;
  current: number;
  remaining: number;
  resetInSeconds: number;
}

export interface PaginationCursor {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface AuditLogEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  userId?: string | null;
  apiKeyPrefix?: string | null;
  ipAddress?: string | null;
  tenantId: string;
  sequence: number;
}

export interface EmailJobData {
  tenantId: string;
  recipient: string;
  templateName: string;
  templateData: Record<string, string>;
  emailLogId: string;
}

export interface EndpointRateLimitConfig {
  [routePattern: string]: number;
}

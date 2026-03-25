export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message: string = "Authentication required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message: string = "Insufficient permissions"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message: string = "Resource not found"): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, "CONFLICT", message, details);
  }

  static rateLimited(message: string, details: unknown): ApiError {
    return new ApiError(429, "RATE_LIMITED", message, details);
  }

  static internal(message: string = "Internal server error"): ApiError {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }

  toJSON(): { error: { code: string; message: string; details?: unknown } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        // ...(this.details && { details: this.details }),
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

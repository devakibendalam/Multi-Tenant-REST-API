import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { ApiError } from "../utils/apiError";

export function authorize(...roles: Array<"OWNER" | "MEMBER">) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.tenantContext) {
      next(ApiError.unauthorized());
      return;
    }

    if (!roles.includes(req.tenantContext.userRole)) {
      next(
        ApiError.forbidden(
          `This action requires one of the following roles: ${roles.join(", ")}`
        )
      );
      return;
    }

    next();
  };
}

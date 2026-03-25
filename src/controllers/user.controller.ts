import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "../services/user.service";
import { createAuditLog } from "../services/audit.service";
import { enqueueEmail } from "../queues/emailQueue";
import { ApiError } from "../utils/apiError";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handleGetUsers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();
    // TENANT ISOLATION: getUsers always uses tenantContext.tenantId
    const users = await getUsers(req.tenantContext.tenantId);
    res.json({ data: users });
  } catch (error) {
    next(error);
  }
}

export async function handleGetUserById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();
    const userId = req.params.userId as string;
    const user = await getUserById(req.tenantContext.tenantId, userId);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function handleCreateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();

    const { email, name, role } = req.body;

    if (!email || !name) {
      throw ApiError.badRequest("email and name are required");
    }

    const user = await createUser(req.tenantContext.tenantId, {
      email,
      name,
      role,
    });

    // Audit log
    await createAuditLog(
      req.tenantContext,
      "USER_CREATED",
      "user",
      (user as any).id,
      null,
      user,
      req.ip || "unknown"
    );

    // Queue invitation email
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantContext.tenantId },
    });

    await enqueueEmail(req.tenantContext.tenantId, email, "USER_INVITED", {
      userName: name,
      tenantName: tenant?.name || "Unknown",
      role: role || "MEMBER",
      email,
    });

    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();

    const userId = req.params.userId as string;
    const { name, role } = req.body;

    const { user, previousValue } = await updateUser(
      req.tenantContext.tenantId,
      userId,
      { name, role }
    );

    // Audit log
    await createAuditLog(
      req.tenantContext,
      "USER_UPDATED",
      "user",
      userId,
      previousValue,
      user,
      req.ip || "unknown"
    );

    res.json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function handleDeleteUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantContext) throw ApiError.unauthorized();

    const userId = req.params.userId as string;

    const { deletedUser } = await deleteUser(
      req.tenantContext.tenantId,
      userId
    );

    // Audit log
    await createAuditLog(
      req.tenantContext,
      "USER_DELETED",
      "user",
      userId,
      deletedUser,
      null,
      req.ip || "unknown"
    );

    res.json({ data: { message: "User deleted successfully" } });
  } catch (error) {
    next(error);
  }
}

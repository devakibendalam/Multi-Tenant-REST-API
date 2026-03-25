import { PrismaClient, Role } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { ApiError } from "../utils/apiError";

const prisma = new PrismaClient();

export async function getUsers(tenantId: string): Promise<unknown[]> {
  // TENANT ISOLATION: Always filter by tenantId at query level
  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getUserById(
  tenantId: string,
  userId: string
): Promise<unknown> {
  // TENANT ISOLATION: Both tenantId AND userId in the where clause
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  return user;
}

export async function createUser(
  tenantId: string,
  data: { email: string; name: string; role?: Role }
): Promise<unknown> {
  // Check for duplicate email within this tenant
  const existing = await prisma.user.findFirst({
    where: { email: data.email, tenantId },
  });

  if (existing) {
    throw ApiError.conflict(
      "A user with this email already exists in this tenant"
    );
  }

  return prisma.user.create({
    data: {
      id: uuidv4(),
      email: data.email,
      name: data.name,
      role: data.role || "MEMBER",
      tenantId, // TENANT ISOLATION: Always set tenantId from context
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });
}

export async function updateUser(
  tenantId: string,
  userId: string,
  data: { name?: string; role?: Role }
): Promise<{ user: unknown; previousValue: unknown }> {
  // TENANT ISOLATION: Verify user belongs to this tenant
  const existingUser = await prisma.user.findFirst({
    where: { id: userId, tenantId },
  });

  if (!existingUser) {
    throw ApiError.notFound("User not found");
  }

  const previousValue = {
    name: existingUser.name,
    role: existingUser.role,
  };

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.role && { role: data.role }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { user: updatedUser, previousValue };
}

export async function deleteUser(
  tenantId: string,
  userId: string
): Promise<{ deletedUser: unknown }> {
  // TENANT ISOLATION: Verify user belongs to this tenant
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
  });

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  if (user.role === "OWNER") {
    // Check if this is the last owner
    const ownerCount = await prisma.user.count({
      where: { tenantId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      throw ApiError.badRequest("Cannot delete the last owner of a tenant");
    }
  }

  const deletedUser = await prisma.user.delete({
    where: { id: userId },
  });

  return { deletedUser };
}

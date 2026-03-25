import { PrismaClient, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

const prisma = new PrismaClient();

function computeChainHash(
  entry: {
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
  },
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

async function shouldSeed(): Promise<boolean> {
  // Check if any tenants exist
  const tenantCount = await prisma.tenant.count();

  if (tenantCount > 0) {
    console.log(
      `⏭️  Database already has ${tenantCount} tenant(s). Skipping seed.`
    );
    return false;
  }

  return true;
}

async function main(): Promise<void> {
  console.log("🔍 Checking if seeding is needed...");

  // Check if we should seed
  const needsSeed = await shouldSeed();

  if (!needsSeed) {
    console.log("✅ Database is already populated. Nothing to do.");
    return;
  }

  console.log("🌱 Database is empty. Starting seed...");

  // Create 2 tenants
  const tenant1 = await prisma.tenant.create({
    data: { id: uuidv4(), name: "Acme Corporation" },
  });

  const tenant2 = await prisma.tenant.create({
    data: { id: uuidv4(), name: "Globex Industries" },
  });

  console.log(`✅ Created tenants: ${tenant1.name}, ${tenant2.name}`);

  // Create users for each tenant (1 Owner + 2 Members)
  const tenants = [tenant1, tenant2];
  const allUsers: Array<{
    id: string;
    email: string;
    role: Role;
    tenantId: string;
  }> = [];

  for (const tenant of tenants) {
    const prefix = tenant.name === "Acme Corporation" ? "acme" : "globex";

    const owner = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `owner@${prefix}.com`,
        name: `${prefix} Owner`,
        role: Role.OWNER,
        tenantId: tenant.id,
      },
    });

    const member1 = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `member1@${prefix}.com`,
        name: `${prefix} Member 1`,
        role: Role.MEMBER,
        tenantId: tenant.id,
      },
    });

    const member2 = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `member2@${prefix}.com`,
        name: `${prefix} Member 2`,
        role: Role.MEMBER,
        tenantId: tenant.id,
      },
    });

    allUsers.push(
      {
        id: owner.id,
        email: owner.email,
        role: owner.role,
        tenantId: tenant.id,
      },
      {
        id: member1.id,
        email: member1.email,
        role: member1.role,
        tenantId: tenant.id,
      },
      {
        id: member2.id,
        email: member2.email,
        role: member2.role,
        tenantId: tenant.id,
      }
    );

    console.log(
      `✅ Created users for ${tenant.name}: ${owner.email}, ${member1.email}, ${member2.email}`
    );
  }

  // Create API keys for each tenant
  const apiKeysCreated: Array<{
    tenantName: string;
    rawKey: string;
    prefix: string;
  }> = [];

  for (const tenant of tenants) {
    const rawKey = `vgs_${uuidv4().replace(/-/g, "")}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = await argon2.hash(rawKey);

    const owner = allUsers.find(
      (u) => u.tenantId === tenant.id && u.role === Role.OWNER
    );

    await prisma.apiKey.create({
      data: {
        id: uuidv4(),
        keyHash,
        keyPrefix,
        tenantId: tenant.id,
        userId: owner!.id,
        isActive: true,
      },
    });

    apiKeysCreated.push({
      tenantName: tenant.name,
      rawKey,
      prefix: keyPrefix,
    });

    console.log(`✅ Created API key for ${tenant.name}: ${rawKey}`);
  }

  // Create pre-existing audit log with valid chain (minimum 10 entries per tenant)
  const auditActions = [
    {
      action: "TENANT_CREATED",
      resourceType: "tenant",
      description: "Tenant was created",
    },
    {
      action: "USER_CREATED",
      resourceType: "user",
      description: "Owner user was created",
    },
    {
      action: "USER_CREATED",
      resourceType: "user",
      description: "Member 1 was created",
    },
    {
      action: "USER_CREATED",
      resourceType: "user",
      description: "Member 2 was created",
    },
    {
      action: "API_KEY_CREATED",
      resourceType: "api_key",
      description: "API key was generated",
    },
    {
      action: "USER_UPDATED",
      resourceType: "user",
      description: "User profile updated",
    },
    {
      action: "USER_UPDATED",
      resourceType: "user",
      description: "User role changed",
    },
    {
      action: "SETTINGS_UPDATED",
      resourceType: "tenant",
      description: "Tenant settings updated",
    },
    {
      action: "USER_INVITED",
      resourceType: "user",
      description: "New user invited",
    },
    {
      action: "API_KEY_ROTATED",
      resourceType: "api_key",
      description: "API key was rotated",
    },
    {
      action: "USER_UPDATED",
      resourceType: "user",
      description: "Member permissions changed",
    },
    {
      action: "SETTINGS_UPDATED",
      resourceType: "tenant",
      description: "Rate limit config updated",
    },
  ];

  for (const tenant of tenants) {
    const tenantUsers = allUsers.filter((u) => u.tenantId === tenant.id);
    const owner = tenantUsers.find((u) => u.role === Role.OWNER)!;
    let previousHash: string | null = null;

    for (let i = 0; i < auditActions.length; i++) {
      const auditAction = auditActions[i];
      const sequence = i + 1;

      const entry = {
        action: auditAction.action,
        resourceType: auditAction.resourceType,
        resourceId: i < 4 ? tenantUsers[Math.min(i, 2)].id : tenant.id,
        previousValue: i > 4 ? { field: "old_value" } : null,
        newValue: { field: "new_value", description: auditAction.description },
        userId: owner.id,
        apiKeyPrefix:
          apiKeysCreated.find((k) => k.tenantName === tenant.name)?.prefix ||
          null,
        ipAddress: "127.0.0.1",
        tenantId: tenant.id,
        sequence,
      };

      const chainHash = computeChainHash(entry, previousHash);

      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          previousValue: entry.previousValue as any,
          newValue: entry.newValue as any,
          apiKeyPrefix: entry.apiKeyPrefix,
          ipAddress: entry.ipAddress,
          chainHash,
          previousHash,
          sequence,
        },
      });

      previousHash = chainHash;
    }

    console.log(
      `✅ Created ${auditActions.length} audit log entries for ${tenant.name}`
    );
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📋 SEED COMPLETED SUCCESSFULLY");
  console.log("=".repeat(60));
  console.log("\n🔑 API Keys (SAVE THESE - shown only once):");
  console.log("-".repeat(60));
  for (const key of apiKeysCreated) {
    console.log(`   ${key.tenantName}:`);
    console.log(`   ${key.rawKey}`);
    console.log("");
  }
  console.log("-".repeat(60));
  console.log("⚠️  Use these API keys in the X-API-Key header for requests");
  console.log("=".repeat(60) + "\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

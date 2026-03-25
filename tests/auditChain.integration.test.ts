import * as crypto from "crypto";

interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId: string | null;
  previousValue: unknown;
  newValue: unknown;
  userId: string | null;
  apiKeyPrefix: string | null;
  ipAddress: string | null;
  tenantId: string;
  sequence: number;
}

function computeChainHash(
  entry: AuditEntry,
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

describe("Audit Chain Hash Verification", () => {
  const tenantId = "test-tenant-123";

  function createTestChain(
    count: number
  ): Array<AuditEntry & { chainHash: string; previousHash: string | null }> {
    const chain: Array<
      AuditEntry & { chainHash: string; previousHash: string | null }
    > = [];
    let previousHash: string | null = null;

    for (let i = 1; i <= count; i++) {
      const entry: AuditEntry = {
        action: `ACTION_${i}`,
        resourceType: "test",
        resourceId: `resource-${i}`,
        previousValue: i > 1 ? { value: `old-${i}` } : null,
        newValue: { value: `new-${i}` },
        userId: "user-1",
        apiKeyPrefix: "vgs_test1234",
        ipAddress: "127.0.0.1",
        tenantId,
        sequence: i,
      };

      const chainHash = computeChainHash(entry, previousHash);

      chain.push({
        ...entry,
        chainHash,
        previousHash,
      });

      previousHash = chainHash;
    }

    return chain;
  }

  test("valid chain should verify successfully", () => {
    const chain = createTestChain(10);
    let previousHash: string | null = null;

    for (const entry of chain) {
      const expectedHash = computeChainHash(entry, previousHash);
      expect(entry.chainHash).toBe(expectedHash);
      expect(entry.previousHash).toBe(previousHash);
      previousHash = entry.chainHash;
    }
  });

  test("tampering with an entry should break the chain", () => {
    const chain = createTestChain(10);

    // Tamper with the 5th entry
    chain[4].newValue = { value: "TAMPERED!" };

    // Verify chain — should detect the tamper at entry 5
    let previousHash: string | null = null;
    let tamperDetected = false;
    let tamperIndex = -1;

    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      const expectedHash = computeChainHash(entry, previousHash);

      if (entry.chainHash !== expectedHash) {
        tamperDetected = true;
        tamperIndex = i;
        break;
      }

      previousHash = entry.chainHash;
    }

    expect(tamperDetected).toBe(true);
    expect(tamperIndex).toBe(4); // 0-indexed, so entry 5 is at index 4
  });

  test("inserting an entry should break subsequent chain", () => {
    const chain = createTestChain(5);

    // Insert a new entry between 2 and 3
    const insertedEntry: AuditEntry & {
      chainHash: string;
      previousHash: string | null;
    } = {
      action: "INSERTED_ACTION",
      resourceType: "test",
      resourceId: "inserted",
      previousValue: null,
      newValue: { value: "inserted" },
      userId: "user-1",
      apiKeyPrefix: "vgs_test1234",
      ipAddress: "127.0.0.1",
      tenantId,
      sequence: 3, // Same sequence as existing entry 3
      chainHash: "fake-hash",
      previousHash: chain[1].chainHash,
    };

    chain.splice(2, 0, insertedEntry);

    // Verify — should detect break
    let previousHash: string | null = null;
    let tamperDetected = false;

    for (const entry of chain) {
      const expectedHash = computeChainHash(entry, previousHash);
      if (entry.chainHash !== expectedHash) {
        tamperDetected = true;
        break;
      }
      previousHash = entry.chainHash;
    }

    expect(tamperDetected).toBe(true);
  });

  test("deleting an entry should break the chain", () => {
    const chain = createTestChain(5);

    // Remove entry 3
    chain.splice(2, 1);

    // Verify — should detect break because entry 4 references entry 3's hash
    let previousHash: string | null = null;
    let tamperDetected = false;

    for (const entry of chain) {
      const expectedHash = computeChainHash(entry, previousHash);
      if (entry.chainHash !== expectedHash) {
        tamperDetected = true;
        break;
      }
      previousHash = entry.chainHash;
    }

    expect(tamperDetected).toBe(true);
  });

  test("each hash is unique even with similar content", () => {
    const chain = createTestChain(3);
    const hashes = chain.map((e) => e.chainHash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(hashes.length);
  });

  test("empty chain should be considered valid", () => {
    const chain: Array<
      AuditEntry & { chainHash: string; previousHash: string | null }
    > = [];
    let intact = true;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let _previousHash: string | null = null;
    for (const entry of chain) {
      const expectedHash = computeChainHash(entry, _previousHash);
      if (entry.chainHash !== expectedHash) {
        intact = false;
        break;
      }
      _previousHash = entry.chainHash;
    }

    expect(intact).toBe(true);
  });
});

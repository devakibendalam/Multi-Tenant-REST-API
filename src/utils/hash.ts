import * as argon2 from "argon2";

export async function hashApiKey(rawKey: string): Promise<string> {
  return argon2.hash(rawKey, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyApiKey(
  rawKey: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, rawKey);
  } catch {
    return false;
  }
}

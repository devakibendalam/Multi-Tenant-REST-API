export function decodeCursor(
  cursor: string | undefined
): { id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id })).toString("base64");
}

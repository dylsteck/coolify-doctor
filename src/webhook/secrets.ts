import { timingSafeEqual } from "node:crypto";

export function secretsEqual(expected: string, got: string): boolean {
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

import { describe, expect, it } from "vitest";
import { secretsEqual } from "./secrets.js";

describe("secretsEqual", () => {
  it("matches equal strings", () => {
    expect(secretsEqual("sec", "sec")).toBe(true);
  });

  it("rejects mismatch", () => {
    expect(secretsEqual("good", "bad")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    expect(secretsEqual("short", "much longer secret")).toBe(false);
  });
});

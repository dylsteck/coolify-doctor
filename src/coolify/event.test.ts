import { describe, expect, it } from "vitest";
import type { CoolifyEvent } from "./event.js";

describe("CoolifyEvent JSON", () => {
  it("unmarshals snake_case fields", () => {
    const raw =
      '{"success":true,"message":"m","event":"deployment_success","application_name":"app","project":"p"}';
    const e = JSON.parse(raw) as CoolifyEvent;
    expect(e.event).toBe("deployment_success");
    expect(e.application_name).toBe("app");
    expect(e.project).toBe("p");
  });
});

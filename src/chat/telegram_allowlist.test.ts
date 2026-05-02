import { describe, expect, it } from "vitest";
import { isAllowedTelegramChat, telegramRawChatId } from "./telegram_allowlist.js";

describe("telegram allowlist", () => {
  it("strips telegram: prefix", () => {
    expect(telegramRawChatId("telegram:12345")).toBe("12345");
  });

  it("matches bare id to prefixed channelId", () => {
    expect(isAllowedTelegramChat("telegram:999", "999")).toBe(true);
  });

  it("rejects wrong chat", () => {
    expect(isAllowedTelegramChat("telegram:1", "2")).toBe(false);
  });
});

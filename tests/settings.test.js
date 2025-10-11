import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, maskToken } from "../src/shared/settings.js";

describe("shared settings helpers", () => {
  it("provides default values for new WeChat credential fields", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      wechatAppId: "",
      wechatAppSecret: "",
      wechatAccessToken: "",
      wechatTokenExpiresAt: null,
      wechatUpdatedAt: null,
    });
  });

  it("normalizes undefined input to include credential fields", () => {
    const normalized = normalizeSettings(undefined);
    expect(normalized.wechatAppId).toBe("");
    expect(normalized.wechatAppSecret).toBe("");
    expect(normalized.wechatAccessToken).toBe("");
    expect(normalized.wechatTokenExpiresAt).toBeNull();
    expect(normalized.wechatUpdatedAt).toBeNull();
  });

  it("masks stored access token when available", () => {
    expect(maskToken("")).toBe("尚未配置");
    expect(maskToken("testtoken123")).toBe("••••••n123");
  });
});

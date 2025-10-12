import { describe, it, expect, vi, beforeEach } from "vitest";

import { TranslatorService } from "./translator.js";

const SAMPLE_ITEMS = [
  { kind: "heading", level: 2, text: "Section One" },
  { kind: "paragraph", text: "Hello world" },
  { kind: "paragraph", text: "This is a second sentence." },
];

function createResponse({ text, blockReason, finishReason } = {}) {
  const candidates = [
    {
      finishReason,
      content: text
        ? { role: "model", parts: [{ text }] }
        : {},
    },
  ];
  if (blockReason) {
    return { candidates, promptFeedback: { blockReason } };
  }
  return { candidates };
}

describe("TranslatorService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("throws when API key missing", async () => {
    const translator = new TranslatorService();
    expect(() => translator.updateSettings({ apiKey: "" })).not.toThrow();
    await expect(
      translator.translateContent(SAMPLE_ITEMS, { sourceUrl: "https://example.com" }),
    ).rejects.toThrow(/尚未配置/);
  });

  it("calls Gemini once for modest input", async () => {
    const translator = new TranslatorService();
    translator.updateSettings({ apiKey: "fake", model: "gemini-test" });

    const items = [
      {
        kind: "paragraph",
        text: "段落一。".repeat(20),
      },
      {
        kind: "paragraph",
        text: "段落二。".repeat(20),
      },
    ];

    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createResponse({ text: "测试输出" })),
    });

    const result = await translator.translateContent(items);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.text).toContain("测试输出");
    expect(Array.isArray(result.conversation)).toBe(true);
    expect(result.conversation).toHaveLength(2);
    expect(result.conversation[1].parts[0].text).toContain("测试输出");
  });

  it("throws with block reason", async () => {
    const translator = new TranslatorService();
    translator.updateSettings({ apiKey: "fake", model: "gemini-test" });

    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createResponse({ blockReason: "SAFETY" })),
    });

    await expect(translator.translateContent(SAMPLE_ITEMS)).rejects.toThrow(/拒绝翻译/);
  });

  it("throws when no text and finishReason provided", async () => {
    const translator = new TranslatorService();
    translator.updateSettings({ apiKey: "fake", model: "gemini-test" });

    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createResponse({ finishReason: "MAX_TOKENS" })),
    });

    await expect(translator.translateContent(SAMPLE_ITEMS)).rejects.toThrow(/MAX_TOKENS/);
  });

  it("generates title via Gemini", async () => {
    const translator = new TranslatorService();
    translator.updateSettings({ apiKey: "fake", model: "gemini-test" });

    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createResponse({ text: "中文标题" })),
    });

    const result = await translator.generateTitle(SAMPLE_ITEMS, {
      sourceUrl: "https://example.com",
      fallbackTitle: "Fallback",
      translatedText: "翻译后的正文",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("中文标题");
  });

  it("falls back to备用标题 when没有内容", async () => {
    const translator = new TranslatorService();
    translator.updateSettings({ apiKey: "fake", model: "gemini-test" });

    const result = await translator.generateTitle([], {
      fallbackTitle: "默认标题",
      translatedText: "",
    });
    expect(result.text).toBe("默认标题");
    expect(fetch).not.toHaveBeenCalled();
  });
});

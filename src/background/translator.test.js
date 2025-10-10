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
        ? { parts: [{ text }] }
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
});

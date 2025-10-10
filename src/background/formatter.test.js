import { describe, it, expect } from "vitest";

import { FormatterService } from "./formatter.js";

const SAMPLE_ITEMS = [
  { kind: "heading", level: 2, text: "News" },
  { kind: "paragraph", text: "段落一" },
  { kind: "image", sequence: 1, url: "https://example.com/a.jpg", caption: "图片说明" },
  { kind: "paragraph", text: "段落二" },
];

const SAMPLE_IMAGES = [
  { sequence: 1, url: "https://example.com/a.jpg", alt: "示例图片", caption: "图注" },
];

describe("FormatterService", () => {
  it("renders headings, paragraphs, and images to HTML/Markdown", () => {
    const formatter = new FormatterService();
    const translationText = "## News\n\n段落一\n\n{{[Image 1]}}\n\n段落二";

    const { html, markdown } = formatter.format({
      translationText,
      items: SAMPLE_ITEMS,
      images: SAMPLE_IMAGES,
    });

    expect(html).toContain("<h2>News</h2>");
    expect(html).toContain("<p>段落一</p>");
    expect(html).toContain("<figure>");
    expect(markdown).toContain("![示例图片](https://example.com/a.jpg)");
    expect(markdown).toMatch(/段落二/);
  });

  it("handles missing placeholders gracefully", () => {
    const formatter = new FormatterService();
    const translationText = "段落一";

    const { html } = formatter.format({
      translationText,
      items: SAMPLE_ITEMS,
      images: SAMPLE_IMAGES,
    });

    expect(html).toContain("段落一");
  });
});

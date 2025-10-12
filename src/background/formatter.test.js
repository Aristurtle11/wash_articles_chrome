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
    const articleText = "## News\n\n段落一\n\n{{[Image 1]}}\n\n段落二";

    const { html, markdown } = formatter.format({
      articleText,
      items: SAMPLE_ITEMS,
      images: SAMPLE_IMAGES,
    });

    expect(html).toContain("<article style=");
    expect(html).toContain("<h2 style=");
    expect(html).toContain('<div style="margin:0 0 24px"><p style="margin:0');
    expect(html).toContain('<div style="margin:24px 0');
    expect(markdown).toBeNull();
  });

  it("handles missing placeholders gracefully", () => {
    const formatter = new FormatterService();
    const articleText = "段落一";

    const { html } = formatter.format({
      articleText,
      items: SAMPLE_ITEMS,
      images: SAMPLE_IMAGES,
    });

    expect(html).toContain("段落一");
  });
});

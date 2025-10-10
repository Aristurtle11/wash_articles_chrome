import { escapeHtml } from "../shared/text.js";

const IMAGE_PLACEHOLDER = /\{\{\[(?:Image)(?:\s+(\d+))?\]\}\}/i;

export class FormatterService {
  format({ translationText, items, images }) {
    const segments = Array.isArray(items) ? items : [];
    const imageList = Array.isArray(images) ? images : [];
    const blocks = parseBlocks(translationText || "");
    const html = renderHtml(blocks, segments, imageList);
    const markdown = renderMarkdown(blocks, segments, imageList);
    return {
      html,
      markdown,
      blocks,
      updatedAt: new Date().toISOString(),
    };
  }
}

function parseBlocks(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const blocks = [];
  let buffer = [];

  const flushParagraph = () => {
    if (!buffer.length) return;
    const paragraph = buffer.join(" ").trim();
    if (paragraph) {
      blocks.push({ kind: "paragraph", text: paragraph });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      const level = Math.min(Math.max(headingMatch[1].length, 2), 4);
      blocks.push({ kind: "heading", level, text: headingMatch[2].trim() });
      continue;
    }

    const imageMatch = IMAGE_PLACEHOLDER.exec(line);
    if (imageMatch) {
      flushParagraph();
      const sequence = imageMatch[1] ? Number.parseInt(imageMatch[1], 10) : null;
      blocks.push({ kind: "image", sequence });
      continue;
    }

    if (!line) {
      flushParagraph();
      continue;
    }

    buffer.push(line);
  }

  flushParagraph();
  return blocks;
}

function renderHtml(blocks, items, images) {
  if (!blocks.length) {
    return "<article><p>暂无排版结果</p></article>";
  }
  const htmlBlocks = blocks.map((block) => {
    if (block.kind === "heading") {
      const level = Math.min(Math.max(block.level || 2, 2), 4);
      return `<h${level}>${escapeHtml(block.text || "")}</h${level}>`;
    }
    if (block.kind === "paragraph") {
      return `<p>${escapeHtml(block.text || "")}</p>`;
    }
    if (block.kind === "image") {
      const image = findImage(block.sequence, items, images);
      if (!image) {
        return "";
      }
      const src = escapeHtml(image.dataUrl || image.url || "");
      const alt = escapeHtml(image.alt || "图像");
      const caption = escapeHtml(image.caption || "");
      const credit = escapeHtml(image.credit || "");
      const captionHtml = caption
        ? `<figcaption>${caption}${credit ? `<span class="credit">${credit}</span>` : ""}</figcaption>`
        : "";
      return `<figure><img src="${src}" alt="${alt}" />${captionHtml}</figure>`;
    }
    return "";
  });
  return `<article>\n${htmlBlocks.filter(Boolean).join("\n")}\n</article>`;
}

function renderMarkdown(blocks, items, images) {
  if (!blocks.length) {
    return "暂无排版结果";
  }
  const mdBlocks = blocks.map((block) => {
    if (block.kind === "heading") {
      const level = Math.min(Math.max(block.level || 2, 2), 4);
      const hashes = "#".repeat(level);
      return `${hashes} ${block.text || ""}`.trim();
    }
    if (block.kind === "paragraph") {
      return block.text || "";
    }
    if (block.kind === "image") {
      const image = findImage(block.sequence, items, images);
      if (!image) {
        return "";
      }
      const alt = image.alt || "图像";
      const src = image.url || image.dataUrl || "";
      const caption = image.caption ? `\n> ${image.caption}` : "";
      return `![${alt}](${src})${caption}`.trim();
    }
    return "";
  });
  return mdBlocks.filter(Boolean).join("\n\n");
}

function findImage(sequence, items, images) {
  const normalizedSequence = Number.isFinite(sequence) ? Number(sequence) : null;
  if (normalizedSequence) {
    const bySequence = images.find((img) => Number(img.sequence) === normalizedSequence);
    if (bySequence) {
      return bySequence;
    }
  }
  if (Array.isArray(items)) {
    const itemImage = items
      .filter((item) => item?.kind === "image")
      .find((item) => Number(item?.sequence) === normalizedSequence);
    if (itemImage) {
      const fallback = images.find((img) => img.url === itemImage.url);
      if (fallback) {
        return fallback;
      }
      return itemImage;
    }
  }
  return images[normalizedSequence ? normalizedSequence - 1 : 0] || null;
}

import { escapeHtml } from "../shared/text.js";

const IMAGE_PLACEHOLDER = /\{\{\[(?:Image)(?:\s+(\d+))?\]\}\}/i;

const ARTICLE_STYLE = [
  "margin:0 auto",
  "padding:0 0 40px",
  "max-width:680px",
  "font-family:'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif",
  "font-size:16px",
  "line-height:1.75",
  "color:#1f2937",
  "word-break:break-word",
].join(";");

const PARAGRAPH_STYLE = [
  "margin:0 0 24px",
  "text-align:justify",
  "text-justify:inter-ideograph",
  "font-size:16px",
  "line-height:1.78",
  "letter-spacing:0.02em",
  "color:#1f2937",
  "-webkit-hyphens:auto",
  "-ms-hyphens:auto",
  "hyphens:auto",
  "hyphenate-character:'-'",
  "overflow-wrap:break-word",
].join(";");

const HEADING_STYLES = {
  2: [
    "margin:32px 0 18px",
    "font-size:24px",
    "line-height:1.45",
    "font-weight:700",
    "color:#111827",
    "letter-spacing:0.01em",
  ].join(";"),
  3: [
    "margin:28px 0 16px",
    "font-size:20px",
    "line-height:1.5",
    "font-weight:600",
    "color:#1f2937",
    "letter-spacing:0.01em",
  ].join(";"),
  4: [
    "margin:24px 0 14px",
    "font-size:18px",
    "line-height:1.55",
    "font-weight:600",
    "color:#334155",
  ].join(";"),
};

const IMAGE_WRAPPER_STYLE = [
  "margin:24px 0",
  "text-align:center",
];

const IMAGE_STYLE = [
  "display:block",
  "max-width:100%",
  "border-radius:12px",
  "box-shadow:0 10px 28px rgba(15,23,42,0.15)",
  "margin:0 auto",
];

const SPONSOR_SPACER_STYLE = [
  "margin:24px 0",
  "line-height:1",
  "font-size:0",
  "content:' '",
].join(";");

const BUSINESS_WRAPPER_STYLE = [
  "margin:48px 0 0",
  "padding:32px 24px",
  "border-top:1px solid #e2e8f0",
  "background:#f9fafc",
  "border-radius:16px",
].join(";");

const BUSINESS_TEXT_STYLE = [
  "font-size:16px",
  "line-height:1.8",
  "color:#1f2937",
  "margin:16px 0",
  "text-align:left",
].join(";");

const BUSINESS_CENTER_TITLE_STYLE = [
  "font-size:16px",
  "line-height:1.8",
  "color:#1f2937",
  "margin:16px 0",
  "text-align:center",
  "font-weight:600",
].join(";");

const BUSINESS_IMAGE_STYLE = [
  "display:block",
  "max-width:420px",
  "width:80%",
  "margin:0 auto",
  "border-radius:12px",
  "box-shadow:0 12px 30px rgba(15,23,42,0.18)",
].join(";");

export class FormatterService {
  format({ articleText, items, images }) {
    const segments = Array.isArray(items) ? items : [];
    const imageList = Array.isArray(images) ? images : [];
    const blocks = parseBlocks(articleText || "");
    const html = renderHtml(blocks, segments, imageList);
    return {
      html,
      markdown: null,
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
    return `<article style="${ARTICLE_STYLE}"><p style="${PARAGRAPH_STYLE}">暂无排版结果</p></article>`;
  }
  const htmlBlocks = blocks
    .map((block, index) => {
      if (block.kind === "heading") {
        const level = Math.min(Math.max(block.level || 2, 2), 4);
        const style = HEADING_STYLES[level] || HEADING_STYLES[3];
        return `<h${level} style="${style}">${escapeHtml(block.text || "")}</h${level}>`;
      }
      if (block.kind === "paragraph") {
        const text = enrichParagraphSpacing(block.text || "", index === 0);
        return `<p style="${PARAGRAPH_STYLE}">${escapeHtml(text)}</p>`;
      }
      if (block.kind === "image") {
        const image = findImage(block.sequence, items, images);
        if (!image) {
          return "";
        }
        if (image.isBusinessCard) {
          return "";
        }
        return renderImageBlock(image, block.sequence);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const businessCardSection = renderBusinessCardSection(images);

  return `<article style="${ARTICLE_STYLE}">\n${htmlBlocks}${businessCardSection}\n</article>`;
}

function enrichParagraphSpacing(text, isFirstParagraph) {
  if (!text) return "";
  if (isFirstParagraph) {
    return text;
  }
  return text.replace(/([。！？;?#])\s+/g, "$1 ");
}

function renderImageBlock(image, sequence) {
  const wrapperStyle = IMAGE_WRAPPER_STYLE.join(";");
  const imageStyle = IMAGE_STYLE.join(";");

  const resolvedSrc = escapeHtml(image.remoteUrl || image.url || image.dataUrl || "");
  const block = [
    `<div style="${wrapperStyle}">`,
    `<img src="${resolvedSrc}" style="${imageStyle}" />`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("");
  if (image.isSponsor) {
    return `${block}
<p style="${SPONSOR_SPACER_STYLE}">&nbsp;</p>`;
  }
  return block;
}

function renderBusinessCardSection(images) {
  const cardImage = Array.isArray(images)
    ? images.find((img) => img?.isBusinessCard)
    : null;
  if (!cardImage) {
    return "";
  }
  const imgSrc = escapeHtml(cardImage.remoteUrl || cardImage.url || cardImage.dataUrl || "");
  const imageBlock = `<div style="margin:40px 0 16px;text-align:center;"><img src="${imgSrc}" style="${BUSINESS_IMAGE_STYLE}" /></div>`;
  const title = `<p style="${BUSINESS_CENTER_TITLE_STYLE}">刘云飞 注册房地产经纪人</p>`;
  const credentialTitle = `<p style="${BUSINESS_CENTER_TITLE_STYLE}">【专业资质】</p>`;
  const credentialText = `<p style="${BUSINESS_TEXT_STYLE}">佛罗里达州MLS认证会员 • 美国房地产经纪人协会（NAR）认证会员 • 奥兰多迪士尼区房地产委员会（OCAR）核心成员</p>`;
  const advantageTitle = `<p style="${BUSINESS_CENTER_TITLE_STYLE}">【核心优势】</p>`;
  const advantages = [
    {
      label: "以数据驱动决策",
      text: "依托MLS实时交易数据库，提供深度市场趋势分析及智能化定价策略。",
    },
    {
      label: "以专业创造价值",
      text: "运用结构化谈判体系与风险管控模型，实现客户资产优化配置。",
    },
    {
      label: "以诚信铸就口碑",
      text: "恪守NAR职业道德准则，建立全透明化服务流程，全程法律文件备案可溯。",
    },
  ].map(
    ({ label, text }) =>
      `<p style="${BUSINESS_TEXT_STYLE}"><span style="text-decoration:underline;font-weight:600;">${escapeHtml(label)}</span>：${escapeHtml(text)}</p>`,
  ).join("\n");
  const scopeTitle = `<p style="${BUSINESS_CENTER_TITLE_STYLE}">【服务范畴】</p>`;
  const scopeText = `<p style="${BUSINESS_CENTER_TITLE_STYLE}">住宅买卖 | 土地投资 | 房屋租赁管理 | 商业地产买卖</p>`;
  const closing = `<p style="${BUSINESS_TEXT_STYLE};font-weight:700;">深耕一城，精研一事。我们以二十年在地沉淀，为每位客户构建定制化房地产解决方案。</p>`;

  return `\n<div style="${BUSINESS_WRAPPER_STYLE}">\n${imageBlock}\n${title}\n${credentialTitle}\n${credentialText}\n${advantageTitle}\n${advantages}\n${scopeTitle}\n${scopeText}\n${closing}\n</div>`;
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
      const src = image.remoteUrl || image.url || image.dataUrl || "";
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

const ARTICLE_STYLE = [
  'margin:0 auto',
  'padding:0 16px 48px',
  'max-width:680px',
  "font-family:'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif",
  'font-size:16px',
  'line-height:1.75',
  'color:#333333',
  'background-color:#ffffff',
  'word-break:break-word',
].join(';');

const TITLE_STYLE = [
  'font-size:26px',
  'color:#2c3e50',
  'line-height:1.3',
  'letter-spacing:0.6px',
  'text-align:center',
  'margin:0 0 1.2em',
  'font-weight:700',
].join(';');

const SUBTITLE_STYLE = [
  'font-size:18px',
  'color:#556070',
  'line-height:1.4',
  'text-align:center',
  'letter-spacing:0.4px',
  'margin:-0.4em 0 1.6em',
  'font-weight:500',
].join(';');

const PARAGRAPH_STYLE = [
  'font-size:16px',
  'color:#333333',
  'line-height:1.75',
  'letter-spacing:0.4px',
  'margin:0 0 1em',
  'text-align:justify',
  'text-justify:inter-ideograph',
].join(';');

const BLOCKQUOTE_STYLE = [
  'margin:1.6em 0',
  'padding:0.4em 1.2em',
  'border-left:4px solid #d1d5db',
  'background-color:#f8fafc',
  'color:#4b5563',
  'line-height:1.75',
  'font-style:italic',
].join(';');

const LIST_STYLE = [
  'font-size:16px',
  'color:#333333',
  'line-height:1.7',
  'letter-spacing:0.4px',
  'margin:0 0 1.2em 1.4em',
  'padding:0',
].join(';');

const LIST_ITEM_STYLE = 'margin:0.25em 0';

const IMAGE_WRAPPER_STYLE = [
  'margin:1.5em 0',
  'text-align:center',
].join(';');

const IMAGE_STYLE = [
  'max-width:100%',
  'border-radius:12px',
  'box-shadow:0 6px 18px rgba(31,41,55,0.18)',
  'display:inline-block',
].join(';');

const IMAGE_CAPTION_STYLE = [
  'margin:0.5em 0 0',
  'font-size:14px',
  'color:#6b7280',
  'line-height:1.6',
  'text-align:center',
].join(';');

const HEADING_STYLES = {
  2: [
    'font-size:22px',
    'color:#1f2937',
    'line-height:1.4',
    'margin:1.8em 0 0.8em',
    'letter-spacing:0.3px',
    'font-weight:600',
  ].join(';'),
  3: [
    'font-size:19px',
    'color:#1f2937',
    'line-height:1.5',
    'margin:1.6em 0 0.8em',
    'letter-spacing:0.2px',
    'font-weight:600',
  ].join(';'),
  4: [
    'font-size:17px',
    'color:#1f2937',
    'line-height:1.55',
    'margin:1.4em 0 0.6em',
    'letter-spacing:0.2px',
    'font-weight:600',
  ].join(';'),
};

const DEFAULT_PLACEHOLDER_PARAGRAPH = '内容正在整理中，请稍后重试。';
const DEFAULT_IMAGE_ALT = '文章插图';

/**
 * Formats the provided article payload into WeChat-compatible HTML markup.
 * @param {object} options
 * @param {string} options.title
 * @param {Array<FormattedElement>} options.elements
 * @param {string} [options.subtitle]
 * @returns {string}
 */
export function formatWechatArticle(options = {}) {
  const { title, elements, subtitle } = options ?? {};
  const safeTitle = escapeHtml(String(title ?? '').trim());
  const blocks = Array.isArray(elements) ? buildBody(elements) : [];
  const parts = [`<article style="${ARTICLE_STYLE}">`];

  if (safeTitle) {
    parts.push(`<h1 style="${TITLE_STYLE}">${safeTitle}</h1>`);
  }

  const subtitleText = typeof subtitle === 'string' ? subtitle.trim() : '';
  if (subtitleText) {
    parts.push(`<h2 style="${SUBTITLE_STYLE}">${escapeHtml(subtitleText)}</h2>`);
  }

  if (blocks.length > 0) {
    parts.push(blocks.join(''));
  } else {
    parts.push(renderParagraph(DEFAULT_PLACEHOLDER_PARAGRAPH));
  }

  parts.push('</article>');
  return parts.join('');
}

function buildBody(elements) {
  const rendered = [];
  let listBuffer = null;

  const flushList = () => {
    if (listBuffer && listBuffer.items.length > 0) {
      rendered.push(renderList(listBuffer.items, listBuffer.ordered));
    }
    listBuffer = null;
  };

  for (const element of elements) {
    if (!element || typeof element !== 'object') {
      continue;
    }

    if (element.type === 'image') {
      flushList();
      const imageMarkup = renderImage(element);
      if (imageMarkup) {
        rendered.push(imageMarkup);
      }
      continue;
    }

    const text = typeof element.content === 'string' ? element.content.trim() : '';
    if (!text) {
      flushList();
      continue;
    }

    const variant = extractVariant(element);

    if (variant === 'heading' || variant === 'subheading') {
      flushList();
      rendered.push(renderHeading(text, element.level, variant === 'subheading'));
      continue;
    }

    if (variant === 'quote' || variant === 'blockquote') {
      flushList();
      rendered.push(renderBlockquote(text));
      continue;
    }

    const explicitListType = extractListType(element);
    const itemMatch = explicitListType
      ? matchListItemWithType(text, explicitListType)
      : matchListItem(text);

    if (itemMatch) {
      if (!listBuffer) {
        listBuffer = { ordered: itemMatch.ordered, items: [] };
      } else if (listBuffer.ordered !== itemMatch.ordered) {
        flushList();
        listBuffer = { ordered: itemMatch.ordered, items: [] };
      }

      listBuffer.items.push(itemMatch.value);
      continue;
    }

    const multilineList = explicitListType
      ? parseExplicitList(text, explicitListType)
      : parseList(text);

    if (multilineList) {
      flushList();
      rendered.push(renderList(multilineList.items, multilineList.ordered));
      continue;
    }

    flushList();
    rendered.push(renderParagraph(text));
  }

  flushList();
  return rendered;
}

function extractVariant(element) {
  const raw = typeof element.variant === 'string' ? element.variant : element.role;
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

function extractListType(element) {
  const { listType } = element ?? {};
  if (typeof listType !== 'string') {
    return null;
  }

  const normalized = listType.trim().toLowerCase();
  if (normalized === 'ordered' || normalized === 'ol') {
    return 'ordered';
  }

  if (normalized === 'unordered' || normalized === 'ul') {
    return 'unordered';
  }

  return null;
}

function renderParagraph(text) {
  const inlineHtml = escapeLines(text);
  return `<p style="${PARAGRAPH_STYLE}">${inlineHtml}</p>`;
}

function renderBlockquote(text) {
  const inlineHtml = escapeLines(text);
  return `<blockquote style="${BLOCKQUOTE_STYLE}">${inlineHtml}</blockquote>`;
}

function renderHeading(text, level, isSecondary) {
  if (isSecondary) {
    const inline = escapeHtml(text);
    return `<h2 style="${SUBTITLE_STYLE}">${inline}</h2>`;
  }

  const numericLevel = Number.isInteger(level) ? Number(level) : 2;
  const boundedLevel = Math.min(Math.max(numericLevel, 2), 4);
  const style = HEADING_STYLES[boundedLevel] ?? HEADING_STYLES[2];
  return `<h${boundedLevel} style="${style}">${escapeHtml(text)}</h${boundedLevel}>`;
}

function renderList(items, ordered) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  const tag = ordered ? 'ol' : 'ul';
  const listItems = items
    .map((item) => `<li style="${LIST_ITEM_STYLE}">${escapeLines(item)}</li>`)
    .join('');

  return `<${tag} style="${LIST_STYLE}">${listItems}</${tag}>`;
}

function renderImage(element) {
  const src = sanitizeUrl(element.src ?? element.url ?? '');
  if (!src) {
    return '';
  }

  const alt = escapeHtml(
    typeof element.alt === 'string' && element.alt.trim() ? element.alt.trim() : DEFAULT_IMAGE_ALT,
  );
  const caption = typeof element.caption === 'string' ? element.caption.trim() : '';
  const imageTag = `<img src="${src}" alt="${alt}" style="${IMAGE_STYLE}" />`;
  const wrapperStart = `<p style="${IMAGE_WRAPPER_STYLE}">`;
  const wrapperEnd = '</p>';

  if (!caption) {
    return `${wrapperStart}${imageTag}${wrapperEnd}`;
  }

  const captionHtml = `<p style="${IMAGE_CAPTION_STYLE}">${escapeHtml(caption)}</p>`;
  return `${wrapperStart}${imageTag}${wrapperEnd}${captionHtml}`;
}

function matchListItem(text) {
  const trimmed = text.trim();
  const orderedMatch = /^(\d+)(?:[.)、])\s+(.*)$/.exec(trimmed);
  if (orderedMatch) {
    return {
      ordered: true,
      value: orderedMatch[2].trim(),
    };
  }

  const unorderedMatch = /^([-*•·‣▪●])\s+(.*)$/.exec(trimmed);
  if (unorderedMatch) {
    return {
      ordered: false,
      value: unorderedMatch[2].trim(),
    };
  }

  return null;
}

function matchListItemWithType(text, listType) {
  const match = matchListItem(text);
  if (!match) {
    return null;
  }

  return match.ordered === (listType === 'ordered') ? match : null;
}

function parseExplicitList(text, listType) {
  const lines = normalizeLines(text);
  if (lines.length < 2) {
    return null;
  }

  const ordered = listType === 'ordered';
  const items = lines
    .map((line) => {
      if (ordered) {
        return line.replace(/^\d+(?:[.)、])\s+/, '').trim();
      }
      return line.replace(/^[-*•·‣▪●]\s+/, '').trim();
    })
    .filter(Boolean);

  if (!items.length) {
    return null;
  }

  return { ordered, items };
}

function parseList(text) {
  const lines = normalizeLines(text);
  if (lines.length < 2) {
    return null;
  }

  const ordered = lines.every((line) => /^\d+(?:[.)、])\s+/.test(line));
  const unordered = lines.every((line) => /^[-*•·‣▪●]\s+/.test(line));

  if (!ordered && !unordered) {
    return null;
  }

  const items = lines
    .map((line) => {
      if (ordered) {
        return line.replace(/^\d+(?:[.)、])\s+/, '').trim();
      }
      return line.replace(/^[-*•·‣▪●]\s+/, '').trim();
    })
    .filter(Boolean);

  if (!items.length) {
    return null;
  }

  return { ordered, items };
}

function normalizeLines(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeLines(text) {
  return normalizeLinesKeepEmpty(text)
    .map((line) => escapeHtml(line))
    .join('<br />');
}

function normalizeLinesKeepEmpty(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim());
}

function sanitizeUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  if (!/^https?:\/\//.test(lower)) {
    return '';
  }

  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return '';
  }

  return trimmed;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @typedef {import('../parsers/realtorParser.js').ArticleElement & {
 *   variant?: string,
 *   role?: string,
 *   level?: number,
 *   listType?: 'ordered' | 'unordered' | 'ol' | 'ul',
 *   caption?: string,
 *   alt?: string,
 * }} FormattedElement
 */

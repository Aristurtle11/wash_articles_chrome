const NEXT_DATA_SELECTOR = 'script#__NEXT_DATA__';
const ARTICLE_NODE_SELECTOR = [
  '[data-testid="article-body"]',
  '[data-testid="article-body-container"]',
  '.article-body',
  '.article-body__content',
  'article',
  'main',
].join(', ');

const TEXT_NODE_SELECTOR = 'p, blockquote, li, h2, h3, h4';
const IMAGE_NODE_SELECTOR = 'figure, picture, img';
const TARGET_NODE_SELECTOR = `${TEXT_NODE_SELECTOR}, ${IMAGE_NODE_SELECTOR}`;

/**
 * Normalizes HTML snippets into plain text.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) {
    return '';
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html), 'text/html');
    return doc.body.textContent?.trim() ?? '';
  } catch {
    return String(html).replace(/<[^>]*>/g, '').trim();
  }
}

/**
 * Resolves a potentially relative URL against the provided base.
 * @param {string} possibleUrl
 * @param {string} baseUrl
 * @returns {string | null}
 */
function toAbsoluteUrl(possibleUrl, baseUrl) {
  if (!possibleUrl) {
    return null;
  }

  try {
    return new URL(possibleUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Extracts realtor.com article content into a normalized ArticleElement[] structure.
 */
export class RealtorParser {
  /**
   * @param {Document} doc
   * @param {string} baseUrl
   */
  constructor(doc = document, baseUrl = doc?.baseURI ?? (typeof location !== 'undefined' ? location.href : '')) {
    if (!doc) {
      throw new Error('A Document instance is required to initialise RealtorParser.');
    }

    this.document = doc;
    this.baseUrl = baseUrl;
  }

  /**
   * Extracts paragraphs and images from the current document.
   * @returns {Promise<ArticleElement[]>}
   */
  async extract() {
    const fromNextData = this.extractFromNextData();
    if (fromNextData.length > 0) {
      return this.ensureCoverImage(fromNextData);
    }

    const fromDom = this.extractFromDom();
    if (fromDom.length > 0) {
      return this.ensureCoverImage(fromDom);
    }

    throw new Error('Failed to extract content. The website structure may have changed.');
  }

  /**
   * Attempts to extract content from the Next.js payload embedded on the page.
   * @returns {ArticleElement[]}
   */
  extractFromNextData() {
    const script = this.document.querySelector(NEXT_DATA_SELECTOR);
    const payload = script?.textContent?.trim();
    if (!payload) {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return [];
    }

    const post = parsed?.props?.pageProps?.post;
    if (!post || typeof post !== 'object') {
      return [];
    }

    const heroElement = this.buildHeroElement(post);
    const blocks = Array.isArray(post.editorBlocks) ? post.editorBlocks : [];
    const items = [];
    const seenImages = new Set(heroElement?.src ? [heroElement.src] : undefined);

    if (heroElement) {
      items.push(heroElement);
    }

    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        continue;
      }

      const typeName = block.__typename;
      if (typeName === 'CoreParagraph') {
        const rendered = block.renderedHtml ?? block.attributes?.content ?? '';
        const text = stripHtml(rendered);
        if (text) {
          items.push({ type: 'paragraph', content: text });
        }
        continue;
      }

      if (typeName === 'CoreHeading') {
        const text = stripHtml(block.attributes?.content ?? '');
        if (text) {
          items.push({ type: 'paragraph', content: text });
        }
        continue;
      }

      if (typeName === 'CoreImage') {
        const attributes = block.attributes ?? {};
        const candidateSrc = attributes.src ?? attributes.url ?? '';
        const absoluteSrc = toAbsoluteUrl(candidateSrc, this.baseUrl);
        if (!absoluteSrc || seenImages.has(absoluteSrc)) {
          continue;
        }
        seenImages.add(absoluteSrc);
        items.push({ type: 'image', src: absoluteSrc });
      }
    }

    return items;
  }

  /**
   * Extracts content directly from the DOM when Next.js payload is unavailable.
   * @returns {ArticleElement[]}
   */
  extractFromDom() {
    /** @type {ArticleElement[]} */
    const items = [];
    const seenImages = new Set();

    const heroFromMeta = this.buildHeroFromMeta();
    if (heroFromMeta?.src) {
      seenImages.add(heroFromMeta.src);
      items.push(heroFromMeta);
    }

    const container =
      this.document.querySelector(ARTICLE_NODE_SELECTOR) ??
      this.document.body;

    if (!container) {
      return items;
    }

    const nodes = container.querySelectorAll('*');
    nodes.forEach((node) => {
      if (!node.matches(TARGET_NODE_SELECTOR)) {
        return;
      }

      if (node.matches(IMAGE_NODE_SELECTOR)) {
        const imageElement = this.buildImageElement(node);
        if (imageElement?.src && !seenImages.has(imageElement.src)) {
          seenImages.add(imageElement.src);
          items.push(imageElement);
        }
        return;
      }

      const textContent = this.collectTextContent(node);
      if (textContent) {
        items.push({ type: 'paragraph', content: textContent });
      }
    });

    return items;
  }

  /**
   * Builds a hero image element from the Next.js payload.
   * @param {Record<string, any>} post
   * @returns {ArticleElement | null}
   */
  buildHeroElement(post) {
    const hideFeatured = post?.hideFeaturedImageOnArticlePage;
    if (hideFeatured === true || hideFeatured?.hidefeaturedimage) {
      return null;
    }

    const featured = post?.featuredImage ?? post?.heroImage ?? post?.hero;
    if (!featured) {
      return null;
    }

    const heroNode = typeof featured === 'object' && featured !== null && featured.node ? featured.node : featured;
    if (!heroNode || typeof heroNode !== 'object') {
      return null;
    }

    const rawSrc =
      heroNode.sourceUrl ??
      heroNode.mediaItemUrl ??
      heroNode.url ??
      heroNode.src ??
      '';
    const absoluteSrc = toAbsoluteUrl(rawSrc, this.baseUrl);
    if (!absoluteSrc) {
      return null;
    }

    return { type: 'image', src: absoluteSrc };
  }

  /**
   * Attempts to find a hero image via standard meta tags.
   * @returns {ArticleElement | null}
   */
  buildHeroFromMeta() {
    const metaSelectors = [
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image:url"]',
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ];

    for (const selector of metaSelectors) {
      const meta = this.document.querySelector(selector);
      const content = meta?.getAttribute('content');
      const absolute = toAbsoluteUrl(content, this.baseUrl);
      if (absolute) {
        return { type: 'image', src: absolute };
      }
    }

    return null;
  }

  /**
   * Converts an element to an ArticleElement image representation.
   * @param {Element} node
   * @returns {ArticleElement | null}
   */
  buildImageElement(node) {
    let img = node;
    if (node.tagName.toLowerCase() !== 'img') {
      img = node.querySelector('img');
    }

    if (!img || typeof img.tagName !== 'string' || img.tagName.toLowerCase() !== 'img') {
      return null;
    }

    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute('data-src'),
      img.getAttribute('data-lazy-src'),
      img.getAttribute('data-original'),
      img.getAttribute('srcset')?.split(',')?.[0]?.trim()?.split(' ')?.[0],
    ];

    for (const candidate of candidates) {
      const absolute = toAbsoluteUrl(candidate, this.baseUrl);
      if (absolute) {
        return { type: 'image', src: absolute };
      }
    }

    return null;
  }

  /**
   * Collects readable text from a DOM node.
   * @param {Element} node
   * @returns {string}
   */
  collectTextContent(node) {
    if (node.tagName.toLowerCase() === 'li') {
      const text = node.textContent?.trim() ?? '';
      return text ? `- ${text}` : '';
    }

    return node.textContent?.trim() ?? '';
  }

  /**
   * Ensures the first image in the array is flagged as the cover.
   * @param {ArticleElement[]} items
   * @returns {ArticleElement[]}
   */
  ensureCoverImage(items) {
    let coverAssigned = false;

    return items.map((item) => {
      if (item.type !== 'image') {
        return item;
      }

      if (coverAssigned) {
        if ('isCover' in item) {
          const { isCover, ...rest } = item;
          return rest;
        }
        return item;
      }

      coverAssigned = true;
      return { ...item, isCover: true };
    });
  }
}

export default RealtorParser;

/**
 * @typedef {Object} ArticleElement
 * @property {'paragraph' | 'image'} type
 * @property {string} [content]
 * @property {string} [src]
 * @property {boolean} [isCover]
 */

// 网页正文与图片提取工具，基于 wash_articles 中的 Python 逻辑改写。
// 暂时依赖 DOM API 与 JSON 解析，无需额外库。

(() => {
  const heroSequence = 1;

  function extractArticleContent(root = document, baseUrl = location.href) {
    const nextScript = root.querySelector("script#__NEXT_DATA__");
    const nextPayload = parseNextData(nextScript?.textContent);

    if (nextPayload?.editorBlocks?.length) {
      return extractFromEditorBlocks(nextPayload.editorBlocks, baseUrl, nextPayload.hero);
    }

    return extractFromDom(root, baseUrl, nextPayload?.heroEntry ?? null);
  }

  function parseNextData(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      const pageProps = data?.props?.pageProps ?? {};
      const post = pageProps?.post ?? {};
      let heroCandidate = post?.featuredImage ?? {};
      const hideFeatured = post?.hideFeaturedImageOnArticlePage;
      if (typeof hideFeatured === "object" && hideFeatured !== null) {
        if (hideFeatured.hidefeaturedimage) {
          heroCandidate = null;
        }
      } else if (hideFeatured) {
        heroCandidate = null;
      }
      if (heroCandidate && typeof heroCandidate === "object") {
        heroCandidate = heroCandidate.node ?? heroCandidate;
      }
      const heroEntry = heroCandidate ? buildHeroEntry(heroCandidate, location.href) : null;
      const editorBlocks = Array.isArray(post?.editorBlocks) ? post.editorBlocks : [];
      return { editorBlocks, hero: heroCandidate, heroEntry };
    } catch (error) {
      console.debug("[WashArticles] 解析 __NEXT_DATA__ 失败：", error);
      return null;
    }
  }

  function extractFromEditorBlocks(blocks, baseUrl, heroNode) {
    const content = [];
    let paragraphCounter = 0;
    let imageCounter = 0;

    if (heroNode) {
      const heroEntry = buildHeroEntry(heroNode, baseUrl);
      if (heroEntry) {
        content.push(heroEntry);
        imageCounter = heroEntry.sequence ?? heroSequence;
      }
    }

    for (const block of blocks) {
      const typeName = block?.__typename;
      if (typeName === "CoreHeading") {
        const attributes = block?.attributes ?? {};
        const text = String(attributes.content ?? "").trim();
        if (!text) continue;
        const level = Number.parseInt(attributes.level ?? 2, 10) || 2;
        content.push({
          kind: "heading",
          level,
          text,
        });
      } else if (typeName === "CoreParagraph") {
        const rendered = String(block?.renderedHtml ?? "");
        const text = stripHtml(rendered);
        if (!text) continue;
        paragraphCounter += 1;
        content.push({
          kind: "paragraph",
          index: paragraphCounter,
          text,
        });
      } else if (typeName === "CoreImage") {
        const attributes = block?.attributes ?? {};
        const src = String(attributes.src ?? "").trim();
        if (!src) continue;
        const absolute = toAbsoluteUrl(src, baseUrl);
        if (!absolute) continue;
        imageCounter += 1;
        const caption = String(attributes.caption ?? "").trim();
        const alt = String(attributes.alt ?? "").trim();
        const credit = typeof block.imageCredit === "string" ? block.imageCredit.trim() : "";
        content.push({
          kind: "image",
          sequence: imageCounter,
          url: absolute,
          alt,
          caption,
          credit,
        });
      }
    }
    return content;
  }

  function extractFromDom(root, baseUrl, heroEntry) {
    const content = [];
    let paragraphCounter = 0;
    let imageCounter = 0;

    if (heroEntry?.url) {
      content.push({ ...heroEntry, sequence: heroSequence });
      imageCounter = heroSequence;
    }

    const nodes = root.querySelectorAll(".core-paragraph, h2, h3, h4, figure");
    nodes.forEach((node) => {
      const tag = node.tagName.toLowerCase();
      if (["h2", "h3", "h4"].includes(tag)) {
        const classes = Array.from(node.classList ?? []);
        const isArticleHeading = classes.some(
          (cls) =>
            cls === "htWOzS" ||
            cls.startsWith("core-heading") ||
            cls === "wp-block-heading",
        );
        if (!isArticleHeading) return;
        const headingText = node.textContent?.trim();
        if (!headingText) return;
        const level = Number.parseInt(tag.replace("h", ""), 10) || 2;
        content.push({
          kind: "heading",
          level,
          text: headingText,
        });
        return;
      }

      if (tag === "figure") {
        const img = node.querySelector("img");
        if (!img) return;
        const src = String(
          img.getAttribute("src") || img.getAttribute("data-src") || "",
        ).trim();
        if (!src) return;
        const absolute = toAbsoluteUrl(src, baseUrl);
        if (!absolute) return;
        imageCounter += 1;
        content.push({
          kind: "image",
          sequence: imageCounter,
          url: absolute,
          alt: String(img.getAttribute("alt") ?? "").trim(),
          caption: node.textContent?.trim() ?? "",
          credit: "",
        });
        return;
      }

      const text = node.textContent?.trim();
      if (text) {
        paragraphCounter += 1;
        content.push({
          kind: "paragraph",
          index: paragraphCounter,
          text,
        });
      }
    });

    return content;
  }

  function buildHeroEntry(heroData, baseUrl) {
    if (!heroData || typeof heroData !== "object") return null;
    const sourceUrl = String(heroData.sourceUrl ?? "").trim();
    if (!sourceUrl) return null;
    const absolute = toAbsoluteUrl(sourceUrl, baseUrl);
    if (!absolute) return null;
    const caption = stripHtml(String(heroData.caption ?? ""));
    return {
      kind: "image",
      sequence: heroSequence,
      url: absolute,
      alt: String(heroData.altText ?? "").trim(),
      caption,
      credit: String(heroData.imageCredit ?? "").trim(),
    };
  }

  function stripHtml(html) {
    if (!html) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return doc.body.textContent?.trim() ?? "";
  }

  function toAbsoluteUrl(src, baseUrl) {
    try {
      return new URL(src, baseUrl).toString();
    } catch (error) {
      console.debug("[WashArticles] URL 解析失败：", src, error);
      return "";
    }
  }

  const api = {
    extractArticleContent,
  };

  Object.defineProperty(window, "WashArticlesExtractor", {
    value: api,
    writable: false,
    configurable: false,
  });
})();

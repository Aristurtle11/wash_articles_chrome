// 内容脚本入口。
// 调用 WashArticlesExtractor，在页面加载后提取正文与图片信息。

(() => {
  const baseUrl = window.location.href;
  const capturedAt = new Date().toISOString();
  const title = document.title ? document.title.trim() : "";
  console.info("[WashArticles] 内容脚本已注入：", baseUrl);

  const extractor = window.WashArticlesExtractor;
  if (!extractor) {
    console.warn("[WashArticles] 提取器未注册");
    return;
  }

  try {
    const content = extractor.extractArticleContent(document, baseUrl);
    console.info("[WashArticles] 提取结果：", content);
    window.dispatchEvent(
      new CustomEvent("wash-articles:content-ready", {
        detail: { sourceUrl: baseUrl, items: content, capturedAt, title },
      }),
    );
    chrome.runtime.sendMessage(
      {
        type: "wash-articles/content",
        payload: { sourceUrl: baseUrl, items: content, capturedAt, title },
      },
      () => {
        if (chrome.runtime.lastError) {
          console.debug("[WashArticles] 内容同步消息未送达", chrome.runtime.lastError.message);
        }
      },
    );
  } catch (error) {
    console.error("[WashArticles] 提取失败：", error);
  }
})();

// 内容脚本入口。
// 调用 WashArticlesExtractor，在页面加载后提取正文与图片信息。

(() => {
  const baseUrl = window.location.href;
  const allowedPrefixes = [
    "https://www.realtor.com/news/",
    "https://www.realtor.com/advice/",
  ];
  if (!allowedPrefixes.some((prefix) => baseUrl.startsWith(prefix))) {
    console.info("[WashArticles] 当前页面不在支持范围内，跳过处理", baseUrl);
    return;
  }

  console.info("[WashArticles] 内容脚本已注入：", baseUrl);

  const extractor = window.WashArticlesExtractor;
  if (!extractor) {
    console.warn("[WashArticles] 提取器未注册");
    return;
  }

  async function runExtraction() {
    const capturedAt = new Date().toISOString();
    const title = document.title ? document.title.trim() : "";
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
      return { ok: true, sourceUrl: baseUrl, capturedAt, title };
    } catch (error) {
      console.error("[WashArticles] 提取失败：", error);
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  async function captureImageDataUrl(url) {
    if (!url || typeof url !== "string") {
      throw new Error("缺少图片地址");
    }
    const mimeType = inferMimeType(url);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width || 1;
          const height = img.naturalHeight || img.height || 1;
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("无法创建绘图上下文"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          let dataUrl;
          try {
            dataUrl = canvas.toDataURL(mimeType);
          } catch (error) {
            dataUrl = canvas.toDataURL();
          }
          const sizeBytes = estimateDataUrlSize(dataUrl);
          resolve({
            dataUrl,
            mimeType: dataUrl.split(";")[0].split(":")[1] || mimeType,
            sizeBytes,
            width,
            height,
          });
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = url;
    });
  }

  function inferMimeType(url) {
    if (typeof url !== "string") return "image/png";
    if (url.match(/\.(jpe?g)(\?|#|$)/i)) return "image/jpeg";
    if (url.match(/\.png(\?|#|$)/i)) return "image/png";
    if (url.match(/\.webp(\?|#|$)/i)) return "image/webp";
    if (url.match(/\.gif(\?|#|$)/i)) return "image/gif";
    return "image/png";
  }

  function estimateDataUrlSize(dataUrl) {
    if (typeof dataUrl !== "string") return 0;
    const base64 = dataUrl.split(",")[1] || "";
    if (!base64) return 0;
    const padding = (base64.match(/=+$/) || [""])[0].length;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "wash-articles/run-extraction") {
      runExtraction()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: error?.message ?? String(error) }));
      return true;
    }
    if (message.type === "wash-articles/capture-image") {
      captureImageDataUrl(message.payload?.url)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) =>
          sendResponse({ ok: false, error: error?.message ?? String(error) }),
        );
      return true;
    }
    return undefined;
  });
})();

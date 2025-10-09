const sourceUrlEl = document.getElementById("source-url");
const summaryListEl = document.getElementById("summary-list");
const summaryEmptyEl = document.getElementById("summary-empty");
const imagesGridEl = document.getElementById("images-grid");
const imagesEmptyEl = document.getElementById("images-empty");

let lastSourceUrl = null;

function renderSummary(items) {
  summaryListEl.innerHTML = "";
  if (!items || !items.length) {
    summaryEmptyEl.style.display = "block";
    return;
  }
  summaryEmptyEl.style.display = "none";
  const counts = items.reduce(
    (acc, item) => {
      if (!item || typeof item !== "object") return acc;
      if (item.kind === "paragraph") acc.paragraphs += 1;
      else if (item.kind === "image") acc.images += 1;
      else if (item.kind === "heading") acc.headings += 1;
      return acc;
    },
    { paragraphs: 0, images: 0, headings: 0 },
  );
  const fragments = [
    `段落：${counts.paragraphs}`,
    `小标题：${counts.headings}`,
    `图片：${counts.images}`,
  ];
  fragments.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    summaryListEl.appendChild(li);
  });
}

function renderImages(images) {
  imagesGridEl.innerHTML = "";
  if (!images || !images.length) {
    imagesEmptyEl.style.display = "block";
    return;
  }
  imagesEmptyEl.style.display = "none";
  images.slice(0, 8).forEach((img) => {
    if (img?.error) {
      const div = document.createElement("div");
      div.className = "image-error";
      div.textContent = "加载失败";
      div.title = `${img.url}\n${img.error}`;
      imagesGridEl.appendChild(div);
      return;
    }
    const thumb = document.createElement("img");
    thumb.src = img?.dataUrl || img?.url || "";
    thumb.alt = img?.alt || "";
    thumb.title = img?.url || "";
    imagesGridEl.appendChild(thumb);
  });
}

function requestImages(sourceUrl) {
  if (!sourceUrl) return;
  chrome.runtime.sendMessage(
    { type: "wash-articles/get-images", payload: { sourceUrl } },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn("获取图片缓存失败：", chrome.runtime.lastError.message);
        return;
      }
      renderImages(response?.images ?? []);
    },
  );
}

function render(payload) {
  if (!payload) {
    sourceUrlEl.textContent = "暂无数据";
    renderSummary([]);
    renderImages([]);
    return;
  }
  const sourceUrl = payload.sourceUrl ?? "未知来源";
  sourceUrlEl.textContent = sourceUrl;
  renderSummary(payload.items ?? []);
  if (payload.cachedImages) {
    renderImages(payload.cachedImages);
  } else {
    renderImages([]);
    if (sourceUrl && sourceUrl !== "未知来源" && sourceUrl !== lastSourceUrl) {
      requestImages(sourceUrl);
    }
  }
  lastSourceUrl = sourceUrl;
}

chrome.runtime.sendMessage({ type: "wash-articles/get-content" }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn("获取页面内容失败：", chrome.runtime.lastError.message);
    return;
  }
  render(response?.payload ?? null);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "wash-articles/content-updated") {
    render(message.payload);
  }
  if (message?.type === "wash-articles/images-cached") {
    if (message.payload?.sourceUrl === lastSourceUrl) {
      renderImages(message.payload.images ?? []);
    }
  }
});

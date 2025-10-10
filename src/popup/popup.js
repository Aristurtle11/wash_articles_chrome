const sourceUrlEl = document.getElementById("source-url");
const captureTimeEl = document.getElementById("capture-time");
const summaryListEl = document.getElementById("summary-list");
const summaryEmptyEl = document.getElementById("summary-empty");
const imagesGridEl = document.getElementById("images-grid");
const imagesEmptyEl = document.getElementById("images-empty");
const historyListEl = document.getElementById("history-list");
const historyEmptyEl = document.getElementById("history-empty");
const historyClearBtn = document.getElementById("history-clear");
const translationStatusEl = document.getElementById("translation-status");
const translationTextEl = document.getElementById("translation-text");
const translateBtn = document.getElementById("translate-btn");
const openSettingsBtn = document.getElementById("open-settings");
const formattedStatusEl = document.getElementById("formatted-status");
const formattedPreviewEl = document.getElementById("formatted-preview");
const copyMarkdownBtn = document.getElementById("copy-markdown");
const copyHtmlBtn = document.getElementById("copy-html");
const downloadMarkdownBtn = document.getElementById("download-markdown");
const downloadHtmlBtn = document.getElementById("download-html");

let lastSourceUrl = null;
let historyEntries = [];
let translationState = null;
let hasApiKey = false;
let formattedState = null;
const port = chrome.runtime.connect({ name: "wash-articles" });

function renderSummary(items, counts) {
  summaryListEl.innerHTML = "";
  const stats = counts || computeCounts(items);
  if (!stats.paragraphs && !stats.headings && !stats.images) {
    summaryEmptyEl.style.display = "block";
    return;
  }
  summaryEmptyEl.style.display = "none";
  [
    `段落：${stats.paragraphs}`,
    `小标题：${stats.headings}`,
    `图片：${stats.images}`,
  ].forEach((text) => {
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

function renderTranslation(translation) {
  translationState = translation ?? null;
  if (!translation) {
    translationTextEl.value = "";
    translationStatusEl.textContent = hasApiKey ? "尚未翻译" : "请先配置 API Key";
    updateTranslateButton();
    return;
  }

  if (translation.status === "working") {
    translationStatusEl.textContent = "翻译中…";
    translationTextEl.value = translation.text ?? translationTextEl.value ?? "";
  } else if (translation.status === "error") {
    translationStatusEl.textContent = `翻译失败：${translation.error || "未知错误"}`;
    translationTextEl.value = translation.text ?? translationTextEl.value ?? "";
  } else {
    translationStatusEl.textContent = translation.updatedAt
      ? `翻译完成：${formatDate(translation.updatedAt)}`
      : "翻译完成";
    translationTextEl.value = translation.text ?? "";
  }

  updateTranslateButton();
}

function updateTranslateButton() {
  if (!translateBtn) return;
  const isWorking = translationState?.status === "working";
  if (isWorking) {
    translateBtn.textContent = "翻译中…";
  } else if (translationState?.status === "done" && translationState?.text) {
    translateBtn.textContent = "重新翻译";
  } else {
    translateBtn.textContent = "开始翻译";
  }
  const hasSource = Boolean(lastSourceUrl && lastSourceUrl !== "未知来源");
  translateBtn.disabled = isWorking || !hasApiKey || !hasSource;
}

function renderFormatted(formatted) {
  formattedState = formatted ?? null;
  if (!formatted || !formatted.html) {
    formattedStatusEl.textContent = translationState?.status === "working"
      ? "翻译完成后将自动排版"
      : "等待翻译完成";
    formattedPreviewEl.innerHTML = "暂无排版结果";
    updateFormattedButtons();
    return;
  }
  formattedStatusEl.textContent = formatted.updatedAt
    ? `排版完成：${formatDate(formatted.updatedAt)}`
    : "排版完成";
  formattedPreviewEl.innerHTML = formatted.html;
  updateFormattedButtons();
}

function updateFormattedButtons() {
  const available = Boolean(formattedState?.html || formattedState?.markdown);
  copyHtmlBtn.disabled = !available;
  copyMarkdownBtn.disabled = !available;
  downloadHtmlBtn.disabled = !available;
  downloadMarkdownBtn.disabled = !available;
}

function renderHistory(entries) {
  historyEntries = Array.isArray(entries) ? entries : [];
  historyListEl.innerHTML = "";
  if (!historyEntries.length) {
    historyEmptyEl.style.display = "block";
    return;
  }
  historyEmptyEl.style.display = "none";
  historyEntries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "history-item";
    item.dataset.index = index;

    const title = document.createElement("strong");
    title.textContent = entry.title || entry.sourceUrl || `记录 ${index + 1}`;
    item.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = `${formatDate(entry.capturedAt)} · 段落 ${entry.counts?.paragraphs ?? 0} / 图像 ${entry.counts?.images ?? 0}`;
    item.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const loadBtn = document.createElement("button");
    loadBtn.dataset.action = "load";
    loadBtn.className = "secondary";
    loadBtn.textContent = "加载";
    actions.appendChild(loadBtn);

    const exportJsonBtn = document.createElement("button");
    exportJsonBtn.dataset.action = "export-json";
    exportJsonBtn.textContent = "导出 JSON";
    actions.appendChild(exportJsonBtn);

    const exportMdBtn = document.createElement("button");
    exportMdBtn.dataset.action = "export-markdown";
    exportMdBtn.textContent = "导出 Markdown";
    actions.appendChild(exportMdBtn);

    item.appendChild(actions);
    historyListEl.appendChild(item);
  });
}

function render(payload) {
  if (!payload) {
    sourceUrlEl.textContent = "暂无数据";
    captureTimeEl.textContent = "";
    summaryEmptyEl.style.display = "block";
    renderImages([]);
    lastSourceUrl = null;
    renderTranslation(null);
    renderFormatted(null);
    return;
  }
  const sourceUrl = payload.sourceUrl ?? "";
  const capturedAt = payload.capturedAt ?? null;
  const counts = payload.counts ?? null;
  sourceUrlEl.textContent = sourceUrl || "未知来源";
  captureTimeEl.textContent = capturedAt ? `采集时间：${formatDate(capturedAt)}` : "";
  renderSummary(payload.items ?? [], counts);
  const cachedImages = payload.cachedImages || payload.images || [];
  renderImages(cachedImages);
  if (!cachedImages.length && sourceUrl && sourceUrl !== lastSourceUrl) {
    requestImages(sourceUrl);
  }
  lastSourceUrl = sourceUrl;
  renderTranslation(payload.translation ?? null);
  renderFormatted(payload.formatted ?? null);
}

function requestImages(sourceUrl) {
  chrome.runtime.sendMessage(
    { type: "wash-articles/get-images", payload: { sourceUrl } },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn("获取图片缓存失败：", chrome.runtime.lastError.message);
        return;
      }
      if (sourceUrl === lastSourceUrl) {
        renderImages(response?.images ?? []);
      }
    },
  );
}

function requestHistory() {
  chrome.runtime.sendMessage({ type: "wash-articles/get-history" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("获取历史记录失败：", chrome.runtime.lastError.message);
      return;
    }
    renderHistory(response?.history ?? []);
  });
}

function applySettings(settings) {
  hasApiKey = Boolean(settings?.hasApiKey);
  if (!hasApiKey) {
    translationStatusEl.textContent = "请先配置 API Key";
  } else if (!translationState) {
    translationStatusEl.textContent = "尚未翻译";
  }
  updateTranslateButton();
}

historyListEl.addEventListener("click", (event) => {
  const action = event.target?.dataset?.action;
  if (!action) return;
  const item = event.target.closest("li[data-index]");
  if (!item) return;
  const index = Number(item.dataset.index);
  const entry = historyEntries[index];
  if (!entry) return;
  if (action === "load") {
    render({
      ...entry,
      cachedImages: entry.images,
      translation: entry.translation,
      formatted: entry.formatted,
    });
  } else if (action === "export-json") {
    requestExport(entry.sourceUrl, "json");
  } else if (action === "export-markdown") {
    requestExport(entry.sourceUrl, "markdown");
  }
});

historyClearBtn.addEventListener("click", () => {
  if (!confirm("确定要清空历史记录吗？")) return;
  chrome.runtime.sendMessage({ type: "wash-articles/clear-history" }, () => {
    if (chrome.runtime.lastError) {
      alert(`清空失败：${chrome.runtime.lastError.message}`);
      return;
    }
    renderHistory([]);
  });
});

translateBtn.addEventListener("click", () => {
  if (!hasApiKey) {
    if (confirm("尚未配置 API Key，是否前往设置？")) {
      chrome.runtime.openOptionsPage();
    }
    return;
  }
  const hasSource = Boolean(lastSourceUrl && lastSourceUrl !== "未知来源");
  if (!hasSource) {
    alert("请先在页面中提取正文内容后再翻译。");
    return;
  }
  translateBtn.disabled = true;
  translationStatusEl.textContent = "翻译中…";
  chrome.runtime.sendMessage(
    { type: "wash-articles/translate", payload: { sourceUrl: lastSourceUrl } },
    (response) => {
      if (chrome.runtime.lastError) {
        translationStatusEl.textContent = `翻译请求失败：${chrome.runtime.lastError.message}`;
        translationState = { status: "error", error: chrome.runtime.lastError.message };
        updateTranslateButton();
        return;
      }
      if (!response?.ok) {
        translationStatusEl.textContent = `翻译失败：${response?.error || "未知错误"}`;
        translationState = { status: "error", error: response?.error || "未知错误" };
        updateTranslateButton();
      }
    },
  );
});

openSettingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

copyHtmlBtn.addEventListener("click", () => {
  if (!formattedState?.html) return;
  navigator.clipboard
    .writeText(formattedState.html)
    .then(() => {
      formattedStatusEl.textContent = "已复制 HTML";
      setTimeout(() => {
        renderFormatted(formattedState);
      }, 1500);
    })
    .catch((error) => {
      alert(`复制失败：${error.message ?? error}`);
    });
});

copyMarkdownBtn.addEventListener("click", () => {
  if (!formattedState?.markdown) return;
  navigator.clipboard
    .writeText(formattedState.markdown)
    .then(() => {
      formattedStatusEl.textContent = "已复制 Markdown";
      setTimeout(() => {
        renderFormatted(formattedState);
      }, 1500);
    })
    .catch((error) => {
      alert(`复制失败：${error.message ?? error}`);
    });
});

function triggerDownload(format) {
  if (!formattedState) return;
  if (!lastSourceUrl) {
    alert("暂无可导出的页面数据");
    return;
  }
  chrome.runtime.sendMessage(
    {
      type: "wash-articles/download-formatted",
      payload: { sourceUrl: lastSourceUrl, format },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        alert(`导出失败：${chrome.runtime.lastError.message}`);
        return;
      }
      if (!response?.ok) {
        alert(`导出失败：${response?.error || "未知错误"}`);
        return;
      }
      formattedStatusEl.textContent = format === "html" ? "已触发 HTML 下载" : "已触发 Markdown 下载";
      setTimeout(() => renderFormatted(formattedState), 1500);
    },
  );
}

downloadHtmlBtn.addEventListener("click", () => {
  triggerDownload("html");
});

downloadMarkdownBtn.addEventListener("click", () => {
  triggerDownload("markdown");
});

function requestExport(sourceUrl, format) {
  chrome.runtime.sendMessage({ type: "wash-articles/export-entry", payload: { sourceUrl, format } }, (response) => {
    if (chrome.runtime.lastError) {
      alert(`导出失败：${chrome.runtime.lastError.message}`);
      return;
    }
    if (!response?.ok) {
      alert(`导出失败：${response?.error || "未知错误"}`);
    }
  });
}

function computeCounts(items) {
  const counters = { paragraphs: 0, images: 0, headings: 0 };
  if (!Array.isArray(items)) return counters;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "paragraph") counters.paragraphs += 1;
    else if (item.kind === "image") counters.images += 1;
    else if (item.kind === "heading") counters.headings += 1;
  }
  return counters;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function handleRuntimeMessage(message) {
  if (message?.type === "wash-articles/content-updated") {
    render(message.payload);
  }
  if (message?.type === "wash-articles/images-cached") {
    if (message.payload?.sourceUrl === lastSourceUrl) {
      renderImages(message.payload.images ?? []);
    }
  }
  if (message?.type === "wash-articles/history-updated") {
    renderHistory(message.history ?? []);
  }
  if (message?.type === "wash-articles/translation-updated") {
    if (!message.payload?.sourceUrl || message.payload.sourceUrl !== lastSourceUrl) {
      return;
    }
    renderTranslation(message.payload.translation ?? null);
    renderFormatted(message.payload.formatted ?? null);
  }
  if (message?.type === "wash-articles/settings-updated") {
    applySettings(message.settings ?? {});
  }
  if (message?.type === "wash-articles/formatted-updated") {
    if (!message.payload?.sourceUrl || message.payload.sourceUrl !== lastSourceUrl) {
      return;
    }
    renderFormatted(message.payload.formatted ?? null);
  }
}

chrome.runtime.sendMessage({ type: "wash-articles/get-content" }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn("获取页面内容失败：", chrome.runtime.lastError.message);
    return;
  }
  render(response?.payload ?? null);
});

requestHistory();

chrome.runtime.sendMessage({ type: "wash-articles/get-settings" }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn("获取设置失败：", chrome.runtime.lastError.message);
    return;
  }
  applySettings(response?.settings ?? {});
});

chrome.runtime.onMessage.addListener(handleRuntimeMessage);
port.onMessage.addListener(handleRuntimeMessage);
port.postMessage({ type: "wash-articles/request-state" });

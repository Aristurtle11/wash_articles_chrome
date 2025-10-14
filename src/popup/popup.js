const sourceUrlEl = document.getElementById("source-url");
const captureTimeEl = document.getElementById("capture-time");
const summaryListEl = document.getElementById("summary-list");
const summaryEmptyEl = document.getElementById("summary-empty");
const washBtn = document.getElementById("wash-btn");
const washStatusEl = document.getElementById("wash-status");
const translationStatusEl = document.getElementById("translation-status");
const translationTextEl = document.getElementById("translation-text");
const openSettingsBtn = document.getElementById("open-settings");
const generatedTitleInput = document.getElementById("generated-title");
const titleStatusEl = document.getElementById("title-status");
const formattedStatusEl = document.getElementById("formatted-status");
const formattedPreviewEl = document.getElementById("formatted-preview");
const copyMarkdownBtn = document.getElementById("copy-markdown");
const copyHtmlBtn = document.getElementById("copy-html");
const downloadMarkdownBtn = document.getElementById("download-markdown");
const downloadHtmlBtn = document.getElementById("download-html");
let lastSourceUrl = null;
let translationState = null;
let formattedState = null;
let titleState = null;
let workflowState = null;
const port = chrome.runtime.connect({ name: "wash-articles" });

const WORKFLOW_STEP_MESSAGES = {
  idle: "点击 Wash 开始处理",
  extracting: "正在抓取文章内容…",
  preparing: "正在整理正文与标题…",
  formatting: "正在生成排版…",
  complete: "流程完成，排版已生成",
};

function setWashButtonIdle(label = "Wash") {
  if (!washBtn) return;
  washBtn.disabled = false;
  washBtn.textContent = label;
}

function setWashButtonLoading(label = "处理中…") {
  if (!washBtn) return;
  washBtn.disabled = true;
  washBtn.textContent = label;
}

setWashButtonIdle();
washStatusEl.textContent = WORKFLOW_STEP_MESSAGES.idle;

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

function renderTranslation(translation) {
  translationState = translation ?? null;
  if (!translation) {
    translationTextEl.value = "";
    translationStatusEl.textContent = "等待整理开始";
    return;
  }

  if (translation.status === "working") {
    translationStatusEl.textContent = "正文整理中…";
    translationTextEl.value = translation.text ?? translationTextEl.value ?? "";
  } else if (translation.status === "error") {
    translationStatusEl.textContent = `整理失败：${translation.error || "未知错误"}`;
    translationTextEl.value = translation.text ?? translationTextEl.value ?? "";
  } else {
    translationStatusEl.textContent = translation.updatedAt
      ? `正文整理完成：${formatDate(translation.updatedAt)}`
      : "正文整理完成";
    translationTextEl.value = translation.text ?? "";
  }
}

function renderTitle(titleTask) {
  titleState = titleTask ?? null;
  if (!titleTask) {
    generatedTitleInput.value = "";
    titleStatusEl.textContent = "等待标题整理";
    return;
  }
  if (titleTask.status === "working") {
    titleStatusEl.textContent = "标题整理中…";
  } else if (titleTask.status === "error") {
    titleStatusEl.textContent = `标题生成失败：${titleTask.error || "未知错误"}`;
  } else {
    if (titleTask.warning) {
      titleStatusEl.textContent = `标题已生成（使用备用方案）：${titleTask.warning}`;
    } else {
      titleStatusEl.textContent = titleTask.updatedAt
        ? `标题生成完成：${formatDate(titleTask.updatedAt)}`
        : "标题生成完成";
    }
  }
  generatedTitleInput.value = titleTask.text || "";
}

function renderWorkflow(state) {
  workflowState = state ?? null;
  if (!washStatusEl) return;
  if (!state) {
    setWashButtonIdle();
    washStatusEl.textContent = WORKFLOW_STEP_MESSAGES.idle;
    return;
  }
  if (state.status === "running") {
    setWashButtonLoading();
    const message =
      WORKFLOW_STEP_MESSAGES[state.currentStep] ?? WORKFLOW_STEP_MESSAGES.preparing;
    washStatusEl.textContent = message;
    if (state.currentStep === "formatting") {
      formattedStatusEl.textContent = "正在生成排版…";
      formattedPreviewEl.innerHTML = "排版生成中…";
    }
    return;
  }
  if (state.status === "error") {
    setWashButtonIdle("重新 Wash");
    washStatusEl.textContent = state.error ? `处理失败：${state.error}` : "处理失败";
    return;
  }
  if (state.status === "success" || state.status === "complete") {
    setWashButtonIdle("再次 Wash");
    washStatusEl.textContent = state.message || WORKFLOW_STEP_MESSAGES.complete;
    return;
  }
  setWashButtonIdle();
  washStatusEl.textContent = WORKFLOW_STEP_MESSAGES.idle;
}

function renderFormatted(formatted) {
  formattedState = formatted ?? null;
  if (!formatted || !formatted.html) {
    formattedStatusEl.textContent = translationState?.status === "working"
      ? "正文整理完成后将自动排版"
      : "等待正文整理完成";
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
  const hasHtml = Boolean(formattedState?.html);
  const hasMarkdown = Boolean(formattedState?.markdown);
  copyHtmlBtn.disabled = !hasHtml;
  downloadHtmlBtn.disabled = !hasHtml;
  copyMarkdownBtn.disabled = !hasMarkdown;
  downloadMarkdownBtn.disabled = !hasMarkdown;
}


function render(payload) {
  if (!payload) {
    sourceUrlEl.textContent = "暂无数据";
    captureTimeEl.textContent = "";
    summaryEmptyEl.style.display = "block";
    lastSourceUrl = null;
    renderTranslation(null);
    renderTitle(null);
    renderFormatted(null);
    renderWorkflow(null);
    return;
  }
  const sourceUrl = payload.sourceUrl ?? "";
  const capturedAt = payload.capturedAt ?? null;
  const counts = payload.counts ?? null;
  sourceUrlEl.textContent = sourceUrl || "未知来源";
  captureTimeEl.textContent = capturedAt ? `采集时间：${formatDate(capturedAt)}` : "";
  renderSummary(payload.items ?? [], counts);
  lastSourceUrl = sourceUrl;
  renderTranslation(payload.translation ?? null);
  renderTitle(payload.titleTask ?? null);
  renderFormatted(payload.formatted ?? null);
  renderWorkflow(payload.workflow ?? null);
}

function applySettings(settings) {
  if (!workflowState) {
    washStatusEl.textContent = WORKFLOW_STEP_MESSAGES.idle;
  }
}

washBtn.addEventListener("click", () => {
  startWashWorkflow();
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

function startWashWorkflow() {
  renderWorkflow({ status: "running", currentStep: "extracting" });
  renderTranslation({ status: "working", text: "" });
  renderTitle({ status: "working", text: "" });
  formattedState = null;
  formattedPreviewEl.innerHTML = "等待排版结果…";
  formattedStatusEl.textContent = "等待排版";
  updateFormattedButtons();
  setWashButtonLoading("启动中…");
  washStatusEl.textContent = "正在连接页面…";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      setWashButtonIdle();
      washStatusEl.textContent = "无法获取当前标签页";
      return;
    }
    chrome.tabs.sendMessage(
      tabId,
      { type: "wash-articles/run-extraction" },
      (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          setWashButtonIdle("重新 Wash");
          const message = error.message.includes("Receiving end does not exist")
            ? "当前页面不受支持"
            : error.message;
          washStatusEl.textContent = `触发失败：${message}`;
          return;
        }
        if (!response?.ok) {
          setWashButtonIdle("重新 Wash");
          washStatusEl.textContent = `提取失败：${response?.error || "未知错误"}`;
          return;
        }
        washStatusEl.textContent = WORKFLOW_STEP_MESSAGES.extracting;
      },
    );
  });
}

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
    // 已移除图片面板，该消息忽略
  }
  if (message?.type === "wash-articles/translation-updated") {
    if (!message.payload?.sourceUrl || message.payload.sourceUrl !== lastSourceUrl) {
      return;
    }
    renderTranslation(message.payload.translation ?? null);
    renderTitle(message.payload.titleTask ?? null);
    renderFormatted(message.payload.formatted ?? null);
    if (message.payload.workflow) {
      renderWorkflow(message.payload.workflow);
    }
    // no additional actions needed
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

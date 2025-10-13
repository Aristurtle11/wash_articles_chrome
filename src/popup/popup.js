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
const wechatStatusEl = document.getElementById("wechat-status");
const wechatThumbInput = document.getElementById("wechat-thumb-media");
const wechatCreateBtn = document.getElementById("wechat-create");
const wechatCopyPayloadBtn = document.getElementById("wechat-copy-payload");
const wechatDraftOutput = document.getElementById("wechat-draft-output");

let lastSourceUrl = null;
let translationState = null;
let formattedState = null;
let wechatHasCredentials = false;
let wechatHasToken = false;
let wechatTokenExpiresAt = null;
let wechatDraftState = null;
let titleState = null;
let workflowState = null;
const port = chrome.runtime.connect({ name: "wash-articles" });

const WORKFLOW_STEP_MESSAGES = {
  idle: "点击 Wash 开始处理",
  extracting: "正在抓取文章内容…",
  preparing: "正在整理正文与标题…",
  uploading: "正在上传图片到公众号…",
  formatting: "正在生成排版…",
  publishing: "正在创建公众号草稿…",
  complete: "流程完成，草稿已生成",
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
    prefillWechatFields();
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
    setWechatIdleStatus();
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
    if (state.currentStep === "uploading") {
      wechatStatusEl.textContent = "正在上传图片到公众号…";
    } else if (state.currentStep === "publishing") {
      wechatStatusEl.textContent = "正在创建公众号草稿…";
    }
    return;
  }
  if (state.status === "error") {
    setWashButtonIdle("重新 Wash");
    washStatusEl.textContent = state.error ? `处理失败：${state.error}` : "处理失败";
    if (state.currentStep === "uploading" || state.currentStep === "publishing") {
      wechatStatusEl.textContent = state.error ? `处理失败：${state.error}` : "处理失败";
    }
    return;
  }
  if (state.status === "success" || state.status === "complete") {
    setWashButtonIdle("再次 Wash");
    washStatusEl.textContent = state.message || WORKFLOW_STEP_MESSAGES.complete;
    wechatHasToken = true;
    if (wechatDraftState?.media_id) {
      wechatStatusEl.textContent = `草稿创建成功，media_id=${wechatDraftState.media_id}`;
    } else {
      setWechatIdleStatus();
    }
    return;
  }
  setWashButtonIdle();
  washStatusEl.textContent = WORKFLOW_STEP_MESSAGES.idle;
  setWechatIdleStatus();
}

function renderFormatted(formatted) {
  formattedState = formatted ?? null;
  if (!formatted || !formatted.html) {
    formattedStatusEl.textContent = translationState?.status === "working"
      ? "正文整理完成后将自动排版"
      : "等待正文整理完成";
    formattedPreviewEl.innerHTML = "暂无排版结果";
    updateFormattedButtons();
    setWechatIdleStatus();
    updateWechatButtons();
    return;
  }
  formattedStatusEl.textContent = formatted.updatedAt
    ? `排版完成：${formatDate(formatted.updatedAt)}`
    : "排版完成";
  formattedPreviewEl.innerHTML = formatted.html;
  updateFormattedButtons();
  prefillWechatFields();
  setWechatIdleStatus();
  updateWechatButtons();
}

function updateFormattedButtons() {
  const hasHtml = Boolean(formattedState?.html);
  const hasMarkdown = Boolean(formattedState?.markdown);
  copyHtmlBtn.disabled = !hasHtml;
  downloadHtmlBtn.disabled = !hasHtml;
  copyMarkdownBtn.disabled = !hasMarkdown;
  downloadMarkdownBtn.disabled = !hasMarkdown;
}

function updateWechatButtons() {
  const available = Boolean(formattedState?.html);
  if (wechatCreateBtn) {
    wechatCreateBtn.disabled = !available;
  }
  if (wechatCopyPayloadBtn) {
    wechatCopyPayloadBtn.disabled = !wechatDraftState;
  }
  if (!wechatDraftState) {
    setWechatIdleStatus();
  }
}

function setWechatIdleStatus() {
  if (workflowState?.status === "running" && ["uploading", "publishing"].includes(workflowState.currentStep)) {
    return;
  }
  if (wechatDraftState?.media_id) {
    wechatStatusEl.textContent = `草稿创建成功，media_id=${wechatDraftState.media_id}`;
    return;
  }
  if (!formattedState?.html) {
    wechatStatusEl.textContent = "请先完成正文整理";
    return;
  }
  if (!wechatHasCredentials) {
    wechatStatusEl.textContent = "尚未配置公众号凭证";
    return;
  }
  if (!wechatHasToken) {
    wechatStatusEl.textContent = "已配置凭证，首次生成时将自动申请 Access Token";
    return;
  }
  const expiryText = wechatTokenExpiresAt ? `（有效期至 ${formatDate(wechatTokenExpiresAt)}）` : "";
  wechatStatusEl.textContent = `可生成公众号草稿${expiryText}`;
}

function prefillWechatFields() {
  if (!translationState) {
    return;
  }
  if (translationState.status !== "done") {
    return;
  }
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
  wechatDraftState = payload.wechatDraft ?? wechatDraftState;
  if (wechatDraftState?.payload) {
    wechatDraftOutput.value = JSON.stringify(wechatDraftState.payload, null, 2);
  }
}

function applySettings(settings) {
  wechatHasCredentials = Boolean(settings?.wechatHasCredentials);
  wechatHasToken = Boolean(settings?.wechatConfigured);
  wechatTokenExpiresAt = settings?.wechatTokenExpiresAt || null;
  if (!wechatDraftState) {
    setWechatIdleStatus();
  }
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
  wechatDraftState = null;
  wechatDraftOutput.value = "";
  setWechatIdleStatus();
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

wechatCreateBtn.addEventListener("click", () => {
  if (!formattedState?.html) {
    alert("请先完成正文整理与排版");
    return;
  }
  if (!lastSourceUrl) {
    alert("暂无可提交的文章链接");
    return;
  }
  const metadata = {
    title: titleState?.text || deriveTitleFromTranslation(translationState?.text || ""),
    digest: "",
    sourceUrl: "",
    thumbMediaId: wechatThumbInput.value.trim(),
  };

  wechatStatusEl.textContent = wechatHasCredentials
    ? "正在生成公众号草稿…"
    : "试运行：生成模拟草稿…";

  chrome.runtime.sendMessage(
    {
      type: "wash-articles/wechat-create-draft",
      payload: {
        sourceUrl: lastSourceUrl,
        metadata,
        dryRun: !wechatHasCredentials,
      },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        wechatStatusEl.textContent = `生成失败：${chrome.runtime.lastError.message}`;
        return;
      }
      if (!response?.ok) {
        wechatStatusEl.textContent = `生成失败：${response?.error || "未知错误"}`;
        return;
      }
      wechatDraftState = response.draft;
      wechatDraftOutput.value = JSON.stringify(response.draft?.payload ?? {}, null, 2);
      wechatStatusEl.textContent = response.dryRun
        ? "试运行草稿已生成"
        : `草稿创建成功，media_id=${response.draft?.media_id || "未知"}`;
      updateWechatButtons();
    },
  );
});

wechatCopyPayloadBtn.addEventListener("click", () => {
  if (!wechatDraftState?.payload) {
    alert("暂无可复制的草稿内容");
    return;
  }
  navigator.clipboard
    .writeText(JSON.stringify(wechatDraftState.payload, null, 2))
    .then(() => {
      wechatStatusEl.textContent = "草稿 JSON 已复制";
      setTimeout(() => updateWechatButtons(), 1500);
    })
    .catch((error) => {
      alert(`复制失败：${error?.message ?? error}`);
    });
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

function deriveTitleFromTranslation(text) {
  if (!text) return "待确认标题";
  const firstLine = String(text)
    .split(/\r?\n/)
    .find((line) => line.trim());
  return firstLine ? firstLine.trim().slice(0, 60) : "待确认标题";
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
    if (Array.isArray(message.payload.wechatUploads) && message.payload.wechatUploads.length) {
      wechatHasToken = true;
    }
    if (message.payload.wechatDraft) {
      wechatDraftState = message.payload.wechatDraft;
      wechatDraftOutput.value = JSON.stringify(message.payload.wechatDraft.payload ?? {}, null, 2);
      if (message.payload.wechatDraft.media_id) {
        wechatStatusEl.textContent = `草稿创建成功，media_id=${message.payload.wechatDraft.media_id}`;
      }
      updateWechatButtons();
    }
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

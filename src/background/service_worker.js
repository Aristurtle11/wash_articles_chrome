// Chrome 扩展服务工作线程入口。
// 负责内容缓存、图片缓存、历史记录与导出。

import { ContentStore } from "./state.js";
import {
  saveImages,
  loadImages,
  clearImages,
  appendHistory,
  loadHistory,
  clearHistory,
} from "./storage.js";
import { FormatterService } from "./formatter.js";
import { TranslatorService } from "./translator.js";
import { uploadImagesForWeChat, createWeChatDraft } from "./wechat_service.js";
import {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  normalizeSettings,
  maskToken,
} from "../shared/settings.js";

const store = new ContentStore();
const formatter = new FormatterService();
const translator = new TranslatorService();
let currentSettings = { ...DEFAULT_SETTINGS };
const ports = new Set();
const activePipelines = new Map();
const WORKFLOW_STEPS = [
  "extracting",
  "preparing",
  "uploading",
  "formatting",
  "publishing",
  "complete",
];
const WECHAT_TOKEN_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/stable_token";
const WECHAT_TOKEN_REFRESH_MARGIN_MS = 0;
let skipWeChatAutoRefresh = false;
let wechatTokenRefreshPromise = null;

function log(...args) {
  console.info("[WashArticles:SW]", ...args);
}

log("服务工作线程已加载：", new Date().toISOString());

chrome.runtime.onInstalled.addListener((details) => {
  log("扩展安装/更新事件：", details);
});

initializeSettings().catch((error) => {
  log("初始化设置失败：", error);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[SETTINGS_KEY]) {
    return;
  }
  const next = normalizeSettings(changes[SETTINGS_KEY].newValue);
  updateSettings(next).catch((error) => log("同步设置失败：", error));
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "wash-articles") {
    return;
  }
  ports.add(port);
  log("前端视图连接：", port.sender?.documentId ?? port.sender?.id ?? "unknown");

  const sendInitialState = async () => {
    try {
      const latest = store.latest();
      if (latest) {
        port.postMessage({ type: "wash-articles/content-updated", payload: latest });
      }
      const history = await loadHistory();
      port.postMessage({ type: "wash-articles/history-updated", history });
      port.postMessage({
        type: "wash-articles/settings-updated",
        settings: sanitizeSettings(currentSettings),
      });
    } catch (error) {
      log("同步初始状态失败：", error);
    }
  };

  sendInitialState().catch((error) => log("初始化同步失败：", error));

  port.onDisconnect.addListener(() => {
    ports.delete(port);
    log("前端视图断开连接");
  });

  port.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "wash-articles/request-state") {
      sendInitialState().catch((error) => log("按需同步失败：", error));
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }
  const tabId = sender.tab?.id ?? null;
  switch (message.type) {
    case "wash-articles/content":
      if (tabId && message.payload) {
        void (async () => {
          const base = {
            ...message.payload,
            counts: computeCounts(message.payload.items),
            cachedImages: [],
            article: null,
            title: null,
            formatted: null,
            wechatUploads: [],
            wechatDraft: null,
          };
          store.set(tabId, base);
          initializeWorkflow(tabId);
          log(
            "收到内容并缓存：",
            tabId,
            base?.items?.length ?? 0,
            "images=",
            base?.counts?.images ?? 0,
          );
          await sendMessageSafely({
            type: "wash-articles/content-updated",
            payload: store.get(tabId),
          });
          await cacheImagesForPayload(tabId, base);
          await startWashPipeline(tabId);
        })().catch((error) => log("处理内容流程失败", error));
      }
      break;
    case "wash-articles/get-content":
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const activeTabId = tabs?.[0]?.id ?? tabId ?? null;
        if (activeTabId) {
          const payload = store.get(activeTabId);
          sendResponse({ payload });
          log("返回缓存内容给 Popup：", activeTabId);
        } else {
          log("未找到活动标签，返回最近缓存");
          sendResponse({ payload: store.get(null) });
        }
      });
      return true;
    case "wash-articles/open-popup":
      if (tabId && message.payload) {
        store.set(tabId, message.payload);
      }
      chrome.action.openPopup(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          log("打开 Popup 失败：", error.message);
          return;
        }
        if (message.payload) {
          void sendMessageSafely({
            type: "wash-articles/content-updated",
            payload: message.payload,
          });
        }
      });
      break;
    case "wash-articles/get-images":
      (async () => {
        try {
          const sourceUrl = message.payload?.sourceUrl;
          if (!sourceUrl) {
            sendResponse({ images: [] });
            return;
          }
          const images = await loadImages(sourceUrl);
          sendResponse({ images });
        } catch (error) {
          log("读取缓存图片失败", error);
          sendResponse({ images: [], error: error?.message ?? String(error) });
        }
      })();
      return true;
    case "wash-articles/get-settings":
      sendResponse({ settings: sanitizeSettings(currentSettings) });
      return false;
    case "wash-articles/wechat-refresh-token":
      (async () => {
        try {
          const result = await refreshWeChatAccessToken({
            forceRefresh: Boolean(message.payload?.forceRefresh),
          });
          sendResponse({ ok: true, ...result });
        } catch (error) {
          const errorCode = error?.errcode ?? error?.errorCode ?? null;
          sendResponse({
            ok: false,
            error: error?.message ?? String(error),
            errorCode,
          });
        }
      })();
      return true;
    case "wash-articles/wechat-create-draft": {
      const sourceUrl = message.payload?.sourceUrl || null;
      const targetTabId =
        tabId ?? findTabIdBySource(sourceUrl) ?? store.entries()[0]?.tabId ?? null;
      if (!targetTabId) {
        sendResponse({ ok: false, error: "未找到对应页面内容" });
        return false;
      }
      handleWeChatDraftRequest(targetTabId, message.payload ?? {})
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          sendResponse({ ok: false, error: error?.message ?? String(error) });
        });
      return true;
    }
    case "wash-articles/get-history":
      (async () => {
        const history = await loadHistory();
        sendResponse({ history });
      })();
      return true;
    case "wash-articles/clear-history":
      (async () => {
        await clearHistory();
        await broadcastHistory();
        sendResponse({ ok: true });
      })();
      return true;
    case "wash-articles/download-formatted":
      (async () => {
        try {
          const { sourceUrl, format } = message.payload || {};
          if (!sourceUrl || !format) {
            sendResponse({ ok: false, error: "缺少必要参数" });
            return;
          }
          await downloadFormatted(sourceUrl, format);
          sendResponse({ ok: true });
        } catch (error) {
          log("导出排版结果失败", error);
          sendResponse({ ok: false, error: error?.message ?? String(error) });
        }
      })();
      return true;
    case "wash-articles/export-entry":
      (async () => {
        try {
          const { sourceUrl, format } = message.payload || {};
          if (!sourceUrl) {
            sendResponse({ ok: false, error: "缺少 sourceUrl" });
            return;
          }
          await exportEntry(sourceUrl, format || "json");
          sendResponse({ ok: true });
        } catch (error) {
          log("导出历史记录失败", error);
          sendResponse({ ok: false, error: error?.message ?? String(error) });
        }
      })();
      return true;
    default:
      break;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const existing = store.get(tabId);
  if (existing?.sourceUrl) {
    void clearImages(existing.sourceUrl);
  }
  store.clear(tabId);
});

async function cacheImagesForPayload(tabId, payload) {
  const sourceUrl = payload?.sourceUrl;
  if (!sourceUrl) {
    return [];
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const candidates = items.filter((item) => item?.kind === "image" && item.url);

  try {
    const existing = await loadImages(sourceUrl);
    const cachedByUrl = new Map((existing ?? []).map((img) => [img.url, img]));
    const downloads = [];

    for (const candidate of candidates) {
      if (cachedByUrl.has(candidate.url)) {
        continue;
      }
      try {
        const downloaded = await fetchImage(candidate.url, tabId);
        downloads.push({
          sequence: candidate.sequence ?? null,
          url: candidate.url,
          alt: candidate.alt ?? "",
          caption: candidate.caption ?? "",
          credit: candidate.credit ?? "",
          ...downloaded,
        });
        log("图片缓存成功：", candidate.url);
      } catch (error) {
        log("图片缓存失败：", candidate.url, error);
        downloads.push({
          sequence: candidate.sequence ?? null,
          url: candidate.url,
          alt: candidate.alt ?? "",
          caption: candidate.caption ?? "",
          credit: candidate.credit ?? "",
          error: error?.message ?? String(error),
        });
      }
    }

    const merged = mergeImages(existing, downloads);
    if (downloads.length) {
      await saveImages(sourceUrl, merged);
    }

    store.update(tabId, (current) =>
      current
        ? { ...current, cachedImages: merged }
        : { ...payload, cachedImages: merged },
    );

    await syncHistoryEntry(tabId);

    await sendMessageSafely({
      type: "wash-articles/images-cached",
      payload: { sourceUrl, images: merged },
    });
    return merged;
  } catch (error) {
    log("缓存图片时出错：", error);
    return Array.isArray(payload?.cachedImages) ? payload.cachedImages : [];
  }
}

class WorkflowError extends Error {
  constructor(step, message, cause) {
    super(message);
    this.name = "WorkflowError";
    this.step = step;
    this.cause = cause;
  }
}

function initializeWorkflow(tabId) {
  const now = new Date().toISOString();
  store.update(tabId, (entry = {}) => ({
    ...entry,
    workflow: {
      status: "running",
      currentStep: "extracting",
      startedAt: now,
      error: null,
      message: "",
      steps: {
        extracting: { status: "done", updatedAt: now },
        preparing: { status: "pending" },
        uploading: { status: "pending" },
        formatting: { status: "pending" },
        publishing: { status: "pending" },
      },
    },
  }));
  void emitArticleUpdate(tabId);
}

function mutateWorkflow(tabId, mutator) {
  store.update(tabId, (entry = {}) => {
    const previous = entry.workflow ?? {
      status: "idle",
      currentStep: "idle",
      steps: {},
      error: null,
      message: "",
    };
    const next = mutator(previous);
    return {
      ...entry,
      workflow: next,
    };
  });
  void emitArticleUpdate(tabId);
}

function setWorkflowStep(tabId, step, status, patch = {}, options = {}) {
  const { updateCurrent = true } = options;
  mutateWorkflow(tabId, (prev) => {
    const steps = { ...(prev.steps ?? {}) };
    const stepState = {
      ...(steps[step] ?? {}),
      status,
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    steps[step] = stepState;
    const next = {
      ...prev,
      steps,
    };
    if (updateCurrent) {
      next.currentStep = step;
    }
    if (status === "error") {
      next.status = "error";
      next.error = stepState.error || patch.error || prev.error || null;
    } else if (status === "done") {
      const unfinished = WORKFLOW_STEPS.filter((name) =>
        name !== "complete" && name !== step && steps[name]?.status !== "done",
      );
      if (!unfinished.length && steps.publishing?.status === "done") {
        next.currentStep = "complete";
      }
    } else if (status === "running") {
      next.status = "running";
    }
    return next;
  });
}

function setWorkflowCurrentStep(tabId, step) {
  mutateWorkflow(tabId, (prev) => ({
    ...prev,
    currentStep: step,
  }));
}

function setWorkflowError(tabId, step, message) {
  setWorkflowStep(tabId, step, "error", { error: message });
}

function finalizeWorkflowSuccess(tabId, message) {
  mutateWorkflow(tabId, (prev) => ({
    ...prev,
    status: "success",
    currentStep: "complete",
    message: message || prev.message || "流程完成",
    completedAt: new Date().toISOString(),
  }));
}

function createWorkflowPromise(tabId, executor) {
  if (activePipelines.has(tabId)) {
    return activePipelines.get(tabId);
  }
  const promise = (async () => {
    try {
      return await executor();
    } finally {
      activePipelines.delete(tabId);
    }
  })();
  activePipelines.set(tabId, promise);
  return promise;
}

async function startWashPipeline(tabId) {
  if (!tabId) return;
  return createWorkflowPromise(tabId, async () => {
    try {
      await runPreparationStage(tabId);
      const uploadContext = await runImageUpload(tabId);
      await runFormattingStage(tabId, uploadContext);
      await runPublishStage(tabId, uploadContext);
      finalizeWorkflowSuccess(tabId, "草稿已创建");
      await emitArticleUpdate(tabId);
    } catch (error) {
      const workflowError = error instanceof WorkflowError
        ? error
        : new WorkflowError("unknown", error?.message ?? String(error), error);
      setWorkflowError(tabId, workflowError.step || "unknown", workflowError.message);
      log("洗稿工作流失败", workflowError);
      throw workflowError;
    }
  });
}

async function runPreparationStage(tabId) {
  const currentSnapshot = store.get(tabId);
  if (!currentSnapshot || !Array.isArray(currentSnapshot.items) || currentSnapshot.items.length === 0) {
    throw new WorkflowError("extracting", "未找到可处理的正文内容");
  }

  setWorkflowStep(tabId, "preparing", "running");

  store.update(tabId, (entry = {}) => ({
    ...entry,
    translation: {
      status: "working",
      text: "",
      updatedAt: new Date().toISOString(),
      error: null,
    },
    titleTask: {
      status: "working",
      text: entry.titleTask?.text ?? "",
      updatedAt: new Date().toISOString(),
      error: null,
      warning: null,
    },
    formatted: null,
  }));
  await emitArticleUpdate(tabId);

  if (!translator.hasCredentials()) {
    const message = "请先在设置页配置 Gemini API Key";
    store.update(tabId, (entry = {}) => ({
      ...entry,
      translation: {
        status: "error",
        text: "",
        updatedAt: new Date().toISOString(),
        error: message,
      },
      titleTask: {
        status: "error",
        text: sanitizeTitle(currentSnapshot.title || deriveDefaultTitle(entry)),
        updatedAt: new Date().toISOString(),
        warning: message,
        error: message,
      },
    }));
    await emitArticleUpdate(tabId);
    throw new WorkflowError("preparing", message);
  }

  const sourceMarkdown = buildArticleText(currentSnapshot.items);
  const fallbackTitle = sanitizeTitle(
    derivePreparedTitle(currentSnapshot, sourceMarkdown),
  ) || "待确认标题";

  let translationResult;
  try {
    translationResult = await translator.translateArticle(sourceMarkdown, {
      sourceUrl: currentSnapshot.sourceUrl,
      fallbackTitle,
    });
  } catch (error) {
    const message = error?.message ?? String(error);
    store.update(tabId, (entry = {}) => ({
      ...entry,
      translation: {
        status: "error",
        text: "",
        updatedAt: new Date().toISOString(),
        error: message,
      },
      titleTask: {
        status: "error",
        text: fallbackTitle,
        updatedAt: new Date().toISOString(),
        warning: message,
        error: message,
      },
    }));
    await emitArticleUpdate(tabId);
    throw new WorkflowError("preparing", message, error);
  }

  const translatedText = translationResult?.text ? String(translationResult.text).trim() : "";
  const translationUpdatedAt = new Date().toISOString();
  store.update(tabId, (entry = {}) => ({
    ...entry,
    translation: {
      status: "done",
      text: translatedText,
      updatedAt: translationUpdatedAt,
      error: null,
    },
  }));
  await emitArticleUpdate(tabId);

  let titleResult;
  try {
    titleResult = await translator.generateTitle(translationResult.conversation, {
      sourceUrl: currentSnapshot.sourceUrl,
      fallbackTitle,
    });
  } catch (error) {
    const message = error?.message ?? String(error);
    store.update(tabId, (entry = {}) => ({
      ...entry,
      titleTask: {
        status: "error",
        text: fallbackTitle,
        updatedAt: new Date().toISOString(),
        warning: message,
        error: message,
      },
    }));
    await emitArticleUpdate(tabId);
    throw new WorkflowError("preparing", message, error);
  }

  const resolvedTitle = sanitizeTitle(titleResult?.text || fallbackTitle) || fallbackTitle;
  const completedAt = new Date().toISOString();
  log("内容整理完成", {
    tabId,
    chars: translatedText.length,
  });
  store.update(tabId, (entry = {}) => ({
    ...entry,
    translation: {
      status: "done",
      text: translatedText,
      updatedAt: completedAt,
      error: null,
    },
    titleTask: {
      status: "done",
      text: resolvedTitle,
      updatedAt: completedAt,
      warning: null,
      error: null,
    },
  }));
  try {
    setWorkflowStep(tabId, "preparing", "done");
    setWorkflowCurrentStep(tabId, "uploading");
    await syncHistoryEntry(tabId);
  } catch (error) {
    const message = error?.message ?? String(error);
    store.update(tabId, (entry = {}) => ({
      ...entry,
      titleTask: {
        status: "error",
        text: fallbackTitle,
        updatedAt: new Date().toISOString(),
        warning: message,
        error: message,
      },
    }));
    await emitArticleUpdate(tabId);
    throw new WorkflowError("preparing", message, error);
  }

  await emitArticleUpdate(tabId);
}

async function runImageUpload(tabId) {
  const current = store.get(tabId);
  if (!current?.cachedImages || current.cachedImages.length === 0) {
    throw new WorkflowError("uploading", "暂无缓存图片可上传");
  }
  if (!hasWeChatCredentials(currentSettings)) {
    throw new WorkflowError("uploading", "请先配置公众号 AppID 和 AppSecret");
  }

  setWorkflowStep(tabId, "uploading", "running");
  const sortedImages = sortImagesForUpload(current.cachedImages);
  const uploadable = sortedImages.filter((image) => image?.dataUrl || image?.url);
  if (!uploadable.length) {
    store.update(tabId, (entry = {}) => ({
      ...entry,
      wechatUploads: [],
    }));
    setWorkflowStep(tabId, "uploading", "done");
    await emitArticleUpdate(tabId);
    return { uploads: [], accessToken: currentSettings.wechatAccessToken || "" };
  }

  const attemptUpload = async (token) => {
    const uploads = await uploadImagesForWeChat(uploadable, {
      accessToken: token,
      dryRun: false,
    });
    const mergedImages = attachUploadsToImages(current.cachedImages, uploads);
    store.update(tabId, (entry = {}) => ({
      ...entry,
      cachedImages: mergedImages,
      wechatUploads: uploads,
    }));
    if (current.sourceUrl) {
      await saveImages(current.sourceUrl, mergedImages);
    }
    setWorkflowStep(tabId, "uploading", "done");
    await emitArticleUpdate(tabId);
    return { uploads, accessToken: token };
  };

  const ensureToken = async (refresh) => {
    let token = currentSettings.wechatAccessToken || "";
    if (!token || isWeChatTokenExpired(currentSettings) || refresh) {
      const refreshed = await refreshWeChatAccessToken({ forceRefresh: Boolean(refresh) });
      token = refreshed.accessToken || currentSettings.wechatAccessToken || "";
    }
    return token;
  };

  let accessToken;
  try {
    accessToken = await ensureToken(false);
  } catch (error) {
    const message = error?.message ?? String(error);
    throw new WorkflowError("uploading", message, error);
  }
  if (!accessToken) {
    throw new WorkflowError("uploading", "无法获取有效的 Access Token");
  }

  try {
    return await attemptUpload(accessToken);
  } catch (error) {
    if (!isWeChatTokenError(error)) {
      const message = error?.message ?? String(error);
      throw new WorkflowError("uploading", message, error);
    }
    try {
      accessToken = await ensureToken(true);
    } catch (refreshError) {
      const message = refreshError?.message ?? String(refreshError);
      throw new WorkflowError("uploading", message, refreshError);
    }
    if (!accessToken) {
      throw new WorkflowError("uploading", "无法刷新 Access Token");
    }
    try {
      return await attemptUpload(accessToken);
    } catch (retryError) {
      const message = retryError?.message ?? String(retryError);
      throw new WorkflowError("uploading", message, retryError);
    }
  }
}

async function runFormattingStage(tabId, context) {
  setWorkflowStep(tabId, "formatting", "running");
  try {
    await generateFormattedOutput(tabId, context?.uploads || []);
    await syncHistoryEntry(tabId);
    setWorkflowStep(tabId, "formatting", "done");
    setWorkflowCurrentStep(tabId, "publishing");
    await emitArticleUpdate(tabId);
  } catch (error) {
    const message = error?.message ?? String(error);
    throw new WorkflowError("formatting", message, error);
  }
}

async function runPublishStage(tabId, context) {
  setWorkflowStep(tabId, "publishing", "running");
  const current = store.get(tabId);
  if (!current?.translation || current.translation.status !== "done") {
    throw new WorkflowError("publishing", "正文整理尚未完成，无法创建草稿");
  }
  if (!current?.formatted || !current.formatted.html) {
    throw new WorkflowError("publishing", "排版结果尚未生成");
  }
  const ensureToken = async (refresh, fallback) => {
    let token = fallback || currentSettings.wechatAccessToken || "";
    if (!token || isWeChatTokenExpired(currentSettings) || refresh) {
      const refreshed = await refreshWeChatAccessToken({ forceRefresh: Boolean(refresh) });
      token = refreshed.accessToken || currentSettings.wechatAccessToken || "";
    }
    return token;
  };

  const performDraftCreation = async (token) => {
    const resolvedTitle = sanitizeTitle(current.titleTask?.text || deriveDefaultTitle(current)) || "待确认标题";
    const metadata = {
      title: resolvedTitle,
      author: currentSettings.wechatDefaultAuthor || "",
      digest: buildDigestFromTranslation(current.translation?.text || ""),
      sourceUrl: currentSettings.wechatOriginUrl || current.sourceUrl || "",
      needOpenComment: false,
      onlyFansCanComment: false,
      thumbMediaId:
        currentSettings.wechatThumbMediaId || context?.uploads?.[0]?.mediaId || "",
    };

    if (!metadata.thumbMediaId) {
      throw new Error("缺少封面素材 ID，可在设置中指定默认 thumb_media_id");
    }

    const draft = await createWeChatDraft(
      {
        formatted: current.formatted,
        translation: current.translation,
        metadata,
        sourceUrl: current.sourceUrl,
      },
      context?.uploads || [],
      {
        accessToken: token,
        dryRun: false,
      },
    );

    const draftContent = draft?.payload?.articles?.[0]?.content;
    if (draftContent) {
      store.update(tabId, (entry = {}) => ({
        ...entry,
        formatted: {
          ...(entry.formatted || {}),
          html: draftContent,
        },
      }));
    }

    store.update(tabId, (entry = {}) => ({
      ...entry,
      wechatDraft: draft,
    }));
    setWorkflowStep(tabId, "publishing", "done");
    await syncHistoryEntry(tabId);
    await emitArticleUpdate(tabId);
  };

  let accessToken;
  try {
    accessToken = await ensureToken(false, context?.accessToken);
  } catch (error) {
    const message = error?.message ?? String(error);
    throw new WorkflowError("publishing", message, error);
  }
  if (!accessToken) {
    throw new WorkflowError("publishing", "缺少 Access Token");
  }

  try {
    await performDraftCreation(accessToken);
  } catch (error) {
    if (!isWeChatTokenError(error)) {
      const message = error?.message ?? String(error);
      throw new WorkflowError("publishing", message, error);
    }
    try {
      accessToken = await ensureToken(true);
      if (!accessToken) {
        throw new Error("无法刷新 Access Token");
      }
      await performDraftCreation(accessToken);
    } catch (retryError) {
      const message = retryError?.message ?? String(retryError);
      throw new WorkflowError("publishing", message, retryError);
    }
  }
}

function sortImagesForUpload(images = []) {
  return [...images]
    .map((img, index) => ({ img, index }))
    .sort((a, b) => {
      const seqA = Number.isFinite(a.img?.sequence) ? Number(a.img.sequence) : Number.MAX_SAFE_INTEGER;
      const seqB = Number.isFinite(b.img?.sequence) ? Number(b.img.sequence) : Number.MAX_SAFE_INTEGER;
      if (seqA !== seqB) {
        return seqA - seqB;
      }
      if (a.index !== b.index) {
        return a.index - b.index;
      }
      return (a.img?.url || "").localeCompare(b.img?.url || "");
    })
    .map((entry) => entry.img);
}

function attachUploadsToImages(images = [], uploads = []) {
  if (!uploads.length) {
    return images;
  }
  const byUrl = new Map();
  for (const upload of uploads) {
    if (upload?.localSrc) {
      byUrl.set(upload.localSrc, upload);
    }
    if (upload?.url) {
      byUrl.set(upload.url, upload);
    }
  }
  const merged = images.map((image) => {
    const upload = byUrl.get(image.dataUrl) || byUrl.get(image.url);
    if (!upload) {
      return image;
    }
    return {
      ...image,
      remoteUrl: upload.remoteUrl || upload.url || image.remoteUrl || image.url,
      mediaId: upload.mediaId || image.mediaId || "",
      uploadedAt: upload.uploadedAt || new Date().toISOString(),
    };
  });
  return sortImagesForUpload(merged);
}

async function handleWeChatDraftRequest(tabId, payload) {
  const current = store.get(tabId);
  if (!current || !Array.isArray(current.items) || current.items.length === 0) {
    throw new Error("请先提取正文内容");
  }
  if (!current.translation || current.translation.status !== "done") {
    throw new Error("请先完成正文整理");
  }

  const acquireToken = async (refresh) => {
    let token = currentSettings.wechatAccessToken || "";
    if (!token || isWeChatTokenExpired(currentSettings) || refresh) {
      try {
        const refreshed = await refreshWeChatAccessToken({ forceRefresh: Boolean(refresh) });
        token = refreshed.accessToken || currentSettings.wechatAccessToken || "";
      } catch (error) {
        log("尝试获取 Access Token 失败：", error);
        token = "";
      }
    }
    return token;
  };

  let ensuredToken = await acquireToken(false);
  const dryRun = Boolean(payload.dryRun || !ensuredToken);
  const metadata = {
    title: payload.metadata?.title || current.title || deriveDefaultTitle(current),
    author: payload.metadata?.author || currentSettings.wechatDefaultAuthor || "",
    digest: payload.metadata?.digest || buildDigestFromTranslation(current.translation?.text || ""),
    sourceUrl:
      payload.metadata?.sourceUrl || currentSettings.wechatOriginUrl || current.sourceUrl || "",
    needOpenComment: Boolean(payload.metadata?.needOpenComment),
    onlyFansCanComment: Boolean(payload.metadata?.onlyFansCanComment),
    thumbMediaId: payload.metadata?.thumbMediaId || currentSettings.wechatThumbMediaId || "",
  };

  const attempt = async (token) => {
    const uploads = await uploadImagesForWeChat(current.cachedImages || [], {
      accessToken: token,
      dryRun,
    });

    store.update(tabId, (entry = {}) => ({
      ...entry,
      wechatUploads: uploads,
      cachedImages: attachUploadsToImages(entry.cachedImages || [], uploads),
    }));

    await generateFormattedOutput(tabId, uploads);

    const draft = await createWeChatDraft(
      {
        formatted: current.formatted,
        translation: current.translation,
        metadata,
        sourceUrl: current.sourceUrl,
      },
      uploads,
      {
        accessToken: token,
        dryRun,
      },
    );

    return {
      draft,
      uploads,
    };
  };

  try {
    const { draft } = await attempt(ensuredToken);
    return {
      dryRun: draft.dryRun ?? dryRun,
      draft,
    };
  } catch (error) {
    if (dryRun || !isWeChatTokenError(error)) {
      throw error;
    }
    ensuredToken = await acquireToken(true);
    if (!ensuredToken) {
      throw error;
    }
    const { draft } = await attempt(ensuredToken);
    return {
      dryRun: draft.dryRun ?? dryRun,
      draft,
    };
  }
}

async function generateFormattedOutput(tabId, uploads = null) {
  const current = store.get(tabId);
  if (!current?.translation || current.translation.status !== "done") {
    return;
  }
  try {
    const effectiveUploads = Array.isArray(uploads) && uploads.length
      ? uploads
      : Array.isArray(current.wechatUploads)
        ? current.wechatUploads
        : [];
    const enrichedImages = attachUploadsToImages(current.cachedImages || [], effectiveUploads);
    const formatted = formatter.format({
      articleText: current.translation.text,
      items: current.items || [],
      images: enrichedImages,
      uploads: effectiveUploads,
    });
    store.update(tabId, (entry = {}) => ({
      ...entry,
      formatted,
      cachedImages: enrichedImages,
    }));
    await sendMessageSafely({
      type: "wash-articles/formatted-updated",
      payload: {
        sourceUrl: current.sourceUrl,
        formatted,
      },
    });
  } catch (error) {
    log("排版生成失败", error);
  }
}

async function syncHistoryEntry(tabId) {
  const current = store.get(tabId);
  if (!current?.sourceUrl) {
    return;
  }
  const entry = buildHistoryEntry(current, current.cachedImages || []);
  await appendHistory(entry);
  await broadcastHistory();
}

async function emitArticleUpdate(tabId) {
  const current = store.get(tabId);
  if (!current?.sourceUrl) {
    return;
  }
  await sendMessageSafely({
    type: "wash-articles/translation-updated",
    payload: {
      sourceUrl: current.sourceUrl,
      translation: current.translation ?? null,
      titleTask: current.titleTask ?? null,
      formatted: current.formatted ?? null,
      workflow: current.workflow ?? null,
      wechatDraft: current.wechatDraft ?? null,
      wechatUploads: current.wechatUploads ?? [],
    },
  });
}

async function initializeSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const settings = normalizeSettings(result[SETTINGS_KEY]);
    await updateSettings(settings);
  } catch (error) {
    throw error;
  }
}

async function updateSettings(settings) {
  const previous = currentSettings;
  currentSettings = settings;
  translator.updateSettings(currentSettings);
  if (skipWeChatAutoRefresh) {
    skipWeChatAutoRefresh = false;
  } else {
    try {
      await maybeAutoRefreshWeChatToken(previous, settings);
    } catch (error) {
      log("自动刷新公众号 Access Token 失败：", error);
    }
  }
  await sendSettingsUpdate();
}

async function sendSettingsUpdate() {
  const sanitized = sanitizeSettings(currentSettings);
  await sendMessageSafely({ type: "wash-articles/settings-updated", settings: sanitized });
}

async function broadcastHistory() {
  const history = await loadHistory();
  await sendMessageSafely({ type: "wash-articles/history-updated", history });
  return history;
}

function findTabIdBySource(sourceUrl) {
  if (!sourceUrl) {
    return null;
  }
  for (const { tabId, payload } of store.entries()) {
    if (payload?.sourceUrl === sourceUrl) {
      return tabId;
    }
  }
  return null;
}

async function exportEntry(sourceUrl, format) {
  const history = await loadHistory();
  const entry = history.find((item) => item.sourceUrl === sourceUrl);
  if (!entry) {
    throw new Error("未找到对应历史记录");
  }
  const filenameBase = buildFilenameBase(entry);
  if (format === "markdown" || format === "md") {
    const content = entry.formatted?.markdown || entryToMarkdown(entry);
    await downloadBlob(`${filenameBase}.md`, content, "text/markdown");
    return;
  }
  const json = JSON.stringify(entry, null, 2);
  await downloadBlob(`${filenameBase}.json`, json, "application/json");
}

function buildHistoryEntry(payload, images) {
  const counts = computeCounts(payload?.items);
  return {
    sourceUrl: payload?.sourceUrl || "",
    title: payload?.title || "",
    capturedAt: payload?.capturedAt || new Date().toISOString(),
    counts,
    items: Array.isArray(payload?.items) ? payload.items : [],
    images: Array.isArray(images) ? images : [],
    titleTask: payload?.titleTask
      ? {
          status: payload.titleTask.status,
          text: payload.titleTask.text,
          updatedAt: payload.titleTask.updatedAt,
          error: payload.titleTask.error ?? null,
          warning: payload.titleTask.warning ?? null,
        }
      : null,
    translation: payload?.translation
      ? {
          status: payload.translation.status,
          text: payload.translation.text,
          updatedAt: payload.translation.updatedAt,
          error: payload.translation.error ?? null,
        }
      : null,
    formatted: payload?.formatted
      ? {
          html: payload.formatted.html,
          markdown: payload.formatted.markdown,
          updatedAt: payload.formatted.updatedAt,
        }
      : null,
    wechatUploads: Array.isArray(payload?.wechatUploads) ? payload.wechatUploads : [],
    wechatDraft: payload?.wechatDraft
      ? {
          media_id: payload.wechatDraft.media_id,
          dryRun: Boolean(payload.wechatDraft.dryRun),
          createdAt: new Date().toISOString(),
        }
      : null,
  };
}

function computeCounts(items) {
  const counters = { paragraphs: 0, images: 0, headings: 0 };
  if (!Array.isArray(items)) {
    return counters;
  }
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "paragraph") counters.paragraphs += 1;
    else if (item.kind === "image") counters.images += 1;
    else if (item.kind === "heading") counters.headings += 1;
  }
  return counters;
}

async function downloadFormatted(sourceUrl, format) {
  const history = await loadHistory();
  const entry = history.find((item) => item.sourceUrl === sourceUrl);
  if (!entry) {
    throw new Error("未找到对应历史记录");
  }
  if (!entry.formatted) {
    throw new Error("当前记录尚未生成排版结果");
  }
  const filenameBase = buildFilenameBase(entry);
  if (format === "markdown") {
    const content = entry.formatted.markdown || entryToMarkdown(entry);
    await downloadBlob(`${filenameBase}.formatted.md`, content, "text/markdown");
    return;
  }
  if (format === "html") {
    const htmlBody = entry.formatted.html || "<article></article>";
    const documentHtml = wrapHtmlDocument(entry.title || "Wash Articles", htmlBody);
    await downloadBlob(`${filenameBase}.formatted.html`, documentHtml, "text/html");
    return;
  }
  throw new Error(`不支持的导出格式: ${format}`);
}

async function downloadBlob(filename, content, mimeType) {
  const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  await new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: dataUrl,
        filename,
        saveAs: true,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!downloadId && downloadId !== 0) {
          reject(new Error("下载任务未创建"));
          return;
        }
        resolve(downloadId);
      },
    );
  });
}

function wrapHtmlDocument(title, bodyHtml) {
  const safeTitle = escapeHtmlText(title || "Wash Articles");
  return `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8" />\n<title>${safeTitle}</title>\n<style>body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f8fafc;color:#0f172a;}article{max-width:780px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,0.12);}h2,h3,h4{margin:24px 0 12px;}p{line-height:1.7;margin:16px 0;}figure{margin:24px 0;text-align:center;}figure img{max-width:100%;border-radius:12px;}figcaption{margin-top:8px;font-size:13px;color:#475569;}</style>\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>`;
}

function escapeHtmlText(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildArticleText(items) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }
  const segments = [];
  let fallbackImageSeq = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "heading") {
      const level = Math.min(Math.max(Number(item.level) || 2, 2), 6);
      const text = String(item.text ?? "").trim();
      if (text) {
        segments.push(`${"#".repeat(level)} ${text}`);
      }
      continue;
    }
    if (item.kind === "paragraph") {
      const text = String(item.text ?? "").trim();
      if (text) {
        segments.push(text);
      }
      continue;
    }
    if (item.kind === "image") {
      const seq = Number.isFinite(item.sequence)
        ? Number(item.sequence)
        : (++fallbackImageSeq);
      segments.push(`{{[Image ${seq}]}}`);
    }
  }
  return segments.join("\n\n");
}

function derivePreparedTitle(snapshot, articleText) {
  if (snapshot?.title) {
    return snapshot.title;
  }
  if (Array.isArray(snapshot?.items)) {
    const heading = snapshot.items.find((item) => item?.kind === "heading" && item.text);
    if (heading?.text) {
      return heading.text;
    }
  }
  if (articleText) {
    const firstLine = articleText.split(/\r?\n/).find((line) => line.trim());
    if (firstLine) {
      return firstLine.trim();
    }
  }
  return "待确认标题";
}

function sanitizeTitle(title) {
  if (!title) return "";
  const cleaned = String(title)
    .replace(/[“”"'<>\u300a\u300b《》]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[。！？!?、,.，；;:：]+$/u, "")
    .trim();
  if (!cleaned) return "";
  const chars = Array.from(cleaned);
  return chars.slice(0, 22).join("");
}

function entryToMarkdown(entry) {
  const lines = [];
  const title = entry?.title ? entry.title.trim() : "无标题";
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- 来源：${entry?.sourceUrl || "未知"}`);
  lines.push(`- 采集时间：${entry?.capturedAt || "未知"}`);
  if (entry?.counts) {
    lines.push(
      `- 统计：段落 ${entry.counts.paragraphs} · 小标题 ${entry.counts.headings} · 图片 ${entry.counts.images}`,
    );
  }
  lines.push("");
  const items = Array.isArray(entry?.items) ? entry.items : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "heading") {
      const level = item.level && Number.isFinite(Number(item.level)) ? Number(item.level) : 2;
      const hashes = "#".repeat(Math.min(Math.max(level, 2), 6));
      lines.push(`${hashes} ${item.text || ""}`);
      lines.push("");
    } else if (item.kind === "paragraph") {
      lines.push(item.text || "");
      lines.push("");
    } else if (item.kind === "image") {
      const alt = item.alt || "图片";
      const caption = item.caption ? `
> ${item.caption}` : "";
      lines.push(`![${alt}](${item.url || ""})${caption}`.trim());
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildDigestFromTranslation(text) {
  if (!text) return "";
  const plain = String(text).replace(/\s+/g, " ").trim();
  return plain.slice(0, 120);
}

function deriveDefaultTitle(current) {
  if (current?.title) {
    return current.title;
  }
  const items = Array.isArray(current?.items) ? current.items : [];
  const heading = items.find((item) => item?.kind === "heading" && item.text);
  if (heading?.text) {
    return heading.text;
  }
  const translation = current?.translation?.text || "";
  const firstLine = translation.split(/\r?\n/).find((line) => line.trim());
  if (firstLine) {
    return firstLine.trim().slice(0, 60);
  }
  return "待确认标题";
}

function mergeImages(existing = [], downloads = []) {
  const byUrl = new Map();
  for (const img of existing || []) {
    if (img?.url) {
      byUrl.set(img.url, img);
    }
  }
  for (const img of downloads || []) {
    if (img?.url) {
      byUrl.set(img.url, img);
    }
  }
  return sortImagesForUpload(Array.from(byUrl.values()));
}

async function fetchImage(url, tabId) {
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || "application/octet-stream";
    return {
      mimeType,
      size: buffer.byteLength,
      dataUrl: `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (Number.isInteger(tabId)) {
      try {
        const captured = await captureImageViaContentScript(tabId, url);
        if (captured) {
          return captured;
        }
      } catch (fallbackError) {
        const combined = new Error(fallbackError?.message ?? String(fallbackError));
        combined.cause = error;
        throw combined;
      }
    }
    throw error;
  }
}

async function captureImageViaContentScript(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      {
        type: "wash-articles/capture-image",
        payload: { url },
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!response || response.ok !== true || !response.dataUrl) {
          reject(new Error(response?.error || "图像捕获失败"));
          return;
        }
        const dataUrl = response.dataUrl;
        const mimeType =
          response.mimeType ||
          (typeof dataUrl === "string" && dataUrl.includes(";base64,")
            ? dataUrl.split(";")[0].split(":")[1] || "image/png"
            : "image/png");
        const sizeBytes = response.sizeBytes ?? estimateDataUrlSize(dataUrl);
        resolve({
          mimeType,
          size: sizeBytes,
          dataUrl,
          fetchedAt: new Date().toISOString(),
        });
      },
    );
  });
}

function estimateDataUrlSize(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const base64 = dataUrl.split(",")[1] || "";
  if (!base64) return 0;
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function buildFilenameBase(entry) {
  const url = entry?.sourceUrl ? new URL(entry.sourceUrl, "https://example.com") : null;
  const host = url ? url.hostname.replace(/^www\./, "") : "content";
  const title = entry?.title ? entry.title : host;
  const timestamp = entry?.capturedAt ? entry.capturedAt.replace(/[:T]/g, "-").split(".")[0] : Date.now();
  return `${slugify(title)}_${timestamp}_${slugify(host)}`;
}

function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[^\w\d_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "entry";
}

function broadcastToPorts(message) {
  for (const port of Array.from(ports)) {
    try {
      port.postMessage(message);
    } catch (error) {
      ports.delete(port);
      log("广播至视图失败，移除端口：", error);
    }
  }
}

function sendMessageSafely(message) {
  broadcastToPorts(message);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        const msg = String(error.message || "");
        if (
          !msg.includes("The message port closed before a response was received.") &&
          !msg.includes("Could not establish connection. Receiving end does not exist.")
        ) {
          log("发送消息失败（可忽略）", msg);
        }
      }
      resolve();
    });
  });
}

async function maybeAutoRefreshWeChatToken(previous, next) {
  if (!hasWeChatCredentials(next)) {
    if (next.wechatAccessToken || next.wechatTokenExpiresAt) {
      await clearWeChatToken();
    }
    return;
  }

  const credentialsChanged =
    previous?.wechatAppId !== next.wechatAppId || previous?.wechatAppSecret !== next.wechatAppSecret;
  if (credentialsChanged) {
    await clearWeChatToken();
  }
}

function hasWeChatCredentials(settings) {
  return Boolean(settings?.wechatAppId && settings?.wechatAppSecret);
}

function isWeChatTokenExpired(settings) {
  if (!settings?.wechatAccessToken) {
    return true;
  }
  const expiresAt = parseDate(settings.wechatTokenExpiresAt);
  if (!expiresAt) {
    return true;
  }
  return expiresAt.getTime() <= Date.now() + WECHAT_TOKEN_REFRESH_MARGIN_MS;
}

function isWeChatTokenError(error) {
  const code = Number(
    error?.errcode ??
      error?.errorCode ??
      (typeof error?.status === "number" ? error.status : NaN),
  );
  if (Number.isNaN(code)) {
    const message = (error?.message || "").toLowerCase();
    return message.includes("access_token") && message.includes("invalid");
  }
  return [40001, 40014, 42001, 42002, 42003].includes(code);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

async function clearWeChatToken() {
  if (!currentSettings.wechatAccessToken && !currentSettings.wechatTokenExpiresAt) {
    return;
  }
  await applySettingsPatch({
    wechatAccessToken: "",
    wechatTokenExpiresAt: null,
  });
}

async function applySettingsPatch(patch) {
  skipWeChatAutoRefresh = true;
  const updated = {
    ...currentSettings,
    ...patch,
    wechatUpdatedAt: new Date().toISOString(),
  };
  currentSettings = updated;
  translator.updateSettings(currentSettings);
  try {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
  } catch (error) {
    skipWeChatAutoRefresh = false;
    throw error;
  }
  return updated;
}

async function refreshWeChatAccessToken({ forceRefresh = false } = {}) {
  if (wechatTokenRefreshPromise) {
    return wechatTokenRefreshPromise;
  }
  wechatTokenRefreshPromise = (async () => {
    if (!hasWeChatCredentials(currentSettings)) {
      throw new Error("请先配置 AppID 与 AppSecret");
    }

    if (
      !forceRefresh &&
      currentSettings.wechatAccessToken &&
      !isWeChatTokenExpired(currentSettings)
    ) {
      return {
        accessToken: currentSettings.wechatAccessToken,
        expiresAt: currentSettings.wechatTokenExpiresAt,
        fromCache: true,
      };
    }

    const requestPayload = {
      grant_type: "client_credential",
      appid: currentSettings.wechatAppId,
      secret: currentSettings.wechatAppSecret,
    };
    if (forceRefresh) {
      requestPayload.force_refresh = true;
    }

    const response = await fetch(WECHAT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      cache: "no-store",
    });
    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (error) {
      throw new Error("Access Token 响应解析失败");
    }

    if (!response.ok) {
      const code = responsePayload?.errcode ?? response.status;
      const message = responsePayload?.errmsg || `HTTP ${response.status}`;
      const err = new Error(`Access Token 获取失败（errcode=${code}）：${message}`);
      err.errcode = code;
      err.errmsg = message;
      throw err;
    }

    const token = responsePayload?.access_token;
    if (!token) {
      const code = responsePayload?.errcode ?? "unknown";
      const message = responsePayload?.errmsg || "接口未返回 access_token";
      const err = new Error(`Access Token 获取失败（errcode=${code}）：${message}`);
      err.errcode = code;
      err.errmsg = message;
      throw err;
    }

    const expiresInSeconds = Number(responsePayload.expires_in) || 7200;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const patched = await applySettingsPatch({
      wechatAccessToken: token,
      wechatTokenExpiresAt: expiresAt,
    });

    return {
      accessToken: token,
      expiresAt,
      settings: patched,
      fromCache: false,
    };
  })()
    .catch((error) => {
      log("获取公众号 Access Token 失败", error);
      throw error;
    })
    .finally(() => {
      wechatTokenRefreshPromise = null;
    });
  return wechatTokenRefreshPromise;
}

function sanitizeSettings(settings) {
  const normalized = normalizeSettings(settings);
  return {
    updatedAt: normalized.updatedAt,
    wechatHasCredentials: Boolean(normalized.wechatAppId && normalized.wechatAppSecret),
    wechatConfigured: Boolean(normalized.wechatAccessToken),
    wechatMaskedToken: maskToken(normalized.wechatAccessToken),
    wechatTokenExpiresAt: normalized.wechatTokenExpiresAt,
    wechatUpdatedAt: normalized.wechatUpdatedAt,
    wechatDefaultAuthor: normalized.wechatDefaultAuthor || "",
    wechatOriginUrl: normalized.wechatOriginUrl || "",
    geminiConfigured: Boolean(normalized.geminiApiKey),
    geminiUpdatedAt: normalized.geminiUpdatedAt,
  };
}

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
import { TranslatorService } from "./translator.js";
import {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  normalizeSettings,
  maskApiKey,
} from "../shared/settings.js";

const store = new ContentStore();
const translator = new TranslatorService();
let currentSettings = { ...DEFAULT_SETTINGS };
const ports = new Set();

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
        const enriched = {
          ...message.payload,
          counts: computeCounts(message.payload.items),
        };
        store.set(tabId, enriched);
        log(
          "收到内容并缓存：",
          tabId,
          enriched?.items?.length ?? 0,
          "images=",
          enriched?.counts?.images ?? 0,
        );
        void cacheImagesForPayload(tabId, enriched);
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
    case "wash-articles/translate": {
      const sourceUrl = message.payload?.sourceUrl || null;
      const targetTabId =
        tabId ?? findTabIdBySource(sourceUrl) ?? store.entries()[0]?.tabId ?? null;
      if (!targetTabId) {
        sendResponse({ ok: false, error: "无法识别标签" });
        return false;
      }
      handleTranslateRequest(targetTabId)
        .then(() => sendResponse({ ok: true }))
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
    return;
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
        const downloaded = await fetchImage(candidate.url);
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
  } catch (error) {
    log("缓存图片时出错：", error);
  }
}

async function handleTranslateRequest(tabId) {
  const current = store.get(tabId);
  if (!current || !Array.isArray(current.items) || current.items.length === 0) {
    throw new Error("请先提取正文内容");
  }

  store.update(tabId, (entry = {}) => ({
    ...entry,
    translation: {
      ...(entry.translation ?? {}),
      status: "working",
      model: translator.settings.model,
      updatedAt: new Date().toISOString(),
      error: null,
    },
  }));
  await emitTranslationUpdate(tabId);

  try {
    const result = await translator.translateContent(current.items, {
      sourceUrl: current.sourceUrl,
      title: current.title,
    });

    store.update(tabId, (entry = {}) => ({
      ...entry,
      translation: {
        status: "done",
        text: result.text,
        model: result.model,
        updatedAt: result.updatedAt,
        error: null,
      },
    }));

    await syncHistoryEntry(tabId);
    await emitTranslationUpdate(tabId);
  } catch (error) {
    const message = error?.message ?? String(error);
    store.update(tabId, (entry = {}) => ({
      ...entry,
      translation: {
        ...(entry.translation ?? {}),
        status: "error",
        error: message,
        updatedAt: new Date().toISOString(),
      },
    }));
    await emitTranslationUpdate(tabId);
    throw new Error(message);
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

async function emitTranslationUpdate(tabId) {
  const current = store.get(tabId);
  if (!current?.sourceUrl) {
    return;
  }
  await sendMessageSafely({
    type: "wash-articles/translation-updated",
    payload: {
      sourceUrl: current.sourceUrl,
      translation: current.translation ?? null,
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
  currentSettings = settings;
  translator.updateSettings(settings);
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
    const content = entryToMarkdown(entry);
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
    translation: payload?.translation
      ? {
          status: payload.translation.status,
          text: payload.translation.text,
          model: payload.translation.model,
          updatedAt: payload.translation.updatedAt,
          error: payload.translation.error ?? null,
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
  return Array.from(byUrl.values());
}

async function fetchImage(url) {
  const response = await fetch(url, {
    credentials: "include",
    mode: "cors",
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
        if (!msg.includes("The message port closed before a response was received.")) {
          log("发送消息失败（可忽略）", msg);
        }
      }
      resolve();
    });
  });
}

function sanitizeSettings(settings) {
  const normalized = normalizeSettings(settings);
  return {
    hasApiKey: Boolean(normalized.apiKey),
    model: normalized.model,
    updatedAt: normalized.updatedAt,
    maskedKey: maskApiKey(normalized.apiKey),
  };
}

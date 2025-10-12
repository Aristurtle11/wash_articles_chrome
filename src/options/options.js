import { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const geminiForm = document.getElementById("gemini-form");
const geminiApiKeyInput = document.getElementById("geminiApiKey");
const geminiSaveBtn = document.getElementById("gemini-save");
const geminiClearBtn = document.getElementById("gemini-clear");
const geminiStatusEl = document.getElementById("gemini-status");

const wechatForm = document.getElementById("wechat-form");
const wechatAppIdInput = document.getElementById("wechatAppId");
const wechatAppSecretInput = document.getElementById("wechatAppSecret");
const wechatDefaultAuthorInput = document.getElementById("wechatDefaultAuthor");
const wechatOriginUrlInput = document.getElementById("wechatOriginUrl");
const wechatThumbMediaIdInput = document.getElementById("wechatThumbMediaId");
const wechatSaveBtn = document.getElementById("wechat-save");
const wechatClearBtn = document.getElementById("wechat-clear");
const wechatStatusEl = document.getElementById("wechat-status");

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);

    geminiApiKeyInput.value = current.geminiApiKey || "";
    geminiStatusEl.textContent = buildGeminiStatus(current);
    geminiStatusEl.classList.remove("error");

    wechatAppIdInput.value = current.wechatAppId || "";
    wechatAppSecretInput.value = current.wechatAppSecret || "";
    wechatDefaultAuthorInput.value = current.wechatDefaultAuthor || "";
    wechatOriginUrlInput.value = current.wechatOriginUrl || "";
    wechatThumbMediaIdInput.value = current.wechatThumbMediaId || "";
    wechatStatusEl.textContent = buildWechatStatus(current);
    wechatStatusEl.classList.remove("error");
  } catch (error) {
    const msg = error?.message ?? String(error);
    geminiStatusEl.textContent = `加载失败：${msg}`;
    geminiStatusEl.classList.add("error");
    wechatStatusEl.textContent = `加载失败：${msg}`;
    wechatStatusEl.classList.add("error");
  }
}

function formatDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  } catch (error) {
    return value;
  }
  return value;
}

function buildGeminiStatus(settings) {
  if (!settings) return "尚未配置 Gemini API Key";
  if (settings.geminiApiKey) {
    return settings.geminiUpdatedAt
      ? `Gemini API Key 已配置（更新于 ${formatDate(settings.geminiUpdatedAt)}）`
      : "Gemini API Key 已配置";
  }
  return "尚未配置 Gemini API Key";
}

function buildWechatStatus(settings) {
  if (!settings) return "尚未配置公众号信息";
  if (!settings.wechatAppId || !settings.wechatAppSecret) {
    return "尚未配置 AppID / AppSecret";
  }
  if (!settings.wechatAccessToken && !settings.wechatTokenExpiresAt) {
    return "已保存凭证，等待获取 Access Token";
  }
  if (settings.wechatTokenExpiresAt) {
    return `Access Token 将于 ${formatDate(settings.wechatTokenExpiresAt)} 过期`;
  }
  return "Access Token 已缓存";
}

async function saveGeminiSettings(event) {
  event.preventDefault();
  const apiKey = geminiApiKeyInput.value.trim();
  try {
    geminiStatusEl.textContent = "正在保存配置…";
    geminiStatusEl.classList.remove("error");
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    const updated = {
      ...DEFAULT_SETTINGS,
      ...current,
      geminiApiKey: apiKey,
      geminiModel: DEFAULT_SETTINGS.geminiModel,
      geminiUpdatedAt: new Date().toISOString(),
    };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    geminiStatusEl.textContent = apiKey ? "Gemini API Key 已保存" : "Gemini 配置已更新";
    geminiStatusEl.classList.remove("error");
    await loadSettings();
  } catch (error) {
    geminiStatusEl.textContent = `保存失败：${error?.message ?? error}`;
    geminiStatusEl.classList.add("error");
  }
}

async function clearGeminiSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    const updated = {
      ...current,
      geminiApiKey: "",
      geminiUpdatedAt: new Date().toISOString(),
    };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    geminiApiKeyInput.value = "";
    geminiStatusEl.textContent = "Gemini 配置已清除";
    geminiStatusEl.classList.remove("error");
  } catch (error) {
    geminiStatusEl.textContent = `清除失败：${error?.message ?? error}`;
    geminiStatusEl.classList.add("error");
  }
}

function refreshWechatToken(forceRefresh) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "wash-articles/wechat-refresh-token",
        payload: { forceRefresh },
      },
      (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response || {});
      },
    );
  });
}

async function saveWechatSettings(event) {
  event.preventDefault();
  const appId = wechatAppIdInput.value.trim();
  const appSecret = wechatAppSecretInput.value.trim();
  const defaultAuthor = wechatDefaultAuthorInput.value.trim();
  const originUrl = wechatOriginUrlInput.value.trim();
  const thumbMediaId = wechatThumbMediaIdInput.value.trim();
  try {
    wechatStatusEl.textContent = "正在保存配置…";
    wechatStatusEl.classList.remove("error");
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    const credentialsChanged =
      current.wechatAppId !== appId || current.wechatAppSecret !== appSecret;
    const hadToken = Boolean(current.wechatAccessToken);
    const updated = {
      ...DEFAULT_SETTINGS,
      ...current,
      wechatAppId: appId,
      wechatAppSecret: appSecret,
      wechatDefaultAuthor: defaultAuthor,
      wechatOriginUrl: originUrl,
      wechatThumbMediaId: thumbMediaId,
      wechatUpdatedAt: new Date().toISOString(),
    };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    if (appId && appSecret) {
      wechatStatusEl.textContent = "正在申请 Access Token…";
      const response = await refreshWechatToken(credentialsChanged || !hadToken);
      if (!response?.ok) {
        const reason = response?.error || "未知错误";
        const code = response?.errorCode;
        const message = code ? `Access Token 获取失败（errcode=${code}）：${reason}` : reason;
        throw new Error(message);
      }
      const merged = {
        ...updated,
        wechatAccessToken: response.accessToken || updated.wechatAccessToken || "",
        wechatTokenExpiresAt: response.expiresAt || updated.wechatTokenExpiresAt || null,
      };
      wechatStatusEl.textContent = buildWechatStatus(merged);
      wechatStatusEl.classList.remove("error");
    } else {
      wechatStatusEl.textContent = "公众号配置已保存（未填写凭证）";
      wechatStatusEl.classList.remove("error");
    }
    await loadSettings();
  } catch (error) {
    wechatStatusEl.textContent = `保存失败：${error?.message ?? error}`;
    wechatStatusEl.classList.add("error");
  }
}

async function clearWechatSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    const updated = {
      ...current,
      wechatAppId: "",
      wechatAppSecret: "",
      wechatAccessToken: "",
      wechatTokenExpiresAt: null,
      wechatDefaultAuthor: "",
      wechatOriginUrl: "",
      wechatThumbMediaId: "",
      wechatUpdatedAt: new Date().toISOString(),
    };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    wechatAppIdInput.value = "";
    wechatAppSecretInput.value = "";
    wechatDefaultAuthorInput.value = "";
    wechatOriginUrlInput.value = "";
    wechatThumbMediaIdInput.value = "";
    wechatStatusEl.textContent = "公众号配置已清除";
    wechatStatusEl.classList.remove("error");
  } catch (error) {
    wechatStatusEl.textContent = `清除失败：${error?.message ?? error}`;
    wechatStatusEl.classList.add("error");
  }
}

geminiForm.addEventListener("submit", saveGeminiSettings);
geminiSaveBtn.addEventListener("click", saveGeminiSettings);
geminiClearBtn.addEventListener("click", clearGeminiSettings);

wechatForm.addEventListener("submit", saveWechatSettings);
wechatSaveBtn.addEventListener("click", saveWechatSettings);
wechatClearBtn.addEventListener("click", clearWechatSettings);

document.addEventListener("DOMContentLoaded", loadSettings);

import { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const translatorForm = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clear");

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

    apiKeyInput.value = current.apiKey;
    modelInput.value = DEFAULT_SETTINGS.model;
    statusEl.textContent = current.updatedAt ? `最近更新：${formatDate(current.updatedAt)}` : "";
    statusEl.classList.remove("error");

    wechatAppIdInput.value = current.wechatAppId || "";
    wechatAppSecretInput.value = current.wechatAppSecret || "";
    wechatDefaultAuthorInput.value = current.wechatDefaultAuthor || "";
    wechatOriginUrlInput.value = current.wechatOriginUrl || "";
    wechatThumbMediaIdInput.value = current.wechatThumbMediaId || "";
    wechatStatusEl.textContent = buildWechatStatus(current);
    wechatStatusEl.classList.remove("error");
  } catch (error) {
    const msg = error?.message ?? String(error);
    statusEl.textContent = `加载失败：${msg}`;
    statusEl.classList.add("error");
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

function buildWechatStatus(settings) {
  if (!settings) return "尚未配置公众号信息";
  if (!settings.wechatAppId || !settings.wechatAppSecret) {
    return "尚未配置 AppID / AppSecret";
  }
  if (!settings.wechatAccessToken && !settings.wechatTokenExpiresAt) {
    return "已保存凭证，等待获取 Access Token";
  }
  if (settings.wechatTokenExpiresAt) {
    return `Access Token 已缓存，将于 ${formatDate(settings.wechatTokenExpiresAt)} 过期`;
  }
  return "Access Token 已缓存";
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

async function saveTranslatorSettings(event) {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  const model = DEFAULT_SETTINGS.model;
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    const updated = {
      ...current,
      apiKey,
      model,
      updatedAt: new Date().toISOString(),
    };
    await chrome.storage.sync.set({
      [SETTINGS_KEY]: updated,
    });
    statusEl.textContent = "已保存";
    statusEl.classList.remove("error");
  } catch (error) {
    statusEl.textContent = `保存失败：${error?.message ?? error}`;
    statusEl.classList.add("error");
  }
}

async function clearTranslatorSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    const updated = {
      ...DEFAULT_SETTINGS,
      wechatAppId: current.wechatAppId,
      wechatAppSecret: current.wechatAppSecret,
      wechatAccessToken: current.wechatAccessToken,
      wechatTokenExpiresAt: current.wechatTokenExpiresAt,
      wechatDefaultAuthor: current.wechatDefaultAuthor,
      wechatOriginUrl: current.wechatOriginUrl,
      wechatThumbMediaId: current.wechatThumbMediaId,
    };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    apiKeyInput.value = "";
    modelInput.value = DEFAULT_SETTINGS.model;
    statusEl.textContent = "已清除";
    statusEl.classList.remove("error");
  } catch (error) {
    statusEl.textContent = `清除失败：${error?.message ?? error}`;
    statusEl.classList.add("error");
  }
}

async function saveWechatSettings() {
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

translatorForm.addEventListener("submit", saveTranslatorSettings);
clearBtn.addEventListener("click", clearTranslatorSettings);
wechatSaveBtn.addEventListener("click", saveWechatSettings);
wechatClearBtn.addEventListener("click", clearWechatSettings);

document.addEventListener("DOMContentLoaded", loadSettings);

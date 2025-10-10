import { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const translatorForm = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clear");

const wechatForm = document.getElementById("wechat-form");
const wechatAccessTokenInput = document.getElementById("wechatAccessToken");
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
    modelInput.value = current.model || DEFAULT_SETTINGS.model;
    statusEl.textContent = current.updatedAt ? `最近更新：${formatDate(current.updatedAt)}` : "";
    statusEl.classList.remove("error");

    wechatAccessTokenInput.value = current.wechatAccessToken || "";
    wechatDefaultAuthorInput.value = current.wechatDefaultAuthor || "";
    wechatOriginUrlInput.value = current.wechatOriginUrl || "";
    wechatThumbMediaIdInput.value = current.wechatThumbMediaId || "";
    wechatStatusEl.textContent = current.wechatAccessToken ? "已保存微信公众号配置" : "尚未配置 Access Token";
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

async function saveTranslatorSettings(event) {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_SETTINGS.model;
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
      wechatAccessToken: current.wechatAccessToken,
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
  const accessToken = wechatAccessTokenInput.value.trim();
  const defaultAuthor = wechatDefaultAuthorInput.value.trim();
  const originUrl = wechatOriginUrlInput.value.trim();
  const thumbMediaId = wechatThumbMediaIdInput.value.trim();
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    const updated = {
      ...current,
      wechatAccessToken: accessToken,
      wechatDefaultAuthor: defaultAuthor,
      wechatOriginUrl: originUrl,
      wechatThumbMediaId: thumbMediaId,
      wechatUpdatedAt: new Date().toISOString(),
    };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    wechatStatusEl.textContent = accessToken ? "公众号配置已保存" : "已清除 Access Token";
    wechatStatusEl.classList.remove("error");
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
      wechatAccessToken: "",
      wechatDefaultAuthor: "",
      wechatOriginUrl: "",
      wechatThumbMediaId: "",
      wechatUpdatedAt: new Date().toISOString(),
    };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });
    wechatAccessTokenInput.value = "";
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

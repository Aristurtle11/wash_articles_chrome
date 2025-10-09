import { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const form = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clear");

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const current = normalizeSettings(result[SETTINGS_KEY]);
    apiKeyInput.value = current.apiKey;
    modelInput.value = current.model || DEFAULT_SETTINGS.model;
    statusEl.textContent = current.updatedAt ? `最近更新：${formatDate(current.updatedAt)}` : "";
    statusEl.classList.remove("error");
  } catch (error) {
    statusEl.textContent = `加载失败：${error.message ?? error}`;
    statusEl.classList.add("error");
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

async function saveSettings(event) {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_SETTINGS.model;
  try {
    await chrome.storage.sync.set({
      [SETTINGS_KEY]: {
        apiKey,
        model,
        updatedAt: new Date().toISOString(),
      },
    });
    statusEl.textContent = "已保存";
    statusEl.classList.remove("error");
  } catch (error) {
    statusEl.textContent = `保存失败：${error.message ?? error}`;
    statusEl.classList.add("error");
  }
}

async function clearSettings() {
  try {
    await chrome.storage.sync.remove(SETTINGS_KEY);
    apiKeyInput.value = "";
    modelInput.value = DEFAULT_SETTINGS.model;
    statusEl.textContent = "已清除";
    statusEl.classList.remove("error");
  } catch (error) {
    statusEl.textContent = `清除失败：${error.message ?? error}`;
    statusEl.classList.add("error");
  }
}

form.addEventListener("submit", saveSettings);
clearBtn.addEventListener("click", clearSettings);

document.addEventListener("DOMContentLoaded", loadSettings);

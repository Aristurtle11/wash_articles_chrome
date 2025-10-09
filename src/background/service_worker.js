// Chrome 扩展服务工作线程入口。
// 负责内容脚本数据缓存与 Popup 通信。

import { ContentStore } from "./state.js";

const store = new ContentStore();

function log(...args) {
  console.info("[WashArticles:SW]", ...args);
}

log("服务工作线程已加载：", new Date().toISOString());

chrome.runtime.onInstalled.addListener((details) => {
  log("扩展安装/更新事件：", details);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }
  const tabId = sender.tab?.id;
  switch (message.type) {
    case "wash-articles/content":
      if (tabId && message.payload) {
        store.set(tabId, message.payload);
        log("收到内容并缓存：", tabId, message.payload?.items?.length ?? 0);
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
          chrome.runtime.sendMessage({
            type: "wash-articles/content-updated",
            payload: message.payload,
          });
        }
      });
      break;
    default:
      break;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  store.clear(tabId);
});

// 页面内浮动按钮与内容展示入口。

(() => {
  const DATA_ATTR = "data-wash-articles";
  const BUTTON_ID = "wash-articles-floating-button";

  let latestPayload = null;

  function ensureButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      return existing;
    }
    if (!document.body) {
      window.addEventListener(
        "DOMContentLoaded",
        () => {
          if (!document.getElementById(BUTTON_ID) && latestPayload) {
            ensureButton();
          }
        },
        { once: true },
      );
      return null;
    }
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.setAttribute(DATA_ATTR, "floating-button");
    button.textContent = "Wash Preview";
    Object.assign(button.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      padding: "12px 16px",
      borderRadius: "999px",
      border: "none",
      background: "#1a73e8",
      color: "#fff",
      fontSize: "14px",
      boxShadow: "0 4px 12px rgba(26,115,232,0.3)",
      cursor: "pointer",
      zIndex: "2147483647",
    });
    button.addEventListener("click", () => {
      if (!latestPayload) return;
      chrome.runtime.sendMessage(
        {
          type: "wash-articles/open-popup",
          payload: latestPayload,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.debug(
              "[WashArticles] 打开 Popup 消息未送达",
              chrome.runtime.lastError.message,
            );
          }
        },
      );
    });
    document.body.appendChild(button);
    return button;
  }

  function handlePayload(detail) {
    if (!detail) return;
    latestPayload = detail;
    if (document.readyState === "complete" || document.body) {
      ensureButton();
    }
  }

  window.addEventListener("wash-articles:content-ready", (event) => {
    handlePayload(event.detail);
  });

  chrome.runtime.sendMessage({ type: "wash-articles/get-content" }, (response) => {
    const payload = response?.payload;
    if (payload) {
      handlePayload(payload);
    }
  });

  const observer = new MutationObserver(() => {
    const button = document.getElementById(BUTTON_ID);
    if (!button && latestPayload) {
      ensureButton();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();

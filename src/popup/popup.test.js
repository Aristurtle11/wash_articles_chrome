/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

function createDom() {
  document.body.innerHTML = `
    <div id="source-url"></div>
    <div id="capture-time"></div>
    <ul id="summary-list"></ul>
    <div id="summary-empty"></div>
    <ul id="history-list"></ul>
    <div id="history-empty"></div>
    <button id="history-clear"></button>
    <button id="wash-btn"></button>
    <span id="wash-status"></span>
    <span id="translation-status"></span>
    <textarea id="translation-text"></textarea>
    <input id="generated-title" />
    <span id="title-status"></span>
    <button id="open-settings"></button>
    <span id="formatted-status"></span>
    <div id="formatted-preview"></div>
    <button id="download-markdown"></button>
    <button id="download-html"></button>
    <button id="copy-markdown"></button>
    <button id="copy-html"></button>
    <span id="wechat-status"></span>
    <input id="wechat-title" />
    <textarea id="wechat-digest"></textarea>
    <input id="wechat-source-url" />
    <input id="wechat-thumb-media" />
    <button id="wechat-create"></button>
    <button id="wechat-copy-payload"></button>
    <textarea id="wechat-draft-output"></textarea>
  `;
}

describe("popup UI", () => {
  const runtimeListeners = [];
  const portListeners = [];
  const sendMessageCalls = [];

  beforeEach(async () => {
    vi.useFakeTimers();
    runtimeListeners.length = 0;
    portListeners.length = 0;
    sendMessageCalls.length = 0;

    createDom();

    global.navigator = {
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    };

    global.chrome = {
      runtime: {
        connect: vi.fn(() => ({
          postMessage: vi.fn(),
          onMessage: {
            addListener: (fn) => portListeners.push(fn),
          },
        })),
        onMessage: {
          addListener: (fn) => runtimeListeners.push(fn),
        },
        sendMessage: vi.fn((message, callback) => {
          sendMessageCalls.push(message);
          chrome.runtime.lastError = undefined;
          let response;
          switch (message?.type) {
            case "wash-articles/get-content":
              response = { payload: null };
              break;
            case "wash-articles/get-history":
              response = { history: [] };
              break;
            case "wash-articles/get-settings":
              response = {
                settings: {
                  updatedAt: "2025-01-01T00:00:00Z",
                  wechatHasCredentials: false,
                  wechatConfigured: false,
                  wechatTokenExpiresAt: null,
                  wechatOriginUrl: "",
                },
              };
              break;
            default:
              response = { ok: true };
          }
          if (callback) {
            callback(response);
          }
        }),
        openOptionsPage: vi.fn(),
        lastError: undefined,
      },
    };

    await import("./popup.js");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    delete global.chrome;
    delete global.navigator;
  });

  function emitRuntimeMessage(message) {
    runtimeListeners.forEach((listener) => listener(message));
  }

  it("renders translation and formatted preview", async () => {
    emitRuntimeMessage({
      type: "wash-articles/content-updated",
      payload: {
        sourceUrl: "https://example.com/article",
        items: [],
        cachedImages: [],
        translation: null,
        formatted: null,
      },
    });

    emitRuntimeMessage({
      type: "wash-articles/translation-updated",
      payload: {
        sourceUrl: "https://example.com/article",
        translation: {
          status: "done",
          text: "翻译段落",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        titleTask: {
          status: "done",
          text: "中文标题",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        formatted: {
          html: "<article><p>排版段落</p></article>",
          markdown: null,
          updatedAt: "2025-01-01T00:00:01Z",
        },
        workflow: { status: "success", currentStep: "complete" },
      },
    });

    const translationText = document.getElementById("translation-text");
    const formattedPreview = document.getElementById("formatted-preview");
    const formattedStatus = document.getElementById("formatted-status");
    const generatedTitle = document.getElementById("generated-title");

    expect(translationText.value).toContain("翻译段落");
    expect(formattedPreview.innerHTML).toContain("排版段落");
    expect(formattedStatus.textContent).toContain("排版完成");
    expect(generatedTitle.value).toBe("中文标题");

    const copyHtmlBtn = document.getElementById("copy-html");
    copyHtmlBtn.click();
    await Promise.resolve();
    vi.advanceTimersByTime(1500);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "<article><p>排版段落</p></article>"
    );
  });

  it("triggers download actions", () => {
    emitRuntimeMessage({
      type: "wash-articles/content-updated",
      payload: {
        sourceUrl: "https://example.com/article",
        items: [],
        cachedImages: [],
        translation: null,
        formatted: null,
      },
    });

    emitRuntimeMessage({
      type: "wash-articles/translation-updated",
      payload: {
        sourceUrl: "https://example.com/article",
        translation: {
          status: "done",
          text: "翻译段落",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        formatted: {
          html: "<article><p>排版段落</p></article>",
          markdown: null,
          updatedAt: "2025-01-01T00:00:01Z",
        },
        workflow: { status: "success", currentStep: "complete" },
      },
    });

    const downloadHtmlBtn = document.getElementById("download-html");
    downloadHtmlBtn.click();

    const downloadMarkdownBtn = document.getElementById("download-markdown");
    expect(downloadMarkdownBtn.disabled).toBe(true);

    expect(
      sendMessageCalls.some(
        (msg) => msg.type === "wash-articles/download-formatted" && msg.payload?.format === "html",
      ),
    ).toBe(true);
    expect(
      sendMessageCalls.some(
        (msg) => msg.type === "wash-articles/download-formatted" && msg.payload?.format === "markdown",
      ),
    ).toBe(false);
  });
});

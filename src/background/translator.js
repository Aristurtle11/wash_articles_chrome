const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-pro";
const TRANSLATE_PROMPT_PATH = "asset/translate_prompts.txt";
const TRANSLATE_PROMPT_URL = chrome.runtime.getURL(TRANSLATE_PROMPT_PATH);
const TRANSLATION_CONFIG = {
  temperature: 0.3,
  topP: 0.8,
  maxOutputTokens: 65536,
  thinkingConfig: {
    thinkingBudget: 24567,
  },
};
const TITLE_CONFIG = {
  temperature: 0.6,
  topP: 0.9,
  maxOutputTokens: 1024,
  thinkingConfig: {
    thinkingBudget: 0,
  },
};

let translationPromptCache = null;
let translationPromptPromise = null;

function log(...args) {
  console.debug("[WashArticles:Translator]", ...args);
}

function cloneConversation(conversation) {
  if (!Array.isArray(conversation)) return [];
  return conversation
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const role = typeof entry.role === "string" ? entry.role : "user";
      const parts = Array.isArray(entry.parts)
        ? entry.parts
            .map((part) => {
              if (!part || typeof part !== "object") return null;
              if (typeof part.text === "string") {
                return { text: part.text };
              }
              return null;
            })
            .filter(Boolean)
        : [];
      if (!parts.length) return null;
      return { role, parts };
    })
    .filter(Boolean);
}

function buildTranslationPrompt(template, markdown, { sourceUrl, fallbackTitle } = {}) {
  const lines = [template.trim()];
  if (fallbackTitle) {
    lines.push(`原文标题：${fallbackTitle}`);
  }
  if (sourceUrl) {
    lines.push(`原文链接：${sourceUrl}`);
  }
  lines.push("");
  lines.push("正文：");
  lines.push(markdown);
  return lines.join("\n");
}

function buildTitlePrompt({ fallbackTitle, sourceUrl } = {}) {
  const lines = [
    "基于以上已经翻译成中文的文章内容，请提供一个吸引人的中文标题。",
    "要求：",
    "1. 标题需准确概括文章核心观点；",
    "2. 使用简洁有力的语言，长度控制在 64 个汉字以内；",
    "3. 一定要吸引人的眼球，让人一眼看到就被吸引过来；",
    "3. 不要返回序号、引号或其他装饰符，仅输出标题文本。",
  ];
  if (fallbackTitle) {
    lines.push(`原文标题仅供参考：${fallbackTitle}`);
  }
  if (sourceUrl) {
    lines.push(`原文链接：${sourceUrl}`);
  }
  return lines.join("\n");
}

function extractModelContent(response) {
  const candidate = response?.candidates?.[0];
  if (!candidate) {
    return { content: null, text: "" };
  }
  const content = candidate.content && typeof candidate.content === "object"
    ? candidate.content
    : null;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (content && text) {
    return { content, text };
  }
  if (text) {
    return {
      content: { role: "model", parts: [{ text }] },
      text,
    };
  }
  return { content, text };
}

function extractFinishReason(response) {
  return response?.candidates?.[0]?.finishReason ?? null;
}

export class TranslatorService {
  constructor({ fetchImpl } = {}) {
    this._apiKey = "";
    this._model = DEFAULT_MODEL;
    if (typeof fetchImpl === "function") {
      this._fetch = fetchImpl;
    } else {
      this._fetch = (...args) => globalThis.fetch(...args);
    }
  }

  updateSettings(settings = {}) {
    this._apiKey = settings?.geminiApiKey || "";
    this._model = settings?.geminiModel || DEFAULT_MODEL;
  }

  hasCredentials() {
    return Boolean(this._apiKey);
  }

  async translateArticle(markdown, { sourceUrl, fallbackTitle } = {}) {
    if (!this._apiKey) {
      throw new Error("尚未配置 Gemini API Key");
    }
    const input = String(markdown ?? "").trim();
    if (!input) {
      return {
        text: "",
        conversation: [],
        finishReason: "empty-input",
      };
    }

    const promptTemplate = await loadTranslationPrompt();
    const userMessage = {
      role: "user",
      parts: [{ text: buildTranslationPrompt(promptTemplate, input, { sourceUrl, fallbackTitle }) }],
    };

    log("请求翻译", {
      chars: input.length,
      model: this._model,
    });

    const response = await this._callGeminiRequest({
      contents: [userMessage],
      generationConfig: TRANSLATION_CONFIG,
    });

    const finishReason = extractFinishReason(response);
    const { content, text } = extractModelContent(response);
    log("翻译响应", { finishReason, hasText: Boolean(text) });

    if (!text) {
      throw new Error(
        finishReason
          ? `Gemini 未返回翻译结果（finishReason=${finishReason})`
          : "Gemini 未返回翻译结果",
      );
    }

    return {
      text,
      finishReason,
      conversation: [userMessage, content ?? { role: "model", parts: [{ text }] }],
    };
  }

  async generateTitle(conversation, { sourceUrl, fallbackTitle } = {}) {
    if (!this._apiKey) {
      throw new Error("尚未配置 Gemini API Key");
    }
    const history = cloneConversation(conversation);
    if (!history.length) {
      throw new Error("缺少可用于生成标题的对话上下文");
    }

    const titleMessage = {
      role: "user",
      parts: [{ text: buildTitlePrompt({ sourceUrl, fallbackTitle }) }],
    };
    const contents = [...history, titleMessage];

    log("请求生成标题", {
      turns: contents.length,
      fallbackTitle: fallbackTitle || null,
    });

    const response = await this._callGeminiRequest({
      contents,
      generationConfig: TITLE_CONFIG,
    });

    const finishReason = extractFinishReason(response);
    const { content, text } = extractModelContent(response);
    log("标题响应", { finishReason, hasText: Boolean(text) });

    if (!text) {
      throw new Error(
        finishReason
          ? `Gemini 未返回标题（finishReason=${finishReason})`
          : "Gemini 未返回标题",
      );
    }

    return {
      text,
      finishReason,
      conversation: [...history, titleMessage, content ?? { role: "model", parts: [{ text }] }],
    };
  }

  async _callGeminiRequest(payload) {
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(this._model)}:generateContent?key=${encodeURIComponent(this._apiKey)}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let message = `Gemini 接口请求失败（HTTP ${response.status})`;
      try {
        const errorPayload = await response.json();
        if (errorPayload?.error?.message) {
          message = `Gemini 接口请求失败：${errorPayload.error.message}`;
        }
      } catch (parseError) {
        // 忽略解析错误，保留默认信息。
      }
      throw new Error(message);
    }
    return response.json();
  }
}

async function loadTranslationPrompt() {
  if (translationPromptCache) {
    return translationPromptCache;
  }
  if (!translationPromptPromise) {
    translationPromptPromise = (async () => {
      const response = await fetch(TRANSLATE_PROMPT_URL);
      if (!response.ok) {
        throw new Error(`无法加载翻译提示词（${response.status}）`);
      }
      const text = await response.text();
      translationPromptCache = text;
      return text;
    })().catch((error) => {
      translationPromptPromise = null;
      throw error;
    });
  }
  return translationPromptPromise;
}

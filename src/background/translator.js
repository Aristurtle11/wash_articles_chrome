import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const API_HOST = "https://generativelanguage.googleapis.com";
const API_PATH = "v1beta";

const TRANSLATE_INSTRUCTION = `你是一名专业翻译，请将输入的英文文章内容翻译成流畅、自然的中文。
要求：
- 保留段落和小标题结构，按照顺序输出。
- 不要添加额外说明或前缀，仅输出翻译后的正文。
- 如果出现图片占位符 (如 {{[Image]}} 或 {{[Image 1]}} )，原样保留。`;

const TITLE_INSTRUCTION = `请基于我们刚刚讨论的中文译文，为文章拟一个中文标题。
要求：
- 使用简体中文，不超过 22 个汉字；
- 精炼准确，突出核心信息；
- 不添加书名号、引号或标点符号结尾。
请直接输出标题本身。`;

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.2,
  topK: 32,
  topP: 0.9,
  maxOutputTokens: 65536,
};

const TITLE_GENERATION_CONFIG = {
  temperature: 0.4,
  topK: 32,
  topP: 0.9,
  maxOutputTokens: 512,
};

const MAX_CHUNK_CHARS = 1200;
const MAX_CONTEXT_CHARS = 20000;

export class TranslatorService {
  constructor() {
    this._settings = { ...DEFAULT_SETTINGS };
  }

  updateSettings(rawSettings) {
    const normalized = normalizeSettings(rawSettings);
    this._settings = { ...normalized, model: DEFAULT_SETTINGS.model };
  }

  get settings() {
    return { ...this._settings };
  }

  async translateContent(items, metadata = {}) {
    if (!this._settings.apiKey) {
      throw new Error("尚未配置 Gemini API Key");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("没有可翻译的正文内容");
    }

    const serialized = serializeItems(items);
    const chunkTexts = chunkSegments(serialized, MAX_CHUNK_CHARS);
    const translations = [];

    for (let index = 0; index < chunkTexts.length; index += 1) {
      console.debug("[Translator] 翻译 chunk", {
        chunk: index + 1,
        total: chunkTexts.length,
        size: chunkTexts[index].length,
      });
      const userMessage = buildTranslationUserMessage(
        chunkTexts[index],
        metadata,
        index + 1,
        chunkTexts.length,
      );
      const response = await this._callGeminiRequest({
        contents: [userMessage],
        generationConfig: DEFAULT_GENERATION_CONFIG,
      });
      console.debug("[Translator] 翻译返回", {
        chunk: index + 1,
        finishReason: extractFinishReason(response) || "unknown",
      });
      const text = normalizeResponseText(response);
      if (!text) {
        const block = extractBlockReason(response);
        if (block) {
          throw new Error(`Gemini 拒绝翻译：${block}`);
        }
        const finishReason = extractFinishReason(response);
        throw new Error(
          finishReason
            ? `Gemini 未返回翻译结果 (finishReason=${finishReason})`
            : "Gemini 未返回翻译结果",
        );
      }
      translations.push(text.trim());
    }

    const translationText = translations.join("\n\n");
    const conversation = buildTranslationConversation(items, metadata, translationText);

    return {
      text: translationText,
      model: this._settings.model,
      updatedAt: new Date().toISOString(),
      conversation,
    };
  }

  async generateTitle(items, { sourceUrl, fallbackTitle, conversation, translatedText } = {}) {
    if (!this._settings.apiKey) {
      throw new Error("尚未配置 Gemini API Key");
    }

    const hasTranslatedText = typeof translatedText === "string" && translatedText.trim().length > 0;
    if (!hasTranslatedText) {
      if (fallbackTitle) {
        console.debug("[Translator] 翻译内容缺失，返回备用标题", fallbackTitle);
        return {
          text: sanitizeTitle(fallbackTitle),
          updatedAt: new Date().toISOString(),
        };
      }
      throw new Error("缺少可用于生成标题的中文内容");
    }

    const history = normalizeConversation(conversation, translatedText);
    const titleMessage = buildTitleUserMessage({ sourceUrl, fallbackTitle });
    const contents = [...history, titleMessage];

    console.debug("[Translator] 请求标题生成", {
      turns: contents.length,
      lastUserPreview: titleMessage.parts[0].text.slice(0, 200),
    });

    const response = await this._callGeminiRequest({
      contents,
      generationConfig: TITLE_GENERATION_CONFIG,
    });

    const text = normalizeResponseText(response).split(/\r?\n/)[0]?.trim();
    console.debug("[Translator] 标题生成响应", {
      hasText: Boolean(text),
      finishReason: extractFinishReason(response) || "unknown",
    });
    if (!text) {
      throw new Error("Gemini 未返回标题");
    }
    const normalized = sanitizeTitle(text) || sanitizeTitle(fallbackTitle) || "待确认标题";
    return {
      text: normalized,
      updatedAt: new Date().toISOString(),
    };
  }

  async _callGeminiRequest({ contents, generationConfig }) {
    if (!Array.isArray(contents) || !contents.length) {
      throw new Error("缺少会话内容");
    }

    const prepared = contents
      .map((entry) => {
        if (!entry || !Array.isArray(entry.parts)) {
          return null;
        }
        const parts = entry.parts
          .map((part) => {
            if (typeof part === "string") {
              return { text: part };
            }
            if (typeof part?.text === "string") {
              return { text: part.text };
            }
            return null;
          })
          .filter(Boolean);
        if (!parts.length) {
          return null;
        }
        return {
          role: entry.role === "model" ? "model" : "user",
          parts,
        };
      })
      .filter(Boolean);

    if (!prepared.length) {
      throw new Error("缺少有效的会话内容");
    }

    const model = this._settings.model || DEFAULT_SETTINGS.model;
    const endpoint = new URL(
      `${API_PATH}/models/${encodeURIComponent(model)}:generateContent`,
      API_HOST,
    );
    endpoint.searchParams.set("key", this._settings.apiKey);

    const body = {
      contents: prepared,
      generationConfig: generationConfig || DEFAULT_GENERATION_CONFIG,
    };

    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    console.debug("[Translator] 调用 Gemini", {
      model,
      contentTurns: prepared.length,
      generationConfig,
      status: response.status,
    });

    if (!response.ok) {
      const errorBody = await safeJson(response);
      const message = errorBody?.error?.message || `HTTP ${response.status}`;
      throw new Error(`请求生成失败：${message}`);
    }

    return response.json();
  }
}

export function sanitizeTitle(title) {
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

function serializeItems(items) {
  const segments = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "paragraph") {
      segments.push(item.text || "");
    } else if (item.kind === "heading") {
      const hashes = "#".repeat(Math.min(Math.max(Number(item.level) || 2, 2), 6));
      segments.push(`${hashes} ${item.text || ""}`);
    } else if (item.kind === "image") {
      const marker = item.sequence ? `{{[Image ${item.sequence}]}}` : "{{[Image]}}";
      segments.push(marker);
    }
  }
  return segments;
}

function chunkSegments(segments, limit) {
  if (!segments.length) {
    return [""];
  }
  const chunks = [];
  let current = [];
  let length = 0;

  for (const segment of segments) {
    const segmentLength = segment.length + 1;
    if (current.length && length + segmentLength > limit) {
      chunks.push(current.join("\n\n"));
      current = [segment];
      length = segmentLength;
    } else {
      current.push(segment);
      length += segmentLength;
    }
  }
  if (current.length) {
    chunks.push(current.join("\n\n"));
  }
  return chunks;
}

function buildTranslationUserMessage(chunkText, metadata, chunkIndex, chunkTotal) {
  const prompt = buildTranslationPrompt(chunkText, metadata, chunkIndex, chunkTotal);
  return {
    role: "user",
    parts: [{ text: `${TRANSLATE_INSTRUCTION}\n\n${prompt}` }],
  };
}

function buildTranslationPrompt(chunkText, { sourceUrl, title } = {}, chunkIndex = 1, chunkTotal = 1) {
  const lines = [];
  if (title) {
    lines.push(`# 原文标题: ${title}`);
  }
  if (sourceUrl) {
    lines.push(`# 原文链接: ${sourceUrl}`);
  }
  if (chunkTotal > 1) {
    lines.push(`# 当前片段: ${chunkIndex}/${chunkTotal}`);
  }
  lines.push("\n以下是需要翻译的英文内容：\n");
  lines.push(chunkText);
  return lines.join("\n");
}

function buildTranslationConversation(items, metadata, translationText) {
  const english = truncateText(serializeItems(items).join("\n\n"), MAX_CONTEXT_CHARS);
  const userMessage = buildTranslationUserMessage(english, metadata, 1, 1);
  const modelMessage = {
    role: "model",
    parts: [{ text: translationText || "" }],
  };
  return [userMessage, modelMessage];
}

function buildTitleUserMessage({ sourceUrl, fallbackTitle }) {
  const lines = [TITLE_INSTRUCTION];
  if (fallbackTitle) {
    lines.push(`原文标题（仅供参考）：${fallbackTitle}`);
  }
  if (sourceUrl) {
    lines.push(`原文链接：${sourceUrl}`);
  }
  lines.push("请基于前一步的中文译文直接输出标题。");
  return {
    role: "user",
    parts: [{ text: lines.join("\n") }],
  };
}

function normalizeConversation(conversation, translatedText) {
  if (Array.isArray(conversation) && conversation.length) {
    const normalized = conversation
      .map((entry) => {
        const role = entry?.role === "model" ? "model" : "user";
        const parts = Array.isArray(entry?.parts)
          ? entry.parts
              .map((part) => {
                if (typeof part === "string") return { text: part };
                if (typeof part?.text === "string") return { text: part.text };
                return null;
              })
              .filter(Boolean)
          : [];
        if (!parts.length) return null;
        return { role, parts };
      })
      .filter(Boolean);
    const hasModel = normalized.some((entry) => entry.role === "model");
    if (normalized.length && hasModel) {
      return normalized;
    }
  }
  const fallbackText = translatedText ? translatedText : "";
  return buildTranslationConversation([], {}, fallbackText);
}

function truncateText(text, limit) {
  if (!text || text.length <= limit) {
    return text || "";
  }
  return `${text.slice(0, limit)}\n...[内容已截断供模型参考]`;
}

function normalizeResponseText(response) {
  try {
    if (!response) return "";
    const candidates = response?.candidates || response?.response?.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const candidate = candidates[0];
      const textFromParts = extractTextFromParts(candidate?.content?.parts);
      if (textFromParts) {
        return textFromParts;
      }
      if (typeof candidate?.output === "string") {
        return candidate.output;
      }
      if (typeof candidate?.output_text === "string") {
        return candidate.output_text;
      }
      if (typeof candidate?.content === "string") {
        return candidate.content;
      }
    }
  } catch (error) {
    console.warn("[WashArticles] 解析 Gemini 返回内容失败", error);
  }
  return "";
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractTextFromParts(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => {
      if (typeof part?.text === "string") {
        return part.text;
      }
      if (typeof part?.rawText === "string") {
        return part.rawText;
      }
      if (typeof part?.inlineData?.data === "string") {
        try {
          return atob(part.inlineData.data);
        } catch (error) {
          console.warn("[WashArticles] 解码 inlineData 失败", error);
          return "";
        }
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractBlockReason(response) {
  const feedback = response?.promptFeedback || response?.response?.promptFeedback;
  if (!feedback) {
    return "";
  }
  if (feedback?.blockReason) {
    return feedback.blockReason;
  }
  if (Array.isArray(feedback?.safetyRatings)) {
    const blocked = feedback.safetyRatings.find((item) => item?.blocked === true);
    if (blocked?.category) {
      return blocked.category;
    }
  }
  return "";
}

function extractFinishReason(response) {
  const candidates = response?.candidates || response?.response?.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    return candidates[0]?.finishReason || candidates[0]?.finish_reason || "";
  }
  return "";
}

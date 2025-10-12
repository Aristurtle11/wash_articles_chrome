import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const API_HOST = "https://generativelanguage.googleapis.com";
const API_PATH = "v1beta";
const TRANSLATE_SYSTEM_PROMPT = `你是一名专业翻译，请将输入的英文文章内容翻译成流畅、自然的中文。\n要求：\n- 保留段落和小标题结构，按照顺序输出。\n- 不要添加额外说明或前缀，仅输出翻译后的正文。\n- 如果出现图片占位符 (如 {{[Image]}} 或 {{[Image 1]}} )，原样保留。`;
const TITLE_SYSTEM_PROMPT = `你是一名资深中文新闻编辑，请基于给定的英文文章内容，提炼一个不超过 22 个汉字的中文标题。\n要求：\n- 使用简体中文。\n- 精炼、准确，突出核心信息。\n- 不要包含引号或标点符号结尾。`;
const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.2,
  topK: 32,
  topP: 0.9,
  maxOutputTokens: 2048,
};
const TITLE_GENERATION_CONFIG = {
  temperature: 0.4,
  topK: 32,
  topP: 0.9,
  maxOutputTokens: 128,
};
const MAX_CHUNK_CHARS = 1800;

export class TranslatorService {
  constructor() {
    this._settings = { ...DEFAULT_SETTINGS };
  }

  updateSettings(rawSettings) {
    this._settings = normalizeSettings(rawSettings);
  }

  get settings() {
    return { ...this._settings };
  }

  async translateContent(items, { sourceUrl, title } = {}) {
    if (!this._settings.apiKey) {
      throw new Error("尚未配置 Gemini API Key");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("没有可翻译的正文内容");
    }

    const serialized = serializeItems(items);
    const chunkTexts = chunkSegments(serialized, MAX_CHUNK_CHARS);
    const responses = [];

    for (let index = 0; index < chunkTexts.length; index += 1) {
      const prompt = buildPrompt(chunkTexts[index], { sourceUrl, title }, index + 1, chunkTexts.length);
      const response = await this._callGeminiRequest({
        systemPrompt: TRANSLATE_SYSTEM_PROMPT,
        userPrompt: prompt,
        generationConfig: DEFAULT_GENERATION_CONFIG,
      });
      responses.push(response);
    }

    const results = responses.map((response) => {
      const text = normalizeResponseText(response);
      if (text) {
        return text.trim();
      }
      const block = extractBlockReason(response);
      if (block) {
        throw new Error(`Gemini 拒绝翻译：${block}`);
      }
      const finishReason = extractFinishReason(response);
      console.warn("[WashArticles] Gemini 响应为空", response);
      throw new Error(
        finishReason
          ? `Gemini 未返回翻译结果 (finishReason=${finishReason})`
          : "Gemini 未返回翻译结果",
      );
    });

    return {
      text: results.join("\n\n"),
      model: this._settings.model,
      updatedAt: new Date().toISOString(),
    };
  }

  async generateTitle(items, { sourceUrl, fallbackTitle } = {}) {
    if (!this._settings.apiKey) {
      throw new Error("尚未配置 Gemini API Key");
    }
    const englishMaterial = buildTitleMaterial(items);
    if (!englishMaterial) {
      if (fallbackTitle) {
        return {
          text: fallbackTitle,
          updatedAt: new Date().toISOString(),
        };
      }
      throw new Error("没有可生成标题的内容");
    }

    const prompt = buildTitlePrompt(englishMaterial, { sourceUrl, fallbackTitle });
    const response = await this._callGeminiRequest({
      systemPrompt: TITLE_SYSTEM_PROMPT,
      userPrompt: prompt,
      generationConfig: TITLE_GENERATION_CONFIG,
    });
    const text = normalizeResponseText(response).split(/\r?\n/)[0]?.trim();
    if (!text) {
      throw new Error("Gemini 未返回标题");
    }
    const normalized = sanitizeTitle(text) || fallbackTitle || "待确认标题";
    return {
      text: normalized,
      updatedAt: new Date().toISOString(),
    };
  }

  async _callGeminiRequest({ systemPrompt, userPrompt, generationConfig }) {
    const model = this._settings.model || DEFAULT_SETTINGS.model;
    const endpoint = new URL(
      `${API_PATH}/models/${encodeURIComponent(model)}:generateContent`,
      API_HOST,
    );
    endpoint.searchParams.set("key", this._settings.apiKey);

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: generationConfig || DEFAULT_GENERATION_CONFIG,
    };

    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await safeJson(response);
      const message = errorBody?.error?.message || `HTTP ${response.status}`;
      throw new Error(`请求生成失败：${message}`);
    }

    return response.json();
  }
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

function buildPrompt(chunkText, { sourceUrl, title } = {}, chunkIndex = 1, chunkTotal = 1) {
  const lines = [];
  if (title) {
    lines.push(`# Title: ${title}`);
  }
  if (sourceUrl) {
    lines.push(`# Source: ${sourceUrl}`);
  }
  if (chunkTotal > 1) {
    lines.push(`# Segment: ${chunkIndex}/${chunkTotal}`);
  }
  lines.push("\n正文内容如下：\n");
  lines.push(chunkText);
  return lines.join("\n");
}

function buildTitleMaterial(items, limit = 1600) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }
  const parts = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "heading" && item.text) {
      parts.push(String(item.text));
    } else if (item.kind === "paragraph" && item.text) {
      parts.push(String(item.text));
    }
    if (parts.join("\n").length >= limit) {
      break;
    }
  }
  const text = parts.join("\n").trim();
  return text.slice(0, limit);
}

function buildTitlePrompt(englishText, { sourceUrl, fallbackTitle } = {}) {
  const lines = [];
  if (fallbackTitle) {
    lines.push(`原文标题: ${fallbackTitle}`);
  }
  if (sourceUrl) {
    lines.push(`Source: ${sourceUrl}`);
  }
  lines.push("请根据以下英文内容生成一个简洁的中文标题：");
  lines.push(englishText);
  return lines.join("\n\n");
}

function sanitizeTitle(title) {
  if (!title) return "";
  const cleaned = title
    .replace(/[“”"']/g, "")
    .replace(/[\s]+/g, " ")
    .replace(/[。！？!?]+$/u, "")
    .trim();
  const chars = Array.from(cleaned);
  const truncated = chars.slice(0, 22).join("");
  return truncated;
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
  } catch (error) {
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

import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const API_HOST = "https://generativelanguage.googleapis.com";
const API_PATH = "v1beta";
const SYSTEM_PROMPT = `你是一名专业翻译，请将输入的英文文章内容翻译成流畅、自然的中文。\n要求：\n- 保留段落和小标题结构，按照顺序输出。\n- 不要添加额外说明或前缀，仅输出翻译后的正文。\n- 如果出现图片占位符 (如 {{[Image]}} 或 {{[Image 1]}} )，原样保留。`;
const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.2,
  topK: 32,
  topP: 0.9,
  maxOutputTokens: 2048,
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
    const results = [];

    for (let index = 0; index < chunkTexts.length; index += 1) {
      const prompt = buildPrompt(chunkTexts[index], { sourceUrl, title }, index + 1, chunkTexts.length);
      const response = await this._callGemini(prompt);
      const text = normalizeResponseText(response);
      if (!text) {
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
      }
      results.push(text.trim());
    }

    return {
      text: results.join("\n\n"),
      model: this._settings.model,
      updatedAt: new Date().toISOString(),
    };
  }

  async _callGemini(prompt) {
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
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }],
        },
      ],
      generationConfig: DEFAULT_GENERATION_CONFIG,
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
      throw new Error(`翻译请求失败：${message}`);
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

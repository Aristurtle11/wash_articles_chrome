import { GoogleGenAI } from '@google/genai';

const MODEL_NAME = 'gemini-2.5-flash';
const TEMPERATURE = 0.3;
const TITLE_MAX_LENGTH = 24;
const SYSTEM_INSTRUCTION = [
  'You are an experienced bilingual editor who localises English real-estate articles for a Chinese WeChat Official Account audience.',
  'When translating, keep paragraph breaks, bullet lists, numbers, and inline emphasis intact.',
  'Deliver fluent Simplified Chinese that feels native and professional, without adding commentary or explanations.',
].join('\n');

const sessions = new Map();

/**
 * Ensures the provided value is a non-empty string and trims it.
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
function assertNonEmptyString(value, fieldName) {
  if (value === undefined || value === null) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }

  const asString = typeof value === 'string' ? value : String(value);
  const trimmed = asString.trim();

  if (!trimmed) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }

  return trimmed;
}

/**
 * Creates a new chat session configured with the shared system instruction.
 * @param {string} apiKey
 * @param {object[]} [history]
 * @returns {object}
 */
function createChat(apiKey, history = []) {
  const client = new GoogleGenAI({ apiKey });
  return client.chats.create({
    model: MODEL_NAME,
    history,
    config: {
      temperature: TEMPERATURE,
      systemInstruction: SYSTEM_INSTRUCTION,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
}

/**
 * Extracts plain text from a Gemini SDK response.
 * @param {unknown} payload
 * @returns {Promise<string>}
 */
async function extractResponseText(payload) {
  if (!payload) {
    return '';
  }

  const response = payload.response ?? payload;
  const { text, candidates } = response ?? {};

  if (typeof text === 'function') {
    const resolved = await text.call(response);
    if (typeof resolved === 'string') {
      return resolved.trim();
    }
  }

  if (typeof text === 'string') {
    return text.trim();
  }

  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts ?? candidate?.parts ?? [];
      for (const part of parts) {
        const value = typeof part?.text === 'string' ? part.text.trim() : '';
        if (value) {
          return value;
        }
      }
    }
  }

  return '';
}

/**
 * Persists the base conversation history produced during translation.
 * @param {string} apiKey
 * @param {string} translationPrompt
 * @param {string} translation
 */
function storeTranslationSession(apiKey, translationPrompt, translation) {
  const baseHistory = [
    { role: 'user', parts: [{ text: translationPrompt }] },
    { role: 'model', parts: [{ text: translation }] },
  ];

  sessions.set(apiKey, {
    apiKey,
    translation,
    translationPrompt,
    baseHistory,
  });
}

/**
 * Builds the prompt used for translation requests.
 * @param {string} article
 * @returns {string}
 */
function buildTranslationPrompt(article) {
  return [
    'Translate the following English article into fluent Simplified Chinese suitable for publication on a WeChat Official Account.',
    'Preserve the structure, headings, bullet points, numbers, and the original sequencing of images if they are described.',
    'Keep tone professional yet approachable, and return only the translated Chinese content without any explanations.',
    '',
    article,
  ].join('\n');
}

/**
 * Builds the prompt used for title generation requests.
 * @param {string} translatedArticle
 * @returns {string}
 */
function buildTitlePrompt(translatedArticle) {
  return [
    'Using the translated Chinese article below, craft a compelling Simplified Chinese headline for a WeChat Official Account.',
    `Keep the title within ${TITLE_MAX_LENGTH} Chinese characters, highlight the core insight, and avoid quotation marks or extra punctuation.`,
    'Respond with the title only.',
    '',
    translatedArticle,
  ].join('\n');
}

/**
 * Wraps Gemini SDK errors with a user-friendly message.
 * @param {string} operation
 * @param {unknown} error
 * @returns {Error}
 */
function wrapGeminiError(operation, error) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Gemini ${operation} request failed: ${message}`);
}

/**
 * Translates the given article content into Simplified Chinese.
 * @param {string} text
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function translate(text, apiKey) {
  const trimmedKey = assertNonEmptyString(apiKey, 'Gemini API key');
  const article = assertNonEmptyString(text, 'Article content');
  const prompt = buildTranslationPrompt(article);

  try {
    const chat = createChat(trimmedKey);
    const response = await chat.sendMessage({ message: prompt });
    const translation = (await extractResponseText(response)).trim();

    if (!translation) {
      throw new Error('Translation result was empty.');
    }

    storeTranslationSession(trimmedKey, prompt, translation);
    return translation;
  } catch (error) {
    sessions.delete(trimmedKey);
    throw wrapGeminiError('translation', error);
  }
}

/**
 * Generates a concise Chinese headline based on the previously translated article.
 * @param {string} translatedContent
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function generateTitle(translatedContent, apiKey) {
  const trimmedKey = assertNonEmptyString(apiKey, 'Gemini API key');
  const translation = assertNonEmptyString(translatedContent, 'Translated content');
  const session = sessions.get(trimmedKey);

  if (!session) {
    throw new Error('No active translation session found. Call translate() before generateTitle().');
  }

  session.translation = translation;
  session.baseHistory[1] = { role: 'model', parts: [{ text: translation }] };

  try {
    const chat = createChat(trimmedKey, session.baseHistory);
    const response = await chat.sendMessage({ message: buildTitlePrompt(translation) });
    const title = (await extractResponseText(response)).trim();

    if (!title) {
      throw new Error('Title generation result was empty.');
    }

    return title;
  } catch (error) {
    throw wrapGeminiError('title generation', error);
  }
}

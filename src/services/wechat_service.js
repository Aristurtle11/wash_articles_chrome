const ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/stable_token';
const PERMANENT_MEDIA_URL = 'https://api.weixin.qq.com/cgi-bin/material/add_material';
const ARTICLE_IMAGE_UPLOAD_URL = 'https://api.weixin.qq.com/cgi-bin/media/uploadimg';
const DEFAULT_CACHE_BUFFER_MS = 5 * 60 * 1000;

const tokenCache = new Map();

/**
 * Ensures the provided credential value is a trimmed, non-empty string.
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
 * Builds the cache key for a given credential pair.
 * @param {string} appId
 * @param {string} appSecret
 * @returns {string}
 */
function buildCacheKey(appId, appSecret) {
  return `${appId}::${appSecret}`;
}

/**
 * Determines whether a cached token is still safe to use.
 * @param {{ token: string, expiresAt: number, buffer: number } | undefined} entry
 * @returns {boolean}
 */
function isCacheEntryValid(entry) {
  if (!entry) {
    return false;
  }

  const { expiresAt, buffer = 0 } = entry;
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  const now = Date.now();
  return expiresAt - buffer > now;
}

/**
 * Persists a token and its expiry metadata in the in-memory cache.
 * @param {string} cacheKey
 * @param {string} token
 * @param {number} ttlMs
 */
function cacheToken(cacheKey, token, ttlMs) {
  const safeTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 0;
  const expiresAt = Date.now() + safeTtlMs;
  const buffer = safeTtlMs > 0 ? Math.min(DEFAULT_CACHE_BUFFER_MS, Math.floor(safeTtlMs * 0.25)) : 0;

  tokenCache.set(cacheKey, { token, expiresAt, buffer });
}

/**
 * Issues the HTTP request to retrieve a fresh access token.
 * @param {string} appId
 * @param {string} appSecret
 * @returns {Promise<{ token: string, ttlMs: number }>}
 */
async function requestAccessToken(appId, appSecret) {
  let response;

  try {
    response = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`WeChat access token request failed: ${message}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`WeChat access token response was not valid JSON: ${message}`);
  }

  if (!response.ok) {
    const reason = typeof payload?.errmsg === 'string' && payload.errmsg.trim()
      ? payload.errmsg.trim()
      : `${response.status} ${response.statusText}`.trim();
    throw new Error(`WeChat access token request failed: ${reason}`);
  }

  if (typeof payload?.errcode === 'number' && payload.errcode !== 0) {
    const reason = typeof payload.errmsg === 'string' && payload.errmsg.trim()
      ? payload.errmsg.trim()
      : `Error code ${payload.errcode}`;
    throw new Error(`WeChat access token request failed: ${reason}`);
  }

  const token = typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
  if (!token) {
    throw new Error('WeChat access token response missing access_token.');
  }

  const expiresInSeconds = Number(payload?.expires_in);
  const ttlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds * 1000 : 0;

  return { token, ttlMs };
}

/**
 * Fetches (and caches) the WeChat access token for the provided credentials.
 * @param {string} appId
 * @param {string} appSecret
 * @returns {Promise<string>}
 */
export async function getAccessToken(appId, appSecret) {
  const trimmedAppId = assertNonEmptyString(appId, 'WeChat AppID');
  const trimmedSecret = assertNonEmptyString(appSecret, 'WeChat AppSecret');
  const cacheKey = buildCacheKey(trimmedAppId, trimmedSecret);

  const cached = tokenCache.get(cacheKey);
  if (isCacheEntryValid(cached)) {
    return cached.token;
  }

  const { token, ttlMs } = await requestAccessToken(trimmedAppId, trimmedSecret);
  cacheToken(cacheKey, token, ttlMs);
  return token;
}

/**
 * Clears all cached access tokens. Primarily used for testing or manual resets.
 */
export function clearTokenCache() {
  tokenCache.clear();
}

/**
 * Uploads a cover image as a permanent WeChat material.
 * @param {string} filePath
 * @param {string} token
 * @returns {Promise<{ media_id: string, url: string }>}
 */
export async function uploadCoverImage(filePath, token) {
  const resolvedPath = assertNonEmptyString(filePath, 'Cover image path');
  const trimmedToken = assertNonEmptyString(token, 'WeChat access token');
  const blob = await loadImageBlob(resolvedPath);
  const formData = new FormData();
  formData.append('media', blob, deriveFilename(resolvedPath, blob));

  let response;
  try {
    response = await fetch(buildWeChatUrl(PERMANENT_MEDIA_URL, trimmedToken, { type: 'image' }), {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    throw wrapWeChatTransportError('cover image upload', error);
  }

  const payload = await parseWeChatJson(response, 'cover image upload');
  ensureWeChatSuccess(response, payload, 'cover image upload');

  const mediaId = typeof payload?.media_id === 'string' ? payload.media_id.trim() : '';
  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';

  if (!mediaId || !url) {
    throw new Error('WeChat cover image upload response missing media_id or url.');
  }

  return { media_id: mediaId, url };
}

/**
 * Uploads an article inline image for WeChat content.
 * @param {string} filePath
 * @param {string} token
 * @returns {Promise<{ url: string }>}
 */
export async function uploadArticleImage(filePath, token) {
  const resolvedPath = assertNonEmptyString(filePath, 'Article image path');
  const trimmedToken = assertNonEmptyString(token, 'WeChat access token');
  const blob = await loadImageBlob(resolvedPath);
  const formData = new FormData();
  formData.append('media', blob, deriveFilename(resolvedPath, blob));

  let response;
  try {
    response = await fetch(buildWeChatUrl(ARTICLE_IMAGE_UPLOAD_URL, trimmedToken), {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    throw wrapWeChatTransportError('article image upload', error);
  }

  const payload = await parseWeChatJson(response, 'article image upload');
  ensureWeChatSuccess(response, payload, 'article image upload');

  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
  if (!url) {
    throw new Error('WeChat article image upload response missing url.');
  }

  return { url };
}

/**
 * Resolves the provided path into an image Blob.
 * @param {string} path
 * @returns {Promise<Blob>}
 */
async function loadImageBlob(path) {
  if (path.startsWith('data:')) {
    return dataUrlToBlob(path);
  }

  const target = resolveFetchUrl(path);
  let response;
  try {
    response = await fetch(target);
  } catch (error) {
    throw wrapWeChatTransportError('image fetch', error);
  }

  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim();
    throw new Error(`Failed to fetch image data: ${status}`);
  }

  try {
    return await response.blob();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read image data: ${message}`);
  }
}

/**
 * Converts a Data URL into a Blob instance.
 * @param {string} dataUrl
 * @returns {Blob}
 */
function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Unsupported Data URL format.');
  }

  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const length = binary.length;
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }

  return new Blob([buffer], { type: mimeType });
}

/**
 * Builds the upload filename from the source path and blob metadata.
 * @param {string} source
 * @param {Blob} blob
 * @returns {string}
 */
function deriveFilename(source, blob) {
  const candidate = extractFilenameFromPath(source);
  const extension = inferExtension(blob?.type) || inferExtensionFromName(candidate) || 'jpg';
  const baseName = candidate && candidate !== '/' ? candidate.replace(/\.[^.]+$/, '') : `image_${Date.now()}`;
  return `${baseName}.${extension}`;
}

/**
 * Extracts filename-like segment from a path.
 * @param {string} source
 * @returns {string}
 */
function extractFilenameFromPath(source) {
  const sanitized = source.split('#')[0]?.split('?')[0] ?? '';
  const segments = sanitized.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : sanitized || '';
}

/**
 * Infers an extension from a mime type.
 * @param {string} mime
 * @returns {string}
 */
function inferExtension(mime) {
  if (!mime) return '';
  const normalized = mime.split(';')[0]?.trim().toLowerCase();
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
  };
  return map[normalized] || '';
}

/**
 * Attempts to infer an extension from an existing filename.
 * @param {string} name
 * @returns {string}
 */
function inferExtensionFromName(name) {
  if (!name || !name.includes('.')) {
    return '';
  }
  const ext = name.split('.').pop()?.trim().toLowerCase();
  if (!ext) {
    return '';
  }
  const normalized = ext.replace(/[^a-z0-9]/gi, '');
  const allowed = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
  return allowed.has(normalized) ? normalized.replace(/^jpeg$/, 'jpg') : '';
}

/**
 * Ensures the provided response payload is successful.
 * @param {Response} response
 * @param {any} payload
 * @param {string} context
 */
function ensureWeChatSuccess(response, payload, context) {
  const errcodeRaw = payload?.errcode;
  const errcode = typeof errcodeRaw === 'number'
    ? errcodeRaw
    : typeof errcodeRaw === 'string'
      ? Number.parseInt(errcodeRaw, 10)
      : 0;

  if (response.ok && (!errcode || Number.isNaN(errcode))) {
    return;
  }

  const reason = typeof payload?.errmsg === 'string' && payload.errmsg.trim()
    ? payload.errmsg.trim()
    : `${response.status} ${response.statusText}`.trim();

  throw new Error(`WeChat ${context} failed: ${reason}${Number.isFinite(errcode) && errcode ? ` (errcode ${errcode})` : ''}`);
}

/**
 * Parses a WeChat JSON response with friendly errors.
 * @param {Response} response
 * @param {string} context
 * @returns {Promise<any>}
 */
async function parseWeChatJson(response, context) {
  try {
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`WeChat ${context} response was not valid JSON: ${message}`);
  }
}

/**
 * Builds the request URL with the required access token.
 * @param {string} baseUrl
 * @param {string} token
 * @param {Record<string, string>} [query]
 * @returns {string}
 */
function buildWeChatUrl(baseUrl, token, query = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Resolves arbitrary path strings into fetchable URLs.
 * @param {string} path
 * @returns {string}
 */
function resolveFetchUrl(path) {
  if (/^[a-z]+:\/\//i.test(path)) {
    return path;
  }

  if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
    return chrome.runtime.getURL(path.replace(/^\/+/, ''));
  }

  return path;
}

/**
 * Wraps low-level transport errors with a consistent message.
 * @param {string} context
 * @param {unknown} error
 * @returns {Error}
 */
function wrapWeChatTransportError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`WeChat ${context} request failed: ${message}`);
}

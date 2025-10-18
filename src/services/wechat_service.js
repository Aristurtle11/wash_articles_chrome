const ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/stable_token';
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

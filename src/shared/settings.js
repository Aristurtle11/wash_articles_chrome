/* global chrome */

const STORAGE_KEYS = Object.freeze({
  WECHAT_APP_ID: 'wechatAppId',
  WECHAT_APP_SECRET: 'wechatAppSecret',
  GEMINI_API_KEY: 'geminiApiKey',
});

const ALL_KEYS = Object.values(STORAGE_KEYS);

/**
 * @typedef {Object} Credentials
 * @property {string} wechatAppId
 * @property {string} wechatAppSecret
 * @property {string} geminiApiKey
 */

/**
 * Resolves the Chrome storage.local API, throwing if unavailable.
 * Having this helper keeps the exported functions small and focused.
 * @returns {chrome.storage.LocalStorageArea}
 */
function getStorageArea() {
  if (!chrome?.storage?.local) {
    throw new Error('chrome.storage.local is not available in this context.');
  }
  return chrome.storage.local;
}

/**
 * Reads the provided keys from chrome.storage.local.
 * @param {string[]} keys
 * @returns {Promise<Record<string, string>>}
 */
function readFromStorage(keys) {
  const storage = getStorageArea();
  return new Promise((resolve, reject) => {
    storage.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(items);
    });
  });
}

/**
 * Persists the provided key-value pairs into chrome.storage.local.
 * @param {Partial<Credentials>} payload
 * @returns {Promise<void>}
 */
function writeToStorage(payload) {
  const storage = getStorageArea();
  return new Promise((resolve, reject) => {
    storage.set(payload, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

/**
 * Retrieves all persisted credentials. Missing values are returned as empty strings.
 * @returns {Promise<Credentials>}
 */
export async function getCredentials() {
  const stored = await readFromStorage(ALL_KEYS);
  return {
    wechatAppId: stored[STORAGE_KEYS.WECHAT_APP_ID] ?? '',
    wechatAppSecret: stored[STORAGE_KEYS.WECHAT_APP_SECRET] ?? '',
    geminiApiKey: stored[STORAGE_KEYS.GEMINI_API_KEY] ?? '',
  };
}

/**
 * Returns only the WeChat credential pair (AppID + AppSecret).
 * @returns {Promise<{ appId: string, appSecret: string }>}
 */
export async function getWechatCredentials() {
  const { wechatAppId, wechatAppSecret } = await getCredentials();
  return {
    appId: wechatAppId,
    appSecret: wechatAppSecret,
  };
}

/**
 * Retrieves the stored Gemini API key.
 * @returns {Promise<string>}
 */
export async function getGeminiApiKey() {
  const { geminiApiKey } = await getCredentials();
  return geminiApiKey;
}

/**
 * Persists the provided subset of credentials. Unknown keys are ignored.
 * @param {Partial<Credentials>} credentials
 * @returns {Promise<void>}
 */
export async function setCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    throw new TypeError('setCredentials expects an object payload.');
  }

  /** @type {Partial<Credentials>} */
  const sanitized = {};

  for (const key of ALL_KEYS) {
    if (key in credentials) {
      const value = credentials[key] ?? '';
      sanitized[key] = typeof value === 'string' ? value : String(value);
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return;
  }

  await writeToStorage(sanitized);
}

/**
 * Subscribes to storage changes for the credential keys.
 * @param {(credentials: Credentials) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function onCredentialsChanged(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('onCredentialsChanged expects a callback function.');
  }

  const listener = (changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    const hasRelevantChange = ALL_KEYS.some((key) => Object.prototype.hasOwnProperty.call(changes, key));
    if (!hasRelevantChange) {
      return;
    }

    const nextCredentials = /** @type {Credentials} */ ({
      wechatAppId: changes[STORAGE_KEYS.WECHAT_APP_ID]?.newValue ?? '',
      wechatAppSecret: changes[STORAGE_KEYS.WECHAT_APP_SECRET]?.newValue ?? '',
      geminiApiKey: changes[STORAGE_KEYS.GEMINI_API_KEY]?.newValue ?? '',
    });

    callback(nextCredentials);
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

export const SETTINGS_KEYS = STORAGE_KEYS;

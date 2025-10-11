export const SETTINGS_KEY = "wash_articles_settings";
export const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "gemini-2.5-flash",
  updatedAt: null,
  wechatAppId: "",
  wechatAppSecret: "",
  wechatAccessToken: "",
  wechatTokenExpiresAt: null,
  wechatUpdatedAt: null,
  wechatDefaultAuthor: "",
  wechatOriginUrl: "",
  wechatThumbMediaId: "",
};

export function normalizeSettings(raw) {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
  };
}

export function maskApiKey(apiKey) {
  if (!apiKey) return "尚未配置";
  const visible = apiKey.slice(-4);
  return `••••••${visible}`;
}

export function maskToken(token) {
  if (!token) return "尚未配置";
  const visible = token.slice(-4);
  return `••••••${visible}`;
}

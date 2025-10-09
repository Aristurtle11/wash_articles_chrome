// 图片与历史记录存储工具，封装 chrome.storage.local。

const IMAGE_NAMESPACE = "wash_articles_images";
const HISTORY_NAMESPACE = "wash_articles_history";

export async function saveImages(sourceUrl, images) {
  if (!Array.isArray(images) || !images.length) return;
  const { [IMAGE_NAMESPACE]: existing = {} } = await chrome.storage.local.get(
    IMAGE_NAMESPACE,
  );
  existing[sourceUrl] = images;
  await chrome.storage.local.set({ [IMAGE_NAMESPACE]: existing });
}

export async function loadImages(sourceUrl) {
  if (!sourceUrl) return [];
  const { [IMAGE_NAMESPACE]: stored = {} } = await chrome.storage.local.get(IMAGE_NAMESPACE);
  return stored[sourceUrl] || [];
}

export async function clearImages(sourceUrl) {
  if (!sourceUrl) return;
  const { [IMAGE_NAMESPACE]: stored = {} } = await chrome.storage.local.get(IMAGE_NAMESPACE);
  if (sourceUrl in stored) {
    delete stored[sourceUrl];
    await chrome.storage.local.set({ [IMAGE_NAMESPACE]: stored });
  }
}

export async function appendHistory(entry) {
  if (!entry?.sourceUrl) return;
  const { [HISTORY_NAMESPACE]: history = [] } = await chrome.storage.local.get(
    HISTORY_NAMESPACE,
  );
  const filtered = history.filter((item) => item.sourceUrl !== entry.sourceUrl);
  filtered.unshift({ ...entry, savedAt: new Date().toISOString() });
  const limited = filtered.slice(0, 20);
  await chrome.storage.local.set({ [HISTORY_NAMESPACE]: limited });
}

export async function loadHistory() {
  const { [HISTORY_NAMESPACE]: history = [] } = await chrome.storage.local.get(
    HISTORY_NAMESPACE,
  );
  return history;
}

export async function clearHistory() {
  await chrome.storage.local.remove([HISTORY_NAMESPACE]);
}

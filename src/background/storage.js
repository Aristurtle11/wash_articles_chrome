// In-memory storage helpers for images and history.
// 使用服务工作线程生命周期的内存缓存，避免占用 chrome.storage 的配额。

const imageCache = new Map();
let historyEntries = [];

export async function saveImages(sourceUrl, images) {
  if (!sourceUrl || !Array.isArray(images)) {
    return;
  }
  imageCache.set(sourceUrl, cloneImages(images));
}

export async function loadImages(sourceUrl) {
  if (!sourceUrl) {
    return [];
  }
  const cached = imageCache.get(sourceUrl);
  return cloneImages(cached || []);
}

export async function clearImages(sourceUrl) {
  if (!sourceUrl) {
    return;
  }
  imageCache.delete(sourceUrl);
}

export async function appendHistory(entry) {
  if (!entry?.sourceUrl) {
    return;
  }
  historyEntries = historyEntries.filter((item) => item.sourceUrl !== entry.sourceUrl);
  historyEntries.unshift({
    ...entry,
    savedAt: new Date().toISOString(),
  });
  historyEntries = historyEntries.slice(0, 5);
}

export async function loadHistory() {
  return historyEntries.map((entry) => ({ ...entry }));
}

export async function clearHistory() {
  historyEntries = [];
}

export async function migrateImageCacheIfNeeded() {
  // no-op: in-memory implementation无需迁移
}

export function __resetStorageCachesForTests() {
  imageCache.clear();
  historyEntries = [];
}

function cloneImages(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({ ...item }));
}

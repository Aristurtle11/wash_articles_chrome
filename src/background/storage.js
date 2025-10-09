// 图片与正文缓存工具，封装 chrome.storage.local 操作。

const IMAGE_NAMESPACE = "wash_articles_images";

export async function saveImages(sourceUrl, images) {
  if (!Array.isArray(images) || !images.length) return;
  const { [IMAGE_NAMESPACE]: existing = {} } = await chrome.storage.local.get(IMAGE_NAMESPACE);
  existing[sourceUrl] = images;
  await chrome.storage.local.set({ [IMAGE_NAMESPACE]: existing });
}

export async function loadImages(sourceUrl) {
  const { [IMAGE_NAMESPACE]: stored = {} } = await chrome.storage.local.get(IMAGE_NAMESPACE);
  return stored[sourceUrl] || [];
}

export async function clearImages(sourceUrl) {
  const { [IMAGE_NAMESPACE]: stored = {} } = await chrome.storage.local.get(IMAGE_NAMESPACE);
  if (sourceUrl in stored) {
    delete stored[sourceUrl];
    await chrome.storage.local.set({ [IMAGE_NAMESPACE]: stored });
  }
}

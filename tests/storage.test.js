import { describe, it, beforeEach, expect } from 'vitest';

import {
  saveImages,
  loadImages,
  clearImages,
  appendHistory,
  loadHistory,
  clearHistory,
} from '../src/background/storage.js';

const storageData = {};

function resetStorage() {
  for (const key of Object.keys(storageData)) {
    delete storageData[key];
  }
}

function ensureChromeMock() {
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (!keys) {
            return { ...storageData };
          }
          if (Array.isArray(keys)) {
            return keys.reduce((acc, key) => {
              acc[key] = storageData[key];
              return acc;
            }, {});
          }
          if (typeof keys === 'string') {
            return { [keys]: storageData[keys] };
          }
          // object default values
          const entries = { ...keys };
          for (const [key, value] of Object.entries(entries)) {
            if (key in storageData) {
              entries[key] = storageData[key];
            }
          }
          return entries;
        },
        async set(items) {
          for (const [key, value] of Object.entries(items || {})) {
            storageData[key] = value;
          }
        },
        async remove(keys) {
          const arr = Array.isArray(keys) ? keys : [keys];
          arr.forEach((key) => {
            delete storageData[key];
          });
        },
      },
    },
  };
}

describe('storage helpers', () => {
  beforeEach(() => {
    ensureChromeMock();
    resetStorage();
  });

  it('saves and loads images by source url', async () => {
    const images = [
      { url: 'https://example.com/a.jpg', sequence: 1 },
      { url: 'https://example.com/b.jpg', sequence: 2 },
    ];

    await saveImages('https://example.com/article', images);
    const loaded = await loadImages('https://example.com/article');

    expect(loaded).toEqual(images);
  });

  it('does nothing when saving empty image list', async () => {
    await saveImages('https://example.com/article', []);
    const store = await chrome.storage.local.get('wash_articles_images');
    expect(store).toEqual({ wash_articles_images: undefined });
  });

  it('clears image cache by source url', async () => {
    const images = [{ url: 'https://example.com/a.jpg', sequence: 1 }];
    await saveImages('https://example.com/article', images);
    await clearImages('https://example.com/article');

    const loadedAfterClear = await loadImages('https://example.com/article');
    expect(loadedAfterClear).toEqual([]);
  });

  it('appends history, keeps newest first and limits to 20 entries', async () => {
    const makeEntry = (id) => ({
      sourceUrl: `https://example.com/article-${id}`,
      title: `文章 ${id}`,
      capturedAt: `2024-01-01T00:${String(id).padStart(2, '0')}:00Z`,
      counts: { paragraphs: id, headings: 0, images: 0 },
      items: [],
      images: [],
    });

    for (let i = 0; i < 25; i += 1) {
      await appendHistory(makeEntry(i));
    }

    const history = await loadHistory();

    expect(history.length).toBe(20);
    expect(history[0].sourceUrl).toBe('https://example.com/article-24');
    expect(history.at(-1).sourceUrl).toBe('https://example.com/article-5');
    expect(history[0].savedAt).toMatch(/T/);
  });

  it('deduplicates history by sourceUrl keeping latest entry', async () => {
    const entry = {
      sourceUrl: 'https://example.com/article',
      title: '旧标题',
      counts: { paragraphs: 1, headings: 0, images: 0 },
      items: [],
      images: [],
    };
    await appendHistory(entry);

    const updated = {
      ...entry,
      title: '新标题',
      counts: { paragraphs: 2, headings: 0, images: 1 },
    };
    await appendHistory(updated);

    const history = await loadHistory();
    expect(history.length).toBe(1);
    expect(history[0].title).toBe('新标题');
    expect(history[0].counts.paragraphs).toBe(2);
  });

  it('clears history', async () => {
    await appendHistory({
      sourceUrl: 'https://example.com/article',
      title: '文章',
      items: [],
      images: [],
    });
    await clearHistory();

    const history = await loadHistory();
    expect(history).toEqual([]);
  });
});

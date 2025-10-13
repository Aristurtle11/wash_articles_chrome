import { describe, it, beforeEach, expect } from 'vitest';

import {
  saveImages,
  loadImages,
  clearImages,
  appendHistory,
  loadHistory,
  clearHistory,
  __resetStorageCachesForTests,
} from '../src/background/storage.js';

describe('storage helpers', () => {
  beforeEach(async () => {
    __resetStorageCachesForTests();
  });

  it('saves and loads images by source url', async () => {
  const images = [
    { url: 'https://example.com/a.jpg', sequence: 1 },
    { url: 'https://example.com/b.jpg', sequence: 2 },
  ];

  await saveImages('https://example.com/article', images);
  const loaded = await loadImages('https://example.com/article');

  expect(loaded.map(({ url, sequence }) => ({ url, sequence }))).toEqual(images);
  });

  it('ignores empty image list', async () => {
    await saveImages('https://example.com/article', []);
    const loaded = await loadImages('https://example.com/article');
    expect(loaded).toEqual([]);
  });

  it('clears image cache by source url', async () => {
    const images = [{ url: 'https://example.com/a.jpg', sequence: 1 }];
    await saveImages('https://example.com/article', images);
    await clearImages('https://example.com/article');

    const loadedAfterClear = await loadImages('https://example.com/article');
    expect(loadedAfterClear).toEqual([]);
  });

  it('appends history, keeps newest first and limits to 5 entries', async () => {
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

  expect(history.length).toBe(5);
  expect(history[0].sourceUrl).toBe('https://example.com/article-24');
  expect(history.at(-1).sourceUrl).toBe('https://example.com/article-20');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockChatsCreate = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      chats = {
        create: mockChatsCreate,
      };
    },
  };
});

async function importServiceModule() {
  return import('../src/services/geminiService.js');
}

describe('geminiService', () => {
  beforeEach(() => {
    vi.resetModules();
    mockChatsCreate.mockReset();
  });

  it('translates content and then generates a title using a shared chat history', async () => {
    const translationChat = {
      sendMessage: vi.fn().mockResolvedValue({ text: '翻译后的正文' }),
    };
    const titleChat = {
      sendMessage: vi.fn().mockResolvedValue({ text: '理想标题' }),
    };

    mockChatsCreate
      .mockImplementationOnce((config) => {
        expect(config.history).toEqual([]);
        return translationChat;
      })
      .mockImplementationOnce((config) => {
        expect(config.history).toEqual([
          { role: 'user', parts: [{ text: expect.any(String) }] },
          { role: 'model', parts: [{ text: '翻译后的正文' }] },
        ]);
        return titleChat;
      });

    const { translate, generateTitle } = await importServiceModule();

    const translation = await translate('Original article body', 'test-key');
    expect(translation).toBe('翻译后的正文');
    expect(translationChat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Original article body') }),
    );

    const title = await generateTitle(translation, 'test-key');
    expect(title).toBe('理想标题');
    expect(titleChat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('翻译后的正文') }),
    );
  });

  it('throws if generateTitle is called before translate', async () => {
    const { generateTitle } = await importServiceModule();
    await expect(generateTitle('任何内容', 'fresh-key')).rejects.toThrow('Call translate() before generateTitle()');
    expect(mockChatsCreate).not.toHaveBeenCalled();
  });

  it('refreshes the translation segment when generateTitle receives updated content', async () => {
    const translationChat = {
      sendMessage: vi.fn().mockResolvedValue({ text: '首版译文' }),
    };
    const titleChat = {
      sendMessage: vi.fn().mockResolvedValue({ text: '更新标题' }),
    };

    mockChatsCreate
      .mockImplementationOnce(() => translationChat)
      .mockImplementationOnce((config) => {
        expect(config.history?.[1]?.parts?.[0]?.text).toBe('修订后的译文');
        return titleChat;
      });

    const { translate, generateTitle } = await importServiceModule();

    await translate('Original article', 'repeat-key');
    const title = await generateTitle('修订后的译文', 'repeat-key');
    expect(title).toBe('更新标题');
    expect(titleChat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('修订后的译文') }),
    );
  });
});


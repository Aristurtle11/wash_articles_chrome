import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createJsonResponse(payload, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(payload),
  };
}

const fetchMock = vi.fn();

async function importService() {
  return import('../src/services/wechat_service.js');
}

describe('wechat_service', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns a cached token on subsequent calls with the same credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ access_token: 'token-123', expires_in: 7200 }),
    );

    const { getAccessToken } = await importService();
    const first = await getAccessToken('appid', 'secret');
    const second = await getAccessToken('appid', 'secret');

    expect(first).toBe('token-123');
    expect(second).toBe('token-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token after expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ access_token: 'short-lived', expires_in: 1 }))
      .mockResolvedValueOnce(createJsonResponse({ access_token: 'refreshed', expires_in: 7200 }));

    const { getAccessToken } = await importService();

    const initial = await getAccessToken('appid', 'secret');
    expect(initial).toBe('short-lived');

    vi.advanceTimersByTime(2_000);

    const refreshed = await getAccessToken('appid', 'secret');
    expect(refreshed).toBe('refreshed');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('throws when the API responds with an error code', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ errcode: 40125, errmsg: 'invalid appsecret' }),
    );

    const { getAccessToken } = await importService();
    await expect(getAccessToken('appid', 'secret')).rejects.toThrow(
      'WeChat access token request failed: invalid appsecret',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// 简单内存状态，存储最近一次提取结果并响应 Popup 请求。

export class ContentStore {
  constructor() {
    this._dataByTabId = new Map();
    this._lastTabId = null;
  }

  set(tabId, payload) {
    if (!tabId || !payload) return;
    this._dataByTabId.set(tabId, payload);
    this._lastTabId = tabId;
  }

  get(tabId) {
    if (tabId) {
      return this._dataByTabId.get(tabId) ?? null;
    }
    if (this._lastTabId && this._dataByTabId.has(this._lastTabId)) {
      return this._dataByTabId.get(this._lastTabId) ?? null;
    }
    return null;
  }

  clear(tabId) {
    if (!tabId) return;
    this._dataByTabId.delete(tabId);
    if (this._lastTabId === tabId) {
      this._lastTabId = this._dataByTabId.size ? [...this._dataByTabId.keys()].pop() ?? null : null;
    }
  }

  update(tabId, updater) {
    if (!tabId) return;
    const current = this._dataByTabId.get(tabId) ?? null;
    const next =
      typeof updater === "function"
        ? updater(current)
        : current
        ? { ...current, ...updater }
        : updater;
    if (!next) return;
    this._dataByTabId.set(tabId, next);
  }

  latest() {
    if (this._lastTabId && this._dataByTabId.has(this._lastTabId)) {
      return this._dataByTabId.get(this._lastTabId) ?? null;
    }
    for (const value of this._dataByTabId.values()) {
      if (value) {
        return value;
      }
    }
    return null;
  }

  entries() {
    return Array.from(this._dataByTabId.entries()).map(([tabId, payload]) => ({
      tabId,
      payload,
    }));
  }
}

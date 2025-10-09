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
  }
}

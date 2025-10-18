console.info('Background service worker initialized');

chrome.runtime.onInstalled.addListener(() => {
  console.info('Extension installed and ready');
});

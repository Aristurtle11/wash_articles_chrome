console.info('Background service worker initialized');

chrome.runtime.onInstalled.addListener(() => {
  console.info('Extension installed and ready');
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'openPopup') {
    return;
  }

  if (!sender.tab?.id) {
    console.warn('openPopup message missing tab context');
    return;
  }

  chrome.action
    .openPopup({ tabId: sender.tab.id })
    .catch((error) => console.error('Failed to open popup', error));
});

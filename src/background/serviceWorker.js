console.info('Background service worker initialized');

chrome.runtime.onInstalled.addListener(() => {
  console.info('Extension installed and ready');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return;
  }

  if (message.type === 'openPopup') {
    handleOpenPopup(sender);
    return;
  }

  if (message.type === 'startProcessing') {
    handleStartProcessing(message, sendResponse);
    return true;
  }
});

function handleOpenPopup(sender) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    console.warn('openPopup message missing tab context');
    return;
  }

  chrome.action
    .openPopup({ tabId })
    .catch((error) => console.error('Failed to open popup', error));
}

function handleStartProcessing(message, sendResponse) {
  const tabId = typeof message.tabId === 'number' ? message.tabId : null;

  if (!tabId) {
    console.warn('startProcessing message missing tabId');
    sendResponse?.({ ok: false, error: 'Unable to determine target tab.' });
    return;
  }

  extractContentFromTab(tabId)
    .then((content) => {
      console.log('Extracted ArticleContent[] for tab', tabId, content);
      sendResponse?.({ ok: true });
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract content', errorMessage);
      sendResponse?.({ ok: false, error: errorMessage });
    });
}

async function extractContentFromTab(tabId) {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: runParserExtraction,
  });

  if (!execution || !execution.result) {
    throw new Error('Content extraction did not return a result.');
  }

  const { data, error } = execution.result;
  if (error) {
    throw new Error(error);
  }

  if (!Array.isArray(data)) {
    throw new Error('Parser returned an unexpected payload.');
  }

  return data;
}

async function runParserExtraction() {
  try {
    const module = await import(chrome.runtime.getURL('src/parsers/parserFactory.js'));
    const resolver = module.getParser ?? module.default;
    if (typeof resolver !== 'function') {
      return { error: 'Parser factory is unavailable.' };
    }

    const parser = resolver(window.location.href);
    if (!parser || typeof parser.extract !== 'function') {
      return { error: 'No parser available for this URL.' };
    }

    const content = await parser.extract();
    return { data: content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

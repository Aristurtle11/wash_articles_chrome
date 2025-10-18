const startButton = document.getElementById('startButton');
const settingsButton = document.getElementById('settingsButton');
const statusText = document.getElementById('statusText');

if (startButton && statusText) {
  startButton.addEventListener('click', async () => {
    statusText.textContent = 'Status: Starting...';

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        throw new Error('Unable to determine the active tab.');
      }

      const response = await chrome.runtime.sendMessage({
        type: 'startProcessing',
        tabId: activeTab.id,
      });

      if (response?.ok) {
        statusText.textContent = 'Status: Extracting content...';
        return;
      }

      if (response?.error) {
        statusText.textContent = `Status: ${response.error}`;
        return;
      }

      statusText.textContent = 'Status: Extraction initiated.';
    } catch (error) {
      console.error('Failed to start processing', error);
      statusText.textContent = 'Status: Failed to start.';
    }
  });
}

if (settingsButton) {
  settingsButton.addEventListener('click', async () => {
    try {
      await chrome.runtime.openOptionsPage();
    } catch (error) {
      console.error('Failed to open options page', error);
    }
  });
}

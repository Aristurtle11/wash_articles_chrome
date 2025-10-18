const startButton = document.getElementById('startButton');
const settingsButton = document.getElementById('settingsButton');
const statusText = document.getElementById('statusText');

if (startButton && statusText) {
  startButton.addEventListener('click', () => {
    statusText.textContent = 'Status: Awaiting workflow implementation...';
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

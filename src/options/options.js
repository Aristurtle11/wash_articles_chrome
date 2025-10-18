const STORAGE_KEYS = ['wechatAppId', 'wechatAppSecret', 'geminiApiKey'];
const STATUS_TIMEOUT_MS = 3000;

const form = document.querySelector('#credentials-form');
const saveButton = document.querySelector('#saveButton');
const statusMessage = document.querySelector('#statusMessage');

/**
 * Retrieves stored credentials from chrome.storage.local.
 * @returns {Promise<Record<string, string>>}
 */
function loadCredentials() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS, (items) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(items);
    });
  });
}

/**
 * Saves the provided credentials into chrome.storage.local.
 * @param {Record<string, string>} credentials
 * @returns {Promise<void>}
 */
function saveCredentials(credentials) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(credentials, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

/**
 * Updates the status message element with feedback for the user.
 * @param {string} message
 * @param {'idle' | 'success' | 'error'} type
 */
function setStatus(message, type = 'idle') {
  statusMessage.textContent = message;
  statusMessage.classList.remove('success', 'error');

  if (type === 'success' || type === 'error') {
    statusMessage.classList.add(type);
  }

  if (type === 'success') {
    setTimeout(() => {
      statusMessage.textContent = '';
      statusMessage.classList.remove('success');
    }, STATUS_TIMEOUT_MS);
  }
}

async function initializeForm() {
  try {
    const stored = await loadCredentials();
    STORAGE_KEYS.forEach((key) => {
      const input = form.querySelector(`#${key}`);
      if (input) {
        input.value = stored[key] || '';
      }
    });
  } catch (error) {
    console.error('Failed to load stored credentials:', error);
    setStatus('Unable to load saved credentials.', 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const credentials = STORAGE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = (formData.get(key) || '').trim();
    return accumulator;
  }, /** @type {Record<string, string>} */ ({}));

  saveButton.disabled = true;
  setStatus('Saving...');

  try {
    await saveCredentials(credentials);
    setStatus('Credentials saved.', 'success');
  } catch (error) {
    console.error('Failed to save credentials:', error);
    setStatus('Failed to save. Please try again.', 'error');
  } finally {
    saveButton.disabled = false;
  }
});

initializeForm();

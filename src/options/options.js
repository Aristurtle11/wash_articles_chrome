import { getCredentials, setCredentials, SETTINGS_KEYS } from '../shared/settings.js';

const CREDENTIAL_FIELDS = [
  SETTINGS_KEYS.WECHAT_APP_ID,
  SETTINGS_KEYS.WECHAT_APP_SECRET,
  SETTINGS_KEYS.GEMINI_API_KEY,
];
const STATUS_TIMEOUT_MS = 3000;

const form = document.querySelector('#credentials-form');
const saveButton = document.querySelector('#saveButton');
const statusMessage = document.querySelector('#statusMessage');

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
    const stored = await getCredentials();
    CREDENTIAL_FIELDS.forEach((key) => {
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
  const credentials = CREDENTIAL_FIELDS.reduce((accumulator, key) => {
    accumulator[key] = (formData.get(key) || '').trim();
    return accumulator;
  }, /** @type {Record<string, string>} */ ({}));

  saveButton.disabled = true;
  setStatus('Saving...');

  try {
    await setCredentials(credentials);
    setStatus('Credentials saved.', 'success');
  } catch (error) {
    console.error('Failed to save credentials:', error);
    setStatus('Failed to save. Please try again.', 'error');
  } finally {
    saveButton.disabled = false;
  }
});

initializeForm();

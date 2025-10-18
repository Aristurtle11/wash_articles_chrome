const BUTTON_ID = 'washr-start-button';
const STYLE_ID = 'washr-start-button-style';

const BUTTON_TEXT = 'Start';

if (window.top !== window.self) {
  // Do not inject into iframes.
  return;
}

const ensureButton = () => {
  if (document.getElementById(BUTTON_ID)) {
    return;
  }

  if (!document.body) {
    window.requestAnimationFrame(ensureButton);
    return;
  }

  injectStyles();

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = BUTTON_TEXT;
  button.addEventListener('click', handleClick);

  document.body.appendChild(button);
};

const injectStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 20px;
      border-radius: 9999px;
      border: none;
      background-color: #2563eb;
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 6px 12px rgba(37, 99, 235, 0.2);
      transition: transform 0.15s ease, box-shadow 0.2s ease;
    }

    #${BUTTON_ID}:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(37, 99, 235, 0.25);
    }

    #${BUTTON_ID}:active {
      transform: translateY(0);
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
    }
  `;

  (document.head || document.documentElement).appendChild(style);
};

const handleClick = (event) => {
  event.preventDefault();
  chrome.runtime
    .sendMessage({ type: 'openPopup' })
    .catch((error) => console.error('Failed to request popup open', error));
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureButton, { once: true });
} else {
  ensureButton();
}

# Technical Design Document (TDD)

## 1. System Architecture

The extension will follow a modular, event-driven architecture based on Chrome's Manifest V3 standards. The design emphasizes separation of concerns and extensibility, particularly for the content parsing module.

- **`content_script`**: Injected into supported web pages. Its sole responsibilities are to inject the UI trigger and to extract raw article data from the DOM when requested. It acts as the bridge between the web page and the extension's background logic.
- **`background_script`**: The central hub of the extension. It runs as a service worker, managing the application state, orchestrating the entire "wash" workflow, handling all communications with external APIs (WeChat, Gemini), and responding to events from the popup and content scripts.
- **`popup_script`**: Manages the user interface. It displays the current state, presents the final content, and sends user commands (e.g., "start," "regenerate") to the background script. It does not contain any business logic.
- **`options_script`**: Manages the settings page for configuring API keys and credentials.
- **Services (`/src/services/`)**: A directory containing modules that encapsulate all interactions with third-party APIs. This isolates external dependencies.
    - `wechatService.js`: Handles authentication, image uploads, and draft creation/updates for the WeChat API.
    - `geminiService.js`: Handles text translation and content generation via the Gemini API.
- **Parsers (`/src/parsers/`)**: A directory for website-specific content extractors. This is the key to the system's extensibility.
    - `realtorParser.js`: Implements the logic to extract content specifically from `realtor.com`.
    - `parserFactory.js`: A factory module that selects the appropriate parser based on the current page URL.

![Architecture Diagram](https://i.imgur.com/example.png)  <!-- Placeholder for a diagram -->

## 2. Data Structures

### 2.1. ArticleContent (Intermediate Representation)

This is the standardized data structure used to pass information from a parser to the background script. It decouples the extraction logic from the processing workflow.

```typescript
/**
 * @typedef {Object} ArticleElement
 * @property {'paragraph' | 'image'} type - The type of the content element.
 * @property {string} content - The text content (for paragraphs).
 * @property {string} src - The original image URL (for images).
 * @property {boolean} [isCover] - True if the image is the designated cover image.
 */

/** @type {ArticleElement[]} */
const ArticleContent = [
  { "type": "paragraph", "content": "This is the first paragraph..." },
  { "type": "image", "src": "https://example.com/image1.jpg", "isCover": true },
  // ... more elements
];
```

### 2.2. TabState

This object, managed by the background script, holds the state for each active tab where the extension is being used. The object keys are Tab IDs.

```typescript
/**
 * @typedef {'idle' | 'extracting' | 'translating' | 'uploading' | 'formatting' | 'done' | 'error'} Status
 *
 * @typedef {Object} TabState
 * @property {Status} status - The current status of the workflow.
 * @property {string | null} error - Error message if the status is 'error'.
 * @property {ArticleElement[]} originalContent - The content extracted from the page.
 * @property {string | null} translatedTitle - The generated title.
 * @property {string | null} formattedBody - The final HTML body for WeChat.
 * @property {string | null} wechatDraftId - The media_id of the created/updated draft.
 */

/** @type {Object.<number, TabState>} */
const tabsState = {
  101: { status: 'done', /* ...other properties */ },
  102: { status: 'idle', /* ...other properties */ }
};
```

## 3. API and Module Interfaces

### 3.1. `content_script` <> `background_script` Communication

- **Message:** `extractContent`
    - **Direction:** `popup` -> `background` -> `content_script`
    - **Payload:** `{ tabId: number }`
    - **Response:** `(from content_script)` `{ data: ArticleContent[] }` or `{ error: string }`

### 3.2. `popup_script` <> `background_script` Communication

- **Message:** `startProcessing`
    - **Direction:** `popup` -> `background`
    - **Payload:** `{ tabId: number }`
- **Message:** `regenerateTitle` / `regenerateBody`
    - **Direction:** `popup` -> `background`
    - **Payload:** `{ tabId: number }`
- **Message:** `getState`
    - **Direction:** `popup` -> `background`
    - **Payload:** `{ tabId: number }`
    - **Response:** `{ state: TabState }`
- **Message:** `stateUpdated`
    - **Direction:** `background` -> `popup`
    - **Payload:** `{ tabId: number, newState: TabState }`

### 3.3. Service Module Interfaces

- **`geminiService.js`**
    - > **Developer Note:** Implementation must follow the official SDK usage patterns detailed in [`docs/gemini_api/gemini_api_usage.md`](./gemini_api/gemini_api_usage.md). A multi-turn chat session should be used to first translate content and then generate a title based on the translation.
    - `translate(text: string, apiKey: string): Promise<string>`
    - `generateTitle(content: string, apiKey: string): Promise<string>`

- **`wechatService.js`**
    - > **Developer Note:** This service encapsulates all interactions with the WeChat Official Account API. Refer to the specific documentation for each function.
    - `getAccessToken(appId: string, appSecret: string): Promise<string>`
        - **Summary:** Fetches the stable `access_token`.
        - **Reference:** [`docs/wechat_official/wechat_official_token_fetch.md`](./wechat_official/wechat_official_token_fetch.md)
    - `uploadCoverImage(filePath: string, token: string): Promise<{ media_id: string, url: string }>`
        - **Summary:** Uploads the cover image as a permanent material to get a `media_id`.
        - **Reference:** [`docs/wechat_official/wechat_official_permanent_pic_upload.md`](./wechat_official/wechat_official_permanent_pic_upload.md)
    - `uploadArticleImage(filePath: string, token: string): Promise<{ url: string }>`
        - **Summary:** Uploads an image for embedding within the article content to get a URL. These do not count towards the permanent material limit.
        - **Reference:** [`docs/wechat_official/wechat_official_image-text_upload.md`](./wechat_official/wechat_official_image-text_upload.md)
    - `createDraft(draft: object, token: string): Promise<{ media_id: string }>`
        - **Summary:** Creates a new draft. The `content` field of the payload must be a valid HTML string.
        - **Formatting Guide:** The HTML structure must adhere to the rules outlined in [`docs/wechat_official/wechat_official_format_reference.md`](./wechat_official/wechat_official_format_reference.md).
        - **API Reference:** [`docs/wechat_official/wechat_official_draft_add.md`](./wechat_official/wechat_official_draft_add.md)
    - `updateDraft(media_id: string, draft: object, token: string): Promise<void>`
        - **Summary:** Updates an existing draft using its `media_id`. The API for updating is the same as for creating a new draft, but requires the `media_id` of the existing draft.
        - **Reference:** The process is similar to `createDraft`. Refer to the draft creation and update documentation.

- **`parserFactory.js`**
    - `getParser(url: string): IParser | null` (Returns an object that conforms to the IParser interface).

### 3.4. Parser Interface (`IParser`)

All parser modules must implement this interface.

```typescript
/**
 * @interface IParser
 */
class IParser {
  /**
   * Extracts content from the current page's DOM.
   * @returns {Promise<ArticleElement[]>}
   */
  extract() {}
}
```

## 4. State Management

- The `background_script` will maintain a JavaScript `Map` or plain `Object` to store the `TabState` for each tab, keyed by the `tab.id`.
- **Initialization:** A new state entry is created when `startProcessing` is first called for a tab.
- **Updates:** The state is updated sequentially as the workflow progresses. After each step, a `stateUpdated` message is broadcast to the relevant popup.
- **Cleanup:** Listeners for `chrome.tabs.onUpdated` and `chrome.tabs.onRemoved` will be used.
    - If a tab is refreshed or navigates to a new URL within the same tab, its corresponding state in the map will be deleted.
    - If a tab is closed, its state will be deleted.

## 5. Error Handling Strategy

Errors will be explicitly caught at each critical step of the workflow. When an error occurs, the `status` in the `TabState` will be set to `'error'`, and a user-friendly message will be stored in the `error` property. The UI will then display this message.

- **Configuration Errors:** `wechatService` and `geminiService` will validate credentials on the first API call. Failure (e.g., 401/403 response) will trigger an error state with a message like "Invalid WeChat/Gemini credentials. Please check the settings."
- **Parsing Failures:** If a parser fails to find the required DOM elements, it will throw an error, which will be caught by the background script. The error message will be "Failed to extract content. The website structure may have changed."
- **API Failures:** Network errors or API-specific errors (e.g., rate limiting, invalid requests) from WeChat or Gemini will be caught. The state will be updated with the API response message.
- **Token Expiry:** `wechatService` will proactively handle Access Token expiration. If an API call fails with an expired token error, it will automatically request a new token and retry the original request once. If the retry also fails, it will propagate the error.

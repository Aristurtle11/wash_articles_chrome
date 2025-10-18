# Incremental Development Plan (PROGRESS.md)

> **Developer Guidance:** Before starting the tasks below, it is crucial to understand both the product vision and the technical architecture.
> 1.  **First, read the [MVP.md](./MVP.md) document** to understand the core features and user value.
> 2.  **Next, thoroughly review the [Technical Design Document (TDD.md)](./TDD.md)** for a detailed breakdown of the architecture, data structures, and module contracts you will be implementing.
>
> ### Development Workflow
> To ensure clarity and a clean version history, please adhere to the following workflow:
> 1.  **Work on one task at a time.**
> 2.  **Mark your progress in this file** using the following indicators:
>     - `[ ]` - **To Do:** The task has not been started.
>     - `[>]` - **In Progress:** You are currently working on this task.
>     - `[x]` - **Done:** The task is complete and tested.
> 3.  **Commit after each completed task.** Once you have marked a task as `[x]`, stage all your changes (`git add .`) and create a commit.
> 4.  **Use clear commit messages.** The commit message should reference the completed task. For example: `feat(core): Complete Task 1.1 - Basic Extension Scaffolding`.

This document breaks down the development of the Chrome extension into a series of incremental, testable steps. Each step represents a milestone that leaves the product in a functional state.

## Milestone 1: Core Setup & Configuration

**Goal:** Establish the basic extension structure and allow the user to configure and save necessary credentials.

- [ ] **Task 1.1: Basic Extension Scaffolding**
    - Create `manifest.json` with required permissions (`storage`, `activeTab`, `scripting`, host permissions for `realtor.com`).
    - Set up the background service worker, content script, and popup/options HTML files.
- [ ] **Task 1.2: Options UI**
    - Create `src/options/index.html` with input fields for WeChat AppID, AppSecret, and Gemini API Key.
    - Implement `src/options/options.js` to save these values to `chrome.storage.local`.
    - Ensure saved values are loaded and displayed correctly when the options page is opened.
- [ ] **Task 1.3: Shared Settings Module**
    - Create `src/shared/settings.js` to provide a unified interface for getting and setting credentials, usable by all parts of the extension.
- [ ] **Task 1.4: Popup UI Skeleton**
    - Create `src/popup/index.html` with placeholder buttons ("Start Processing", "Settings") and a display area.
    - Link the "Settings" button to open the options page.

**Testable State:** The extension can be loaded. The user can open the options page, enter their API keys, save them, and see them persist after closing and reopening the page.

## Milestone 2: Content Extraction & Parsing

**Goal:** Implement the logic to inject a UI trigger and extract structured content from a target webpage.

- [ ] **Task 2.1: Content Script Injection**
    - Implement logic in `src/content/content_script.js` to inject a "Start" button into the bottom-right corner of `realtor.com` pages.
    - Clicking the button should open the extension's popup.
- [ ] **Task 2.2: Realtor.com Parser**
    - Create `src/parsers/realtorParser.js`.
    - Implement the `extract()` method to traverse the DOM of a `realtor.com` news/advice article and extract all text paragraphs and images.
    - Convert the extracted data into the standardized `ArticleContent[]` array format. The first image found should be marked with `isCover: true`.
- [ ] **Task 2.3: Parser Factory**
    - Create `src/parsers/parserFactory.js` that takes a URL and returns an instance of the correct parser (initially, only the `realtorParser`).
- [ ] **Task 2.4: Background Script Integration**
    - In the background script, listen for a `startProcessing` message from the popup.
    - Upon receiving the message, use the parser factory to get the right parser and execute its `extract()` method on the active tab.
    - For now, `console.log` the extracted `ArticleContent[]` in the service worker to verify success.

**Testable State:** When on a `realtor.com` article, a button appears. Clicking it and then "Start Processing" in the popup results in the structured article content being logged to the background service worker's console.

## Milestone 3: API Service Integration (Translation & WeChat Auth)

**Goal:** Connect to external services to translate content and handle WeChat authentication.

- [ ] **Task 3.1: Gemini Service**
    - Create `src/services/geminiService.js`.
    - Implement the `translate()` and `generateTitle()` functions.
    - **Reference:** [`docs/gemini_api/gemini_api_usage.md`](./gemini_api/gemini_api_usage.md)
- [ ] **Task 3.2: WeChat Service (Authentication)**
    - Create `src/services/wechat_service.js`.
    - Implement `getAccessToken()` to fetch and cache the WeChat access token.
    - **Reference:** [`docs/wechat_official/wechat_official_token_fetch.md`](./wechat_official/wechat_official_token_fetch.md)
- [ ] **Task 3.3: Workflow Integration**
    - Extend the background script's workflow: after extracting content, call the `geminiService` to translate the text and generate a title.
    - `console.log` the translated results.

**Testable State:** After content is extracted, the background script successfully calls the Gemini API, and the translated text and title are logged to the console. The WeChat access token is also successfully fetched and logged.

## Milestone 4: Image Uploads & Draft Creation

**Goal:** Upload images to WeChat and create an initial draft.

- [ ] **Task 4.1: WeChat Service (Image Uploads)**
    - Implement `uploadCoverImage` and `uploadArticleImage` in `wechat_service.js`.
    - **Reference (Cover Image):** [`docs/wechat_official/wechat_official_permanent_pic_upload.md`](./wechat_official/wechat_official_permanent_pic_upload.md)
    - **Reference (Article Image):** [`docs/wechat_official/wechat_official_image-text_upload.md`](./wechat_official/wechat_official_image-text_upload.md)
- [ ] **Task 4.2: HTML Formatting**
    - Create a formatter module (`src/background/formatter.js`) that generates a final HTML string.
    - **Reference:** The generated HTML must be compatible with WeChat's standards. See [`docs/wechat_official/wechat_official_format_reference.md`](./wechat_official/wechat_official_format_reference.md).
- [ ] **Task 4.3: WeChat Service (Draft Creation)**
    - Implement `createDraft` in `wechat_service.js`.
    - **Reference:** [`docs/wechat_official/wechat_official_draft_add.md`](./wechat_official/wechat_official_draft_add.md)
- [ ] **Task 4.4: End-to-End Workflow**
    - Wire up the full background workflow: Extract -> Translate -> Upload Images -> Format HTML -> Create Draft.
    - Store the returned `media_id` of the new draft in the tab's state.

## Milestone 5: UI Polish & State Management

**Goal:** Implement a fully interactive UI that reflects the current state and allows for content regeneration.

- [ ] **Task 5.1: State Management**
    - Implement the full `TabState` management system in the background script as designed in the TDD.
    - Ensure state is correctly associated with Tab IDs and is cleaned up when tabs are closed or refreshed.
- [ ] **Task 5.2: Dynamic Popup UI**
    - The popup UI should now dynamically render based on the current tab's state.
    - It should display status messages ("Translating...", "Uploading...", "Done!").
    - It should show the final title and a preview of the formatted body (`<iframe>` or `innerHTML`).
    - It should display error messages clearly if the state is `'error'`.
- [ ] **Task 5.3: Regeneration Logic**
    - Implement the `regenerateTitle` and `regenerateBody` message handlers in the background script.
    - Implement `updateDraft` in `wechat_service.js`.
    - When a regeneration button is clicked, the background script should call the appropriate API, re-format the content, and use `updateDraft` to sync the changes to WeChat.
    - The UI should update instantly with the new content.
- [ ] **Task 5.4: Default Draft Settings**
    - Add fields for "Author" and "Abstract" to the popup UI.
    - Save these values and include them in the `createDraft` and `updateDraft` calls.

**Testable State:** The extension is fully functional. The UI provides clear feedback. Users can run the process, see the results, and use the "Regenerate" buttons to update the content, with changes reflected in the WeChat draft.

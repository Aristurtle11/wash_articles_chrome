# Project Overview

This project is a Chrome extension named "Wash Articles Extension". Its main purpose is to extract the main text and images from web pages,整理正文并排版，再将内容准备好以发布到微信公众号草稿箱。

## Key Technologies

*   **Manifest V3:** The extension is built using the modern Chrome extension Manifest V3 architecture.
*   **JavaScript Modules:** The codebase is structured using ES modules (`"type": "module"` in `package.json`).
*   **Vitest:** The project uses Vitest for unit testing.
*   **JSDOM:** JSDOM is used as a dev dependency, likely for testing purposes in a Node.js environment.

## Architecture

The extension is divided into several components:

*   **Background Script (`src/background/service_worker.js`):** This is the core of the extension。它负责内容与图片缓存、历史记录维护，并编排“洗稿”流程：正文整理 → 图片上传 → 排版 → 生成公众号草稿。
*   **Content Script (`src/content/content_script.js`):** This script is injected into web pages that match the host permissions (例如 `https://www.realtor.com/news/*`、`https://www.realtor.com/advice/finance/*`)。它负责从 DOM 中提取正文内容。
*   **Popup (`src/popup/`):** This provides the main user interface for the extension, allowing users to trigger the content extraction and see the results.
*   **Options Page (`src/options/`):** 该页面用于配置公众号 AppID / AppSecret 等凭证，并触发 Access Token 获取；不再需要翻译类 API 配置。
*   **Shared Code (`src/shared/`):** This directory contains code that is shared between different parts of the extension, such as settings management.

# Building and Running

## Installation

1.  Clone the repository.
2.  Run `npm install` to install the dependencies.
3.  Open Chrome and navigate to `chrome://extensions`.
4.  Enable "Developer mode".
5.  Click "Load unpacked" and select the project directory.

## Running Tests

To run the tests, use the following command:

```bash
npm test
```

# Development Conventions

*   **Testing:** The project has a testing setup using Vitest. Test files are located alongside the files they test (e.g., `formatter.js` and `formatter.test.js`).
*   **Modularity:** The code is well-structured into modules with clear responsibilities.
*   **State Management:** The background script manages the application state, which is shared with the popup and other components through message passing.

# Project Overview

This project is a Chrome extension named "Wash Articles Extension". Its main purpose is to extract the main text and images from web pages, translate them, and prepare them for publication, specifically targeting WeChat Official Accounts.

## Key Technologies

*   **Manifest V3:** The extension is built using the modern Chrome extension Manifest V3 architecture.
*   **JavaScript Modules:** The codebase is structured using ES modules (`"type": "module"` in `package.json`).
*   **Vitest:** The project uses Vitest for unit testing.
*   **JSDOM:** JSDOM is used as a dev dependency, likely for testing purposes in a Node.js environment.

## Architecture

The extension is divided into several components:

*   **Background Script (`src/background/service_worker.js`):** This is the core of the extension. It manages the application state, handles content caching, image caching, history, and orchestrates the entire "washing" process which includes translation and formatting. It also communicates with the WeChat API.
*   **Content Script (`src/content/content_script.js`):** This script is injected into web pages that match the host permissions (e.g., `https://www.realtor.com/news/*`). It's responsible for extracting the article content from the DOM.
*   **Popup (`src/popup/`):** This provides the main user interface for the extension, allowing users to trigger the content extraction and see the results.
*   **Options Page (`src/options/`):** This page allows users to configure the extension's settings, such as API keys for translation services and WeChat credentials.
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

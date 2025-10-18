# MVP (Minimum Viable Product) Document

> **Developer Reference:** This document defines the *what* and *why* from a user's perspective. For the detailed *how*, developers must consult the following technical documents before implementation:
> - **[Technical Design Document (TDD.md)](./TDD.md):** The primary technical blueprint. It details the software architecture, data structures, and module interfaces.
> - **[gemini_prompts.md](./gemini_prompts.md):** Contains the original product requirements, user workflow descriptions, and specific engineering constraints that shaped this MVP.
> - **API Documentation:** The `docs/wechat_official/` and `docs/gemini_api/` directories contain the official API documentation necessary for implementing the service modules.

## 1. Core Value Proposition

To provide content creators, specifically real estate agents, with a one-click solution to transform articles from specified English websites (e.g., realtor.com) into well-formatted, translated content ready for publication in their WeChat Official Account drafts, drastically reducing manual effort and time.

## 2. Target Audience

- **Primary:** Real estate agents who use WeChat Official Accounts for content marketing and wish to share relevant articles from international sources with their Chinese-speaking audience.
- **Secondary:** Any content creator who needs to quickly translate and republish web articles to their WeChat Official Account.

## 3. Core Feature Set (First Version)

The first version will focus on delivering the end-to-end automated workflow for a single, pre-defined website source.

### 3.1. Content Extraction
- **Supported Website:** The extension will initially only support articles from `https://www.realtor.com/news/*` and `https://www.realtor.com/advice/*`.
- **Automatic Injection:** The extension will automatically inject a trigger button onto pages matching the supported URLs.
- **Content Parsing:** It will extract the main text paragraphs and images from the article, preserving their relative order.

### 3.2. Configuration & Security
- **Settings Panel:** A dedicated options page for users to input and save their credentials.
- **Required Credentials:**
    - WeChat Official Account AppID
    - WeChat Official Account AppSecret
    - Gemini API Key
- **Local Storage:** All credentials will be stored securely on the user's local machine using Chrome's storage API.

### 3.3. Core Automation Workflow
- **One-Click Trigger:** A "Start Processing" button in the popup UI will initiate the entire workflow.
- **AI Translation:** Use the Gemini API to translate the extracted text into Chinese.
- **AI Title Generation:** Use the Gemini API to generate a suitable title based on the translated content.
- **Image Handling:**
    - Upload the designated cover image to WeChat as a permanent asset.
    - Upload all other images to WeChat to get their respective URLs for embedding.
- **Formatting:** Automatically format the translated text and uploaded images into an HTML structure compatible with the WeChat Official Account editor.
- **Draft Creation:** Automatically create a new draft in the user's WeChat Official Account with the generated title, formatted content, and cover image.

### 3.4. User Interface (Popup)
- **Status Display:** The UI will show the current status of the process (e.g., Idle, Processing, Complete, Error).
- **Content Preview:** Upon completion, the UI will display the generated title and a preview of the formatted body content.
- **Regeneration:** Provide "Regenerate" buttons for both the title and the body content, allowing users to request a new version from the AI if they are not satisfied.
- **Draft Sync:** Any regenerated content will automatically update the existing draft in the WeChat Official Account.
- **Draft Settings:** Allow the user to set a default author and abstract for the drafts.

### 3.5. State Management
- **Tab-Specific State:** The extension's state (e.g., processing status, content preview) will be tied to the specific browser tab it was initiated from.
- **State Reset:** The state for a given tab will be reset upon page refresh.
- **Isolation:** Opening a new tab will present a clean, initial state for the extension, independent of other tabs.

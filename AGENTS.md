# Repository Guidelines

## Project Structure & Module Organization
The extension code lives in `src/`. `background/` houses the service worker orchestration for extraction, storage, and WeChat publishing. `content/` scripts read article DOM, while `popup/` and `options/` deliver the user UI. Shared utilities and default settings reside in `src/shared/`. Static assets (sponsor banner, profile card) are in `asset/` and are resolved via `chrome.runtime.getURL`. Tests that exercise browser-neutral logic sit alongside modules as `*.test.js`, with broader scenarios and fixtures under `tests/`. Keep docs, UX copy, and product direction in `docs/`.

## Build, Test, and Development Commands
Run `npm install` before first use to sync dependencies. Execute `npm test` (Vitest) to run the headless unit suite; use `npx vitest --watch` during development for fast feedback. Load the unpacked extension from the repository root in Chrome to test UI changes and manually open `tests/extractor_spec.html` when validating DOM extraction.

## Coding Style & Naming Conventions
Write modern ES modules (`import`/`export`) and target Chrome’s MV3 APIs. Follow existing 2-space indentation, trailing commas in multi-line literals, and camelCase identifiers; reserve PascalCase for classes and snake_case for filenames (for example `service_worker.js`). Prefer small, pure functions and async/await over promise chains. Localize user-facing strings and keep Chinese developer comments in place to aid current maintainers.

## Testing Guidelines
Add or update Vitest specs near the affected module and keep cross-module scenarios in `tests/`. Name tests with the `.test.js` suffix and describe the behavior under test. Mock storage and network layers through existing helpers in `src/background/storage.js` to avoid hitting real services. Before opening a PR, run `npm test` and verify the extension flow manually if the change touches Chrome APIs or DOM parsing.

## Commit & Pull Request Guidelines
Mirror the current history by writing concise, imperative commit subjects (the team often prefers Chinese verbs, e.g., “修复缓存刷新”). Group related changes per commit and avoid mixing refactors with feature work. PRs should include: a summary of the user-visible impact, linked issue or task ID, screenshots/GIFs for popup/options UI tweaks, and notes on manual validation results or test gaps. Tag reviewers familiar with the touched surface area and respond promptly to feedback.

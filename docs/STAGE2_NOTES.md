# 阶段二：翻译与排版需求分析

## 现有 Python 实现梳理
- `wash_articles/src/ai/translator.py`: 使用 Google Gemini 客户端，将提取出来的段落文本按文件翻译成中文，核心逻辑包括 prompt 模板和输出文件写入。
- `wash_articles/src/ai/formatter.py`: 在翻译结果基础上生成简单的 HTML，重点是使用 AI Prompt 将段落与标题排版成适合微信公众号的结构，并在 postprocess 中移除多余空格。
- 相关配置均通过 `load_config()` 获取路径、模型、提示词等参数，流程分为「原文 → 翻译文本 → HTML 排版」三步。

## Chrome 插件目标拆分
1. **翻译能力**
   - 直接在 Service Worker 中集成 `@google/genai`，使用 Gemini 模型完成英文 → 中文翻译；API Key 由用户配置，保存在 `chrome.storage.sync`。
   - 支持按段落批量翻译，并缓存译文以利于排版与导出。
2. **排版生成**
   - 目标输出：富文本（HTML/Markdown）+ 结构化内容（供后续 WeChat 上传使用）。  
   - 可参考 Formatter 的提示词，或改写为前端模板：按照段落、标题、图片顺序渲染；自动插入占位图、引用等元素。
   - 需要可视化预览区域，允许用户微调（例如手动编辑标题、删除段落）。
3. **导出/交互**
   - 支持导出 Markdown/HTML 文本、复制到剪贴板。  
   - 将翻译与排版结果写入历史记录，以便复用。

## 技术路径建议
- **翻译实现**：  
  - 引入 `@google/genai`，在 Service Worker 中创建 `GoogleGenAI` 客户端：  
    ```js
    import { GoogleGenAI } from "@google/genai";
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text }] }],
    });
    const output = response.text();
    ```  
  - 为扩展添加 `https://generativelanguage.googleapis.com/*` host 权限，处理请求失败、限流和重试。
- **状态管理**：  
  - 继续使用 `ContentStore` + `chrome.storage.local`，扩展字段：`translation.status`（idle/working/done）、`translation.text`、`formatted.html/markdown`。  
  - 提供 API Key 持久化与安全处理（`chrome.storage.sync` + runtime 通道）。
- **UI**：  
  - Popup 内新增页签或侧边栏：  
    - 原文区：显示提取的段落。  
    - 翻译区：显示译文、进度和错误信息。  
    - 排版区：渲染 HTML 预览，提供导出/复制按钮。  
  - 额外提供设置页（Options Page）让用户输入/更新 Gemini API Key。

## 下一步（阶段二实施步骤草案）
1. **配置管理**：构建 API Key 输入与存储逻辑（Options + Popup 提示），后台可读取配置。
2. **翻译执行**：封装 Gemini 翻译服务，支持批量段落翻译、进度播报、错误重试，并写入 `ContentStore` 与历史记录。
3. **排版渲染**：实现基于译文的模板渲染器；必要时调用 Gemini 优化段落；生成 HTML/Markdown 供预览与导出。
4. **流程整合**：在 Popup 中串联“提取→翻译→排版”，用户可复制/导出结果，历史记录同步译文与排版内容。
5. **测试计划**：为翻译服务编写单元测试（mock Gemini 客户端），并手动验证整条流程。

完成以上分析后，可依据草案进入具体开发。

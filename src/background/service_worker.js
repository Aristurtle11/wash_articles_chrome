// Chrome 扩展服务工作线程入口。
// 后续将负责与内容脚本通信、统一状态管理以及微信公众号的自动化流程。

console.info("[WashArticles] 服务工作线程已加载：", new Date().toISOString());

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[WashArticles] 扩展安装/更新事件：", details);
});

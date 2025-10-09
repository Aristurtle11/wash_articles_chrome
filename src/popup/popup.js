const sourceUrlEl = document.getElementById("source-url");
const summaryListEl = document.getElementById("summary-list");
const summaryEmptyEl = document.getElementById("summary-empty");

function renderSummary(items) {
  summaryListEl.innerHTML = "";
  if (!items || !items.length) {
    summaryEmptyEl.style.display = "block";
    return;
  }
  summaryEmptyEl.style.display = "none";
  const counts = items.reduce(
    (acc, item) => {
      if (!item || typeof item !== "object") return acc;
      if (item.kind === "paragraph") acc.paragraphs += 1;
      else if (item.kind === "image") acc.images += 1;
      else if (item.kind === "heading") acc.headings += 1;
      return acc;
    },
    { paragraphs: 0, images: 0, headings: 0 },
  );
  const fragments = [
    `段落：${counts.paragraphs}`,
    `小标题：${counts.headings}`,
    `图片：${counts.images}`,
  ];
  fragments.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    summaryListEl.appendChild(li);
  });
}

function render(payload) {
  if (!payload) {
    sourceUrlEl.textContent = "暂无数据";
    renderSummary([]);
    return;
  }
  sourceUrlEl.textContent = payload.sourceUrl ?? "未知来源";
  renderSummary(payload.items ?? []);
}

chrome.runtime.sendMessage({ type: "wash-articles/get-content" }, (response) => {
  render(response?.payload ?? null);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "wash-articles/content-updated") {
    render(message.payload);
  }
});

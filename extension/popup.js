const openaiStatus = document.getElementById("openai-status");
const feishuStatus = document.getElementById("feishu-status");
const openOptions = document.getElementById("open-options");

function setBadge(el, ok, okText, missingText) {
  el.textContent = ok ? okText : missingText;
  el.className = `badge ${ok ? "ok" : "missing"}`;
}

chrome.runtime.sendMessage({ type: "check_auth" }, (result) => {
  setBadge(openaiStatus, !!result?.openai, "已配置", "未配置");
  setBadge(feishuStatus, !!result?.feishu, "已授权", "未授权");
});

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

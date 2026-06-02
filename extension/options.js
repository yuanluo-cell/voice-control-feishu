// Options page logic: save OpenAI key + trigger Feishu OAuth.

const $ = (id) => document.getElementById(id);

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `status status-${type}`;
  el.style.display = "block";
}

async function loadSaved() {
  $("feishu-redirect-uri").value = chrome.identity.getRedirectURL("feishu");

  const data = await chrome.storage.local.get([
    "openai_key",
    "feishu_app_id",
    "feishu_app_secret",
    "feishu_user_token",
  ]);
  if (data.openai_key) {
    $("openai-key").value = "sk-...已保存";
    showStatus($("openai-status"), "✓ 已配置", "ok");
  }
  if (data.feishu_app_id) {
    $("feishu-app-id").value = data.feishu_app_id;
  }
  if (data.feishu_app_secret) {
    $("feishu-app-secret").value = "●●●●●●已保存";
  }
  if (data.feishu_user_token) {
    showStatus($("feishu-status"), "✓ 飞书已授权", "ok");
  }
  if (data.feishu_scopes) {
    $("feishu-scopes").textContent = `已授权 scopes: ${data.feishu_scopes}`;
    $("feishu-scopes").style.display = "block";
  }
}

$("copy-redirect-uri").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("feishu-redirect-uri").value);
  showStatus($("feishu-status"), "✓ Redirect URL 已复制", "ok");
});

$("save-openai").addEventListener("click", async () => {
  const key = $("openai-key").value.trim();
  if (!key || key === "sk-...已保存") return;
  await chrome.storage.local.set({ openai_key: key });
  showStatus($("openai-status"), "✓ 已保存", "ok");
});

$("feishu-oauth").addEventListener("click", async () => {
  const appId = $("feishu-app-id").value.trim();
  const appSecret = $("feishu-app-secret").value.trim();
  if (!appId || !appSecret || appSecret === "●●●●●●已保存") {
    showStatus($("feishu-status"), "请填写 App ID 和 App Secret", "err");
    return;
  }
  showStatus($("feishu-status"), "正在跳转飞书授权...", "pending");
  const result = await chrome.runtime.sendMessage({
    type: "feishu_oauth",
    appId,
    appSecret,
  });
  if (result.ok) {
    await chrome.storage.local.set({ feishu_app_id: appId, feishu_app_secret: appSecret });
    showStatus($("feishu-status"), "✓ 飞书授权成功", "ok");
    const data = await chrome.storage.local.get("feishu_scopes");
    if (data.feishu_scopes) {
      $("feishu-scopes").textContent = `已授权 scopes: ${data.feishu_scopes}`;
      $("feishu-scopes").style.display = "block";
    }
  } else {
    showStatus($("feishu-status"), `授权失败: ${result.error}`, "err");
  }
});

$("feishu-logout").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "feishu_logout" });
  $("feishu-scopes").style.display = "none";
  showStatus($("feishu-status"), "已清除飞书授权，请重新授权", "pending");
});

loadSaved();

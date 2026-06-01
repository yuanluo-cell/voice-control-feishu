/* MV3 service worker: receives page context from content.js and POSTs to local server. */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "postContext") {
    fetch("http://127.0.0.1:17890/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }
  return false;
});

/* Capture lightweight Feishu page context for voice-feishu desktop. */

function postCtx(payload) {
  chrome.runtime.sendMessage(
    { type: "postContext", payload },
    (_response) => {
      // ignore response / lastError
    }
  );
}

function grab() {
  const url = window.location.href;
  const title = document.title || "";
  let docToken = null;
  const docx = url.match(/\/docx\/([A-Za-z0-9]+)/);
  const wiki = url.match(/\/wiki\/([A-Za-z0-9]+)/);
  if (docx) docToken = docx[1];
  else if (wiki) docToken = wiki[1];
  const sel = (window.getSelection() && window.getSelection().toString()) || "";
  postCtx({
    url,
    title,
    doc_token: docToken,
    doc_url: url,
    selected_text: sel.slice(0, 8000),
  });
}

grab();
setInterval(grab, 4000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) grab();
});

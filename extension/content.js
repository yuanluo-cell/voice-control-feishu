// Content script: floating voice widget + audio capture/playback + page context.

(function () {
  if (document.getElementById("vf-widget")) return;

  // --- Page context ---
  function grabContext() {
    const url = window.location.href;
    const title = document.title || "";
    const selectedText = window.getSelection()?.toString().trim() || "";
    const visibleText = document.body.innerText
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
    let docToken = null;
    let tokenType = null;
    const docx = url.match(/\/docx\/([A-Za-z0-9]+)/);
    const wiki = url.match(/\/wiki\/([A-Za-z0-9]+)/);
    if (docx) {
      docToken = docx[1];
      tokenType = "docx";
    } else if (wiki) {
      docToken = wiki[1];
      tokenType = "wiki";
    }
    return {
      url,
      title,
      doc_token: docToken,
      token_type: tokenType,
      selected_text: selectedText.slice(0, 6000),
      visible_text: visibleText,
    };
  }

  // --- State ---
  let port = null;
  let mediaStream = null;
  let audioCtx = null;
  let workletNode = null;
  let playbackCtx = null;
  let playbackQueue = [];
  let isPlaying = false;
  let state = "idle"; // idle | connecting | listening | thinking | speaking

  // --- UI ---
  const widget = document.createElement("div");
  widget.id = "vf-widget";
  widget.innerHTML = `
    <div id="vf-drag" title="拖动">⋮⋮</div>
    <button id="vf-btn" title="Voice Feishu">
      <svg id="vf-icon-mic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
      <svg id="vf-icon-stop" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="display:none">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
    </button>
    <div id="vf-status"></div>
    <div id="vf-error-panel" style="display:none">
      <div id="vf-error-head">
        <span>Voice Feishu 报错</span>
        <button id="vf-error-copy" type="button">复制</button>
        <button id="vf-error-close" type="button">关闭</button>
      </div>
      <textarea id="vf-error-text" readonly></textarea>
    </div>
  `;
  document.body.appendChild(widget);

  const btn = document.getElementById("vf-btn");
  const dragHandle = document.getElementById("vf-drag");
  const statusEl = document.getElementById("vf-status");
  const iconMic = document.getElementById("vf-icon-mic");
  const iconStop = document.getElementById("vf-icon-stop");
  const errorPanel = document.getElementById("vf-error-panel");
  const errorText = document.getElementById("vf-error-text");
  const errorCopy = document.getElementById("vf-error-copy");
  const errorClose = document.getElementById("vf-error-close");

  function setState(s) {
    state = s;
    widget.classList.remove(
      "vf-state-idle",
      "vf-state-connecting",
      "vf-state-listening",
      "vf-state-thinking",
      "vf-state-speaking",
      "vf-state-error"
    );
    widget.classList.add(`vf-state-${s}`);
    const labels = { idle: "", connecting: "连接中…", listening: "聆听中", thinking: "思考中…", speaking: "回复中" };
    statusEl.textContent = labels[s] || "";
    iconMic.style.display = s === "listening" ? "none" : "block";
    iconStop.style.display = s === "listening" ? "block" : "none";
  }
  setState("idle");

  function clampWidgetPosition(x, y) {
    const rect = widget.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  }

  function placeWidget(x, y) {
    const pos = clampWidgetPosition(x, y);
    widget.style.left = `${pos.x}px`;
    widget.style.top = `${pos.y}px`;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
    widget.classList.toggle("vf-left-side", pos.x < window.innerWidth / 2);
    return pos;
  }

  async function loadWidgetPosition() {
    const saved = await chrome.storage.local.get("vf_widget_position");
    const pos = saved.vf_widget_position;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      placeWidget(pos.x, pos.y);
      return;
    }
    requestAnimationFrame(() => {
      placeWidget(window.innerWidth - widget.offsetWidth - 24, window.innerHeight - widget.offsetHeight - 24);
    });
  }

  function showError(msg) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
    stopRecording();
    errorText.value = text;
    errorPanel.style.display = "block";
    statusEl.textContent = "出错";
    widget.classList.remove(
      "vf-state-idle",
      "vf-state-connecting",
      "vf-state-listening",
      "vf-state-thinking",
      "vf-state-speaking"
    );
    widget.classList.add("vf-state-error");
    state = "idle";
  }

  errorCopy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(errorText.value);
    errorCopy.textContent = "已复制";
    setTimeout(() => { errorCopy.textContent = "复制"; }, 1200);
  });

  errorClose.addEventListener("click", () => {
    errorPanel.style.display = "none";
    setState("idle");
  });

  let dragState = null;
  dragHandle.addEventListener("pointerdown", (e) => {
    const rect = widget.getBoundingClientRect();
    dragState = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    dragHandle.setPointerCapture(e.pointerId);
  });

  dragHandle.addEventListener("pointermove", (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    placeWidget(e.clientX - dragState.offsetX, e.clientY - dragState.offsetY);
  });

  dragHandle.addEventListener("pointerup", async (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const rect = widget.getBoundingClientRect();
    dragState = null;
    await chrome.storage.local.set({ vf_widget_position: { x: rect.left, y: rect.top } });
  });

  window.addEventListener("resize", () => {
    const rect = widget.getBoundingClientRect();
    placeWidget(rect.left, rect.top);
  });

  loadWidgetPosition();

  // --- Port connection ---
  function ensurePort() {
    if (port) return port;
    port = chrome.runtime.connect({ name: "voice-feishu" });
    port.onMessage.addListener(handleBgMessage);
    port.onDisconnect.addListener(() => { port = null; setState("idle"); });
    return port;
  }

  function handleBgMessage(msg) {
    switch (msg.type) {
      case "status":
        if (msg.status === "ready" && state === "connecting") setState("listening");
        else if (msg.status === "thinking") setState("thinking");
        else if (msg.status === "ready" && state !== "idle") setState("idle");
        else if (msg.status === "disconnected") setState("idle");
        break;
      case "audio_delta":
        setState("speaking");
        playAudioDelta(msg.delta);
        break;
      case "error":
        showError(msg.msg);
        break;
    }
  }

  // --- Audio Recording (ScriptProcessorNode fallback for simplicity) ---
  const SAMPLE_RATE = 24000;

  async function startRecording() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true },
    });
    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioCtx.createMediaStreamSource(mediaStream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (state !== "listening") return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
      port?.postMessage({ type: "audio_chunk", data: b64 });
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
  }

  function stopRecording() {
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  }

  // --- Audio Playback ---
  function playAudioDelta(b64) {
    const raw = atob(b64);
    const int16 = new Int16Array(raw.length / 2);
    for (let i = 0; i < int16.length; i++) {
      int16[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    }
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    playbackQueue.push(float32);
    drainPlayback();
  }

  function drainPlayback() {
    if (isPlaying || playbackQueue.length === 0) return;
    isPlaying = true;
    if (!playbackCtx) playbackCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const chunk = playbackQueue.shift();
    const buf = playbackCtx.createBuffer(1, chunk.length, SAMPLE_RATE);
    buf.copyToChannel(chunk, 0);
    const src = playbackCtx.createBufferSource();
    src.buffer = buf;
    src.connect(playbackCtx.destination);
    src.onended = () => { isPlaying = false; drainPlayback(); };
    src.start();
  }

  // --- Button handler ---
  btn.addEventListener("click", async () => {
    errorPanel.style.display = "none";
    if (state === "idle") {
      setState("connecting");
      const p = ensurePort();
      p.postMessage({ type: "start_session", context: grabContext() });
      try {
        await startRecording();
      } catch (e) {
        showError(e.message);
      }
    } else if (state === "listening") {
      stopRecording();
      setState("thinking");
      port?.postMessage({ type: "commit_audio" });
    } else {
      stopRecording();
      port?.postMessage({ type: "stop_session" });
      setState("idle");
    }
  });

  // Keep context fresh
  setInterval(() => {
    if (port) port.postMessage({ type: "update_context", context: grabContext() });
  }, 5000);
})();

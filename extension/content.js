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
  let currentPlaybackSource = null;
  let isPlaying = false;
  let speakerEnabled = true;
  let currentUserMsg = null;
  let currentUserDraft = "";
  let currentAssistantMsg = null;
  let state = "idle"; // idle | connecting | listening | thinking | speaking

  // --- UI ---
  const widget = document.createElement("div");
  widget.id = "vf-widget";
  widget.innerHTML = `
    <div id="vf-panel">
      <div id="vf-head">
        <div id="vf-drag" title="拖动">⋮⋮</div>
        <button id="vf-btn" title="Voice Feishu">
          <svg id="vf-icon-mic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          <svg id="vf-icon-stop" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:none">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>
        <div id="vf-meta">
          <div id="vf-state-label">准备就绪</div>
          <div id="vf-status"></div>
        </div>
        <button id="vf-speaker" class="vf-icon-btn active" title="听筒开启" type="button">
          <svg class="vf-speaker-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 5 6 9H2v6h4l5 4V5Z"/>
            <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
          </svg>
          <svg class="vf-speaker-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
            <path d="M11 5 6 9H2v6h4l5 4V5Z"/>
            <path d="m19 9-4 4"/>
            <path d="m15 9 4 4"/>
          </svg>
        </button>
      </div>
      <div id="vf-transcript" aria-live="polite"></div>
    </div>
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
  const stateLabel = document.getElementById("vf-state-label");
  const iconMic = document.getElementById("vf-icon-mic");
  const iconStop = document.getElementById("vf-icon-stop");
  const transcriptEl = document.getElementById("vf-transcript");
  const speakerBtn = document.getElementById("vf-speaker");
  const speakerOnIcon = speakerBtn.querySelector(".vf-speaker-on");
  const speakerOffIcon = speakerBtn.querySelector(".vf-speaker-off");
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
    const labels = {
      idle: ["准备就绪", "点击话筒开始"],
      connecting: ["连接中", "正在连接 Realtime"],
      listening: ["聆听中", "再次点击提交语音"],
      thinking: ["生成中", "正在读取上下文并组织回复"],
      speaking: ["正在回复", speakerEnabled ? "再次点击话筒可截断" : "仅显示文字"],
    };
    stateLabel.textContent = labels[s]?.[0] || "准备就绪";
    statusEl.textContent = labels[s]?.[1] || "";
    iconMic.style.display = s === "idle" || s === "connecting" ? "block" : "none";
    iconStop.style.display = s === "idle" || s === "connecting" ? "none" : "block";
  }
  setState("idle");

  function appendMessage(role, text) {
    const msg = document.createElement("div");
    msg.className = `vf-msg ${role}`;
    msg.textContent = text;
    transcriptEl.appendChild(msg);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    return msg;
  }

  function appendAssistantDelta(delta) {
    if (!delta) return;
    if (!currentAssistantMsg) currentAssistantMsg = appendMessage("assistant", "");
    currentAssistantMsg.textContent += delta;
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function beginUserTranscription() {
    currentUserDraft = "";
    currentUserMsg = appendMessage("user", "正在识别...");
  }

  function appendUserTranscriptionDelta(delta) {
    if (!delta) return;
    if (!currentUserMsg) beginUserTranscription();
    currentUserDraft += delta;
    currentUserMsg.textContent = currentUserDraft;
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function finishUserTranscription(transcript) {
    if (!currentUserMsg) currentUserMsg = appendMessage("user", "");
    const text = (transcript || currentUserDraft).trim();
    currentUserMsg.textContent = text || "（未识别到语音）";
    currentUserMsg = null;
    currentUserDraft = "";
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function finishAssistantMessage() {
    currentAssistantMsg = null;
  }

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
    stateLabel.textContent = "出错";
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

  speakerBtn.addEventListener("click", () => {
    speakerEnabled = !speakerEnabled;
    speakerBtn.classList.toggle("active", speakerEnabled);
    speakerBtn.title = speakerEnabled ? "听筒开启" : "听筒关闭";
    speakerOnIcon.style.display = speakerEnabled ? "block" : "none";
    speakerOffIcon.style.display = speakerEnabled ? "none" : "block";
    if (!speakerEnabled) clearPlayback();
    if (state === "speaking") setState("speaking");
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
      case "text_delta":
        setState("speaking");
        appendAssistantDelta(msg.delta);
        break;
      case "text_done":
        finishAssistantMessage();
        break;
      case "user_text_delta":
        appendUserTranscriptionDelta(msg.delta);
        break;
      case "user_text_done":
        finishUserTranscription(msg.transcript);
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
    if (!speakerEnabled) return;
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
    currentPlaybackSource = src;
    src.onended = () => {
      if (currentPlaybackSource === src) currentPlaybackSource = null;
      isPlaying = false;
      drainPlayback();
    };
    src.start();
  }

  function clearPlayback() {
    playbackQueue = [];
    if (currentPlaybackSource) {
      currentPlaybackSource.onended = null;
      try {
        currentPlaybackSource.stop();
      } catch (_) {
        // Already stopped.
      }
      currentPlaybackSource = null;
    }
    isPlaying = false;
  }

  // --- Button handler ---
  btn.addEventListener("click", async () => {
    errorPanel.style.display = "none";
    if (state === "idle") {
      currentUserMsg = null;
      currentUserDraft = "";
      currentAssistantMsg = null;
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
      beginUserTranscription();
      setState("thinking");
      port?.postMessage({ type: "commit_audio" });
    } else {
      stopRecording();
      clearPlayback();
      port?.postMessage({ type: "cancel_response" });
      port?.postMessage({ type: "stop_session" });
      finishAssistantMessage();
      setState("idle");
    }
  });

  // Keep context fresh
  setInterval(() => {
    if (port) port.postMessage({ type: "update_context", context: grabContext() });
  }, 5000);
})();

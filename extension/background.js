// Background service worker: OpenAI Realtime WebSocket + Feishu tool dispatch.
import { FEISHU_TOOLS, SYSTEM_PROMPT } from "./tools.js";
import {
  searchContact,
  fetchDocMarkdown,
  searchMinutes,
  sendMessage,
  createCalendarEvent,
  getUserAccessToken,
  MVP_SCOPES,
  refreshAccessToken,
} from "./feishu-api.js";

const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime-2";
const SAMPLE_RATE = 24000;

let ws = null;
let port = null;
let pageContext = {};
let responseInProgress = false;
let currentResponseHadText = false;
let handledFunctionCalls = new Set();

// --- Credential helpers ---

async function getConfig() {
  const data = await chrome.storage.local.get([
    "openai_key",
    "feishu_app_id",
    "feishu_app_secret",
    "feishu_user_token",
    "feishu_refresh_token",
    "feishu_token_expires",
    "feishu_scopes",
  ]);
  return data;
}

async function getFeishuToken() {
  const cfg = await getConfig();
  if (!cfg.feishu_user_token) return null;
  if (cfg.feishu_token_expires && Date.now() > cfg.feishu_token_expires - 300000) {
    const result = await refreshAccessToken(
      cfg.feishu_app_id,
      cfg.feishu_app_secret,
      cfg.feishu_refresh_token
    );
    if (result.access_token) {
      await chrome.storage.local.set({
        feishu_user_token: result.access_token,
        feishu_refresh_token: result.refresh_token,
        feishu_token_expires: Date.now() + result.expires_in * 1000,
      });
      return result.access_token;
    }
  }
  return cfg.feishu_user_token;
}

// --- Tool execution ---

async function executeTool(name, argsStr) {
  const args = JSON.parse(argsStr || "{}");
  const token = await getFeishuToken();
  if (!token) return JSON.stringify({ error: "飞书未授权，请在扩展设置页完成 OAuth。" });

  try {
    switch (name) {
      case "feishu_contact_search":
        return JSON.stringify(await searchContact(token, args.query));
      case "feishu_doc_fetch_markdown": {
        const docToken = args.doc_token || pageContext.doc_token;
        if (!docToken) return JSON.stringify({ error: "No doc_token available" });
        try {
          const content = await fetchDocMarkdown(token, docToken);
          return content.slice(0, 4000);
        } catch (e) {
          const fallbackText = pageContext.selected_text || pageContext.visible_text;
          if (fallbackText) {
            return JSON.stringify({
              api_error: e.message,
              fallback: "Feishu API 读取失败，以下是浏览器页面可见文本，可先基于它回答。",
              page_title: pageContext.title || "",
              page_url: pageContext.url || "",
              token_type: pageContext.token_type || "unknown",
              visible_text: fallbackText.slice(0, 4000),
            });
          }
          return JSON.stringify({ error: e.message });
        }
      }
      case "feishu_minutes_search":
        return JSON.stringify(await searchMinutes(token, args.query));
      case "feishu_message_send":
        if (!args.confirm) {
          return JSON.stringify({
            preview: true,
            recipient: args.recipient_user_id,
            content: args.content,
            msg: "请用户确认后再传 confirm=true",
          });
        }
        return JSON.stringify(
          await sendMessage(token, args.recipient_user_id, args.content, args.message_type)
        );
      case "feishu_calendar_event_create":
        if (!args.confirm) {
          return JSON.stringify({
            preview: true,
            title: args.title,
            start: args.start_time,
            end: args.end_time,
            msg: "请用户确认后再传 confirm=true",
          });
        }
        return JSON.stringify(
          await createCalendarEvent(
            token, args.title, args.start_time, args.end_time,
            args.attendee_user_ids, args.description
          )
        );
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// --- WebSocket lifecycle ---

async function openRealtimeSession() {
  const cfg = await getConfig();
  if (!cfg.openai_key) {
    port?.postMessage({ type: "error", msg: "请先在扩展设置页输入 OpenAI API Key" });
    return;
  }

  ws = new WebSocket(REALTIME_URL, [
    "realtime",
    `openai-insecure-api-key.${cfg.openai_key}`,
  ]);

  ws.onopen = () => {
    port?.postMessage({ type: "status", status: "connected" });
  };

  ws.onmessage = async (evt) => {
    const event = JSON.parse(evt.data);
    const kind = event.type;

    if (kind === "session.created") {
      responseInProgress = false;
      handledFunctionCalls = new Set();
      let instructions = SYSTEM_PROMPT;
      if (pageContext.doc_token) {
        instructions += `\n\n【当前页面】标题: ${pageContext.title || ""}, doc_token: ${pageContext.doc_token}`;
      }
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions,
          output_modalities: ["audio"],
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: SAMPLE_RATE,
              },
              transcription: {
                model: "gpt-4o-mini-transcribe",
              },
              turn_detection: null,
            },
            output: {
              format: {
                type: "audio/pcm",
                rate: SAMPLE_RATE,
              },
              voice: "shimmer",
            },
          },
          tools: FEISHU_TOOLS,
          tool_choice: "auto",
        },
      }));
    }

    if (kind === "session.updated") {
      port?.postMessage({ type: "status", status: "ready" });
    }

    if (kind === "response.audio.delta" || kind === "response.output_audio.delta") {
      port?.postMessage({ type: "audio_delta", delta: event.delta });
    }

    if (kind === "conversation.item.input_audio_transcription.delta") {
      port?.postMessage({ type: "user_text_delta", delta: event.delta || "" });
    }

    if (kind === "conversation.item.input_audio_transcription.completed") {
      port?.postMessage({ type: "user_text_done", transcript: event.transcript || "" });
    }

    if (
      kind === "response.audio_transcript.delta" ||
      kind === "response.output_text.delta" ||
      kind === "response.text.delta"
    ) {
      currentResponseHadText = true;
      port?.postMessage({ type: "text_delta", delta: event.delta || "" });
    }

    if (
      kind === "response.audio_transcript.done" ||
      kind === "response.output_text.done" ||
      kind === "response.text.done"
    ) {
      port?.postMessage({ type: "text_done" });
    }

    if (kind === "response.function_call_arguments.done") {
      if (handledFunctionCalls.has(event.call_id)) return;
      handledFunctionCalls.add(event.call_id);
      port?.postMessage({ type: "status", status: "thinking" });
      const output = await executeTool(event.name, event.arguments);
      ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: event.call_id, output },
      }));
      responseInProgress = false;
      createResponse();
    }

    if (kind === "response.done") {
      responseInProgress = false;
      const fnCall = event.response?.output?.find((item) => item.type === "function_call");
      if (fnCall) {
        if (handledFunctionCalls.has(fnCall.call_id)) return;
        handledFunctionCalls.add(fnCall.call_id);
        port?.postMessage({ type: "status", status: "thinking" });
        const output = await executeTool(fnCall.name, fnCall.arguments);
        ws.send(JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: fnCall.call_id, output },
        }));
        createResponse();
        return;
      }
      if (!currentResponseHadText) {
        const text = extractResponseText(event.response);
        if (text) port?.postMessage({ type: "text_delta", delta: text });
      }
      port?.postMessage({ type: "text_done" });
      port?.postMessage({ type: "status", status: "ready" });
    }

    if (kind === "error") {
      const err = event.error || event;
      port?.postMessage({
        type: "error",
        msg: err.message || err.error_description || JSON.stringify(err),
      });
    }
  };

  ws.onerror = () => {
    port?.postMessage({ type: "error", msg: "WebSocket 连接失败" });
  };

  ws.onclose = () => {
    ws = null;
    responseInProgress = false;
    handledFunctionCalls = new Set();
    port?.postMessage({ type: "status", status: "disconnected" });
  };
}

function createResponse() {
  if (!ws || ws.readyState !== WebSocket.OPEN || responseInProgress) return;
  responseInProgress = true;
  currentResponseHadText = false;
  ws.send(JSON.stringify({ type: "response.create" }));
}

function cancelResponse() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !responseInProgress) return;
  ws.send(JSON.stringify({ type: "response.cancel" }));
  responseInProgress = false;
  currentResponseHadText = false;
}

function extractResponseText(response) {
  const chunks = [];
  for (const item of response?.output || []) {
    for (const content of item.content || []) {
      const text = content.transcript || content.text || content.output_text;
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function closeRealtimeSession() {
  if (ws) {
    ws.close();
    ws = null;
  }
  responseInProgress = false;
  handledFunctionCalls = new Set();
}

// --- Port-based messaging with content script ---

chrome.runtime.onConnect.addListener((p) => {
  if (p.name !== "voice-feishu") return;
  port = p;

  p.onMessage.addListener(async (msg) => {
    switch (msg.type) {
      case "start_session":
        pageContext = msg.context || {};
        await openRealtimeSession();
        break;
      case "stop_session":
        closeRealtimeSession();
        break;
      case "audio_chunk":
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.data }));
        }
        break;
      case "commit_audio":
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          createResponse();
          port?.postMessage({ type: "status", status: "thinking" });
        }
        break;
      case "cancel_response":
        cancelResponse();
        port?.postMessage({ type: "status", status: "ready" });
        break;
      case "update_context":
        pageContext = msg.context || {};
        break;
    }
  });

  p.onDisconnect.addListener(() => {
    port = null;
    closeRealtimeSession();
  });
});

// --- OAuth handler ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "feishu_oauth") {
    handleFeishuOAuth(msg.appId, msg.appSecret).then(sendResponse);
    return true;
  }
  if (msg.type === "check_auth") {
    getConfig().then((cfg) => {
      sendResponse({
        openai: !!cfg.openai_key,
        feishu: !!cfg.feishu_user_token,
        feishu_scopes: cfg.feishu_scopes || "",
      });
    });
    return true;
  }
  if (msg.type === "feishu_logout") {
    chrome.storage.local
      .remove([
        "feishu_user_token",
        "feishu_refresh_token",
        "feishu_token_expires",
        "feishu_scopes",
      ])
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleFeishuOAuth(appId, appSecret) {
  const redirectUri = chrome.identity.getRedirectURL("feishu");
  const authUrl =
    `https://open.feishu.cn/open-apis/authen/v1/authorize?` +
    `app_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(MVP_SCOPES.join(" "))}`;

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
    const url = new URL(responseUrl);
    const code = url.searchParams.get("code");
    if (!code) return { ok: false, error: "No auth code received" };

    const result = await getUserAccessToken(appId, appSecret, code);
    if (result.access_token) {
      await chrome.storage.local.set({
        feishu_app_id: appId,
        feishu_app_secret: appSecret,
        feishu_user_token: result.access_token,
        feishu_refresh_token: result.refresh_token,
        feishu_token_expires: Date.now() + result.expires_in * 1000,
        feishu_scopes: result.scope || "",
      });
      return { ok: true };
    }
    return {
      ok: false,
      error: result.error_description || result.msg || result.error || `Token exchange failed: ${JSON.stringify(result)}`,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

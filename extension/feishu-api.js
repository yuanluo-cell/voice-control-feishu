// Feishu Open Platform API wrappers.
// All calls use user_access_token for user-scoped operations.

const BASE = "https://open.feishu.cn/open-apis";
export const MVP_SCOPES = [
  "docx:document:readonly",
  "docs:document.content:read",
  "search:docs:read",
  "minutes:minutes.search:read",
  "minutes:minutes.basic:read",
  "vc:note:read",
  "vc:meeting.meetingevent:read",
  "vc:record:readonly",
  "im:message",
  "contact:user:search",
];

async function feishuFetch(path, token, options = {}) {
  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (data.code && data.code !== 0) {
    throw new Error(`Feishu API error ${data.code}: ${data.msg}`);
  }
  return data;
}

// --- Token Management ---

export async function getUserAccessToken(appId, appSecret, code) {
  const resp = await fetch(`${BASE}/authen/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: chrome.identity.getRedirectURL("feishu"),
    }),
  });
  return resp.json();
}

export async function refreshAccessToken(appId, appSecret, refreshToken) {
  const resp = await fetch(`${BASE}/authen/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: appId,
      client_secret: appSecret,
      refresh_token: refreshToken,
    }),
  });
  return resp.json();
}

// --- Business APIs ---

export async function searchContact(token, query) {
  const data = await feishuFetch(
    `/search/v1/user?query=${encodeURIComponent(query)}&page_size=5`,
    token
  );
  const users = (data.data && data.data.users) || [];
  return users.map((u) => ({
    name: u.name,
    open_id: u.open_id,
    department: u.department_name || "",
    email: u.email || "",
  }));
}

export async function fetchDocMarkdown(token, docToken) {
  const data = await feishuFetch(
    `/docx/v1/documents/${docToken}/raw_content`,
    token
  );
  return (data.data && data.data.content) || "";
}

export async function searchMinutes(token, query) {
  const data = await feishuFetch(
    `/minutes/v1/minutes?query=${encodeURIComponent(query)}&page_size=5`,
    token
  );
  return (data.data && data.data.minutes) || [];
}

export async function sendMessage(token, userId, content, msgType = "text") {
  const body =
    msgType === "markdown"
      ? JSON.stringify({ content })
      : JSON.stringify({ text: content });
  const data = await feishuFetch(
    `/im/v1/messages?receive_id_type=open_id`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        receive_id: userId,
        msg_type: msgType === "markdown" ? "post" : "text",
        content: body,
      }),
    }
  );
  return data.data;
}

export async function createCalendarEvent(
  token,
  title,
  startTime,
  endTime,
  attendeeIds = [],
  description = ""
) {
  const data = await feishuFetch(
    `/calendar/v4/calendars/primary/events`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        summary: title,
        description,
        start_time: { timestamp: new Date(startTime).getTime().toString() },
        end_time: { timestamp: new Date(endTime).getTime().toString() },
        attendee_ability: "can_modify_event",
        attendees: attendeeIds.map((id) => ({ type: "user", user_id: id })),
      }),
    }
  );
  return data.data;
}

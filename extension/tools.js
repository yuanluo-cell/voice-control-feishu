// OpenAI Realtime function-calling tool definitions for Feishu operations.
// Ported from desktop/tools/schemas.py

export const FEISHU_TOOLS = [
  {
    type: "function",
    name: "feishu_contact_search",
    description: "Search Feishu contacts by name keyword.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or keyword to search" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "feishu_doc_fetch_markdown",
    description:
      "Fetch current Feishu doc body as markdown. Use doc_token from browser context if available.",
    parameters: {
      type: "object",
      properties: {
        doc_token: { type: "string", description: "Document token (from URL path)" },
        doc_url: { type: "string", description: "Full document URL (fallback)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "feishu_minutes_search",
    description: "Search meeting minutes / notes.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword for meeting minutes" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "feishu_message_send",
    description:
      "Send a text or markdown message to a Feishu user. Call with confirm=false first for preview.",
    parameters: {
      type: "object",
      properties: {
        recipient_user_id: { type: "string", description: "Target user open_id" },
        content: { type: "string", description: "Message body" },
        message_type: {
          type: "string",
          enum: ["text", "markdown"],
          description: "Message format (default: text)",
        },
        confirm: {
          type: "boolean",
          description: "false=dry-run preview, true=actually send",
        },
      },
      required: ["recipient_user_id", "content"],
    },
  },
  {
    type: "function",
    name: "feishu_calendar_event_create",
    description: "Create a Feishu calendar event. Call with confirm=false first for preview.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        start_time: { type: "string", description: "ISO 8601 start time" },
        end_time: { type: "string", description: "ISO 8601 end time" },
        attendee_user_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of attendee open_ids",
        },
        description: { type: "string", description: "Event description" },
        confirm: { type: "boolean", description: "false=preview, true=create" },
      },
      required: ["title", "start_time", "end_time"],
    },
  },
];

export const SYSTEM_PROMPT =
  "你是飞书办公语音助手，语气半正式、简洁。" +
  "用户使用中文；除非用户要求，你用普通话作答。" +
  "当用户意图不明确时，先用简短口头列出 2-4 个可能的理解（编号选项），" +
  "请用户回复编号或复述选项内容；不要冗长追问。" +
  "若浏览器上下文里带有 doc_token，总结或扩写周报时应优先调用 " +
  "`feishu_doc_fetch_markdown` 拉取正文后再回答；如果工具返回 API 权限错误但包含 " +
  "`visible_text` fallback，就基于 fallback 先完成用户请求，并简短说明使用了页面可见文本。" +
  "当用户要求发送消息或创建日程时，若不知道对方 user_id，先调用 " +
  "`feishu_contact_search` 获取 open_id。" +
  "发送消息或创建日程前，必须先传 confirm=false 进行预览，" +
  "口头向用户确认细节；等用户明确说'确认'或'发送'后，再传 confirm=true 执行。";

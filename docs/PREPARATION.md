# 准备清单

> 由 Onboarding Agent 与用户交互后生成（2026-05-17）。供主 Agent 和后续编码 Agent 消费。

## ✅ 已就绪

### OpenAI
- API Key：✓ 已落 macOS Keychain（`service=voice-feishu, account=openai`）
- Tier 等级：**Tier 1**（满足 `gpt-realtime-2` 调用门槛，RPM=200 / TPM=40K）
- 充值余额：用户已确认开通（具体金额未追问，按 Tier 1 推断 ≥ $5）
- 访问方式：直连官方 `wss://api.openai.com/v1/realtime`

### 飞书
- 自建应用 App ID：`cli_a9243dd6cf395bd7`（已落 Keychain：`service=voice-feishu, account=lark`，值为 JSON `{"app_id":..., "app_secret":...}`）
- 自建应用 App Secret：✓ 同上 Keychain 条目（明文不再出现于任何文件）
- 已勾选权限：**待定**（由 Lark CLI Agent 在 Phase 2 根据高频场景反推所需 scope，再引导用户在开发者后台勾选）
- `lark-cli auth` 状态：**已登录**（OAuth `tokenStatus=valid`，身份 user；详见 `docs/lark-capabilities.md`）

### macOS 权限
- 麦克风访问：**大概率已授权**（用户使用过飞书会议；但 Python 解释器是新主体，Phase 0 首次运行时仍会触发系统弹窗，届时确认即可）
- 辅助功能（pynput 全局快捷键）：**未授权**（用户仅用过 Typless / 豆包输入法等输入法类工具，不走辅助功能框架；Phase 3 首次启动需引导首次授权）
- 屏幕录制：**不需要**（用户未用过录屏类 App，本项目当前无 OCR fallback 需求）

### 浏览器
- 主用浏览器：**Chrome** ✓（Chromium 内核，完美匹配 Phase 4 MV3 扩展）
- 版本：未追问（Phase 4 启动前由 Extension Agent 验证 ≥ MV3 支持版本）
- 已开启开发者模式（用于加载未打包扩展）：**否**（用户从未装过 unpacked extension，Phase 4 由 Extension Agent 手把手引导）

---

## ⏳ 待办（按优先级）

### P0 · 安全（Phase 0 验证可用后立即执行）
- [ ] 去 [OpenAI API Keys](https://platform.openai.com/api-keys) **revoke 当前 key** 并重新生成一把，原因：原 key 曾在聊天对话中以明文出现；新 key 用同样的命令覆盖 Keychain：
  ```bash
  security add-generic-password -s voice-feishu -a openai -w <新key> -U
  ```
- [ ] 去 [飞书开发者后台](https://open.feishu.cn) **reset App Secret**（同上原因），再用以下命令覆盖 Keychain：
  ```bash
  security add-generic-password -s voice-feishu -a lark -w '{"app_id":"cli_a9243dd6cf395bd7","app_secret":"<新secret>"}' -U
  ```

### P1 · 首次授权（Phase 0 / Phase 3 启动时由脚本主动触发）
- [ ] **首次运行 Python smoke_test 时**，macOS 会弹窗请求麦克风权限，在弹窗中点击「允许」（仅需一次）
- [ ] **首次启动 `python -m desktop` 时**，macOS 会请求「辅助功能」权限（pynput 全局快捷键依赖），到 系统设置 → 隐私与安全性 → 辅助功能 中勾选对应的 Python 解释器（用户从未授权过此类权限，是首次）

### P2 · Phase 4 上线时（Extension Agent 引导）
- [ ] 在 Chrome 中开启「开发者模式」并加载 `extension/` 目录的 unpacked extension（用户从未装过解压扩展，需要 Extension Agent 提供逐步指引）

### P3 · 由 Lark CLI Agent 全权负责（用户无需主动操作）
- [x] `lark-cli` 安装、OAuth（`lark-cli auth login …`）、能力清单——已完成（见 `docs/lark-capabilities.md`）；后续升级用 `npm update -g @larksuite/cli`

---

## 🎯 业务偏好

### 高频场景（用于裁剪 Phase 2 工具集 + 决定第一杀手场景）

按优先级排列：

1. **【MVP 必达·A】写周报开头**——用户口述："我正在写周报，帮我开个头"。
   - 关键路径：浏览器插件捕获当前飞书文档 `doc_token` → `lark-cli docs …` 读取文档全文 → 喂给模型作为 context → 模型生成周报开头
2. **【MVP 必达·B】总结当前页面**——用户口述："这篇文章在讲什么"。
   - 关键路径：同 A，强依赖"当前浏览器页面"上下文
3. **【次要·C】会议 todo 跟踪**——用户口述："今天早上的周会发言人 xx 的 todo 是什么"。
   - 关键路径：调用 `lark-cli minutes …` 等会议域命令，按发言人筛选 todo 条目

### 助手风格
- 语言：**普通话**
- 语气：**半正式**（自然友好，不过分客套，不官腔）
- 主动性：**最开始要主动理解用户意图并引导**（不是被动等待精确指令）

### 危险操作（发消息 / 审批 / 删除）确认策略 — ⚠️ 独特 UX 偏好

- **默认策略**：选项 C —— **不打断**，信任助手执行
- **意图不明时**：**不**走"口头来回追问"的高打扰路线，而是**弹出文字选项让用户点选 / 口头报编号**（低打扰式引导）

### 第一杀手场景（用于 Phase 1-3 联调时的端到端演示剧本）
- **A + B 双场景**（写周报开头 + 总结文章），都强依赖"当前飞书文档上下文"

### 架构影响备忘（供 Supervisor 排期参考）
- **Phase 4 优先级需提前**：原计划 Phase 4 才做的"浏览器插件 + 上下文服务（doc_token 捕获）"是 A/B 两个杀手场景的关键路径。若按原顺序 Phase 1→2→3→4 推进，Phase 3 联调时无法跑通 A/B。建议 Supervisor 重新排期：考虑将 Phase 4 的 Extension + ContextServer 部分并入 Phase 2，或在 Phase 3 启动前插入一个 Phase 3.5。
- **Phase 3 需新增「选项弹窗 UI」组件**：对应「意图不明时弹文字选项」的 UX 偏好。Desktop Agent 派单时需要把这条加入 Scope。
- **Phase 5 提示词风格约束**：Polish Agent 写 system prompt 时需明确——"先呈现选项，再执行"而非"反复追问"，并避免每次危险操作都口头确认（用户明确不要打断）。

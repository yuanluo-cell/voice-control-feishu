# Lark CLI 能力清单（实测）

> Lark CLI Agent 实测产出，作为 Tools Agent / Polish Agent 写包装代码时的参考。
> CLI 版本：**lark-cli v1.0.32**（GitHub `larksuite/cli`，2026-05-15 发布）
> 探测时间：**2026-05-17**
> 探测环境：macOS 26.4.1 arm64，Cursor agent sandbox（受限网络）
> 探测范围：所有命令均通过 `lark-cli <cmd> --help` **离线**抓取（沙箱无法直连 `accounts.feishu.cn` / `open.feishu.cn`），未对飞书 API 实跑——具体 JSON 输出留给 Tools Agent 持有真 token 时补全。

---

## ⚠️ 关键事实（先读这一节）

### 1. 二进制名是 `lark-cli`，不是 `lark`
- npm 包 `@larksuite/cli` v1.0.32 的 `package.json` 显式声明 `"bin": {"lark-cli": "scripts/run.js"}`
- **没有** `lark` 别名 / 符号链接
- AGENTS.md §3 DoD 和 PREPARATION.md 里的 `lark` / `lark login` / `lark whoami` 都需要解读为 `lark-cli` / `lark-cli auth login` / `lark-cli auth status`（或 `auth list`）
- 安装位置：`/Users/ada_ly/.nvm/versions/node/v24.15.0/bin/lark-cli`（nvm Node 24 全局 bin）；实际 Go 二进制在 `lib/node_modules/@larksuite/cli/bin/lark-cli`，Node shim 转发
- ⚠️ 切换 nvm Node 版本会"丢失" `lark-cli`——若用户后续切版本需要 `npm install -g @larksuite/cli` 重装

### 2. 没有 `login` 顶层命令
真正的认证流程是两步：

```bash
# 第一步：登记 App（secret 走 stdin，避免命令行泄露）
lark-cli config init --app-id <APP_ID> --app-secret-stdin --brand feishu < <(echo "<APP_SECRET>")

# 第二步：用户级 OAuth（Device Flow，非传统 web callback）
lark-cli auth login --domain docs,drive,wiki,markdown,minutes,vc,im,contact,calendar
# 阻塞，打印 verification URL + device code → 用户浏览器授权 → 自动完成
```

- `--no-wait` 模式：立即返回 URL+code，用户授权完成后用 `--device-code <code>` 收尾（适合脚本化场景）
- `--domain all` 一次性请求 19 个域，但飞书后台未勾选的 scope 会导致整个请求失败；推荐按 MVP 需要列具体域

### 3. 身份切换（`--as`）
几乎所有调用都接受 `--as user | bot`：
- `--as user`：用 user_access_token，能访问"我的"日历/文档/Wiki/Minutes（Web 浏览权限基本一比一）
- `--as bot`：用 tenant_access_token，受机器人在群里的权限和后台 scope 限制
- **MVP 三大场景全部要用 `--as user`**（读个人文档、个人 Minutes、个人日历）

### 4. 风险标记（每个命令 help 末尾会列）
- `Risk: read` —— 只读，无副作用
- `Risk: write` —— 写操作（发消息/创建文档/审批/删除）
- **所有写命令都有 `--dry-run` flag**（打印请求不实际执行）——Polish Agent §5 设计安全前置流程时可以直接复用

### 5. 输出格式
所有命令支持 `--format json | ndjson | pretty | table | csv`，默认 `json`。结合 `--jq <expr>` / `-q <expr>` 可在 CLI 层直接过滤，Tools Agent 写 Python 包装时可省一道 jq 解析。

### 6. 配置/数据落盘位置
- 配置：`~/.lark-cli/config.json`
- Token：同目录（明文 JSON，OS 文件权限保护，**注意备份隔离**）
- App ID：`cli_a9243dd6cf395bd7`（与 PREPARATION.md 一致）
- 当前 profile：`cli_a9243dd6cf395bd7`

---

## 业务域速览

| 域 | 命令数（含子域） | MVP 相关度 | 杀手场景对接 |
|---|---|---|---|
| **docs** | 9 个 `+` 命令 | ★★★ | A 写周报 · B 总结文档 |
| **drive** | 17 个命令 + 10 个原生子域 | ★★★ | A/B 备用导出路径 |
| **markdown** | 3 个（`+create/+fetch/+overwrite`） | ★★★ | 直接读写 Markdown 文件 |
| **wiki** | 6 个 `+` 命令 + 3 个原生子域 | ★★ | 文档可能在 Wiki 树里 |
| **minutes** | 3 个 `+` 命令 + 1 个原生子域 | ★★★ | C 会议 todo |
| **vc** | 5 个 `+` 命令 + 1 个原生子域 | ★★★ | C 会议 todo |
| **im** | 14 个 `+` 命令 + 7 个原生子域 | ★★ | 发消息（写操作，需 dry-run） |
| **contact** | 2 个 `+` 命令 | ★★ | 人员搜索（@张三 这类） |
| **calendar** | 7 个 `+` 命令 + 4 个原生子域 | ★ | 日程查询 |
| **task** | 17 个 `+` 命令 + 7 个原生子域 | ★ | "今天的 todo" 类问句 |
| **base** | 60+ 命令 | 暂不用 | 多维表（Phase 2 暂不接） |
| **sheets** | 40+ 命令 | 暂不用 | 表格 |
| **slides** | — | 暂不用 | PPT |
| **whiteboard** | — | 暂不用 | 白板 |
| approval / attendance / mail / okr | — | 暂不用 | |
| **api** | 通用 REST | — | Tools Agent 兜底，调任何 open-apis |
| **schema** | 内省 | — | 查参数/类型/scope |
| **auth / config / profile / doctor / update** | CLI 元命令 | — | 见上文「认证流程」/ 升级 |

完整 27 个顶层域（去掉 `help`）：
`api, approval, attendance, auth, base, calendar, config, contact, docs, doctor, drive, event, im, mail, markdown, minutes, okr, profile, schema, sheets, slides, task, update, vc, whiteboard, wiki`

---

## 详细命令（按 MVP 优先级）

### docs（最关键，A/B 杀手）

> ⚠️ Tips（来自 CLI 自身）：Docs v1 已废弃，所有 `+create / +fetch / +update` 调用都应显式带 `--api-version v2`。

#### `lark-cli docs +fetch` —— B 杀手核心
读取飞书文档内容。

```bash
lark-cli docs +fetch \
  --api-version v2 \
  --as user \
  --doc <doc URL 或 token> \
  --doc-format markdown \
  --detail simple
```

- **关键 flag**
  - `--doc` URL 或 token（Tools Agent 拿浏览器插件捕获的 doc_token 直接喂）
  - `--doc-format xml | markdown | text`（**优先 markdown**，喂给 OpenAI Realtime 最方便）
  - `--detail simple | with-ids | full`（**simple 足够供 LLM 总结**；with-ids 用于后续编辑定位；full 给写场景）
  - `--scope full | outline | range | keyword | section`（**partial read**——文档很大时只读章节/匹配段，省 token）
    - `--keyword "foo|bar"`：支持 substring + regex，`|` 表示 OR
    - `--start-block-id` / `--end-block-id`：精确范围
    - `--max-depth N`：outline 限层级；range/keyword/section 限子树深度
  - `--context-before N` / `--context-after N`：keyword/section 模式带上下文兄弟块
- **Risk: read**
- **输出格式**：JSON（默认）；典型 schema 为 `{ "ok": true, "data": { "blocks": [...] } }` 或纯 markdown 串（取决于 `--doc-format`）——具体 JSON 待 Tools Agent 持 token 后实跑确认

#### `lark-cli docs +create` —— A 杀手可选写入
创建文档。**Risk: write**，需要 dry-run 前置。

```bash
lark-cli docs +create \
  --api-version v2 \
  --as user \
  --content @/path/to/weekly.md \
  --doc-format markdown \
  --parent-token <folder/wiki-node token>
```

- `--content`：支持 `@file` 引用文件 / `-` 读 stdin / 内联字符串
- `--parent-token`：父目录或 Wiki 节点 token
- `--parent-position my_library`：放进个人空间
- ⚠️ MVP·A 当前路径是"语音生成开头 → 用户复制粘贴到飞书"，**不一定需要直接 `+create`**；如果用户要求"帮我新建一份周报"再走这个

#### `lark-cli docs +search`
全文档搜索（横跨 docs/wiki/sheets）。**Risk: read**

```bash
lark-cli docs +search \
  --as user \
  --query "周报模板" \
  --page-size 15 \
  --filter '{"types":["docx"]}'
```

- 走的是 Search v2 (`doc_wiki/search`)
- `--page-size` 最大 20，需要 `--page-token` 翻页
- `--filter` 是 JSON 字符串，文档结构 Tools Agent 实跑后补

#### `lark-cli docs +update`、`+media-*`、`+whiteboard-update`
均存在，Risk 大概率 write（除 `+media-preview/+media-download` 是 read）。MVP 暂不直接需要，Tools Agent 接到再单独探。

---

### drive（A/B 备用 + 通用文件操作）

#### `lark-cli drive +export` —— B 杀手备用路径
当 `docs +fetch` 不可用（如旧版 doc）时，把云文档导出为本地文件。

```bash
lark-cli drive +export \
  --as user \
  --token <doc token> \
  --doc-type docx \
  --file-extension markdown \
  --output-dir /tmp \
  --overwrite
```

- `--doc-type doc | docx | sheet | bitable`
- `--file-extension docx | pdf | xlsx | csv | markdown | base`（**markdown 最适合喂 LLM**）
- `--sub-id` 表格场景下指定 sheet/sub-table
- **Risk: read**

#### `lark-cli drive +search`
平铺 filter 形式的文档搜索（与 `docs +search` 重叠但 flag 更扁平）。

#### 其他相关
- `+download` / `+upload`：单文件
- `+pull` / `+push`：目录镜像（双向）；`+status` 比对本地 vs 云
- `+add-comment`（**write**）、`+apply-permission`（**write，半危险**）、`+delete`（**write，危险**）

---

### markdown（直接对 Drive 原生 Markdown 文件读写）

只有 3 个命令：
- `lark-cli markdown +fetch --file-token <X> [--output <path>]`（**read**）——拿 Markdown 内容
- `lark-cli markdown +create`（**write**）
- `lark-cli markdown +overwrite`（**write**，需 dry-run）

用途：如果用户的周报模板是 Drive 里的 .md 文件，比 `docs +fetch` 还直接。

---

### minutes（C 杀手核心 · 飞书"妙记"会议纪要）

#### `lark-cli minutes +search` —— 按发言人/时间筛选纪要
```bash
lark-cli minutes +search \
  --as user \
  --query "周会" \
  --owner-ids me \
  --participant-ids me \
  --start 2026-05-12 \
  --end 2026-05-17
```

- **关键 flag**
  - `--owner-ids me`：用户口语"我的早会"直接映射
  - `--participant-ids ou_xxx,me`：按参与人筛
  - `--start` / `--end` 接 ISO 8601 或 `YYYY-MM-DD`
- **Risk: read**

#### `lark-cli minutes minutes get`
按 minute_token 取详情。Tools Agent 应该把 `+search → get` 串成一个 Python 工具。

#### `lark-cli minutes +download` / `+upload`
媒体文件下载/上传。MVP 暂不用。

---

### vc（C 杀手核心 · 会议本身）

#### `lark-cli vc +recording`
从 meeting_id / calendar_event_id 反查 minute_token（minutes 的入口）。

```bash
lark-cli vc +recording --as user --calendar-event-ids <event_id>
```

#### `lark-cli vc +notes`
查会议笔记（minutes 的人写版）。

```bash
lark-cli vc +notes \
  --as user \
  --meeting-ids <m1>,<m2> \
  --output-dir ./minutes \
  --overwrite
```

- 三种入口任选其一：`--meeting-ids` / `--minute-tokens` / `--calendar-event-ids`
- artifact 会写到 `./minutes/{minute_token}/`（除非 `--output-dir` 改）
- **Risk: read**

#### `lark-cli vc +search`
搜会议记录，至少要一个 filter。

#### `lark-cli vc +meeting-join` / `+meeting-leave` / `+meeting-events`
机器人进出会议、拉事件流——MVP 不需要。

---

### im（消息）

> ⚠️ MVP 不主推语音发消息（用户已声明默认不打断式执行 + 发消息属于"半危险"），但搜聊天和搜消息**很有用**——例如"上周张三发的那个文档链接"。

#### `lark-cli im +messages-search`（**read**）
跨群消息搜索（仅 user 身份），支持发送人/群/附件/时间 filter。

#### `lark-cli im +chat-search`（**read**）
按关键词/成员搜可见群聊（可用于"找到那个项目群"）。

```bash
lark-cli im +chat-search --as user --query "项目X" --page-size 20
```

#### `lark-cli im +messages-send`（**write**，需 dry-run）
```bash
lark-cli im +messages-send \
  --as user \
  --chat-id oc_xxx \
  --text "..." \
  --idempotency-key <uuid> \
  --dry-run
```

- 内容形式：`--text` / `--markdown` / `--image` / `--file` / `--video` + `--video-cover` / `--audio` / 自定义 `--content` JSON + `--msg-type`
- `--idempotency-key` 强烈推荐（Polish Agent 5 必须带，避免双发）
- 目标二选一：`--chat-id oc_xxx` 或 `--user-id ou_xxx`

#### 其他
- `+messages-reply`（**write**）、`+messages-mget`（read，最多 50 条 ID）
- `+chat-create`（**write**）、`+chat-update`（**write**）、`+chat-list`（read）
- `+flag-create/cancel/list`（消息收藏/书签）
- `+threads-messages-list`、`+messages-resources-download`

---

### contact（人员搜索）

#### `lark-cli contact +search-user`
```bash
lark-cli contact +search-user --as user --query "张三"
# 多人 fanout：
lark-cli contact +search-user --as user --queries "alice,bob,张三"
# 已聊过的人优先（更准）：
lark-cli contact +search-user --as user --query "张三" --has-chatted --exclude-external-users
```

- **必须 `--as user`**（user_access_token 才有人员搜索能力）
- `open_id` 是后续命令的稳定标识
- `has_more=true` 时无自动翻页，需要收紧 query 或加 filter
- **Risk: read**

#### `lark-cli contact +get-user`
```bash
lark-cli contact +get-user --as user                     # 当前用户
lark-cli contact +get-user --as user --user-id ou_xxx    # 指定用户
```

`--user-id-type open_id | union_id | user_id`，默认 `open_id`。

---

### calendar（日程，次要相关）

```bash
lark-cli calendar +agenda --as user                # 今天
lark-cli calendar +agenda --as user --start 2026-05-17T00:00:00+08:00 --end 2026-05-17T23:59:59+08:00
```

- `--calendar-id`：默认 primary
- `+freebusy`：查空闲（用户口语"什么时候空"）
- `+suggestion`：智能时间推荐
- `+create` / `+update`：**write**
- `+rsvp` / `+room-find`：**write**

---

### wiki（如果用户的文档在 Wiki 树里）

```bash
lark-cli wiki +space-list --as user                              # 列我能看到的空间
lark-cli wiki +space-list --as user --page-all
lark-cli wiki +node-list --as user --space-id <SPACE_ID>         # 列空间根节点
lark-cli wiki +node-list --as user --space-id my_library         # 个人文档库（仅 user 身份有效）
lark-cli wiki +node-list --as user --space-id <SPACE> --parent-node-token <X>   # 钻子目录
```

- 默认每次只翻一页，`--page-all` 拉全（大 Wiki 谨慎）
- 个人文档库要走 `wiki spaces get --params '{"space_id":"my_library"}'`（API 不在 `+space-list` 里返）
- **Risk: read**

---

### task（用户口语"我今天的 todo"）

- `lark-cli task +get-my-tasks --as user`（read）—— 我的任务
  - `--complete true/false`、`--due-start/--due-end`、`--query`、`--page-all`
- `lark-cli task +search --as user --query "..."`（read，含按 assignee/creator/follower/due filter）
- 写操作：`+create / +update / +complete / +reopen / +assign / +comment` 等均 **write**

---

### api（兜底通用 REST）

```bash
lark-cli api GET /open-apis/contact/v3/users/{user_id} --params '{"user_id_type":"open_id"}'
lark-cli api POST /open-apis/im/v1/messages --data @msg.json --as user
```

- 任何官方 open-apis 端点都能打——当某个能力没有专用 `+command` 时的兜底
- 支持 `--dry-run` / `--page-all` / `--jq` / `--file <field=path>` 上传
- Tools Agent 写 Python 包装时**首选 `+command`**（参数验证更严、Risk 标注更清），用不到时再下沉到 `api`

---

### schema（内省，Tools Agent 编码期友好）

```bash
lark-cli schema docs.docx.content                # 查 docs.docx.content 这个方法
lark-cli schema im.messages.send --format pretty # 看参数、类型、需要的 scope
```

- **特别有用**：每个方法的 help 会列出**需要哪些 scope**——Tools Agent 写 wrapper 时可以提前告诉用户"这个工具需要去飞书后台勾 `docx:document.readonly`"

---

### 元命令（CLI 自身管理）

| 命令 | 用途 |
|---|---|
| `lark-cli auth status` | 本地 token 状态（**等同 `whoami`**） |
| `lark-cli auth status --verify` | 加上服务端验证（需联网） |
| `lark-cli auth list` | 列所有登录用户 |
| `lark-cli auth scopes` | 查当前 App 已启用的 scope（开发者后台同步） |
| `lark-cli auth check` | 检查 token 是否覆盖指定 scope |
| `lark-cli auth logout` | 登出（清 token） |
| `lark-cli config show` | 显示当前配置（secret 自动 mask 为 `****`） |
| `lark-cli config init` | 初始化 App（已用过） |
| `lark-cli config remove` | 移除 App 配置 + token |
| `lark-cli config bind` | 绑定到 Agent workspace 已有 App（OPENCLAW_HOME / HERMES_HOME） |
| `lark-cli config default-as` | 全局默认 identity type |
| `lark-cli config strict-mode` | identity 限制策略 |
| `lark-cli profile add/list/use/rename/remove` | 多 App profile 切换 |
| `lark-cli doctor` | 本地健康检查（`--offline` 跳过网络） |
| `lark-cli update` | 升级 CLI 自身 |

⚠️ Profile 提示（来自 CLI 自身）："AI agents: Do NOT switch or remove profiles unless the user explicitly asks." —— Tools Agent 编写时严格遵守。

---

## Tools Agent 建包装时的速查表（MVP 6 个工具的命令映射）

| LLM tool 名（建议） | 对应 lark-cli 命令 | Risk | --as |
|---|---|---|---|
| `read_lark_doc(doc_token, format='markdown')` | `docs +fetch --api-version v2 --doc <token> --doc-format markdown` | read | user |
| `search_lark_docs(query, page_size=10)` | `docs +search --query <q>` | read | user |
| `export_lark_doc(token, doc_type, file_ext='markdown')` | `drive +export --token --doc-type --file-extension --output-dir` | read | user |
| `search_minutes(query, owner='me', start, end)` | `minutes +search --query --owner-ids --start --end` | read | user |
| `fetch_meeting_notes(meeting_id_or_calendar_event_id)` | `vc +notes --meeting-ids` 或 `--calendar-event-ids` | read | user |
| `search_user(query)` | `contact +search-user --query` | read | user |
| `send_message(chat_id, text, idempotency_key)` ⚠️ | `im +messages-send --chat-id --text --idempotency-key --dry-run` | **write** | user |

---

## 已知 PERMISSION_GAPS（待用户/Supervisor 确认）

> 以下 scope 名是从命令语义反推 + 飞书开放平台常见命名，**不保证完全准确**，Tools Agent 第一次实跑某命令时若收到 `scope not granted` 类错误，需要回报这里以便补勾。

| 工具 | 大概率需要的 scope（飞书开发者后台勾） |
|---|---|
| `docs +fetch / +search / +update` | `docx:document.readonly` / `docx:document` |
| `drive +export / +download / +search` | `drive:drive.readonly` |
| `markdown +fetch` | `drive:file.readonly` |
| `minutes +search`、`vc +notes / +recording` | `vc:meeting:readonly` / `minutes:minute:readonly` |
| `contact +search-user / +get-user` | `contact:user.base:readonly` / `contact:contact.base:readonly` |
| `im +messages-send / +chat-search / +messages-search` | `im:message`、`im:chat:readonly` |
| `calendar +agenda / +freebusy` | `calendar:calendar.event:readonly` |
| `task +get-my-tasks / +search` | `task:task:readonly` |

**Tools Agent 实跑前先 `lark-cli auth scopes --format pretty` 拿当前 App 已勾清单做差集**，把缺的列给用户去补。

---

## 探测局限性声明

1. **未执行任何实写命令**——本次全程只读，符合 AGENTS.md §3 「不在没有 Supervisor 明确许可的情况下执行写操作」
2. **授权已完成，但业务 API 仍未在本 Agent 沙箱内实跑**——`auth login` 由用户在本地终端完成；本沙箱对 `open.feishu.cn` 的 DNS/代理不稳定，`auth status --verify` 可能误报失败。**Tools Agent / verify_setup** 应在用户真实终端验证 `--verify` 与一条最小 `docs +fetch --dry-run`。CLI 各命令的 stdout JSON schema 仍以 Phase 2 实跑为准。
3. **域覆盖**：实测包含 docs / drive / markdown / wiki / minutes / vc / im / contact / calendar / task / base（概览） / sheets（概览） / api / schema —— **14 个域**，超过 DoD 要求的 6 个（含 docs/im/meetings 三个 MVP 关键的等价：docs / im / minutes+vc）
4. **未深探**：approval、attendance、mail、okr、slides、whiteboard、event —— 这些不在用户 MVP 内，需要时再补

---

## OAuth 授权实测（追加 · 2026-05-17）

- **`lark-cli whoami` 不存在**（CLI 返回 `unknown command "whoami"`）。身份与 token 状态以 `lark-cli auth status` / `lark-cli auth list` 为准。
- **`lark-cli auth status`（本地缓存）**：`tokenStatus=valid`，`identity=user`，`expiresAt` / `refreshExpiresAt` 均有值；`userOpenId` 形如 `ou_67f589…aa1`（全文仅在本地 `~/.lark-cli/` 配置，勿提交）。
- **展示名**：本次 CLI 返回字段 `userName` 为字面量 `1`（可能非真实姓名；若需邮箱/姓名应调用开放平台 user_info 或由 Extension 侧展示）。
- **已授予 scope（节选，与 MVP 相关）**：含 `docx:document:readonly`、`docs:document.content:read`、`search:docs:read`、`minutes:minutes.search:read`、`minutes:minutes.basic:read`、`vc:note:read`、`vc:meeting.meetingevent:read`、`vc:record:readonly`、`im:message`、`contact:user:search` 等——完整列表以 `auth status` 输出的 `scope` 空格分隔串为准。

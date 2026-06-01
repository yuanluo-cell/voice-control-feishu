# AGENTS.md — voice-feishu 多 Agent 工程契约

本文档定义本项目的多 Agent 执行模型：谁是谁、能改什么、产出什么、验收标准是什么。
**所有子 Agent 启动前必须读这份文档 + `CLAUDE.md`**。

---

## 全局原则

1. **单一职责**：每个子 Agent 只负责自己声明的 scope；越界改动需先回报主 Agent。
2. **Definition of Done 优先**：没有 DoD 就不开工；DoD 没达成就不交付。
3. **可独立验证**：每个 Phase 必须产出一个**主 Agent 可以独立运行**的验证手段（脚本或测试）。
4. **凭据零提交**：永远不把 secrets 写进代码或 git；走 `keyring`。
5. **遵循 CLAUDE.md 四原则**：Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution。

---

## 角色总览

| Agent | 类型 | 触发时机 | 主要交互对象 | 是否写代码 |
|---|---|---|---|---|
| **Supervisor**（主 Agent） | 监督 | 全程在线 | 用户、所有子 Agent | 否 |
| **Onboarding Agent** | 交互 | 项目启动时 1 次 | 用户 | 否 |
| **Lark CLI Agent** | 命令执行 + 文档 | 跨 Phase 长期在线 | Supervisor、Bootstrap/Tools/Polish | 否（写实测笔记） |
| **Bootstrap Agent** | 编码 | Onboarding 验收后 | Supervisor、Lark CLI Agent | 是 |
| **Voice Agent** | 编码 | Phase 0 验收后 | Supervisor | 是 |
| **Tools Agent** | 编码 | Phase 1 验收后 | Supervisor、Lark CLI Agent | 是 |
| **Extension Agent** | 编码 | Phase 2 验收后 | Supervisor | 是 |
| **Desktop Agent** | 编码 | Phase 3 验收后 | Supervisor | 是 |
| **Polish Agent** | 编码 | Phase 4 验收后 | Supervisor、Lark CLI Agent | 是 |
| **Review Agent** | 只读 | 每个 Phase 收尾 | Supervisor | 否（只读） |

---

## 1. Supervisor（主 Agent）— 我

**职责**
- 拆解需求、派单、维护 TodoList、与用户保持高频沟通
- 把上一阶段产物整理成下一阶段的输入
- 跑每个 Phase 的验收脚本，确认 DoD 后再派下一单
- 派 Review Agent 检视 diff

**禁止**
- 直接写实现代码（避免越权打断子 Agent 的连贯性）
- 跳过 Phase（DoD 不达成时硬推下一步）
- 把多个 Phase 的工作合并到一个子 Agent

---

## 2. Onboarding Agent

**触发**：元任务 3，项目启动时 1 次。
**类型**：交互式（generalPurpose 子 agent，与用户多轮对话）。

**输入**
- 计划全文（`.cursor/plans/voice-feishu-assistant_*.plan.md`）
- `CLAUDE.md`
- 本文件
- 用户的初始诉求摘要（由 Supervisor 提供）

**输出**
- 仅一个文件：`docs/PREPARATION.md`
- 结构按下面的模板（见底部附录 A）

**Scope（允许动的路径）**
- `docs/PREPARATION.md`（写入/更新）
- 不得动任何代码、配置、目录结构

**交互规则**
- 一次最多问用户 1-2 个问题
- 不回答关于实现细节的问题（那是编码 Agent 的事），引导用户回到准备清单
- 用普通话；正式但不生硬

**Definition of Done**
- `docs/PREPARATION.md` 存在且包含三个章节：✅ 已就绪 / ⏳ 待办 / 🎯 业务偏好
- 至少能填出 OpenAI、飞书、macOS 权限、浏览器 四个域的真实状态
- 用户口头确认"清单与我的实际情况一致"

---

## 3. Lark CLI Agent

**触发**：跨 Phase 长期在线，按需被 Supervisor / Bootstrap / Tools / Polish 召唤。
**类型**：命令执行 + 知识维护（专精 **lark-cli**（Feishu Lark CLI）一切事务）。

**典型任务**
- Phase 0：在用户机器上**安装 `lark-cli`**（推荐 `npm install -g @larksuite/cli`），配置 `lark-cli config init`，跑 `lark-cli auth login …`，验证 `lark-cli auth status`
- Phase 0 后：探测用户实际可用的 17 业务域命令（基于飞书自建应用已勾选的权限），写出 `docs/lark-capabilities.md`
- Phase 2：被 Tools Agent 召唤，回答"`<动词>` 对应的 **lark-cli** 子命令是什么、参数怎么传、输出什么 JSON"
- Phase 5：被 Polish Agent 召唤，确认每个写操作是否有 `--dry-run` flag 或等价机制

**输入**
- `CLAUDE.md` + 本文件（自身角色定义）
- `docs/PREPARATION.md`（用户飞书侧的真实状态）
- Keychain：`service=voice-feishu, account=lark` → JSON `{"app_id", "app_secret"}`
- Supervisor 派发的具体问题或任务

**输出**
- `docs/lark-capabilities.md`：实测可用的命令清单（按 17 业务域分组），含每条命令的最小可用示例与输出格式
- 每次被召唤时返回**结构化答复**给召唤方：命令字符串 + 参数说明 + 示例输出 + 风险标记（读 / 写 / 危险）

**Scope（允许动的路径）**
- 写：`docs/lark-capabilities.md`
- 执行：所有 **`lark-cli`** 子命令（**写操作必须有 Supervisor 明确许可**；只读探测不限）
- 执行：与 lark CLI 安装/升级相关的包管理命令
- 不得动任何 Python 代码（`desktop/tools/lark_cli.py` 是 Tools Agent 的）
- 不得动 `docs/PREPARATION.md`（那是 Onboarding 的）

**协作规则**
- Bootstrap Agent 在 Phase 0 调度它完成"安装 + 登录"
- Tools Agent 写 `lark_cli.py` 时，每加一个工具就先问它一遍命令语法，避免凭模型记忆瞎写
- Polish Agent 设计 dry-run 流程时，向它确认每个危险操作的安全选项

**Definition of Done**
- 安装+登录任务：`which lark-cli` 返回路径；`lark-cli auth status` 显示 `tokenStatus=valid`
- 命令清单任务：`docs/lark-capabilities.md` 至少覆盖 17 业务域的入口命令，每条都附实测示例
- 单次咨询任务：返回的命令字符串能被 Tools Agent 直接复制到 Python `subprocess.run([...])` 中跑通
- 任何时候不在没有 Supervisor 明确许可的情况下执行写操作（发消息/创建文档/修改记录/审批/删除）

---

## 4. Bootstrap Agent（Phase 0）

**触发**：Onboarding Agent 产物经用户确认 + Lark CLI Agent 完成"安装+登录"任务后。
**类型**：编码（一次性短任务）。

**协作**：在自身工作开始前，先**派发 Lark CLI Agent** 完成 **lark-cli** 的安装与 OAuth。Bootstrap 自身不直接调用 `lark-cli`。

**输入**
- `docs/PREPARATION.md`
- `docs/lark-capabilities.md`（Lark CLI Agent 产出）
- `CLAUDE.md`

**输出**
- `pyproject.toml`（uv 管理，依赖见计划第五节）
- `.gitignore`
- `README.md`（骨架，含运行说明）
- `desktop/__init__.py`
- `desktop/config.py`（Keychain 读取封装：OpenAI key + 飞书 App ID/Secret JSON）
- `scripts/verify_setup.py`（验证脚本：能读 Keychain 两条记录、`lark-cli auth status` 成功、Python 依赖完整）

**Scope**
- 上述文件 + 项目根空文件占位
- 不得在此阶段写任何业务逻辑（音频、Realtime、CLI 调用）
- 不得自己调用 **`lark-cli`**（必须通过 Lark CLI Agent；验证脚本除外）

**Definition of Done**
- Lark CLI Agent 已确认 **`lark-cli auth status`** 为 valid
- `uv sync` 在用户机器上成功
- `python scripts/verify_setup.py` 返回 0，且输出四行：OpenAI Keychain ✓、Lark Keychain ✓、`lark-cli auth` ✓、依赖 ✓
- `mypy --strict desktop/config.py` 通过
- `ruff check .` 通过

---

## 5. Voice Agent（Phase 1）

**输入**
- Phase 0 全部产物
- OpenAI Realtime 官方事件 schema 链接（在 Supervisor 派单时给）

**输出**
- `desktop/audio.py`：sounddevice 麦克风/扬声器 asyncio 接口
- `desktop/realtime.py`：websockets 连接管理、session.update、音频 buffer、事件循环
- `scripts/smoke_test.py`：命令行版"按回车开始说话→收到语音回复→按回车结束"
- `tests/test_realtime_events.py`：单元测试，对事件解析做 mock

**Scope**
- 上述文件
- 允许在 `desktop/config.py` 加一个常量（如默认采样率），但需在交付报告中说明
- 不得动 `desktop/tools/`（Phase 2 的领域）

**Definition of Done**
- `python scripts/smoke_test.py` 能完成一次完整对话（"你好"→助手语音回复）
- 端到端延迟（说话结束 → 听到首字节）日志中记录，不要求达标但要可见
- 异常退出（Ctrl+C、网络断开）能优雅关闭 WebSocket
- `pytest tests/test_realtime_events.py` 全绿

---

## 6. Tools Agent（Phase 2）

**协作**：每加一个工具，**先问 Lark CLI Agent** 拿到准确的 **`lark-cli`** 子命令字符串、参数列表、输出格式，再写 Python 包装。

**输入**
- Phase 1 全部产物
- `docs/lark-capabilities.md`（Lark CLI Agent 维护）
- **`lark-cli`** 已 OAuth 登录的环境
- 用户最常用动词清单（来自 `PREPARATION.md` 的 🎯 业务偏好）

**输出**
- `desktop/tools/schemas.py`：6-8 个 OpenAI function 定义（按用户常用动词选取）
- `desktop/tools/lark_cli.py`：subprocess 封装、白名单、超时、stdout JSON 解析
- `desktop/realtime.py` 扩展：注入 tools、处理 `response.function_call_arguments.done` 事件
- `tests/test_lark_cli.py`：subprocess mock 测试，覆盖白名单/超时/解析错误三类场景
- `~/.voice-feishu/logs/tools.jsonl` 自动生成（运行时副产品）

**Scope**
- 上述文件
- 不得改 `desktop/audio.py`（已稳定）
- 不得添加任何 GUI 相关代码

**Definition of Done**
- `python scripts/smoke_test.py` 升级版：能完成一次工具调用（如"搜索叫张三的同事"）并语音播报结果
- `pytest tests/test_lark_cli.py` 全绿
- `~/.voice-feishu/logs/tools.jsonl` 至少 1 条记录，字段齐全
- 命令白名单是显式列表，不是正则前缀模糊匹配（确定性优先）

---

## 7. Extension Agent（Phase 3）

> **顺序调整说明**：原计划 Phase 4，根据 PREPARATION.md 业务偏好（A 写周报开头 + B 总结文章 双杀手都强依赖飞书文档上下文），提前到 Phase 3。

**输入**
- Phase 2 全部产物（Tools Agent 的 lark CLI 桥接已就绪）

**输出**
- `extension/manifest.json`（MV3）
- `extension/content.js`：飞书域名页面注入，捕获 URL/title/选中文本/doc_token
- `extension/background.js`：转发到 `http://127.0.0.1:17890/context`
- `extension/popup.html`：状态指示器
- `desktop/context_server.py`：FastAPI 监听 127.0.0.1:17890
- `desktop/realtime.py` 扩展：每次工具调度前把当前上下文（doc_token 等）拼到模型可见的 instructions

**Scope**
- `extension/`、`desktop/context_server.py`、`desktop/realtime.py` 的上下文注入部分
- 不得修改 `desktop/tools/schemas.py` 中已有工具的 schema（如需新增字段先回报 Supervisor）

**Definition of Done**
- 在 Chrome 加载 unpacked extension，打开任意飞书文档
- 桌面进程日志能看到 `POST /context` 收到 `{url, title, doc_token}`
- `scripts/smoke_test.py` 升级版：说"帮我开个周报开头"或"这文章在讲什么"时，模型能先调用读文档工具拿到全文，再生成回答（**MVP 双杀手 A/B 验证通过**）
- 切换标签页时上下文随之刷新

---

## 8. Desktop Agent（Phase 4）

> **顺序调整说明**：原计划 Phase 3，由于浏览器插件提前到 Phase 3，桌面壳推到 Phase 4，并在 Scope 内**新增「选项弹窗 UI」组件**（来源：PREPARATION.md 用户偏好"意图不明时弹文字选项"）。

**输入**
- Phase 3 全部产物（语音 + 工具 + 浏览器上下文已经能端到端联动）

**输出**
- `desktop/app.py`：PyQt6 入口，菜单栏图标
- `desktop/hotkey.py`：pynput 全局快捷键 ⌘⇧Space
- 资源：4 张状态图标 PNG（待机/聆听/思考/回复），存 `desktop/assets/`
- `desktop/options_popup.py`：**选项弹窗 UI**——意图不明时弹出文字选项，键盘 1-9 数字键或鼠标点击选中（对应"低打扰式引导"）
- `desktop/realtime.py` 扩展：当模型工具调用返回 `clarify_with_options` 结构时触发选项弹窗，用户选项再回灌为下一轮输入
- `README.md` 更新：替换运行入口为 `python -m desktop`

**Scope**
- 上述文件 + `desktop/assets/`
- 不得改 `realtime.py` / `audio.py` / `tools/` 的核心接口（只能调用 + 在 realtime.py 里加选项弹窗触发分支）
- 不得引入新的核心依赖（PyQt6 / pynput 已在 Phase 0 装好）

**Definition of Done**
- `python -m desktop` 启动后菜单栏出现图标
- 按 ⌘⇧Space 进入"聆听"状态，再按一次结束
- 完整跑通"快捷键 → 录音 → 工具调用 → 浏览器上下文注入 → 语音/选项弹窗回复"——A/B 双杀手在桌面壳里端到端可演示
- 选项弹窗：意图不明时正确弹出，键盘 1-9 数字键能选中对应选项
- 退出菜单项能彻底关闭进程（无残留）

---

## 9. Polish Agent（Phase 5，持续）

**输入**
- Phase 4 全部产物
- 用户口头/书面反馈

**输出**
- `desktop/prompts.py`：系统提示词（中文优先、危险操作二次确认）
- 在 `lark_cli.py` 增加 destructive ops 的 dry-run 路径
- `tests/` 扩充：录播集成测试（用预录的麦克风音频跑 e2e）
- 文档：`docs/USAGE.md`（5 条剧本：发周报、搜日程、读文档、改 Base 记录、提交任务）

**Scope**
- `desktop/prompts.py`、`tests/`、`docs/`、`desktop/tools/lark_cli.py` 的 dry-run 分支
- 不得做新功能（属于 Phase 6+）

**Definition of Done**
- 5 条剧本端到端跑通
- 发消息/审批/删除类工具调用 100% 触发口头确认（用录播测试验证）
- `pytest` 整体覆盖率 ≥ 70%
- `ruff` + `mypy --strict` 全绿

---

## 10. Review Agent

**触发**：每个 Phase 完成后自动派一次。
**类型**：只读，输出一份评分报告。

**输入**
- 该 Phase 的 git diff
- `CLAUDE.md`
- 本文件中该 Phase 的 Scope 与 DoD

**输出**
- `docs/reviews/phase-N-review.md`，按以下评分项：
  1. **Think Before Coding**：是否有未声明的假设？
  2. **Simplicity First**：有没有当前阶段用不到的抽象？
  3. **Surgical Changes**：有没有越权改动（看 Scope 列表）？
  4. **Goal-Driven Execution**：DoD 验证手段是否完备？
  5. **Project rules**：凭据/白名单/日志格式是否合规？

**Scope**
- 仅 `docs/reviews/`，不得改其他任何文件

**Definition of Done**
- 报告文件存在，5 项评分都给出 ✓ / ⚠️ / ✗ 之一并附理由
- ⚠️ 或 ✗ 项需建议修正方案

---

## 附录 A：`PREPARATION.md` 模板

```markdown
# 准备清单

> 由 Onboarding Agent 与用户交互后生成。供主 Agent 和后续编码 Agent 消费。

## ✅ 已就绪

### OpenAI
- API Key：<已在 Keychain：service=voice-feishu, account=openai / 未设置>
- Tier 等级：<Tier 1 / Tier 2 / ...>
- 充值余额：<金额或"足够>1周">

### 飞书
- 自建应用 App ID：<在 Keychain：service=voice-feishu, account=lark / 未创建>
- 已勾选权限：<im:message, docx:document.readonly, ...>
- `lark login` 状态：<✓ user_access_token 已落 / 未登录>

### macOS 权限
- 麦克风访问：<已授权 / 未授权>
- 辅助功能（pynput 全局快捷键）：<已授权 / 未授权>
- 屏幕录制（可选，未来 OCR fallback 用）：<已授权 / 未授权 / 不需要>

### 浏览器
- 主用浏览器：<Chrome / Edge / Arc / ...>
- 版本：<...>
- 已开启开发者模式（用于加载未打包扩展）：<是 / 否>

## ⏳ 待办（按优先级）

- [ ] <具体动作 1>
- [ ] <具体动作 2>

## 🎯 业务偏好

### 高频操作（用于裁剪 Phase 2 工具集）
- <动词 1>，例："给 X 发周报"
- <动词 2>，例："搜本周日程"

### 助手风格
- 语言：<普通话>
- 语气：<半正式 / 随意 / 正式>
- 危险操作确认策略：<每次都口头确认 / 仅删除类确认>

### 优先级
- 最希望先看到效果的场景：<...>
```

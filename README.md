# voice-feishu

macOS 语音助手：对着麦克风说话，直接操控飞书。

基于 OpenAI Realtime API (`gpt-realtime-2`) + 飞书官方 CLI (`lark-cli`)，支持语音搜联系人、读文档、发消息、查日程等操作。

## 效果演示

```
你：「帮我搜一下张三的联系方式」
→ lark-cli contact +search-user --query 张三
→ 助手语音回复：「找到了，张三的工号是 12345，邮箱是 zhangsan@company.com」
```

## 快速开始

### 1. 环境要求

- macOS (Apple Silicon / Intel)
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (推荐) 或 pip
- Node.js (用于 lark-cli)

### 2. 安装

```bash
git clone https://github.com/ada_ly/voice-feishu.git
cd voice-feishu
uv sync --all-groups
```

### 3. 安装并登录 lark-cli

```bash
npm install -g @anthropic-ai/lark-cli  # 飞书官方 CLI
lark-cli config init
lark-cli auth login --app-id <你的APP_ID> --app-secret <你的APP_SECRET>
```

需要先在[飞书开发者后台](https://open.feishu.cn)创建自建应用并开通所需权限。

### 4. 配置凭据 (macOS Keychain)

```bash
# OpenAI API Key
security add-generic-password -s voice-feishu -a openai -w 'sk-...' -U

# 飞书应用凭据
security add-generic-password -s voice-feishu -a lark -w '{"app_id":"cli_xxx","app_secret":"xxx"}' -U
```

### 5. 验证环境

```bash
uv run python scripts/verify_setup.py
```

应输出四行 ✓。

### 6. 跑通 Demo

```bash
# 干跑（仅测试麦克风，不调 API）
uv run python scripts/smoke_test.py --dry-run --seconds 0.5

# 语音对话（无工具）
uv run python scripts/smoke_test.py --seconds 4

# 语音 + 飞书工具调用（完整 demo）
uv run python scripts/smoke_test.py --with-tools --seconds 6
```

## 支持的飞书操作

| 语音指令示例 | 对应工具 |
|---|---|
| 「搜一下张三」 | `feishu_contact_search` |
| 「这篇文档讲了什么」 | `feishu_doc_fetch_markdown` |
| 「搜今天的会议纪要」 | `feishu_minutes_search` |
| 「给张三发条消息说…」 | `feishu_message_send` |
| 「帮我建个日程…」 | `feishu_calendar_event_create` |

## 进阶用法

### Chrome 扩展 (捕获当前飞书页面上下文)

```bash
# 启动上下文服务
uv run python -m desktop --context-server
```

然后在 Chrome → `chrome://extensions` → 开发者模式 → 加载 `extension/` 目录。

打开飞书文档后，语音助手能自动感知你正在看哪篇文档。

### 桌面菜单栏模式

```bash
uv run python -m desktop
```

快捷键 `⌘⇧Space` 开始/结束录音。

## 项目结构

```
desktop/           Python 主程序
  audio.py         麦克风/扬声器 asyncio 接口
  realtime.py      OpenAI Realtime WebSocket 客户端
  tools/           飞书工具桥接 (lark-cli subprocess)
  config.py        Keychain 凭据读取
  app.py           PyQt6 菜单栏应用
extension/         Chrome MV3 扩展 (飞书页面上下文捕获)
scripts/           验证与烟测脚本
tests/             单元测试
docs/              设计文档
```

## 开发

```bash
uv run ruff check .
uv run mypy --strict desktop/
uv run pytest
```

## License

MIT

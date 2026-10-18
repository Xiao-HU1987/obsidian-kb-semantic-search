# 知识库语义搜索 (KB Semantic Search)

在 Obsidian 中进行中文语义搜索：调用**本机自建的本地混合检索服务**，融合向量检索（bge-small-zh）与 FTS5 全文检索（RRF 融合），结果卡片可直接跳转到对应笔记。

Chinese semantic search inside Obsidian. This plugin is **frontend only**: it talks to a local retrieval service you run yourself (vector search with `bge-small-zh` + SQLite FTS5 full-text search, fused with RRF).

> ⚠️ **重要依赖 / Important dependency**
> 本插件不是开箱即用的纯插件，它需要一个运行在 `http://127.0.0.1:8765` 的本地检索服务。该服务不在本插件内，也**不会**被本插件启动或安装。若不运行该服务，插件只能打开面板但无法返回结果。
>
> This plugin requires a **local HTTP retrieval service** listening on `http://127.0.0.1:8765`. It is not bundled with the plugin and is **not** started by it. Without that service, the search panel opens but returns no results.

---

## 功能 / Features

- 中文语义搜索面板（丝带图标或命令面板 `打开语义搜索面板`）。
- 混合检索：向量语义召回 + FTS5 关键词召回，RRF 融合排序。
- 结果卡片：标题、笔记路径、命中片段（关键词高亮）、来源徽标（混合 / 向量 / 全文）、得分与各路排名。
- 点击结果直接在当前工作区打开对应笔记。
- 设置项：本地服务地址、返回结果条数（1–50）、目录片段过滤（可选）、连接检查。
- 命令：`打开语义搜索面板`、`检查本地检索服务状态`（读取 `/health`）。

---

## 依赖的本地检索服务 / Required local service

插件只调用以下两个接口 / The plugin calls exactly two endpoints:

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查：检索引擎模式、已索引文档数、最近更新时间（设置中的「测试连接」与「检查本地检索服务状态」命令使用） |
| `POST` | `/search` | 语义检索，请求体 `{"query": "...", "top_k": 10, "filters": {"dirs": [...]}}` |

服务的进程内脚本为 `scripts/kb_api_server.py`（纯 Python 标准库 `http.server`，仅监听 `127.0.0.1:8765`，默认零第三方 HTTP 依赖），其检索逻辑由 `lib/kb_retrieval`（`KBSearcher` / `KBIndexer`）提供。

启动方式（任选其一，均在你自己的机器上执行）：

```bash
# 前台调试（首次运行会加载本地语义模型，可能等待 5~15 秒）
python3 scripts/kb_api_server.py

# 或以常驻服务方式运行（macOS launchd，KeepAlive 崩溃自启）
launchctl load -w launchd/com.kbautomation.kb-api.plist
```

确认服务可用：

```bash
curl -s http://127.0.0.1:8765/health
```

在插件设置中把「本地检索服务地址」填为 `http://127.0.0.1:8765`，点击「测试连接」即可看到引擎与索引概况。

---

## 安装 / Installation

### 手动安装 / Manual
1. 下载最新 Release 中的 `main.js`、`manifest.json`、`styles.css`。
2. 放入 `<你的库>/.obsidian/plugins/kb-semantic-search/` 目录。
3. 在 Obsidian 设置 → 第三方插件中启用「知识库语义搜索」。

### BRAT
在 BRAT 中添加 beta 插件仓库 `Xiao-HU1987/obsidian-kb-semantic-search`。

### 社区插件市场 / Community plugins
本插件通过 Obsidian 社区开发者后台（[community.obsidian.md](https://community.obsidian.md/)）提交至官方插件目录；发布后即可在 Obsidian 的「浏览」中搜索「知识库语义搜索」安装。

---

## 设置项 / Settings

| 设置 | 说明 | 默认 |
| --- | --- | --- |
| 本地检索服务地址 | 检索服务根地址 | `http://127.0.0.1:8765` |
| 每次返回结果数 | 结果条数 | `10` |
| 目录过滤（可选） | 仅在路径包含这些片段（英文逗号分隔）的文档中检索；留空 = 全库 | 空 |
| 连接检查 | 读取 `/health` 并显示引擎与索引概况 | — |

---

## 已知限制 / Known limitations & notes

- **仅桌面端**：插件通过 `fetch` 访问 `127.0.0.1`，移动端（iOS/Android）与 Obsidian 同步环境无法访问你本机的服务，因此 `isDesktopOnly: true`。
- **需自备本地服务**：向量模型、索引构建与维护都在服务侧完成，插件不包含模型、不做索引、不下载任何模型权重。
- 检索结果质量取决于本地索引是否覆盖目标笔记；索引更新由服务侧触发。
- 服务仅监听回环地址，除本机外不可访问；本插件不向任何远程服务器发送数据。

---

## 许可 / License

MIT © 2026 huxiao

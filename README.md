# KB Semantic Search

Chinese semantic search inside Obsidian: the plugin calls a **local hybrid retrieval service** that you run yourself, fusing vector search (`bge-small-zh`) with SQLite **FTS5** full-text search via **RRF**, and lets you jump straight to the matching note from the result card.

> ⚠️ **Important dependency — this plugin is not self-contained**
> It requires a **local HTTP retrieval service** listening on `http://127.0.0.1:8765`. That service is **not bundled** with this plugin and is **not** started by it. Without the service running, the search panel opens but returns no results.

---

## Features

- Chinese semantic search panel (ribbon icon, or the command palette entry *Open semantic search panel*).
- Hybrid retrieval: vector semantic recall + FTS5 keyword recall, fused and re-ranked with RRF.
- Result cards show the note title, vault path, highlighted snippet, a source badge (hybrid / vector / full-text), the fused score, and each retriever's rank.
- Click a result to open the corresponding note in the current workspace.
- Settings: service base URL, number of results (1–50), optional directory filter, and a connection check.
- Commands: *Open semantic search panel* and *Check local retrieval service status* (reads `/health`).

---

## Required local service

The plugin calls exactly two endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check: engine mode, indexed document count, last update time (used by *Test connection* and the status command) |
| `POST` | `/search` | Semantic search; body `{"query": "...", "top_k": 10, "filters": {"dirs": [...]}}` |

The service is a plain-Python HTTP server listening **only** on `127.0.0.1:8765`, backed by a retrieval library (`KBSearcher` / `KBIndexer`) that owns the vector index, the FTS5 index, and the local embedding model.

Start it on your own machine (either way):

```bash
# foreground, for debugging (the first run loads the local embedding model, 5–15s)
python3 scripts/kb_api_server.py

# or as a resident service (macOS launchd, auto-restart on crash)
launchctl load -w launchd/com.kbautomation.kb-api.plist
```

Verify it is up:

```bash
curl -s http://127.0.0.1:8765/health
```

Then set **Service URL** to `http://127.0.0.1:8765` in the plugin settings and press **Test connection** to see the engine and index summary.

---

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Put them in `<your vault>/.obsidian/plugins/kb-semantic-search/`.
3. Enable **KB Semantic Search** under Settings → Community plugins.

### BRAT
Add the beta plugin repository `Xiao-HU1987/obsidian-kb-semantic-search` in BRAT.

### Community plugins
This plugin is submitted to the official plugin directory through the Obsidian developer dashboard. Once published, search for **KB Semantic Search** in *Browse → Community plugins*.

---

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| Service URL | Base URL of the retrieval service | `http://127.0.0.1:8765` |
| Results per query | Number of results returned | `10` |
| Directory filter (optional) | Only search notes whose path contains one of these fragments (comma-separated); empty = whole vault | empty |
| Connection check | Reads `/health` and shows the engine and index summary | — |

---

## Known limitations

- **Desktop only.** The plugin uses `fetch` to reach `127.0.0.1`, which mobile clients cannot reach on your machine — hence `isDesktopOnly: true`.
- **Bring your own service.** The embedding model, index building, and index maintenance all live in the service; this plugin ships no model, performs no indexing, and downloads nothing.
- Result quality depends on how well the local index covers your notes; index updates are triggered on the service side.
- The service binds to the loopback interface only. This plugin sends no data to any remote server.

---

## Development

```bash
npm install
npm run build     # type-check, then bundle main.ts into main.js at the repo root
npm run dev       # watch mode
```

`main.ts` is the source of truth; `main.js` is the bundled CommonJS artifact built by esbuild (`format: cjs`, `external: obsidian`, minified for production).

---

## License

MIT © 2026 huxiao

---

## 中文摘要

在 Obsidian 中做中文语义搜索：调用**你本机自建的本地混合检索服务**，融合向量检索（bge-small-zh）与 FTS5 全文检索（RRF 融合），结果卡片可直接跳转到对应笔记。

- **重要依赖**：本插件不是开箱即用的纯插件，它需要 `http://127.0.0.1:8765` 上的本地检索服务；该服务不在插件内、也不会被插件启动。服务未运行时，面板能打开但没有结果。
- 功能：语义搜索面板、混合检索与 RRF 融合排序、结果卡片（标题/路径/高亮片段/来源徽标/得分）、点击跳转笔记、设置项（服务地址、结果数、目录过滤、连接检查）。
- 仅桌面端；插件不含模型、不做索引、不下载任何模型权重、不向任何远程服务器发送数据。

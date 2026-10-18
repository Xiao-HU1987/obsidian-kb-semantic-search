# Changelog

## 1.0.3

目录扫描安全项修复（**功能表现不变**，但产出代码有真实改动，故版本升级）：

- **SOURCE CODE（Error）**：结果片段的 `snippet.innerHTML = ...` 改为用 DOM API 构建（新增 `renderSnippet`：按 `**词**` 拆分，文本节点 + `<mark>` 元素），消除「Unsafe assignment to innerHTML」与「Do not write to DOM directly using innerHTML/outerHTML property」。
- 消除两条 Warning：`setTimeout` / `clearTimeout` → `window.setTimeout` / `window.clearTimeout`（弹窗窗口兼容性）。
- 未处理（均不阻塞上架）：`fetch` 建议改用 Obsidian 内置 `requestUrl`、1.13+ 声明式设置 API（`getSettingDefinitions`）、RELEASES 段的 artifact attestations 建议。

## 1.0.2

目录扫描合规修复（**插件功能无变化**：`main.js` 与 1.0.1 逐字节一致，已用构建复现验证）：

- **MANIFEST（Error）**：`manifest.json` 的 `description` 移除「Obsidian」一词（目录规则要求描述中不得出现该词）。
- **SOURCE CODE（Error）**：仓库补齐**源码** `main.ts` 与构建配置（`package.json` / `esbuild.config.mjs` / `tsconfig.json`），此前仓库里只有打包压缩后的产物 `main.js`，扫描器判定「找不到源码」。现在 `npm run build` 可从 `main.ts` 复现出与发布资产逐字节一致的 `main.js`。
- **README（Warning）**：README 改为**英文为主**（英文完整说明 + 末尾简短中文摘要），此前中英混排但中文占绝对多数，扫描器判定「没有英文内容」。
- 未处理：RELEASES 段的 Recommendation（缺少 GitHub artifact attestations）——仅为建议项，不阻塞上架。

## 1.0.1

- 目录命名合规修复（功能无变化，`main.js` 未改动）：
  - `manifest.json` 的 `name` 由中文「知识库语义搜索」改为英文 `KB Semantic Search`（Obsidian 社区目录要求插件名使用英文）。
  - `description` 结尾标点由「。」改为 `.`（目录要求描述以句号结尾）。

## 1.0.0

- 首版发布。
- 提供中文语义搜索面板（丝带图标 + 命令面板入口）。
- 调用本地混合检索服务 `http://127.0.0.1:8765/search`，融合 bge-small-zh 向量检索与 FTS5 全文检索（RRF 融合）。
- 结果卡片展示标题、路径、命中片段、来源徽标（混合 / 向量 / 全文）与得分，点击跳转到对应笔记。
- 设置项：本地服务地址、返回结果数、目录过滤、连接检查（读取 `/health`）。

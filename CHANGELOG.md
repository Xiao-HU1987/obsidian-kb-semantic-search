# Changelog

## 1.0.5

官方扫描（v1.0.4，commit 94de8cc）结果：**0 个 Error / Failed**，6 项 Pass（含两项 attestation 与构建逐字节可复现），另剩 3 个 Warnings + 3 个 Other。本次逐条清掉：

- **Warnings（medium）**：
  - `main.ts:117`「Expected the Promise rejection reason to be an Error.」→ `withTimeout` 的拒绝值改为 `err instanceof Error ? err : new Error(String(err))`（`prefer-promise-reject-errors`）。
  - `main.ts:504`「Unsafe assignment of an `error` or `any` typed value」→ `loadSettings()` 先把 `loadData()` 的返回值落到 `unknown` 再断言为 `Partial<KBSettings>`（`no-unsafe-assignment`）。
  - `package.json:21`「`builtin-modules` should be replaced with an alternative package」→ 移除该 devDependency，改用 esbuild 的 `platform: "node"` 自动外部化 Node 内置模块（构建产物不受影响）。
- **Other（info，均来自已废弃的 `display()` 命令式设置页）**：`display` 已废弃（Since 1.13.0，改用 `getSettingDefinitions`）、`setDynamicTooltip` 已废弃 → 删除 `display()` 兜底，设置页完全改用声明式 API。相应地 `manifest.json` 的 **`minAppVersion` 提升为 1.13.0**（`versions.json` 已同步）。
- 功能表现不变；`main.js` 构建产物与源码仍逐字节可复现。

## 1.0.4

目录扫描建议项落地（**功能表现不变**，但逻辑确有改动，故版本升级）：

- **`fetch` → Obsidian 内置 `requestUrl`**（消除 2 条 Warning）：请求改走 Electron 侧，不再受渲染进程 CORS 限制；因 `requestUrl` 不支持中断，新增 `withTimeout` 做 30 秒（搜索）/ 8 秒（健康检查）超时竞速，超时错误沿用 `AbortError` 以复用既有提示分支。
- **连接失败提示口径放宽**：`requestUrl` 的报错文案与浏览器 `fetch` 不同（不再是 `Failed to fetch`），改为匹配 `net::` / `ERR_` / `ECONNREFUSED` 等特征串，避免「无法连接本地检索服务」的友好提示失效。
- **声明式设置 API**（消除 1 条 Warning + 1 条 Recommendation）：设置页新增 `getSettingDefinitions()`（1.13+），保留 `display()` 作为 <1.13 的命令式兜底；`apiBase` 增加非空与 http(s) 前缀校验，健康检查结果改为就地更新，不再整页重绘。
- **GitHub Actions 发布流水线 + 构建溯源证明**（消除 RELEASES 段 Recommendation）：新增 `.github/workflows/release.yml`，推送 tag 即自动 `npm ci` → `npm run build` → 校验 tag 与 `manifest.json` 版本一致、构建产物与仓库 `main.js` 逐字节一致 → 用 `actions/attest-build-provenance` 为三个资产生成 provenance attestation → 创建 Release 并上传资产。**此后请用打 tag 触发发布，不要再手工 `gh release create`（否则资产无 attestation）。**

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

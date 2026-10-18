import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  RequestUrlParam,
  RequestUrlResponse,
  Setting,
  SettingDefinitionItem,
  TAbstractFile,
  TFile,
} from "obsidian";

/* ------------------------------------------------------------------ */
/* 类型定义（与 kb-automation 本地 HTTP API 的响应契约一一对应）          */
/* ------------------------------------------------------------------ */

interface KBSettings {
  apiBase: string;
  topK: number;
  dirFilter: string; // 逗号分隔的目录片段，如：02-行业知识,98-智能协作中枢
}

const DEFAULT_SETTINGS: KBSettings = {
  apiBase: "http://127.0.0.1:8765",
  topK: 10,
  dirFilter: "",
};

interface SearchResultItem {
  doc_id: string;
  path: string;
  title: string;
  score: number;
  snippet: string; // 含 **关键词** 标记
  tags: string[];
  project: string;
  type: string;
  chunk_idx: number;
  rank_vector: number | null;
  rank_fts: number | null;
  source: "hybrid" | "vector" | "fts";
}

interface SearchResponse {
  query: string;
  top_k: number;
  count: number;
  took_ms: number;
  engine: string;
  results: SearchResultItem[];
}

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  engine: {
    index_engine: string;
    fts_ready: boolean;
    lance_ready: boolean;
    model: string;
  };
  index: {
    updated_at: string | null;
    docs: number;
  };
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                             */
/* ------------------------------------------------------------------ */

/** 把 snippet 里的 **词** 渲染成 <mark> 高亮：全程用 DOM API 构建，不做 HTML 字符串注入 */
function renderSnippet(parent: HTMLElement, snippet: string): void {
  snippet.split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      parent.createEl("mark", { text: part });
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  });
}

function parseDirs(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const SOURCE_LABEL: Record<string, string> = {
  hybrid: "混合",
  vector: "向量",
  fts: "全文",
};

/** requestUrl 是 Electron 侧请求，不受 CORS 限制，也不支持中断；这里用超时竞速模拟中断。 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const err = new Error(`请求超时（${ms / 1000} 秒）`);
      // 复用已有的「检索超时」提示分支
      err.name = "AbortError";
      reject(err);
    }, ms);
    task.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** 统一封装：Obsidian 内置 requestUrl + 超时 + 手动状态码判断（throw:false 便于自取错误正文） */
async function kbRequest(param: RequestUrlParam, timeoutMs: number): Promise<RequestUrlResponse> {
  const resp = await withTimeout(requestUrl({ ...param, throw: false }), timeoutMs);
  if (resp.status >= 400) {
    throw new Error(`HTTP ${resp.status} ${resp.text ?? ""}`.trim());
  }
  return resp;
}

/** 连接类失败的特征串（requestUrl 抛错文案与浏览器 fetch 不同，不能再只判 "Failed to fetch"） */
const CONNECTION_ERR_PATTERN = /Failed to fetch|net::|ERR_|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up/i;

/* ------------------------------------------------------------------ */
/* 搜索面板                                                             */
/* ------------------------------------------------------------------ */

class SearchModal extends Modal {
  private plugin: KBSemanticPlugin;
  private inputEl!: HTMLInputElement;
  private resultEl!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private searching = false;

  constructor(app: App, plugin: KBSemanticPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.titleEl.setText("知识库语义搜索");

    const searchBar = this.contentEl.createDiv({ cls: "kbss-search-bar" });
    this.inputEl = searchBar.createEl("input", {
      cls: "kbss-input",
      attr: { type: "text", placeholder: "输入要搜索的内容，回车检索（本地混合检索）…" },
    });
    this.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void this.runSearch();
      }
    });
    const btn = searchBar.createEl("button", { cls: "kbss-btn", text: "搜索" });
    btn.addEventListener("click", () => void this.runSearch());

    this.statusEl = this.contentEl.createDiv({ cls: "kbss-status" });
    this.resultEl = this.contentEl.createDiv({ cls: "kbss-results" });

    this.inputEl.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async runSearch(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query || this.searching) return;
    this.searching = true;
    this.resultEl.empty();
    this.statusEl.empty();
    this.statusEl.createSpan({
      cls: "kbss-hint",
      text: "检索中… 首次使用需要加载本地语义模型，可能等待 5~15 秒。",
    });

    const settings = this.plugin.settings;
    const body: Record<string, unknown> = { query, top_k: settings.topK };
    const dirs = parseDirs(settings.dirFilter);
    if (dirs.length) body.filters = { dirs };

    try {
      const resp = await kbRequest(
        {
          url: `${settings.apiBase.replace(/\/+$/, "")}/search`,
          method: "POST",
          contentType: "application/json",
          body: JSON.stringify(body),
        },
        30_000,
      );
      const data = resp.json as SearchResponse;
      this.renderResults(data);
    } catch (err) {
      this.renderError(err);
    } finally {
      this.searching = false;
    }
  }

  private renderResults(data: SearchResponse): void {
    this.statusEl.empty();
    this.statusEl.createSpan({
      cls: "kbss-meta",
      text: `${data.count} 条结果 · 耗时 ${(data.took_ms / 1000).toFixed(1)}s · 引擎 ${data.engine}`,
    });
    this.resultEl.empty();

    if (!data.results.length) {
      this.resultEl.createDiv({
        cls: "kbss-empty",
        text: "没有命中结果，换个说法试试；也可在设置中放宽目录过滤。",
      });
      return;
    }

    for (const item of data.results) {
      this.resultEl.appendChild(this.buildCard(item));
    }
  }

  private buildCard(item: SearchResultItem): HTMLElement {
    const card = createDiv({ cls: "kbss-card" });

    const head = card.createDiv({ cls: "kbss-card-head" });
    head.createSpan({ cls: "kbss-title", text: item.title || item.path });

    const badge = head.createSpan({ cls: `kbss-badge kbss-src-${item.source}` });
    badge.setText(SOURCE_LABEL[item.source] ?? item.source);

    card.createDiv({ cls: "kbss-path", text: item.path });

    const snippet = card.createDiv({ cls: "kbss-snippet" });
    renderSnippet(snippet, item.snippet);

    const foot = card.createDiv({ cls: "kbss-card-foot" });
    foot.createSpan({
      cls: "kbss-meta",
      text: `得分 ${item.score.toFixed(4)} · 向量#${item.rank_vector ?? "-"} / 全文#${item.rank_fts ?? "-"}`,
    });
    if (item.project || item.type) {
      foot.createSpan({
        cls: "kbss-meta",
        text: [item.project, item.type].filter(Boolean).join(" / "),
      });
    }

    card.addEventListener("click", () => void this.openNote(item.path));
    return card;
  }

  private async openNote(relPath: string): Promise<void> {
    const file: TAbstractFile | null = this.app.vault.getAbstractFileByPath(relPath);
    if (!(file instanceof TFile)) {
      new Notice(`未在库中找到该笔记（可能已被移动）：${relPath}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    this.close();
  }

  private renderError(err: unknown): void {
    this.statusEl.empty();
    this.resultEl.empty();
    const box = this.resultEl.createDiv({ cls: "kbss-error-box" });
    const e = err as { name?: string; message?: string };
    if (e?.name === "AbortError") {
      box.createDiv({ text: "检索超时（30 秒）。如果是首次启动后立刻搜索，请稍候片刻再试。" });
    } else if (CONNECTION_ERR_PATTERN.test(String(e?.message ?? err))) {
      box.createDiv({
        text: "无法连接本地检索服务（127.0.0.1:8765）。",
      });
      box.createDiv({
        cls: "kbss-error-detail",
        text: "请确认后台服务正在运行：launchd 常驻服务 Label 为 com.kbautomation.kb-api（开机自启、崩溃自拉起）。也可稍后在本插件设置中点击「测试连接」。",
      });
    } else {
      box.createDiv({ text: "检索失败" });
      box.createDiv({ cls: "kbss-error-detail", text: String(e?.message ?? err) });
    }
  }
}

/* ------------------------------------------------------------------ */
/* 设置页                                                               */
/* ------------------------------------------------------------------ */

class KBSettingsTab extends PluginSettingTab {
  private plugin: KBSemanticPlugin;

  constructor(app: App, plugin: KBSemanticPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Obsidian 1.13+ 声明式设置 API。返回非空数组时，宿主不再调用下面的 display()；
   * 低于 1.13 的版本不认识本方法，仍走 display() 的命令式渲染（双轨兼容）。
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const plugin = this.plugin;
    return [
      {
        name: "本地检索服务地址",
        desc: "本地混合检索服务的地址，默认 http://127.0.0.1:8765。",
        control: {
          type: "text",
          key: "apiBase",
          placeholder: DEFAULT_SETTINGS.apiBase,
          defaultValue: DEFAULT_SETTINGS.apiBase,
          validate: (value: string) => {
            const v = String(value ?? "").trim();
            if (!v) return "地址不能为空";
            if (!/^https?:\/\//i.test(v)) return "请填写以 http:// 或 https:// 开头的地址";
          },
        },
      },
      {
        name: "每次返回结果数",
        desc: `检索返回的结果条数（1–50），当前默认 ${DEFAULT_SETTINGS.topK} 条。`,
        control: {
          type: "slider",
          key: "topK",
          min: 1,
          max: 50,
          step: 1,
          defaultValue: DEFAULT_SETTINGS.topK,
        },
      },
      {
        name: "目录过滤（可选）",
        desc: "只在包含这些目录片段的文档中检索，多个用英文逗号分隔，例如：02-行业知识,98-智能协作中枢。留空表示全库。",
        control: {
          type: "text",
          key: "dirFilter",
          placeholder: "留空 = 全库检索",
          defaultValue: "",
        },
      },
      {
        name: "连接检查",
        desc: "读取服务健康状态：检索引擎模式、已索引文档数、最近更新时间。",
        render: (setting) => {
          const state = setting.infoEl.createDiv({ cls: "kbss-health-state" });
          setting.addButton((button) =>
            button.setButtonText("测试连接").onClick(async () => {
              button.setDisabled(true);
              button.setButtonText("检查中…");
              state.removeClass("kbss-health-ok", "kbss-health-err");
              state.empty();
              try {
                const health = await plugin.fetchHealth();
                new Notice(
                  `连接正常：${health.engine.index_engine} 引擎 · ${health.index.docs} 篇文档`,
                  6000,
                );
                state.addClass("kbss-health-ok");
                state.setText(
                  `连接正常：引擎 ${health.engine.index_engine}（向量库 ${health.engine.lance_ready ? "就绪" : "未就绪"} / 全文 ${health.engine.fts_ready ? "就绪" : "未就绪"}），已索引 ${health.index.docs} 篇，最近更新 ${health.index.updated_at ?? "未知"}`,
                );
              } catch (err) {
                new Notice("连接失败，请确认本地服务已启动", 6000);
                state.addClass("kbss-health-err");
                state.setText(
                  `连接失败：${String((err as Error)?.message ?? err)}。请确认 launchd 服务 com.kbautomation.kb-api 正在运行。`,
                );
              } finally {
                button.setDisabled(false);
                button.setButtonText("测试连接");
              }
            }),
          );
        },
      },
    ];
  }

  /** 兜底：Obsidian < 1.13 使用（1.13+ 由 getSettingDefinitions 接管，不再执行） */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("本地检索服务地址").addText((text) =>
      text
        .setPlaceholder("http://127.0.0.1:8765")
        .setValue(this.plugin.settings.apiBase)
        .onChange(async (value) => {
          this.plugin.settings.apiBase = value.trim() || DEFAULT_SETTINGS.apiBase;
          await this.plugin.saveSettings();
        }),
    );

    new Setting(containerEl)
      .setName("每次返回结果数")
      .addSlider((slider) =>
        slider
          .setLimits(1, 50, 1)
          .setValue(this.plugin.settings.topK)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.topK = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("目录过滤（可选）")
      .setDesc("只在包含这些目录片段的文档中检索，多个用英文逗号分隔，例如：02-行业知识,98-智能协作中枢。留空表示全库。")
      .addText((text) =>
        text
          .setPlaceholder("留空 = 全库检索")
          .setValue(this.plugin.settings.dirFilter)
          .onChange(async (value) => {
            this.plugin.settings.dirFilter = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("连接检查")
      .setDesc("读取服务健康状态：检索引擎模式、已索引文档数、最近更新时间。")
      .addButton((button) =>
        button.setButtonText("测试连接").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("检查中…");
          try {
            const health = await this.plugin.fetchHealth();
            new Notice(
              `连接正常：${health.engine.index_engine} 引擎 · ${health.index.docs} 篇文档`,
              6000,
            );
            this.display();
            const state = containerEl.createDiv({ cls: "kbss-health-ok" });
            state.setText(
              `连接正常：引擎 ${health.engine.index_engine}（向量库 ${health.engine.lance_ready ? "就绪" : "未就绪"} / 全文 ${health.engine.fts_ready ? "就绪" : "未就绪"}），已索引 ${health.index.docs} 篇，最近更新 ${health.index.updated_at ?? "未知"}`,
            );
          } catch (err) {
            new Notice("连接失败，请确认本地服务已启动", 6000);
            this.display();
            containerEl
              .createDiv({ cls: "kbss-health-err" })
              .setText(`连接失败：${String((err as Error).message ?? err)}。请确认 launchd 服务 com.kbautomation.kb-api 正在运行。`);
          } finally {
            button.setDisabled(false);
            button.setButtonText("测试连接");
          }
        }),
      );
  }
}

/* ------------------------------------------------------------------ */
/* 插件主体                                                             */
/* ------------------------------------------------------------------ */

export default class KBSemanticPlugin extends Plugin {
  declare settings: KBSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("search", "知识库语义搜索", () => {
      new SearchModal(this.app, this).open();
    });

    this.addCommand({
      id: "open",
      name: "打开语义搜索面板",
      callback: () => new SearchModal(this.app, this).open(),
    });

    this.addCommand({
      id: "health-check",
      name: "检查本地检索服务状态",
      callback: () => {
        void this.fetchHealth()
          .then((h) =>
            new Notice(
              `检索服务正常：${h.engine.index_engine} 引擎 · ${h.index.docs} 篇文档 · 更新于 ${h.index.updated_at ?? "未知"}`,
              6000,
            ),
          )
          .catch(() => new Notice("检索服务不可用：请确认 com.kbautomation.kb-api 已启动", 6000));
      },
    });

    this.addSettingTab(new KBSettingsTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async fetchHealth(): Promise<HealthResponse> {
    const resp = await kbRequest(
      { url: `${this.settings.apiBase.replace(/\/+$/, "")}/health` },
      8_000,
    );
    return resp.json as HealthResponse;
  }
}

import esbuild from "esbuild";
import process from "process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 构建产物直接输出到仓库根目录的 main.js（与 GitHub Release 资产一致，便于目录扫描器验证「构建产物 == 提交产物」）
const OUT_FILE = path.join(__dirname, "main.js");

const prod = process.argv[2] === "production";

// platform: "node" 会自动把 Node 内置模块标记为 external，因此不再需要 builtin-modules 依赖
const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  platform: "node",
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "ES2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: OUT_FILE,
  minify: prod,
});

if (prod) {
  await context.rebuild();
  console.log("构建完成，产物已输出：" + OUT_FILE);
  process.exit(0);
} else {
  await context.watch();
}

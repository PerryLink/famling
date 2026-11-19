# 移除 Electron / 旧 demo 栈（E10 · MB-106 · task-126）

- 任务：task-126「移除 Electron/旧 demo 栈（E10 MB-106）」——删除 `app/electron/`、`electron` 依赖与 npm 脚本；发布构建收敛到 pet + 法务/同意必需页；更新 tests/vite/package；不破坏构建。
- 基线：`desktop-games` HEAD **`cdece722f70b264822c1903b2fa7d841ca10923e`**（`chore(status): final round8 clean-checkout truth`）。开工时工作树只脏 `docs/art/**`、`docs/research/**`；执行期间并发任务 task-124（MB-105 security 依赖方向）、task-125（MB-046 运行期 DPR）、task-107/127 等持续写入 `src/`、`tests/`，**本报告只把 task-126 自己的改动计入结论**。
- 写权限（task-126 writeScopes）：`app/electron`、`package.json`、`package-lock.json`、`vite.config.ts`、`tests`、`docs/plan`。**未改** `src/`、`app/tauri/`（Rust）、`scripts/`、`README.md`、法务文档、插件仓。
- 约束：**未 commit / 未 push / 未打 tag**；本报告不是发布证据，也不代表 E7/T1 的残余文档清理已完成（见 §5）。

---

## 1. 改动

### 1.1 删除 Electron 宿主

`app/electron/` 整体移出仓库（先隔离到 `/tmp/mb106-electron-quarantine.*`，验证路径后删除）：

| 文件 | 行数 |
| --- | ---: |
| `app/electron/build.mjs` | 15 |
| `app/electron/main.ts` | 183 |
| `app/electron/preload.ts` | 11 |
| `app/electron/renderer.html` | 35 |
| `app/electron/renderer.js` | 76 |
| `app/electron/style.css` | 32 |

`app/electron/dist/`（gitignored 构建产物）随目录一并删除。

### 1.2 package.json / package-lock.json

- `devDependencies` 删除 `electron: ^45.3.0`。
- 删除 npm 脚本 `electron:build`、`electron:start`。
- 新增 `build:demo: vite build --mode demo`；`build` 仍是发布 profile（Tauri `beforeBuildCommand` 不变，走默认 release）。
- `package-lock.json` 删除 13 个条目（electron + 只被它引用的传递依赖）：`node_modules/electron`、`@electron/get`、`@electron-internal/extract-zip`、`electron/node_modules/@types/node`、`electron/node_modules/undici-types`、`debug`、`ms`、`env-paths`、`graceful-fs`、`progress`、`semver`、`sumchecker`、`undici`；**无新增条目**，其余依赖版本未变。
- 用临时目录 `npm ci --dry-run --ignore-scripts --offline` 复核 lock 与 package.json 一致：exit 0，计划安装 49 个包，**计划中 0 处 electron**。

### 1.3 vite.config.ts：发布页 profile（9 → 3）

```ts
export const RELEASE_PAGE_INPUTS = { pet: 'pet.html', setup: 'setup.html', chatImport: 'chat-import.html' }
export const DEMO_PAGE_INPUTS = { main: 'index.html', presence: 'presence.html', world: 'world.html',
  aquarium: 'aquarium.html', stall: 'stall.html', town: 'town.html' }
export function resolvePageInputs(mode: string): Record<string, string>
```

- `defineConfig` 改为 `({ mode }) => ({ ... })`：**默认/`production`/`development` 只构建 3 个产品页**；仅 `vite build --mode demo`（`npm run build:demo`）构建 6 个旧 demo/game 页。
- 新增 `releasePageGuard(mode)` 构建后置门：release 构建必须产出 `pet.html`/`setup.html`/`chat-import.html`，且**不得**出现 6 个 demo 页；demo 构建必须产出 9 页。任一不满足 → 构建失败，避免 demo 栈静默回到发布产物。
- `npm run dev` 不受影响：Vite dev server 仍从仓库根目录服务全部 HTML（demo 页手工可开）。

### 1.4 新增测试 `tests/release-build-profile.test.ts`（4 例）

1. `app/electron/` 不存在；package.json 四类依赖无 `electron`/`@electron/*`/`electron-*`；无 `electron` 字样脚本；lock 根与所有 `node_modules/*electron*` 条目消失。
2. 发布 profile = `pet.html` + `setup.html` + `chat-import.html`；`resolvePageInputs('production'|'development')` 均不含 demo 页；Tauri `beforeBuildCommand` 仍走默认 release（不得 `--mode demo`）。
3. `build` 脚本仍为 `vite build`，`build:demo` 为 `vite build --mode demo`，demo profile = 9 页全量。
4. `dist/` 已构建时断言顶栏 HTML 恰为 3 个产品页、无 demo 页（未构建时按项目惯例 skip；CI 的 build-before-test 顺序保证不跳）。

`git diff --stat HEAD`（task-126 自己的文件）：**9 个文件，+72 −529 行**。

---

## 2. 实测（WSL2 Linux，Node `v24.22.1`，npm `11.19.1`，HEAD `cdece72` + dirty 工作树）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | **exit 0**（`tsc --noEmit` 无输出） |
| `npm run build` | **exit 0**；7.32s / 358 modules；`[build] page profile ok (production): chat-import.html, pet.html, setup.html`；`dist` 顶层 HTML = **3**；`dist/legal` 38 文件；`dist/assets/voice/pet` 42 WAV（4,289,208 B） |
| `npm run build:demo` | **exit 0**；10.21s；`[build] page profile ok (demo): aquarium.html, chat-import.html, index.html, pet.html, presence.html, setup.html, stall.html, town.html, world.html`；顶层 HTML = **9**（随后已重新跑 `npm run build` 把 `dist/` 还原为发布 profile） |
| `npm test` | **exit 0：1834 tests / 1834 pass / 0 fail / 0 skipped**；29.9s |
| `npm run legal:check` | exit 0，WARN-ONLY（16 条既有 DRAFT 警告） |
| `node scripts/docs-check.mjs` | exit 0，PASS（27 checks） |
| `npm run version:check` | exit 0，6 个版本镜像 = `0.1.0` |
| `grep -Rni electron package.json package-lock.json vite.config.ts tests/` | 0 命中 |

说明：开工基线（并发任务 task-125 正在改 `hero-page.ts` 的时刻）`npm test` 为 1822 tests / 1814 pass / **1 fail** / 7 skipped；唯一 fail 是 `tests/trust-wiring-static.test.ts` 对 hero DPR 旧写法的断言，属并发任务在途，不是本任务改动，也不是 HEAD 干净基线的结论。task-125 收尾后复跑即上表的 0 fail。

---

## 3. 行为边界

- **发布产物**：`npm run build`（及 Tauri release 的 `beforeBuildCommand`）只含 pet + setup + chat-import；`legal/` 由 `public/legal/` 静态拷贝，仍由既有 `legal-package-guard` 校验 38 个文件与无死链。
- **demo/game 页**：仓库保留、dev server 可开、`npm run build:demo` 可显式构建；不再是发布入口。
- **Rust demo 窗口**：`app/tauri/src-tauri/src/main.rs` 仍有 `aquarium/town/stall/index` 窗口命令，这些 HTML 不再进 release `dist/`。产品形态按 E10-T1 默认 A（研究/陪伴运行时）可接受；若以后发布仍要 demo 窗口，需走 `build:demo` 或另立 profile（本任务未改 Rust）。
- **门禁脚本**：`gui-cdp-smoke`/`a11y-cdp-check`/`scale-dpi-verify`/`soak-short` 只依赖 `dist/pet.html`（及 `setup.html`），不受 9→3 影响。

---

## 4. 复核命令

```bash
npm run typecheck && npm run build && npm test
npm run build:demo && npm run build   # 验证 demo profile 后还原发布 dist
node scripts/docs-check.mjs && npm run legal:check && npm run version:check
```

---

## 5. 未完成 / 超出写权限的残余（建议另立 follow-up，或并入 E7-T1 收尾）

1. **README.md 仍写 Electron 宿主**（第 135–138 行 `npm run electron:build/start` 与 `.electron-win\electron.exe app\electron\dist\main.cjs`，第 160 行链接 `app/electron/`，第 165 行 `docs/assets/p1-electron.png`，第 183/191 行选型叙述）。这些命令/相对链接现在失效；**README.md 不在 task-126 写权限内，未改**。
2. **法务/第三方声明仍把 electron 列为 dev 依赖**：`NOTICE:111`、`THIRD-PARTY.md:136/143/158/178`，`public/legal/` 是 `node scripts/legal-check.mjs --sync` 的生成镜像；改它需要法务文档 owner 与 sync 流程（`legal:check` 不校验依赖清单，故当前仍 PASS）。
3. **脚本/配置里的 Electron 残留**（不在写权限）：`scripts/electron-demo-probe.ps1`、`scripts/probe-electron.ps1`（引用 `.electron-win/electron.exe` 与已删 `app/electron/dist/main.cjs`）、`scripts/backup.mjs:57/63/298`、`scripts/ci-clean-checkout.mjs:23/112/126/158`（`--with-electron-binary`/`ELECTRON_SKIP_BINARY_DOWNLOAD` 已成 no-op）、`.gitignore:7-8`（`.electron-win/`、`app/electron/dist/`）。
4. **本机缓存** `.electron-win/`（约 357 MB，gitignored）与历史截图 `docs/assets/p1-electron.png` 未动。
5. **状态文档**：`docs/plan/EXECUTION-STATUS-2026-11-20.md` 是绑定 `f7ae511` 的只读对账快照，MB-106 仍标 TODO；本任务不擅自改快照计数，交 task-89/123 对账。建议口径：**MB-106 主体 DONE**（Electron 运行时/依赖/脚本删除 + 发布入口 9→3 + 测试/门禁绿）；**E7-T1 在 README/法务/探针脚本清理前仍 PARTIAL**。
6. 未改 Rust/Tauri capabilities：`tauri.conf.json` 仍声明 `game-aquarium/game-town/game-stall/game-farm/bench` capabilities（历史 demo 面），属 E7-T2/后续清理，不影响 Vite 构建与本次测试。

---

## 6. 结论

- Electron 栈（6 个 tracked 文件 + devDependency + 2 个 npm 脚本 + 13 个 lock 条目）已从仓库/依赖图移除；`npm ci` 计划中不再出现 electron。
- 发布构建入口从 9 个 HTML 收敛到 3 个：`pet.html`、`setup.html`、`chat-import.html`（pet + 法务/同意必需页）；旧 demo/game 页保留为 dev/`build:demo` 专属，构建后置门防止回流。
- `tsc` / 全量 tests / Vite build 本机真实复跑全绿（1834/1834）；test/vite/package 与 docs/plan 报告已更新。
- 残余文档/脚本清理见 §5，均因超出 task-126 写权限而未动；不 commit、不 push。

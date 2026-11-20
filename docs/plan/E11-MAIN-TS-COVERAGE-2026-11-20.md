# main.ts 覆盖率缺口与可达性说明（E11 / MB-110 / MB-111）

- 任务：task-104「覆盖率接入门禁（E11 MB-111）」的 main.ts 缺口文档部分；
  task-136 起扩展为 **required 门 + 入口豁免**的说明。
- 基线 commit：`be69a71`（本文 §1/§2 的历史数字实测于该 commit 的工作树）；task-135/136
  的现状见 §8/§9（HEAD `0a5bc0b` + 在途改动）。
- 相关：`docs/plan/COVERAGE-GATE-2026-11-20.md`（覆盖率脚本/基线/required CI 接入）、
  `tests/e11-main-data-chain.test.ts`（AST 行为缝）、`tests/e11-main-boot.test.ts`（boot 状态机行为测试）。
- 结论：**`src/pet/main.ts` 的 0% 行覆盖是工具边界造成的真实事实，不是漏算**；
  task-136 起 `coverage:check` 是 **required** 门，main.ts 以 config 的 **`entryModules` 显式豁免**
  留在测量分母与报告里（仍报 0%），只是不参与强制阈值/ratchet。**没有把 0 改成任何数字**。

---

## 1. 实测事实（HEAD `be69a71`）

| 事实 | 值 | 证据 |
| --- | --- | --- |
| `src/pet/main.ts` 行数 | 4,011 | `wc -l src/pet/main.ts` |
| 顶层 import | 52 | `grep -c '^import ' src/pet/main.ts` |
| 覆盖率运行时 | **未加载（0%）** | `npm run coverage:check` 输出 `! src/pet/main.ts NOT LOADED (0.00%)` |
| 基线记录 | `loaded:false`；20 个关键模块中 18 个已加载（未加载：main.ts / setup-page.ts） | `scripts/coverage-baseline.json` |
| 生产入口 | `pet.html:250` `<script type="module" src="/src/pet/main.ts">` | 主窗口 HTML |

---

## 2. 为什么测试不能 import main.ts

1. **CSS side-effect import**：`src/pet/main.ts:217` `import './pet.css'`。Node/tsx 不是
   Vite，没有 CSS loader，import 该模块在解析阶段就失败。
2. **模块级 DOM/Tauri 副作用**（import 即执行，没有 `if` 保护）：
   - `src/pet/main.ts:273` `const trust = createAuditedTrustLayer()`；
   - `src/pet/main.ts:283` `const aiLabel = installBubbleAiLabel(document)` —— 需要真实 `document`；
   - `src/pet/main.ts:291` / `:295` `readQuietHours()`、`location.search`；
   - `src/pet/main.ts:296` `__TAURI_INTERNALS__` 探测；
   - `src/pet/main.ts:319` `if (CONTENT_SHELL && typeof document !== 'undefined')` 立即改
     content-window 布局；
   - 文件底部 `src/pet/main.ts:3997`–`4010`：`void startContentWindowApp()` /
     `void startConsentApp()` —— import 即启动整个桌面程序。
3. **真实资源/宿主依赖**：Tauri IPC、WebView2、localStorage、真实 `pet.css` 布局；仓库没有
   jsdom/Playwright（MB-110 TODO）。

⇒ 任何“为了覆盖 main.ts 而 import 它”的方案都需要先改生产入口形态或引入 DOM harness，
两者都不是覆盖率任务本身能偷偷完成的；`scripts/coverage.ts` 因此把它**放进分母并显式记 0**，
而不是让它从报告里消失。

---

## 3. 生产可达性

- `pet.html:250` 的 module script 是主窗口入口；内容/设置窗口复用同一页面（`contentWindowMode()`
  在模块内分流），因此 main.ts 是生产真实执行路径，而不是死代码。
- `npm run build`（Vite）会把它打进 `dist/`；`npm run coverage:check` 不构建、不 import，
  所以 0% 不代表“未被使用”。
- 静态接线由 `tests/consent-static.test.ts` / `tests/trust-wiring-static.test.ts` 等源码断言
  覆盖；**源码断言 ≠ 行覆盖**。

---

## 4. 现有行为证据（不等于行覆盖）

- `tests/e11-main-data-chain.test.ts`：用 TypeScript AST 从 main.ts 抽取已发布的 save/load/exit
  声明，转译后对生产 `save-host.ts` / `save-runtime.ts` 执行行为矩阵（Q-P0-3）。这是当前最接近
  main.ts 行为的可执行测试，但只覆盖被抽取的数据链，不覆盖 boot/consent/TTS/menu 接线。
- `tests/save-host.test.ts`、`tests/e11-save-host-behavior.test.ts`、
  `tests/data-isolation-exit.test.ts` 覆盖 main.ts 依赖的落盘/隔离子路径。
- 结论：**不得因为全量测试通过就宣称 main.ts 的 boot 路径有行覆盖**；本轮保持 0% 如实。

---

## 5. 收敛路径（E10 / task-102）

`task-102`（exec-main-content-runtime）正在从 main.ts 抽 content/角色/设置窗口 runtime 到
可 import 模块。验收建议：

1. 新模块必须可被 Node 测试直接 import（无 CSS 副作用、无模块级 DOM），并加入
   `scripts/coverage-key-modules.json` 关键模块分母；
2. 落地后跑 `npm run coverage:baseline` 重设基线（不得手改阈值/删除关键模块）；
3. 剩余 main.ts 的 boot/consent/TTS/菜单接线继续保持文档化缺口，直到 MB-110 的 DOM harness
   或入口重构（CSS 迁到 HTML `<link>`、boot 副作用移入显式 `export async function boot()`）落地；
4. 覆盖率的权威记录以 `npm run coverage:check` + `artifacts/qa/coverage.json` 为准；
   docs/plan 的表格是快照，不代替机器产物。

---

## 6. required 门与入口豁免（task-136，2026-11-20 起）

- `scripts/coverage-key-modules.json` 的 `mode` 为 `"enforce"`：阈值或 ratchet 违规 exit 1。
  `scripts/ci.mjs` 的 `coverage:check` 是**必需步骤**（无 `advisory: true`），失败即
  `npm run ci` 失败；`release.yml` 仍不运行 `npm run ci`（把 release 接上 gate 属另一任务）。
- `main.ts` / `setup-page.ts` 列在该 config 的 `entryModules`：
  - 仍在 `keyModules` 分母里，仍以 `loaded:false / 0%` 写入 `artifacts/qa/coverage.json`；
  - 不参与 enforced loadedRatio / averageLines / per-file ratchet；
  - 豁免必须带 `why`；`tests/coverage-gate.test.ts` 断言它们仍在 keyModules、仍报 0%，
    且 config 不能把所有 key module 都豁免掉。
- 因此 **“required 绿”只代表 18 个可加载 key modules + 全量被加载文件达标**；
  **不代表 main.ts 有行覆盖**，不得据此宣称 boot 路径已被覆盖率覆盖。boot/数据链的行为证据是
  `tests/e11-main-boot.test.ts` 与 `tests/e11-main-data-chain.test.ts`（行为测试 ≠ 行覆盖）。
- 移除豁免的唯一路径是把入口重构成可 import 的模块（CSS 迁到 HTML `<link>`、boot 副作用移入
  显式 `export async function boot()`，即 MB-110 收敛路径）；**不得删模块或改数字来变绿**。

---

## 7. 证据命令

```bash
cd <private-path>
npm run coverage:check              # required（阈值/ratchet 违规 exit 1；entry 豁免见 §6）
node --import tsx --test tests/e11-main-data-chain.test.ts tests/e11-coverage-ci.test.ts
npm run docs:check
```

---

## 8. task-135 更新（2026-11-20，E11 MB-110 部分闭环）

> 本节只记录 task-135 做的入口重构与可执行证据；§1 的 4,011 行等数字是 `be69a71` 的历史快照，不代表当前值。

1. **boot 已可 import**：启动状态机/失败阻塞屏从 `src/pet/main.ts` 抽到 `src/pet/startup.ts`（334 行；无 CSS import、无模块级 DOM）。`main.ts` 只注入 live seams 并调用 `createStartupController(...).start()`；当前 `main.ts` 2,271 行（任务上限 ≤2,500）。失败屏 DOM/文案、D6 consent→boot 顺序、retry-by-stage 逻辑逐行迁移，行为不变。
2. **行为测试（fake DOM，direct import）**：`tests/e11-main-boot.test.ts` 11 例，直接 import 生产模块并执行真实状态机：consent→boot 顺序 / 未同意不 boot（无反开）、boot/init/consent 失败的阻塞屏 + reportFailure + stage 保留、retry 按 stage 恢复、in-flight retry 去重、content-shell 只 boot 内容面、失败屏自身渲染失败时的 visible fallback。
3. **减少源码断言**：`tests/p1-gates.test.ts` 的 `createStartupFailureScreen` 从 AST 抽取改为直接 import，原 main.ts 静态 boot 断言改为行为测试；`age-ui` / `consent-static` / `content-window` / `state-migrations` 中指向被迁移代码的文本断言改指向 `startup.ts`。**仍剩 34 个测试文件含 main.ts 源码读取**（MB-110 剩余，按模块逐步替换）。
4. **可复核证据（2026-11-20 本轮实测）**：
   - `npx tsc --noEmit` → exit 0；
   - `npm test` → 1,887/1,887 pass（含新 11 例），exit 0；
   - `npm run build` → exit 0；
   - `npm run coverage:check`（task-135 当时为 advisory）→ exit 0，`src/pet/startup.ts` lines **100%** / branches **82.76%** / functions **100%**；`main.ts` 仍为入口 0%；
   - `node scripts/gui-cdp-smoke.mjs` 在**重构后的 dist** 上真实 Chrome headless **5/5 PASS**（8.1s；首启 TOS→boot 作为前置、zero-button-menu、settings-zoom、content-window-760x560、role-one-click、save-quit），report: `artifacts/gui-smoke/mb110-boot/report.json`（`ok:true`、`pageDiagnostics:[]`）。
5. **未做/不得宣称**：`main.ts` 自身行覆盖仍 0%（Node 无 CSS loader + 模块级 DOM 的入口形态）；未引入 jsdom/Playwright；未把 CDP smoke 接入 CI；未 commit/push。零按钮、consent 门禁、安全路径均未改动。

---

## 9. task-136 更新（2026-11-20，required 门 + entry 豁免落地）

> 本节只记录覆盖率门升级的可执行证据；main.ts/setup-page.ts 仍为 0% 行覆盖，只是从
> “全量分母里被强制”改为“显式 entry 豁免、仍被测量”。

1. **config 升级**：`scripts/coverage-key-modules.json` → `mode: "enforce"`，新增
   `entryModules`（`src/pet/main.ts` / `src/pet/consent/setup-page.ts`，各带 `why`）。
   20 个关键模块 = **18 enforced + 2 entry-exempt**；`main.ts`/`setup-page.ts` 仍是
   `loaded:false / 0%`，仍写进 `artifacts/qa/coverage.json`，但不参与 enforced
   loadedRatio/averageLines 与 per-file ratchet。
2. **CI required**：`scripts/ci.mjs` 的 `coverage:check` 去掉 `advisory`；失败即
   `npm run ci` 失败。`.github/workflows/ci.yml` 仍 `if: always()` 上传
   `artifacts/qa/coverage.json` / `coverage.log`（required gate evidence）。
   `scripts/docs-check.mjs` 断言 `ci-coverage-required` + `ci-coverage-enforce-config`，
   防止退回 advisory 或删掉 entry 豁免的审计字段。
3. **基线真实重设**：`scripts/coverage-baseline.json`（commit `0a5bc0b`、dirty=`true`、
   `repeat: 2`）：all files **92.56 / 78.96 / 87.86**；key modules 18/20；
   **enforced 18/18 loaded、enforced average 90.06%**；entry 2 个仍记 0。
4. **可复核证据（2026-11-20 本任务实测）**：
   - `npm run coverage:check`（required）→ exit 0，status **ok**、0 warning；本任务实测
     1913–1927/对应 tests pass（并发任务持续追加用例）；all files 92.55–92.56 / 78.9–79.0 / 87.86；
     `main.ts` / `setup-page.ts` 仍 `NOT LOADED (0.00%) [entry-exempt, reported not enforced]`；
   - `npm run ci`（最终）→ **14/14 passed、0 advisory、0 skipped、99.5s**，coverage step 内嵌
     mode=enforce / status=ok / warnings=0，test step 1927/1927 pass；
   - `npm run docs:check` → PASS (27 checks)；`npx tsc --noEmit` → 0 error；
     coverage 自测 23/23 pass。
5. **不得宣称**：main.ts 行覆盖提升 / boot 路径已被覆盖率覆盖（行为测试见 §8，行为≠行覆盖）；
   “required 绿”只代表 18 个可加载 key modules + 全量被加载文件达标。未 commit/push；
   无 remote，未在 GitHub Actions 运行。


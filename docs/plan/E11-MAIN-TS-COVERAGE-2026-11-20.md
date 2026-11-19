# main.ts 覆盖率缺口与可达性说明（E11 / MB-110 / MB-111）

- 任务：task-104「覆盖率接入门禁（E11 MB-111）」的 main.ts 缺口文档部分。
- 基线 commit：`be69a71`（本文数字实测于该 commit 的工作树；本任务未 commit/push）。
- 相关：`docs/plan/COVERAGE-GATE-2026-11-20.md`（覆盖率脚本/基线/CI 接入）、
  `tests/e11-main-data-chain.test.ts`（AST 行为缝）。
- 结论：**`src/pet/main.ts` 的 0% 行覆盖是工具边界造成的真实事实，不是漏算**；
  CI 已接入 `coverage:check`（advisory，绝不阻断发布），main.ts 缺口按“补测试/拆分”
  两条路线记录，不在本任务里伪造行覆盖。

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

## 6. 不阻断发布

- `npm run ci` 的 `coverage:check` 步骤是 `advisory: true`：阈值/ratchet 触发时只记录 WARN，
  不改变门禁退出码；测试本身失败仍由前面的 `test` 步骤阻断。
- `.github/workflows/ci.yml` 只在 `always()` 上传 `artifacts/qa/coverage.json` /
  `coverage.log`，不新增 required check；`release.yml` 不运行 `npm run ci`，覆盖率不可能阻断发布。
- 升级为硬门（`mode: "enforce"` / `--enforce`）需按
  `docs/plan/COVERAGE-GATE-2026-11-20.md` §5 的路径另行决策。

---

## 7. 证据命令

```bash
cd /mnt/d/Projects/dsh/desktop-games
npm run coverage:check              # 记录 + advisory（不阻断）
node --import tsx --test tests/e11-main-data-chain.test.ts tests/e11-coverage-ci.test.ts
npm run docs:check
```

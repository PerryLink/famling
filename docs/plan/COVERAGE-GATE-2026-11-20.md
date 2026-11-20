# 覆盖率记录与质量门（E11 / MB-111）

- 任务：task-97「覆盖率/质量门（E11）」、task-104「CI 接入」、**task-136「覆盖率转强制」**；
  上游清单 MB-111（覆盖率口径/阈值），评审依据
  `docs/research/PROJECT-REVIEW-QA-2026-11-19.md` §2.2 与
  `docs/plan/REVIEW-TRIAGE-QUALITY-2026-11-19.md` QT-401。
- 当前定位（2026-11-20 task-136 起）：**required（阻断门）**。
  `scripts/coverage-key-modules.json` 的 `mode` 为 `enforce`：阈值或 ratchet
  回归 exit 1，`coverage:check` 在 `npm run ci` 中是普通必需步骤，失败即 gate 失败；
  测试失败始终 exit 1（见 §5、§11）。
- 唯一例外是**显式 `entryModules` 豁免**：`src/pet/main.ts` / `src/pet/consent/setup-page.ts`
  因 CSS side-effect import / 模块级 DOM boot 无法被 Node/tsx import。它们**仍被测量、仍按真实
  0% 报告**，只是不参与强制阈值与 per-file ratchet（见 §3、§5、§11）。**不得把模块从
  keyModules 删除或补数字来变绿**。
- 历史：task-97 首版“只记录不阻断”；task-104 把 `coverage:check` 以 `advisory: true` 接入
  `npm run ci`；task-136 升级为 required（基线在 HEAD `0a5bc0b` + 在途改动的工作树上重设）。
- 非目标：不追覆盖率百分比、不做 mutation/property-based testing、不改业务代码、不替代
  `npm run ci`。

---

## 1. 为什么需要这个脚本

Node 内置 `--experimental-test-coverage`（零依赖）只报告**被测试加载过**的文件。
评审实测：`src/pet/main.ts`、`src/pet/consent/setup-page.ts`、`src/pet/shell-layout.ts`、
`src/voice/system.ts` 等 11 个文件（4,318 行）从未出现在覆盖率表里；按“未加载=0”计入后
项目级行覆盖只有“八成出头”。直接看 91% 会误判为质量良好。

`scripts/coverage.ts` 的做法：

1. 跑一次真实测试（`node --import tsx --experimental-test-coverage --test tests/*.test.ts`）；
2. 解析 Node 的覆盖率表格为 JSON（`src/**/*.ts` 为分母）；
3. 把 `scripts/coverage-key-modules.json` 里的 20 个关键模块**强制并入分母**：未被测试加载的
   模块显式记为 `loaded:false / 0%`，而不是从报告里消失；
4. 与 `scripts/coverage-baseline.json` 做 ratchet 比较，并检查阈值；
5. 写 `artifacts/qa/coverage.json`（机器可读，git-ignored）与 `artifacts/qa/coverage.log`。

---

## 2. 交付物

| 文件 | 作用 |
| --- | --- |
| `scripts/coverage.ts` | 覆盖率运行 + 解析 + 关键模块并入 + entry 豁免 + 基线/阈值比较（required 语义）+ 基线生成；纯 Node 内置依赖 |
| `scripts/coverage-key-modules.json` | 关键模块清单（20 个=18 enforced + 2 `entryModules` 豁免）+ 阈值 + tolerance + `mode: enforce` |
| `scripts/coverage-baseline.json` | 已提交基线快照（全部被加载文件 + 20 个关键模块 + enforced 指标 + 运行事实） |
| `tests/coverage-gate.test.ts` | 质量门自测：表格解析、关键模块分母、entry 豁免不可隐藏模块、enforced 阈值/ratchet、配置/基线一致性 |
| `tests/e11-coverage-gaps.test.ts` | task-97 补的缺口行为测试：shell-layout / hit-regions / voice-system 等 |
| `package.json` | `test:coverage` / `coverage:check` / `coverage:baseline` 三个 npm script |
| `scripts/ci.mjs` | `coverage:check` 是 canonical gate 的**必需步骤**（task-136 起无 `advisory`；失败即 gate 失败） |
| `.github/workflows/ci.yml` | gate job 用 `if: always()` 归档 required gate 的 `artifacts/qa/coverage.json` / `coverage.log`（失败也留证据） |
| `scripts/docs-check.mjs` | 硬检查：CI 必须含 required `coverage:check`（不得退回 advisory）、config 必须 `mode: enforce` 且 entry 豁免合法、必须上传 coverage 记录 |
| `tests/e11-coverage-ci.test.ts` | CI 接线自测：步骤顺序 / required 语义 / artifact 上传 / docs-check 断言 / `DG_GIT_*` facts / main.ts 缺口文档 |
| `docs/plan/E11-MAIN-TS-COVERAGE-2026-11-20.md` | main.ts 可达性/0% 覆盖缺口专文（记录 entry 豁免，不伪造行覆盖） |

### 命令

```bash
npm run test:coverage      # 记录 + required gate 比较（阈值/ratchet 违规 exit 1）
npm run coverage:check     # 同上，显式“质量门”语义（required）
npm run coverage:baseline  # 重新生成基线（默认连跑 2 次取每个文件最小值）
```

```bash
# 只解析已保存的覆盖率日志（调试/离线；不跑测试）
node --import tsx scripts/coverage.ts --from-log artifacts/qa/coverage.log
```

退出码：`0` = required gate 通过；`1` = 测试失败或阈值/ratchet 违规（config `mode: enforce`
或显式 `--enforce`）；`2` = 参数/解析/IO 错误。required 模式下**缺失基线也是阻断项**：
没有基线就无法验证 ratchet，不能假装通过。

---

## 3. 关键模块分母（20）

`scripts/coverage-key-modules.json` 的选型标准：评审点名的“未加载/低覆盖但高风险”模块 +
E10/E4/E8 的核心数据链。全部路径由 `tests/coverage-gate.test.ts` 断言存在且不重复。

| 关键模块 | why |
| --- | --- |
| `src/pet/main.ts` | 桌面组合根：启动/同意/读档/存档/TTS/hero/菜单 |
| `src/pet/consent/setup-page.ts` | setup.html 法务声明页（永不被测试 import） |
| `src/pet/consent/runtime.ts` | 浏览器同意运行时单例（gate/store/modal/健康提醒接线） |
| `src/pet/consent/modal.ts` | TOS/TTS/年龄/健康弹窗（键盘陷阱、Escape 不算同意） |
| `src/pet/consent/gate.ts` | 内容/TTS/roleplay/麦克风同意判定 |
| `src/pet/safety/gate.ts` | 内容安全门（清洗 + 本地规则 + fail-closed 远端策略） |
| `src/pet/save-runtime.ts` | E10/MB-012 抽出的存档运行时 |
| `src/pet/content-hub.ts` | 内容中心/角色包导入/市场 UI 编排 |
| `src/pet/content-market.ts` | 远端市场传输、签名目录、防回滚 |
| `src/pet/content-library.ts` | 角色/主题/语音/对话目录与签名载荷 |
| `src/pet/character-packs.ts` | 角色包安装/启用/回滚运行时 |
| `src/pet/desktop-shell.ts` | 桌面壳菜单/设置入口 |
| `src/pet/shell-layout.ts` | 气泡/⋯ 菜单跟随宠物定位 |
| `src/pet/hit-regions.ts` | 透明窗点击穿透 hit regions（反复实机修的功能） |
| `src/pet/content-window.ts` | 独立内容/设置窗口运行时 |
| `src/pet/hero-runtime.ts` | hero 渲染器运行时（角色包/动画/互动区） |
| `src/pet/health-reminder.ts` | 健康提醒节奏/claim |
| `src/pet/low-disturb.ts` | 静音时段/柔和文案 helper |
| `src/pet/scaling.ts` | 全局/组件缩放 clamp 与标签 |
| `src/voice/system.ts` | 浏览器/WebView2 SpeechSynthesis 最后一步 |

**20 = 18 enforced + 2 entry-exempt**：`src/pet/main.ts` 与
`src/pet/consent/setup-page.ts` 列在 config 的 `entryModules`（带 `why`）。它们仍在
`keyModules` 分母里、仍出现在 `artifacts/qa/coverage.json`（`loaded:false` / 0%），只是
不参与 enforced loadedRatio / averageLines / per-file ratchet。豁免是白名单式的：
`tests/coverage-gate.test.ts` 断言 (a) 豁免路径必须仍是 key module，(b) 该模块仍被报告为 0%，
(c) config 不得把所有 key module 都豁免掉，(d) 若某个 entry 模块后来真的被测试加载，比较器会报
`is declared entry-exempt but is now loaded` 的 threshold 失败——豁免必须随可 import 状态更新，
不能永久保留。

---

## 4. 已提交基线（task-136 实测重设）

运行事实（`scripts/coverage-baseline.json`，`generatedAt=2026-11-20T05:15:52Z`）：

- node `v24.22.1`，platform `linux`（与 CI 的 ubuntu-latest 一致），commit `0a5bc0b`，
  dirty=`true`（共享工作树 = HEAD `0a5bc0b` + 在途 startup/E2E/reclass 改动；基线只记录
  `src/**/*.ts` 的真实测量值，未夹带手工数字）。
- 命令：`COVERAGE_BASELINE_REGEN=1 npm run coverage:baseline`（默认 `--repeat 2`，逐文件取
  最小值）。`COVERAGE_BASELINE_REGEN=1` 只用于**一次性结构升级**：旧基线还没有
  `entryModules/enforced*` 字段时，baseline 自检会让“重设基线”的那次 run 变红；该变量只跳过
  这一条自检，重设后必须立刻用普通 `npm run coverage:check` 复核（本次已做，见 §11）。
- 测试：**1895 tests / 1894 pass / 0 fail / 1 skipped**（那 1 skipped 就是上述一次性自检；
  正常 run 无 skip 时测试总数相同，不含该 skip）。
- 全集（被加载的 `src/**/*.ts`）：**lines 92.56% / branches 78.96% / functions 87.86%**。
- 关键模块：**18/20 loaded**；average lines **81.06%**（20 个全算、未加载按 0）；loaded-only
  **90.06%**；**enforced 18/18 loaded、enforced average 90.06%**（2 个 entry 豁免不计入强制）。

| 关键模块 | lines | branches | funcs | 强制 |
| --- | ---: | ---: | ---: | --- |
| `src/pet/main.ts` | **未加载 0** | — | — | **entry 豁免** |
| `src/pet/consent/setup-page.ts` | **未加载 0** | — | — | **entry 豁免** |
| `src/pet/consent/runtime.ts` | 16.93 | 100.00 | 2.00 | enforced |
| `src/pet/consent/modal.ts` | 47.83 | 75.00 | 62.50 | enforced |
| `src/pet/consent/gate.ts` | 98.95 | 88.78 | 90.00 | enforced |
| `src/pet/safety/gate.ts` | 94.83 | 91.16 | 100.00 | enforced |
| `src/pet/save-runtime.ts` | 98.95 | 87.79 | 81.25 | enforced |
| `src/pet/content-hub.ts` | 98.97 | 89.04 | 92.31 | enforced |
| `src/pet/content-market.ts` | 94.21 | 70.13 | 90.48 | enforced |
| `src/pet/content-library.ts` | 95.00 | 79.94 | 98.40 | enforced |
| `src/pet/character-packs.ts` | 93.79 | 73.46 | 97.18 | enforced |
| `src/pet/desktop-shell.ts` | 96.53 | 76.33 | 79.10 | enforced |
| `src/pet/shell-layout.ts` | 99.64 | 79.17 | 100.00 | enforced |
| `src/pet/hit-regions.ts` | 96.96 | 85.14 | 63.64 | enforced |
| `src/pet/content-window.ts` | 93.93 | 72.55 | 66.67 | enforced |
| `src/pet/hero-runtime.ts` | 96.34 | 77.01 | 86.67 | enforced |
| `src/pet/health-reminder.ts` | 99.40 | 79.21 | 88.24 | enforced |
| `src/pet/low-disturb.ts` | 98.85 | 89.29 | 100.00 | enforced |
| `src/pet/scaling.ts` | 100.00 | 87.80 | 100.00 | enforced |
| `src/voice/system.ts` | 100.00 | 100.00 | 100.00 | enforced |

**读法**：`main.ts` / `setup-page.ts` 的 0 是真实事实（测试未 import），不是脚本漏算；
它们是**显式 entry 豁免**，不是“已覆盖”。`consent/runtime.ts`（16.93%）、
`consent/modal.ts`（47.83%）、`content-window.ts`（93.93%）仍是低覆盖加载模块的补测候选。

上一版基线（task-104：commit `be69a71`、1529 tests、all files 92.27/79.03/88.33）已被本基线
取代：task-135 把 boot 抽到 `src/pet/startup.ts`、HEAD 期间的内容/市场/动画/test 重构改变了
加载面，旧基线与新工作树的 per-file 数字不再可比（例如 `content-assets.ts` functions 的
基线差会立刻触发 WARN/FAIL）。故在 task-136 一次性重设；历史数字见 git history。
此后任何有意的覆盖率变化都应按 §5 重设基线。

---

## 5. 阈值 / ratchet / required 语义

- `scripts/coverage-key-modules.json`：
  - `thresholds.allFiles`：lines 90 / branches 77 / functions 86（低于基线约 2pp，避免阈值噪声）；
  - `thresholds.keyModules`：loadedRatio 0.8、averageLines 65，**只对 enforced key modules 计算**
    （当前 18/18 enforced loaded、enforced average ≈90）；
  - `tolerance`：lines 3.5 / branches 8 / functions 3（解释见下）；
  - `mode: "enforce"`（task-136 起）；`entryModules` 只包含两个不可 import 的页面入口。
- 默认 `npm run test:coverage` / `coverage:check`：阈值或 per-file ratchet 回归 → 打印
  `FAIL ...` 并 exit 1；测试失败始终 exit 1。`--enforce` 仍可用于对单个 run 强制阻断
  （config 已是 enforce 时无额外作用）；**没有“跳过 gate”的 CLI**。
- **required 的边界**：强制的是 (a) `allFiles` 阈值（只统计被加载文件）、(b) 18 个可加载
  key modules 的 loadedRatio / averageLines、(c) 基线里每个已加载文件的 per-file ratchet。
  `main.ts` / `setup-page.ts` 的 0% **不参与强制**（否则永远没法 required），但它们仍被测量、
  仍出现在 artifact/report 中，任何“它们已覆盖”的说法都是伪造。**豁免不是永久的**：若 entry
  模块被测试加载，比较器会把它当 threshold 失败，要求移除豁免并开始强制。
- **为什么 tolerance 较宽**：测试文件并行运行，`tests/dlc-import-safety.test.ts` 会临时
  写入/删除 `public/characters/<临时 id>`，而 `tests/fci-v03.test.ts` 会枚举
  `public/characters/*`。两者偶尔交错，导致 `src/pet/scene/validate.ts` 的错误分支
  行覆盖在 89.84–92.97 间波动（task-97 实测 3 次：92.97 / 89.84 / 92.97）。这是测试隔离
  已知缺陷，不是业务波动；宽容差 + `coverage:baseline` 默认跑 2 次取每文件最小值，
  让 ratchet 只抓真实下降。修测试隔离需另立任务，不在本任务范围。
- 基线重生成：`npm run coverage:baseline`（默认 `--repeat 2`，对每个文件的
  lines/branches/functions 分别取多次运行的最小值，记录在 `generatedFrom.repeat`；
  单次运行不写 repeat 字段）。**required 模式下缺失基线 = 阻断**：没有基线无法验证 ratchet。
- **CI 接入（task-136，2026-11-20 起 required）**：`node --import tsx scripts/coverage.ts --check`
  是 `scripts/ci.mjs` 的 `coverage:check` 必需步骤（放在 `test` 之后），**没有
  `advisory: true`**；它 exit 1 就让 `npm run ci` 失败。`.github/workflows/ci.yml` 在 gate job
  用 `if: always()` 上传 `artifacts/qa/coverage.json` 与 `coverage.log`（artifact 名
  `coverage-<os>`），失败时也归档证据。`scripts/docs-check.mjs` 硬检查三件事：CI 必须含
  required `coverage:check`（不得退回 advisory）、config 必须 `mode: enforce` 且 entry 豁免
  合法、ci.yml 必须上传 coverage 记录。
- **release.yml 仍不运行 `npm run ci`**：required gate 阻断的是 canonical gate/合并路径，
  不是发布流水线；把 release 也接上 gate 属另一任务。**无 remote 的事实不变**：`ci.yml`
  仍未在 GitHub 上真实运行过，不得宣称 CI 全绿。

---

## 6. task-97 补的缺口测试（MB-111 历史记录）

新增 `tests/e11-coverage-gaps.test.ts`（20 例，纯注入 DOM/窗口，无 jsdom、无新依赖）：

| 模块 | 之前 | 之后（本次实测） | 覆盖内容 |
| --- | --- | --- | --- |
| `src/pet/shell-layout.ts` | 未加载（0） | lines 99.20 / branches 86.11 / funcs 100 | 气泡/trigger 定位、折行 clamp、缩放 0.25–2.5、非 desktop/无 DOM no-op、resize 重排 |
| `src/pet/hit-regions.ts` | lines 56.96 / funcs 33.33 | lines 96.96 / funcs 63.64 | DOM rect clamp/去重、全屏弹窗、alpha tile 缓存/flip/GPU 回读失败兜底、无 canvas、环境 document 默认值 |
| `src/voice/system.ts` | 未加载（0） | lines 100 / branches 100 / funcs 100 | 无 speechSynthesis 拒绝、情绪 rate/pitch 映射、duration 下限、stop cancel |
| `src/shell/window.ts`、`src/shell/fullscreen.ts` | 未加载（0） | 非 Tauri no-op 路径 | 窗口控制与 fullscreen watcher 的守卫与清理 |

新增 `tests/coverage-gate.test.ts`（10 例）：覆盖率表格树解析、无报告/空报告报错、关键模块
未加载按 0 计入、ratchet 阈值/回归/测试失败判定、缺基线降级、`--repeat` 最小值合并、
配置/基线一致性（关键模块存在、基线满足自身阈值、分母一致）。

同一命令全量实测：补测试前 all files **92.03 / 79.01 / 88.18**（1416 tests）；本任务的
缺口测试落地后 **92.21 / 79.10 / 88.26**（1445 tests，+29 tests，0 fail）；同批
task-94/95/96（save-host 接线、content-hub 拆分、插件 quiet-hours）并入工作树后
**92.44 / 79.33 / 88.38**（1486 tests，1486 pass，0 fail，0 skipped）。

**附带修复（跨任务集成）**：task-95 把插件 quiet-hours 与 `quiet` 模式合并到同一条
ambient gate 后，`tests/parity-contract.test.ts` 里冻结的整串表达式
`source === 'ambient' && dialogueMode === 'quiet'` 失效，成为全量套件唯一红项。按该测试
“断言语义而非源码形状”的原意，把断言放宽为包含 `dialogueMode === 'quiet'`（语义仍被锁定：
quiet 模式压制自动 ambient 行）。只改测试断言，未改插件/业务代码。

---

## 7. 未闭环与边界

1. **`main.ts` / `setup-page.ts` 仍是 0% 行覆盖**：本脚本把它们放进分母并显式记 0，
   task-136 起它们同时是 config `entryModules` 的**显式豁免**（不参与强制阈值/ratchet，
   但仍被测量、仍报 0%）。`tests/e11-main-boot.test.ts` / `tests/e11-main-data-chain.test.ts`
   的“行为覆盖”**不等于**行覆盖，不得据此声称 main.ts 已被覆盖率覆盖。真正的提升依赖
   E10/MB-110 把入口重构成可 import 模块。
2. **无 jsdom/Playwright**：DOM 页面（consent/runtime、modal、setup-page、main.ts）仍只能
   通过注入最小 DOM 或源码断言测；覆盖率会长期偏低，属于工具缺失而不是测试偷懒。
3. **基线绑定的源码状态**：基线记录在 `generatedFrom`（commit `0a5bc0b`、dirty=`true`、
   platform linux、当前共享工作树的在途改动）——此后任何有意的覆盖率变化都应先确认
   **落在真实测量上**，再 `npm run coverage:baseline` 重设基线；不要直接删阈值/key module，
   也不要把 0% 手改成通过值。
4. **已接入 `npm run ci` / CI artifact（required）**：见 §5；真实 GitHub Actions 仍无 remote、
   未运行，不得宣称 CI 全绿。
5. **本任务未改业务代码**、未 commit/push；`tests/` 之外未动 src。
6. **跨任务测试断言修复**：见 §6 末段（`tests/parity-contract.test.ts` 一行，语义保持）。

---

## 8. 复跑命令（证据）

```bash
cd /mnt/d/Projects/dsh/desktop-games
npm run ci                                          # canonical gate；coverage:check 是 required 步骤
npm run coverage:check                              # 单独跑 required 覆盖率门
npm run coverage:baseline                           # 重生成基线（默认 repeat 2）
# 仅当旧基线结构过期、baseline 自检会让重设 run 变红时：
COVERAGE_BASELINE_REGEN=1 npm run coverage:baseline
node --import tsx --test tests/coverage-gate.test.ts tests/e11-coverage-ci.test.ts
npm run typecheck
npm run docs:check
```

**task-97 落地时实测**（2026-11-20 01:52–01:55，共享工作树）：
`coverage:check` 1486 tests / 1486 pass / 0 fail；all files **92.44 / 79.33 / 88.38**；
关键模块 18/20 loaded、average lines 80.04%；两个新测试文件 30/30 pass；
`tsc --noEmit` 0 error；`vite build` exit 0；`docs-check` PASS（25 checks）；
全量 `node --import tsx --test 'tests/*.test.ts'` 1486/1486 pass。

**task-104（CI 接入 + 基线重设 + main.ts 缺口文档）实测**：见 §10。

---

## 9. main.ts 可达性/覆盖率缺口（task-104 历史；task-136 起为 entry 豁免）

专文：`docs/plan/E11-MAIN-TS-COVERAGE-2026-11-20.md`。要点：

- `src/pet/main.ts`（HEAD `be69a71`，4,011 行 / 52 个顶层 import）0% 行覆盖是真实事实：
  `import './pet.css'`（第 217 行）在 Node/tsx 下无法解析；模块级 `document`/`window`/Tauri
  副作用（第 273/283/295/296/319 行）与文件底部 boot（第 3997–4010 行）意味着“import 即启动
  桌面程序”，不能当普通测试模块加载。
- 生产可达性由 `pet.html:250` 的 module script + Vite build 保证；本轮**不伪造行覆盖**，覆盖率
  脚本继续把它放进分母并显式记 0。
- 现有可执行行为证据是 `tests/e11-main-data-chain.test.ts` 的 AST 抽取声明（Q-P0-3）；它覆盖
  save/load/exit 数据链行为，**不覆盖** boot/consent/TTS/menu 接线，源码断言也≠行覆盖。
- 收敛路径：task-102（E10）抽出的可 import 模块加入关键模块分母并重设基线；main.ts 剩余
  boot 接线保持文档化缺口，直到 MB-110 的 DOM harness 或入口重构（CSS 迁 HTML、boot 副作用
  移入显式函数）落地。

---

## 10. task-104 CI 接入复跑（2026-11-20，历史记录；advisory 语义已被 task-136 取代）

见下节实测记录；命令：

```bash
npm run ci                  # canonical gate；coverage:check 是 advisory 步骤
npm run coverage:check      # 单独记录 + advisory
python3 -c "import json; d=json.load(open('artifacts/qa/coverage.json')); print(d['status'], d['allFiles'], d['keyModules']['loaded'])"
```

本任务在**干净导出**（`git archive HEAD` = `be69a71` + 本任务补丁，无其他任务在途改动）中实测；
共享工作树当时有其他任务未提交的 `src/` 改动，不用于验收数字。

- `npm run ci`（canonical gate，含新 advisory 步骤）：**14/14 steps pass，0 advisory，0 skipped，
  105.7 s**；`typecheck` 13.3s、`build` 13.9s、`test` 31.2s（1529 tests / 1523 pass / 0 fail /
  6 skipped）、`coverage:check` 36.2s、`docs:check` 27/27、`evidence:self-test` pass。
  - 环境：node v24.22.1 / linux x64。导出无 `.git`，通过 `DG_GIT_COMMIT / DG_GIT_PARENT /
    DG_GIT_BRANCH / DG_GIT_REMOTE='' / DG_GIT_DIRTY=false` 走 clean-checkout 契约
    （task-104 让 `coverage.ts` 也遵守该契约，记录的真实 commit 为 `be69a71`）。
  - CI 里 coverage 步骤 exit 0（status=ok、0 warning），所以本次 0 advisory；advisory 语义由
    `tests/e11-coverage-ci.test.ts`（`classifyStepResult` + `--list`）与 `docs-check` 的
    `ci-coverage-advisory` 检查锁定：阈值/ratchet 触发时该步骤只会记为 `advisory`，
    **不改变 `npm run ci` 退出码**。
  - `artifacts/qa/ci-summary.json` 的 `coverage:check` step 内嵌 coverage 摘要（commit
    `be69a71`、all files 92.30/79.08/88.33、key modules 18/20、average lines 79.76、warnings 0）。
- `npm run coverage:check`（干净导出 + 新基线）：status **ok**，all files
  **92.28 / 79.03 / 88.33**，key modules 18/20、average lines 79.76%、0 issues；
  `artifacts/qa/coverage.json` 记录 commit `be69a71`。
- 基线重设：`--update-baseline --repeat 2` → `scripts/coverage-baseline.json`（172 files /
  20 key modules；all files **92.27 / 79.03 / 88.33**；`repeat: 2`；commit `be69a71`；
  dirty=true，因为生成时含本任务未提交脚本/测试/文档改动，`src/` 与 HEAD 一致）。
- 全量测试（干净导出、无 `dist/`）：1529 tests / 1520 pass / 0 fail / 9 skipped；带 build 的
  canonical gate 里为 6 skipped（其余按设计执行）。
- `npm run typecheck` 0 error；`npm run build` exit 0；`npm run docs:check` PASS（27 checks）。
- 新增 `tests/e11-coverage-ci.test.ts`（8 例）：CI 步骤位置/参数、advisory 分类、`--list`、
  coverage 摘要裁剪、config 仍 advisory、ci.yml 归档与 action pin、`DG_GIT_*` facts、
  main.ts 缺口文档存在性。
- **未在 GitHub Actions 上真实运行**（仓库仍无 remote），不得宣称 CI 全绿；以上是本地
  canonical gate 的真实执行结果。
- ⚠️ 本节是 **task-104 当时的 advisory 历史**：task-136 已把该步骤升级为 required、把 config
  改为 `mode: enforce`，并反转 `docs-check` 断言；当前语义以 §5/§11 为准。

---

## 11. task-136 覆盖率转强制（2026-11-20）

> 本节所有数字来自**真实运行**：`npm run coverage:check` / `npm run ci` / 基线文件本身；
> 数字以 `artifacts/qa/coverage.json` 与 `scripts/coverage-baseline.json` 为准。本任务
> **未 commit/push**。

### 11.1 改动

- **config**：`scripts/coverage-key-modules.json` → `mode: "enforce"`；新增 `entryModules`
  （`main.ts` / `setup-page.ts`，各带 `why`）。20 个关键模块 = **18 enforced + 2 entry-exempt**。
- **脚本**：`scripts/coverage.ts` 增加 entry 豁免的 enforce 语义：
  - enforced loadedRatio / averageLines 只算 18 个可加载模块；
  - per-file ratchet 跳过 entry 路径，但 entry 仍逐文件报 0%；
  - required 模式下**缺基线 = 阻断**（无法验证 ratchet）；
  - 自测保证：entry 必须是 key module、必须仍报 0%、不能把所有模块都豁免。
- **canonical gate**：`scripts/ci.mjs` 去掉 `coverage:check` 的 `advisory: true`，
  label 改为 required；失败即 `npm run ci` 失败。
- **CI 工作流**：`.github/workflows/ci.yml` 的 coverage artifact step 更名
  `Upload coverage record (required gate evidence)`，仍 `if: always()` 归档
  `artifacts/qa/coverage.json` / `coverage.log`（失败也有证据）。
- **truth gate**：`scripts/docs-check.mjs` 的 `ci-coverage-advisory` 反转为
  `ci-coverage-required`，并新增 `ci-coverage-enforce-config`（config 必须 enforce、
  entry 豁免必须是 key module 且带 why）；老断言 `ci-coverage-advisory` 删除。
- **测试**：`tests/coverage-gate.test.ts` 新增/更新 entry 豁免、enforced 阈值、ratchet、
  `loadConfig` 拒绝非法豁免、config/baseline 一致性断言；`tests/e11-coverage-ci.test.ts`
  更新 required step / classify / config / workflow / docs 断言。
- **基线**：`scripts/coverage-baseline.json` 真实重设（见 §4），新增
  `entryModules/enforcedTotal/enforcedLoaded/enforcedNotLoaded/enforcedAverageLines` 字段。

### 11.2 真实证据（2026-11-20 本任务实测；工作树 = HEAD `0a5bc0b` + 在途改动）

- 基线重设：`COVERAGE_BASELINE_REGEN=1 npm run coverage:baseline`（默认 2 runs）→
  **1895 tests / 1894 pass / 0 fail / 1 skipped**（唯一 skip 是 baseline 自检的一次性 regen
  hatch，见 §4）；写回 `scripts/coverage-baseline.json`：commit `0a5bc0b`、dirty=`true`、
  `repeat: 2`、all files **92.56 / 78.96 / 87.86**、key modules 18/20、
  **enforced 18/18、enforced average 90.06**。
- required 门（普通 run，无 regen hatch）：`npm run coverage:check` → exit 0，
  status **ok**、mode **enforce**、**0 warning**；`src` 覆盖 all files
  **92.56 / 78.97 / 87.86**；key modules 18/20、**enforced 18/18、enforced average 90.06**；
  2 个 entry 仍逐行打印 `NOT LOADED (0.00%) [entry-exempt, reported not enforced]`。
  测试数随并发任务并入用例从 1895（基线时）→1903→1913→1927 增长，这不是覆盖率数字被改动；
  `src` 覆盖保持稳定（本轮各次 92.55–92.56 / 78.9–79.0 / 87.86）。
- canonical gate（最终，2026-11-20）：`npm run ci -- --summary-out artifacts/qa/ci-summary.json` →
  **14/14 passed、0 advisory、0 skipped、99.5 s**；`artifacts/qa/ci-summary.json` 的
  `coverage:check` step 内嵌 `mode=enforce`、`status=ok`、commit `0a5bc0b`、
  allFiles **92.55 / 78.93 / 87.86**、key modules 18/20、average 81.05 / loaded-only 90.06、
  **warnings=0**（required 步骤通过而不是被记为 advisory）；同一 run 的 `test` step 为
  **1927/1927 pass**。注：中途有一次失败在 `build` 阶段（`dist/legal/* missing`），原因是
  并发任务同时跑 Vite build 清空共享 `dist`，不是 gate 逻辑失败；隔离后重跑即 14/14 绿。
- `npm run docs:check` → **PASS (27 checks)**，含新的 `ci-coverage-required` 与
  `ci-coverage-enforce-config`；`node --import tsx --test tests/coverage-gate.test.ts
  tests/e11-coverage-ci.test.ts` → **23/23 pass**；`npx tsc --noEmit` → 0 error；
  `npm test` → **1903/1903 pass**。
- **不伪造的机器证据**：`artifacts/qa/coverage.json` 与基线里 `main.ts` /
  `setup-page.ts` 仍是 `loaded:false / lines 0`；日志明确 `18/18 enforced loaded`；
  `tests/coverage-gate.test.ts` 断言 entry 仍被测量且不能通过删模块/补数字消掉。
- **未 commit/push**；仓库仍无 remote，`ci.yml` 未在 GitHub Actions 真实运行过，
  不得宣称 CI 全绿——以上是本地 canonical gate 的真实执行结果。

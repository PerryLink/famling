# 覆盖率记录与质量门（E11 / MB-111）

- 任务：task-97「覆盖率/质量门（E11）」；上游清单 MB-111（覆盖率口径/阈值），评审依据
  `docs/research/PROJECT-REVIEW-QA-2026-11-19.md` §2.2 与
  `docs/plan/REVIEW-TRIAGE-QUALITY-2026-11-19.md` QT-401。
- 基线 commit：`47aeea3`（基线与本文数字生成时，工作树除本任务新增文件/文档外无 src 改动）。
- 定位：**第一迭代只记录、不阻断**。阈值与 ratchet 默认 advisory；测试失败仍然退出 1。
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
| `scripts/coverage.ts` | 覆盖率运行 + 解析 + 关键模块并入 + 基线/阈值比较 + 基线生成；纯 Node 内置依赖 |
| `scripts/coverage-key-modules.json` | 关键模块清单（20 个）+ 阈值 + tolerance + `mode: advisory` |
| `scripts/coverage-baseline.json` | 已提交基线快照（168 个被加载文件 + 20 个关键模块 + 运行事实） |
| `tests/coverage-gate.test.ts` | 质量门自测：表格解析、关键模块分母、ratchet、配置/基线一致性 |
| `tests/e11-coverage-gaps.test.ts` | 本次补的缺口行为测试：shell-layout / hit-regions / voice-system 等 |
| `package.json` | `test:coverage` / `coverage:check` / `coverage:baseline` 三个 npm script |

### 命令

```bash
npm run test:coverage      # 记录 + advisory 比较（默认，不阻断）
npm run coverage:check     # 同上，显式“质量门”语义；加 -- --enforce 才阻断
npm run coverage:baseline  # 重新生成基线（默认连跑 2 次取每个文件最小值）
```

```bash
# 只解析已保存的覆盖率日志（调试/离线；不跑测试）
node --import tsx scripts/coverage.ts --from-log artifacts/qa/coverage.log
```

退出码：`0` = 记录/advisory 通过；`1` = 测试失败或 `--enforce` 下违规；`2` = 参数/解析/IO 错误。

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

---

## 4. 已提交基线（实测）

运行事实（`scripts/coverage-baseline.json`）：

- node `v24.22.1`，platform `linux`（与 CI 一致；基线生成时共享工作树 `node_modules` 为
  Linux 平台包），commit `47aeea3`，dirty=`true`（工作树含同批 task-94/95/96/97 的未提交改动；
  基线文件与本批改动一起提交）。
- 命令：`node --import tsx scripts/coverage.ts --update-baseline --repeat 2`（连跑 2 次，逐文件取最小值）。
- 测试：**1486 tests / 1486 pass / 0 fail / 0 skipped**（单次 Node duration 28.3 s；共享工作树下
  并发负载会拉长墙钟，数字随机器负载略动）。
- 全集（173 个被加载的 `src/**/*.ts`）：**lines 92.44% / branches 79.33% / functions 88.38%**。
- 关键模块：**18/20 loaded**；average lines **80.04%**（未加载按 0 计）；loaded-only **88.93%**。

| 关键模块 | lines | branches | funcs |
| --- | ---: | ---: | ---: |
| `src/pet/main.ts` | **未加载 0** | — | — |
| `src/pet/consent/setup-page.ts` | **未加载 0** | — | — |
| `src/pet/consent/runtime.ts` | 16.93 | 100.00 | 2.00 |
| `src/pet/consent/modal.ts` | 47.83 | 75.00 | 62.50 |
| `src/pet/content-window.ts` | 80.71 | 78.95 | 66.67 |
| `src/pet/character-packs.ts` | 92.16 | 66.02 | 92.96 |
| `src/pet/content-market.ts` | 93.91 | 70.30 | 91.18 |
| `src/pet/content-library.ts` | 94.74 | 78.29 | 98.31 |
| `src/pet/safety/gate.ts` | 94.83 | 91.16 | 100.00 |
| `src/pet/desktop-shell.ts` | 95.36 | 75.88 | 74.75 |
| `src/pet/hero-runtime.ts` | 95.68 | 76.92 | 86.67 |
| `src/pet/content-hub.ts` | 96.34 | 65.27 | 89.39 |
| `src/pet/hit-regions.ts` | 96.96 | 85.14 | 63.64 |
| `src/pet/low-disturb.ts` | 98.85 | 89.29 | 100.00 |
| `src/pet/save-runtime.ts` | 98.95 | 87.79 | 81.25 |
| `src/pet/consent/gate.ts` | 98.95 | 88.78 | 90.00 |
| `src/pet/shell-layout.ts` | 99.20 | 86.11 | 100.00 |
| `src/pet/health-reminder.ts` | 99.40 | 79.21 | 88.24 |
| `src/pet/scaling.ts` | 100.00 | 87.65 | 100.00 |
| `src/voice/system.ts` | 100.00 | 100.00 | 100.00 |

**读法**：`main.ts` / `setup-page.ts` 的 0 是真实事实（测试未 import），不是脚本漏算；
按行数加权它们仍是最大缺口。`consent/runtime.ts`（16.93%）、`consent/modal.ts`（47.83%）、
`content-window.ts`（80.71%）是接下来最值得补行为测试的加载模块。

---

## 5. 阈值 / ratchet / advisory 语义

- `scripts/coverage-key-modules.json`：
  - `thresholds.allFiles`：lines 90 / branches 77 / functions 86（低于基线约 2pp，首轮“不过高”）；
  - `thresholds.keyModules`：loadedRatio 0.8（当前 0.9）、averageLines 65（当前 80.04）；
  - `tolerance`：lines 3.5 / branches 8 / functions 3（解释见下）；
  - `mode: "advisory"`。
- 默认 `npm run test:coverage` / `coverage:check`：任何阈值/回归只打印 `WARN ...`，退出 0。
  `--enforce`（或把 config 改成 `mode: "enforce"`）才退出 1；测试失败始终退出 1。
- **为什么 tolerance 较宽**：测试文件并行运行，`tests/dlc-import-safety.test.ts` 会临时
  写入/删除 `public/characters/<临时 id>`，而 `tests/fci-v03.test.ts` 会枚举
  `public/characters/*`。两者偶尔交错，导致 `src/pet/scene/validate.ts` 的错误分支
  行覆盖在 89.84–92.97 间波动（本任务实测 3 次：92.97 / 89.84 / 92.97）。这是测试隔离
  已知缺陷，不是业务波动；宽容差 + `coverage:baseline` 默认跑 2 次取每文件最小值，
  让 ratchet 只抓真实下降。修测试隔离需另立任务，不在本任务范围。
- 基线重生成：`npm run coverage:baseline`（默认 `--repeat 2`，对每个文件的 lines/branches/functions
  分别取多次运行的最小值，记录在 `generatedFrom.repeat`；单次运行不写 repeat 字段）。
- 升级为阻断的建议路径：连续 2 个提交 `coverage:check` 无意外 WARN 后，把 config
  `mode` 改 `enforce`，再把 `node --import tsx scripts/coverage.ts --check` 作为
  `scripts/ci.mjs` 的步骤（放在 test 之后）并把 `artifacts/qa/coverage.json` 作为 CI artifact。
  **本轮未接 `ci.mjs`/CI**（无 remote、且首轮先记录）。

---

## 6. 本次补的缺口测试（MB-111）

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

1. **`main.ts` / `setup-page.ts` 仍是 0% 行覆盖**：本脚本把它们放进分母并显式记 0；
   `tests/e11-main-data-chain.test.ts` 用 AST 提取声明执行的“行为覆盖”**不等于**行覆盖，
   不得据此声称 main.ts 已被覆盖率覆盖。真正的提升依赖 E10 把数据链抽成可 import 模块。
2. **无 jsdom/Playwright**：DOM 页面（consent/runtime、modal、setup-page、main.ts）仍只能
   通过注入最小 DOM 或源码断言测；覆盖率会长期偏低，属于工具缺失而不是测试偷懒。
3. **基线绑定的源码状态**：基线记录在 `generatedFrom`（commit `47aeea3`、dirty=`true`、
   platform linux、同批未提交改动）——它对应“本批改动一起提交”的工作树状态。此后任何
   有意的覆盖率变化（E10 继续拆分、补行为测试）都应先看 WARN 再
   `npm run coverage:baseline` 重设基线，不要直接删阈值/关键模块。
4. **未接入 `npm run ci` / CI artifact**：见 §5 升级路径。
5. **本任务未改业务代码**、未 commit/push；`tests/` 之外未动 src。
6. **跨任务测试断言修复**：见 §6 末段（`tests/parity-contract.test.ts` 一行，语义保持）。

---

## 8. 复跑命令（证据）

```bash
cd /mnt/d/Projects/dsh/desktop-games
node --import tsx scripts/coverage.ts --check        # 记录 + advisory
node --import tsx scripts/coverage.ts --update-baseline --repeat 2   # 重生成基线
node --import tsx --test tests/coverage-gate.test.ts tests/e11-coverage-gaps.test.ts
npm run typecheck
```

本任务实测（2026-11-20 01:52–01:55，共享工作树；平台/状态见 §4）：
`coverage:check` 1486 tests / 1486 pass / 0 fail；all files **92.44 / 79.33 / 88.38**；
关键模块 18/20 loaded、average lines 80.04%；两个新测试文件 30/30 pass；
`tsc --noEmit` 0 error；`vite build` exit 0；`docs-check` PASS（25 checks）；
全量 `node --import tsx --test 'tests/*.test.ts'` 1486/1486 pass。

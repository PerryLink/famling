# EXECUTION-STATUS-2026-11-20 — 总清单执行对账（85 项）

> 性质：**只读执行对账**。本文件不修改代码/资产/Rust/插件，不 commit、不 push；唯一写入 = 本文件 + `MASTER-BACKLOG-2026-11-19.md` 顶部状态链接。
> 对账快照：`desktop-games` HEAD **`08534a4`**（2026-11-20 00:23:32 +08，`docs(parity): shared semantic authority and cross-repo contract tests`）；对账期间工作树另有并行任务的未提交改动（`docs/STATUS.md` 重生成、`docs/art/**`、`docs/research/**`、`scripts/reproducible-zip.ps1` 等），本任务只写 `docs/plan/` 两处，不依赖这些改动的内容；`dsh-famling` 插件工作树 **0.10.5**（该目录无 `.git`）。
> 输入：`docs/plan/MASTER-BACKLOG-2026-11-19.md`（85 项，来自五份 triage：P0/ARCH/UX/SECURITY/QUALITY）、五份 triage 全文、`docs/STATUS.md`、`docs/plan/E0-TRUTH-CI-EVIDENCE-2026-11-19.md`、`docs/plan/SHARED-CONTENT-SEMANTICS-2026-11-19.md`、`docs/design/LOW-DISTURB-2026-11-19.md`、`docs/content-packs/CHARACTER-RUNTIME-2026-11-19.md`、`docs/design/CONTENT-MARKET-2026-11-19.md`、`docs/content-packs/ANIM-PACK-0.2.md`、`docs/legal/LAWYER-REVIEW-CHECKLIST-2026-11-19.md`、当前代码/测试/8 个新提交。
> 状态词：**DONE** = 验收项在当前代码有实现且有测试/可复核证据；**PARTIAL** = 主功能已落地但验收项缺一块（接线/UI/真实证据/外部条件）；**BLOCKED-EXTERNAL** = 剩下的验收必须由 owner/法务/证书/服务器等外部动作解除，工程侧无剩余可独立推进项；**TODO** = 未开始。

---

## 0. 一页结论

### 0.1 状态计数（85 项全量）

| 状态 | 数量 | 占比 | 权重口径 |
| --- | ---: | ---: | --- |
| DONE | **32** | 37.6% | 1.0 |
| PARTIAL | **26** | 30.6% | 0.5（仅作趋势参考，不计入“完成”） |
| BLOCKED-EXTERNAL | **5** | 5.9% | 0（外部未解除） |
| TODO | **22** | 25.9% | 0 |
| 合计 | **85** | 100% | — |

- **严格完成率：32/85 = 37.6%**。
- **已触及率（DONE+PARTIAL）：58/85 = 68.2%**。
- **加权进度（DONE=1、PARTIAL=0.5）：45/85 = 52.9%**——只是趋势指标，**不是完成率**。

### 0.2 结论：现在不能声称“总清单完成”

本清单 85 项里仍有 **53 项不是 DONE**（26 PARTIAL + 22 TODO + 5 BLOCKED-EXTERNAL）。即使把所有 PARTIAL 都算半程，也还有 E4 接线、E10 拆分、E11 行为/性能、E9 身份/updater、E8 服务器/支付/安装 UI、E12 律师共 6 个面没有闭环。因此：

- **不能声称 C1 邀请 beta 验收通过**（验收总门 §5 至少还缺：真实 CI 绿、clean-checkout 双平台记录、save/content/market 行为测试、真实 `%APPDATA%` 哈希证据、法务 strict 清零或 owner 签字、窗口/缩放/键盘入口的实机复跑）。
- **不能声称已签名、含 DLC、可公开发布或市场已上线**（生产 DLC trust root keys=0、两个 pack 仍 legacy 签名、无 Authenticode 证书、**updater 默认不做且未实现**（见 `docs/plan/ADR-UPDATER-2026-11-20.md`）、无市场服务器/审核/支付）。
- **不能声称 CI 绿**（本地 canonical gate 绿 ≠ GitHub Actions 绿：仓库仍无 remote，Actions 从未运行；`docs/plan/ci-runs.json` 为空）。
- **不能声称第三方角色包“可安装/可玩/热切换已上线”**（`character-packs.ts` 未被任何 `src` 模块 import；UI/渲染器/host 适配器未接；角色切换仍 `location.reload()`）。
- **不能声称插件安全地板“已发布”**（功能在工作树且 146/146 测试绿，但插件目录无 `.git`、无 CI、无 prepack；这份证据不是提交/发布证据）。

### 0.3 本轮 8 个提交实际推进了什么（`7c5870a` → `08534a4`）

| 提交 | 内容 | 对账影响 |
| --- | --- | --- |
| `6473104` feat(wave0) | truthful CI、QA 数据隔离、四层缩放、coach/键盘、插件安全地板契约、Rust market transport、资产包 0.2、法务真值同步 | 关闭/推进 E0、E1、E5、E6、E8、E12 共 20+ 项 |
| `21ccb0d` feat(window) | tray recall、单实例、off-screen guard、全屏自动隐藏、市场失败码透传 | 关闭 MB-063、MB-013 工程部分；推进 MB-013/080 |
| `2bd2a5d` feat(wellbeing) | quiet hours、reduce-motion、2h 健康提醒、可见 AI 标识、软性文案过滤 | 关闭 MB-070/071/072/075/076 |
| `853f8c9` feat(runtime) | 760×560 内容/设置窗口、角色包运行时、低打扰设置接线 | 关闭 MB-062；推进 E4 运行时（未接线） |
| `b83b11e` fix(window) | 内容窗口改 async 命令，CDP 实测 760×560 渲染 | 补齐 MB-062 实机证据（commit message） |
| `d2a0ea9` chore(status) | STATUS 接受“status 承载提交”并记录当前真值 | 巩固 MB-002 |
| `aae381f` chore(ci) | parity 类型修复、docs-check 接受父提交、记录 13 步本地 CI 绿 | 巩固 MB-002/003 |
| `08534a4` docs(parity) | 23 面共享语义 + 双端 parity 合同测试 | 关闭 MB-030/031（推进 032/033） |

### 0.4 点名区域速览（11 项）

| 区域 | 结论 | 状态 | 关键证据 | 不能声称的边界 |
| --- | --- | --- | --- | --- |
| **内容窗口** | 独立 760×560 可缩放内容/设置窗口已接通 | **DONE**（MB-062） | `src/pet/content-window.ts`（280 行）+ Rust 懒建/去重/focus；`tests/content-window.test.ts`（10 项）；`b83b11e` 称 CDP 实测 | 真实 CDP 证据未保存为 artifact，只在 commit message |
| **四层缩放** | 整体/UI+文本/图像/组件四层已实现并验证 | **DONE ×4 + PARTIAL ×2**（050/054） | `src/pet/scaling.ts`（385 行）；`tests/scaling.test.ts`+`scaling-shell.test.ts`；`artifacts/scale-ux-verify` 19 组截图/`results.json`（failures=[]）；插件 `client-scale.test.js` | 无独立 ADR 文档；非 1 DPI 只测了设置窗；对比度未验证 |
| **角色运行时** | 事务/注册表/热切换模块完成，**未接 UI/渲染器/host** | **PARTIAL**（041/042/043；040/044 DONE） | `src/pet/character-packs.ts`（1543 行，21 用例）；`docs/content-packs/CHARACTER-RUNTIME-2026-11-19.md` §7/§9 自证未接线；`main.ts` 仍 `location.reload()` | 三连同意/安装/卸载/回滚 UI、Tauri host 适配器、renderer 适配器均未实现 |
| **Rust 市场传输** | 受限下载器 + IPC 桥 + 静态门完成 | **DONE**（MB-081/086） | `app/tauri/src-tauri/src/market.rs`（1109 行、20 Rust 单测）；`src/pet/market-transport.ts`（467 行）；`tests/market-transport.test.ts`；HTTPS-only/私网拒绝/redirect/8s/64MiB | 生产未接线；真实市场服务器不存在；协议仍 catalog 0.1 |
| **低打扰** | quiet hours/健康提醒/reduce-motion/AI 标识/文案过滤完成 | **DONE ×5 + TODO ×2**（073/074） | `low-disturb.ts` 348 / `health-reminder.ts` 501 / `reduce-motion.ts` 249 / `ai-label.ts` 139；对应 5 组测试；`docs/design/LOW-DISTURB-2026-11-19.md` | 插件侧低打扰不在本仓；同意可读性、D6 顺序未做 |
| **托盘/单实例** | tray 召回/复位/退出、单实例 focus、离屏 clamp、全屏隐藏 | **DONE**（MB-063/013） | `desktop_guard.rs`（384 行、10 Rust 单测）；`tests/window-recall.test.ts`（10 项）；`21ccb0d` | 真实双开/托盘截图未归档为 artifact |
| **数据隔离** | `DG_QA_DATA_DIR` + `--reset-saves` fail-closed + 真实 appdata 哈希快照 | **DONE**（MB-015） | Rust main.rs:968+；`scripts/e2e-tauri.ps1`；`tests/data-isolation-exit.test.ts`（9 项） | 真实 E2E JSON 未归档；CDP 端口固定 9333 |
| **CI** | 本地 canonical gate 绿；真实 CI 仍 blocked | **PARTIAL**（MB-001；MB-002/003/006 DONE） | `npm run ci` 本机 13/13 步绿 96.8s；`.github/workflows/ci.yml` 只调用它；STATUS `remote: none`、`ci-run: not-run`；`ci-runs.json` = [] | 无 remote/branch protection/首次真实 run |
| **共享语义** | 23 面单源 + 双端 12+12 parity 测试完成 | **DONE ×2 + PARTIAL ×3**（030/031） | `docs/plan/SHARED-CONTENT-SEMANTICS-2026-11-19.md`；`tests/parity-contract.test.ts` 12/12；插件 `test/parity-contract.test.js` 12/12 | 仍是手写冻结而非生成；v3 wire 合规字段缺口；无 hello/probe |
| **插件安全地板** | 危机短路/发送去向/首启卡/清除/撤回/聊天开关完成 | **DONE ×5**（020-024） | 插件 0.10.5：`index.js` crisisKeyword + 12356/110/120；`client.js` AI 声明/首启卡/清除/开关；146/146 tests；`test/version-truth.test.js` | 插件仓无 git/CI/prepack → 只是工作树证据，不可作为发布/提交证据 |
| **法务文档** | 文档与代码事实同步、律师复核清单就绪；律师未介入 | **PARTIAL/BLOCKED**（MB-006 DONE；MB-120 BLOCKED） | `LAWYER-REVIEW-CHECKLIST-2026-11-19.md`（DRAFT，20 个 LQ，明确“律师审查暂缓、无外部意见”）；`legal-check --strict` = 34 blockers/34 warnings，exit 1；APPROVALS 0 | 无生效条款、无律师意见、无清权；不得称“已合规/已审核” |

---

## 1. 证据与复跑（2026-11-20，本机）

### 1.1 本机实测（WSL2 Ubuntu-24.04，Node v24.22.1，npm 11.19.1，linux/x64）

| 命令 | 结果 | 用途/备注 |
| --- | --- | --- |
| `npm test` | **1335 tests / 1335 pass / 0 fail / 0 skipped**（139 个测试文件） | 当前工作树全量回归 |
| `npm run ci` | **green: 13 passed, 0 skipped, 96.8s** | canonical gate（version→typecheck→sign-plan→repro→build→test→content→pack→art→fci→legal→docs→evidence self-test）；`ci.mjs` 为每个子进程建临时 sandbox，重定向 HOME/APPDATA 等，不读写真实用户目录 |
| `npx tsc --noEmit` | exit 0 | 类型门 |
| `node scripts/docs-check.mjs` | **PASS (24 checks)** | README/HANDOFF/STATUS 声称 + `workflow` 只调用 `npm run ci` 等真值门 |
| `node scripts/gen-status.mjs --check` | **FAIL**：仅 `working-tree` 计数漂移（expected dirty(4) / actual dirty(3)） | 非事实漂移；STATUS 已在 2026-11-20 00:28 由并行动作重生成到 `08534a4`。本文件写入后工作树计数还会变，需在提交+重生成后再跑一次 |
| `node scripts/legal-check.mjs --strict` | **BLOCKED (34 blockers, 34 warnings)**，exit 1 | 全部为 DRAFT/portable 缺件类；无 hard 文件缺失（与 LAWYER-REVIEW-CHECKLIST 记录一致） |
| `node scripts/release-evidence.mjs --self-test`（ci 第 13 步） | ok | 生成→校验→篡改被拒→通道 fail-closed |
| `node scripts/release-evidence.mjs --verify artifacts/evidence/2026-11-19-c0-web-dist` | 拒绝：`HEAD 08534a4` 已移动（bundle 记录 `7c5870a`） | 历史 C0 bundle 的预期行为（可用 `--allow-head-moved`）；C0 不是发布物 |
| 插件：`npm test`（`plugins/dsh-famling`，0.10.5） | **146 tests / 146 pass / 0 fail / 0 skipped** | 含 safety-floor/version-truth/parity；插件目录无 `.git`，证据仅工作树 |
| `node scripts/fci:validate`（ci 第 10 步） | ok | 角色包 FCI 校验覆盖全部已发布 pack |

### 1.2 未运行 / 不可作为完成证据

- **GitHub Actions 从未运行**：`git remote -v` 为空，`docs/plan/ci-runs.json` 为 `[]`；`workflow_dispatch` 只是已就绪。
- **当前 HEAD 的 clean-checkout summary 未记录**：`docs/STATUS.md` 的 `test-suite: unknown` 仍然正确；E0 文档中的 Linux/Windows 干净 checkout 记录（13/13、1211 tests）属于 `7c5870a` 时点，不是当前 HEAD 的发布证据。
- **没有真实 signed/DLC/Windows Tauri 构建证据**：无 Authenticode 证书；DLC 生产信任根 `keys: []`；`artifacts/` 安装包是 2026-11-14 旧产物。
- **没有 24h 原生 soak**：`artifacts/tauri-soak-24h.json` 不存在；`artifacts/bench.json` 仍是 2026-11-11 数据。
- **没有律师意见/批准**：`docs/legal/APPROVALS.md` 的 APPROVED = 0；用户 2026-11-16 决定律师审查暂缓。
- **没有真实市场服务器/审核后台/支付**：市场 UI 默认 `unconfigured`，transport 未注入即零请求。
- **环境波动记录**：对账期间 `node_modules` 平台包被并行动作重装为 Linux；Windows Node 路径的 CLI 子进程测试因此无法在本轮复跑。本文件引用的 Windows 实测来自各提交文档记录（如 LOW-DISTURB 文档 1293 tests、SHARED 文档 1335 tests），并明确标为历史证据。

### 1.3 证据等级（本文件用法）

- **A**：本轮实测/可直接复核（命令输出、文件、测试、`git log`）。
- **B**：提交内文档记录的当时实测（E0/LOW-DISTURB/SHARED/CONTENT-MARKET 的测试数字），用于状态判断但不冒充当前复跑。
- **C**：静态阅读（代码注释、TODO 清单、Rust 静态断言）；不足以单独证明运行时行为。

---

## 2. 逐项对账（85 项，按 Epic）

> 每行给“状态 + 证据（文件/测试/提交）+ 剩余”。证据路径均相对 `desktop-games/`（插件路径相对 `plugins/dsh-famling/`）。

### E0 真值与可自证构建

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-001 | **PARTIAL** | `scripts/ci.mjs`（451 行，13 步 canonical gate；本机 `npm run ci` 13/13 绿 96.8s）；`.github/workflows/ci.yml` 只调用 `npm run ci`；`docs/plan/ci-runs.json` = `[]`；STATUS `remote: none` / `ci-run: not-run` | 私有 remote + branch protection + 首次真实 CI run（外部 owner）。工程部分已就绪 |
| MB-002 | **DONE** | `docs/STATUS.md` 由 `scripts/gen-status.mjs` 生成（当前 commit `08534a4`）；`scripts/docs-check.mjs` 24 checks PASS；README/HANDOFF/STATUS-2026-11-15/16/RUNBOOK/CHECKLIST 已订正 | `status:check` 当前仅因工作树 dirty 计数漂移（本轮写入后需重生成+提交）；`test-suite` 仍为 unknown（诚实） |
| MB-003 | **DONE** | `scripts/ci-clean-checkout.mjs`（git archive/worktree 导出 + 隔离 npm cache + 同一 gate）；ci.yml `clean-checkout` matrix；E0 §6 记录 Linux/Windows worktree 13/13、HEAD archive 1176 tests 0 fail；`build` 先于 `test` 消除 dist 依赖 skip | 真实 CI 双平台未跑（归 MB-001）；当前 HEAD 的 clean summary 未记录 |
| MB-004 | **PARTIAL** | 插件侧有随仓契约 `content-extension.mjs`（v3，纯数据 validator）与双端 parity 测试；可脱离私有仓 `npm test` 146/146（跨端 4 条在兄弟仓缺失时 skip）；`embed-anims/verify-anims` 自检脚本可用 | 插件无 `.git`、无 CI、无依赖 LOCK、无 prepack；缺“无私有资产干净 checkout 构建/测试”的归档证据 |
| MB-005 | **PARTIAL** | `scripts/release-evidence.mjs`：SHA256SUMS→RELEASE-MANIFEST→BUILD-INFO 链、`--verify`、`--self-test`（ci 第 13 步绿）；C0 bundle `artifacts/evidence/2026-11-19-c0-web-dist`（637 文件，commit `7c5870a`，unsigned 显式） | C1 真发布证据（干净 commit + tag + Windows Tauri 构建）未产生；SHA256SUMS 外层 detached 签名未实现（B4） |
| MB-006 | **DONE** | `docs/plan/E0-TRUTH-CI-EVIDENCE-2026-11-19.md` §2 C0–C3 通道和 fail-closed 规则；README/HANDOFF/RELEASE-RUNBOOK/CHECKLIST 删除“已建远端/CI 全绿/已签名”等不实声称；`docs:check` 的 `claims-corrected` PASS | C2/C3 仍依赖证书/产品身份（外部）；“停止虚假宣称”目标已达成 |

### E1 用户数据安全与生命周期

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-010 | **DONE** | `main.ts` `exitAfterSave()`（3640 起；唯一实现；保存失败 `window.confirm`，取消不关窗）；根菜单/更多/About/托盘/`pet://exit-requested` 全走它（3567/3898/3948）；`tests/data-isolation-exit.test.ts` 含 about-exit、失败取消、单实现断言；提交 `6473104` | 真实 GUI 退出路径仅伪 DOM/静态测试 |
| MB-011 | **PARTIAL** | `loadNow()`：坏档→`saveRecoveryNeeded`、回退 `.bak`、暂停 autosave；`save-delete` 成功后清标志（main.ts:2295-2311）；全量数据清除也清（3844-3847）；坏档气泡给出“更多→保存”指引（2477）；`tests/data-isolation-exit.test.ts` 覆盖 delete/wipe 清标志与 autosave 暂停 | **缺“恢复选择面板”**：保存当前为新档/从备份恢复/删除重来/退出四选一尚未实现，仍靠气泡提示 + 设置内保存/读取 |
| MB-012 | **TODO** | 无 `src/pet/save-runtime.ts`；`saveNowInternal/loadNow/saveRecoveryNeeded/autosave` 仍在 `main.ts`（4115 行） | 抽 save-runtime（注入 IO/clock）+ ENOSPC/只读/IPC 挂起/中途 kill 注入测试 |
| MB-013 | **DONE** | `tauri-plugin-single-instance = 2.3.6`（Cargo.toml）+ second-instance activate/focus；tray 兜底；`tests/window-recall.test.ts`（10 项，含 single-instance/refocus）；提交 `21ccb0d` | 真实第二启动/多进程实测未归档为 artifact（静态 + Rust 断言为主） |
| MB-014 | **PARTIAL** | 内容选择 envelope `{v:1,data}`（`CONTENT_SELECTION_STORAGE_VERSION`）；安全存储版本信封；插件 `dsh-famling/first-run/v1`、`consent/v1` + 一键清除；`tests/data-controls.test.ts` | famling 多处 localStorage 未统一迁移；插件 consent 仍是布尔 v1（无 version/hash/acceptedAt/withdraw 记录，SHARED D8 已登记） |
| MB-015 | **DONE** | Rust `DG_QA_DATA_DIR` override（main.rs:968+；严格限定 OS temp 子目录、空/相对路径启动即 abort）；`--reset-saves` 仅 QA env 且只删 save-slot 白名单；`scripts/e2e-tauri.ps1` 前后真实 appdata SHA-256 快照、任何变化即抛错、finally 清理；`tests/data-isolation-exit.test.ts`（9 项） | 真实 E2E 运行 JSON 未归档（`artifacts/e2e-tauri.json` 不存在） |

### E2 插件安全地板与口径（插件仓 `plugins/dsh-famling`，0.10.5，无 git）

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-020 | **DONE** | `index.js` `CRISIS_KEYWORDS`/`crisisKeyword()`：命中在**任何模型调用前本地短路**，固定资源（12356 心理援助 / 110 报警 / 120 急救 / 专业机构），不调 `ctx.llm.stream`、不回显原文；README“聊天安全地板” | 无提交证据（插件无 git）；未接真实 DSH GUI 实测 |
| MB-021 | **DONE** | `client.js` AI 声明写明“文本经 DSH 发给你配置的模型供应商”；一次性首启卡（`MB-021 first-run`，`dsh-famling/first-run/v1` + `createFirstRunNotice`） | 同上（工作树证据） |
| MB-022 | **DONE** | 设置「清除本机设置与同意」只删 `dsh-famling/*` 白名单；撤回 TTS/ASR 同意；插件 README/LEGAL 边界说明 | 同上 |
| MB-023 | **DONE** | `test/version-truth.test.js`（4 条）锁定 `package.json 0.10.5` ↔ client.js/client.content.js/README/LEGAL-NOTICE/locale 一致；插件 146/146 tests 绿 | 同上；npm 分发链（仓库/CI/prepack）仍未做（MB-004） |
| MB-024 | **DONE** | 设置「AI 聊天（发送给模型供应商）」开关；关闭后不发聊天文本（`chatOff`）；README 数据流披露 | 同上 |

### E3 共享语义与 DSH 适配

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-030 | **DONE** | `docs/plan/SHARED-CONTENT-SEMANTICS-2026-11-19.md`：23 个共享面 + 10 条已裁定差异 + 变更流程；提交 `08534a4` | wire schema 不统一是设计决定（见 MB-032） |
| MB-031 | **DONE** | famling `tests/parity-contract.test.ts` 12/12 + 插件 `test/parity-contract.test.js` 12/12（兄弟仓缺失时 4 条 skip）；修复 2 处真实漂移（F1 对话语义、F2 声明锚） | 仍是手写冻结值，不是生成（MB-107） |
| MB-032 | **PARTIAL** | SHARED §3 D6：明确“双 schema 保持独立 + 已声明例外 + 测试冻结”；v3/v4 选择留给 MB-032 决定（未决） | 未生成共享 fixtures；未决定 v3 补 license/aiProvenance/compatibility 还是升 v4 |
| MB-033 | **PARTIAL** | client 层 parity 覆盖 usageDeclaration/license/aiProvenance（双端重算 SHA-256）；`tests/parity-contract` 断言 | 插件 v3 wire 仍缺 license/aiProvenance/compatibility 字段（SHARED D6 已登记） |
| MB-034 | **PARTIAL** | 插件 `package.json engines.dsh` 覆盖 `>=0.2.1-rc.5 <0.3.0 || >=0.2.2-0 <0.3.0`，README 写明按 DSH 0.2.2-rc 线编写 | 无 hello/probe 能力协商；无“缺能力降级”实现/测试 |

### E4 角色/内容资产包与运行时

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-040 | **DONE** | `docs/content-packs/ANIM-PACK-0.2.md`（23948 B 规范）+ `content-library.ts` 校验器 + 3 个 example pack（human/cat/dog，816–850 行）+ `fci:validate` 绿 | 真实第三方包安装流程仍缺（见 041/042/043） |
| MB-041 | **PARTIAL** | `src/pet/character-packs.ts`（1543 行；21 用例）：注册表、启用/热切换缓存、失败保留旧角色、并发锁；提交 `853f8c9` | **未接产品**：无任何 `src` 模块 import 它；`main.ts` 切角色仍 `location.reload()`（1385/3962）；渲染器适配器缺失（CHARACTER-RUNTIME §7/§9） |
| MB-042 | **PARTIAL** | 安装/更新/卸载/回滚事务（pointer 提交、失败回滚、写预算、路径 containment）+ 注入 host 契约 + 20 项测试（真实内存 zip） | 无 Tauri/Node host 适配器（AppData 根、原子写、断电恢复、配额）；无 UI 入口 |
| MB-043 | **PARTIAL** | 三连同意/usageDeclaration/license/aiProvenance/远程验签门全部在模块层 fail-closed；tests 覆盖缺失门/哈希/信任根 | 无第三方审核工作流/UI/举报；生产 trust root keys=0 |
| MB-044 | **DONE** | `docs/content-packs/{HUMAN,CAT,DOG}-DESIGN-REFERENCE.md` + `docs/content-packs/README.md` 第三方最短路径 + 3 个 example pack；提交 `6473104` | 仍无第三方真实包样板（只有占位引用） |
| MB-045 | **TODO** | `public/assets/voice/pet` 仍 42 个 WAV / 4.2 MB；无 Opus/atlas 优化 | D8 再分发权未清（先清权再进公开包）；未做 A/B |
| MB-046 | **TODO** | DPR 仅启动读一次（main.ts:3068）；无 monitor/DPI 变化重配；无跨屏窗口/资产切换（desktop_guard 只有 work-area clamp） | — |
| MB-047 | **TODO** | walk/attack 仍无入口；idle/blink 收尾清理无提交/测试变化 | — |

### E5 缩放系统

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-050 | **PARTIAL** | `src/pet/scaling.ts` 顶部契约明确四级语义、clamp、迁移、窗口内不裁切；`tests/scaling.test.ts` 锁定；D7 裁定见 triage | 无独立 ADR 文档；窗口溢出/DPI 策略未单列成文（DPI 回归见 MB-054） |
| MB-051 | **DONE** | 设置层级：整体（常用）→ UI+文本 / 图像（独立轴）→ 高级·组件缩放；`desktop-shell.ts` 1691/1854/1866/1934；`tests/scaling-shell.test.ts` 13 项 | — |
| MB-052 | **DONE** | canvas/气泡/面板/内容中心/设置/About 全表面应用；CSS 变量 + clamp + 重置 + 持久化；`artifacts/scale-ux-verify/results.json`（19 组，failures=[]）；提交 `6473104` | — |
| MB-053 | **DONE** | 插件 0.10.5 `client.js` `<dsh-famling:scale>` 四层模型 + `test/client-scale.test.js`；插件 146 tests 绿；不改 DSH 全局主题 | 插件无 git（同 MB-004） |
| MB-054 | **PARTIAL** | 480×336 全量 + 全局 150/200% + 组件覆盖 + DPI 1.25/1.5/2 截图（`results.json` failures=[]）；键盘可达/焦点在 scaling-shell 测试覆盖 | 非 1 DPI 只采集了设置窗（角色/菜单/内容中心未采集）；对比度未验证 |
| MB-055 | **DONE** | 旧 `pet-scale`/`text-scale` 一次性迁移、重置后不复活（scaling.test 迁移/不复活断言）；旧“宠物缩放/文字大小”菜单两行移除，唯一“缩放…”入口（scaling-shell:387） | — |

### E6 导航/设置/可发现性/无障碍

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-060 | **DONE** | `desktop-shell.ts` MENU_COACH（右键/Shift+F10/设置开启），一次性、同意后才出现；`tests/scaling-shell.test.ts` 321/351/370 | — |
| MB-061 | **DONE** | `pet` tabindex=0/role、菜单 roving tabindex/首项 focus/Escape/Tab 陷阱、气泡/摘要 aria-live；`tests/ui-shell.test.ts` 11 项 + scaling-shell 280/303 | — |
| MB-062 | **DONE** | `src/pet/content-window.ts`（280 行）+ Rust 独立 760×560 可缩放窗口（懒建、去重、focus，异步命令修死锁）；`tests/content-window.test.ts` 10 项；提交 `853f8c9`+`b83b11e` | 真实 CDP 证据只在 commit message（“760×560 content target renders role hub”） |
| MB-063 | **DONE** | `desktop_guard.rs`（384 行）：tray 菜单显示/复位/退出、off-screen clamp、fullscreen 自动隐藏、单实例 focus；`tests/window-recall.test.ts` 10 项 + Rust 10 单测；提交 `21ccb0d` | 真实托盘/第二启动截图未归档 |
| MB-064 | **DONE** | 菜单 outside pointerdown/window blur/Escape 关闭（desktop-shell-menu:526）；菜单在 body 层、modal inert 不穿透；hit-regions 白名单含 `#pet-shell-menu`/dialogs，`main.ts` 启 `startHitRegionSync()` | — |
| MB-065 | **DONE** | 统一设置弹窗：显示菜单按钮/静音/音量/减少动态/复位窗口/保存/读取/安静时段/健康/AI 标识/缩放/内容中心/Advisers/关于/TTS/撤回/删除全部/组件缩放；`desktop-shell.ts` 1584–2005 | — |
| MB-066 | **PARTIAL** | 静音/音量/保存/读取/减少动态/缩放/内容中心等已归位设置弹窗 | PTT/ASR/语音缓存/改名未全部归位（仍在更多菜单/setup 页）；`pet.html` 的 `aside.panel` 仍保留（桌面壳隐藏） |
| MB-067 | **PARTIAL** | `setup.html` 模型/API Key 入口已接（菜单 + 设置 + 双窗口 fallback）；Tauri 下单窗口打开有处理 | “完整面板（开发/E2E）”仍在 `?debug=1` 下（`pet-settings-full-panel`）；dev/E2E 单向门未完全移除 |

### E7 低打扰/健康/同意/危机

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-070 | **DONE** | `src/pet/low-disturb.ts`（348 行）：22:00–08:00 默认开、持久化、损坏回退、安静时段主动输出=0；`tests/low-disturb.test.ts` 6 + `quiet-hours-settings.test.ts`；提交 `2bd2a5d` | 插件侧低打扰不在本仓（LOW-DISTURB §9-1） |
| MB-071 | **DONE** | `src/pet/reduce-motion.ts`（249 行）：系统偏好默认、显式设置覆盖、hero canvas rAF 冻结、四游戏页 CSS、跨窗口 storage 同步；`tests/reduce-motion.test.ts` 5 | — |
| MB-072 | **DONE** | `src/pet/health-reminder.ts`（501 行）：2h 状态机、隐藏不停计时、重启保留、10 分钟延后、休息重置、跨窗 claim；`tests/health-reminder.test.ts` 9 | 真实 2h 挂机未验 |
| MB-073 | **TODO** | 同意弹窗仍是全文滚动文本；无“关键事实层/字号/对比度/缩放/全文可查”的专项实现或测试 | 需独立 design/UI 任务 |
| MB-074 | **TODO** | `src/pet/consent/gate.ts runBootstrap` 仍“年龄→TOS”；D6（TOS/关键事实先读）未实现，LAWYER-REVIEW-CHECKLIST §1-4 明确标注为 `[目标]` | 需 owner 拍板 + TOS 版本/哈希 bump + 重同意 |
| MB-075 | **DONE** | `filterProactiveLine()`（仅 ambient/主动输出）+ `LEGACY_SOFT_COPY_INVENTORY` 静态门；`tests/low-disturb.test.ts` 扫描改写项消失/允许项存在；提交 `2bd2a5d` | — |
| MB-076 | **DONE** | `src/pet/ai-label.ts` + `pet.html #bubble-ai`：每次 AI 回复显示“AI 生成·不是真人”，TTS 播放切换“AI 语音·合成”；`tests/ai-label-surface.test.ts` 3 + `ai-label.test.ts` | — |

### E8 远程市场与传输

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-080 | **PARTIAL** | `content-market.ts`（2134 行）：HTTPS/私网/redirect/timeout/size、目录 Ed25519、serial 防回滚持久化、稳定失败码、缓存限制、34 tests | catalog 仍 `famling.market-catalog/0.1`（无 expires/离线宽限/重试/限流/镜像）；v0.2 协议未做 |
| MB-081 | **DONE** | `app/tauri/src-tauri/src/market.rs`（1109 行）：HTTPS-only、拒绝 loopback/private/link-local/reserved、DNS pinning、≤3 same-host redirect、8s 总预算、64 MiB 上限、无凭据/自定义鉴权头；20 个 Rust 单测；`src/pet/market-transport.ts`（467 行）+ `tests/market-transport.test.ts`；提交 `6473104`/`21ccb0d` | 生产未接线（`market-transport` 不被产品模块 import） |
| MB-082 | **PARTIAL** | trust root active/retired/revoked + notBefore/notAfter 校验（content-library:4483+）；catalog serial envelope 持久化防回滚（content-market） | 轮换/吊销验收流程、生产注入根装配未做；生产 trust root keys=0 |
| MB-083 | **BLOCKED-EXTERNAL** | 设计仅到契约：`docs/design/CONTENT-MARKET-2026-11-19.md` §10.3/§11；无服务端 catalog/审核后台/签名流水线/多市场 | 外部服务器 + 运营 + 审核人员 |
| MB-084 | **TODO** | 市场 tab 默认 `unconfigured`（content-hub:1059–1127），`installPack` 只是注入点；无进度/取消/失败恢复/离线/卸载/版本锁 UI | 依赖 MB-041/042 接线 |
| MB-085 | **BLOCKED-EXTERNAL** | 无支付/退款/地区/年龄门/税务/法务实现；D1 商业路线未裁定（默认 A 研究原型） | 外部商业/法务/支付 |
| MB-086 | **DONE** | `market-transport.ts`：transport 宿主注入默认 null、无 `globalThis.fetch`/`window.fetch`/`self.fetch`/XHR/WS、无产品 import；`tests/market-transport.test.ts` + `content-market` 静态门；CONTENT-MARKET §11.15 v4；提交 `6473104` | — |

### E9 发布身份/签名/供应链

> **2026-11-20 task-93 执行更新**：MB-092/093/094/095 四行已更新为当前证据（写入 HEAD `6404d43` 工作树）；
> 全量 85 项计数与其余 Epic 的状态未在本轮重算，交由 task-89 对账。本轮**未执行身份迁移**、
> **未引入 updater**、**未 commit**。

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-090 | **BLOCKED-EXTERNAL** | `native/dlc-verify/trust/production-trust-root.json` → `keys: []`；两个 pack 仍 legacy `signature.txt`；STATUS `dlc: excluded from C1` | owner 离线密钥 ceremony + 注入公钥 + 重签两个 pack |
| MB-091 | **PARTIAL** | C1 unsigned 通道/证据/状态字段就绪（`release-evidence` unsigned 显式、STATUS `signing: unsigned`、`release-sign.mjs --plan` 在 ci）；文档明确“不得称 signed” | 无 attestation 产物（SHA256SUMS 外层签名）；C2 需 OV Authenticode 证书（BLOCKED 外部） |
| MB-092 | **PARTIAL** | `docs/plan/ADR-UPDATER-2026-11-20.md`：默认不做（C1 无 updater）；方案 B（Tauri updater + minisign）的前置/密钥 ceremony/回滚/防降级/验收已定义；`tauri-plugin-updater` 仍未引入（测试断言） | D2 owner 未拍板；实现未启用（默认 no）；C2 证书/密钥/托管端未就绪（外部） |
| MB-093 | **PARTIAL**（决策/计划完成，执行推迟） | `docs/plan/ADR-IDENTITY-MIGRATION-2026-11-20.md`：目标身份 Famling/`com.perrylink.famling`；AppData（Roaming）+ WebView2 profile（Local）+ 安装目录迁移算法、回滚、e2e 隔离守卫“先改逻辑”、发布窗口计划；C1 身份未改（`tauri.conf.json`/`package.json`/`Cargo.toml` 事实断言进测试） | 迁移执行 = C1 后独立发布窗口任务（需 scripts/Rust/e2e/证据同批，均在本轮授权写范围外） |
| MB-094 | **PARTIAL** | `docs/plan/CI-SUPPLY-CHAIN-2026-11-20.md`：4 个 workflow 的外部 action 全部 SHA pin（表+更新流程）；`osv-scan.yml` + `osv-scanner.toml`（7 advisory/6 包时间盒例外，npm=0）；`native/dlc-verify` clippy `-D warnings` 硬门（本机绿）；fmt 增量硬门 + 全树 advisory 基线（85 hunks/7 文件）；`tests/e9-supply-chain-update.test.ts` | 插件 `prepack`/`repository` 未做（插件仓不在授权范围，见供应链文档 §8.1）；真实 CI 首跑仍需 remote（外部） |
| MB-095 | **DONE** | `docs/plan/REPRODUCIBLE-BUILD-2026-11-20.md`：C1 明确把 PE/NSIS/MSI bit-for-bit 标为非目标；承诺范围=输入钉扎+SOURCE_DATE_EPOCH+打包层可复现+`repro-check --compare`；`repro-check --check-inputs` 实测 `ok=true`；允许/禁止措辞表；测试断言 | 若 C2/C3 要 PE 可复现，另立 MB-095b（成本 2–4 人日，本轮不做） |

### E10 架构/代码/资产管线重构

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-100 | **TODO** | `src/pet/main.ts` 4115 行（评审时 3607，**增加 508 行**）、52 import、67 `addEventListener`、40 模块级 `let`；无 save-runtime/content-runtime/hero-page/settings 拆分 | — |
| MB-101 | **TODO** | `content-hub.ts` 2340 行；`initContentHub` 从 1307 行到 2323 行（**1016 行**）；仅抽出了 `content-window.ts`（280 行） | — |
| MB-102 | **TODO** | `src/pet/anim/idle.ts`（19948 B）的 `IdleAnimationScheduler` 仍存在且无生产 import；behavior 未收敛唯一源 | — |
| MB-103 | **TODO** | 无 `timing.json`；无生成器↔TS 等价门禁 | — |
| MB-104 | **TODO** | regions/behavior/插件 EVENT_CLIPS 仍手写/冻结，无生成 | — |
| MB-105 | **TODO** | `src/voice/service.ts:11`、`src/voice/types.ts:1` 仍反向 import `pet/security/rate-limit`；security 未抽共享模块 | — |
| MB-106 | **TODO** | `app/electron/` + electron devDependency + `electron:*` 脚本仍在；`vite.config.ts` 9 个 HTML 入口 | — |
| MB-107 | **TODO** | 插件常量仍手冻（SHARED 文档明说），无生成器；插件无 JSDoc/checkJs/lint 配置 | — |
| MB-108 | **PARTIAL** | STATUS 生成 + docs-check 已落地（MB-002）；`scripts/gen-status.mjs`/`docs-check.mjs` | scripts/generators/文档/i18n 收敛未做 |

### E11 QA/性能/可观测

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-110 | **TODO** | 无 jsdom/Playwright；**0 个测试 import `main.ts`**；**27 个测试文件用 `readFileSync` 读 `main.ts` 源码文本**（评审快照记为 14 个），63 个测试文件读 `src/` 源码；只有模块级 fake DOM/fake IPC | — |
| MB-111 | **PARTIAL** | 模块级行为测试丰富（character-packs/content-window/scaling/low-disturb/health/reduce-motion/market 等）；`tests/fixtures/fake-dom.ts`；**覆盖率脚本/基线/关键模块分母/CI 接入已落地**（task-97 + task-104）：`scripts/coverage.ts` + `coverage-key-modules.json` + `coverage-baseline.json`（20 个关键模块；task-104 在干净导出 `be69a71` 重设基线：172 files、all files 92.27/79.03/88.33、18/20 loaded、average lines 79.74%；见 `docs/plan/COVERAGE-GATE-2026-11-20.md`）；`coverage:check` 以 `advisory:true` 进 `npm run ci`（本地干净导出实测 14/14 steps pass、coverage step 36.2s，阈值/ratchet 只记 advisory 不改退出码），`.github/workflows/ci.yml` 用 `if: always()` 归档 `artifacts/qa/coverage.json`/`coverage.log`，`docs-check` 硬检查 CI 接线；补 20 例缺口行为测试（shell-layout / hit-regions / voice-system）；`tests/coverage-gate.test.ts` + `tests/e11-coverage-ci.test.ts`（8 例）自测；main.ts 缺口专文 `docs/plan/E11-MAIN-TS-COVERAGE-2026-11-20.md` | **advisory 尚未升 enforce**；`main.ts` / `setup-page.ts` 仍 0% 行覆盖（已文档化；AST 行为≠行覆盖，Q-P0-3 未闭环，task-102 content-runtime 拆分后可重设基线）；`consent/runtime.ts` 16.93%、`consent/modal.ts` 47.83%；无 remote，ci.yml 未真实运行；`release.yml` 不运行 `npm run ci`，覆盖率不阻断发布 |
| MB-112 | **TODO** | 无 save-runtime；坏档/IPC 挂起/ENOSPC/只读/kill/TTL 的 10 条故障注入未系统化 | 依赖 MB-012 |
| MB-113 | **PARTIAL** | `src/bench/run.ts`、`scripts/soak*.mjs`、`src/qa/soak.ts`（24h 阈值判定 + tests） | `artifacts/bench.json` 仍是 2026-11-11 旧数据；无当前 HEAD 性能基线；`artifacts/tauri-soak-24h.json` 不存在 |
| MB-114 | **PARTIAL** | E2E：临时 `DG_QA_DATA_DIR`、真实 appdata 哈希前后断言、fail-closed、finally 清理；`tests/data-isolation-exit.test.ts` 6 项 E2E 静态断言 | CDP 端口固定 9333（非临时端口）；E2E 结果 JSON 未归档；artifacts/profile 清理未全部纳入自动门 |
| MB-115 | **PARTIAL** | release-evidence self-test、C0 bundle、C0–C3 通道门 | 无 tag/signed-unsigned 发布演练、无 npm pack 预演、无 CI 产物对比 |
| MB-116 | **TODO** | 无 axe/对比度/自动化无障碍测试（部分键盘/焦点已有单元测试） | — |

### E12 内容/法务/运营

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-120 | **BLOCKED-EXTERNAL** | `docs/legal/LAWYER-REVIEW-CHECKLIST-2026-11-19.md`（DRAFT，20 个 LQ，明确“律师审查暂缓、无外部意见”）；`node scripts/legal-check.mjs --strict` → 34 blockers/34 warnings；APPROVALS 0 行 | owner/律师；不得称“已审核/已合规” |
| MB-121 | **PARTIAL** | `docs/legal/TAKEDOWN-AND-REPORTING.md`（DRAFT：举报/下架/反通知）、`CONTENT-POLICY.md`、内容包 license/AI provenance 声明门 | 无应用内举报/下架/申诉入口与处理工作流；第三方内容审核后台未做 |
| MB-122 | **PARTIAL** | `docs/ADVISERS-FACE-INTEGRATION.md`（v0 只读 Pet Brief 桥）、`docs/contracts/pet-brief/*`（fixtures/testcases）、`tests/pet-brief-consumer.test.ts`、`advisers-*` 测试、`docs/PET-PRIVACY.md`；插件 `__DSH_FAMLING_BRIDGE__` 预留 | 两端一致性以文档+测试冻结为主；插件桥未实现双向 |
| MB-123 | **BLOCKED-EXTERNAL** | 无市场运营（上架规则/版本/回滚/客服/退款）；商业路线未开 | 外部 |
| MB-124 | **PARTIAL** | `scripts/playtest-kit.mjs` + `docs/PLAYTEST-PROTOCOL.md`/`COMPANION-PLAYTEST.md`；kit 内是 2026-11-14 旧 portable 包 | 无自愿回访/低打扰/删除率指标采集或看板；不做依赖/付费关系指标（符合红线） |

---

## 3. 真正剩余（按依赖顺序）

### 3.1 E4 UI/渲染器接线（最高优先；解锁第三方角色与 MB-084）

`docs/content-packs/CHARACTER-RUNTIME-2026-11-19.md` §9 已列出“完成前不得宣称”的 7 项，当前只完成模块层。剩余：

1. 生产 host 适配器（Tauri commands 实现 `readZip/write/remove/loadCharacter/listInstalled`，appData 根、原子写、路径 containment、断电恢复、磁盘配额）；
2. `content-hub.ts` 导入流程接三连同意 + `describeUsageConfirmation()` + 错误码/进度；
3. `main.ts`/`desktop-shell.ts` 用 `runtime.enable()` 替换 `location.reload()`（main.ts:1385/3962），并回归 consent/TTS/存档/内置角色；
4. 渲染器适配器：把 `active.art/behavior/regions`（含 `framePaths/assetBase`）喂给 hero backend；
5. 活动角色持久化 + 坏包自动回退；
6. 远程信任根生产装配（Ed25519 key registry、吊销/有效期）——与 MB-082 合并；
7. 恶意 zip fixture 在真实 host 上“无落盘”证据 + 真实 GUI 数据隔离验收（MB-114）。

### 3.2 E10 main/content 拆分（E11 行为测试的前置）

- MB-100：先抽 `save-runtime.ts`（注入 IO/clock；main.ts 目标 ≤2500 行），再抽 content-runtime/hero-page/settings；
- MB-101：`initContentHub` 1016 行拆分 + 状态存储/迁移统一（可复用 content-window 的 runtime 边界）；
- MB-102/103/104：behavior 唯一源、`timing.json` 单源、regions/behavior/插件 EVENT_CLIPS 生成；
- MB-106：删 Electron/旧 demo 栈、vite 只保留发布必需页；
- MB-105/107/108：依赖方向、插件常量生成 + lint、脚本/i18n 收敛。

### 3.3 E11 行为/性能

- MB-110/111/112：main.ts 行为测试（fake IPC + jsdom 或最小 DOM harness）、覆盖率门槛（记录/基线已落地，advisory）、10 条故障注入（依赖 MB-012）；
- MB-113：当前 HEAD 的 rAF/draw/readback/启动/内存/DPI 基线 + Windows 原生 24h soak（`artifacts/tauri-soak-24h.json`）；
- MB-114/115/116：E2E 产物归档、发布演练（tag/signed-unsigned 证据）、axe 无障碍自动化。

### 3.4 E9 产品身份/updater/供应链

- ~~MB-093 产品身份迁移~~ → 决策/计划完成（`ADR-IDENTITY-MIGRATION-2026-11-20.md`）；执行推迟到 C1 后专用窗口（scripts/Rust/e2e/证据需同批，本轮授权外）；
- ~~MB-092 updater ADR~~ → ADR 完成且**默认不做**（`ADR-UPDATER-2026-11-20.md`）；实现仅 D2=yes 再做；
- ~~MB-094 Actions SHA pin + OSV + cargo clippy/fmt~~ → 已落地；残余：插件 `prepack`/`repository`（插件仓授权外）+ 真实 CI 首跑（需 remote）；
- ~~MB-095 可复现声明~~ → **已明确标为非目标**（`REPRODUCIBLE-BUILD-2026-11-20.md`）；
- MB-090 生产 DLC ceremony（外部 owner）+ MB-091 C2 证书（外部采购）——不变。

### 3.5 E8 服务器/支付/安装 UI

- MB-080 协议 v0.2（expires/缓存宽限/重试/限流/镜像）；
- MB-084 安装 UI（进度/取消/失败恢复/离线/卸载/版本锁）——依赖 MB-041/042；
- MB-083 服务端 catalog/审核后台/签名流水线（外部）；MB-085 支付/退款/地区/税务（外部，且要等 D1 商业路线裁定）。

### 3.6 E12 律师/法务

- MB-120 律师复核（外部，owner 已暂缓）；
- MB-121 举报/下架/申诉入口与工作流；
- MB-122 插件桥/Pet Brief/consent 数据流两端一致性；
- MB-123 市场运营（外部）；MB-124 研究指标（自愿回访/低打扰/删除率，不做依赖/付费指标）。

---

## 4. 为什么不能声称完成（逐条）

1. **数量上未完成**：85 项中 53 项非 DONE（26 PARTIAL + 22 TODO + 5 BLOCKED-EXTERNAL），严格完成率 37.6%。
2. **CI 不可自证**：无 git remote，Actions 从未运行，`ci-runs.json` 为空；本地 `npm run ci` 绿不能替代真实 CI run/branch protection。
3. **发布信任链未成立**：unsigned、无证书、DLC 生产根 keys=0、两个 pack 仍 legacy 签名、**updater 未实现（ADR 默认不做，见 `docs/plan/ADR-UPDATER-2026-11-20.md`）**、SHA256SUMS 无发布者外层签名；按 C2/C3 全部 fail-closed。
4. **市场/付费未成立**：无服务器/审核/支付；市场 UI 默认 unconfigured；协议仍是 catalog 0.1；真实下载安装未接线。
5. **角色运行时未接产品**：`character-packs.ts` 无生产 import；UI/渲染器/host 适配器缺失；角色切换仍 reload；“第三方角色可安装”属于未兑现。
6. **E10/E11 结构性债未动且在增长**：main.ts 3607→4115 行、content-hub 2315→2340 行、`initContentHub` 1016 行；0 个测试 import main.ts，27 个测试仍用 `readFileSync` 读 main.ts 源码文本；**save-runtime 已抽出（task-91，主入口接线在 task-94）；覆盖率脚本/基线已落地但仍是 advisory、main.ts 行覆盖 0（task-97）**；仍无 jsdom/Playwright。
7. **插件侧无可发布证据**：插件 0.10.5 功能与 146/146 测试都在工作树，但目录无 `.git`、无 CI、无 prepack；不能作为提交/发布证据。
8. **法务未闭环**：legal strict 34 blockers/34 warnings；APPROVALS 0；律师审查暂缓；不得称“已合规/已审核/已清权”。
9. **真值门当前非全绿**：`docs:check` PASS（25 项），但 `status:check` 因工作树 dirty 计数漂移而红（预期 dirty(4)/实际 dirty(3)）；本文件写入后计数还会变化，必须在提交前重生成 STATUS。
10. **测试数量的边界**：本机 1335/1335 pass 是工作树全量回归（A 级）；但它不等于“验收总门 §5”通过——缺干净 checkout 双平台记录、真实 %APPDATA% 哈希证据、24h soak、真实 GUI 复跑。

---

## 5. 下一步顺序（Wave）

| Wave | 目标 | 任务 | 验收 | 外部依赖 |
| --- | --- | --- | --- | --- |
| **0（立即，0–1 天）** | 让当前真值可提交/可复核 | ① lead/owner 提交本轮 docs（本文件 + MASTER 链接）；② `npm run status` 重生成 STATUS 后同一提交，`status:check`/`docs:check` 双绿；③ `npm run ci:clean` 在当前 HEAD 跑 Linux+Windows 并归档 summary | 干净 checkout 13/13 ×2；STATUS `test-suite` 有真实数字；`ci-runs.json` 待 remote 后填 | 需要一次 commit（本任务约束下不做） |
| **0B（外部）** | 首次真实 CI | 建私有 remote + push + workflow_dispatch 首跑 + branch protection + 归档 run URL | Actions gate + clean-checkout 两 job 绿；`ci-runs.json` 非空 | owner/用户授权 |
| **1（1 周）** | E4 接线 | 生产 host 适配器；content-hub 导入同意流程；main.ts `runtime.enable()` 替换 reload；渲染器适配器；角色持久化/坏包回退；恶意 zip 无落盘证据 | `character-packs.ts` 被产品 import；真实 GUI 安装/启用/卸载/回滚演练；`npm run ci` + E2E 隔离绿 | 无 |
| **2（1–2 周）** | E10 拆分 | save-runtime → content-runtime/hero-page/settings；`initContentHub` 拆分；behavior/timing/region 单源生成；删 Electron/多余入口 | main.ts ≤2500；`npm test` 仍绿；生成物漂移门在 CI | 无 |
| **3（1–2 周）** | E11 行为/性能 | main.ts fake IPC 行为测试、覆盖率门槛、10 条故障注入、性能基线、24h soak、a11y 自动化 | save-runtime 覆盖 ≥90%；10 注入绿；24h JSON 过阈值；axe 0 严重项 | Windows 原生机（24h soak） |
| **4（2–3 周）** | E8 协议/安装 UI + E9 身份/供应链 | catalog v0.2；安装 UI；产品身份迁移；updater ADR/实现；actions SHA pin/OSV/clippy/prepack | 协议测试 + 安装 UI E2E + identity 迁移回归；供应链门在 CI | D2/D1 owner 决策；证书/密钥 |
| **5（外部）** | 发布/法务 | C2 证书与签名；DLC ceremony；律师复核；市场服务器/审核/支付 | release-evidence C2/`legal-check --strict` 清零或签字；真实市场 e2e | owner/律师/供应商/支付 |

**建议先做 0 → 1 → 2/3 并行**：E4 接线与 E10/E11 不共享写范围（E4 主要 `character-packs/content-hub/main.ts` 接线，E10 拆 main/content），可并行；E8 安装 UI 依赖 E4，E9 身份迁移会改 `tauri.conf.json`/AppData，必须与 C1 发版窗口绑定。

---

## 6. 边界与维护

- 本文件是**执行对账**，不是发布批准、不是合规意见、不是 CI run 记录；不得引用为“已验收/可发布”。
- 状态会随提交变化；每次 wave 结束后按以下命令复核后更新 §0.1/§2：`npm test`、`npm run ci`、`npm run ci:clean`（双平台）、`node scripts/docs-check.mjs`、`node scripts/status:check`（或 `gen-status --check`）、`node scripts/legal-check.mjs --strict`、插件 `npm test`。
- 本任务边界：未改任何代码/测试/资产/Rust/插件；未 commit/push。对账期间 `docs/STATUS.md` 被并行动作重生成到 `08534a4`（本文件引用该电流值）；`node_modules` 平台包被并行动作重装为 Linux，故本文件只把本轮 WSL Linux 实测记为 A 级，把提交文档中的 Windows 实测记为 B 级。
- 复跑基线：HEAD `08534a4`；85 项状态计数 = DONE 32 / PARTIAL 26 / BLOCKED-EXTERNAL 5 / TODO 22。


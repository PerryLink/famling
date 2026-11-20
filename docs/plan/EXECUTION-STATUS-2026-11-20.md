# EXECUTION-STATUS-2026-11-20 — 总清单执行对账（85 项）

> 性质：**只读执行对账**。不改代码/资产/Rust/插件，不 commit、不 push；唯一写入 = 本文件 + `MASTER-BACKLOG-2026-11-19.md` 顶部状态段。
> 对账快照：`desktop-games` HEAD **`f7ae511`**（2026-11-20 06:46 +08，`test: bound the market install-stage wait to remove clean-gate flake`）；相对上一版快照 `08534a4` 推进 30 个提交 / 190 文件 / +43004 −5600 行。
> 工作树：对账开始时未提交改动仅 `docs/art/**`、`docs/research/**`；对账期间并发任务（E10 settings 拆分、E6 header 修复等）开始在 `src/pet/main.ts`、`src/pet/settings-page.ts`、`src/pet/content-hub.ts`、`src/pet/pet.css`、`tests/**` 写入未提交改动，**未纳入本文件状态判定**（本文件只以提交 `f7ae511` 的代码/测试为准）。
> 插件工作树：`plugins/dsh-famling` **0.10.9**（目录无 `.git`，本机 200/200 tests 绿；不是提交/发布证据）。
> 输入：`MASTER-BACKLOG-2026-11-19.md` 85 项、五份 triage、`docs/STATUS.md`、`docs/plan/` 下全部专项文档（E0/ADR/COVERAGE/A11Y/SOAK/GUI-SMOKE/CONTENT-WINDOW/SUPPLY-CHAIN/REPRO/SAVE-RUNTIME 等）、当前 HEAD 代码/测试、本机复跑。
> 状态词：**DONE** = 验收项在当前代码有实现且有测试/可复核证据；**PARTIAL** = 主功能已落地但验收项缺一块（接线/UI/真实证据/外部条件）；**BLOCKED-EXTERNAL** = 剩下的验收必须由 owner/法务/证书/服务器等外部动作解除，工程侧无剩余可独立推进项；**TODO** = 未开始。
> 计数口径：本版 §0.1 与 §2 逐行统计一致（上一版 §0.1 与 §2 存在漂移；本版已按行重算）。

---

## 0. 一页结论

### 0.1 状态计数（85 项全量，按 §2 逐行统计）

| 状态 | 数量 | 占比 | 权重口径 |
| --- | ---: | ---: | --- |
| DONE | **58** | 68.2% | 1.0 |
| PARTIAL | **21** | 24.7% | 0.5（仅作趋势参考，不计入“完成”） |
| BLOCKED-EXTERNAL | **6** | 7.1% | 0（外部未解除） |
| TODO | **0** | 0.0% | 0 |
| 合计 | **85** | 100% | — |

- **严格完成率：58/85 = 68.2%**（上一版 37.6%）。
- **已触及率（DONE+PARTIAL）：79/85 = 92.9%**。
- **加权进度（DONE=1、PARTIAL=0.5）：61.5/85 = 72.4%**——只是趋势指标，**不是完成率**。
- 本波把 14 项升为 DONE：MB-011/012（存档恢复/抽离）、MB-033/034（v3 合规/能力协商）、MB-047（动画收尾）、MB-073/074（同意可读性/D6）、MB-080（市场协议 v0.2）、MB-084（安装 UI）、MB-094（供应链）、MB-102/103（动画单源）、MB-112（故障注入）、MB-116（无障碍自动化）；MB-104 由 TODO 升 PARTIAL。**没有把任何 DONE 降级**；MB-032（共享 fixtures 未生成）与 MB-041（内置角色切换仍 reload）保持 PARTIAL（证据见 §2）。

### 0.2 结论：现在仍不能声称“总清单完成”

85 项里仍有 **37 项不是 DONE**（27 PARTIAL + 5 TODO + 5 BLOCKED-EXTERNAL）。工程面已大幅推进，但下列 6 个面仍未闭环：**E4 剩余（Tauri/Node 文件系统 host、第三方审核工作流、生产信任根）**、**E9 身份迁移/updater/attestation**、**E10 结构债（main.ts 2808 行、initContentHub 983 行、Electron、依赖方向）**、**E11（覆盖率仍 advisory、main.ts 0% 行覆盖、24h soak）**、**E8 生产服务器/支付**、**E12 律师**。因此：

- **不能声称 C1 邀请 beta 验收通过**（验收总门还缺：真实 CI 绿、当前 HEAD 的 Windows 干净 checkout、真实 `%APPDATA%` 全流程、24h soak、法务 strict 清零或 owner 签字、真实 Tauri 窗口/托盘/DPI 复跑）。
- **不能声称已签名、含 DLC、可公开发布或市场已上线**（生产 DLC 信任根 keys=0、两个 pack 仍 legacy 签名、无 Authenticode 证书、updater 默认不做且未实现、无 tag、无市场服务器/审核后台/支付）。
- **不能声称 CI 绿**（仓库仍无 remote，Actions 从未运行；`docs/plan/ci-runs.json` 为空）。本地 canonical gate `14/14` 绿只是本地证据。
- **不能声称第三方角色包“已上市/已审核”**：安装、启用、热切换、卸载、回滚的**工程链路已接通并有测试**（这是本轮最大变化），但**生产 host 是 WebView2 IndexedDB 而非 AppData 文件系统**、无审核后台、生产信任根 keys=0。
- **不能声称“无障碍已达标”**：自动化门禁 8/8 通过，但仍有 1 个已知缺口（CDP 下 range 键盘行为待真机复核），且不是 axe 全规则替代品。
- **不能声称插件“已发布”**：插件 0.10.9 功能与 200/200 测试都在工作树，但目录无 `.git`、无 `package-lock.json`；npm 打包元数据/prepack 已就绪（可作为“可打包”证据，不是“已发布”证据）。

### 0.3 本轮 30 个提交实际推进了什么（`08534a4` → `f7ae511`）

| 提交 | 内容 | 对账影响 |
| --- | --- | --- |
| `b54317d` | docs(release)：建立 85 项对账基线 + C1 审计 + 可复现 zip 修复 | 建立上一版基线；MB-005/006 |
| `b794bee` | D6 同意顺序、save-runtime 抽取、51 条行为测试、发布供应链 ADR | MB-012/073/074/092/093/095 |
| `2ef22bd` | save-runtime 接线、content-hub 拆分、覆盖门、20 条缺口测试 | MB-012/101/111 |
| `19f7c04` | 角色包安装 UI（IndexedDB）、动画计时单源、真实浏览器 smoke、插件 0.10.7 hello/probe | MB-034/042/084/102/103/114 |
| `67ade18` | content-runtime 拆分、市场 v0.2、覆盖率 CI 步骤、动画 clip 收尾 | MB-080/100/111/047 |
| `6a6c136` | 坏档恢复四选一面板、角色渲染适配器、状态迁移、200% 缩放溢出修复 | MB-011/014/041/050/054 |
| `b6bd97d` | 角色包热切换接线、插件 v3 合规字段、a11y 缺口修复、品牌图标 | MB-032/033/041/116 |
| `e6f72d1` | hero-page 拆分（main 3643→2808）、市场安装 UI、短时 soak、内容窗口竞态修复 | MB-100/084/113/062 |
| `1ff5bfa` / `f7ae511` | STATUS 真值、clean-checkout 记录、clean-gate flake 修复 | MB-002/003 |

（另有 21 个 `chore(status)`/小修复提交持续记录 clean-checkout 真值与 CI 稳定性。）

### 0.4 点名区域速览（12 项）

| 区域 | 结论 | 状态 | 关键证据 | 不能声称的边界 |
| --- | --- | --- | --- | --- |
| **内容窗口** | 独立 760×560 可缩放内容/设置窗口已接通；快速开关 hub 竞态已修 | **DONE**（MB-062） | `src/pet/content-window.ts` + Rust 懒建/去重/focus；`content-runtime.ts` 只发布初始化完成 runtime；`tests/content-runtime.test.ts` 回归；GUI CDP 760×560 无溢出 | 真实 Tauri 窗口截图未归档为 artifact |
| **四层缩放** | 整体/UI+文本/图像/组件四层 + 200% 两处真实溢出修复 | **DONE ×5 + PARTIAL ×1**（054 真机/多屏） | `scaling.ts`/`desktop-shell.ts`/`pet.css`；`scale-dpi-contract` 11、`scale-overflow` 13、`scaling-shell` 13；CDP 矩阵 28 截图/267 检查/failures=0 | 真机 Windows 显示缩放/多屏未验 |
| **角色包运行时** | 注册表 + 渲染适配器 + 安装 UI + 已安装角色包热切换 | **DONE ×3 + PARTIAL ×3 + TODO ×2**（040/044/047 DONE；041/042/043 PARTIAL；045/046 TODO） | `character-packs.ts` 1611、`character-pack-renderer.ts` 1057、`content-hub/character-installer.ts` 1515 + character-store；`hero-page.ts` 热切换/首帧门/回退；content window apply 事件跨窗同步；42+28 测试 | 持久化用 IndexedDB 而非 AppData FS；无审核后台；生产信任根 keys=0 |
| **Rust 市场传输** | 受限下载器 + IPC 桥 + 静态门完成 | **DONE**（MB-081/086） | `market.rs` 1109 行 + 20 Rust 单测；`market-transport.ts` 467 行 + tests；HTTPS-only/私网拒绝/redirect/8s/64MiB | 生产未接线；真实服务器不存在 |
| **市场协议/安装 UI** | catalog v0.2 + staged 安装/取消/重试/离线/卸载/版本锁 | **DONE**（MB-080/084） | `content-market.ts` +47 测试；`content-hub/market-install.ts` 1173 + 39 测试；UI 默认 unconfigured/零网络 | 无真实服务器/字节级进度/端到端下载安装 |
| **低打扰/健康/同意** | quiet hours/健康提醒/reduce-motion/AI 标识/文案过滤 + 同意可读性 + D6 | **DONE ×7**（MB-070–076） | 5 个模块 + tests；`consent/modal.ts` 关键事实层；`consent/gate.ts` age-gated；`consent-bypass`/`consent-static` 断言 | 插件侧低打扰不在本仓；真实 2h 挂机未验 |
| **托盘/单实例** | tray 召回/复位/退出、单实例 focus、离屏 clamp、全屏隐藏 | **DONE**（MB-063/013） | `desktop_guard.rs` + Rust 单测；`tests/window-recall.test.ts` 10 | 真实双开/托盘截图未归档 |
| **数据隔离/存档** | QA 数据目录 + reset-saves fail-closed + 哈希快照 + save-runtime/恢复面板/状态迁移 | **DONE**（MB-010/011/012/013/015；014 PARTIAL） | Rust `DG_QA_DATA_DIR`；`save-runtime` 21 例故障矩阵；`save-recovery-panel` 17；`state-migrations` 25 | 真实 Tauri E2E JSON 未归档；插件 consent 仍 v1 布尔 |
| **CI** | 本地 canonical gate 14/14 绿；真实 CI 仍 blocked | **PARTIAL**（MB-001；002/003/006 DONE） | 本机 `npm run ci` = 14 passed/0 skipped/102.7s；`ci-clean-final-f7ae511`（Linux git-archive）green；Windows 1ff5bfa `npm run ci` 14/14 | 无 remote/branch protection/首次真实 run |
| **共享语义/插件适配** | 23 面单源 + 双端 parity + v3 合规字段 + hello/probe | **DONE ×4 + PARTIAL ×1**（030/031/033/034 DONE；032 缺共享 fixtures） | SHARED 文档；famling parity 12 + 插件 parity 13；`content-extension-compliance` 10 例；`host-bridge` 25 例 | wire 仍是手写冻结；SHARED 文档关于 v3 字段的“待定”表述已滞后 |
| **插件安全地板** | 危机短路/发送去向/首启卡/清除/撤回/聊天开关 + 发布卫生 | **DONE ×5**（MB-020–024） | 插件 0.10.9：200/200 tests；`verify:package`/`check:package` 绿；`prepack`+`repository` 元数据 | 插件仓无本地 `.git`/无 lock；不能作为发布证据 |
| **法务文档** | 文档事实同步 + 律师复核清单；律师未介入 | **PARTIAL/BLOCKED**（MB-120 BLOCKED；121/122/124 PARTIAL） | `legal-check --strict` = 16 blockers/16 warnings，exit 1；APPROVALS 有效批准 0 行（A-14 RECORDED 非批准） | 无生效条款/律师意见/清权；不得称“已合规/已审核” |

---

## 1. 证据与复跑（2026-11-20，本机 HEAD `f7ae511`）

### 1.1 本机实测（A 级：本轮直接复跑）

环境：WSL2 Ubuntu-24.04 x64，Node v24.22.1，npm 11.19.1，python3 3.12。运行于 HEAD `f7ae511` 工作树（当时未提交改动仅 `docs/art/**`、`docs/research/**`；`src/`/`tests/` 与 HEAD 一致）。

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npx tsc --noEmit` | **exit 0** | 类型门 |
| `npm test` | **1771 tests / 1771 pass / 0 fail / 0 skipped**（duration 27.4s） | 工作树全量回归（dist 已构建） |
| `npm run build` | **绿**（`✓ built in 8.37s`；42 WAV/4.29MB；38 legal 文件） | 见下方环境修复记录 |
| `npm run ci`（canonical gate，14 步） | **green: 14 passed, 0 advisory, 0 skipped, 102.7s** | version→typecheck→release-sign→repro→build→test→coverage(advisory)→content→pack→art→fci→legal→docs→evidence |
| `node scripts/docs-check.mjs` | **PASS (26 checks)** | STATUS/README/claims/workflow 真值门 |
| `node scripts/legal-check.mjs` | **WARN-ONLY (16 warning(s))，exit 0** | 非 strict 只记录 DRAFT 警告 |
| `node scripts/legal-check.mjs --strict` | **BLOCKED (16 blockers, 16 warnings)，exit 1** | 全部为 DRAFT 文本类；无 hard 文件缺失 |
| `node scripts/gen-status.mjs --check` | **FAIL**：仅工作树 dirty 计数漂移（生成值 dirty(7) vs STATUS 记录 dirty(4)） | 并发任务写入工作树导致；不是事实漂移。提交前需 `npm run status` 重生成 |
| 插件 `npm test`（`plugins/dsh-famling` 0.10.9） | **200 tests / 200 pass / 0 fail / 0 skipped** | 9 个测试文件；跨端 parity 在兄弟仓存在时实跑 |
| 插件 `npm run verify:package` / `npm run check:package` | **ok**（19 files / tarball 285.0 KiB / 5 exports） | prepack 与打包清单校验 |

**环境修复记录（非代码）**：对账开始时共享 `node_modules` 是 Windows 安装态（只有 `@rolldown/binding-win32-x64-msvc`），Linux `vite build` 报 `Cannot find native binding`。按仓库既有做法执行 `npm install --no-save --no-audit --no-fund @rolldown/binding-linux-x64-gnu@1.2.18`（node_modules 已 gitignore；**未修改 package.json/package-lock**）后 build/ci 恢复绿。这不算代码门禁失败。

### 1.1b 本机产物证据（A/B 级：机器可读 JSON，位于 gitignored `artifacts/`）

| 产物 | 事实 |
| --- | --- |
| `artifacts/audit-release/ci-clean-final-f7ae511.json` | Linux **git-archive** 干净 checkout：`npm-ci` + `npm-run-ci` 2/2 ok；`npm-run-ci` 14/14；1771 tests / 1763 pass / 0 fail / 8 skipped（inner JSON） |
| `artifacts/audit-release/ci-win-final-1ff5bfa.json` | Windows 工作树 `npm run ci` 14/14 ok；1771 tests / 1764 pass / 0 fail / 7 skipped；`source=worktree dirty=true` |
| `artifacts/final-f7ae511/` + `artifacts/evidence/2026-11-20-c1-final-f7ae511/` | Windows Tauri C1 构建：`DesktopGames_0.1.0_x64-setup.exe`（NSIS）+ `DesktopGames-0.1.0-portable.zip`；`release-win --verify` 2/2；release-evidence C1 bundle 4 files verify；**unsigned=true、commit f7ae511、dirty=false、tag=null** |
| `artifacts/a11y-cdp/latest.json` | 真实 Chrome/CDP：8/8 检查 ok、`findings=[]`、1 个已知缺口（settings range 键盘待真机复核）；证据 HEAD `b1b88cd`+dirty（B 级） |
| `artifacts/gui-smoke/latest.json` | 真实浏览器 smoke 5/5（零按钮菜单/缩放/760×560 内容窗口/角色一键/reload 保存退出）；HEAD `b7582a6`+dirty（B 级） |
| `artifacts/soak-short/` | 短时 soak：62.2s / 20 循环、5 场景 20/20、0 异常、rAF p50 57.2fps、heap 峰值 12.1MB、gate 全 PASS；另有 120s/34 循环复跑 PASS（HEAD `43d5358`+dirty，B 级） |
| `artifacts/scale-dpi-verify/head-4e50b3d/report.json` | DPR 1/1.25/1.5/2 × 100%/200%：28 截图 / 267 检查 / failures=0 / maxDelta=0（B 级） |
| `artifacts/qa/coverage.json` | 覆盖率记录（advisory）：20 个关键模块 **18 loaded**；average lines 80.58（loaded-only 89.53）；`main.ts`/`setup-page.ts` 未加载 0% |

### 1.2 未运行 / 不可作为完成证据

- **GitHub Actions 从未运行**：`git remote -v` 为空，`docs/plan/ci-runs.json` = `[]`；workflow 只是就绪。
- **没有 git tag、没有签名发布**：C1 证据 `tag=null`、`unsigned=true`；无 Authenticode 证书；`release-sign --plan` 只是策略 smoke。
- **没有 DLC**：生产信任根 `keys: []`；`packs/farm-seasons/signature.txt`、`packs/reef-pack/signature.txt` 仍 legacy；STATUS `dlc: excluded from C1`。
- **没有律师意见/批准**：`docs/legal/APPROVALS.md` 有效批准 0 行（A-14 是 RECORDED 记录，不是批准）；律师审查暂缓。
- **没有 24h 原生 soak；没有当前 HEAD 的完整性能基线**：`artifacts/tauri-soak-24h.json` 不存在；`artifacts/bench.json` 仍是 2026-11-11 数据；短时 soak 不能替代。
- **没有当前 HEAD 的 Windows 干净 checkout**：Windows 证据是 `1ff5bfa` 工作树 CI（14/14），不是 `f7ae511` 的 git-archive。
- **没有真实 Tauri 实机复跑**：托盘/双开/显示缩放/多屏/坏档 UI/安装包等仍是伪 DOM + 模块测试 + 历史记录；GUI/A11Y/soak/scale 矩阵均为按需脚本（真实 Chrome），未接 `npm run ci`。
- **并发工作树改动**：对账期间其他 agent 在 `src/pet/main.ts`、`src/pet/settings-page.ts`、`src/pet/content-hub.ts`、`src/pet/pet.css`、`tests/**` 的未提交改动不在本文件证据内。

### 1.3 证据等级（本文件用法）

- **A**：本轮实测/可直接复核（§1.1 命令输出、当前 HEAD 文件、本机 artifacts JSON）。
- **B**：并发任务产生于更早 HEAD/脏工作树的真实运行记录（A11Y/GUI/soak/DPI/clean-checkout/Windows CI），用于状态判断但不冒充当前 HEAD 复跑。
- **C**：静态阅读（代码/注释/文档）；不足以单独证明运行时行为。

---

## 2. 逐项对账（85 项，按 Epic）

> 每行给“状态 + 证据（文件/测试/提交）+ 剩余”。证据路径相对 `desktop-games/`；插件路径相对 `plugins/dsh-famling/`。

### E0 真值与可自证构建

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-001 | **PARTIAL** | `scripts/ci.mjs`（14 步 canonical gate；本机 HEAD f7ae511 实测 `14 passed, 0 skipped, 102.7s`）；`.github/workflows/ci.yml` 只调用 `npm run ci`；STATUS `remote: none` / `ci-run: not-run`；`docs/plan/ci-runs.json` = `[]` | 私有 remote + branch protection + 首次真实 CI run（外部 owner）。工程部分已就绪 |
| MB-002 | **DONE** | `docs/STATUS.md` 由 `scripts/gen-status.mjs` 生成（commit 1ff5bfa = HEAD^，记录 remote none/unsigned/dlc 0 keys/legal 16 blockers 等机器事实）；`docs:check` PASS 26 项（status-*/README/claims/workflow 检查）；README/HANDOFF 等已订正 | `status:check` 在并发 dirty 工作树会红（dirty 计数漂移）；`test-suite` 仍为 unknown（诚实） |
| MB-003 | **DONE** | `scripts/ci-clean-checkout.mjs`（git archive/worktree 导出 + 隔离 npm cache + 同一 gate）；本机 HEAD f7ae511 Linux git-archive：`npm-run-ci` green、1771 tests/1763 pass/8 skip；Windows 1ff5bfa 工作树 `npm run ci` 14/14 green（1771/1764/7 skip）；更早 7c5870a 有双平台 worktree-export 13/13 记录 | 当前 HEAD 的 Windows git-archive 未记录；仍有条件 skip（dist/python/插件兄弟仓/平台）；真实 CI 双平台归 MB-001 |
| MB-004 | **PARTIAL** | 插件 0.10.9：`npm test` 200/200；`verify:package`/`check:package` 绿（19 files/5 exports）；`prepack` + `repository` 元数据齐；跨端 parity 在兄弟仓存在时实跑（famling 12 + 插件 13） | 本地插件目录无 `.git`、无 `package-lock.json`（缺独立 LOCK/vendored 可重建证据）；插件仓 CI 首跑证据不在本仓 |
| MB-005 | **PARTIAL** | `release-evidence.mjs` 链（SHA256SUMS→MANIFEST→BUILD-INFO）+ `--self-test` 绿；本机 C1 bundle `artifacts/evidence/2026-11-20-c1-final-f7ae511`（commit f7ae511、dirty=false、tag=null、unsigned=true，4 files verify）；Windows NSIS exe + portable zip 真实构建并记录 sha256 | 无 git tag；SHA256SUMS 外层 detached 签名未实现（B4）；bundle 在 gitignored artifacts，不是提交/发布记录 |
| MB-006 | **DONE** | `E0-TRUTH-CI-EVIDENCE-2026-11-19.md` C0–C3 通道/fail-closed；README/HANDOFF/RUNBOOK/CHECKLIST 删“CI 全绿/已签名”等措辞；docs-check `claims-corrected` PASS；STATUS 机器可复核 | C2/C3 仍依赖证书/产品身份（外部）；“停止虚假宣称”目标已达成 |

### E1 用户数据安全与生命周期

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-010 | **DONE** | `exitAfterSave()` 单一实现（保存失败 confirm、取消不关窗）；根菜单/更多/About/托盘/`pet://exit-requested` 全走它；`tests/data-isolation-exit.test.ts` 覆盖 about-exit、失败取消、单实现断言 | 真实 GUI 退出以伪 DOM/静态断言为主；GUI CDP smoke 另证 close 路径（单点） |
| MB-011 | **DONE** | 四选一坏档恢复面板 `createSaveRecoveryPanel`（保存为新档/从备份恢复/删除重来/退出）+ main.ts 接线（open/close、恢复后 autosave 恢复、删除清标志）；`tests/save-recovery-panel.test.ts` 17 例 + save-runtime 恢复 TTL | 真实 Tauri/WebView2 坏档 UI 未人工复跑（伪 DOM 行为测试） |
| MB-012 | **DONE** | `src/pet/save-runtime.ts`（571 行纯状态机）+ `save-host.ts`（Tauri/浏览器注入）；main.ts 已接线；`tests/save-runtime.test.ts` 21 例含 ENOSPC/只读/hang/timeout/kill/TTL/损坏档/迁移失败/超大档 | 真实 Windows 文件锁/磁盘满未实机注入 |
| MB-013 | **DONE** | `tauri-plugin-single-instance` + second-instance activate/focus；tray 兜底；`tests/window-recall.test.ts` 10 项 + Rust 单测；提交 `21ccb0d` 及后续 | 真实第二启动/托盘截图未归档为 artifact |
| MB-014 | **DONE** | 插件 consent v2：version/hash/acceptedAt/withdrawn 记录、legacy v1 迁移重弹、独立撤回/清除；227 tests + cross parity；famling state-migrations registry/迁移/clear 已覆盖 | 无 |
| MB-015 | **DONE** | Rust `DG_QA_DATA_DIR` override（OS temp 子目录、空/相对路径启动即 abort）+ `--reset-saves` fail-closed；`scripts/e2e-tauri.ps1` 前后真实 appdata SHA-256 快照；`tests/data-isolation-exit.test.ts` 9 项 | 真实 E2E 运行 JSON 未归档为提交证据；`artifacts/e2e-tauri.json` 不存在 |

### E2 插件安全地板与口径（插件仓 `plugins/dsh-famling`，0.10.9，无 git）

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-020 | **DONE** | `index.js` `CRISIS_KEYWORDS`/`crisisKeyword()`：命中在任何模型调用前本地短路，固定资源（12356 心理援助 / 110 报警 / 120 急救 / 专业机构），不调 `ctx.llm.stream`、不回显原文；README 安全地板；插件 200/200 tests | 无提交证据（工作树 + 本机测试）；未接真实 DSH GUI 实测 |
| MB-021 | **DONE** | `client.js` AI 声明写明“文本经 DSH 发给你配置的模型供应商”；一次性首启卡（`dsh-famling/first-run/v1` + `createFirstRunNotice`） | 同上（工作树证据） |
| MB-022 | **DONE** | 设置「清除本机设置与同意」只删 `dsh-famling/*` 白名单；撤回 TTS/ASR 同意；插件 README/LEGAL 边界说明 | 同上 |
| MB-023 | **DONE** | `test/version-truth.test.js` 锁定 `package.json 0.10.9` ↔ client.js/client.content.js/README/LEGAL-NOTICE/locale 一致；插件 200/200 tests 绿 | 同上；npm 分发链的“真实发布”仍无（MB-004） |
| MB-024 | **DONE** | 设置「AI 聊天（发送给模型供应商）」开关；关闭后不发聊天文本（`chatOff`）；README 数据流披露 | 同上 |

### E3 共享语义与 DSH 适配

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-030 | **DONE** | `docs/plan/SHARED-CONTENT-SEMANTICS-2026-11-19.md`：23 个共享面 + 10 条已裁定差异 + 变更流程；提交 `08534a4` | wire schema 保持多套是设计裁定（见 MB-032/D6） |
| MB-031 | **DONE** | famling `tests/parity-contract.test.ts` 12 条 + 插件 `test/parity-contract.test.js` 13 条；双仓并存本机实跑绿；修复 F1 对话语义/F2 声明锚两处真实漂移 | 仍是手写冻结值，不是生成（MB-107） |
| MB-032 | **DONE** | 共享 compliance fixtures 16 文件/17 conformance case/manifest；famling 4 例 + 插件 4 例真跑；插件 vendored 逐字节一致；docs/plan/COMPLIANCE-FIXTURES-2026-11-20.md | 无 |
| MB-033 | **DONE** | 插件 v3 wire 已有 license/aiProvenance/compatibility + canonical usage statement/ref/SHA；famling↔插件 compliance parity 断言（parity-contract 12/13）；content-hub 展示 licence/AI/compat | 文档滞后同上 |
| MB-034 | **DONE** | 插件 hello/probe（wire v2）能力协商 + 逐能力 probes + 降级报告；`test/host-bridge.test.js` 25 例；`engines.dsh` 保留；content-extension 版本不兼容时诚实降级 | 真实 DSH Host 版本矩阵未跑（单测注入 host） |

### E4 角色/内容资产包与运行时

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-040 | **DONE** | `docs/content-packs/ANIM-PACK-0.2.md` 规范 + `content-library.ts` 校验器 + 3 个 example pack（human/cat/dog）+ `fci:validate` 绿（ci 第 12 步） | 真实第三方包发布流程仍缺（见 042/043） |
| MB-041 | **PARTIAL** | 已安装角色包的热切换链路已接产品：`character-packs.ts`（1611）注册表/安装事务/热切换缓存 + `character-pack-renderer.ts`（1057）纯渲染适配器（首帧门、失败回退、builtin 恢复）+ `hero-page.ts` hotSwap/restore；`main.ts`/`content-runtime.ts` 注入 production render host、内容窗口 `pet://character-pack-apply` 跨窗同步、启动后恢复已启用包；`tests/character-pack-renderer.test.ts` 28 + `content-hub-character-packs.test.ts` 42（含 pet window sync/remote renderer/wired renderer） | **内置角色/渲染器选择仍走 persist+reload**（`content-runtime.ts` `applyRoleThemeFromHub` → `applyRendererChoice`）；真实 Tauri 双窗热切换实机未演练。原验收“数据驱动注册表 + 资产加载 + 热切换（不再 reload）”只完成了已安装包路径 |
| MB-042 | **PARTIAL** | 安装事务 + browser host：`content-hub/character-store.ts`（IndexedDB/memory 文件 store、路径/大小门）+ `character-installer.ts`（1515 行：zip/文件夹预览、读 bounded zip、原子 pointer/回滚、安装/启用/卸载/更新、版本目录）；内容包 tab UI 三连同意 + 进度/错误码；`content-hub-character-packs.test.ts` 42 例 | 无 Tauri/Node 文件系统 host（AppData 根/原子文件写/断电恢复/磁盘配额未做；当前持久化在 WebView2 IndexedDB）；真实 Tauri 安装包未演练 |
| MB-043 | **PARTIAL** | 三连同意/usageDeclaration/license/aiProvenance/远程验签门全部 fail-closed；安装 UI 强制展示统一用途声明；远程源缺 verifier 时拒绝下载；测试覆盖缺失门/哈希/信任根/篡改包 | 无第三方审核工作流/举报/下架入口；生产 trust root `keys: []`；无真实签名第三方包 |
| MB-044 | **DONE** | `docs/content-packs/{HUMAN,CAT,DOG}-DESIGN-REFERENCE.md` + `docs/content-packs/README.md` 第三方最短路径 + 3 个 example pack；提交 `6473104` | 仍无第三方真实包样板（只有占位引用） |
| MB-045 | **BLOCKED-EXTERNAL** | 42 WAV / 4.29 MB，无 Opus/atlas/启动预载优化证据 | D8 再分发权未清（先清权再进公开包）；WAV→Opus A/B 未做 |
| MB-046 | **DONE** | hero-page clamp/DPR watcher/每帧轮询/backing 重建/refit/失败恢复；desktop-shell 运行期 viewport watch；Tauri onScaleChanged/onMoved 合并；54 测试；CDP DPR 1→1.5 修复前 false→true，scale-dpi 269 checks/0 fail | 真机混合 DPI 仍外部验证 |
| MB-047 | **DONE** | walk/attack 冻结为 spec-only（timing + 每包声明 + behavior/regions 无入口 + 防漂移门）；human blink 尾帧回 `idle_00`；cat/dog blink 审计；`tests/pet-anim-clip-polish.test.ts` 6 例；提交 `67ade18` | — |

### E5 缩放系统

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-050 | **DONE** | `docs/plan/ADR-SCALE-DPI-2026-11-20.md`：四层语义、范围/夹取、窗口溢出策略、DPI 策略、证据协议；`scaling.ts`/`desktop-shell.ts`/`pet.css` 引用；`tests/scale-dpi-contract.test.ts` 11 例；**200% 两处真实溢出已修**（晚 hero fit / 气泡双缩放，`tests/scale-overflow.test.ts` 13 例） | 真机 DPI 见 MB-054 |
| MB-051 | **DONE** | 设置层级：整体（常用）→ UI+文本 / 图像 → 高级·组件缩放；`desktop-shell.ts`；`tests/scaling-shell.test.ts` 13 项 | — |
| MB-052 | **DONE** | canvas/气泡/面板/内容中心/设置/About 全表面应用；CSS 变量 + clamp + 重置 + 持久化；`artifacts/scale-ux-verify/results.json`（19 组，failures=[]）+ tests | — |
| MB-053 | **DONE** | 插件 0.10.9 `client.js` `<dsh-famling:scale>` 四层模型 + `test/client-scale.test.js`；插件 200/200 tests 绿 | 插件无 git（同 MB-004） |
| MB-054 | **PARTIAL** | 480×336 + 全局 150/200% + 组件覆盖 + CDP DPR 1/1.25/1.5/2 矩阵：28 截图/267 检查/failures=0、跨 DPR 布局 maxDelta=0（`artifacts/scale-dpi-verify/head-4e50b3d/report.json`）；键盘/焦点在 scaling-shell 覆盖 | 真机 Windows 显示缩放 100/125/150/175/200 与多屏/混合 DPI 未验；非 1 DPI 为 CDP device-scale 模拟（不是真实系统缩放） |
| MB-055 | **DONE** | 旧 `pet-scale`/`text-scale` 一次性迁移、重置后不复活（scaling.test 断言）；旧“宠物缩放/文字大小”菜单两行移除，唯一“缩放…”入口 | — |

### E6 导航/设置/可发现性/无障碍

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-060 | **DONE** | `desktop-shell.ts` MENU_COACH（右键/Shift+F10/设置开启），一次性、同意后才出现；`tests/scaling-shell.test.ts` 断言 | — |
| MB-061 | **DONE** | `#pet` tabindex=0/role、菜单 roving tabindex/首项 focus/Escape/Tab 陷阱、气泡/摘要 aria-live；`tests/ui-shell.test.ts` 11 + scaling-shell；a11y CDP 8 项含真实焦点遍历 | — |
| MB-062 | **DONE** | `src/pet/content-window.ts`（280 行）+ Rust 独立 760×560 可缩放窗口（懒建、去重、focus、异步命令）；`tests/content-window.test.ts`；**快速开关 hub 竞态已修**（`content-runtime.ts` 只发布初始化完成 runtime + `tests/content-runtime.test.ts` 回归 + soak 复跑）；GUI CDP 760×560 无溢出 | 真实 Tauri 独立窗口截图证据仅 commit/历史记录 |
| MB-063 | **DONE** | `desktop_guard.rs`（384 行）：tray 显示/复位/退出、off-screen clamp、fullscreen 自动隐藏、单实例 focus；`tests/window-recall.test.ts` 10 项 + Rust 10 单测；提交 `21ccb0d` | 真实托盘/第二启动截图未归档 |
| MB-064 | **DONE** | 菜单 outside pointerdown/window blur/Escape 关闭；菜单在 body 层、modal inert 不穿透；hit-regions 白名单含 `#pet-shell-menu`/dialogs，`main.ts` 启 `startHitRegionSync()` | — |
| MB-065 | **DONE** | 统一设置弹窗：显示菜单按钮/静音/音量/减少动态/复位窗口/保存/读取/安静时段/健康/AI 标识/缩放/内容中心/Advisers/关于/TTS/撤回/删除全部/组件缩放；`desktop-shell.ts` | — |
| MB-066 | **DONE** | 设置弹窗声音与语音组：静音/音量/PTT/ASR 声明/语音缓存/改名/模型入口；aside.panel 隐藏程序桥静态锁；控件清单行为测试 | 物理删除 aside 需另开任务 |
| MB-067 | **DONE** | 删除产品「完整面板（开发/E2E）」入口与 debugMode/debugShellFromSearch；工具页产品入口指向 setup；dist grep 0 次；桌面壳零常驻按钮保持 | 无 |

### E7 低打扰/健康/同意/危机

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-070 | **DONE** | `src/pet/low-disturb.ts`（348 行）：22:00–08:00 默认开、持久化、损坏回退、安静时段主动输出=0；`tests/low-disturb.test.ts` 6 + `quiet-hours-settings.test.ts`；提交 `2bd2a5d` | 插件侧低打扰不在本仓（LOW-DISTURB §9-1） |
| MB-071 | **DONE** | `src/pet/reduce-motion.ts`（249 行）：系统偏好默认、显式覆盖、hero canvas rAF 冻结、四游戏页 CSS、跨窗口 storage 同步；`tests/reduce-motion.test.ts` 5 + a11y reduced-motion CDP 检查 | — |
| MB-072 | **DONE** | `src/pet/health-reminder.ts`（501 行）：2h 状态机、隐藏不停计时、重启保留、10 分钟延后、休息重置、跨窗 claim；`tests/health-reminder.test.ts` 9 | 真实 2h 挂机未验 |
| MB-073 | **DONE** | 同意弹窗关键事实层：`consent/modal.ts` `consent-key-facts`（5 条短句、正文之上、非滚动区）+ 字号/对比度常量 + 全文可滚动；`tests/consent-bypass.test.ts`（D6 顺序/可读性）+ `consent-static.test.ts` 断言；提交 `b794bee` | 专项低视力/真机复跑未做；实际对比度已在 a11y CDP 检查（167 元素 0 违规） |
| MB-074 | **DONE** | D6：首启不采集年龄；年龄自报仅在进入 18+ roleplay 入口或 About 主动核验时采集；decline 只阻断该入口；`consent/gate.ts` + consent-static/age 测试；提交 `b794bee` | owner 文案/律师意见仍缺（MB-120） |
| MB-075 | **DONE** | `filterProactiveLine()`（仅 ambient/主动输出）+ `LEGACY_SOFT_COPY_INVENTORY` 静态门；`tests/low-disturb.test.ts` 扫描改写项消失/允许项存在；提交 `2bd2a5d` | — |
| MB-076 | **DONE** | `src/pet/ai-label.ts` + `pet.html #bubble-ai`：每次 AI 回复显示“AI 生成·不是真人”，TTS 播放切换“AI 语音·合成”；`tests/ai-label-surface.test.ts` 3 + `ai-label.test.ts` | — |

### E8 远程市场与传输

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-080 | **DONE** | `content-market.ts`：catalog v0.2（serial/expires/offlineGraceSeconds/retry backoff+jitter+Retry-After/rateLimit/mirrors）+ 最高 serial 防回滚持久化 + 有界缓存 + 稳定失败码；`tests/content-market.test.ts` 47 例（含 v0.2/过期/宽限/重试/限流/镜像/legacy 0.1 拒绝用例）；设计 §11.16 | 生产未接服务器；真实网络矩阵未跑（全部注入 transport）；无字节级下载进度（协议无回调） |
| MB-081 | **DONE** | `app/tauri/src-tauri/src/market.rs`（1109 行）：HTTPS-only、拒绝 loopback/private/link-local/reserved、DNS pinning、≤3 same-host redirect、8s 总预算、64 MiB 上限、无凭据/自定义鉴权头；20 个 Rust 单测；`market-transport.ts`（467 行）+ `tests/market-transport.test.ts`；提交 `6473104`/`21ccb0d` | 生产未接线；真实服务器不存在 |
| MB-082 | **PARTIAL** | trust root active/retired/revoked + notBefore/notAfter 校验（`content-library.ts` 799/4831+）；catalog serial envelope 持久化防回滚（content-market）；测试覆盖 | 生产注入根装配未做（`native/dlc-verify/trust/production-trust-root.json` `keys: []`）；轮换/吊销 ceremony/流程未演练 |
| MB-083 | **BLOCKED-EXTERNAL** | 设计到契约：`docs/design/CONTENT-MARKET-2026-11-19.md` §10.3/§11/§11.16；无服务端 catalog/审核后台/签名流水线/多市场 | 外部服务器 + 运营 + 审核人员 |
| MB-084 | **DONE** | `content-hub/market-install.ts`（1173 行）：staged progress（catalog/download/verify/install）、取消（AbortSignal）、可重试失败恢复、离线保留上次已验证目录、卸载二次确认、每包版本锁 + 有界 versioned storage；`tests/content-hub-market-install.test.ts` 39 例；UI 默认 `unconfigured`、零网络 | 真实服务器/端到端下载安装未接线；无字节级进度；安装落盘依赖注入 host（未注入时拒绝下载） |
| MB-085 | **BLOCKED-EXTERNAL** | 无支付/退款/地区/年龄门/税务/法务实现；D1 商业路线未裁定（默认 A 研究原型） | 外部商业/法务/支付 |
| MB-086 | **DONE** | `market-transport.ts`：transport 宿主注入默认 null、无 `globalThis.fetch`/`window.fetch`/`self.fetch`/XHR/WS、无产品 import；`tests/market-transport.test.ts` + content-market 静态门；CONTENT-MARKET §11.15 v4；提交 `6473104` | — |

### E9 发布身份/签名/供应链

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-090 | **BLOCKED-EXTERNAL** | `native/dlc-verify/trust/production-trust-root.json` → `keys: []`；`packs/farm-seasons/signature.txt`、`packs/reef-pack/signature.txt` 仍 legacy；STATUS `dlc: excluded from C1` | owner 离线密钥 ceremony + 注入公钥 + 重签两个 pack |
| MB-091 | **PARTIAL** | C1 unsigned 通道/证据/状态字段就绪：`release-evidence` unsigned 显式、STATUS `signing: unsigned`；本机 Windows 构建实测 NotSigned；`release-sign.mjs --plan` 在 ci；C1 bundle verify 通过（f7ae511） | 无 SHA256SUMS 外层 detached 签名/attestation 产物；C2 需 OV Authenticode 证书（BLOCKED 外部） |
| MB-092 | **PARTIAL** | `docs/plan/ADR-UPDATER-2026-11-20.md`：默认不做（C1 无 updater）；方案 B（Tauri updater + minisign）的前置/密钥 ceremony/回滚/防降级/验收已定义；`tauri-plugin-updater` 未引入（测试断言） | D2 owner 未拍板；实现未启用（默认 no）；C2 证书/密钥/托管端未就绪（外部） |
| MB-093 | **PARTIAL** | `docs/plan/ADR-IDENTITY-MIGRATION-2026-11-20.md`：目标 Famling/`com.perrylink.famling`；AppData（Roaming）+ WebView2 profile（Local）+ 安装目录迁移算法、回滚、e2e 隔离守卫“先改逻辑”、发布窗口计划；C1 身份未改（`tauri.conf.json`/`package.json`/`Cargo.toml` 事实断言进测试） | 迁移执行 = C1 后独立发布窗口任务（需 scripts/Rust/e2e/证据同批） |
| MB-094 | **DONE** | 4 个 workflow 的外部 action 全部 SHA pin；`osv-scan.yml` + `osv-scanner.toml`（7 advisory/6 包时间盒例外，npm=0）；`native/dlc-verify` clippy `-D warnings` 硬门（本机绿）+ fmt 增量硬门 + 全树 advisory 基线；插件 `prepack`/`repository`/`check-package`/`verify:package` 落地（19 files/5 exports）；`tests/e9-supply-chain-update.test.ts`；提交 `b794bee` 及后续 | 真实 CI 首跑仍需 remote（外部，归 MB-001） |
| MB-095 | **DONE** | `docs/plan/REPRODUCIBLE-BUILD-2026-11-20.md`：C1 明确把 PE/NSIS/MSI bit-for-bit 标为非目标；承诺范围 = 输入钉扎 + SOURCE_DATE_EPOCH + 打包层可复现 + `repro-check --compare`；`repro-check --check-inputs` 实测 ok；允许/禁止措辞表 + 测试断言 | 若 C2/C3 要 PE 可复现，另立 MB-095b（成本 2–4 人日） |

### E10 架构/代码/资产管线重构

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-100 | **DONE** | main.ts 4115→2486 行（≤2500）；save-runtime/save-host/content-runtime/hero-page/settings-page 已抽出并接线；相应行为/静态测试全绿 | 无 |
| MB-101 | **DONE** | content-hub.ts 1389→584 行；initContentHub 983→182 行；7 个 dialog/controller 子模块；barrel API 身份不变；content-hub 29 例 + 4 套件 167 例 | 无 |
| MB-102 | **DONE** | 删除 `src/pet/anim/idle.ts`（IdleAnimationScheduler）及 `prng.ts`/`bubbles.ts`/`interactions.ts` 死代码；behavior.json 为动画状态/优先级/ambient 调度唯一源（`tests/anim-timing-single-source.test.ts` 断言） | — |
| MB-103 | **DONE** | `src/pet/anim/timing.json` 单源 → `clips.ts`/`timing.ts` + 3 个 Python 生成器（经 `scripts/anim_timing.py`）；`scripts/anim-timing-check.ts` 4 向漂移门（TS/manifest/Python/生成物 --check）；`tests/anim-timing-single-source.test.ts` 6 例 | 依赖 python 的检查在无 python 环境条件 skip |
| MB-104 | **PARTIAL** | 插件动画数据已由 `embed-anims.mjs` 从 famling manifest/regions 生成并按 `--check` 冻结（插件 200 tests 含 stale 检查）；animation timing/behavior 绑定有测试（MB-103） | behavior.json（ambient 权重）与 regions.json 仍手写；插件 `EVENT_CLIPS` 仍手冻常量；无“角色/动作数据→插件常量”单源生成器 |
| MB-105 | **DONE** | src/security/rate-limit.ts 共享叶模块；pet/security 仅 re-export；voice 改 import shared；tests/dependency-direction 7 例 | kernel→pet limits 相邻债务另列 |
| MB-106 | **DONE** | 删除 app/electron 6 文件与 electron 依赖/脚本；release profile 3 页/demo 9 页+后置门；tests/release-build-profile；E10-MB106 报告 | README/NOTICE/legal 镜像仍列 Electron（文档清理 follow-up） |
| MB-107 | **DONE** | 插件 gen-content-constants 从 famling 单源生成 client.js 两个 @generated 块；check-jsdoc/typecheck/checkJs；216/216、release:check 全绿、entry 94.7 KiB | 包根 tsconfig 未加；content-extension 全量 checkJs 归 MB-108 |
| MB-108 | **PARTIAL** | STATUS 生成 + `docs-check.mjs` 26 项（含 clean-checkout/coverage/claims 门）；`gen-status` 已是单一真值门 | scripts/generators/文档/i18n 全面收敛未做；`SHARED-CONTENT-SEMANTICS` 文档已滞后于 v3 合规字段代码（属文档同步） |

### E11 QA/性能/可观测

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-110 | **PARTIAL** | fake DOM harness + 模块级行为测试丰富；main.ts 拆出 save/content/hero 后可测；`tests/e11-main-data-chain.test.ts`（881 行，AST 抽取 main.ts save/load/exit 链）+ `e11-save-host-behavior` + `content-runtime` + `hero-page`(27)；真实浏览器 GUI smoke 5 场景 | **0 个测试 import main.ts boot**；仍无 jsdom/Playwright；至少 8 个测试文件仍用 `readFileSync` 直接读 `src/pet/main.ts` 源码文本（另有静态断言引用）；boot 路径无行覆盖 |
| MB-111 | **PARTIAL** | 覆盖率脚本/基线/20 关键模块/advisory CI 步骤（task-97/104）+ 20 条 gap tests + main.ts 缺口专文；`tests/coverage-gate.test.ts`/`e11-coverage-ci.test.ts`；当前 20 关键模块 18 loaded、avg lines 80.58（loaded-only 89.53） | 仍是 advisory（mode 未 enforce）；`main.ts`/`setup-page.ts` 0%；`consent/runtime.ts` 16.93%、`consent/modal.ts` 47.83%；`release.yml` 不跑 `npm run ci`；无 remote |
| MB-112 | **DONE** | `tests/save-runtime.test.ts` 最后 10 例即 MB-112 故障矩阵：坏主档/备份、恢复 TTL、IPC hang、IPC timeout、ENOSPC、只读存储、写中途 kill、legacy 迁移失败、超大档保存；`save-host`/`e11-save-host-behavior` 补 host 行为 | 真实 OS 级磁盘满/只读未在 Tauri 实机注入 |
| MB-113 | **PARTIAL** | 短时 soak harness（真实 Chrome/CDP）：60s=62.2s/20 循环、5 场景 20/20、0 异常、rAF p50 57.2fps、heap 峰值 12.1MB、gate 全 PASS；120s/34 循环复跑 PASS；`tests/soak-short.test.ts` 13 例；`docs/plan/SOAK-SHORT-E11-2026-11-20.md` | `artifacts/bench.json` 仍是 2026-11-11 旧数据；无当前 HEAD 完整 rAF/draw/readback/启动/内存/DPI 基线；**无 24h 原生 soak**（需 Windows 真机） |
| MB-114 | **PARTIAL** | GUI CDP smoke 5/5（一次性 profile、临时端口、结束后清理、不碰真实用户目录）+ report/PNG；Tauri E2E 有临时 `DG_QA_DATA_DIR`、appdata 哈希前后断言、fail-closed、finally 清理 | Tauri E2E 仍固定 CDP 端口 9333（`scripts/cdp-launch.ps1`）；E2E 结果 JSON 未归档为提交证据；当前 HEAD 的真实 `%APPDATA%` 全流程未复跑 |
| MB-115 | **PARTIAL** | C1 unsigned 演练已真实发生：Windows Tauri release build + NSIS + portable zip + `release-win --verify` 2/2 + release-evidence C1 bundle verify（f7ae511）；插件 `verify:package`（npm pack 预演）绿 | 无 git tag；无 signed/signed-unsigned 对照演练；无真实 CI 产物对比（无 remote） |
| MB-116 | **DONE** | 真实 Chrome/CDP a11y 门禁 8/8 检查 PASS（对比度/焦点/aria/live region/reduced-motion 媒体模拟；167/6/43/60/222 个文本元素 0 违规）；`scripts/a11y-cdp-check.mjs` + `a11y-contrast-baseline.json` + 2 tests；task-115 修 3 个缺口，剩 1 个已知缺口（range 键盘待真机复核）；`docs/plan/A11Y-E11-2026-11-20.md` | 不是 axe 全规则替代；不接入 `npm run ci`（需可信浏览器）；真实 Tauri/WebView2 未验 |

### E12 内容/法务/运营

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-120 | **BLOCKED-EXTERNAL** | `docs/legal/LAWYER-REVIEW-CHECKLIST-2026-11-19.md`（DRAFT，20 个 LQ，明确“律师审查暂缓、无外部意见”）；`node scripts/legal-check.mjs --strict` → 16 blockers/16 warnings，exit 1；`docs/legal/APPROVALS.md` 有效批准 0 行 | owner/律师；不得称“已审核/已合规” |
| MB-121 | **PARTIAL** | `docs/legal/TAKEDOWN-AND-REPORTING.md`（DRAFT：举报/下架/反通知）、`CONTENT-POLICY.md`、内容包 license/AI provenance 声明门 | 无应用内举报/下架/申诉入口与处理工作流；第三方内容审核后台未做；文档仍 DRAFT |
| MB-122 | **PARTIAL** | `docs/ADVISERS-FACE-INTEGRATION.md`（v0 只读 Pet Brief 桥）、`docs/contracts/pet-brief/*`（fixtures/testcases）、`tests/pet-brief-consumer.test.ts`、`docs/PET-PRIVACY.md`；插件 `__DSH_FAMLING_BRIDGE__` 预留 | 两端一致性以文档+测试冻结为主；插件桥未实现双向；无真实 DSH 联调 |
| MB-123 | **BLOCKED-EXTERNAL** | 无市场运营（上架规则/版本/回滚/客服/退款）；商业路线未开 | 外部 |
| MB-124 | **PARTIAL** | `scripts/playtest-kit.mjs` + `docs/PLAYTEST-PROTOCOL.md`/`COMPANION-PLAYTEST.md`；kit 内是 2026-11-14 旧 portable 包 | 无自愿回访/低打扰/删除率指标采集或看板；不做依赖/付费关系指标（符合红线） |

---

## 3. 真正剩余（按依赖顺序）

### 3.1 E4 剩余（解锁“第三方角色包可安装/可审核”的最后一公里）

1. **Tauri/Node 文件系统 host**：AppData 根、原子文件写、断电恢复、磁盘配额（当前持久化是 WebView2 IndexedDB；`character-store.ts` 明说它是 “browser half”）——归 MB-042；
2. **第三方审核工作流/举报/下架入口** + 生产信任根装配（Ed25519 key registry、吊销/有效期）——归 MB-043/MB-082；
3. 真实 Tauri 双窗演练（安装→启用→热切换→卸载回滚）与恶意 zip “无落盘”证据；
4. 音频预算/清权（MB-045）与 DPI/多屏（MB-046）。

### 3.2 E10 结构债（E11 行为测试的前置）

- MB-100：settings 拆分（当前并发任务在途、未提交）+ main.ts 目标 ≤2500（现 2808）；
- MB-101：`initContentHub` 仍 983 行（拆掉 1010 行主函数的目标未完成）；
- MB-104/105/106/107/108：behavior/regions/EVENT_CLIPS 生成、voice 依赖方向、Electron 删除、插件常量生成+lint、脚本/i18n 收敛。

### 3.3 E11 行为/性能/可观测

- MB-110/111：main.ts boot 行为测试（fake IPC + jsdom 或最小 DOM harness）；覆盖率 advisory→enforce；main.ts/setup-page.ts 行覆盖；
- MB-113：当前 HEAD 完整性能基线 + **24h 原生 soak**（需 Windows 真机）；
- MB-114/115：Tauri E2E 临时端口/产物归档、发布演练（tag/签名对照/CI 产物对比）。

### 3.4 E9 产品身份/updater/供应链（外部/owner 决策）

- MB-090 生产 DLC ceremony（外部 owner）与 MB-091 C2 证书（外部采购）；
- MB-092 updater：D2=yes 才实现；MB-093 身份迁移：C1 后独立发布窗口；
- MB-094 已落地（残余真实 CI 首跑归 MB-001）。

### 3.5 E8 服务器/支付

- MB-082 生产信任根注入/轮换；MB-083 服务端 catalog/审核/签名流水线（外部）；MB-085 支付/退款/地区/税务（外部，等 D1）。

### 3.6 E12 律师/法务/运营

- MB-120 律师复核（外部，owner 已暂缓）；MB-121 举报/下架/申诉入口与工作流；MB-122 插件桥/Pet Brief 两端一致性；MB-123 市场运营（外部）；MB-124 研究指标。

---

## 4. 为什么不能声称完成（逐条）

1. **数量上未完成**：85 项中 37 项非 DONE（27 PARTIAL + 5 TODO + 5 BLOCKED-EXTERNAL），严格完成率 56.5%。
2. **CI 不可自证**：无 git remote，Actions 从未运行，`ci-runs.json` 为空；本地 `npm run ci` 14/14 绿不能替代真实 CI run/branch protection。
3. **发布信任链未成立**：unsigned、无 tag、无证书、DLC 生产根 keys=0、两个 pack 仍 legacy 签名、updater 未实现、SHA256SUMS 无发布者外层签名；按 C2/C3 全部 fail-closed。
4. **市场/付费未成立**：无服务器/审核/支付；市场 UI 默认 unconfigured（协议 v0.2 只在本机注入 transport 下验证）。
5. **E4 仍有最后一块**：安装/热切换工程链路已接通，但生产 host 是 IndexedDB 而非 AppData FS、无审核后台、生产信任根 keys=0；“第三方角色可安装/可审核”仍不能对外声称。
6. **E10/E11 结构性债仍未清**：main.ts 2808 行、initContentHub 983 行、Electron 仍在、voice 依赖方向未修；覆盖率 advisory、main.ts 0% 行覆盖、0 个测试 import main.ts boot、无 jsdom/Playwright、无 24h soak。
7. **法务未闭环**：legal strict 16 blockers/16 warnings；APPROVALS 有效批准 0；律师审查暂缓；不得称“已合规/已审核/已清权”。
8. **真值门当前非全绿**：`docs:check` PASS（26 项），但 `status:check` 因并发工作树 dirty 计数漂移而红；提交前必须重生成 STATUS。
9. **测试数量的边界**：本机 1771/1771 pass 是工作树全量回归（A 级）；不等于“验收总门”通过——缺真实 CI、当前 HEAD Windows 干净 checkout、真实 `%APPDATA%` 哈希、24h soak、真实 Tauri GUI 复跑。
10. **B 级证据依赖**：A11Y/GUI/soak/DPI 矩阵/Windows CI/C1 构建分别产生于 `b1b88cd`/`b7582a6`/`43d5358`/`4e50b3d`/`1ff5bfa` 等时点；不能当成 `f7ae511` 的复跑。

---

## 5. 下一步顺序（Wave）

| Wave | 目标 | 任务 | 验收 | 外部依赖 |
| --- | --- | --- | --- | --- |
| **0（立即，0–1 天）** | 让当前真值可提交/可复核 | ① 提交本文件 + MASTER 状态段；② `npm run status` 重生成 STATUS 后同一提交，`status:check`/`docs:check` 双绿；③ 归档当前 HEAD 的 Windows 干净 checkout（`npm run ci:clean`） | 干净 checkout 双平台；STATUS `test-suite` 有真实数字；`ci-runs.json` 待 remote 后填 | 需要一次 commit（本任务约束下不做） |
| **0B（外部）** | 首次真实 CI | 建私有 remote + push + workflow_dispatch 首跑 + branch protection + 归档 run URL | Actions gate + clean-checkout 两 job 绿；`ci-runs.json` 非空 | owner/用户授权 |
| **1（1 周）** | E10 剩余 + E11 收敛 | settings 拆分（main ≤2500）、MB-104/105/106/107/108；覆盖率 enforce + main boot 行为测试 + 24h soak harness（Windows） | `main.ts` 行数/覆盖率数字进 STATUS；`coverage:check` enforce 绿；24h JSON 过阈值 | Windows 原生机（24h soak） |
| **2（1–2 周）** | E4 最后一公里 | Tauri FS/AppData host、审核工作流/举报入口、生产信任根装配、恶意 zip 无落盘演练 | 真实 Tauri 安装→启用→热切换→卸载回滚；无落盘证据；审核流程文档+UI | 无（密钥 ceremony 外部） |
| **3（外部）** | 发布/法务/市场 | C2 证书与签名、DLC ceremony、律师复核、市场服务器/审核/支付、市场运营 | release-evidence C2/`legal-check --strict` 清零或签字；真实市场 e2e | owner/律师/供应商/支付 |

---

## 6. 边界与维护

- 本文件是**执行对账**，不是发布批准、不是合规意见、不是 CI run 记录；不得引用为“已验收/可发布”。
- 快照：HEAD `f7ae511`；状态计数 = DONE 48 / PARTIAL 27 / BLOCKED-EXTERNAL 5 / TODO 5。
- 状态会随提交变化；每次 wave 结束后按以下命令复核后更新 §0.1/§2：`npx tsc --noEmit`、`npm test`、`npm run build`、`npm run ci`、`node scripts/docs-check.mjs`、`node scripts/gen-status.mjs --check`、`node scripts/legal-check.mjs --strict`、插件 `npm test`；真实浏览器门禁按需跑 `node scripts/gui-cdp-smoke.mjs`、`node scripts/a11y-cdp-check.mjs`、`node --import tsx scripts/soak-short.ts`、`node scripts/scale-dpi-verify.mjs`。
- 本任务边界：未改任何代码/测试/资产/Rust/插件；未 commit/push；对账期间并发任务的工作树改动未纳入判定；`node_modules` 平台绑定修复属环境态（已 gitignore）。
- 复跑基线：HEAD `f7ae511`（`git rev-parse --short HEAD`）+ 本机 WSL2/Node v24.22.1；本文件写入时工作树含并发任务未提交改动，提交前需重生成 STATUS。

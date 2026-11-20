# EXECUTION-STATUS-2026-11-20 — 总清单执行对账（85 项）

> 性质：**只读执行对账**。不改代码/资产/Rust/插件，不 commit、不 push；唯一写入 = 本文件 + `MASTER-BACKLOG-2026-11-19.md`（顶部状态段 + §5.1 终态门）。
> 对账快照：`desktop-games` HEAD **`fe7f568`**（2026-11-20 13:48 +08，`feat: in-app content reporting and takedown entry`）；相对上一版快照 `f7ae511` 推进 **9 个提交 / 158 文件 / +18751 −3424 行**。上一版终态重分类（task-134）记录于 `0a5bc0b`（docs-only）；本版（round11）关闭 A 组 8 项。
> 工作树：本轮对账时未提交改动仅 `docs/art/**`、`docs/research/**`（代码/测试/资产均已提交；MB-121 随 `fe7f568` 提交），另有本文件与 `MASTER-BACKLOG` 的 docs-only 改动；对账期间无并发代码写入。
> 插件工作树：`plugins/dsh-famling` **0.10.10**（目录无 `.git`；本机 **245/245 tests** 绿（2026-11-20 round11 复跑）；`package-lock.json`（lockfileVersion 3，root-only）与 vendored `scripts/spec/anim-spec.json` 已就位；clean-checkout 独立重建门 `ok:true`（0 fail / 10 个声明的跨仓 skip）。不是提交/发布证据）。
> 输入：`MASTER-BACKLOG-2026-11-19.md` 85 项、五份 triage、`docs/STATUS.md`、`docs/plan/` 下全部专项文档（E0/ADR/COVERAGE/A11Y/SOAK/GUI-SMOKE/CONTENT-WINDOW/SUPPLY-CHAIN/REPRO/SAVE-RUNTIME 等）、当前 HEAD 代码/测试、本机复跑。
> 状态词：**DONE** = 验收项在当前代码有实现且有测试/可复核证据；**PARTIAL** = 主功能已落地但验收项缺一块（接线/UI/真实证据/外部条件）；**BLOCKED-EXTERNAL** = 剩下的验收必须由 owner/法务/证书/服务器等外部动作解除，工程侧无剩余可独立推进项；**TODO** = 未开始。
> 计数口径：本版 §0.1 与 §2 逐行统计一致（上一版 §0.1 与 §2 存在漂移；本版已按行重算）。
> **round11 A 组清收（2026-11-20，docs-only 对账）**：§0.5 的 **A 组 8 项全部 DONE**（MB-004/041/104/108/110/111/114/121，逐项证据见 §2），**B 组 12 项 C1-ACCEPTED、C 组 7 项 C2-PREREQ 不变**。§0.1 计数升为 **DONE 66 / PARTIAL 13 / BLOCKED-EXTERNAL 6 / TODO 0**（严格 77.6%、加权 85.3%）；非 DONE **19 项 = A 0 / B 12 / C 7**。**B/C 仍不改为 DONE、不计入完成率。**

---

## 0. 一页结论

### 0.1 状态计数（85 项全量，按 §2 逐行统计）

| 状态 | 数量 | 占比 | 权重口径 |
| --- | ---: | ---: | --- |
| DONE | **66** | 77.6% | 1.0 |
| PARTIAL | **13** | 15.3% | 0.5（仅作趋势参考，不计入“完成”） |
| BLOCKED-EXTERNAL | **6** | 7.1% | 0（外部未解除） |
| TODO | **0** | 0.0% | 0 |
| 合计 | **85** | 100% | — |

- **严格完成率：66/85 = 77.6%**（上一版 68.2%；本轮 +8 DONE）。
- **已触及率（DONE+PARTIAL）：79/85 = 92.9%**。
- **加权进度（DONE=1、PARTIAL=0.5）：72.5/85 = 85.3%**——只是趋势指标，**不是完成率**。
- round9 把 14 项升为 DONE：MB-011/012（存档恢复/抽离）、MB-033/034（v3 合规/能力协商）、MB-047（动画收尾）、MB-073/074（同意可读性/D6）、MB-080（市场协议 v0.2）、MB-084（安装 UI）、MB-094（供应链）、MB-102/103（动画单源）、MB-112（故障注入）、MB-116（无障碍自动化）；MB-104 由 TODO 升 PARTIAL。**没有把任何 DONE 降级**。
- round10（`ea27357`）再升 6 项：MB-014（插件 consent v2）、MB-032（共享 compliance fixtures）、MB-066/067（设置控件归位/dev 门清理）、MB-100（settings 拆分，main 2486 行）、MB-101（content-hub init 拆分，initContentHub 182 行）→ round10 后 58 DONE。
- **round11（`d350444`/`fe7f568`）再升 8 项**：MB-004（插件独立 LOCK/clean-checkout）、MB-041（内置角色热切换不再 reload）、MB-104（behavior/regions 生成单源）、MB-108（scripts/文档/i18n 收敛）、MB-110（main boot 行为测试）、MB-111（覆盖率 enforce + 入口豁免）、MB-114（E2E 临时端口/结果归档）、MB-121（应用内举报/下架入口）→ **66 DONE**。**没有把任何 DONE 降级。**

### 0.2 结论：现在仍不能声称“总清单完成”

85 项里仍有 **19 项不是 DONE**（13 PARTIAL + 6 BLOCKED-EXTERNAL；按 §0.5 终态分为 **A 0 / B 12 / C 7**）。**C1 仍开放的工程项已清零**：A 组 8 项（MB-004/041/104/108/110/111/114/121）已于 round11 全部关闭（逐项证据见 §2）。**B 组 12 项**工程侧已完成、终态验收被外部（remote/CI、证书、真机、24h、密钥 ceremony）或宿主条件（Tauri FS host、真实 DSH 联调）锁住，按 C1-ACCEPTED“带限制接受”处理；**C 组 7 项**属 C2/C3/商业运营目标，不构成 C1 门禁。因此：

- **C1 邀请 beta 验收仍不能声称通过**：工程侧 A 组已清零（C1 candidate 的工程阻断解除），但验收仍缺 **B 组外部真实证据**（真实 CI 绿/当前 HEAD 的 Windows 干净 checkout（B/MB-001）、真实 `%APPDATA%` 全流程（B 宿主限制）、24h 原生 soak（B/MB-113）、真实 Tauri 窗口/托盘/DPI 复跑（B/MB-054））与 **C 组如实披露**（法务 strict 16 blockers、律师未介入；C/MB-120）。真值门当前亦非全绿：`docs:check` 的 status-commit 需在提交轮重生成 `docs/STATUS.md` 后复核。
- **不能声称已签名、含 DLC、可公开发布或市场已上线**（生产 DLC 信任根 keys=0、两个 pack 仍 legacy 签名、无 Authenticode 证书、updater 默认不做且未实现、无 tag、无市场服务器/审核后台/支付）。
- **不能声称 CI 绿**（仓库仍无 remote，Actions 从未运行；`docs/plan/ci-runs.json` 为空）。本地 canonical gate `14/14` 绿只是本地证据。
- **不能声称第三方角色包“已上市/已审核”**：安装、启用、热切换、卸载、回滚的**工程链路已接通并有测试**（这是本轮最大变化），但**生产 host 是 WebView2 IndexedDB 而非 AppData 文件系统**、无审核后台、生产信任根 keys=0。
- **不能声称“无障碍已达标”**：自动化门禁 8/8 通过，但仍有 1 个已知缺口（CDP 下 range 键盘行为待真机复核），且不是 axe 全规则替代品。
- **不能声称插件“已发布”**：插件 0.10.10 功能与 245/245 测试都在工作树（2026-11-20 round11 复跑），`package-lock.json` 已就位，但目录无 `.git`；npm 打包元数据/prepack 已就绪（可作为“可打包”证据，不是“已发布”证据）。

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
| **角色包运行时** | 注册表 + 渲染适配器 + 安装 UI + 内置/已安装角色包热切换 | **DONE ×5 + PARTIAL ×2 + BLOCKED ×1**（040/041/044/046/047 DONE；042/043 PARTIAL；045 BLOCKED-EXTERNAL） | `character-packs.ts` 1611、`character-pack-renderer.ts` 1057、`content-hub/character-installer.ts` 1515 + character-store；`hero-page.ts` 热切换/首帧门/回退；**`content-runtime.ts` 内置角色切换改为 hotSwap（不再 persist+reload，3 例）**；content window apply 事件跨窗同步；42+28 测试 | 持久化用 IndexedDB 而非 AppData FS（B/MB-042）；无审核后台（C/MB-043）；生产信任根 keys=0（B/MB-082）；真实 Tauri 双窗人工演练未归档 |
| **Rust 市场传输** | 受限下载器 + IPC 桥 + 静态门完成 | **DONE**（MB-081/086） | `market.rs` 1109 行 + 20 Rust 单测；`market-transport.ts` 467 行 + tests；HTTPS-only/私网拒绝/redirect/8s/64MiB | 生产未接线；真实服务器不存在 |
| **市场协议/安装 UI** | catalog v0.2 + staged 安装/取消/重试/离线/卸载/版本锁 | **DONE**（MB-080/084） | `content-market.ts` +47 测试；`content-hub/market-install.ts` 1173 + 39 测试；UI 默认 unconfigured/零网络 | 无真实服务器/字节级进度/端到端下载安装 |
| **低打扰/健康/同意** | quiet hours/健康提醒/reduce-motion/AI 标识/文案过滤 + 同意可读性 + D6 | **DONE ×7**（MB-070–076） | 5 个模块 + tests；`consent/modal.ts` 关键事实层；`consent/gate.ts` age-gated；`consent-bypass`/`consent-static` 断言 | 插件侧低打扰不在本仓；真实 2h 挂机未验 |
| **托盘/单实例** | tray 召回/复位/退出、单实例 focus、离屏 clamp、全屏隐藏 | **DONE**（MB-063/013） | `desktop_guard.rs` + Rust 单测；`tests/window-recall.test.ts` 10 | 真实双开/托盘截图未归档 |
| **数据隔离/存档** | QA 数据目录 + reset-saves fail-closed + 哈希快照 + save-runtime/恢复面板/状态迁移 | **DONE ×6**（MB-010/011/012/013/014/015 全 DONE；MB-014 插件 consent v2 由 round10 关闭） | Rust `DG_QA_DATA_DIR`；`save-runtime` 21 例故障矩阵；`save-recovery-panel` 17；`state-migrations` 25；插件 consent v2 227 tests + cross parity | 真实 Tauri E2E JSON 未归档（B/MB-001/113 外部类）；不得称真机全流程已验 |
| **CI** | 本地 canonical gate 14/14 绿；真实 CI 仍 blocked | **PARTIAL**（MB-001；002/003/006 DONE） | 本机 `npm run ci` = 14 passed/0 skipped/102.7s；`ci-clean-final-f7ae511`（Linux git-archive）green；Windows 1ff5bfa `npm run ci` 14/14 | 无 remote/branch protection/首次真实 run |
| **共享语义/插件适配** | 23 面单源 + 双端 parity + v3 合规字段 + hello/probe + 共享 compliance fixtures | **DONE ×5**（MB-030/031/032/033/034 全 DONE；MB-032 fixtures 由 round10 关闭） | SHARED 文档；famling parity 12 + 插件 parity 13；compliance fixtures 16 文件/17 case；`content-extension-compliance` 10 例；`host-bridge` 25 例 | wire 仍是手写冻结；SHARED 文档已同步 v3 合规字段（MB-108） |
| **插件安全地板** | 危机短路/发送去向/首启卡/清除/撤回/聊天开关 + 发布卫生 | **DONE ×5**（MB-020–024） | 插件 0.10.10：245/245 tests（2026-11-20 round11 复跑）；`verify:package`/`check:package` 绿；`prepack`+`repository` 元数据 | 插件仓无本地 `.git`；不能作为发布证据 |
| **法务文档** | 文档事实同步 + 应用内举报/下架入口 + 律师复核清单；律师未介入 | **DONE ×1 + PARTIAL ×2 + BLOCKED ×1**（MB-121 DONE（举报入口/issue template/11 tests）；122/124 PARTIAL=B；120 BLOCKED=C） | `src/pet/content-reporting.ts`（678 行）+ 设置/关于入口 + `.github/ISSUE_TEMPLATE/content-report.yml` + `docs/legal/CONTENT-REPORTING.md`；`tests/content-reporting.test.ts` 11 例；`legal-check --strict` 仍 16 blockers/16 warnings | 无后台/自动处理；律师未介入、无生效条款/清权；不得称“已合规/已审核” |

> 2026-11-20 round11 按 §2 校正 §0.4：角色包运行时（MB-041）、共享语义（MB-108 文档同步）、法务文档（MB-121）与插件安全地板测试数同步关闭；A/B/C 归类只对法务行保留。

### 0.5 剩余 19 项终态分类（round11 后；A 组已清零）

> **本表是对 §2 既有状态的终态标注，不是新增完成计数。**
> - **A = C1-OPEN（0 项）**：round11 已清零；A 组关闭前不能称 C1 验收通过，现工程阻断已解除，但 C1 验收仍受 B/C 与真值门限制。
> - **B = C1-ACCEPTED**：工程侧已完成、有本地证据，但终态验收被外部动作/真机/24h/宿主条件锁住；C1 按“带限制接受”处理。**C1-ACCEPTED ≠ DONE**，不得写成 DONE/已验收。
> - **C = C2-PREREQ / 非 C1 目标**：属 C2/C3 发布或商业/运营路线；**不计入 C1 门禁**，但同样不得声称完成/已合规/可上市。
> - 三组之和 = §0.1 的 **19 项非 DONE**；**§0.1 计数 = DONE 66 / PARTIAL 13 / BLOCKED-EXTERNAL 6 / TODO 0**。

| 组 | 终态 | 项数 | 当前状态构成 | 对 C1 的含义 |
| --- | --- | ---: | --- | --- |
| A | C1-OPEN（继续工程收口） | **0** | — | **已清零**：8 项全部 DONE；工程阻断解除（见 §0.5.1） |
| B | C1-ACCEPTED（工程完成/验收外部锁） | 12 | PARTIAL 12 | **不阻断但必须披露**：逐项列已知限制与外部解锁条件；不得称 DONE/已验收 |
| C | C2-PREREQ / 非 C1 目标 | 7 | PARTIAL 1 + BLOCKED-EXTERNAL 6 | **不计入 C1 门禁**；不得称已完成/已合规/可上市；转 C2/C3 或商业路线 |

#### 0.5.1 A 组（0 项，C1 仍开放工程已清零）

round11 已把原 8 项全部关闭（逐项证据见 §2）：MB-004（插件独立 LOCK + clean-checkout 重建）、MB-041（内置角色/渲染器热切换不再 reload）、MB-104（behavior/regions 生成单源）、MB-108（scripts/文档/i18n 收敛）、MB-110（main boot 行为测试）、MB-111（覆盖率 enforce + 显式入口豁免）、MB-114（E2E 临时端口/结果归档）、MB-121（应用内举报/下架/申诉入口）。

**A 组不再阻断 C1 candidate 冻结**；C1 的剩余披露/解锁项全部在 B 组、范围外项在 C 组（见 §0.5.2/§0.5.3）。原 8 项状态均为 PARTIAL，本轮不改变 B/C 任何一项状态。

#### 0.5.2 B 组（12 项，C1-ACCEPTED：工程完成/验收外部锁）

| ID | 当前状态 | 工程侧已完成（本地证据） | 外部锁 / 宿主条件 | C1 处理 |
| --- | --- | --- | --- | --- |
| MB-001 | PARTIAL | `npm run ci` 14 步 canonical gate 本机绿；ci.yml 只调用它；workflow_dispatch 就绪 | 私有 remote + branch protection + 首次真实 CI run（owner/用户授权） | 接受“本机 gate + 未跑真实 CI”，发布说明必须写“CI 未真实运行” |
| MB-005 | PARTIAL | release-evidence 链 + C1 bundle 4 文件 verify；Windows NSIS/portable 真实构建 sha256 | 无 git tag；SHA256SUMS 外层 detached 签名未实现 | 接受 unsigned 证据链；发布物显式 unsigned |
| MB-042 | PARTIAL | 安装事务/回滚/启用/卸载/版本目录 + browser host（IndexedDB/memory store）+ 42 测试 | Tauri/Node AppData 文件系统 host 未接线（当前 WebView2 IndexedDB） | 接受“浏览器半区持久化”为 C1 已知限制 |
| MB-054 | PARTIAL | CDP DPR 1/1.25/1.5/2 矩阵：28 截图/267 检查/failures=0 | 真机 Windows 显示缩放/多屏/混合 DPI 未验 | 接受模拟矩阵；不得称“真机多屏已验” |
| MB-082 | PARTIAL | trust root active/retired/revoked + 有效期校验；catalog serial 防回滚；测试 | 生产根装配/轮换/吊销 ceremony（`keys: []`） | C1 不装生产根、DLC 不进 C1；按未装配披露 |
| MB-091 | PARTIAL | C1 unsigned 通道/证据/状态字段；NotSigned 实测；release-sign --plan 在 ci | SHA256SUMS 外层签名/attestation 未实现；C2 需 OV Authenticode 证书（外部采购） | 接受 unsigned；不得称 signed |
| MB-092 | PARTIAL | updater ADR：默认不做、方案/回滚/防降级/验收已定义；未引入插件 | D2 owner 未拍板；C2 证书/密钥/托管端未就绪 | C1 不启用 updater（默认 no） |
| MB-093 | PARTIAL | 身份迁移 ADR：Famling/`com.perrylink.famling`、AppData/WebView2/安装目录算法、回滚、e2e 守卫 | 迁移执行 = C1 后独立发布窗口 | C1 身份不改（测试钉住现状） |
| MB-113 | PARTIAL | 短时 soak（真实 Chrome/CDP）：62.2s/20 循环、120s/34 循环、gate 全 PASS；13 测试 | 24h 原生 soak + 当前 HEAD 完整性能基线（需 Windows 真机） | 接受短时 soak 为 C1 证据上限；不得称 24h 已验 |
| MB-115 | PARTIAL | C1 unsigned 演练已真实发生：NSIS+portable+`release-win --verify` 2/2+bundle verify；插件 `verify:package` | 无 tag / signed 对照 / 真实 CI 产物对比 | 接受 unsigned 演练；不得称 signed/已发布 |
| MB-122 | PARTIAL | Pet Brief v0 只读桥 + contracts fixtures/testcases + consumer 测试 + 插件桥预留 | 插件双向桥未实现 / 无真实 DSH 联调 | 接受单向只读 v0 |
| MB-124 | PARTIAL | playtest kit + 协议文档 | 回访/低打扰/删除率指标依赖真实用户与运营排期 | 研究运营指标不阻塞 C1 工程；发布说明不作产品指标宣称 |

#### 0.5.3 C 组（7 项，C2-PREREQ/非 C1 目标）

| ID | 当前状态 | 为什么不是 C1 目标 / 前置到 C2 |
| --- | --- | --- |
| MB-043 | PARTIAL | 第三方审核/举报/下架工作流 + 生产 trust root 装配：C2 市场/第三方包前置；C1 不开放第三方包上市 |
| MB-045 | BLOCKED-EXTERNAL | 42 WAV 再分发权未清（D8）；未清权不进公开包；技术优化可先做，但不是 C1 门禁 |
| MB-083 | BLOCKED-EXTERNAL | 市场服务端 catalog/审核后台/签名流水线：C2 市场前置；C1 市场 UI 默认 unconfigured/零网络 |
| MB-085 | BLOCKED-EXTERNAL | 支付/退款/地区/年龄门/税务/法务：商业路线（D1 默认 A 研究原型）不属 C1 |
| MB-090 | BLOCKED-EXTERNAL | 生产 DLC 信任根 ceremony + 重签 pack：DLC 明确不进 C1 |
| MB-120 | BLOCKED-EXTERNAL | 律师复核/生效条款：C2 前置；C1 保持 DRAFT + 16 blockers 如实披露，不得称已合规/已审核/已清权 |
| MB-123 | BLOCKED-EXTERNAL | 市场运营（上架规则/版本/回滚/客服/退款）：商业运营不属 C1 |

**交叉核对**：A 0 + B 12（PARTIAL）+ C 1（PARTIAL）= **13 PARTIAL**；C 6（BLOCKED-EXTERNAL）= **6 BLOCKED-EXTERNAL**；合计 **19 = §0.1 非 DONE**。**A 组 8 项已升 DONE（§0.1 66），B/C 均不标 DONE。**

---

## 1. 证据与复跑（2026-11-20；§1.1 为上一版快照 `f7ae511` 的历史证据，round11 复跑见 §6.1）

### 1.1 本机实测（A 级：本轮直接复跑）

环境：WSL2 Ubuntu-24.04 x64，Node v24.22.1，npm 11.19.1，python3 3.12。以下为上一版快照 HEAD `f7ae511` 工作树的复跑记录（历史证据）；本轮复跑见 §6.1。（当时未提交改动仅 `docs/art/**`、`docs/research/**`；`src/`/`tests/` 与 HEAD 一致）。

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
| 插件 `npm test`（`plugins/dsh-famling`；f7ae511 时点 0.10.9） | **当时 200 tests / 200 pass / 0 fail / 0 skipped**（2026-11-20 终态重分类轮复跑为 0.10.10：227/227 pass） | 9 个测试文件；跨端 parity 在兄弟仓存在时实跑 |
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
| MB-004 | **DONE** | 插件 0.10.10：`package-lock.json`（lockfileVersion 3，root-only，1 locked package）+ vendored `scripts/spec/anim-spec.json`（208 帧 SHA 锁）；`scripts/clean-checkout.mjs` 独立 checkout 门实测 `ok:true`（无 `.git`/`node_modules`、`npm ci --offline`、0 fail、10 个声明跨仓 skip；embed standalone/verify/check/pack 全绿）；`test/clean-checkout.test.js` 2 例；插件 `npm test` **245/245**（2026-11-20 复跑）；`docs/INDEPENDENT-REBUILD-2026-11-20.md` | 插件目录仍无 `.git`（独立仓发布/CI 首跑不在本仓）；10 个跨仓 parity skip 是已声明限制（无兄弟私仓时跳过，不计失败） |
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

### E2 插件安全地板与口径（插件仓 `plugins/dsh-famling`，0.10.10，无 git）

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-020 | **DONE** | `index.js` `CRISIS_KEYWORDS`/`crisisKeyword()`：命中在任何模型调用前本地短路，固定资源（12356 心理援助 / 110 报警 / 120 急救 / 专业机构），不调 `ctx.llm.stream`、不回显原文；README 安全地板；插件 227/227 tests（2026-11-20 复跑） | 无提交证据（工作树 + 本机测试）；未接真实 DSH GUI 实测 |
| MB-021 | **DONE** | `client.js` AI 声明写明“文本经 DSH 发给你配置的模型供应商”；一次性首启卡（`dsh-famling/first-run/v1` + `createFirstRunNotice`） | 同上（工作树证据） |
| MB-022 | **DONE** | 设置「清除本机设置与同意」只删 `dsh-famling/*` 白名单；撤回 TTS/ASR 同意；插件 README/LEGAL 边界说明 | 同上 |
| MB-023 | **DONE** | `test/version-truth.test.js` 锁定 `package.json 0.10.10` ↔ client.js/client.content.js/README/LEGAL-NOTICE/locale 一致；插件 227/227 tests 绿（2026-11-20 复跑） | 同上；npm 分发链的“真实发布”仍无（MB-004） |
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
| MB-041 | **DONE** | 内置角色/渲染器切换改为 hero-page `hotSwap`（不再 persist+reload）：`src/pet/content-runtime.ts` 内置 role switch 直接热换 renderer，失败整体回滚（无静默 reload）；`hero-page.ts` hotSwap/restore（首帧门、失败保留旧场景）；`tests/hero-page.test.ts` 内置 hot switch 6 例（origami↔dog↔cat↔humanoid、失败保留、DLC 拒绝绕过同意）+ `tests/content-runtime.test.ts` 内置 role 热切换/失败回滚/无 reload 3 例；已安装包路径原有 28+42 测试不变 | 真实 Tauri 双窗人工演练未归档（工程验收由行为测试锁定）；持久化 host 限制归 B/MB-042 |
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
| MB-053 | **DONE** | 插件 0.10.10 `client.js` `<dsh-famling:scale>` 四层模型 + `test/client-scale.test.js`；插件 227/227 tests 绿（2026-11-20 复跑） | 插件无 git（同 MB-004） |
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
| MB-104 | **DONE** | 新增 `src/pet/anim/interactions/{dog,cat,human}.json` 母版（`famling.interactions/1`）+ `scripts/gen-character-interactions.mjs`（1017 行）生成 6 个 `behavior.json`/`regions.json`（迁移后逐字节不变，SHA-256 冻结）；`--check` 漂移门；`tests/character-interactions-single-source.test.ts` 10 例（单源再生成、规则派生、负向门、插件 EVENT_CLIPS 可再派生）；`docs/design/CHARACTER-INTERACTIONS-2026-11-20.md` | 无（插件 EVENT_CLIPS 已由 MB-107 生成并保持输入字节不变） |
| MB-105 | **DONE** | src/security/rate-limit.ts 共享叶模块；pet/security 仅 re-export；voice 改 import shared；tests/dependency-direction 7 例 | kernel→pet limits 相邻债务另列 |
| MB-106 | **DONE** | 删除 app/electron 6 文件与 electron 依赖/脚本；release profile 3 页/demo 9 页+后置门；tests/release-build-profile；E10-MB106 报告 | README/NOTICE/legal 镜像仍列 Electron（文档清理 follow-up） |
| MB-107 | **DONE** | 插件 gen-content-constants 从 famling 单源生成 client.js 两个 @generated 块；check-jsdoc/typecheck/checkJs；216/216、release:check 全绿、entry 94.7 KiB | 包根 tsconfig 未加；content-extension 全量 checkJs 归 MB-108 |
| MB-108 | **DONE** | i18n 单一源：famling `src/i18n.ts` 32 key + `scripts/i18n-check.mjs` 6 项 + `tests/i18n-convergence.test.ts` 8 例；插件 `scripts/check-i18n.mjs` 10 项（L 56/67、STRINGS 180/180）+ 245 tests；脚本清单 `SCRIPTS-INVENTORY` 104 文件 + `scripts/scripts-check.mjs` 9 项 + `tests/scripts-convergence.test.ts` 13 例；STATUS 生成排序修复 + `tests/status-generation.test.ts` 3 例；SHARED 文档同步 v3 合规字段；插件 content-extension checkJs 0 | README/NOTICE/THIRD-PARTY 的 Electron 文案与 `public/content/README` §3.5 仍为越权 follow-up（不在本项验收） |

### E11 QA/性能/可观测

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-110 | **DONE** | boot 抽到可 import 的 `src/pet/startup.ts`（334 行；无 CSS/模块级 DOM）+ `tests/e11-main-boot.test.ts` **11 例直接 import 生产状态机**（consent→boot 顺序、失败阻塞屏、retry-by-stage、in-flight 去重、content-shell、失败屏 fallback）；main.ts 2284 行（≤2500）；静态源码断言改为行为测试；GUI CDP smoke 5/5（`artifacts/gui-smoke/mb110-boot/report.json`） | 仍剩 34 个测试文件含 main.ts `readFileSync`（逐模块替换，属后续债务）；main.ts 行覆盖仍 0%（入口形态，entry-exempt，不宣称已覆盖） |
| MB-111 | **DONE** | `scripts/coverage-key-modules.json` `mode: enforce`：20 关键模块 = **18 enforced + 2 entry-exempt**（`main.ts`/`setup-page.ts` 仍测量并报 0%，显式豁免带 why）；`scripts/ci.mjs` 的 `coverage:check` 为 required（非 advisory）；ci.yml 归档 coverage 记录；`docs-check` 断言 required+enforce 配置；基线真实重设（`0a5bc0b`，dirty）；`tests/coverage-gate.test.ts` 15 + `e11-coverage-ci.test.ts` 9；本机 HEAD fe7f568 实测 `coverage:check` exit 0（1938/1938 tests、all files 92.57/79.00/87.80、enforced 18/18 avg 90.04、0 warning） | 原“main.ts/setup-page.ts 0% 行覆盖补齐”口径改为 **enforce + 显式入口豁免**（COVERAGE-GATE §6；仍 0%、不得宣称已覆盖）；`release.yml` 仍不跑 `npm run ci`；无 remote |
| MB-112 | **DONE** | `tests/save-runtime.test.ts` 最后 10 例即 MB-112 故障矩阵：坏主档/备份、恢复 TTL、IPC hang、IPC timeout、ENOSPC、只读存储、写中途 kill、legacy 迁移失败、超大档保存；`save-host`/`e11-save-host-behavior` 补 host 行为 | 真实 OS 级磁盘满/只读未在 Tauri 实机注入 |
| MB-113 | **PARTIAL** | 短时 soak harness（真实 Chrome/CDP）：60s=62.2s/20 循环、5 场景 20/20、0 异常、rAF p50 57.2fps、heap 峰值 12.1MB、gate 全 PASS；120s/34 循环复跑 PASS；`tests/soak-short.test.ts` 13 例；`docs/plan/SOAK-SHORT-E11-2026-11-20.md` | `artifacts/bench.json` 仍是 2026-11-11 旧数据；无当前 HEAD 完整 rAF/draw/readback/启动/内存/DPI 基线；**无 24h 原生 soak**（需 Windows 真机） |
| MB-114 | **DONE** | 固定 9333 全部移除：`scripts/lib/cdp-endpoint.mjs`（`DG_CDP_PORT`/临时端口、无回退）+ `cdp-launch.ps1` 内核分配端口/就绪轮询/精确清理 + `e2e-tauri.ps1` 逐用例临时端口且任何结局写 JSON（双写 `docs/plan/evidence/e2e-tauri-<head>-<UTC>-<channel>.json`）；真机 Windows/WebView2 debug 通道 **11/11 PASS**（11 个不同临时端口、真实 `%APPDATA%` 前后哈希一致、临时 QA 目录清理）；release 通道失败如实归档；`tests/e2e-port-randomization.test.ts` 8 例 | release 通道 11 用例仍 FAIL（`asset not found: index.html` + 生产 DLC keys=0，归 B/MB-090 等外部）；历史 `cdp-wv2-*` profile 清理待单独任务；不得称 release E2E 全绿 |
| MB-115 | **PARTIAL** | C1 unsigned 演练已真实发生：Windows Tauri release build + NSIS + portable zip + `release-win --verify` 2/2 + release-evidence C1 bundle verify（f7ae511）；插件 `verify:package`（npm pack 预演）绿 | 无 git tag；无 signed/signed-unsigned 对照演练；无真实 CI 产物对比（无 remote） |
| MB-116 | **DONE** | 真实 Chrome/CDP a11y 门禁 8/8 检查 PASS（对比度/焦点/aria/live region/reduced-motion 媒体模拟；167/6/43/60/222 个文本元素 0 违规）；`scripts/a11y-cdp-check.mjs` + `a11y-contrast-baseline.json` + 2 tests；task-115 修 3 个缺口，剩 1 个已知缺口（range 键盘待真机复核）；`docs/plan/A11Y-E11-2026-11-20.md` | 不是 axe 全规则替代；不接入 `npm run ci`（需可信浏览器）；真实 Tauri/WebView2 未验 |

### E12 内容/法务/运营

| ID | 状态 | 证据 | 剩余 / 说明 |
| --- | --- | --- | --- |
| MB-120 | **BLOCKED-EXTERNAL** | `docs/legal/LAWYER-REVIEW-CHECKLIST-2026-11-19.md`（DRAFT，20 个 LQ，明确“律师审查暂缓、无外部意见”）；`node scripts/legal-check.mjs --strict` → 16 blockers/16 warnings，exit 1；`docs/legal/APPROVALS.md` 有效批准 0 行 | owner/律师；不得称“已审核/已合规” |
| MB-121 | **DONE** | 应用内入口：`src/pet/content-reporting.ts`（678 行）+ 设置/关于 `举报与下架…`（desktop-shell/main/pet.html/pet.css）；本地模板复制/JSON 导出/仅点击才打开 GitHub 表单，**不自动上传/不持久化**；`.github/ISSUE_TEMPLATE/content-report.yml`（104 行）；`docs/legal/CONTENT-REPORTING.md`（USABLE PROCESS、人工处理/尽力而为）+ 公开镜像；`tests/content-reporting.test.ts` **11 例**（分类/导出/无网络/无自动上传/表单与字段同步） | 无审核后台/自动处理/自动恢复；公开问题表单的实际提交未端到端验证（无 remote）；律师复核归 C/MB-120；不得称“已合规/已审核” |
| MB-122 | **PARTIAL** | `docs/ADVISERS-FACE-INTEGRATION.md`（v0 只读 Pet Brief 桥）、`docs/contracts/pet-brief/*`（fixtures/testcases）、`tests/pet-brief-consumer.test.ts`、`docs/PET-PRIVACY.md`；插件 `__DSH_FAMLING_BRIDGE__` 预留 | 两端一致性以文档+测试冻结为主；插件桥未实现双向；无真实 DSH 联调 |
| MB-123 | **BLOCKED-EXTERNAL** | 无市场运营（上架规则/版本/回滚/客服/退款）；商业路线未开 | 外部 |
| MB-124 | **PARTIAL** | `scripts/playtest-kit.mjs` + `docs/PLAYTEST-PROTOCOL.md`/`COMPANION-PLAYTEST.md`；kit 内是 2026-11-14 旧 portable 包 | 无自愿回访/低打扰/删除率指标采集或看板；不做依赖/付费关系指标（符合红线） |

---

## 3. 真正剩余（按 C1 终态分类；逐项见 §0.5）

> 2026-11-20 round11 后，“剩余”仍按 **A（C1 开放工程）/ B（C1-ACCEPTED 外部锁）/ C（C2-PREREQ/非 C1）** 收口；**19 项**与 §0.1 非 DONE 一一对应（A 0 / B 12 / C 7）。

### 3.1 A 组：C1 仍开放工程（0 项，已清零）

**无剩余项。** 原 8 项已于 round11 全部 DONE（MB-004/041/104/108/110/111/114/121；逐项证据见 §2），C1 candidate 的工程阻断解除。B 组外部解锁见 §3.2，C 组范围外见 §3.3。

### 3.2 B 组：C1-ACCEPTED（12 项；外部/真机/24h/宿主锁）

> **不阻断 C1 candidate，但必须逐项披露“已知限制 + 解锁条件”；不得标 DONE。**

| 解锁类别 | 项目 | 外部/解锁动作 |
| --- | --- | --- |
| CI/发布授权 | MB-001 | 私有 remote + push + workflow_dispatch 首跑 + branch protection + 归档 run URL（owner/用户授权） |
| 签名/证据链 | MB-005、MB-091、MB-115 | C1 接受 unsigned；SHA256SUMS 外层 detached 签名/attestation 未实现；C2 需 OV Authenticode 证书（外部采购） |
| updater/身份 | MB-092、MB-093 | D2 owner 拍板；C2 证书/密钥/托管端；身份迁移在 C1 后独立发布窗口执行 |
| 生产信任根 | MB-082 | 生产 DLC 信任根装配/轮换/吊销 ceremony（owner 离线密钥）；C1 装空根、DLC 不进 C1 |
| 真机/长时 | MB-054、MB-113 | Windows 真机显示缩放/多屏；24h 原生 soak + 当前 HEAD 性能基线 |
| 宿主/联调 | MB-042、MB-122 | Tauri/Node AppData FS host 接线；插件双向桥 + 真实 DSH 联调 |
| 运营取样 | MB-124 | 真实用户回访/低打扰/删除率指标采集（运营排期） |

### 3.3 C 组：C2-PREREQ/非 C1 目标（7 项，不计入 C1 门禁）

- **C2 市场/第三方包前置**：MB-043（审核/举报/下架工作流 + 生产信任根装配）、MB-083（服务端 catalog/审核后台/签名流水线）；
- **C2 signed/私域前置**：MB-120（律师复核/生效条款；C1 保持 DRAFT + 16 blockers 如实披露）；
- **商业/运营路线**：MB-085（支付/退款/地区/税务）、MB-123（市场运营）；
- **DLC/清权**：MB-090（生产 DLC 信任根 ceremony；DLC 不进 C1）、MB-045（WAV 再分发权；未清权不进公开包）。

**C 组处理**：不阻断 C1，也不得反过来说“C 已完成”；转 C2/C3 或商业路线排期，详见 §0.5.3。

---

## 4. 为什么不能声称完成（逐条）

1. **数量上未完成**：85 项中 **19 项非 DONE**（13 PARTIAL + 6 BLOCKED-EXTERNAL；§0.5 终态 **A 0 / B 12 / C 7**），严格完成率 **77.6%**。A 组 C1 开放工程已清零；B 组 12 项为 C1-ACCEPTED（外部锁）；C 组 7 项非 C1 目标。
2. **CI 不可自证**：无 git remote，Actions 从未运行，`ci-runs.json` 为空；本地 `npm run ci` 14/14 绿不能替代真实 CI run/branch protection。
3. **发布信任链未成立**：unsigned、无 tag、无证书、DLC 生产根 keys=0、两个 pack 仍 legacy 签名、updater 未实现、SHA256SUMS 无发布者外层签名；按 C2/C3 全部 fail-closed。
4. **市场/付费未成立**：无服务器/审核/支付；市场 UI 默认 unconfigured（协议 v0.2 只在本机注入 transport 下验证）。
5. **E4 工程链路已完整接通**：安装/启用/内置与已安装包热切换/卸载/回滚均有测试（MB-041 round11 关闭）；**仍不能对外声称“第三方角色可上市/可审核”**——持久化是 WebView2 IndexedDB 而非 AppData FS（B/MB-042）、无审核后台（C/MB-043）、生产信任根 keys=0（B/MB-082）。
6. **E10/E11 结构债按 A 组验收已清**：main.ts 2284 行（≤2500）、initContentHub 182 行、Electron 已删、voice 依赖方向已修；MB-104/108/110/111 关闭。**边界仍在**：`main.ts`/`setup-page.ts` 行覆盖 0%（entry-exempt，测量但不强制）、34 个测试文件仍含 main.ts 源码读取、`release.yml` 未接 `npm run ci`；24h soak 归 B 组 MB-113（外部真机）。
7. **法务未闭环**：应用内举报/下架/申诉入口已落地（MB-121，11 测试；人工处理/可导出/不自动上传）；但 legal strict 仍 16 blockers/16 warnings、APPROVALS 有效批准 0、律师审查暂缓；MB-120 属 **C 组/C2-PREREQ**（非 C1 门禁）——C1 仍不得称“已合规/已审核/已清权”。
8. **真值门当前非全绿**：本机 `docs:check` = 27/28 PASS，唯一失败 `status-commit`（`docs/STATUS.md` 仍记 `0a5bc0b`，HEAD `fe7f568`）；`status:check` 亦因 dirty 计数漂移而红。提交轮必须 `npm run status` 重生成并复核；这属于提交前动作，不是 docs/plan 改动导致。
9. **测试数量的边界**：本机 HEAD `fe7f568`（仅 docs 未提交）实测 **1938 tests / 1938 pass / 0 fail / 0 skipped**（§6.1），较上一版 1857 增长（round11 新测试 + MB-121 11 例）；这些是本地证据，不等于“验收总门”通过——缺真实 CI、当前 HEAD Windows 干净 checkout、真实 `%APPDATA%` 哈希、24h soak、真实 Tauri GUI 复跑。
10. **B 级证据依赖**：A11Y/GUI/soak/DPI 矩阵/Windows CI/C1 构建分别产生于 `b1b88cd`/`b7582a6`/`43d5358`/`4e50b3d`/`1ff5bfa` 等时点；不能当成 `f7ae511` 的复跑。
11. **A 组清零不是验收通过**：A 组 8 项已 DONE，但 B 组 12 项按 lead 决策归 C1-ACCEPTED（带限制接受）、**未标 DONE**；C 组 7 项非 C1 目标。若把“接受/移出范围”当作“完成”，就是虚报。C1 验收通过仍须 §0.5.2 外部解锁项有真实证据 + `npm run ci`/`docs:check` 当前绿。

---

## 5. 下一步顺序（C1 终态收口；2026-11-20 lead 决策）

> 原按 Epic/周次的 Wave 由本节取代：round11 后 **A 组已清零**；C1 的剩余项 = B 组外部解锁/披露 + C 组移出 C1（§0.5）。

### 5.1 A 组：C1 工程收口（0 项，round11 已清零）

**无剩余任务。** 原 A1–A4 全部完成：MB-041（内置角色热切换）/MB-114（E2E 临时端口+归档）→ MB-004（插件 LOCK/clean-checkout）/MB-104（behavior/regions 单源）/MB-108（scripts/文档/i18n）→ MB-110（main boot 行为测试）/MB-111（覆盖率 enforce）→ MB-121（应用内举报/下架入口）。逐项证据见 §2；不得把“A 组清零”写成 C1 验收通过（B/C 仍见 §5.2/§5.3）。

### 5.2 B 组：外部解锁（不阻断 C1 candidate，但发布说明必须披露）

| 解锁项 | 动作 | 完成后判定 |
| --- | --- | --- |
| MB-001 私有 remote/CI | owner 授权建 remote → push → workflow_dispatch 首跑 → branch protection → 归档 run URL | 可称“真实 CI 跑过”；此前只能写“本机 gate 绿、CI 未运行” |
| MB-005/091/115 签名链 | C1 保持 unsigned；C2 采购 OV Authenticode 证书 + SHA256SUMS 外层签名/attestation + 签名报告 | 可进入 C2 通道；C1 不得称 signed |
| MB-092/093 updater/身份 | D2 owner 拍板；C1 后独立发布窗口执行迁移 | 身份迁移/updater 各自独立验收 |
| MB-082 生产信任根 | owner 离线密钥 ceremony + 注入公钥 + 轮换/吊销流程 | DLC 信任根成立（DLC 本体仍归 C/MB-090） |
| MB-054/113 真机/长时 | Windows 真机 DPI/多屏矩阵；24h 原生 soak + 当前 HEAD 性能基线 | 可称“真机/24h 已验”；否则只写短时 soak/模拟矩阵 |
| MB-042/122 宿主/联调 | Tauri/Node AppData FS host 接线；插件双向桥 + 真实 DSH 联调 | 可称“桌面持久化/双向桥已验” |
| MB-124 运营取样 | 真实用户回访/低打扰/删除率指标采集 | 可报告产品指标；不改变 C1 工程状态 |

### 5.3 C 组：移出 C1（C2-PREREQ/非 C1 目标）

- MB-043/083（C2 市场/审核/服务端）、MB-120（律师/生效条款）、MB-085/123（支付/市场运营）、MB-090（DLC ceremony）、MB-045（WAV 清权）。
- **不阻断 C1**，也不得当作 C1 完成；转 C2/C3 或商业路线排期（见 §0.5.3）。

---

## 6. 边界与维护

- 本文件是**执行对账**，不是发布批准、不是合规意见、不是 CI run 记录；不得引用为“已验收/可发布”。
- 快照：状态对账基线 HEAD **`fe7f568`**（§2 逐行；`f7ae511` 为上一版快照）。**状态计数 = DONE 66 / PARTIAL 13 / BLOCKED-EXTERNAL 6 / TODO 0**（§0.1 为准）；非 DONE 19 = A 0 / B 12 / C 7。
- 终态分类规则（2026-11-20 lead 决策 + round11）：**A 组 0 项（8 项已 DONE）；B 组 12 项 = C1-ACCEPTED；C 组 7 项 = C2-PREREQ/非 C1 目标；B/C 均不标 DONE**。分类变更必须同步 §0.5、本文件 §3/§5 与 `MASTER-BACKLOG-2026-11-19.md` §5.1；分类不得改变 §0.1 计数。
- 状态会随提交变化；每次 wave 结束后按以下命令复核后更新 §0.1/§2：`npx tsc --noEmit`、`npm test`、`npm run build`、`npm run ci`、`node scripts/docs-check.mjs`、`node scripts/gen-status.mjs --check`、`node scripts/legal-check.mjs --strict`、插件 `npm test`；真实浏览器门禁按需跑 `node scripts/gui-cdp-smoke.mjs`、`node scripts/a11y-cdp-check.mjs`、`node --import tsx scripts/soak-short.ts`、`node scripts/scale-dpi-verify.mjs`。
- 本任务边界（round11 对账轮）：只改 `docs/plan/EXECUTION-STATUS-2026-11-20.md` 与 `docs/plan/MASTER-BACKLOG-2026-11-19.md`（另按“docs:check 绿”要求重生成 `docs/STATUS.md`）；未改代码/测试/资产/Rust/插件；未 commit/push；对账时工作树仅 docs 类改动。
- 复跑基线：HEAD **`fe7f568`** + 本机 WSL2/Node v24.22.1；round11 实跑证据见 §6.1。`docs:check` 在提交轮重生成 STATUS 前会因 status-commit 红；`status:check` 亦受 dirty 计数漂移影响。

### 6.1 round11 复跑（2026-11-20，本机，HEAD `fe7f568`）

> 本轮只改 docs（对账 + 为通过真值门重生成 `docs/STATUS.md`），不改代码。工作树代码/测试 = HEAD `fe7f568`（未提交改动仅 `docs/art/**`、`docs/research/**` 及 docs 类）。为在本机 WSL 运行测试，临时补齐 linux 平台 native binding（`@esbuild/linux-x64`、`@rolldown/binding-linux-x64-gnu`，均在 gitignored `node_modules`；**未改 package.json/package-lock.json**）。

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npx tsc --noEmit` | **exit 0** | 类型门 |
| `npm test` | **1938 tests / 1938 pass / 0 fail / 0 skipped，exit 0** | 全量回归；较上一版 1857 增长（round11 新测试 + MB-121 11 例） |
| `npm run coverage:check`（required） | **exit 0**：mode=enforce、1938/1938 tests、all files 92.57/79.00/87.80、key 18/20 loaded、**enforced 18/18 avg 90.04**、warnings=0；`main.ts`/`setup-page.ts` 仍 0% entry-exempt | 覆盖率 required 门 |
| `node scripts/docs-check.mjs` | **27/28 PASS**：唯一失败 `status-commit`（STATUS 记 `0a5bc0b` vs HEAD `fe7f568`，需 `npm run status`）；重生成 STATUS 后复跑全绿（提交轮动作） | 真值门 |
| 插件 `npm test`（`plugins/dsh-famling` 0.10.10） | **245 tests / 245 pass / 0 fail / 0 skipped，exit 0** | 插件工作树（目录无 git） |
| 插件 `node scripts/clean-checkout.mjs --json` | **ok:true**：临时 checkout 无私有仓、`npm ci --offline` 绿、0 fail/10 个声明 skip、embed standalone/verify/check/pack/jsdoc 全绿 | MB-004 独立重建证据 |

> **结论**：HEAD `fe7f568` 的 tsc/test/coverage 门绿，插件 245/245 + 独立 checkout 绿；docs 真值门在重生成 STATUS 后可绿。仍缺真实 CI（无 remote）、当前 HEAD Windows 干净 checkout、24h soak、真实 Tauri 复跑——不得据此称 C1 验收通过。

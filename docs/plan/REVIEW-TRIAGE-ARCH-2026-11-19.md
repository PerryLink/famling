# 架构 / 重构评审任务化（架构 + 软件 + 游戏 + 网络 · 2026-11-19）

> 任务：task-68（架构/重构任务化）。作者：`triage-arch`。本文只读分析 + 唯一写入此文件；未改代码/资产/配置，未 commit/push。

| 项 | 内容 |
|---|---|
| 输入 | `docs/research/PROJECT-REVIEW-{ARCHITECT,SOFTWARE,GAME,NETWORK,QA,PSYCHOLOGY,UX}-2026-11-19.md` 七份评审 + `PROJECT-REVIEW-ALL-FINDINGS-2026-11-19.md` 索引 |
| 本任务范围 | 架构 + 软件 + 游戏 + 网络四份评审的**结构性 P0/P1/P2**：main.ts/content hub 拆分、共享语义单源、插件独立构建、DSH 适配层、动画单轨、内容包/角色注册表、模块边界、旧 Electron/多管线 |
| 其他三份评审 | QA/心理学/UX 只在与本范围交叉（质量门、数据隔离、内容中心窗口、零按钮/可发现性、法务漂移）处引用；其专项任务由对应 triage 文档承接，不在本树内扩张 |
| 评审快照 | `779354b`（2026-11-19）+ 当时 18–21 项未提交改动（内容中心 v2 正在开发，部分测试/tsc 时红时绿） |
| 当前基线 | **`7107a61`**（2026-11-19，评审后新增 3 个提交：`d5655c9` 角色主题/内容包 v2/最小右键菜单、`0bbbe43` 远程市场客户端、`7107a61` 保存后退出；工作树仅 2 个文档改动 + 本目录新报告） |
| 复读/复核 | 七份评审全文 + 当前代码/设计文档 + 本轮实测（Windows Node 24.22.1 的 tsc/tests、干净 checkout、插件单独 clone、信任根/元数据检查）；WSL 下因 `node_modules` 为 win32 依赖，Vite build 与部分 CLI 子进程不可跑（已在附录说明） |
| 唯一写入 | `docs/plan/REVIEW-TRIAGE-ARCH-2026-11-19.md`（本文件） |

---

## 0. 执行摘要

### 0.1 一句话结论

**四份评审的方向判断仍然成立，但证据快照已经过期：评审把大量“结构性债”列为 P0，而其中一部分已被评审后的 3 个提交实际解决（角色主题、内容中心 v2、最小右键菜单/设置、远程市场客户端、插件零按钮），另有一部分只是换了位置或长大（content 层从 8,142 行涨到 10,247 行、插件首屏预算从 72 KiB 上调到 78 KiB）。真正需要先做的是三件事：把发布证据链变成真的（CI/干净 checkout/数据隔离/签名与身份口径），冻结 3 个产品决策（形态、DLC、资产公开），再把共享语义与插件自证做成可生成、可校验的工件；main.ts/content hub/动画单轨是第二梯队，不能和发布证据抢第一批。**

### 0.2 当前基线（与评审快照不同的硬事实，2026-11-19 14:00 前后实测）

| # | 事实 | 证据 |
|---|---|---|
| 1 | 当前 HEAD `7107a61`，工作树除文档外干净；评审后新增 3 个功能提交 | `git log --oneline -3`；`git status --porcelain` 只余 `docs/art/prompt-library`、`docs/research/COMPETITORS-CHINA-DSH.md` 与本报告 |
| 2 | 桌面菜单已从“23 项平铺”改为根菜单 6 项 + 二级（互动/更多/设置），开发面板仅在 `?debug=1`/dev build 出现；测试锁定根动作 | `src/pet/desktop-shell.ts:69`（`SHELL_MENU_ROOT_ACTIONS`）、`:851` 起渲染；`tests/desktop-shell-menu.test.ts:170,187` |
| 3 | 桌面设置弹窗已提供：显示 ⋯、静音、音量、减少动态、复位窗口、保存/读取、缩放、字号、内容中心入口、隐私/关于/危险动作 | `src/pet/desktop-shell.ts:1106-1520`（`settings` dialog） |
| 4 | 退出已改为 save-then-exit；角色切换仍走 `location.reload()` | `src/pet/main.ts:3340`（`exitAfterSave`）、`:3445`（`onExit`）、`:1167`（reload） |
| 5 | 角色=主题已落地（`rolePresets` 4 条 / `famling.content/0.2`；插件 `ROLE_BUNDLES` 值已与 `library.json` 对齐：cat 为 standard/night/dark/serif，dog 为 standard/paper/paper/system） | `public/content/library.json`；`plugins/dsh-famling/client.js:76-146`；`src/pet/content-hub.ts:97-112` |
| 6 | 内容中心 v2（角色/自定义/内容包/市场 4 tab）已实现；但仍是 480×336 窗口内 dialog，且 `main.ts` 静态 import，进首屏 | `src/pet/content-hub.ts:1289`（`initContentHub`）；`src/pet/main.ts:133`；`src/pet/pet.css:1000-1268` |
| 7 | content 层当前 10,247 行：`content-library.ts` 4,568 + `content-hub.ts` 2,315 + `content-assets.ts` 1,270 + **新增 `content-market.ts` 2,094**；`content-market.ts` 未被任何产品代码 import（只有测试 import） | `wc -l`；`grep -rn content-market.ts src` 仅 content-hub 注释；`tests/content-market.test.ts` 29 例 |
| 8 | 远程市场客户端 v1 已存在：HTTPS/重定向/私网/大小/超时/serial 防回滚/下载 hash+签名校验；但 catalog schema 仍是 `famling.market-catalog/0.1`、无 `serial/expires` 字段，`activeMarketSource = null`，市场 tab 仍“服务器未配置”，**未接任何产品路径** | `src/pet/content-market.ts:1-50`；`src/pet/content-library.ts:642`；`src/pet/main.ts:891-897` |
| 9 | 插件 0.10.2：零按钮 + 右键/Shift+F10 分级菜单 + 统一设置弹窗；首屏 `client.js` **75.3 KiB**（0.10.1 把预算 72→78 KiB），首绘 137.1 KiB、全量 322.7 KiB；内容+设置 chunk 34.5 KiB 懒载 | `plugins/dsh-famling/{README.md,package.json,scripts/verify-anims.mjs:62}`；本轮 `embed-anims --check` 实测 |
| 10 | 质量门：**仍无 git remote、CI 从未运行**；但评审指出的两个“干净 checkout 必红”已被修（`use-restrictions` 缺兄弟仓时跳过；`ui-assets` 改指向已跟踪 `docs/art/ui-91-qa`）。本轮 Windows 干净 checkout：`tsc` 0，测试 1,176 / 1,166 pass / 2 fail / 8 skip；2 fail 是 `python3` 命令在 Windows 不存在导致生成器 `--check` 返回 9009，不是产品断言 | `git remote -v` 空；`.github/workflows/ci.yml:3-6`；`README.md:11` 仍称远端已建；本轮 `/tmp/dg-clean` 实测 |
| 11 | 插件单独 clone（无私有仓）模拟：测试 87 pass / 3 skip；`embed-anims --check` 因缺私有资产直接失败；`verify-anims` 仍可绿（跳过字节级对源校验） | 本轮 `/tmp/dg-plugin` 实测；`plugins/dsh-famling/scripts/embed-anims.mjs:82-84`；`verify-anims.mjs:564-566` |
| 12 | 发布信任仍未闭环：生产 DLC 信任根 `keys: []`，无 updater；`tauri.conf.json` 仍是 `DesktopGames/0.1.0/com.perrylink.desktopgames` | `native/dlc-verify/trust/production-trust-root.json`；`app/tauri/src-tauri/{Cargo.toml,tauri.conf.json}` |
| 13 | 动画/角色管线仍为评审快照状态：`HERO_CHARACTER_IDS` 硬编码 4 个；`anim/idle.ts` 500 行仍无运行时 import；无 `timing.json`；walk/attack 仍无入口；角色切换 reload；DPR 启动读一次 | `src/pet/hero-runtime.ts:86`；`grep` 结果；`src/pet/anim/clips.ts`；`src/pet/main.ts:2776` |
| 14 | 结构性债仍在：`main.ts` 3,607 行 / 49 import / 35 个模块级 `let` / 67 个 `addEventListener`；`initContentHub` 约 1,027 行；`voice → pet/security` 反向依赖；Electron 遗留宿主 + devDependency 仍在；Vite 仍 9 个 HTML 入口 | `wc -l`；`grep`；`src/voice/service.ts:11`；`package.json:27-28,55`；`vite.config.ts:352-363` |

### 0.3 数字结论

- 四份评审共 **76** 条 P0/P1/P2（ARCH 20、SOFTWARE 15、GAME 20、NETWORK 21；其中 P0 合计 9 条）；七份合计 **109** 条、19 条 P0。
- 去重后为 **16 个问题簇**；重新分级为 **6 个 P0**、**15 个 P1**、**20 个 P2**；另设 **5 个决策门**（不是工程任务，但不拍板会阻塞 8 个以上任务）。
- 任务树共 **53 个任务 = 48 个工程任务 + 5 个决策门**；批次：B0 **10 个**（含 3 个决策门）、B1 **12 个**、B2 **13 个**、B3 **10 个**、B4 **8 个**。
- 评审后逐项复核 **14 项**（其中已解决/部分解决 **13 项**，另 1 项确认原样未变，见 §2.3）；由后续代码产生的新风险 **7 项**（见 §2.4）。
- 估算合计约 **98 人日**（量级，不含外部证书/密钥/法务/真实 GUI 等待）；按 2–3 人并行约 8–10 周。任务树见 §4。

### 0.4 建议第一批（B0，1 周内）

1. `E10-T1` 产品形态 A/B 决策 + `E10-T2` DLC/付费范围决策（owner 并行，1 页决策记录即可）。
2. `E0-T1` 建 remote + CI required + 单一 `npm run ci`（让“绿”第一次可复核）。
3. `E0-T2` 干净 checkout/工具链钉版（修 2 个环境失败、定义 8 个 skip 的合法语义、加 engines）。
4. `E0-T3` `docs/STATUS.md` 由脚本生成 + 历史文档标快照（终止 README/HANDOFF/评审数字互斥）。
5. `E0-T4` GUI/E2E 数据隔离（与 QA 专项共用任务：`DG_QA_DATA_DIR` + fail-closed 脚本 + 真实 appdata 哈希断言）。
6. `E0-T5` 发布身份/外层签名/措辞真值（先做 SHA256SUMS 外层签名与“signed”口径，不等证书）。
7. `E0-T7` 市场联网保险丝（默认不联网 + CI 断言零 fetch + 不接产品路径）。
8. `E1-T1` 共享语义合同表（15 个共享面；纯文档 0.5–1 人日，可与上述并行）。
9. `E10-T3` 资产/音频再分发许可决策（决定 E2/E5 的产出形态，越早越好）。

### 0.5 最重要的 3 个矛盾（详见 §2.1）

1. **C-01 快照 vs 当前代码**：评审的若干 P0/P1 证据已被 3 个提交改变（菜单、角色 bundle、内容中心 v2、插件零按钮、干净 checkout 的两个必红测试）；继续按原文排期会做错事。本报告按 `7107a61` 重核。
2. **C-02 P0 定义与优先级冲突**：七份评审 19 个 P0，各用不同口径（发布前/数据安全/可玩角色/信任链/可读性），导致“第一件事”互相冲突；必须统一 P0=发布证据/信任/用户数据，其余降为 P1 或决策门。
3. **C-04 远程市场：当前实现方向 vs 网络评审结论**：`0bbbe43` 加了 webview `fetch` 市场客户端，但网络评审明确“CSP 会拦、必须用受限 Rust 下载器、不能放宽 CSP”；且市场在信任根/产品形态未定时先于契约推进。裁定：客户端保持离线纯函数/测试，不接真实网络；先协议与 Rust 传输，再谈 UI。

---

> 与其他 triage 的关系：全局 P0 归并/发布通道以 `REVIEW-TRIAGE-P0` / `REVIEW-TRIAGE-SECURITY` 为准，UX/心理以 `REVIEW-TRIAGE-UX` 为准，QA/性能/资产以 `REVIEW-TRIAGE-QUALITY` 为准；本文件只对“四份评审的结构性条目”重新分级，**计数不与其他文件相加**。合并时以 lead 的路线图为准。

## 1. 范围、方法与证据口径

### 1.1 范围边界

- **包含**：架构评审全部 20 条、软件评审全部 15 条、游戏评审全部 20 条、网络评审全部 21 条；其中结构性改造、发布/供应链、共享契约、模块边界、动画/角色管线、DSH 宿主、市场/安装器。
- **只引用不展开**：UX 的菜单/内容中心窗口/托盘、心理学的危机地板/年龄门、QA 的 GUI 自动化/覆盖率/soak。它们与本文的交叉点写进 §2.1 的矛盾与对应任务依赖；专项任务由 sibling triage 文档承接。
- **不包含**：具体功能开发（内容市场服务端、支付、Steam 商务、正式美术、玩法设计）；本文只做任务化与依赖/验收定义。

### 1.2 证据等级

- **A（本轮实测）**：当前代码的 `wc`/`grep`/`git`、Windows Node 的 `tsc`/`node --test`、干净 checkout 测试、插件单独 clone 测试、`embed-anims --check`。
- **B（当前代码/文档可复核）**：未重跑但可直接读到的结构、配置、信任根、CI/脚本。
- **C（评审原文）**：评审报告的判断，必须注明是快照还是当前仍成立；已由 A/B 推翻的进 §2.3。
- 行号以 2026-11-19 14:00 的 `7107a61` 工作树为准；评审原文行号只作为“当时位置”。

### 1.3 评审后 3 个提交改变了什么

| 提交 | 内容 | 对评审结论的影响 |
|---|---|---|
| `d5655c9` | 角色=主题 bundle、`famling.content/0.2`、内容包 v2/素材包、内容中心 4 tab、最小右键菜单、插件 0.10.x 零按钮 | 推翻/部分推翻：UX P0-1/P0-2、A-P0-1 的具体 bundle 漂移、S-P1-3 的部分值漂移、G-P0-1 的“市场只能卖主题”叙事（角色主题已可交付但还不是可玩新角色） |
| `0bbbe43` | 远程市场客户端 v1（可注入 fetch/clock/storage/verifier；HTTPS/大小/重定向/超时/防回滚/hash+签名） | 部分推翻：N-P1-1 的“防回滚未定义”已从客户端侧补上；**未推翻** N-P1-2（CSP/传输）、N-P1-3（trust root 校验）、N-P1-6（解压/安装） |
| `7107a61` | save-then-exit 入口 | 推翻 UX P0-3 的“退出不保存”；但损坏存档的恢复选择与 `saveRecoveryNeeded` 清除仍未闭环 |

### 1.4 当前仍成立 / 已失效的快速判断

| 判断 | 结论 |
|---|---|
| “共享内容语义没有单一权威源” | **仍成立**；但“同 id 已不同值”在 cat/dog 内置 bundle 上已被对齐（高风险的具体漂移已消）。仍需 spec/生成器/一致性测试。 |
| “插件构建不能自证” | **仍成立**：插件无 git/CI/spec/LOCK，`embed-anims` 默认读私有仓；单独 clone 时 `embed --check` 失败、`verify` 跳过字节对源。 |
| “发布信任/身份未闭环” | **原样成立**：生产根空、无 updater、旧产品元数据；Authenticode 为外部阻塞。 |
| “质量门不存在” | **部分成立**：无 remote/CI 仍成立；干净 checkout 已从“必红”变为“环境相关 2 红 + 8 skip”，且 README 仍写假事实。 |
| “main.ts/content hub 单体” | **原样成立**：main 3,607 行；content hub 1,027 行单函数；content 层更大。 |
| “动画双轨/计时表多副本/角色不可热切换/注册表硬编码” | **原样成立**（评审后无代码改动）。 |
| “DSH 适配层/能力协商缺失” | **原样成立**：`export const inject = ['connection','llm','schedule']`；无 hello/capabilities；无 host 适配目录。 |
| “Tauri 同源 storage 未隔离” | **原样成立**；无 per-window data dir、无 storage 矩阵测试。 |
| “远程市场无传输/防回滚” | **部分失效**：客户端库有防回滚/边界；但未接产品、catalog 仍 0.1 无 serial/expires、无 Rust 传输/解压/安装。 |
| “旧 Electron/多管线仍在” | **原样成立**：Electron 文件/devDependency 仍随包；9 个 Vite 入口；5 套角色/动画概念仍并存。 |

## 2. ① 矛盾、重复与已失效项

### 2.1 矛盾清单（按影响排序；裁定用于本任务树，不代表最终产品决定）

| ID | 冲突双方与证据 | 为什么冲突 | 建议裁定 | 影响 |
|---|---|---|---|---|
| **C-01** 快照 vs 当前代码 | 评审（ARCH §1.3/§3.3、SOFTWARE P0-1、UX P0-1、GAME P0-1）基于 `779354b` + 脏工作树；当前 `7107a61` 已提交内容 v2/角色主题/最小菜单/插件零按钮，并修掉两个干净 checkout 必红测试 | 同一问题在评审里是 P0/P1，在 HEAD 上已部分或全部不成立；继续按原文做会重复劳动/误判优先级 | 把评审当“风险假设库”，逐条对 HEAD 复核；**以本报告 §2.3 为准**；任何排期前先跑 `git log`/目标文件/测试 | 全部；B0 先重核 |
| **C-02** P0 定义与“第一件事”冲突 | 七份评审共 19 个 P0：ARCH=合约/插件/发布；SOFTWARE=质量门；GAME=可玩角色/DLC/玩法；NETWORK=信任根/发布者身份；QA=数据隔离/门禁/行为测试；UX=菜单/控件/存档/托盘；PSYCH=安静控制/危机地板/年龄门。每份都给出“先做 3 件”，互相不一致 | 没有统一严重度定义时，“P0 全做”等于没有优先级；且部分 P0 是决策（GAME P0-3）或跨域专项（PSYCH/UX） | 统一口径：**P0=阻断可信发布/用户数据/信任链**；**决策门**单列；契约/运行时债=**P1**。重分级见 §3（19→6 个 P0，其中 1 个是决策门 P0-4；另若干 P0 依赖 E10 决策） | 全部 |
| **C-03** “共享语义单源” vs “两套 schema 独立” | ARCH P0-1 要求单一权威源、spec/生成器；SOFTWARE P1-3 建议以 `public/content/library.json` 为单源生成插件常量；CONTENT-MARKET D5/§3.7 决定两套 schema 保持独立、统一需 MAJOR+双读迁移；GAME P0-1 又要求新的动画资产包 schema | 三者对“单源”的对象不同：一方指**语义/取值**，一方指**序列化 schema**；若不区分，会把 P0-1 误做成大迁移 | **单源只覆盖共享语义**（角色 bundle 值/对话语义/语音策略/声明文本/事件→clip/版本映射）；**wire schema 保持多套**（famling content 0.2 / plugin extension v3 / market catalog 0.2 / anim pack 0.2），用 spec fixture + 生成器 + 双端 conformance 绑定 | E1、E2、E5、E6 |
| **C-04** 远程市场：实现方向 vs 网络评审 | `0bbbe43` 的市场客户端用注入 `fetch`（`content-market.ts`）；NETWORK P1-2 明确 `tauri.conf.json` 的 `connect-src 'self' ipc:` 会拦 webview fetch，正确解是**新增受限 Rust 下载命令，不放宽 CSP**；ARCH P1-2 要求先定安装器归属/协议；GAME §明确“不要先做远程市场 UI/安装器” | 代码已经朝“webview 直连”方向写了 2,094 行；若后续直接接 UI，会在 release 被 CSP 拦或被迫放宽 CSP（安全回退）；且先于 trust root/产品形态推进 | 客户端保留为**离线纯函数/可注入测试库**，不得接真实网络；产品路径默认 `unconfigured`；先做 E6-T1/T2，再做 Rust 传输/E6-T3，最后 UI；若决定只做 DSH/浏览器侧，必须显式声明“不支持 Tauri release” | E0-T7、E6 |
| **C-05** DLC/市场投入 vs 产品形态 | GAME P0-3 要求 owner 在 A（陪伴/研究运行时）与 B（桌面游戏基座）间二选一；GAME/NETWORK 又把 DLC 生产密钥 ceremony、重签、release 门禁列为 P0；但若选 A，DLC 应从 release 移除而不是重签；若选 B，则 GAME P0-1 的资产包/角色注册表与市场投入才成立 | “先修 DLC”与“先决定是否做 DLC”互为前提；ARCH/PSYCH 还指出当前法务定位是研究/非陪伴，与 B 的商业化叙事有张力 | 先拍板 E10-T1/T2；**默认 A**（与现有 TOS/研究定位一致）直到 owner 明确选 B：默认移除 release 内 DLC 资源/入口，ceremony 暂停；选 B 才执行 E0-T6/E6 | E0-T6、E5、E6、E10 |
| **C-06** 插件自包含 vs 资产公开/许可边界 | ARCH P0-2 建议把 spec+资产 vendored 进插件；ARCH Q1/Q2 与 NETWORK 又指出资产/台词/帧清单的公开性未决，插件许可 PolyForm NC + 美术 CC BY-NC-SA；QA P1-2 要求不可 skip 的一致性门 | 要“单独 checkout 可重建”，就得有可获取的资产或至少完整清单；但“公开资产清单/字节”可能越过产品边界/许可 | 拆成**两个工件**：公开的**语义/清单规格**（schema + 逐文件 sha + 版本，可公开）与**资产字节**（内部/私有 registry 或发布物）；插件 vendored spec 只校验 sha；是否公开字节由 E10-T3 决定 | E1、E2、E10-T3 |
| **C-07** 内容中心独立窗口 vs 存储/ACL/GUI 数据隔离 | UX P1-1 要求把内容中心/设置搬进可缩放独立窗口；ARCH P1-7 指出现有 Tauri 同源页面共享 localStorage 未隔离；QA P0-1 记录 GUI/E2E 曾直接写/删真实 `%APPDATA%`（`--reset-saves` 删真实存档） | 新增窗口会增加 ACL/同源存储面；不先做数据隔离与键空间矩阵，会把 UX 修成新的隐私/测试风险 | 顺序：E0-T4（QA 数据隔离）→ E4-T7（存储隔离技术验证/键空间矩阵）→ 才允许 UX 的独立内容窗口；在独立窗口前，内容中心仍是 480×336 模态（现状），并由 UX triage 决定是否接受 | E0-T4、E4-T7；UX 专项 |
| **C-08** 零按钮/克制 vs 可发现性/控制 | 当前实现把桌面无持久按钮（⋯ 默认隐藏）与插件零按钮 + 右键分级菜单作为“克制”默认；UX P1-6/PSYCH P0-1 指出右键入口原本就只有 22px/.55 提示、静音/音量/动效此前没有入口 | 更少 chrome 提升克制，但把“发现入口”和“立即静音”变成隐藏知识；对焦虑/前庭敏感用户，“找不到关闭”是可用性 P0 | 保留零按钮默认；加**一次性 coach mark**（右键/Shift+F10/⋯ 可选）+ 设置内“显示 ⋯”opt-in + 静音/减少动态/音量必须在设置与首启提示可达；不回到四按钮 | UX/PSYCH 专项；E4/E7 验收约束 |
| **C-09** bundle 预算门 vs 预算上调 | SOFTWARE P1-7/GAME P2-5 把首屏预算（72 KiB）当硬门；插件 0.10.1 为容纳零按钮右键菜单把上限改为 78 KiB（`verify-anims.mjs:62`），当前 75.3 KiB，仅 2.7 KiB 余量；首绘 137.1 KiB | 预算门如果可按功能上调，就不是门；但右键菜单/零按钮是产品决定的可用性成本，不能简单拒绝 | 接受一次**有记录的 ADR 上调**（72→78），同时要求：内容/设置继续懒载、首绘不得再涨、下一轮任何上调需 owner 书面同意；CI 打印余量而非只 PASS | E5-T8/E7-T2 |
| **C-10** “干净 checkout 必红” vs 当前近乎绿 | SOFTWARE P0-1/QA P0-2 的实测是 HEAD `779354b`：`1046/1037 pass/4 fail`，其中 2 个在任何 checkout 必红；当前 HEAD 已修 `use-restrictions`（缺兄弟仓跳过）与 `ui-assets`（改指向已跟踪 QA 图），干净 checkout 为 `1176/1166 pass/2 fail/8 skip`（2 fail 为 Windows 无 `python3` 的环境问题） | 如果继续引用“必红”，会把 P0 误写成“测试本身坏了”；真实问题已收窄为“无 remote/CI + 工具链未钉版 + 8 个 skip 无合法语义 + README 假事实” | 重写 P0-1 为“**发布证据不可复核**”：先建 CI/remote、pin Node/python、明确 skip 策略、清假事实；不要再把“修两个测试”当第一任务（已做） | E0-T1/T2/T3 |
| **C-11** “先契约/spec” vs “先动画单轨/角色包” vs “先拆 main.ts” | ARCH 主张先 spec（P0-1）；GAME 主张先资产包+注册表/运行时收敛（P0-1/R1/R2）；SOFTWARE 主张先 main.ts 减重（P1-1 第一优先）；QA 主张先数据隔离；四条“第一”互相踩 | 这些工作有真实依赖：spec 需要先冻结语义与产品差异；注册表需要 timing/interactions 单源；拆 main 需要行为测试；没有 CI 谁都不能放心动 | 采用**双轨**：B0/B1 先发布证据+决策+语义合同；B2 并行动 main/content 与动画单轨/timing（两者文件基本不重叠）；**资产包/注册表放到 timing/interactions 单源之后**，避免返工 | E0、E1、E4、E5 |
| **C-12** 对外宣称 vs 工程状态 | ARCH P0-3 要求完成前冻结“signed/可发布”表述；NETWORK 说当前唯一可发布路径是 unsigned preview；GAME 说 DLC 实际全 fail；README/HANDOFF 仍写远端已建/CI/842 tests 等旧事实 | 文档/发布页在承诺不存在的能力（signed、DLC、CI、当前测试数），会同时误导用户、审计和后续 agent | E0-T3/E0-T5 建立唯一状态真值与口径：未签名不得写 signed；DLC 未 ceremony 不得写“含 DLC”；README 只引用脚本生成状态；本报告只记录事实不替代发布决定 | E0-T3/T5、E10 |
| **C-13** 发布通道口径冲突 | 安全 triage/`RELEASE-HANDLING-2026-11-17` 记录当前唯一获批路径是邀请制 **unsigned beta**，但 ARCH/NETWORK/GAME 的 P0 按“公开 signed 发布”要求 Authenticode/updater/DLC 根/身份；`RELEASE-CHECKLIST` 又写“证书到位前只能发布 signed release” | 两套 gate 同时存在：按公开 signed 排期会把 beta 过度阻塞；按 beta 口径又可能错误放行 signed/DLC 宣称；发布证据链的“必要项”随通道变化 | 先定义通道（C0 内部→C1 邀请 beta→C2 公开 unsigned→C3 公开 signed）：C1 必须过 CI/数据隔离/无签名宣称/SHA256SUMS 外层签名；Authenticode/updater/DLC ceremony 仅在 C2→C3/保留 DLC 时升为硬门；所有任务验收写通道 | E0-T3/T5、P0-3、E10 |

### 2.2 重复问题簇（去重结果；成员可跨评审）

| 簇 | 成员（原 ID） | 合并后归属 |
|---|---|---|
| D-01 发布信任/身份 | A-P0-3、G-P0-2、N-P0-1、N-P0-2、N-P2-9、A-P2-3、G-P2-6、N-P2-10、QA-P1-1 | P0-3；E0-T5/T6 |
| D-02 质量门/CI | S-P0-1、QA-P0-2、A-P1-6（部分）、S-P1-4、S-P2-3、S-P2-5、N-P2-8、QA-P2-4 | P0-1；E0-T1/T2/T3 |
| D-03 共享语义/内容源 | A-P0-1、S-P1-3、G-P1-5、A-P1-3（brief/consent 部分） | P1-1/P1-9；E1 |
| D-04 插件自证/分发 | A-P0-2、S-P2-6、N-P1-7、A-P2-8、QA-P1-2、QA-P2-6 | P0-6/P1-2；E2 |
| D-05 主入口单体/状态 | A-P1-4、S-P1-1、S-P1-2、G-P1-4（reload）、S-P1-6（状态散落） | P1-4/P1-5；E4 |
| D-06 动画/角色管线 | A-P1-5、G-P0-1、G-P1-1、G-P1-2、G-P1-5、G-P1-7、G-P2-3、S-P2-7（部分） | P1-6/P1-7；E5 |
| D-07 市场/安装器/传输 | A-P1-2、N-P1-1、N-P1-2、N-P1-3、N-P1-6、N-P2-1/2/3/4、G-P1-6、G-P1-7 | P1-8；E6 |
| D-08 测试/行为覆盖 | S-P1-4、QA-P0-3、QA-P1-3/4/5/6/8、S-P1-1（行为测试） | P0-1（证据）+ P1-4（行为测试）；E4-T1 |
| D-09 数据隔离/存储 | A-P1-7、QA-P0-1、QA-P1-7、S-P1-6（部分） | P0-2（QA 数据隔离）+ P1-10（键空间）；E0-T4/E4-T7 |
| D-10 发布面/依赖/页面 | S-P1-7、A-P2-6、G-P2-5、A-P2-2（Electron）、A-P2-9、S-P2-1（部分） | P1-12；E7 |
| D-11 DSH 宿主适配 | A-P1-1、A-P1-3（bridge/consent）、A-P2-7、S-P1-5 | P1-3；E3 |
| D-12 文档/数字漂移 | S-P2-2、A-P2-4、G-P2-6、QA-P2-1、N-P2-10、A-P2-8 | P0-1（状态真值）/ P2-4；E0-T3 |
| D-13 资产预算/性能 | G-P1-3、G-P1-8、G-P2-1、G-P2-2、G-P2-4/5、G-P2-8 | P1-13（WAV）/P2-14/18；E5-T8 |
| D-14 云出网/隐私 | N-P1-4、N-P2-5/7/11/12、PSYCH-P1-6（法务漂移） | P1-14；E8 |
| D-15 桥接纵深/限流 | N-P1-5、QA-P1-4（故障注入部分） | P1-14/P2-11；E8-T2 |
| D-16 工程卫生/工作区 | A-P2-9、S-P2-1/2、QA-P2-2/3 | P2-4/7/8；E7-T3 |

### 2.3 已被后续改动解决/部分解决/失效的评审项（不要再当现状引用）

| ID | 评审结论 | 当前证据 | 处置 |
|---|---|---|---|
| R-01 | UX P0-1：根菜单 23 项平铺、必滚动 2 屏 | 根菜单 6 项（交办/互动/角色与内容/设置/更多/退出），二级菜单，开发面板 dev-only；测试锁定根动作 | **已解决**；从任务树移除，保留“菜单可发现性”由 UX 专项 |
| R-02 | UX P0-2 / PSYCH P0-1：静音/音量/动效/复位/保存不可达 | 设置弹窗含 mute/volume/reduce-motion/reset/save/load/show-⋯；菜单“更多”含保存/读取；reduce-motion 接 hero | **部分解决**：重命名/PTT/语音缓存仍无产品入口；PSYCH P0-1 的“暂时隐藏/安静模式”仍缺 |
| R-03 | UX P0-3：退出不保存 | `exitAfterSave()` + `onExit`；根菜单退出走保存后关闭 | **已解决**；损坏存档恢复选择与 delete 清 flag 仍未做 |
| R-04 | UX P0-3：损坏提示指向不存在的保存按钮 | 保存入口现在菜单/设置可达；但 `saveRecoveryNeeded` 在删除存档后未清除、无恢复选择面板 | **部分解决**；作为 P2/UX 专项 |
| R-05 | UX P1-8 / PSYCH P1-8：插件四个常驻按钮 | 插件 0.10.2 零按钮 + 右键/Shift+F10 分级菜单 + 统一设置弹窗 | **已解决/部分解决**：按钮消失；焦点陷阱/aria-controls 等 a11y 细节仍在 |
| R-06 | A-P0-1：同 id 角色 bundle 已漂移（cat 对话/外观、dog 外观、对话包语义） | `library.json` 与插件 `ROLE_BUNDLES` 现已一致（cat standard/night/dark/serif；dog standard/paper/paper/system；dialogue 240/70%、80/40%、50/5%）；high-contrast 仍无插件实现但注释声明映射到 night | **具体漂移已解决**；**单源/一致性测试仍缺**（P1-1） |
| R-07 | A-P0-1/GAME P0-1：内容中心/角色主题没有 UI | 4 tab 内容中心 + 角色主题应用 + 素材包导入已实现（480×336 内） | **已解决**；“新动画角色不可安装”仍成立（P1-7） |
| R-08 | N-P1-1：远程市场无传输/防回滚 | `content-market.ts` 2,094 行：HTTPS/重定向/私网/大小/超时/单飞/serial 防回滚/hash+签名/安装回调；29 例测试 | **部分解决**；catalog 仍 0.1 无 serial/expires、未接产品、无 Rust 传输/解压；CSP 冲突未解 |
| R-09 | S-P0-1/QA P0-2：干净 checkout 必红 | 两个必红测试已修；干净 checkout `tsc` 0，`1176/1166 pass/2 fail/8 skip`（2 fail 为本机无 `python3` 的环境问题） | **部分失效**；P0-1 改为“无 CI/remote + 环境未钉版 + 假状态” |
| R-10 | 插件首屏 66.1 KiB / 预算 72 KiB | 0.10.1 起 75.1–75.3 KiB，预算 78 KiB；首绘 137.1 KiB；内容+设置 34.5 KiB 懒载 | **数字失效**；预算上调需 ADR/冻结（C-09） |
| R-11 | A-P1-4/S-P1-1：main.ts 3,555 行 | 3,607 行；`desktop-shell.ts` 1,522→2,244（菜单+设置）；content 层 8,142→10,247 | **原判断成立且更严重**；不因菜单拆分而误判为“已模块化” |
| R-12 | A-P0-2/QA：插件 0.10.0、4 按钮、66.1 KiB | 0.10.2、零按钮菜单、75.3 KiB；无 git/CI/spec；npm 仍 0.0.1 占位（评审记录） | **版本/UI 失效**；自证问题原样成立 |
| R-13 | GAME P0-2：release DLC 全失败 | 生产信任根仍 `keys: []`；无 updater；产品元数据旧；DLC 门禁仍 fail-closed | **原样成立** |
| R-14 | GAME P1-1/2/5/7、P1-8、N-P0/P1 的 Rust 侧 | 评审后未改 `src/pet/anim/**`、`app/tauri/src-tauri/**`、`native/**`、`src/pet/hero*`（`git diff 779354b..HEAD` 可证） | **原样成立**；这些任务不需重新验证前提 |

### 2.4 后续改动引入/放大的新风险（本报告新增，不属于原评审）

| ID | 新风险 | 证据 | 建议 |
|---|---|---|---|
| N-01 | content 层膨胀且出现“测试覆盖但产品不 import”的死模块 | `content-market.ts` 2,094 行，仅 tests import；content 层 10,247 行，> 动画运行时（约 2,222 行） | E0-T7 先冻结；E4-T6 懒载；E6 决定是否产品化；CI 覆盖率按入口算 |
| N-02 | 菜单/设置从 `desktop-shell.ts` 生长；主入口仍持有全部装配 | 1,522→2,244 行；main 3,607 行/49 import | E4-T2/T4 按“搬运不改行为”拆分；设置 dialog 可独立文件 |
| N-03 | 插件首屏接近新预算上限，且预算已上调一次 | 75.3 / 78 KiB（余 2.7 KiB）；首绘 137.1 KiB | 冻结 78；新增 UI 必须进懒 chunk；E2-T2 CI 打印余量 |
| N-04 | 内置角色 bundle 只靠注释“keep in sync”，无一致性测试 | `client.js:76-146` 注释；library.json | E1-T3 生成/校验；任何改 bundle 必须双端测试红 |
| N-05 | 干净 checkout 仍非“零解释全绿” | 2 个 `python3` 环境失败 + 8 个 skip；无 `engines`/python 版本声明 | E0-T2 钉版/明确 skip；CI 两平台矩阵 |
| N-06 | 远程市场客户端为 webview fetch，若直接接线将违反 CSP 或迫使放宽 | `content-market.ts` 注入 fetch；`tauri.conf.json:30` | E0-T7 保险丝；E6-T3 Rust 传输；禁止放宽 CSP |
| N-07 | 设计/README 状态与代码再次漂移（内容中心 UI 已实现但设计稿仍写未实现；README 仍六分类） | `docs/design/CONTENT-MARKET-2026-11-19.md` 状态行；`README.md:3` | E0-T3 状态真值 + docs-check；不要手写当前状态 |

## 3. ② 重新分级（P0 / P1 / P2）

### 3.1 统一分级口径

| 级别 | 定义（本报告） | 处理方式 |
|---|---|---|
| **P0** | 阻断“可信发布/分发”、造成用户数据风险、或使信任链/产品路线不成立；不关闭就不应继续做对外发布或市场类投入 | 第一批；owner + 时间点 + 可机器复核的验收 |
| **P1** | 不阻断今天发布，但会持续放大返工/漂移/安全面；必须在 1–2 个迭代内完成，完成前冻结相关功能增量 | 第二/三批；每个任务有独立验收 |
| **P2** | 局部债/一致性/卫生；不阻塞路线；可插空做 | 排期清债；不承诺时间 |
| **决策门（D）** | 不是工程任务，而是必须先拍的 owner 决定；未拍板时按保守默认执行，并阻塞依赖任务 | 0.5 页决策记录 + 默认值 + 触发条件 |

> 与评审原文的关系：评审的 P0 依据其各自口径；本报告按上表重排，**不删除任何原始问题**，只在 §3.6/附录 A 给出去向。

### 3.2 P0（6 条，全部进 B0/B1）

| ID | 重新分级的问题 | 原始条目 | 为什么仍是 P0（对当前 HEAD） | 验收/出口 |
|---|---|---|---|---|
| **P0-1** | 发布证据链不可复核：无 remote/CI、README 与事实不符、干净 checkout 仍有环境解释/8 skip | S-P0-1、QA-P0-2、A-P1-6（部分）、S-P1-4、N-P2-8 | 任何“测试全绿/可发布”结论都无法被第三方复现；后续所有重构都没有护栏 | CI 在干净 checkout 上真实运行且 required；`npm run ci` 本地等价；README/状态文档由脚本生成；CI run 链接归档 |
| **P0-2** | GUI/E2E 用户数据隔离缺失（真实 appdata 可被测试写/删） | QA-P0-1、A-P1-7（部分）、S-P1-6（部分） | 2026-11-19 已发生一次真实 `pet.json/.bak` 被 GUI 探针改写且不可还原；不隔离则所有 E2E/soak 证据都不可信，且可能再伤用户 | `DG_QA_DATA_DIR` override；E2E/soak 未设即 fail；`--reset-saves` 收窄且拒绝真实路径；前后真实 appdata 哈希一致 |
| **P0-3** | 发布身份与信任链未闭环：生产 DLC 根空、无 updater、产物 NotSigned/无外层签名、产品元数据旧 | A-P0-3、N-P0-1、N-P0-2、G-P0-2、N-P2-9、A-P2-3 | 对外只能发布 unsigned preview，却仍有“signed/含 DLC”的潜在表述；市场/更新的信任根不存在；且公开 signed 与邀请 beta 两套通道未对齐（C-13） | 一页 release identity/通道决策；C1 至少：SHA256SUMS 外层签名 + 验证命令 + 无 signed 宣称；C2/C3 再加 Authenticode/updater；DLC ceremony 或决定移除；产品名/identifier/版本口径一致 |
| **P0-4** | 产品形态/DLC/市场范围未定 | G-P0-3 | 决定 8 个以上任务是否做（DLC ceremony、anim 资产包、市场传输/UI、游戏基座）；不拍板会继续在未验证形态上投入 | owner 1 页决策：A 研究/陪伴运行时或 B 桌面游戏基座；DLC/付费是否在近期范围；默认 A + DLC 移出 release |
| **P0-5** | 远程市场在信任/协议/传输未闭合前被推进（当前已写 webview fetch 客户端） | N-P1-1、N-P1-2、A-P1-2、G-P1-6（部分） | 客户端已存在但未接产品；一旦接 UI 就会与 CSP 冲突或放宽 CSP，形成远程内容入口 | 保险丝：默认 `unconfigured`、产品路径零 fetch、CI 断言、文档写“离线契约”；上线必须过 E6-T1/T2/T3/T4 |
| **P0-6** | 插件对外发布不可自证（无 git/CI/spec/LOCK；embed 读私有仓） | A-P0-2、N-P1-7、S-P2-6、QA-P1-2 | 插件是 DSH 生态分发包；当前无真实 npm 发布（npm 仍 0.0.1），所以定 P0-6；**首次真实发布前必须关闭** | 私有/公开插件仓可单独 checkout 跑绿 test/check/verify；`npm pack` 含 spec/LOCK/版本映射；发布 tag 可追溯；否则不得发布 0.10.2+ |

> P0 边界：UX 的菜单/托盘、PSYCH 的危机地板/年龄门、QA 的 24h soak/数据链行为回归在各自专项 triage 中仍是 P0；本树不重复分级，只把执行入口作为依赖（如 QA-P0-3 → E4-T1）。本树只吸收与发布证据/数据隔离直接相关的部分（E0-T3、E0-T4）。

### 3.3 P1（15 条）

| ID | 问题 | 原始条目 | 依赖 | 主要任务 |
|---|---|---|---|---|
| P1-1 | 共享语义无单一权威源 + 双端无 conformance | A-P0-1、S-P1-3、G-P1-5、A-P1-3（部分） | P0-4（范围）、E1-T1 | E1-T1..T5 |
| P1-2 | 插件自包含构建/审计（若 P0-6 未触发） | A-P0-2、S-P2-6、N-P1-7、A-P2-8 | P1-1、E10-T3 | E2-T1..T3 |
| P1-3 | DSH 宿主适配层/能力协商缺失 | A-P1-1、A-P1-3、A-P2-7、S-P1-5 | 无（可并行） | E3-T1..T3 |
| P1-4 | main.ts/content hub/模块边界单体 + 无行为测试 | A-P1-4、S-P1-1、S-P1-2、S-P1-4 | P0-1（CI/测试护栏） | E4-T1..T4 |
| P1-5 | 持久化状态散落 + 角色切换整页 reload | S-P1-6、G-P1-4 | E4-T1/T2 | E4-T5、E5-T6 |
| P1-6 | 动画运行时双轨 + timing 6 处副本 | G-P1-1、G-P1-2 | E5-T1（权威声明） | E5-T2/T3/T4 |
| P1-7 | 角色注册表硬编码 + 动画资产包不可交付 | G-P0-1、A-P1-5、G-P1-5、G-P1-7 | P0-4、P1-1、E5-T2/T4 | E5-T5/T6/T7 |
| P1-8 | 市场/安装器协议、trust root、宿主传输、有界解压未闭环 | A-P1-2、N-P1-1/2/3/6、N-P2-1/2/3/4、G-P1-6 | P0-3/P0-5、P1-1 | E6-T1..T6 |
| P1-9 | Pet Brief/bridge/consent 双实现 | A-P1-3 | P1-1 | E1-T5 |
| P1-10 | Tauri 同源页面 storage 未隔离 | A-P1-7、QA-P1-7 | E0-T4、UX 窗口决策 | E4-T7 |
| P1-11 | 公开 famling 镜像与私仓 CI 断链 | A-P1-6 | P0-1、remote/托管决策 | E9-T1/T2 |
| P1-12 | 发布面未收口 + 依赖归位 + 无 bundle 预算 | S-P1-7、A-P2-6、G-P2-5 | P0-4（游戏页去留） | E7-T2/T4、E5-T8 |
| P1-13 | 资产预算：4.2 MB WAV + 首屏非 idle-first | G-P1-3 | 法务/音频权利（E10-T3） | E5-T8 |
| P1-14 | 云端出网（TTS/ASR/share）隐私/失败语义/响应上限 | N-P1-4、N-P2-5/7/11/12 | 无（网络专项） | E8-T1/T3 |
| P1-15 | 插件类型/日志/分发 provenance + bridge 纵深 | S-P1-5、A-P2-7、S-P2-4、N-P1-7、N-P1-5 | E2-T2 | E2-T3、E8-T2 |

### 3.4 P2（20 条，排期清债）

| ID | 问题 | 原始条目 | 归属/任务 |
|---|---|---|---|
| P2-1 | `voice → pet/security` 反向依赖 | A-P2-1 | E7-T4 |
| P2-2 | Electron 宿主/依赖仍在仓/发布面 | A-P2-2、S-P1-7（部分） | E7-T1 |
| P2-3 | 产品身份改名实现（DesktopGames→Famling、包名、AppData 迁移） | A-P2-3 | E10-T5 决策后 E7-T2 |
| P2-4 | 文档数量/索引/脚本说明/生成器共享层 | S-P2-1/P2-2、A-P2-4、G-P2-6 | E0-T3 + E7-T3 |
| P2-5 | 插件 i18n 内联（STRINGS/ locale 不一致） | A-P2-5 | E2-T3 |
| P2-6 | 契约文档多副本（bridge/Pet Brief/DSH） | A-P2-8 | E1-T4（可升 P1 文档部分） |
| P2-7 | scripts 工具 sprawl / 一次性探针 | S-P2-1 | E7-T3 |
| P2-8 | 本地构建产物/工作区卫生（target 4.8 GB、artifacts 12 GB/941 profile） | A-P2-9、QA-P2-2 | E7-T3 |
| P2-9 | 合规元数据强度两端不一致（license/aiProvenance/compatibility） | A-P2-10 | E1-T3/E6-T5 |
| P2-10 | 测试可移植性/Node 版本假设 | S-P2-3 | E0-T2（部分） |
| P2-11 | 具体错误处理（`toISOString`/`request.text` 在 try 外、死 locale 键等） | S-P2-4 | E2-T3 |
| P2-12 | 供应链/CI 细节（actions 未 pin SHA、无 clippy/fmt/audit/SBOM、构建期 npx） | S-P2-5、N-P2-8 | E0-T1/E8 |
| P2-13 | `content-library.ts` 4,568 行/三代 schema 并存 | S-P2-7 | E4-T3（拆分）/ E4-T5（v0.1 退役） |
| P2-14 | 点击穿透 60ms 轮询/readback 回退、性能修复无复测 | G-P2-1/P2-2/P2-4 | E5-T7 + QA 专项 |
| P2-15 | 三套游戏时间尺度/离线/存档语义不一致 | G-P2-7 | 产品 B 决策后另立 |
| P2-16 | 30s autosave 在 rAF 主线程/无 dirty-only | G-P2-8 | E4-T5 |
| P2-17 | QA/tinglan 概念包/多 actor 未产品化 | G-P2-9 | E5-T1（legacy 冻结） |
| P2-18 | 多显示器 DPI/缩放只读一次 | G-P1-8 | E5/P2（需实机） |
| P2-19 | dead clip（walk/attack）/human 眨眼收尾 | G-P1-7、G-P2-3 | E5-T7 |
| P2-20 | Sentry DSN URL 注入/导航白名单/市场隐私/TTS 缓存无上限 | N-P2-5/6/7/12 | E8-T3 |

补充（UX/PSYCH 专项，不纳入本树计数）：托盘/单实例/设置窗口/首次 coach mark、TTS AI 标签、静音/安静模式、年龄门顺序、危机卡、2h 健康提醒跨窗口、同源坐标菜单等；与本文任务交叉处在 §2.1 C-07/C-08 与 E0-T4/E4-T7 中作为依赖记录。

### 3.5 原 P0 的去向（四份 9 条 + QA/UX/PSYCH 交叉项；防止“P0 消失”）

| 原 P0 | 新归属 |
|---|---|
| A-P0-1（共享内容语义无单源） | **P1-1**（具体值漂移已消；工件化未做） |
| A-P0-2（插件构建不可自证） | **P0-6 / P1-2** |
| A-P0-3（发布信任/身份） | **P0-3**（含 DLC 条件 P0） |
| S-P0-1（质量门不存在） | **P0-1**（收窄为 CI/证据/真值） |
| N-P0-1（生产 DLC 根空） | **P0-3**（条件：若 DLC 仍发布） |
| N-P0-2（无可验证发布者身份） | **P0-3** |
| G-P0-1（市场不能交付新角色） | **P1-7**（内容市场范围由 P0-4 决定） |
| G-P0-2（release DLC 全失败） | **P0-3**（同 N-P0-1） |
| G-P0-3（玩法/形态未定） | **P0-4 决策门** |
| QA-P0-1（GUI 数据隔离） | **P0-2** |
| QA-P0-2（CI 从未运行） | **P0-1** |
| QA-P0-3（数据链无行为回归） | **P1-4**（E4-T1） |
| UX/PSYCH 的 7 条 P0 | 不在本树；依赖关系记入 C-07/C-08；对应 triage 文档负责 |

### 3.6 计数与覆盖

| 来源 | P0 | P1 | P2 | 合计 |
|---|---:|---:|---:|---:|
| ARCHITECT | 3 | 7 | 10 | 20 |
| SOFTWARE | 1 | 7 | 7 | 15 |
| GAME | 3 | 8 | 9 | 20 |
| NETWORK | 2 | 7 | 12 | 21 |
| **合计** | **9** | **29** | **38** | **76**（四份评审；七份合计 109） |

- 去重后：6 P0 + 15 P1 + 20 P2 + 5 决策门。
- 所有 76 条在附录 A 有去向；P2 合并展示，P0/P1 逐条。

## 4. ③ Epic → Task 树

### 4.0 读法

- **ID**：`E<n>-T<m>`；`E10` 为决策门（D-T）。
- **验收**：尽量写成命令/可观察状态；每项都至少有一个“反向验证”（改坏会红）。
- **估算**：人日，量级估计（单人、有测试可跑、不含评审/等待/外部证书）；不是承诺。
- **批次**：B0（第 1 周）→ B1（1–2 周）→ B2（2–4 周）→ B3（3–6 周）→ B4（4–8 周）；同一批次内部仍有依赖顺序，见“依赖”列。
- **风险**：低/中/高；高=可能触碰发布/安全/外部或产品决策。

### E0 发布证据与安全底线（P0-1/P0-2/P0-3/P0-5）

**Epic 目标**：让“绿/可发布/已签名/含 DLC/数据未动”这些声明第一次可机器复核；不涉及架构重构。

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E0-T1 | 建 remote + 把 CI 变成 required + 提供单一 `npm run ci`（与 ci.yml 同一组步骤，含 typecheck/test/validate/build；插件门由 E2 负责） | 干净 checkout 在 CI 真实跑绿一次并留 run 链接；`npm run ci` 本地等价；required 分支保护；README 引用状态文档 | 无 | 1.5 | 低 | B0 |
| E0-T2 | 干净 checkout/工具链可复现：`engines.node >=24`、声明 python3、修 2 个环境失败、给 8 个 skip 明确合法理由、临时目录一律 mkdtemp | Linux + Windows 两平台 CI：`tsc` 0、测试 0 fail、skip 列表与理由固定；无 `/mnt`/盘符/固定端口假设；`python --version` 缺失时明确失败或 skip | E0-T1 | 1 | 低 | B0 |
| E0-T3 | 状态真值生成：`scripts/gen-status.mjs` → `docs/STATUS.md`（commit/日期/版本/测试数/CI run/未知项）；README/HANDOFF 只引用它；历史文档加 superseded 头 | 重复运行结果稳定；README 不再出现手写当前数字/“CI 已跑”；docs-check 对“数字与 STATUS 不一致”报错 | E0-T1/T2 | 1 | 低 | B0 |
| E0-T4 | GUI/E2E 数据隔离（共享 QA）：Rust 读 `DG_QA_DATA_DIR` 覆盖 app data；E2E/soak 未设即 fail；`--reset-saves` 仅在 QA 目录内且只删存档文件；真实 appdata 前后哈希断言 | 测试全程不触碰 `%APPDATA%/com.perrylink.desktopgames`；`--reset-saves` 在真实路径被拒绝；appdata 哈希前后一致；证据落 artifacts/qa | 无（与 QA 共同） | 2 | 中 | B0 |
| E0-T5 | 发布身份/签名/措辞真值：先定义发布通道（C1 邀请 beta/C2 公开 unsigned/C3 公开 signed）；C1 至少 SHA256SUMS 外层签名 + README 验证命令；Authenticode 未到位时发布物/文案显式 unsigned-preview；禁止“signed/含 DLC”宣称 | 通道决策记录 + `minisign -Vm SHA256SUMS.txt` 通过 + 下载页/README 无未兑现宣称；C1 不要求证书但要求签名外层；C3 才要求 `Get-AuthenticodeSignature` Valid | E10-T2（DLC 口径）、C-13 | 2 | 中 | B0 |
| E0-T6 | DLC 生产信任根 ceremony + 重签 + release 门禁（**条件**：E10-T2 决定保留 DLC） | `verify-dlc-trust --exe` exit 0；两个 pack 生产签名；仓库 dev 包仍被拒；staged 正/反例进 release workflow；否则按 E10-T2 移除 DLC 资源 | E0-T5、E10-T2 | 1（+外部） | 高 | B1 |
| E0-T7 | 远程市场联网保险丝：产品路径默认 `unconfigured`、零 fetch；CI 断言未配置时无网络调用；`content-market.ts` 不进入产品 bundle；文档写“离线契约/未上线”；市场 UI 不提供真实刷新入口 | 构建图证明 content-market 不被 pet 入口引入；UI 默认“服务器未配置”；CI 测试在未配置状态断言 fetch 调用 0；若接 UI 必须先满足 E6-T3/T4 | 无 | 0.5 | 低 | B0 |

### E1 共享语义单源与 conformance（P1-1/P1-9）

**Epic 目标**：把“两个产品必须一致或显式声明差异”的语义变成一份可生成、可校验、可版本化的工件；**不统一 wire schema**（见 C-03）。

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E1-T1 | `docs/contracts/SHARED-SEMANTICS.md`：15 个共享面 × 权威文件/字段 × 当前双端值 × 故意差异 × 验证命令；先裁定内置角色 bundle/对话/声音/声明/事件→clip | 任取 cat/dog 能回答“为什么是这个值”；10 处已知差异逐条有结论（一致或声明+测试固定）；lead 签字 | 无（先写，可与 B0 并行） | 1 | 低 | B0 |
| E1-T2 | 版本化 spec 快照：`spec/face/0.1/{catalog.json,assets.json,schema/,LOCK.json}` + `scripts/gen-face-spec.mjs`；catalog 含内置角色/对话/声音策略/声明 canonical/character id 映射；assets 含三套动画逐文件 sha/帧数/regions sha；LOCK 含源 commit 与生成器版本 | 生成器幂等；`--check` 与仓库一致；改 library 不重跑生成 → CI 红；spec 只放共享语义，不复制两端完整 schema | E1-T1 | 3 | 中 | B1 |
| E1-T3 | 双端 conformance：famling 用 spec 校验 `library.json`；插件由 spec 生成 `ROLE_BUNDLES`/`EVENT_CLIPS`/声明常量（生成文件带 banner）；CI 双端漂移门 | 改任一角色/对话/声明值未同步 → 两端至少一端红；生成文件可重复生成；SPEC 版本写进产物 | E1-T2 | 3 | 中 | B1 |
| E1-T4 | 契约文档单源：`docs/contracts/` 放 bridge/DSH/Pet Brief 的唯一版本；其余副本由生成/导出产生或标 superseded；链接检查 | `grep` 不再出现两套 bridge 文档内容；docs-check 校验链接/版本；公开仓副本由 E9 导出 | E1-T1 | 1 | 低 | B1 |
| E1-T5 | consent/brief/bridge fixture 化：Pet Brief 投影 fixture（输入→允许字段/拒绝）；插件同意从 bool 升级 `{version,hash,acceptedAt}` + withdraw；bridge JSON Schema + 错误码表；双端跑同一 fixtures | 同一 fixture 两端结果一致；TOS/TTS/ASR 版本变更后旧同意失效并重弹；撤回后不再调用 speechSynthesis；bridge 非法输入有稳定错误码 | E1-T3 | 3 | 中 | B1 |

### E2 插件可独立构建/发布/自证（P0-6/P1-2）

**Epic 目标**：一台没有 `desktop-games` 工作树的机器上，从插件仓 checkout 能重建/校验发布物，并能解释它对应哪版 spec/资产。

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E2-T1 | vendored spec + LOCK；`embed-anims`/`verify-anims` 只读 spec/LOCK，不再默认读私有仓；缺 spec 直接 fail，不允许 skip；生成头记录 spec 版本/sha | 无私有仓环境 `npm test && npm run check && npm run verify` 全绿；删 spec → 明确失败；改一帧资产不重跑 → 红；`source-sha256` 可从 spec 追溯 | E1-T2、E10-T3 | 2.5 | 中 | B1 |
| E2-T2 | 插件 git + CI（test/check/verify/pack --dry-run/prepack）+ 版本/tag 映射 + 发布 provenance | 干净 clone CI 绿；`npm pack` 含 LOCK/spec 版本；tag 表映射 famling commit/spec/plugin 版本；发布页可核验；npm 0.0.1 占位被 deprecate | E2-T1 | 2 | 中 | B1 |
| E2-T3 | 插件类型/日志/错误：`@ts-check`+JSDoc 或 `tsc --checkJs`；结构化 catch 日志（stage/op/code，无正文/token）；修 `toISOString`/`request.text` 在 try 外；死 locale 键 | `npm run typecheck` 0；错误注入测试；日志不含敏感；76+→90 测试仍绿；错误码映射到用户可执行文案 | E2-T1 | 2 | 低 | B1 |

### E3 DSH 宿主适配层与能力协商（P1-3）

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E3-T1 | 单文件/单目录 host adapter：`DF/src/host/` 收拢 module loader、localStorage、speechSynthesis、SpeechRecognition、ctx connection/llm/schedule、readFile；业务模块不直接调用宿主 API | grep 业务模块无直接 `ctx.*`/`window.*` 调用；fake host 可替换；现有 90 测试通过 | 无 | 1 | 低 | B1 |
| E3-T2 | 可选服务 + 能力协商：`llm`/`schedule` 改可选；缺能力仍激活并 UI 明示“未连接模型/提醒不可用”；bridge 加 `hello` 返回 pluginVersion/wireVersion/capabilities/hostVersion；UI 降级 | fake context 缺 llm/schedule 时插件仍激活且有提示；`hello` 在 fake/真实 DSH 返回能力；新增能力可灰度 | E3-T1 | 2 | 低–中 | B1 |
| E3-T3 | HOST_BASELINE + `check-host.mjs` + DSH 0.3 演练：记录支持矩阵/探测；因宿主不强制 engines，本地检查越界；用固定 DSH checkout 做契约 smoke | check-host 对越界 manifest/engines 报红；0.3 rc drill 报告（通过/降级/阻塞）入库；CI 跑 fake-host + 固定版本 smoke | E3-T2 | 1 | 中 | B2 |

### E4 模块边界：main.ts / content hub / 状态（P1-4/P1-5/P1-10）

**Epic 目标**：先把行为测试网铺起来，再“搬运不改行为”地拆；最终 composition root 只做 wiring，content 分 pure/UI/IO，状态有版本与迁移。

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E4-T1 | main.ts 行为测试：启动失败→重试；坏 primary+好 .bak→恢复且不覆盖备份；角色主题应用→持久化+reload 分支；autosave 暂停/恢复；consent 门 | 每类至少 1 条行为测试（fake IPC/storage/DOM）；故意注入坏档/never-settle 会红；不依赖源码字符串 | E0-T1、E0-T4 | 2 | 中 | B2 |
| E4-T2 | 抽 save runtime + 事件绑定收口：`runtime/save.ts`；移除 import 即副作用（DOM 监听/定时器移入 `wirePetEvents`）；main 目标 <2000 行 | main 无模块级 DOM/timer 副作用；save 测试可注入；`main.ts` 行数验收；现有测试绿 | E4-T1 | 2.5 | 中 | B2 |
| E4-T3 | content runtime 抽出 + content-hub 拆分：`content/{model,ui,store}` 或 `content-hub/{controller,tabs/*,import-flow,a11y}`；import-flow 注入 File/DOM 可纯 Node 测；`initContentHub` 目标 <200 行 | 行为/DOM 契约不变；文件读取可单测；content-hub.test 改 import 后绿；无 `initContentHub` 千行函数 | E4-T1/T2 | 3 | 中 | B2 |
| E4-T4 | hero page 抽出 + composition root 预算：`runtime/hero-page.ts`；main <1200（目标 800）；依赖方向脚本 | 行数达标；hero 指针/拖动/DPR 行为测试；dep-direction 脚本绿；`__pet` 调试接口不变 | E4-T2/T3 | 2.5 | 中 | B3 |
| E4-T5 | 持久化 state store：`pet/state/{keys,store}.ts` 版本信封 + 迁移；覆盖约 30 个 key；插件 prefs 同构（schema/default/迁移）；坏 JSON 回 default | grep 无 ad-hoc localStorage（允许清单外 0）；旧键迁移测试；坏数据不崩；插件设置形状校验 | E4-T1 | 2.5 | 中 | B2 |
| E4-T6 | content hub/market 懒载 + bundle 预算门：动态 import；首屏只保留 catalog 元数据/入口；CI 打印字节余量；未配置市场零请求 | pet 首屏 JS 体积门（先定基线，不回升）；内容中心/市场 chunk 懒载；面包屑/交互回归 | E4-T3、E0-T1 | 1.5 | 低 | B3 |
| E4-T7 | Tauri 同源 storage 隔离验证/落地方案：验证每窗口 `data_directory` 或键空间前缀 + 启动断言；非 pet 页不得读 pet 同意/存档键；迁移方案；E2E 覆盖 | 技术验证报告（可行/不可行+成本）；自动化 storage 矩阵测试；升级不丢数据或提供迁移；非 pet 窗口读取被拒/断言 | E0-T4、Q9/UX triage | 2 | 中 | B3 |

### E5 角色/动画管线单源（P1-6/P1-7/P1-13）

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E5-T1 | `CHARACTER-PIPELINE.md`：权威=anim pack+regions+behavior；FCI 0.3 为外部接口；冻结 `tinglan-256`/`humanoid-default`/`pearl-placeholder`；Electron 去留引用 E7-T1；walk/attack 的“接入口或 spec-only”决策 | 文档给“新增角色只改哪几处”；`grep tinglan-256` 不在发布构建/导出；legacy 标记/清单；产品/美术签字 | 无 | 0.5 | 低 | B2 |
| E5-T2 | timing 单源：`src/pet/anim/timing.json`（clip/帧/fps/loop/layer/priority/holdMs + per-character override）；TS 与 3 个 Python 生成器都读它；CI 等价门 + 资产字节不变 | 改 timing 后未重生成 → CI 红；改生成器漏同步 → 红；`--check` 全绿；资产字节与当前一致 | E5-T1 | 2 | 中 | B2 |
| E5-T3 | 动画运行时单轨：behavior/SceneRuntime 为唯一状态机；`anim/idle.ts` 的 PRNG/冷却/anti-repeat 折叠或删除；`bubbles/interactions` 上移 host 或删除；迁移 17 个 scheduler 测试 | 无运行时 import 死模块；ambient 行为 golden trace 不变；测试数量/名称可解释；文档更新 | E5-T1 | 2 | 低–中 | B2 |
| E5-T4 | interactions 单源：`character.interactions.json`（regions+actions+says+behavior slots+voice policy）→ 生成 regions/behavior/插件 EVENT_CLIPS；CI 跨端一致 | 新增一个动作只改一处；双端都出现；漏生成 → 红；现有 regions/behavior schema 校验通过 | E5-T1/T2 | 3 | 中 | B2 |
| E5-T5 | 动画资产包 schema `famling.pet-anim/0.2`：manifest/帧或 atlas/regions/preview/license/ai/usage/files sha；复用内容包 zip 上限与路径校验；纯函数 + 负向 fixtures | schema 校验器覆盖恶意 zip/路径/大小/压缩比；不执行任何脚本；与 `famling.content-pack/0.2` 共享 envelope 字段 | E5-T1、E1-T1 | 3 | 中 | B3 |
| E5-T6 | 角色注册表 + 热切换：`HERO_CHARACTER_IDS` 改为内置 + 已安装 pack 列表；`switchHeroCharacter()` 热切换（失败保留旧角色）；持久化；内容中心可应用 | 纯数据包新增角色无需改代码；切角色 <1s 不刷新页面；损坏/未签名包 fail-closed；内置角色不受影响；回归 consent/TTS/存档 | E5-T5、E4-T5 | 4 | 中 | B4 |
| E5-T7 | dead clip/legacy/blink 收尾：按 E5-T1 决策给 walk/attack 接入口或冻结；冻结则从 payload/测试/文档移除；human idle_blink 对齐 idle_00 | 无“未声明入口的死 clip”；若冻结则 payload 减少有量化；human blink 差 <阈值；测试/文档同步 | E5-T1 | 1.5 | 低 | B3 |
| E5-T8 | 资产预算：42 WAV→Opus/OGG A/B（先 3 句，法务确认后再全量）；first-paint idle-first；dist/安装包预算门 | 安装包/首包减少约 3.7 MB（或法务否决时记录）；WebView2 播放实机通过；idle-first 首帧稳定；CI 字节预算 | E10-T3、E5-T2 | 2.5 | 中 | B4 |

### E6 市场/安装器协议与宿主传输（P1-8）

**Epic 目标**：把“在线市场”从契约推进到**离线可测**的完整链路：签名目录→防回滚→受限传输→有界解压→原子安装→卸载/回滚。仍然默认不联网。

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E6-T1 | catalog/transport v0.2 规范：`serial`（单调）、`expires`、`keyId`、mirror；HTTP 缓存/重试/限流/超时/失败码；客户端最高 serial 状态机；canonical JSON 跨语言测试向量 | 10+ 负向测试：旧 serial/过期/无 serial/降级/未知 key 全拒；纯函数不 fetch；文档含失败码表；不新增网络调用 | P1-1、C-04 裁定 | 3 | 中 | B3 |
| E6-T2 | trust root 校验与吊销：唯一 keyId/fingerprint 必须匹配/status/有效期/禁止 dev 指纹/active+revoked 同 id；core 验签前强制校验；吊销延迟文档/SLA | 负向 fixtures 全拒；篡改 fingerprint 被拒；发布文档写“吊销延迟=版本传播延迟”；DLC/market 共用口径 | E6-T1 | 1.5 | 低–中 | B3 |
| E6-T3 | 受限 Rust 传输命令：`market_fetch_catalog`/`market_download_pack`（或统一命令）；只接受已验签 catalog 的 URL；HTTPS/网段/重定向/大小/超时/并发；临时文件+sha；capability 只给 pet/main；CSP 不放宽 | CSP 文本不变；命令有正/负测试（http/私网/跨 host 重定向/超大/超时/hash 不符）；ACL 矩阵更新；无真实网络也能 fixture | E6-T1、E0-T5 | 3 | 高 | B4 |
| E6-T4 | 有界解压/原子安装/卸载：复用并抽出 bounded reader；拒绝 symlink/加密/zip64/重复/大小写碰撞/路径穿越；临时目录+rename；总写入/单文件/压缩比/磁盘配额；断电恢复；卸载只删本包 | 恶意 zip fixture 全覆盖；安装失败保留旧版本/清理临时；断电/中断无半装；卸载可逆；磁盘不足有界报错 | E6-T3 | 3 | 高 | B4 |
| E6-T5 | 签名资产包 envelope 收敛：content pack/anim pack/DLC payload 共用 `files[]+sha256+Ed25519+license/ai/usage` 外层；类型分发；旧 v0.2/v3/DLC 适配器；安装器归属/边界写进契约 | 同一测试 pack 三种类型都能验；未知类型拒绝；旧格式双读迁移；宿主解压边界写进 spec（谁解压/在哪/上限） | E6-T1/T4、E5-T5 | 4 | 高 | B4 |
| E6-T6 | 离线 fixture E2E + 市场 UI 受控接线 + 隐私告知：loopback HTTPS/fixture；catalog→download→hash→sig→unzip→install→rollback；UI 只在配置后显示；kill switch；市场隐私段落 | 端到端 fixture 通过且不访问真实网络；断网/失败有稳定错误码；未配置零请求；隐私文档更新 | E6-T3/T4/T5 | 2 | 中 | B4 |

### E7 发布面与遗留清理（P1-12 + P2）

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E7-T1 | Electron 归档/删除：移除 `app/electron/**`、electron devDependency、electron scripts；保留 tag/文档；preflight/build 不再依赖 | `npm install` 不再装 electron；grep 无 electron 脚本；发布构建无 electron；文档说明历史 | E10-T1（不选 Electron 路线） | 1 | 低 | B2 |
| E7-T2 | 产品构建 profile + 依赖归位：release 只构建 pet/setup/chat-import；demo/game 页另构建；pixi/cordis/sentry 移出产品路径或标 demo-only；bundle 预算门；产品身份改名按 E10-T5 | `dist` 页面白名单断言；依赖图证明产品不含 demo 依赖；首屏/总产物预算；安装包页数减少 | E10-T5、P0-4 | 2 | 低–中 | B3 |
| E7-T3 | 工作区卫生：`.gitignore` target/artifacts/cdp profiles；clean 脚本 dry-run + 隔离删除；scripts/README + 一次性探针归档；CI 干净 checkout | `git status` 干净；`artifacts/`/`target/` 不再拖慢扫描；删除操作有绝对路径确认；CI 不受本机产物影响 | 无 | 0.5 | 低 | B2 |
| E7-T4 | 分层修复：把 security 基元抽到 `src/security/`（或 shared）；voice 不再依赖 pet；依赖方向测试（允许边清单） | `import` 图无 voice→pet；30 行依赖方向脚本进 CI；现有测试绿 | E4-T2 | 1 | 低 | B3 |

### E8 网络/云出网硬化（P1-14/P1-15；与网络专项共用）

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E8-T1 | Rust 响应上限 + ASR 配额/退避：TTS/ASR/share 统一 `read_bounded_body`；ASR 日配额+令牌桶；408/425/429/5xx 最多 2 次退避 + honor Retry-After | Rust 单测覆盖超大响应/429/超时；ASR 配额测试；隐私文档与代码一致；不破坏现有缓存 | 无 | 2 | 中 | B3 |
| E8-T2 | 插件 bridge 纵深：content-type/Origin/sec-fetch-site/自定义头；owner 令牌桶；brief/task 超时；client 三路 AbortController + in-flight 禁用；错误码保留 | 负向 host 测试（415/403/429/超时）；并发/双击不重复发；宿主保护不被重复实现 | E3-T1 | 1 | 低 | B3 |
| E8-T3 | 隐私/遥测收尾：Sentry DSN 仅构建期注入；显式 `on_navigation` 白名单/外链走系统浏览器；市场数据流隐私段落；TTS 缓存 LRU/用量 | 配置测试；DSN query 注入被拒；外链不再导航 webview；文档/证据；缓存上限可测 | E6-T6、E0-T3 | 1.5 | 低 | B4 |

### E9 公开镜像/发布源（P1-11）

| ID | 目标 | 验收 | 依赖 | 人日 | 风险 | 批次 |
|---|---|---|---|---|---|---|
| E9-T1 | 导出即验证：`export-public-pet` 输出后在该树跑 tsc/build/公开测试子集；生成 `EXPORT-MANIFEST.json`（文件+sha+源 commit）；失败即导出失败；接 CI | 空目录导出命令产出可构建树；manifest 可核验；缺文件/坏引用 → 红；CI 跑导出 | E0-T1 | 3 | 中 | B3 |
| E9-T2 | 发布源映射 + 边界自动检查：`RELEASE-SOURCES` 记录公开 tag↔私仓 commit↔spec 版本；导出树检查（无 packs/scripts/target/敏感资产；元数据正确；无过期 WAV/测试数字） | 任一 release 可追溯到源 commit；边界检查进 CI；18-WAV/旧元数据类问题自动红 | E9-T1、E0-T3 | 1.5 | 低–中 | B4 |

### E10 决策门（不写代码，但阻塞任务；0.5 页/项）

| ID | 决策 | 默认（未拍板时） | 阻塞任务 | 拍板人 |
|---|---|---|---|---|
| E10-T1 | 产品形态 A（研究/陪伴运行时）或 B（桌面游戏基座） | **A**（与现行 TOS/研究定位一致）；B 才启用游戏基座/GAME R9 | E5-T6、E7-T2、E6-T6、游戏/市场范围 | 用户/产品 owner |
| E10-T2 | 近期是否做 DLC/付费；保留则 ceremony，否则从 release 移除 | **不做**：移除 release 内 DLC 资源/入口，暂停 ceremony | E0-T6、E7-T2、E6-T5 | 用户/商业/法务 |
| E10-T3 | 动画/美术/42 句 baked WAV 的公开与再分发许可；插件资产是否公开 | **只公开清单 sha，不公开字节**；WAV 压缩仅在书面许可后对外 | E2-T1、E5-T8、E9-T2 | 用户/法务/美术 owner |
| E10-T4 | updater v1 是否必须；吊销传播 SLA；证书采购 | **v1 不接 updater**，但 SECURITY/发布文档写吊销 SLA=发新版本 | E0-T5、E6-T2、E8-T3 | 用户/发布 owner |
| E10-T5 | 产品身份/版本策略：Famling vs DesktopGames、identifier、AppData/安装目录迁移、插件/app 版本轴 | 先统一对外名与 version 映射，**不立即改 identifier**（迁移另立）；改名随 E7-T2 | E0-T5、E7-T2 | 用户/产品 |

> E10 估算：每项 0.5 人日（owner 决策记录 + 默认值 + 触发条件）；风险按“阻塞任务”传导，决策越晚，P0/P1 越晚。验收 = 有签字/日期的决策记录，且被 §4 对应任务的“依赖”列引用。

### 4.1 任务数与依赖图（简）

- **53 任务** = 48 工程 + 5 决策门。
- 关键依赖链：`E0-T1→E0-T2/T3`；`E1-T1→E1-T2→E1-T3→E1-T5`；`E1-T2→E2-T1→E2-T2→E2-T3`；`E3-T1→E3-T2→E3-T3`；`E4-T1→E4-T2/T3→E4-T4`；`E4-T5→E5-T6`；`E5-T1→E5-T2/T3/T4→E5-T5→E5-T6`；`E6-T1→E6-T2/T3→E6-T4→E6-T5→E6-T6`；`E0-T5→E6-T3`；`E9-T1→E9-T2`。
- 可并行且文件不重叠：E3（插件）、E5（动画）、E4（pet 入口）在 B2 可三线并行；E1（docs/spec）与 E0（CI/发布）在 B0/B1 可并行。
- 不可并行：E4-T2/T3/T4 与 E0-T4/T5 文件不同但都触 main/发布；建议先 E0，后 E4。E5-T5/T6 与 E6-T5 都定义 pack envelope，需 C-03 裁定后由同一人 review。

## 5. ④ 明确不做的项

1. **不合并 famling 与 dsh-famling 运行时**，不共享 React/UI 运行时（ARCH D1/D3，所有评审无异议）。共享只做数据/语义/契约。
2. **不为了“统一”强行统一内容 schema**：`famling.content/0.2`、插件 `content-extension` v3、`famling.market-catalog`、`famling.pet-anim` 各自保留；只做共享语义 spec + envelope 收敛（C-03）。
3. **不在生产信任根/Authenticode/updater/身份口径闭合前上线远程市场或在线安装**；不放宽 CSP 换功能（C-04/P0-5）。
4. **不做大爆炸重写**：不重写 `src/pet`、不引入 React/Vue/状态库；不一次性拆完 content；不先重构 consent 策略层（安全审计驱动）。
5. **不做插件全量 TypeScript 迁移**：先 `@ts-check`/`tsc --checkJs` 拿 80% 收益；全量迁移在 E4/E5 之后评估。
6. **不先拆 `content-library.ts`**：它是校验最可靠的部分；等 main/content hub 拆分和 v0.1 退役计划后再拆（P2-13）。
7. **不做 Electron 现代化/维护**：只归档/删除；不为旧宿主修功能。
8. **不在产品形态（A/B）与 DLC 范围拍板前做付费/商业内容/新角色美术/第四套 rig**；不继续给 walk/attack 死 clip 调像素、不做 atlas（除非 E5 验收后按需）。
9. **不把“优化架构/重构”作为任务**：每个任务必须有可执行验收与反向验证；不接受“清理技术债”这种无法验收的标题。
10. **不在本树扩张 UX/心理/QA 专项**：菜单/托盘/设置窗口、危机地板/年龄门、覆盖率/soak/GUI 自动化由 sibling triage 承接；本文只保留依赖与验收约束。
11. **不先做远程市场服务端/CDN/支付/审核后台**：先协议/信任/离线安装链路；服务端与运营归属是 E6 之后的独立项目。
12. **不宣称“signed/含 DLC/已 CI”**：所有对外表述以 E0-T3 状态真值和 E0-T5 发布状态为准；未验证即写“preview/未签名”。
13. **不引入 monorepo/pnpm workspace/submodule**（ARCH §7.5 已论证）：用 spec 产物 + vendored LOCK + 导出镜像即可。

## 6. 建议执行批次与出口条件

> 假设 2–3 名工程师 + 1 名 owner；人日为量级估计。批次不是日历承诺；B0 不完成不进入对外发布动作。

### B0（第 1 周）— 停线：让“可发布/全绿/数据未动”可复核

| 任务 | 出口 |
|---|---|
| E0-T1、E0-T2 | 干净 checkout + CI 真实绿；`npm run ci` 等价；双平台矩阵；环境/ skip 有解释 |
| E0-T3 | `docs/STATUS.md` 生成；README/HANDOFF 不再手写当前数字；历史文档标快照 |
| E0-T4 | E2E/soak 不碰真实 appdata；`--reset-saves` 收窄；appdata 前后哈希一致 |
| E0-T5 | SHA256SUMS 外层签名 + 验证命令；unsigned 不得称 signed；发布清单记录真实状态 |
| E0-T7 | 市场默认 unconfigured、产品零 fetch、CI 断言；文档写“离线契约” |
| E10-T1、E10-T2、E10-T3 | 产品形态/DLC/资产许可三项决策记录（各 0.5 页，含默认与触发条件） |
| E1-T1 | 15 个共享面合同表草案（cat/dog 两个角色可回答“为什么是这个值”） |

**B0 出口**：CI/数据隔离/发布口径三条硬门通过；3 个决策有记录；共享语义表可评审。未过 B0 不启动 E5/E6 的功能性投入。

### B1（第 1–2 周）— 契约与插件自证

| 任务 | 出口 |
|---|---|
| E1-T2/T3/T4 | spec/LOCK 生成；双端 conformance 漂移门；契约文档单源 |
| E1-T5 | brief/consent/bridge fixtures 双端一致；插件同意版本化 + withdraw |
| E2-T1/T2/T3 | 无私有仓环境插件全绿；prepack/tag/版本映射；typecheck/结构化日志 |
| E3-T1/T2 | host adapter 单点；缺 llm/schedule 仍激活并提示；hello/capabilities |
| E0-T6（条件） | 若 DLC 保留：ceremony + 重签 + release gate 绿；否则按 E10-T2 移除 |
| E10-T4、E10-T5 | updater/证书口径 + 身份/版本策略记录 |

**B1 出口**：插件可在干净环境自证；双端语义漂移会红；DSH 缺能力可降级；发布信任/身份口径有 owner 记录。

### B2（第 2–4 周）— 运行时单轨与模块边界（文件基本不重叠的三线并行）

| 线 | 任务 | 出口 |
|---|---|---|
| PET 入口 | E4-T1/T2/T3/T5 | 行为测试；save/content 抽离；状态 store + 迁移；main 行数下降 |
| 动画/角色 | E5-T1/T2/T3/T4 | 管线权威文档；timing 单源；动画单轨；interactions 单源 |
| 其他 | E3-T3、E7-T1、E7-T3、E8-T1、E8-T2 | HOST_BASELINE/check-host；Electron 移除；工作区卫生；云出网/bridge 硬化 |

**B2 出口**：main <2000 且行为测试可注入；timing/动画无死双轨；interactions 单源；无 Electron；CI 包含这些门。

### B3（第 3–6 周）— 角色注册表/市场协议/发布面

| 任务 | 出口 |
|---|---|
| E5-T5/T7、E4-T4/T6/T7 | anim pack schema；dead clip 决策落地；hero page 抽出；懒载+预算；存储隔离验证 |
| E6-T1/T2 | catalog/transport v0.2 + trust root 校验；10+ 负向测试；纯函数不联网 |
| E7-T2/T4、E9-T1 | 产品构建 profile；security 分层；导出后验证 + manifest |

**B3 出口**：角色资产包 schema 可校验；市场协议离线可测；导出树可构建；发布面收口。

### B4（第 4–8 周）— 热切换/安装器/发布清理

| 任务 | 出口 |
|---|---|
| E5-T6/T8 | 数据驱动注册表 + 热切换；WAV/first-paint 预算（法务允许时） |
| E6-T3/T4/T5/T6 | Rust 受限传输；有界解压/原子安装；envelope 收敛；离线 fixture E2E |
| E8-T3、E9-T2 | 隐私/导航/缓存收尾；公开源映射/边界自动检查 |

**B4 出口**：市场链路离线端到端可演；发布可追溯；无“未声明入口/未签名/假 DLC”。

## 7. 待拍板问题（owner/lead）

| # | 问题 | 选项 | 建议默认 | 影响 |
|---|---|---|---|---|
| Q1 | 产品形态 A/B | A 研究/陪伴运行时；B 桌面游戏基座 | A（与 TOS 一致）；B 需 5–8 人试玩 gate | E10-T1；决定 8+ 任务 |
| Q2 | DLC/付费是否近期做 | 做/不做/仅数据 mod | 不做；从 release 移除 DLC 资源与宣称 | E10-T2/E0-T6/E6-T5 |
| Q3 | 动画/美术/42 句 baked WAV 的公开与再分发 | 全公开/只 sha/不公开 | 只公开清单 sha；WAV 压缩需书面许可 | E10-T3/E2-T1/E5-T8 |
| Q4 | Authenticode 证书/updater | 采购+接 updater；仅外层签名；都不做 | 先外层签名 + unsigned-preview 口径；证书/updater 另批 | E0-T5/E10-T4 |
| Q5 | 产品身份/改名/identifier 迁移 | 立即改/先对外名/不改 | 先统一对外名与版本映射；identifier 迁移单独立项 | E10-T5/E7-T2 |
| Q6 | 插件发布渠道 | npm/DSH 市场/私有分发 | 先私有+可自证；npm 发布前过 P0-6 | E2-T2 |
| Q7 | 市场服务端/CDN/审核归属 | 自建/第三方/不做 | 先不做；E6 只做离线 fixture | E6-T6 |
| Q8 | 共享 spec 放哪/对谁公开 | 私有 spec/公开镜像/公开 npm | 私有生成 + 公开清单 ssha；LOCK 随插件 vendored | E1-T2/E2-T1 |
| Q9 | 内容中心是否独立窗口 | 独立窗口/480 内模态/可缩放 pet 窗 | 先 E0-T4/E4-T7；再按 UX triage 决定 | E4-T7；UX 专项 |
| Q10 | 首屏预算政策 | 固定 78 KiB/按功能上调/不设 | 固定 78 KiB；上调需 owner 书面同意 | E4-T6/E5-T8 |
| Q11 | DLC 生产密钥保管/ceremony owner | 双人离线/单人/外包 | 双人离线；owner 指定保管人 | E0-T6 |
| Q12 | 证据/数据隔离的验收范围（E2E/soak 是否必须过真实 Windows） | 全量/最小/仅预览 | 发布前最小：安装/启动/读旧档/卸载保留存档 + appdata 哈希 | E0-T4/E0-T5 |

---

## 附录 A：四份评审条目去向（P0/P1 逐条；P2 分组）

### A.1 ARCHITECT（20）

| 原条目 | 去向 |
|---|---|
| A-P0-1 共享内容语义无单源 | **P1-1**；E1-T1..T5（具体 cat/dog 漂移已修，工件未做） |
| A-P0-2 插件构建不可自证 | **P0-6/P1-2**；E2-T1..T3 |
| A-P0-3 发布信任/身份 | **P0-3**；E0-T5/T6、E10-T2/T5 |
| A-P1-1 DSH 适配/能力协商 | **P1-3**；E3-T1..T3 |
| A-P1-2 市场/安装器系统设计 | **P0-5/P1-8**；E0-T7、E6 |
| A-P1-3 Brief/bridge/同意双实现 | **P1-9**；E1-T5 |
| A-P1-4 单体化与并行冲突 | **P1-4**；E4-T1..T4 |
| A-P1-5 角色/动画多管线+遗留 | **P1-7/P2-2**；E5-T1/T5/T6、E7-T1 |
| A-P1-6 公开镜像/CI 断链 | **P1-11**；E9-T1/T2 |
| A-P1-7 Tauri 同源 storage | **P1-10**；E4-T7 |
| A-P2-1 voice→pet 反向依赖 | P2-1；E7-T4 |
| A-P2-2 遗留 Electron | P2-2；E7-T1 |
| A-P2-3 旧产品元数据 | P0-3/P2-3；E0-T5、E7-T2 |
| A-P2-4 文档/测试数字漂移 | P0-1/P2-4；E0-T3 |
| A-P2-5 插件 i18n 内联 | P2-5；E2-T3 |
| A-P2-6 发布页未收口 | P1-12；E7-T2 |
| A-P2-7 插件客户端无类型检查 | P1-15；E2-T3 |
| A-P2-8 契约文档多副本 | P2-6；E1-T4 |
| A-P2-9 本地构建产物 | P2-8；E7-T3 |
| A-P2-10 合规元数据两端不一致 | P2-9；E1-T3/E6-T5 |

### A.2 SOFTWARE（15）

| 原条目 | 去向 |
|---|---|
| S-P0-1 质量门不存在+干净 checkout 必红 | **P0-1**；E0-T1/T2/T3（两个必红测试已修） |
| S-P1-1 main.ts 单体 | **P1-4**；E4-T1..T4 |
| S-P1-2 initContentHub 千行 | **P1-4**；E4-T3 |
| S-P1-3 内容目录/校验器三源 | **P1-1**；E1-T2/T3 |
| S-P1-4 测试金字塔倒置 | **P1-4**；E4-T1/T2 |
| S-P1-5 插件纯 JS/吞错 | **P1-15**；E2-T3/E8-T2 |
| S-P1-6 持久化散落/无迁移/reload | **P1-5**；E4-T5/E5-T6 |
| S-P1-7 产物含 demo/旧依赖/无预算 | **P1-12**；E7-T2/E5-T8 |
| S-P2-1 scripts sprawl | P2-7；E7-T3 |
| S-P2-2 文档漂移/膨胀 | P2-4；E0-T3 |
| S-P2-3 测试可移植性 | P2-10；E0-T2 |
| S-P2-4 具体错误处理 | P2-11；E2-T3 |
| S-P2-5 供应链/CI 细节 | P2-12；E0-T1/E8 |
| S-P2-6 插件构建不可重建 | P0-6/P1-2；E2-T1 |
| S-P2-7 content-library 单体/三代 schema | P2-13；E4-T3 |

### A.3 GAME（20）

| 原条目 | 去向 |
|---|---|
| G-P0-1 市场不能交付可玩新角色 | **P1-7**；E5-T5/T6（范围由 P0-4 决定） |
| G-P0-2 release DLC 全失败 | **P0-3**；E0-T6（条件） |
| G-P0-3 玩法/产品形态未定 | **P0-4 决策**；E10-T1 |
| G-P1-1 动画运行时双轨 | **P1-6**；E5-T3 |
| G-P1-2 timing 6 份副本 | **P1-6**；E5-T2 |
| G-P1-3 资产预算 WAV 4.2MB | **P1-13**；E5-T8 |
| G-P1-4 角色切换整页 reload | **P1-5**；E5-T6 |
| G-P1-5 角色/动作数据 4 份 | **P1-1/P1-7**；E5-T4 |
| G-P1-6 DLC 仅数据/Steam stub | **P1-8**；E6-T5（产品 A 下移出 release） |
| G-P1-7 dead clip/human 眨眼 | **P2-19**；E5-T7 |
| G-P1-8 多显示器 DPI | **P2-18**；E5/P2（需实机） |
| G-P2-1 点击穿透轮询 | P2-14；E5-T7/QA |
| G-P2-2 性能无复测 | P2-14；QA/性能专项 |
| G-P2-3 眨眼帧 | P2-19；E5-T7 |
| G-P2-4 插件懒载无真实 GUI 证据 | P2-20；QA 专项 |
| G-P2-5 首屏预算/内容层>动画 | P1-12/P2-4；E4-T6/E7-T2 |
| G-P2-6 文档/发布事实漂移 | P0-1/P2-4；E0-T3 |
| G-P2-7 三套时间尺度 | P2-15；产品 B 决策后 |
| G-P2-8 30s autosave 主线程 | P2-16；E4-T5 |
| G-P2-9 QA/tinglan/多 actor | P2-17；E5-T1 |

### A.4 NETWORK（21）

| 原条目 | 去向 |
|---|---|
| N-P0-1 生产 DLC 根空 | **P0-3**；E0-T6（条件） |
| N-P0-2 无发布者身份 | **P0-3**；E0-T5 |
| N-P1-1 市场传输/防回滚 | **P0-5/P1-8**；E0-T7、E6-T1（客户端已有防回滚） |
| N-P1-2 CSP 与市场冲突 | **P0-5/P1-8**；E0-T7、E6-T3 |
| N-P1-3 信任根生命周期/吊销 | **P1-8**；E6-T2 |
| N-P1-4 云出网隐私/语义/无上限 | **P1-14**；E8-T1 |
| N-P1-5 bridge 纵深/限流 | **P1-15**；E8-T2 |
| N-P1-6 下载/解压/安装未实现 | **P1-8**；E6-T4 |
| N-P1-7 插件分发/更新不可信 | **P0-6/P1-2**；E2-T2 |
| N-P2-1 SSRF/主机白名单 | P1-8；E6-T3 |
| N-P2-2 无镜像/CDN/缓存 | P1-8；E6-T1 |
| N-P2-3 限流/重试参数 | P1-8；E6-T1 |
| N-P2-4 下载大小/时间/磁盘配额 | P1-8；E6-T1/T4 |
| N-P2-5 Sentry DSN 注入 | P2-20；E8-T3 |
| N-P2-6 无导航白名单 | P2-20；E8-T3 |
| N-P2-7 市场隐私数据流 | P2-20；E6-T6/E8-T3 |
| N-P2-8 CI actions 未 pin | P2-12；E0-T1 |
| N-P2-9 无外层签名/清单 | **P0-3**；E0-T5 |
| N-P2-10 dirty tree/陈旧 dist | P0-3；E0-T5/E0-T1 |
| N-P2-11 出网实现细节 | P2-20；E8-T1 |
| N-P2-12 TTS 缓存/额度无上限 | P2-20；E8-T3 |

## 附录 B：本轮实测证据（2026-11-19 14:00–14:40，Windows Node 24.22.1 / WSL2 复核）

| 检查 | 命令/位置 | 结果 |
|---|---|---|
| 当前 HEAD/工作树 | `git rev-parse HEAD`；`git status --porcelain` | `7107a61b6323fe0a499b9823bd358ffb21857485`；仅 2 个文档改动 + 本报告 |
| 评审后提交 | `git log --oneline -3` | `7107a61`/`0bbbe43`/`d5655c9` |
| 类型检查（当前树） | Windows node `node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| 测试（当前树） | Windows node `node --import tsx --test tests/*.test.ts` | **1,176 tests / 1,171 pass / 2 fail / 3 skip**；2 fail 均为 `pet-anim-cat.test.ts` 生成器 `--check/--verify` 返回 9009（本机无 `python3` 命令），非产品断言 |
| 干净 checkout | `git archive HEAD` → `D:\dg-baseline`（junction node_modules），Windows node | `tsc` exit 0；**1,176 / 1,166 pass / 2 fail / 8 skip**；2 fail 同 python3 环境；8 skip 为 dist/release 证据类 |
| 插件测试（当前） | `plugins/dsh-famling && node --test test/*.test.js` | **90 tests / 90 pass** |
| 插件单独 clone（模拟公开仓） | `cp -r` 到 `/tmp/dg-plugin` 后 `node --test`/`embed-anims --check`/`verify-anims` | 测试 **87 pass / 3 skip**；`embed-anims --check` **失败**（缺私有资产，明确报错）；`verify-anims` **OK**（跳过字节对源） |
| 插件首屏/预算 | `scripts/embed-anims.mjs --check`、`verify-anims.mjs` | `client.js` **75.3 KiB**；首绘 **137.1 KiB**；全量 **322.7 KiB**；预算 `FIRST_SCREEN_BUDGET_BYTES` 78 KiB（`verify-anims.mjs:62`） |
| 插件 VCS/CI/工件 | `ls .git .github spec LOCK.json` | 均不存在；`package.json` 0.10.2；无 prepack |
| 生产 DLC 信任根 | `native/dlc-verify/trust/production-trust-root.json` | `keys` 数组为空；policy `allowLegacySignatureWithoutKeyId:false` |
| 更新/身份 | `app/tauri/src-tauri/{Cargo.toml,tauri.conf.json}` | 无 updater；`DesktopGames/0.1.0/com.perrylink.desktopgames`；CSP `connect-src 'self' ipc: http://ipc.localhost` |
| 桌面菜单/设置 | `src/pet/desktop-shell.ts`；`tests/desktop-shell-menu.test.ts` | 根动作 6 个；二级；设置 dialog（静音/音量/减少动态/复位/保存/读取）；开发面板 `debugMode` 才渲染 |
| 角色主题/bundle | `public/content/library.json`；`plugins/dsh-famling/client.js:76-146` | cat standard/night/dark/serif；dog standard/paper/paper/system；dialogue 240/70%、80/40%、50/5%；插件 same；high-contrast 无插件实现、注释映射 night |
| 市场客户端 | `src/pet/content-market.ts`；`grep content-market.ts src` | 2,094 行；仅 tests import；`activeMarketSource=null`；catalog schema 0.1；无 `validateContentTrustRoot` |
| 内容/入口规模 | `wc -l`；`grep` | main 3,607 行/49 import/35 个 `let`/67 个 addEventListener；content-hub 2,315 行（`initContentHub` 约 1,027 行）；content 层合计 10,247 行 |
| 动画/角色 | `grep`/`wc` | `HERO_CHARACTER_IDS` 4 个硬编码；`anim/idle.ts` 500 行无运行时 import；无 `timing.json`；角色切换 `main.ts:1167` reload；DPR 单次 `main.ts:2776` |
| 存储/数据隔离 | `grep DG_QA_DATA_DIR、app_directories_override` 源码 | 0 命中（仅旧构建产物二进制命中）；E2E 仍断言/传真实 `%APPDATA%/com.perrylink.desktopgames` |
| 分层/遗留 | `grep`/`ls` | `voice/service.ts:11`、`voice/types.ts:1` 反向依赖 pet/security；Electron 遗留宿主 `app/electron/**` + `electron@^45.3.0`；Vite 9 入口 |
| CI/remote | `git remote -v`；`.github/workflows/ci.yml:3-6`；`README.md:11` | 无 remote；CI 自述“加 remote 前不运行”；README 称远端已建/CI 已加入（假事实） |

### B.1 限制（如实声明，不能当已验证）

- 未构建/启动当前源码的 Tauri/WebView2 GUI；未跑真实安装/卸载/签名/updater/点击穿透/多屏；未连接真实 DSH/LLM/市场服务器。
- WSL 下 Vite build 失败（`@rolldown/binding-linux-x64-gnu` 缺失，node_modules 为 win32 依赖）；`node --import tsx src/pet/consent/cli.ts` 因子进程 esbuild 平台不匹配失败。本文测试数字使用 Windows node；与 CI/Linux 结果可能有环境差异（E0-T2 正是要消除这种差异）。
- 评审行号是旧快照；本文引用的当前行号以 `7107a61` 为准，但工作树在评审后仍有文档改动，行号可能小幅漂移。
- 未做市场/签名/网络实测；E6 的“离线 fixture 通过”是未来验收，不是现状。

## 附录 C：与 sibling triage 的接口（防止任务重复）

| 领域 | 本文只做 | 交给 sibling |
|---|---|---|
| UX | 菜单/设置的“结构性”事实与 C-08 裁定；内容窗口依赖（C-07） | 根菜单 IA/托盘/设置窗口/coach mark/字号层级/键位与焦点 |
| 心理学 | 安静控制/年龄门在 C-08、Q 中的依赖 | 危机地板、首启同意、2h 健康提醒、夜间文案、AI 标识、roleplay 口径 |
| QA | 质量门/数据隔离/行为测试入口（P0-1/P0-2/E4-T1） | GUI E2E 自动化、覆盖率、soak、故障注入矩阵、发布证据归档 |
| 安全/网络 | Rust 传输/解压/信任根（E6）、云出网硬化（E8）的架构与验收 | TTS/ASR 隐私文本、市场隐私告知、Sentry/导航、密钥管理流程细节 |
| 已落盘的 sibling triage | 只引用，不重复：`REVIEW-TRIAGE-P0`（19 条 P0 归并/依赖）、`-QUALITY`（QA/性能/资产）、`-SECURITY`（安全/网络/发布）、`-UX`（UX/心理/无障碍） | 各文件自己的 P0/任务 ID；若与本文计数不同，以各自域的定义为准，合并时以 lead 的路线图为准 |

---

## 结语（给 lead 的 3 句）

1. 不要把 19 个 P0 全排进第一批：当前真正阻塞发布的是 **CI/证据、GUI 数据隔离、发布身份/签名口径**，加上 3 个产品决策；其余是 P1/P2。
2. 评审里已有 13 项被后续提交解决/部分解决（菜单、插件零按钮、角色 bundle、干净 checkout、市场客户端等）；先按本报告 §2.3 重核，能省掉一批返工。
3. 第一批最小集合：`E10-T1/T2/T3` 决策 + `E0-T1/T2/T3/T4/T5/T7` + `E1-T1`；完成后才启动内容中心/角色资产包/市场传输的功能性投入。

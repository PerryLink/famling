# P0 冲突 / 依赖三角与重新分级（famling / dsh-famling · 2026-11-19）

> 任务：task-67（P0 冲突/依赖三角）。输入：七份 `docs/research/PROJECT-REVIEW-*.md` + 汇总索引 `PROJECT-REVIEW-ALL-FINDINGS-2026-11-19.md`；输出：本文件。
> 性质：**只读分析**，未修改代码/资产，未联网；所有结论可用文末命令复核。

## 0. 口径、快照与证据等级

### 0.1 本文件回答什么

1. 七份评审共 19 条 P0（架构 3 / 软件 1 / 网络 2 / 游戏 3 / QA 3 / 心理 3 / UX 4）里，哪些是**重复**、哪些**互相矛盾或前提冲突**、哪些已被评审后的提交**部分/全部关闭**。
2. 把 19 条重新归并、重新分级，并给出**依赖图**与**最小可行修复**（MVR）。
3. 把落地工作拆成 `Epic → Task`（ID / 目标 / 验收 / 依赖 / 估算 / 风险 / 顺序），并写明**明确不做**的项。

### 0.2 两个快照：评审快照 vs 当前 HEAD

| 项 | 值 |
|---|---|
| 评审快照 | HEAD `779354b`（2026-11-19 10:57）+ 脏工作树；各报告写作于 12:59–13:12 |
| **当前 HEAD** | **`7107a61`（2026-11-19 14:09:06 +08）** |
| 评审之后的提交 | `d5655c9`（13:35 内容 v2 / 角色=主题 / 资产包 / 最小右键菜单）、`0bbbe43`（13:56 远程市场客户端 v1）、`7107a61`（14:09 保存后退出入根菜单） |
| 工作树 | 代码干净；写作时仅 4 个文档改动（`docs/art/**`、`docs/research/COMPETITORS-CHINA-DSH.md`、未跟踪的 `ALL-FINDINGS`），随后其它 triage 文档落盘，均为 `docs/plan/*`，与本次结论无关 |
| 本轮执行 | `npx tsc --noEmit` → exit 0；定向测试 `desktop-shell-menu + desktop-shell` **32/32 pass**、`use-restrictions + ui-assets` **18/18 pass** |
| 本轮未执行 | 全量 `npm test`（WSL 侧 `node_modules` 是 win32 原生 esbuild，无法在 Linux 复跑；Windows 侧本机无 Python，生成器测试返回 9009）；CI（仓库无 remote，从未跑过）；Tauri/WebView2 真机 |

**关键事实：评审后的三个提交改变了至少 8 条 P0 的现状**，直接按 12:59 的原文派活会重复劳动或修一个不存在的问题。本文件逐条复核当前代码，不采信摘要。

### 0.3 证据等级

| 级 | 含义 | 本文件用法 |
|---|---|---|
| **A** | 本文件在 HEAD `7107a61` 上实测/可复核（命令、测试、`file:line`） | 用于“当前状态/已关闭”判定 |
| **B** | 评审原文在本轮快照上的实测（含测试数字、二进制行为） | 用于仍需外部条件/未变项的判定 |
| **C** | 静态推断/配置/文档推断（未实机） | 仅用于方向判断，不作完成证据 |

### 0.4 ID 规则

- 原文 P0 保留原编号：`ARCH-P0-1` / `SW-P0-1` / `NET-P0-1` / `GAME-P0-1` / `QA-P0-1` / `PSY-P0-1` / `UX-P0-1`。
- 归并后的工作项用新 ID：`DECIDE`（决策）、`SAFE`（数据安全）、`GATE`（质量门）、`PLUG`（插件安全）、`REL`（发布信任）、`CS`（内容语义）、`UXQ`（安静/可达）、`WR`（窗口召回）、`BT`（行为测试）、`GC`（游戏/内容交付）。
- 状态四值：**关闭**（当前代码已解决且有测试/证据）/ **部分关闭**（主风险已消，有残项）/ **开放**（未变）/ **决策阻塞**（需 owner/用户拍板，工程不得擅自做）。

## 1. 执行摘要

### 1.1 一句话判断

**19 条 P0 里有 10 条落在“产品/发布/验证”三角的 6 个仍为 P0 的问题面上（其中 REL 的 4 条是同一根因的重复计数），另 7 条被 13:35–14:09 的三个提交部分或全部关闭；真正需要本周动手的只有 6 个面（其中 1 个是 owner 决策、2 个含外部阻塞）。** 如果不先裁定产品形态，市场/DLC/发布信任的 P0 会互相等待；如果不先做数据隔离与真实 CI，“已修复”就没有证据。

### 1.2 依赖三角（为什么这些 P0 不能各自独立做）

```
                     ┌──────────────────────────┐
                     │ A. 产品形态 / 市场范围   │  ← GAME-P0-3（决策）
                     │    A=陪伴运行时 / B=游戏基座 │
                     └───────────┬──────────────┘
                                 │ 决定 B 方是否成立
        ┌────────────────────────┼─────────────────────────┐
        ▼                        ▼                         ▼
┌──────────────────┐   ┌────────────────────┐   ┌──────────────────────┐
│ B. 发布信任链    │   │ C. 可玩新角色/资产包 │   │ D. 对外文案/身份/收费 │
│ REL（4 条原 P0） │   │ GC（GAME-P0-1）     │   │ DECIDE/REL-T5         │
└────────┬─────────┘   └────────────────────┘   └──────────────────────┘
         │ 需要“可验证构建”作为前提
         ▼
┌───────────────────────────────────────────────────────────────────────┐
│ E. 质量门/真实 CI（SW-P0-1 + QA-P0-2）  ← 没有它，上面所有“已修”不可证 │
└───────────────────────────────────────────────────────────────────────┘
         │ 同时需要守住用户数据与法律/心理底线（与顺序无关，必须并行）
         ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│ F. 数据安全 SAFE（QA/UX） │   │ G. 插件安全地板 PLUG（心理）│
└───────────────────────────┘   └───────────────────────────┘
```

三角的实质：**产品决策**决定“要不要发布/收费/DLC”；**发布信任**决定“能不能可信地发”；**质量证据**决定“凭什么说发布物是对的”。三者互为前提，而 UX/心理是必须并行的底线约束（数据不可丢、可静音、危机有出口）。因此排序不是“谁最严重”，而是：**先决策（解锁范围）→ 先底线（数据/安全）→ 再补证据（CI）→ 最后才做依赖外部条件的发布闭环。**

### 1.3 数字：19 → 14 → 6

| 维度 | 数量 | 说明 |
|---|---|---|
| 原文 P0 | **19** | 七份评审合计 |
| 去重后独立问题面 | **14** | REL 吸收 4 条、GATE 吸收 2 条、QUIET 吸收 2 条、其余各 1 条 |
| 当前仍为 P0 的动作面 | **6** | DECIDE、SAFE-01、SAFE-02、GATE、PLUG、REL（条件式） |
| 降为 P1 | **8 条原 P0** | ARCH-P0-1/2、GAME-P0-1、QA-P0-3、PSY-P0-1/3、UX-P0-2/4 |
| 关闭 | **1 条原 P0** | UX-P0-1（右键菜单 IA） |
| 当前状态统计 | 关闭 1 / 部分关闭 7 / 开放 11 | 截至 HEAD `7107a61` |

### 1.4 最重要的 3 个矛盾（详见 §2）

1. **M1 产品形态 vs 市场/DLC 投入（路线级前提冲突）**：GAME-P0-3 说玩法与形态未验证、应先二选一；但 13:35–13:56 的提交把内容市场/远程客户端/资产包当主线推进，REL 四件套也默认“要发 DLC/市场”。当前同时执行 A（研究原型/工作助手）与 B（商业内容平台）两套前提。
2. **M2/M3 发布信任被重复计为 4 个 P0、质量门被重复计为 2 个 P0，且“必红”证据已过时**：REL 的 4 条原 P0 是同一根因的不同视角，真正关键路径是外部 ceremony/证书；GATE 的 2 条中“干净 checkout 必红”的两个必然失败测试已在 `d5655c9` 修复（本轮 18/18 通过），但“README 宣称已建 remote/CI 首跑”仍是假的。
3. **M13 跨产品能力与法律口径冲突**：famling README 写“不提供自由 LLM 对话/情感陪伴”，而 dsh-famling 有真实 LLM 自由聊天且无危机资源/发送去向/清除入口；插件 LEGAL-NOTICE 版本仍写 0.8.5，package 已是 0.10.2，README 写 0.10.1。

### 1.5 建议第一批（详见 §4.3）

| 批次 | 动作 | 人日 | 并行线 |
|---|---|---|---|
| 0（当天） | `E0-T1` 产品形态一页决策；`E2-T2` 的 README/HANDOFF 纠错部分（0.1 人日，可先于 E2-T1 做）先把 remote/CI/测试声明改成事实 | 0.6 | owner/lead + 1 人 |
| 1（第 1–3 天） | `E1-T1` 数据隔离、`E1-T2` 存档/退出残项、`E2-T1/T2` `npm run ci` + 私有 remote 首跑、`E3-T1~T3` 插件安全地板 | 约 4.5–6 | 3 条线并行（数据 / 门禁 / 插件） |
| 2（第 3–7 天） | `E5-T1` 冻结 signed/DLC 宣称 + staged DLC 门禁测试、`E5-T3` SHA256SUMS 外层签名、`E2-T3` rust 门禁 required、`E4-T1` 插件 git/CI、`E6-T1` 共享语义表 | 约 3–4 | 与 owner 的 DLC/证书 ceremony 并行启动 |

**最小可行修复（MVR）= 批次 0 + 1 + 批次 2 的 E5-T1/T3：约 5.5–6.5 人日**（不含 owner/外部 ceremony），即可把 6 个 P0 面全部降级为“有验收证据/明确外部阻塞”。

---

## 2. ① 矛盾 / 重复 / 陈旧结论清单

### 2.1 重复聚类（去重表）

| 聚类 | 涉及原 P0/P1 | 为什么是重复 | 裁定 |
|---|---|---|---|
| **REL 发布信任链** | ARCH-P0-3、NET-P0-1、NET-P0-2、GAME-P0-2（+ SW-P2-6、QA-P1-1） | 同一根因（生产信任根空 → legacy 包 → NotSigned/无 updater/无外层签名/身份旧）被四种视角计 4 次；派活会重复动同一批密钥/配置/发布脚本 | 合并为 **E5 REL**，6 个任务（工程门禁 3 / owner 外部 2 / 政策决策 1）；仅按“是否对外分发/DLC”条件式保留 P0 |
| **GATE 质量门** | SW-P0-1、QA-P0-2（+ QA-P1-1/P1-6、SW-P2-5） | 两条都指向“无 remote/CI 从未跑/干净 checkout”；QA 多覆盖隔离与证据归档 | 合并为 **E2 GATE**；验收改为“干净导出 + `npm run ci` 绿 + GitHub 首跑绿 + 插件/rust 门禁”，不再接受“树红/必红”旧口径 |
| **QUIET 安静控制面** | PSY-P0-1、UX-P0-2（+ PSY-P1-4、UX-P1-5/P1-7） | 都是“壳把静音/音量/动效/隐藏/设置藏起来”；心理从 WCAG/控制感切入，UX 从可达性/IA 切入 | 合并为 **E7 UXQ**；主风险已由设置弹窗消除，残项 P1 |
| **内容语义** | ARCH-P0-1（+ SW-P1-3、GAME-P1-5） | 同 id 不同值 + 三份手写目录 + 无 conformance | 合并为 **E6 CS**；schema 独立保留，只共享语义单源 |
| **插件自证** | ARCH-P0-2（+ QA-P1-2、SW-P2-6、NET-P1-7） | 插件跨私仓生成 + 无 git/CI + 缺资产时 skip | 合并为 **E4 PLUG-TRUST**；P1，发布插件时升 P0 |
| **窗口召回** | UX-P0-4（+ PSY-P2-10、UX-P2-8） | 无托盘/无 clamp/无单实例 | 合并为 **E7 WR**；复位入口已补，托盘 P2 |

### 2.2 真矛盾与裁定（需要 lead/owner 表态的）

#### M1 产品形态 vs 内容市场/DLC 投入（路线级，最重要）
- **甲方**：GAME-P0-3 / GAME §7 阶段 0：玩法循环与产品形态未定义、未验证（三个 demo 仍 `demo:true`，试玩 gate 未执行）；`README`/`USE-RESTRICTIONS` 把产品定位为研究原型/工作助手，`DECISIONS-RECOMMENDED-2026-11-17` D-13 也是“工作助手为主”。结论：未二选一之前，商业内容/DLC 的投入有路线级返工风险。
- **乙方**：评审后的 `d5655c9`/`0bbbe43` 把“角色=主题”内容中心、内容包 v2、远程市场客户端、内容包导入当主线交付；ARCH-P0-3/NET-P0-1/GAME-P0-2 的验收也默认“要发 signed DLC/市场”。
- **为何冲突**：同一批 P0 的前提互斥——若选 A（陪伴运行时/研究原型），REL 应降级/冻结，市场只保留离线能力；若选 B（桌面游戏基座），必须先过 5–8 人试玩 gate，再谈市场。当前事实是 B 的商业层已先于判据建立。
- **建议裁定**：`E0-T1` 当天出一页决策（A/B、市场是否含新角色、DLC/收费 in/out、B 的 playtest gate 与指标）。默认按 A 执行 P0 并冻结对外市场/DLC 宣称；选 B 则先跑试玩 gate，GAME 相关项升 P0、REL 仍 P0 但排在试玩之后。**决策前禁止把市场/收费/DLC 写进 README/商店文案/路线承诺。**

#### M2 发布信任链的重复计数与关键路径误判（重复 + 估算冲突）
- **甲方**：ARCH-P0-3 把身份/DLC/Authenticode/updater 打包成一条 P0，估“工程 3–5 人日 + 外部”；NET-P0-1/P0-2 各自成条；GAME-P0-2 再从游戏侧报一次。
- **乙方**：NET 的 §9 与 `RESOLUTION-DLC-SIGNING`/`RESOLUTION-AUTHENTICODE` 显示真正的关键路径是**外部 ceremony/证书**，工程只是门禁与脚本；ARCH 的 3–5 人日没有把外部等待算进去。
- **为何冲突**：4 条 P0 同时派活会重复实现同一门禁；而把外部项当“工程 3–5 天”会给出错误时间预期。
- **建议裁定**：合并 `E5`；拆“工程门禁（E5-T1/T3/T5）”“owner 外部（E5-T2/T4）”“政策决策（E5-T6 updater）”；P0 评级加条件：**只要对外分发/收费/DLC，REL 即 P0；默认 A 路线下降为 P1 + 冻结 signed/DLC 宣称**。

#### M3 “干净 checkout 必红/当前树红” vs 已修复 + 快照互斥（重复 + 陈旧证据）
- **甲方**：SW-P0-1（1046 tests / 4 fail：`use-restrictions` 读兄弟仓、`ui-assets` 读被 gitignore 的 contact sheet）；QA-P0-2（同，且“当前树 5 fail”）。
- **乙方**：`d5655c9` 已修（`tests/use-restrictions.test.ts:54-64` 对兄弟仓缺失显式 skip；`public/assets/ui/manifest.json` 的 `contactSheets` 已指向被跟踪的 `docs/art/ui-91-qa/*`）；本轮定向 18/18 通过；13:10 评审自身也记录工作树已 1118/1118 绿。三份报告对“树红/树绿”的记录不一致，是并发编辑快照差异。
- **为何冲突**：若按原文验收，会去修已经修好的两个测试；若忽略“无 remote/CI 从未跑”，又会让所有“已修”无证据。
- **建议裁定**：合并 GATE；删除“必然红”验收，改为“干净导出 + `npm run ci` 绿 + GitHub 首跑绿 + 不依赖 gitignored 产物/兄弟仓”；“树红”记录为并发证据，不作产品结论。

#### M4 年龄核验顺序：评审建议 vs 已记录的 user decision（真冲突，须用户重拍）
- **甲方**：PSY-P0-3：首启在读 TOS 前强制自报出生日期，但 roleplay 无公开入口；建议移除或移到 roleplay 入口，至少 TOS→年龄；并把采集最小化为成年布尔/年龄段。
- **乙方**：`src/pet/consent/gate.ts:377-380` 注释明写「ORDER IS A HARD CONTRACT (user decision): age self-report -> TOS -> app」；README 把年龄自报列入合规叙事。
- **为何冲突**：评审建议直接改动用户已拍板的合规顺序；擅自改可能破坏既定合规设计与文档一致性。
- **建议裁定**：`E0-T3` 提交用户/法务重新决策；未拍板前**不改代码**。推荐选项 A（移到 roleplay 入口）并附影响清单（TOS/PRIVACY/CONSUMER 文档、既有用户）；若维持现顺序，则标注 accepted risk 并补“为什么现在需要、不用于什么”的一行说明（不增加采集）。

#### M5 零按钮/极简菜单 vs “必需控件必须可见”（真冲突，已由实现+裁定收口）
- **甲方**：UX-P0-1/P0-2（旧菜单 23 项、隐藏控件）要求控件可见可达、根菜单 ≤9 项。
- **乙方**：task-62/63/65 与用户指令要求“零常驻按钮 + 右键分级菜单”；插件 0.10.1 明确“默认只渲染角色”，本轮 famling 也落地 6 项根菜单 + 设置弹窗。
- **为何冲突**：可发现性（可见按钮）与极简（零按钮）方向相反；评审快照测的是旧菜单。
- **建议裁定**：**维持零按钮为用户决定**；残余用“首次一次性提示 + 右键/Shift+F10 说明 + 设置内控件补齐”解决，不新增常驻按钮（写入不做项）；UX-P0-1 关闭，UX-P0-2 残项 P1。

#### M6 远程市场客户端用 webview fetch vs 网络评审“必须 Rust 下载器、不得放宽 CSP”（新代码引入的真冲突）
- **甲方**：task-66 的 `src/pet/content-market.ts` 默认 transport 是 `globalThis.fetch`（可注入；当前 `activeMarketSource=null`、未接产品路径，但 `CONTENT-MARKET` §11 给的接线方式是“宿主注入 client”）；一旦接线，远程目录/包下载将在 Tauri WebView2 中发起。
- **乙方**：NET-P1-2 明确：当前 `tauri.conf.json:30` 的 CSP 是 `connect-src 'self' ipc: http://ipc.localhost`；按 `RemoteMarketSource` 直接 webview fetch 会与 CSP 冲突；正确解法是**新增受限 Rust 下载命令**（复用 `reqwest`），不能放宽 CSP。ARCH-P1-2 也要求安装器系统设计。
- **为何冲突**：实现路径与已评审的安全决策相反；即便客户端 fail-closed，真联网时要么 100% 被 CSP 拒，要么被诱导把外域加进 `connect-src`（扩大攻击面）。
- **建议裁定**：保留 `content-market.ts` 作为可注入核心；`E6-T4` 增加 Rust `market_fetch` 桥（host allowlist/大小/超时/重定向/仅 HTTPS，复用已有 `reqwest`），UI 注入该 transport；**禁止修改 CSP 的 `connect-src` 为外域**；桥完成前市场页保持“未配置/只读”。

#### M7 “两套 schema 独立” vs “共享语义单源”（表面冲突，可解）
- **甲方**：CONTENT-MARKET §3.7 决策保留两套内容 schema 独立；ARCH §7.5 也明确“不为了统一而强行统一两套 schema”。
- **乙方**：ARCH-P0-1 要求“单一权威源/spec”。
- **为何冲突**：字面上“独立”与“单源”矛盾；实际是两个层次（完整 schema vs 共享语义）。
- **建议裁定**：schema 独立保留；**只把 15 个共享面做成单源 spec + 双端 conformance**；验收是“同 id 语义一致，或文档声明差异 + 测试固定”，不要求合并 schema。

#### M8 数据链无行为回归（QA-P0-3）vs main.ts 单体（SW-P1-1/P1-4）：严重度冲突
- **甲方**：QA 把“`main.ts` 不在测试/覆盖率 + 坏档/IPC 无行为回归”列 P0（3–4 人日方案）。
- **乙方**：SW 把 `main.ts` 3607 行/无行为测试列 P1，把“修必红测试 + 真 CI”列 P0；且数据链修复已在 `af012a6`/`d488112` 落地，当前没有活动缺陷。
- **为何冲突**：同一根因（main.ts 不可测）被一边当 P0、一边当 P1；按 QA 全量做会挤占数据隔离/CI 的资源。
- **建议裁定**：拆两半——**当前真实缺陷（损坏后从更多菜单退出仍丢会话、删除存档不清标志）留在 P0 `SAFE`**；行为回归测试与 `main.ts` 抽模块降 P1 `BT`。

#### M9 DLC 的两种处置：闭合信任链 vs 从 release 移除（路线冲突）
- **甲方**：NET/ARCH：完成 ceremony → 重签 → 门禁（保留 DLC 功能）。
- **乙方**：GAME-P0-2 建议：短期无法 ceremony 就把 DLC 从 release 移除并明确标注，避免“包在但永远 skipped”。
- **为何冲突**：一个保功能、一个砍功能；取决于 D01/D02（DLC 是否在近期路线、是否收费）。
- **建议裁定**：默认 A → 从对外 preview 移除/隐藏 DLC 入口与资源 + 文案（P1，0.5 人日），内部构建保持 fail-closed；选 B → 走 `E5-T2` ceremony。两者都不允许“对外称含 DLC 但安装后 skipped”。

#### M10 插件安全地板 vs “不要移植 famling 完整 consent”（范围冲突）
- **甲方**：PSY-P0-2 要求危机/健康/可见告知地板；PSY §8 同时明确“不建议移植完整 consent（3–5 人日高风险）”。
- **乙方**：ARCH-P1-3 把两端 consent/brief 双实现列为问题，倾向共享语义。
- **为何冲突**：既要补护栏，又不能造第二套 consent；实现方式分歧。
- **建议裁定**：只做**轻量 host 侧地板**（本地关键词短路 + 固定资源文案 + 发送去向 + 清除本机数据），不复制 consent 状态机；两端只共享**文案哈希/fixture**（并入 E6 spec），不共享运行时。

#### M11 UX 内部：“需要完整设置/内容窗口+托盘” vs “Phase 1 不新增窗口”
- **甲方**：UX-P0-2/P1-1/P1-7 认为 480×336 + 无托盘是结构问题，建议独立设置窗 + 托盘。
- **乙方**：UX 自己的 §7 也把独立窗口/托盘列为 Phase 2（2–4 人日 + Windows 构建风险）；task-65 已用设置弹窗解决大部分 P0。
- **为何冲突**：结构性修复成本高、依赖 Windows CI/身份决策，与本周 P0 抢资源。
- **建议裁定**：Phase 1 视为已完成（菜单 + 设置弹窗 + dev 入口下线）；托盘/独立窗口降 P2，等 `E5-T5` 身份与 Windows CI 就绪后再做；本轮 P1 只做 clamp/发现性/残项。

#### M12 “CI 从未运行” vs “已有 workflow/preflight”（事实冲突）
- **甲方**：SW/QA：CI 从未运行；README 宣称“私有远端已建、CI 已加入、首跑见 Actions”。
- **乙方**：`ci.yml`、`preflight.mjs`、`release.yml` 都在，纸面门禁齐全（设计还被评审打 B）。
- **为何冲突**：配置存在≠门禁生效；README 与 git 事实相反（`git remote -v` 空、`git tag` 0）。
- **建议裁定**：以 git 事实为准；`E2-T2` 建私有 remote + 首次真实跑绿，同时改 README/HANDOFF/ci.yml 注释为事实；所有“测试全绿/已发布”表述必须带 commit/日期快照。

#### M13 跨产品能力与法律口径冲突（真冲突，法务/告知风险）
- **甲方**：famling `README.md:240` 写“自由 LLM 角色扮演/情感陪伴不是官方功能 / 不提供自由 LLM 对话”；About/roleplay 入口按“研究原型/工作助手”表述。
- **乙方**：`dsh-famling` 有真实自由 LLM 聊天（`index.js` 调 `ctx.llm.stream`，人格化 system prompt），插件 LEGAL-NOTICE 自己承认“不能写不提供自由 LLM 对话”；且无危机资源、无发送去向、无清除入口；LEGAL-NOTICE 版本 0.8.5 ≠ package 0.10.2 ≠ README 0.10.1。
- **为何冲突**：同一品牌两端对外口径不一致，知情同意与危机义务的基础不同；用户会把两端当同一产品。
- **建议裁定**：`E3-T3` 统一口径（famling：不提供**官方**自由 LLM RP/陪伴；插件：**工作助手型 AI 回复**，非 RP/陪伴，文本发往 DSH 配置的模型供应商）+ 版本同步；`E3-T1/T2` 补危机/告知/清除地板。若 D01 决定降级插件聊天，则删功能并同步文案。

### 2.3 已被后续改动关闭/部分关闭的旧结论（直接引用原文会误判）

| 旧结论（原文） | 当前证据（HEAD `7107a61`） | 判定 |
|---|---|---|
| UX-P0-1：右键菜单 23 项/两屏滚动 | 根菜单 6 项 + 互动/更多二级 + 设置弹窗；dev 面板仅 `?debug=1`；`desktop-shell.ts:833-848,956-959`；菜单测试 32/32（含“根 6 项”“release 无完整面板”） | **关闭** |
| UX-P0-2：壳隐藏必需控件、只留开发面板 | 设置弹窗集中静音/音量/减少动态/复位/保存/读取/缩放/字号/内容中心/Advisers/声明/数据控制（`desktop-shell.ts:1296-1450`）；完整面板仅 debug 高级折叠（`:1458-1462`）；残：ASR/PTT/改名仍在隐藏 aside（`pet.html:63-90`） | **部分关闭（P1 残项）** |
| UX-P0-3：退出不保存/损坏提示骗人 | 根菜单退出已 save-then-exit（`main.ts:3340-3348,3445`）；`更多→退出` 仍是裸 `winRef.close()`（`desktop-shell.ts:961`）；删除存档不清 `saveRecoveryNeeded`（`main.ts:2066-2087`） | **部分关闭（P0 残项）** |
| UX-P0-4：无复位入口 | 复位窗口已进设置（`desktop-shell.ts:1340`；`main.ts:2147-2166`）；启动位置粗回收（`main.ts:2346-2369`）；无拖动 clamp/托盘/单实例 | **部分关闭（P1/P2）** |
| PSY-P0-1：无静音/音量/暂停动效 | 设置已有静音/音量/减少动态；hero 循环按 reduce-motion 冻结（`main.ts:2451-2472`）；无“暂时隐藏/安静模式”；ASR/PTT 无入口 | **部分关闭（P1 残项）** |
| SW-P0-1/QA-P0-2：“干净 checkout 必红” | `tests/use-restrictions.test.ts:54-64` 已对兄弟仓缺失显式 skip；`public/assets/ui/manifest.json` 的 `contactSheets` 指向已跟踪 `docs/art/ui-91-qa/*`；本轮定向 18/18 通过；仍无 remote/CI、无 `npm run ci` | **部分关闭（GATE 范围缩小）** |
| ARCH-P0-1：同 id 角色/对话语义漂移 | 插件 `client.js:77-83,128-139` 与 famling `library.json` 的 rolePresets/dialoguePacks 已逐项对齐；插件 `README.md:164` 记录对齐与 origami 例外；仍无 spec/LOCK/`SHARED-SEMANTICS.md`/conformance 测试 | **部分关闭（漂移值已对齐，工件未建）** |
| GAME-P0-1：市场只能换皮不能加角色 | 内容 v2/市场客户端已推进；但 `hero-runtime.ts:86` 仍固定 4 个 id，`content-hub.ts:378-405` 明写“需远程市场安装器”，`content-assets.ts` 无 anim schema，市场契约无 `pet-anim` 包 | **未变（条件项）** |
| NET-P1-1：市场缺传输层/防回滚 | task-66 的 `content-market.ts` 已实现可注入 transport + 目录验签 + serial 防回滚 + 下载校验（默认不联网）；但真实联网路径与 CSP 冲突（M6） | **P1 部分关闭（新增 M6）** |
| 评审中的数字（main.ts 3555 行 / content-hub ~1010 行 / 124 测试文件） | 当前 `main.ts` **3607 行**；`content-hub.ts` 2315 行；测试文件 126；评审期间并发的 v2 改动已提交 | **数字漂移，按函数名/当前实测复核** |

---

## 3. ② P0/P1/P2 重新分级（19 条逐条裁定 + 验收）

### 3.1 分级口径

| 级别 | 判据（满足任一） | 处理时限 |
|---|---|---|
| **P0** | ① 用户数据不可恢复/不可逆风险；② 对外分发/演示的安全、法律、信任承诺不成立；③ 使后续工作无法验证（门禁）且修复成本低；④ 产品路线依赖的决策门 | 本周内完成，或明确写出外部阻塞与负责人 |
| **P1** | 影响长期演进/合规质量/一致性，但不阻塞本周发布与数据安全 | 1–2 个迭代 |
| **P2** | 打磨/卫生/优化，无当前风险 | 排期清债 |
| **决策阻塞** | 需要 owner/用户/法务拍板，工程不得擅自实施 | 提交决策，等待回复 |

**条件式评级规则（本文多次使用）**：`REL`（发布信任链）在“任何对外 Windows 分发 / 收费 / 含 DLC”前提下是 P0；若 `E0-T1` 选择 A（研究原型/陪伴运行时、不对外收费/不上架），降为 P1，只保留“冻结 signed/DLC 宣称 + 身份决策”。这不是和稀泥，而是把“现在无法完成的外部项”与“现在能做的门禁”分开。

### 3.2 逐条裁定

#### 1. ARCH-P0-1 共享内容语义无单一权威源
- **原文要求**：15 个共享面逐项裁定权威端；版本化 `spec/` + LOCK；双端 conformance；同 id 同值或“故意差异 + 测试固定”。
- **现状（A/B）**：已知的可指出的漂移**已被手工对齐**——插件 `client.js:77-83`（对话 240/0.7、80/0.4、50/0.05）与 `:128-139`（human/cat/dog/origami 角色 bundle）和 famling `public/content/library.json` 的 `dialoguePacks`/`rolePresets` 逐项一致；插件 `README.md:164` 明确记录对齐结论与 origami `high-contrast→night` 的故意差异。但 `docs/contracts/SHARED-SEMANTICS.md`、`spec/`、`LOCK.json`、跨仓 conformance 测试**均不存在**（本轮 `find`/`grep` 复核）；两套 schema 独立仍是既定决策。
- **裁定**：**P1**。漂移值这一层已关闭；**单源工件 + 门禁未建**，下一次任一端改值仍会再漂移。
- **归并**：`E6 CS`（E6-T1/T2/T3）。
- **验收**：① `docs/contracts/SHARED-SEMANTICS.md` 覆盖 15 面（权威文件/字段、双端当前值、允许差异、验证命令）；② 改一端 rolePresets/dialogue 值而不改另一端 → `drift-check` 红；③ 任取 cat/human/dog 与 3 个对话包，双端值一致或文档 + 测试固定；④ `spec` 生成器同输入同输出（sha 可复现）。

#### 2. ARCH-P0-2 插件构建/发布不可自证
- **原文要求**：插件在无私有仓环境可 test/check/verify；vendored spec + LOCK；插件 git + CI + prepack；改一帧不重生成会红。
- **现状（A）**：`plugins/dsh-famling` 仍**不是 git 仓**、无 `.github/workflows`、无 `prepack`（本轮 `git rev-parse`/`ls`/`node -e` 复核）；`scripts/embed-anims.mjs:82,84` 默认读 `../../desktop-games/public/{assets/pet/anim,characters}`；资产缺失时 `verify-anims.mjs:563-580` 只 warning；`test/client-static.test.js` 两个一致性测试 `t.skip`（评审实测公开视角 74 pass/2 skip）。
- **裁定**：**P1**；若本周期要发布插件（npm/公开仓），升 **P0**。
- **归并**：`E4 PLUG-TRUST`（E4-T1/T2）。
- **验收**：① 在无 `desktop-games` 的目录 checkout 插件 → `npm test && npm run check && npm run verify` 全绿且 **0 skip**；② 缺 spec/资产 → 直接 fail（不允许 skip/warning 当通过）；③ `npm pack --dry-run` 含 LOCK/specVersion，README 写 `specVersion ↔ pluginVersion`；④ 改 1 帧不重生成 → CI 红；⑤ git tag 可追溯到发布物。

#### 3. ARCH-P0-3 发布信任与版本身份未闭环
- **原文要求**：DLC 生产根/重签、Authenticode、updater、产品身份四件套定 owner 与时间；发布门禁 pass；“signed 才允许宣称 signed”。
- **现状（A）**：`native/dlc-verify/trust/production-trust-root.json:8` 仍 `keys: []`；两个 pack 仍只有 legacy `signature.txt`、无 `signature.json`；`app/tauri/src-tauri/Cargo.toml`/`tauri.conf.json` 无 updater；`productName: DesktopGames` / `version: 0.1.0` / `identifier: com.perrylink.desktopgames` 未变；`scripts/release-win.mjs:485,492` 只写明文 SHA256SUMS + unsigned 提示。
- **裁定**：**P0（条件：任何对外分发/收费/DLC）**；默认 A 路线降 **P1**（只冻结宣称 + 完成 D02 决策）。
- **归并**：`E5 REL`。
- **验收（分层）**：① `docs/plan/RELEASE-ARCHITECTURE-*.md` 含身份/密钥/证书/updater 的 owner 与日期；② staged 测试：仓库 dev 包被拒 + 发布树生产包全过；③ 真实发布树 `verify-dlc-trust --exe` exit 0（ceremony 后）；④ SHA256SUMS 有 minisign/cosign detached 签名 + README 验证命令；⑤ `Get-AuthenticodeSignature` Valid，或书面 unsigned-preview 政策且全文无 signed 宣称；⑥ 产品名/identifier/版本在安装包、AppData、关于页、市场元数据一致。

#### 4. SW-P0-1 质量门不存在：无 remote/CI 从未运行/干净 checkout 必红
- **原文要求**：修 2 个环境依赖测试；加 `npm run ci`；私有 remote + 首跑绿；README/HANDOFF 与事实一致。
- **现状（A/B）**：**仍无 remote、无 tag**（`git remote -v` 空、`git tag` 0）；`README.md:11` 仍宣称“私有远端已建、CI 已加入、首跑见 Actions”（假）；`.github/workflows/ci.yml:3-4` 自述无 remote；**但**原文两条“必然红”已修：`tests/use-restrictions.test.ts:54-64` 对缺失兄弟仓显式 skip，`public/assets/ui/manifest.json` 的 `contactSheets` 指向已跟踪的 `docs/art/ui-91-qa/*`，本轮定向 **18/18 pass**；`package.json` 仍无 `ci` 脚本（scripts 列表无 ci）。
- **裁定**：**P0（范围缩小）**：不再是“测试修不好”，而是“门禁从未接线 + README 说谎”。
- **归并**：`E2 GATE`（E2-T1/T2）。
- **验收**：① `git archive HEAD` 到任意临时目录 + `npm ci && npm run ci` 全绿；② GitHub Actions 至少一次真实绿 run（链接/截图入库）；③ README/HANDOFF 状态与 git 事实一致，历史数字带快照日期；④ 本地与 CI 同一条命令；⑤ 测试不再依赖 gitignored 产物/兄弟仓（skip 必须显式打印原因）。

#### 5. NET-P0-1 生产 DLC 信任根为空 + 包仍 legacy
- **原文要求**：生产 Ed25519 ceremony → 公钥入 trust root → 用生产 key 重签两 pack → `verify-dlc-trust --exe` exit 0。
- **现状（B，本轮 A 复核信任根）**：`keys: []`、无 `signature.json`、policy `allowLegacySignatureWithoutKeyId:false` 均未变；`scripts/test-dlc-rust.sh:40-44` 故意断言“release 必须拒绝仓库 dev 包”，所以 CI 绿不代表 release 可用。
- **裁定**：合并 `REL`；条件式 **P0**（发 DLC/收费）／默认 A 下 P1（对外 preview 移除 DLC）。
- **归并**：`E5-T2`（+`E5-T1` staged 测试）。
- **验收**：trust root 有 ≥1 active 公钥；两个 pack 为 `signature.json` + 生产 keyId；release 模式 `verify-dlc-trust --staged/--exe` exit 0；`RELEASE-MANIFEST.json` 记录 `dlcTrust.status=pass`；仓库 dev-signed 包仍被拒（反向用例）。

#### 6. NET-P0-2 分发/更新无可验证发布者身份
- **原文要求**：SHA256SUMS 外层签名；Authenticode；updater（签名 manifest/防降级/回滚）。
- **现状（B）**：无 updater 依赖/配置；`release-win.mjs` 只写明文哈希并提示 unsigned；SHA256SUMS 外层签名仍为剩余项；无既有 updater 负向测试。
- **裁定**：合并 `REL`；条件式 **P0**；默认 A 下 P1（先做 SHA256SUMS detached 签名 + 明确 unsigned 政策，updater 写“no updater v1”决策）。
- **归并**：`E5-T3`（签名）、`E5-T4`（Authenticode）、`E5-T6`（updater 决策）。
- **验收**：① `minisign -Vm SHA256SUMS.txt`（或 cosign）用发布公钥通过 + README 一页验证说明；② `Get-AuthenticodeSignature` Valid，或 unsigned-preview 政策 + 全文无 signed 宣称；③ updater 要么负向测试（错签/旧版/yank 不可再装）通过，要么书面 no-updater v1 + SECURITY.md 写吊销 SLA。

#### 7. GAME-P0-1 内容市场无法交付“可玩的新角色”
- **原文要求**：定义 `famling.pet-anim/0.2` 资产包；loader + 数据驱动注册表 + 热切换；fail-closed；市场文案诚实。
- **现状（A）**：内容 v2/市场客户端已推进，但 `hero-runtime.ts:86` 仍固定 `['humanoid','cat','dog','tinglan']`；`content-hub.ts:378-405` 仍返回“该角色动画由内容包提供，本机渲染器不支持；已导入但需远程市场安装器”；`content-assets.ts` 无动画 schema（grep `anim` 0 命中）；`docs/content-packs` 只描述 `characterId + preview`；市场契约无 anim 包。
- **裁定**：**P1（条件：仅当 D01 选 B 且市场含“新角色/新动画”）**；默认 A 下**不做**，只保留“市场不含新动画角色”的诚实文案。
- **归并**：`E9-T1`（条件批）。
- **验收**：① `famling.pet-anim/0.2` schema + 校验器（zip/files sha/usageDeclaration/上限）；② 纯数据第三方角色包安装后出现在内容中心、**热切换 <1s 且不整页 reload**；③ 损坏/未签名/超限包 fail-closed；④ 卸载回内置角色；⑤ 未实现前市场文案不暗示“新角色”。

#### 8. GAME-P0-2 发布构建 DLC 全失败
- **原文要求**：完成 ceremony + 重签 + release 门禁；或短期把 DLC 从 release 移除并明确标注。
- **现状（A/B）**：同 NET-P0-1；`tauri.conf.json:48-49` 仍把两个 pack 作为安装包资源；游戏侧 `dlc_verify` 失败走 `skipped` 分支（评审 B）。
- **裁定**：合并 `REL`；条件同；默认 A → **P1**：从对外 preview 移除/隐藏 DLC 资源与入口，内部构建保持 fail-closed。
- **归并**：`E5-T1/T2` + `E9-T3`（文案/入口门控）。
- **验收**：二选一——（a）release 树两 pack 生产签名全过、`verify-dlc-trust` exit 0；（b）对外 preview 安装包无 `packs/*` DLC 资源、无 DLC 入口、README 不宣称含 DLC，内部构建仍 fail-closed。

#### 9. GAME-P0-3 玩法循环与产品形态未定义/未验证
- **原文要求**：owner 二选一（A 陪伴运行时 / B 桌面游戏基座）；B 必须先过 5–8 人试玩 gate；决定 DLC/市场是否在近期路线。
- **现状（A/B）**：未变：三个 demo 仍 `demo:true`；试玩 gate 仍“未执行，需真人”；同时市场/DLC 代码继续推进（13:35–13:56）。
- **裁定**：**P0-决策（最高优先，非工程）**。一页决策即可解锁其他 P0 的评级与顺序。
- **归并**：`E0-T1`。
- **验收**：① 一页决策记录：A/B、市场范围（是否含新角色）、DLC/收费 in/out、若 B 的 playtest 方案与指标（首正反馈 <30s、D1/D3/D7、内容消耗）；② README/CONTENT-MARKET/ROADMAP 同步；③ 受影响的 REL/GAME 级联重分级并记录；④ 7 天内完成（不需要代码）。

#### 10. QA-P0-1 GUI/E2E 无数据隔离，可删真实存档
- **原文要求**：`DG_QA_DATA_DIR` override；`--reset-saves` 仅 QA env/仅 json 槽位；E2E 强制临时目录 + 真实 appdata 前后哈希断言；插件 GUI 临时 DSH_HOME；清理 941 个残留 profile。
- **现状（A/B）**：**未变**：`app/tauri/src-tauri/src/main.rs:952-959` 对 `app_data_dir()/saves` 整目录 `read_dir` + 全部 `remove_file`；全仓 `DG_QA_DATA_DIR|app_directories_override` 只在文档命中（源码 0）；`scripts/cdp-launch.ps1:20` 只隔离 WebView2 profile，仍硬编码 `D:\...`；`scripts/e2e-tauri.ps1` 仍多处 `-ResetSaves`。11-19 09:55–09:58 已发生真实 `pet.json` 被探针改写且原内容不可还原（评审引用审计文档）。
- **裁定**：**P0**（唯一已实际发生的用户数据损失风险）。
- **归并**：`E1-T1`。
- **验收**：① `DG_QA_DATA_DIR` 生效（单测 + 启动日志打印 QA data dir 绝对路径；生产不设即零影响）；② 未设置该 env 时 `--reset-saves` **拒绝执行并报错**；③ 连续 3 次 E2E smoke 后真实 `%APPDATA%/com.perrylink.desktopgames` 文件清单 + 哈希不变（脚本内断言）；④ `--reset-saves` 只删 `*.json/*.json.tmp/*.json.bak`（复用已有 `delete_save` 精确实现）；⑤ 插件 GUI 用 `mkdtemp` 的 DSH_HOME；⑥ artifacts 941 个 profile 清理脚本 dry-run 先打印绝对路径。

#### 11. QA-P0-2 质量门从未运行；干净 checkout 必红；关键层不在 CI
- **原文要求**：同 SW-P0-1，另加：插件门禁、rust-dlc、`rust-tauri-tests` 转 required、夜间 headless E2E、发布证据归档。
- **现状（A）**：同 SW；另 `ci.yml:117-124` 的 `rust-tauri-tests` 仍 `continue-on-error: true`；发布证据未归档（评审 QA-P1-1）；HEAD 干净导出仍有 5 个 dist/release 相关 skip（CI 先 test 后 build 的顺序问题，评审 B）。
- **裁定**：**P0（合并 GATE）**。
- **归并**：`E2 GATE`。
- **验收**：同 SW-P0-1，另加：① `rust-tauri-tests` 连绿 3 次后转 required；② 测试证据落 `artifacts/qa/<date>/<run-id>/` 或 CI artifact（禁止只留在 `_scratch`/聊天）；③ 夜间 headless 浏览器 smoke 可作为 P2 后置，但 CI 顺序问题（test 先于 build）必须修。

#### 12. QA-P0-3 数据链无行为回归；main.ts 不在测试/覆盖率
- **原文要求**：抽 `save-runtime`；补坏档/.bak/IPC never-settle/ENOSPC/退出失败等行为测试；main.ts 不再承担关键数据链。
- **现状（A/B）**：`main.ts` 现 **3607 行**（评审 3555）；tests 里 14 处 `read('src/pet/main.ts')` 文本断言、**0 处 import**（本轮 grep 复核）；坏档/IPC 修复已落地（`af012a6`/`d488112`）但没有行为级回归；新增 fake-dom 测试覆盖菜单/内容中心（32/32），未覆盖 save/IPC。
- **裁定**：**P1**（拆两半：当前真实缺陷见 UX-P0-3 仍在 P0 `SAFE`；行为测试与 `main.ts` 抽模块降 P1）。
- **归并**：`E8-T1`（+`E8-T2` 插件 bridge）。
- **验收**：① `save-runtime` 可注入 IO 的纯模块；② 行为测试覆盖：primary 坏/.bak 好、ENOSPC/只读、IPC never-settle/timeout、删除存档清标志、退出保存失败不关窗；③ `save-runtime` 覆盖率 ≥90% lines；④ `main.ts` 的关键数据链逻辑迁出（阶段目标 ≤2000 行）。

#### 13. PSY-P0-1 产品壳无静音/音量/暂停动效/隐藏常驻控制
- **原文要求**：菜单/设置层加声音开关、音量、安静模式（暂停动效 + 不主动气泡）、暂时隐藏；hero 画布消费 reduce-motion；TTS 接受后可在两次点击内静音。
- **现状（A）**：**部分关闭**：设置弹窗已有静音/音量/减少动态（`desktop-shell.ts:1296-1344`）；`reduceMotion` 时 hero 冻结场景时钟、跳过 tick/locomotion（`main.ts:2451-2472`）；但**无「暂时隐藏」与「安静模式」**，ASR/PTT/改名无入口。
- **裁定**：**P1 残项**（WCAG 2.2.2 的核心风险已由 reduce-motion 暂停消除）。
- **归并**：`E7-T1/T2`。
- **验收**：① 设置含「暂时隐藏 1 小时/直到明天」与「安静模式（不主动气泡）」或等价项，状态持久化；② fake `matchMedia(reduce)` 下 hero 不启动 rAF tick（单测）；③ muted 时 TTS 不播放、只出字幕（单测）；④ 根菜单→设置→静音 ≤3 次操作；⑤ 手工：安静模式 1 分钟内无新气泡/帧动画。

#### 14. PSY-P0-2 dsh-famling 自由 LLM 聊天缺危机/健康/可见告知地板
- **原文要求**：Host 侧危机关键词短路（不调模型）+ 固定资源文案；输入/设置披露“发往 DSH 配置的模型供应商”；一次性首启卡片；清除本机设置/同意；LEGAL-NOTICE 版本同步。
- **现状（A）**：**未变**：插件代码 grep 无 12356/危机/自伤资源；无“清除本机数据”入口；输入面板只有“是 AI 生成、不提供自由 LLM…”（`client.js` 声明），**没有发送去向句**；`docs/LEGAL-NOTICE-2026-11-18.md:3` 版本仍写 0.8.5（package 0.10.2、README 0.10.1），`:27` 自认无首启告知/无危机资源/无清除按钮。
- **裁定**：**P0**（全项目最接近“无护栏 AI 陪伴”的面；法律/伦理风险 + 修复成本低）。
- **归并**：`E3-T1/T2/T3`。
- **验收**：① 自伤关键词命中 → 返回固定危机资源且**不调用 `ctx.llm.stream`**（单测可断言调用次数）；② 输入面板/设置含“文本会发送给 DSH 中配置的模型供应商；勿发密码/他人隐私/客户资料”（中英）；③ 首启一次性可关闭、非阻断卡片；④ “清除本机设置与同意”按钮清 `dsh-famling/*` 键并回读为空；⑤ LEGAL-NOTICE 版本 = package 版本；⑥ 若 D01 决定降级聊天，则删功能并同步文案。

#### 15. PSY-P0-3 首启先强制自报出生日期再读 TOS，但 roleplay 无公开入口
- **原文要求**：首选移除首启年龄核验（roleplay 未公开前）；或移到 roleplay 入口；至少 TOS→年龄；只存成年布尔/年龄段；文档同步。
- **现状（A）**：**未变**且是用户已拍板项：`consent/gate.ts:377-380` 注释“ORDER IS A HARD CONTRACT (user decision): age self-report -> TOS -> app”；`roleplay` 入口仍刻意不存在（评审 B）。
- **裁定**：**P1-决策阻塞**；工程不得擅自改。
- **归并**：`E0-T3`。
- **验收**：① 用户/法务书面决策；② 若改：首启无年龄弹窗、一般功能可用、roleplay（内部入口）仍 18+；或 TOS→年龄 + 顶部“为什么现在需要/不用于什么” + 一般功能路径；③ 若保留采集：只存成年布尔/年龄段；④ README/PRIVACY/CONSUMER-MINORS-HEALTH 与实际一致；若维持现状：标注 accepted risk + 理由。

#### 16. UX-P0-1 右键菜单 IA 与 480×336 不匹配
- **原文要求**：根菜单 ≤9 项；常用/设置/法律/开发分层；危险动作不在一级；删除发布版 dev 入口；CDP 断言不需要滚动。
- **现状（A）**：**已关闭**：根菜单 6 项（交办 / 互动▸ / 角色与内容中心 / 设置 / 更多▸ / 退出），互动与更多为二级、带「← 返回」，设置独立弹窗，dev 面板仅 `?debug=1` 且在高级折叠（`desktop-shell.ts:833-848,956-959,1458-1462`）；菜单测试 32/32 通过（含根 6 项、更多内容、release 无完整面板）。
- **裁定**：**关闭**；仅剩 P2 的真机尺寸验证。
- **归并**：无（P2 验证项并入 E2-T4/E7-T3 的 CDP 快照）。
- **验收**：① CDP 在 480×336、文字 100%/2× 下根菜单 `scrollHeight <= clientHeight`；② 键盘 ↑↓/Home/End/Enter/Esc/点外关闭有测试；③ 发布构建 grep 不到「完整面板（开发/E2E）」；④ 法律/危险入口仍可达（About/撤回/删除在二级或 About，不消失）。

#### 17. UX-P0-2 产品壳隐藏必需控件；完整面板是单向门
- **原文要求**：静音/音量/PTT/改名/复位/保存迁入产品入口；dev 面板不在发布菜单；设置 IA 完整。
- **现状（A）**：**大部分关闭**：设置弹窗集中静音/音量/减少动态/复位/保存/读取/缩放/字号/内容中心/Advisers/声明/数据控制（`desktop-shell.ts:1296-1450`）；完整面板仅 `?debug=1` 高级折叠（`:1458-1462`）；**残项**：ASR/按住说话、改名仍只在隐藏 `aside.panel`（`pet.html:63-90`）。
- **裁定**：**P1 残项**。
- **归并**：`E7-T2/T3`。
- **验收**：① 逐项清点隐藏控件（mute/vol/talk/rename/voice-cache/reset/save/load），每个要么产品入口可达、要么从发布构建移除并在 README 说明；② 发布构建无 dev 入口；③ 设置对话框焦点陷阱/Esc/外部关闭；④ 改名/PTT 有落点或明确下架（二选一，不能悬空）。

#### 18. UX-P0-3 存档损坏恢复/退出保存提示、按钮、标志位互相矛盾
- **原文要求**：损坏时明确选择（保存新档/从备份恢复/删除重来/退出）；删除存档清 `saveRecoveryNeeded`；所有退出走 `saveNow→close`，失败确认；autosave 恢复。
- **现状（A）**：**部分关闭**：根菜单「退出」已 save-then-exit（`main.ts:3340-3348`，`desktop-shell.ts:848`，`main.ts:3445` 注入）；但 `更多` 子菜单的「退出」仍 `winRef.close()` 裸关闭（`desktop-shell.ts:961`）；`save-delete` 未清 `saveRecoveryNeeded`（`main.ts:2066-2087`）；损坏提示仍写“先点保存”（保存现已可达，但无恢复选择面板）；恢复前 30s autosave 仍暂停（`main.ts:2168-2173` 逻辑）。
- **裁定**：**P0 残项**（唯一仍在的“正常操作导致会话丢失”路径：损坏后从更多菜单退出）。
- **归并**：`E1-T2`。
- **验收**：① 所有退出入口（根/更多/About/设置）统一 `saveNow→close`，失败弹“未保存，仍要退出？”；② `delete_save` 成功后 `saveRecoveryNeeded=false`，本会话 autosave 恢复；③ 损坏时提供四选一（保存新档/从备份恢复/删除重来/退出）或等价可达路径；④ fake IPC 单测覆盖：损坏→保存→旗标清、删除→旗标清、退出保存失败→窗口不关；⑤ 30s autosave 在恢复后下一周期即写入。

#### 19. UX-P0-4 置顶/无边框/skipTaskbar/可拖动但无托盘/复位入口
- **原文要求**：短期复位入口 + 拖动 clamp + 启动越界回收；结构性托盘（打开/复位/设置/退出）+ 单实例。
- **现状（A）**：**部分关闭**：复位窗口已进设置（`desktop-shell.ts:1340`，`main.ts:2147-2166`）；启动位置只做粗边界回收（`main.ts:2346-2369`）；**无拖动结束 clamp**；Rust 侧 grep 无 `TrayIcon`、无单实例（本轮复核）。
- **裁定**：**P1**（复位可达已消除“完全找不回”；托盘降 P2，等身份/Windows CI）。
- **归并**：`E7-T4`（P1）/`E7-T5`（P2 托盘+单实例）。
- **验收**：① 拖动结束/显示器变化后窗口 clamp 在当前显示器工作区；② 启动时越界位置回默认（已有逻辑 + 测试）；③ 设置复位可达（已达成，补测试）；④ P2：托盘 打开/复位/设置/退出 + 单实例；⑤ 手工：拖出屏幕后无需任务管理器可恢复。

### 3.3 重新分级汇总

| 原 P0 | 状态 | 新级别 | 归并 | 一句话 |
|---|---|---|---|---|
| ARCH-P0-1 | 部分关闭 | P1 | E6 CS | 值已对齐，单源/门禁未建 |
| ARCH-P0-2 | 开放 | P1（发布插件时 P0） | E4 | 插件仍无 git/CI，跨私仓生成 |
| ARCH-P0-3 | 开放 | P0 条件 / 默认 A 下 P1 | E5 REL | 身份/签名/更新外部阻塞 |
| SW-P0-1 | 部分关闭 | **P0** | E2 GATE | 测试已修，门禁未接线 |
| NET-P0-1 | 开放 | P0 条件 / P1 | E5 REL | 生产根空 + legacy 包 |
| NET-P0-2 | 开放 | P0 条件 / P1 | E5 REL | 无签名身份/updater |
| GAME-P0-1 | 开放 | P1 条件 | E9 | 市场不能交付新角色 |
| GAME-P0-2 | 开放 | P0 条件 / P1 | E5 REL | release DLC 全失败 |
| GAME-P0-3 | 开放 | **P0-决策** | E0 | 产品形态/玩法未验证 |
| QA-P0-1 | 开放 | **P0** | E1 SAFE | GUI 测试可删真实存档 |
| QA-P0-2 | 部分关闭 | **P0** | E2 GATE | 门禁从未运行 |
| QA-P0-3 | 开放 | P1 | E8 BT | 数据链无行为回归 |
| PSY-P0-1 | 部分关闭 | P1 | E7 UXQ | 核心已修，缺隐藏/安静 |
| PSY-P0-2 | 开放 | **P0** | E3 PLUG | 插件 AI 无危机地板 |
| PSY-P0-3 | 开放 | P1-决策阻塞 | E0 | 年龄顺序需用户重拍 |
| UX-P0-1 | **关闭** | — | — | 菜单已 6 项分层 |
| UX-P0-2 | 大部分关闭 | P1 残项 | E7 UXQ | 设置弹窗已补，残 ASR/改名 |
| UX-P0-3 | 部分关闭 | **P0 残项** | E1 SAFE | 更多→退出仍丢会话 |
| UX-P0-4 | 部分关闭 | P1/P2 | E7 WR | 复位已补，无 clamp/托盘 |

**统计**：关闭 1；部分关闭 7；开放 11。仍为 P0 的动作面 **6 个**（DECIDE、SAFE-01、SAFE-02、GATE、PLUG、REL 条件式），来自 10 条原 P0。

### 3.4 为什么这些必须降级（避免“什么都 P0”）

- **已经在代码里解决的**（UX-P0-1、SW/QA 的两个必红测试、ARCH-P0-1 的已知漂移值）继续标 P0 会让团队重复劳动、并让真正的 P0 失去注意力。
- **需要外部条件的**（REL 的证书/密钥 ceremony、updater）不能由工程“加班完成”；把它们标为无条件 P0 会导致“每周都 P0 但永远不 done”。改为“P0 条件 + 冻结宣称 + owner 决策”，可验收、可追责。
- **结构性/长期项**（QA-P0-3 的 main.ts 抽模块、UX-P0-4 的托盘、ARCH-P0-2 的插件仓库化）价值真实但不在本周；标 P1 并保留依赖关系，防止被遗忘。

---

## 4. ③ Epic → Task 树（可执行 / 可验收）

### 4.1 依赖图

```
E0-T1 产品形态/市场范围（owner，P0-决策）
  ├─> E9-T1/T2 可玩新角色/试玩 gate（仅 B）
  ├─> E6-T4 市场传输接线（范围）
  └─> E5 发布信任范围（DLC/收费 in/out）

E0-T2 发布身份/签名/更新范围（owner+eng）
  ├─> E5-T1 冻结宣称 + staged DLC 门禁
  ├─> E5-T2 DLC ceremony + 重签（owner）
  ├─> E5-T3 SHA256SUMS 外层签名
  ├─> E5-T4 Authenticode + signed release（外部证书）
  ├─> E5-T5 身份改名（DesktopGames→Famling / AppData 迁移）
  └─> E5-T6 updater 决策（做 / no-updater v1）

E2-T1 npm run ci ──> E2-T2 私有 remote + 首跑绿 ──> E2-T3 rust/插件门禁 required
                                                            └─> E5-T1 发布门禁复用同一 CI
E1-T2 存档/退出残项 ──> E8-T1 save-runtime 行为测试（防回归）
E1-T1 数据隔离 ──> E2-T2 E2E 证据（真实 appdata 哈希不变）
E3-T1/T2/T3 插件安全地板（独立，可与任何线并行）
E6-T1 共享语义表 ──> E6-T2 spec/LOCK/conformance ──> E6-T3 生成 + drift-check
                                        └──> E4-T2 插件 vendored spec
E6-T4 市场传输（Rust bridge / 不放宽 CSP）──> E9-T3 市场 UI 真动作（仅 B）
E7-T4 clamp / E7-T1 隐藏/安静 / E7-T2 ASR/PTT/改名（独立 P1）
E7-T5 托盘 + 单实例（P2，依赖 E5-T5 身份与 Windows CI）
```

### 4.2 任务总表

> 估算单位：人日（单人、有现成测试可跑）；风险：低/中/高；“顺序”为全局建议执行序（非按表内顺序）。**共 10 个 Epic / 35 个 Task**，其中 P0 批 12 个（E0-T1/T2、E1-T1/T2、E2-T1/T2、E3-T1/T2/T3、E5-T1/T3），P1 批 17 个，P2/条件批 6 个。所有任务默认要求：改动前先读现有测试，改动后 `tsc` + 相关测试 +（如涉及）`npm run ci` 通过；不修改无关资产。

#### E0 决策（P0/决策）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E0-T1 | 写 `docs/plan/PRODUCT-FORM-DECISION-2026-11-19.md`：A/B、市场是否含新角色、DLC/收费 in/out、B 的试玩 gate 与指标；同步 README/CONTENT-MARKET 状态 | 一页决策；三处文档口径一致；受影响 P0 级联重分级表 | 无 | 0.5 | 高（路线） | 1 |
| E0-T2 | 写 `docs/plan/RELEASE-ARCHITECTURE-2026-11-19.md`：身份/版本策略、DLC 密钥保管人、Authenticode 证书来源、updater 范围、外部 owner/日期 | 每项有 owner + 目标日期；对外文案只使用决策后的身份/宣称 | E0-T1 | 0.5 | 中 | 2 |
| E0-T3 | 把 PSY-P0-3 年龄核验顺序提交用户/法务：选项 A 移到 roleplay 入口 / B 维持并补说明 / C 移除；附影响清单 | 书面回复；未回复前代码不动；回复后按选项更新 gate + 文档 + 测试 | 用户 | 0.25 | 中（合规） | 3（可并行） |

#### E1 数据安全（P0）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E1-T1 | Rust `DG_QA_DATA_DIR` override（`app_directories_override`）+ `--reset-saves` fail-closed + 只删 json 槽位；`e2e-tauri.ps1/cdp-launch.ps1` 强制临时目录 + 前后真实 appdata 哈希断言；插件 GUI 用 mkdtemp DSH_HOME；残留 profile 清理脚本（dry-run） | ① 单测 override 生效；② 无 env 的 reset 报错退出；③ 3 次 E2E 真实 appdata 哈希不变；④ 只删 json/tmp/bak；⑤ 插件真实 `~/.dsh` 不变 | 无 | 1–1.5 | 低 | 4 |
| E1-T2 | 修 UX-P0-3 残项：所有退出入口统一 `saveNow→close`（含更多菜单）；delete_save 清 `saveRecoveryNeeded`；损坏时四选一恢复面板；补 fake IPC 行为测试 | ① 4 个退出入口都先保存；② 删除后旗标清、autosave 恢复；③ 损坏可选择；④ 3 条 fake IPC 测试绿 | E1-T1 可选并行 | 0.5–1 | 低 | 5 |
| E1-T3 | artifacts 卫生：941 个 `cdp-wv2-*` profile/12GB 清理；建立 `artifacts/qa/<date>/<run-id>/` 归档规则 | dry-run 打印绝对路径；清理后 artifacts 体积与 profile 数下降；E2E 结果落仓 | E1-T1 | 0.5 | 低 | 16（P2） |

#### E2 质量门（P0）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E2-T1 | 加 `npm run ci`（与 `ci.yml` 同一组步骤，复用 `preflight` 补齐 release-sign/repro smoke）；修 CI 顺序导致 dist 测试 skip 的问题；清理剩余 skip 语义 | `git archive HEAD` + `npm ci && npm run ci` 全绿；skip 均有显式原因；本地与 CI 同命令 | 无 | 0.5 | 低 | 6 |
| E2-T2 | 建私有 remote + 首次 push/tag + GitHub Actions 首跑绿；改 `README.md:11`、HANDOFF 状态描述为事实 | 首跑 run 链接入库；README/HANDOFF 无“已建/已跑”假陈述 | E2-T1 | 0.5 | 低 | 7 |
| E2-T3 | `rust-tauri-tests` 转 required（连绿 3 次后）；ACL 141 断言矩阵脚本入库；测试证据归档到 `artifacts/qa/`；覆盖插件/rust 门禁 | required 生效；矩阵脚本可在 CI 跑；证据有 commit/exe hash | E2-T2 | 1–1.5 | 中 | 14（P1） |
| E2-T4 | 夜间无 Windows 依赖的 headless 浏览器 smoke（Vite preview + CDP/Playwright）：首启同意、内容中心 4 tab、hero 渲染、hit-region、localStorage 隔离 | nightly 绿；失败可定位截图/trace | E2-T2 | 1 | 中 | 17（P2） |

#### E3 插件安全地板（P0）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E3-T1 | `index.js` 模型调用前加本地危机关键词短路：命中不调 `ctx.llm.stream`，返回固定资源（12356/110/120/可信任的人）；最小审计不存原文 | 单测：命中→0 次 llm 调用 + 固定文案；非命中正常；误报有明确“不是诊断”句 | 无 | 0.5 | 低 | 8 |
| E3-T2 | 输入面板/设置加发送去向披露；首启一次性卡片（可关闭非阻断）；设置加“清除本机设置/同意”按钮 | 中英披露存在；卡片只出现一次；清除后两个 localStorage 键回读为空 | E3-T1 | 0.5 | 低 | 9 |
| E3-T3 | 版本/法律/口径对齐：LEGAL-NOTICE 0.10.2、README 版本、famling/插件跨产品口径（不提供官方自由 LLM RP/陪伴 vs 工作助手型 AI 回复） | 三处版本一致；跨产品文案评审通过；无“不提供自由 LLM”与真实 LLM 聊天并存的矛盾 | E0-T1 | 0.25 | 低 | 10 |

#### E4 插件发布自证（P1；发布插件时 P0）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E4-T1 | 插件目录 `git init` + `.github/workflows/ci.yml`（node --test/check/verify/pack dry-run）+ `prepack` | 无私有仓环境 CI 全绿；`npm pack --dry-run` 跑门禁；tag↔版本可追溯 | E3-T3 | 0.5–1 | 低 | 15 |
| E4-T2 | vendored `spec/` + LOCK；`embed-anims.mjs` 默认从 spec 读；缺 spec fail；删掉 2 个一致性 skip | 公开视角 0 skip 全绿；改 1 帧不重生成→CI 红；`npm pack` 含 LOCK/specVersion | E6-T2 | 1 | 中 | 18 |

#### E5 发布信任链（P0 条件 / 默认 A 下 P1）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E5-T1 | 冻结对外宣称：signed/DLC/市场文案改为“unsigned preview/研究原型”；加 staged DLC 门禁测试（dev 包必须被拒 + 发布树生产包必须全过）；接进 CI | 全文 grep 无未兑现的 signed/DLC 宣称；staged 正反例测试绿；CI 有该门 | E0-T2、E2-T2 | 1 | 中 | 11 |
| E5-T2 | 生产 Ed25519 ceremony（离线/双人）→ 公钥入 trust root → `make-pack --key-id` 重签两 pack | 信任根 active 非空；两 pack `signature.json`；`verify-dlc-trust --exe` exit 0；dev 包仍拒 | E0-T2、E5-T1 | owner 数小时 + 0.5 工程 | 高（保管） | 12 |
| E5-T3 | `SHA256SUMS.txt` 加 minisign/cosign detached 签名 + 公钥 + README 一页验证命令；release 脚本强制外层签名 | `minisign -Vm` 通过；无签名时 release 脚本拒绝；文档一致 | E0-T2 | 0.5 | 低 | 13 |
| E5-T4 | Authenticode 证书 → signed release 流水线；无证书时明确 unsigned-preview 政策 | `Get-AuthenticodeSignature` Valid，或政策文件 + 全文无 signed 宣称 | E0-T2、外部证书 | 外部 + 1 | 高 | 19（外部） |
| E5-T5 | 产品身份改名（DesktopGames→Famling）+ identifier/版本策略 + AppData 迁移方案 | 安装包/AppData/关于页/市场元数据四处一致；有迁移/回滚说明；测试过旧数据可读 | E0-T2 | 1–2 | 中高 | 20（P1） |
| E5-T6 | updater 决策：实现（签名 manifest/防降级/回滚/kill switch/负向测试）或书面“no updater v1”+ 吊销 SLA | 实现则负向测试全绿；不做则 SECURITY.md 有 SLA 与手动更新说明 | E0-T2 | 1–2 | 中 | 21（P1） |

#### E6 内容语义单源（P1）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E6-T1 | 写 `docs/contracts/SHARED-SEMANTICS.md`：15 个共享面（角色 bundle/对话/主题/背景/字体/动画事件/声明/语音策略/id 映射/版本轴…）× 权威端 × 双端当前值 × 允许差异 × 验证命令 | 表覆盖 15 面；每个已知差异有裁定（一致/故意+理由+测试）；lead 拍板 Q1–Q3 记录 | 无 | 0.5 | 低 | 22 |
| E6-T2 | 版本化 `spec/face/0.1/{catalog,assets,schema,LOCK}.json` + `scripts/gen-face-spec.mjs`；双端 conformance 测试（同 spec 同结果） | spec 可复现（同输入同 sha）；双端 conformance 绿；改 spec 未同步→红 | E6-T1 | 2–3 | 中 | 23 |
| E6-T3 | 由 spec 生成插件 `ROLE_BUNDLES/DIALOGUE_MODES/声明常量`（或先生成 + drift-check）；纳入 CI | 手写常量删除或只剩生成层；改一端未改 spec→CI 红 | E6-T2 | 1 | 中 | 24 |
| E6-T4 | 市场传输裁定：保留 `content-market.ts` 注入式核心 + 新增受限 Rust `market_fetch` 命令（HTTPS/allowlist/大小/超时/重定向/并发）；UI 注入；**不放宽 CSP** | 真机 Tauri 下目录刷新/下载走 Rust 命令成功；CSP `connect-src` 未扩域；负向测试（私网/超限/重定向跨主机/大响应）通过 | E0-T1、E6-T1 | 1–2 | 中高 | 25 |

#### E7 UX / 安静控制面 / 窗口召回（P1，托盘 P2）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E7-T1 | 设置加「暂时隐藏 1 小时/直到明天」「安静模式（暂停主动气泡）」；状态持久化；mute 时 TTS 只字幕 | 单测：隐藏状态持久化/恢复；安静模式 1 分钟无新气泡；mute 不播放 | 无 | 0.5 | 低 | 26 |
| E7-T2 | ASR/PTT 与「改名」落点：迁进设置或从发布构建移除（二选一），写 README | 逐项清单齐全；无“隐藏但存在”的悬空控件；测试断言入口存在/不存在 | E0-T1（保留范围） | 0.5 | 低 | 27 |
| E7-T3 | 发现性与可达性：首次一次性提示右键/Shift+F10；触发区 ≥24×24、对比度；法律/About 字号≥12px | 首次提示只出现一次且可关；CSS/计算样式断言达标；键盘可走通菜单→设置→退出 | 无 | 0.25–0.5 | 低 | 28 |
| E7-T4 | 窗口 clamp：拖动结束/显示器变化 clamp 到当前 work area；补测试；启动越界回收已有逻辑补测试 | 单测/手工：拖出屏幕后可恢复；启动越界回默认；复位仍可用 | 无 | 0.5 | 低 | 29 |
| E7-T5 | 托盘 + 单实例（打开/复位/设置/退出）；图标/ACL/Windows 构建回归 | Windows 实机：托盘四动作可用；第二次启动不产生第二实例；安装/卸载回归 | E5-T5、Windows CI | 1–2 | 中 | 30（P2） |

#### E8 数据链行为测试（P1）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E8-T1 | 抽 `save-runtime`（可注入 IO/时钟），补坏档/.bak/ENOSPC/只读/IPC never-settle/timeout/退出失败等行为测试；main.ts 只做 glue | 覆盖率 ≥90% lines；测试覆盖 5 类故障；`main.ts` 数据链逻辑迁出 | E1-T2 | 1.5–2 | 中 | 31 |
| E8-T2 | 插件 bridge 行为测试：timeout/abort/防重/TTL/隐私自动隐藏/清除 | 新增 ≥6 条行为测试；fake host 全绿 | E3-T1 | 0.5 | 低 | 32 |

#### E9 游戏/内容交付（条件批：仅 D01=B）

| ID | 做什么 | 验收 | 依赖 | 人日 | 风险 | 顺序 |
|---|---|---|---|---|---|---|
| E9-T1 | `famling.pet-anim/0.2` 资产包 schema + loader + 数据驱动注册表 + 热切换（复用 hero-backend.load/installPack 与 zip fail-closed） | 纯数据包新增可切换角色（不改代码）；损坏/未签名/超限拒绝；切换 <1s 无 reload | E0-T1=B、E6-T2、E5-T1 | 5–10 | 中高 | 33 |
| E9-T2 | 按 GAME-P0-3 的 playtest gate：5–8 人试玩 + 指标（首正反馈<30s、D1/D3/D7、内容消耗）；不过 gate 不做商业市场 | 试玩报告含原始数据/结论；决策记录“继续/停止” | E0-T1=B | 1–2 周 | 高 | 34 |
| E9-T3 | 市场 UI 动作门控 + 诚实文案：未配置/无 Rust 桥时只读；不暗示新角色/在线安装；有桥后可刷新目录但默认不自动下载 | 默认零网络请求；按钮状态与 source 一致；文案不含未实现承诺 | E6-T4、E0-T1 | 0.5 | 低 | 35 |

### 4.3 分批与最小可行修复（MVR）

| 批次 | 任务 | 目标 | 并行 |
|---|---|---|---|
| **批 0（当天）** | E0-T1、E0-T2（启动）、E0-T3（提交决策）、E2-T2 的 README/HANDOFF 纠错部分 | 解锁范围；停止对外假陈述 | owner/lead + 1 人 |
| **批 1（第 1–3 天）** | E1-T1、E1-T2、E2-T1、E2-T2、E3-T1、E3-T2、E3-T3 | 数据安全 + 真 CI 首跑 + 插件安全地板 | 3 条线：数据 / 门禁 / 插件 |
| **批 2（第 3–7 天）** | E5-T1、E5-T3、E0-T2（收口）、E2-T3、E4-T1、E6-T1 | 发布宣称冻结 + staged 门禁 + 插件可自证 + 共享语义表 | 与 owner ceremony 并行 |
| **批 3（第 2 周）** | E6-T2/T3/T4、E7-T1/T2/T3/T4、E8-T1/T2、E5-T5 | 单源/市场传输/安静面/数据链测试/身份 | 按依赖串行关键路径 E6-T2→E6-T3 |
| **条件批** | E9-T1/T2/T3（D01=B 且 playtest 通过）；E5-T2/T4（owner/证书）；E7-T5、E2-T4、E1-T3（P2） | 商业/外部/卫生 | 外部驱动 |

**MVR（最小可行修复，清零 P0 面）= 批 0 + 批 1 + 批 2 的 E5-T1/E5-T3：约 5.5–6.5 人日**（不含 owner 外部 ceremony/证书）。判断标准：6 个 P0 面每个都有“已验收”或“书面外部阻塞 + owner/日期 + 冻结宣称”。

### 4.4 完成定义（DoD）

- **每个任务**：改动前读现有测试；`tsc` + 相关测试绿；涉及 CI 的用 `npm run ci` 同命令验证；证据（命令/输出/截图/链接）写入任务或 `artifacts/qa/`；不顺手改无关文件。
- **每个 Epic**：有唯一 owner；验收命令可复现；若依赖外部，必须写“外部阻塞 + owner + 日期 + 临时冻结措施”，否则不算 Done。
- **整体**：19 条原 P0 全部落入“关闭 / P1+任务 / 决策记录 / 明确不做”四类之一；不允许“开放式优化架构”任务。

---

## 5. ④ 明确不做的项

### 5.1 产品/路线层（现在不做，或需决策后才做）

1. **不在 D01 决策前**把市场/收费/DLC 写进 README、商店文案或路线承诺；默认按 A（研究原型/陪伴运行时）对外表述。
2. **不做远程市场真实联网/支付/审核后台/安装器**（直到 `E6-T4` 传输桥 + 签名/回滚 + 审核流程就绪）；市场页保持“未配置/只读”。
3. **不做新手工 rig/逐帧角色**：不新增第 4/5 个手工骨架；不继续给 `walk`/`attack` 死 clip 调像素；不把 96px 占位美术扩张成“正式内容量”。
4. **不启动游戏基座（4–8 周）** 直到 D01=B 且 `E9-T2` 试玩 gate 通过。
5. **不做试玩依恋探测/断联 24h 等研究设计扩展**（心理 P2-11）；如保留，必须先有 debrief/伦理审查，不把依恋当成功指标。

### 5.2 工程层（不做 / 延后）

1. **不合并 famling 与 dsh-famling 运行时**，不共享 React/UI 运行时，不引入 monorepo/pnpm workspace/submodule；用 spec 产物 + vendored + LOCK。
2. **不做大爆炸重写**；`main.ts`/`content-library.ts`/`content-hub.ts` 只做渐进抽取（且排在 P1）。
3. **不把插件全面迁移 TypeScript**；先 `@ts-check`/JSDoc 拿 80% 收益；不先改 `content-library.ts` 的 schema 设计；不重构 consent 策略层；不引入前端框架。
4. **不放宽 CSP**（`connect-src` 不加外域）；远程市场走受限 Rust 命令；不在签名/更新通道就绪前开放真实下载。
5. **不新增常驻按钮**（用户已选零按钮 + 右键/Shift+F10 分级菜单）；可发现性用一次性提示解决；不为了“极简”删法律/同意入口（只能换层级）。
6. **不把托盘/独立设置窗口当本轮 P0**：降 P2，等身份改名与 Windows CI 就绪；先做 clamp + 复位 + 提示。
7. **不做 24h soak / 全面性能基线 / DPI 多屏矩阵**（P2，需要真实 Windows 环境）；发布前按 QA 报告的分层门再补。
8. **不做 30 条 P2 文档清理**；只做与 P0 直接相关的“真相修正”（README/HANDOFF/LEGAL 版本/CI 声明）。
9. **不把 `%APPDATA%` 重定向当隔离方案**（Tauri 走 Known Folder）；必须用 `DG_QA_DATA_DIR`/`app_directories_override`。
10. **不在 CI 上调会触碰真实 appdata 的脚本**；测试数据必须先隔离。

### 5.3 对评审建议的改写/否决（明确记录，避免反复）

| 评审建议 | 本文件处理 | 理由 |
|---|---|---|
| “干净 checkout 必红”按 P0 修两个测试 | **改写**：两个必然红已修；P0 改为“CI 从未运行 + README 假陈述 + 无 `npm run ci`” | 避免修已修问题 |
| 立即移除/前移年龄核验 | **否决擅自动手**，转 E0-T3 用户/法务决策 | 用户已拍板的合规顺序（gate.ts:377） |
| 立即做托盘/独立设置窗口 | **降 P2**，先 clamp/复位/提示 | 成本 2–4 人日 + Windows 构建，且不阻塞数据/门禁 |
| 强制统一两套内容 schema | **否决**；保留双 schema + 共享语义单源 | CONTENT-MARKET §3.7 与 ARCH §7.5 已论证 |
| 市场 UI 直接读 webview fetch / 放宽 CSP | **否决**；改 Rust `market_fetch` 桥 | NET-P1-2 + 安全边界 |
| 移植 famling 完整 consent 到插件 | **否决**；只做轻量 host 地板 | PSY §8 自评“3–5 人日高风险” |
| QA-P0-3 立即抽 main.ts（3–4 人日） | **拆分**：当前缺陷留 P0（E1-T2），测试/抽取降 P1（E8-T1） | 避免挤占数据隔离/CI |

### 5.4 需拍板、不能擅自做的（不是“不做”）

- **D01 产品形态**（A/B、市场范围、DLC/收费）——E0-T1。
- **D02 发布身份/密钥保管/Authenticode/updater**——E0-T2。
- **D03 年龄核验顺序**——E0-T3。
- **资产/规范能否公开**（ARCH Q2：帧 sha/台词/资产清单公开级别）——随 E6-T2 决策。
- **是否发布插件到 npm/公开仓**——决定 E4 是否升 P0。

---

## 6. 风险、假设与需要 lead 注意的坑

1. **评审快照与并发**：七份评审写于同一棵脏树（12:59–13:12），期间 `main.ts`/`content-hub.ts` 被并发修改，行号会漂移（例如 `main.ts` 已从 3555 到 3607 行）。引用一律按函数名/文案复核；已在本文件标注。
2. **任务板与代码不一致（需要 lead 对账）**：`task-52`（内容模型 v2）、`task-54`（famling 角色主题 UI v2）、`task-63`（插件右键菜单）仍 pending/pending/pending，`task-64` in_progress，但 `d5655c9` 已提交了其中大部分内容（内容 v2/角色=主题/最小右键菜单/设置弹窗）。若不先对账，依赖图会把“已完成”当“未做”，重复派活。建议 lead 逐项确认后置 completed 或写明剩余范围。
3. **外部阻塞不可压缩**：DLC 生产私钥 ceremony 与 Authenticode 证书是 REL 的关键路径，不是工程能加班解决的；越早启动 owner 流程越好。缓解：先做 E5-T1/T3（冻结宣称 + staged 门禁 + SHA256SUMS 外层签名）。
4. **本机无法复跑全量测试**：WSL 的 `node_modules` 是 win32 原生 esbuild；Windows 侧本机无 Python，生成器测试报 9009。因此本文件**不引用**“全绿/全红”作为论据，只用定向测试与源码证据。CI 建立后才会有可复核的全量证据。
5. **若 D01 选 B，优先级反转**：试玩 gate（E9-T2）在商业化之前，REL 仍需 P0（要发 Windows 安装包），但市场功能排在 gate 后；不要把“市场已做”当“玩法已验证”。
6. **若 D01 选 A，REL/GC 需冻结**：保留代码但默认关闭，不要在 README/商店页做能力承诺；E5-T1 的“冻结宣称”必须先于任何对外演示。
7. **心理/UX 的“已修”不等于“可验收”**：静音/减少动态已有实现，但需要在真实 Tauri 窗口验收一次；评审与本文件都没有做 Windows 实机（那是 QA P1-3 的范围）。在 CI/真机证据前，只能标“代码层已修”。

---

## 附录 A：本轮复核命令与证据索引（只读）

```bash
# 当前快照
cd /mnt/d/Projects/dsh/desktop-games
git log -3 --format='%h %ad %s' --date=iso-strict
git remote -v; git tag | wc -l

# 类型/定向测试（本文件实际执行）
npx tsc --noEmit
# WSL 下 npm test 不可用（win32 esbuild）；以下经 powershell 跑 Windows node：
# node --import tsx --test tests/use-restrictions.test.ts tests/ui-assets.test.ts   → 18/18
# node --import tsx --test tests/desktop-shell-menu.test.ts tests/desktop-shell.test.ts → 32/32

# 发布信任/身份
sed -n '1,20p' native/dlc-verify/trust/production-trust-root.json
sed -n '1,40p' app/tauri/src-tauri/tauri.conf.json
grep -c updater app/tauri/src-tauri/Cargo.toml app/tauri/src-tauri/tauri.conf.json
ls packs/farm-seasons/signature.json 2>/dev/null || echo NO_SIG_JSON

# 数据隔离
grep -rnE 'DG_QA_DATA_DIR|app_directories_override' src scripts app | head
sed -n '945,965p' app/tauri/src-tauri/src/main.rs

# 质量门
sed -n '1,8p' .github/workflows/ci.yml
node -e "console.log(Object.keys(require('./package.json').scripts).filter(k=>k==='ci'||k.startsWith('ci:')))"

# 菜单/存档/安静面
sed -n '833,962p' src/pet/desktop-shell.ts
sed -n '1296,1345p' src/pet/desktop-shell.ts
sed -n '3340,3348p' src/pet/main.ts
sed -n '2066,2087p' src/pet/main.ts
sed -n '2451,2472p' src/pet/main.ts

# 插件
cd /mnt/d/Projects/dsh/plugins/dsh-famling
git rev-parse --show-toplevel 2>/dev/null || echo NOT_A_GIT_REPO
ls .github 2>/dev/null || echo NO_CI
grep -nE 'embed-anims|desktop-games' scripts/embed-anims.mjs | head
grep -rnE '12356|危机|crisis' client.js index.js client.content.js || echo NO_CRISIS_CODE
head -3 docs/LEGAL-NOTICE-2026-11-18.md
```

**关键证据索引（file:line）**

| 主题 | 位置 |
|---|---|
| 当前根菜单 6 项/二级/设置 | `src/pet/desktop-shell.ts:833-848, 849-962, 1296-1450` |
| dev 面板仅 debug | `src/pet/desktop-shell.ts:956-959, 1458-1462` |
| 保存后退出 | `src/pet/main.ts:3340-3348`；注入 `:3445` |
| 更多菜单裸退出 | `src/pet/desktop-shell.ts:961` |
| 删除存档不清旗标 | `src/pet/main.ts:2066-2087` |
| reduce-motion 冻结 hero | `src/pet/main.ts:2451-2472` |
| QA 数据隔离缺失 | `app/tauri/src-tauri/src/main.rs:952-959`；`scripts/cdp-launch.ps1:19-20` |
| CI 无 remote 自述 | `.github/workflows/ci.yml:3-4`；`rust-tauri-tests` `:117-124` |
| README 假陈述 | `README.md:11` |
| 两个必红测试已修 | `tests/use-restrictions.test.ts:54-64`；`public/assets/ui/manifest.json` contactSheets |
| 生产信任根空 | `native/dlc-verify/trust/production-trust-root.json:8` |
| 产品身份旧 | `app/tauri/src-tauri/tauri.conf.json:3-5`；`package.json:2-4` |
| 插件跨私仓生成 | `plugins/dsh-famling/scripts/embed-anims.mjs:82,84` |
| 插件缺资产 warning/skip | `plugins/dsh-famling/scripts/verify-anims.mjs:563-580`；`test/client-static.test.js` 两个 skip 测试 |
| 插件安全缺口 | 插件 `docs/LEGAL-NOTICE-2026-11-18.md:3,27`；code grep 无 12356 |
| 年龄顺序硬契约 | `src/pet/consent/gate.ts:377-380` |
| 内容动画不可交付 | `src/pet/hero-runtime.ts:86`；`src/pet/content-hub.ts:378-405` |
| 市场客户端默认 fetch/CSP | `src/pet/content-market.ts:207-212`；`app/tauri/src-tauri/tauri.conf.json:30` |
| 共享语义已手工对齐 | 插件 `client.js:77-83,128-139`；famling `public/content/library.json`；插件 `README.md:164` |

## 附录 B：与其它 triage 任务的分工

- `task-68`（架构/重构任务化）：本文件只保留 P0 相关的 ARCH 结论（P1/P2 的架构项由其展开，避免重复）。
- `task-69`（UX/心理/无障碍矛盾审查）：本文件只处理其中被列为 P0 的部分；P1 的同意可读性/2h 提醒/无障碍清单由其展开。
- `task-70`（安全/发布/市场任务化）：本文件的 E5/E6 是其输入；外部 ceremony/证书/市场服务端如单独成文，以其为准、本文件只引用 ID。
- `task-71`（QA/性能/资产与内容管线）：E2/E8 与其重叠；本文件提供 P0 范围与验收，其展开 fast/full/gui/perf 分层与资产管线。
- **任务板对账请求**：`task-52`、`task-54`、`task-63`（README/代码已大部分落地）与 `task-64`（in_progress）请 lead 确认状态，否则本文件的依赖图（以及其它 triage 的任务树）会把已完成项当未做。
- **跨 triage 口径差异（写作时已看到 ARCH/SECURITY/UX 三份落盘）**：① SECURITY 按“目标发布通道”把发布信任仍列 P0 并建议第一批做 DLC 移除/ceremony；本文件同意其方向，但把 REL 标为 **P0 条件**（默认 A 研究原型下降为 P1 + 冻结宣称），二者不冲突、只是是否把“对外分发”当既定前提。② UX triage 把“窗口 clamp/发现性 coach”列 P0（其 P0 定义=演示给非项目成员前），本文件把 WR/发现性列 P1/P2；差异来自 P0 口径，不是事实分歧。③ ARCH triage 的“6 个 P0”与本文件 6 个动作面大体一致。**建议 lead 以本文件为“P0 冲突裁定底稿”，各专项文档在其范围内细化；若最终采用 SECURITY 的“公开 signed 发布”作为既定前提，则 REL 全部保持 P0、本文件 §3.1 的条件式降级自动失效。**

---

*本文件只读分析，不修改代码/资产；所有“当前状态”以 HEAD `7107a61` + 2026-11-19 14:36 前复核为准。若之后代码继续变化，请按函数名/选择器复核，不要只信行号。*
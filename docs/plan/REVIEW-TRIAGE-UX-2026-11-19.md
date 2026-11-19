# UX / 心理 / 无障碍矛盾审查与任务拆解（REVIEW-TRIAGE-UX-2026-11-19）

> 任务：task-69（lead 委派，owner=triage-ux）。本文只做 **只读分析 + 裁定建议 + 任务拆解**；唯一写入 = 本文件；未改代码/资产/配置，未 commit/push，未运行 GUI/Tauri/E2E。
> 输入：七份 `docs/research/PROJECT-REVIEW-*-2026-11-19.md`（重点 UX / PSYCHOLOGY，横向核对 ARCHITECT / SOFTWARE / NETWORK / GAME / QA 的交互相关项）、`PROJECT-REVIEW-ALL-FINDINGS-2026-11-19.md`、当前代码与 `docs/DESIGN/DECISIONS` 真值。
> 快照：`desktop-games` HEAD `7107a61`（2026-11-19，工作树仅 2 个文档修改 + 1 个未跟踪评审索引；代码已提交）；`dsh-famling` 目录无 git，`package.json` 版本 **0.10.2**（两份评审基于 0.10.0）。
> 口径：本项目的产品定位 = **研究/原型验证（researchOnly）**，不对外发布、不宣称可用/合规；因此本文的 P0 定义为「**展示给非项目成员 / 内部演示前必须关闭**」，而不是「商店发布阻断」——发布/信任/CI/法务阻断不在本文重新裁定。

## 0. 结论摘要（先读这一节）

### 0.1 三句话

1. **评审里约一半的 UX P0/P1 已被 2026-11-19 的三个提交和插件 0.10.1/0.10.2 改掉**（根菜单 23 项→6 项、开发入口下架、总设置弹窗、减少动态、根菜单退出保存、插件零常驻按钮 + 分级菜单 + 统一设置），剩下的不是「再加功能」，而是**把新结构收口、补发现性、补数据安全与安全地板**。
2. **当前最大的 UX 风险从「菜单太长」变成了「没有入口」**：桌面壳与插件都默认零按钮，唯一入口是右键/Shift+F10，且**没有首用提示**；这与 UX 评审 P1-6、心理评审「一层可达」原则冲突。裁定：保留零按钮方向，但首用 coach + 设置内开关必须做（P0）。
3. **最严重的伦理/信任矛盾在插件端**：`dsh-famling` 有真实 LLM 人格聊天，而 famling README 仍写「不提供自由 LLM 对话」、插件 AI 声明仍写「不提供自由 LLM 角色扮演或情感陪伴」，且插件**没有危机资源预检、发送去向告知、首启告知、清除本机设置**——这是本次评审里唯一「保留功能就必须补安全地板」的 P0。

### 0.2 最重要的 3 个矛盾（详见 §2）

| # | 矛盾 | 双方 | 裁定（一句话） |
|---|---|---|---|
| C-00 | **产品定位四重口径** | README「桌面常驻小游戏底座」 vs README/D-13/D-18「工作助手/非陪伴/研究原型」 vs 七份评审「桌宠/内容市场」 vs 插件真实的自由 LLM 聊天 | 以「**研究原型 + 桌面工作助手皮（pet + 角色主题内容 + Advisers 只读）**」作为 v1 唯一裁定框架；游戏 demo 不是 v1 产品形态；插件聊天按「工作助手型 AI 回复」定位并补安全地板（DEC-01） |
| C-01 | **零按钮默认 vs 可发现性/可达性** | task-65 零按钮实现 + 测试锁定「默认隐藏 ⋯」 vs UX-P1-6（触发器 ≥24 / coach mark）、PSY「一层可达」原则、键盘用户无法聚焦宠物本体 | 保留零按钮；**首用一次性 coach + 设置内可开启 ⋯ + 键盘可达**为 P0（E-01/A-03） |
| C-02 | **插件真实自由聊天 vs 非陪伴/不提供自由 LLM 口径** | 插件 `index.js` 的 `ctx.llm.stream` 人格聊天 + `client.js` AI 声明 vs famling README「不提供自由 LLM 对话」/ D-18「v1 0 模型调用」/ 插件自述「研究/技术演示」 | 插件聊天**保留但降级表述为工作助手型 AI 回复**，并补危机预检、发送去向、首启告知、清除入口（P-01/P-02）；是否保留聊天由 owner 拍板（DEC-01） |

> 另有一个必须立刻修的**实现级硬矛盾**（不算跨评审矛盾）：退出/保存有三条路径且语义不一致——根菜单「退出」走 `saveNow() → close`（7107a61 已实现），「更多」子菜单的「退出」仍是 `winRef.close()`，About 的「退出应用」仍是 `exitApplication()` 不保存；坏档时提示「先点保存」但删除存档不清 `saveRecoveryNeeded`。归入 V-01/V-02（P0）。

### 0.3 数量与口径

| 项 | 数量 | 说明 |
|---|---|---|
| 跨评审/决策矛盾 | **13**（C-00～C-12） | 含 1 个定位级、2 个产品决策级、10 个交互/无障碍级 |
| 重复项合并组 | **12**（G-01～G-12） | 覆盖 UX/PSY 全部条目及 ARCH/GAME/QA/NETWORK 的交叉项 |
| 已被后续改动解决/部分解决/失效 | **26**（R-01～R-26） | 见 §1.3；其中 7 条已解决/失效，8 条部分解决，11 条仍成立 |
| 重新分级后的任务 | **P0 × 7、P1 × 23、P2 × 8（合计 38）** | Epic × 9；估算 P0 约 4–5 人日、P1 约 15–22 人日、P2 约 3–4 人日 |
| 明确不做 | **14**（N-01～N-14） | 见 §6；含「不新开窗/不加托盘 P0/不重开 roleplay/不移植完整 consent」等 |
| 待拍板决策 | **6**（DEC-01～DEC-06） | 见 §8；均应写入决策台账，本文不代替拍板 |

### 0.4 建议第一批（P0，约 4–5 人日；4 个可并行 bundle）

1. **V-01 + V-02 存档/退出闭环**：三条退出一致、坏档恢复选择、删除清标志、退出失败确认 + fake IPC 行为测试（数据安全第一优先）。
2. **E-01 首用发现性**：一次性 coach（右键/Shift+F10/设置可显示 ⋯）+ 第二次启动不再出现 + 可关闭持久化（Fake DOM 测试）。
3. **P-01 + P-02 插件安全地板**：自伤关键词不发 LLM、固定资源回复、发送去向句、一次性首启卡、AI/口径文案统一（插件单测）。
4. **W-01 + W-02 窗口召回**：拖动/启动/换屏 clamp + 更多菜单「复位窗口到右下角」入口（纯函数测试 + 实机手册）。

### 0.5 本文不覆盖的边界

- 发布信任链（DLC 根/签名/updater）、CI/质量门、GUI 测试数据隔离、内容契约单一权威源、main.ts 重构、市场传输层/防回滚等 P0：由 task-67/68/70/71 与对应评审任务化，本文只在 §7.1 标依赖，**不重复立任务**。
- 本评审没有 Windows 实机；所有「当前实现」结论来自静态阅读 + 现有测试；所有「运行时行为」均需按 §7 的验收方式实机复核。

## 1. 快照、方法与变更核对

### 1.1 快照与评审输入

| 项 | 值 |
|---|---|
| 代码快照 | `desktop-games` HEAD `7107a61`；`git status`：2 个已修改文档（`docs/art/...`、`docs/research/COMPETITORS-CHINA-DSH.md`）+ 1 个未跟踪评审索引 |
| 评审快照 | UX 评审 HEAD `779354b` + 脏树（21 项）；PSY 评审约 12:50–13:05；两份均未含 `7107a61` 及之后内容 |
| 插件快照 | `dsh-famling` 无 git；`package.json` 0.10.2；评审时为 0.10.0；0.10.1 引入零按钮 + 分级菜单 + 统一设置弹窗 |
| 读取范围 | 七份评审全文（UX/PSY 逐段；其余按标题 + 与交互相关章节）、ALL-FINDINGS、`DESKTOP-PET-UX-2026-11-16.md`、`DECISIONS-RECOMMENDED-2026-11-17.md`、`V1-DECISIONS-REAL-MACHINE-2026-11-17.md`、`docs/design/CONTENT-MARKET-2026-11-19.md` 相关节、当前 `src/pet/*`、`pet.html`、`pet.css`、`app/tauri/**`、插件 `index.js`/`client.js`/`client.content.js`/README/LEGAL-NOTICE |
| 未执行 | 未运行 `npm test`/`typecheck`/`build`、未启动 Tauri/WebView2/DSH GUI、未做真人可用性测试；行号可能漂移，引用时同时给可搜索原文/选择器 |

### 1.2 评审后发生的代码变化（决定「旧条目的有效性」）

| 提交/版本 | 变化 | 直接影响 |
|---|---|---|
| `d5655c9` | 角色=主题 bundle、素材包导入、市场契约、极简右键菜单；桌面壳根菜单从 23 项降为 6 项 + 互动/更多二级；开发入口移入 `?debug=1`/dev build；新增总设置弹窗、减少动态、触发器 24px | 关闭/部分关闭 UX-P0-1、P0-2(B)、P1-4、P1-6(尺寸)、P1-7(部分)、PSY-P0-1(部分) |
| `0bbbe43` | 远程市场客户端 v1（签名目录/防回滚/下载校验，默认未配置、不联网） | 网络评审「无任何远程市场运行代码」的断言对当前代码失效；内容中心「市场」tab 的文案/隐私披露需要重新核对（H-04） |
| `7107a61` | 根菜单「退出」改为 save-then-exit | 关闭 UX-P0-3 的「退出不保存」一半；但「更多」与 About 的退出仍未走保存（V-01） |
| 插件 0.10.1 | 默认零常驻按钮；右键/Shift+F10 分级菜单（一级 5 项 + 退出）；统一设置弹窗；菜单按钮开关默认关 | 关闭 UX-P1-8「四按钮」；插件键盘菜单模型部分补齐；但发现性、面板焦点、安全地板仍在（P-01～P-05） |
| 插件 0.10.2 | 版本与少量 UI/文案修正；`LEGAL-NOTICE` 仍写 0.8.5 | 插件文档漂移仍在（D-02） |

### 1.3 已被后续改动解决 / 部分解决 / 失效的条目（R 表）

| ID | 原条目 | 当前状态 | 证据（当前代码，非评审行号） |
|---|---|---|---|
| R-01 | UX-P0-1：根菜单 23 项、两屏滚动 | **已解决（根）**：根 6 项；导出测试锁定 `['compose','interact','content','settings','more','quit']` | `src/pet/desktop-shell.ts` `SHELL_MENU_ROOT_ACTIONS`；`tests/desktop-shell-menu.test.ts` |
| R-02 | UX-P0-2(B)：发布菜单含「完整面板」单向门 | **已解决**：仅 `debugMode`（`?debug=1`/`?dev=1`/Vite dev）渲染 | `desktop-shell.ts` `debugShellFromSearch`/`isViteDevBuild` |
| R-03 | UX-P1-6/§5.6：触发器 22×22、opacity .55 | **部分**：24×24 已达标；但默认 `hidden`（零按钮）且无 coach | `pet.css` `.pet-menu-button`；`resolveShowMenuButton()` 默认 false |
| R-04 | UX-P0-2：静音/音量/PTT/改名/复位/保存不可达 | **部分**：总设置弹窗已含 显示菜单按钮/静音/音量/减少动态/复位/保存/读取/缩放/文字/内容/Advisers/关于/撤回/删除；PTT、改名、置顶、穿透状态、全屏隐藏仍无入口 | `desktop-shell.ts` `buildSettingsModal()`；`pet.html` 仍保留隐藏 `#talk`/`#rename` |
| R-05 | UX-P0-3：退出不保存 | **部分**：根菜单走 `onExit → exitAfterSave()`；「更多」的退出与 About 的退出仍不保存 | `desktop-shell.ts` 根 `add('退出', ... onExit)` vs 更多 `winRef.close()`；`main.ts` `about-exit → exitApplication()` |
| R-06 | PSY-P0-1：无静音/音量/减少动态；画布不尊重 reduce-motion | **大部分解决**：设置可静音/调音量/减少动态；`prefers-reduced-motion` 首跑默认；hero 循环在 `data-reduce-motion=1` 时冻结场景、只静止重绘 | `desktop-shell.ts` `resolveReduceMotion/applyReduceMotion`；`main.ts` `heroFrame` 的 `reducedMotion` 分支 |
| R-07 | PSY-P1-3：画布不尊重 reduce-motion | **解决**（同上）；但 #bubble 仍无 live region、#pet 仍不可键盘聚焦、canvas 仍无 aria-label | `pet.html` `#pet`/`#bubble`/`#hero-canvas` |
| R-08 | UX-P1-4：菜单可穿到内容中心模态后面 | **已解决**：`menuBlocked()` 含 `isHigherModalOpen`（内容中心）与设置；contextmenu 也先检查 | `desktop-shell.ts` `menuBlocked`/contextmenu；`main.ts` `isHigherModalOpen: () => hub?.isOpen()` |
| R-09 | UX-P1-2：点窗外不关闭 | **部分**：已加 `window.blur` 关闭菜单/设置；但设计要求的「菜单打开时整窗命中」未实现，命中区仍只报菜单矩形 | `desktop-shell.ts` blur 监听；`hit-regions.ts` `HIT_SELECTORS`（无整窗特判） |
| R-10 | UX-P1-1/§2.3：内容中心六类 tab | **已解决（IA）**：v2 为 角色/自定义/内容包/市场 四 tab，角色=主题 | `content-hub.ts` `CONTENT_HUB_TOP_TABS` |
| R-11 | UX-P1-8：插件四个常驻按钮 | **已解决**：默认只渲染角色；菜单按钮可选；统一设置弹窗 | 插件 README 0.10.1/0.10.2；`client.js` `menuButton` 默认 false |
| R-12 | ARCH-P0-1：两端角色 bundle / 对话档语义漂移 | **大部分解决**：human/cat/dog 的 dialogue/theme/background/font 已逐项对齐；`standard 240/0.7、brief 80/0.4、quiet 50/0.05` 两端一致；残留 origami `high-contrast` 在插件映射为 `night` 且 `available:false`（C-12） | `public/content/library.json` rolePresets；插件 `client.js` `ROLE_BUNDLES`/`DIALOGUE_MODES` |
| R-13 | NETWORK 评审：本项目没有任何远程市场运行代码 | **对当前代码失效**：`src/pet/content-market.ts` 已实现 host 侧传输/验签/防回滚/安装编排；默认未配置、构造不 fetch。其安全/发布结论仍归 task-70，不因本文改变 | `content-market.ts` 头部契约；`content-hub.ts` market 状态 |
| R-14 | UX-P1-9：菜单状态不反映真实状态 | **部分**：Advisers 有状态标题/重试；开关仍无 ✓；缩放/字号有 aria-checked；但缩放/字号同时出现在「更多」与设置（重复） | `desktop-shell.ts` 更多分支 |
| R-15 | UX-P1-10：Composer 失败无重试/「稍后」=关闭 | **仍未解决**（结果卡仍只有 展开/稍后/关闭；无重试/复制/草稿） | `desktop-shell.ts` result card 构造 |
| R-16 | PSY-P1-1：TOS 1 万字墙、36vh、11px、无关键事实层 | **仍未解决**：consent 文本 11px、`.consent-tos` max-height 36vh；无 firstRun 关键事实层（`APP-DISCLOSURE-TEXTS` 仍标未实现） | `pet.css` `.consent-tos`；`docs/legal/APP-DISCLOSURE-TEXTS.md` |
| R-17 | PSY-P1-5：2h 提醒只在 pet 页、隐藏即暂停、重启清零 | **仍未解决**：`startHealthReminder` 仅 `main.ts`；`runtime.ts` 在 `visibilityState === hidden` 时 return；无持久化；banner 仍 `role=alert` + `aria-live=polite`、按钮仍「休息并关闭提醒」 | `src/pet/consent/runtime.ts`；`modal.ts` `showHealthBanner` |
| R-18 | 托盘 / 单实例 / 全屏自动隐藏 | **仍未解决**：`app/tauri` 无 TrayIcon/single-instance；pet 未接 `watchFullscreen` | `grep TrayIcon` 0；`src/shell/fullscreen.ts` 仅游戏页引用 |
| R-19 | UX-P2-4：README/设计文档 IA 漂移 | **仍成立**：README 第 3 行仍写「角色/声音/对话/主题/背景/字体」六类；`DESKTOP-PET-UX-2026-11-16` 的 9 项根菜单/整窗命中/同窗工具页仍是「已批准但未实现/已被 task-65 改变」 | `README.md:3`；设计文档 §3.5/§6 |
| R-20 | PSY-P1-6：法务/声明与实现漂移 | **仍成立**：README 的「已知发布阻断」仍写 ASR 无告知/同意、撤回/全删未实现（代码已有）；`RELEASE-BLOCKERS` 仍写全年龄不设年龄门（代码为 age→TOS 18+ 门）；插件 LEGAL-NOTICE 仍 0.8.5 | `README.md` 发布阻断段；插件 `docs/LEGAL-NOTICE-2026-11-18.md:3` |
| R-21 | UX-P2-5：右键抑制原生菜单 | **仍成立**：`document contextmenu` 先 `preventDefault()`，未对 INPUT/TEXTAREA/contenteditable 放行 | `desktop-shell.ts` contextmenu 监听 |
| R-22 | UX-P2-8：单实例缺失 | **仍成立**：无双开会话保护；两实例可同时写同一存档/窗口位置 | `app/tauri/src-tauri` 无 single-instance |
| R-23 | GAME-P1-4：角色切换整页 reload | **仍成立**：role theme 里 character 变化走 `applyRendererChoice` → `location.reload()`；appearance/dialogue 即时 | `main.ts` `applyRoleThemeFromHub`/`applyRendererChoice` |
| R-24 | PSY-P0-3：年龄核验在 TOS 之前、与 roleplay 无公开入口矛盾 | **未解决但改判**：代码注释明确「ORDER IS A HARD CONTRACT (user decision): age → TOS」；评审建议需用户重新拍板，不按 P0 任务处理（DEC-02） | `consent/gate.ts` `runBootstrap` 注释与顺序 |
| R-25 | UX-P2-9/§5.9：app icon 仍是 Tauri 默认 | **仍成立** | `app/tauri/src-tauri/icons/icon.png` |
| R-26 | UX/PSY：菜单/根项「5 项」文案 | **新发现不一致**：代码注释与测试名写「root ≤5」，常量实际 6 项（5 actions + quit）；插件 README 写一级 5 项，代码含「退出」共 6 项 | `desktop-shell.ts:66-69`；`tests/desktop-shell-menu.test.ts:168-169`；插件 README/`client.js` menuItems |

### 1.4 评审断言的漂移与不可复核边界

- **行号全部按快照失效**：`desktop-shell.ts` 从评审时的约 900 行增至 2244 行；`content-hub.ts` 约 2314 → 更大且拆出 `content-assets.ts`/`content-market.ts`。引用应使用函数名/选择器/原文（本文已这样处理）。
- **评审数字**：UX 评审「23 项/21 项、328px、230px」对当前根菜单已不成立；PSY 评审「无设置/无 reduce」已不成立。仍成立的是结构性问题（内容中心尺寸、同意可读性、2h、托盘、插件安全地板）。
- **未实机项**：菜单真实滚动、窗口失焦关闭、Tauri 下 `window.open`、托盘/单实例、内容中心临时放大、键盘聚焦路径，均需 Windows 实机验证；本文只在验收里写明方法，不写成已通过。

## 2. 矛盾清单（C-00～C-12）

### C-00 产品定位四重口径（最高优先级的前提冲突）

- **甲方**：`README.md` 第 46 行「这是一个桌面常驻小游戏底座，不是宠物专用框架；目标形态包括侧栏/底栏/任务栏角落」；三个 `demo:true` 游戏仍随包。
- **乙方**：法务/使用限制 + D-13/D-18「工作助手皮、不做陪伴、v1 0 自由 LLM chat」；README 又写「不提供自由 LLM 对话」。
- **丙方**：UX/PSY 七份评审默认「桌宠/陪伴风险面」评估（tray、quiet hours、危机、2h、依恋）。
- **丁方**：插件 0.10.2 实际有人格化自由 LLM 聊天（`index.js` `ctx.llm.stream`），与「非陪伴」口径不完全一致。
- **为何冲突**：定位决定 P0 集合——若真是游戏平台，2h/危机/quiet hours 不是第一优先；若是陪伴风险面，插件安全地板必须是 P0；若只是研究原型，很多「发布级」要求可降为「演示前」。评审之间没有共享同一个产品定义。
- **裁定**：以**研究原型**为唯一裁定框架；v1 产品面 = 「桌面工作助手皮（pet 交互 + 角色主题内容 + Advisers 只读）」，**游戏 demo 不计入 v1 产品面、不据此立 UX 任务**；插件按「工作助手型 AI 回复」定位；所有对外文案删除/限定「游戏平台」「陪伴」两类暗示。需 owner 在 DEC-01 确认。
- **落点**：D-01/D-02/D-03（文档真值）、P-02（插件口径）、§6 N-10。

### C-01 零按钮默认 vs 可发现性/键盘可达

- **甲方**：task-65 现行方向「默认零常驻按钮」；测试断言触发器默认 hidden；插件 0.10.1 同方向。理由：低打扰、克制、角色周围无 chrome。
- **乙方**：UX-P1-6 要求触发器 ≥24px、首次 coach mark、点气泡开 composer；PSY 原则「一层可达、最多两次点击」；UX-P0-2 要求必需控件可达；A11y 要求键盘可聚焦宠物。
- **为何冲突**：零按钮把「入口」从可见 UI 移到「右键/Shift+F10 这种隐藏知识」；新用户/键盘用户/触屏用户可能永远找不到菜单；且桌面窗 `skipTaskbar` + 宠物 `#pet` 无 tabindex，键盘用户连窗口焦点都难获得。
- **裁定**：**保留零按钮**（不推翻 task-65），但把「发现性」升级为 P0：首用一次性 coach（可关、只一次、非阻断）+ 设置中可开启 ⋯（已有）+ README/首启文案说明右键/Shift+F10；A11y 侧给 `#pet` tabindex/role 并保证键盘路径（A-03）。
- **落点**：E-01（P0）、A-03（P1）、D-01（文档）。

### C-02 插件真实自由聊天 vs 非陪伴/不提供自由 LLM 口径

- **甲方**：插件 `index.js` 实际调用 `ctx.llm.stream`，system prompt 为汀岚/猫/狗人格；`client.js` 输入面板 AI 声明只写「AI 生成、不是真人；不提供自由 LLM 角色扮演或情感陪伴」，未写「文本会发送给模型供应商」。
- **乙方**：famling README 写「当前版本仍只有本地模板，不提供自由 LLM 对话」；D-18「v1 0 模型调用」；插件 README 自称「研究/技术演示入口（不是情感陪伴产品）」。
- **为何冲突**：同一品牌/角色，一端说「不提供」，另一端实际提供；用户无法判断哪句是真的；对情感依赖/危机/隐私是最高风险面。
- **裁定**：① 保留插件聊天（DSH 自己的模型配置，属工作环境助手型），但**把「官方口径」改为事实描述**：「不提供官方自由 LLM 角色扮演/情感陪伴；本插件的聊天是工作助手型 AI 回复，文本发送给你在 DSH 配置的模型供应商」；② **保留功能就必须补安全地板**：危机关键词本地预检（P-01）、发送去向 + 首启告知（P-02）、清除本机设置（P-03）；③ 是否保留聊天本体由 owner 在 DEC-01 拍板，工程先做 ①②，因为无论去留都需要诚实文案。
- **落点**：P-01/P-02（P0）、P-03、D-02。

### C-03 内容中心/设置需要正常尺寸 vs v1 不开新窗

- **甲方**：UX-P1-1（内容中心塞进 480×336、54vh、8–11px，建议独立 720×560 窗口）、UX-P1-7（设置需要完整 sheet）、UX-P0-4（托盘/主界面）。
- **乙方**：`DESKTOP-PET-UX-2026-11-16.md` §3.5「设置/折页簿/Advisers = 同窗 panel；导入/配置页 = 同窗导航 + setSize(720×560)」；`DECISIONS-RECOMMENDED` D-15「v1 0 新窗」；`V1-DECISIONS` §4.1 非目标「独立结果窗/第二窗（v1.1）」。
- **为何冲突**：内容中心/设置是当前最大用户面，480×336 下不可读；但独立窗口会破坏「透明置顶小窗」形态、增加 Tauri 窗口/ACL/焦点/截图成本，且被 v1 决策排除。
- **裁定**：v1 **不新开第二窗口**；采用「**同窗临时放大 + 响应式重排**」：打开内容中心/设置时保存原窗口尺寸/位置，`setSize(800×600)`（内容中心面板 max 760px + 12px 边距 ≈ 784px，故推荐 800 宽；复用工具页 setSize 套路），关闭/Esc/失败时恢复 480×336；浏览器/非 Tauri 降级为响应式布局不放大。独立窗口与托盘同属 v1.1/P1 beta，不阻塞 v1 演示。
- **落点**：H-01（响应式，P1）、H-02（临时放大，P1）、W-03（托盘，P1）。

### C-04 托盘是否 P0 vs 设计/决策把它放 Phase 2/P1

- **甲方**：UX-P0-4「置顶+无边框+skipTaskbar+可拖动 ⇒ 必须有托盘，否则拖出屏幕找不回」；PSY-P2-10 同向。
- **乙方**：`DESKTOP-PET-UX-2026-11-16` §3.4「无托盘（skipTaskbar 后靠菜单退出；Phase 2 再评估 tray）」；D-15「v1 不做托盘」；`V1-DECISIONS` W9 把托盘列为 P1 beta。
- **为何冲突**：托盘是「稳定召回面」与「产品级桌面软件」的行业标准；但 v1 明确不做新窗/新系统集成。
- **裁定**：**托盘降为 P1（beta 门）**，但「召回」不能等：W-01 clamp + W-02 产品菜单复位入口为 P0；若 beta 仍无托盘，必须**二者择一**：去掉 `skipTaskbar`（留任务栏）或提供托盘，不允许「skipTaskbar + 无托盘 + 可拖出屏幕」同时存在。
- **落点**：W-01/W-02（P0）、W-03（P1）、DEC-04。

### C-05 首启年龄核验顺序/数据最小化 vs 用户硬契约与文档漂移

- **甲方**：PSY-P0-3 建议把年龄核验移到 roleplay 入口（或移除），先 TOS 后采集；PSY-P0-3 同时指 roleplay 无公开入口。
- **乙方**：`consent/gate.ts` 注释「ORDER IS A HARD CONTRACT (user decision): age self-report → TOS → app」；2026-11-17.5 用户拍板；TOS/About/APP-DISCLOSURE 均按此。
- **丙方**：`docs/legal/RELEASE-BLOCKERS.md` 仍写「用户已拍板全年龄、不设年龄门」，与实现/README 矛盾（文档漂移）。
- **为何冲突**：评审的「数据最小化/先告知后采集」是正确的通用原则，但与用户已拍板的顺序硬契约冲突；且 roleplay 当前无公开入口，使采集显得不必要。
- **裁定**：**不擅自改顺序**（DEC-02 由 owner 重新拍板）。工程可先做三件不改契约的事：① 年龄弹窗顶部用一行说明「为什么现在需要/不用于什么」；② 只把「是否成年 + 核验时间」用于 About 展示，完整生日仅本机（现状已本机，是否改存布尔需拍板）；③ 同步 RELEASE-BLOCKERS/README/PRIVACY 与实现一致（D-02）。若 roleplay 长期不开放，owner 可再考虑移除（DEC-02）。
- **落点**：D-02（P2）、DEC-02。

### C-06 2h 健康提醒范围/口径 vs canon「连续使用」

- **甲方**：PSY-P1-5 指出只在 pet 页、页面 hidden 即暂停、重启清零、游戏窗口无提醒；按钮「休息并关闭提醒」易误读为永久关闭；`role=alert` + `aria-live=polite` 冲突。
- **乙方**：`APP-DISCLOSURE-TEXTS` §3 最小实现约束：「2h 计时以连续使用口径（无输入超过 10–15 分钟可视为中断，不得借此规避提醒）；稍后只延迟本次，不关闭义务」；但同一文件又承认游戏/跨窗不在当前实现。
- **为何冲突**：canon 说连续使用；实现用「页面可见」当连续使用；两者对最小化/切游戏场景的结果相反。
- **裁定**：v1 只对 **pet 常驻面**负责：改为持久化时间戳 + 以「用户输入/交互」为连续使用证据（隐藏不等于中断，>10–15 分钟无交互才重置），banner 改 `role=status` + polite 二选一、按钮改「休息一下（2 小时后仍会提醒）」+「10 分钟后再提醒」；游戏页不做跨窗计时（游戏 demo 不属于 v1 产品面）；插件端只做会话级轻提醒（可选，不单独立任务，避免把工作环境变成计时器）。
- **落点**：Q-03（P1）；插件端并入 P-04 的「低打扰默认」一起评估，不单独立项。

### C-07 「设置字段已批准」 vs 当前入口缺失/隐藏功能

- **甲方**：`DESKTOP-PET-UX-2026-11-16` §6.2 批准的设置字段（置顶、点击穿透状态、全屏自动隐藏、PTT、改名、减少动态、声音、数据）；UX-P1-7 要求这些有落点；About/旧文案仍暗示 PTT/改名可用。
- **乙方**：当前总设置弹窗只有 显示菜单按钮/静音/音量/减少动态/复位/保存/读取/缩放/文字/内容/Advisers/关于/撤回/删除；`#talk`/`#rename` 仍在隐藏 aside；Rust 侧无 `set_always_on_top` 命令，pet 未接 `watchFullscreen`。
- **为何冲突**：批准的设计承诺与实现进度不一致；隐藏功能让 README/About 的「按住说话/改名」变成不可验证承诺。
- **裁定**：分两档：**P1 先补**能复用现有逻辑的（PTT 入口、改名入口、置顶开关若补 Rust 命令成本低）；**P2 后补**需要新系统集成的（穿透状态只读说明、全屏自动隐藏随 W-04）。未实现的入口不得在文案里承诺；「设置字段清单」以本文件 §5 S-01 为当期真值。
- **落点**：S-01（P1）、W-04（P2）、D-01。

### C-08 内容市场技术细节透明 vs 认知负荷/隐私披露

- **甲方**：PSY-P2-2「内容中心向终端用户展示协议/密码学细节（7 步验签流程）」，建议移到开发者文档；UX-P2-3 同向（8–10px 密集元数据）。
- **乙方**：NETWORK-P2-7 要求上线前补市场数据流隐私披露（IP/时间/UA/已安装包 id），否则透明度不足；当前 `CONTENT_MARKET_CONTRACT_STEPS` 直接在市场 tab 渲染 7 步。
- **为何冲突**：同一段文字——对普通用户是认知噪音；对合规是必要的透明性。
- **裁定**：两层：主视图只放「未配置/不会联网/验签与用途声明」一句 + 隐私数据流一句（市场启用时）；7 步技术细节折叠进 `<details>技术细节</details>` 或开发者文档链接。**不删除透明性**，只分层。
- **落点**：H-04（P2，市场启用前完成）。

### C-09 角色=主题「一键应用」 vs 角色切换整页 reload

- **甲方**：内容中心 v2 文案「角色就是主题：一键切换角色外观/声音/对话/行为与气泡配色」「一键应用」；插件端即时生效。
- **乙方**：独立版 character 变化仍 `applyRendererChoice` → `window.location.reload()`；用户当前对话/面板状态被打断；GAME-P1-4 已列为问题。
- **为何冲突**：「一键」暗示即时/无中断；实际是重建页面；两个产品同品牌但体验不同。
- **裁定**：v1 **接受 reload**（风险最低），但必须：① 文案明说「切换角色会重新载入界面，可能中断当前对话」；② 在 role card 的 apply 上给确认/说明；③ 热切换列为 P1（H-03）依赖渲染器热替换，不阻塞 v1。
- **落点**：H-03（P1，文案 + 后续热切换）。

### C-10 危险/法律动作位置 vs 可达性

- **甲方**：UX-P2-1/§5.1、PSY 5.3：撤回同意/删除全部数据/TTS 声明不应与高频项同层，应进「关于与声明 → 数据与隐私」二级，危险项最后。
- **乙方**：当前「更多」子菜单里 关于/撤回/删除/TTS 同层；总设置里又有一份 关于/撤回/删除；About 内也有；三处重复。法律/隐私入口需要可发现性（不能只藏在 About 深处）。
- **为何冲突**：降噪/防误点 vs 行使权利的可达性。
- **裁定**：**保留两个层级、去掉第三份**：主入口保留一个「数据与同意…」（在「更多」或设置底部），打开 About 的数据控制区；About 内保留完整解释与二次确认；删除「更多」里与设置/About 重复的直接撤回/删除按钮。保证「≤2 次点击可撤回、≤2 次可删除」，且二次确认不预勾选。
- **落点**：E-02（P1）。

### C-11 插件默认环境输出密度 vs 低打扰/零按钮

- **甲方**：PSY-P1-8：插件微动作每 11–20s、眨眼 3.6–6.2s、环境气泡默认开（`sound:false, motion:true, bubble:true`）；没有 quiet hours/reduce-motion。
- **乙方**：插件 0.10.1「零按钮」是为了克制；DSH 是工作环境，侧栏常驻角色的环境输出比桌面版更容易打断。
- **为何冲突**：删按钮减少了「视觉 chrome」，但没有减少「时间维度上的打扰」；低打扰承诺只在单次交互内成立。
- **裁定**：P1：默认环境气泡关（或仅在用户交互后出现）；微动作间隔 ≥60s；读取 `prefers-reduced-motion` 默认关帧动画；quiet hours 可选。与 famling 的「安静=关闭自动/环境输出，交互回应仍可用」同名同义。
- **落点**：P-04（P1）、C-12。

### C-12 安静/主题跨端同 id 语义（残留）

- **甲方**：PSY-P2-4「安静」两端语义不同（famling 0.05/50 vs 插件 0.35/0）——**当前已对齐**（两端 quiet 均为 50 chars/0.05、brief 80/0.4、standard 240/0.7）。
- **乙方**：残留差异：origami 的 `high-contrast` 主题 famling 有、插件没有（映射 night + available:false）；插件无 high-contrast 主题。
- **裁定**：对话档语义视为已解决；origami 例外保留并写入共享兼容表（D-01 或 spec），要求「同 id 必须同义，例外必须显式登记且用户可见」；不在 v1 为插件补 high-contrast 主题（N-08）。
- **落点**：D-01（P2）。

## 3. 重复项合并（G-01～G-12）

> 原则：同一「用户可感知问题」只保留一个任务归属；跨域重复只在本表登记依赖，不重复立任务。

| 组 | 合并的条目 | 归入 | 说明 |
|---|---|---|---|
| G-01 | UX-P0-1、UX-P0-2(B)、UX-P2-1、PSY-P2-1、UX-P0-1 的「危险项最后」 | E-02 | 菜单 IA、dev 入口、危险项、动态项合并为一个菜单收口任务 |
| G-02 | UX-P0-2(A)、UX-P1-4、UX-P1-7、PSY-P0-1、PSY-P1-4、PSY-P2-8 | E-01、S-01、Q-01、Q-02 | 「控件不可达」拆成：发现性（E）、设置字段（S）、安静控制（Q）；避免重复做「静音入口」三遍 |
| G-03 | UX-P0-3、QA-P0-3（数据链行为回归） | V-01、V-02 | 存档/退出产品行为 + 行为测试合并；测试基础设施依赖 QA |
| G-04 | UX-P0-4、PSY-P2-10、UX-P2-8、GAME-P1-8（多屏/DPI 只读一次） | W-01～W-04 | 窗口召回/托盘/多屏 clamp 同属窗口生存性 |
| G-05 | UX-P1-1、UX-P1-5、PSY-P1-2、PSY-P2-2、PSY-P2-3、UX-P2-7 | H-01、H-02、H-04、A-02 | 内容中心尺寸/字号/技术文案；字号统一归 A-02，市场技术文案归 H-04 |
| G-06 | UX-P1-6、PSY-P1-3、PSY-P2-5、UX-P2-6、UX-P2-7 | E-01、A-03、P-05 | 无障碍：桌面气泡/宠物焦点（A-03）、插件面板（P-05）、目标尺寸（A-02） |
| G-07 | PSY-P1-1、PSY-P1-6、PSY-P1-9、PSY-P2-9、UX-P2-3、UX-P2-4 | A-01、A-02、D-01、D-02 | 同意可读性 + 文档真值 + 记忆回放文案 |
| G-08 | PSY-P0-2、PSY-P1-8、PSY-P1-9、PSY-P2-6、PSY-P2-12、UX-P1-8、UX-P1-9、UX-P2-7 | P-01～P-06 | 插件安全地板/低打扰/键盘/错误恢复合并；四按钮问题已解决不再立任务 |
| G-09 | PSY-P1-10、UX-P2-3、UX-P2-4、ARCH-P2-4、ARCH-P2-10 | D-01～D-03 | 跨端口径/命名/文档漂移合并为文档真值 Epic |
| G-10 | PSY-P2-11、PSY-P1-5、PSY-P2-7 | Q-03、D-05 | 研究伦理 debrief 与 2h/健康提醒分开 |
| G-11 | GAME-P1-4、UX-P1-1（「一键应用」体验部分） | H-03 | 角色切换 reload 归内容中心体验 |
| G-12 | UX-P1-9（插件错误文案）、UX-P1-10（Composer 失败恢复） | P-06、E-05 | 两个产品的「失败后没有下一步」分开实现、共享验收口径 |

## 4. P0 / P1 / P2 重新分级

### 4.1 分级口径（为什么不是照抄评审）

- **P0**：**内部演示/给非项目成员看之前必须关闭**；不修就会现场卡住、丢数据、或违反「研究原型+安全」的底线。共 7 项（约 4.5 人日）。
- **P1**：下一迭代（1–2 周）应完成；不修不阻断内部演示，但会让内容中心/设置/无障碍/健康承诺处于「半成品」。共 23 项（约 15–22 人日）。
- **P2**：打磨/一致性/需要外部条件（托盘 beta、市场启用、法务、命名拍板）；共 8 项（约 3–4 人日）。
- **不把发布级阻断混入本表**：DLC 信任根、NotSigned、CI 未运行、GUI 测试删真实存档、legal-strict 等 P0 属 task-67/70/71；UX 侧只保证「演示不丢数据、不骗用户、能退出/能找回」。

### 4.2 P0（7 项）

| ID | 任务 | 原条目 | 为何是 P0 | 依赖 |
|---|---|---|---|---|
| E-01 | 首用发现性 coach + 设置开关说明 | UX-P1-6、C-01 | 零按钮后，新用户找不到菜单 = 什么都做不了 | 无 |
| V-01 | 统一退出语义（全部路径 save→close + 失败确认） | UX-P0-3、R-05 | 三条退出中两条不保存；用户会丢 30s–整会话数据 | 无 |
| V-02 | 坏档恢复选择 + 删除清标志 + autosave 恢复 | UX-P0-3、QA-P0-3 | 提示指向「保存」但状态机未闭环；坏档用户会被困在只读 | QA 行为测试基础设施（可并行 fake IPC） |
| W-01 | 窗口 clamp（启动/拖动后/换屏/复位） | UX-P0-4、GAME-P1-8 | 拖出屏幕后无法召回（无托盘/无任务栏） | 无（纯函数 + Tauri API） |
| W-02 | 产品菜单「复位窗口」入口 | UX-P0-4、PSY-P2-10 | 复位只在设置里，而设置也可能点不到 | W-01 |
| P-01 | 插件危机关键词本地预检（不调 LLM + 固定资源） | PSY-P0-2 | 真实自由聊天，无危机地板；同一品牌最高风险面 | 无 |
| P-02 | 插件发送去向 + 首启告知 + AI/口径统一 | PSY-P0-2、PSY-P1-10、C-02 | 用户不知道聊天会发给模型供应商；口径自相矛盾 | DEC-01（口径）可先按裁定文案实现 |

### 4.3 P1（23 项）

| ID | 任务 | 原条目 | 依赖/备注 |
|---|---|---|---|
| E-02 | 菜单 IA 去重 + 危险项收口 + 整窗命中闭环 | UX-P0-1 剩余、UX-P1-2、UX-P2-1/5.1、UX-P1-4 | 与 task-64 在途改动 rebase |
| E-03 | 菜单状态真实化（Advisers ✓、固定槽位、角色标题） | UX-P2-2 | 无 |
| E-04 | 文本域/内容中心放行原生右键 | UX-P2-5 | 无 |
| E-05 | Composer 失败恢复/草稿/撤销「稍后」 | UX-P1-10 | 无 |
| S-01 | 设置字段补齐（PTT/改名/置顶/穿透状态/全屏说明） | UX-P1-7、PSY-P1-4、C-07 | 置顶需 Tauri 权限；全屏说明随 W-04 |
| S-02 | 工具页统一入口 + saveNow + fallback + 返回 | UX-P1-3 | 需 Windows 实机验证 `window.open` |
| H-01 | 内容中心 480×336 响应式/可读性 | UX-P1-1、PSY-P1-2、PSY-P2-3 | H-01 是底线（必须过）；H-02 是增强 |
| H-02 | 同窗临时放大（setSize 800×600 + 恢复） | UX-P1-1、C-03 | 需 Tauri 窗口 ACL 回归 |
| H-03 | 角色一键应用诚实文案 + 热切换（后置） | GAME-P1-4、C-09 | 热切换依赖渲染器生命周期工作 |
| V-03 | 保存状态可见（上次保存/失败） | UX-P0-3 剩余 | 无 |
| W-03 | 托盘 + 单实例（beta 门） | UX-P0-4、PSY-P2-10、UX-P2-8 | Windows 构建/ACL/图标；DEC-04 |
| Q-01 | quiet hours / 夜间默认安静 | PSY-P0-1 剩余、PSY-P1-7/P1-8 | 语义按 C-11 裁定 |
| Q-02 | TTS 播放时 AI 语音标识 + 首播提示 | PSY-P1-4 | 需与 TTS 声明联动 |
| Q-03 | 2h 持久计时 + 隐藏语义 + banner 可读/role/文案 | PSY-P1-5、PSY-P2-7 | 无 |
| Q-04 | 夜间/等待文案治理（留灯/等你/手别走 人形猫） | PSY-P1-7、PSY-P2-9 | 需内容/文案评审 |
| A-01 | 首屏「关键事实」层（TOS 前 5 条） | PSY-P1-1 | 法务确认；TOS 版本/hash 影响 |
| A-02 | 字号/对比/缩放基线（consent/About/hub/settings） | PSY-P1-2、PSY-P2-3、UX-P1-5 | 纯 CSS + 静态断言 |
| A-03 | #pet 可聚焦/#bubble live region/canvas 名称 | PSY-P1-3 | 键盘路径需实机确认 |
| A-04 | 危机资源卡（famling） | PSY-P1-5(5) | 复用 `safety/disclosure.ts` |
| P-03 | 插件「清除本机设置与同意」 | PSY-P2-6 | 只清插件 key |
| P-04 | 插件默认低打扰（ambient/reduce/目标尺寸） | PSY-P1-8、C-11 | 需 DSH 宿主 UI 验证 |
| P-05 | 插件面板焦点陷阱/tablist 键盘/焦点还原 | PSY-P2-5、UX-P2-7 | 需 DSH GUI 冒烟 |
| P-06 | 插件错误码映射 + 重试 + 保留输入 | UX-P1-9 | Host 错误码已有 |

### 4.4 P2（8 项）

| ID | 任务 | 原条目 | 触发条件/备注 |
|---|---|---|---|
| H-04 | 市场页文案分层 + 市场数据流隐私披露 | PSY-P2-2、NETWORK-P2-7、C-08 | 市场真正启用前必须完成 |
| W-04 | 全屏自动隐藏 + app/tray 图标定稿 | UX-P2-9、PSY-P2-10、D-04 | 随 W-03/托盘一起 |
| P-07 | 插件「退出（隐藏）」文案与恢复说明 | UX-P2-3 | 低风险文案 |
| D-01 | 单一 IA/信息架构真值文档（菜单/设置/hub/README） | UX-P2-4、ARCH-P2-4、C-12 | 0.5 人日；menu「5 vs 6」一并修 |
| D-02 | 插件 LEGAL-NOTICE/README 版本与能力同步 + 法务漂移 | PSY-P1-6、PSY-P1-9、R-20 | 与法务/发布文档一起 |
| D-03 | 用户可见命名/身份对照表（折角/Pagefold/Famling/DesktopGames） | UX-P2-3 | 产品名拍板后 |
| D-04 | 历史文档降级标注（HANDOFF/MASTER-STATUS/评审快照） | ARCH-P2-4 | 纯文档 |
| D-05 | 试玩/研究伦理 debrief（不把依恋当指标） | PSY-P2-11 | 试玩启动前 |

### 4.5 升级 / 降级 / 改判（与评审原级别的差异，必须记录）

| 原条目 | 原级别 | 新级别 | 理由 |
|---|---|---|---|
| UX-P0-4（托盘/召回） | P0 | **P0 拆为 W-01/W-02；托盘 W-03 降 P1** | 设计/D-15/W9 都把托盘放 Phase 2/P1 beta；但召回不能等，故拆开 |
| UX-P1-6（发现性） | P1 | **升 P0（E-01）** | 零按钮落地后，发现性从「体验优化」变成「能不能开始用」 |
| PSY-P0-3（年龄顺序/采集） | P0 | **改判为 DEC-02（不排任务）** | 与用户 2026-11-17.5 硬契约冲突；评审自己已标注需重新拍板；不擅自改 |
| PSY-P0-2（插件安全地板） | P0 | **保持 P0，但拆为 P-01/P-02；保留聊天本体** | 评审建议「降级聊天或补地板」；裁定优先补地板 + 诚实文案，去留由 owner |
| PSY-P1-8（插件低打扰） | P1 | **P1（P-04）** | 0.10.1/0.10.2 已解决「四按钮」；剩余默认输出/键盘/reduce |
| UX-P1-8（插件四按钮） | P1 | **关闭** | 0.10.1 零按钮 + 0.10.2 稳定；残留转 P-05 |
| UX-P1-2（点外关闭/穿透） | P1 | **部分关闭；剩余整窗命中并入 E-02（P1）** | blur 关闭已实现；整窗命中未实现 |
| UX-P1-4（菜单穿模态） | P1 | **关闭** | `menuBlocked` 已含内容中心/设置 |
| UX-P1-1（内容中心小窗） | P1 | **保持 P1（H-01/H-02）** | 尺寸问题仍在，但 v1 不新开窗（C-03） |
| PSY-P2-4（安静语义） | P2 | **关闭主项；残留 C-12 并入 D-01** | 两端 dialogue 数值已对齐 |
| ARCH-P0-1（共享内容语义） | P0 | **UX 视角降为 P2/D-01 + 依赖 task-68** | 角色 bundle/对话档已对齐；spec/LOCK/单源属架构域 |
| UX-P2-8（单实例） | P2 | **升 P1 并入 W-03** | 与托盘/窗口召回同属 beta 生存性；两实例写同一存档风险 |
| PSY-P1-6（法务漂移） | P1 | **降为 P2/D-02（文档治理）** | 不改运行时；但发布前必须清，触发条件明确 |
| UX-P0-1（根菜单 23 项） | P0 | **关闭主项；剩余转 E-02（P1）** | 根已 6 项；「更多」子菜单仍长/重复 |
| PSY-P1-1（TOS 可读性） | P1 | **保持 P1（A-01）** | 未动；但需法务确认关键事实层 |

## 5. Epic → Task 树（9 Epic / 38 Task）

> 约定：每个 Task 的「验收」都是可执行断言（单测/静态检查/实机清单三选一以上）；估算为人日 [估算]；顺序指第一批内的相对优先级。
> 写入范围提醒：E/H/V/W/S 任务会触碰 `src/pet/{desktop-shell,main,pet.css,content-hub}.ts`；`main.ts` 正在被其他任务并发修改，开工前先 rebase 并只改本任务需要的函数。

### Epic E — 入口、菜单与键盘（owner: 桌面壳/前端）

**目标**：零按钮方向下，新用户/键盘用户仍能发现并操作菜单；菜单不再重复、不再把危险/法律动作当普通项。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| E-01 | P0 | 首用一次性 coach：说明右键/Shift+F10/设置可显示 ⋯；只出现一次，可关闭，不阻断 | ① fresh storage 首启显示、关闭后 ack 持久化；② 第二次启动不显示；③ Esc/点击关闭不误触同意；④ `role=status`/aria-live polite；⑤ 与设置「显示菜单按钮」说明一致（fake-dom 测试 + 文案快照） | 无 | 0.25–0.5 | 低（可能与 task-64 布局改动冲突） | 1 |
| E-02 | P1 | 菜单 IA 去重：移除「更多」里的 缩放/文字行（设置已有）与重复「退出」；危险动作只保留一条「数据与同意…」；菜单/设置/内容中心打开时上报整窗命中，关闭 ≤1 帧恢复 | ① root 仍 6 项且不滚；② 「更多」≤10 项、2× 字号下不滚（`scrollHeight <= clientHeight` 或明确可滚但首屏含关键项）；③ 三处退出合并为一处；④ 撤回/删除只保留 About 数据区入口且二次确认不变；⑤ hit-region 在打开/关闭后 ≤1 帧更新（`__pet` QA 快照/日志） | task-64 rebase；W-01 | 0.5–1 | 中（并发改动/命中逻辑） | 2 |
| E-03 | P1 | 菜单状态真实化：Advisers 用 menuitemcheckbox + ✓；状态固定槽位不插删；标题读当前角色而非写死；缩放/文字 aria-checked 保持 | ① 菜单快照断言 Advisers `aria-checked` 反映开关；② 开关状态变化不改变项数与顺序；③ 标题随角色变化（cat/dog/human/origami 测试） | E-02 | 0.25 | 低 | 3 |
| E-04 | P1 | 文本域/内容中心放行原生右键：INPUT/TEXTAREA/contenteditable 与内容中心 root 内不 `preventDefault` | ① fake DOM 断言 textarea 上 contextmenu 不被拦截；② 宠物/空白区仍打开菜单；③ 内容中心打开时右键不弹宠物菜单 | 无 | 0.1 | 低 | 4 |
| E-05 | P1 | Composer 失败恢复：失败卡提供「重试/复制原文/关闭」；删掉语义重复的「稍后」；保留输入并支持草稿 | ① 失败→重试复用原文；② 复制写入剪贴板（fake）；③ Esc/关闭不丢草稿；④ 结果卡按钮快照 | 无 | 0.5 | 低 | 5 |

### Epic S — 设置与工具页（owner: 桌面壳）

**目标**：批准设置字段有真实落点或明确降级；工具页不再「点了没反应」。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| S-01 | P1 | 设置补齐：PTT/改名入口；置顶开关（补 Rust/权限）；点击穿透状态只读说明；全屏自动隐藏先置灰+说明；每字段标注生效范围 | ① 每个字段有 `id` 与 fake-dom 交互测试；② 置顶切换调用真实 API（manual）；③ 未实现项 disabled + 原因，不静默；④ 480×336 下设置卡 ≤2 滚动屏 | Tauri 权限/命令；W-04 | 1–1.5 | 中（Rust/ACL） | 1 |
| S-02 | P1 | 工具页统一入口：`saveNow()` → 尝试 `window.open` → 失败同窗导航（?from=pet）；页内「返回桌宠」按钮；失败有可见提示 | ① 失败路径 fake window 测试；② 进入前保存被调用；③ Windows 打包版点击两入口有结果（manual 记录）；④ 返回后状态恢复 | 无（实机） | 0.5–1 | 中（Tauri window.open 未验证） | 2 |

### Epic H — 内容中心 / 角色=主题（owner: 内容中心）

**目标**：内容中心在 480 窗口可读可操作；若允许同窗放大则放大可恢复；「一键应用」不误导。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| H-01 | P1 | 480×336 响应式：无横向裁切；一级 tab 全可见；正文 ≥12px、meta ≥10px；主操作首屏可见；body 滚动区可用 | ① CDP/静态断言 480×336 下 `scrollWidth <= clientWidth`；② computed font-size 矩阵（ui-scale 1/2）；③ 角色/自定义/内容包/市场四 tab 各有首屏主操作；④ 截图矩阵留档 | 无 | 0.5–1 | 低–中（布局回归） | 1 |
| H-02 | P1 | 同窗临时放大：打开 hub/settings 时保存窗口尺寸/位置并 `setSize(800×600)`（面板 max 760 + 安全边），关闭/Esc/失败恢复 480×336；浏览器 no-op | ① 窗口 API fake：open→setSize→close→restore；② 失败/异常也恢复；③ 实机：内容面板无横向裁切、打开/关闭无白闪/位置漂移；④ 不改变 `tauri.conf.json` 默认窗口 | Tauri ACL（已有窗口权限）；C-03 决策 | 1–2 | 中（窗口/焦点/命中） | 2 |
| H-03 | P1 | 角色一键应用：先做诚实文案「切换角色会重新载入界面」+ apply 前说明；热切换（无 reload）作为后续增量 | ① 文案快照；② 用户确认/取消路径；③ 若实现热切换：切换后对话/动画/存档不丢、失败回滚旧角色；④ 插件端即时生效作为对照 | 渲染器生命周期工作（GAME-P1-4） | 0.25（文案）/ 2–3（热切换） | 中（热切换高风险） | 3 |
| H-04 | P2 | 市场页文案分层：主视图一句状态 + 隐私数据流一句；7 步技术细节折叠；不删除透明性 | ① 默认折叠；② `details` 可键盘展开；③ 市场未配置时明确「不联网」；④ 隐私句覆盖 IP/时间/UA/已装包 id（启用前） | 市场启用（task-70/NETWORK） | 0.25 | 低 | 4 |

### Epic V — 存档、退出与恢复（owner: 存档/主流程）

**目标**：用户不会因为退出/坏档/删除而丢数据；每条失败都有可执行下一步。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| V-01 | P0 | 统一退出：根/更多/About 全部走同一 `exitAfterSave()`；保存失败弹「未保存，仍要退出？」（取消不关窗）；删除重复退出项 | ① grep 只有一个退出调用点；② fake IPC：保存成功→close、失败→confirm、取消→窗口仍在；③ About/更多 不再直接 `exitApplication`；④ 实机验证（manual） | 无 | 0.25 | 低 | 1 |
| V-02 | P0 | 坏档恢复：选择面板（保存为新档/从 .bak 恢复/删除并重来/退出）；`delete_save` 成功清 `saveRecoveryNeeded`；成功后 autosave 恢复；状态可指示 | ① fake IPC：corrupt→save→flag 清除；② delete→flag 清除；③ bak 恢复成功；④ 面板四选项均可键盘操作；⑤ 不谎报保存成功 | QA 行为测试基础设施（可并行） | 1–1.5 | 中（存档状态机） | 2 |
| V-03 | P1 | 保存状态可见：菜单/设置显示上次保存时间/失败；autosave 失败有气泡/可重试 | ① 状态节点 aria-live；② 失败后不静默；③ 快照测试 | V-01 | 0.25 | 低 | 3 |

### Epic W — 窗口召回与系统存在（owner: 桌面壳/Tauri）

**目标**：宠物不会被拖丢；提前准备 beta 的托盘/单实例。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| W-01 | P0 | 窗口 clamp：启动/拖动结束/换屏/复位后落回当前显示器工作区；纯函数 + Tauri 调用 | ① `clampWindowToWorkArea` 单测（多屏/负坐标/超界/NaN）；② 实机：拖到屏幕外松手自动回可见区；③ 启动越界恢复 | 无 | 0.5–0.75 | 低–中（窗口坐标） | 1 |
| W-02 | P0 | 复位入口：在「更多」菜单提供「复位窗口到右下角」，复用 `resetPetWindow()` | ① 菜单项存在且调用同一函数；② 键盘可达；③ 实机：拖丢后两次点击可找回 | W-01 | 0.25 | 低 | 1 |
| W-03 | P1 | 托盘 + 单实例（beta 门）：托盘打开/复位/设置/退出；第二次启动唤起已有实例；若不做托盘则 beta 去掉 skipTaskbar（二选一） | ① 托盘四项功能 manual；② 第二次启动不产生第二实例；③ 托盘退出走 save；④ 构建/ACL/安装器回归 | Windows 构建/签名（task-70）；DEC-04 | 1–2 + 构建 | 中（Tauri feature/图标/ACL） | 3 |
| W-04 | P2 | 全屏自动隐藏（pet 接 `watchFullscreen`）+ 设置开关；app/tray 图标定稿 | ① 全屏→hide、退出→show（manual）；② 设置开关生效；③ 图标在安装/托盘/任务管理器可辨 | W-03、D-04 | 0.5–1 | 中（实机） | 4 |

### Epic Q — 低打扰与健康（owner: 交互/心理学）

**目标**：兑现「安静、可预期、可关掉」；健康提醒真实生效且文案不误导。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| Q-01 | P1 | quiet hours：默认 22:00–08:00 抑制主动/环境输出（用户触发仍回应）；设置可调时段/关闭；状态可见 | ① fake clock 测试 21:59/22:00/08:00；② 夜间无 ambient 气泡/新话题；③ 用户点击仍有回应；④ 设置持久化 | 无 | 0.5 | 低 | 1 |
| Q-02 | P1 | TTS 播放 AI 语音标识：播放中可见「AI 语音 · 合成（不是真人）」；首次播放提示一次；不遮挡宠物 | ① 播放态 DOM 节点存在且 12px/对比 ≥4.5；② 首播提示只一次；③ 静音/字幕路径不回归 | TTS 状态回调 | 0.5 | 低 | 2 |
| Q-03 | P1 | 2h 健康：持久时间戳；以「无交互 >10–15 分钟」为中断而非页面隐藏；banner `role` 二选一、按钮文案「休息一下（2 小时后仍会提醒）」+「10 分钟后再提醒」；不可永久关闭 | ① fake timers 跨 visibility 测试；② 重启不清零；③ 按钮文案/role 快照；④ 10 分钟延迟后再次提醒 | 无 | 1–1.5 | 中（跨窗口/隐私只存时间戳） | 3 |
| Q-04 | P1 | 文案治理：深夜/回归去掉「留灯/一直停在这里」；人形/猫不用「手别走」；软性词进人工评审清单；记忆回放默认不自动弹 | ① 黑名单静态测试（等/留灯/别走/一直在等）；② 狗保留「再摸一下」；③ 记忆回放改为用户打开折页簿时显示；④ 文案评审记录 | 内容评审 | 0.5 | 低 | 4 |

### Epic A — 同意、危机与无障碍（owner: 同意/法务/前端）

**目标**：安全文本「读得到」、宠物「键盘到得了」、危机资源「找得到」。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| A-01 | P1 | 首屏关键事实层：完整 TOS 之前 5 条（AI 非真人/非陪伴；数据去向；危机资源；可撤回/删除；可随时关闭）12–14px；全文仍可滚动；勾选/按钮语义不变 | ① DOM 顺序断言关键事实在滚动区与勾选框之前；② 首屏无需滚动可见；③ 不预勾选；④ TOS 版本/hash 影响由法务确认 | 法务确认；A-02 | 1–2 | 中（同意流程变更） | 1 |
| A-02 | P1 | 字号/对比/缩放基线：统一 type token × `--ui-scale`；consent/About/hub/settings 正文 ≥12px、meta ≥10px；`.note` ≥4.5:1；危险/关键按钮 ≥24px | ① CSS 静态断言（无 <12px 正文）；② 对比计算脚本进本地门禁（后续接 CI）；③ 200%/480×336 截图矩阵；④ hub 卡片 meta ≥10px | 无 | 1–1.5 | 中（视觉回归） | 2 |
| A-03 | P1 | 宠物/气泡/画布无障碍：#pet `tabindex=0 role=button aria-label`；Enter/Space=摸；#bubble `role=status` + polite（只播用户触发）；canvas `aria-label`；焦点样式；键盘路径 | ① fake DOM 断言属性；② 键盘 e2e：Tab→Enter 触发 pat；③ Shift+F10 菜单；④ 真机确认窗口焦点路径（Alt+Tab/点击） | 无（实机） | 0.5–1 | 中（焦点/窗口） | 3 |
| A-04 | P1 | 危机资源卡（famling）：自伤/危机时显示独立可复制资源卡（12356/110/120/可信任的人），同时暂停 TTS/角色化输出；About 常驻资源保持可读 | ① 触发路径单测（不调模型/不角色化）；② 卡片可复制、可 Esc 关闭；③ TTS 在触发时停止；④ About 文案一致 | safety/disclosure 现有能力 | 0.5 | 低 | 4 |

### Epic P — 插件 dsh-famling（owner: 插件）

**目标**：保留功能的前提下补齐安全地板、诚实告知、键盘/低打扰与错误恢复。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| P-01 | P0 | 危机关键词本地预检：命中时不调用 `ctx.llm.stream`，返回固定资源文案（12356/110/120 + 可信任的人/专业机构），只记录最小审计（不存原文） | ① 单测：命中不调 LLM、返回资源；② 未命中正常走 chat；③ 审计不含原文；④ 误报词表评审 | 无 | 0.5 | 低–中（词表覆盖/误报） | 1 |
| P-02 | P0 | 发送去向 + 首启告知 + 口径统一：输入面板/设置加「聊天文本会发送给你在 DSH 配置的模型供应商；不要输入密码/他人隐私」；一次性首启卡（可关、非阻断）；把「不提供自由 LLM 角色扮演/情感陪伴」改为事实描述 | ① 字符串/文案测试；② 首启卡只出现一次；③ 不阻断聊天；④ 与 README/LEGAL-NOTICE 同一句式；⑤ 中文 + 英文 | DEC-01（口径） | 0.5 | 低 | 2 |
| P-03 | P1 | 设置加「清除本机设置与同意」：只清 `dsh-famling/*` 插件键，说明不清 DSH 宿主数据 | ① 点击后回读为空；② 不影响 DSH 会话；③ 二次确认 | P-02 | 0.25 | 低 | 3 |
| P-04 | P1 | 低打扰默认：读取 `prefers-reduced-motion`；环境气泡默认关或仅交互后出现；微动作间隔 ≥60s；目标尺寸 ≥24；可选 quiet hours | ① matchMedia fake 测试（reduce→motion off）；② 默认设置快照；③ 60s 间隔测试；④ DSH GUI 冒烟 | DSH 宿主 UI 验证 | 0.5–1 | 中（宿主行为） | 4 |
| P-05 | P1 | 面板键盘/焦点：role=dialog 面板 Tab 陷阱 + Esc + 焦点还原 + `aria-controls`；内容中心 tablist 方向键/roving | ① 键盘冒烟：打开→Tab 循环→Esc→焦点回按钮；② tablist Home/End/箭头；③ 静态断言 aria 属性 | P-04 同批 | 0.5 | 低 | 5 |
| P-06 | P1 | 错误恢复：把 `E_LLM/E_TASK/E_MEMORY/E_INPUT` 映射为可执行文案；失败保留输入并可重试；修正「内容中心失败但角色/外观仍可改」误导（设置与内容中心共用 chunk） | ① 单测映射表；② 失败后输入不丢/可重试；③ 文案与实际能力一致 | 无 | 0.5 | 低 | 6 |
| P-07 | P2 | 「退出（隐藏，刷新恢复）」语义：改名为「隐藏」并说明恢复方式（刷新/重载）；或提供显式恢复提示 | ① 文案快照；② README 同步 | 无 | 0.1 | 低 | 7 |

### Epic D — 文档真值与研究伦理（owner: 文档/产品）

**目标**：用户/审计/后续 agent 看到的「当前能力」与代码一致；研究伦理不被当成增长工具。

| ID | 级别 | 目标 | 验收（可测） | 依赖 | 估算 | 风险 | 顺序 |
|---|---|---|---|---|---|---|---|
| D-01 | P2 | 单一 IA 真值文档（菜单树/设置字段/hub tabs/README 首段）+ 修「5 vs 6」与「六类 vs 四 tab」+ 共享兼容表登记 origami 例外 | ① README 首段与当前 hub 一致；② 菜单项数在代码/测试/文档一致；③ 文档链接到本任务表；④ grep 无「六类」「root ≤5」残留 | 无 | 0.5 | 低 | 1 |
| D-02 | P2 | 插件 LEGAL-NOTICE/README 版本与能力同步（0.10.2、聊天/内容中心/设置/菜单、同意键、无 roleplay 公开入口）；famling README 发布阻断段与实现同步 | ① 版本头一致；② 能力清单与代码逐项核对；③ 与 RELEASE-BLOCKERS/PRIVACY 同步 | 法务/发布 | 0.5–1 | 低 | 2 |
| D-03 | P2 | 命名/身份对照表：产品名（待定）/应用名/包名/角色名（折角/汀岚/Famling/DesktopGames）；改名涉及安装器/签名时单独立项 | ① 一张表覆盖用户可见面；② README/About/安装器一致；③ 未定项标 TBD 不用别名冒充 | 产品名拍板 | 0.5 | 低 | 3 |
| D-04 | P2 | 历史文档降级标注：HANDOFF-2026-11-15、MASTER-STATUS、七份评审快照、旧审计统一标「历史，不可作现值」 | ① 每个入口文档有状态头；② 指向当前真值；③ grep 检查 | 无 | 0.25 | 低 | 4 |
| D-05 | P2 | 研究伦理 debrief：试玩协议加「这是研究、可退出、数据删除、不因测试产生义务感」；不把「想念/依恋」当成功指标；脆弱人群排除/伦理审查 | ① debrief 文本进 playtest kit；② 指标表删除依恋类；③ 试玩前检查清单 | 试玩启动 | 0.25 | 低 | 5 |

## 6. 明确不做的项（N-01～N-14）

| ID | 不做的事 | 来源 | 理由 / 替代 |
|---|---|---|---|
| N-01 | 不恢复常驻 ⋯ 按钮默认（不推翻零按钮） | task-65 方向 vs UX-P1-6 | 用 E-01 coach + 设置开关代替；默认仍零按钮（DEC-03 可复核） |
| N-02 | v1 不新开独立设置窗/内容窗/第二窗口 | UX-P1-1/P0-4 vs D-15/V1 非目标 | 用 H-02 同窗临时放大；独立窗口不进 v1，是否在 v1.1 立项由 DEC-03 拍板 |
| N-03 | 不做原生右键菜单/全局热键/输入法式皮肤 | UX §8 明确不建议 | 保留 HTML 覆盖层与现有键盘模型；热键归 v2 |
| N-04 | 不把托盘作为 P0；不在无托盘时同时保留 skipTaskbar 且允许拖出屏幕 | UX-P0-4 vs 设计/D-15 | W-03 托盘 P1 beta；W-01/W-02 召回 P0；beta 时二选一（DEC-04） |
| N-05 | 不重开 roleplay 公开入口、不宣传 roleplay、不改年龄→TOS 用户硬契约 | PSY-P0-3 vs 用户决定/D-07 | 顺序与入口状态由 DEC-02 拍板；本文不擅自改代码语义 |
| N-06 | 不把 famling 完整 consent 子系统移植到插件 | PSY 建议 / PSY §8 自己反对 | 插件用轻量安全地板（P-01/P-02）；不复制 TOS/年龄门 |
| N-07 | 不做依赖自检/依恋画像/排行榜/签到/连续天数/好感衰减/付费亲密 | PSY 原则 10、D-13 | 与研究原型定位冲突；health.dependency 待产品+律师（DEC-06） |
| N-08 | 不恢复常驻 AI 角标；不把「每条回复 AI 标签」做成视觉噪音；不给插件补 high-contrast 主题 | PSY-P1-4/P2-12、C-12 | 用户已决定不常驻角标；用 Q-02 播放标识 + About 说明；origami 例外登记到 D-01 |
| N-09 | 不做「暂时隐藏 1 小时」直到托盘/召回存在 | PSY-P0-1(3) | 无托盘时隐藏可能不可恢复（C-04） |
| N-10 | 不把三个游戏 demo 纳入 v1 UX 范围/不为它们做 2h、托盘、市场 | C-00、GAME-P0-3 | 游戏 demo 不属于 v1 产品面；待 owner 选 B 形态再立 |
| N-11 | 不做 UI 91 全量接线/不重做像素 UI 资产 | D-04、UX §8 | 仅接菜单 9 图标与必要 badge；托盘/ICO 随 W-03/W-04 |
| N-12 | 不把市场密码学细节搬进主 UI；但也不删除必要隐私披露 | PSY-P2-2 vs NETWORK-P2-7 | H-04 分层：一句状态 + 折叠技术细节 + 数据流一句 |
| N-13 | 不在本轮改代码/资产/配置；不改 TOS 字义；不改用户已拍板的产品/法务口径 | 任务边界 | 全部 P0/P1 待 lead 派工后执行 |
| N-14 | 不把「用户自行接入第三方模型/修改版」当作官方能力或支持对象 | README/D-18、PSY-P1-10 | 文案继续如实：官方不提供/不鼓励/无法强制阻止；插件聊天只经 DSH 配置 |

## 7. 依赖关系与建议顺序

### 7.1 跨域依赖（不在本文立任务，但排期必须知道）

| 依赖 | 影响的本任务 | 说明 |
|---|---|---|
| QA-P0-1 GUI/E2E 数据隔离（task-71） | V-02、H-02、W-03、托盘/窗口实机验收 | 在 `DG_QA_DATA_DIR`/临时 profile 落地前，GUI 验收不要碰真实 `%APPDATA%`/DSH profile（评审已记录事故） |
| QA-P0-3 数据链行为回归 + main.ts 可注入（task-71/68） | V-01/V-02 | 最好先把 save/load 抽成可注入 IO 的模块，否则 fake IPC 测试仍需 AST 切片/源码断言 |
| 发布信任/CI/签名（task-70） | W-03/W-04、H-04、任何对外演示 | 无 remote/CI/签名时，「演示」只能内部；托盘/安装器回归依赖 Windows 构建链 |
| 内容契约单一权威源（task-68 / ARCH-P0-1） | D-01、H-03、C-12 | `rolePresets`/dialogue 已对齐，但 spec/LOCK/conformance 未建；UX 文档真值应引用 spec 而非手写 |
| 渲染器热切换（GAME-P1-4，task-68） | H-03 热切换 | 无热切换时 v1 用「诚实文案 + reload」；不要把 hot swap 写进 v1 承诺 |
| 法务/TOS 版本（task-70/legal） | A-01、A-02、D-02、P-02 | 关键事实层会触发 TOS 版本/hash 与重同意；插件聊天口径需与法务一致 |
| 网络市场启用（task-70） | H-04、隐私披露 | 市场默认未配置，H-04 在启用前完成即可；不要让 UI 先于披露上线 |
| task-64（famling 极简按钮/菜单/设置，in_progress） | E-02/E-03、S-01、H-02 | 本文快照后这些文件可能继续被 task-64 修改；开工前 rebase，避免重复/冲突 |

### 7.2 四波次（建议）

| 波次 | 内容 | 出口标准 | 预估 |
|---|---|---|---|
| **Wave 0（P0）** | V-01、V-02、E-01、P-01、P-02、W-01、W-02 | 内部演示：不丢数据、能找到菜单、插件有安全地板、窗口拖不丢 | 4–5 人日 |
| **Wave 1（P1 核心 UX）** | E-02/E-03/E-04/E-05、S-02、H-01、H-02、A-01/A-02/A-03/A-04、Q-01/Q-02/Q-04 | 新结构收口；内容中心/设置可读；同意/无障碍基线；安静控制面 | 8–10 人日 |
| **Wave 2（P1 健康/插件）** | Q-03、S-01、V-03、P-03～P-06 | 2h 真实生效；插件键盘/错误/低打扰；设置字段补齐 | 4–5 人日 |
| **Wave 3（P2 / beta 门）** | W-03、W-04、H-03 热切换、H-04、D-01～D-05 | beta 前窗口/托盘/文档/市场披露收口 | 2–4 人日 + 外部 |

### 7.3 第一批（建议立刻派工，4 个 bundle）

1. **bundle SAVE**：V-01 + V-02（+ 尽早在 QA 的临时数据目录下写 fake IPC 测试）。理由：唯一会真实丢用户数据的问题；且 V-01 只需 0.25 人日，今天可做。
2. **bundle DISCOVERY**：E-01 + A-03 的最小部分（#pet tabindex/Enter）。理由：零按钮后新用户/键盘用户的第一步；E-01 是纯前端 + fake-dom 测试。
3. **bundle PLUGIN-SAFETY**：P-01 + P-02（P-03 可顺带）。理由：唯一涉及真实 LLM 自由聊天的伦理风险面；独立于桌面壳，可并行。
4. **bundle WINDOW-RECALL**：W-01 + W-02。理由：用户可把宠物拖丢且无托盘；纯函数 + 一个菜单项，风险低。

## 8. 待用户/lead 拍板的决策（DEC）

| ID | 决策 | 选项/建议 | 影响 |
|---|---|---|---|
| DEC-01 | 插件自由 LLM 人格聊天的去留与口径 | 建议保留「工作助手型 AI 回复」并补安全地板；若 owner 选降级，则改入口/文案/system prompt | P-01/P-02、README/LEGAL-NOTICE、品牌口径 |
| DEC-02 | 年龄核验：是否移到 roleplay 入口/是否只存「是否成年+时间」；roleplay 是否公开 | 建议 v1 维持 age→TOS 用户硬契约，仅做数据最小化与文案解释；roleplay 保持不公开 | A-01/consent、D-02、法务 |
| DEC-03 | 内容中心/设置是否允许「同窗临时放大」；是否永久不开第二窗 | 建议 v1 同窗放大（H-02），第二窗不进入 v1 | H-02、C-03、窗口 ACL |
| DEC-04 | beta 时托盘 vs 去 skipTaskbar 二选一 | 建议优先托盘（W-03）；若来不及，beta 去掉 skipTaskbar | W-03、任务栏行为、安装器 |
| DEC-05 | quiet hours 默认值/是否默认开启 | 建议 22:00–08:00 默认开启，可关 | Q-01、插件 P-04 |
| DEC-06 | 是否上线依赖自检/依恋 debrief 指标 | 建议不做自检；D-05 只做试玩 debrief，不把依恋当指标 | N-07、D-05 |

## 附录 A：关键证据索引（当前代码快照，2026-11-19）

| 主题 | 证据 |
|---|---|
| 根菜单 6 项/常量/测试 | `src/pet/desktop-shell.ts` `SHELL_MENU_ROOT_ACTIONS`；`tests/desktop-shell-menu.test.ts`（169 行断言 6 项；文件头注释仍写 ≤5） |
| 零按钮/触发器 24px | `desktop-shell.ts` `resolveShowMenuButton` 默认 false；`pet.css` `.pet-menu-button` 24×24 |
| 菜单隐藏默认 + 设置开关 | `desktop-shell.ts` `buildSettingsModal()` 的「显示菜单按钮」；`SHOW_MENU_BUTTON_KEY` |
| 退出三路径 | 根 `add('退出', ... onExit)`；更多 `add('退出', () => winRef.close())`；`main.ts` `about-exit → exitApplication()` |
| 根退出保存 | `main.ts` `exitAfterSave()`（失败仍 `exitApplication()` in finally） |
| 坏档标志/删除 | `main.ts` `saveRecoveryNeeded`、`save-delete` 监听；无恢复选择面板 |
| 设置字段 | `desktop-shell.ts` `buildSettingsModal()`（常用/外观/隐私-Advisers/关于/调试） |
| 内容中心尺寸/字号 | `pet.css` `.content-hub-panel`（min(760px,100%)、92vh）、`.content-hub-body`（54vh）、`content-hub-card-meta` 8px |
| 内容中心 tabs/role theme | `content-hub.ts` `CONTENT_HUB_TOP_TABS`（角色/自定义/内容包/市场） |
| 市场 7 步技术细节 | `content-hub.ts` `CONTENT_MARKET_CONTRACT_STEPS` 与 market steps 渲染 |
| 角色切换 reload | `main.ts` `applyRoleThemeFromHub()` → `applyRendererChoice({reload: () => location.reload()})` |
| 同意字号/滚动 | `pet.css` `.consent-tos`（max-height 36vh、p/li 11px）；`modal.ts` age/TOS 弹窗 |
| About .note 7px/低对比 | `pet.css` `.note`（#6a5a48 on #1b1410 = 2.75:1，纯 CSS 常量计算） |
| #pet/#bubble/canvas 语义 | `pet.html`；无 tabindex/role/live region/aria-label |
| reduce-motion | `desktop-shell.ts` `resolveReduceMotion/applyReduceMotion`；`main.ts` `heroFrame` reduced 分支；`pet.css` media block |
| 2h 提醒 | `runtime.ts` `startHealthReminder`（仅 main.ts 调用；hidden 时 return；无持久化）；`modal.ts` `showHealthBanner`（role=alert + aria-live=polite；按钮「休息并关闭提醒」） |
| 危机资源 | `src/pet/safety/disclosure.ts` `CRISIS_RESOURCES/buildCrisisMessage`；About 有 12356/110/120 文本 |
| 插件真实聊天 | `plugins/dsh-famling/index.js` `chatWithDsh`（`ctx.llm.stream`）；`client.js` `sendInput()` |
| 插件零按钮/菜单 | 插件 README 0.10.1；`client.js` `menuItems()`（6 项：chat/actions/content/settings/more/quit）；`loadMenuState` 默认 button=false |
| 插件无危机/首启/清除 | `grep 12356` 插件 0 命中；无 first-run/clear/reset 设置；LEGAL-NOTICE 头仍写 0.8.5 |
| 插件面板键盘 | `client.js` 菜单有 roving/Shift+F10；`client.content.js` tablist 无方向键；普通面板无 Tab 陷阱 |
| 跨产品 role/dialogue | `public/content/library.json` rolePresets 与 dialoguePacks；插件 `client.js` `ROLE_BUNDLES`/`DIALOGUE_MODES`（已对齐） |
| 定位/文档漂移 | `README.md:3`（六类）、`README.md:46`（小游戏底座）、`README.md` 发布阻断段（旧）；设计 `DESKTOP-PET-UX-2026-11-16.md` §3.4/§3.5/§6；`DECISIONS-RECOMMENDED` D-15；`V1-DECISIONS` §4.1 |

## 附录 B：复核命令（只读）

```sh
cd /mnt/d/Projects/dsh/desktop-games
git rev-parse --short HEAD && git status --short
grep -n 'SHELL_MENU_ROOT_ACTIONS' -A 3 src/pet/desktop-shell.ts
grep -n 'resolveShowMenuButton\|SHOW_MENU_BUTTON_KEY' -A 6 src/pet/desktop-shell.ts
grep -n '退出\|exitAfterSave\|exitApplication' src/pet/desktop-shell.ts src/pet/main.ts | head -40
grep -n 'saveRecoveryNeeded\|save-delete' src/pet/main.ts | head -20
grep -n 'consent-tos\|\.note {' -A 6 src/pet/pet.css
grep -n 'content-hub-panel\|content-hub-body\|content-hub-card-meta' -A 6 src/pet/pet.css
grep -n 'startHealthReminder\|visibilityState' src/pet/consent/runtime.ts
grep -n 'role="alert"\|aria-live' src/pet/consent/modal.ts | head -10
grep -n '12356' src/pet/safety/disclosure.ts
grep -rn 'ctx.llm.stream' /mnt/d/Projects/dsh/plugins/dsh-famling/index.js
grep -n 'aiNotice\|不提供自由' /mnt/d/Projects/dsh/plugins/dsh-famling/client.js
grep -n '0.8.5' /mnt/d/Projects/dsh/plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md
```

## 附录 C：与其它 triage 的分工（含并发产物的对齐）

> 写作期间 task-67 已产出 `docs/plan/REVIEW-TRIAGE-P0-2026-11-19.md`（19→14→6 的 P0 三角）。本文与其不冲突，但**命名空间与个别级别不同**，合并时按本表对齐：

| task-67 的条目/命名 | 本文落点 | 对齐说明 |
|---|---|---|
| M1 产品形态 vs 市场/DLC（路线级） | C-00、§6 N-10、DEC-01 | 同一矛盾；本文只给 UX/心理侧裁定与任务边界，不重复 REL/GATE 三角 |
| M13 跨产品能力与法律口径 | C-02、P-01/P-02、D-02 | 同一矛盾；本文把「插件安全地板」拆成可验收的 3 个任务（P-01/P-02/P-03） |
| E7 QUIET 安静控制面 | Q-01/Q-02、S-01 | task-67 已把「静音/音量/动效」主风险视为设置弹窗消除；本文同意，残项为 quiet hours/AI 语音标识/设置字段，全 P1 |
| E7 WR 窗口召回 | W-01/W-02（P0）、W-03（P1） | **级别差**：task-67 将窗口召回/托盘归 P2；本文认为「skipTaskbar + 无托盘 + 可拖出屏幕」在演示中会让用户彻底找不回窗口，故 clamp + 产品菜单复位入口为 P0、托盘为 P1。建议 lead 采用本文拆分（理由在 C-04） |
| E6 CS 内容语义 | C-12、D-01、H-03 | 角色 bundle/对话档已对齐；origami 例外与 IA 真值归 D-01，spec/LOCK 归 task-68 |
| E4 PLUG-TRUST 插件自证 | D-02（文档）、P-02（口径） | 插件构建/CI 自证属该任务；本文不重复 |
| E1 SAFE 数据安全 | V-01/V-02 | 同一组残项；本文提供 UX 验收与恢复面板交互规格 |

- **task-68（架构/重构任务化）**：D-01/内容契约/`main.ts` 拆分/hot swap 的工程实现归该任务；本文只给 UX 验收口径（H-03/V-02 依赖）。
- **task-70（安全/发布/市场任务化）**：危机话术的合规审查、市场隐私披露、托盘签名/构建归该任务；本文只给交互落点。
- **task-71（QA/性能/资产与内容管线）**：V-02 的行为测试基础设施、GUI 数据隔离、性能/资产预算归该任务；本文给验收断言，不重复测试工程。
- **ID 命名空间**：本文任务用 `E/S/H/V/W/Q/A/P/D-xx`（Epic 字母 + 序号）；task-67 用 `E0-Tx/E7-Tx`。合并 Epic 树时请保留本文 ID 作为 UX/心理任务叶子，避免与 `E0/E1...` 顶层编号混用。

—— 本文结束。所有「已解决」均基于当前工作树静态证据；所有「运行时行为」需按 §7 验收实机复核。

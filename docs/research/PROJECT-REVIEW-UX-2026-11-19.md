# Famling / dsh-famling 使用者 / UX 视角全项目评审（2026-11-19）

> 评审类型：**只读独立评审**。唯一写入 = 本文件；未改代码/资产/配置，未 commit/push，未调用外部 API，未打印或写入任何凭据。
> 评审人视角：**使用者 / UX**（右键菜单 IA、分级、常用/高级、按钮最小化、发现性、键盘、错误恢复），并横向覆盖 famling 独立应用与 dsh-famling 插件两个产品面。
> 结论口径：**只基于当前工作区可读证据**。本轮未在 Windows 实机运行 Tauri/WebView2，未做人工可用性测试；浏览器/窗口行为若为静态推断会标注【静态推断】。

## 0. 执行摘要

**一句话结论：** 这个项目的“克制”目前主要靠**把按钮藏起来**实现，而不是靠**动作分层与默认值**实现——结果是一个在 480×336 窗口里必须滚动的 20+ 项右键菜单、被藏进开发面板的必需控件、8–11px 字号的内容中心，以及没有托盘/没有复位入口的置顶小窗。技术完成度不低，但用户可见面的“找到、看懂、救回来”三件事都没有闭合。

五条核心判断：

1. **P0 — 右键菜单不是“克制菜单”，是“把设置页拍平塞进菜单”。** 动画角色下根菜单有 23 个可聚焦项（折纸/默认角色 21 项；Advisers 启用时再 +1~2），而菜单可用高度只有 328 CSS px、宽度 230px、默认 18px 字号；按样式下限粗算内容高度 ≥600px，**必然滚动 2 屏左右**。高频动作（摸摸/交办）、设置（缩放/字号）、低频工具（导入/模型）、法律动作（撤回/删除/TTS）、开发入口、退出全部混在一个平面里，没有“常用 → 更多 → 设置窗口”的分级。证据：`src/pet/desktop-shell.ts:607-713`、`src/pet/pet.css:438-486`、`app/tauri/src-tauri/tauri.conf.json:15-26`。
2. **P0 — 产品壳把必需控件藏没了，只留一个发布版里的“开发面板”单向门。** 桌面壳用 CSS 隐藏了 `header` 和 `aside.panel`（`src/pet/pet.css:351-352`），而静音、音量、按住说话（ASR/PTT）、改名、清语音缓存、复位窗口、手动保存仍在 `aside.panel` 里（`pet.html:63-90`）；右键菜单没有这些入口，却保留「完整面板（开发/E2E）」——点一下 `?shell=window`，页面进入不再创建菜单的开发壳，**没有产品内返回路径**（`desktop-shell.ts:712`、`desktop-shell.ts:447-455`）。
3. **P0 — 存档损坏/退出路径是死路。** 损坏存档时应用提示“先点保存写入新档”（`main.ts:2176-2179`），但产品壳没有保存按钮（`pet.html:73` 被 `pet.css:352` 隐藏），且 `saveRecoveryNeeded` 为真时 30s 自动保存被暂停（`main.ts:1734`、`main.ts:2140-2144`）；从菜单删除存档也不会清掉该标志（`main.ts:2041-2062`）。同时菜单「退出」只是 `winRef.close()`（`desktop-shell.ts:713`），**不是**已批准设计里的 `saveNow() → close()`（`docs/DESKTOP-PET-UX-2026-11-16.md:98,206`）。
4. **P0 — 置顶、无边框、skipTaskbar、可拖动的窗口没有托盘/复位入口，用户可以把宠物拖出屏幕再也找不回来。** 窗口 flags 见 `tauri.conf.json:20-26`；Rust 无 `TrayIcon`（`app/tauri/src-tauri/Cargo.toml` 的 tauri features 为空，源码 grep 无 TrayIcon）；产品右键菜单没有“复位窗口”，只有隐藏的开发按钮 `#reset-window`（`pet.html:76`、`main.ts:2122-2138`）；启动时的位置回收只在下次启动执行（`main.ts:2317-2340`）。项目自己的输入技术研究已写明：`skipTaskbar` 隐藏任务栏后必须保留托盘/热键/右键菜单召回（`docs/research/INPUT-TECH-FEASIBILITY-2026-11-17.md:36,41-48`）。
5. **P1 — “内容中心”是当前最新、最重要的用户面，却被塞进 480×336 不可缩放小窗。** 面板 CSS 最大 760px 宽，但实际窗口只有 480px；内容滚动区上限 54vh ≈ 181px（`pet.css:1000-1015,1057-1066`），而它有 4 个一级 tab、角色卡、内容包导入、逐字声明确认、市场说明；正文/说明字号固定 8–11px，且**不受菜单 A−/A+ 控制**（`pet.css:1017-1268` 固定 px；对照 `pet.css:394,485,500,584-663` 才使用 `--ui-scale`）。这不是“克制”，是把大窗口应用硬塞进小窗。

**最值得先做的 3 件**（详见 §9）：

1. **菜单分层 + 必需控件归位 + 下架发布版开发入口**：根菜单收敛到 ≤9 项，设置/更多进二级 sheet，静音/音量/PTT/改名/复位/保存进产品入口；保留现有 ARIA/键盘/consent 逻辑。约 1–2 人日，低风险，直接消 P0-1/P0-2 大半。
2. **存档/退出/菜单关闭行为闭环**：损坏存档给出可达的“保存新档 / 删除并重来”选择；退出 `saveNow() → close()` 并带失败确认；菜单在窗口失焦/点到窗外时关闭；菜单打开时按设计上报整窗命中。约 0.5–1.5 人日，低风险，消 P0-3/P1-2。
3. **独立“设置与内容”窗口 + 托盘图标**：桌宠窗继续透明 480×336；设置/内容中心/工具页进入可缩放的普通窗口（如 760×560，有标题栏/任务栏）；托盘提供“打开桌宠 / 复位窗口 / 设置 / 退出”。约 2–4 人日 + Windows 构建/ACL 回归，中风险，但一次解开 P0-4、P1-1、P1-7 与工具页陷阱。若时间只够一周，先做 1+2，3 作为结构性收口。

## 1. 评审方法与快照（可复核）

| 项 | 值 |
|---|---|
| 工作区 | `/mnt/d/Projects/dsh/desktop-games`（famling 应用）与 `/mnt/d/Projects/dsh/plugins/dsh-famling`（DSH 插件） |
| HEAD | `779354b`（2026-11-19 10:57 +0800，docs: content catalog mapping） |
| 快照时间 | 2026-11-19T12:59:44+0800 |
| 工作树 | **脏**：19 个变更/未跟踪项；`desktop-shell.ts`、`main.ts`、`content-hub.ts`、`content-library.ts`、`pet.css` 正被并发内容中心 v2 工作修改（评审期间菜单文案刚从「内容中心（角色/声音/主题/对话）…」改为「角色与内容中心…」） |
| 关键文件 md5 | `desktop-shell.ts d45e6037…`、`main.ts 98fb301f…`、`content-hub.ts dbd15c75…`、`pet.css 1bd8d9e7…`、`hit-regions.ts 003c4987…`、插件 `client.js 817e607b…`、`index.js 52b266b6…` |
| 验证边界 | 未在 Windows 实机跑 Tauri/WebView2；未跑 `npm test` / `typecheck` / `build`（只读评审，避免与并发工作互相干扰）；文中高度/行数为**静态推导或代码下限**，不是实机测量 |
| 并发编辑提醒 | 写作过程中 `src/pet/main.ts` 再次被并发修改（md5 `98fb301f…` → `359f2dd2…`，git dirty 项 19 → 21），因此**与 `main.ts` 有关的行号会漂移**；引用时请以函数名/提示文案复核（例如 `main.ts` 的存档恢复提示在写作后已从 `:2176-2179` 移到 `:2181-2184` 附近）。其余文件在写作窗口内未变。 |

已读（按任务要求）：`README.md`、`docs/HANDOFF-2026-11-15.md`（历史交接，已落后于 11-18/19）、`docs/design/CONTENT-MARKET-2026-11-19.md`、审计 `docs/audit/{UI-DEFAULTS-GAP,UI-SHELL-FIX,AUDIT-CODE-RUNTIME,AUDIT-ADVISERS-PRODUCT,NONART-PRODUCT}-*.md`、`docs/MASTER-STATUS-2026-11-16.md`、`docs/verification/UI-WINDOW-2026-11-18.md`、`docs/DESKTOP-PET-UX-2026-11-16.md`、`docs/design/PET-INPUT-OUTPUT-DESIGN-2026-11-17.md`、`docs/research/INPUT-MODALITY-2026-11-17.md`、`docs/research/INPUT-TECH-FEASIBILITY-2026-11-17.md`；源码 `src/pet/{main,desktop-shell,content-hub,content-library,hit-regions,hero,hero-runtime,hero-actions,shell-layout}.ts`、`pet.html`、`pet.css`、`app/tauri/src-tauri/{tauri.conf.json,src/main.rs,capabilities/*.json}`、`.github/workflows/ci.yml`；插件 `client.js`、`index.js`、`client.content.js`、`README.md`、`docs/DETAIL.md`（按需）。

> 说明：`HANDOFF-2026-11-15`、`MASTER-STATUS-2026-11-16`、`UI-DEFAULTS-GAP-AUDIT-2026-11-17` 的若干数字已过时（例如“UI 91 张 0 入库”已被 `public/assets/ui/` 的菜单图标推翻；`window.open` 仍待实机复核）。本文以**当前代码**为主证据，文档只作设计意图/历史审计引用。

## 2. 现状 UX 地图（两产品）

### 2.1 famling 独立应用（pet-only Tauri）

```
首启：年龄自报（modal） → 完整 TOS（modal，长） → 桌宠窗
桌宠窗：480×336 透明 · 无边框 · 置顶 · 不抢焦点启动 · skipTaskbar · 不可缩放
  默认角色 = 折纸 DOM（#pet，104×90）          可选动画 hero（content-library 里启用）
  可见控件 = 宠物 + 气泡 + 22×22 的「⋯」按钮（opacity .55）
  交互 = 左键摸/拖窗口；右键 / Shift+F10 / ⋯ → HTML 覆盖层菜单（WAI-ARIA）
  二级面 = 内容中心（body 级全屏 dialog，仍在 480×336 窗内）
          折页簿 / Advisers 简报 / About 声明（都是窗内 screen 或 panel）
  工具页 = setup.html / chat-import.html（window.open；失败则同窗 location）
```

要点：**产品只有一个常驻入口（⋯/右键）**，这是对的；但菜单承担了“全部设置 + 法律 + 数据 + 开发”的总入口，超出了它该承担的层级。

### 2.2 dsh-famling（DSH 侧栏 footer 插件）

```
sidebar.footer.action（账号信息下方）
  72px 像素宠物（点击头/身体/尾巴 → 分区反应）
  右侧常驻 4 个按钮（竖排）：输入 / 互动 / 设置 / 内容   ← 不是右键菜单
  点击按钮 → 同锚点固定定位面板（role=dialog，非 modal，Escape/点外关闭）
  内容面板 → 懒加载 client.content.js（4 tabs：角色 / 自定义 / 内容包 / 市场）
  气泡：汀岚 speech、猫/狗 thought；默认白底；3.2s 消失
```

要点：插件是“**四个并列按钮**”，应用是“**一个入口 + 大菜单**”，两端是两个极端；共享品牌但交互语言不统一（见 P1-8 / §7.4）。

### 2.3 当前右键菜单树（从代码重建，2026-11-19 快照）

```
右键 / ⋯ / Shift+F10
├ 汀岚 · 桌面                          ← 标题写死“汀岚”，与当前角色/默认“折角”不一致
├ 交办 / 打字输入…                     ← 高频，放在首项（与 INPUT-MODALITY 建议一致）
├ [hero 模式] 当前角色动作 × 5          ← 来自 regions.json actions，数据驱动，好
│   （例：汀岚 摸头/递纸/挥手/整理蝴蝶结/聊两句；猫 摸头/伸懒腰/洗脸/追尾巴/跑一跑；狗 摸头/丢球/捡球/追尾巴/跑一跑）
├ [origami 模式] 摸摸 / 给纸片 / 折一下
├ 折页簿
├ 导入 DeepSeek 网页会话…
├ Advisers 开关                        ← 无开/关状态勾选
├ (Advisers 状态标题 + 简报策略标题)    ← 开启时动态插入，菜单长度/项位会变
├ 打开 Advisers 简报… / Advisers 重试   ← 条件项
├ 模型 / API Key 设置…
├ 角色与内容中心…
├ 宠物缩放 · 2×   [1×][2×][3×][4×]     ← 4 个 radio 占一整行
├ 文字大小 100%   [A−][A+]              ← 2 个按钮占一整行
├ 窗口 / 声明
├ 关于与声明（完整 TOS/免责声明/数据控制）…
├ 撤回同意（停止处理，二次确认）…
├ 删除全部本地数据（二次确认，残留会列出）…
├ TTS 声明与语音确认…
├ 完整面板（开发/E2E）                  ← 发布版可见；单向进入 ?shell=window
└ 退出                                  ← 直接 close，不保存
```

**计数（按代码与 regions 数据）：** 动画角色 23 个可聚焦项（Advisers 开启时 24–25）、折纸 21 个；其中 14–16 个与“设置/高级/法律”有关。**首屏需要滚动的结论不是主观感受**：菜单 `max-height: calc(100vh - 8px)` = 328px（`pet.css:438-444`），每个按钮 `min-height:22px`、默认 `font-size: calc(9px*--ui-scale)=18px`、另有 3px padding+边框，单行实际约 29px；长标签（如“关于与声明（完整 TOS/免责声明/数据控制）…”“删除全部本地数据（二次确认，残留会列出）…”）在 230px 宽内会换行。按纯下限 23×22px + 4 个标题 ≥600px，**至少需要滚动约 1.8–2.5 个菜单视口**。

## 3. P0 问题（发布前必须处理）

### P0-1 右键菜单 IA 与 480×336 窗口不匹配：常用/高级/法律/开发混在一个平面

- **现象**：23 项平铺；只有 4 个 `addHeading` 分组、没有分隔线、没有子菜单/二级 sheet；缩放和字号以“内联按钮行”直接占用根菜单；法律/危险操作与高频动作同层；Advisers 开启时动态插入条目导致项位漂移。
- **证据**：`src/pet/desktop-shell.ts:607-713`（构造顺序与全部条目）；`src/pet/pet.css:438-444`（230px 宽、`max-height: calc(100vh-8px)`、`overflow-y:auto`）；`src/pet/pet.css:480-486`（22px 最小高、18px 默认字号）；`app/tauri/src-tauri/tauri.conf.json:17-20`（480×336、不可缩放）；`docs/DESKTOP-PET-UX-2026-11-16.md:195-206`（已批准设计：根菜单 9 项、2–3 条分隔线、`更多 ▸`/`设置与窗口 ▸` 等二级）。
- **影响**：高频动作与设置成本接近；用户要找“静音/改动某个设置”必须逐项读 23 条；键盘用户要按最多 20 次方向键；菜单滚动在透明置顶小窗里没有滚动条提示；2× 字号下长标签换行进一步拉长。**这是“克制”目标的反面，也是本次评审要求的主问题。**
- **建议**：根菜单收敛到 ≤9 项（见 §7 目标树）；设置/内容/更多使用二级 sheet 或独立设置窗；缩放/字号从根菜单移除；法律/危险动作收进“关于与声明 → 数据与隐私”二级；删除「完整面板（开发/E2E）」。
- **成本/收益/风险**：1–2 人日；收益高（直接改善所有用户每次右键的体验）；风险低（动作 handler 全部可复用；需要补 2–3 个单元测试 + 1 个 CDP 菜单快照测试）。**值得做，不算大重构。**

### P0-2 产品壳隐藏了必需控件，只留开发面板；且“完整面板”是单向门

- **现象 A（控件不可达）**：桌面壳隐藏 `header` 与 `aside.panel`；`aside.panel` 里有 `#mute`（静音）、`#vol`（音量）、`#talk`（按住说话/ASR）、`#rename`（改名）、`#voice-cache`（清语音缓存）、`#reset-window`（复位窗口）、`#save`/`#load`（手动保存/读取）；右键菜单只镜像了摸摸/给纸片/折一下/折页簿/导入/Advisers/设置页/内容中心/缩放/文字/关于/TTS/退出，**没有上面这些**。
- **证据 A**：`pet.html:63-90`（控件清单，含 `:72` 静音、`:73` 保存、`:71` 按住说话、`:76` 复位窗口）；`src/pet/pet.css:351-352`（桌面壳 `header, aside.panel { display:none }`）；`src/pet/desktop-shell.ts:607-713`（菜单没有对应项）。程序化 `.click()` 可以点到隐藏按钮，但**用户点不到、也看不到状态**（例如 Advisers 开关没有开/关标记）。
- **现象 B（dev 单向门）**：菜单最后有「完整面板（开发/E2E）」→ `winRef.location.search='?shell=window'`。`?shell=window` 分支在 `initDesktopShell()` 里**直接 return**，不创建菜单、触发器 CSS `display:none`；该布局下虽有 About 可退出，但没有“回到桌宠”的显式入口，且窗口仍是 480×336 透明无边框。
- **证据 B**：`src/pet/desktop-shell.ts:712`；`src/pet/desktop-shell.ts:447-455`；`src/pet/pet.css:428`（非 desktop 壳隐藏 `#pet-menu-button`）。
- **影响**：对使用者，这是**功能缺失 + 错误恢复缺失**：想静音只能关系统音量/杀进程；想改名只能进开发壳；ASR 语音输入在设好 TTS/ASR 同意后依然没有入口；窗口被拖出屏幕后无“复位”。对发布，这是把 QA 后门当普通菜单项暴露。
- **建议**：把 `静音/音量`、`按住说话（语音输入）`、`改名`、`复位窗口`、`保存` 迁入产品菜单或新的“设置”二级/设置窗口；`清语音缓存` 可留在设置；“完整面板（开发/E2E）”只在 dev build 或 `?dev=1` 下渲染，发布构建不出现（`import.meta.env.DEV`/构建常量），并从产品菜单删除。
- **成本/收益/风险**：1–2 人日；收益很高（恢复核心能力）；风险低（handler 已在 main.ts 中存在：`main.ts:1675` 静音、`:1936` 音量、`:1657` PTT、`:1547` 改名、`:2122` 复位、`:1904` 保存）。**值得做，属于“把已有按钮接对入口”，不是重写。**

### P0-3 存档损坏恢复与退出保存：提示、按钮、标志位三者互相矛盾

- **损坏提示指向不存在的按钮**：`main.ts:2176-2179` 明确说“先点保存写入新档”；`#save` 在 `pet.html:73`，但桌面壳 `pet.css:352` 隐藏。
- **自动保存被暂停**：`saveRecoveryNeeded` 为真时 30s autosave 与 `visibilitychange` 保存都直接 return（`main.ts:1734,2139-2148`），只有 `saveNowInternal()` 成功才清标志（`main.ts:1775`）。触发保存的唯一用户入口是隐藏的 `#save`。
- **删除存档不清标志**：`save-delete` 只删后端存档、重置内存 state（`main.ts:2041-2062`），没有 `saveRecoveryNeeded=false`；本次会话仍然不会自动写新档。
- **退出不保存**：菜单「退出」= `winRef.close()`（`desktop-shell.ts:713`）；`beforeunload` 只保存窗口位置（`main.ts:2347`）；About 的退出 `exitApplication()` 也只是 close（`main.ts:3307-3323`）。已批准设计要求 `saveNow() → close()` 且失败二次确认（`docs/DESKTOP-PET-UX-2026-11-16.md:98,206,226`）。
- **影响**：损坏过一次存档的用户会进入“永久不落盘”的当前会话；正常用户退出时最多丢 30 秒内的状态。更严重的是**提示文本在骗人**，违反错误恢复的第一原则（可执行、可验证）。
- **建议**：损坏时打开一个明确的选择面板：`保存当前为新档（覆盖损坏主档，保留 .bak） / 从备份恢复 / 删除并重来 / 退出`；`delete_save` 成功后同步清 `saveRecoveryNeeded`；退出统一走 `saveNow → close`，失败则弹“未保存，仍要退出？”；把 `saveRecoveryNeeded` 纳入可达状态指示（菜单/气泡）。
- **成本/收益/风险**：0.5–1.5 人日；收益高（数据安全 + 信任）；风险低-中（涉及存档状态机，需要加 fake IPC 测试：损坏→保存→新档、删除→清标志、退出被拒绝时不关窗）。

### P0-4 置顶 + 无边框 + skipTaskbar + 可拖动，但没有托盘/复位入口

- **窗口事实**：`transparent:true, decorations:false, alwaysOnTop:true, skipTaskbar:true, resizable:false`（`tauri.conf.json:20-26`；`main.rs:874` 起同类 builder flags）。
- **可丢失**：宠物/hero 画布支持原生窗口拖动（`desktop-shell.ts:818-842`；`main.ts:2581-2615`），没有拖动边界 clamp；启动位置回收只在下次启动执行，且只做粗边界判断（`main.ts:2317-2340`）。
- **无召回**：Rust 无 `TrayIcon`（`Cargo.toml` 的 `tauri` features 为空；`main.rs`/`src` grep 无 TrayIcon）；菜单无“复位窗口”；`#reset-window` 在隐藏 aside（`pet.html:76`）。
- **项目自己的结论**：`docs/research/INPUT-TECH-FEASIBILITY-2026-11-17.md:36`：“skipTaskbar 隐藏任务栏图标后必须保留托盘/热键/右键菜单召回”；`:48` 托盘列为 v2。这与“桌宠是常驻桌面产品”的定位冲突。
- **影响**：拖到屏幕外/副屏拔掉/窗口跑到不可见区域 = 用户无法打开菜单、无法退出、无法复位，只能任务管理器结束进程；双开还会争同一存档/窗口位置（无 single-instance，见 P2）。
- **建议（短期）**：菜单“设置”加“复位到右下角”；启动/显示器变化/拖动结束后 clamp 到当前显示器工作区；把 `#reset-window` 逻辑暴露到产品菜单。**（结构性）**：加托盘图标（打开桌宠/复位/设置/退出）并接入 `tauri` 的 `tray-icon` feature + ICO；托盘是 Windows 桌面常驻产品的标准召回面（输入法/杀毒软件同构）。
- **成本/收益/风险**：短期 0.5 人日（低风险）；托盘 1–2 人日 + Windows 构建/权限/图标资产（中风险，需 CI/安装器回归）。若近期对外发布，本项应升为 P0；若仅内部原型，可短期先做 clamp+复位入口。

## 4. P1 问题（下一迭代应处理）

### P1-1 内容中心被塞进 480×336 不可缩放小窗

- **证据**：`pet.css:1000-1015` `.content-hub-panel { width:min(760px,100%); max-height:92vh; }`；`pet.css:1057-1066` `.content-hub-body { max-height:54vh; overflow-y:auto; }`；`tauri.conf.json:17-20` 480×336 且 `resizable:false`；`main.ts` 打开 hub 时没有任何 `setSize`（grep 0）；`content-hub.ts:107-112` 四个一级 tab；`:1785-1826` 内容包导入；`:1722-1783` 逐字声明确认。
- **影响**：在 336px 高窗口里，body 最大约 181px；角色卡网格、内容包导入、声明全文、市场说明都在这个滚动区里。固定 8–10px 字号（`pet.css:1067-1199`）进一步降低可读性。新用户第一次打开“角色与内容中心”，看到的会是一个约 456×309 的密集弹出层——与“内容中心/市场”的产品预期不匹配。
- **建议**：见 §7 Phase 2：内容中心进独立可缩放窗口（最少 760×560），或临时在打开 hub 时把 pet 窗尺寸切到 720×560（会破坏“宠物常驻”形态，不推荐）；退路是至少把 pet 窗改成可缩放/可最大化，并给 hub 一个“展开”入口。
- **成本/收益/风险**：独立窗口 2–3 人日；收益高（内容/市场/导入/声明是后续商业化与研究展示的主面）；风险中（Tauri 窗口/焦点/ACL/截图/E2E 需回归）。**值得重构；不是纯视觉问题。**

### P1-2 菜单开合与点击穿透：设计说“菜单打开时整窗命中”，实现只报菜单矩形；点窗外不关闭

- **设计意图**：`docs/DESKTOP-PET-UX-2026-11-16.md:78` “菜单打开时 region=整窗”；`:99` “菜单打开时绝不穿透”。
- **实现**：`hit-regions.ts:15-30` 只收集 `#pet-shell-menu` 等元素矩形；`:200-227` 每 100ms 同步一次；菜单本身没有整窗 region。`desktop-shell.ts:523-535,855-860` 的“点外关闭”依赖窗口内 pointerdown；而透明窗外部区域点击会穿透到桌面（Rust 每 60ms 轮询命中，见 `main.rs:96-128`），**不触发 webview 的 pointerdown**。
- **后果**：① 右键打开菜单后，若用户点到菜单外的透明区域/其它应用，菜单不会关闭，会继续停在最上层；② 打开后约 0–100ms 内，新菜单区域尚未在 Rust 命中表里，落在旧宠物区域之外的菜单项点击可能穿透到桌面（概率低但真实）；③ 关闭后最多 100ms 内旧菜单矩形仍拦截桌面点击。
- **建议**：菜单打开时按设计上报整窗（或至少“宠物 ∪ 菜单 ∪ 12px 安全边”），关闭后立即同步；“点外关闭”改为同时监听窗口 `blur`/`focusout`（桌面点击会失焦），并在菜单/内容中心 state 切换时主动触发一次 hit-region tick（新增导出函数或 `window` 事件，例如 `pet:hit-region-sync`）。
- **成本/收益/风险**：0.5–1 人日；收益中高（菜单行为符合桌面直觉）；风险低-中（整窗命中会短暂拦截桌面点击，需要真机验证——设计已接受这个 trade-off）。

### P1-3 工具页入口不符合已批准设计，Tauri 下可能静默失败

- **设计**：导入/配置页 = 同窗导航（`chat-import.html?from=pet` / `setup.html?from=pet`）；进入前 `saveNow()`，工具页 `setSize(720×560)` 并带“← 返回桌宠”；不依赖 `window.open`（`docs/DESKTOP-PET-UX-2026-11-16.md:104`）。
- **实现**：菜单「模型 / API Key 设置…」→ `openSetup()` 只做 `win.open('/setup.html','_blank')`，**没有 fallback、没有错误提示**（`desktop-shell.ts:398-400`）；「导入 DeepSeek 网页会话…」有 fallback 到同窗导航（`desktop-shell.ts:368-373`），但没有 `saveNow()`、没有 `setSize`、返回靠页内 `<a href="/pet.html">`（`setup.html:150`、`chat-import.html:43`）。`main.ts:3165-3168,3226-3229` 的 `window.open` 也没有取消/失败反馈。
- **旁证（历史审计，非本轮实测）**：`docs/audit/AUDIT-CODE-RUNTIME-2026-11-16.md:46-49` 记录 Tauri v2 capability 未授予 `allow-create-webview-window`、WebView2 默认忽略 `window.open`，因此菜单项在打包版“点了没反应”是**静态高置信**；`docs/audit/AUDIT-ADVISERS-PRODUCT-2026-11-16.md:19,157` 给过同样结论。本轮复核 capabilities 仍无 create/webview 权限（`app/tauri/src-tauri/capabilities/*.json` grep 0 命中）。
- **影响**：两个低频但重要的入口（配置/导入）在桌面版可能表现为“死菜单”；若 fallback 走同窗导航，则宠物窗变成 480×336 的工具页，用户会失去“返回”直觉，且进入前未保存。
- **建议**：短期给 `openSetup()` 与 `openImport()` 统一 `try window.open → catch/失败 showBubble + 同窗导航`；同窗导航前 `saveNow()`；把工具页做成独立窗口（随 P1-1 的设置窗一起）并按设计 `setSize(720×560)`；页内提供“返回桌宠”按钮（不只是链接）。**需真机验证** `window.open` 行为，不能靠静态判断销项。
- **成本/收益/风险**：1 人日（不含独立窗口）；收益中；风险低（文案/回退），但“同窗跳转”在 Tauri 中的资源/权限需实机确认。

### P1-4 键盘与模态边界：菜单本身很好，但能“穿到”模态后面

- **好的部分（应保留）**：菜单 WAI-ARIA（`role=menu/menuitem/menuitemradio`）、焦点首项、方向键/Home/End roving、Tab 困在菜单、Escape 关闭并还原焦点、Shift+F10/ContextMenu 打开（`desktop-shell.ts:479-535,768-794,861-882`）；内容中心有 tablist/tabpanel、Tab 陷阱、Escape、焦点还原（`content-hub.ts:1323-1351,2180-2204,2214-2267`）。
- **问题 1（静态推断）**：内容中心打开时只 inert 了 `#pet-app`（`content-hub.ts:2211-2213`），而 shell 菜单挂在 `<body>`、`menuBlocked()` 只看 consent（`desktop-shell.ts:432-441`）。因此内容中心打开期间，右键或 Shift+F10 仍可能打开菜单，焦点被移到 z-index 80 的菜单（内容中心 z-index 150 在它上面），形成“焦点在模态后面”的可访问性缺陷。`contextmenu` 处理器（`desktop-shell.ts:845-854`）也没有检查 hub 是否打开。
- **问题 2**：内容中心的 focusable 选择器只含 `button:not([disabled]), a[href]`（`content-hub.ts:2175-2178`），而内容包页有两个 `input[type=file]` 隐藏、`tabIndex=-1`，没问题；但 `role=tabpanel` 本身 `tabIndex=0`，Tab 序里会多一个可聚焦的滚动容器——可接受，需读屏实测。
- **问题 3（插件）**：四个面板 `role=dialog` 但没有 `aria-modal`、没有 Tab 陷阱、没有关闭后的焦点还原；打开时把焦点放到 `×`（`client.js:596-604`），关闭后焦点落到 body。对只靠键盘/读屏的用户不友好。
- **建议**：把 `hub.isOpen()` 纳入 `menuBlocked()`（或 shell 增加“高层 modal 打开”接口）；菜单在模态打开时关闭并 inert；内容中心/插件面板补焦点陷阱与焦点还原（内容中心已有，插件没有）；右键菜单的 `contextmenu` 在 hub 内也应被拒绝。
- **成本/收益/风险**：0.5 人日；收益中（a11y/防误操作）；风险低。

### P1-5 字号/可读性：A−/A+ 只覆盖部分界面，法律与内容中心仍是 8–11px

- **部分覆盖**：`--ui-scale` 用在菜单（`pet.css:485,500`）、气泡（`:384`）、composer/结果卡（`:584-663`）、setup notice（`:394`）；但 About/TOS（`:953-955` 10–11px；`:731-950` 固定 7–12px）、内容中心（`:1017-1268` 固定 8–12px）、插件（内联 11–12px）**不随文字大小变化**。
- **影响**：设置里给了“文字大小”控件，用户会以为整个应用会放大；实际最重要的长文本（TOS/免责声明/内容包声明/市场说明）仍固定小字。在 480×336 的窗内，内容包声明确认页会被压成密集小字，增加误读/误点风险。
- **建议**：统一 type token（如 `--text-xs/sm/md/lg` 与 `--ui-scale` 相乘，最小字号 ≥12px，正文 ≥13px）；内容中心/About 用 token；A−/A+ 改名“菜单与气泡字号”并补“界面字号”或直接全量生效；对 8px 元信息做上限/下限保护。
- **成本/收益/风险**：0.5–1 人日；收益中高（可读性/合规文本可读）；风险低（CSS 变量为主，可能触发少量布局回归，用截图矩阵回归）。

### P1-6 发现性：右键菜单是唯一入口，但只有 22px、55% 透明度的“⋯”提示

- **事实**：产品壳只显示宠物和 `#pet-menu-button`（22×22、`opacity:.55`、`title="桌面菜单（右键 / Shift+F10）"`；`pet.css:402-427`、`pet.html:108`）；无首次使用 coach mark；气泡不可点击（`pet.css:377-386` 的 `.bubble { pointer-events:none }`）；角色切换藏三层（菜单 → 角色与内容中心 → 角色 tab → 一键应用 → 刷新）。
- **已有研究建议**：`docs/research/INPUT-MODALITY-2026-11-17.md:64-69` 要求“首次运行 coach mark 一次（可关）+ 点气泡打开 composer + 草稿持久化”；`:90-91` 要求 PTT 作为辅助入口、字号 ≥16px、指针目标 ≥24×24（WCAG 2.2）。这些在实现中只做了部分。
- **建议（低成本高回报）**：首次启动显示一次气泡/卡片：“右键宠物或点 ⋯ 打开菜单；菜单第一个是打字输入”，可关且只出现一次；让已有文字的气泡可点击打开 composer；把“角色与内容中心”在首次进入时用一次性高亮提示；把 `#pet-menu-button` 提高到 ≥24×24、默认 opacity ≥.7。
- **成本/收益/风险**：0.25–0.5 人日；收益高（新用户第一次就能用）；风险低（仅一次性提示，可加 ack key）。

### P1-7 “设置”信息架构不完整：已批准设置 sheet 的字段大多没有落点

- **设计字段**（`docs/DESKTOP-PET-UX-2026-11-16.md:210-216`）：外观（宠物大小/菜单缩放/文字大小/置顶/透明区点击穿透/全屏自动隐藏）、声音（静音/音量/清语音缓存）、模型与 API Key、数据与隐私、辅助功能（减少动态/快捷键说明/字幕）、关于。
- **现状**：菜单只提供缩放、文字大小、内容中心、TTS 声明；`alwaysOnTop`/`is_fullscreen`/点击穿透状态/减少动态/快捷键说明/音量/静音在产品面**没有入口**。grep `setAlwaysOnTop`/`is_fullscreen` 在 `src/pet` 0 命中（Rust 有 `is_fullscreen` 命令但前端未调用）。
- **影响**：用户不能在不进开发壳的情况下关置顶/静音/调音量/看快捷键；全屏时宠物是否自动隐藏、透明区域是否穿透都不可见。
- **建议**：随 P0-2/P1-1 一起做一个真正的“设置”二级面板或设置窗口（字段见 §7）；短期至少把静音/音量/复位/置顶/减少动态放进菜单二级。
- **成本/收益/风险**：与 P0-2/P1-1 合并，增量 1 人日；收益中高；风险低-中。

### P1-8 dsh-famling：四个常驻按钮 + 四个面板，“按钮最小化”没有落到插件

- **事实**：插件在 72px 宠物右侧常驻竖排 4 个按钮（输入/互动/设置/内容；`client.js:1016-1025`），按钮 `padding 4px 7px; font-size 11px`（约 23px 高，低于 24px 目标）；每个按钮打开一个 `position:fixed` 面板（`client.js:901-984`），同一时刻只打开一个（`setMode`）。
- **问题**：① 四个并列入口没有主次，设置与内容都是低频却常驻；② 面板 `role=dialog` 但非 modal、无焦点陷阱、无关闭后焦点还原（`client.js:596-604`）；③ 按钮只有 `aria-expanded`，没有 `aria-controls`；④ 面板锚点在打开时计算一次（`client.js:640-647`），窗口/侧栏变化后可能漂移；⑤ 内容中心宽度 360 但锚点 clamp 用 328（`client.js:643` vs `client.content.js` 的 `width:360`），窄视口会裁 32px。
- **影响**：DSH 侧栏 footer 是有限高度，4 个按钮+面板会挤占聊天输入/列表空间；低频设置常驻增加视觉噪音；键盘/读屏用户不能完整操作面板。
- **建议（A/B 可选）**：保持 1 个主按钮「输入」+ 1 个「⋯」（互动/设置/内容/Advisers 进同一 popover），宠物点击已承担分区互动，所以「互动」按钮可降级进 popover；面板补焦点陷阱/还原、`aria-controls`、`aria-modal`，按钮目标 ≥24px；锚点 clamp 使用真实面板宽度。若担心发现性，做 1 周 A/B 或 hover 展开，不直接砍掉。
- **成本/收益/风险**：0.5–1 人日；收益中（更克制、更少占位）；风险中（发现性下降，需要可用性验证）。**建议做，但先 A/B，不做无数据硬砍。**

### P1-9 dsh-famling：错误恢复过于笼统，失败后没有下一步

- **事实**：`sendInput`/`sendTask`/`loadBrief` 失败都只 `say(L.bridgeFailed)`（“桥接调用失败。”）3.2s 气泡（`client.js:806-848,789-804`）；Host 返回的 `E_LLM/E_TASK/E_MEMORY/E_INPUT` 等结构化 code（`index.js:188-256`）在客户端被丢弃；内容中心懒加载失败文案说“角色与外观设置仍可继续使用”（`client.js:350`），但设置面板只有内容入口/帧动画/气泡（`client.js:938-961`）——**角色/外观实际上仍在失败的内容中心里**。
- **影响**：用户看到失败后不知道是模型没配、网络问题还是 Host 未接入；不能重试或复制原文；内容中心失败时被误导“还能改外观”。
- **建议**：客户端按 code 给可执行文案（E_LLM →“DSH 未选择默认模型，去设置里选一个”；E_TASK →“提醒创建失败，检查时间/权限”；E_MEMORY →“Advisers 简报不可用”）；失败保留输入并可一键重试；修正 contentFailed 文案或让设置面板真的提供外观入口。
- **成本/收益/风险**：0.5 人日；收益中；风险低。

### P1-10 Composer 的失败恢复与“稍后”语义不完整

- **失败无重试**：`submit()` 失败只渲染 error 结果卡（`desktop-shell.ts:1412-1424`），卡内动作仍只有 `展开/稍后/关闭`（构造于 `:1232-1244`），没有“重试/复制原文”；失败时 composer 已关闭，用户需重开并重新输入。
- **“稍后”= “关闭”**：`onLater` 与 `onCloseCard` 都是 `closeResult()`（`:1479-1480`），没有延迟队列/会话列表；`getSessionResults()` 仅暴露在 `window.__pet`（`:2223-2229`），没有用户可见入口。
- **草稿/气泡入口缺失**：设计建议输入即存草稿、点已有文字气泡打开 composer（`INPUT-MODALITY:64-69`），实现均无；`.bubble { pointer-events:none }`（`pet.css:377-386`）。
- **影响**：用户输入失败后只能重打；点“稍后”后结果不可找回；对“本地草稿”的信任降低。
- **建议**：结果卡改成 `重试 / 复制 / 关闭`（出错时）或 `展开 / 关闭`；删掉语义重复的“稍后”；失败保留输入并重开 composer；把最近 5 条 session 结果做成“折页簿 → 本次会话”列表（只在内存，刷新即失，明确标注）。
- **成本/收益/风险**：0.5–1 人日；收益中；风险低。

## 5. P2 问题（打磨/一致性/文档真值）

### 5.1 危险动作直接放在根菜单

「撤回同意」「删除全部本地数据」「TTS 声明」与「关于与声明」同层（`desktop-shell.ts:698-711`）；虽然有二次确认，但这违反克制菜单的“危险动作最后/二级”惯例。建议收进「关于与声明 → 数据与隐私…」二级/设置窗口，根菜单只保留 `关于与声明…`。成本仅文案/结构，风险低。

### 5.2 菜单状态不反映真实状态

- `Advisers 开关` 无开/关勾选（`desktop-shell.ts:627`），开启后只额外插入标题/条目，菜单长度与项位变化（`:631-645`），破坏肌肉记忆。
- 缩放/字号有 `aria-checked`/disabled（很好），但静音、音量、置顶等没有入口/状态。
- `addHeading('汀岚 · 桌面')` 写死（`desktop-shell.ts:607`），而产品默认角色是“折角”、当前角色可能是猫/狗/人形；菜单标题不随角色变。
- 建议：所有开关用 `menuitemcheckbox`/`menuitemradio` + ✓；动态项固定位置（禁用/隐藏而非插入）；标题读当前角色名或改为中性的“桌面菜单”。成本 0.25 人日。

### 5.3 命名/身份不一致

同一产品面同时出现：`汀岚`（插件人格、菜单标题、内容中心角色卡）、`折角`（应用默认宠物名/`pet.html:32`、本地回复“我是折角”`desktop-shell.ts:1077`）、`Pagefold`（`pet.html:10` title）、`Famling`（插件/README）、`Desktop Games`（Tauri productName/窗口 title）。这不是单纯的文案问题：用户在“改名/角色切换/关于”里会看到身份漂移。建议先做一张**用户可见命名对照表**（产品名/角色名/应用名/包名），再由产品名决策统一；成本 0.5 人日文档 + 替换，风险低（涉及安装器/签名时再定）。

### 5.4 文档 IA 漂移（会持续误导后续 UI 工作）

- `README.md:3` 仍写“内容中心：角色/声音/对话/主题/背景/字体”六类并列，而当前 v2 是“角色/自定义/内容包/市场”四 tab（`content-hub.ts:107-112`）；`docs/design/CONTENT-MARKET-2026-11-19.md` 前文 §4.2 仍是六分类目标 IA，v2 追加 §10 才改成角色主题；`HANDOFF-2026-11-15` 早已落后；`UI-DEFAULTS-GAP-AUDIT-2026-11-17` 的“UI 91 0 入库”已被 `public/assets/ui/` 推翻。
- 建议：把“当前 IA/菜单树/文案”收敛到**一个**真值文档（建议 `docs/design/UI-IA-CURRENT.md`），其余文档只引用它；README 的前 5 行只写“内容中心 = 角色/自定义/内容包/市场”。成本 0.5 人日，风险低。

### 5.5 右键抑制原生菜单，文本域失去复制/粘贴上下文菜单

`docRef.addEventListener('contextmenu', e => { e.preventDefault(); ... openMenuAt(...) })`（`desktop-shell.ts:845-854`）在**全文档**生效，包括 composer 的 textarea、内容中心的输入/文本。用户右键文本想粘贴/复制时，得到的是宠物菜单（或在内容中心后打开宠物菜单）。建议：在 `INPUT/TEXTAREA/[contenteditable]` 及内容中心 root 内 `return`，让原生菜单工作；菜单只在宠物/空白区打开。成本 0.1 人日，风险低。

### 5.6 菜单视觉/触达细节

- 22×22 触发器（`pet.css:402-427`）低于 WCAG 2.2 的 24×24；默认 `opacity:.55` 偏低。
- 只有 10 个菜单项带图标（origami 动作/折页簿/导入/Advisers/设置/内容/关于/退出），动画角色的 5 个动作、交办、TTS、数据控制、完整面板无图标——视觉节奏不齐；图标以 `button.textContent` 后 `append(img)` 放在文字右侧，不是常规左图标。**UI 资产现已存在**（`public/assets/ui/menu/U-MENU-*.png`，32px 占位），所以这是接线/节奏问题，不是缺资产。
- 菜单无滚动条样式/滚动提示；键盘 Home/End 会跳动整表；无 type-ahead/字母快捷键（中文场景可省，但可在二级面板用）。
- 建议：触发器 ≥24×24、opacity ≥.7；图标统一左置；给所有一级项配图标或全不配；加“滚动区边缘阴影”。成本 0.5 人日，风险低。

### 5.7 插件内容中心的键盘/尺寸细节

- 内容中心 chunk 无 keydown/focus 处理（grep 0 命中），只继承外层 Escape；无 Tab 陷阱；`width:360` 与锚点 `innerWidth-328` 不一致（`client.js:643`）；面板锚点在 resize/侧栏变化后不更新。
- 建议：随 P1-8 一起补；或至少把 clamp 改为 `panelWidth`，并监听 `resize` 重新定位。成本 0.25 人日。

### 5.8 单实例缺失

无 single-instance 插件（`Cargo.toml` 仅 tauri 标准 feature；`main.rs` 无 single-instance 初始化）。双击启动两次会得到两只宠物，可能同时写同一存档/窗口位置——`MASTER-STATUS-2026-11-16.md:63` 已把它列为未考虑项。建议：`tauri-plugin-single-instance`；第二次启动时把已有窗口带到前台/复位。成本 0.5 人日 + 构建，风险低。

### 5.9 OS 存在感：app icon 仍是 Tauri 默认图标

`app/tauri/src-tauri/icons/icon.png` sha256 `7ac79a…`（与 11-17 审计一致，仍是默认蓝笑脸），无 tray 图标。安装后开始菜单/任务管理器/（未来）托盘都缺少品牌识别。建议随 P0-4 托盘一起做 16/32/48/256/ICO 并登记来源/license；成本 0.5–1 人日（含资产登记），风险低。

## 6. 参考：输入法 / 杀毒软件的“克制菜单”该怎么借

> 下面是行业常见交互模式的抽象，不作为某一家产品的实测描述；目的是给本项目的菜单树定约束。

| 原则 | 输入法 / 杀毒软件常见做法 | 对 famling 的落地 |
|---|---|---|
| 一级只放高频 + 状态 | 输入法右键通常 5–8 项：输入法状态/常用设置/属性设置/帮助/退出；杀毒托盘通常 5–7 项：打开主界面/扫描/暂停防护/设置/退出 | 根菜单 ≤9 项：摸摸/互动、交办、折页簿、角色与内容、设置、Advisers、更多、关于、退出 |
| 高级进主界面 | 输入法的“属性设置”是独立可缩放窗口；杀毒软件的“设置”是主界面 tab | 设置/内容中心进独立窗口或至少二级 sheet；不在根菜单放缩放/字号/法律全文 |
| 托盘提供稳定召回 | 输入法/杀毒都有托盘图标：打开/暂停/设置/退出 | 本产品 skipTaskbar + 置顶 + 无边框，**必须有托盘**（P0-4） |
| 状态用勾选/单选/禁用 | “开机启动 ✓”“暂停防护 ✓”“输入法状态：中/英” | Advisers 开/关用 menuitemcheckbox ✓；语言/角色的当前项用 radio ✓；不可用项禁用 + 原因（不要静默） |
| 危险动作靠后 + 二次确认 | 退出/卸载/恢复默认放在底部，二次确认 | “删除全部数据/撤回同意”移入“数据与隐私”二级，保留二次确认 |
| 不动态增删一级项 | 状态变化只改文本/勾选，不改变菜单长度 | Advisers 状态改为固定项 + 状态后缀，不再插入 2–3 行 |
| 键盘与屏幕阅读器 | 右键菜单支持方向键/Esc/Enter；设置窗 Tab 序完整 | 保留现有 ARIA/roving，补“模态期间菜单不可打开”与菜单外关闭 |

**一个反面参照（本项目的极端）**：插件是 4 个常驻并列按钮（按钮太多），应用是 23 项平铺菜单（选择太多）；两端都应该收敛到“一个主入口 + 分层”。

## 7. 目标信息架构与菜单树（建议）

### 7.1 原则

1. **两级，不做三级弹层**：480×336 放不下真正的嵌套子菜单；根菜单 + 二级 sheet/设置窗口（非弹出子菜单）更稳。
2. **根菜单 ≤9 项，且永远不因状态增删**：状态用 ✓/后缀/禁用表达。
3. **高频在前，危险在后**：高频动作（摸摸/互动/交办）≤3；设置/内容次之；数据/退出最后。
4. **开发/E2E 入口不进发布菜单**：`?dev=1` 或 `import.meta.env.DEV`。
5. **一个主入口**：⋯/右键/Shift+F10 三路同源；托盘补召回。
6. **所有失败可恢复**：每个异步动作有失败文案 + 重试/返回；退出保存失败要拦。

### 7.2 Phase 1（不新增窗口，1–2 天可落地的菜单树）

```
右键 / ⋯ / Shift+F10（根，≤9 项，3 组之间用分隔线）
├ 摸摸 / 互动…              ← 当前角色动作（5 项以内；折纸为摸摸/给纸片/折一下）
├ 交办 / 打字输入…          ← 保留首项；Enter 即可打开
├ 折页簿…
├ ─────────────
├ 角色与内容中心…           ← 打开内容对话框（Phase 2 迁入独立窗口）
├ 设置…                    ← 打开二级设置 panel（见下）
├ Advisers…                ← 打开二级 panel：开关 ✓ / 只读简报… / 重试（不可用则禁用+原因）
├ ─────────────
├ 关于与声明…               ← 打开 About；数据与隐私在 About 内
└ 退出（保存后退出）         ← saveNow()→close；失败二次确认

二级「设置」panel（同窗 sheet，分组，≤8 项/组）
├ 外观：宠物缩放 [1×2×3×4×] / 文字大小 [A− A+ 重置] / 减少动态效果
├ 窗口：置顶 ✓ / 复位到右下角 / 透明点击穿透状态（只读+说明）
├ 声音：静音 ✓ / 音量滑杆 / 清语音缓存
└ 输入：按住说话（语音输入）/ 快捷键说明（只读）

二级「更多」panel（低频工具）
├ 导入 DeepSeek 网页会话…   ← 进入前 saveNow；失败有提示
├ 模型 / API Key 设置…      ← 打开设置窗口/工具页；失败有提示
└ TTS 声明与语音确认…

保留但不出现在产品根菜单：完整面板（开发/E2E）仅 ?dev=1 或 dev build。
```

**动作映射（不丢功能）：** 现有 23 项全部有落点——摸摸/给纸片/折一下 or 当前角色 5 动作 → 根「摸摸/互动」；交办 → 根；折页簿 → 根；导入/模型/TTS → 更多；Advisers 开关/状态/简报/重试 → Advisers 二级；缩放/文字 → 设置；关于/数据控制/TTS → 关于（TTS 也可在声音组）；完整面板 → dev only；退出 → 根末。

### 7.3 Phase 2（结构性目标：独立设置窗口 + 托盘）

```
桌宠窗（480×336，透明，置顶，skipTaskbar；不可缩放）
  宠物 + 气泡 + ⋯（24×24，opacity ≥.7）
  右键/⋯ 根菜单 ≤9 项（同 Phase 1）
  左键：摸/拖；键盘：Shift+F10 → 菜单；Enter/Esc/方向键

系统托盘（NotifyIcon，16/32 ICO）
  打开桌宠 / 复位窗口 / 设置… / 退出

设置窗口（720×560 或 760×560，普通标题栏，可缩放，进任务栏）
├ 角色与内容   ← 现有 4 tabs：角色 / 自定义 / 内容包 / 市场
├ 外观         ← 缩放/字号/减少动态/主题/背景/字体（可复用当前 content hub 控件）
├ 声音与语音   ← 静音/音量/TTS 音色/ASR 说明/PTT
├ 交互与窗口   ← 置顶/透明穿透状态/复位位置/全屏自动隐藏/快捷键说明
├ 隐私与数据   ← 撤回同意/删除全部数据/审核记录/存档备份/导入导出
└ 关于与声明   ← TOS/AI 标识/许可/版本/非官方声明
```

好处：内容中心/设置/工具页都有正常尺寸和任务栏入口；桌宠窗保持极简；托盘解决召回/退出；与输入法/杀毒软件的“托盘 + 主界面 + 托盘菜单”一致。成本主要在 Tauri 窗口/ACL/图标与 Windows 构建回归，不在 UI 逻辑（现有 content-hub 可直接嵌入）。

### 7.4 dsh-famling 目标树（插件）

```
侧栏 footer：72px 宠物 + [输入] + [⋯]（两个按钮，均 ≥24px）

⋯ popover（同锚点面板，≤6 项）
├ 互动…        ← 物种动作 grid（当前 5 项）
├ 内容中心…    ← 4 tabs（角色/自定义/内容包/市场）
├ 设置…        ← 帧动画/气泡/Advisers 摘要/TTS 同意状态
└ 关于/使用限制（短版 + 详情链接）

可选：宠物右键 = 同一 popover（若 DSH 允许；避免与浏览器原生菜单冲突）
```
保留「输入」作为唯一常驻主按钮（最高频），其余进「⋯」；互动面板仍可通过点头/身体/尾巴直接触发（已存在）。若担心“互动”发现性，可在首次使用时 coach mark 一次，而不是永久占 4 个按钮。

### 7.5 键盘模型（两端统一）

| 场景 | 键 | 行为 |
|---|---|---|
| 打开菜单 | 右键 / Shift+F10 / ContextMenu / 点 ⋯ | 焦点到第一项；不改变窗口尺寸 |
| 菜单内 | ↑↓（循环）/ Home / End / Tab / Shift+Tab | roving + Tab 困在菜单（保留现状） |
| 激活 | Enter / Space | 执行；二级 sheet 打开后焦点进第一项 |
| 关闭 | Esc / 点击外部 / 窗口失焦 | 关闭并把焦点还给触发元素/宠物 |
| 设置窗口 | Tab / Shift+Tab / Esc | 关闭设置窗；桌宠仍在 |
| composer | Enter 提交、Shift+Enter 换行、Esc 取消（IME composition 的 Enter 只上屏） | 保留现状（`desktop-shell.ts:1431-1450`） |
| 插件面板 | Esc / 外部点击 / Tab 陷阱 | 关闭并还原焦点（当前缺失） |

## 8. 优化/重构建议汇总（收益 / 成本 / 风险 / 是否值得重构）

| # | 建议 | 收益 | 成本（估算） | 风险 | 判定 |
|---|---|---|---|---|---|
| R1 | 根菜单分层 + 二级 sheet；缩放/字号/法律/危险动作下沉；删除 dev 入口 | 高（每次右键） | 1–2 人日 | 低（复用 handler，补测试） | **值得做（不是重构）** |
| R2 | 静音/音量/PTT/改名/复位/保存归位；补状态 ✓/禁用 | 高（恢复核心功能） | 1–2 人日 | 低 | **值得做** |
| R3 | 存档损坏/退出保存/删除标志闭环 | 高（数据信任） | 0.5–1.5 人日 | 低-中（状态机测试） | **值得做** |
| R4 | 独立设置/内容窗口 + 托盘 + 单实例 | 很高（内容中心可用/可召回/可退出） | 2–4 人日 + Windows 回归 | 中（Tauri ACL/构建/签名） | **值得做，结构性收口** |
| R5 | 工具页同窗/独立窗 + saveNow + 错误提示 | 中 | 1 人日 | 中（window.open 真机行为） | 值得做 |
| R6 | type token / 字号统一 + A−/A+ 全量覆盖 | 中高（法律文本可读） | 0.5–1 人日 | 低（截图回归） | 值得做 |
| R7 | 插件 4 按钮 → 2 按钮 + 焦点/ARIA 修复 | 中（更克制/更少占位） | 0.5–1 人日 | 中（发现性下降，A/B） | 值得做但先 A/B |
| R8 | 首次 coach mark + 气泡点击 + 触发器 ≥24px | 高（首用） | 0.25–0.5 人日 | 低 | **最划算** |
| R9 | 文档 IA 真值治理（README/设计稿/审计同步） | 中（减少后续返工） | 0.5 人日 | 低 | 值得做 |
| R10 | 命名/身份对照表 | 中 | 0.5 人日（文档） | 低 | 产品名拍板后做 |
| R11 | 插件错误码映射/重试 + 内容中心失败文案修正 | 中 | 0.5 人日 | 低 | 值得做 |
| — | **不建议**替换成原生菜单 | — | — | 失去像素风/E2E/主题一致性 | 不做（设计已选 HTML 覆盖层） |
| — | **不建议** v1 引入全局热键 | — | — | 与输入法/系统冲突、Tauri 权限/焦点成本 | 不做（研究结论把热键放 v2） |
| — | **不建议**为了“按钮最小化”直接删插件互动入口 | — | — | 发现性下降 | 先 A/B/coach mark |

## 9. 建议先做的 3 件（含验收标准）

### 第一件：菜单克制化 + 必需控件归位（R1+R2，约 1–2 人日）

- **做什么**：按 §7.2 重排根菜单；把静音/音量/PTT/改名/复位/保存/减少动态放进入口；删除发布版的“完整面板（开发/E2E）”；Advisers 改固定项+✓；去掉根菜单的缩放/字号内联行（进设置 sheet）。
- **验收**：① 根菜单 ≤9 项；② 默认 2×/文字 100%/480×336 下不需要滚动即可看到全部一级项（可在 CDP 里断言 `scrollHeight <= clientHeight`）；③ 静音/音量/PTT/改名/复位/保存均可在产品壳内触达且有反馈；④ 发布构建 grep 不到“完整面板（开发/E2E）”；⑤ 原有 `ui-shell.test.ts` 的 ARIA/焦点/roving/Esc/consent 断言保持绿，新增菜单 IA 快照测试（项数/顺序/dev 项不存在）。

### 第二件：错误恢复与关闭行为闭环（R3 + P1-2，约 0.5–1.5 人日）

- **做什么**：损坏存档选择面板（保存新档/从备份/删除重来）；删除存档清 `saveRecoveryNeeded`；退出 `saveNow()` + 失败确认；菜单在窗口 `blur`/点到窗外时关闭；菜单/内容中心开关时主动同步 hit-region（或菜单打开时整窗命中）。
- **验收**：① fake IPC 单测覆盖“损坏→保存成功→标志清除”“删除→标志清除”“退出保存失败→窗口不关”；② 真机/浏览器：右键菜单打开后点桌面空白→菜单关闭；③ 打开/关闭菜单 ≤1 帧内命中表更新（可用 `__pet` QA 快照/日志验证）；④ autosave 在恢复后恢复。

### 第三件：设置/内容窗口 + 托盘（R4，约 2–4 人日 + Windows）

- **做什么**：新增可缩放设置窗口（>720×560，普通装饰，任务栏可见），把内容中心、工具页、设置字段迁入；桌宠窗保持透明；加托盘（打开/复位/设置/退出）与 single-instance。
- **验收**：① 内容中心在 ≥720×560 下无横向裁切、正文 ≥12px；② 托盘可打开桌宠/复位/退出，托盘退出与菜单退出一致走保存；③ 宠物拖出屏幕后可用托盘复位；④ 第二次启动不产生第二个实例；⑤ ACL/capabilities/CI/安装器回归，Windows 实机截图 + E2E（窗口创建/关闭/焦点/托盘）留证；⑥ 若暂不能加窗口，至少不能把“内容中心在 480 窗内”作为完成态。

> 如果只能做一件：做第一件。它不改窗口架构、当天能看到体验变化，并且能立刻暴露“哪些控件用户真的需要”（为第三件的设置 IA 提供依据）。

## 10. 未验证 / 风险 / 如何验证

| 项 | 状态 | 验证方式 |
|---|---|---|
| Tauri 真机菜单/窗口/穿透/托盘/DPI | **未验证**（本轮只读，无 Windows GUI） | 构建 release exe，按 `docs/verification/UI-WINDOW-2026-11-18.md` 的探针方法重跑；补托盘/复位/单实例用例 |
| `window.open` 在 Tauri 打包版的行为 | **静态高置信但未实测**（历史审计 + capabilities 静态） | 在打包版点击“模型/API Key 设置…”与“导入…”，记录是否新建窗口/是否导航/失败提示；必要时用 `WebviewWindow` 或同窗导航替代 |
| 菜单实际高度/滚动 | **静态推导**（样式下限 + 条目数） | CDP：`#pet-shell-menu` 的 `scrollHeight/clientHeight`、2×/A+/A−/长角色名矩阵截图 |
| 菜单打开后点到窗外是否关闭 | **静态推断**（无 blur 监听 + 穿透区不触发 pointerdown） | 真机：打开菜单→点桌面空白→截图；浏览器用 CDP 模拟 `window.blur` |
| Shift+F10/右键在内容中心后打开菜单 | **静态推断**（menuBlocked 只看 consent；hub 只 inert #pet-app） | CDP：打开内容中心→按 Shift+F10/右键→断言菜单 `data-state`/焦点 |
| 字号 A−/A+ 对内容中心无效 | **静态可证**（CSS 固定 px vs `--ui-scale`） | CDP：把 `--ui-scale` 改 1.6，读取内容中心 computed font-size |
| 插件在 DSH 内的布局/焦点 | **未实测**（需运行中的 DSH Web UI） | 在 3081 刷新插件后，用键盘/读屏走四面板 + 内容中心；记录焦点落点/面板裁切 |
| UX 可用性（首用/发现性/菜单层级） | **未做真人测试** | 5–8 人 playtest：只给宠物窗，观察“如何打开菜单/静音/换角色”任务完成时间与卡点；用 playtest-kit |

**另外两个风险**：① 并发工作树正在改 `content-hub/main/pet.css`，本文行号会漂移；合入前应以函数名/选择器复核。② 不要为了“精简菜单”删掉法律/同意入口——本项目 TOS/数据控制是硬要求，只能换层级不能消失。

## 11. 与已有审计的关系（哪些已修/仍缺）

- **已修**：菜单 ARIA/键盘/焦点/Escape/Trigger（`UI-SHELL-FIX-2026-11-17` 记录已落地，本文复核仍在）；缩放 label/首启 2×；hero 占位状态；Advisers 状态/重试；内容中心 dialog + Tab 陷阱 + 市场诚实占位（`content-hub.ts` 实现，测试覆盖）。
- **仍缺/新增**：本次 P0-1~P0-4、P1-1~P1-10、P2 各条；`UI-SHELL-FIX` 自己列出的“未拆分设置/关于（U6）”“无菜单图标/子菜单（U5/IA 未做）”“面板硬切”仍然成立（`docs/audit/UI-SHELL-FIX-2026-11-17.md:34-41`）。
- **已过时**：`UI-DEFAULTS-GAP-AUDIT` 的 0/91 资产结论、`MASTER-STATUS` 的默认启动页/无 About 等部分描述、`HANDOFF-2026-11-15` 全文状态数字。建议在真值文档里标注“历史，不可作为现值”。

## 附录 A：关键证据索引（快照 2026-11-19T12:59+0800，HEAD 779354b，工作树脏）

| 证据 | 位置 | 用途 |
|---|---|---|
| 菜单全部条目 | `src/pet/desktop-shell.ts:607-713` | P0-1/P0-2/§5.2 |
| 菜单打开/关闭/键盘/点外 | `src/pet/desktop-shell.ts:479-535,725-794,845-882` | P0-1/P1-2/P1-4 |
| 菜单样式（230px/328px/18px） | `src/pet/pet.css:438-486` | P0-1 |
| 桌面壳隐藏 header/aside | `src/pet/pet.css:351-352` | P0-2 |
| 隐藏控件清单 | `pet.html:63-90`（`:71` PTT、`:72` 静音、`:73` 保存、`:76` 复位） | P0-2 |
| 触发器 22×22/.55 | `src/pet/pet.css:402-427`、`pet.html:108` | P1-6/§5.6 |
| `?shell=window` 单向门 | `src/pet/desktop-shell.ts:447-455,712`、`src/pet/pet.css:428` | P0-2 |
| 窗口 flags | `app/tauri/src-tauri/tauri.conf.json:15-26`；`src/main.rs:857-916` | P0-4/P1-1 |
| Rust 命中轮询 | `app/tauri/src-tauri/src/main.rs:84-128` | P1-2 |
| 前端命中矩形/10Hz | `src/pet/hit-regions.ts:15-30,200-227` | P1-2 |
| 存档损坏标志/autosave/提示 | `src/pet/main.ts:1734,1775,2139-2148,2173-2179` | P0-3 |
| 删除存档不清标志 | `src/pet/main.ts:2041-2062` | P0-3 |
| 退出不保存 | `src/pet/desktop-shell.ts:713`；`src/pet/main.ts:2347,3307-3323` | P0-3 |
| 设计要求的退出保存 | `docs/DESKTOP-PET-UX-2026-11-16.md:98,206,226` | P0-3 |
| 工具页入口 | `src/pet/desktop-shell.ts:368-400`；`src/pet/main.ts:3165-3168,3226-3229`；`setup.html:150`、`chat-import.html:43` | P1-3 |
| 工具页设计 | `docs/DESKTOP-PET-UX-2026-11-16.md:101-104` | P1-3 |
| 内容中心 tab/尺寸 | `src/pet/content-hub.ts:107-112`；`src/pet/pet.css:1000-1015,1057-1066` | P1-1 |
| 内容中心键盘/焦点 | `src/pet/content-hub.ts:2180-2204,2214-2267` | P1-4 |
| 固定字号清单 | `src/pet/pet.css:953-955,1017-1268` vs `:394,485,500,584-663` | P1-5 |
| composer 结果卡/行为 | `src/pet/desktop-shell.ts:1232-1244,1353-1489` | P1-10 |
| 输入设计建议 | `docs/research/INPUT-MODALITY-2026-11-17.md:64-69,90-91` | P1-6/P1-10 |
| 托盘/召回研究 | `docs/research/INPUT-TECH-FEASIBILITY-2026-11-17.md:36,41-48` | P0-4 |
| 插件 4 按钮/面板 | `plugins/dsh-famling/client.js:901-1025` | P1-8 |
| 插件面板键盘/锚点 | `plugins/dsh-famling/client.js:596-604,640-647` | P1-8/§5.7 |
| 插件错误处理 | `plugins/dsh-famling/client.js:789-848`；`index.js:188-256` | P1-9 |
| 插件内容中心失败文案 | `plugins/dsh-famling/client.js:350,938-961` | P1-9 |
| 命名漂移 | `pet.html:10,32`；`desktop-shell.ts:607,1077`；`tauri.conf.json:16`；插件 `README.md:5,21` | §5.3 |
| 文档 IA 漂移 | `README.md:3`；`docs/design/CONTENT-MARKET-2026-11-19.md:245-269` vs `:523-602`；`HANDOFF-2026-11-15.md` 全文 | §5.4 |
| CI 无 UI/E2E 门 | `.github/workflows/ci.yml`（仅 typecheck/test/build/validate；Windows job 不构建 Tauri；无浏览器/CDP UI job） | 回归风险 |

## 附录 B：评审中使用的主要命令（只读）

```sh
cd /mnt/d/Projects/dsh/desktop-games
git rev-parse --short HEAD && git status --short && git diff --stat
md5sum src/pet/{desktop-shell,main,content-hub,hit-regions}.ts src/pet/pet.css
wc -l src/pet/{main,desktop-shell,content-hub}.ts
grep -n "addHeading|add(" src/pet/desktop-shell.ts
grep -n "max-height|font-size: calc|aside.panel" src/pet/pet.css
grep -n "TrayIcon|tray|global_shortcut" app/tauri/src-tauri/src/*.rs app/tauri/src-tauri/Cargo.toml
grep -rn "window.open" src/pet/main.ts src/pet/desktop-shell.ts
grep -n "saveRecoveryNeeded|beforeunload|is_fullscreen|setAlwaysOnTop" src/pet/main.ts src/pet/desktop-shell.ts
cd /mnt/d/Projects/dsh/plugins/dsh-famling && grep -n "menu|面板|role=|window.innerWidth" client.js
```

未运行：`npm test`、`npm run typecheck`、`npm run build`、Tauri 构建、浏览器 E2E、真人测试（均为只读评审的边界；见 §10）。

## 附录 C：一页备忘（给后续实现者的最短上下文）

1. 用户只看到：**宠物 + 一个 22px 的 ⋯**；右键/Shift+F10 打开菜单。
2. 菜单是**唯一**设置面：23 项、要滚动、混着法律/开发/退出。
3. 内容中心是**最大**的新功能，但只有 456×309 的显示面积、8–11px 字。
4. 存档损坏时会叫用户点一个**不存在**的“保存”。
5. 宠物可以拖出屏幕，**没有托盘/复位**能救回来。
6. 修的顺序：**先让菜单变短、让控件可达（R1+R2）→ 再修恢复/保存（R3）→ 最后上设置窗+托盘（R4）**。

—— 评审结束。本文不构成对 Tauri/Windows 实机行为的保证；所有静态推断已在 §10 标注验证方式。

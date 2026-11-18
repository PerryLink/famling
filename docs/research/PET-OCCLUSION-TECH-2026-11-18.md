# 透明桌宠点击穿透/遮挡技术方案研究（Tauri v2 + WebView2）

- 日期：2026-11-18
- 任务：task-32（研究文档；**不改代码/JSON/资产**）
- 目标产品：famling / desktop-games（私有仓）与 dsh-famling（DSH 插件）
- 结论状态：推荐方案按「当前源码 + WebView2/Tauri/Win32 公开文档与源码 + 同类实现」交叉验证；**Windows 实机未在本会话复现**（本会话运行在 Linux/WSL），实机验证矩阵见 §10。

---

## 0. 结论速览（TL;DR）

**一句话**：Tauri v2 + WebView2 没有官方的「逐像素点击穿透」API；可行且成本最低的路线是「**把逐帧 alpha 轮廓变成小矩形集合上报给 Rust，由 Rust 用局部轮询切换整窗 ignore**」，同时修掉当前实现里的三个结构性缺陷：整块 canvas 矩形、拖动/DPI 变化时的主线程阻塞与层化命中区域不刷新、坐标契约（CSS px + scale_factor）漂移。

### 0.1 核心结论（8 条）

| # | 结论 | 证据 |
|---|---|---|
| 1 | **透明窗口的点击穿透只能是整窗开关**。Tauri 官方明确不打算实现按透明像素自动穿透，建议「on demand 切换 ignore 模式」；Electron 的 forward 备选在 Tauri 仍是未实现 issue（#6164）。 | [tauri#13070](https://github.com/tauri-apps/tauri/issues/13070)、[tauri#6164](https://github.com/tauri-apps/tauri/issues/6164) |
| 2 | WebView2 的**父窗口 WM_NCHITTEST 拿不到**：窗口化宿主里最顶层 WebView 渲染子窗口直接返回 HTCLIENT，消息不冒泡到宿主父窗口；因此「父窗口返回 HTTRANSPARENT」的原生逐像素方案不可行（除非 fork wry / 注入子进程）。 | [WebView2Feedback#446](https://github.com/MicrosoftEdge/WebView2Feedback/issues/446)、[windowed vs visual hosting](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/windowed-vs-visual-hosting) |
| 3 | `UpdateLayeredWindow` 的「alpha=0 像素自动穿透」是 Win32 层化窗口的能力，但**与 WebView2 的 DWM/DirectComposition 合成路径不兼容**；Tauri 的透明是 `SetDefaultBackgroundColor(alpha=0)`，不是逐像素窗口形状。 | [Layered Windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#layered-windows)、[ICoreWebView2Controller2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2controller2)、[wry webview2](https://github.com/tauri-apps/wry/blob/dev/src/webview2/mod.rs) |
| 4 | 当前真正的「大遮挡」来源是**上报了 `#hero-stage`/`#hero-canvas` 整个 192×192 CSS 矩形**：宠物只占画布 alpha 的 17%–41%，画布矩形却有 36,864 CSS px²（占 480×336 窗口的 22.9%），其中约 2.3–2.9 万 CSS px² 是透明却被拦截。 | 仓库测算（§3.1、附录 B） |
| 5 | 推荐用 **pack PNG 的硬 alpha 逐帧生成 2 艺术像素 tile 的矩形 run**：每帧 42–66 个矩形、JSON 约 0.7–1.1 KB；对不透明像素覆盖 100%，多覆盖（透明但可点）仅约 5%–13% of opaque，折合 <1% 窗口面积；**不要运行时 getImageData**（GPU readback、DPR 粒度漂移、taint 失败后宠物会整体不可点）。 | 本机实测（附录 B）、[MDN getImageData](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData) |
| 6 | 拖动/移动后的「旧位置/经过位置仍遮挡」有至少两类独立根因：① **带层化样式的窗口的 hit-test region 不随 SetWindowPos/DPI 自动刷新**（同类 WebView2 框架 Wails 的两个真实修复：移动/缩放后要 `SetLayeredWindowAttributes` 刷新 region）；② **拖动期间主线程在 OS 模态移动循环里，Tauri getter 会同步等主线程回包，poller 会卡住**，状态在拖动期间冻结。两者都要修，不能只归因于 250ms 定时。 | [wails#5229](https://github.com/wailsapp/wails/pull/5229)、[wails#5371](https://github.com/wailsapp/wails/pull/5371)、[tao window.rs](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/windows/window.rs)、[tauri-runtime-wry](https://docs.rs/tauri-runtime-wry/latest/src/tauri_runtime_wry/lib.rs.html) |
| 7 | 坐标契约应改为「**物理客户区像素 + dpr**」：JS 上报已乘 dpr 的矩形；Rust 用 `GetClientRect` + `ClientToScreen` 直接取客户区原点，不再调用会阻塞的 `inner_position()`；这样 100%–200% DPI、多屏负坐标、DPI 切换都走同一套公式。当前 CSS px + `scale_factor()` 在跨屏/拖动瞬间有偏差窗口。 | [GetCursorPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcursorpos)、[High DPI](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows)、[tauri inner_position](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/window/mod.rs) |
| 8 | 主要剩余风险不在算法，而在 **WebView2 Runtime 透明回归**（144.x 幽灵标题栏、154.x alpha=0 背景失效）与 **Windows 实机拖拽/DPI 行为**；必须用目标 Runtime 版本 + Windows 实机自动化探针验收，并保留「精度降级但仍可点」的回退。 | [WebView2Feedback#5492](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5492)、[WebView2Feedback#5752](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5752)、[tauri#14764](https://github.com/tauri-apps/tauri/issues/14764) |

### 0.2 最高优先级的 3 个动作（建议直接排期）

1. **先做可观测性与契约（0.5–1 人日）**：加 Rust debug 探针（cursor/客户区原点/尺寸/dpr/WS_EX 样式/regions/inside/最近一次更新时间）+ 前端 `?hitdebug=1` 区域叠加；窗口配置补 `visible:false` 并在第一份 regions 到达后再 `show()`（`tauri.conf.json` 当前没有 visible 字段，见 `app/tauri/src-tauri/tauri.conf.json:18-27`）。用探针先判定「旧位置遮挡」是**视觉残影**还是**命中残留**——两者修法不同（§3.6）。
2. **把 hero 命中从「整块 canvas」换成「pack alpha 逐帧 tile 矩形」（1–2 人日）**：构建期从 68 帧 PNG 硬 alpha 生成每帧 tile=2 art px 的矩形 run（或运行期由同一 PNG 解码一次、缓存），映射时处理 scale/flip/translate/dpr；保留「取不到 mask → 回退 actor bbox 矩形」的降级（当前未提交草稿在 getImageData 失败时回退为空数组，会让宠物整体不可点，必须修）。透明拦截面积预期从 36,864 CSS px² 降到约 7.7k–14.1k CSS px²（按角色），减少约 62%–79%。
3. **拖动/DPI 稳定性 spike（1–2 人日）**：Rust poller 改 Win32 原生几何（`GetClientRect`/`ClientToScreen`，不经过 Tauri 主线程派发）；几何变化时按 Wails 经验在 layered 状态下调用 `SetLayeredWindowAttributes` 刷新命中区域；轮询 16ms（靠近窗口）/50ms（远离）自适应；写 Windows E2E 探针脚本（`SetCursorPos` + `SendInput` + `GetWindowLongPtr` + 下层 click-sink 窗口）复现拖动前后旧位置/新位置点击去向。

### 0.3 推荐方案一句话版

**JS 产出「当前帧可点区域（物理客户区 px，含 DOM 控件与模态整窗）」→ IPC 只在小矩形集合变化时发送（≤24 Hz）→ Rust 线程 8–16ms 读全局光标，用原生 Win32 客户区原点换算，命中则 `set_ignore_cursor_events(false)`，否则 `true`；拖动期间 poller 不依赖 Tauri 主线程；窗口移动/DPI 变化后刷新 layered 命中区域。**

---

## 1. 任务、范围与方法

### 1.1 问题清单（本报告要回答）

1. Tauri v2 + WebView2 透明 always-on-top 窗口能否做逐像素/区域级点击穿透？各方案的边界与代价？
2. 现状 `src/pet/hit-regions.ts` 上报整块 `#hero-stage`/`#hero-canvas` 矩形造成透明区挡点击，最小改动如何做到「透明像素穿透、角色可点」？
3. 「拖动窗口后旧位置/经过位置仍可能遮挡」的根因是什么？移动/缩放/DPI 变化/多屏负坐标/镜像（sprite flip）分别如何处理？
4. 性能预算、兼容性、测试方法与风险，以及可落地的实施步骤。

### 1.2 范围外（明确不做）

- 不改任何产品代码、JSON、资产；不实现，只给方案与验收标准。
- 不做 macOS/Linux 的完整方案（产品当前 Windows-only；仅给降级说明）。
- 不研究「如何让窗口不置顶/不遮挡视觉」的产品取舍（属于 UX/产品决策）。

### 1.3 证据分级（全文标注）

| 标记 | 含义 |
|---|---|
| [仓] | 本产品仓源码/配置/测试，路径+行号可复核 |
| [实测] | 仓库内已记录的 Windows 实机测量（`docs/verification/UI-WINDOW-2026-11-18.md`）或本会话本机微基准 |
| [公开] | 官方文档/官方源码/官方 issue（链接见 §13.3） |
| [同类] | 其它 WebView2/Tauri/Electron 框架与项目的实现或修复记录（外部数据，只作交叉证据） |
| [推断] | 由源码/文档推导、尚未在本机 Windows 复现的结论（已标注置信度） |

### 1.4 方法与限制

- 源码：通读 `hit-regions.ts`、`main.ts` 拖动/热区路径、`hero-runtime.ts` canvas/DPR、`desktop-shell.ts` 拖窗、`app/tauri/src-tauri/src/main.rs` poller、`tauri.conf.json`。
- 公开资料：Tauri 2.x/tao/wry 源码、Microsoft Win32/WebView2 文档、同类框架（Wails/Electron）修复记录与项目实现。
- 数据：用 Node 24 解码 204 张 96×96 PNG（dog/cat/human 各 68 帧），统计 alpha 占用、tile 矩形数量/覆盖误差；在 Node 里对 tile 生成做微基准。**这些数字是本机 Linux/Node 的算法侧数据，不代表 Windows/WebView2 端到端**。
- 限制：本会话不能启动 Windows GUI（WSL/Linux），所以「拖动旧位置」「DPI 切换」「WebView2 版本回归」都只能给出**根因假设 + 可执行验证脚本 + 验收判据**，不能给出实机 pass/fail。

---

## 2. 现状复核

### 2.1 窗口与渲染栈

| 项 | 当前值 | 证据 |
|---|---|---|
| 窗口 | 逻辑 480×336、`transparent:true`、`decorations:false`、`shadow:false`、`alwaysOnTop:true`、`focus:false`、`skipTaskbar:true`、`resizable:false` | `app/tauri/src-tauri/tauri.conf.json:18-27` [仓] |
| 初始可见性 | **没有 `visible:false`**（审计已点名；窗口会先以可交互状态出现，直到首份 regions 到达） | 同文件；`docs/audit/NONART-RUNTIME-AUDIT-2026-11-17.md:33` [仓] |
| 透明实现 | WebView2 窗口化宿主（`ICoreWebView2Controller`）+ `SetDefaultBackgroundColor` alpha=0；页面/`body` 在 desktop 壳下透明 | `wry/src/webview2/mod.rs` [公开]；`src/pet/pet.css:327-334` [仓] |
| 实测 DPI | Windows 150% → 窗口 `RECT=1828,1084,720×504` 物理像素（480×336 CSS） | `docs/verification/UI-WINDOW-2026-11-18.md:10-17` [实测] |
| 渲染 | hero canvas backing = `round(layout×devicePixelRatio)`，CSS 尺寸 = layout；context 按 dpr 变换；指针坐标保持 CSS px | `src/pet/hero-runtime.ts:1184-1193` [仓] |
| 角色画布 | 96×96 art px，打包显示 `display.scale=2`（默认显示 192×192 CSS） | `public/characters/pet-dog/character.json:13-15,34-35` [仓] |

> 关键含义：本产品不是「原生层化逐像素窗口」，而是「普通 DWM 合成窗口 + WebView2 透明背景 + 运行时切换 `WS_EX_TRANSPARENT|WS_EX_LAYERED`」。因此 Win32 层化窗口的「alpha=0 自动穿透」能力**不能直接使用**（详见 §4.2–§4.4）。

### 2.2 现行点击穿透链路

| 层 | 行为 | 证据 |
|---|---|---|
| JS 收集 | 每 250ms 遍历 `HIT_SELECTORS`，对 `#pet`/`.fold-pet`/**`#hero-stage`/`#hero-canvas`**/菜单/composer/结果卡/各 dialog 取 `getBoundingClientRect`（CSS px），裁剪到视口；任一大 dialog 覆盖 ≥70% 时上报整窗 | `src/pet/hit-regions.ts:15-33,137-178` [仓] |
| JS 同步 | 签名变化才 `invoke('set_pet_hit_regions', { regions })`；启动时立即跑一次，之后 `setInterval(tick, 250)`；失败静默 | `src/pet/hit-regions.ts:180-206`；`src/pet/main.ts:1491` [仓] |
| Rust 接收 | `set_pet_hit_regions(Vec<[f64;4]>)` 存 Mutex + ready 标记 | `app/tauri/src-tauri/src/main.rs:20-31,610` [仓] |
| Rust 轮询 | 后台线程每 **60ms**：`GetCursorPos`（物理屏幕）→ `window.inner_position()`（物理客户区原点）→ `window.scale_factor()` → 换算 CSS 坐标 → 任一矩形包含则 `inside=true` → 状态变化才 `set_ignore_cursor_events(!inside)` | `app/tauri/src-tauri/src/main.rs:37-70,457` [仓] |
| OS 语义 | tao 的 `IGNORE_CURSOR_EVENT` 只把扩展样式切到 `WS_EX_TRANSPARENT|WS_EX_LAYERED`；移除时两 bit 一起去掉 | `tao/.../window_state.rs` [公开]；实测样式见 `UI-WINDOW:12-17` [实测] |

实测样式（Windows 150%，公开仓同源码构建）：

- 窗口内空白处（ignore ON）：`0x000C0138`，含 `WS_EX_TRANSPARENT 0x20` + `WS_EX_LAYERED 0x80000`。
- 宠物中心（ignore OFF）：`0x00040118`，不含 0x20/0x80000。

这正好印证 tao 的实现：**每次「可点↔穿透」切换都会同时切换 `WS_EX_LAYERED`**，不是只切 `WS_EX_TRANSPARENT`（后者才是很多 Win32 项目的稳定做法，见 §5 与 AtomUI 实现说明）。

### 2.3 缺陷清单（按影响排序）

| ID | 症状 | 根因（本报告判断） | 证据/置信度 |
|---|---|---|---|
| D1 | 宠物周围大片「空气」点不到桌面 | 上报 `#hero-stage`/`#hero-canvas` 整块 192×192 矩形；画布内 alpha 只占 17%–41%，其余透明像素在矩形内仍拦截 | [仓]+本机测算；**高** |
| D2 | 拖动后旧位置/经过位置仍会吞点击（或被判定穿透） | ① 移动后 layered 命中区域不自动刷新（同类 Wails 修复记录）；② 拖动期间主线程在 OS 移动循环，poller 的 `inner_position()` 同步等回包而卡住；③ 60ms 轮询 + 状态变化才切换 | [公开]/[同类]/[推断]；**中高**（需实机探针区分，见 §3.6） |
| D3 | 跨 DPI/多屏拖动后点击位置偏移 | CSS px + `scale_factor()` 换算与 WebView2 的 dpr/窗口 scale 在切换瞬间可能不同步；`inner_position` 返回的是客户区原点（decorations=false 下≈窗口原点，未来改配置会错） | [公开]+[推断]；**中** |
| D4 | 宠物动画快帧时热区与画面不完全一致 | 区域 250ms 采样 vs 动画 4–24fps；帧间肢体/尾巴移动时区域滞后 | [仓]；**高**（影响小） |
| D5 | 首次启动/重新加载时短暂整窗拦截 | `tauri.conf.json` 无 `visible:false`；首份 regions 到达前 Rust 没有 ready 数据（窗口默认不 ignore） | [仓]；**高**（窗口生命周期问题） |
| D6 | 层化切换可能带来视觉抖动/残影 | 运行时反复切换 `WS_EX_LAYERED`；WebView2 透明窗在 drag/focus 有 ghost titlebar 回归记录 | [公开] `tauri#14764`、`WebView2#5492`；**中** |
| D7 | 失败时宠物可能整体不可点 | 未提交草稿在 `getImageData` 失败/上下文异常时返回空数组，而 `#hero-stage`/`#hero-canvas` 已从选择器移除 → 无热区 | `src/pet/hit-regions.ts` 工作区 diff（§2.4）；**高**（如照此提交） |
| D8 | 无诊断信息，实机问题无法定位 | 静默 catch；无样式/坐标/耗时探针；失败不可观测 | [仓]；**高**（工程问题） |
| D9 | 全屏 dialog 期间整窗可点是正确的；但关闭瞬间到下一份 regions 之间可能短暂保留整窗 | 250ms 定时 + 签名去重时序 | [仓]；**低** |
| D10 | 非 Windows 无降级路径 | poller 只在 `#[cfg(windows)]` 实现，其他平台空函数；`set_ignore_cursor_events` 本身跨平台可用但未接 | [仓]；**低**（产品 Windows-only） |

### 2.4 工作区未提交的 alpha-tile 草稿（必须评估）

> 状态：本会话开工时工作树已有未提交修改（`git status`：`M src/pet/hit-regions.ts`、`?? tests/hit-regions.test.ts` 等），不是本任务写的；本任务只读评估。行号以工作区为准。

草稿做了什么：

- 从 `HIT_SELECTORS` 移除 `#hero-stage`/`#hero-canvas`；新增 `opaqueTilesFromAlpha(data,width,height,tile=8,alphaMin=8)`，按行把有 alpha 的 tile 合并成矩形 run（`src/pet/hit-regions.ts:53-90`）。
- 新增 `collectHeroOpaqueRegions`：对 `#hero-canvas` 做 `getContext('2d',{willReadFrequently:true})` + `getImageData(0,0,w,h)`，8 个 backing px 一格，映射到 CSS 后按 `canvas.dataset.heroFlip` 水平镜像（`:92-135`）。
- 每 250ms 与 DOM rects 合并上报；新增 4 个单元测试（`tests/hit-regions.test.ts`，未提交）。

评价：

| 维度 | 评价 |
|---|---|
| 方向 | **正确**：用真实 alpha 收缩矩形，确实能消掉画布内大部分透明拦截；测试也补上了 tile run 的基本不变量。 |
| 数据源 | **不推荐**：运行时 `getImageData` 有 GPU→CPU readback 成本；`willReadFrequently` 只是 hint，已存在的 2D context 可能不生效；如果 canvas 被 taint（未来跨源资源/插件资源）会抛异常。 |
| 失败模式 | **危险**：异常/取不到 canvas 时 `return []`，而整块 canvas 选择器已被移除 ⇒ hero 模式下宠物完全不可点。应回退到 actor bbox 或恢复 canvas 矩形。 |
| 时序 | 250ms 采样 vs 动画 24fps：快帧（attack 42ms/帧）热区最多滞后 250ms；建议改为按「帧变化」更新（区域计算本身只要 ~0.03ms）。 |
| 坐标 | 8 backing px 的 tile 在 150% DPI 下 = 5.33 CSS px，200% 下 = 4 CSS px，粒度随 DPR 漂移；且仍用 CSS px 契约，未解决 D2/D3。 |
| 覆盖 | 只处理 hero canvas；`.fold-pet` 的透明圆角、菜单/面板的 padding 仍是矩形级；不影响正确性，但可再收敛。 |
| 结论 | **可保留作为 Phase 0.5 的过渡**（若需要立即降低遮挡），但正式方案应换成「pack PNG 硬 alpha 的逐帧 mask + 构建期/加载期一次解码」，并补 bbox 回退与拖动/DPI 修复。 |

### 2.5 与既有文档/审计结论的关系

- `docs/DESKTOP-PET-UX-2026-11-16.md:95` 原始设计写的是 `SetWindowRgn` + `CreateRectRgn` 做「命中裁剪」；落地时改成了 `set_ignore_cursor_events` 轮询（`docs/verification/UI-WINDOW-2026-11-18.md:8`）。两种路线的取舍见 §5.4/§5.5。
- `docs/research/MULTI-CHARACTER-RUNTIME.md` 已判断「逐像素只有原生 region 或轮询切换两条路；轮询有延迟与快速点击竞态，MVP 不建议」；本报告补充：**在已有 60ms 轮询 + UI 矩形的基础上，alpha 区域化是收益/成本比最高的一步**，并给出可控的延迟预算与测试方法。
- `docs/verification/UI-WINDOW-2026-11-18.md:52` 明确残留风险「透明窗口逐像素 alpha 命中未做（矩形内透明像素仍会拦截）；如需更精细可后续用 canvas alpha hitTest」——本报告把它展开成可实施规格。
- `docs/audit/CODE-256-AUDIT-2026-11-17.md:10,74`、`docs/audit/NONART-RUNTIME-AUDIT-2026-11-17.md:33` 已记录「点击穿透 0 行/无 visible:false」等历史缺口；本报告只处理其残留的精度与拖动问题。
- `docs/research/INPUT-TECH-FEASIBILITY-2026-11-17.md:37` 提到「固定/验收 WebView2 runtime 版本；穿透与 region 命中裁剪二选一」——本报告结论是**不做原生 region，只用 ignore 切换 + alpha 区域**，并把 runtime 版本矩阵列入验收（§9）。

---

## 3. 根因分解

### 3.1 主因：上报整块画布矩形（D1）

用 204 帧真实 PNG 统计（dog/cat/human 各 68 帧、96×96、硬 alpha）：

| 指标 | dog | cat | human |
|---|---|---|---|
| 单帧 alpha 占画布比例 | 28.4%–31.9% | 34.0%–37.3% | 16.9%–21.0% |
| 2 art px tile 覆盖 / 不透明面积 | 1.051–1.099 | 1.062–1.095 | 1.077–1.129 |
| 2 art px tile 覆盖 / 画布面积 | 30.3%–35.0% | 35.6%–41.0% | 18.1%–25.1% |
| 单帧矩形数（tile=2） | 43–60（均 49.3） | 46–66（均 56.0） | 42–66（均 50.2） |

换算到当前桌面壳（显示 scale=2，画布 CSS 192×192 = 36,864 CSS px²；窗口 480×336 = 161,280 CSS px²）：

| 项 | 数值 | 占窗口 |
|---|---|---|
| 当前上报的 canvas 矩形 | 36,864 CSS px² | 22.9% |
| tile=2 alpha 区域（dog/cat/human） | 11,872 / 14,120 / 7,704 CSS px² | 7.4% / 8.8% / 4.8% |
| 其中「本可穿透却被挡」的透明部分 | 22,744–29,160 CSS px² | 14.1%–18.1% |

结论：**只要把 hero 热区从整块矩形换成 alpha 区域，遮挡面积就减少约 62%–79%；这一步与拖动/DPI 修复正交，风险最低、收益最大。**

### 3.2 轮询切换模型的固有粒度（D2/D4）

现行模型的时间常数：

| 环节 | 周期/代价 | 影响 |
|---|---|---|
| JS 区域采样 | 250ms | 动画/布局变化后热区最多滞后 250ms |
| Rust 光标轮询 | 60ms | 光标从透明区进入不透明区后，最多 60ms 才切到「可点」；这期间点击会穿透到桌面（宠物丢点击） |
| 状态变化才切换 | 0 | 没有抖动过滤，边界抖动会反复切样式 |
| IPC invoke | 未测（Windows IPC 通常 0.1–1ms 级） | 250ms 一次，可忽略 |

**丢点击是这套方案的固有代价**，不是 bug。缓解手段：缩短轮询间隔（16ms，靠近窗口时）/把 alpha 区域略微膨胀（tile=2 本身已膨胀约 4 CSS px @2x）/在 QA 里量化丢点击率（§10）。不要为了消除丢点击去装全局鼠标钩子（§5.6）。

### 3.3 拖动期间的模态循环阻塞（D2②）

源码级链条：

1. `start_dragging()` 在 tao 的实现是 `handle_os_dragging`：先 `ReleaseCapture`，再 `PostMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, ...)`（`tao/src/platform_impl/windows/window.rs`）。
2. `WM_NCLBUTTONDOWN` 交给 `DefWindowProc` 后，系统进入**模态移动循环**（Microsoft 文档：「DefWindowProc ... performs the appropriate action」；实际表现为主线程停在移动循环里，直到松开鼠标）。
3. Tauri 的窗口 getter 从非主线程调用走 `send_user_message` + `rx.recv()` 同步等主线程回包（`tauri-runtime-wry` 的 `getter!` 宏）。拖动期间主线程在模态循环里，poller 线程调用 `window.inner_position()` / `window.scale_factor()` 就会**卡住**。
4. poller 卡住期间 `set_ignore_cursor_events()` 不会执行（它本身也是 `send_user_message`，从后台线程排队）；拖动结束后才恢复。
5. `start_dragging` 本身是 `send_user_message`（fire-and-forget），命令返回不代表 OS 移动循环结束；因此 `main.ts:1844` 的 `.finally` 里发 `drag.end`/`land` 的时机**可疑地偏早**（值得单独修；不要依赖它作为「拖动结束」信号）。

待验证：拖动期间 poller 是否只是「卡一次」还是每 tick 都卡、恢复后是否按最新位置立即纠正（§10 的探针脚本可回答）。

### 3.4 层化命中区域不随移动/缩放刷新（D2①，最可能解释「旧位置」）

同类 WebView2 框架 Wails 的两个修复记录直接命中这个现象：

- `wails#5229`：透明无边框窗口的 `WS_EX_TRANSPARENT` 让父窗口 WM_NCHITTEST 返回 HTTRANSPARENT；子 WebView2 在初始尺寸覆盖客户区时正常，**拖动放大后新暴露区域点击穿透**（命中区域/子窗口尺寸竞态）。
- `wails#5371`：**「WS_EX_LAYERED 窗口的 hit-test region 不会被 SetWindowPos 单独更新；必须调用 SetLayeredWindowAttributes 刷新」**；不刷新时「region 冻结在创建尺寸，扩大后的区域永久穿透」。DPI 变化分支同样要刷新。

本产品在 `ignore=true` 时正是 `WS_EX_LAYERED`，移动/DPI 变化由 tao/Tauri 调 `SetWindowPos`；在 tao 的样式实现与 Tauri 的调用路径中未观察到对应的 layered region 刷新逻辑（目标版本需复核）。**这可以解释「拖动后旧位置/经过位置的命中残留」**：region 冻结在旧位置/旧尺寸时，点在旧位置仍可能命中该窗口（吞点击），而新位置的部分区域反而穿透。

> 置信度：**中高**。同类实现的修复逻辑可复用，但必须在本产品 Windows 实机上用探针复现确认（§3.6、§10）。

### 3.5 坐标、DPI、多屏与镜像

当前 Rust 公式（`main.rs:56-63`）：

```text
x_css = (cursor_phys.x - inner_position_phys.x) / scale_factor
y_css = (cursor_phys.y - inner_position_phys.y) / scale_factor
hit = 任一 region 满足 x_css∈[x0,x2] 且 y_css∈[y1,y3]
```

该公式成立的前提（任一不成立就会出现「热区错位」）：

1. `GetCursorPos` 返回**物理**屏幕坐标（要求进程 per-monitor DPI aware；非 aware 会被虚拟化，高 DPI 屏上偏移可能达到 1.5–2×）。
2. `inner_position()` 返回**物理**客户区原点（`tauri/src/window/mod.rs` 的文档如此；decorations=false 时客户端=窗口，所以当前恰好对）。
3. `scale_factor()` 与 JS 的 `devicePixelRatio` 在**同一时刻**一致（跨屏拖动/系统缩放变化时可能短暂不同步）。
4. JS 的 region 是 CSS px，且视口就是窗口客户区（当前成立：无浏览器缩放/无页面 transform；但 hero canvas 自身有 translate/scale，见 §7.2）。
5. 圆整策略一致：JS 用 `floor/ceil` 裁剪，Rust 用 `>=/<=` 闭区间；边界会有 ±1px 的归属差，一般可接受。

主要风险点：

- **跨屏 DPI 切换瞬间**：`scale_factor` 与 `dpr` 更新时序不同 → 热区整体偏移约 (旧scale-新scale)×距离；在 150%→100% 时最明显。
- **多屏负坐标**：只要两端都用物理屏幕坐标，减法本身对负坐标安全；要求不假设原点为正。
- **镜像（sprite flip）**：`main.ts` 的 roam 路径会设置 `canvas.style.scale = -1 1` 与 `dataset.heroFlip`；热区必须按同一镜像规则映射（§7.2），否则尾巴/头部区域左右颠倒。
- **窗口缩放/布局变化**（例如未来 support `--pet-size`）：CSS 尺寸变化，`scale_factor` 不变，需要重新计算映射。

### 3.6 「拖动后旧位置/经过位置仍遮挡」的根因树与区分实验

这句话至少可能是 4 种不同故障，修复方式不同，必须先分辨：

| 假设 | 现象 | 判定方法（Windows 实机） | 修复 |
|---|---|---|---|
| H-A 视觉残影 | 看到宠物旧影像/幽灵标题栏，但点击去向正常 | 录屏 + 截图对比；`PrintWindow`/屏幕捕获旧位置像素 | 强制重绘、避免拖动中切换 LAYERED、固定/回退 WebView2 runtime（`tauri#14764`、`WebView2#5492`） |
| H-B 命中残留 | 点击旧位置被宠物窗口吞掉；`WindowFromPoint` 指向宠物窗口 | 探针在旧位置采样 `WindowFromPoint` + `GetWindowLongPtr` 扩展样式；对照移动前后 | 移动/DPI 后刷新 layered region（`SetLayeredWindowAttributes`）；必要时强制重建样式 |
| H-C 状态滞后 | 拖动期间/刚松手时点击去向抖动 | 1ms 采样 cursor/client origin/inside/exstyle 的日志（拖拽时戳） | poller 去主线程依赖（原生几何）；拖动结束立即 re-sync |
| H-D 坐标错位 | 热区整体偏一段（大小≈scale×鼠标距），旧位置误命中 | 把光标放到宠物中心，比较客户端坐标与 JS 期望点；切 100%/150% 复测 | 物理 px + dpr 契约；onMoved/onScaleChanged 立即重发 |

### 3.7 其它值得记录的现状问题

- **启动即拦截（D5）**：`tauri.conf.json` 没有 `visible:false`，首份 regions 到达前窗口按默认状态参与命中测试；首启 TOS 弹窗期间故意整窗交互（设计如此），但主界面首帧应等 regions ready。
- **失败静默（D8）**：IPC `.catch(() => {})` + Rust 侧 `let _ =`；实机问题无法定位，必须加探针与计数器。
- **样式切换副作用（D6）**：`WS_EX_LAYERED` 运行时切换影响 DWM 合成路径；WebView2 透明窗在 drag/focus 有 ghost titlebar 回归（`tauri#14764`、`WebView2#5492`），版本矩阵必须覆盖。
- **runtime 版本（§9）**：WebView2 154.x 有「alpha=0 背景被忽略」的 open 回归（`#5752`），144.x 有透明窗幽灵标题栏（`#5492`）；这是产品级风险，不只是技术风险。

### 3.8 待实机验证清单（交给 Windows 负责人）

1. 拖动期间 poller 是否阻塞/阻塞多久（日志时间戳）。
2. 移动窗口后旧位置 `WindowFromPoint` 是否仍返回宠物窗口；`SetLayeredWindowAttributes` 刷新后是否消失。
3. 150%→100%→150% 跨屏拖动后热区是否偏移；`onMoved`/`onScaleChanged` 触发时序。
4. 首份 regions 到达前窗口是否拦截点击（启动瞬间）。
5. 每次 ignore 切换是否引起可见闪烁/残影（录屏逐帧）。

---

## 4. 原理：Windows 命中测试与 WebView2 约束

### 4.1 Windows 的命中测试不是「按像素」的

鼠标消息的目标窗口由系统命中测试决定，链路大致是：

1. `WindowFromPoint` / 系统内部命中测试先找最上层窗口；对层化窗口会看形状/透明度（仅限用 `UpdateLayeredWindow` / `SetLayeredWindowAttributes` 设置的层化窗口）。
2. 找到窗口后发送 `WM_NCHITTEST`；`HTTRANSPARENT` 只对**同一线程**的窗口继续向下传递（Microsoft 文档原文：in a window currently covered by another window in the same thread），跨进程/跨顶层窗口的「穿透」要靠 `WS_EX_TRANSPARENT`（且顶层窗口应与 `WS_EX_LAYERED` 组合，DWM 最佳实践）。
3. 目标若是子窗口（WebView2 的渲染子 HWND），消息不会先问宿主父窗口。

因此「父窗口返回 HTTRANSPARENT 实现逐像素穿透」在 WebView2 窗口化宿主里不成立（§4.4）。

### 4.2 tao 的 `set_ignore_cursor_events` 做了什么

- `tao` 的 `WindowFlags::IGNORE_CURSOR_EVENT` 在 `to_window_styles()` 中映射为 `style_ex |= WS_EX_TRANSPARENT | WS_EX_LAYERED`（`tao/src/platform_impl/windows/window_state.rs`）。
- 也就是说，Tauri 的每一次「穿透开/关」实际是在**同时切换 `WS_EX_LAYERED`**；实测样式 `0x000C0138`（ON，含 0x20/0x80000）与 `0x00040118`（OFF）完全吻合（`docs/verification/UI-WINDOW-2026-11-18.md:12-17`）。
- 对顶层窗口，`WS_EX_TRANSPARENT` 让整个窗口不参与命中测试；`WS_EX_LAYERED` 是 DWM 对顶层透明的推荐组合。代价是：窗口的合成/命中区域进入「层化」路径，移动/缩放/DPI 变化时 Windows 不保证自动刷新命中区域（§4.3）。

### 4.3 层化窗口的命中区域要手动刷新（同类实机证据）

Wails v3 在 Windows 上也是「WebView2 + 透明无边框 + IgnoreMouseEvents」组合，其修复记录：

- `SetWindowPos` 之后：`WS_EX_LAYERED` 窗口的 hit-test region 不会自动更新；需要调用 `SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)` 刷新（`webview_window_windows.go` 的 `setPhysicalBounds` 注释）。
- DPI 变化分支（`WM_DPICHANGED` 直接 SetWindowPos 的路径）也要同样刷新，否则新暴露区域永久穿透（`wails#5371` 的 code review 结论）。
- 另有一个独立教训：不要用 `WS_EX_NOACTIVATE` 实现「不抢焦点」，它会让 WebView2 焦点状态不一致，Win+D/Alt+Tab 后出现「整屏鼠标被吞」；他们改用 `WS_EX_TOOLWINDOW`（`wails#5371`）。

> 这解释了一个反直觉现象：**「窗口移动了，但命中区域还停在旧位置/旧尺寸」**。它既可能表现为旧位置吞点击，也可能表现为新位置点不到（取决于冻结区域与当前窗口的交集）。本产品的 `ignore=true` 状态正是 `WS_EX_LAYERED`，所以这就是「旧位置/经过位置仍遮挡」的头号候选根因。

### 4.4 为什么 WebView2 拿不到「父窗口 WM_NCHITTEST」这条捷径

| 约束 | 事实 | 后果 |
|---|---|---|
| 窗口化宿主 | WebView2 窗口化模式「input 由 OS 发给 WebView2」（Microsoft 文档） | 宿主不能自己决定逐像素输入路由 |
| 子窗口 | 最顶层 WebView 渲染窗口对 `WM_NCHITTEST` 返回 HTCLIENT，消息不进入宿主父窗口（`WebView2Feedback#446`） | 在宿主窗口 WndProc 里返回 HTTRANSPARENT 无效 |
| 跨进程 | WebView2 的渲染/输入窗口在 `msedgewebview2.exe` 子进程中；对它的消息处理无法从宿主安全接管（子类化需要注入，社区 Spy++ 调查与 #446 均指向此结论） | 「子窗口 WM_NCHITTEST 钩子」不可用 |
| 视觉托管 | 视觉托管（Visual/CompositionController）允许宿主通过 `SendMouseInput` 自己送输入，理论上是唯一「完全可控」的原生方案 | Tauri v2/wry 当前是窗口化宿主；切换需要 fork wry / 重写宿主，非本产品量级 |
| 透明背景 | 透明靠 `ICoreWebView2Controller2::put_DefaultBackgroundColor` 的 alpha=0；只有 0/255 两档（半透明不支持） | alpha=0 只影响绘制，**不改变命中测试**；WebView2 甚至有 alpha=0 仍吞点击的 open issue（`#5668`） |

### 4.5 Tauri 官方立场

- `tauri#2090`（Ignore mouse event on transparent areas）已关闭；`tauri#13070`（Transparent Window Support Click-Through）已关闭，维护者评论：**不会实现**，最接近的替代是「on demand 切换 ignore 模式」，并指向 `#6164` 作为「forward 选项」的跟踪 issue。
- `tauri#6164`（给 `setIgnoreCursorEvents` 增加 forward option，对应 Electron 的 `setIgnoreMouseEvents(true, {forward:true})`）**仍 open**。
- 结论：不要等官方逐像素方案；在现有 API 上做「区域 + 轮询切换」是与官方建议一致的方向。

### 4.6 拖动/移动的系统行为

- tao 的 `drag_window()` 用 `PostMessageW(WM_NCLBUTTONDOWN, HTCAPTION)` 触发系统移动（`tao/.../windows/window.rs`）。
- 系统随后在**创建窗口的线程**（Tauri 主线程）上进入模态移动循环；期间事件循环不处理普通消息。
- Tauri 的 getter（`inner_position`/`scale_factor`）从后台线程调用时是「发消息给主线程 + 阻塞等回包」（`tauri-runtime-wry` 的 `getter!` 宏），因此拖动期间会卡住。
- `start_dragging` 本身是 fire-and-forget，命令返回 ≠ 拖动结束；`main.ts:1844` 的 `.finally` 时机需单独验证/修正。

### 4.7 DPI 与坐标空间

- Windows 的「物理像素」只有对 **per-monitor DPI aware** 进程/线程才是无虚拟化的真实坐标；[High DPI 文档](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows) 明确说明 DPI-unaware/system-aware 的线程会拿到被虚拟化的结果。
- Tauri 侧：窗口/屏幕 API 用物理像素，浏览器侧用逻辑（CSS）像素，二者通过 scale factor 换算（[Tauri dpi 文档](https://v2.tauri.app/reference/javascript/api/namespacedpi/)）。
- 本产品实测 150% 下 480×336 CSS → 720×504 物理；因此 1 CSS px = 1.5 物理 px。JS 的 `devicePixelRatio` 与 Tauri 的 `scale_factor` 应相等，但**它们来自不同进程/时序**，跨屏切换瞬间可能不同步。

---

## 5. 方案空间与选型

### 5.1 方案矩阵

| 方案 | 原理 | 精度 | 延迟/稳定性 | 实现成本 | 兼容/风险 | 结论 |
|---|---|---|---|---|---|---|
| A 现状：整块 UI 矩形 | JS 上报可交互元素矩形；Rust 轮询切 ignore | 矩形级（透明区仍挡） | 60ms 轮询 | 已有 | 低 | 仅作为兜底 |
| B 收紧到 actor bbox / `regions.json` 部位框 | 用 96×96 里的 bbox + 头/身/尾矩形（`public/characters/*/regions.json`）映射到屏幕 | 矩形级，但比整块画布小 | 同 A | 极低（0.5 人日） | 低 | **短期兜底/降级** |
| C alpha tile / bitmask 矩形（**推荐**） | 逐帧从 PNG 硬 alpha 生成 tile 矩形；Rust 只做矩形包含 | 近似逐像素（tile=2 art px，误差 5%–13% of opaque） | 60–125Hz 轮询；区域按帧/布局更新 | 中（2–3 人日） | 中（依赖 mask 生成/坐标映射） | **主方案** |
| D Win32 `SetWindowRgn` | 给窗口设置 GDI region，窗口外不绘制/不命中 | 矩形并集级 | 区域变化需重建，O(rects) | 中 | **高风险**：WebView2 子 HWND/DWM 合成下裁剪行为不可靠；RTL/坐标系坑 | 不推荐 |
| E 原生 `WM_NCHITTEST` / 子窗口 subclass | 父窗口返回 HTTRANSPARENT 或 hook 子窗口 | 逐像素 | 即时 | 高 | **不可行**：WebView2 子窗口 HTCLIENT（#446）；跨进程无法 subclass | 否决 |
| F `UpdateLayeredWindow` 逐像素 alpha | OS 按 alpha=0 自动穿透 | 逐像素 | 即时 | 高 | **不可行**：WebView2 走 DWM/DComp，不支持应用自绘 layered surface | 否决 |
| G WebView2 视觉托管 + `SendMouseInput` | 宿主自己路由输入 | 逐像素 | 即时 | 极高（重写 wry 宿主） | 产品级改造 | 长期不排期 |
| H 全局低层鼠标钩子 + JS 命中 + forward | 钩子转发移动给页面/JS 判定 | 逐像素 | 钩子延迟/稳定性 | 中 | 安全软件误报、全局钩子风险；Electron 内建、Tauri 无 | 不推荐 |
| I 紧窗（窗口贴合宠物包围盒，UI 需要时再扩窗） | 缩小窗口面积本身 | 矩形级 | 无 | 低–中 | 窗口移动/缩放/多屏/DPI 组合爆炸；菜单/面板需要大窗 | 可选「紧凑模式」，不是替代 |

### 5.2 为什么推荐 C 而不是「换渲染/换窗口技术」

- 产品的窗口、置顶、透明、拖拽、菜单/面板都已在 Tauri/WebView2 上跑通并有实机证据（`UI-WINDOW`）；换成视觉托管/原生窗口会推翻已验收部分。
- C 的每一层都可单独测试、可回退：mask 生成是纯数据；区域映射是纯函数；Rust 只做包含判断；任何一层失败都能降级到 B/A。
- C 的代价主要是「轮询固有延迟」和「区域与动画帧同步」，不是高风险平台能力。

### 5.3 各方案的进一步取舍

#### 5.3.1 `SetWindowRgn`（D）为什么在 WebView2 下不推荐

- `SetWindowRgn` 的 region 坐标相对**窗口**（不是客户区），RTL 时相对右上角（[Microsoft 文档](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowrgn)）；这本身可处理。
- 但 WebView2 渲染在子 HWND/独立进程，窗口 region 对 DWM 合成下子内容的裁剪**没有可靠保证**（需实机验证，不宜押注；Wails 最终选择的是 ignore 切换而不是 region）；窗口化浏览器控件与 region 裁剪组合是已知易碎区。
- 每帧（12–24fps）重建数百个矩形的 GDI region 并 `SetWindowRgn` 的开销与重绘代价，比「bool 切换 + CPU 矩形判断」高得多。
- 历史文档 `docs/DESKTOP-PET-UX-2026-11-16.md:95` 的方案未落地，落地版本改成了 ignore 轮询；本报告不建议回退到 region。

#### 5.3.2 原生 `WM_NCHITTEST`（E）

否决理由见 §4.4。补充：即使能在父窗口拿到，也要让「命中在透明像素」的点击继续落到下层的**别的进程**；`HTTRANSPARENT` 只保证同一线程窗口链，跨进程仍需 `WS_EX_TRANSPARENT`/层化语义，等于回到 ignore 切换。

#### 5.3.3 全局鼠标钩子（H）

- 需要 `WH_MOUSE_LL` 或 RawInput 才能让页面在 ignore 状态下继续收到移动（Electron forward 的内部实现就是低层钩子/鼠标消息转发）。
- 风险：全局钩子影响系统输入、可能被安全软件拦截/误报；开机常驻的桌面宠物对此尤其敏感。
- Rust 轮询 `GetCursorPos`（当前方案）不需要任何全局钩子，成本低得多；保持现状。

#### 5.3.4 紧窗（I）作为可选降级

- 若能接受「空闲时窗口缩到宠物包围盒 + 菜单打开时临时扩到 480×336」，遮挡面积可直接降一个数量级；缺点是窗口频繁 resize/move、与拖拽/DPI/多屏组合更多，且产品当前 UI 依赖 480×336 布局。
- 建议作为「C 方案某条路径失败时」的 B 计划，不作为主方案。

---

## 6. 推荐方案设计（C + 契约/拖动修复）

### 6.1 架构

```text
┌───────────────────────────── WebView2 (JS) ─────────────────────────────┐
│ 渲染/动画（已有）        命中区域构建（新增/改造）                        │
│ hero-runtime  ──frame──▶ 1) 当前帧号/演员布局/transform                   │
│ pack PNG 硬 alpha ─────▶ 2) 逐帧 mask → 2 art px tile 矩形（缓存）        │
│ DOM/UI 元素 ───────────▶ 3) getBoundingClientRect（CSS）                  │
│ modal 打开 ────────────▶ 4) 整窗矩形                                     │
│                          5) CSS→物理客户区 px（×dpr，floor/ceil）         │
│                          6) 合并/去重/排序 → IPC（变化才发，≤24Hz）        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ set_pet_hit_regions_v2 {regions, dpr, viewport, seq}
┌──────────────────────────────────▼──────────────────────────────────────┐
│ Rust 后台线程（不依赖 Tauri 主线程）                                      │
│ loop: sleep 8–16ms（近窗）/50ms（远窗）                                  │
│   GetCursorPos（物理）                                                    │
│   GetClientRect + ClientToScreen → 客户区原点（物理，跨屏/DPI 安全）      │
│   client = cursor - origin；hit = any(rect contains client)               │
│   状态变化 → set_ignore_cursor_events(!hit)（Tauri，主线程队列）          │
│   若几何变化且当前 WS_EX_LAYERED → SetLayeredWindowAttributes 刷新 region │
│   计数器/最近状态 → debug 探针                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 数据契约 v2

| 字段 | 类型 | 含义/约束 |
|---|---|---|
| `version` | int | 2；缺省按 v1（CSS px + scale_factor）处理 |
| `regions` | `[[x0,y0,x1,y1], ...]` | **物理客户区像素**，半开区间 `[x0,x1)`/`[y0,y1)`；数量 ≤256；坐标有限、允许超出视口（Rust 端 clamp） |
| `dpr` | number | JS `devicePixelRatio`（1–4）；Rust 只用于诊断断言，不再参与换算 |
| `viewport` | `[w,h]` | CSS 视口尺寸；Rust 断言 `window.inner_size()/dpr ≈ viewport`（容差 1px） |
| `seq` | int | 单调递增；Rust 丢弃旧 seq（IPC 乱序保护） |
| `source` | string | `hero`/`dom`/`modal`/`fallback`（诊断） |

Rust 侧收到后：校验数量/有限性 → 存入 `RwLock<Vec<Rect>>` → 记 `updated_at`。若超过 2s 没有更新，视为 stale（可选择保守回退整窗可点或继续用旧区域，见 §6.7）。

### 6.3 mask 的来源与生成

**首选：构建期生成。** 现有生成器（`scripts/gen-*-anim.py` / `gen-pet-anim-frames.py`）已经逐帧产出 96×96 硬 alpha PNG，并有 `--verify`/`--check` 帧门禁；在同一脚本里增加 mask 输出即可保证「帧变了 mask 一定跟着变」：

- 输出格式：每帧一个矩形 run 列表（art px，tile=2），或位图 bitmask（96×96 bit = 1,152 B/帧）。矩形列表对 Rust/JS 都直接可用；bitmask 适合未来 Rust 端逐像素。
- 建议放在 pack 内独立文件（如 `hit.json`）并在 manifest 里记版本 + sha256；第三方/DLC pack 没有该文件时回退 B（bbox）。
- 单角色 68 帧 × 约 50 矩形 × 4 数字 ≈ 7–10 KB/角色（压缩前）；bitmask 78 KB/角色。两者都可接受，矩形列表更省。
- 确定性测试：PNG alpha 变了但 hit.json 未变 → `--check` 失败；hit.json 矩形必须覆盖该帧全部不透明像素（§10.1）。

**次选：加载期一次性解码。** DLC/第三方 pack 没有 hit.json 时，用 `fetch(png) → createImageBitmap → OffscreenCanvas → getImageData` 在加载时算一次（68 帧 × 9,216 px ≈ 0.6M 像素/角色，一次性，可异步分片），缓存到内存；**不要每 250ms 重新采样整张已合成 canvas**（当前草稿路径）。

**掩码精度选择**：

| tile | 每帧矩形数 | 覆盖/不透明 | 透明多覆盖（相对 opaque） | 评价 |
|---|---|---|---|---|
| 1 art px | ~100–160 | 1.00 | ~0 | 精确但 IPC/矩形数翻倍，收益递减 |
| **2 art px** | **42–66** | **1.05–1.13** | **5%–13%** | **推荐**（2 art px = 4 CSS px @2x） |
| 4 art px | 20–33 | 1.17–1.34 | 17%–34% | 可用于低配/降级，边界更毛 |
| 8 art px | 9–17 | 更大 | 更大 | 只适合「粗略可点」的降级 |

### 6.4 JS 侧：从「演员状态」到「物理客户区矩形」

输入：

- 当前帧：`heroRuntime.actorFrame(id)`（若接口不足，可在 render 回调里记录 `{actorId, tag, frame}`）；
- 每个演员的布局：`{x, y, scale, width, height}`（hero layout；`heroRegionHitAt` 已有同样语义，见 `src/pet/anim/regions.ts:236-251`）；
- canvas 元素与变换：`getBoundingClientRect()`、`clientWidth/clientHeight`、`style.translate`、`style.scale`、`dataset.heroFlip`；
- 视口：`innerWidth/innerHeight`；`devicePixelRatio`。

对每个演员：

1. 取当前帧 mask 的矩形 `[ax0, ay0, ax1, ay1]`（art px）。
2. 平移到演员布局：`ax += actor.x`、`ay += actor.y`（若 mask 已按演员画布坐标则省）。
3. art→未变换 CSS：`cssX = ax × k`，其中 `k = canvas.clientWidth / 96`（96 为 pack canvas 宽；实际用 pack canvas 尺寸）。
4. 应用 canvas 元素的 CSS 变换：当前只有 `translate` + `scaleX(±1)`；用 `rect` 把未变换 CSS 映射到视口：
   - `sx = rect.width / canvas.clientWidth`，`sy = rect.height / canvas.clientHeight`（无旋转时成立；有旋转/斜切则必须改用 `DOMMatrix`，见 §7.2）。
   - 未翻转：`vx = rect.left + cssX × sx`；翻转：`vx = rect.left + (canvas.clientWidth − cssX) × sx`（transform-origin 为 center 时）。
   - `vy = rect.top + cssY × sy`。
5. CSS→物理客户区：`phys = round(vx × dpr)`；矩形左/上用 `floor`、右/下用 `ceil`（膨胀，避免边界丢像素）。
6. 与 DOM 矩形合并：DOM 元素仍用 `getBoundingClientRect × dpr`；菜单/面板/composer/结果卡/TOS 等保持现有选择器；全屏 dialog 仍整窗。
7. 去重/合并：相同矩形 hash 去重；可选「相邻行合并」降低数量（当前 tile run 已按行合并）。
8. 发送策略：帧号/演员布局/视口/dpr/DOM 可见性任一变化 → 重新计算并发送；用 rAF 或定时器合帧，硬上限 24Hz（快帧 attack 24fps 也够）；无变化不发送。

**失败回退**（必须实现）：mask 缺失/解码失败 → 该演员回退到 `actor bbox` 矩形（`character.json` 的 `bbox` 或布局框）；仍失败 → 回退整块 hero canvas 矩形；任何情况下不能让 hero 无热区（D7）。

### 6.5 Rust 侧：轮询与样式策略

推荐实现要点（伪代码，不是代码改动）：

```text
struct HitState { regions: RwLock<Vec<Rect>>, seq: AtomicU64, updated: Instant }

loop:
  interval = near_window ? 8..16ms : 50ms
  sleep(interval)
  if !visible || minimized { continue }
  GetCursorPos(&mut cursor)              // 物理屏幕
  GetClientRect(hwnd, &mut rc)            // 客户区 0,0,w,h（物理）
  pt = (0,0); ClientToScreen(hwnd, &mut pt)  // 客户区原点（物理）
  client = cursor - pt
  hit = regions.any(rect.contains(client)) // 半开区间
  if hit != last_hit:
      last_hit = hit
      tauri_set_ignore_cursor_events(!hit)   // 可跨线程排队；拖动中排队可接受
      verify_ex_style_after(50ms)              // 探针/调试构建；不一致记日志并重试
  if window_rect_changed_since_last:
      if ex_style & WS_EX_LAYERED != 0: SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)  // 刷新命中区域
```

要点与理由：

1. **几何只用原生 Win32**：`GetClientRect`/`ClientToScreen` 不经过 Tauri 事件循环，拖动期间不会被主线程模态循环卡住。
2. **样式切换仍用 Tauri API**（保持 tao 的 `WindowFlags` 与实际样式同步，避免其它 setter 用旧 flags 覆盖回原样）。拖动期间排队可以接受：拖动从宠物上开始，状态本来就是「可点」，不需要中途切换；松手后 poller 用最新几何立即纠正。
3. **`SetLayeredWindowAttributes` 只做区域刷新**（alpha=255 常量，不改变视觉）；这是 Wails 验证过的修法，直接针对「旧位置残留」。
4. **不要 `WS_EX_NOACTIVATE`**（Wails 教训：WebView2 焦点状态不一致会导致整屏鼠标被吞）；如需「点宠物不打断当前应用」，另立课题（Tauri `set_focusable` 或产品决策），不要混进穿透实现。
5. **启动时序**：窗口 `visible:false`；JS 首份 regions 到达（`ready`）后再 `show()`；或者 show 前默认 `set_ignore_cursor_events(true)` 并在 ready 后按位置切换。
6. **诊断**：debug 构建每 500ms 记录 `{cursor, client_origin, ex_style, hit, regions_len, last_toggle_ms}` 到环形缓冲；提供 `pet_debug_hit_state` 命令给实机探针脚本读取。

### 6.6 拖动策略

- **保持系统拖拽**（`startDragging`），因为它保留 Windows 原生移动/多屏/DPI 处理；但要接受拖动期间主线程模态循环、Tauri 区域更新暂停。
- poller 在拖动期间不能卡：用 `GetClientRect/ClientToScreen`（Win32，跨线程安全）；`set_ignore_cursor_events` 的排队不造成功能问题。
- 拖动结束（松手）后 1 个轮询周期内，用新客户区原点重算并纠正；`SetLayeredWindowAttributes` 刷新 region。
- **不要依赖 `main.ts:1844` 的 `.finally` 判拖动结束**（`start_dragging` 是 fire-and-forget，promise 在 OS 移动循环开始前就 resolve）；`drag.end` 事件目前可能过早。若需要精确结束信号，监听 Tauri `onMoved` 稳定（例如 200ms 无位置变化）或 pointer 序列结束，但都不如 poller 自身几何检测可靠。

### 6.7 失败降级与生命周期

| 场景 | 行为 |
|---|---|
| mask 生成失败/缺失 | 该演员回退 bbox 矩形（`character.json.bbox`/布局框），记录一次告警；不阻塞启动 |
| regions 超过 2s 未更新 | 保持最后区域，但标记 stale；debug 日志 + 计数器；用户无感 |
| IPC 失败/审批拒绝 | 回退整窗可点（保持宠物可用），设置里提示「穿透不可用」；不要静默 |
| 窗口隐藏/全屏应用 | 隐藏时停 poller；恢复 show 后重新 show + 强制 re-sync |
| 非 Windows | 不启用 poller（现状）；产品层说明「仅 Windows 支持逐区域穿透」 |
| 拖动中 | 队列样式切换；几何原生读取；不重入、不阻塞 |
| 全屏 dialog | 整窗矩形，保证可点；关闭后等到下一份非整窗 regions 才恢复穿透 |

### 6.8 与现有代码的映射（建议，不实施）

| 现有位置 | 改动建议 |
|---|---|
| `src/pet/hit-regions.ts` | 保留 DOM 矩形收集；把 hero 的 `getImageData` 路径替换为「帧 mask → tile 矩形」；新增 dpr/物理坐标；失败 bbox 回退；测试扩展到映射/flip/dpr |
| `src/pet/main.ts` | 记录当前演员帧/布局；在帧变化与 canvas transform 变化时触发区域重算；`startHitRegionSync` 改为可注入的调度（便于测试） |
| `src/pet/hero-runtime.ts` | 暴露 `actorFrame` 与演员布局（若已有则确认语义）；确保 mask 与绘制帧同源（同一 tag/frame 索引） |
| `app/tauri/src-tauri/src/main.rs` | `set_pet_hit_regions` 增加 v2 字段；poller 用原生几何/去 Tauri getter；加 debug 探针、stale 检测、layered 刷新；`visible:false` 配合 show 时序 |
| `app/tauri/src-tauri/tauri.conf.json` | 加 `visible:false`（以及产品的 show 流程） |
| `public/characters/*/regions.json` | 保持现状（tap 区域语义不变）；不要与 click-through mask 混用（前者是交互语义，后者是命中几何） |

---

## 7. 坐标公式与不变量

### 7.1 四个坐标空间（必须写清）

| 空间 | 定义 | 谁产生 | 用途 |
|---|---|---|---|
| art px | 角色画布坐标（96×96；256 包为 256×256） | 美术/pack | 热区语义、mask |
| CSS px | WebView2 页面视口坐标（window.innerWidth/Height） | JS/DOM | DOM rect、动画布局 |
| client phys | 窗口客户区物理像素（原点=客户区左上角，可负） | Win32 | JS↔Rust 契约、GetCursorPos 换算 |
| screen phys | 桌面物理像素（多屏可为负） | Win32 | GetCursorPos |

换算关系：`client phys = round(CSS × dpr)`；`screen phys = client phys + 客户区原点 phys`；`art → CSS` 由角色布局 scale 决定（见 §7.2）。

### 7.2 关键公式

**(a) 单演员 mask 矩形 → CSS**（无旋转；当前 CSS 变换模型 = translate + scaleX(±1)）：

```text
k  = canvas.clientWidth / artW                 // art px → 未变换 CSS px（通常 = display scale）
sx = rect.width  / canvas.clientWidth          // CSS 元素额外缩放（当前通常 = 1）
sy = rect.height / canvas.clientHeight
cssX = rect.left + (flip ? (canvas.clientWidth - (ax + actor.x) * k) : (ax + actor.x) * k) * sx
cssY = rect.top  + (ay + actor.y) * k * sy
```

其中 `(ax, ay)` 是 mask 矩形在 art 画布中的坐标（若 mask 已含 actor 偏移则去掉 `actor.x/y`）。

**(b) CSS → client phys（上报给 Rust）**：

```text
x0 = floor(cssX0 * dpr); x1 = ceil(cssX1 * dpr)
y0 = floor(cssY0 * dpr); y1 = ceil(cssY1 * dpr)
```

膨胀（floor/ceil）是刻意的：宁可多挡 1px，也不要让不透明边缘漏成穿透（漏 = 宠物局部点不到，用户认为坏了）。

**(c) Rust 命中判断**：

```text
client = GetCursorPos() - ClientToScreen(hwnd, (0,0))   // 都是 screen phys
hit = any(x0 <= client.x < x1 && y0 <= client.y < y1)   // 半开区间
```

**(d) 样例（480×336 CSS 窗口，宠物 canvas 192×192，宠物视觉中心约 (240, 230) CSS，估算）**：

| DPI | dpr | 客户区物理尺寸 | canvas rect（物理） | 宠物中心（物理 client） |
|---|---|---|---|---|
| 100% | 1.0 | 480×336 | (144,126)-(336,318) | (240,230) |
| 125% | 1.25 | 600×420 | (180,158)-(420,398) | (300,288) |
| 150% | 1.5 | 720×504 | (216,189)-(504,477) | (360,345) |
| 200% | 2.0 | 960×672 | (288,252)-(672,636) | (480,460) |

> 表内数值按「canvas 水平居中、bottom=18 CSS」估算，用于核对量级；实机以 `getBoundingClientRect` 为准。

### 7.3 DPI 切换与多屏

- 监听 Tauri 的 `onScaleChanged`（payload 含 `scaleFactor` 与新的物理 size）与 `onMoved`（物理位置）；两者任一触发都**立即重算并重发 regions**，不要等 250ms 定时。
- 跨屏拖动时 `scale_factor` 与 `devicePixelRatio` 的更新可能不同步；如果 Rust 用 JS 上报的 dpr 做契约，则**只有一个真相源（JS）**，Rust 的 `scale_factor` 只用于断言/诊断，这样能消除一半不同步风险。
- 若仍出现 1–2 帧的错位，宁可**膨胀区域**（多挡几个像素）也不要缩；否则宠物会短暂不可点。
- 多屏负坐标：`client` 与 `screen` 都可以为负，Rust 用 i32/i64 计算，不要 `as u32`。
- 混合 DPI（100% + 150% 双屏）：必须实机测试「拖到另一屏」「在另一屏点宠物」「再拖回」。

### 7.4 sprite 镜像（flip）不是窗口 RTL

- 本产品的「镜像」是角色朝左/朝右：`canvas.style.scale = '-1 1'` + `dataset.heroFlip=1`（`src/pet/main.ts` 的 roam 路径）。热区必须随翻转镜像；`regions.json` 的部位矩形（头/尾）在翻转后也要在语义上对应（tap 命中由 `hero.hitActor` 处理，与 click-through 分开）。
- Windows 的 RTL/窗口镜像（`SetWindowRgn` 文档提到 RTL 下 region 坐标相对右上角）是另一回事；产品中文 LTR，不涉及，但若未来打开 `WS_EX_LAYOUTRTL`，§7.2 公式与 Win32 原点都要复核。
- 若未来加了旋转/斜切变换，§7.2(a) 的 `rect` 比例法失效，必须改用 `DOMMatrix`（`getComputedStyle(canvas).transform`）逐点变换；当前代码模型只承诺 translate + scaleX，应在注释/测试里锁死这个前提。

### 7.5 不变量（写成属性测试）

1. 对任意不透明 art 像素中心 `(x+0.5, y+0.5)`：映射到 client phys 后，必落在至少一个上报矩形内（覆盖完备性）。
2. 对任意透明且距离不透明像素 > tile 的 art 像素：映射后不在任何矩形内（多挡受控）。
3. 同一帧、同一布局、同一 dpr 下，区域计算是确定性的（同输入同输出；无随机、无时间依赖）。
4. 区域矩形全部有限、非空、`x0<x1`、`y0<y1`；数量 ≤256；物理坐标允许负但必须有限。
5. `dpr` 变化后，重新计算的区域与「用新 dpr 重算的期望值」一致；不允许缓存跨 dpr 复用。
6. flip 前后，区域是水平镜像关系（允许 ±1px 圆整差）。
7. 全屏 modal 存在时，区域包含整窗（且完整覆盖视口）。

---

## 8. 性能预算

### 8.1 本机微基准（算法侧，仅参考）

> 环境：Linux/WSL + Node 24.22.1；对象是合成的 30% 填充椭圆，不是真实 WebView2/Windows；用于给「tile 生成本身有多便宜」定上界。

| 输入 | tile | 矩形数 | 单次生成耗时 | JSON 字节 |
|---|---|---|---|---|
| 96×96（art） | 2 art px | 30 | 0.027 ms | 421 B |
| 192×192（CSS 2×） | 4 | 31 | 0.035 ms | 501 B |
| 288×288（150% backing） | 6 | 31 | 0.067 ms | 521 B |
| 480×336（整窗） | 8 | 26 | 0.120 ms | 458 B |

真实帧：tile=2 时 42–66 个矩形/帧（§3.1），JSON 约 0.7–1.1 KB；按 24Hz 发送 = 最坏约 26 KB/s。

### 8.2 预算表（目标值，实机验收用）

| 项 | 预算 | 说明/测量方法 |
|---|---|---|
| Rust 轮询 CPU | <0.5% of one core（空闲+动画） | `GetProcessTimes` 10 分钟采样；基线与开启穿透对比 |
| 轮询间隔 | 8–16ms 近窗 / 50ms 远窗 | 自适应；记录实际唤醒分布 |
| 命中判断 | 单次 <2µs（≤64 矩形） | poller 内 `QueryPerformanceCounter` 采样 p50/p99 |
| JS 区域构建 | ≤0.2ms/次（真实 mask 缓存命中） | `performance.now()` 包住构建；禁止每次 getImageData |
| IPC | ≤24 次/s、≤2KB/次、≤50KB/s | 计数器；仅变化时发 |
| 切换延迟 | 光标进入不透明区 → ex-style 变更 p95 ≤32ms | 实机探针 1ms 采样 exstyle + cursor；统计 |
| 丢点击率 | 边界快速移动+点击 1,000 次，丢 ≤0.5% | 见 §10.4；这是产品可接受阈值，需产品确认 |
| 启动 | 首份 regions ready ≤300ms；ready 前窗口不可交互/不可见 | 日志时间戳 |
| 内存 | 新增 <10MB（含 mask 缓存） | 68 帧 × 3 角色矩形列表约 1–2MB 内；防止泄漏 |
| mask 生成 | 构建期 <2s/角色；运行期回退解码 <300ms/角色（异步） | CI 计时 + 启动日志 |
| 句柄/GDI | 1h soak 无增长 | `GetGuiResources` 采样 |

### 8.3 延迟的分解（为什么 60ms → 16ms 有意义）

```text
点击时刻 t0
  ↑ 光标实际在宠物不透明像素上（但窗口当前 ignore=true，点击会穿透丢失）
上一次轮询 t0-Δ（Δ∈[0, poll]）
  → poller 发现 inside 变化，调用 set_ignore_cursor_events(false)
  → Tauri 主线程应用样式（空闲时通常 <1 帧；拖动时排队）
  → 从这一刻起点击才被宠物接收
丢弃窗口 = 光标穿越边界的时刻到样式生效 ≈ poll + 应用延迟
```

- 60ms 轮询 + 约几 ms 应用 → 最坏约 65ms 的「已进入宠物但点击仍穿透」窗口；在快速点击/拖拽起手时最明显。
- 16ms 轮询 → 最坏约 20ms；再配合 tile=2 的 4 CSS px 膨胀，实际丢点击率会显著下降。
- 但 16ms 常驻会阻止 CPU 深度睡眠；所以用「光标在窗口附近才 16ms」的自适应策略。

---

## 9. 兼容性矩阵

### 9.1 平台/运行时

| 环境 | 支持级别 | 说明 |
|---|---|---|
| Windows 10/11（产品目标） | 目标平台 | 需 WebView2 Runtime；最低支持版本以仓库发布配置为准 |
| Windows 7/8 | 不支持 | WebView2 透明背景 alpha 在 Win7 不被支持（`E_INVALIDARG`，Microsoft 文档）；产品不把它列入支持矩阵 |
| WebView2 Runtime | 版本钉住/验收 | 144.x 透明窗幽灵标题栏（`#5492`，已修/需避开）；154.x alpha=0 背景失效（`#5752`，open）；建议安装器/验收矩阵固定版本，并保留「透明失效」的检测（见下） |
| Tauri 2.x | 支持 | `set_ignore_cursor_events`、`onScaleChanged`、`onMoved`、Windows `hwnd()` 可用；`start_dragging` 语义见 §4.6 |
| DPI 100/125/150/175/200% | 必须测 | 物理 px 契约后公式统一；圆整差 ≤1px |
| 混合 DPI 多屏 | 必须测 | 最高风险组合；跨屏拖动 + 点击 + 再拖回 |
| 负坐标多屏（副屏在左/上） | 必须测 | 减法对负坐标安全；断言没有 `as u32` |
| RDP/远程会话 | 降级 | 透明/合成可能退化；至少不能崩、不能全屏吞点击 |
| 虚拟桌面/Win+D/Alt+Tab | 必须测 | Wails 曾因 `WS_EX_NOACTIVATE` 出现整屏输入被吞；本方案不用它 |
| 全屏独占应用 | 现有逻辑 hide | 保持既有 `is_fullscreen` 轮询；不属于本方案 |
| macOS | 非目标 | 透明窗口需 `macOSPrivateApi`；tao 有 `set_ignore_cursor_events` 实现；未验证 |
| Linux/X11/Wayland | 非目标 | 透明/点击穿透依赖合成器；不承诺 |

### 9.2 WebView2 透明相关的已知回归（发布风险）

| issue | 症状 | 影响 | 应对 |
|---|---|---|---|
| `WebView2Feedback#5492`（144.x，已关闭） | 透明窗出现经典/幽灵标题栏 | 视觉 | 固定/验收 runtime；避开该版本段 |
| `WebView2Feedback#5752`（154.x，open） | `DefaultBackgroundColor` alpha=0 被忽略，透明窗变不透明/主题色底 | 视觉+产品 | 安装器检测/回退；验收矩阵必须包含透明背景检查 |
| `WebView2Feedback#5668`（open） | alpha=0 的 WebView2 窗口仍参与命中测试，吞下层点击 | 与点击穿透同源风险 | 本方案用 `set_ignore_cursor_events` 显式控制，不依赖 alpha=0 |
| `tauri#14764` | 拖动/焦点变化时透明窗下方出现 ghost titlebar | 视觉 | 拖动场景实机录屏验收；必要时反馈/升 runtime |

### 9.3 安全/可访问性/系统集成

- **安全软件**：`GetCursorPos` 轮询是普通 API，不装全局钩子、不注入，不会触发「输入监控」类告警；这是相对 Electron forward/低层钩子的优势。
- **可访问性**：穿透区域不可点；需要保证菜单/设置/退出有键盘路径（现有 shell 菜单 + 快捷键）；Narrator/高对比度下透明窗仍需可用。
- **屏幕共享/录屏**：透明窗在捕获中显示为透明（取决于捕获 API）；不属于本方案，但穿透状态不应影响捕获。
- **第三方/DLC pack**：没有 hit.json 时回退 bbox；不允许因为没有掩码而整窗不可点或整窗拦截。

---

## 10. 测试方案与验收标准

### 10.1 单元/属性测试（JS，沿用现有 node:test 风格）

1. **mask→矩形**：对每帧真实 PNG（或测试 fixture）生成的矩形：覆盖全部不透明像素；不包含距离 > tile 的透明像素；矩形非空/在画布内；行 run 合并不重叠。
2. **映射**：art→CSS→client phys 的公式：scale=1/2/4、flip=0/1、translate=(±偏移)、dpr=1/1.25/1.5/2 的组合；对每个不透明像素中心断言落在区域内（完备性）；对采样透明点断言不在区域内（多挡受控，允许 tile 膨胀）。
3. **确定性/缓存**：同输入重复计算结果一致；dpr/布局/帧变化会失效缓存；不得跨 dpr 复用。
4. **契约**：v2 payload 字段/边界；矩形数量上限；`seq` 单调；空区域；整窗 modal；非法/NaN/Infinity 被拒（Rust 端也测）。
5. **回退**：mask 缺失/解码失败 → bbox 矩形；canvas 取不到 → 整块 canvas 矩形；不允许返回空热区。
6. **性能回归**：区域构建 <0.2ms（真实 mask 缓存），统计 case 超阈值 fail（CI 上可放宽）。

现有 `tests/hit-regions.test.ts`（未提交草稿）覆盖了 tile run 的 4 个基础 case，可作为起点，但缺映射/flip/dpr/回退测试。

### 10.2 Rust 单元/契约测试

1. 矩形包含：半开区间边界（x0 命中、x1 不命中）；负坐标；空列表。
2. 几何：模拟 `GetClientRect/ClientToScreen` 返回值，验证 `client = cursor - origin`；DPI 无关。
3. 契约：v1/v2 反序列化；非法数据拒绝；stale 判定；`seq` 乱序丢弃。
4. **跨语言黄金用例**：JS 生成 1,000 个随机点 + 对应 regions + 期望 hit 布尔，存 JSON fixture；Rust 测试读同一 fixture 验证，防止两端公式漂移。
5. 样式策略：mock/探针下的 toggle 顺序、失败重试、layered 刷新条件（可在无窗口环境下用 trait 抽象）。

### 10.3 构建期门禁

- `--check`/`--verify` 扩展：hit 文件与 PNG 字节对应（sha256）；每帧矩形覆盖全部不透明像素；矩形数/尺寸上限；重复运行字节一致。
- 所有默认 pack（dog/cat/human）必须提供 hit 文件；第三方/DLC 可缺省（回退 bbox），但要有告警计数。

### 10.4 Windows 实机自动化探针（核心验收手段）

目标：把「透明区是否穿透」「拖动后旧位置」「DPI 切换」变成可重复的机器断言，而不是肉眼。建议 PowerShell 7 + C# `Add-Type`（或 Node + ffi）写一个 `tools/qa/hit-probe.ps1`（**本任务不实现**）：

#### 10.4.1 测试夹具

- **click-sink 窗口**：一个普通 Win32/WinForms 窗口，铺满屏幕下半部或放在宠物窗口正下方，记录 `WM_LBUTTONDOWN` 的屏幕坐标到日志/文件。
- **被测应用**：famling 固定窗口位置/大小启动（建议加调试参数 `--pet-pos=x,y` 或在探针里用 `SetWindowPos` 移动；避免依赖用户现有位置）。
- **探针原语**：`GetCursorPos`、`SetCursorPos`、`SendInput`（左键 down/up）、`GetWindowLongPtr(GWL_EXSTYLE)`、`WindowFromPoint`、`GetWindowRect`、`GetClientRect`、`ClientToScreen`、`GetDpiForWindow`、`PrintWindow`/屏幕截图。

#### 10.4.2 用例

| ID | 用例 | 断言 |
|---|---|---|
| T1 | 静态点：宠物不透明中心/透明角落/UI 按钮/菜单打开/全屏 dialog | 点击去向匹配期望；exstyle 与 hit 一致 |
| T2 | 边界网格：在宠物轮廓附近取 200 个点（按 art mask 生成期望） | ≥99.9% 一致；不一致点记录到报告 |
| T3 | 拖动：从宠物中心按下→移动 200px（10 步）→松开 | 拖动期间进程不假死（探针心跳）；松手 ≤100ms 后新位置可点、旧位置穿透；`WindowFromPoint` 旧位置不再返回宠物 |
| T4 | 移动后旧的 layered 区域：拖到新位置后立即在旧位置点击 | 必须落到 click-sink；若失败则证明 H-B（需要 layered 刷新） |
| T5 | DPI：100/125/150/200% 各一轮（可用系统缩放设置或不同 DPI 的显示器） | 宠物中心/四角点击正确；`dpr≈scale` 断言通过 |
| T6 | 混合 DPI 双屏：拖到另一屏、点中心/角落、拖回 | 同 T5；切换后 ≤300ms 稳定 |
| T7 | 负坐标：副屏在主屏左侧/上方时重复 T3/T5 | 无偏移、无崩溃 |
| T8 | 启动时序：冷启动后立即点击窗口位置 | ready 前不吞点击（或窗口不可见）；ready 后 ≤300ms 正常 |
| T9 | 动画帧同步：快速动作（attack/run）中在轮廓边缘点击 200 次 | 与当前帧 mask 一致率 ≥99%（允许 poll 延迟导致的边界差） |
| T10 | 视觉：切换/拖动/DPI 切换时录屏 60fps | 无 ghost titlebar/残影/闪烁（人工+帧差辅助） |
| T11 | 延迟：从透明区快速移到不透明区并立即点击 1,000 次 | 丢点击率 ≤0.5%（按 §8.2 阈值） |
| T12 | 稳定性：1h soak（idle+动画+随机拖动+菜单开合） | CPU/内存/句柄无异常；无崩溃；日志无错误风暴 |

#### 10.4.3 探针技巧

- `SendInput` 比 `mouse_event` 更接近真实输入（UIPI 允许时）；使用 `SetCursorPos` + 短延时（≥30ms）保证消息处理。
- `WindowFromPoint` 在 `WS_EX_TRANSPARENT` 窗口上会返回下层窗口，可直接验证穿透。
- `GetWindowLongPtr(GWL_EXSTYLE)` 检查 0x20/0x80000，是最便宜的状态断言（`UI-WINDOW` 已用过）。
- 截图对比用固定窗口位置 + 固定宠物帧（可加 `--freeze-frame=idle/0` 调试参数，建议产品提供）。

### 10.5 手工 QA 清单（自动化覆盖不了的）

- 触控/笔输入、双击/右键菜单、长按 PTT、拖拽起手是否误触发菜单。
- 菜单/面板/TOS/设置/Advisers 打开时能否点外部关闭（整窗区域）。
- 全屏视频/游戏时隐藏逻辑；退出全屏恢复后穿透状态。
- 屏幕阅读器（Narrator）能读到菜单/对话框；键盘可退出/打开设置。
- 高对比度/深色模式；RDP 会话；多用户切换；睡眠唤醒。
- 屏幕捕获（OBS/截图）中透明窗表现。

### 10.6 验收标准（发布门）

| # | 标准 |
|---|---|
| A1 | 静态/边界点击：按 mask 期望一致率 ≥99.9%（T1/T2） |
| A2 | 拖动后旧位置点击 100% 落到下层；新位置宠物 100% 可点；无假死（T3/T4） |
| A3 | 100/125/150/200% + 混合 DPI + 负坐标：一致率 ≥99.9%，切换后 ≤300ms 稳定（T5–T7） |
| A4 | 首份 regions 前不吞点击（T8） |
| A5 | 边界快速点击丢点击率 ≤0.5%（T11；阈值需产品确认） |
| A6 | 1h soak 无 CPU/内存/句柄异常（T12） |
| A7 | 视觉无 ghost/残影（T10，人工复核 + 录屏存档） |
| A8 | 目标 WebView2 runtime 版本矩阵通过（至少：evergreen 当前 stable + 一个固定版本） |
| A9 | 回退路径可用：mask 缺失 → bbox；IPC 失败 → 整窗可点 + 设置提示 |

### 10.7 证据记录模板（沿用仓库现有验证文档风格）

```text
环境：Windows 版本 / WebView2 Runtime 版本 / Tauri 版本 / 构建 sha / DPI / 显示器布局
用例：T1–T12 逐条 pass/fail + 证据（截图路径、日志路径、探针输出摘要）
性能：CPU 基线 vs 穿透开启；延迟 p50/p95/p99；丢点击率；内存/句柄
结论：是否满足 A1–A9；未通过项与风险接受人
```

---

## 11. 风险与缓解

| # | 风险 | 概率/影响 | 缓解 | 验证 |
|---|---|---|---|---|
| R1 | 轮询延迟导致边界丢点击 | 中/中 | 16ms 自适应轮询 + tile 膨胀（4 CSS px）+ 丢点击率门禁 | T11 |
| R2 | 拖动期间主线程阻塞导致状态滞后 | 高/中 | poller 用原生几何；样式切换排队可接受；松手后立即纠正 | T3/T4 |
| R3 | layered 命中区域残留（旧位置） | 中高/高 | 移动/DPI 变化后 `SetLayeredWindowAttributes` 刷新；探针验证旧位置 | T3/T4/T5 |
| R4 | 运行时切换 `WS_EX_LAYERED` 引起视觉残影/闪烁 | 中/中 | 拖动中避免无意义切换（状态不变不切）；录屏验收；必要时评估「常驻 LAYERED + alpha=255 + 只切 TRANSPARENT」变体（需先验证 WebView2 透明不受影响） | T10 |
| R5 | DPI/多屏坐标错位 | 中/高 | 物理 px + dpr 契约；onScaleChanged/onMoved 立即重发；膨胀优先；混合 DPI 实机门禁 | T5–T7 |
| R6 | WebView2 runtime 透明回归 | 中/高 | 固定/验收 runtime；透明检测（截图采样/`DefaultBackgroundColor` 行为探针）；回退/提示 | A8 |
| R7 | mask 与美术/动画漂移 | 中/中 | 构建期 `--check`（PNG↔hit sha/覆盖）；manifest 版本；CI 门禁 | 10.3 |
| R8 | 第三方/DLC 包无 mask 导致大矩形 | 中/低 | 回退 bbox；运行期一次性解码（可选）；告警/文档 | 10.1/10.3 |
| R9 | 失败时宠物整体不可点 | 中/高 | 回退链：mask→bbox→canvas 矩形；任何异常都有热区；监控计数器 | 10.1 |
| R10 | IPC 命令被滥用/超大 payload | 低/中 | regions ≤256、有限数、clamp；seq 单调；Rust 端校验；不信任 webview | 10.2 |
| R11 | 全局钩子/安全软件 | 本方案不引入 | 保持 `GetCursorPos` 轮询；若未来用 forward 需重新评估 | — |
| R12 | 焦点/激活行为（点宠物打断输入） | 中/低 | 不在本方案引入 `WS_EX_NOACTIVATE`；另立产品课题；必要时 Tauri `set_focusable` 单独验证 | T12/手工 |
| R13 | 非 Windows 无降级 | 低/低 | 产品声明仅 Windows；其他平台回退整窗/无穿透 | — |
| R14 | 原生几何与 Tauri 缓存不一致（未来 tao 变化） | 低/中 | 只读几何用 Win32；样式仍走 Tauri；升级 Tauri 时跑 T1–T12 | 升级回归 |
| R15 | 测试本身不稳定（原生拖拽/时序） | 中/中 | 探针固定位置/固定帧；重试与容差；关键用例人工复核兜底 | 10.4 |

---

## 12. 实施步骤与工作量

### Phase 0：可观测性 + 契约（0.5–1 人日，先做）

1. Rust `pet_debug_hit_state` 命令 + poller 计数器（cursor/客户区原点/size/dpr/exstyle/hit/regions/时间戳）。
2. 前端 `?hitdebug=1`：画区域框 + 十字线 + 当前帧号。
3. `tauri.conf.json` 加 `visible:false`；JS 首份 regions 后 `show()`（或 show 前 ignore=true）。
4. 契约 v2（物理 px + dpr + seq）先兼容 v1。
5. 产出：Windows 实机探针脚本骨架 + 用 §3.6 区分 H-A/H-B/H-C/H-D 的第一次实测记录。

**门禁**：能抓到拖动期间 poller 阻塞/旧位置命中/样式状态之一，否则 Phase 1 的收益无法证明。

### Phase 1：alpha 区域（1–2 人日）

1. 生成器输出逐帧 hit 矩形（tile=2 art px）+ manifest 版本/hash + `--check` 覆盖测试。
2. JS 区域构建：帧/布局/transform/dpr/DOM/模态；失败回退 bbox；帧变化驱动 + ≤24Hz 合帧；替换草稿的 getImageData。
3. Rust：v2 契约、原生几何、16ms 自适应轮询、stale/诊断。
4. 测试：§10.1–10.3 全绿；Windows T1/T2/T8/T11 跑通。

**门禁**：透明拦截面积按预算下降；宠物可点；无回归（typecheck/tests/build/cargo check）。

### Phase 2：拖动/DPI 稳定性 + 发布（1–2 人日 + Windows QA）

1. 移动/DPI 后 layered region 刷新；onMoved/onScaleChanged 立即重发；`start_dragging` 生命周期事件修正（可选）。
2. T3–T7、T9、T10、T12 全量；混合 DPI/负坐标；WebView2 版本矩阵。
3. 回退策略与设置文案（穿透不可用提示）；文档/证据归档（`docs/verification/`）。

**门禁**：A1–A9 全过；风险接受人签字（尤其 R6/R2/R4）。

总计：**3–5 个开发人日 + 1–2 个 Windows QA 人日**（不含 mask 生成器如果从零写的额外 0.5–1 天）。

### 12.1 建议顺序（依赖关系）

```text
Phase 0（探针/契约/visible） ──▶ Phase 1（mask + 映射 + poller 几何） ──▶ Phase 2（拖动/DPI/矩阵）
        │                                   │
        └── 若 H-B 被证实：先做 layered 刷新（独立小修，可提前合并）
```

---

## 13. 附录

### 13.1 代码/文档证据索引（本仓）

| 证据 | 位置 |
|---|---|
| 窗口透明/置顶/无边框配置 | `app/tauri/src-tauri/tauri.conf.json:18-27` |
| 命中区域收集与同步 | `src/pet/hit-regions.ts:15-33,137-206` |
| Rust 命中轮询/命令 | `app/tauri/src-tauri/src/main.rs:20-70,457,610` |
| 启动同步调用 | `src/pet/main.ts:1491` |
| 拖窗与 6px 阈值 | `src/pet/desktop-shell.ts:819-838`；`src/pet/main.ts:1829-1858`；`src/pet/hero-drag.ts` |
| canvas/DPR/布局 | `src/pet/hero-runtime.ts:1127-1133,1184-1193` |
| 角色画布/显示 scale | `public/characters/pet-dog/character.json:13-15,34-35` |
| 部位热区（tap 语义） | `public/characters/*/regions.json`；`src/pet/anim/regions.ts:236-251` |
| 实测窗样式/DPI | `docs/verification/UI-WINDOW-2026-11-18.md:8-18,45,52` |
| 原 `SetWindowRgn` 设计 | `docs/DESKTOP-PET-UX-2026-11-16.md:12,95` |
| 历史审计 | `docs/audit/CODE-256-AUDIT-2026-11-17.md:10,74`；`docs/audit/NONART-RUNTIME-AUDIT-2026-11-17.md:33` |
| runtime 版本提示 | `docs/research/INPUT-TECH-FEASIBILITY-2026-11-17.md:37` |

### 13.2 本机测算数据（算法侧，2026-11-18）

方法：Node 24.22.1 + zlib 手写 PNG 解码（8-bit RGBA，filter 0–4）；对 204 帧逐帧统计 alpha>0 的像素，tile=2/4/8 art px 做行 run 合并；对合成 blob 做 tile 生成微基准。

| 角色 | 帧数 | 单帧 alpha 占画布 | tile=2 覆盖/opaque | tile=2 占画布 | tile=2 矩形数 | 全部帧并集占画布 |
|---|---|---|---|---|---|---|
| dog | 68 | 28.4%–31.9% | 1.051–1.099 | 30.3%–35.0% | 43–60 | 52.9% |
| cat | 68 | 34.0%–37.3% | 1.062–1.095 | 35.6%–41.0% | 46–66 | 70.0% |
| human | 68 | 16.9%–21.0% | 1.077–1.129 | 18.1%–25.1% | 42–66 | 36.8% |

> 注意：「全部帧并集」占画布比例明显更高（dog 52.9%、cat 70.0%），若为了减少更新而用「一角色一张并集 mask」，会显著多挡点击；**应按帧（或至少按 clip）取 mask**。

### 13.3 参考链接

**Tauri / tao / wry**

- Tauri issue #13070（透明窗点击穿透，已关闭，维护者「不会实现，改 on demand 切换」）：https://github.com/tauri-apps/tauri/issues/13070
- Tauri issue #6164（`setIgnoreCursorEvents` forward 选项，open）：https://github.com/tauri-apps/tauri/issues/6164
- Tauri issue #2090（Ignore mouse event on transparent areas，closed）：https://github.com/tauri-apps/tauri/issues/2090
- Tauri issue #14764（透明窗拖动/焦点 ghost titlebar）：https://github.com/tauri-apps/tauri/issues/14764
- Tauri JS API `setIgnoreCursorEvents`（源码与权限说明）：https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts
- Tauri `inner_position`（物理客户区原点）：https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/window/mod.rs
- tauri-runtime-wry getter 派发（send_user_message + recv）：https://docs.rs/tauri-runtime-wry/latest/src/tauri_runtime_wry/lib.rs.html
- tao Windows window（drag 用 WM_NCLBUTTONDOWN）：https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/windows/window.rs
- tao Windows window_state（IGNORE_CURSOR_EVENT → WS_EX_TRANSPARENT|WS_EX_LAYERED）：https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/windows/window_state.rs
- wry WebView2 透明背景（DefaultBackgroundColor）：https://github.com/tauri-apps/wry/blob/dev/src/webview2/mod.rs
- Tauri DPI（物理/逻辑像素）：https://v2.tauri.app/reference/javascript/api/namespacedpi/
- Tauri 窗口自定义（capabilities/权限）：https://v2.tauri.app/learn/window-customization/

**WebView2 / Microsoft**

- Windowed vs Visual hosting：https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/windowed-vs-visual-hosting
- ICoreWebView2Controller2 DefaultBackgroundColor（alpha 0/255）：https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2controller2
- WebView2Feedback #446（父窗口拿不到 WM_NCHITTEST）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/446
- WebView2Feedback #5668（alpha=0 仍吞点击）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5668
- WebView2Feedback #5752（154.x 透明背景失效，open）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5752
- WebView2Feedback #5492（144.x 透明窗幽灵标题栏）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5492

**Win32 文档**

- Layered Windows（命中测试基于形状/alpha）：https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#layered-windows
- Extended Window Styles（WS_EX_TRANSPARENT/LAYERED/NOACTIVATE）：https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles
- DWM best practices（顶层 WS_EX_TRANSPARENT 应与 WS_EX_LAYERED 组合）：https://learn.microsoft.com/en-us/windows/win32/dwm/bestpractices-ovw
- WM_NCHITTEST / HTTRANSPARENT：https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest
- WM_NCLBUTTONDOWN（DefWindowProc 进入移动循环）：https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nclbuttondown
- GetCursorPos：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcursorpos
- SetCursorPos：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setcursorpos
- SetWindowRgn（region 相对窗口坐标、RTL 注意事项）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowrgn
- SetLayeredWindowAttributes：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes
- SetWindowLongPtrW：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlongptrw
- GetWindowLongPtrW：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlongptrw
- GetClientRect：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclientrect
- ClientToScreen：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-clienttoscreen
- GetDpiForWindow：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getdpiforwindow
- High DPI Desktop Application Development（虚拟化）：https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows
- SendInput：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput

**同类实现/前作（外部数据）**

- Wails #5229（透明无边框 WebView2 命中穿透/子窗口竞态）：https://github.com/wailsapp/wails/pull/5229
- Wails #5371（layered hit-test region 刷新 + NOACTIVATE 教训）：https://github.com/wailsapp/wails/pull/5371
- Wails #4871（透明无边框 resize 后新区域穿透）：https://github.com/wailsapp/wails/issues/4871
- Electron 自定义窗口交互（setIgnoreMouseEvents + forward）：https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- AtomUI Popup 桌面实现（常驻 LAYERED + alpha=255、运行时只切 TRANSPARENT）：https://github.com/AtomUI/AtomUI/blob/release/6.0/docs/controls/desktop/other/popup/implementation.md
- project-xiaochun 混合桌面架构（Tauri 60Hz alpha bitmask 桌面宠物）：https://github.com/FireTable/project-xiaochun/blob/main/docs/HYBRID_DESKTOP_APP.md
- Tauri 点击穿透与鼠标事件转发（社区移植 Electron 思路）：https://juejin.cn/post/7363101450824155163
- MDN CanvasRenderingContext2D.getImageData：https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData

### 13.4 术语

| 术语 | 含义 |
|---|---|
| ignore 切换 | `set_ignore_cursor_events(bool)`，整窗「可点/穿透」开关 |
| layered | `WS_EX_LAYERED` 扩展样式，DWM 层化合成窗口 |
| hit-test region | Windows 为层化窗口维护的命中区域；移动/缩放/DPI 后可能需手动刷新 |
| mask | 由帧 PNG alpha 生成的二值不透明区域 |
| tile run | 把 mask 按 tile 行合并后的矩形列表 |
| client phys | 窗口客户区物理像素坐标 |

### 13.5 待决策问题（交给 lead/产品）

1. 轮询策略的功耗/延迟取舍：16ms 近窗轮询是否可接受（笔记本续航）？是否做成设置项（「高精度穿透」默认开）？
2. 丢点击率阈值：0.5% 是否可接受？还是愿意用更大膨胀（更多遮挡）换 0 丢点击？
3. WebView2 Runtime 策略：安装器固定版本，还是随 evergreen 并接受回归风险？验收矩阵至少覆盖哪些版本？
4. 是否要尝试「紧凑窗口」模式（紧窗方案 I）作为过渡/低配降级？
5. 点宠物是否允许打断当前应用输入（focus 行为）？若需要「不抢焦点」，另立课题并先评估 `WS_EX_NOACTIVATE` 的 WebView2 风险（Wails 教训）。
6. 第三方/DLC 包没有 hit 数据时的产品口径：回退 bbox 是否足够（透明区仍挡一部分）？

---

*本文档为研究产出，未修改任何产品代码/JSON/资产；实施前请先按 Phase 0 在 Windows 实机复现并记录证据。*

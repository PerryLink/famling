# 03 · 原生宠物窗口渲染 / 动画 / 命中测试设计（renderer）

- 任务：task-16（renderer-design），交付文件 work/native/research/03-renderer-design.md
- 日期：2026-11-25（Asia/Shanghai）
- 基线：famling 工作树 0.2.3（HEAD 7462ef4 + 0.2.x 未提交发布改动）；dsh-famling 0.14.3；Windows 11 build 26300 本机 + windows-latest CI
- 范围：像素帧加载/缓存、DPI 整数缩放、帧调度（无撕裂）、命中测试、拖拽/贴边、气泡/菜单归属、多角色切换、内存/性能目标、代码级方案与文件级集成点
- 边界：本文件不最终决定进程拓扑（task-15 / 02-tauri-integration）、不决定平台验收矩阵（task-17 / 04-platform-validation）、不写迁移排期（task-18 / 05-migration-plan）；与它们冲突时以“渲染层可替换”为前提对齐
- 证据标记：[仓] 本仓库源码/实测；[官] Microsoft 官方文档；[issue] 官方 issue / 同类框架修复；[实测] 本机实测（2026-11-25）；[推断] 需实机验收的推断

---

## 0. 执行摘要（TL;DR）

**结论：pet window 用“纯 Win32 分层窗口 + UpdateLayeredWindow(ULW_ALPHA) 逐像素 alpha + Rust 自绘 PNG 帧”是当前证据下最稳、最省资源的 renderer 方案；WebView2 仅保留给设置/内容窗口。**

关键判断（每条都有证据，见 §1/§3/§12）：

1. **黑色/黑条/撕裂是“多层透明叠加”问题，不是美术问题。** 现状同时叠了 4 层：Tauri 透明窗、WebView2 默认背景、DOM/CSS 背景、PNG alpha；0.2.2/0.2.3 的修复只是把黑底从一层推到下一层（[仓] PET-WINDOW-ARCHITECTURE-REVIEW.md）。原生窗口只保留 1 层 alpha，结构上消除这类问题。
2. **ULW 分层窗口的 alpha=0 像素由 OS 自动放行鼠标点击**，不需要现在的 60ms 轮询 + hit-regions IPC + 整窗 set_ignore_cursor_events。官方原文：“Hit testing of a layered window is based on the shape and transparency of the window... areas ... whose alpha value is zero will let the mouse messages through.”[官] [Layered Windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features)
3. **ULW 要求预乘 alpha 的 32bpp BGRA**；PNG 是 straight alpha，解码后必须自己预乘；**缩放不能用 GDI StretchBlt/BitBlt**（会清 alpha），必须 CPU 最近邻缩放。[官] [BLENDFUNCTION](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-blendfunction)；同类实测 2.3MB 桌面宠物复盘（[掘金文章](https://juejin.cn/post/7703394427519877156)）
4. **Tauri/WebView2 的透明路线没有逐像素命中能力，且平台层回归不断**：Tauri 官方立场是整窗 ignore 切换（[tauri#13070](https://github.com/tauri-apps/tauri/issues/13070)、[#6164](https://github.com/tauri-apps/tauri/issues/6164)）；WebView2 144.x 透明窗幽灵标题栏、154.x alpha=0 背景失效（[WebView2Feedback#5492](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5492)、[#5752](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5752)）；本仓已记录 Tauri #16341/#14764/#14823 与 0.2.3 黑框黑条（[仓]；根目录 FIX/评估文档）。原生 renderer 不依赖 WebView2 透明路径，这些风险整体消失。
5. **性能上小窗口 ULW 足够便宜**：同类纯 Win32 桌宠实测常驻渲染面后单帧 8.9µs、Private 4.72MB、拖动单核 2.16%（110x110 窗口）（[掘金](https://juejin.cn/post/7703394427519877156)）；我们 sprite 窗口更小（96x96 art x 2~4），且动画只有 4~16fps。
6. **本机无法直接编译 Rust，但 C# 原型可行**：本机无 cargo/rustc/MSVC/dotnet SDK，但存在 C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe；已实测用它编译并运行了一个 Win32 分层窗口探针，CreateWindowEx + UpdateLayeredWindow 返回成功、窗口可见、rect/DPI 正确（本机 100% DPI）；因桌面处于锁屏（WindowFromPoint 返回 LockScreenBackstopFrame、SetCursorPos 失败），点击穿透/拖拽的交互断言无法在本机完成，需解锁桌面或 Windows VM/CI GUI 机。[实测]
7. **推荐栈：Rust（edition 2021）+ windows-sys 0.61（已有依赖）+ png（解码）+ serde_json；不引入 winit/wgpu/softbuffer/DirectComposition。** 用 win32 消息循环 + 高精度 waitable timer；Windows CI 构建（现有 build-windows.yml 已用 dtolnay/rust-toolchain@stable），本机下载 artifact 做 smoke。
8. **气泡/菜单归属**：气泡用独立的原生分层小窗（WS_EX_TRANSPARENT 让点击穿透，不抢焦点）；右键菜单用 Win32 TrackPopupMenuEx（可 owner-draw）；设置/内容中心/TOS/输入 composer 留在 WebView2 内容窗口（输入法/文本输入绝不进原生 pet 窗口）。
9. **多角色切换**：内建 3 角色 PNG 帧通过 build.rs 嵌入 exe（约 1.08MB PNG、14.8MiB 解码），切换时“先加载新 idle 首帧→原子替换→释放旧包”，保证失败回退旧角色；DLC/第三方包走运行时文件加载（同一套 loader + 严格上限）。
10. **验收目标**：无黑框/黑条/撕裂（逐帧截图哈希断言）；alpha 命中一致率 ≥99.9%；100/125/150/175/200% + 混合 DPI 无模糊；idle CPU ≤0.5%、动画 ≤1%、首帧 ≤150ms、renderer private ≤24MiB、24h soak RSS 漂移 ≤5%。

### 0.1 决策速查表

| 决策 | 结论 | 主要依据 |
|---|---|---|
| 渲染面 | Win32 分层窗口 ULW_ALPHA，预乘 BGRA DIB | [官] Layer/ULW；[实测] C# 探针 ULV success |
| 图形 API | 纯 CPU 最近邻合成（96px 像素画）；不用 GPU/DComp | 面积小、4~16fps；DComp 逐像素点击穿透需额外 layered/hack（[neru#1660](https://github.com/y3owk1n/neru/pull/1660)） |
| 窗口形态 | sprite-tight 主窗口（96 art px x L）+ 独立气泡小窗 + 系统菜单 | 面积=ULW 成本；气泡可独立贴边/穿透 |
| 缩放 | art→logical 整数倍 L；device = round(art*L*dpi/96) 最近邻；125/175% 允许不等宽像素（≤1 device px），可选“整数像素”吸附 | [仓] ADR-SCALE-DPI-2026-11-20.md 的 DPI 策略延续 |
| 帧调度 | 绝对 deadline + CreateWaitableTimerEx(HIGH_RESOLUTION) + MsgWaitForMultipleObjectsEx；只在状态变化时 ULV | [官] 高精度定时器 Win10 1803+；[实测] DWM 合成 |
| 命中测试 | 交给 OS 的 alpha 命中（alpha=0 穿透）；regions.json 仅做交互语义（头/身/尾） | [官] Layered Windows |
| 拖拽 | v1 默认沿用 OS 模态移动循环（WM_NCLBUTTONDOWN/HTCAPTION，与 02 集成文档一致；保留原生多屏/DPI 处理）；释放后 2~3 物理像素贴边 settle；手动 SetWindowPos 拖作为 NOACTIVATE 异常时的回退 | 现状 0.2.3 用 startDragging 的 OS 模态循环；手动拖在 §4.8/§5.3(e) 给出伪代码 |
| 气泡 | 独立 native layered window，WS_EX_TRANSPARENT 全穿透 | 不遮挡桌面点击；避免 pet 窗口 resize |
| 菜单 | P1 右键开内容窗口；P2 TrackPopupMenuEx + SetForegroundWindow + PostMessage(WM_NULL) | [官] TrackPopupMenuEx；[issue] 托盘菜单同款模式 |
| 单实例/托盘/召回 | 保留现有 main.rs 逻辑；召回改为按窗口类名/互斥体+消息，而不是标题 FindWindowW | [仓] main.rs |
| 渲染器进程 | 库 crate + Tauri 进程内渲染线程（v1）；进程外为可选加固 | 无跨进程 IPC，最简单；API 保持进程无关 |
| 内建资产 | build.rs 读 public 资产→OUT_DIR→include_bytes! | 便携 zip 不依赖外部 resources；CI 可构建期校验帧数/尺寸 |
| C# | 只做本机原型/探针，不发布 | 本机无 Rust 工具链；避免双栈 |

---

## 1. 现状：渲染链路与根因（renderer 视角）

### 1.1 现行渲染/动画/输入链路（0.2.3）

| 层 | 实现 | 文件（[仓]） |
|---|---|---|
| 窗口 | Tauri 2 透明 480x336 always-on-top、无边框、无阴影、不可缩放；WebView2 合成 | app/tauri/src-tauri/tauri.conf.json:18-27 |
| 像素绘制 | Canvas2D；帧 = HTMLImageElement；整数显示 scale 1/2/4 或 1/2、1/4、1/8 倒数；backing = round(css*dpr)；imageSmoothingEnabled=false | src/pet/hero.ts、src/pet/pixel-scale.ts |
| 动画时钟 | 宿主 rAF tick → HeroRuntime.render(ctx, nowMs)；组件自身不拥有 rAF | src/pet/hero-runtime.ts:814-815、1080-1099 |
| 帧调度 | CharacterRenderer.play() 内 requestAnimationFrame 循环，按 frameIndexFor()/holdMs 取帧，只在新帧 index 变化时 drawImage | src/pet/hero.ts:534-565 |
| 帧解码 | 每帧 new Image()，全部帧 eager 解码（load）或 idle-first（loadFirst + decodeBatch + prioritizeTag） | src/pet/hero.ts:356-471、698-712 |
| 解码预算 | 每角色 32MiB RGBA 硬上限；96x96x136 = 4.78MiB，256x256x72 = 18MiB | src/pet/pixel-scale.ts:224-321 |
| 命中（交互语义） | regions.json art-px 矩形（头/身/尾）+ states/gesture；hero.hitRegion/hitActor | src/pet/anim/regions.ts；src/pet/hero-page.ts:1843-1859 |
| 命中（点击穿透） | JS 每 100ms/1s（活动/静止）采集 DOM rect + canvas alpha tile（8px tile, alphaMin=8），IPC set_pet_hit_regions；Rust 线程每 60ms GetCursorPos + inner_position + scale_factor 判定，set_ignore_cursor_events(!inside) | src/pet/hit-regions.ts:54-91、201-467；app/tauri/src-tauri/src/main.rs:234-288 |
| 拖拽 | 指针移动 >6px → Tauri getCurrentWindow().startDragging()（OS 模态移动循环）；松手后贴边 settle 2~3 物理像素 | src/pet/hero-page.ts:1706-1841；src/pet/pet-window-dock.ts；src/pet/edge-dock.ts |
| 窗口位置 | localStorage desktop-games/pet/window {x,y,dock}；恢复用 MIN_VISIBLE=96x72 可达性 | src/pet/pet-window-dock.ts:181-355；src/pet/edge-dock.ts |
| 气泡/菜单/设置 | 全部在 pet.html DOM：bubble、pet-shell-menu、设置/TOS/内容中心/composer 都在同一 480x336 窗口 | pet.html:34-148；src/pet/desktop-shell.ts |
| DPI | 窗口 480x336 CSS；hero backing=layout*dpr；dpr 夹 1~3；跨屏 DPICHANGED 由 onScaleChanged/onMoved 触发重栅格化 | src/pet/hero-page.ts:935-999、1080+；ADR-SCALE-DPI-2026-11-20.md D-SCALE-5 |
| 角色切换 | hero hotSwap：先构建新 runtime + 首帧成功再提交；失败保留旧场景 | src/pet/hero-page.ts:1407-1500；src/pet/character-pack-renderer.ts:1-43 |
| 数据契约 | manifest.json（tags/fps/loop/holdMs/assets）+ anim.clips + behavior.json + regions.json；FCI 0.1/0.2/0.3 | src/pet/anim/manifest.ts；public/characters |

### 1.2 已确认的故障链（为何必须换渲染层）

| # | 现象 | 根因 | 证据 |
|---|---|---|---|
| 1 | 启动/动画时“黑框” | 高对比度主题 --famling-content-bg:#000000 被 .book::before 画出；0.2.2 改 CSS | [仓] FIX-2026-11-25.md |
| 2 | 猫屁股“黑条” | 不是 PNG 黑条：尾巴与身体之间 alpha=0 缝隙透出 WebView2/窗口黑底；0.2.3 调 setBackgroundColor([0,0,0,0]) 只是补丁 | [仓] FIX-2026-11-25-BUTT.md |
| 3 | 狗臀部“黑竖条” | 源美术 1px 暗色列（x≈70-74, y≈25-88），已修 | [仓] 同上 |
| 4 | 长时间运行出现不透明黑矩形 / 拖动 ghost 背景 / Win10 黑边 | Tauri 透明窗 + WebView2 合成层平台问题（#16341/#14764/#14823） | [仓] PET-WINDOW-ARCHITECTURE-REVIEW.md；[issue] 链接见 §12 |
| 5 | 透明区域吞桌面点击 / 拖动后旧位置仍遮挡 | WebView2 窗口化宿主拿不到父窗口 NCHITTEST，只能整窗 ignore；layered 命中区域在 SetWindowPos/DPI 后不自动刷新；poller 依赖 Tauri getter 在拖动时阻塞 | [仓] docs/research/PET-OCCLUSION-TECH-2026-11-18.md；[issue] Wails #5229/#5371、WebView2Feedback #446/#5668 |
| 6 | 平台回归不可控 | WebView2 Runtime 144.x 透明窗幽灵标题栏、154.x alpha=0 背景失效；wry 曾在 with_transparent/background_color 上失败 | [issue] WebView2Feedback #5492/#5752；[wry v0.39.4 release notes](https://v2.tauri.app/release/wry/v0.39.4/) |
| 7 | 资源开销 | 透明窗口 + WebView2 进程树常驻；本机隐藏运行 0.2.3 实测 7 个进程、合并 WS 421.7MB（main 30MB + WebView2 ~392MB，含共享页；见 §1.4） | [实测] famling-art-rebuild/work/smoke/famling-app-023 隐藏启动 10s 采样 |

**结论**：继续在 WebView2 层做透明/命中/主题补丁无法收敛（[仓] PET-WINDOW-ARCHITECTURE-REVIEW.md 的 A/B/C/D 对比已论证）。renderer 重构的收益不只是“不黑”，还包括：OS 级逐像素命中（消除 poller 延迟与旧位置残留）、去掉 WebView2 透明路径、去掉 480x336 大透明窗、内存/CPU 大幅下降。

### 1.3 本机 C# 原型可行性（已实测）

- 工具链事实：PATH 中无 cargo/rustc/dotnet/csc/cl/msbuild；但 C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe 存在（.NET Framework 4.8，C# 5）。[实测]
- 2026-11-25 本机用该 csc 编译了一个 Win32 分层窗口探针（P/Invoke：CreateWindowExW、SetWindowLongPtr、CreateDIBSection、UpdateLayeredWindow、WindowFromPoint、mouse_event、GetDpiForWindow），编译 exit 0，运行结果：
  - W1/W2 HWND 创建成功，rect=400,300,600,500，visible=True，GetDpiForWindow=96；
  - UpdateLayeredWindow(ULW_ALPHA, AC_SRC_ALPHA, 预乘 BGRA DIB) 返回 True；
  - 桌面处于锁屏：GetForegroundWindow 类名 LockScreenBackstopFrame，SetCursorPos 返回 False，因此点击穿透/拖拽交互断言无法在本机执行（窗口仍创建成功，说明 GUI API 可用，但锁屏挡住了命中链路）。[实测]
- 结论：**C# 原型是“本机可编译、API 可调用”的快速验证/回归探针路径**，但不能作为发布栈（双栈、签名/杀软、与 Tauri 集成成本）。Rust 产品路径必须走 CI。

### 1.4 现有资产与实测基线（决定内存/性能目标）

| 项 | 数值 | 来源 |
|---|---|---|
| 角色 canvas | 96x96 art px（shipped）；策略支持 64..1024 multiple-of-16 | public/assets/pet/anim/*/manifest.json；pixel-scale.ts |
| 内建角色帧数 | dog 136、cat 143、human 141 = 420 帧 | [实测] 逐目录计数（与 0.2.0 发布“420 帧含别名”一致） |
| PNG 体积 | dog 382.9KB / cat 341KB / human 352.3KB = ~1.08MB | [实测] |
| 解码 RGBA（eager） | 4.78 / 5.03 / 4.96 MiB；三角色合计 14.77 MiB | 96*96*4*N |
| 帧率/节奏 | idle 4~8fps、walk 8~12、run 10~16、attack 12~24 非均匀 holdMs 42~83ms；最长 clip 1s | src/pet/anim/timing.json；manifest.json |
| 单角色帧文件 | clip 目录 idle/idle_00..07 等；<clip>/<clip>_NN.png | ANIM_FRAME_PATTERN |
| 交互区域 | regions.json：head/body/tail 3 个 art-px 矩形 + gestures + actions | public/characters/pet-dog/regions.json 等 |
| 现有窗口 | 480x336 CSS；150% DPI 实测 720x504 物理 | [仓] PET-OCCLUSION-TECH §2.1（UI-WINDOW-2026-11-18 实测） |
| 现有 JS 像素预算 | 32MiB/角色，超额 fail-closed | pixel-scale.ts:224-321 |
| 现有隐藏运行基线 | 7 进程、421.7MB WS（main 30MB + WebView2 6 子进程 ~392MB，含共享页） | [实测] 见上 |

---

## 2. 目标、非目标与约束

### 2.1 目标（按优先级）

1. **视觉正确**：任何时刻窗口内容 = 完整合成的当前帧（sprite + 可选气泡），无黑底/黑条/残影/半帧；24h 运行不退化。
2. **逐像素命中**：透明像素点击穿透到桌面/下层应用，alpha>0 像素命中宠物；无轮询延迟、无拖动后旧位置残留。
3. **像素风正确**：100/200% 严格整数像素；125/150/175% 不模糊（最近邻），像素宽度差 ≤1 device px；用户四层缩放模型（scaling.ts）语义延续。
4. **资源更低**：renderer 常驻 private ≤24MiB、单帧合成+present ≤0.5ms、idle CPU ≤0.5%、动画 CPU ≤1%、首帧 ≤150ms。
5. **行为对齐**：idle/pat/drag/land/sleep/wake/random micro-action、贴边栖居、单实例/托盘召回、全屏隐藏与 0.2.3 等价；角色热切换失败回退。
6. **可维护**：数据契约沿用 manifest/timing/behavior/regions JSON；native 不复制 TS 业务；TS 仍可测。

### 2.2 非目标（v1 明确不做）

- 不做 Live2D/3D/GPU 特效；不做平滑插值（像素画按帧跳变）。
- 不在 pet 窗口做文本输入/IME/composer（全部留在 WebView2 内容窗口）。
- 不做多宠物同屏（渲染器预留多 actor 接口，但 v1 产品只 1 只）。
- 不改变内容/许可/DSH 插件侧逻辑；不动 dsh-famling 的嵌入式动画。
- 不承诺 macOS/Linux；不引入新的账号/网络。

### 2.3 约束

- 本机无 Rust 工具链 → 产品开发 = 写码 + CI 构建 + 本机跑 artifact；C# 仅本机原型。
- 产品目标 Windows 10/11；Win10 与 Win11 合成差异必须矩阵覆盖。
- 现有资产为 96x96 RGBA PNG、straight alpha；manifest 里 fps/loop/holdMs 是唯一节奏真相。
- 已发布 0.2.3 的 webview pet 模式必须保留为双跑回退（feature flag），直到 native 验收全绿。
- 代码许可/美术许可不变；不提交/不 push（本任务只读仓库+写此文档）。

---

## 3. 推荐技术栈与方案对比

### 3.1 方案矩阵（renderer 视角）

| 方案 | 透明/alpha | 逐像素命中 | 资源 | 实现风险 | 本机可验证 | 结论 |
|---|---|---|---|---|---|---|
| **A. Win32 分层窗 + ULW_ALPHA（推荐）** | 系统支持逐像素 alpha，DWM 合成 | OS 按 alpha=0 放行 | CPU 小面积 ULW 很便宜；1 DIB | 低（单个已知 Win32 路径） | C# 探针可验证 API/像素；交互需解锁桌面 | **主方案** |
| B. DirectComposition + DXGI composition swapchain | 需 WS_EX_NOREDIRECTIONBITMAP + premultiplied；DWM 合成 | 不自动；需 layered/WS_EX_TRANSPARENT + 命中逻辑（[neru#1660](https://github.com/y3owk1n/neru/pull/1660) 记录 DComp 透明非 layered 不被 Windows 当 click-through） | GPU 初始化/供电/驱动依赖 | 中高（D3D11 + DComp + DPI + RDP airspace） | 本机无 SDK；更难 | 不选 |
| C. wgpu/winit + 透明 HWND | winit 透明经 DWM，依赖后端/驱动；wgpu 不直接暴露 alpha 命中 | 仍需手动命中/ignore | 大依赖、GPU | 高 | 无工具链 | 不选 |
| D. softbuffer + Tauri 透明窗 | 与 WebView2 透明同路径；社区有 softbuffer 透明窗 fatal panic 先例 | 无 | 中 | 高（[atomic-chat ADR](https://github.com/atomicbot-ai/atomic-chat/blob/0a4fd06dd798af924ff81503cf602294f123cd1a/docs/decisions/2026-07-31-disable-transparent-windows-window-to-stop-softbuffer-panic.md)） | 无 | 不选 |
| E. C# .NET Framework/WinForms 发布 | ULV 可用 | 可用 | 运行时/杀软/签名/双栈 | 中 | **可本机编译** | 仅原型/探针 |
| F. 继续 WebView2 补丁（现状） | 4 层 alpha 叠加 | 无（整窗切换+轮询） | WebView2 进程树 ~390MB WS | 平台回归持续 | 已有 | 否决（架构 A 已批准） |
| G. Tauri 透明窗 + 原生子窗口覆盖 | 两层窗口/子窗口 DWM 交互复杂 | 无 | 中 | 高 | 无 | 不选 |

### 3.2 推荐技术选型（Rust）

- 语言/工具链：Rust edition 2021，stable（CI 的 dtolnay/rust-toolchain@stable，现有 build-windows.yml 已用）；target x86_64-pc-windows-msvc。
- Win32 绑定：windows-sys 0.61（现有 Cargo.toml 已有该依赖，避免引入第二套绑定；需要新增 features：Win32_Graphics_Gdi、Win32_UI_WindowsAndMessaging、Win32_UI_HiDpi、Win32_System_LibraryLoader、Win32_System_Threading、Win32_System_Performance、Win32_UI_Shell）。
- PNG 解码：png 0.17（只解码，不引 image 全家桶；严格 Limits：max width/height、max bytes，防解压炸弹；96x96 PNG 单帧解码 <1ms 量级）。
- JSON：serde + serde_json（已有）。
- 不引入：winit、wgpu、softbuffer、DirectComposition、tokio/async runtime（无必要；消息循环 + 线程即可）。
- 二进制增量：内建帧嵌入约 1.1MB PNG；release 增量 ~1MB 级（可在 CI 实测）。
- 渲染线程：独立 std::thread，拥有自己的 HWND + 消息循环；Tauri 主线程只发命令（mpsc channel / PostMessage(WM_APP)）。

### 3.3 为什么不用 C# 发布（虽本机可行）

1. 双运行时/双击签名：Tauri 主 exe 是 Rust/MSVC；C# 需要 .NET Framework（Win10/11 自带 4.8，但企业环境/精简系统不保证）或 self-contained .NET 8（体积 +60MB）。
2. 集成与生命周期（单实例/托盘/召回/panic 导出/更新）已全在 Rust main.rs，跨语言双进程增加故障面。
3. 性能虽够，但要把 C# 原型做成产品级（DPI、多屏、安全、异常）成本接近 Rust 重写。
→ C# 只作为**本机验证工具与参考实现**（见 §5.4）；产品基线仍是 Rust。

### 3.4 Rust-via-CI 的可行性

| 项 | 评估 |
|---|---|
| CI 是否具备 | 现有 windows-latest + cargo（Tauri build 已跑）[仓] .github/workflows/build-windows.yml:38-49 |
| 构建时间 | 新增独立 native crate 冷构建估计 1~3min（windows-sys+png+serde），Tauri 全量 10~20min；建议拆 fast workflow 只 build/test renderer crate 并上传 exe |
| 本机可运行 | 是：Rust MSVC release exe 在 Win11 直接跑（Tauri 已有同 target 产物）；建议 +crt-static 或确保 VC runtime（本机/用户机已有） |
| 本机迭代 | 慢（每轮 5~15min）；缓解：C# 原型验交互/像素；纯 Rust 逻辑单测放 CI；一次实现多、少迭代；可选安装 rustup（本机当前无，不在本任务批准范围） |
| 回滚 | feature flag 回 WebView pet 模式；native 崩溃自动回退需宿主 watchdog（见风险 R10） |

---

## 4. 渲染架构设计

### 4.1 进程/线程拓扑（与 task-15 对齐）

    Tauri host (Rust, main thread)                    Native renderer thread (Rust)
      ├─ 单实例/托盘/崩溃导出（保留 main.rs）            ├─ Win32 message loop（自有 HWND）
      ├─ 设置/内容 WebView2 窗口（按需开，普通不透明）    ├─ FrameCache + ClipScheduler
      ├─ Tauri commands ← 内容窗口 JS                   ├─ Sprite window (ULW)
      └─ PetRenderer API ── mpsc/PostMessage ──────────▶ ├─ Bubble window (ULW, click-through)
                                                       ├─ InputRouter / Drag / Dock
                                                       └─ Menu (TrackPopupMenuEx)

- **v1 推荐进程内线程**：无 IPC 协议/安全面；崩溃用 catch_unwind 包住消息循环，失败时 host 关闭 native 窗口并（feature flag 允许时）回退 WebView pet。
- **API 保持进程无关**：PetRendererHandle 只暴露命令/事件通道；若后续要进程隔离（task-17 可能建议），加一个 named-pipe 前端即可，不改渲染内部。
- 渲染线程只在启动时创建；退出时 PostMessage(WM_CLOSE) + join（超时 2s 后放弃，进程退出兜底）。
- 线程优先级：默认；不要 TIME_CRITICAL（桌宠不该抢 CPU）。消息循环用 MsgWaitForMultipleObjectsEx 等待 timer + input，天然阻塞省电。

### 4.2 窗口模型（pet 主窗口 / 气泡窗 / 菜单）

**主窗口（sprite）**：
- CreateWindowExW：WS_POPUP | WS_VISIBLE(首帧后再 ShowWindow)；EX：WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE。
- 不置 taskbar；不抢焦点（WS_EX_NOACTIVATE + WM_MOUSEACTIVATE→MA_NOACTIVATE）；无边框/无阴影。
- 尺寸语义：client = sprite 的设备像素尺寸（canvas * deviceScale），窗口不透明内容占满整个 client；窗口即 sprite，透明像素自动穿透。
- 位置：sprite 的 foot-center anchor 在窗口底部中心；locomotion 走 SetWindowPos（物理整像素）；窗口位置持久化自己管理（见 §4.11）。
- 首帧时序：创建时 SW_HIDE → 解码 idle 首帧 → 组第一帧 → UpdateLayeredWindow → ShowWindow(SW_SHOWNOACTIVATE)。官方文档明确 layered window 在 ULV/SetLayeredWindowAttributes 之前不可见，天然无“黑闪”。
- 窗口类名固定（如 Famling.NativePetWindow.v1）+ 窗口标题含角色；单实例召回用 FindWindowW(class, null)/EnumWindows + 自定义 WM_APP_RECALL，不再依赖标题（现状 main.rs 用标题，改角色会失效）。

**气泡窗口（独立）**：
- 独立 HWND：WS_POPUP、EX：WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | **WS_EX_TRANSPARENT**。
- WS_EX_TRANSPARENT 使整个气泡窗不参与命中（点击全穿透）——气泡是纯视觉，不允许吞桌面点击；若要“点气泡关闭”，用 1 个小的不穿透热区或改为 1.5 版本再评估（v1 不做）。
- 尺寸 = 当前气泡文本布局后的物理 px（上限 clamp 到当前 monitor 工作区）；位置 = sprite 上方居中，越界时翻转/下移/左右 clamp。
- 文本用 DirectWrite 灰度 AA 渲染到 32bpp 预乘位图（或 GDI+ 在 C# 原型），CJK 用系统字体 Microsoft YaHei UI/Segoe UI；emoji 不支持彩色时降级为单色或过滤（记录文案约束）。
- 气泡窗显示/隐藏 = ShowWindow + ULV；只在文本/位置变化时重绘（通常几秒一次），成本可忽略。

**菜单**：
- 分阶段（与 02 的 Phase 1/Phase 2 对齐）：**P1 最小可用 = 右键直接打开 WebView2 内容窗口的 settings 路由**（保证声明/About/数据控制入口可达，满足 02 §5 的同意可达性约束）；**P2 = 原生 Win32 popup menu（TrackPopupMenuEx）**，不自己画在 pet 面上：菜单是独立窗口，系统负责命中/键盘/无障碍/点击外部关闭。
- 条目来自 host（i18n 在 WebView 侧生成标签，native 只拿 label+action id）：内容中心、设置、静音、Advisers 开关、复位窗口、退出等；角色专属动作来自 regions.json actions。
- 打开模式：SetForegroundWindow(petHwnd) → TrackPopupMenuEx(..., TPM_RIGHTBUTTON|TPM_RETURNCMD/TPM_NONOTIFY) → PostMessage(petHwnd, WM_NULL)（托盘菜单同款；WS_EX_NOACTIVATE 下显式 SetForegroundWindow 通常允许，因为刚收到用户点击；若失败，回退：临时清 NOACTIVATE → 菜单 → 恢复）。
- v1 用系统样式菜单（可用 owner-draw 保留像素风），无障碍优先；像素风自绘菜单作为 P2 可选。

**为什么不是“一个窗口全画”**：气泡/菜单会撑大 ULV surface 面积（成本随面积线性），且气泡需要独立贴边/穿透；拆开后 pet 窗口始终只有 sprite 大小（147KB@2x），present 最便宜。

### 4.3 资产管理：内建嵌入 + DLC 运行时加载

数据契约完全沿用现有 JSON（不新造 pack 格式）：
- character.json（FCI 0.1/0.2/0.3：id/version/type/species/canvas/anchor/footBox/bbox/display/packBase/license/ai/capabilities/fallback/slots…）
- manifest.json（famling.pet-anim/0.1：canvas/anchor/footBox/tags/anim.clips/fpsBands/tracks/bubblePolicy/voice/specOnly/assets）
- behavior.json（famling.behavior/0.1：states/slots/rules/ambient/abilities）
- regions.json（version 1：regions/gestures/actions）
- PNG 帧 <clip>/<clip>_NN.png（96x96 当前；上限 64..1024、16 对齐、decoded 32MiB/包）

**内建角色（3 个）**：build.rs 扫描 public/characters/*/{character,behavior,regions}.json + public/assets/pet/anim/*/manifest.json + PNG，做构建期校验并生成：
- OUT_DIR/embedded_assets.rs：每个资产一个 include_bytes!(...) + EmbeddedPackMeta { pack_id, version, canvas, frames: &[(clip,index,bytes)] }；
- 校验：canvas 与 manifest 一致、frame 数与 assets 一致、每帧 PNG 头 96x96（或 canvas）、alpha 存在、decoded budget ≤32MiB、JSON schema 轻量校验；失败让 CI 红。
- 收益：便携 zip 只带 exe；启动零文件 IO；第三方无法篡改内建包；帧数据在只读 .rdata，常驻内存不占私有堆。

**DLC/第三方包**：安装目录（%APPDATA%/Famling/packs/<id>/ 或市场安装路径）——运行时文件 loader：
- 拒绝绝对路径/.. /符号链接跳出根目录；只读；单文件 ≤8MiB；总包 PNG 解码 ≤32MiB；manifest 严格 parse；未知字段忽略但版本必须支持；失败保持当前角色并返回错误码。
- 与内容市场安装器（现有 TS 侧）约定：安装完成后通过 Tauri command pet_activate_pack(pack_id)；native 只认 host 给的白名单目录。

### 4.4 帧缓存设计（PNG 解码/预乘/内存）

**数据单位**

    Frame {
      w: u32, h: u32,
      premul_bgra: Vec<u32>, // 96*96*4 = 36,864 B; premultiplied BGRA
    }
    Clip { id, frames: Vec<Arc<Frame>>, hold_ms: Option<Vec<u32>>, fps, loop, layer, priority }
    Pack { meta, clips: HashMap<String, Clip>, decoded_bytes: AtomicUsize }

**解码流程（loader 线程，不占渲染线程）**
1. 读 PNG 字节（内建：&'static [u8]；DLC：fs::read with size cap）→ png::Decoder(Limits{ bytes: 8MiB, .. }) → 校验 IHDR：w/h == canvas、像素 RGBA8、非交错/或支持交错但归一。
2. 行序 RGBA8 → 预乘：r = r*a/255, g, b（逐像素整数乘法），输出 BGRA 字节序（ULW 的 DIB 是 BGRA）——一次遍历完成，36,864 像素 ~ 0.1ms。
3. 入缓存；命中失败（尺寸不符/解码错误）→ 该帧标 Error，角色激活失败并回退旧角色（不进入半坏状态）。
4. 首帧门：加载角色时先同步解码 idle 的前 1 帧（≤5ms）→ 可立即显示；再同步解码 idle 全 clip（8 帧 ≤40ms）→ 可开始 idle 动画；其余 clip 后台按优先级解码。

**缓存策略（两级）**
- L0 常驻：当前角色 idle clip + 当前 clip + 下一个可能 clip（behavior 的 ambient 池/交互规则概率前 2）——通常 ≤20 帧 ≈ 0.75MiB。
- L1 LRU：按“角色+clip”为槽（不是按帧），每槽全解码后整体可用；上限 = min(32MiB/角色, 24MiB 全局单角色 + 额外 2 角色各 8MiB)。超过则淘汰最久未用且非当前 clip 的槽；淘汰整槽避免半解码状态。
- 角色切换后旧角色保留为“最近 1 个”缓存（快速切回 ≤100ms），再切第 3 个才释放；总 decoded ≤48MiB 硬上限，超出立即淘汰。
- 解码线程优先级低；切换角色时先加载新角色 idle（同线程且可抢占队列），旧角色保持显示直到新首帧 ready → 原子换（避免闪烁/半帧）。
- 禁止 eager 全包 decode（与现有 32MiB 红线的精神一致，但 native 可以更省：不常看的 clip 不留在内存）。

**缩放缓存**：不做全帧预缩放（96x96→S 最近邻 <20µs/帧）；只对气泡文本位图做“内容变化才重建”的缓存。

**内存账（单角色 idle 全热）**
- 帧 4.78MiB（全 136 帧都热时）；
- DIB：96*L 的 sprite 窗口，L=2 → 192²*4 = 147KB；L=4 → 590KB；
- 气泡位图：≤ 520x240*4 ≈ 0.5MB（仅显示时）；
- 代码/运行时 ~2-3MiB private；
- renderer 常驻 private 目标 ≤12MiB（单角色 idle+当前 clip），全热 + 双角色缓存 ≤40MiB；总 app（含 Tauri 内容窗口）目标 ≤120MiB（现基线隐藏 421.7MB WS；内容窗口打开时才计入 WebView2）。

### 4.5 合成器与整数/DPI 缩放

坐标与尺寸全部在**物理像素**（窗口 client = 设备像素），不存在 Tauri/WebView 的 CSS px 与 dpr 两套坐标，这是简化点也是验收重点。

**缩放决策（延续 scaling.ts 的四层语义）**
- 输入：用户 global（0.5~2）、image 轴（0.5~2）、组件 bubble/menu zoom、monitor DPI（GetDpiForWindow/GetDpiForMonitor 96/120/144/168/192）、canvas art 尺寸。
- logical scale：L = clamp(round(2 * global * image), 1, 8)（2 = shipped 基准；等价 scaling.ts 的 heroZoom 语义；1024 canvas 需要倒数时用 1/2、1/4 策略另行 fit）。
- 设备映射：S = L * dpi / 96；sprite 设备尺寸 = round(canvasW * S)、round(canvasH * S)；绘制用最近邻 srcX = floor(dstX * canvasW / dstW)。
- 100%/200%：S 整数，逐像素严格整数倍（96*2=192@100%，96*4=384@200%）。
- 125%：L=2 → S=2.5，输出 240 device px；像素列宽在 2/3 交替，但**绝不模糊**（最近邻）；这是与现有 WebView backing 行为一致的取舍。175%：S=3.5 → 336；同样交替。
- 提供设置“显示缩放：平滑尺寸 / 严格整数像素”（默认沿用现状=平滑尺寸）；严格整数时 S 取 round 到整数，物理尺寸最多 ±20%，由用户 image 轴 5% 步进补偿。
- 多屏/DPICHANGED：重算 S、重建 DIB、ULW 新 psize、SetWindowPos 新位置（用 lParam 建议 rect）；sprite/气泡/菜单位置与贴边状态重算；不重启应用（改进 ADR-SCALE-DPI 的“重启生效”现状）。
- 气泡/菜单：文字/内边距按 UI zoom * dpi/96 缩放；系统菜单交给系统缩放（系统感知）；若 owner-draw，按 dpi 选字体。

**合成（每帧）**
1. memset(dib, 0, len)（或仅清上一帧 dirty 区域；v1 全清，192²*4=147KB ~ 5µs）。
2. 当前帧 pre-multiplied BGRA 最近邻 blit 到目标区域（sprite 窗口就是全窗口）。
3. 若气泡窗可见：同上绘制气泡（独立 DIB/窗口）。
4. UpdateLayeredWindow(hwnd, screenDC, nullptr, &size, memDC, &src, 0, &blend{AC_SRC_OVER, 255, AC_SRC_ALPHA}, ULW_ALPHA)；位置不变时 pptDst=nullptr，仅内容变化；尺寸变化时给 psize。
5. 记录 present 计数/耗时/期望 frame id（debug QA 用）。

**为什么不需要额外 GPU/双缓冲**：系统在 ULW 时自己保存层内容并做 DWM 合成；我们只提供完整的一帧。DIB 常驻 + 每帧全量写，天然双缓冲语义（新内容在 ULV 时原子生效）。

---

### 4.6 帧调度器（无撕裂 / 低功耗）

**目标**：只在“应该换帧/换状态/气泡/位置变化”时唤醒；播放节奏精确到动画帧 deadline（4~16fps，attack 峰值 24fps）；不 60Hz 空转；绝不出现半帧。

**时钟与 deadline**
- 单调时钟：QueryPerformanceCounter（std Instant）。
- Clip 的帧 deadline = clip 起点 + 累计 hold（holdMs 优先，否则 1000/fps）；attack 的 holdMs 42/63/83ms → 最紧 ~42ms。
- 行为状态机（native 版 SceneRuntime）固定 250ms step（与 TS 一致）作为第二个 deadline；idle ambient 触发是随机区间 → 取 min 后设 timer。
- 计时器：CreateWaitableTimerExW(NULL,NULL, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS)（Win10 1803+，[官] 文档明确 high-resolution，适用于“几毫秒级延迟”）；SetWaitableTimerEx 到下一个 deadline（相对，100ns 单位）。**不建议用 WM_TIMER 做动画节拍**：默认 15.6ms 粒度 + 消息队列抖动，attack 的 42ms hold 会漂移；但 OS 模态拖动循环期间可用 WM_TIMER 兜底保持 drag 姿态（此时 MsgWait 主循环暂停，02 的 Phase 1 用 WM_TIMER 是可接受的简化）。

**消息循环**

    loop {
      MsgWaitForMultipleObjectsEx(1, &timer, INFINITE, QS_ALLINPUT, MWMO_INPUTAVAILABLE)
      drain messages (PeekMessage)
      if quit -> break
      now = Instant::now()
      if now >= next_deadline { advance clock; recompute state/frame; compose+ULW; next_deadline = ...; SetWaitableTimerEx(...) }
    }

- **无轮询**：没有动画/无气泡/静止时 next_deadline = 下一次 ambient（秒级）或 INFINITE；idle 时 CPU 接近 0。
- **present-on-change**：只有 (frame index, window position, bubble visible/text, character) 变化才 ULV；同一帧重复不重绘。
- **追帧策略**：窗口被拖住/系统卡顿导致 now 超过 deadline 时，按 elapsed 重算应显示帧，跳过积压（不快速连播）；超过 2 帧迟到则直接对齐到当前时刻，记录 dropped 计数。
- **无撕裂保证**：ULW 是整层内容原子替换 + DWM 合成，硬件上不会出现“上半帧旧、下半帧新”。验收用 240fps 屏幕录制/窗口捕获逐帧哈希验证（§9）。
- **DwmFlush**：不需要（不追求 0-latency vsync；动画 4~16fps，DWM 合成延迟 ≤1 vblank）。若 QA 发现拖动后首帧延迟，可在 show/dpi 变化后一次 DwmFlush（[官] DwmFlush 语义）。
- **拖动**：手动拖期间不运行动画调度（状态切 drag clip，按 8~12fps 继续；窗口位置由鼠标消息驱动，不动画插值）；松手后恢复并做 2~3 帧贴边 settle（每帧 deadline 16ms 或按原有 settle 逻辑）。
- **隐藏/全屏**：SHQueryUserNotificationState 全屏/演示模式 → hide pet+bubble（沿用 main.rs 现有逻辑）；hide 时定时器可停（deadline=INFINITE）。
- **睡眠/唤醒**：WM_POWERBROADCAST/PBT_APMRESUMEAUTOMATIC 后重算 DIB/位置（显示器变化走 WM_DISPLAYCHANGE）。

**抖动预算**：deadline 误差目标 p95 ≤2ms、p99 ≤8ms（高精度 timer 应可做到）；单帧 present ≤0.5ms（96x96→S 缩放 + ULV 147KB）。若超出，优先减少 ULV 调用（只在变化时）而非优化像素循环。

### 4.7 命中测试与输入语义

**命中（点击穿透）**
- 交给 OS：ULW 分层窗的 alpha=0 像素自动放行（[官] 原文见 §0/§12）；alpha>0 的像素接收鼠标。无需任何 hit-region IPC/轮询。
- 对 alpha 极小（1~254）的 AA 边缘：也会接收鼠标。这是可接受的（现状 canvas alpha>0 采样同理）；若用户抱怨边缘“点不到桌面”，后续可在合成时把 alpha<8 的像素清零（视觉会略硬），v1 不做。
- 窗口外/窗口未显示：自然穿透；气泡窗 WS_EX_TRANSPARENT 全穿透。

**交互语义（regions.json）**
- WM_LBUTTONUP 时用当前帧把 client 物理 px → art px：artX = (px - spriteX_dev) * canvasW / spriteW_dev；再按 regions.ts 的 heroRegionHitAt/heroRegionAt 规则（priority 排序、states 白名单、gesture）命中 head/body/tail → 事件（pat/stand_wag/…），整只角色 alpha>0 区域作 fallback（hitActor 语义）。
- 双击/单击：自己计时（≤350ms 两次点击 → double）；单击延迟 150ms 等双击判定（或 v1 不做双击，保持现状 tap 语义；现状有 pat 但无双击专属动作，建议 v1 不做双击）。
- 右键：WM_RBUTTONUP → 打开菜单；Shift+F10/键盘：通过内容窗口或 tray 触发菜单（pet 窗口无法聚焦，键盘入口走内容窗口/tray）。
- 滚轮：可选（摸头/音量？）v1 不绑定，明确不吞。
- 光标：WM_SETCURSOR 在 sprite 上可设手型/默认；拖动时 no。
- IME：创建窗口后 ImmAssociateContext(hwnd, NULL) 禁用输入法挂接（避免焦点/输入法注入；同类实测注入率 6/10→0/10）；pet 窗口不做任何文本输入。
- 焦点：WM_MOUSEACTIVATE 返回 MA_NOACTIVATE；不抢当前输入焦点（用户打字时点宠物不打断）。

**命中语义与点击穿透的区别**（避免混淆）
- 点击穿透几何 = 系统按合成 alpha 自动决定（不可编程阈值）。
- 交互语义 = regions.json 的矩形/状态/gesture（程序逻辑），只决定“点到宠物后触发什么”，不决定“是否点得到”。

### 4.8 拖拽与贴边（drag / edge-dock）

**拖拽 v1 = OS 模态移动循环（默认，与 02 的集成方案一致）**：
- 触发：WM_LBUTTONDOWN 记录；超过 6 logical px 阈值后 ReleaseCapture + SendMessage(WM_NCLBUTTONDOWN, HTCAPTION) 进入系统移动；WM_ENTERSIZEMOVE 隐藏气泡、切 drag 姿态；WM_EXITSIZEMOVE 后做贴边 settle + 持久化。
- 优点：多显示器/跨 DPI/任务栏/系统吸附交给 Windows；代码少；与 0.2.3 的 startDragging 体验一致。
- 代价：模态移动循环期间本线程只派发消息，不执行 MsgWait 主循环 → 帧调度暂停（拖动中的 drag 动画可由 WM_TIMER 兜底或直接冻结，桌面宠物可接受）；拖动中不做贴边预览。

**手动拖（回退，若 NOACTIVATE 下 OS 移动循环异常/需要精确控制/需要拖动中动画）**：SetCapture + WM_MOUSEMOVE → SetWindowPos；不抢焦点、消息循环不被模态阻塞；实现：

    WM_LBUTTONDOWN: if alpha hit -> SetCapture; dragging=maybe; grab=(cursor-window); set timer deadline for drag clip
    WM_MOUSEMOVE: if captured && dist>=6 logical px: dragging=yes; SetWindowPos(hwnd, HWND_TOPMOST, cursor.x-grab.x, cursor.y-grab.y, 0,0, SWP_NOSIZE|SWP_NOACTIVATE); hide bubble; emit drag.start once
    WM_LBUTTONUP: ReleaseCapture; if dragging -> emit drag.end/land (behavior rules) -> dock settle; else -> tap/region interaction
    WM_CAPTURECHANGED: treat as release

- 拖动时窗口位置直接跟鼠标（不插值），像素画宠物的移动是整像素的。
- 跨屏：WM_DPICHANGED/WM_DISPLAYCHANGE 在拖拽中也要处理（重建 DIB → 继续拖）；阈值/坐标全部物理 px。

**贴边栖居（edge-dock）**
- 释放后：MonitorFromWindow + GetMonitorInfoW 取 workArea（物理 px，含任务栏）；可见宠物 rect = sprite 窗口 client rect（因为窗口=sprite，不再有“透明边距 overhang”）。
- 阈值 = 24 logical px * dpi/96（沿用 EDGE_DOCK_THRESHOLD_LOGICAL_PX=24）；左右/上下独立判定，允许 corner 双贴。
- 目标位置：把 sprite rect flush 到 workArea 边；仍保留可达性下限 MIN_VISIBLE=96x72（与 edge-dock.ts 常量一致；注意：edge-dock.ts 注释引用的 desktop_guard.rs 在当前 famling 检出中不存在，native 侧应成为常量真相源，并用测试把 TS/Rust 常量钉在一起）。[仓]
- settle：2~3 个整数物理像素帧（沿用 planWindowSettle 的 ease-out 无 overshoot；1px 移动直接一步）；reduce-motion 时 1 步直达。
- 持久化：%APPDATA%/Famling/pet-window.json（x,y,dock）；恢复时用“与 workArea 交集 ≥96x72”的可达性校验（等价 resolveRestoreMatch）；旧 localStorage 位置迁移：首次 native 启动由内容窗口/主进程读一次 localStorage 并传给 native（或忽略并回默认角，作为明确的产品决定）。
- 位置更新与 ULV 解耦：窗口移动用 SetWindowPos；内容不变时不 ULV（省 CPU）。
- 全屏/任务栏/负坐标多屏：workArea 用物理坐标 i32（可为负），不做 u32 转换（沿用现有 TS 的教训）。

### 4.9 气泡 / 菜单 / 设置入口的归属（明确边界）

| 界面 | 归属 | 理由 |
|---|---|---|
| 角色 sprite / 动画 | native pet 窗口 | 核心渲染，必须逐像素 alpha+命中 |
| 对话气泡（speech/thought） | native 独立气泡窗（穿透、不抢焦点） | 紧贴宠物；面积小；不能让 WebView2 透明窗回归；不能吞桌面点击 |
| 右键/⋯ 菜单 | P1：打开 WebView2 内容窗口；P2：native Win32 菜单 | P1 先保证设置/声明可达；P2 用系统菜单拿系统级命中/键盘/无障碍，避免画进 layered surface |
| 设置 / 内容中心 / 角色切换 / TOS / 同意 / Advisers 面板 | WebView2 内容窗口（普通不透明窗口） | 大量文本/表单/滚动/无障碍/i18n 已在 WebView 实现；透明问题只在 pet 窗口 |
| 打字输入 composer / AI 回复卡片 | WebView2 内容窗口 | 输入法/文本编辑/复制粘贴/无障碍原生很难做对；不要放进 NOACTIVATE pet 窗口 |
| 托盘图标/菜单 | 现有 Tauri tray（main.rs） | 已发布、无需渲染 |
| 拖拽中的“摸头”等瞬时反馈 | native pet 窗口（动画/表情） | 与 sprite 同帧呈现 |
| 声音/TTS 播放 | 现有 Rust/WebView 音频链路 | 不在 renderer 范围 |

- 气泡文本/AI 标识：host 传入 {text, semantic: speech|thought, attribution, durationMs}；native 只画；不读模型/网络。
- 气泡与 pet 的 z-order：两者都 topmost；显示气泡后 SetWindowPos(bubble, HWND_TOPMOST,...) 保证在 pet 上方。
- 设置入口：菜单“设置…”→ host 打开/聚焦内容窗口（Tauri WebviewWindowBuilder/show）；内容窗口关闭不影响 pet。
- 无障碍：系统菜单天然可读；气泡是视觉信息，v1 有 **a11y 回归风险**（原 role=status aria-live 丢失）。缓解方案（P2）：host 在内容窗口（若打开）镜像 aria-live 文本；或 native 侧实现 UIA Text/Notification 事件；在 native 成为默认前必须给出方案（见 R7）。

### 4.10 多角色切换（multi-character switching）

- 触发：内容窗口角色/内容中心选择 → Tauri command pet_activate_character(pack_id) → host 校验（内建白名单或已安装 DLC）→ renderer 命令 ActivatePack{dir, expected_meta}。
- 加载顺序（失败不破坏当前显示）：
  1. load 新 manifest/behavior/regions → 校验（canvas/frames/budget；voice 不做 UI 逻辑）；
  2. 解码新角色 idle 首帧 + 全 idle clip（≤50ms）；
  3. 组合新首帧并 ULV（原子切换）；
  4. 释放/降级旧角色为 LRU；后台解码其余 clip；
  5. 若任一步失败：保持旧角色，返回错误码给 host/内容窗口 toast。
- 快速切换：最近 1 个旧角色缓存保留；≤2 次来回不重新解码（≤100ms）。
- 角色尺寸不同（96 vs 256 canvas）：窗口按新 canvas*L 重算尺寸与位置（保持 foot-center 世界坐标），必要时 clamp 进 workArea；切换后重算贴边。
- 行为/区域数据跟随角色（behavior.json/regions.json），native 状态机重置到 idle；正在拖拽时延迟切换（等 drag.end）。
- 多角色同屏（未来）：渲染器内部用 Actor 列表（每个 actor 自己的 pack/布局/窗口位置），窗口边界 = union，命中按 actor 顺序；v1 不开放，但数据结构预留。

### 4.11 多显示器 / DPI / 会话变化

- 进程 DPI 感知：manifest 声明 PerMonitorV2（[官] setting-the-default-dpi-awareness：[dpiAwareness] PerMonitorV2）；SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) 兜底（若宿主未声明）。同一进程内 Tauri 的 WebView2 窗口也受益。
- WM_DPICHANGED：用 lParam 建议 rect → 重算 S、重建 DIB、ULW 新尺寸、SetWindowPos、气泡重排、贴边重算；不重启。
- 已知坑（必须在实现中处理）：同类框架记录 layered 窗口的命中区域在 SetWindowPos/WM_DPICHANGED 后可能不刷新（Wails #5371）；对 ULW 窗口**不能用 SetLayeredWindowAttributes 刷新**（官方：调用后后续 UpdateLayeredWindow 会失败，[官] SetLayeredWindowAttributes 备注），正确做法是重新 ULW 完整内容/尺寸；若仍异常，尝试 toggle WS_EX_LAYERED（清位→ULW→设位）并记录。验收测试覆盖“旧位置是否还吞点击”。
- WM_DISPLAYCHANGE / WM_SETTINGCHANGE：重算 monitor/workArea/DIB；显示器睡眠唤醒同理。
- RDP：远程会话下分层/合成可能降级（navop 的 RDP airspace 修复显示 layered 在捕获/RDP 下有坑）；v1 回退策略 = 检测 GetSystemMetrics(SM_REMOTESESSION) → 若异常则隐藏 native pet（或在设置里禁用 native renderer），不崩溃不吞输入。
- 多屏混合 DPI、负坐标：所有坐标 i32 物理 px；MonitorFromWindow + GetMonitorInfoW；测试矩阵见 §9。

### 4.12 内存 / 性能目标（验收口径）

| 指标 | 目标（p95） | 测量方法 |
|---|---|---|
| renderer private（单角色 idle，窗口 2x） | ≤12MiB | GetProcessMemoryInfo PrivateUsage；隐藏/可见分别测 |
| renderer private（全角色缓存+气泡） | ≤40MiB | 同上；双角色来回切换后 |
| 总 app RSS（native 模式，内容窗未开） | ≤120MiB（现状隐藏基线 421.7MB WS） | 进程树 WorkingSet + PrivateBytes |
| 首帧（命令→首个 ULV 可见） | ≤150ms（内建）/ ≤300ms（DLC） | 日志时间戳 |
| 单帧合成+ULV（192² 窗口） | ≤0.5ms | QPC 采样 p99 |
| 单帧合成+ULV（384²，200%） | ≤1.5ms | 同上 |
| idle CPU（1 分钟均值，单角色 idle 动画） | ≤0.5%（9950X 单核占比） | GetProcessTimes 差分 |
| 动画/交互 CPU | ≤1%（avg）/ ≤2%（attack+拖动） | 同上 |
| 拖动 CPU | ≤2% | 10s 连续拖动 |
| 调度抖动 | deadline 误差 p95 ≤2ms / p99 ≤8ms；丢帧 <0.1% | 内部 QA 计时直方图 |
| 记忆体 24h 漂移 | RSS 漂移 ≤5%，GDI/USER 句柄 0 增长 | GetGuiResources 采样 |
| 角色切换 | 内建 ≤300ms（显示新首帧） | 日志 |
| 解码 | 单帧 ≤2ms，idle clip ≤40ms（96²） | 日志 p95 |
| present 次数 | 只随状态变化（idle 6~8fps 即 ~8/s；静止=0） | 计数器导出 |

---

## 5. 代码级方案草图

### 5.1 Rust crate 结构（新目录 app/native/pet-render/）

    app/native/pet-render/
      Cargo.toml                 # windows-sys 0.61, png 0.17, serde, serde_json, thiserror
      build.rs                   # 内建资产扫描→OUT_DIR/embedded_assets.rs；构建期校验
      src/lib.rs                 # 对外 API：PetRenderer, PetCommand, PetEvent
      src/host.rs                # 渲染线程生命周期/命令通道/panic 边界
      src/window/sprite.rs       # 主窗口 HWND + ULV + DIB
      src/window/bubble.rs       # 气泡窗（layered + WS_EX_TRANSPARENT）
      src/window/menu.rs         # TrackPopupMenuEx
      src/render/compositor.rs   # 清屏/最近邻 blit/预乘合成
      src/render/dib.rs          # CreateDIBSection 封装
      src/render/text.rs         # 气泡文字布局/光栅化缓存（DirectWrite 或 GDI 路径）
      src/asset/png.rs           # PNG 解码器（Limits/尺寸校验）
      src/asset/cache.rs         # 帧缓存/LRU/预算
      src/asset/embedded.rs      # include_bytes 资产表（build.rs 生成）
      src/asset/disk.rs          # DLC/第三方包文件 loader（路径安全/上限）
      src/pack/mod.rs            # character/manifest/behavior/regions 解析
      src/anim/clip.rs           # ClipSpec/帧 deadine 计算（与 timing.ts 对齐）
      src/anim/behavior.rs       # 最小状态机（states/slots/ambient/transition，与 scene/runtime.ts 对齐）
      src/anim/scheduler.rs      # 绝对 deadline + waitable timer + MsgWait
      src/input/hit.rs           # art-px 映射 + regions 语义命中
      src/input/drag.rs          # SetCapture/阈值/SetWindowPos/释放
      src/input/dock.rs          # workArea/贴边/settle/持久化
      src/diag.rs                # QA 计数器/直方图/导出（present、deadline、dropped、cache）
      src/ffi.rs                 # windows-sys 辅助（IntPtr 样板/错误转换）

### 5.2 对外 API（供 Tauri host 调用）

    pub struct PetRendererHandle { tx: Sender<PetCommand>, join: Option<JoinHandle<()>>, events: Receiver<PetEvent> }

    pub enum PetCommand {
      ActivatePack { pack: PackSource, reason: SwitchReason },
      SetScales { global: f32, image: f32, bubble: f32, menu: f32 },
      SetPaused(bool),                    // 全屏/低功耗/隐藏
      ShowBubble { text: String, semantic: BubbleSemantic, attribution: Option<String>, duration_ms: u32 },
      HideBubble,
      ShowMenu { items: Vec<MenuItem>, x: i32, y: i32 },
      SetLocomotion { dx_art: i32 },      // 可选：走/跑位移由行为层给
      Recall,                             // single-instance 召回
      Shutdown,
    }

    pub enum PetEvent {
      Ready { hwnd: isize, dpi: u32 },
      Frame { clip: String, index: u32, at_ms: u64 },
      Tapped { region: Option<String>, local: (i32, i32) },
      DragStart { local: (i32, i32) },
      DragEnd { edges: Vec<DockEdge>, position: (i32, i32) },
      MenuAction { id: String },
      BubbleClicked,                      // v1 不产生（穿透），保留协议位
      Error { code: ErrorCode, message: String },
    }

- Tauri 侧：setup() 里创建 handle，把 events receiver 交给一个线程转发到 Tauri 事件/内容窗口（或直接调 window.emit）。
- 内容窗口 Tauri commands：pet_activate_character、pet_set_scales、pet_show_menu、pet_recall、pet_debug_state。
- 所有失败返回稳定 code（不 panic 跨线程）。

### 5.3 关键算法伪代码

**（a）帧截止与推进**

    fn next_deadline(clip: &ClipSpec, frame: u32, clip_started: Instant) -> Instant
    fn advance(now: Instant):
        while now >= clip_started + cumulative_hold(current+1): current += 1
        if current != last_drawn || dirty: compose(); present(); last_drawn = current
        if !loop && current == frames-1: schedule fallback state (behavior after/timeout)

**（b）最近邻合成（预乘 BGRA，窗口整个 surface）**

    fn blit_nearest(dst: &mut [u32], dw: u32, dh: u32, src: &[u32], sw: u32, sh: u32) {
        for y in 0..dh {
            let sy = (y as u64 * sh as u64 / dh as u64) as u32;
            let src_row = &src[(sy * sw) as usize..((sy + 1) * sw) as usize];
            for x in 0..dw {
                let sx = (x as u64 * sw as u64 / dw as u64) as u32;
                dst[(y * dw + x) as usize] = src_row[sx as usize];
            }
        }
    }

（1:1 可走 memcpy；缩放全 CPU，**禁止 GDI StretchBlt**，否则 alpha 丢失——[掘金]实测坑）

**（c）ULW present**

    let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER, BlendFlags: 0, SourceConstantAlpha: 255, AlphaFormat: AC_SRC_ALPHA };
    UpdateLayeredWindow(hwnd, screen_dc, dst_pos_ptr, size_ptr, mem_dc, &src_origin, 0, &blend, ULW_ALPHA);

- 首帧：创建窗口时 SW_HIDE；先 ULV 再 ShowWindow(SW_SHOWNOACTIVATE)。
- 尺寸/位置不变时只更新内容（避免无谓窗口重排）。

**（d）命中语义映射**

    fn art_point(client_x: i32, client_y: i32, canvas: (u32,u32), dev: (u32,u32)) -> Option<(f32,f32)> {
        let ax = client_x as f64 * canvas.0 as f64 / dev.0 as f64;
        let ay = client_y as f64 * canvas.1 as f64 / dev.1 as f64;
        if ax < 0.0 || ay < 0.0 || ax >= canvas.0 as f64 || ay >= canvas.1 as f64 { None } else { Some((ax as f32, ay as f32)) }
    }
    // 然后按 regions.json：priority 排序 + gesture + states 白名单；未命中 region 时回退 hitActor（alpha>0）

**（e）拖拽/贴边状态机（回退手拖方案；默认 OS 模态循环只需 WM_ENTERSIZEMOVE/WM_EXITSIZEMOVE）**

    enum DragState { Idle, Pressed { grab: (i32,i32), started: bool }, Dragging { grab: (i32,i32) } }
    // WM_LBUTTONDOWN: alpha>0 -> Pressed
    // WM_MOUSEMOVE: Pressed + dist>=threshold -> Dragging (SetCapture 已有)
    // WM_LBUTTONUP: Dragging -> dock::settle(hwnd, monitor_work_area); Pressed -> input::tap()
    // WM_CAPTURECHANGED: 等价 release

**（f）DPI 变更**

    WM_DPICHANGED:
       new_dpi = HIWORD(wParam)
       S = L * new_dpi / 96
       resize DIB (canvas*S), recompute layout
       UpdateLayeredWindow(hwnd, ..., &new_size, ...)   // 新尺寸 + 新内容
       SetWindowPos(hwnd, HWND_TOPMOST, suggested.x, suggested.y, new_size.cx, new_size.cy, SWP_NOACTIVATE)
       bubble.reposition(); dock.revalidate()

### 5.4 C# 原型探针（本机已验证可编译/可调用 ULV）

用途：本机快速验证 ULW/per-pixel alpha/DPI/渲染时序；不发布。参考实现见附录 C。

    [DllImport("user32.dll", SetLastError=true)]
    static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
        IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);

    // 1) CreateWindowEx(WS_EX_LAYERED|WS_EX_TOOLWINDOW|WS_EX_TOPMOST|WS_EX_NOACTIVATE, WS_POPUP)
    // 2) CreateCompatibleDC(screen) + CreateDIBSection(32bpp, BI_RGB, top-down)
    // 3) fill premultiplied BGRA: 96x96 art PNG -> premultiply -> nearest scale
    // 4) UpdateLayeredWindow(..., ULW_ALPHA); ShowWindow(SW_SHOWNOACTIVATE)
    // 5) 用 click-sink 窗口 + SendInput 断言 alpha=0 穿透、alpha=255 命中
    // 6) 同机另一个 125%/150% 显示器（或 VM 改缩放）验证 WM_DPICHANGED 重建

本机实测（2026-11-25）：编译 exit 0；CreateWindowEx 成功；ULW 返回 True；GetDpiForWindow=96；桌面锁屏导致 SetCursorPos/点击注入失败（LOCK 状态，foreground=LockScreenBackstopFrame），交互断言待解锁桌面/VM 执行。

### 5.5 Tauri host 集成（main.rs 草图）

    // setup()：
    app.manage(PetRendererState::new());           // 保存 handle + events 转发
    let handle = native_pet::spawn(PetConfig {
        embedded_packs: native_pet::embedded::BUILTIN,
        initial_pack: "famling.pet-dog",
        scales: resolve_initial_scales(),
        feature_flag: cfg.native_pet,
    })?;

    #[tauri::command]
    fn pet_activate_character(pack_id: String, state: State<PetRendererState>) -> Result<(), String> { ... }

    // 单实例召回：ensure_single_instance() 改成
    //   FindWindowW("Famling.NativePetWindow.v1", null) -> PostMessage(WM_APP_RECALL)
    //   （class 名固定；标题/角色不再参与）
    // tray "显示/召回" -> 同一个 recall
    // hit-region poller（start_pet_hit_test_loop / set_pet_hit_regions / HitRegions）在 native 模式不启动；
    // webview 模式保留，供双跑回退。

    // 关闭 native：handle.shutdown()（PostMessage WM_CLOSE + join），随后 app.exit。

### 5.6 TS 侧改动（内容窗口 + 双跑开关）

    // src/pet/native-bridge.ts（新）
    export type PetRendererKind = 'webview' | 'native'
    export async function petActivateCharacter(packId: string): Promise<void>
    export async function petSetScales(s: ResolvedScales): Promise<void>
    export async function petShowMenu(items: MenuItem[]): Promise<void>

    // main.ts：resolveHeroConfig() 增加 native 判断；
    //   native 模式下：不启动 hero canvas/hero-runtime/hit-region sync/pet-window-dock；
    //   仍保留内容窗口/设置/TOS/composer（它们本来就在 content window 模式）；
    //   角色切换/缩放/菜单调用 native-bridge。
    // pet.html：native 模式下只作为内容窗口页面（?content=1）加载；pet 模式不再被 native 使用。
    // feature flag：localStorage 或 Tauri config：pet.renderer = "native" | "webview"（默认 webview，验收后翻默认）。

### 5.7 数据/协议新增（最小化）

- 内建资产表：build 期生成，不进入用户可见 JSON。
- Tauri command 参数 schema（命名与现有 style 一致）：
  pet_activate_character { packId: string } → Result<(), {code,message}>
  pet_set_scales { global, image, bubble, menu } → Result
  pet_show_bubble { text, semantic, attribution?, durationMs } → Result
  pet_hide_bubble; pet_recall; pet_debug_state → JSON（QA 用：hwnd/dpi/scale/present count/cache bytes/deadline hist）
- PetEvent → Tauri event 名：pet://ready、pet://tap、pet://drag-end、pet://menu-action、pet://error（内容窗口 listen）。

---

## 6. 集成点与文件级计划

### 6.1 新增文件（写作用域：repos/famling/**

| 路径 | 内容 | 估计 |
|---|---|---|
| app/native/pet-render/Cargo.toml | crate 定义 + 依赖/features | 0.5d |
| app/native/pet-render/build.rs | 扫描内建资产/构建期校验/生成 embedded_assets.rs | 1~1.5d |
| app/native/pet-render/src/lib.rs + host.rs | 对外 API/线程/命令/事件/panic 边界 | 1~1.5d |
| app/native/pet-render/src/window/{sprite,bubble,menu}.rs | 3 个窗口 + ULV + 菜单 | 2~3d |
| app/native/pet-render/src/render/{compositor,dib,text}.rs | 合成/缩放/文字 | 2~3d |
| app/native/pet-render/src/asset/{png,cache,embedded,disk}.rs | 解码/缓存/预算/安全 loader | 2~3d |
| app/native/pet-render/src/pack/*.rs | character/manifest/behavior/regions 解析（或复用 TS 生成 JSON 的严格校验镜像） | 1.5~2d |
| app/native/pet-render/src/anim/{clip,behavior,scheduler}.rs | 节奏/状态机/调度器 | 2~3d |
| app/native/pet-render/src/input/{hit,drag,dock}.rs | 命中/拖拽/贴边 | 2~3d |
| app/native/pet-render/src/diag.rs | QA 计数器/直方图 | 0.5d |
| src/pet/native-bridge.ts | 内容窗口→Tauri commands 封装 | 0.5~1d |
| tests/native-renderer-contract.test.ts / scripts/native-*.mjs | 跨语言常量/契约测试；QA probe 脚本 | 1~2d |
| .github/workflows/native-pet.yml | 独立快速 CI：fmt/clippy/test/build/artifact | 0.5~1d |
| docs/design/NATIVE-RENDERER-2026-11-25.md | 实现文档（可选，本文件已是设计基线） | 0.5d |

### 6.2 修改文件

| 路径 | 改动 | 风险 |
|---|---|---|
| app/tauri/src-tauri/Cargo.toml | 增加 path 依赖 famling-pet-render；windows-sys features 扩充；png 依赖（若 crate 内不另起 workspace） | 低 |
| app/tauri/src-tauri/src/main.rs | setup 启动 renderer；移除/条件化 hit-region poller；单实例召回改用窗口类；tray 菜单接入 recall/menu；退出时 shutdown；保留 webview 回退分支 | 中 |
| app/tauri/src-tauri/tauri.conf.json | 默认窗口从 pet.html 改为内容窗口（或按需创建）；pet 窗口创建移出 Tauri config；bundle resources 不需（内建嵌入） | 中 |
| app/tauri/src-tauri/capabilities/default.json | 新增 native 相关 commands 的 allow 列表（若需要） | 低 |
| src/pet/main.ts | native 模式分支：跳过 hero/hit-regions/dock；内容窗口启动路径；feature flag 解析 | 中 |
| src/pet/hero-page.ts | native 模式下不创建 hero page（或 no-op）；保留 webview 分支 | 中 |
| src/pet/hit-regions.ts / pet-window-dock.ts / edge-dock.ts | hit-regions 在 native 模式 no-op；edge-dock 常量导出给跨语言测试；pet-window-dock 在 native 模式 no-op | 低 |
| src/pet/desktop-shell.ts | 菜单/气泡在 native 模式不渲染 DOM；菜单项 label 仍由这里/i18n 提供 | 中 |
| scripts / tests | 新增 native 相关测试；现有测试不得回归 | 低 |
| CHANGELOG/docs/STATUS | 记录 native renderer 阶段与 flag 默认值 | 低 |

### 6.3 图标/窗口类/单实例要点

- 窗口类名与标题固定：class=Famling.NativePetWindow.v1；title 可随角色变，但**不要**再用标题做 FindWindow 的唯一定位（现状 main.rs:169-179 依赖 title）。
- 单实例 mutex 保持；第二实例：mutex 已存在 → FindWindowW(class) → PostMessage(WM_APP_RECALL) → exit 0。
- tray “显示/召回” → 同一 recall（native 模式）；“退出” → renderer shutdown + app.exit。
- 崩溃导出：main.rs 现钩子覆盖整个进程（含 renderer 线程 panic）；catch_unwind 只阻止 panic 扩散，shutdown 失败写报告仍由原 hook 处理。

### 6.4 资产/构建/打包

- 内建资产嵌入，便携 zip 不新增文件；NSIS 安装包同样只带 exe（分发、签名、更新流程不变）。
- build.rs 校验失败 = CI 红：帧缺失/PNG 尺寸/预算/JSON 解析（并与现有 validate:character/validate:content 双保险）。
- 帧数据不打包两次（Tauri frontendDist 里仍有旧 pet assets，供 webview 回退/内容窗口；native 嵌入式是编译进 exe 的副本，总增量 ~1.1MB）。
- 发布产物：exe 体积增量需在 CI 记录（BUILD-INFO 加 native bytes）。

### 6.5 与并行研究（02-tauri-integration / 05-migration-plan）的对齐

- **拓扑一致**：02 推荐“单进程 Tauri + native-pet 线程 raw Win32 分层窗口（ULW_ALPHA，预乘 BGRA）”；本文件 §4.1 与之相同，native 模式下宠物链路上无 WebView2。
- **实现形态**：02/05 的文件树把 native 代码放在 Tauri crate 内（app/tauri/src-tauri/src/native_pet/...，单 Cargo 包、单 exe、CI 简单）；本文件 §5.1/§6.1 写的独立 crate 布局可按 1:1 平移到该模块（把 src/ 下各子模块放进 native_pet/ 即可）。**建议采用 02/05 的单包形态**；独立 crate 仅作为想让 cargo test 隔离时的可选重构（需 path 依赖 + 两个 Cargo.lock 维护成本）。
- **开关一致**：--pet-renderer=native|web|dual > FAMLING_PET_RENDERER > %APPDATA%/com.perrylink.famling/native-pet.json > 编译期默认；0.3.0-beta 默认 web、tester opt-in（02 §1 点 8、05 点 5）。本文件 §5.6 的 feature flag 以此为最终口径。
- **Tauri 保活**：目标架构无 WebView pet 窗口，Tauri 默认在窗口全关后退出；必须 RunEvent::ExitRequested + api.prevent_exit()（02 §1 点 7 / §2.3；tauri#13511），tray-only 存活。本文件 §5.5/§6.3 的单实例/托盘改造需带上这条。
- **性能实测互相印证**：02/05 的 C# 探针在 480×336 下测到 ULW 平均 **0.159~0.17ms/次**（300 次），说明本文件 §4.12 的 0.5ms budget（192² sprite 窗口）非常保守；native 实际单帧预算更低。
- **计时器差异**：02 Phase 1 用 WM_TIMER 驱动动画；本文件建议 HIGH_RESOLUTION waitable timer + MsgWait（非均匀 attack hold 42ms 需要；WM_TIMER 可作拖动兜底）。两者可合并：调度器抽象成 timer source，Phase 1 用 WM_TIMER、Phase 2 换 waitable timer。
- **菜单/气泡差异（需 lead 定）**：02 Phase 1 右键直接开内容窗口、Phase 2 再评估 TrackPopupMenu；本文件建议 P2 原生菜单。气泡 02 倾向“不透明 WebView HUD（+40~90MB/窗、默认不做）”；本文件推荐 native 分层气泡窗（穿透、不抢焦点、无额外 WebView），需在评审时二选一。
- **时钟/行为所有权**：05 Phase 1 只做 MVP 片段表、Phase 2 再移植 behavior/scene；本文件 §4.6 已按“native 最小状态机 → 全量 parity”分层，两文件一致。

---

## 7. 可行性分析：Rust-via-CI vs C# 原型（明确结论）

### 7.1 本机事实（2026-11-25 实测）

| 项 | 结果 |
|---|---|
| OS/硬件 | Windows 11 build 26300，AMD Ryzen 9 9950X，64GB；Session 1 交互但当前**锁屏**（foreground=LockScreenBackstopFrame） |
| cargo/rustc | 不存在（PATH 缺失） |
| MSVC cl / msbuild / dotnet | 不存在 |
| csc.exe | C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe 存在（.NET Framework 4.8 / C# 5） |
| 已编译/运行 Win32 探针 | 成功（见 §1.3、附录 C）；ULV 返回 True；锁屏使点击注入/SetCursorPos 不可用 |
| 现有 0.2.3 构建产物 | famling-art-rebuild/work/smoke/famling-app-023/famling-tauri.exe（14MB）可启动；隐藏运行 7 进程/421.7MB WS |

### 7.2 Rust-via-CI（产品路径）

- **可行**：现有 CI windows-latest 已安装 Rust（build-windows.yml 的 dtolnay/rust-toolchain@stable 且 cargo build 已跑通 Tauri），加一个 native crate job 是增量工作。
- **开发回路**：写代码 → push/PR → native-pet.yml（build+test+clippy+artifact）→ 下载 exe → 本机跑 → 日志/QA 计数器反馈。单轮 5~15min（独立 crate 估计 2~4min 构建 + 下载/排队）。建议每天只做 2~3 轮大改，细节用单元测试。
- **风险**：本机不能单步调试；用 C# 探针锁 API 语义（ULV/DPI/输入），Rust 侧把逻辑写成无 Win32 依赖的纯函数（缩放映射/帧 deadline/贴边几何/命中映射/缓存预算）用 cargo test 覆盖。
- **可选加速**（不在本任务范围，需 owner 批准）：本机安装 rustup + VS Build Tools（~2GB，网络/许可）；或使用 WSL2 交叉（仍缺 MSVC/Windows target 运行验证）。不建议把“本机装 Rust”作为计划依赖。

### 7.3 C# 原型路径（只验证，不发布）

- **可行**：csc 已存在；GDI+ 可解 PNG（System.Drawing）；P/Invoke 可做 ULV/DPI/输入/截图探针；编译秒级。
- **能证明什么**：ULW per-pixel alpha 在目标机/目标显示器上正确；alpha=0 点击穿透（WindowFromPoint + click-sink + SendInput）；DPI 切换重建；调度/帧率；内存/句柄；可作为 native Rust 行为的“参考实现 + 回归探针”。
- **不能证明/不能做**：不能替代 Rust 发布（双栈、签名、Tauri 集成、长期维护）；本机锁屏时交互类断言仍需解锁桌面/VM。
- **建议**：把 C# 探针作为 research 目录的临时工具（不入产品构建，work/native/probe 或 tools 下），交付时保留脚本与结果截图；Rust 版本在 CI 上按同一组断言实现。

### 7.4 结论

**Rust 通过 CI 开发/发布是唯一可维护路径；C# 原型用于本机快速验证与参考实现。**如果 owner 不能接受 CI-only 的 Rust 开发回路（等待/调试成本），替代方案不是“改用 C# 发布”，而是“暂缓 native 重构、继续 webview 并接受透明/命中缺陷”（不推荐），或“先做 C# 独立进程宠物覆盖层”（临时组件、非产品化，后续仍要 Rust 重写）。

---

## 8. 风险与缓解（按严重度）

| ID | 风险 | 概率/影响 | 触发/证据 | 缓解 | 验证 |
|---|---|---|---|---|---|
| R1 | CI-only Rust 回路导致迭代慢、缺陷积压 | 高/中 | 本机无 cargo | 独立 native-pet.yml（2~4min）；逻辑纯函数单测；C# 探针；批量提交 | 记录每轮 CI 时间/缺陷数 |
| R2 | ULW per-pixel 命中在 DPI/移动后异常（旧位置吞点击/新位置点不到） | 中/高 | Wails #5371 记录 layered 命中区域不自动刷新；ULW 不能再用 SetLayeredWindowAttributes 刷新（[官]） | 每次尺寸/DPI 变化重新完整 ULW；toggle WS_EX_LAYERED 兜底；QA 探针断言旧/新位置 | T4/T5/T6 |
| R3 | 125%/175% 非整数 device scale 的像素宽度不完全均匀，用户觉得“不够锐” | 中/低 | 数学必然（2.5/3.5 倍） | 最近邻绝不模糊；提供“严格整数像素”选项；文档说明 | 像素 run 分析/截图 |
| R4 | 全屏游戏/视频遮挡、Win+D、虚拟桌面、RDP 下行为退化 | 中/中 | layered/topmost 在 RDP/捕获下有已知坑（navop RDP airspace） | 沿用 SHQueryUserNotificationState 隐藏；RDP 降级隐藏 native pet；不吞输入 | T8/T12 |
| R5 | 气泡/菜单的可访问性回归（aria-live/读屏/键盘） | 高/中 | native 气泡没有 DOM live region | 菜单用系统菜单（可读）；内容窗口镜像 aria-live（P2）；UIA 事件；native 默认前必须验收 | A11y checklist |
| R6 | 输入法/焦点：点宠物打断输入、IME 注入异常 | 中/中 | 同类桌面宠物经验（掘金：ImmAssociateContext 解决 IME 注入）；Wails NOACTIVATE 教训（但那是 WebView2） | WS_EX_NOACTIVATE + MA_NOACTIVATE；ImmAssociateContext(NULL)；不做文本输入 | 手工 T-IME |
| R7 | 菜单在 NOACTIVATE 窗口上打开/关闭焦点行为异常 | 中/中 | 托盘菜单同款问题（SetForegroundWindow + WM_NULL） | 显式 SetForegroundWindow；失败回退临时清 NOACTIVATE；最后回退自绘菜单（P2） | 手工+探针 |
| R8 | 内建资产嵌入与 TS asset 真相漂移（帧数/尺寸/预算） | 中/中 | build.rs 与 public 资产演进 | build.rs 校验 + CI 门禁；与 validate:character 双保险；manifest 版本化 | CI |
| R9 | DLC/第三方包安全（PNG 炸弹/路径穿越/超大帧/半坏包） | 中/高 | 新 native 解析器 | png Limits；尺寸/预算/帧数上限；路径白名单；失败回退旧角色；恶意样本测试 | 安全用例 |
| R10 | renderer 线程 panic/死锁导致宠物消失或整个 app 崩 | 中/高 | 进程内线程 | catch_unwind + watchdog（host 30s 无 ready/心跳 → 重试 1 次 → 回退 webview pet + 提示）；绝不无限递归 | soak/故障注入 |
| R11 | 位置持久化迁移（localStorage→native JSON）丢失/越界 | 中/低 | 现有键 desktop-games/pet/window | 首次启动迁移一次；有旧 position 且可达就用；否则默认右下；双写一段时间 | T8/升级测试 |
| R12 | 主题（高对比度/深色）下气泡与菜单不匹配 | 中/低 | native 自绘颜色 | 菜单用系统主题；气泡从 host 接收主题色（现有 desktop-shell 主题变量）或系统 UISettings | 高对比度截图 |
| R13 | 便携 zip/安装包/CI 打包被新 crate/资产破坏 | 中/中 | 现有 build-windows.yml 只拷 exe | build.rs 嵌入；CI 增加 native 产物检查；portable smoke | 打包测试 |
| R14 | 与 task-14/15 技术栈决策冲突（对方选 DComp/wgpu） | 中/中 | 并行研究 | 本文件给出“若改 DComp 则命中/穿透方案需重写”的明确差异；建议以 ULV 为基线；lead 汇总时对齐 | 评审 |
| R15 | 本机无法完成真机验收（锁屏/无 Rust） | 高/中 | 2026-11-25 锁屏 | 验收放到解锁桌面/Windows VM（CI GUI runner 或人工）；C# 探针预跑；记录证据 | 验收报告 |
| R16 | 平台回归（Win10 与 Win11 合成差异、future Windows 版本） | 中/中 | 透明窗历史 | 不依赖 WebView2 透明；ULW 是 Win32 稳定路径；矩阵 Win10 22H2/Win11 24H2/25H2 | T-matrix |

---

## 9. 验收指标与测试计划

### 9.1 发布门（native 成为默认前必须全部通过）

| # | 指标 | 阈值 | 方法 |
|---|---|---|---|
| A1 | 无黑框/黑条/半帧/残影 | 100% 帧完整；黑像素只允许出现在源美术 alpha>0 处 | 窗口捕获 240fps×60s，逐帧 hash + 与源帧比对；启动 100 次采样首帧 |
| A2 | alpha=0 点击穿透一致率 | ≥99.9%（网格/轮廓采样点） | QA 探针：click-sink 窗口 + SendInput + WindowFromPoint；按当前帧 alpha 生成期望 |
| A3 | 拖动后旧位置/新位置命中 | 旧位置 100% 穿透；新位置 100% 可点；无假死 | T3/T4（同 PET-OCCLUSION §10.4 用例） |
| A4 | DPI 100/125/150/175/200% | 尺寸=round(96*L*dpi/96)±1；无模糊（最近邻）；点击与渲染一致 | 逐 DPI 截图 + 像素分析；WM_DPICHANGED 探针 |
| A5 | 混合 DPI 双屏/负坐标 | 拖入/拖出/点击一致率 ≥99.9%；切换 ≤300ms 稳定 | 双屏 VM/真机 |
| A6 | 首帧/切换时延 | 首帧 ≤150ms；角色切换 ≤300ms | 日志 |
| A7 | 性能 | idle CPU ≤0.5%、动画 ≤1%、拖动 ≤2%；present ≤0.5ms/192² | GetProcessTimes/QPC 直方图 |
| A8 | 内存/句柄 | renderer private ≤12MiB(idle)/≤40MiB(全缓存)；24h RSS 漂移 ≤5%；GDI/USER 0 增长 | GetProcessMemoryInfo/GetGuiResources |
| A9 | 稳定性 | 24h soak：无崩溃/无死锁/无错误风暴；10k 次拖拽；1k 次角色切换 | 自动化 soak |
| A10 | 回归 | 现有 TS 测试全绿；webview 回退模式可用；tray/单实例/panic 导出不变 | CI + smoke |
| A11 | 无障碍 | 菜单键盘可达/可读；气泡有替代通道（内容窗口/aria-live 或 UIA） | Narrator 手测 |
| A12 | 安全 | 恶意 PNG/DLC 样本被拒；路径穿越被拒；无网络/无新权限 | 安全用例 |

### 9.2 测试层次

1. **纯 Rust 单测（CI，无 Win32）**：帧 deadline/loop/oneshot、缩放映射（art↔device、100~200% 表）、命中映射（scale/flip/负坐标）、贴边几何（与 edge-dock.ts 黄金用例）、缓存 LRU/预算、manifest 校验/错误码、行为状态机（与 behavior.json 黄金用例）。
2. **跨语言契约测试（CI）**：读同一份 JSON fixture（时间轴/贴边/缩放/regions），TS 与 Rust 输出对比（防止两层漂移）；常量（MIN_VISIBLE=96/72、EDGE_THRESHOLD=24、PixelScale 集合）用测试钉住。
3. **CI 构建 + smoke（windows-latest）**：native exe 构建；启动 3s 无崩溃、进程存在、QA 计数 >0；上传 artifact。
4. **本机/VM 交互探针（核心）**：PowerShell/C# 探针（可复用本文件附录 C 的 P/Invoke 原语）：click-sink + SendInput 断言穿透/命中；WindowFromPoint；SetWindowPos；GetDpiForWindow；截图对比；240fps 录制逐帧 hash。
5. **24h soak**：idle+动画+随机拖拽+菜单开合+角色切换+锁屏/唤醒；采样 CPU/RSS/句柄/present 计数。
6. **手工 QA**：触控笔、双击/右键、任务栏/多显示器、Win+D/Alt+Tab、IME、Narrator、高对比度、RDP、睡眠唤醒、屏幕捕获。

### 9.3 证据记录模板（发布时留档）

    环境：Windows 版本/显示器布局+DPI/Tauri 版本/native build sha/角色 pack 版本
    用例：A1–A12 逐条 pass/fail + 证据路径（截图/录屏/探针 JSON/CI run URL）
    性能：表格（见 §4.12）+ 基线对比（0.2.3 webview）
    结论：可翻默认/需修复项/风险接受人

---

## 10. 分阶段落地（建议排期，单人 + AI 辅助，±50%）

### P0：可行性 spike（2~3 天，先做）

- P0.1 解锁桌面/VM 上跑 C# 探针，断言：alpha=0 穿透、alpha=255 命中、ULW 首帧时序、DPICHANGED 重建、24h 采样脚本。
- P0.2 CI 建立 native-pet.yml：最小 crate 打开窗口画一帧 PNG，上传 exe；本机跑通 artifact（下载+启动+截图/QA 计数）。
- P0.3 决策：进程内线程 vs 独立进程（与 task-15 对齐）；默认 bubble 独立窗 vs 单窗（本文件推荐独立窗）。
- 退出标准：两点均在本机/VM 有客观证据；CI 构建回路可重复。

### P1：sprite 渲染器（~1.5 周）

- 帧解码/预乘/缓存/预算；内建资产 build.rs 嵌入；最近邻缩放；ULW 主窗口；首帧门。
- 帧调度器（waitable timer + MsgWait）；present-on-change；clip 播放（含 holdMs/loop/oneshot）。
- 行为状态机最小集：idle/idle_blink/pat/drag/land/sleep/wake + ambient 随机微动作（读 behavior.json）。
- 手动拖拽 + edge-dock settle + 持久化/恢复（含旧 localStorage 迁移）。
- feature flag + webview 回退；Tauri main.rs 集成；tray/单实例召回改造。
- 退出标准：视觉与 0.2.3 对齐（idle/pat/drag 截图对比）；A1/A2/A3/A4/A6/A7/A8 初测通过（至少 100/150/200% DPI）。

### P2：气泡/菜单/多角色（~1 周）

- 气泡独立窗（DirectWrite/GDI 文本、CJK、主题色、位置 clamp、穿透）。
- 原生菜单（系统样式；owner-draw 可选）；打开设置/内容窗口；菜单动作回内容窗口。
- 多角色切换（预加载/原子换/失败回退/LRU）；缩放设置（native 应用 scaling.ts 结果）。
- 无障碍方案（菜单键盘/读屏；气泡镜像或 UIA）。
- 退出标准：A5/A9/A10/A11 通过。

### P3：稳定化与翻默认（~3~5 天）

- 24h soak；Win10/Win11 矩阵；RDP/锁屏/睡眠；高对比度/主题；安全用例。
- 性能报告 + 与 0.2.3 对比；发布 native 构建（仍保留 webview flag）；文档/CHANGELOG/STATUS；如可行再考虑 P4 市场/DLC 包 native loader。

### 10.1 估算汇总

| 阶段 | 人日 | 关键风险 |
|---|---|---|
| P0 | 2~3 | 锁屏/CI 回路 |
| P1 | 8~12 | 调度/拖拽/DPI、资产构建 |
| P2 | 5~8 | 文字渲染/菜单焦点/无障碍 |
| P3 | 3~5 | 矩阵/soak/平台差异 |
| 合计 | 18~28 人日（约 4~6 周单人，含缓冲） | 与架构评估的 2~4 周一致偏保守 |

---

## 11. 待决策 / 开放问题（交给 lead 汇总）

1. **进程拓扑**：v1 进程内线程（本文件默认）还是独立 famling-pet.exe（崩溃隔离/权限更清晰，但要 IPC/窗口联合生命周期）？建议与 task-15 结论一起定。
2. **气泡 a11y**：P1 是否必须与 native 同版交付？本文件建议“native 默认前必须有镜像/UIA 方案”。
3. **贴边位置持久化迁移**：是否迁移旧 localStorage 位置（推荐迁移一次）还是回默认角。
4. **125%/175% 缩放策略**：默认平滑尺寸（与现状一致）还是严格整数像素（视觉锐利但尺寸跳变 20%）。
5. **菜单视觉**：系统原生菜单（P1，推荐）还是像素风 owner-draw（P2）。
6. **是否保留 webview pet 永久回退**：建议保留一个 release 周期，之后删除 480x336 WebView pet 代码（减少双栈维护）。
7. **DLC/第三方 native loader 是否 P1 交付**：本文件建议 P2/P3（内建 3 角色先跑通；DLC 可继续走 webview 渲染，直到 native 默认）。
8. **与 task-14/17 的交叉**：若对方强烈建议 DirectComposition/RDP 策略优先，需要重新评估 §3.1 B 的命中/穿透方案（成本会显著上升）。

---

## 12. 证据与链接

### 12.1 本仓证据（路径相对 C:/deepseekharness/project）

- PET-WINDOW-ARCHITECTURE-REVIEW.md（4 层透明叠加/方案 A-D/验收建议）
- FIX-2026-11-25.md、FIX-2026-11-25-BUTT.md（黑框/黑条根因与 0.2.2/0.2.3 补丁）
- repos/famling/src/pet/hero.ts（CharacterRenderer/帧解码/播放/rAF）
- repos/famling/src/pet/hero-runtime.ts（host canvas/rAF/DPR/布局）
- repos/famling/src/pet/hit-regions.ts（alpha tile + 100ms/1s 同步 + IPC）
- repos/famling/src/pet/pixel-scale.ts（1/2/4 + 1/2/1/4/1/8、32MiB 解码预算）
- repos/famling/src/pet/anim/manifest.ts、src/pet/anim/timing.json、src/pet/anim/regions.ts
- repos/famling/src/pet/edge-dock.ts、src/pet/pet-window-dock.ts（贴边/恢复）
- repos/famling/src/pet/character-pack-renderer.ts（pack→hero 转换/失败回退）
- repos/famling/app/tauri/src-tauri/src/main.rs（单实例/托盘/崩溃/60ms hit poller）
- repos/famling/app/tauri/src-tauri/tauri.conf.json（480x336 transparent 窗口）
- repos/famling/.github/workflows/build-windows.yml（windows-latest + Rust + Tauri）
- repos/famling/docs/plan/ADR-SCALE-DPI-2026-11-20.md（四层缩放/DPI 策略/已知缺口）
- repos/famling/docs/research/PET-OCCLUSION-TECH-2026-11-18.md（点击穿透/遮挡/探针设计/issue 清单）
- repos/famling/public/assets/pet/anim/{dog,cat,human}/manifest.json + frames（420 帧）
- repos/famling/public/characters/{pet-dog,pet-cat,pet-tinglan-anim}/{character,behavior,regions}.json
- dsh-famling（0.14.3）client.anims.*.js（插件侧嵌入式动画，不在本重构范围）

### 12.2 官方文档（Microsoft）

- Layered Windows / hit testing：https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features
- UpdateLayeredWindow：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow
- SetLayeredWindowAttributes（ULW 之后调用会失败）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes
- BLENDFUNCTION / AC_SRC_ALPHA 预乘：https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-blendfunction
- Extended Window Styles（WS_EX_NOACTIVATE/TOOLWINDOW/TOPMOST）：https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles
- WM_DPICHANGED：https://learn.microsoft.com/en-us/windows/win32/hidpi/wm-dpichanged
- PerMonitorV2 DPI awareness：https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process
- CreateWaitableTimerEx（HIGH_RESOLUTION，Win10 1803+）：https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-createwaitabletimerexw
- DwmFlush：https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmflush
- DWM always-on（Win8+ 全主题合成）：https://learn.microsoft.com/en-us/windows/win32/w8cookbook/desktop-window-manager-is-always-on
- TrackPopupMenuEx：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-trackpopupmenuex
- Layered window DPI 实战（MS Q&A，推荐 UpdateLayeredWindow+PerMonitorV2）：https://learn.microsoft.com/en-us/answers/questions/382518/setwindowpos-scaling-behaviour-with-ws-ex-layered
- WebView2 DefaultBackgroundColor（只支持不透明/全透明）：https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2controller.defaultbackgroundcolor
- C# compiler options（.NET Framework 用 csc.exe）：https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/

### 12.3 issue / 同类实现（外部数据）

- Tauri #13070（透明窗点击穿透关闭，官方不做逐像素）：https://github.com/tauri-apps/tauri/issues/13070
- Tauri #6164（setIgnoreCursorEvents forward 仍 open）：https://github.com/tauri-apps/tauri/issues/6164
- Tauri #16341（透明桌宠长时间运行出现不透明黑矩形）：https://github.com/tauri-apps/tauri/issues/16341
- Tauri #14764（透明窗拖动/焦点 ghost 背景）：https://github.com/tauri-apps/tauri/issues/14764
- Tauri #14823（Win10 透明窗黑边）：https://github.com/tauri-apps/tauri/issues/14823
- WebView2Feedback #446（WebView2 子窗口劫持命中）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/446
- WebView2Feedback #5492（144.x 透明窗幽灵标题栏）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5492
- WebView2Feedback #5668（alpha=0 的 WebView2 仍吞点击）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5668
- WebView2Feedback #5752（154.x alpha=0 背景失效）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5752
- wry v0.39.4（with_transparent/background_color 修复记录）：https://v2.tauri.app/release/wry/v0.39.4/
- WebView2 144.x Tauri 透明窗回归（Microsoft Q&A 中文）：https://learn.microsoft.com/zh-cn/answers/questions/5731863/144-0-3719-82-webview2
- Wails #5229 / #5371（layered 命中区域在 SetWindowPos/DPICHANGED 后刷新）：https://github.com/wailsapp/wails/pull/5371
- neru #1660（DirectComposition 透明非 layered 不被 Windows 当 click-through）：https://github.com/y3owk1n/neru/pull/1660
- keyhop overlay.rs（Rust windows crate + ULV_ALPHA 叠加层参考）：https://docs.rs/keyhop/0.5.0/src/keyhop/windows/overlay.rs.html
- 2.3MB 桌面宠物：Win32 分层窗口 + 预乘 alpha 帧渲染（110² 单帧 8.9µs/Private 4.72MB；GDI 缩放会清 alpha）：https://juejin.cn/post/7703394427519877156
- atomic-chat ADR（softbuffer + Tauri 透明窗 fatal panic）：https://github.com/atomicbot-ai/atomic-chat/blob/0a4fd06dd798af924ff81503cf602294f123cd1a/docs/decisions/2026-07-31-disable-transparent-windows-window-to-stop-softbuffer-panic.md
- trycua/cua commit（ULW 全表面逐像素翻转的 52ms/frame 成本记录；DWM 保留层副本）：https://github.com/trycua/cua/commit/d7c1609345ab6383e2447a97fbac05a3338e5bc7
- navop RDP airspace 修复（layered 在 RDP/捕获下的坑）：https://github.com/feigeCode/navop/commit/2c8ee7f9f0e9466d1b3d0a6047dafefa4bfbac7f

### 12.4 本机实测记录（2026-11-25）

- 工具链检测：cargo/rustc/dotnet/csc/cl/msbuild 均 MISSING；csc.exe 4.0.30319 存在。
- C# 探针：编译 exit 0；CreateWindowExW/SetWindowLongPtr/CreateDIBSection/UpdateLayeredWindow 成功；GetDpiForWindow=96；桌面锁屏导致 SetCursorPos/mouse_event 无效（foreground=LockScreenBackstopFrame）。
- 0.2.3 隐藏运行：main 30MB WS；进程树 7 进程 421.7MB WS（WebView2 子进程 ~392MB，含共享页）；CPU 10s 采样约 0%（隐藏态）。
- 交叉印证：02/05 的 C# 探针在同一台机器测得 480×336 ULW 平均 0.159~0.17ms/次（300 次），exstyle=0x08080088、ULW 首帧 TRUE；与 §4.12 的性能预算一致。
- 资产计数：dog 136 / cat 143 / human 141 = 420 PNG；合计 1,076,204B ≈ 1.03MiB；解码 RGBA 14.77MiB。
- 测试文件/探针源码不在仓库产物内（临时目录，已清理），复现命令与要点见附录 C。

---

## 附录 A：TS → native 模块映射

| TS（现状） | native（新增） | 说明 |
|---|---|---|
| hero.ts CharacterRenderer.load/play/hitTest | asset/cache + anim/scheduler + input/hit | 帧解码/播放/命中 |
| hero-runtime.ts render/layout/dpr | render/compositor + window/sprite + dpi | 宿主画布→窗口 |
| pixel-scale.ts | render/dpi.rs | PixelScale 集合、fit、预算 |
| hit-regions.ts | **删除**（OS alpha 命中） | 只保留 regions 语义 |
| edge-dock.ts/pet-window-dock.ts | input/dock.rs | 常量/几何/恢复 |
| anim/timing.ts + clips.ts | anim/clip.rs | 节奏表（可读同一 JSON） |
| scene/runtime.ts + character/behavior.ts | anim/behavior.rs | 最小状态机（P1 子集，P2 全量） |
| anim/regions.ts | input/hit.rs | regions/states/gesture |
| character-packs.ts + 资产 | asset/{embedded,disk} + pack | 内建/DLC |
| desktop-shell.ts bubble/menu | window/bubble.rs + window/menu.rs | DOM→native |
| main.ts orchestrator | host.rs + Tauri commands | 生命周期/桥 |

## 附录 B：内建资产实测（构建期校验输入）

| 角色 | canvas | 帧数 | PNG 字节 | 解码 RGBA | 备注 |
|---|---|---|---|---|---|
| dog | 96x96 | 136 | 382,900 | 4.78MiB | 28 tags（含 final art 动作） |
| cat | 96x96 | 143 | 341,000 | 5.03MiB | 28 tags |
| human | 96x96 | 141 | 352,300 | 4.96MiB | 29 tags |
| 合计 | - | 420 | ~1,076,200 | 14.77MiB | 全包 eager 也在 32MiB 预算内；native 仍按 LRU 省内存 |

## 附录 C：C# 探针复现要点（本机临时目录，已清理）

编译命令（本机实测）：

    C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe /nologo /target:exe /out:Probe.exe Probe.cs

Probe.cs 关键 P/Invoke（完整版约 300 行，包含：注册窗口类、CreateWindowExW、SetWindowLongPtr(GWL_EXSTYLE)、CreateCompatibleDC/CreateDIBSection、预乘 BGRA 填充、UpdateLayeredWindow、ShowWindow(SW_SHOWNOACTIVATE)、WindowFromPoint、GetDpiForWindow、SetCursorPos、mouse_event、SetTimer/GetMessage 循环）：

    [DllImport("user32.dll", SetLastError=true)]
    static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
        IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
    [StructLayout(LayoutKind.Sequential, Pack=1)]
    struct BLENDFUNCTION { public byte BlendOp; public byte BlendFlags; public byte SourceConstantAlpha; public byte AlphaFormat; }
    const int ULW_ALPHA = 0x2, AC_SRC_ALPHA = 1;
    const int WS_EX_LAYERED = 0x00080000, WS_EX_TOOLWINDOW = 0x80, WS_EX_TOPMOST = 0x8, WS_EX_NOACTIVATE = 0x08000000;

本机运行输出摘要：

    interactive=True session=1
    CreateWindow W1 hwnd=... dpi=96
    W2 hwnd=... dpi=96
    UpdateLayeredWindow ok=True
    W1 rect=400,300,600,500 visible=True
    screen={X=0,Y=0,Width=1920,Height=1080} cursor={X=0,Y=0}
    win32 class of WFT=LockScreenBackstopFrame
    SetCursorPos=False now={X=0,Y=0}
    WindowFromPoint opaque=LockScreenBackstopFrame ...
    RESULT clicksW1=0 clicksW2=0

复现建议：在解锁桌面或 Windows VM 上运行同一探针；增加 click-sink 窗口 + SendInput，断言 alpha=0 点穿透到 sink、alpha=255 点命中探针窗口；再用两个 DPI 的显示器/VM 覆盖 125/150/175/200%。

---

（完）








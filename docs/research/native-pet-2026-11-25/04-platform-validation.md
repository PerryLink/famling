# 04 · Windows 合成 / 兼容性 / 平台验收（platform-validation）

| 项 | 内容 |
|---|---|
| 任务 | task-17「Windows 合成/兼容性/验收研究」 |
| 日期 | 2026-11-25（Asia/Shanghai） |
| 作者 | 研究子代理 platform-validation |
| 状态 | **研究/设计稿（RESEARCH ONLY）**。未改仓库代码，唯一写入本文件；所有探针只写系统临时目录。 |
| 上游决策 | 架构 A 已批准：保留 Tauri/WebView2 做设置/内容，宠物窗口改为原生逐像素 alpha 窗口。 |
| 基线 | famling 0.2.3 工作树（HEAD 7462ef4 + 0.2.x 未提交改动）；tauri 2.12.5 / tao 0.37.2 / wry 0.57.2；WebView2 153.0.4234.48；Windows 11 build 26300（本机，锁屏状态） |
| 定位 | 本文件回答：Windows 10/11 上「原生逐像素 alpha 窗口」是否平台正确、哪些合成/会话/DPI 行为会破坏它、如何可复现地验收、若仍有伪影如何回退。进程拓扑/渲染器/迁移排期分别以 02/03/05 为准。 |

证据等级：

- **[官]** Microsoft Learn / Windows 官方文档；
- **[ISSUE]** 上游 issue/PR（标注状态、日期、结论强度）；
- **[仓]** 本仓源码/配置/既有证据文档；
- **[实测]** 本机 2026-11-25 实际编译/运行/采样（锁屏环境，交互类结论受限）；
- **[外部]** 第三方框架源码/文档/复现记录；
- **[推断]** 由证据推导、必须在真机验收确认，不作为已证事实。

---

## 0. 执行摘要（TL;DR）

1. **当前黑框/黑条/撕裂不是单一 CSS 或美术问题，而是 Windows 合成链叠加问题。** 现行宠物窗同时叠了 4 层透明：Tauri/tao 的 WS_EX_LAYERED + DwmEnableBlurBehindWindow 空 region 透明 hack、WebView2 默认可不透明背景、DOM/CSS 背景、PNG alpha。任何一层在显示变更/焦点变化/Runtime 回归时失效都会表现为黑底；0.2.2/0.2.3 只是把黑底从一层推到下一层。
2. **原生 UpdateLayeredWindow（ULW）路径在平台语义上更简单、更可控。** ULW 分层窗口只有一层预乘 BGRA；**alpha=0 的像素由 OS 命中测试自动放行鼠标**（官方原文），因此可以删除当前的 100/1000ms JS 上报 + 60ms Rust 轮询 + 整窗 set_ignore_cursor_events 链路（该链路正是 Tauri #15947 中 Win10 透明窗黑块的可疑触发器）。
3. **本机实测证明「C# 本地探针 + Win32 ULW」物理可用**：csc.exe（.NET Framework 4.x）编译成功；WS_EX_LAYERED 窗口创建成功（exStyle 0x08080088）；ULW 预乘 BGRA 连续成功；PrintWindow 可读回窗口内容；480×336 全窗 ULW 300 次平均 **0.407 ms/次**（含整窗缓冲填充与 Marshal 拷贝，属上界）。但本机处于**锁屏**，逐像素穿透/拖拽/DWM 上屏无法在本机验证；Rust 工具链也不在本机。
4. **上游 issue 状态决定验收重点**：Tauri #16341（Win11 长时透明窗变黑）**仍 open、0 评论、需 triage**；其故障注入显示「DwmEnableBlurBehindWindow 状态丢失」可造成同样黑块，重放空 region + SetWindowPos(SWP_FRAMECHANGED) + InvalidateRect 能恢复（但自然触发未证实）。→ 原生方案必须做**显示变更/合成状态重放（reassert）**并做 24h soak，而不能假设「换了原生就永不黑」。
5. **Tauri #14764（透明窗 ghost 标题栏）已关闭，根因是 WebView2 144.0.3719.67/.82 Runtime 回归，升级到 144.0.3719.93 后修复**；WebView2 #5752 又记录 154.0.4258.62 上 alpha=0 背景失效。→ 只要宠物窗还依赖 WebView2 透明，验收就必须绑定 Runtime 版本；这是原生路线（宠物不依赖 WebView2）的额外收益，也是 web 回退路径的已知风险。
6. **Tauri #14823（Win10 透明无阴影黑边）当天被关闭、无评论、无复现信息**，证据强度低；不应把它当作已确认的平台缺陷，但 Win10 22H2 仍应列入兼容矩阵（Windows 10 已于 2025-10-14 结束支持，见 [官] 生命周期页）。
7. **Tauri #15947（Win10 透明窗切 WS_EX_LAYERED/最小化时透明区变黑）指出结构性修法：WS_EX_NOREDIRECTIONBITMAP / DirectComposition 路径（PR #15410）**。该 PR 已合并并进入 **Tauri 2.12.0**；本仓 Cargo.lock 是 **tauri 2.12.5**，因此存在一个**只改配置的止血开关 noRedirectionBitmap**，可在不动 Rust/JS 的情况下先移除 tao 的 blur-behind hack，作为 0.2.x 过渡补丁（必须 A/B 真机验证，见 §7.3）。
8. **推荐栈：单进程 Tauri host + 独立 native-pet 线程 + raw Win32 ULW 分层窗口 + windows-sys 0.61 + png；不用 winit/wgpu/softbuffer/DirectComposition v1。** Rust 走 CI 可行（现有 build-windows.yml 已能构建 Tauri）；本机无 Rust，反馈环 8–15 分钟。**C# 只做本地 spike/验收 Oracle，不作为交付路径**（双运行时/双 exe/IPC/签名维护成本）。
9. **DPI 有一个必须先拍板的策略冲突（C1）**：05-migration-plan 选「严格整数艺术像素倍率」（100/125/150/175/200% → 2/2/3/4/4，像素绝对清晰但宠物视觉尺寸会 ±20% 跳变）；03-renderer-design 允许「125/175% 非整数 device 倍率、nearest-neighbour、单像素宽度差 ≤1 device px」。两者不能同时作为验收口径。本文件给出两套期望表并把选择列为 lead 决策。
10. **验收不能靠「CI 绿 + 本地看一眼」**：必须定义可复现的 A/B 差分截图门（与「宠物隐藏」基线逐像素比较透明区）、慢速交替帧撕裂门、24h soak、显示变更/锁屏/RDP/GPU 重置矩阵、点击穿透网格、回退演练与 provenance JSON。CI 只能承担构建 + 进程级 smoke；视觉/合成/DPI/会话验收必须在**交互式真机**上完成（本机锁屏，当前不可执行）。
11. **若原生窗口仍有伪影，回退是有层次的**：L1 合成重放（≤200ms）→ L2 渲染面/ULW 重建 → L3 HWND 重建 → L4 opaque sticker 安全模式 → L5 web 渲染器/隐藏。每一级有触发阈值、日志与持久化，且自动回退必须能被用户手动覆盖与回退演练验证。
12. **本文件不宣称**：未完成真机合成验收；#16341 根因未确认；DComp 回退未验证；Win10 实机未覆盖；本机锁屏导致命中/拖拽/DPI 交互证据缺失。这些都在 §11/§12 明确登记。

---

## 1. 推荐技术栈与可行性（Rust-via-CI vs C# 原型）

### 1.1 结论

| 选择 | 结论 | 理由 |
|---|---|---|
| 交付栈 | **Rust（edition 2021）+ raw Win32 + windows-sys 0.61 + png；跑在现有 Tauri 进程内的独立线程** | 复用托盘/单实例/DPAPI/存档/崩溃钩子；单 exe；无 WebView2 透明链；无跨进程 IPC；GDI/CPU 合成不依赖 GPU |
| 窗口 API | CreateWindowExW(WS_POPUP, WS_EX_LAYERED/TOPMOST/TOOLWINDOW/NOACTIVATE) + CreateDIBSection(32bpp premult BGRA) + UpdateLayeredWindow(ULW_ALPHA) | 官方逐像素 alpha 路径；alpha=0 自动穿透；本机实测 ULW 可行 |
| 不采用 | winit/softbuffer/wgpu/DirectComposition（v1） | winit 透明实现本身使用 WS_EX_LAYERED 且与 Tauri 事件循环冲突（[ISSUE] winit#851、[外部] 03 方案矩阵）；softbuffer Win32 主呈现路径是 BitBlt，源码注释明说透明尚未处理（[外部] softbuffer/src/backends/win32.rs）；DComp 逐像素 alpha 需要 NOREDIRECTIONBITMAP 且不能调用 blur-behind/frame-extend，设备丢失/RDP 风险更高（见 §2.6/§3.1） |
| C# | **只做本机 spike / 验收工具**，不交付 | 本机 csc 实测可编译运行（§12）；但独立进程要重做托盘/单实例/存档/IPC/签名，双运行时长期成本高 |
| Chroma-key/SetWindowRgn | 不作为交付方案 | 仍是 WebView2/渲染链补丁；SetWindowRgn 同时裁剪绘制与命中（#16341 当事应用就用它并伴随自定义 NC 处理，无法隔离因果）；Chroma-key 有 AA/key 边缘风险 |

### 1.2 Rust-via-CI 可行性（明确）

- 现有 [仓] .github/workflows/build-windows.yml 已在 windows-latest 上用 dtolnay/rust-toolchain@stable 构建 Tauri/NSIS 成功；新增 cargo fmt/clippy/test 与 native smoke 是增量，不引入新 runner 类型。
- 纯 CI 反馈环约 8–15 分钟；本机不能 cargo check，意味着每个编译错误/Windows 行为 bug 都要走 CI 或本地 C# 台架。**建议把安装本地 rustup + VS 2022 Build Tools（约 2–3 GB、30–60 分钟）作为 Sprint 前置**（lead 决策 D1），否则工期估算 +25–40%。
- CI 能做的平台验收：构建、字节级契约/单元测试、进程级 smoke（窗口创建、exstyle、ULW 调用、DPI 查询、窗口存在/隐藏、退出码、JSON 属性）。CI 的 GitHub 托管 runner 是**无物理显示器/无真实多屏的虚拟桌面**，不能替代 DWM 合成/DPI/锁屏/RDP 视觉验收（[外部] Playwright 文档只说明 headed 可用，不代表 DWM 行为等价）。

### 1.3 C# 原型可行性（明确）

- 本机实测（§12）：csc.exe 路径存在，编译 P/Invoke 探针 exit 0；创建分层窗口、ULW、PrintWindow、DPI 查询全部可调用；SetLayeredWindowAttributes 之后 ULW 失败（err=87）也被复现，正好验证了官方互斥规则。
- 能验证：API 可用性、窗口样式、坐标/DPI 数学、ULW 计时上界、逐像素命中语义（需解锁桌面）。
- 不能验证/不应承担：DWM 真实上屏、24h soak、多显示器/锁屏/RDP、发布生命周期；也不建议用它做产品（双栈成本）。补充：Win10 22H2/Win11 自带 .NET Framework 4.8，故 C# 原型可直接运行；但本机 csc（4.0.30319）只到 C# 5 语法级别，现代 C# 需要 VS Build Tools/.NET SDK——这也是「C# 只做台架」的另一条依据。
- 用途建议（≤1–2 人日）：本机解锁后做「命中/DPI/拖动」Oracle；或作为验收工具里 Add-Type 的 C# 辅助（截图/输入），不进入产品二进制。

---

## 2. 证据基线：上游 issue 与官方文档

### 2.1 Tauri #16341 —— Win11 长时透明窗变黑（OPEN，强相关）

- 状态：open，创建 2026-10-20，**0 评论**，labels: type: bug / platform: Windows / status: needs triage。
- 事实（来自 issue body，[ISSUE]）：
  - 长时运行的 borderless transparent 桌宠窗，透明区发展成**不透明黑矩形**，角色仍可见、交互仍工作；初始渲染正常；Win11 build 26200；时间不是必要条件的证明。
  - 日志有 display change / screen-capture device re-enumeration；本地尝试改另一显示器分辨率、graphics-reset 快捷键、显示器断电、反复杀 WebView2 GPU 进程都**未稳定复现**（且采样不连续、未覆盖宠物所在显示器/身份未记录）。
  - **故障注入**：对宠物 HWND 调 DwmEnableBlurBehindWindow(fEnable=FALSE) 可产生视觉相似的黑透明区；只发 WM_DWMCOMPOSITIONCHANGED 不能恢复；重放「空 region blur-behind + SetWindowPos(SWP_FRAMECHANGED) + InvalidateRect」可在原 HWND 恢复。
  - 当事应用额外做了 **SetWindowRgn + 自定义非客户区（WM_NCPAINT/WM_NCACTIVATE/WM_NCUAHDRAWCAPTION/WM_NCUAHDRAWFRAME）处理**；作者明确无法隔离这些定制与故障的因果。
  - 他们 prototyped 了恢复逻辑：监听 WM_DISPLAYCHANGE / WM_DWMCOMPOSITIONCHANGED，在窗口线程延迟 100ms 重放 blur-behind + SetWindowPos + InvalidateRect；只能恢复人工注入故障，对自然失败**未验证**。
  - 维护者问题（是否同一 failure class、Win8+ 下不依赖 WM_DWMCOMPOSITIONCHANGED 的正确事件顺序、如何诊断、no_redirection_bitmap 是否适用、SetWindowRgn 是否干扰）**尚无回复**。
- 对架构 A 的含义：
  1. 原生 ULW 方案不创建 blur-behind 状态，**结构上移除**该 issue 的一个可疑变量；但「显示变更导致 DWM/合成状态丢失」这一类故障不能假设只存在于 WebView2。
  2. 必须实现 **reassert**：Win8+ DWM 已经常开启，视频模式变化不保证发 WM_DWMCOMPOSITIONCHANGED（MS 文档明确），所以监听集合必须包含 WM_DISPLAYCHANGE / WM_DPICHANGED / WM_POWERBROADCAST / WM_WTSSESSION_CHANGE / WM_SETTINGCHANGE；恢复动作对 ULW 是「SetWindowPos(SWP_FRAMECHANGED|NOMOVE|NOSIZE|NOZORDER|NOACTIVATE) + 重新 UpdateLayeredWindow 完整帧」。
  3. 24h soak + 显示变更循环是发布硬门，而不是「跑一次不黑就过」。

### 2.2 Tauri #14764 —— 透明窗拖动/焦点 ghost 标题栏（CLOSED，根因=WebView2 Runtime 回归）

- 状态：closed 2026-01-24（state_reason completed），15 评论，labels: type: bug / status: upstream / platform: Windows。
- 事实（[ISSUE] comments）：
  - transparent: true 最小 Tauri 工程即可复现；拖动/焦点变化出现 ghost titlebar；环境 WebView2 **144.0.3719.67**；
  - 换到 WebView2 **143.0.3650.139** 即恢复；fixedRuntime 指定 143 是当时 workaround；
  - 汇总到 WebView2Feedback **#5492**（transparent window artifacts，tracked/regression）；**144.0.3719.93 修复**（评论中多人确认），Edge Canary 146 也正常；
  - Tauri 维护者建议上报 upstream；Tauri 侧未做代码修复。
- 含义：**WebView2 透明行为随 evergreen Runtime 版本漂移**；当前本机 153.0.4234.48 已越过该修复，但 web 回退路径仍可能遇到未来回归（见 2.5 的 154 回归）。

### 2.3 Tauri #14823 —— Win10 透明/无阴影/无装饰窗口右下黑边（CLOSED，低强度证据）

- 状态：closed 2026-01-24（当天），**0 评论**；环境 Win10 19045 / WebView2 144.0.3719.82 / Tauri 2.9.5；描述为 resize 时右/下出现黑边；无最小复现、无维护者解释。
- 含义：不能据此断言 Win10 有独立平台缺陷；但 Win10 22H2 已 EOL（[官] 2025-10-14 结束支持），仍应作为「兼容但不承诺」矩阵行（有大量存量用户），用 §4 的 T-22 实测。

### 2.4 Tauri #15947 + PR #15410 —— 透明窗合成树重建、noRedirectionBitmap

- Tauri #15947（open，创建 2026-08-30，labels: type: bug / platform: Windows）[ISSUE]：
  - 1440×900 transparent alwaysOnTop PixiJS 桌宠；玩家在 **Windows 10** 报告：最小化时桌面壁纸变黑、交互时透明区变黑；发生时刻正是应用**高频 toggle set_ignore_cursor_events()**。
  - 作者读 tao 0.34.8 源码后的模型：tao 在 attributes.transparent && !no_redirection_bitmap 时启用 DwmEnableBlurBehindWindow + 空 region hack；set_ignore_cursor_events 通过 SetWindowLongPtr 切换 WS_EX_TRANSPARENT|WS_EX_LAYERED，迫使 DWM 重建合成树（layered ⇄ direct composition path）；二者 + 最小化偶发 race → alpha/壁纸层黑。**这是 best-current-hypothesis，不是已确认根因**。
  - 提出 WS_EX_NOREDIRECTIONBITMAP（DirectComposition 路径）是结构性修法，并追问 PR #15410 的版本。
- PR #15410：feat(core): add no_redirection_bitmap API on Windows，**merged 2026-07-03**；Tauri 2.12.0 release notes 明确新增 app > windows > noRedirectionBitmap 配置与 WindowBuilder/WebviewWindowBuilder::no_redirection_bitmap 方法（[ISSUE] release notes）。
- 本仓现状：Cargo.lock **tauri 2.12.5**；tauri.conf.json 的窗口配置**没有** noRedirectionBitmap；main.rs 的点击穿透正是「轮询 + set_ignore_cursor_events」模式（[仓] main.rs:252–286）。→ 0.2.3 同时具备 issue 中的两个可疑因素（blur-behind hack + 高频 layered toggle）。
- tao 源码交叉证据（[外部] tauri-apps/tao dev src/platform_impl/windows/window.rs）：透明 && !no_redirection_bitmap 时才 CreateRectRgn(0,0,-1,-1) + DwmEnableBlurBehindWindow。故 **noRedirectionBitmap:true 会跳过该调用**。

### 2.5 WebView2 透明度官方约束与回归

- [官] ICoreWebView2Controller2::put_DefaultBackgroundColor：
  - 默认白色；alpha 可透明；**只支持 alpha=0 或 255**，半透明 E_INVALIDARG；
  - 已知问题：通过 API 设置颜色仍可能先闪白；建议用 WEBVIEW2_DEFAULT_BACKGROUND_COLOR 环境变量（只能设一次）；
  - Windows 7 上 alpha 不支持。
- [ISSUE] WebView2Feedback #5492（已修复）：144.0.3719.67/.82 透明窗 artifacts（ghost titlebar），144.0.3719.93 修复；label tracked/regression。
- [ISSUE] WebView2Feedback #5752（OPEN，2026 年）：Runtime **154.0.4258.62** 上 transparent WebView2（DefaultBackgroundColor A=0）被画成**主题色不透明背景**；官方两种设置方式都被忽略；CDP override 也无效；--disable-gpu 无效；页面本身透明。可能与 #5481 回归复现有关。环境 Win11 24H2 + dark mode。
- [ISSUE] WebView2Feedback #5668：alpha=0 的 WebView2 窗口（LWA_ALPHA=0，无 WS_EX_TRANSPARENT）仍吞掉整个桌面点击，说明 WebView2 窗口化宿主**没有逐像素命中**，透明≠穿透。
- [外部] wry 文档：Windows 透明只支持 alpha=0，半透明被替换为 255。
- 含义：web 渲染器只能在「Runtime 版本可控且行为已知」的窗口内作为回退；不能承诺长期稳定；这也是原生方案的核心动机。

### 2.6 官方分层/合成/DWM 语义（原生方案依据）

| 主题 | 官方事实 | 对设计的约束 |
|---|---|---|
| 分层窗口命中 | 「Hit testing of a layered window is based on the shape and transparency of the window. This means that the areas of the window that are color-keyed or whose alpha value is zero will let the mouse messages through. If the layered window has WS_EX_TRANSPARENT, shape 被忽略、所有鼠标事件穿透。」（[官] Layered Windows / MSDN） | ULW 窗口的 alpha=0 自然穿透；**不要**再 toggle WS_EX_TRANSPARENT 去实现穿透；气泡窗若需全穿透可用 WS_EX_TRANSPARENT，但语义是「整窗全穿透」 |
| UpdateLayeredWindow | 更新位置/大小/形状/内容/透明度；alpha=0 像素穿透；URL: learn.microsoft.com/windows/win32/api/winuser/nf-winuser-updatelayeredwindow | 一次调用可同时更新位置+尺寸+内容；命中区域随之更新（[推断] 需实机确认；不要用 SetLayeredWindowAttributes 去「刷新」，见下） |
| SetLayeredWindowAttributes 与 ULW 互斥 | 「一旦对 layered window 调用 SetLayeredWindowAttributes，后续 UpdateLayeredWindow 调用会失败，直到清除并重设 layering style bit。」（[官] SetLayeredWindowAttributes Remarks；本机实测 err=87 复现） | ULW 窗口**绝不调用** SetLayeredWindowAttributes（包括 Wails 用来刷新命中区域的 LWA_ALPHA=255 技巧，不能照抄）；如误用，恢复需要 clear/re-set WS_EX_LAYERED，但这违反 I1，运行中不要做；正确做法是首次实现就绝不调用它 |
| DwmEnableBlurBehindWindow | Win8 起调用不产生 blur 效果；透明度 alpha 仍被尊重；**DWM composition toggled 时必须重新调用**（[官]） | 原生方案不调用 blur-behind；这正是 #16341 的故障注入变量 |
| DWM 状态 | Win8+ DWM composition always enabled；视频模式改变不保证发 WM_DWMCOMPOSITIONCHANGED（[官] DwmIsCompositionEnabled + #16341 作者注） | 恢复事件必须包含 WM_DISPLAYCHANGE 等，而不是只等 WM_DWMCOMPOSITIONCHANGED |
| WS_EX_NOREDIRECTIONBITMAP | 「窗口不渲染到 redirection surface；用于无可见内容或使用其他 surface 机制提供视觉的窗口。」（[官] Extended Window Styles） | DComp/swapchain 路径必须用它；对 ULW 路径不需要（ULW 走 layered/redirection 语义） |
| DirectComposition | CreateTargetForHwnd/设备丢失：DXGI device lost 时 DComp device 也丢失，DComp 会向所有窗口发 WM_PAINT；应在每个 WM_PAINT 调 CheckDeviceState，丢失则重建 DXGI+DComp 设备与全部内容（[官] best practices / CheckDeviceState） | 若做 DComp 回退：必须实现设备丢失恢复；RDP/GPU 重置风险高 |
| DComp 逐像素 alpha | 必须 WS_EX_NOREDIRECTIONBITMAP；不能调用 DwmEnableBlurBehindWindow；不能 DwmExtendFrameIntoClientArea（否则 alpha 被 DWM glass 路径覆盖、半透明变不透明）；见 [外部] gogpu PR #430 的 A/B 结论 | DComp 路径的「平台坑」比 ULW 多；v1 不选 |
| 全屏独占 | DWM 被绕过；always-on-top 窗口不会显示在 exclusive fullscreen 之上；borderless windowed 才可叠加（[外部] Microsoft Q&A、winpane limitations） | 检测 fullscreen 并 hide pet；不要试图覆盖 exclusive fullscreen |
| 版本支持 | Windows 10 22H2 是最后版本，Home/Pro 2025-10-14 结束支持（[官] lifecycle） | Win10 22H2 作为兼容矩阵（不承诺新功能）；Win11 23H2/24H2/25H2 为主 |

### 2.7 第三方框架的同类证据（用于校验风险模型）

- [ISSUE] SDL #15751：transparent window + DXGI swapchain 在 NVIDIA 驱动选项 "Prefer layered on DXGI Swapchain" 下透明失效；workaround 是加 WS_EX_LAYERED|WS_EX_NOREDIRECTIONBITMAP + SetLayeredWindowAttributes。说明**GPU 驱动/合成路径**可单独破坏透明；原生 ULW（CPU/GDI）不依赖 swapchain，规避该特定类别。
- [ISSUE] winit #851：winit 的透明实现设置 WS_EX_LAYERED，与 borderless 组合出现不可见/不响应窗口；winit 0.30 提供 with_no_redirection_bitmap。→ 不要用 winit 验证透明窗口行为。
- [外部] softbuffer Win32 backend 源码：主路径 BitBlt 到窗口 DC，源码注释「TODO: Draw with something else to make transparency work.」→ 不要用 softbuffer 做逐像素 alpha。
- [外部] Wails v3 webview_window_windows.go（PR #5229）：透明 WebView 走 WS_EX_NOREDIRECTIONBITMAP + Chromium transparent；WS_EX_TRANSPARENT|WS_EX_LAYERED 只在显式 IgnoreMouseEvents 时施加；并且注释指出 layered 窗口 SetWindowPos 后命中区域不自动更新、用 SetLayeredWindowAttributes 刷新（**该技巧不适用于 ULW**）。
- [外部] OpenJFX bug 8239589：Windows Remote Desktop 断开/重连后 D3D pipeline 停止渲染，根因是未处理 D3DERR_DEVICEREMOVED；修复是销毁/重建 D3D device。→ DComp/D3D 回退必须做设备丢失恢复；GDI ULW 不涉及。
- [外部] neovide 错误文档：DCompositionCreateDevice2 在 RDP/headless/无 GPU 会话可能失败。作为「DComp 在 RDP 下不可假设可用」的旁证（非官方）。
- [外部] WPF AllowsTransparency 使用 layered window 并强制软件渲染（SO 讨论）；说明「layered = 软件合成」的性能/兼容权衡是已知的，ULW 的 CPU 成本可接受。

---

## 3. 平台正确性设计约束（实现必须遵守）

### 3.1 合成路径选择

| 路径 | 逐像素 alpha | 命中 | 设备/会话风险 | 结论 |
|---|---|---|---|---|
| ULW 分层窗口（CPU/GDI 预乘 DIB） | 是 | OS 按 alpha=0 穿透 | 低：无 D3D/DComp 设备；无 swapchain；驱动/会话影响小 | **v1 主路径** |
| DirectComposition + NOREDIRECTIONBITMAP | 是 | 矩形；需 WM_NCHITTEST 手写或接受矩形命中 | 高：DXGI/DComp device loss、RDP/headless、blur-behind/frame-extend 误用、swapchain 配置 | 仅作回退/后续优化，需单独验收 |
| WebView2 透明窗口 | 受限（窗口化宿主无逐像素命中） | 整窗 | 高：Runtime 回归（#5492/#5752）+ blur-behind/layered toggle（#15947/#16341） | 仅保留为临时回退，不扩用 |

### 3.2 ULW 不变量（I1–I10，code review 必查）

- **I1 窗口样式静态**：创建时固定 WS_EX_LAYERED|WS_EX_TOPMOST|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE，运行期**永不** SetWindowLong 修改 exstyle；尤其禁止 toggle WS_EX_LAYERED（会迫使 DWM 重建合成路径；#15947 的可疑触发链）。
- **I2 不碰 DWM blur/glass**：不调用 DwmEnableBlurBehindWindow、DwmExtendFrameIntoClientArea；不设置 DWM backdrop/Mica。
- **I3 不混用 SetLayeredWindowAttributes**：ULW 窗口只走 UpdateLayeredWindow；一旦误调 SetLayeredWindowAttributes，ULW 会失败（本机 err=87 实测），且不能用「清/设 layered bit」在运行中恢复（违反 I1），只能重建窗口。
- **I4 预乘 BGRA + ULW_ALPHA**：DIB 32bpp top-down，像素为 premultiplied BGRA；BLENDFUNCTION{AC_SRC_OVER, AC_SRC_ALPHA, 255}；缩放必须自己 nearest-neighbour，**禁止 GDI StretchBlt/BitBlt 缩放**（会清/破坏 alpha）。
- **I5 alpha 契约**：所有非交互像素 alpha=0；可见角色/UI 像素 alpha>0；半透明 AA 边缘只允许出现在「可接受指针命中」的 UI 区域。半透明装饰若位于桌面空白处会捕获点击（alpha>0 即命中），产品必须接受或改为 alpha=0 硬边。
- **I6 不用 SetWindowRgn**：ULW 已提供形状；SetWindowRgn 裁剪绘制+命中，且 #16341 当事应用使用它伴随自定义 NC 处理，无法隔离因果；气泡/菜单不需要。
- **I7 不逐帧 DwmFlush**：DwmFlush 阻塞到下一次 Present（[官]），逐帧调用会限制吞吐/增加延迟；仅在 show/DPI 切换后若首帧延迟可观测时做一次 flush，或完全不用（动画 4–16fps）。
- **I8 合成状态可恢复**：任何显示/会话/DPI/电源事件后，必须能重建 DIB、重放 ULW 完整帧、必要时重建 HWND；恢复逻辑独立于正常渲染路径，且可注入测试（见 §3.4）。
- **I9 创建/显示顺序**：CreateWindowExW 后至少一次有效 UpdateLayeredWindow 才可见；顺序 = 建隐藏窗 → 预乘 DIB → ULW → ShowWindow(SW_SHOWNOACTIVATE) → SetWindowPos(位置/topmost)，避免首帧白闪/黑闪。（[并行 01 实测] + [官] 语义）
- **I10 全帧呈现 + 事件驱动**：UpdateLayeredWindow 总是更新整个窗口；MVP 用全帧，不要为微优化改用需要 prcDirty 的 UpdateLayeredWindowIndirect 而引入漏更新。WM_PAINT 不是动画驱动（ULW 自供内容），动画由 timer/状态变化驱动，WndProc 的 WM_PAINT 可返回 0。

### 3.3 命中测试、点击穿透与焦点

- OS 语义：ULW 窗口 alpha=0 → 鼠标消息穿透到下层；alpha>0 → 命中本窗口。**不要**再实现 hit-region IPC/poller；这会引入延迟、旧位置残留与 layered toggle。
- 验证方法：锁屏桌面下普通 WindowFromPoint 只返回锁屏窗，不能用；可行做法是**私有桌面**（CreateDesktopW + SetThreadDesktop，必须在未初始化 OLE/USER 的线程上切桌面），在该桌面内验证 alpha=0 → 0、alpha>0 → 本窗口、ULW 移动后旧位置不再命中（[并行 01 实测]；CI 可否复现需 Phase 0 spike）。这只验证 USER32 命中语义，不等于 DWM 合成视觉验收。
- 半透明（1–254）像素可被命中：[推断，需 §4 T-05 验证] 若验收发现边缘误吞点击，可在合成时把 alpha<8 归零（视觉略硬），v1 不做。
- 点击不抢焦点：WM_MOUSEACTIVATE 返回 MA_NOACTIVATE；WS_EX_NOACTIVATE。注意 [外部] Wails 注释指出 NOACTIVATE 会在 Win+D/Alt+Tab 后产生点击穿透问题——必须列入 T-07/T-17。
- 拖动：建议 SetCapture + 手动 SetWindowPos（03 方案），避免 OS 模态移动循环阻塞动画/消息；拖动全程物理像素，DPI 变化中继续处理。
- 气泡窗：独立 layered 小窗 + WS_EX_TRANSPARENT（全穿透，[官]）；不要用「点击穿透部分区域」的混合语义；气泡不抢焦点。
- 菜单：优先 Win32 TrackPopupMenuEx（系统命中/键盘/无障碍），不要画进 ULW surface。
- 不做任何文本输入/IME 挂接：pet 窗口 ImmAssociateContext(NULL)；输入留在 WebView2 内容窗口。

### 3.4 合成状态重放与恢复（reassert）

事件集合（窗口线程，合并去抖 100–250ms，最多 1 次/200ms）：

| 事件 | 触发原因 | 动作 |
|---|---|---|
| WM_DISPLAYCHANGE | 分辨率/刷新率/拓扑变化 | 重建 DIB（若尺寸/DPI 变）、SetWindowPos(SWP_FRAMECHANGED / SWP_NOMOVE / SWP_NOSIZE / SWP_NOZORDER / SWP_NOACTIVATE)、重放完整帧 ULW、重算 workArea/位置 |
| WM_DPICHANGED | 显示器 DPI 变化 | 按 lParam 建议 rect 设窗口物理位置/大小；重算整数倍率 S；新 DIB；ULW；气泡重排 |
| WM_DWMCOMPOSITIONCHANGED | 合成状态变化（Win7 语义；Win8+ 很少发） | 同 reassert；但**不能只依赖它** |
| WM_POWERBROADCAST(PBT_APMRESUMEAUTOMATIC/PBT_APMRESUMESUSPEND) | 睡眠/唤醒 | reassert；重问显示器/DPI |
| WM_WTSSESSION_CHANGE（WTS_SESSION_LOCK/UNLOCK） | 锁屏/解锁 | 记录 session 状态；UNLOCK 后 reassert + 确保 topmost 仍在 |
| WM_SETTINGCHANGE（SPI_SETWORKAREA 等） | 任务栏/work area 改变 | 重算 workArea、贴边位置 |
| 首次 show / 首次 ULW 后 | 初始化 | 记录首帧时间戳；不额外 flush（除非验收发现首帧延迟） |

升级策略（自动回退 L1–L5 见 §7）：

- 单次 reassert 失败（ULW 返回 false 或首帧后仍黑）→ 立即重试一次；两次失败 → 重建 DIB + 重放；
- 连续 3 次 reassert 失败（60s 窗口）或 ULW 持续 ERROR_INVALID_PARAMETER → 重建 HWND（保留位置/状态/角色帧），重置计数器；
- 1h 内 2 次 HWND 重建或 5 次 reassert 失败 → 进入安全模式（opaque sticker）并持久化原因；下次启动再试 native。

### 3.5 DPI / 多屏（平台数学与验收表）

进程与窗口：

- 进程必须 Per-Monitor V2（Tauri/tao 已设置；native 线程启动时用 GetThreadDpiAwarenessContext 校验，必要时 SetThreadDpiAwarenessContext；不要重复 SetProcessDpiAwarenessContext 导致失败）。
- 所有 Win32 坐标用**物理像素** i32（可负）；窗口物理尺寸 = 逻辑布局 × dpi/96 取整；窗口位置由 MonitorFromWindow/GetMonitorInfoW 的 workArea（物理）决定。
- ULW 的 psize/pptDst 是物理像素；DIB 尺寸 = 像素尺寸；变化时整块重建，不做 DWM 拉伸。

DPI 策略冲突（C1，lead 必须拍板）：

- 方案 A（05-migration-plan）：严格整数艺术像素倍率 S = clamp(round_ties_even(2 × dpi/96), 2, 6)（2× art 为基准）。期望：100%→2、125%→2、150%→3、175%→4、200%→4、225%→4、250%→5、300%→6。优点：像素绝对 1:1 设备像素，无模糊、无不等宽；缺点：125%/175% 等档位宠物**视觉尺寸**相对窗口会变化（下表），需要产品接受。
- 方案 B（03-renderer-design）：device = round(art × L × dpi/96) 非整数倍 nearest-neighbour；验收单像素宽度差 ≤1 device px（125%/175% 会出现不等宽像素）。优点：视觉尺寸连续；缺点：像素风出现 2/3 像素宽混排，严格像素党会视为模糊/脏边。

本文件建议：**默认方案 A，验收锁定严格表；若 owner 认为 125/175% 尺寸跳变不可接受，则整体切方案 B 并只按 B 验收，不能两套口径混用。** 下表为方案 A 设备像素期望（art=96，基准 2×；窗口逻辑 480×336）：

| Windows 缩放 | dpi | 窗口物理 px | 宠物设备 px | 宠物在窗口内视觉占比 | 相对 100% 视觉尺寸 |
|---|---|---|---|---|---|
| 100% | 96 | 480×336 | 192×192 | 40.0% | 100% |
| 125% | 120 | 600×420 | 192×192 | 32.0% | 80% |
| 150% | 144 | 720×504 | 288×288 | 40.0% | 100% |
| 175% | 168 | 840×588 | 384×384 | 45.7% | 114% |
| 200% | 192 | 960×672 | 384×384 | 40.0% | 100% |
| 225% | 216 | 1080×756 | 384×384 | 35.6% | 89% |
| 250% | 240 | 1200×840 | 480×480 | 40.0% | 100% |
| 300% | 288 | 1440×1008 | 576×576 | 40.0% | 100% |

验收要求：上述每档实测窗口物理尺寸、宠物 bounding box 设备 px、边缘锐度（nearest-neighbour：边缘过渡色 ≤1px，且没有 DWM 拉伸造成的半透明模糊带）、命中网格随 DPI 正确。若采用方案 B，则另附每个窗格允许的 run-length 表（每行连续像素宽度 ∈ {floor,ceil}，差 ≤1）。

多屏：

- 跨屏拖动时窗口 DPI 由目标显示器决定；WM_DPICHANGED 建议 rect 必须采用（不要自己算错），随后立即重排。
- 混合 DPI（如 100% + 200%）下窗口可能在两屏之间被裁切；策略：以窗口中心/多数面积显示器 DPI 为准，或贴边后落回单屏；验收 T-11 定义期望。
- 显示器 hotplug/取消复制模式/负坐标：workArea 用 i32；窗口必须 clamp 到可见区域，不能丢到屏幕外。
- 位置持久化：保存物理坐标 + 显示器标识（device name/adapter）；恢复时校验可见性（交集 ≥96×72 逻辑 px），不满足则回默认右下。旧 localStorage 位置迁移由 host 读一次传给 native（03 §4.8）。

### 3.6 会话 / 合成生命周期矩阵

| 场景 | Windows 行为/风险 | 原生窗口期望 | 强制处理 | 验收 ID |
|---|---|---|---|---|
| 锁屏 Win+L / 解锁 | 安全桌面接管；普通桌面窗口不可见；解锁后 DWM 重合成；可能触发显示/会话事件 | 锁屏期间不可见（预期，不是缺陷）；解锁后 2s 内恢复正确内容/位置/层级，无黑块/ghost | WTSRegisterSessionNotification；UNLOCK 后延迟 reassert；不要假定句柄/内容仍有效 | T-13 |
| 快速用户切换 | 同锁屏；会话切换 | 切回后恢复 | WM_WTSSESSION_CHANGE + reassert | T-13 |
| RDP 连接/断开/重连 | 显示拓扑/DPI 改变；D3D 设备可能 removed（[外部] OpenJFX）；DComp 创建可能失败；GDI ULW 预期更稳 | 重连后 2s 内恢复；不黑、不吞点击；若无法恢复走 L1→L3，再不行安全模式 | 监听 WM_DISPLAYCHANGE/会话事件；检测 GetSystemMetrics(SM_REMOTESESSION) 仅作诊断，不预先禁用；验收以实际失败为准 | T-14 |
| GPU 重置（Win+Ctrl+Shift+B）/驱动更新 | D3D/DComp 设备丢失；GDI 路径通常不受影响；DWM 可能重建 | ULW 内容在 2 帧内恢复；无黑块 | reassert；若用 DComp 回退则必须 CheckDeviceState + 重建 | T-15 |
| 显示器睡眠/唤醒 | 显示设备断电/重新枚举；display change | 唤醒后恢复；窗口不丢 | WM_POWERBROADCAST + WM_DISPLAYCHANGE reassert | T-12 |
| 分辨率/刷新率改变 | WM_DISPLAYCHANGE；DWM 重配 | 位置 clamp；内容清晰；无黑 | reassert + 重算 workArea | T-09 |
| 显示器 hotplug/禁用主屏 | 拓扑变化；workArea 变 | 窗口移动回可见区域 | reassert + clamp；持久化恢复 | T-12 |
| 全屏独占游戏/视频 | DWM 绕过；topmost 不可见；SHQueryUserNotificationState 可检测 QUNS_RUNNING_D3D_FULL_SCREEN/QUNS_PRESENTATION_MODE | 进入全屏后 ≤500ms 隐藏 pet+气泡；退出后 ≤500ms 恢复，位置不变 | 复用 main.rs:475 的 is_fullscreen 语义；不要试图覆盖 exclusive fullscreen | T-16 |
| Borderless fullscreen | DWM 仍在；topmost 可显示 | pet 可显示在最上层；不挡关键 UI（用户可隐藏） | 保持 topmost；验收视觉/点击 | T-16 |
| UAC/安全桌面 | 安全桌面接管 | 期间不可见；返回后恢复 | 同锁屏；不弹权限/不抢焦点 | T-13 |
| 睡眠/休眠恢复 | 定时器/设备状态变化 | 恢复正确；无崩溃 | WM_POWERBROADCAST + reassert | T-12 |
| Explorer 重启/Win+D/Alt+Tab | Shell 重排；NOACTIVATE/TOOLWINDOW 可能被 Show Desktop 影响 | pet 不应消失且不应抢焦点；若被 Win+D 隐藏，应在 1s 内或托盘召回 | 验收定义期望；必要时注册 TaskbarCreated/监听；不可用 hack 抢焦点 | T-07/T-17 |
| 虚拟桌面切换 | 窗口属于创建它的桌面 | 切走不可见、切回可见；符合 Windows 常规 | 不跨桌面 pin（除非产品明确要求）；记录现状 | T-17 |
| 高对比度/透明效果关/省电模式 | DWM 视觉效果变化；ULW alpha 原则上不受影响 | 视觉不变/不黑；CPU 可接受 | 验收 T-21；不依赖系统透明效果 | T-21 |
| HDR/10bpc/宽色域 | DWM 色彩管理；截图可能偏移 | 颜色可接受、不发黑/不发灰 | 记录为观察项，不作为阻塞门（除非明显错色） | T-21 |

### 3.7 焦点、Z 序与任务栏

- 顶层样式：WS_EX_TOPMOST + WS_EX_TOOLWINDOW + WS_EX_NOACTIVATE；不显示任务栏/Alt+Tab（与现状 skipTaskbar 一致）。
- 点击宠物不改变前台窗口焦点（MA_NOACTIVATE）；打字/游戏输入不被中断。
- 与其他 topmost 窗口（任务栏、其它工具）冲突时：接受被覆盖或由用户召回；不要用定时 SetWindowPos(HWND_TOPMOST) 抢 Z 序（会打断前台全屏/菜单）。
- 设置/内容窗口打开时：允许 pet 仍 topmost，但菜单/对话框打开时 pet 不应盖住系统菜单；菜单用 TrackPopupMenuEx 自带前景处理。
- Win+D/Show Desktop/Win+Tab：列入验收，按产品期望定义（建议 pet 不被最小化，或通过 tray 召回；不使用 NOACTIVATE hack 强制置顶）。

### 3.8 性能/资源预算（与 03/05 统一，见 C2）

- 动画帧率 4–16fps（attack 峰值 24），**不是 60fps**；present-on-change；静止时 0 次 ULW。
- 本机 ULW 上界实测 0.407ms/480×336（含整窗填色+拷贝，锁屏环境，非上屏成本）；200% 窗口 960×672 约 4 倍像素 → 仍 <2ms p99 量级 [推断，需实测]。
- CPU 预算：idle ≤0.3%（60s 单核均值，05 更严）；动画 ≤1%；拖动 ≤2%；首帧：renderer 线程启动→首个 ULW ≤150ms（03），进程冷启动→窗口可见 ≤350ms（05）；私有内存：renderer ≤24MiB、native 模式 app（内容窗未开）≤60MB（05）/总 WS ≤120MB；24h RSS 漂移 ≤5%（warmup 10min 后，≥3MB 容差）；GDI/USER 句柄 0 增长。
- 不引入 GPU 依赖；不做 60Hz 空转；不逐帧 DwmFlush。

---

## 4. 真机测试矩阵（T-01 … T-24）

矩阵环境：**Win11 23H2/24H2/25H2 为主（必过）**；Win10 22H2（兼容，不阻塞默认切换但必须记录）；机器至少 2 台：NVIDIA 独显 + Intel/AMD 核显；显示器 1 台 100% + 1 台 150/200% 用于混合 DPI；RDP 用第二台机器连接。

| ID | 类别 | 环境/配置 | 操作 | 通过判据 | 自动化/证据 | 优先级 |
|---|---|---|---|---|---|---|
| T-01 | 构建 | windows-latest CI | cargo fmt/clippy/test + tauri build + native smoke | 全绿；smoke JSON 断言窗口/exstyle/ULW/DPI；产物 SHA/BUILD-INFO | CI + artifacts | MUST |
| T-02 | 启动/首帧 | 冷启动、内容窗未开 | 启动 native 模式 | renderer 首个 ULW ≤150ms；进程→可见 ≤350ms；无白闪/黑闪；窗口位置正确 | 探针时间戳 + 录屏 | MUST |
| T-03 | 长时 soak | 24h 连续运行 | 每 30s 截图 + 每 10min 资源采样 | 0 artifact event；RSS 漂移 ≤5%；句柄 0 增长；0 崩溃；窗口不消失 | harness + JSON/截图 | MUST |
| T-04 | 动画完整性 | 全部 clip 循环/切换 | 自动播放每个 clip ≥3 轮 + 角色切换 | 每帧与源 PNG 最近邻期望一致（允许 ≤0.1% 边缘像素容差）；无旧帧残留/混合帧；切换失败保留旧角色 | 帧比对 + 录屏 | MUST |
| T-05 | 点击穿透 | 100/125/150/175/200% | 在 alpha=0 网格点（≥300 点）与 alpha>0 网格点注入点击；下层测试窗计数 | 透明点 100% 落到下层；不透明点 100% 命中 pet；边缘误判 ≤0.1%；拖动/DPICHANGED 后立即复测仍通过 | SendInput + 下层窗口计数器 + WindowFromPoint | MUST |
| T-06 | 交互语义 | 各 DPI/角色 | 点击 head/body/tail、拖动、松手贴边、双击/长按 | 触发正确 region/动作；拖动全程不阻塞；贴边目标误差 ≤0 物理 px；位置持久化/恢复通过 | 事件日志 + 截图 | MUST |
| T-07 | 焦点/层级 | 有前台应用/打字中 | 点击 pet；Win+D；Alt+Tab；打开菜单 | 前台/输入焦点不变；pet 不在 Alt+Tab；Win+D 后行为符合定义（可见或 1s 内召回）；菜单可正常关闭 | 前台窗口/焦点探针 + 手测 | MUST |
| T-08 | 拖动/贴边 | 双屏/混合 DPI/负坐标 | 拖过屏幕边界、角落、任务栏附近 | 窗口不丢、不越界到不可达；DPI 切换正确；settle 无幽灵/残影 | 截图 + 位置日志 | MUST |
| T-09 | 显示变更 | 单屏 | 改分辨率/刷新率（含 30/60/120Hz） | 2s 内恢复；无黑块/残影/位置错乱 | 脚本 + 截图 | MUST |
| T-10 | DPI 单屏 | 100/125/150/175/200/250/300% | 每档启动/切换缩放（必要时重启） | 期望设备尺寸精确；边缘锐利；命中不偏移；方案 A/B 按选择验收 | 探针 JSON + 截图 + 像素测量 | MUST |
| T-11 | 混合 DPI 双屏 | 100% + 200%（或 150%） | 跨屏拖动、贴边、重启恢复 | 切换帧内完成；不模糊；位置/命中正确 | 录屏 + 探针 | MUST |
| T-12 | 显示器/电源 | 双屏 | 拔插 HDMI/DP、禁用主屏、显示器断电、睡眠唤醒 | 2s 内恢复/重定位；不丢/不黑；无崩溃 | 脚本 + 截图 | MUST（有硬件时） |
| T-13 | 锁屏/切换用户/UAC | 单机 | Win+L→解锁 ×20；快速用户切换 ×5；触发 UAC | 锁屏不可见为预期；解锁/返回后 2s 内正确；无黑块；无句柄泄漏 | 手测（需操作者解锁） | MUST |
| T-14 | RDP | 第二机 RDP 连接 | 连接、断开、重连 ×10；连接中改分辨率/缩放 | 重连后 2s 内恢复；无黑块/吞点击；失败自动降级且可恢复 | RDP 机 + 截图/日志 | MUST（有 RDP 环境） |
| T-15 | GPU | 本机 | Win+Ctrl+Shift+B ×10；驱动更新/回滚一次 | 2 帧内恢复；无黑块；无崩溃 | 手测 + 截图 | MUST |
| T-16 | 全屏 | 单机 | exclusive fullscreen 样例 ×10；borderless ×10 | 进入后 ≤500ms 隐藏；退出后 ≤500ms 恢复且位置不变；不覆盖 exclusive | 脚本 + 录屏 | MUST |
| T-17 | Shell/桌面 | 单机 | Explorer 重启；Win+D；虚拟桌面切换；任务栏自动隐藏/位置改 | 不崩溃、pet 可召回、不抢焦点；行为与定义一致 | 手测 + 逻辑探针 | SHOULD |
| T-18 | 托盘/单实例 | 单机 | 二次启动召回；托盘显示/退出；崩溃后重启 | 召回 ≤500ms；退出干净；单实例生效；崩溃导出 JSON 存在 | 自动化 | MUST |
| T-19 | 回退演练 | 单机 | 注入 ULW 失败/模拟黑块/杀死渲染线程；触发 L1–L4 | 每级在 SLA 内生效；日志/持久化正确；用户可切回 native；不崩溃 | 故障注入 + 日志断言 | MUST |
| T-20 | 气泡/菜单 | 各 DPI | 显示/隐藏气泡、长文本、菜单打开关闭 | 气泡不抢焦点、不吞桌面点击；菜单可键盘/鼠标关闭；无残影 | 手测 + 截图 | SHOULD |
| T-21 | 主题/无障碍 | 高对比度、透明效果关、省电、深/浅色、HDR | 切换后观察 | 视觉正确、不黑；CPU 可接受；HDR 记录颜色偏差 | 截图 + 记录 | SHOULD |
| T-22 | Win10 22H2 | Win10 19045 机 | T-05/T-06/T-10（100/150/200%）+ 1h soak | 与 Win11 同判据；记录差异；EOL 仅兼容 | 真机 | SHOULD（有机器时） |
| T-23 | 安装/便携/升级/卸载 | 干净 Win10/11 VM | 安装→启动→覆盖升级→卸载→重装 | 无残留、位置/设置兼容、回滚 web 可读旧存档 | 脚本 + 快照 | MUST |
| T-24 | 证据完整性 | 每次验收运行 | 运行 harness | JSON 含 commit/exe sha/OS build/GPU 驱动/显示器/缩放/会话/Runtime/截图；缺 provenance 的 PASS 无效 | 报告校验脚本 | MUST |

> 说明：MUST 全过才允许把 native 设为默认；SHOULD 失败需登记并给 owner 决策。任何一项出现 P0（黑块/吞点击/崩溃/焦点被抢）直接停在 opt-in。

---

## 5. 截图 / soak 门禁设计（可复现）

### 5.1 Artifact 判定定义（量化）

| 名称 | 检测定义 | 阈值 | 采样 |
|---|---|---|---|
| 黑框/黑块 | 在 alpha=0 掩码区域，当前截图与该区域「pet 隐藏基线」的亮度差 >16 且当前亮度 <32，且连续 ≥2 次采样（或持续 >1s） | 0 事件 | 30s/次（soak）；1s/次（门禁测试） |
| 黑条（猫臀缝隙） | 已知 alpha=0 的垂直/水平缝隙掩码内，任一行/列整段暗于基线（同上阈值） | 0 事件 | 同上 |
| 幽灵/残影 | 当前帧与期望帧 A/B 同时部分匹配（窗口内容可分割为 A 区和 B 区），或拖动结束后仍显示旧位置内容 | 0 次 | 每次拖动 + 每帧 |
| 撕裂/半帧 | 慢速交替测试帧下，单张捕获不能完全匹配 A 或 B：区域同时含 A、B 行/列，或 >2% 像素既非 A 也非 B | 0 帧 | 10Hz 捕获 ≥300 帧/配置 |
| 模糊/拉伸 | 边缘过渡带 >1 设备像素；或宠物 bbox 与期望设备尺寸不等（±0） | 0 | 每 DPI 档静态截图 |
| 旧命中位置吞点击 | 拖动/DPI 变化后，原位置 alpha=0 区域仍捕获点击 | 0 | 每次位置/DPI 变化 |
| 窗口消失 | IsWindowVisible=false 或截图不出现宠物（非隐藏策略场景） | 0 次（非策略原因） | soak |

所有判定使用**差分**：每次采样同时抓「pet 可见」与「pet 隐藏（或已知基线）」两张；避免依赖壁纸/动画背景/整图哈希。差分对透明区要求逐像素接近（建议通道差 ≤2，考虑 HDR/捕获抖动；先以标准 SDR 标定），对不透明区要求与期望帧最近邻一致。

### 5.2 A/B 差分捕获流程

1. harness 启动一个**下层测试窗**（已知棋盘格/色块，含点击计数器），置于 pet 下方；
2. 抓「基线」：隐藏 pet（或使用内部 flag 不绘制），抓取同区域 → baseline.png；
3. 抓「当前」：显示 pet，抓取 → current.png；
4. 从当前帧的 alpha 掩码（由 native 侧导出或从源帧+缩放参数重建）划分：
   - alpha=0 区：比较 current vs baseline；不得出现黑块/差异；
   - alpha=255 区：比较 current vs 期望合成（源 PNG 最近邻 + 位置）；容差 0（调色板）或 ≤1；
   - 1≤alpha≤254：期望 = alpha×art + (1−alpha)×baseline；容差 ≤3；
5. 输出 JSON + 失败区域 PNG 裁剪，保存到 run 目录。

### 5.3 慢速撕裂测试

- native 测试模式按 1Hz 交替两张全窗唯一图案（例如水平色带 A/B，颜色在调色板中唯一且不相邻）；
- harness 用 Windows.Graphics.Capture 或 Desktop Duplication 以 ≥10Hz 捕获 pet 窗口区域 30s；
- 对每帧分类：完全 A、完全 B、或 mixed；mixed 判定失败并附截图；
- 该测试对 4–16fps 真实动画同样适用：真实帧序列 + 捕获可检测半帧/旧帧；
- 说明：捕获 API 自身可能丢帧/加延迟，但不会把完整 A 帧变成 mixed；连续 300 帧 0 mixed 即通过。

### 5.4 24h soak 计划

| 时间 | 动作 | 采样 |
|---|---|---|
| 每 30s | 截图差分 artifact 检测 | 2880 张/24h |
| 每 10min | 进程私有/WS/CPU/GDI/USER 句柄计数 | JSON 序列 |
| 每 30min | 对测试显示器做一次分辨率/刷新切换（若有第二屏；否则每 2h） | reassert 计数 + 截图 |
| 每 60min | 启动/关闭一个 borderless fullscreen 测试窗 | 隐藏/恢复时间 |
| 每 2h | 睡眠/唤醒（若允许）/显示器断电 | 恢复截图 |
| 每 4h | 记录一次 60s CPU 均值 | 性能门 |
| 24h 结束 | 汇总 artifact events/perf/handles/crash；生成报告 | — |

锁屏/RDP/UAC 不能在无人值守 soak 中自动解锁（没有受支持的安全自动解锁）；列为**操作者协助门**：soak 中至少包含 20 次锁屏/解锁与 10 次 RDP 重连，由操作者在场时执行，harness 记录时间戳与截图。若必须全自动，则 soak 不锁屏，另跑专项锁屏测试（T-13）。

### 5.5 证据 JSON（provenance）示例

~~~json
{
  "runId": "2026-11-25T22-30-00Z-win11-26100",
  "task": "native-platform-acceptance",
  "build": { "commit": "<sha>", "dirty": false, "exeSha256": "<sha>", "renderer": "native", "tauri": "2.12.5", "webview2": "153.0.4234.48" },
  "machine": {
    "os": "Windows 11 Pro 24H2 26100.xxxx", "arch": "x64",
    "gpu": [{ "name": "NVIDIA ...", "driver": "32.0.16.1692" }],
    "monitors": [{ "device": "DISPLAY1", "width": 1920, "height": 1080, "dpi": 96, "refresh": 60, "primary": true }],
    "session": { "rdp": false, "interactive": true }
  },
  "config": { "dpiScale": 1.0, "theme": "dark", "transparencyEffects": true, "batterySaver": false },
  "gate": "G2-soak-24h",
  "samples": 2880, "artifactEvents": 0, "mixedFrames": 0, "crashes": 0,
  "perf": { "idleCpuPct": 0.12, "privateMB": 18.4, "gdiObjects": 21, "userObjects": 9 },
  "failures": [], "evidenceDir": "artifacts/native-platform/...", "reportSha256": "<sha>"
}
~~~

门禁脚本必须拒绝：commit 与 tag 不一致、dirty 工作树、缺 GPU/显示器/Runtime 字段、缺截图目录、失败重试后覆盖结果。

### 5.6 捕获/注入工具与限制

- 捕获：首选 Windows.Graphics.Capture（Win10 1803+，可抓显示器/窗口，DWM 合成后画面）；连续帧用 Desktop Duplication API（DXGI）；简单本地冒烟可用 PowerShell + System.Drawing CopyFromScreen（本机锁屏实测可抓到锁屏画面，但锁屏下无法验证 pet）。
- 限制：HDR/宽色域、硬件 overlay/MPO、受保护内容、某些 RDP/VM 环境可能导致捕获缺失或色偏；Desktop Duplication 在部分 RDP 会话不可用。验收环境应为 SDR、单/双物理显示器、无受保护内容；捕获失败视为环境错误，不计为 PASS。
- 输入注入：SendInput（真实鼠标事件）优于 PostMessage；点击目标由下层测试窗计数器 + WindowFromPoint 双重验证；必须在**交互式、未锁屏**会话运行。
- DPI/显示变更：优先使用第二显示器/DisplayConfig 脚本（Windows 设置中的缩放变更没有稳定公开编程接口，脚本化不可靠）；不能脚本化时由操作者按步骤切换并让 harness 记录前后截图。
- 禁止在测试窗口上设置 WDA_EXCLUDEFROMCAPTURE，否则截图失败。

### 5.7 CI 与真机边界

| 能力 | GitHub windows-latest | 自托管交互式真机 |
|---|---|---|
| 编译/单测/clippy | 是 | 是 |
| 进程级 smoke（窗口/exstyle/ULW/DPI 查询） | 可（有桌面会话，但虚拟显示） | 是 |
| 截图 artifact / 命中 / DPI 视觉 | 否，不可作为发布证据 | 唯一有效 |
| 锁屏/RDP/GPU/多屏 | 否 | 是 |
| 24h soak | 不建议（成本/无真实桌面） | 是 |

结论：CI 是构建与回归门；发布验收必须在自托管真机执行并把 JSON+截图入库（artifacts 可 gitignore，但发布证据需另存镜像/附件）。

---

## 6. 验收标准（G0–G10，native 默认切换门）

| 门 | 指标 | 阈值 | 证据 | 阶段 |
|---|---|---|---|---|
| G0 | 构建/单测 | CI 全绿（fmt/clippy/test/native smoke），无 dirty 构建 | CI + BUILD-INFO | P1 |
| G1 | 首帧/启动 | renderer 首 ULW ≤150ms；进程→可见 ≤350ms；无白闪/黑闪 | 探针时间戳 + 录屏 | P1 |
| G2 | 24h 无伪影 | artifactEvents=0、mixedFrames=0、窗口不消失（非策略）、0 崩溃；≥2 台机器 | soak JSON + 截图 | P2 |
| G3 | 显示/会话矩阵 | T-09/T-12/T-13/T-14/T-15/T-16 全过；每次恢复 ≤2s；无黑块 | 逐项报告 | P2 |
| G4 | DPI | T-10/T-11 按选定策略（A 或 B）全过；尺寸/锐度/命中 0 偏差 | JSON + 截图 | P2 |
| G5 | 点击/交互 | T-05 透明点 100% / 不透明点 100%；T-06/T-07 全过；焦点不被抢 | 自动化 + 手测 | P2 |
| G6 | 性能/资源 | idle ≤0.3%（60s）；动画 ≤1%；拖动 ≤2%；present avg ≤0.5ms/p99 ≤2ms；renderer private ≤24MiB；native 模式 app ≤60MB；24h RSS 漂移 ≤5%；句柄 0 增长 | 性能 JSON | P1–P2 |
| G7 | 回退 | T-19 四级回退全部按 SLA 生效；日志完整；可手动切回 native；默认失败不阻塞启动 | 故障注入报告 | P2 |
| G8 | 兼容性 | Win11 23H2/24H2/25H2 必过；Win10 22H2 记录差异不阻塞；NVIDIA+Intel/AMD 至少各 1 台 | 矩阵报告 | P2 |
| G9 | 打包/回滚 | T-23 安装/升级/卸载/回滚；--pet-renderer=web 可回到 0.2.3 行为；旧存档可读 | 安装矩阵 + 回滚演练 | P2/P3 |
| G10 | 证据完整性 | 所有 PASS 均有 provenance JSON + 截图 + 机器信息；无锁屏/未验证项不得标注 PASS | 审计 | P2 |

发布决策规则：

- native 默认切换（0.4.0）必须 G0–G10 全绿且无开放 P0；任一 MUST 失败 → 维持 web 默认、仅 opt-in。
- 24h soak **连续两次**失败（G2）→ 停止 native 默认计划，回到架构评审。
- 灰度期（opt-in beta）自动回退触发率 >1% 会话或 >0.5% 用户 → 回滚默认策略并收集现场。
- 任何「吞点击/抢焦点/桌面输入失效」P0 立即停止默认切换。
- **阶段口径**：02-tauri-integration 的 I6 首帧阈值（warm ≤800ms / cold ≤1500ms）是 Phase 1 集成冒烟口径；本表 G1 的 150ms/350ms 是发布目标，早期可按 02 冒烟阈值执行，但不得用冒烟阈值通过发布门。

---

## 7. 若原生窗口仍有伪影：分层回退设计

### 7.1 触发与层级

| 级别 | 触发（自动检测） | 动作 | SLA | 用户影响 | 日志/持久化 |
|---|---|---|---|---|---|
| L0 | 正常 | 无 | — | 无 | 每帧/每采样计数器 |
| L1 合成重放 | 单次 artifact 采样；或显示/会话/DPI/电源事件 | SetWindowPos(SWP_FRAMECHANGED / NOMOVE / NOSIZE / NOZORDER / NOACTIVATE) + 重放完整帧 ULW；必要时重建 DIB | ≤200ms | 可能 1 帧闪烁 | 记事件、计数、前后截图 |
| L2 渲染面重建 | L1 连续失败 2 次/60s；ULW 返回 false/ERROR_INVALID_PARAMETER | 新 DIB + 全量重绘 + 重新 ULW；重算 DPI/尺寸 | ≤500ms | 1–2 帧空白/闪烁 | 计数、错误码 |
| L3 HWND 重建 | L2 连续失败 2 次/10min；窗口丢失/无法命中 | 销毁/重建 ULW 窗口（保留位置/角色/状态输入），恢复 topmost/NOACTIVATE，重建后重放首帧 | ≤1s | 短暂消失 | 计数；保留崩溃/原因；重置 L1/L2 |
| L4 安全模式 | 1h 内 ≥2 次 L3，或 ≥5 次 L1，或特定环境（RDP/GPU 重置持续失败） | 切换到 **opaque sticker**：普通不透明小窗（主题底色 + 圆角 region 可选），渲染同一宠物帧但不透明；功能/交互保留（命中=矩形） | ≤2s | 视觉降级（有背景板），无黑块 | 持久化 safe-mode + 原因；tray 通知；下次启动重试 native |
| L5 web/隐藏 | 用户在设置中强制；或 L4 仍失败/崩溃 | 切回现有 WebView2 渲染器（已知风险）或隐藏 pet 仅保留托盘；绝不阻塞桌面输入 | ≤5s | 回到 0.2.3 行为/无宠物 | 持久化 renderer=web；日志 |

关键原则：

- **自动回退只降不升**（会话内）；下次启动重试 native 一次；
- **永不静默**：tray/设置/日志可见当前模式与原因；
- **回退路径也要验收**（T-19），不能只测 happy path；
- **L4 是产品级保险**：比「回到 WebView2 透明窗继续黑」更可控；
- 失败注入：测试模式支持 native-fail=ulw|surface|hwnd|black 以验证 L1–L4，不需要真实破坏系统。

### 7.2 环境相关的首选动作

| 环境 | 首选 | 说明 |
|---|---|---|
| 锁屏/解锁后异常 | L1 | UNLOCK 后延迟 reassert；不要立即重建 |
| 显示模式/分辨率变化后 | L1 → L2 | 重建 DIB/位置；重放 |
| RDP 重连后 | L1 → L2 →（若持续）L4 | GDI 预期可恢复；不预先禁用 |
| GPU 重置/驱动更新后 | L1 → L2 | DComp 回退需设备重建；v1 无 DComp 则只走 L1/L2 |
| 黑块持续出现但窗口仍响应 | L1 → L2 → L3 | 参考 #16341 的重放思路（但不同：ULW 无 blur-behind 状态） |
| 命中区域旧位置吞点击 | L3（重建 HWND） | 不要 toggle WS_EX_LAYERED；不要 SetLayeredWindowAttributes 刷新 ULW |
| 驱动/环境已知坏（用户报告） | L4 持久化 + 下次启动重试 | 记录 GPU 驱动/OS build/RDP 标记 |

### 7.3 当前 0.2.x 立即止血（native 未上线前）

在不改变架构的前提下，可先做 3 个低风险改动（建议 P0，需真机 A/B）：

1. **tauri.conf.json 窗口加 "noRedirectionBitmap": true**（tauri 2.12.5 支持，Windows-only）。作用：跳过 tao 在透明窗口上的 DwmEnableBlurBehindWindow 空 region hack（tao 源码条件 transparent && !no_redirection_bitmap），移除 #16341/#15947 的一个可疑状态变量；同时可避免透明窗初始白闪（[ISSUE] PR #15410）。
   - **风险/必须验证**：WebView2 在 NOREDIRECTIONBITMAP 父窗口上的透明表现需要真机 A/B（截图/录屏），若内容不可见/黑则回退该配置；CI 只能保证构建。
2. **WebView2 Runtime 版本风险披露/固定**：受 #5492（144.0.3719.67/.82）与 #5752（154.x）影响；可在安装器文档建议更新到已知良好版本；如产品允许，使用 fixedRuntime 固定已验证版本（会增加包体/更新负担，需 owner 决策）。
3. **降低触发频率**：把「最小化」改为「隐藏到托盘」；hit-region toggle 增加 ≥250ms 去抖，避免高频 SetWindowLongPtr 造成合成树重建（#15947 的可疑触发条件）；不新增 SetWindowRgn。
   - 注意：这些只是止血，不解决「WebView2 透明层」根因；native 仍是目标。

### 7.4 决策树（文字）

~~~text
检测到 artifact（截图/事件/ULW 失败）
├─ 显示/会话/DPI/电源事件刚发生 → L1 reassert（≤200ms）；成功→继续 soak 并计数
├─ 非事件路径 / L1 失败 → L2 重建 DIB+全量重放（≤500ms）
├─ L2 失败 2 次/10min → L3 重建 HWND（≤1s）
├─ L3 频繁（1h≥2）或环境已知坏 → L4 opaque sticker（≤2s，持久化 safe-mode）
└─ L4 失败/用户强制 → L5 web renderer 或隐藏（≤5s，持久化 renderer=web）
~~~

---

## 8. 风险登记（平台相关）

| # | 风险 | 等级 | 信号 | 缓解 |
|---|---|---|---|---|
| P1 | 原生 ULW 仍受 DWM/显示变更影响出现黑块（#16341 同类） | 中高 | 24h/显示变更测试 artifact | L1–L3 + 24h 门 + 日志；不把「换原生」当免死金牌 |
| P2 | 半透明 AA 边缘按 alpha>0 命中，误吞桌面点击 | 中 | T-05 边缘点失败 | 合成时 alpha<8 归零（可选）；接受硬边；验收明确 |
| P3 | WS_EX_NOACTIVATE + TOOLWINDOW 在 Win+D/Alt+Tab 后行为异常 | 中 | T-07/T-17 | 实测定义期望；tray 召回；必要时调整 exstyle 组合（避免 NOACTIVATE 的某些副作用需权衡焦点） |
| P4 | DPI 策略 A/B 未定导致验收口径摇摆 | 高（流程） | 评审 | lead 尽快拍板 C1；验收锁定一套 |
| P5 | 锁屏/RDP 无法自动解锁导致验收不可无人化 | 中 | 测试计划 | 操作者协助门 + 专用测试机；CI 不冒充 |
| P6 | 本机无 Rust/真实桌面 → 反馈环慢/验收延期 | 高 | 工期 | 安装本地 Rust（决策 D1）；C# 台架；CI 构建 |
| P7 | WebView2 回退路径本身有黑框（#16341/#5752） | 中 | 回退演练 | L4 opaque 优先于 L5 web；披露风险 |
| P8 | DComp/D3D 回退（若做）在 RDP/GPU 重置下失效 | 中 | 后续实现 | 本版不做；若做必须 CheckDeviceState+重建并过 RDP 门 |
| P9 | 截图捕获在 HDR/RDP/overlay 下失真导致假 PASS/FAIL | 中 | 捕获校验 | SDR 测试环境；差分基线；捕获失败=环境错误 |
| P10 | 上游 issue 状态/行为变化使假设失效 | 低中 | 定期复核 | 不依赖上游修复；每次发版前复核 #16341/#15947/#5752 |
| P11 | 基线工作树 dirty（157 改 + 12 未跟踪、0 tag）使证据不可复现 | 高（流程） | provenance 校验 | 先冻结 0.2.3 commit/tag；验收必须 clean commit |
| P12 | 回退逻辑自身引入 bug/闪烁/吞输入 | 中 | T-19 | 故障注入、日志、单测；回退代码独立 review |
| P13 | 无障碍回归：native 无 DOM/键盘焦点 | 中 | 评审/用户 | 托盘/设置窗键盘路径；气泡文本镜像到内容窗口（UIA/aria-live）；发布说明 |
| P14 | Win10 22H2 EOL 但用户存量大 | 中 | 兼容矩阵 | 兼容测试不阻塞；明确支持策略 |
| P15 | 多窗口 topmost 竞争（设置窗、气泡、pet） | 低中 | T-20 | 统一 Z 序策略；气泡在 pet 上；设置窗不抢 topmost |

---

## 9. 分阶段步骤（平台/验收线）

| 阶段 | 内容 | 交付 | 门 | 估算 |
|---|---|---|---|---|
| P0 止血与基线 | 冻结 0.2.3 commit/tag；noRedirectionBitmap A/B（配置 PR）；WebView2 风险披露；hide-not-minimize + toggle 去抖；锁屏本机解锁后跑 C# Oracle（ULW/命中/DPI 手测） | 配置文件、A/B 截图/录屏、基线 commit、C# 探针记录 | CI 绿；真机无回归或回退配置；基线 clean | 0.5–1.5 人日 |
| P1 native MVP + 平台 smoke | 原生窗口/ULW/DPI/reassert 骨架；--native-smoke；CI cargo 门；T-02/T-05/T-10 子集 | Rust 模块、CI、smoke JSON | smoke 全绿；本机/真机命中/DPI 初测通过 | 与 05 Phase 1 同步（10–12 人日） |
| P2 真机矩阵 | harness（截图/soak/注入）；T-03–T-24；修缺陷；回退演练 | 验收报告 + 证据包 | G1–G10 全绿 | 8–12 人日 |
| P3 opt-in beta | 双渲染器发布；采集自动回退/artifact 日志；用户反馈 | 0.3.0-beta.1 | 回退率/artifact=0 或达标；无 P0 | 3–5 人日 + 2 周观察 |
| P4 默认切换 | 0.4.0 默认 native；保留 web 回退；文档/发布说明 | 发布 | G9 回滚演练；owner 批准 | 2–4 人日 |

依赖：D1 本地 Rust 安装（lead）；D2 基线冻结/commit tag（owner）；C1 DPI 策略（lead）；D3 是否允许 fixedRuntime 固定 WebView2（owner）；D4 测试机/RDP/第二显示器可用性（owner）。

---

## 10. 集成点与文件地图（平台视角）

| 文件/目录 | 现状 | 平台改造 | 阶段 |
|---|---|---|---|
| app/tauri/src-tauri/src/main.rs:143–185 | Windows 单实例 mutex + FindWindowW(标题) 召回 | 召回目标改为 native 窗口句柄/类名（标题可保留作兼容）；新增 native 线程 spawn/停止 | P1 |
| main.rs:222–235 | recall_pet_window 走 Tauri WebviewWindow | 改为 native recall（自定义消息/ShowWindow+SetForegroundWindow） | P1 |
| main.rs:242–288 | set_pet_hit_regions + 60ms GetCursorPos 轮询 + set_ignore_cursor_events | native 模式删除/旁路；web 回退保留 | P1/P3 |
| main.rs:475 is_fullscreen | SHQueryUserNotificationState 检测 | 复用为 native hide 信号（通过 channel 发给渲染线程） | P1 |
| tauri.conf.json:13–27 | 480×336 transparent main 窗口 | native 模式不创建透明 main 窗；改为按需创建不透明内容窗；web 回退保留该配置（可加 noRedirectionBitmap 止血） | P0/P3 |
| capabilities/default.json | ignore-cursor/set-webview-background-color 等 | native 模式清理；内容窗权限按需 | P3 |
| src/pet/main.ts:1538,2240 | startHitRegionSync + setBackgroundColor | native 模式不加载 hit-regions；背景透明仅 web 回退 | P1 |
| src/pet/hit-regions.ts | 100/1000ms 上报 + alpha tile | native 模式删除/冻结；保留测试 | P1/P3 |
| src/pet/pet-window-dock.ts / edge-dock.ts | Tauri outerPosition/setPosition/currentMonitor | native 侧用 Win32 物理坐标重写；TS 仅 web 回退 | P1 |
| src/pet/hero-page.ts / hero-runtime.ts | Canvas2D + WebView2 渲染 | native 模式不加载；web 回退保留 | P3 |
| src/pet/content-window.ts:125,128,280 | 调 open_content_window，但公开仓 Rust 缺实现（05 发现） | 补 Rust command + capability；native 菜单/托盘入口调用它 | P1 |
| 新 app/tauri/src-tauri/src/native_pet/*（05/03 已设计） | — | 窗口/渲染/DPI/reassert/fallback/diag | P1 |
| scripts/qa/native-platform/*（新） | — | harness：截图/差分/撕裂/soak/注入/JSON | P1–P2 |
| .github/workflows/build-windows.yml | 构建 + 打包 | 加 cargo 门 + native smoke（nightly/tag 级 GUI smoke，避免 PR 必过 flaky） | P1 |
| docs/PLATFORM-WINDOWS.md（新） | — | 本文件平台/验收部分的长期版本 | P1 |

---

## 11. 代码级草图

### 11.1 Rust：窗口创建 + ULW + reassert 骨架（windows-sys 0.61）

~~~rust
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::UI::HiDpi::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

const EX_STYLE: u32 = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
        WM_DPICHANGED => { on_dpi_changed(hwnd, lp); 0 }
        WM_DISPLAYCHANGE | WM_SETTINGCHANGE | WM_POWERBROADCAST | WM_WTSSESSION_CHANGE => {
            schedule_reassert(hwnd); 0
        }
        WM_DESTROY => { PostQuitMessage(0); 0 }
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

unsafe fn present(hwnd: HWND, dib: &mut Dib, frame: &Frame, scale: u32, x: i32, y: i32) {
    dib.clear_transparent();                       // alpha=0 = 穿透契约
    dib.blit_nearest(frame, scale, offset_x, offset_y); // 禁止 GDI StretchBlt
    let mut dst = POINT { x, y };
    let mut size = SIZE { cx: dib.w, cy: dib.h };
    let mut src = POINT { x: 0, y: 0 };
    let mut blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8, BlendFlags: 0,
        SourceConstantAlpha: 255, AlphaFormat: AC_SRC_ALPHA as u8,
    };
    let ok = UpdateLayeredWindow(hwnd, 0, &mut dst, &mut size, dib.dc, &mut src, 0, &mut blend, ULW_ALPHA);
    // ok=0：记录 GetLastError，进入 L1/L2；绝不调用 SetLayeredWindowAttributes。
    debug_assert!(ok != 0);
}

unsafe fn reassert(hwnd: HWND, dib: &mut Dib, frame: &Frame) {
    SetWindowPos(hwnd, 0, 0, 0, 0, 0,
        SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    present(hwnd, dib, frame, current_scale(), current_x(), current_y());
}
~~~

要点（与 §3.2 对应）：

- 永远不要 SetWindowLong 改 EX_STYLE；不要 SetLayeredWindowAttributes；不要 blur-behind/frame-extend；不要 SetWindowRgn。
- 重新 ULW 完整帧即可更新位置/尺寸/形状；不要用「清/设 layered bit」刷新命中。
- present 失败与 reassert 失败计数进入 fallback 状态机；不要静默无限重试。
- DIB 用 top-down（biHeight=-h）简化行序；像素必须 premultiplied（R/G/B 先乘 A/255）。
- 消息循环用 GetMessage/PeekMessage + 高精度 timer（03 §4.6），不要 60Hz 空转；hide 时停 timer。

### 11.2 Rust：DPI 期望

~~~rust
fn art_scale_for_dpi(dpi: u32) -> u32 {
    // 方案 A：2x 基准，ties-to-even，夹 2..6
    let x = 2.0 * dpi as f64 / 96.0;
    let s = x.round_ties_even() as u32;
    s.clamp(2, 6)
}
// 预期：96→2, 120→2, 144→3, 168→4, 192→4, 216→4, 240→5, 288→6
~~~

### 11.3 C# 本地探针（本机已实测可用，命令示例）

~~~csharp
[DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
static extern IntPtr CreateWindowExW(int exStyle, string cls, string name, int style,
    int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);

[DllImport("user32.dll", SetLastError = true)]
static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst,
    ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int flags);
// ... CreateDIBSection + 预乘 BGRA 填充 + ShowWindow(SW_SHOWNOACTIVATE)
~~~

编译命令：C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /platform:x64 Probe.cs

本机输出（节选，[实测]）：CreateWindowEx hwnd=2032600；exStyle=0x08080088（LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE）；UpdateLayeredWindow ok=True；SetLayeredWindowAttributes 后 UpdateLayeredWindow ok=False err=87；清/设 LAYERED 后 ok=True；480×336 300 次 ULW avg 0.407ms。完整记录见 §12。

### 11.4 harness 差分判定（伪代码）

~~~text
for each sample:
  baseline = capture(pet_hidden)
  current  = capture(pet_visible)
  mask     = native.export_alpha_mask()          // 与当前帧/缩放/位置一致
  for region in mask.transparent_regions:
    diff = |current - baseline|
    fail if diff.luma > 16 and current.luma < 32 and consecutive_failures >= 2
  for region in mask.opaque_regions:
    expected = compose_nearest(frame, scale, offset)
    fail if current != expected (tolerance <= 1 for palette, 3 for AA)
  mixed = classify_tear(current, frameA, frameB)
  fail if mixed
write JSON {runId, samples, artifactEvents, mixedFrames, failures, evidenceDir}
~~~

---

## 12. 本机环境、实测记录与限制

### 12.1 环境事实（[实测]，2026-11-25 21:45–22:15 +08:00）

| 项 | 值 |
|---|---|
| OS | Windows 11 Pro，build 26300（CIM/注册表口径；C# 无 manifest 时 Environment.OSVersion 报 6.2.9200 属正常） |
| CPU/GPU | AMD Ryzen 9 9950X 16-Core；NVIDIA RTX 5090 D v2（驱动 32.0.16.1692）+ AMD Radeon iGPU（32.0.21036.18）+ OrayIddDriver 虚拟显示 |
| 显示器 | 1920×1080（Oray IDD 虚拟显示），刷新 30Hz，系统 DPI 96 |
| 会话 | 锁屏（LogonUI 在 session 1；前台窗口标题「Windows 默认锁屏界面」）；截图只能得到锁屏画面 |
| WebView2 | 153.0.4234.48（本机注册表） |
| 工具链 | 无 cargo/rustc/dotnet/msbuild/cl；有 C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe（.NET Framework 4.x）；Node、Python、PowerShell 5.1 |
| 仓库基线 | famling HEAD=7462ef4（origin/main），工作树 157 改 + 12 未跟踪、0 tag（05 记录）；**验收前必须冻结 clean commit** |

### 12.2 C# 探针（临时目录，不随交付）

- 源码：C:\Users\78\AppData\Local\Temp\famling-probe\Probe.cs（仅本次研究，不在仓库）。
- 编译：csc /nologo /target:exe /platform:x64 Probe.cs → exit 0（exe ~12.8KB）。
- 关键日志（节选）：
  - SetProcessDpiAwarenessContext(PMv2) ok=True；GetDpiForSystem=96；GetDpiForWindow=96；
  - CreateWindowEx hwnd=2032600；exStyle=0x08080088 LAYERED=True；
  - UpdateLayeredWindow ok=True err=0（连续多次成功；480×336 预乘 BGRA）；
  - PrintWindow(PW_RENDERFULLCONTENT) ok=True，采样 opaque=0x00FF00FF、corner=0x00000000 —— 只能读回窗口自身内容，**读不到桌面合成**，不能用于透明区验收；
  - 本次探针的 WindowFromPoint 在透明点/不透明点均返回非本窗口 HWND（锁屏导致），**本次探针未验证命中**；但**并行研究 01 用私有桌面（CreateDesktopW + SetThreadDesktop，未初始化 STA 线程）在同一台机器完成了逐像素命中验证**：alpha=0 → 0、alpha>0 → 本窗口 HWND、ULW 移动后旧位置 → 0/新位置 → HWND（[并行 01 实测]，本文件引用；DWM 合成视觉仍未验证）；
  - SetLayeredWindowAttributes ok=True；随后 UpdateLayeredWindow ok=False err=87；清/设 WS_EX_LAYERED 后恢复 ok=True —— 与官方互斥说明一致；
  - BENCH 300×480×336：avg 0.407ms、total 122.2ms（含整窗清/合成/Marshal 拷贝的上界，非 DWM 上屏成本）。
- 结论：C# 探针证明「Win32 ULW 路径可用 + 官方互斥规则 + 本机 API 能力」；并行 01 补充了私有桌面命中语义；**不证明** DWM 上屏、DPI 重排/视觉、锁屏恢复——这些必须在解锁的交互式真机上用 §4/§5 的 harness 验证。

### 12.3 本文件不能声称的结论

1. 没有完成任何 DWM 合成后的截图/soak/DPI 视觉验收（锁屏 + 无 Rust）；逐像素 USER32 命中语义已由并行 01 的私有桌面探针验证（本文件引用，未亲自复跑），但 DWM 合成视觉仍未验证；不能写「native 已经无黑框」。
2. #16341 根因未确认；本文件只把它作为「显示变更类故障必须 reassert + soak」的证据，不作为「已知可修」承诺。
3. DComp 回退未实现/未验证；WebView2 回退仍带已知风险。
4. Win10 实机未覆盖；Win11 仅本机 build 26300（且虚拟显示），不能代表 23H2/24H2/25H2 与真实 GPU 输出。
5. noRedirectionBitmap 止血效果未在本机 A/B（无 Rust 构建；CI 只能构建）。

### 12.4 可复跑命令（本机）

~~~powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /platform:x64 $env:TEMP\famling-probe\Probe.cs
Get-CimInstance Win32_OperatingSystem | Select Caption,Version,BuildNumber
Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' | Select pv
Get-Command csc,cargo,rustc,dotnet -ErrorAction SilentlyContinue
(Get-Process LogonUI -ErrorAction SilentlyContinue).Count
~~~

---

## 13. 参考链接（按主题）

上游 issue / PR：

- Tauri #16341（open）：https://github.com/tauri-apps/tauri/issues/16341
- Tauri #14764（closed）：https://github.com/tauri-apps/tauri/issues/14764
- Tauri #14823（closed，低强度）：https://github.com/tauri-apps/tauri/issues/14823
- Tauri #15947（open）：https://github.com/tauri-apps/tauri/issues/15947
- Tauri PR #15410（merged 2026-07-03）：https://github.com/tauri-apps/tauri/pull/15410
- Tauri 2.12.0 release notes（noRedirectionBitmap）：https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.0
- Tauri #13070（per-pixel click-through，closed 未实现）：https://github.com/tauri-apps/tauri/issues/13070
- Tauri #6164（setIgnoreCursorEvents forward，open）：https://github.com/tauri-apps/tauri/issues/6164
- Tauri #2090（transparent click-through，closed）：https://github.com/tauri-apps/tauri/issues/2090
- WebView2Feedback #5492（144.x 透明回归，fixed）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5492
- WebView2Feedback #5752（154.x alpha=0 背景失效，open）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5752
- WebView2Feedback #5668（透明 WebView2 吞点击）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5668
- SDL #15751（NVIDIA layered DXGI swapchain 透明问题）：https://github.com/libsdl-org/SDL/issues/15751
- winit #851（WS_EX_LAYERED + borderless）：https://github.com/rust-windowing/winit/issues/851

官方文档：

- Layered Windows（hit testing）：https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features
- Layered Windows（MSDN 原文，alpha=0 穿透）：https://learn.microsoft.com/en-us/previous-versions/ms997507(v=msdn.10)
- UpdateLayeredWindow：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow
- SetLayeredWindowAttributes（与 ULW 互斥）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes
- Extended Window Styles（WS_EX_NOREDIRECTIONBITMAP/TRANSPARENT/LAYERED）：https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles
- DwmEnableBlurBehindWindow：https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmenableblurbehindwindow
- DwmIsCompositionEnabled（Win8+ always enabled）：https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmiscompositionenabled
- DwmFlush：https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmflush
- DirectComposition best practices（设备丢失）：https://learn.microsoft.com/en-us/windows/win32/directcomp/best-practices-for-directcomposition
- IDCompositionDevice::CheckDeviceState：https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondevice-checkdevicestate
- IDCompositionDesktopDevice::CreateTargetForHwnd：https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondesktopdevice-createtargetforhwnd
- High DPI desktop app development：https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows
- WebView2 DefaultBackgroundColor：https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2controller2
- Windows 10 生命周期（2025-10-14 EOL）：https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro
- Windows.Graphics.Capture（截图）：https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture
- Desktop Duplication API：https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api

第三方/框架证据：

- tao 源码（透明窗口 blur-behind 条件）：https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/windows/window.rs
- wry 文档（Windows 透明 alpha 约束）：https://docs.rs/wry/latest/wry/struct.WebViewAttributes.html
- softbuffer Win32 backend（BitBlt TODO 透明）：https://github.com/rust-windowing/softbuffer/blob/master/src/backends/win32.rs
- winit with_no_redirection_bitmap：https://docs.rs/winit/latest/winit/platform/windows/trait.WindowAttributesExtWindows.html
- Wails PR #5229（NOREDIRECTIONBITMAP / layered 命中刷新）：https://github.com/wailsapp/wails/pull/5229
- gogpu PR #430（DComp 逐像素 alpha 需 NOREDIRECTIONBITMAP、禁 blur-behind/frame-extend）：https://github.com/gogpu/gogpu/pull/430
- OpenJFX bug 8239589（RDP 重连 D3D device removed）：https://mail.openjdk.org/pipermail/openjfx-dev/2021-March/029300.html
- neovide DComp RDP/headless 失败说明：https://errors.standardbeagle.com/neovide/neovide/could-not-create-composition-device/
- winpane limitations（exclusive fullscreen 不可覆盖、DComp 1–3ms 延迟）：https://github.com/peteretelej/winpane/blob/main/docs/limitations.md
- WPF AllowsTransparency 与 software rendering 讨论：https://stackoverflow.com/questions/21576016/is-wpf-hardware-accelerated-when-window-allowstransparency-true
- Microsoft Q&A（always-on-top 不覆盖 exclusive fullscreen）：https://learn.microsoft.com/en-ie/answers/questions/5514066/how-would-i-put-an-application-like-a-clock-over-a
- 同类 Win32 分层窗口桌宠实测（预乘/常驻面/性能）：https://juejin.cn/post/7703394427519877156

内部证据（本仓/工作区）：

- repos/famling/app/tauri/src-tauri/src/main.rs:143–185,222–288,475,648–653
- repos/famling/app/tauri/src-tauri/tauri.conf.json:13–27
- repos/famling/app/tauri/src-tauri/Cargo.lock（tauri 2.12.5 / tao 0.37.2 / wry 0.57.2 / windows-sys 0.61.2）
- repos/famling/src/pet/main.ts:1538,2240
- repos/famling/src/pet/hit-regions.ts:202–208,292–348
- repos/famling/src/pet/pet-window-dock.ts:1–14,271,331
- repos/famling/src/pet/hero-runtime.ts:1453–1536
- repos/famling/docs/research/PET-OCCLUSION-TECH-2026-11-18.md（透明/穿透/拖动/DPI 根因与坐标公式）
- repos/famling/docs/plan/ADR-SCALE-DPI-2026-11-20.md（DPI/缩放既有决策）
- repos/famling/docs/plan/SOAK-SHORT-E11-2026-11-20.md、GUI-SMOKE-E11-2026-11-20.md（本仓证据协议/门槛先例）
- 工作区根 FIX-2026-11-25.md、FIX-2026-11-25-BUTT.md、PET-WINDOW-ARCHITECTURE-REVIEW.md
- work/native/research/01-native-stack.md（技术栈选型、C# 台架、私有桌面命中实测）
- work/native/research/02-tauri-integration.md（进程内集成、集成 gate I1–I14）
- work/native/research/05-migration-plan.md（迁移/验收阈值基线）
- work/native/research/03-renderer-design.md（渲染/命中/调度设计）

---

## 14. 与并行研究的一致性 / 冲突（需 lead 裁决）

| # | 冲突/差异 | 05-migration-plan | 03-renderer-design | 本文件建议 |
|---|---|---|---|---|
| C1 | 125%/175% DPI 策略 | 严格整数艺术像素倍率（2/2/3/4/4），视觉尺寸 ±20% | 非整数 device 倍率 nearest-neighbour，单像素宽度差 ≤1 device px | **必须二选一**：本文件建议 A（严格整数）优先，因验收可精确断言、无混排像素；若 owner 拒绝尺寸跳变则整体切 B，验收只能按 B 口径 |
| C2 | 性能阈值 | idle CPU ≤0.3%、首帧 ≤350ms、private ≤60MB、24h RSS <10% | idle CPU ≤0.5%、首帧 ≤150ms、renderer private ≤12/40MB、24h RSS ≤5% | 采用两者更严者并区分层级：启动到可见 ≤350ms + renderer 首 ULW ≤150ms；idle ≤0.3%；animation ≤1%；renderer private ≤24MiB、app native ≤60MB；24h RSS ≤5% |
| C3 | 命中区域刷新 | 未涉及 | 提到若异常可 toggle WS_EX_LAYERED（清/设）+ 记录 | **禁止 toggle**：平台证据（#15947、winit、Wails）显示运行期切换 layered 会迫使 DWM 重建合成路径；ULW 重新 UpdateLayeredWindow 即可更新形状/命中；仍异常则 L3 重建 HWND |
| C4 | RDP 策略 | RDP 未细化 | 检测 SM_REMOTESESSION，若异常则隐藏/禁用 native | 不预先禁用；先 L1/L2 实测恢复；持续失败再 L4/L5；RDP 列入 MUST（有环境时） |
| C5 | noRedirectionBitmap 可用性 | 未提到（05 写于 PR 知识之外） | 未提到 | P0 止血选项：tauri 2.12.5 已支持；必须真机 A/B（可能影响 WebView2 内容），不影响 native 主路径 |
| C6 | 气泡/菜单归属 | MVP 不做气泡/菜单；右键直接开设置 | 气泡独立 native layered 窗；菜单 TrackPopupMenuEx | 平台视角同意 03；验收加 T-20（气泡不吞点击/不抢焦点） |
| C7 | CI 桌面会话可用性 | 05 称 GitHub windows-latest 有桌面会话（headed UI 测试可用） | 01 称 windows-latest 是 Session 0/服务会话、无可见桌面；可用 CreateDesktopW 做 headless 命中测试 | 本文件不依赖此结论：CI 只做构建 + 进程属性 smoke；CreateDesktopW 命中门能否进 CI 由 Phase 0 spike 决定；视觉验收一律真机 |
| C8 | 首帧阈值 | ≤350ms（cold，发布目标） | ≤150ms（renderer 首 ULW）；02 集成门为 warm ≤800ms/cold ≤1500ms | 发布门用 150/350ms；Phase 1 冒烟可先用 02 的 800/1500ms，但不得作为发布通过依据 |
| C9 | 窗口几何 | Phase 1 保持 480×336 逻辑窗口 | 01/03 建议 sprite-tight 小窗 | 本文件 §3.5 DPI 表按 480×336 契约（05 Phase 1）；若改 sprite-tight，窗口物理尺寸按 art×S+margin 重算，整数倍率/命中/DPI 逻辑不变，期望表需同步 |
| C10 | 命中证据口径 | 05 未细化 | 01 提供私有桌面实测 | 文档必须区分「USER32 命中语义已验证（私有桌面）」与「DWM 合成视觉未验证」；CI 若复现私有桌面探针，只能作为命中回归门，不能宣称视觉验收 |

需要 lead/owner 决策：D1 本地 Rust 安装；D2 基线冻结 commit/tag；C1 DPI 策略；C5 是否采用 noRedirectionBitmap 止血；D3 是否允许固定 WebView2 Runtime；D4 测试机/RDP/第二显示器资源；D5 native 默认版本（0.4.0）与 kill 条件确认；D6 是否投入 Phase 0 spike 验证「CI 私有桌面命中探针」与「CI 是否有交互桌面」。

---

## 15. 自评审与局限

- 本文件以「平台正确性 + 可验收」为目标，不替代 02/03/05 的架构/渲染/排期结论；冲突已在 §14 显式列出，不以单方结论覆盖。
- 上游 issue 的证据强度已逐条标注；#16341/#15947 都是未确认根因的现场报告，不能当「已证缺陷」引用；#14764/#5492 有修复确认。
- 本机锁屏 + 无 Rust，导致交互/合成类结论只能到「API 可用 + 文档语义 + 风险模型」层级；所有「必须真机」项已写入 §4/§6，没有用浏览器/CDP/CI 冒充。
- 性能数字是局部上界，不是发布指标；发布前必须用 §5 harness 在目标机重测并归档。
- 下一步：① lead 裁决 C1/C5/D1–D4；② 冻结 0.2.3 基线；③ 用解锁的交互式机器跑一次 C# Oracle（T-05/T-10 缩样）以在 Rust MVP 前拿到第一份平台证据；④ 把 §5 harness 做成可复跑脚本并与 CI 构建产物绑定。

---

## 16. 变更记录

| 日期 | 版本 | 说明 |
|---|---|---|
| 2026-11-25 | v1 | 初稿：上游 issue 证据、合成/DWM/DPI/会话分析、T-01–T-24 测试矩阵、截图/soak 门禁、G0–G10 验收、L1–L5 回退、本机 C# 实测与限制、与 03/05 的冲突清单 |



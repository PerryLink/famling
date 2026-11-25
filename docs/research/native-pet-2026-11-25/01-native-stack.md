# 01 · 原生透明窗口技术栈研究（架构 A：宠物窗口渲染层重构）

| 项 | 内容 |
|---|---|
| 任务 | task-14「原生透明窗口技术栈研究」 |
| 日期 | 2026-11-25 22:00（Asia/Shanghai） |
| 作者 | 研究子代理 native-stack |
| 状态 | **研究稿（RESEARCH ONLY）**。未改仓库代码、未提交、未读凭据；本文件是本任务唯一写入。 |
| 上游决策 | 架构 A 已批准：保留 Tauri/WebView2 做设置/内容窗口，宠物窗口改为原生逐像素 alpha 窗口（PET-WINDOW-ARCHITECTURE-REVIEW.md）。 |
| 输入基线 | repos/famling 工作树（0.2.3 内容）；repos/famling/app/tauri/src-tauri、src/pet、docs；并行研究 03-renderer-design.md、05-migration-plan.md。 |
| 范围 | 只研究**渲染/窗口技术栈的选型与可行性**（逐像素 alpha、命中/穿透、置顶、DPI、多屏、托盘/进程拓扑的栈约束）；不最终决定进程拓扑（task-15/02）、渲染调度细节（task-16/03）、平台验收矩阵（task-17/04）、迁移排期（task-18/05）。 |
| 证据标记 | **[仓]** 本仓源码/配置可复核；**[实测]** 本机（Windows 11 build 26300）本次实跑；**[官]** Microsoft 官方文档/源码；**[上游]** Tauri/winit/wgpu/softbuffer 官方源码或 issue；**[同类]** 第三方实现/修复记录；**[推断]** 由证据推导、需真机确认。 |

---

## 0. 执行摘要（TL;DR）

**结论：采用「Tauri host 单进程 + 独立 Win32 消息线程 + WS_EX_LAYERED 顶层窗口 + UpdateLayeredWindow(ULW_ALPHA) 逐像素 alpha + 预乘 BGRA DIB + CPU 整数最近邻放大」；不要用 winit、softbuffer、wgpu、DirectComposition，也不要把 C# 作为交付路径。**

### 0.1 十个关键判断

1. **唯一能同时给到「逐像素 alpha + OS 级逐像素点击穿透 + 置顶 + 无撕裂」的 Windows 栈是 WS_EX_LAYERED + UpdateLayeredWindow。** 系统文档原文：分层窗口的命中测试基于形状与透明度，「alpha 值为 0 的区域会让鼠标消息穿过」（[官] [Layered Windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features)）。这是本产品最贵的一个 API 语义：**不需要** 现在的 60ms 光标轮询、250ms 区域上报、整窗 set_ignore_cursor_events 切换。
2. **本机（无 Rust 工具链）已用 C#/.NET Framework 4.8 的 csc.exe 跑通同一条 Win32 路径**：16,384 字节 exe；CreateWindowExW(WS_EX_LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE) 得到 exstyle 0x08080088；UpdateLayeredWindow(ULW_ALPHA, 预乘 BGRA DIB) 返回成功；DWM composition 开启、DPI=96 [实测]。
3. **逐像素穿透在本机被 headless 验证（本报告新增方法）**：正常情况下本机桌面处于锁屏，WindowFromPoint 只能看到 LockScreenBackstopFrame；改用 **私有桌面（CreateDesktopW + 新线程 SetThreadDesktop）** 后测到：透明像素点 WindowFromPoint = 0（穿透），不透明像素点 = 我们的 HWND（命中）；窗口被 UpdateLayeredWindow 移到新位置后，**旧位置不再命中、新位置命中**——即 ULW 模式没有 WebView2 路线上「旧位置仍吞点击」的层化命中区域冻结问题 [实测]。
4. **性能不是问题，且离预算很远**：全帧 UpdateLayeredWindow 在 480×336（100% DPI 下 192 CSS 宠物窗的整窗）为 **0.044 ms/次**，720×504（150% DPI）为 **0.057 ms/次**，960×672（200% DPI）为 **0.076 ms/次**；含「重填 DIB + 呈现」的整帧路径为 0.083 / 0.170 / 0.290 ms/帧。8–12 FPS 下 CPU 占用 <0.4% 单核 [实测]。
5. **winit + softbuffer 拿不到逐像素 alpha**：softbuffer 官方文档写明 AlphaMode::Premultiplied/Postmultiplied 在 **Windows 上不支持**（[上游] [softbuffer src/lib.rs](https://github.com/rust-windowing/softbuffer/blob/master/src/lib.rs#L746-L771)）。winit 的 with_transparent(true) 在 Windows 上是 DwmEnableBlurBehindWindow 空区域（DWM blur-behind 路径），不是逐像素分层窗口（[上游] [winit v0.30.9 window.rs](https://github.com/rust-windowing/winit/blob/v0.30.9/src/platform_impl/windows/window.rs#L1236-L1249)）。
6. **winit + wgpu 同样不行**：wgpu 在 Windows 走 DXGI HWND swapchain，SurfaceTarget::WndHandle 被判定 opaque_only = true，composite_alpha_modes = [Opaque]；只有 DComp/XAML 的 Visual/SurfaceHandle 才允许预乘 alpha，而 wgpu 公开 API 的 SurfaceTarget 只有 Window 变体（[上游] [wgpu-hal dxgi/swapchain.rs](https://github.com/gfx-rs/wgpu/blob/trunk/wgpu-hal/src/auxil/dxgi/swapchain.rs#L185-L203)、[docs.rs SurfaceTarget](https://docs.rs/wgpu/latest/wgpu/enum.SurfaceTarget.html)）。另外 winit 事件循环「必须主线程、每进程一次」，而 Tauri/tao 已占用主循环（[上游] [winit event_loop.rs](https://github.com/rust-windowing/winit/blob/v0.30.13/src/event_loop.rs#L80-L94)）。
7. **DirectComposition（DComp）能逐像素 alpha，但拿不到 OS 的 alpha 命中穿透**：DComp 组合的是视觉树，窗口命中测试仍是矩形；要逐像素穿透得自己 SetWindowRgn/轮询，等于把最贵的能力丢掉，还引入 COM/D3D11/DXGI 复杂度。96×96 像素画、8–12 FPS 完全不需要 GPU 合成（[官] [DirectComposition](https://learn.microsoft.com/en-us/windows/win32/directcomp/directcomposition-portal)、[CreateSwapChainForComposition](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgifactory2-createswapchainforcomposition)）。
8. **WinForms 自身不提供逐像素 alpha**：Form.TransparencyKey 是颜色键、Opacity 是整窗透明度（system-redirected 模式，GDI 不保留 alpha）；逐像素必须 P/Invoke UpdateLayeredWindow。所以「WinForms 方案」的真实价值只是 **本机可编译的验证台**，不是产品路径（[官] [WPF 透明窗口原理](https://learn.microsoft.com/en-us/archive/blogs/dwayneneed/transparent-windows-in-wpf)、[Form.TransparencyKey](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.form.transparencykey)）。
9. **C# 可作为本地原型/回归台，但不建议交付**：本机 csc 只能 C# 5；.NET Framework 4.8 虽内置于 Win10 1903+/Win11（[官] [system requirements](https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements)），但独立进程会引入第二运行时、IPC、双份托盘/单实例/存档/崩溃处理与双 exe 打包签名。产品侧零收益。
10. **Rust 只能走 CI（本机不可编译）**：本机无 cargo/rustc/MSVC/VS/SDK/dotnet，且**沙箱内无外网**（github/crates.io/static.rust-lang.org 均连接失败，无 gh CLI），因此无法本地安装 rustup、无法拉 crates、也无法下载 CI artifact。现有 CI（.github/workflows/build-windows.yml）已在 windows-latest 上装 dtolnay/rust-toolchain@stable 并 npx tauri build 成功（[仓] build-windows.yml:38,46-48），新增模块/测试是增量步骤。**本机 C# 验证台 + CI 里的 Rust headless smoke 是这套约束下最可靠的组合。**

### 0.2 与已批准方案 / 并行文档的关系

- **修正架构 A 的措辞**：根目录 PET-WINDOW-ARCHITECTURE-REVIEW.md 的 A 方案写「Rust winit/softbuffer 或 wgpu 直接画 PNG 帧」。本文证据表明 **winit+softbuffer/wgpu 在 Windows 拿不到逐像素 alpha**（§4.2/§4.3）。应把实现栈固定为 **raw Win32 + UpdateLayeredWindow**；架构 A 本身（去 WebView2 透明链、保留 Tauri 设置窗）不变。
- **不矛盾地沿用旧结论**：docs/research/PET-OCCLUSION-TECH-2026-11-18.md §5.1 的「F UpdateLayeredWindow 逐像素 alpha 不可行」是**在 WebView2 宠物窗口内**不可行（WebView2 走 DWM/DComp，不接受应用自绘 layered surface）。架构 A 把 WebView2 从宠物窗口移除后，这个否决条件消失，ULW 反而成为最优解。
- **与并行文档一致**：work/native/research/03-renderer-design.md（渲染/命中/DPI 细节）与 05-migration-plan.md（进程/排期/开关）都已采用「raw Win32 + ULW」结论；本文补齐 **栈级证据链、C# 本机实测数据、以及可进 CI 的 headless 命中测试方法**（03/05 当时认为点穿断言必须解锁桌面才能做，本文给出私有桌面绕法）。

### 0.3 推荐栈一句话版

**Tauri 进程内新增一条 native-pet 线程：CreateWindowExW(WS_POPUP, WS_EX_LAYERED|WS_EX_TOPMOST|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE, 标题沿用 "Famling · 汀岚") → 常驻 32bpp top-down DIB（预乘 BGRA）→ 每帧 CPU 整数最近邻放大 96×96 PNG 帧 → UpdateLayeredWindow(ULW_ALPHA) 全窗提交 → 命中/穿透交给 OS 的 alpha 规则 → 托盘/单实例/DPAPI/存档全部留在 Tauri host。**

### 0.4 关键数字（本机 [实测]，详见 §3）

| 指标 | 数值 |
|---|---|
| 分层窗口 exstyle | 0x08080088（LAYERED 0x80000 + TOPMOST 0x8 + TOOLWINDOW 0x80 + NOACTIVATE 0x8000000） |
| UpdateLayeredWindow（全帧） | 192×192：0.037ms；288×288：0.039ms；480×336：0.044ms；720×504：0.057ms；960×672：0.076ms |
| 重填 DIB + 呈现（整帧） | 0.028 / 0.048 / 0.083 / 0.170 / 0.290 ms/帧（对应上表尺寸） |
| 逐像素 alpha 命中 | alpha=0 点 → WindowFromPoint=0；alpha>220 点 → 本窗口 HWND（3/3）；移动后旧位置 0/1、新位置 1/1 |
| DWM/DirectComposition | DwmIsCompositionEnabled = true；GetDpiForWindow = 96 |
| C# 验证台 exe | 16,384 字节；csc.exe 14.8.10001.0（仅 C# 5）；.NET Framework 4.8.10008 运行时 |
| 进程基线（C# 控制台 + 分层窗，仅参考） | working set 15→21MB，private 12MB（Rust 预期更低，不作为产品指标） |

---

## 1. 任务、约束与判定标准

### 1.1 需求（来自架构 A 与 product 约束）

| # | 需求 | 判定 |
|---|---|---|
| N1 | 逐像素 alpha：透明缝/洞（猫臀、尾巴间隙）不能出现任何背景色/黑边/黑条 | 必须 |
| N2 | 点击穿透：透明像素的点击落到桌面/下层应用；宠物/UI 像素可点 | 必须 |
| N3 | 始终置顶、无边框、无任务栏、无 Alt+Tab | 必须 |
| N4 | 拖动/贴边/位置记忆；不抢焦点；不阻塞动画 | 必须 |
| N5 | DPI 100/125/150/175/200% 与多显示器（含负坐标、混合 DPI）正确、清晰 | 必须 |
| N6 | 托盘召回/单实例/崩溃导出/存档等既有能力不回归 | 必须 |
| N7 | 单一 exe、无新运行时/驱动依赖、可回滚 | 必须 |
| N8 | 长时运行（24h）无黑框/黑条/残影/撕裂，内存稳定 | 必须 |

### 1.2 约束

- 本机无 cargo/rustc/MSVC/VS/SDK/dotnet **且无外网**（§2）；CI 可构建 Rust（build-windows.yml）。
- 架构 A：**保留 Tauri/WebView2 做设置/内容**；宠物窗口不再使用 WebView2 透明合成。
- 仓库只读：本任务只在 work/native/research/ 写一个 md；不 commit/push、不读凭据。

### 1.3 判定标准（选型时最看重的顺序）

1. 能否**结构性地**消灭「多层透明叠加」：宠物链路上只允许存在 1 层 alpha。
2. 是否获得 **OS 原生逐像素命中**（而不是轮询/整窗开关/自绘 region）。
3. 是否在本机/CI **可验证**（本机验证台 + CI 自动化 smoke）。
4. 是否**不引入新运行时/新进程/新 GPU 依赖**（保持单 exe、低风险）。
5. 逐帧成本是否远低于 8–12 FPS 预算。

---

## 2. 证据：本机环境探测（2026-11-25 [实测]）

| 项 | 结果 |
|---|---|
| OS | Microsoft Windows 11 专业版，version 10.0.26300，build **26300**（非 GA，见风险 R8） |
| 显示器 | 单显示器 1920×1080，**96 DPI（100%）**，work area 1032 高；无多屏/非 100% DPI 条件 |
| GPU | NVIDIA GeForce RTX 5090 D v2（32.0.16.1692）+ OrayIddDriver 虚拟显示驱动 |
| DWM | DwmIsCompositionEnabled = true |
| WebView2 Runtime | 153.0.4234.48 |
| .NET Framework | 4.8.10008（Release 534296）；csc.exe 14.8.10001.0，**/langversion 仅支持到 C# 5** |
| 缺失工具链 | 无 cargo/rustc/msbuild/cl/link/dotnet/vs/Windows SDK Include；无 gh CLI；有 git、Node 24、Python、PowerShell |
| 外网 | **不可达**：https://github.com、raw.githubusercontent.com、crates.io、static.rust-lang.org 均「无法连接到远程服务器」；无代理 env |
| 桌面状态 | **锁屏**：前台窗口 class = LockScreenBackstopFrame；CopyFromScreen 全黑（0 非黑采样）→ 无法在本机做「桌面合成后的视觉验收」 |
| 资源 | RAM 61.6 GB；C: 剩余 188.8 GB |

**结论**：本机可以做 **Win32 行为/性能/命中** 验证（不需要看到屏幕），但**不能**做 DWM 合成后的像素级视觉验收；后者必须真机解锁/VM/CI-GUI 机（见 §9、§11）。

> 方法学说明：本机验证采用「私有桌面」绕开锁屏（§3.3）。私有桌面上的窗口不在输入桌面，DWM 不合成它，但 **USER32 的窗口管理与分层命中区域计算照常工作**——这正是我们要验证的「OS 命中语义」，与「DWM 视觉合成」是两个可分离的断言。视觉合成验收放到真机矩阵。

---

## 3. 证据：C#/.NET Framework 4.8 分层窗口验证台（本机 [实测]）

### 3.1 为什么用 C#

本机唯一可用的编译工具是 .NET Framework 的 csc.exe（C# 5）。**C# 在这里只是「Win32 API 的实验台」**：它 P/Invoke 的 CreateWindowExW/UpdateLayeredWindow/WindowFromPoint 与 Rust 通过 windows-sys 调用的是同一组 USER32/GDI32 导出，行为一致。验证台源码放在系统临时目录（%TEMP%\famling-proto\），**没有写入工作区**，可随时用两行命令重建（§6.8）。

### 3.2 实测结果

| # | 断言 | 结果 | 证据 |
|---|---|---|---|
| T1 | csc 可编译 Win32 P/Invoke 程序 | 通过；LayeredProto.exe 16,384 B；参考：System.Drawing 解码 96×96 PNG 正常 | [实测] |
| T2 | 创建分层窗口 | CreateWindowExW 返回 HWND；GWL_EXSTYLE = 0x08080088 = LAYERED+TOPMOST+TOOLWINDOW+NOACTIVATE；WS_EX_TRANSPARENT **未设置** | [实测] |
| T3 | 逐像素 alpha 呈现 | CreateDIBSection（32bpp、top-down、BI_RGB、预乘 BGRA）+ UpdateLayeredWindow(ULW_ALPHA) 返回 TRUE（err=0） | [实测] |
| T4 | DWM/DPI | DwmIsCompositionEnabled=true；GetDpiForWindow=96；IsWindowVisible=true | [实测] |
| T5 | **逐像素命中**（私有桌面） | 透明像素 WindowFromPoint = 0；不透明像素 = 本窗口 HWND；强制透明的角落 = 0 | [实测] |
| T6 | **移动后命中跟随** | UpdateLayeredWindow 把窗口从 (100,100) 移到 (420,320)：旧不透明点 → 0（不再吞点击）；新不透明点 → 本窗口 HWND | [实测] |
| T7 | 逐帧成本 | 见 §0.4 表；UpdateLayeredWindow 全帧 0.037–0.076ms；填 DIB+呈现 0.028–0.290ms | [实测] |
| T8 | WinForms 可用性 | 引用 System.Windows.Forms.dll/System.Drawing.dll 编译并在本机运行；Form.TransparencyKey=Magenta、TopMost=true、NotifyIcon 构造成功 | [实测] |
| T9 | WinForms 逐像素 alpha | **不支持**：TransparencyKey 是颜色键、Opacity 是整窗 alpha；逐像素必须自己 P/Invoke UpdateLayeredWindow（与 C# 验证台等价） | [官] [WPF 博客](https://learn.microsoft.com/en-us/archive/blogs/dwayneneed/transparent-windows-in-wpf) |

### 3.3 私有桌面命中测试方法（可移植到 CI，本报告新增证据）

本机桌面锁屏时，WindowFromPoint 只会返回锁屏窗口；因此我们在**进程内新建一个私有桌面**，把新线程切到该桌面后再建分层窗口，命中测试只在该桌面的窗口空间内进行：

```csharp
// 关键顺序（必须在新线程、创建任何 USER 对象之前）：
// 1) 新线程：CreateDesktopW("FamlingProbeDesk", ...) 得到 hDesk（当前窗口站上创建）
// 2) SetThreadDesktop(hDesk) 成功后才能 RegisterClassExW / CreateWindowExW
//    - 实测：.NET STA 线程上 SetThreadDesktop 返回 FALSE、err=170 (ERROR_BUSY)（该线程已有 OLE/USER 对象）；
//      改用未初始化 STA 的新线程（MTA/裸线程）后成功。因此必须「先切桌面，再建任何窗口/COM」
// 3) 在该桌面建 WS_EX_LAYERED 窗口 → UpdateLayeredWindow(预乘 DIB) → ShowWindow
// 4) WindowFromPoint(alpha=0 像素) 期望返回 0/其它窗口；WindowFromPoint(opaque 像素) 期望返回本窗口
// 5) UpdateLayeredWindow 带新 pptDst 移动 → 旧位置不再命中、新位置命中
// 6) EnumDesktopWindows 辅助计数；结束后 DestroyWindow + CloseDesktop
```

- 实测输出（节选）：[desk] SetThreadDesktop=True、[desk] transparent px=(21,21) -> WindowFromPoint=0、[desk] opaque px=(33,11) -> WindowFromPoint=2361030 ours=True、[move] old opaque point -> 0、[move] new opaque point -> ours=True。
- **对 CI 的价值**：GitHub Actions windows-latest 是 Session 0/服务会话，没有可见桌面；但只要允许 CreateDesktopW，同样的 headless 断言就能在 CI 跑。它是「逐像素穿透」唯一可自动化的门禁（视觉/DWM 合成仍要真机）。**Phase 0 必须先在 CI 复验这条路径**（见 §10）。

### 3.4 实测暴露/确认的 API 注意事项

| 注意点 | 证据/说明 |
|---|---|
| 必须**预乘 alpha** | BLENDFUNCTION.AlphaFormat=AC_SRC_ALPHA 时 API 使用预乘 alpha；RGB 必须先乘 alpha（[官] [BLENDFUNCTION](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-blendfunction)）。本机探针在 CPU 侧预乘后画面/命中正常 |
| **不要**先调 SetLayeredWindowAttributes | 一旦调用，**后续 UpdateLayeredWindow 会失败**，直到清掉并重新设置 layered 位（[官] [Layered Windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features)） |
| **不要**设置 WS_EX_TRANSPARENT | 该样式会让系统忽略分层窗口形状，整窗鼠标穿透（[官] 同上）；且社区记录 LAYERED+TRANSPARENT 同时创建时 UpdateLayeredWindowIndirect 会失败（Qt 修复记录，[同类]） |
| 创建后必须先 ULW 才可见 | 「After the CreateWindowEx call, the layered window will not become visible until ... UpdateLayeredWindow has been called」（[官] 同上）→ 先建隐藏窗、先呈现、再 ShowWindow(SW_SHOWNOACTIVATE) |
| UpdateLayeredWindow 总是更新整个窗口 | 文档明确 "always updates the entire window"；prcDirty 只能用 UpdateLayeredWindowIndirect（Vista+）做局部更新（[官] [ULW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow)、[UPDATELAYEREDWINDOWINFO](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-updatelayeredwindowinfo)）。**MVP 用全帧**（实测 <0.1ms），不要为微优化引入脏矩形漏更新的风险 |
| GetLastError 在成功时不可信 | 本机连续调用时出现 UpdateLayeredWindow=TRUE err=1300（遗留 last-error），以返回值为准 |
| 缩放不能用 GDI | GDI 不保证保留 alpha（system-redirected 模式明确不保留；[官] WPF 博客），本机探针全程 CPU 最近邻写 DIB |
| 分层窗口只支持顶层（child 例外但无意义） | 「Windows only supports the layered feature for top-level windows... not ... child window transparency」（[官] WPF 博客，Vista 时代结论；Win8+ 允许 child LAYERED 但 ULW 不重定向 GDI），**宠物窗口内不能挂 WebView2/子控件**（见风险 R1） |
| 命中只看 alpha==0 | 半透明像素（1–254）仍会拦截点击；像素画是硬 alpha，正好；将来若画气泡阴影/半透明 UI，需接受「半透明也可点」或用交互区域语义处理（[官] Layered Windows 原文） |
| WM_PAINT 不会来 | ULW 应用自供内容模式不重定向 GDI、不需要应用重绘（[官] WPF 博客）；WndProc 里 WM_PAINT => 0 即可，不要依赖它推进动画 |

---

## 4. 候选栈逐项对比（重点：逐像素透明栈）

### 4.1 对比总表

| 方案 | 逐像素 alpha | 逐像素命中/穿透 | 合成/黑框风险 | 依赖/复杂度 | 本机可行 | 结论 |
|---|---|---|---|---|---|---|
| **A. raw Win32 顶层分层窗 + UpdateLayeredWindow（Rust，Tauri 进程内）** | ✅ 应用自供预乘 ARGB | ✅ OS 按 alpha=0 自动放行 | 只有 1 层 alpha，无窗口背景/WebView2 可黑 | windows-sys（已有）+ png（lock 已有）；~800–1200 行 Rust | ✅（C# 等价路径已实测） | **采用** |
| B. Tauri 透明窗 + WebView2（现状） | 仅「绘制透明」，非窗口形状 | ❌ 只能整窗 ignore + 轮询/矩形 | ❌ 多层叠加；Tauri #16341/#14764/#14823、WebView2 144/154 回归 | 现有 | ✅ | 仅保留给设置/内容窗 |
| C. winit + softbuffer | ❌ Windows alpha 模式不支持 | ❌ 矩形 + 自绘 | DWM blur-behind 路径（winit transparent） | 新依赖 + 第二事件循环（不可行） | ❌ 无 Rust 工具链 | **否决** |
| D. winit + wgpu | ❌ DXGI HWND swapchain = Opaque | ❌ 矩形 | DWM 合成路径；驱动相关 | 重（wgpu） | ❌ | **否决** |
| E. DirectComposition + DXGI composition swapchain | ✅ 预乘 alpha 表面 | ❌ 矩形命中（需 region/轮询补） | DWM/DComp 路径；GPU 驱动面 | COM/D3D11/DXGI，重 | ❌ | 备选（未来 GPU 特效） |
| F. WinForms/C# UpdateLayeredWindow（P/Invoke） | ✅（API 同 A） | ✅（同 A） | 同 A | 独立 exe + .NET FW 运行时 + IPC | ✅ 本机可建可跑 | **仅原型/回归台**（不交付） |
| G. WinForms TransparencyKey / Opacity | ❌ 颜色键/整窗 alpha | ✅ 颜色键区域穿透（但有彩边/抗锯齿风险） | 颜色键边缘伪影 | 低 | ✅ | 否决（不满足像素画边缘） |
| H. SetWindowRgn 逐帧裁剪 | ✅ 仅硬边（像素画可以） | ✅ 区域命中 | DWM 下 region 逐帧更新成本/闪烁 | 逐帧 region 构建 | 部分 | 否决（旧评估已否；洞/缝隙多、性能差） |
| I. Chroma-key WebView2（旧过渡方案 B） | ❌（颜色键近似） | ✅ 颜色键 | 仍依赖 WebView2 透明链 | 低 | ✅ | 仅工期不可接受时的止血 |
| J. Rust + tauri::window::WindowBuilder（无 webview 窗口）+ 子类化 | ✅（若自行 ULW） | ✅ | tao 接管窗口状态/layered 可能与 ULW 冲突 | 需 tauri 的 **unstable** feature | 未验证 | 集成备选，不推荐（见 §4.5） |

### 4.2 winit + softbuffer：为什么拿不到逐像素 alpha

- softbuffer 的 AlphaMode 文档把平台支持写得非常直白：Premultiplied 在「Android, Orbital, **Windows** and X11: **Not supported**」；Postmultiplied 同样 Windows 不支持（[上游] [softbuffer src/lib.rs#L746-L771](https://github.com/rust-windowing/softbuffer/blob/master/src/lib.rs#L746-L771)）。
- winit 的透明窗口在 Windows 上是 DwmEnableBlurBehindWindow（空 region）而非 WS_EX_LAYERED 逐像素 surface（[上游] [winit v0.30.9 window.rs#L1236-L1249](https://github.com/rust-windowing/winit/blob/v0.30.9/src/platform_impl/windows/window.rs#L1236-L1249)：// making the window transparent ... DwmEnableBlurBehindWindow）。
- 即便绕过 softbuffer 直接给 winit 窗口调 UpdateLayeredWindow，也要自己给窗口加 WS_EX_LAYERED、自己管 DIB——等于放弃 winit 的呈现路径，只剩事件循环；而 winit 事件循环「必须主线程、每应用一次」（[上游] [winit event_loop.rs#L80-L94](https://github.com/rust-windowing/winit/blob/v0.30.13/src/event_loop.rs#L80-L94)），Tauri/tao 已占用。**同进程方案不可行，另起进程又违背单 exe/无 IPC 目标。**

### 4.3 winit + wgpu：为什么也拿不到

- wgpu 的 surface 能力由 wgpu-hal/src/auxil/dxgi/swapchain.rs 决定：SurfaceTarget::WndHandle(_) => true 进入 opaque_only 分支，composite_alpha_modes = [Opaque]；只有 Visual/SurfaceHandle/SwapChainPanel（DComp/XAML 方向）才列出 PreMultiplied/PostMultiplied（[上游] [wgpu-hal dxgi/swapchain.rs#L185-L203](https://github.com/gfx-rs/wgpu/blob/trunk/wgpu-hal/src/auxil/dxgi/swapchain.rs#L185-L203)）。
- wgpu 公开 API 的 SurfaceTarget 只有 Window/DisplayAndWindow 两个变体（[docs.rs wgpu 30.0.2 SurfaceTarget](https://docs.rs/wgpu/latest/wgpu/enum.SurfaceTarget.html)），没有公开的 DComp visual 入口；SurfaceTarget::Visual 是 wgpu-hal 内部能力。
- 结论：**winit+wgpu 的窗口在 Windows 上 alpha 通道被忽略**，透明区域只会显示黑/背景，正是现状问题换了个更重的实现。否决。

### 4.4 DirectComposition（DComp）：能 alpha，但不给逐像素命中

- DComp 是「高性能位图合成 + 变换/动画」的视觉树 API，surface 用 CreateSwapChainForComposition + IDCompositionVisual::SetContent；IDCompositionDevice::CreateSurface 支持 DXGI_ALPHA_MODE_PREMULTIPLIED，所以**逐像素 alpha 本身没问题**（[官] [DirectComposition](https://learn.microsoft.com/en-us/windows/win32/directcomp/directcomposition-portal)、[CreateSwapChainForComposition](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgifactory2-createswapchainforcomposition)、[CreateSurface](https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondevice-createsurface)）。
- 但 DComp 窗口不是 WS_EX_LAYERED 的「应用自供内容」窗口，命中测试不按 alpha 走；要逐像素穿透只能逐帧 SetWindowRgn（成本/闪烁）或回到「整窗 ignore + 轮询」。**丢掉 N2**。
- 加上 COM/D3D11/DXGI 设备管理、首帧/设备丢失/驱动兼容面，对 96×96、8–12 FPS 的像素画是明显过度设计。结论：**不采用**；若未来要做 GPU 粒子/高级特效再评估。

### 4.5 Tauri 原生窗口变体（tauri::window::WindowBuilder）

- Tauri 2 确实有「无 webview 的 Window」构建器，Window::hwnd() 也能拿 HWND（[上游] [tauri windows/mod.rs#L1130-L1157, #L1771](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/window/mod.rs)），但该 builder **需要开启 tauri 的 unstable Cargo feature**（源码注释："This function requires the unstable Cargo feature"）。它还会让 tao 接管窗口的 DPI/尺寸/样式/消息处理，与我们要自己掌握的 WS_EX_LAYERED + ULW 呈现路径存在冲突面（tao 的 WM_PAINT/WM_DPICHANGED/样式管理）。
- 结论：**不作为 v1 主路径**。推荐的「独立线程 raw Win32 窗口」不依赖 unstable API，控制面最小；若 Phase 0 发现 Tauri 生命周期需要更强绑定，再把 J 作为 spike 选项（风险见 R1b）。

### 4.6 WinForms / C# 路线：能做，但为什么只做原型

- WinForms 没有逐像素 alpha 的一等 API（TransparencyKey=颜色键、Opacity=整窗），必须 P/Invoke UpdateLayeredWindow——与 Rust 的 Win32 调用等价（[官] WPF 博客；[官] Form.TransparencyKey）。
- 本机可行性已经实测（§3.2 T1/T8），C# 5 足够写 Win32 探针；若团队想要「今天就能点开看」的原型，C# 是最快路径。
- 但作为**交付**：独立 exe → 命名管道 IPC；托盘/单实例/存档/崩溃/更新双实现；双运行时（.NET FW 4.8 在 Win10 1903+/Win11 内置，但 Win7/8 已 EOL 且未来 Windows 版本策略不可控，[官] [system requirements](https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements)）；安装器/签名/杀软/完整性级别新增面。相对收益≈0（渲染结果一样）。
- 结论：**本地验证台 + 参考实现**；不进入产品。

### 4.7 已否决的其它方案

- **SetWindowRgn 逐帧裁剪**：只裁外轮廓、洞/缝隙难处理，逐帧构建 region + DWM 行为不确定（旧评估 PET-WINDOW-ARCHITECTURE-REVIEW.md C 方案已否）。
- **Chroma-key WebView2**：仍是 WebView2 透明链 + 颜色键边缘/抗锯齿问题（旧评估 B 过渡方案），不解决根因。
- **全局鼠标钩子/forward**：安全软件风险、与「低打扰常驻」冲突（旧 PET-OCCLUSION §5.3.3 已否）。
- **Electron/CEF/独立 GPU 进程**：改变产品形态，不在架构 A 内。

---

## 5. 推荐栈（决策记录）

### 5.1 决策表

| 维度 | 决定 | 依据 |
|---|---|---|
| 进程拓扑 | **Tauri host 单进程**；新增 1 条 native-pet 线程（Win32 消息循环）；设置/内容窗按需创建 WebView2 普通不透明窗口 | 单 exe、零 IPC、复用托盘/单实例/DPAPI/存档/崩溃钩子（参照 05 §2.2/§3） |
| 窗口 | WS_POPUP，ex = WS_EX_LAYERED \| WS_EX_TOPMOST \| WS_EX_TOOLWINDOW \| WS_EX_NOACTIVATE；**不设 WS_EX_TRANSPARENT** | §3.4、§4.1 |
| 标题/类 | 标题保持 "Famling · 汀岚"（单实例 FindWindowW 召回兼容，[仓] main.rs:21-23,169-173）；类名固定 FamlingPetWindow（供 class 召回/探针定位） | [仓] |
| 内容面 | 常驻 32bpp **top-down** DIB（biHeight=-h、BI_RGB、预乘 BGRA）；CreateCompatibleDC + SelectObject；尺寸 = 窗口物理像素 | §3.4 |
| 帧来源 | 现有 PNG（public/assets/pet/anim/<char>/<clip>/<clip>_NN.png，96×96，硬 alpha）+ manifest；png 0.18（Cargo.lock 已有）解码 → CPU 预乘 → 按角色/片段缓存 | [仓]；§5.5 |
| 放大 | **CPU 最近邻整数倍**写 DIB（禁止 GDI 缩放） | §3.4 |
| 呈现 | UpdateLayeredWindow(hwnd, NULL, &dst, &size, memDC, &src, 0, &blend{AC_SRC_OVER,0,255,AC_SRC_ALPHA}, ULW_ALPHA)；只在帧变化时调用（8–12 FPS）；**MVP 全帧更新** | [官]；实测成本 §0.4 |
| 命中/穿透 | **交给 OS**：alpha==0 穿透、alpha>0 命中；删除 60ms 轮询与 hit-regions IPC | [官] Layered Windows；[实测] T5/T6 |
| 交互语义 | 头/身/尾命中用现有 regions.json 在 native 侧做 art-px 矩形判定（点击→摸头、拖动阈值 6px） | [仓] src/pet/anim/regions.ts、public/characters/*/regions.json |
| 输入 | WM_MOUSEACTIVATE → MA_NOACTIVATE（不抢焦点）；左键按下 → 捕获+阈值 → WM_NCLBUTTONDOWN/HTCAPTION OS 移动循环（本线程内，不会阻塞 Tauri 主线程）；右键 → 打开内容/设置窗口（或 TrackPopupMenuEx） | 05 §4.2；[官] WM_NCLBUTTONDOWN |
| DPI | native 线程启动前 SetThreadDpiAwarenessContext(PMv2)；WM_DPICHANGED 按建议 rect SetWindowPos；窗口尺寸 = 96 × s（整数 s） | [官] WM_DPICHANGED / High DPI；§5.3 |
| 多屏/贴边 | MonitorFromWindow + GetMonitorInfoW(rcWork) 算右下角/贴边；位置存**物理像素**；WM_DISPLAYCHANGE/WM_SETTINGCHANGE 重新 clamp | [官] |
| 托盘/单实例/存档/语音 | **保持 Tauri host 现状**（tray/crash/DPAPI/save 命令不变） | [仓] main.rs:139-235 |
| 失败回退 | 运行期开关 --pet-renderer=web\|native（+env/配置文件）；native 初始化任一失败 → 日志 + 回退 web，不阻塞启动 | 05 §4.8 |
| 新依赖 | windows-sys 0.61 增 features Win32_Graphics_Gdi、Win32_UI_HiDpi；png = "0.18" 改直接依赖；**不引入** winit/wgpu/softbuffer/image/rand | [仓] Cargo.toml/Cargo.lock；§5.5 |
| 许可 | windows-sys（MIT/Apache-2.0）、png（MIT/Apache-2.0）→ 同步 THIRD-PARTY.md/LICENSES.md | [仓] |

### 5.2 不变量（实现红线）

1. 宠物链路上**只允许一层逐像素 alpha**；不得再出现 WebView2 透明窗口/DOM 背景/颜色键窗口。
2. **不得**对宠物窗口调用 SetLayeredWindowAttributes、**不得**设置 WS_EX_TRANSPARENT（§3.4）。
3. **不得**用 GDI/StretchBlt 缩放 32bpp 源（会清 alpha）；所有缩放/合成走 CPU。
4. 呈现前必须先 UpdateLayeredWindow（否则窗口不可见）；显示用 SW_SHOWNOACTIVATE。
5. 所有写入 DIB 的像素必须预乘（rgb * a / 255）；alpha=0 的像素 RGB 也必须为 0（预乘定义）。
6. 单实例召回必须仍能找到 native 窗口（保留标题或改成 class 召回，二选一，不能两边都不做）。
7. 禁止在 native 线程调用 Tauri 的同步窗口 getter（inner_position 等会 send_user_message 阻塞主线程），位置/尺寸一律用 Win32 原生 API 计算。
8. 视觉验收必须以「真机解锁桌面」为准，CI 的 headless 断言只覆盖行为/性能，不覆盖 DWM 合成。

### 5.3 DPI 策略：整数设备像素 vs 分数设备像素（需产品拍板）

现状 Web 在 100%/150% 上是整数物理倍率（2×/3×），在 125%/175% 上会产生 2.5×/3.5× 的**分数光栅**（像素画模糊/不均匀）。仓库 ADR D-SCALE-5 的既有原则是「像素画显示缩放只用整数/整数倒数；分数 DPR 只改变光栅密度」（[仓] docs/plan/ADR-SCALE-DPI-2026-11-20.md）。native 有两条路：

| 方案 | 公式（art scale=2 为例） | 100/125/150/175/200% | 优点 | 代价 |
|---|---|---|---|---|
| **D1 整数设备倍率（推荐）** | s = round_ties_even(2 × dpi/96)，clamp [2,6] | 2 / **2** / 3 / **4** / 4 | 全部整数、像素绝对清晰、无 shimmer | 125%/175% 视觉尺寸比 web 小/大约 ≤20%（100%/150% 完全一致） |
| D2 分数设备倍率（03 草案） | device = round(art × 2 × dpi/96) 最近邻 | 2 / 2.5 / 3 / 3.5 / 4 | 视觉尺寸与 web 一致 | 125%/175% 出现 2/3 设备像素交替的「不等宽像素」，动画时有 shimmer |

**建议 D1**，理由：本重构的核心卖点之一就是「像素画在任何 DPI 下都清晰」；125%/175% 的尺寸变化比长期 shimmer 更可接受，且 100%/150% 与现状**完全一致**。若产品坚持视觉尺寸一致，则 D2 作为可配置项，但必须在验收里增加「125%/175% 动画 shimmer」专项。**该决定不阻塞 Phase 0/1（都先用 D1 实现，切换只是公式）。**

### 5.4 窗口尺寸策略（先 sprite-tight，UI 另窗）

- 现状 480×336 是整个 UI（宠物+气泡+菜单+composer+设置）的容器；native 宠物窗口无法承载 WebView2（§3.4、R1），所以必须做归属切分。
- **推荐 Phase 1：sprite-tight 主窗**（96×s，可加 8–16px 透明内边距给气泡尖角/阴影预留），右键菜单用系统 TrackPopupMenuEx 或直接打开内容窗；气泡用**独立的第二个 native 分层小窗**（WS_EX_TRANSPARENT 全穿透 + 不抢焦点）或先不做气泡。这样窗口面积/ULW 拷贝最小，且 480×336 的布局约束不再约束宠物层。
- 代价：需要重排「宠物周围 UI」的产品设计（composer/结果卡/设置/TOS 全部进内容窗）；这是 task-15/16/18 的范围，本文只给栈约束：**WebView2 内容永远不放进宠物窗口**。
- 若产品强要求宠物窗口内出现气泡文字：用 native 自绘（GDI DrawTextW/DirectWrite 到同一 DIB）+ regions.json 命中语义；但 CJK 文本换行/输入法/可访问性都要自己做，Phase 2 再评估。

### 5.5 资产与帧缓存

- 三个内建角色：cat 143 帧/349,231 B、dog 136 帧/392,127 B、human 141 帧/360,744 B（合计 420 帧、约 1.10 MB PNG）[实测]。
- 解码后 96×96×4 = 36,864 B/帧；**只缓存当前角色当前 clip 的帧**（≤8 帧 ≈ 295 KB）+ 预乘；全角色全帧解压约 15 MB，不做常驻。
- 内建包用 build.rs 生成 include_bytes! 索引（或 Tauri resources 读取，二者都可行；嵌入可避免 portable zip 路径问题）；第三方/DLC 包用运行时文件加载（同一 loader + 尺寸/帧数上限）。
- 跨语言契约（TS manifest → Rust）由 05 §4.4 的 anim-contract.json + build.rs 方案负责；本文只确认 **PNG + manifest 是充分的输入**，不需要 WebView2/Canvas。

### 5.6 为什么不是「winit 当事件循环 + 自己 ULW」

理论上可以把 winit 窗口的 HWND 加上 LAYERED 并自己 ULW，但：
1. winit 事件循环必须主线程且每进程一次，Tauri/tao 已占用 → 同进程不可行；另起进程违背单 exe/无 IPC。
2. 需要绕过 winit 的呈现路径，实际只用它的窗口/事件封装，收益低于直接 CreateWindowExW + 自写 ~100 行消息循环。
3. 直接 raw Win32 也与 03/05 的设计一致。

---

## 6. 代码级草图

> 说明：以下为**可实现的接口级草图**（Rust + windows-sys 0.61）。本机无法运行 Rust，签名/常量名需在 Phase 0 用 cargo check 微调，但 API 选择、调用顺序、状态机均为最终形态。§6.8 给出**本机已实测通过**的 C# 等价实现复现方式。

### 6.1 依赖与 feature（最小增量）

```toml
# app/tauri/src-tauri/Cargo.toml
[dependencies]
png = "0.18"   # 已在 Cargo.lock（transitive），改为直接依赖不引入新版本树

[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.61", features = [
  # 现有：Win32_UI_Shell / Win32_Storage_FileSystem / Win32_Security_Cryptography /
  #       Win32_System_Memory / Win32_Foundation / Win32_System_Threading / Win32_UI_WindowsAndMessaging
  "Win32_Graphics_Gdi",   # CreateDIBSection/BLENDFUNCTION/AC_SRC_ALPHA
  "Win32_UI_HiDpi",       # GetDpiForWindow / SetThreadDpiAwarenessContext
] }
```

### 6.2 窗口创建 + WndProc 骨架

```rust
use core::ffi::c_void;
use core::ptr::{null, null_mut};
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, SIZE, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject,
    AC_SRC_ALPHA, AC_SRC_OVER, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BLENDFUNCTION, DIB_RGB_COLORS,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::HiDpi::{GetDpiForWindow, SetThreadDpiAwarenessContext};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassExW,
    ShowWindow, TranslateMessage, UpdateLayeredWindow, MSG, SW_SHOWNOACTIVATE, ULW_ALPHA,
    WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

// "FamlingPetWindow"（UTF-16 + 0）
const CLASS_NAME: &[u16] = &[ 'F' as u16, 'a' as u16, /* ... */ 0 ];
// "Famling · 汀岚"（UTF-16 + 0）；必须与 main.rs 的单实例召回标题常量一致
const TITLE: &[u16] = &[ /* ... */ 0 ];
const PMV2: isize = -4; // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,   // 点击不抢焦点
        WM_LBUTTONDOWN  => { on_lbutton_down(hwnd, lp); 0 }
        WM_MOUSEMOVE    => { on_mouse_move(hwnd); 0 }
        WM_LBUTTONUP    => { on_lbutton_up(hwnd); 0 }
        WM_RBUTTONUP    => { request_open_content(); 0 }
        WM_DPICHANGED   => { on_dpi_changed(hwnd, wp, lp); 0 }
        WM_EXITSIZEMOVE => { save_position(hwnd); 0 }
        WM_TIMER        => { advance_and_present(hwnd); 0 }
        WM_PAINT        => 0,                            // ULW 模式不重绘
        WM_DESTROY      => { PostQuitMessage(0); 0 }
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

pub fn run_native_pet(rx: std::sync::mpsc::Receiver<PetCommand>, app: tauri::AppHandle) {
    unsafe {
        SetThreadDpiAwarenessContext(PMV2 as _); // 本线程物理像素，不受进程默认影响
        let hinst = GetModuleHandleW(null());
        let wc = WNDCLASSEXW {
            cbSize: core::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(wndproc), hInstance: hinst,
            lpszClassName: CLASS_NAME.as_ptr(), ..core::mem::zeroed()
        };
        assert!(RegisterClassExW(&wc) != 0);

        let s = scale_for_dpi(GetDpiForSystem());            // 见 §6.4；初始用系统 DPI（之后由 WM_DPICHANGED 修正）
        let (w, h) = (96 * s, 96 * s);
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            CLASS_NAME.as_ptr(), TITLE.as_ptr(), WS_POPUP,
            0, 0, w as i32, h as i32, null_mut(), null_mut(), hinst, null(),
        );
        // 关键：CreateWindowExW 时不要带 WS_VISIBLE；先建 DIB + 首次 ULW，再 ShowWindow
        let mut surface = Surface::new(w, h);                // §6.3
        surface.compose(frame_for(Clip::Idle, 0), s);
        surface.present(hwnd, 0, 0);
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        SetTimer(hwnd, TIMER_ANIM, 125, None);               // 8 FPS，按 clip 动态调整

        let mut msg: MSG = core::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
            while let Ok(cmd) = rx.try_recv() { apply_command(hwnd, &mut surface, cmd); }
        }
    }
}
```

### 6.3 合成 + 呈现（预乘 / 最近邻 / ULW_ALPHA）

```rust
struct Surface { hdc: HDC, hbm: HBITMAP, old: HGDIOBJ, bits: *mut u8, w: u32, h: u32 }

impl Surface {
    fn new(w: u32, h: u32) -> Self { /* CreateCompatibleDC + CreateDIBSection(top-down, 32bpp, BI_RGB) */ }

    /// 96x96 预乘帧 -> s 倍最近邻写满整块 DIB（不缩放源帧，逐像素复制）
    fn compose(&mut self, frame: &Frame96, s: u32) {
        let (fw, fh) = (96u32, 96u32);
        for y in 0..fh { for x in 0..fw {
            let px = frame.premul_px(x, y);              // [B,G,R,A]，A 已预乘
            if px[3] == 0 { continue; }                  // 透明像素保持全 0
            for dy in 0..s { for dx in 0..s {
                let (px_x, px_y) = (x * s + dx, y * s + dy);
                self.write_px(px_x, px_y, px);
            }}
        }}
    }

    fn present(&mut self, hwnd: HWND, x: i32, y: i32) {
        let dst = POINT { x, y };
        let size = SIZE { cx: self.w as i32, cy: self.h as i32 };
        let src = POINT { x: 0, y: 0 };
        let blend = BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8, BlendFlags: 0,
            SourceConstantAlpha: 255, AlphaFormat: AC_SRC_ALPHA as u8,
        };
        unsafe { UpdateLayeredWindow(hwnd, null_mut(), &dst, &size, self.hdc, &src, 0, &blend, ULW_ALPHA) };
        // 返回值以 BOOL 为准；GetLastError 成功时可能是遗留值（实测 err=1300）
    }
}
```

### 6.4 DPI / 多屏 / 位置

```rust
fn scale_for_dpi(dpi: u32) -> u32 {
    // art display scale = 2（character.json display.scale）；整数设备倍率
    // 100/125/150/175/200% -> 2/2/3/4/4
    let raw = 2.0 * dpi as f64 / 96.0;
    (raw.round_ties_even() as u32).clamp(2, 6)
}

unsafe fn on_dpi_changed(hwnd: HWND, wp: WPARAM, lp: LPARAM) {
    let dpi = ((wp as u32) & 0xFFFF) as u32;              // WM_DPICHANGED: wParam 低/高 16 位都是新 DPI
    let s = scale_for_dpi(dpi);
    let (cw, ch) = (96 * s, 96 * s);
    // lParam 是系统建议的 RECT；按建议 rect 的 left/top 定位，尺寸用整数倍率自己算
    let r = &*(lp as *const RECT);
    SetWindowPos(hwnd, null_mut(), r.left, r.top, cw as i32, ch as i32,
                 SWP_NOZORDER | SWP_NOACTIVATE);
    resize_surface_and_present(hwnd, s);                  // 重建 DIB、重合成、再 ULW
}

unsafe fn on_display_change(hwnd: HWND) {
    // WM_DISPLAYCHANGE / WM_SETTINGCHANGE：把窗口 clamp 回当前 monitor 的 rcWork；存物理像素
    let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    let mut info: MONITORINFO = core::mem::zeroed();
    info.cbSize = core::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(mon, &mut info) != 0 {
        let (mut x, mut y) = current_pos(hwnd);
        x = x.min(info.rcWork.right - 96).max(info.rcWork.left);
        y = y.min(info.rcWork.bottom - 96).max(info.rcWork.top);
        SetWindowPos(hwnd, null_mut(), x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    }
}
```

### 6.5 输入：不抢焦点 / 点击 vs 拖动 / 右键

```rust
unsafe fn on_lbutton_down(hwnd: HWND, _lp: LPARAM) {
    SetCapture(hwnd);
    let (sx, sy) = cursor_pos();
    state.drag_origin = Some(((sx, sy), window_pos(hwnd)));
    state.click_candidate = true;
}
unsafe fn on_mouse_move(hwnd: HWND) {
    let Some(((ox, oy), (wx, wy))) = state.drag_origin else { return };
    let (cx, cy) = cursor_pos();
    if state.click_candidate && ((cx - ox).abs() + (cy - oy).abs()) < 6 { return; } // 6px 阈值，沿用 hero-drag 语义
    state.click_candidate = false;
    // 方式 1（推荐，平滑、系统一致）：进入 OS 移动循环
    if !state.in_move_loop {
        state.in_move_loop = true;
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION as WPARAM, 0);
    }
    // 方式 2（可选，完全自管）：SetWindowPos(hwnd, null_mut(), wx + cx - ox, wy + cy - oy,
    //          0, 0, SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE)
}
unsafe fn on_lbutton_up(hwnd: HWND) {
    ReleaseCapture();
    if state.click_candidate { play(Clip::PatHead); }     // 点击 = 摸头（命中已由 OS 的 alpha 规则保证）
    state.click_candidate = false;
    state.drag_origin = None;
}
// WM_EXITSIZEMOVE -> 保存位置 + 播放 Clip::Land
```

> 注意：拖动用 WM_NCLBUTTONDOWN/HTCAPTION 会在**本线程**进入系统模态移动循环——这正是我们想要的（native-pet 线程独立，不会像现状那样阻塞 Tauri 主线程/事件循环）。WS_EX_NOACTIVATE + WM_MOUSEACTIVATE(MA_NOACTIVATE) 保证点击不抢前台焦点；代价是键盘事件不会进宠物窗口（PTT/快捷键 Phase 2 用 RegisterHotKey 或留在内容窗，见 R6）。

### 6.6 与 Tauri host 的接线（零跨进程）

```rust
// main.rs（Tauri 侧）
let (tx, rx) = std::sync::mpsc::channel::<PetCommand>();
std::thread::Builder::new().name("native-pet".into())
    .spawn(move || native_pet::run_native_pet(rx, app_handle_for_native)).unwrap();

#[tauri::command]
fn set_pet_renderer(app: tauri::AppHandle, mode: String) -> Result<(), String> { /* 持久化 + 标记重启生效 */ }

// native 线程 -> host：AppHandle 是 Send+Sync，可直接 emit；
// host -> native 线程：tx.send(PetCommand::Play("idle_blink")) + PostThreadMessageW(thread_id, WM_APP_WAKE, 0, 0)
// 单实例召回：改用 FindWindowW(CLASS_NAME, null) + PostMessageW(hwnd, WM_APP_RECALL, 0, 0)，
//            或保留标题 FindWindowW(null, "Famling · 汀岚")（二选一，必须改一处）
```

### 6.7 CI headless 验收探针（Rust 版轮廓）

```rust
// tests/native_transparency.rs 或 bin/native_probe.rs（参数 --native-smoke）
// 与 §3.3 的 C# 方法一一对应：
// 1) 新线程 -> CreateDesktopW -> SetThreadDesktop -> RegisterClassExW -> CreateWindowExW(WS_EX_LAYERED)
// 2) 建 DIB：左上 8x8 全 alpha=0，右侧/中心画 alpha=255 的色块；UpdateLayeredWindow；ShowWindow
// 3) WindowFromPoint(透明区中心) 期望 != 本窗口；
//    WindowFromPoint(不透明区中心) 期望 == 本窗口
// 4) ULW 用新 pptDst 平移；旧点期望 != 本窗口，新点期望 == 本窗口
// 5) 断言全通过 exit 0；任一失败 exit 1 + 打印诊断
```

CI 侧（.github/workflows/build-windows.yml 之后追加）：
```yaml
- name: Native pet smoke (headless)
  run: cargo run --manifest-path app/tauri/src-tauri/Cargo.toml --bin native_probe -- --native-smoke
- name: Renderer unit tests (premultiply/hit-region/clip math)
  run: cargo test --manifest-path app/tauri/src-tauri/Cargo.toml --features native-pet
```

> 若 CI 的 windows-latest 因窗口站限制不允许 CreateDesktop，则退化为：(a) 单元测试覆盖 DIB 合成/预乘/命中矩形数学；(b) 真机（或自托管 runner）跑 §3.3 探针。Phase 0 的首要任务就是验证这一条。

### 6.8 本机 C# 验证台复现（[实测]，命令级）

```powershell
$dir = Join-Path $env:TEMP 'famling-proto'; New-Item -ItemType Directory -Force $dir | Out-Null
# 写入 LayeredDesktopProbe.cs（§3.3 所述代码）后：
Set-Location $dir
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:exe /platform:x64 /unsafe /r:System.Drawing.dll /out:LayeredDesktopProbe.exe LayeredDesktopProbe.cs
& '.\LayeredDesktopProbe.exe' 'C:\deepseekharness\project\repos\famling\public\assets\pet\anim\cat\idle\idle_00.png'
```

实测输出（节选，原文见 §3.3/§3.2）：

```text
[desk] CreateDesktop(FamlingProbeDesk)=548 err=0
[desk] SetThreadDesktop=True err=0
[desk] UpdateLayeredWindow=True err=0
[desk] transparent px=(21,21) -> WindowFromPoint=0 class=<null> ours=False
[desk] opaque      px=(33,11) -> WindowFromPoint=2361030 class=FamlingProbeDeskClass ours=True
[move] WindowFromPoint(old opaque point) -> hwnd=0 ours=False
[move] WindowFromPoint(new opaque point) -> hwnd=2361030 ours=True
```

> 本机验证台文件在 %TEMP%\famling-proto\（**不在工作区**），可随时删除；不构成交付物。若需要长期保留，建议后续把等价 Rust 探针作为 CI 测试提交，而不是保留 C#。

## 7. 集成点 / 文件清单

| # | 文件（[仓]） | 现状 | 改动 | 阶段 |
|---|---|---|---|---|
| F1 | app/tauri/src-tauri/Cargo.toml | windows-sys 无 Gdi/HiDpi；无 png | 加 features + png 直接依赖 | P0 |
| F2 | app/tauri/src-tauri/src/main.rs:139-185 | 单实例用标题 FindWindowW 召回 | native 模式下按 class 召回（或保留标题）；recall 走 native 线程 | P1 |
| F3 | app/tauri/src-tauri/src/main.rs:187-218 | Tauri 托盘 + 显示/退出 | 保持；"显示/召回"改为召回 native 窗口 | P1 |
| F4 | app/tauri/src-tauri/src/main.rs:220-232 | recall_pet_window 找 WebviewWindow | native 模式改为 FindWindowW(CLASS)/PostMessage | P1 |
| F5 | app/tauri/src-tauri/src/main.rs:234-247,249-288,600-604,730 | HitRegions 命令 + 60ms 轮询 + invoke 注册 | native 模式下不再创建/启动；web 回退时保留 | P1/P3 |
| F6 | app/tauri/src-tauri/src/main.rs:557-583,585-733 | WebviewWindowBuilder 建 480×336 透明窗；setup | native 模式跳过宠物 WebView2 窗；启动 native 线程；开关解析 | P1 |
| F7 | app/tauri/src-tauri/tauri.conf.json:12-28 | main = 480×336 透明宠物窗 | 改为 content 窗（或移除 main，按需创建 settings/content） | P2/P3 |
| F8 | app/tauri/src-tauri/capabilities/default.json | 含 ignore-cursor / set-webview-bg 等 | native 默认模式下收窄；新增 content 窗 capability | P2/P3 |
| F9 | src/pet/hit-regions.ts 全文（54-91 收集、292-439 同步） | alpha tile + 轮询上报 | native 模式不加载；web 回退保留；P3 删除 | P1/P3 |
| F10 | src/pet/main.ts:2240 | setBackgroundColor([0,0,0,0]) | native 模式不需要（宠物窗不是 WebView2）；web 回退保留 | P1 |
| F11 | src/pet/main.ts / pet.html / pet.css / hero-runtime.ts / desktop-shell.ts | 宠物+UI 全在 480×336 同窗 | 拆分：宠物走 native；气泡/菜单/composer/设置进 content 窗 | P1-P3 |
| F12 | src/pet/desktop-shell.ts、hero-drag.ts、pet-window-dock.ts、edge-dock.ts | JS 拖窗/贴边/位置记忆 | native 侧重写（物理像素 + rcWork）；JS 只服务 content 窗 | P1 |
| F13 | public/assets/pet/anim/<char>/** | 420 帧 PNG（1.10MB） | native 直接读取（embed 或 resources）；不改资产 | P1 |
| F14 | public/characters/<char>/character.json + regions.json | canvas/display.scale/anchor/部位 | native loader 解析；regions.json 提供交互语义 | P1 |
| F15 | src/pet/anim/manifest.ts、clips.ts、timing.json、timing.ts | TS 动画契约 | build.rs/Node 脚本生成 anim-contract.json（05 §4.4）供 Rust，CI --check | P1 |
| F16 | .github/workflows/build-windows.yml:38,46-48 | rust toolchain + tauri build | 加 cargo fmt/clippy/test + native smoke job | P0/P1 |
| F17 | app/tauri/src-tauri/src/content_window.rs（新增） | **缺失**：前端调用 open_content_window，Rust 无实现（content-window.ts:125,128,280；05 §0.7） | 补命令 + 窗口 + capability | P1 |
| F18 | docs/STATUS.md、DECISIONS.md、PLATFORM.md、CHANGELOG.md | 旧 480×336 透明窗描述 | 更新为 native 宠物窗 + content 窗；记录 D-NATIVE-* 决策 | P3 |
| F19 | THIRD-PARTY.md / LICENSES.md | 无 png/windows-sys 直接依赖条目 | 补许可说明（MIT/Apache-2.0） | P1 |
| F20 | scripts/native-pet-probe.ps1（新增） | 无 | 真机验收脚本：窗口 exstyle/尺寸/WindowFromPoint/截图/CPU/RSS/24h soak | P1-P2 |

---

## 8. 风险清单（按优先级）

| ID | 风险 | 可能性/影响 | 证据/来源 | 缓解 |
|---|---|---|---|---|
| R1 | **分层窗口不能承载 WebView2/子控件** → 气泡/菜单/composer/设置必须重排归属，UX 变化 | 高/高 | [官] WPF 博客「只有 top-level 支持 layered」；ULW 不重定向 GDI | Phase 1 只做 sprite+系统右键菜单；气泡用独立 native 层或内容窗；产品在 Phase 0 确认归属 |
| R1b | 用 Tauri WindowBuilder 变体（unstable）引 tao 窗口状态与 ULW 冲突 | 中/中 | [上游] tauri window/mod.rs 的 unstable 注释 | 默认不用；只做 spike；主路径 raw Win32 |
| R2 | 半透明像素仍拦截点击（只有 alpha==0 才穿透） | 中/低 | [官] Layered Windows | 像素画硬 alpha；气泡阴影/半透明 UI 设计时注意；交互语义用 regions.json |
| R3 | DPI 125%/175% 整数倍率导致视觉尺寸变化（D1）或分数光栅 shimmer（D2） | 高/中 | [仓] ADR D-SCALE-5；§5.3 | Phase 0 产品拍板；实现参数化；验收加 125/175% 截图与动画 shimmer 项 |
| R4 | 置顶宠物 vs 内容/设置窗 z-order：pet 可能盖住设置窗 | 高/中 | 现状单窗；新架构两窗 | 打开内容窗时临时 HWND_NOTOPMOST 或隐藏 pet，关闭恢复；写进 02/03 设计 |
| R5 | 顶置 vs 全屏应用/游戏/UAC 安全桌面 | 中/低 | 现状已有全屏检测 is_fullscreen | 复用全屏检测→隐藏/降级；UAC 安全桌面天然不可见（符合预期） |
| R6 | WS_EX_NOACTIVATE → 键盘事件不进宠物窗（PTT/快捷键） | 中/中 | [官] WS_EX_NOACTIVATE | PTT/快捷键用 RegisterHotKey 或留在内容窗；Phase 2 评估临时激活 |
| R7 | 锁屏/解锁、RDP 断连、睡眠唤醒、显示拓扑变化后的重呈现/错位 | 中/中 | [官] WM_DISPLAYCHANGE / WM_DPICHANGED | 处理 WM_DISPLAYCHANGE/WM_SETTINGCHANGE/WM_DPICHANGED；监听会话事件；真机矩阵覆盖 |
| R8 | 本机是 Windows 11 **build 26300（非 GA）**，且 CI runner 是 Server 版/无 GUI；结论不能直接外推 GA | 高/中 | §2 环境 | 真机验收矩阵必须含 Win10 22H2 + Win11 23H2/24H2 GA；本机/CI 只做行为/性能 |
| R9 | Rust 只能 CI 编译（本机无网无工具链）→ 反馈环 8–15 分钟，工期/质量风险 | 高/高 | §2；05 §2.2 | Phase 0 做 CI smoke 把风险前置；本机 C# 台验证 Win32 行为；若允许，在联网机装 rustup+VS Build Tools（本沙箱不可） |
| R10 | 视觉/DWM 合成验收无法在本机完成（锁屏） | 高/高 | §2、§3.3 | 真机解锁/VM/自托管 GUI runner；验收脚本用「彩色 underlay 窗口 + 取色」判定透明区是否透出 |
| R11 | 打包/许可：新增依赖、资产嵌入、portable zip 路径 | 低/低 | [仓] bundle 配置 | png/windows-sys 许可证补录；embed 避免路径问题；安装包增量 ~1.1MB |
| R12 | 长时运行内存/句柄泄漏（DIB/DC/PNG 缓存） | 中/中 | 现状 WebView2 基线约 219MB/7 进程 → 目标 ≤60MB | RAII 包 GDI 对象；24h soak；GDI 对象数探针；帧缓存 LRU |
| R13 | 屏幕共享/录制工具对 layered 窗口的捕获差异（桌面捕获包含；某些窗口捕获/BitBlt 可能黑） | 中/低 | ULW 语义 | 验收包含常见工具（OBS/Teams/会议）；必要时文档说明 |
| R14 | 可访问性（UIA）退化：自绘窗口无子控件/文本语义 | 低/中 | 自绘 | 宠物本身无文本；气泡若 native 自绘，需把文本同时发到内容窗/隐藏 live region；Phase 2 评估 |
| R15 | 杀软/EDR 对自定义无边框置顶窗口的误报 | 低/低 | 无全局钩子/注入 | 不 hook、不注入；签名（后续）；行为与常见 overlay 一致 |
| R16 | 单实例召回依赖标题（现状）与 native 窗口标题漂移 | 中/低 | [仓] main.rs:21-23,169-173 | 保留标题常量或改 class 召回；验收含二次启动召回 |
| R17 | WM_TIMER 精度/节能：低帧率定时器合并导致节奏抖动 | 低/低 | [官] SetTimer | 8–12 FPS 下 ±15ms 可接受；需要时 CreateWaitableTimerEx(HIGH_RESOLUTION)（Win10 1803+） |
| R18 | 用户自定义缩放（0.5–2×）+ DPI 叠加时的整数化取舍 | 中/中 | [仓] src/pet/scaling.ts | 最终倍率 = 量化后的整数设备倍率；Phase 1 固定 2×，Phase 2 接设置 |

---

## 9. 验收指标（可测，按证据等级）

| # | 指标 | 方法/工具 | 通过标准 | 阶段 |
|---|---|---|---|---|
| A1 | 帧数据「无背景」正确性 | 单元测试：PNG alpha=0 ⇒ DIB alpha=0 且 RGB=0；alpha>0 ⇒ BGR≤A（预乘不变式）；420 帧全跑 | 100% 帧通过 | P0 |
| A2 | 逐像素穿透（headless） | §3.3 探针（C#→Rust）：每角色 5 帧 × 透明/不透明各 20 点 | 透明点命中本窗 = 0；不透明点命中 = 100% | P0/P1 |
| A3 | 移动/缩放后命中正确 | ULW 平移/改尺寸后复测 A2；DPICHANGED 模拟（改 s 重建） | 旧位置 0 命中；新位置 100% | P1 |
| A4 | 无黑框/黑条（DWM 合成层） | 真机：宠物后方放纯色 underlay 窗口；对每帧透明缝（重点：猫尾/臀缝隙）取色 | 0 个黑色/异常背景像素；underlay 颜色可见 | P1/P2 |
| A5 | 无撕裂/残影 | 真机 60fps 录屏，100 次拖动 + 50 次 clip 切换 + 24h 抽帧 | 无整窗黑帧、无旧位置残影、无撕裂；抽帧人工+像素 diff | P1/P2 |
| A6 | 性能 | 本机/CI 微基准 + 真机 PerformanceCounter | ULW 全帧 p95 ≤0.5ms（最大 960×672）；idle CPU ≤0.3% 单核（8FPS）；动画 CPU ≤1%；首帧 ≤150ms | P0/P1 |
| A7 | 内存/句柄 | 24h soak 采样 private/RSS/GDI objects | private ≤60MB（目标 ≤24MiB），RSS 漂移 ≤5MB/24h；GDI 对象稳定 | P2 |
| A8 | DPI 矩阵 | 真机 100/125/150/175/200% + 混合 DPI 双屏；截图测像素块 | 每个 art 像素为 s×s 整数块（D1）；窗口尺寸 = 96×s；无 bitmap 拉伸模糊 | P2 |
| A9 | 多屏/贴边/位置记忆 | 20 次跨屏拖动（含负坐标）、拔插显示器、分辨率变化 | 100% 可点、贴边正确、重启位置恢复、离屏 clamp 生效 | P2 |
| A10 | 生命周期 | 锁屏/解锁、RDP 断连重连、睡眠唤醒、Explorer 重启、24h 连续运行 | 无黑窗/无消失/无 z-order 丢失；恢复后重呈现成功 | P2 |
| A11 | 真实点击穿透 | 真机：桌面图标/记事本/浏览器窗口在宠物透明区点击 20 次 | 20/20 点击落到目标；不透明区点击宠物 20/20 | P1 |
| A12 | 托盘/单实例/回退 | 二次启动召回、托盘显示/退出、--pet-renderer=web 回滚、native 初始化失败注入 | 100%；回滚后行为与 0.2.3 一致；失败不阻塞启动 | P1 |
| A13 | 兼容矩阵 | Win10 22H2 / Win11 23H2 / 24H2 GA；NVIDIA/Intel/AMD/VM；WebView2 153.x（仅 content 窗） | 全部通过 A4/A5/A8/A10 | P2/P3 |
| A14 | 许可/供应链 | THIRD-PARTY/LICENSES 更新；现有 CI 校验 | 无未声明依赖；CI 绿 | P1 |

---

## 10. 分阶段实施（栈视角；详细排期以 05 为准）

| 阶段 | 目标 | 关键任务 | 退出标准 | 估算 |
|---|---|---|---|---|
| **P0 Spike（前置风险）** | 证明「Rust ULW 栈 + CI headless 命中」可行 | ① 本机 C# 台补做 125/150% 模拟与长跑（可选）；② CI 加 cargo fmt/clippy/test + native_probe --native-smoke（§6.7）复验私有桌面；③ 确认 Tauri 进程内线程 + 窗口创建不干扰 tao；④ 产品拍板 DPI（D1/D2）与窗口尺寸方向 | CI smoke 绿；C# 台数据与本文一致；产品对 D1 有结论 | 2–3 人日 |
| **P1 MVP（可 opt-in）** | native 宠物窗跑通核心体验 | native_pet 模块（window/render/assets/anim/input/config）；idle/idle_blink/pat_head/drag/land 5 个 clip；托盘召回/单实例/位置持久化；--pet-renderer 开关 + 失败回退；右键打开内容窗；A1/A2/A3/A6/A11/A12 通过 | 内测用户可 opt-in 连续使用 1 周无黑框/黑条 | 8–12 人日 |
| **P2 对等/双跑** | 行为/UI 对等、可默认 | 气泡/菜单归属（native 或内容窗）；更多 clip/behavior；多屏/DPI/soak 全矩阵；A4/A5/A7/A8/A9/A10/A13；性能基准固化 | 全部验收指标绿；24h soak 通过 | 10–15 人日 |
| **P3 切换/退役** | 默认 native、删除旧链路 | 默认渲染器切 native；删除 480×336 WebView2 宠物窗/hit-regions/ignore-cursor 权限；文档/CHANGELOG；回滚演练 | 发布候选通过；--pet-renderer=web 仍可用一个版本 | 5–8 人日 |

**建议写入 DECISIONS（供 lead 采纳）：**

- **D-NATIVE-1（ACCEPTED）**：宠物窗口渲染栈 = raw Win32 WS_EX_LAYERED + UpdateLayeredWindow(ULW_ALPHA) + 预乘 BGRA DIB；**不使用** winit/softbuffer/wgpu/DirectComposition/WebView2 透明链。
- **D-NATIVE-2（ACCEPTED）**：宠物窗口内不承载 WebView2/HTML UI；设置/内容/输入法/可访问性文本一律进 Tauri 内容窗。
- **D-NATIVE-3（PENDING 产品）**：DPI 设备倍率采用 D1（整数）还是 D2（分数）；默认实现 D1。
- **D-NATIVE-4（ACCEPTED）**：native 线程禁止调用 Tauri 同步窗口 getter；几何全部 Win32 原生计算。
- **D-NATIVE-5（PENDING）**：宠物窗口尺寸 sprite-tight vs 480×336；默认 sprite-tight。

---

## 11. 待决问题（需要 lead/产品）

1. **DPI 策略 D1 vs D2**（§5.3）：影响 125%/175% 的外观与验收标准，需要产品签字。
2. **窗口尺寸与 UI 归属**（§5.4）：宠物窗口是否 sprite-tight？气泡/右键菜单/composer/结果卡进内容窗是否可接受？这决定 P1 的范围。
3. **置顶与内容窗 z-order 策略**（R4）：打开设置/内容时 pet 隐藏/降级/同置顶？
4. **本机 Rust 工具链**：沙箱内无网，无法安装；是否允许在另一台联网机安装 rustup + VS Build Tools（约 2–3GB）以缩短反馈环？否则按 CI-only 排期（+25–40%）。
5. **真机视觉验收负责人**：谁能提供解锁的 Windows 10/11 GA 真机或自托管 GUI runner 跑 A4/A5/A8/A10？
6. **回退策略**：P1/P2 默认 web、P3 才切 native 是否接受？还是 P2 就给 tester 默认 native？

---

## 12. 附录

### 12.1 本机探针输出（原文节选）

```text
=== Famling layered-window per-pixel hit-test probe (private desktop) ===
[probe] source transparent px=(21,21) opaque px=(33,11)
[desk] CreateDesktop(FamlingProbeDesk)=548 err=0
[desk] SetThreadDesktop=True err=0
[desk] RegisterClassEx atom=49954 err=0
[desk] CreateWindowEx hwnd=2361030 err=0
[desk] UpdateLayeredWindow=True err=0
[desk] IsWindowVisible=True
[desk] transparent px=(21,21) -> WindowFromPoint=0 class=<null> ours=False
[desk] opaque      px=(33,11) -> WindowFromPoint=2361030 class=FamlingProbeDeskClass ours=True
[desk] forced-transparent corner -> WindowFromPoint=0 class=<null> ours=False
[move] UpdateLayeredWindow moved=True newRect=420,320
[move] WindowFromPoint(old opaque point) -> hwnd=0 class=<null> ours=False
[move] WindowFromPoint(new opaque point) -> hwnd=2361030 class=FamlingProbeDeskClass ours=True

=== Famling native layered-window probe (normal desktop, locked) ===
[check] GWL_EXSTYLE=0x8080088 layered=True topmost=True toolwindow=True transparent=False
[check] DwmIsCompositionEnabled hr=0x0 enabled=True
[check] GetDpiForWindow=96
[probe] transparent px=(21,21) opaque px=(76,4)
[probe] WindowFromPoint(transparent px) => hwnd=2229974 ours=False
[probe] hit classes: transparent=LockScreenBackstopFrame opaque=LockScreenBackstopFrame  <-- 锁屏遮挡，故改用私有桌面
[capture] screen pixel at transparent strip=(0,0,0,a=255)                          <-- 锁屏下截图不可用
[capture] non-black sample count=0

=== Layered window update benchmark (C#/.NET Framework 4.8) ===
[192x192] ulw_only=0.037 ms/frame;  full_fill+ulw=0.028 ms/frame; bytesPerFrame=147456
[288x288] ulw_only=0.039 ms/frame;  full_fill+ulw=0.048 ms/frame; bytesPerFrame=331776
[480x336] ulw_only=0.044 ms/frame;  full_fill+ulw=0.083 ms/frame; bytesPerFrame=645120
[720x504] ulw_only=0.057 ms/frame;  full_fill+ulw=0.170 ms/frame; bytesPerFrame=1451520
[960x672] ulw_only=0.076 ms/frame;  full_fill+ulw=0.290 ms/frame; bytesPerFrame=2580480
```

### 12.2 参考链接

**Microsoft / Win32 官方**

- Layered Windows（命中测试基于形状/透明度；alpha=0 穿透；WS_EX_TRANSPARENT 的特例；创建后需 ULW 才可见）：https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features
- UpdateLayeredWindow（整窗更新/seamless animation/小窗性能）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow
- UPDATELAYEREDWINDOWINFO（prcDirty 局部更新，Vista+）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-updatelayeredwindowinfo
- SetLayeredWindowAttributes（LWA_COLORKEY/LWA_ALPHA；与 ULW 互斥）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes
- BLENDFUNCTION（AC_SRC_ALPHA + 预乘 alpha 要求）：https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-blendfunction
- Transparent Windows in WPF（layered 两种模式；system-redirected 无逐像素；ULW 应用自供内容无 WM_PAINT；仅 top-level）：https://learn.microsoft.com/en-us/archive/blogs/dwayneneed/transparent-windows-in-wpf
- WM_DPICHANGED（wParam DPI / lParam 建议 RECT / SetWindowPos）：https://learn.microsoft.com/en-us/windows/win32/hidpi/wm-dpichanged
- High DPI Desktop Application Development（PMv2 推荐；物理像素；无位图拉伸）：https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows
- GetDpiForWindow：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getdpiforwindow
- SetThreadDpiAwarenessContext：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setthreaddpiawarenesscontext
- Extended Window Styles（WS_EX_LAYERED/TOPMOST/TOOLWINDOW/NOACTIVATE/TRANSPARENT）：https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles
- DirectComposition 概述：https://learn.microsoft.com/en-us/windows/win32/directcomp/directcomposition-portal
- CreateSwapChainForComposition：https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgifactory2-createswapchainforcomposition
- IDCompositionDevice::CreateSurface（premultiplied alpha）：https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondevice-createsurface
- Form.TransparencyKey（WinForms 颜色键，不是逐像素）：https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.form.transparencykey
- .NET Framework 4.8 system requirements（Win10 1903+/Win11 内置 4.8/4.8.1）：https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements

**Rust / 框架源码与 issue**

- winit 透明实现 = DwmEnableBlurBehindWindow（v0.30.9 src/platform_impl/windows/window.rs#L1236-L1249）：https://github.com/rust-windowing/winit/blob/v0.30.9/src/platform_impl/windows/window.rs#L1236-L1249
- winit EventLoop 必须主线程/每应用一次（v0.30.13 event_loop.rs#L80-L94）：https://github.com/rust-windowing/winit/blob/v0.30.13/src/event_loop.rs#L80-L94
- wgpu-hal DXGI：WndHandle => opaque_only，composite_alpha_modes=[Opaque]（dxgi/swapchain.rs#L185-L203）：https://github.com/gfx-rs/wgpu/blob/trunk/wgpu-hal/src/auxil/dxgi/swapchain.rs#L185-L203
- wgpu 公开 SurfaceTarget 仅 Window/DisplayAndWindow（30.0.2）：https://docs.rs/wgpu/latest/wgpu/enum.SurfaceTarget.html
- softbuffer AlphaMode：Windows 不支持 Premultiplied/Postmultiplied（src/lib.rs#L746-L771）：https://github.com/rust-windowing/softbuffer/blob/master/src/lib.rs#L746-L771
- Tauri WindowBuilder（无 webview）需 unstable feature + Window::hwnd()：https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/window/mod.rs
- Tauri #16341（Win11 长时透明窗变黑，open）：https://github.com/tauri-apps/tauri/issues/16341
- Tauri #14764（透明窗拖动/焦点 ghost 标题栏，closed）：https://github.com/tauri-apps/tauri/issues/14764
- Tauri #14823（Win10 透明/无阴影黑边，closed）：https://github.com/tauri-apps/tauri/issues/14823
- Tauri #13070（逐像素点击穿透请求，closed 未实现）：https://github.com/tauri-apps/tauri/issues/13070
- Tauri #6164（setIgnoreCursorEvents forward 选项，open）：https://github.com/tauri-apps/tauri/issues/6164

**同类实现/参照（外部数据，仅作交叉证据）**

- Rust + ULW 生产实现（keyhop overlay：WS_EX_LAYERED/TOPMOST/TOOLWINDOW + ULW_ALPHA + 预乘 DIB + 多屏 virtual-screen 坐标）：https://docs.rs/keyhop/latest/src/keyhop/windows/overlay.rs.html
- Qt：WS_EX_LAYERED+WS_EX_TRANSPARENT 同时创建时 UpdateLayeredWindowIndirect 失败的修复记录（不要同时设置）：https://gitlab.com/altaway/qtbase/-/commit/640b03fe5d824e3d438a051386432c0dd7b97be5
- Wine 补丁：UpdateLayeredWindow 路径同步逐像素 alpha shape 到 server region（命中测试语义的旁证）：https://list.winehq.org/hyperkitty/list/wine-gitlab@list.winehq.org/thread/RLAXP3HSCJHEULW7GVYYWOXA66Q4A2NN/

**本仓（[仓]）**

- 架构 A 决策与故障记录：PET-WINDOW-ARCHITECTURE-REVIEW.md、FIX-2026-11-25.md、FIX-2026-11-25-BUTT.md
- 点击穿透/遮挡前作（本报告修正其适用边界）：repos/famling/docs/research/PET-OCCLUSION-TECH-2026-11-18.md
- DPI 契约：repos/famling/docs/plan/ADR-SCALE-DPI-2026-11-20.md（D-SCALE-5）
- 窗口/命中/托盘实现：repos/famling/app/tauri/src-tauri/src/main.rs:139-288,557-733；repos/famling/app/tauri/src-tauri/tauri.conf.json:12-28
- 前端命中同步：repos/famling/src/pet/hit-regions.ts；repos/famling/src/pet/main.ts:2240
- 资产/契约：repos/famling/public/assets/pet/anim/**（420 帧 PNG）、public/characters/**、src/pet/anim/manifest.ts
- CI：repos/famling/.github/workflows/build-windows.yml:38,46-48
- 并行研究：work/native/research/03-renderer-design.md、05-migration-plan.md

### 12.3 证据分级说明

| 标记 | 含义 | 本报告用法 |
|---|---|---|
| [实测] | 本机本次真实执行（Win32 行为/性能/命中；不含 DWM 视觉） | §2/§3/§0.4/§12.1 |
| [官] | Microsoft 官方文档 | 分层/ULW/DPI/WinForms 等语义 |
| [上游] | Rust 生态官方源码/issue | 否决 winit/softbuffer/wgpu 的依据 |
| [同类] | 第三方实现/修复记录 | 旁证，不作为唯一依据 |
| [仓] | 本仓源码/文档 | 集成点与现状 |
| [推断] | 由证据推导、待真机确认 | 标在具体条目上 |

---

*本文件为 task-14 唯一交付物；研究期内未修改 repos/ 任何文件。C# 验证台文件位于系统临时目录（%TEMP%\famling-proto\），不在工作区、不随仓库发布。*





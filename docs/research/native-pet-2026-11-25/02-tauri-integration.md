# 02 — Tauri 与原生宠物窗口的集成架构（架构 A）

| 项 | 内容 |
|---|---|
| 任务 | task-15「Tauri 与原生宠物窗口集成架构」（研究子代理 tauri-integration） |
| 日期 | 2026-11-25（Asia/Shanghai） |
| 状态 | **设计稿（DESIGN ONLY）**：未改业务代码、未 commit/push、未使用凭据、未读发布令牌；本文件是本次唯一写入。 |
| 输入基线 | `repos/famling` 工作树（0.2.3 内容，未提交）；根目录 `PET-WINDOW-ARCHITECTURE-REVIEW.md`、`FIX-2026-11-25*.md`、`RELEASE-2026-11-25.md`；本机实测。并行研究 01/03/04/05 为参照，本文件可独立评审。 |
| 决策前提 | 架构 A 已批准：保留 Tauri/WebView2 做设置/内容，宠物窗口渲染改为原生逐像素 alpha 窗口。 |
| 边界 | 只做**集成**设计：进程/窗口共存、IPC、设置 WebView、生命周期/托盘/单实例、打包/签名、开关/回滚。渲染器内部（帧缓存/调度/命中几何）见 task-16，平台验收见 task-17，迁移排期见 05。 |

证据标记：**〔仓〕**=本仓源码/配置可复核（路径相对 `repos/famling`）；**〔实测〕**=本次在本机 Windows 跑出的结果；**〔公开〕**=官方文档/上游 issue/PR；**〔推断〕**=由证据推导、需实机确认。本机实测记录见 §1.3。

---

## 0. 执行摘要（TL;DR）

1. **推荐拓扑：单进程 + 一条 native-pet 线程的 raw Win32 逐像素 alpha 分层窗口**（选项 a2）。Tauri 主线程继续拥有事件循环、托盘、单实例、崩溃钩子、命令路由与 WebView2 内容/设置窗口；宠物窗口**不再由 WebView2 渲染**，目标架构里**不再为宠物创建任何 WebView2 窗口**。理由：零跨进程 IPC、复用现有宿主能力（托盘/单实例/DPAPI/存档/崩溃导出）、一个 exe、无 GPU/驱动依赖；逐像素 alpha 的命中穿透由 OS 完成，可删除现有 JS→Rust 250 ms 区域上报 + Rust 60 ms 光标轮询两段链路（`src-tauri/src/main.rs:250–285`〔仓〕）。
2. **选项结论**：
   - (a1) 用 Tauri/tao 的 `tauri::window::WindowBuilder` 建窗再自绘：**不推荐**。该 builder 在 docs.rs 标注 **unstable feature**〔公开〕，且窗口状态/WndProc/DPI 被 tao 接管；我们既不要 WebView 也不要用 tao 的透明度路径（其透明实现正是 `DwmEnableBlurBehindWindow`，见 tauri#16341 调查〔公开〕），收益小于耦合风险。仅当原生窗口与 Tauri 生命周期冲突难以解决时作为备选。
   - (a2) 同进程、独立线程的 raw Win32 窗口：**采用**。Tauri 不需要知道这个 HWND（只把它当作可召回/可退出/可发事件的原生资源）。
   - (b) 独立 helper 进程（Rust 或 C#）：**不作为交付路径**。技术上可行（本机 C# 已实测 Win32 路径，见 §1.3），但需两套生命周期/托盘/单实例/存档、命名管道或本地 HTTP 等 IPC、两个 exe 的打包/签名/升级/杀软面；估计 +5–8 人日集成与持续维护成本〔推断〕。保留为**工期兜底**与本地行为实验台。
   - (c) 原生 child 窗口替换/嵌入 Tauri 窗口：**技术否决**。顶层窗口才是逐像素 alpha 与命中穿透的受支持主路径；child 仍受父窗口裁剪，且父窗口（WebView2 透明窗）仍需 DWM 透明合成，透明链问题不消失，等于把根因留在原地（MS 文档：`WS_EX_LAYERED` 自 Win8 起也支持 child，但这不改变父窗口合成/裁剪；<https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features>）。
3. **隐藏 WebView「逻辑控制器」方案（L1）明确不纳入目标架构**：它可最快复用现有 2502 行 `main.ts`（状态/存档/语音/同意/行为），但会把 WebView2 进程与隐藏窗口留在宠物链路上，引入后台节流/遮挡回收/窗口生命周期风险（WebView2 隐藏窗口被优化回收会触发 Tauri 的 ExitRequested，见 §2.1〔公开〕），且与「宠物链路只有一层 alpha」的不变量冲突。若工期紧张，只允许作为 **0.3.0-beta 的临时 parity 桥**，并设定删除 gate（§5.3、§10-Q1）。
4. **集成前置（P0，必须先做，否则原生模式不可用）**：① 公开仓 Rust 宿主与前端命令契约漂移——前端调用 `open_content_window`、`quit_app`、`reset_pet_window`、`record_host_consent`、`revoke_host_consent`、`grant_host_voice_consent`、`host_consent_status`、`market_fetch` 等命令，公开仓 `main.rs` **未实现**（grep 0 命中；`content-window.ts:125,128,280`〔仓〕），而 `docs/audit/RESOLUTION-TAURI-ACL-2026-11-19.md:107–128`〔仓〕记录了私有宿主 23 命令 + 分窗口 capability + build.rs 漂移门禁的设计；② capability 只有 `windows:["main"]`，content 窗口会被 ACL 拒绝；③ native-only 启动需要**宿主侧同意标记**（否则无 WebView 可读 localStorage）；④ 干净基线（当前工作树 157 改 + 12 未跟踪、0 tag，见 05 报告 §1.2）。
5. **设置/内容 WebView 保持不变**：继续用普通**不透明** Tauri 窗口（`label="content"`、`pet.html` 路由），补齐 `open_content_window` 命令与 `window.__CONTENT_WINDOW_ROUTE__` 注入，复用 `content-window://navigate` 事件与现有 content/settings 面板；`capabilities/content.json` 按需授权。原生模式下右键/托盘打开该窗口，是用户接触设置、同意、AI 声明、内容中心的唯一入口。
6. **IPC 结论**：同进程推荐 **Tauri 命令（JS→Rust）/ Tauri 事件（Rust→JS）+ `std::sync::mpsc`（Tauri 主线程↔native 线程）**，无需管道/HTTP。若走 helper 进程，**命名管道（message mode）> 本地环回 HTTP > WebSocket > stdin/stdout**（对比与安全细节见 §3.2）；本地 HTTP/WS 有端口/防火墙/浏览器 CSRF 面，stdio 只有单向流且无请求响应语义。
7. **生命周期/托盘/单实例/打包**：托盘/单实例/崩溃钩子继续留在 Tauri 主线程；召回从「按标题 FindWindowW」升级为「注册窗口消息广播 + FindWindowW 兜底」；无 WebView 窗口时 Tauri 默认会在窗口全关后退出，必须 `RunEvent::ExitRequested` + `api.prevent_exit()` 保活（〔公开〕tauri#13511）；打包仍是单 exe + 现有 NSIS/portable 流程，帧经 build.rs `include_bytes!` 嵌入（三角色 420 帧 ≈1.10 MB），无需第二个二进制；签名状态不变（仍无 Authenticode、无 updater）。
8. **开关/回滚**：`--pet-renderer=native/web/dual` > 环境变量 `FAMLING_PET_RENDERER` > `%APPDATA%\com.perrylink.famling\native-pet.json` > 编译期默认。**0.3.0-beta 默认 web**、tester opt-in；native 任何初始化失败 → 写本地日志 + 当次降级 web（不弹窗、不阻塞）；0.4.0 达标后默认 native，web 保留一个发布周期。回滚不触碰宠物存档格式（位置/渲染器选择单独存放）。
9. **本机可行性〔实测〕**：本机无 cargo/rustc/MSVC/dotnet SDK，但 .NET Framework 的 `csc.exe 14.8.10001.0` 可用（仅 C# 5）；同一 Win32 API 路径（`CreateWindowExW(WS_EX_LAYERED + TOPMOST + TOOLWINDOW + NOACTIVATE)` + `UpdateLayeredWindow(ULW_ALPHA)` + 预乘 BGRA DIB）在本机成功：480×336 下 60 帧共 9.53 ms（**0.159 ms/帧**），645,120 B DIB 拷贝 0.008 ms，cat idle 帧 alpha 为 **0/255 二值（4824 opaque / 4392 zero / 0 semi）**，GDI+ 中文气泡一次性绘制 5.88 ms。结论：API 路径与逐像素命中语义在本机/目标 Windows 上成立，**唯一缺口是 Rust 工具链**（Rust 走 CI：现有 `build-windows.yml:38–48` 已装 stable + MSVC 并成功构建 Tauri〔仓〕）。
10. **本机限制（必须写进验收计划）**：当前会话桌面被锁屏遮挡——`WindowFromPoint` 对普通不透明窗口也返回 `LockScreenBackstopFrame`，`CopyFromScreen` 报「句柄无效」，因此**点击穿透/视觉/DPI 切换无法在本机锁屏状态验收**；需解锁的交互式会话、真实 DPI/多屏矩阵与录屏（与 `PET-WINDOW-ARCHITECTURE-REVIEW.md:49–51` 的限制一致）。

---

## 1. 现状与约束（证据）

### 1.1 当前宿主/窗口/能力面（〔仓〕）

| 项 | 现状 | 证据 |
|---|---|---|
| 进程/框架 | 单进程 Tauri 2（`tauri = "2"`、`windows-sys 0.61`），Windows-only 发布 | `app/tauri/src-tauri/Cargo.toml:12–24` |
| 宠物窗口 | tauri.conf 唯一的 `main` 窗：480×336、`pet.html`、resizable:false、decorations:false、transparent:true、shadow:false、alwaysOnTop:true、focus:false、skipTaskbar:true | `tauri.conf.json:12–28` |
| 运行时路由 | `--game=`/`--page=`、`--size`、`--pet-size`、`--hidden`、`--bench`、`--demo` 都在 `setup()` 里建窗；宠物路由显式设 transparent/skipTaskbar/always_on_top，并 `place_bottom_right` | `src-tauri/src/main.rs:516–711` |
| 点击穿透 | 前端 `hit-regions.ts` 上报可见交互矩形/alpha 瓦片（含菜单/弹窗），Rust 每 60 ms 轮询光标并 `set_ignore_cursor_events` | `src/pet/hit-regions.ts:1–31,205–210,340–350`；`src-tauri/src/main.rs:234–288` |
| 托盘 | Tauri `tray-icon`，菜单「显示/召回」「退出」，fail-soft | `Cargo.toml:13`；`main.rs:187–218` |
| 单实例 | 命名互斥 `Local\Famling.SingleInstance.v1`；第二实例 `FindWindowW("Famling · 汀岚")` → ShowWindow/SetForegroundWindow → exit 0 | `main.rs:22–27,139–185` |
| 崩溃导出 | panic hook → `%APPDATA%\Famling\crashes\crash-<epoch>.json`，路径脱敏、无 env/参数 | `main.rs:34–137` |
| 命令面 | `generate_handler!` 15 条：secret×3、voice×4、fetch_deepseek_share、read_advisers_brief、save×3、is_fullscreen、report_bench、steam_status、set_pet_hit_regions | `main.rs:714–731` |
| capability | 只有 `default.json`，`windows:["main"]`，17 个 core window/webview 权限（含 allow-start-dragging、allow-set-ignore-cursor-events） | `capabilities/default.json:5–26`；`tauri.conf.json` 未显式列 capabilities |
| 前端入口 | 发布构建只产出 pet/setup/chat-import 三页；`pet.html` 静态写 `data-pet-shell="desktop"` 以避免首帧暗闪 | `vite.config.ts:273–292`；`pet.html:3–15` |
| 双窗口契约 | pet.html 同时承担「宠物窗」与「内容/设置窗」：Tauri 注入 `window.__CONTENT_WINDOW_ROUTE__`（content/settings），页面只 boot 内容运行时；打开命令 `open_content_window` | `src/pet/content-window.ts:20–31,75–145,279–280`；`src/pet/main.ts:227–251`；`src/pet/content-runtime.ts:1183–1219` |
| 跨窗通信 | Tauri 事件总线（`pet://reload-requested`、`pet://character-pack-apply`、`pet://builtin-renderer-apply`、`content-window://navigate`、`pet://exit-requested`）+ 同源 localStorage；`requestPetWindowReload` 由 content 窗 emit | `content-runtime.ts:680–687,1157–1181,1207–1216`；`main.ts:2430–2469` |
| 存档/加密 | Rust DPAPI（`protect_text/unprotect_text/clear_save_backup`）+ 原子写 `write_save`/`read_save`/`delete_save`（tmp+rename、.bak） | `src-tauri/src/secret.rs`；`main.rs:370–472` |
| DPI/缩放契约 | 480×336 CSS 窗口；四层缩放（整体/UI+文本/图像/组件）；像素艺术只用整数/整数倒数；运行中改 DPI 需重启（当前只启动读一次 DPR） | `docs/plan/ADR-SCALE-DPI-2026-11-20.md:11–19,53–76,114–130`〔仓〕 |
| 窗口位置/贴边 | localStorage `desktop-games/pet/window`；拖拽后 2–3 帧整数物理像素贴边；可达性下限 96×72 与 Rust `desktop_guard.rs` 对齐（私有宿主） | `src/pet/pet-window-dock.ts:1–36`；`src/pet/edge-dock.ts:1–56` |
| 退出链路 | 菜单/托盘保存后退出：web 走 `quit_app`（**公开仓缺失**）→ fallback `getCurrentWebviewWindow().setBackgroundColor([0,0,0,0])` + `getCurrentWindow().close()` | `src/pet/main.ts:2218–2254` |

### 1.2 为什么必须换「宠物窗口的渲染层」（〔仓〕+〔公开〕）

- **四层透明叠加**：Tauri 窗口透明（WS_EX_LAYERED）→ WebView2 默认背景 → DOM/CSS 背景 → 像素图 alpha；任何一层失效即「黑框/黑竖条/动画断裂」。0.2.2 修主题 CSS 黑底、0.2.3 再补 WebView2 `setBackgroundColor([0,0,0,0])`，属于逐层打补丁（`PET-WINDOW-ARCHITECTURE-REVIEW.md:5–23`；`FIX-2026-11-25.md:5–9`；`docs/art/FINAL-ART-QA-2026-11-25.md:26–44`；0.2.3 补丁代码位置 `src/pet/main.ts:2233–2241`）。
- **「猫臀黑条」不是美术**：猫 PNG 那里是合法 alpha=0 透明缝隙，透出的是窗口/WebView2 黑底（`FIX-2026-11-25-BUTT.md:10–18,29–31`）；狗的黑竖线才是 source art 接缝（已修）。
- **上游同类缺陷**：
  - tauri#16341（open，Win11 build 26200）：长时运行的**透明桌宠窗口**长出黑色不透明矩形，角色仍在；报告者应用用 `SetWindowRgn` + 自定义非客户区处理，并记录：tao 用 `DwmEnableBlurBehindWindow` + 空 region 实现透明，wry 另配 WebView2 背景 alpha，两者是不同层；故障注入 `DwmEnableBlurBehindWindow(FALSE)` 可复现，重放创建期参数 + `SetWindowPos(SWP_FRAMECHANGED)` + `InvalidateRect` 可恢复：<https://github.com/tauri-apps/tauri/issues/16341>。
  - tauri#15947（open）：Win10 透明置顶桌宠窗 + **频繁 `set_ignore_cursor_events` 光标守卫** → 透明区域/壁纸间歇变黑；其分析指出 `set_ignore_cursor_events` 切换 `WS_EX_TRANSPARENT|WS_EX_LAYERED` 迫使 DWM 重建 composition tree：<https://github.com/tauri-apps/tauri/issues/15947>。**本应用恰好是「透明+置顶+每 60 ms 轮询切换 ignore_cursor_events」的组合**（`main.rs:250–285`），属于该风险类的典型触发条件。
  - tauri#14764（ghost titlebar，closed as upstream WebView2）、#14823（Win10 透明无阴影黑边）：<https://github.com/tauri-apps/tauri/issues/14764>、<https://github.com/tauri-apps/tauri/issues/14823>。
  - 相关改进：`no_redirection_bitmap` 已合入 Tauri（PR #15410，2026-07-03，<https://github.com/tauri-apps/tauri/pull/15410>），但它只改善「透明窗首帧白/黑底」，不解决 run-time 黑矩形；wry 的「隐藏窗口遮挡检测 opt-out」PR #1742 **未合入**（<https://github.com/tauri-apps/wry/pull/1742>），所以隐藏 WebView 方案的节流/遮挡仍要自己用 WebView2 的 `AdditionalBrowserArguments` 绕。
- **结论**：修复不是「更快的画法」，而是**去掉宠物链路上的 WebView2 透明合成层**，只保留一层逐像素 alpha；同时 OS 会对 alpha=0 像素做原生穿透，可删除 JS/Rust 两段轮询（§1.4 给出文档依据）。
- **本机环境与缺陷报告高度接近**〔实测〕：Windows 11 build **26300.0**（#16341 报告为 26200）、WebView2 **153.0.4234.48**、AMD Radeon 1920×1080 + NVIDIA RTX 5090 D v2（含 OrayIdd 虚拟显示驱动）。本机既是验收目标，也具备复现上游合成类问题的条件（锁屏解锁后）。

### 1.3 工具链与「Rust via CI / C# 原型」可行性（〔实测〕，2026-11-25）

| 项 | 结果 |
|---|---|
| cargo / rustc / MSVC(cl/link) / MSBuild / dotnet SDK | **均无** |
| C# 编译器 | `C:\WINDOWS\Microsoft.NET\Framework64\v4.0.30319\csc.exe`，FileVersion **14.8.10001.0**（`/langversion:?` 输出「for C# 5」） |
| .NET Framework | **4.8.10008**（注册表 Release 534296） |
| WebView2 Runtime | **153.0.4234.48** |
| OS / 显示 | Windows 11 专业版 build **26300.0**；1920×1080（AMD Radeon），另有 NVIDIA GeForce RTX 5090 D v2 + OrayIddDriver；WMI 报告 1 台物理显示器 |
| Node / Python / git | 有（DSH 工具链 Node、`C:\AI\Python313`、PortableGit） |

C# 原型实测（临时目录，P/Invoke，不是交付代码）：

| 测点 | 结果 |
|---|---|
| 窗口创建 | `CreateWindowExW(WS_EX_LAYERED + TOPMOST + TOOLWINDOW + NOACTIVATE)` 成功，exstyle=`0x08080088`，`IsWindowVisible=true` |
| 逐像素 alpha 呈现 | `UpdateLayeredWindow`（`ULW_ALPHA`，预乘 BGRA DIB，480×336）返回 TRUE；60 帧含合成+上传共 **9.53 ms → 0.159 ms/帧**（≈6300 帧/秒余量） |
| DIB 拷贝 | 645,120 B/frame，`Marshal.Copy` **0.008 ms/次** |
| 帧 alpha 形态 | cat `idle_00.png` 96×96：**opaque 4824 / semi 0 / zero 4392**（二值 alpha，利于逐像素命中） |
| 中文气泡 | GDI+ `DrawString`（Microsoft YaHei UI，含圆角卡+中文+「AI 生成」行）从 480×336 ARGB 位图转预乘 **5.88 ms 一次性**；semi=990（仅圆角/文字抗锯齿），系统字体齐全 |
| 命中/穿透验证 | **无法在本机完成**：桌面锁屏时 `WindowFromPoint` 对普通不透明窗口同样返回 `LockScreenBackstopFrame`（HWND 2229974），屏幕捕获报「句柄无效」→ 必须解锁后在交互桌面验收 |

Rust 可行性〔仓〕：

- CI（`.github/workflows/build-windows.yml:38–48`）已在 `windows-latest` 安装 `dtolnay/rust-toolchain@stable` 并成功 `npx tauri build`（产出 NSIS + portable + SHA256SUMS + BUILD-INFO，`.github/workflows/build-windows.yml:46–124`）。
- 因此 **Rust 原生窗口只需新增 windows-sys features + 新模块即可由 CI 编译**；代价是反馈环 8–15 分钟。建议在 Sprint 前置安装本地 rustup + VS Build Tools（约 2–3 GB / 30–60 分钟）以缩短迭代；若不允许安装，C# 原型是可用的本地行为台，但不改变交付语言。
- **C# 原型定位**：只用于 ①本地验证 Win32 语义（ULW/预乘/命中/DPI）；②与 Tauri 产物做逐帧/性能对照；③helper 方案的兜底实验。不作为交付路径（理由见 §2.1、§2.2）。

### 1.4 逐像素命中/穿透的文档依据（〔公开〕）

- MS「Layered Windows」：`UpdateLayeredWindow` 用于**逐像素 alpha**；**"Hit testing of a layered window is based on the shape and transparency of the window. This means that the areas of the window that are color-keyed or whose alpha value is zero will let the mouse messages through."**（<https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features>）。→ 原生窗口**无需**手写 `WM_NCHITTEST` 穿透、无需 60 ms 轮询，只需让帧 alpha 保持 0/255 二值（美术本身就是二值，实测 0 semi；自定义包若含半透明像素，在载入时按阈值二值化）。
- `UpdateLayeredWindow` 文档：`WS_EX_LAYERED` 自 Win8 起支持 top-level 与 child；`UpdateLayeredWindow` 与 `SetLayeredWindowAttributes` **不能在同一窗口上混用**（先 SLA 会让 ULW 失败，需清/重设 layer 位）：<https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow>、<https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes>。
- `WM_NCHITTEST` 语义（命中测试返回 HTTRANSPARENT 等）备用：<https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest>；拖动推荐 `ReleaseCapture + WM_NCLBUTTONDOWN(HTCAPTION)` 走系统模态移动循环（与外部同类实现一致〔公开〕）。
- 备选 GPU 路径：DirectComposition（`CreateTargetForHwnd` 要求窗口属于调用进程；可为 top-level/child；DComp 内容会叠在 HDC 绘制之上）<https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondevice-createtargetforhwnd>；`WS_EX_NOREDIRECTIONBITMAP` 可去掉重定向位图。对 96×96/8–12 fps 的像素画不需要 GPU 合成，Phase 1 用 GDI ULW 即可；DComp 留作 Phase 3 性能/稳定性升级项。

---

## 2. 共存方案：Tauri 与原生宠物窗口

### 2.1 方案对比（a/b/c + 变体）

| 方案 | 形态 | 关键证据 | 优点 | 代价/风险 | 结论 |
|---|---|---|---|---|---|
| **a1. Tauri/tao 窗口 + 自绘** | `tauri::window::WindowBuilder`（unstable）或直接 `tao` 建窗，拿 HWND 后 `SetWindowSubclass` 拦 `WM_NCHITTEST`/`WM_TIMER` 并 ULW 呈现 | docs.rs 标注该 builder「Available on crate feature unstable only」：<https://docs.rs/tauri/latest/tauri/window/struct.WindowBuilder.html>；tao 透明实现用 `DwmEnableBlurBehindWindow` + 空 region（#16341 调查） | 窗口由 Tauri 管：monitor/position/DPI/托盘联动现成；生命周期统一 | 公开 API 不稳定；窗口状态/WndProc/DPI/close 行为被 tao 接管，子类化易与 tao 状态管理打架；若误用 `transparent:true` 会重新进入黑框缺陷路径 | 备选（仅当 raw 窗口与 Tauri 生命周期冲突无法解决时） |
| **a2. 同进程 raw Win32 窗口（推荐）** | Tauri 进程内新建一条 native-pet 线程：`RegisterClassExW/CreateWindowExW`（popup、layered、topmost、toolwindow、noactivate）+ 自有消息循环；`AppHandle` 用于发事件/开内容窗 | C# 原型已验证同一 Win32 路径（§1.3）；`windows-sys` 已在依赖且 CI 可编译 | 零跨进程 IPC；完全控制命中/拖动/DPI/合成/恢复；删除透明 WebView 与轮询；一个 exe；无 GPU 依赖 | 自己写窗口/消息循环/位置/DPI/单实例召回（约 800–1200 行 Rust〔推断〕）；本地无 Rust，迭代靠 CI | **采用** |
| **b. 独立 helper 进程** | Tauri 启动 `famling-pet-native.exe`（Rust 或 C#），命名管道/HTTP/WS/stdio 通信；托盘/单实例/设置仍在 Tauri | 本机 C# 已验证 Win32 路径；Tauri `externalBin` 支持 sidecar：<https://v2.tauri.app/develop/sidecar/> | 崩溃隔离；可用 C# 立即在本地迭代/演示；renderer 与 host 解耦 | 两 exe/两生命周期/两套托盘+单实例+配置；IPC 协议与安全；NSIS/portable/签名/升级双份；杀软/信誉；长期双运行时维护；估计 +5–8 人日集成〔推断〕 | **不作为交付路径**；仅工期兜底/本地实验台 |
| **c. 原生 child 窗口嵌入 Tauri 窗口** | 把原生窗口设为 Tauri 窗口的子窗口，或替换 Tauri 窗口内容 | MS：`WS_EX_LAYERED` 自 Win8 起可用于 child；但 child 受父窗口裁剪且父窗口仍需 DWM 透明合成（`DwmEnableBlurBehindWindow` + WebView2 背景），即 #16341/#15947 的路径 | 看似「一个窗口」 | **根因不消除**：父窗口透明链仍在；child 分层语义/跨 DPI/命中裁剪复杂；WebView2 内容仍参与合成 | **技术否决** |
| L1. 隐藏 WebView「逻辑控制器」（正交选项） | 保留 `main.ts` 在隐藏 Tauri 窗口跑状态/存档/语音/同意/行为，原生窗口只画+输入，二者走 Tauri 事件/命令 | WebView2 隐藏窗口会被后台优化：隐藏 WebView 被回收→窗口销毁→Tauri `ExitRequested`（cc-switch #1245 记录〔公开〕）；wry 遮挡 opt-out PR #1742 未合入；`backgroundThrottling` 的运行时实现在发布说明里写「currently for WebKit only」：<https://v2.tauri.app/release/tauri-runtime/v2.4.0/> | 最快达到功能 parity；复用 2502 行 `main.ts` + 170 KB `desktop-shell.ts` | 宠物链路仍含 WebView2 进程/隐藏窗；后台节流/遮挡回收/窗口生命周期风险；内存不降；必须长期维护「隐藏宿主」；与「宠物链路只有一层 alpha」不变量冲突 | **不纳入目标架构**；仅允许 0.3.0-beta 临时 parity 桥，带删除 gate（§5.3、§10-Q1） |

### 2.2 为什么 helper（b）不作为交付路径（但保留为兜底）

- **收益**：进程隔离（native 崩溃不拖垮 Tauri）；C# 可本地即时开发；渲染进程可独立重启。
- **成本（相对 a2）**：
  1. IPC 面：需要协议版本、握手/鉴权、消息分帧、超时、重连、背压；每秒 8–12 帧控制 + 输入事件 + 状态同步（若 helper 承担行为，≥30–60 msg/s〔推断〕）。
  2. 双份宿主能力：托盘（Tauri 已有）、单实例（mutex 在 Tauri 侧，helper 需被召回/隐藏）、窗口位置持久化、崩溃报告、日志脱敏、DPI/多屏。
  3. 打包/发布：`externalBin` 需要 binaries/name-target-triple 命名与安装布局（<https://v2.tauri.app/develop/sidecar/>）；portable zip 必须带两个文件；NSIS 卸载清理；两个 exe 都要 Authenticode；杀软/信誉/EDR 新面；升级必须版本锁定（host/helper 协议不匹配要拒绝并回退）。
  4. 运行成本：多一个进程（WebView2 之外的 asset 内存/句柄/启动时间）；调试跨进程。
  5. 若 helper 用 C#：额外依赖 .NET Framework（Win11/Win10 1903+ 内置 4.8，可接受，但仍是部署矩阵一项；<https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements>）；csc 的 C# 5 语法限制只影响本地原型，正式构建应走 CI 的 MSBuild/dotnet。
- **什么时候才翻案**：① 本地装不了 Rust 且 CI 反馈环不可接受；② 进程内原生线程被证实无法稳定（例如 DPI awareness/消息循环冲突，需实测）；③ 需要 native 渲染独立崩溃恢复。翻案时用 §3.2 的命名管道协议。

### 2.3 推荐拓扑（a2）

```
famling-tauri.exe  （单进程，Per-Monitor V2 DPI awareness，Windows）
├─ main thread（tauri/tao 事件循环）
│  ├─ 托盘图标/菜单（显示/召回、设置…、退出）            ← 现有 main.rs:187–218 扩展
│  ├─ 单实例命名互斥 + 注册消息广播召回 + FindWindowW 兜底  ← 现有 main.rs:139–185 升级
│  ├─ panic 崩溃导出（现有格式不变）                       ← main.rs:34–137
│  ├─ 命令路由 + 状态（RendererState/NativePetHandle/Config）
│  └─ WebView2 "content" 窗口（按需创建：设置/内容中心/同意/AI 声明/关于）
├─ native-pet thread（raw Win32 消息循环，无 WebView2）
│  ├─ HWND "FamlingPetWindow"，标题 "Famling · 汀岚"（单实例按标题兜底）
│  ├─ WS_POPUP + WS_EX_LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE
│  ├─ ULW_ALPHA 逐像素 alpha 呈现（预乘 BGRA DIB）
│  ├─ 命中由 OS alpha 决定（0=穿透）；拖动=系统模态移动循环；贴边 settle
│  ├─ WM_DPICHANGED / WM_DISPLAYCHANGE / WM_SETTINGCHANGE / 会话/电源恢复
│  └─ 动画节拍（WM_TIMER）+ 帧缓存（Phase 1：idle/idle_blink/pat_head/drag/land）
└─ 共享：Arc<Mutex<NativeState>> + std::sync::mpsc<NativeCmd>；native→AppHandle::emit / run_on_main_thread
```

**不变量（评审时必须逐条检查）**：

1. 原生模式下**宠物链路上没有任何 WebView2 窗口**（不创建、不复用旧的 `main` 透明宠物窗）。
2. 设置/内容/同意/AI 声明只在**普通不透明 WebView2 窗口**中出现；这些窗口可正常显示标题栏/任务栏/焦点。
3. 原生窗口只画像素与处理输入；业务状态/存档/语音在 Phase 2 前仍由 web 模式承担（native 模式在 beta 阶段是行为子集，见 §5.3 与 05 计划）。
4. 回滚时同一二进制可切回 web 渲染器，宠物存档格式/槽位不变。

### 2.4 进程内窗口/标签/capability/z-order 设计

| 窗口 | label | WebView2? | capability | z-order/焦点 | 说明 |
|---|---|---|---|---|---|
| 原生宠物 | 无（HWND 非 Tauri 窗口） | 否 | 不适用 | TOPMOST；`WS_EX_NOACTIVATE` + `WM_MOUSEACTIVATE→MA_NOACTIVATE`（点击不抢当前应用焦点）；不显示任务栏/Alt-Tab | 标题保持 `Famling · 汀岚`（单实例召回兜底） |
| 内容/设置 | `content` | 是（不透明） | 新 `capabilities/content.json`（`windows:["content"]` + 所需 core/命令） | 普通 z-order；打开时 `show()+set_focus()`；关闭只关窗不退出 app | 复用 pet.html + `__CONTENT_WINDOW_ROUTE__`（content/settings） |
| 旧宠物（web 回退） | `main` | 是（透明，沿用 0.2.3） | 现有 `default.json` | 现有行为 | 只在 renderer=web 或 native 失败回退时创建；native 模式下不创建 |
| （Phase 2 可选）HUD | `hud` | 是（不透明小窗） | 新 `capabilities/hud.json` | 紧贴宠物/光标，按需显示 | 仅当届时决定用「不透明 WebView HUD」承载气泡/菜单/输入时；内存成本 +40–90 MB/窗（`docs/design/PET-INPUT-OUTPUT-DESIGN-2026-11-17.md:80`〔仓〕），默认不做 |

- **z-order 细节**：宠物 TOPMOST 会盖在内容窗口之上（现状同样如此）；打开设置/内容时可选「临时把宠物降到 NOTOPMOST」或保持，需产品定夺并在验收中覆盖（§8-I8）。
- **焦点细节**：`WS_EX_NOACTIVATE` 保证摸宠不抢当前输入焦点（`WM_MOUSEACTIVATE → MA_NOACTIVATE`）；右键菜单用 `SetForegroundWindow + PostMessage(WM_NULL)` 修正（外部同类实现经验〔公开〕）；代价是键盘可达性下降（§7-R8）。
- **capability 拆分**：现有 `default.json` 只授 `main`；content 窗口若缺 capability，所有 `invoke` 都会被 ACL 拒绝（`RESOLUTION-TAURI-ACL-2026-11-19.md:107–128`〔仓〕已给出 23 命令 × 窗口矩阵与 build.rs 漂移门禁，可直接复用）。

---

## 3. 控制面：IPC/命令/事件/状态所有权

### 3.1 同进程（推荐）控制面

**状态所有权（唯一写者）**：

| 状态 | 唯一写者 | 读者 | 载体 |
|---|---|---|---|
| 渲染器选择（native/web/dual） | Tauri 主线程（Config） | 主线程/native 线程/设置页 | `%APPDATA%\com.perrylink.famling\native-pet.json`（原子写） |
| 原生窗口 HWND / 位置 / 尺寸 / DPI / 可见性 | native 线程 | 主线程（召回/托盘/QA）、native 自己持久化位置 | 共享 `Arc<Mutex<NativeState>>` + HWND 原子值 |
| 动画片段/帧索引/节拍 | native 线程 | 主线程（QA/状态） | native 线程内部 + 周期性状态快照 |
| 角色/缩放/低打扰偏好 | WebView（内容窗口） | 主线程→native（命令） | 现有 localStorage（web 模式同一套）；native 只收解析后的值 |
| 宠物存档/记忆/羁绊 | WebView（内容/设置窗口，Phase 2 前） | — | 现有 DPAPI 存档槽（不改格式） |
| 同意状态 | WebView（同意层）+ 宿主标记 | native 启动门禁 | localStorage + 宿主 consent 标记（缺失则不进 native，见 §4.2） |

**命令清单（JS→Rust，`#[tauri::command]`）**：

| 命令 | 调用窗口 | 作用 | 返回/超时 | 说明 |
|---|---|---|---|---|
| `get_pet_renderer_status` | content/QA | 读实际生效渲染器、回退原因、native HWND 是否存活、协议版本 | `RendererStatus` / 2 s | 设置页与 QA 探针使用；不泄露路径 |
| `set_pet_renderer` | content | 写配置文件（native/web），返回 `restartRequired:true` | `{restartRequired:true}` | 运行中不热切换（避免两套渲染器双写状态） |
| `open_content_window` | 主线程/native 右键/托盘（内部） | 创建或聚焦唯一 `content` 窗口并注入路由 | `Ok` / 3 s | **P0 补齐**；复用 `content-window://navigate` |
| `native_pet_reset_position` | content | 原生窗口移回主屏右下 12 px（替换缺失的 `reset_pet_window`） | `Ok` / 2 s | web 模式回落现有 `reset_pet_window` |
| `native_pet_set_character` | content | Phase 2：切换当前内置角色（pack id 白名单） | `Ok` / 2 s | Phase 1 原生只支持内置角色，见 §5.3 |
| `native_pet_set_scale` | content | Phase 2：图像整数倍缩放（与四层缩放契约一致） | `Ok` / 2 s | 只动图像层；UI/文本缩放留在 WebView |
| `native_pet_show` / `native_pet_hide` | content/tray | 显示/隐藏宠物（定时隐身、托盘开关、全屏） | `Ok` / 2 s | native 线程执行 `ShowWindow`/`SetWindowPos` |
| `quit_app` | content | 保存（Phase 2）后退出整个应用 | `Ok` / 4 s | **P0 补齐**；主线程置 quitting 标记后 `app.exit(0)`；Rust 4 s 兜底强退 |
| `native_pet_qa_probe` | QA（仅 `--qa`/debug） | 返回 HWND/exstyle/rect/ULW 结果/帧耗时/命中探针 | JSON / 3 s | 仅调试构建注册，避免发布版扩大攻击面 |
| `set_pet_hit_regions` | **仅 web 宠物窗** | 旧透明窗穿透链路 | `()` | native 模式不注册/不调用；Phase 3 删除 |

**事件清单（Rust→JS，`AppHandle::emit_to` / `emit`）**：

| 事件 | 方向/承载 | payload | 用途 | native 模式下的消费方 |
|---|---|---|---|---|
| `pet://renderer-status` | 主线程 → content/QA | `{requested, active, fallbackReason?}` | 设置页显示实际渲染器与回退原因 | content 设置对话框 |
| `pet://native-ready` | native 线程 → 主线程 → content | `{hwnd, dpi, scale, firstFrameMs}` | 首帧就绪、QA 记录 | 主线程（不再等 page）；content 只读展示 |
| `pet://native-error` | native 线程 | `{code, message}`（脱敏） | 触发回退 + 写本地日志（不联网） | 主线程负责 fallback |
| `pet://native-fallback` | 主线程 | `{reason}` | 本次运行已降级 web 的可见状态（About/QA） | content 设置对话框 |
| `pet://native-frame` | native 线程（debug/QA） | `{clip, index}` | 帧级 QA/录屏对照 | QA 脚本（CDP 连 content 或本地日志） |
| `pet://fullscreen-changed` | 主线程/native 轮询 | `{fullscreen, hidden}` | 低打扰隐藏状态 | content 设置/About |
| `content-window://navigate` | 主线程 → content | `"content" / "settings"` | **现有契约**，打开/聚焦时切面板 | content 自身（`content-runtime.ts:1207–1216`） |
| `pet://reload-requested` / `pet://character-pack-apply` 等 | content → 旧 pet 窗 | 现有 | 仅 web 模式需要；native 模式改走命令（`native_pet_set_character`） | 旧 pet 窗 |

**线程与调用规则（必须写进代码评审清单）**：

1. Tauri 命令一律 `async fn`；`Sender::send` 后用一个 `tokio::sync::oneshot` 等 native 线程回执（超时 2 s）；**不允许在命令里同步等 native 线程**（会阻塞 Tauri IPC/主线程）。
2. native 线程**绝不直接调 WebView2**；需要建窗/发事件时用 `AppHandle::run_on_main_thread` / `emit`（`AppHandle` 是 `Send + Sync`）。WebView2 窗口创建在同步命令/事件处理器里会死锁（docs.rs tauri 2.12.7 的 Known issues），必须走主线程或在 `setup`/`async` 命令中创建。
3. channel 有界（如 64）+ 合并策略：位置/缩放/可见性只保留最后一帧；帧遥测可丢；命令回执丢失时返回超时错误但不崩溃。
4. 所有命令在 Rust 侧做 **window label 校验**（`webview.label() == "content"` 或受控的 `main`）——与私有宿主 `require_pet_window` 的既有安全模式一致（`RESOLUTION-TAURI-ACL-2026-11-19.md:116–118`〔仓〕）；native 无 WebView，不暴露任何 IPC 入口。
5. 协议版本：`NATIVE_PET_PROTOCOL_VERSION: u32` 编入二进制并在 `get_pet_renderer_status` 返回；content 页发现版本不匹配时禁用「原生模式」选项并提示升级（避免半升级的 portable 组合）。

### 3.2 若采用 helper 进程（b）：IPC 选型（明确结论：命名管道）

| 方案 | 延迟 | 安全面 | 防火墙/杀软 | 请求-响应 | 复杂度 | Windows 细节 | 结论 |
|---|---|---|---|---|---|---|---|
| **命名管道（message mode）** | ~0.1–1 ms | **最好**：内核对象 ACL、可 `PIPE_REJECT_REMOTE_CLIENTS`、可校验父进程 PID/一次性 token | 不触发防火墙（本机内核对象） | 原生双工、可消息分帧 | 中 | `CreateNamedPipeW`：`PIPE_ACCESS_DUPLEX + PIPE_TYPE_MESSAGE + PIPE_READMODE_MESSAGE + PIPE_REJECT_REMOTE_CLIENTS`；首个实例 `FILE_FLAG_FIRST_PIPE_INSTANCE` 防抢占；句柄继承/ACL 需显式处理 | **推荐**（若走 b） |
| 本地环回 HTTP | ~1–5 ms | 中：任意本机进程/浏览器页可访问；端口抢占 | **可能弹防火墙**；AV 关注监听端口 | 原生 | 中 | 必须绑 `127.0.0.1` + 随机端口 + `Authorization` token + 校验 `Origin`；防 DNS rebinding/CSRF；端口泄露风险 | 次选 |
| WebSocket | ~1–5 ms | 同 HTTP（+升级握手） | 同 HTTP | 原生 | 中高 | 额外 ping/keepalive、代理/AV 拦截；功能上无必要 | 不选 |
| stdin/stdout（Tauri sidecar） | ~0.1–1 ms | 好（父子句柄） | 无 | **弱**：行/帧协议自实现，无天然超时/多路 | 低 | `externalBin` + shell 插件（<https://v2.tauri.app/develop/sidecar/>）；GUI 子进程需 `CREATE_NO_WINDOW`；EOF 可检测崩溃；Windows 下 stdout 重定向/编码坑 | 仅单向/简单 helper |
| 共享内存 + 命名 Event | <0.1 ms | 中（映射对象 ACL） | 无 | 需自建环形缓冲/序号 | 高 | 同步/撕裂/版本兼容复杂，容易出错 | 不选 |

**命名管道协议草案（若翻案到 b）**：

- 方向：Tauri（Rust）当 **server**，helper（Rust/C#）当 client；host 先建管道再 `CreateProcess`/sidecar 启动 helper（传 `--pipe=<name> --token=<nonce> --parent-pid=<pid>`），并创建 **Job Object（`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`）** 保证 host 退出/崩溃时 helper 必死。
- 握手：`hello {protocolVersion, pid, token}` → `ready {version, build}`；版本/令牌不符立即断管并退出（不重试风暴）。
- 消息：长度前缀 + JSON（或 bincode）；命令 `render {clip/frame/scale/pos}`、`bubble {text, ttl}`、`show/hide`、`quit`；事件 `ready`、`click`、`drag-end`、`error`、`fps`。
- 失败：管道断 → host 1 s 内回退 web 渲染；helper 崩溃写 WER/本地日志；不做无限重启（最多 3 次/10 min，退避）。
- C# 侧最小实现（本地已验证 csc 可编译同类 P/Invoke）：`NamedPipeClientStream(".", name, PipeDirection.InOut)` + `BinaryReader/Writer`；生产建议改用 `CreateNamedPipeW` 直调以控制安全描述符与消息模式。

### 3.3 配置/持久化与状态同步

**配置文件**（native 模式唯一新增的持久化面；原子写 tmp+rename，失败不阻塞启动）：

```json
{
  "schema": 1,
  "renderer": "native",
  "native": {
    "x": -1,
    "y": -1,
    "dpi": 96,
    "scale": 2,
    "character": "pet-cat"
  },
  "updatedAtMs": 0
}
```

- 路径（与 Tauri identifier 对齐）：`%APPDATA%\com.perrylink.famling\native-pet.json`；web 模式沿用现有 localStorage 键，**不迁移** native 位置（跨模式位置各自独立是已接受行为，写进发布说明）。
- 配置解析优先级：CLI `--pet-renderer=` > `FAMLING_PET_RENDERER` > 配置文件 > 编译期默认；非法值安全回退到默认（不 panic）。
- **宠物存档零改动**：Phase 1 native 不写宠物状态（只写窗口位置）；Phase 2 起用现有 `secret.rs` + `write_save/read_save` 同槽位（`main.rs:370–472`），golden fixtures 校验 envelope 与 web 回滚可读（详见 05 计划 §4.9）。
- **同意状态**：native-only 启动**必须**有宿主侧同意标记；公开仓缺 `record_host_consent/revoke_host_consent/host_consent_status`（P0 补齐，复用私有设计 `RESOLUTION-TAURI-ACL-2026-11-19.md:116–118`）。策略：
  - 无标记 → 本次启动**强制 web 渲染器**（用户仍看到现有 TOS 流程）；同意后提示「下次启动启用原生渲染」。
  - 有标记 → 允许 native 启动。
  - 撤回同意/删除全部数据（content 窗口执行）→ `revoke_host_consent` 成功 → 主线程关闭 native 并回退 web（或提示重启）；下次启动无标记 → web。
  - 原生模式的右键菜单必须能到达「声明/About/数据控制」入口（打开 content 窗口对应面板），否则视为同意可达性回归（验收 §8-I10）。

### 3.4 交互/事件契约（native 线程 ↔ 主线程 ↔ content）

| 交互/事件 | 发起方 | 路径与 payload | native 模式行为 | web 模式行为（保持） |
|---|---|---|---|---|
| 左键点击角色（opaque 像素） | 用户 | native WndProc → 主线程 event | Phase 1：立即播 `pat_head` 片段（乐观反馈，不依赖 IPC 往返）；Phase 2：向状态层发 `pat`（bond/语音/气泡由 content 或状态运行时处理） | 现有 click→`doPat()`（`main.ts:879`） |
| 拖动角色 | 用户 | `WM_LBUTTONDOWN` → `ReleaseCapture + WM_NCLBUTTONDOWN(HTCAPTION)` → `WM_ENTERSIZEMOVE/WM_EXITSIZEMOVE` | 系统模态移动；退出时贴边 settle + 持久化位置；Phase 2 向状态层发 `drag.end`（land 片段） | 现有 `startDragging` + `pet-window-dock`（`desktop-shell.ts:2805–2821`） |
| 右键/菜单键 | 用户 | native WndProc | Phase 1：直接打开 content 窗口（settings 路由）；Phase 2：原生 `TrackPopupMenu`（设置/内容/摸/隐藏/退出）或复用不透明 HUD；键盘可达性方案见 §7-R9 | 现有 `#pet-shell-menu` DOM 菜单 + 门禁（`desktop-shell.ts:1378–1611`） |
| 托盘显示/召回 | 用户 | 主线程 tray event | `ShowWindow(SW_SHOWNOACTIVATE)` + `SetWindowPos(HWND_TOPMOST)`（必要时 `SetForegroundWindow`） | 现有 `recall_pet_window`（`main.rs:220–232`） |
| 托盘/菜单退出 | 用户 | 主线程 | Phase 1：置 quitting → native 停 loop → `app.exit(0)`；Phase 2：先保存 native 状态（`quit_app` 语义）再退；4 s 超时强退 | 现有 `exitAfterSave()` + `quit_app`（主线程补实现） |
| 全屏/演示检测 | 系统 | native 每 2 s `SHQueryUserNotificationState`（复用 `main.rs:475–493` 逻辑） | 全屏时隐藏宠物、退出后恢复；被用户手动隐藏时不恢复 | 现有 `is_fullscreen` 命令 + JS 轮询 |
| DPI/显示变化 | 系统 | `WM_DPICHANGED`/`WM_DISPLAYCHANGE`/`WM_SETTINGCHANGE` | 重算物理尺寸/整数缩放、必要时重定位、重推 ULW；发状态事件；**不重建 WebView** | 现有：启动读一次 DPR，切 DPI 需重启（`ADR-SCALE-DPI` D-SCALE-5） |
| 渲染器回退 | 主线程 | native error/timeout | 创建旧 web 宠物窗（透明路径）并切 web；写配置/日志；通知 content | —（本身就是 web） |
| 角色/缩放切换 | content 设置页 | 命令 | Phase 2 生效（切换 pack/整数缩放，重载帧缓存） | 现有 `BUILTIN_RENDERER_APPLY`/`content-runtime` 事件链 |
| 定时隐身/低打扰 | content/tray | 命令 `native_pet_hide/show` + 到期定时器 | native 线程执行隐藏/恢复；计时用宿主墙钟（不受隐藏影响） | 现有 `hide-for.ts`（`src/pet/hide-for.ts:1–35`） |
| 单实例第二启动 | 系统 | mutex + 注册窗口消息广播 | 已运行进程的 native WndProc 收消息 → 展示宠物；新进程 exit 0 | 现有 `FindWindowW` 保留兜底 |

**事件时延目标**：点击→首帧反应 ≤ 1 帧（乐观反馈，不依赖 IPC）；托盘召回 ≤ 300 ms；全屏隐藏 ≤ 2.5 s（轮询周期 2 s + 余量）；回退 web 窗口出现在 ≤ 2 s 内。

---

## 4. 设置/内容 WebView 与生命周期集成

### 4.1 open_content_window：原生模式唯一可见的 WebView 入口（P0 补齐）

前端契约已存在（`src/pet/content-window.ts:110–145,279–280`），Rust 侧必须实现「唯一 content 窗口，重复打开=聚焦 + 路由」：

```rust
// src-tauri/src/content_window.rs（P0 新增；调用方：托盘菜单、native WndProc 右键、QA）
// 需 use tauri::{Emitter, Manager};
const CONTENT_WINDOW_LABEL: &str = "content";

#[tauri::command]
async fn open_content_window(app: tauri::AppHandle, route: String) -> Result<(), String> {
    let route = if route == "settings" { "settings" } else { "content" };
    if let Some(win) = app.get_webview_window(CONTENT_WINDOW_LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        win.emit("content-window://navigate", route).map_err(|e| e.to_string())?;
        return Ok(());
    }
    // WebView2 窗口创建必须主线程；在 async command 中用 oneshot 把结果带回来。
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app2 = app.clone();
    let route2 = route.to_string();
    app.run_on_main_thread(move || {
        let script = format!("window.__CONTENT_WINDOW_ROUTE__ = \"{}\";", route2);
        let result = tauri::WebviewWindowBuilder::new(
                &app2, CONTENT_WINDOW_LABEL, tauri::WebviewUrl::App("pet.html".into()))
            .title("内容与设置 · Famling")
            .inner_size(960.0, 720.0)
            .min_inner_size(720.0, 480.0)
            .resizable(true)
            .initialization_script(&script)
            .build();
        let _ = tx.send(result.map(|_| ()).map_err(|e| e.to_string()));
    }).map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
```

- 复用 **同一** `pet.html` 与 `#content-window-home` / settings/content 面板（`pet.html:149–175`、`src/pet/content-runtime.ts:1157–1219`），不新增页面、不改 Vite 入口。
- capability：新增 `capabilities/content.json`，`windows:["content"]`，按实际调用授 `core:default` + 需要的命令权限（存档/语音/consent/`get_pet_renderer_status` 等）；同步更新 `tauri.conf.json` 的 `app.security.capabilities` 列表（当前未显式列出，需与 23 命令矩阵一起做）。
- 麦克风权限：`on_permission_request` 目前只放行 `label=="pet"`（`main.rs:591–598`）；若 PTT/ASR 在 content 窗口使用，需扩到 `content`（Phase 2/3；Phase 1 native 模式不支持 PTT 则不改）。
- 关闭语义：content 窗口 `close()` 只关窗，不退出 app（与现有 `closeContentWindow` 一致）；主线程需在窗口事件里忽略 `CloseRequested` 的退出默认。
- 托盘/右键菜单入口：Phase 1 原生右键直接以 `settings` 路由打开；托盘菜单增加「设置…」项（可选）。

### 4.2 首次运行/同意/撤回：native-only 启动的前置

原生模式没有 WebView 读 localStorage，因此**同意门禁必须在宿主侧有持久标记**（P0 补齐 consent 4 命令，设计见 `docs/audit/RESOLUTION-TAURI-ACL-2026-11-19.md:116–118`〔仓〕与 `RESOLUTION-CONSENT-GATE`）。方案（按阶段）：

| 阶段 | 首次运行（无宿主标记） | 撤回/删除全部数据 | 说明 |
|---|---|---|---|
| Phase 1（beta） | **强制 web**：按 0.2.3 现有透明宠物窗 + TOS 流程；同意后提示「重启后启用原生渲染」并允许设置切换 | content 窗口完成撤回/删除 → `revoke_host_consent`；提示「重启后恢复 Web 渲染」；native 在本次运行继续只画像素（不涉及数据），重启后 web | 零新增同意 UI；不触碰法律文本；验收覆盖「无标记→web」 |
| Phase 2/3（默认 native 前） | 打开 content 窗口 `route="consent"`（不透明窗口）完成 TOS/年龄/TTS/ASR 声明，然后启动 native；或首启 web、二次 native（更简单） | 同上；确保原生右键菜单可到达「声明/数据控制」 | 需要 content 路由新增 `consent` 或复用现有 consent overlay（`startup.ts` 已按 contentShell 分支） |

**不可妥协的约束**：native 渲染器不得成为绕过 TOS/TTS/ASR/年龄门禁的旁路；AI 生成标识与 About 入口在 native 模式下仍必须可达（Phase 2 原生气泡需含「AI 生成 · 不是真人」行，或气泡仍由不透明 WebView HUD 承载）。

### 4.3 生命周期：启动顺序/托盘/单实例/退出/崩溃

**启动顺序（native 路径）**：

1. `install_crash_hook()`（现有 `main.rs:107–137`，保持最先）。
2. `ensure_single_instance()`：互斥存在时改为「注册消息广播 + 旧 FindWindowW 兜底」→ 展示已运行宠物 → exit 0（互斥句柄全程持有，现有语义不变）。
3. 解析 renderer 配置（CLI/env/文件/默认）；读宿主 consent 标记；决定本次运行模式（native 需标记存在，否则 web）。
4. `tauri::Builder::default().manage(...).invoke_handler(...).setup(...).build(...).run(...)`：
   - `setup` 中：注册状态、建托盘、按模式创建窗口：
     - **web**：与 0.2.3 完全相同（tauri.conf 的 `main` 窗 + 路由）——保证回滚零差异。
     - **native**：不创建 tauri.conf 的 `main` 窗（推荐把 `app.windows` 改为不自动建、统一运行时创建）；spawn native 线程；等 `pet://native-ready`（≤2 s）后 `ShowWindow`；超时/错误 → fallback web。
   - `RunEvent::ExitRequested`：*非* `quitting` 时 `api.prevent_exit()`（tray-only 保活，tauri#13511〔公开〕）；`quitting` 时让退出。
   - `RunEvent::Exit`/`WindowEvent::Destroyed`：通知 native 线程 `PostMessage(WM_CLOSE)` 并 join（带 1 s 超时）。
5. 首帧策略：native 窗口先 `CreateWindowExW` 但不 `ShowWindow`；解码首页帧 + ULW 成功后 `ShowWindow(SW_SHOWNOACTIVATE)`（避免白/黑首帧）；web 路径维持现有首帧处理（`pet.html:3–15` 的静态 shell 属性）。

**托盘（保持 Tauri 主线程）**：

- 菜单：显示/召回（native: show+topmost；web: 现有 recall）、设置…（`open_content_window("settings")`）、退出（quitting=true → native stop → `app.exit(0)`；Phase 2 先 save）。
- 图标/提示沿用 `app.default_window_icon()`（`main.rs:205–207`）；fail-soft 语义不变（托盘失败只打日志）。

**单实例召回（native 版）**：

- 命名互斥保持 `Local\Famling.SingleInstance.v1`。
- 第二实例：`RegisterWindowMessageW("Famling.ShowExisting.v1")` → 若已运行：`PostMessageW(HWND_BROADCAST, msg, 0, 0)`（native WndProc 处理该消息 show）→ exit 0；旧 `FindWindowW("Famling · 汀岚")` 保留兜底（native 窗口标题保持常量）。
- 已运行实例的 native 窗口需要 `SetWindowPos(HWND_TOPMOST)` 再 `ShowWindow`；`WS_EX_NOACTIVATE` 下 `SetForegroundWindow` 可能失败——召回以「可见/置顶」为准，不强行抢焦点（与现有语义一致：`main.rs:222–232`）。

**退出/保存（分阶段）**：

- Phase 1：native 没有宠物状态（不写 bond/记忆）→ 退出只需停动画定时器 + 销毁窗口 + app.exit；位置已在移动结束保存。
- Phase 2：`quit_app` 需要在退出前把 native 状态（若状态迁移到 Rust）或让状态仍在 WebView 写档；无论哪种，**保持现有 4 s 强退兜底**与「保存失败要二次确认」语义（`main.ts:2200–2216` 现有逻辑），不得静默丢档。
- 崩溃：native 线程消息处理外层 `catch_unwind` + 错误计数；渲染/消息循环禁止 `unwrap`；panic 时写一份 `crashes/crash-<epoch>.json`（复用 `write_crash_report` 格式，thread 字段标 `native-pet`）并回退 web（同一次运行），不让用户面对黑窗。

### 4.4 设置页/入口（content 窗口内）

| 设置项 | 现状 | native 集成改动 | 阶段 |
|---|---|---|---|
| 渲染引擎（实验） | 无 | 新行：当前实际 renderer/回退原因/「原生（需重启）」「Web（兼容）」；调用 `set_pet_renderer`；禁用条件：无宿主 consent 标记 | P1/P2 |
| 复位窗口 | `reset_pet_window`（缺失） | content 调 `native_pet_reset_position`；web 保持旧命令 | P1 |
| 角色切换/缩放 | content hub / 设置 | Phase 2：`native_pet_set_character/set_scale`；Phase 1 原生固定默认角色，设置页禁用并说明 | P2 |
| 气泡/文本/UI 缩放 | 现有四层缩放 | native 不承担文本；维持 WebView HUD/content 方案（若 Phase 2 决定原生气泡，需单独设计字号/200% DPI） | P2+ |
| 关于/声明/数据控制 | content 窗口可打开 | 不变；但原生右键菜单必须有入口 | P1/P2 |
| QA/诊断 | 现有 CDP 脚本 | 新增 `native_pet_qa_probe` + `scripts/qa/native-pet-probe.ps1`（窗口/exstyle/rect/ULW/命中/CPU/RSS/DPI） | P1 |

---

## 5. 打包/签名/发布与开关回滚

### 5.1 打包（推荐 a2：单进程单 exe，零新增可执行文件）

| 项 | 现状（0.2.3） | native 集成后 | 证据/影响 |
|---|---|---|---|
| 产物 | NSIS 安装包 + portable zip + SHA256SUMS + BUILD-INFO；unsigned | 不变（无第二个 exe） | `.github/workflows/build-windows.yml:46–124`；`RELEASE-2026-11-25.md:33–37` |
| 体积 | 安装包 ≤ ~5 MB、portable ≤ ~6 MB（0.2.1 资产 4,909,888 / 6,060,416 B） | +0.3–0.6 MB Rust 代码（推断）+1.10 MB 动画帧（三角色 PNG）；可先只嵌入当前角色（0.35–0.40 MB） | `RELEASE-2026-11-25.md:11`；本机统计：cat 144 文件/357.7 KB、dog 137/399.0 KB、human 142/369.0 KB |
| 动画帧来源 | 前端 fetch `/assets/pet/anim/...`（dist 内嵌） | native 需要自己的帧：build.rs 读 `native-pet/anim-contract.json` 生成 `include_bytes!` 索引（编译期嵌入）；不要运行时从 dist 读（dist 在 exe 内，无稳定文件路径） | 05 计划 §4.4；`public/assets/pet/anim/cat/manifest.json:22–45` |
| 帧缓存内存 | WebView2 canvas 位图 | 解码后 96×96×4×帧数；当前角色全量约 5.0 MB（136–143 帧），LRU/按需解码可压到 1–2 MB | 本机统计/推算 |
| 安装/升级/卸载 | NSIS；portable 单 exe | 不变；无新资源布局、无新注册表项、无新服务 | — |
| 签名 | 无 Authenticode、无证书、无 updater | 不变；native 不引入签名依赖（in-process）；不得在文档/关于页声称已签名 | `RELEASE-2026-11-25.md:33–37`；`docs/STATUS.md:21–22` |
| 校验 | SHA256SUMS + BUILD-INFO（node/rustc/tauri 版本、commit/ref） | BUILD-INFO 增加 `default-renderer`、`native-protocol`、`embedded-art-sha256` | 同上 |
| CI | npm ci → typecheck → build → 三角色 FCI 校验 → rust-toolchain → tauri build → 打包/校验/Release | 增加：`cargo fmt --check`、`cargo clippy`、`cargo test`、`native-pet-contract --check`、可选 `native-smoke`（不依赖可见桌面）；构建时长 +3–8 min（推断） | `.github/workflows/build-windows.yml:24–48` |

**若翻案到 helper（b）的打包差异（仅记录）**：

- `tauri.conf.json > bundle > externalBin` 需要按目标三元组命名的二进制（如 `binaries/famling-pet-native-x86_64-pc-windows-msvc.exe`；<https://v2.tauri.app/develop/sidecar/>）。
- NSIS 会把 sidecar 安装到应用目录；portable zip 必须显式包含 helper（否则用户解压后 native 模式不可用）；卸载需清理 helper。
- 两个 exe 都要签名（当前均 unsigned；若未来启用 Authenticode 必须同时签，否则 host 无法验证 helper 完整性）；版本/协议握手不匹配时 host 拒绝启动 helper 并回退 web。
- 杀软/EDR 新面：新 exe 无信誉积累，可能触发 SmartScreen/AV；发布说明需指引校验 SHA256SUMS。

### 5.2 签名/信任边界

- native 代码与 Tauri host 同属一个已签名（未来）二进制，**不扩大**信任边界；没有新的提权/服务/驱动。
- 原生窗口没有 WebView，不暴露 IPC；所有输入来自 OS 消息；不读取文件系统（帧内嵌），不联网。
- 崩溃导出沿用本地 JSON（`%APPDATA%\Famling\crashes`），不新增上传/收集；native 线程的 panic 必须脱敏（不放用户路径/env）。
- 内容窗口仍是唯一收到 IPC 的 WebView；capability 必须最小化（避免出现「为了原生窗口把 default.json 权限放宽」的反模式）。

### 5.3 Feature flag / 回滚矩阵

**优先级（高→低）**：

| 来源 | 值 | 用途 | 说明 |
|---|---|---|---|
| CLI | `--pet-renderer=native/web/dual` | QA/排障/灰度 | 最高优先；非法值回退默认 |
| 环境变量 | `FAMLING_PET_RENDERER` | CI/自动化/客服脚本 | 与 CLI 等价，便于探针 |
| 配置 | `%APPDATA%\com.perrylink.famling\native-pet.json > renderer` | 用户设置（设置页写入） | 原子写；缺失/损坏→默认 |
| 编译期默认 | `cfg!(feature="native-default")` 或常量 | 0.3.0-beta=web；0.4.0=native | 发版决策点 |
| （debug） | `dual` | 同屏 web+native 对照，禁用存档/语音避免双写 | 发布版忽略该值 |

**回退触发与动作（fail-soft，全部本地、不联网）**：

| 触发 | 动作 | 用户可见性 | 证据写入 |
|---|---|---|---|
| 无宿主 consent 标记 | 本次运行强制 web | 无弹窗；设置页显示原因 | 本地日志（1 行） |
| native 线程创建窗口失败/`UpdateLayeredWindow` 失败/首帧解码失败 | 关闭 native → 创建旧 web 宠物窗（透明路径）并切 web | 无弹窗；设置页显示「已回退 Web」 | `%APPDATA%\Famling\logs\native-pet.log`（截断 64 KB）+ 可选崩溃 JSON |
| 首帧超时（>2 s）/`pet://native-error` | 同上 | 同上 | 同上 |
| native 线程 panic（catch_unwind 捕获） | 写 crash JSON + 回退 web（同一次运行） | 宠物继续可见（web） | `crashes/crash-<epoch>.json` |
| 用户设置切回 web | 写配置 → 提示重启 → 下次启动 web | 设置页提示 | 配置 `updatedAtMs` |
| 整包回滚（发版失败） | 撤 tag/重发上一版安装包；无 updater，用户手动覆盖安装 | 发布说明 | Release 资产 |

**默认切换 gate（0.3.0-beta → 0.4.0）**：

1. 24h soak（native 默认）+ 8h soak（混合操作）无黑框/黑条/残影/崩溃；
2. 点击穿透/拖动/贴边/DPI/多屏/全屏/锁屏解锁/RDP 全部通过（§8）；
3. 「无宿主标记→web」「撤回→web」两条同意路径通过；
4. 回滚演练（native→web，同二进制重启）通过且宠物存档/内容包不受影响；
5. owner 明确批准默认切换，发布说明写清限制（无 updater/unsigned/native 行为子集）。

**数据兼容/回滚安全**：

- 宠物存档格式/槽位/DPAPI 不变；native 只新增独立配置文件与日志；回滚 web 后旧数据完整可读。
- 位置/缩放：native 与 web 各自存储（不迁移）；回滚后位置差异是已知行为，不视为数据损坏。
- 内容包/角色选择：Phase 1 native 固定内置默认角色（不支持自定义包）；Phase 2 起命令同步；回滚 web 时 content 窗口的选择仍然生效（同一 localStorage）。
- 回滚演练步骤（写进 release checklist）：① 设置切 web → 重启 → 验证宠物/语音/存档/内容窗口；② 覆盖安装上一版（0.2.3）→ 验证启动；③ 删除 native 配置文件 → 冷启动；④ 单实例/托盘/退出各 3 次。

---

## 6. 代码级草图（集成边界，不含渲染器内部）

### 6.1 依赖与模块（`app/tauri/src-tauri/Cargo.toml`）

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
# ...现有依赖不变...
windows-sys = { version = "0.61", features = [
  "Win32_Foundation", "Win32_System_Threading", "Win32_UI_WindowsAndMessaging",
  "Win32_UI_Shell", "Win32_Storage_FileSystem", "Win32_Security_Cryptography",
  "Win32_System_Memory",
  "Win32_Graphics_Gdi", "Win32_UI_HiDpi", "Win32_System_JobObjects",
  "Win32_UI_Input_KeyboardAndMouse",
] }
png = "0.18"
```

### 6.2 模块骨架（`app/tauri/src-tauri/src/native_pet/mod.rs`）

```rust
pub mod assets;
pub mod config;
pub mod input;
pub mod render;
pub mod window;
pub mod qa;

pub const PROTOCOL_VERSION: u32 = 1;

pub enum NativeCmd {
    Show, Hide, ResetPosition,
    SetScale(f64),
    SetCharacter(String),
    Stop,
    QaProbe(tokio::sync::oneshot::Sender<serde_json::Value>),
}

pub struct NativePetState {
    pub tx: std::sync::mpsc::Sender<NativeCmd>,
    pub hwnd: std::sync::atomic::AtomicIsize,
    pub ready: std::sync::atomic::AtomicBool,
    pub fallback_reason: std::sync::Mutex<Option<String>>,
}

pub fn spawn(app: tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel::<NativeCmd>();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<isize, String>>();
    std::thread::Builder::new().name("native-pet".into()).spawn(move || {
        if let Err(error) = window::run(app.clone(), rx, ready_tx) {
            let _ = app.emit("pet://native-error",
                serde_json::json!({ "code": "native-init", "message": error }));
        }
    }).map_err(|e| e.to_string())?;
    ready_rx.recv_timeout(std::time::Duration::from_secs(2)).map_err(|e| e.to_string())?
}
```

### 6.3 窗口/消息循环（`native_pet/window.rs`，要点）

```rust
const WINDOW_TITLE: &str = "Famling · 汀岚"; // 与 tauri.conf / 单实例 FindWindowW 一致

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
        WM_LBUTTONDOWN => {
            ReleaseCapture();
            SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION as WPARAM, 0);
            0
        }
        WM_EXITSIZEMOVE => { persist_position(hwnd); 0 }
        WM_DPICHANGED => { apply_dpi(hwnd, lp); 0 }
        WM_DISPLAYCHANGE | WM_SETTINGCHANGE => {
            validate_and_reposition(hwnd); repaint_current_frame(hwnd); 0
        }
        WM_TIMER => { advance_animation(hwnd); 0 }
        WM_APP_SHOW_FROM_SECOND_INSTANCE => { show_and_topmost(hwnd); 0 }
        WM_CLOSE => { KillTimer(hwnd, TIMER_ANIM); DestroyWindow(hwnd); 0 }
        WM_DESTROY => { PostQuitMessage(0); 0 }
        WM_PAINT => 0,
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

fn create(app: &tauri::AppHandle) -> Result<HWND, String> {
    let ex = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
    let hwnd = unsafe { CreateWindowExW(ex, class_atom(), WINDOW_TITLE, WS_POPUP,
        0, 0, 96 * scale() as i32, 96 * scale() as i32,
        std::ptr::null_mut(), std::ptr::null_mut(), GetModuleHandleW(null()), null()) };
    if hwnd.is_null() { return Err(last_error()); }
    Ok(hwnd)
}
```

**关于「窗口尺寸」的集成决策**：当前 WebView 宠物窗是 **480×336 CSS**（含角色周围透明空气）。原生窗口有两个选项：

- **A（推荐 Phase 1）保持 480×336 逻辑尺寸**：窗口物理尺寸 = 480×336 × DPI 因子；角色 96×96 × 图像整数缩放画在底部居中；与现有位置/贴边/可达性下限（96×72 物理像素，`edge-dock.ts:44–56`）契约一致，回退/对照最容易。
- B 紧包围角色（如 96×scale 加边距）：省合成面积/内存，但会改变位置/贴边/右键菜单/气泡定位语义，需重新验收；作为 Phase 2 优化项。
- 无论 A/B，像素画缩放只用整数倍（`ADR-SCALE-DPI` D-SCALE-5；`pixel-scale.ts`），DPI 由 `WM_DPICHANGED` 重算物理尺寸；不要对 DIB 做 `StretchBlt`（会清零 alpha，外部同类实现已踩坑）。

### 6.4 ULW 呈现（`native_pet/render.rs`，要点）

```rust
fn present(hwnd: HWND, surface: &Surface, dirty: RECT) {
    let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER, BlendFlags: 0,
        SourceConstantAlpha: 255, AlphaFormat: AC_SRC_ALPHA };
    let info = UPDATELAYEREDWINDOWINFO {
        cbSize: size_of::<UPDATELAYEREDWINDOWINFO>() as u32,
        hdcDst: null_mut(), pptDst: null(), psize: null(),
        hdcSrc: surface.hdc_mem, pptSrc: pt(0, 0),
        crKey: 0, pblend: &blend, dwFlags: ULW_ALPHA,
        prcDirty: &dirty,
    };
    unsafe { UpdateLayeredWindowIndirect(hwnd, &info); }
}
// 帧：PNG straight alpha -> premultiplied BGRA；alpha 二值化（>=128 取 255，否则 0）
// 命中：OS 自己按 alpha=0 穿透；不要调用 SetLayeredWindowAttributes（与 ULW 互斥）
```

### 6.5 main.rs 集成点（改造后的骨架差异）

```rust
fn main() {
    install_crash_hook();
    ensure_single_instance();

    let config = config::load();
    let mode = config.effective_mode();

    tauri::Builder::default()
        .manage(NativePetState::default())
        .manage(AppConfig::from(config))
        .invoke_handler(tauri::generate_handler![
            content_window::open_content_window,
            native_pet::commands::get_pet_renderer_status,
            native_pet::commands::set_pet_renderer,
            native_pet::commands::native_pet_reset_position,
            native_pet::commands::native_pet_show,
            native_pet::commands::native_pet_hide,
            native_pet::commands::quit_app,
        ])
        .setup(move |app| {
            setup_tray(app.handle());
            match mode {
                Mode::Web => { /* 0.2.3 原路径：create pet window、place_bottom_right */ }
                Mode::Native => {
                    if native_pet::spawn(app.handle().clone()).is_err() {
                        /* fallback：建 web 透明宠物窗 + 写日志 */
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !app.state::<AppConfig>().quitting.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
            tauri::RunEvent::Exit => {
                let _ = app.state::<NativePetState>().tx.send(NativeCmd::Stop);
            }
            _ => {}
        });
}
```

### 6.6 content 设置页桥（TS，最小改动；Phase 1/2）

```ts
// src/pet/native-pet.ts（新增，供 content 设置对话框与 QA 使用）
export type PetRendererMode = 'native' | 'web'
export interface PetRendererStatus {
  readonly requested: PetRendererMode
  readonly active: PetRendererMode
  readonly fallbackReason?: string
  readonly nativeAlive?: boolean
  readonly protocolVersion?: number
}
export async function getPetRendererStatus(): Promise<PetRendererStatus | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<PetRendererStatus>('get_pet_renderer_status')
  } catch {
    return null
  }
}
export async function setPetRenderer(mode: PetRendererMode): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_pet_renderer', { mode })
    return true
  } catch {
    return false
  }
}
```

- 设置对话框（`desktop-shell.ts` 的 settings modal 构建段 `~2000–2700`）新增一组「渲染引擎（实验）」，复用现有 `action()` 模式与快捷键/aria；不新增常驻按钮（`PROJECT-REVIEW-UX` 的零按钮原则）。
- 文案必须写清「需重启」「原生模式当前不支持气泡/语音/自定义角色（随版本）」等真实限制，不得让用户以为功能全等。

### 6.7 C# 原型/兜底（只用于本地实验，不是交付代码）

本机已验证的最小骨架（`csc.exe /target:winexe /r:System.Drawing.dll` 可编译）：

```csharp
// 1) 窗口：CreateWindowExW(WS_EX_LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE, "Famling · 汀岚", WS_POPUP)
// 2) 帧：System.Drawing.Bitmap(96x96) -> LockBits(Format32bppArgb) -> 预乘 -> 32bpp top-down DIB
// 3) 呈现：UpdateLayeredWindow(hwnd, null, ref dst, ref size, memDC, ref src, 0, ref blend, ULW_ALPHA)
// 4) 拖动：WM_LBUTTONDOWN -> ReleaseCapture + WM_NCLBUTTONDOWN(HTCAPTION)；WM_EXITSIZEMOVE 保存位置
// 5) 右键：TrackPopupMenu（设置/隐藏/退出），SetForegroundWindow + PostMessage(WM_NULL)
// 6) 若走 helper：NamedPipeClientStream(".", pipeName, PipeDirection.InOut) + 长度前缀 JSON
```

边界：C# 原型能证明 Win32 语义与性能（§1.3 实测），**不能**证明 Tauri 生命周期/托盘/单实例/打包/签名/升级；这些只能在 CI 产物 + 真机交互桌面验证。


### 6.8 文件级集成地图（新增/修改，按阶段）

| 文件 | 类型 | 改动 | 阶段 | 回滚 |
|---|---|---|---|---|
| app/tauri/src-tauri/src/main.rs | 改 | renderer 配置解析/分支；native spawn/stop；托盘菜单扩展；单实例注册消息召回；RunEvent::ExitRequested 保活；新增命令注册 | P0/P1 | 保留原分支（默认 web 路径不改动语义） |
| app/tauri/src-tauri/src/content_window.rs | 新增 | open_content_window（唯一 content 窗口/路由注入/capability 配合） | P0 | 删除文件 + 撤命令注册 |
| app/tauri/src-tauri/src/native_pet/mod.rs | 新增 | NativeCmd/状态/spawn/命令桥/回退 | P1 | 删除目录 + 撤命令 |
| app/tauri/src-tauri/src/native_pet/window.rs | 新增 | 窗口类/WndProc/消息循环/拖动/DPI/显示变化 | P1 | 同上 |
| app/tauri/src-tauri/src/native_pet/render.rs | 新增 | DIB/ULW/脏矩形/恢复重推 | P1 | 同上 |
| app/tauri/src-tauri/src/native_pet/assets.rs | 新增 | 帧索引/PNG 解码/预乘/二值化/LRU | P1 | 同上 |
| app/tauri/src-tauri/src/native_pet/config.rs | 新增 | renderer 优先级/配置原子写/位置/consent 标记读取 | P0/P1 | 同上 |
| app/tauri/src-tauri/src/native_pet/input.rs | 新增 | 点击/拖动/右键/菜单请求 | P1 | 同上 |
| app/tauri/src-tauri/src/native_pet/qa.rs | 新增 | --native-smoke / QA probe（debug/--qa） | P1 | 同上 |
| app/tauri/src-tauri/native-pet/anim-contract.json | 新增 | TS↔Rust 动画契约（生成物，CI check） | P1 | 删除 + 撤 build.rs 生成 |
| app/tauri/src-tauri/build.rs | 改 | 读契约生成 include_bytes 索引（+ 可选命令/权限漂移门禁） | P0/P1 | 恢复 4 行版本 |
| app/tauri/src-tauri/Cargo.toml | 改 | windows-sys features + png 直接依赖 | P1 | 恢复依赖表（lock 已有 png） |
| app/tauri/src-tauri/capabilities/content.json | 新增 | content 窗口最小权限 | P0 | 删除 + 从 tauri.conf capabilities 列表移除 |
| app/tauri/src-tauri/tauri.conf.json | 改 | 窗口按模式运行时创建；capabilities 列表；bundle 无新增资源 | P0/P1 | 恢复 0.2.3 配置 |
| src-tauri/src/consent.rs（或复用 secret.rs 模式） | 新增/改 | record/revoke/grant/host_consent_status（P0，复用私有设计） | P0 | 删除 + 撤命令 |
| src/pet/native-pet.ts | 新增 | get/set renderer 的前端桥（content 设置页/QA） | P1/P2 | 删除 + 设置页回退 |
| src/pet/desktop-shell.ts | 改 | 设置对话框新增「渲染引擎（实验）」组（真实限制文案） | P1/P2 | 删除该组 |
| scripts/native-pet-contract.mjs | 新增 | 生成/校验动画契约 | P1 | 删除 |
| scripts/qa/native-pet-probe.ps1 | 新增 | 窗口/exstyle/ULW/命中/CPU/RSS/DPI 探针 | P1 | 删除 |
| .github/workflows/build-windows.yml | 改 | fmt/clippy/test + 契约 check + BUILD-INFO renderer 字段 | P0/P1 | 删除新增 step |
| docs/STATUS.md、README、app/tauri/README、CHANGELOG | 改 | native 模式、开关、限制、回滚、构建说明 | P3 | 文档回退 |

---

## 7. 风险登记（集成视角）

| ID | 风险 | 概率/影响 | 证据/触发 | 缓解 | 验收 |
|---|---|---|---|---|---|
| R1 | 透明 WebView2 合成缺陷在 native 模式消失，但回退 web 时仍暴露 | 中/高 | #16341、#15947 | 回退路径只作短期兜底；正确性以 native 为准；回退需提示已知限制 | §8-I4、I6 |
| R2 | ULW 逐像素命中依赖文档行为；半透明/自定义包像素会吞点击 | 中/中 | MS 文档；美术实测 0 semi | 载入时 alpha 二值化；自定义包先走 web（Phase 1）；命中探针纳入 CI/QA | §8-I7 |
| R3 | 隐藏 WebView 方案（若使用 L1）被节流/遮挡回收/窗口销毁 | 中/高 | wry#1742 未合入；WebView2 隐藏回收触发 ExitRequested | 默认不用 L1；若临时使用：AdditionalBrowserArguments 关闭节流/遮挡检测 + 计时验收；限定 0.3.0-beta 并删除 | §8-I10、§5.3 |
| R4 | 本地无 Rust，纯 CI 反馈环长、错误发现晚 | 高/中 | 工具链探测〔实测〕 | Sprint 前置装 rustup+VS Build Tools；PR 小步；CI 加 check/clippy；C# 台架先行验证 Win32 语义 | §9-P0 |
| R5 | 本机锁屏，命中/视觉/DPI 无法验收 | 高/中 | §1.3〔实测〕 | 明确需解锁交互桌面的验收 gate；先做可自动化 exstyle/ULW/perf 探针；录屏人工执行 | §8-I6、I7 |
| R6 | content 窗口在 native 模式不可用（缺 open_content_window/capability） | 高/高 | 公开仓 grep 0；default.json 只授 main | P0 必须先补齐命令 + capability + build.rs 门禁 | §8-I1 |
| R7 | 用户设置/角色/缩放改动在 native 模式无效或两套状态漂移 | 中/高 | 两套存储/两套窗口 | Phase 1 设置页禁用 native 不支持的项并明示；Phase 2 命令单向（content→native），native 只读；禁止双写 | §8-I5、I8 |
| R8 | 键盘/读屏可达性回归（NOACTIVATE + 原生菜单 + 原生气泡） | 中/高 | 现有 a11y 合同：pet.html:57–69 的 tabindex/role；PROJECT-REVIEW-UX R-03 | Phase 1 菜单/气泡仍走 WebView（HUD/content）；Phase 2 原生气泡需 UIA/键盘方案；验收含 axe/UIA 清单 | §8-I12 |
| R9 | 单实例召回在 NOACTIVATE 窗口下 SetForegroundWindow 失败/标题漂移 | 中/中 | main.rs:139–185 现有 FindWindowW | 注册窗口消息广播 + HWND 原子值；标题常量为不变量；召回以可见/置顶为准 | §8-I2、I3 |
| R10 | 退出/保存时序：托盘退出时 native 未停/存档未写完 | 中/高 | 现有 save-then-quit 语义（main.ts:2200–2216） | quitting 标记 + native stop + 4 s 强退；Phase 2 保存先行；退出路径单测/演练 | §8-I3 |
| R11 | 首帧白/黑闪（native 先 Show 后画） | 中/中 | 0.2.3 已有首帧暗闪教训（pet.html:3–14） | CreateWindow 后不 Show，ULW 首帧成功再 Show；录屏前 20 帧判据 | §8-I6 |
| R12 | 显示变化/DWM 会话后 ULW 内容丢失 | 中/中 | #16341 的合成恢复实验；MS WM_DISPLAYCHANGE | 监听 display/setting/power/session 事件 → 重推 ULW + SetWindowPos(SWP_FRAMECHANGED)；不重建窗口 | §8-I9 |
| R13 | helper 方案（若翻案）IPC/打包/签名/杀软成本失控 | 中/高 | §2.2、§5.1 | 只作兜底；命名管道 + Job Object + 协议版本；两个 exe 同时签名；升级绑定 | §8-I11 |
| R14 | MVP 功能子集让用户误以为「坏了」（无气泡/无语音/无羁绊） | 高/中 | Phase 1 范围 | native 默认 web 直到 parity；设置页/发布说明写清限制；不把 native 设为默认 | §5.3 |
| R15 | 纯净基线：工作树 157 改 + 0 tag 导致无法复现/回滚 | 高/高 | 05 报告 §1.2 | P0 先提交/打 tag；CI 从 tag 构建；native 分支从干净基线切 | §9-P0 |
| R16 | 法律/同意可达性：native 模式绕过 TOS/TTS/ASR/AI 标识 | 低/致命 | 现有 consent 架构 | 宿主 consent 标记门禁；原生右键必须到声明/数据控制；AI 标识随气泡保留；法务复核 | §8-I10、I12 |

---

## 8. 验收指标（集成 gate，可复现）

说明：视觉/命中类必须**解锁的交互式 Windows 桌面**；CI 只能覆盖构建/单测/窗口属性探针。所有 native 指标以 web 0.2.3 为基线对照。

| ID | 指标 | 方法/工具 | 阈值 | 证据 |
|---|---|---|---|---|
| I1 | 窗口共存 | 启动 native 模式：确认无透明宠物 WebView 窗（进程/窗口枚举无 msedgewebview2 宠物窗）；右键/托盘开 content 窗口；开/关 20 次 | content 可开可关、关闭不退出 app；native 窗始终存在；无重复 content 窗口 | 探针 JSON + 截图 |
| I2 | 托盘/召回 | 托盘显示/召回、隐藏、设置、退出各 5 次；第二启动 5 次 | 召回 ≤300 ms；第二启动 exit 0 且只有 1 个 PID；退出后无残留进程 | 探针 + tasklist |
| I3 | 单实例/退出 | 冷启动→退出→再启动 10 次；托盘退出时（Phase 2）检查存档 | 单实例 100%；退出不丢档、无悬挂 native 线程（进程退出码 0） | 日志 + 存档校验 |
| I4 | 回退 | 设置 FAMLING_PET_RENDERER=bad、删除/损坏配置、注入 native 初始化失败（QA 开关）各 5 次 | 当次回退 web ≤2 s，无弹窗阻塞，宠物可见；日志含原因；无数据写入 | 日志 + 截图 |
| I5 | 渲染器切换 | CLI/env/配置文件三来源 × native/web 双向；重启生效 | 100% 按预期；设置页显示一致；无热切换双写 | 探针 JSON |
| I6 | 黑框/首帧 | 60 min soak 录屏 60fps；四角 alpha=0 探针逐帧检测；前 20 帧无白/黑闪 | 黑帧事件 0；首帧 ≤800 ms（warm）/≤1500 ms（cold） | 录屏 + 帧分析报告 |
| I7 | 点击穿透/命中 | 透明点 100 个 + sprite 不透明点 20 个（自动鼠标点击 + 下层 Notepad 收键/命中计数）；DPI 100/125/150/200 各 20 点 | 透明点穿透 100%；不透明点命中 100%；分辨率/DPI 切换后不冻结 | 探针脚本 JSON |
| I8 | 焦点/z-order | 点击宠物后 GetForegroundWindow 不变 20/20；打开 content 窗口时其获得焦点；关闭后焦点回原应用 | 100% 符合设计；设置/内容不被宠物遮挡到不可用 | 探针 + 人工 |
| I9 | DPI/显示/会话 | 100/125/150/175/200%；加/删显示器/虚拟显示；锁屏解锁；RDP 重连；睡眠唤醒各 3 次 | 无黑框/残影；整数像素清晰；位置不越界（可达性下限 96×72）；ULW 自动恢复 | 录屏 + 截图矩阵 |
| I10 | 同意/隐私 | 无宿主标记启动→web；有标记→native；撤回/删除→重启 web；native 右键到 About/声明 | 100% 按策略；无绕过；无新数据收集/网络请求 | 探针 + 本地抓包 |
| I11 | 打包/签名（若 helper） | 安装/卸载/portable/升级；两个 exe SHA256；签名状态 | 安装即用、卸载干净、便携可跑；unsigned 状态如实声明 | 安装日志 + SHA256SUMS |
| I12 | a11y/法务 | 原生菜单/气泡的键盘/读屏路径检查；AI 标识可见；About 可达 | 不新增 P0 回归；AI 标识 100% 随气泡出现 | axe/UIA 记录 + 截图 |
| I13 | 性能/内存 | 空闲/交互 10 min：CPU、私有/工作集、GDI/USER 句柄、帧耗时 | 空闲 CPU ≤0.3% 单核；native 线程新增私有内存 ≤60 MB（目标 ≤15 MB）；ULW p99 ≤2 ms | 探针 JSON（本机采样） |
| I14 | CI/构建 | windows-latest：fmt/clippy/test、前端 build、三角色校验、Tauri build、契约 check | 全绿；构建时长 ≤45 min（现有 timeout）；产物含 BUILD-INFO/renderer 字段 | CI run URL |

验收口径纪律：① 不允许用 CDP/浏览器模拟冒充真实 Windows 合成/DPI 验收（与 05 计划一致）；② 黑框类问题必须录屏逐帧证据，不接受「看起来正常」；③ 所有指标同时覆盖 web 0.2.3 基线对照。

---

## 9. 分阶段实施（与 05 迁移计划对齐的集成增量）

| 阶段 | 集成范围（本文件负责的部分） | 交付物 | 人日（±50%） | Exit gate |
|---|---|---|---|---|
| P0 基线与宿主契约修复 | ① 干净基线与 tag；② 补齐 open_content_window / quit_app / reset_pet_window / consent×3 / host_consent_status + 分窗口 capability + build.rs 命令与权限漂移门禁（复用 RESOLUTION-TAURI-ACL 设计）；③ renderer 配置/优先级/解析 + 未实现占位 + CI 加 fmt/clippy/test；④ 宿主 consent 标记读取；⑤ 锁屏限制记录 + 验收脚本骨架 | 可编译的开关骨架、content 窗口可开、CI 绿 | 2.5–3.5 | 默认 web 零回归；三来源开关可切；content 窗口/设置可用；干净构建 |
| P1 原生窗口 MVP + 生命周期 | native-pet 线程/窗口/ULW/帧（idle/idle_blink/pat_head/drag/land）/系统拖动/点击乐观动画/位置持久化/DPI/显示恢复；托盘-召回-单实例-退出；native↔主线程命令/事件；失败回退 web；QA 探针 | 可运行的 native 演示（默认 web），回退/日志/探针齐备 | 10–12 | §8 I1/I2/I3/I4/I5/I6/I7/I8/I12/I13 的最小集通过（交互桌面）；24h 初测无黑框 |
| P2 对等/桥接 | content 设置页 renderer 开关 + 真实限制文案；角色/缩放命令（状态迁移同 05 计划）；右键菜单/About/声明入口；原生气泡 vs 不透明 HUD 的决策与实现；同意首启路由；任务栏/全屏/低打扰联动；a11y 检查 | 0.3.0-beta.1（native opt-in、web 默认、unsigned） | 12–18 | 对等清单 + §8 全量通过；24h soak 0 黑框；法务/AI 标识可达性复核 |
| P3 默认切换与退役 | 默认 native 的启动顺序/同意流；web 回退保留一个版本；删除透明宠物窗/hit-region 轮询路径；文档/STATUS/README/CHANGELOG/BUILD-INFO；回滚演练 | 0.4.0 默认 native；回滚包与演练记录 | 8–12 | §5.3 默认切换 gate 全绿；回滚演练通过；owner 批准发布（仍 unsigned） |

**建议 PR 切分**（每个 <800 行、可独立回滚）：① content_window + capability + build.rs 门禁；② config/flag/consent 标记；③ native window + ULW + render；④ frames/contract/CI；⑤ input/drag/DPI/recovery；⑥ tray/single-instance/exit/fallback；⑦ settings UI + QA probe + docs。

**依赖关系**：P0 是所有后续的硬前置（尤其 content 窗口/consent/capability）；P1 不依赖渲染器内部 spike（task-16）但需其帧缓存/命中接口稳定；P2 的反馈依赖 task-17 的平台矩阵结果。

---

## 10. 待决策/待验证（Open Questions）

| # | 问题 | 本文件建议 | 决策人/方式 |
|---|---|---|---|
| Q1 | 是否保留「隐藏 WebView 逻辑控制器」（L1）作为 0.3.0-beta 的 parity 桥？ | 不保留；Phase 1 用功能子集（4–5 片段）换取「宠物链路无 WebView」；若必须提前 parity，限定 beta 且设删除 gate | owner/lead + 工期评估 |
| Q2 | 气泡/菜单/输入在 native 模式归谁？ | Phase 1：右键→content 设置/内容窗；气泡暂不显示（发布说明写明）。Phase 2：优先「不透明 WebView HUD」（复用 DOM/a11y/i18n，代价 +40–90MB/窗），原生气泡仅在性能/延迟不可接受时做 | 产品 + task-16 |
| Q3 | 首次运行/同意在 native 模式怎么走？ | Phase 1：无宿主标记强制 web（零新 UI）；Phase 2：content 窗口 consent 路由；安全底线见 §4.2 | 法务/产品 + 安全 |
| Q4 | 窗口尺寸保持 480×336 还是紧包围角色？ | Phase 1 保持 480×336（契约/回退最稳）；Phase 2 评估紧包围 | 产品 + QA |
| Q5 | 是否安装本地 Rust 工具链？ | 强烈建议（否则工期 +25–40%〔推断〕） | owner 环境决策 |
| Q6 | 单实例召回用注册消息广播还是保留 FindWindowW？ | 两者都做：广播为主、FindWindowW 兜底 | 实现评审 |
| Q7 | native 模式是否支持 PTT/ASR？ | Phase 1 不支持（无 WebView 音频链路）；Phase 2 由 content 窗口承载 PTT | 产品 + 安全 |
| Q8 | 默认切换版本/时间点？ | 0.3.0-beta native opt-in、web 默认；0.4.0 达标后默认 native | owner（§5.3 gate） |
| Q9 | helper 方案是否保留在 backlog？ | 保留为工期兜底；不在主计划排期 | lead |
| Q10 | 220% 缩放/混合 DPI/多屏的验收资源？ | 需真实多屏/虚拟显示组合；本机有 OrayIdd 虚拟显示器可部分覆盖（锁屏解除后） | QA + 平台验收（task-17） |

---

## 11. 证据索引

### 11.1 仓库文件（相对 repos/famling，本机 2026-11-25 工作树）

- 宿主/配置：app/tauri/src-tauri/src/main.rs:22–27,34–137,139–185,187–232,234–288,370–472,475–493,516–711,714–731；Cargo.toml:9–24；tauri.conf.json:12–33；capabilities/default.json:5–26；app/tauri/README.md:8–15（Tauri vs Electron 口径）。
- 前端：pet.html:3–15,43–89,149–175；src/pet/content-window.ts:20–31,75–145,279–280；src/pet/main.ts:227–251,1536–1639,2218–2254,2270–2471,2480–2501；src/pet/content-runtime.ts:631–687,1157–1219；src/pet/hit-regions.ts:1–31,205–210,340–350；src/pet/pet-window-dock.ts:1–36；src/pet/edge-dock.ts:1–56；src/pet/hide-for.ts:1–35；src/pet/health-reminder.ts:1–44；src/pet/desktop-shell.ts:490–620,932–1030,1378–1611,2805–2821；src/pet/startup.ts:1–18,113–152；vite.config.ts:273–292。
- 契约/决策：docs/plan/ADR-SCALE-DPI-2026-11-20.md:11–19,53–76,114–130；docs/audit/RESOLUTION-TAURI-ACL-2026-11-19.md:91–146；docs/design/PET-INPUT-OUTPUT-DESIGN-2026-11-17.md:80；docs/art/FINAL-ART-QA-2026-11-25.md:26–44；docs/STATUS.md:9–13,21–25。
- 根目录缺陷记录：../PET-WINDOW-ARCHITECTURE-REVIEW.md:5–23,25–40,49–56；../FIX-2026-11-25.md:5–9,30–31；../FIX-2026-11-25-BUTT.md:10–18,29–31；../RELEASE-2026-11-25.md:9–11,33–37。
- CI/打包：.github/workflows/build-windows.yml:24–124；tauri.bundle.conf.json（NSIS only）。
- 资产：public/assets/pet/anim/cat/manifest.json:22–45（idle 8 帧@8fps 等）；public/characters/pet-cat/character.json:13–40（96×96、display.scale=2、packBase）；本机统计 420 帧/约 1.10 MB。

### 11.2 官方文档/上游 issue（2026-11-25 可访问）

- Tauri 透明窗黑矩形（生产桌宠报告）：https://github.com/tauri-apps/tauri/issues/16341
- Tauri 透明置顶桌宠 + 频繁 cursor-event 切换导致黑区/壁纸变黑：https://github.com/tauri-apps/tauri/issues/15947
- Tauri ghost titlebar（closed，upstream WebView2）：https://github.com/tauri-apps/tauri/issues/14764
- Tauri Win10 透明无阴影黑边：https://github.com/tauri-apps/tauri/issues/14823
- Tauri no_redirection_bitmap（merged）：https://github.com/tauri-apps/tauri/pull/15410
- wry 隐藏窗口遮挡检测 opt-out（未合入）：https://github.com/tauri-apps/wry/pull/1742
- Tauri 无窗口时退出/保活：https://github.com/tauri-apps/tauri/issues/13511
- Tauri WindowBuilder（unstable feature 标注）：https://docs.rs/tauri/latest/tauri/window/struct.WindowBuilder.html
- Tauri WebviewWindowBuilder（additional_browser_args/background_throttling/no_redirection_bitmap）：https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html
- Tauri sidecar/externalBin：https://v2.tauri.app/develop/sidecar/
- Tauri background throttling 发布说明（WebKit only）：https://v2.tauri.app/release/tauri-runtime/v2.4.0/
- MS Layered Windows（含 alpha=0 穿透）：https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features
- MS UpdateLayeredWindow：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow
- MS SetLayeredWindowAttributes（与 ULW 互斥）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes
- MS WM_NCHITTEST：https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest
- MS DirectComposition CreateTargetForHwnd：https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositiondevice-createtargetforhwnd
- MS .NET Framework 系统要求：https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements
- MS DirectComposition 概述（备选 GPU 路径）：https://learn.microsoft.com/en-us/windows/win32/directcomp/directcomposition-portal

### 11.3 本机实测（2026-11-25，临时目录脚本，未入库）

- 工具链：无 cargo/rustc/MSVC/dotnet；csc 14.8.10001.0（C#5）；.NET Framework 4.8.10008；WebView2 153.0.4234.48；Win11 build 26300.0；AMD Radeon 1920×1080 + NVIDIA RTX 5090 D v2/OrayIdd。
- C# P/Invoke 探针：ULW 逐像素 alpha 窗口创建成功（exstyle 0x08080088）；480×336 × 60 帧 9.53 ms（0.159 ms/帧）；DIB 副本 0.008 ms；cat idle_00 alpha 4824/0/4392；GDI+ 中文气泡 5.88 ms；锁屏下 WindowFromPoint 返回 LockScreenBackstopFrame（普通不透明窗口亦然），屏幕捕获报句柄无效 → 命中/视觉验收必须解锁。
- 边界：以上只证明 Win32 API 路径/性能；未证明 Tauri 进程内集成、托盘/单实例、打包、签名、真实桌面合成（需 CI 产物 + 交互桌面）。

---

## 12. 结论（给 lead 的一句话）

选 a2（单进程 raw Win32 逐像素 alpha 窗口 + Tauri 主线程宿主 + 不透明 content WebView），先做 P0 宿主契约修复（open_content_window/capability/consent 标记/干净基线），再做 P1 原生窗口 MVP（默认 web、失败回退、QA 探针）；helper 进程仅作工期兜底，C# 只作本地验证台。该路径不改变宠物存档格式、不新增第二个 exe、不扩大签名/信任边界，且能用现有 CI 构建。

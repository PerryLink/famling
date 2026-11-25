# 05 — 原生宠物窗口迁移与发布计划（Famling 0.2.3 → 架构 A）

| 项 | 内容 |
|---|---|
| 任务 | task-18「重构迁移与发布计划」 |
| 日期 | 2026-11-25（Asia/Shanghai） |
| 作者 | 研究子代理 migration-plan |
| 状态 | **计划稿（PLAN ONLY）**。未实现、未改仓库代码；本文件是本次唯一写入。 |
| 上游决策 | 架构 A 已批准：保留 Tauri/WebView2 做设置/内容，宠物窗口改为原生逐像素 alpha 窗口（`PET-WINDOW-ARCHITECTURE-REVIEW.md` / `work/research/PET-WINDOW-ARCHITECTURE-REVIEW.md`）。 |
| 输入基线 | 本机 `repos/famling` 工作树（0.2.3 内容，未提交）；`repos/desktop-games` 私有 QA 文档；并行研究 01–04（动画/桌宠设计/一致性/技术栈）作为参照，但本文件可独立评审。 |
| 边界 | 只做迁移/发布计划；不改代码、不 commit/push、不读凭据；不含法务结论；金额/工期为估算（±50%）。 |

证据标记：**[仓]**=本仓源码/配置可复核；**[实测]**=本次在本机 Windows 实跑；**[公开]**=官方文档/上游 issue；**[外部]**=第三方实现/文章；**[推断]**=由证据推导、需实机确认。

---

## 0. 执行摘要（TL;DR）

1. **方案 A 可行，且比继续修补更便宜。** 本机没有 cargo/rustc/MSVC/dotnet SDK，但有 .NET Framework 的 `csc.exe`；**本次实测**用 C# P/Invoke 在该机成功创建 `WS_EX_LAYERED` 窗口并跑通 `UpdateLayeredWindow`（预乘 BGRA DIB），480×336 下 300 次平均 **0.173 ms/次**，720×504 下 200 次平均 **0.174 ms/次**。说明「逐像素 alpha + 软件合成」在本机/目标 Windows 上不是瓶颈，真正的瓶颈只是 Rust 工具链不在本机。
2. **推荐栈：单进程 Tauri host + 独立线程的 raw Win32 分层窗口**（不用 winit/wgpu，不用 WebView2 绘制宠物）；设置/内容中心继续用 Tauri WebView2 普通不透明窗口。理由：Tauri 生命周期/托盘/单实例/DPAPI/存档命令全部可复用，无跨进程 IPC、无第二个 exe、无 GPU 依赖；逐帧成本可忽略（像素画 8–12 FPS，每帧一次 ULW）。
3. **Rust 走 CI 可行**：现有 `.github/workflows/build-windows.yml` 已在 `windows-latest` 上用 `dtolnay/rust-toolchain@stable` 构建 Tauri/NSIS 成功（[仓] 38–48 行），新增 `cargo fmt/clippy/test` 与窗口 smoke 只是增量步骤；但纯 CI 反馈环 8–15 分钟，**建议把安装本地 Rust+VS Build Tools 作为 Sprint 前置**（约 2–3 GB，30–60 分钟；否则工期 +25–40%）。
4. **C# 原型只建议做本地可行性/参考实现，不建议作为交付路径**：作为独立进程发布要付出 IPC（命名管道）、托盘/单实例/存档双实现、两个 exe 打包/签名/升级、长期双运行时维护，估计 **+5–8 人日集成 + 持续成本**；Rust 在 Tauri 进程内是唯一能零 IPC 共享状态的方案。
5. **分支/开关**：新分支 `feat/native-pet-window`；运行时开关 `--pet-renderer=native|web|dual` + 环境变量 `FAMLING_PET_RENDERER` + 持久化 `%APPDATA%\com.perrylink.famling\native-pet.json`；**默认 `web` 直到 0.4.0**，0.3.0-beta 起 tester 可 opt-in，native 初始化失败自动回退 web（fail-soft）。
6. **先做 2 周 MVP**：仅 idle / idle_blink / pat_head / drag（4 个片段）+ 点击→摸头、拖动、右键→设置窗口、托盘召回、单实例、位置持久化、fallback、CI smoke；**不做**气泡文字、语音/PTT、内容中心、DSH brief、完整行为/场景、多角色。
7. **发现两个必须先处理的问题**：① 基线不干净——`repos/famling` 的 HEAD=`origin/main`=`7462ef4`，工作树 **157 个已改 + 12 个未跟踪文件（0.2.3 内容）**、**0 个 tag**，迁移分支必须从干净的 0.2.3 commit/tag 起；② 前端 `content-window.ts:125,128,280` 调用 Tauri 命令 `open_content_window`，但公开仓 Rust 端**没有实现该命令**（`app/tauri/src-tauri/` grep 0 命中）——native 模式必须补上，否则设置/内容窗口打不开。
8. **工期**：Phase 0 基线/开关 2.5–3.5 人日；Phase 1 最小原生 MVP 10–12 人日（2 周）；Phase 2 对等/双跑 beta 12–18 人日；Phase 3 默认切换/退役 8–12 人日；合计 **32.5–45.5 人日（预算按 35–40）≈ 7–9 周**（1 工程 + AI，含评审/CI 等待；装本地 Rust 取下限、纯 CI 取上限+；不含法务/owner 决策等待）。详见 §6.0 工期总表。
9. **验收硬指标**：24h soak 无黑框/黑条/残影；透明像素点击穿透 20/20 探针；空闲 CPU ≤0.3%（单核均值）；私有内存 ≤60 MB（现 WebView2 基线约 219 MB/7 进程）；首帧 ≤350 ms；DPI 100/125/150/175/200% 整数像素清晰；托盘召回/单实例/回滚演练通过。
10. **回滚**：同一二进制切回 web（设置或 `--pet-renderer=web`，无需重装）；旧 web 窗口代码在 0.3.0/0.4.0 保留一个版本；native 只新增存档槽（位置/渲染器配置），不动既有存档格式；发版失败则撤 tag、重发 0.2.3/上一版安装包（无自动更新）。

---

## 1. 当前基线（证据）

### 1.1 版本与构建链

| 项 | 值 | 证据 |
|---|---|---|
| 应用版本 | 0.2.3（approval-ready，未签名、无自动更新） | `package.json`、`docs/STATUS.md` |
| Tauri crate | tauri 2.12.5；windows-sys 0.61.2；png 0.18.1（传递依赖，已在 lock） | `Cargo.lock` |
| 窗口配置 | main 窗口 480×336、transparent、alwaysOnTop、decorations:false、skipTaskbar | `app/tauri/src-tauri/tauri.conf.json:13–27` [仓] |
| 宠物窗口默认入口 | `pet.html`；无参数启动即宠物窗 | `tauri.conf.json:13–27`、`src-tauri/src/main.rs:585+` |
| 点击穿透链路 | JS 每 ~250 ms 上报矩形区域 → Rust 每 60 ms 轮询光标并切 `set_ignore_cursor_events` | `src/pet/hit-regions.ts`、`src-tauri/src/main.rs:238–288` |
| 托盘/单实例/崩溃导出 | 0.2.1 加入；单实例按窗口标题 `Famling · 汀岚` 召回 | `src-tauri/src/main.rs:23,143–185,188–235`、CHANGELOG 0.2.1 |
| CI 构建 | `build-windows.yml`：npm ci → typecheck → build → 三角色 FCI 校验 → rust-toolchain → Tauri build（unsigned）→ NSIS+portable+SHA256SUMS+BUILD-INFO → Release | `.github/workflows/build-windows.yml:24–143` [仓] |
| 本地 WebView2 | 153.0.4234.48；Win11 build 26300 | 本机注册表/OS 探测 [实测] |
| 资产体量 | 动画帧：human 141 帧/360,744 B；cat 143 帧/349,231 B；dog 136 帧/392,127 B；`dist/` 766 文件/3,899,693 B | 本机统计 [实测] |

### 1.2 为什么必须换渲染层（缺陷根因，非美术问题）

| # | 症状 | 根因 | 证据 |
|---|---|---|---|
| G1 | 黑色矩形/黑框、长时间运行后整块变黑 | 透明 Tauri 窗口 + WebView2 默认背景 + DWM/WebView2 合成回归；0.2.3 只补了 `setBackgroundColor(alpha=0)`，仍属「修补下一层」 | [仓] `FIX-2026-11-25-BUTT.md`、`PET-WINDOW-ARCHITECTURE-REVIEW.md`；[公开] tauri #16341（open，长时运行透明窗变黑）、#14764（拖动/焦点 ghost 标题栏）、#14823（Win10 透明无阴影黑边） |
| G2 | 猫臀部黑条（狗已确认是美术接缝） | 猫 PNG 该处是合法 alpha=0 透明缝隙；透出的是窗口/WebView2 黑底，继续改美术不会消失 | [仓] `FIX-2026-11-25-BUTT.md`；[公开] WebView2 #5752（Runtime 154 下 alpha=0 背景失效、变主题色不透明）、#5492（144.x 透明窗伪影回归） |
| G3 | 透明区域挡住桌面点击、拖动/DPI 变化后旧位置吞点击 | Tauri/WebView2 不支持逐像素穿透，只能整窗开关 + 轮询；layered 命中区域在移动/DPI 后可能冻结 | [公开] tauri #13070（per-pixel click-through 请求，closed 未实现）、#6164（forward 选项 open）；[同类] Wails #5229（resize 后点击穿透错位）、#5371（WS_EX_LAYERED 命中区域需刷新）；[仓] `docs/research/PET-OCCLUSION-TECH-2026-11-18.md` 根因树（§3.6） |
| G4 | 为 192×192 的宠物开了 480×336 窗口，空气区域也要参与命中/轮询 | 窗口矩形远大于可见像素；alpha 只占画布 17%–41% | [仓] `docs/research/PET-OCCLUSION-TECH-2026-11-18.md:3.1` 测算 |

结论：架构 A 的收益不是「换个更快的画法」，而是**去掉整条 WebView2 透明合成链**，只保留一层逐像素 alpha；同时天然获得「alpha=0 像素不接收鼠标」的 OS 级命中语义，删除 250ms/60ms 两段轮询。

### 1.3 本机工具链与可行性实测（决定 Rust vs C# 路线）

本机探测（2026-11-25 [实测]）：
- 无 `cargo` / `rustc` / `msbuild` / `cl` / `link` / `dotnet` / Windows SDK；**有** `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`（.NET Framework 4.x，CLR 4.0.30319.42000）；有 `git`、Node（DSH 工具链）、Python、PowerShell。
- WebView2 运行时 153.0.4234.48；OS = Windows 11 build 26300（pwsh CIM/注册表口径；C# 探针进程无 manifest，CLR Environment.OSVersion 报 6.2.9200.0 属正常，不影响 Win32 调用）。
- **C# 探针（临时目录，已删除）**：`csc.exe` 编译 P/Invoke 代码成功；`CreateWindowExW(WS_EX_LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE)` 返回 HWND，exstyle=`0x8080088`；`UpdateLayeredWindow(ULW_ALPHA)` 首次返回 TRUE（err=0）；预乘 BGRA 帧合成后 300 次 ULW @480×336 平均 **0.173 ms**，200 次 @720×504（模拟 150% DPI 物理像素）平均 **0.174 ms**；`System.Drawing` 解码 96×96 PNG 4.51 ms（一次性）。
- 说明：① 「逐像素 alpha 分层窗口」在本机可用，不是纸面方案；② 每帧成本远低于 8–12 FPS 的预算；③ C# 可作为**本地渲染/命中/DPI 行为实验台**；④ Rust 路径的唯一缺口是工具链，不是 API。

外部同栈先例（[外部]，2026-11-02）：一个 Win32 分层窗口桌宠实现用相同 flags（LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE）+ `UpdateLayeredWindow(ULW_ALPHA)` + 预乘 BGRA；常驻渲染表面优化后单帧 **8.9 µs**、私有内存 **4.72 MB**、GDI 对象 30、拖动 CPU **2.16%（单核）**、单 exe 2.23 MB。其记录的坑与我们的设计一致：**GDI `StretchBlt` 缩放 32bpp DIB 会把 alpha 清零，缩放必须在代码里按全分辨率算**；右键菜单需 `SetForegroundWindow`+`WM_NULL`；用 `WM_MOUSEACTIVATE` 返回 `MA_NOACTIVATE` 防止抢焦点。链接见附录。

WebView2 现状基线（[仓]/私有仓 QA 文档，2026-11-14/15 实测，仅供对比，未复测）：5 分钟 soak：private 218.6→221.2 MB、working set 430.5→435.8 MB、7 个进程。native 目标：私有 ≤60 MB、进程数 1（设置窗未开时无 msedgewebview2）。

### 1.4 资产与包体影响

- 动画帧总量很小：三角色共 420 帧、约 1.10 MB PNG。MVP 可只嵌入当前角色（0.35–0.39 MB）；即使三角色全嵌入，安装包增量 ~1.1 MB（PNG 压缩后），可接受。
- `png 0.18.1` 已在 `Cargo.lock`（tauri 传递依赖），改为直接依赖不会引入新版本树；动画帧可 `include_bytes!` 嵌入（build.rs 生成索引），运行时一次性解码 + 预乘 + 缓存：dog 136 帧 × 96×96×4 ≈ **5.0 MB**，懒加载当前角色即可。

---

## 2. 推荐技术栈（含 Rust-via-CI 与 C# 原型可行性）

### 2.1 选项对比

| 方案 | 形态 | 可行性/证据 | 优点 | 代价/风险 | 结论 |
|---|---|---|---|---|---|
| **A. Rust raw Win32 分层窗口，跑在现有 Tauri 进程内（推荐）** | 独立线程消息循环 + `WS_POPUP/WS_EX_LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE` + `CreateDIBSection` + `UpdateLayeredWindowIndirect` | Windows 是 Tauri 主平台；现有 CI 已能构建 Rust/Tauri；本机 C# 实测证明同一 Win32 路径可用 | 零跨进程 IPC；复用托盘/单实例/DPAPI/存档/崩溃钩子；一个 exe；无 GPU/驱动依赖；逐像素命中由 OS 完成 | 需本地 Rust 或 CI 反馈环；需自己写 WndProc/动画调度（约 800–1200 行 Rust） | **采用** |
| B. Rust 用 `tauri::Window`/`WindowBuilder` + 子类化 WndProc | Tauri 2.12 有 Window/WindowBuilder，但 docs.rs 标注 WindowBuilder 为 **unstable** | [公开] docs.rs/tauri 2.12.7 window 模块 | 窗口归 Tauri 管理，生命周期统一 | 公开 API 不稳定；透明/layered 样式与 tao 窗口状态管理可能冲突；拿不到 WM_PAINT 自由绘制控制 | 备选；只在实际遇到原始窗口与 Tauri 生命周期冲突时评估 |
| C. winit + softbuffer/wgpu 另起事件循环 | 独立 native 渲染进程或同进程第二 loop | [公开] winit 文档：EventLoop 必须主线程、每进程只能创建一次；Tauri 基于 tao 已占用主循环 | 生态熟 | 同进程不可行；另起进程=跨进程 IPC + 双生命周期；wgpu 引入驱动/合成不确定性 | **不采用** |
| D. C# 独立进程（WinForms/WPF 分层窗口） | 常驻 exe，Tauri 通过命名管道/共享内存驱动 | 本机 csc 实测可行；.NET Framework 4.8 内置于 Win10/11 | 本地可立即原型/量化；Win32 代码简单 | **两 exe/两运行时**；托盘/单实例/存档/崩溃/升级双实现；IPC 状态同步（≥30–60 msg/s）；安装器/签名/杀软/完整性级别新面；长期维护成本 | 仅作 **本地 spike/参考实现**（≤1–2 人日）；**不作为交付路径** |
| E. Chroma-key WebView2 窗口（方向 B 过渡方案） | 纯色 key + `SetLayeredWindowAttributes(LWA_COLORKEY)` | 可 1 周内止血 | 改动最小 | 仍依赖 WebView2 透明链与 runtime 版本；抗锯齿/子像素/key 边缘风险；没有解决根因 | 仅当 native 工期不可接受时启用；本计划不排 |
| F. `SetWindowRgn` 裁剪 | 按帧外轮廓设 region | 方案 C（旧评估） | 无需合成 | 只能裁外轮廓，洞/缝隙仍在；region 逐帧维护成本高 | **拒绝** |

### 2.2 推荐栈结论与依赖

- **进程/线程模型**：Tauri 主线程保持 tao 事件循环；新建 **1 条 native-pet 线程**（Win32 消息循环）。跨线程用 `std::sync::mpsc` + `Arc<Mutex<NativeState>>`；native 线程持有 `AppHandle` 副本用于发事件/创建设置窗（窗口创建需 `run_on_main_thread`）。
- **渲染**：CPU 软件合成。常驻一个 32bpp top-down DIB section，每帧把 96×96 预乘帧按整数倍最近邻放大到窗口；只在帧变化时调 `UpdateLayeredWindowIndirect`，并用 `prcDirty` 限定脏矩形。像素画 8–12 FPS → 每秒 8–12 次调用，按实测 0.17 ms/次 ≈ **0.2% 单核/帧率预算**，可忽略。**不要用 GDI 缩放**（会把 alpha 清零，外部先例已踩坑）。
- **DPI**：进程 DPI awareness 继承 Tauri（Per-Monitor V2）；native 线程用 `GetDpiForWindow`/`WM_DPICHANGED` 计算整数艺术像素倍率 `s = clamp(round_ties_even(2 * dpi / 96), 2, 6)`（Rust `f64::round_ties_even`），窗口物理尺寸 = 96×s；在 100/125/150/175/200% 分别得到 **2/2/3/4/4**，保证像素画无模糊。该策略与仓库既有 ADR 的「像素画显示缩放只用整数/整数倒数」一致（[仓] `docs/plan/ADR-SCALE-DPI-2026-11-20.md` D-SCALE-5）。
- **新增依赖（最小化）**：`windows-sys 0.61` 增加 features `Win32_Graphics_Gdi`、`Win32_UI_HiDpi`（现有已有 Foundation/WindowsAndMessaging/Threading 等）；`png = "0.18"`（已在 lock）；**不新增** wgpu/winit/image/rand（随机微动作移植现有 mulberry32，保持确定性）。许可：windows-sys、png 均 MIT/Apache-2.0 系，需同步 `THIRD-PARTY.md`/`LICENSES.md`。
- **Rust-via-CI 可行性**：现有 workflow 已证明 `windows-latest` 可装 rust stable + 构建 Tauri；新增 `cargo fmt --check / clippy / test` 与 native smoke 是增量。纯 CI 的代价是**反馈环 8–15 分钟**：建议按「单 PR 单模块、一天 2–3 次全量构建」排；本地装 Rust 后反馈环降到分钟级，推荐。
- **本地 Rust 安装建议（可选前置）**：`rustup-init.exe`（MSVC toolchain）+ Visual Studio 2022 Build Tools（Desktop development with C++，含 Windows SDK/CMake/链接器），合计约 2–3 GB、30–60 分钟；装完 `cargo check`/`cargo build` 可直接迭代。若不允许安装，C# 台架可在本机验证 Win32 路径，但产品仍走 CI 编译 Rust。

---

## 3. 目标架构

```
Tauri host process: famling-tauri.exe (single process)
├─ main thread (tao/Tauri event loop)
│   ├─ tray icon/menu, single-instance mutex, crash hook (0.2.1 现有)
│   ├─ Tauri commands: save/secret/voice/advisers/open_content_window/set_pet_renderer/native_pet_status
│   └─ WebView2 window "content" (settings/content hub; normal opaque, 960×720, 按需创建)
├─ native-pet thread (raw Win32, no WebView2)
│   ├─ layered window: WS_POPUP + WS_EX_LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE
│   ├─ message loop: WM_TIMER(动画节拍) / WM_LBUTTONDOWN(摸头/拖动) / WM_RBUTTONUP(菜单/设置)
│   │                 WM_DPICHANGED / WM_EXITSIZEMOVE / WM_DISPLAYCHANGE / WM_MOUSEACTIVATE(MA_NOACTIVATE)
│   ├─ renderer: PNG(embedded)->premultiplied frames->DIB->UpdateLayeredWindowIndirect(ULW_ALPHA, dirty)
│   └─ state: MVP 片段表; Phase 2 behavior/scene 移植; position/renderer config 持久化
└─ shared: Arc<Mutex<NativeState>> + mpsc<Command>; AppHandle events -> content window
```

不变量：
1. 宠物链路上**不再出现 WebView2 透明窗口**；宠物窗口只有一层逐像素 alpha。
2. 设置/内容/AI 声明/同意页仍在 WebView2（普通不透明窗口），复用现有 `pet.html?shell=content` 路由。
3. native 模式启动时**默认不创建主 WebView2 窗口**（省内存、省进程）；首次启动/同意流程在 Phase 3 才切默认，Phase 1–2 默认 web 不受影响。
4. 所有持久化沿用既有存档槽/DPAPI/原子写；native 新增文件只放窗口位置与渲染器选择，不碰宠物存档格式（Phase 2 起才 parity 写宠物状态）。

---

## 4. 代码级设计草案

### 4.1 新模块与文件（Rust）

```text
app/tauri/src-tauri/
├─ src/native_pet/mod.rs        # 对外 API: spawn/status/commands; feature flag 解析; fallback
├─ src/native_pet/window.rs     # RegisterClassExW/CreateWindowExW/WndProc/message loop/DPI/position
├─ src/native_pet/render.rs     # DIB section, compose(premultiplied scale), UpdateLayeredWindowIndirect
├─ src/native_pet/assets.rs     # embedded index -> png decode -> premultiply -> LRU frame cache
├─ src/native_pet/anim.rs       # timing.json 解析; clip/frame scheduler; MVP 片段表
├─ src/native_pet/input.rs      # 点击/拖动/右键; WM_MOUSEACTIVATE; 菜单(Phase2)
├─ src/native_pet/config.rs     # renderer 选择/持久化/优先级; 位置保存(read_save/write_save 复用)
├─ src/native_pet/qa.rs         # --native-smoke: 自检/截图/WindowFromPoint/性能 JSON
├─ src/content_window.rs        # open_content_window 命令（当前缺失）+ capability/事件路由
├─ build.rs                     # 读 anim-contract.json, 生成 include_bytes! 索引到 OUT_DIR
└─ native-pet/anim-contract.json # 由 Node 脚本从 TS/timing.json/manifest.json 生成（跨语言契约）
scripts/native-pet-contract.mjs # 生成/--check 上面的契约
scripts/qa/native-pet-probe.ps1 # Windows 验收探针（窗口/exstyle/截图/穿透/CPU/RSS）
```

### 4.2 窗口创建与 WndProc（骨架）

```rust
// src/native_pet/window.rs
const CLASS: &str = "FamlingPetWindow";

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,          // 点击不抢焦点
        WM_LBUTTONDOWN => {
            ReleaseCapture();
            // OS 模态移动循环；结束后 WM_EXITSIZEMOVE 里保存位置
            SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION as WPARAM, 0); 0
        }
        WM_RBUTTONUP => { request_open_content(None /*settings*/); 0 }
        WM_EXITSIZEMOVE => { persist_position(hwnd); 0 }
        WM_DPICHANGED => { on_dpi_changed(hwnd, lp); 0 }
        WM_TIMER => { advance_frame_and_present(hwnd); 0 }
        WM_PAINT => 0,                                          // 全部由 ULW 呈现
        WM_DESTROY => { PostQuitMessage(0); 0 }
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

fn create() -> Result<HWND, String> {
    let ex = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
    // 标题必须保持 tauri.conf/main.rs 的现有常量，单实例 FindWindowW 召回才命中
    let hwnd = unsafe { CreateWindowExW(ex, CLASS, "Famling · 汀岚", WS_POPUP,
        0, 0, 96 * scale(), 96 * scale(), null_mut(), null_mut(), GetModuleHandleW(null), null()) };
    if hwnd.is_null() { return Err(last_error()); }
    SetTimer(hwnd, TIMER_ANIM, frame_delay_ms, null()); // 8–12 FPS 心跳
    Ok(hwnd)
}
```

要点：
- WS_EX_LAYERED 的命中测试由系统按 shape/alpha 自动处理：**alpha=0 的区域鼠标消息直接穿过**（[公开] Layered Windows 文档：「Hit testing of a layered window is based on the shape and transparency of the window... alpha value is zero will let the mouse messages through」）。因此不需要 WM_NCHITTEST 手写命中、更不需要 60ms 轮询。
- WS_EX_NOACTIVATE/MA_NOACTIVATE：点击宠物不抢当前输入焦点；代价是键盘无可达性（见风险 R7）。
- 拖动用 `ReleaseCapture + WM_NCLBUTTONDOWN(HTCAPTION)` 走 OS 移动循环（平滑、与系统一致）；不要用 JS/Tauri `startDragging`。

### 4.3 合成与呈现（骨架）

```rust
// src/native_pet/render.rs
struct Surface { hdc_mem: HDC, hbitmap: HBITMAP, bits: *mut u8, w: u32, h: u32 }

fn compose(surface: &mut Surface, frame: &Frame /*96x96 premult BGRA*/, scale: u32, ox: i32, oy: i32) {
    for sy in 0..96 {
        for sx in 0..96 {
            let px = frame.pixel(sx, sy);           // [B,G,R,A]，A 已预乘
            if px[3] == 0 { continue; }
            for dy in 0..scale { for dx in 0..scale {
                let (x, y) = (ox + (sx * scale + dx) as i32, oy + (sy * scale + dy) as i32);
                surface.write_px(x, y, px);          // 最近邻，整数倍，不模糊
            }}
        }
    }
}

fn present(hwnd: HWND, surface: &Surface, dirty: RECT) {
    let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER, BlendFlags: 0,
        SourceConstantAlpha: 255, AlphaFormat: AC_SRC_ALPHA };
    let info = UPDATELAYEREDWINDOWINFO {
        cbSize: size_of::<UPDATELAYEREDWINDOWINFO>() as u32,
        hdcDst: null_mut(), pptDst: null(), psize: null(), hdcSrc: surface.hdc_mem,
        pptSrc: &POINT { x: 0, y: 0 }, crKey: 0, pblend: &blend,
        dwFlags: ULW_ALPHA, prcDirty: &dirty,
    };
    unsafe { UpdateLayeredWindowIndirect(hwnd, &info); }
}
```

- 预乘公式：`p = straight * alpha / 255`（PNG 直通 alpha → 预乘 BGRA 必须自己算；GDI 缩放会清零 alpha，禁止用 `StretchBlt`）。
- 脏矩形 = 当前帧 alpha 包围盒 ∪ 上一帧包围盒，避免全窗每秒 12 次无谓拷贝；ULW 本身是「内容推给 DWM」，移动窗口无需重推。

### 4.4 资产管线与跨语言契约

```text
public/assets/pet/anim/timing.json + <char>/manifest.json
        │ (node --import tsx scripts/native-pet-contract.mjs --write)
        ▼
app/tauri/src-tauri/native-pet/anim-contract.json   # checked in, CI --check 防漂移
        │ (build.rs 读契约, 生成 OUT_DIR/pet_assets.rs: include_bytes! + 索引)
        ▼
native_pet::assets: 启动解码 idle 8 帧(同步, <20ms) → 后台线程解码其余帧 → 预乘缓存
```

契约 JSON 字段（示意）：`{"contractVersion":1,"characters":[{"id":"dog","clips":[{"id":"idle","frames":8,"fps":8,"holdsMs":[...],"loop":true}],"frames":[{"clip":"idle","index":0,"asset":"dog/idle/idle_00.png","sha256":"...","bytes":2820}]}]}`。CI 用 `--check` 校验它与 TS `timing.ts/manifest.ts` 的 expectedAssets/时长一致；Rust 单测再校验解码后的帧数与契约一致。这样「TS 是契约源、Rust 是消费者」，不会出现两套手写帧表。

### 4.5 动画调度与 MVP 片段

- 使用 `WM_TIMER`（8–12 FPS 足够；误差 ±15ms 可接受）或高精度 `CreateWaitableTimerEx`（后续如需要）。每帧从 `GetTickCount64` 推 next-frame，避免累计漂移。
- MVP 片段（来自现有 timing/manifest，不改美术）：`idle`（8 帧循环）、`idle_blink`（随机微动作，10–20 s 一次）、`pat_head`（点击）、`drag`（拖动中 loop）+ `land`（落下 1 次）。不需要行为状态机即可交付「活的桌宠」。
- 交互→片段：点击（opaque 区域）→ pat_head → 回 idle；拖动开始 → drag，结束 → land；右键 → 打开设置/内容窗口；静置 → 保持 idle（Phase 2 再加 sleep/wake/walk/roam）。

### 4.6 设置/内容窗口（补齐缺失命令）

前端已存在调用（[仓] `src/pet/content-window.ts:125,128` 与 `OPEN_CONTENT_WINDOW_COMMAND`），Rust 端需新增：

```rust
#[tauri::command]
fn open_content_window(app: tauri::AppHandle, route: String) -> Result<(), String> {
    let route = if route == "settings" { "settings" } else { "content" };
    if let Some(win) = app.get_webview_window("content") {
        let _ = win.show(); let _ = win.set_focus();
        let _ = win.emit("content-window://navigate", route);   // 复用 content-window.ts 事件
        return Ok(());
    }
    // Tauri window 创建需主线程；命令内用 run_on_main_thread + oneshot 回传结果
    build_content_window(&app, route)   // WebviewWindowBuilder("content", pet.html)
        // .title("内容与设置 · Famling") .inner_size(960,720) .min_inner_size(720,480)
        // .initialization_script("window.__CONTENT_WINDOW_ROUTE__='settings'")
}
```

配套：新增 capability `capabilities/content.json`（windows:["content"]，最小 core:default + 所需 window 权限）；若语音 PTT 后续仍在 WebView2，`on_permission_request` 的 Microphone 白名单需从 `label=="pet"` 扩到 `content`。

### 4.7 DPI / 定位 / 多屏

- 启动定位：`MonitorFromPoint/SystemParametersInfoW(SPI_GETWORKAREA)` 取主屏工作区，右下角内缩 12 px（沿用 `place_bottom_right` 语义，但改原生物理像素）。
- `WM_DPICHANGED`：按系统建议矩形移动，同时把窗口尺寸重设为 96×s（s 按新 DPI 取整），重画当前帧；不要接受系统给的小数缩放尺寸。
- 位置持久化：新增存档槽 `native-pet-window`（JSON：`{x,y,scale,rendererVersion}`），复用 `write_save/read_save` 的 safe_slug + tmp+rename；多屏负坐标按物理像素存。旧版 localStorage 位置不迁移（native 首启回右下角，web 回滚时旧位置仍在）——作为已知/可接受行为写入发布说明。
- 全屏/勿扰：native 线程每 2 s 复用 `SHQueryUserNotificationState` 逻辑（抽成 Rust 函数），全屏/演示时隐藏，退出后恢复；低打扰/隐藏时段 Phase 2 接设置。

### 4.8 Feature flag / 回退 / 配置

优先级（高→低）：命令行 `--pet-renderer=` > 环境变量 `FAMLING_PET_RENDERER` > `%APPDATA%\com.perrylink.famling\native-pet.json` 的 `renderer` > 编译期默认（Phase 1–2=`web`，Phase 3 起可为 `native`）。
- `native`：不创建主 WebView2 窗口；创建 native 窗口；设置窗按需创建。
- `web`（默认）：完全走 0.2.3 旧路径，行为/性能不回归（保 rollback）。
- `dual`：仅 debug/QA 构建有效：左右并排同时显示 web 与 native（web 侧禁存档/禁语音，避免双写），用于逐帧对比与人工验收；发布版忽略该值。
- **失败回退**：native 初始化任何 Err（CreateWindow/DIB/ULW/资产解码）→ 写本地日志 `%APPDATA%\Famling\logs\native-pet.log`（截断 64 KB、无用户路径）→ 本次运行降级 web → 不弹错误、不阻塞启动；下一次启动仍尝试 native（除非配置已改为 web）。
- `set_pet_renderer`/`get_pet_renderer_status` Tauri 命令供设置页读写；改后提示需重启生效（Phase 2 加设置 UI，Sprint 内先用 CLI/配置文件）。

### 4.9 持久化边界（重要）

- **Sprint/MVP 不写宠物存档**：native 只展示动画与窗口位置；摸头不改 bond（web 模式才改）。这样避免在渲染层重写的同一迭代里碰加密存档，风险最低。
- **Phase 2 再 parity**：宠物状态在 TS（`src/kernel/pet.ts`、`src/pet/save-runtime.ts`，envelope v2 `{format:'dsh-save',version:2,gameId:'pet',gameVersion,savedAtMs,cipher}`，DPAPI 由 Rust `protect_text/unprotect_text` 完成）。移植到 Rust 的路径：先用现有命令读写同一槽做只读展示，再移植 `patPet/givePaper` 等纯函数与 30s autosave 语义；用同一份 golden fixtures 校验 envelope/密文行为，保证 web 回滚可读。估算 3–5 人日，排在 Phase 2。

---

## 5. 集成点与文件地图

### 5.1 现有文件改动（路径相对 `repos/famling`）

| 文件 | 现状/位置 | 改动 | 阶段 |
|---|---|---|---|
| `app/tauri/src-tauri/src/main.rs` | 734 行；窗口/托盘/单实例/命中轮询/命令注册集中在 585–734 | 渲染器选择；native 线程 spawn/停止；托盘召回改 HWND 路径；主窗口按 renderer 创建；新增命令 `open_content_window/set_pet_renderer/native_pet_status`；native 模式 `RunEvent::ExitRequested` 防退出 | P1 |
| `app/tauri/src-tauri/Cargo.toml` | windows-sys 0.61 features 24 行 | 增加 `Win32_Graphics_Gdi`、`Win32_UI_HiDpi`；新增 `png = "0.18"`（+ build-dependencies） | P1 |
| `app/tauri/src-tauri/build.rs` | 现仅 tauri-build | 生成资产 include 索引（读 `native-pet/anim-contract.json`） | P1 |
| `app/tauri/src-tauri/tauri.conf.json` | 13–27 行 main 窗口 | native 模式不自动创建/首帧隐藏；窗口尺寸改由 native 决定（web 模式保持 480×336）；bundle 不加新资源（帧嵌入 exe） | P1 |
| `app/tauri/src-tauri/capabilities/default.json` | windows:["main"]；含 ignore-cursor/background-color 权限 | 仅 web 窗口需要；新增 `content.json`（windows:["content"]，最小权限） | P1 |
| `src/pet/content-window.ts` | 125/128/280 行调用 `open_content_window` | 无需改（Rust 补齐命令即可）；native 模式下设置入口走同一命令 | P1 |
| `src/pet/main.ts` | 2502 行；contentWindowMode 238 行 | 不改核心；Phase 3 移除 native 模式的 pet 页启动路径时可加守卫 | P3 |
| `src/pet/hit-regions.ts` + `src-tauri/src/main.rs:238–288` | JS 250ms 区域同步 + Rust 60ms 轮询 | native 模式旁路/禁用；web 模式保留；Phase 3 删除 | P3 |
| `src/pet/desktop-shell.ts` / `pet-window-dock.ts` / `edge-dock.ts` | 2821 行 startDragging、dock 逻辑 | native 模式不加载；Phase 2 用 Rust 实现位置/贴边后冻结 | P3 |
| `src/pet/hero-runtime.ts` / `render/**` / pixi.js | web 渲染器 | 保持 web fallback；Phase 3 后进入维护冻结，0.5 再评估删除 | P3/延后 |
| `.github/workflows/build-windows.yml` | 143 行，现有构建/校验/打包 | 新增 `cargo fmt/clippy/test`、contract --check、native smoke、BUILD-INFO 增 renderer 字段、tag 门禁 | P0/P1 |
| `package.json` / `package-lock.json` / `Cargo.lock` | 0.2.3 | 版本号按发版计划同步（0.2.3→0.3.0-beta.1→0.4.0）；Cargo.lock 只增 windows-sys feature/png 直依 | P1/P3 |
| `CHANGELOG.md` / `README.md` / `docs/STATUS.md` / `app/tauri/README.md` | 0.2.x | 记录 native renderer、开关、限制、回滚；app/tauri/README 里「scaffold only/本机无 Rust」已过时需重写 | P1/P3 |
| `docs/legal/**` / `LICENSES.md` / `THIRD-PARTY.md` | DRAFT/现有清单 | 新增 rust crate 许可条目；确认 native 无新增 AI 内容/无新数据收集；不改变 unsigned/无 updater 状态 | P3 |

### 5.2 新文件（建议）

| 文件 | 用途 | 阶段 |
|---|---|---|
| `app/tauri/src-tauri/src/native_pet/*.rs`（mod/window/render/assets/anim/input/config/qa） | 原生宠物窗口实现 | P1 |
| `app/tauri/src-tauri/src/content_window.rs` | 补齐 `open_content_window` 命令 | P1 |
| `app/tauri/src-tauri/native-pet/anim-contract.json` | TS↔Rust 动画契约（生成物，CI --check） | P1 |
| `scripts/native-pet-contract.mjs` | 生成/校验契约 | P1 |
| `scripts/qa/native-pet-probe.ps1` | 验收探针：窗口/exstyle/截图/穿透/CPU/RSS/DPI | P1 |
| `docs/native-pet/NATIVE-PET-WINDOW.md` + `docs/plan/ADR-NATIVE-PET-WINDOW-2026-11-25.md` | 架构/运维/决策记录 | P0/P1 |
| `work/native/research/05-migration-plan.md` | 本文件 | 本次 |

### 5.3 关键集成点（按调用链）

1. **启动**：`main.rs:585` `main()` → 解析 renderer → `ensure_single_instance()`（单实例互斥不变）→ `tauri::Builder::setup`：web 路径创建/显示现有窗口；native 路径不创建 WebView2 主窗，spawn native 线程 + 托盘 + 全屏监视；若 Tauri 在无窗口时触发 `ExitRequested`，用 `api.prevent_exit()` 保活（tray-only 模式，[公开] tauri discussion #11489；Sprint 必测）。
2. **托盘/召回**：`main.rs:188–235` 的 show 菜单 → 新 `recall_pet()`：web 走原 `recall_pet_window`；native 用全局 `NativeHwnd(AtomicIsize)` + `IsWindow/ShowWindow/SetWindowPos(HWND_TOPMOST)/SetForegroundWindow`（NOACTIVATE 下前台行为需实测，必要时只 show+topmost）。退出菜单 `app.exit(0)` 前向 native 线程 PostMessage 停止定时器。
3. **单实例**：`main.rs:143–185` 的 `FindWindowW` 按标题召回；native 窗口保持标题 `Famling · 汀岚`（无边框不可见，但 FindWindow 命中），或改为读全局 HWND（更稳）——两者都保留。
4. **设置/内容**：右键/托盘/托盘菜单 → `open_content_window(route)`；复用 `content-window.ts` 的 `content-window://navigate` 事件与 `__CONTENT_WINDOW_ROUTE__` 初始化脚本。
5. **存档**：位置用 `write_save/read_save` 新槽（main.rs:373–472）；宠物状态 Phase 2 再 parity（见 4.9）。DPAPI 命令 `secret.rs` 不动。
6. **崩溃**：`install_crash_hook`（main.rs:34–140）继续覆盖全进程；native 线程每帧入口 `catch_unwind`/错误计数，禁止 `unwrap` 在渲染/消息循环里；崩溃报告格式不变、仍本地。
7. **全屏/勿扰**：`is_fullscreen()`（main.rs:475）逻辑抽成可复用函数，由 native 线程 2s 轮询；web 路径保持 JS 调用不变。
8. **权限**：`on_permission_request`（main.rs:591）当前仅 `label=="pet"` 放行麦克风；native 模式若 PTT 仍走 content 窗口，需扩展到 `content`（Phase 2/3，除非 PTT 暂时禁用）。
9. **前端设置 UI**：Phase 2 在现有设置面板加「渲染引擎（实验：原生 / Web）」+ 重启提示，调用 `set_pet_renderer`；Sprint 内用 CLI/配置文件即可。
10. **dsh-famling/Advisers**：本迁移不改插件；宠物窗不再显示 Pet Brief 时应作为「功能降级」写进 0.3.0-beta 发布说明，Phase 2 再由 Rust 直接读 `read_advisers_brief` 同文件并显示状态。

---

## 6. 分阶段迁移计划

### 6.0 工期总表（1 工程 + AI，±50%；装本地 Rust 取下限）

| 阶段 | 内容 | 人日 | 日历（含等待/并行） | 可压缩点 |
|---|---|---|---|---|
| Phase 0 | 基线冻结/分支开关/工具链/ADR | 2.5–3.5 | 3 天 | 基线是硬前置；工具链可与 P0.2 并行 |
| Phase 1 | 最小原生 MVP（§7 Sprint） | 10–12 | 2 周 | 片段只留 4 个；右键先直接开设置窗 |
| Phase 2 | 对等/双跑 beta | 12–18 | 3–4 周 | 气泡文字可后置到 0.4.x，但默认切换前 AI 标识必须可达 |
| Phase 3 | 默认切换/退役/发布 | 8–12 | 2–3 周 | web 代码物理删除可延到 0.5.0 |
| **合计** | | **32.5–45.5（预算 35–40）** | **7–9 周** | 纯 CI 环 +25–40%；裁掉 Phase 2 对等项可提前，但默认切换随之延后 |

### Phase 0 — 基线与护栏（2.5–3.5 人日，日历 3 天）

| 步骤 | 内容 | 验收 |
|---|---|---|
| P0.1 冻结基线 | owner 将当前 0.2.3 工作树（157 M + 12 ??）提交并打 tag；本地/远端一致 | 干净 checkout 可复现 0.2.3 构建；CI 从 tag 构建成功 |
| P0.2 分支/开关骨架 | 分支 `feat/native-pet-window`；`--pet-renderer`/env/config 优先级；默认 web；无视觉变化 | 两种值都能启动到现有 web 行为；坏值安全回退 |
| P0.3 工具链 | 本地装 rustup+VS Build Tools（推荐）或确认 CI-only；CI 加 `cargo fmt --check/clippy/test`（crate 未改也能跑通） | 本地 `cargo check` 或 CI job 绿；记录反馈环耗时 |
| P0.4 文档/ADR | 本文件 + ADR + 风险登记入库；`docs/STATUS` 记录计划 | 评审通过，owner 确认 Sprint 范围 |

**Exit gate**：干净基线上分支可构建；默认 web 无回归；工具链/CI 可编译 Rust；ADR 批准。

### Phase 1 — 最小原生覆盖层 MVP（10–12 人日，2 周 Sprint，见 §7）

范围：Win32 分层窗口 + idle/blink/pat/drag 4 片段 + 点击/拖动/右键设置 + 托盘召回/单实例/全屏隐藏 + 位置持久化 + 渲染器开关/回退 + 双跑台架 + CI smoke + 指标。
**Exit gate（go/no-go Phase 2）**：见 §7 验收；8 小时 soak 无黑框；100/150/200% DPI 通过；web 模式零回归；fallback 实测有效；CI 绿。

### Phase 2 — 对等与双跑 beta（12–18 人日，3–4 周）

- 行为/场景移植：`src/pet/character/behavior.ts`（192 行，纯函数/确定性 mulberry32）+ `src/pet/scene/runtime.ts`（836 行，注释即声明 headless/deterministic/no DOM）→ Rust；用现有 TS 逻辑生成 golden traces（`node --import tsx`，公开仓可直接跑）做跨语言回放断言。
- 片段对等：idle_blink/stand_wag/sleep/wake/remind/talk/pat/drag/land 等（按 `timing.json` 全表，先主线 10–12 个，其余随场景）。
- 气泡文字：DirectWrite/D2D 或 GDI mask 方案 spike（2–3 d）；中文/200% DPI 清晰、AI 标识行随文字显示；不允许用透明 WebView2 替代。
- 设置面板加渲染器开关 + 重启提示；低打扰/hide-for/勿扰/全屏；reduce-motion。
- Pet Brief/DSH 只读状态；宠物状态存档 parity（envelope v2 + DPAPI + golden fixtures，web 回滚可读）。
- QA：24h soak、DPI 全矩阵、多屏/混合 DPI、安装/便携/覆盖升级/卸载、回滚演练。
- 发布 0.3.0-beta.1（native opt-in、web 默认、unsigned、无 updater）。

**Exit gate**：对等清单全绿（交互/设置/AI 标识/同意入口/低打扰/存档）；24h 无 P0/P1；回滚演练通过；beta 用户反馈无黑框类问题；owner 批准 0.4.0 默认切换。

### Phase 3 — 默认切换与退役（8–12 人日，2–3 周）

- 首启/同意流程：native 默认时，首次启动打开 content 窗口完成 TOS/年龄/语音同意与 AI 声明，同意后启动 native 宠物（或首启强制 web，完成同意后下次 native）；不得绕过任何现有 consent 门。
- 默认切 native（0.4.0）；保留 web renderer 一个发布周期（0.4.x）；移除 transparent 主窗口分支/配置、hit-region 同步与 Rust 轮询、ignore-cursor/background-color 权限、透明 WebView2 补丁说明；更新文档/STATUS/README/CHANGELOG/legal 复核。
- 打包/版本：BUILD-INFO 记录默认 renderer；portable zip 增 native 运维说明；许可证/THIRD-PARTY 增 crate；unsigned/无 updater 口径不变。
- 回滚演练后发布；0.5.0 再删除 web 宠物窗口代码与 hero/pixi 渲染路径（若确认不再需要）。

**Exit gate**：默认 native 内测 2 周 0 黑框/0 崩溃；回滚 drill 通过；法务对 AI 标识/同意可达性复核无新增 P0；发布批准（仍 unsigned）。

### 6.1 双跑（dual-run）机制

双跑分三层，必须同时具备，避免「一次切换、无法比较/回退」：

| 层 | 形态 | 用途 | 实现 |
|---|---|---|---|
| L1 开发并排 | debug/QA 构建 `--pet-renderer=dual`：同一桌面左 web、右 native 同时显示，两窗禁存档/禁语音（避免双写） | 逐帧像素对比、人工验收、录屏证据 | 复用旧窗口 + native 窗口；release 构建忽略该值（或仅 `cfg!(debug_assertions)`） |
| L2 运行时切换 | 同一发布二进制通过 CLI/env/配置文件在 web/native 间切换（重启生效） | beta 用户 opt-in、客服排障、灰度 | §4.8 的优先级链 + 持久化 config + 自动回退 |
| L3 发布级 A/B | 0.3.0-beta 起同版本双 renderer：默认 web、native opt-in；收集本地诊断（不联网）后决定 0.4.0 默认 | 风险控制、指标对比（CPU/RSS/首帧/黑框报告） | 发布说明 + 设置开关 + probe JSON 本地导出 |

双跑纪律：① web 路径代码在 Phase 1–2 **冻结**（只允许必要 bugfix，不允许顺手重构）；② 双跑期间两套渲染器的行为差异必须列清单（§13），不允许「看起来一样」；③ native 自动回退事件必须计数并写入本地日志，作为灰度决策证据。

### 6.2 分支与 PR 策略

- `feat/native-pet-window` 长分支（或按模块短分支合入长分支）；**MVP 在主分支后置 flag 合入**（小步、默认 web，随时可删）。
- 建议 PR 切分：① flag/config/fallback；② window+render+smoke；③ assets/anim/contract；④ input/drag/tray；⑤ content_window+capability；⑥ CI/QA probes；⑦ docs。每个 PR < 800 行、附 [仓] 证据/测试。
- 每 PR 必过：npm typecheck/build、FCI 校验、cargo fmt/clippy/test、contract --check；tag/nightly 跑 GUI smoke。

---

## 7. 前两周 Sprint 建议（推荐起点）

**目标（Sprint Demo）**：在真实 Win11 桌面上，用同一 0.3.0-dev 二进制加 `--pet-renderer=native` 启动：右下角出现原生宠物（idle 呼吸/眨眼），点击摸头、按住拖动、右键打开设置/内容窗口；透明区域点击穿透桌面；托盘可召回/退出；单实例生效；位置重启保留；**全程无黑框/黑条**；同一二进制 `--pet-renderer=web` 行为与 0.2.3 一致；CI 有 cargo 测试 + GUI smoke + 契约校验；产出一页指标报告（CPU/RSS/首帧/帧耗时/穿透探针）。

| 天 | 任务 | 产出/验收 |
|---|---|---|
| D1 | owner 提交 0.2.3 基线并 tag；开分支；装 Rust+VS BuildTools（并行）；渲染器 flag/config/fallback 骨架（默认 web） | 干净基线；`cargo check` 通过；flag 两种值可启动 |
| D2 | native 线程 + RegisterClass/CreateWindowEx + 消息循环 + 显示/隐藏 + 冒烟模式 | 窗口可创建；exstyle 含 LAYERED、不含 TRANSPARENT；可隐藏/退出 |
| D3 | DIB + 预乘测试图 + `UpdateLayeredWindowIndirect` + 脏矩形 | 屏幕出现正确 alpha 图案；无黑底；单帧 ≤0.5ms |
| D4 | 资产管线：contract.mjs + build.rs + png 解码/预乘/缓存 + idle 动画 + 整数缩放/定位 | 宠物 idle 播放；本机 DPI 下像素清晰 |
| D5 | idle_blink/pat/drag/land 调度；位置持久化（新 save 槽） | 片段切换正确；重启位置恢复 |
| D6 | 输入：点击命中（OS 自动）、拖动 HTCAPTION、WM_MOUSEACTIVATE、右键→content 窗口 | 穿透/摸头/拖动/设置入口全通 |
| D7 | 托盘召回 HWND 路径、单实例召回、全屏隐藏；Tauri 无窗口保活（ExitRequested） | 托盘/单实例/全屏行为通过 |
| D8 | 补齐 `open_content_window` + content capability；dual（debug）并排台架；web 回归冒烟 | 设置窗打开/聚焦/路由正确；web 无回归 |
| D9 | Rust 单测（契约/预乘/缩放/位置/flag）、CI（fmt/clippy/test + smoke job）、QA 探针脚本 | CI 绿；probe 输出 JSON 基线 |
| D10 | 验收跑：1h soak、DPI 100/150/200、拖动/召回/回退、指标报告、Demo + go/no-go | Sprint Exit gate 全绿，进入 Phase 2 决策 |

**Sprint 明确不做**：气泡文字、语音/PTT、内容中心、DSH brief、宠物状态存档写入、完整行为/场景、walk/roam/贴边、native 右键菜单（先直接开设置窗）、设置页渲染器 UI（用 CLI/配置）、默认切换、删除任何 web 代码、签名/updater。
**Sprint 风险预算**：若 D2–D3 出现阻塞（如 Tauri 无窗口保活/ULW+DPI 异常），立即启用 C# 台架并行定位（≤1 人日），并保持 web 默认不动；不得为赶进度把 native 设默认。

---

## 8. CI / 构建 / 测试门

### 8.1 CI 增量（在现有 `build-windows.yml` 上）

```yaml
      # 前端门保持: npm ci / typecheck / build / validate:character --strict
      - name: Native pet contract check
        run: node --import tsx scripts/native-pet-contract.mjs --check
      - name: Rust fmt + clippy + tests
        working-directory: app/tauri/src-tauri
        run: |
          cargo fmt --check
          cargo clippy --all-targets -- -D warnings
          cargo test
      - name: Tauri build (unsigned)
        working-directory: app/tauri
        run: npx --no-install tauri build
      - name: Native pet window smoke (Windows GUI session)
        run: ./app/tauri/src-tauri/target/release/famling-tauri.exe --pet-renderer=native --native-smoke
        # 断言退出码 0 + artifacts/native-smoke.json: window/exstyle/ULW/穿透/帧耗时/CPU/RSS
      - name: Package release files + SHA256SUMS + BUILD-INFO
        # 现有步骤；BUILD-INFO 增加 "default-renderer: web|native" 与 native 模块版本
```

说明：GitHub 托管 `windows-latest` 有桌面会话（headed Playwright/Windows UI 测试可用；[公开] Playwright CI 文档：“For Windows or macOS agents, no additional configuration is required”），但属于**无物理显示器的 headless 桌面**（[外部] FlaUI CI 经验），DWM 合成仍在；因此 GUI smoke 可行但列为 **nightly/tag 门**而非每个 PR 必过，避免 flaky。每个 PR 的硬门 = cargo fmt/clippy/test + contract check + 前端门。

### 8.2 本机/真机验收矩阵（不可用 CI 替代）

| 类别 | 内容 | 门 |
|---|---|---|
| DPI | 100/125/150/175/200%（单屏），像素边缘清晰、窗口锚点、命中点 20/20 | 必过，截图+probe JSON |
| 多屏 | 双屏/混合 DPI/负坐标/跨屏拖动、重启恢复 | 必过 |
| 穿透 | 透明角点 `WindowFromPoint`≠宠物 HWND；不透明中心=宠物 HWND；拖动/DPI 变化后立即复测 | 必过 |
| 稳定性 | 24h soak（每 30s 截图采样：无黑块/无窗口消失/无崩溃/RSS 漂移<10%）；1h 加速采样进 CI | 必过 |
| 交互 | 点击摸头、拖动、右键设置、托盘召回、单实例二次启动召回、全屏隐藏/恢复 | 必过 |
| 打包 | NSIS 安装/便携/覆盖升级/卸载残留、SHA256SUMS/BUILD-INFO | 必过 |
| 回滚 | `--pet-renderer=web`、配置切回、重装 0.2.3/0.3.0、旧存档可读 | 必过（演练记录） |

### 8.3 测试门分层（按阶段）

| 层 | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| 前端既有门 | 必过 | 必过 | 必过 | 必过 |
| cargo fmt/clippy/test | 骨架门 | 契约/预乘/缩放/位置/flag 单测 | 行为 golden trace 回放、存档 parity | 全量 |
| contract --check | 加门 | 必过 | 必过 | 必过 |
| GUI smoke（CI nightly/tag） | – | 窗口/exstyle/ULW/穿透/性能 JSON | + 帧序列截图比对 | + 首启同意流程 |
| 真机矩阵（本机） | – | DPI/穿透/1h soak | 24h/多屏/安装/回滚 | 全量 + 2 周 dogfood |
| Web 回归 | 现有冒烟 | 同二进制 web 模式 checklist | 0.3.0-beta 双跑 A/B | 0.4.0 保留回退验证 |

---

## 9. 打包 / 版本 / 发布

### 9.1 版本节奏

| 版本 | 内容 | 默认 renderer | 备注 |
|---|---|---|---|
| 0.2.3（现状） | 最后 WebView2 补丁版 | web | 冻结；作为回滚基线 |
| 0.3.0-beta.1 | Phase 1+2 的 native opt-in、web 默认 | web | tag `famling-pet-v0.3.0-beta.1`；CI 校验 tag==version；unsigned |
| 0.3.0（可选 GA） | 稳定性修复；native 仍 opt-in | web | 若 beta 反馈好但未达默认门槛 |
| 0.4.0 | 默认 native；web 作为回退保留 | **native** | 首启同意流程必须已接；发布说明写清回退方法 |
| 0.5.0（延后） | 删除 web 宠物窗/hero 透明路径 | native | 需重新评估 hero/pixi 是否还有用 |

版本文件（0.2.1 CHANGELOG 已列出的惯例）：`package.json`、`package-lock.json`、`app/tauri/src-tauri/Cargo.toml`、`Cargo.lock`（famling-tauri 条目）、`app/tauri/src-tauri/tauri.conf.json`；同步 `docs/STATUS.md`/README/CHANGELOG。

### 9.2 产物与打包

- 沿用 NSIS setup + portable zip + `SHA256SUMS.txt` + `BUILD-INFO.txt`；BUILD-INFO 增：`default-renderer`、native 模块开关、源 commit；仍 **unsigned、无 updater、无商店**（[仓] `docs/plan/ADR-UPDATER`、RELEASE-HANDLING 纪律不变）。
- native 资产嵌入 exe（build.rs include_bytes）：不加 bundle.resources、不改 installer 资源清单；预计安装包/便携包增大 ≤1.5 MB（三角色~1.1 MB PNG）。
- portable zip 增加 `docs/native-pet/NATIVE-PET-WINDOW.md`（如何切回 web、限制、已知问题）。
- Release notes 必写：native 是实验性开关（beta 期间）；无气泡/语音/内容中心；如何回退；仍 unsigned；AI 内容标识未变。

### 9.3 发布门（tag 工作流）

1. 干净 commit（`dirty=false`），CI 全绿（前端 + cargo + contract + GUI smoke）。
2. 双 renderer 冒烟：web 模式 0.2.3 回归 checklist；native 模式 Sprint/Phase 验收。
3. 回滚演练记录（上一版安装包 + `--pet-renderer=web`）。
4. 文档/许可/STATUS/CHANGELOG 更新；owner 批准（法务 DRAFT 不变、unsigned 披露）。
5. tag 命名与版本一致；SHA256SUMS/BUILD-INFO 生成并归档。

---

## 10. 回滚方案（分层）

| 层 | 触发 | 动作 | 验证 |
|---|---|---|---|
| L1 单次运行 | 用户/客服/排障发现 native 异常 | `famling-tauri.exe --pet-renderer=web` 或设 `FAMLING_PET_RENDERER=web` | 立即回到 0.2.3 行为，无需重装 |
| L2 持久配置 | 某机器/显卡/DPI 组合持续异常 | 设置页/配置文件写 `renderer:"web"` → 重启 | 启动日志记录 fallback 原因 |
| L3 自动回退 | native 初始化失败 | 进程内降级 web + 本地日志 + 下次重试 | 用户无感；不阻塞启动 |
| L4 版本回退 | 0.3.0/0.4.0 出现 P0 | 关闭 tag 发布、重发上一版安装包；用户手动覆盖安装（无 updater，同 identifier） | 旧存档可读（native 只新增槽，不改旧格式） |
| L5 数据回退 | 存档异常（Phase 2 后才可能） | 保留 `.bak`+既有恢复流程；禁止 native 在 recovery-pending 时轮转 backup（沿用 save-runtime 不变量） | 用 0.2.3 读取同一槽验证 |
| L6 发布撤回 | 已发布坏版本 | 撤 Release/替换 portable 链接、发布说明公告；无自动更新故无需服务器 kill switch | SHA256 黑名单 + 公告模板 |

回滚演练（Phase 2/3 必做）：装 0.4.0 native 默认 → 制造一次 native 初始化失败 → 验证自动回退；手动切 web；重装 0.3.0-beta/0.2.3 → 验证存档/位置/设置兼容；记录时间与步骤。

---

## 11. 风险登记

| # | 风险 | 等级 | 触发信号 | 缓解/应对 |
|---|---|---|---|---|
| R1 | 本机无 Rust/MSVC，CI 反馈环慢导致工期超支 | 高 | 每天阻塞 >2 次编译错误 | Sprint 前置装 rustup+VS BuildTools；PR 小步；CI cache；C# 台架本地验证 Win32 行为 |
| R2 | Tauri 无窗口时的生命周期/退出行为未验证 | 中高 | 启动即退出/托盘消失 | Spike S2：`RunEvent::ExitRequested + prevent_exit`（tray-only 模式）；失败则保留隐藏 1×1 宿主窗口（成本 ~50MB，仅过渡） |
| R3 | 逐像素命中依赖系统分层窗口语义 | 中 | 透明区仍吞点击/不透明区不响应 | 文档已确认 alpha=0 穿透；用 `WindowFromPoint` 探针在 Sprint D2 立即验证；失败回退 WM_NCHITTEST 手写 alpha mask（读帧 alpha），不改变其余架构 |
| R4 | WS_EX_NOACTIVATE 与右键菜单/桌面焦点冲突 | 中 | 菜单不消失/拖动异常 | `WM_MOUSEACTIVATE→MA_NOACTIVATE`；菜单用 `SetForegroundWindow+WM_NULL`（外部先例）；Phase 1 右键直接开设置窗，推迟 native popup 菜单 |
| R5 | 设置窗命令 `open_content_window` 缺失（现状） | 高（阻塞 native 可用性） | 设置按钮无响应 | Phase 1 D8 补齐命令+capability+事件路由；加集成测试（Tauri mock 或 smoke） |
| R6 | DPI/多屏下窗口尺寸/位置/命中错位 | 中高 | 200%/混合 DPI 边缘模糊、点击偏移 | 整数缩放 + WM_DPICHANGED + 物理像素定位；真机矩阵；不实现小数缩放 |
| R7 | 可访问性回归：native 无 DOM/无键盘焦点 | 中 | 键盘用户无法操作宠物/菜单 | 保留托盘/设置窗键盘路径；产品接受 native 宠物仅鼠标+托盘；记录 a11y 差异并在设置/About 提供等价入口；Phase 3 评估全局热键/键盘菜单 |
| R8 | 功能降级被误解为发布质量 | 中 | 用户反馈「不会说话/没有内容中心」 | 0.3.0-beta 明确 opt-in + 发布说明列缺失项；默认仍 web；Phase 2/3 逐项补齐才切默认 |
| R9 | 首启/同意/AI 标识在 native 默认后不可达 | 高（法务/产品） | 新装用户未过 TOS 就见到宠物 | Phase 3 首启流程先开 content 窗口完成同意/年龄/AI 声明；未完成不得启动 native；默认切换前置门 |
| R10 | 存档兼容/双写（Phase 2 移植状态时） | 中高 | 回滚后读档失败、native 写坏旧档 | 先只读、再 parity；golden fixtures；recovery-pending 不轮转 backup；web 回归读档测试 |
| R11 | 打包/CI 变慢或新增依赖许可问题 | 低中 | 构建 +>3min/包 +>2MB/许可清单缺失 | 帧嵌入可裁剪（按角色）；png 已在 lock；THIRD-PARTY 增条目；测量构建时间 |
| R12 | GitHub runner GUI smoke flaky | 中 | 随机失败 | 仅 nightly/tag 必跑；重试 1 次；核心断言用 JSON 而非截图相似度 |
| R13 | WebView2 透明回归在 web 回退路径仍存在 | 低（回退基线与 0.2.3 相同） | web 用户偶发黑框 | 回退即 0.2.3 同等风险；发布说明建议受影响用户使用 native |
| R14 | 外部先例/上游 issue 状态变化 | 低 | Tauri/WebView2 修复改变前提 | 本方案不依赖上游修复；issue 仅作根因证据 |
| R15 | 范围蔓延（气泡/语音/内容中心一次做完） | 高 | Sprint 每日新增需求 | §7 明确不做清单；Phase 门把关 |

---

## 12. 验收指标（可执行阈值）

| # | 指标 | 阈值 | 方法 | 阶段 |
|---|---|---|---|---|
| A1 | 黑框/黑条/残影 | 24h 内 0 次（采样 30s/次，透明区近黑像素异常=0） | `scripts/qa/native-pet-probe.ps1` 屏幕采样 + 截图归档 + 人工录屏复核 | P1 起 |
| A2 | 首帧 | 进程启动到宠物窗口可见 ≤350 ms（目标 250） | ETW/Stopwatch + 窗口可见时间戳；对照 web 基线 | P1 |
| A3 | 空闲 CPU | 60s 均值 ≤0.3% 单核（12 FPS 预算内） | `GetProcessTimes` 前后差 | P1 |
| A4 | 内存 | 私有 ≤60 MB；工作集 ≤120 MB；设置窗未开时 msedgewebview2 进程数=0 | Task Manager/Probe JSON | P1 |
| A5 | 帧合成 | 平均 ≤0.5 ms、p99 ≤2 ms（480×336 等效） | probe 计时 | P1 |
| A6 | 穿透 | 20/20 探针点正确；拖动/DPI 变化后立即复测仍 20/20 | `WindowFromPoint` + 点击沉底窗口 | P1 |
| A7 | DPI | 100/125/150/175/200% 无模糊（整数倍）、锚点正确、命中不偏移 | 真机矩阵 + 截图 | P1 |
| A8 | 交互 | 点击摸头/拖动/右键设置/托盘召回/单实例全部通过，召回 ≤500 ms | 手测 checklist + probe | P1 |
| A9 | 稳定性 | 24h 无崩溃/无窗口消失；RSS 漂移 <10% | soak 日志 + 进程监控 | P2 |
| A10 | web 回归 | 同二进制 `--pet-renderer=web` 与 0.2.3 行为一致；CPU/RSS 基线 ±10% | 对照 checklist + soak | P1–P3 |
| A11 | 包体/构建 | 安装包增量 ≤1.5 MB；构建时长增量 ≤3 min；SHA256/BUILD-INFO 齐全 | CI artifact 对比 | P1 起 |
| A12 | 回滚 | 自动回退 + CLI/配置/重装三条路径均 ≤5 min 恢复 | 回滚 drill 记录 | P2/P3 |
| A13 | 功能对等（默认切换前） | 见 Phase 2 对等清单全绿（交互/设置/同意/AI 标识/低打扰/存档/内容入口） | 逐项 checklist | P2/P3 |

---

## 13. 删除 / 冻结 / 延后清单

| 对象 | 处理 | 阶段 | 备注 |
|---|---|---|---|
| `tauri.conf.json` 480×336 透明 main 窗口配置 | 删除（web 回退模式保留到 0.4.x 后） | P3 | native 模式先运行时旁路 |
| `main.rs` 中 pet 透明 WebView2 创建分支（`--game=pet`/默认） | 冻结，P3 删除（保留 web fallback 一版） | P3 | 删除前确认回退需求消失 |
| `src/pet/hit-regions.ts` + `set_pet_hit_regions` + 60ms 轮询（main.rs:238–288） | native 模式旁路；P3 删除 | P3 | 逐像素命中已由 OS 提供 |
| capabilities 中 ignore-cursor / set-webview-background-color 等透明窗权限 | P3 清理（content 窗口不需要） | P3 | 与 web 删除同步 |
| WebView2 背景透明补丁/说明（0.2.3） | 随 web 宠物窗退役而删除 | P3 | 保留在 0.2.x 历史 |
| `desktop-shell.ts` 桌面壳缩放/布局、`pet-window-dock.ts`、`edge-dock.ts`、`hero-page/hero-runtime/render/pixi` | web 渲染专用：native 模式不加载；0.4.x 冻结；0.5 再评估删除 | P3/延后 | hero 还有设置窗预览等用途需核对 |
| 气泡文字/AI 标识/语音 TTS/ASR/PTT | 延后（native 首次默认前至少补气泡+AI 标识；语音可继续留在 content 窗口） | P2/P3 | R8/R9 门 |
| 内容中心/角色包安装/聊天导入/记忆簿 | 延后（继续在 content 窗口） | 延后 | 不属于窗口渲染迁移 |
| DSH Pet Brief / 状态投射 | Phase 2 只读接入（Rust 直接读同一 JSON） | P2 | 不改 dsh-famling |
| 漫游/贴边/多角色场景/native 右键菜单 | 延后 | P2/P3 | MVP 用固定位置 + 右键开设置 |
| macOS/Linux 原生窗口 | 不做 | – | 现有产品 Windows-only |
| updater/代码签名/商店 | 不做（沿用现有 ADR） | – | 与迁移正交 |

---

## 14. 需要 owner/lead 拍板的问题

1. **是否允许本机安装 Rust（rustup + VS 2022 Build Tools，2–3 GB）** 作为 Sprint 前置？不允许则按纯 CI 环排期（+25–40%）。
2. **基线冻结**：由谁把当前 0.2.3 工作树（157 M + 12 ??）提交并打 `famling-pet-v0.2.3` tag？分支必须从该 commit 起。
3. **接受 MVP 的功能缩减**（无气泡/语音/内容中心/存档写入，设置改为独立窗口）作为 0.3.0-beta 的 opt-in 范围？
4. **默认切换的版本与时点**：同意「0.3.0-beta 起 opt-in、0.4.0 默认 native」的节奏，还是要求 beta 前完成更多对等？
5. **可访问性口径**：native 宠物无 DOM/键盘焦点，仅托盘+设置窗键盘可达，是否可接受（需写入发布说明/About）？
6. **C# 台架**是否允许 1 人日时间盒（用于本地交互/DPI 行为验证，不交付）？
7. Phase 2 是否允许 native 直接读写宠物存档（需 golden fixtures + 回滚演练），还是先只读展示、存档写入永久留在 WebView2？
8. 0.5.0 是否删除 web 渲染器/hero/PixiJS（涉及体积与维护成本），还是长期双 renderer？

---

## 15. 附录

### A. 外部证据链接

- Win32 Layered Windows（命中测试/透明度语义）：https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features
- UpdateLayeredWindow：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-updatelayeredwindow
- UPDATELAYEREDWINDOWINFO（dirty rect）：https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-updatelayeredwindowinfo
- 进程 DPI awareness：https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process
- Tauri #16341（长时透明窗变黑，open）：https://github.com/tauri-apps/tauri/issues/16341
- Tauri #14764（透明窗 ghost 标题栏）：https://github.com/tauri-apps/tauri/issues/14764
- Tauri #14823（Win10 透明窗黑边）：https://github.com/tauri-apps/tauri/issues/14823
- Tauri #13070（逐像素点击穿透请求，未实现）：https://github.com/tauri-apps/tauri/issues/13070
- Tauri #6164（setIgnoreCursorEvents forward，open）：https://github.com/tauri-apps/tauri/issues/6164
- WebView2 #5752（Runtime 154 alpha=0 背景失效，open）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5752
- WebView2 #5492（透明窗伪影回归）：https://github.com/MicrosoftEdge/WebView2Feedback/issues/5492
- Wails #5229（resize 后点击穿透）：https://github.com/wailsapp/wails/pull/5229
- Wails #5371（layered 命中区域/NOACTIVATE）：https://github.com/wailsapp/wails/pull/5371
- Tauri tray-only 应用保活讨论：https://github.com/orgs/tauri-apps/discussions/11489
- winit EventLoop 主线程/单次限制：https://docs.rs/winit/0.29.15/winit/event_loop/struct.EventLoopBuilder.html
- Tauri 2.12 window 模块（WindowBuilder unstable）：https://docs.rs/tauri/latest/tauri/window/index.html
- windows-sys 0.61 Gdi 模块：https://docs.rs/windows-sys/0.61.0/windows_sys/Win32/Graphics/Gdi/index.html
- Playwright CI（Windows/macOS headed 无需额外配置）：https://playwright.dev/docs/ci
- GitHub Actions Windows GUI 测试经验（headless 桌面会话）：https://chrismalpass.net/posts/flaui-github-actions-cicd/
- Win32 分层窗口桌宠实现（预乘 alpha/常驻表面/GDI 缩放坑）：https://juejin.cn/post/7703394427519877156

### B. 内部证据路径

- 迁移方向/根因评估：`PET-WINDOW-ARCHITECTURE-REVIEW.md`（根部，57 行）；副本 `famling-art-rebuild/work/research/PET-WINDOW-ARCHITECTURE-REVIEW.md`
- 0.2.3 黑条根因/修复：`FIX-2026-11-25-BUTT.md`；`famling-art-rebuild/work/research/FIX-2026-11-25-BUTT.md`
- 透明/穿透技术研究：`repos/famling/docs/research/PET-OCCLUSION-TECH-2026-11-18.md`（953 行；含 Tauri/WebView2 分层不兼容、拖动/DPI 根因、tile 统计）
- 缩放/DPI ADR：`repos/famling/docs/plan/ADR-SCALE-DPI-2026-11-20.md`
- updater/发布纪律：`repos/famling/docs/plan/ADR-UPDATER-2026-11-20.md`、`repos/famling/docs/plan/RELEASE-HANDLING-2026-11-17.md`
- 状态/CI/License：`repos/famling/docs/STATUS.md`、`CHANGELOG.md`、`LICENSES.md`
- Windows 验收基线（私有仓）：`repos/desktop-games/docs/research/REMAINING-WINDOWS-QA.md`（WebView2 5 分钟 soak 218.6→221.2 MB/7 进程；DPI 矩阵）
- 关键源码锚点：`repos/famling/app/tauri/src-tauri/src/main.rs:23,143–185,188–235,238–288,373–472,475,585–734`；`tauri.conf.json:13–27`；`capabilities/default.json`；`src/pet/hit-regions.ts`；`src/pet/content-window.ts:125,128,280`；`src/pet/main.ts`；`src/pet/scene/runtime.ts`（headless 声明）；`src/pet/character/behavior.ts`；`src/pet/anim/timing.ts|manifest.ts|clips.ts`；`src/kernel/pet.ts`；`src/pet/save-runtime.ts`
- CI/构建：`repos/famling/.github/workflows/build-windows.yml`；`repos/famling/app/tauri/README.md`（「scaffold only/无 Rust」段已过时）

### C. 本机探测记录（2026-11-25，可复跑）

- 工具链：`cargo/rustc/dotnet/msbuild/cl/link = 无`；`csc = C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe（存在）`；`WebView2 = 153.0.4234.48`；OS = Windows 11 build 26300。
- C# 探针（临时目录，已删除，不随交付）：`csc /nologo /target:exe /optimize+ LayeredProbe.cs` 退出码 0；CreateWindowEx exstyle=`0x8080088`（LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE）；首次 ULW ok=True err=0；300 iter @480×336 avg 0.173ms（min 0.023，max 0.158，含 1px SetWindowPos）；200 iter @720×504 avg 0.174ms（min 0.035，max 0.793）；PNG 96×96 System.Drawing 解码 4.51ms。
- 限制：探针窗口**未 ShowWindow**，只测 Win32 alpha 合成/提交 API 成本，**不代表 DWM 上屏后的真实 FPS/CPU**；上屏/命中/DPI 需真机 + C# 台架或 Rust spike 验证（Sprint D2–D3）。
- 基线仓库状态：`git rev-parse HEAD`=`origin/main`=`7462ef4a07575dae7f5193659f7158d8dc5fd988`；tags=0；status 169 行（157 modified + 12 untracked）；diff=157 files, +1301/−88。
- 资产统计：human 141 帧 360,744 B；cat 143 帧 349,231 B；dog 136 帧 392,127 B；`dist` 766 文件 3,899,693 B。

### D. 假设与限制

1. 本文件是**计划**，不含实现/实测上屏结果；所有「Rust 可行」以现有 CI 构建链与 Win32 API 文档为据，Sprint D2–D3 必须实机确认。
2. 时间/工期为 1 工程 + AI 辅助的估算（±50%），不含法务审批/签字等待、不含美术返工。
3. 不改变产品法务状态：unsigned、无 updater、DRAFT 文本、AI 模型许可 UNVERIFIED 均不变；native 不新增 AI 内容。
4. 默认切换（0.4.0）以 Phase 2 对等清单与法务/产品复核为前置，不可仅凭「技术可行」切换。
5. 并行研究 01–04（若存在）可能给出不同渲染/技术栈细节；本计划的窗口/迁移层结论不依赖其具体实现选型，但 Phase 1 实现前应与 04 技术栈结论对齐。

---

**结论**：按「Phase 0 护栏 → 2 周最小原生覆盖层 MVP（opt-in） → Phase 2 对等/双跑 beta → Phase 3 默认切换/退役」推进；Rust 在 Tauri 进程内实现 raw Win32 逐像素 alpha 分层窗口是唯一同时满足「零 IPC、可复用现有生命周期、无 WebView2 透明链」的方案；C# 与 Rust-via-CI 均可行，但前者只作本地台架、后者是交付路径。立即行动项：owner 冻结 0.2.3 基线并决定本地 Rust 安装，Sprint 按 §7 执行。
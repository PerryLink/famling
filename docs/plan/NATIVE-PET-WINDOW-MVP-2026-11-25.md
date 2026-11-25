# 原生桌宠窗口 MVP（2026-11-25）

## 结论

- 架构 A 的渲染层已落地为 **opt-in 原生窗口**：Tauri 单进程内新增 native-pet 线程，使用 raw Win32 `WS_EX_LAYERED|TOPMOST|TOOLWINDOW|NOACTIVATE` + `UpdateLayeredWindow(ULW_ALPHA)` + 预乘 BGRA DIB。
- 宠物链路不再经过 WebView2 透明窗：native 模式下主 Tauri 窗口隐藏，宠物由原生窗口绘制；设置/内容窗口的完整集成仍按研究计划 Phase 2 完成。
- 默认仍是 `web`，`--pet-renderer=native` 或 `FAMLING_PET_RENDERER=native` 才启用；native 初始化失败自动回退 web。

## 研究

- 五份研究报告见 `docs/research/native-pet-2026-11-25/`（技术栈、Tauri 集成、渲染器、平台验收、迁移计划）。
- 关键结论：winit/softbuffer/wgpu 在 Windows 拿不到逐像素 alpha；ULW 是唯一同时提供逐像素 alpha + OS 级 alpha=0 点击穿透 + 置顶 + 无撕裂的路径。
- C# csc 验证台用于本机 Win32 语义验证；发布仍走 Rust（CI 可构建）。

## 实现（MVP）

- `app/tauri/src-tauri/src/native_pet.rs`：窗口/消息循环、DPI 整数缩放、PNG 预乘、DIB/ULW、idle 动画、拖动（系统模态移动）、右键显示设置窗口。
- `build.rs`：把 `public/assets/pet/anim/**` 420 帧嵌入二进制，便携版仍是单 exe。
- `Cargo.toml`：`png` 直接依赖；`windows-sys` 增加 Gdi/HiDpi/LibraryLoader/KeyboardAndMouse features。
- `main.rs`：`--pet-renderer=native` / `FAMLING_PET_RENDERER`，`--pet-native-char=dog|cat|human`；启动失败回退 web。

## 本机已验证（2026-11-25）

- CI `build-windows-pet-only` 编译成功（branch `feat/native-pet-window`，run 45633025011）。
- 本机运行 `famling-tauri.exe --pet-renderer=native --pet-native-char=cat`：
  - 原生窗口 class=`FamlingNativePetWindow`，exstyle=`0x08080088`（LAYERED+TOPMOST+TOOLWINDOW+NOACTIVATE），192×192，右下角；
  - Tauri 主窗口 hidden；PrintWindow 可读回猫 idle 帧；
  - 6 帧捕获 hash 全不同，证明动画 timer 生效；
  - dog/human 也成功渲染；狗臀部接缝/浅色条在原生帧中不可见。
- 本机桌面当前锁屏，**DWM 实际桌面合成、点击穿透、DPI 切换仍需解锁后的真机验收**（研究报告 §验收矩阵）。

## 使用

```powershell
# 默认 web（0.2.3 行为）
famling-tauri.exe
# 原生渲染器实验
famling-tauri.exe --pet-renderer=native --pet-native-char=dog
# 或环境变量
$env:FAMLING_PET_RENDERER="native"; $env:FAMLING_PET_NATIVE_CHAR="cat"; famling-tauri.exe
```

## 尚未完成（Phase 2/3）

- 原生右/托盘/单实例召回统一到 native HWND；内容/设置窗口与 `open_content_window` 命令补齐；
- 更多片段（pat/drag/land、walk/roam）与行为/存档 parity；
- 全屏/勿扰、窗口位置持久化、多显示器/混合 DPI reassert；
- 24h soak、A/B 差分截图、DPI/会话/点击穿透真机矩阵；
- 版本化 beta/release 与默认切换。
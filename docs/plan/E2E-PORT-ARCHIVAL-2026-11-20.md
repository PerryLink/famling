# Tauri E2E 端口随机化与结果归档（E11 / task-133 · MB-114）

- 任务：task-133「E2E 端口随机化/结果归档（E11 MB-114）」；对应总清单 MB-114（E2E 卫生：profile/artifacts 清理、临时端口、临时 appdata）。
- 基线：`desktop-games` HEAD **`0a5bc0b12c366ff6325ee4b39336b2c5014d4389`**（2026-11-20）。
- 写入范围：`scripts/**`、`tests/**`、`docs/plan/**`；**未改** `src/**`、`app/tauri/**`、`pet.html`、`package.json`、插件仓；不 commit / 不 push。
- 真机口径：E2E 通过 WSL2 interop 调起 **Windows 原生 PowerShell 5.1 + Windows exe + WebView2 + Windows Node 24** 真实运行；不是 headless 浏览器替代、不是 fake DOM。
- **不伪造**：本文数字全部来自真实运行输出；release 通道未通过也如实归档为 `status: fail`，没有把 debug 运行写成 release 验收。

---

## 1. 变更前的三个具体问题

1. **固定 CDP 端口 9333**：`scripts/cdp-launch.ps1` 写死 `--remote-debugging-port=9333`，19 个 `scripts/cdp-*.mjs` 写死 `http://127.0.0.1:9333`。前一次运行残留的进程/端口会串台，无法并行，与「临时端口」验收项直接冲突。
2. **失败不落 JSON**：`scripts/e2e-tauri.ps1` 只有在所有步骤通过后才写 `artifacts/e2e-tauri.json`；任一步 throw 后没有结果文件，`artifacts/e2e-tauri.json` 长期不存在（MB-015/MB-114 的「未归档」）。
3. **探针与当前代码漂移**：`cdp-pet-portable.mjs` / `cdp-aquarium-save.mjs` 直接读真实 `%APPDATA%`（绕过 `DG_QA_DATA_DIR`，与隔离承诺矛盾）；`cdp-pet.mjs` 未过首启 TOS 门就点「折页簿」，`memoryRows=0` 假失败；`cdp-launch.ps1` 每个用例新建 WebView2 profile 但从不清理；`e2e-tauri.ps1` 依赖固定 `Start-Sleep 6`。

## 2. 本次实现

### 2.1 端口：每次启动一个临时端口（无 9333）

- 新增 `scripts/lib/cdp-endpoint.mjs`：
  - `cdpPort()` 只读 `DG_CDP_PORT`（1..65535），缺失/非法**报错而不是回退到旧固定端口**；
  - `cdpBase()` / `cdpTargets()` 给探针统一取 `/json`；
  - `appDataRoot()`：`DG_QA_DATA_DIR` 优先，缺省才回退真实 `%APPDATA%\com.perrylink.desktopgames`（手动运行兼容）。
- `scripts/cdp-launch.ps1`：
  - `-Port 0` 时用 `TcpListener(loopback, 0)` 让内核分配空闲端口；E2E 每用例传入自己选的新端口；
  - 设置 `DG_CDP_PORT` + `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<临时端口>`；
  - **就绪轮询**（`/json/version`，30s）取代固定 6s；再加 2s 首绘 settle，避免 reload 撞上半初始化的 target；
  - 启动前检测已存在的 `desktop-games-tauri.exe`（单实例插件会让新进程立即 exit 0），直接报错而不是假失败；
  - `finally` 中 `taskkill /T /F` + 仅按本次 profile 路径精确结束 `msedgewebview2.exe` + 有界重试删除 `artifacts/cdp-wv2-<guid>`（路径断言在 `artifacts/` 下）；node 退出码非 0 也会上抛。
- 19 个 `scripts/cdp-*.mjs` 全部改为 `await import('./lib/cdp-endpoint.mjs')`；`scripts/` 下不再出现 9333。

### 2.2 结果：任何结局都写 JSON，并归档到 `docs/plan/evidence/`

- `scripts/e2e-tauri.ps1` 重写为 `Invoke-Case` 逐用例执行：每个 case 独立选临时端口、独立记录 `cdpPort/durationMs/ok/error`；失败也继续走 `finally` 的隔离校验与清理。
- 结果 JSON 字段：`schema/kind/generatedAt/durationMs/status/error/channel/head/headShort/headDirty/dirtyFiles/exe{path,sha256,bytes}/node/host/cdp{mode,ports}/steps[]/results/isolation{qaDataDir,qaDataDirRemoved,realAppData,realAppDataUnchanged,error}/artifacts/limitations`。
- 每次运行都写两份：`artifacts/e2e-tauri.json`（gitignored 指针）+ `docs/plan/evidence/e2e-tauri-<head7>-<UTC>-<channel>.json`（可提交证据）。
- `channel` 由 exe 路径是否为 `target\debug` 推导（`debug`/`release`），**debug 运行不会被写成 release 验收**。
- 保留原有隔离契约：临时 `DG_QA_DATA_DIR`、真实 `%APPDATA%` 前后 SHA-256 快照、fail-closed、finally 清理。

### 2.3 探针与真实 TOS 门

- `cdp-pet-portable.mjs`、`cdp-aquarium-save.mjs` 改用 `appDataRoot()`；E2E 下只读 `DG_QA_DATA_DIR`，不再碰真实存档。
- `lib/cdp-endpoint.mjs` 新增 `acceptTosIfPrompted(send)`：在临时 profile 的首启 TOS 弹窗上**真实点击 checkbox + accept 按钮**（与人类路径相同），再继续断言；`cdp-pet.mjs` / `cdp-pet-portable.mjs` 在启动后调用。没有它，`memory-open` 等 guarded action 会按设计拒绝，导致假失败。

## 3. 真机实测证据

### 3.1 debug / demo 页面集：**PASS 11/11**

- 命令：先 `npm run build:demo`（E2E 使用 `index.html` + aquarium/stall/town 等 demo 路由），再 Windows `cargo build --features custom-protocol`（debug），最后 `scripts/e2e-tauri.ps1 -Exe <debug exe>`。
- exe：`app/tauri/src-tauri/target/debug/desktop-games-tauri.exe`（25,948,160 B，sha256 `78d69ffc96435ef43208767871403e1d43eb7118223fdbb27e99490b09301be4`）。
- 证据：`docs/plan/evidence/e2e-tauri-0a5bc0b-20261120T044709Z-debug.json`（sha256 `3b905e3c1ae29a59263a5b77ab9905d11adc161e9d75507913974c04b5f66739`，18,544 B）。
- 11 个用例全绿（每个用例一个不同临时端口）：`page/save/fullscreen/aquarium/aquariumSave/stall/stallDemo/town/pet/petPortable/tampered`；端口 `62821,54199,56007,63977,56830,59310,53914,56681,62256,49677,52441`（无 9333、无重复）。
- 隔离：`realAppDataUnchanged: true`，`qaDataDirRemoved: true`；真实 `%APPDATA%\com.perrylink.desktopgames` 前后哈希一致。
- 绑定：`head=0a5bc0b…`、`headDirty=true`（并发任务改动，JSON 记录前 20 条 `git status --porcelain`）；exe sha256 绑定本次二进制。

### 3.2 release 页面集：**FAIL（如实归档，不掩盖）**

- exe：`target/release/desktop-games-tauri.exe`（18,286,080 B，sha256 `eb7d44dd1f124519b53d57b0ea5c99b98c8d1babd88cd20b4913fa7a53574b8e`）。
- 证据：`docs/plan/evidence/e2e-tauri-0a5bc0b-20261120T044810Z-release.json`（sha256 `9a7e50fe45dbdc0b7d7aec06da2d748eab74d23258fd71f6dfc78fb1b0271373`）。
- 第 1 步即失败：`page.hasP0=false`，页面正文 `asset not found: index.html`。
- 根因（不是端口/归档回归，是既有范围漂移）：`vite.config.ts` 的 release 页面集（MB-106）**故意不产出** `index.html` 与 aquarium/stall/town 等 demo 页；而 `e2e-tauri.ps1` 的 bench 入口依赖 `index.html`。即使修好页面集，release exe 还有第二个已知外部阻塞：`native/dlc-verify/trust/production-trust-root.json` 的 `keys` 为空 ⇒ 生产 DLC 验证 fail-closed（`dlc: skipped: ... no signing keys`），`page` 断言中的 `mounted farm-seasons` 不可能成立（MB-090/MB-082 外部 ceremony）。
- 因此本次**不宣称**「release Tauri E2E 通过」；release 通道的 11 用例验收仍是 BLOCKED，需单独任务决策（见 §6）。

## 4. 如何复现

前置：Windows 原生 Node 24（`C:\Program Files\nodejs\node.exe`）、Rust/cargo、WebView2；WSL2 + interop（本机形态）。

~~~powershell
cd D:\Projects\dsh\desktop-games
# demo 页面集（E2E 现有 11 用例依赖 demo 路由）
npm run build:demo
# debug 二进制（嵌入 dist；custom-protocol 才能在 WebView2 内加载打包资源）
cd app\tauri\src-tauri
cargo build --features custom-protocol
cd ..\..\..
# 真机 E2E：每个用例随机 CDP 端口，结果 JSON 自动写 artifacts/ 并归档 docs/plan/evidence/
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\e2e-tauri.ps1 -Exe app\tauri\src-tauri\target\debug\desktop-games-tauri.exe
~~~

release 通道复现（预期 fail，用于核对归档）：

~~~powershell
npm run build
cmd /c scripts\build-tauri-win.bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\e2e-tauri.ps1
~~~

验收/静态检查：`npm run typecheck`、`npm test`、`npm run build`、`npm run docs:check`；端口/归档契约由 `tests/e2e-port-randomization.test.ts` 锁定。

## 5. 明确不覆盖 / 不得宣称

1. **release 验收未通过**：§3.2 是真实 fail，不是环境噪声；release exe 的 11 用例不可用。
2. **debug 不等于 release**：§3.1 的 PASS 只对 `channel=debug` + 该 exe sha + demo 页面集成立；不能写成「发布验收」「真机全绿」。
3. **生产 DLC 信任根为空**：release 包的 DLC mount 失败是 fail-closed 的预期行为，需要外部 owner 密钥 ceremony（MB-090/MB-082）。
4. **未覆盖**：24h soak、托盘/单实例压力、真实桌面点击穿透、DPAPI 跨机器、Authenticode/签名、CI（本仓无 remote，GitHub Actions 从未运行）。
5. **历史 profile 未清理**：本次只保证新启动的 profile 被删除；`artifacts/` 中既有约 949 个 `cdp-wv2-*` 目录未删除（破坏性清理不在本任务授权内，留待专门清理任务）。
6. `headDirty=true`：本次证据绑定 HEAD `0a5bc0b` + 工作树（含并发任务改动）；干净 checkout 复跑应在并发任务合并后进行。

## 6. 后续（未在本任务闭环）

- **release 页面集 E2E**：二选一——(a) 把 E2E 拆成「release 产品路由（pet/setup）冒烟」+「demo 页面集回归」两套；(b) 为 QA 定义正式的 demo-channel 构建并在文档/状态里标注，不再让单一脚本同时声称覆盖两者。
- **生产 DLC 信任根**：owner/ceremony 注入后才能验证 release 包的 `mounted farm-seasons`。
- **干净 HEAD 复跑**：并发任务（含本任务脚本改动）合并后，用 `git worktree add --detach` + 现场构建重跑，把 `headDirty=false` 的 JSON 追加为最终证据。
- **历史 profile 清理**：按数据安全三段式（dry-run → 隔离 → 确认删除）单独执行。

## 7. 文件清单

| 文件 | 变更 |
| --- | --- |
| `scripts/lib/cdp-endpoint.mjs` | 新增：临时端口/`DG_CDP_PORT` 解析、`appDataRoot()`、真实 UI 的 TOS 接受 helper |
| `scripts/cdp-launch.ps1` | 重写：临时端口、就绪轮询、单实例预检、profile 精确清理、node 退出码上抛 |
| `scripts/e2e-tauri.ps1` | 重写：逐用例端口/耗时、任何结局写 JSON、HEAD/exe sha/隔离/限制字段、证据双写 |
| `scripts/cdp-*.mjs`（19 个） | 去掉硬编码 9333，统一走 `lib/cdp-endpoint.mjs`；两个探针改用 `appDataRoot()`；两个 pet 探针补真实 TOS 接受 |
| `tests/e2e-port-randomization.test.ts` | 新增静态契约：无 9333、逐用例临时端口、失败也归档、证据 schema、探针统一 endpoint |
| `docs/plan/evidence/e2e-tauri-0a5bc0b-20261120T044709Z-debug.json` | 真机 debug/demo 11/11 PASS 证据 |
| `docs/plan/evidence/e2e-tauri-0a5bc0b-20261120T044810Z-release.json` | 真机 release FAIL 证据（`asset not found: index.html`） |
| 本文件 | 证据/复现/限制/后续说明 |

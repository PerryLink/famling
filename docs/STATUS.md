# STATUS（公开 pet-only 仓）

> 本文件是 **PerryLink/famling 公开仓** 的状态摘要，手工维护；不是私有 `desktop-games` monorepo 的 STATUS 真值。
> 更新日期：2026-11-25

## 当前状态

- 仓：`PerryLink/famling`，默认分支 `main`，公开 pet-only 完整可执行源码（source-available，非 OSI 开源）。
- 版本：**0.2.1 发布候选（approval-ready，尚未签名/发布）**；`package.json`、`package-lock.json`、`app/tauri/src-tauri/tauri.conf.json`、`app/tauri/src-tauri/Cargo.toml` 均为 `0.2.1`。上一个发行：`famling-pet-v0.1.0`（unsigned Windows 安装包 + portable zip；SHA256 随 Release）。
- CI/构建：`.github/workflows/build-windows.yml`（Windows runner，Node 22.16，Tauri unsigned）现在依次执行 `npm ci` → `npm run typecheck` → `npm run build` → 三角色 `validate:character --strict`（脚本：`npm run validate:character -- <角色目录> --strict`）；tag 构建生成 `SHA256SUMS.txt` + `BUILD-INFO.txt`，保留 artifact `famling-pet-windows-unsigned`。**无签名、无自动更新、无商店。**
- 美术：2026-11-22 final art（三只角色，96×96，共 420 帧 = 368 canonical + 52 alias；human 29 tags/141 帧、cat 29 tags/143 帧、dog 28 tags/136 帧），随 `art-delivery-2026-11-22` release 提供交付包；本仓 `public/assets/pet/anim/` 为 final art。UI 为 final manifest **97 件资产 / 103 文件**（2026-11-22 final + 2026-11-25 审批 HUD 徽章，确定性本地绘制、无 AI 模型）。来源、验证与 AI 模型许可（**UNVERIFIED**）见 [ART-REBUILD-2026-11-22.md](ART-REBUILD-2026-11-22.md)。
- 原生生命周期（0.2.1）：Windows 单实例命名互斥 + 已运行实例召回（按窗口标题 `Famling · 汀岚` 置顶）；系统托盘菜单「显示/召回」「退出」（fail-soft，无新增权限）；Rust panic hook 崩溃导出 JSON 至 `%APPDATA%\Famling\crashes`（version/timestamp/thread/message/location，无 env/参数/用户路径，本地不上传，导出失败不影响启动）。
- 桌面发行：0.2.1 产物待发布；0.1.0 为上一个 unsigned release。
- DSH 插件：`dsh-famling` npm 最新发布 `0.13.4`（2026-11-24）：DSH 兼容自检、分层门禁、宿主工作状态、气泡优先级；Advisers 0.5.0 Pet Brief 复验通过；仓库 [PerryLink/dsh-famling](https://github.com/PerryLink/dsh-famling)。
- 在线预览：GitHub Pages `https://perrylink.github.io/famling/`（`demo/`，无 DSH 依赖）。
- 许可：代码 PolyForm Noncommercial 1.0.0；美术 CC BY-NC-SA 4.0；AI 模型许可 **UNVERIFIED**；完整清单见 [LICENSES.md](../LICENSES.md)；AI 资产标注见 `AI-PROVENANCE.md`。

## 不包含 / 未验证（不得伪造）

- 公开仓不含私有 monorepo 的测试套件与 C1 证据链；本仓 CI 只做公开 pet-only 构建/校验（typecheck/build/三角色 validator），不跑私有 2,342 个测试。
- 无 Authenticode 签名/自动更新/商店分发；安装时 SmartScreen 会提示 unsigned。0.2.1 只是 approval-ready 候选，未获批准、未发布、未签名。
- AI 模型许可未核实（UNVERIFIED）：MiniMax-H3-Image 本地 ComfyUI 生成底稿 + 脚本精修；商用前须 owner/律师复核，不得声称已清权。
- 市场/支付/审核/运营服务器不存在；内容包市场只有离线 UI 与 v3 协议。
- macOS/Linux 没有官方构建；DSH 插件兼容矩阵见 dsh-famling 仓文档。
- 法律文本仍为 DRAFT；不构成合规结论，也不得用于情感陪伴/虚拟伴侣等禁止用途。

## 复现

```sh
npm ci
npm run typecheck
npm run build
npm run validate:character -- public/characters/pet-tinglan-anim --strict
npm run validate:character -- public/characters/pet-cat --strict
npm run validate:character -- public/characters/pet-dog --strict
npm run dev    # http://localhost:5173/pet.html?hero=1
# Windows Tauri：cd app/tauri && npx --yes @tauri-apps/cli@2 build（需 Rust MSVC + WebView2）
```

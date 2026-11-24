# STATUS（公开 pet-only 仓）

> 本文件是 **PerryLink/famling 公开仓** 的状态摘要，手工维护；不是私有 `desktop-games` monorepo 的 STATUS 真值。
> 更新日期：2026-11-24

## 当前状态

- 仓：`PerryLink/famling`，默认分支 `main`，公开 pet-only 完整可执行源码。
- 代码/构建：`.github/workflows/build-windows.yml`（Windows runner，Node 22.16，Tauri unsigned）最近成功构建于 `f8095b2`（2026-11-22）；artifact 名 `famling-pet-windows-unsigned`。
- 美术：2026-11-22 final art（三只角色，96×96，共 420 帧 = 368 canonical + 52 alias），随 `art-delivery-2026-11-22` release 提供交付包；本仓 `public/assets/pet/anim/` 为 final art。
- 桌面发行：`famling-pet-v0.1.0`（unsigned Windows 安装包 + portable zip；SHA256 随 Release）。**无签名、无自动更新、无商店**。
- DSH 插件：`dsh-famling` npm 最新发布 `0.13.4`（2026-11-24）：DSH 兼容自检、分层门禁、宿主工作状态、气泡优先级；Advisers 0.5.0 Pet Brief 复验通过；仓库 [PerryLink/dsh-famling](https://github.com/PerryLink/dsh-famling)。
- 在线预览：GitHub Pages `https://perrylink.github.io/famling/`（`demo/`，无 DSH 依赖）。
- 许可：代码 PolyForm Noncommercial 1.0.0；美术 CC BY-NC-SA 4.0；AI 资产标注见 `AI-PROVENANCE.md`。

## 不包含 / 未验证（不得伪造）

- 公开仓不含私有 monorepo 的测试套件与 C1 证据链；本仓 CI 只做 Windows 构建，不跑私有 2,342 个测试。
- 无 Authenticode 签名/自动更新/商店分发；安装时 SmartScreen 会提示 unsigned。
- 市场/支付/审核/运营服务器不存在；内容包市场只有离线 UI 与 v3 协议。
- macOS/Linux 没有官方构建；DSH 插件兼容矩阵见 dsh-famling 仓文档。
- 法律文本仍为 DRAFT；不构成合规结论，也不得用于情感陪伴/虚拟伴侣等禁止用途。

## 复现

```sh
npm ci
npm run dev    # http://localhost:5173/pet.html?hero=1
npm run build
# Windows Tauri：cd app/tauri && npx --yes @tauri-apps/cli@2 build（需 Rust MSVC + WebView2）
```

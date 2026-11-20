# Famling — 汀岚 / 布偶猫 / 金毛 桌宠（pet-only 完整可执行源码）

> **状态：C1 unsigned 邀请 beta（研究原型）。** 无 Authenticode 签名、无自动更新、无公开商店、无生产 DLC 根；本仓不声称已合规或可公开发布。
> **非官方项目，不关联 DeepSeek。** 内容/角色为原创或已登记来源，AI 生成资产按仓内 AI-PROVENANCE 标注。

Famling 是一个 Windows 桌面像素桌宠 + DSH（DeepSeek Harness）客户端插件：480×336 无边框置顶小窗、托盘召回、单人/猫/狗三套 96×96 像素动画、四层缩放、存档自动保存与坏档恢复、内容角色包（安装/回滚/热切换）、低打扰安静时段与健康提醒。

## 快速开始

### A. 作为 DSH 插件（最轻量）

```sh
dsh plugin --profile web add dsh-famling
```

npm 包：`dsh-famling@0.12.0`（`npm view dsh-famling`）。插件在 DSH 左下角账号区下方显示 72px 桌宠；默认零常驻按钮，右键角色或 Shift+F10 打开菜单。也可从 [PerryLink/dsh-famling](https://github.com/PerryLink/dsh-famling) 本地安装。

### B. 独立桌宠应用（Tauri，仅 Windows）

```bash
npm ci
npm run build
# 需要 Node >=22.16、Rust MSVC、Visual Studio Build Tools、WebView2
cd app/tauri
npx --yes @tauri-apps/cli@2 build
```

开发：`npm run dev`，打开 `http://localhost:5173/pet.html`。产物：`dist/pet.html`、`dist/setup.html`、`dist/chat-import.html`；Tauri 默认窗口透明、置顶、480×336。

## 2026-11-21 体验/性能批次（源码已包含）

- **互动节奏可调**：待机动画三档（活泼 4–10s / 正常 60–90s / 安静仅呼吸+眨眼）；安静时段同时停止待机微动作；鼠标悬停 800ms 有回应用；Advisers pose 映射为安静档；「一起工作 25/50 分钟」只在用户设定边界结束提醒，无连续天数/无惩罚。
- **角色表现**：猫/狗待机从 6 帧扩到 8 帧并加次级运动；猫慢眨眼 4fps；插件实际 72px 显示有独立可读性量尺与测试。
- **性能**：健康提醒轮询 1s→15s；自动保存脏检查 + 隐藏空闲退避；hit-region 轮询随窗口隐藏暂停、待机降频；消除首帧整页闪烁；hero 首帧只解码 idle、其余后台分批解码，待机按需降帧率。
- **契约与证据**：角色包能力门（声明未实现的语义会给出可见诊断）、golden trace 回放 fixture、第三方角色包 32 MiB 解码内存红线（fail-closed）、桌面+插件联合证据（`JOINT-EVIDENCE.json` / `PLUGIN-MANIFEST.json`）。
- **启动与边缘**：内容窗改为独立入口（`content.html`，同构建载荷约 −6.5%）；桌宠拖到工作区边缘会保留贴边停靠并做整数像素落地，位置恢复保留 dock；仅移动窗口，不读取其他窗口内容。
- **本地数据**：可手动导出本机使用摘要（无文本/无网络）、共处日历（无连续天数/无提醒）；删除全部本地数据会一并清除。
- **内容日历**：节日/季节/周末台词以 20% 低概率叠加在 ambient 气泡，设置内可关，安静时段/减少动态不触发。

## 两个包

| 包 | 来源 | 用途 |
|---|---|---|
| **famling** | 本仓 | 独立运行的完整桌宠（pet-only Tauri app；角色/内容/存档/语音运行时） |
| **dsh-famling** | [PerryLink/dsh-famling](https://github.com/PerryLink/dsh-famling) | DSH 客户端插件；轻量伴随入口，与独立 app 共享角色/品牌、不共享运行时代码 |

## 功能

- 三套 96×96 像素动画（各 12 clip；cat 74 / dog 70 / human 68 帧），透明背景，跟随 DSH light/dark 的菜单与面板。
- 角色包安装/更新/卸载/回滚/热切换；内容包 v2/v3（许可、AI provenance、compatibility）+ 离线市场 UI（生产服务器未接）。
- 四层缩放（整体/UI+文本/图像/组件）、200% 溢出修复、DPR/多屏 clamp。
- 存档：30s 自动保存（脏检查）、坏档四选一恢复、便携导入导出、删除。
- 低打扰：安静时段、减少动态、暂时隐藏、健康提醒（2h）；无障碍与对比度门禁。
- 内容中心：角色 / 自定义 / 内容包 / 市场；内容窗口 760×560。
- TTS/ASR 运行时本地/宿主能力；公开仓不随包分发预生成音频。

## 数据与隐私

- 桌宠本地状态（存档、设置、内容包登记）保存在本机；无遥测上传、无市场网络请求（市场默认 unconfigured）。
- DSH 插件聊天文本经 DSH Host 发送给你在 DSH 中配置的模型供应商；插件本身不保存聊天文本；危机关键词在本地短路为固定安全资源。插件可读取宿主粗状态（运行/空闲，仅分类错误码）用于安静/姿态切换，不读取消息、提示词或文件内容。
- 使用摘要仅可手动导出到本机（若启用），不上传。

## 许可与使用限制

- 代码：**PolyForm Noncommercial 1.0.0**（`LICENSE` / `LICENSE-COMMERCIAL.md`）。
- 桌宠美术/设定：**CC BY-NC-SA 4.0**（`LICENSE-ART`）；角色名/Logo/商标不随 CC 许可授权。
- **仅用于技术研究与原型验证**；禁止情感陪伴/虚拟伴侣、专业建议、未成年人亲密关系、冒充真人/官方、违法用途。完整条款见 [docs/legal/USE-RESTRICTIONS-2026-11-19.md](docs/legal/USE-RESTRICTIONS-2026-11-19.md)。
- 全部法律文本仍为 DRAFT，需律师/权利人复核；本仓不构成合规结论。

## 已知限制（如实披露）

- unsigned beta：exe/安装器 NotSigned；无 updater/签名证书；无生产 DLC 信任根。
- 无私有仓真实 CI（本仓 GitHub Actions 为公开镜像构建）；无 24h native soak、真机混合 DPI/多屏、真实 DSH Host 联调与真实 playtest 数据。
- 市场/支付/审核/运营服务器不存在；内容包市场只做离线 UI 与协议。

## 不包含

完整 desktop-games monorepo、游戏基座/存档、私有 research/artifacts、内部 handoff、未清权第三方素材、预生成 TTS 音频。

## 历史说明（2026-11-18）

本仓 `main` 历史于 2026-11-18 重建：旧预生成 TTS 音频（42 WAV）与游戏残留不再存在于当前历史；旧历史归档于仓外。GitHub 旧 SHA/fork/镜像可能仍可访问一段时间，重建不等于互联网完全清除。

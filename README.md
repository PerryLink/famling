# Famling — 汀岚 / 猫 / 狗 桌宠（pet-only 完整可执行源码）

> ⚠️ **使用限制（必读）**：本项目及其全部代码、美术、音频、文案、角色素材和衍生物**仅用于技术研究与原型验证**；**不得用于情感陪伴、虚拟伴侣、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人/官方，或任何违反法律法规/平台规则的用途**。完整说明见 [docs/legal/USE-RESTRICTIONS-2026-11-19.md](docs/legal/USE-RESTRICTIONS-2026-11-19.md)。

> **非官方项目，不关联 DeepSeek。** 本仓提供只含桌宠应用的完整可执行源码：pet 窗口、汀岚/猫/狗角色与素材、UI 91、TTS 音色切换（运行时；不随包音频）、输入 composer、TOS/年龄核验、Advisers 只读 brief。
> **不包含**游戏基座、其它游戏 HTML/资产、私有 artifacts、内部 handoff、参考同人图。

## 两个包

本工作线提供两个包，按用途分开：

| 包 | 来源 | 用途 |
|---|---|---|
| **famling** | 本仓 | **独立运行的完整桌宠**（pet-only Tauri app；汀岚/猫/狗、UI、TTS、年龄核验等） |
| **dsh-famling** | [PerryLink/dsh-famling](https://github.com/PerryLink/dsh-famling) | **DSH 客户端插件**；在 DSH 左下角账号区域显示 72px 汀岚小桌宠与本地小互动，不替代独立 app |

> `famling` 是独立应用；`dsh-famling` 是放在 DSH 里的轻量伴随入口。两者共享角色/品牌，不共享运行时代码。

## 运行

```bash
npm ci
npm run build
# Windows (需要 Node >=22.16, Rust + Visual Studio Build Tools + WebView2)
cd app/tauri
npx --yes @tauri-apps/cli@2 build
```

开发：`npm run dev`，打开 `http://localhost:5173/pet.html`。
构建产物：`dist/pet.html`、`dist/setup.html`、`dist/chat-import.html`；Tauri `app/tauri/src-tauri/tauri.conf.json` 默认 `pet.html` 480×336 透明置顶。

## 内容

- 汀岚：`public/characters/tinglan`、`tinglan-256`、`public/assets/pet/tinglan-256`
- 猫/狗：`pet-cat`/`pet-dog` + placeholder 素材
- UI 91：`public/assets/ui`
- 语音：本公开仓**不随包分发预生成音频**（2026-11-18 已移除 baked pack）；运行时使用系统 TTS / 宿主云 TTS（如配置）
- 法务/二创/OC：`docs/legal`、`docs/modding`、`docs/art/oc`

## 许可

- 代码：**PolyForm Noncommercial 1.0.0**（`LICENSE`/`LICENSE-COMMERCIAL.md`）。
- 桌宠美术/设定：**CC BY-NC-SA 4.0**（`LICENSE-ART`）；角色名/Logo/商标不随 CC 许可授权。
- 音频/第三方：本导出不含音频文件；DeepSeek TTS 输出再分发/商用条款仍 TBD，不声称已获服务商许可。
- 全部文本仍 DRAFT/非律师意见；发布前需律师/权利人复核。

## 不包含

完整 desktop-games monorepo、游戏基座/存档、私有 research/artifacts、内部 reference 图、未清权第三方素材。

## 历史说明（2026-11-18）

本公开仓的 `main` 历史已于 2026-11-18 重建：旧的预生成 TTS 音频（42 个 WAV）与游戏残留不再存在于当前历史中；旧历史已归档于仓外（不进入公开仓）。注意：GitHub 上旧 commit SHA、fork/镜像与旧安装包可能仍可访问一段时间，本次重建**不等于**已从互联网完全清除旧音频。

# 桌宠素材许可清单（2026-11-16）

> **2026-11-18 公开导出边界（本仓当前状态）**：本公开导出已按清理方案 A 移除全部预生成 TTS 音频（42 WAV + manifest）、游戏内容包（`packs/`）、DLC 校验链（`native/dlc-verify`）与未使用 kernel 模块；本导出**不随包分发任何音频 / DLC / 游戏基座**。下文历史统计（18/42 WAV、baked pack、随包授权等）保留作私有 mono-repo 的历史记录，**不代表本公开导出当前内容**；音频再分发条款仍为 TBD。

用户决定：**桌宠素材统一按 CC BY-NC-SA 4.0 分发；部分汀岚素材作者已在 Pixiv 事先声明 CC0（仅部分）。**

**CC0 来源（用户 2026-11-16 明确）**：<https://www.pixiv.net/users/131049875> 的相关美术素材，暂时**只有汀岚**这一角色的素材；猫/狗/人型/UI 不在此 CC0 范围。具体帖子/文件清单仍待作者补齐。CC0 不可撤回；本仓库对桌宠包按 NC-SA 分发，但下游仍可依原 CC0 主张权利。

| 资产 | 当前位置 | 当前声明 | 备注 |
|---|---|---|---|
| 汀岚角色定义/行为/台词 | `public/characters/tinglan/*` | CC BY-NC-SA 4.0（角色文本/设定） | 尚无 final 美术/音频；**部分美术 CC0（Pixiv 131049875，待逐文件映射）** |
| 猫/狗/珍珠占位包 | `public/assets/pet/*-placeholder/` | placeholder-only；桌宠包内按 CC BY-NC-SA 4.0 分发 | 程序化占位，不是 final art |
| 其他 `public/characters/*` | `public/characters/` | 各 `character.json.license` / README | 以文件声明为准 |
| 42 个 TTS WAV（21 stella + 21 tide） | **本公开导出不含**（2026-11-18 已移除） | 私有 mono-repo 历史记录：baked pack（版权/再分发仍以 DeepSeek TTS 条款为准） | 见 `docs/legal/TTS-TERMS.md` §3A、`AI-PROVENANCE.md` §10；非克隆、未律师审核；manifest v2 带 sha/bytes/duration/license/ai |
| 第三方参考图/同人 | `art/_placeholder/refs/` | **禁止发布** | gitignored |
| 代码 | `src/**` | PolyForm Noncommercial 1.0.0 | 非 OSI 开源；商业需书面许可 |
| 游戏基座 | 私有仓/私有目录 | 不随桌宠公开仓发布 | 保持私有 |

## 待作者确认

1. 哪些具体文件属于 Pixiv CC0 声明（列出 URL/日期/文件清单）；
2. CC0 文件是否仍希望以 CC0 分发（而非 NC-SA）；
3. 第三方字体/图标/音频是否清理（当前字体 0、TTS 待确认）；
4. 若未来商业化：CC BY-NC-SA 美术不能进付费包，需清权/换图/单独书面许可。

本清单不是法律意见；`LICENSE-ART` 是项目声明，律师审查暂缓（用户 2026-11-16 决定）。

## 2026-11-17 新增资产登记

| 资产 | 当前位置 | 声明 | 备注 |
|---|---|---|---|
| 汀岚 Q 256 v2 anchor-final pack（49 PNG） | `public/assets/pet/tinglan-256/` | **placeholder-only**；正式分发前按 CC BY-NC-SA 4.0 复核 | AI 概念 + 本地锚点收口；`final:false`；机器 gate 49/49，人工 2× 终审未做 |
| Tinglan 256 FCI 0.1 文档/行为 | `public/characters/tinglan-256/` | CC BY-NC-SA 4.0（角色文本/设定） | opt-in preview；非默认角色 |
| UI 91（91 逻辑/97 物理） | `public/assets/ui/` | **placeholder-only**；非 final | 本地确定性像素绘制，`ai:none`，0 API；托盘/app icon/RP 法务未终审 |
| UI 91 QA contact sheets/verify report | `docs/art/ui-91-qa/` | 与 UI 91 同 | 供 CI/tracked 测试使用 |
| UI 生成器 | `scripts/gen_ui91.py` | PolyForm Noncommercial 1.0.0（代码） | 无网络/无模型；输出资产 placeholder-only |

**2026-11-17 TTS 变更（用户授权）**：DeepSeek 合成音色 `stella`（默认）与 `tide`（可选）共 42 个 WAV 由“未确认、构建排除”改为 **baked pack 随包缓存**——用户 2026-11-17 明确授权用 DeepSeek 合成音色预生成并缓存，以避免每句调用付费。记录：来源 DeepSeek TTS（`voice_id=stella`，2026-11-14 生成；`voice_id=tide`，2026-11-17 生成）、**非克隆/不冒充真人**、版权与再分发**仍以 DeepSeek 条款为准（TBD）**、**未**律师审核。`tide` 已 baked 在 `tide/` 子目录，同句跨音色文件/哈希不同，不得互相冒充。manifest 见 `public/assets/voice/pet/manifest.json`（v2：`voicePresets` + 每行 `voice/license/ai/provider/bytes/duration/sha256`）；管线见 `scripts/bake-voice.mjs`；条款见 `docs/legal/TTS-TERMS.md` §3A。

**未变**：旧 `*-placeholder` 仍 placeholder-only；代码 PolyForm NC。以上不是法律意见，发布前需人工/律师复核。

**2026-11-17 tEXt 更新**：`public/assets/pet/tinglan-256/*.png` 49 张已嵌入 AI/来源/日期/Final=false tEXt；像素未变。UI 91 不标 AI（本地绘制）。

## 2026-11-17 TTS baked pack 登记

| 资产 | 当前位置 | 声明 | 备注 |
|---|---|---|---|
| 42 个 DeepSeek WAV（baked pack：21 `stella` + 21 `tide`） | `public/assets/voice/pet/*.wav` + `public/assets/voice/pet/tide/*.wav` | 用户 2026-11-17 授权随包缓存；版权/再分发以 DeepSeek TTS 条款为准（TBD）；**非克隆** | stella 生成 2026-11-14（21 句，2,049,564 B）、tide 生成 2026-11-17（21 句，2,239,644 B）；24 kHz/mono/16-bit，合计 4,289,208 B；manifest v2 每行含 `voice/license/ai/provider/bytes/duration/sha256`；构建 guard 校验 42 行/双 available/`tide/` 21 文件并复制进 dist（不再删除） |
| baked voice manifest | `public/assets/voice/pet/manifest.json` | 工程元数据（非许可文件） | `voicePresets`: `stella=available`（21 句）、`tide=available`（21 句）；`pendingLines` 为空；stella 根目录、tide 在 `tide/`；同句跨音色哈希不同，不得互相冒充；未来音色在补 baked 前保持 planned |
| 批量烘焙/校验脚本 | `scripts/bake-voice.mjs` | PolyForm Noncommercial 1.0.0（代码） | 默认 dry-run 不联网；`--verify` 校验 sha/bytes/duration；`--generate` 才调用 API 且只读 `DEEPSEEK_API_KEY` 环境变量（不落盘/不打印） |

**待确认/待补**：DeepSeek TTS 条款对输出音频再分发/商用的书面确认（TBD）；`tide` 21 句实际账单未单独入账（TBD），按 330 计费字符估算 ≈ ¥0.099（标价）/¥0.0495（限时价）；stella+tide 合计 42 句仍属同一用户授权范围，未来新增音色需另记授权/成本；C2PA/IPTC 音频元数据未做。以上不是法律意见，未律师审核。

## 2026-11-22 美术重制（final art）

| 资产 | 当前位置 | 当前声明 | 备注 |
|---|---|---|---|
| 汀岚动画（human） | `public/assets/pet/anim/human/*` | CC BY-NC-SA 4.0（final art） | 29 tags / 141 帧；AI 底稿 + 脚本精修；见 `docs/ART-REBUILD-2026-11-22.md` |
| 布偶猫动画（cat） | `public/assets/pet/anim/cat/*` | CC BY-NC-SA 4.0（final art） | 29 tags / 143 帧（含 12-tag 别名）；同上 |
| 金毛动画（dog） | `public/assets/pet/anim/dog/*` | CC BY-NC-SA 4.0（final art） | 28 tags / 136 帧（含别名）；同上 |
| UI 97 文件（2026-11-22 版） | release `art-delivery-2026-11-22` 内 `output/assets/ui/` | CC BY-NC-SA 4.0（final art） | 本仓 UI 仍为 2026-11-17 版；manifest 再生后替换 |

> 模型许可未核实（MiniMax-H3-Image，本地）；商用前由 owner 复核。旧 placeholder 资产（cat/dog/pearl-placeholder）保留原 placeholder-only 声明。

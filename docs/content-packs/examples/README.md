# 示例包索引（两类 payload，别混用）

> 所有示例都是**占位清单**：`files[].sha256` 是演示值，不对应真实素材；示例**不加载、不渲染、不安装**。
> 规范入口：内容包 0.2 → [`../README.md`](../README.md)；新 rig 动画包 0.2 → [`../ANIM-PACK-0.2.md`](../ANIM-PACK-0.2.md)。

## 1. 两个 schema 怎么选

| 我要做什么 | 用哪个示例 | schema |
|---|---|---|
| 换角色皮肤/声音/对话/配色/背景/字体（复用内置 rig） | `human.example.pack.json` / `cat.example.pack.json` / `dog.example.pack.json` | `famling.content-pack/0.2` |
| 交付**新动画帧/新 rig**（数据驱动注册表的前置） | `human.anim.example.pack.json` / `cat.anim.example.pack.json` / `dog.anim.example.pack.json` | `famling.pet-anim/0.2` |

两套 schema **并存**（ARCH triage C-03）：只共享 envelope（usageDeclaration / license / aiProvenance / files+sha256 / remote 签名 / zip 上限）；payload 不同，不要互相套用字段。

## 2. 动画资产包示例（`*.anim.example.pack.json`）

| 示例 | kind | 帧预算 | voice |
|---|---|---|---|
| `human.anim.example.pack.json` | humanoid | 68 帧 / 12 clip | tts + speech 气泡 |
| `cat.anim.example.pack.json` | cat | 72 帧（stand_wag 10 帧非均匀） | none + thought 气泡 |
| `dog.anim.example.pack.json` | dog | 68 帧 / 12 clip | none + thought 气泡 |

示例已按 canonical clip 表给出完整 `animations` / `behavior` / `regions` / `files`（含每一帧路径），可直接 `validateCharacterPackV2`。

最短路径：

1. 复制对应示例，改 `id` / `name` / `character.id`（不得以 `famling.` 开头）；
2. 按 `HUMAN/CAT/DOG-DESIGN-REFERENCE.md` 的 96×96 / 12 clip / 地线 y=89 / 调色规则产出 PNG；
3. 帧文件命名为 `assets/anim/<clip>/<clip>_NN.png`（NN=00..frames-1），替换示例 `animations` 的 frames/fps（loop/layer/category/priority 不可改）；
4. 重算 `files[].bytes` + `files[].sha256`（示例值作废），预览换到 `assets/preview/`；
5. 音频可选：仅 `.ogg`，且必须 `audio.redistribution.confirmed: true`（未清权不得携带）；cat/dog 禁止 baked voice line；
6. 自检：`validateCharacterPackV2` →（宿主解压+哈希）`validateCharacterPackZip`；
7. 打包 zip：`pack.json` 在根、素材在 `assets/`；对外分发前确认许可/素材权利/AI 标识。

**未实现边界**：loader/数据驱动注册表/热切换（MB-041）、真实文件系统安装器（MB-042）、签名审核门（MB-043）均未实现；不要把这些示例当成“可安装/可玩新角色”的承诺。

## 3. 主题包示例（`*.example.pack.json`）

用法见 [`../README.md`](../README.md) §3–§5 与 `HUMAN/CAT/DOG-DESIGN-REFERENCE.md` §8。

> 本目录示例是工程参考，不构成法律意见；对外发布前按 `docs/legal/` 复核。

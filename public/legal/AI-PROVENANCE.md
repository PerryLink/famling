# AI-PROVENANCE（AI 生成调用链与证据）· 草案

> **状态：DRAFT（草案）— 待用户（PerryLink）+ 律师确认。** 快照：2026-11-15。
> 本文件不是法律意见；它汇总**已有的生成元数据**，供 AI 披露、可版权性证据、相似度审查与许可证登记使用。
> 不包含 API key / 凭据 / 账号 token。相关文件：`LICENSE-ART`、`CREDITS.md`、`THIRD-PARTY.md`、`docs/LEGAL-STATUS-2026-11-15.md`。
> **2026-11-17 更新**：TTS baked pack 随包授权 + manifest v2 逐文件元数据见 §10；pack 现为 42 个 WAV（21 `stella` + 21 `tide`，双预设 available），代码/文档集成工作**未调用任何 API**（WAV 由用户此前用自己账号生成）；其余图像链快照仍为 2026-11-15。
> **2026-11-20 更新**：`public/assets/pet/anim/dog/**` 确定性占位动画包已登记（§11；`ai.status=none`，无 API/模型/网络，仍为 placeholder-only）；`public/characters/pet-dog/character.json` 的 `meta.artPack` 已从 v7 修正为 v11，并记录 66/68 唯一帧 alias 裁定。

## 0. 证据来源（本机只读核对，2026-11-15）

| 来源 | 位置 | 内容 | 跟踪状态 |
|---|---|---|---|
| Orca 生成元数据 | `D:\Orca\**\*.json`（19 个） | 每次调用的 `model / endpoint / called_at / params / prompt_sha256 / config_sha256 / body_sha256 / references[].sha256 / images[].sha256 / usage / cost_usd / elapsed_ms` | 仓外，未跟踪 |
| Orca 输出图 | `D:\Orca\**\*.png`（122 张，含 82 张像素帧） | 概念/立绘/设定/变体/像素化/预览 | 仓外，未跟踪 |
| Pearl 生成元数据 | `art/_placeholder/refs/ai-drafts/*.json`（含 5 个 Pearl 阶段） | 同上；另 `gen-config.json` 保存部分 prompt 文本 | **gitignored**，未跟踪 |
| 调用台账 | `art/_placeholder/refs/ai-drafts/calls-ledger.jsonl`（24 行） | 汇总成本与文件路径 | **gitignored**，未跟踪 |
| 生成脚本 | `art/_placeholder/refs/ai-drafts/or-image-gen.mjs`（gitignored）、`scripts/voice-pilot.mjs`（TTS 首轮/补录生成 stella）、`scripts/bake-voice.mjs`（TTS manifest v2 维护/校验/增量生成；stella 补录与 21 句 tide 生成走其 `--generate`；默认 dry-run） | 参数/哈希记录逻辑 | 见上 |
| TTS 记录 | `docs/VOICE-PILOT-RESULTS.md`、`public/assets/voice/pet/manifest.json`（v2，2026-11-17 起含 42 行逐文件 sha/bytes/duration/license/ai，stella+tide）、`scripts/bake-voice.mjs`、git 提交 | 音色/日期/句数/成本/逐文件校验 | tracked |

**校验结果**：19 个 Orca 输出 PNG 与 5 个 Pearl 输出 PNG 的 sha256 **全部与元数据记录 MATCH**（2026-11-15 本机复核）。成本合计与 `calls-ledger.jsonl` 24 条记录一致（见 §2.3/§3.3）。
**注意**：元数据中的 `file` 路径仍指向迁移前的 `art/_placeholder/refs/ai-drafts/`；图片已迁到 `D:\Orca`，以 **sha256** 判定为同一文件（路径差异不代表内容差异）。

## 1. 模型与调用方式（统一）

| 项 | 值 |
|---|---|
| 图像模型 | `openai/gpt-image-2.6-sunburst` |
| 供应商/端点 | OpenRouter Images API — `https://openrouter.ai/api/v1/images` |
| 通用参数 | `quality=high`、`background=transparent`、`output_format=png`、`n=1`、`aspect_ratio` 按图（1:1 / 2:3 / 3:2） |
| seed | **未发送/不可用**（参数中无 seed；因此生成结果**不可逐像素复现**，只能复现“请求级”） |
| 生成脚本 | `or-image-gen.mjs`，两个版本 sha256 前缀：`88dc4f6f`（早期：Pearl 5 次 + `phase-orca-oc` 首调）、`f55db20c`（其余 Orca 调用，当前文件 sha 为 `f55db20c6697d072c5ebe2ab80a4366c2a4f3e251b20dc28968f156ca9bf9b07`） |
| 参考图策略 | **Orca 只使用本 OC 自产图**；Pearl 草稿使用了无授权同人图 ref10（内部，见 §3） |
| key 处理 | key 仅在本机凭据文件/环境变量；元数据**不含 key**；本文件不记录 key。历史上的 key 处置见 `docs/PEARL-HERO-AI-DRAFT-LOG-2026-11-14.md` §5（已建议 revoke）。 |

## 2. Orca OC 调用链（19 次记录，合计 **$1.198385**）

> 时间均为 UTC（+08 = 本地）。输出 sha 为前缀（完整值见对应 `.json`）；`MATCH` = 与 `D:\Orca` 磁盘文件 sha256 一致。
> 其中 2 组为同 prompt 重跑（`phase-orca-oc`、`orca-normal-front`，输出 sha 不同 ⇒ 是同提示词的再次生成，不是重复记录）。

| # | phase | called_at (UTC) | aspect | 参考图数 | prompt sha256（前 12） | 输出 sha256（前 12） | 成本 USD | 校验 |
|---:|---|---|---|---:|---|---|---:|---|
| 1 | `phase-orca-oc` | 2026-11-14T13:53:44.663Z | 1:1 | 0 | `ca4cebd73b46` | `3d338ad7a319` | 0.055210 | MATCH |
| 2 | `orca-normal-front` | 2026-11-14T14:04:06.635Z | 2:3 | 1 | `1d50084f91e4` | `89d00eb8435f` | 0.050832 | MATCH |
| 3 | `orca-normal-alt` | 2026-11-14T14:05:14.605Z | 2:3 | 2 | `70eef193fa07` | `21b41935df2b` | 0.062865 | MATCH |
| 4 | `orca-normal-sheet` | 2026-11-14T14:06:12.386Z | 3:2 | 2 | `2463a8190237` | `72ae84ccfae1` | 0.062935 | MATCH |
| 5 | `orca-chibi-sheet` | 2026-11-14T14:07:07.483Z | 3:2 | 1 | `1c1133471fbb` | `7373e5d1393c` | 0.050592 | MATCH |
| 6 | `phase-orca-oc`（重跑） | 2026-11-14T15:14:01.802Z | 1:1 | 0 | `ca4cebd73b46` | `e785a6774b3c` | 0.055210 | MATCH |
| 7 | `orca-normal-front`（重跑） | 2026-11-14T15:14:50.912Z | 2:3 | 1 | `1d50084f91e4` | `6070bdd62b3f` | 0.050832 | MATCH |
| 8 | `orca-sheer-tights` | 2026-11-14T15:15:52.638Z | 2:3 | 2 | `c4c98c1f139f` | `0ab05fdf99c0` | 0.062810 | MATCH |
| 9 | `orca-long-tail` | 2026-11-14T15:16:40.359Z | 2:3 | 2 | `412ddeac5b86` | `e211878aa5c7` | 0.062910 | MATCH |
| 10 | `orca-long-straight-hair` | 2026-11-14T15:17:31.695Z | 2:3 | 2 | `770c680d13ea` | `27b6945e5210` | 0.062910 | MATCH |
| 11 | `orca-cyber-mecha` | 2026-11-14T15:18:36.356Z | 2:3 | 2 | `28e1fe0fe3c7` | `9b5cc54ba44b` | 0.063240 | MATCH |
| 12 | `orca-cyber-modular-sheet` | 2026-11-14T15:20:01.890Z | 3:2 | 2 | `e19c141a15f6` | `60b45e98d08d` | 0.063150 | MATCH |
| 13 | `orca-cute-loli` | 2026-11-14T15:41:17.955Z | 2:3 | 2 | `2ad1e79a8a9e` | `9ba7fd8a2cfa` | 0.063295 | MATCH |
| 14 | `orca-blue-redesign` | 2026-11-14T15:50:29.602Z | 2:3 | 2 | `e10a1c5a5d06` | `6220f0df086a` | 0.063435 | MATCH |
| 15 | `orca-blue-redesign-chibi` | 2026-11-14T15:51:34.063Z | 1:1 | 3 | `1cff25194ea0` | `2af87635ecca` | 0.082792 | MATCH |
| 16 | `orca-breton-sheer` | 2026-11-14T15:52:25.881Z | 2:3 | 2 | `1647a0aad578` | `39e481574967` | 0.063105 | MATCH |
| 17 | `orca-nostreak-white-markings` | 2026-11-15T00:57:30.012Z | 2:3 | 2 | `7bfd704e069a` | `16dfe32c704f` | 0.063510 | MATCH |
| 18 | `orca-nostreak-v2` | 2026-11-15T01:12:54.540Z | 2:3 | 3 | `d98529e799a1` | `37b3f279fe49` | 0.077158 | MATCH |
| 19 | **`orca-nostreak-v3`** | 2026-11-15T01:18:49.259Z | 2:3 | 3 | `418cea769eed` | `13e0f8d8fba9` | 0.081594 | MATCH |

**合计（19 条）**：prompt 字符 27,138；成本 **$1.198385**（JSON `cost_usd` 求和；与 `calls-ledger.jsonl` 中 Orca 部分一致）。

### 2.1 临时权威 v3 的完整记录（用户 2026-11-15 指定“暂时为准”）

```text
文件            D:\Orca\oc-revisions\orca-nostreak-v3-20261115-091849.png
尺寸/透明度     1024×1536 PNG，has_alpha=true，1,113,951 B
prompt_sha256   418cea769eed3d865e73d819c7243cf76f83e7b7cbb8c522f0f0720c508db2c1
prompt_chars    2815
config_sha256   ba99c13c46d290796ed44cbfdab9460cb15e52fa8b97aab2483ed7367fbcad9d
body_sha256     30039eb2a90e202bb6cd3fe0687f91ce1fa9345576b93b3c161a2f5d6a1bbb5f
body_bytes      4,511,761（含 base64 参考图）
output_sha256   13e0f8d8fba992e241837b08f6c8653a6f93fe7ef9fc5df45b4bd2b4d3152edf
参数            aspect_ratio=2:3, quality=high, background=transparent, output_format=png, n=1
参考图          orca-nostreak-v2-20261115-091254.png        37b3f279fe49b2c010be7396152ae223039a51ffc059b94002a24b91d6acde7a
                orca-nostreak-white-markings-…png         16dfe32c704f243d319766cee53e2cfc10c07c99e0d9254144dca55b02677bd3
                orca-normal-front-20261114-231450.png     6070bdd62b3f0ffa5055cc52e2729db9d9845530e7a42bd06cda0bee83880f98
调用            2026-11-15T01:18:49.259Z（本地 09:18:49+08），elapsed 46,556 ms，HTTP 200
usage/cost      prompt 5,322 tok / image 1,372 tok / total 6,694 tok → $0.081594
note（脚本通用）  "AI draft for internal evaluation only; not final art; reference-derived draft input is not licensed for release."
```

> 关于 `note`：这是生成脚本的**通用提示**；v3 的 3 张参考图均为本 OC 自产图（见上），不涉及 ref10/溟月。但“不是 final art、内部评估用”的判断仍然有效——v3 未做人工像素终审。

### 2.2 人工修改链（Human edits，非 AI 调用）

| 处理 | 工具/脚本 | 脚本 sha256（前 16） | 备注 |
|---|---|---|---|
| 像素化 128 pack | `art/_placeholder/refs/tools/ai_hero_pipeline.py`（gitignored） | `5a73493b8306489e` | 生成 `D:\Orca\pixel\pack-orca-128*`；`pipeline-result.json` 记 PASS/36 帧/bbox/色数 |
| 像素化 128（自定义调色板） | `art/_placeholder/refs/tools/ai_hero_pipeline_128.py` | `3c3ee15d68cd538f` | 同上 |
| 蓝色调色 | `art/_placeholder/refs/tools/blue_orca_grade.py` | `374608f58a291c05` | 13 张原图本地确定性调色，无新 AI 调用 |
| 通用像素化 | `scripts/pixelize.py`（tracked） | `efa5c217aac142ac` | |
| 占位渲染 | `scripts/placehold.py`（tracked） | `aeed16b5bac7402f` | 无图像模型 |
| 语音 pilot 生成 | `scripts/voice-pilot.mjs`（tracked） | `ae1912c23d0c1c34` | 见 §4 |
| v3 细节图 | 本地裁切/合成 `orca-nostreak-v3-details.png` | — | 无独立生成记录（非 AI 调用） |

> 这些脚本在 `art/_placeholder/`（gitignored）；若未来要作为“人类智力投入/可复现管线”证据随产品发布，应把**脚本版本 + sha** 与输出一起归档（当前只有本地）。

### 2.3 成本交叉核对

- Orca 19 条：$1.198385；Pearl 5 条：$0.31249；合计 **$1.510875** = `calls-ledger.jsonl` 24 条成本求和（精确一致）。
- `D:\Orca\README.md` 的 “$0.282434（早期 5 次）” 是上述 #1–#5 的子集：0.055210+0.050832+0.062865+0.062935+0.050592 = 0.282434。
- 价格快照为 2026-11-14/15 的 OpenRouter 记录；后续以账单为准。

## 3. Pearl 调用链（5 次记录，合计 **$0.31249**）— 仅内部，**不可发布**

| # | phase | called_at (UTC) | aspect | 参考图 | prompt sha256（前 12） | 输出 sha256（前 12） | 成本 USD |
|---:|---|---|---|---|---|---|---:|
| 1 | `phase-a` | 2026-11-14T10:58:27.580Z | 1:1 | `ref10-front-crop-padded.png`（同人图，无授权） | `b7061b02301a` | `57abc991bd42` | 0.063122 |
| 2 | `phase-b` | 2026-11-14T10:59:23.508Z | 1:1 | phase-a 输出 | `f07e769c1828` | `d4075d8fbe4b` | 0.062242 |
| 3 | `phase-a-128` | 2026-11-14T12:09:41.004Z | 1:1 | `ref10-front-crop-padded.png` | `cb79d75bf4dd` | `0ea3108437f2` | 0.062237 |
| 4 | `phase-a-128-v2` | 2026-11-14T12:31:13.678Z | 1:1 | `ref10-front-crop-padded.png` | `a4a4e179b642` | `3d693ddf8313` | 0.062352 |
| 5 | `phase-a-128-v3` | 2026-11-14T12:37:09.953Z | 1:1 | `ref10-front-crop-padded.png` | `3db0b9a7f4cb` | `98f4266e699b` | 0.062537 |

- **风险（重要）**：Pearl 草稿把 **ref10（JerryZRic，无授权同人图）** 作为 `input_references` 上传至 OpenRouter/OpenAI。据此派生的图与像素化结果**不得发布、不得进商店/宣传/press kit、不得当正式素材**（`docs/PEARL-HERO-AI-DRAFT-LOG-2026-11-14.md` §4；`docs/PEARL-ART-LICENSE-CHAIN-2026-11-14.md`）。Orca 的生成**未使用** ref10/溟月参考图（Orca JSON 的 refs 均为自产图；另有用户文档声明）。
- Pearl prompt 文本部分保存在 `gen-config.json`（如 `phase-a` / `phase-b` / `phase-a-128*` 的完整 prompt）；Orca prompt 文本**未见落盘**（只有 sha/字符数，见 §5 缺口）。
- 输出 sha 与本地 `ai-drafts/*.png` 同样全部 MATCH；文件在 gitignored 目录。

## 4. 语音（TTS）生成链 — 非图像，内部占位

| 项 | 值 |
|---|---|
| 服务/模型 | DeepSeek TTS API，`voice_id=stella`（默认）/`tide`（可选），`format=wav` |
| 端点 | `https://api.deepseek.com/v1/tools/tts` |
| 脚本 | 首轮/补录（stella 18 句）：`scripts/voice-pilot.mjs`（sha256 前 16 `ae1912c23d0c1c34`）；2026-11-17 起 manifest 维护/校验/增量生成：`scripts/bake-voice.mjs`（默认 dry-run；`--verify` 逐文件校验；只有显式 `--generate` 才调用 API，且已有 WAV 默认复用） |
| 首次生成 | 2026-11-14；提交 `86de18c`（10 句，替换旧 SAPI 占位） |
| 补录 | 提交 `9c15330`（stella +8 句，共 18）；2026-11-17 补录 stella `say_night`/`say_idle_here`/`say_unknown`（stella 共 21 句） |
| tide 生成 | 2026-11-17，用户用自己账号经 `scripts/bake-voice.mjs --generate --voice=tide` 生成 21 句（同日补 stella 后 tide 复刻同一 21 句台词集）；实际账单未入账 ⇒ **TBD**（估算 330 计费字符 ≈ ¥0.0495 限时价 / ¥0.099 标价） |
| 当前文件 | 42 个 WAV，`public/assets/voice/pet/`（stella 21 个在根目录 + tide 21 个在 `tide/`），合计 **4,289,208 B**（stella 2,049,564 B + tide 2,239,644 B），24 kHz 单声道 16-bit；2026-11-17 起作为 **baked pack 随包缓存**（用户授权） |
| 逐文件元数据 | manifest v2（`public/assets/voice/pet/manifest.json`）：42 行，每行 `voice=stella|tide` / `provider=deepseek-tts` / `ai=true` / `license=deepseek-tts-terms` / `bytes` / `durationMs` / `sha256`；`voicePresets`: `stella=available`(21)、`tide=available`(21) |
| 校验 | `node scripts/bake-voice.mjs --verify`：42/42 文件 bytes+sha256+duration MATCH（2026-11-17 本机；本集成任务零 API 调用）；stella 根目录、tide `tide/` 布局与跨音色不同哈希均校验；完整 sha 见 manifest，§10.2 列前缀 |
| 计费字符（估算） | 每音色 330（21 句；中文 2/其他 1） |
| 成本记录 | stella 首轮 10 句 ¥0.0234（156 字符）；stella 补录 8 句成本**未单独入账 ⇒ TBD**；stella+tide 各 21 句按限时价重算 ≈ ¥0.0495/音色、标价 ≈ ¥0.0990/音色（**估算，非账单**；合计 ≈ ¥0.099 限时价 / ¥0.198 标价）；tide 实际账单 **TBD** |
| 条款状态 | **用户 2026-11-17 授权 baked 随包缓存**（stella 默认 + tide 可选）；版权/再分发/商用/署名仍以 DeepSeek TTS 条款为准（**TBD**，`THIRD-PARTY.md` §2、`docs/legal/TTS-TERMS.md` §3A）；**未**律师审核；非克隆、不冒充真人；未来新增音色在补 baked 前保持 planned |
| 人工修改 | 无内容修改（直接使用 API 输出；WAV 已做响度 normalize，未改台词/音色） |

## 5. 缺口与待办（证据层）

| # | 缺口 | 影响 | 建议动作 |
|---|---|---|---|
| 1 | **Orca prompt 原文未落盘**（只有 sha/字符数；`gen-config.json` 是 Pearl 阶段） | 可复现性与“人类智力投入”证据减弱；律师可能要求 prompt 文本 | 从生成会话/本地记录恢复 prompt，按 §6 模板保存（**不含 key**）；恢复不了则标注“不可恢复” |
| 2 | `request_id` 为 null | 无法向供应商对账单次请求 | 未来调用记录 provider 返回的 id；对账用账单 |
| 3 | 无 seed | 无法逐像素复现 | 记录“不可复现”；保留输出 sha + 参考图 sha 即可追溯 |
| 4 | 元数据内 `file` 路径过期（指向旧 `ai-drafts/`） | 人工按路径找文件会困惑 | 未来记录写迁移后路径；本次以 sha 认定 |
| 5 | Pearl 5 次含无授权参考图 | 草稿/派生不得发布 | 保持 gitignored；公开前扫描确认未入库；不要复用其像素化输出 |
| 6 | TTS 补录 8 句无成本记录 | 记账不完整 | 若账单可查则补记；否则标 TBD |
| 7 | 人工修改工具多为 gitignored 本地脚本 | 管线不可复现/证据不随产品 | 关键脚本（pixelize/pipeline）纳入版本控制或归档，并记录 sha |
| 8 | 未做 C2PA/IPTC 元数据写入 | AI 隐式标识缺失 | 发布流程 P1 落地（见 `docs/LEGAL-STATUS-2026-11-15.md` §6） |

> **2026-11-17 状态**：缺口 #6（TTS 成本/哈希）部分闭环——42 文件（stella 21 + tide 21）bytes/duration/sha256 已写入 manifest v2 并机器校验（§10）；stella 补录 8 句与 tide 实际账单仍 TBD；2026-11-17 代码/文档集成工作**未调用任何 TTS/ASR API**（0 计费；WAV 由用户此前生成）。缺口 #8（C2PA/IPTC）仍未做，见 §10.5。

## 6. 如何新增记录 / 保留证据（模板）

### 6.1 每条生成记录的 JSONL 模板

建议文件：`provenance/orca.jsonl`（**未来新增，本草案未创建该文件**；仓外可先放 `D:\Orca\provenance\`）。一条一行：

```json
{
  "asset_id": "orca.oc.v3",
  "file": "D:\\Orca\\oc-revisions\\orca-nostreak-v3-20261115-091849.png",
  "phase": "orca-nostreak-v3",
  "model": "openai/gpt-image-2.6-sunburst",
  "provider": "OpenRouter",
  "endpoint": "https://openrouter.ai/api/v1/images",
  "called_at": "2026-11-15T01:18:49.259Z",
  "params": { "aspect_ratio": "2:3", "quality": "high", "background": "transparent", "output_format": "png", "n": 1 },
  "prompt_text_path": "D:\\Orca\\prompts\\orca-nostreak-v3.txt",
  "prompt_sha256": "418cea769eed3d865e73d819c7243cf76f83e7b7cbb8c522f0f0720c508db2c1",
  "prompt_chars": 2815,
  "references": [
    { "path": "D:\\Orca\\oc-revisions\\orca-nostreak-v2-20261115-091254.png", "sha256": "37b3f279fe49b2c010be7396152ae223039a51ffc059b94002a24b91d6acde7a" }
  ],
  "output_sha256": "13e0f8d8fba992e241837b08f6c8653a6f93fe7ef9fc5df45b4bd2b4d3152edf",
  "usage": { "cost_usd": 0.081594, "prompt_tokens": 5322, "image_tokens": 1372 },
  "human_edit": [
    { "tool": "scripts/pixelize.py", "tool_sha256": "efa5c217…", "what": "128x128 pixelize, 27 colors", "at": "2026-11-15" }
  ],
  "license": "CC-BY-NC-SA-4.0 (draft; LICENSE-ART)",
  "ai_disclosure_required": true,
  "release_ok": false,
  "note": "internal draft; not final art"
}
```

### 6.2 新增一次生成的落地步骤

1. **调用前**：确定 `asset_id`；保存 prompt **原文**（`prompts/<phase>.txt`）与完整参数；确认参考图均有明确许可（**禁止**使用无授权同人图做发布素材；若只用内部，必须在记录中标记 `internal_only=true`）。
2. **调用后**：立即保存供应商返回的 `.json` 元数据与输出文件；`sha256sum` 输出；记录 `called_at`、`cost_usd`、`usage`、`request_id`（若有）。
3. **校验**：重算输出 sha 与元数据 `images[0].sha256` 比对；不一致则不可入库；记录校验日期。
4. **后处理**：任何像素化/调色/裁切/合成/再生成都追加 `human_edit[]`（工具、脚本 sha、动作、日期）；保留中间文件（或至少保留 sha）。
5. **登记**：更新本文件（或在 `provenance/*.jsonl` 增行）→ `CREDITS.md` 加 TASL → 相关图随附 `LICENSE-ART`。
6. **发布判定**：`release_ok=true` 需要同时满足：许可已确认 + 相似度审查通过 + 第三方条款确认 + AI 披露方案落地；否则保持 `false`。
7. **保留期与安全**：保留 prompt/元数据/输出 sha 至少与发布物同寿命；**绝不写入 API key、账号 token、个人隐私数据**；如 prompt 含个人信息，先脱敏再入库。

### 6.3 可复核命令

```bash
# 输出 sha 与元数据核对
sha256sum "D:/Orca/oc-revisions/orca-nostreak-v3-20261115-091849.png"
python3 - <<'PY'
import json
d=json.load(open('D:/Orca/oc-revisions/orca-nostreak-v3-20261115-091849.json'))
print(d['response']['images'][0]['sha256'])
PY

# 全部 Orca 元数据一览（只读）
python3 - <<'PY'
import json,glob
for j in glob.glob('D:/Orca/**/*.json',recursive=True):
    d=json.load(open(j))
    if 'request' in d: print(d['phase'], d['called_at'], d['response']['cost_usd'])
PY

# TTS 文件 hash（用于替换/追溯）
sha256sum public/assets/voice/pet/*.wav
```

### 6.4 TTS 新增记录要点

- 记录：`voice_id`、API 端点、manifest 版本、生成日期、脚本 sha、每句计费字符、成本；
- 保存：`manifest.json` + 生成结果（WAV）+ 文件 sha；不要保存请求头/Authorization；
- 若用运行时云 TTS（非预生成），记录“哪一句实时生成、供应商、缓存位置”，并在首启/设置页披露 AI 合成语音。

## 7. 与 AI 披露/可版权性的关系

- 本文件的记录是**人类智力投入**（提示词迭代、参考图组织、筛选、后处理）的辅助证据；它**不能保证** AI 输出在中国/美国/欧盟构成作品（见 `LICENSE-ART` §5）。
- 发布时按渠道做显式 + 隐式标识：图片角落 “AI 生成” 标注、PNG/XMP 元数据、商店页 AI 申报、首启 “AI 语音/对话，可能出错” 等；具体待律师/用户确认（`docs/LEGAL-STATUS-2026-11-15.md` §6）。
- 本文件不记录任何 key；若发现 key 泄露，按用户凭据流程 revoke，**不要**把 key 写进任何文档/提交。

## 8. 变更记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-15 | 首版草案：汇总 Orca 19 条 + Pearl 5 条 + TTS 18 文件；记录校验/成本/缺口与新增模板 | draft；待用户 + 律师确认 |
| 2026-11-17 | TTS 18 WAV 转 baked pack 随包（用户授权）；manifest v2 逐文件元数据 + `scripts/bake-voice.mjs`；tide 保持 planned/不伪造；本次零 API 调用 | draft；上游条款/再分发 TBD，未律师审核 |
| 2026-11-17 | 资产口径更新：baked pack 扩为 **42 WAV（21 stella + 21 tide）**，双预设 available、tide 在 `tide/`；运行时按 voice 选包且缓存键含 voice；构建/法务 guard 校验 42 行/双 available/跨音色不重用；本次集成零 API 调用 | draft；tide 实际账单/上游条款仍 TBD，未律师审核 |
| 2026-11-20 | 登记 `public/assets/pet/anim/dog/**` 确定性占位动画包（§11）：v11、68 帧 / 66 唯一 SHA-256、2 组 alias、`ai.status=none`、生成器与复验命令；`character.json` meta 从 v7 修正为 v11 | draft；仍 placeholder-only，未律师审核 |

> 本文件是草案，不是法律意见；所有成本/条款以供应商账单与官方文本为准。

## 9. 2026-11-17 新增 AI/非 AI 资产

| 资产 | 生成方式 | 模型/工具 | 状态/证据 |
|---|---|---|---|
| `public/assets/pet/tinglan-256/` 49 PNG | AI concept + 本地像素锚点/色板/后处理 | `openai/gpt-image-2.6-sunburst`（仅概念）；本地 PIL 收口 | `final:false`；机器 gate 49/49；人工 2× 终审未做；源/成本见 `art/_placeholder/orca-tinglan-256-2026-11-17-v2/`（gitignored） |
| `public/assets/ui/` 91 逻辑/97 物理 | **无 AI**；本地确定性 PIL 像素绘制 | `scripts/gen_ui91.py` | `ai:none`、0 API、0 网络；QA/report 见 `docs/art/ui-91-qa/`、`docs/art/UI-91-GENERATION-2026-11-17.md` |
| 汀岚/猫/狗 OC 文本与 prompts | 人工设计/文档 | 无图像 API（猫狗未生图） | `docs/art/oc/**`、`docs/art/OC-COMPLETION-2026-11-17.md` |

**发布标识**：以上 AI 概念资产仍需按渠道做显式/隐式 AI 标识；UI 为本地绘制，仍标 placeholder-only。不得把 `final:false` 资产宣称为 final。

## 10. 2026-11-17 TTS baked pack（用户授权随包缓存；stella + tide）

### 10.1 授权与来源

- **用户授权（2026-11-17）**：用 DeepSeek 合成音色 `stella`（默认）与 `tide`（可选）预生成桌宠台词并缓存随包，避免每次调用付费；授权记录见 `docs/legal/TTS-TERMS.md` §3A。
- **来源**：DeepSeek TTS API `https://api.deepseek.com/v1/tools/tts`，`voice_id=stella`/`tide`、`format=wav`；stella 生成 2026-11-14 并补录至 21 句，tide 生成 2026-11-17（21 句），24 kHz/mono/16-bit，WAV 已做响度 normalize（未改台词/音色）。
- **非克隆**：仅用服务商合成音色；无真人样本/参考音频/声纹/克隆，不冒充真人。
- **版权/再分发**：仍以 DeepSeek TTS 条款为准（**TBD**）；本项目不主张音频版权、不单独再授权；**未**律师审核。用户授权 ≠ 服务商许可。
- **零调用记录**：本文档/代码集成工作（2026-11-17）只读取本地 WAV 与 manifest，未调用任何 TTS/ASR API（0 计费字符）；tide WAV 的实际生成账单未入账（TBD）。

### 10.2 逐文件元数据（manifest v2，42 行）

`public/assets/voice/pet/manifest.json` 每行：`voice=stella|tide`、`provider=deepseek-tts`、`ai=true`、`license=deepseek-tts-terms`、`bytes`、`durationMs`、`sha256`；`voicePresets` 双 available（stella 21、tide 21）；`pendingLines: []`。stella 文件在包根目录，tide 文件在 `tide/`；同句跨音色文件与 sha256 均不同（不互相冒充）。完整 sha256 以 manifest 为准；`node scripts/bake-voice.mjs --verify` 可重算 **42/42**：

| voice | id | text | bytes | durationMs | sha256 前缀 |
|---|---|---|---:|---:|---|
| `stella` | `hello` | 你来了。 | 48044 | 1000 | `93c109d46111a3fd…` |
| `stella` | `pat_a` | 再摸一下也可以。 | 84524 | 1760 | `5555dc2b7b7f48c4…` |
| `stella` | `give_a` | 这张纸，我要了。 | 76844 | 1600 | `f59986dab7905b8c…` |
| `stella` | `fold_a` | 折痕会记住今天。 | 88364 | 1840 | `b3ce7eafd32eba7d…` |
| `stella` | `idle_a` | 你忙你的，我在这里。 | 103724 | 2160 | `6d46909c1c0d5562…` |
| `stella` | `return_a` | 你回来了。书页一直停在这里。 | 142124 | 2960 | `c0d24c26adc13010…` |
| `stella` | `night_a` | ……这么晚。我给你留了灯。 | 109484 | 2280 | `38c628b59c605d2c…` |
| `stella` | `morning_a` | 早。今天书页很轻。 | 132524 | 2760 | `cf61277e1f9d38bd…` |
| `stella` | `need_paper` | 还差一张纸。 | 76844 | 1600 | `11fa15a1a308e3a5…` |
| `stella` | `rename_a` | 嗯，这样叫我。 | 73004 | 1520 | `0c3a5dea3ff60fdf…` |
| `stella` | `pat_b` | 你的手有点凉。 | 73004 | 1520 | `e416d2bcc2cfa4e9…` |
| `stella` | `pat_c` | 我记得你。 | 73004 | 1520 | `ed950aa05a78fc89…` |
| `stella` | `give_b` | 折角又多了一点。 | 90284 | 1880 | `bf95c4a63713c187…` |
| `stella` | `give_c` | 可以把它夹进书里吗？ | 78764 | 1640 | `ce2eac79c1b1ac3c…` |
| `stella` | `fold_b` | 看，一只小东西。 | 103724 | 2160 | `9a801da0184c9796…` |
| `stella` | `idle_c` | 书页在响。 | 69164 | 1440 | `302e9d15107e8b30…` |
| `stella` | `rename_b` | 新名字？我会记住的。 | 128684 | 2680 | `dfe0dcaa9acecafc…` |
| `stella` | `pat_d` | 嗯。 | 36524 | 760 | `04ee1f1e0f83d101…` |
| `stella` | `say_night` | 晚安。灯我留着，明天见。 | 142124 | 2960 | `286d748861c21801…` |
| `stella` | `say_idle_here` | 我在。你忙你的，我在这里。 | 145964 | 3040 | `1bc9bdb57cce01e5…` |
| `stella` | `say_unknown` | 我听见了。不过这句话我还不太懂。 | 172844 | 3600 | `bc49301d566640c8…` |
| `tide` | `hello` | 你来了。 | 61484 | 1280 | `d84e9c144010381d…` |
| `tide` | `pat_a` | 再摸一下也可以。 | 86444 | 1800 | `703e7cbc95708698…` |
| `tide` | `give_a` | 这张纸，我要了。 | 105644 | 2200 | `9772f032eaaa364c…` |
| `tide` | `fold_a` | 折痕会记住今天。 | 99884 | 2080 | `00797c38d000d582…` |
| `tide` | `idle_a` | 你忙你的，我在这里。 | 121004 | 2520 | `88aa9df61654f215…` |
| `tide` | `return_a` | 你回来了。书页一直停在这里。 | 151724 | 3160 | `fe0cfc7a1ca296f7…` |
| `tide` | `night_a` | ……这么晚。我给你留了灯。 | 145964 | 3040 | `919d9c8d5f5620c7…` |
| `tide` | `morning_a` | 早。今天书页很轻。 | 126764 | 2640 | `1d360255e5de2915…` |
| `tide` | `need_paper` | 还差一张纸。 | 82604 | 1720 | `d44d5daf7dc8fc0e…` |
| `tide` | `rename_a` | 嗯，这样叫我。 | 86444 | 1800 | `a86f173227b964d3…` |
| `tide` | `pat_b` | 你的手有点凉。 | 92204 | 1920 | `26877f790d247dc1…` |
| `tide` | `pat_c` | 我记得你。 | 71084 | 1480 | `998e2cf0950f0c1b…` |
| `tide` | `give_b` | 折角又多了一点。 | 103724 | 2160 | `d539d07980056230…` |
| `tide` | `give_c` | 可以把它夹进书里吗？ | 90284 | 1880 | `a6d552de645975db…` |
| `tide` | `fold_b` | 看，一只小东西。 | 115244 | 2400 | `b5ccc14317099097…` |
| `tide` | `idle_c` | 书页在响。 | 65324 | 1360 | `f980ff46cfd6b5f1…` |
| `tide` | `rename_b` | 新名字？我会记住的。 | 140204 | 2920 | `81511e6db05c8e29…` |
| `tide` | `pat_d` | 嗯。 | 36524 | 760 | `64e25a9a28e420a4…` |
| `tide` | `say_night` | 晚安。灯我留着，明天见。 | 140204 | 2920 | `35c8e59dc7d948d2…` |
| `tide` | `say_idle_here` | 我在。你忙你的，我在这里。 | 155564 | 3240 | `d1a531ed04f207bd…` |
| `tide` | `say_unknown` | 我听见了。不过这句话我还不太懂。 | 161324 | 3360 | `e974bf45b87f086b…` |

合计：stella 21 句 **2,049,564 B** + tide 21 句 **2,239,644 B** = 42 句 **4,289,208 B**。

### 10.3 已 baked / 未 baked

- **stella（21/21 baked）**：18 条原有台词 + `say_night`/`say_idle_here`/`say_unknown`（2026-11-17 补录）；`pendingLines` 已清空。
- **tide（21/21 baked）**：同一 21 句台词集的 `tide/` 音频；行 `voice=tide`、`file=tide/<id>.wav`。
- **无法 baked（2 条动态模板）**：名字问候（`我叫${name}。住在书页折角里。`）与记忆回引（`我还记得：${text}`）由状态拼接，保持云/系统 TTS。
- **规范化覆盖**：`……嗯。` 经 `normalizeBakedText` 命中 `pat_d`（前导省略号容错沿用 `tests/voice-baked.test.ts`）。
- **未来音色**：manifest/guard/测试只接受 stella+tide；新增音色需先加白名单/catalog、显式付费 bake，未 bake 前保持 planned，不得用其他音色文件顶替。

### 10.4 构建与运行时

- `vite.config.ts` 的 `bakedVoiceGuard`：要求 42 行、stella/tide 各 21、双 available、`tide/` 21 个 WAV、根目录 21 个 stella WAV；逐行 bytes/sha256/duration/dist 副本一致；拒绝未知 voice/额外文件/跨音色同哈希；构建后统计输出 `42 WAV(s) ... stella 21 / tide 21`。
- `src/voice/baked.ts`：`VoiceRequest.voice` 可选（默认 stella），`BakedVoiceProvider` 按 voice 过滤并命中对应文件；voice 不可用（planned/未知）在请求音频前即 miss；legacy 无 voice 行只按 stella 处理；`tide` 绝不回退使用 stella 文件。
- `src/voice/service.ts`：缓存/in-flight key 含 voice（默认 `defaultVoice='stella'`），stella/tide 不串音；free baked 命中不计云预算；paid provider 仅在未命中时尝试。
- 云 provider（`deepseek.ts`/`tauri.ts`）在未命中时优先使用请求里的 voice，缺省仍为构造时的 stella。
- 证据/审计：`docs/audit/TTS-BAKE-2026-11-17.md`；测试 `tests/voice-baked-pack.test.ts`、`tests/tts-bake-script.test.ts`、`tests/tts-bake-build.test.ts`、`tests/legal-package-gate.test.ts`。

### 10.5 仍 blocked / 未闭环

1. **tide 实际账单 / stella 补录 8 句成本**：未入账（TBD）；只能给估算，不能声称零成本或已对账。
2. **2 条动态模板台词**无法 baked，仍走云/系统 TTS；是否改设计待定。
3. **音频隐式元数据**：未写 C2PA/IPTC/XMP；WAV 内无 AI 标识（AI 披露靠文档/UI 规则，见 TTS-TERMS §8）。
4. **条款/再分发**：DeepSeek 对输出音频的再分发/商用/署名条件未取得书面确认（TBD）；**未**律师审核。
5. **人工听感 / MOS / 最终配音**：未做；baked 音频仍是 pilot，不是最终配音。
6. **跨写入范围旧口径**：`docs/legal/RELEASE-BLOCKERS.md`、`docs/RELEASE-RUNBOOK.md`、`SECURITY.md`、`docs/VOICE-COMPANION-PLAN.md`、`scripts/export-public-pet.mjs` 等仍可能写 18 WAV/未确认口径（本任务未改）；`public/legal/` 的 TTS-TERMS/PACKAGE-MANIFEST 副本需收口时 `node scripts/legal-check.mjs --sync`。

### 10.6 成本（估算，非账单）

| 项 | 句数 | 计费字符 | 限时价 1.5 元/万 | 标价 3 元/万 | 说明 |
|---|---:|---:|---:|---:|---|
| stella 已 baked | 21 | 330 | ¥0.0495 | ¥0.0990 | 2026-11-14 已发生；首轮 10 句实付 ¥0.0234，stella 补录 8 句未单独入账（TBD） |
| tide 已 baked | 21 | 330 | ¥0.0495 | ¥0.0990 | 2026-11-17 生成；实际账单 **TBD**（未入账），以上仅估算 |
| 合计（42 WAV） | 42 | 660 | ≈ ¥0.0990 | ≈ ¥0.1980 | 估算合计，不代表实际付款 |

### 10.7 复现 / 验收命令

```bash
node scripts/bake-voice.mjs                 # dry-run：42/42 baked、双 available、0 pending；不联网不写
node scripts/bake-voice.mjs --verify        # 42/42 bytes+duration+sha256 校验；stella/tide 布局校验
DEEPSEEK_API_KEY=... node scripts/bake-voice.mjs --generate --voice=tide  # 42/42 已缓存 => 不联网、不调用
npx tsc --noEmit && npm test && npm run build
node scripts/legal-check.mjs                # WARN-ONLY；dist baked pack 42 行通过 voice gate
```

## 11. 2026-11-20 确定性像素动画包（dog / cat；`ai.status=none`）

> 本节登记 `public/assets/pet/anim/**` 的 dog 与 cat 两个完整条目（human 待补）。**没有调用任何图像 / TTS / ASR API，没有模型、没有网络、没有 seed**；68 帧全部由本机 Python + Pillow 确定性绘制，因此 `ai.status=none`、`final=false`、`placeholder=true`。**仍是 placeholder-only，不得当 final 发布。**

### 11.1 金毛（dog，v11）

| 项 | 值 |
|---|---|
| 资产 | `public/assets/pet/anim/dog/`：68 PNG + `manifest.json`，共 119,611 B（≈116.8 KiB） |
| 生成器（包壳/调色板/调度） | `scripts/gen-pet-anim-frames.py`，SHA-256 `6a05609e00ebed755ba9d48917c59c66c4e6caf0e57d1af6f330be9bf6e23481` |
| 生成器（金毛绘制几何） | `scripts/dog_golden5.py`，SHA-256 `657199683f069a6c396b87f0483730360deeb9f2dcb5cbb45b19eb29fb2c3030` |
| 运行环境 | Python 3.12.3 + Pillow 13.0.0 + numpy 2.5.4（本机实测）；无网络 / 无模型 / 无 API key / 无 seed |
| 版本 | **v11**：风格化短腿 + 哑光砖红项圈（`#a63d35`）+ 羽状尾；12 clip / 68 帧 / 96×96 / 地线 y=89 |
| 元数据 | `public/characters/pet-dog/character.json`：`meta.artPack = pet.dog.anim.placeholder@v11`（2026-11-20 从 v7 修正），`meta.artStatus=placeholder`，`ai.status=none`；SHA-256 `8ffa771defe12cbd90e7154ebc0bebce13808d0e448fa236a493b14216c084cd` |
| 唯一帧 / alias | 68 个 PNG 中 **66 个唯一 SHA-256**；两组跨 clip 同字节帧（`scratch/scratch_00.png = chase_tail/chase_tail_05.png`、`scratch/scratch_05.png = stand_wag/stand_wag_05.png`）裁定为 **alias（保留文件，不删 / 不重画）**，记录在 `character.json.meta.duplicateFrames`；由 `tests/pet-anim-dog-asset-hygiene.test.ts` 对照磁盘哈希锁定 |
| manifest SHA-256 | `487f3860faf7dfb2867b0f0589309cb1a059362be655cbfb6487f2c2b2d3abed`（生成器产物，未手改） |
| 许可 | **placeholder-only**（商用未授权），2026-11-20 登记于 `ASSET-LICENSES.md` 同名节；分发按 `LICENSE-ART` |
| 未生成 | 本轮元数据整治**未重画任何帧、未生成图片、未调用 API**；无 AI 调用链 / 费用 / seed 可记（非 AI 生成） |

### 11.2 复验命令

```bash
python3 scripts/gen-pet-anim-frames.py --only dog --check        # 生成器字节级复验（须 exit 0）
node --import tsx --test tests/pet-anim-dog-asset-hygiene.test.ts  # 元数据 / alias / 登记门禁
node --import tsx --test tests/pet-anim.test.ts                   # 68 帧 / 12 clip / 硬 alpha / 地线等契约
```

### 11.3 布偶猫（cat，同配色 blue bicolor Ragdoll）

| 项 | 值 |
|---|---|
| 资产 | `public/assets/pet/anim/cat/`：72 PNG + `manifest.json`，共 145,810 B（≈142.4 KiB），另 `public/characters/pet-cat/{character,behavior,regions}.json` |
| 生成器（包壳 / 调色板 / 调度） | `scripts/gen-cat-anim.py`，SHA-256 `72e048f167d3786950aefeacf96de0f1b76c70fa54334fb4689d268b783b2c2e` |
| 渲染器（布偶直长毛几何） | `scripts/cat_selkirk.py`，SHA-256 `8ac2b641115b454e857b45c14b9c2d306fe008624b012fcad9801c9a3ffe24a1`（**文件名为历史遗留**；task-149 已把内容从卷毛渲染改为布偶直长毛渲染，删 `curl_puff` / `ringlet`） |
| 运行环境 | Python 3.12.3 + Pillow 13.0.0 + numpy 2.5.4（本机实测）；无网络 / 无模型 / 无 API key / 无 seed |
| 版本 | **同配色 blue bicolor 布偶猫**（16 个 palette hex 与旧包逐字节相同，palette id `cat-ragdoll-anim@0.1`）：白底丝滑直长毛 + 冷灰蓝连帽 / 面罩 / 耳 / 羽状尾 + v10 白 blaze，产品化短腿保留；12 clip / 72 帧 / 96×96 / 地线 y=89 / anchor 48,96 不变 |
| 元数据 | `public/characters/pet-cat/character.json`：`meta.artPack = pet.cat.anim.placeholder@v0.1`，`meta.artStatus=placeholder`，`ai.status=none`；SHA-256 `1170bc8b37bdbf4bcf194987f940dd621f046377e43d688bcf3b866b00dda2cd`（2,109 B） |
| 唯一帧 / alias | 72 个 PNG **72/72 唯一 SHA-256**（无跨 clip 同字节 alias） |
| manifest SHA-256 | `b2dc39a4ffc381a4902fa86cd107235b183bd0743734a8511995c962c2d89f23`（9,088 B；生成器产物，未手改） |
| 行为 / 区域单源 | `src/pet/anim/interactions/cat.json` → `public/characters/pet-cat/{behavior,regions}.json`（确定性生成；本次洗脸台词改为「长毛不好梳」，regions SHA-256 `965e12d4488f496fa747802c8c048187566d889452b0b605b1fd729cdfeca913`） |
| 跨仓消费 | dsh-famling **0.10.11**：`embed:anims` 重嵌入 cat 帧（72 帧，208 帧总数不变；cat chunk 97.2 KiB），`gen:content` 同步 regions / manifest 单源哈希；插件 UI 文案统一为「布偶猫」/「Ragdoll」 |
| 许可 | **placeholder-only**（商用未授权），2026-11-20 登记于 `ASSET-LICENSES.md` 同名节；分发按 `LICENSE-ART` |
| 未生成 | 本轮**未调用任何图像 / TTS / ASR API、未使用生成模型**；帧由确定性 Python 渲染器重绘；无 AI 调用链 / 费用 / seed 可记（非 AI 生成） |

### 11.4 复验命令（cat）

```bash
python3 scripts/gen-cat-anim.py --check                            # 72 帧生成器字节级复验（须 exit 0）
node scripts/gen-character-interactions.mjs --check                # behavior/regions 单源漂移门禁
node --import tsx --test tests/pet-anim-cat.test.ts                # 72 帧 / 12 clip / 16 色 / silky 指标
node --import tsx --test tests/character-interactions-single-source.test.ts
# 插件侧（sibling checkout）
cd ../plugins/dsh-famling && npm run check && npm run verify && npm test
```

### 11.5 human（同管线，待任务登记）

`public/assets/pet/anim/human/`（68 帧；`scripts/gen-human-anim.py` + Tinglan 渲染器）同属确定性占位管线，`ai.status=none` / placeholder-only。human 的逐包登记需在其任务补齐，补齐前不得宣称 final 或 AI 生成。

# 跨角色提示词系统 · CHARACTER-PROMPT-SYSTEM（汀岚 / 猫 / 狗）· 2026-11-20

> **性质**：只新增本文件，未生图、未调用任何图像/模型 API、未改代码/资产/spec/manifest/tests、未 commit。本文是**提示词系统的组装规范**，不是美术批准，也不是 API 调用记录。
> **服务对象**：`docs/art/prompts/TINGLAN-PROMPT-PACK-2026-11-20.md`、`docs/art/prompts/CAT-RAGDOLL-PROMPT-PACK-2026-11-20.md`、`docs/art/prompts/DOG-PROMPT-PACK-2026-11-20.md`。三份 pack 共用本文的 STYLE/AVOID/gate 段落，各自只维护「角色 DNA + 角色色板展开 + 动作/表情提示词」。
> **配套**：调色板 hex 唯一来源 = `docs/art/prompts/PALETTE-LOCK-2026-11-20.md`（下称 PALETTE-LOCK）。本文**不重复**任何角色的完整 hex 表，只给「写进 prompt 的短句」与引用规则。
> **基线**：本文件创建于 desktop-games `HEAD 47438ac`（2026-11-20 本机实测：Python 像素审计 + 生成器 `--check`）。**task-150 复跑（`HEAD df791b8`）**：该 checkout 的 node_modules 已是 linux-x64，`npm run typecheck` / `npm run build` 通过；task-150 相关测试子集 **71 pass / 0 fail**（8 个测试文件）；全量 `npm test` 同期因并行的 cat-ragdoll 任务在途资产出现 7 个 cat 断言失败（**非本任务**），详见 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md) §5.3。
> **非官方**：三角色均为 PerryLink 原创虚构角色，与 DeepSeek 无关联/合作/授权/背书。

## 0. 一页纸（结论先行）

| # | 锁定项 | 值 |
|---|---|---|
| S1 | prompt 结构 | **B0 法务/性质 → B1 STYLE → B2 IDENTITY → B3 PALETTE → B4 POSE/TAG → B5 FRAMING → B6 AVOID → B7 PIPELINE/DISCLOSURE** 八段拼接；缺段视为不完整 prompt |
| S2 | STYLE BLOCK | 三份 pack **逐字复用**本文 §3 的固定段；不许各自改写成「pixel art」一句话 |
| S3 | 色板写法 | prompt 只写 8–12 个关键 hex + 角色色系描述；完整 20/17/16 色表用于 post-process 吸附与验收（PALETTE-LOCK §3/§4/§5） |
| S4 | profile | 每份 pack 开篇必须声明 **A（96 运行色）或 B（128 final / 256 keyart canon 色）**；同一资产不混用（PALETTE-LOCK §1.2 R1/R3） |
| S5 | 动作契约 | 游戏运行时 = **12 clips**（非 OC 文档的 7 tags/36 帧 legacy 契约）；狗/汀岚 68 帧、猫 72 帧（cat stand_wag 10 帧特例） |
| S6 | 生成策略 | AI 只买「母版 + 每 tag 1 张关键姿态 sheet + 眼/嘴附件」；**不逐帧独立生成、不生成动画/sprite sheet** |
| S7 | 模型事实 | 管线文档记录的端点事实：**无 seed / 无 size / 无 negative 参数**；只出 1:1 1024² 或 2:3 1024×1536；透明底边缘必脏 → 后处理；AI 永不直出 final（模型可换代，新批次必须记录实际模型） |
| S8 | 负面词 | 写进正文的 avoid 段（模型无 negative 参数时），不伪造 `negative_prompt` 字段；不得塞 `child/minor/sexualized` 等触发 moderation 的词 |
| S9 | 验收 | G0 自动拒收 → G1 自动返修 → G2 人工 2×；palette/轮廓/alpha/地线/色数门见 §9 与 PALETTE-LOCK §8 |
| S10 | 披露 | 每张 AI 图必须标「AI 概念稿，未人工重绘，不是 final，非官方」；PNG/元数据保留 provenance；不得称手绘/官方 |
| S11 | 引用 | 三份 pack 必须引用 PALETTE-LOCK 与本文的稳定 section；hex 以 PALETTE-LOCK 为权威，不得引入未登记 hex 或另立跨角色 style 句 |
| S12 | 版本 | palette 变更 = PALETTE-LOCK 新版 + 三 pack 同步 + 整包重生成；prompt 临时加色 = 违规 |

## 1. 文档角色、真源与阅读顺序

| 层 | 文件 | 职责 | 谁维护 |
|---|---|---|---|
| 调色板真值 | `PALETTE-LOCK-2026-11-20.md` | 三角色 hex 注册表、A/B profile、ΔE00 裁定、prompt 用色句 | 本任务（跨角色） |
| 组装规范 | 本文 | prompt 段落结构、STYLE/AVOID/gate、模型与管线事实、三 pack 分工 | 本任务（跨角色） |
| 角色 DNA | `docs/art/oc/{tinglan,cat,dog}/OC.md` + `docs/art/oc/*/PROMPTS.md` | 身份锚点、禁忌、旧 prompt 母版 | 既有 OC 文档 |
| 风格契约 | `docs/art/PIXEL-STYLE-SPEC-2026-11-16.md` | Cel-Chunk 硬规则、AI style token 组、验收 5 项 | 既有风格文档 |
| 管线事实 | `docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md` + `PIXEL-ANCHOR-PROMPTS-2026-11-16.md` + `Q-PIXEL-PROMPT-PATCH-2026-11-16.md` | 无 seed/size/negative、1024→96/128 像素化、锚点层级、prompt 模板 | 既有管线文档 |
| 动画契约 | `src/pet/anim/timing.json` + `public/assets/pet/anim/*/manifest.json` + `scripts/anim_timing.py` | 12 clips、帧数/fps/holdMs、layer/priority | 代码/资产 |
| 三份 pack | `docs/art/prompts/{TINGLAN,CAT-RAGDOLL,DOG}-PROMPT-PACK-2026-11-20.md` | 角色专用身份/色板展开/动作与表情 prompt | 三个角色任务 |

**阅读顺序**：PALETTE-LOCK §1/§2 → 本文 §2/§3 → PALETTE-LOCK 对应角色章 → 本文 §6–§9 → 角色 pack。

## 2. 提示词组装模型（八段式）

```text
B0 LEGAL/META      original non-official OC · AI concept draft not final art · no affiliation
B1 STYLE           Cel-Chunk 固定段（§3）：flat cel pixel-art-style concept, 1px closed dark outline,
                   exactly 2-3 hard-edged shadow steps, hard binary alpha, no AA/dither/gradient/glow
B2 IDENTITY        角色 DNA：比例/剪影/身份锚点/物种特征（§5；细节由各 pack 展开）
B3 PALETTE         8-12 个关键 hex + 色系句；完整表见 PALETTE-LOCK（§5.2）
B4 POSE/TAG        clip/frame/pose 增量：只改什么、脚在基线、手/道具规则（§6）
B5 FRAMING         single full-body sprite, centred, orthographic, transparent bg, no ground shadow
B6 AVOID           正文 avoid 段：风格/色板/身份/法律四类（§7）
B7 PIPELINE        concept→pixelize→manual→gate 声明；not final；no exact pixel size promised
```

- **顺序理由**：模型对前段权重高，STYLE 必须在 IDENTITY 前（防止生成「假像素」）；AVOID 放最后作为收束；B0/B7 的「AI 概念稿」声明前后各一次，避免被当成 final。
- **每段来源**：B0/B7 复用 §3.2；B1/B5 复用 §3 的 STYLE BLOCK；B6 复用 §7；B2/B3/B4 由各 pack 角色化，但 B3 的 hex 只能来自 PALETTE-LOCK。
- **禁止**：把「96×96 / 8 帧 / sprite sheet / animation」当主句（模型会画成不一致的多帧或假网格）；禁止在 prompt 里写 `1px`/`pixel-perfect` 作为**承诺**（后处理收口，见 §4）。

## 3. 固定 STYLE BLOCK（三份 pack 逐字复用）

```text
Cel-Chunk style: clean flat 2D cel-shaded pixel-art-style concept, silhouette-first
16-bit discipline, exactly 2-3 hard-edged shadow steps per material with flat colour
fills, one crisp 1 px closed dark outline (#0B1220), hard pixel clusters (no soft
edges), limited flat palette (only the approved palette roles; no unregistered colour),
top-left single hard light, true transparent background, hard binary alpha (0/255),
single full-body sprite, centred, feet flat on the baseline, straight-on eye-level
camera, orthographic; no pure black #000000, no pure white #FFFFFF, no dithering,
no gradient, no glow, no blur, no anti-aliasing, no semi-transparent pixels, no
realistic texture, no second light source, no ground shadow, no scenery, no text,
no logo, no watermark, no UI; AI concept draft for a later manual pixel pass, not
final pixel art, do not render an exact pixel grid or promise exact pixel sizes.
```

### 3.1 八组必带 token（风格契约 §5.3 的口径）

| # | 组 | 必写 | 禁写 |
|---|---|---|---|
| 1 | 介质 | `flat 2D cel-shaded pixel-art-style concept` | `high-res pixel art`、`photo-real`、`3D render` |
| 2 | 描边 | `one crisp 1 px closed dark outline (#0B1220)` | `thick 2px outline`（会被画成 2 px 并幼儿化）、`bold outline` |
| 3 | 阴影 | `exactly 2-3 hard-edged shadow steps per material, flat colour` | `soft shading`、`ambient occlusion`、`gradient` |
| 4 | 色板 | `limited flat palette, only the approved palette roles` + 关键 hex | `dozens of colors`、`vibrant rainbow`、`colorful` |
| 5 | alpha/底 | `true transparent background, hard binary alpha` | `glow`、`shadow under feet`、`soft edge` |
| 6 | 构图 | `single full-body sprite, centred, feet on baseline, orthographic` | `sprite sheet`、`multi-pose`、`multiple characters` |
| 7 | 合法 | `non-official original OC, no existing character` | 任何官方/真人/同人指涉；官方 Logo/字标 |
| 8 | 性质 | `AI concept draft, not final pixel art, do not promise exact pixel sizes` | `pixel-perfect`、`exact sprite`、`final art` |

### 3.2 B7 PIPELINE/DISCLOSURE 固定段

```text
AI-generated concept draft for a later manual pixel pass; not final art, not
official, non-commercial placeholder; no DeepSeek affiliation; the character is a
fictional original OC, not a real person or animal.
```

## 4. 风格词表（写 / 不写 / 原因）

| 要写 | 不要写 | 原因 |
|---|---|---|
| `flat 2D cel-shaded pixel-art-style concept` | `pixel art`（单个词） | 会回「假像素」：块大小不均、自带 AA/渐变 |
| `exactly 2-3 hard-edged shadow steps per material` | `soft shading`、`smooth gradient` | 与 ≤3 阶/禁渐变契约冲突 |
| `one crisp 1 px closed dark outline (#0B1220)` | `thick outline`、`strong black outline` | 2 px 外描边会在 96 上占脸宽比例、幼儿化 |
| `limited flat palette (only approved roles)` | `rich colors`、`dozens of colors` | 防止色爆；色数交给 post-process |
| `true transparent background, hard binary alpha` | `transparent glow`、`soft shadow` | 端点 alpha 边缘必脏，后处理才能二值化 |
| `single full-body sprite, centred, feet on baseline` | `sprite sheet`、`animation frames`、`multi-pose` | 一次只出一张；多帧会互不一致 |
| `AI concept draft, not final pixel art` | `final art`、`pixel-perfect` | AI 直出不得当 final（管线铁律） |
| `about 2.5 heads tall` / 比例句 | `96x96` / `1px` / `128x128` 作为承诺 | 端点无 size 参数；写精确网格会诱导假像素块 |
| `non-official original OC` | 官方/真人/同人作品名 | 法律与 moderation 风险 |

> 例外：在「参考 sheet / 验收对照」语境可以写 `for a 96×96 runtime sprite`（说明目标轨道），但必须紧跟 `AI concept draft, not final pixel art, no exact pixel size promised`，且不得写 `pixel-perfect`/`exact 1px`。

## 5. 角色 DNA 与用色句（pack 自有部分）

### 5.1 汀岚 Tinglan（human）

- **身份锚点（always-on，漏画=错稿）**：圆细银框眼镜；左刘海蓝鲸发夹（左=画面右）；领带正中蓝鲸领夹；双耳珍珠短坠；扁平两叶虎鲸尾（黑上白下、后腰/裙后开衩）；白只限衬衫/珍珠/尾腹/眼高光。
- **比例**：96 runtime chibi 约 2.5 头身（2.4–2.6），成年克制、不幼儿化；128/256 keyart 6 头身另轨。
- **96 用色短句（A）**：见 PALETTE-LOCK §3.5；约 10 个 hex，不写完整 20 色。
- **96 专属简化**：蓝鲸发夹 → 蓝 bow 读形；领夹 2 px；珍珠按预算丢；这些是 96 占位简化，final/128 必须换回鲸形（PALETTE-LOCK §3.4 H7）。
- **禁止**：白/灰挑染、眼斑、几何鱼夹、官方鱼标、方框/无框眼镜、厚弯尾/鳐鱼尾、白手套/袜/鞋、脸红/心形瞳/低机位、文字/UI。

### 5.2 猫（当前 Selkirk Rex 96；目标「同色布偶猫」）

- **身份锚点**：白/奶油主体 ≥60%；蓝灰重点色只在面罩/耳/尾；蓝眼 + 1 px 高光；灰白卷毛/长毛剪影（卷毛 → 长毛只是几何变化）；尖三角耳；长蓬松尾；肉垫浅粉；无项圈（默认）。
- **同色约束（task-146）**：颜色用 PALETTE-LOCK §4.1 的 16 色；布偶化只改品种几何与面罩画法，**不得切到 OC C 表**（PALETTE-LOCK §4.3）。
- **用色短句**：`white/cream dominant coat #F1EEE7 with light #FDFCF7 and shadow #D6D1C7, warm-cream belly/ruff #ECE3D5, cool grey-blue points mask #8E9296 with #6B7075 inner edge, grey ears #6F7479 / #C9C2B8 inner, blue eyes #5B93E0 with #1E2C44 pupil and one 1 px #F4F9FF catch-light, pale pink nose #C9B6AB and pads #C4B1A7, 1 px closed #0B1220 outline.`
- **禁止**：姜黄/虎斑/橙/棕/粉毛、绿眼/黄眼/异色瞳、折耳、短尾/无尾、红项圈金铃、婴儿大头/腮红/心形瞳、人形/衣服。

### 5.3 狗（金毛寻回犬 v11）

- **身份锚点**：金黄被毛（非金棕/棕黑/红棕）；垂耳；宽胸；大羽状尾；**无眼斑/鞍斑/深色面罩**；深棕眼 + 1 px 高光；近黑暖棕鼻；哑光砖红项圈三带（A profile 常驻）。
- **A/B**：A = PALETTE-LOCK §5.1（18 role / 17 唯一色，含砖红项圈）；B = OC C 表（无项圈、色偏移 >5 的 role 多）。pack 必须选一个并整包执行（PALETTE-LOCK §5.2/§5.3）。
- **用色短句（A）**：见 PALETTE-LOCK §5.4；`body #D9A251` 必为最高频，奶油 `#F8ECD0` 只作口吻/胸腹/羽状缘。
- **禁止**：金棕/棕黑/红棕、眼斑、猫耳/尖耳、卷尾/短尾、蓝色项圈（A）、幼犬大头、腮红/心形瞳、人形/衣服/导盲犬背带。

### 5.4 三份 pack 必须显式声明的三件事

1. **profile**：`A（96 runtime）` 或 `B（128 final / 256 keyart canon）`；
2. **palette id** 与 hex 表引用（PALETTE-LOCK section）；
3. **目标契约**：12-clip runtime（狗/猫/汀岚）还是 OC 的 7-tag/36 帧 legacy（只用于 keyart 参考，不用于游戏包）。

## 6. 姿态 / 动作提示词契约

### 6.1 运行时是 12 clips（唯一源 `src/pet/anim/timing.json`）

| clip | dog 帧@fps | cat 帧@fps | human 帧@fps | loop | layer |
|---|---:|---:|---:|---|---|
| idle | 6@6 | 6@6 | 6@6 | ✓ | base |
| idle_blink | 3@12 | 3@12 | 3@12 | — | overlay |
| walk | 8@10 | 8@10 | 8@10 | ✓ | base |
| run | 6@14 | 6@14 | 6@14 | ✓ | base |
| pat_head | 4@8 | 4@8 | 4@8 | — | oneshot |
| ball_throw | 5@10 | 5@10 | 5@10 | — | oneshot |
| ball_chase | 6@12 | 6@12 | 6@12 | — | oneshot |
| paw_face | 5@8 | 5@8 | 5@8 | — | oneshot |
| scratch | 6@8 | 6@8 | 6@8 | — | oneshot |
| stand_wag | 6@8 | **10@6** | 6@8 | — | oneshot |
| chase_tail | 6@10 | 6@10 | 6@10 | — | oneshot |
| attack | 7@16（holdMs 非均匀） | 7@16（同） | 7@16（同） | — | oneshot |

- 总帧数：**dog 68 / cat 72 / human 68**；96×96、anchor (48,96) foot-center、footBox (-36,-18,72,18)、地线 y=89。
- OC 文档里的 **7 tags / 36 帧**是早期核心契约（`docs/art/oc/*/PROMPTS.md`），既不是当前运行时，也不是本 prompt 系统的动作目标；引用时必须注明 legacy。

### 6.2 生成策略（省钱 + 一致）

1. **母版 1 张**（normal/正面）→ 人工挑 3 候选；
2. **每 tag 1 张关键姿态 sheet**（不是每帧 1 张）；
3. **附件 7 张**（eye_open/half/closed、mouth_closed/a/i/u），从同一身体底图裁切/重绘；
4. 其余帧 = **整数 offset + hold + 局部色块替换** 人工完成；不调 API 补间。

### 6.3 单帧 prompt 模板（复用于三份 pack）

```text
[FRAME] <clip> frame <n>/<total>, role=<key|breakdown|hold>; same character, same outfit,
same camera, same framing, same identity anchors as the approved master.
Change ONLY: <pose delta in relative terms, e.g. head tips down 1/10 of head height,
eyes closed, tail lifted; feet stay on the baseline; hands empty>.
Neighbour frames: <previous state> / <next state>; keep all non-moving parts identical.
[B1 STYLE] + [B2 IDENTITY] + [B3 PALETTE] + [B5 FRAMING] + [B6 AVOID] + [B7 PIPELINE]
```

- 一张图只出一张姿态；**禁止** `animation`、`sprite sheet`、`8 frames`、`sequence` 作为主句。
- 动作语义来源：狗 = `DOG-PROMPT-PACK` §6；猫/汀岚 = 各自 pack 的 clip prompt；`docs/design/{CAT-SELKIRK,HUMAN-TINGLAN}-2026-11-18.md` 有逐 clip 语义。
- 表情/口型库：各 pack 自建（参考 `PIXEL-ANCHOR-PROMPTS` §2.5–§2.6 的「1 px 锚点」原则与狗 pack §5）。

## 7. AVOID（正文 avoid 段）

### 7.1 跨角色主 AVOID（三份 pack 逐字复用）

```text
Avoid: fake pixel grid with uneven block sizes, anti-aliasing, dithering, gradient,
soft or semi-transparent edges, glow, blur, bloom, second light source, ground shadow,
pure black #000000 large areas, pure white #FFFFFF large areas, unregistered palette
colours, colour noise, photorealistic fur/texture, 3D render, painterly/impasto style,
text, letters, watermark, logo, signature, UI, speech bubble, labels, scenery,
multiple characters, extra limbs, extra hands, duplicated ears/tails, cropped feet,
off-centre or floating character, rotated/skewed canvas, official affiliation claim,
real person or real animal likeness, existing franchise character.
```

### 7.2 角色增量 AVOID

| 角色 | 追加 avoid |
|---|---|
| 汀岚 | white/grey hair streak, eye patch/jaw stripe/saddle patch, geometric fish clip, official DeepSeek fish/logo/wordmark/mascot, rectangular/thick/frameless glasses, colored lenses, thick curved orca tail, ray/fish tail, single lobe, all-white fluke, white belly in a single view, tail through skirt, maid/deep V/high slit/fishnet/stiletto/low camera, blush, heart pupils, child proportions |
| 猫 | ginger/tabby/orange/brown/calico fur, green/yellow eyes, heterochromia, folded or floppy dog ears, short/no tail, red collar + golden bell, clothes/bandana, kitten proportions, blush, heart pupils, humanoid/anthropomorphic |
| 狗 | dark brown/red-brown/black coat, golden-brown with black saddle, eye patch, dark mask, blue eyes, cat ears/pointy upright ears, cropped ears, short/curly/no tail, puppy proportions, blush, heart pupils, humanoid, guide-dog harness/service vest, clothes, blue collar as A |

### 7.3 AVOID 的写法纪律

- 模型无 negative 参数时，AVOID 作为**正文最后一段**（`Avoid: ...`），不是 API 字段；不得伪造 `negative_prompt`。
- **不写** `child`、`minor`、`sexualized`、`nsfw` 等高风险词进请求（moderation 403 风险，见 `PIXEL-PIPELINE` §5.4）；改用正向措辞：`adult proportions, work-appropriate, non-seductive`。
- AVOID 只纠正向失败，不堆长列表；失败一次 → 改前段正向句 + 换 refs，不反复重试同 payload。

## 8. 模型 / 管线事实与 provenance

### 8.1 可用事实（引用，不是本轮实测）

| 项 | 事实 | 来源 |
|---|---|---|
| 出图尺寸 | 端点只出 **1:1 1024²** 与 **2:3 1024×1536**；无 size/resolution 参数 | `PIXEL-PIPELINE` §0/§1；`PIXEL-ANCHOR-PROMPTS` §4.4 |
| seed | **无 seed**；无法复现同一张 | 同上 |
| negative | **无 negative 参数**；负面词写正文 | 风格契约 §5.3 |
| 透明底 | 可出 alpha 但**边缘必脏**；必须 alpha 二值 + 去 fringe | `PIXEL-PIPELINE` §1.5 |
| refs | 每次 ≤3 张，且只能来自已批准母版/三视图/同 tag 灵魂帧；refs 记 sha256 | `PIXEL-PIPELINE` §2.1 |
| 模型名 | 历史 256 concept 记录过具体模型（见 `tinglan-256/manifest.json` 的 aiLabel），**不是本系统默认**；新批次必须记录实际模型，不得虚构 | manifest + 本文纪律 |

### 8.2 每次生成必须记录的 provenance 字段

```text
model / endpoint, aspect_ratio, quality, background, output_format, n,
prompt_sha256, refs_sha256[], seed: null (unsupported), cost, elapsed, date,
operator, output_path, review_status(concept|selected|rejected), failure_reason
```

> 参考 `PIXEL-PIPELINE` §5.3。**seed 必须写 null 或 unsupported，不许编造数字**。

### 8.3 从 AI 概念稿到可验收资产

1. AI 1024² 概念（3 候选）→ 人工挑 1 张母版；
2. 离线像素化：alpha 二值 + 去 fringe → 96 裁中央 960² / 128 全幅 → 整数块降采样 → palette 吸附 → 1 px 闭合轮廓；
3. **人工重绘**（Aseprite；AI 输出不可直接入包）；
4. 帧间对齐（f0 基准 + 洋葱皮 + 6 锚点，整数位移）；
5. 门禁入包（§9）；manifest `ai.status` 从 `concept` → 批准后才可 `final`。

## 9. 提示词一致性 gate（与 PALETTE-LOCK §8 共用）

### 9.1 三级门

| 级 | 判据 | 动作 |
|---|---|---|
| **G0 自动拒收** | 尺寸≠目标；alpha 非二值；全透明；色数 > 上限；四角不透明；边界非轮廓（主剪影）；轮廓边界 <100 px；AI raw 直接进包 | 直接废，不评审 |
| **G1 自动返修** | 半透明边/白边 → 去 fringe；非 palette 色 → 吸附；脚底≠基线 → 平移；loop 首尾差 >0.1% → 对齐；bbox 漂 >2 px → 复位 | 修后再过 G0 |
| **G2 人工必检** | 1×/2× 可读；身份锚点 5–7/7；表情语义克制；1× 无糊边/断线；与母版不是「另一个人」 | 记录后放行 |

### 9.2 可测阈值（96 运行包）

| # | 指标 | 阈值 | 证据/工具 |
|---|---|---|---|
| 1 | alpha | 二值；四角 0；地线 y=89 | Python 审计（PALETTE-LOCK §8.1） |
| 2 | 色数 | 狗/猫 ≤16、汀岚 ≤19 实测目标；中央测试硬门 ≤20/帧、全包 ≤40 | `tests/pet-anim.test.ts` + Python |
| 3 | palette | 每色 ⊆ 对应 A/B 表；`#000/#FFF` 0；`#1B1612` 96 为 0 | PALETTE-LOCK §8.3 |
| 4 | 轮廓 | 主剪影边界全 `#0B1220`；无内部 outline 色像素；FX 后绘豁免 | generator `--check`（三包）/ `--verify`（仅 cat） |
| 5 | 2× | 任意 2×2 块单色（人工重绘后）；深/浅底可读 | Aseprite/截图 |
| 6 | 身份锚点 | 汀岚 7/7；猫/狗按 pack 的 5–7 项 | 目检 + pack 清单 |
| 7 | accent | 汀岚 `#3964FE` ≤3%（实测 1.18%）；猫蓝眼 ≤1%；狗舌/腮红 ≤2 px 级 | Python |
| 8 | 帧契约 | 12 clips；帧数/fps/loop/layer/attack holdMs 与 manifest 一致 | `tests/pet-anim.test.ts` + manifest |

> prompt 本身不产生 gate；AI 图必须先被像素化/人工重绘，gate 才有意义。**任何「prompt 写对了=final」的说法都是错的。**

## 10. 跨角色区分与一致性

### 10.1 不能混的角色特征

| 特征 | 汀岚 | 猫 | 狗 |
|---|---|---|---|
| 耳 | 人耳（不做动物耳） | 尖三角耳、直立 | 垂耳、耳片贴颊 |
| 尾 | 扁平两叶虎鲸尾（黑上白下） | 长蓬松尾、灰蓝重点色尾尖 | 大羽状尾、金黄 |
| 色温 | 黑/白/冷蓝 + 肤 | 冷灰/奶白 + 蓝眼 | 暖金黄 + 棕色眼 |
| 比例 | 2.5 头身（96） | 成年四足（头 1:2.5–3） | 成年四足、宽胸 |
| 语音/气泡（视觉之外） | 实心气泡 + TTS 允许 | 空心心理气泡、无 TTS | 空心心理气泡、无 TTS |

- 同框只做轻叙事；不生成 CP/争宠/猫狗大战/汀岚×宠物的恋爱化画面。
- 猫狗剪影必须可区分：耳形 + 尾形 + 色温三处同时可读；prompt 里写 `triangular upright ears, plumed tail, cool grey-blue points`（猫）vs `floppy drop ears, feathery golden tail, no eye patch`（狗）。

### 10.2 同角色跨 tag 的一致性

- 身份锚点位置跨帧不变（眼镜水平线/发夹侧/领夹居中/尾根/鞋底等；猫的 mask/blaze 起点；狗的耳根/项圈位置）。
- 同一角色只允许一套 palette（A 或 B）、一套比例、一套光照；换装/换场景 = 新角色包或新 palette 版本，不做「半套」。
- 侧视/正面/背面只换视角，不换脸型/毛色分区。

## 11. 三份 pack 的分工与复用（引用契约）

### 11.1 共享（逐字复用，不重写）

| 内容 | 来源 |
|---|---|
| STYLE BLOCK | 本文 §3 |
| 风格词表 | 本文 §4 |
| 主 AVOID | 本文 §7.1 |
| 角色增量 AVOID | 本文 §7.2 + 各 pack 自加 |
| 八段式组装与单帧模板 | 本文 §2/§6.3 |
| 模型事实/provenance/gate | 本文 §8/§9 |
| 角色色板与用色句 | PALETTE-LOCK 对应角色章 |

### 11.2 pack 自有（各写各的，不互相复制）

1. 角色身份母版英文 prompt（normal/chibi/keyart 三档）；
2. 该角色 palette 的**完整展开表**（从 PALETTE-LOCK 引用 + 实测像素/几何细节）；
3. 12 clips 的逐 clip 姿态 prompt + 表情/口型库；
4. profile A/B 声明与差异表；
5. 该角色的验收清单（身份锚点/禁忌/量测）；
6. 该角色的「旧文档冲突裁定」（只记录，不改旧文件）。

### 11.3 每份 pack 的必备头部（模板）

```text
# <角色> 生成提示词包 · <English name> · 2026-11-20
> 引用的唯一调色板：PALETTE-LOCK-2026-11-20.md §<3|4|5>（profile <A|B>）
> 共用风格/负面/管线：CHARACTER-PROMPT-SYSTEM-2026-11-20.md §3/§7/§8/§9
> 目标契约：12 clips / <68|72> 帧 / 96×96 / anchor(48,96) / 地线 89；非 7-tag legacy
> 本文件只写 prompt 文本；未调用图像 API、未生成图片、未改资产/代码
```

### 11.4 版本与更新

- palette 或风格规则变更 → PALETTE-LOCK/本文先出新日期版本 → 三份 pack 同步引用；
- pack 内不得出现「本地临时 hex」；如确需新色，先改 PALETTE-LOCK 并升 palette id；
- 任何 AI 产物状态变化（concept→approved/final）必须由人工评审记录驱动，不由 prompt 文档宣布。

## 12. 引用模板（可直接贴进 pack）

```markdown
- 调色板：`docs/art/prompts/PALETTE-LOCK-2026-11-20.md` §3.1（96 A）/ §3.2（128/256 B2）
- 提示词系统：`docs/art/prompts/CHARACTER-PROMPT-SYSTEM-2026-11-20.md` §2/§3/§7/§9
- 风格契约：`docs/art/PIXEL-STYLE-SPEC-2026-11-16.md` §4.2–§4.5/§5.3
- 管线：`docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md` §0–§3
- 动作契约：`public/assets/pet/anim/<char>/manifest.json` + `src/pet/anim/timing.json`
```

## 13. 边界 / 未做 / 待拍板

- **未做**：未生图、未调 API、未生成任何 prompt 的实际输出、未改资产/代码/测试、未 commit。
- **不保证**：不保证模型按 prompt 出图；不保证一次通过；不保证跨 batch 一致（无 seed 事实）。
- **Node 测试环境**：task-150 复跑时 node_modules 已是 linux-x64（WSL）。**改动前基线**全量 `npm test` = 1946 pass / 0 fail；**改动后**本任务相关 8 个测试文件 = 71 pass / 0 fail；全量残余 7 个失败全部来自并行 cat-ragdoll 任务在途资产（非本任务）。此前「Windows 安装导致 esbuild 平台不符」的说明不再适用于该 checkout（详见 TINGLAN-DECISIONS §5.3）。
- **三份 pack 的引用现状（2026-11-20 更新）**：三份 pack 已落库；`TINGLAN-PROMPT-PACK` 在 task-150 已把 PALETTE-LOCK / 本文件 / [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md) 标为上游并同步拍板口径；`CAT-RAGDOLL-PROMPT-PACK` 与 `DOG-PROMPT-PACK` 的跨角色引用由各 owner 按 §11.3 补（doc-only；本文件不改他人文件）。
- **已决（2026-11-20 拍板，task-150）**：汀岚 **final 主画布 = 128**（256 仅 keyart）；**96 保留 bow 简化**；**`orca-pixel@0.2` 已注册**（24 色 `.hex` + `art/specs/pet.tinglan.pixel.json`）；profile 口径 = 96 用 A、128 final / 256 keyart 用 B。见 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)。
- **待拍板（仍未决）**：① 猫「同色布偶」的 palette id 命名；② 狗 OC B 方案是否整体切换（含无项圈）；③ 是否在 CI 增加统一 palette 注册校验（当前只有 `art:check-specs` + `validate-character` legacy-spec 解析；`palettes.json` 未建）；④ 汀岚 128 的 `#191920` 重建批次 / `#1B1612` 内线写回 CANON / final 删 blush（决策文件 §4.2）。

## 14. 参考索引

| # | 文件 | 用途 |
|---|---|---|
| 1 | `docs/art/prompts/PALETTE-LOCK-2026-11-20.md` | 三角色 hex 唯一来源 |
| 2 | `docs/art/PIXEL-STYLE-SPEC-2026-11-16.md` | 风格契约与 STYLE BLOCK 原文 |
| 3 | `docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md` | 无 seed/size/negative、S0–S5、G0–G2 |
| 4 | `docs/art/PIXEL-ANCHOR-PROMPTS-2026-11-16.md` | 锚点层级、prompt 升级模板、失败改写 |
| 5 | `docs/art/Q-PIXEL-PROMPT-PATCH-2026-11-16.md` | FEATURE_LOCK、单帧模板、禁用词 |
| 6 | `docs/art/oc/{tinglan,cat,dog}/OC.md` 与 `PROMPTS.md` | 角色身份/禁忌/旧 prompt |
| 7 | `docs/design/{HUMAN-TINGLAN,CAT-SELKIRK}-2026-11-18.md` | 96 实现口径与已知风险 |
| 8 | `public/assets/pet/anim/{human,cat,dog}/manifest.json` | 12 clips 真值 |
| 9 | `tests/pet-anim.test.ts` / `tests/pet-anim-human.test.ts` / `tests/pet-anim-cat.test.ts` | 色数/alpha/palette 断言 |
| 10 | `docs/art/prompts/DOG-PROMPT-PACK-2026-11-20.md` | 已完成的狗 pack（可作为结构与深度参考） |

---

*本文只定义「怎么把角色、色板、动作与验收写成可执行的 prompt」；具体角色 prompt 与实测展开由三份 pack 各自持有。*

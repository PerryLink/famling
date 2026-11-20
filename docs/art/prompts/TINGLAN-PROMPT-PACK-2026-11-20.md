# 汀岚（Tinglan）生成提示词包 · 2026-11-20

> **状态：提示词/规格文档（prompt pack），不是图片、不是资产、不是 final art。**
> **2026-11-20 拍板（task-150 落地）**：汀岚 **final 主画布 = 128×128**；**256 仅 keyart**（非 final/运行时）；**96 保留 bow 简化**（96 仍为当前发布路径的占位/兼容轨）。`orca-pixel@0.2` 已注册（24 色 `.hex` + `art/specs/pet.tinglan.pixel.json`）。决策全文见 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)。
> **2026-11-20 task-150 只改文档与注册**：编辑本文件 + `PALETTE-LOCK` / `CHARACTER-PROMPT-SYSTEM`，新增决策文件、`art/_style/palettes/orca-pixel.hex`、`art/specs/pet.tinglan.pixel.json`；**未生成图片、未调用图像 API、未改 `public/` 资产/代码/manifest/测试、未 commit/push**。
> 工作区 `desktop-games` HEAD `47438acb7a08`（本文件创建时；task-150 拍板落地时 HEAD `df791b8`）；工作树另有其它任务的在途改动（`docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md`、`docs/research/COMPETITORS-CHINA-DSH.md`、`tests/pet-brief-consumer.test.ts` 等修改，以及 `docs/art/CALIBRATION-SET-2026-11-16.md`、`docs/art/prompts/` 下 CAT/DOG/PALETTE-LOCK/CHARACTER-PROMPT-SYSTEM 等并行产出），本文件未触碰它们。
> 用途：作为「AI 概念生成 → 人工像素重绘 → 机器/人工验收」三段的唯一入口文本。所有 prompt 只产出**概念稿**；final 必须人工重绘 + 门禁 + 人工 2× 终审。
> 非官方：汀岚是 PerryLink 原创成年虎鲸秘书 OC；与 DeepSeek 无关联/合作/授权/背书；不使用官方 Logo/字标/官方鲸鱼娘；AI 生成必须披露。
>
> 引用的唯一调色板：[`PALETTE-LOCK-2026-11-20.md`](PALETTE-LOCK-2026-11-20.md) §3.1（96 A）/ §3.2（128 final B1 + 已注册板 / 256 keyart B2）/ §3.4（裁定/禁用）/ §8（gate）/ §12（2026-11-20 拍板落地）。
> 共用风格/负面/管线：[`CHARACTER-PROMPT-SYSTEM-2026-11-20.md`](CHARACTER-PROMPT-SYSTEM-2026-11-20.md) §2（八段式）/ §3（STYLE BLOCK）/ §7（AVOID）/ §8（模型事实）/ §9（一致性 gate）。
> 目标契约：**当前运行路径 = 12 clips / 68 帧 / 96×96 / anchor(48,96) / 地线 89**；**128 final 的 7-tag 是 final 主画布契约**（256 keyart 仅参考，不再 final 化；见 §0.1）。本文件只写 prompt/规格文本；未调用图像 API、未生成图片、未改资产/代码。

## 0. 一页纸

### 0.1 六条产出轨道

| 轨道 | 产出 | 画布/尺寸 | 契约/数量 | 当前状态（2026-11-20 实测） | 用途 |
|---|---|---|---|---|---|
| **T-A** | 正常头身身份母版 / KeyArt | 1024×1536（2:3）或 1024² | 身份母版 1 + 三视图 4 + 9 表情 + 3 角度 + 场景/加载 | 未生成 final；旧 v3/ref10/旧 prompt 库均为 legacy | 立绘、商店/加载页、About/图标裁切 |
| **T-B** | 128 final 主画布 chibi | 128×128 | 7 tags / 36 帧 + 13 附件 = 49 | **2026-11-20 拍板：final 唯一主画布**；规格已锁 + `orca-pixel@0.2` 已注册；**0 张 final 资产** | 128 final 运行时主套（480×336 窗口未实现） |
| **T-C** | 256 keyart | 256×256 | 20 tags / 49 帧（= hero 1 + 7 tags + 12 附件） | **2026-11-20 拍板：仅 keyart/参考**；现有 49 帧包保留 `placeholder:true, final:false`；不再排 final 化 | keyart/大图视觉参考（非 final 运行时画布） |
| **T-D** | 96 动画 hero 包 | 96×96 | 12 clips / 68 帧 | **当前默认 `humanoid` hero 与 dsh-famling 用包**；20 色并集 / 每帧 ≤19 占位；生成器 `--check` PASS；**2026-11-20 拍板：保留 bow 简化** | 当前发布路径的占位/兼容动画（非 final） |
| **T-E** | 表情/附件 | 128 final 内部 | 9 表情 + 3 角度；eye×3 / mouth×4 附件 | 仅 T-C 部分覆盖（keyart 参考）；T-B/T-D 未生成 | 对话、互动、眨眼/口型 |
| **T-F** | 三视图（front/side/back/3-4） | 128 final / 1024 keyart | 每套 3–4 张 | 无 final；T-C 有 3 张 concept 视图（keyart 参考） | 身份母版、派生参考 |

### 0.2 十条硬事实（先看，再读后面）

1. **模型/端点**：`openai/gpt-image-2.6-sunburst`，`POST https://openrouter.ai/api/v1/images`。支持 `aspect_ratio / quality / background / output_format / n / input_references`；**不支持 `seed / size / resolution / negative / mask`**（详见 §9）。
2. **AI 只出概念图**：可出 1024²、1024×1536、1536×864 等；96/128/256 由「整数降采样 + 人工像素重绘」得到；**AI 直出永远不能当 final**。
3. **身份 7 锚点 always-on**：圆细银框眼镜、左刘海蓝鲸发夹、领带正中蓝鲸领夹、珍珠短坠耳环、扁平两叶尾（上黑下白、后腰/裙后开衩）、白色白名单、1 px `#0B1220` 闭合轮廓。面部/领带可见而漏画 = 错稿（§2.3）。
4. **画布契约（2026-11-20 拍板）**：**final 主画布 = 128**（anchor `(64,128)`、脚底 128）；96 为兼容/占位（anchor `(48,96)`、地线 `y=89`）；**256 仅 keyart**（anchor `(128,256)`、脚底 255）；KeyArt → 人物高 90–94%、四周留白 ≥24 px（§4）。
5. **描边/alpha**：96/128 用 1 px 闭合外轮廓 `#0B1220`；256 按现行 `gate_256.py` 口径为 2 px；内部结构线只用浅色（suit_hi/shade），**不用 outline 色画内部线**；全部 hard alpha（0/255）。
6. **色板**：canon 目标 ≤32 可见色、硬门 ≤40；**128 final 注册板 `orca-pixel@0.2` = 24 色（已注册）**；当前 96 包 20 色（每帧最多 19）、256 concept 22 色（`@0.2-draft` 未注册）；禁 `#000000`/`#FFFFFF`；DSH 蓝 accent `#3964FE` ≤3% 可见像素（§3）。
7. **当前资产全是 placeholder/concept**：96 包 `placeholder:true / ai.status:none / license:placeholder-only`；256 包 `placeholder:true / final:false / ai.status:concept`；128 只有规格与注册板，**0 张 PNG**。**没有任何已批准 final**。
8. **运行时两条契约并存**：canon `7 tags / 36 帧`（**128 final 用**；256 keyart 仅参考）与当前动画 `12 clips / 68 帧`（96 hero 用）；两者帧数/命名/道具策略不同，不能互相冒充（§7.1/§7.4）。
9. **96 允许简化（bow 已拍板保留）、128 final/256 keyart 不允许**：96 占位包把蓝鲸发夹简化为「蓝 bow / 蓝色读形」、省珍珠、领夹 2 px，**2026-11-20 拍板保留该简化**；128 final / 256 keyart 必须恢复鲸鱼几何 + 银杆 + 珍珠短坠。简化只发生在**人工像素重绘层**，不进 AI prompt（§2.4）。
10. **合规**：非官方、AI 披露、无真人/恋爱/色情/儿童化；不得使用 DeepSeek 官方 Logo/鱼标/吉祥物；prompt 内不写 `child/minor/sexualized` 等敏感词（会抬高 403 风险，只进人工筛图 checklist，§8.4）。

### 0.3 怎么用（三步）

1. **先锁定**：读 §2（身份 DNA/7 锚点/96 简化）+ §3（调色板）+ §4（画布/锚点/像素预算），确认本次目标是哪条轨道（T-A/T-B/T-C/T-D）。
2. **再取 prompt**：按目标取 §5（正/侧/三视图）、§6（表情）、§7（动作）；组装 = `IDENTITY-NORMAL|IDENTITY-CHIBI` + 本图句 + 收尾句 + §8.1 短 `Avoid:`。
3. **最后验收**：按 §9 选参数/预算发请求；AI 只当概念，按 §10.2 整数降采样 + 人工像素重绘；按 §11 机器门 + 人工 2× 终审后再谈 final。


## 1. 目的、边界与真源

### 1.1 本包是什么 / 不是什么

- **是**：一次生成前的「角色锁定 + 调色板 + 像素规格 + 正面/侧面/表情/动作 prompt + 负面词 + 模型参数 + 验收标准」单文件入口；可直接把 prompt 段落送模，也可作为人工画师的规格书。
- **是**：模型层（`PROMPT-TEXT`）与规格层（`SPEC-CONTRACT`）的分离说明 —— 模型做不到的事（精确画布/1px 轮廓/二值 alpha/色数/seed）只进规格与验收，**不写进送模文本**。
- **不是**：新图、新资产、final art、发布包；不是 cat/dog prompt 包；不是跨角色系统文档。跨角色调色板/风格系统见已落库的 [`PALETTE-LOCK-2026-11-20.md`](PALETTE-LOCK-2026-11-20.md) 与 [`CHARACTER-PROMPT-SYSTEM-2026-11-20.md`](CHARACTER-PROMPT-SYSTEM-2026-11-20.md)；本包自包含但以其为上游，色板/风格冲突时以上游为准。

### 1.2 真源与优先级（冲突裁决）

1. **用户 2026-11-16/17 锁定与最新明确指令 + 2026-11-20 拍板**（128 主 + 96 兼容、480×336、整数 2×、B 几何、C 外观、全年龄 roleplay 边界；**2026-11-20：final 主画布 128 / 256 仅 keyart / 96 保留 bow 简化**，见 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)）。
2. [`../CANON-SETTING-BOOK-2026-11-16.md`](../CANON-SETTING-BOOK-2026-11-16.md)（身份/服饰/蓝鲸标/尾巴/12 表情/2.5 头身/色板 token；旧口径裁决）。
3. [`../oc/tinglan/OC.md`](../oc/tinglan/OC.md)（OC 级设定与 7 锚点）+ [`../oc/tinglan/PROMPTS.md`](../oc/tinglan/PROMPTS.md)（当前可用 prompt 基线）+ [`../oc/tinglan/RUNTIME-MAP.md`](../oc/tinglan/RUNTIME-MAP.md)（17 态/13 待机/5 区/36 台词 → 美术 tag）。
4. 运行时与行为设计：[`../../TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md`](../../TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md)、[`../../TINGLAN-ROLEPLAY-VALUES-2026-11-16.md`](../../TINGLAN-ROLEPLAY-VALUES-2026-11-16.md)。
5. 工程契约：[`../../design/PET-ANIMATION-2026-11-18.md`](../../design/PET-ANIMATION-2026-11-18.md)、[`../../design/HUMAN-TINGLAN-2026-11-18.md`](../../design/HUMAN-TINGLAN-2026-11-18.md)、[`../../design/CHARACTER-INTERACTIONS-2026-11-20.md`](../../design/CHARACTER-INTERACTIONS-2026-11-20.md)。
6. 提示词工程参考（不是身份真源）：[`../prompt-library/`](../prompt-library/)（`PROMPTS-TINGLAN-RUNTIME` / `PROMPTS-TINGLAN-KEYART` / `PIXEL-PIPELINE` / `REVIEW-MODEL-FIT` / `COST-QUALITY-STRATEGY`）。
7. **当前资产是「实现证据」，不是身份真源**：`public/assets/pet/anim/human/**`（96）、`public/assets/pet/tinglan-256/**`（256）。
8. **旧文档一律历史基线**：`AI-IMAGE-PROMPT-LIBRARY-2026-11-16.md`、`AI-IMAGE-PROMPT-LIBRARY-V2-128-2026-11-16.md`、`REBUILD-TINGLAN-*`、v3/ref10/旧 128 pack/旧分镜均不得作 `input_references`、不得作 prompt 的参考成图。

> **裁决规则**：视觉身份冲突以 CANON + OC 为准；帧数/画布/文件契约以工程文档与测试为准；两者冲突时**分别落地**（身份按 CANON，帧契约按工程），不得用一方覆盖另一方。

### 1.3 本轮实测基线（2026-11-20，只读）

| 检查 | 结果 | 命令/方法 |
|---|---|---|
| 96 动画包帧数 | **68 PNG + manifest**，12 clips，帧数分布 6/3/8/6/4/5/6/5/6/6/6/7 | `find` + Python 统计 |
| 96 动画包色数 | **可见色并集 20 色；单帧最多 19 色**；全体 hard alpha；地线行 **y=89 在 68/68 帧** | PIL 只读量测 |
| 96 动画包实测内容边距 | 全局最小边距 L22 / T12 / R23 / B6（maxY=89）；四角透明 | PIL 只读量测 |
| 96 动画包生成器复验 | `check ok: human animation pack matches the generator (68 frames, 68 unique, max 19 colours, ground y=89, blink end vs idle_00 4 px <= 20)`，exit 0 | `python3 scripts/gen-human-anim.py --check` |
| 256 包 | **49 PNG + manifest**（20 tags）；可见色并集 **22 色**（单帧最多 22）；hard alpha；脚底行 **y=255 在 49/49 帧**；实测内容边距 L63 / T20 / R65 / B0；`placeholder:true, final:false` | PIL 只读量测 + manifest |
| 调色板注册 | 本文件创建时（`47438ac`）只有 `a-reef/b-town/c-night/pearl-pixel/pet-paper.hex`；**task-150（`df791b8`）已新增** `art/_style/palettes/orca-pixel.hex`（24 色）+ `art/specs/pet.tinglan.pixel.json`（`orca-pixel@0.2`） | `ls` + `check_specs.py`（2026-11-20 复跑） |
| 本轮 API 调用 | **0**（未联网、未调用图像 API） | 本文件写作过程 |

### 1.4 术语

| 术语 | 含义 |
|---|---|
| normal | 正常头身形态，约 6.0–6.3 头身；1024×1536 级；不进 96/128/256 sprite |
| chibi | 运行时 Q 版，约 2.4–2.6 头身（对齐 2.5），成人 chibi，不幼儿化 |
| PROMPT-TEXT | 送模文本：只描述「看起来怎样」，用比例/相对描述，不写精确画布/1px/alpha/色数/seed |
| SPEC-CONTRACT | 规格与验收：精确 canvas/anchor/bbox/footBox/描边/alpha/色数/地线/帧数，供人工重绘与门禁 |
| placeholder | 占位稿：`placeholder:true` / `final:false`，不得作为发布/final |
| concept | AI 概念稿：必须人工重绘 + 门禁 + 人工终审才能升级 |
| final | 人工 2× 验收 + 色板注册 + 机器 gate 全过后的终稿；当前**没有**任何汀岚 final |

### 1.5 跨文档分工（与并行落库的系统文档对齐）

| 文档 | 负责 | 本包如何引用 |
|---|---|---|
| [`PALETTE-LOCK-2026-11-20.md`](PALETTE-LOCK-2026-11-20.md) | 三角色色板的唯一文字注册表、A/B profile 裁定、ΔE00、palette gate | §3 只做汀岚展开+实测摘录；数值/裁定以它为准 |
| [`CHARACTER-PROMPT-SYSTEM-2026-11-20.md`](CHARACTER-PROMPT-SYSTEM-2026-11-20.md) | 八段式组装、固定 STYLE BLOCK、主 AVOID、模型/provenance/gate 的跨角色口径 | §2.0/§8.1/§9 直接复用；冲突时以其为准 |
| [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md) | **2026-11-20 拍板落地记录（最高口径）**：final 画布 128 / 256 keyart / 96 bow / palette 注册 | 本包 §0/§4/§7/§11/§12 与之一致；冲突时以决策文件为准 |
| 本包 | 汀岚的角色身份 DNA、三视图/表情/动作的逐项 prompt、汀岚验收清单、两套帧契约映射 | 角色细节以本包为准 |
| `CAT/DOG-PROMPT-PACK-2026-11-20.md` | 猫/狗各自 prompt pack | 不在本包范围 |

> 纪律：本包不新增「本地临时 hex」；若确需新色，先改 PALETTE-LOCK 并升 palette id，再回写本包（CHARACTER-PROMPT-SYSTEM §11.4）。

## 2. 角色锁定（身份 DNA）

> 本节 prompt 是 **PROMPT-TEXT**：英文逐字可粘贴；两条（normal / chibi）除比例句和画布语义外，身份词必须一致。模型层不写精确像素数；像素预算见 §4。

### 2.0 跨角色共用块（组装时逐字复用，放在 prompt 首尾）

**B1 STYLE BLOCK（逐字来自 `CHARACTER-PROMPT-SYSTEM-2026-11-20.md` §3；本包所有 prompt 在 IDENTITY 之前或之后拼接一次）**

```text
Cel-Chunk style: clean flat 2D cel-shaded pixel-art-style concept, silhouette-first 16-bit discipline, exactly 2-3 hard-edged shadow steps per material with flat colour fills, one crisp 1 px closed dark outline (#0B1220), hard pixel clusters (no soft edges), limited flat palette (only the approved palette roles; no unregistered colour), top-left single hard light, true transparent background, hard binary alpha (0/255), single full-body sprite, centred, feet flat on the baseline, straight-on eye-level camera, orthographic; no pure black #000000, no pure white #FFFFFF, no dithering, no gradient, no glow, no blur, no anti-aliasing, no semi-transparent pixels, no realistic texture, no second light source, no ground shadow, no scenery, no text, no logo, no watermark, no UI; AI concept draft for a later manual pixel pass, not final pixel art, do not render an exact pixel grid or promise exact pixel sizes.
```

> 说明：STYLE BLOCK 中的 `1 px closed outline` / `hard binary alpha` 是跨角色系统文档要求的**风格引导**，不是模型可承诺的精确输出；最终由整数降采样 + 人工像素重绘 + §11 验收收口（模型无 size/alpha 参数，见 §9.2）。

**B6 主 AVOID（逐字来自 `CHARACTER-PROMPT-SYSTEM-2026-11-20.md` §7.1；放正文最后）**

```text
Avoid: fake pixel grid with uneven block sizes, anti-aliasing, dithering, gradient, soft or semi-transparent edges, glow, blur, bloom, second light source, ground shadow, pure black #000000 large areas, pure white #FFFFFF large areas, unregistered palette colours, colour noise, photorealistic fur/texture, 3D render, painterly/impasto style, text, letters, watermark, logo, signature, UI, speech bubble, labels, scenery, multiple characters, extra limbs, extra hands, duplicated ears/tails, cropped feet, off-centre or floating character, rotated/skewed canvas, official affiliation claim, real person or real animal likeness, existing franchise character.
```

> 组装顺序按 CHARACTER-PROMPT-SYSTEM §2 八段式（B0 LEGAL/META → B1 STYLE → B2 IDENTITY → B3 PALETTE → B4 POSE/TAG → B5 FRAMING → B6 AVOID → B7 PIPELINE）；本包 §2.1/§2.2 是 B2/B5 的汀岚展开，§8.1 是 B6 的汀岚压缩版（冲突时以 §7.1 为准）。

### 2.1 IDENTITY-NORMAL（正常头身，约 6 头身）

```text
Original character key visual of Tinglan, an adult East Asian orca-secretary OC, non-official, no DeepSeek affiliation, AI concept draft not final art; calm restrained work-appropriate adult woman, about 6 heads tall (accept 6.0-6.3) with a long lower body, waist around the vertical middle, legs about 47-50% of total height; clean oval adult face, no baby fat, no blush, professional adult proportions.
All-black chin-length bob with side-swept bangs and inward-curled ends, no white or grey streak, no highlights; thin ROUND silver glasses, clear lenses, thin temples, visible nose pads, always on; almond blue-grey eyes with a darker outer ring and exactly one small hard near-white catchlight per open eye; one small white pearl DROP earring on each ear, silver pins; tiny original side-view blue-whale hairpin on HER LEFT bangs (viewer right in front view), round head + up-curved double-lobed fluke, solid deep ocean blue #3964FE with a thin silver bar, no letters; the identical blue-whale mark as a tie clip centred on the black tie, thin silver horizontal bar.
Black single-breasted tailored blazer with notch lapels and one matte button; white point-collar shirt with white cuffs showing 0.5-1 cm; slim black tie one shade darker than the blazer; knee-length black H-line pencil skirt with a back slit; sheer black tights rendered as opaque warm-grey shading, never near-black, never fishnet or glossy; black almond-toe low block heels about 4 cm; flat thin orca fluke with two roughly symmetric lobes and a clear central notch, rear-waist anchor above the back skirt slit, always behind the skirt, black dorsal top and only a thin pale ventral rim in any single view.
White only on the shirt, pearls and the thin tail ventral rim (eye catchlight is near-white); flat palette of near-black, off-white, skin, silver and one deep ocean blue accent (at most 3% of visible pixels); flat cel shading with 2-3 hard-edged steps, one uniform dark outline that is neither hairline nor thick black, no gradient, no dithering, no glow, no blur, no anti-aliasing, no semi-transparent pixels.
Single character, one full-body pose, empty hands, neutral standing 3/4 view, arms relaxed, tail visible behind the skirt, plain transparent background, no scenery, no ground shadow, no text, no letters, no logo, no watermark, no UI. AI concept draft for a later manual pixel pass - not final art.
```

### 2.2 IDENTITY-CHIBI（运行时 Q 版，约 2.5 头身）

```text
Same original adult orca-secretary OC Tinglan as the normal identity sheet, rendered as a chibi for a low-resolution runtime sprite; non-official, no DeepSeek affiliation, AI concept draft not final art; adult chibi about 2.4-2.6 heads tall with adult facial proportions and a long lower body, head including hair about 40-45% of total figure height, long lower body with legs about 22-24% of total height.
All-black chin-length bob with side-swept bangs and inward-curled ends, no white or grey streak; thin ROUND silver glasses, clear lenses, thin temples, visible nose pads, always on; blue-grey almond eyes with a darker outer ring and exactly one small hard near-white catchlight per open eye; one small white pearl DROP earring per ear; tiny original side-view blue-whale hairpin on HER LEFT bangs (viewer right), solid #3964FE with a thin silver bar; the identical blue-whale mark as a tie clip centred on the black tie; white point-collar shirt and cuffs; slim black tie; black tailored blazer; black knee-length H-line pencil skirt with a back slit; warm-grey opaque tights; black almond-toe low block heels; flat thin orca fluke with two lobes and a central notch behind the skirt, black dorsal top with only a thin pale ventral rim.
Empty hands - no tablet, no pen, no ledger in the sprite; single character, one full-body pose, feet together on the baseline; plain transparent background, no scenery, no ground shadow, no text, no logo, no watermark; flat cel shading, 2-3 hard-edged steps, one uniform dark outline, no gradient/dithering/glow/blur/anti-aliasing; designed to stay readable when reduced to 96-256 px; AI concept draft for a later manual pixel pass, not final pixel art.
```

### 2.3 七锚点（always-on；漏画 = 错稿）

| # | 锚点 | 128 final / 256 keyart 表达 | 96 占位简化（bow 已拍板保留） | 1× 剪影可读要求（96） |
|---|---|---|---|---|
| 1 | **圆细银框眼镜** | 1 圈 1 px 银环（256 为 2 px），透明镜片、可见鼻梁、细镜腿、always-on | 1 px 圆框；不做方框/粗框/无框 | 1× 能数出两片圆环；深底不丢 |
| 2 | **左刘海蓝鲸发夹** | 原创侧视小鲸：圆头、小胸鳍、上翘双叶尾；纯 `#3964FE` + 银杆；在**她的左刘海**（正视图画面右） | 蓝 bow / 蓝色读形 3–5 px（现行 96 包口径；**2026-11-20 拍板保留**） | 黑剪影有凸起、且是唯一蓝块 |
| 3 | **领带正中蓝鲸领夹** | 银横杆 + 同款蓝鲸，居中；领带可见即必戴 | 2 px 蓝点 + 1 px 银线 | 领带 V 内可辨、不偏 |
| 4 | **珍珠短坠耳环** | 小珠贴耳垂 + 短坠，双耳银针；1–2 px/耳（96 可省） | **96 占位省** | 双耳对称、不是耳钉/hoop/多串 |
| 5 | **扁平两叶尾** | 两叶大致对称 + 中央缺刻；上黑下白；后腰/骶骨锚点、从裙后开衩穿出、在裙后；单视角只薄白缘 | 尾 14–20 px 宽、白缘 ≤2 px | 两叶 + 缺口可读；不穿裙/不贴侧缝/不在裙前 |
| 6 | **白色白名单** | 白只在衬衫、珍珠、尾腹（+眼高光 `#F4F9FF`）；整片白腹只在 underside 专用图 | 同左（96 省珍珠） | 白不能变成手套/袜/鞋/肩斑/挑染 |
| 7 | **轮廓/线宽** | 1 px 闭合 `#0B1220`（256 gate 为 2 px）；内部线只用浅色；accent ≤3% | 1 px 同色 | 2× 逐像素检查无断线/双线 |

### 2.4 96 简化阶梯（只允许在人工像素层发生）

1. **prompt 层永远写完整 canon**（鲸鱼 + 领夹 + 珍珠短坠 + 圆框眼镜）。AI 概念图按完整身份出，便于 128 final / 256 keyart 复用。
2. **人工像素重绘层**才允许简化：发夹 → 蓝 bow/蓝色读形；领夹 → 2 px 蓝条；珍珠 → 省略；鲸鱼几何 → 不可读时取「圆头 + 上翘尾」剪影。
3. **128 final / 256 keyart / 任何发布面**必须恢复鲸鱼几何与银杆；**96 轨道按 2026-11-20 拍板保留 bow 简化**（96 不是 final 轨道，不强制重画鲸形），但**不得把 bow 当成 128+ 的 canon**。
4. 简化只影响「像素预算」，不影响身份语义：`#3964FE` 蓝点必须在左刘海 + 领带中段两处出现。

### 2.5 冻结 token（禁止同义替换）

| 组 | 冻结写法（英文） | 禁止 |
|---|---|---|
| HAIR | `all-black chin-length bob, side-swept bangs, inward-curled ends, no white or grey streak or highlight` | white streak, ombre, long hair, twin tails, ahoge, hair bows |
| GLASSES | `thin ROUND silver glasses, clear lenses, thin temples, visible nose pads, always on` | rounded-rectangle, thick frames, colored/tinted lenses, no glasses, asymmetric |
| EYES | `blue-grey eyes, darker outer ring, exactly one small hard near-white catchlight per open eye` | red/purple eyes, star pupils, heart pupils, multiple catchlights |
| HAIRPIN | `tiny original side-view blue-whale hairpin on HER LEFT bangs (viewer right), solid #3964FE, thin silver bar, no letters` | geometric fish clip, official DeepSeek fish/logo, white belly on clip, mirrored to the other side, letters |
| TIE CLIP | `identical blue-whale mark as a tie clip centred on the black tie, thin silver horizontal bar` | missing, off-centre, different glyph, letters |
| EARRINGS | `one small white pearl DROP earring per ear, silver pins` | studs-only, hoops, multiple strings, white hair strand |
| SUIT | `black single-breasted tailored blazer, notch lapels, white point-collar shirt, white cuffs, slim black tie` | double-breasted, grey/white suit, deep V, bare shoulders |
| SKIRT | `black knee-length H-line pencil skirt with a back slit` | front/side slit, long skirt, high slit, pleated |
| TIGHTS | `opaque warm-grey shading, never near-black, never fishnet or glossy` | fishnet, glossy, opaque black leggings, bare legs |
| HEELS | `black almond-toe low block heels about 4 cm` | stilettos, platform, white shoes |
| TAIL | `flat thin orca fluke, two lobes + central notch, rear-waist anchor above the back skirt slit, behind the skirt, black dorsal top, thin pale ventral rim` | thick curved tail, ray tail, fish tail, single lobe, all-white fluke, white belly large in a single view, through the skirt |
| PROP | `matte black A5 folio tablet with one ocean-blue edge stripe` (pose/prop art only) | branded tablet, glowing UI, readable text |
| ACCENT | `deep ocean blue #3964FE, at most 3% of visible pixels` | large blue panels, neon blue, white accents |
| CAMERA | `eye-level, no wide-angle distortion` (normal); `orthographic, single baseline` (turnaround) | low angle, upskirt, fisheye |

### 2.6 语气/表情边界（美术也要锁）

- 成年、克制、work-appropriate 的工作搭子；**不幼儿化、不性化、不恋爱化**。[`../oc/tinglan/OC.md`](../oc/tinglan/OC.md) §3/§10、[`../../TINGLAN-ROLEPLAY-VALUES-2026-11-16.md`](../../TINGLAN-ROLEPLAY-VALUES-2026-11-16.md) §4.2。
- 默认闭口、平眉、直视或视线略偏；情绪强度上限中低。`surprised` 只做克制版；`determined` 不露齿/不凶；`pout` 不鼓颊；`sleepy` 不诱惑。
- **禁止**：脸红、泪光、心形瞳、猫嘴、卖萌、撒娇、主人/宝宝称呼、恋爱/暧昧构图、低机位、胸/裙/腿特写、服务系/女仆装。
- **唯一例外**：现行 96 `pat_head` 占位帧有 2 px 腮红（`#E7A08F`），是 task 占位豁免；final 建议删除或改成克制眯眼（HUMAN-TINGLAN §8 第 3 条）。
- 气泡语义：human 用**实心 speech**、可浏览器 TTS；猫狗用空心 thought、永不 TTS（[`../../design/PET-ANIMATION-2026-11-18.md`](../../design/PET-ANIMATION-2026-11-18.md) §6/§7）。
- 插件 Host 人格（只作语气参考）：`你是汀岚，一只安静、简洁的桌面小生灵，也是用户的工作搭子。用中文回答，1-3 句，先给结论；不知道就说不知道。`（[`../../../../plugins/dsh-famling/index.js`](../../../../plugins/dsh-famling/index.js) `PERSONAS.human`）。

### 2.7 旧口径 superseded 对照（新资产不得沿用旧 token）

| # | 旧口径（来源） | 本包采用 | 生效范围 |
|---|---|---|---|
| 1 | 发夹 = 几何鱼 `#3964fe`（AI-IMAGE-PROMPT-LIBRARY、ART-TINGLAN-KEYART） | **原创侧视蓝鲸** | 全部新资产 |
| 2 | 发夹/领夹可选、多数旧稿无领夹 | **发夹左刘海 + 领夹领带正中均 mandatory** | 全部新资产 |
| 3 | 眼镜 = 细银圆角长方框（KEYART、DNA96） | **圆细银框** | normal + chibi |
| 4 | 珍珠 = 耳钉 studs（DNA96/KEYART） | **珍珠短坠 drop**（96 占位可省） | 128 final / 256 keyart |
| 5 | 尾巴 = thick orca tail + smaller upper fluke（DNA96） | **扁平薄片、两叶、中央缺刻、上黑下白** | 全部新资产 |
| 6 | 表情 8 张（calm/focused/concerned/...) | **12 面板 = 9 表情 + 3 角度** | normal/KeyArt |
| 7 | 头身 6.3 为对齐值 | 约 6 头身，验收 6.0–6.3 | normal |
| 8 | 运行时 96 主 + 128 副 | **2026-11-20 拍板：128 final 主 + 256 keyart + 96 兼容占位**；当前发布路径仍是 96 动画包（工程现状） | 见 §4.1 |
| 9 | 平板是 identity 锚点、每帧持平板 | 平板是**姿势道具**；身份母版/chibi sprite **空手** | 全部新资产 |
| 10 | 旧 96 运行时 49 帧（7 tags） | 当前 hero 是 **12 clips/68 帧**；canon 49 帧仍是 T-B/T-C 的契约 | 见 §7 |

## 3. 调色板（Palette Lock，汀岚单角色）

> 说明：**调色板唯一注册表是 [`PALETTE-LOCK-2026-11-20.md`](PALETTE-LOCK-2026-11-20.md)**（汀岚必须引用 §1/§2/§3.1/§3.2/§3.4/§8/§12）；本表是其中汀岚部分的**展开摘录 + 本轮 PNG 实测**，不是第二份 hex 注册表。新色必须先改 PALETTE-LOCK 并升 palette id，再回写本包。**2026-11-20 task-150 已注册 `orca-pixel@0.2`**（`art/_style/palettes/orca-pixel.hex` 24 色 + `art/specs/pet.tinglan.pixel.json`）；96/256 仍用各自未注册的占位/草案 id。128 final 的「色板通过」现在可指「逐色 ∈ 已注册板」，但仍不等于 final 批准（还需人工重绘/gate/终审）。

### 3.1 Canon token 表（身份用色）

| role | hex | 用途 | 96 占位 | 128 final / 256 keyart |
|---|---|---|---|---|
| outline | `#0B1220` | 外轮廓 / 结构暗线 | 1 px 外轮廓；内部不用 | 1 px（256 gate 2 px）外轮廓；内部结构线只用浅色 |
| inner_line | `#1B1612` | canon 结构内线（备用） | 当前 96 **不用**（内部线只用 suit_hi） | 仅大形内侧 1 px，每帧 ≤3 段 |
| hair | `#1B1B22` | 黑 bob / 尾上表面 | ✔ | ✔ |
| hair_hi | `#30303A` | 发丝高光 / 冷缘 / 尾上表面高光 | ✔ | ✔ |
| suit | `#191920` | 西装/裙 canon；**96 抬一档** `#1E1E26` 防与黑发并块 | `#1E1E26` | `#191920` |
| suit_hi | `#34343E`（96） | 袖/翻领/裙缝/内部结构线（浅色） | ✔ | canon 缝线 `#2E2E38`；256 实测 `#2E2E3A`（近似，final 吸附到 canon） |
| tie | `#0F0F14` | 领带 / 书封 / 嘴线（非 outline 色） | ✔ | ✔ |
| shirt | `#F2F2F2` | 白衬衫 V/领口/袖口/纸页/书页 | ✔ | ✔ |
| shirt_shade | `#D7DBE2` | 纸/书折痕 / 衬衫阴影 | ✔ | ✔ |
| skin | `#F8D8C8` | 脸/颈/手 | ✔ | ✔ |
| skin_shade | `#E3B9A8` | 鼻/颈/皮肤阴影 | ✔ | ✔ |
| skin_deep | `#C99789` | canon 深阴影（可选） | — | 256 可用 |
| tights | `#8A6E6B` | 不透明暖灰黑丝（综合色） | ✔ | ✔ |
| tights_shade | `#6A5652` | 远腿/阴影 | ✔ | ✔ |
| shoe | `#1A1A1E` | 黑色低跟 / 鞋面 | ✔ | ✔ |
| glasses | `#C9CED6` | 细银框/镜腿（256 gate 银环同色） | ✔ | ✔ |
| iris | `#356FFE` | 蓝虹膜 | ✔ | ✔ |
| iris_ring | `#1E3F8F` | 虹膜外环（深蓝） | 96 占位未用 | ✔ |
| eye_hi | `#F4F9FF` | 1 px 眼高光（近白，非纯白） | ✔ | ✔（每睁眼至少 1 像素，目标 1–2 px） |
| tail_white | `#E8E0E0` | 尾腹白 / 薄白缘 | ✔ | ✔（单视角只薄缘） |
| tail_white_shade | `#C9C4C8` | 尾腹阴影 | 96 占位未用 | ✔ |
| accent | `#3964FE` | 蓝鲸发夹/领夹/书签/领带夹蓝块，**≤3% 可见像素** | ✔（bow/蓝读形） | ✔（鲸形） |
| rim_fx | `#99C8FF` | 冷缘 / 星光 / 运动线 / 冲击线（FX 后绘） | ✔ | ✔（FX 不描黑边） |
| blush | `#E7A08F` | 仅 96 `pat_head` 2 px 腮红（占位豁免） | ✔ | **final 建议删除** |
| paper | `#F2F2F2` + `#D7DBE2` | 纸团/纸张/翻页 | ✔ | 建议道具分离后由场景 sprite 承担 |
| book_cover | `#0F0F14` + `#3964FE` 书脊 | 账本/书封 | ✔ | 同左（道具图，不进身份 sprite） |
| tablet | `#22262F` / `#1B2A45` | 黑平板壳/空屏（仅姿势/道具图） | 96 未画 | 仅 prop/pose 图 |

### 3.2 当前 96 包实测色板（20 色并集；每帧 ≤19）

| hex | role（`scripts/human_tinglan.py` `PALETTE`） | 备注 |
|---|---|---|
| `#0B1220` | outline | 唯一外轮廓色，内部不用 |
| `#0F0F14` | tie | 领带 / 书封 / 嘴线 |
| `#1A1A1E` | shoe | 黑低跟 |
| `#1B1B22` | hair | 黑 bob / 尾上表面 |
| `#1E1E26` | suit（**96 抬高**） | 与 `#1B1B22` 区分 |
| `#30303A` | hair_hi | 发丝高光 |
| `#34343E` | suit_hi | 袖/翻领/裙缝/内部结构线 |
| `#356FFE` | eye | 蓝虹膜 |
| `#3964FE` | accent | 蓝 bow / 领带夹 / 书签 |
| `#6A5652` | tights_shade | 远腿 |
| `#8A6E6B` | tights | 暖灰黑丝 |
| `#99C8FF` | fx | 星光/运动线/冲击线（后绘） |
| `#C9CED6` | glasses | 银框 |
| `#D7DBE2` | shirt_shade | 纸痕/阴影 |
| `#E3B9A8` | skin_shade | 肌肤阴影 |
| `#E7A08F` | blush（**仅 pat_head**） | 占位豁免；final 删 |
| `#E8E0E0` | tail_white | 尾腹白 |
| `#F2F2F2` | shirt | 白衬衫/纸/书页 |
| `#F4F9FF` | eye_hi | 1 px 眼高光 |
| `#F8D8C8` | skin | 脸/手 |

### 3.3 当前 256 concept 包实测色板（22 色并集；keyart 轨）

`#0B1220 #0F0F14 #101016 #14141A #191920 #1A1A1E #1B1B22 #1E3F8F #2E2E3A #30303A #356FFE #3964FE #6A5652 #8A6E6B #C99789 #C9CED6 #D7DBE2 #E3B9A8 #E8E0E0 #F2F2F2 #F4F9FF #F8D8C8`

- 比 96 多出 `#101016`/`#14141A`（深色层次）、`#191920`（canon 西装）、`#2E2E3A`（canon 缝线）、`#1E3F8F`（虹膜外环）、`#C99789`（深肤影）；少了 96 的 `#1E1E26`/`#34343E`/`#E7A08F` 等占位变体。
- manifest 声明 `palette: orca-pixel@0.2-draft`，**该色板未注册**（256 已拍板仅 keyart，见 §0.1）；仅表示「入本草案集」，不是 final。
- 128 final 的注册板是另一套：`orca-pixel@0.2`（24 色，`art/_style/palettes/orca-pixel.hex` / `art/specs/pet.tinglan.pixel.json`）；**不要把本表 22 色当作 128 final 目标**。

### 3.4 色板规则（硬）

1. **色数**：每帧 ≤40 可见色（硬门）；**128 final 目标 ≤32（注册板 24 色）**；256 keyart 实测 22 色；96 占位每帧 ≤20（当前实测 ≤19）。96/128/256 三个画布**各自独立计数**，不互相借用。
2. **每材质 ≤4 色**：base + 1–2 阶阴影 + ≤1 高光；固定左上 45° 光，2–3 阶硬边，**禁 dither/渐变/柔光/第二光源**。
3. **禁纯黑/纯白**：用 `#0B1220` 代黑、`#F4F9FF`/`#F2F2F2` 代白；大面纯黑/纯白 = 拒收。
4. **白名单**：白只在衬衫、珍珠、尾腹（+眼高光近白）。任何手套/袜/鞋/口袋巾/肩斑/发丝白 = 拒收。
5. **accent**：`#3964FE` ≤3% 可见像素；只出现在发夹/领夹/书签等小件；大面积蓝 = 拒收。
6. **一致性**：final 与 canon token 的 ΔE00 ≤5；96/256 占位与各自声明色板的逐色命中由脚本/测试保证（96 已由 `tests/pet-anim-human.test.ts` 锁 PALETTE）。
7. **画布差异**：96/128 描边 1 px；256 按 `gate_256.py` 2 px；keyart 用 cel 线稿（约人物高 0.6–1%），不做像素网格。
8. **色板注册状态（2026-11-20 task-150 更新）**：96 声明 `human-anim-placeholder@0.2-tinglan`（未注册，由测试锁 20 色）；256 keyart 声明 `orca-pixel@0.2-draft`（未注册）；**128 final 声明 `orca-pixel@0.2`，已注册**（24 色 `.hex` + spec，与 `public/characters/tinglan/character.json` 一致）。canon 文档仍写 `orca-pixel@0.1`，属待同步旧口径。当前任何资产仍只能标 placeholder/concept（**注册 ≠ final**）。

### 3.5 部件→role 分配（人工重绘按此上色）

| 部件 | 主色 | 阴影/暗部 | 高光/点缀 | 禁止 |
|---|---|---|---|---|
| 外轮廓 | outline | — | — | 彩色轮廓/粗 2 px（96/128） |
| 头发 | hair | hair（仅轮廓内侧一档，不用 outline） | hair_hi | 白/灰挑染、渐变发、白高光 |
| 脸/手 | skin | skin_shade（+skin_deep，128 final 可选 / 256 keyart 可用） | — | 腮红（96 pat 豁免）、高光油皮 |
| 眼镜 | glasses | 1 px 暗侧（可用 `#8F98A6` 可选） | 1 px `#99C8FF` 镜片反光（仅 128 final/256 keyart，可省） | 粗框/方框/彩片 |
| 眼 | iris + iris_ring | 深蓝外环 | eye_hi（1–2 px 硬高光） | 星瞳/心形/多高光 |
| 西装/裙 | suit | suit_hi/缝线 | — | 灰/白西装、渐变面料 |
| 领带 | tie | tie（比西装深一档） | 领夹蓝+银 | 亮面/图案/比西装浅 |
| 衬衫 | shirt | shirt_shade | — | 大面积纯白过曝 |
| 丝袜 | tights | tights_shade | — | 半透明/渔网/近黑 |
| 鞋 | shoe | shoe | 1 px 冷高光（256） | 细高跟/白鞋/厚底 |
| 尾 | hair（黑上表面） | tail_white_shade（白缘阴影） | tail_white（薄缘） | 白腹大面/厚弯尾/多鳍 |
| 发夹/领夹 | accent + glasses（银杆） | — | — | 白杆/几何鱼/官方鱼标/带字 |
| 珍珠 | shirt（近白 `#F4F9FF` 或 `#F2F2F2`） | glasses（1 px 阴影） | — | hoop/多串/耳钉-only |
| FX | rim_fx / eye_hi | — | — | FX 用 outline 色、FX 盖身体 |

### 3.6 送模时的颜色写法

- prompt 里写**命名色 + 关键 hex 作为提示**（`deep ocean blue #3964FE`、`off-white`、`warm-grey`），不要写「≤32 colors」「exactly 20 colours」这类色数断言（模型不可控，且会诱导色爆/假像素）。
- 精确 hex 与色数在**后处理 palette snap + 人工重绘**阶段解决（`scripts/pixelize.py --palette ... --colors ...`；`scripts/validate_art.py --max-colors 41`）。
- 不要把「纯黑 #000000 / 纯白 #FFFFFF」写进正向 prompt 作为颜色；用 `near-black / off-white` 描述，并在负向短句里写 `no pure black or white large areas`（§8.1）。

## 4. 像素规格（SPEC-CONTRACT）

### 4.1 轨道矩阵（精确值）

| 项 | T-D 96 动画（现行占位/兼容） | T-B 128 final（主画布） | T-C 256 keyart | T-A KeyArt / normal |
|---|---|---|---|---|
| canvas | 96×96 | 128×128 | 256×256 | 1024×1536（2:3）或 1024²（表情/图标） |
| anchor | `(48,96)` foot-center | `(64,128)` foot-center | `(128,256)` foot-center | 无像素 anchor；人物居中对齐 |
| footBox | `(-36,-18,72,18)` | `(-48,-24,96,24)` | `(-96,-48,192,48)` | — |
| bbox（声明） | FCI `pet-tinglan-anim/character.json` = `[12,8,72,84]`（历史值；动画测试不用它） | `[16,10,104,118]` | `[32,20,208,236]` | 人物高 90–94%，四周 ≥24 px |
| 实测内容 bbox（2026-11-20） | x 22–72、y 12–89（占位） | — | x 63–190、y 20–255（占位） | — |
| 地线 | **y=89**（68/68） | 脚底 128 | **y=255**（49/49） | 脚底不裁，留 ≥24 px（母版手绘） |
| 描边 | 1 px `#0B1220` 闭合（FX 后绘） | 1 px `#0B1220` | **2 px**（keyart 概念实测；非 final 运行时） | cel 线稿，无像素网格 |
| alpha | hard（0/255） | hard | hard + 透明 RGB=0 | 透明 PNG，边缘无白边 |
| 色数 | ≤20/帧（占位实测 ≤19） | ≤40 硬门 / ≤32 目标（**注册板 24 色**） | ≤40 且 ∈ `@0.2-draft` 草案 32 槽（未注册） | sRGB，flat，限色随画布 |
| 帧数/契约 | 12 clips/68 帧（`famling.pet-anim/0.1`） | 7 tags/36 + 13 附件（manifest v2） | 20 tags/49（manifest v2） | 每项单张/多候选 |
| 命名 | `<clip>/<clip>_NN.png` | `<tag>_NN.png`（0-based，两位） | 同左（canonical P1 已改 `_00`） | `<group>/<asset>.png` + manifest |
| 显示 | 2×=192 CSS（插件按 72 px 显示） | 2×=256 CSS；窗 480×336 未实现 | 1×=256 CSS | 按页面裁切/整数导出 |
| 状态 | placeholder（当前默认；bow 保留） | **final 主画布：规格+palette 已注册，0 资产** | **keyart/参考**：concept，`placeholder:true/final:false` | 无 final |

> **通用公式**（三个像素画布都成立）：`anchor = (W/2, H)`；`footBox = (-0.375W, -0.1875H, 0.75W, 0.1875H)`。96 = `(-36,-18,72,18)`、128 = `(-48,-24,96,24)`、256 = `(-96,-48,192,48)`。

### 4.2 T-D 96 动画包（当前发布路径）

- 契约：`famling.pet-anim/0.1`；12 clips / 68 帧；`manifest.tags` 与 `manifest.anim.clips` 顺序固定；`idle_blink` 是 overlay/one-shot；attack `holdMs=[83,83,63,42,42,63,63]`。
- 硬门（`tests/pet-anim-human.test.ts` + `scripts/gen-human-anim.py --check`）：PNG 96×96/8-bit RGBA；hard alpha；四角透明；不贴画布边；**maxY=89**；**每帧 ≤20 色且 ∈ PALETTE**（实测 ≤19）；68/68 唯一帧；1 px 闭合外轮廓（非 FX 缺口 0）；无内部 outline 色像素；无封闭透明洞；FX 后绘、不覆盖/触碰身体。
- 当前视觉口径：正面 2.5 头身（v8 修正了侧视/正面腿部与同侧肢体重复）；侧视 walk/run 是简化 profile；头顶 y=13、眼镜中心 30、下巴 41、肩 47–52、腰 57–62、裙 60–75、腿 76–84、鞋 85–89；腿 x=43–46 / 50–53；侧视鼻尖 x=34、尾根 (57,68)（[`../../design/HUMAN-TINGLAN-2026-11-18.md`](../../design/HUMAN-TINGLAN-2026-11-18.md) §2.1）。
- 缩略：96×96 在桌宠 2× 显示为 192 CSS；插件按 72 px（`dsh-famling/README.md`）。

### 4.3 T-B 128 final 主画布

- **2026-11-20 拍板：final 唯一主画布**；palette `orca-pixel@0.2` 已注册（24 色）；128×128 契约见 `art/specs/pet.tinglan.pixel.json`；当前 **0 张资产**。
- canvas 128×128；anchor `(64,128)`；bbox `[16,10,104,118]`；footBox `(-48,-24,96,24)`；motion ±4；display.scale=2；窗口 480×336（未实现）。
- 像素预算：头含发 46–48 px；全高 116–118；腿占 22–24%；眼 8–10；虹膜 4–6；嘴 2–5；镜框 1；发夹 3–6；领夹 2–4；珍珠 1–2；尾白缘 ≤1–2；1 px 轮廓；≤40 色（目标 ≤32）。
- 帧契约：`idle 8@8 loop`、`pat 6@10`、`drag 4@8 loop`、`land 4@12`、`talk 4@12 loop`、`remind 6@10`、`sleep 4@2 loop` = 36 帧；附件 13 = `expr_calm`、`expr_happy`、`turn_front/side/back`、`mouth_closed/a/i/u`、`eye_open/half/closed`。
- 96 与 128 **不互转**：128 不能由 96 放大；96 不能由 128 非整数缩小。

### 4.4 T-C 256 keyart

- **2026-11-20 拍板：仅 keyart/大图参考，不是 final 运行时画布**（现有 49 帧 concept 包保留）。
- canvas 256×256；anchor `(128,256)`；bbox `[32,20,208,236]`；footBox `(-96,-48,192,48)`；display.scale=1；`placeholder:true / final:false`。
- 现行 `gate_256.py` 检查（49 帧）：尺寸 256²；hard alpha；四角 alpha=0；透明像素 RGB=(0,0,0)；内容落在 `[32,20,208,236]` 内；接地 tag `bottom_y==255`（drag 允许 246–255）；opaque ≤40 且 ∈ `orca-pixel@0.2-draft` 32 槽；禁 `#000/#FFF`；11 角色槽覆盖；**主体 2 px 闭合轮廓**（≥100 边界像素）；镜环（2 px 银环 + 8 方向环覆盖）；每睁眼恰好 1 个 2×2 `#F4F9FF`；鲸发夹/鲸领夹（鲸+银杆）；白领；珍珠双耳；尾白缘中位 2–4 px。
- 当前状态：49/49 机检通过（含 2026-11-17 珍珠修复），**仍是 AI concept + 脚本锚点，不是人工 final**；`character.json` 仍把它接成 `?hero=1&character=tinglan` 的 opt-in 预览（保留，不改代码），但按 D2 **不再排 final 化**。

### 4.5 T-A KeyArt / normal

- 画布：1024×1536（2:3）透明母版；表情/细节 1024²；场景 16:9 = 1536×864（**不要按 2560×1440/1920×1080 请求**）；加载页 16:9；About/图标 1024²（圆裁安全区 ≥40%）。
- 构图：人物高 **90–94%**、四周留白 ≥24 px；发顶/脚底不裁；默认 eye-level、50–85 mm 等效、无广角；三视图正交。
- 头身：**6.0–6.3**（对齐值 6.0，上限 6.3）；腰线约 48–50%；腿约 47–50%；禁短腿/短躯干/缩头凑比例。
- 眼睛：虹膜宽约脸宽 1/5–1/4；高光 1–2 px（换算到 1024 概念约 12–16 px，降到 128 后仍 ≥1 px）；**每睁眼 ≥1 个 `#F4F9FF` 硬高光**（闭眼/半闭帧允许 0，禁止残留白点）。
- 交付：透明 PNG 母版 + 人工修（手/脸/尾根/边缘）+ palette 统一 + 2× 终审；**KeyArt 不像素化，也不降采样成运行时帧**。

### 4.6 像素语法（所有像素轨道共用）

1. **剪影优先**：先用纯黑填充做 5 秒测试（矮个秘书 + 一侧尾 + 正面/侧面可读），过了再上色。
2. **1 px 闭合外轮廓**：边界不透明像素全为 `#0B1220`；2× 下无断线/双线；四角 alpha=0。
3. **内部结构线**：只用浅色（suit_hi/shade/hair_hi 等），**不用 outline 色**；96 的测试要求「内部 outline 色像素 = 0」。
4. **阴影**：固定左上光，每材质 2–3 阶硬边纯色；禁 AA/渐变/dither/柔光/半透明/外发光/地面投影（透明底）。
5. **FX**：星光/运动线/冲击线/纸页/速度线在轮廓之后画在独立 overlay，只合入仍透明像素；FX 不覆盖身体、不触碰身体、不用 outline 色描边。
6. **道具**：现行 96 占位把球/书/纸扇烘焙进帧（便于 1× 读动作）；**final 建议道具分离**（球/纸团作为场景 sprite，角色帧只留身体动作），见 PET-ANIMATION §9.6。
7. **位移**：只走整数 px；96 ≤1–2 px、128 ≤2–3 px；关键件（镜心/发夹/领夹/尾根/裙摆/鞋底）逐帧 y 漂 ≤1 px；loop 首尾像素差 ≤0.1%。
8. **禁止**：smear/补间/AI 插帧/颜色渐变过渡/透明度淡入淡出/旋转扫描（头倾 1–2° 需重绘）。

### 4.7 正面/侧面骨架锚点（96 实测，128 final/256 keyart 按比例重设而非放大）

| 部件 | 96 y（正面） | 96 侧视 x | 128 设计目标 | 256 设计目标 |
|---|---|---|---|---|
| 发顶 | 13 | 头含发 x≈35–61 | 头含发 46–48 px 高 | 同级 ×2 预算，不放大 128 |
| 眼镜/眼中心 | 30（镜框 27–32） | profile 镜片 5×4 + 1 px 镜腿 | 眼 8–10、镜片 8–10 | 眼/镜片约 2× 128 预算 |
| 下巴 | 41 | 鼻尖 x=34、下巴 y=41 | 头高 46–48 | 头高约翻倍 |
| 肩线 | 47–52（肩宽 26） | 胸 x=38、背 x=58 | 肩宽约 2/3 头宽 | 按比例 |
| 腰/裙 | 腰 57–62、裙 60–75 | 腰 40–56、裙侧 39–57 | H 型、后开衩 | 同 |
| 尾根 | 68 | (57,68) 从裙后穿出 | 后腰锚点、裙后 | 同 |
| 腿/鞋 | 腿 76–84、鞋 85–89 | 近腿/远腿各 5 px | 腿占 22–24% | 同 |
| 地线 | **89** | 89 | **128** | **255** |

> 128 final/256 keyart 的几何是**重新构图**，不是把 96 乘 1.333/2.667；比例尺只用于检查预算，不用于缩放资产。

### 4.8 文件/命名/manifest 规则

- 96：`public/assets/pet/anim/human/<clip>/<clip>_NN.png` + `manifest.json`；顶层只允许 `manifest.json` + 12 个 clip 目录（测试断言）。
- 256：`public/assets/pet/tinglan-256/<tag>_NN.png` + `manifest.json`；canonical P1 命名 `_00`。
- 128（未来）：一个角色一个目录，7-tag 帧 36 + 附件 13；不得与 96/256 混放。
- 每套 manifest 必须记录：`palette`、`placeholder/final`、`ai.status`、`license`、帧数/顺序、`anchor/footBox/canvas`；final 时 `placeholder:false` 且 `ai.status` 按真实情况（`none` 或 `concept` 已升级）。
- 换图流程：同路径替换 PNG → 更新 manifest 元数据 → 跑该轨道测试/生成器 `--check` → 人工 contact sheet + 2× 走查 → 才可标 final。

## 5. 正面 / 侧面 / 三视图 prompts

### 5.1 单视图 prompt（T-A 正常头身）

> 组装公式：`IDENTITY-NORMAL` + 本视图句 + 收尾句（单角色/透明底/无字/概念稿）。每张只生成一个视图，**不要在一张图里放多视图**（多视图只用于 concept sheet，见 §5.2）。

| 视图 | 追加句（英文，接在 IDENTITY-NORMAL 之后） |
|---|---|
| FRONT | `Orthographic front view, full body, arms relaxed at the sides, feet parallel on the same baseline, neutral closed mouth, eye-level camera, no perspective distortion; one single view only, not a sheet.` |
| SIDE | `Orthographic left-side 90-degree view, full body, facing viewer-left; tail fluke and the back slit of the skirt fully visible; heel profile visible; arms relaxed; same height and head scale as the front view; one single view only.` |
| BACK | `Orthographic back 180-degree view, full body; tail root emerging cleanly above the skirt back slit; bob silhouette and nape visible; suit back seam visible; arms relaxed; same height and head scale as the front view; one single view only.` |
| 3/4 | `Three-quarter front view, full body, weight on the back foot, arms relaxed, tail visible behind the skirt; all identity anchors readable; one single view only.` |

### 5.2 三视图 concept sheet（仅概念；final 建议分开生成）

```text
Character turnaround model sheet, one single 3:2 landscape canvas, exactly three equal vertical cells side by side, in this order: front, left profile facing viewer-left, back; do NOT draw any grid lines, borders, frames, dividers, labels or numbers; leave a narrow fully transparent gutter between cells. Same character, same outfit, same palette, same camera distance, same pixel-block scale and same lighting in all three cells; identical identity anchors in every cell (thin ROUND silver glasses with bridge; blue-whale hairpin on HER LEFT bangs, viewer right in front view; blue-whale tie clip centred on the black tie; white collar + one pearl drop per ear; flat thin two-lobed orca fluke behind the skirt; black dorsal top with only a thin pale ventral rim). Each cell: one complete full-body figure, empty hands, neutral A-pose with arms about 8 degrees from the body, feet on that cell baseline, figure fills about 92% of the cell height, centred with padding; no figure may cross a cell boundary; no duplicated limbs, no in-between poses. Plain transparent background, no ground shadow, no props, no scenery, no text, no logo, no watermark. Flat cel pixel-style concept for a later manual low-resolution pixel pass: 2-3 hard-edged shadow steps, one uniform dark outline, limited flat palette, no gradient, no dithering, no glow, no blur, no anti-aliasing. AI concept draft, not final pixel art.
```

### 5.3 逐视图关键要求

- **正面**：两片圆镜环可数；发夹在**画面右**（她的左刘海）；领夹在领带正中；珍珠双耳对称；尾在裙后，不能从正面看到大块白腹。
- **侧面**：鼻/唇/下巴 profile 可读；镜腿 + 珍珠短坠可见；发夹随头转到可见位置；尾是**薄片**、上黑下薄白缘；裙后开衩 + 尾根关系清楚。
- **背面**：bob 后发轮廓 + 后颈；西装背部中缝；尾根从裙后开衩穿出，**不在双腿之间**（256 占位已知缺陷，重画时修正）；尾上表面全黑 + 薄白缘。
- **3/4**：默认身份母版角度；发夹朝向（鲸头朝脸前方）；眼镜与耳饰不互换；尾近叶大、远叶缩短，不摊成扇形。
- **禁止**：三视图之间身高差 >1 px（128）/ >2 px（256）；镜像发夹；漏眼镜/领夹/耳坠；尾穿裙/贴侧缝/在裙前；白腹大面。

### 5.4 三视图验收

| # | 检查 | 阈值 | 方式 |
|---|---|---|---|
| 1 | 三视图同高（front/side/back 头顶→脚底） | 128 ≤1 px；256 ≤2 px；normal ≤1% | 叠图/量测 |
| 2 | 同一基线（脚底） | 差 0 px（各视图内） | 像素扫描 |
| 3 | 7 锚点 | 7/7 可见（背视发夹/领夹被遮挡不算漏） | 人工 2× |
| 4 | 尾结构 | 两叶 + 中央缺刻；单视角无白腹大面 | 人工 2× |
| 5 | 颜色 | 关键 token ΔE00 ≤5；accent ≤3% | 取色比对 |
| 6 | 构图 | 单角色/无格线/无标签/人不出格 | 人工 |

## 6. 表情 prompts（9 表情 + 3 角度）

### 6.1 9 表情（canon 全集；不得新增第 10 个）

| # | 表情 | 眼/眉/嘴（设计 delta） | 运行时映射 | 追加句（英文，替换 IDENTITY 的表情句） |
|---|---|---|---|---|
| 1 | neutral | 眼开 80–100%；平眉；小闭口平直；直视 | 母版 / idle / talk / 三视图 | `neutral expression: eyes open 80-100% with exactly one small hard near-white catchlight each, flat brows, small closed flat mouth, level gaze.` |
| 2 | smile | 下眼睑轻抬；闭口浅笑；不露齿 | `expr_happy` / pat / 256 happy | `restrained closed-mouth smile: lower eyelids gently raised, mouth corners slightly up, no teeth, no blush, no sparkles.` |
| 3 | focus | 眼收 10–15%；眉内压；唇平；视线略下 | talk/remind 基底 / focus tag | `focused: eyes narrowed 10-15%, brows pressed slightly inward, lips flat, gaze slightly down, no frown.` |
| 4 | thinking | 视线上左；眉微蹙；唇抿；头倾 2–3° | KeyArt/对话静态 | `thinking: gaze up-left, brows slightly knit, lips pressed, head tilt 2-3 degrees, no hand near the face.` |
| 5 | surprised | 眼放大 15%；眉抬；唇小开；克制 | drag_00（克制版）/KeyArt | `restrained surprise: eyes about 15% wider, brows raised, lips parted 2-3 units, no comic sweat, no exclamation.` |
| 6 | sleepy | 眼睑 50%；头倾 2°；唇松；非诱惑 | sleep / idle f3 / yawn | `sleepy: eyelids at 50%, head tilt 2 degrees, relaxed mouth, small exhale, not seductive.` |
| 7 | pout | 眉微压；眼略细；下唇轻撇；**不鼓颊** | refuse（P2）/KeyArt | `mild pout: brows slightly pressed, eyes narrowed, lower lip slightly out, cheeks not puffed, no comic anger.` |
| 8 | determined | 眉压低内收；眼收窄；唇线平直；不露齿 | remind 主帧 / 256 determined | `determined: brows lowered and pressed inward, eyes narrowed, mouth flat, no teeth, not fierce.` |
| 9 | tired | 眼半闭；唇微开呼气；肩沉；不病弱 | sleep / yawn / KeyArt | `tired: eyes half closed, lips slightly parted as if exhaling, shoulders dropped, no sickly look.` |

**3 角度面板**（不是第 10 个表情，是同一表情的不同头部角度）：

| 角度 | 追加句 | 用途 |
|---|---|---|
| look-back | `look-back angle: head turned over the shoulder toward the camera, eyes to camera, mouth neutral, hairpin and glasses follow the head.` | KeyArt / pat_tail 参考 |
| 3/4 | `three-quarter view, calm direct gaze, mouth neutral.` | 母版默认角度 |
| profile | `exact 90-degree profile, glasses temple and pearl drop visible, hairpin visible, mouth neutral.` | `turn_side` / profile 面板 |

### 6.2 表情附件 sheet（eye×3 + mouth×4，128 final 用；256 keyart 参考）

```text
Character facial attachment sheet, one single 3:2 landscape canvas, exactly six equal cells in 2 rows x 3 columns; do NOT draw grid lines, borders, dividers, labels or numbers; leave a narrow transparent gutter between cells. Same head-and-shoulders crop in every cell; head occupies about 70% of the cell height; identical head position, head scale, head angle and camera in all six cells; same character, same glasses, same hairpin and earrings in every cell; no grid lines, no labels. Only the facial attachments change, row-major: (1) eyes open with exactly one hard near-white catchlight per eye, mouth closed; (2) eyes half-closed, no catchlight; (3) eyes closed as thin dark lines, no catchlight; (4) mouth open "a"; (5) mouth narrow "i"; (6) mouth rounded small "u". Body, shoulders and collar do not change; no hand, no prop, no blush. Transparent background, no text, no logo, no watermark. Flat cel pixel-style concept for a later manual pixel pass; no gradient, no dithering, no glow, no anti-aliasing. AI concept draft, not final pixel art.
```

> 若端点对长句/引号敏感，可把 `"a"/"i"/"u"` 改为 `mouth shape A / mouth shape I / mouth shape U`。本 sheet **6 格覆盖 6 个状态**：eye_open（嘴闭）、eye_half、eye_closed、mouth_a、mouth_i、mouth_u；T-C 的第 7 个附件 `mouth_closed` 与 eye_open 格同状态，可由该格裁切复用（或单独出 1 张 1:1）。256 占位包已有这 7 张（由 master 裁切，非 body-aligned final，见 TINGLAN-256-ANCHOR-FINAL §6.3）。

### 6.3 chibi 4 表情（256 的 F 组 / 128 的 expr 附件）

四个表情**分开生成**（不拼图），分别接 `IDENTITY-CHIBI`：

| 表情 | 追加句 |
|---|---|
| neutral | `neutral adult chibi expression: eyes open with one hard catchlight each, flat brows, small closed mouth.` |
| happy | `happy closed-eyes smile: lower eyelids gently raised into a small arc, mouth corners up in a closed smile, no teeth, no blush.` |
| determined | `determined: brows lowered and pressed inward, eyes narrowed, mouth flat, no teeth, not fierce.` |
| sleepy | `sleepy: eyes fully closed as thin dark lines, relaxed mouth, head tilt 2 degrees, not seductive.` |

### 6.4 96 轨道的表情预算（当前实现）

- 96 占位包**没有独立 talk 口型/表情帧**：表情只靠 `idle`/`idle_blink` 的眼状态（睁/半闭/闭）与 `pat_head` 的眯眼 + 2 px 腮红 + 星光；`talk/remind/sleep` 在 interactions 里映射到 `idle`（见 §7.4）。
- 眼预算：3×2 蓝虹膜 + 1 px 高光 + 1 px 上睫线；闭眼 = 1 px 深色线；半闭 = 遮上半虹膜、高光消失。
- 若未来把 96 升级为 final：建议按 canon 7-tag 补 `talk`（口型 4 相）与 `sleep`（闭眼慢呼吸），但**必须升契约**（12-clip 契约没有 talk/sleep clip），不能悄悄往 96 包塞新文件（PET-ANIMATION §9.7）。

### 6.5 表情验收

- 同一头肩构图、同一头部比例（±2%）、同一眼镜/发夹/耳坠位置；只允许眼/眉/嘴/头倾/视线变化，禁止换脸。
- 睁眼帧每眼**至少 1 个** `#F4F9FF` 硬高光（目标 1–2 px）；半闭/闭眼帧 0 高光、无残留白点。
- 9 表情为全集：`concerned/listening` 等旧 8 表情名不再单独出图，映射到 tired / 3-4 + neutral（CANON §5.3）。
- 禁：脸红/泪光/心形瞳/猫嘴/星星（96 `pat_head` 星光与腮红是占位例外）。

## 7. 动作 prompts（12 clips + 7 tags + 25-tag 计划）

### 7.1 12-clip 契约（当前 96 hero 动画；帧表已冻结）

| clip | 帧@fps | loop/layer | 时长/hold | 动作句（英文，接 IDENTITY-CHIBI；final 默认空手） | 现行 96 占位道具/FX（仅 A 模式） |
|---|---|---|---|---|---|
| idle | 6@6 | loop / base | 1000 ms | `neutral front standing, empty hands, arms relaxed; gentle breathing: chest lifts a little on inhale and settles by the end, eyes open with one hard catchlight each, small orca tail behind the skirt sways once; seamless loop.` | 双手托一本摊开小书 |
| idle_blink | 3@12 | one-shot / overlay | 250 ms | `same body as idle frame 0, only the eyes change: half-closed, then closed as thin dark lines, then half-open; no other change.` | — |
| walk | 8@10 | loop / base | 800 ms | `side view facing viewer-left, gentle walk cycle: alternating steps, arms swing opposite, torso rises and falls a little, skirt and tail follow, glasses and hair stable; seamless loop.` | — |
| run | 6@14 | loop / base | 429 ms | `side view facing viewer-left, short run: body leans forward, stride wider, hair and tail trail back, arms pump, feet clear the ground; seamless loop.` | 抱账本 + 2 帧速度线 |
| pat_head | 4@8 | one-shot / oneshot | 500 ms | `front standing, reaction to a head pat, no hand in the sprite: head tips down, eyes narrow into a restrained closed-mouth smile, shoulders lift a little, tail flicks once.` | 3 帧星光 + 2 px 腮红（占位例外） |
| ball_throw | 5@10 | one-shot / oneshot | 500 ms | `front standing, wind-up and overhand throw to viewer-right: right arm raises, body coils, then releases forward with follow-through; one-shot.` | 1 颗纸团 + 运动线（占位） |
| ball_chase | 6@12 | one-shot / oneshot | 500 ms | `front standing, turn and reach down toward a rolling ball at viewer-right, crouch and catch, then rise with a small smile; one-shot.` | 1 颗纸团（占位） |
| paw_face | 5@8 | one-shot / oneshot | 625 ms | `front standing, left hand rises to adjust the blue hairpin at HER LEFT bangs, head tips slightly, then returns; hand in front of the hair, not covering the face.` | — |
| scratch | 6@8 | one-shot / oneshot | 750 ms | `front standing stretch: both arms rise outside the silhouette of the bob, body lengthens, the peak frame closes the eyes and opens the mouth slightly, then lowers.` | 2 条拉伸短线 |
| stand_wag | 6@8 | one-shot / oneshot | 750 ms | `front standing, straighten up and give a small hand wave with the right hand, tail sways broadly, slight smile; one-shot.` | — |
| chase_tail | 6@10 | one-shot / oneshot | 600 ms | `front standing, head turns three-quarter to look back over the shoulder toward the tail, one hand lifts, tail sways; one-shot; no rotation smear.` | 翻页线/星光 |
| attack | 7@16 | one-shot / oneshot | 439 ms（holdMs `[83,83,63,42,42,63,63]`） | `front standing, light paper-fan tap: wind-up, ready, forward tap with the fan open and three short impact ticks, recover; one-shot, non-uniform timing.` | 白纸扇 + 3 条冲击线（占位） |

> **道具策略**：现行 96 占位把道具烘焙进帧（只为 1× 可读性）；**final 建议道具分离**（球/纸团/纸扇作为场景 sprite），角色帧只留身体动作。若必须延续占位（A 模式），每帧**恰好一个**道具实例，禁止叠层/同侧肢体重复（v8 已加审计）。

### 7.2 7-tag 契约（128 final 主画布；256 keyart 仅参考）

| tag | 帧@fps | loop | 动作句（英文，接 IDENTITY-CHIBI；空手） |
|---|---|---|---|
| idle | 8@8（canon；256 占位 manifest 为 8@10，final 前统一） | loop | `neutral standing, empty hands; breathing: shoulders/chest lift a little on inhale and settle by exhale; blink on frames 3-5 (half, closed, half); tail sways two phases; first and last frame close for a seamless loop.` |
| pat | 6@10 | one-shot | `reaction to a head pat, no hand in the sprite: contact (head tips down), compression (eyes closed to thin lines), rebound (head rises a little, eyes open), settle back to neutral; restrained smile, no blush, no sparkles.` |
| drag | 4@8 | loop | `lifted off the ground: feet off the baseline, body suspended with a small vertical bob, arms slightly raised but not flailing, tail sways two phases, skirt stays down; no upskirt.` |
| land | 4@12 | one-shot | `landing after being put down: touch down with knees bent (squash at most 2 units), rebound with a small overshoot, settle with feet planted, return to neutral.` |
| talk | 4@12 | loop | `body locked in neutral three-quarter pose; only the mouth and jaw change: closed, open "a", narrow "i", rounded "u"; body and hands stay still.` |
| remind | 6@10 | one-shot | `determined reminder: head lifts, leans forward a little, direct eye contact, one small nod, then returns to neutral; no exclamation glyph in the sprite.` |
| sleep | 4@2 | loop | `eyes closed as thin lines, head tilt 2 degrees, shoulders low, tail relaxed; slow two-second breathing with two phases; not seductive.` |

### 7.3 动作 sheet prompt（先 sheet 后单帧；禁止逐帧 AI 直出）

```text
Character pose sheet (model sheet), one single 3:2 landscape canvas, exactly six equal square cells in 2 rows x 3 columns; do NOT draw any grid lines, borders, frames, dividers, labels or numbers; leave a narrow fully transparent gutter between cells. Same character, same outfit, same palette, same camera distance, same pixel-block scale and same lighting in all six cells; identical identity anchors in every cell. Each cell: one complete full-body figure, empty hands, feet on that cell baseline, figure fills about 92% of the cell height, centred with padding; no figure may cross a cell boundary; no motion arcs, no duplicated limbs, no in-between frames. Poses row-major: (1) neutral standing; (2) inhale peak, chest lifted, tail out; (3) pat-compress anticipation, shoulders up, eyes open; (4) drag airborne, feet off baseline, alerted; (5) land squash, knees bent, mouth closed; (6) remind lean, slight forward lean, tail still. Flat cel pixel-style concept: 2-3 hard-edged shadow steps, one uniform dark outline, limited flat palette, no gradient/dithering/glow/blur/anti-aliasing. Transparent background, no ground shadow, no props, no text, no logo, no watermark. AI concept draft for a later manual pixel pass, not final pixel art.
```

- 每 tag 先出 1 张 sheet 锁比例/服装/锚点；只挑「灵魂帧」（接触/压缩/回弹/峰值）做单帧概念；其余帧**人工补间**（整数位移 + 局部色块），不要逐帧 AI 直出。
- attack 的 7 帧非均匀节奏只能人工/渲染层实现；AI sheet 不承诺 holdMs。

### 7.4 契约映射（重要：两套帧表不要混用）

| 动作 | 12-clip（96 hero，当前发布路径） | 7-tag（128 final） | 25-tag 计划（未来） | interactions 事件（`src/pet/anim/interactions/human.json`） |
|---|---|---|---|---|
| idle | `idle` 6@6 | `idle` 8@8 | idle | state `idle`（wake/ambient） |
| blink | `idle_blink` 3@12 | 内嵌 idle f3–f5 | idle | state `idle_blink` |
| walk | `walk` 8@10（spec-only） | — | — | 无事件（spec-only） |
| run | `run` 6@14 | — | — | state `run` |
| pat | `pat_head` 4@8 | `pat` 6@10 | pat | state `pat`/`pat_head`（gesture head） |
| throw/chase | `ball_throw` 5@10 / `ball_chase` 6@12 | — | — | state `ball_throw`/`ball_chase` |
| tidy/face | `paw_face` 5@8 | — | — | state `paw_face`（action 整理蝴蝶结） |
| stretch | `scratch` 6@8 | — | stretch/yawn | state `scratch`（ambient） |
| wave | `stand_wag` 6@8 | — | wake/stretch | state `play`/`stand_wag`（action 挥手） |
| tail | `chase_tail` 6@10 | — | pat_tail | state `chase_tail`（gesture tail） |
| attack | `attack` 7@16（spec-only） | — | — | 无事件（spec-only） |
| drag | —（映射到 idle） | `drag` 4@8 | drag | state `drag` |
| land | —（映射到 idle） | `land` 4@12 | land | state `land` |
| talk | —（映射到 idle） | `talk` 4@12 | talk | state `talk` |
| remind | —（映射到 idle） | `remind` 6@10 | remind | state `remind` |
| sleep | —（映射到 idle） | `sleep` 4@2 | sleep | state `sleep` |

> 结论：如果目标是**当前 96 hero/插件**，按 12-clip 生成；如果目标是 **128 final**，按 7-tag 生成（256 keyart 沿用 7-tag 参考但不再 final 化）。**不要**把 7-tag 的 talk/drag/land 塞进 12-clip 包（会被 manifest/测试拒绝），也不要指望 96 的 `walk/attack` 出现在 7-tag 契约里（它们被标为 spec-only）。
>
> 跨角色系统文档 [`CHARACTER-PROMPT-SYSTEM-2026-11-20.md`](CHARACTER-PROMPT-SYSTEM-2026-11-20.md) §6.1 以 **12 clips（`src/pet/anim/timing.json`，唯一运行源）** 为当前运行契约；7-tag 是 **128 final 主画布**的既有资产契约（256 keyart 仅参考）。**默认按 12 clips 生成**；只有 lead 明确要 **128 final** 轨道时才按 7-tag 生成，二者不得混包。

### 7.5 交互动作 → clip 映射（96 点击/菜单，供生成优先级）

| 交互 | 事件 | 目标 state/tag | 96 clip | 生成注意 |
|---|---|---|---|---|
| 点头部（摸头） | `pat` | pat → `pat_head` | pat_head | 手不进 sprite；克制闭口笑 |
| 点身体 | `stand_wag` | stand_wag → `stand_wag` | stand_wag | 挥手/摇尾；不叉腰（避免封闭洞） |
| 点尾巴 | `chase_tail` | chase_tail → `chase_tail` | chase_tail | 回头 3/4；不做整圈旋转 smear |
| 菜单「递纸」 | `feed` | play → `stand_wag` | stand_wag | 递纸动作可后续加 clip；当前复用挥手 |
| 菜单「挥手」 | `stand_wag` | stand_wag → `stand_wag` | stand_wag | 同点身体 |
| 菜单「整理蝴蝶结」 | `paw_face` | paw_face → `paw_face` | paw_face | 手在发前、bow 1 px 位移；不遮脸 |
| 菜单「聊两句」 | `talk` | talk → `idle` | idle | 96 没有 talk clip；气泡由 DOM 承担 |
| 拖拽/落地/提醒/睡眠 | drag.start / drag.end / reminder.due / sleep | 映射 idle（96） | idle | 96 无对应 clip；未来按 7-tag 补 |

96 点击区（`regions.json`，96 逻辑画布）：head `[34,8,34,38]`、tail `[58,60,32,24]`、body `[24,44,48,44]`；仅在 idle/idle_blink 响应。

### 7.6 未来生成优先级（建议）

1. **P0**：T-A 身份母版 + 4 视图（没有母版不批量）；T-B 的 7-tag 36 帧中的 `idle/pat/drag/land/talk/remind/sleep` 关键帧（每 tag 1 张 sheet + 灵魂帧）。
2. **P1**：T-B 128 final 的 13 附件（expr×2、turn×3、mouth×4、eye×3）；T-C 256 **不再排 final 化**（D2，仅 keyart/参考）。
3. **P2**：T-D 96 继续占位/兼容（**bow 保留**，D3；不排 final 升级）；25-tag Wave2–4（focus/read/pat_hand/pat_tail/wake/startle/stretch/glasses/refuse/write/look_out/yawn/tail_flick/tablet_show/daze/tie_adjust/tap_tablet/idle_away）按 RUNTIME-MAP §7 分批。
4. **P3**：KeyArt 场景/加载/About/图标（依赖 P0 母版）。

### 7.7 动作验收

- **loop**：首尾像素差 ≤0.1%；同 tag 相邻帧差在 0.5%–15% 窗内；不允许 8 帧全同/只改颜色。
- **位移**：整数 px；96 ≤1–2、128 ≤2–3；关键件 y 漂 ≤1 px；脚底/地线恒定。
- **同侧肢体**：正面 clip 左右各 1 只手；侧视恰好 1 只近手；抬爪/抬臂时地面同侧肢体不得重复（v8 审计门禁）。
- **道具单层**：每帧恰好 1 个道具实例（ball/fan/book/ledger）；无叠层/无白袖口伪手。
- **FX**：不覆盖身体、不触碰身体轮廓、不用 outline 色；烘焙 FX 仅占位允许，final 建议分离。
- **可读性**：1×（96）与 2× 下动作方向可读；contact sheet 逐 clip 人工看完才可提交。

## 8. 负面词（Negative）

### 8.1 模型层 `Avoid:` 短句（可发送；按轨道替换末句）

```text
Avoid: no text, no letters, no numbers, no signature, no watermark, no logo, no brand mark, no official mascot, no existing copyrighted character, no traced or copied art, no photo, no 3D render, no painterly or soft shading, no gradient, no glow, no blur, no anti-aliasing, no translucent pixels, no pure black or white large areas, no white hair streak or highlights, no white gloves, socks, shoes or shoulder patch, no extra or fused fingers, no broken hands, no asymmetric glasses, no tail through the skirt, no multiple characters, no background scenery, no ground shadow, no cropped feet or head, no border, no sprite-sheet grid, no labels, no suggestive styling, no blush, no tears, no heart pupils, no readable text or UI on any prop.
```

> 跨角色主 AVOID 以 [`CHARACTER-PROMPT-SYSTEM-2026-11-20.md`](CHARACTER-PROMPT-SYSTEM-2026-11-20.md) §7.1 为逐字复用版本（见 §2.0）；上面是汀岚任务的压缩版。两者冲突时以 §7.1 为准，并保留本包 §8.2 人工 checklist。

- **96/128 final/256 keyart 加**：`no thick black outline, no double outline, no broken outline, no hard pixel grid visible in the concept, no oversized round glasses, no giant eyes, no chibi child proportions.`
- **KeyArt 加**：`no low camera angle, no upskirt, no cleavage, no bare shoulders, no maid or service outfit, no romantic framing, no scenery text, no UI.`
- **注意**：不要把 `child / minor / sexualized / lingerie / upskirt` 等敏感词写进**发送**的 prompt（403/moderation 风险）；这些只进 §8.2 人工 checklist。

### 8.2 人工筛图 checklist（不发送；生成后逐项过）

**身份**：圆细银框眼镜（always-on）/ 左刘海蓝鲸发夹（画面右）/ 领带正中蓝鲸领夹（同源几何）/ 珍珠短坠双耳 / 扁平两叶尾（后腰、裙后、上黑下白、单视角无白腹大面）/ 白只限衬衫珍珠尾腹 / 1 px `#0B1220` 轮廓。
**禁止漂移**：白/灰挑染、渐变发、眼斑、下颌线、鞍斑、白肩斑；几何鱼夹、官方 DeepSeek 鱼标/字标/吉祥物；圆角长方框/粗框/彩片/无眼镜/不对称；厚弯尾、鳐鱼尾、鱼尾、单叶、全白尾、白背黑腹反色、尾穿裙/贴侧缝/在裙前、多鳍、断尾；maid、深 V、高开衩、渔网、细高跟、低机位、脸红、泪光、心形瞳、幼儿化/性化。
**风格/技术**：厚涂、渐变、发光、模糊、3D、写实、抗锯齿、半透明、纯黑/纯白大面积、噪点、假像素网格、块大小不均、AA 边。
**构图/内容**：文字/数字/签名/水印/Logo/UI/边框/拼贴网格；多角色/背景人群/地面阴影；裁切脚/头；平板屏有可读文字；图内标签。
**合规**：官方关联暗示、真人影射/名人、现有 IP、同人 1:1 描摹、AI 未披露；任何 18+ 性化/恋爱化/未成年人亲密内容。

### 8.3 各轨道追加项

| 轨道 | 追加负面项（人工 checklist） |
|---|---|
| T-A normal | 6.0–6.3 头身之外的比例；短腿/缩头；胸/裙/腿特写；可读屏幕内容 |
| T-B 128 final | 画布不是 128；锚点不符；7 tags 外的新 tag；帧内夹平板；眼睛 <8 或 >10 px；帧色不在已注册 `orca-pixel@0.2` 24 色内 |
| T-C 256 keyart | 画布不是 256；2 px 轮廓断裂；镜环/高光/珍珠/尾缘不达 gate；back 尾根在双腿之间（**keyart 参考，不参与 final 验收**） |
| T-D 96 | 画布不是 96；地线不是 89；>20 色；内部 outline 色像素；封闭透明洞；同侧肢体重复；道具叠层；FX 覆盖身体（**bow 保留为已批准简化**） |
| KeyArt | 16:9 写成 2560×1440；透明底场景图；图上文字/UI；AI 生成冒充手绘 |

### 8.4 moderation / 法务注意事项

- 端点**没有 negative 字段**；负向只能写成正文短句，且过长负向清单在图像模型上通常无效甚至反向诱导。按 [`../prompt-library/REVIEW-MODEL-FIT-2026-11-16.md`](../prompt-library/REVIEW-MODEL-FIT-2026-11-16.md) R3：**删掉长 NEG 发送**，只保留一句 `no text/no watermark/no logo` 级约束，其余转人工筛图。
- 敏感词（child/minor/sexualized/lingerie/upskirt 等）与 `chibi` 同请求会抬高 403；正文用 `adult / work-appropriate / neutral professional` 正向表述，敏感项留人工。
- 生成/发布必须披露 AI（可见标识 + PNG 元数据 + provenance）；不得冒充官方/真人手绘/真人配音。
- 许可：角色/设定目标 CC BY-NC-SA 4.0（DRAFT，律师审查暂缓，商用另取书面许可）；当前占位资产 `license: placeholder-only`；CC0 仅限汀岚 Pixiv 素材（Pixiv `131049875`，清单未核验，不得作输入）。
- 禁止：使用 DeepSeek 官方 Logo/鱼标/吉祥物/字标；把设定页/v3/ref10/他人同人作 `input_references` 或 1:1 描摹。

### 8.5 负向词常见错误

- ✗ 把「≤40 colors / canvas 96×96 / exact 1px outline / binary alpha」写进 prompt —— 模型做不到，只会诱导假像素边框；这些只进规格与验收（§4/§11）。
- ✗ 用长负向清单替代构图/身份描述 —— 先写正向「是什么」，负向只做收尾。
- ✗ 把「官方 logo」等词拼进正向句 —— 会反向诱导官方元素；用 `non-official, original OC` 正向声明。
- ✗ 依赖 negative 修手/修尾/修色 —— 结构错必须重生成或人工重绘，后处理救不了。

## 9. 模型 / 参数 / 种子（Seed & Model Parameters）

### 9.1 端点与能力（唯一事实源：`REVIEW-MODEL-FIT-2026-11-16` §1 + 本仓 33 次调用记录）

| 项 | 值 | 备注 |
|---|---|---|
| endpoint | `POST https://openrouter.ai/api/v1/images` | 不是 `/chat/completions` |
| model | `openai/gpt-image-2.6-sunburst` | 仅 OpenAI provider |
| 输出尺寸 | 1:1 = **1024×1024**；2:3 = **1024×1536**；16:9 = **1536×864**（官方示例；本 key 未实测 16:9） | 没有 size/resolution 参数 |
| `aspect_ratio` 合法值 | `1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 16:9 / 9:16 / 21:9 / auto` | 不用 `auto` |
| `quality` | `auto / low / medium / high / xhigh / max` | 默认显式 `high`（不写可能落低档） |
| `background` | `auto / transparent / opaque` | `transparent` 只能配 `png`/`webp` |
| `output_format` | `png / jpeg / webp / gif` | 本包用 `png` |
| `n` | 1–10 | 成本线性 |
| `input_references` | 0–16 张 | 本包纪律：≤3 张（1 母版 + 1 三视图 + 可选 1 灵魂帧） |
| `output_compression` | 仅 jpeg/webp | png 不用 |
| prompt 长度 | 3139 字符实测可发；context 400k | 建议 1200–3200 字符/条（现有条目最高 3139 实测可发），过长收益低 |
| 生成耗时 | 44–64 s（33 次实测）；`524` 为边缘超时 | 客户端超时建议 300 s |
| 透明底 | `transparent + png` 实测有 alpha（3 次） | **边缘一定不干净**：必须 alpha 阈值 + 去 fringe + 人工重绘 |
| 计费 | 成功才计费；失败/超时/403 不计费；`usage.cost` 权威 | 见 §9.5 |
| 未验证 | 16:9 实际像素、参考图最小尺寸阈值、payload 上限 | 不写死假设 |

### 9.2 不支持字段与策略（硬）

| 字段 | 状态 | 策略 |
|---|---|---|
| `seed` | **不存在** | 不发送、不记录假 seed；复现口径见 §9.6 |
| `size` / `resolution` | **不存在** | 不发送；固定 1:1/2:3/16:9，由后处理降采样 |
| `negative_prompt` | **不存在** | 不发送；负向写正文短句（§8.1），长清单转人工 checklist |
| `mask` / inpaint / 局部重绘 | **不存在** | 只能整图重生成或人工像素修；嘴/眼/眨眼差分**人工做** |
| system prompt / 多轮上下文 | 无 | 单次请求自带完整 DNA |

### 9.3 逐资产推荐参数

| 资产 | aspect_ratio | quality | background | n | refs | 说明 |
|---|---|---|---|---|---|---|
| 身份母版 normal | 2:3 | high（A/B 后再考虑 xhigh） | transparent | 3 | 首次 0；批准后 1 | 选稿后人工修 |
| 单视图 front/side/back/3-4 | 2:3 或 1:1 | high | transparent | 2 | 1 母版 | 每张一个视图 |
| 三视图 sheet（概念） | 3:2 | high | transparent | 2 | 1 母版 | 3 格 / 6 格均可，仅概念 |
| chibi 身份母版（128 final / 96；256 keyart 可选） | 1:1 | high | transparent | 3 | 首次 0；批准后 1 | 空手、鲸标完整 |
| 动作 sheet（每 tag 1 张） | 3:2（1536×1024，6×512 格） | high | transparent | 1–2 | 1 母版 + 1 三视图 | 每 tag 先 sheet |
| 单帧灵魂帧 | 1:1 | high | transparent | 1 | 1 母版 + 1 sheet | 只做接触/峰值帧 |
| 表情附件 sheet（eye/mouth） | 3:2 | high | transparent | 2 | 1 母版 | 6 格头肩裁切 |
| KeyArt 场景/加载 | 16:9 | high | **opaque** | 1–2 | 1 母版 | 1536×864；不要写透明底 |
| About/图标 | 1:1 | high | transparent/opaque | 2 | 1 母版 | 圆裁安全区 ≥40% |

> `xhigh`/`max` 只在母版最终候选 A/B 时试，**不默认**（成本 ≈1.78×/4×，无质量收益证据；`medium` 只省 13–19%，不为省钱降档）。

### 9.4 请求模板（不含任何真实 key；key 运行时从凭据文件读取，绝不回显/入库）

**A · 身份母版 / chibi 母版 / 单帧**
```json
{
  "model": "openai/gpt-image-2.6-sunburst",
  "prompt": "<IDENTITY-NORMAL|IDENTITY-CHIBI> + <本图句> + <收尾句>",
  "aspect_ratio": "1:1",
  "quality": "high",
  "background": "transparent",
  "output_format": "png",
  "n": 3,
  "input_references": []
}
```

**B · 带参考图（母版/三视图）**
```json
{
  "model": "openai/gpt-image-2.6-sunburst",
  "prompt": "<IDENTITY-CHIBI> + <本图句>",
  "aspect_ratio": "3:2",
  "quality": "high",
  "background": "transparent",
  "output_format": "png",
  "n": 2,
  "input_references": [
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,<已批准母版>"}},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,<已批准三视图>"}}
  ]
}
```

**C · 场景 / 加载（不透明）**
```json
{
  "model": "openai/gpt-image-2.6-sunburst",
  "prompt": "<IDENTITY-NORMAL> + <场景句 + 负空间/安全区句>",
  "aspect_ratio": "16:9",
  "quality": "high",
  "background": "opaque",
  "output_format": "png",
  "n": 1,
  "input_references": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,<已批准母版>"}}]
}
```

- 请求头：`Authorization: Bearer <运行时读取>`、`Content-Type: application/json`、`Accept: application/json`；**不加** `HTTP-Referer`/`X-Title`（会建公开 app page）。
- 响应：取 `data[].b64_json` + `usage.cost`；先校验尺寸/alpha 再落盘；文件用 `wx` 防覆盖。
- 落盘建议：`art/_gen/<char>/<YYYYMMDD-HHMMSS>/raw.png` + `.meta.json`（model/params/prompt_sha256/refs_sha256/cost/elapsed/size/has_alpha）；**AI raw、prompt、中间稿不进运行时包**。

### 9.5 预算 / 重试 / 停止条件

| 项 | 值（文档实测/估算，非本轮账单） |
|---|---|
| 1:1 high 单次 | ≈ **$0.0527–$0.055** |
| 2:3 high 单次 | ≈ **$0.0412–$0.043** |
| 参考图 | 每约 1 MP ≈ +$0.008–$0.01/张 |
| 3:2 六格 sheet | ≈ $0.0514–$0.0945/次调用（含 refs/n 浮动）→ 每格 ≈ $0.0069–$0.0132 |
| 单批上限 | **$1.00**（≈18 张 1:1 high） |
| 停止线 | `limit_remaining < $0.50` 停；单次实际 >$0.15 警告并复核 |
| 预检 | 每批前 `GET /api/v1/key`（免费）确认余额/到期，`limit_remaining ≥ 该批估算×1.5` |
| 重试 | 200 但尺寸/alpha 不对 → **不重试**；400/401/402/403/413 → **不重试同一请求**；429/5xx/524/网络 → 按 `Retry-After`，同一请求最多 1 次 |

### 9.6 种子（seed）与可复现口径

- 当前端点 **无 seed**：同一 prompt 重跑 ≠ 同一帧；**不可逐像素复现**。`seed` 字段记录为 `null (unsupported)`，不得编造。
- 一致性 = 冻结 DNA + 已批准母版/三视图参考 + 固定参数 + `prompt_sha256`/`refs_sha256` + 3 候选筛选 + 人工整数 px 对齐；**不靠抽卡/seed**。
- 每张记录：asset_id、model、endpoint、called_at、params、prompt_sha256、reference_shas[]、候选数、selected_sha256、cost_usd、human_edits[]、reviewer、license、ai_disclosure。
- 若未来换到支持 seed 的端点/模型：**先做 A/B 证明 seed 对同帧有效**，再按组（表情/三视图/动作 sheet）锁同 seed + 同 refs + 同参数，并把 `seed`/`seed_source` 写入台账；仍然需要人工门禁，不因此承诺可复现。
- 当前一致性优先级：**冻结 token > 参考图 > 固定参数 > 候选筛选 > 人工对齐**；`prompt hash + refs sha` 是可审计的「版本链」，不是复现保证。

### 9.7 本轮安全边界（实测）

- 本轮 **0 次图像 API 调用、0 次联网**；仅本地只读量测 + `--check`。
- 「npm 查询必须用 registry.npmjs.org」：本任务不需要 npm 查询；若未来生成脚本要装依赖，npm registry 显式 `https://registry.npmjs.org`（本机 npmmirror 缓存滞后，参考 lead 口径）。
- key 只从凭据文件读取；不打印、不写文件、不进 prompt/日志/报告；不 commit。

## 10. 生成策略与批次（Production Plan）

### 10.1 硬顺序（不可跳）

1. **冻结画布/几何/调色板/契约**（§3/§4；对应 manifest 与测试不改）。
2. **身份母版 normal + chibi**（各 2–3 候选；批准前不批量）。
3. **三视图**（front/side/back/3-4；批准后作为唯一 refs）。
4. **每 tag/每 clip 一张多姿态 sheet**（锁比例/服装/锚点）。
5. **单帧灵魂帧**（接触/压缩/回弹/峰值；AI 只做这些）。
6. **人工像素重绘**（整数网格、palette snap、1 px 轮廓、FX 后绘、道具策略）。
7. **机器 gate + 人工 2× 终审**（§11）。
8. **入包/接线**（同路径替换 + manifest 元数据 + 测试 + contact sheet）。

### 10.2 AI 输出 → 目标画布的换算（只用整数）

| 目标 | 来源 | 换算 | 注意 |
|---|---|---|---|
| 128 final | 1024² 概念（角色满幅/居中） | 1024 ÷ 128 = **8×** 整数块降采样 | 角色必须在中央 1024 内完整；trim 会破坏 bbox |
| 256 keyart | 1024² 概念 | 1024 ÷ 256 = **4×** | 或 3:2 六格 512 格 → 256 = **2×**（更稳）；仅 keyart 参考，不做 final 运行时 |
| 256（sheet） | 1536×1024 六格 | 512 格 → 256 = **2×** | 每格独立、无跨格 |
| 96 | 1024² 概念 | 先裁中央 **960²**（角色高 ≤93.75%）→ 10×；否则人工重绘 | 1024÷96 = 10.67 非整数，**禁止非整数缩放** |
| 96（备选） | 母版三视图 | 人工按 96 骨架重画 | 96 不能由 128 非整数缩小 |
| 128/256/96 互转 | — | **禁止** | 三套独立画布；256 不能由 96 放大，96 不能由 128 缩小 |

### 10.3 批次与预算（按 256 策略文档估算，非账单）

| 批次 | 内容 | API 调用（估） | 预算（估） | 门禁 |
|---|---|---|---|---|
| B0 | 身份母版 normal + chibi（各 2–3 候选） | 2–4 | ≤$0.30 | 人工 2× + §11.3 |
| B1 | 三视图 + 12 表情面板（normal） | 6–10 | ≤$0.35 | 7 锚点 + 高度/基线 |
| B2 | 7-tag 36 帧的 7 张 sheet（128 final） | 7–14 | ≤$0.60 | sheet 一致性 + §11.2 |
| B3 | 96 的 12 clips 关键帧 sheet | 6–12 | ≤$0.60 | 12 clip 契约 + 动作审计 |
| B4 | KeyArt 场景/加载/图标 | 4–8 | ≤$0.40 | 安全区/负空间/无字 |
| **单批硬上限** | — | — | **$1.00/批** | 停止线见 §9.5 |

> 256 的 Q+UI 全量估算（`GENERATION-STRATEGY-256`）：首轮 ≈$0.27、全量 ≈$0.63、硬上限 $1.20；**该数字为历史估算——256 已拍板仅 keyart（D2），不再排 final 化，仅供 keyart 预算参考。** 128 final 只做 P0（身份/三视图/7-tag 关键帧）再评估是否继续。

### 10.4 明确不要生成

- 不要请求「exactly 96×96 / 128×128 / 256×256 sprite」——模型只有 1024/1536 输出，写了会诱发假像素网格。
- 不要把 7-tag 的 talk/drag/land 塞进 12-clip 包，也不要把 12-clip 的 walk/attack 塞进 7-tag 契约。
- 不要逐帧独立生成（无 seed 必漂）；不要用 AI sheet 直接切片当 pack；不要用 AI 图冒充 final/手工。
- 不要生成猫/狗（各自 prompt pack）；不要生成 UI 文案/可读文字；不要生成官方 IP/真人/恋爱化内容。
- 不要在透明度/alpha 上依赖模型：生成后必须阈值化 + 去 fringe + 人工重绘。

## 11. 验收标准（Acceptance）

### 11.1 通用门（三套像素轨道 + KeyArt）

| # | 检查 | 阈值 | 工具/方式 |
|---|---|---|---|
| 1 | 画布/尺寸 | 精确等于目标（96/128/256/1024 等） | 自动 |
| 2 | alpha | hard 0/255；四角=0；透明 RGB=0（256） | 自动 |
| 3 | 可见色数 | 96 ≤20；**128 final ≤32（注册板 24）/ 硬门 40**；256 keyart ≤22 实测；全部 ∈ 声明色板；禁 `#000/#FFF` | 自动 + `validate_art.py` + `check_specs.py` |
| 4 | 轮廓 | 96/128：1 px 闭合 `#0B1220`；256：2 px；边界 ≥100 px；无断线/双线 | 自动 + 2× 目检 |
| 5 | 内部线 | 96：内部 outline 色像素=0；128 final/256 keyart：内部结构线只用浅色 | 自动 |
| 6 | 洞 | 无封闭透明洞（从边缘 flood fill 不达的透明区=0） | 自动 |
| 7 | 地线/锚点 | 96 最低行 y=89；128 脚底 128；256 `bottom_y=255`；关键件 y 漂 ≤1 px | 自动 + 叠图 |
| 8 | 帧数/唯一性 | 契约帧数；逐帧哈希唯一；不贴边（边距 ≥1） | 自动 |
| 9 | loop/帧差 | loop 首尾 ≤0.1%；同 tag 相邻帧差 0.5%–15% | 自动 |
| 10 | 7 锚点 | 7/7（背视被遮挡可豁免个别） | 人工 2× |
| 11 | 剪影 | 纯黑 5 秒读出 3 特征；同 tag 与灵魂帧 IoU ≥0.85–0.90 | 人工 + 自动 |
| 12 | 2× 可读 | 每 art px = 2×2 单色；深/浅底各测 | 截图 + 人工 |
| 13 | KeyArt | 6.0–6.3 头身；人物 90–94%；留白 ≥24 px；ΔE00 ≤5；accent ≤3% | 量测 + 人工 |

### 11.2 逐轨道机器门与命令

**T-D 96（当前发布路径）**
```bash
cd <private-path>
python3 scripts/gen-human-anim.py --check          # 生成器=盘上资产（本轮实测 PASS）
node --import tsx --test tests/pet-anim-human.test.ts
node --import tsx --test tests/pet-anim.test.ts
npx tsc --noEmit
```
- 额外断言：`ground row y=89`、`<=20 colours`、`68 unique`、`internal outline-colour px=0`、`enclosed transparent px=0`、`FX px` 不覆盖/不触碰身体、`--check` 逐字节一致。

**T-C 256（keyart/参考；不再排 final 化）**
```bash
cd <private-path>
node --import tsx --test tests/tinglan-256-pack.test.ts
node --import tsx --test tests/pet-anim.test.ts
# 资产侧：manifest placeholder/final、49 assets、256 canvas、anchor/footBox、packBase
```
- 资产 gate 口径见 §4.4（`gate_256.py` 17 项/帧 + 11 角色槽）；当前 49/49 机检，但仍需人工 2× 终审 + palette 注册才可 final。

**T-B 128（final 主画布）**
- 机器：canvas 128/anchor `(64,128)`/bbox/footBox；7 tags/36 + 13 附件；≤40 色（目标 ≤32、注册板 24）；1 px 轮廓；hard alpha；loop/帧差；`validate_art.py --max-colors 41`。
- 契约/调色板：`python3 scripts/check_specs.py --specs art/specs`（`pet.tinglan.pixel.json`，`palette: orca-pixel@0.2`）+ `node --import tsx scripts/validate-character.mjs public/characters/tinglan --json --strict`（当前无 pack，palette 成员校验待资产接线后生效）。
- 人工：7 锚点 + 2.4–2.6 头身 + 三视图同高 ±1 px + 表情只动脸。

**T-A KeyArt**
- 机器：尺寸/透明底/无 alpha 白边/关键色/无文字（可用 OCR 抽查）。
- 人工：6.0–6.3 头身、7 锚点、ΔE00 ≤5、accent ≤3%、安全区/负空间、无性化/官方元素/AI 未披露。

### 11.3 美术门（逐项）

1. **身份**：7 锚点全在；鲸鱼几何与发夹/领夹同源（同轮廓/同缺口，仅缩放）；眼镜 always-on；尾后腰锚点/裙后开衩。
2. **比例**：normal 6.0–6.3；chibi 2.4–2.6；头/身/腿预算符合 §4.2–§4.4。
3. **剪影**：5 秒黑块测试；1×/2×/深底/浅底都可读；发夹是唯一蓝块。
4. **表情**：9 表情全集不新增；同一头肩构图；只动眼/眉/嘴/头倾；高光规则；无 blush（例外：96 pat 占位）。
5. **动作**：contact sheet 逐 clip 可读；loop 闭合；同侧肢体/道具不重复；FX 不碰身体；attack 非均匀节奏正确。
6. **风格**：2–3 阶硬边、无 AA/渐变/dither/半透明/3D/写实；内部线浅色；描边颜色/宽度正确。
7. **颜色**：关键 token ΔE00 ≤5；accent ≤3%；无纯黑/纯白大面；色数达标。

### 11.4 当前实测状态（2026-11-20，本轮只读证据）

| 对象 | 结果 | 证据 |
|---|---|---|
| 96 动画包 | `--check` PASS：68 帧 / 68 唯一 / max 19 色 / ground y=89 / blink 差 4 px ≤20 | 本轮命令输出 |
| 96 动画包（量测） | 68 PNG；可见色并集 20；单帧 ≤19；hard alpha；maxY=89 全帧；边距 L22/T12/R23/B6 | PIL 量测 |
| 256 包（量测） | 49 PNG；22 色并集；hard alpha；maxY=255 全帧；边距 L63/T20/R65/B0；manifest `placeholder:true, final:false` | PIL + manifest |
| 256 gate | 49/49（含 2026-11-17 珍珠修复）；7/7 附件；back-final 过 | `TINGLAN-256-ANCHOR-FINAL-2026-11-17.md` §3/§8 |
| 96 测试/tsc | 文档记录 6 pass/0 fail（human）+ 16 pass/0 fail（anim）+ tsc 0 error（2026-11-18） | HUMAN-TINGLAN §6/§10.3 |
| 全量测试（task-150 复跑） | 改动前 1946 pass / 0 fail；改动后 Tinglan 相关 8 文件 **71 pass / 0 fail**；全量 7 个失败均为并行 cat-ragdoll 任务在途改动（**非本包**） | [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md) §5.3 |
| 调色板注册（task-150） | **`orca-pixel@0.2` 已注册**：`art/_style/palettes/orca-pixel.hex` 24 色 + `art/specs/pet.tinglan.pixel.json`；`check_specs.py` 8 specs ok；96/256 占位/草案 id 仍未注册 | `check_specs.py` + `validate-character.mjs` 解析 |
| final 状态 | **0 个汀岚 final**；96/256 均 placeholder/concept；128 只有规格+注册板（0 PNG）；**final 主画布 = 128（D1）** | manifest + `art/_style/palettes/` 实测 |

### 11.5 人工签收模板

```text
asset_id: T-? / <track>/<name>
canvas: 96/128/256/1024x1536
model: openai/gpt-image-2.6-sunburst
prompt_sha256: <hash>
refs_sha256: []
candidates: <n>
selected_sha256: <hash>
human_edits: [<face/hand/tail/outline/palette/...>]
gates: canvas=ok alpha=ok colors=ok outline=ok holes=ok ground=ok anchors=7/7 loop=ok
ai_disclosure: <visible label + PNG metadata>
license: CC-BY-NC-SA-4.0 DRAFT / placeholder-only
reviewer: <name>  date: 2026-??-??  final: true/false
```

### 11.6 什么才算 final

必须同时满足：① 机器 gate 全过；② 人工 2× 终审签字；③ palette 注册（128 final 已满足 `orca-pixel@0.2`；96/256 未注册）；④ provenance/AI 标识/LICENSE 更新；⑤ 资产路径/manifest 更新且测试全绿；⑥ 法务/许可复核。**缺一不可**；当前**没有任何资产满足**。256 为 keyart 轨（D2），不适用 final 条件。

## 12. 未决事项 / 变更记录 / 引用

### 12.1 未决（阻塞 final，需 lead/用户拍板）

1. ~~画布主次~~ **已决（2026-11-20）**：**final 主画布 = 128**；256 仅 keyart；96 为兼容/占位。见 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)。
2. ~~调色板注册~~ **已决（2026-11-20，部分）**：`orca-pixel@0.2` 已注册（24 色 `.hex` + `art/specs/pet.tinglan.pixel.json`）；`@0.2-draft`（256 keyart）与 `human-anim-placeholder@0.2-tinglan`（96）仍未注册，`art/_style/palettes/palettes.json` 统一注册表仍未建（工程项）。
3. ~~96 final 策略~~ **已决（2026-11-20）**：96 **保留 bow 简化**、不升 final；12-clip 契约**不扩** talk/sleep。
4. **256 keyart 边界（已决）**：256 不再 final 化（D2）；若未来重启，需新拍板 + palette 注册 + 资产重做。历史 final 化事项（back 尾根/7 附件 body-aligned/镜环/鲸形/珍珠）仅作 keyart 参考记录。
5. **AI 参与度**：final 是否允许 AI 概念参与（当前流程只允许 AI 概念 + 人工重绘）；供应商条款/商用/商标复核。
6. **模型变更**：若换模型/端点（尤其出现 seed），先按 §9.6 做 A/B，再更新本包参数与成本。

### 12.2 变更记录

- **2026-11-20**：创建本包。基于 CANON/OC/PROMPTS/RUNTIME-MAP + prompt-library（runtime/keyart/pixel-pipeline/model-fit）+ 当前 96/256 资产实测 + HUMAN-TINGLAN/PET-ANIMATION/CHARACTER-INTERACTIONS；只写本文件，未生成图/未调 API/未改资产/未 commit。
- **2026-11-20（task-150 拍板落地）**：按 lead 转达的已批准决策更新：**final 主画布 128 / 256 仅 keyart / 96 保留 bow 简化 / `orca-pixel@0.2` 注册**（24 色 `.hex` + `art/specs/pet.tinglan.pixel.json`）；同步 PALETTE-LOCK 与 CHARACTER-PROMPT-SYSTEM，新增 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)。未改 `public/` 资产/代码/manifest/测试，未调 API，未 commit。

### 12.3 引用（按读取顺序）

- **拍板记录**：[`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)（2026-11-20 task-150：128 final / 256 keyart / 96 bow / orca-pixel@0.2 注册；证据与未做事项）。
- 跨角色上游（并行落库）：[`PALETTE-LOCK-2026-11-20.md`](PALETTE-LOCK-2026-11-20.md)（§3.1 96 A / §3.2 128 final B1+注册板 / 256 keyart B2 / §3.4 裁定 / §8 gate / §12 拍板落地）、[`CHARACTER-PROMPT-SYSTEM-2026-11-20.md`](CHARACTER-PROMPT-SYSTEM-2026-11-20.md)（§2 八段式 / §3 STYLE BLOCK / §7 AVOID / §8 模型事实 / §9 gate）。

- 身份/裁决：[`../CANON-SETTING-BOOK-2026-11-16.md`](../CANON-SETTING-BOOK-2026-11-16.md)、[`../oc/tinglan/OC.md`](../oc/tinglan/OC.md)、[`../oc/tinglan/PROMPTS.md`](../oc/tinglan/PROMPTS.md)、[`../oc/tinglan/RUNTIME-MAP.md`](../oc/tinglan/RUNTIME-MAP.md)、[`../oc/README.md`](../oc/README.md)。
- 视觉/钥匙：[`../ART-TINGLAN-KEYART-2026-11-16.md`](../ART-TINGLAN-KEYART-2026-11-16.md)、[`../ART-TINGLAN-RUNTIME-2026-11-16.md`](../ART-TINGLAN-RUNTIME-2026-11-16.md)、[`../PIXEL-STYLE-SPEC-2026-11-16.md`](../PIXEL-STYLE-SPEC-2026-11-16.md)、[`../ANIME-TO-PIXEL-TRANSLATION-2026-11-16.md`](../ANIME-TO-PIXEL-TRANSLATION-2026-11-16.md)。
- 提示词工程：[`../prompt-library/PROMPTS-TINGLAN-RUNTIME-2026-11-16.md`](../prompt-library/PROMPTS-TINGLAN-RUNTIME-2026-11-16.md)、[`../prompt-library/PROMPTS-TINGLAN-KEYART-2026-11-16.md`](../prompt-library/PROMPTS-TINGLAN-KEYART-2026-11-16.md)、[`../prompt-library/PIXEL-PIPELINE-2026-11-16.md`](../prompt-library/PIXEL-PIPELINE-2026-11-16.md)、[`../prompt-library/REVIEW-MODEL-FIT-2026-11-16.md`](../prompt-library/REVIEW-MODEL-FIT-2026-11-16.md)、[`../prompt-library/COST-QUALITY-STRATEGY-2026-11-16.md`](../prompt-library/COST-QUALITY-STRATEGY-2026-11-16.md)。
- 256：[`../GENERATION-STRATEGY-256-2026-11-17.md`](../GENERATION-STRATEGY-256-2026-11-17.md)、[`../ANIMATION-AI-SPLIT-256-2026-11-17.md`](../ANIMATION-AI-SPLIT-256-2026-11-17.md)、[`../TINGLAN-256-ANCHOR-FINAL-2026-11-17.md`](../TINGLAN-256-ANCHOR-FINAL-2026-11-17.md)、[`../TINGLAN-256-INTEGRATION-2026-11-17.md`](../TINGLAN-256-INTEGRATION-2026-11-17.md)。
- 运行时/行为：[`../../design/HUMAN-TINGLAN-2026-11-18.md`](../../design/HUMAN-TINGLAN-2026-11-18.md)、[`../../design/PET-ANIMATION-2026-11-18.md`](../../design/PET-ANIMATION-2026-11-18.md)、[`../../design/CHARACTER-INTERACTIONS-2026-11-20.md`](../../design/CHARACTER-INTERACTIONS-2026-11-20.md)、[`../../TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md`](../../TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md)、[`../../TINGLAN-ROLEPLAY-VALUES-2026-11-16.md`](../../TINGLAN-ROLEPLAY-VALUES-2026-11-16.md)。
- 资产/代码实测：`public/assets/pet/anim/human/**`、`public/assets/pet/tinglan-256/**`、`public/characters/pet-tinglan-anim/character.json`、`public/characters/tinglan-256/character.json`、`src/pet/anim/interactions/human.json`、`src/pet/hero-runtime.ts`、`scripts/human_tinglan.py`、`scripts/gen-human-anim.py`、`tests/pet-anim-human.test.ts`、`tests/pet-anim.test.ts`、`tests/tinglan-256-pack.test.ts`、`art/_style/palettes/`。
- 插件（语气/接线参考）：[`../../../../plugins/dsh-famling/index.js`](../../../../plugins/dsh-famling/index.js)、[`../../../../plugins/dsh-famling/README.md`](../../../../plugins/dsh-famling/README.md)。

### 12.4 自检

- [x] 2026-11-20 task-150 只改文档与注册（本文件 + PALETTE-LOCK + CHARACTER-PROMPT-SYSTEM + 决策文件 + `art/_style/palettes/orca-pixel.hex` + `art/specs/pet.tinglan.pixel.json`）；未生成图、未调 API、未改 `public/` 资产/代码/manifest/测试、未 commit/push。
- [x] 已按 2026-11-20 拍板更新：final 主画布 128 / 256 keyart / 96 保留 bow / `orca-pixel@0.2` 注册；矛盾口径以 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md) 为准。
- [x] 覆盖任务要求：角色锁定、调色板、像素规格、正面/侧面/表情/动作、负面词、种子/模型参数、验收标准。
- [x] 区分 PROMPT-TEXT（送模）与 SPEC-CONTRACT（验收），未把画布/1px/alpha/色数/seed 断言写进送模文本。
- [x] 记录两套运行时契约（7-tag vs 12-clip）与 96 简化口径，避免未来 Agent 混用。
- [x] 所有「通过」均有本轮命令/量测或明确文档出处；未编造 seed/API 结果/真机/外网。
- [x] 与并行落库的 PALETTE-LOCK / CHARACTER-PROMPT-SYSTEM 对齐：调色板数值与 96/256 实测一致；STYLE/AVOID 以系统文档为上游；两套帧契约已显式区分。




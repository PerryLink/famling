# 三角色调色板锁定 · PALETTE-LOCK（汀岚 / 猫 / 狗）· 2026-11-20

> **性质**：本文是三角色（Tinglan / 猫 / 狗）调色板的**文字注册表与裁定书**；不是最终美术批准。
> **2026-11-20 追加（task-150 拍板落地）**：汀岚 **final 主画布 = 128**、**256 仅 keyart**、**96 保留 bow 简化**；`orca-pixel@0.2` 已注册（`art/_style/palettes/orca-pixel.hex` + `art/specs/pet.tinglan.pixel.json`）。本轮只动文档 + 注册文件，**未改资产**；明细见 §12 与 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)。
> **范围**：`public/assets/pet/anim/{human,cat,dog}/**`（96×96 运行包）、`public/assets/pet/tinglan-256/**`（汀岚 256 概念 keyart 包）、`docs/art/oc/*/OC.md` 的 canon token、`docs/art/PIXEL-STYLE-SPEC-2026-11-16.md` 的风格契约。**不含** legacy 占位包（`cat-placeholder` / `dog-placeholder` / `pearl-placeholder` / `humanoid-default`）、Pearl 线、UI/Aquarium/Stall/Town 色板。
> **服务对象**：`docs/art/prompts/TINGLAN-PROMPT-PACK-2026-11-20.md`、`docs/art/prompts/CAT-RAGDOLL-PROMPT-PACK-2026-11-20.md`、`docs/art/prompts/DOG-PROMPT-PACK-2026-11-20.md` 三份提示词包。三份 pack **以本文件为 hex 权威**；可在 pack 内展开已登记 role 的几何/像素细节，但不得引入未登记 hex；跨角色 prompt 组装规则见配套的 `CHARACTER-PROMPT-SYSTEM-2026-11-20.md`。
> **基线**：desktop-games `HEAD 47438ac`（2026-11-20 本机 WSL/Linux 实测）。所有 PNG 颜色为**逐像素实测**，不是从文档抄写；生成器 `--check` 已同时通过（见 §8）。
> **非官方**：汀岚、猫、狗均为 PerryLink 原创虚构角色；与 DeepSeek 无关联/合作/授权/背书。

## 0. 一页纸（先看这张表）

| # | 锁定项 | 值 |
|---|---|---|
| L1 | 外轮廓 | 全三角色 **1 px 闭合 `#0B1220`**（96 包）；边界不透明像素除 FX 外必须全是它 |
| L2 | 内部线 | 96 包**不用** `#0B1220` 画内部结构；用各角色 role 色分隔（实测三包 `#1B1612` = **0 px**，`#000000`/`#FFFFFF` = **0 px**） |
| L3 | 阴影 | 固定**左上硬光**；每材质 **2–3 阶硬边纯色**；禁 dither/渐变/柔光/AA/半透明/外发光/地面投影 |
| L4 | alpha | 二值 alpha（0/255）；四角透明；96 包地线 `y=89` 全帧一致 |
| L5 | 色数 | 硬门 ≤40；**96 动画包实测并锁：狗 ≤16 色/帧、猫 ≤16、汀岚 ≤19**（中央测试另锁 ≤20/帧）；汀岚 canon 目标 ≤32 |
| L6 | 汀岚 96 | `human-anim-placeholder@0.2-tinglan`，19 role + outline = **20 色**；accent `#3964FE` 实测 1.18%（≤3%） |
| L7 | 猫 96 | `cat-ragdoll-anim@0.1`，**16 role 恰好 16 色**；灰/白/奶油 + 蓝眼 `#5B93E0`，全包无橙/棕/粉毛 |
| L8 | 狗 96 | `dog-anim-placeholder@0.1`，18 role / **17 唯一色**（`eye_hi` 与 `fx` 同为 `#F4F9FF`）；哑光砖红项圈三带为现行 asset 事实 |
| L9 | 128 / 256 目标 | 汀岚：**128 final 主画布 = 已注册 `orca-pixel@0.2`（24 色，§3.2 B3）**；**256 仅 keyart**（concept 用 `@0.2-draft` 32 槽，实测 22 色，未注册、非 final）。猫/狗 = OC 提案 C token 表（整包切换才可用，禁止半套混用） |
| L10 | 「同色」判据 | 同一 role 的两色 **ΔE00 ≤ 5** 视为同色；> 5 必须显式选 profile A（运行色）或 B（设计 token），并整包切换 + palette id 升版 |
| L11 | 禁用色 | 纯黑 `#000000`、纯白 `#FFFFFF`；旧姜黄虎斑/绿眼/红项圈金铃猫、旧金棕眼斑狗、旧布偶棕面罩 palette 均不得作为新生成参考 |
| L12 | 换色流程 | 换色 = **新 palette id + 整包重生成 + 三份 pack 同步 + 门禁重跑**；prompt 里临时加 hex = 违规 |

## 1. 真源、优先级与「同色」判据

### 1.1 真源分层（高 → 低）

1. **运行实现真值（A profile）**：盘上 PNG 的逐像素颜色 + 生成器内联 palette 常量 + manifest `palette` 字段。当前可玩的 96 包以这一层为准。
2. **角色 canon / 设计 token（B profile）**：`docs/art/CANON-SETTING-BOOK-2026-11-16.md` §1.5（汀岚）、`docs/art/oc/tinglan/OC.md` §13.4、`docs/art/oc/cat/OC.md` §2、`docs/art/oc/dog/OC.md` §2。用于 128 final / 256 keyart 与 final 美术目标。
3. **风格契约**：`docs/art/PIXEL-STYLE-SPEC-2026-11-16.md`（Cel-Chunk：1 px 外轮廓、≤40 色、2–3 阶硬阴影、禁 AA/渐变/纯黑白等）。风格规则对所有 profile 强制。
4. **机器 token**：`art/_style/style.yaml`（`look.light: top-left-hard`、`shades: 3`、`aa: false`、`forbid: pure-black/pure-white`、`hero.outline.primary: #0b1220`、`hero.paletteMaxPerCharacter: 40`）。
5. **管线/门禁**：`docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md`（无 seed/无 negative/无 size；AI 只出概念稿）与 `tests/pet-anim*.test.ts` 的像素门。

### 1.2 冲突裁定规则（本文件的核心作用）

- **R1 同资产单一 profile**：同一资产（一套 96 pack、一张 keyart、一帧图）只能选 A 或 B 之一；A/B 混用在像素级必然颜色不一致，prompt pack 必须显式声明 profile。
- **R2 96 用 A**：96 运行包（`public/assets/pet/anim/**`）已上线并被交互/测试消费，改为 B 等于整包重做 → 除非 owner 拍板，否则 96 的 prompt 以 A 为锁定。
- **R3 128 final / 256 keyart 用 B**：128 final 用 canon token（已注册 `orca-pixel@0.2`）；256 keyart 用 `orca-pixel@0.2-draft`（未注册，非 final）；**禁止把 96 的 A 色直接放大当 128/256 的调色目标**。
- **R4 换色 = 新版本**：颜色表任何变更 = 新 palette id + 新资产版本；不得只改 prompt 或只改单帧。
- **R5 风格优先于色号**：即使 hex 命中 palette，违反 1 px 轮廓/2–3 阶/硬 alpha/无 AA 规则仍拒收。
- **R6 文档矛盾以本文件 §6 登记册为准**；本文件不修改任何旧文档，只在登记册记录「旧值 → 锁定值」。
- **R7 legacy 不作参考**：旧占位包/旧分支调色板（§7）不得进 prompt 参考池，也不得作为「同色」依据。

### 1.3 「同色 / ΔE00 ≤ 5」的用法

- 风格契约 `PIXEL-STYLE-SPEC-2026-11-16.md` §5.2 第 5 项要求「调色 board 对 canon token **ΔE00 ≤ 5**」；本文把它复用为**角色内 A/B 同色判据**。
- 判定对象 = **同一 role 的两套 hex**（例如 dog 的 `body`：A `#D9A251` vs B `#E0A94F`），不是整张图的平均色。
- 本文所有 ΔE00 为本机用 CIEDE2000 计算（D65/2°，sRGB→Lab）。结果在 §3.3 / §4.2 / §5.2；脚本口径见 §8.2。

## 2. 跨角色通用 token（三份 pack 必须共用）

### 2.1 通用硬 token 表

| role | hex | 用法 | 来源 |
|---|---|---|---|
| 外轮廓 | `#0B1220` | 全角色 1 px 闭合外轮廓；96 包内**唯一**允许的轮廓色 | 风格契约 §4.2；三包实测 |
| 内侧暗线（可选，仅 128+） | `#1B1612` | 只在大形内侧做 1 px 视觉厚度；96 包实测 **0 px**，prompt 不得对 96 写这条 | 风格契约 §4.2 / CANON §1.5；实测 |
| 眼高光 / FX 白 | `#F4F9FF` | 每睁眼 1 px 硬高光（96 上限 1–2 px）；FX 亮芯；= 通用近白 | 风格契约 §4.5；三包实测 |
| 冷缘 / 粒子 | `#99C8FF` | 汀岚 96 为 **FX 色**（星光/运动线，0.08%）；风格契约的「冷缘」在 96 不单独描边 | 风格契约 §4.2/§4.4；human 实测 |
| DSH 蓝 accent | `#3964FE` | 汀岚专用：蓝夹/领夹/边条；≤3% 可见像素（实测 1.18%） | CANON §1.5 / OC §13.4；实测 |
| 禁纯黑 | `#000000` | 三包实测 0 px；最暗用 `#0B1220`/`#171310`/`#0F0F14` | 风格契约 §4.3；实测 |
| 禁纯白 | `#FFFFFF` | 三包实测 0 px；白名单只到 `#F4F9FF`/`#F2F2F2`/`#E8E0E0` | 风格契约 §4.3；实测 |

### 2.2 通用硬规则（所有 prompt 的 STYLE + 验收都带）

1. **光**：固定左上 45°；全帧一致；禁第二光源、禁地面投影。
2. **阴影**：每材质 2–3 阶硬边纯色；禁 dither、渐变、柔光、blur、AA、半透明、外发光。
3. **轮廓**：96 包 1 px 闭合；大形内侧另加 1 px 暗线仅限 128+；禁 2 px 外描边、断线、双线、彩色描边。
4. **alpha/底**：真透明背景、二值 alpha、四角透明；无地面阴影、无场景、无文字/Logo/水印/UI/签名。
5. **构图**：单角色、全身、居中、脚踩基线（96 包地线 y=89）；正交/平视；禁止写具体像素尺寸（模型无 size 参数）。
6. **色板**：只用本文件登记的 role hex；post-process 必须吸附回登记表；新增色 = 违规。
7. **AI 性质**：所有生成物标注「AI 概念稿，未人工重绘，不是 final」；不得声称手绘/官方。

### 2.3 96 与 128 final / 256 keyart 的差别（最容易写错 prompt 的地方）

| 项 | 96 运行包（A） | 128 final / 256 keyart（B） |
|---|---|---|
| 外轮廓 | **1 px** `#0B1220` | 128 final 1 px；**256 keyart 概念包实测为 2 px** `#0B1220`（见 §3.2） |
| 内侧暗线 `#1B1612` | **不用**（实测 0 px） | 128 final 可按风格契约用在大形；256 keyart 同样可用 |
| 虹膜外环 `#1E3F8F` | 汀岚 96 **没有**（预算不够，实测 0 px） | 汀岚 128 final / 256 keyart 用（256 实测 0.37%） |
| 瞳孔/深眼 | 猫用 `#1E2C44`；狗用 `#5B3A1C` 单色 | 可用外层深环（猫 OC 提案 `#2F5F9E`，与运行 `#1E2C44` 差 ΔE00 19.49，整包切换才可用） |
| 色数 | 狗 ≤16/帧、猫 ≤16/帧、汀岚 ≤19/帧（锁 ≤20 硬门） | 汀岚 128 final 目标 ≤32、硬门 ≤40（注册板 24 色）；256 keyart 实测 ≤22/帧 |
| 尾白 / 白衬衫 | `#E8E0E0` / `#F2F2F2` + `#D7DBE2` 影 | 同 token；128 final 用同 token；256 keyart 概念可加 `#F4F9FF` 高光 |

## 3. Tinglan（汀岚）调色板

### 3.1 A：96 运行调色板（`human-anim-placeholder@0.2-tinglan`，实测 20 色）

证据：`scripts/human_tinglan.py` `PALETTE`（L39–60）；`public/assets/pet/anim/human/manifest.json` `palette`；68 帧逐像素统计。

| role | hex | 用途 | 全包占比（实测） |
|---|---|---|---|
| outline | `#0B1220` | 唯一 1 px 外轮廓，不作内部线 | 16.79% |
| hair | `#1B1B22` | 黑 bob / 虎鲸尾上表面 | 28.87% |
| hair_hi | `#30303A` | 发顶高光 / 冷缘 | 0.35% |
| skin | `#F8D8C8` | 脸/颈/手 | 8.52% |
| skin_shade | `#E3B9A8` | 鼻/颈阴影 | 0.63% |
| suit | `#1E1E26` | 西装/裙（96 专用抬一档，见 §3.3） | 25.20% |
| suit_hi | `#34343E` | 袖/翻领/裙缝/内部结构线（**内部线只用浅色**） | 7.60% |
| shirt | `#F2F2F2` | 白衬衫 V/领口/袖口/纸页 | 1.92% |
| shirt_shade | `#D7DBE2` | 纸/书折痕/袖口影 | 0.22% |
| tie | `#0F0F14` | 领带/书封/嘴线 | 2.00% |
| glasses | `#C9CED6` | 细银框眼镜 / FX 冷色 | 1.90% |
| eye | `#356FFE` | 蓝虹膜 | 0.38% |
| eye_hi | `#F4F9FF` | 1 px 眼高光 / FX 亮芯 | 0.10% |
| accent | `#3964FE` | 蓝 bow / 领带夹 / 书签（96 的蓝鲸发夹简化） | **1.18%** |
| tights | `#8A6E6B` | 不透明暖灰黑丝 | 1.90% |
| tights_shade | `#6A5652` | 侧视远腿 | 0.46% |
| shoe | `#1A1A1E` | 黑色低粗跟 | 1.62% |
| tail_white | `#E8E0E0` | 虎鲸尾白腹（仅薄缘） | 0.26% |
| blush | `#E7A08F` | **仅 pat_head** 2 px 腮红；占位豁免，final 应删 | 0.03% |
| fx | `#99C8FF` | 星光/运动线/纸页/冲击线（后绘，不描黑） | 0.08% |

> 说明：`eye_hi` 与 `fx` 不同 hex；白衬衫/珍珠/尾腹 + 眼高光是白名单，`#FFFFFF` 出现 0 px。

### 3.2 B：128 final 主画布（已注册 `orca-pixel@0.2`）/ 256 keyart（`@0.2-draft` 未注册）

**B1 — canon token（`docs/art/CANON-SETTING-BOOK-2026-11-16.md` §1.5；`docs/art/oc/tinglan/OC.md` §13.4）**

| 用途 | canon token |
|---|---|
| 轮廓/内线 | `#0B1220` / `#1B1612` |
| 黑发 | `#1B1B22`（高光 `#30303A`） |
| 西装/裙 | `#191920`（缝线 `#2E2E38`） |
| 领带/鞋 | `#0F0F14` / `#1A1A1E` |
| 白衬衫 | `#F2F2F2`（阴影 `#D7DBE2`） |
| 皮肤 | `#F8D8C8`（阴影 `#E3B9A8`） |
| 黑丝 | `#8A6E6B`（阴影 `#6A5652`） |
| 眼镜银 | `#C9CED6` |
| 尾腹白 | `#E8E0E0` / `#C9C4C8` |
| DSH 蓝 | `#3964FE`（≤3%） |
| 冷缘/珠光 | `#99C8FF` / `#F4F9FF` |

**B2 — 256 概念包实际使用的 `orca-pixel@0.2-draft`（32 槽草案）**

证据：`public/assets/pet/tinglan-256/manifest.json` 的 `palette: orca-pixel@0.2-draft`；槽位定义在 `art/_placeholder/orca-tinglan-256-2026-11-17-v2/anchor-final/palette-orca-pixel-0.2.json`（32 槽）。49 帧实测只用到 **22 色**，未超 ≤40 硬门；**2 px** 轮廓、每睁眼 2×2 `#F4F9FF` 高光（`docs/art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md` §2）。草案状态 = `proposed`，**`@0.2-draft` 本身仍无注册**（`@0.2` 已另注册，见 B3），不是已上线 palette id。

| draft role | 槽位 hex（按 JSON） | 256 实测占比 |
|---|---|---|
| outline | `#0B1220` / `#1B1612` | `#0B1220` 10.16% |
| hair | `#14141A` / `#1B1B22` / `#30303A` | 3.51% / 15.29% / 2.01% |
| suit | `#101016` / `#191920` / `#2E2E3A` | 2.38% / 0.36% / 23.27% |
| tie | `#0F0F14` / `#1A1A1E` / `#5A5A66` | 18.50% / 2.47% / 0%（未用） |
| shirt | `#F2F2F2` / `#D7DBE2` / `#B9C2CF` | 0.33% / 0.05% / 0% |
| skin | `#F8D8C8` / `#E3B9A8` / `#C99789` | 5.99% / 3.21% / <0.01% |
| tights | `#8A6E6B` / `#6A5652` / `#4A3E3C` | 5.31% / 1.09% / 0% |
| blue | `#3964FE` | 1.47% |
| silver | `#C9CED6` / `#8F98A6` | 2.55% / 0% |
| white | `#F4F9FF` / `#F2F2F2` / `#E8E0E0` | 1.53% / 0.33% / 0.04% |
| iris | `#356FFE` / `#1E3F8F` / `#2A4C9A` | 0.12% / 0.37% / 0% |

> 判定（2026-11-20 更新）：**128 final 用 B1 作验收 token**（已注册板 `orca-pixel@0.2`，24 色，见 B3）；**256 keyart 用 B2 槽位**（`@0.2-draft` 仍是未注册草案，产物只作 keyart/concept）。draft 与 canon 的差异（`#14141A` vs `#1B1B22`、`#2E2E3A` vs `#2E2E38`、`#C99789`）**不得混入 128 final 板**。

**B3 — 2026-11-20 注册结果（task-150）**

| 项 | 值 |
|---|---|
| id | **`orca-pixel@0.2`**（与 128 `character.json` 已声明 id 对齐） |
| 注册板 | `art/_style/palettes/orca-pixel.hex`（24 色；顺序=优先级；无 `#000/#FFF`） |
| 注册 spec | `art/specs/pet.tinglan.pixel.json`（`palette` 精确匹配 id；`colors` 24 role 与 `.hex` 逐色相等；128×128 / 7 tags / 36 帧契约） |
| 色集 | outline `#0B1220`、inner `#1B1612`、hair `#1B1B22`/`#30303A`、suit `#191920`、seam `#2E2E38`、tie `#0F0F14`、shoe `#1A1A1E`、shirt `#F2F2F2`/`#D7DBE2`、skin `#F8D8C8`/`#E3B9A8`/`#C99789`、tights `#8A6E6B`/`#6A5652`、glasses `#C9CED6`/`#8F98A6`、iris `#356FFE`/`#1E3F8F`、eye_hi `#F4F9FF`、tail_white `#E8E0E0`/`#C9C4C8`、accent `#3964FE`、rim_fx `#99C8FF` |
| 解析效果 | `validate-character.mjs` 的 legacy-spec 解析现在命中该 id → 声明 `@0.2` 的 pack `palette.spec=true` 并逐色对照（注册前为 `spec=false`） |
| 仍未注册 | `orca-pixel@0.2-draft`（256 keyart）、`human-anim-placeholder@0.2-tinglan`（96 placeholder）、`art/_style/palettes/palettes.json` 统一注册表（`ART-CONTRACT-LOCK §3.1` 工程项） |

> 注意：注册板**不含** 96 专用 `#1E1E26`/`#34343E`/`#E7A08F`，也不含 256 concept 的 `#101016`/`#14141A`/`#2E2E3A` 等草案色。机制探针（临时 fixture）显示：把 256 concept 帧强行声明成 `@0.2` 会报 3 色越界（预期），这正说明 256 应留在 keyart/`@0.2-draft` 轨。

### 3.3 canon token vs 96 运行 token 的 ΔE00（同 role 对照）

| role | A（96 运行） | B（canon） | ΔE00 | 结论 |
|---|---|---|---:|---|
| outline | `#0B1220` | `#0B1220` | 0.00 | 同色 |
| hair | `#1B1B22` | `#1B1B22` | 0.00 | 同色 |
| hair_hi | `#30303A` | `#30303A` | 0.00 | 同色 |
| suit | `#1E1E26` | `#191920` | 1.68 | ≤5；96 有意抬一档，合法 |
| tie | `#0F0F14` | `#0F0F14` | 0.00 | 同色 |
| shoe | `#1A1A1E` | `#1A1A1E` | 0.00 | 同色 |
| shirt | `#F2F2F2` | `#F2F2F2` | 0.00 | 同色 |
| skin | `#F8D8C8` | `#F8D8C8` | 0.00 | 同色 |
| tights | `#8A6E6B` | `#8A6E6B` | 0.00 | 同色（旧文档变体见 §6） |
| glasses | `#C9CED6` | `#C9CED6` | 0.00 | 同色 |
| eye | `#356FFE` | `#356FFE` | 0.00 | 同色 |
| tail_white | `#E8E0E0` | `#E8E0E0` | 0.00 | 同色 |
| accent | `#3964FE` | `#3964FE` | 0.00 | 同色 |
| fx | `#99C8FF` | `#99C8FF` | 0.00 | 同色（但 96 作 FX，不作 1 px 冷缘） |
| suit（96 A vs 256 B2 槽） | `#1E1E26` | `#14141A`（B2） | 3.40 | ≤5；256 用 B2 槽位 |

> 结论：**汀岚是三角色中 A/B 一致性最高的角色**（除 96 suit 的 1.68 与 256 的 3.40 外全为 0）。因此汀岚 prompt 可以直接同时写「运行 20 色」与「canon token」，但必须声明 profile：96 → §3.1；128 final → §3.2 B1 + B3 注册板；256 keyart → §3.2 B2。

### 3.4 Tinglan 裁定与禁用

- **H1** 96 西装 `#1E1E26` 是**有意抬亮**（`docs/design/HUMAN-TINGLAN-2026-11-18.md` §2.2），与 canon `#191920` 差 ΔE00 1.68，不算漂移；128+ 必须回 `#191920`。
- **H2** 黑丝 token 在旧文档有 `#8A6E6B` / `#8B716E` / `#90786F` 三个变体；**锁定 `#8A6E6B` / `#6A5652`**（运行实测 + 已校准口径）。其余变体不得再进 prompt。
- **H3** `#1B1612` 在 96 包是 **0 px**：任何「96 图会有 1 px 内线 #1B1612」的 prompt/验收都是错的；只允许在 128+ 写。
- **H4** 虹膜外环 `#1E3F8F`：96 无；128 final / 256 keyart 用 B2 `iris` 槽（128 final 已并入注册板）。96 prompt 写 `#356FFE` 单色 + 1 px `#F4F9FF` 高光即可。
- **H5** 腮红 `#E7A08F`：96 仅 pat_head 2 px（占位豁免）；canon 明确「不写脸红」→ final/128+ 删掉，prompt 不写 blush。
- **H6** 白名单只到白衬衫/珍珠/尾腹薄缘/眼高光；`#FFFFFF` 与大面积白禁。
- **H7** 蓝鲸发夹/领夹在 96 被简化成蓝 bow + 2 px 领夹：**2026-11-20 拍板：96 保留 bow 简化**（96 不是 final 轨道，不强制重画鲸形）；**128 final / 256 keyart 必须换回「同一几何母版」的鲸形**（`docs/art/oc/tinglan/OC.md` §13.2），prompt 不得把 bow 当 128+ 的 canon。

### 3.5 Tinglan 的 prompt 用色句

- **96 短句（放正文，约 10 个 hex）**：`limited palette: outline #0B1220, hair #1B1B22/highlight #30303A, suit #1E1E26 with #34343E inner lines, white shirt #F2F2F2/#D7DBE2, skin #F8D8C8/#E3B9A8, tights #8A6E6B/#6A5652, silver #C9CED6, iris #356FFE, eye highlight #F4F9FF, DSH blue #3964FE at most 3%.`
- **128 final 短句**：把 `suit #1E1E26/#34343E` 换成 `#191920/#2E2E38`，加入 `iris ring #1E3F8F`、`tail white #E8E0E0/#C9C4C8`、`inner line #1B1612`（仅大形）。256 keyart 视觉参考同 B1 命名，但实际吸附槽位按 B2（未注册）。
- **完整 20 色表不写进 prompt**：prompt 只写 8–12 个关键 hex；完整表用于 post-process 的 palette snap 与验收（§3.1）。

## 4. 猫（当前：同配色布偶猫 Ragdoll）

### 4.1 A：96 运行调色板（`cat-ragdoll-anim@0.1`，恰好 16 色）

证据：`scripts/cat_selkirk.py` `CAT_COLORS`；`public/assets/pet/anim/cat/manifest.json`；72 帧逐像素统计（2026-11-20 task-155 重测）。

| role | hex | 用途 | 全包占比（实测） |
|---|---|---|---|
| outline | `#0B1220` | 唯一 1 px 外轮廓 | 10.96% |
| body | `#F1EEE7` | 白/米主体 | 41.10% |
| light | `#FDFCF7` | 白毛高光/耳内高光 | 7.35% |
| shade | `#D6D1C7` | 白毛阴影/远腿 | 7.62% |
| belly | `#ECE3D5` | 围脖/胸腹/爪尖奶油 | 11.47% |
| mask | `#8E9296` | 灰面罩/灰帽/耳/尾 | **13.25%** |
| mask_dark | `#6B7075` | 八字内缘/深灰细节 | 1.30% |
| ear | `#6F7479` | 灰尖耳/深灰尾尖 | 3.22% |
| ear_inner | `#C9C2B8` | 耳内米色 | 2.35% |
| eye | `#5B93E0` | 蓝眼（唯一冷色点缀） | 0.66% |
| eye_hi | `#F4F9FF` | 1 px 眼高光 / 星光 FX | 0.06% |
| pupil | `#1E2C44` | 深蓝瞳孔 | 0.12% |
| nose | `#C9B6AB` | 浅粉鼻 | 0.31% |
| pad | `#C4B1A7` | 肉垫/浅粉细节 | 0.05% |
| ball | `#7F8C99` | 灰蓝玩具球（仅 ball_throw/ball_chase） | 0.17% |
| ball_hi | `#D3DAE1` | 球高光 | 0.01% |

> 关键约束：**无橙/棕/粉毛**（`tests/pet-anim-cat.test.ts` 断言所有不透明色 ⊆ 这 16 色 + 暖色阈值）；`#E7A08F` 腮红**不在** cat palette（pat_head 的「奶油腮红」用 palette 内浅色实现）。

### 4.2 B：OC 布偶猫（Ragdoll）C-token 提案（`docs/art/oc/cat/OC.md` §2）

| 用途 | OC 提案 token | vs A 最近 role | ΔE00 | 结论 |
|---|---|---|---:|---|
| 白毛主体 | `#F2EFF2` | body `#F1EEE7` | 5.29 | **>5，换色需整包** |
| 白毛阴影 | `#D8D2DD` | shade `#D6D1C7` | 10.96 | **>5** |
| 冷阴影 | `#B9B4C4` | shade `#D6D1C7` | 14.86 | **>5** |
| 重点色 | `#8D9AA8`（深 `#6F7C8C`） | mask `#8E9296` / mask_dark `#6B7075` | 5.55 / 6.90 | 略超 5 |
| 围脖/腹部乳白 | `#F7EAD9` | belly `#ECE3D5` | 2.42 | ≤5，可映射 |
| 虹膜蓝 | `#4F86C6`（深 `#2F5F9E`） | eye `#5B93E0` / pupil `#1E2C44` | 5.10 / 19.49 | 眼本体略超；深环 >5 |
| 鼻/肉垫 | `#C98D8D` | nose `#C9B6AB` / pad `#C4B1A7` | 16.43 / 15.48 | **>5，粉调不同** |
| 眼高光 | `#F4F9FF` | eye_hi `#F4F9FF` | 0.00 | 同色 |
| 项圈（可选） | `#7A94B5` + `#C9CED6` | 运行无项圈 | — | 暂不启用 |
| 轮廓 | `#0B1220` | outline `#0B1220` | 0.00 | 同色 |

> 结论：OC 布偶猫 C 表与现行 16 色（布偶包）**不是同一块调色板**（body/shade/冷阴影/mask/eye/nose/pad 多处 ΔE00 > 5）。所以 task-146 的「**同配色**布偶猫」必须理解为：**保持 A 的 16 色**，只改品种/几何（卷毛 → 长毛、面罩画法、尾形），**不是**切到 OC C 表。

### 4.3 「同色布偶猫」迁移规则（task-146 专用，强制）

1. **palette 不变**：16 个 role hex 全部不动；palette id 已由 owner 拍板改为 `cat-ragdoll-anim@0.1`（只改名、hex 不动），task-149/task-155 已同步生成器 / manifest / character.json / 消费方测试 / 文档。
2. **16 色角色映射（布偶猫语义）**：body/light/shade/belly = 白/奶油长毛；mask/mask_dark = 蓝灰重点色面罩/耳/尾（**不得改回棕/橙**）；ear/ear_inner = 灰耳/浅内耳；eye/eye_hi/pupil = 蓝眼（布偶必须蓝眼）；nose/pad = 浅粉；ball/ball_hi = 道具球。
3. **几何换、色不换**：去掉 `curl_puff` 云朵卷毛 → 长毛剪影（颈部围脖 + 蓬松羽状尾）；面罩改为布偶「倒 V 白鼻梁」；这些只改像素形状/面积，不改 hex。
4. **A 表比例不变**：白/奶油类（body+light+shade+belly）合计 ≥60% 可见毛色；mask/ear 类合计约 20–23%（实测 mask 17.61 + ear 3.55 + mask_dark 1.26）；蓝眼 ≤1%。prompt 里写「white-dominant, grey-blue points only on mask/ears/tail」。
5. **不得混用 OC C 表**：`#F2EFF2`/`#D8D2DD`/`#B9B4C4`/`#8D9AA8`/`#4F86C6`/`#C98D8D` 等只出现在「B 方案：换 palette」文档中；同色方案里出现即判混板。

### 4.4 猫的禁用/历史色板

- **旧姜黄虎斑占位**（`scripts/gen-pet-anim-placeholder.py`）：`#D98A3F`/`#A55F22`/`#F6DBB4`/`#E79B93`/`#3F7D5A`/`#C0615F`/`#C1463F`/`#E0B35A` —— 全部禁用。
- **旧布偶首版渲染器**（`docs/design/CAT-RAGDOLL-2026-11-18.md`，历史文档）：`#F2EFE8`/`#D5CFC4`/`#94806F`/`#6F5C52`/`#6B584E`/`#C7A39B`/`#D79B9B`/`#D9A3A0` —— 已被 Selkirk 版本取代，**不得作参考/母版**。
- 旧「红项圈 + 金铃」`#C1463F`/`#E0B35A`、绿眼 `#3F7D5A`、橙毛 —— 出现即打回。

## 5. 狗（金毛寻回犬 v11）

### 5.1 A：96 运行调色板（`dog-anim-placeholder@0.1`，18 role / 17 唯一色）

证据：`scripts/gen-pet-anim-frames.py` `DOG_COLORS`（L113–137）；`scripts/dog_golden5.py` 绘制；`public/assets/pet/anim/dog/manifest.json`；68 帧逐像素统计。**`DOG_PROMPT_PACK` §3 是本表的 dog 专用展开**（现有 `docs/art/prompts/DOG-PROMPT-PACK-2026-11-20.md` §3），本表与其一致。

| role | hex | 用途 | 全包占比（实测） |
|---|---|---|---|
| outline | `#0B1220` | 唯一 1 px 外轮廓；内部禁用 | 11.26% |
| body | `#D9A251` | 金黄主体 | **59.00%** |
| shade | `#A96A26` | 暗部/腿阴/内部结构分隔（**内部线用 shade，不用 outline**） | 5.66% |
| light | `#F2CF87` | 左上硬光/额头饰毛/口吻亮面 | 4.89% |
| belly | `#F8ECD0` | 奶油口吻/胸 V/腹腿后羽/尾羽尖 | 10.45% |
| ear | `#BD7C2E` | 垂耳主色（比 body 深） | 3.54% |
| ear_inner | `#96621F` | 耳内/耳根暗 | 1.10% |
| eye | `#5B3A1C` | 虹膜/瞳孔深棕（不用纯黑） | 0.48% |
| eye_hi | `#F4F9FF` | 1 px 眼高光 | 0.05% |
| nose | `#171310` | 鼻头/嘴线/张口内腔 | 0.79% |
| tongue | `#E08A86` | 舌（仅兴奋/追咬帧，≤2 px 级） | 0.10% |
| collar | `#A63D35` | 哑光砖红项圈底色（现行 asset 事实） | 1.31% |
| collar_hi | `#BD5A50` | 项圈 1 px 高光 | 0.60% |
| collar_dark | `#7D2F2A` | 项圈 1 px 暗边 | 0.66% |
| ball | `#D9713C` | 仅 ball_throw/ball_chase | 0.08% |
| ball_hi | `#F3C08A` | 球 1–3 px 高光 | 0.01% |
| fx | `#F4F9FF` | 星光/运动短线；**与 eye_hi 同 hex，所以 18 role 只占 17 唯一色** | 0.05% |
| blush | `#E7A08F` | 仅 pat_head f1/f2、paw_face f2/f3；final 建议删 | 0.02% |

> 项圈是现行 asset 的常驻件（68/68 帧），与 OC 提案「默认无项圈/可选深青」冲突；A profile 锁砖红三带。

### 5.2 B：OC 金毛 C-token 提案（`docs/art/oc/dog/OC.md` §2）vs A 的 ΔE00

| 用途 | OC token | A 最近 role | ΔE00 | 结论 |
|---|---|---|---:|---|
| 金毛主体 | `#E0A94F` | body `#D9A251` | 2.46 | ≤5，可视为同色 |
| 亮部 | `#F0C877` | light `#F2CF87` | 2.41 | ≤5 |
| 阴影 | `#B97F33` | **ear `#BD7C2E`**（最近）/ shade `#A96A26` | **1.85** / 7.62 | 映射到 ear；A 的 shade 更深 |
| 深阴影 | `#8A5A22` | ear_inner `#96621F` | 3.87 | ≤5 |
| 耳/尾暗部 | `#C98C3F` | ear `#BD7C2E` | 5.04 | 略超，需显式选 profile |
| 胸腹浅色 | `#F2D9A8` | belly `#F8ECD0` | 7.57 | **>5**：A 更奶油 |
| 虹膜棕（深 `#4A3320`） | `#6A4A2E` | eye `#5B3A1C` | 5.34 | 略超；A 更深 |
| 眼高光 | `#F4F9FF` | eye_hi `#F4F9FF` | 0.00 | 同色 |
| 鼻头 | `#232227` | nose `#171310` | 6.90 | **>5**：A 更暖更深 |
| 舌 | `#D98F8F` | tongue `#E08A86` | 2.83 | ≤5 |
| 项圈（可选） | `#2E6B9E` + `#D8B36A` | collar `#A63D35` | **41.63** | 完全不同的配件方案 |
| 轮廓 | `#0B1220` | outline `#0B1220` | 0.00 | 同色 |

> 结论：OC C 表与 A 在 6 个 role ΔE00 > 5（shade/ear/belly/eye/nose/collar），**不是同一块调色板**。A profile 用 §5.1；B profile 整套切换（含无项圈、眼/鼻/胸腹色改），并新 palette id。**禁止半套混用**（例如只换 body 不换 shade）。

### 5.3 狗裁定与禁用

- **D1** 运行时最高频色是 `body #D9A251`（59%）；任何生成若 body < 45% 或出现大面积棕黑/红棕，判漂移。
- **D2** 内部结构**只用** shade/light/belly/ear_inner 分隔；`#0B1220` 只在外轮廓（`chase_tail_03` 等 ≤5% 边界毛簇容差由 dog pack §4.2 记录）。
- **D3** 项圈：A = 砖红 3 带常驻；OC 提案深青 + 黄铜是 B 方案，A 不得出现 `#2E6B9E`/`#D8B36A`。
- **D4** 无眼斑/鞍斑：旧占位 `#B3834C` 眼斑禁用；`ear`/`shade` 不得画成面部斑块。
- **D5** 舌 ≤2 px 语义、腮红仅 2 clip、球仅 2 clip（`ball`/`ball_hi` 只许 ball_throw/ball_chase）。
- **D6** 旧金棕占位（`#C79A5B`/`#8A5D2F`/`#B3834C`/`#F2E3C8`/`#4A3524`/`#2A2430`/`#2E6B9E`）不得作参考。

### 5.4 狗的 prompt 用色句

- **96 短句（A）**：`warm golden coat base #D9A251, honey highlights #F2CF87, brown-gold shadows #A96A26, cream muzzle/chest/ruff #F8ECD0, darker drop ears #BD7C2E with #96621F inner shadow, warm brown eyes #5B3A1C with one 1px #F4F9FF catch-light, near-black warm nose #171310, matte brick-red collar #A63D35 with #BD5A50 highlight and #7D2F2A shadow, 1px closed #0B1220 outline, flat 2-3 step shading.`
- **B 短句**：`#E0A94F` body / `#F0C877` light / `#B97F33` shadow / `#8A5A22` deep / `#F2D9A8` chest / `#6A4A2E` iris / `#232227` nose / no collar（可选 `#2E6B9E`+`#D8B36A`）` —— 只有整包迁移 B 时使用。

## 6. 冲突登记册（跨文档，全部已裁定）

| # | 冲突 | 来源 | 本文件锁定 | 依据 |
|---|---|---|---|---|
| C1 | 96 西装 `#1E1E26` vs canon `#191920` | HUMAN-TINGLAN §2.2 vs CANON §1.5 | 96 用 `#1E1E26`；128+ 用 `#191920`（ΔE00 1.68） | 本机实测 + 设计文档说明 |
| C2 | 黑丝 `#8A6E6B` vs `#8B716E` vs `#90786F` | CANON §1.5 表内/正文、ANIME-TO-PIXEL、旧库 | **`#8A6E6B` / `#6A5652`** | 运行实测 + 已校准口径 |
| C3 | `#1B1612` 内侧暗线在 96 是否存在 | 风格契约 §4.2 | 96 **不用**（实测 0 px）；只 128+ 用 | 三包逐像素 |
| C4 | 汀岚虹膜外环 `#1E3F8F` | OC §13.4 / 256 draft | 96 无；256 实测 0.37%；128 final / 256 keyart 用 B2 iris 槽 | 实测 |
| C5 | 汀岚腮红 `#E7A08F` | CANON 禁脸红 vs 96 pat_head | 96 占位豁免 2 px；final/128+ 删 | HUMAN §8 风险条 |
| C6 | CAT OC 布偶 C 表 vs Selkirk 运行表 | `docs/art/oc/cat/OC.md` §2 vs `cat_selkirk.py` | 「同色布偶」用运行 16 色（A）；C 表只在换 palette 时用 | 7 role 中 4 个 ΔE00 > 5 |
| C7 | 旧布偶 palette（棕面罩/粉鼻） | CAT-RAGDOLL 历史文档 | 作废，不作参考 | Selkirk 文档 §0/§8 历史声明 |
| C8 | 狗项圈：砖红常驻 vs OC 可选深青 | dog 运行 asset vs `docs/art/oc/dog/OC.md` §2 | A 用砖红；B 才可换深青（ΔE00 41.63） | 68/68 帧实测 |
| C9 | 狗 OC 阴影 `#B97F33` 的最近运行 role | OC §2 vs 运行表 | 最近是 `ear #BD7C2E`（ΔE00 1.85），不是 `shade`（7.62） | 本机 ΔE00 |
| C10 | 256 包 `palette` 元数据 vs 实际槽位 | manifest 写 `orca-pixel@0.2-draft`；槽位 JSON 在 `art/_placeholder/.../anchor-final/` | **256 keyart** 用 B2 槽位；draft 未注册，产物非 final；128 final 用已注册 `orca-pixel@0.2`（B3） | TINGLAN-256-ANCHOR-FINAL §7 + task-150 |
| C11 | `style.yaml` `palette.maxPerCharacter: 12` vs 实际 16–20 色 | style.yaml:12-14 vs hero 覆盖:44-51 | hero/pet 96 包走 hero 覆盖（40）；动画包再按中央测试 ≤20/帧 | style.yaml 自身 hero 段 |
| C12 | 2 px 轮廓：256 包 vs 96 包 1 px | TINGLAN-256-ANCHOR-FINAL（2 px）vs 风格契约（1 px） | 96 严格 1 px；256 concept 2 px 是其轨道特例，prompt 必须按目标轨道声明 | 实测 + 文档 |

## 7. 不在本锁范围（legacy / 其他角色 / UI）

- **legacy 96 占位包**：`public/assets/pet/cat-placeholder/**`、`dog-placeholder/**`、`pearl-placeholder/**`、`humanoid-default` —— 旧配色（姜黄虎斑/金棕眼斑/pearl-pixel）不得作为三份 pack 的参考或母版。
- **Pearl 线 palette**：`art/_style/palettes/pearl-pixel.hex`（40 色）、`art/specs/pet.pearl.pixel.json` —— 属 Pearl hero 层，不是三角色 palette；不得混入。
- **游戏/场景色板**：`a-reef`/`b-town`/`c-night`/`pet-paper` —— 属 Aquarium/Stall/Town/pet 场景，不是角色色。
- **UI 图标色**：不属角色；如未来生成 UI 用 ≤12 色规则，另立注册。

## 8. 验收门（可复现）

### 8.1 本机实测基线（2026-11-20，WSL/Linux，HEAD `47438ac`）

| 包 | 文件 | 画布 | 唯一色（全包） | 每帧色数 | 地线 | alpha | 四角 | `#000`/`#FFF` | `#1B1612` | 边界非轮廓 |
|---|---:|---|---:|---:|---|---|---|---:|---:|---|
| dog | 68 | 96² | 17 | 12–16 | 全 89 | 二值 | 全透明 | 0 / 0 | 0 px | 344/21632（FX 后绘） |
| cat | 72 | 96² | 16 | 10–16 | 全 89 | 二值 | 全透明 | 0 / 0 | 0 px | 218/24474（FX 后绘） |
| human | 68 | 96² | 20 | 15–19 | 全 89 | 二值 | 全透明 | 0 / 0 | 0 px | 115/20153（FX 后绘） |
| tinglan-256 | 49 | 256² | 22 | 16–22 | 全 255（bottom） | 二值 | 全透明 | 0 / 0 | 0 px | 0/42619（2 px 轮廓） |

- **边界非轮廓** = 轮廓闭合后另绘的 FX/粒子像素（dog 暖色 FX rim `#A96A26`/`#F2CF87`；cat 星光/尘土；human `#99C8FF`/`#F4F9FF`），与设计文档的 FX 后绘豁免一致；主剪影的轮廓闭合由三包 `--check`、cat `--verify` 与测试断言保证。
- **生成器字节复验（本机实跑，全部 exit 0）**：
  - `python3 scripts/gen-cat-anim.py --check` → `check ok: cat animation pack matches the generator`
  - `python3 scripts/gen-human-anim.py --check` → `check ok: human animation pack matches the generator (68 frames, 68 unique, max 19 colours, ground y=89...)`
  - `python3 scripts/gen-pet-anim-frames.py --check` → `check ok: dog ... + cat (delegated) + human (delegated) animation packs verified`
- **Node 测试（2026-11-20 task-150 更新）**：该 checkout 的 `node_modules` 现为 **linux-x64**（WSL node v24.22.1），此前「Windows 安装导致 esbuild 平台不符」的说明不再适用。task-150 改动前全量 `npm test` = **1946 pass / 0 fail**；改动后（含 `art/specs/pet.tinglan.pixel.json` 注册）TINGLAN 相关 8 个测试文件 = **71 pass / 0 fail**（`pet-anim-human` / `character-validation` / `hero` / `placeholder-spec` / `tooling-paths` / `oc-consistency` / `pet-anim` / `character-packs`）。全量 `npm test` 同期因**并行的 cat-ragdoll 任务在途资产**出现 7 个 cat 断言失败（`cat-ragdoll-anim@0.1` vs 旧断言 `cat-selkirk-anim@0.1` 等），**与 task-150 无关**；证据见 `../TINGLAN-DECISIONS-2026-11-20.md` §5.3。

### 8.2 重跑命令

```bash
# 1) 逐像素颜色/门禁统计（Python + PIL/numpy；只读）
python3 - <<'PY'
import glob; from collections import Counter; from PIL import Image; import numpy as np
for ch in ['dog','cat','human']:
    files=sorted(glob.glob(f'public/assets/pet/anim/{ch}/*/*.png')); tot=Counter(); per=[]
    for f in files:
        a=np.array(Image.open(f).convert('RGBA')); op=a[:,:,3]==255
        c=Counter(map(tuple,a[:,:,:3][op].tolist())); tot.update(c); per.append(len(c))
    print(ch, len(files), len(tot), min(per), max(per))
PY
# 2) 生成器逐字节复验（只读；同时验证三包的 palette 常量与盘上一致）
python3 scripts/gen-cat-anim.py --check
python3 scripts/gen-human-anim.py --check
python3 scripts/gen-pet-anim-frames.py --check
# 3) 有 Windows/CI 环境时再跑 palette 断言
node --import tsx --test tests/pet-anim.test.ts tests/pet-anim-cat.test.ts tests/pet-anim-human.test.ts
```

### 8.3 每资产 palette gate 清单（三份 pack 的验收共用）

- [ ] 每帧可见色全部 ⊆ 本文件对应角色的 profile 表（A 或 B，不混）；新增色 0。
- [ ] 每帧 ≤ 对应上限：狗/猫 ≤16（锁 ≤20 中央测试）、汀岚 96 ≤19（锁 ≤20）、汀岚 128 final ≤32（注册板 24 / 硬门 40）、汀岚 256 keyart ≤22（≤32 目标 / ≤40 硬门）。
- [ ] `#000000` / `#FFFFFF` 0 px；`#1B1612` 在 96 包 0 px。
- [ ] 外轮廓 1 px `#0B1220` 闭合；内部无 outline 色像素（dog/cat/human 的 `internal black=0` 口径）。
- [ ] 二值 alpha、四角透明、地线 y=89（96）/ bottom（256）。
- [ ] accent 类色（汀岚 `#3964FE`）≤3%；眼高光每睁眼 1 px（96）/ 2×2（256）。
- [ ] FX 只用登记 FX 色且不覆盖主体、不带黑边。
- [ ] palette id 与 manifest / character.json 一致；换色=新 id。
- [ ] 128 final 帧全部 ⊆ **已注册 `orca-pixel@0.2` 24 色**（`art/_style/palettes/orca-pixel.hex` + `art/specs/pet.tinglan.pixel.json`）；96/256 的占位/草案 id 不参与本门。

## 9. 给三份 prompt pack 的引用锚点（稳定 section 号）

| pack | 必须引用 | 允许引用 | 禁止 |
|---|---|---|---|
| `TINGLAN-PROMPT-PACK-2026-11-20.md` | §1（规则/R1–R7）、§2（通用 token）、§3.1（96 20 色）、§3.2（128 final B1 + 注册板 / 256 keyart B2）、§3.4（裁定/禁用）、§8（gate）、§12（拍板落地） | §3.3（ΔE 表）、§3.5（用色句）、§6（C1–C12） | 自己新写 hex 表；把 canon `#191920` 用在 96；把 `#1B1612` 用在 96；把 blush 写进 128+ |
| `CAT-RAGDOLL-PROMPT-PACK-2026-11-20.md` | §4.1（16 色 A）、§4.3（同色迁移 5 条）、§4.4（禁用/历史）、§8（gate） | §2、§4.2（B 对照）、§6（C6/C7） | 用 OC C 表冒充「同色」；恢复橙/棕/粉/绿眼；用旧 Ragdoll/Tabby palette |
| `DOG-PROMPT-PACK-2026-11-20.md` | §5.1（17 色 A）、§5.2（B 对照）、§5.3（裁定 D1–D6）、§8（gate） | §5.4（用色句）、§6（C8/C9） | 半套 A/B 混用；蓝色项圈当 A；旧金棕眼斑色 |
| 三份共同 | `CHARACTER-PROMPT-SYSTEM-2026-11-20.md` §2/§3（组装与 STYLE BLOCK）、§7（负面）、§9（一致性 gate） | 该文件 §5/§6（角色 DNA/动作） | 绕过本文件与提示词系统另立跨角色风格句/hex 表 |

## 10. 参考与证据索引

| # | 文件/位置 | 用途 |
|---|---|---|
| 1 | `docs/art/PIXEL-STYLE-SPEC-2026-11-16.md` §4.2–§4.5/§5.2–§5.3 | 风格硬规则与 AI style tokens |
| 2 | `docs/art/CANON-SETTING-BOOK-2026-11-16.md` §1.5（L67–81） | 汀岚 canon palette |
| 3 | `docs/art/oc/tinglan/OC.md` §13.2/§13.4（L215–250） | 汀岚身份锚点与 token |
| 4 | `docs/art/oc/cat/OC.md` §2（L44–57）/§12 | 猫 OC C 表与视觉锚点 |
| 5 | `docs/art/oc/dog/OC.md` §2（L44–59）/§12 | 狗 OC C 表与视觉锚点 |
| 6 | `scripts/human_tinglan.py` L39–60 | 汀岚 96 palette 常量 |
| 7 | `scripts/cat_selkirk.py` L38–56 | 猫 96 palette 常量 |
| 8 | `scripts/gen-pet-anim-frames.py` L61、L113–137 | 狗 96 palette 常量 + OUTLINE |
| 9 | `public/assets/pet/anim/{human,cat,dog}/manifest.json` | palette id / 帧契约 |
| 10 | `public/assets/pet/tinglan-256/manifest.json` + `art/_placeholder/orca-tinglan-256-2026-11-17-v2/anchor-final/palette-orca-pixel-0.2.json` | 256 palette id 与 32 槽草案 |
| 11 | `docs/art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md` §2/§7 | 256 门禁与「draft 未注册」声明 |
| 12 | `docs/design/HUMAN-TINGLAN-2026-11-18.md` §2.2/§8 | 96 palette 与已知风险 |
| 13 | `docs/design/CAT-SELKIRK-2026-11-18.md` §1/§8 | 猫现行设计/调色板 |
| 14 | `docs/design/CAT-RAGDOLL-2026-11-18.md` L1–3 | 历史版本声明（仅历史） |
| 15 | `art/_style/style.yaml` L12–21/L44–51 | 机器 style token / hero 覆盖 |
| 16 | `tests/pet-anim.test.ts` L447–467；`tests/pet-anim-human.test.ts` L44–51；`tests/pet-anim-cat.test.ts` L55–67 | ≤20 色/硬 alpha；汀岚 20 色表；猫 16 role 表 |
| 17 | `docs/art/prompts/DOG-PROMPT-PACK-2026-11-20.md` §3 | 狗的既有展开（与本文件一致） |

## 11. 边界与待拍板

- **本文件不做（原始边界）**：不生图、不调 API、不改资产/代码/manifest/tests/character.json、不 commit。
- **注册状态（2026-11-20 task-150 更新）**：**已注册** `orca-pixel@0.2`（`art/_style/palettes/orca-pixel.hex` 24 色 + `art/specs/pet.tinglan.pixel.json`）；**未注册** `orca-pixel@0.2-draft`（256 keyart 草案）、`human-anim-placeholder@0.2-tinglan`（96 placeholder）、`art/_style/palettes/palettes.json` 统一注册表（工程项）。256 keyart / 96 placeholder 产物仍不得称 final。
- **已决（2026-11-20 拍板）**：汀岚 **final 主画布 128**（256 仅 keyart）；**96 保留 bow 简化**；`orca-pixel@0.2` 注册。决策明细见 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md)。
- **待 owner 拍板（原始编号 ①–⑤；D1/D3 未回答 ③④⑤）**：① ~~猫「同色布偶」是否沿用旧 id 名~~（**已拍板：改名 `cat-ragdoll-anim@0.1`**，hex 不动）；② 狗 OC B 方案是否整体切换（含无项圈）；③ 汀岚 128 是否随 `#191920` 正式重建（拍板只定画布，未定重建批次）；④ 是否把 `#1B1612` 内线引入 128 后写回 CANON；⑤ 腮红在 final 是否按 canon 全部删除。
- **版本纪律**：本文件日期 2026-11-20；任何 hex 变更需新增日期版本并在 §6 登记旧值 → 三份 pack 引用新版本。2026-11-20 task-150 为**文档/注册修订**（未变更任何已登记 hex 值，只新增 `orca-pixel@0.2` 注册与拍板口径）；2026-11-20 task-155 为猫包 P2/P3 修整：palette id 同步为 `cat-ragdoll-anim@0.1`（hex 未变），§4.1 占比按新包重测。

## 12. 2026-11-20 拍板落地（task-150）

### 12.1 已批准决策

| # | 决策 | 落地 |
|---|---|---|
| D1 | **汀岚 final 主画布 = 128×128** | 128 成为 final 唯一主画布；`art/specs/pet.tinglan.pixel.json` 按 128 建契约（7 tags/36 帧、anchor `(64,128)`、地线 128）。 |
| D2 | **256 仅 keyart** | 256 降为 keyart/大图参考；现有 49 帧 concept 包与 `character.json` **保持原样**（`placeholder:true/final:false`），不再排 final 化、不得作 final 运行时画布。 |
| D3 | **96 保留 bow 简化** | 96（`human-anim-placeholder@0.2-tinglan`）继续用蓝 bow 读形，不强制重画鲸形；96 仍是发布 placeholder/兼容轨，不是 final。鲸形仅对 128 final/256 keyart 强制（H7 已同步）。 |
| D4 | **尝试注册 orca-pixel 调色板** | 已注册 `orca-pixel@0.2`：`.hex` 24 色 + `art/specs/pet.tinglan.pixel.json`；`validate-character.mjs` legacy-spec 解析可命中（`palette.spec=true`）。`@0.2-draft` / 96 id / `palettes.json` 仍未注册。 |

### 12.2 证据（本机实跑）

- `python3 scripts/check_specs.py --specs art/specs` → `ok: 8 spec(s)`（新增 `pet.tinglan.pixel.json: 7 states / 36 frames`）；WARN `24 placeholder roles (> 16)` 为 warning，exit 0。
- `.hex` 与 spec `colors`：24/24 逐色一致、无重复、无 `#000000`/`#FFFFFF`。
- 调色板解析探针（临时 fixture，不写仓库）：256 concept 帧声明 `@0.2` 时 `palette.spec=true` + 3 色越界（`#2e2e3a`/`#101016`/`#14141a`）——证明注册生效且 256 草案色不属于 128 final 板（这正是 D2 保留 keyart 轨的依据）。
- `node --import tsx scripts/validate-character.mjs public/characters/tinglan-256 --json --strict` → 仍 `palette.spec=false`（`@0.2-draft` 未注册，符合预期）。
- 资产/生成器/测试/构建：见 [`../TINGLAN-DECISIONS-2026-11-20.md`](../TINGLAN-DECISIONS-2026-11-20.md) §5（`gen-human-anim.py --check`、`npm run typecheck`、`npm test`、`npm run build`、`fci:validate`）。

### 12.3 未做 / 不声称

- 未改任何 `public/` 资产/manifest/`character.json`；128 **0 张 PNG**；无 final 资产；未调图像 API；未 commit/push。
- 未建 `palettes.json`、未注册 `@0.2-draft`/96 id、未改 CANON/旧契约里的 `orca-pixel@0.1` 文本（待同步项）。

---

*本文件与三份 prompt pack、`CHARACTER-PROMPT-SYSTEM-2026-11-20.md` 共同构成 prompt 系统的文档层；三份 pack 以本文件为 hex 权威，除引用/展开已登记 role 外不得新增 hex。*

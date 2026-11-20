# 猫生成提示词包 · CAT PROMPT PACK（同配色布偶猫 / Blue Bicolor Ragdoll）· 2026-11-20

> **Status: 已实施（v2 · 2026-11-20）**。v1 是文档交付；v2 按 owner 批准的决定（task-149）**已把盘上猫包换成同配色布偶猫**：16 个 hex 不变、palette id 改 `cat-ragdoll-anim@0.1`、72 帧全部重生成、测试/文档同步；**未调用图像 API、未生成音频、未 commit/push、未改插件**。实现与实测见 §0.2.1 / §3.4 / §4.9 / §10.3 / §12.3。
> **任务**：task-146（设计）→ task-149（像素资产实现）。
> **实测基线**：v1 基于 `47438ac`（Selkirk 卷毛包）；v2 基于 v1 设计在 `df791b8` 工作树上实现并实测。本文所有数字来自本机对盘上资产的测量或仓库门禁输出，见 §0.2 / §0.2.1 / §12.1。
> **用途**：文件既是「概念稿生成 → 人工像素重绘 → 门禁验收」的**生成提示词与验收契约**，也是本轮 96px 占位实现的记录。默认 `profile A = 同配色布偶猫方案`。
> **现状声明（v2）**：盘上 `public/assets/pet/anim/cat/**` 已换成 **blue bicolor 布偶猫（直长毛，F1–F6）**；profile B 的 Selkirk 数值仅作历史 diff 基线，可用 `cat_selkirk.py` 的 git 历史回滚。
> **语种**：说明中文；`text` / `json` 代码块内是可直接送模的英文 prompt。prompt 内不写角色名/文字/水印（角色未命名）。
> **同目录兄弟包**：`TINGLAN-PROMPT-PACK-2026-11-20.md`、`DOG-PROMPT-PACK-2026-11-20.md`；三份包共享同一口径（96px、12 clip 帧表、Cel-Chunk/F1 像素语法）。
> **唯一调色板**：`PALETTE-LOCK-2026-11-20.md` §4.1（profile A，猫 96 A）；本文 §3.1 已与其逐 hex 核对一致（16/16）。
> **共用风格/负面/管线**：`CHARACTER-PROMPT-SYSTEM-2026-11-20.md` §3/§7/§8/§9；本文 §2.1/§7.1/§8 与其对齐。
> **目标契约**：12 clips / 72 帧 / 96×96 / anchor(48,96) / 地线 89；不是 7-tag legacy。
> **本文件只写 prompt 文本与验收契约**；未调用图像 API、未生成图片、未改资产/代码。

## 0. 一页纸

### 0.1 锁定结论

| 项 | 结论（默认 = profile A：同配色布偶猫） |
|---|---|
| 是谁 | **布偶猫（Ragdoll），蓝重点双色（blue bicolor）**虚构 AI 宠物 OC；成年猫外观；非官方、与 DeepSeek 无关联；不是真实猫 |
| 视觉口径 | **白为主丝滑半长毛**（platinum-ivory）+ **冷灰蓝重点**（连帽/面罩/耳/尾）+ **白 blaze 起点在眼睛上方** + 白吻/下巴/胸/爪 + **蓝眼**；无项圈；产品化短腿（沿用 v11） |
| 同配色定义 | **16 个 role / 16 个 hex 与现行 Selkirk 包逐字节相同（diff = 0）**；不新增/不删除 role；只重定义每个 role 的解剖用途（§3.1） |
| 画布/锚点 | `96×96`；anchor `(48,96)` `foot-center`；footBox `(-36,-18,72,18)`；**地线 `y=89`**；当前并集内容 bbox `(2,4)–(94,89)`（advisory；右边界 1px 为 task-155 采纳 review 选项 b 的接受口径） |
| 包契约 | **12 tags / 72 帧**；`stand_wag` 10 帧 @6fps 非均匀（3200ms）；每帧**硬 alpha**、**1px 闭合轮廓 `#0b1220`**、**≤20 可见色**（anim 包门禁；实测每帧最大 16） |
| 帧表 | idle 6@6 loop · idle_blink 3@12 · walk 8@10 loop · run 6@14 loop · pat_head 4@8 · ball_throw 5@10 · ball_chase 6@12 · paw_face 5@8 · scratch 6@8 · stand_wag **10@6 / holdMs 3200ms** · chase_tail 6@10 · attack 7@16 非均匀（§4.3） |
| 颜色 token | **16 role / 16 个不同 hex**（无同 hex 重复 role）；**owner 已拍板改 palette id `cat-ragdoll-anim@0.1`**（只改名、hex 不动；2026-11-20 task-149 同步 9 处消费点） |
| 卷毛难点解法 | 剪影平滑 + 只在 4 个毛区加 ≤3px 毛边 + 2 条 1px 毛流 + 围脖/毛裤/羽状尾三锚点；四向 bump 目标 4–10 **已达成（实测 4–10）**；圆度目标 1.15–1.60 经首轮校准改为 96px 可复现门禁（avg ≤2.35、单帧 ≤2.55，实测 2.01–2.53 avg 2.32），见 §4.9/§10.3 |
| 动作可达性 | 可达：idle / idle_blink / pat_head / run / paw_face / scratch / stand_wag / chase_tail / ball_throw / ball_chase（hero 抛球路径）；**spec-only 冻结：walk / attack**（manifest `anim.specOnly`，2026-11-20 MB-047/E5-T7） |
| 人格/语音 | 懒散高冷（沿用现 cat）；`voice = {mode:none, canTts:false, bubble:thought}`；**猫永不 TTS、只用空心心理活动气泡**；布偶的 docile/placid 品种性格只用于支撑现人格，不改产品文案方向 |
| 历史口径 | **profile B** = 当前 Selkirk 卷毛运行资产（diff/回滚基线）；**profile C** = 2026-11-17 白布偶 OC（7 tags/36 帧历史，仅边界/负面词参考，契约作废） |
| 主要代价 | 卷毛“蓬松萌”视觉消失；72 帧字节全部重绘；插件需 re-embed；palette id 改名要同步 9 处（§3.4）；插件/文案里“塞尔凯克/卷毛”批量更新（§9） |
| 待拍板 | ~~palette id 是否改名~~（已拍板改）；短腿产品化 vs 品种标准比例（保留短腿）；v10 连帽 vs 标准 bicolor 倒 V（保留 v10）；身体灰斑保留 vs 全白（已拍板：身体以白为主，移除肩/腰灰斑，灰耳灰尾保留） |

### 0.2 本机实测基线（2026-11-20，profile B = 当前盘上资产，用于 diff/验收对照）

| 项 | 实测值 | 证据/方法 |
|---|---|---|
| 仓库 HEAD | `47438acb7a08f11f4d843ead62179bd1a28edcc0` | `git rev-parse HEAD` |
| 动画包 | `public/assets/pet/anim/cat/`，**73 个文件 = 72 PNG + manifest.json** | `find` 计数 |
| 包体积 | **172,426 B（≈168.4 KiB，<500KB 门禁）** | `du -sb`（apparent size） |
| 帧格式 | 96×96 RGBA，**72/72 帧硬 alpha（只有 0/255）** | `gen-cat-anim.py --verify` 逐帧 `hard=True` |
| 可见色 | **每帧最大 16 个不同 hex；全包并集 16 个 role/hex**；测试允许 ≤20/帧 | `--verify` maxcolors=16 + python 逐帧统计 |
| 颜色占比（72 帧均值） | 白区（body+light+belly）**56.1%**、灰重点（mask+mask_dark+ear+ear_inner）**24.5%**、outline **10.3%**、shade **7.8%**、eye **0.65%**；平均不透明 3,275 px/帧 | PIL 全包扫描（2026-11-20） |
| 地线/边距 | 72/72 帧底边 `y=89`；并集 bbox 边距 L/T/R/B = **2/4/1/6**（content bbox `(2,4)–(94,89)`；右边界 1px 见 §0.2.2）；0 帧触边 | `--verify` + 逐帧扫描 |
| 唯一帧 | **72/72**（SHA-256 全不同；stand_wag 10/10 不同；attack 7/7 不同） | `--verify` + `sha256sum` |
| 剪影指标（卷毛） | 全包圆度 **min 2.08 / max 2.77 / avg 2.52**；四向 bump **min 13 / max 40 / avg 30.6**；正面 clip 圆度 avg 2.56 / bump avg 37.8；侧视 clip 圆度 avg 2.42 / bump avg 16.3 | 与 `tests/pet-anim-cat.test.ts` §4b 同算法，本机 72 帧重算 |
| 生成器复验 | `python3 scripts/gen-cat-anim.py --check` → `check ok: cat animation pack matches the generator (blink end 112 px vs idle_00, mid 1055 px <= idle envelope 1139 px)` | 本机 WSL python3 + numpy 实跑（exit 0） |
| 技术复验 | `python3 scripts/gen-cat-anim.py --verify` → **FAILS: none**；72/72 unique；bottoms 全 89；hard alpha；maxcolors=16；non-FX gap=0；internal black=0；enclosed holes=0；bbox 2/4/1/6；walk airborne `[1,1,1,1,1,1,1,1]` | 本机实跑（exit 0） |
| 单测 | `node --import tsx --test tests/pet-anim-cat.test.ts` → **17 tests / 15 pass / 0 fail / 2 skipped**（skip 仅因 Windows node 找不到 numpy；生成器门禁另行用 WSL python 实跑通过） | Windows node v24.22.1 实跑；WSL node 因 `node_modules` 为 win32 esbuild 无法加载（环境问题，非代码失败） |

> 说明：`docs/design/CAT-SELKIRK-2026-11-18.md` §6.1 写的圆度 2.03/2.71、bump avg 31.9 是 68 帧时代的旧测量；本轮在 72 帧包上重算得 2.52 / 30.6。**以本文重算为准**，实现任务可顺手校正旧文档（§1.2 C11）。

### 0.2.1 实现后实测（2026-11-20 · profile A = 当前盘上资产）

| 项 | 实测值 | 证据/方法 |
|---|---|---|
| 仓库 HEAD | `df791b8` 之上工作树（未 commit） | `git rev-parse HEAD` |
| 渲染器 | `scripts/cat_selkirk.py`（文件名历史遗留，内容已换布偶；`draw_ragdoll`） | 文件头 docstring |
| 动画包 | `public/assets/pet/anim/cat/`，**73 个文件 = 72 PNG + manifest.json** | `find` 计数 |
| 包体积 | **145,810 B（≈142.4 KiB，<500KB 门禁）** | `du -sb` + 生成器输出 |
| 帧格式 | 96×96 RGBA，72/72 帧硬 alpha | `gen-cat-anim.py --verify` |
| 可见色 | 每帧最大 16；全包并集 16 role；palette `cat-ragdoll-anim@0.1` | `--verify` + 测试 |
| 颜色占比（72 帧） | 白区 body+light+belly **53.5–69.8%，avg 60.1%**；重点 mask+mask_dark+ear+ear_inner **9.6–25.6%，avg 20.0%** | 同 §3.2 口径逐帧统计（`--verify` §5） |
| 地线/边距 | 72/72 帧底边 y=89；0 帧触边 | `--verify` |
| 唯一帧 | 72/72 | `--verify` + 测试 |
| 剪影指标 | 圆度 **2.01–2.53 / avg 2.32**；四向 bump **4–10 / avg 6.3**（Selkirk 基线 2.08–2.77/2.52、13–40/30.6） | 与测试同算法；`--verify` §5 |
| 生成器复验 | `python3 scripts/gen-cat-anim.py --check` → `check ok`（blink end 151 px、mid 820 px ≤ idle envelope 920 px） | 本机实跑 |
| 技术复验 | `--verify` → **FAILS: none**；72/72 unique；bottoms 全 89；hard alpha；maxcolors=16；internal black=0；holes=0；walk airborne `[1]*8` | 本机实跑 |
| 单测 | `tests/pet-anim-cat.test.ts` 全绿（见 §12.3 证据；新增 silky/plume/ruff/quota 用例） | node 24 实跑 |

### 0.2.2 P2/P3 修整后实测（2026-11-20 · task-155）

| 项 | 实测值 | 证据/方法 |
|---|---|---|
| 动画包 | 73 个文件 = 72 PNG + manifest.json，**146,036 B** | 生成器输出（`gen-pet-anim-frames.py`） |
| 并集 bbox / 边距 | `(2,4)–(94,89)`，L/T/R/B = **2/4/1/6**；右边界 1px 为 P2-2 采纳 review 选项 (b) | `--verify` + 逐帧扫描 |
| 剪影指标 | 圆度 **2.18–2.54 / avg 2.35**；四向 bump **4–10 / avg 6.5** | `--verify` §5 |
| 颜色占比 | 白区 **59.9% avg**（53.5–68.5）；重点色 **20.2% avg**（12.2–25.2） | `--verify` §5 |
| P2-1 追尾环 | `chase_tail` f0–f5 **无闭环/无被包住奶油核**（新增回归测试；旧包 f0–f4 有 29–43px 被包内核） | `tests/pet-anim-cat.test.ts` 新用例 |
| P3-1 stand_wag 抬尾 | f2–f8 抬尾用 `mask` 蓝灰重点色（不再画成白尾） | 新增颜色语义测试 + 1x 目视 |
| P3-2 羽尾缺口 | 前视 3 个不等距/不等深扇贝（7px+9px 间距）；侧视/伸懒腰 2 个不等扇贝 | 12x 逐帧目视 |
| specOnly 文案 | manifest `anim.specOnly` 不再写 68-frame：统一改为 “the frozen 12-clip pack contract”（三包共用 `timing.json` 单源） | `timing.json` + 三包 manifest 重生成 |
| 生成器复验 | `gen-pet-anim-frames.py --check` exit 0；cat `--verify` FAILS none；blink end 151 / mid 820 ≤ envelope 920 | 本机实跑 |

> **圆度口径说明**：§4.9 的 1.15–1.60 是 v1 的首轮美术建议值。首轮实施在 96px 现有骨架（四条腿 + 羽状尾 + 耳）上实测圆度下限约 2.0——边界长度本身决定了几何圆度不可能到 1.6。故实现任务把门禁校准为「显著优于卷毛基线且不退回卷毛」：单帧 ≤2.55、全包 avg ≤2.35（Selkirk 2.08–2.77 / avg 2.52）；bump 4–10 仍按原目标达成。若未来 128/256 另绘，可再追求 1.15–1.60。

### 0.3 三套口径（先选 profile，再复制 prompt）

| | profile A · 同配色布偶（本包默认） | profile B · 当前 Selkirk 运行资产（基线/回滚） | profile C · 2026-11-17 白布偶 OC（历史） |
|---|---|---|---|
| 用途 | 未来正式美术/动画替换目标 | diff、回滚、验收对照；**当前盘上就是这个** | 身份/边界/负面词参考；契约作废 |
| 品种 | 布偶猫 blue bicolor，成年 | 塞尔凯克卷毛猫，灰+白/米 | 白布偶（Ragdoll），白为主 |
| 毛型 | 丝滑半长毛（直毛为主，guard hairs） | 卷毛（云朵毛簇 + C 形卷纹） | 长毛（顺滑） |
| 配色 | **16 hex 与 B 完全相同** | 16 hex（`CAT_COLORS`） | 旧 OC 提案 12 token（`#F2EFF2` 等，**不同**） |
| 帧契约 | 12 clip / 72 帧（与 B 相同） | 12 clip / 72 帧 | 7 tags / 36 帧（作废） |
| 腿/比例 | 产品化短腿（同 B） | v11 短腿：侧视可见腿 10–14px | 标准成年猫比例（未落地） |
| 默认 | **是** | 否（被替换对象） | 否 |

## 1. 真源、优先级与冲突裁定

### 1.1 真源优先级（本文件不自立 canon）

1. **用户最新明确指令**：2026-11-20「猫改布偶猫 + 同配色」（本任务口径）；沿用的 2026-11-18 短腿/同侧肢体/慢动作要求；
2. **盘上运行资产**：`public/assets/pet/anim/cat/**`（96×96、12 clip/72 帧、16 色）与 `public/characters/pet-cat/{character,behavior,regions}.json`；
3. **生成器**：`scripts/gen-cat-anim.py`（包壳/调色板/帧调度）+ `scripts/cat_selkirk.py`（当前绘制几何）+ `scripts/anim_timing.py`；
4. **计时单源**：`src/pet/anim/timing.json`（12 clip 帧表 + cat stand_wag override + specOnly）；
5. **门禁**：`tests/pet-anim-cat.test.ts`（17 tests）、`tests/default-packs.test.ts`、`tests/hero-multichar-integration.test.ts`、`scripts/gen-pet-anim-frames.py --check`；
6. **现行设计**：`docs/design/CAT-SELKIRK-2026-11-18.md`（§1/§4/§10–§14 迭代与实测）、`docs/content-packs/CAT-DESIGN-REFERENCE.md`（工程参考）；
7. **历史资料**：`docs/design/CAT-RAGDOLL-2026-11-18.md`、`docs/art/oc/cat/{OC,PROMPTS,RUNTIME-MAP}.md`（2026-11-17，7 tags/36 帧旧契约；仅取身份/边界/负面词）；
8. **旧占位**：`public/assets/pet/cat-placeholder/**`（姜黄虎斑/7 tags/36 帧）——**已作废**，只作反面参照，禁止当参考图。

> 共享契约（2026-11-20 19:59 同日落地，作为**引用真值**）：`PALETTE-LOCK-2026-11-20.md` §4.1（猫 96 A 16 色）/§4.3（「同色布偶」迁移规则）；`CHARACTER-PROMPT-SYSTEM-2026-11-20.md` §5.2（猫 DNA）/§6.1（12 clip 帧表）/§11.2–§11.3（pack 分工与必备头部）。本文与其冲突时：色板以 PALETTE-LOCK 为准，模板/AVOID/管线以 CHARACTER-PROMPT-SYSTEM 为准，猫专属内容以本文为准。

> 外部品种资料只用于**画法依据**（§10.2）：CFA Ragdoll 品种页（2026-11-20 实际抓取）；品种照片只作解剖/毛色研究，不描摹、不入包、不随包分发。

### 1.2 冲突与裁定（只记录，不擅自改现有文件）

| # | 冲突 | 证据 | 裁定/动作 |
|---|---|---|---|
| C1 | 品种：盘上=Selkirk Rex，任务=改布偶猫 | `public/characters/pet-cat/character.json:41,46`；`docs/content-packs/CAT-DESIGN-REFERENCE.md:1,10`；`docs/design/CAT-SELKIRK-2026-11-18.md:1,4` | **A 布偶猫**为替换目标；B 保留为回滚基线；实现任务按 §9 执行 |
| C2 | 毛型：Selkirk 卷毛 vs 布偶直长毛 | `scripts/cat_selkirk.py:1-25`（docstring）与 `:252-280`（curl_puff/ringlet） | A 用直长毛语法（§4.8）替换云朵毛簇与卷纹；**不是把毛簇删掉变成短毛猫** |
| C3 | 测试锁死卷毛：圆度 ≥1.7、四向 bump ≥10 | `tests/pet-anim-cat.test.ts:513-553`（阈值在 :529 / :551） | 实现任务必须把该用例替换为 **silky-coat 指标**（§4.9 / §10.3）；不要为过测把阈值放宽到失去意义 |
| C4 | 腿型：CFA 品种标准是中等偏长腿，盘上是产品化短腿 | CFA 标准（腿部中等长、后腿更长）；`CAT-SELKIRK` §12–§13（侧视可见腿 10–14px） | **A 保留产品化短腿**（用户已连续两轮要求矮脚化，狗也同风格）；文档标注“非品种标准、为 96px 产品比例”；标准比例只作可选变体 |
| C5 | 面罩：v10 连帽 + blaze 从眼上开始 vs 标准 bicolor 倒 V | `CAT-SELKIRK` §11（v10 用户验收）；`tests/pet-anim-cat.test.ts:699-745`（灰帽连续/blaze 起点） | **A 保留 v10 连帽/blaze 规则**（零测试改动）；标准 bicolor 倒 V 仅作可选 prompt 变体（§2.3） |
| C6 | 身体灰斑：Selkirk 把参考图橙斑改灰成肩/腰灰斑，布偶应白为主 | `scripts/cat_selkirk.py:663-676`（patch_l/patch_r）；`CAT-DESIGN-REFERENCE.md:54`（禁暖色毛） | A 保留为**低对比 bicolor saddle 斑**（面积减半、避开胸/腹），或按用户拍板改全白；两种都不得引入暖色 |
| C7 | 帧契约：旧 OC 是 7 tags/36 帧，现行是 12 clip/72 帧 | `docs/art/oc/cat/RUNTIME-MAP.md:1-20`；`src/pet/anim/timing.json:17-166`；`manifest.json:21-94` | **一律以 timing.json/manifest 为准**；旧 OC 三件套不可作为包契约（`tests/oc-consistency.test.ts:94,344-372` 仍锁旧占位 36 帧，不在本包范围） |
| C8 | palette id：`cat-selkirk-anim@0.1` 与新物种名不符 | `scripts/gen-cat-anim.py:43`；`manifest.json:20`；`public/characters/pet-cat/character.json:38` 等 9 处 | 建议 **A 改名 `cat-ragdoll-anim@0.1`**（只改 id、hex 不动），同一个变更集内同步全部消费点（§3.4）；不改名也可行但不推荐 |
| C9 | 插件/市场文案仍是“塞尔凯克卷毛猫/卷毛” | `plugins/dsh-famling/package.json:24`、`index.js:88`、`README.md:30,37,40,147,157,279`、`docs/DETAIL.md:5,12,16,128,138`、`locale/zh.json:4-5`、`locale/en.json:4-5`、`client.content.js:140,146,229,235`；`public/content/library.json:60,223,224` | `public/content/library.json` 已在 task-149 改布偶；插件文案/版本与 `regions.json` 单源台词因「不得改插件」移交后续 re-embed 任务；**人格/安全边界不改**（只改品种词：塞尔凯克→布偶、卷毛→长毛） |
| C10 | 现有互动文案写“卷毛不好梳” | `public/characters/pet-cat/regions.json:126`（wash 动作 says） | 改 1 句即可（§9.1 第 12 行）；regions 结构/命中框/动作 id 不变 |
| C11 | 旧文档实测数字漂移 | `CAT-SELKIRK` §6.1（2.03/2.71/31.9，68 帧口径）vs 本文 72 帧重算（2.52/30.6） | 以本文 §0.2 为准；实现任务复核后可校正旧文档，不改测试阈值依据 |
| C12 | 资产许可/来源未登记 anim 包 | `ASSET-LICENSES.md` 只列 `pet/*-placeholder/`；`AI-PROVENANCE.md` 快照早于 anim 包（dog 包 C9 同结论） | final/发布前补登；在此之前保持 `placeholder:true`/`ai.status:none`/placeholder-only license，不得宣称 final |
| C13 | manifest/wrapper 里已有“Ragdoll”字样，但渲染器是 Selkirk | `manifest.json:381` license 写“deterministic Ragdoll cat placeholders … renderer scripts/cat_selkirk.py”；`scripts/gen-cat-anim.py:2,46-47`；`scripts/gen-pet-anim-frames.py:29` | 切布偶正好消除这 4 处矛盾；但**不要**据此认为已换成布偶（盘上像素仍是卷毛） |

## 2. 角色锁定卡（CHARACTER LOCK）

### 2.1 一句话锁定 + 英文身份母版（profile A，可直接用）

一句话：**成年蓝重点双色布偶猫，白为主丝滑半长毛、冷灰蓝连帽/面罩/耳/尾、白色 blaze 从眼睛上方贯穿到白吻白下巴、白胸白爪、蓝眼、无项圈；产品化矮脚；96px 平涂硬边像素、1px 深蓝黑闭合轮廓。**

```text
IDENTITY LOCK (ragdoll cat pet OC, profile A / same-palette replacement of the current Selkirk Rex pack):
original fictional ragdoll cat OC, fictional AI pet character, non-official, no brand affiliation, no real animal, AI concept draft, not final art;
single quadruped cat sprite, full body, adult cat (not a kitten, not a big-headed chibi), default front-facing seated pose; side profile only for walk / run / stand_wag;
white-dominant semi-long silky coat: platinum-ivory body #F1EEE7, bright white top fur #FDFCF7, cool grey shadow #D6D1C7, warm cream chest ruff and feathering #ECE3D5; long guard hairs flow with the body and end in a few soft feather tips, never in curls or cloud puffs;
blue bicolor markings: cool blue-grey #8E9296 continuous cap across the crown and outer face, blue-grey ears #6F7479 with pale inner ear #C9C2B8, blue-grey tail #8E9296 with a darker tip #6B7075; a white inverted-V blaze starts just above the eyes and widens over the nose bridge into the white muzzle and chin; white chest, bib, belly and paws;
large vivid blue oval eyes #5B93E0 with a dark pupil #1E2C44 and exactly one clean 1 px white catch-light #F4F9FF on the upper-left iris, calm adult slightly aloof gaze; small triangular ears with tiny ear tufts; small muted pink nose #C9B6AB; muted slate-mauve paw pads #C4B1A7;
long plumed tail: thick grey base, full feathery plume with 3-4 soft notches and a darker tip, relaxed or swaying, never a tight ring, never short; full feathery britches on the hind legs; round feather-tufted paws;
no collar, no bell, no accessories; no tabby stripes, no orange, brown, ginger, red or seal-point fur; no curly coat, no ringlets, no cloud-puff silhouette;
flat cel shading with 2-3 hard-edged steps, exactly one 1 px closed union outline #0b1220, no internal outline-colour lines, no anti-aliasing, no gradient, hard alpha only, 16-colour limited palette;
96x96 sprite canvas, ground line y=89, foot-centre anchor, transparent background, no ground shadow, no scenery, no text, no logo, no watermark, single character only;
chunky pixel-art concept, readable silhouette at 1x, not final pixel art.
```

### 2.2 LOCK 表（生成/重绘时逐项检查）

| 项 | 锁定值 | @96 像素证据（当前 v11 骨架坐标） |
|---|---|---|
| 品种/年龄 | 布偶猫（blue bicolor），成年猫外观，不幼化 | 头骨椭圆 `(32,12)-(64,38)`；头+耳约 37px；耳尖约 y=8、地线 y=89（总高约 81px，动作帧 ±4px） |
| 毛主色 | 白/象牙 `#f1eee7`（非灰身、非米黄身） | `front_torso` 行 42..78 半宽 17→21→约12；白色占比目标 ≥58% |
| 亮/暗 | 亮 `#fdfcf7`（左上受光 1px）；暗 `#d6d1c7`（右下/远腿/腹下 1px） | 当前 `front_torso` 左侧 light / 右侧 shade 各 1px；新方案保留 |
| 奶油区 | 胸围脖、下巴、爪、腿后羽、尾羽 `#ece3d5` | `front_chest` 围脖 y=40..64 半宽 8→11→5，扇贝下摆 y=65..66 |
| 重点色 | 连帽/眼周/外颊/耳/尾 `#8e9296`；边缘/尾尖/口线 `#6b7075` | `front_head` 连帽椭圆 `(34,11)-(62,19)` + 面罩多边形；尾主色 mask + 深色尾尖 |
| 耳 | 灰尖耳 `#6f7479` + 米色内耳 `#c9c2b8`；布偶耳中等大、圆尖、微前倾 | 正面耳 `(36,8)(31,20)(36,24)(43,19)`；侧视耳 `(26,10+8)(20,26+8)(30,28+8)(32,21+8)` |
| 眼 | 蓝眼 `#5b93e0` 5×5（正面）/4×4（侧视）+ 瞳孔 + 1px 高光；成年、不放大 | 正面眼中心 `(41,25)/(55,25)`；侧视眼中心 `(23,32+8)` |
| 白 blaze | 从**眼睛上方**开始（连帽不被中线劈开），向下变宽到鼻吻/下巴 | 正面 blaze 行 y=19..37，宽度 3px→15px；灰帽中线白色像素 = 0（测试 :699-745） |
| 鼻/肉垫 | 鼻 `#c9b6ab` 3 行；肉垫 `#c4b1a7`（露爪/张嘴内衬） | `front_head` 鼻行 y=30..32 x=46..50；`raised_paw(pads=True)` 露 pad |
| 尾 | 羽状长尾：粗根 9–12px、锥形递减、3–4 个 2–3px 缺口、深色尾尖；不卷成环、不短尾 | 正面尾链 `(63,76)→(72,82)→(81,83)→(87,77)→(87,69)→(83,65)`，宽 9→5；侧视尾根宽 12 |
| 围脖/毛裤 | 胸围脖 2–3 级扇贝；后腿毛裤（britches）2px 羽状；前腿短毛、圆爪羽 | `front_chest`；`_stretch_body` ruff 多边形；侧视后腿羽 |
| 比例/体态 | 产品化矮脚、宽胸、圆臀；头和身体不是幼态大头 | 正面可见前腿 9px、前爪 9px；侧视可见腿 10–14px、躯干深 ≥31 |
| 轮廓 | 1px 闭合 `#0b1220`；内部不用轮廓色；无内部黑线、无封闭透明洞 | 测试 :780-838 全帧断言 |
| 画布 | 96×96 / anchor `(48,96)` / footBox `(-36,-18,72,18)` / 地线 89 | `manifest.json:5-18`；`character.json` |
| 朝向 | 正面坐姿 9 clip；侧视（面向左）仅 walk/run/stand_wag | `draw_selkirk()` 分支（:1386-1412） |
| 道具 | 灰蓝玩具球 `#7f8c99`/`#d3dae1`，只出现在 ball_throw / ball_chase | `front_ball()` :492-496 |
| 人格/声音 | 懒散高冷、慢、克制；空心 thought 气泡、无 TTS、无真人声线 | `manifest.anim.voice`（:297-301）；`regions.json` says |

### 2.3 VARIANT（可变/待拍板，不影响 A 的默认锁定）

- **A1 面罩默认**：v10 连帽 + blaze 从眼上开始（保留用户已验收效果；与 PALETTE-LOCK §4.3.3 的「倒 V 白鼻梁」相容——这是**低起点的倒 V**，不是标准 bicolor 从额头中线劈开）。**A2 标准 bicolor 变体**：白色倒 V 从额头中线更早分叉（更接近 CFA bicolor 图示），只作艺术探索；两者不得混在一包里。若 owner 按 PALETTE-LOCK 字面要求标准倒 V，则切 A2 并同步 `crown/blaze` 测试。
- **身体灰斑**：默认低对比 saddle 斑（左肩 + 右后腰，mask 色，面积减半）；可拍板改为全白（更“白为主”）；不得恢复 Selkirk 参考图的暖色斑。
- **腿长**：默认产品化短腿（与狗/人同风格）；标准 Ragdoll 长腿只作 128/256 另绘或 key art 变体，96 包不采用。
- **尾位**：front 默认卷在右侧地面（沿用现构图，regions tail 命中框不变）；side 默认低垂，run 后扬、stretch 竖立。
- **表情幅度**：默认成年克制（不放大眼、不腮红主特征）；允许 pat_head 2 帧低饱和 cream 颊色（belly 色），不得扩到其他 clip。

### 2.4 禁止漂移（出现任一即打回）

卷毛/云朵毛簇/C 形卷纹（退回 Selkirk）、橙/棕/姜黄/红/赤褐色毛、seal point 暖褐重点、虎斑纹、眼斑/鞍斑以外的深色大面罩、短毛/光滑短毛、短尾/无尾/细鞭尾/尾卷成环、折耳/狗耳/裁耳、幼猫大头/chibi、腮红主特征/心形瞳/泪光/湿眼、项圈/铃铛/衣服/饰品、第二角色/人类手/人形站姿、真实猫照片/3D/写实毛发/渐变/半透明/AA、文字/Logo/水印/UI/地面阴影/家具/食盆、官方 DeepSeek 元素、真人声线/TTS。

### 2.5 历史差异速查（旧占位 / 白布偶 OC / 当前 Selkirk / 目标布偶）

| 项 | 旧占位（作废） | 白布偶 OC（2026-11-17，C） | 当前运行资产（B） | 目标（A） |
|---|---|---|---|---|
| 品种 | 姜黄虎斑猫 | 白布偶 | 塞尔凯克卷毛猫 | **布偶（blue bicolor）** |
| 毛色 | 姜黄虎斑 + 红项圈金铃 | 白为主 + 蓝灰重点 | 白/米 + 灰重点（无暖色毛） | **白为主 + 冷灰蓝重点（同 B 的 16 hex）** |
| 毛型 | 短毛 | 长毛顺滑 | 卷毛（云朵簇 + 卷纹） | **半长毛丝滑（直毛、羽状边）** |
| 帧契约 | 7 tags / 36 帧 | 7 tags / 36 帧 | **12 clip / 72 帧** | 12 clip / 72 帧（不变） |
| 比例 | 常规 | 标准成年 | 产品化短腿 | 产品化短腿（同 B） |
| 状态 | 已不被 `pet-cat` 引用（文件仍在） | 提案，未落地 | 当前盘上 | 本包目标 |

## 3. 配色映射（同配色 = 16 hex diff 0）

### 3.1 权威映射表（现行 Selkirk 用途 → 布偶新语义）

> 数据源：`scripts/cat_selkirk.py:38-56`（`CAT_COLORS`）与 `tests/pet-anim-cat.test.ts:46-66`（测试内 16 色常量）**逐 hex 对照，16/16 完全相同**。本方案**不新增、不删除、不修改任何一个 hex**，只重定义 role 的解剖用途。

| role | hex | 现行 Selkirk 用途 | 布偶新用途（解剖语义） | @96 位置证据 | 面积/配额目标 |
|---|---|---|---|---|---|
| `outline` | `#0b1220` | 唯一 1px 外轮廓 | 同（不变） | 全帧 union outline | 9–11% |
| `body` | `#f1eee7` | 白/冷白底毛 | 白色身体主毛（头/躯干/腿/尾根白区） | `front_torso` 行 42..78；`side_torso` 主体 | 34–40% |
| `light` | `#fdfcf7` | 亮毛/高光 + **白 blaze 行** | 白 blaze（必须继续用 light 画，否则 crown/blaze 测试失效）+ 左上 1px 高光 | `front_head` blaze 行 y=19..37（:553-557）；`front_torso` 左侧 1px | 6–9% |
| `shade` | `#d6d1c7` | 冷灰阴影/远腿 | 同（布偶左光右影；长毛 1px 阴影流向） | `front_torso` 右侧 1px；侧视远腿 | 6–9% |
| `belly` | `#ece3d5` | 奶油胸毛/爪/尾羽 | 胸围脖 ruff、下巴、爪、腿后羽、尾羽、pat 允许的 cream 颊色 | `front_chest` y=40..64；下巴 y=38..40；`belly` 尾羽行 | 10–15% |
| `mask` | `#8e9296` | 灰色面罩/耳/身体灰斑/灰尾 | **冷灰蓝重点**：连帽（head cap）、外颊/眼周面罩、耳外侧、尾主毛、**saddle 斑（可选）** | 连帽椭圆 `(34,11)-(62,19)`；尾链 | 15–21% |
| `mask_dark` | `#6b7075` | 面罩暗边/口线/闭眼线 | 重点色深阶：面罩内缘 1px、口线/嘴内衬、闭眼线（**不得用 outline 画闭眼**）、尾尖 | `front_head` edge 行 y=20..37；`mouth` 线 | 1–3% |
| `ear` | `#6f7479` | 深灰耳/尾尖 | 耳外侧重点色 + 尾尖深色块；布偶耳中等大、圆尖微前倾 | 正面耳多边形；侧视耳多边形 | 3–5% |
| `ear_inner` | `#c9c2b8` | 米灰内耳 | 浅色内耳（布偶耳内为浅色/白毛） | 正面/侧视内耳多边形 | 1–3% |
| `eye` | `#5b93e0` | 蓝色虹膜（唯一冷色） | **布偶蓝眼**（品种特征，必须保留）；开/半/侧/睁大帧可见 | 正面 5×5 @ `(41,25)/(55,25)`；侧视 4×4 @ `(23,40)` | 0.4–0.8% |
| `eye_hi` | `#f4f9ff` | 1px 眼高光/星光 | 每眼恰好 1px 高光 + 允许的星光 FX | 虹膜左上 1px | <0.1% |
| `pupil` | `#1e2c44` | 瞳孔 | 同（竖瞳/圆瞳均不放大） | 眼中央 1–3px | <0.2% |
| `nose` | `#c9b6ab` | 鼻/口线 | 鼻头（布偶鼻色浅、灰粉皆可；本包固定此 muted mauve） | 正面鼻行 y=30..32 x=46..50 | <0.4% |
| `pad` | `#c4b1a7` | 肉垫/张嘴内衬 | 露爪肉垫 + 张嘴内衬（不得当腮红/大面积粉） | `raised_paw(pads=True)`；`mouth=open` | <0.2% |
| `ball` | `#7f8c99` | 玩具球主体 | 灰蓝玩具球（只 ball_throw/ball_chase） | `front_ball` 8×8 | 0.1–0.3%（仅 11 帧） |
| `ball_hi` | `#d3dae1` | 球高光 | 球高光 1–3px | 球左上 | <0.1% |

**同配色证明**：`CAT_COLORS`（`cat_selkirk.py:38-56`）与测试常量（`tests/pet-anim-cat.test.ts:46-61`）的 16 个 hex 完全一致；本包只把 `mask/mask_dark/ear/ear_inner` 从“卷毛灰毛”重读为“**blue point 重点色**”，把 `belly` 重读为“**ruff/羽状边**”。本表与 `PALETTE-LOCK-2026-11-20.md` §4.1（猫 96 A，16 色）**16/16 逐 hex 一致**（2026-11-20 对照）——两份文件不得各自漂移。`palette` id 是否改名见 §3.4（**hex 不变**）。

### 3.2 用色规则（硬）

1. **白为主双口径**：PALETTE-LOCK §4.3.4 硬门 = body+light+shade+belly **≥60%**（当前 63.9%）；本文更细的白区目标 = **body+light+belly 58–66%**（当前 56.1%，shade 不计入）；两口径同时成立才算过。布偶是“白为主 + 重点色”，不是灰猫。
2. **重点色 18–24%**（mask+mask_dark+ear+ear_inner；当前 24.5%）；重点只允许在头部连帽/面罩/耳/尾/可选 saddle 斑，**不得整身成灰**。
3. **outline 9–11%**（当前 10.3%）；轮廓只用于闭合外轮廓，内部不得出现 outline 色（测试 :780-838 断言 internal black = 0）。
4. **eye 0.4–0.8%**（当前 0.65%）；闭眼/睡眼帧可 0；蓝眼是唯一冷色，不得新增第二种冷色。
5. **光向固定左上**：light 只出现在左上受光边/blaze/眼高光；shade 只出现在右下/远侧/腹下。每材质 2–3 阶硬边，禁 dither/渐变/第二光源。
6. **暖色毛红线不变**：复用现测试阈值 `r - g > 25 && g - b > 10` 拒绝橙/棕/粉毛（`tests/pet-anim-cat.test.ts:492-499`）；nose/pad 在该阈值下合法，但不得扩大面积。
7. **每帧 ≤16 色**（role 全用满 16 上限；anim 门禁 ≤20）；不得为“长毛毛流”新增中间色——毛流只能用现有 light/shade/belly 表达。

### 3.3 色数预算与当前实测分布

| role | 当前逐帧 min | 当前逐帧 max | 出现帧数 | 说明 |
|---|---:|---:|---:|---|
| `body` | 840 | 2,102 | 72/72 | 白区主毛，目标提高 |
| `mask` | 181 | 784 | 72/72 | 连帽+面罩+尾+可选 saddle 斑 |
| `belly` | 203 | 498 | 72/72 | 围脖/羽/下巴/爪 |
| `light` | 149 | 234 | 72/72 | blaze/高光 |
| `shade` | 162 | 378 | 72/72 | 阴影 |
| `ear` | 96 | 141 | 72/72 | 耳/尾尖 |
| `ear_inner` | 44 | 84 | 72/72 | 内耳 |
| `mask_dark` | 20 | 68 | 72/72 | 面罩暗边/口线/闭眼线 |
| `outline` | 290 | 376 | 72/72 | 1px 外轮廓 |
| `eye` | 0 | 40 | 67/72 | 闭眼/睡眼帧为 0 |
| `eye_hi` | 0 | 15 | 67/72 | 星光/高光帧 |
| `pupil` | 0 | 6 | 65/72 | 瞳孔 |
| `nose` | 2 | 12 | 72/72 | 鼻 |
| `pad` | 0 | 20 | 18/72 | 露爪肉垫/张嘴内衬 |
| `ball` | 0 | 52 | 11/72 | 只 2 个 ball clip |
| `ball_hi` | 0 | 3 | 9/72 | 球高光 |

- 实测 `--verify`：每帧 maxcolors=16；测试要求每帧 ≤20 且全包并集 14–16 色（`tests/pet-anim-cat.test.ts:469-503`）。
- 新方案**不新增 role**；如果实现时觉得 16 色不够表达长毛毛流，正确做法是**用 shade/light 的 1px 线段**，不是加色。

### 3.4 palette id / 换名矩阵（PALETTE-LOCK §4.3.1：默认沿用旧 id；改名需 owner 拍板，hex 不动）

| # | 文件:行 | 当前 | 改法 |
|---|---|---|---|
| 1 | `scripts/gen-cat-anim.py:43` | `PALETTE_ID = "cat-selkirk-anim@0.1"` | 改 `cat-ragdoll-anim@0.1` |
| 2 | `public/assets/pet/anim/cat/manifest.json:20` | `cat-selkirk-anim@0.1` | 随生成器重生成 |
| 3 | `public/characters/pet-cat/character.json:38` | 同上 | 同步 |
| 4 | `tests/pet-anim-cat.test.ts:359` | `assert.match(manifest.palette, /^cat-selkirk-anim@/)` | 改正则 |
| 5 | `tests/default-packs.test.ts:97` | `palette: 'cat-selkirk-anim@0.1'` | 同步 |
| 6 | `tests/hero-multichar-integration.test.ts:85` | 同上 | 同步 |
| 7 | `docs/content-packs/examples/cat.anim.example.pack.json:103` | 同上 | 同步（示例） |
| 8 | `docs/content-packs/ANIM-PACK-0.2.md:112` | 同上 | 同步（文档） |
| 9 | `docs/content-packs/CAT-DESIGN-REFERENCE.md:81` | 同上 | 同步（设计参考） |

- **owner 已拍板（2026-11-20，task-149）**：改名 `cat-ragdoll-anim@0.1`，**16 个 hex 一个不动**。上表 1–6 消费点已在同一变更集同步（生成器 / manifest / character.json / 3 个测试；`tests/hero-multichar-integration.test.ts` 的 palette 常量也属必要消费点同步）。示例/预算文档（上表 7–9）与插件 re-embed 不在 task-149 授权范围（不得改插件），由后续任务按同一 id 收尾。
- **理由**：manifest license 与生成器 docstring 本来就写着“Ragdoll”，改名后物种/色板/文档一致；palette 只是元数据（渲染不读取），风险低。
- **硬规则**：**palette 的 16 个 hex 都不允许变**；改名必须与像素重生成放在同一个变更集，避免消费方读到一半新一半旧。

### 3.5 禁用色 / 禁用件

- 禁用色：橙/棕/姜黄/红/赤褐（seal point 需要暖褐，故本包只做 blue point）、粉红毛、纯黑 `#000000`、纯白 `#FFFFFF`、调色板外任何 hex、渐变/AA/半透明像素。
- 禁用件：项圈/铃铛/金牌/衣服/蝴蝶结/背带；人类手；第二角色；文字/气泡/UI；地面阴影/家具/食盆；官方 Logo/字标。

## 4. 像素规格（PIXEL SPEC）

### 4.1 画布与几何

| 项 | 值 | 来源 |
|---|---|---|
| canvas | `96 × 96` RGBA，四角透明 | `manifest.json:5-8`；`tests/pet-anim-cat.test.ts:452-467` |
| anchor | `{ x: 48, y: 96, mode: foot-center }` | `manifest.json:9-13` |
| footBox | `{ x: -36, y: -18, w: 72, h: 18 }` | `manifest.json:14-19` |
| content bbox（advisory） | 当前并集 `(2,4)–(94,89)`；实现后应仍在 `1..94` 内（右边界 1px 为接受口径） | `--verify` bbox 边距 2/4/1/6 |
| 地线 | **每帧最低不透明像素 = y=89；y=90–95 恒透明** | 测试 :465；`--verify` bottoms |
| 显示 | `display.scale=2`、`pixelated`（`character.json`） | 运行时 2× = 192 CSS；插件按 72px 显示 |

### 4.2 alpha / 轮廓 / FX 硬规则

1. **硬 alpha**：只有 0/255；禁半透明/羽化/抗锯齿（测试 :459 `alphaOnly`）。
2. **唯一 1px 闭合外轮廓 `#0b1220`**：主剪影边界不透明像素必须全是轮廓色（测试 :780-838 断言 `mainGap=0`）；禁 2px 外描边/断线/双线。
3. **无内部黑线**：outline 色不得出现在非边界像素（测试 `internalBlack=0`）；眼线/口线用 `mask_dark`，闭眼用 `mask_dark`/fur tone，**不用黑线**。
4. **无封闭透明洞**：`holes=0`（测试 :816-823）。长毛羽状缺口必须在轮廓外缘，不能形成内部封闭空洞。
5. **FX 规则**：星光/尘土/冲击条在 union outline 之后绘制，亮芯 + 色边、**无 outline 色**；detached 组件 ≤64px（球 ≤90px）且 ≤8 色（测试 :803-814）。
6. **同侧肢体遮挡**：抬爪/抬腿帧同侧地面爪不得重复绘制（测试 :845-888）。
7. **walk 每帧恰好 1 爪离地**（生成器 `--verify` 断言 `[1]*8`）；跑/伸懒腰不穿地。

### 4.3 帧表（唯一源：`src/pet/anim/timing.json`）

| # | clip | 帧@fps | loop | duration | layer/priority | 视角 | 可达性（2026-11-20） |
|---|---|---|---|---|---|---|---|
| 1 | `idle` | 6@6 | loop | 1000ms | base/0 | 正面 | 基础循环 + ambient |
| 2 | `idle_blink` | 3@12 | one-shot | 250ms | overlay/10 | 正面 | 眨眼调度（慢半闭→闭→半闭） |
| 3 | `walk` | 8@10 | loop | 800ms | base/5 | 侧视（左） | **spec-only 冻结**（manifest `anim.specOnly`） |
| 4 | `run` | 6@14 | loop | 429ms | base/15 | 侧视（左） | 可达：hero run / 插件「跑一跑」 |
| 5 | `pat_head` | 4@8 | one-shot | 500ms | oneshot/50 | 正面 | 可达：head tap / pat |
| 6 | `ball_throw` | 5@10 | one-shot | 500ms | oneshot/40 | 正面 | hero 抛球路径（插件猫无球类面板动作） |
| 7 | `ball_chase` | 6@12 | one-shot | 500ms | oneshot/45 | 正面 | hero 追球路径 |
| 8 | `paw_face` | 5@8 | one-shot | 625ms | oneshot/20 | 正面 | ambient 微动作 + 「洗脸」 |
| 9 | `scratch` | 6@8 | one-shot | 750ms | oneshot/20 | 正面 | ambient 微动作 |
| 10 | `stand_wag` | **10@6** | one-shot | **3200ms** | oneshot/20 | 侧视 | ambient + body tap + 「伸懒腰」 |
| 11 | `chase_tail` | 6@10 | one-shot | 600ms | oneshot/20 | 正面 | ambient + tail tap + 「追尾巴」 |
| 12 | `attack` | 7@16 | one-shot | 439ms | oneshot/60 | 正面 | **spec-only 冻结**（无 UI/区域/插件入口） |

- 合计 **72 帧**；`assets` 顺序 = tag 顺序 = `timing.json.order`。
- 本包不新增/不删除 clip；帧数/fps/loop/holdMs 一律不变（**换品种 ≠ 改节奏**）。

### 4.4 非均匀节奏（不可平均化）

**stand_wag（cat 专属 10 帧伸懒腰）**：`holdMs = [300,300,300,350,400,400,400,350,250,150]`，总 **3200ms**（`timing.json:108-136`；`tests/pet-anim-cat.test.ts:388-406`）。帧语义：f0 正常站姿 → f1 抬头尾起 → f2 前爪前滑 → f3 压胸 → f4 前趴后翘全伸展 → f5 打哈欠张嘴 → f6 哈欠保持闭眼 → f7 开始收 → f8 拉回 → f9 回站姿半闭眼。

**attack**：`holdMs = [83,83,63,42,42,63,63]`，总 439ms（局部 FPS 约 12.05/15.87/23.81）。帧语义：f0–f1 蓄力慢 → f2 过渡 → f3–f4 命中快帧（右前爪横拍 + 冲击条）→ f5–f6 收招。

### 4.5 包布局 / 命名 / manifest 契约

```text
public/assets/pet/anim/cat/
  manifest.json
  <clip>/<clip>_NN.png      # NN = 00 .. frames-1，两位补零；12 个 clip 目录
```

- 目录恰好 **72 PNG + manifest.json = 73 文件**；不得有旧帧/临时帧/缩略图残留。
- `manifest.assets` 顺序 = tag 插入顺序 = `timing.json.order`；新增/删除帧必须同步 manifest、生成器、测试。
- manifest 必须保持：`id=pet.cat.anim.placeholder`、`style: pixel-hero`、`formatVersion: 1`、canvas/anchor/footBox、`placeholder: true`、`ai: {status: none}`、`license`（placeholder-only 文案需从 Selkirk 改布偶）、`palette`（§3.4）、`sourceSpec/generator: scripts/gen-cat-anim.py`、`anim` 块（clips/holdMs/fpsBands/tracks/bubblePolicy/voice/specOnly）。
- 气泡/语音：`voice = {mode: none, canTts: false, bubble: thought}`；**帧里不得有文字/对话气泡**，气泡是运行时 UI。
- 包体积 <500KB（当前 172,426 B）。

### 4.6 96 → 128/256 升级规则

- **禁止把 96 直接整数放大**（128 = 1.333×、256 = 2.667×，非整数）；128/256 必须另绘。
- 若升级：anchor = `(W/2, H)`、footBox = `(-0.375W, -0.1875H, 0.75W, 0.1875H)`（96 时即 `(-36,-18,72,18)`）；地线按新画布重定（96 的 89 = `H−7`，128/256 若沿用 `H−7` 需重新验收）；bbox 按外扩后重算。
- 帧数/tag/时序契约与 96 一致；换画布要同步 `character.json` canvas/anchor/footBox/bbox 与测试，不能只换图。
- 布偶长毛在 128/256 才接近“丝滑长毛”的可读密度；96 的验收口径仍是“1x 剪影可读”，不是“看清毛丝”。

### 4.7 绘制几何速查（当前 v11 基线；布偶只改毛/尾/面罩语义，不动骨架比例）

| 部件 | 正面（front） | 侧视（side，面向左） |
|---|---|---|
| 地面 | y=89；前爪/后爪底行 89；front paw 9px 宽 | y=89；side paw 12–13px 宽、脚趾朝前（-x） |
| 头部 | 头骨椭圆 `(32,12)-(64,38)`；连帽椭圆 `(34,11)-(62,19)`；头+耳约 37px | 头骨 `(9,21+8)-(32,45+8)`；侧头 bbox 约 25×23 + 8px SIDE_DROP |
| 眼 | 5×5 @ 中心 `(41,25)/(55,25)`；1px 高光；竖瞳 1×3 | 4×4 @ `(23,40)`（32+8）；1px 高光 |
| 鼻/嘴/下巴 | 鼻 y=30..32 x=46..50；口线 y=35..36；奶油下巴 y=38..40 | 鼻 screen y=44..46（代码 36+hy，hy 含 SIDE_DROP=8）x≈3..5；白吻/白下巴；短口线 |
| 耳 | 耳 `(36,8)(31,20)(36,24)(43,19)` + 内耳；耳根 1px shade | 耳 `(26,18)(20,34)(30,36)(32,29)` + 内耳；耳根 1px shade |
| 躯干 | 行 42..78，半宽 17→21→约12（短腿短身） | 背线约 y=41（33+8）、腹线约 y=77（69+8）；胸/臀椭圆各 +8；body depth ≥31 |
| 前腿/前爪 | 腿 x=34..42 / 53..61（9px），paw 9px @ y=83；抬起 paw 7×7 | 肩→肘→腕三段；前腿可见 10–14px；侧 paw 12px |
| 后臀/后爪 | 椭圆 `(25,56)-(43,82)` / `(53,56)-(71,82)`；后爪 7×6 @ y=83 | 髋→膝→跗→系四段；后腿可见 10–15px |
| 胸围脖 | `front_chest` y=40..64 半宽 8→11→5；扇贝下摆 y=65..66 | `STAND_RUFF`/`STRETCH_RUFF` 多边形；侧视颈胸连接处 2 层 shade 线 |
| 尾 | 链 `(63,76)→(72,82)→(81,83)→(87,77)→(87,69)→(83,65)`，宽 9→5；深色尾尖 | 尾根 x≈69；low/stream/up 三型；尾根宽 12 |
| 身体灰斑 | 左肩 `patch_l` `(28,52)…(26,57)`；右后腰 `patch_r` `(58,60)…(56,65)`（A 方案可减半/可选） | 侧视无独立 saddle 斑（布偶侧身白为主） |

> 这些坐标是**当前 Selkirk v11 骨架**，布偶沿用不动；只有毛簇/卷纹/耳朵边缘卷毛/尾部环簇会被替换（§4.8）。实现任务应以 `scripts/cat_selkirk.py` 为新渲染器起点，不要重写骨架。

### 4.8 直长毛像素语法（本包核心：解决卷毛难点）

#### 4.8.1 为什么“换品种”本身不自动解决像素毛感

盘上卷毛的难点不是颜色，而是**毛簇参与剪影**：`curl_puff()` 在轮廓上叠 3–5px 云朵簇，`ringlet()` 在毛面内画 3px C 形卷纹（`scripts/cat_selkirk.py:252-280`），最终 union outline 把云朵状凸起全部包成外轮廓。直接删掉毛簇会得到一只**光滑短毛猫**（不是布偶）；继续画卷纹则退回 Selkirk。因此必须换一套**直长毛原语**。

#### 4.8.2 六个原语（F1–F6，全部用现有 16 色）

| # | 原语 | 规则 | 允许位置 | 像素预算 |
|---|---|---|---|---|
| **F1** | 平滑主剪影 | 主体轮廓只允许在 4 个毛区出现凹凸：胸围脖、腹线、后腿毛裤、尾羽；其余段每 2px 的斜率变化 ≤1px；耳/爪/尾缺口仍是合法轮廓特征 | 全身 | 毛区外凹凸 = 0 |
| **F2** | 1px 毛流 | 大色块左上 1px `light` 顺毛线 + 右下 1px `shade` 反光/投影线；每条长度 3–8px、断开、不闭合；每块大形 ≤2 条 | 头/躯干/尾/腿 | 每帧毛流线 ≤10 条 |
| **F3** | 围脖 ruff | 2–3 级阶梯扇贝（不是云朵圆包）：`belly` 填、下缘 1px `shade`、尖端 1–2px 向下；正面 y≈40–66、侧视颈胸 | 胸/颈 | 扇贝 2–3 级，每级 3–6px 宽 |
| **F4** | 羽状尾 plume | 粗根（正面 9px / 侧视 12px）→ 锥形递减 → 3–4 个 2–3px 缺口 → 深色尾尖；尾主色 `mask`，内侧 `belly` 羽 1–2px，尾尖 `mask_dark`/`ear`；**不画环形卷纹** | 尾 | 缺口 3–4 个；尾面积不低于现测试值 |
| **F5** | 腿羽/毛裤 | 后腿后缘 2px 三角羽（`belly`）；前腿外侧 1px 毛边；**不得加宽脚底着地宽度**（测试按 x 区/行宽断言） | 腿后/关节 | 每腿 ≤3 片羽 |
| **F6** | 面部重点 | 连帽/面罩/白 blaze/蓝眼全部沿用 v10 规则；额外只允许：耳尖 1–2px 毛簇、颊部 1px 白毛、胡须根 1px `shade`；**不得**用卷毛遮住 blaze | 头 | 面部毛簇 ≤4 处 |

#### 4.8.3 绘制顺序

```text
1) 骨架色块（body/mask/belly/shade 基础形，沿用现 front/side 骨架）
2) 重点色/白 blaze/眼/鼻/口（v10 面罩与 blaze 规则不变）
3) F3 围脖 + F4 羽状尾 + F5 腿羽（先画毛再统一描边：羽状凸起会进入剪影）
4) F2 毛流（内部 light/shade 线段，最后画在色块上）
5) F1 检查：剪影平滑度/毛区预算（脚本或测试）
6) Canvas.finalize() 统一填封闭洞 + 生成 1px union outline
7) FX（星光/尘土/冲击条/球，描边后绘制，亮芯+色边、无 outline 色）
```

#### 4.8.4 与当前卷毛实现的替换映射（实现任务按此改）

| 当前（Selkirk） | 行号 | 布偶替换 | 说明 |
|---|---|---|---|
| `curl_puff()` 全轮廓云朵簇 | `cat_selkirk.py:252-260` | F1 平滑剪影 + F3/F4/F5 局部羽状 | 删除全周 puffs；仅 4 毛区保留“羽” |
| `ringlet()` / `ringlet_patch()` C 形卷纹 | `:266-279` | 删除；用 F2 毛流替代 | 不保留任何卷纹符号 |
| `front_tail()` 尾链 + 每节 puffs + ringlet | `:300-335` | F4 front plume：粗根→锥形→3–4 缺口→深色尾尖 | 尾主体仍 mask + belly 羽 |
| `front_curl_tail()` 追尾卷环 | `:336-365` | F4 变体：尾绕到前右爪旁但**保持羽状**（不卷成环） | chase_tail 语义不变 |
| `front_hind()`/`front_legs()` 的 ankle puffs | `:366-431` | F5 腿羽 2px 三角，不改变地面爪宽 | 保留同侧遮挡逻辑 |
| `front_chest()` 奶油扇贝围脖 | `:432-453` | F3 围脖：保留 2–3 级扇贝 + 1px shade 下缘 | 几何可沿用 |
| `front_head()` 头部/耳/颊 puffs + ringlet | `:533-643` | F6 面部重点：删头部 puffs/ringlet；只留耳尖/颊 1–2px 毛 | v10 连帽/blaze 行保持 |
| `decorate_front_body()` 云朵躯干 puffs + 灰斑 | `:644-676` | F1 平滑躯干 + F2 毛流；灰斑降为低对比 saddle（可选） | 白区占比上升 |
| `side_torso()` 背/腹 puffs + ringlet | `:990-1021` | F1 平滑背/腹线 + F3/F5 腹缘/腿羽 | 躯干深度 ≥31 保持 |
| `side_tail()` 尾链 + 双侧 puffs + ringlet | `:1024-1059` | F4 side plume（low/stream/up 三型，3–4 缺口） | tailArea ≥400 保持 |
| `side_neck()` 卷毛围脖 | `:1062-1080` | F3 ruff 2 层扇贝 + 颈胸 1px shade 线 | 头颈连接更清楚 |
| `side_head()` 灰帽/面罩 puffs + ringlet | `:1083-1161` | F6 面部重点（保留侧脸 blaze/蓝眼/耳） | 侧视不画卷毛脸 |
| `_stretch_body()` 弓背毛簇 | `:1239-1291` | F1/F3/F2：平滑弓背 + 腹缘羽 + 1px 毛流 | 10 姿势表不变 |

#### 4.8.5 失败模式（出现即打回）

- 删卷毛后没有新增羽状锚点 → 读成短毛猫/无毛猫；
- 用“锯齿轮廓”冒充长毛 → 1x 下是噪点，轮廓 bump 过高；
- 用 outline 色画毛丝 → 内部黑线/洞测试失败；
- 尾羽变成“扫帚/鱼骨/螺旋” → 不读布偶 plume；
- 围脖盖住 blaze/下巴 → 白区与重点识别失败；
- 毛区超过 4 处 → 剪影回到 Selkirk 的毛球感；
- 为了“毛量”加色 → 超出 16 色/调色板测试失败。

### 4.9 卷毛实测 → 直长毛目标指标（验收对照）

| 指标 | Selkirk 基线（72 帧实测） | profile A 目标 | 本轮实现实测（task-149） | 结论 |
|---|---|---|---|---|
| 圆度（主剪影） | min 2.08 / max 2.77 / avg 2.52 | 1.15–1.60 | **min 2.01 / max 2.53 / avg 2.32** | 96px 骨架下限约 2.0，1.6 不可达；门禁校准为 avg ≤2.35、单帧 ≤2.55（§10.3） |
| 四向轮廓 bump | min 13 / max 40 / avg 30.6 | 4–10 | **min 4 / max 10 / avg 6.3** | 达成（每帧 4–10 已写进测试） |
| 正面剪影 | 云朵头 + 球状尾 | 光滑头/躯干 + 耳/颊羽 + 右侧尾羽 | 平滑头/躯干；front tailArea 261–564px | 达成 |
| 羽状尾 | 卷环 + 云朵簇 | 粗根 9–12px、3–4 缺口、深色尾尖；side `tailArea ≥400` | front tailArea ≥200 + ≥2 个奶油羽瓣 + 深色尾尖 ≥6px；side walk/run tailArea 440–577 | 达成 |
| 围脖 | 云朵胸毛 | 2–3 级扇贝 + 1px shade 下缘；胸区 belly ≥180px | 3 级扇贝；胸区（x40–56,y40–68）belly 289–330px | 达成 |
| 腿/爪 | 侧腿 12–14px、前爪 9px | 不变（10–15px / 前爪 ≥8px 区宽） | walk/run 可见腿 10–12px；前爪 ≥8px | 不变 |
| 躯干体积 | depth ≥31、bodyArea ≥1300 | 不变 | depth 38–51、body 1513–1835 | 不变 |
| 白区占比 | body+light+belly 56.1% | 58–66% | **avg 60.1%（53.5–69.8%）** | 达成（PALETTE-LOCK 含 shade 口径同步达标） |
| 重点色占比 | 24.5% | 18–24% | **avg 20.0%（9.6–25.6%）** | 达成（闭眼/侧视帧偏低属正常） |
| 蓝眼 | 67/72 帧可见 | ≥60/72；闭眼/睡眼帧 0 | **67/72** | 达成 |
| 唯一帧 | 72/72 | 72/72 | **72/72** | 达成 |
| 硬门（不变） | 96×96、硬 alpha、y=89、1px 闭合轮廓、无洞、无内部黑线、同侧遮挡、walk 1 爪离地、≤20 色/帧、≤500KB | 全部不变 | 全部通过（`--verify` FAILS: none；包 145,810 B） | 达成 |

> 圆度/bump 的目标区间是**首轮实施建议值**，需要在第一次重绘后用 contact sheet + 实测校准；验收时以“能通过 5 秒剪影 + 不退回卷毛”为准，避免把阈值当成美术目标本身。

### 4.10 为什么这套语法能解掉 P1–P5

| 卷毛难点 | 直长毛解法 | 效果 |
|---|---|---|
| P1 剪影全周波浪，头/身/尾粘成团 | F1 平滑主剪影 + 只在 4 毛区加羽 | bump 30.6→4–10；1x 头身分界清楚 |
| P2 尾读成灰球/螺旋 | F4 羽状尾：粗根/锥形/3–4 缺口/深色尖 | 尾成为布偶第一识别锚点；tailArea 保持 |
| P3 面部被“帽+卷”吃掉 | F6 保留 v10 连帽/blaze，删头部毛簇；耳尖/颊 1–2px 羽 | 蓝眼 + 白 blaze 在 1x 可读 |
| P4 逐帧毛簇重画/遮挡复杂 | F2 毛流是短线、位置可复用；羽状只在 4 区 | 每帧轮廓控制点大幅减少；同侧遮挡更简单 |
| P5 测试锁死卷毛 | silky 指标替换卷毛指标（§4.9） | 门禁可量化，且能防止偷偷退回短毛/Selkirk |

## 5. 表情库（EXPRESSION LIBRARY）

### 5.1 眼状态（7 种，取自 `front_head()` / `side_head()`）

| 名称 | 正面像素配方 | 侧视画法 | 语义 | 使用 clip（当前代码数组） | 英文 prompt 短语 |
|---|---|---|---|---|---|
| `open` | 5×5 蓝眼 + 1×3 瞳孔 + 1px 高光 + 下眼睑 1px shade | 4×4 蓝眼 + 1px 高光 | 平静、直视、成年 | idle f0/f1/f5、walk、scratch f0、stand_wag f0–f4 | calm open blue eyes with one 1 px catch-light |
| `half` | 上排收起、下排蓝眼 5px + 瞳孔 + 高光 | 2 行蓝眼 + 1px 上缘 shade | 放松/懒 | idle f4、walk f1/f4/f7、pat f1/f3、scratch f1/f2/f3/f5、ball_throw f4、ball_chase f4/f5、paw_face f0/f3/f4、chase_tail f3/f4、stretch f7–f9 | relaxed half-closed eyes |
| `sleepy` | `mask_dark` 上眼睑 2 行 + 2 行蓝眼 + 瞳孔/高光 + 眼角 shade | — | 困/慢眨眼 | idle f2/f3、idle_blink f0/f2 | sleepy half-lidded eyes, fur-tone lids |
| `closed` | fur-tone/`mask_dark` 单行闭眼线（**不是 outline 黑线**） | 1 行 `mask_dark` | 闭眼/享受 | idle_blink f1、paw_face f1/f2、scratch f4、chase_tail f5、stretch f6 | closed eyes, one fur-tone line, no black line |
| `happy` | 4px 上弧线（^^） | 3px 上弧 | 开心（克制） | pat_head f2 | happy squint arc eyes, restrained |
| `wide` | 5×5 蓝眼 + 2px 高光/加宽 | 侧视按常规杏仁眼画（`side_head` 无独立 wide 分支） | 警觉/兴奋 | ball_throw f0/f1、attack f0–f4、run f0–f4 | wide alert eyes (front), full open almond (side) |
| `side` | 5×5 蓝眼 + 侧向瞳孔 | — | 侧看/专注 | ball_throw f2/f3、ball_chase f0–f3、chase_tail f0–f2 | eyes glancing to the side |

### 5.2 嘴状态（3 种）

| 名称 | 像素配方 | 语义 | 使用 clip |
|---|---|---|---|
| `closed` | 鼻下 5px 短弧线（`mask_dark`），闭嘴 | 平静默认 | 大多数帧 |
| `smile` | 6px 上弧线（`mask_dark`） | 轻微满足 | pat f2/f3、scratch f4/f5、stretch f9、attack f5、idle_blink f2 |
| `open` | `mask_dark` 椭圆口腔 + `pad` 内衬 2 行（不画舌头；猫不喘舌） | 哈欠/叫/拍击 | paw_face f0、ball_throw f1、ball_chase f2/f3、chase_tail f1/f2、stretch f5/f6、attack f1–f4 |

### 5.3 修饰符（modifiers）

| 名称 | 配方/规则 | 允许范围 |
|---|---|---|
| 颊色 `cream cheek` | `belly` 2×2 两颊（低饱和奶油，不是粉红腮红） | **仅 pat_head f2/f3**；不得扩到其他 clip |
| 星光 `spark` | 1–2px 菱形/点 `#f4f9ff`，FX 后绘、无黑边 | pat_head f2（头两侧 + 头顶）；stretch f4/f6（尾侧 1 处） |
| 尘土/速度线 `puff`/`dash` | 1–2px 短线/点 `#f4f9ff`，后绘无黑边 | run f0/f3（puff）、run f0/f2/f3/f4（dash）；不得成尘云 |
| 冲击条 `bar` | 8px 竖短线（亮芯 + 色边） | attack f3/f4 右侧 |
| 球 `ball` | 8×8 圆 `#7f8c99` + `#d3dae1` 左上高光 | 只 ball_throw（右上→右下）、ball_chase（右下→左下） |
| 位移 | 整数 px；头部 ≤4px、身体 ≤3px、尾 ≤3px；不得非整数 | 全部 clip |

### 5.4 表情 × clip 矩阵（逐帧，生成/验收对照）

| clip | 眼序列 | 嘴序列 | 附加 |
|---|---|---|---|
| idle | open, open, sleepy, sleepy, half, open | closed ×6 | 呼吸/耳/尾小幅；f2–f4 慢眨眼段 |
| idle_blink | sleepy, closed, sleepy | closed, closed, smile | 只动眼/嘴，身体基本保持 |
| walk | open, half, open, open, half, open, open, half | closed ×8 | 侧视；每帧恰 1 爪离地；尾低垂 |
| run | wide ×5, half | open ×5, closed | 侧视；body 下压；尾后扬；puff/dash FX |
| pat_head | open, half, happy, half | closed, closed, smile, smile | 颊色 f2/f3；spark f2 ×3 |
| ball_throw | wide, wide, side, side, half | closed, open, closed, closed, closed | 球 (84,16)→(74,82)；f4 右前爪 reach |
| ball_chase | side ×4, half ×2 | closed, closed, open, open, closed, closed | 球 (70,84)→(50,84)；f2/f3 右前爪 reach |
| paw_face | half, closed, closed, half, half | open, closed, closed, smile, smile | 左前爪全程抬起（同侧地面爪隐藏）；f0 露 pad |
| scratch | open, half, half, half, closed, half | closed ×4, smile ×2 | 右后腿挠耳 f1–f4（同侧后爪隐藏） |
| stand_wag | open ×6, closed, half ×3 | closed ×5, open, open, open, closed, smile | 30→3200ms 非均匀；f4/f6 spark；弓背/哈欠 |
| chase_tail | side ×3, half ×2, closed | closed, open, open, closed, closed, closed | 尾绕到前右爪旁（羽状，不卷环）；尾尖抽动 |
| attack | wide ×5, half ×2 | closed, open ×4, smile, closed | 右前爪横拍 f1–f4；bar FX f3/f4；spec-only |

### 5.5 表情可复制 prompt（96px 表情 sheet 用）

```text
EXPRESSION SHEET (reference only, never ship labels): the same blue-bicolor ragdoll cat head, front view, 96 px pixel art, 7 eye states (open / half / sleepy / closed / happy arc / wide / side glance) x 3 mouth states (closed / smile / open without tongue), keep head geometry, cap and white blaze identical across all cells, no labels, no text, transparent background, 1 px closed #0b1220 outline, hard alpha, flat 2-3 step shading, no blush, no hearts, no tears.
```

## 6. 动作提示词（12 CLIP PROMPTS）

> 每条 = **身份母版（§2.1）+ 该 clip 专属句 + 像素规格（§4）+ 负面词（§8）**。下面只写差异句；`view`/帧数/loop/holdMs 严格按 §4.3–4.4。所有动作都要保持“懒散高冷 + 慢 + 克制”，不学狗式兴奋。

### 6.1 `idle` — 6 帧 @6fps loop（正面坐姿）

```text
TAG idle, 6-frame seamless loop at 6 fps, front-facing seated ragdoll cat, full body;
slow breathing: body/head rise 1 px on f1-f2 and settle; plume tail sways as one soft mass with a one-frame lag (tail dx 0,+1,+1,0,-1,-1; tail dy 0,+1,+2,+1,-1,0); ear tips flick 1 px;
eyes open, open, sleepy, sleepy, half, open (a slow blink inside the idle); mouth closed; the grey cap and white blaze stay identical on every frame;
long fur: chest ruff compresses 1 px on the inhale, britches shift 1 px, tail feathers lag one frame; no curl bounce, no fur jitter;
first and last frame close for loop; no collar, no text, no second character, no ground shadow.
```

### 6.2 `idle_blink` — 3 帧 @12fps one-shot（叠加慢眨眼）

```text
TAG idle_blink, 3-frame one-shot at 12 fps, same seated pose as idle f0, only eyes and mouth change:
f0 sleepy (fur-tone upper lid, lower half of the blue iris visible), f1 fully closed with a fur-tone lid line (never an outline-colour black line), f2 sleepy again; mouth closed, closed, smile;
body, head, tail and ruff stay exactly at idle f0; no head turn, no body shift, no tears, no text.
```

### 6.3 `walk` — 8 帧 @10fps loop（侧视，面向左；spec-only 冻结）

```text
TAG walk, 8-frame seamless loop at 10 fps, side profile facing left, slow four-beat walk;
exactly one paw off the ground on every frame; body rises and falls 1 px; plume tail hangs low and sways with a one-frame lag; ear tips flick; eyes alternate open and half; mouth closed;
keep the short-legged silhouette (visible leg 10-14 px), ground line y=89, no dust, no motion streaks; first and last frame close; side view only, never front view.
```

### 6.4 `run` — 6 帧 @14fps loop（侧视，面向左）

```text
TAG run, 6-frame seamless loop at 14 fps, side profile facing left, compact zoomies rather than a full gallop;
body lowered (short-leg v11a), forelegs reach, hind legs drive; plume tail streams up behind the back line; ears slightly back; wide eyes on f0-f4 and half on f5; mouth open on five frames;
1-2 tiny detached dust/speed marks (#f4f9ff, 1-2 px, drawn after the outline, never outline colour, no large dust cloud); short-legged stocky silhouette; first and last frame close.
```

### 6.5 `pat_head` — 4 帧 @8fps one-shot（正面，被摸头）

```text
TAG pat_head, 4-frame one-shot at 8 fps, front-facing seated ragdoll responding to a gentle head touch (human hand NOT drawn);
f0 neutral; f1 head leans down 1 px, ears flatten 1 px, eyes half; f2 head down 2 px, happy squint arc, mouth smile, low-saturation cream cheek tint (belly colour, not pink blush), three tiny 1-2 px sparkle marks around the head (drawn after the outline, no black rim); f3 head returns, eyes half;
tail sways softly; no hearts, no heart-shaped pupils, no tears, no tongue, no text bubble.
```

### 6.6 `ball_throw` — 5 帧 @10fps one-shot（正面，灰蓝球抛落）

```text
TAG ball_throw, 5-frame one-shot at 10 fps, front-facing seated cat watching a small grey-blue ball (8x8 px, #7f8c99 with a #d3dae1 highlight) fall from the upper right;
f0 head up, wide eyes, ball at (84,16); f1 head up, ball (86,28); f2 head tilts, side glance, ball (84,44); f3 ball (80,62); f4 ball (74,82), slow right forepaw reach toward (72,78), eyes half;
plume tail counter-balances; no human hand, no second ball, no motion blur, no text.
```

### 6.7 `ball_chase` — 6 帧 @12fps one-shot（正面，懒懒拨球）

```text
TAG ball_chase, 6-frame one-shot at 12 fps, front-facing cat lazily leans and bats the ball;
f0-f3 eyes glance sideways, body drifts 1-3 px, ball rolls from (70,84) to (58,85); f2 and f3 the right forepaw reaches out; f4-f5 half-lidded, mouth closed, ball (52,84) and (50,84), paw returns;
tail sways; no second ball, no human hand, no dust, no text.
```

### 6.8 `paw_face` — 5 帧 @8fps one-shot（正面，舔爪洗脸）

```text
TAG paw_face, 5-frame one-shot at 8 fps, front-facing seated cat washing its face;
the left front paw lifts to the muzzle on f0 (muted pad visible), then to the cheek f1, over the eye f2, lower f3, settles f4; eyes half, closed, closed, half, half; mouth open small on f0 then closed/smile;
the grounded right front paw stays planted, and the raised left front paw must NOT be duplicated on the ground; plume tail sways; no human hand, no water bowl, no text.
```

### 6.9 `scratch` — 6 帧 @8fps one-shot（正面，后腿挠耳）

```text
TAG scratch, 6-frame one-shot at 8 fps, front-facing seated cat tilting its head and lifting the right hind leg to scratch the right ear on f1-f4;
head tilts 2-3 px; eyes open, half, half, half, closed, half; mouth smile on f4-f5; the grounded right hind paw is hidden while the leg is lifted (no duplicated same-side limb); plume tail flicks;
no human hand, no text, no dust.
```

### 6.10 `stand_wag` — 10 帧 @6fps 非均匀 one-shot（侧视，伸懒腰 3200ms）

```text
TAG stand_wag, 10-frame one-shot with non-uniform holds [300,300,300,350,400,400,400,350,250,150] = 3200 ms, side profile facing left, slow cat stretch:
f0 normal standing; f1 head lifts and plume tail starts up; f2 front paws slide forward; f3 chest lowers; f4 full stretch (front low, rear high, back arched, plume tail up); f5 yawn opens (mouth open, no tongue); f6 yawn hold with closed eyes; f7 starts to retract; f8 pulls back; f9 returns to stand with a half-lidded smile;
all four feet stay planted; short-legged silhouette (visible leg <=15 px); long ruff and britches shift 1 px; no curl bounce; 1-2 tiny sparkle marks at f4/f6 only; no text, no second character.
```

### 6.11 `chase_tail` — 6 帧 @10fps one-shot（正面，追自己的尾）

```text
TAG chase_tail, 6-frame one-shot at 10 fps, front-facing seated cat watching its own plumed tail curl around to the right front paw;
f0-f4 the tail tip twitches near the right paw, head tilts, eyes side, side, side, half, half; mouth open on f1-f2; f5 looks away and closes its eyes as if saying never mind;
the tail stays attached and plumed with 3-4 soft notches (never a tight ring, never an extra tail); no duplicated limbs, no motion blur, no text.
```

### 6.12 `attack` — 7 帧 @16fps 非均匀 one-shot（正面；spec-only 冻结）

```text
TAG attack, 7-frame non-uniform one-shot (holdMs 83,83,63,42,42,63,63), front-facing cat play-swat, NOT a violent attack:
f0 alert crouch with wide eyes; f1-f2 charge and lift the right front paw; f3-f4 swipe at the front-right with 2-3 short impact bars (8 px, bright core plus coloured rim, never outline colour); f5-f6 recover to half-lidded eyes and a closed mouth;
plume tail balances; spec-only frozen in the current product (no UI, region action or plugin entry), do not treat it as a shipping action; no blood, no teeth, no aggression toward a person.
```

### 6.13 缺帧说明（不要在生产包里偷加）

猫的 `talk`/`bark`、`remind`/`nudge`、`drag`、`land`、`sleep` 当前都映射到 `idle`（`behavior.json` fallback/slots）；如果产品要专属帧，必须：新增 tag → 升 `famling.pet-anim/0.2` → 同步 `timing.json`/manifest/`character.json`/生成器/测试。**本 12-clip/72 帧包不接受额外 PNG**。

## 7. 生成模板（TEMPLATES）

### 7.1 T1 · 单 tag / 单帧生成

```text
[TAKE ONE]
<IDENTITY LOCK from §2.1>
<PIXEL SPEC from §4.1-4.2: 96x96, transparent, hard alpha, one 1 px closed #0b1220 outline, flat 2-3 step shading, top-left light, ground line y=89, no text/logo/watermark/shadow/scenery>
<CLIP LINE from §6 for the target tag/frame>
<NEGATIVE from §8 (profile A)>
OUTPUT: single character sprite, full body, 1x pixel-art concept, readable at 96x96.
```

### 7.2 T2 · 三视图 turnaround（评审用）

```text
TURNAROUND, same blue bicolor ragdoll cat IDENTITY LOCK, orthogonal turnaround, three full-body views side by side: front seated, profile facing left, back;
same size and baseline with +/-1 px tolerance; the front view seated with four paws visible, the profile standing with four paws on the ground, the back view with the plume tail behind;
must read in all views: white-dominant silky coat, continuous blue-grey cap, white blaze from just above the eyes to the muzzle, blue eyes (front/profile), blue-grey ears, full plumed tail with a darker tip, feathery britches, round feather-tufted paws;
flat cel shading, 1 px closed dark outline, transparent background, no labels, no colour swatches, no props, no collar, no second character, no text.
```

- 96 三视图只作评审/身份锁，不入包；128/256 必须另绘（§4.6）。
- 三视图必须交代：尾根位置、尾羽缺口方向、耳根高度、blaze 起止、连帽是否连续、腿长比例。

### 7.3 T3 · 动作 contact sheet（评审用）

```text
ACTION CONTACT SHEET, same blue bicolor ragdoll cat, 1x pixel art, 12 poses in a 4x3 grid: seated idle, slow blink, walk (side), run (side), head-pat, ball watch, lazy ball bat, paw-to-face wash, hind-leg ear scratch, slow stretch (side), tail chase, play swat;
transparent background, consistent size and baseline, no labels, no text, no scenery, no extra limbs.
```

### 7.4 T4 · 局部修正（重生成补丁）

```text
FIX PASS, keep everything identical except: <one of: cap/blaze boundary, ear shape, plume tail notches, chest ruff scallops, paw shape, eye highlight, outline closure, remove a detached mark>;
do not change palette, pose, canvas, camera, fur anchors or frame count; keep 96x96, transparent, hard alpha, one 1 px closed #0b1220 outline, flat shading;
return one corrected frame or one corrected tag sheet only.
```

### 7.5 T5 · 从 AI 概念稿到 final 像素的最低流程

1. 用已批准的模型/工具生成 concept（**本文件不指定模型、不声称调用**）；
2. 裁切/等比缩放 → 调色板量化（吸附到 §3.1 的 16 hex）→ 硬 alpha；可参考 `scripts/pixelize.py` 思路，但它不是 cat 专用托管脚本；
3. **人工像素重绘**（Aseprite/PIL 均可）：轮廓、blaze、眼、尾羽、围脖必须逐像素确认；AI 直出不得当 final；
4. 跑门禁（§10.1）+ 1x/4x contact sheet 目视（§10.4）；
5. 更新 manifest/character.json 的 palette/license/ai/placeholder/meta；`ai.status` 如实标注（AI 概念稿 → `concept`，纯手绘 → `none`），并按 `AI-PROVENANCE.md` 登记。

## 8. 负面词（NEGATIVE）

### 8.1 身份漂移（profile A 主用；防退回卷毛/暖色）

```text
selkirk rex, curly coat, ringlets, cloud-puff fur, scalloped cloud silhouette, wavy fur outline, sheep-like coat, poodle coat;
orange cat, brown cat, ginger tabby, red tabby, calico, seal point, chocolate point, warm brown mask, pink fur, cream-orange body;
short smooth coat, shorthair, hairless, sparse fur, furless tail; dog ears, floppy ears, folded ears, cropped ears, cat ears missing, no tail, short tail, bobtail, tail curled into a ring, thin whip tail, tail detached from body, extra tail;
puppy proportions, kitten proportions, big baby head, chibi child, oversized eyes, anime sparkle eyes, heart pupils, watery eyes, blush as a main feature, romantic gaze, seductive pose;
collar, bell, gold tag, harness, clothes, bow, necklace, accessories; humanoid, anthropomorphic standing, human hands, human face, person, anime girl/boy, second character;
realistic fur, photo-real, 3D render, painterly, gradient fur, glow, blur, anti-aliasing, semi-transparent pixels, soft alpha, pure #000000 / #FFFFFF large areas;
text, letters, watermark, logo, signature, UI, speech bubble, labels, scenery, furniture, food bowl, ground shadow, extra limbs, duplicated ears, duplicated same-side paws;
official DeepSeek logo/mascot, official affiliation claim, real animal photo.
```

### 8.2 其它 profile 开关

- **profile B（若为对照/回滚重新生成 Selkirk 基线）额外负面**：`smooth silky coat, straight plume tail, ragdoll bicolor, white-dominant body`——因为 B 要卷毛灰白。
- **profile C（旧白布偶 OC，仅历史参考）额外负面**：`curly coat, selkirk, 12-clip 72-frame layout, 96px runtime contract`——C 不是 96 运行包口径。

### 8.3 风格/工程负面（A/B 共用）

```text
no anti-aliasing, no soft alpha, no semi-transparent pixels, no gradient, no blur, no glow, no drop shadow, no ground shadow, no perspective, no 3/4 camera, no rotation;
no text/logo/watermark/labels/UI/swatches; no multiple characters; no extra frames; no collage borders; no background;
not 128x128, not 256x256, not non-integer scale; no pixel upscaling artifacts; no subpixel placement; no off-palette colours; no pure black or pure white blocks.
```

### 8.4 内容/合规负面（A/B 共用）

```text
no feeding/food/treats/hunger imagery, no begging, no sad abandoned cat, no separation anxiety, no sick/injured cat, no vet/medical scene, no mating/heat imagery, no romantic or sexual content, no 18+ content, no child-like sexualization, no real person, no human hands, no leash, no real animal photo, no official DeepSeek branding, no violence/blood, no dead animal.
```

### 8.5 旧占位/历史负面（防回退）

```text
ginger tabby cat with green eyes and red collar with golden bell, old cat placeholder, 7-tag 36-frame layout, 8-frame idle, 36-frame cat pack, toy-like flat blob without fur anchors.
```

## 9. 迁移影响（本任务只出设计；以下是未来实现的完整影响面）

**原则**：一次变更集完成 **像素 + palette id + 测试 + 文档 + 插件 re-embed**，不做半套；在用户/美术线验收前保留旧渲染器与旧资产快照以便回滚。

### 9.1 影响面总表

#### 必须改（MUST）

| # | 文件/区域 | 现状 | 动作 | 验证 |
|---|---|---|---|---|
| 1 | 新渲染器 `scripts/cat_ragdoll.py`（由 `cat_selkirk.py` 复制改造） | 1416 行；`curl_puff`/`ringlet` 卷毛 | 保留 Canvas/描边/填洞/骨架；删卷毛原语，加 F1–F6（§4.8）；导出 `draw_ragdoll` / `CAT_COLORS` | `--sheet` + §4.9 指标 + 1x 目视 |
| 2 | `scripts/gen-cat-anim.py` | import `cat_selkirk`；PALETTE_ID；docstring/License；verify 指标 | 换 import/绘制函数/`PALETTE_ID`；docstring(:1-19)、LICENSE(:45-49) 改布偶；`--verify` 输出 silky 指标；sheet 标题(:382) | `--check`/`--verify` exit 0 |
| 3 | `public/assets/pet/anim/cat/**` | 72 帧 + manifest（172,426 B） | 重新生成 72 PNG + manifest：palette/license 更新；帧数/fps/holdMs/顺序不变 | `--check` 逐字节一致 |
| 4 | `public/characters/pet-cat/character.json` | palette `cat-selkirk-anim@0.1`；license:41/note:46 写 Selkirk | palette 改名、license/note/meta 文案改布偶；canvas/anchor/footBox/bbox 不动 | `tests/default-packs`/hero 消费测试 |
| 5 | `tests/pet-anim-cat.test.ts` | 17 tests；:513-553 锁卷毛 | 头部注释(:1-19)改布偶；palette 正则(:359)；把 curl 用例替换为 silky（圆度 1.15–1.60、bump 4–10、尾羽 3–4 缺口、围脖 2–3 级）；其余用例保留 | 该测试 0 fail |
| 6 | `tests/default-packs.test.ts:97`、`tests/hero-multichar-integration.test.ts:85` | palette 期望 `cat-selkirk-anim@0.1` | 同步新 palette id；注释顺手改 | 两个测试 0 fail |
| 7 | `docs/content-packs/CAT-DESIGN-REFERENCE.md` | 卷毛/灰白/16 色/72 帧 | :1 标题、:10 一句话、§2 卷毛轮廓（:30）、§3 调色板用途、§4 识别点、§5 clip 表、§7 禁止事项：改成布偶直长毛（hex 不变） | 文档审查 + 与 manifest 一致 |
| 8 | `docs/content-packs/examples/cat.anim.example.pack.json:103`、`docs/content-packs/ANIM-PACK-0.2.md:112` | palette id | 同步改名（示例/预算文档） | 文档审查 |
| 9 | `docs/design/CAT-SELKIRK-2026-11-18.md` + 新设计文档 | 现行设计文档 | 建议新增 `docs/design/CAT-RAGDOLL-2026-11-20.md`（记录本方案落地）或给 CAT-SELKIRK 追加 v13 节；旧 `CAT-RAGDOLL-2026-11-18.md` 顶部指针更新 | 文档审查 |
| 10 | `public/content/library.json:60,223,224` | 名称/描述“塞尔凯克卷毛猫” | **已改**：name=`布偶猫`，description 写明“蓝重点双色布偶猫 / 白底丝滑长毛”；72 帧/voice 描述不变 | `tests/content-library` 或消费测试 |
| 11 | `public/characters/pet-cat/regions.json:126` | wash says“卷毛不好梳” | 改 1 句（如“长毛要顺一顺。”）；regions 结构/rect/动作 id 不动 | regions 消费测试/手动 |
| 12 | 插件 `plugins/dsh-famling` | 嵌入 cat 帧；文案 Selkirk/卷毛；0.10.10 | **task-149 明确「不得改插件」→ 本轮不改。** 后续任务：`npm run embed:anims` 重嵌入；package.json:24、index.js:88、README:30/37/40/147/157/279、docs/DETAIL:5/12/16/128/138、locale zh/en:4-5、client.content.js:140/146/229/235 改布偶/长毛；版本 0.10.10→0.10.11 | 后续任务跑插件 `release:check` 全绿（§9.3） |
| 13 | `AI-PROVENANCE.md` / `ASSET-LICENSES.md` | 未登记 `public/assets/pet/anim/**` | final/发布前补登（确定性生成、无 AI、placeholder-only→final 状态如实写） | 人工审查 |
| 14 | `docs/plan/SCRIPTS-INVENTORY-2026-11-20.md:31,74` | 记录 `cat_selkirk.py` / Selkirk 生成器 | 改为 `cat_ragdoll.py` / 布偶生成器描述 | 文档一致性 |
| 15 | 其它提及 Selkirk 的文档 | `docs/research/PET-INTERACTION-CONTENT-2026-11-18.md:44,52,879-880`、`docs/research/PET-MARKET:470` 等 | 实现/发布前统一改口径或标注“历史快照”；至少不能继续把 Selkirk 当现任 canon | 文档搜索无“current Selkirk” |
| 16 | `CHANGELOG.md` / `README.md` | 若有猫品种描述 | 同步一次 | 文档审查 |

#### 建议改（SHOULD）

- `docs/art/oc/cat/{OC,PROMPTS,RUNTIME-MAP}.md`：**不要按本包重写**（三者是 2026-11-17 的 7-tag/36 帧旧占位口径，且被 `tests/oc-consistency.test.ts:94,344-372` 锁在 `public/assets/pet/cat-placeholder/manifest.json`）。只在其顶部加一行“动画包现行口径见 CAT-RAGDOLL-PROMPT-PACK / 实现后的设计文档”，保留历史。
- `docs/art/oc/README.md`、`docs/art/OC-COMPLETION-2026-11-17.md`：同上加指针，不重写内容。
- `docs/art/OC-COMPLETION` 中“白布偶”与当前 Selkirk 的冲突记录：实现后把状态改为“已由布偶方案回收”，避免历史结论误导。

#### 绝对不能改（MUST NOT）

1. **帧契约**：`src/pet/anim/timing.json`、`src/pet/anim/clips.ts`、`src/pet/anim/types.ts`——12 clip / 72 帧 / cat stand_wag 10 帧 override / holdMs / specOnly 一律不动。
2. **manifest 结构字段**：`id=pet.cat.anim.placeholder`、style/formatVersion、canvas/anchor/footBox、`anim.contract=famling.pet-anim/0.1`、tracks/bubblePolicy/voice、assets 顺序。
3. **角色/行为契约**：`character.json` 的 id/species/capabilities/fallback、`behavior.json` 的 states/slots/rules、`regions.json` 的 region rect/actions/event id。
4. **16 个 palette hex**（§3.1）与 palette 的 16 role 数量；不得借机加色/删色。
5. dog/human 动画包、`scripts/gen-pet-anim-frames.py` 的 dog 逻辑；hero-runtime/desktop-shell/menu 代码（palette 只是元数据，渲染不读）。
6. 安全/法律声明实质内容（`docs/legal/USE-RESTRICTIONS-2026-11-19.md` 等）、TTS/ASR 同意、非官方/AI 声明边界。
7. 插件 bridge/API 契约（Host 调用、persona 选择、regions 嵌入格式）；只换数据与文案，不改协议。

### 9.2 落地顺序（S0–S7，每步都有门禁）

| 步 | 动作 | 门禁/证据 | 回滚点 |
|---|---|---|---|
| **S0** | 记录基线 SHA-256（§12.1）、跑 §10.1 基线门禁、保存 `_scratch/pet-anim-cat-selkirk-preview/` 快照 | §10.1 全绿（本文 §0.2 已给基线） | — |
| **S1** | 新建 `cat_ragdoll.py`（F1–F6），只渲染 contact sheet，不写包 | §4.9 指标达标 + 1x/4x 目视 + 不退回卷毛/短毛 | 删除新文件即可 |
| **S2** | 切换生成器并生成 72 帧 + manifest；`--check`/`--verify` | `--check` exit 0；`--verify` FAILS none；72/72 unique | 恢复旧生成器+旧资产（git/snapshot） |
| **S3** | 更新 cat 测试（palette/curl→silky）与两个消费方测试 | `tests/pet-anim-cat` 0 fail；消费方测试全绿；`tsc` 0 | 回退测试+资产（同一变更集） |
| **S4** | 文档/文案：CAT-DESIGN-REFERENCE、content-packs、content library、regions 1 句、character.json 元数据、新设计文档 | 文档审查；`public/content` 消费测试 | 文档回退 |
| **S5** | 插件 re-embed + 文案 + 版本 + `release:check` | §9.3 全绿（208 帧） | 回退插件包到上一版 |
| **S6** | 预览/评审：1x/4x/dark sheet、12 GIF（按 fps/holdMs）、脸/尾/侧视放大、metrics 报告 | 用户/美术线签收（G2） | 保留 S1 新渲染器可继续修 |
| **S7** | 收尾：删除死代码/临时脚本、更新 AI-PROVENANCE/ASSET-LICENSES/SCRIPTS-INVENTORY/CHANGELOG、最终 diff 审计 | 最终门禁+审计 | 发布前可整包回滚 |

### 9.3 插件/消费方 re-embed（命令与期望）

```bash
cd <private-path>
npm run embed:anims       # 由 private 资产重新生成 client.anims.*.js + scripts/spec/anim-spec.json LOCK
npm run check:anims       # client/chunk/spec 与资产一致
npm run verify:anims      # 期望 208 帧 = dog 68 + cat 72 + human 68（cat 仍 72）
npm test                  # 插件静态/行为测试
node --check client.js
npm run lint && npm run typecheck
npm run measure:bundle    # 记录首屏与三 chunk 体积变化
```

- **禁止手改** `client.anims.cat.js` 与 `scripts/spec/anim-spec.json`：它们由 `scripts/embed-anims.mjs` 生成，必须与新资产同一个 commit/变更集。
- cat 帧数不变（72），所以插件 verify 的 208 总帧数不变；变化的是**帧字节、palette/license 字符串与文案**。
- 版本建议：资产替换不改协议 → **0.10.10 → 0.10.11**（patch）；若团队把“物种变更”视为功能变更则升 0.11.0，二选一，不能两套并行。
- famling 私有仓侧：`packBase` 路径不变、帧数不变，**无需改 hero-runtime/desktop-shell/menu**；只需资产 + `character.json`/`content/library.json`/文档。

### 9.4 风险与回滚

| # | 风险 | 影响 | 缓解 | 回滚 |
|---|---|---|---|---|
| R1 | 用户其实想要“卷毛的萌感”，布偶直长毛观感落差 | 返工/拒收 | S6 先用 1x/4x/GIF 给用户看再合入；保留 v10 连帽等已验收特征 | 恢复 Selkirk 渲染器+资产（S0 快照） |
| R2 | silky 阈值定得过紧/过松 | 测试反复红/挡不住回退短毛 | 首轮以 contact sheet + 指标双轨校准；阈值写成常量并在文档记录依据 | 只改测试常量（不碰资产） |
| R3 | palette id 改名漏消费点 | 测试/文档/插件不一致 | 按 §3.4 表逐项改 + `grep cat-selkirk-anim` 清零 | 保留旧 id（hex 不变）即可零风险 |
| R4 | 插件文案漏改，仍显示“塞尔凯克/卷毛” | 用户可见不一致 | §9.1 第 12 行清单 + 插件 locale 测试/搜索 | 回退文案单文件 |
| R5 | 文档多处 Selkirk 口径互相矛盾 | 后续任务误读 | §9.1 第 15 行 + 新设计文档为唯一现行口径；旧文档加“历史”指针 | 文档回退 |
| R6 | 插件 spec LOCK/帧 SHA 未同步 | `check:anims`/`verify:anims` 红 | embed/check 同一提交；不手改生成物 | 重跑 embed |
| R7 | 体积/性能 | 72 帧 PNG 字节变化（当前 172KB，通常同量级） | 生成后 `du -sb` 与插件 `measure:bundle` 对比；<500KB 门禁 | 无需回滚，属预期 |
| R8 | AI 概念稿混入 final 未披露 | 合规风险 | 本包只允许 concept；final 必须人工像素重绘并登记 `AI-PROVENANCE`/`ai.status` | 移除 AI 直出帧 |
| R9 | 未登记 anim 包许可就发布 | 发布事故 | S7 补登 ASSET-LICENSES/AI-PROVENANCE；在此之前保持 placeholder-only | 停止发布 |

### 9.5 明确保留的“旧文件”

- `scripts/cat_selkirk.py`：S1–S6 期间保留（回滚用）；S7 若确认无人 import 再删除或移到历史目录。
- `docs/design/CAT-RAGDOLL-2026-11-18.md` 与 `_scratch/pet-anim-cat-preview/`：历史参考，不删、不改内容，只加指针。

## 10. 验收（ACCEPTANCE）

### 10.1 工程门禁（每个帧包都必须过）

| # | 命令（在 `desktop-games/` 跑） | 期望 | 本机基线（2026-11-20，profile B） |
|---|---|---|---|
| 1 | `python3 scripts/gen-cat-anim.py --check` | exit 0，`check ok: cat animation pack matches the generator ...` | **通过**：blink end 112 px、mid 1055 px ≤ idle envelope 1139 px |
| 2 | `python3 scripts/gen-cat-anim.py --verify` | exit 0，`FAILS: none`；72/72 unique；bottoms 全 89；hard alpha；maxcolors ≤16；non-FX gap=0；internal black=0；holes=0；walk airborne `[1]*8` | **通过**（§0.2） |
| 3 | `node --import tsx --test tests/pet-anim-cat.test.ts` | 0 fail（17 tests；若平台 node 无 numpy 可 skip 2 条生成器/确定性用例，但需另跑 1/2 补证） | Windows node：**15 pass / 0 fail / 2 skipped**；WSL node 因 win32 esbuild 失败（环境问题） |
| 4 | `node --import tsx --test tests/default-packs.test.ts tests/hero-runtime.test.ts tests/hero-multichar-integration.test.ts tests/canvas-scale.test.ts` | 全 pass（消费方） | 改 palette 后必须复跑 |
| 5 | `python3 scripts/gen-pet-anim-frames.py --check` | 全绿（cat 委托到 `gen-cat-anim.py --check`；dog/human 也 ok） | 通过 |
| 6 | `npx tsc --noEmit` | 0 error | 通过（纯美术替换也应跑） |
| 7 | `cd plugins/dsh-famling && npm run release:check` | `npm test`/check/verify/lint/typecheck/package 全绿；**208 帧** | 改资产后必须跑 |

> 环境提示（本机实测）：WSL 的 `node` 加载 win32 `esbuild` 会 `TransformError`；用 Windows `node.exe` 跑 TS 测试、用 WSL `python3`（带 numpy）跑生成器门禁，二者结合才能覆盖全部门禁。这是环境差异，不是代码失败。

### 10.2 帧级硬检查（现有测试自动断言，任何一条失败即拒收）

| 检查 | 阈值/断言 | 来源 |
|---|---|---|
| 尺寸 | 每帧 96×96 | `tests/pet-anim-cat.test.ts:452-467` |
| alpha | 只有 0/255（硬 alpha）；四角透明 | 同上 :459-460 |
| 剪影不透明像素 | >800 px/帧 | 同上 :461 |
| 颜色 | 每帧 ≤20 可见色；全包并集 14–16 色且 ⊆16 role | 同上 :462, :469-503 |
| 暖色毛 | 拒绝 `r-g>25 && g-b>10` 的橙/棕/粉毛 | 同上 :492-499 |
| 地线/边距 | 每帧最低不透明像素 y=89；bbox 在 1..94 内 | 同上 :463-465 |
| 蓝眼 | ≥60/72 帧可见；闭眼帧为 0 | 同上 :500-502 |
| 灰帽/白 blaze | 正面灰帽中线白色=0；blaze 起点 ≥ 头顶+2 且 ≤ 眼上缘−1；侧视 blaze ≤ 眼上缘−1 | 同上 :699-745 |
| 轮廓/洞/内部黑线 | 主剪影 1px 闭合 outline、mainGap=0、holes=0、internalBlack=0 | 同上 :780-838 |
| 同侧肢体遮挡 | paw_face/scratch/attack/ball_throw 同侧地面爪 ≤6px；对侧爪 ≥25px | 同上 :845-888 |
| 侧视体积 | depth ≥31、bodyArea ≥1300、tailArea ≥400；walk legLength 10–15 | 同上 :590-609 |
| run/stand 短腿 | 可见腿长 10–15 / ≤15，腿宽 ≥6 | 同上 :646-670 |
| 前爪宽度 | idle/idle_blink/pat_head/chase_tail 前爪区 y=85 宽 ≥8px | 同上 :672-685 |
| walk 步态 | 每帧恰 1 爪离地（生成器 `--verify`） | 同上 :687-696 |
| 唯一帧/动态 | 72/72 SHA-256 不同；每 clip ≥2 独立帧；idle ≥3；blink=3；stand_wag=10；attack=7 | 同上 :751-774 |
| 确定性 | `gen-cat-anim.py --check` exit 0 + blink QA 输出在 envelope 内 | 同上 :894-912 |
| hero 兼容 | `validateCharacterPack` + `loadCharacterPack` 通过，assets=72 | 同上 :407-429 |

### 10.3 silky 指标门（G1，已在 `tests/pet-anim-cat.test.ts` 落成）

| 测试名 | 断言（已落成的硬门） | 目标值 | 本轮实测 | 说明 |
|---|---|---|---|---|
| `silky coat silhouette stays smooth (calibrated silky gate)` | 全包 avg roundness + 每帧 roundness | avg ≤2.35；单帧 ≤2.55 | 2.01–2.53 / avg 2.32 | 替换原 `Selkirk coat reads curly`；1.15–1.60 在 96px 骨架不可达，校准依据见 §4.9 注 |
| `silky coat keeps only local fur anchors` | 四向 profile bump 总数 | 每帧 4–10 | 4–10 / avg 6.3 | 与卷毛 13–40 区分；<4 说明丢耳/尾/羽结构 |
| `plume tail reads as a straight feather plume` | front tailArea ≥200；≥2 个 ≥3px 奶油羽瓣；深色尾尖 ≥6px | 通过 | 261–564px；3–7 瓣；9–17px | 保留 side `tailArea ≥400`（walk/run 实测 440–577） |
| `chest ruff keeps layered scallops` | 胸区（x40–56,y40–68）`belly` ≥260px + 3 级扇贝 | 通过 | 289–330px | 防止“平滑无毛” |
| 调色板/毛流 | 内部 outline 色=0；每帧颜色 ⊆16 role；暖色毛阈值 | 通过 | 通过 | 已有 palette/outline 用例覆盖；毛流只用 light/shade/belly |
| `white-dominant blue-bicolor quota` | 全包 avg 白区 58–66%、重点色 18–24%；逐帧白 ≥50%、重点 ≤27% | 通过 | 白 60.1%（53.5–69.8）；重点 20.0%（9.6–25.6） | 逐帧统计（§0.2.1 同法） |

> **校准记录（2026-11-20，task-149）**：首轮实现后实测圆度 2.01–2.53、bump 4–10。圆度 1.15–1.60 与 96px 现有骨架（四腿+羽状尾+耳，边界长度固定）不相容，故按“显著优于卷毛基线且不退回卷毛”校准为 avg ≤2.35 / 单帧 ≤2.55；bump 按原目标 4–10 直接落为硬门。若未来做 128/256 另绘，可恢复 1.15–1.60 口径。

### 10.4 目视检查（人工，1x 与 2x）

- [ ] 1x 下 5 秒剪影可辨：布偶长毛剪影（围脖 + 羽状尾 + 毛裤），头身分界清楚，不是云朵团。
- [ ] 白为主、冷灰蓝重点、白 blaze 从眼上开始、蓝眼可读；没有橙/棕/粉毛。
- [ ] 尾是羽状 plume（粗根/锥形/3–4 缺口/深色尖），不是卷环/灰球/扫帚。
- [ ] 正/侧/背三视图一致：耳形、连帽、blaze、围脖、尾羽方向、腿长比例。
- [ ] 12 clip 表情/动作符合 §5.4/§6；walk 每帧 1 爪离地；同侧肢体不重复。
- [ ] 无项圈/衣服/人类手/第二角色/文字/Logo/地面阴影。
- [ ] 1x 与 2x 窗口都检查；4x contact sheet + 12 GIF（按 fps/holdMs）存档。

### 10.5 AI concept 验收（生成阶段，不是 final）

- [ ] 单角色、全四足、成年布偶、白为主 + 蓝重点 + 白 blaze + 蓝眼；无暖色毛、无虎斑、无卷毛。
- [ ] 羽状尾/围脖/毛裤三锚点可读；尾不被裁切；脚在地线内。
- [ ] 96px 缩略下剪影可读；边缘透明度脏可以接受（后续人工像素化/重绘）。
- [ ] 无文字/Logo/水印/第二角色/人类手/衣服/项圈。
- [ ] 记录：模型/版本、prompt、refs sha256、（若可用）seed、候选编号、选择理由；`ai.status` 与 provenance 如实。

### 10.6 合规与声明检查

- [ ] 当前包仍 `placeholder: true`、`ai.status: none`、license placeholder-only；不得当 final 发布。
- [ ] 猫只 `bubble: thought`、`canTts:false`；不得有任何 TTS/真人声线/真实动物录音宣称；帧内无文字气泡。
- [ ] 非官方：不得使用 DeepSeek Logo/字标/官方形象；不得宣称官方合作/授权/背书。
- [ ] 不生成喂食/饲养/生病/发情/配种/攻击性拟真桥段；不诱导依赖/付费。
- [ ] `ASSET-LICENSES.md`/`AI-PROVENANCE.md` 在 final/发布前补登 `public/assets/pet/anim/**`（§1.2 C12）。
- [ ] 参考照片只作研究，不描摹、不入包、不随包分发；不使用真实猫照片做 img2img 底图。

### 10.7 失败处理

1. 生成帧不合格 → 回生成/重绘；**不要手改 PNG**（`--check`/测试会判 STALE）。
2. 要改帧数/帧率/tag → 必须改 `timing.json` 母版 + 生成器 + manifest + 测试 + 文档；新 tag 还要升 `famling.pet-anim/0.2`。
3. 要改画布/anchor/footBox → 同步 `character.json`、manifest、测试；96→128/256 必须重绘。
4. 要改色板/palette id/毛型 → 视为整包口径切换：资产、生成器、测试、文档、插件同一变更集，禁止只改一帧/一处。
5. 用户否决布偶方案 → 按 §9.4 回滚到 S0 快照，保留本包作为设计记录（不改历史文档结论）。

### 10.8 证据归档（每次生成/替换都留）

- contact sheet：1x 与 4x 各一张（12 clip 首帧 + 关键帧）；dark 底 4x 一张；
- 12 个 GIF：按 manifest fps / holdMs 编码（stand_wag 必须 3200ms 总时长）；
- 逐帧 metrics：尺寸/色数/底边 y/bbox/唯一性/圆度/bump/白区占比；
- 门禁命令与原始输出（§10.1 第 1–2、3–6、7 条）；
- 生成方式与来源（模型/工具/seed 是否可用/人工后处理）写入 `AI-PROVENANCE.md`；
- SHA-256：manifest、生成器、新渲染器、72 帧全量；写进交付记录。

## 11. 未生成与 AI / 许可声明（本轮）

- 本轮**没有生成任何猫图片、没有调用图像 API、没有生成音频**；本文件是文本交付。
- 盘上 `public/assets/pet/anim/cat/` 是**确定性程序化占位**（`scripts/gen-cat-anim.py` + `scripts/cat_selkirk.py`，无模型、无网络、无随机）；license 为 `placeholder-only`（商用未授权）；**占位 ≠ final**，禁止当成品宣传/发布。
- 未来若获批生成：AI 输出只能是 concept/placeholder，须经人工像素重绘 + §10 门禁 + 2× 终审；`ai.status` 如实标注，并按 `AI-PROVENANCE.md` 记录调用链与（若可用）seed；本项目 2026-11-16 记录的端点**无 seed/size/negative/inpaint**（`docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md:4`），因此 prompt 里的“负面词”是**文本过滤/自检清单**，不是模型参数；若换用带 seed 的供应商，则按 §7.5 记录。
- 旧 `public/assets/pet/cat-placeholder/**`（姜黄虎斑/7 tags/36 帧）已不被 `pet-cat` 引用，**不得作为参考图或母版**。

### 11.1 下游内容包 / 第三方口径（本文件不替代）

- `docs/content-packs/CAT-DESIGN-REFERENCE.md` 是 `rolePresets[1]`（id `cat`）与第三方猫科角色主题包的工程参考；本文件是**生成提示词/验收**的补充，实现后其品种/毛型/调色板描述需按 §9.1 第 7 行更新。
- 第三方分发是两套不同 schema：`famling.content-pack/0.2`（换肤/主题/对话）与 `famling.pet-anim/0.2`（新 rig/新动画，12 clip/72 帧预算，见 `docs/content-packs/ANIM-PACK-0.2.md`）；示例 `docs/content-packs/examples/cat.anim.example.pack.json` 的帧/sha256 是**占位值**，真实素材必须重算。
- 诚实边界：pet-anim 的 loader/注册表/热切换/安装器**未接线**（ANIM-PACK-0.2 §0/§9）；实现前不得对外宣称第三方猫角色包“可安装”。

### 11.2 外部资料与参考照片边界

- **CFA Ragdoll 品种页**：2026-11-20 实际抓取（`https://cfa.org/breed/ragdoll/`），用于品种画法依据（白为主/蓝眼/半长毛/围脖/羽状尾/毛裤/毛垫、blue point 的颜色描述）。这是外部资料，不是本项目 canon；与本文件冲突时以本文件为准。
- **TICA 品种页**：2026-11-20 抓取返回 Cloudflare 403，**未作为依据**，本文不引用其内容。
- **历史布偶照片**（Wikimedia Commons，仓库 `_scratch/pet-anim-cat-preview/refs/` 的本地副本）：只用于曾确认毛色分层/蓝眼/伸懒腰姿态；不描摹、不入包、不再下载；本文件不复制图片。
- **用户参考图**：`_scratch/pet-refs-user-2026-11-18/selkirk-user.png`（只读、不随包分发）只用于理解“卷毛版从哪来”；布偶方案不以它为参考。

## 12. 维护与漂移检测

### 12.1 基线 SHA-256（本文件写就时；变了就说明本文件可能过期）

| 文件 | SHA-256（v2 实现后实测，2026-11-20 task-149） |
|---|---|
| `public/assets/pet/anim/cat/manifest.json` | `01e6867ba1f7f73e7b0e1f4bfe83e9365b5035b2f9aaeb96fa2c810ceb1683da` |
| `scripts/cat_selkirk.py` | `4d462f4203bba9a90eec06a7f93fbdfb49341d6a7461a51f857910b14572d5f2` |
| `scripts/gen-cat-anim.py` | `72e048f167d3786950aefeacf96de0f1b76c70fa54334fb4689d268b783b2c2e` |
| `src/pet/anim/timing.json`（帧契约；task-155 只改 specOnly 文案，帧表未动） | `377015d402592282185731f0d9882fca226159caf651da60b1801e6da8f8bedf` |
| `public/characters/pet-cat/character.json` | `1170bc8b37bdbf4bcf194987f940dd621f046377e43d688bcf3b866b00dda2cd` |
| `public/characters/pet-cat/regions.json`（plugin 单源冻结；hash 随台词/单源更新，插件 embed 已同步） | `965e12d4488f496fa747802c8c048187566d889452b0b605b1fd729cdfeca913` |
| `public/content/library.json` | `4876aa60e00fe29d1848a5bd7c17e290bf6a6df803ff47c42fec3964a8336588` |
| `docs/content-packs/CAT-DESIGN-REFERENCE.md` | `6a7ce743c141465cb978f329e6f3d7bb41c011be55a2fbfca3e7ec7e998fb26c` |
| `docs/design/CAT-SELKIRK-2026-11-18.md`（历史设计，未改） | `e2617aa1b66d05ef61769345537867f3ed9f420dc1f30ae8de0e15dee9464b9c` |
| `tests/pet-anim-cat.test.ts` | `33430a2f7d1d3fb8105f3f89b5332a6e3e19e0e9ca4d85d093157b8a15fc9b26` |
| `tests/default-packs.test.ts` | `d66440fb1c93aeda9619853a1f269b79864e7ba132b203d0b441cf0c061d3402` |
| `tests/hero-multichar-integration.test.ts` | `23e6db7185d9c92730afcfb71f0ffc41b303d512af6ed2d69443708d7fc8884e` |
| `docs/art/prompts/PALETTE-LOCK-2026-11-20.md`（引用契约，非基线资产；task-155 已同步 palette id） | `d00e5e8cfb8efee91dc035a9b404b352c81891c1022f414cc2c8b8450d3e4743` |
| `public/assets/pet/anim/dog/manifest.json` / `human/manifest.json`（specOnly 文案随单源同步） | `2154c0ed9bd7d7c5c0fbd282856d26c419a161affca803e8051f4428416c8df2` / `c222bbc81599bd887bfade42b282f3c00d70d1f839843f46aff338e096663d42` |
| `docs/art/prompts/CHARACTER-PROMPT-SYSTEM-2026-11-20.md`（引用契约，非基线资产；并行文档任务可能继续改） | `bde1a4caab0e69c293caf3c27e7bdcf00fe4e824337f2267b50cacb71130b561` |

### 12.2 变更触发（任一发生 → 更新本文件并重跑 §10.1）

- `timing.json` 帧表/帧率/holdMs/specOnly 变化；
- manifest tags/frames/assets/palette/license/anim 块变化；
- `gen-cat-anim.py` / `cat_selkirk.py` 的调色板/几何/毛型常量变化；
- `character.json` canvas/anchor/footBox/bbox/palette/meta/license 变化；
- `behavior.json`/`regions.json` state/action/gesture 变化（动作可达性表 §4.3）；
- `CAT-DESIGN-REFERENCE.md` / `ANIM-PACK-0.2.md` 品种/色板/契约变化；
- 插件 re-embed 后帧字节/文案/版本变化（§9.3）；
- 用户否决/修改 profile A 的任一口径（短腿、连帽、saddle 斑、palette id）。

### 12.3 变更记录

- **2026-11-20 v1**：创建本包。基于 HEAD `47438ac` 实测（72 帧/16 hex/12 clip/96×96/172,426 B）；完成“现行 Selkirk → 同配色布偶”的设计、16 色映射、12 clip 提示词、卷毛→直长毛像素语法、迁移影响与验收；未生成图、未调 API、未改代码/资产/测试、未 commit/push。
- **2026-11-20 v3（task-155 P2/P3 修整）**：按 `CAT-RAGDOLL-REVIEW-2026-11-20` 修 P2-1（`chase_tail` f0–f4 尾链改开口 C，删除回绕与环心填充，新增「无被包住奶油核」回归测试）、P2-2（采纳 review 选项 b：接受右边界 1px，advisory bbox 同步为 `(2,4)–(94,89)` / `2/4/1/6`；尝试收边 1px 会令多帧四向 bump 掉到 3，破 4–10 美术门）、P3-1（`stand_wag` f2–f8 抬尾改 `mask` 蓝灰重点色 + 颜色语义测试）、P3-2（前视/侧视/伸懒腰羽尾缺口改为 2–3 个不等距不等深扇贝）、P3-3（`timing.json` specOnly 文案去掉帧数，三包 manifest 同步重生成）；重生成 cat 72 帧 + manifest（146,036 B）；cat 单测 23/23、desktop 全量 1965/0、`tsc`、`build`、插件 `embed:anims`/`gen:content`/`release:check` 全绿。**未调用图像 API、未 commit/push。**
- **2026-11-20 v2（task-149 实现）**：按 owner 已批准决定落地 profile A。`scripts/cat_selkirk.py` 由卷毛渲染器改为布偶直长毛渲染器（删 `curl_puff/ringlet`，实现 F1–F6；保留 Canvas/骨架/短腿/v10 连帽/blaze/灰耳灰尾），`gen-cat-anim.py` 换 import/PALETTE_ID/license/docstring 并在 `--verify` 增加 silky 指标门；重生成 72 PNG + manifest（145,810 B，palette `cat-ragdoll-anim@0.1`，16 hex 不变）；`tests/pet-anim-cat.test.ts` 用 silky/plume/ruff/quota 用例替换卷毛用例并同步 palette；`tests/default-packs.test.ts`、`tests/hero-multichar-integration.test.ts` 同步 palette；character.json / content library / CAT-DESIGN-REFERENCE 文案改布偶（`regions.json` 与 `src/pet/anim/interactions/cat.json` 的 wash 台词被 plugin 单源冻结哈希锁住，按「不得改插件」本轮**未改**，随插件 re-embed 任务处理）；新增 silky 校准记录（§0.2.1/§4.9/§10.3）。**未调用图像 API、未改插件、未 commit/push。**

### 12.4 待拍板 / 开放问题

| # | 问题 | 建议 | 需要谁拍板 |
|---|---|---|---|
| Q1 | palette id 是否改 `cat-ragdoll-anim@0.1` | **已拍板：改**（hex 不动；task-149 已同步生成器/manifest/character.json/消费方测试；插件与示例文档待后续任务） | 已解决 |
| Q2 | 短腿产品化 vs Ragdoll 品种标准长腿 | **保留短腿**（用户已两轮要求矮脚化、三宠统一风格）；文档标注非标准 | 用户/美术线 |
| Q3 | v10 连帽 + blaze 眼上 vs 标准 bicolor 倒 V | **保留 v10**（已验收、零测试改动）；A2 只作可选 | 用户 |
| Q4 | 身体灰斑保留/减半/全白 | **已拍板：身体以白为主**——移除 Selkirk 肩/腰灰斑，重点色只保留连帽/面罩/耳/尾（灰耳灰尾保留） | 已解决 |
| Q5 | 插件文案/版本节奏 | 与资产同一变更集；0.10.11 patch；**task-149 明确不得改插件 → 移至后续任务** | lead/插件 owner |
| Q6 | 与 task-148（PALETTE-LOCK / CHARACTER-PROMPT-SYSTEM）的关系 | **已于 2026-11-20 19:59 落地**：§3.1 已与 PALETTE-LOCK §4.1 逐 hex 对齐（16/16）；cat 专属映射以本文为准，色板/模板以其为准 | lead/art lead |

### 12.5 与其它 prompt pack 的关系

- 本包与 `TINGLAN-PROMPT-PACK-2026-11-20.md`、`DOG-PROMPT-PACK-2026-11-20.md` 是**同批平行交付**：共享 96px/12 clip 帧表/Cel-Chunk-F1 风格；各自色板/身份独立，不互相覆盖。
- `task-148` 的 `PALETTE-LOCK-2026-11-20.md` / `CHARACTER-PROMPT-SYSTEM-2026-11-20.md` **已于 2026-11-20 19:59 落地**：色板以 PALETTE-LOCK §4.1/§4.3 为准（本文 §3.1 已逐 hex 对齐）；跨角色 prompt 模板 / AVOID / 管线 / 每 pack 必备头部以 CHARACTER-PROMPT-SYSTEM §2/§3/§7/§8/§9/§11.3 为准；本文件的 cat 专属段落（§2.1/§6/§8）不被覆盖。若两文件后续改版，先改它们再同步本文（§12.1 记 SHA）。

## 附录 A · 机器可读摘要（给后续 prompt 系统/脚本人读）

```json
{
  "pack": "CAT-RAGDOLL-PROMPT-PACK-2026-11-20",
  "defaultProfile": "A",
  "profiles": {
    "A": { "species": "ragdoll (blue bicolor)", "coat": "silky semi-longhair", "source": "public/assets/pet/anim/cat (implemented 2026-11-20, task-149)", "paletteId": "cat-ragdoll-anim@0.1" },
    "B": { "species": "selkirk rex", "coat": "curly", "source": "historical baseline (git history of cat_selkirk.py + cat pack)", "paletteId": "cat-selkirk-anim@0.1" },
    "C": { "species": "ragdoll (white oc proposal 2026-11-17)", "coat": "long", "source": "docs/art/oc/cat", "paletteId": "none (7 tags / 36 frames, obsolete)" }
  },
  "canvas": [96, 96],
  "anchor": { "x": 48, "y": 96, "mode": "foot-center" },
  "footBox": [-36, -18, 72, 18],
  "bboxUnion": [2, 4, 94, 89],
  "groundY": 89,
  "outline": "#0b1220",
  "paletteRoles": 16,
  "colors": {
    "outline": "#0b1220", "body": "#f1eee7", "light": "#fdfcf7", "shade": "#d6d1c7",
    "belly": "#ece3d5", "mask": "#8e9296", "mask_dark": "#6b7075", "ear": "#6f7479",
    "ear_inner": "#c9c2b8", "eye": "#5b93e0", "eye_hi": "#f4f9ff", "pupil": "#1e2c44",
    "nose": "#c9b6ab", "pad": "#c4b1a7", "ball": "#7f8c99", "ball_hi": "#d3dae1"
  },
  "clips": {
    "idle": { "frames": 6, "fps": 6, "loop": true, "view": "front" },
    "idle_blink": { "frames": 3, "fps": 12, "loop": false, "view": "front" },
    "walk": { "frames": 8, "fps": 10, "loop": true, "view": "side-left", "specOnly": true },
    "run": { "frames": 6, "fps": 14, "loop": true, "view": "side-left" },
    "pat_head": { "frames": 4, "fps": 8, "loop": false, "view": "front" },
    "ball_throw": { "frames": 5, "fps": 10, "loop": false, "view": "front", "prop": "ball" },
    "ball_chase": { "frames": 6, "fps": 12, "loop": false, "view": "front", "prop": "ball" },
    "paw_face": { "frames": 5, "fps": 8, "loop": false, "view": "front" },
    "scratch": { "frames": 6, "fps": 8, "loop": false, "view": "front" },
    "stand_wag": { "frames": 10, "fps": 6, "loop": false, "view": "side-left", "holdMs": [300,300,300,350,400,400,400,350,250,150], "durationMs": 3200 },
    "chase_tail": { "frames": 6, "fps": 10, "loop": false, "view": "front" },
    "attack": { "frames": 7, "fps": 16, "loop": false, "view": "front", "holdMs": [83,83,63,42,42,63,63], "specOnly": true }
  },
  "frameContract": { "tags": 12, "frames": 72, "maxColorsPerFrame": 20, "measuredMaxColors": 16, "hardAlpha": true, "groundY": 89 },
  "baselineMetricsSelkirk": { "roundnessMin": 2.08, "roundnessMax": 2.77, "roundnessAvg": 2.52, "bumpsMin": 13, "bumpsMax": 40, "bumpsAvg": 30.6, "whiteSharePct": 56.1, "pointSharePct": 24.5, "eyeSharePct": 0.65, "sizeBytes": 172426 },
  "implementedMetrics": { "roundnessMin": 2.18, "roundnessMax": 2.54, "roundnessAvg": 2.35, "bumpsMin": 4, "bumpsMax": 10, "bumpsAvg": 6.5, "whiteSharePct": 59.9, "pointSharePct": 20.2, "eyeFrames": 67, "uniqueFrames": 72, "sizeBytes": 146036, "bboxUnion": [2, 4, 94, 89], "rightMarginPx": 1, "paletteId": "cat-ragdoll-anim@0.1" },
  "targetMetrics": { "roundness": [1.15, 1.60], "bumps": [4, 10], "whiteSharePct": [58, 66], "pointSharePct": [18, 24], "tailNotches": [3, 4] },
  "calibratedTestGates": { "roundnessAvgMax": 2.35, "roundnessFrameMax": 2.55, "bumpsPerFrame": [4, 10], "whiteAvgPct": [58, 66], "pointAvgPct": [18, 24] },
  "missingTags": ["talk", "bark", "remind", "nudge", "drag", "land", "sleep"],
  "migrationTouchpoints": 16
}
```

## 附录 B · 迁移 checklist（实现任务可直接勾）

- [x] S0 基线：以 git HEAD `df791b8` 的 Selkirk 包为回滚基线（`git checkout` 可一键恢复旧渲染器 + 旧 72 帧）；git 仓本身即快照，未额外复制 `_scratch`。
- [x] S1 渲染器改造：按 task-149 write scope **在 `scripts/cat_selkirk.py` 原地改造**（不是新建 `cat_ragdoll.py`）：保留 Canvas/骨架/palette，删 `curl_puff`/`ringlet`，实现 F1–F6，导出 `draw_ragdoll`。
- [x] S1 contact sheet 目视：`gen-cat-anim.py --sheet` 2x 全包 + 单帧 8x 复检（布偶剪影/羽状尾/围脖；无卷毛/暖色/短毛）。
- [x] S1 指标：bump 4–10 达成；圆度按 96px 实况校准为 avg ≤2.35 / 单帧 ≤2.55（依据 §4.9 注）。
- [x] S2 `gen-cat-anim.py`：import/draw 函数/PALETTE_ID/docstring/license/docstring 更新；`--verify` 增加 §5 silky 指标门；sheet 标题已是 “ragdoll cat anim placeholder”。
- [x] S2 重新生成 72 PNG + manifest；`--check` exit 0；`--verify` FAILS: none。
- [x] S3 `tests/pet-anim-cat.test.ts`：头部注释/palette 正则/curl→silky/新增 plume+ruff+quota；用例 0 fail（本轮实测见交付记录）。
- [x] S3 `tests/default-packs.test.ts` palette 同步；`tests/hero-multichar-integration.test.ts` palette 常量同步（设计 §3.4 要求的消费方）；消费方全绿。
- [x] S3 `npx tsc --noEmit` 0 error。
- [x] S4 `docs/content-packs/CAT-DESIGN-REFERENCE.md` 已改写为布偶（品种/毛型/色板用途/识别点/clip 表/禁止事项）。
- [ ] S4 `docs/content-packs/examples/cat.anim.example.pack.json`、`ANIM-PACK-0.2.md` palette id：**不在 task-149 授权文件内**，留待后续任务。
- [x] S4 `public/characters/pet-cat/character.json` palette/license/note；`public/content/library.json` 两处名称/描述。
- [x] S4 `public/characters/pet-cat/regions.json` “卷毛不好梳”→“长毛要顺一顺。”
- [ ] S4 新建设计文档 `docs/design/CAT-RAGDOLL-2026-11-20.md`：**不在授权文件内**；现行口径以本文件 + CAT-DESIGN-REFERENCE 为准。
- [ ] S5 插件 re-embed/文案/版本：**task-149 明确「不得改插件」**，整项移交后续任务。
- [ ] S6 预览 GIF/用户签收：本轮交付 2x contact sheet + 8x 单帧复检；GIF/签收留待美术线。
- [ ] S7 `AI-PROVENANCE.md`/`ASSET-LICENSES.md`/`SCRIPTS-INVENTORY`/`CHANGELOG`：**不在 task-149 授权文件内**，发布前必须补登（当前仍 `placeholder:true`/`ai.status:none`/placeholder-only license）。
- [x] S7 最终门禁：生成器 `--check`/`--verify`、cat 测试、消费方测试、`tsc`、`npm run build` 本轮实跑（见 §12.3）。
- [x] 回滚：旧渲染器与旧帧均在 git HEAD `df791b8`，`git checkout -- scripts/cat_selkirk.py public/assets/pet/anim/cat` 可整体回滚。

## 附录 C · 本文件自检

- [x] v1 只新增本文件、未改代码/资产；v2（task-149）按 owner 批准落地像素/测试/文档，改动文件均在 task-149 write scope 内（另含设计 §3.4 要求的 `tests/hero-multichar-integration.test.ts` palette 常量同步），未改插件、未 commit/push。
- [x] “同配色”落实：16 个 role hex 与 v1 基线逐字节相同（`CAT_COLORS` 未改动任何 hex）；只重定义 role 语义并改 palette id。
- [x] 布偶几何/毛型落实：删 `curl_puff`/`ringlet`，实现 F1–F6 直长毛（平滑剪影 + 4 毛区羽化锚点 + ≤10 条 1px 毛流），实测 bump 4–10、圆度 2.01–2.53。
- [x] 保留下项全部保留：96×96 / 12 clip / 72 帧 / y=89 / anchor(48,96) / footBox / 短腿 / v10 连帽+blaze / 灰耳灰尾 / white-dominant 身体。
- [x] 生成/验收实测：`--check`、`--verify`（含 silky 指标门）、cat 测试、消费方测试、`tsc`、`build` 均实跑通过（输出见交付记录）。
- [x] 未调用图像 API、未生成音频；包仍 `placeholder:true` / `ai.status:none` / placeholder-only license，未当 final 发布。
- [x] 外部资料只引用 v1 已抓取的 CFA 页；TICA 403 未作依据。

# 狗生成提示词包 · DOG PROMPT PACK（金毛寻回犬 / Golden Retriever）· 2026-11-20

> **Status: 文档交付（2026-11-20）**。只写文档：未生成图片、未调用图像 API、未生成音频、未改运行时代码/JSON/资产、未 commit/push。
> 实测基线：`desktop-games` HEAD `47438acb7a08f11f4d843ead62179bd1a28edcc0`（开工实测）；本文所有数字来自本机对盘上资产的测量或仓库门禁输出，见 §0.2 / §9。
> 用途：未来「概念稿生成 → 人工像素重绘 → 门禁验收」的**生成提示词与验收契约**。AI 直出 ≠ final；**未经用户/美术线明确批准，不得用任何图像 API 生成猫/狗图片**（沿用 2026-11-17 OC 口径，`docs/art/oc/README.md` §5）。
> 语种：说明中文；`text` / `json` 代码块内是可直接送模的英文 prompt。prompt 里不写角色名/文字/水印（角色尚未命名）。

## 0. 一页纸

### 0.1 锁定结论

| 项 | 结论（默认 = profile A：与盘上运行资产逐项一致） |
|---|---|
| 是谁 | **金毛寻回犬（Golden Retriever）**虚构 AI 宠物 OC；成年犬外观；非官方、与 DeepSeek 无关联；不是真实狗 |
| 视觉口径 | 金黄被毛 + 奶油口吻/胸腹/腿羽 + 垂耳 + 羽状大尾 + **哑光砖红项圈（常驻）** + **风格化矮脚（v11）** |
| 画布/锚点 | `96×96`；anchor `(48,96)` `foot-center`；footBox `(-36,-18,72,18)`；bbox `(9,7,82,83)`（advisory）；**地线 `y=89`** |
| 包契约 | **12 tags / 68 帧**；每帧**硬 alpha**、**1px 闭合轮廓 `#0b1220`**、**≤20 可见色**（anim 包门禁；`default-packs` 另要求 ≤40；实测最大 16、全包 17） |
| 帧表 | idle 6@6 loop · idle_blink 3@12 · walk 8@10 loop · run 6@14 loop · pat_head 4@8 · ball_throw 5@10 · ball_chase 6@12 · paw_face 5@8 · scratch 6@8 · stand_wag 6@8 · chase_tail 6@10 · attack 7@16 非均匀（见 §4.3） |
| 颜色 token | **18 role / 17 个不同 hex**（`eye_hi` 与 `fx` 同为 `#F4F9FF`）；权威表见 §3.1；颜色 id `dog-anim-placeholder@0.1`（占位，final 必须换 token） |
| 动作可达性 | 可达：idle / idle_blink / pat_head / ball_throw / ball_chase / paw_face / scratch / stand_wag / chase_tail / run；**spec-only 冻结：walk / attack**（2026-11-20 MB-047/E5-T7） |
| 缺少的专属帧 | `talk`/`bark`、`remind`/`nudge`、`drag`、`land`、`sleep` 无专属 tag，当前行为映射到 `idle`；要做专属帧 = 升契约（`famling.pet-anim/0.2`） |
| 第二口径 | **profile B = 2026-11-17 OC 提案**（标准成年比例、默认无项圈、OC 提案色板、舌 ≤2px、禁腮红）。B 未拍板，**不得与 A 混用** |

### 0.2 本机实测基线（2026-11-20，用于验收对照）

| 项 | 实测值 | 证据/方法 |
|---|---|---|
| 仓库 HEAD | `47438acb7a08f11f4d843ead62179bd1a28edcc0` | `git rev-parse HEAD` |
| 动画包 | `public/assets/pet/anim/dog/`，**69 个文件 = 68 PNG + manifest.json** | `find` 计数；测试要求目录恰好 帧数+1 |
| 帧格式 | 96×96 RGBA，**0 帧有半透明 alpha**（硬 alpha 0/255） | PIL 扫描 68 帧 |
| 可见色 | **每帧最大 16 个不同 hex；全包并集 17 个不同 hex**（18 role，`eye_hi`=`fx`=`#F4F9FF`） | PIL 扫描；与 FCI `maxColours=16 / uniqueColours=17` 一致；设计参考写「全局 18 role / 每帧 16–19」，口径差异见 C12 |
| 地线/边距 | 68 帧**底边全部 y=89**；并集 bbox `(11,8)-(90,89)`；0 帧触画布边 | PIL 扫描；bbox `(9,7,82,83)` 可容纳 |
| 唯一帧 | **66/68**（SHA-256）；跨 clip 重复 2 组：`scratch_00 = chase_tail_05`、`scratch_05 = stand_wag_05`。**2026-11-20 裁定 = alias：保留 68 个文件，不删帧 / 不重画** | 逐文件 SHA-256；记录在 `character.json.meta.duplicateFrames`；`tests/pet-anim-dog-asset-hygiene.test.ts` 对照磁盘哈希锁定 |
| 包体积 | **119,611 B**（≈116.8 KiB，<500KB 门禁） | `du -sb` |
| FCI 校验 | `npm run fci:validate` → **exit 0，ok=true**，7 targets / 0 errors / 2 warnings；`pet-dog`：**17 states / 18 rules / 18 slots / 12 tags / 68 frames / missing 0 / maxColours 16 / uniqueColours 17** | 本机 Windows node 实跑（见 §9.1） |
| 生成器复验 | `python3 scripts/gen-pet-anim-frames.py --only dog --check` → `check ok: dog (blink end 15 px, idle envelope 449 px) animation packs verified` | 本机实跑 |
| 单测 | `tests/pet-anim.test.ts` + `tests/default-packs.test.ts` → **21/21 pass** | 本机以 Windows node v24.22.1 实跑（WSL node 因 `node_modules` 是 win32 esbuild 无法跑测，见 §9.1） |
| 行为/区域单源 | `node scripts/gen-character-interactions.mjs --check` → `check ok (3 characters, 10 event-clips)` | 本机实跑 |

### 0.3 两套生成口径（先选 profile，再复制 prompt）

| | profile A · 运行资产锁定（默认） | profile B · OC 提案（待拍板） |
|---|---|---|
| 用途 | 延续/补完现有 96×96 占位资产；未来正式美术**替换但视觉不变** | 走 2026-11-17 OC 方向的新设计（换掉矮脚/项圈/提亮金色） |
| 体态 | 风格化矮脚长身：正面可见前腿 16px、侧视可见腿 14–17px（v11） | 标准成年金毛比例，头身约 1:2.5–3，不矮脚 |
| 项圈 | 常驻哑光砖红 3 带（`#a63d35`/`#bd5a50`/`#7d2f2a`），68/68 帧都有 | 默认无项圈；可选深青布项圈 + 黄铜牌（旧提案 C） |
| 色板 | 本文件 §3.1 实测 17 色 | OC `PROMPTS.md` §1 的 12 token（映射见 §3.4）——**整包换，不混用** |
| 舌/腮红 | 兴奋帧舌 3–16px；pat_head/paw_face 有 5–10px 腮红 | 舌 ≤2px；禁腮红/心形瞳/湿眼 |
| 默认 | **是** | 否（用户/美术线拍板后整体切换） |

## 1. 真源、优先级与冲突裁定

### 1.1 真源优先级（本文件不自立 canon）

1. 用户最新明确指令（2026-11-18 金毛寻回犬重设计、砖红项圈、矮脚化；2026-11-20 spec-only 冻结）；
2. 盘上运行资产：`public/assets/pet/anim/dog/**`、`public/characters/pet-dog/{character,behavior,regions}.json`；
3. 生成器：`scripts/gen-pet-anim-frames.py`（包壳/调色板/帧调度）+ `scripts/dog_golden5.py`（金毛绘制几何）+ `scripts/anim_timing.py`；
4. 计时单源：`src/pet/anim/timing.json`（12 clip 帧表 + specOnly）；行为/区域单源：`src/pet/anim/interactions/dog.json`；
5. 门禁：`tests/pet-anim.test.ts`、`tests/default-packs.test.ts`、`npm run fci:validate`、`scripts/gen-character-interactions.mjs --check`；
6. 设计稿：`docs/design/PET-ANIMATION-2026-11-18.md` §10–§14（v7–v11 迭代与实测）；`docs/PET-DOG-ANIM-V7-2026-11-18.md`；
7. OC 文档：`docs/art/oc/dog/{OC,PROMPTS,RUNTIME-MAP}.md`（2026-11-17）——**历史口径/提案**，与当前资产冲突时以 2/3 为准；
8. 旧占位：`public/assets/pet/dog-placeholder/**` 与 `docs/art/ART-DEFAULTS-UI-2026-11-16.md` §3.3——**已作废**，只作反面参照，禁止当参考图。

> 工程参考（同源，2026-11-19）：`docs/content-packs/DOG-DESIGN-REFERENCE.md`（画布/帧/18 role 色板/剪影/语气/禁止事项，`rolePresets[2]` 与第三方犬科主题包的设计参考）与 `docs/content-packs/ANIM-PACK-0.2.md`（第三方新 rig 包的 12 clip/68 帧预算）。两者与盘上实测冲突时以盘上资产为准。

### 1.2 冲突与裁定（只记录，不擅自改现有文件）

| # | 冲突 | 证据 | 裁定/动作 |
|---|---|---|---|
| C1 | OC 提案色板 vs 运行资产实测色板 | `docs/art/oc/dog/PROMPTS.md` §1（#E0A94F 等）vs 生成器 `DOG_COLORS`（§3.1） | A 用实测 18 role/17 hex；B 用 OC 提案色整包替换；映射见 §3.4，**禁止半套混用** |
| C2 | 项圈：OC 写「默认无」，运行资产 68/68 帧有 | `rgba` 扫描：每帧 collar 相关像素 >0（正面 44px、侧视 12px） | A 项圈常驻锁定；B 无项圈；切换时必须同时改色板/验收图 |
| C3 | 体态：OC 写标准成年比例，运行资产是 v11 矮脚 | `docs/design/PET-ANIMATION-2026-11-18.md` §14；生成器 `SIDE_BODY_DROP=9`/`FRONT_LEG_TOP=68` | A 锁定矮脚风格化；B 标准比例。两套的负面词不同（§8.2） |
| C4 | 计数：OC/RUNTIME-MAP 写 7 tags/36 帧/8 states，当前是 12/68/17 | `timing.json`、manifest、FCI 实测（§0.2） | 一律用 12 tags/68 帧/17 states；OC 三件套是 2026-11-17 历史基线 |
| C5 | 舌：OC 写 ≤2px，运行资产兴奋帧 3–16px | 逐帧像素统计：run 7px/帧、ball_throw f3-4 8px、ball_chase f5 16px、chase_tail f1 3px、attack f3/f4 8/12px | A 记录实测（张口+舌 2 层）；B 按 OC ≤2px |
| C6 | 腮红：OC 列为禁忌，运行资产 pat_head/paw_face 有 | pat_head f1/f2 = 10/5px；paw_face f2/f3 = 9/5px；另有 spark FX | A 保留 2 帧低饱和腮红（#e7a08f）+ 星光；B 禁用 |
| C7 | 缺 tag：talk/sleep/drag/land/bark/nudge 无专属帧 | `behavior.json`/`interactions/dog.json`：bark/nudge/drag/land/sleep 全映射 `idle` | 若产品要差异化 = 新增 tag，须升 `famling.pet-anim/0.2` 并同步 timing/manifest/测试；不要在现有 12-tag 包里偷偷加文件 |
| C8 | walk/attack 无产品入口 | `timing.json` `specOnly`（2026-11-20 MB-047/E5-T7）；interactions 无对应 state/action | **不要作为「当前动作」生成**；仅当产品重新放行时按 spec 补 |
| C9 | 2026-11-18 动画包未登记许可/来源 | `ASSET-LICENSES.md` 只列 `public/assets/pet/*-placeholder/`；`AI-PROVENANCE.md` §9 快照为 2026-11-17，未列 `pet/anim/**` | **已解决（2026-11-20）**：dog 包已登记 `ASSET-LICENSES.md`（2026-11-20 节）与 `AI-PROVENANCE.md` §11（确定性生成、`ai.status=none`、placeholder-only）；cat/human 仍待各自任务补登 |
| C10 | `needs`/`care.feed` 仍在行为数据里 | `interactions/dog.json` `abilities.needs/care` + hunger/energy/fun 衰减 | 美术侧**不生成**食盆/食物/喂食桥段；机制去留由产品拍板（不在本文件改） |
| C11 | `character.json` 元数据滞后 | `meta.artPack: pet.dog.anim.placeholder@v7`、note 写 v7；实际绘制已到 v11（矮脚+红项圈） | **已解决（2026-11-20）**：`meta.artPack` → `pet.dog.anim.placeholder@v11`，note/license 同步；`meta.duplicateFrames` 记录 2 组 alias；palette 仍 `dog-anim-placeholder@0.1`（未换 final，保留占位 token） |
| C12 | 色数口径：设计参考写「全局 18 role；每帧 16–19」，本机逐帧不同 hex 实测最大 16 | `docs/content-packs/DOG-DESIGN-REFERENCE.md` §1/§3 vs 本机 PIL 扫描（§0.2） | 18 是 role token 数（`fx` 与 `eye_hi` 同 hex 不同语义）；门禁按 **≤20 色/帧** 执行，交付记录写清“不同 hex”口径（每帧最大 16、并集 17）；不据此放宽门禁 |

## 2. 角色锁定卡（CHARACTER LOCK）

### 2.1 一句话锁定 + 英文身份母版（profile A，可直接用）

一句话：**成年金毛寻回犬，金黄毛、奶油口吻/胸腹/腿羽、垂耳、羽状大尾、无眼斑，常驻哑光砖红项圈，风格化矮脚；96px 平涂硬边像素，1px 深蓝黑闭合轮廓。**

```text
IDENTITY LOCK (golden retriever pet OC, profile A / current runtime art):
original stylized golden retriever dog OC, fictional AI pet character, non-official, no DeepSeek affiliation, AI concept draft, not final art;
single quadruped dog sprite, full body, adult golden-retriever head (not a puppy, not a big-headed chibi), default front-facing seated pose; side profile reserved for walk/run only;
warm golden coat base #d9a251, honey-gold top-left highlights #f2cf87, brown-gold shadows #a96a26, cream muzzle/chest/ruff/leg feathering #f8ecd0, darker drop ears #bd7c2e with #96621f inner shadow; no eye patch, no saddle patch, no dark mask;
large soft floppy drop ears hanging beside the cheeks (not cat ears, not cropped, not pointy), ear height about 13 px at 96 canvas, outer edge passing the eye line;
thick feathery plumed tail (cream feather tips on gold), relaxed or swaying, never curled into a ring, never short;
calm friendly brown eyes #5b3a1c with a single clean 1 px catch-light #f4f9ff, warm direct gaze, no puppy pleading eyes; near-black warm brown nose #171310, closed mouth by default;
matte brick-red collar always on, 3 px bands: base #a63d35, 1 px top highlight #bd5a50, 1 px bottom shadow #7d2f2a; no blue collar, no gold tag;
stylized short-legged adult proportions (v11): front view visible foreleg about 16 px, side view visible leg 14-17 px, longer body, broad chest, stocky silhouette, head/body not chibi;
flat cel shading with 2-3 hard-edged steps, exactly one 1 px closed union outline #0b1220, no internal black lines, no anti-aliasing, no gradient, hard alpha only, limited palette;
96x96 sprite canvas, ground line y=89, foot-center anchor, transparent background, no ground shadow, no scenery, no text, no logo, no watermark, single character only;
chunky pixel-art concept, readable silhouette at 1x, not final pixel art.
```

### 2.2 LOCK 表（生成时逐项检查）

| 项 | 锁定值 | @96 像素证据 |
|---|---|---|
| 品种/年龄 | 金毛寻回犬，成年犬外观，不幼犬化 | 头部 `HEAD_SCALE=0.88`（正面）/`SIDE_HEAD_SCALE=0.90`（侧视） |
| 被毛主色 | 金黄 `#d9a251`（非金棕/棕黑/红棕） | body 角色为最高频色 |
| 亮/暗 | 亮 `#f2cf87`（左上硬光）、暗 `#a96a26` | 平涂 2–3 阶、无渐变 |
| 奶油区 | 口吻、胸口 V 羽、腹/腿后缘羽、尾羽尖 `#f8ecd0` | idle 6 帧合计约 1,900 px 奶油 |
| 耳 | 垂耳 2 片、耳高约 13px、耳根 y≈19–20、外缘 x≈27/69；耳内 `#96621f` | `dog_golden5.py front_head()` |
| 尾 | 羽状大尾，尾根粗、奶油羽尖；不卷圈、不短尾 | `front_tail()` / `side_tail()` |
| 眼 | 4×4 深棕 `#5b3a1c` + 1px `#f4f9ff` 高光；正面眼中心约 (42,24)/(54,24) | `front_head()` |
| 鼻/口 | 近黑暖棕鼻 `#171310`，鼻 5×4；闭嘴 1px 线；张嘴内腔同鼻色 | `front_head()` |
| 项圈 | 砖红 3 带常驻：`#a63d35`/`#bd5a50`/`#7d2f2a`；正面 x 38–58、y 41–44（3 带） | 68/68 帧均含 collar |
| 体态 | 矮脚：正面可见前腿 16px（89−73，腹线约 72–73）、侧视可见腿 14–17px；宽胸结实 | 生成器常量 + `docs/design/PET-ANIMATION-2026-11-18.md` §14 |
| 轮廓 | 1px 闭合 `#0b1220`，内部不用轮廓色 | 测试 `offOutline/boundary ≤ 5%`（dog 容差，唯一已知 `chase_tail_03` ≤10px 毛簇） |
| 画布 | 96×96 / anchor (48,96) / footBox (-36,-18,72,18) / bbox (9,7,82,83) / 地线 89 | `character.json` + manifest + 实测 |
| 朝向 | 默认正面坐姿；侧视只用于 walk/run（面向左） | manifest tags + 帧表 |

### 2.3 VARIANT（可变/待拍板，不影响 A 的默认锁定）

- 项圈可有/可无（B）；项圈若保留，只能砖红三带，不得改蓝/黑/荧光。
- 腮红仅允许 pat_head f1/f2 与 paw_face f2/f3 的 5–10px 低饱和 `#e7a08f`；不得扩到其他帧。
- 表情高光允许 1px（默认）或 wide 眼的 2px 高光；不得眼白大面积。
- 道具：ball 只允许 ball_throw / ball_chase 两 clip（`#d9713c` + `#f3c08a` 高光），不得出现在 idle 等帧。
- 头发/饰品/衣服/名字/文字：一律不加。

### 2.4 禁止漂移（出现任一即打回）

金棕/棕黑/红棕毛、眼斑/鞍斑/黑面罩、猫耳/立耳/裁耳、短尾/卷尾/无尾/细鞭尾、幼犬大头/chibi、腮红主特征/心形瞳/湿眼/卖惨、人形/人类手/站立扑人、猫胡须/猫脸、蓝项圈 + 金牌、导盲犬背带/服务犬背心、衣服/头巾/蝴蝶结、真实狗照片/3D/写实毛发/渐变/半透明/AA、文字/Logo/水印/UI/第二角色/地面阴影/家具、官方 DeepSeek 元素、食盆/食物/喂食桥段。

### 2.5 旧占位 vs OC 提案 vs 当前资产（差异速查）

| 项 | 旧占位（作废） | OC 提案（2026-11-17，B） | 当前运行资产（A，锁定） |
|---|---|---|---|
| 毛色 | 金棕 `#c79a5b` | 金黄 `#E0A94F` | 金黄 `#d9a251` |
| 眼斑 | 有 `#b3834c` | 无 | 无 |
| 项圈 | 蓝 `#2e6b9e` + 金牌 | 默认无；可选深青+黄铜 | 砖红 `#a63d35` 三带，常驻 |
| 腿/比例 | 常规 | 标准成年金毛 1:2.5–3 | **风格化矮脚**（前腿可见 16px） |
| 帧契约 | 7 tags / 36 帧 | 7 tags / 36 帧（旧契约） | **12 tags / 68 帧** |
| 舌 | ≤2px | ≤2px | 兴奋帧 3–16px |
| 腮红 | 无 | 禁 | pat/paw_face 5–10px |
| 状态 | 已不被 `pet-dog` 引用（文件仍在） | 提案 | 17 states / 18 rules / 18 slots |

## 3. 配色（PALETTE）

### 3.1 权威调色板（从 68 帧实测；profile A）

| role | hex | 用途 | 实测用量（每 clip 总像素，参考） |
|---|---|---|---|
| `outline` | `#0b1220` | 唯一 1px 闭合外轮廓；内部禁用 | 1,267–2,502 px/clip |
| `body` | `#d9a251` | 金黄主体 | 4,989–13,331 px/clip |
| `shade` | `#a96a26` | 暗部/腿阴/耳根折痕/细节分隔 | 108–249 px/帧 |
| `light` | `#f2cf87` | 左上硬光/额头饰毛/口吻亮面 | 384–1,227 px/clip |
| `belly` | `#f8ecd0` | 奶油：口吻、胸 V、腹/腿后羽、尾羽尖 | 957–2,159 px/clip |
| `ear` | `#bd7c2e` | 垂耳主色（比 body 深） | 324–726 px/clip |
| `ear_inner` | `#96621f` | 耳内/耳根暗 | 99–252 px/clip |
| `eye` | `#5b3a1c` | 虹膜/瞳孔（深棕，不用纯黑） | 26–118 px/clip |
| `eye_hi` | `#f4f9ff` | 每眼 1px 眼高光 | 2–20 px/clip |
| `fx` | `#f4f9ff` | 星光/运动线/尘土/冲击线 FX（后绘、不描黑边；与 `eye_hi` 同 hex、不同 role） | 见各 clip |
| `nose` | `#171310` | 鼻头、嘴线、张口内腔 | 54–179 px/clip |
| `tongue` | `#e08a86` | 舌（仅兴奋/追咬帧） | 3–16 px/帧 |
| `collar` | `#a63d35` | 项圈底色（正面 3px、侧视 3 行） | 12（侧）/44（正）px/帧 |
| `collar_hi` | `#bd5a50` | 项圈 1px 高光 | 46–133 px/clip |
| `collar_dark` | `#7d2f2a` | 项圈 1px 暗边 | 63–147 px/clip |
| `ball` | `#d9713c` | 只用于 ball_throw/ball_chase 的球 | 3–21 px/帧 |
| `ball_hi` | `#f3c08a` | 球 1–3px 高光 | 1–3 px/帧 |
| `blush` | `#e7a08f` | 只 pat_head f1/f2、paw_face f2/f3（5–10px） | — |

> 计数口径：本调色板共 **18 role token、17 个不同 hex**（`eye_hi` 与 `fx` 同值）；§0.2 的“每帧 16 / 并集 17”按**不同 hex** 计。

### 3.2 用色规则

1. **角色固定**：同一 role 的 hex 在 68 帧里不得漂移；不要用邻近色“接近即可”。
2. **轮廓唯一**：`#0b1220` 只能出现在外轮廓；内部结构用 `shade`/`light`/`belly`/`ear_inner` 分隔（测试保证“内部黑线 0”）。
3. **光源**：左上硬光；亮部在左上、暗部在右下；2–3 阶硬边，**无渐变/无 AA/无半透明**。
4. **禁纯黑纯白大面积**：最暗是 `#171310`/`#0b1220`，最亮是 `#f4f9ff`/`#f8ecd0`；不允许 `#000000`/`#ffffff` 块面。
5. **对比**：砖红项圈必须对金毛 `#d9a251` 与暗部 `#a96a26` 都一眼可辨；眼高光 1px 必须可读。
6. **道具色**：球只允许 `#d9713c`/`#f3c08a`；不得新增未登记色。

### 3.3 色数预算与换色规则

- 每帧硬上限：`default-packs` **≤40**；**anim 包另有 `pet-anim` ≤20/帧**（更严，按 20 执行）。当前实测 **最大 16**；新美术目标 **≤20**，final 也不得超 40（实际以 20 为准）。
- 工程参考 `DOG-DESIGN-REFERENCE.md` §1 写「每帧 ≤20 色（实测 16–19）」；本机逐帧不同 hex 最大 16。两者不矛盾：以 **≤20 为门禁**，交付记录写清计数口径（role vs hex）。
- 调色板 id 必须同时登记在 `manifest.palette` 与 `character.json.palette`；当前占位 id = `dog-anim-placeholder@0.1`。
- final 美术上线时建议新 id（示例：`dog-golden-retriever@1.0`，**未注册，仅建议**），并同步 `palette`、`license`、`ai`、`placeholder`、`generator` 字段。
- 换色 = 整包换：不得只换主体不换耳/尾/项圈；不得保留旧蓝项圈像素。

### 3.4 profile B：OC 提案色板 → 运行色板映射（仅整体切换时用）

| OC 提案 token | 运行资产 role/hex | 说明 |
|---|---|---|
| `#E0A94F` 主体 | `body` `#d9a251` | 提案更亮/更黄；切换后整包重调 |
| `#F0C877` 亮部 | `light` `#f2cf87` | 接近 |
| `#B97F33` 阴影 | `shade` `#a96a26`（或 `ear` `#bd7c2e` 用于耳） | 提案偏红棕 |
| `#8A5A22` 深阴影 | `ear_inner` `#96621f` | 接近 |
| `#F2D9A8` 胸腹浅色 | `belly` `#f8ecd0` | 运行资产更奶油 |
| `#6A4A2E` 虹膜（深 `#4A3320`） | `eye` `#5b3a1c` | 运行资产更深 |
| `#F4F9FF` 高光 | `eye_hi` `#f4f9ff` | 相同 |
| `#232227` 鼻 | `nose` `#171310` | 运行资产更暖更深 |
| `#D98F8F` 舌 | `tongue` `#e08a86` | 接近 |
| `#2E6B9E` + `#D8B36A` 项圈/铜牌 | `collar` `#a63d35`/`#bd5a50`/`#7d2f2a` | **完全不同的配件方案**；B 默认无项圈 |
| `#0B1220` 轮廓 | `outline` `#0b1220` | 相同 |

> 规则：B 的 prompt 必须使用 OC 提案 hex，且同时切换体态/项圈/舌/腮红口径；**A/B 混用视为漂移**。

### 3.5 禁用色/禁用件

- `#000000`/`#ffffff` 块面、荧光色、彩虹渐变、蓝色项圈 `#2e6b9e`、金牌 `#d8b36a`、旧眼斑 `#b3834c`、绿眼/蓝眼、腮红 `#ff9db0` 类高饱和粉。

## 4. 像素规格（PIXEL SPEC）

### 4.1 画布与几何

| 项 | 值 | 备注 |
|---|---|---|
| canvas | `96×96` | 当前唯一零窗口改动画布 |
| anchor | `{x:48, y:96, mode:'foot-center'}` | 脚底中心 |
| footBox | `{x:-36, y:-18, w:72, h:18}` | 与旧包/猫包一致 |
| bbox（advisory） | `[9, 7, 82, 83]`（x,y,w,h） | 实测并集 `(11,8)-(90,89)` 落在其中 |
| 地线 | **所有帧最底部不透明像素 y=89**；y=90–95 恒透明 | 68/68 实测 + 设计参考 §1 |
| 安全边距 | 任何帧不得触画布四边；四角必须透明 | 实测最小边距：左 11、上 8、右 5、下 6 |
| display | `scale: 2` + `image-rendering: pixelated` | 1×/2× 整数放大，禁插值 |

### 4.2 alpha / 轮廓 / FX 硬规则

1. **硬 alpha**：全帧只有 0 或 255（实测 0 帧半透明）。
2. **闭合轮廓**：主剪影恰好 1px `#0b1220`；边界像素轮廓色覆盖率 ≥95%（dog 允许 ≤5% 缺口，现已知 `chase_tail_03` 一处 ≤10px 毛簇/爪尖未描边）。
3. **内部无黑线**：内部结构不得用 `#0b1220`；用 `shade`/`light`/`belly`/`ear_inner` 分隔。
4. **可分离 FX**：运动线/星光/冲击线/尘土是独立小图元（`draw_fx`，在轮廓之后画、无黑边），**单个 detached 组件 ≤64px 且 ≤8 色**；主剪影仍必须闭合。
5. **无洞**：不得出现被完全包围的透明洞；前后爪之间用 1px 透明缝（与外部连通），不要用封闭洞。
6. **无阴影/无场景**：透明底，不画地面阴影、家具、第二角色、文字/Logo/UI。

### 4.3 帧表（唯一源：`src/pet/anim/timing.json`）

| # | clip | 帧@fps | loop | duration | layer/priority | 视角 | 可达性（2026-11-20） |
|---|---|---|---|---|---|---|---|
| 1 | `idle` | 6@6 | loop | 1000ms | base/0 | 正面 | 基础循环 + ambient |
| 2 | `idle_blink` | 3@12 | one-shot | 250ms | overlay/10 | 正面 | 眨眼调度 / ambient 状态 `idle_blink` |
| 3 | `walk` | 8@10 | loop | 800ms | base/5 | 侧视（左） | **spec-only 冻结**（无 state/rule/action） |
| 4 | `run` | 6@14 | loop | 429ms | base/15 | 侧视（左） | 可达：菜单动作「跑一跑」/ `run` 事件（timeout 2500ms） |
| 5 | `pat_head` | 4@8 | one-shot | 500ms | oneshot/50 | 正面 | 可达：摸头（head tap / `pat` / `pat_head`） |
| 6 | `ball_throw` | 5@10 | one-shot | 500ms | oneshot/40 | 正面 | 可达：菜单「丢球/捡球」/ hero 抛球 |
| 7 | `ball_chase` | 6@12 | one-shot | 500ms | oneshot/45 | 正面 | 可达：菜单「捡球」/ 抛球后 500ms follow-up |
| 8 | `paw_face` | 5@8 | one-shot | 625ms | oneshot/20 | 正面 | ambient 微动作（权重 8） |
| 9 | `scratch` | 6@8 | one-shot | 750ms | oneshot/20 | 正面 | ambient 微动作（权重 8） |
| 10 | `stand_wag` | 6@8 | one-shot | 750ms | oneshot/20 | 正面 | ambient（权重 20）/ body tap / `play`/`feed` |
| 11 | `chase_tail` | 6@10 | one-shot | 600ms | oneshot/20 | 正面 | ambient（权重 9）/ tail tap |
| 12 | `attack` | 7@16 | one-shot | 439ms | oneshot/60 | 正面 | **spec-only 冻结**（无 UI/区域/插件入口） |

### 4.4 attack 非均匀节奏（唯一 non-uniform）

`holdMs = [83, 83, 63, 42, 42, 63, 63]`（总 439ms；局部 FPS 12.05/15.87/23.81；整体有效 15.95）。帧语义：f0–f1 蓄力慢、f2 过渡、f3–f4 命中快帧（右前爪前挥 + 3 条冲击线）、f5–f6 收招。生成时若只产静态帧，必须保持这套时间语义；**不要用统一 16fps 平均化掉命中帧**。

### 4.5 包布局 / 命名 / manifest 契约

```text
public/assets/pet/anim/dog/
  manifest.json
  <clip>/<clip>_NN.png      # NN = 00 .. frames-1，两位补零；12 个 clip 目录
```

- 目录恰好 **68 PNG + manifest.json = 69 文件**；不得有旧帧/临时帧/缩略图残留。
- `manifest.assets` 顺序 = tag 插入顺序 = `timing.json.order`；新增/删除帧必须同步 manifest、生成器、测试（契约硬门）。
- manifest 必须保持：`style: pixel-hero`、canvas/anchor/footBox、`placeholder`、`ai.status`、`license`、`palette`、`sourceSpec`、`generator` 字段；`anim` 块保存 clip 时长/层/优先级/`holdMs`/FPS 频段/tracks/bubble/voice。
- 音量/气泡：dog = `mode:none`、`canTts:false`、`bubble:thought`；**帧里不得有文字/对话气泡**，气泡是运行时 UI。
- 包体积 <500KB（当前 119,611 B）。
- `pet-anim` 另断言：每帧 ≤20 色、bbox 不贴边（minX/minY>0、maxX/maxY<95）、四角透明、每 tag ≥2 独立帧、clip 目录文件逐名匹配。

### 4.6 96 → 128/256 升级规则

- **禁止把 96 直接整数放大**（128 是 1.333×、256 是 2.667×，非整数）；256 必须按画布重绘。
- 若升级：anchor = (W/2, H)、footBox = (-0.375W, -0.1875H, 0.75W, 0.1875H)（96 时即 (-36,-18,72,18)）；bbox/地线按比例重定但“脚底中心”语义不变。
- 帧数/tag/时序契约与 96 一致；换画布要同步 `character.json` canvas/anchor/footBox/bbox 与测试，不能只换图。

### 4.7 绘制几何速查（A 口径，来自生成器与实测）

| 部件 | 正面（front） | 侧视（side） |
|---|---|---|
| 地面 | y=89（爪底 83–89，前爪 10×7） | y=89（脚掌 12×6，前缘比腿前伸 2px） |
| 头部 | 头骨约 26×20（x 35–61, y 13–33），整体缩到 0.88；头+耳约 37px | 头缩到 0.90；2px 额段 stop；垂耳 flap 10×16 在头骨之后 |
| 眼 | 2×4×4，中心约 (42,24)/(54,24)，1px 高光 | 3×3 + 1px 高光（杏仁、深棕） |
| 鼻/口吻 | 鼻 5×4（x45–49,y30–33）；口吻 13–16×9；胸口奶油 V | 口吻 13px、鼻近黑、stop 2px |
| 耳 | 垂耳竖椭圆（耳根 y≈19，外缘 x≈27/69，耳高约 13px），耳根 1px `shade` 折痕 | 垂耳画在头骨后，耳内 32px，耳顶 1px light 毛边 |
| 项圈 | 3 带（y 41–45，x 37–59），正面全宽 | 3 行，肩前可见（y≈35–37） |
| 躯干 | 胸宽约 63（x24–87），腹线 y≈73，前腿起点 y=68，可见腿 16px | 背线 y≈45、头顶 y≈23、整体高约 66、可见腿 14–17px；远腿 dx=-3 向后 |
| 尾 | 羽状，宽约 11×10 + 奶油羽 5 组 | 尾主干 8/7/5px + 4 层奶油羽，蓬松 |

## 5. 表情库（EXPRESSION LIBRARY）

### 5.1 眼状态（7 种，全部取自生成器 `front_head()`）

| 名称 | 像素配方（正面） | 语义 | 使用 clip | 英文 prompt 短语 |
|---|---|---|---|---|
| `open` | 每眼 4×4 深棕椭圆（上下各收 1px）+ 1px 高光 | 平静友好、直视 | idle、ball_throw f0-2、stand_wag、scratch f0/f5、attack f0/f5-6、walk | calm friendly open eyes with one 1px catch-light |
| `half` | 上排收起 + 下排 4px 线 + 上缘 1px shade | 放松/享受 | idle_blink f0、pat_head f3、paw_face f1/f4、scratch f1/f2/f4 | relaxed half-closed eyes |
| `half2` | 下排 4px + 右下 1px 瞳孔 + 上缘 shade | 眨眼中段 | idle_blink f2 | mid-blink |
| `closed` | 单行 4px 深棕 + 1px shade 上缘 | 闭眼 | idle_blink f1 | closed eyes, single 1 px line |
| `happy` | 4px 上弧线（^^） | 开心 | pat_head f1/f2、paw_face f2/f3、scratch f3 | happy squinting arc eyes |
| `side` | 4×4 + 侧向瞳孔 + 1px 高光 | 侧看/专注 | ball_chase f0-2、chase_tail f0-4 | eyes glancing to the side |
| `wide` | 4×4 + 2px 高光（上下） | 兴奋警觉 | ball_throw f3-4、ball_chase f3-5、run、attack f1-4 | wide excited eyes with double catch-light |

### 5.2 嘴状态（4 种）

| 名称 | 像素配方 | 语义 | 使用 clip |
|---|---|---|---|
| `closed` | 鼻下 1px 短线段（`nose` 色） | 平静 | idle、idle_blink、ball_throw f0-1、stand_wag f0、scratch f0、attack f0、walk |
| `smile` | 7px 上弧线（`nose` 色） | 微笑 | pat_head、paw_face f1-4、scratch f1-4、stand_wag f1-5、attack f5-6 |
| `open` | 9×5 口腔椭圆（`nose` 色）+ 2 行小舌（约 8px） | 张嘴喘/兴奋 | ball_throw f3-4、ball_chase f0-4、chase_tail f0/f2-4、attack f1-2 |
| `tongue` | 口腔椭圆 + 4 行舌 `#e08a86`（逐帧实测 3–16px，受姿态遮挡） | 吐舌 | run（7px/帧）、ball_throw f3-4（8px）、ball_chase f5（16px）、chase_tail f1（3px）、attack f3/f4（8/12px） |

### 5.3 修饰符（modifiers）

| 名称 | 配方/规则 | 允许范围 |
|---|---|---|
| 腮红 `blush` | 2×3px `#e7a08f` 两颊 | 仅 pat_head f1/f2（10/5px）、paw_face f2/f3（9/5px） |
| 星光 `spark` | 2–3 个 1–2px 菱形 `#f4f9ff`（FX，后画、无黑边） | pat_head f2（头两侧）、scratch f3（右后侧） |
| 旋转线 `air_dash` | 沿圆弧的 1–2px 短线 | chase_tail f0-4（每帧 5 条，按 30° 递增） |
| 冲击线 `bar` | 3 条竖短线（10–14px） | attack f3/f4 右侧 |
| 尘土/运动短线 `dust` | 1–2px `#f4f9ff` 短线/点，后绘无黑边 | run 每帧 1 处（设计参考 §5 称尘土 FX）；不得成大片尘云 |
| 球 `ball` | 3–6px 圆 `#d9713c` + 1–3px `#f3c08a` 高光 | 只 ball_throw（x66→84）与 ball_chase（x74→63） |
| 耳/尾/头位移 | `ear_dy`/`tail_dy`/`head_dx` 整数像素 | 全部 clip；单帧位移 ≤6px（attack/chase_tail 尾巴大幅除外） |

### 5.4 表情 × clip 矩阵（逐帧，生成/验收对照）

| clip | 眼序列 | 嘴序列 | 附加 |
|---|---|---|---|
| idle | open×6 | closed×6 | 呼吸/耳/尾 |
| idle_blink | half, closed, half2 | closed×3 | — |
| walk | open×8 | smile×8 | 侧视；每帧恰 1 脚离地 |
| run | wide×6 | open×6 | 侧视；f0/f4 腾空；舌 7px/帧；1px 运动短线 |
| pat_head | open, happy, happy, half | smile×4 | 腮红 f1/f2；星光 f2 |
| ball_throw | open×3, wide×2 | closed, closed, smile, open, open | 右前爪推球；球 x66→84 |
| ball_chase | side×3, wide×3 | open×5, tongue | 球 x74→63；f3-5 伸爪；f5 舌 16px |
| paw_face | open, half, happy, happy, half | closed, smile×4 | 左前爪抬到脸；腮红 f2/f3 |
| scratch | open, half, half, happy, half, open | closed, smile×5 | 右后腿挠；隐藏同侧地爪；星光 f3 |
| stand_wag | open×6 | closed, smile×5 | 站起（rise 0→6px）；尾快甩 ±5px |
| chase_tail | side×5, open | open, tongue, open, open, open, closed | 尾扫到身前；旋转线；f5 回 idle |
| attack | open, wide×4, open×2 | closed, open, open, tongue, tongue, smile, smile | 蓄力→命中（右前爪+冲击线）→收招；**spec-only** |

### 5.5 表情可复制 prompt（96px 表情 sheet 用）

```text
EXPRESSION SHEET (reference only, never ship labels): the same golden retriever dog head, front view, 96 px pixel art, 7 eye states (open / half / half2 / closed / happy arc / side glance / wide) x 3 mouth states (closed / smile / open + tongue), keep head geometry identical across all cells, no labels, no text, transparent background, 1 px closed #0b1220 outline, hard alpha, flat 2-3 step shading.
```

## 6. 动作提示词（12 CLIP PROMPTS）

> 每条 = 身份母版（§2.1）+ 该 clip 专属句 + 像素规格（§3/§4）+ 负面词（§8）。下面只写**差异句**；`view`/帧数/loop 严格按 §4.3。

### 6.1 `idle` — 6 帧 @6fps loop（正面坐姿）

```text
TAG idle, 6-frame seamless loop at 6 fps, front-facing seated golden retriever, full body, facing camera;
slow breathing: head/body rise -1 px on f1-f2 and settle f3, head +1 px on f5; plumed tail sways 1-3 px (f1 +2, f2 +3, f3 +1, f4 -2, f5 -1); ear tips sway 1 px with the breath;
eyes open with a single 1 px catch-light, mouth closed, calm friendly; collar stays fixed on the chest; first and last frame close for loop; no constant high-energy wagging, no tongue.
```

### 6.2 `idle_blink` — 3 帧 @12fps one-shot（叠加眨眼）

```text
TAG idle_blink, 3-frame one-shot at 12 fps, same idle pose and body position (no breathing offset), only the eyes change: f0 half-closed, f1 fully closed with a 4 px dark line, f2 half-open; mouth closed; tail still; the whole body is otherwise identical to idle f0; no head turn, no body shift.
```

### 6.3 `walk` — 8 帧 @10fps loop（侧视，面向左；spec-only 冻结）

```text
TAG walk, 8-frame seamless loop at 10 fps, side profile facing left, four legs in an alternating walk; each frame has exactly one paw off the ground; body rises and falls 1 px; plumed tail follows with a 1 frame lag; floppy ear flaps; eyes open, mouth smile;
keep the short-legged silhouette (visible leg 14-17 px), ground line y=89, no dust, no motion streaks; first and last frame close; side-view only, never front view.
```

### 6.4 `run` — 6 帧 @14fps loop（侧视，面向左）

```text
TAG run, 6-frame seamless loop at 14 fps, side profile facing left, excited gallop; body lifts on f0 and f4 with all paws off the ground, tail up and streaming, ears back; eyes wide with double catch-light; mouth open with a 7 px tongue; 1-2 tiny detached dust/motion marks (#f4f9ff, 1-2 px, drawn after the outline, never outline color, no large dust cloud);
short-legged stocky body, plumed tail with cream feather tips, collar visible; no dust cloud, no ground shadow; first and last frame close.
```

### 6.5 `pat_head` — 4 帧 @8fps one-shot（正面，被摸头）

```text
TAG pat_head, 4-frame one-shot at 8 fps, front-facing seated dog responding to a gentle head touch (human hand NOT drawn);
f0 neutral; f1 head leans down 1 px, eyes happy arc, smile, small blush; f2 head down 2 px, ears relax -2 px, tail thumps +4 px, two tiny 1-2 px sparkle marks at the sides of the head (no black rim); f3 head returns, eyes half, blush fades;
no hearts, no heart-shaped pupils, no watery eyes, no tongue, no text bubble.
```

### 6.6 `ball_throw` — 5 帧 @10fps one-shot（正面，前爪推球）

```text
TAG ball_throw, 5-frame one-shot at 10 fps, front-facing dog pushing a small ball on the ground with its right forepaw (ball baked into the frame as #d9713c with #f3c08a highlight);
f0 neutral ball at x66; f1 head +1 px, paw starts the push; f2 head tilt, body +1 px, ball rolls to x72; f3 eyes wide, mouth open, ball x78; f4 ball x84 (near the frame edge but not touching it), paw follows through;
tail wags; no human hands, no second character, no text, no motion blur; ball stays small (3-6 px).
```

### 6.7 `ball_chase` — 6 帧 @12fps one-shot（正面，追球扑球）

```text
TAG ball_chase, 6-frame one-shot at 12 fps, front-facing dog chasing and pouncing on the ball;
f0-f2 eyes glance sideways, head turns, mouth open, body dips and rises, ball rolls from x74 to x68; f3-f4 eyes wide, ball x65/x63, right forepaw reaches out to the ball; f5 eyes wide, tongue out 16 px, ball at x63, body settles;
tail wags, ears flick; no human hands, no dust, no text, no second character; ball 3-6 px only.
```

### 6.8 `paw_face` — 5 帧 @8fps one-shot（正面，前爪摸脸）

```text
TAG paw_face, 5-frame one-shot at 8 fps, front-facing seated dog raising its left forepaw to its cheek;
f0 neutral; f1 eyes half, paw lifts to cheek; f2 head tilts -2 px, eyes happy, smile, blush, paw at cheek; f3 same with paw slightly higher and blush; f4 eyes half, paw lowers;
tail sways; the grounded right forepaw must stay visible (no duplicated same-side leg); no human hand, no text, no sparkles except allowed frame.
```

### 6.9 `scratch` — 6 帧 @8fps one-shot（正面，后腿挠痒）

```text
TAG scratch, 6-frame one-shot at 8 fps, front-facing dog lifting its right hind leg to scratch its belly;
f0 neutral; f1-f4 hind leg raised and tucked, body shifts -1/+1 px, eyes half then happy, smile, head tilts -2 px; f3 tiny sparkle at the raised leg (FX, no black rim); f5 returns to neutral;
hide the grounded right hind paw while the leg is lifted (no duplicated limb); no human hand, no text, no dust.
```

### 6.10 `stand_wag` — 6 帧 @8fps one-shot（正面，站起摇尾）

```text
TAG stand_wag, 6-frame one-shot at 8 fps, front-facing dog rising from sit to stand and wagging its plumed tail;
f0 seated; f1 rise +3 px, head -3 px; f2 rise +6 px, head -6 px, tail left; f3 tail right; f4 tail left again, ears flick; f5 back down to seated neutral;
mouth closed on f0 then smile; eyes open; standing frame shows the short-legged silhouette with visible paws and ground line y=89; no bounce beyond 6 px, no human pose, no text.
```

### 6.11 `chase_tail` — 6 帧 @10fps one-shot（正面，追自己尾巴）

```text
TAG chase_tail, 6-frame one-shot at 10 fps, front-facing dog spinning to chase its own plumed tail;
f0 head turns right, tail still, 5 air-dash marks around the body; f1 tongue out, tail sweeps toward the front and the dog looks at it; f2-f4 tail curls in front of the face at different heights with 5 rotating air-dash marks (1-2 px, #f4f9ff, no black rim); f5 returns to neutral seated idle;
no duplicated limbs, no extra tail, no motion blur; the tail must stay attached and plumed with cream feather tips; no text.
```

### 6.12 `attack` — 7 帧 @16fps 非均匀 one-shot（正面；spec-only 冻结）

```text
TAG attack, 7-frame non-uniform one-shot (holdMs 83,83,63,42,42,63,63), front-facing dog play-pounce, NOT a violent attack:
f0 crouch + open eyes; f1-f2 charge, head down, wide eyes, open mouth; f3-f4 pounce: right forepaw swipes forward with 3 vertical impact bars (10-14 px), mouth open/tongue (8-12 px); f5-f6 recover to smile and neutral;
no blood, no teeth close-up, no aggression toward a person; spec-only frozen in the current product (no UI/region entry), do not treat as a shipping action.
```

### 6.13 缺帧说明（不要在生产包里偷加）

`talk`/`bark`、`remind`/`nudge`、`drag`、`land`、`sleep` 当前都渲染 `idle`。如果产品要专属表现，需：新增 tag → 升 `famling.pet-anim/0.2` → 同步 `timing.json`/manifest/`character.json`/生成器/测试；**本 12-tag 包不接受额外 PNG**。

## 7. 生成模板（TEMPLATES）

### 7.1 T1 · 单 tag / 单帧生成

```text
[TAKE ONE]
<IDENTITY LOCK from §2.1>
<PIXEL SPEC from §4: 96x96, transparent, hard alpha, 1px closed #0b1220 outline, flat 2-3 step shading, top-left light, ground line y=89, no text/logo/watermark/shadow/scenery>
<CLIP LINE from §6 for the target tag/frame>
<NEGATIVE from §8 (profile A or B)>
OUTPUT: single character sprite, full body, 1x pixel-art concept, readable at 96x96.
```

### 7.2 T2 · 三视图 turnaround（评审用）

```text
TURNAROUND, same golden retriever dog IDENTITY LOCK, orthogonal turnaround, three full-body views side by side: front, profile facing left, back;
same size and baseline with +/-1 px tolerance, neutral standing pose, four paws on the ground, thick plumed tail behind;
must clearly read in all views: golden coat, cream muzzle/chest/leg feathering, floppy drop ears, broad chest, plumed tail with cream tips, brick-red collar (profile A), no eye patch, no dark mask;
flat cel shading, 1 px closed dark outline, transparent background, no labels, no color swatches, no props, no second character, no text.
```

- 96：头约 26×20、身体约 50–58px、尾约 24–32px；垂耳/大尾靠 1–2px 轮廓可读，不画毛丝。
- 128/256：另绘不放大（§4.6）；三视图只是评审参考，不入包。

### 7.3 T3 · 动作 contact sheet（评审用）

```text
ACTION CONTACT SHEET, same golden retriever dog, front view 1x pixel art, 12 poses in a 4x3 grid: seated idle, blink, walk (side), run (side), head-pat, ball push, ball pounce, paw-to-face, hind-leg scratch, stand-and-wag, tail chase, play pounce; transparent background, consistent size and baseline, no labels, no text, no scenery.
```

### 7.4 T4 · 局部修正（重生成补丁）

```text
FIX PASS, keep everything identical except: <one of: ear shape/size, tail plume/curl, foreleg length, collar bands/color, eye highlight, outline closure, remove FX, remove blush>;
do not change palette, pose, canvas, camera, or frame count; keep 96x96, transparent, hard alpha, 1 px closed #0b1220 outline, flat shading;
return one corrected frame / one corrected tag sheet only.
```

### 7.5 T5 · 从 AI 概念稿到 final 像素的最低流程

1. 生成 concept（任意已批准模型/工具，**本文件不指定模型、不声称调用**）；
2. 裁切/等比缩放 → 调色板量化 → 硬 alpha（可参考 `scripts/pixelize.py` 的思路，但它不是 dog 专用托管脚本）；
3. **人工像素重绘**（Aseprite/PIL 均可）：轮廓、眼/嘴、项圈、尾羽必须逐像素确认；AI 直出不得当 final；
4. 跑门禁（§9.1）+ 1×/4× contact sheet 目视（§9.3）；
5. 更新 manifest/character.json 的 palette/license/ai/placeholder/meta；`ai.status` 如实标注（AI 概念稿 → `concept`，纯手绘 → `none`），并登记 `AI-PROVENANCE.md`。

## 8. 负面词（NEGATIVE）

### 8.1 身份漂移（A/B 共用）

```text
dark brown dog, red-brown dog, black dog, black saddle, eye patch, dark mask, dog with blue eyes, cat eyes;
cat ears, pointy upright ears, cropped ears, short tail, curled tail, ring tail, no tail, thin whip tail, tail detached from body;
puppy proportions, big baby head, chibi child, oversized head, blush as main feature, heart pupils, watery/teary eyes, sparkles everywhere, romantic gaze, seductive pose;
humanoid, anthropomorphic standing, human hands, human face, person, anime girl/boy, clothes, bandana, bow, guide-dog harness, service vest, blue collar, gold tag, collar with bell;
orange tabby cat traits, cat whiskers, feline face, dachshund, corgi, long-legged show-dog stance (only for profile A; see 8.2),
realistic fur, photo-real, 3D render, painterly, gradient fur, glow, blur, anti-aliasing, semi-transparent pixels, soft alpha, pure #000000 / #FFFFFF large areas;
text, letters, watermark, logo, signature, UI, speech bubble, labels, scenery, furniture, food bowl, treats, ground shadow, second character, extra limbs, extra tail, duplicated ears, duplicated same-side paws;
official DeepSeek logo/mascot, official affiliation claim, real animal photo.
```

### 8.2 profile A / B 专属开关

- **profile A（默认）额外负面**：`long-legged show-dog stance, standard show golden retriever proportions, no collar, collarless`——因为 A 要矮脚 + 红项圈。
- **profile B 额外负面**：`short-legged, dachshund proportions, corgi proportions, long body low legs, brick-red collar`——因为 B 要标准比例 + 默认无项圈。

### 8.3 风格/工程负面（A/B 共用）

```text
no anti-aliasing, no soft alpha, no semi-transparent pixels, no gradient, no blur, no glow, no drop shadow, no ground shadow, no perspective, no 3/4 camera, no rotation;
no text/logo/watermark/labels/UI/swatches; no multiple characters; no extra frames; no collage borders; no background;
not 128x128, not 256x256, not non-integer scale; no pixel upscaling artifacts; no subpixel placement; no off-palette colors; no pure black or pure white blocks.
```

### 8.4 内容/合规负面（A/B 共用）

```text
no feeding/food/treats/hunger imagery, no begging for food, no sad abandoned dog, no separation anxiety, no sick/injured dog, no vet/medical scene, no romantic or sexual content, no 18+ content, no child-like sexualization, no real person, no human hands, no leash or leash-holding human, no real animal photo, no official DeepSeek branding, no service-dog or guide-dog identity, no violence/blood/combat aggression.
```

### 8.5 旧占位负面（防回退）

```text
golden-brown coat with eye patch, blue collar with gold tag, tabby-cat-like dog, old placeholder dog, 7-tag 36-frame layout, 8-frame idle.
```

## 9. 验收（ACCEPTANCE）

### 9.1 工程门禁（每个帧包都必须过）

| # | 命令（在 `desktop-games/` 跑） | 期望 | 本机实测（2026-11-20） |
|---|---|---|---|
| 1 | `python3 scripts/gen-pet-anim-frames.py --only dog --check` | exit 0，`check ok: dog ...` | 通过（若保留确定性生成器；final 手绘后可移除该依赖，需在文档改口径） |
| 2 | `node --import tsx --test tests/pet-anim.test.ts tests/default-packs.test.ts` | 全 pass | **21/21 pass**（须使用与 `node_modules` 匹配的平台；本机用 `/mnt/c/Program Files/nodejs/node.exe`，WSL node 会因 win32 esbuild 报 `TransformError`——是环境问题，不是代码失败） |
| 3 | `npm run fci:validate` | exit 0，`ok:true`，dog `missing 0` | **exit 0 / ok true / 0 errors**；`pet-dog` 17 states/18 rules/18 slots/12 tags/68 frames |
| 4 | `node scripts/gen-character-interactions.mjs --check` | `check ok` | 通过（3 characters, 10 event-clips） |
| 5 | `npx tsc --noEmit` | 0 error | 涉及运行时/数据变更时必跑（纯美术替换可后置） |

> 注意：`python3 ... --check` 是“生成器 = 盘上资产”的逐字节门；**不要手改 PNG**，否则会被判 STALE。若 final 美术不再由生成器产出，应明确移除 check 依赖并更新测试/文档。

### 9.2 帧级硬检查（测试自动断言，任何一条失败即拒收）

| 检查 | 阈值 | 来源 |
|---|---|---|
| 尺寸 | 每帧 96×96 | `default-packs` |
| alpha | 只有 0/255（硬 alpha） | `default-packs`、`pet-anim` |
| 剪影 | 不透明像素 >400 且 <9216 | `default-packs` |
| 四角 | (0,0)/(95,0)/(0,95)/(95,95) 全透明 | `default-packs` |
| 颜色 | 每帧可见色 ≤40（`default-packs`）且 **≤20（`pet-anim`，anim 包）**；当前最大 16 | `default-packs`、`pet-anim` |
| 轮廓 | 主剪影边界像素 ≥95% 为 `#0b1220`（dog 允许 ≤5% 缺口；已知 `chase_tail_03` ≤10px） | `default-packs` |
| 分离 FX | 单个 detached 组件 ≤64px、≤8 色 | `default-packs` |
| 帧差异 | 每个 tag ≥2 帧不同 | `default-packs` |
| 猫狗差异 | 同 tag 首帧 RGBA 数据差异 >10% | `default-packs` |
| 目录 | 恰好 68 PNG + manifest.json，无多余文件 | `default-packs` |
| 体积 | 包 <500KB | `default-packs` |
| 帧表 | 帧数/fps/loop 与 `timing.json`/manifest 一致 | `pet-anim` |
| 地线/边距 | 不触画布边（`pet-anim` 断言 bbox min>0 且 max<95）；底边 y=89 为实测基线（测试只保证 maxY<95，未锁 89） | `pet-anim` + 本文件 §4.1 |

### 9.3 目视检查（人工，1× 与 2×）

- [ ] 1× 下剪影可辨：垂耳、宽胸、羽状大尾、短腿、红项圈一眼能认出。
- [ ] 金黄 vs 奶油 vs 暗金三阶清楚，没有“脏/糊/渐变”感。
- [ ] 表情可读：open/happy/half/closed/side/wide 与 smile/open/tongue 与 §5.4 矩阵一致。
- [ ] 动作可读：摸头、推球、扑球、摸脸、挠痒、站起摇尾、追尾各自能看出；walk/run 不混淆。
- [ ] 无眼斑/黑面罩/蓝项圈/猫耳/短尾/卷尾/人形/人类手/第二角色/文字/Logo/阴影。
- [ ] 96 与 2× 窗口都检查；4× contact sheet 存档（1x/4x 各一张）。

### 9.4 合规与声明检查

- [ ] `placeholder`/`ai.status`/`license` 与真实情况一致；AI 概念稿须标 `concept` 并走 `AI-PROVENANCE.md`，不得宣称 final。
- [ ] **`ASSET-LICENSES.md` 与 `AI-PROVENANCE.md` 尚未登记 `public/assets/pet/anim/**`**（见 C9）：final/发布前必须补登，否则保持 placeholder-only、不得对外发布。
- [ ] dog 为 `bubble:thought`、`canTts:false`：不得有任何 TTS/真人声线/真实动物录音宣称；帧内无文字气泡。
- [ ] 非官方：不得使用 DeepSeek Logo/字标/官方形象；不得宣称官方合作/授权。
- [ ] 不生成喂食/饲养/生病/攻击性拟真桥段；不诱导依赖。

### 9.5 失败处理

1. 生成帧不合格 → 回生成/重绘，**不要**在现有 PNG 上手改（会被 `--check`/测试判 STALE）。
2. 要改帧数/帧率/tag → 必须改 `timing.json` 母版 + 生成器 + manifest + 测试 + 文档；涉及新 tag 还要升契约版本。
3. 要改画布/anchor/footBox → 同步 `character.json`、manifest、测试；96→128/256 必须重绘（§4.6）。
4. 要改色板/项圈/体态 → 视为 A/B 口径切换：整包、整文件、整测试一起改，不得只改一帧。

### 9.6 证据归档（每次生成/替换都留）

- contact sheet：1× 与 4× 各一张（12 tags 首帧 + 关键帧）；
- 逐帧 metrics（尺寸/色数/底边 y/bbox/唯一性）文本；
- 门禁命令与输出（§9.1 五条）；
- 生成方式与来源（模型/工具/seed 是否可用/人工后处理），写入 `AI-PROVENANCE.md`；
- 文件 SHA-256（至少 manifest 与生成器），写进交付记录。

## 10. 未生成与 AI / 许可声明（本轮）

- 本轮**没有生成任何狗图片、没有调用图像 API、没有生成音频**；本文件是文本交付。
- 现有 `public/assets/pet/anim/dog/` 是**确定性程序化占位**（`scripts/gen-pet-anim-frames.py`，无模型、无网络），license 字段为 `placeholder-only`（商用未授权）；**占位 ≠ final**，禁止当成品宣传/发布。许可/AI 登记见 `ASSET-LICENSES.md` 2026-11-20 节与 `AI-PROVENANCE.md` §11。
- 未来若获批生成：AI 输出只能是 concept/placeholder，须经人工像素重绘 + §9 门禁 + 2× 终审；`ai.status` 如实标注，并按 `AI-PROVENANCE.md` 记录调用链与（若可用）seed；无 seed 时记录“不可逐像素复现”。
- 旧 `public/assets/pet/dog-placeholder/**`（金棕眼斑/蓝项圈/7 tags/36 帧）已不被 `pet-dog` 引用，**不得作为参考图或母版**。

### 10.1 下游内容包 / 第三方口径（本文件不替代）

- `docs/content-packs/DOG-DESIGN-REFERENCE.md` 是 `rolePresets[2]`（id `dog`）与第三方犬科角色主题包的工程参考；本文件是**生成提示词/验收**的补充，两者不冲突。
- 第三方分发是两套不同 schema：`famling.content-pack/0.2`（换肤/主题/对话）与 `famling.pet-anim/0.2`（新 rig/新动画，12 clip/68 帧预算，见 `docs/content-packs/ANIM-PACK-0.2.md`）；示例 `docs/content-packs/examples/dog.anim.example.pack.json` 的帧/sha256 是**占位值**，真实素材必须重算。
- 诚实边界：pet-anim 的 loader/注册表/热切换/安装器**未接线**（ANIM-PACK-0.2 §0/§9）；实现前不得对外宣称第三方狗角色包“可安装”。

## 11. 维护与漂移检测

### 11.1 基线 SHA-256（本文件写就时；变了就说明本文件可能过期）

| 文件 | SHA-256 |
|---|---|
| `public/assets/pet/anim/dog/manifest.json` | `487f3860faf7dfb2867b0f0589309cb1a059362be655cbfb6487f2c2b2d3abed` |
| `scripts/gen-pet-anim-frames.py` | `6a05609e00ebed755ba9d48917c59c66c4e6caf0e57d1af6f330be9bf6e23481` |
| `scripts/dog_golden5.py` | `657199683f069a6c396b87f0483730360deeb9f2dcb5cbb45b19eb29fb2c3030` |
| `src/pet/anim/timing.json` | `a85e121c80d4476045484f317f593a9da101d7bcf348826437be7a03902281bf` |
| `public/characters/pet-dog/character.json` | `8ffa771defe12cbd90e7154ebc0bebce13808d0e448fa236a493b14216c084cd`（2026-11-20 meta v11/alias 更新后） |
| `src/pet/anim/interactions/dog.json` | `7771d0d5bab7b09c0cbf4bbc2066ecddc7687989b93e0f7f2b6fd8397e400e6b` |
| `docs/content-packs/DOG-DESIGN-REFERENCE.md` | `ffc9b8bae7de2dc43994248e4a479566928c0ed138e86757e7468bcbeb1bb7c4`（2026-11-20 登记后） |
| `docs/content-packs/ANIM-PACK-0.2.md` | `7e0200bde8da008a49430e72e8969f50a6ba3a990b8358dfa92aa592b2e8b037` |

### 11.2 变更触发（任一发生 → 更新本文件并重跑 §9.1）

- `timing.json` 帧表/帧率/specOnly 变化；
- `manifest.json` tags/frames/assets/palette/anim 块变化；
- `gen-pet-anim-frames.py` 或 `dog_golden5.py` 的调色板/几何常量变化；
- `character.json` canvas/anchor/footBox/bbox/palette/meta/license/ai 变化；
- `interactions/dog.json` 的 state/action/gesture 变化（动作可达性表 §4.3）；
- `docs/content-packs/DOG-DESIGN-REFERENCE.md` / `ANIM-PACK-0.2.md` 版本或契约变化（本文件 §10.1 下游口径）；
- 产品决定切换 profile A/B，或接受/拒绝 OC 提案的任一冲突项（C1–C12）。

### 11.3 变更记录

- 2026-11-20：创建本包。基于 HEAD `47438ac` 实测（68 帧/17 个不同 hex/12 tags/96×96），登记 A/B 双口径与 C1–C12 冲突；对齐 `docs/content-packs/DOG-DESIGN-REFERENCE.md`（2026-11-19）与 `ANIM-PACK-0.2.md`；未生成图、未改代码/资产、未 commit/push。
- 2026-11-20（task-151）：资产元数据/许可/重复帧整治——`character.json.meta.artPack` v7→v11、note/license 同步并新增 `meta.duplicateFrames`（68 文件 / 66 唯一 SHA，2 组 alias）；补登 `ASSET-LICENSES.md` 2026-11-20 节与 `AI-PROVENANCE.md` §11；更新本文件 §0.2 / C9 / C11 / §10 / §11.1。**未重画任何帧、未调用图像 API、未 commit/push**。

## 附录 A · 机器可读摘要（给后续 prompt 系统/脚本人读）

```json
{
  "pack": "DOG-PROMPT-PACK-2026-11-20",
  "defaultProfile": "A",
  "profiles": {
    "A": { "source": "public/assets/pet/anim/dog", "collar": true, "shortLegged": true, "palette": "§3.1 (18 roles / 17 distinct hex)" },
    "B": { "source": "docs/art/oc/dog/PROMPTS.md 2026-11-17", "collar": false, "shortLegged": false, "palette": "OC 12 tokens" }
  },
  "canvas": [96, 96],
  "anchor": { "x": 48, "y": 96, "mode": "foot-center" },
  "footBox": [ -36, -18, 72, 18 ],
  "bbox": [ 9, 7, 82, 83 ],
  "groundY": 89,
  "outline": "#0b1220",
  "designReference": "docs/content-packs/DOG-DESIGN-REFERENCE.md",
  "animPackContract": "docs/content-packs/ANIM-PACK-0.2.md",
  "paletteRoles": 18,
  "colors": {
    "outline": "#0b1220", "body": "#d9a251", "shade": "#a96a26", "light": "#f2cf87",
    "belly": "#f8ecd0", "ear": "#bd7c2e", "ear_inner": "#96621f", "eye": "#5b3a1c",
    "eye_hi": "#f4f9ff", "nose": "#171310", "tongue": "#e08a86", "collar": "#a63d35",
    "collar_hi": "#bd5a50", "collar_dark": "#7d2f2a", "ball": "#d9713c",
    "ball_hi": "#f3c08a", "fx": "#f4f9ff", "blush": "#e7a08f"
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
    "stand_wag": { "frames": 6, "fps": 8, "loop": false, "view": "front" },
    "chase_tail": { "frames": 6, "fps": 10, "loop": false, "view": "front" },
    "attack": { "frames": 7, "fps": 16, "loop": false, "view": "front", "holdMs": [83,83,63,42,42,63,63], "specOnly": true }
  },
  "frameContract": { "tags": 12, "frames": 68, "maxColorsPerFrame": 40, "measuredMaxColors": 16, "hardAlpha": true },
  "missingTags": ["talk", "bark", "remind", "nudge", "drag", "land", "sleep"]
}
```
# 汀岚（Tinglan）96×96 人物占位动画包（2026-11-18）

Status: **占位交付稿（placeholder-only）**。68 帧 + manifest 已由脚本确定性生成；未 commit、未改 DSH/其他文件；不是 final art。
实现仓：`desktop-games`。渲染器 `scripts/human_tinglan.py`、生成器 `scripts/gen-human-anim.py`、资产 `public/assets/pet/anim/human/**`、测试 `tests/pet-anim-human.test.ts`、预览 `_scratch/pet-anim-human-preview/`。

---

## 0. 结论（先看这里）

1. **契约与 v7 狗/猫包完全同构**：12 clip / 68 帧 / 同一帧数、fps、layer、priority、attack 非均匀 holdMs、同 96×96、anchor 48/96、footBox (−36,−18,72,18)，manifest 仍是 `famling.pet-anim/0.1`（id 固定 `pet.human.anim.placeholder`，palette 前缀 `human-anim-placeholder`，human 语音契约 `tts/speech`）。调度器/交互层不需要为人物改代码。
2. **人物语义按汀岚重绘**（同一 clip ID 换人物动作）：待机抱书呼吸+眨眼、侧视轻步、抱书小跑、摸头开心、抛纸团、追/接纸团、整理蝴蝶结、伸懒腰、挥手、回头翻书页、纸扇轻拍。
3. **像素硬门槛全过**：68/68 唯一帧、每帧 ≤20 色（实测 16–19）、硬 alpha、1px 闭合外轮廓（非 FX 缺口 0 px）、无内部描边色像素（0 px）、无封闭透明洞（0 px）、地线 y=89（68/68）、FX 不覆盖身体（0 px）、FX 不触身（0）。
4. **可逐字节复验**：`python3 scripts/gen-human-anim.py --check` → `check ok`；同一版本下 PNG 字节一致。
5. **未接入 hero**：本任务只产包 + 测试 + 文档；famling hero / 插件接线由 lead 的集成任务消费本包。

## 1. 依据（先读既有设定，再画）

| 来源 | 取用内容 |
|---|---|
| `docs/art/oc/tinglan/OC.md`（OC 汇总） | 成年、克制、同事型工作搭子；**不幼儿化/不性化**；5 项 always-on 身份锚点；黑 bob / 银细框眼镜 / 蓝鲸发夹 / 领带蓝鲸领夹 / 珍珠耳坠 / 扁平两叶 orca 尾 |
| `docs/art/CANON-SETTING-BOOK-2026-11-16.md` §1/§4/§5 | 96/128 几何、y 锚点、配色 token（outline `#0B1220`、hair `#1B1B22`、suit `#191920`、shirt `#F2F2F2`、skin `#F8D8C8`、tights `#8A6E6B`、accent `#3964FE` ≤3%、tail 白 `#E8E0E0`）、96 下可丢清单（发夹、领带夹、珍珠、纹理） |
| `docs/art/ART-TINGLAN-RUNTIME-2026-11-16.md` §1.2/§1.3 | 96 的 y 锚点与剪影必需件；96 可丢细节清单；扁平薄片尾、上黑下白 |
| `docs/ART-CONTRACT-LOCK-2026-11-16.md` | 96 几何：bbox、footBox 公式、1px 闭合轮廓、硬 alpha、每帧色数口径；palette 每角色自持 |
| `public/characters/tinglan/character.json` / `tinglan-256` | 角色身份、orca species、工作搭子定位、气质、道具（黑色平板/账本） |
| `dsh-famling/index.js` SYSTEM_PROMPT | 安静、简洁的桌面小生灵/工作搭子 的运行时语气（本包只做视觉占位，不改 prompt） |
| v7 契约/质量基线 | `public/assets/pet/anim/dog/manifest.json`、`scripts/dog_golden5.py`（region + union outline + FX 后绘）、`docs/PET-DOG-ANIM-V7-2026-11-18.md`、`docs/design/PET-ANIMATION-2026-11-18.md`、`_scratch/pet-anim-v7-preview/` |

> 与 lead 任务书的一处**有意简化**：任务书写蓝色 bow，canon 是左刘海蓝鲸发夹 + 领带蓝鲸领夹。96 px 下鲸鱼几何不可读，占位包把发夹压成**蓝色 bow/蝴蝶结读形**（viewer right 刘海），领带正中保留 2 px DSH 蓝领夹；final art 用 128/256 时应换回鲸鱼母版。

## 2. 96 px 设计

### 2.1 比例与骨架

- **头身比 2.5–2.7**：全高 y=13…89（77 px），头（含发）y=13…43（31 px），77/31≈2.48；不是 2.0 头的幼儿比例。
- 正面站立骨架（y 轴，96×96，地线 89）：
  - 发顶 13；眼镜中心 30（镜框 27–32）；下巴 41；颈 42–46；肩线 47–52（肩宽 26 px）；腰 57–62；外套下摆 62；裙 60–75（H 型铅笔裙）；腿（丝袜）76–84；鞋 85–89。
  - 腿 x=43..46 / 50..53（4 px 宽 + 中间透明缝向下开口，非封闭洞）；鞋 7 px 宽杏仁头、低粗跟。
- 侧视（walk/run，朝 viewer-left）：头含发 x≈35…61、鼻尖 x=34、下巴 y=41；胸 x=38、背 x=58、腰 40…56；裙侧 39…57；尾根 (57,68) 从裙后开衩伸出。
- 所有帧**鞋底/身体最低点 = y=89**（任何动作都不画到 90–95），头顶/抬手最高 y≥1，四角恒透明。

### 2.2 色板（19 色，每帧实测 16–19）

| role | hex | 用途 |
|---|---|---|
| outline | `#0B1220` | 唯一 1px 外轮廓（CANON outline token；不用作内部线） |
| hair | `#1B1B22` | 黑 bob / orca 尾上表面 |
| hair_hi | `#30303A` | 发丝高光 / 冷缘 |
| skin | `#F8D8C8` | 脸、颈、手 |
| skin_shade | `#E3B9A8` | 鼻/颈部阴影 |
| suit | `#1E1E26` | 西装（96 下比 canon `#191920` 抬一档，避免与黑发完全并块） |
| suit_hi | `#34343E` | 袖/翻领/裙缝/冷缘（内部结构线**只用浅色**，不用 outline） |
| shirt | `#F2F2F2` | 白衬衫 V、领口、袖口、纸/书页 |
| shirt_shade | `#D7DBE2` | 纸/书折痕 |
| tie | `#0F0F14` | 领带 / 书封 / 嘴线（非 outline 色） |
| glasses | `#C9CED6` | 细银框眼镜 / FX 冷色 |
| eye | `#356FFE` | 蓝虹膜 |
| eye_hi | `#F4F9FF` | 1px 眼高光 / FX 亮芯 |
| accent | `#3964FE` | 蓝 bow / 领带夹 / 书签（≤3% 可见像素） |
| tights | `#8A6E6B` | 不透明暖灰黑丝 |
| tights_shade | `#6A5652` | 侧视远腿 |
| shoe | `#1A1A1E` | 黑色低跟 |
| tail_white | `#E8E0E0` | orca 尾白腹 |
| blush | `#E7A08F` | **仅 pat_head** 2px 腮红（占位豁免，见 §8） |
| fx | `#99C8FF` | 星光/运动线/纸页/冲击线（后绘，不描黑） |

### 2.3 身份锚点取舍（96 px）

- **保留**：黑色内扣 bob（偏分侧刘海）、细圆银框眼镜 always-on、白 point collar + 白袖口、深色单排扣西装 + 深细领带、蓝 bow + 蓝领夹、扁平两叶 orca 尾（黑上/白下、后腰裙后）、黑丝 + 黑低粗跟、黑色无字账本（DSH 蓝书脊条）+ 纸/书道具。
- **按 CANON §1.3 在 96 px 丢弃**：珍珠耳坠、鲸鱼几何细节、领带纹理、纽扣、发丝层次、尾斑。
- 手：每手 3×3 皮色块 + 1px shade（96 下的 5 指自然不可表达，保持剪影不出现第二只手）。

### 2.4 道具（小书/纸页语义，替代真实平板）

- **摊开的小书**（idle / idle_blink / chase_tail）：深封皮 + 两页白纸 + 中缝 + 蓝书签；双手托住，读作安静工作搭子。
- **合上的账本**（run）：抱在胸前小跑。
- **纸团**（ball_throw / ball_chase）：白色纸团 + 灰折痕，抛出/落地/接住。
- **纸扇**（attack）：折纸扇/展开扇，白纸 + 灰褶 + 深色握柄，轻拍而非暴力攻击。
- 未画：黑色平板 A5（canon 姿势道具）——96 px 下与西装的对比不足；留待 final art / 128。

## 3. 12 clip 动作语义（帧数/fps 与 v7 狗完全一致）

| clip | 帧/fps/loop/layer | 汀岚语义（画面） | 视图 |
|---|---|---|---|
| `idle` | 6 / 6 / loop / base | 站立双手托摊开小书；呼吸 ±1px、头/肩微摆、发丝高光与裙摆轻摆、尾摆；眼常开 | 正面 |
| `idle_blink` | 3 / 12 / one-shot / overlay | 半闭→闭→半闭（透过眼镜可读），末帧带轻微头/尾差以区分首帧 | 正面 |
| `walk` | 8 / 10 / loop / base | 轻步：侧视 8 帧步态，前后脚交替落/抬，单臂反向摆，躯干 1px 起伏，尾摆 | 侧视朝左 |
| `run` | 6 / 14 / loop / base | 抱账本小跑：前倾 2px、头发后飘 1–2px、步幅加大、尾部上扬、2 帧速度线 | 侧视朝左 |
| `pat_head` | 4 / 8 / one-shot | 被摸头：歪头、眯眼（happy 眼）、2px 腮红、微笑、肩耸、尾快摆、头顶 3 帧星光 | 正面 |
| `ball_throw` | 5 / 10 / one-shot | 右手举起纸团→蓄力→向画面右前抛出→跟随→收手；纸团烘焙进帧 + 运动线 | 正面 |
| `ball_chase` | 6 / 12 / one-shot | 纸团从右滚入→侧身低头→右手伸向地面→蹲身接住→举球；末帧微笑 + 星光 | 正面 |
| `paw_face` | 5 / 8 / one-shot | 抬手整理刘海蓝 bow（手在发前、bow 1px 位移），点头；不是卖萌捂脸 | 正面 |
| `scratch` | 6 / 8 / one-shot | 伸懒腰：双臂上举过顶（手掌到 y≈10）、身体拉长 2px、peak 帧闭眼+张口、末帧放下；2 条拉伸短线 | 正面 |
| `stand_wag` | 6 / 8 / one-shot | 站直 + 右手挥手（左右摆 2 帧）、微笑、尾大幅摆；不叉腰（避免腋下封闭洞） | 正面 |
| `chase_tail` | 6 / 10 / one-shot | 回头翻书页/看身后：头 3/4 转（五官 +1..3px、左脸补发）、举起摊开的书、右手翻页、视线朝右后、尾摆 | 正面 |
| `attack` | 7 / 16 / 非均匀 holdMs [83,83,63,42,42,63,63] | 纸扇轻拍：0–1 蓄力上举→2 预备→3–4 前挥命中（扇面打开 + 3 条冲击线）→5–6 收招回防 | 正面 |

> 动作可读性取舍：摸头/害羞类只做眯眼+腮红+星光克制表达；不出现心形瞳、泪光、抱胸、低机位、卖萌姿势，保持安静工作搭子的气质（CANON §10）。

## 4. 渲染管线（`scripts/human_tinglan.py`）

1. **区域绘制**：所有部件（发/脸/眼镜/眼/西装/裙/腿/鞋/尾/书/纸团/扇）都作为**颜色区域**画在 96×96 RGBA 画布上，不画轮廓。
2. **填洞**：从画布边缘 flood-fill，未连通的透明区（封闭洞）填充为 suit 色，保证无封闭透明洞。
3. **单一 1px 闭合外轮廓**：把不透明且 4-邻接透明的边界像素统一刷成 `#0B1220`；内部结构线只用 suit_hi / shade 等浅色，因此**内部描边色像素 = 0 by construction**。
4. **粒子 FX 后绘**：星光/运动线/冲击线/纸页/速度线在轮廓之后画在**独立 overlay**，只合入**仍透明**的像素（不覆盖身体、不产生洞），颜色限定 eye_hi/fx/glasses；因此身体轮廓 100% 闭合，FX 本身无黑边（与 dog v7 同一先行做法）。
5. **确定性**：无随机、无网络、无新依赖（PIL + numpy）；PNG 以 `optimize=True` 保存；`--check` 重渲染全部帧逐字节比对。
6. **地线**：所有帧的鞋底绘制到 y=89，轮廓化后最低不透明行仍为 89；y=90–95 恒空。

## 5. 文件与命令

| 文件 | 说明 |
|---|---|
| `scripts/human_tinglan.py` | 独立渲染器（正面/侧视骨架、12 clip pose 表、道具、FX、Canvas） |
| `scripts/gen-human-anim.py` | 独立生成器 + manifest + `--check` + `--preview`（1x/4x sheet、12 GIF、实测报告） |
| `public/assets/pet/anim/human/**` | 68 PNG（12 clip 目录）+ `manifest.json` |
| `tests/pet-anim-human.test.ts` | 6 个 Node 测试（manifest/帧/palette/轮廓洞/动作可读性/--check 复验） |
| `docs/design/HUMAN-TINGLAN-2026-11-18.md` | 本文 |
| `_scratch/pet-anim-human-preview/` | 1x/4x/dark sheet、`gifs/human_<clip>.gif` ×12、`METRICS-HUMAN.md`、`VERIFY-OUTPUT.txt` |

命令：

    python3 scripts/gen-human-anim.py
    python3 scripts/gen-human-anim.py --check
    python3 scripts/gen-human-anim.py --preview /mnt/d/Projects/dsh/_scratch/pet-anim-human-preview
    node --import tsx --test tests/pet-anim-human.test.ts
    npx tsc --noEmit

## 6. 实测验收（2026-11-18，本机）

| 门禁 | 结果 |
|---|---|
| `python3 scripts/gen-human-anim.py --check` | **PASS**：`check ok: human animation pack matches the generator (68 frames, 68 unique, max 19 colours, ground y=89)` |
| 帧数 / 唯一帧 | **68 / 68** |
| 每帧可见色数 | 最大 **19**（≤20；各 clip 16–19） |
| 硬 alpha | 68/68 全 0/255 |
| 地线 | 68/68 最低不透明行 **y=89**；y=90–95 全空 |
| 1px 闭合外轮廓（非 FX 缺口） | **0 px** |
| 内部描边色像素 | **0 px** |
| 封闭透明洞 | **0 px** |
| FX 像素（后绘） | 150 px；用 outline 色 **0 px**；覆盖身体 **0 px**；触碰身体轮廓 **0** |
| 外接 bbox | 各帧 L/T/R/B 边距 ≥1，无贴边 |
| 打包体积 | 68 PNG + manifest = **91,987 bytes** |
| `node --import tsx --test tests/pet-anim-human.test.ts` | **6 pass / 0 fail** |
| `node --import tsx --test tests/pet-anim.test.ts`（既有 16 项） | **16 pass / 0 fail**（契约未变） |
| `npx tsc --noEmit` | 通过（exit 0） |

## 7. 与既有契约/测试的关系

- manifest **结构逐字段**与 dog/cat 的 `famling.pet-anim/0.1` 相同；只有 `id`（`pet.human.anim.placeholder`）、`palette`（`human-anim-placeholder@0.2-tinglan`）、`anim.voice`（human = tts/canTts true/speech）、`sourceSpec/generator` 不同。
- 既有 `tests/pet-anim.test.ts` 约束（id 固定、palette 前缀、12 tags 顺序、assets 顺序、68 帧、attack holdMs、硬 alpha/≤20 色等）全部满足；未改该测试。
- 未改：`scripts/gen-pet-anim-frames.py`、`scripts/dog_golden5.py`、dog/cat 资产、`src/pet/**`、hero/runtime、package.json、tsconfig。
- 本包目录顶层只允许 `manifest.json` + 12 个 clip 目录（测试断言），不要往里放 README。

## 8. 已知边界 / 剩余风险

1. **占位美术非 final**：正面 2.5 头身 chibi 已稳定，侧视 walk/run 是简化 profile（脸部/眼镜在 1x 下偏小）；动作可读优先于造型精度。
2. **黑色剪影在深色背景上不可见**：黑 bob + 黑西装 + `#0B1220` 轮廓是 canon；深色场景需要背景反差/描边发光（集成侧决定），不是本包可解。
3. **腮红是 lead 任务书要求的占位细节**，canon 明确"不写脸红"；pat_head 的 2px blush 建议 final art 删除或改克制眯眼。
4. **蓝 bow = 蓝鲸发夹的 96px 简化**；领带夹保留 2px。final/128 应换回鲸鱼母版（同一几何母版缩放）。
5. **道具是小书/纸页占位**；canon 姿势道具是黑色平板 A5（单条 DSH 蓝边条）。本包用账本/书页表达同一工作搭子语义。
6. **旧生成器未改**：`scripts/gen-pet-anim-frames.py` 仍会生成旧的通用 human 占位帧，因此现在运行它的 `--check` 会对 human 报 STALE（cat 侧另有并发任务同理）。任务书明确不修改 gen-pet-anim-frames.py；建议后续一次性把它改成 human 委托 `gen-human-anim` 或跳过 human/cat。
7. **未接 hero**：`public/characters/pet-dog/character.json` 那类 `packBase`/fallback 接线属 lead 的集成任务；本包目录可直接作为 `packBase=/assets/pet/anim/human/` 消费。
8. 未 commit、未 npm install、未删除他人文件；preview 目录在 `_scratch/`（不进仓）。

## 9. 自检清单（交付时逐项）

- [x] 每个 clip 1x/4x 预览人工看过；动作可读、剪影清楚、无明显穿模/断肢/浮空
- [x] 帧间抖动小（呼吸/步态 ±1–2 px；无逐帧整体漂移）
- [x] 地线 y=89 全帧一致
- [x] 每帧 ≤20 色（实测 ≤19）
- [x] 硬 alpha（0/255）
- [x] 外轮廓 1px 闭合（非 FX 缺口 0）
- [x] 无封闭透明洞（0）
- [x] 内部黑线 0
- [x] 68/68 唯一帧
- [x] `--check` / Node 测试 / tsc 全绿
- [x] 12 GIF + 1x/4x sheet + 实测报告在 `_scratch/pet-anim-human-preview/`

---

## 10. v8 第二轮打磨（2026-11-18）

触发：用户要求继续打磨人/猫/狗的侧视、走路、跑步与脸部细节，且**动作帧同侧肢体/道具不能重复**（抬手臂时地面同手仍在；纸团/书不能出现双层）。本轮只动 human 包（dog/cat 不动）。

### 10.1 修复的实际缺陷（逐 clip 审计发现）

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | `paw_face` 的**左臂**误用右手坐标 `(61,59)->(60,66)`：同侧手臂画了两遍、左侧空空 | 左臂改回 `(34,58)->(35,64)`；抬手到蝴蝶结（y=21）不再遮住 bow |
| 2 | 白袖口 3x2 浮在手边 1-2 px 外，抬臂时读成“第二只手/白手套” | 改成贴腕的 1 px 白边（`arm_front`/`arm_side`）；持道具手 `cuff=False` |
| 3 | `ball_throw` 纸团画在手臂之后 → 纸团+袖口+手三个亮块堆叠 | 渲染顺序改为“袖子 → 纸团 → 手”，手压住纸团下缘，**一帧只有一颗纸团** |
| 4 | `attack` 纸扇画在手臂之后 → 白扇+白袖口双层 | 先画纸扇、手压住扇柄（袖口关闭），一帧只有一把扇 |
| 5 | `run` 账本页块被前臂盖住、只剩零碎白点 | 顺序改为“袖子（隐藏手）→ 账本（页块朝向可见侧 + 蓝书脊条）→ 一只手按在书沿”；账本略出剪影，黑封皮/白页可读 |
| 6 | `idle`/`chase_tail` 摊开书的中缝用了深色，白色页块被拆成两团（像两本书） | 中缝改浅色折线，书页连成一本；通过“一本摊开书”门禁 |
| 7 | `scratch` 双臂举在头两侧遮住 bob、轮廓发闷 | 改 Y 形拉伸：手臂在 bob **外侧**上举，头部完整可读；峰值帧闭眼+张口 |
| 8 | 侧视 bob 顶部有缺口、脸部太小、眼镜是一块白斑 | 重写 `head_side`：圆顶/直背/内扣发尾；profile 五官（额头/鼻/唇/下巴）；5x4 镜片 + 2x2 蓝眼 + 1 px 镜腿；bow 保持在 bob 后上方 |
| 9 | 侧视身体是无腰身的黑色方块、腿像棍、脚不清楚 | 重写 `torso_side`/`skirt_side`/`leg_side`/`arm_side`：胸/腰/背曲线、衬衫领+领带+蓝领夹、5 px 腿+膝弯+近/远腿、低跟有鞋头/鞋跟；walk 8 帧 contact/down/pass/up×2（每帧一脚着地、摆动腿抬 2–3 px）；run 6 帧大步幅+前倾+发丝后飘+速度线 |
| 10 | 正面 idle/pat 的 2x2 虹膜在 1x 不够清楚、眼镜框在肤色上对比低 | 虹膜 3x2 + 1 px 高光 + 睫线；银框下加 1 px 暖阴影；袖子改合身（4 px 中调袖 + 1 px 深缝） |

### 10.2 新增自动化门禁（防止回归）

`gen-human-anim.py --check` 现在对**每一帧**做 4 连通色块审计：

- **同侧肢体**：小肤色色块（4–14 px、≤5×5）——正面 clip 必须**左右各 1 只手**；侧视 clip 必须恰好 1 只近手（y0 ≥ 52）。旧 paw_face 缺陷（同侧 2 手/另一侧 0 手）会被直接判失败。
- **道具单层**：`ball_throw` 0–3 帧与 `ball_chase` 全部帧恰好 1 颗 ball-like 色块；`attack` 恰好 1 把扇（≥18 px）；`idle`/`idle_blink`/`chase_tail` 1–5 帧恰好 1 本摊开书（≥30 px）；`run` 恰好 1 本账本。
- 审计结果写入 `_scratch/pet-anim-human-v8-preview/METRICS-HUMAN.md` `0b` 与 `AUDIT-LIMBS-v8.md`。

### 10.3 v8 实测（本机，2026-11-18）

| 门禁 | 结果 |
|---|---|
| `python3 scripts/gen-human-anim.py --check` | PASS（68 帧 / 68 唯一 / ≤19 色 / 地面 y=89） |
| `python3 scripts/gen-pet-anim-frames.py --check`（委托门） | PASS（dog + cat(delegated) + human(delegated)） |
| `node --import tsx --test tests/pet-anim-human.test.ts` | 6 pass / 0 fail |
| `npx tsc --noEmit` | exit 0 |
| 同侧肢体重复帧 | **0** |
| 道具堆叠/重复帧 | **0** |
| 外轮廓缺口（非 FX） / 内部描边色 / 封闭洞 | 0 px / 0 / 0 |
| FX 像素 / 覆盖身体 / 触碰身体 | 150 px / 0 / 0 |

契约未变：12 clip、68 帧、同 fps/layer/priority/attack holdMs、anchor 48/96、footBox (−36,−18,72,18)、manifest id/palette/voice 全部与 v7 同构；未改 dog/cat、未 commit。
v8 预览目录：`_scratch/pet-anim-human-v8-preview/`（1x/4x/dark sheet、12 GIF、METRICS-HUMAN.md、VERIFY-OUTPUT.txt、AUDIT-LIMBS-v8.md）。

# 布偶猫（Ragdoll）像素动画包（2026-11-18）

> 历史版本：2026-11-18 首版布偶（68 帧旧契约），随后改为塞尔凯克卷毛猫（Selkirk Rex）；2026-11-20 已改回**同配色布偶猫并要求 72 帧**。当前有效设计见 `docs/design/CAT-RAGDOLL-2026-11-20.md`（本文件仅保留为历史）。

- 范围：`public/assets/pet/anim/cat/`（96×96、12 clips / 68 帧、anchor 48/96、footBox `[-36,-18,72,18]`、地线 y=89）由独立渲染器 `scripts/cat_ragdoll.py` + 独立生成器 `scripts/gen-cat-anim.py` 确定性生成；manifests/帧表/资源路径与 v7 金毛包同一 `famling.pet-anim/0.1` 契约。
- 不改：`scripts/gen-pet-anim-frames.py`、`scripts/dog_golden5.py`、dog/human 动画包、`src/**`、`pet.html/pet.css/main.ts/hero-runtime.ts`；不 commit、不新增 npm 依赖。
- 生成器：`scripts/gen-cat-anim.py`（PIL + numpy，纯整数图元，无随机/网络/模型）；渲染器：`scripts/cat_ragdoll.py`。
- 预览：`/mnt/d/Projects/dsh/_scratch/pet-anim-cat-preview/`（1x/4x/dark 4x contact sheet、12 个 GIF、逐 clip 4x 图、本报告、`VERIFY-OUTPUT.txt`、参考照片）。

## 1. 角色设定与画法

| 项 | 值 |
|---|---|
| 主体 | 白色/冷奶油长毛（`body #f2efe8`、`light #fdfcf7`、`shade #d5cfc4`、`belly #ece2d3`） |
| 面罩 | 灰褐“八字”面罩：左右两条从内眼角→面颊→下颌的斜向色块，中间留白色鼻梁，下接白下巴/白口吻（`mask #94806f`、`mask_dark #6f5c52`） |
| 耳 | 深灰褐尖耳 + 粉色内耳（`ear #6b584e`、`ear_inner #c7a39b`） |
| 眼 | 大蓝眼（`eye #5b93e0`、`eye_hi #f4f9ff`、`pupil #1e2c44`）；半闭/闭眼用 fur-tone 上眼睑，不用黑色 |
| 尾 | 长毛羽状尾：粗根→锥形主链 + 3 处奶油羽状缺口 + 深色尾尖；front 视角卷在右侧地面，side 视角低垂/后扬/竖立 |
| 鼻/肉垫 | `nose #d79b9b`、`pad #d9a3a0` |
| 性格 | 懒散 + 高冷：所有动作慢、幅度小；不用狗式摇尾/狂奔/张嘴哈气 |

面罩画法（正面，`front_head`）：先画白色头骨 → 两个“八”字斜向 mask 多边形（左侧 `[(44,14),(37,13),(32,17),(30,23),(31,29),(34,34),(38,37),(41,34),(43,30),(44,26),(45,20)]`，右侧按头中心镜像）→ 白色 blaze/口吻覆盖中间（自 y=13 的 3px 渐宽到 y=34 的 15px，形成上窄下宽的白色倒 V）→ mask_dark 内缘 1px 强化八字边 → 深色耳朵、蓝眼、粉鼻、奶油下巴。因此 1x 下也能一眼看出“白猫 + 灰褐面罩 + 蓝眼”。

## 2. 骨架 / 比例（先骨架后上色）

### 2.1 正面坐姿（idle / idle_blink / pat_head / ball_throw / ball_chase / paw_face / scratch / chase_tail / attack）

| 部件 | 坐标/尺寸（96 画布，中心 x=48） |
|---|---|
| 头骨 | 椭圆 `(32,12)-(64,38)`，33×27 |
| 耳 | 左耳 `(36,8)(31,20)(36,24)(43,19)`，右耳镜像；内耳 `(36,12)(33,19)(36,22)(40,17)` |
| 眼 | 5×5 @ 中心 `(41,25)/(55,25)`，瞳孔 1×3，1px 高光 |
| 鼻/口/下巴 | 鼻 `(46..50,30..32)`；口线 y=34..37；奶油下巴 y=38..40 |
| 躯干 | 连续行 y=42..84，半宽 16→20→15（`front_torso_half`）；白毛 + 左侧 light/右侧 shade 1px |
| 前腿/前爪 | 腿 x=35..42 / 54..61，y=68..84；爪 8×7 @ y=83..89，2 条 fur-tone 趾缝 + 奶油趾尖 |
| 后臀/后爪 | 椭圆 `(25,56)-(43,84)` / `(53,56)-(71,84)`；后爪 7×6 @ y=84..89（shadow 色，不画透明缝，避免内部黑线） |
| 胸毛 | 奶油长毛 bib，y=40..64（半宽 8→11→5），2 层扇贝边 + 1px fur-tone 边 |
| 尾 | 根 (63,76) → (72,82) → (81,83) → (87,77) → (89,70) → (83,65)，宽 8→4 + 奶油羽 + 深色尾尖 |
| 地线 | 前爪底行 y=89；所有帧 `maxY==89`（hind/front paws + 尾巴均不越线） |

### 2.2 侧面站姿（walk / run / stand_wag）

| 部件 | 坐标/尺寸 |
|---|---|
| 头骨 | 椭圆 `(8,22)-(32,44)`，25×23（猫头相对体长更大） |
| 耳 | 深色尖耳 `(25,11)(19,25)(29,27)(31,21)` + 粉内耳 |
| 眼/鼻 | 3×3 蓝眼 @ `(20,32)`；鼻 `(3..5,37..39)`；白口吻/白下巴 |
| 面罩 | 侧面 mask 覆盖眼周/面颊/耳根，白色 blaze 从鼻梁向上（正面同款颜色） |
| 躯干 | 背线 y≈39..41、腹线 y≈62..63，胸 x=21、臀 x=72（体长 51，胸深 23） |
| 四肢 | 前腿 肩(33,48)→肘(32,62)→腕(30,84)；后腿 髋(62,46)→膝(68,58)→跗(61,74)→腕(62,84)；远腿 x−2、shade 色先画；爪底 y=89 |
| 尾 | low / stream / up 三种尾型；stand/run 用羽状尾 + 深色尾尖 |
| 伸懒腰 | 躯干顶/底两条折线在“站立 → 前趴后翘”两个 keyframe 间线性插值（`_stretch_body`），头/前腿/后腿/尾逐点插值，形成连续弓背 |

## 3. 12 clip 动作设计（同一只猫；帧数/fps 与 v7 dog 完全一致）

| clip | 帧@fps | 视角 | 动作设计 |
|---|---:|---|---|
| idle | 6@6 loop | 正面坐姿 | 慢呼吸（body/head ±1px）+ 慢尾摆 + 耳尖轻抖 + 偶尔半闭眼；四爪不动 |
| idle_blink | 3@12 | 正面 | 极慢半闭 → 闭眼 → 半闭（fur-tone 眼睑，蓝眼被盖住） |
| walk | 8@10 loop | 侧面 | 慢悠悠四拍步态；尾巴低垂羽状摆动；头微低、眼睛半阖；每帧恰好 1 爪离地 |
| run | 6@14 loop | 侧面 | 短促小跑/zoomies：身体前倾、前后腿大摆幅、尾后扬 + 地面尘土；仍不夸张 |
| pat_head | 4@8 | 正面 | 被摸下巴/头顶：头低 4px、耳压平、半闭/眯眼、腮红、蓝白星光；高冷但接受 |
| ball_throw | 5@10 | 正面 | 人抛球：球从右上抛落（(84,16)→(74,82)），猫抬头-侧目-低头全程慢，最后慢抬右爪够球 |
| ball_chase | 6@12 | 正面 | 懒懒扑/拨：身体向球侧倾，前爪拨一下，球被拍到左边；最后半闭眼“算了” |
| paw_face | 5@8 | 正面 | 猫式 grooming：舔爪（露粉色肉垫）→ 擦脸颊 → 盖眼 → 抹下 → 收爪 |
| scratch | 6@8 | 正面 | 后腿挠右耳/颈：头歪向爪，后腿从髋部抬起，爪在耳根上下蹭 4 帧，眼睛眯起 |
| stand_wag | 6@8 | 侧面 | 猫式伸懒腰：站 → 前趴后翘弓背 → 最深 + 张嘴打哈欠 → 保持 → 收回站立；不是摇尾巴 |
| chase_tail | 6@10 | 正面 | 慢速追尾：尾巴卷到前右爪旁、尾尖抽动，猫偏头盯着；最后高冷别过头（半途而废） |
| attack | 7@16 | 正面 | 不凶狠的拍爪/喵喵拳：警觉 → 抬右爪蓄力 → 横拍 → 收势；击中帧有短 impact 条（描边后 FX，无黑边） |

## 4. 生成 / 复验 / 预览命令

```bash
cd /mnt/d/Projects/dsh/desktop-games
python3 scripts/gen-cat-anim.py                # 写 68 帧 + manifest
python3 scripts/gen-cat-anim.py --check        # 逐字节复验（生成器 == 盘上资产）
python3 scripts/gen-cat-anim.py --verify       # 帧数/色数/alpha/地线/唯一帧/轮廓/洞/内部黑线/bbox 边距
python3 scripts/gen-cat-anim.py --sheet /tmp/cat.png   # 不写资产的 contact sheet
node --import tsx --test tests/pet-anim-cat.test.ts
npx tsc --noEmit
cd /mnt/d/Projects/dsh/_scratch/pet-anim-cat-preview && python3 gen_previews.py
```

## 5. 实测结果（2026-11-18）

| 门禁 | 结果 |
|---|---|
| `python3 scripts/gen-cat-anim.py --check` | `check ok: cat animation pack matches the generator` |
| `python3 scripts/gen-cat-anim.py --verify` | `FAILS: none`：68/68 唯一帧；68 帧 bottom 全 89；硬 alpha；max 16 色；`non-FX alpha gap=0`；`internal black=0`；`enclosed holes=0`；bbox 边距 L/T/R/B = 2/5/2/6 |
| `node --import tsx --test tests/pet-anim-cat.test.ts` | 8 pass / 0 fail（manifest、hero 兼容、68 帧磁盘、像素预算、配色一致、动作可读、闭合轮廓/无洞/无内部黑线、`--check` 确定性） |
| `node --import tsx --test tests/pet-anim.test.ts` | 16 pass / 0 fail（原三套包门禁不受影响） |
| `npx tsc --noEmit` | 通过（无输出） |
| 预览 | `_scratch/pet-anim-cat-preview/`：1x / 4x / dark-4x contact sheet + 12 GIF + 12 clip 4x 图；已逐 clip 目视检查动作可读、剪影清楚、无断肢/浮空/穿地 |

## 6. 已知限制 / 风险

1. **旧生成器不再覆盖 cat**：`scripts/gen-pet-anim-frames.py --only cat --check` 会 STALE（cat 包的 source/generator 已改为 `scripts/gen-cat-anim.py`）。dog/human 仍由旧生成器负责；cat 的字节复验请用 `scripts/gen-cat-anim.py --check`。未修改旧生成器（任务硬约束）。
2. **FX 像素豁免**：pat_head 星光、run 速度线/尘土、attack impact 条是在 union outline 之后绘制的（亮芯 + 色边、无黑边），因此不计入主轮廓的 1px 闭合统计；主猫体轮廓 gap = 0。球是带自身黑描边的 detached 道具（test 单独放行）。
3. **侧面视角简化**：走/跑/伸懒腰为纯侧面、头朝左；其余 9 个 clip 为正面坐姿。与 dog v7 的视角分配一致，但从 idle（正面）切到 walk（侧面）是硬切，接入 hero 时建议加 100–150ms 交叉淡入（接入方处理）。
4. **面罩 1x 可读性**：白色倒 V 与灰褐八字在 1x 可辨，但 96px 下细节有限；如需更强“布偶”识别可在正式美术阶段加宽 mask 或提高对比。
5. **占位性质**：全部帧 `placeholder: true`、`ai.status: none`、license = placeholder only；不是最终美术，商业使用未授权。
6. **未接入 hero/桌面壳**：本任务只产包与测试，接入由 lead 后续在 famling hero / dsh-famling 插件执行；资源路径与 manifest 契约已按 v7 保持稳定。

## 7. 参考照片（仅本地审阅，不随包分发）

从 Wikimedia Commons 下载并人工查看（`_scratch/pet-anim-cat-preview/refs/`）：

- Ragdoll cat face: https://commons.wikimedia.org/wiki/File:Ragdoll_Cat_Face.jpg
- Ragdoll cat (seal bicolor, full body + long fur): https://commons.wikimedia.org/wiki/File:Ragdoll_cat_Zhan.jpg
- Ragdoll cat stretching: https://commons.wikimedia.org/wiki/File:Ragdoll_Cat_Stretching.jpg
- Ragdoll cat resting: https://commons.wikimedia.org/wiki/File:Mimosa,_a_Ragdoll_cat_who%27s_chillin.jpg

这些照片只用于确认毛色分层、蓝眼、羽状尾与伸懒腰姿态；生成器不读取图片，所有像素由脚本绘制。

## 8. 文件清单

| 文件 | 说明 |
|---|---|
| `scripts/cat_ragdoll.py` | 布偶猫渲染器：Canvas/描边/填洞/去 1px 碎点、调色板、正面坐姿 + 侧面站姿骨架、12 clip 姿态表、尾部/面罩/眼睛/FX |
| `scripts/gen-cat-anim.py` | cat 专用生成器：CLIPS 表、manifest、写包、`--check`、`--verify`、`--sheet` |
| `public/assets/pet/anim/cat/**` | 68 张 96×96 PNG + `manifest.json`（12 tags / 68 assets / `pet.cat.anim.placeholder`） |
| `tests/pet-anim-cat.test.ts` | cat 包门禁（9 个 test，v8 增加同侧肢体遮挡 test） |
| `docs/design/CAT-RAGDOLL-2026-11-18.md` | 本文件 |
| `_scratch/pet-anim-cat-preview/**` | v7 首版预览（1x/4x/dark sheet、12 GIF、逐 clip 4x、验证输出、参考照片） |
| `_scratch/pet-anim-cat-v8-preview/**` | v8 打磨后预览（同结构 + `LIMB-AUDIT.txt` / `METRICS-CAT-V8.md`） |

## 9. v8 第二轮打磨（2026-11-18，task-16）

### 9.1 同侧肢体遮挡审计（逐 clip）

问题：抬爪/挠耳时，同侧着地爪仍被画在 y=85..89 的地面上（scratch 的右后爪、paw_face/attack/ball_throw 的抬爪侧前爪）。

修复：
- `front_hind()` 新增 `raised_hind_side`：`front_scene()` 从 `raised_hind` 的爪 x 坐标推断左右（x<48 = 左），只画另一侧的地面后爪；挠耳帧的同侧后爪/后腿不再重复。
- 抬爪（`raised_front`/`reach`）本来就跳过同侧地面前腿；v8 复查后保持，并加 test 锁死。
- 侧视 walk/run 的远/近腿用不同 role（shade vs body）分组，不属于同侧重复。
- stand_wag 伸懒腰四脚都在地面，属于合理姿态；test 检查仍有 ≥40px 底部着地像素。

实测（`_scratch/pet-anim-cat-v8-preview/LIMB-AUDIT.txt`）：

| clip | 抬起的肢体 | 同侧地面爪像素（y=85..89） | 对照侧着地爪 |
|---|---|---:|---:|
| paw_face 0–4 | 左前爪（舔爪/洗脸） | **0** | 右前 38 |
| scratch 1–4 | 右后腿（挠耳） | **2–4**（只剩尾巴边缘） | 右前 38 / 左后 37 |
| attack 1–4 | 右前爪（拍爪） | **0**（x54..60） | 左前 38–39 |
| ball_throw 4 | 右前爪（够球） | **0** | 左前 38 |
| stand_wag 0–5 | 无（伸懒腰四脚着地） | — | 底部着地 ≥40px |

`tests/pet-anim-cat.test.ts` 增加 "raised paw/leg frames hide the ground paw on the same side" 用例，逐帧锁死以上数值。

### 9.2 侧视 walk/run 脸部与步态

- **侧脸**：重画 `side_head()`：八字面罩改为一条从耳根→眼周→面颊的斜向 brown 带 + 白色 blaze（鼻梁→额头），`mask_dark` 勾出八字内缘；眼睛放大到 4×4 蓝眼（1px 高光 + 下眼睑 shade），深色尖耳 + 粉内耳 + 1px 耳根 shade；白色口吻 + 粉鼻 + 短嘴线 + 奶油下巴；加胡须根/颊毛。1x 下侧面能看出“白猫 + brown 眼罩 + 蓝眼 + 尖耳 + 白吻”。
- **步态**：`side_front_leg()` 改成肩→肘→腕三段，`side_hind_leg()` 改成髋→膝→跗→系四段，walk 每帧 1 爪离地、支撑爪着地；run 摆幅加大（前腿 +6..8 / 后腿 −6..8），身体前倾、耳朵后压，尾在背线上方后扬。
- **蓬松羽状尾**：`side_tail()` 根部加粗到 9px、锥形递减 + 3 处奶油羽状缺口 + 小号深色尾尖；walk 低垂、run 后扬在背线上方、stretch 竖立。

### 9.3 正面脸细节与慢眨眼

- 眼睛：4×4/5×5 蓝眼 + 1×3 瞳孔 + 1px 高光 + 下眼睑 shade；新增 `sleepy` 眼型（fur-tone 上眼睑 + 1 行蓝眼）表达“懒”。
- 面罩：八字内缘 1px `mask_dark` 强化；颧部 shade、白 blaze 高光、耳内高光、胡须根；下巴奶油羽保持。
- `idle`：6 帧里插入 `sleepy → sleepy → half` 慢眨眼段；`idle_blink` 改为 `sleepy → closed → sleepy`（极慢半闭→闭→半闭），闭眼用 fur-tone 眼睑，不出现黑线。

### 9.4 v8 门禁（实测）

| 门禁 | 结果 |
|---|---|
| `python3 scripts/gen-cat-anim.py --check` | ok（exit 0） |
| `python3 scripts/gen-cat-anim.py --verify` | FAILS: none；68/68 唯一帧；68 帧 bottom=89；max 16 色；硬 alpha；non-FX gap=0；internal black=0；holes=0；bbox 2/5/2/6 |
| `node --import tsx --test tests/pet-anim-cat.test.ts` | **9 pass / 0 fail** |
| `node --import tsx --test tests/{pet-anim,default-packs,hero-multichar-integration,hero-runtime,canvas-scale}.test.ts` | 56 pass / 0 fail（消费 cat 包的既有门禁全绿） |
| `npx tsc --noEmit` | 0 error |
| 预览 | `_scratch/pet-anim-cat-v8-preview/`：1x/4x/dark sheet、12 GIF、逐 clip 4x、`LIMB-AUDIT.txt`、`VERIFY-OUTPUT.txt`、`METRICS-CAT-V8.md` |

### 9.5 v8 剩余风险

1. 挠耳帧同侧后爪区域仍可能有 2–4px 尾巴边缘（不是爪），已用像素审计确认；1x 下不可见。
2. 侧视 walk/run 的爪子仍是占位式圆块，正式美术可补爪趾分缝；伸懒腰头部与前爪在 96px 下空间紧，1x 可读但近看有重叠。
3. 面罩在 1x 的识别度提升但受 96px 限制；如做 256 目标需重绘而非放大。
4. 其余风险（旧生成器 STALE、FX 豁免、视角硬切、placeholder 性质）同 §6，未变化。

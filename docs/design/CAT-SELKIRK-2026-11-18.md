# 塞尔凯克卷毛猫（Selkirk Rex）像素动画包（2026-11-18）

- 范围：`public/assets/pet/anim/cat/`（96×96、12 clips / 68 帧、anchor 48/96、footBox `[-36,-18,72,18]`、地线 y=89）由独立渲染器 `scripts/cat_selkirk.py` + 独立生成器 `scripts/gen-cat-anim.py` 确定性生成；manifest 契约与 v7 金毛包一致（`famling.pet-anim/0.1`、`pet.cat.anim.placeholder`）。
- 设定变更：cat 角色由布偶猫（Ragdoll）改为**塞尔凯克卷毛猫（Selkirk Rex）**，只保留**灰色 + 白色/米色**；去掉全部橙色/棕色/粉红毛色。
- 用户参考图（只读、不随包分发）：`/mnt/d/Projects/dsh/_scratch/pet-refs-user-2026-11-18/selkirk-user.png`。参考里的橙色斑块在本实现中全部改为灰色斑块。
- 不改：dog/human 动画包、`scripts/gen-pet-anim-frames.py`、hero-runtime/desktop-shell/menu；不 commit、不改插件仓、不新增 npm 依赖。
- 旧版文档 `docs/design/CAT-RAGDOLL-2026-11-18.md` 保留为历史版本；本文件是当前有效设计。

## 1. 角色设计（灰白卷毛，不是顺滑长毛）

| 项 | 实现 |
|---|---|
| 毛色 | 仅灰 + 白/米：`body #f1eee7`、`light #fdfcf7`、`shade #d6d1c7`、`belly #ece3d5`、`mask #8e9296`、`mask_dark #6b7075`、`ear #6f7479`、`ear_inner #c9c2b8`、`nose #c9b6ab`、`pad #c4b1a7` |
| 唯一冷色 | 蓝眼 `eye #5b93e0` + `eye_hi #f4f9ff` + `pupil #1e2c44`；1x 可读 |
| 道具 | 玩具球改为灰蓝色 `ball #7f8c99` / `ball_hi #d3dae1`（不再橙色） |
| 调色板总量 | 恰好 16 个 role（≤16）：outline/body/light/shade/belly/mask/mask_dark/ear/ear_inner/eye/eye_hi/pupil/nose/pad/ball/ball_hi |
| 卷毛轮廓 | `curl_puff()` 在 silhouette 上叠加 3–5px 云朵毛簇（头/耳/颈/胸/背/腹/臀/腿/尾），union outline 把毛簇包成波浪剪影；内部用 `ringlet()` 的 3px 奶油/灰 C 形卷纹，绝不使用黑色内部线 |
| 八字面罩 | 灰色覆盖头顶两侧、眼周、脸颊外侧、耳；**白/米色倒 V 白鼻梁从额头（两眼之间）一直延伸到鼻吻/下巴**（front 用 blaze rows，side 用 blaze polygon）；白吻、白下巴、白胸、白爪 |
| 耳朵 | 灰色尖耳 + 米色内耳 + 耳缘云朵卷毛 |
| 尾巴 | 灰色主毛 + 奶油色羽状卷簇 + 深灰尾尖；front 卷在右侧地面，side 低垂/后扬/竖立，整体是蓬松卷曲尾 |
| 身体灰斑 | 参考图橙色斑块位置改为灰色：左肩灰斑 + 右后腰灰斑（cloud polygon + puffs + shade 边，避免圆形“波点”） |
| 性格/动作 | 保留懒散高冷语义：慢呼吸、慢眨眼、舔爪洗脸、挠耳、伸懒腰、慢扑球、尾尖抽动、轻拍爪；同侧肢体遮挡修复保留（抬爪/挠耳时同侧地面爪不重复） |

## 2. 与参考图的对应

用户参考是一只长卷毛 Selkirk 小猫：灰+白/奶油毛，头部有橙色斑（本实现改灰），白鼻梁从额头到嘴，白下巴/白胸/白爪，尾巴长而卷曲蓬松。实现取舍：

- 橙色斑（额头两侧/身体侧）→ 灰色斑块；不保留任何暖色毛。
- 毛簇用 5px 云朵 puffs 表达“卷毛轮廓”，1x 下轮廓呈波浪/云朵状，不是直线长毛。
- 蓝眼保留为唯一冷色点缀，1x 下是清楚的蓝色像素点。
- 胸口白色卷毛围脖用大号 belly puffs + 奶油羽状边；白爪保留。

## 3. 骨架与卷毛绘制顺序

骨架沿用上一版（正面坐姿 + 侧面站姿两套），只改配色/毛簇：

- 正面坐姿：头骨椭圆 `(32,12)-(64,38)`、眼 `(41,25)/(55,25)` 5×5、鼻 `(46..50,30..32)`、躯干连续行 y=42..84、前腿 x=35..42/54..61、后臀椭圆、胸毛 bib、尾部链。
- 侧面站姿：头 `(9,21)-(32,45)`、背线 y≈39–41、腹线 y≈63、前腿肩→肘→腕、后腿髋→膝→跗→系、尾低垂/后扬/竖立。
- 卷毛绘制：先画骨架色块（body/mask/belly），再叠加 `curl_puff` 毛簇（body/mask/ear/belly）与 `ringlet` 卷纹，最后 `Canvas.finalize()` 统一填封闭洞 + 生成 1px 外轮廓。毛簇都在 outline 之前绘制，因此会改变剪影本身。

## 4. 12 clip 动作（语义与上一版一致，卷毛外观）

| clip | 帧@fps | 动作 |
|---|---:|---|
| idle | 6@6 loop | 正面坐姿慢呼吸 + 尾摆 + 耳抖 + 慢眨眼（sleepy/half） |
| idle_blink | 3@12 | sleepy → closed → sleepy（慢半闭→闭→半闭） |
| walk | 8@10 loop | 侧面慢四拍，每帧恰 1 爪离地，卷尾低垂 |
| run | 6@14 loop | 短促小跑/zoomies，卷尾后扬，尘土 FX |
| pat_head | 4@8 | 头低、耳压、眯眼、奶油腮红 + 蓝白星光 |
| ball_throw | 5@10 | 灰蓝球从右上抛落，猫抬头→侧目→慢抬爪 |
| ball_chase | 6@12 | 懒懒侧身拨球，最后半闭眼放弃 |
| paw_face | 5@8 | 舔爪（露米色肉垫）→擦脸→盖眼→收爪 |
| scratch | 6@8 | 后腿抬起挠右耳，头歪，同侧后爪不重复 |
| stand_wag | 6@8 | 猫式伸懒腰：前趴后翘弓背 → 打哈欠 → 收回 |
| chase_tail | 6@10 | 卷尾绕到前爪旁、尾尖抽动，最后高冷别头 |
| attack | 7@16 | 抬右爪横拍 + impact 条（非凶狠） |

## 5. 契约与消费者同步

- manifest：`id=pet.cat.anim.placeholder`、`palette=cat-selkirk-anim@0.1`（新）、`character=cat`、12 tags/68 assets 顺序、anchor/footBox、frames/fps/loop/layer/category/priority、attack `holdMs=[83,83,63,42,42,63,63]`、`voice={mode:none,canTts:false,bubble:thought}` 均不变。
- `public/characters/pet-cat/character.json`：`palette` 同步为 `cat-selkirk-anim@0.1`，license/note 文案改为 Selkirk Rex。
- 消费方测试同步：`tests/default-packs.test.ts`、`tests/hero-multichar-integration.test.ts` 的 cat palette 期望更新；`tests/pet-anim-cat.test.ts` 增加 Selkirk 调色板/卷毛/灰白断言（10 tests）。

## 6. 生成 / 验证

```bash
cd /mnt/d/Projects/dsh/desktop-games
python3 scripts/gen-cat-anim.py                 # 写 68 帧 + manifest
python3 scripts/gen-cat-anim.py --check         # 逐字节复验
python3 scripts/gen-cat-anim.py --verify        # 技术指标
node --import tsx --test tests/pet-anim-cat.test.ts
python3 scripts/gen-pet-anim-frames.py --check  # 委托 cat/human 生成器，全包门禁
npx tsc --noEmit
cd /mnt/d/Projects/dsh/_scratch/pet-anim-cat-selkirk-preview && python3 gen_previews.py
```

### 6.1 实测（2026-11-18）

| 门禁 | 结果 |
|---|---|
| `gen-cat-anim.py --check` | `check ok`（exit 0） |
| `gen-cat-anim.py --verify` | `FAILS: none`；68/68 unique；68 帧 bottom=89；hard alpha；max 16 colors；non-FX gap=0；internal black=0；holes=0；bbox L/T/R/B=2/5/2/6 |
| `tests/pet-anim-cat.test.ts` | **10 pass / 0 fail**（palette、卷毛 roundness/bumps、轮廓、同侧肢体遮挡、--check 确定性） |
| `gen-pet-anim-frames.py --check` | 全绿：cat → `check ok`（delegated），dog/human 也 ok |
| 消费方测试（default-packs / hero-multichar / hero-runtime / canvas-scale / pet-anim） | 74 pass / 0 fail |
| `npx tsc --noEmit` | 0 error |
| 卷毛轮廓指标（68 帧） | 圆度（perimeter/(2√(π·area))）min 2.03 / avg 2.71；四向轮廓 bump 数 min 12 / avg 31.9（平滑轮廓约 1.3/6–10） |
| 颜色预算 | 全局只用 16 个 role；逐帧 max 16 色；无橙/棕/粉毛（测试断言所有 opaque 颜色⊆16 色 Selkirk palette + 暖色阈值） |

## 7. 预览

`/mnt/d/Projects/dsh/_scratch/pet-anim-cat-selkirk-preview/`：

| 文件 | 内容 |
|---|---|
| `cat_contact_sheet_1x.png` | 12 clip 逐帧 1x |
| `cat_contact_sheet_4x.png` / `_4x_dark.png` | 4x 亮/暗底 sheet |
| `clip_<id>_4x.png` | 12 个逐 clip 4x 条 |
| `gifs/cat_<id>.gif` | 12 个 GIF（2x、按 fps；attack 用 holdMs） |
| `VERIFY-OUTPUT.txt` / `PALETTE-COUNTS.txt` / `CURLY-METRIC.txt` | 验证原始输出 |
| `gen_previews.py` / `curly_metric2.py` / `color_stats_selkirk.py` | 可重跑脚本 |

## 8. 已知限制 / 风险

1. 96px 下“卷毛”主要靠 3–5px 云朵轮廓 + 少量卷纹表达，近看会像毛簇/波浪，不是照片级卷毛；1x 可读“蓬松卷白猫 + 灰面罩 + 蓝眼 + 灰卷尾”。
2. 身体灰斑做成有机 cloud polygon，但在浅色底上仍可能被读成“灰色鞍斑”；这是把参考橙色斑改成灰色的直接结果。
3. 卷毛轮廓 bump 指标是启发式（阈值 1.7 圆度 / 10 bumps），用于防止退回顺滑布偶猫，不用于评价最终美术。
4. FX（星光/尘土/impact）仍是描边后绘制（亮芯 + 色边、无黑边），按 dog v7 规则豁免；主猫体轮廓严格闭合。
5. 全部帧仍 `placeholder:true` / `ai.status:none` / placeholder-only license；非最终美术。
6. `palette` 名称从 `cat-ragdoll-anim@0.1` 改为 `cat-selkirk-anim@0.1`，已同步 `public/characters/pet-cat/character.json` 与两个消费方测试；若还有其他外部消费方硬编码旧 palette 字符串，需要相应更新（palette 只是元数据，渲染不读取）。
7. 旧 `docs/design/CAT-RAGDOLL-2026-11-18.md` 与旧预览目录保留为历史；当前有效文档/预览以本文件与 `pet-anim-cat-selkirk-preview/` 为准。

## 9. 文件清单

| 文件 | 说明 |
|---|---|
| `scripts/cat_selkirk.py` | Selkirk Rex 渲染器（由 cat_ragdoll.py 重命名并改造；Canvas/描边/填洞/去碎点、16 色 palette、curl_puff/ringlet 卷毛、正面/侧面骨架、12 clip 姿态表） |
| `scripts/gen-cat-anim.py` | cat 生成器（import cat_selkirk，PALETTE_ID=cat-selkirk-anim@0.1，写包/--check/--verify/--sheet） |
| `public/assets/pet/anim/cat/**` | 68 张 96×96 PNG + manifest |
| `tests/pet-anim-cat.test.ts` | 10 tests（契约/磁盘/像素预算/Selkirk 调色板/卷毛/轮廓/同侧肢体/确定性） |
| `docs/design/CAT-SELKIRK-2026-11-18.md` | 本文件 |
| `_scratch/pet-anim-cat-selkirk-preview/**` | 1x/4x sheet、12 GIF、逐 clip 4x、验证输出 |

## 10. v9 侧视打磨（2026-11-18，本轮只改 cat）

用户反馈：猫狗侧视图身体像薄片/直筒，腿从身体底部长出、毛量不足。v9 只重做 cat 的侧面 walk/run（以及共用侧面的 stand_wag）：

- **躯干加厚**：SIDE_TORSO 重新塑形（背线 y≈31–33、腹线 y≈67–69），叠加胸腔椭圆与后臀椭圆；胸/肩更厚、臀有体块、腹线有收/垂。
- **毛量**：背/胸/臀关键点用 5px 云朵 puffs，腹缘 6 个奶油 puffs；前腿加肩/肘/腕毛簇与 forearm feathering；后腿加 thigh/hock 毛裤 + 奶油下缘。
- **脖子/头衔接**：neck polygon 加厚，双层 shade 颈线 + 奶油卷毛领，头不再直接压在胸上。
- **尾巴**：12→5px 粗链，两侧 5px puffs + 3 层奶油羽状缘 + 深灰尾尖；walk 低垂卷起、run 后扬，侧视不再是细直条。
- **指标**（同法测量，详见 `_scratch/pet-anim-cat-side-v9-preview/METRICS-SIDE-V9.md`）：depth 28→36（+29%），body_area avg 1140→1471（+29%），walk tail_area 343→498（+45%），run tail_area 345→434（+26%）；walk 每帧仍恰好 1 爪离地。
- **门禁**：`gen-cat-anim --check/--verify` 全绿；`tests/pet-anim-cat.test.ts` 12 pass；`gen-pet-anim-frames --check` 全绿；`tsc --noEmit` 0 error；消费方 74 pass。
- **预览**：`_scratch/pet-anim-cat-side-v9-preview/`（侧视 1x/4x sheet、walk/run GIF、SIDE-METRICS.txt）。
- 契约/颜色/轮廓/地线/同侧肢体遮挡均不变。

## 11. v10 猫脸修正（2026-11-18，只改 cat）

用户反馈两点：

1. 头顶灰色要连续合并：灰帽覆盖整个头顶/额头中线，不能被白 blaze 从顶端劈开；
2. 白八字/白鼻梁分叉起点略高于眼睛（从两眼中上方开始向下变宽到鼻吻/下巴），不是从额头最顶上开始。

实现：

- `front_head()`：灰帽改为连续椭圆 cap `(34,11)-(62,19)`；白 blaze 首行 y=19（眼睛 open 帧 top y=23，起点高于眼睛 4px），再逐行加宽到 y=37 的鼻吻/下巴；mask_dark 内缘线同步到 y=20–37。
- 头顶卷毛 puffs 全部改为 mask 色，耳内高光移出中线（x42/54→x40/56），避免白点劈开灰帽。
- `side_head()`：灰帽连续；白 blaze 起点 y≈27（侧视眼 top≈31，起点高于眼睛 4px）。
- 正面 9 个 clip + 侧视 3 个 clip 全部共用，自动生效。
- 新增第 13 个 test：正面灰帽中线白色像素 = 0、灰帽 mask ≥20、blaze 起点 ≥ 头顶点+2 且 ≤ 眼睛上缘−1；侧视灰帽顶部白色 = 0、blaze 起点 ≤ 眼睛上缘−1。实测全部通过（正面 crown white 0 / mask min 31 / blaze 19 vs eye top 23；侧视 crown white 0 / blaze 27 vs eye top 31）。
- 预览：`_scratch/pet-anim-cat-face-v10-preview/`（正面/侧脸 8x sheet + 测量脚本），并重新生成 `pet-anim-cat-selkirk-preview/` 与 `pet-anim-cat-side-v9-preview/`。
- `gen-cat-anim --check/--verify`、13 tests、`gen-pet-anim-frames --check`、`tsc --noEmit` 全绿；颜色/卷毛/契约/轮廓/地线/同侧肢体/FX 豁免均不变。

## 12. v11 短腿 + 加粗毛腿（2026-11-18，只改 cat）

用户反馈三点：侧视腿太长（20–22px）、同品种应矮脚、腿要更粗有毛。实现：

- 侧视：`SIDE_DROP=8` 整体下移躯干/头/颈/尾/腿起点，地线与爪底不变；belly 75–77，可见腿长 **12–14px**（改前 20–22）；back 39–41，躯干深度保持 36，胸腔体块不缩。
- 侧视腿加宽 + 毛：前腿 10/8/6px、后腿 9/7/6/5px，腿缘 body/belly puffs + 后腿 thigh/hock 毛裤 + 奶油下缘。
- 正面短腿：torso 底边 84→78，front legs 8→9px、前爪 8→9px；躯干略加宽（half 16→17）；后爪上提 1px + shade 连接腿防浮空；腿缘加 body puffs/奶油趾边。
- `stand_wag` 伸懒腰的 STAND_* 基线整体下移 8px、STRETCH_* 不变、头部 drop 补偿 −8，f0/f5 与 side_view 一致、f2–f4 弓背连续。
- 同侧肢体遮挡、远腿 shade、walk 每帧 1 爪离地、12 clip 语义/契约/颜色/轮廓/地线不变。
- 测试 14 pass：新增 side legLength ∈[10,15]、side y=80 腿宽 runs≥2×≥6、front paw 9px 区断言；原有 body depth/area、tail、灰帽、blaze 等保留。
- 指标：腿长 20–22→12–14（−40%）；侧视整体高度矮 8px；bbox 2/5/2/6；`--verify` FAILS none；`gen-pet-anim --check` 全绿；`tsc --noEmit` 0。
- 预览：`_scratch/pet-anim-cat-side-v10-preview/`（侧视+正面 4x/1x、walk/run GIF、LEG-METRICS.txt、METRICS-LEGS-V10.md）。

## 13. v11a：run / stand_wag 短腿修正（2026-11-18，只改 cat）

用户实测 run / stand_wag 腿仍长。原因与修复：

- run 与 walk 共用 side_view，但 `body_dy=(-2,0,-1,-2,0,-1)` 把身体抬高 2px；本轮 `body_dy` 整体 +2px，奔跑身体下压，抬腿相位/尘土 FX 不变。可见腿 12–14 → **10–12px**。
- stand_wag f0/f5 已短；f1–f4 走独立 `_stretch_body/_stretch_legs`，`STRETCH_BOTTOM` 仍是旧高腹线、front leg 从 (26,68) 到 (5,84)，可见腿 17–23px。本轮把 STRETCH_BOTTOM 改为低腹线（74–79），加低胸 floor 椭圆 + 宽 body rows + 奶油卷毛 fringe；前腿 17–23 → **10–13px**，后腿 11–15px，全部 ≤15px。
- SIDE_TORSO 腹线/chest/hip 底面再下压，侧视腿根统一贴近 y75–79；walk 维持 11–13px。
- 新增两个测试：run 每帧 legLength ∈[10,15] 且腿宽 ≥6；stand_wag 每帧 legLength ≤15 且腿宽 ≥6。总测试 16 pass。
- `gen-cat-anim --check/--verify`、`gen-pet-anim-frames --check`、`tsc --noEmit`、消费方 75/75 全绿。
- 预览：`_scratch/pet-anim-cat-side-v10-preview/run_stand_4x.png`、`gifs/cat_run.gif`、`gifs/cat_stand_wag.gif`、`RUN-STAND-LEG-METRICS.txt`、`RUN-STAND-LEG-FIX.md`；主预览同步刷新。

## 14. v12：stand_wag 10 帧慢速伸懒腰（2026-11-18，只改 cat）

用户反馈 stand_wag 持续时间太短。本轮把 cat 的伸懒腰改成 10 帧、非均匀 holdMs，cat 总帧数 68→72（其余 11 clip 不变）：

- 帧数 6→10，基础 fps 8→6（实际由 holdMs 决定），holdMs = `[300,300,300,350,400,400,400,350,250,150]`，durationMs = **3200ms**（约 3.2s）。
- 10 个真实不同姿势：0 正常短腿站姿 → 1 抬头/尾起 → 2 前爪前滑 → 3 压胸 → 4 前趴后翘全伸展 → 5 打哈欠开始（张嘴）→ 6 哈欠保持（闭眼张嘴）→ 7 开始收 → 8 拉回 → 9 回 idle 站姿（半闭眼微笑）。
- manifest：`anim.clips.stand_wag.frames=10/fps=6/durationMs=3200/holdMs=[...]`；`tags.stand_wag={frames:10,fps:6,loop:false,phase:"1b"}`；`assets=72`。cat 其余 clip 帧数/fps/loop/holdMs 全部不变。
- 短腿比例/卷毛/灰帽/白 blaze/蓝眼/96×96/地线 89/1px 轮廓/无洞/≤16 色/同侧肢体遮挡均保持。
- `scripts/gen-cat-anim.py` CLIPS 更新；`scripts/cat_selkirk.py` `draw_stand_stretch` 改为 10 姿势表。
- tests 17 pass：新增 stand_wag 10 帧/3200ms/10 唯一姿势断言；原腿长/腿宽/灰帽/blaze/轮廓/同侧肢体断言保留。
- **中央契约未改**：`src/pet/anim/clips.ts` 仍 stand_wag 6/8、cat 68，中央 `tests/pet-anim.test.ts` 预期红（clip table 6、hero 68、disk、voice policy）；cat test 内用临时 `validateCatManifest()` 桥接，lead 同步 clips.ts 后自动切回原始 manifest 校验。
- 预览：`_scratch/pet-anim-cat-stretch-2026-11-18/`（stand_wag_4x/1x、`gifs/cat_stand_wag.gif` 按 holdMs 总 3200ms、`STRETCH-REPORT.md`）；`--check/--verify`、`gen-pet-anim-frames --check`、`tsc` 全绿。

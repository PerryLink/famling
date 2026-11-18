# 汀岚 2D 像素动作动画管线：流程、刘海一致性、工具与下一版规格（2026-11-17）

> 性质：只读调研 + 资产审计 + 规格建议。**本轮未改代码/资产、未做 git、未调用图像 API、未生成图片。**
> 输入：`public/assets/pet/tinglan-256/`（49 PNG + manifest）、`public/characters/tinglan-256/character.json`、`src/pet/hero.ts`、`src/pet/character/types.ts`、`scripts/validate_art.py`、[`PIXEL-CHARACTER-WORKFLOW.md`](PIXEL-CHARACTER-WORKFLOW.md)、[`2D-ANIMATION-TECHNIQUES.md`](2D-ANIMATION-TECHNIQUES.md)、[`ANIMATION-FRAME-TIERS.md`](ANIMATION-FRAME-TIERS.md)、`docs/art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md`、`docs/audit/PACK-256-AUDIT-2026-11-17.md`。
> 口径：〔实测〕本轮 PIL/numpy 逐像素；〔公开〕有 URL（见 §6）；〔建议〕本方案判断/行业惯例，**不是标准**。

## 0. 结论（10 条）

1. 当前 49 PNG 按"整数平移去重 + 眼/嘴区域差异"归并后只有 **19 张底稿**；其余 30 个文件是平移、换眼、换口型的派生，不是新增动画帧〔实测〕。
2. 一个 tag 内真正不同的画只有 2–4 张：idle 3、pat 4、remind 2、land 2、drag 2、sleep 2、talk 1 张身体 + 4 张口型〔实测〕。
3. 帧间"大跳"来自换底稿而非中间帧：idle_01→02 变化 11,090 px、03→04 变化 11,838 px（≈opaque 的 6 成）；但剪影 IoU 仍有 0.82–0.97——**轮廓几乎不动、内部整片换稿**，所以读起来卡却不"动"〔实测〕。
4. 呼吸/浮动全是水平 ±1–3px 横移，**没有竖直方向位移**；10fps 下读作抖动，所以"帧数不足 + 不流畅"是同根问题〔实测〕。
5. **刘海方向在同一循环内翻转**：额头开口在 idle_00/02 为画面右、idle_04 翻到左；pat_01、drag_01 也反，sleep 组整体反——这是"刘海方向错误"的直接证据〔实测〕。
6. 转面只有 turn_front/side/back 三张单帧，无过渡、无统一锚点；side 视图发卡蓝块在 x128–148，与前视 x145–171 不连续〔实测〕。
7. 眼/嘴 7 张"附件"与 talk 底稿相差 0–2px；manifest 引用的 `frame-map.json`、`attachments/*`、`eye_closed.png` 等**文件不存在**，现状不能当 overlay 用〔实测〕。
8. `integrity.uniqueSha256=49` 只对文件字节成立；bbox 声明 208 宽、实际内容 130 宽；footBox 192 宽、实测双脚横跨并集仅 66px（单帧 33–55px），过宽约 3–6×〔实测〕。
9. 少数达标项：22 色（≤32）、hard alpha、外层边界 100% `#0B1220`、内层轮廓约 2px；但每帧仍有 494–1081 个孤立色点（占 opaque 3.1–6.0%），需人工清噪〔实测〕。
10. 下一版最小可玩集：**P0 = idle / look / pat / input 反应 + blink overlay**；P1 = talk / drag / land / remind；P2 = sleep / turn / 变体。约 27 张底稿、58 个运行槽位〔建议〕。

## 1. 2D 像素动作动画制作流程（手绘逐帧与骨骼通用骨架）

| 阶段 | 做什么 | 输出 | 验收门（建议） |
|---|---|---|---|
| P0 契约 | 定画布/像素网格/anchor/pivot/色板/帧表/事件/许可 | spec + palette + 帧表 | 文档↔manifest↔脚本三方一致 |
| P1 转面 | 定 3/4 正、侧、背三视图；不对称件位置表 | turnaround + 色块底稿 | 头高、眼线、发卡/珍珠侧不变 |
| P2 关键帧 | 每个动作画接触/发力/极限/回收关键姿势 | key poses | 单帧能读出动作语义 |
| P3 原画+中间帧 | 关键帧之间只补必要 in-between，逐格重画 | 干净帧序列 | 无 AA/半透明；网格对齐 |
| P4 onion skin | ±1–2 帧参考前/后帧，查剪影流与基线 | 对齐序列 | 基线/pivot 不漂；首尾可接 |
| P5 timing | 匀速只是起点：预备 1 帧、接触 hold、过冲/跟随 1–2 帧 | 帧时长表 | 快慢有节奏，不是等间隔抖 |
| P6 循环 | 首帧=尾帧（或 1 帧重叠）；接缝、hold、ping-pong | loop 标记 | 循环接缝无跳变 |
| P7 图集/导出 | 固定 cell、不逐帧 trim、2px padding、锚点对齐 | PNG 序列/atlas+JSON | 无相邻帧渗色；序号稳定 |
| P8 验收 | 1×/2×/剪影/循环/事件/回归 | 验收报告 | §5.4 脚本全过 + 人工 2× 审核 |

**关键参数与做法**（与引擎无关；带〔建议〕者为项目约定而非行业标准）：

| 项 | 做法 |
|---|---|
| 像素网格 | 1× 手绘，只整数缩放；256 画布在 pet 窗口按 1× 显示（2× 只给 key art/大窗）；禁止旋转/非整数缩放做动画〔建议〕 |
| 调色板 | 角色级索引色板（≤32 色，ramp 4–6 阶），禁 `#000000/#FFFFFF`；色板必须注册成文件可机器校验〔建议〕 |
| 轮廓 | 128 网格用 1px 闭合轮廓；256 网格用 2px（=128 的 1px 等效），颜色单一 `#0B1220`〔建议〕 |
| pivot/anchor | 单角色统一 foot-center：256 画布 anchor `(128,256)`（y=256 为底线，实体脚底在 row 255）；每帧不重设 |
| bbox/footBox | bbox 用所有帧的并集紧框；footBox 用实测脚部面积，不要 5× 拍脑袋 |
| hitbox/碰撞 | 逻辑盒与画分离：head/hand/body/tail 固定盒，动画纯表现（Celeste 式）；不做逐帧像素碰撞〔公开+建议〕 |
| 事件帧 | 动作内数据事件：`pat.contact`、`land.impact`、`remind.alert`、`talk.mouth`、`blink.start/end`、`turn.mid` |
| 帧率 | idle 8–10fps（hold 100–150ms）、action 10–12fps、impact 12–15fps、sleep 2fps；优先 10/12/15（60Hz 整除）〔建议〕 |
| 抖动/子像素 | 位移只用整数 offset（竖直 ±1）；<1px 用邻格明暗（subpixel）而非移动整图；禁止逐帧色噪〔公开+建议〕 |
| camera | 桌宠无相机滚动；窗口/角色位置只取整像素；震屏用 FX 层 ±1–2px，不移动 sprite 本体〔建议〕 |

## 2. 刘海/头发方向一致性（本角色最关键的美术风险）

**分层（后→前，全部同 canvas 同 pivot；空层也保留以固定基线）**：后发/身体/尾巴 → 头骨与脸 → 刘海分缝组（顶/左/右三块）→ 侧发与鬓角 → 眼/眉/嘴 → 眼镜/鲸发卡/珍珠耳环/领夹 → 手臂 → FX。

| 一致性规则 | 具体做法 |
|---|---|
| 锁定分缝侧 | 设定表写死"分缝在角色左/画面右、刘海扫向角色右"（或反之），所有帧、所有视图不许翻；改方向=改设定，不是逐帧决定 |
| 不对称件清单 | 鲸发卡（角色左）、双珍珠、领夹、刘海分缝、眼镜鼻托：位置/朝向/尺寸必须同源 |
| 参考层 | 先画灰阶色块底稿（body/head/hair/face 4 块）作 reference layer；每帧在底稿上描，不重新构图 |
| 禁止整帧镜像 | 有不对称件的角色镜像会翻错发卡/分缝；左右转身必须手绘过渡帧〔建议〕 |
| 转面规则 | 正面 3/4、侧、背各手绘；背视按遮挡关系隐藏发卡而非删除；侧视发卡应在远侧或露出 1–2px〔建议〕 |
| 避免 AI 漂移 | AI 只出母版/风格板；终稿 1× 网格人工重画；逐帧 AI 必然漂移发丝/色板/锚点（RetroDiffusion 明确 pixel-style≠pixel art）〔公开〕 |

**逐帧检查清单（8 条，可脚本化）**：① 额头最高皮肤点（分缝 apex）同组内 x 偏差 ≤1px；② 左右额头开口符号一致（不许翻）；③ 发卡鲸朝向/中心/面积同源（±1px，面积 ±10%）；④ 鬓角发束宽度与下缘 y 一致；⑤ 瞳孔/眼线/镜框相对头骨位置一致（眼距 30±1px）；⑥ 耳前发束与珍珠相对位置一致；⑦ 头顶轮廓 top y 同基线；⑧ 水平翻转自检：只允许不对称件变化。

## 3. 工具/软件对比与导出自动化

| 工具 | 类型/最适合 | 导出 | 自动化/校验 |
|---|---|---|---|
| **Aseprite** | 像素逐帧首选：timeline、tag、linked cel、onion skin、frame duration、slice(pivot) | PNG 序列/GIF/atlas+JSON | CLI headless 批量导出 + Lua 脚本；**本项目首选** |
| LibreSprite | Aseprite 老版分叉，免费；onion/timeline | PNG/GIF | 自动化弱；零预算备选，不建议做最终管线 |
| Photoshop | 概念/大图/修图，frame timeline+tween | PNG/GIF/脚本切图 | 不守像素网格/色板；ExtendScript；不推荐 final pixel |
| Krita | 免费，动画时间轴+onion，笔刷/参考图强 | PNG 序列 | Python 自动化；适合关键帧草稿，不守网格 |
| Procreate | iPad 概念/关键帧草图，Animation Assist+onion | GIF/PNG/MP4 | 无 sheet/CI；只做草图 |
| GraphicsGale | 老牌像素动画，onion/图层/GIF，全帧导出 | PNG/GIF | 自动化弱；能用不推荐新管线 |
| Pyxel Edit | 小 sprite/瓦片+动画，onion | sheet/GIF | 图层/自动化有限；小图标可用 |
| **Spine** | 骨骼/切件/事件/atlas；pixel grid 只防旋转重采样 | JSON/binary+atlas | runtime 事件；只做刚性切件，不做网格变形（像素会糊） |
| DragonBones | 免费骨骼，MIT runtime，JSON 导出 | JSON+atlas | 同类备选；像素适配同 Spine |
| **Godot** | 消费端：AnimatedSprite2D/SpriteFrames；AnimationPlayer call-method 轨道=事件帧；CollisionShape2D=hitbox | .res/.tres 导入 | 导入 nearest/无压缩；适合开源目标 |
| **Unity** | 消费端：Sprite Editor 像素级 pivot、Pixel Perfect Camera、Animation Events、Collider2D | SpriteAtlas | 成熟但重；2D Animation 只做刚性切件 |
| **Phaser** | Web 消费端：spritesheet+animations（frames/duration/loop/repeat/delay）、pixelArt | atlas JSON | 最接近本项目 Canvas2D/Pixi 运行时；适合浏览器内验收 |

- 导出建议〔建议〕：源文件 `.aseprite`（多 tag+图层）→ `aseprite -b char.aseprite --sheet sheet.png --data sheet.json --format json-array --sheet-type horizontal --border-padding 2`；运行时仍用"1× PNG 序列"（现状兼容），atlas 作为可选优化；不要用 GIF/APNG 当运行时资产。
- 自动校验〔建议〕：新增 `scripts/pet-anim-validate.mjs`（bbox/palette/outline/pivot/帧差/事件）+ Aseprite CLI 导出步骤进 CI；现有 `scripts/validate_art.py` 只做通用 PNG 检查，命名要求 `<name>_<W>x<H>.png` 不适配 tag 命名。
- 消费端标准能力对照〔公开〕：Aseprite tag/frame duration/onion/linked cel；Unity pivot 以像素为单位；Godot SpriteFrames 每帧 duration；Spine 事件与 atlas；Phaser 动画事件。

## 4. 当前 Tinglan 49 PNG 审计（`public/assets/pet/tinglan-256/`）

**4.1 实际文件（49）**：`hero_00`；`idle_00..07`；`pat_00..05`；`drag_00..03`；`land_00..03`；`talk_00..03`；`remind_00..05`；`sleep_00..03`；`expr_calm_00`、`expr_happy_00`；`turn_front_00`、`turn_side_00`、`turn_back_00`；`mouth_closed_00`、`mouth_a_00`、`mouth_i_00`、`mouth_u_00`；`eye_open_00`、`eye_half_00`、`eye_closed_00`。全部 256×256 RGBA。

**4.2 量化实测**：alpha 全为 {0,255}；22 色并集；边界 100% `#0B1220`、轮廓厚度约 2px；孤立噪点 494–1081 px/帧；总 515 KiB、解码 12.25 MiB；头顶 row20、脚底 row255 全部一致（靠整体缩放对齐）。相邻帧剪影 IoU：idle 0.82–0.97、pat 0.80–0.97、drag 0.75–0.76、sleep 0.82–0.97、talk 1.00；变化像素却达 4k–16k px——**轮廓冻住、内部重画**〔实测〕。

**4.3 19 张底稿的映射（可做序列 / 不能做序列）**

| 底稿组 | 文件 | 能否做序列 | 说明 |
|---|---|---|---|
| idle A/B/C | A={00,01,07} B={02,03} C={04,05,06} | 只能做 3–4 帧 | 组内是 1–3px 横移；A→B→C 换稿，非中间帧 |
| pat A/B/C/D | {00} {01,02} {03} {04,05}=expr_happy | 只能做 4 关键姿势 | 缺"被摸头"的接触/挤压反应 |
| remind A/B | {00,01} {02..05} | 只能做 2 帧 | 后 4 帧是同一张的横向漂移 |
| drag A/B | {00,02} {01,03} | 只能做 2 帧交替 | 不是摆动序列，且刘海方向相反 |
| land A/B | {00,02} {01,03} | 只能做 2 帧 | 无落底压扁帧 |
| talk 身体 | talk_00..03 = 同一身体 + 4 张口型 | **可做 overlay** | 口型差异仅 9–24px；但身体在 4 帧内不动 |
| eye | eye_open/half/closed = 同身体 + 眼区 140–166px 差异 | **可做 overlay** | 与 `hero/expr_calm/eye_open` 逐像素重复 |
| mouth | mouth_a/i/u/closed = talk 四帧本体 | **可做 overlay** | 与 talk 帧一一对应 |
| 单帧视图 | turn_front/side/back | 不能 | 无过渡、无统一朝向；侧/背视图不一致 |
| 重复 | `expr_calm_00`=`hero_00`=`eye_open_00`；`expr_happy_00`=`pat_04/05` | — | 2 个"表情文件"是已有帧的复制 |

**4.4 刘海/头部一致性实测（"刘海方向错误"证据）**

| 指标 | idle_00 | idle_02 | idle_04 | pat_01 | sleep_02 | turn_side |
|---|---|---|---|---|---|---|
| 额头开口侧（min 顶部皮肤 y 的一侧） | 右(y55) | 右(y54) | **左(y62)** | **左(y59)** | 左(y51) | 左(y57) |
| 头发线相对 idle_00 平均偏差 | 0 | 3.8 | **10.2** | 8.1 | 11.6 | 14.1 |
| 眼中心（蓝瞳）x | 112/142 | 111/143 | 111/141 | 111/142 | — | 106 |
| 发卡鲸 bbox | (154,171,53,63) | (152,173,52,64) | (146,168,50,63) | (148,166,50,61) | (151,173,54,67) | (128,148,50,64) |

结论：同一 tag 内分缝/开口方向会翻、眼位漂 8–13px、发卡中心前视漂 8px（含侧视 24px）、发卡面积 110–178px；这不是"缺帧"，是**同一角色多张底稿没有共同母版**。

**4.5 manifest / 运行时问题**：`layers.frameMap`、`layers.attachmentAnchors/attachmentFiles`、`gate.script`、`gate.result` 指向的文件均不存在〔实测〕；`bbox=[32,20,208,236]` 过宽（实际内容 x63–192）、`footBox=(-96,-48,192,48)` 过宽约 5×；无 offsets/事件/hitbox/attachment 锚点数据；`hero.ts` 只消费 `id/style/canvas/anchor/footBox/palette/tags(frames,fps,loop,phase)/assets/license/ai`，其余字段被丢弃，`setExpression/setMouth` 不渲染 overlay；49 帧一次性加载。

**4.6 重做优先级**：**P0（先做，否则加帧也白做）**——统一母版（刘海分缝/发卡/眼位/头顶）+ idle 3–4 + look 2 + pat 4 + input 反应 2 + blink 眼层 3；删除/替换 30 个派生槽；补 bbox/footBox/事件/附件锚点与验收脚本。**P1**——talk（1 身体 + 4 口型 overlay）、drag 2（悬空 offset）、land 2（冲击压扁 + impact 事件）、remind 4（alert 事件）。**P2**——sleep 2、turn 3 视图 + 2 过渡、表情变体与 FX；转面/多方向在 P0/P1 动作稳定后再扩。

## 5. 下一版美术规格（可执行）

**5.1 硬规格**：画布 256×256（保持 FCI/loader 兼容；1× 重画；运行时只整数倍显示：pet 窗口 1×，2× 仅 key art/大窗）；anchor `(128,256)` foot-center、脚底 row255；`bbox` 紧框 `[63,20,130,236]`；`footBox` 实测约 `(-39,-20,66,20)`，脚中心须锁 `128±2`；2px `#0B1220` 闭合轮廓；色板 `orca-pixel@0.2`（≤32 色，必须注册 hex/json）；视图=正面 3/4 + 侧（左）+ 背，3 视图手绘，禁止整帧镜像；暂不做 8 方向。

**5.2 序列/帧数/事件（运行槽位，不是手绘张数）**

| tag | 槽位 | 底稿 | fps | loop | 事件帧 | 备注 |
|---|---:|---:|---:|---|---|---|
| idle | 8 | 3 | 8 | 是 | — | 竖直 ±1 offset + hold 120ms |
| look | 4 | 2 | 10 | 否 | look.left/right | 头/眼转，发卡随头 |
| blink | 3 | 3(眼层) | 12 | 是 | blink.start/end | overlay，随机间隔 3–6s |
| pat | 6 | 4 | 10 | 否 | pat.contact(f3)/pat.release(f5) | 接触帧+挤压+眯眼 |
| input | 4 | 2 | 12 | 否 | input.ack(f2) | 点击/按键反应 |
| talk | 4+4 | 1+4口型 | 8/12 | 是 | talk.mouth | 身体 1 张 + 口型 overlay |
| drag | 4 | 2 | 8 | 是 | drag.grab/release | 悬空 offset，脚不贴底 |
| land | 3 | 2 | 12 | 否 | land.impact(f0) | 压扁+回弹+站稳 |
| remind | 8 | 4 | 10 | 否 | remind.alert(f3) | 手势/铃 FX |
| sleep | 4 | 2 | 2 | 是 | — | Z FX 程序化 |
| turn | 6 | 3视图+2过渡 | 12 | 否 | turn.mid | front→side→back |
| **合计** | **58** | **27** | — | — | 11 类事件 | P0 约 25 槽位（12 底稿 + 3 眼层） |

**5.3 目录与 manifest 字段（增量、不改现有 loader 语义）**：继续用 `public/assets/pet/tinglan-256/` + `manifest.json`；帧仍为 `<tag>_<NN>.png` 平铺（`assets` 长度必须= tags 帧数之和，否则 `validateCharacterPack` 抛错）；新增同目录 `layers/`（eye/mouth 透明叠加层）、`palette/orca-pixel-0.2.hex`。manifest 增量块〔建议，需未来代码消费〕：`baseline:255`、`pivotFrame:[128,255]`、`framesMeta:[{asset,offset:[dx,dy],holdMs}]`、`events:{tag:[{frame,name,payload?}]}`、`attachments:{eyes:[{image,offset:[x,y],baseTag}],mouth:[...]}`、`hitboxes:{head,hand,body,tail}`、`directions:{front,side_l,back}`、`paletteFile`、`integrity.pixelContentSha`。这些字段当前会被 `hero.ts` 静默丢弃（不报错），加它们不破坏 FCI 0.1/0.2 与 `?hero=1&character=tinglan`；要真正播放 overlay/事件/offset，需另开渲染器任务（不在本轮范围）；附件渲染落地前，blink/口型先烘焙成整图帧（每帧 1 张 PNG）以兼容当前 loader。

**5.4 验收测试（建议脚本 `scripts/pet-anim-validate.mjs`）**

| # | 测试 | 判据 |
|---|---|---|
| A1 | 尺寸/alpha/透明 RGB | 256×256；alpha∈{0,255}；透明像素 RGB=0 |
| A2 | 色板 | ≤32 色；全部在注册色板内；无 `#000/#FFF`；无 ΔE<4 的重复近色阶 |
| A3 | 轮廓 | 外层边界 100% 描边色；内 2px 轮廓 ≥99%；无断点 |
| A4 | pivot/bbox/footBox/脚底 | 内容⊂紧 bbox；pivot=脚底 row255；脚中心 128±2，跨帧漂 ≤1px |
| A5 | 头/眼基线 | 头顶 row20±1；眼线 y 跨帧 ±1；眼距 30±1；瞳孔间距恒定 |
| A6 | 刘海 | 分缝 apex x 同组 ±1；左右开口符号全组一致；hairline 平均偏差 ≤1px |
| A7 | 不对称件 | 发卡/珍珠/领夹 bbox 跨帧 ±1px、面积 ±10%；朝向不变 |
| A8 | overlay 配准 | 叠加层窗内差异=0；相对 base 漂移 0px；baseTag 对齐 |
| A9 | 序列差异 | 帧差只出现在声明运动区；相邻帧内容位移≤声明 offset；循环首尾同姿势 |
| A10 | timing | fps/holdMs 合法；1/fps≥66ms；10/12/15fps 优先；事件帧单调存在 |
| A11 | 加载回归 | `validateCharacterPack` 通过；49→N 文件全在；`npm test` 更新后通过；2× 拼图人工审 |

**5.5 执行顺序与工作量**〔估算〕：P0（母版+刘海/发卡/眼位统一 + idle/look/pat/input/blink + 删 30 个派生槽）≈ 6–10 人天；P1（talk/drag/land/remind + overlay 锚点）≈ 4–6 人天；P2（sleep/turn/变体/FX）≈ 4–6 人天；加验收脚本 1–2 人天。**非目标**：不批量 AI 生图、不逐帧 AI 生成、不做 8 方向/骨骼网格变形。

## 6. 来源（URL）与"标准 vs 建议"说明

- 〔官方文档〕Aseprite Animation：https://aseprite.org/docs/animation/ · Onion Skinning：https://aseprite.org/docs/onion-skinning/ · Frame Duration：https://aseprite.org/docs/frame-duration/ · Tags：https://aseprite.org/docs/tags/ · Linked Cels：https://aseprite.org/docs/linked-cels/ · Sprite Sheet：https://aseprite.org/docs/sprite-sheet/ · CLI：https://aseprite.org/docs/cli/ · Slices/pivot：https://aseprite.org/docs/slices/
- 〔官方文档〕Unity 像素 pivot（Pivot Unit Mode=Pixels）：https://docs.unity3d.com/6000.4/Documentation/Manual/urp/2d-pixelperfect-prep-sprites.html · Pixel Perfect Camera：https://docs.unity3d.com/6000.4/Documentation/Manual/urp/2d-pixelperfect.html · Animation Events：https://docs.unity3d.com/6000.0/Documentation/Manual/AnimationEvents.html
- 〔官方文档〕Godot SpriteFrames：https://docs.godotengine.org/en/stable/classes/class_spriteframes.html · AnimatedSprite2D：https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html · Animation track types（call method）：https://docs.godotengine.org/en/stable/tutorials/animation/animation_track_types.html · Multiple resolutions/pixel snap：https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html
- 〔官方文档〕Spine Pixel grid：https://esotericsoftware.com/spine-settings#Pixel-grid · Spine Events：https://esotericsoftware.com/spine-events · Spine Meshes：https://esotericsoftware.com/spine-meshes · DragonBones runtime：https://github.com/DragonBones/DragonBonesJS
- 〔官方文档〕Phaser Animations：https://docs.phaser.io/phaser/concepts/animations · Krita Onion Skin：https://docs.krita.org/en/reference_manual/dockers/onion_skin.html · Procreate Animation：https://help.procreate.com/procreate/handbook/animation/animation-interface · Photoshop Tween：https://helpx.adobe.com/photoshop/desktop/add-video-and-animation/create-animation-frames/create-frames-using-tweening.html
- 〔官方/项目页〕GraphicsGale：https://www.graphicsgale.com/spec.html · Pyxel Edit：https://pyxeledit.com/features.php · LibreSprite：https://libresprite.github.io/
- 〔公开教程/文章〕Slynyrd 走路循环：https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle · Saint11 像素教程：https://saint11.art/blog/pixel-art-tutorials/ · Owlboy subpixel：https://forums.tigsource.com/index.php?topic=17398.220 · Celeste 美术分析：https://teemo.dev/game-design/celeste/systems/art-direction-and-visual-language/ · 像素动画有限帧：https://en.wikipedia.org/wiki/Limited_animation · image-rendering：https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering · Stardew 镜像规则：https://wiki.stardewvalley.net/Modding:Farmer_sprite · AI 像素漂移：https://retrodiffusion.ai/blog/ai-pixel-art-isnt-pixel-art
- **标准 vs 建议**：上表 Aseprite/Unity/Godot/Spine/Phaser 的 API 与导出格式是各工具官方定义；"2px 轮廓、色板槽位、帧率档位、层级顺序、事件命名、验收阈值、P0–P2 排期"均为**本项目建议/行业惯例，不是标准**；刘海一致性规则属于角色设计约定，必须落到本项目设定表才有效。
- 本地依据：`docs/art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md`（49 帧=19 源 + offset/hold/attachment 映射、body 层跨姿态不一致）、`docs/audit/PACK-256-AUDIT-2026-11-17.md`（v1 的 19 内容/30 重复帧/调色板与轮廓问题）、`docs/research/AI-SPRITE-ANIMATION-TECHNIQUES.md`（AI 帧间漂移与逐帧生成风险）。

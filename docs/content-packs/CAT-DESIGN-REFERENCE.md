# CAT（布偶猫 blue bicolor）角色主题设计参考

> 状态：**工程参考 v2 · 2026-11-20 · 72 帧占位包已按此契约生成**。
> 适用：famling `rolePresets[1]`（id `cat`）与第三方猫科角色主题包。
> 同源实现：`scripts/cat_selkirk.py`（渲染器文件名为历史遗留，内容已换为布偶直长毛）、`public/characters/pet-cat/character.json`、`public/assets/pet/anim/cat/manifest.json`。
> 生成/验收契约：`docs/art/prompts/CAT-RAGDOLL-PROMPT-PACK-2026-11-20.md`；调色板锁定：`docs/art/prompts/PALETTE-LOCK-2026-11-20.md` §4.1。
> 示例包：`docs/content-packs/examples/cat.example.pack.json`。

## 0. 一句话

猫=**蓝重点双色布偶猫（blue bicolor Ragdoll）**：白为主丝滑直长毛 + 冷灰蓝连帽/面罩/耳/羽状尾 + 白 blaze 从眼上开始；96×96、12 clip / **72 帧**（stand_wag 10 帧）、地线 y=89；懒散高冷、空心心理活动气泡、**永不 TTS**；不做萌宠卖萌、不做情感陪伴。

> 设定说明：2026-11-18 曾把 cat 改成「塞尔凯克卷毛猫」（灰白卷毛）。2026-11-20 用户/owner 批准改回**同配色布偶猫**：16 个 palette hex 逐字节不变，只换品种、毛型语义与几何（卷毛→直长毛、羽状尾、围脖、面罩语义）；短腿、v10 连帽+blaze、灰耳灰尾、懒散高冷人格均保留。

## 1. 画布 / 锚点 / 帧契约（硬约束）

| 项 | 值 |
|---|---|
| 画布 | `96 × 96` RGBA，1x；最近邻放大 |
| 锚点 | `{ x: 48, y: 96, mode: 'foot-center' }` |
| footBox | `{ x: -36, y: -18, w: 72, h: 18 }` |
| 地线（ground line） | **y = 89**；每帧最低不透明像素=89；y=90–95 恒透明 |
| 帧数 | **72 帧 / 12 clip**（其余 11 clip 同 v7 骨架；`stand_wag` 为 10 帧@6fps 非均匀 holdMs） |
| 硬 alpha | 只有 0/255；禁止半透明/抗锯齿 |
| 轮廓 | 唯一 1px 闭合外轮廓 `#0B1220`；内部线只用调色板内的浅色/深色，不用轮廓色 |
| 色数 | 全局 16 role；每帧 ≤16 色（anim 门禁 ≤20） |
| 洞 | 禁止封闭透明洞；抬爪时同侧地面爪不得重复绘制 |

## 2. 比例与骨架（96 px）

- 正面坐姿：头骨椭圆 `(32,12)-(64,38)`、眼 `(41,25)/(55,25)` 5×5、鼻 `(46..50,30..32)`、躯干连续行 y=42..84、前腿 x=35..42/54..61、后臀椭圆、胸围脖、尾部链。
- 侧面站姿：头 `(9,21)-(32,45)`、背线 y≈41–43、腹线 y≈78、前腿肩→肘→腕、后腿髋→膝→跗→系；尾低垂/后扬/竖立三型。
- **产品化短腿**（v11 沿用，非 Ragdoll 品种标准）：侧视可见腿 10–14px、正面可见前腿 9px；换品种不换骨架比例。
- 头身比保持“成年猫”而非幼态大头：正面头+耳约 37px、头宽/躯干约 0.79；总高约 76，地面 y=89 固定。
- 直长毛语法（F1–F6）：主剪影平滑，只在 **4 个毛区**（胸围脖、腹线、后腿毛裤、羽状尾）与 **面部重点**（耳尖/颊 1–2px）出现羽状锚点；内部用 ≤10 条 1px 断续毛流线（light/shade）表达 guard hairs。**禁止云朵毛簇与 C 形卷纹**。

## 3. 调色板（16 role，逐 hex 与旧 Selkirk 包相同）

| role | hex | 布偶用途 |
|---|---|---|
| outline | `#0B1220` | 唯一 1px 外轮廓 |
| body | `#F1EEE7` | 白/象牙身体主毛（头/躯干/腿/尾根白区） |
| light | `#FDFCF7` | 白 blaze（必须继续用 light 画）+ 左上高光 + 毛流 |
| shade | `#D6D1C7` | 冷灰阴影/远腿/右下毛流 |
| belly | `#ECE3D5` | 胸围脖 ruff、下巴、爪、腿后羽、尾羽、颊色 |
| mask | `#8E9296` | **冷灰蓝重点**：连帽、眼周/外颊面罩、耳外侧、尾主毛 |
| mask_dark | `#6B7075` | 重点深阶：面罩内缘 1px、口线/嘴内衬、闭眼线、尾尖 |
| ear | `#6F7479` | 耳外侧重点色 + 尾尖深色块 |
| ear_inner | `#C9C2B8` | 浅色内耳 |
| eye | `#5B93E0` | 布偶蓝眼（唯一冷色） |
| eye_hi | `#F4F9FF` | 1px 眼高光 / 星光 |
| pupil | `#1E2C44` | 瞳孔 |
| nose | `#C9B6AB` | 鼻头（muted mauve） |
| pad | `#C4B1A7` | 露爪肉垫 / 张嘴内衬 |
| ball | `#7F8C99` | 玩具球主体（只 ball_throw / ball_chase） |
| ball_hi | `#D3DAE1` | 球高光 |

> 禁止橙/棕/粉红毛（旧布偶参考里的橙色斑块一律改灰或去掉）。白色鼻梁从眼睛上方贯穿到嘴吻/下巴，白吻/白下巴/白胸/白爪保留。身体灰斑已按 owner 决定移除：重点色只在头部连帽/面罩、耳、尾，身体以白为主。

## 4. 剪影与识别点

- 平滑直长毛剪影（头/躯干/腿不再呈云朵状）；
- 连续灰蓝连帽 + v10 白 blaze（从眼睛上方开始，不劈开帽中线）；
- 蓝眼是唯一冷色点缀（1x 下清楚可读）；
- 羽状长尾：粗根、锥形递减、3–4 个 2–3px 缺口、深色尾尖；front 绕到右侧地面 / side 低垂后扬；
- 胸围脖 2–3 级奶油扇贝 + 1px shade 下缘；后腿毛裤 2px 三角羽；
- 耳尖 1–2px 毛簇、颊部 1px 白毛、胡须根 1px shade；面部毛簇 ≤4 处。

## 5. 12 clip / 72 帧

| clip | 帧@fps | loop | 语义 |
|---|---:|---|---|
| idle | 6@6 | ✅ | 正面坐姿慢呼吸 + 尾摆 + 耳抖 + 慢眨眼（sleepy/half） |
| idle_blink | 3@12 | ❌ | sleepy → closed → sleepy（慢半闭→闭→半闭） |
| walk | 8@10 | ✅ | 侧面慢四拍，每帧恰 1 爪离地，羽状尾低垂 |
| run | 6@14 | ✅ | 短促小跑/zoomies，尾后扬，尘土 FX |
| pat_head | 4@8 | ❌ | 头低、耳压、眯眼、奶油腮红 + 蓝白星光 |
| ball_throw | 5@10 | ❌ | 灰蓝球从右上抛落，猫抬头→侧目→慢抬爪 |
| ball_chase | 6@12 | ❌ | 懒懒侧身拨球，最后半闭眼放弃 |
| paw_face | 5@8 | ❌ | 舔爪（露米色肉垫）→擦脸→盖眼→收爪 |
| scratch | 6@8 | ❌ | 后腿抬起挠右耳，头歪，同侧后爪不重复 |
| stand_wag | **10@6（非均匀 holdMs）** | ❌ | 猫式伸懒腰：前趴后翘弓背→打哈欠→收回（3200ms） |
| chase_tail | 6@10 | ❌ | 羽状尾绕到前爪旁、尾尖抽动，最后高冷别头 |
| attack | 7@16 | ❌ | 抬右爪横拍 + impact 条（非凶狠） |

合计 **72 帧**。manifest 契约：`famling.pet-anim/0.1`，`character=cat`，`voice={mode:'none',canTts:false,bubble:'thought'}`，palette `cat-ragdoll-anim@0.1`（hex 不变，只改名）。

## 6. 对话语气（猫）

- **只有心理活动气泡（thought），永不进 TTS、永不发真人语音**；`voiceId` 必须是 `none`。
- 文字短、懒、克制；可傲娇但不刻薄；不撒娇讨好、不制造依恋。
- 不拟人化恋爱/伴侣关系；不使用「主人」「老公/老婆」等称呼；不诱导付费/连续签到。
- 不得冒充真实宠物或真人；猫的“喵”不得做成真人配音或付费声线。

## 7. 禁止事项（验收会直接判负）

- 给猫开 TTS / 实心 speech 气泡 / 真人语音克隆（产品红线，模型直接拒绝）；
- 橙色、棕色、粉红色毛，seal point 暖褐重点，虎斑纹（本角色只允许白 + 冷灰蓝重点 + 蓝眼）；
- 卷毛/云朵毛簇/C 形卷纹（退回 Selkirk）；短毛/光滑短毛；短尾/无尾/细鞭尾/尾卷成环；
- 幼态大头卖萌、心形瞳、泪光、 blush 卖萌、拟人化性化姿势；
- 违反 96px 契约：半透明、抗锯齿、地线不是 y=89、内部轮廓色线、封闭透明洞、>16 色/帧；
- 写实猫照片/描摹、现有版权猫角色、真人照片或声线；
- 情感陪伴/虚拟伴侣/付费亲密度、医疗/法律/金融建议、未成年人亲密、违法用途（见 `docs/legal/USE-RESTRICTIONS-2026-11-19.md`）。

## 8. 第三方如何从本参考起步

1. 复制 `docs/content-packs/examples/cat.example.pack.json`，改 `id`/`name`/`roleThemes[].id`（不得以 `famling.` 开头）。
2. 从 `docs/art/prompts/CAT-RAGDOLL-PROMPT-PACK-2026-11-20.md` §2/§4 的身份卡与 F1–F6 直长毛语法出发，产出 96×96 PNG；72 帧可按 12 clip 拆分（也可先交 68 帧的 11 clip 版本，但 `stand_wag` 10 帧是当前用户验收口径）。
3. `roleThemes[]` 的 `characterId` 指向宿主 `cat`，`voiceId` 必须 `none`；`appearance` 引用宿主已有 theme/background/font（或随包 components 提供）。
4. 填 `usageDeclaration`（canonical 短句 + 6 个 prohibitedUses）、`license`、`aiProvenance`、`compatibility.library='famling.content/0.2'`、`files[].bytes/sha256`。
5. 用 `validateContentPackV2` + `validatePackZip` 自检（见 `docs/content-packs/README.md` §5）。
6. zip：`pack.json` 在根、素材在 `assets/`，对外分发前确认素材权利。

## 9. 新 rig 动画资产包 0.2（可选进阶）

上面 §1–§5 的 96×96 / 12 clip / 72 帧 帧预算同时是 `famling.pet-anim/0.2`（**新动画/新 rig** 资产包）的帧预算依据：

- 规范全文：`docs/content-packs/ANIM-PACK-0.2.md`（zip 布局、12 clip canonical 表、voice/audio/behavior/regions、安装器 PLAN、负向红线）；
- 本角色的 anim 示例：`docs/content-packs/examples/cat.anim.example.pack.json`（72 帧占位清单，可直接 `validateCharacterPackV2`；sha256 是占位值，真实素材须重算）；
- 只换皮肤/声音/对话/配色 → 用 `famling.content-pack/0.2` 主题包（§8）；只有要交付**新动画帧/新 rig**才用 pet-anim；
- **边界（诚实文案）**：pet-anim 的 loader/数据驱动注册表/热切换（MB-041）与真实安装器（MB-042）**未实现**，实现前不要对外宣称可安装新角色。

> 本文件是工程参考，不构成法律意见。

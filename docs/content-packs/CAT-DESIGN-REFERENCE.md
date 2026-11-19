# CAT（塞尔凯克卷毛猫）角色主题设计参考

> 状态：**工程参考 v1 · 2026-11-19 · 72 帧占位包已按此契约生成**。
> 适用：famling `rolePresets[1]`（id `cat`）与第三方猫科角色主题包。
> 同源实现：`docs/design/CAT-SELKIRK-2026-11-18.md`、`public/characters/pet-cat/character.json`、`public/assets/pet/anim/cat/manifest.json`。
> 示例包：`docs/content-packs/examples/cat.example.pack.json`。

## 0. 一句话

猫=**灰+白/米卷毛、懒散高冷**：96×96、12 clip / **72 帧**（stand_wag 10 帧）、地线 y=89；空心心理活动气泡、**永不 TTS**；不做萌宠卖萌、不做情感陪伴。

## 1. 画布 / 锚点 / 帧契约（硬约束）

| 项 | 值 |
|---|---|
| 画布 | `96 × 96` RGBA，1x；最近邻放大 |
| 锚点 | `{ x: 48, y: 96, mode: 'foot-center' }` |
| footBox | `{ x: -36, y: -18, w: 72, h: 18 }` |
| 地线（ground line） | **y = 89**；每帧最低不透明像素=89；y=90–95 恒透明 |
| 帧数 | **72 帧 / 12 clip**（其余 11 clip 同 v7 骨架；`stand_wag` 为 10 帧@6fps 非均匀 holdMs） |
| 硬 alpha | 只有 0/255；禁止半透明/抗锯齿 |
| 轮廓 | 唯一 1px 闭合外轮廓 `#0B1220`；卷毛也算剪影，内部线只用浅色 |
| 色数 | 全局 16 role；每帧 ≤16 色 |
| 洞 | 禁止封闭透明洞；抬爪时同侧地面爪不得重复绘制 |

## 2. 比例与骨架（96 px）

- 正面坐姿：头骨椭圆 `(32,12)-(64,38)`、眼 `(41,25)/(55,25)` 5×5、鼻 `(46..50,30..32)`、躯干连续行 y=42..84、前腿 x=35..42/54..61、后臀椭圆、胸毛 bib、尾部链。
- 侧面站姿：头 `(9,21)-(32,45)`、背线 y≈39–41、腹线 y≈63、前腿肩→肘→腕、后腿髋→膝→跗→系；尾低垂/后扬/竖立。
- 卷毛轮廓：`curl_puff()` 在剪影上叠加 3–5px 云朵毛簇（头/耳/颈/胸/背/腹/臀/腿/尾），`ringlet()` 用 3px 奶油/灰 C 形卷纹；**先画毛簇再统一 outline**，因此剪影呈波浪/云朵状，不是直线长毛。
- 头身比保持“成年小猫”而非幼态大头：正面头+耳约 37px、头宽/躯干约 0.79、可见前腿 14px；总高约 76，地面 y=89 固定。

## 3. 调色板（16 role，仅灰+白/米，唯一冷色蓝眼）

| role | hex | 用途 |
|---|---|---|
| outline | `#0B1220` | 唯一 1px 外轮廓 |
| body | `#F1EEE7` | 灰白主毛 |
| light | `#FDFCF7` | 亮毛/高光 |
| shade | `#D6D1C7` | 阴影/远处腿 |
| belly | `#ECE3D5` | 奶油胸毛/爪/尾羽 |
| mask | `#8E9296` | 八字面罩灰 |
| mask_dark | `#6B7075` | 面罩深灰/尾尖 |
| ear | `#6F7479` | 耳外侧灰 |
| ear_inner | `#C9C2B8` | 耳内米灰 |
| eye | `#5B93E0` | 蓝眼（唯一冷色） |
| eye_hi | `#F4F9FF` | 1px 眼高光 / 星光 |
| pupil | `#1E2C44` | 瞳孔 |
| nose | `#C9B6AB` | 鼻/肉垫缝 |
| pad | `#C4B1A7` | 肉垫 |
| ball | `#7F8C99` | 玩具球 |
| ball_hi | `#D3DAE1` | 球高光 |

> 禁止橙/棕/粉红毛色（旧布偶参考里的橙色斑块一律改灰斑）。白色鼻梁从额头（两眼之间）到嘴吻/下巴，白吻/白下巴/白胸/白爪保留。

## 4. 剪影与识别点

- 灰白卷毛云朵轮廓（头/耳/颈/胸/背/腹/臀/腿/尾）；
- 八字灰面罩 + **白鼻梁 blaze** 从额头贯穿到鼻吻；
- 蓝眼是唯一冷色点缀（1x 下清楚可读）；
- 蓬松卷尾（灰主毛 + 奶油羽 + 深灰尾尖），front 卷在右侧地面 / side 低垂后扬；
- 左肩 + 右后腰灰色斑块（cloud polygon + shade 边，避免“波点”）。

## 5. 12 clip / 72 帧

| clip | 帧@fps | loop | 语义 |
|---|---:|---|---|
| idle | 6@6 | ✅ | 正面坐姿慢呼吸 + 尾摆 + 耳抖 + 慢眨眼（sleepy/half） |
| idle_blink | 3@12 | ❌ | sleepy → closed → sleepy（慢半闭→闭→半闭） |
| walk | 8@10 | ✅ | 侧面慢四拍，每帧恰 1 爪离地，卷尾低垂 |
| run | 6@14 | ✅ | 短促小跑/zoomies，卷尾后扬，尘土 FX |
| pat_head | 4@8 | ❌ | 头低、耳压、眯眼、奶油腮红 + 蓝白星光 |
| ball_throw | 5@10 | ❌ | 灰蓝球从右上抛落，猫抬头→侧目→慢抬爪 |
| ball_chase | 6@12 | ❌ | 懒懒侧身拨球，最后半闭眼放弃 |
| paw_face | 5@8 | ❌ | 舔爪（露米色肉垫）→擦脸→盖眼→收爪 |
| scratch | 6@8 | ❌ | 后腿抬起挠右耳，头歪，同侧后爪不重复 |
| stand_wag | **10@6（非均匀 holdMs）** | ❌ | 猫式伸懒腰：前趴后翘弓背→打哈欠→收回（用户反馈时长太短后由 6→10 帧） |
| chase_tail | 6@10 | ❌ | 卷尾绕到前爪旁、尾尖抽动，最后高冷别头 |
| attack | 7@16 | ❌ | 抬右爪横拍 + impact 条（非凶狠） |

合计 **72 帧**。manifest 契约：`famling.pet-anim/0.1`，`character=cat`，`voice={mode:'none',canTts:false,bubble:'thought'}`，palette `cat-selkirk-anim@0.1`。

## 6. 对话语气（猫）

- **只有心理活动气泡（thought），永不进 TTS、永不发真人语音**；`voiceId` 必须是 `none`。
- 文字短、懒、克制；可傲娇但不刻薄；不撒娇讨好、不制造依恋。
- 不拟人化恋爱/伴侣关系；不使用「主人」「老公/老婆」等称呼；不诱导付费/连续签到。
- 不得冒充真实宠物或真人；猫的“喵”不得做成真人配音或付费声线。

## 7. 禁止事项（验收会直接判负）

- 给猫开 TTS / 实心 speech 气泡 / 真人语音克隆（产品红线，模型直接拒绝）；
- 橙色、棕色、粉红色毛（本角色只允许灰+白/米 + 蓝眼）；
- 幼态大头卖萌、心形瞳、泪光、 blush 卖萌、拟人化性化姿势；
- 违反 96px 契约：半透明、抗锯齿、地线不是 y=89、内部黑线、封闭透明洞、>16 色/帧；
- 写实猫照片/描摹、现有版权猫角色、真人照片或声线；
- 情感陪伴/虚拟伴侣/付费亲密度、医疗/法律/金融建议、未成年人亲密、违法用途（见 `docs/legal/USE-RESTRICTIONS-2026-11-19.md`）。

## 8. 第三方如何从本参考起步

1. 复制 `docs/content-packs/examples/cat.example.pack.json`，改 `id`/`name`/`roleThemes[].id`（不得以 `famling.` 开头）。
2. 从 `docs/design/CAT-SELKIRK-2026-11-18.md` 的骨架与调色板出发，产出 96×96 PNG；72 帧可按 12 clip 拆分（也可先交 68 帧的 11 clip 版本，但 `stand_wag` 10 帧是当前用户验收口径）。
3. `roleThemes[]` 的 `characterId` 指向宿主 `cat`，`voiceId` 必须 `none`；`appearance` 引用宿主已有 theme/background/font（或随包 components 提供）。
4. 填 `usageDeclaration`（canonical 短句 + 6 个 prohibitedUses）、`license`、`aiProvenance`、`compatibility.library='famling.content/0.2'`、`files[].bytes/sha256`。
5. 用 `validateContentPackV2` + `validatePackZip` 自检（见 `docs/content-packs/README.md` §5）。
6. zip：`pack.json` 在根、素材在 `assets/`，对外分发前确认素材权利。

> 本文件是工程参考，不构成法律意见。

# DOG（金毛寻回犬）角色主题设计参考

> 状态：**工程参考 v1 · 2026-11-19 · 68 帧占位包已按此契约生成**。
> 适用：famling `rolePresets[2]`（id `dog`）与第三方犬科角色主题包。
> 同源实现：`docs/PET-DOG-ANIM-V7-2026-11-18.md`、`scripts/dog_golden5.py`、`public/characters/pet-dog/character.json`、`public/assets/pet/anim/dog/manifest.json`。
> 示例包：`docs/content-packs/examples/dog.example.pack.json`。

## 0. 一句话

狗=**成年金毛、短腿、憨厚友好**：96×96、12 clip / 68 帧、地线 y=89；空心心理活动气泡、**永不 TTS**；不做幼犬卖萌/情感陪伴。

## 1. 画布 / 锚点 / 帧契约（硬约束）

| 项 | 值 |
|---|---|
| 画布 | `96 × 96` RGBA，1x；最近邻放大 |
| 锚点 | `{ x: 48, y: 96, mode: 'foot-center' }` |
| footBox | `{ x: -36, y: -18, w: 72, h: 18 }` |
| 地线（ground line） | **y = 89**；每帧最低不透明像素=89；y=90–95 恒透明 |
| 帧数 | **68 帧 / 12 clip**（idle 6 / idle_blink 3 / walk 8 / run 6 / pat_head 4 / ball_throw 5 / ball_chase 6 / paw_face 5 / scratch 6 / stand_wag 6 / chase_tail 6 / attack 7） |
| 硬 alpha | 只有 0/255；禁止半透明/抗锯齿 |
| 轮廓 | 唯一 1px 闭合外轮廓 `#0B1220`；内部sep只用 `#a96a26`/浅/深毛色，禁止内部黑线 |
| 色数 | 全局 18 role；每帧 ≤20 色（实测 16–19） |
| 洞 | 禁止封闭透明洞；前后爪之间用 1px 透明缝而不是封闭洞 |

## 2. 比例与骨架（96 px）

- **成年金毛**，不是 chibi：正面头整体缩到 v8 的 0.88（`HEAD_SCALE`），侧视 0.90（`SIDE_HEAD_SCALE`）；正面头+耳约 37px、头宽/躯干约 0.79、头高/总高约 30%。
- **短腿品种**：`SIDE_BODY_DROP=9`，躯干下沉，可见前腿约 14–17px（`FRONT_LEG_TOP=68`）；身体底线约为 y=72，腿延伸到 y=89。
- 正面坐姿：头+耳在上，胸/腹连续，前腿垂直，后臀椭圆；侧视只用于 walk/run，朝画面左。
- 所有帧最低不透明像素=**89**；头顶/耳朵最高 y≥1；四角恒透明。

## 3. 调色板（18 role）

| role | hex | 用途 |
|---|---|---|
| outline | `#0B1220` | 唯一 1px 外轮廓 |
| body | `#D9A251` | 金毛主毛 |
| shade | `#A96A26` | 阴影/内部缝/爪缘 |
| light | `#F2CF87` | 亮毛高光 |
| belly | `#F8ECD0` | 奶油胸/腿羽/腹 |
| ear | `#BD7C2E` | 垂耳深金 |
| ear_inner | `#96621F` | 耳内深棕 |
| eye | `#5B3A1C` | 暖棕眼 |
| eye_hi | `#F4F9FF` | 1px 眼高光 |
| nose | `#171310` | 鼻/嘴线（非 outline 色） |
| tongue | `#E08A86` | 舌头（少量） |
| collar | `#A63D35` | 哑光砖红项圈 |
| collar_hi | `#BD5A50` | 项圈高光 |
| collar_dark | `#7D2F2A` | 项圈暗边 |
| ball | `#D9713C` | 玩具球 |
| ball_hi | `#F3C08A` | 球高光 |
| fx | `#F4F9FF` | 星光/运动线/尘土（后绘，不描黑） |
| blush | `#E7A08F` | 仅 pat_head 腮红 |

> 禁止纯黑 `#000000` / 纯白 `#FFFFFF` 作为角色色；禁止使用 outline 色画内部线。

## 4. 剪影与识别点

- 垂耳（深金 `ear` + 深棕内耳）、奶油胸/腿羽、砖红哑光项圈（有 collar_hi/collar_dark 但整体低饱和）；
- 温暖金毛配色 + 短腿 + 较厚躯干；侧视走路时身体低、步幅短；
- FX（星光/运动线/尘土）在轮廓之后绘制，只画在仍透明的像素上，不覆盖身体、不产生洞、不描黑边；
- `chase_tail_03` 允许 ≤5% 轮廓容忍（既有 v7 已知项，新包应做到 0 缺口）。

## 5. 12 clip / 68 帧

| clip | 帧@fps | loop | 语义 |
|---|---:|---|---|
| idle | 6@6 | ✅ | 坐姿呼吸、耳/尾微摆 |
| idle_blink | 3@12 | ❌ | 半闭→闭→半闭 |
| walk | 8@10 | ✅ | 侧视朝左四足小跑，每帧恰 1 爪离地 |
| run | 6@14 | ✅ | 追球/兴奋冲刺，尘土 FX |
| pat_head | 4@8 | ❌ | 摸头开心（眯眼+腮红），头低耳压 |
| ball_throw | 5@10 | ❌ | 人形抛球给狗；狗版本为抬头看球→蓄力推球变体 |
| ball_chase | 6@12 | ❌ | 冲刺→扑球，末帧压低身体 |
| paw_face | 5@8 | ❌ | 前腿摸脸/挠耳 |
| scratch | 6@8 | ❌ | 后腿挠痒，带抖动 |
| stand_wag | 6@8 | ❌ | 站起摇尾（狗最招牌动作） |
| chase_tail | 6@10 | ❌ | 追自己尾巴（尾巴扫到身前 + 旋转线） |
| attack | 7@16（非均匀 holdMs=[83,83,63,42,42,63,63]） | ❌ | 蓄力→命中→收招；可选，不血腥 |

合计 **68 帧**。manifest 契约：`famling.pet-anim/0.1`，`character=dog`，`voice={mode:'none',canTts:false,bubble:'thought'}`，palette `dog-anim-placeholder@0.1`。

## 6. 对话语气（狗）

- **只有心理活动气泡（thought），永不 TTS、永不发真人语音**；`voiceId` 必须 `none`。
- 短、直白、友好，像一只开心的狗；不装可怜、不乞求关注、不制造内疚/依赖。
- 不拟人化恋爱/伴侣关系；不使用「主人」式依附话术；不诱导付费、不诱导连续签到。
- 不得冒充真实宠物/真人；不得为狗配音真人声线或付费声线。

## 7. 禁止事项（验收会直接判负）

- 给狗开 TTS / 实心 speech 气泡 / 真人语音克隆（产品红线，模型直接拒绝）；
- 幼犬化卖萌、心形瞳、泪光、性化姿势、舔屏等情感操纵表达；
- 血腥攻击、撕咬写实、真人手/牵引绳人物入画、现有版权角色或描摹；
- 违反 96px 契约：半透明、抗锯齿、地线不是 y=89、内部黑线、封闭透明洞、>20 色/帧；
- 文字/数字/水印/签名/UI 画进角色帧；
- 情感陪伴/虚拟伴侣/付费亲密度、医疗/法律/金融建议、未成年人亲密、违法用途（见 `docs/legal/USE-RESTRICTIONS-2026-11-19.md`）。

## 8. 第三方如何从本参考起步

1. 复制 `docs/content-packs/examples/dog.example.pack.json`，改 `id`/`name`/`roleThemes[].id`（不得以 `famling.` 开头）。
2. 从 `scripts/dog_golden5.py` 的骨架/调色板与 `docs/PET-DOG-ANIM-V7-2026-11-18.md` 的帧表产出 96×96 PNG（地线 y=89、1px 轮廓、硬 alpha）。
3. `roleThemes[]` 的 `characterId` 指向宿主 `dog`，`voiceId` 必须 `none`；`appearance` 引用宿主已有 theme/background/font（或随包 components 提供）。
4. 填 `usageDeclaration`（canonical 短句 + 6 个 prohibitedUses）、`license`、`aiProvenance`、`compatibility.library='famling.content/0.2'`、`files[].bytes/sha256`。
5. 用 `validateContentPackV2` + `validatePackZip` 自检（见 `docs/content-packs/README.md` §5）。
6. zip：`pack.json` 在根、素材在 `assets/`，对外分发前确认素材权利。

> 本文件是工程参考，不构成法律意见。

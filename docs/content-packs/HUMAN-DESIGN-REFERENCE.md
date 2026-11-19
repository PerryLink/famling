# HUMAN（人形 / 汀岚）角色主题设计参考

> 状态：**工程参考 v1 · 2026-11-19 · 占位美术已按此契约生成**。
> 适用：famling `rolePresets[0]`（id `human`）与第三方人形角色主题包。
> 同源实现：`docs/design/HUMAN-TINGLAN-2026-11-18.md`、`docs/art/CANON-SETTING-BOOK-2026-11-16.md`、`public/characters/pet-tinglan-anim/character.json`。
> 示例包：`docs/content-packs/examples/human.example.pack.json`（可复制的 `famling.content-pack/0.2` 清单）。

## 0. 一句话

人形=**安静、克制的成年工作搭子**：2.5–2.7 头身、96×96、12 clip / 68 帧、地线 y=89；实心对话气泡、允许 TTS（需单独同意）；**不做幼儿化、不卖萌、不性化、不做情感陪伴/虚拟伴侣**。

## 1. 画布 / 锚点 / 帧契约（硬约束）

| 项 | 值 |
|---|---|
| 画布 | `96 × 96` RGBA，1x；放大只用最近邻（`image-rendering: pixelated`） |
| 锚点 | `{ x: 48, y: 96, mode: 'foot-center' }` |
| footBox | `{ x: -36, y: -18, w: 72, h: 18 }`（96 时 0.75W / 0.1875H） |
| 地线（ground line） | **y = 89**；每帧最低不透明像素=89；y=90–95 恒透明 |
| 头顶/抬手 | 最高 y ≥ 1；四角恒透明 |
| 帧数 | **68 帧 / 12 clip**（与 dog 同构；人形语义按汀岚重绘） |
| 硬 alpha | 只有 0 或 255 透明；禁止半透明/抗锯齿 |
| 轮廓 | 唯一 1px 闭合外轮廓 `#0B1220`；内部结构线只许浅色，禁止内部黑线 |
| 色数 | 每帧 ≤ 20 色（实测 16–19，调色板共 19 个 role） |
| 洞 | 禁止封闭透明洞（腿间缝必须向下开口连通画布边缘） |

## 2. 比例与骨架（96 px）

- **头身比 2.5–2.7**：全高 y=13…89（77 px），头（含发）y=13…43（31 px），77/31 ≈ 2.48。不是 2.0 头的幼儿比例。
- 正面站立骨架（y 轴，96×96，地线 89）：
  - 发顶 13；眼镜中心 30（镜框 27–32）；下巴 41；颈 42–46；肩线 47–52（肩宽 26 px）；腰 57–62；外套下摆 62；裙 60–75（H 型铅笔裙）；腿（丝袜）76–84；鞋 85–89。
  - 腿 x=43..46 / 50..53（4 px 宽 + 中间透明缝向下开口）；鞋 7 px 宽杏仁头、低粗跟。
- 侧视（walk/run，朝画面左）：头含发 x≈35…61、鼻尖 x=34、下巴 y=41；胸 x=38、背 x=58、腰 40…56；裙侧 39…57；尾根 (57,68) 从裙后开衩伸出。
- 手：每手 3×3 皮色块 + 1px shade；96 px 下不表达五指，剪影不出现第二只手。

## 3. 调色板（19 role）

| role | hex | 用途 |
|---|---|---|
| outline | `#0B1220` | 唯一 1px 外轮廓（内部线不得使用） |
| hair | `#1B1B22` | 黑 bob / orca 尾上表面 |
| hair_hi | `#30303A` | 发丝高光 / 冷缘 |
| skin | `#F8D8C8` | 脸、颈、手 |
| skin_shade | `#E3B9A8` | 鼻/颈部阴影 |
| suit | `#1E1E26` | 西装（比 canon `#191920` 抬一档，避免与黑发并块） |
| suit_hi | `#34343E` | 袖/翻领/裙缝/冷缘 |
| shirt | `#F2F2F2` | 白衬衫 V/领口/袖口/纸页 |
| shirt_shade | `#D7DBE2` | 纸/书折痕 |
| tie | `#0F0F14` | 领带 / 书封 / 嘴线 |
| glasses | `#C9CED6` | 细银框眼镜 / FX 冷色 |
| eye | `#356FFE` | 蓝虹膜 |
| eye_hi | `#F4F9FF` | 1px 眼高光 / FX 亮芯 |
| accent | `#3964FE` | 蓝 bow / 领带夹 / 书签（≤3% 可见像素） |
| tights | `#8A6E6B` | 不透明暖灰黑丝 |
| tights_shade | `#6A5652` | 侧视远腿 |
| shoe | `#1A1A1E` | 黑色低跟 |
| tail_white | `#E8E0E0` | orca 尾白腹 |
| blush | `#E7A08F` | 仅 pat_head 2px 腮红 |
| fx | `#99C8FF` | 星光/运动线/纸页/冲击线（后绘，不描黑） |

> 纯黑 `#000000` / 纯白 `#FFFFFF` 禁止作为角色色（outline 用 `#0B1220`，白衬衫用 `#F2F2F2`）。

## 4. 剪影与身份锚点

保留（always-on）：黑色内扣 bob（偏分侧刘海）、细圆银框眼镜、白 point collar + 白袖口、深色单排扣西装 + 深细领带、蓝 bow + 蓝领夹、扁平两叶 orca 尾（黑上/白下、后腰裙后）、黑丝 + 黑低粗跟、黑色无字账本（DSH 蓝书脊条）+ 纸/书道具。

96 px 下可丢：珍珠耳坠、鲸鱼几何细节、领带纹理、纽扣、发丝层次、尾斑。**不得**为了细节牺牲 1px 闭合轮廓、硬 alpha 与地线。

道具语义：摊开小书（idle/idle_blink/chase_tail）、合上账本（run）、纸团（ball_throw/ball_chase）、纸扇（attack，轻拍不暴力）。

## 5. 12 clip / 68 帧

| clip | 帧@fps | loop | 语义 |
|---|---:|---|---|
| idle | 6@6 | ✅ | 站立托书，呼吸 ±1px、头/肩微摆、尾摆、眼常开 |
| idle_blink | 3@12 | ❌（叠层） | 半闭→闭→半闭（透过眼镜可读） |
| walk | 8@10 | ✅ | 侧视朝左轻步，前后脚交替，单臂反向摆，躯干 1px 起伏 |
| run | 6@14 | ✅ | 抱账本小跑，前倾 2px，头发后飘 1–2px，2 帧速度线 |
| pat_head | 4@8 | ❌ | 歪头眯眼、2px 腮红、微笑、肩上耸、尾快摆、3 帧星光 |
| ball_throw | 5@10 | ❌ | 右手举纸团→蓄力→向右前抛出→跟随→收手 |
| ball_chase | 6@12 | ❌ | 纸团滚入→低头→伸手→蹲身接住→举球（末帧微笑） |
| paw_face | 5@8 | ❌ | 抬手整理刘海蓝 bow + 点头；不是卖萌捂脸 |
| scratch | 6@8 | ❌ | 伸懒腰：双臂过顶、身体拉长 2px、peak 闭眼、2 条拉伸线 |
| stand_wag | 6@8 | ❌ | 站直 + 右手挥手、微笑、尾大幅摆（不叉腰） |
| chase_tail | 6@10 | ❌ | 回头翻书页/看身后，头 3/4 转，视线朝右后，尾摆 |
| attack | 7@16（非均匀 holdMs=[83,83,63,42,42,63,63]） | ❌ | 纸扇轻拍：蓄力→预备→挥击（3 条冲击线）→收招 |

合计 **68 帧**。manifest 契约：`famling.pet-anim/0.1`，`character=human`，`voice={mode:'tts',canTts:true,bubble:'speech'}`。

## 6. 对话语气（人形专属）

- 定位：**安静、简洁的桌面工作搭子/小生灵**；同事式，不谄媚、不撒娇、不制造依赖。
- 句子短（≤ 对话包 maxChars，默认 240；brief 80 / quiet 50），不连发、不用大量 emoji、不刷感叹号。
- 气泡语义：**实心 speech**。TTS 只允许官方合成音色（stella/tide），且切换/启用必须走既有 TTS 单独同意门。
- 不得否认 AI 身份；不得自称真人、官方、医生/律师/咨询师；不得用「我会一直陪着你/只有我懂你」等陪伴话术。
- 危机信号（自伤/自杀/他伤/重大财产损失）必须停止角色扮演，转介 110/120 与心理援助 12356，不做情感消费。

## 7. 禁止事项（验收会直接判负）

- 幼儿化、性化、恋爱/伴侣向姿势或表情（心形瞳、泪光、 blush 卖萌、低机位、抱胸）；
- 情感陪伴/虚拟伴侣/付费亲密度、依赖操控、断签焦虑等暗黑模式；
- 冒充真人/官方/合作方，使用其 Logo/字标/吉祥物，或真人声线克隆；
- 违反 96px 契约：半透明、抗锯齿、地线不是 y=89、内部黑线、封闭透明洞、>20 色/帧；
- 在角色帧里写文字/数字/水印/签名/UI；使用现有版权角色或描摹；
- 任何未成年人亲密、医疗/法律/金融建议、违法用途（完整红线见 `docs/legal/USE-RESTRICTIONS-2026-11-19.md`）。

## 8. 第三方如何从本参考起步

1. 复制 `docs/content-packs/examples/human.example.pack.json`，改 `id`（不得以 `famling.` 开头）、`name`、`roleThemes[].id`。
2. 按本文件的画布/锚点/地线/调色/轮廓规则产出 96×96 PNG，放到 zip 的 `assets/` 下（例如 `assets/preview/my-human.png`、`assets/sprites/idle/...`）。
3. `roleThemes[]` 里 `characterId` 必须指向宿主已有角色（`humanoid`），`voiceId` 用宿主已有音色（`stella`/`tide`）或自定义 `components.voices`；`appearance` 引用宿主已有 theme/background/font（或随包提供 components）。
4. 填 `usageDeclaration`（逐字 canonical 短句 + 6 个 prohibitedUses）、`license`、`aiProvenance`、`compatibility.library='famling.content/0.2'`、`files[].bytes/sha256`。
5. 用 `validateContentPackV2(pack)` + `validatePackZip(pack, inventory)` 自检（见 `docs/content-packs/README.md` §5）。
6. 打包 zip（pack.json 在根、素材在 assets/），对外分发前确认许可与素材权利。

> 本文件是工程参考，不构成法律意见；发布前按 `docs/legal/` 复核。

# 布偶猫（blue bicolor Ragdoll）像素动画包设计 · 2026-11-20（当前有效）

> 状态：**当前有效设计**（2026-11-20，task-149 资产实现 + task-153 跨仓接线完成）。
> 取代：`docs/design/CAT-RAGDOLL-2026-11-18.md`（首个布偶版本，68 帧旧契约）与 `docs/design/CAT-SELKIRK-2026-11-18.md`（塞尔凯克卷毛猫时期，历史版本）。
> 同源实现：`scripts/cat_selkirk.py`（渲染器文件名为历史遗留，内容已是布偶直长毛）+ `scripts/gen-cat-anim.py` + `public/characters/pet-cat/` + `public/assets/pet/anim/cat/`。
> 角色工程参考：`docs/content-packs/CAT-DESIGN-REFERENCE.md`；生成/验收契约：`docs/art/prompts/CAT-RAGDOLL-PROMPT-PACK-2026-11-20.md`；调色板锁定：`docs/art/prompts/PALETTE-LOCK-2026-11-20.md` §4.1。

## 0. 决策记录

1. 2026-11-18：cat 首版为布偶猫（Ragdoll，68 帧 / v7 契约）；随后按用户设定改为**塞尔凯克卷毛猫（Selkirk Rex，灰白卷毛）**，并迭代 v9 侧视加厚 / v10 连续灰帽 + 白 blaze / v11 短腿 + 加粗毛腿。
2. 2026-11-20：owner 批准**改回同配色布偶猫（blue bicolor Ragdoll）**，作为 task-149 的资产实现决定：
   - **16 个 palette hex 逐字节不变**，只改 palette id：`cat-selkirk-anim@0.1` → `cat-ragdoll-anim@0.1`；
   - 只换品种 / 毛型语义与几何：卷毛 → 丝滑直长毛、羽状尾、围脖、面罩语义；删除 `curl_puff` / `ringlet` 卷毛图元，实现 F1–F6 平滑剪影 + 羽化锚点；
   - **保留**：96×96、12 clip / **72 帧**、anchor 48/96、footBox `[-36,-18,72,18]`、地线 y=89、产品化短腿（v11 沿用）、v10 连帽 + blaze、灰耳灰尾、懒散高冷人格、thought 气泡 / 永不 TTS。
3. 2026-11-20 task-153：完成跨仓接线（行为/区域单源台词、hero/桌面壳标签、内容包文档、许可/AI 登记、插件 0.10.11 re-embed 与 UI 文案）。

## 1. 交付物与校验值（2026-11-20 实测）

| 交付物 | 说明 | SHA-256 / 体积 |
|---|---|---|
| `public/assets/pet/anim/cat/` | 72 PNG + `manifest.json` | 包内合计 **145,810 B**；manifest `b2dc39a4ffc381a4902fa86cd107235b183bd0743734a8511995c962c2d89f23`（9,088 B）；**72/72 唯一帧 SHA-256**（无 alias） |
| `scripts/gen-cat-anim.py` | 包壳 / 调色板 / 调度 / `--check` `/--verify` `/--sheet` | `72e048f167d3786950aefeacf96de0f1b76c70fa54334fb4689d268b783b2c2e` |
| `scripts/cat_selkirk.py` | 布偶直长毛渲染器（文件名历史遗留） | `8ac2b641115b454e857b45c14b9c2d306fe008624b012fcad9801c9a3ffe24a1` |
| `public/characters/pet-cat/character.json` | palette / license / note / meta | `1170bc8b37bdbf4bcf194987f940dd621f046377e43d688bcf3b866b00dda2cd`（2,109 B） |
| `public/characters/pet-cat/behavior.json` | 由 `src/pet/anim/interactions/cat.json` 生成 | `369989ed404c33cd0773ad83c3e9b1b110a6713ebf6e037984ff9609aaf1e8fe` |
| `public/characters/pet-cat/regions.json` | 同上；洗脸台词「长毛不好梳」 | `965e12d4488f496fa747802c8c048187566d889452b0b605b1fd729cdfeca913` |

## 2. 硬契约（不得改坏）

| 项 | 值 |
|---|---|
| 画布 | `96 × 96` RGBA，1x；最近邻放大 |
| 锚点 / 脚盒 | `{ x: 48, y: 96, mode: 'foot-center' }` / `{ x: -36, y: -18, w: 72, h: 18 }` |
| 地线 | **y = 89**；每帧最低不透明像素 = 89，y=90–95 恒透明 |
| 帧数 | **72 帧 / 12 clip**（`stand_wag` 10 帧 @6fps 非均匀 holdMs，3200ms） |
| alpha / 轮廓 | 硬 alpha 仅 0/255；唯一 1px 闭合外轮廓 `#0B1220`；无封闭透明洞、无半透明/抗锯齿 |
| 色数 | 全局 16 role；每帧 ≤16 色（动画门禁 ≤20）；禁止橙/棕/粉红毛 |
| manifest | `famling.pet-anim/0.1`，`id=pet.cat.anim.placeholder`，`palette=cat-ragdoll-anim@0.1`，`voice={mode:'none',canTts:false,bubble:'thought'}` |
| 显示 | `display.scale=2` + `pixelated`；插件按 72px 显示 |

## 3. 调色板（16 role，逐 hex 与旧 Selkirk 包相同）

| role | hex | 布偶用途 |
|---|---|---|
| outline | `#0B1220` | 唯一 1px 外轮廓 |
| body | `#F1EEE7` | 白/象牙身体主毛 |
| light | `#FDFCF7` | 白 blaze + 高光 + 毛流 |
| shade | `#D6D1C7` | 冷灰阴影 / 远腿 / 毛流 |
| belly | `#ECE3D5` | 胸围脖 / 下巴 / 爪 / 尾羽 |
| mask | `#8E9296` | 冷灰蓝重点：连帽 / 面罩 / 耳外侧 / 尾主毛 |
| mask_dark | `#6B7075` | 面罩内缘 / 口线 / 闭眼线 / 尾尖 |
| ear | `#6F7479` | 耳外侧重点 + 尾尖深色块 |
| ear_inner | `#C9C2B8` | 浅色内耳 |
| eye | `#5B93E0` | 布偶蓝眼（唯一冷色） |
| eye_hi | `#F4F9FF` | 1px 眼高光 / 星光 |
| pupil | `#1E2C44` | 瞳孔 |
| nose | `#C9B6AB` | 鼻头（muted mauve） |
| pad | `#C4B1A7` | 露爪肉垫 / 张嘴内衬 |
| ball | `#7F8C99` | 玩具球主体（仅 ball_throw / ball_chase） |
| ball_hi | `#D3DAE1` | 球高光 |

> 身体以白为主：重点色只在头部连帽/面罩、耳、羽状尾；白鼻梁从眼上贯穿到嘴吻/下巴。

## 4. 12 clip / 72 帧

| clip | 帧@fps | loop | 语义 |
|---|---:|---|---|
| idle | 6@6 | ✅ | 正面坐姿慢呼吸 + 尾摆 + 耳抖 + 慢眨眼 |
| idle_blink | 3@12 | ❌ | sleepy → closed → sleepy |
| walk | 8@10 | ✅ | 侧面慢四拍，每帧恰 1 爪离地 |
| run | 6@14 | ✅ | 短促小跑 / zoomies + 尘土 FX |
| pat_head | 4@8 | ❌ | 头低、耳压、眯眼、腮红 + 星光 |
| ball_throw | 5@10 | ❌ | 灰蓝球右上抛落，抬头→侧目→慢抬爪 |
| ball_chase | 6@12 | ❌ | 懒懒侧身拨球，最后半闭眼放弃 |
| paw_face | 5@8 | ❌ | 舔爪（露肉垫）→擦脸→盖眼→收爪 |
| scratch | 6@8 | ❌ | 后腿抬起挠右耳，同侧后爪不重复 |
| stand_wag | **10@6（非均匀 holdMs）** | ❌ | 猫式伸懒腰：前趴后翘弓背→打哈欠→收回（3200ms） |
| chase_tail | 6@10 | ❌ | 羽状尾绕到前爪旁、尾尖抽动，最后高冷别头 |
| attack | 7@16 | ❌ | 抬右爪横拍 + impact 条（spec-only，无 UI 入口） |

## 5. F1–F6 直长毛语法与实测指标

- **F1** 平滑主剪影（头/躯干/腿不再呈云朵状）；**F2** 只在 4 个毛区（胸围脖、腹线、后腿毛裤、羽状尾）与面部重点（耳尖/颊 1–2px）出现羽状锚点；**F3** 内部 ≤10 条 1px 断续毛流线（light/shade）表达 guard hairs；**F4** 连续冷灰蓝连帽 + v10 白 blaze（从眼上开始、不劈开帽中线）；**F5** 羽状长尾：粗根、锥形递减、3–4 个 2–3px 缺口、深色尾尖；**F6** 禁止云朵毛簇与 C 形卷纹。
- `gen-cat-anim.py --verify` 的 silky 指标门（2026-11-20 实测，见 prompt pack §10.3）：轮廓圆度 **2.01–2.53（avg 2.32）**、四向 profile bumps **4–10（avg 6.3）**、白色占比 **60.1%**、重点色占比 **20.0%**、有眼帧 **67/72**、唯一帧 **72/72**、包体 **145,810 B**。
- 校准基准：旧 Selkirk 卷毛在同一 rig 上圆度 2.08–2.77（avg 2.52）、bumps 13–40；布偶要求平均圆度 ≤2.35 且 bumps ≤12。

## 6. 跨仓接线（2026-11-20 task-153）

| 消费方 | 落地 |
|---|---|
| desktop 行为/区域 | `src/pet/anim/interactions/cat.json` 为单源：洗脸（`paw_face`）台词「卷毛不好梳。」→「**长毛不好梳。**」，`node scripts/gen-character-interactions.mjs --only cat` 重生成 `behavior.json` / `regions.json`；`--check` 通过 |
| desktop hero / 桌面壳 | `src/pet/hero-runtime.ts` 猫标签 →「布偶猫（动画占位）」、狗标签「金毛（动画占位 v11）」（v7→v11）；`src/pet/desktop-shell.ts` 兼容渲染器菜单行 →「渲染器：布偶猫（动画）」与注释同步；`tests/hero-multichar-integration.test.ts` 期望值同步 |
| 内容包文档 | `docs/content-packs/ANIM-PACK-0.2.md` 与 `docs/content-packs/examples/cat.anim.example.pack.json` 的 palette → `cat-ragdoll-anim@0.1`，示例包名 → 布偶猫；示例 72 帧清单不变 |
| 许可 / AI 来源 | `ASSET-LICENSES.md` 新增 cat 逐包登记（72/72 唯一帧、manifest SHA、包体 145,810 B、跨仓消费）；`AI-PROVENANCE.md` §11.3 新增 cat 条目（确定性 Python 管线，`ai.status=none`，无模型/API/seed） |
| 插件 dsh-famling 0.10.11 | `embed:anims` 重嵌入 cat 帧（72 帧；208 帧总数不变；cat chunk 97.2 KiB，`source-sha256 79217112f3b68151…`）；`gen:content` 同步 behavior/regions/manifest + 法务锚（`source-sha256 397c55386a0d0211…`）；UI 文案 塞尔凯克卷毛猫→布偶猫 / Selkirk Rex→Ragdoll（入口、内容中心、聊天人格、locale、README、DETAIL）；版本真值统一 0.10.11（package/client/client.content/README/LEGAL-NOTICE/locale + package-lock） |

## 7. 验收 / 复验命令

```bash
# 资产与生成器
python3 scripts/gen-cat-anim.py --check                       # 72 帧字节级复验（exit 0）
python3 scripts/gen-cat-anim.py --verify                      # silky 指标门
node --import tsx --test tests/pet-anim-cat.test.ts            # 契约/调色板/silky/轮廓/同侧肢体/确定性

# 行为/区域单源
node scripts/gen-character-interactions.mjs --check
node --import tsx --test tests/character-interactions-single-source.test.ts

# 桌面全量门禁
npm test && npm run typecheck && npm run build
node scripts/legal-check.mjs --sync && node scripts/legal-check.mjs

# 插件侧（sibling checkout）
cd ../plugins/dsh-famling && npm run release:check           # test/check/verify/verify:package/lint/typecheck
```

### 7.1 实测证据（2026-11-20，task-149 + task-153）

| 门禁 | 结果 |
|---|---|
| `python3 scripts/gen-cat-anim.py --check` | `check ok: cat animation pack matches the generator`（exit 0） |
| `python3 scripts/gen-cat-anim.py --verify` | `FAILS: none (all cat pack checks PASS)`；圆度 avg 2.32 / bumps avg 6.3 / 白色 60.1% / 重点 20.0%（silky 门均通过） |
| `node scripts/gen-character-interactions.mjs --check` | `check ok (3 characters, 10 event-clips)` |
| `node --import tsx --test tests/pet-anim-cat.test.ts tests/character-interactions-single-source.test.ts tests/hero-multichar-integration.test.ts` | 40 pass / 0 fail |
| desktop `npm run ci`（14 steps：version/typecheck/build/test/coverage/validate-content/verify-pack/art-specs/fci/legal/docs/evidence） | **green 14 passed / 0 fail（97.9s）**；`npm test` 1963 tests / 1963 pass / 0 fail / 0 skipped；build、coverage、`docs:check`（27 checks）与 `legal:check` 均通过（DRAFT 警告为 release 预期） |
| desktop `node scripts/legal-check.mjs --sync` | 37 docs 同步进 `public/legal/`；WARN-ONLY 16 条 DRAFT（不阻塞）；`public/legal/{AI-PROVENANCE.md,PACKAGE-MANIFEST.json}` 随合法源更新 |
| plugin `npm run release:check`（test / check / verify / verify:package / lint / typecheck） | **green**；`npm test` 261/261 pass；`check ok`；`verify-anims OK`（208 帧，cat 72）；`check-package: pack ok (23 files, tarball 309.0 KiB, unpacked 718.0 KiB)`；`checkJs ok` |
| plugin 体积（0.10.11 实测） | 入口 `client.js` 95.0 KiB / 97,278 B（gzip 27.1 KiB）；chunks human 61.7 / cat 97.2 / dog 77.6 KiB；首帧 156.7 KiB；全量 331.5 KiB；内容 chunk 72.2 KiB（gzip 20.5 KiB） |
| plugin 单源哈希 | `embed-anims source-sha256 79217112f3b68151…`；`gen-content source-sha256 397c55386a0d0211…` |

> 说明：`docs/art/prompts/CAT-RAGDOLL-PROMPT-PACK-2026-11-20.md` 中 task-149 的「regions 哈希未改 / 插件待后续任务」记录是当时的授权边界记录；本次 task-153 已按计划把该哈希与插件 re-embed 一并收尾（`docs/art` 不在 task-153 写范围，未回改历史记录）。

## 8. 回滚与历史

- 回滚单位是**整包**：`public/assets/pet/anim/cat/` + `public/characters/pet-cat/` + 两份文档 + 插件 chunk/文案/版本，必须同一变更集回退；不要只回退一帧或只改 palette。
- `docs/design/CAT-RAGDOLL-2026-11-18.md`（首版布偶，68 帧）与 `docs/design/CAT-SELKIRK-2026-11-18.md`（卷毛时期）保留为历史；本文件是当前有效设计。
- 插件若回退到 0.10.10，需同时回退 `client.anims.cat.js`、`client.js` 生成块、`scripts/spec/anim-spec.json` 与 `client.content.js` 文案（`npm run embed:anims` + `npm run gen:content` 可重建）。

## 9. 边界（诚实文案）

- **placeholder-only**：确定性程序化占位帧，不是 final 美术；商用未授权，分发按 `LICENSE-ART`；不得当成品宣传。
- **非 AI 生成**：Python 3.12 + Pillow + numpy 本地确定性绘制，无图像模型、无 API key、无网络、无 seed ⇒ `ai.status=none`。
- **产品红线**：只有心理活动气泡（thought），永不进 TTS / 真人语音；不做情感陪伴、虚拟伴侣、付费亲密度；不冒充真实宠物或真人。

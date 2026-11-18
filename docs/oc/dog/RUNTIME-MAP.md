# 狗 OC（金毛寻回犬，金黄毛）· 运行时映射（7 tags / 8 states / 台词槽）

> Status: **运行时映射文档（2026-11-17）**。只写文档：未改 JSON/代码/资产、未生成图/音频、未做 git。
> 数据源（A）：`public/characters/pet-dog/{character.json,behavior.json}`、`public/assets/pet/dog-placeholder/manifest.json`、`tests/default-packs.test.ts`；类型/校验见 `src/pet/character/**`。
> 新 OC 的品种/毛色/垂耳/大尾/无眼斑是**待拍板方向**（A=任务口径）；现有包仍是旧占位（金棕垂耳狗/眼斑），本目录不改。

## 0. 契约与现状

| 项 | 值 |
|---|---|
| 类型 | `type: "pet"`，`species: "dog"`，traits `quadruped/canine/tail` |
| 画布 | **96×96**；anchor `(48,96)` foot-center；footBox `(−36,−18,72,18)`；bbox `[12,8,72,84]`；display.scale=2、pixelated |
| 帧契约 | **7 tags / 36 帧**：idle 8@8 loop、pat 6@10、drag 4@8 loop、land 4@12、talk 4@12 loop、remind 6@10、sleep 4@2 loop |
| 渲染格式 | `pixel-hero`（0.1 包按默认推断） |
| 当前美术 | `dog-placeholder`（程序化占位，36 帧，非 final；旧设计=金棕垂耳狗/眼斑/蓝项圈） |
| 当前行为 | 8 states / 7 tags / slots 9；`abilities.speech: "sfx"`；needs hunger/energy/fun 开启 |
| 语音 | 无 TTS、无 audio[]；6 条内联文本（`behavior.speech.lines`） |
| 交互 | 无 zones；宿主按 actor bbox 命中，所有点击≈`pat` |
| 本目录产物 | 只有文档；**无图、无音、无新 JSON** |

## 1. 7 个动画 tag（A 契约 + B 狗 OC 语义）

| tag | 帧@fps / loop | 行为 state | 狗 OC 语义（B） | 动作要点 |
|---|---|---|---|---|
| `idle` | 8@8 loop | idle | 安静待机：呼吸、慢眨、耳朵、慢摇大尾 | 呼吸 ±1 px；2–3 帧慢眨；尾慢摆 1–2 px；首尾闭合 |
| `pat` | 6@10 one-shot | rub / play | 被摸：靠近、半闭眼、尾巴拍地 | 头贴手 1 px → 闭眼 → 回弹；不画人手 |
| `drag` | 4@8 loop | drag | 被抱起：四肢垂、尾垂、略紧张 | 悬空、尾巴摆、耳微抬；不挣扎 |
| `land` | 4@12 one-shot | land | 四脚落地：小压扁 + 尾配平 | 压 ≤2 px；不画灰尘特效 |
| `talk` | 4@12 loop | bark | 短低汪：1 声，不连续吠 | 嘴 2 px 开合；身体稳定 |
| `remind` | 6@10 one-shot | nudge | 鼻顶/轻推提醒 | 前倾 1 px → 触碰 → 抬头；不乞求 |
| `sleep` | 4@2 loop | sleep | 趴睡/头搭前爪：慢呼吸 | 闭眼 1 px 线；无 Zzz 文字 |

> `play` state 复用 `pat` tag（现有 behavior 如此）；若未来要独立「叼纸团」动作，需要新增 tag（FCI 数据变更，不在本轮）。

## 2. 8 个 behavior state → tag 映射（A 现状）

| # | state | tag | 优先级 | after/冷却 | 触发规则 | 狗 OC 语义（B） |
|---|---|---|---|---|---|---|
| 1 | `idle` | idle | 0 | loop | 默认 | 坐/趴/地板待机 |
| 2 | `rub` | pat | 50 | after idle；规则 cooldown 1200 | `pat` 事件 | 被摸：靠近、摇尾 |
| 3 | `drag` | drag | 100 | loop | drag.start | 被抱起 |
| 4 | `land` | land | 90 | after idle | drag.end / land | 落地站稳 |
| 5 | `bark` | talk | 40 | after idle | talk | 短低汪回应 |
| 6 | `nudge` | remind | 80 | after idle；cooldown 60000 | remind（requiresBrief=false） | 鼻顶提醒 |
| 7 | `play` | pat | 55 | after idle | feed / play | 叼纸团/扑玩（复用 pat 帧） |
| 8 | `sleep` | sleep | 10 | loop | sleep | 趴睡 |

**slots（A）**：`idle→idle`、`pat→rub`、`drag→drag`、`land→land`、`talk→bark`、`remind→nudge`、`sleep→sleep`、`feed→play`、`play→play`。
**ambient（A）**：间隔 4000–10000 ms；choices idle w4 / play w2 / sleep w1。
**needs（A，冲突）**：hunger 50/100 衰减 5/h、energy 65/100 衰减 4/h、fun 55/100 衰减 6/h、criticalAt 15；`care.feed/play/sleep: true`。→ 与「不做喂食/饲养/好感/内疚」原则冲突，见 §5。

## 3. 台词 / 声音槽（A 现状 + B 语义）

`abilities.speech: "sfx"`（非 TTS）；`behavior.speech.lines` 内联 6 条：

| line id | 文本 | 语义（B） | 建议事件 |
|---|---|---|---|
| `bark.1` | 汪！ | 短打招呼/回应 | talk / bark |
| `bark.2` | （尾巴摇成了螺旋桨） | 开心到摇尾 | talk 变体 / pat |
| `rub.1` | （把脑袋塞进你手心） | 亲近请求/被摸 | pat / rub |
| `nudge.1` | （用鼻尖拱了拱你的手） | 提醒/请求关注 | remind / nudge |
| `play.1` | （叼来一个纸团） | 邀请轻玩 | play / feed |
| `sleep.1` | （趴在你脚边睡着了） | 趴睡陪伴 | sleep |

- **不使用的表达**：真人声线、成句人话、恋爱化台词、「主人/宝宝」称呼、连续吠叫、护食/攻击性。
- 若未来加音效：建议**合成**短音效（低汪/鼻音/尾拍/落地），不采样真实动物；命名 `sfx/dog_*`，走 `audio[]`/`sfx`（FCI 0.3 声明；当前未实现）。
- 若未来加 TTS：只能是非真人克隆的合成声，且标注 AI 合成；仍不「说人话成句」。

## 4. 需要改的 JSON 字段（建议；本目录未改）

| # | 文件/字段 | 问题 | 建议 | 级别 |
|---|---|---|---|---|
| 1 | `character.json` `meta` / `traits` | 旧注释写「dog pet」，旧视觉=金棕眼斑；无品种/颜色声明 | 在 `meta.note` 写清「金毛寻回犬/金黄/无眼斑」；品种可放 `traits`（如 `golden-retriever`）或 meta，不新增未审核字段 | P1 |
| 2 | `palette` | `dog-placeholder@0.1` 旧占位色板 | 新 OC 色板注册后再换；未注册前保持 placeholder | P1 |
| 3 | `packBase` | 指向旧占位包 | 新美术包批准后替换；几何必须仍 96/anchor/footBox/bbox 一致 | P1 |
| 4 | `license` / `ai` | 占位声明 | 新图若是 AI concept，`ai.status` 必须如实标 concept + disclosure；许可待法务 | P1 |
| 5 | `behavior.abilities.care` / `needs` | 喂食/饥饿/衰减 = 饲养养成与内疚风险 | 建议 `care.feed:false` + 移除 hunger 衰减或改为无惩罚「休息提醒」；需产品拍板 | P0（产品原则） |
| 6 | `behavior` 无 zones | 当前宿主 bbox 命中，所有点击都≈pat；头/背/爪/地面无法区分 | 若升级 FCI 0.3：加 `zones`（head/back/paw/floor）+ `responses`（短文本/音效）；不改 0.2 契约 | P2 |
| 7 | `behavior` `play`/`feed` 复用 pat | 玩与摸头无视觉区分 | 接受复用（省美术）或未来加 `play` tag（数据+美术变更） | P2 |
| 8 | 命名 | 无名字、无 id 变更 | 由用户拍板：替换 `famling.pet-dog` 还是新增 id；改 id 需同步 registry/测试 | P1 |
| 9 | 画布 | 96 下大尾/长毛可读性有限 | 先 96 验收；若升级 128 需另绘 + 改 canvas/anchor/bbox + 测试 | P2 |
| 10 | `render.format` | 0.1 包未显式写 `render.format` | 若升级 0.2/0.3，补 `render: { format: "pixel-hero" }` | P2 |

## 5. 与现有约束的冲突（摘要）

1. **美术方向**：旧占位=金棕垂耳狗/眼斑/蓝项圈；新 OC=金黄金毛/无眼斑/默认无项圈。需拍板；本目录不 replace 旧文件。
2. **饲养机制**：`needs.hunger` + `care.feed` 与「不做喂食投喂/饲养养成/不制造内疚」冲突；若保留，必须去掉惩罚/死亡/好感语义，且不影响用户休息。
3. **测试约束**：`tests/default-packs.test.ts` 锁定 96/36/7、hard alpha、四角透明、≤40 色、1 px 闭合轮廓、猫狗差异 >10%、目录 37 文件；新美术必须继续满足，否则改测试需 owner。
4. **无独立提醒/健康逻辑**：狗的 `nudge` 是宠物提醒，但「健康使用提醒（2h）」属安全层，不应由狗索求式实现。
5. **AI/非官方**：新 OC 图/音若产生必须披露；不得把占位图当 final。

## 6. 自检

- 7 tags/36 帧/96/anchor/footBox/bbox 与 manifest/character.json 逐项一致。
- 8 states→7 tags 映射与 behavior.json slots/rules 一致；`play` 复用 `pat` 已标注。
- 6 条内联台词逐条解释；无 TTS/真人声线。
- 需要改的 JSON 字段只列建议，未执行；冲突已登记到 `../OC-COMPLETION-2026-11-17.md`。

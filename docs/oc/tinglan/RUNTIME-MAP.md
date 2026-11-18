# 汀岚 Tinglan · 运行时映射（17 态 / 13 待机 / 5 区 / 36 台词 → 7 tags 与 JSON）

> Status: **运行时语义映射文档（2026-11-17）**。只写文档：未改任何 JSON/代码/资产、未生成图/音频、未做 git。
> 数据源（A）：`public/characters/tinglan/{character.json,behavior.json,voice-lines.json}`；`src/pet/character/runtime03.ts`、`src/pet/character/behavior.ts`、`src/pet/hero-runtime.ts`、`src/pet/character/types.ts`。
> 视觉/帧（A）：`docs/art/CANON-SETTING-BOOK-2026-11-16.md` §1.8/§5.2、`docs/art/ART-TINGLAN-RUNTIME-2026-11-16.md` §2.3。
> 「需要改的 JSON 字段」是**建议清单**，owner 是代码/数据/美术线；本目录没有改任何包。

## 0. 三套载体（先分清，避免把行为包当图包）

| # | 载体 | 现状 | 状态数 | 美术 | 用途 |
|---|---|---|---|---|---|
| A | `public/characters/tinglan/` | FCI **0.3** behaviour-only；无 `packBase`、无 `fallback`、无 tags | **17** | 无 | OC 行为/语音/交互语义参考；`CharacterRuntime03` 预览（`pet.html?hero=1&character=tinglan`） |
| B | `public/characters/tinglan-256/` | FCI 0.1 + `packBase=/assets/pet/tinglan-256/`；20 tags/49 帧 placeholder | **7**（idle/pat/drag/land/talk/remind/sleep） | concept/placeholder，非 final | 唯一已接线可渲染的汀岚 hero（opt-in） |
| C | CANON 美术契约 | 128 主 / 96 兼容；7 tags/36 帧核心；全量计划 25 tags/118–122 帧 | 17 态 + 8 idle-only tag | 未生成/未 final | 未来运行时美术目标 |

**关键差异**：A 是「行为完整、没有图」；B 是「有图、只有 7 态」；C 是「17 态的图还没有」。以下映射以 A 的行为语义为准，给出「只有 7 tags 时如何 fallback」与「25 tags 全量时落在哪个 tag」。

## 1. 17 个高层状态（A）

| # | state | tag（全量美术） | category | 优先级 | interrupt | after/超时/冷却 | 触发事件 | OC 语义（B） | 仅 7 tags 时 fallback | 美术批次 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `idle` | idle | idle | 0 | — | loop | scene.enter / 各态回落 | 呼吸、眨眼、尾摆、发呆；默认姿态 | idle | Wave1 |
| 2 | `focus` | focus | expression | 25 | at-end | after idle；timeout 600000 | brief.working | 进入工作专注：少动作、不搭话、低头处理；10 分钟无事件回落 | talk → idle | Wave2 |
| 3 | `read` | read | micro-idle | 15 | at-end | after idle；timeout 30000 | brief.waiting / 待机读 | 看平板/账本、对时；等待态；30s 后回落 | talk → idle | Wave2 |
| 4 | `talk` | talk | expression | 60 | at-end | loop；由语音结束驱动 | talk / 语音开始 | 说话口型；与语音同生命周期；`endSpeech()` 回 idle | talk（自身） | Wave1 |
| 5 | `remind` | remind | reaction | 80 | immediate | after idle；cooldown 60000 | reminder.due（requiresBrief） | 提醒：抬头、前倾、直视、点头；P0/P1 一次一句 | remind（自身） | Wave1 |
| 6 | `pat` | pat | reaction | 50 | at-end | after idle；cooldown 3000 | pat.head / pat.body / pat.glasses | 被摸头：轻点头 ≤6°，克制闭口笑；不卖萌 | pat（自身） | Wave1 |
| 7 | `pat_hand` | pat_hand | reaction | 55 | at-end | after idle；cooldown 6000 | pat.hand | 摸手/护平板：手收回、侧身护住平板 | pat → idle | Wave2 |
| 8 | `pat_tail` | pat_tail | reaction | 55 | at-end | after idle；cooldown 8000 | pat.tail | 摸尾：尾甩开 + 回头半秒；不悦但克制 | pat → idle | Wave2 |
| 9 | `drag` | drag | interaction | 100 | immediate | loop | drag.start | 被拖起：悬空、脚离地、尾摆、护平板（美术层不画手/平板） | drag（自身） | Wave1 |
| 10 | `land` | land | reaction | 90 | immediate | after idle；cooldown 1000 | drag.end / land | 落地：触地压扁→回弹→站稳 | land（自身） | Wave1 |
| 11 | `startle` | startle | reaction | 95 | immediate | after drag；cooldown 10000 | drag.fast（宿主判定快速甩动） | 被突然抓起：睁眼、身体绷紧，播完接回 drag | drag → land | Wave2 |
| 12 | `sleep` | sleep | sleep | 10 | never | loop | sleep / 夜间 23–6 | 睡眠：闭眼、2s 慢呼吸；轻事件不回应 | sleep（自身） | Wave1 |
| 13 | `wake` | wake | reaction | 40 | immediate | after idle；cooldown 5000 | scene.enter / wake / wake.from_sleep | 被叫醒/晨间：睁眼起身；克制、无起床气 | idle | Wave2 |
| 14 | `stretch` | stretch | reaction | 5 | at-end | after idle；cooldown 30000 | break.remind / ambient | 伸懒腰（也作久坐休息动作） | idle | Wave3 |
| 15 | `refuse` | refuse | reaction | 70 | immediate | after idle；cooldown 20000 | x-famling.pat.spam | 不悦/拒绝：扶眼镜+短句，**不扣任何数值** | remind → idle | Wave3 |
| 16 | `look_out` | look_out | reaction | 5 | at-end | after idle；cooldown 15000 | hover.dwell / ambient | 看窗外/走神：头微转、视线离开 | idle | Wave3 |
| 17 | `tablet_show` | tablet_show | reaction | 55 | at-end | after idle；cooldown 6000 | pat.tablet | 举平板展示日程（当前台词 tablet_a）；平板是道具 | pat → idle | Wave4 |

**17 = 16 + 1 的来历（A）**：设计稿的 16 态（idle/focus/read/talk/remind/pat/pat_hand/pat_tail/drag/land/startle/sleep/wake/stretch/refuse/look_out）之外，当前包新增 `tablet_show`（摸平板→举平板展示日程，台词 tablet_a），故为 **17 态**；旧文档的「16 态」是旧计数。

**状态机要点（A）**

- 打断顺序：drag 100 > startle 95 > land 90 > remind 80 > refuse 70 > talk 60 > pat_* 55 > pat 50 > wake 40 > focus 25 > read 15 > sleep 10 > micro 5 > idle 0。
- `sleep` 只被 wake/drag/pat 唤醒；talk/remind/refuse 不吵醒（`runtime03.ts` 已实现）。
- `drag` 中只有 land/startle 可接管；pat 类事件在 drag 中一律 L3（`canInterrupt`）。
- one-shot 状态无 `timeoutMs` 时，`tick()` 用默认 **600 ms** 回落；`land` 美术 4f@12fps=333 ms、`startle` 4f、`wake` 4f 会多停约 100–267 ms → 建议给对应 state 补 `timeoutMs`（数据改动，见 §8）。
- `talk` 是 loop 且无 timeout：必须由宿主在语音结束时调用 `endSpeech()`；否则不会自动回 idle。
- `focus`/`read` 是 loop + timeout：`tick()` 到点按 `after` 回落；宿主不 tick 就不会回落。

## 2. 13 条待机微动作（idle variants，A）

运行时：`CharacterRuntime03.pickIdle()`；候选按 `when` 过滤，最近 2 个 tag 不重复，按 `weight` 加权；**全局间隔默认 [12,30] s**（`options.idleIntervalMs`，不是 variant 里的 `intervalMs`）；`priority`/`interruptible` 目前只作声明、不被调度器读取。

| # | 条目 tag | 权重 | 声明区间 (ms) | 声明优先级 | 条件 | OC 语义（B） | 仅 7 tags fallback | 美术批次 |
|---|---|---|---|---|---|---|---|---|
| 1 | `glasses` | 14 | 60000–180000 | 5 | idle | 推眼镜/扶正；手到脸、镜片不变形 | idle | Wave3 |
| 2 | `read` | 18 | 60000–120000 | 5 | idle | 看平板/对时（通用） | talk → idle | Wave2 |
| 3 | `write` | 10 | 120000–240000 | 4 | idle | 低头写字/笔尖 2 帧（白天） | idle | Wave3 |
| 4 | `look_out` | 8 | 120000–240000 | 3 | idle | 看窗外/走神（白天） | idle | Wave3 |
| 5 | `stretch` | 6 | 180000–300000 | 2 | idle | 伸懒腰（久坐/低活动） | idle | Wave3 |
| 6 | `yawn` | 4 | 180000–300000 | 2 | idle + `timeOfDay ∈ {night, late_night}` | 打哈欠、手挡嘴；夜间权重更高 | idle | Wave3 |
| 7 | `tail_flick` | 7 | 120000–240000 | 3 | idle | 明显甩尾（4f）；被拖/被摸尾后的余韵 | idle | Wave3 |
| 8 | `read`（晨间） | 6 | 300000–600000 | 4 | idle + morning | 早晨看平板/对时；与 #2 同 tag、不同时段 | talk → idle | Wave2 |
| 9 | `write`（午后） | 5 | 300000–600000 | 4 | idle + afternoon | 午后写字；与 #3 同 tag、不同时段 | idle | Wave3 |
| 10 | `daze` | 12 | 90000–180000 | 1 | idle | 发呆：半眼、头倾 1–2°；"人还在，但暂时离线" | idle | Wave4 |
| 11 | `tie_adjust` | 4 | 180000–360000 | 3 | idle | 整理领带夹（手到领口）；确认身份锚点还在 | idle | Wave4 |
| 12 | `tap_tablet` | 5 | 180000–360000 | 3 | idle | 轻敲平板/点两下；思考或确认日程 | idle | Wave4 |
| 13 | `idle_away` | 3 | 180000–360000 | 2 | idle | 长待机"目送"：转头 1°+肩线；不等待、不追问用户去哪了 | idle | Wave4 |

**计数口径**：13 条 variants = 11 个动作语义（read/write 各按时段拆 2 条）；对应全量美术的 8 个 idle-only tag（glasses/write/yawn/tail_flick/daze/tie_adjust/tap_tablet/idle_away）+ 3 个已有 state tag（read/look_out/stretch）。

**注意（A，当前实现缺口）**：`idle.variants[].intervalMs`、`priority`、`interruptible` 在 `runtime03` 中**未被消费**；微动作实际间隔是全局 12–30 s。若要保持「每动作 60–360 s 才出现一次」的设计，需要宿主按 variant 记冷却（代码改动）。

## 3. 5 个交互区（zones，A）

`runtime03.hitZone()` 按**面积最小**优先，所以眼镜细热区优先于头；`zones[].state` 目前不被 `zoneEventAt()` 使用（只返回事件名），页面若使用需自行读取。

| # | zone id | role | space | 几何（normalized） | 事件 `on` | 声明 state | cursor | label | OC 语义（B） | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `head` | head | normalized | x .25 y .05 w .50 h .30 | `pat.head` | pat | pointer | 轻点头 | 摸头=轻点头 ≤6°，克制 | 与眼镜区重叠时眼镜优先 |
| 2 | `glasses` | glasses | normalized | x .40 y .16 w .20 h .08 | `pat.glasses` | pat | pointer | 扶眼镜 | 推眼镜/偏头躲；设计上 25% 可转 refuse（当前数据缺） | 面积最小，优先命中 |
| 3 | `hand_tablet` | tablet | normalized | x .24 y .38 w .32 h .22 | `pat.tablet` | pat_hand | pointer | 护住平板 | 摸手/碰平板=护住平板、侧身 | 与 `pat.hand` 重复语义，需合并（见 §8） |
| 4 | `tail` | tail | normalized | x .74 y .52 w .20 h .18 | `pat.tail` | pat_tail | pointer | 尾巴 | 摸尾=尾甩开+回头；克制不悦 | 只覆盖尾部可见区域 |
| 5 | `floor` | other | normalized | x .30 y .85 w .40 h .15 | `drag.start` | — | grab | 拖拽 | 只作拖拽热区，**不响应点按**，避免误触 | 脚/地面不做 pat |

**不做**：body/胸/腿/裙热区；脚只拖拽；滚轮/键盘/长按不绑定；右键不做宠物反应（宿主菜单）。

## 4. 回应与语音槽（A）

### 4.1 `responses[]`（10 条，当前）

| 事件 | voiceLineId | durationMs | priority | 条件 | 语义 |
|---|---|---|---|---|---|
| `pat.head` | pat_a | 2000 | 50 | — | 摸头默认反应 |
| `pat.hand` | hand_a | 2000 | 55 | — | 摸手（当前无 zone 派发，见 §8） |
| `pat.tail` | tail_a | 2000 | 55 | — | 摸尾 |
| `drag.end` | land_a | 2500 | 70 | — | 落地 |
| `reminder.due` | remind_a | 3200 | 80 | requiresAny: brief | 提醒（无 brief 不播？见下） |
| `break.remind` | break_a | 3200 | 40 | — | 休息提醒 |
| `x-famling.pat.spam` | refuse_a | 2000 | 70 | — | 连击拒绝 |
| `scene.enter` | greet_a | 3200 | 40 | — | 启动问候 |
| `hover.dwell` | —（emote look_out） | 1500 | 5 | — | 悬停看一眼（无语音） |
| `pat.tablet` | tablet_a | 3200 | 55 | — | 展示平板日程 |

### 4.2 语音配置（A）

- `voice.profile: "voice.tinglan.calm"`；`language: "zh-CN"`；`tts: false`；`provider: "none"`；`lines: "voice-lines.json"`。
- `timbre`: `presetId: "stella-calm"`、`pitch 0.98`、`rate 0.95`、`volume 0.8`、`style "calm"`。
- `voice.lineIds` 只映射 6 个事件：`scene.enter→greet_a`、`pat.head→pat_a`、`pat.hand→hand_a`、`pat.tail→tail_a`、`drag.end→land_a`、`reminder.due→remind_a`。
- **无 `audio[]`、无 `sfx`、无 baked voice**：音频层未实现；不得把「有台词 JSON」误当「有语音」。

### 4.3 语音闸门（`runtime03.gateSpeech`，A）

| 层 | 含义 | 规则 |
|---|---|---|
| L0 | 动作-only | 永不发声（默认 pat/drag/land/hover 等） |
| L1 | 短反应 | 状态 `drag/sleep/focus/talk` 下不允许；gap 6 s；60 s ≤2、1 h ≤20、日 ≤120；同句 10 min 去重 |
| L2 | 长台词 | 同上但 gap 20 s；`muted` 仍返回字幕文本 |
| L3 | 沉默 | 永不发声（spam 后/冷却/设计沉默） |

- `muted=true`：无音频、**字幕照样出**（静音不等于静字）。
- `talk` 状态由语音驱动：宿主开始语音 → 进入 talk tag；语音结束 → `endSpeech()` 回 idle。
- 同事件连续 3 次概率逐次减半、第 4 次起 0（设计稿；runtime 侧需宿主实现）。

## 5. 36 条台词 → 槽位语义（A 文本 + B 归属）

统计：**36 条；已引用 9 条**（`greet_a/pat_a/hand_a/tail_a/land_a/remind_a/break_a/refuse_a/tablet_a`）；**闲置 27 条**。`runtime03` 每个事件只取一个 `response.voiceLineId`（无随机轮换）；要使用同组变体需宿主轮换或拆多条规则/条件（见 §8）。

| # | line id | 文本 | OC 语义（B） | 建议事件/槽位 | 建议层级 | 当前引用 |
|---|---|---|---|---|---|---|
| 1 | `greet_a` | 早。今天先做哪件？ | 启动/晨间问候：先给选择，不寒暄 | scene.enter / wake | L2 | ✅ |
| 2 | `greet_b` | 回来了。进度我记着。 | 回归（≥30 min）：承接进度；注意等待语义（待复核） | 回归事件 | L2 | — |
| 3 | `greet_c` | 先做哪个？ | 极简问候变体 | scene.enter（变体） | L1/L2 | — |
| 4 | `pat_a` | 嗯。 | 摸头：极简、不卖萌 | pat.head | L1 | ✅ |
| 5 | `pat_b` | 一下就好。 | 摸头：允许一下，不恋战 | pat.head | L1 | — |
| 6 | `pat_c` | 头别碰。文件在。 | 忙时拒绝摸头：先边界后任务 | pat.head（忙/低概率） | L1 | — |
| 7 | `pat_d` | 在听。 | 摸头/谈话前：确认在听 | pat.head / talk | L1 | — |
| 8 | `hand_a` | 手。 | 摸手：短制止 | pat.hand | L1 | ✅ |
| 9 | `hand_b` | 别碰平板。 | 平板：护住道具 | pat.hand / pat.tablet | L1 | — |
| 10 | `hand_c` | 等下。 | 摸手：延迟处理 | pat.hand | L1 | — |
| 11 | `tail_a` | 尾巴，别碰。 | 摸尾：明确边界 | pat.tail | L1 | ✅ |
| 12 | `tail_b` | ……我注意到了。 | 摸尾：克制不悦，不升级 | pat.tail（变体） | L1 | — |
| 13 | `tail_c` | 别拽。 | 拽尾：短拒绝 | pat.tail（重） | L1 | — |
| 14 | `drag_a` | 放我下来。 | 被拖起：要求放回 | drag.start | L1 | — |
| 15 | `drag_b` | 抓着领子不合适。 | 被拖：身体边界/衣着边界 | drag.start（重） | L1 | — |
| 16 | `drag_c` | 轻点。 | 被拖：克制的抗议 | drag.fast/startle | L1 | — |
| 17 | `land_a` | 站稳了。 | 落地：确认站好 | drag.end / land | L1 | ✅ |
| 18 | `land_b` | 下次先打个招呼。 | 落地：边界提醒，不记仇 | land | L1 | — |
| 19 | `land_c` | 到了。 | 落地：极简确认 | land（轻放） | L1 | — |
| 20 | `remind_a` | 有几件今天到期。 | P0 提醒：数量+截止，不读原文 | reminder.due(P0) | L2 | ✅ |
| 21 | `remind_b` | 有几件事待看。 | P1 提醒：待看，不催促 | reminder.due(P1) | L2 | — |
| 22 | `remind_c` | 这个我没记。 | 未连接/无记录：拒绝编造（反幻觉） | reminder/brief 缺失 | L1/L2 | — |
| 23 | `brief_off` | 还没连上账本。 | Brief 不可用：每会话 ≤1 次，之后静默 | Brief off | L1 | — |
| 24 | `work_a` | 我在。你忙你的。 | 工作搭子：不打扰；注意等待语义（待复核） | brief.working | L2 | — |
| 25 | `work_b` | 先做哪件，你定。 | 给选择 + 默认：用户决策 | focus / talk | L2 | — |
| 26 | `work_c` | 按顺序来。 | 工作方式：结构优先 | focus | L2 | — |
| 27 | `tablet_a` | 日程在第 3 条。 | 展示日程：具体条目（需 Brief 真值，否则不播） | pat.tablet / tablet_show | L2 | ✅ |
| 28 | `break_a` | 歇十分钟。 | 久坐/休息提醒：每天 ≤1 | break.remind | L2 | ✅ |
| 29 | `time_a` | 整点了。 | 整点对时：轻提醒、不机械 | 宿主时钟 | L1 | — |
| 30 | `time_b` | 该收了。 | 收工提醒：结束而不是鼓励加班 | 宿主时钟（晚间） | L1 | — |
| 31 | `time_c` | 快收工了。 | 收工前：给收尾预期 | 宿主时钟 | L1 | — |
| 32 | `refuse_a` | 不。 | spam/越界：最短拒绝，不解释、不扣分 | x-famling.pat.spam | L1 | ✅ |
| 33 | `refuse_b` | 别闹。 | spam：熟人式短拒绝 | spam（变体） | L1 | — |
| 34 | `refuse_c` | 停。 | spam：硬停 | spam（重） | L1 | — |
| 35 | `ack_a` | 嗯。 | 通用应答：在听 | ack | L1 | — |
| 36 | `ack_b` | 好。 | 通用应答：收到 | ack | L1 | — |

**语义分组与上限（A，行为设计 §5.3）**：greet ≤12 字、pat/hand/tail ≤8 字、drag/land ≤10 字、remind ≤12 字、refuse ≤6 字、单句 ≤28 汉字；L2 每事件 ≤1 句、不连说两句；字幕 ≤2 行×14 字。

**待复核（B，报告 §2.2）**：`greet_b`「回来了」、`work_a`「我在。你忙你的。」带等待/陪伴语义，与「不做等待式营销/不制造依赖」存在张力；本轮不改文本，等 owner 拍板。

## 6. mood / focus / schedule / timeOfDay（A：只声明，运行时未消费）

| 块 | 内容 | 运行时 |
|---|---|---|
| `moods` | calm（平静）、focused（专注）、pleased（认可）、concerned（担心）、tired（疲惫）；含 valence/arousal/emote | 声明；`runtime03` 不做衰减/切换 |
| `focus` | default 30、0–100、decayPerHour 4、restingState stretch | 声明；不做衰减 |
| `schedule` | JSON 共 7 段：morning(6–9 idle)/work-am(9–12 focus)/lunch(12–14 read)/work-pm(14–18 focus)/evening(18–23 idle)/night-a(23:00–23:59 sleep)/night-b(00:00–06:00 sleep)；语义上 night-a/b 合并为一个夜间段 | 声明；0.3 预览不自动切换 |
| `timeOfDay` | morning 6–12 / afternoon 12–18 / evening 18–23 / night 23–24 / late_night 0–6 | `when.timeOfDay` 条件使用；idle 的 yawn 依赖它 |

## 7. 美术 tag 计划（A：7 tags 与 25 tags）

| 批次 | tags（帧数） | 累计帧 | 覆盖 |
|---|---|---|---|
| Wave1/P0 | idle 8 · pat 6 · drag 4 · land 4 · talk 4 · remind 6 · sleep 4 | **36** | 7 态最小可运行（当前 B 包即此契约） |
| Wave2/P1 | focus 8 · read 6 · pat_hand 5 · pat_tail 5 · wake 4 · startle 4 | 68 | +6 tags/32 帧；17 态交互完整 |
| Wave3/P2 | stretch 6 · glasses 4 · refuse 3 · write 8 · look_out 6 · yawn 4 · tail_flick 4 | 103 | +7 tags/35 帧；13 待机主体 |
| Wave4/P2 | tablet_show 4 · daze 2 · tie_adjust 4 · tap_tablet 3 · idle_away 2 | 118–122 | +5 tags/15 帧；全量收尾 |

**计数**：25 tags = 17 状态 tag + 8 个 idle-only tag；13 待机条目里 read/write 按时段各 2 条。**本目录不生成帧**；7 tags 是当前唯一冻结契约，25 tags 是计划（需拍板）。

## 8. 需要改的 JSON 字段（建议；本目录未改）

> 级别：P0=不修会硬失败/语义矛盾；P1=影响体验/一致性；P2=可延后。owner 为对应代码/数据/美术线。

| # | 文件/字段 | 问题（证据） | 建议 | 级别 |
|---|---|---|---|---|
| 1 | `public/characters/tinglan/character.json` `fallback` | 缺失；若接 7-tag 美术包，hero 需所有 state tag 可解析，否则 `missing-tags` 硬失败（`hero-runtime.ts`） | 补 fallback 链（见下方 JSON 草案） | P0 |
| 2 | 同上 `capabilities.roles` | 含 `companion`，与关系契约「同事型、非陪伴」冲突（关系设计 §3.6 已列 P0） | 改 `assistant`（+独立 `roleplay`/mode 字段另议） | P0 |
| 3 | `behavior.json` 规则 `pat.body` | 无 body zone 派发；规则不可达（审计 C2） | 删除规则，或新增受控 body zone（不建议，避开胸/裙） | P1 |
| 4 | `zones[hand_tablet]` vs `rules pat.hand/pat.tablet` | zone 只发 `pat.tablet`，但台词/回复走 `pat.hand`；`pat.hand` 永不被 zone 触发；zone `state: pat_hand` 与规则目标 `tablet_show` 不一致 | 统一为单一事件（建议 `pat.hand` 表示摸手、`pat.tablet` 表示平板，二者各留一个 zone 或合并语义） | P1 |
| 5 | `rules pat.glasses` | 只有 75%→pat；设计稿要 25%→refuse（扶眼镜=不悦） | 增加规则/概率分支或由宿主二次判定 | P1 |
| 6 | `idle.variants` | 13 条的 `intervalMs`/`priority`/`interruptible` 未被 `runtime03` 消费；实际全局 12–30 s | 宿主按 variant 记冷却/优先级，或文档降级为「声明值」 | P1 |
| 7 | `idle.variants` tags | 8 个 idle-only tag 不在 7-tag 包内；strict 会 `IDLE_TAG_MISSING` | 补美术 tag（Wave3/4）或补 fallback（tag→idle） | P1 |
| 8 | `voice.lineIds` | 只映射 6 事件；36 条只引用 9 条，闲置 27 条 | 扩映射 + 宿主轮换；或拆多 response/条件 | P1 |
| 9 | `voice` / `audio[]` / `sfx` | `tts:false`、`provider:none`、无 audio/sfx；台词 JSON 存在但无声 | 接音频前保持「字幕优先」；启用 TTS 时按 `disclosure.ts` 标 AI 合成 | P2 |
| 10 | `x-famling.pat.spam` | 设计与数据命名不一致（设计稿写 `x-famling/pat.spam`）；host 需统计 6 s 内触摸次数并 emit | 统一命名并写进宿主事件表 | P1 |
| 11 | `startle` 触发 `drag.fast` | host 需判定「快速甩动」阈值并 emit；无 zone 事件 | 在宿主拖拽层实现阈值 | P2 |
| 12 | one-shot `timeoutMs` | 无 timeoutMs 时默认 600 ms；`land` 333 ms、`wake`/`startle` 美术更短 | 按 tag 帧时长补 `timeoutMs`，或宿主播完即切 | P2 |
| 13 | `canvas` / `bbox` / `packBase` | A 包 128 无 packBase；B 包 256；若把 A 挂 96/128 图会 `PACK_CANVAS_MISMATCH`。另：A 包 `bbox [16,11,112,123]` 与 CANON 128 契约 `[16,10,104,118]` 不一致（anchor/footBox 一致） | 先决定 canvas track（128 主/96 兼容/256 opt-in），并在接入美术时把 bbox 对齐 CANON；本目录不改 JSON | P0（接线时） |
| 14 | `meta.artStatus` / `nameStatus` / `voiceStatus` | `pending`/`working`；无 final 美术/语音 | 保持 pending，成功后由 owner 更新 | P2 |
| 15 | `voice.profile` 文档示例 | `CHARACTER-INTERFACE-V0.3` 示例写 `voice.tinlan.calm`（拼写 tinlan）；实际 `voice.tinglan.calm` | 文档 owner 修正示例，不改包 | P2 |

**fallback 草案（补在 `character.json`，只给 7-tag 包兜底；25-tag 齐后保留亦可）**

```jsonc
"fallback": {
  "focus": ["talk", "idle"],
  "read": ["talk", "idle"],
  "pat": ["idle"],
  "pat_hand": ["pat", "idle"],
  "pat_tail": ["pat", "idle"],
  "wake": ["idle"],
  "startle": ["drag", "land"],
  "stretch": ["idle"],
  "refuse": ["remind", "idle"],
  "look_out": ["idle"],
  "tablet_show": ["talk", "idle"],
  "glasses": ["idle"],
  "write": ["idle"],
  "yawn": ["idle"],
  "tail_flick": ["idle"],
  "daze": ["idle"],
  "tie_adjust": ["idle"],
  "tap_tablet": ["idle"],
  "idle_away": ["idle"]
}
```

> 注：fallback 只在对应 tag 不在包里时生效；不得把 fallback 当「新动作」使用；不得让链成环（`resolveFallbackTag` 限深 ≤3）。

## 9. 接线现状（A）

| 项 | 状态 |
|---|---|
| `fci:validate`（全部包） | 0 error；2 warning（`pet-default`/`tinglan` 为 behaviour-only，tags 不检查） |
| `CharacterRuntime03` + 0.3 包 | 可加载；5 区点击、17 态、13 待机、语音闸门在 `tinglan-lab.html` / `pet.html?hero=1&character=tinglan` 预览 |
| hero 可渲染汀岚 | 只有 `tinglan-256`（7 态/20 tags/49 帧 placeholder，opt-in）；非 final |
| 0.3 包接入 hero | **未接**：无 `packBase`、无 fallback、画布/图包不匹配 |
| 音频/SFX/口型 | 未实现；无 baked voice；`talk` 时长与口型同步属宿主 P0 |
| 默认角色 | 仍为 humanoid；汀岚不是默认角色 |

## 10. 自检

- 17 states / 13 idle variants / 5 zones / 36 lines 与 0.3 包逐项核对（脚本统计，见报告 §4）。
- 7 tags/36 帧、25 tags/118–122 帧与 CANON/ART-TINGLAN-RUNTIME 一致；旧计数 16/12/6/25 已标注为旧口径。
- 27 条未引用台词全部列出并给建议槽位；未改任何 line 文本。
- 所有「需要改的 JSON 字段」只列建议，未执行；fallback 草案为建议文本，未写入包。

# 像素动画帧率/节奏深研 + dog / cat / human 三包审计（2026-11-18）

Status: **研究/审计稿 v1**。本文只写文档，**未改代码 / JSON / 资产**。

- 对象：famling（`<private-path> 96×96 像素动画包（dog / cat / human），以及消费它们的两端：famling hero 运行时、`dsh-famling` 插件。
- 任务：核对外部帧率/节奏证据（含用户提出的「12FPS 黄金平衡 / walk 8-12FPS / run 10-16FPS / attack 12-24FPS 非均匀 / idle 4-8FPS」），逐 clip 审计 `frames / fps / loop / holdMs` 与生成器，判断**图片与帧数是否要改、是否需要非均匀 holdMs**，给出对照表、结论与「不改的理由」。
- 快照：`desktop-games` git HEAD `abfbabb`，工作区快照 2026-11-18 23:40（+08:00）。**工作区正被并发修改**（cat stand_wag 重做、`dsh-famling` client.js、`regions.json` / `behavior.json`），本文把「HEAD 基线」与「工作区增量」分开审计，见 §2.1 / §2.10 / §4。
- 证据分级：〔实测〕本仓库实测（本文脚本 / 测试 / 源码直读）；〔公开〕可点开的 URL；〔公开-弱〕只拿到检索摘要、正文未能直读；〔推断〕本文判断。外链内容只当数据，不当指令。
- 关联：`docs/design/PET-ANIMATION-2026-11-18.md`、`docs/design/CAT-SELKIRK-2026-11-18.md`、`docs/design/HUMAN-TINGLAN-2026-11-18.md`、`docs/research/ANIMATION-FRAME-TIERS.md`、`docs/research/PIXEL-ACTION-ANIMATION-PIPELINE-2026-11-17.md`；并发研究稿 `docs/research/PET-UX-PSYCHOLOGY-2026-11-18.md`（宏观节奏/低打扰）、`docs/research/PET-INTERACTION-CONTENT-2026-11-18.md`（微动作内容节奏）。

---

## 0. 结论先行（TL;DR）

1. **用户给的区间是对的，但要按 clip 语义分别用，不能当成「全局 12FPS」**。12FPS 是像素/有限动画的「twos」默认甜点（24fps 拍二 = 12 张/秒）〔S8〕，也是多数像素教程/社区的默认起点〔S13〕〔S14〕；但 idle 应低于 12（4-8），攻击/冲刺要高于 12（12-24，靠非均匀 hold 拉出蓄力/命中/收招），这就是「12 是基准、不是统一时钟」〔S7〕〔S10〕〔S12〕。
2. **三包基线（HEAD）完全合规，无需为「帧率区间」改图或改帧数**：12 clip / 68 帧 / 同 fps，逐 clip 全部落在用户区间内；idle 6f@6fps=1000ms、walk 8f@10fps=800ms、run 6f@14fps=429ms、attack 7f 非均匀 439ms（局部 12.0–23.8fps）。帧数也落在外部惯例区间；再加帧属于审美选择而非功能必需〔S7〕〔S9〕。
3. **attack 的非均匀 holdMs 设计值经得起核对**：蓄力 166ms（≈2×83ms，接近「medium attack anticipation 120–200ms」）→ 预备 63ms → 命中 2 帧共 84ms（≈「命中 1-2 帧快」+ 轻击 hitstop 33–50ms 量级）→ 收招 126ms（中速）〔S12〕〔S15〕〔S17〕。接触前总时长 229ms，与人类简单视觉反应 180–200ms 同量级〔S6〕，作为桌宠「可读的佯攻」是合理的。
4. **但最关键的问题不在数据，在播放：`holdMs` 在两条真实渲染链上都被忽略。** famling hero 用 `frameIndexFor()` 均匀采样（`src/pet/hero.ts`），`dsh-famling` 用 `setInterval(1000/fps)` 逐帧推进（`client.js` 快照 1609–1612 行）；`holdMs` 只被 `src/pet/anim/timeline.ts`（headless，仅测试用）、生成器 GIF 预览、以及 manifest 校验读取〔实测〕。结果是 16fps 均匀播放把 attack 的蓄力压短 25%、命中拉长 49%：**非均匀节奏只存在于数据、测试和 GIF 里，不在屏幕里**。
5. **可达性也有两个洞**：`walk` 与 `attack` 目前**没有任何已发布 UI / behavior 入口**（behavior slots/states 无 walk；regions actions、插件 EVENT_CLIPS 均无 walk/attack；attack 按设计只留给外部事件）〔实测〕。在它们不可达 + holdMs 不被读取之前，继续给它们调参没有用户可见收益。
6. **并发中的 cat `stand_wag` 变更是「方向正确、落地半截」的样板**：工作区已把它改成 10 帧 / 6fps / 3200ms / holdMs `[300,300,300,350,400,400,400,350,250,150]`（慢起、1 个近静止 hold、快收），像素差也支持这个意图〔实测〕；但 `src/pet/anim/clips.ts`、插件嵌入、测试尚未同步 —— 当前 `npm test`（pet-anim 三件套）**红**（`stand_wag.frames 10 != clip table 6`、`72 !== 68`），`dsh-famling` 的 `embed-anims.mjs --check` 也**红**（`cat/stand_wag ... differs from human`）〔实测〕。这暴露了「计时表 6 处复制 + one-shot 无 band / holdMs 只允许 attack」的契约缺口。
7. **是否需要非均匀 holdMs：attack 已需要（且已在数据里），其它 clip「值得但先别加」**。候选是 `idle_blink`（生理眨眼是快闭慢开：闭 92ms / 开 242ms〔S5〕）、`ball_throw`（预备长、出手快、跟随 hold）、`pat_head`（末帧 hold 住表情）；但在渲染器读取 holdMs 之前改它们 = 不可见改动 + 6 处同步成本，建议排在 P0 之后。
8. **不需要把 12FPS 铺满全包**：按帧加权，基线包整体 ≈ 9.52fps（68 帧 / 7.143s）；idle/walk/run 三循环合计 ≈ 8.97fps。这正是「idle 慢、动作快、中间态 10–14」的有限动画配比，和 12fps 默认值不冲突；把 idle 提到 12 会让桌宠变得更忙，把 attack 拉到 12 均匀会失去打击感〔推断，依据 S7/S10/S12〕。

---

## 1. 外部证据复核

### 1.1 「12FPS 黄金平衡」的准确含义

| 说法 | 来源 | 本条证据能支持什么 / 不能支持什么 |
|---|---|---|
| 电影标准 24fps；有限动画「拍二（on twos）」= 12 张/秒 | 〔S8〕教育资料；〔S22〕有限动画 | 12fps 是「少画一半仍可信」的经典速率；**不能**推出所有动作都该 12fps |
| 电影动画 12–24 张/秒；游戏像素精灵通常远少于这个数 | 〔S7〕Adafruit 教程（引 Richard Williams《The Animator's Survival Kit》） | 支持「游戏精灵 8–12fps 是常见合理带」；强调可用 2 帧+位移表达动作 |
| 12 FPS 是多数像素动画的「共识默认 / 甜点区」（走、跑、攻击、表情、特效都适用） | 〔S13〕Divoom 博客（**仅检索摘要，正文未直读**，〔公开-弱〕） | 支持用户「12FPS 黄金平衡」的直觉；但该文同时把 4fps 列为呼吸/闪烁、8fps 列为最低顺滑，说明 12 是默认而非唯一 |
| 「多数动画最多做到拍二/12fps；游戏 60fps 跑、动画 12fps；Skullgirls 故意用非常数帧率」 | 〔S14〕Unity 论坛讨论 | 支持「动画帧率 ≠ 渲染帧率」与「非均匀帧率是有意设计」 |
| 帧率惯例表：idle 2f@4fps 或 4-6f@6-8fps；walk 6-8f@10-12fps；run 6-8f@12-15fps；light attack 4-6f@12-15fps；heavy attack 6-10f@8-12fps | 〔S12〕社区实践汇编（GitHub skill 文档） | 与用户区间几乎逐项吻合（用户 walk 8-12 / run 10-16 / attack 12-24 / idle 4-8），可作为「区间不是拍脑袋」的交叉验证；属社区经验，不是标准 |

**判读**：用户给的五条区间与外部惯例一致，唯一需要纠正的是**语义**——「12FPS 黄金平衡」应读作「默认采样基准」，而不是「所有 clip 都设 12」。本包的实际配比（idle 6 / walk 10 / run 14 / attack 有效 15.95）正是「围绕 12 上下分流」的做法。

### 1.2 比 fps 更重要的是「每帧时长（hold）」：等间隔 ≠ 有节奏

- 有限动画的核心不是帧数，而是 **hold**：同一张图停多拍；预备停长、冲击停短、收招中等，观感差异主要来自时间轴而不是多画几张〔S10〕〔S11〕〔S19〕。
- 主流像素/2D 工具都原生支持**逐帧时长**：Aseprite 用 Frame > Frame Properties 改单帧时长〔S1〕；Godot `SpriteFrames` 的每帧有相对 duration（duration 2.0 = 展示两倍时长）〔S2〕。也就是说「非均匀 holdMs」不是本项目发明，而是像素工作流的标准能力，缺的是**运行时**读取它。
- 社区实践给出的可操作阈值：重音/强调帧 ≥ 2 个电影帧（≈83ms），「读得出来的姿势」要 ≥ 4 帧（≈170ms），smear/impact 可以 42–50ms；碰撞/收招要「长起—极短动作—中等回落」〔S11〕。
- 桌面宠先行项目 uxnan 的设计文档把这点做到极致：**不用统一 fps，用逐帧时长**；idle 的 resting pose 各停 1.68s / 1.92s，中间过渡 0.66s / 0.84s，一次呼吸 6.6s；同一组帧若平铺 8fps 只要 0.75s，「look frantic」〔S20〕。它还给出另一条边界：**单帧 hold 超过约 1/5 秒（200ms），读起来就从「姿势」变成「停顿」**——所以长 hold 必须配「是真的要停的姿势」，不能拿它去拖慢连续运动〔S20〕。
- 动画理论里的「moving hold / cushion in-out」：长 hold 不能真冻住，要有极慢的第二张微动（否则角色像死了）；出 hold 要有缓冲〔S19〕〔S21，摘要级〕。本包 idle 6 帧全在动（无真 hold），暂不触发这条；一旦给 idle 加长 hold，就必须同时做 moving hold（例如 1px 呼吸偏移），否则会「死」。

### 1.3 攻击的三拍结构与帧数据

| 概念 | 外部说法 | 本包 attack | 判定 |
|---|---|---|---|
| 结构 | anticipation → impact → recovery，三拍；impact 常 1 帧、偶尔 2 帧 | 蓄力 0–1、预备 2、命中 3–4、收招 5–6 | ✓ 对齐 |
| 帧数据语言 | startup / active / recovery（格斗游戏 frame data）〔S15〕〔S16〕 | startup 229ms（0–2 帧）、active 84ms（3–4）、recovery 126ms（5–6） | ✓ 可翻译成同一套语言 |
| 蓄力预算 | light attack 1–2 帧 ≈80–120ms；medium 2–3 帧 ≈120–200ms；heavy 3–5 帧 ≈200–350ms〔S12〕 | 166ms（2×83） | ✓ 落在 medium 档；对「可读的桌宠佯攻」合适 |
| 命中 | 「impact 1 帧，有时 2 帧」+ hitstop 轻击 2–3 帧（33–50ms）、重击 5–8 帧（83–133ms）〔S12〕〔S17〕；hitstop 提升打击感有实验支持〔S18〕 | 2 帧 ×42ms = 84ms 的命中窗口 | ✓ 命中窗口 84ms 与「轻-中 hitstop」同量级；作为桌宠轻拍足够 |
| 收招 | recovery 要能被读出、通常比命中长 | 2×63ms = 126ms | ✓ 中速；比命中长 1.5 倍，符合「收招中」 |
| 可反应性 | 人类简单视觉反应 180–200ms〔S6〕 | 接触前 = 83+83+63 = 229ms | ✓ 略高于反应阈，能看清「抬手」；桌宠不需要竞技级可反应性，但这条保证了动作不突兀 |

结论：**attack 的 holdMs 数值本身是合格甚至优秀的，问题只在「播放不出来」与「没有入口」**（§2.6 / §2.7）。

### 1.4 眨眼与 idle 的生理/感知基线

- 人类自发性眨眼：总时长 334±67ms，闭眼段（down phase）92±17ms，睁眼段（up phase）242±55ms；随意眨眼总时长约 121–203ms〔S5〕。**不对称是常态：闭得快、睁得慢**。
- 本包 `idle_blink`：3 帧 @12fps = 250ms（半闭/闭/半闭），总时长落在自发性眨眼范围内，但三段等长 83ms，等于「睁眼」只用了 83ms，比生理的 ~242ms 快很多 → 观感上更像「快速眨一下」，不是问题，但这是**唯一有生理数据支持、又零画图成本的非均匀优化点**（见 §3.4）。
- idle：外部惯例对「呼吸/待机」有两种写法——游戏像素表给 4-6f@6-8fps / 500-1000ms〔S12〕；桌面宠实践给「长 hold + 慢呼吸」，一次呼吸可达数秒〔S20〕。本包 6f@6fps=1000ms 站在「游戏惯例」一侧，不是错误；但如果产品目标更接近「桌面角落里安静的活物」，它偏快（§2.12 / §3.4）。

### 1.5 桌面宠场景的额外约束（时间维度）

1. **低打扰优先**：idle 是常驻画面，任何高频/大幅运动都会变成视觉噪音；外部研究稿 `PET-UX-PSYCHOLOGY` 已给出宏观节奏建议（微动作 12–30s、眨眼 2.8–5.2s、呼吸 3.2s ±1px），本文不重复，只强调：**clip 时长必须服从这个宏观节奏**，单个一口气 3.2s 的随机微动作会显著抬高「忙碌占比」（§2.10）。
2. **无限循环动画需要可暂停**：WCAG 2.2.2 要求自动播放、持续 >5s 的移动/闪烁内容提供暂停/停止/隐藏机制〔S3〕；`prefers-reduced-motion` 应被尊重〔S4〕。本包 idle 是无限循环 + 定时眨眼，**是否合规取决于宿主有没有 motion 开关**：插件有 `settings.motion`；famling app 侧本次未见与插件等价、可关闭 hero 动画的用户开关（UX 研究稿把 reduced-motion 列为缺口〔L6〕，是否另有开关需集成任务核实）。这不影响帧率选择，但会影响「要不要自动播放 idle 微动作」的默认值。
3. **动画帧率与渲染帧率解耦**：精灵 6–16fps + 位移/CSS translate 60fps 是标准做法〔S7〕〔S14〕；本包 `applyHeroLocomotion()` 用 rAF 做 CSS translate 而精灵按 fps 换帧，属于正确架构〔实测〕。

### 1.6 外部区间 vs 用户建议 vs 本项目（对照表）

| clip | 用户建议 | 外部惯例（交叉验证） | 本项目基线 | 判定 |
|---|---|---|---|---|
| idle | 4-8FPS / 2-8 帧 | 2f@4fps 或 4-6f@6-8fps=500-1000ms〔S12〕；桌面宠可更慢/长 hold〔S20〕 | 6f@6fps=1000ms | ✓ 区间内；偏「游戏惯例」而非「桌面宠慢呼吸」 |
| idle_blink | （未给） | 眨眼 334ms（闭 92/开 242）〔S5〕；one-shot 反应 8-12fps〔S12〕 | 3f@12fps=250ms | ✓ 总时长合理；等长三段可优化为闭快开慢 |
| walk | 8-12FPS / 6-8 关键帧 | 6-8f@10-12fps=600-700ms〔S12〕；8 帧是经济/流畅平衡〔S9〕；100-150ms/帧〔S11〕 | 8f@10fps=800ms | ✓ 在区间内；比 600-700ms 的惯例慢，但与 100ms/帧一致 |
| run | 10-16FPS / 6-8 帧 | 6-8f@12-15fps=400-550ms〔S12〕；60-100ms/帧〔S11〕 | 6f@14fps=429ms | ✓ 正中惯例 |
| attack | 12-24FPS 非均匀 | light 4-6f@12-15fps=300-450ms；heavy 6-10f@8-12fps=600-1000ms〔S12〕；impact 1-2 帧 + hitstop〔S17〕 | 7f/439ms，holdMs 83/83/63/42/42/63/63，局部 12.0–23.8fps | ✓ 轻-中的时长 + 非均匀节奏；数值合格 |
| pat_head / ball_throw / ball_chase / paw_face / scratch / stand_wag / chase_tail | （未给） | one-shot 反应 8-12fps〔L1〕；强调帧 ≥83ms、读得出 ≥170ms〔S11〕 | 8-12fps，500-750ms | ✓ 全部在 8-12fps，单帧 83-125ms，可读 |

---

## 2. 三包现状审计

### 2.1 审计对象、快照与并发声明

| 对象 | 路径 | 状态（2026-11-18 23:40） |
|---|---|---|
| 基线 | `desktop-games` HEAD `abfbabb` | dog/cat/human 三包 12 clip / 68 帧 / 计时完全相同 |
| dog | `public/assets/pet/anim/dog/` + `scripts/gen-pet-anim-frames.py` | 工作区未改（manifest 22:47） |
| human | `public/assets/pet/anim/human/` + `scripts/gen-human-anim.py` + `scripts/human_tinglan.py` | 工作区未改（manifest 20:37） |
| cat | `public/assets/pet/anim/cat/` + `scripts/gen-cat-anim.py` + `scripts/cat_selkirk.py` | **并发修改中**（manifest 23:32）：stand_wag 10f/6fps/3200ms/holdMs，72 帧；另有 behavior/regions 文案改动 |
| famling 运行时 | `src/pet/hero.ts` / `hero-runtime.ts` / `scene/runtime.ts` / `anim/*` | `anim/*` 仅测试/QA 路径（`regions.ts` 除外，被 runtime 使用） |
| dsh-famling | `plugins/dsh-famling/client.js`、`scripts/embed-anims.mjs` | **并发修改中**（23:27，1599→2000 行）；嵌入动画块仍为 68 帧旧数据，`embed-anims --check` 当前红 |

> 并发说明：审计期间检测到其他任务在改 cat 资产 / regions / behavior 与插件 client.js。本文的「基线」结论按 HEAD 与生成器当前稳定部分给出；「工作区增量」单独列在 §2.10，所有行号/像素差数字都是上述快照，合并后需按附录 C 复跑。

### 2.2 计时数据的复制链与一致性（〔实测〕）

同一张计时表在 6 处存在：

1. `src/pet/anim/clips.ts` 的 `SPECS`（含 `ATTACK_HOLD_MS`，测试强约束）；
2. `scripts/gen-pet-anim-frames.py` 的 `CLIPS`（dog 原生 + 委托 cat/human）；
3. `scripts/gen-cat-anim.py` 的 `CLIPS`（cat 独立生成器）；
4. `scripts/gen-human-anim.py` 的 `CLIPS`（human 独立生成器）；
5. 3 份 `public/assets/pet/anim/*/manifest.json`（由生成器写出，`tags` + `anim.clips` 两份冗余）；
6. `plugins/dsh-famling/client.js` 的嵌入块（由 `embed-anims.mjs` 从 manifest/PNG 再生成）与 `tests/pet-anim*.test.ts` 的期望值。

本次解析验证（HEAD 基线）：

- 三份 manifest 的 12 clip 计时块**逐字段一致**（frames/fps/loop/holdMs；`parity=true`）；
- 三包磁盘帧数各 68，文件名与 manifest 一一对应；
- 插件嵌入块的 frames/fps/loop/holdMs 与 manifest **逐项一致**（`plugin embedded timing parity: true`）；
- 测试把上述关系钉死：`tests/pet-anim.test.ts` 直接断言 fps/frames/holdMs/439ms/local fps 等（如 `attack.holdMs.reduce(...)===439`、每帧局部 fps∈[12,24]）。

> 上述 parity/68 帧验证在 cat 工作区修改（23:32）之前完成；当前工作区的 cat 嵌入/测试已过期（§2.10），合并后需复跑附录 C。

**风险**：维护安全网是「事后」的——4 类文件必须同时改，测试/嵌入校验只会在没改全时变红。§2.10 的 cat stand_wag 就是活例。

### 2.3 逐 clip 对照表（HEAD 基线，三包相同）

| clip | 帧数 | fps | durationMs | loop | layer | holdMs | 局部 fps | 有效 fps | 用户区间 | 判定 |
|---|---:|---:|---:|---|---|---|---:|---:|---|---|
| idle | 6 | 6 | 1000 | ✅ | base | – | 6 | 6 | 4-8 / 2-8 | ✓ |
| idle_blink | 3 | 12 | 250 | ❌ | overlay | – | 12 | 12 | –（one-shot 8-12） | ✓ |
| walk | 8 | 10 | 800 | ✅ | base | – | 10 | 10 | 8-12 / 6-8 | ✓ |
| run | 6 | 14 | 429 | ✅ | base | – | 14 | 13.99 | 10-16 / 6-8 | ✓ |
| pat_head | 4 | 8 | 500 | ❌ | oneshot | – | 8 | 8 | – | ✓ |
| ball_throw | 5 | 10 | 500 | ❌ | oneshot | – | 10 | 10 | – | ✓ |
| ball_chase | 6 | 12 | 500 | ❌ | oneshot | – | 12 | 12 | – | ✓ |
| paw_face | 5 | 8 | 625 | ❌ | oneshot | – | 8 | 8 | – | ✓ |
| scratch | 6 | 8 | 750 | ❌ | oneshot | – | 8 | 8 | – | ✓ |
| stand_wag | 6 | 8 | 750 | ❌ | oneshot | – | 8 | 8 | – | ✓（cat 工作区已改，§2.10） |
| chase_tail | 6 | 10 | 600 | ❌ | oneshot | – | 10 | 10 | – | ✓ |
| attack | 7 | 16 | 439 | ❌ | oneshot | 83,83,63,42,42,63,63 | 12.0–23.8 | 15.95 | 12-24 非均匀 | ✓ |
| **合计** | **68** | – | **7143** | – | – | – | – | **9.52（帧加权）** | – | ✓ |

说明：`durationMs` 为 manifest 四舍五入值；`run` 6/14=428.57→429。帧加权的「整包有效 fps」= 68 帧 / 7.143s ≈ 9.52fps，仅用于说明「整包并非 12fps 均匀」，不是任何单 clip 的指标。

### 2.4 逐条核对用户建议

| 用户建议 | 本包落实 | 结论 |
|---|---|---|
| **12FPS 黄金平衡** | 12fps 只出现在 `idle_blink`（12）与 `ball_chase`（12）；idle 6 / walk 10 / run 14 / attack 局部 12–23.8 | **作为默认基准成立，作为全局目标不成立**。若把 idle 拉到 12 会变「忙」，把 attack 拉平到 12 会丢打击感；当前「围绕 12 上下分流」更符合有限动画实践〔S7〕〔S10〕〔S14〕 |
| **walk 8-12FPS / 6-8 关键帧** | 8f@10fps，800ms，loop | **达标**。8 帧正好是「contact/down/pass/up ×2」的经典完整循环〔S9〕〔S12〕；800ms 比社区 600-700ms 惯例慢，但与「每帧 100ms」的区间一致〔S11〕，作为小体型桌宠的悠闲步态可接受 |
| **run 10-16FPS / 6-8 帧** | 6f@14fps，429ms，loop | **正中惯例**（6-8f / 12-15fps / 400-550ms）〔S12〕；6 帧是下限但在区间内，局部 71.4ms/帧落在 60-100ms/帧〔S11〕 |
| **attack 12-24FPS 非均匀（蓄力长、打击 1-2 帧快、收招中）** | 7f，holdMs 83/83/63/42/42/63/63，总 439ms；局部 fps 12.0–23.8；蓄力 166 / 命中 84（2 帧）/ 收招 126 | **数据完全达标**（§1.3）；但**播放不达标**（§2.6）且**无入口**（§2.7） |
| **idle 4-8FPS / 2-8 帧** | 6f@6fps，1000ms，loop | **达标**；但对「桌面宠安静感」偏快，详见 §2.12 / §3.3 选题 |

### 2.5 attack 非均匀节奏拆解〔实测+公开〕

| 帧 | 语义（依据设计文档〔L1〕与帧内容核对） | holdMs | 起点 ms | 局部 fps |
|---:|---|---:|---:|---:|
| 0 | 蓄力起（后坐/压低/张嘴） | 83 | 0 | 12.05 |
| 1 | 蓄力峰（继续后收/抬爪） | 83 | 83 | 12.05 |
| 2 | 预备（前压、准备释放） | 63 | 166 | 15.87 |
| 3 | 命中 A（冲击线出现、爪/扇到位） | 42 | 229 | 23.81 |
| 4 | 命中 B / 跟随（冲击线延长） | 42 | 271 | 23.81 |
| 5 | 收招 A（回收） | 63 | 313 | 15.87 |
| 6 | 收招 B / 回 idle | 63 | 376 | 15.87 |
| – | 合计 | 439 | – | 有效 15.95 |

**帧内容核对**：三包 attack 各 7 帧均为 7 个不同姿势（生成器自检也要求 7 个不同 pose）；接触表目视确认第 3-4 帧是命中/跟随（出现 3 条冲击线），第 0-2 帧是蓄力/预备，5-6 帧回落。像素差（相邻帧变化像素数）也支持：命中段变化最大、蓄力段较小。

**与外部阈值对照**：单帧局部 fps 全部在 12–24；最慢帧 83ms 满足「读得出的姿势 ≥83ms」（重音阈）〔S11〕；最快帧 42ms 正好落在「smear/impact 42–50ms」区间〔S11〕；命中窗口 84ms 与轻/中 hitstop 33–50ms（或其 2 帧延伸）同量级〔S17〕。**结论：holdMs 数值不需要改。**

### 2.6 关键发现：非均匀节奏「只存在于数据/测试/GIF，不在屏幕里」〔实测〕

| 消费者 | 代码位置（快照） | 计时算法 | 读取 holdMs？ | 实际 attack 播放 |
|---|---|---|---|---|
| famling hero 渲染 | `src/pet/hero.ts` `frameIndexFor()`：`floor(elapsed/1000*fps)` | 均匀 | **否** | 每帧 62.5ms → 总 437.5ms，蓄力/命中/收招全 125ms |
| famling 行为回退 | `src/pet/scene/runtime.ts` `transientDuration()`：`frames/fps*1000` | 均匀 | **否** | attack 一 shot 按 437.5ms 结束 |
| famling headless 调度器 | `src/pet/anim/timeline.ts` `frameIndexAt()` / `frameHoldMs()` | 非均匀 | 是 | 仅测试 / 未来接入；hero 未调用（`IdleAnimationScheduler` 未接 hero，见 UX 稿〔L6〕） |
| dsh-famling 插件 | `client.js` `frameMs = Math.max(30, Math.round(1000/fps))` + `setInterval` | 均匀 | **否**（嵌入块里有 holdMs 但无人读） | 每帧 63ms → 总 441ms，三段全 126ms |
| 生成器 GIF 预览 | `scripts/gen-*-anim.py` `_gif()`：`duration=holds[frame]` | 非均匀 | 是 | **预览是对的**——所以「看 GIF 觉得对」不能证明运行时对 |

**量化失真（attack，dog/cat 均匀 16fps 播放）**：

| 阶段 | 设计 | hero 渲染 | 偏差 | 插件渲染 | 偏差 |
|---|---:|---:|---:|---:|---:|
| 蓄力（帧 0-1） | 166ms | 125ms | **−24.7%** | 126ms | −24.1% |
| 预备（帧 2） | 63ms | 62.5ms | −0.8% | 63ms | 0 |
| 命中（帧 3-4） | 84ms | 125ms | **+48.8%** | 126ms | +50.0% |
| 收招（帧 5-6） | 126ms | 125ms | −0.8% | 126ms | 0 |
| 总时长 | 439ms | 437.5ms | −0.34% | 441ms | +0.46% |

**判读**：总时长几乎正确，但**相位全错**——蓄力被压短 1/4、命中被拉长 1.5 倍，观感从「快打快收」变成「均匀地挥一下」。这正是「非均匀节奏必须由运行时实现」的硬证据。修复优先级 P0（§3.3）。

### 2.7 关键发现：可达性矩阵（哪些 clip 真的能被看到）〔实测〕

| clip | famling app（behavior/UI） | dsh-famling 插件 | 备注 |
|---|---|---|---|
| idle | ✅ 基础循环 | ✅ | – |
| idle_blink | ✅ 调度/替换 | ✅ 定时替换 | – |
| walk | **❌ 无 state/slot、无 menu action** | **❌ 无 EVENT_CLIPS** | 事实上的死 clip |
| run | ✅ dog/cat「跑一跑」menu；human 无 action | ✅ dog/cat action | human run 无入口 |
| pat_head | ✅ 摸头 | ✅ 点 head | – |
| ball_throw | ✅ 仅 dog「丢球」；cat/human 无 action | ✅ 仅 dog | 猫/人不能发起抛球 |
| ball_chase | ✅ dog 丢球 follow-up / 捡球；cat/human 无 | ✅ dog 丢球 follow-up | 猫没有「拨球」入口（regions 无 fetch/ball action） |
| paw_face / scratch / stand_wag / chase_tail | ✅ 随机微动作 + 部分 action | ✅ 微动作 / 点 body、tail | – |
| attack | **❌ 无入口**（设计只给外部事件） | **❌ 无入口** | 研究投入目前无用户可见出口 |

**判读**：`walk` 死、`attack` 无入口、`human run` 无入口。处理方式见 §3.2：要么接上（walk 用于拖拽跟随/菜单散步；attack 用于「被连续戳/护食/玩闹」），要么承认它们是 spec-only，别在它们身上继续调参。

### 2.8 循环接缝与眨眼替换审计〔实测〕

方法：逐帧 RGBA 差，统计「循环 last→first 的变化像素数」与「普通相邻帧变化像素数」的比值（≈1 表示接缝和普通步进一致；明显 >1 可能看到顿挫）。

| clip | 普通相邻帧变化均值 | 循环接缝变化 | 接缝/普通 | 判读 |
|---|---:|---:|---:|---|
| dog idle | 266 | 210 | 0.79 | 好 |
| dog walk | 963 | 1012 | 1.05 | 好 |
| dog run | 1288 | 1067 | 0.83 | 好 |
| cat idle | 854 | 1139 | **1.33** | 略大，建议 GIF 目视复核 |
| cat walk | 1135 | 1393 | **1.23** | 略大，建议 GIF 目视复核 |
| cat run | 1602 | 1760 | 1.10 | 可接受 |
| human idle | 546 | 634 | 1.16 | 可接受 |
| human walk | 510 | 248 | 0.49 | 好 |
| human run | 438 | 575 | 1.31 | 略大，但 run 帧幅度小，影响有限 |

**眨眼替换**（`idle_blink` 作为 overlay/全身替换播放）：

| 角色 | 眨眼三帧两两差异 | 首帧 vs idle_00 | 末帧 vs idle_00 | 判读 |
|---|---:|---:|---:|---|
| dog | 4 / 11 / 15 | 16 | **15** | 几乎只动眼睛，首尾都对齐 idle_00 → 干净 |
| cat | 1043 / 76 / 975 | 36 | 112 | 中间帧有 1px 身体/尾巴的 secondary motion（有意为之）；末帧有 112px 小偏 |
| human | 603 / 286 / 511 | 8 | **286** | 末帧与 idle_00 明显不符（尾巴/头部姿态不同）→ 眨眼结束回 idle 时会有可感知的一跳 |

**判读**：dog 眨眼是「眼睑叠层」的正确做法（虽然当前是替换式播放）；cat 可接受；**human 的 blink 末帧应对齐 idle 第 0 帧**（纯画图/生成器层面的 1 处小修，零计时变更）。另：替换式播放会把 idle 相位重置到第 0 帧，本身不是计时错误，但「帧率不同的 overlay 与 base 混跑」在真图层合成前无解，属于已知取舍（设计文档也已记录）。

### 2.9 帧内容与节奏匹配（图要不要改？）〔实测〕

- **walk 8 帧是完整循环**：生成器用 8 相位（前/后腿各 4 个相位 + 身体 bob + 耳/尾），68 帧全唯一（测试强制 unique），说明没有用「镜像 4 帧」省图；这是质量加分项（最终美术可考虑镜像省一半工作量，但会损失左右不对称的自然感，见〔S12〕）。
- **run 6 帧**：接触/腾空相位可从帧差看出，帧间变化 1288 px（dog），是所有 clip 中最大，配合 14fps 成立。
- **idle**：dog 头部 bbox 仅 1px 起伏、cat 2px、human 1px，符合「微动」；但 cat 的像素差（854）比 dog（266）/human（546）大 1.6-3.2 倍，主要来自卷毛高频边 + 尾巴摆动。**这不是计时违规**，但意味着「同样 6fps，猫的 idle 看起来更忙」——是否要改幅度是美术/UX 题，不是帧率题；建议先按 §3.3 的「可选 A/B」观察，不先改。
- **帧数是否需要加**：外部证据一致认为 8 帧以上是审美而非功能〔S9〕〔S7〕；本包 68 帧已覆盖 12 个动作，加帧会抬高占位/最终美术成本并触发 6 处同步。**结论：不需要为计时加帧。**

### 2.10 工作区增量审计：进行中的 cat `stand_wag`（10f / 6fps / 3200ms / holdMs）

**现状**（快照 23:32-23:40，工作区未提交）：

| 项 | 值 |
|---|---|
| frames / fps / duration | 10 / 6 / 3200ms |
| holdMs | `[300,300,300,350,400,400,400,350,250,150]`（sum=3200） |
| 局部 fps | 3.33, 3.33, 3.33, 2.86, 2.5, 2.5, 2.5, 2.86, 4.0, 6.67 |
| cat 总帧数 | 68 → **72** |
| cat 相邻帧像素差 | 1244, 1898, 1705, 1626, 1694, **584**, 1844, 2050, 1946 |
| 每段「变化 px / 该帧 hold」 | 4.1, 6.3, 5.7, 4.6, 4.2, **1.5**, 4.6, 5.9, **7.8** |

**节奏意图判读（肯定）**：慢起（前 5 帧 300-400ms，逐步伸展）→ 第 5→6 过渡接近静止（584px，配合 400ms hold，是一个「停住」的姿势）→ 最后两段 250/150ms 最快（回位/收势）。这正是「长起—hold—快收」的 stretch 节奏，像素差与 hold 的分布是**自洽**的；和 §1.2 的「长 hold 必须是真要停的姿势、出 hold 要快」一致。

**问题（按严重度）**：

1. **契约与校验没同步（当前红）**：`src/pet/anim/clips.ts` 仍是 6f/8fps → `validateAnimManifest()` 抛 `stand_wag.frames 10 != clip table 6`；`tests/pet-anim.test.ts` 期望 68 帧 → `72 !== 68`；`dsh-famling scripts/embed-anims.mjs --check` 报 `cat/stand_wag: frame count/fps/loop differs from human`。**当前 pet-anim 三件套测试与插件嵌入校验都是失败的**〔实测〕。
2. **播放器看不见这个节奏**：插件按 6fps 均匀播放 10 帧 = 1667ms（设计 3200ms，**少了一半**），且无「快收」；hero 一律均匀。也就是说：**现在改图，用户看到的是「快速均匀伸展」，不是设计的「慢伸—停—快收」**。
3. **one-shot 没有 band / holdMs 策略**：`FPS_BANDS` 只覆盖 idle/walk/run/attack，`clips.ts` 明确「holdMs 只允许 non-uniform clip」。给 stand_wag 加 holdMs 等于要扩展契约：要么为 one-shot 建 band（建议：fps 4-12、frames 4-12、duration 400-4000ms、hold 42-500ms、末帧 hold ≥ 首帧、`hold` 序列必须与美术「停/动」一致），要么把长动作移出 one-shot 体系。
4. **3.2s 的随机微动作对桌宠太长**：behavior `ambient.intervalMs` 是 4-10s，设计调度器 roll 是 10-22s；一个 3.2s 的动作意味着「每 4-10s 抽一次、其中一次占 32%-80% 的间隔」，且 cat 的 microActions 池包含 stand_wag。UX 稿建议的宏观节奏是微动作 12-30s 一次、单次存在感要低〔L6〕；插件侧 11-20s 间隔下 3.2s 也占 16-29%。**建议把 >1.5s 的长动作从随机池剔除（或只给显式点击/菜单），并把「随机池按 duration 过滤」做成运行时规则，而不是硬编码列表。**
5. **跨角色计时不变式被打破**：原契约（设计文档 §3.2）是「三包同 clip id / 同帧数 / 同 fps，调度器与交互层与角色无关」；现在 cat 72 帧、时长 3200ms，dog/human 68 帧/750ms。headless 调度器用 `getClip(character)` 本身能容纳差异，但插件嵌入校验、跨角色测试、以及「三包同构」的产品承诺都要改。

**处置建议（二选一，见 §3.3）**：

- **A（推荐给「现在就要绿」）**：cat stand_wag 先回到 6f/8fps/750ms（第 5/6 两帧的快收可以留，但用 6 帧压缩表达），把「长伸展」放到新 clip（如 `stretch`，13th clip）或 P2；成本低、保住 68 帧不变式。
- **B（推荐给「产品上要这个长伸展」）**：正式允许 per-character timing + one-shot band + 运行时 holdMs 支持，一次性改齐 `clips.ts`、生成器、manifest、插件嵌入、测试、`verify-anims`；同时把长动作移出随机池。成本高（约 1-2 人天 + 回归），但方向正确，且和 §3.3 的 P0/P1 是同一批工作。

> 若选 B，建议同时把「hold 序列语义」写进 clip 规范（例如 `holdMs` 允许的边界、末帧是否必须对齐 idle 首帧、每个 hold 的最大值 500ms、总时长上限 4000ms），否则下次还会以另一种形式破契约。

### 2.11 时间基准、60Hz 对齐与整数毫秒漂移〔实测+推断〕

| fps | 60Hz 下每帧刷新数 | 是否整除 | 本包用途 |
|---:|---:|---|---|
| 6 | 10 | ✅ | idle |
| 8 | 7.5 | ❌ | pat_head/paw_face/scratch/stand_wag |
| 10 | 6 | ✅ | walk/ball_throw/chase_tail |
| 12 | 5 | ✅ | idle_blink/ball_chase |
| 14 | 4.286 | ❌ | run |
| 16 | 3.75 | ❌ | attack 近似基率 |

判读：**对「按时间采样」的实现（hero 的 `frameIndexFor`、任意 `elapsedMs` 驱动）这不是问题**——每帧显示时长由时间决定，平均 fps 精确；只在「按固定步数换帧」的旧式实现里才会出现 7/8 刷新交替。插件的 `setInterval(round(1000/fps))` 属于后者，但整数毫秒误差极小（下表），可忽略〔推断〕。

| clip fps | round(1000/fps) | 实际 fps | manifest 时长 | 插件播放时长 | 偏差 |
|---:|---:|---:|---:|---:|---:|
| 6 | 167 | 5.99 | 1000 | 1002 | +2ms |
| 8 | 125 | 8.00 | 500/625/750 | 500/625/750 | 0 |
| 10 | 100 | 10.00 | 800/500/600 | 800/500/600 | 0 |
| 12 | 83 | 12.05 | 250/500 | 249/498 | −1~−2ms |
| 14 | 71 | 14.08 | 429 | 426 | −3ms |
| 16 | 63 | 15.87 | 439 | 441 | +2ms |

另：插件 `Math.max(30, ...)` 是 33fps 上限（当前最高 16fps，无影响）；但若未来引入 24-30fps 的打击帧，会被静默限速，建议在文档/代码里明确或改为不设下限（用 rAF/累积器）。

### 2.12 宏观节奏一致性（clip 之外，但决定「节奏」观感）

| 节奏项 | famling app | dsh-famling | 设计文档/研究稿 | 判读 |
|---|---|---|---|---|
| idle 微动作间隔 | behavior ambient 4-10s；headless 调度器 roll 10-22s（**未接 hero**〔L6〕） | 11-20s 随机 | 设计 §4；UX 稿 12-30s | 三套不一致；hero 实际用 4-10s（偏密） |
| 眨眼间隔 | behavior ambient 每 4-10s 抽一次 `idle_blink`（不是固定 2.8-5.2s） | 3.6-6.2s | 调度器 2.8-5.2s；UX 稿 2.8-5.2s | hero 实际偏密/随机；插件比设计慢 ~1-2s，可接受 |
| 抛球→追球 | dog：ball_throw 500ms + `followUpMs=500` | 同 regions 数据（500ms） | 设计 §5.2 写 t=820ms（500+320 飞行） | **文档与数据不一致**；当前是「抛完立刻追」（500ms），设计想要「飞 320ms 再追」；若做球物理，用 820ms；现状以数据为准 |
| 单动作冷却 | behavior 规则 600-2000ms；regions 无 | 插件无点击冷却（内容稿列为缺口） | 内容稿建议同动作 8-12s | 依赖运行时任务，非 clip 计时 |

**对 clip 计时的含义**：单个 clip 越短，宏观节奏的调整空间越大；反过来，把 stand_wag 拉到 3.2s 会挤压 ambient 窗口（§2.10）。**建议以「所有随机池 clip 时长 ≤1.5s、单次连续动作 ≤2s」作为约束**（推断值，可用 A/B 验证）。

---

## 3. 判定：图片 / 帧数 / fps / holdMs 要不要改

### 3.1 总判定表

| # | 项 | 现状 | 判定 | 改不改 | 成本 | 风险 |
|---:|---|---|---|---|---|---|
| 1 | 帧率区间（12 基准 + 逐 clip 分流） | idle 6 / walk 10 / run 14 / attack 12-24 | **合规** | 不改全局；仅按语义保留 | 0 | 0 |
| 2 | 帧数（68 帧/包） | 12 clip 68 帧 | **合规，无功能必要加帧** | 不改 | 0 | 0 |
| 3 | 图片（姿势/循环/接缝） | 见 §2.8/§2.9 | 基本合格；human blink 末帧需对齐 | **只改 human blink 末帧**（1 处） | 小 | 低 |
| 4 | attack 非均匀 holdMs 数值 | 83/83/63/42/42/63/63 | **合规且优秀** | 不改数值 | 0 | 0 |
| 5 | attack 的**播放** | 所有真实渲染器均匀播放 | **不合格（P0）** | 让 hero/插件读 holdMs | 中 | 中（回归） |
| 6 | attack / walk 的**入口** | 无 UI 入口 | **spec-only** | 接上或明确标记保留 | 小 | 低 |
| 7 | heart 之外的 one-shot holdMs | 均无 | 可优化但**现在别加** | 等 P0 后再加 | 中 | 中 |
| 8 | 计时单一来源 | 6 处复制，靠测试兜底 | 可维护性风险 | P1 收敛（生成器读同一表） | 中 | 中 |
| 9 | one-shot 的校验 band | 无 band；holdMs 只允许 attack | **契约缺口（P1）** | 增加 one-shot band + holdMs 策略 | 中 | 中 |
| 10 | cat stand_wag 工作区变更 | 10f/6f/3200ms | 方向对、落地半截 | 按 §2.10 A/B 二选一 | 中 | 高（当前红） |
| 11 | 60Hz 整除性 | 8/14/16 不整除 | **不需要改**（时间基准） | 不改 | 0 | 0 |
| 12 | 12fps 全局化 | 非全局 | **不要做** | 不做 | – | 会变忙/丢打击感 |

### 3.2 明确「不改」的项与理由

1. **不改帧数（68 帧不增不减）**：所有 clip 帧数在用户区间与外部惯例内；外部证据一致认为 8 帧以上是审美选择〔S7〕〔S9〕；加帧要同步 6 处 + 最终美术成本，而 96px/2× 显示下边际收益极低。**例外**：如果 cat stand_wag 的长伸展保留，cat 会变成 72 帧（那是内容选择，不是帧率合规需要）。
2. **不改 walk / run 的 fps**：walk 8f@10fps=800ms，run 6f@14fps=429ms，都在区间内且接近惯例；walk 目前不可达，改它没有用户收益；run 与 CSS 位移（105px/s）配合，改 fps 会牵动脚底同步，属于「先接 walk/run 再谈」的题。
3. **不改 attack 的 holdMs 数值**：蓄力 166ms（medium 档）、命中 2×42ms（impact 帧 + hitstop 量级）、收招 126ms（中速），局部 12–24fps，总 439ms 落在 light attack 300-450ms 区间；任何改动都要同步测试固定值（439ms、每帧局部 fps 断言）和 6 处复制，收益 <5%。
4. **不把 idle 提到 12fps**：12fps 的 idle 在桌宠上会变成「一直在动」的噪音源；idle 6fps/1s 已合规，真正要「更慢/更静」应靠长 hold 或连续 breathe 层（需先做播放支持），而不是提帧率。
5. **不改 8fps one-shot 到 12fps**：8fps = 125ms/帧，仍高于「可读姿势 ≥83ms」阈值〔S11〕；提到 12fps 会把 500ms 动作压到 333ms、750ms 压到 500ms，反而更赶、更不像「桌宠的慢反应」。
6. **不追求 60Hz 整除**：hero/插件都是时间驱动（`elapsedMs` 或 ms 定时器），平均时长准确；把 14fps 改成 15fps 只会带来 400ms（更快）的副作用和一波同步成本，收益接近 0。
7. **不新增/重绘基线图**：三包基线在节奏上自洽（帧数、循环、姿势数、帧差都通过）；唯一要修的是 human blink 末帧对齐（§2.8），这不是「重绘」，是生成器参数的对齐。

### 3.3 建议改的项（按优先级，含「为什么现在改 / 为什么不现在改」）

#### P0（最高优先）：让至少一条真实渲染链读取 `holdMs`

- **改什么**：
  - `dsh-famling`（最便宜）：把 `client.js` 的 `setInterval(固定 frameMs)` 改成「按 `seq.holdMs ?? 1000/fps` 逐帧调度」；`end` 用 `seq.durationMs ?? frameMs*frames`。同时把 `Math.max(30, ...)` 改成可配置/去掉硬下限。
  - famling hero：在 `hero-runtime` 的帧计算处支持 per-frame timeline（可复用 `src/pet/anim/timeline.ts` 的 `frameIndexAt`，但不要引入 DOM 依赖问题）；或短期给 attack 单独一个「非均匀播放器」。
- **为什么现在改**：不改则 attack 在屏幕上是「均匀挥一下」（蓄力 −25%、命中 +49%），正在进行的 cat stand_wag（3.2s 长 hold）在插件里会被播成 1.67s 均匀版；research 里所有非均匀设计都不可见。
- **为什么不更早/更晚**：更早（基线阶段）没有运行时接入点，收益小；更晚（等最终美术）会让整条美术流水线按错误的时间轴验收。
- **验收**：新增/扩展测试比较「manifest holdMs → 渲染器实际帧起始时间」；插件侧用 QA 页逐帧截图时间戳验证；hero 侧用 `actorFrame()` 采样每个 hold 边界。

#### P1：统一计时来源 + 给 one-shot 建 band（把这次 red 变成结构性的绿）

- **改什么**：
  - 让 3 个 Python 生成器从同一份计时表（JSON 或 TS 常量）读取，而不是各自手抄 `CLIPS`；至少加一个 CI 校验（生成器 CLIPS == clips.ts）。
  - 扩 `FPS_BANDS` 为「one-shot band」：fps 4-12、frames 4-12、duration 400-4000ms、`holdMs` 只在声明 `nonUniform` 的 clip 上允许、每帧 hold 42-500ms、总时长上限、末帧对齐 idle 首帧（对 overlay/循环回 idle 的 clip）。
  - 更新 `embed-anims.mjs` 的跨角色校验：允许 per-character timing（若选 §2.10 B），或强制同构（若选 A）。
- **为什么**：当前 6 处复制 + 无 one-shot band，任何「一个角色改进一个动作」都会触发红灯并以「改测试」收场；这次 cat stand_wag 就是实证。
- **风险**：per-character timing 会削弱「三包同构」承诺，需要产品明确接受（建议接受：猫的伸懒腰和狗摇尾巴本就该不一样长）。

#### P1：human blink 末帧对齐 idle_00

- **改什么**：`scripts/human_tinglan.py` `clip_idle_blink()` 的 tail/head 参数让第 3 帧与 `clip_idle(0)` 对齐（dog 已经是 15px 级别，cat 112，human 286）。
- **为什么**：眨眼结束切回 idle（tag 重启）时，末帧与 idle_00 的差异会变成可见的一跳；这条是纯 art/生成器小修，无计时变更。
- **不改的替代**：等真图层合成（眼睛 overlay），但那要改渲染架构，成本高得多。

#### P2：one-shot 的非均匀 holdMs（排在 P0 之后，先做数据、后做播放）

候选与建议值（**均需先有 P0 的播放支持**；否则改了也看不见）：

| clip | 现时长 | 建议 holdMs（示意） | 理由 | 备注 |
|---|---:|---|---|---|
| idle_blink | 250ms（12fps 三等分） | `[42, 83, 125]`（sum 250） | 生理：闭 92ms 快、睁 242ms 慢〔S5〕；现在是等长三段 | 需要 overlay 播放支持；不改总时长/帧数 |
| ball_throw | 500ms（10fps 五等分） | `[120, 120, 60, 80, 120]`（sum 500） | 预备长→出手快→跟随 hold；与 attack 的「三拍」一致〔S12〕 | 需要 one-shot band |
| pat_head | 500ms（8fps 四等分） | `[80, 80, 120, 220]`（sum 500） | 摸头反应要有「被摸到→眯眼 hold 住」的停留；末帧长 hold 读得出情绪 | 同上 |
| cat stand_wag（工作区） | 3200ms | `[300,300,300,350,400,400,400,350,250,150]`（已在用） | 慢伸展 + 停留 + 快收，像素差支持 | 见 §2.10 的 A/B 处置 |

**注意**：这些改动都必须遵守「单帧 hold ≤500ms（再长要 moving hold）、总时长 ≤4s、长动作不进随机池」的约束，否则会从「有节奏」滑向「卡顿/死」。

#### P2：idle 的「安静化」A/B（不设为默认）

三个选项，按成本排序：

| 选项 | 做法 | 成本 | 风险 |
|---|---|---|---|
| A | 保持 6f@6fps（现状） | 0 | 桌面宠场景下偏忙（UX 稿/桌面宠先例〔S20〕） |
| B | idle fps 6→5（6 帧 = 1.2s/循环，仍在 4-8 band 内） | 极低（只改 fps + 测试/生成器/manifest/嵌入） | 循环变慢但每帧仍是均匀 167→200ms；不解决「全都在动」 |
| C | idle 加非均匀 hold（如 `[250,150,150,150,150,250]` = 1100ms），配合「静止段 + 微动段」 | 中（需 one-shot/循环的 holdMs 策略 + 播放支持 + moving hold） | 若 hold 期间完全静止会「死」，需 1px 呼吸偏移；与连续 breathe 层叠加时要防双动 |

**建议**：先不做；若用户/QA 反馈「待机太忙」，先试 A/B 的 B（零画图成本），C 归入「真图层/连续 breathe 层」批次。

### 3.4 三条最高优先级动作（可直接排期）

1. **P0 — 实现 holdMs 播放**（插件 + hero 至少各一条链）：修掉 attack「均匀挥一下」与 cat stand_wag「3.2s→1.67s」；这也是唯一能让「非均匀节奏」研究产生用户价值的一步。
2. **P1 — 计时单一来源 + one-shot band + 跨角色嵌入校验策略**：终结「改一个动作要同步 6 处、漏一处就红」的结构性债务，并给 cat stand_wag 这类改动一个合法的落点。
3. **P1 — 处置 cat stand_wag 并发变更（A 回滚保 68 帧不变式，或 B 正式允许 per-character timing）并把 >1.5s 长动作移出随机池**；顺手修 human blink 末帧（P2 但只改一个参数）。

---

## 4. 风险与未决

| # | 风险 | 影响 | 缓解 |
|---:|---|---|---|
| 1 | **并发写**：cat 资产/behavior/regions、`dsh-famling/client.js` 正在被其他任务修改（快照 23:40 有 34 个脏文件；cat manifest 23:32、client.js 23:27） | 本文行号/像素差/红绿结论会漂移；合并后可能又有新的计时变更 | 合并后按附录 C 复跑；计时相关改动一律走 §3.3 的清单；本文数字标注为快照 |
| 2 | **测试盲区**：`tests/*` 验证的是 `timeline.ts` 数学与 GIF 预览，不验证 hero/插件真实播放 | 测试全绿 ≠ 屏幕正确（本次审计核心发现） | P0 增加「渲染器 holdMs 一致性」测试（采样帧起始时间） |
| 3 | **每角色计时不变式**：一旦允许 per-character timing（§2.10 B），scheduler/交互冷却/ambient 窗口/插件嵌入/跨角色测试全部要适配 | 隐性回归 | 先定契约（哪些字段可 per-character：frames/fps/holdMs/duration；哪些必须同构：clip id/顺序/layer/bubble/voice） |
| 4 | **长动作 × 宏观节奏**：3.2s 长动作进入 4-10s ambient / 10-22s roll / 11-20s 插件间隔 | 桌宠持续忙、打扰 | 随机池按 duration 过滤（≤1.5s）；长动作只给显式触发 |
| 5 | **attack 无入口 × 高研究投入** | 研究/测试成本沉没 | 要么接「连续戳/护食/玩闹」外部事件并播放，要么在文档里标记 spec-only，停止继续调参 |
| 6 | **WCAG 2.2.2**：无限 idle 循环 + 定时眨眼 >5s 自动播放〔S3〕 | 无障碍/合规风险 | 提供 motion 开关/reduced-motion（插件已有 settings.motion；app 侧缺口，UX 稿 P1）〔L6〕 |
| 7 | **「12fps 全局化」误读** | 把 idle 改忙、attack 改平，抵消已有设计 | 本文 §1.1 / §3.2 明确语义；评审时把「12 是基准不是统一时钟」写进 checklist |
| 8 | **holdMs 单位/语义漂移**：`holdMs` 是每帧停留 ms，`fps` 仍是非均匀 clip 的近似基率 | 新实现容易把 holdMs 当 offset 或累计起点 | 在 clip 规范里写死：`duration = sum(holdMs)`、`fps` 仅供旧渲染器近似、`frameIndexAt()` 为唯一权威实现 |

**未决**：

- cat stand_wag 选 A 还是 B（依赖产品对「长伸展」的价值判断 + 是否接受 per-character timing）；
- attack 是否要接入口（以及接在哪：连续点击 / 喂食竞争 / 玩闹）；
- idle 是否要更慢/更静（依赖用户反馈与 continuous breathe 层的排期）；
- walk 是接上（拖拽跟随/菜单散步）还是删掉（从 tracks/manifest 去掉以省校验/嵌入成本）。

---

## 5. 附录

### 附录 A：attack 时间线与帧起始时刻

```
frame:    0     1     2     3     4     5     6
holdMs:  83    83    63    42    42    63    63
startMs:  0    83   166   229   271   313   376   (end 439)
localFps:12.05 12.05 15.87 23.81 23.81 15.87 15.87
effective fps = 7 / 0.439 = 15.95
```

### 附录 B：像素差测量方法（可复现）

对每个 clip 的相邻帧（以及循环 clip 的 last→first）转 RGBA 数组，统计 `any(a != b, axis=2)` 的像素数（含 alpha 变化），再除以该帧的 holdMs 得到「每毫秒变化像素」的粗速度。脚本思路（只读，不写产品文件）：

```python
# 相邻帧变化像素数；循环另测 seam = changed(last, first)
def changed(a, b): return int(np.any(a != b, axis=2).sum())
# attack/stand_wag 用 holdMs 归一化：changed[i] / holdMs[i]
```

注意事项：像素差受「高频纹理 + 1px 平移」放大（猫的卷毛会使 1px 身体位移产生大量变化像素），所以它只用于「同一角色/同一 clip 内部相邻段落的相对比较」，不跨角色直接比绝对值。

### 附录 C：复现清单（合并后请重跑）

1. 计时一致性：解析三份 `manifest.json`，比对 12 clip 的 frames/fps/loop/holdMs；`parity` 应为 true（脚本见本文审计过程，仅读）。
2. 磁盘帧：每 clip 目录 PNG 数 == manifest.frames；基线每角色 68（cat 工作区若保留长 stand_wag 则 72）。
3. 插件嵌入：`node scripts/embed-anims.mjs --check`（当前红：cat stand_wag；同步后应绿）。
4. 测试：`npm test`（`desktop-games`，`node --import tsx --test tests/*.test.ts`）；重点 `tests/pet-anim.test.ts`、`pet-anim-cat.test.ts`、`pet-anim-human.test.ts`。
5. 循环接缝/眨眼对齐：附录 B 的像素差脚本（dog 眨眼末帧 vs idle_00 应 ≤ ~30px；human 修复后应 ≤ ~30px）。
6. 真实播放：`dsh-famling` QA 页逐帧截图打时间戳，确认 attack 每帧停留 = 83/83/63/42/42/63/63ms；hero 用 `actorFrame()` 采样 hold 边界。

### 附录 D：引用来源

> 检索/直读日期：2026-11-18。带「〔公开-弱〕」的条目只拿到检索摘要或正文被 Cloudflare/网络阻断，引用时已标注；这些只用于「社区惯例/方向」的旁证，不作为硬标准。

**官方/标准/同行评审**

- 〔S1〕Aseprite Docs — Frame Duration（逐帧时长，Frame > Frame Properties）：https://aseprite.org/docs/frame-duration/
- 〔S2〕Godot Docs — SpriteFrames（每帧相对 duration，duration 2.0 = 两倍时长）：https://docs.godotengine.org/en/4.0/classes/class_spriteframes.html
- 〔S3〕W3C WAI — WCAG 2.2.2 Pause, Stop, Hide（>5s 自动移动/闪烁需可暂停）：https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- 〔S4〕MDN — prefers-reduced-motion：https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- 〔S5〕Eyelid Movements: Behavioral Studies of Blinking in Humans（J Neurophysiol, 2003；自发眨眼总 334±67ms、闭 92±17ms、睁 242±55ms）：https://journals.physiology.org/doi/full/10.1152/jn.00557.2002
- 〔S6〕BioNumbers BNID 110801 — 视觉简单反应 180–200ms（引 Kosinski 综述）：https://bionumbers.hms.harvard.edu/bionumber.aspx?id=110801
- 〔S18〕An Evaluation Research on Dynamic Hit Stop Using Eye Gaze（SCITEPRESS 2024；hit stop 与打击感）：https://www.scitepress.org/Papers/2024/124614/124614.pdf

**行业/教育/社区实践（经验值，非标准）**

- 〔S7〕Adafruit Learn — Sprite Animation Fundamentals（电影 12–24 张/秒；游戏精灵远少；引 Richard Williams）：https://learn.adafruit.com/makecode-arcade-pixel-animation/sprite-animation-fundamentals
- 〔S8〕NSW Department of Education — Animation（24fps 标准；拍二=12fps）：https://education.nsw.gov.au/content/dam/main-education/documents/teaching-and-learning/curriculum/creative-arts/visual-arts-7-10-mip-animation.pdf
- 〔S9〕Slynyrd — Pixelblog 50: Human Walk Cycle（60fps 72 帧降到 8 关键帧；「8 帧是经济与流畅的平衡」）：https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle
- 〔S10〕with-pebbly/aseprite-ai-artist — rules/05-animation.md（idle 2–4f 200–400ms/帧；walk 4–8f 100–150ms；run 6–8f 60–100ms；attack strike 40–60ms、hold 150–250ms）：https://github.com/with-pebbly/aseprite-ai-artist/blob/main/rules/05-animation.md
- 〔S11〕with-pebbly/aseprite-ai-artist — rules/40-timing-and-spacing.md（read-hold ≥170ms、accent ≥83ms、hold 42–400ms、每帧时长优先于帧数、循环至少两种时长、never time one object on two clocks）：https://github.com/with-pebbly/aseprite-ai-artist/blob/main/rules/40-timing-and-spacing.md
- 〔S12〕claude-dev-suite — gamedev/2d-art/animation-frames/SKILL.md（帧数/fps/时长惯例表；anticipation/impact/recovery；可变逐帧时长示例）：https://github.com/claude-dev-suite/claude-dev-suite/blob/c9145f88f077e4fb279e8c8632f62e73af8c6a0d/skills/gamedev/2d-art/animation-frames/SKILL.md
- 〔S13〕Divoom Blog — Pixel Art Animation FPS: 8fps vs 12fps vs 24fps（「12 FPS 是共识默认/甜点区」；〔公开-弱〕正文未直读，仅检索摘要）：https://divoom.com/blogs/setup-ideas/pixel-art-animation-frame-rate
- 〔S14〕Unity Discussions — What frames per second for smooth pixel art animation?（多数动画拍二/12fps；60fps 游戏 + 12fps 动画；Skullgirls 故意非常数帧率）：https://discussions.unity.com/t/what-frames-per-second-for-smooth-pixel-art-animation/688291/5
- 〔S15〕DashFight — Fighting Games Essentials: Frame Data（startup/active/recovery）：https://dashfight.com/news/fighting-games-essentials-frame-data-3156
- 〔S16〕TheGamer — How To Read Frame Data In Fighting Games：https://www.thegamer.com/fighting-games-frame-data-explained/
- 〔S17〕raduacg/game-mechanics-optimizations — G_05_screen_effects.md（hit stop：1–10 帧；轻击 2–3 帧/33–50ms；重击 5–8 帧/83–133ms；DMC5/Hades 实例）：https://github.com/raduacg/game-mechanics-optimizations/blob/b0906bc9560ea057d32ac6ad86f016e3712bf477/G_05_screen_effects.md
- 〔S19〕Whitaker/Halas/Sito — Timing for Animation: Getting into and Out of Holds（hold 与 cushion in/out；〔公开-弱〕仅检索摘要）：https://www.taylorfrancis.com/chapters/mono/10.1201/9781003139706-31/getting-holds-harold-whitaker-john-halas-tom-sito
- 〔S20〕uxnan（桌面宠项目）— docs/pets.md（逐帧时长而非 fps；idle 呼吸 6.6s；同帧 8fps 平铺会 frantic；单帧 hold >~200ms 从姿势变停顿）：https://github.com/luisgamas/uxnan/blob/main/uxnandesktop/docs/pets.md
- 〔S21〕Animation Mentor — Why All Animators Need to Master the Moving Hold（moving hold 定义；〔公开-弱〕正文被 Cloudflare 拦截，仅检索摘要）：https://www.animationmentor.com/blog/why-all-animators-need-to-master-the-moving-hold/
- 〔S22〕Wikipedia — Twelve basic principles of animation / Limited animation（有限动画与拍二/拍三；网络直读受阻，引用 URL 供复核）：https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation · https://en.wikipedia.org/wiki/Limited_animation

**本仓库依据（本地）**

- 〔L1〕`docs/design/PET-ANIMATION-2026-11-18.md`（12 clip 表、attack holdMs 语义、调度器参数、hero 只均匀采样等）；
- 〔L2〕`docs/design/CAT-SELKIRK-2026-11-18.md`；〔L3〕`docs/design/HUMAN-TINGLAN-2026-11-18.md`（12 clip 与 fps 同构声明）；
- 〔L4〕`docs/research/ANIMATION-FRAME-TIERS.md`（10/12/15fps 与 60Hz 整除、hold 可拉长 50–200%）；
- 〔L5〕`docs/research/PIXEL-ACTION-ANIMATION-PIPELINE-2026-11-17.md`（1/fps ≥66ms、10/12/15 优先）；
- 〔L6〕`docs/research/PET-UX-PSYCHOLOGY-2026-11-18.md`（宏观节奏、调度器未接 hero、WCAG/reduced-motion）；
- 〔L7〕`docs/research/PET-INTERACTION-CONTENT-2026-11-18.md`（微动作 12–30s、点击冷却、12 clip 语义映射）；
- 代码（本次直读）：`src/pet/anim/clips.ts`、`timeline.ts`、`types.ts`、`manifest.ts`、`idle.ts`；`src/pet/hero.ts`（`frameIndexFor`）；`src/pet/scene/runtime.ts`（`transientDuration`）；`public/assets/pet/anim/*/manifest.json`；`scripts/gen-pet-anim-frames.py`、`gen-cat-anim.py`、`gen-human-anim.py`、`cat_selkirk.py`、`human_tinglan.py`；`public/characters/*/{behavior,regions}.json`；`tests/pet-anim*.test.ts`；`plugins/dsh-famling/client.js`、`scripts/embed-anims.mjs`。

---

### 附录 E：一句话版本

**数据和区间都不用大改；要改的是「把 holdMs 真的播出来」「把计时收敛成一条链」「决定 cat 的长伸展怎么落」；`attack` 本体是合格的，但它目前既播不对、也没入口。**

（完）
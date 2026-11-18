# Pet 页 hero 渲染接线（Phase 2 落地说明）

- 日期：2026-11-14（+08）
- 范围：把已落地的 FCI 0.1 角色层（`src/pet/character/`）、渲染抽象（`src/pet/render/`）、多对象场景（`src/pet/scene/`）与 `hero.ts` 像素渲染接进 `pet.html` / `src/pet/main.ts`。
- 边界：kernel / 存档 / 语音 / `pet.fold` micro / 480·960 场景 / Tauri flags / E2E 脚本 **零改动**；默认关闭，失败单向回退旧折角 DOM。
- 设计依据：[docs/research/PET-INTERACTION-LAYER-PLAN.md](research/PET-INTERACTION-LAYER-PLAN.md)。
- **更新 2026-11-18**：dog 默认渲染器切到 **v7 金毛动画包** `/assets/pet/anim/dog/`（96×96、12 tags / 68 帧，anchor/footBox 不变）；`behavior.json` 把 `rub→pat_head`、`play→stand_wag`、`bark/nudge/drag/land/sleep→idle`，新增 `ball_throw/ball_chase/pat_head/paw_face/scratch/stand_wag/chase_tail/idle_blink/attack` 状态与 4–10s ambient 微动作；`resolveHeroConfig()` 新增持久角色 `desktop-games/pet/heroCharacter`（无合法 `?character=` 时生效）；桌面菜单新增 hero「摸头（hero）/抛球/追球」与「渲染器：金毛（动画）/折纸（默认）」。详见 [PET-DOG-ANIM-V7-2026-11-18.md](PET-DOG-ANIM-V7-2026-11-18.md)。
- **更新 2026-11-17**：角色画布 **0.2/0.3 = 64..1024（16 的倍数）**，**0.1/legacy pack 保留旧的 16..512 整数**（0.1 被拒是兼容性破坏，已修：<64 或非 16 倍数只给 `CANVAS_LEGACY` warning，见 `character/validate.ts` + `hero.ts`）；显示缩放从 1×/2× 扩展为整数/整数倒数 `4/2/1/0.5/0.25/0.125`，Render API 因此升到 **1.3** 并加 `capabilities.reciprocalScale`；`humanoid-default` 新增 `canvasTarget: [256,256]`（占位 pack 仍 96×96，照常渲染）。另修：`planHeroLayout` 缺一个维度时不再回退 96；DPR（1/1.5/2）按 `round(layout*dpr)` 建背板 + `ctx.setTransform`；desktop 壳 `#hero-stage` 不再被 `--pet-scale` 二次缩放；Tauri 默认窗口改为 **480×336 透明置顶 pet 窗**。改动文件：`src/pet/pixel-scale.ts`（新）、`hero.ts`、`render/{types,index,hero-backend,registry}.ts`、`hero-runtime.ts`、`scene/{types,validate,runtime,layout}.ts`、`character/{types,validate}.ts`、`main.ts`、`pet.css`、`desktop-shell.ts`、humanoid `character.json`、FCI 三份 schema、`app/tauri/src-tauri/{tauri.conf.json,src/main.rs,capabilities/default.json}`、`docs/modding/*`、新增/更新测试 `tests/{canvas-scale,desktop-shell,pet-desktop-layout,tauri-pet-window}.test.ts`。

## 1. 一句话

`?hero=1`（或持久 opt-in）时，在 `.book` 里的 `.hero-stage > canvas` 上用 `SceneRuntime` + `RendererRegistry/HeroRenderBackend` 画默认角色（人型/猫/狗，可多 actor）；flag 关、加载/校验/首帧失败时一切保持旧折角 DOM，`window.__pet.hero` 记录原因，**不写存档、不改语音、不写 localStorage**。

## 2. 如何开 / 关（手动看）

```bash
cd desktop-games
npm run dev        # http://127.0.0.1:5173/pet.html
```

| 目的 | 做法 |
|---|---|
| 临时开 hero（人型 Pearl 占位） | `http://127.0.0.1:5173/pet.html?hero=1` |
| 开 + 换猫 / 狗 | `?hero=1&character=cat` / `?hero=1&character=dog` |
| 多 actor 同屏 | `?hero=1&actors=humanoid,cat`（最多 4 个，左右布局） |
| 强制显示缩放（QA/演示，默认按窗口自适应） | `?hero=1&heroScale=2`（可选 `4/2/1/0.5/0.25/0.125`） |
| 强制回旧 DOM（压过持久 opt-in） | `?hero=0` |
| 持久 opt-in（本机开发/QA） | 控制台 `localStorage.setItem('desktop-games/pet/hero','1')` 后刷新；清掉即关 |
| 浏览器降级（无 Tauri 时默认） | 加 `?browser-fallback`（旧逻辑，与 hero 无关） |

- 显示缩放 = “能放进实测 `.book` 的最大整数/整数倒数”。**先分清两种壳的 `.book`**：
  - `?shell=window`（开发/E2E、浏览器默认布局）：header+aside 都显示，480×240 的 `.book`≈300×187、480×272≈300×227、480×336≈300×291。96 占位：480×240 **1×（96px）**、480×272 **2×（192px）**；256 目标在 480×336 **1×（256px）**；512/1024 在 480×240 回退 1/4、1/8（128px）。
  - desktop 壳（Tauri pet 窗默认；header/aside `display:none`）：`.book` = 整个窗口。480×336 时 96→2×（192px）、128→2×（256px）、**256→1×（256px，产品锁 1:1）**；480×240 时 96→2×、128→1×、256→0.5×（128px），都不裁切、水平/底部居中。
- 多 actor 一起 fit（2 个 96px 在 480 宽 `.book` 仍 1×；2 个 256 在 480×336 为 0.5×）。
- 画布范围（**按 FCI 版本区分**）：0.2/0.3 = 64..1024 art px、16 的倍数；0.1/legacy pack = 旧的任意整数 16..512（48/100 也合法，运行时给 `CANVAS_LEGACY` warning）。占位 96 与新目标 256 在两种策略下都合法。
- 切换角色/参数后如果前一次已经加载失败，刷新页面重试（回退是单向的，不会在同一次会话内重试，避免掩盖真实错误）。

## 3. Feature flag 解析

`resolveHeroConfig({ search, storage })`（`src/pet/hero-runtime.ts`，纯函数）优先级：

| 顺序 | 输入 | 结果 `enabled` / `reason` |
|---|---|---|
| 1 | `?hero=0` | `false` / `query-off`（压过 localStorage） |
| 2 | `?hero=1` | `true` / `query-on`（一次性，不落盘） |
| 3 | `localStorage['desktop-games/pet/hero'] === '1'` | `true` / `stored-on` |
| 4 | 默认 | `false` / `default` |

- 只 **读** localStorage：本模块的 storage 接口没有写入方法，flag 不进存档、不改 schema。
- storage 取值抛异常（隐私模式/opaque origin）时按“未 opt-in”处理，页面不崩。
- `?character=humanoid|cat|dog` 映射到 `public/characters/{humanoid-default,pet-cat,pet-dog}/`；未知值回退 `humanoid`。
- `?actors=` 逗号分隔 → 去重、忽略未知、上限 4；缺省为 `[character]`。

## 4. 改动文件

| 文件 | 类型 | 内容 |
|---|---|---|
| `src/pet/hero-runtime.ts` | 新增（约 900 行） | 全部可测试接线：flag 解析、`loadHeroBundle()`、`planHeroLayout/pickHeroScale`、`HeroRuntime`（事件/动画/多 actor/口型包络/QA 快照）、`startHeroRuntime()`（加载→backend→首帧 gate）、`heroStatus()` |
| `tests/hero-runtime.test.ts` | 新增 | 16 项 Node 测试，见 §10 |
| `pet.html` | 改（+3 行） | `.book` 内 `#pet` 之后插入 `<div id="hero-stage" class="hero-stage" hidden><canvas id="hero-canvas"></canvas></div>`；`#pet`/`#bubble`/所有按钮 id 原样保留 |
| `src/pet/pet.css` | 改（只追加） | `.hero-stage[hidden]{display:none}`；`html[data-pet-render="hero"]` 下 `#pet{visibility:hidden}`、stage `pointer-events:auto`、bubble `pointer-events:none`；`cursor:grab/grabbing`、`touch-action:none` |
| `src/pet/main.ts` | 改（接线，旧逻辑保留） | flag 解析、`say()` 钩子、`doPat/doGive` 事件钩子、指针路由、rAF 循环/可见性暂停、原子切换与回退、`__pet.hero` + `qa.heroSnapshot()` |
| `docs/PET-HERO-INTEGRATION.md` | 新增 | 本文件 |

**未改**：`src/pet/character/**`、`src/pet/render/**`、`src/pet/scene/**`、`src/pet/hero.ts`、kernel/存档/voice/crypto/portable、`pet.fold` micro、480/960 场景、Tauri flags、`scripts/cdp-pet*.mjs` / `e2e-tauri.ps1`。

## 5. 数据流

```
按钮/指针/PTT/启动问候（main.ts，旧 side effects 不变）
        │ doPat()/doGive()/say()
        ▼
HeroRuntime.emit(event) / .speak()          ← cue 调度（talk/remind at-end）
        ▼
SceneRuntime（固定 seed；行为 4Hz：ambient / timeout / after 回落）
        ▼ 每个 actor: {state → profile.states[state].tag}
HeroRuntime.render(ctx, now)
        ├─ tag 变化时记录 tagSince（帧时钟）
        ├─ resolveFallbackTag（缺 tag 走 document.fallback，绝不把未知 tag 交给 backend）
        ├─ actorView(actor, now-tagSince) → RenderBackend.render(ctx, view, now)
        └─ RendererRegistry → heroRendererPlugin → HeroRenderBackend → hero.ts CharacterRenderer
```

- 渲染后端/画布/时钟的唯一 owner 是宿主（`main.ts` 的 rAF + `HeroRuntime`），`hero.ts` 自己的 `play()` rAF 从不启用。
- 角色数据全部是 JSON/图片：`loadCharacter()` 加载 FCI `character.json`+`behavior.json`，再抓 `manifest.json` 经 `validateCharacterPack()` 校验；`missingTags()` 非空直接判加载失败（错误在加载期暴露，而非渲染中途）。

## 6. 事件映射（默认三套角色的数据决定 state/tag）

| 用户动作（入口） | FCI 事件 | 人型 humanoid | 猫 cat / 狗 dog | kernel/语音 |
|---|---|---|---|---|
| 点 canvas 角色 / `#pat` / `#pet` | `pat` | state `pat` → tag `pat`（600ms，cd 3s） | state `rub` → tag `pat`（cd 1.5s / 1.2s） | 原 `doPat()`：bond+2 + `say()`，完全不变 |
| 点 canvas 空白区 | `click` | 无规则 → 忽略（不产生 kernel 副作用） | 同左 | 无 |
| `#give` | `feed`（payload `{item:'paper'}`） | 无规则 → 忽略（say 走 talk cue） | state `play` → tag `pat` | 原 `doGive()` 不变 |
| `#fold` / `#rename` / PTT 各分支 | `talk`（经 `say()` 钩子） | state `talk` → tag `talk` | state `meow`/`bark` → tag `talk` | 原分支不变；PTT 按下另设 expression `listening` |
| 拖动 ≥4px | `drag.start` | state `drag` → tag `drag`（loop） | 同左 | 仅 `ensureAudio()`；无窗口拖动 |
| 松手 | `drag.end` → `land` | `drag.end`: `land`；`land` → tag `land`（333ms）→ idle | 猫无 `drag.end` 规则，`land` 后 tag `land` → idle | 无 |
| 指针进入/离开 canvas | `hover` / `leave` | 默认数据无规则 → 忽略（为未来角色数据留事件） | 同左 | 无 |
| 夜间（23:00–06:00） | `sleep` | tag `sleep`（loop） | tag `sleep` | 不改 PetState；白天 `wake` → idle |
| 空闲 | SceneRuntime ambient（8–15s 人型 / 5–12s 猫 / 4–10s 狗） | idle/talk | idle/play/sleep | 无台词 |

- `pat`→**state** 人型 `pat`、猫狗 `rub`，但两套 pack 的**tag 都叫 `pat`**：测试同时锁 state 与 tag，避免把数据差异硬编码进控制器。
- 拖动不调用 Tauri `startDragging`：canvas 不设 `data-tauri-drag-region`，窗口拖动仍只在 header；角色只做 `.hero-stage canvas` 的本地 `transform` 跟手，松手归位（不落盘、刷新回中）。
- 只有单 actor 时，点击 canvas 任意位置 = 点该 actor（AABB，不做 alpha 命中）；多 actor 按左右 slot 的 AABB 选目标（`hero.hitActor`）。

## 7. cue 调度（在控制器层补 `BehaviorRuntime` 缺的 after/interrupt）

`BehaviorRuntime.decide()` 只做规则匹配；一次性回落由 `SceneRuntime.tick()` 的 `timeoutMs > tag 时长 > oneShotMs` 完成（我们把 pack 的 `tags` 补进 FCI document，所以 600ms `pat`、333ms `land/talk` 用的是真实帧时长）。控制器额外做 **at-end 排队**：

- `talk` / `remind` 是 at-end cue：当前 actor 的一次性动作（`after`/`timeoutMs` 未结束，如 `pat`/`land`）还在播放时 **入队**，不打断；`SceneRuntime` 回到 idle 的同一 tick 里 flush。
- 队列每 actor 最多 1 条（后来的替换），超过 3s 丢弃，避免隐藏窗口回来后补播过期台词。
- `drag.start`/`land`/`pat` 立即生效（数据侧 priority 100/90/50）；`drag` 是 loop，只在 `drag.end` 结束。
- 失败的兜底：`renderableTag()` 依次尝试 当前 tag → `document.fallback[tag]`（最多 3 层）→ `idle` → pack 首个 tag；pack 无任何 tag 时抛错 → 主循环回退 DOM。**未知 tag 永远不会进 `HeroRenderBackend`**（那会抛 `RenderBackendError`）。

## 8. 尺寸 / 布局

`planHeroLayout()` / `pickHeroScale()` 纯函数（2026-11-17 起支持 64..1024 canvas + 0.1 legacy 16..512）：

- 画布：0.2/0.3 每边 64..1024 且为 16 的倍数；0.1/legacy pack 接受 16..512 整数。`humanoid-default` 的 `canvasTarget:[256,256]` 只代表“新美术目标”；布局/渲染始终用实际 pack 的 `canvas`（当前占位 96×96），所以占位包不会坏。
- 显示缩放 candidates（从大到小）：`4, 2, 1, 0.5, 0.25, 0.125`；取第一个满足 `artW*scale*actorCount ≤ bookW` 且 `artH*scale + 18 ≤ bookH` 的值，全都不满足时回退候选里最小的（1/8）。legacy canvas 只从「乘/除后仍为整数」的 candidates 里选（如 100px 不含 1/8）。`forceScale` 溢出/非整数仍显式报错。
- 实测示例（`.book` 为 1× CSS px）：window 壳 480×240（≈300×187）：96→1×、512→1/4=128px、1024→1/8=128px；480×272（≈300×227）：96→2×；480×336（≈300×291）：256→1×=256px、1024→1/4=256px。desktop 壳 480×336（`.book`=480×336）：96→2×、128→2×、256→1×、512→0.5×（256px）、1024→0.25×（256px）。
- **缺数组回退**：`artHeights` 为空时按 `artWidths` 逐项补（反之亦然），不再用 96 占位；两者都空才用 96 默认（直接调用者的旧契约）。
- canvas 背板 = `pack.canvas * displayScale`（必为整数）再乘 DPR：`canvas.width/height = round(layout*dpr)`，CSS 尺寸 = layout（CSS px），`ctx.setTransform(dpr,0,0,dpr,0,0)`；`startHeroRuntime({dpr})` 默认 1，`main.ts` 传 `window.devicePixelRatio`。`imageSmoothingEnabled=false`。指针/hitTest 坐标始终是 CSS 像素；`--pet-scale` **不再作用于 `#hero-stage`**（只缩放遗留 `.fold-pet`），所以 hero 显示尺寸 = layout，不再二次放大/裁切；`getBoundingClientRect` 比例折算仅作浏览器缩放/未来 CSS transform 的保险。
- 视觉切换是原子的：先 `backend.load` + 首帧 `render()` 成功，再 `stage.hidden=false` + `html[data-pet-render="hero"]`；失败路径 stage 始终 `hidden`。
- `#pet` 只 `visibility:hidden`（保留 rect/布局）——`cdp-pet-layout.mjs` 的 `#pet` rect 断言在两种模式下都成立；`#pet` 隐藏后不再接收指针，canvas 接管。

## 9. 语音 / 表情 / 口型

- `say()` 的 `showBubble` / `voice.speak` / `playClipAudio` / `#pet.talking` DOM 嘴动画 **全部保留**，仅在 `showBubble` 后多调一次 `hero.speak({text,emotion,durationMs})`。
- `hero.speak()`：记录 expression（`happy→pleased`、`PTT→listening`、`sleepy` 优先）与 0..1 确定性口型包络（3.3Hz 三角波），并在 `__pet.qa.heroSnapshot().mouth` 暴露 `{level,ticks,active}`；同时发 `talk` cue（at-end 规则见 §7）作为**当前唯一可见的说话动作**。
- **限制**：`hero.ts` 的 `setExpression`/`setMouth` 至今只存字段、不绘制像素。本阶段不伪造 DOM/CSS 表情覆盖层（会破坏像素风格与 Look Test 判据）；真实表情/口型等 pack v1.1 表达层或 Phase 1a/1b 美术。
- `#mute`、PTT、ASR 关键词分流、语音配额/缓存：零改动。

## 10. 回退（单向，本次会话不重试）

`startHeroRuntime()` 在以下任一环节失败即返回 `{ok:false, reason}`：

| 阶段 | reason 前缀 |
|---|---|
| flag 关（不会进入加载） | `flag-off` |
| 角色 JSON / behavior / pack manifest 抓取/校验失败、`missingTags` 非空 | `load-failed: …` |
| 布局非法 | `layout-failed: …` |
| `registry.create()` / `backend.load()` 失败 | `pack-load-failed: …` |
| 首帧 `render()` 失败（含 pack 缺 tag 等） | `first-frame-failed: …` |
| main.ts 未预期的异常 | `start-failed: …` |
| 运行中主循环渲染抛错 | `render-failed: …` |

回退动作：`#hero-stage` 保持/恢复 `hidden`、移除 `html[data-pet-render]`（旧折角 DOM 立即可见可点）、取消 rAF、`backend.dispose()`、`console.warn`，并把 `window.__pet.hero = {enabled:true, ok:false, reason}` 写清楚。**不写存档、不写 localStorage、不改语音状态**。

## 11. `window.__pet` 兼容

- 旧键全部原样：`state` getter、`render`、`saveNow`、`loadNow`、`say`、`qa.{serialize,restore,exportPortable,importPortable,saveEngine}`。
- 新增（只加不删）：
  - `__pet.hero = {enabled, ok, reason}`（`enabled` = flag 被请求；`ok` = hero 正在画；失败时 `reason` 带前缀）。
  - `__pet.qa.heroSnapshot()` → hero 运行中返回 `{ok, actorCount, canvas, scale, actors[{id,key,state,tag,x,y,scale}], expression, muted, mouth{level,ticks,active}, queued, engine:'scene-runtime'}`；flag 关/DOM 模式返回 `null`。
  - `__pet.qa.heroEmit(event, actorId?)` → 手动/QA 事件注入（也是未来 Pet Brief 的 `remind` 消费入口）；hero 未运行时返回 `null`。
  - DOM QA hooks（hero 成功后设置，回退时删除）：`html[data-hero-canvas="192x192"]`（拟合后的 CSS layout）、`html[data-hero-scale="2"]`（显示倍率）、`html[data-hero-dpr="1.5"]`（canvas 背板/layout 比）。
- E2E 契约：`#pet-app`、`.book`、`aside.panel`、`#pet`、`#pet` rect、所有按钮 id、`#bubble` 文本路径均未改；flag 默认关 → 旧 `cdp-pet*.mjs` / `e2e-tauri.ps1` 路径零差异（本机未跑 Windows Tauri/E2E，见 §13）。

## 12. 代码结构（便于单测/后续替换）

`src/pet/hero-runtime.ts` 的公开面：

| 导出 | 用途 |
|---|---|
| `resolveHeroConfig({search,storage})` | flag/character/actors/scale 纯解析 |
| `heroStatus(config, result|null)` | `__pet.hero` 三字段纯函数 |
| `parseHeroActors`, `HERO_CHARACTER_SOURCES` | 角色 key ↔ `public/characters/*` 目录 |
| `loadHeroBundle(key,{fetcher,resolveBase})` / `loadHeroBundles` | FCI + pack 加载、`missingTags` gate |
| `pickHeroScale` / `planHeroLayout` | 64..1024 canvas、4/2/1/0.5/0.25/0.125 显示缩放、多 actor 布局纯函数 |
| `parseHeroScale` / `DEFAULT_HUMANOID_CANVAS` / `LEGACY_PLACEHOLDER_CANVAS` | `?heroScale=` 解析、人型新美术默认 256、占位 96 |
| `HeroRuntime` | `emit/broadcast/tick/render/actorFrame/hitActor/speak/setNight/snapshot/dispose` |
| `startHeroRuntime(options)` | 加载→backend→首帧 gate；`dpr`（默认 1）决定背板 `round(layout*dpr)`；返回 `{ok:true,runtime}` 或 `{ok:false,reason}` |

`main.ts` 只负责：解析 flag、准备 canvas/ctx/测量 `.book`、**首帧成功后的原子 DOM 切换**、指针路由、rAF 循环与可见性暂停、失败回退、`__pet` 状态。任何 DOM/浏览器 API 都注入或 `typeof` 保护，所以 Node 测试不需要真实 DOM。

## 13. 测试与验证

新增 `tests/hero-runtime.test.ts`（16 项，`node --import tsx --test`，无浏览器）；2026-11-17 追加 `tests/canvas-scale.test.ts`、`tests/desktop-shell.test.ts`、`tests/pet-desktop-layout.test.ts`、`tests/tauri-pet-window.test.ts`（Tauri 侧为配置/源码静态断言，非实机）：

1. flag：默认关 / `?hero=1` / `?hero=0` 压过 localStorage / localStorage `'1'` / storage 抛异常安全。
2. character + actors 解析：humanoid/cat/dog 映射、未知回退、去重/上限、`?heroScale`。
3. 布局：240→1×、272→2×、多 actor→1×、slot 坐标、96/128 canvas；2026-11-17 另由 `tests/canvas-scale.test.ts` 覆盖 64/96/128/256/512/1024 的校验、fit 布局、缺维度回退（`artWidths:[256], artHeights:[]` → 256×256）、渲染尺寸、DPR 1/1.5/2 与命中；`tests/pet-desktop-layout.test.ts` 静态校验 desktop 壳不二次缩放、透明、480×336/480×240 的 96/128/256 不裁切居中。
4. 默认三角色真实 JSON 加载：FCI id / pack id / packBase / 7 tags / cat `pat→rub`。
5. 加载失败：character 404 → `load-failed` 回退；pack 缺 tag → `missing-tags`（且 backend 未 load）。
6. 启动 gate：flag 关不创建 backend；pack 加载失败/首帧失败 → 对应 reason + `dispose()`。
7. 事件→tag：人型 `pat`→state `pat`/tag `pat`，猫 `pat`→state `rub`/tag `pat`；drag/land/sleep/wake。
8. cue：pat 播放中 `talk` 入队，pat 结束后同 tick flush 为 `talk`，再回 idle；expression/mouth 包络。
9. 帧推进/循环：idle 8fps 0→1→循环回 0；pat 6f 单次播完钳最后一帧；backend 收到 `{tag, elapsedMs}`。
10. 多 actor：`?actors=humanoid,cat` → 192×96 canvas、x=0/96、两 pack load、首帧画两个、AABB 命中。
11. `heroStatus` 三字段形状；夜间启动 `sleep`；runtime 不拥有 rAF、`dispose()` 后不可用。

本机执行结果（2026-11-14，WSL / Node 24.22.1 / Chrome 157 headless）：

```text
npx tsc --noEmit                                        # pass
node --import tsx --test tests/hero-runtime.test.ts     # 16/16 pass
npm test                                                # 215/215 pass（含本文件 16 项）
npm run preflight                                       # 5/5：typecheck+test+validate:content+verify:pack+build
```

构建产物静态检查（`dist/`）：`pet.html` 含 `#hero-stage/#hero-canvas`；`dist/characters/{humanoid-default,pet-cat,pet-dog}/` 与 `dist/assets/pet/*-placeholder/manifest.json` 均被 Vite 复制，经本地静态服务实测全部 HTTP 200（`/pet.html`、`/characters/humanoid-default/character.json`、`/characters/pet-cat/character.json`、`/assets/pet/pearl-placeholder/manifest.json`、`/assets/pet/cat-placeholder/manifest.json`），`pet-*.js` 内含 hero 标记字符串 → 生产 build 不会 404。

**真实浏览器 smoke（Windows Chrome 157 headless + CDP，访问 build 后的 `dist/` 静态服务；不是 Tauri/E2E 脚本）**：

| 用例 | 结果 |
|---|---|
| 默认（无 flag，480×240） | `__pet.hero = {enabled:false, ok:false, reason:'flag-off'}`；无 `data-pet-render`；stage `hidden`；`#pet` visible；`qa.heroSnapshot() === null` |
| `?hero=1`（480×240） | `hero.ok=true`；`data-pet-render="hero"`；stage 显示；`#pet` visibility hidden 但 rect 仍为 104×90；canvas **96×96（1×）**；actor tag `idle` |
| `?hero=1` 后点 canvas 脚部 | `bond` 0→**2**（旧 `doPat` kernel/语音路径生效）；快照 state/tag = `pat`/`pat`；1.4s 后回到 `idle`；气泡为 `lines.pat` 文本 |
| `?hero=1&actors=humanoid,cat`（480×240） | canvas **192×96（1×）**；两个 actor `x=0 / 96`，id `humanoid` / `cat`，同 canvas 渲染 |
| localStorage opt-in（无 query，刷新） | `hero.ok=true`、`reason` 走 `stored-on`、`data-pet-render="hero"` |
| 持久 opt-in + `?hero=0` | `{enabled:false, ok:false, reason:'flag-off'}`；stage hidden；`#pet` visible |
| `?hero=1`（480×272） | canvas **192×192（2×）**，scale 2 |
| 页面异常 | 除既有 `favicon.ico` 404 外无 JS/资源错误 |

> 上表是 2026-11-14 的 96 占位基线（新 fit 算法下这些 96 用例结果不变）；2026-11-17 的画布扩展、DPR 与 desktop 壳修复由 Node/静态测试覆盖（`tests/canvas-scale.test.ts`、`tests/pet-desktop-layout.test.ts`），**未重跑浏览器 smoke**。

> 未跑（本机无 Windows Tauri 运行环境，且按任务约定不跑 E2E）：`e2e-tauri.ps1`、`cdp-pet*.mjs` 实机断言、真实 WebView2 下的拖拽/DPI/透明窗口验证、24h soak。以上浏览器 smoke 用的是 build 产物 + Windows Chrome，不是 WebView2。Tauri 侧只做了 `cargo check --locked --offline` / `cargo clippy` 静态编译与配置/源码静态测试（`tests/tauri-pet-window.test.ts`），透明/置顶/穿透未实机。

## 14. 限制与未做

1. **真实 Tauri 未验证**：拖拽、指针捕获、visibility 暂停、DPR 只在浏览器/Node 层推演；`startDragging` 窗口拖动本轮**不做**（canvas 不设 drag region），角色拖动是本地跟手＋归位。Tauri 默认窗口/入口已改为 `pet.html` 480×336 透明置顶不可缩放（`tauri.conf.json` + `main.rs` pet route + capabilities），但透明/置顶/穿透/DPI **未在 Windows WebView2 实机验证**；点击穿透（`SetWindowRgn`/ignore-cursor 运行时路径）也未实现。
2. **96→256 美术迁移未做**：三套默认 pack 仍是 96×96 占位（`display.scale:2` 只是偏好，运行时按 `.book` 实测覆盖）；humanoid profile 的 `canvasTarget:[256,256]` 只是新美术目标。布局/校验/渲染已支持 64..1024，但 256 真实资产尚未生成。
3. **表情/口型无像素输出**：见 §9；只有 tag 切换 + QA 包络。
4. **多对象只到“同 canvas 多 actor 渲染/布局/事件”**：没有 actor 选中 UI、没有窗口级独立 actor、没有 social/send 交互 outcome、没有场景布局持久化。
5. **AABB 命中**：点击/拖拽选 actor 用 slot AABB；`HeroRenderBackend.hitTest()`（alpha 读回）未在指针路径启用，避免每次 move 整帧重画。
6. **Pet Brief**：消费端接口（`remind` 事件/台词）已通，但生产端（Advisers）未实现，`__pet.brief` 未新增。
7. **窗口尺寸**：Tauri 默认 pet 窗已改为 **480×336**（desktop 壳下 256 人型可 1:1、96 占位 2×）；window 壳 `?shell=window` 仍是 480×240 基线，`--pet-size=480x272` 保留 QA。**480×336 尚未跑浏览器 smoke/实机**。
10. **DPR**：已按任务口径实现（背板 `round(layout*dpr)` + `setTransform`），Windows 125%/150% 下的 N-first 整数设备像素选择（`N=round(Z*DPR)`）尚未实现，属后续；真实 DPR 渲染未在 WebView2 验证。
8. **hero 开关无 UI**：只有 URL 参数 + localStorage，设置页属于后续范围；角色切换 UI 亦未做。
9. **回退单向**：同一次会话内不重试；`?hero=0` 或清 localStorage 后刷新即可回到旧 DOM。

## 15. 回滚

- 运行期（无代码改动）：`?hero=0`，或 `localStorage.removeItem('desktop-games/pet/hero')` 后刷新。
- 代码回滚：删除 `src/pet/hero-runtime.ts`、`tests/hero-runtime.test.ts`、本文件；删 `pet.html` 的 `#hero-stage` 3 行；删 `pet.css` 末尾 hero 规则块；撤 `main.ts` 的 import / flag 常量 / 3 处钩子 / `__pet.hero` 与 `qa.heroSnapshot` / 文件末尾 hero 段落。不涉及 kernel/存档/语音格式，回滚无数据风险。

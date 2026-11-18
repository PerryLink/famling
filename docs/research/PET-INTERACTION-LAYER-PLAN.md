# Pet 页交互/渲染接线设计（Phase 2 gate 内）

- 日期：2026-11-14 21:22（+08）· 角色：只读设计子代理；**本文件是唯一写入**（未改代码、未跑 dev/E2E、未调 API、未做 git）。
- 时点说明：本文件写作期间（21:16–21:18）并发落地了 `src/pet/render/`（958 行，Phase 1 渲染抽象）与 `public/characters/{pet-cat,pet-dog}` + `public/assets/pet/{cat,dog}-placeholder`（各自 7 tags、96²、占位美术）；`hero.ts` 现 381 行（新增 `describeCharacterPack`）。本文件行号以该时点工作区为准，**实现前重新核对**；`main.ts`(683)/`pet.html`(67)/`pet.css`(96) 未变。
- 范围：把 `hero.ts` 渲染 + `src/pet/character` 行为 + `src/pet/render` 渲染抽象接进 `pet.html`/`main.ts`；旧折角 DOM 永久保留为 fallback；多对象只设计。
- Gate：实现需 Phase 2 批准（[HANDOFF §9](../HANDOFF-2026-11-14-PEARL-FAMLING.md):396-401）。
- 相关：[CHARACTER-INTERFACE.md](../CHARACTER-INTERFACE.md) · 研究 [MULTI-CHARACTER-RUNTIME](MULTI-CHARACTER-RUNTIME.md)、[BEHAVIOR-HUMANOID-VS-PET](BEHAVIOR-HUMANOID-VS-PET.md)、[PET-ARCHITECTURE-AUDIT](PET-ARCHITECTURE-AUDIT.md)、[CHARACTER-INTERFACE-SPEC](CHARACTER-INTERFACE-SPEC.md)。

## 0. TL;DR（推荐结论）

1. **flag 默认关**：`?hero=1`（一次性/QA）> `localStorage['desktop-games/pet/hero']==='1'`（持久 opt-in）> 默认折角 DOM；`?hero=0` 强制关。任何加载失败**单向回退** DOM 并记录原因，不写存档。
2. **canvas 放 `.book` 内新增的 `.hero-stage`**（CSS 已预留 `pet.css:77-85`）；`#pet` 只做 `visibility:hidden`（保留 rect，布局 E2E 不破），首帧成功才切换；失败 DOM 原样。
3. **渲染消费已落地的 `src/pet/render`**（`RendererRegistry` + `heroRendererPlugin` + `HeroRenderBackend`，`RENDER_API_VERSION=1`，见 `src/pet/render/types.ts:25-50`）：**host 持有唯一 canvas、时钟与 rAF**，backend 只画；因此多对象天然是“单 canvas 多 actor”，不需要再包一层 `CharacterRenderer`。
4. **行为层用 `src/pet/character`**（`Actor`/`BehaviorRuntime`）；`Scene` 暂不启用（Phase 3 多对象再开）。默认角色已可渲染三个：`humanoid-default`、`pet-cat`、`pet-dog`（均 7 tags，`tests/default-packs.test.ts:299-340`）。
5. **指针**：canvas → actor-local CSS px → `RenderBackend.hitTest()`（当前实现每次会 `renderStill`+`getImageData`，见 `hero-backend.ts:229-252`）→ **Phase 2 只在点击/松手时调用，不逐 pointermove 采样**；hover 指标只做 AABB 光标。**拖角色 = 拖 OS 窗口**（Tauri `startDragging`，失败/浏览器降级 book 内局部移动）；点击（未拖动）= `pat`，沿用 `doPat()`。
6. **语音/字幕/PTT/存档/kernel 全部复用**：只在 `say()` 加 `onSpeech` 钩子；`voice` 模块零改动；`setExpression/setMouth` 在 renderer 内仍是 no-op（`hero.ts` 现 ~300-310 行区间），Phase 2 只建调用链，**不承诺可见表情/口型**。
7. **最大风险**：480×240 下 2×（192px）+18px 底边 > book 估算 187px → 240 只能 1×，2× 需 `--pet-size=480x272`；以及 Tauri 窗口拖拽的 ACL/丢 pointerup。详见 §7。

## 1. 现状：`main.ts` 职责与交互清单

### 1.1 已有事件 → 函数 → 状态 → DOM（行号为 `src/pet/main.ts`）

| 事件/入口 | 行号 | 函数 | 状态/副作用 | DOM |
|---|---|---|---|---|
| `#pet` pointerdown | 185-188 | 匿名 | `ensureAudio()`/resume（音频解锁） | `#pet` |
| `#pet` click | 189 | `doPat` | `patPet` bond+2；`say(lines.pat,'happy')` | `#pet`、`#bubble` |
| `#pat` click | 190 | `doPat` | 同上 | 同上 |
| `#give` click | 191 | `doGive` | `givePaper` paper+1/bond+1；`say(lines.give)` | 同上 |
| `#fold` click | 192 | `doFold` | `paper<=0` 拒绝；`foldPaper` folded+1/bond+3；`say(lines.fold)` | 同上 |
| `#rename` click | 193-199 | `window.prompt`+`renamePet` | name 改；`say(lines.rename)` | `#pet-name` |
| `#talk` pointerdown/up/cancel | 271-276 | `startTalk`/`finishTalk` | PTT：录音 60s 上限 → `transcribeWav` → 关键词分流（251-264 调 `patPet`/`doGive`/`doFold`/`say`） | `#talk`、`#bubble` |
| `#mute` click | 278-282 | `setMuted` | `voice.stop()` | `#mute`、`#bubble` |
| `#save`/`#load` | 420-421 | `saveNow`/`loadNow` | 存档（284-418，DPAPI/WebCrypto/legacy/CRC） | `#bubble` |
| `#voice-cache` | 422-434 | Tauri `voice_cache_clear` | 清语音缓存 | `#bubble` |
| `#vol` input | 438-442 | 匿名 | 音量 localStorage + gain | `#vol` |
| `#memory-book`/改/忘/忘全部/导出/关 | 458-572 | `correctPetMemory`/`forgetPetMemory`/… | 折页簿 | `#memory-screen`/`#memory-list` |
| `#save-export`/`#save-delete`/`#save-import(-file)` | 500-561 | `exportPortable`/`importPortable`/删除 | 口令加密备份/导入覆盖 | `#bubble` |
| `#reset-window` | 574-588 | Tauri 窗口移到右下 | 清 localStorage `window` key | `#bubble` |
| `visibilitychange hidden` | 590-594 | `saveNow` | 立即存档 | — |
| 启动 `loadNow()` | 596-621 | `render()`+`say(问候)`/记忆召回（4h/2day 限制） | `state.lastSeenMs` 更新 | `#bubble`/面板 |
| 30s 定时 | 589 | `saveNow` | 自动存档 | — |
| `header` pointerup / `beforeunload` | 677-683 | `saveWindowPosition`/`restoreWindowPosition` | 窗口位置 localStorage | — |
| **DOM 窗口拖动** | `pet.html:11` | Tauri `data-tauri-drag-region`（原生注入） | 无 JS 事件；仅 header 区域 | `header[data-tauri-drag-region]` |

`render()`（140-161）把状态写到 DOM：`body[data-time]`(142)、`#pet-name/bond/paper/folded`(143-146)、`#schedule`+`#pet[data-phase]`(147-149)、**`#pet.happy`(150)/`.sleepy`(151)**（当前唯一“行为→视觉”通道）、`#mute`(152)、`#memories`(153-160)。`say()`（117-138）是唯一语音/字幕通道：`claims` guard(118)→`showBubble`(119, 82-88)→`#pet.talking` 嘴动画(120-125)→`voice.speak`(131, persona `pagefold`)→`playClipAudio`(132, 102-115)。

### 1.2 当前不存在的交互（grep 实测，main.ts 内）

- 无 `pointermove`/`dragstart`/canvas 指针状态机；**角色不可拖**、无 hover/leave、无右键/contextmenu、无键盘监听（窗口 `focused(false)`，键盘不可靠，不建议加）。
- `main.ts` 不 import `hero.ts`/`character`/`render`；`pet.html` 无 canvas；`.hero-stage` 只有样式（`pet.css:77-85`）。`src/pet/render` 头注释明确“Phase 1 code only, NOT wired into pet.html/main.ts”（`render/index.ts:1-17`）。
- 无说话/思考表情通道：`setExpression/setMouth` 只存字段不绘制（`hero.ts:300-314` 附近 vs `renderFrame` 绘制仅帧）；`hitTest` 每次 `renderStill`+`getImageData` 单点读回（`hero-backend.ts:229-252`）。
- 无 Pet Brief 消费者（`src/presence/*` 只有 projector/service，无 pet 页接线）。

### 1.3 可复用 / 必须替换

| 类别 | 内容 |
|---|---|
| **可复用（不动）** | kernel 纯函数（`src/kernel/pet.ts`）、`saveNow/loadNow`/加解密/portable/claims、`VoiceService` 与 `say()` 主体、PTT/ASR 分流、`showBubble`、折页簿、音量、窗口位置、按钮与 `window.__pet` 形状；`hero.ts` pack 校验/帧数学/`describeCharacterPack`；**`src/pet/render`（Phase 1 渲染抽象已落地、未被页面使用）**；三个默认角色与占位包 |
| **需新增（不改旧路径）** | `src/pet/hero-runtime/{config,geometry,cues,scene,bridge}.ts`、`characters` 静态打包、`brief.ts`、`.hero-stage` DOM/CSS、`__pet.hero` 扩展 |
| **必须替换/双写** | `render()` 的 `happy/sleepy/phase` 语义 → 行为 cue/expression（DOM 保留给 fallback）；`say()` 的 `#pet.talking` → mouth/talk cue 钩子（DOM class 保留）；`#pet` click → 统一指针路由（DOM listener 保留，hero 模式下 `#pet` 不可点） |
| **不能靠现有接口** | `BehaviorRuntime` 的 `after`/`interrupt`/`timeoutMs`/`effects` 只有类型声明（`character/types.ts:31-59`），运行时未实现（`behavior.ts` 只做 `decide`）→ 回落/打断/一次性时长必须由 bridge 的 CueScheduler 补；`render` 层 `hitTest` 无掩码缓存（Phase 2 先不逐 move 调用即可） |

## 2. 集成方案（Phase 2 gate 内）

### 2.1 分层与数据流

```
指针/按钮/PTT/Brief ──> main.ts handlers（现有 kernel 调用不变）
                              │ (1) doPat/doGive/doFold → hero.emit(event)
                              │ (2) say() → hero.onSpeech(text,emotion,durationMs)
                              │ (3) render() → hero.syncFromState(schedule,mood,bond)
                              ▼
                    hero-runtime/bridge.ts
                     ├─ Actor(BehaviorRuntime, public/characters/*) → {state,tag,priority}
                     ├─ CueScheduler（priority/interrupt/一次性回落/缺 tag fallback）
                     ▼
                    hero-runtime/scene.ts（host：唯一 canvas + 场景时钟 + rAF）
                     ├─ RendererRegistry([heroRendererPlugin]) → HeroRenderBackend
                     ├─ registry.create(packRef) / backend.load(packRef)（pack 数据）
                     ├─ 每帧 clear + backend.render(ctx, actorView(actor,elapsedMs), now)
                     └─ backend.hitTest(view, localX, localY)（仅点击/松手）
                              ▼
                     .hero-stage > canvas（DOM 折角 #pet 隐藏但保留）
```

### 2.2 feature flag 与失败回退

| 顺序 | 来源 | 行为 |
|---|---|---|
| 1 | `?hero=0` | 强制 DOM（压过 local 持久） |
| 2 | `?hero=1` | 强制 hero（本会话；不落盘） |
| 3 | `localStorage['desktop-games/pet/hero']==='1'` | 持久 opt-in（未来设置页写；Phase 2 只读） |
| 4 | 默认 | DOM，flag 关 |
| QA | `?heroPack=humanoid\|cat\|dog`（默认 humanoid）、`?heroDrag=local` | 覆盖默认角色 / 强制局部拖拽（E2E 确定性） |

回退（单向、本次会话内不再重试）：`import()` 失败、5s 超时、`character.json`/`behavior.json` 校验失败、pack manifest 404/校验失败、帧图片加载失败、`getContext('2d')` 为 null、`missingTags()` 非空且无 fallback 链、`registry.create/load` 抛 `RenderError`。回退动作：`stage.hidden=true`、`#pet` 恢复 visible、`html[data-pet-render='dom']`、`__pet.hero={mode:'fallback',reason,lastError}`、`console.warn`；**不写存档、不改 localStorage**（避免 E2E 掩盖问题）。回退期间 `#bubble`/按钮照常工作。

### 2.3 canvas 层与 DOM 并存

- `pet.html`：`.book` 内、`#pet` 之后、`#bubble` 之前插入 `<div class="hero-stage" id="hero-stage" hidden><canvas id="hero-canvas"></canvas></div>`（bubble 仍在最后，保持叠在 canvas 上）。
- `pet.css`：`.hero-stage` 沿用 absolute/居中/`bottom:18px`；hero 模式下 `pointer-events:auto`（默认 none）；`html[data-pet-render='hero'] #pet{visibility:hidden}`；同模式 `#bubble{pointer-events:none}`；`#hero-stage[hidden]{display:none}`；stage 设 `z-index:1`（bubble 保持 2）。
- 为什么 `visibility` 不用 `display:none`：`cdp-pet-layout.mjs:45-48` 读 `#pet` rect，保留 rect 不破坏既有布局检查；隐藏后 `#pet` 不接收 pointer 事件，正好让 canvas 接管。
- 成功路径原子切换：backend 加载 + 首帧画完 → `hidden=false` + 隐藏 `#pet`，避免白框/闪烁。DOM 永远保留；`__pet.hero.setMode('dom')` 可在会话内回退（QA/排障）。
- 宿主尺寸：单 actor 时 host canvas CSS 尺寸 = `pack.canvas * scale`（96×scale），`.hero-stage` 底部居中、距底 18px；DPR/背板是 host 的事（`render/types.ts:31-43` 的契约），Phase 2 不引入 DPR 背板（沿用 1×/2× 整数）。

### 2.4 行为运行时接线（`src/pet/character` + `src/pet/render`）

- **默认角色**：`humanoid-default`（`/assets/pet/pearl-placeholder/`，id `pet.pearl.pixel`）、`pet-cat`（`/assets/pet/cat-placeholder/`，`pet.cat.placeholder`）、`pet-dog`（`/assets/pet/dog-placeholder/`，`pet.dog.placeholder`）全部 7 tags、`missingTags` 为空（`tests/default-packs.test.ts:299-340,391-407`）；`pet-default` 为美术 pending 的旧行为档，**不作为 UI 默认**。默认仍 `humanoid`（Pearl 方向），cat/dog 供 QA 与未来角色切换；角色切换 UI 不在 Phase 2。
- **打包方式**：`public/characters/` 在仓库根、不在 `public/`；Vite build 只复制 `public/` 与 import 牵连资源（`vite.config.ts` 实测无 characters 输入）→ 默认角色用**静态 JSON import**（先例 `src/content/aquarium.ts:1`），`src/pet/hero-runtime/characters.ts` 组装 `LoadedCharacter`（`validateCharacterDocument/validateBehaviorProfile`）并给出 `RenderPackRef`。`loadCharacter()` 留给未来社区目录。否则 `dist` 里 `/public/characters/...` 会 404（Phase 2 必须验证 `npm run build` 产物）；pack manifest/frames 在 `public/`，走 locator fetch。
- **Actor**：`new Actor({id:'pet', document, behavior, seed:1})`；`emit(event,{nowMs,bond,briefAvailable?,source})`。人型/cat/dog profile 当前无 guard；bond(0-100) 先传备用。`behavior.state` 只经 `decide` 变更。
- **CueScheduler（bridge 内，纯函数+时钟注入）**：
  - 一次性状态（`tags[tag].loop===false` 或有 `after`）→ 播完 `frames/fps*1000` 后 `decide('idle')` 回落（`after` 优先）；`drag`(loop) 只在 `drag.end/land` 结束。
  - 打断策略（数据外置为表，Phase 2 固定）：`drag.start` 立即(100)；`land` 90；`remind` 80 at-end；`talk` 60 **at-end（不得吃掉 pat）**；`pat/click/interact` 50；ambient/idle 0。`pat` 冷却内的第二次点击：kernel/语音照常，视觉回落 idle（不报错）。
  - 缺 tag：`resolveFallbackTag(tag, pack.tags, document.fallback)` → 否则 `idle`；**永不把未解析 tag 交给 backend**（`hero-backend` 对未知 tag 抛 `RenderBackendError`，`hero-backend.ts:310-319`）。
- **初始态**：`petSchedule()` 的 `sleep` 时段 → idle 后 ambient 进 `sleep` loop；否则 `idle`；`render()` 的 `happy`（bond>=8 或 folded>=2）→ `setExpression('pleased')`；`sleepy` → `sleep` 提示（仅视觉 tag，不改 PetState）。
- **定时**：宿主 rAF 只在 hero 模式开启；`visibilitychange hidden` 停止 rAF（可见恢复）；新增 60s tick（`clock`/`dayNight`）同步昼夜。backend 不拥有 rAF（`render/types.ts:26-30`），所以不会出现“每 actor 一个循环”。

### 2.5 语音/字幕/表情/口型（voice 模块零改动）

- `say(text, emotion)` 保持现状；新增钩子 `hero.onSpeech({text,emotion,durationMs})`：
  - `setExpression(mapEmotion)`：`calm→calm`、`happy→pleased`；当前 `CharacterRenderer` 不绘制表情（只存字段），只建 QA 可见的调用链；
  - `talk` cue（at-end，见 2.4）：播 `talk` tag（占位 4f@12fps）作为**当前唯一可见的说话动作**；
  - `setMouth(level)`：按 `clip.durationMs` 用确定性包络在 rAF 里写 0..1，结束归 0；`playClipAudio` 不暴露 AnalyserNode，Phase 2 不接真实音频包络（可选 Phase 2.5 在 `main.ts` 内加 Analyser，不动 voice）；
  - 字幕/气泡完全不变（E2E 依赖 `#bubble` 文本）。
- 静音：`state.muted` 时 voice 不发声（现有），hero 仍可播 `talk` 视觉；`#mute` 文案不变。
- PTT：`pointerdown` → `setExpression('listening')`（`EXPRESSIONS` 含 `listening`）+ 可选 emit `x-famling/listen.start`；`finishTalk` 现有关键词分流全部保留。
- **不做**：像素级表情/口型 overlay。需要 pack 表达层（Phase 1a/1b 美术）或 pack v1.1 `expressions/mouth` 字段；Phase 2 用 DOM 覆盖层“假表情”会破坏像素风格与 Look Test 判据，明确不做。

### 2.6 Pet Brief 事件（只设计消费者；生产者在 Advisers 侧且未实现）

- 边界：`AdvisersPresenceEvent` → `PresenceProjector`（`src/presence/projector.ts`，已有 quiet hours/dedupe/secrecy/每日预算）→ `PetDirective{kind:'pose'|'bubble'|'pulse', pose, text, tone, ttlMs}`。pet 页**只消费 PetDirective**，不复制策略。
- 新增 `src/pet/hero-runtime/brief.ts`：`applyBrief(directive, hero)` 映射表：

| directive | 行为事件 | 视觉/语音副作用 |
|---|---|---|
| `kind:'bubble'`（brief.ready/commitment.due） | `remind` | 人型 `remind` 600ms / cat/dog `nudge` 700ms；`showBubble(text, ttlMs)`（给 `showBubble` 加可选 ttl，默认 3200 不变） |
| `kind:'pulse', tone:'attention'` | `remind` | 只动作不追加台词（text 可能为空） |
| `kind:'pulse', tone:'success'` | 无（或自定义 `x-famling/brief.done`，默认 profile 无规则→ignored） | `setExpression('pleased')` |
| `kind:'pose'` working/waiting/idle | 自定义 `x-famling/pose`（payload pose） | 默认 profile 无 work 状态→ignored（未来 work tag 再加规则） |

- 注入：`window.__pet.brief(directive)`（手动/未来 host IPC）；**不写 memory/存档、不打日志全文**（隐私：text 只来自固定数值模板）。
- `briefAvailable` context：收到 directive 后 10 分钟内为 true（供 `requiresBrief` 规则）；默认 false，不伪造 Brief。

### 2.7 指针命中与拖拽冲突（关键交互）

- 坐标链：`clientX/Y` → `canvas.getBoundingClientRect()` → 减去 actor 的 x/y → `actor-local CSS px` → `backend.hitTest(view, localX, localY)`（契约见 `render/types.ts:168-175`；hero 实现会先用同一天 `renderStill` 同步 stage 再采样，`hero-backend.ts:229-252`）。单 actor 时 actor x/y=0，直接是 canvas 内坐标。
- **调用预算**：`hitTest` 现在是“整帧重画 + 1px `getImageData`”读回，Phase 2 **只在 tap/click 与 drag 起始判定时调用**，pointermove 不做 alpha（hover 只用 AABB + `cursor`）；若未来要 hover 高亮/多对象精确命中，再在 hero 渲染层加 mask 缓存（可选 S5b，不改 API 语义）。
- 监听挂在 `#hero-stage`（不挂 `.book`，避免面板/气泡误触；bubble 设 `pointer-events:none`）。`pointerdown`：`setPointerCapture` + `ensureAudio()`；`pointermove` 超 4px 才算拖拽；`pointerup` 时位移 <4px 且 <500ms 才算点击。
- **拖角色 vs 拖窗口（推荐）**：Phase 2 单对象语义 = **拖角色就是拖窗口**。拖拽阈值触发后调 Tauri `getCurrentWindow().startDragging()`；结束用 `onMoved` 防抖 200ms → `drag.end`+`land`（拿不到 `onMoved` 时用 400ms 超时兜底）。浏览器模式或 `startDragging` 被拒（ACL 缺失，`capabilities/default.json` 未显式授予 `core:window:allow-start-dragging`，需实机核验）→ 降级为改 actor x/y 在 `.book` 内局部移动并 clamp（不落盘，刷新回中），行为仍 `drag.start→drag→land`。`?heroDrag=local` 强制后者供 E2E。
- **禁止**给 `.book`/canvas 加 `data-tauri-drag-region`（会让整个区域立即变原生拖拽，吞掉 click/pat 与 alpha 命中）；header 现有 drag region 保留（`pet.html:11`；注意 h1/p 子元素是否命中需实机确认）。
- hover/leave：无按键 pointermove 在 AABB 内 → `cursor:grab` 并边沿触发一次 `hover`/`leave`（默认 profile 无规则→不影响状态；为未来角色数据留事件）。右键不绑定（避免与窗口拖动/原生菜单冲突）；键盘不做（窗口 `focused(false)`）。
- 多指/触摸：统一 pointer events；触摸无 hover，tap=pat，拖动同鼠标。

### 2.8 QA / E2E 兼容

- **只加不删**：`window.__pet` 原键全部保留（`state` getter、`render/saveNow/loadNow/say`、`qa.{serialize,restore,exportPortable,importPortable,saveEngine}`，`main.ts:623-640`）；新增 `__pet.hero`：`{mode,reason,packId,scale,tags,actorState,lastDecision,emit(event),hitTest(clientX,clientY),setMode,mouthTicks}`，及 `__pet.brief(directive)`、`__pet.qa.heroSnapshot()`。
- 选择器契约：`#pet-app/.book/aside.panel/#pet`（`cdp-pet-layout.mjs:45-48`）、`#give/#fold/#pat/#voice-cache/#bubble/#memory-book/#memory-list .memory-item`（`cdp-pet.mjs:28-46`）、`e2e-tauri.ps1:88-97` 四条断言全部不动；flag 默认关 → 现有 E2E 零改动必须仍绿。
- hero 专用 E2E（Phase 2 实现时新增，不改旧脚本）：`?hero=1&heroDrag=local` 断言 canvas 可见、`#pet` rect 仍在且不可见、点击脚部 → `bond+2` 且 `lastDecision.tag==='pat'`、drag 序列、`say` 后 `mouthTicks>0`、缺 pack → `mode==='fallback'` 且 `#pet` 可见；`?heroPack=cat|dog` 冒烟（同一套行为映射不同 state/tag）。Tauri 启动需给 `cdp-launch.ps1` 加 query 参数或 CDP 设 localStorage 后 reload。

### 2.9 多对象（只设计，Phase 3 gate；render 层已支持）

- `RenderBackend.render()` 契约本身就是“一个 backend 在 host canvas 上画多个 actor”（`render/types.ts:40-43,148-177`；`HeroRenderBackend` 按 pack 缓存 stage，多 actor 复用，`hero-backend.ts:110-219`）。因此 Phase 3 第一形态 = **单窗口、单 host canvas、单 hero backend、N 个 `RenderableActor`**：
  - z 序：host 按 `actor.z`（缺省 0）升序稳定排序后依次 `render`；同 z 按 id 排序保证确定性。
  - 命中：从 z 高到低逐个 `backend.hitTest(actorView, local)`；点中即选中/摸该 actor；`Scene.broadcast` 只在双方 `abilities.multiObject!==false` 时用；`send` 要求 `capabilities.behaviors` 含 `social`（默认三个 profile 均含）。
  - 拖拽语义切换：多对象时**普通拖 actor = 场景内局部移动**（Phase 3 布局 slot/`pet-scene` 持久化，属存档决策），**窗口拖动 = 仅 header 或 Alt+拖 actor**；单对象 Phase 2 的“拖角色=拖窗口”在 Phase 3 收回。
  - 第一方渲染插件：`RendererRegistry` 只接受 `origin:'first-party'` 的 host code（`render/types.ts:179-234`；`registry.ts:52-78`），Live2D/Spine 作为第一方插件按 format 注册；社区包只传数据。多对象 UI（选中框/换角色）不在 Phase 2。
- 不做的：跨角色 IK/物理/寻路、每 actor 独立窗口（>3 只才考虑，WebView2 +40–80MB/窗为既有研究估算）、actor code。

### 2.10 尺寸约束（480×240 vs 480×272）

- 240：`.book` 高度既有研究估算 ≈187px；2×=192px + `bottom:18px` = 210px → **2× 会裁切**，Phase 2 在 240 用 **1×（96px）**；`display.scale:2`（character.json）只是偏好，运行时按实测 fit 覆盖。
- 272：`@media(min-height:264px)`（`pet.css:65-76`）`book min-height:200px`，估算约 225px → 2× 可放。建议 hero 演示/评审用 `--pet-size=480x272`，**不改默认 480×240**（Tauri 窗口 flags 冻结，需单独审批）。
- `pickScale(bookH, artH) = bookH >= artH*2 + 18 + 4 ? 2 : 1`；`ResizeObserver(book)` 重算并改 host canvas 背板；窗口从 240→272 时热切换不崩。DPR 分数缩放不在 Phase 2 处理（现有 mock 已 1×/2× 验证；DPI 背板是 render 层的独立增量项）。

## 3. 交互事件映射表（用户动作 → 行为事件 → state/tag → 副作用）

默认数据：`public/characters/humanoid-default/behavior.json`、`pet-cat/behavior.json`、`pet-dog/behavior.json`；事件词表见 `CHARACTER-INTERFACE-SPEC.md:178-190`（核心事件只增不改，自定义必须 `x-owner/name`）。实体 tag 三套占位包相同（idle/pat/drag/land/talk/remind/sleep），差异在 state/slot 映射。

| 用户动作（入口） | FCI 事件 | 人型：state/tag | 猫：state/tag | 狗：state/tag | UI/语音副作用 |
|---|---|---|---|---|---|
| 点角色/`#pat`（main:189-190） | `pat` | `pat`/`pat`（600ms，cd 3s） | `rub`/`pat`（cd 1.5s） | `rub`/`pat` | `patPet` bond+2；`say(lines.pat,'happy')`；bubble；fallback 时保留 DOM `.happy` |
| 点角色（文档声明 `click` slot 时优先） | `click` | 无 state→ignored | ignored | ignored | 与 pat 相同副作用；数据侧留扩展 |
| `#give`（main:191） | `interact`（payload `{item:'paper'}`；**建议 S9 加规则**） | 现 JSON ignored；建议→`pat`(45) | 现 ignored；建议→`play`(55) | 现 ignored；建议→`play` | `givePaper` paper+1/bond+1；`say(lines.give)` |
| `#fold`（main:192） | `x-pagefold/fold`（自定义；**建议 S9 加规则**） | ignored；建议→`pat`(55) | ignored | ignored | `foldPaper` folded+1/bond+3；`say(lines.fold)`；DOM `folded>=2` 加 happy → hero `setExpression('pleased')` |
| `#rename`（main:193-199） | 无行为事件（host UI） | 保持当前 tag | 同左 | 同左 | `renamePet`；`say(lines.rename,'happy')` 触发 talk cue |
| PTT 按下（main:271） | `x-famling/listen.start`（可选） | ignored | ignored | ignored | `setExpression('listening')`；bubble「在听……」；录音上限 60s 不变 |
| PTT 松开/ASR（main:230-269） | 按识别分支映射 `pat/interact/x-pagefold/fold/talk` | 同上 | 同上 | 同上 | 现有 `say`/`patPet` 等分支零改动；名字/晚安/你好/可爱 分支只 `say` |
| `#mute`（main:278-282） | 无 | 保持 | 保持 | 保持 | `setMuted`；`voice.stop()`；hero 只记 muted，不停当前 cue |
| hover/leave canvas | `hover`/`leave` | 现 profile ignored | ignored | ignored | `cursor:grab`；为未来角色数据留事件 |
| 按下+移动 >4px | `drag.start`/`drag.move` | `drag`/`drag` loop(100) | 同左 | 同左 | Tauri 拖窗口；失败则 book 内局部移动（不落盘）；`ensureAudio` |
| 松手/窗口停（onMoved 防抖） | `drag.end`→`land` | `land`/`land`(90)→idle | 同左 | 同左 | 落地 333ms 后回 idle；无台词 |
| 启动/回来（main:596-621） | `scene.enter`+`clock` | `idle`（夜间另发 `sleep`） | 同左 | 同左 | 现有问候/记忆召回 `say` 不变；初始 tag 由 `petSchedule` 决定 |
| 60s tick / 跨时段 | `dayNight`/`clock` | night→`sleep` loop；morning→`talk`/idle | night→`sleep`；ambient 5–12s | night→`sleep`；ambient 4–10s | 无台词（`petSchedule` 文案仍写 `#schedule`） |
| 空闲 ambient | `ambientState()` 加权 | 8–15s：idle/talk | 5–12s：idle/play/sleep | 4–10s：idle/play/sleep | 不抢正在进行的一次性 cue（Scheduler 过滤） |
| Pet Brief `bubble`（`__pet.brief`） | `remind` | `remind`/`remind` 600ms | `nudge`/`remind` 700ms（cd 60s） | 同猫 | `showBubble(directive.text, ttlMs)`；不写记忆 |
| Pet Brief `pulse attention` | `remind` | 同左 | 同左 | 同左 | 仅动作，无台词 |
| Pet Brief `pulse success` | 无（custom ignored） | 保持 | 保持 | 保持 | `setExpression('pleased')` |
| Pet Brief `pose` | `x-famling/pose`（ignored 默认） | 保持 | 保持 | 保持 | 无文本；未来 work 状态/标签再扩 |

人型/宠物默认差异（以 JSON 为准，不在 bridge 硬编码）：人型 `speech=voice`、无 needs、`pat→pat`、`remind→remind` 且有语音/字幕；cat/dog `speech=sfx`、`needs=true`（hunger/energy/fun）、`pat→rub`、`feed→play`、`remind→nudge`，靠动作/叫声而非台词；三套 `abilities.multiObject=true`、`death=false`。同一用户动作的**副作用（kernel/语音）完全一致**，差异只在 state/tag 选择与是否发声。

## 4. 逐步改动清单（每步独立可验证；最小回滚）

| 步 | 文件 / 函数·导出 | 内容 | 验证 | 风险 | 回滚 |
|---|---|---|---|---|---|
| S0 | `docs/research/PET-INTERACTION-LAYER-PLAN.md` | 本设计（已完成） | review | 文档漂移（并发改动多） | 删文件 |
| S1 | 新增 `src/pet/hero-runtime/config.ts`：`resolveHeroConfig({search,storage,tauri})` | flag 优先级/回退原因/`heroPack` 白名单；纯函数 | 新 `tests/pet-hero-config.test.ts`；`npm test` 基线 | 存储键名写错→只是不生效 | 删文件 |
| S2 | 新增 `src/pet/hero-runtime/geometry.ts`：`pickScale/fitStage/clientToCanvas` | 坐标/scale 纯逻辑（alpha 交给 backend） | 单测（240/272/边界/无缩放） | 半像素误差 | 删文件 |
| S3 | 新增 `src/pet/hero-runtime/cues.ts`：`resolveCue/priorityOf/shouldPreempt/nextReturn` | 一次性回落/打断/fallback | 单测 + 三默认 profile golden trace（事件序列→tag 序列） | 优先级与手感不符 | 删文件 |
| S4 | 新增 `src/pet/hero-runtime/characters.ts`：静态 JSON import + 校验 + `missingTags` gate + `RenderPackRef` | 默认角色打包（避免 dist 404） | 单测读三 JSON；断言 missingTags 为空、packBase→pack id 一致 | Vite 打包 JSON/路径 | 删文件 |
| S5 | 新增 `src/pet/hero-runtime/scene.ts`：host canvas + rAF + 场景时钟 + `RendererRegistry([heroRendererPlugin])`/backend + render/hitTest/尺寸暂停 | 唯一画布/时钟；**不重写 renderer** | 单测 fake ctx 验证 render 调用序列/暂停；复用 `tests/render-plugin.test.ts` 的 fake canvas | 无浏览器测试→scene 必须薄 | 删文件 |
| S5b（可选） | `src/pet/hero.ts`/`hero-backend.ts` 内部 hitTest mask 缓存 | 仅当需要 hover alpha/多对象高频命中；保持 `hitTest` 语义 | `tests/render-plugin.test.ts` 全绿 + 新缓存单测 | 并发改动冲突（他人正在改 hero.ts） | 单文件回退 |
| S6 | 新增 `src/pet/hero-runtime/bridge.ts`：`HeroBridge`（emit/speech/sync/pointer/brief hooks，依赖注入） | 编排层；Node 可用 fake scene 测 | 单测：pat→tag、talk 不吃 pat、drag→land→idle、缺 tag 不抛 | 双写主流程抖动 | 删文件 |
| S7 | `pet.html`+`pet.css`：只加 `.hero-stage` 标记与 hero-mode 规则 | 无 JS 入口前页面零可见变化 | `cdp-pet-layout.mjs` 480×240/272 无 overflow；截图 diff=0（flag 关） | `visibility`/z-index 影响布局 | 删 2 处标记/样式 |
| S8 | `src/pet/main.ts`：解析 flag→动态 import bridge→在 `doPat/doGive/doFold/say/render/mute/PTT/load` 加钩子→`__pet.hero` 占位→指针路由 | 唯一用户可见步；flag 关路径零改动 | flag 关：`cdp-pet.mjs`/`e2e-tauri.ps1:88-97` 不变；flag 开：新脚本断言 canvas/pat/drag/fallback | E2E 回归；初始化顺序（见 §8） | 删 import+钩子块（或 `?hero=0` 即时回退）；`#pet` 从未移除 |
| S9 | `public/characters/humanoid-default/behavior.json`（新增 `interact`/`x-pagefold/fold` 规则；cat/dog 可选 `interact`）+ `tests/character-interface.test.ts` 补 golden | 让「给纸片/折一下」有数据化视觉反馈 | 单测锁 trace；不改 tags/帧 | 社区包默认行为变更需评审 | 回滚 JSON 两行 |
| S10 | `app/tauri/src-tauri/capabilities/default.json`：仅当采用窗口拖拽时加 `core:window:allow-start-dragging` | 使 canvas 拖拽可移窗 | 实机 Windows 拖窗 + land 断言（需用户批） | ACL/安全面；未授权则拖拽降级 | 删该权限行；`startDragging` catch 已兜底 |
| S11 | 新增 `scripts/cdp-pet-hero.mjs`、`cdp-launch.ps1` 可选 query 参数、`e2e-tauri.ps1` 的 `-Hero` 开关（只加不改） | hero E2E | `?hero=1&heroDrag=local` 全断言；缺 pack fallback | 脚本改动本身脆弱 | 删新脚本/开关 |
| S12 | 构建验证：`npm run build` + 静态服 dist 检查 `/assets/pet/...` 与内置 JSON（非 `public/characters/` URL） | 防生产 404 | 构建产物 CDP 冒烟（实现阶段） | 构建环境依赖 | 无代码回滚 |

**最小回滚**：运行期 `?hero=0`（或清 localStorage 键）立即恢复 DOM，无需改码；代码回滚只需删 S1–S6/S11 新文件、撤 S7 两处标记、撤 S8 钩子块、撤 S9 JSON/S10 权限。**不涉及 kernel/存档/语音格式，回滚无数据风险。**

## 5. 冻结区与必须保留的契约

| 冻结/契约 | 证据 | 本方案态度 |
|---|---|---|
| kernel `PetState`/记忆/调度 | `src/kernel/pet.ts:8-31` | 只读；行为不写 kernel；bond/paper/folded 唯一事实源 |
| 存档（DPAPI/WebCrypto/v2 envelope/legacy/CRC）、crypto/portable | `main.ts:284-418`、`src/pet/{crypto,portable,claims}.ts` | 零改动；hero flag 只进 localStorage 偏好键，不进存档 |
| voice（`VoiceService`/persona/配额/Rust 命令） | `src/voice/service.ts`、`main.ts:41-68,117-138` | 零改动；只在 `main.ts` 的 `say()` 加钩子；persona 仍是 `pagefold`（Pearl 身份改造属 Phase 2+ 决策） |
| `hero.ts` 公开契约（7 方法 + `validateCharacterPack/loadCharacterPack/describeCharacterPack/frameIndexFor`）与 `docs/look-test/hero.bundle.js` | `hero.ts:158-175,207-381`；`package.json:35` | Phase 2 不改公开语义；若加增量（如 mask 缓存）必须保契约并重生成 bundle |
| `src/pet/render` 契约 `RENDER_API_VERSION=1` | `render/types.ts:52-58,148-177,179-234` | 视为新冻结面；Phase 2 只消费，不改契约；插件仅 first-party |
| E2E 选择器与脚本 | `cdp-pet-layout.mjs:45-48`、`cdp-pet.mjs:28-46`、`e2e-tauri.ps1:88-97` | 只加不改；DOM 节点只加不删；`#pet` 用 visibility 不用 display |
| `window.__pet` 形状 | `main.ts:623-640` | 只增键；旧键行为/语义不变；新增 `hero`/`brief` |
| Tauri 窗口 flags/路由/mic 权限 | `main.rs:242-250,338-358,310-319`；capabilities `default.json` | 默认 480×240 不改；hero 用 `--pet-size` 验证；不做透明/置顶/穿透 |
| 480/960 场景、`pet.fold` 32×48 micro | `art/specs/pet.fold.json`、`art/README.md:54` | 不碰 |
| 默认角色/占位包三方锁 | `tests/hero.test.ts`、`tests/default-packs.test.ts` | 不改 spec/manifest/帧；S9 只改 behavior 规则 |

## 6. 测试计划（Phase 2 实现时执行；本文件不跑）

1. **基线**：实现前先 `npm test` + `npm run typecheck`（写作期间并发落地的 `tests/render-plugin.test.ts` 14 项、`tests/default-packs.test.ts` 9 项必须确认全绿；本文件未运行）。
2. **Node 单测**：S1 config 优先级/回退矩阵；S2 坐标/scale 边界；S3 三默认 profile 的 golden trace（`pat/feed/click/drag/start/end/talk/remind/hover` → tag 序列）＋冷却/缺 tag fallback＋talk 不抢 pat；S4 静态 JSON 校验与 pack 映射；S6 bridge 用 fake scene/view 验证指针/语音/brief 副作用不碰 kernel；S5 用 `tests/render-plugin.test.ts` 已有的 fake canvas 验证 render 顺序/时钟/暂停。
3. **构建**：`npm run build` + 静态服 dist，验证 `/assets/pet/*` 与内置角色 JSON 不 404（`public/characters/` 不在 `public/` 是实测风险）。
4. **CDP/DOM（Windows 本机，需批准）**：flag 关跑 `cdp-pet.mjs` 与 `cdp-pet-layout.mjs`（240/272）应零差异；flag 开新增 `cdp-pet-hero.mjs`：canvas 尺寸/可见性、`#pet` rect 保留、点击脚部 bond+2 且 `lastDecision.tag='pat'`、拖动序列（local 模式）、`say` 后 `mouthTicks>0`、缺 pack fallback、`setMode('dom')` 恢复、`heroPack=cat/dog` 冒烟。
5. **E2E**：`e2e-tauri.ps1:88-97` 原样必过；新增 `-Hero` 分支可选跑（只加）。
6. **性能/内存**：flag 关 0 新增 rAF；flag 开隐藏窗停 rAF；5 分钟 smoke 对比 bundle/内存；**不宣称 24h soak 通过**（未跑）。
7. **不做**：像素表情/口型截图判据、多对象性能、真实 5 人 Look Test（外部 Blocked）。

## 7. 风险与待决

1. **尺寸（最高产品风险）**：240 下 2× 放不下 → 1× 偏小；2× 需 272/336 窗口（改 Tauri 默认需审批）。→ 先用 `--pet-size=480x272` 做 hero 评审，默认窗口不动。
2. **窗口拖拽不确定性**：`startDragging` 需 ACL（`capabilities/default.json` 未显式授予，schema 存在该权限）、拖拽中丢 pointerup、`onMoved` 时序 → catch+`heroDrag=local` 降级+超时兜底；必须实机 Windows 验，无 CI 证据前不宣称可用。
3. **并发改动**：`src/pet/render`、`hero.ts`、`public/characters/*` 正在被其他工作流改动（21:16–21:18 落地）→ 实现前先 `ls -la`/读最新契约、先跑测试；本方案**不新增** renderer 包装层，避免与 render 层重复。
4. **行为/视觉 tag 缺口**：三个默认角色已完整；但 `pet-default` 仍是 pending、社区包可能缺 tag → 启动 `missingTags` gate + fallback 链；`hero-backend` 对未知 tag 抛错，桥接层必须先解析。
5. **双动画系统漂移**：DOM class 与 hero cue 两套 → 用 `html[data-pet-render]` 单一模式源；flag 关时 hero 代码不初始化；dom 模式不产生 canvas/rAF。
6. **E2E 契约回归**：任何删 `#pet`/改 `__pet` 键/改按钮 id 都会红 → 只加不删 + flag 默认关 + 双模式跑。
7. **构建 404**：`public/characters/` 不在 `public/`（实测）→ 默认角色静态 import；社区包未来放 `public/characters` 或 pack 目录并走白名单。
8. **性能/内存**：`hitTest` 每次整帧读回 → 只在点击时调用；host rAF 只在 hero 模式且可见时跑；单对象足够，多对象再评估 mask 缓存。
9. **口型/表情承诺**：当前 renderer 不绘制 → Phase 2 文案只承诺“状态/调用链”，像素表情/口型待美术与 pack v1.1（否则是假功能）。
10. **身份不一致**：Pearl 视觉 + Pagefold 文案/persona/存档名仍是现状（voice/kernel 冻结）→ 本方案不解决；默认 hero 角色用 humanoid(Pearl) 还是 pet-cat 属产品决策。
11. **待决**：① 是否把 hero 设默认（本方案默认关）；② 是否批准 S10 ACL 与 272 窗口 demo；③ Pet Brief producer 何时由 Advisers 提供（VERIFY 记录为零命中，桌面侧只做消费者）；④ 多对象槽位/持久化 Phase 3 决策。

## 8. 初始化顺序与边界（实现时最易踩）

1. 模块尾立即解析 flag（纯同步，勿等 pack），`__pet.hero` 先置 `{mode:'loading'|'dom',…}` 占位，保证 QA 可轮询。
2. 若 flag 开：并行 `startHero()`（解析默认角色 JSON → `registry.create/load` pack → 首帧）与现有 `void loadNow()`；bridge 在 scene ready 后挂载；`loadNow().then()` 里的问候 `say()` 若早于挂载，只丢一次视觉 talk（字幕/气泡不受影响），不阻塞。
3. 首帧画完再 `html[data-pet-render='hero']` 原子切换；失败走 §2.2 单向回退。
4. `render()`（main:140-161）保持现有 DOM 写；额外调用 `hero.syncFromState`，hero 未初始化时是 no-op。
5. 所有新钩子必须 `hero?.` 可选调用；flag 关时 hero 模块不加载（动态 import），保证现有 E2E/包体积零影响。

## 9. 证据索引（行号以 2026-11-14 21:22 工作区为准）

- `main.ts`：交互 185-199、PTT 200-276、静音 278-282、存档 284-434、音量 436-442、折页簿 444-572、复位窗 574-588、自动存 589-594、启动 596-622、`__pet` 623-640、窗口位置 643-683。
- `hero.ts`（381 行）：pack 校验 82-157、`describeCharacterPack` 158-175、`CharacterRenderer` 207-381、`play`、expression/mouth no-op、hitTest。
- `src/pet/render/`（958 行，Phase 1 未接线）：`types.ts:25-50`（硬契约）、`types.ts:148-177`（RenderBackend）、`types.ts:179-234`（第一方插件边界）、`registry.ts:52-78,110-184`、`hero-backend.ts:110-219`（多 actor 渲染）、`hero-backend.ts:229-252`（hitTest 读回）。
- `character/`：types 20-135、behavior（decide 96-138；`after/interrupt` 未实现）、scene（Actor/Scene 14-97）、registry（loadCharacter 59-85、resolveFallbackTag 96-112）。
- `pet.html:9-52`（无 canvas，header `data-tauri-drag-region`:11）、`pet.css:77-85`（`.hero-stage` 只有样式）、`vite.config.ts`（无 characters 输入）、`src/content/aquarium.ts:1`（JSON import 先例）。
- 默认角色：`public/characters/{humanoid-default,pet-cat,pet-dog}/{character,behavior}.json`；占位包 `public/assets/pet/{pearl,cat,dog}-placeholder/manifest.json`（均 96²/7 tags/36 帧）；`tests/default-packs.test.ts:299-340,391-407`。
- 契约：`cdp-pet-layout.mjs:45-48`、`cdp-pet.mjs:28-46`、`e2e-tauri.ps1:88-97`、`main.rs:242-250,338-358`。
- 既有研究（勿重复造）：`docs/research/MULTI-CHARACTER-RUNTIME.md`（单窗多 sprite/内存/多窗口）、`BEHAVIOR-HUMANOID-VS-PET.md:174-190`（事件默认表）、`PET-ARCHITECTURE-AUDIT.md`（现状审计，早于 render 层落地）、`CHARACTER-INTERFACE-SPEC.md:178-190`（事件词表）。

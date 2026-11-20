# 桌宠（Pearl / Famling）架构审计 — 接口化与多对象改造前置评估

- **日期/时点**：2026-11-14 20:52–21:20（+08）
- **角色**：只读代码架构审计（未改代码、未调 API、未做 git、未启动 dev server/Tauri 窗口）
- **仓库**：`<private-path>
- **方法**：通读 + 实测命令：`npm test` → **133/133 pass**（36 个 test 文件，1.0s）；`node --import tsx --test tests/hero.test.ts tests/pet.test.ts` → **7/7 pass**。其余为静态阅读，标注「实测/推断」。
- **交付**：本文件（唯一写入）；摘要见文末 §14。

> ⚠️ **审计时点的新事实（晚于多数交接文档）**
> `docs/PEARL-ART-PRODUCTION-STRATEGY-2026-11-14.md` §8（:116-123）记录用户 **2026-11-14 20:06** 拍板「**128×128 生成一版**」；§9（:125-130）128 v1（20:09）；`docs/PEARL-HERO-AI-DRAFT-LOG-2026-11-14.md` §10（:107-114）128 v3（20:37）。
> 但仓库**被跟踪**的合同仍是 **96×96**：`art/specs/pet.pearl.pixel.json`、`public/assets/pet/pearl-placeholder/manifest.json`、`art/assets.csv`、`tests/hero.test.ts:44,61-62`。128 的 spec/mock/manifest/帧只存在于 **gitignored** 的 `art/_placeholder/refs/ai-drafts/pack-128*` 与 `…/mock-480x336.html`（`.gitignore:24`）。→ 本审计把「96→128 契约迁移」列为**已拍板、未落地**的前置项（§8 步骤 8，Phase 2 gate）。

---

## 1. 现状表（文件 → 职责 → 实测状态 → 被谁调用）

| 文件 / 目录 | 行数/规模 | 职责 | 实测状态 | 调用方 |
|---|---|---|---|---|
| `src/pet/hero.ts` | 370 | CharacterPack schema/校验/加载 + `CharacterRenderer` | **仅纯函数被测试；渲染器零单测** | `tests/hero.test.ts:11`；`docs/look-test/mock-480x272.html:60`（经 `hero.bundle.js`） |
| `src/pet/main.ts` | 683 | pet 页唯一入口：kernel/语音/存档/DOM 接线 | 生产可用；**无 hero 引用** | `pet.html:65` |
| `pet.html` | 67 | 折角 DOM/CSS 壳（标题/面板/折页簿） | **无 `<canvas>`、无 `.hero-stage`** | Vite input（`vite.config.ts:20`） |
| `src/pet/pet.css` | 96 | 折角 DOM 样式 + 480×240/272 两档媒体查询 | `.hero-stage`（:77-85）**有样式无元素** | `main.ts:27` `import './pet.css'` |
| `public/assets/pet/pearl-placeholder/` | 36 PNG + manifest 109 行 | 运行时占位 CharacterPack（placeholder-only） | 被 `hero.ts:152-165` fetch；**pet 页未用** | mock / Look Test / 测试 |
| `src/pet/claims.ts` / `crypto.ts` / `portable.ts` | 37 / 92 / 77 | 台词能力守卫 / 整档密文 / 口令备份 | 与存档强耦合 | `main.ts:19-24` |
| `app/tauri/src-tauri/src/main.rs` | 446 | pet 路由、窗口 flags、`--pet-size` | 480×240 默认（:247）、480×272 可选（:278-280） | Tauri 启动 |
| `src/kernel/pet.ts` | 241 | 桌宠状态机（bond/paper/folded/schedule/mood） | **冻结**；`PetState` schema :8-31 | `main.ts:1-16` |
| `src/voice/*` | service 93 / types | TTS 门面、persona/emotion | **冻结**；`persona: string`（types:6） | `main.ts:17-27,131` |
| `art/specs/pet.pearl.pixel.json` | 96×96 / 7 states / 36 帧 | hero 替换合同 | 与 manifest/assets.csv 三方锁（`tests/hero.test.ts:24-55`） | 占位脚本、测试 |
| `art/specs/pet.fold.json` | 32×48 / 5 states | micro 折角合同 | **冻结**（`art/README.md:54`） | 占位脚本、assets.csv |
| `docs/look-test/mock-480x272.html` + `hero.bundle.js` | — | 唯一真实使用 hero.ts 的宿主 | bundle 由 `package.json:35` esbuild 生成 | 截图脚本 |
| `scripts/cdp-pet*.mjs`、`scripts/e2e-tauri.ps1` | 5 个脚本 | pet 功能/加密/DPAPI/布局冒烟 | 依赖固定选择器与 `window.__pet` | 手动 E2E |
| `docs/CHARACTER-PACK.md` | — | — | **不存在**（全仓 grep 实测） | — |

合同实际分散在：`docs/HANDOFF-2026-11-14-PEARL-FAMLING.md` §5（:191-255）、`art/README.md:52-65`、`art/specs/README.md:11-16`、`manifest.json` 自身。

---

## 2. 调用关系（谁调用谁；行号为实测）

```
pet.html:65 ──> src/pet/main.ts
                 ├─> src/kernel/pet.ts            (冻结：状态/调度)
                 ├─> src/voice/service.ts         (冻结；persona:'pagefold' @ main.ts:131)
                 ├─> ./claims.ts ./crypto.ts ./portable.ts  (输出守卫 / 存档加解密)
                 ├─> ../game/checksum.ts (crc32)
                 └─> ./pet.css                    (main.ts:27)

tests/hero.test.ts:11 ─────────────> src/pet/hero.ts（纯函数：validate/resolveTag/frameIndexFor）
docs/look-test/mock-480x272.html:60 ─> hero.bundle.js ─(生成自 package.json:35 esbuild)─> hero.ts
hero.ts:152-165 ──fetch──> <base>/manifest.json；:157 `new URL(asset, base)` 解析帧 URL

Rust main.rs:242-250 game_route("pet" → pet.html, 480,240)
      :278-280 --pet-size → :338-358 建窗（decorations(false)/skip_taskbar/focused(false)）
      :282-294 place_bottom_right；:296-308 place_bottom
```

**关键结论（实测）**：**没有生产代码 import `hero.ts`**。hero 渲染器只被「测试」与「Look Test mock bundle」消费，桌宠窗口仍是纯 DOM/CSS 折角。

---

## 3. 契约现状（`hero.ts` 公开 API vs 真实行为）

| 契约方法 | 行号 | 实测行为 | 缺口（多对象/接口化受影响） |
|---|---|---|---|
| `load(pack)` | 223-237 | 一次加载**全部**帧并渲染首帧 | N 帧 = N 请求；无图集/懒加载 |
| `play(tag,{loop,speed})` | 239-265 | 未知 tag 抛 `CharacterPackError`（符合 Famling 契约，handoff §5.3 :238-244） | rAF **常开**（8fps 也按 ~60Hz 唤醒） |
| `setExpression` | 289-292 | **只存字段，不参与绘制** | 没有表情帧/图层 → 表情不生效 |
| `setMouth` | 298-301 | 只存 0..1，不绘制 | 语音口型链路是空的 |
| `setPosition` | 303-307 | 写 `canvas.style.transform` | 无槽位、无 z 序、无多 actor 概念 |
| `hitTest` | 310-326 | 每次调用 `getImageData` 同步读回 | 未缓存 alpha 掩码（性能/抖动） |
| `destroy` | 335-341 | `canvas.width=0` 后不可复用 | 换包必须换 canvas |
| 缩放 | 218 | 默认 `scale=2`，仅允许 1/2 | 无 DPR 背板（125% 分数缩放问题） |

**manifest 现状**（`public/assets/pet/pearl-placeholder/manifest.json`，109 行）：
`id`(:2) / `style`(:3) / `canvas`(:4) / `anchor`(:8) / `footBox`(:13) / `tags`(:20，含 `frames/fps/loop/phase`) / `assets`(:64，**强制与帧总数 1:1**，校验 `hero.ts:126-128`) / `license`(:102) / `ai`(:103) / `placeholder`(:106) / `sourceSpec`(:107) / `generator`(:108)。
**没有** `schemaVersion`、`kind/game/layer`、`defaultTag`、`expressions`、`layers`、`atlas`、`offsets`、`events`；且校验器**重建对象并丢弃未知字段**（`hero.ts:135-149`）→ 新字段会被静默吃掉，前向兼容性为零。

---

## 4. 冻结区（不得碰）

| 冻结项 | 边界证据 |
|---|---|
| kernel 状态/存档/记忆 | `src/kernel/pet.ts:8-31`（`PetState` schema）、`src/kernel/save.ts`(111)、`src/kernel/memory.ts` |
| 语音 | `src/voice/service.ts`(93)、`src/voice/types.ts:6`；key 只在 Rust 环境变量/代理 |
| 整档加密/口令备份 | `src/pet/crypto.ts`、`src/pet/portable.ts` |
| micro `pet.fold` 32×48 | `art/specs/pet.fold.json`、`art/assets.csv` 3 行、`art/README.md:54`、`docs/ART-PIPELINE.md:136` |
| 480/960 场景 | `src/{aquarium,town,stall,world}`、`art/specs/{aq.guppy,stall.nurse,stall.tea,town.mill,town.street}.json`、`docs/HANDOFF…:96,172` |
| 事实上的冻结（改动=破坏回归门） | Tauri 窗口 flags（`main.rs:342-346`）、E2E 选择器与 `window.__pet`（`cdp-pet.mjs:28-53`、`e2e-tauri.ps1:88-97`、`cdp-pet-layout.mjs:8,34-52`） |

任务说明与 `HANDOFF…§4.1`(:160-190)：Pearl 现阶段是**纯视觉层**，身份改造（文字/语音/存档变 Pearl）属后续独立决策并会碰冻结区。

---

## 5. 最大耦合点（按危害排序）

1. **行为→视觉只存在于 `main.ts` 且用 CSS class 表达**：`render()` :140-161 用 `classList.toggle('happy'|'sleepy')`（:150-151），`say()` :117-138 用 `talking`（:122）。接 hero 时要么替换这些 class，要么两套动画并存（DOM 折角 + canvas hero 同时动）。
2. **`main.ts` 是 683 行上帝文件**：kernel + 语音 + 存档 + 窗口位置 + QA hook 全在一起；`window.__pet`（:623-640）被 5 个 CDP 脚本当公共 API 调用 → 抽层不能改其形状。
3. **`hero.ts` 一个类塞五件事**：pack 数据、动画调度、绘制、命中、布局（`transform`）。多对象 = N 个 rAF 循环，无共享调度/无 z 序。
4. **`pet.html` DOM 结构是 QA 契约**：`.hero-stage` 样式已预留（`pet.css:77-85`）但无元素；`#pet-app/.book/aside.panel/#pet` 被布局脚本读取（`cdp-pet-layout.mjs`），`#give/#fold/#pat/#voice-cache/#bubble/#memory-list` 被功能脚本点击（`cdp-pet.mjs:28-46`）→ 换渲染载体必须**只加不删**。
5. **合同分散且缺一个权威文件**：`docs/CHARACTER-PACK.md` 不存在；社区角色包作者需要同时读 handoff + art/README + art/specs/README + manifest。
6. **数值硬编码不在渲染器里**：96 在 spec/csv/tests；480×240 在 `main.rs:247`；480×272 档在 CSS 媒体查询（`pet.css:65-96`）；`scale=2` 在 `hero.ts:218`。`hero.ts` 的 canvas 来自 manifest（:353-360）→ **换 128 不改渲染器**，但**必须**改契约+测试+占位帧+窗口，并重跑 Famling 契约评审。

---

## 6. 阻碍清单（实测 / 推断）

| # | 阻碍 | 证据 | 类型 | 对接口化/多对象的影响 |
|---|---|---|---|---|
| 1 | hero 未接 pet.html | `pet.html` 无 canvas；`main.ts` 无 import；`.hero-stage` 有 CSS 无元素（:9-30 vs `pet.css:77-85`） | 实测 | 接口层没有任何宿主，无法验证 |
| 2 | manifest 无扩展位且未知字段被丢弃 | `hero.ts:135-149` 重建对象；字段表见 §3 | 实测 | 社区包无法声明行为/表情/图层；v2 字段上线即静默丢失 |
| 3 | 单角色/单实例假设 | 一个 `CharacterRenderer` 独占 canvas；一个 `#pet`；单 `PetState` | 实测 | 双对象无 Actor 抽象、无槽位、无命中优先级 |
| 4 | 资源加载不设防 | `new URL(asset, base)` 允许绝对 URL（:157）；无帧数/画布/体积上限；无签名/哈希 | 实测（URL）/推断（风险） | 社区包 = 可信执行面，可拉远端资源或申请超大 canvas |
| 5 | 尺寸双轨：128 已拍板、96 仍是被跟踪合同 | strategy §8/§9；128 资产在 gitignored 目录 | 实测 | 先按 96 做接口不会白做，但测试/窗口/文档要重做一轮 |
| 6 | DOM/CSS 与 Canvas 混用 | 行为只有 class；`setExpression/setMouth` 是 no-op（§3） | 实测 | 两套动画系统并存，QA 判据不清 |
| 7 | 测试缺口 | `hero.test.ts` 只测 4 个纯函数，`CharacterRenderer` 零单测；`npm test`（`package.json:11`）不含 DOM/布局；布局仅靠 CDP 手工脚本 | 实测 | 改造无回归网，只能靠 133 个不相关测试兜底 |
| 8 | 生成管线与运行合同脱节 | `placehold.py:105-119` 只输出 `art/_placeholder/manifest.placeholder.json`；运行时 `manifest.json` 无脚本生成（grep 实测）；128 pipeline 在 `art/_placeholder/refs/tools/`（gitignored） | 实测 | 社区包没有「一条命令产出合法 pack」的参考路径 |
| 9 | 身份/文案仍是折角 | `pet.html:12-13`、`main.ts:74` 台词、`persona:'pagefold'`(:131) | 实测 | 双默认行为里「人型 Pearl」的语音 persona 要动 voice（冻结）→ 需用户裁决 |

---

## 7. 目标架构（分层）

```
L5 UI shell      pet.html(DOM 壳) + main.ts 拆出的 app/shell（按钮/字幕/折页簿/窗口）
                     │  只调 Actor/Behavior，不直接碰 pack 与绘制
L4 renderer      hero.ts CharacterRenderer（Famling 7 方法 **签名不变**；内部拆 drawAt/调度）
L3 actor/stage   Actor(1 pack + 1 behavior + 1 view + 1 slot) / Stage(N actor, z 序, 共享 rAF)
L2 behavior      声明式表：humanoid（Pearl）/ pet（折角类）；事件→{tag, expression, hold, priority}
L1 pack registry 发现/校验/预算/LRU/license/URL 白名单（形状参考 src/pack/*，**不 import kernel**）
L0 character core 纯函数：pack schema v1.1、帧数学、behavior 求值、slot 布局（Node 可测，无 DOM）
```

接口草案（新增文件，均为**增量**）：

```ts
// character/pack.ts（L0/L1）
interface CharacterPackV11 { schemaVersion: 1; id: string; style: 'pixel-hero'|'pixel-micro'|'hd-chibi'
  canvas: [number, number]; anchor: {...}; footBox: {...}; tags: Record<string, CharacterTag>
  defaultTag?: string; expressions?: Record<string, { tag: string; frame?: number }>
  layers?: LayerDef[]; atlas?: AtlasRef; assets?: string[]; license: string; ai: {...} }

// character/behavior.ts（L0，纯数据；缺 tag 在此层降级，渲染器仍严格抛错 → 契约不破）
type BehaviorEvent = 'idle'|'pat'|'dragStart'|'dragEnd'|'land'|'speakStart'|'speakEnd'|'sleep'|'remind'
interface BehaviorCue { tag: string; expression?: string; holdMs?: number; priority: number }
interface BehaviorProfile { id: 'humanoid'|'pet'; required: string[]; map: Record<BehaviorEvent, BehaviorCue> }

// character/actor.ts（L3）
interface Actor { id: string; pack: LoadedPack; behavior: BehaviorProfile; view: CharacterView; slot: Slot }
interface CharacterView { load/play/setExpression/setMouth/setPosition/hitTest/destroy  // 现有 7 个
  drawAt?(ctx: CanvasRenderingContext2D, x: number, y: number): void }                    // 为共享 canvas 预留
```

三条原则：① kernel/voice/save **不进入**这些接口；② `Actor` 状态 Runtime-only（持久化另立 gate，因为存档冻结）；③ 渲染器公开 API 不变 → `docs/look-test/hero.bundle.js` 与 Famling 契约继续可用。

---

## 8. 最小改造步骤（文件 / 改动 / 风险 / 测试 / 工作量 / 门）

| # | 文件 | 改动 | 风险 | 测试 | 估算 | 门 |
|---|---|---|---|---|---|---|
| 0 | **新增** `docs/CHARACTER-PACK.md` | 写死 pack v1.1 字段表 + 社区作者流程 + license/AI 披露要求；与 handoff §5 互链 | 低 | 文档 review | 0.5 人天 | 现在 |
| 1 | **新增** `src/pet/character/pack.ts` | schema v1.1 校验（旧字段语义不变、未知字段不再丢）+ 预算（帧数/画布/URL 白名单） | 低 | 新 `tests/character-pack.test.ts`（含负例） | 1 人天 | 现在 |
| 2 | **新增** `src/pet/character/registry.ts` | list/load/cache(LRU)/license 标注；baseUrl 仅允许同源 `/assets/pet/**`；不 import kernel | 中（安全面） | 单测 + URL 白名单负例 | 0.5–1 人天 | 现在 |
| 3 | **新增** `src/pet/character/behavior.ts` | humanoid/pet 两套**数据表**（humanoid 用现有 7 tag + 6 表情；pet 对齐 `pet.fold` 的 idle/walk/sleep/pat/fold 语义）+ 缺 tag 声明式降级 | 低 | 单测（表完整性、降级顺序） | 0.5–1 人天 | 现在 |
| 4 | **新增** `src/pet/character/actor.ts`、`stage.ts` | Actor/Stage；Phase A = 每 actor 一个 canvas + 共享 rAF 调度（替代 N 个循环） | 中 | 单测（调度/顺序/命中）+ DOM 冒烟 | 1.5–2 人天 | 现在 |
| 5 | `src/pet/hero.ts` | 可选增量：alpha 掩码缓存（替代 :310-326 每帧读回）、帧边界调度（替代 :250-264 常开 rAF）、DPR 背板 | 中 | 保 133 全绿 + 新增调度单测 + 重生成 bundle | 1–2 人天 | 现在（可延） |
| 6 | `pet.html`、`src/pet/pet.css` | 加 `<canvas class="hero-stage">` 容器 + `?hero=1` flag；pack 加载失败**回退 DOM 折角**；所有现有 QA 选择器保留 | 高 | `cdp-pet-layout.mjs` 两档无 overflow；`cdp-pet.mjs` 断言不变；截图对比 | 1–2 人天 | **Phase 2 gate** |
| 7 | `src/pet/main.ts` | `render()` 的 class 逻辑改为 `actor.play(cue)`；DOM 只留字幕/HUD/折页簿；`?hero=0` 可完整回退 | 高 | E2E pet + 记忆/语音/存档不回归；`window.__pet` 形状不变 | 1 人天 | **Phase 2 gate** |
| 8 | `art/specs/pet.pearl.pixel.json`、pack manifest、`art/assets.csv`、mock、tests、`main.rs`、`pet.css` | 128 迁移（spec/manifest/mock/tests/窗口 480×336 或 324）；`hero.ts` 无需改（canvas 来自 manifest） | 中高（Famling 契约重审 + 美术） | 三方对齐锁、`check_specs.py`、`cdp-pet-layout`、Look Test 截图矩阵 | 1.5–3 人天 | **Phase 2 gate（已拍板、未落地）** |
| 9 | 新增 stage 多 actor 接线 + 槽位 | 双对象/多对象：底中/右下槽位、z 序、命中优先级、降级/隐藏规则 | 高 | 单测 + 布局 + 2–3 actor 性能 | 3–5 人天 | **Phase 3 gate（持久化需存档决策）** |

**合计**：现在可做（0–5）≈ **3.5–5.5 人天**；Phase 2（6–8）≈ **+3.5–6 人天**；Phase 3（9）≈ **+3–5 人天**（均为估算，不含美术）。

---

## 9. 必须改 / 可以不动

**必须改（接口化/多对象必需）**：新增 `src/pet/character/*`；`hero.ts` 增量（公开 API 不变）；`pet.html` / `main.ts` / `pet.css`（Phase 2）；manifest additive 字段；新增测试；`main.rs` 仅在改默认窗口尺寸时（Phase 2）；新增 `docs/CHARACTER-PACK.md`。

**可以不动**：`src/kernel/*`、`src/voice/*`、`src/pet/{crypto,portable,claims}.ts`、480/960 场景与 spec、`pet.fold` micro、`scripts/placehold.py` / `validate_art.py` / `check_specs.py`、Tauri 窗口 flags、现有 E2E 脚本（**只加不改**）。

**不能碰**：见 §4 冻结表。

---

## 10. 重构顺序与回滚

**顺序**：0（合同文档）→ 1（pack schema）→ 2（registry）→ 3（behavior 表）→ 4（actor/stage）→ 5（hero 增量，可选）→ 6（pet.html 接线，flag 默认关）→ 7（main.ts 行为切换，默认仍 DOM）→ 8（128+窗口）→ 9（多对象）。
**为什么先接口层**：0–4 全是新增文件 + 纯函数，`npm test` 可全绿，不动任何现有运行路径；6/7 是唯一会改用户可见行为的一步，放在有测试与 flag 之后。

**回滚策略（无 git 约束下按文件/flag）**
- 新增目录：整目录删除即回滚（不影响现有 import）。
- `hero.ts` 增量：单文件回退 + `npm run look:test:bundle`（`package.json:35`）重生成 mock bundle。
- 6/7：`?hero=1` 开关控制，异常只翻 flag；**`#pet` DOM 元素只加不删**，折角永远保留为 fallback 至少一个迭代 → E2E（`e2e-tauri.ps1:88-97`）不会因换壳而红。
- manifest：新增字段全部 optional，旧包必须永远可读（步骤 1 的测试锁住）。
- 窗口尺寸：默认仍是 480×240，`--pet-size` 传参不写死 → 128 失败可回 480×272/240。

---

## 11. 现在能做 vs Phase 2 gate

**现在能做（不接页面、不碰冻结区）**：步骤 0–5。产出物=合同文档 + 纯模块 + 单测。注意先定 v1.1 字段再写代码，避免与 128 迁移冲突。
**Phase 2 gate（需用户确认）**：6/7 接入与默认行为切换；8 的 128+窗口尺寸；「默认 hero 还是 DOM 折角」的产品决策。
**Phase 3 gate（需存档/语音决策）**：多对象持久化（碰存档冻结）；双宠身份与文案；语音 persona 扩展（碰 voice 冻结）。

---

## 12. 风险

1. **返工**：128 资产在 gitignored 目录、代码在 tracked 目录。先接 96 再迁 128 的代码返工很小（canvas 来自 manifest），但测试/文档/窗口/截图必须重做一轮；建议步骤 0 的字段表按「画布无关」设计。
2. **过度设计**：两套 behavior 只需数据表，不要引入 ECS/事件总线；`docs/SCENE-RUNTIME.md:23-27` 的 `SceneDef/ActorState/SceneRuntime/SceneView` 形状可参考，但**不要**把桌宠接进场景层/kernel。
3. **社区包安全**：无签名/无预算 = 任意远端加载 + 无界内存。最低要求：URL 同源白名单、帧数/画布/体积上限、license 必填；签名可复用 `src/pack/signature.ts`(35 行) 的形状，但**不要**把角色包塞进 content pack loader（会把 kernel 类型反向耦合进来）。
4. **性能**：Phase A 的 N canvas/N 调度器对 2–3 对象足够；>3 或要 FX/模糊时切共享 canvas（步骤 4 已留 `drawAt`）。
5. **文档漂移**：handoff 写于 17:45，早于 20:06 的 128 决定；`docs/CHARACTER-PACK.md` 缺失；`placehold.py` 不产出运行时 manifest。本审计 §0 已标注，后续以 strategy §8/§9 与 AI draft log 为准。
6. **不可测项（标推断，需实机）**：真实 Windows 100/125/150% 缩放下的行宽/清晰度、无边框窗口在 DPI 切换时的重排、WebView2 隐藏时停 rAF 的实际行为。

---

## 13. 证据索引（行号）

- 未接线的直接证据：`pet.html:9-30`（无 canvas）、`pet.html:65`（入口）、`src/pet/main.ts:1-27`（import 列表无 hero）、`src/pet/pet.css:77-85`（`.hero-stage` 仅有样式）、全仓 `grep "hero.ts"` 只命中 `tests/hero.test.ts:11` 与 `scripts/look-test-shots.mjs:6`。
- 契约/API：`src/pet/hero.ts:20-34`（PackData）、`:82-150`（validate）、`:126-128`（assets↔帧数）、`:152-165`（load）、`:196-370`（Renderer）、`:218`（scale）、`:239-265`（play）、`:289-307`（expression/mouth/position）、`:310-326`（hitTest）、`:353-360`（canvas 来自 manifest）。
- 宿主接线：`src/pet/main.ts:117-138`（say/talking）、`:140-161`（render/class）、`:163-199`（交互）、`:589`（30s 存档）、`:596-621`（启动）、`:623-640`（`window.__pet`）、`:643-683`（窗口位置）。
- 窗口/尺寸：`app/tauri/src-tauri/src/main.rs:242-250`（路由）、`:278-280`（`--pet-size`）、`:338-358`（建窗）、`:282-294`（右下）、`src/pet/pet.css:65-96`（两档媒体查询）。
- 测试/QA：`package.json:11`（npm test）、`:35`（bundle）、`tests/hero.test.ts:13-14,24-55,57-70,72-83`、`scripts/cdp-pet.mjs:28-53`、`scripts/e2e-tauri.ps1:88-97`、`scripts/cdp-pet-layout.mjs:8,34-52`。
- 冻结/边界：`src/kernel/pet.ts:8-31`、`src/voice/types.ts:6`、`art/specs/pet.fold.json`、`art/README.md:54`、`docs/HANDOFF-2026-11-14-PEARL-FAMLING.md:57-77,160-190,238-244,396,519-526`、`docs/ART-PIPELINE.md:136`。
- 128 决定：`docs/PEARL-ART-PRODUCTION-STRATEGY-2026-11-14.md:13-27,116-130,132-146`、`docs/PEARL-HERO-AI-DRAFT-LOG-2026-11-14.md:80-114`、本地（gitignored）`art/_placeholder/refs/ai-drafts/pack-128*`、`…/mock-480x336.html`。
- 既有可复用能力：`src/scene/index.ts:1-3` 与 `docs/SCENE-RUNTIME.md:23-27`（Actor/Scene 形状）、`src/pack/manifest.ts:1-50`（id/slug/version 校验）、`src/pack/loader.ts:53-57`（信任顺序注释）、`src/pack/signature.ts`（35 行，签名形状）。

---

## 14. 摘要（≤700 字，供决策）

- **最大耦合点**：行为→视觉只有 `main.ts` 一处且用 CSS class 表达（:140-161,117-138）；`hero.ts` 把 pack/调度/绘制/命中/布局塞进一个类；`pet.html` 的 DOM 结构与 `window.__pet` 是 QA 契约（`cdp-pet*.mjs`、`e2e-tauri.ps1:88-97`）；合同分散且 `docs/CHARACTER-PACK.md` 不存在。
- **最小改造顺序**：先「纯增量接口层」——0 合同文档 → 1 `character/pack.ts`（v1.1 additive 校验+预算）→ 2 registry（同源白名单/LRU/license）→ 3 behavior 两套数据表（humanoid/pet，缺 tag 在行为层降级、渲染器仍严格抛错）→ 4 actor/stage（Phase A：每 actor 一 canvas + 共享 rAF）→ 5 hero.ts 可选增量（掩码缓存/帧边界调度/DPR）。全部新增文件 + 单测，`npm test` 133 不破。约 3.5–5.5 人天。之后才是 Phase 2：6 `?hero=1` 接 pet.html（失败回退 DOM）→ 7 main.ts 行为切换 → 8 128 迁移+窗口 480×336（用户 20:06 已拍板、但仓库被跟踪合同仍 96）。多对象持久化是 Phase 3。
- **必须避免碰**：`src/kernel/*`（含 `PetState`）、`src/voice/*`、`src/pet/{crypto,portable}.ts`（存档/密钥）、micro `pet.fold` 32×48、480/960 场景与 spec；以及事实冻结的 Tauri 窗口 flags 与 E2E 选择器/`window.__pet`——换壳只能「只加不删」，DOM 折角保留为 fallback。
- **关键提醒**：128×128 是 20:06 的最新用户决定，但 spec/mock/128 帧都在 gitignored 目录，tracked 合同仍是 96；因此接口字段必须「画布无关」，128 迁移单列为 Phase 2 gate 并同步改 spec/manifest/assets.csv/tests/窗口。

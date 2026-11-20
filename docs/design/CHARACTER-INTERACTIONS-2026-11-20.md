# 角色/动作数据单源：interactions → behavior.json + regions.json（E3 / MB-104）

> 状态：已实现并本机实测（2026-11-20，`desktop-games` 工作树 HEAD `0a5bc0b` + 在途改动；未 commit）。
> 范围：私有仓 `desktop-games`；**不改 UI**、不改插件生成物。
> 验收对应：`EXECUTION-STATUS` MB-104 = “behavior.json（ambient 权重）/regions.json 生成单源；插件 EVENT_CLIPS 手冻常量收敛”。
> 插件侧 EVENT_CLIPS 已由 MB-107 完成（见插件 `docs/CONTENT-CONSTANTS-2026-11-20.md` §6 残余 2，明确把 famling 侧留待后续任务）；本任务完成 famling 侧，并保持插件输入字节不变。

## 0. TL;DR

1. 新增三份母版 `src/pet/anim/interactions/{dog,cat,human}.json`（contract `famling.interactions/1`）。每个 state 一行，触发器表 `states[].rules` 是唯一事实源。
2. 新增生成器 `scripts/gen-character-interactions.mjs`：默认生成 `public/characters/<dir>/{behavior,regions}.json` 六个文件；`--check` 是漂移门；支持 `--only dog,cat` / `--json` / `--root DIR`。
3. 迁移**保持六个生成文件逐字节不变**（测试冻结 SHA-256），因此插件 `gen-content-constants.mjs` 的 `source-sha256`、`EVENT_CLIPS`/`MICRO_LINES` 生成块与三套动画 chunk 都不需要重新生成。
4. 校验覆盖：schema/未知字段、manifest clip 与 `timing.json.specOnly` 冻结、canvas 一致、canonical 槽/规则顺序、每个 gesture/action/follow-up 事件必须有行为规则、插件 `EVENT_CLIPS` 可重新派生且三角色一致。
5. 新增测试 `tests/character-interactions-single-source.test.ts`（10 项）跑在 `npm test` 里，因此漂移门随 CI 生效（不需要改 `package.json`/`ci.mjs`）。
6. 不改 UI、不改插件；插件侧只做只读校验（`node scripts/embed-anims.mjs --check`、`node scripts/gen-content-constants.mjs --check`）。

## 1. 为什么要做（旧状态的漂移点）

同一个“动作/事件”在旧配置里要被手写 4–6 次：

| 位置 | 手写内容 | 改一个动作需要同步 |
|---|---|---|
| `behavior.json.slots` | 事件 → state | ✅ |
| `behavior.json.states` | state → tag/priority/after/cooldown | ✅ |
| `behavior.json.rules` | 事件 → state + priority/cooldown/probability | ✅ |
| `behavior.json.ambient.choices` | state 名 + 权重顺序 | 新增微动作时 |
| `regions.json.gestures` | region + 事件 + says | 点击区域动作 |
| `regions.json.actions` | id/label/事件 + says（常与 gesture 重复） | 菜单动作 |

插件侧 MB-107 的 `EVENT_CLIPS` 生成器只能**读生成物**，无法在 famling 侧阻止“behavior 与 regions 事件面不一致”（它依赖三套角色恰好一致，否则插件生成器红）。E5-T4 的目标即 `character.interactions.json` 单源 → 生成 regions/behavior，并用落库门禁保证漂移可见。

本任务选择 **state-centric** 单源：`states[]` 每项声明 state/tag/priority/rules/says/gesture；`behavior.slots`、`rules[].to`、`regions.gestures[].event`、动作 says 全部派生，去掉重复的“事件 → state”映射。

## 2. 数据流

```text
src/pet/anim/interactions/<character>.json        (authoring source, 不进产品资产)
        │
        │  node scripts/gen-character-interactions.mjs            # 写
        │  node scripts/gen-character-interactions.mjs --check    # 漂移门
        ▼
public/characters/<dir>/behavior.json     public/characters/<dir>/regions.json
        │                                        │
        ├─ SceneRuntime + BehaviorRuntime         ├─ anim/regions.ts（点击命中/菜单动作/气泡）
        │  （状态机 / ambient / 冷却）            │
        └──────────────┬─────────────────────────┘
                       ▼
plugins/dsh-famling/scripts/gen-content-constants.mjs
        └─> client.js 生成块 EVENT_CLIPS / MICRO_LINES（MB-107，按生成物计算 source-sha256）
```

**为什么母版放 `src/` 而不是 `public/`**：`public/` 会被 Vite 原样拷贝进 `dist/` 与安装包，运行时却不会请求 interactions 源文件；放在 `src/pet/anim/interactions/` 既不进产品预算，又和 `timing.json`（MB-103 的母版）同处一个模块。

## 3. 单源 schema（`famling.interactions/1`）

顶层键：`contract`、`character`、`behavior`、`regions`、`states`、`ambient`、`actions`（未知键直接报错，防手滑）。

| 段 | 字段 | 说明 |
|---|---|---|
| `behavior` | `profile`/`version`/`extends`/`defaults`/`abilities`/`needs?`/`ambientIntervalMs`/`speech` | 行为 profile 头；`needs` 与 `abilities.needs` 必须同时有/无 |
| `regions` | `version`/`canvas`/`boxes[]`（`id/label/rect/priority`） | canvas 必须等于动画 manifest canvas；box 必须在 canvas 内 |
| `states[]` | `name`/`tag`/`loop?`/`priority`/`timeoutMs?`/`after?`/`stateCooldownMs?`/`slots?`/`rules[]`/`says?`/`gesture?` | 一行一个状态；`tag` 必须是 manifest 里真实 clip 且非 spec-only |
| `states[].rules[]` | `on`/`slot?`/`priority?`/`cooldownMs?`/`probability?`/`requiresBrief?` | 唯一触发器表；`to` 自动指向所在 state；`priority` 缺省 = state priority |
| `states[].gesture` | `region`/`states?`/`gesture?`/`says?` | 该 state 必须恰好暴露 1 个槽事件，事件即 gesture 的 `event` |
| `ambient[]` | `state`/`weight` | 有序权重表（输出顺序固定） |
| `actions[]` | `id`/`label`/`event`/`followUpEvent?`/`followUpMs?`/`says?` | 菜单动作；`event` 必须是已声明槽事件；`says` 可继承 owner state |

### 3.1 `says` 复用

- gesture 与 menu action 用同一组台词时，只写在 state 的 `says` 上（如 pat、tail）；
- 需要不同台词时，用 `gesture.says` / `action.says` 覆盖（如猫的 body-tap 与“伸懒腰”动作）；
- 生成器按 `side.says ?? state.says` 逐个展开，输出里的 regions 两份 `says` 仍保持既有顺序。

### 3.2 `slots` 派生（事件只声明一次）

默认 `slots[rule.on] = 所在 state`；按需覆盖：

- `rule.slot: "drag"` → `drag.start` 触发但对外槽事件叫 `drag`（现有三角色唯一重命名）；
- `rule.slot: false` → 只做规则、不暴露槽事件（`wake`）；
- `idle` 无规则，显式写 `slots: ["idle"]`。

因此 `behavior.slots` 不再需要手写；`SLOT_ORDER` 常量里的事件集合必须被恰好覆盖。

## 4. 确定性顺序与字节稳定

- 输出文本 = `JSON.stringify(document, null, 2) + "\n"`，与迁移前一模一样；
- `behavior.slots` 按 `SLOT_ORDER`、`behavior.rules` 按 `RULE_ORDER` 排序（两个常量三角色共用）；新增事件必须显式扩表，否则生成器/测试报错——这是刻意的“别静默改生成文件字节”门；
- 迁移后六个文件与旧手写版本**逐字节相同**，测试冻结 SHA-256：

| 文件 | SHA-256（已冻结在测试里） |
|---|---|
| `public/characters/pet-dog/behavior.json` | `27f41a5809f7d8c711363898cd6f8a4967fcb74ae01b4c5563f4e6154b1d593f` |
| `public/characters/pet-dog/regions.json` | `59483a6a20c9140c25c7bf34949306b6813aa020c41f9460da4ee27026ddfc0b` |
| `public/characters/pet-cat/behavior.json` | `369989ed404c33cd0773ad83c3e9b1b110a6713ebf6e037984ff9609aaf1e8fe` |
| `public/characters/pet-cat/regions.json` | `3410adc55c1880da5138dbae6b1ef226100708ae34d8363b27bc8d29f003b5fb` |
| `public/characters/pet-tinglan-anim/behavior.json` | `39bcf96b932837557960378ace565dec34ffe0d7a87c16d5d53b221839428fbd` |
| `public/characters/pet-tinglan-anim/regions.json` | `8d2cd34a98be0ed2e3084b3716378d531797f5b852b3523357e0e1041dc72726` |

## 5. 校验与门禁

`node scripts/gen-character-interactions.mjs --check`（以及 `npm test` 中的同名测试）逐项校验：

1. contract/character 与文件名一致；未知字段（含嵌套 state/rule/gesture/action/box）报错；
2. tag 必须存在于该角色动画 manifest 的 `tags`，且不得是 `timing.json.specOnly`（walk/attack）；
3. `regions.canvas` 必须等于 manifest canvas；box 唯一、rect 为正且在 canvas 内；
4. `SLOT_ORDER` / `RULE_ORDER` 两个 canonical 事件表必须被**恰好**覆盖；每个非 `idle` 槽事件必须有触发规则；
5. gesture 必须绑定已声明 box，`states` 白名单必须是已声明 state；gesture state 必须恰好暴露一个槽事件；
6. action 的 `event`/`followUpEvent` 必须是已声明槽事件；`followUpMs` 0–5000 且需要 `followUpEvent`；says 必须能解析到 2–6 条 ≤120 字台词；
7. ambient state 已声明、权重 ≥1 且不重复；
8. `behavior.speech.lines` 的 key 形如 `<state>.<n>` 且 state 已声明；
9. 语音策略：human 必须 `voice`，cat/dog 不得 `voice`（与插件 TTS 策略一致）；
10. 三角色派生出的 `EVENT_CLIPS`（gesture/action/ambient 事件 → rule → state.tag，`idle` 记为 null）必须一致；`talk` 必须为 null。

注意第 10 条：即使没有插件 checkout，famling 测试也能守住“插件生成器会红”的跨角色不变量。

## 6. 迁移证据与本机实测

本机实测（2026-11-20，WSL Linux x64 / Node v24.22.1；仓库 `node_modules` 与 tsx 可用）：

| 命令 | 结果 |
|---|---|
| `node scripts/gen-character-interactions.mjs --check` | `check ok (3 characters, 10 event-clips)`；6 个输出文件 0 漂移 |
| `node scripts/gen-character-interactions.mjs` | `unchanged (3 characters, 10 event-clips)`（幂等，不写盘） |
| `node --import tsx --test tests/character-interactions-single-source.test.ts` | 10/10 pass |
| 相关回归 12 个测试文件（anim-timing / spec-only / hero regions+runtime / default-packs / parity / behavior-traces / low-disturb 等） | 111/111 pass，0 fail |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **1927/1927 pass**，0 fail / 0 skip |
| `npm run build` | exit 0；`[build] page profile ok (production): chat-import.html, pet.html, setup.html` |
| 插件 `node scripts/embed-anims.mjs --check` | `check ok`（client.js + 3 lazy chunks + vendored spec） |
| 插件 `node scripts/gen-content-constants.mjs --check` | `check ok`；`source-sha256 6b96ec3b…`（与迁移前相同 → 输入字节未变） |
| 插件 `node scripts/verify-anims.mjs` | `OK`（first paint 156.7 KiB / all lazy + entry 342.3 KiB） |
| 插件 `npm test` | 245/245 pass |

结论：迁移与生成器没有改变任何插件输入字节，也没有改变运行时 UI/行为；插件侧无需重跑生成器。

## 7. 与其它任务的关系

| 任务 | 关系 |
|---|---|
| MB-103 / task-99（timing 单源） | `timing.json` 仍是 clip 计时唯一源；本生成器读取其 `specOnly`，拒绝 walk/attack 重新被行为数据引用 |
| MB-107（插件内容常量生成） | 已完成插件侧 `EVENT_CLIPS`/`MICRO_LINES`；本任务保持其输入字节不变，插件 `check` 链无需重跑 |
| MB-047 / E5-T7（spec-only 冻结） | 测试复用 `scripts/anim-timing-check.ts` 的 `specOnlyReachabilityProblems` |
| E5-T4（interactions 单源） | 本任务即其 famling 侧最小实现：regions+actions+says+behavior slots 单源；voice policy 以「behavior.abilities.speech 校验」覆盖，未新增独立 voice schema |
| UI/插件 | 不改；`public/characters/*/character.json`、`hero-runtime`、`desktop-shell` 未动 |

## 8. 维护者流程

```bash
cd /mnt/d/Projects/dsh/desktop-games
node scripts/gen-character-interactions.mjs            # 改完母版后生成
node scripts/gen-character-interactions.mjs --check    # 门禁（npm test 也会跑）
```

- **新增一个菜单动作**：在 `states[]` 找到对应 state，把动作事件加进 `rules`（若尚未存在）或在 `actions[]` 增加一项；`says` 可只写一处。
- **新增一个可反应状态**：在 `states[]` 新增一行（tag 必须是 manifest 里已有 clip）；若需要点击/菜单入口，加 `gesture`/`actions[]`；若参与 ambient，在 `ambient[]` 加权重。
- **新增事件**：先扩 `SLOT_ORDER`/`RULE_ORDER`（`scripts/gen-character-interactions.mjs` 顶部），生成器会提示漏项；同时确认插件 `embed-anims.mjs` 的 `ACTION_EVENTS` 白名单（MB-107 生成器会检查）。
- **新增角色**：加母版 + 在 `CHARACTER_SOURCES` 登记 + 准备 manifest；并同步 `src/pet/hero-runtime.ts` 的 `HERO_CHARACTER_SOURCES`（本任务未改角色列表）。
- **字节变化时**：若生成器实际改变了 `behavior/regions` 字节（例如新增字段），同一改动内要在 `plugins/dsh-famling` 跑 `npm run gen:content` 与 `npm run check`（MB-107 的 source-sha256 会变）。

## 9. 残余与后续

0. **生成器保持 plain-JS ESM**：`scripts/gen-character-interactions.mjs` 可直接 `node` 运行；`scripts/gen-character-interactions.d.mts` 只是测试/编辑器用的类型声明（`tsconfig` 无 `allowJs`，import 未类型化会触发 TS7016）。
1. **未加 npm script**：`package.json`/`scripts/ci.mjs` 不在本任务 write scope（`ci.mjs` 正由 MB-111 任务改动）。命令直接用 `node scripts/gen-character-interactions.mjs`；CI 通过 `npm test` 中的新测试已经覆盖漂移门。建议后续把 `gen:characters` / `check:characters` 接进 `package.json` 与 `ci.mjs` 步骤表。
2. **插件仍读生成物**：MB-107 生成器从 `behavior/regions` 派生 `EVENT_CLIPS`；如要让插件直接读 interactions 母版，可并入 E1-T3（spec → 双端生成）。本任务未跨仓改插件。
3. **legacy 角色包未迁移**：`humanoid-default` / `pet-default` / `tinglan` / `tinglan-256` 不在 hero 三角色发布路径，仍是手写；如需要另开任务。
4. **状态行未改**：`EXECUTION-STATUS`/`MASTER-BACKLOG` 的 MB-104 行未在本任务内改（避免与 status/reclass 任务并发写）；§6 证据交 status owner 合并。

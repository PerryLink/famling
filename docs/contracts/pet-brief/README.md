# Pet Brief — contract snapshot & desktop consumer

本目录是 Famling/Advisers "Pet Brief" 契约（**v0.1, 2026-11-14, status: design contract**）的本地工作副本，
供本仓（desktop-games / Pearl）在不联网的前提下实现与验收消费端。canonical 契约仍以私有仓
`PerryLink/famling` `docs/` 为准。

## 0. 来源

- 复制时间：2026-11-15 19:16 +08（GitHub contents API，私有仓 `PerryLink/famling` `docs/`）。
- blob SHA：`PET-BRIEF.md` `8698dd0c`；`pet-brief.schema.json` `5ec912cc`；
  `pet-brief.example.json` `12c1ecf4`；`PET-BRIEF-TESTCASES.md` `bcec4c94`；`pet-brief.testcases.json` `47e86a88`。
- 详情见 `SOURCE.md`。**契约未冻结/未改动**：本目录只读快照，本仓不修改 schema。

| 文件 | 作用 |
|---|---|
| `PET-BRIEF.md` | 契约正文（字段规则、隐私、失败模式、20 条测试要求） |
| `pet-brief.schema.json` | JSON Schema（draft 2020-12，`additionalProperties: false`） |
| `pet-brief.example.json` | 合法示例 |
| `PET-BRIEF-TESTCASES.md` / `pet-brief.testcases.json` | 20 条测试向量（accept/accept_omit/reject/fallback/skip） |
| `SOURCE.md` | 快照来源与 SHA |

## 1. 消费端实现

`src/presence/pet-brief.ts`（新增，纯函数；无 I/O、无网络、无模型、不回写 Advisers）：

```ts
import {
  validatePetBrief, isExpired, toPresenceEvent, projectToDirective, resolveSuggestedLines,
} from './src/presence/pet-brief.ts'

const checked = validatePetBrief(rawJsonOrObject, { now: Date.now() })
// checked.status: 'accept' | 'reject' | 'skip'
// accept -> { brief, omitted }  (omitted = confidence < 0.7 的项，投影时忽略)
// reject -> { errors: [{ code, path, message }] }（整份丢弃，idle）
// skip   -> 用户关闭 brief 时不要读取文件（调用方传 { enabled: false }）

if (isExpired(brief)) { /* idle */ }
const directive = projectToDirective(brief, { now: Date.now(), projector })  // PetDirective | null
const lines = resolveSuggestedLines(brief) // { lines, fallback, rejected }
```

| API | 作用 |
|---|---|
| `validatePetBrief(input, opts?)` | schemaVersion/source/时间（ISO 必须带时区、`expiresAt > generatedAt`、TTL）/四节上限/`counts` 与数组一致/枚举/confidence/重复 id/禁止字段（递归）/未知字段 |
| `isExpired(brief, now?)` | TTL 边界（`now >= expiresAt` 即过期，含时区换算；非法时间 fail-closed） |
| `toPresenceEvent(brief, opts?)` | 映射到现有 `AdvisersPresenceEvent`；**只带数字计数**，不带姓名/标题/台词 |
| `projectToDirective(brief, opts?)` | 经 `PresenceProjector` 产出 `PetDirective`（静音时段/预算/secrecy 仍由 projector 管） |
| `resolveSuggestedLines(brief)` | claims guard：≤40 码点、可追溯到 brief 字段、非胁迫（无“必须/你答应/内疚”等）；不可追溯 → `这个我没记。` |

约束：`confidence < 0.7` 的项不参与投影；过期/空 brief/非法 brief → `null`（idle，不编造记忆）；
`secrecy >= 2` 由 producer 排除（schema 本身无 secrecy 字段，消费端无法也不应推断）。

### 1.1 投影映射

| brief | presence 事件 | 效果（由 projector 决定） |
|---|---|---|
| 今天到期的高风险承诺 | `commitment.due`（P0） | remind：waiting pose + 固定数字台词 `N 件今天到期` |
| 其它 high risk / mood `concerned` | `brief.ready`（P1） | 一句 `N 件事待看` |
| `focused` / `calm` / `pleased` | `brief.ready`（P2） | 只 pulse/pose，不开口 |
| 空 / 过期 / 非法 | `null` | idle |

`suggestedLines` **不进入 projector**（避免自由文本/姓名进入渲染层）；它只经 claims guard 校验后供
baked voice/字幕层使用（本仓尚未接入）。

## 2. 测试

```sh
cd <private-path>
node --import tsx --test tests/pet-brief-consumer.test.ts   # 12/12 pass
npm test                                                   # 全仓 244/244 pass, exit 0（2026-11-15 实测；新增 12 条）
npx tsc --noEmit                                           # 通过
```

`tests/pet-brief-consumer.test.ts` 覆盖：20 条契约向量逐一对照 `expect`；example 接收 + 投影；
拒绝码（malformed/schemaVersion/forbidden/expired/counts/limits/dup id/mood/时间格式）；
`isExpired` 边界与时区；空/过期 → 无 directive；high risk → remind 数字台词；focused → 不说；
共享 projector 去重；claims guard fallback/胁迫句；低置信项不驱动姿势；禁止字段全列表；
`suggestedLines` 上限/长度。另 `npx tsc --noEmit` 通过。

## 3. 未做 / 限制

- **未接 UI 主流程**：未改 `main.ts`/`pet.html`/kernel/save/voice；没有轮询/文件监听/`__pet.brief` 注入。
  本模块目前只被测试引用，等 Phase 2 批准后再接线。
- **不做 I/O**：读文件/轮询/加密落盘由调用方实现（契约要求本地、0600、可丢弃）。
- **不推断 secrecy**：schema 无 secrecy 字段；跨进程隐私过滤责任在 producer（`advisers pet-brief`）。
- **没有真实数据**：测试只用契约 example/testcases 与合成镜头，不含真实客户数据。
- 契约 v0.1 未冻结；若 famling 变更字段，需同步 `src/presence/pet-brief.ts` 的校验与映射并重跑 20 向量。

## 4. v0.2 兼容更新（2026-11-17）

> 本节为追加更新；§0–§3 保留 2026-11-15 的历史快照（当时契约只有 v0.1），不改写历史。

Advisers 侧 Pet Brief 生产者契约已升级到 **v0.2**（`schemaVersion: 2`，新增
`displayPolicy: public | private | none`，默认 `private`；v0.1 兼容）。v0.2 增量 canonical 见公开仓
`PerryLink/advisers` 的 `docs/pet-brief/`（`schema-v0.2.json` / `example-v0.2.json` /
`testcases-v0.2.json`）与 `docs/PET-BRIEF-CONSUMERS.md` §2；本机只读 checkout 为
`<private-path> 7 个 v0.1 快照文件**保持原样**
（v0.1 canonical 仍是私有 `PerryLink/famling` 仓），v0.2 增量不复制进来。

消费端 `src/presence/pet-brief.ts` 已按 `PET-BRIEF-CONSUMERS.md` §2 迁移顺序第 1 步升级：

| 输入 | 消费端行为 |
|---|---|
| v0.1（`schemaVersion: 1`，无 `displayPolicy`） | **仍接受**；按 `private` 处理；`warnings` 含 `W_LEGACY_SCHEMA_VERSION` + `W_MISSING_DISPLAY_POLICY` |
| v0.2 + `public` / `private` | 接受；投影/渲染行为同 v0.1（30s 自动收起等行为项未实现，见 §3） |
| v0.2 缺 `displayPolicy` | 接受，按 `private`，warning `W_MISSING_DISPLAY_POLICY` |
| v0.2 + `none` | 校验通过但返回 `skip`（`reason: 'display_none'`）：**不读取/不渲染/不保留**任何 brief 派生内容，等价 disabled/idle；`toPresenceEvent`/`projectToDirective` 对 none 也返回 `null`，`resolveSuggestedLines` 返回空 |
| 未知 `displayPolicy` 枚举 | `reject`，错误码 `ENUM`（整份丢弃 → idle） |
| `schemaVersion >= 3` / 非整数 | `reject`，错误码仍是 `SCHEMA_VERSION`（fail closed） |

兼容性：现有错误码集合不变；`accept` 结果新增 `warnings: PetBriefWarning[]`（v0.1 为 legacy 提示，
显式 v0.2 policy 时为空数组）；`skip.reason` 由 `user_opt_out` 扩展出 `display_none`；
`PetBrief` 类型新增 `displayPolicy`，accept 时总被规范化（v0.1 → `private`）。

测试（2026-11-17 实测）：

```sh
cd <private-path>
node --import tsx --test tests/pet-brief-consumer.test.ts   # 16/16 pass（原 12 条 + 4 条 v0.2/legacy）
npx tsc --noEmit                                           # 通过
```

新增覆盖：v0.2 `private`/`public` 接受并保持数字投影；`none` → skip（不投影、不出台词）；
缺 `displayPolicy` 默认 `private` + warning；非法枚举 `ENUM` 拒绝；v0.1 legacy 仍接受且规范化为
`private`。v0.1 的 20 条契约向量全部保留；其中快照里用 `schemaVersion: 2` 表示"未知版本"的
`unknown_schema` 向量因 2 已合法，测试改以 `3` 验证同一 fail-closed 语义。

仍属未做（与 §3 一致）：`private` 的 30s 自动收起/一键隐藏/屏幕共享检测、`public` 的显式展示策略、
voice/字幕层接入、真实数据验收；本仓 UI 未改。跨仓 producer v0.2 → consumer 端到端可用
`PET-BRIEF-CONSUMERS.md` §5.3 的 `ADVISERS_HOME` 往返脚本手工验收。

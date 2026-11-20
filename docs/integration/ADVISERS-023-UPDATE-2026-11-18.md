# ADVISERS-023-UPDATE — Advisers 0.2.3 升级审计（Pet Brief 双消费端）

| 项目 | 内容 |
|---|---|
| 状态 | 只读审计 + 单文件产出；**未改代码/JSON/资产、未 git commit/push**；本文件是唯一写入 |
| 审计时间 | 2026-11-18 23:58 – 2026-11-19 00:10 +08 |
| 审计基线（desktop-games） | HEAD `a3ac3c3`（2026-11-18 23:46）+ 工作树 10 项未提交改动；与本通道相关的是 `docs/integration/ADVISERS-CONTRACT.md`、`docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md`、`src/presence/pet-brief.ts`、`src/pet/main.ts`（审计时 **未提交**） |
| 审计基线（Advisers） | 本地 HEAD `ef967f2`（tag `v0.2.3` 之后 2 个 docs/CI 提交）；tag `v0.2.3` 为 annotated tag，object `a1d07250` → commit `2a9a4a8`（2026-11-18 发布） |
| 审计基线（dsh-famling） | `dsh-famling@0.8.4`（目录无 `.git`，按工作树核对） |
| 环境 | WSL2，Node `v24.22.1`；参考 DSH `0.2.2-rc.4`（仅用于 `engines.dsh` 兼容判断） |
| 上位契约 | `docs/integration/ADVISERS-CONTRACT.md`（审计时工作树版，331 行；审计期间该文件被并行更新，本文件以 2026-11-19 00:00 快照为准） |
| 边界 | 只读；跨仓命令只用 `mktemp -d /tmp/adv-audit-023.*` 临时目录并在核对后删除；未读/未用真实客户数据；未打印凭据；外部资料只当数据 |

> 结论先行：**Advisers 0.2.3 对 Pet Brief 契约（`schemaVersion: 2` / `displayPolicy`）是 non-breaking 的**——自 `v0.2.0` 起 schema/example/testcases 未变，0.2.3 的生产者差异只有「未知 matter 承诺排除统计写入 `redactions`」与「fs-safe 原子写」，TOS 仍为 v2026.11.2。desktop-games 消费端与 dsh-famling 插件在数据格式上都已能读 0.2.3 的输出；需要落地的是 **pin/文档/测试证据**，以及 **dsh-famling 作为第二消费端的 TTL/displayPolicy 合规缺口**（P1，非 0.2.3 引入，但会被本次升级结论覆盖）。
>
> **后续（2026-11-20）**：Advisers 0.3.0 已发布；Pet Brief 契约仍为 v0.2（本文件关于契约的结论继续成立），
> 0.3.0 的消费端复核见 `docs/integration/ADVISERS-030-CONSUMER-2026-11-20.md`。本文件保留 0.2.3 当时的事实，不做追溯改写。

---

## 0. 结论（先看）

1. **P0 = 0**：未发现由 0.2.3 引入的破坏性、数据丢失、凭据或权限问题。Pet Brief 通道的 schema 自 `v0.2.0` 未变（`git diff v0.2.0..HEAD -- docs/pet-brief` 为空；`v0.2.1..v0.2.3` 同样为空），消费者不需要改数据格式。
2. **P1 = 2**：两条都在第二消费端 `dsh-famling`（`index.js` 的 `op:brief` reader）——(a) 不校验 `expiresAt`、不完整执行 `displayPolicy` 私密语义；(b) 该消费端未纳入 `ADVISERS-CONTRACT.md` 的契约/验收矩阵。详见 §4。
3. **P2 = 11**：pin/行号/测试矩阵/快照 provenance/其他文档 pin 漂移与上游文档矛盾。其中「契约 pin 证据与验收报告链接」建议与 P1 修复同一批提交。
4. **版本 pin 证据全部核对通过**（§1）：tag `v0.2.3`（annotated `a1d07250` → commit `2a9a4a8`）、npm `latest`/`next` = `0.2.3`、六个发布包 = `0.2.3`、schema sha256 `bd2704c5…`、生产者 `pet-brief.js` sha256 `877675c8…`、TOS v2026.11.2 sha256 `c40f869a…` 均与契约文档 pin 一致。
5. **desktop-games 消费端当前已接受 v0.1 + v0.2**：`schemaVersion 1|2`、缺 `displayPolicy` 按 `private`、非法枚举 `ENUM` 拒绝、未来版本 fail-closed、`none` → skip 且丢弃已保留 brief、TTL 5 分钟、128 KiB；定向 6 个测试文件 **77/77 pass**（§6）。UI 隐私层（private 30s 自动收起/失焦清空/none 不渲染）已在 `face.ts` + `main.ts` 落地，17/17 测试通过。
6. **dsh-famling 数据格式兼容**：reader 接受 `schemaVersion 1|2`、`displayPolicy: none` 拒绝、缺省按 `private`（`index.js:108-117`），但**不校验 TTL、不识别未知 displayPolicy、面板无 private 自动收起**；其自身法律说明已把这条列为已知缺口（`docs/LEGAL-NOTICE-2026-11-18.md:17`）。
7. **TOS/safety 无 0.2.3 增量**：TOS v2026.11.2 未改、无需重新同意；`pet-brief` 仍是受 TOS 门控命令（非豁免），未同意时 exit 3 `E_TOS_REQUIRED`（实测）；safety 规则集 `advisers-content-1` 未变。
8. **dsh-advisers 不是 Pet Brief 消费端**：其 `advisers_brief` 是 IntentBrief（不同物），三个账本工具 0.2.3 新增的 `preview/source/note` 只是附加字段，famling/dsh-famling 均未消费 DSH 工具，无需动作。

---

## 1. 版本 pin 与可复现证据

### 1.1 pin 表（2026-11-19 00:0x 实测）

| 项 | 值 | 复现命令 / 结果 |
|---|---|---|
| 发布 tag | annotated tag `v0.2.3` object `a1d07250a70e6611627f37ecf4cc9e200663a5eb` → commit `2a9a4a89a764eae978d57e07ca3aa52b3ffacaaf` | `git rev-parse v0.2.3`；`git rev-parse v0.2.3^{commit}`；`git cat-file -t v0.2.3` = `tag` |
| 包版本（npm） | `advisers@0.2.3`；六个发布包 lockstep `0.2.3`（advisers / advisers-core / advisers-office / advisers-policy-strict / advisers-bridge-hermes / dsh-advisers） | `npm view advisers version` → `0.2.3`；`npm view advisers dist-tags --json` → `latest`/`next` 均 `0.2.3`；六个包逐个 `npm view <pkg> version` 均 `0.2.3` |
| 契约版本 | `schemaVersion: 2`（contract v0.2）；v0.1 = `1` 作为 legacy 可读 | `docs/pet-brief/schema-v0.2.json`；`lib/pet-brief.js` `PET_BRIEF_SCHEMA_VERSION = 2` |
| 契约快照 sha256 | `schema-v0.2.json` `bd2704c597a3ff96fa4d7862febce05b2864e65008b00e008156dec4c529f083`；`example-v0.2.json` `275c2ee1…`；`testcases-v0.2.json` `4e15eb9b…` | `git show v0.2.3:docs/pet-brief/schema-v0.2.json \| sha256sum`；与工作树及 desktop-games 快照逐字节一致 |
| 生产者实现 sha256 | `packages/advisers/lib/pet-brief.js` `877675c8de9d764b26b7138818a9c394011004adf0f41ed47a524bb40139091b` | `git show v0.2.3:packages/advisers/lib/pet-brief.js \| sha256sum` |
| TOS | v2026.11.2（2026-11-17 生效）；`docs/TOS.md` sha256 `c40f869ad806e74a2e3870e7041d4d4602f6d1a4c2619b80b3e453333b9713dd`；`lib/tos/manifest.json` 与 `terms.zh-CN.md` 同 hash | `git show v0.2.3:docs/TOS.md \| sha256sum`；`sha256sum packages/advisers/lib/tos/terms.zh-CN.md`；TOS 头表 `docs/TOS.md:5-6` |
| 上一 pin（desktop-games 契约历史） | `advisers@0.2.1`（HEAD 版契约）；再早为 `0.2.0` | `git log -p --follow -- docs/integration/ADVISERS-CONTRACT.md` |
| 本地 checkout 与 tag 的差 | HEAD `ef967f2` = `v0.2.3` + 2 个 docs/CI-only 提交；`git diff --name-status v0.2.3..HEAD` 仅 `.github/workflows/publish.yml`、CHANGELOG、README、docs/*、各包 README —— **不含 `packages/advisers/lib/**` 与 `docs/pet-brief/**`** | 同上；因此按 tag 校验的 hash 对当前工作树仍成立 |
| 供应链注意 | 0.2.3 **无 npm provenance attestation**（CHANGELOG §Known issues 明写）；pin 依赖 tag + registry 版本，未做 tarball 签名验证 | 见 §7 未测项 |

### 1.2 复现命令（只读）

```sh
cd /mnt/d/Projects/dsh/plugins/advisers
git rev-parse v0.2.3                        # tag object a1d07250…
git rev-parse 'v0.2.3^{commit}'             # 2a9a4a8…
git show v0.2.3:packages/advisers/lib/pet-brief.js | sha256sum   # 877675c8…
git show v0.2.3:docs/pet-brief/schema-v0.2.json | sha256sum      # bd2704c5…
git show v0.2.3:docs/TOS.md | sha256sum                          # c40f869a…
git diff v0.2.0..HEAD --stat -- docs/pet-brief   # 空
git diff v0.2.1..v0.2.3 --stat -- docs/pet-brief # 空
git diff v0.2.1..v0.2.2 --stat -- packages/advisers/lib/pet-brief.js   # 空（0.2.2 无 Pet Brief 变更）
git diff v0.2.2..v0.2.3 --stat -- packages/advisers/lib/pet-brief.js   # 24+/25-（0.2.3 唯一 Pet Brief 生产者变更）
```

---

## 2. 0.2.3 相对 0.2.1（上一 pin）的 Pet Brief 变更与兼容性

### 2.1 生产者差异（只列与消费者相关的）

| 变更 | 位置 | 消费者影响 | 结论 |
|---|---|---|---|
| 未知/排除 matter 的承诺不再静默消失：新增 `excludedOpen` 统计并把说明写入 `redactions`（最多 10 条，超出的被 `slice(0,10)` 截断） | `packages/advisers/lib/pet-brief.js:211-220`（统计）、`:371-373`（三条中文说明）、`:400`（redactions 截断）；测试 `test/pet-brief-matter.test.js:56-57`；契约 schema `redactions` ≤10 | 消费者**不渲染 `redactions`**（`ADVISERS-CONTRACT.md:301`；`tests/advisers-020-compat.test.ts:266-269` 断言 redactions 不进 summary）；数组长度受 producer 钳制为 10，不会触发 consumer 的 `MAX_ITEMS`（`src/presence/pet-brief.ts:395-400`） | non-breaking |
| `writePetBriefAtomic` 改为复用 `lib/fs-safe.js`（短写循环、fsync、长度校验、同目录临时文件 + 原子 rename；失败清理临时文件） | `packages/advisers/lib/pet-brief.js:18`（import）、`:639-643` | 消费者只读最终文件；原子替换/0600 语义不变，Tauri 读路径无需改 | non-breaking |
| 持久化/读路径性能（schema v20、read-only 快照、增量写等） | CHANGELOG §0.2.3 Persistence/Performance | 与 Pet Brief 文件通道无关 | 无关 |
| `dsh-advisers` 三个账本工具新增 `preview:true` / `source:"preview-no-ledger"` / `note` | `packages/dsh-advisers/index.js:58,67,161-163,834,847,860`；README:39-60 | 桌面宠与 dsh-famling 都不消费这些 DSH 工具（只读 `pet-brief.json`）；`advisers_brief` 未变 | 无关/附加字段 |
| TOS/PRIVACY/DISCLAIMER/SAFETY 文本不变 | CHANGELOG:9,219-222；`docs/TOS.md` pin v2026.11.2 | 不需重新同意；消费者侧无新增义务 | 不变 |

### 2.2 兼容性判断依据

- **契约形状未变**：0.2.3 不新增/删除任何 Pet Brief 字段（schema hash 与 v0.2.0 相同）；`schemaVersion` 仍为 2；`displayPolicy` 默认仍为 `private`；TTL 仍 5 分钟；128 KiB 上限不变。
- **closed schema 仍成立**：新增内容只进 `redactions` 字符串数组；producer 侧 `redactions.slice(0,10)`（`:400`）与 schema `maxItems: 10`、consumer `checkRedactions`（`pet-brief.ts:395-400`）三者一致。
- **counts 一致性不受影响**：producer `counts` 直接由四个数组长度派生（`pet-brief.js:388-393`），consumer `checkCounts` 仍成立（既有 77 测试全绿）。
- **未知 matter 的“披露”只在 `redactions`**：该字段按契约只做日志、不渲染（`ADVISERS-CONTRACT.md:301`），所以「承诺被排除」不会进入桌宠气泡/面板；如果产品要求用户可见的排除说明，需要消费者侧单独产品决策，**不属于 0.2.3 兼容性要求**。

---

## 3. 两端消费实现核对

### 3.1 desktop-games（Pearl/Famling Tauri 壳）— 已兼容，无需改数据格式

| 维度 | 实现证据 | 0.2.3 结论 |
|---|---|---|
| 版本闸门 | `src/presence/pet-brief.ts:38-45` 常量；`:234-240` `isSupportedPetBriefSchemaVersion`；`:480-497` 未来版本 fail-closed（`SCHEMA_VERSION`） | 接受 `1\|2`，无 0.2.3 变更 |
| displayPolicy | `pet-brief.ts:407-429`（缺失→`private`+warning、非法→`ENUM`）；`:520-523` `none`→`skip(display_none)`；`face.ts:655-670` 丢弃已保留 brief；UI 策略 `face.ts:726-756, 764-840, 941-957, 964-1108`；`main.ts:49, 2110, 2168-2171, 2198, 2204-2206, 2237-2239, 2318-2334` | 完整；0.2.3 无字段变化 |
| TTL/128 KiB | `pet-brief.ts:456-466`（raw JSON 128 KiB 前置拒绝）、`:501-509`（TTL/TIME_ORDER）、`:528-534`（`isExpired`）；`face.ts:679-690`（stale）；Tauri `app/tauri/src-tauri/src/main.rs:144-166`（`metadata.len() > 128*1024` 拒绝、只读、无写） | 不变；Rust 未改（见 P2-2） |
| 投影/隐私 | `pet-brief.ts:586-604`（只带数字；`none`→null）；`suggestedLines` 不进投影；claims guard 既有测试 | 不变 |
| 测试 | 6 个定向文件 **77/77 pass**（明细见 §6）；v0.1/v0.2 fixture、public/private/none、legacy、未来版本、cap/TTL、face 状态机 | 可作 0.2.3 验收证据（数字待同步进契约 §10） |

> 审计时 `src/presence/pet-brief.ts:49` 的注释已由并行工作改为 `advisers@0.2.3`（工作树未提交）；代码逻辑无变化（diff 仅该 1 行注释）。

### 3.2 dsh-famling（DSH 插件，同一 `pet-brief.json` 的第二消费端）— 数据格式兼容，但合规未闭环

| 维度 | 实现证据 | 结论 |
|---|---|---|
| reader | `index.js:96-99`（`ADVISERS_HOME` > `USERPROFILE` > `HOME`）、`:101-138` `readBriefProjection()`；`:104-105` 读文件后按 128 KiB 拒绝；`:108` 接受 `schemaVersion 1\|2`；`:111` `displayPolicy: none` → `E_MEMORY`；`:117` 缺省 `private`；投影只保留 counts + 最多 3 条 today/commitments | 数据格式兼容（与契约 §2 的 closed schema 校验不同：它只做白名单投影，不校验全 schema） |
| TTL | **无** `expiresAt`/`generatedAt` 校验（全文件 grep 无 `expiresAt`） | 过期 brief 仍会被投影/显示（P1-1） |
| displayPolicy | 只特判 `none`；未知值（如 `audience`）不 fail-closed，原样进入投影（`:117`）；UI 无 private 30s 自动收起/一键隐藏 | 不满足契约 v0.2 `private` 展示约束（P1-1） |
| UI 暴露面 | `client.js:1907-1917`（设置面板内「读取 Advisers 摘要」按钮触发 `op:brief`）、`:2049-2051`（只显示 counts + 最多 2 条 today title；commitments 不显示） | 暴露的是客户/事项标题与计数；共享屏幕时正是 `private` 要防的场景 |
| 测试 | `test/host-bridge.test.js:178`（投影成功、不泄漏 suggestedLines/evidence）、`:212`（文件缺失→404）；brief 相关仅 2 条 | 缺 v1/v3/none/过期/未知 policy 用例（P1） |
| 自述 | `docs/LEGAL-NOTICE-2026-11-18.md:17` 明列「简报未完整实现 displayPolicy: private 与过期校验」；`:27` 只承诺 none 拒绝 | 与静态代码一致；不是审计新发现，但升级结论必须覆盖 |

### 3.3 dsh-advisers（DSH bundle）— 不是 Pet Brief 消费端，无需动作

- `advisers_brief` 是 **IntentBrief**（goal/deliverable/risk/question/readback），与 Pet Brief 无关：`packages/dsh-advisers/README.md:6,27`；`packages/dsh-advisers/index.js:780`。其 `engines.node >=22.16`、`engines.dsh >=0.2.1-rc.5 <0.3.0`（当前 DSH `0.2.2-rc.4` 在范围内）。
- 三个账本工具 0.2.3 只加 `preview/source/note` 与 `[preview: no ledger]` 前缀（README:39-60）；桌面宠/dsh-famling 不消费 MCP/DSH 工具，桌面宠通道仍只有 `pet-brief.json`（契约 §4.2）。
- 因此本次升级 **不要求** 安装/升级 dsh-advisers；它降级/缺失都不影响 Pet Brief 文件通道。

---

## 4. 分级问题清单（P0 / P1 / P2）

> 每条含：证据（文件:行号）→ 影响 → 修复建议 → 验证方法。**P0 无。**

### P0（0 条）

无。0.2.3 未引入 schema/字段/枚举/大小/TTL/TOS 变化；两端现有消费逻辑在数据格式上均能读 0.2.3 输出（§2/§3 证据 + §6 实测）。

### P1（2 条）

#### P1-1 dsh-famling 第二消费端未执行 Pet Brief v0.2 的 TTL 与 displayPolicy 展示约束

- **证据**：`plugins/dsh-famling/index.js:101-138`（reader 无 `expiresAt` 校验；`:111` 只特判 `none`；`:117` 未知 policy 原样保留）；UI `client.js:1907-1917, 2049-2051`；自述 `docs/LEGAL-NOTICE-2026-11-18.md:17`；测试缺口 `test/host-bridge.test.js:178,212`（brief 仅 2 条）。
- **契约要求**：`ADVISERS-CONTRACT.md:52`（TTL：`now >= expiresAt` → STALE，不把旧承诺当当前事项）、`:66`（v0.2 `private`/`public`/`none` 行为）、`:299`（两套同意独立）；`plugins/advisers/docs/pet-brief/README.md:27-33`（private 必须 30s 自动收起 + 一键隐藏 + 屏幕共享时隐藏文本）；`docs/PET-BRIEF-CONSUMERS.md:28-31`（consumer 侧约束）。
- **影响**：生产端定时任务停止或文件超过 5 分钟后，插件仍会把旧 brief 的 counts + 最多 2 条 today title 显示在设置面板并回一条 thought 气泡；`displayPolicy` 未知值不 fail-closed、private 面板不会自动收起/清空。共享屏幕/录制/旁观的场景下，客户或事项标题可能停留可见——这正是 v0.2 `displayPolicy: private` 要防的风险。**不是 0.2.3 引入**（0.2.3 未改 displayPolicy/TTL 语义），但在声明「双端兼容 0.2.3」时必须打上限定。
- **修复建议**（dsh-famling 侧，需另开任务/由 lead 安排）：
  1. reader 增加 `expiresAt` 解析与 `now >= expiresAt` → 返回稳定错误码（如 `E_MEMORY`/新增 `E_STALE`），不投影；非法/缺失时间按过期处理（fail-closed，与主消费端一致）。
  2. 增加 `displayPolicy` 枚举校验：`public|private|none`；缺失/未知 → 按 `private`，并在投影里带 `displayPolicyFallback: true`（或直接拒绝），不得 fail-open。
  3. UI 对 `private` 增加 30s 自动收起 + 一键隐藏（或至少：面板失焦/页面不可见时清空 brief 文本）；`none` 保持现状（已拒绝）。
  4. 可选（附带）：`:104-105` 目前先 `readFile` 再判大小，建议先 `stat`/限长读取，避免超大本地文件占内存（与 task-38 鲁棒性审计重叠）。
- **验证**：`node --test test/*.test.js` 新增用例——v0.1 legacy 接受、v3 拒绝、`none` 拒绝、缺 `displayPolicy` → `private`、过期 fixture → 错误、未知 policy → 不回显；UI 行为可仿 `tests/advisers-ui-privacy.test.ts` 用 fake timer 测 30s/隐藏事件。

#### P1-2 dsh-famling 未纳入 ADVISERS-CONTRACT 的契约/验收矩阵（同一文件、无人负责的消费端）

- **证据**：`docs/integration/ADVISERS-CONTRACT.md:5-9`（负责范围只写 desktop-games）、`:24-35`（pin 表只描述单一消费端）、`:308-317`（测试矩阵只有 desktop-games 的 6 个测试文件）；dsh-famling 与 desktop-games 读同一路径 `~/.advisers/pet-brief.json`（`plugins/dsh-famling/index.js:96-102` vs `app/tauri/src-tauri/src/main.rs:144` 路径解析），却不在同一验收清单里。
- **影响**：下一次 producer 契约变更（例如 0.3 `schemaVersion: 3`、字段收紧、TTL/上限变化）可能静默破坏插件；插件侧没有与 producer 对齐的测试门（brief 仅 2 条测试且无版本矩阵），隐私义务（displayPolicy private）在契约中没有 owner。
- **修复建议**：把 dsh-famling 作为「第二消费端」写进 `ADVISERS-CONTRACT.md` §1.1/§9/§10 与 `docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md`；在 `plugins/dsh-famling/test/host-bridge.test.js` 增加与 `tests/advisers-020-compat.test.ts` 对齐的最小矩阵（v1/v2/none/未知版本/过期/128 KiB）；在插件 README/DETAIL 写明「Pet Brief contract v0.2 / `schemaVersion 1|2` / 已按 `advisers@0.2.3` 输出核对」。
- **验证**：契约文档评审 + `node --test test/*.test.js`；在升级清单中把「两端」固定为 desktop-games 与 dsh-famling。

### P2（11 条，全部为文档/pin/测试证据类，无运行时阻断）

#### P2-1 契约 pin 证据不完整、验收报告链接仍是旧 0.2.0 审计
- 证据：`ADVISERS-CONTRACT.md:9` 与 `:331` 的「验收报告」指向 `docs/audit/ADVISERS-020-COMPAT-2026-11-17.md`；`:29` 只写 tag→commit、未记 annotated tag object `a1d07250`；`:31` 的证据命令仍是 `git diff v0.2.0..HEAD`；`:327` 证据链接写 `CHANGELOG.md（0.2.0）`。
- 影响：读者按契约无法直接复核 0.2.3 的 tag object/hash 证据链；新审计报告无入口。
- 修复：把本文件的路径写入 §1.1「验收报告」，补 tag object sha、`v0.2.3` tag 文件 hash 证据，更新 §11 链接为 CHANGELOG §0.2.3；一并修 P2-3。
- 验证：`grep -n 'ADVISERS-023' docs/integration/ADVISERS-CONTRACT.md` 命中；`git rev-parse` 命令可在文档内复现。

#### P2-2 契约中的 Tauri `main.rs` 行号漂移
- 证据：`ADVISERS-CONTRACT.md:35,178,329` 写 `main.rs:85` / 注册于 `:536`；实际 `app/tauri/src-tauri/src/main.rs:144` 是 `fn read_advisers_brief`、`:160` 是 `metadata.len() > 128*1024`、`:600` 是 `invoke_handler` 注册行（`:75` 是 `safe_slug`）。
- 影响：审计/复核按旧行号会读到无关代码（`:85` 不是该命令）。
- 修复：契约三处替换为 `main.rs:144`、`:160`、`:600`；若保留「建议补丁」段落，注明补丁未应用（现状仍为 sync `fn`）。
- 验证：`grep -n 'fn read_advisers_brief' app/tauri/src-tauri/src/main.rs` → 144。

#### P2-3 契约 §10 测试矩阵日期/数量过期且缺两层
- 证据：`ADVISERS-CONTRACT.md:310` 表头仍是「2026-11-17 本机」；`:312-315` 只列 24+16+6+11（=57），缺 `tests/advisers-source.test.ts`（3）与 `tests/advisers-ui-privacy.test.ts`（17），也未列 0.2.3 新增的 `packages/advisers/test/pet-brief-matter.test.js`。
- 2026-11-18/19 实测：6 个 consumer 文件 **77/77 pass**（24+16+6+11+3+17），producer `pet-brief.test.js` **28/28**。
- 影响：契约给出的验收数字既过时又不完整，无法支撑「0.2.3 已验证」。
- 修复：表头改 2026-11-19；补 source/ui-privacy/matter 三层与 77/77、28/28 结果；保留旧数据为历史或直接替换。
- 验证：按 §6 命令重跑一遍即可复现。

#### P2-4 契约 §4 仍以「0.2.0 相对 preview」为标题，缺 0.2.1→0.2.3 增量小节
- 证据：`ADVISERS-CONTRACT.md:96-119` 是 §4.1/§4.2（0.2.0 视角）；`:37` 只有一个 blockquote 提到 0.2.3，未纳入章节结构；§5 升级清单仍以 0.2.0 为对象。
- 影响：本次 pin 从 0.2.1 跳到 0.2.3（跳过 0.2.2），读者看不出这一段的实际 delta（本审计 §2 已给出：0.2.2 无 Pet Brief 变更，0.2.3 仅 redactions + fs-safe）。
- 修复：§4 增加「4.3 0.2.1/0.2.2 → 0.2.3（2026-11-18）」表（或直接引用本文件 §2）；§5 第 1 步的发布证据改为 `v0.2.3`。
- 验证：文档评审。

#### P2-5 `DSH-FAMLING-BRIDGE-2026-11-17.md` 行号引用针对 0.2.1，已漂移
- 证据：`docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md:26` 仍写 `pet-brief` 默认路径见 `bin/advisers.js:1329`、TOS 门 `:4337-4341`/`:4396-4412`/`:4614`；实际 0.2.3 代码：`--out` 默认路径在 `packages/advisers/bin/advisers.js:2823`（`outFlag === true ? join(HOME,'pet-brief.json')`），`TOS_EXEMPT_COMMANDS` 在 `:6912`（当前 exempt 仅 `help/version/status/doctor/init/tos/privacy/export/audit/purge`），L1 gate 在 `:6983+/:7189+`。
- 影响：桥接文档的复核命令会指向无关代码；跨仓读者可能误判 TOS 门位置。
- 修复：只更新行号引用（文案 pin 已在工作树改为 0.2.3）；或改为「以 grep 命令定位」而非硬行号。
- 验证：逐条 `sed -n '<line>p'` 核对。

#### P2-6 其他文档仍 pin `advisers@0.2.1` / 旧插件版本
- 证据：`docs/design/FAMLING-DSH-ARCH-2026-11-18.md:51`（`advisers@0.2.1` pin）；`docs/integration/FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18.md:4`（基于 `advisers@0.2.1`，同时写 `dsh-famling@0.5.2`）；均早于 0.2.3 发布/插件 0.8.4。
- 影响：多份文档对同一 pin 说法不一致（契约/桥接已 0.2.3，设计稿 0.2.1）。
- 修复：设计/架构稿在「基于」字段补「advisers 0.2.3 为当前 pin；Pet Brief 契约自 v0.2.0 未变」或改写为 0.2.3；插件版本按实际 0.8.4 注明。
- 验证：`grep -rn 'advisers@0.2.1' desktop-games/docs` 清零（或仅历史快照保留）。

#### P2-7 desktop-games 内的 v0.2 契约快照缺 provenance/许可说明，且复制来的 README 状态过期
- 证据：`docs/contracts/pet-brief/v0.2/` 只有 `README.md`/`example-v0.2.json`/`schema-v0.2.json`/`testcases-v0.2.json`（2026-11-17 23:14 复制，与 `plugins/advisers/docs/pet-brief/` 逐字节一致：schema `bd2704c5…`、example `275c2ee1…`、testcases `4e15eb9b…`、README `b6f7b7ce…`），无 `SOURCE.md`；复制来的 README 头仍写「消费端同步中」，且第 45 行写「desktop-games 当前硬校验 schemaVersion === 1」（与当前代码/验收矛盾）。
- 影响：快照来源（tag/commit/date）与许可归属不可复核；过期状态文本会被后续读者当真。
- 修复：新增 `docs/contracts/pet-brief/v0.2/SOURCE.md`（来源：`PerryLink/advisers` tag `v0.2.3` commit `2a9a4a8`；四文件 sha256；只读、不修改），并在本地 README §4 注明「复制的 upstream README 状态已过期，以本仓 §4 与契约文档为准；许可：CC BY-NC-SA 4.0（TOS §3.2），schema/test vector 的互操作许可见 TOS §3.2.2」。
- 验证：`sha256sum docs/contracts/pet-brief/v0.2/*` 与 `git show v0.2.3:docs/pet-brief/* | sha256sum` 一致；SOURCE.md 存在。

#### P2-8 `docs/contracts/pet-brief/README.md` §4 的「仍未做」已过期
- 证据：`docs/contracts/pet-brief/README.md:128-130` 写「private 的 30s 自动收起/一键隐藏/屏幕共享检测、public 显式展示策略、voice/字幕层接入…仍属未做」；实际 UI 隐私层已实现：`src/pet/advisers/face.ts:726-756, 941-957, 964-1108`，`src/pet/main.ts:2168-2171, 2318-2334`，`tests/advisers-ui-privacy.test.ts` 17/17。屏幕共享/录制**检测**确实仍未实现（见 UI 审计 §0.6），但 30s/失焦/pagehide/一键隐藏已实现。
- 影响：跨仓审计口径冲突（Advisers 侧与旧报告会据此认为 consumer 未实现 displayPolicy）。
- 修复：把 §4 的「仍属未做」改为「已实现 private/public/none 展示行为（2026-11-17，tests/advisers-ui-privacy.test.ts）；显式屏幕共享/录制检测仍未实现，属后续」；补 0.2.3 pin 与本审计引用。
- 验证：文档评审 + `node --import tsx --test tests/advisers-ui-privacy.test.ts` 17/17。

#### P2-9 consumer fixtures 的 provenance 仍写 `advisers@0.2.0`，且缺 0.2.3 redactions 形状回归
- 证据：`tests/advisers-fixtures/README.md:13` 写 fixture 源自 `advisers@0.2.0` tag `v0.2.0`；`tests/advisers-fixtures/pet-brief-v0.2.json` 与 v0.2 契约同形（无需改字节）。本审计实测 consumer 对 0.2.3 形状（10 条 redactions，含新增 matter 排除说明）accept、11 条 reject。
- 影响：fixture 来源与当前 pin 不一致；0.2.3 新增的 redactions 形状没有回归用例（虽然 schema 未变，producer 行为已变）。
- 修复：README 改为「源自 v0.2.0，已按 v0.2.3 tag hash/输出形状复核；字节未变」；在 `tests/advisers-020-compat.test.ts` 增加 1 条「redactions=10（含 3 条 matter 排除说明）」accept 与「redactions=11」reject 的用例。
- 验证：`node --import tsx --test tests/advisers-020-compat.test.ts` → 25/25。

#### P2-10 dsh-famling 文档版本漂移（与 P1-1/P1-2 同批修）
- 证据：`plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md:3` 与 `:172` 写「适用插件版本 dsh-famling 0.7.5」；实际 `package.json` 为 `0.8.4`。`README.md:122` 写 DSH `0.2.2-rc.3`（当前运行 0.2.2-rc.4，供参考）。插件 README/DETAIL 均无 Advisers pin/兼容声明。
- 影响：法律说明与 README 的事实时点落后于代码；没有「支持 Pet Brief contract v0.2 / schemaVersion 1|2 / 已核对 0.2.3」的陈述。
- 修复：legal notice 版本与「适用插件版本」改为当前版本；README/DETAIL 增加 Pet Brief 兼容段（支持版本、读取路径、none 拒绝、private/TTL 现状与修复计划）。
- 验证：文档评审；`node -e` 读 `package.json` 对齐。

#### P2-11 上游 Advisers 文档自相矛盾（只读发现，报告给上游维护者；本仓不改）
- 证据：`plugins/advisers/docs/pet-brief/README.md:3`（「消费端同步中」）与 `:45`（「已接消费者当前硬校验 schemaVersion === 1」）已过期——desktop-games 自 2026-11-17 已接受 `1|2`（`src/presence/pet-brief.ts:38-51`），且 `docs/PET-BRIEF-CONSUMERS.md:3-4,28` 已写「已接受 v0.2」。`docs/PET-BRIEF-PRODUCER.md:3,136` 仍写 `advisers@0.2.0` 已发布/当前 `0.2.1`，未提 0.2.3。
- 影响：跨仓审计会出现两种口径（「consumer 硬校验 1」vs「已接受 v0.2」），容易被误读成升级风险仍在。
- 修复（上游）：Advisers 侧更新这 3 个文档到 0.2.3 / 已接 v0.2 的事实；本审计**只报告不修改**（Advisers 仓不是本任务写范围）。
- 验证：上游文档与 `PET-BRIEF-CONSUMERS.md` §1.1 一致。

---

## 5. 需改文件 / 测试 / pin 清单

### 5.1 版本 pin 矩阵

| 消费端 | 当前 pin / 兼容声明 | 0.2.3 需要改什么 |
|---|---|---|
| desktop-games（Pearl/Famling） | 契约 v0.2；`schemaVersion 1\|2`；文档 pin `advisers@0.2.3`（工作树） | **不改数据格式/代码逻辑**；只改契约/快照/fixtures 的 pin 与测试证据（P2-1..P2-9）；`pet-brief.ts` 仅注释（已改） |
| dsh-famling | 无显式 pin；代码接受 `schemaVersion 1\|2`、`none` 拒绝 | **代码需改**（TTL/displayPolicy，P1-1）；纳入契约/验收（P1-2）；文档补 pin（P2-10） |
| dsh-advisers | `0.2.3`（内部依赖 `advisers@0.2.3`、`@deepseek-ai/dsh-tools 0.2.2-rc.2`；`engines.dsh >=0.2.1-rc.5 <0.3.0`） | **无动作**（不是 Pet Brief 消费端；当前 DSH 0.2.2-rc.4 兼容） |
| Tauri Rust `read_advisers_brief` | 未变（仍为 sync；contract §7 加固补丁未应用） | 不作为 0.2.3 升级条件；按 P2-2 修行号，补丁另排期 |

### 5.2 文件级清单

| # | 仓库/文件 | 动作 | 优先级 | 关联 | 验证 |
|---|---|---|---|---|---|
| 1 | `desktop-games/docs/integration/ADVISERS-CONTRACT.md` | 更新 §1.1/§4/§5/§7/§9/§10/§11：tag object、验收报告链接、测试矩阵 77/77、行号 144/160/600、加入 dsh-famling 第二消费端 | P2（建议与 P1 同批） | P1-2/P2-1/P2-2/P2-3/P2-4 | grep/sed 复核 §6 命令 |
| 2 | `desktop-games/docs/integration/ADVISERS-023-UPDATE-2026-11-18.md` | 本审计文件（唯一新增） | — | — | 本文件 |
| 3 | `desktop-games/docs/contracts/pet-brief/v0.2/SOURCE.md`（新建） | 补 provenance + 许可说明 | P2 | P2-7 | sha256 对齐 v0.2.3 tag |
| 4 | `desktop-games/docs/contracts/pet-brief/README.md` | §4 更正「仍未做」+ 加 0.2.3 pin/本审计引用 | P2 | P2-8 | 文档评审 |
| 5 | `desktop-games/tests/advisers-fixtures/README.md` | provenance 更新为已按 v0.2.3 复核 | P2 | P2-9 | 文档评审 |
| 6 | `desktop-games/tests/advisers-020-compat.test.ts` | 新增 10/11 条 redactions 回归（可选） | P2 | P2-9 | 25/25 |
| 7 | `desktop-games/docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md` | 行号引用改为 0.2.3 实际位置（或改 grep 式引用） | P2 | P2-5 | sed 逐条 |
| 8 | `desktop-games/docs/design/FAMLING-DSH-ARCH-2026-11-18.md` / `docs/integration/FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18.md` | 0.2.1 → 0.2.3 / 最新插件版本 | P2 | P2-6 | grep `advisers@0.2.1` |
| 9 | `plugins/dsh-famling/index.js` | 加 TTL/`displayPolicy` 枚举校验/未知值 fail-closed；`none` 保持拒绝 | **P1** | P1-1 | `node --test test/*.test.js` |
| 10 | `plugins/dsh-famling/test/host-bridge.test.js` | 加 v1/v3/none/过期/未知 policy 用例 | **P1** | P1-1/P1-2 | 上文命令 |
| 11 | `plugins/dsh-famling/client.js`（可选） | private 面板 30s 自动收起/失焦清空。**注意**：`client.js` 含 `scripts/embed-anims.mjs` 生成的嵌入块，改 UI 逻辑需避开生成块或同步脚本 | P1（与 9/10 同批） | P1-1 | 静态测试 + 手工 UI |
| 12 | `plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md` / `README.md` / `docs/DETAIL.md` | 版本 0.7.5→0.8.4；补 Pet Brief 兼容/现状声明 | P2 | P2-10 | 文档评审 |
| 13 | `plugins/advisers/docs/pet-brief/README.md` / `docs/PET-BRIEF-PRODUCER.md` / `docs/PET-BRIEF-CONSUMERS.md` | 上游文档更新（**报告，不修改**） | 上游 | P2-11 | 上游维护者 |

---

## 6. 已执行验证（本机 2026-11-18/19，全部为真实运行结果）

### 6.1 Advisers producer

```sh
cd /mnt/d/Projects/dsh/plugins/advisers/packages/advisers
node --experimental-strip-types --test test/pet-brief.test.js
# => 28 tests / 28 pass / 0 fail（含 --out 原子写 0600、--check/--strict、--print-schema、legacy v0.1、display-policy）
git -C /mnt/d/Projects/dsh/plugins/advisers diff --stat v0.2.2..v0.2.3 -- packages/advisers/lib/pet-brief.js
# => 1 file changed, 24 insertions(+), 25 deletions(-)
```

### 6.2 desktop-games consumer（定向 6 个文件）

```sh
cd /mnt/d/Projects/dsh/desktop-games
node --import tsx --test tests/advisers-020-compat.test.ts tests/pet-brief-consumer.test.ts tests/advisers-face.test.ts tests/advisers-harden.test.ts tests/advisers-source.test.ts tests/advisers-ui-privacy.test.ts
# => tests 77 / pass 77 / fail 0
# 分文件：020-compat 24/24、pet-brief-consumer 16/16、face 6/6、harden 11/11、source 3/3、ui-privacy 17/17
```

### 6.3 跨仓 producer→consumer 验收（临时 `ADVISERS_HOME`，未碰真实 `~/.advisers`）

```sh
TMPD=$(mktemp -d /tmp/adv-audit-023.XXXXXX)
cd /mnt/d/Projects/dsh/plugins/advisers
ADVISERS_HOME=$TMPD ADVISERS_ACCEPT_TOS=1 node packages/advisers/bin/advisers.js --version
# => 0.2.3
ADVISERS_HOME=$TMPD ADVISERS_ACCEPT_TOS=1 node packages/advisers/bin/advisers.js pet-brief --print-schema > $TMPD/schema.json
# --print-schema 输出与 docs/pet-brief/schema-v0.2.json 深比较 => true
# fresh-v0.2.json = tests/advisers-fixtures/pet-brief-v0.2.json 仅把 generatedAt/expiresAt 改为 now/now+5min
ADVISERS_HOME=$TMPD ADVISERS_ACCEPT_TOS=1 node packages/advisers/bin/advisers.js pet-brief --check --strict --in $TMPD/v0.2-fresh.json
# => ok:true, errors:[], warnings:[], exit 0
ADVISERS_HOME=$TMPD ADVISERS_ACCEPT_TOS=1 node packages/advisers/bin/advisers.js pet-brief --check --in $TMPD/v0.1-fresh.json
# => ok:true + W_LEGACY_SCHEMA_VERSION + W_MISSING_DISPLAY_POLICY, exit 0
ADVISERS_HOME=$TMPD ADVISERS_ACCEPT_TOS=1 node packages/advisers/bin/advisers.js pet-brief --check --strict --in $TMPD/v0.1-fresh.json
# => ok:false + E_SCHEMA_VERSION + E_DISPLAY_POLICY, exit 1
TMPD2=$(mktemp -d /tmp/adv-audit-023-tos.XXXXXX)
ADVISERS_HOME=$TMPD2 node packages/advisers/bin/advisers.js pet-brief --check --in $TMPD/v0.2-fresh.json
# => exit 3 + stderr E_TOS_REQUIRED（TOS 门控实测）
rm -rf "$TMPD" "$TMPD2"   # 两个路径均在 /tmp/adv-audit-023* 下，删除前已打印绝对路径
```

### 6.4 consumer 对 v0.2.3 输出形状/策略的实测（内存对象，不写文件）

| 输入 | 结果 |
|---|---|
| `example-v0.2.json`（固定 now=2026-11-17T09:02+08） | `accept` |
| 缺 `displayPolicy` | `accept` + `W_MISSING_DISPLAY_POLICY`（按 private） |
| `displayPolicy: none` | `skip(display_none)` |
| `displayPolicy: audience` | `reject ENUM` |
| `schemaVersion: 3` | `reject SCHEMA_VERSION` |
| `schemaVersion: 1`（无 displayPolicy） | `accept` + `W_LEGACY_SCHEMA_VERSION` + `W_MISSING_DISPLAY_POLICY` |
| `redactions`: 10 条（含 0.2.3 的 matter 排除说明形状） | `accept` |
| `redactions`: 11 条 | `reject MAX_ITEMS`（producer 侧 `slice(0,10)` 保证不会出现） |

### 6.5 dsh-famling

```sh
cd /mnt/d/Projects/dsh/plugins/dsh-famling
node --test test/host-bridge.test.js   # => 14/14 pass（含 2 条 brief 用例）
node --test test/*.test.js             # => 48 tests / 46 pass / 2 fail
# 2 fail 与本审计无关，来自并行动画工作的嵌入数据过期：
#  - client-static.test.js:205 embedded source-sha256 is stale（assets e7ed5973… vs embedded 6e575f2b…）
#  - embedded regions/actions 与 private regions.json 不一致（human）
# => 当前插件工作树不是全绿；Advisers 相关 brief 用例本身通过。
```

### 6.6 只读静态核对（未运行，标注静态审计）

| 项 | 方式 | 结论 |
|---|---|---|
| Tauri `read_advisers_brief` | 静态读 `app/tauri/src-tauri/src/main.rs:144-166` | 0.2.3 无需改；契约 §7 的 symlink/TOCTOU/async 加固仍为「建议未应用」 |
| dsh-advisers 0.2.3 行为 | 读 `packages/dsh-advisers/index.js`/README | 与 Pet Brief 无关；未安装/未运行 |
| 上游 Advisers 发布 CI 证据 | 只读 CHANGELOG/eval 文档 | 未独立重跑其 CI；本审计只看本机测试与 hash |
| 屏幕共享/录制检测 | 只读代码 + 既有 UI 审计 | consumer 未实现显式检测（UI 审计 §0.6 自述）；本审计未新增实测 |

---

## 7. 未测 / 剩余未知（不要当成已验证）

1. **npm provenance/签名**：0.2.3 无 provenance attestation（CHANGELOG §Known issues）；本审计只验证了 registry 版本 `0.2.3` 与仓内 tag/hash，未验证发布 tarball 与 tag 内容逐字节一致（仓内 `verify-release.mjs --version 0.2.3` 是 Advisers 侧声明，未在本机重跑）。
2. **真实账本端到端**：没有真实 `state.db`/`~/.advisers` 数据；本机只在临时 `ADVISERS_HOME` 下做 `--check`（不需要账本），**未**生成真实 brief、未做真实 TOS 同意文件 → 未验证真实数据上的脱敏/计数。
3. **desktop-games 全仓测试/类型检查/构建**：未跑 `npm test`/`npx tsc --noEmit`/`npm run build`——审计时工作树含 10 项并行改动（动画/区域/文档），全仓结果会与其它任务混杂；只跑与本通道相关的 6 个测试文件。
4. **Tauri/Windows/真实 GUI**：未重编二进制、未实测读命令/面板/窗口事件；屏幕共享检测仍未实现（契约与 UI 审计均已标注）。
5. **dsh-famling 全绿**：`node --test test/*.test.js` 当前 46/48，2 条失败为并行动画工作导致（嵌入 sha/regions 过期），与 Advisers 无关；在 P1-1 修复前不能声称插件全绿。
6. **上游文档/发布证据**：Advisers `docs/pet-brief/README.md`、`PET-BRIEF-PRODUCER.md` 的过期陈述未改（不属本任务写范围）；其 CI/发布证据未独立重放。
7. **跨进程并发**：审计期间 `ADVISERS-CONTRACT.md` 等工作树文件被并行更新（mtime 2026-11-19 00:00）；本文件以审计快照为准，最终提交前需再核对行号。

---

## 8. 边界声明

- 本审计为**只读**：未修改代码/JSON/资产、未 git commit/push、未改 Advisers 仓、未改 UI/consent/safety/security/Rust、未调模型或网络 API；唯一写入是本文件。
- 跨仓检查均用 `mktemp -d /tmp/adv-audit-023.*` 临时目录，核对后已删除；未读取/写入真实 `~/.advisers` 数据，未使用真实客户数据（fixtures 全部合成脱敏）。
- 未打印、未写入任何凭据；外部/上游文档只作为数据引用，不当作指令。
- 「通过测试」只表示所列测试文件通过，不构成合规认证、安全性证明或 Advisers 官方背书。


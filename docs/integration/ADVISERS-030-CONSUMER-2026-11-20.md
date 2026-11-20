# ADVISERS-030-CONSUMER — Advisers 0.3.0 消费端兼容复核（desktop-games / Pet Brief）

| 项目 | 内容 |
|---|---|
| 状态 | **生效（2026-11-20）**：消费端 pin/fixtures/测试/文档已按 0.3.0 更新；consumer 逻辑零改动；未改 Advisers 仓、未 commit/push |
| 日期 | 2026-11-20 |
| desktop-games 基线 | HEAD `47438ac`（2026-11-20 14:21 +08，「chore(status): final round11 truth with test counts」） |
| Advisers 基线 | annotated tag `v0.3.0`（tag object `f3ac0093271bb1ba4eda99286ac12772a190b8d7`）→ commit `1199fbfe79ef70dcb013775549de450c8a864aac`；本地 checkout HEAD `e3f440d`（= tag + 1 个 docs-only 提交） |
| 环境 | WSL2 Ubuntu，Node `v24.22.1`，npm `11.19.1`；安装源 **`https://registry.npmjs.org`**（本机 npmmirror 缓存滞后，未用于判断 latest） |
| 上位契约 | `docs/integration/ADVISERS-CONTRACT.md`（本次更新 §1.1 pin / §4.3 增量 / §5–§11） |
| 结论 | **Advisers 0.3.0 是 package release，不是 Pet Brief contract release；契约仍为 v0.2（`schemaVersion: 2`）；consumer 零代码改动；P0 = 0；唯一需要执行的是 producer 侧重同意 TOS v2026.11.3。** |

> 结论先行：0.3.0 的 `docs/pet-brief/` 与 `v0.2.3` **逐字节相同**（零 diff），安装包 `advisers pet-brief --print-schema` 的 sha256
> 与 consumer 已验证的 v0.2 快照一致；0.3.0 的 producer 差异（`lib/pet-brief.js` +102/−39）是性能/投影重构，注释声明 output-equivalent，
> 输出仍通过现有 consumer（新增真实 0.3.0 输出 fixture，6/6 测试）。真正的变化在 **TOS v2026.11.3（需重新同意）**、provenance 发布与
> ledger schema v21（与文件通道无关）。

---

## 1. 基线、pin 与安装证据

### 1.1 Advisers 0.3.0 发布身份

| 项 | 值 | 证据 |
|---|---|---|
| npm `latest` / `next` | `0.3.0` / `0.2.3`（0.2.4 从未发布，被 0.3.0 吸收） | `https://registry.npmjs.org/advisers`（raw registry packument）；`npm view advisers version --registry=https://registry.npmjs.org` → `0.3.0` |
| workspace lockstep | 八包 `0.3.0` = 六个发布包（advisers / advisers-core / advisers-office / advisers-policy-strict / advisers-bridge-hermes / dsh-advisers）+ 两个私有 link-*（不发布） | 各 `packages/*/package.json`；npm registry 逐包查询 |
| 发布 tag | annotated tag `v0.3.0` object `f3ac0093…` → commit `1199fbfe…` | `git rev-parse v0.3.0` / `git rev-parse 'v0.3.0^{commit}'` / `git cat-file -t v0.3.0` = `tag` |
| 发布后提交 | `e3f440d` = tag + 1 个 docs-only 提交（CHANGELOG/README/docs/*，**不含** `packages/advisers/lib/pet-brief.js` 与 `docs/pet-brief/**`） | `git diff --name-status v0.3.0..HEAD` |
| 供应链 | 0.3.0 是首个 Trusted-Publishing/OIDC release：六包 `dist.attestations` 含 `url` + `provenance`；附 CycloneDX 1.7 SBOM；仓库 `verify-release --version 0.3.0 --require-sbom` 记录 222 checks | npm registry 逐包 `dist.attestations`；Advisers `CHANGELOG.md` §0.3.0 Status/Provenance；`docs/SBOM.md` |
| 未验证项 | 本机**没有**重跑 Advisers 仓 release 验证脚本，也没有对 attestation 做密码学验证；只核对 `dist.attestations` 非空 + 包完整性 hash | 见 §6 |

### 1.2 npm registry 六包元数据（2026-11-20 查询）

| 包 | latest / next | 版本 | integrity（sha512，截断） | attestations | published（UTC） |
|---|---|---|---|---|---|
| `advisers` | 0.3.0 / 0.2.3 | 0.3.0 | `sha512-Cy5dVV13ChD2vIqTSxjbM/EeokfUN23Ri1YgeKUSPlhHQDjPp+aMQr8p40iLFiAYtaknNekktjGvX+b6QGm80g==`（完整） | `url`+`provenance` | 2026-11-20T09:01:37Z |
| `advisers-core` | 0.3.0 / 0.2.3 | 0.3.0 | `sha512-6eUxEcqc…` | `url`+`provenance` | 2026-11-20T08:59:47Z |
| `advisers-office` | 0.3.0 / 0.2.3 | 0.3.0 | `sha512-QqzUcsOL…` | `url`+`provenance` | 2026-11-20T08:58:53Z |
| `advisers-policy-strict` | 0.3.0 / 0.2.3 | 0.3.0 | `sha512-ANUserlx…` | `url`+`provenance` | 2026-11-20T08:58:35Z |
| `advisers-bridge-hermes` | 0.3.0 / 0.2.3 | 0.3.0 | `sha512-8y6oM5Qh…` | `url`+`provenance` | 2026-11-20T08:58:40Z |
| `dsh-advisers` | 0.3.0 / 0.2.3 | 0.3.0 | `sha512-i4x7yq3q…` | `url`+`provenance` | 2026-11-20T09:02:41Z |

> `advisers` tarball 对消费端的实际意义：本机安装的 `package-lock.json` 记录 `resolved=https://registry.npmjs.org/advisers/-/advisers-0.3.0.tgz`，
> `integrity` 与上表完整值一致；安装后 `node_modules/advisers/package.json` = `0.3.0`、`engines.node >=22.16`、`bin.advisers = ./bin/advisers.js`。
> `npm pack advisers@0.3.0` 复现 tarball（505,938 B）：sha1 `77cd526ca1605c0247940896c02cd42c8ea3a8d4`（= registry `dist.shasum`）、
> sha512 `Cy5dVV13…`（= registry `dist.integrity`）、sha256 `ea697c9ec98edf2483ba94fe45b4530e2d4576dffb15aa6d2ea28a055edc4693`。

### 1.3 本机安装（隔离临时目录，不写入本仓依赖）

```sh
rm -rf /tmp/adv030-consumer && mkdir -p /tmp/adv030-consumer
cd /tmp/adv030-consumer
echo '{"name":"adv030-consumer","private":true,"version":"0.0.0"}' > package.json
npm install advisers@0.3.0 --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund
# added 24 packages in 4s；node_modules/.bin/advisers --version → 0.3.0
```

desktop-games 的 `package.json` **没有**新增/修改 `advisers` 依赖（consumer 只读文件契约，不 import producer 包）；临时安装仅用于证据生成。

### 1.4 契约与生产者/TOS hash（Advisers tag `v0.3.0`）

| 对象 | sha256 | 说明 |
|---|---|---|
| `docs/pet-brief/schema-v0.2.json` | `bd2704c597a3ff96fa4d7862febce05b2864e65008b00e008156dec4c529f083` | 与 v0.2.0/v0.2.3 相同；= 安装包 `pet-brief --print-schema` 输出 |
| `docs/pet-brief/example-v0.2.json` | `275c2ee1ac70d1ac84cbc17cf869beac2e4068e4d560717c2518a18011271cff` | 与 v0.2.3 相同 |
| `docs/pet-brief/testcases-v0.2.json` | `4e15eb9bd94467b16e91e47e77d9589513a219e8243f799d5052a57d432598c1` | 26 向量；与 v0.2.3 相同 |
| `packages/advisers/lib/pet-brief.js` | `70651e566cc566a00b6d225cf72757862ae7dab2ca7f0d996c56473757b714cb` | 0.2.3 为 `877675c8…`；0.3.0 +102/−39（性能/投影重构） |
| `docs/TOS.md` | `6d508bd73eeac133f4a6b86df1ce0e4130acdfe65105b05137ccc3b2f4df28b0` | v2026.11.3（2026-11-20 生效）；= 安装包 `tos status --json.textSha256` |

---

## 2. 0.3.0 相对 0.2.3 的 Pet Brief 变化

### 2.1 契约：零变化

- `git diff --name-status v0.2.3..v0.3.0 -- docs/pet-brief docs/PET-BRIEF-PRODUCER.md docs/PET-BRIEF-CONSUMERS.md` → **空**。
- 仓内**没有** `docs/pet-brief/schema-v0.3.json`；`schemaVersion` 仍为 `2`；没有 v0.3 fixture/向量。
- `contracts/CONSUMERS.json`（0.3.0 新增的机器可读契约登记）明确登记本消费者：`id: famling-desktop-games`、`contracts: ["pet-brief@0.2"]`、`inRepo: false`、`inCi: false`。
- 0.3.0 安装包 `status --json` 新增 `contracts` 发现对象，其中 `petBrief: 2` 是 producer 自报的契约 major；本机实测：
  `{"cliJson":1,"errors":1,"exitCodes":1,"mcpTools":1,"mcpResources":1,"mcpProtocol":"2024-11-05","dshTools":1,"petBrief":2}`。
- 安装包 `lib/pet-brief.js` 导出常量实测：`schemaVersion 2`、`versions [1,2]`、`ttlMs 300000`、`displayPolicies ["public","private","none"]`、`defaultPolicy "private"`、`source "advisers"`。

### 2.2 producer 实现：仅性能/投影重构（output-equivalent）

0.3.0 唯一变化的 Pet Brief 文件是 `packages/advisers/lib/pet-brief.js`（+102/−39）。diff 与注释要点：

- `createRedactor`：先对 candidate 字符串去重再 `oneLine/regex`（200k 账本上 233k 条 → 几百个 distinct names）。
- `confidenceOfCommitment`：narrow projection 提供 `hasEvidence` 时不再把 66k 条 evidence JSON 送进 JS。
- `dueInfoOf` + `dueCache`：每个 distinct `dueAt` 只 parse 一次；`riskOfDue` 复用已算出的 local day。
- `dueTop`/`noDueRisks` 有界插入（只保留 top-N，stable order 与旧 sort 等价）。
- 新增可选 `options.nameCandidates`：调用方（`pet-brief-store.js` 窄投影）提供完整候选名集合，避免全账本扫描；省略时行为不变。
- 每处重构注释都声明 **output-equivalent**；diff 中没有新字段/枚举/长度/TTL/错误码变化。

> 消费者层面的实测证据：用安装的 0.3.0 生成的 brief（§4.2）根字段集合与 canonical v0.2 schema 的 `required` 完全一致（13 个），
> `validatePetBrief` 接受且 `warnings: []`；这不是“相信注释”，而是“测试 fixture 输出形状 + 契约 hash 双重核对”。

### 2.3 隐私：per-item secrecy clearance（Pet Brief projection 同口径）

0.3.0 的 “Security and privacy” 节把 Pet Brief projection 列入 per-item clearance 的 egress surface。对 Pet Brief 通道，可观察语义是：

- `secrecy >= 2` 的 matter 及其承诺在**计数/排序/截断前**排除；不输出标题、动作或证据正文。
- 排除只以计数形式写入 `redactions`；consumer 不渲染 `redactions`（本仓既有行为）。
- 本机 0.3.0 实测（§4.2）：合成账本含 1 个 `secrecy: 2` matter（标题「保密并购案」）及其 1 条承诺（「整理并购案材料」），生成物中：
  `redactions` 含 `已排除保密等级≥2 的事项（1 个）`、`已排除保密事项下的承诺（1 条）`；全文 grep 该标题/承诺 **0 命中**。
- 这不是 0.3.0 才有的契约要求（v0.2 起 producer 即如此），0.3.0 是把它纳入统一 clearance 口径并加固；consumer 无数据格式变化。

### 2.4 TOS v2026.11.3（唯一需要 producer 动作的变化）

- 文档版本 **2026.11.3（生效 2026-11-20）**，`docs/TOS.md` sha256 `6d508bd7…`；substantive 修订：补 bridge/Hermes 出网披露（TOS §9.3(h)、PRIVACY §4）。
- **v2026.11.2 的既存同意不适用于 v2026.11.3**；下一次受门控命令要求重新确认。`ADVISERS_TOS_VERSION` 只是 debug 显示、不能伪造同意记录
  （0.3.0 起忽略并审计 `TOS_ENV_OVERRIDE_IGNORED`）。
- 本机实测（0.3.0 安装包 + 全新 `ADVISERS_HOME`，未同意 TOS）：
  `pet-brief --print-schema` / `pet-brief --check --strict --in <自身合法输出>` / `pet-brief --out <path>` 全部 **exit 3**，
  错误为 `E_TOS_REQUIRED`（“需要先同意使用条款 2026.11.3”）；加 `ADVISERS_ACCEPT_TOS=1` 后 exit 0。
- consumer 不解析 TOS（桌宠自己的 consent gate 独立）；该变化只影响 **producer 侧定时任务**：未重新同意 → 不生成 brief → 桌宠 idle
  （不是文件损坏/崩溃/数据丢失）。

### 2.5 供应链/发布可信度（non-breaking，新增可核验性）

- 0.3.0 是首个 provenance release：六包 `dist.attestations` 非空（`url` + `provenance`）；发布流程为 GitHub Actions OIDC/Trusted Publishing；
  仓库侧 `verify-release` 记录 222 checks，SBOM 为 CycloneDX 1.7。
- `status --json.contracts` 与 `contracts/*` 机器可读契约是**新增**的 producer 自描述，桌面通道不消费（契约 §2 不变）。
- `next` 仍指向 0.2.3；0.2.4 从未发布（release candidate，被 0.3.0 吸收）——**不要把 0.2.4 当作可回滚目标，也不要描述为已发布**。

### 2.6 与 Pet Brief 文件通道无关的变化（不要混入契约讨论）

- ledger schema **v21**：additive `clients`/`projects`/`client_notes`、`commitments.created_at`、delivery lineage；v20→v21 正常备份迁移。
- MCP 输出 caps/`total`/`truncated`、legacy protocol negotiation、DSH 真实只读账本（preview 语义）、audit anchor/backup/restore/doctor、TUI output kernel。
- 性能：200k 账本 `pet-brief` 写放大 **31.8 MB → ≤32 KB**、耗时 **2,171 → 399 ms**（release 自述仍有边界项未达标，见 §6）。
- Windows 真机/完整 Windows `pnpm -r test` 仍未验证（release 自述）；本报告不声称 Windows 已验收。

### 2.7 明确未变的 Pet Brief 面（consumer 依赖项）

`schemaVersion 2` / `displayPolicy` 三值 + 缺省 `private` / `source "advisers"` / 5 分钟 TTL / 128 KiB wire cap / closed schema /
`suggestedLines` claims 约束 / `redactions` 元数据语义 / 固定路径 `$ADVISERS_HOME/pet-brief.json`（默认 `~/.advisers`）/
`--out` 同目录临时文件 + fsync + rename 原子替换、`0600` / CLI 选项（`--json`、`--out [path]`、`--check [--strict]`、`--display-policy`、`--print-schema`）/ exit codes `0/1/3`。

---

## 3. 兼容结论矩阵

| 维度 | producer 0.2.3 | producer 0.3.0 | consumer 行为（本仓） | 结论 |
|---|---|---|---|---|
| `schemaVersion` | 2 | 2 | 接受 `1` 或 `2`；`>=3` fail-closed | **不变，兼容** |
| `displayPolicy` | public/private/none，默认 private | 同 | private/public 接受；none → `skip(display_none)` 且丢弃保留数据 | **不变，兼容** |
| 缺 `displayPolicy` | 缺失 → private + warning | 同 | warning + 规范化为 private | **不变，兼容** |
| v0.1 legacy | 可读（warning） | 可读（warning） | 接受 + `W_LEGACY_SCHEMA_VERSION` | **不变，兼容** |
| TTL / 128 KiB | 5 min / 128 KiB | 同 | 前后端各校验一次 | **不变，兼容** |
| `redactions` | 计数/排除说明 | 同 + clearance 计数（§2.3） | 不渲染，仅日志 | **不变，兼容** |
| 原子写/`0600` | 有 | 同（0.3.0 再加固 fs-safe） | 依赖原子替换，不做半写修复 | **不变，兼容** |
| TOS 门控 | v2026.11.2 | **v2026.11.3，需重新同意** | 不解析 TOS | **operational breaking（仅 producer 定时任务）** |
| 包版本 vs 契约 | 0.2.3 → v0.2 | 0.3.0 → v0.2 | 通过 `schemaVersion` 协商 | **包升级 ≠ 契约升级** |
| 未来契约 major | — | 无 | `>=3` refuse（`SCHEMA_VERSION` / `UNSUPPORTED_SCHEMA`） | 仍是安全默认 |

**直接回答**：

1. **consumer 是否需要改代码？** 否。0.3.0 输出是 contract v0.2；本仓 `src/presence/pet-brief.ts`/`face.ts` 逻辑零改动（只有注释 pin 从 0.2.3 → 0.3.0）。
2. **是否需要新 schema 分支？** 否；没有 `schema-v0.3.json`，不允许“预留” v3 字段解析。
3. **0.3.0 输出会不会被拒？** 不会：真实 0.3.0 CLI 输出 fixture 通过 `validatePetBrief`（accept、无 warning）与 6 条 0.3.0 兼容测试。
4. **回滚是否安全？** 是：0.3.0 ↔ 0.2.3 同契约（v0.2），回滚任一侧都不需要对方配合；**不要**回滚到未发布的 0.2.4。
5. **唯一 P0 运维项？** producer 侧重新同意 TOS v2026.11.3（否则定时任务 exit 3 → 桌宠 idle）。

---

## 4. 实测记录（2026-11-20，WSL2 / Node v24.22.1）

### 4.1 producer 端：安装、schema、TOS

```sh
# 1) 安装（见 §1.3）后核对版本 + tarball 复现
/tmp/adv030-consumer/node_modules/.bin/advisers --version            # 0.3.0
npm pack advisers@0.3.0 --registry=https://registry.npmjs.org --pack-destination /tmp/adv030-consumer
sha1sum /tmp/adv030-consumer/advisers-0.3.0.tgz                      # 77cd526c…（= registry dist.shasum）
# 2) 契约自描述（需先有 TOS 同意记录，否则 exit 3）
ADVISERS_HOME=/tmp/adv030-consumer/home ADVISERS_ACCEPT_TOS=1 \
  /tmp/adv030-consumer/node_modules/.bin/advisers status --json       # contracts.petBrief = 2
# 3) schema 输出 hash 与 §1.4 快照一致
ADVISERS_HOME=/tmp/adv030-consumer/home ADVISERS_ACCEPT_TOS=1 \
  /tmp/adv030-consumer/node_modules/.bin/advisers pet-brief --print-schema | sha256sum
# bd2704c597a3ff96fa4d7862febce05b2864e65008b00e008156dec4c529f083  -
# 4) TOS 版本/生效日/正文 hash
ADVISERS_HOME=/tmp/adv030-consumer/home /tmp/adv030-consumer/node_modules/.bin/advisers tos status --json
# version 2026.11.3；effectiveFrom 2026-11-20；textSha256 6d508bd7…；match manifest
```

### 4.2 真实 0.3.0 输出 fixture（合成数据，隔离 home）

```sh
export ADVISERS_HOME=/tmp/adv030-consumer/fixture-home ADVISERS_ACCEPT_TOS=1 TZ=Asia/Shanghai
adv=node_modules/.bin/advisers
$adv init
$adv matter add "某客户续约" --secrecy 1 --summary "续约条款讨论" --json
$adv matter add "周会纪要" --secrecy 0 --summary "团队周会" --json
$adv matter add "保密并购案" --secrecy 2 --summary "不得外泄" --json
$adv commit add "今天回访某客户" --quote "今天回访某客户" --matter <M1> --creditor "某客户" --due "2026-11-20T18:00:00+08:00"
$adv commit add "发周会纪要给团队" --quote "发周会纪要给团队" --matter <M2> --creditor "团队" --due "2026-11-21T18:00:00+08:00"
$adv commit add "整理并购案材料" --quote "整理并购案材料" --matter <M3> --creditor "某客户" --due "2026-11-21T18:00:00+08:00"
$adv pet-brief --out /tmp/adv030-consumer/pet-brief-v0.3.0.json      # exit 0，mode 600 atomic
$adv pet-brief --check --strict --in /tmp/adv030-consumer/pet-brief-v0.3.0.json   # ok:true
```

生成物关键字段（完整文件见 §5 fixture）：

| 字段 | 值 |
|---|---|
| `schemaVersion` / `source` / `displayPolicy` | `2` / `"advisers"` / `"private"` |
| `generatedAt` → `expiresAt` | `2026-11-20T11:52:12.985Z` → `2026-11-20T11:57:12.985Z`（差 300,000 ms = 5 min） |
| `counts` | `{today:2, commitments:2, risks:2, facts:0}`（与四个数组长度一致） |
| `today` | 2 条（某客户续约 / 周会纪要），不含保密 matter |
| `commitments` | 2 条（risk high + medium），**不含**保密 matter 下的承诺 |
| `redactions` | 5 条；含 `已排除保密等级≥2 的事项（1 个）`、`已排除保密事项下的承诺（1 条）` |
| 敏感串 grep | 「保密并购案」「整理并购案材料」全文 **0 命中** |
| 文件大小 / sha256 | 1,906 B / `193063080c7a03bca777d5d985d1eba2ea49a690f5bbd8636af4e52ef8ee4d0e` |

### 4.3 consumer 端测试

| 命令 / 文件 | 结果（2026-11-20） |
|---|---|
| 基线（改动前 6 文件：020、face、harden、source、ui-privacy、pet-brief-consumer） | **77/77 pass** |
| `node --import tsx --test tests/pet-brief-consumer.test.ts` | **18/18**（原 16 + v0.2 快照 hash 冻结 + 26 canonical vector） |
| `node --import tsx --test tests/advisers-030-compat.test.ts` | **6/6**（0.3.0 fixture acceptance/closed schema/TTL/cap/secrecy/face） |
| `node --import tsx --test tests/advisers-020-compat.test.ts` | **24/24** |
| `advisers-face` / `advisers-harden` / `advisers-source` / `advisers-ui-privacy` | 6/6 / 11/11 / 3/3 / 17/17 |
| 定向 7 文件合计 | **85/85 pass**（exit 0） |
| `npm test`（全仓） | **1946/1946 pass**，exit 0 |
| `npx tsc --noEmit` | exit 0 |

> 说明：消费端测试直接断言 **0.3.0 包产出的真实输出 fixture**，而不是只断言手写 v0.2 文档；v0.2 快照 hash 冻结测试另外保证
> “producer 打印的 schema == consumer 验证的 schema”，因此 0.3.0 的“输出等价”有可复核证据。

### 4.4 TOS 门控实测（0.3.0 安装包，全新 home，未同意）

| 命令 | exit | 输出/行为 |
|---|---|---|
| `advisers init`（新 home） | 0 | 初始化成功（init 豁免） |
| `pet-brief --print-schema` | **3** | `E_TOS_REQUIRED`：“需要先同意使用条款 2026.11.3” |
| `pet-brief --check --strict --in pet-brief-advisers-0.3.0.json` | **3** | 同上（`--check` 也受门控） |
| `pet-brief --out /tmp/...` | **3** | 同上（定时任务未重新同意时的真实行为） |
| 加 `ADVISERS_ACCEPT_TOS=1` 后同命令 | 0 | 记录 `channel: "env"`、`nonInteractive: true` 的同意记录 |

### 4.5 registry 选择

- 本机 npmmirror 缓存可能滞后；本次所有 npm 查询/安装显式 `--registry=https://registry.npmjs.org`。
- 实测 raw registry `dist-tags`：`latest 0.3.0 / next 0.2.3`；npmmirror 不作为判断依据。
- 安装后 `package-lock.json` 的 `resolved` 与 `integrity` 均为 npmjs（§1.2/§1.3）。

---

## 5. 本任务变更清单（desktop-games）

> 只改授权文件；**不 commit/push**；不修改 Rust/UI/consent；不引入 `advisers` 运行期依赖。

| 文件 | 性质 | 内容 |
|---|---|---|
| `docs/integration/ADVISERS-CONTRACT.md` | 更新 | pin 0.2.3 → **0.3.0**；新增 §4.3（0.3.0 package release 清单）；§5 验收命令/跨仓命令/TOS 重新同意；§6 回滚；§8 改为“未来契约 major”并澄清 0.3.0 无 v0.3 契约；§9 TOS v2026.11.3；§10 测试数字（85/85、1946/1946、tsc 0）；§11 证据链接 |
| `docs/integration/ADVISERS-030-CONSUMER-2026-11-20.md` | **新增** | 本报告 |
| `docs/integration/ADVISERS-023-UPDATE-2026-11-18.md` | 更新 | 追加“后续（2026-11-20）0.3.0 复核见本报告”，不追溯改写历史 |
| `docs/contracts/pet-brief/README.md` | 更新 | 新增 §5「Advisers 0.3.0 复核」：契约零变化、hash 表、consumer 零改动、fixtures/测试指针 |
| `src/presence/pet-brief.ts` | **仅注释** | `PET_BRIEF_CONTRACT_VERSION` 注释 pin 0.2.3 → 0.3.0；说明 0.3.0 仍 emit `schemaVersion 2`；逻辑/常量未变 |
| `tests/advisers-030-compat.test.ts` | **新增** | 6 条 0.3.0 兼容测试（见 §4.3） |
| `tests/pet-brief-consumer.test.ts` | 扩展 | 新增 v0.2 快照 sha256 冻结 + 26 条 canonical vector（+2 测试 → 18） |
| `tests/advisers-020-compat.test.ts` | 注释 | 头注释注明 0.3.0 后仍为 active contract matrix，0.3.0 输出测试在新文件 |
| `tests/advisers-fixtures/README.md` | 更新 | fixtures provenance：v0.2 快照 pin 到 `v0.3.0`、0.3.0 输出 fixture 的来源/生成方法/sha256 |
| `tests/advisers-fixtures/pet-brief-advisers-0.3.0.json` | **新增** | 真实 0.3.0 CLI 输出（合成账本、隔离 home），sha256 `19306308…` |

**consumer 行为未变**：`src/presence/pet-brief.ts` 的校验/协商/投影逻辑与常量零改动；`src/pet/advisers/face.ts` 未改；Tauri/Rust 未改。

---

## 6. 风险、限制与未测（诚实口径）

- **未验证 Windows 真机**：0.3.0 release 自述 Windows 真机（备份/恢复/导入/导出/sync/migration）与完整 Windows `pnpm -r test` 仍未跑；本报告不声称 Windows 已验收。
- **未用真实账本/真实 `~/.advisers`**：fixture 由隔离临时 home + 合成 matter 生成；未读真实客户数据、未打印凭据、未写用户目录。
- **未重跑 Advisers 仓 producer 测试/发布脚本**：`verify-release` 222 checks、SBOM、Windows CI 等是 release 侧声明；本机只核对 `dist.attestations` 非空 + tarball integrity + tag/hash。
- **未模拟“0.2.3 的 v2026.11.2 同意”数据库**：TOS 重新同意按 0.3.0 changelog/`tos status`/`docs/TOS.md` 版本+hash 核对，并用全新 home 实测了“未同意 → exit 3”；旧同意失效的数据库级迁移路径未在本机复现。
- **未重新 benchmark 200k 账本性能**：§2.6 的 31.8 MB→32 KB、2,171→399 ms 来自 0.3.0 `docs/PERFORMANCE.md`/CHANGELOG（release 侧），不在本报告断言范围；且 release 自述仍有未达标项。
- **不证明合规/安全**：0.3.0 的 clearance/TOS 加固不构成合规认证；consumer 的 `displayPolicy` 执行也仍有已知未做项（private 自动收起/一键隐藏/屏幕共享检测、voice 层接入——见契约 §4.2/§5 与 contracts README §3）。
- **provenance 的密码学/DSSE 核验不在本报告**：本报告只确认 `dist.attestations` 字段非空 + tarball integrity + tag/hash；发布侧 `verify-release`/provenance DSSE/CI 复跑见同目录 `docs/integration/ADVISERS-030-RELEASE-AUDIT-2026-11-20.md`（2026-11-20 发布审计，另一任务产出）。

---

## 7. 运维与后续

1. **producer（必须做）**：升级到 `advisers@0.3.0` 后，定时任务/交互首次调用 `pet-brief` 前重新同意 **TOS v2026.11.3**；
   非交互调度显式带 `--accept-tos`/`ADVISERS_ACCEPT_TOS=1`（记录 `non_interactive=1`）；未同意会 exit 3，桌宠 idle（不是崩溃）。
2. **producer 刷新策略不变**：1–2 分钟刷新、TTL 5 分钟、默认 `private`、`--out ~/.advisers/pet-brief.json` 原子写。
3. **consumer pin（已做）**：契约 §1.1 pin `advisers@0.3.0`；fixtures/注释/测试同步；**不要**把 `schemaVersion` 提到 3。
4. **回滚**：任一侧回滚到 0.2.3/上一 consumer 均可（同契约 v0.2）；不要用未发布的 0.2.4；若未来 producer 输出 v3，consumer 必须保持 idle 等升级（契约 §8）。
5. **可选的未来增强（未实现，不属 0.3.0 兼容要求）**：producer 自报 `status --json.contracts.petBrief` 可在跨仓验收脚本里做 drift 断言；
   桌面通道本身仍只读 `pet-brief.json`（不改通道，契约 §8.8）。

---

## 8. 复现命令（紧凑版）

```sh
set -e
# A. 安装 0.3.0（npmjs）
rm -rf /tmp/adv030-consumer && mkdir -p /tmp/adv030-consumer && cd /tmp/adv030-consumer
echo '{"name":"adv030-consumer","private":true,"version":"0.0.0"}' > package.json
npm install advisers@0.3.0 --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund
export ADVISERS_HOME=/tmp/adv030-consumer/home ADVISERS_ACCEPT_TOS=1 TZ=Asia/Shanghai
ADV=node_modules/.bin/advisers
$ADV --version                                        # 0.3.0
$ADV pet-brief --print-schema | sha256sum             # bd2704c5…
$ADV status --json                                    # contracts.petBrief = 2
$ADV tos status --json                                # version 2026.11.3
# B. 生成 fixture（合成数据；命令见 §4.2）→ 替换本仓 fixture 前必须同步 README 的 sha256
$ADV init
$ADV matter add "某客户续约" --secrecy 1 --summary "续约条款讨论" --json
$ADV matter add "周会纪要" --secrecy 0 --summary "团队周会" --json
$ADV matter add "保密并购案" --secrecy 2 --summary "不得外泄" --json
# 用 matter ls --json 取三个 matter id 后：
$ADV commit add "今天回访某客户" --quote "今天回访某客户" --matter <M1> --creditor "某客户" --due "2026-11-20T18:00:00+08:00"
$ADV commit add "发周会纪要给团队" --quote "发周会纪要给团队" --matter <M2> --creditor "团队" --due "2026-11-21T18:00:00+08:00"
$ADV commit add "整理并购案材料" --quote "整理并购案材料" --matter <M3> --creditor "某客户" --due "2026-11-21T18:00:00+08:00"
$ADV pet-brief --out /tmp/adv030-consumer/pet-brief-v0.3.0.json
$ADV pet-brief --check --strict --in /tmp/adv030-consumer/pet-brief-v0.3.0.json   # ok:true
sha256sum /tmp/adv030-consumer/pet-brief-v0.3.0.json   # 19306308…
# C. consumer 验收
cd <private-path>
node --import tsx --test tests/advisers-030-compat.test.ts tests/pet-brief-consumer.test.ts
node --import tsx --test tests/advisers-020-compat.test.ts tests/advisers-face.test.ts tests/advisers-harden.test.ts \
  tests/advisers-source.test.ts tests/advisers-ui-privacy.test.ts
npm test && npx tsc --noEmit
```

> 注意：旧 fixture（2026-11-17 时间戳）用 0.3.0 CLI 跑 `--check --strict --in` 会因 **TTL 过期**得到 exit 1 `E_EXPIRED`——这是
> 契约快照/测试向量的“固定时间”设计，不是兼容性失败；跨仓往返必须用新生成且未过期的 brief。

---

## 9. 证据索引

- 契约 pin/流程：`docs/integration/ADVISERS-CONTRACT.md`（§1.1、§4.3、§5–§11）
- 契约快照与复核：`docs/contracts/pet-brief/README.md` §5；`v0.2/schema-v0.2.json`、`v0.2/example-v0.2.json`、`v0.2/testcases-v0.2.json`
- consumer 测试：`tests/advisers-030-compat.test.ts`、`tests/pet-brief-consumer.test.ts`、`tests/advisers-020-compat.test.ts`
- fixtures/provenance：`tests/advisers-fixtures/README.md`、`pet-brief-advisers-0.3.0.json`
- Advisers 证据（本机只读 checkout `plugins/advisers`）：`CHANGELOG.md` §0.3.0、`docs/PET-BRIEF-CONSUMERS.md`、`docs/PET-BRIEF-PRODUCER.md`、
  `docs/pet-brief/`、`contracts/CONSUMERS.json`、`docs/PERFORMANCE.md`、`docs/SBOM.md`、`docs/TOS.md`
- 发布侧审计（另一任务）：`docs/integration/ADVISERS-030-RELEASE-AUDIT-2026-11-20.md`（npm/tag/provenance/CI/文档）
- 发布页：https://github.com/PerryLink/advisers/releases/tag/v0.3.0

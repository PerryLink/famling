# 共享 content-extension v3 compliance fixtures（E3 / MB-032）

- 创建：2026-11-20
- 范围：**测试数据 + 测试 + 文档**；不改生产代码、不联网、不加载/执行任何资产
- 结论：`MB-032` 的「共享 fixtures 未生成（compliance 用例是内联 pack）」已消除——famling 与 dsh-famling 双端现在消费同一份 v3 合规 fixture（含 canonical declaration）与同一份期望。

## 1. 缺口与目标

`docs/plan/EXECUTION-STATUS-2026-11-20.md` 的 MB-032 行（PARTIAL）原文：

> 版本策略已落地：`content-extension.mjs` 明确 v3 保持当前 revision、合规字段 additive（`CONTENT_EXTENSION_COMPATIBILITY`、strictRequires、templates）；`test/content-extension-compliance.test.js` 10 例……
> **共享 fixtures 未生成**（fixtures 只有 FCI v02/v03/behavior-traces，compliance 用例是内联 pack）

本次补齐的缺口：

1. **canonical declaration**：usage statement / statementRef / statementSha256、researchOnly、六条 prohibited uses、第一方 licence / AI-provenance 锚点、v3 contract 版本与 strict 要求；
2. **pack fixtures**：`valid-full`、`valid-legacy`（pre-0.10.9）、`valid-canonical-only` 三类正向包 + 10 个单字段负向包；
3. **data-driven cases**：每个包 × options 组合的 `ok` / 错误数 / 警告数 / 关键错误子串期望（17 例）；
4. **manifest 哈希锁** + 双端副本逐字节比对，防止共享 fixture 静默漂移；
5. 双端测试：famling TypeScript 测试（含跨端调用插件 validator）与 dsh-famling JS 测试。

## 2. 交付物

| 端 | 路径 | 说明 |
| --- | --- | --- |
| famling | `tests/fixtures/content-compliance/` | **权威 fixture 集**：`canonical-declaration.json`、`cases.json`、`manifest.json`、`packs/*.json`（13 个包） |
| famling | `tests/content-compliance-fixtures.test.ts` | 本地锚点 + manifest + fixture 形状；插件 checkout 存在时跑全部 cases 与副本逐字节比对（缺失则 skip） |
| famling | `tests/update-compliance-fixture-manifest.mjs` | 重算 manifest；`--sync <dir>` 同步到插件 test 副本 |
| famling | `docs/plan/COMPLIANCE-FIXTURES-2026-11-20.md` | 本文件 |
| dsh-famling | `test/fixtures/content-compliance/` | 与 famling **逐字节相同** 的 vendored 副本（`test/` 不进 npm 包，由 `package-hygiene` 测试锁定） |
| dsh-famling | `test/content-compliance-fixtures.test.js` | 本地锚点 + manifest + 全部 cases 跑 `validateContentPack`；famling checkout 存在时比对副本 |

未改动：`content-extension.mjs`、`client.js`、`src/pet/**` 等生产代码。

## 3. 冻结值（canonical-declaration.json）

| 字段 | 值 / 来源 |
| --- | --- |
| `usageDeclaration.researchOnly` | `true` |
| `usageDeclaration.statement` | 与 `src/pet/content-library.ts` 的 `CONTENT_USAGE_STATEMENT`、插件 `content-extension.mjs` 同名常量逐字一致 |
| `usageDeclaration.statementRef` | `docs/legal/USE-RESTRICTIONS-2026-11-19.md` |
| `usageDeclaration.statementSha256` | `0353536cefd702014b12a8365c4a486f19848d049652e9692027216adb80c743`（测试现场重算 statement 的 SHA-256 对比） |
| `usageDeclaration.prohibitedUses` | 六条固定 token（emotional-companionship / virtual-partner / professional-advice / minor-intimacy / impersonation / illegal-use） |
| `license` | 第一方锚点：`LicenseRef-PolyForm-Noncommercial-1.0.0` + attribution |
| `aiProvenance` | 第一方锚点：`generated=false` + 占位帧声明 + `deterministic-python-renderer` |
| `contract` | `extensionVersion=3`、`packSchemaVersion=3`、`policy=additive-within-major`、`supportedPackSchemaVersions=[3]`、`strictRequires` 五项 |

测试逐项对比的权威源：插件 `content-extension.mjs` 的导出常量（`CONTENT_USAGE_STATEMENT*`、`CONTENT_LICENSE_TEMPLATE`、`CONTENT_AI_PROVENANCE_TEMPLATE`、`CONTENT_EXTENSION_COMPATIBILITY`、`CONTENT_EXTENSION_POINTS.compliance.strictRequires`）、famling `src/pet/content-library.ts`、`public/content/library.json` 的 rolePresets、以及 `docs/legal/USE-RESTRICTIONS-2026-11-19.md`（法务文档必须包含逐字 statement 与 SHA）。

## 4. fixture 清单

### 4.1 canonical / cases / manifest

- `canonical-declaration.json`：§3 的冻结值。
- `cases.json`：17 个 conformance case（见 §5）。
- `manifest.json`：15 个 fixture 文件的 SHA-256（canonical + cases + 13 个 pack；manifest 自身与测试文件不入表）。

### 4.2 packs（13 个）

| 文件 | 类型 | 覆盖 |
| --- | --- | --- |
| `valid-full-v3.json` | 正向 | 完整 licence / AI / compatibility + 包级和 role 级 canonical declaration + 两个 entry（role + theme） |
| `valid-legacy-v3.json` | 正向（向后兼容） | pre-0.10.9：只有 researchOnly + 六条 prohibited uses；loose 模式 4 条 warning，strict 模式 fail closed |
| `valid-canonical-only-v3.json` | 正向（部分合规） | 只有 canonical declaration；loose 模式 3 条 warning，strict 模式 3 条 error |
| `invalid-mutated-statement.json` | 负向 | 包级 statement 非 canonical |
| `invalid-mutated-statement-ref.json` | 负向 | statementRef 非 canonical |
| `invalid-mutated-statement-sha.json` | 负向 | statementSha256 非 canonical |
| `invalid-mutated-role-statement.json` | 负向 | role entry 的 canonical restatement 被改 |
| `invalid-prohibited-uses.json` | 负向 | 缺少一条 prohibited-use token |
| `invalid-license-spdx.json` | 负向 | SPDX id 非法 |
| `invalid-license-url.json` | 负向 | licence URL 带凭据（非安全 https） |
| `invalid-ai-provenance.json` | 负向 | generated=true 但 disclosure 不是真实披露 |
| `invalid-compatibility-range.json` | 负向 | min > max（结构非法） |
| `invalid-compatibility-host.json` | 负向（条件失败） | 结构合法，但排除具体 host 版本（仅在传 `pluginVersion` 时失败） |

所有 fixture 均为**纯 JSON 数据**，不含脚本、不加载资产、不访问网络。

## 5. cases.json 格式

```json
{
  "fixture": "dsh-famling.content-compliance/1",
  "contractVersion": 3,
  "packSchemaVersion": 3,
  "cases": [
    {
      "id": "valid-full-strict",
      "description": "……",
      "pack": "packs/valid-full-v3.json",
      "options": { "requireCompliance": true, "pluginVersion": "0.10.9" },
      "expect": {
        "ok": true,
        "errorCount": 0,
        "warningCount": 0,
        "errorIncludes": [],
        "warningIncludes": []
      }
    }
  ]
}
```

两端测试对每个 case 断言：`ok`、`errors.length`、`warnings.length`，以及 `errorIncludes` / `warningIncludes` 中每个子串出现在至少一条错误/警告里（子串取 validator 的稳定消息片段，例如 `pack.usageDeclaration.statement: must equal the canonical shared research-only statement`）。这样 fixture 期望是数据、校验逻辑仍在生产模块里，双端不会各写一套判定。

## 6. 双端如何消费同一份 fixture

### famling 端

`tests/content-compliance-fixtures.test.ts`：

1. 本地测试（无插件也能跑）：canonical declaration ↔ `content-library.ts` 常量 / `library.json` / 法务文档；manifest 哈希与 case 覆盖完整性；每个 pack 的公共字段与 prohibited uses 形状。
2. 跨端测试（插件 checkout 存在时）：动态 import 插件 `content-extension.mjs`，对比 contract/anchors，跑**全部 17 个 case**；并断言 `test/fixtures/content-compliance/` 的插件副本与 famling 权威副本逐字节一致。
3. 干净 famling checkout（无兄弟插件）时跨端 2 条 skip，本地 2 条 pass。

### dsh-famling 端

`test/content-compliance-fixtures.test.js`：

1. 本地测试：canonical declaration ↔ 本包导出常量；manifest 哈希与 case 覆盖；全部 17 个 case 跑本包 `validateContentPack`。
2. famling checkout 存在时：比对 famling `tests/fixtures/content-compliance/` 与本地 vendored 副本逐字节一致。
3. clean plugin checkout 时未找到 famling，副本比对跳过（3 pass / 1 skip），其余照常真跑。

### 路径覆盖

| 端 | 兄弟仓位置 | 环境变量 |
| --- | --- | --- |
| famling | `../plugins/dsh-famling` | `DSH_FAMLING_PLUGIN_DIR` |
| dsh-famling | `../../desktop-games` | `FAMLING_REPO_DIR` |

## 7. 防漂移与更新流程

三重锁：

1. `manifest.json` 逐个文件 SHA-256（两端测试都重算并比对）；
2. 两端副本逐字节相等（两端测试在兄弟仓存在时比对）；
3. canonical 值与写死锚点对比（§3 的权威源）。

**改 fixture 后**（在 famling 仓）：

```bash
cd D:/Projects/dsh/desktop-games
node tests/update-compliance-fixture-manifest.mjs
node tests/update-compliance-fixture-manifest.mjs --sync ../plugins/dsh-famling/test/fixtures/content-compliance
```

第一条只重写 famling 的 `manifest.json`；第二条重写 manifest 后把整个 fixture 目录拷到插件 `test/fixtures/content-compliance/`（这是两端唯一的同步动作，只写 test 数据）。随后：

```bash
# famling（Windows Node 24；本工作区 node_modules 是 win32 安装）
node --import tsx --test tests/content-compliance-fixtures.test.ts
# plugin（WSL/任意 Node 24）
cd /mnt/d/Projects/dsh/plugins/dsh-famling && node --test test/content-compliance-fixtures.test.js
```

**新增 case**：优先复制一个 base pack 改成单点缺陷 → 在 `cases.json` 加一条（含 `ok`/`errorCount`/`warningCount`/子串）→ 按上面命令重算 manifest + 同步 → 跑两端测试。若 validator 的稳定消息片段变化，两端 fixture 期望要一起改（这正是共享 fixture 的作用：一处改、两端同时红/绿）。

## 8. 本机实测（2026-11-20）

环境：WSL2 + `/mnt/d` 工作区；famling 测试用 **Windows Node v24.22.1**（`node_modules` 的 esbuild 为 win32 版，WSL Node 无法直接跑 tsx）；插件测试用 WSL Node v24.22.1。

### 8.1 本次新增 fixture 测试

```text
# famling：tests/content-compliance-fixtures.test.ts（插件 checkout 存在）
✔ canonical declaration is the shared famling usage/licence/AI anchor
✔ fixture manifest pins every shared compliance file and covers every case
✔ the shared fixtures pass the plugin v3 validator with the frozen expectations
✔ the plugin checkout vendors byte-identical shared compliance fixtures
ℹ tests 4 / pass 4 / fail 0

# famling：干净 checkout 模拟（DSH_FAMLING_PLUGIN_DIR=D:\nonexistent\dsh-famling）
ℹ tests 4 / pass 2 / fail 0 / skipped 2

# dsh-famling：test/content-compliance-fixtures.test.js
ℹ tests 4 / pass 4 / fail 0

# dsh-famling：干净 checkout 模拟（FAMLING_REPO_DIR=/nonexistent/famling）
ℹ tests 4 / pass 3 / fail 0 / skipped 1
```

### 8.2 全量门

```text
# dsh-famling 全量（WSL Node 24.22.1，exit code 实测；2026-11-20 08:06 快照）
node --test test/*.test.js            → exit 0；tests 227 / pass 227 / fail 0 / skipped 0
                                        （本任务新增 4 条；总数随并行任务 task-130 增长）
node scripts/check-jsdoc.mjs          → exit 0；ok（27 files syntax / JSDoc / generated blocks / runtime lint）
node scripts/typecheck.mjs            → exit 0；checkJs ok（使用 desktop-games 的 typescript）
```

famling 门（Windows Node v24.22.1；exit code 实测，2026-11-20 08:05 快照）：

```text
npm run typecheck  → exit 0（tsc --noEmit 无输出）
npm run build      → exit 0（✓ built in 892ms；baked voice 42 WAV / legal package 38 files / page profile ok）
npm test           → exit 0；tests 1857 / pass 1850 / fail 0 / skipped 7 / todo 0
                     新增 tests/content-compliance-fixtures.test.ts 在同一轮全量中 4/4 pass
```

本任务新增的 `tests/content-compliance-fixtures.test.ts` 还单独做过与项目同选项的 scoped `tsc`（`--noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck --types node --allowImportingTsExtensions`）：exit 0。

### 8.3 并发窗口说明（中间态归属）

本次执行期间，famling 工作树同时被三条并行任务改写（`task-128` content-hub init 拆分、`task-64` 右键菜单、`task-129` 设置归位）。中间态采样曾出现：

- `npm test` 1839 tests / 8 fail（全部在 `tests/content-hub-character-packs.test.ts`，断言 `src/pet/content-hub.ts` 正在被拆分的源码文本，如 `characterPacks: characterPackTabContext()`，属 task-128 中间态）；
- `npm run typecheck` 在 `src/pet/main.ts` 出现 3 个编辑中间态错误（task-129 域）。

这些文件本任务均未修改；本任务新增文件全部是 untracked 的 `tests/**`、`docs/plan/COMPLIANCE-FIXTURES-2026-11-20.md` 与插件 `test/**`（`git status` 中 `src/pet/**` 的改动全部来自并行任务）。并行任务收敛后，**2026-11-20 08:05–08:06 的最终快照三件全绿**（§8.2）。若 lead 后续在更大并行批次中重跑出现上述模块的失败，请先按本节归属排除。

## 9. 边界与未做

- **双 schema 独立裁定不变**（SHARED 文档 D6）：本 fixture 只覆盖 content-extension **v3**，不合并 `famling.content-pack/0.2`，也不新增 v4。
- 不覆盖：资产归档/zip、远程 catalog 取数、UI 展示合规字段（这些已有各自测试/任务）。
- 不改 `content-extension.mjs` 的校验逻辑、不改用户可见文案、不改 `EXECUTION-STATUS` / `MASTER-BACKLOG` 账本（对账归 lead/backlog 任务）。
- 插件 `test/` 不进 npm 包；fixture 也不在任何 runtime 入口被加载。

## 10. MB-032 关闭建议

MB-032 可从 **PARTIAL → DONE**：证据 = 本文件 §2/§8 + `tests/content-compliance-fixtures.test.ts`（4 例）+ `test/content-compliance-fixtures.test.js`（4 例）+ 17 个共享 case + manifest 哈希锁。状态账本行建议改为：

> MB-032 | **DONE** | 共享 v3 compliance fixtures（`tests/fixtures/content-compliance/`，13 packs + 17 cases + manifest sha256；双端逐字节同副本）；famling `tests/content-compliance-fixtures.test.ts` 4 例、插件 `test/content-compliance-fixtures.test.js` 4 例；canonical statement/ref/SHA、licence、AI provenance、compatibility 与 pre-0.10.9/strict/负向全覆盖 | 第三方真实包样板仍缺（MB-043）；账本更新由对账任务落笔

（本任务未改账本；上行为交给 lead/对账任务的建议文本。）

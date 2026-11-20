# E10 · MB-108 — 脚本/文档/i18n 收敛报告（task-138）

> 任务：`task-138`「scripts/文档/i18n 收敛（E10 MB-108）」。基线：`desktop-games` HEAD **`0a5bc0b`** + 工作树在途改动（startup/E2E/coverage/reclass 等并发任务）。
> 边界：**不 commit / 不 push**；只改授权文件与必要关联文件；不改任何功能行为/契约/UI 逻辑。
> 本文件是执行记录，不是发布批准；数字均为 2026-11-20 本机实测快照。

## 0. 结论

1. **STATUS 真值滞后已修**：`gen-status.mjs` 选「最新 release-evidence」时按目录名字典序，实际选中 `...-f851661`（更旧）而不是 `...-0a5bc0b`；改为按 `manifest.generatedAt` 排序并补单测。`docs/STATUS.md` 已重生成到 `commit 0a5bc0b` + 正确 evidence。
2. **SHARED 文档滞后已同步**：`SHARED-CONTENT-SEMANTICS-2026-11-19.md` 的 §2 第 14/15/16 行、§3 D6/D10、§0 结论与 §4/§6 已对齐 MB-032 落地的 v3 合规字段现状（schemaVersion 仍 3；license/aiProvenance/compatibility 为追加可选字段，`requireCompliance` 才强制）。
3. **i18n/locale 单一源已建立并加门**：famling `src/i18n.ts` 是唯一双语字典（32 key，删除 8 个死 key；HTML fallback 必须逐字等于 zh-CN、content nameKey/源码字面量必须可解析）；插件新增 `scripts/check-i18n.mjs`（`L` 56/67 + `STRINGS` 180/180 + locale 元数据），**修复了 Advisers 简报计数标签缺键导致渲染 `undefined` 的真实 bug**，删除两侧死 key。
4. **脚本收敛清单 + 校验已建立**：`docs/plan/SCRIPTS-INVENTORY-2026-11-20.md` 登记 `scripts/` 全部 103 个文件（17 gate / 7 generator / …），`scripts/scripts-check.mjs` 校验清单完整性、gate 接线、generator `--check` 真实性、package/ci 目标存在、退役脚本不回流、活脚本不引用已删路径；删除 2 个 Electron 遗留探针脚本并清理 no-op 开关。
5. **插件 content-extension 全量 checkJs 已补齐**（MB-107 交接给 MB-108 的部分）：checkJs 错误 ~40 → **0**，`npm run typecheck` = `checkJs ok`；只加 JS type guard/局部收窄，不改校验语义。
6. **新增校验均进入 `npm test`**（canonical gate 的一部分），不需要改 `ci.mjs`/`package.json`/workflow（避开并发任务写作用域）。

## 1. 改动清单（按写作用域）

| 区域 | 文件 | 改动 |
| --- | --- | --- |
| STATUS 生成 | `scripts/gen-status.mjs` | `latestEvidence()` 改为按 `manifest.generatedAt` 选最新（未带日期者排后、同日期按目录名 tie-break），并 export 供测试 |
| STATUS 生成 | `tests/status-generation.test.ts`（新） | 3 例：按 generatedAt 而非目录名、未带日期排序、空目录返回 null |
| STATUS 真值 | `docs/STATUS.md` | 由 `node scripts/gen-status.mjs` 重生成（commit/working-tree/evidence 追平 HEAD） |
| SHARED 文档 | `docs/plan/SHARED-CONTENT-SEMANTICS-2026-11-19.md` | 头部修订行；§0 第 6 条；§2 第 14/15/16 行；§3 D6/D10；§4.1 复核证据；§6 MB-032/MB-107/MB-108 行 |
| i18n（famling） | `src/i18n.ts` | 加单源契约头注释；删除 8 个死 key（`item.strawberry*`/`crop.strawberry`/`building.greenhouse`/`fish.clownfish`/`fish.seahorse`/`decor.coral`/`decor.shell`；均无 HTML/content/src 引用） |
| i18n（famling） | `scripts/i18n-check.mjs`（新） | 6 项检查：解析、双语 key 对齐、HTML data-i18n 存在+fallback==zh-CN、content nameKey、src 字面量 key、死 key；导出可测函数 |
| i18n（famling） | `tests/i18n-convergence.test.ts`（新） | 8 例：真实仓绿 + 每项检查的负向 fixture（缺 key/fallback 漂移/content 未定义/死 key/未定义用量/重复 key） |
| i18n（插件） | `client.content.js` | **修复** `T.today`/`T.commitments` 缺键（Advisers 简报此前渲染 `undefined: 0 · undefined: 0`）；删除死 key `hide`/`motion`（zh+en） |
| i18n（插件） | `client.js` | 删除死 key `L.version`/`L.settings`/`L.sound`（zh+en；输入面板的 `placeholder/mic/send/task/taskAt/createTask` 经 props 传给懒 chunk，**保留**） |
| i18n（插件） | `scripts/check-i18n.mjs`（新） | 10 项检查：locale 元数据键树/版本、`L`/`STRINGS` 双语键树、静态+跨 chunk（`S.*`）引用、死 key、en-only `actionLabels` 显式例外 |
| i18n（插件） | `test/i18n.test.js`（新） | 真实包 10 项全绿 + helper 单测（flatten/diff/引号与花括号提取/静态引用/函数体） |
| i18n（插件） | `test/version-truth.test.js`、`test/client-static.test.js` | 跟随死 key 收敛：client.js 版本标签改为断言 hello 握手 `clientVersion`；删掉对已删 `motion` 标签的断言 |
| 类型门（插件） | `content-extension.mjs` | checkJs 收窄：`isPlainObject`/`isBoundedText` 改 JS type guard；asset/totalBytes/voice.mode/kind/source/preview.kind 用 typeof 守卫；早退 return 补 `warnings`；JSDoc 注释 `@import` 改为 `at-import`（防 TS 误解析）；**不改变任何校验分支结果** |
| 类型门（插件） | `scripts/tsconfig.checkjs.json` | include 加入 `../content-extension.mjs`，移除对应 exclude/“~40 已知错误”注释 |
| 类型门（插件） | `docs/CONTENT-CONSTANTS-2026-11-20.md`、`README.md` | 更新 checkJs 范围/交接状态与检查链说明 |
| 脚本收敛 | `docs/plan/SCRIPTS-INVENTORY-2026-11-20.md`（新） | 104 行清单：category/check/notes + 维护规则 + 退役段（含并发 task-137 新增生成器） |
| 脚本收敛 | `scripts/scripts-check.mjs`（新） | 9 项检查（见 §4） |
| 脚本收敛 | `tests/scripts-convergence.test.ts`（新） | 13 例：真实仓绿 + 9 条规则的负向 fixture + 清单解析 |
| 脚本清理 | `scripts/electron-demo-probe.ps1`、`scripts/probe-electron.ps1` | **删除**（MB-106 已删 Electron 宿主，两脚本驱动 `app/electron`+`.electron-win`，已无对象） |
| 脚本清理 | `scripts/ci-clean-checkout.mjs` | 删除 no-op `--with-electron-binary`/`ELECTRON_SKIP_BINARY_DOWNLOAD` |
| 脚本清理 | `scripts/backup.mjs` | 删除 `app/electron/dist` 排除项；保留 `.electron-win` 排除并注明原因（防本机旧缓存进备份） |
| 脚本清理 | `scripts/make-pack.ts` | 注释去掉 Electron 字样（Node dev loader） |
| 文档同步 | `docs/plan/E0-TRUTH-CI-EVIDENCE-2026-11-19.md`、`docs/plan/E10-MB106-ELECTRON-REMOVAL-2026-11-20.md` | 去掉/补记已删的 electron 二进制开关与探针脚本残留 |

## 2. i18n / locale 单一源（验收细节）

### 2.1 famling（`src/i18n.ts` + `aquarium.html` + `content/aquarium/content.json`）

- 唯一字典：`src/i18n.ts`；`zh-CN` 与 `en` 各 32 个 key，逐 key 相等。
- `aquarium.html` 的 11 个 `data-i18n` 元素：key 必须存在，且静态 fallback 必须**逐字等于** zh-CN 值（消除第二份中文文案）。
- `content/aquarium/content.json` 的 10 个 `nameKey` 必须在两种语言解析得到（这是 UI 唯一本地化的内容数据；town/stall 为纯中文 name fallback，已写进 `src/i18n.ts` 头注释，不纳入本字典）。
- `src/` 内 `translate()/tr()/hasKey()` 字面量 key 11 个必须存在；字典中每个 key 必须至少被 HTML/content/源码之一引用（**死 key 直接红**）。
- 12 条 town/stall 的 `nameKey` 数据不在此字典内（历史游戏为中文 fallback），这是**已声明的范围限制**，不是遗漏。

### 2.2 插件（`client.js L` / `client.content.js STRINGS` / `locale/*.json`）

- `locale/zh.json` 与 `en.json`：结构相同、`meta.version` == `package.json` 版本、title/description 非空；本任务未改 locale 文件（已一致）。
- `L`：zh 56 / en 67 个叶子；唯一声明差异 = `en.actionLabels`（zh 回退到 famling `regions/actions` 的中文 `label`，**保留**，checker 显式登记）。
- `STRINGS`：zh/en 各 180 个叶子，完全对齐；引用包括 client.js `L` 经 props 传入懒 chunk 的 `S.*`（chat/reminder 输入面板）。
- 删除死 key：`L.version`、`L.settings`、`L.sound`、`STRINGS.hide`、`STRINGS.motion`（zh+en）。
- 修复缺 key：`STRINGS.today/commitments`（该 UI 分支此前实际渲染 `undefined: N · undefined: M`；这是本任务唯一可见文案修复，不涉功能/契约）。

## 3. 脚本收敛校验规则（`scripts/scripts-check.mjs`）

| # | check id | 规则 |
| --- | --- | --- |
| 1 | `inventory-file` | 清单存在、marker 完整、可解析 |
| 2 | `inventory-complete` | 磁盘上每个脚本恰好登记一次；每行都必须存在（无幽灵行） |
| 3 | `inventory-categories` | category ∈ {gate, generator, probe, release, art, tool, baseline} |
| 4 | `package-script-targets` | `package.json` 所有 `scripts/...` 目标存在 |
| 5 | `ci-script-targets` | `scripts/ci.mjs` 提到的所有 `scripts/...` 目标存在 |
| 6 | `gate-wiring` | `gate` 行必须接进 `package.json`/`ci.mjs`，或在 `TEST_WIRED_GATES` 声明测试接线（本仓 1 项：anim-timing-check.ts） |
| 7 | `generator-check-modes` | `generator` 行声明的 `--check`/`--self-test` 等旗标必须真实存在于源码，或写 `none: <理由>` |
| 8 | `retired-scripts` | 2 个 Electron 遗留脚本必须缺失，且不被脚本/package.json/ci.mjs 引用 |
| 9 | `no-deleted-paths` | 活脚本不得再引用已删除的 `app/electron` 路径 |

脚本分类统计（本次）：**104 文件 = 17 gate + 8 generator + 42 probe + 12 release + 15 art + 7 tool + 3 baseline**。其中 `scripts/gen-character-interactions.mjs`（task-137 并发新增，MB-104 单源）是在本清单建立后落盘的——清单/校验第一次跑就抓到未登记，已补为 `generator + --check` 并把其 `.d.mts` 声明一并登记，正好验证清单不是一次性快照。

## 4. 实测证据（本机 WSL2 / Node v24.22.1 / 2026-11-20）

| 命令 | 结果 |
| --- | --- |
| `node scripts/i18n-check.mjs` | **PASS (6 checks；32 keys × 2 locales，11 html，10 content，11 source)** |
| `node scripts/scripts-check.mjs` | **PASS (9 checks；104 files，17 gates，8 generators)** |
| `node --import tsx --test tests/status-generation.test.ts` | **3/3 pass** |
| `node --import tsx --test tests/i18n-convergence.test.ts` | **8/8 pass** |
| `node --import tsx --test tests/scripts-convergence.test.ts` | **13/13 pass** |
| `node --import tsx --test tests/parity-contract.test.ts` | **12/12 pass**（共享语义未漂移） |
| `npx tsc --noEmit`（主工作树，含并发 WIP） | **exit 0** |
| `npm run build` | **exit 0** |
| `node scripts/docs-check.mjs` | **PASS (27 checks)**（coverage 任务已把 coverage 门改为 required，数量随其改动） |
| `node scripts/gen-status.mjs --check` | **PASS**（STATUS = commit `0a5bc0b`、dirty 78、evidence `...-0a5bc0b`、test-suite 1927；生成后立即 `--check` 绿） |
| 插件 `npm test` | **245 tests / 245 pass / 0 fail / 0 skipped**（含新 `test/i18n.test.js`） |
| 插件 `npm run typecheck` | **`[typecheck] checkJs ok`**（content-extension.mjs 已纳入） |
| 插件 `npm run lint` / `npm run check` | **ok** |
| 插件 `node scripts/check-i18n.mjs` | **PASS (10 checks；L 56/67，STRINGS 180/180，locale meta 4)** |
| 插件 `node --test test/content-extension-compliance.test.js test/parity-contract.test.js` | **10 + 14 = 24/24 pass**（v3 合规字段/锚点行为不变） |
| `npm test`（全量，本任务收尾时最终工作树） | **1927 tests / 1927 pass / 0 fail / 0 skipped**（exit 0） |
| **canonical gate（并发 task-136 的 `npm run ci --summary-out artifacts/qa/ci-summary.json`，含本任务全部改动）** | **14/14 steps pass；1927 tests / 1927 pass / 0 fail / 0 skipped；build pass；coverage:check pass；docs:check pass**（summary：commit `0a5bc0b`、source=worktree、`artifacts/qa/ci-summary.json`） |

> 说明：主工作树含并发任务（task-132/133/136/137/139）未提交改动；2026-11-20 13:28 由并发 task-136 在**同一工作树**跑完 canonical `npm run ci` 并全绿（1927/1927，含本任务新增 24 例），可作为本轮合并工作树的回归证据；但它不是 clean-checkout/真实 CI 证据。插件 `npm test` 在 2026-11-20 复跑时 245/245。

## 5. 已知限制 / 未纳入本次写权限的残余

1. **MB-106 文档残余（README/NOTICE/THIRD-PARTY）**：`README.md` 仍写 Electron 宿主/`npm run electron:*`，`NOTICE`/`THIRD-PARTY.md` 仍把 electron 列为 dev 依赖。属 MB-106 §5 已登记的 follow-up，但不在 MB-108 写作用域（docs/plan/scripts/src/pet/tests），本次只做脚本侧清理。**不得对外声称 Electron 文档已清理。**
2. **`public/content/README.md` §3.5 仍写 content-extension v2/0.9.1**（SHARED 文档 D10 ②）：属产品公开文档，不在写作用域；以 `SHARED-CONTENT-SEMANTICS` 与代码常量为准。
3. **`.gitignore` 的 `.electron-win/`、`app/electron/dist/` 两条忽略项**未删（不在写作用域；无害）。
4. **`docs/STATUS.md` 的 `test-suite` 来源是 dirty worktree 的 canonical gate summary**（`artifacts/qa/ci-summary.json`，commit `0a5bc0b`、source=worktree、1927/1927/0 fail），不是 clean-checkout summary；行内已明确标 `worktree`。若要 clean-checkout 数字，需在干净 worktree 跑 `npm run ci:clean -- --summary-out artifacts/qa/ci-clean.json` 后 `npm run status -- --tests-from <inner.json>` 重生成。
5. **EXECUTION-STATUS/MASTER-BACKLOG 的 MB-108 行未改**：`EXECUTION-STATUS-2026-11-20.md` 与 `MASTER-BACKLOG-2026-11-19.md` 当前含 task-134（终态重分类）的未提交改动，且其口径为「对账快照」。建议 lead 在合并时把 MB-108 行更新为（建议原文）：
   > `| MB-108 | DONE（工程收敛完成；残余文档见 §5） | scripts 清单+9 项校验、i18n 双端单一源+24 例测试、STATUS 生成修复+重生成、SHARED 文档同步 v3 合规字段、插件 content-extension checkJs=0；残余：README/NOTICE/THIRD-PARTY 的 Electron 文案、public/content/README §3.5（越权文档） |`
   并把 A 组从 8 项降为 7 项、PARTIAL 21→20、DONE 58→59（如 lead 认为残余文档不阻断 MB-108 关闭）。**本任务不擅自改对账文件。**
6. **插件 `package.json` 未加 `check:i18n` 脚本**：为避免与并发 task-139（插件独立 lock/clean checkout）改同一文件；i18n 门已随 `npm test` 执行，后续可一行接入 `release:check`。
7. **`src/pet` 未改**：本任务无需改 pet 运行时代码（`src/i18n.ts` 属收件箱外但为 i18n 单一源的必要文件，已按任务标题「i18n」处理并在本报告登记）。

## 6. 与 MB-108 验收项的对应

| MB-108 描述 | 本次结果 |
| --- | --- |
| STATUS 生成 / 滞后修正 | ✅ 生成器排序 bug 修复 + 3 例测试 + `docs/STATUS.md` 重生成 + `status:check` 绿 |
| SHARED 文档滞后（v3 合规字段） | ✅ §2/§3/§0/§4/§6 同步；D10① 已复核修复、D10② 登记 follow-up |
| i18n 收敛 | ✅ famling 字典单源 + 6 项 check + 8 例测试；插件 10 项 check + 真实缺键 bug 修复 + 死 key 清理 |
| 脚本/生成器收敛 | ✅ 103 文件清单 + 9 项 check + 13 例测试；退役/Electron 残留清理；generator `--check` 真实性校验 |
| 插件 content-extension 全量 checkJs（MB-107 交接） | ✅ ~40 error → 0；`npm run typecheck` = `checkJs ok` |
| 不改变功能 | ✅ 唯一可见变化是修复 `undefined` 计数标签；校验器/契约/行为测试（parity 12、compliance 10、插件 245）全绿 |

**建议终态**：MB-108 主体工程项 = **DONE**；残余 = README/NOTICE/THIRD-PARTY 的 Electron 文案与 `public/content/README` §3.5（均为不在本任务写权限的文档 follow-up，归 MB-106/E7-T1 或文档 owner）。若 lead 要求这些文档同批关闭，需追加授权对应路径。

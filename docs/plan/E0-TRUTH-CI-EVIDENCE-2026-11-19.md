# E0 — 真值 / CI / 发布证据包（task-72 · MB-001/002/003/005/006）

Date: 2026-11-19 · 仓库：`desktop-games`（Famling 私有基座）· 基线 commit：`7c5870a`
Scope: 只改 `package.json`、`scripts/`、`.github/workflows/ci.yml`、`README.md`、`docs/STATUS.md`、`docs/plan/`、历史快照的订正头，以及 `tests/` 的平台可移植性最小修复（python 解析 + skip 原因字符串，不改断言）；**不动** `src/`、插件、Rust、`NOTICE`/`DECLARATIONS`/`docs/legal`（法务文本由 task-77 负责）；不 commit / 不 push。

## 1. 结论

| MB | 交付 | 状态 |
| --- | --- | --- |
| MB-001 | `npm run ci`（canonical gate，CI 同一命令）；`.github/workflows/ci.yml` 已改为只调用它；`workflow_dispatch` 就绪 | **工程部分完成**；私有 remote + branch protection + 首次真实 CI run = **BLOCKED（外部：无 remote）** |
| MB-002 | `docs/STATUS.md` 单一真值（`scripts/gen-status.mjs` 生成）+ `scripts/docs-check.mjs` 真值门；README/HANDOFF/STATUS/RUNBOOK/CHECKLIST 的 remote/CI/signed/DLC 不实声称已订正 | **完成**（STATUS 已生成本轮真实计数，见 §6/§3） |
| MB-003 | `scripts/ci-clean-checkout.mjs`（`git archive` / `--worktree` 导出 → `npm ci` → `npm run ci`，Linux/Windows 同一脚本；CI 加 clean-checkout 双平台 job）；build 移到 test 之前消除 dist 测试静默 skip | **工程完成**；Linux + Windows 干净 checkout 全门绿（13/13），HEAD `git archive` 模式也验证（§6） |
| MB-005 | `scripts/release-evidence.mjs`：SHA256SUMS + RELEASE-MANIFEST + BUILD-INFO，commit/tag 绑定、unsigned 显式、`--verify` 校验链、`--self-test` 防篡改 | **脚本完成并自测**；真实 C0 bundle 已生成且 `--verify` 通过（§6.3）；真实 **signed / C1 发布**证据 = BLOCKED（无证书 + 无 Windows Tauri 构建） |
| MB-006 | 本文件 = C0–C3 通道与门禁；停止 signed/DLC/CI 未兑现宣称（README/HANDOFF/RELEASE-RUNBOOK/RELEASE-CHECKLIST 已订正） | **完成** |

> **不得伪造**：本仓库当前 **无 git remote**（`git remote -v` 为空），因此 GitHub Actions **从未运行**；无 Authenticode 证书；DLC 生产信任根 `keys: []`。任何文档/口头结论不得写“CI 全绿 / 已签名 / 含 DLC / 可公开发布”。

## 2. 发布通道 C0–C3 与门禁（MB-006）

依据 `docs/plan/MASTER-BACKLOG-2026-11-19.md` D2 的通道定义：

| 通道 | 名称 | 受众 | 必须满足 | 当前 |
| --- | --- | --- | --- | --- |
| **C0** | 内部构建 | 仅本机/维护者 | 任意 commit（可 dirty，需记录）；`npm run ci` 通过；证据 `--channel C0`（可 dirty，显式记录）；**永不对外** | 可用 |
| **C1** | unsigned 邀请 private beta | 受邀测试者（私域） | 干净 commit；`npm ci && npm run ci` 绿（干净 checkout）；`release-evidence --channel C1 --artifacts-dir ...` 产出 `SHA256SUMS.txt`+`RELEASE-MANIFEST.json`+`BUILD-INFO.json`；**unsigned 明示**；无 DLC、市场默认零请求；legal strict 的阻塞项由 owner 逐条签字或已清零；数据隔离（临时 appdata） | **当前唯一承诺通道**；产物/证据生成器就绪 |
| **C2** | signed 私域发布 | 受邀用户 | C1 全部 + Authenticode **Valid**（`release-sign.mjs --verify` 的 signing report，本脚本要求 `{signed:true}`/`{status:"Valid"}`）+ tag 指向 HEAD + SHA256SUMS 外层签名 + DLC 若包含必须过 trust gate；`release-evidence --channel C2 --tag ... --signing-report ...` | **BLOCKED**：无证书/无 release-signing secrets |
| **C3** | 公开商店 | 公众 | C2 全部 + updater/吊销策略 + 商店/法务/年龄门 + 产品身份定稿（`DesktopGames`→`Famling` 迁移）+ 供应链 pinning | **BLOCKED**：外部依赖 |

规则（fail-closed）：

1. `release-evidence` 对 C1+ 拒绝 dirty 工作树；C2/C3 拒绝无 `--tag`（tag 必须指向 HEAD）或无 `--signing-report` 的调用。
2. 任何 unsigned 证据的 `RELEASE-MANIFEST.json` 写 `unsigned: true`、`signing.status="unsigned"`，并带 “UNSIGNED EVIDENCE … never describe as signed” 注记。
3. “signed” 只能来自 Authenticode 验证报告；本脚本不代替 `release-sign.mjs --verify`。
4. DLC：C0/C1 一律 `dlcTrust.status="not-included"`；C2/C3 需另行 DLC trust gate（`scripts/verify-dlc-trust.mjs`），本脚本只记录不代跑。

## 3. 真值文件与文档门禁（MB-002）

- **唯一真值**：[`docs/STATUS.md`](../STATUS.md)，由 `scripts/gen-status.mjs` 从机器事实生成：commit/branch/dirty、版本、产品身份、真实 `legal-check --strict` 计数、DLC trust root key 数、最新 clean-checkout 测试数（来自 ci summary）、最新 release evidence、CI/remote 事实。**禁止手改**。
- **重生成**：`npm run status`；**漂移检查**：`npm run status:check`。
- **真值门禁**：`npm run docs:check`（已接入 `npm run ci`）——校验 STATUS 字段/commit/remote/channel/unsigned、README 指向、历史快照指向 STATUS、README/RUNBOOK/CHECKLIST 中已订正的不实声称、package.json 脚本、`ci.mjs` 步骤集合、ci.yml 只调用 `npm run ci`。
- **已订正的不实声称**（逐文件；`docs/research/`、`docs/audit/` 中的评审/审计快照保留原文引用，不在此次订正范围——它们记录的是“当时文档如何错”，不是现值声称）：
  - `README.md`：删除“私有远端已建 / 首次运行结果见 GitHub Actions”；改为 C1 unsigned + 无 remote/无证书/无 DLC 事实；测试数/blocker 数不再写死，指向 STATUS；法务事实按 task-77 提供修正（ASR 同意门、数据删除、42 WAV、TOS 2026-11-17.6）。
  - `docs/HANDOFF-2026-11-14.md` / `docs/HANDOFF-2026-11-15.md`：文首加历史快照/订正头；HANDOFF-15 的“已建私有远端 / CI run 43711355947 全绿 / 远端 master 快照”标注无法复核、按未兑现处理。
  - `docs/STATUS-2026-11-15.md` / `docs/STATUS-2026-11-16.md`：历史快照头 + 指向 `docs/STATUS.md`。
  - `docs/RELEASE-RUNBOOK.md`：删除“私有远端已于 2026-11-15 建立 / 首次运行结果以 GitHub Actions 为准”；改为“从未在 GitHub 运行 + 本地 `npm run ci`”。
  - `docs/RELEASE-CHECKLIST.md`：删除“证书到位前只能发布 signed release”（自相矛盾）；改为“只能 C1 unsigned beta，不得称 signed/含 DLC”。

## 4. CI 与可自证构建（MB-001 / MB-003）

### 4.1 canonical gate：`npm run ci` = `scripts/ci.mjs`

步骤（顺序即实现；`build` 先于 `test`）：

1. `version:check` — 版本镜像一致
2. `typecheck` — `tsc --noEmit`
3. `release-sign:plan` / `repro-check:inputs` — 发布策略/可复现输入 smoke（fail-closed 策略不因无证书而伪造）
4. `build` — vite 生产构建（**先于 test**：`tests/legal-package-*.test.ts` 在 `dist/` 缺失时会 skip，旧 CI 顺序会把 skip 藏起来）
5. `test` — `node --import tsx --test tests/*.test.ts`
6. `validate:content` / `verify:pack` / `fci:validate` — 内容包、签名包、FCI 校验
7. `art:check-specs` — python 美术 spec 契约（CI 用 actions/setup-python 固定 3.12；本机无 python 时显式 SKIP 并打印原因）
8. `legal:check` — 法务包/链接门（硬阻塞 fail，DRAFT 等为 warning；`--strict` 仍用于发布门与 STATUS 计数）
9. `docs:check` — 真值门（见 §3）
10. `evidence:self-test` — 发布证据生成+校验+防篡改自测

**用户数据隔离**：`ci.mjs` 为每个子进程创建临时沙箱并重定向 `HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`XDG_*`/`TMPDIR`，另导出 `DG_QA_DATA_DIR`；门跑完删除沙箱。门禁本身不读写真实 `%APPDATA%`。

**Python 依赖（可移植性修复）**：动画生成器可复现测试需要 `python` + `numpy`（外部构建依赖，非用户数据）。`ci.mjs` 把真实解释器的 **user-site 包目录以只读 `PYTHONPATH`** 暴露给沙箱（WSL 的 numpy 装在 `~/.local`，Windows 的 `APPDATA` 被沙箱重定向），且不让沙箱写回真实 profile；CI 用 `actions/setup-python` + `python -m pip install numpy==2.5.4` 固定。测试侧不再硬编码 `python3`：`tests/tooling/python.ts` 解析 `python`/`python3`，缺解释器或 numpy 时 `t.skip()` 并打印明确原因（Linux/Windows 实测见 §6）。

### 4.2 GitHub Actions：`.github/workflows/ci.yml`

- `gate` job：matrix `ubuntu-latest` + `windows-latest`，Node 24 + Python 3.12，`npm ci` 后**只调用** `npm run ci -- --summary-out artifacts/qa/ci-summary.json`（本地与 CI 不可能漂移）。
- `clean-checkout` job：matrix Linux + Windows，`node scripts/ci-clean-checkout.mjs --summary-out artifacts/qa/clean-checkout.json`（导出 commit → 隔离 npm cache 安装 → 同一门）。
- `rust-dlc`（ubuntu）与 `rust-tauri-tests`（windows，`continue-on-error: true`）保留。
- `workflow_dispatch` 已配置（手动跑）；`permissions: contents: read`。
- **现实**：仓库当前无 remote ⇒ 上述 job **一次都没有运行**；首次真实 run 与 branch protection 必须等 remote 建立（外部步骤，owner/用户授权）。运行记录归档约定：`docs/plan/ci-runs.json`（`{url, commit, workflow, conclusion, ranAt}`），STATUS 会读取。

### 4.3 干净 checkout 双平台：`npm run ci:clean`

`scripts/ci-clean-checkout.mjs`：

- 默认 `git archive --format=tar HEAD` 导出到 `%TEMP%`/`/tmp` 新目录（不含 `.git`/`node_modules`/`dist`/未跟踪文件）；`--worktree` 用 `git ls-files -z -co --exclude-standard` 导出**当前工作树**（提交前验证用，保留可执行位/符号链接）。
- 在导出目录里 `npm ci`（**隔离 npm cache**，不依赖本机 npm 缓存；2026-11-20 起 Electron 已移除，旧的 `--with-electron-binary` no-op 开关一并删除，见 MB-108），再 `npm run ci`。
- 通过环境把父仓库 git 事实（commit/branch/remote/dirty=false）传入导出树；summary 带 `source: git-archive|worktree-export`。
- 失败默认保留导出目录便于排查；成功删除临时目录；`--target` 指定的目录永不自动删；删除前断言绝对路径在 `tmpdir()` 下。

## 5. 发布证据（MB-005）：`scripts/release-evidence.mjs`

```bash
# 生成（C1：干净 commit 上；unsigned 明示）
node scripts/release-evidence.mjs --channel C1 --artifacts-dir <artifacts> \
  --out artifacts/evidence/<run> --tag v0.1.0

# 复验（哈希链 + commit/tag 绑定）
node scripts/release-evidence.mjs --verify artifacts/evidence/<run>

# 自测（生成→校验→篡改必须被拒→通道门 fail-closed）
node scripts/release-evidence.mjs --self-test
```

产物与完整性链：

```
files/*  --sha256-->  SHA256SUMS.txt  --sha256-->  RELEASE-MANIFEST.json  --sha256-->  BUILD-INFO.json
```

- `BUILD-INFO.json`：commit/branch/tag(+tagVerified/tagCommit)/dirty、Node/npm/platform/arch、`package.json`/`package-lock.json` sha256、evidence 链哈希、`SOURCE_DATE_EPOCH` 可复现模式。
- `RELEASE-MANIFEST.json`：channel/channelTitle、`unsigned` + `signing.status`、`dlcTrust`、provenance（commit/tag/dirty 文件列表）、文件表（path/bytes/sha256）、验证命令、显式 unsigned 注记。
- `SHA256SUMS.txt`：`<sha256>  files/<path>`，bundle 可整体搬移后用 `sha256sum -c` 或本脚本 `--verify` 复核。
- `--verify` 失败条件：文件缺失/哈希或大小变化、manifest/sums/build-info 链哈希不一致、channel 与 unsigned 矛盾、HEAD 已移动（可用 `--allow-head-moved` 显式接受历史 bundle）、tag 不再指向记录 commit。
- 生成器不接触真实 `%APPDATA%`；只读传入的 artifacts 并写 `--out`。

## 6. 实测证据（本机，2026-11-19）

> summary JSON 落在 `artifacts/qa/`（gitignored）；命令均可复跑。提交约束为“不 commit”，因此全门验证使用 `--worktree` 导出（当前工作树超集）+ 一次 HEAD `git archive` 模式验证。

### 6.1 干净 checkout 全门：worktree-export（Linux + Windows 均绿）

| 平台 | 命令 | 结果 | npm ci | gate | 测试（node:test） |
| --- | --- | --- | --- | --- | --- |
| Linux / WSL2（node v24.22.1） | `node scripts/ci-clean-checkout.mjs --worktree --keep --summary-out artifacts/qa/ci-clean-linux.json` | **ok=true，13/13 步通过** | 12.0s | 27.8s | 1211 tests / 1207 pass / **0 fail** / 4 skip |
| Windows / win32（node v24.22.1） | 同一脚本（Windows node 调用，`D:\...` 路径） | **ok=true，13/13 步通过** | 19.0s | 42.2s | 1211 tests / 1204 pass / **0 fail** / 7 skip |

- 导出树不含 `.git`/`node_modules`/`dist`；`npm ci` 使用导出目录内独立 npm cache；gate 的 `commit=7c5870a`、`dirty=false`（来自父仓库 git 事实），13 个步骤全部通过（含 typecheck/build/test/validate:content/verify:pack/art/FCI/legal/docs:check/evidence:self-test）。
- `build` 在 `test` 之前：dist 依赖测试不再静默 skip。
- skip 均有明确原因：**Linux 4** = 2×release-win（干净 checkout 无 release artifacts）+ 2×powershell（WSL Linux run 默认剥离 `/mnt/*` interop，对齐 ubuntu CI）；**Windows 7** = 1×symlink 不可用 + 3×python 生成器（本机 Windows python 无 numpy，显式 skip；CI 用 `pip install numpy==2.5.4`）+ 1×POSIX signtool stub（win32）+ 2×release-win artifacts。
- 证据文件：`artifacts/qa/ci-clean-linux.json` + `ci-clean-linux.inner.json`、`artifacts/qa/ci-clean-windows.json` + `ci-clean-windows.inner.json`（均 gitignored）。
- 注意：`--worktree` 导出包含并行 agent 的未提交改动（task-73 的 data-isolation 测试等，比 HEAD 多约 35 个测试）；HEAD 基线见 §6.2。

### 6.2 HEAD `git archive` 干净 checkout（脚本默认模式）

| 平台 | 命令 | 结果 |
| --- | --- | --- |
| Linux | `node scripts/ci-clean-checkout.mjs --target /tmp/dg-head-archive --keep --gate 'npm test' --summary-out artifacts/qa/head-archive-linux.json` | ok=true；`git-archive` 导出 HEAD `7c5870a`（不含未提交/未跟踪文件）→ `npm ci` 16.1s → `npm test` 7.5s：**1176 tests / 1169 pass / 0 fail / 7 skip** |

因“不 commit”约束，HEAD 里还没有本任务的 `npm run ci`，所以 HEAD-archive 用 `--gate 'npm test'` 验证**默认导出模式本身**；完整 `npm run ci` 的 HEAD-mode 由 CI `clean-checkout` job 在提交后执行（matrix Linux+Windows）。

### 6.3 发布证据（C0，真实构建产物）

- `node scripts/release-evidence.mjs --self-test`：**ok**（generate → verify → 篡改被拒 → dirty C1 拒绝 → unsigned C2 拒绝）。
- 真实 C0 bundle（干净导出的 vite 构建 `dist/`）：`artifacts/evidence/2026-11-19-c0-web-dist/` —— **637 个文件**，`SHA256SUMS.txt` + `RELEASE-MANIFEST.json` + `BUILD-INFO.json`；`--verify` → **ok**；`unsigned:true`、`channel:C0`、commit `7c5870a`、tag none、`dlcTrust.status="not-included"`、production trust root keys=0；`checksumsSha256=7f044b83…`、`manifestSha256=87965269…`。
- 该 bundle 是 **C0 内部证据，不是发布物**；C1 真实发布证据需 Windows Tauri 构建 + 干净 commit + tag（本任务不 commit，且无证书），按 §7 仍阻塞。

## 7. 剩余阻塞（外部；fail-closed，不伪造）

| ID | 阻塞 | 现状证据 | 解除条件 |
| --- | --- | --- | --- |
| B1 | 私有 remote + branch protection + 首次真实 CI run | `git remote -v` 为空；reflog 无远端操作；Actions job 从未运行 | owner/用户建 remote 授权后：push → `workflow_dispatch` 首跑 → 归档 run URL 到 `docs/plan/ci-runs.json` → branch protection |
| B2 | Authenticode 证书（C2/C3） | 无证书；产物 `NotSigned`；`release-sign.mjs --check-env` 无签名材料 | 采购 OV/EV 证书 + `release-signing` environment secrets + 首次 signed tag 构建报告 |
| B3 | DLC 生产信任根 ceremony | `native/dlc-verify/trust/production-trust-root.json` → `keys: []`；两个 pack 仍为 legacy `signature.txt` | owner 离线生成生产私钥（两人保管）+ 注入公钥 + 重签 pack + `verify-dlc-trust` 绿 |
| B4 | SHA256SUMS/mint 外层签名 | 未实现 minisign/cosign detached 签名 | 发布公钥 + detached 签名步骤（C2 前） |
| B5 | 24h 原生 soak / 真机安装 / Windows release 构建证据 | `artifacts/tauri-soak-24h.json` 不存在；Windows Tauri 安装包为 2026-11-14 旧产物 | Windows 原生挂机与安装冒烟 |
| B6 | legal strict 清零/owner 签字 | 实际计数见 `docs/STATUS.md`（会随文档变更波动） | owner 逐条签字或修文本；`docs/legal/APPROVALS.md` 非 DRAFT |

## 8. 边界与不做

- 不改 `src/`、插件、Rust；不 commit / 不 push；不打印任何凭据。
- `tests/` 只做平台可移植性最小修复、不改断言：新增 `tests/tooling/python.ts`（解析 `python`/`python3` 并探测 numpy），3 个动画生成器测试在缺解释器/numpy 时 `t.skip()` 并打印原因；`tests/release-sign.test.ts` 的 3 个平台 skip 补上原因字符串。
- 不创建 remote、不跑 GitHub Actions（本机无 remote；创建 remote 属外部/owner 动作）。
- 不伪造 signed/DLC/CI 状态；不把 2026-11-14 的旧 `artifacts/` 包当成本次 HEAD 发布物。
- `docs/STATUS.md` 的 `test-suite` 只接受**干净 checkout** 的 ci summary；没有记录就是“unknown”，不抄历史文档数字。

## 9. 复现命令

```bash
npm ci
npm run ci                                   # canonical gate
npm run ci:clean                             # 干净 checkout（HEAD）全门
npm run ci:clean -- --worktree --keep        # 提交前工作树验证（保留导出目录）
npm run status                               # 重生成 docs/STATUS.md
npm run status:check                         # 漂移检查
npm run docs:check                           # 真值门
node scripts/release-evidence.mjs --self-test
node scripts/release-evidence.mjs --channel C0 --artifacts-dir dist --out artifacts/evidence/<run>
node scripts/release-evidence.mjs --verify artifacts/evidence/<run>
```

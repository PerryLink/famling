# RELEASE AUDIT — C1 unsigned 邀请 beta（task-88 · 发布前最终审计）

> **审计时点：2026-11-20 00:45 +08（UTC 约 2026-11-19T16:45Z），HEAD `08534a4`——此时尚未做最终的 STATUS 提交。** 本文件写入后由 lead 随“docs + F2 脚本修复”提交；最终提交后的只读复核结果在会话报告中给出（按 lead 要求不回写本文件）。
> 审计角色：exec-release-audit（只读核验 + 允许修复测试/脚本/文档导致的门禁失败；不改业务逻辑；不 commit / 不 push）。

Date: 2026-11-20 (Asia/Shanghai) · 仓库: `/mnt/d/Projects/dsh/desktop-games`（Windows `D:\Projects\dsh\desktop-games`，私有，无 remote）

## 0. 结论摘要

| # | 审计项 | 结果 | 关键证据 |
| --- | --- | --- | --- |
| ① | `npm run ci`（13 步，HEAD 工作树） | **绿（修复后）** | 13/13；1335 tests / 1335 pass / 0 fail；`artifacts/audit-release/ci-worktree-fixed.json` |
| ② | `npm run ci:clean`（git archive HEAD 干净 checkout） | **红（1 项，提交后即绿）**；worktree-export 副本绿 | HEAD `08534a4` 的 `docs/STATUS.md` 记录 commit `b83b11e` ⇒ docs:check 唯一红；修复件已在工作树，需一次提交 |
| ③ | Windows `cargo test` | **绿** | `50 passed; 0 failed; 0 ignored`（要求 50+） |
| ④ | `npm run build` + Tauri release build + NSIS + release-win + release-evidence | **绿（unsigned，NotSigned）** | exe/ installer/ portable zip 哈希见 §4；release-win --verify 2/2；C0 evidence 生成+verify 通过 |
| ⑤ | docs/STATUS 真值 | **修复后与机器事实一致；最终 regen 待提交** | 初始 STATUS commit 过期（`b83b11e`）；legal 计数 34→16（陈旧 staging）；drift check 见 §6 |
| ⑥ | 公开 famling/plugin 远端 HEAD 与 CI | **均 success** | famling `a75f626` run 44565622763 success；dsh-famling `a4e08d9` run 44565520156 success（API + ls-remote 双核） |
| ⑦ | DLC / signed / remote-server 虚假宣称 | **无硬性虚假宣称；1 个 C1 边界口径待 owner 决定** | docs-check 24/24；扫描见 §8；unsigned 预览包含 dev-signed packs 的“无 DLC”口径见 F4 |

### 阻塞/修复项一览

| ID | 类型 | 内容 | 状态 |
| --- | --- | --- | --- |
| F1 | 门禁（提交级） | HEAD 内 `docs/STATUS.md` 过期 ⇒ `ci:clean`（git-archive HEAD）在 docs:check 红 | 修复件已生成（`npm run status`），**等最终提交**；提交后重跑 |
| F2 | 脚本 bug（已修） | `scripts/reproducible-zip.ps1` 使用 PS 5.1 不存在的 `DateTimeOffset.FromFileTimeUtc` ⇒ `release-win --all` 默认路径硬失败 | 已修 1 行并实测；需随最终提交 |
| F3 | 外部（律师/owner） | `legal-check --strict` = BLOCKED（16 DRAFT 文本） | **未解除**；C1 需 owner/律师逐条签字或修文本 |
| F4 | 口径/合规 | C1 定义“无 DLC”，但 unsigned 便携包实际含 `packs/keys/dev-public.pem` + 2 个 legacy `signature.txt` pack；release-evidence 写 `dlcTrust.status="not-included"` | **未决**；建议 owner 明确口径或 C1 打包排除 pack 信任材料（见 §8.2） |
| F5 | 真值噪声（已消） | `artifacts/portable` 陈旧 staging 使 legal strict 由 16 变 34 blocker | release-win 重建 staging 后恢复 16；最终 STATUS regen 记录 16 |
| F6 | 信息项 | 无 git remote ⇒ GitHub Actions 从未运行；`docs/plan/ci-runs.json` 为空 | 外部（建 remote + 首跑） |
| F7 | 信息项 | Windows cargo 测试在 CI 里是 `continue-on-error: true`（实验性，非合并门） | 本机已 50/50 绿；改 CI 门为外部动作 |
| F8 | 信息项 | MSI 未构建（runbook 标注 optional，NSIS 必需已生成）；24h soak 未记录 | 记录，不伪造 |

## 1. 环境与基线

- **HEAD**: `08534a48f61685100125640364db4356652949aa`（branch `master`；commit date 2026-11-20 00:23:32 +0800；源码树总 1550 文件于 `git archive`）
- **remote**: `git remote -v` 为空（0 个）⇒ 本仓 GitHub Actions 不可能运行；`docs/plan/ci-runs.json` = `[]`
- **审计开始工作树**: 3 个他人未提交改动（`M docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md`、`M docs/research/COMPETITORS-CHINA-DSH.md`、`?? docs/art/CALIBRATION-SET-2026-11-16.md`）；审计期间其他 agent 另新增 `?? docs/plan/EXECUTION-STATUS-2026-11-20.md`、`M docs/plan/MASTER-BACKLOG-2026-11-19.md`（本审计未触碰）
- **Linux（WSL2 Ubuntu-24.04 x64）**: node `v24.22.1`、npm `11.19.1`、python `3.12.3` + numpy `2.5.4`、20 core / 15 GiB
- **Windows 原生**: node `v24.22.1`、npm `11.16.0`、cargo/rustc `1.99.1`、VS2022 BuildTools（vcvars64）、WebView2 可用（审计开始时 `desktop-games-tauri.exe` PID 13692 在跑，已按 runbook `taskkill /IM desktop-games-tauri.exe /T /F` 停止，剩余进程 0）
- **产物/证据目录**: `artifacts/audit-release/`（`artifacts/` 整体 gitignored，不污染提交）

> 环境修复记录（非代码）：审计开始时共享工作树的 `node_modules` 是 Windows 安装态（只有 `@rolldown/binding-win32-x64-msvc`），Linux `vite build` 因缺 `@rolldown/binding-linux-x64-gnu` 失败；执行 `npm ci`（Linux）后恢复。Windows 构建前再执行 Windows `npm ci`。属环境态，不计为代码门禁失败。

## 2. 门禁 ①：`npm run ci`（工作树，13 步）

命令：

```bash
cd /mnt/d/Projects/dsh/desktop-games
npm run ci -- --summary-out artifacts/audit-release/ci-worktree-fixed.json
```

结果：**绿，13/13 步通过，总 91.7s**（commit `08534a4`，dirty=true，source=worktree，node v24.22.1 / npm 11.19.1 / linux x64，python3 3.12）。

| # | 步骤 | 结果 | 耗时 |
| --- | --- | --- | --- |
| 1 | version:check（12 个版本镜像） | pass | 0.7s |
| 2 | typecheck（tsc --noEmit） | pass | 25.0s |
| 3 | release-sign:plan（fail-closed 策略 smoke） | pass | 0.1s |
| 4 | repro-check:inputs | pass | 4.1s |
| 5 | build（vite production） | pass | 23.1s |
| 6 | test（`node --import tsx --test tests/*.test.ts`） | pass | 26.5s |
| 7 | validate:content | pass | 1.1s |
| 8 | verify:pack | pass | 0.5s |
| 9 | art:check-specs（python） | pass | 0.1s |
| 10 | fci:validate | pass | 2.9s |
| 11 | legal:check | pass | 0.8s |
| 12 | docs:check | pass | 0.2s |
| 13 | evidence:self-test | pass | 6.4s |

- 测试计数（node:test summary）：**tests 1335 / pass 1335 / fail 0 / skipped 0 / todo 0**（duration 27.45s）。
- 证据：`artifacts/audit-release/ci-worktree-fixed.json`、`.log`。

### 2.1 修复前的红（按发现顺序）

1. **环境态**：Linux `build` 因 `node_modules` 为 Windows 安装态缺 rolldown linux binding 失败 → `npm ci`（Linux）恢复（见 §1 末）。
2. **真值门**（代码/文档级）：`node scripts/docs-check.mjs` 在 HEAD 工作树 FAIL 1/24：

```
[docs] FAIL status-commit — STATUS commit b83b11e != HEAD 08534a4 (or HEAD^) (regenerate with `npm run status`)
```

   修复：`npm run status` 重生成 `docs/STATUS.md`（记录 commit `08534a4`、dirty 3），随后 docs:check **PASS 24/24**，全门 13/13 绿。

## 3. 门禁 ②：`npm run ci:clean`（干净 checkout）

### 3.1 默认模式 = `git archive HEAD`（当前 HEAD 的真实门禁）

```bash
node scripts/ci-clean-checkout.mjs --summary-out artifacts/audit-release/ci-clean-head.json
```

结果：**红，唯一失败步 = docs:check**；其余 11 步全绿（build→test 均执行，test 计数 **1335 tests / 1327 pass / 0 fail / 8 skipped**）。

- 导出：`git archive HEAD` 1550 files（不含 `.git`/`node_modules`/`dist`/未跟踪）；`npm ci` 4.6s（隔离 cache）；gate 19.0s。
- commit `08534a4`，dirty=false，source=git-archive。
- 失败原因与修复前一致：HEAD 提交里的 `docs/STATUS.md` 记录 `commit: b83b11e`（`HEAD^` = `aae381f`），docs-check 的 `status-commit` 只接受 HEAD/HEAD^：

```
[docs] FAIL status-commit — STATUS commit b83b11e != HEAD 08534a4 (or HEAD^) (regenerate with `npm run status`)
FAILED at docs:check (exit 1)
```

- 证据：`artifacts/audit-release/ci-clean-head.json` + `.inner.json` + `.log`；失败时导出树保留于 `/tmp/dg-clean-QG2dGE`（临时，含完整 HEAD 内容，可用于人工复核）。

**根因（提交链）**：`docs/STATUS.md` 在 `d2a0ea9` 被接受（记录其 parent `b83b11e`），随后 `aae381f`、`08534a4` 两次提交都未把重生成的 STATUS 一起提交 ⇒ 任何“干净 checkout + docs-check”都必然红。**修复只需一次提交**：把工作树中重生成的 `docs/STATUS.md`（记录 `08534a4`）提交进去，则新 HEAD 的 `HEAD^ = 08534a4` ⇒ docs:check 通过。

### 3.2 工作树导出模式（提交前的等价证明）

```bash
node scripts/ci-clean-checkout.mjs --worktree --summary-out artifacts/audit-release/ci-clean-worktree.json
```

结果：**绿，13/13，npm ci 4.1s + gate 19.9s**；导出 1551 files（HEAD + 当前未提交文档/脚本修复），commit `08534a4`，dirty=false（由脚本以 export 语义记录），source=worktree-export；**test 1335 / pass 1327 / 0 fail / 8 skipped**。

- 说明：worktree-export 证明“当前完整工作树内容（含 F1/F2 修复）从零 `npm ci` 起可全门绿”；它不能替代 §3.1 的 HEAD 提交级证据。
- 证据：`artifacts/audit-release/ci-clean-worktree.json` + `.inner.json` + `.log`。

### 3.3 提交后回填（待最终 HEAD）

最终提交后由只读复核确认（结果在会话报告）：新 HEAD SHA、`npm run ci:clean`（git-archive）13/13、test 计数、STATUS commit 绑定。复核清单见 §9。

## 4. Windows 原生：cargo test + Tauri release build + 发布打包

### 4.1 `cargo test`（app/tauri/src-tauri）

```bat
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d D:\Projects\dsh\desktop-games\app\tauri\src-tauri
cargo test --no-fail-fast
```

结果：**`test result: ok. 50 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out`**（任务要求 50+，达标；18s 内完成）。日志：`artifacts/audit-release/cargo-test-win.log`。

### 4.2 前端 + Tauri release + NSIS + 便携包

| 步骤 | 命令（Windows 原生） | 结果 |
| --- | --- | --- |
| 前端生产构建 | `npm run build` | 成功（vite 1.02s；dist 含 42 baked WAV + 38 legal 文件） |
| Rust release | `cmd /c scripts\build-tauri-win.bat`（cargo build --release --features custom-protocol） | 成功，47.69s；1 个 warning `field key_pem is never read`（dead_code，不阻塞） |
| NSIS | `cmd /c scripts\bundle-tauri-nsis-win.bat`（Tauri CLI 2 + makensis） | 成功；`DesktopGames_0.1.0_x64-setup.exe` **8,181,322 B（7.80 MiB）** |
| 便携包+校验+provenance | `set SOURCE_DATE_EPOCH=1795105412 && node scripts\release-win.mjs --all --strict` | 成功；portable zip **9,489,261 B**；SHA256SUMS.txt + RELEASE-MANIFEST.json |
| 校验 | `node scripts\release-win.mjs --verify` | **2/2 ok**（portable zip + NSIS setup） |

产物哈希（SHA-256）：

| 产物 | SHA-256 | bytes |
| --- | --- | --- |
| `app/tauri/src-tauri/target/release/desktop-games-tauri.exe`（NSIS patch 后） | `c2d14d8a2914246b1aac1a63a53d72bd7ba9cf1b002266a0a5da0430383884ef` | 18,493,952 |
| `artifacts/DesktopGames_0.1.0_x64-setup.exe` | `9b05326ac51985965621d988c28d0681b8f539664829cd10400af8af3cfaff1f` | 8,181,322 |
| `artifacts/DesktopGames-0.1.0-portable.zip` | `206ac2a9cc3f2b5570ee2728c125f5d99780be48e39446cd648678a70ae2496d` | 9,489,261 |
| （构建前未 patch exe，仅记录） | `f54ff04f0f0b32f7398a6f2791257f8c2e79cf8dd8e469cea01ed058f7c01946` | 18,493,952 |

- **Authenticode 实测**：`Get-AuthenticodeSignature` 对 exe 与 NSIS setup 均为 **NotSigned**（unsigned 声明为真）。
- `release-win` 的 `dlcTrust` 记录为 `status: "fail"`（advisory，未加 `--require-dlc-trust`）：`no usable ACTIVE production signing key`、`packs/keys/dev-public.pem` 不得随包、`farm-seasons`/`reef-pack` 只有 legacy `signature.txt` 无 `signature.json`（详见 F4）。
- MSI 未构建（runbook 标注 optional；NSIS 为必需目标，已生成）。

### 4.3 审计中发现并修复的脚本 bug（F2）

- **现象**：默认路径 `node scripts/release-win.mjs --all --strict`（不带 `SOURCE_DATE_EPOCH`）在可复现 zip 步骤硬失败：

```
[System.DateTimeOffset] 不包含名为“FromFileTimeUtc”的方法。
reproducible-zip.ps1 方法调用失败 ...
```

- **根因**：`scripts/reproducible-zip.ps1` 使用 `[System.DateTimeOffset]::FromFileTimeUtc(...)`；该静态方法属于 `DateTime` 而非 `DateTimeOffset`（Windows PowerShell 5.1 / .NET Framework 下不存在）。带 `SOURCE_DATE_EPOCH` 的路径不触发该行，故 runbook 推荐的可复现路径能过、默认路径必挂。
- **修复（1 行，不改业务逻辑）**：`[System.DateTimeOffset]::new($fileTime)`；用 `-SourceDateEpoch 0` 实测通过（entries=15）。修复文件：`scripts/reproducible-zip.ps1`（工作树 modified，**须随最终提交**，否则工作树不 clean、C1 证据不可生成）。

## 5. release-evidence 生成 / 校验

### 5.1 C0（内部，dirty 显式记录）— 已生成并 verify

```bash
node scripts/release-evidence.mjs --channel C0 \
  --out artifacts/evidence/2026-11-19-head08534a4-c0-release-win \
  --artifact artifacts/DesktopGames-0.1.0-portable.zip \
  --artifact artifacts/DesktopGames_0.1.0_x64-setup.exe \
  --artifact artifacts/SHA256SUMS.txt --artifact artifacts/RELEASE-MANIFEST.json
node scripts/release-evidence.mjs --verify artifacts/evidence/2026-11-19-head08534a4-c0-release-win
```

- 生成：4 files；`unsigned: true`；`signing.status="unsigned"`；commit `08534a4`；dirty 5 files 显式记录；channel C0。
- verify：**`verified 4 file(s) | DesktopGames 0.1.0 | C0 | unsigned=true | commit 08534a4 | tag none`**。
- `--self-test`：**ok**（generate + verify + tamper rejection + 通道门：C0 accepted / dirty C1 refused / unsigned C2 refused）。

### 5.2 C1（clean commit 才能生成）— fail-closed 已实测

在 dirty 工作树尝试：`node scripts/release-evidence.mjs --channel C1 ...` → **exit 1**：

```
[evidence] error: channel C1 evidence must be generated from a clean commit (working tree is dirty); use C0 for internal previews or commit first
```

（符合 fail-closed 设计；最终提交后生成真实 C1 并 verify，见 §9。）

## 6. docs/STATUS 真值核对

### 6.1 初始问题（F1）

- `docs/STATUS.md`（HEAD 内容）`- commit: b83b11e...`，而 `git rev-parse HEAD` = `08534a4`、`HEAD^` = `aae381f` ⇒ docs:check `status-commit` FAIL（见 §2.1/§3.1）。
- 修复：`npm run status` 重生成（generated-at 2026-11-19T16:28:25.521Z，commit `08534a4`，dirty 3）。修复件在工作树，待最终提交。

### 6.2 机器事实 vs STATUS（重生成时点）

| STATUS 字段 | 内容 | 机器复核 | 结论 |
| --- | --- | --- | --- |
| commit / branch | `08534a4` / master | `git rev-parse HEAD` / branch | 一致 |
| remote | `none — git remote -v is empty` | `git remote -v` 空 | 一致 |
| ci-run | `not-run — no git remote configured` | `docs/plan/ci-runs.json` = `[]`；Actions 从未运行 | 一致 |
| signing | `unsigned — no Authenticode certificate ... never claim "signed"` | exe/setup `Get-AuthenticodeSignature` = NotSigned；`release-sign --check-env` = no signing material | 一致 |
| dlc | `excluded from C1 — production trust root keys: 0; packs with production signature.json: 0/2` | trust root `keys: []`；`packs/` 2 个 legacy `signature.txt`、0 个 `signature.json` | 一致（口径歧义见 F4） |
| release-channel | `C1 — unsigned invite beta` | 本审计全流程按 C1 执行 | 一致 |
| legal-strict | `BLOCKED (16 blocker(s), 16 warning(s))`（最终值） | `node scripts/legal-check.mjs --strict` = BLOCKED 16/16（16 个 DRAFT 文本） | 一致（最终 regen 需记录 16；旧 STATUS 的 34 含陈旧 staging 假阻塞，见 F5） |
| version / product-identity | 0.1.0 / DesktopGames 0.1.0 com.perrylink.desktopgames（matches package.json: yes） | `version:check` 12 mirrors ok；`tauri.conf.json` 一致 | 一致 |
| test-suite | `unknown`（重生成时无匹配 summary） | HEAD git-archive 的 test step = 1335/1327/0 fail/8 skip（`artifacts/audit-release/ci-clean-head.inner.json`） | **建议最终 regen 用 `--tests-from` 记录**（否则保持 unknown，不得抄历史数字） |
| release-evidence | 指向旧 C0 bundle（7c5870a）/ 或本次新 C0 bundle | `artifacts/evidence/` 真实目录 | 重生成时点决定；**不得手改** |

### 6.3 drift check 实测（证明“真值会随机器事实变化”）

```bash
node scripts/gen-status.mjs --check
# drift line 12: working-tree dirty 7 vs 3
# drift line 20: legal-strict 16 vs 34
# drift line 24: release-evidence 新 C0 bundle vs 旧 bundle
# [status] error: docs/STATUS.md is stale; run `npm run status`
```

说明：`legal-strict` 从 34 → 16 的差异来自 gitignored 的 `artifacts/portable` 陈旧 staging：`legal-check` 在存在 staging 时会要求 staging 内 legal 包完整；release-win 重建 staging（38 legal files）后恢复真实计数 16。**最终 STATUS 必须在所有产物动作之后重生成**（lead 的最终提交计划即如此）。

## 7. 公开仓核对（只读；口径：HEAD SHA + 最近 CI conclusion）

方法：GitHub REST API（`/repos/{owner}/{repo}/commits/main`、`/actions/runs`）+ `git -c http.proxy= ls-remote https://github.com/...` 双核；未使用任何写操作/凭据打印。

| 公开仓 | `main` HEAD | HEAD commit 时间/标题 | 最近 CI run（该 HEAD） | conclusion | 证据 URL |
| --- | --- | --- | --- | --- | --- |
| `PerryLink/famling` | `a75f626a623082326139715e64f1b9c2820b9498` | 2026-11-19T16:23:37Z · “docs: shared content semantics authority” | `build-windows-pet-only` #44565622763（push, 16:23:52Z→16:30:03Z） | **success** | https://github.com/PerryLink/famling/actions/runs/44565622763 |
| `PerryLink/dsh-famling` | `a4e08d9d0cf47a25c3a60a1265dbda94f7c04c41` | 2026-11-19T16:23:12Z · “feat(semantics): 0.10.5 shared-content parity, ambient bubble policy and canonical declarations” | `test` #44565520156（push, 16:23:19Z→16:23:29Z） | **success** | https://github.com/PerryLink/dsh-famling/actions/runs/44565520156 |

- 双核一致：`git ls-remote` 返回相同 HEAD（famling `a75f626...`、dsh-famling `a4e08d9...`）。
- 历史：famling 上一提交 `17a0ae8` 的 run #44562648154 亦 success；dsh-famling 最近 4 次 run 全 success。
- **本仓 desktop-games** 无 remote ⇒ 无 GitHub Actions；本地门禁与 clean checkout 是唯一可复核证据（不声称“CI 全绿”）。

## 8. DLC / signed / remote-server 虚假宣称审计

### 8.1 扫描结果（无硬性虚假宣称）

- `node scripts/docs-check.mjs` **PASS 24/24**，含 `claims-corrected`（README/RUNBOOK/CHECKLIST 中已知不实 remote/CI/signed 声称均已订正）、`snapshot-pointers`（HANDOFF/STATUS-2026-11-* 指向 `docs/STATUS.md`）。
- `README.md` 首屏明确：*“本机 git remote 为空、GitHub Actions 从未运行、无 Authenticode 证书、DLC 生产信任根为空 ⇒ 不得宣称 signed / 可信发布 / CI 全绿 / 含 DLC”*；signed/DLC 相关命令在 RELEASE-CHECKLIST 中均为**未勾选框**或标注“目标状态/无证书时阻塞”。
- 历史快照 `docs/HANDOFF-2026-11-15.md`、`docs/STATUS-2026-11-15.md` 中的 “CI 全绿 run 43711355947” 均带 2026-11-19 订正头（“无法复核、按未兑现处理，当前真值以 docs/STATUS.md 为准”）。
- 未发现“已部署远程服务器/云端市场已上线”类宣称；扫描 `已上线|已部署|远程服务器|market server|remote server deployed` 无命中（除否定/设计语境）。
- 市场代码默认零请求：`src/pet/content-market.ts` 明确 `transport` 默认 null（无注入则无网络调用）、**无内置/默认 market endpoint**、无 `globalThis.fetch` fallback，静态 CI 测试强制（`tests/market-transport.test.ts`）；C1 不需要也不声称远程市场服务器。

### 8.2 待决口径（F4）：C1“无 DLC” vs unsigned 预览包内含 dev-signed packs

- C1 政策（`docs/plan/E0-TRUTH-CI-EVIDENCE-2026-11-19.md` §2）写“**无 DLC**、市场默认零请求”；`release-evidence` 对 C0/C1 写 `dlcTrust.status="not-included"`、note “C0/C1 evidence never includes DLC”。
- **实测**：unsigned 便携 zip（63 entries）含 `packs/farm-seasons/`、`packs/reef-pack/`（均 legacy `signature.txt`，无 `signature.json`）与 **`packs/keys/dev-public.pem`**；`release-win` 的 DLC trust gate 实测 **FAIL**（4 条：无 ACTIVE production key、dev-public.pem 不得随包、2 pack 无 keyId envelope），因未加 `--require-dlc-trust` 仅记录 advisory。
- 已披露部分：便携包内 `README.txt` 写明 *“Preview: packs/ may contain dev-signed DLC content. It is NOT production-signed content; do not represent it as such.”*；`RELEASE-MANIFEST.json` 记录 `dlcTrust.status="fail"`。
- **结论**：不存在“声称 signed/生产 DLC”的虚假宣称；但“C1 无 DLC”的表述与“包内含 dev-signed packs + dev 公钥”存在口径冲突。建议二选一（需 owner 决定）：① C1 打包排除 `packs/keys` 与 legacy packs（或加 `--require-dlc-trust` 让无生产密钥时发布失败）；② 把 C1 定义改写为“无 production-signed DLC；仅含显式标注的 dev-signed preview packs”，并让 evidence manifest 的 dlcTrust note 与之一致。本审计不擅自改业务/发布策略。

## 9. 最终只读复核（lead 最终提交后执行；结果在会话报告，不回写本文件）

最终提交（N1 = 文档+F2 修复，N2 = STATUS 重生成）之后，只读复核清单：

| # | 项 | 期望 |
| --- | --- | --- |
| 9.1 | `git rev-parse HEAD` / `git status --porcelain` | 记录 N2 SHA；工作树 clean（`artifacts/` 为 gitignored） |
| 9.2 | `node scripts/docs-check.mjs` | PASS 24/24；`status-commit` 接受 `N2^`（= N1） |
| 9.3 | `npm run ci:clean`（默认 git-archive N2） | 13/13 绿；test 计数从 inner summary 读出 |
| 9.4 | `node scripts/gen-status.mjs --check` | up to date（或列出真实 drift 并说明） |
| 9.5 | `node scripts/release-evidence.mjs --channel C1 --artifacts-dir ... --out artifacts/evidence/<run>` + `--verify` | 生成成功、`unsigned=true`、commit=N2、dirty=false；verify ok |
| 9.6 | `Get-AuthenticodeSignature`（exe / setup） | NotSigned（如实记录；C1 unsigned） |
| 9.7 | 公开仓 HEAD/CI（只读 API + ls-remote） | 与 §7 一致或记录变化 |
| 9.8 | 虚假宣称扫描 | 无新增 signed/DLC/remote-server/CI 全绿 未兑现宣称 |

### 9.0 关于 `--tests-from` 的坑（lead 最终 STATUS 命令前请读）

lead 计划命令：`DG_GIT_COMMIT=$(git rev-parse HEAD) node scripts/gen-status.mjs --tests-from artifacts/audit-release/ci-clean-head.inner.json`。

- 该 inner summary 的 `commit` 是 `08534a4`。若最终提交后 HEAD 已变成 N1/N2，`gen-status` 将输出 **`test-suite: stale — recorded 08534a4 != HEAD ...`**，而不是记录 1335 个测试（它要求 summary commit == 当前 commit）。
- 若要记录真实测试数：在最终 HEAD 上重跑一次 `node scripts/ci-clean-checkout.mjs --summary-out artifacts/audit-release/ci-clean-final.json`，用新生成的 `ci-clean-final.inner.json` 作为 `--tests-from`；然后在同一 HEAD 上生成 STATUS 并提交。
- 若不做上述重跑：建议**省略** `--tests-from`，STATUS 保持 `test-suite: unknown`（诚实、不得伪造）；docs-check 不会因此失败（只检查是否存在 `N fail`）。

### 9.1 C1 evidence 的生成顺序（提交后）

1. N2 提交后确认工作树 clean；
2. Windows 按 N2 重建：`npm run build` → `scripts\build-tauri-win.bat` → `scripts\bundle-tauri-nsis-win.bat` → `set SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) && node scripts\release-win.mjs --all --strict`（`--all` 会重建 `artifacts/portable` staging 的 legal 包）；
3. `node scripts/release-evidence.mjs --channel C1 --artifact artifacts/DesktopGames-0.1.0-portable.zip --artifact artifacts/DesktopGames_0.1.0_x64-setup.exe --artifact artifacts/SHA256SUMS.txt --artifact artifacts/RELEASE-MANIFEST.json --out artifacts/evidence/<run>`；
4. `node scripts/release-evidence.mjs --verify artifacts/evidence/<run>`；
5. 注意：`--verify` 会检查 HEAD 仍等于 bundle 记录 commit；若之后又有提交，需 `--allow-head-moved` 才能复核历史 bundle。
## 10. 仍缺的外部条件（不得伪造；C1 发布门逐项核对）

| # | 条件 | 现状证据 | 解除条件 |
| --- | --- | --- | --- |
| E1 | **最终提交**（F1 STATUS 重生成 + F2 脚本修复，且其他 agent 文档落盘） | 工作树含未提交修复；HEAD 自身 docs:check 红 | lead/集成方提交；提交后重跑 §3.1 `ci:clean` 与 §9 C1 evidence |
| E2 | **律师/owner 法务签字**（C1 明文要求） | `legal-check --strict` = **BLOCKED (16 blocker / 16 warning)**，16 份 DRAFT 法律文本；`docs/legal/APPROVALS.md` 空白 | owner/律师逐条签字或修改文本清零；C1 前必须 |
| E3 | **Authenticode 证书**（C2/C3；C1 不需要） | 无证书材料（`release-sign --check-env`: no signing available）；exe/setup 实测 **NotSigned** | 采购 OV/EV 证书 + `release-signing` secrets + 首次签名报告（`{status:"Valid"}`，timestamped + pin） |
| E4 | **DLC 生产密钥 ceremony**（DLC 进发布才需要；C1 排除） | `native/dlc-verify/trust/production-trust-root.json` `keys: []`；`verify-dlc-trust` FAIL；2 pack 仍 legacy `signature.txt`；dev 公钥随预览包（F4） | 离线生成生产私钥（两人保管）+ 注入公钥 + 重签 pack + trust gate 绿；同时解决 F4 口径 |
| E5 | **remote + 首次真实 CI run**（desktop-games） | `git remote -v` 空；`docs/plan/ci-runs.json` `[]`；Actions 从未运行 | owner/用户授权建 private remote → workflow_dispatch 首跑 → 归档 run URL + branch protection；本地门禁已等价可跑 |
| E6 | **远程市场服务器**（C1 明确默认零请求，不需要） | 无内置 endpoint、transport 默认 null、无全局 fetch（代码+测试） | 若未来启用：明确 endpoint/签名目录/防回滚/隐私条款后再宣称 |
| E7 | **24h 原生 soak / 真机安装冒烟** | `artifacts/tauri-soak-24h.json` 不存在（runbook §7 未验证项）；本审计未执行 24h 挂机 | Windows 原生挂机 24h + 安装/卸载冒烟并归档 |
| E8 | **C2 额外**：tag 指向 HEAD、SHA256SUMS 外层签名、updater/吊销策略 | 无 tag/signing report；updater §8.2 未实现 | 证书+tag+外层签名+updater 方案完成后 |

## 11. 复现命令与证据索引

```bash
# Linux（WSL2）
cd /mnt/d/Projects/dsh/desktop-games
npm ci                                        # Linux 依赖（环境态；不影响 HEAD 逻辑）
npm run status                                # 重生成 docs/STATUS.md（修复 F1）
npm run ci -- --summary-out artifacts/audit-release/ci-worktree-fixed.json        # ① 13/13
node scripts/ci-clean-checkout.mjs --summary-out artifacts/audit-release/ci-clean-head.json       # ② HEAD（提交后应为 13/13）
node scripts/ci-clean-checkout.mjs --worktree --summary-out artifacts/audit-release/ci-clean-worktree.json
node scripts/docs-check.mjs                   # 24/24
node scripts/gen-status.mjs --check           # 漂移检查（最终提交后应 up to date）
node scripts/release-evidence.mjs --self-test

# Windows 原生（PowerShell / cmd）
taskkill.exe /IM desktop-games-tauri.exe /T /F
npm ci && npm run build
cmd.exe /c scripts\build-tauri-win.bat
cmd.exe /c scripts\bundle-tauri-nsis-win.bat
set SOURCE_DATE_EPOCH=<commit epoch> && node scripts\release-win.mjs --all --strict
node scripts\release-win.mjs --verify
node scripts\release-evidence.mjs --channel C1 --artifacts-dir <release-artifacts> --out artifacts/evidence/<run>
node scripts\release-evidence.mjs --verify artifacts/evidence/<run>
```

| 证据 | 路径（gitignored：`artifacts/`） |
| --- | --- |
| ① 工作树全门 | `artifacts/audit-release/ci-worktree-fixed.json` / `.log` |
| ② HEAD-archive 干净 checkout（红-仅 docs） | `artifacts/audit-release/ci-clean-head.json` / `.inner.json` / `.log` |
| ② worktree-export 干净 checkout（绿） | `artifacts/audit-release/ci-clean-worktree.json` / `.inner.json` / `.log` |
| ③ Windows cargo test | `artifacts/audit-release/cargo-test-win.log` |
| ④ Tauri release build / NSIS / packaging | `artifacts/audit-release/tauri-release-build.log`、`tauri-nsis-build.log`、`release-win.log` |
| ④ 发布产物 | `artifacts/DesktopGames-0.1.0-portable.zip`、`artifacts/DesktopGames_0.1.0_x64-setup.exe`、`artifacts/SHA256SUMS.txt`、`artifacts/RELEASE-MANIFEST.json` |
| ⑤ C0 证据 bundle | `artifacts/evidence/2026-11-19-head08534a4-c0-release-win/` |
| ⑤ C1 证据 bundle | 最终提交后生成（路径/哈希在会话报告与下一次 STATUS regen 后可见） |

## 12. 边界与不做

- 未改 `src/`、插件、Rust、发布策略/法务文本；未创建 remote、未 commit / push、未生成 tag、未伪造 signed/DLC/CI 状态。
- 修复仅两类：① `docs/STATUS.md` 由 `npm run status` 重生成（生成文件，非手改）；② `scripts/reproducible-zip.ps1` 1 行 PowerShell API 名称修正（打包脚本 bug，非业务逻辑）。
- 工作树中其他 agent 的文档改动（PIXEL-PIPELINE / COMPETITORS / CALIBRATION-SET / EXECUTION-STATUS / MASTER-BACKLOG）由 lead 统一提交，本审计未修改。


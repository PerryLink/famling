# MB-094 供应链方案与落地记录（CI）— 2026-11-20

> **Status: 落地（配置 + 门禁 + 文档），残余项见 §8。** 关联 task-93 / MB-094。
> 基线 HEAD `6404d43`。**本轮不执行身份迁移**（C1 仍是 DesktopGames，见
> `docs/plan/ADR-IDENTITY-MIGRATION-2026-11-20.md`）；本文件只覆盖 CI 供应链。
> 所有外部事实均在 2026-11-20 通过 GitHub API / OSV API / 本机命令实测，未伪造 CI run
>（本仓无 remote，Actions 从未运行，`docs/plan/ci-runs.json` 仍为 `[]`）。

## 1. 落地内容总览

| 项 | 落地 | 证据 |
| --- | --- | --- |
| Actions SHA pin | 4 个 workflow 的全部外部 action 固定到 40 位 commit SHA，并带版本注释 | §2；`tests/e9-supply-chain-update.test.ts` |
| 浮动 Rust 工具链 | `dtolnay/rust-toolchain@stable` 移除，改为 `rustup toolchain install 1.99.1`（与 release workflow 同一 RUST_VERSION） | `.github/workflows/ci.yml` |
| OSV 漏洞扫描 | 新增 `osv-scan.yml`（weekly + push + PR），reusable workflow 按 SHA pin；`fail-on-vuln: true`；基线例外带到期日/理由 | §3；`.github/workflows/osv-scanner.toml` |
| clippy | `native/dlc-verify` **硬门** `-D warnings`（本机实测绿）；Tauri host clippy 在 Windows 实验 job 内 advisory（Linux 无法构建 Tauri 系统依赖，基线未测） | §4 |
| fmt | **增量硬门**（仅本次改动的 `.rs` 文件必须 rustfmt 干净）+ 全树 advisory 基线审计（不自动 `cargo fmt`） | §4；本机基线 85 hunks / 7 文件 |
| 门禁测试 | 新增 `tests/e9-supply-chain-update.test.ts`：pin 形态、pin 表、OSV 配置、clippy/fmt job、ADR 断言 | 测试文件 |
| npm prepack | **未做**：`plugins/dsh-famling/package.json` 在仓外且不在本轮授权写范围 | §8.1 |

## 2. Actions pin 表（tag → commit SHA，2026-11-20 解析）

| Action | 使用的发布版本 | commit SHA（pin） | 解析方式/备注 |
| --- | --- | --- | --- |
| `actions/checkout` | `v4.4.0` | `11d5960a326750d5838078e36cf38b85af677262` | `GET /repos/actions/checkout/git/ref/tags/v4`（lightweight tag → commit；该 commit 同时被 `v4.4.0` 引用） |
| `actions/setup-node` | `v4.4.0` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | 同上；`tags` 列表确认 `v4.4.0` 指向同一 commit |
| `actions/setup-python` | `v5.6.0` | `a26af69be951a213d495a4c3e4e4022e16d87065` | 同上；`v5.6.0` |
| `actions/upload-artifact` | `v4.6.2` | `ea165f8d65b6e75b540449e92b4886f43607fa02` | 同上；`v4.6.2` |
| `Swatinem/rust-cache` | `v2.9.3` | `d1527c8f67ef9af357290475d4af4b0fab8f12e0` | 经 annotated tag 对象 `e9d7b9f1e587218970671bac74e5511ed9506e6a` deref 到 commit；tag PGP 验签 `verified: true` |
| `google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml` | `v2.7.1` | `32d3cd482bdadfb38b186c0ad1b031902d55d932` | 经 annotated tag 对象 `6bc832ee85d316ab9aeccf71929026841bd0e1ee` deref；tag 为 SSH 签名且 `unknown_key`（无我们信任的 pubkey），因此**只以 SHA 为信任锚**，不宣称 tag 验签通过 |

已移除的浮动引用：`actions/*@v4`、`actions/setup-python@v5`、`actions/upload-artifact@v4`、
`Swatinem/rust-cache@v2`、`dtolnay/rust-toolchain@stable`。保留的本地引用只有
`./.github/workflows/_windows-build.yml`（同仓文件，不需要 SHA）。

### 2.1 更新流程（无 remote/无 Dependabot，手工执行）

1. 需要升级时，解析目标 tag → commit（两法互证）：
   ```bash
   git -c http.proxy= ls-remote https://github.com/<owner>/<repo> \
     "refs/tags/<tag>" "refs/tags/<tag>^{}"   # 有 ^{} 行 = annotated tag，取其 commit
   ```
   或 GitHub API：`GET /repos/<owner>/<repo>/git/ref/tags/<tag>`；若是 annotated tag
   （`object.type == "tag"`），再取 `/git/tags/<sha>` deref 到 commit。本表 6 个 pin 已用
   `git ls-remote` 于 2026-11-20 逐个复核。
2. 校验 tag 签名可信性（能拿到维护者公钥时）；**拿不到就只记录“以 SHA 为信任锚”**，不要写“已验签”。
3. 一次性替换所有 workflow 中的所有该 action 引用；保留 `# vX.Y.Z` 注释。
4. 跑 `python3` YAML 解析（本文件 §7 命令）+ `npm test`（含供应链测试）。
5. 更新本表（版本 + SHA + 解析日期 + 备注）与 `osv-scanner.toml`（若版本变化影响基线）。
6. 记录到 `docs/plan/ci-runs.json` 的时机 = 真实 CI 跑过之后（现在没有 remote，不能写假 run）。

### 2.2 为什么 pin SHA 而不是 tag

tag 可被 force-move、可被账户/供应链攻击改写；SHA 不可变。代价：不会自动获得安全更新，
必须按 §2.1 手工轮换。频率建议：每季度一次 + 收到 action 安全公告时立即。

## 3. OSV 漏洞扫描

### 3.1 workflow

- 文件：`.github/workflows/osv-scan.yml`；触发：push `master/main`、PR、weekly（周一 03:17 UTC）、
  `workflow_dispatch`。
- 复用 `google/osv-scanner-action` 官方 reusable workflow（按 §2 pin），显式扫描三个 lockfile：
  `package-lock.json`、`app/tauri/src-tauri/Cargo.lock`、`native/dlc-verify/Cargo.lock`；
  `fail-on-vuln: true`（新漏洞 → 红）；`upload-sarif: false`（不请求 security-events 写权限）。
- 例外策略：`.github/workflows/osv-scanner.toml` 的 `[[IgnoredVulns]]`，**每条必须有** `id`、
  `effectiveUntil` 绝对日期、`reason`。到期后自动失效 → 扫描回到 fail-closed。

### 3.2 基线（2026-11-20 实测，方法见 §3.4）

唯一受影响包 6 个 / advisory ID 7 个（含 alias）；**npm 依赖 0 漏洞**。

| 包 | 版本 | 生态 | Advisory | 摘要 | C1 处置 |
| --- | --- | --- | --- | --- | --- |
| chrono | 0.4.45 | crates.io | RUSTSEC-2026-0543 | unmaintained（无 fix） | 例外：经 tauri-utils→serde_with 传递；无已知可利用 CVE；随 Tauri 升级复核 |
| glib | 0.18.5 | crates.io | RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g（alias） | `VariantStrIter` unsoundness；fix=0.20.0 | 例外：Linux GTK/WebKit 链，**不进入 Windows C1 产物**；随 Linux GTK 栈升级（需 Tauri 栈升级） |
| proc-macro-error | 1.0.4 | crates.io | RUSTSEC-2024-0370 | unmaintained | 例外：Linux-only build macro 链（glib-macros/gtk3-macros） |
| zbus_names | 4.3.5 | crates.io | RUSTSEC-2026-0371 | unmaintained | 例外：Linux-only D-Bus 链（tauri-plugin-single-instance） |
| zvariant | 5.15.1 | crates.io | RUSTSEC-2026-0370 | unmaintained | 同上 |
| zvariant_derive | 5.15.1 | crates.io | RUSTSEC-2026-0372 | unmaintained | 同上 |

> 依赖链实测（`Cargo.lock` 反向依赖）：`glib <- gtk/webkit2gtk/...`（Linux）、
> `zvariant/zbus_names <- zbus <- tauri-plugin-single-instance`（Linux）、
> `proc-macro-error <- glib-macros/gtk3-macros`（Linux）、`chrono <- serde_with <- tauri-utils`（跨平台，
> unmaintained 类，非可利用漏洞）。Windows C1 产物只含 Windows target 编译结果，不含 Linux GTK/D-Bus 栈。

### 3.3 例外审查规则

1. `effectiveUntil` 一律 `2027-02-28`（本轮统一）；到期前必须复审：修掉 → 删条目；仍不可修 → 续期并
   说明为什么（并升级为 owner 可见风险）。
2. 每次 Tauri 大版本升级、Linux 打包线立项、或引入 Windows updater 时**强制**重跑本条复审。
3. 新增例外必须进 §3.2 表 + 配置文件 + 测试基线三处，缺一即测试失败。
4. 例外只针对“C1 Windows 产物不包含/不可利用”或“无 fix 的 unmaintained”，**不得**用来忽略可利用漏洞。

### 3.4 基线测量方法（可复现）

- 官方 CLI 二进制下载在本机网络下**未完成**（8.7 MB 后停滞，已放弃；不伪造 scanner 运行结果）。
- 实际采用：解析三个 lockfile → 调 `POST https://api.osv.dev/v1/querybatch`（npm / crates.io，每批 ≤500，
  去重后 623 个包）→ 输出受影响集合；再用 `GET /v1/vulns/<id>` 取摘要/修复版本/别名。
- CI 内的真正门禁是 §3.1 的 pinned reusable workflow；本地无法替代其 osv.dev 数据与 Docker 镜像。
- 残余供应链风险：reusable workflow 内部再把 scanner 作为 Docker image `ghcr.io/google/osv-scanner-action:v2.7.1`
  拉取（**tag 而非 digest**）——这是上游设计，本文档如实记录；如要消除，需自建镜像 digest pin（另立任务）。

## 4. clippy / fmt 方案

### 4.1 clippy

| 目标 | 门禁级别 | 本机实测 |
| --- | --- | --- |
| `native/dlc-verify`（纯 Rust，无系统依赖） | **硬门**：`cargo clippy --all-targets -- -D warnings`（ci `rust-dlc` job） | ✅ 2026-11-20 本机 `Finished dev profile ... in 2.03s`，exit 0（Rust 1.99.1） |
| `app/tauri/src-tauri`（Tauri/WebView2/GTK） | **advisory**：放在既有 `rust-tauri-tests`（Windows 实验 job，job 级 `continue-on-error`）；step 级也 `continue-on-error` 以免 clippy 失败吞掉 `cargo test` | ⚠️ 无法在本机 Linux 测（缺 `pkg-config`/`libdbus-1-dev` 等 Tauri 系统依赖，build script 失败）；首次 Windows 跑绿后再评估提升为硬门 |

### 4.2 fmt（不污染未授权文件）

- **不做**全仓 `cargo fmt`（Rust 源不在本轮写范围，且他人并发改 `main.rs` 风险高）。
- **硬门**：`rust-fmt` job 只检查“本次变更新增/修改的 `.rs` 文件”——
  `git diff --name-only --diff-filter=ACM <base> HEAD -- '*.rs'` → `rustfmt --edition 2021 --check <files>`。
  base 取值：PR 用 `github.event.pull_request.base.sha`，push 用 `github.event.before`，否则 `HEAD^`；
  单 commit 无 base 时显式 `::notice::` 跳过（不假装通过）。
- **advisory 基线**：同一 job 跑全树 `cargo fmt --check`，`continue-on-error: true`，只保持漂移可见。
- 本机实测基线（Rust 1.99.1 + rustfmt 同版本）：

| crate | 有 rustfmt diff 的文件数 | diff hunks |
| --- | --- | --- |
| `native/dlc-verify` | 1（`src/lib.rs`） | 14 |
| `app/tauri/src-tauri` | 6（`build.rs`、`src/main.rs`、`desktop_guard.rs`、`market.rs`、`secret.rs`、`voice.rs`） | 71 |
| 合计 | 7 / 8 个 `.rs` 文件 | 85 |

- 后续项（**未在本轮做，因为源文件不在授权写范围**）：一次性 `cargo fmt` 格式化提交 → 全树 fmt 升为硬门，
  同时删除 advisory step。建议作为 MB-094 follow-up 或 MB-107 子任务。

## 5. 门禁测试（`tests/e9-supply-chain-update.test.ts`）

静态断言（不联网、不需要真实 CI）：

1. 所有 workflow 的 `uses:` 要么是 `./` 本地引用，要么 `owner/repo(...)@<40 hex>`；出现 tag/branch 引用即失败。
2. §2 pin 表中的每个 SHA 必须出现在对应 workflow 中，且 workflow 中不得出现已被替换的浮动引用。
3. `osv-scan.yml` 的 reusable workflow 是 SHA pin、`fail-on-vuln: true`、显式三个 lockfile + `--config`；
   `osv-scanner.toml` 的例外集合与 §3.2 基线一致，每条有 `effectiveUntil` + `reason`。
4. `ci.yml` 的 `rust-dlc` 硬门含 `cargo clippy ... -D warnings`；`rust-fmt` 有增量硬门 + `continue-on-error` 的
   全树 advisory；`rust-tauri-tests` 的 clippy 为 advisory（step 级 `continue-on-error`）。
5. 三份 E9 文档存在且含“本轮未执行/未启用”声明（identity / updater / reproducible）。

## 6. 残余浮动（如实记录，不假装全钉死）

| 项 | 状态 | 影响 |
| --- | --- | --- |
| `actions/setup-python` 的 Python | `3.12`（minor pin，补丁由 setup-python manifest 解析） | 补丁级漂移；如需完全固定可改为精确 x.y.z（需确认 runner 可用版本） |
| runner 镜像 | `ubuntu-latest` / `windows-latest` | 镜像与系统工具链会漂移；`repro-check` 已 WARN |
| npm registry | `package-lock.json` 112/112 解析到 `registry.npmmirror.com` | 内容有 integrity sha512 保护；镜像可用性/URL 稳定性是复现风险（`repro-check` WARN） |
| Cargo registry | 本机 `rsproxy.cn` 镜像（CI runner 默认 crates.io） | CI 与开发机 registry 不同；Cargo.lock 有 checksum |
| OSV Docker image | 上游 reusable workflow 内 `ghcr.io/...:v2.7.1`（tag） | 上游设计；见 §3.4 |
| 第三方 action 内部依赖 | 固定 SHA 的 action 自身可能再调用 tag 引用（上游问题） | 只能通过 SHA + 上游审计降低 |

## 7. 本地验证记录（2026-11-20，WSL Linux，Node v24.22.1，Rust 1.99.1）

| 命令 | 结果 |
| --- | --- |
| `python3 - <<EOF (yaml.safe_load 全部 .github/workflows/*.yml)` | 4 个文件 OK（含新 `osv-scan.yml`） |
| `python3 -c tomllib.load(.github/workflows/osv-scanner.toml)` | 7 条 `IgnoredVulns` 解析 OK |
| `cargo clippy --manifest-path native/dlc-verify/Cargo.toml --all-targets -- -D warnings` | exit 0（Finished in 2.03s） |
| `cargo fmt --manifest-path native/dlc-verify/Cargo.toml --check` | 14 hunks/1 文件（基线，advisory） |
| `cargo fmt --manifest-path app/tauri/src-tauri/Cargo.toml --check` | 71 hunks/6 文件（基线，advisory） |
| OSV baseline（API 方式，§3.4） | 623 个唯一包；7 advisory/6 包；npm=0 |
| `npm pack --dry-run` in `plugins/dsh-famling` | 18 files / 574,629 B；无 `prepack`/`repository`（见 §8.1） |
| `npm test`（含新增供应链测试） | **1416 tests / 1416 pass / 0 fail / 0 skipped**（29.6s） |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0（25.9s） |
| `npm run ci -- --summary-out /tmp/ci-summary.json` | **13/13 green，101.4s**（docs:check 25 checks PASS） |

## 8. 未完成 / 后续

### 8.1 npm prepack（MB-094 子项，未做）

- 事实：`<private-path> 0.10.5）没有 `prepack`/`repository`；
  `npm pack --dry-run` 正常（18 文件）。根 `package.json` 是 `private: true`，**不存在误发 npm 风险**。
- 未做原因：插件仓不在 task-93 授权写范围（仓外路径）；且“repository/prepack 该填什么”涉及 dsh-famling
  发布策略，需与插件维护线确认。
- 建议：单列 follow-up（插件仓任务）补齐 `repository`（若准备公开分发）与 `prepack`
  （`npm run check && npm test`），并把 `npm pack --dry-run` 纳入插件 CI；不在本轮伪造完成。

### 8.2 其他后续
- 首次真实 CI（需 remote + owner 授权）后才能把 `docs/plan/ci-runs.json` 填上并宣称“CI 绿”；
  在此之前“workflow 定义正确”≠“CI 已跑”。
- fmt 全树格式化提交（§4.2）→ 硬门升级。
- Tauri host clippy Windows 首次绿后，移除 step 级 `continue-on-error` 并评估脱离实验 job。
- OSV Docker image digest pin / 自建扫描镜像（如需更强供应链）。

## 9. 参考

- `docs/plan/MASTER-BACKLOG-2026-11-19.md` §E9（MB-094）
- `docs/plan/EXECUTION-STATUS-2026-11-20.md` §E9
- `.github/workflows/ci.yml`、`_windows-build.yml`、`release.yml`、`osv-scan.yml`、`osv-scanner.toml`
- `tests/e9-supply-chain-update.test.ts`
- OSV-Scanner 配置文档：<https://google.github.io/osv-scanner/configuration/>
- OSV API：<https://api.osv.dev/v1/querybatch> / `/v1/vulns/<id>`（外部数据，2026-11-20 查询）

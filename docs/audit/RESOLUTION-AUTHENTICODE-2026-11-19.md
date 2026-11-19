# RESOLUTION — Authenticode 发布签名流水线（审计 P2-7）

- 日期：2026-11-19
- 任务：task-46（Windows Authenticode / 发布签名流水线）
- 范围：`.github/workflows`、`scripts`、发布文档；**不动私钥、不改业务代码**
- 审计来源：`docs/audit/FAMLING-SECURITY-AUDIT-2026-11-18.md` §P2-7 / §8.6 / §10（条目 6、P2-7 验收）
- 结论：**工程侧已落地（可执行、可验证、失败即阻断）；P2-7 的最终关闭被"没有 Authenticode 证书"这一外部条件阻塞。** 在证书到位前，产物仍实测 `NotSigned`（这是审计已记录的事实，不是本次引入的回归）。

---

## 1. 审计条目 → 处置

审计 P2-7 列出三件事：

| 审计发现 | 本次处置 | 状态 |
|---|---|---|
| EXE/NSIS 无 Authenticode 签名（实测 NotSigned） | 建成条件签名流水线：证书 secret → CI 注入 → 签 exe → 打 NSIS → 签 installer → 验证 → 报告进 manifest。无证书时 **tag 构建硬阻断**，只允许显式 unsigned preview。 | 工程完成；**证书阻塞** |
| 签名密钥保管（updater key 与密码同目录、权限 777 等） | 新增签名密钥托管策略：不落仓、不打印、只在 `RUNNER_TEMP` 短暂存在、always 清理、environment 审批、pin thumbprint、轮换/吊销/事故流程；与 DLC/updater 密钥分离。 | 完成（文档+代码约束+测试） |
| SHA256SUMS 无发布者签名、无可复现发布记录 | Authenticode 覆盖 PE 发布者身份；SHA256SUMS + `signing-report.json` + `RELEASE-MANIFEST.json` 记录完整性证据；确定性 zip + SOURCE_DATE_EPOCH + `repro-check` 落地。SHA256SUMS 的 minisign/cosign 外层签名列为剩余项。 | 完成主要部分；B6 剩余 |

审计 P2-7 的验证方法"`Get-AuthenticodeSignature` 应返回 Valid；`signtool verify /pa`"已实现为 CI 中的强制步骤（证书到位后即可满足）。

**P0/P1**：本次不涉及；没有引入新的 P0/P1。P2 内部：P2-7 从"engineering gap"变为"external blocker"。

---

## 2. 复核事实（2026-11-19，本机）

```text
PS> Get-AuthenticodeSignature D:\Projects\dsh\desktop-games\app\tauri\src-tauri\target\release\desktop-games-tauri.exe
NotSigned
PS> Get-AuthenticodeSignature D:\Projects\dsh\desktop-games\artifacts\DesktopGames_0.1.0_x64-setup.exe
NotSigned
PS> Get-AuthenticodeSignature C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
Valid (TimeStamperCertificate present)
```

- 前两项与审计 §8.6 一致：**证书缺失**。第三项用于证明"验证器正例"在真实签名二进制上工作（未使用任何私钥）。
- 旧 release.yml 顶部自述 "unsigned"、`release-win.mjs` 写死 `unsigned: true`、`Compress-Archive` 非确定性时间戳——均已替换/改造。
- 未读取、未复制、未打印任何私钥/口令文件。

---

## 3. 设计

### 3.1 信任链

```text
CI secret (PFX base64) + password
        │  (仅 runner temp 解码；never logged)
        ▼
signtool sign  ── RFC3161 timestamp (DigiCert by default, override env)
        │
        ├─ desktop-games-tauri.exe        ← 先签，再打 NSIS（安装后的 exe 也带签名）
        └─ DesktopGames_<v>_x64-setup.exe ← 后签 installer
        ▼
release-sign.mjs --verify
  ├─ signtool verify /pa /all /tw /v      （链信任 + policy）
  ├─ Get-AuthenticodeSignature (PS)       （Status=Valid / TimeStamperCertificate / signer）
  ├─ pinned thumbprint 比对
  └─ sha256 与签名后文件一致
        ▼
artifacts/signing-report.json  ──►  RELEASE-MANIFEST.json (unsigned:false, signing:…)
        ▼
release-win.mjs --signed --signing-report …  （没有可校验 report 就不允许宣布 signed）
```

### 3.2 闸门（fail-closed）

`release.yml` → `preflight`（ubuntu）用 `release-sign.mjs --check-env --require-pin` 与 `--policy` 决策：

| 触发 | 有材料 | 无材料 |
|---|---|---|
| tag push | signed | **block（job 红）** |
| workflow_dispatch | signed | block（除非 `allow_unsigned_preview=true` → labelled preview） |
| 本地 | signed | unsigned preview |

`_windows-build.yml` 的 build job 绑定 `environment: release-signing`；签名前必须经过 environment reviewers。signed 路径带 `--require-dlc-trust`（见 §5），unsigned preview 必须显式 `--skip-dlc-trust` 且被记录为 preview-only。

### 3.3 可复现

- `SOURCE_DATE_EPOCH=git log -1 --format=%ct` → BUILD-INFO/RELEASE-MANIFEST 时间字段确定。
- `reproducible-zip.ps1`：排序 + 固定 zip 条目时间 + 无目录条目，替代 `Compress-Archive`。
- `repro-check.mjs --check-inputs`（lockfile/npm ci/Node/Rust/Tauri CLI/SOURCE_DATE_EPOCH/tag/clean 检查，CI 每次 release 跑）。
- `repro-check.mjs --compare` 对比两次构建（逐文件 SHA-256）。
- 边界：PE 层 bit-for-bit 需链接器确定性（/Brepro），跨 Tauri 构建配置，未在本任务验证（B4）。

---

## 4. 变更清单

### 新增

| 文件 | 作用 |
|---|---|
| `scripts/lib/release-signing.mjs` | 纯逻辑：材料探测（含仓库内 PFX 拒绝）、策略矩阵、signtool 参数、report 校验、SOURCE_DATE_EPOCH |
| `scripts/release-sign.mjs` | CLI：`--plan/--check-env/--policy/--sign/--verify/--check-report`；密码只进 signtool 参数、日志 redact |
| `scripts/authenticode-report.ps1` | Get-AuthenticodeSignature → JSON（status/signer/thumbprint/timestamp/sha256） |
| `scripts/repro-check.mjs` | 可复现输入检查 + 两树对比 |
| `scripts/reproducible-zip.ps1` | 确定性 zip |
| `.github/workflows/_windows-build.yml` | 可复用 Windows 构建：pinned toolchain、SOURCE_DATE_EPOCH、条件签名、guard、verify、always 清理证书、artifact 上传 |
| `tests/release-sign.test.ts` | 19 项契约测试（见 §6） |
| `docs/RELEASE-SIGNING.md` | 签名/密钥托管/验证/可复现/清单权威文档 |
| 本文件 | 审计 resolution 记录 |

### 修改

| 文件 | 变更 |
|---|---|
| `.github/workflows/release.yml` | 重写：preflight 签名策略闸门；signed / unsigned-preview 两个条件 job；保留 read-only 权限；不再无条件构建 unsigned tag 产物 |
| `.github/workflows/ci.yml` | linux/windows job 增加 signing/repro tooling 冒烟步骤 |
| `scripts/release-win.mjs` | ① `--signed --signing-report`：校验并记录 Authenticode 证据，否则 `unsigned:true`；② 确定性 zip + SOURCE_DATE_EPOCH 元数据；③ DLC trust gate 接入（见下）；④ staging 排除 packs/keys 与签名物料（signed/release 路径）；⑤ manifest 增加 signing/reproducible/dlcTrust 字段 |
| `docs/RELEASE-RUNBOOK.md` | §0/§2.3/§4/§5.2/§7/§8/§10 更新为已实现的签名流程 |
| `docs/RELEASE-CHECKLIST.md` | 增加 Authenticode 发布清单 |

### `release-win.mjs` 最终结构（给 lead 的接口说明）

```text
CLI: [--plan] [--portable] [--sha256] [--all] [--verify] [--json] [--out]
     [--signed --signing-report <file>] [--require-dlc-trust | --skip-dlc-trust]
main:
  parse → 版本/干净检查 → signingInfo = loadSigningInfo(--signed 时；校验 report)
  → options{version,out,log,signing,requireDlcTrust,skipDlcTrust}
  → buildPortable(options):  stage → DLC gate(staged packs, staged exe) → BUILD-INFO
                              → reproducible-zip.ps1 → zip
  → writeChecksums(options):  DLC gate（若未跑过）→ SHA256SUMS → RELEASE-MANIFEST
                              （unsigned/signing/reproducible/sourceDateEpoch/dlcTrust）
  → verifyChecksums() / printPlan(options)
helpers:
  findDlcTrustGate(), runDlcTrustGate({packsDir,exePath,require,skip}),
  runDlcTrustGateOnce(), reproducibleBuildMeta(), loadSigningInfo(),
  copyTree(filter), packTrustMaterialFilter（keys/ 与 *.pem|key|p12|pfx|cer|crt|csr|snk）
DLC gate 契约（与 dlc-signing-resolve 对齐）:
  node scripts/verify-dlc-trust.mjs [--packs-dir <staged>/packs] [--exe <staged>/DesktopGames.exe]
  env RELEASE_VERSION / DLC_TRUST_RELEASE=1；exit 0=pass，非 0=block
  默认 warn-only；--require-dlc-trust 时为 fail-closed；--skip-dlc-trust 仅 preview 且写入 manifest
```

### 未修改（遵守边界）

- 未改 `native/dlc-verify`（task-41 负责）；未改 `app/tauri/src-tauri/tauri.conf.json` / `main.rs`（task-42/43 负责）；未改任何业务代码。
- 未创建/读取/复制/打印任何私钥、PFX、口令；测试只用临时假文件与真实系统签名二进制验证"验证器"。
- 未 commit / 未 push；未改他人 write scope 的已有文件。

---

## 5. DLC trust gate 接入（与 task-41 对齐）

- release-win 在 **staging 之后、zip 之前**调用 `scripts/verify-dlc-trust.mjs`，传 `--packs-dir <stage>/packs --exe <stage>/DesktopGames.exe`（DLC agent 建议的时机，可同时证明发布树无 packs/keys、exe 无 `--dlc-key/P0_PACKS_DIR` 覆盖）。
- signed release：`--require-dlc-trust` → gate 缺失/失败即 release 失败（fail-closed）。
- unsigned preview：`--skip-dlc-trust` 显式豁免并写 manifest `dlcTrust.status="skipped"`；不得用于发布。
- 当前 gate 预期 FAIL：① 生产 trust root 未 ceremony；② repo packs 仍 dev 签名、无 `signature.json` 信封；③ `main.rs` 仍有 `--dlc-key/P0_PACKS_DIR`。因此 signed release 现在会被 B3 阻断——**这是有意的 fail-closed**，不是本任务要"变绿"的对象。
- 按 DLC agent 要求，signed/release staging 已排除 `packs/keys/` 与 `.pem/.key/.p12/.pfx`；preview 保留 dev 公钥以维持 dev-signed DLC 可加载。

---

## 6. 测试与验证证据（真实运行）

### 6.1 自动化测试

| 命令 | 结果 |
|---|---|
| `node --import tsx --test tests/release-sign.test.ts` | **19 pass / 0 fail**，覆盖：plan/check-env 退出码、密码与 PFX 字节不泄漏、仓库内 PFX 拒绝、tag/dispatch/local 策略矩阵、dry-run 日志 redact、真实 signtool 参数传递（stub）、report 校验（Valid/NotSigned/无时间戳/错误 pin/hash 变化）、release-win `--signed` 依赖校验、manifest 确定性、repro compare、workflow 静态闸门、真实 Get-AuthenticodeSignature 报告、确定性 zip |
| `npm run typecheck` | pass（0 errors） |
| PyYAML `safe_load` 解析 `ci.yml/release.yml/_windows-build.yml` | 3/3 pass |
| `node scripts/repro-check.mjs --check-inputs --json` | ok=true；hard checks 全 pass（lockfile/npm ci/node pin/tauri pin/rust pin/SOURCE_DATE_EPOCH），warnings = 镜像源/runner 浮动/当前树脏/HEAD 未 tag（本机预期） |

### 6.2 真实验证器证据

- `scripts/authenticode-report.ps1` 对仓库 EXE 与 NSIS setup：`NotSigned`（与审计一致）。
- 对 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`：`Valid` + `timestamped=true` + signer thumbprint 40 hex（证明校验器正例；未使用私钥）。

### 6.3 确定性 / fail-closed 证据

```text
$ reproducible-zip.ps1 同输入跑两次
  8c1cf3e06926f12e4a42e2a9d993149dfa696cdd600e6faade1b6b4202625d5b  a.zip
  8c1cf3e06926f12e4a42e2a9d993149dfa696cdd600e6faade1b6b4202625d5b  b.zip
$ Windows Node 24.22.1 实跑 release-win --all --skip-dlc-trust 两次（SOURCE_DATE_EPOCH=1763000000）
  7ed1bf4c6ca2cedabb29608e871f8faeeee1737089d38c07aa9a0895dd239e12  DesktopGames-0.1.0-portable.zip（两次一致，8.65 MiB）
  不同 --out 目录时：仅 RELEASE-MANIFEST/SHA256SUMS 的路径字段不同，repro-check --compare 返回 hint
$ SOURCE_DATE_EPOCH=1763000000 release-win --sha256 跑两次
  RELEASE-MANIFEST.json 两次 SHA-256 相同；generatedAt=2025-11-13T02:13:20.000Z
$ release-win --sha256 --require-dlc-trust
  [dlc-trust] FAILED → [release] error: DLC trust gate … refusing to package a release（exit≠0）
$ release-win --sha256 --skip-dlc-trust
  exit 0；manifest.dlcTrust.status="skipped"（preview-only）
$ release-win --sha256 --signed --signing-report <synthetic fixture>
  通过 report 校验 → manifest.unsigned=false, signing.verified=true（仅验证记账路径；真实签名见 B1）
```

### 6.4 未能运行（如实记录）

- **真实 Authenticode 签名**：没有证书。用 synthetic report 只测试了"report → manifest"的记账/拒绝路径，不冒充签名成功。
- **GitHub Actions 端到端**：当前 checkout 无 remote/tag（`git remote -v` 为空），workflow 只做了 YAML 解析 + 静态契约测试；首次真实运行是 B2。
- **两次完整 Tauri 构建的 EXE 级复现**：需要 Windows MSVC 全量构建两次，本任务未改构建配置，列为 B4。
- **安装器内嵌 exe 的签名验证**：签名顺序已按"先签 exe 再 bundle"设计并有 hash guard，但真实签名后需在首次 signed 构建里确认（B2）。

---

## 7. 验收 / 关闭条件（P2-7）

工程验收（本任务，已满足）：

- [x] 无签名材料时 tag 构建被 CI 阻断；unsigned 只能显式 preview。
- [x] 证书存在时 CI 可签 exe→bundle→installer 并强制验证（Valid + timestamp + pin + hash）。
- [x] 没有有效 report 时 `RELEASE-MANIFEST.json` 不可能出现 `unsigned:false`。
- [x] 密钥不落仓/不打印/always 清理 + 仓库内 PFX 拒绝 + 测试断言。
- [x] 可复现打包（SOURCE_DATE_EPOCH + 确定性 zip）与输入检查、对比工具。
- [x] DLC trust gate 接线为 fail-closed（signed release 强制 require）。

P2-7 最终关闭（需外部条件）：

- [ ] **B1** 拿到 OV/EV 证书并配置 secrets/vars/environment。
- [ ] **B2** 首次真实 signed tag 构建：`Get-AuthenticodeSignature` = Valid、`signtool verify /pa` = 0、report 中 timestamp/pin 齐全；artifact 为 signed。
- [ ] **B3** DLC trust gate 转绿（task-41 + owner ceremony）后 signed release 可发布。
- [ ] **B4**（可选但建议）EXE 级 bit-for-bit 复现证据归档。
- [ ] **B5/B6** MSI/updater/SHA256SUMS 外层签名按需补齐。

在上述 B1–B3 完成前，**严格禁止**把 unsigned preview 当作签名 release 发布，也禁止加 gate waiver。

---

## 8. 复现与验证命令

```sh
cd /mnt/d/Projects/dsh/desktop-games

# 静态/策略
node scripts/release-sign.mjs --plan --json
node scripts/release-sign.mjs --check-env --require-pin --json
node scripts/release-sign.mjs --policy --trigger tag --json   # 无材料时 exit 1
node scripts/repro-check.mjs --check-inputs --json

# 测试 / 类型
node --import tsx --test tests/release-sign.test.ts
npm run typecheck

# YAML 语法
python3 -c "import yaml; [yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/release.yml','.github/workflows/_windows-build.yml']]"

# 打包（当前无证书：只能是 unsigned preview，必须显式 skip + 记录）
node scripts/release-win.mjs --sha256 --out artifacts/_check --skip-dlc-trust
node scripts/release-win.mjs --verify --out artifacts/_check

# 有证书后（Windows）
node scripts/release-sign.mjs --sign --target app-exe
node scripts/release-sign.mjs --verify --target app-exe --report artifacts/signing-app-exe.json
node scripts/release-sign.mjs --sign --target installer
node scripts/release-sign.mjs --verify --target all --report artifacts/signing-report.json
node scripts/release-win.mjs --all --strict --signed --signing-report artifacts/signing-report.json --require-dlc-trust
node scripts/release-win.mjs --verify
```

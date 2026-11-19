# MB-095 决策/声明：PE bit-for-bit 复现 — **C1 明确非目标**

> **Status: DECIDED (2026-11-20) — 声明 + 验收边界。不是“已实现可复现 PE”的声明。**
> 关联：task-93 / MB-095（P2，「可明确标为非目标」，MASTER-BACKLOG §4 允许）。
> 基线 HEAD `6404d43`。默认发布通道 C1 = unsigned invite beta，产品身份仍 DesktopGames。
> 本文件不改构建配置；只把“能宣称什么 / 不能宣称什么 / 怎么验证”固定下来。

## 1. 决策（一句话）

**C1 明确不把「PE 可执行文件 / MSI / NSIS 安装包 bit-for-bit 复现」作为目标或发布声明；
只承诺「打包层与元数据在固定输入 + `SOURCE_DATE_EPOCH` 下可复现」，并保留可复核的对比工具。**
该非目标在 C1 渠道内有效；若将来需要 bit-for-bit PE（C2/C3 或供应链要求），必须另立任务并接受
§5 的成本。

## 2. 为什么要显式声明（当前容易误读的点）

| 现状文本 | 实际含义 | 误读风险 |
| --- | --- | --- |
| `BUILD-INFO.json` 有 `"reproducible": true` | 指**打包输入/时间戳归一化**（SOURCE_DATE_EPOCH、确定性 zip、manifest 生成时间），**不是** EXE 字节一致 | 被引用为“发布包可复现（bit-for-bit）” |
| `RELEASE-SIGNING.md §6` 标题“可复现构建” | 范围 = 打包层 + 元数据 + 输入钉扎；§6 末段已写明 PE 层未做（B4） | 只读标题就外推 |
| `scripts/repro-check.mjs` | 只检查输入与对比两个输出树；PE 链接器确定性不在工具能力内 | 以为 `--compare` 绿=PE 可复现 |
| 便携 zip 两次同哈希证据（`RELEASE-SIGNING.md:230`） | 仅证明 zip 打包层可复现 | 外推到 setup.exe/MSI |

→ 因此本声明把“打包层可复现（承诺）”与“PE/安装包 bit-for-bit（非目标）”**分开写死**。

## 3. C1 承诺（可对外说的）

1. **输入钉扎**：`package-lock.json`（lockfileVersion 3）+ `npm ci`；Node 24.22.1；Rust 1.99.1；
   Tauri CLI 2.12.6；`SOURCE_DATE_EPOCH` 取发布 commit 时间。检查命令：
   `node scripts/repro-check.mjs --check-inputs --json`（C1 实测 `ok=true`，见 §6）。
2. **确定性打包**：便携 zip 由 `scripts/reproducible-zip.ps1` 生成（路径排序、条目时间固定为
   SOURCE_DATE_EPOCH、无目录条目）；`BUILD-INFO.json`/`RELEASE-MANIFEST.json` 的 `generatedAt` 用
   SOURCE_DATE_EPOCH。
3. **可复核差异**：`node scripts/repro-check.mjs --compare <run-a> <run-b>` 逐文件相对路径 +
   SHA-256 列出差异；发布证据包带 `RELEASE-MANIFEST.json` + `SHA256SUMS.txt` 供第三方校验。
4. **不夸大**：发布说明/README/STATUS 不得写“reproducible binary / bit-for-bit reproducible /
   可复现构建（指整包）”。允许写法见 §7。

## 4. C1 非目标（明确不承诺）

| 对象 | 非目标理由 |
| --- | --- |
| `desktop-games-tauri.exe`（PE） | MSVC 链接器会在 PE 头/调试信息/RSDS 中写入时间戳与 PDB 路径/GUID；仓库未启用 `/Brepro`、未做 `--remap-path-prefix`、未禁 PDB 路径；Rust 构建输出还含绝对路径。**未验证过**，不得宣称。 |
| NSIS `setup.exe` | NSIS 打包时间戳/压缩顺序/语言文件排序；Tauri bundler 额外嵌入版本资源与时间。 |
| MSI | WiX 打包含 GUID/时间/压缩顺序；当前 `bundle.targets: all` 但 C1 主要分发 NSIS/portable。 |
| WebView2 运行时/系统组件 | 由操作系统/微软分发，不受本项目控制。 |
| 跨机器/跨日期复现 | GitHub-hosted runner 镜像与工具链补丁会漂移；`repro-check` 对 `runner-image` 明确 WARN。 |
| 签名后字节一致 | C2 起 Authenticode 签名 + RFC3161 时间戳必然改变字节；签名版永不承诺 bit-for-bit。 |

## 5. 若将来要把 PE 变成可复现（成本/路线，仅备查）

- 链接器：`RUSTFLAGS=-C link-arg=/Brepro`（MSVC）、`/DEBUG:NONE` 或固定 PDB、`/PDBALTPATH`、
  `-C metadata`/`-C extra-filename` 归一化。
- 路径：`--remap-path-prefix` 消除构建机绝对路径；固定工作目录。
- Tauri/NSIS：确认 Tauri CLI/bundler 是否支持 `SOURCE_DATE_EPOCH` 与确定性 zip；NSIS 需要
  `!define SOURCE_DATE_EPOCH`-类补丁或更换打包器。
- 验证：同一 commit 两次构建（相同相对 `--out`）→ `repro-check --compare` 全等；差异需白名单化
  并逐项解释（不是“接受差异”）。
- 成本：预计 2–4 人日 + 每平台验证 + 长期维护（工具链升级会打破确定性）。**C1 不做**。

## 6. C1 实测记录（2026-11-20，本机 Linux/WSL，HEAD `6404d43`）

```text
$ node scripts/repro-check.mjs --check-inputs --json
exit=0  ok=true
pass: lockfile(lockfileVersion 3) / npm-ci / node-pinned(24.22.1) /
      source-date-epoch / tauri-cli-pinned(2.12.6) / rust-pinned
warn: lockfile-registry(112/112 resolved via registry.npmmirror.com)
      runner-image(*-latest floats)
      clean-tree(working tree dirty — expected during this task)
      head-tag(HEAD not tagged)
      source-date-epoch-env(not set in this shell)
```

- 该结果是**输入钉扎/可复现前提**的实测，不代表 PE 可复现。
- 已归档的 C1 打包证据（`artifacts/evidence/2026-11-20-c1-final-6404d43/BUILD-INFO.json`）
  记录 `reproducible: true`、`sourceDateEpoch: 1795106868`、`inputs.packageLockSha256` 等；
  其含义按 §2 解释，不得外推。
- 历史打包层复现证据（便携 zip 两次同哈希）见 `docs/RELEASE-SIGNING.md:230`（写作时快照）。

## 7. 允许/禁止的措辞

| ✅ 允许 | ❌ 禁止 |
| --- | --- |
| “发布流程固定输入版本与 `SOURCE_DATE_EPOCH`；便携 zip 的打包结果可复现，并提供 SHA256SUMS 供校验。” | “本发布包可 bit-for-bit 复现。” |
| “EXE/安装包的可复现性未验证，C1 不作为目标。” | “整包可复现构建。” |
| “此前两次构建的便携 zip 哈希一致（仅证明 zip 打包层）。” | “两次构建 EXE 哈希一致。” |
| “msi/nsis 未做确定性验证。” | “MSI 也可复现。” |

## 8. 后续（若 C2/C3 需要）

1. 立专门任务（建议 MB-095b）：PE 确定性构建 + 跨两次构建对比 + 差异白名单 + CI 证据。
2. 与 C2 签名顺序：**先**验证未签名 PE 可复现，**再**签名；签名产物只承诺可验证、不承诺 bit-for-bit。
3. 更新 `RELEASE-SIGNING.md §6/§9 B4`、STATUS 与发布说明口径（本文件是 C1 的口径源）。

## 9. 参考

- `docs/plan/MASTER-BACKLOG-2026-11-19.md` §4（允许把 MB-095 标为非目标）、§E9
- `docs/RELEASE-SIGNING.md` §6（可复现构建实现）、§9 B4（PE 层未验证剩余项）
- `scripts/repro-check.mjs`（输入检查/输出树对比）
- `scripts/reproducible-zip.ps1`（确定性 zip）
- `.github/workflows/_windows-build.yml`（SOURCE_DATE_EPOCH + repro input checks）
- `artifacts/evidence/2026-11-20-c1-final-6404d43/BUILD-INFO.json`（C1 打包证据）

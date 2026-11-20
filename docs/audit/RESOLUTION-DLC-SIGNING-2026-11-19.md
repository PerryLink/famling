# P1-1 解决报告：生产 DLC 签名信任根、key id / 轮换 / 吊销与发布 fail-closed 门禁

- Date: 2026-11-19
- 任务: task-41（lead 指派；对应 [FAMLING-SECURITY-AUDIT-2026-11-18](FAMLING-SECURITY-AUDIT-2026-11-18.md) §2 P1-1）
- 执行: dlc-signing-resolve（子 agent）；集成 owner：root（main.rs）、authenticode-resolve（release-win.mjs / 发布工作流）
- 范围: `native/dlc-verify`、`scripts/test-dlc-rust.sh`、`scripts/make-pack.ts`、新增 `scripts/verify-dlc-trust.mjs`、`docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md`
- 不在本任务范围（只报告不落地）: `app/tauri/src-tauri/src/main.rs`、`app/tauri/src-tauri/tauri.conf.json`、`scripts/release-win.mjs`、`.github/workflows/release.yml`、`app/electron/main.ts`、`src/pack/**`、插件/famling 仓
- 状态: **代码 + 测试完成；发布前仍有 3 项外部动作未完成（生产密钥 ceremony、main.rs 去覆盖、tauri.conf 资源去 keys）**。release 门禁当前**预期失败**（fail-closed），见 §12。

---

## 0. TL;DR

| 项目 | 结果 |
|---|---|
| 编译期内置生产信任根（`include_str!`，不从可写 packs 目录读取） | ✅ 已实现（`native/dlc-verify/trust/production-trust-root.json` → `native/dlc-verify/src/lib.rs`） |
| release 构建忽略运行时 `--dlc-key` / `P0_PACKS_DIR` 信任根覆盖 | ✅ 库层已强制（release 下 `verify_pack(dir, key_pem)` 忽略 `key_pem`，只用内置根）；main.rs 参数读取删除仍待 root |
| key id 信封（`signature.json`）+ 多公钥白名单 | ✅ 已实现；dev 密钥指纹在库层与门禁层双双禁止进入生产根 |
| 轮换（active/retired）与吊销（revoked） | ✅ 语义 + 单测 + 门禁自测（24 例） |
| dev/QA 兼容（保留开发密钥工作流） | ✅ 仅在 debug 构建或显式 `--features dev-trust` 构建启用；release 应用不启用该 feature |
| 发布门禁（校验信任根 + 包签名 + 禁止随包密钥 + 扫描 exe 运行时覆盖） | ✅ `scripts/verify-dlc-trust.mjs`；release-win 已有接线（authenticode-resolve），仍有 3 个接入缺口见 §8 |
| 生产密钥（owner 离线生成、双人保管、私钥不入库） | ⛔ **未完成**：仓库只有 dev 密钥；本任务不生成/不写任何私钥或凭据 |
| main.rs 删除 `--dlc-key`/`P0_PACKS_DIR` 读取、改用内置根 | ⛔ 待 root（本任务只给 patch 指引，见 §9） |
| 发布门禁当前状态 | ⛔ **预期 FAIL**：无 active 生产公钥；仓库 pack 仍是 dev 签名（无 signature.json）；现有 Tauri release exe 仍含 `--dlc-key`/`P0_PACKS_DIR`/`dev-public` 字符串（实测，见 §11.6） |

**结论**：P1-1 的**代码侧**（信任根载体、key id/轮换/吊销、release 去覆盖、发布门禁、测试）已经关闭；**P1-1 整体仍不能标 closed**，因为生产密钥 ceremony 与 main.rs/tauri.conf 集成是发布阻断项（§12 列出 owner/动作/验收）。

---

## 1. 问题复述与现状证据

审计原文（§2 P1-1）要点：

1. `app/tauri/src-tauri/src/main.rs:562-581`：默认信任根 = `packs_dir/keys/dev-public.pem`（dev 密钥），且 `--dlc-key=` 可任意覆盖；`--packs-dir=` / `P0_PACKS_DIR` 可把含 keys/ 的整个目录指向任意位置。
2. `tauri.conf.json:39` 把整个 `packs/`（含 dev 公钥）作为安装包资源分发。
3. `packs/keys/dev-public.pem` 入库；`scripts/make-pack.ts` 用本地 `.keys/dev-private.pem` 签名；dev 私钥仅在本机且 gitignored，但**信任根本身是 dev 密钥**，也**没有轮换/吊销**。
4. 因此一旦 dev 私钥泄露/被共享，持有者可对**所有安装**签发通过验证的恶意 pack；叠加 P1-3（innerHTML）/P1-2（无命令 ACL）可升级为 P0。

本任务开工前的附加实测（2026-11-19，见 §11.6）：

```text
$ node scripts/verify-dlc-trust.mjs --exe app/tauri/src-tauri/target/release/desktop-games-tauri.exe --report-only --json
  found: ["--dlc-key", "P0_PACKS_DIR", "dev-public"]   # 现有 release exe（12,679,168 B）
$ node scripts/verify-dlc-trust.mjs --report-only --json
  trustRoot.keys = []                                   # 尚无生产公钥
  packs/farm-seasons: legacy signature.txt only         # 无 keyId 信封
  packs/reef-pack:    legacy signature.txt only
```

即：审计结论在开工时仍然成立；本任务把**机制**补上，并把上述状态变成**可自动阻断发布**的明确信号。

---

## 2. 威胁模型与非目标

### 2.1 要防的威胁

| # | 威胁 | 攻击面 | 本方案对应 |
|---|---|---|---|
| T1 | dev/测试私钥泄露 → 对全部安装签发恶意 pack | 私钥保管、仓库/备份/聊天泄露 | 生产根**禁止 dev 指纹**（Rust + 门禁双重拒绝）；release 只信任内置生产根 |
| T2 | 本地启动参数/快捷方式投毒改信任根 | `--dlc-key`、`--packs-dir`、`P0_PACKS_DIR`、可写安装目录里的 keys/ | release 库层忽略运行时 key；门禁扫描 release exe 内覆盖字符串；main.rs 参数删除（root） |
| T3 | 密钥无法轮换，轮换即全量内容失效 | 单密钥信任根 | 多公钥白名单 + active/retired 状态与 notBefore/notAfter 窗口 |
| T4 | 密钥泄露后无法吊销 | 无吊销机制 | revoked 状态 + 取消信任（需随新版本发布；旧二进制有滞后，见 §12） |
| T5 | 降级：删掉 keyId 信封回退 legacy 签名 | 只带 signature.txt 的包 | 生产策略 `allowLegacySignatureWithoutKeyId=false`；存在 signature.json 时**不**回退 signature.txt（有单测） |
| T6 | 门禁被绕过（打包时误带 keys/、release 仍接受 --dlc-key） | 发布流水线 | 门禁：信任根 schema/指纹/active key、逐包验签+hash、禁止随包 .pem/.key、扫描 exe 覆盖字符串 |

非目标（本任务不做，避免与其它 task 冲突）：

- P2-3 的路径/大小/schema 全面硬化（Rust 侧 path canonicalize、manifest schema、总大小上限等）——只加了签名文件大小上限与门禁侧的路径/hash/大小检查；完整 Rust 硬化仍在 backlog。
- P1-3 的内容 schema/DOM 校验、P1-2 命令 ACL、Tauri capability（分别由其它 task 负责）。
- Authenticode/更新通道（P2-7，task-46）。
- Steam entitlement 的真实校验。

### 2.2 信任假设

- 发布构建机可信；攻击者不能重新编译并分发被用户信任的二进制（这类攻击需要 Authenticode/更新链，见 P2-7）。
- 信任根随二进制更新；**吊销的传播 = 发布新版本**（当前没有 updater，用户需手动更新）。
- 生产私钥只在离线/受控签名环境出现，仓库/CI 只出现公钥。

---

## 3. 设计

### 3.1 信任根载体：编译期嵌入，public keys only

- 文件：`native/dlc-verify/trust/production-trust-root.json`（schema v1）。
- Rust 在编译期用 `include_str!("../trust/production-trust-root.json")` 嵌入；运行时**不再读取** `packs/keys/` 或任何路径。
- 因此：信任根 = release 二进制的一部分；改信任根必须改仓库 + 重新构建/发布；运行时无可写文件可替换。
- 条目字段：`keyId`（唯一 slug）、`algorithm: "ed25519"`、`publicKeyPem`、`fingerprintSha256`（SPKI DER 的 SHA-256，必填且必须匹配）、`status: active|retired|revoked`、可选 `notBefore`/`notAfter`（YYYY-MM-DD，UTC）、`revokedAt`/`revocationReason`/`comment`。
- 策略：`policy.allowLegacySignatureWithoutKeyId`（生产为 false）、`policy.maxSignatureBytes`（默认 8192）。
- 安全常量：仓库 dev 公钥指纹（`f510e186…a19f800`）在 Rust `TrustRoot::from_json` 与 Node 门禁中都**硬拒绝**——即使有人误把 dev 公钥加进生产根，release 也会 fail-closed 而不是静默信任。

### 3.2 签名信封 signature.json（keyId）

```json
{
  "schema": 1,
  "algorithm": "ed25519",
  "keyId": "dlc-prod-2026-01",
  "signature": "<canonical manifest 的 Ed25519 签名 base64>"
}
```

- **为什么 keyId 不放进 manifest**：manifest 是 @-signed 的 canonical JSON；现有 `src/pack/manifest.ts` 会裁剪未知字段、Node/Electron dev loader 与既有包都依赖 current schema；把 keyId 放进独立信封可在**不改 src/pack** 的前提下完成轮换/吊销，且不改变“签名覆盖 manifest”的安全属性（信封的 keyId 只做**密钥选择**，真正的信任判定仍是“该 key 在信任根中可用且签名对 canonical manifest 有效”）。
- 兼容：`scripts/make-pack.ts` 同时写 legacy `signature.txt`（Node/Electron dev loader 继续用）和 `signature.json`；release 策略要求后者。
- 反降级：若 `signature.json` 存在但无效（schema/keyId/base64/未知字段），直接报错，**不回退** `signature.txt`（单测 `invalid_signature_envelope_is_not_downgraded_to_legacy_signature`）。
- 旧包：只有 signature.txt 的包在 release 信任根下会被拒（策略 false）；需要 owner 在生产 ceremony 后用 `make-pack` 重签（会同时生成两个文件）。

### 3.3 验证流程（Rust，release 顺序不变）

```text
1) trust root empty?            -> Err("fail-closed ... no signing keys")
2) read/parse manifest.json     -> id/contentApi/content/files
3) read signature.json (优先)   -> schema/algorithm/keyId/64-byte sig；缺失则读 legacy signature.txt
4) resolve key by keyId         -> 不存在/revoked/超出 notBefore..notAfter => Err
   （legacy 无 keyId 时：仅当 policy.allowLegacy...=true 才按白名单逐一尝试）
5) Ed25519 verify_strict        -> canonical(manifest) sorted-key JSON（与 TS/Rust 既有实现一致）
6) per-file SHA-256 校验        -> 任一 mismatch => Err
7) parse content.json           -> 返回 manifest/content/files_verified/keyId/fingerprint
```

### 3.4 多公钥 / 轮换 / 吊销语义

| status | 可用于签新包（make-pack --trust-root） | 可用于验旧包 | 门禁允许发布 |
|---|---|---|---|
| active | ✅（必须指纹匹配） | ✅（在 notBefore/notAfter 内） | ✅ |
| retired | ❌（make-pack 拒绝） | ✅（宽限窗口内） | ✅（仍可验旧包） |
| revoked | ❌ | ❌（任何情况下） | ❌（但保留条目用于审计/拒绝） |

- 轮换窗口：先发“新 active + 旧 retired”的二进制 → 用新 key 重签 pack → 达到覆盖后旧 key 可改 revoked/移除。
- **旧二进制的限制**：吊销/移除只对**更新到新版本**的客户端生效；旧版本仍信任旧 key。没有自动更新（P2-7）时，泄露响应必须配合手动升级通知。审计/发布记录中必须写清这一点。

### 3.5 fail-closed 行为矩阵

| 构建 | dev-trust feature | 运行时 key 覆盖 | 实际信任根 | 现有 dev pack |
|---|---|---|---|---|
| debug（Tauri dev / cargo test） | 无 | `verify_pack_dev` 接受调用方 PEM | 调用方提供的 dev 公钥（仅进程内） | ✅ 可加载 |
| release（默认；发布应用） | 无 | **忽略**（`verify_pack(dir, key_pem)` 丢弃 key_pem；`verify_pack_dev` 恒 Err） | 编译期内置生产根 | ❌ 拒绝（预期） |
| release + `--features dev-trust`（仅本地 QA/CI 验签器） | 有 | CLI `<pack> <key.pem>` 可用 | 调用方 dev 公钥 | ✅（只用于测试脚本，不得用于发布 app 构建） |

- Tauri app 的 `app/tauri/src-tauri/Cargo.toml` 依赖 `dlc-verify` 时不启用 `dev-trust` ⇒ 发布 app 永远走内置根。
- 防御纵深：即使 root 暂时没改 main.rs、release 仍把 dev key 传进来，库层也会忽略它（这是本次 P1-1 的关键行为）。

### 3.6 发布门禁（`scripts/verify-dlc-trust.mjs`）

无参数 + `DLC_TRUST_RELEASE=1`（release-win 契约）：

1. 读取并校验信任根（schema/唯一 keyId/PEM 可解析/指纹匹配/日期合法/无 dev 指纹）。
2. 要求至少 1 个**当前可用 active** key（否则 fail-closed 文案指向本 runbook）。
3. 扫描 release exe：`--dlc-key`、`P0_PACKS_DIR`、`dev-public`、dev key SPKI DER base64（ASCII 与 UTF-16LE 都查）。
4. 禁止发布树随包密钥材料：任意 `.pem/.key/.p12/.pfx`（repo 树的 `packs/keys/dev-public.pem` 只 warn；显式 `--packs-dir` staging 树中一律拒）。
5. 逐包：manifest schema 基本校验 → `signature.json` → keyId 解析（active/retired、窗口、revoked 拒绝）→ Ed25519 验签 → 逐文件 SHA-256 + content JSON。
6. 输出人类可读或 `--json`；exit 0=pass / 1=block / 2=usage。

自测 `--self-test` 覆盖 24 个正/反例（含 dev 指纹拒绝、轮换/吊销、降级、过期/未生效、tamper、exe 字符串扫描、UTF-16LE、staged keys 拒绝、report-only 等）。

### 3.7 开发工作流保留

- 本地 Tauri dev（debug）与 `cargo test`：行为与之前一致（可用 `packs/keys/dev-public.pem` 验 dev pack）。
- 本地 Rust 验签器：`bash scripts/test-dlc-rust.sh` 会分别构建/测试 release（内置根）与 `--features dev-trust`（dev 正/反例）两种二进制。
- Node/Electron dev host（`app/electron/main.ts`、`src/pack/loader.ts`）仍用 `packs/keys/dev-public.pem` —— 这是**开发宿主**，不是发布 app；不作为生产信任路径，后续可迁移（§12）。

---

## 4. 实现清单

### 4.1 新增

| 文件 | 作用 |
|---|---|
| `native/dlc-verify/trust/production-trust-root.json` | 生产信任根（当前 `keys: []` = fail-closed，等 ceremony） |
| `native/dlc-verify/trust/README.md` | schema/编辑规则/禁止 dev key/签名命令 |
| `scripts/verify-dlc-trust.mjs` | 发布门禁 + 自测（Node，无第三方依赖） |
| `docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md` | 本文（设计 + runbook + 验收 + 剩余风险） |

### 4.2 修改

| 文件 | 变更 |
|---|---|
| `native/dlc-verify/src/lib.rs` | 重写：`TrustRoot`/`TrustPolicy`/`KeyStatus`；`EMBEDDED_TRUST_ROOT_JSON` + `include_str!`；`verify_pack_embedded`/`verify_pack_with_trust_root`/`verify_pack_dev`；legacy `verify_pack` release 忽略 key_pem；signature.json 信封；canonical 验签顺序保留；schema/指纹/日期/重复 keyId/dev 指纹校验；19 个单测 |
| `native/dlc-verify/src/main.rs` | CLI：`dlc-verify <pack>`（内置根）、`--print-trust`、dev 模式参数仅在 dev-trust/debug 构建可用；输出 keyId/fingerprint/trustSource |
| `native/dlc-verify/Cargo.toml` | 新增 `[features] dev-trust = []`（默认关闭） |
| `scripts/make-pack.ts` | `--key`/`--key-id`/`--trust-root`；写 signature.json（+保留 signature.txt）；生产根下要求 keyId 存在、active、私钥指纹匹配；支持 `DLC_SIGNING_KEY_PASSPHRASE` 内存解密（加密 PKCS#8 私钥） |
| `scripts/test-dlc-rust.sh` | 双模式构建+测试：内置根拒绝 dev 包/运行时覆盖；dev-trust 正包/篡改内容/篡改 manifest；gate 自测 |

### 4.3 公开 API（供 root 的 main.rs 与后续代码使用）

```rust
// 推荐：release 命令直接调用（不可覆盖）
pub fn verify_pack_embedded(dir: &Path) -> Result<VerifiedPack, String>;

// 兼容旧调用点：release 下忽略 key_pem、只用内置根；dev/debug 下使用给定 key
pub fn verify_pack(dir: &Path, key_pem: &str) -> Result<VerifiedPack, String>;

// 显式 dev/QA（release 默认构建恒返回 Err；仅 debug 或 dev-trust feature 可用）
pub fn verify_pack_dev(dir: &Path, key_pem: &str) -> Result<VerifiedPack, String>;

pub fn embedded_trust_root() -> Result<&'static TrustRoot, String>;
pub fn verify_pack_with_trust_root(dir: &Path, trust: &TrustRoot) -> Result<VerifiedPack, String>;
pub const DEV_TRUST_OVERRIDE_ENABLED: bool;
```

返回结构新增 `key_id` / `key_fingerprint_sha256` 字段（向后兼容，原字段不变）。

---

## 5. Runbook A：首次生产密钥 ceremony（owner + 双人保管）

> 本节是**操作步骤**，不是建议。生产密钥只能由项目 owner 在离线/受控环境执行；本任务执行者**没有**生成、保存或写入任何生产私钥。
> 推荐目标：1 把长期生产 key（active）+ 1 把下一把 key（active 或暂不加入），Ed25519、密码保护、双人保管。

### 5.1 生成密钥对（离线机器，air-gapped；不在开发机/CI）

```bash
umask 077
# 1) 生成加密的 Ed25519 PKCS#8 私钥（交互输入强密码；密码由第二保管人另行保管）
openssl genpkey -algorithm ED25519 -aes-256-cbc -out dlc-prod-2026-01.private.pem
# 2) 导出公钥（只有公钥可以离开离线环境）
openssl pkey -in dlc-prod-2026-01.private.pem -pubout -out dlc-prod-2026-01.public.pem
# 3) 计算 SPKI DER 的 SHA-256（= 信任根 fingerprintSha256，64 位小写 hex）
openssl pkey -pubin -in dlc-prod-2026-01.public.pem -outform DER | sha256sum
```

- 记录：keyId（如 `dlc-prod-2026-01`）、fingerprintSha256、生成日期、保管人 A/B、离线介质编号。
- **私钥绝不进入**：仓库、CI、聊天/邮件、截图、OneDrive/网盘、普通开发机、`packs/`、`.keys/`（可放签名机的受控目录，如 `D:\secure\dlc-keys\`）。
- 备份：2 份离线介质（异地/保险柜），密码与私钥介质分开保管；定期演练恢复。
- 若用 Windows 签名机：`icacls "D:\secure\dlc-keys\dlc-prod-2026-01.private.pem" /inheritance:r /grant:r "%USERNAME%:(R,W)" "SYSTEM:(F)"`（按实际账户收紧；只读访问即可）。

### 5.2 将公钥写入信任根（在仓库/受控发布机）

编辑 `native/dlc-verify/trust/production-trust-root.json`，在 `keys` 数组加入（示例）：

```json
{
  "keyId": "dlc-prod-2026-01",
  "algorithm": "ed25519",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n<...>\n-----END PUBLIC KEY-----\n",
  "fingerprintSha256": "<5.1 的 64 hex>",
  "status": "active",
  "notBefore": "2026-11-20",
  "comment": "production DLC content signing; custodian A/B; offline"
}
```

- 不要修改 `policy.allowLegacySignatureWithoutKeyId`（必须为 `false`）。
- 不要加入 dev 公钥（`f510e186…a19f800`）；库与门禁都会拒绝。

### 5.3 用生产私钥重签所有要发布的 pack（签名机，私钥只在受控环境）

```bash
# 交互式读入密码：避免写进 shell history / 进程 argv
read -r -s -p 'DLC signing passphrase: ' DLC_SIGNING_KEY_PASSPHRASE
export DLC_SIGNING_KEY_PASSPHRASE

node scripts/make-pack.ts packs/farm-seasons \
  --key-id dlc-prod-2026-01 \
  --key /secure/dlc-keys/dlc-prod-2026-01.private.pem \
  --trust-root native/dlc-verify/trust/production-trust-root.json

node scripts/make-pack.ts packs/reef-pack \
  --key-id dlc-prod-2026-01 \
  --key /secure/dlc-keys/dlc-prod-2026-01.private.pem \
  --trust-root native/dlc-verify/trust/production-trust-root.json

unset DLC_SIGNING_KEY_PASSPHRASE
```

- `make-pack` 会校验：keyId 存在于信任根、status=active、私钥导出的公钥指纹 = `fingerprintSha256`；不匹配直接失败。
- 输出：`manifest.json`（未变结构）、`signature.txt`（legacy，dev loader 用）、`signature.json`（release 用，含 keyId）。
- 提交/发布时只提交**公钥信任根 + 重签后的 pack**；`signature.txt/json`、`manifest.json` 是新生成的公开产物；私钥不出现。

### 5.4 验证（发布机，必须全绿）

```bash
export PATH="$HOME/.cargo/bin:$PATH"        # 本机 cargo 路径，按实际
cargo test --manifest-path native/dlc-verify/Cargo.toml
bash scripts/test-dlc-rust.sh               # 含 release 内置根 + dev-trust 正反例
node scripts/verify-dlc-trust.mjs --self-test

# repo 模式：应看到 warning（repo 仍保留 dev 公钥，但打包不应带）
node scripts/verify-dlc-trust.mjs --report-only

# staged 模式（模拟发布树）：packs 中无 keys/ 且所有包被生产根验证
tmp=$(mktemp -d)
cp -a packs "$tmp/packs"
rm -rf "$tmp/packs/keys"
node scripts/verify-dlc-trust.mjs --packs-dir "$tmp/packs" \
  --trust-root native/dlc-verify/trust/production-trust-root.json
# 期望：packs: N/N verified ... ok
```

- 若 main.rs 已完成 §9 的改造，release exe 扫描可通过：
  `node scripts/verify-dlc-trust.mjs --exe <release.exe>`（期望 no --dlc-key/P0_PACKS_DIR/dev-public）。
- 若 gate 失败，**不要**加 waiver/NOP 跳过；按失败项修复（§12 的阻断项）。

### 5.5 记录（必须写进发布文档/SECURITY.md 的 key registry）

| keyId | fingerprintSha256 | 生成日期 | 保管人 | 状态 | 用途/备注 |
|---|---|---|---|---|---|
| 待 owner 填写 | 待填写 | 待填写 | A/B | active | production content signing |

> 该表用公钥指纹，不含任何秘密。审计要求“私钥 ACL/保管流程有书面记录”（§10 验收）。

---

## 6. Runbook B：密钥轮换（无中断）

目标：新 key 上线后旧包仍可验证，最终旧 key 退役/吊销。

1. **生成下一把 key**（§5.1；建议 keyId `dlc-prod-2027-01`；独立密码/保管）。
2. **把新 key 以 active 加入信任根**（与旧 active 并存），日期 `notBefore` 可设为发布日。
3. 跑 §5.4 验证（多 key 白名单：旧包由旧 key 验、新包可由新 key 验）。
4. **构建并发布包含两把 key 的版本**（旧 app 只信旧 key；这一步是给客户端“预先认识”新 key 的窗口）。
5. **用新 key 重签所有后续 pack**（§5.3 改 keyId），提交重签后的 pack。
6. 全部内容切换后，把旧 key 改为 `status: "retired"`（保留公钥用于验旧包/审计），发布一次。
7. 宽限期（例如 90 天或一个大版本）后：把旧 key 改 `revoked@@ 或移除，发布；旧客户端（未更新）仍会信任旧 key——见 §3.4 限制。
8. 记录：本文件 §5.5 表格加一行；如旧 key 退役，标注 `retiredAt`/`revokedAt`。

回滚：若新 key 出错（如签错内容），把新 key 改 retired/revoked、内容回滚到旧 key 已签名版本，重新发布；不要删除历史指纹记录。

---

## 7. Runbook C：密钥泄露 / 吊销应急

**触发条件**：私钥介质丢失、备份泄露、签名机被入侵、发现未授权签名、托管人变更等。

### 7.1 立即（0–24h）

1. **冻结签名**：从签名机移除/断网私钥；通知 owner、发布负责人、安全联系人（SECURITY.md）。
2. 在信任根把受影响 key 改为 `status: "revoked"`，填 `revokedAt` + `revocationReason`（如 `key compromise`），**保留条目与公钥**（用于拒绝与审计）。
3. 用**另一把未被泄露的 active key**（新生成的）重签全部要发布的 pack（§5.3）。
4. 跑 §5.4；gate 必须通过；另外用 gate 对“仍由 revoked key 签名的旧包”做负例验证（应失败）。
5. 构建紧急版本，发布；按 SECURITY.md/公告渠道通知用户“只接受新版本/新签名内容”，并给出 SHA-256。
6. 若怀疑泄露者已签发恶意内容：把内容回滚到已审计版本；评估是否需要临时下线 DLC 包（发布只含内置内容的版本）。

### 7.2 之后（1–7 天）

1. 轮换所有与泄露环境相关的密钥（代码签名/updater/云 key——各自 runbook）。
2. 保留取证材料（时间线、介质编号、签名机日志），不销毁。
3. 复盘：信任根/签名机/保管流程改进；更新 §5.5 registry 状态。
4. **不要**把 revoked key 重新启用；不要删除 fingerprint（审计需要）。

### 7.3 已知限制（必须写进事故报告）

- 吊销只对**已更新到含该 revocation 的版本**的客户端生效；旧安装仍信任旧 key。
- 当前发布物**没有 Authenticode 签名、没有自动更新**（P2-7/task-46），用户可能长期停留在旧版本。
- 内容进入应用后的二次防线是 P1-3（内容 schema/DOM 校验）与 P1-2（命令 ACL）；两项仍在其它 task 处理中，不能当作吊销的替代。

---

## 8. `scripts/release-win.mjs` / 发布工作流接入（owner: authenticode-resolve）

状态（2026-11-19 09:50）：**已接入并由本任务独立复核，3 个缺口全部关闭**。本任务不改该文件，只验证接口。

### 8.1 已确认的接入方式

- `runDlcTrustGate()` 在 gate 存在时用 `spawnSync` 运行 `scripts/verify-dlc-trust.mjs`；支持 `--require-dlc-trust`（fatal）与 `--skip-dlc-trust`（preview-only 显式豁免）；在 `buildPortable` staging 之后、zip 之前调用，传 `--packs-dir <staged>/packs --exe <staged>/DesktopGames.exe`，env `RELEASE_VERSION` / `DLC_TRUST_RELEASE=1`；`DLC_TRUST_GATE` 可覆盖 gate 路径。
- 本 gate 完全兼容该调用（`--packs-dir`/`--exe`/`DLC_TRUST_RELEASE`/`RELEASE_VERSION`；exit 0/1/2）。
- gate 结果写入 `BUILD-INFO.json.dlcTrust`（`status`/`required`/`exitCode`）；signed 版通过、preview 版 `skipped`。

### 8.2 原 3 个缺口的修复（已复核）

| 原缺口 | 实际修复 | 复核证据 |
|---|---|---|
| staging 把 `packs/keys/dev-public.pem` 一起打包 | `copyTree(source,dest,filter)` + `packTrustMaterialFilter`：signed 或 `--require-dlc-trust` 构建排除 `keys/` 与 `*.pem/key/p12/pfx/cer/crt/csr/snk`；unsigned preview 保留 dev 公钥以维持 dev-signed DLC 加载（并明确 preview-only） | 在 WSL 复现 signed staging 过滤后跑 gate：`checks.keyMaterial.forbidden=[]`（§11.8） |
| release.yml 未加 `--require-dlc-trust` | 新增 `.github/workflows/_windows-build.yml`：signed job 用 `release-win.mjs --all --strict --signed ... --require-dlc-trust`；unsigned preview 用 `--skip-dlc-trust` 且 manifest 记 `skipped`；`release.yml` 通过 preflight policy 选择 signed / unsigned-preview | 用 `node scripts/release-win.mjs --sha256 --require-dlc-trust` 实测 exit=2 且拒绝打包；`--skip-dlc-trust` 实测 exit=0 并打印 preview-only 警告（§11.8） |
| portable README 仍称 “signed farm-seasons DLC pack” | signed / unsigned 分开措辞：signed 版写 “DLC packs bundled without trust keys; trusted only via compiled production trust root”；preview 版写 “dev-signed content, NOT production-signed” | 读 `scripts/release-win.mjs` 当前 README 生成段确认 |

### 8.3 当前仍 fail-closed 的原因（预期，不是接入问题）

signed release 现在会在 gate 处失败，原因是 §12 的 B1/B5（无生产 active key、仓库 pack 仍是 dev 签名）与 B2 的 exe 重建（见 §11.6/§11.8）。在 B1/B2/B5 完成前**不应**加 waiver/跳过；`--skip-dlc-trust` 只允许用于 unsigned preview，且产物必须标 preview-only（auth 的 workflow 已这样做）。

### 8.4 假阳性修复（本任务补充）

早期 §11.6 扫描命中的 `--dlc-key`/`P0_PACKS_DIR` 已定位为**编译进二进制的信任根 JSON comment 自引用**（不是 main.rs 残留；main.rs 已由 root 在工作区改为 release 走 `verify_pack_embedded`）。处理：① 信任根 comment 不再引用 flag 字面量；② gate 增加“忽略内嵌信任根 JSON 字节范围内命中”的逻辑（self-test 25 例，含该场景）；③ 重编 Windows release 后 exe 扫描应无命中。

## 9. `main.rs` / `tauri.conf.json` 接入指引（owner: root；tauri.conf 属 task-42 scope，本任务不改）

### 9.1 main.rs：删除 release 的运行时信任根覆盖

目标静态检查（release 二进制不应再含这些串）：

```bash
grep -nE 'dev-public|--dlc-key|P0_PACKS_DIR' app/tauri/src-tauri/src/main.rs
# 期望：只在 #[cfg(debug_assertions)] 块内出现，或完全不存在
node scripts/verify-dlc-trust.mjs --exe app/tauri/src-tauri/target/release/desktop-games-tauri.exe
# 期望：release exe scan ok
```

建议改法（示意，root 按实际代码风格调整）：

```rust
#[derive(Default)]
struct DlcConfig { packs_dir: Option<PathBuf> }   // 不再持有 key_pem

fn resolve_packs_dir(app: &tauri::AppHandle, args: &[String]) -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    {
        if let Some(dir) = args.iter().find_map(|arg| arg.strip_prefix("--packs-dir=")) {
            return Some(PathBuf::from(dir));
        }
        if let Ok(dir) = std::env::var("P0_PACKS_DIR") {
            return Some(PathBuf::from(dir));
        }
    }
    let _ = args;
    // 安装版无参数：仍然使用资源目录里的 packs/ 作为“内容目录”
    app.path().resource_dir().ok().map(|dir| dir.join("packs")).filter(|dir| dir.is_dir())
}

#[cfg(debug_assertions)]
fn dev_public_key_pem(packs_dir: Option<&Path>) -> String {
    packs_dir
        .map(|root| root.join("keys/dev-public.pem"))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default()
}

#[cfg(not(debug_assertions))]
fn dev_public_key_pem(_: Option<&Path>) -> String { String::new() }
```

- 删除 `--dlc-key=` 的解析与 `key_path/key_pem` 初始化（release 不再需要，debug 由 `packs/keys/dev-public.pem` 读取）。
- `dlc_verify` 命令里：
  - 短期兼容：`let pack = dlc_verify::verify_pack(&dir, &dev_public_key_pem(config.packs_dir.as_deref()))?;`（release 下库会忽略该 PEM，只用内置根；debug 下保持原行为）。
  - 推荐最终形态：release 直接 `dlc_verify::verify_pack_embedded(&dir)`；debug 分支用 `verify_pack_dev`。
- `--packs-dir`/`P0_PACKS_DIR` 在 release 只剩“内容目录覆盖”，不再是信任根；按审计要求 release 也不应接受（用 `#[cfg(debug_assertions)]` 包住即可，便携版仍可显式传 `--packs-dir` —— 这点需产品确认：若便携版必须保留内容目录覆盖，则保留但明确它**不是**信任根；发布 gate 的 exe 扫描会把该字符串视为待确认项，root 可在 main.rs 里改成仅接受编译期常量路径或加 `--qa@@ 且 release 拒绝）。
- 可选：新增 `#[tauri::command] fn dlc_trust_info() -> Result<serde_json::Value, String>` 返回 `embedded_trust_root()?.summary()`，供支持/诊断；按 task-42 的窗口 ACL 限制到 `main` 窗口。

> 注意：`tauri.conf.json` 的 `bundle.resources` 仍会把整个 `packs/` 复制进安装包（含 `packs/keys/dev-public.pem`）。release 已不把它当信任根（库层忽略），所以**不是** P1-1 的必要条件，但审计验收要求“安装后 packs/keys 不需要”。建议后续任务（cross-scope）二选一：
>
> - **推荐**：把 dev 公钥移出 packs（如 `native/dlc-verify/dev/dev-public.pem`），同步改 `scripts/test-dlc-rust.sh`、`scripts/verify-pack.ts` 默认参数、`tests/host.test.ts:47`、`tests/pack.test.ts:157`；这样 `packs/keys` 目录消失，安装包自然不带 key。
> - 或：接受 dev 公钥随包（它是公钥，无秘密），但文档需说明“仅开发用、release 不信任”，并在下一次 public-boundary 清理中移除。
>
> 另：NSIS 若为 `currentUser` 安装（`tauri.conf.json` 未设 `installMode`），安装目录用户可写会削弱“内容目录不可替换”的纵深防御；即使信任根内置，仍建议机器级安装或 ACL 收紧（task-42/46）。


---

## 10. 验收对照（审计 §10.2 P1-1 + 本任务附加项）

| 验收条目 | 状态 | 证据/剩余动作 |
|---|---|---|
| release 构建不再从 `packs/` 读信任根 | 🟡 库层完成 / main.rs 待改 | 库：`verify_pack` 在 release 忽略 key_pem，只用 `include_str!` 内置根（单测+release CLI 实测）。main.rs 仍读取并传入，但已**不能影响信任判定**；root 删除后 exe 扫描才会转绿 |
| `--dlc-key` / `P0_PACKS_DIR` 在 release 无效 | 🟡 库层完成 / main.rs 待改 | 同上；gate 的 exe 扫描当前实测命中这 3 个串（§11.6） |
| dev-only pack 被 release 拒绝 | ✅ | release CLI 对 `packs/farm-seasons` 返回 `ok:false`；dev-trust 构建下才通过（§11.3）；Rust 门禁单测 `embedded_verifier_rejects_*` |
| 私钥 ACL/保管流程有书面记录 | 🟡 文档就绪 / 待 owner 执行 | §5 runbook；§5.5 registry 待 owner 填写 |
| key id / 轮换 / 吊销 / 多公钥白名单 | ✅ | signature.json + active/retired/revoked + notBefore/notAfter；Rust 19 单测、Node 24 自测（§11） |
| 发布门禁（校验信任根/包签名/禁止随包密钥/扫描 exe） | ✅ 机制完成；接入有 3 缺口 | scripts/verify-dlc-trust.mjs；release-win 已接线；缺口见 §8 |
| cargo test -p dlc-verify + npm test 通过 | ✅（P2-3 未含在内） | §11：19/19、949/949 |
| 安装后 packs/keys 可删除而功能不降级 | 🟡 待 tauri.conf/资源清理 | release 已不读它；但安装包仍会带（tauri.conf resources 整目录），见 §9.2 |
| 文档/仓库无明文私钥 | ✅ | git status 仅新增公钥信任根/README；本任务未生成任何生产私钥 |

**P1-1 结论**：代码侧关闭；整体状态 = **未关闭（发布阻断）**，阻断项 = B1（生产密钥 ceremony）、B2（main.rs）、B3（tauri.conf resources）。B4/B5 若不修，gate 会持续 fail-closed（这是正确的安全姿态，不是 bug）。

---

## 11. 验证记录（实际执行，2026-11-19 09:20–09:45 UTC+8）

环境：WSL2 Ubuntu on Windows；rustc 1.99.1 / cargo 1.99.1（$HOME/.cargo/bin）；node v24.22.1；仓库 <private-path> commit/push。

### 11.1 Rust 单测（debug + release）

```text
$ cargo test --manifest-path native/dlc-verify/Cargo.toml
running 19 tests ... test result: ok. 19 passed; 0 failed
$ cargo test --release --manifest-path native/dlc-verify/Cargo.toml
running 19 tests ... test result: ok. 19 passed; 0 failed
$ cargo clippy --manifest-path native/dlc-verify/Cargo.toml --all-targets -- -D warnings
Finished (no warnings)
```

覆盖：信任根 schema/重复 keyId/指纹不匹配/dev 指纹拒绝/日期窗口/active 接受/retired 接受/revoked 拒绝/未知 keyId/legacy 策略/降级（signature.json 无效不回退）/tamper manifest/tamper content/空信任根 fail-closed/embedded 拒绝 dev 包/签名信封未知字段/epoch 日期。

### 11.2 Rust 集成检查（release 与 dev 双模式）

```bash
$ bash scripts/test-dlc-rust.sh
== cargo test ...                                       19 passed
== build release verifier (compiled-in production trust root)
== compiled-in trust root summary
   "devOverrideAvailable": false ; "trustRoot": { "active": [] ... }
== dev-signed pack must be REJECTED by the release verifier (P1-1)      OK
== release verifier must reject a runtime public-key override           OK
== build dev-trust verifier (explicit local QA feature)
== valid dev pack
   "ok": true ; "keyId": "dlc-dev-local" ; "keyFingerprintSha256": "f510e186...a19f800" ; "trustSource": "dev-key"
== tampered content        OK hash mismatch
== tampered manifest       OK signature is invalid
== release DLC trust gate self-test   24 passed, 0 failed
all Rust DLC checks passed
```

### 11.3 发布门禁自测与当前（预期 fail-closed）状态

```bash
$ node scripts/verify-dlc-trust.mjs --self-test
self-test: 24 passed, 0 failed

$ node scripts/verify-dlc-trust.mjs --report-only --allow-empty-trust-root
[dlc-trust] keys: active=[] retired=[] revoked=[]
[dlc-trust] warn: no usable ACTIVE production signing key ...
[dlc-trust] warn: repo packs/keys contains the tracked dev public key; release staging must exclude it
[dlc-trust] FAIL: packs/farm-seasons: pack has legacy signature.txt but no signature.json ...
[dlc-trust] FAIL: packs/reef-pack: ...
[dlc-trust] FAILED (report-only)          # 这是 P1-1 期望的 fail-closed 状态

$ node scripts/verify-dlc-trust.mjs        # 无 --report-only
exit code 1（阻断）
```

### 11.4 make-pack -> 生产信封 -> 门禁端到端（临时测试密钥，仅在 /tmp，测试后删除）

为验证“真实生产路径”而不触碰真实私钥：在 /tmp 生成一次性 Ed25519 测试密钥（公钥指纹仅公开信息；私钥未打印、未写入仓库、测试后随临时目录删除）。

```bash
# dev 信封
$ node scripts/make-pack.ts /tmp/.../packs/farm-seasons --key-id dlc-dev-local
signed farm-seasons@1.0.0 with keyId=dlc-dev-local
envelope schema=1 algorithm=ed25519 keyId=dlc-dev-local sigBytes=64

# 生产-like 信封（keyId + 信任根 active + 指纹匹配检查；加密私钥 + 环境变量密码）
$ DLC_SIGNING_KEY_PASSPHRASE=... node scripts/make-pack.ts /tmp/.../packs/farm-seasons \
    --key-id dlc-prod-test-01 --key /tmp/.../prod-private.pem --trust-root /tmp/.../root.json
make-pack: keyId dlc-prod-test-01 fingerprint 52ec1a5e... (matches trust root)
signed farm-seasons@1.0.0 with keyId=dlc-prod-test-01

$ node scripts/verify-dlc-trust.mjs --trust-root /tmp/.../root.json --packs-dir /tmp/.../packs
[dlc-trust] keys: active=[dlc-prod-test-01] ...
[dlc-trust] packs: 1/1 verified against the compiled-in trust root ...
[dlc-trust] ok

# 负例
tamper content.json  -> gate exit 1，hash mismatch                    OK
未知 keyId           -> make-pack 拒绝 "not present in ..."           OK
私钥与 trust root 指纹不匹配 -> make-pack 拒绝                          OK
错误 DLC_SIGNING_KEY_PASSPHRASE -> make-pack 拒绝 "cannot decrypt ..." OK
```

### 11.5 JS/TS/仓库测试与检查

```bash
$ node --check scripts/verify-dlc-trust.mjs          # syntax ok
$ bash -n scripts/test-dlc-rust.sh                  # syntax ok
$ node --import tsx scripts/verify-pack.ts packs/farm-seasons packs/keys/dev-public.pem
{ "ok": true, "id": "farm-seasons", ... }           # 既有 TS dev loader 未受影响
$ npm test
tests 949  pass 949  fail 0                          # 全量（含其它并行任务改动，跑于 09:35 左右）
$ node node_modules/typescript/bin/tsc --noEmit \
    --target ES2022 --module ESNext --moduleResolution bundler --strict \
    --noUncheckedIndexedAccess --skipLibCheck --allowImportingTsExtensions --types node scripts/make-pack.ts
# exit 0（本任务脚本类型正确）
$ npm run typecheck
src/pet/consent/runtime.ts(156,36): error TS2558   # 并行任务 task-43 的在途改动，不是本任务文件
```

说明：仓库级 npm run typecheck 在 09:30 前后本任务脚本通过；09:38 再次运行时出现的是 src/pet/consent/runtime.ts（consent-gate-resolve 任务在途）的错误，本任务未触碰该文件。最终合并前应由 lead 在全部并行任务落盘后重跑 npm run typecheck / npm test。

### 11.6 现有 Tauri release exe 扫描（证明 main.rs 未改完）

```bash
$ node scripts/verify-dlc-trust.mjs --exe app/tauri/src-tauri/target/release/desktop-games-tauri.exe --report-only --json
"exe": { "ok": false, "found": ["--dlc-key", "P0_PACKS_DIR", "dev-public"], "bytes": 12679168 }
```

> 该 exe 是 2026-11-19 09:28 的本机构建产物；命中说明 **main.rs 仍把信任根覆盖编译进 release**（§9 B2）。root 完成 §9.1 后此扫描应转 ok，且 release 二进制不应再出现 dev 公钥/覆盖开关。

### 11.7 未验证项（诚实声明）

- 未在 Windows 上用 MSVC 重新构建 Tauri app 并做真机安装（本 WSL 环境无 WebKit/GTK 构建链；root/auth 在 Windows 构建）。库层 API 向后兼容（verify_pack(dir,&str) 与 VerifiedPack 原字段保留），main.rs 不改也能编译。
- 未执行真实生产签名（无生产私钥，且本任务禁止生成/写入凭据）。
- 未运行 NSIS 打包/安装后 “删除 packs/keys 仍可用” 的安装器级验证（依赖 §9.2 的 cross-scope 清理）。

---

## 12. 剩余风险与发布阻断项

### 12.1 阻断项（P1-1 关闭前必须完成）

| # | 阻断项 | owner | 完成标准 |
|---|---|---|---|
| B1 | 生产 Ed25519 密钥生成/双人保管/公钥写入 production-trust-root.json（status=active） | owner（项目负责人） | §5 执行 + §5.5 registry 记录 + gate 报 active key；私钥不在仓库/CI |
| B2 | main.rs 删除 release 的 --dlc-key/P0_PACKS_DIR 信任根读取；dlc_verify 改用内置根/嵌入式 API | root | §9.1；release exe 扫描无 3 个串；release 构建可加载生产签名 pack、拒绝 dev 签名 pack |
| B3 | tauri.conf resources 不再分发 packs/keys（或把 dev 公钥移出 packs）；安装后删除 keys 不影响功能 | task-42/后续任务（cross-scope） | §9.2；NSIS 安装目录检查无 .pem；文档说明 |
| B4 | release-win staging 排除 packs/keys；release.yml 加 --require-dlc-trust；portable README 修正 | authenticode-resolve/lead | §8 三个缺口；gate 在 staged 树通过；release 无法静默跳过 gate |
| B5 | 用生产密钥重签 packs/farm-seasons、packs/reef-pack（生成 signature.json） | owner/发布执行人 | §5.3；gate packs N/N verified；旧 dev 签名包不再出现在发布物 |

### 12.2 非阻断但已知风险

| # | 风险 | 影响 | 建议 |
|---|---|---|---|
| R1 | 吊销/移除只对更新后的客户端生效；无 updater（P2-7） | 泄露后旧安装仍信任旧 key | task-46 + SECURITY.md 通知流程；重大泄露时下线 DLC |
| R2 | 旧二进制无 key 移除感知 | 同上 | 版本策略：保留 retired 至少一个版本周期 |
| R3 | 信任根更新 = 重新编译/发布 | 不能热修信任根 | 设计如此（防运行时覆盖）；紧急吊销走紧急版本 |
| R4 | app/electron/main.ts 仍从 packs/keys/dev-public.pem 读 dev 信任根 | 仅开发宿主（非发布 app）；若未来打包 Electron 版会成为同类漏洞 | 后续迁移到内置根/同一策略；当前发布链是 Tauri |
| R5 | src/pack/loader.ts（Node/Electron）仍只读 signature.txt + 调用方 PEM | 开发工具链；不参与生产判定 | 若要统一，后续把 TS loader 也接信任根（cross-scope src/pack） |
| R6 | P2-3（Rust 路径/大小/schema 硬化）仍未完整实现 | 有效签名者/本地恶意 pack 仍可路径越界/IO 放大 | 单独任务；本任务只加了签名文件大小上限、门禁侧 path/hash/size 检查 |
| R7 | 发布物无 Authenticode、SHA256SUMS 未签名（P2-7） | 用户可能运行被替换的 exe（gate 只保护内容签名，不证明二进制来源） | task-46 |
| R8 | 仓库根目录 packs/keys/dev-public.pem 仍 tracked | 混淆“生产信任根”语义；安装包仍可能带公钥 | §9.2 清理 |
| R9 | 文档（SECURITY.md / RELEASE-RUNBOOK / THIRD-PARTY / docs/modding）尚未并入本方案 | 用户/发布者看不到新信任根语义 | lead 合并本文件摘要；参考 §13.2 建议段落 |
| R10 | 多 agent 并发修改 docs/scripts | 合并冲突/临时红 | lead 最终统一跑 preflight/npm test/typecheck |

### 12.3 明确“不是本任务能关”的项

- P1-2（命令 ACL）、P1-3（innerHTML/内容校验）、P1-4（consent 门）：其它 task。
- P2-7（Authenticode/updater）：task-46。
- P0 升级链：在 B1/B2 完成且 P1-2/P1-3 未修前，内容信任链已不再依赖 dev key，但若生产私钥泄露且 P1-2/P1-3 仍在，仍可能被利用；三者要一起在发布前清零。

---

## 13. 回滚与交接

### 13.1 回滚本任务

- 回滚文件：native/dlc-verify/{Cargo.toml,src/lib.rs,src/main.rs,trust/**}、scripts/{make-pack.ts,test-dlc-rust.sh,verify-dlc-trust.mjs}、本文件。
- 回滚后 release 行为回到“从 packs/keys 读 dev 公钥 + 可被 --dlc-key 覆盖”（即 P1-1 漏洞重现）——只允许在紧急开发环境回滚，不得用于发布。
- 数据/存档/内容 ABI 无变化（manifest schema/save schema/contentApi 均未改）；不需要迁移。
- 若已用生产 key 发布过内容：不要回滚到不含该生产 key 的二进制（会导致内容验签失败）；应向前修复（保留信任根条目，回滚其它代码）。
- 本任务未 commit/push；工作区改动见 git status。

### 13.2 给 lead 合并文档的建议段落（cross-scope，本任务未改）

- SECURITY.md：新增 “DLC content signing trust root” 段：keyId/fingerprint 表（§5.5）、信任根编译期内置、release 不接受 --dlc-key/P0_PACKS_DIR、漏洞报告联系人、吊销流程链接本文件。
- docs/RELEASE-RUNBOOK.md §8：加 “DLC 信任根 ceremony / 轮换 / 吊销” 小节，指向本文 §5–§7；发布前 node scripts/verify-dlc-trust.mjs + --require-dlc-trust。
- THIRD-PARTY.md 第 121 行 “签名开发密钥（公钥）” 改注：dev key 仅开发/预览用，release 使用编译期内置生产根，dev key 被 release 拒绝。
- docs/modding/SECURITY.md §37 “生产私钥离线保管、可吊销” 从“未实现”更新为“已实现机制，待 owner ceremony”（B1 后改为已完成）。
- portable README（§8 第 3 点）。
- README.md / 下载页：仅当 B1–B5 完成后才可写 “signed DLC content”；否则写 “dev-signed preview content”。

### 13.3 交接清单（给人/下一个 agent）

1. 先读本文件 §0/§12。
2. B1 owner ceremony -> §5；完成后把 §5.5 表填好，跑 §5.4。
3. B2 root 按 §9.1 改 main.rs -> 重编 Windows release -> §11.6 的 exe 扫描转 ok。
4. B4 auth 按 §8 修 staging/require/README。
5. B5 重签 packs；跑 gate（repo + staged）与 §5.4 全套。
6. lead 合并 §13.2 文档；在 Windows 构建机上跑 npm run typecheck、npm test、bash scripts/test-dlc-rust.sh、node scripts/verify-dlc-trust.mjs、release-win.mjs --plan。
7. 发布后把 key registry + 首次 ceremony 日期写进 SECURITY.md/发布记录。

---

## 附录 A：信任根 schema 示例（一 active + 一 retired + 一 revoked）

```json
{
  "schema": 1,
  "comment": "Production DLC signing trust root (public keys only).",
  "policy": { "allowLegacySignatureWithoutKeyId": false, "maxSignatureBytes": 8192 },
  "keys": [
    {
      "keyId": "dlc-prod-2027-01",
      "algorithm": "ed25519",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
      "fingerprintSha256": "<64 hex>",
      "status": "active",
      "notBefore": "2027-01-01",
      "comment": "next production key"
    },
    {
      "keyId": "dlc-prod-2026-01",
      "algorithm": "ed25519",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
      "fingerprintSha256": "<64 hex>",
      "status": "retired",
      "notAfter": "2027-06-30",
      "comment": "previous production key, still verifies old packs"
    },
    {
      "keyId": "dlc-prod-2025-01",
      "algorithm": "ed25519",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
      "fingerprintSha256": "<64 hex>",
      "status": "revoked",
      "revokedAt": "2026-03-01",
      "revocationReason": "key compromise"
    }
  ]
}
```

## 附录 B：命令速查

```bash
# 单测 / Rust 集成（含 release + dev 双模式）
cargo test --manifest-path native/dlc-verify/Cargo.toml
bash scripts/test-dlc-rust.sh

# 门禁自测 / 常规报告 / 发布（无参数 + release 模式）
node scripts/verify-dlc-trust.mjs --self-test
node scripts/verify-dlc-trust.mjs --report-only
DLC_TRUST_RELEASE=1 RELEASE_VERSION=$(node -p "require('./package.json').version") \
  node scripts/verify-dlc-trust.mjs

# 指定 staged 树 / exe（release-win 当前调用方式）
node scripts/verify-dlc-trust.mjs --packs-dir <staged>/packs --exe <staged>/DesktopGames.exe

# 签名（dev）
node scripts/make-pack.ts packs/farm-seasons
# 签名（生产；密码用环境变量，避免 argv/history）
read -r -s -p 'DLC signing passphrase: ' DLC_SIGNING_KEY_PASSPHRASE; export DLC_SIGNING_KEY_PASSPHRASE
node scripts/make-pack.ts packs/farm-seasons --key-id dlc-prod-2026-01 \
  --key /secure/dlc-keys/dlc-prod-2026-01.private.pem \
  --trust-root native/dlc-verify/trust/production-trust-root.json
unset DLC_SIGNING_KEY_PASSPHRASE

# 本地 dev 验签器（显式 feature；不得用于发布 app 构建）
cargo build --release --features dev-trust --manifest-path native/dlc-verify/Cargo.toml
native/dlc-verify/target/release/dlc-verify packs/farm-seasons packs/keys/dev-public.pem
```

## 附录 C：门禁退出码/环境变量

| 项 | 语义 |
|---|---|
| exit 0 | pass（或 --report-only） |
| exit 1 | gate 失败：无 active 生产 key / 包验签失败 / 随包密钥 / exe 仍含覆盖串 / 信任根非法 |
| exit 2 | 参数错误 |
| DLC_TRUST_RELEASE=1 | release 模式：自动扫描默认 release exe（app/tauri/src-tauri/target/release/desktop-games-tauri.exe） |
| DLC_TRUST_EXE | 指定要扫描的 exe 路径 |
| RELEASE_VERSION | 仅回显到报告（releaseVersion） |
| --trust-root / --packs-dir / --exe / --json / --report-only / --allow-empty-trust-root / --require-packs | 见 --help |

---

### 附：本任务实际改动文件

```text
 M native/dlc-verify/Cargo.toml
 M native/dlc-verify/src/lib.rs
 M native/dlc-verify/src/main.rs
 M scripts/make-pack.ts
 M scripts/test-dlc-rust.sh
?? native/dlc-verify/trust/README.md
?? native/dlc-verify/trust/production-trust-root.json
?? scripts/verify-dlc-trust.mjs
?? docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md
```

（scripts/release-win.mjs / .github/workflows/release.yml 的改动来自 authenticode-resolve/task-46，不是本任务；本任务只在 §8 给接入建议。）

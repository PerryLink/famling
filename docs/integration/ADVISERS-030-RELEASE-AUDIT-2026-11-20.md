# ADVISERS-030-RELEASE-AUDIT — Advisers 0.3.0 发布审计（npm registry / tag / provenance / CI / 文档）

| 项目 | 内容 |
|---|---|
| 状态 | 只读审计 + 单文件产出；**未改代码/JSON/资产、未 git commit/push、未执行任何 npm publish/stage/approve、未触发任何发布动作**；本文件是唯一写入 |
| 审计时间 | 2026-11-20 19:45–20:05 +08（各实测时间戳见正文） |
| 审计基线（desktop-games） | HEAD `47438ac`；审计开始时工作树另有 3 项与本审计无关的既有改动（`docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md`、`docs/research/COMPETITORS-CHINA-DSH.md` 已修改；`docs/art/CALIBRATION-SET-2026-11-16.md` 未跟踪），本审计未触碰 |
| 审计基线（Advisers 仓库） | `/mnt/d/Projects/dsh/plugins/advisers`；HEAD `e3f440d`（docs-only，已推送 origin/main）；发布 tag `v0.3.0` = annotated tag object `f3ac009` → commit `1199fbf`；`v0.2.4` = tag object `ee426aa` → commit `580c177`（未发布） |
| 远端 | GitHub `PerryLink/advisers`（本机 origin 经 gh-proxy）：main = `e3f440d`，tag `v0.3.0^{}` = `1199fbf`；GitCode 镜像同；Gitee 镜像无法公开验证（见 P3-3） |
| 环境 | WSL2；Node `v24.22.1`；npm `11.19.1`；npm 默认 registry = `https://registry.npmmirror.com`（**本机镜像滞后**）。本审计所有 npm/registry 查询均显式使用 `--registry=https://registry.npmjs.org/` 或直接 `curl https://registry.npmjs.org/` |
| 边界 | 只读；外部查询只用 HTTPS（registry.npmjs.org / api.github.com）；临时文件在 `/tmp/adv030-audit/`（仓库外，可重取）；未打印任何凭据；外部返回只当数据；未伪造真机/外网/发布动作 |

> 结论先行：**0.3.0 已真实发布且可验证**——六个发布包全部 `latest` = `0.3.0`，`dist.attestations` 非空，provenance subject sha512 与 registry `dist.integrity` 六包全部相等，`gitHead` 全部 = tag commit `1199fbf`；本机用官方 registry 复跑 `scripts/verify-release.mjs` 得到 **222 checks PASS**（与仓库/发布声明一致），`check-provenance` 108 checks PASS，`npm audit signatures` 实测 237 个 registry 签名、15 个已核验 attestations。本地 HEAD `e3f440d` 相对 tag 只多 1 个 docs commit（18 个文档文件，**无运行时变更**）。发现的问题都在文档/声明层（P2×3、P3×7），**无 P0/P1**。

---

## 0. 结论（先看）

1. **npm 发布成立**：`advisers`、`advisers-core`、`advisers-office`、`advisers-policy-strict`、`advisers-bridge-hermes`、`dsh-advisers` 六个包在 `https://registry.npmjs.org/` 的 `dist-tags.latest` 均为 `0.3.0`，发布时间 2026-11-20T08:58:35Z–09:02:41Z；`gitHead` 六包全部 `1199fbfe79ef70dcb013775549de450c8a864aac`。
2. **lockstep 成立**：八个 workspace 包（6 个公开 + 2 个 private `advisers-link-email`/`advisers-link-feishu`）版本全部 `0.3.0`；8 个内部 workspace pin 与 3 个版本常量经仓库自带 `check-release.mjs` 全部 PASS；`pnpm-lock.yaml` 的 importer pin 也是 `0.3.0`。
3. **provenance 成立**：六包各有 2 条 attestation（npm publish/v0.1 + SLSA provenance v1）；逐包解包 DSSE 后，SLSA statement 的 subject sha512（hex）与 registry `dist.integrity`（base64）**六包全部相等**；来源仓库 `https://github.com/PerryLink/advisers`、workflow `.github/workflows/publish.yml`、`resolvedDependencies[0].digest.gitCommit = 1199fbf`、event `workflow_dispatch`、GitHub-hosted runner、invocationId = `actions/runs/44706254171/attempts/1`。
4. **tag/commit 一致**：annotated tag `v0.3.0`（object `f3ac009`，tagger 时间 2026-11-20T08:27:06Z，message `Advisers 0.3.0`）指向 commit `1199fbf`；GitHub 远端 peeled ref 同 `1199fbf`，GitHub Release（id 452473164，draft=false，prerelease=false，published_at 2026-11-20T09:08:18Z）存在；GitCode 镜像 main/tag 同。
5. **本地仓库只多 docs commit**：HEAD `e3f440d` = tag commit + 1 个 commit（`docs(release): mark 0.3.0 published and record provenance verification`，2026-11-20 17:17:42 +08），`git diff v0.3.0..HEAD` 只有 18 个文档文件（+246/−185），**不含 `packages/**/lib`、`src`、`bin`、`scripts`、`.github/workflows`**；origin/main 也是 `e3f440d`，CI run #115 成功。
6. **声明可复现**：本机复跑 `node scripts/verify-release.mjs --version 0.3.0 --tag latest --sbom artifacts/sbom.cdx.json --require-sbom --registry https://registry.npmjs.org/` → **PASS release verification: 222 checks**（含 tarball sha1/sha512、attestation subject、gitHead、license、SBOM、干净前缀 install/import smoke）；`check-provenance.mjs` → 108 checks PASS（1 skipped，未传 --sbom）；`npm audit signatures` → 237 packages verified registry signatures / 15 packages have verified attestations。
7. **0.3.0 兼容性/需动作**：CHANGELOG 的 Compatibility 段声明 schema **v21（v20 之上的 additive 迁移）**、exit code 仍为 0/1/3（4/5/6 保留未启用）、evidence/receipt pack 仍 v1/v1.1（新增 verifier 资源上限会拒绝畸形/超大 pack）、MCP legacy 握手兼容、JSON 只增字段。真正的「需要动作」是 **TOS/PRIVACY/DISCLAIMER/SAFETY v2026.11.3 重新同意**（旧 v2026.11.2 consent 不被视为有效）与 **receipt verifier 新硬上限**；另 0.2.4 的 Windows durable-fsync / 逐 item secrecy 工作作为 0.3.0 基线一并交付（0.2.4 从未发布）。
8. **问题分级**：P0 = 0，P1 = 0；P2 = 3（均为已发布/对外文档与声明不一致，无运行时或供应链风险）；P3 = 7（provenance ref、next tag、镜像、门禁语义、release notes 命令、Release 无资产、未来 engines.dsh 范围）。详见 §5。

---

## 1. npm raw registry 证据

### 1.1 六个发布包 0.3.0（2026-11-20 19:47–19:50 +08 实测）

| 包 | latest | next | 0.3.0 发布时间（UTC） | gitHead | fileCount | unpackedSize | shasum | signatures | attestations |
|---|---|---|---|---|---:|---:|---|---:|---|
| `advisers` | 0.3.0 | 0.2.3 | 2026-11-20T09:01:37.324Z | `1199fbfe79ef…` | 70 | 1763166 | `77cd526ca1605c0247940896c02cd42c8ea3a8d4` | 2 | SLSA provenance v1 |
| `advisers-core` | 0.3.0 | 0.2.3 | 2026-11-20T08:59:47.826Z | `1199fbfe79ef…` | 61 | 253208 | `6191edb17f755ad37fad0451f6b07dd93c7741b7` | 2 | SLSA provenance v1 |
| `advisers-office` | 0.3.0 | 0.2.3 | 2026-11-20T08:58:53.714Z | `1199fbfe79ef…` | 53 | 179391 | `8d72e7b04d4c94672b294b922764b1f54ce88bd6` | 2 | SLSA provenance v1 |
| `advisers-bridge-hermes` | 0.3.0 | 0.2.3 | 2026-11-20T08:58:40.815Z | `1199fbfe79ef…` | 9 | 29422 | `113f1e88d03c435582668480c4bb843b1059e89d` | 2 | SLSA provenance v1 |
| `advisers-policy-strict` | 0.3.0 | 0.2.3 | 2026-11-20T08:58:35.086Z | `1199fbfe79ef…` | 9 | 14354 | `24de5d5d1c4f226fd2c92c05f458d46672a1529f` | 2 | SLSA provenance v1 |
| `dsh-advisers` | 0.3.0 | 0.2.3 | 2026-11-20T09:02:41.842Z | `1199fbfe79ef…` | 8 | 70893 | `828338aa828e76c2ce2b84fc9607df1f6af37971` | 2 | SLSA provenance v1 |

- 六个 `gitHead` 全文均为 `1199fbfe79ef70dcb013775549de450c8a864aac`（与 tag commit 一致）。
- 六个 `dist.attestations.provenance.predicateType` 均为 `https://slsa.dev/provenance/v1`，`dist.attestations.url` 非空；每个包另有 `dist.signatures` 2 条。
- `next` 在六个包上都停在 `0.2.3`（不是 0.3.0），与 CHANGELOG/README 的明确说明一致（见 P3-2）。

### 1.2 本机 npm CLI 镜像滞后的实测（不是发布缺陷）

```text
# 默认 registry（npmmirror）：
$ npm view advisers dist-tags --json
{ "latest": "0.2.3", "next": "0.2.3" }
# 官方 registry：
$ npm view advisers dist-tags --json --registry=https://registry.npmjs.org/
{ "latest": "0.3.0", "next": "0.2.3" }
```

本机 `npm config get registry` = `https://registry.npmmirror.com`，其缓存尚未同步 0.3.0。这与 lead 提示一致：**判断 npm 是否发布必须以 `registry.npmjs.org` 原始文档为准**，本审计全部查询已这样做。

### 1.3 八个 workspace 包与 lockstep 证据

| 目录 | 包名 | 版本 | 发布 |
|---|---|---|---|
| `packages/advisers` | `advisers` | 0.3.0 | 是 |
| `packages/core` | `advisers-core` | 0.3.0 | 是 |
| `packages/office` | `advisers-office` | 0.3.0 | 是 |
| `packages/policy-strict` | `advisers-policy-strict` | 0.3.0 | 是 |
| `packages/bridge-hermes` | `advisers-bridge-hermes` | 0.3.0 | 是 |
| `packages/dsh-advisers` | `dsh-advisers` | 0.3.0 | 是 |
| `packages/link-email` | `advisers-link-email` | 0.3.0 | 否（`private: true`，registry 404） |
| `packages/link-feishu` | `advisers-link-feishu` | 0.3.0 | 否（`private: true`，registry 404） |

- 8 个内部 workspace pin：`advisers` 3 条（core、policy-strict、peer office）、`dsh-advisers` 3 条（advisers、core、office）、`advisers-bridge-hermes` 1 条（core）、`advisers-policy-strict` 1 条（core）；`check-release.mjs` 全部 PASS。
- 3 个版本常量：`packages/advisers/index.js`、`packages/dsh-advisers/index.js`、`packages/bridge-hermes/src/index.ts`；`check-release.mjs` 全部 PASS。
- `pnpm-lock.yaml` importer 的 `specifier: 0.3.0` + `version: link:../core` 等已跟随（例如 `packages/advisers` 段 0.3.0 的 link pin）。
- 两个 private 包 registry 返回 404（按预期不发布）。

### 1.4 0.2.4：tag 存在，但 npm 上确实没有

- 六个包的 registry `versions` 列表均**不含 `0.2.4`**（历史版本止于 `0.2.3`，随后直接 `0.3.0`）。
- 仓库里 `v0.2.4` 是 annotated tag object `ee426aa` → commit `580c177`（`fix(release): dry-run must not require a stage id`，2026-11-19 12:40:47 +08），GitHub 远端也存在 peeled `580c177`。
- 结论与 README/CHANGELOG 一致：0.2.4 是「已打 tag、从未发布、被 0.3.0 取代」的 candidate；用户不应尝试安装 0.2.4。

---

## 2. provenance / attestations 核验

### 2.1 attestation 内容（以 `advisers@0.3.0` 为例）

- `dist.attestations.url` = `https://registry.npmjs.org/-/npm/v1/attestations/advisers@0.3.0`；返回 2 条：`https://github.com/npm/attestation/tree/main/specs/publish/v0.1` 与 `https://slsa.dev/provenance/v1`。
- 解 `dsseEnvelope.payload`（base64 → in-toto Statement v1）后关键字段：

```json
{
  "subject": [{ "name": "pkg:npm/advisers@0.3.0",
               "digest": { "sha512": "0b2e5d555d770a10f6bc8a934b18db33f11ea247d4376dd18b562078a5123e58…" } }],
  "predicateType": "https://slsa.dev/provenance/v1",
  "predicate": {
    "buildDefinition": {
      "buildType": "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
      "externalParameters": { "workflow": {
        "ref": "refs/heads/main",
        "repository": "https://github.com/PerryLink/advisers",
        "path": ".github/workflows/publish.yml" } },
      "internalParameters": { "github": { "event_name": "workflow_dispatch",
        "repository_id": "1452751737", "repository_owner_id": "255665900" } },
      "resolvedDependencies": [{ "uri": "git+https://github.com/PerryLink/advisers@refs/heads/main",
        "digest": { "gitCommit": "1199fbfe79ef70dcb013775549de450c8a864aac" } }]
    },
    "runDetails": {
      "builder": { "id": "https://github.com/actions/runner/github-hosted" },
      "metadata": { "invocationId": "https://github.com/PerryLink/advisers/actions/runs/44706254171/attempts/1" }
    }
  }
}
```

> 注意 `workflow.ref` 是 `refs/heads/main` 而不是 `refs/tags/v0.3.0`；因为 build commit 就是 tag commit `1199fbf`，内容绑定仍然成立，但严格意义上的「从 tag ref 构建」未被 attestation 记录（见 P3-1）。

### 2.2 subject sha512 与 registry tarball integrity：六包全部相等

对六包逐包：解码 SLSA statement → 取 `subject[0].digest.sha512`（hex）→ 转 base64 → 与 registry `dist.integrity` 的 `sha512-…` 比较。结果：**6/6 match=true**；同时 `advisers-0.3.0.tgz` 本地下载后 sha512 也等于该 integrity（`sha512-Cy5dVV13ChD2vIqTSxjbM/EeokfUN23Ri1YgeKUSPlhHQDjPp+aMQr8p40iLFiAYtaknNekktjGvX+b6QGm80g==`），sha1 = `77cd526ca1605c0247940896c02cd42c8ea3a8d4` 与 `dist.shasum` 相等。

### 2.3 仓库自带检查的复跑结果

- `node scripts/check-provenance.mjs --version 0.3.0 --registry https://registry.npmjs.org/` → `PASS provenance verification for 0.3.0 (108 checks, 1 skipped)`；skip 项是 `sbom`（未传 `--sbom`，符合脚本设计）；六个包的 source command 均输出 `1199fbf…`（WARN 提示未提供 expected commit，属正常提示）。
- `node scripts/verify-release.mjs --version 0.3.0 --tag latest --sbom artifacts/sbom.cdx.json --require-sbom --registry https://registry.npmjs.org/` → **`PASS release verification: 222 checks`**，包括：六包 `gitHead === release commit`、tarball sha1/sha512、license 字段、LICENSE/NOTICE/THIRD-PARTY-NOTICES 存在、SBOM CycloneDX 1.7、干净临时前缀 `npm install` 后的 `advisers --version` = 0.3.0 与 6 个包的 import smoke。
- 该次运行还输出 WARN：`HEAD e3f440d… is not the release tag commit 1199fbf…; post-release commits are allowed, but no runtime fix may follow the release tag`——与本审计 §3.3 的判断一致（docs-only 后置提交被工具显式允许）。

### 2.4 消费者侧签名/attestation 验证（`npm audit signatures`）

在 `/tmp/adv030-audit/sig` 用官方 registry 安装 `advisers@0.3.0`、`advisers-core@0.3.0`、`advisers-office@0.3.0`、`dsh-advisers@0.3.0`（含依赖共 237 包）后执行：

```text
$ npm audit signatures --registry=https://registry.npmjs.org/
audited 237 packages in 5s
237 packages have verified registry signatures
15 packages have verified attestations
```

这说明除了 npm 元数据 linkage（仓库脚本检查的那一层）之外，npm 消费者侧也能通过 Sigstore 路径核验签名/attestation。注意：`npm audit signatures` 的输出不逐包列出，本次只是整体验证，未做透明日志手工审计。

---

## 3. tag / commit / 仓库一致性

### 3.1 tag v0.3.0

| 项 | 值 |
|---|---|
| 本地 tag 类型 | annotated tag object `f3ac0093271bb1ba4eda99286ac12772a190b8d7` |
| tag message | `Advisers 0.3.0` |
| tagger | `PerryLink <255665900+PerryLink@users.noreply.github.com>`，`2026-11-20T08:27:06Z`（+0800 16:27:06） |
| 指向 commit | `1199fbfe79ef70dcb013775549de450c8a864aac`（`feat(release): owner-authorized direct OIDC publish path (validates pending Trusted Publisher)`，2026-11-20 16:27:06 +08） |
| GitHub 远端 | `refs/tags/v0.3.0` = `f3ac009…`，peeled `refs/tags/v0.3.0^{}` = `1199fbf…` |
| GitCode 镜像 | main = `e3f440d`，tag object = `f3ac009`，peeled = `1199fbf` |

### 3.2 GitHub Release 与发布 workflow run

- Release：`PerryLink/advisers` release id `452473164`，`tag_name=v0.3.0`，`target_commitish=main`，`draft=false`，`prerelease=false`，`created_at=2026-11-20T08:27:06Z`，`published_at=2026-11-20T09:08:18Z`，**assets 为空**（SBOM 未作为 release asset 附上，见 P3-6）。Release body 明确写了 six packages / install / verify provenance / released commit `1199fbf`。
- Workflow run：`44706254171`（`release-gate` run #9，`workflow_dispatch`，head_sha `1199fbf`，conclusion success）；两个 job 均 success：
  - `gate`（08:54:26–08:56:35Z）：`pnpm install --frozen-lockfile`、`pnpm -r --if-present run build` / `typecheck` / `test`、`pack-smoke`、`check-docs`、`check-release --stable --require-tag`、`check-licenses`、`check-tos --release`、`security-suite`、`verify-office`、`check-deps` 全部 success。
  - `trusted-publish-draft`（08:56:37–08:57:36Z，`needs: gate`）：OIDC token endpoint 可达、`release.mjs --dry-run --provenance` 诊断 success、**`Publish directly with Trusted Publishing + provenance (owner-authorized validation)` step success（08:57:03–08:57:33Z）**、stage step skipped（符合本次是 direct publish 的选择）。
- 更早的 `release-gate` run #6/#7/#8 的 `trusted-publish-draft` job 均 failure（gate 仍 success）；这与 docs/SECURITY.md 所写「earlier staging attempts failed」一致。具体 404 OIDC 错误文本未从日志核验（未拉取运行日志，只用了 API 的 job/step 结论）。
- 发布与 attestation 的绑定：六包 provenance 的 invocationId 都指向同一个 run `44706254171/attempts/1`，与上述 workflow run 完全一致。

### 3.3 本地 HEAD `e3f440d` 与 tag commit `1199fbf` 的差异（task 指定核对项）

- `git log --oneline v0.3.0..HEAD` 只有 1 条：`e3f440d docs(release): mark 0.3.0 published and record provenance verification`（2026-11-20 17:17:42 +08）。
- `git diff --stat v0.3.0..HEAD`：18 files changed, 246 insertions(+), 185 deletions(-)。
- 文件清单（`git diff --name-status`）：`CHANGELOG.md`、`CONTRIBUTING.md`、`README.md`、`README-zh.md`、`docs/ARCHITECTURE.md`、`docs/CONTENT-SAFETY.md`、`docs/CONTRACTS.md`、`docs/EVAL.md`、`docs/MCP.md`、`docs/PERFORMANCE.md`、`docs/QUICKSTART.md`、`docs/SBOM.md`、`docs/SECURITY.md`、`docs/TUI.md`、`packages/advisers/README.md`、`packages/advisers/README-zh.md`、`packages/core/README.md`、`packages/office/README.md`。
- **全部是文档/README/CHANGELOG**；没有 `packages/**/lib`、`packages/**/src`、`packages/**/bin`、`scripts/**`、`.github/workflows/**`、`package.json`、lockfile 改动 → **tag 之后没有运行时变更**，发布内容与 tag 一致。
- origin/main 与 GitCode main 都已到 `e3f440d`；该 commit 的 CI run #115（`ci`，push，run 44709513526）success；release-gate 未对 `e3f440d` 重新跑（无必要）。
- 注意：`git describe --tags --exact-match HEAD` 对 `e3f440d` 失败（HEAD 未打 tag）是预期状态；`check-release.mjs --require-tag` 仍 PASS（它只要求 `v0.3.0` tag 存在，不要求 HEAD==tag）。

### 3.4 0.2.4 tag / 远端镜像

- `v0.2.4` annotated tag object `ee426aa946bd7b71882fa66f96993cf35655e6ff` → commit `580c17729a2b3a0fa568b75d0d59c2b442eea3c6`；远端 GitHub 同样存在。npm 上 0.2.4 不存在（§1.4）。
- GitHub origin 与 GitCode 的 main/tag 已验证；Gitee 无法公开验证（`git ls-remote gitee` 要求用户名，`https://gitee.com/api/v5/repos/perrylink/advisers` 返回 `{"message":"Not Found Project"}`），见 P3-3。

---

## 4. CHANGELOG 破坏性变化与兼容性

### 4.1 0.3.0 发布范围

- `git rev-list --count v0.2.3..v0.3.0` = **11 commits**；`git diff --shortstat v0.2.3..v0.3.0` = **191 files changed, 37491 insertions(+), 1683 deletions(-)**。
- 主要变更面：86 个 `packages/advisers/**` 文件、16 个 `eval/det/**`、9 个 `packages/dsh-advisers/**`、contracts（cli/mcp/vectors）、`.github/workflows/publish.yml`、release 脚本（`verify-release.mjs`/`set-version.mjs`/`sbom.mjs` 等）。

### 4.2 CHANGELOG `### Compatibility` 原文（0.3.0）

```text
- Schema is **v21** (additive customer entities over v20); exit codes stay **0/1/3**
  (4/5/6 remain reserved and inactive);
  evidence/receipt pack formats stay v1/v1.1 (new verifier limits reject malformed or
  oversized packs, normal packs are unchanged); MCP clients that only know the legacy
  handshake keep working; all new JSON fields are additive.
```

### 4.3 升级到 0.3.0 需要动作 / 行为变化（从 CHANGELOG 0.3.0 段逐条核对）

| # | 项 | 变化 | 对既有用户/集成的动作 |
|---|---|---|---|
| 1 | 法律文本 | TOS/PRIVACY/DISCLAIMER/SAFETY 升到 **v2026.11.3（2026-11-20）**，新增 bridge/Hermes 出网披露；旧 v2026.11.2 的 consent **不被视为有效** | 下一条受 TOS 门控的命令会要求重新同意；这是 0.3.0 最需要用户动作的变化 |
| 2 | TOS 环境变量 | `ADVISERS_TOS_VERSION` 不能再伪造 consent 记录（改用打包 manifest 版本；env 只作 debug 展示并在 `tos status --json` 标记 ignored，审计一次 `TOS_ENV_OVERRIDE_IGNORED`） | 依赖该 env 伪造 consent 的脚本/测试会失效 |
| 3 | 数据库 schema | v20 → **v21**（additive：clients/projects/client_notes、matters ownership、commitments.created_at、delivery lineage）；命令执行时迁移 | 备份后升级；JSON wire format `LedgerSnapshot.version` 仍为 1 |
| 4 | receipt/evidence verifier | 新增资源上限：entries、目录深度、单文件大小、总字节、`SHA256SUMS`/manifest 大小；超限固定错误 `E_RECEIPT_LIMIT` | 正常 v1/v1.1 pack 不受影响；畸形/超大 counterparty pack 现在会被硬拒绝（收紧，非静默截断） |
| 5 | MCP | 仅 legacy 协议协商（2024-11-05 / 2025-06-18 / 2025-11-25），未知/缺失回退 2024-11-05；**2026-07-28 未实现**，不广告 `server/discover` | 只支持现代 stateless 协议的客户端不可用；legacy 客户端不受影响 |
| 6 | exit codes | 仍 0/1/3；4/5/6 保留但未启用 | 无 |
| 7 | DSH 适配器 | 三个账本读工具改为读**真实本地账本（只读）**：TOS 门控、clearance 0、不取 HOME 写锁、不迁移、不写库；无账本/门面不可用时回退带标记 preview | 依赖 `preview:true` 空数据做测试的调用方需区分结构化 `LEDGER_*` 错误与 preview |
| 8 | 0.2.4 基线 | 0.2.4 的 Windows durable-fsync 与逐 item secrecy/evidence 修复并入 0.3.0（0.2.4 本身未发布） | 从 0.2.3 直接升 0.3.0 即可，无需经过 0.2.4 |

> 结论：**0.3.0 不是运行时意义上的破坏性升级**（schema additive、exit code 不变、JSON/receipt 格式不变），但**有必须动作的契约变化**（TOS 重新同意）与**收紧行为**（verifier 上限、TOS env 失效）。CHANGELOG 自己把它描述为 minor release 是合理的，但对外沟通必须带上「需重新同意 TOS v2026.11.3」。

### 4.4 Pet Brief 契约边界（与 task-143 的分工）

- `git diff --stat v0.2.3..v0.3.0 -- docs/pet-brief` 为空 → **Pet Brief schema/example/testcases 契约文件未变**；`schemaVersion: 2` / `displayPolicy` 契约在 0.3.0 保持。
- 生产者实现 `packages/advisers/lib/pet-brief.js` 在 0.2.3→0.3.0 有 **102 insertions(+), 39 deletions(-)**（per-item secrecy clearance、先过滤后计数/截断、不泄漏受保护标题/引用/正文）。消费端是否会看到字段/计数差异，由并行的 **task-143（ADVISERS-030-CONSUMER）** 用真实 0.3.0 安装与 fixtures 验证；本审计不重复消费端测试。
- 本仓库两端当前**没有** npm 运行时依赖：`desktop-games/package.json` 的 deps 只有 `@sentry/browser`/`@tauri-apps/api`/`cordis`/`pixi.js`（`src/presence/advisers-source.ts` 只按公开 JSON 形状读，不 import 包）；`dsh-famling/package.json` 没有 dependencies。故发布侧审计不产生本地两端的强制改动，版本 pin/契约升级属于 task-143。

---

## 5. 文档 / CI / 声明问题清单（分级）

### 5.1 P2（3 条，文档/声明与已发布事实不一致；无安全/数据/供应链风险）

| 编号 | 问题 | 证据（实测） | 影响 | 建议 |
|---|---|---|---|---|
| P2-1 | **已发布 npm 包的 README 仍自称 release candidate / latest 0.2.3** | 6 个 0.3.0 tarball 中，`advisers`（README.md + README-zh.md）、`advisers-core`、`advisers-office` 的 README 含 `release candidate`/`still 0.2.3` 字样；对应 registry packument 顶层 `readme` 也不含更新版；根因是这些 README 在 tag commit `1199fbf` 之后才由 `e3f440d` 修正（`git diff v0.3.0..HEAD -- packages/advisers/README*.md packages/core/README.md packages/office/README.md` 可见），npm 只在下次 publish 时更新 readme | 用户打开 npmjs.com 页面/安装后阅读 README 会看到「0.3.0 是 release candidate、latest 仍是 0.2.3」与 registry `latest=0.3.0` 直接矛盾；会影响安装决策 | 下次发布（0.3.1）自动刷新；或在 0.3.0 release notes 顶部加一行「包内 README 仍为发布前文案，以 registry dist-tags 为准」；今后把「发布后改 README」推迟到下一个版本，或发布前先提交文档 |
| P2-2 | **GitHub Release notes 的性能数字与仓库 docs 不一致** | Release body 写 `today 131 ms, remind 226 ms, tui 181 ms, digest 145 ms, pet-brief 377 ms`；`docs/PERFORMANCE.md` 的 0.3.0 目标表是 `today 151–158 ms（min 131–138）、tui 216 ms、digest 226 ms、pet-brief 399 ms（one round 588 ms）`，并明确写 `Do not advertise the 0.3.0 performance table as fully met`；`181` 在仓库 docs 中检索不到 | 公开 release notes 使用了未标注口径（min/best round）的数字，与 docs 的 median 口径不可直接比较；同一项目两处对外数字打架，属于声明准确性问题 | 编辑 release notes：改用 docs 的 median 数字并标注目标达成状态，或明确标注 `min/best round`；后续发布改成 release notes 直接引用 docs 表格 |
| P2-3 | **tag v0.3.0 树内的文档仍是发布前状态** | `git show v0.3.0:CHANGELOG.md` 顶部仍写 `## 0.3.0 (release candidate, 2026-11-20)` / `Status: release candidate, not published`；tag 树的 `README.md`/`README-zh.md`/包 README 同样称 RC。这些只在 `e3f440d`（tag 之后）被改成 published | 检出/下载 v0.3.0 源码的用户会看到与已发布事实相反的声明；镜像归档若按 tag 抓取也会带着旧文案 | 不改已发布 tag（重打 tag 会破坏 `gitHead`/provenance 绑定）；在 release notes 与仓库 README 明示「v0.3.0 tag 内文档为发布前快照」；下次发布把 final docs commit 放在 tag 之前 |

### 5.2 P3（7 条，建议改进/需知悉；不影响发布成立）

| 编号 | 问题 | 证据 / 说明 | 建议 |
|---|---|---|---|
| P3-1 | provenance 的 build ref 是 `refs/heads/main`，不是 `refs/tags/v0.3.0` | SLSA `externalParameters.workflow.ref = refs/heads/main`，`resolvedDependencies[0].uri` 同为 `@refs/heads/main`；但 `digest.gitCommit = 1199fbf` 恰好等于 tag commit，所以 tarball 与 tag 内容绑定仍成立 | 下次发布 dispatch 时 checkout `refs/tags/v<version>`（或在 publish job 里显式 `ref:`），让 attestation 记录 tag ref；文档继续如实写「commit 绑定」而非「tag ref 构建」 |
| P3-2 | `next` dist-tag 在六个包上仍是 `0.2.3`（小于 latest 0.3.0） | 六包 `dist-tags` 实测 `{latest:0.3.0, next:0.2.3}`；README/CHANGELOG 已明确说明 | 语义上 `next` 应 ≥ `latest`；建议要么把 `next` 指向 0.3.0/下一个预发布，要么在文档中把 `next` 标注为「历史预发布通道，不再维护」 |
| P3-3 | Gitee 镜像无法公开验证 | `git ls-remote gitee` 要求用户名；`https://gitee.com/api/v5/repos/perrylink/advisers` 返回 `Not Found Project`（大小写两种都 404） | 若 Gitee 是正式镜像，需在公开可访问前提下核对 `v0.3.0`/main；否则不要把它列为可核验的发布镜像 |
| P3-4 | 发布门禁 `check-release.mjs --require-tag` 只校验 tag 存在，不校验 HEAD==tag | 在未打 tag 的 HEAD `e3f440d` 上实跑 `node scripts/check-release.mjs --stable --require-tag` → **PASS release consistency (0.3.0)**（输出含 `PASS git tag v0.3.0 exists`）；真正「HEAD 必须被 tag v<version> 精确匹配」的检查在 `release.mjs`（不满足时默认失败，`ADVISERS_RELEASE_ALLOW_NO_TAG=1` 可绕过） | 在文档中区分「gate 要求 tag 存在」与「release 脚本要求 HEAD==tag」；或让 gate 也执行 HEAD==tag 检查（发布时 HEAD 本来就有 tag，不会误伤） |
| P3-5 | Release notes 的验证/安装命令没有显式 `--registry=https://registry.npmjs.org/` | Release body 里 `npm view advisers@0.3.0 dist.attestations --json` 与 `npm i -g advisers@0.3.0` 均未带 registry；本机默认 npmmirror 的 `latest` 仍是 0.2.3（实测），镜像未同步时可能装到旧版或验证失败 | Release notes 与 README 保持一致，加上 `--registry=https://registry.npmjs.org/`（README 已加） |
| P3-6 | GitHub Release 没有任何 assets（SBOM 未附加） | API `assets: []`；`artifacts/sbom.cdx.json` 被 `.gitignore` 的 `artifacts/` 忽略，本机 222-check 用的是本地已有文件；从干净 checkout 复现需先 `pnpm run sbom`（docs/CHANGELOG 有注明） | 把 SBOM 作为 release asset 附上（`gh release upload v0.3.0 artifacts/sbom.cdx.json`），并在 release notes 写明生成命令；可复现性说明保持 |
| P3-7 | `dsh-advisers@0.3.0` 的 `engines.dsh` 上界是 `<0.3.0`，与 DSH 自身版本演进有潜在冲突 | `packages/dsh-advisers/package.json`：`engines.dsh = >=0.2.1-rc.5 <0.3.0`，peer `@deepseek-ai/dsh-tools` 同范围；本机 DSH checkout 当前 `0.2.2-rc.4`（在范围内） | 当 DSH 主线进入 0.3.0 时，`dsh-advisers@0.3.0` 的 peer/engines 会不满足；建议在 DSH 0.3 发布前发布 `dsh-advisers` 新版本或明确该范围只针对 DSH 0.2.x |

---

## 6. 已执行验证（本机实测，2026-11-20 19:47–20:00 +08）

| # | 操作 / 命令 | 结果 |
|---|---|---|
| 1 | `curl https://registry.npmjs.org/advisers` + 其余五包 | HTTP 200；六包 `latest=0.3.0`、`next=0.2.3`、`gitHead=1199fbf`、`dist.attestations` 非空 |
| 2 | 解码六包 SLSA statement，比对 subject sha512 vs `dist.integrity` | **6/6 match=true** |
| 3 | `node scripts/check-provenance.mjs --version 0.3.0 --registry https://registry.npmjs.org/` | **PASS provenance verification (108 checks, 1 skipped)**，exit 0 |
| 4 | `node scripts/verify-release.mjs --version 0.3.0 --tag latest --sbom artifacts/sbom.cdx.json --require-sbom --registry https://registry.npmjs.org/` | **PASS release verification: 222 checks**，exit 0（含 install/import smoke、SBOM、六包 sha1/sha512/gitHead/attestation） |
| 5 | `npm audit signatures --registry=https://registry.npmjs.org/`（临时前缀，237 包） | 237 verified registry signatures / 15 verified attestations，exit 0 |
| 6 | `node scripts/check-release.mjs` | PASS release consistency (0.3.0)，exit 0（8 pins + 3 version constants + license/NOTICE） |
| 7 | `node scripts/check-docs.mjs`；`node scripts/check-tos.mjs --release` | 均 PASS（docs 版本一致 0.3.0；TOS v2026.11.3, effective 2026-11-20） |
| 8 | tarball 与 tag 树逐文件 sha256 比较 | `advisers` 70/70、`dsh-advisers` 8/8 完全一致；四个 TS 包 tarball 含 CI 构建的 `dist/`（不在 git），共享的 5 个文件（LICENSE/NOTICE/README/package.json/THIRD-PARTY-NOTICES）逐一一致 |
| 9 | `git -c http.proxy= ls-remote origin refs/tags/v0.3.0*` / GitCode | tag object `f3ac009` + peeled `1199fbf`；两仓 main 均为 `e3f440d` |
| 10 | GitHub API：`git/ref/tags/v0.3.0`、`git/tags/f3ac009…`、`releases/tags/v0.3.0`、`actions/runs/44706254171`（+ jobs/steps） | tag/release/run 数据与 §3.1/§3.2 一致；run #9 success，publish step success，`needs: gate` |
| 11 | 六包 `versions` 列表检查 | 均无 `0.2.4`；`v0.2.4` tag（`ee426aa`→`580c177`）存在但未发布 |
| 12 | 本机 `npm view`（默认 mirror vs 官方 registry） | 默认 `latest=0.2.3`；官方 `latest=0.3.0`（镜像滞后实测） |
| 13 | 八个 workspace 包 + 内部 pin + 版本常量 + lockfile | 全部 0.3.0 lockstep；`check-release` 全 PASS |
| 14 | CHANGELOG 0.3.0 Compatibility/法律/known issues 段提取；`git diff v0.2.3..v0.3.0` 统计 | schema v21 additive、exit 0/1/3、TOS v2026.11.3 需重新同意、verifier 上限；11 commits / 191 files / +37491 −1683 |

---

## 7. 未测 / 限制（不把 CI 结论伪装成本机实测）

- **未在本机跑完整 `pnpm -r test` 全量套件**（审计只读，跑了仓库自带的 release/文档/安全门禁脚本）；`1199fbf` 的 CI run #114（`ci`）与 `e3f440d` 的 #115 均为 success，本审计只引用该 CI 记录。
- **未做真实 Windows 11 机器验证**；只核对了 `.github/workflows/ci.yml` 的 `windows-smoke`（windows-latest、Node 22.16、pack-smoke + docs/release gates + 临时 ADVISERS_HOME CLI smoke）存在。CHANGELOG 自己声明「No real-Windows E13 evidence yet」，与本审计一致。
- **未登录 npmjs.com 管理面板核验 Trusted Publisher 配置**（owner-only，仓库外状态）；attestation 只证明 OIDC CI 发布成功，不能证明「未存在长期 token」——该点由 `publish.yml` 的 `NPM_TOKEN must not be set` 守卫保障，属代码约束而非外部可验证事实。
- **未做 Sigstore 透明日志的手工审计**；`check-provenance.mjs` 自述只验证 npm 元数据 linkage，不密码学验证 bundle；本审计额外跑了 `npm audit signatures` 做消费者侧整体验证，但未逐包读取 attestation 详情。
- **未拉取 workflow 运行日志**，只用 GitHub API 的 run/job/step 状态与时间；因此 docs 中「404 OIDC token exchange error」的具体错误文本未核验（只核验了更早 run 的 trusted-publish-draft = failure）。
- **Gitee 镜像未验证**（API 404 / ls-remote 需认证），不作为发布证据。
- **未重放 npm publish/stage/approve**（同一版本不可重放，且审计边界禁止发布动作）；发布路径结论来自 registry/attestation/workflow 证据，不是本机重发。
- **TS 包的 `dist/` 构建产物不在 git**，无法只凭 tag 源码逐字节重建 tarball；`advisers` 与 `dsh-advisers` 两个纯 JS 包已做到 tarball 与 tag 逐文件一致。可复现构建本就不是 0.3.0 的声明（docs/SBOM.md 明确 SBOM 不是 reproducible-build proof）。

---

## 附录 A：registry 原始字段（0.3.0）

| 包 | `dist.integrity` 前缀 | tarball |
|---|---|---|
| `advisers` | `sha512-Cy5dVV13ChD2vIqTSxjbM/Eeokf…`（95 字符） | `https://registry.npmjs.org/advisers/-/advisers-0.3.0.tgz` |
| `advisers-core` | `sha512-6eUxEcqcE0dvoGh10LCXXOxRMps…` | `.../advisers-core/-/advisers-core-0.3.0.tgz` |
| `advisers-office` | `sha512-QqzUcsOLd/GGo5sUD+bAoCummRv…` | `.../advisers-office/-/advisers-office-0.3.0.tgz` |
| `advisers-bridge-hermes` | `sha512-8y6oM5QhWTNUlv/0ooBMcqOKg7E…` | `.../advisers-bridge-hermes/-/advisers-bridge-hermes-0.3.0.tgz` |
| `advisers-policy-strict` | `sha512-ANUserlxlXuJc36D4YxD3/kd0Ni…` | `.../advisers-policy-strict/-/advisers-policy-strict-0.3.0.tgz` |
| `dsh-advisers` | `sha512-i4x7yq3qHeNfVsXFcTsp6UjoQ+x…` | `.../dsh-advisers/-/dsh-advisers-0.3.0.tgz` |

六个 tarball 的 `dist.shasum`（sha1）全文见 §1.1 表；`advisers` tarball 本地 sha512 已与 `dist.integrity` 全文比对相等（§2.2）。

## 附录 B：复现命令（只读）

```sh
# 0) npm 默认镜像可能滞后：所有命令显式官方 registry
R=https://registry.npmjs.org/

# 1) 六包 dist-tags / gitHead（逐包）
for p in advisers advisers-core advisers-office advisers-policy-strict advisers-bridge-hermes dsh-advisers; do
  echo "== $p"
  npm view "$p" dist-tags gitHead --registry="$R" --json
done
```

```sh
cd /mnt/d/Projects/dsh/plugins/advisers
node scripts/check-provenance.mjs --version 0.3.0 --registry https://registry.npmjs.org/
node scripts/verify-release.mjs --version 0.3.0 --tag latest \
  --sbom artifacts/sbom.cdx.json --require-sbom \
  --registry https://registry.npmjs.org/
node scripts/check-release.mjs
node scripts/check-docs.mjs
node scripts/check-tos.mjs --release

# 2) tag/commit/远端
git rev-parse v0.3.0 v0.3.0^{commit}
git -c http.proxy= ls-remote origin "refs/tags/v0.3.0*"
git diff --name-status v0.3.0..HEAD
git diff --shortstat v0.2.3..v0.3.0

# 3) GitHub API（公开只读）
curl -sS https://api.github.com/repos/PerryLink/advisers/releases/tags/v0.3.0
curl -sS https://api.github.com/repos/PerryLink/advisers/actions/runs/44706254171
```

## 附录 C：时间线观察与证据留存

- 时间线（UTC）：tag v0.3.0 创建/Release created_at `08:27:06Z` → release-gate run #9 开始 `08:54:22Z` → gate job 完成 `08:56:35Z` → direct publish step 完成 `08:57:33Z` → 六包 registry 时间 `08:58:35Z`–`09:02:41Z` → Release published_at `09:08:18Z` → docs commit `e3f440d` 的 commit 时间 `09:17:42Z`、其 CI run #115 created_at `09:17:51Z`。
- 观察：registry 的六包时间比 publish step 的 GitHub 记录时间晚约 1 分钟。全仓只有一个 head_sha=`1199fbf` 的 provenance run（invocationId 唯一），六个版本各自只出现一次，`gitHead` 唯一，因此不存在二次发布/重发的证据；该偏差更像 runner 与 registry 的时钟或写入时刻差。记录在此供后续审计参考，不构成问题。
- 证据留存（仓库外临时目录，可丢弃/重取）：`/tmp/adv030-audit/` 下有六包 packument JSON、六包 attestation JSON、`advisers-0.3.0.tgz` 与六个 tarball、解包目录、GitHub API 返回（`gh-ref.json`/`gh-release.json`/`run-jobs.json`）、gitee 404 响应。**未**把任何 registry/GitHub 原始数据写入仓库。
- 本审计唯一仓库写入：`/mnt/d/Projects/dsh/desktop-games/docs/integration/ADVISERS-030-RELEASE-AUDIT-2026-11-20.md`（即本文件）。未执行 `git add`/`commit`/`push`。

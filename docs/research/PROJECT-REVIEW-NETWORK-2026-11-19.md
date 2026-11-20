# Famling / dsh-famling 网络与远程市场评审（网络工程师视角）

| 项 | 内容 |
|---|---|
| 文档 | `docs/research/PROJECT-REVIEW-NETWORK-2026-11-19.md` |
| 日期 | 2026-11-19（Asia/Shanghai） |
| 评审人 | review-network（子代理，task-57） |
| 范围 | 私有仓 `<private-path> `<private-path> DSH checkout `/home/yy/deepseek-harness` |
| 形式 | **只读评审**：未改任何代码/资产/配置，只新增本文件；未 commit/push；未运行测试/构建；未联网下载；未访问/打印任何密钥材料 |
| 依据 | 工作区代码与文档（working tree 快照 2026-11-19 12:50 左右）、既有审计与解决报告、团队任务板 |
| 读者 | lead、网络/后端/发布方向后续执行者 |

---

## 0. 执行摘要

**结论（一句话）**：本项目当前**没有任何远程内容市场运行代码**（`src/pet/content-library.ts` 明确不 fetch，市场只存在于契约/校验/UI 状态层），因此**不存在「远程市场 / CDN / 自动更新」类线上攻击面**；真正的问题不在「已有网络实现不安全」，而在**两件事还没闭合**：

1. **发布信任链尚未成立**：生产 DLC 信任根 `keys` 为空、仓库内两个 DLC 包仍只有 legacy 签名、安装包/EXE 仍是 NotSigned、无 updater、`SHA256SUMS.txt` 无发布者外层签名。当前唯一的「可发布」路径是显式 unsigned preview（`--skip-dlc-trust`），这会把 fail-closed 设计变成「一旦绕过就什么都不剩」。
2. **远程市场的密码学契约已很好，但传输层语义完全空白**：目录/zip 的 Ed25519 + sha256 + zip 上限 + 未知/吊销 key fail-closed 都有实现与测试；但 **HTTP 缓存、CDN、重试/退避、限流、防回滚、下载器安全边界、离线缓存、隐私告知** 一项都没定义。若按现有 `RemoteMarketSource` 直接让 UI 用 webview fetch，还会**与当前 CSP 直接冲突**。

**评级**：P0 × 2、P1 × 7、P2 × 12。**没有 P0 级「现有代码可被远程直接打穿」漏洞**（与 `docs/audit/FAMLING-SECURITY-AUDIT-2026-11-18.md` 的 P0 结论一致）；P0 全部是**发布/信任链阻断**，P1 是**远程能力接入前的协议与安全前置条件**。

**最值得注意的事实（均带证据，见 §2/§4）**：

1. 生产 DLC 信任根为空：`native/dlc-verify/trust/production-trust-root.json:8` 为 `"keys": []`；发布门禁在 `scripts/verify-dlc-trust.mjs:634-641` 明确 fail-closed。
2. 安装包内两个 DLC 包仍是 legacy `signature.txt`（`packs/farm-seasons/signature.txt`、`packs/reef-pack/signature.txt`），而生产策略 `allowLegacySignatureWithoutKeyId=false`，因此**release 构建即使有 key 也验不过旧包**。
3. 无自动更新：`app/tauri/src-tauri/Cargo.toml:13-18` 只有 tauri/serde/reqwest/base64/dlc-verify，无 `tauri-plugin-updater`；`tauri.conf.json` 无 `plugins.updater`；`docs/UPDATER-KEYS-2026-11-15.md:1-3` 自认「密钥已生成，尚未接入」。
4. 发布物实测 NotSigned 且 `SHA256SUMS.txt` 只有明文哈希（`scripts/release-win.mjs:484-496`），SHA256SUMS 的 minisign/cosign 外层签名被列为剩余项（`docs/audit/RESOLUTION-AUTHENTICODE-2026-11-19.md:19,222`）。
5. **CSP 与远程市场实现方式冲突**：`tauri.conf.json:30` 为 `connect-src 'self' ipc: http://ipc.localhost`、`img-src 'self' asset: http://asset.localhost data:`；远程 catalog 拉取、zip 下载、preview 图都过不去。正确解法是**新增受限 Rust 下载命令**（复用已有 `reqwest`），而不是放宽 CSP。
6. 市场级**防回滚不存在**：catalog 有 `version`/`updatedAt`，但 `verifyMarketCatalogSignature`（`src/pet/content-library.ts:4483-4493`）只验签与 key 有效期，不比较任何已持久化的最高版本/过期时间；旧 catalog 可被重放。
7. 云端出网只有 3 条固定调用（TTS `api.deepseek.com/v1/tools/tts`、ASR `/v1/tools/asr`、公开分享 `chat.deepseek.com`），全部在 Rust 侧、用户操作后触发；webview 自身被 CSP 限制不能任意出网（正向）。但 Rust 侧响应体**无大小上限**、ASR **无配额/无限流**（`voice.rs:175,200-210,232`；`main.rs:186-189`）。
8. `dsh-famling` 只有 1 个本机同源 bridge（`/api/famling/bridge`），owner-only / Host / Origin 围栏由 DSH 宿主提供（已实测 401/403），但插件 handler 自身无 Origin/content-type/限流纵深（`index.js:187-192,266-271`；hub 审计 `docs/audit/DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md:155-176,218-238`）。

**建议先做的 3 件事（详见 §7）**：

1. **闭合发布信任链（P0）**：完成生产 Ed25519 key ceremony → 写入 `production-trust-root.json` → 用生产 key 重签两个 pack（生成 `signature.json`）→ 跑 `verify-dlc-trust --exe` + 首次 signed CI；同时给 `SHA256SUMS.txt` 加 minisign/cosign 外层签名。这是所有「下载/市场/更新」的前提。
2. **先把远程市场传输层与防回滚定稿成规范 v0.2（不写网络代码）**：catalog 增 `serial`（单调）+ `expires`，客户端持久化最高 serial + 离线宽限；把 HTTP 缓存/重试/限流/镜像/失败码写成可测试契约。
3. **实现一个受限 Rust 下载器 + 复用已有 bounded zip reader（默认关闭、可 fixture 测）**：URL 只允许来自已验签 catalog、禁重定向跨主机、限大小/时间/并发，临时文件 + sha256 校验 + 原子安装；CSP 不放宽。

---

## 1. 评审范围、方法与限制

### 1.1 范围

- **famling**（`desktop-games`）：`src/pet/main.ts`（内容运行时/网络调用点）、`desktop-shell.ts`（菜单/内容中心入口）、`hit-regions.ts`/`hero*.ts`（命中与渲染，无网络路径）、`content-library.ts`、`content-hub.ts`、`content-assets.ts`、`security/*`、`chat-import/*`、`voice/*`、`app/tauri/src-tauri/{src/main.rs,src/voice.rs,Cargo.toml,tauri.conf.json,capabilities/*}`、`native/dlc-verify`、`scripts/{release-win,verify-dlc-trust,lib/release-signing,repro-check}.mjs`、`.github/workflows/*`、`packs/*`、`public/content/*`、`docs/{design,audit,legal,plan}/*`。
- **dsh-famling**：`index.js`、`client.js`（含 lazy chunk 加载）、`content-extension.mjs`、`package.json`、`test/*`、`README.md`、`docs/*`。
- **DSH checkout（只读）**：仅核对 bridge 宿主保护与插件分发语义，未改。

### 1.2 方法

- 静态阅读 + `grep -n`（逐条证据给到 file:line）；对照既有审计/解决报告，避免重复报告已闭合项。
- 用只读命令实测了少量事实：`git status`（working tree 18 项未提交）、`ls/du`（`public/assets/voice/pet` 42 个 WAV / 4.2 MB；`public/content/library.json` 14,545 B；插件 chunk 大小）、`ls .keys`（仅列名，未读内容）。
- **未运行** `npm test`/`tsc`/`cargo`，**未做**真实下载/签名/抓包/压测。文中引用的测试数字均来自仓库文档记录，不是本次复跑结果。

### 1.3 严重度口径

| 级别 | 定义（本评审） |
|---|---|
| **P0** | 阻止可信发布、或使内容/更新信任链不成立、或在接入远程能力后可直接造成远程内容伪造/更新劫持的结构性缺口。 |
| **P1** | 接入远程市场/更新前必须补齐的协议、架构或供应链前置条件；缺一条都会让后续实现系统性不安全。 |
| **P2** | 纵深防御、隐私、运维、体验/错误语义与文档漂移；不单独导致远程打穿，但会放大 P0/P1。 |

---

## 2. 当前网络/远程能力盘点

### 2.1 出网调用清单（全部实测代码路径）

| # | 调用方 | 目标/协议 | 认证 | 超时/重试/限流 | 发送内容 | 证据 |
|---|---|---|---|---|---|---|
| 1 | Rust `voice_synthesize`（TTS，付费） | `https://api.deepseek.com/v1/tools/tts`（rustls TLS） | `DEEPSEEK_API_KEY` 环境变量，`bearer_auth` | 45 s 超时；**无重试**；本地日额度 2000 计费单位；有本地 WAV 缓存 | 待朗读文本 + voice_id | `app/tauri/src-tauri/src/voice.rs:128-193` |
| 2 | Rust `voice_asr`（ASR，付费） | `https://api.deepseek.com/v1/tools/asr`（multipart WAV） | 同上 | 60 s 超时；**无重试、无配额、无限流**；8 MiB 上限（但先 decode 后检查） | 用户录音 WAV | `voice.rs:195-235` |
| 3 | Rust `fetch_deepseek_share` | `https://chat.deepseek.com/api/v0/share/content?share_id=...`（固定 URL） | 匿名（公开分享） | 25 s 超时；无重试；UA 伪装浏览器 | shareId（用户输入，白名单字符） | `app/tauri/src-tauri/src/main.rs:156-194` |
| 4 | 浏览器 fallback（无 Tauri 时） | 同上 | 匿名 | `fetchJsonWithTimeout`：15 s、2 次重试（408/425/429/5xx）、4 MiB 响应上限 | shareId | `src/pet/chat-import/fetch.ts:121-133`、`src/pet/security/{fetch-timeout.ts:67-72,limits.ts:102-105}` |
| 5 | dsh-famling client → DSH Host | 同源 `POST /api/famling/bridge`（loopback DSH web server） | DSH 同源 Cookie（owner peer） | 16 KiB body；LLM 25 s AbortController；无宿主级限流 | 用户输入/character、brief 请求 | `plugins/dsh-famling/index.js:15-17,187-215,266-271`；`client.js:794,814,837` |
| 6 | dsh-famling client 懒加载 | DSH 宿主静态模块表加载 `client.anims.*.js` / `client.content.js`（包内本地） | 同源 | 无网络重试；失败保留占位 | 无用户数据 | `plugins/dsh-famling/client.js:13-18,206-253` |
| 7 | Sentry（可选遥测） | `@sentry/browser`，仅 aquarium demo；默认无 DSN 不联网 | DSN 来自 URL 参数或 window 变量 | `tracesSampleRate:0`、`sendDefaultPii:false`、去 user/cookies | 崩溃/错误摘要（含 URL/UA） | `src/observability.ts:59-92`、`src/aquarium/main.ts:23-42` |
| 8 | CI/发布流水线 | GitHub Actions；`npm ci`（有 lockfile）；**`npx --yes @tauri-apps/cli@2.12.6` 构建期从 npm 拉取**；artifact 上传 | GitHub token（最小权限 contents: read） | 无 | 源码/构建物 | `.github/workflows/_windows-build.yml:144,158,211`；`ci.yml:26-34` |

**内容市场当前出网次数 = 0**：`src/pet/content-library.ts:51` 明确 `nothing in this module fetches`；`content-hub.ts:15-23` 明确 UI 不 fetch；市场 tab 默认文案是「服务器未配置 · 默认不联网」（`content-hub.ts:1110-1121`）。

### 2.2 入网/监听面

| 面 | 状态 | 证据 |
|---|---|---|
| 应用自带服务端 | **无**（本地 Tauri app，无 HTTP server/listen） | `Cargo.toml:13-18` 无 webserver/fetch-server 插件；`tauri.conf.json` 无相关配置 |
| WebView 远程加载 | **无**（所有窗口加载本地页面；CSP script-src self） | `tauri.conf.json:17,30`；`FAMLING-SECURITY-AUDIT-2026-11-18.md:40,281` |
| WebView 导航白名单 | **未见显式 `on_navigation` 限制**（默认导航行为未在 main.rs 收紧；仅 `on_permission_request` 管麦克风） | `main.rs:917-927`；`src-tauri/src` 与 `tauri.conf.json` grep 无 `on_navigation`（P2-6） |
| 本机 loopback 服务 | DSH 宿主提供的 bridge；exact route 仅 owner + Host/Origin 围栏（宿主实测 401/403） | hub `docs/audit/DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md:155-176` |
| 自动更新/远程代码 | **无**（无 updater、无远程 JS/HTML） | `Cargo.toml:13-18`、`tauri.conf.json`、`FAMLING-SECURITY-AUDIT-2026-11-18.md:40` |

### 2.3 远程内容市场：契约 vs 实现

| 能力 | 状态 | 证据 |
|---|---|---|
| catalog/zip/pack 的数据 schema 与严格校验 | **已完成**（v0.2，纯函数） | `content-library.ts:638-725,4304-4417`；`docs/content-packs/README.md §6` |
| Ed25519 验签 + 信任根（active/retired/revoked/有效期） | **已完成**（可注入 verifier/trustRoot） | `content-library.ts:4443-4528`；`tests/content-pack-v2.test.ts` 市场组 |
| zip 清单校验（路径/大小/类型/哈希/压缩比） | **已完成**（inventory 层） | `content-library.ts:172-199,3905-4004` |
| 本地 bounded zip reader（导入用） | **已完成**（central directory、无路径穿越、有上限） | `src/pet/content-assets.ts:9-32,300+` |
| HTTP 传输（catalog 拉取/zip 下载） | **未实现（0 行）** | 全仓 grep：`content-library.ts` 无 fetch；`content-hub.ts:1079-1097` 只有注入接口 |
| 下载器安全边界（URL 允许列表/重定向/SSRF/大小/超时/磁盘配额） | **未定义** | `parseHttpsUrl` 只要求 HTTPS 无凭据，任意主机都通过（`content-library.ts:1977-1994`） |
| 防回滚/防重放/过期 | **未定义** | catalog 有 version/updatedAt 但验签不比较（`content-library.ts:4483-4493`） |
| 安装器/卸载/离线缓存 | **未实现** | `content-hub.ts:596,822` 远程导入一律拒绝；`CONTENT_MARKET_CONTRACT_STEPS`（`:1099-1108`）是待办清单 |
| 服务端/CDN/运营 | **不存在** | 仓库无市场服务端代码；`docs/design/CONTENT-MARKET-2026-11-19.md §6.3` 明确远程市场是后续阶段 |

### 2.4 离线能力与缓存（现状）

- **核心可用性离线优先**：内容目录是本地静态 `public/content/library.json`（`main.ts:1009-1016` 同源 fetch）；动画/角色/主题来自安装包内资源；语音优先 baked WAV（实测 `public/assets/voice/pet` 42 个 WAV / 4.2 MB，含 `tide/` 21 个）；TTS provider 链本地优先（`src/voice/service.ts:17-27`）。
- **依赖网络才可用的功能**：云 TTS（baked miss）、云 ASR、DeepSeek 分享导入、DSH bridge 的 LLM chat/brief（brief 本地文件，但 chat 需要 DSH 模型）。
- **内容市场离线语义未定义**：无 catalog 缓存索引、无 `If-None-Match` 复用、无「离线宽限期」、无「已安装包离线可用」的显式状态（安装器未实现）。

### 2.5 已经做对/值得保留的设计（评审确认）

1. **CSP 收紧**：`connect-src` 只允许 self/ipc，webview 不能任意出网；相对「UI 直连远程」这是很强的默认。
2. **无远程代码/自动更新面**：没有 updater、没有远程 HTML/JS，当前不存在「更新被劫持 → RCE」的现成链条（代价是无补丁通道，见 P0-2）。
3. **内容信任模型 fail-closed**：未知/吊销/过期 key、缺签名、哈希不符、没有验签回调的 remote pack 一律拒绝（`content-library.ts:4443-4528,4150-4166`）。
4. **zip 资源边界**：16 MiB zip / 32 MiB 解压 / 256 entries / 128 压缩比 / 资产白名单（png/webp/json/woff2），且本地导入 reader 有界。
5. **DLC 信任根编译期嵌入**，release 忽略运行时 `--dlc-key`，且禁止 dev key 指纹进入生产根（`native/dlc-verify/src/lib.rs:18-28,187-191`）。
6. **TTS/ASR 独立同意门 + 宿主侧镜像**（`src/pet/consent/{tts,asr}.ts`、`main.rs` host consent 命令），webview 误调 IPC 也会被 Rust 拒绝（task-43 已闭合）。
7. **本地限流**：TTS 3 条 burst / 1 条每秒；导入 2 次 burst / 30 s 一次；保存/重试各有桶（`src/pet/security/rate-limit.ts:130-160`）。
8. **发布工程**：Authenticode 条件签名闸门、可复现输入检查、DLC 发布门禁、signed/unsigned-preview 明确区分（`.github/workflows/release.yml:3-15,98-108`；`repro-check.mjs:142-148`）。
9. **分享导入硬化**：固定 host + shareId 白名单 + 超时/重试/大小上限（`chat-import/deepseek-share.ts:40-56`；`fetch-timeout.ts`）。
10. **无默认遥测**：Sentry 无 DSN 即 no-op（`observability.ts:68-88`）。

---

## 3. 威胁模型

### 3.1 资产

| 资产 | 说明 |
|---|---|
| 用户本机隐私 | 存档、Advisers brief、TTS/ASR 内容、导入摘要、麦克风 |
| 用户云额度 | DeepSeek API key 对应的 TTS/ASR/LLM 费用 |
| 内容完整性 | 角色主题/动画/声音包不被篡改、不被降级到有漏洞版本 |
| 发布者身份 | 用户能确认下载物来自发布者；更新不可被劫持 |
| 服务可用性 | 市场/CDN/供应商 API 故障或限流时应用仍可用 |
| 合规证据 | 用途声明、AI 标识、许可、隐私告知、数据流可解释 |

### 3.2 对手

| 对手 | 能力 | 主要目标 |
|---|---|---|
| 网络中间人 | 可劫持 DNS/TCP（TLS 未破） | 降级/阻断/跟踪；若未来允许 HTTP 则可篡改 |
| 恶意/被入侵 CDN、镜像 | 返回错误 catalog/zip/预览 | 投毒、回滚、拒绝服务 |
| 市场服务器被入侵 | 可改目录、下架、注入新包 | 伪造内容、跟踪、供应链攻击 |
| 签名密钥泄露/内部人 | 可签恶意 catalog/pack/更新 | 全量用户内容伪造或 RCE（更新链） |
| 恶意内容作者 | 提交恶意 pack（声明造假、zip 攻击、XSS 载荷） | 通过审核/安装后攻击本机或他人 |
| 同源 XSS / 未来插件 | 能在 DSH Web 或本地页面执行 JS | 烧 API 额度、调用 bridge、读 brief、本地 DoS |
| 本地恶意进程 | 可写本地文件/读缓存/调用 loopback | 本地内容篡改、缓存投毒、额度滥用 |
| 供应链攻击者 | npm/GitHub Actions/Cargo 依赖、构建期 npx | 在发布物中植入代码（尤其有签名权限的 runner） |
| 隐私观察者 | 市场/CDN 运营方 | 通过 catalog/zip 请求推断用户安装列表/使用时间 |
| DoS/爬虫 | 对市场/CDN/供应商 API 施压 | 让用户无法下载/更新/语音 |

### 3.3 信任边界

    [用户操作]
        |
        v
    WebView (本地页面, CSP connect-src=self) --- IPC ---> Rust host (Tauri)
        |                                                      |
        | 同源 bridge (DSH Host, owner-only)                    +--> api.deepseek.com (TTS/ASR, bearer key)
        v                                                      +--> chat.deepseek.com (public share, no auth)
    DSH Host (LLM/Key/Advisers/Schedule)                       +--> [未来] 市场 HTTPS 下载器 (待实现)

    信任根: Ed25519 公钥 (编译期嵌入 DLC; 未来市场注入) ---> 所有内容/更新签名验证

关键边界：**webview 不可信 → Rust 是唯一可信计算/出网代理**；内容包是**纯数据不可信**；市场 catalog/zip/服务端全部不可信，唯一信任源是签名信任根；DSH bridge 的认证由 DSH 宿主负责（插件自身不设防是已知 P2）。

### 3.4 威胁 → 控制 → 残余风险

| ID | 威胁 | 现有控制 | 缺口/残余风险 |
|---|---|---|---|
| T1 | catalog/zip 被篡改 | Ed25519 + sha256（数据契约层） | 传输/下载器未实现；若实现走 webview 则受 CSP 阻断或需放宽 CSP |
| T2 | 重放旧 catalog（回滚到有漏洞/已下架版本） | 签名 + key 有效期 | **无 serial/expires/最高版本持久化**（P1-1） |
| T3 | 签名 key 泄露 | 轮换/吊销语义已定义；dev 指纹黑名单 | 吊销只在「更新到新版本」生效；无 updater → 传播靠手动升级（P0-2/P1-3） |
| T4 | CDN/镜像投毒 | zip sha256 + 签名（若实现） | 无镜像/缓存规范；无 cache key/缓存投毒说明；catalog 无 ETag/immutable 语义 |
| T5 | 恶意 zip（bomb/穿越/大量文件） | 数据层限制 + 本地 reader 有界 | 下载器/安装器未实现；宿主解压实现未规定（P1-6） |
| T6 | 隐私跟踪 | 默认不联网、无遥测、市场默认 unconfigured | 未来 catalog/zip 请求会暴露 IP/时间/包列表；无日志保留与告知规范（P1-4/P2-7） |
| T7 | 供应商 API 故障/限流 | TTS 本地 fallback + 缓存；分享导入有 429 文案 | ASR 无重试/无 429 处理；TTS/ASR 无 `Retry-After`；无熔断 |
| T8 | 供应链投毒 | 有 lockfile、Cargo.lock、tag 触发 signing gate、保护性 environment | Actions 用移动 tag 未 pin SHA；构建期 `npx --yes` 拉取；无 SBOM/audit 门（P2-8） |
| T9 | 更新链劫持 | 无 updater（当前无该攻击面） | 也没有补丁/吊销通道；未来接 updater 必须 minisign + Authenticode + 防降级（P0-2） |
| T10 | 本机 bridge 滥用 | DSH 宿主 owner/Host/Origin 围栏；插件 content-length 预检；LLM 25 s 超时 | 插件无 Origin/content-type/限流纵深；宿主最多缓冲 300 MiB；并发 chat 可烧额度（P1-5） |
| T11 | 恶意内容（声明造假/越权用途） | 统一用途声明 + 强制确认 + 产品红线 | 声明是作者自述，无审核/投诉/下架流程；远程市场未上线前主要是本地导入 |
| T12 | 依赖第三方 API 条款/稳定性 | 固定端点 + 超时 | 分享接口是网页内部 API，无 SLA、可能改版/限流；UA 伪装可能违反供应商条款 |

---

## 4. 问题清单（P0/P1/P2）

> 每条格式：**证据 → 影响 → 建议 → 验收**。所有「未实测」均明确标注；测试数字来自仓库文档。

### 4.1 P0（发布/信任链阻断）

#### P0-1 生产 DLC 信任根为空 + 包仍是 legacy 签名 → release 的 DLC 信任链不成立

- **证据**：
  - `native/dlc-verify/trust/production-trust-root.json:8`：`"keys": []`（无任何 active 生产公钥；文件头注释声明私钥离线、双人保管）。
  - `scripts/verify-dlc-trust.mjs:634-641`：无 active key 直接报错并阻断发布（设计正确）。
  - `packs/farm-seasons/signature.txt`、`packs/reef-pack/signature.txt` 只有 legacy 签名，无 `signature.json`；而信任根策略 `allowLegacySignatureWithoutKeyId: false`（`production-trust-root.json:4-7`）。
  - `docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md` TL;DR：B1（生产密钥 ceremony）/B5（重签 packs）未完成；「release 门禁当前预期失败（fail-closed）」。
  - `tauri.conf.json:48-49` 仍把两个 pack 作为安装包资源分发；安装版 DLC 加载依赖 `main.rs:1027-1059` 的 packs 目录 + release 内置根。
  - `.github/workflows/_windows-build.yml:182` 为 unsigned preview 走 `--skip-dlc-trust`；`release.yml:98-108` 明确 preview 不得作为 release 发布。
- **影响**：任何 signed release 的 DLC 依赖都会被 fail-closed 拒绝（功能缺失）；唯一目前能产出的 unsigned preview 不在信任模型内，若被误发布则「签名内容」承诺失效。它同时阻断远程市场的上线前提（市场包与 DLC 包共享同一信任根理念）。
- **建议**：完成生产 Ed25519 key ceremony（离线生成、双人保管、记录指纹）；公钥入 `production-trust-root.json`；用 `scripts/make-pack.ts --trust-root` 重签两个 pack 生成 `signature.json`；本地跑 `node scripts/verify-dlc-trust.mjs --exe <release exe>` 直至 exit 0；再触发首次 signed CI。保留 `--skip-dlc-trust` 只用于内部 preview。
- **验收**：`verify-dlc-trust` exit 0（active key + 两个 pack 验签通过 + exe 无运行时覆盖串）；signed release artifact 的 `RELEASE-MANIFEST.json` 记录 `dlcTrust.status=pass`；`Get-AuthenticodeSignature` Valid（P0-2）。

#### P0-2 分发/更新通道没有可验证的发布者身份（NotSigned + 无 updater + SHA256SUMS 无外层签名）

- **证据**：
  - `app/tauri/src-tauri/Cargo.toml:13-18`：无 `tauri-plugin-updater`；`tauri.conf.json` 无 `plugins.updater`/endpoint。
  - `docs/UPDATER-KEYS-2026-11-15.md:1-3,24-27`：minisign key 已生成但「updater 尚未接入」，`latest.json`/回滚演练全未做。
  - `docs/audit/RESOLUTION-AUTHENTICODE-2026-11-19.md:7,17,19,222`：工程流水线已落地，但证书外部阻塞、产物实测 NotSigned；SHA256SUMS 的 minisign/cosign 外层签名仍是 B6 剩余项。
  - `scripts/release-win.mjs:484-496`：只写明文 `SHA256SUMS.txt` 与「Unsigned build: no Authenticode signature」提示；`RELEASE-MANIFEST.json` 记录 unsigned 事实但不构成签名。
  - `docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md:131,346`：吊销传播 = 发布新版本；当前无 Authenticode/无自动更新，用户可能长期停留在旧版。
- **影响**：用户无法验证下载物来自发布者（只能依赖 GitHub/下载页 TLS）；被盗镜像/中间人可提供恶意安装包而无法被密码学拒绝；没有安全补丁通道，key 泄露/内容下架只能靠手动通知；一旦未来接远程市场，内容信任根的吊销传播会被「用户不更新」卡死。
- **建议（可分期）**：① 立即给 `SHA256SUMS.txt` 加 minisign/cosign detached 签名并在 README/下载页写验证命令；② 采购 OV/EV 证书后跑通 signed release；③ 再接 Tauri updater（minisign、HTTPS endpoint、防降级/回滚、分阶段 rollout、kill switch），密钥与 DLC/证书三套分离（已有文档约束）。
- **验收**：`Get-AuthenticodeSignature` Valid；`minisign -Vm SHA256SUMS.txt` 用发布公钥通过；updater 负向测试（错签名拒绝、旧版本拒绝、yank 后不可再装）通过；`docs/RELEASE-SIGNING.md` 与 README 给出一页验证说明。

### 4.2 P1（远程能力接入前置）

#### P1-1 远程市场缺传输层与防回滚契约：按现契约直接实现会引入重放/降级/CDN 投毒面

- **证据**：`content-library.ts:638-725` 只定义数据形状；`:4483-4493` 验签只看签名/key 状态/有效期；catalog 的 `version`/`updatedAt` 不参与任何「是否比本地新」的判断；`docs/content-packs/README.md §6.3` 的下载流程（①..⑦）没有 HTTP 语义、缓存、超时、重试、限流、镜像、过期；`content-hub.ts:1079-1097` 的 `RemoteMarketSource` 只有 `fetchCatalog/fetchPackBytes` 两个裸方法。
- **影响**：持有任意旧版已签名 catalog 的攻击者/被入侵镜像可以重放旧目录（指向旧 zip 或已下架包）；无 `expires` 时客户端无法判断目录是否过期；没有 304/ETag 语义会放大带宽/隐私暴露；没有镜像/缓存规则则 CDN 缓存投毒和回源风暴不可控（虽然 zip sha256 最终能拒绝错误字节，但可用性/成本/回滚仍受损）。
- **建议**：升 `famling.market-catalog/0.2`，最小增补 `serial`（单调递增整数）+ `expires`（UTC）+ 可选 `minAppVersion`；客户端持久化「最近接受的最高 serial + 目录哈希」；`serial` 不增则拒绝（除非强制用户操作「刷新」）；过期目录只在离线宽限期内可用于已安装内容，不允许新安装。把上述写进 `docs/content-packs/README.md §6` 与测试（纯函数、fixtures，不联网）。
- **验收**：新增负向测试：重放旧 serial → fail-closed；过期目录 → 禁止新装；无 serial/expires 的 v0.2 目录 → 校验失败；已有 v0.1 目录双读迁移测试通过。

#### P1-2 CSP 与市场实现方式冲突：必须新增受限 Rust 下载器，不能放宽 CSP

- **证据**：`tauri.conf.json:30`：`connect-src 'self' ipc: http://ipc.localhost`、`img-src 'self' asset: http://asset.localhost data:`；`capabilities/pet-shell.json:9-27` 当前命令白名单无任何下载命令；Cargo 已依赖 `reqwest`（`Cargo.toml:17`）但只用于 TTS/ASR/share；`content-library.ts:652-657` 的 `download.url` 明确是 metadata only。
- **影响**：如果让 UI 直接 `fetch(catalog.url)`，在 Tauri release（CSP 生效）下会被浏览器拦截；如果为了能下载而把 `connect-src`/`img-src` 放宽到 https，就破坏了「webview 不可信、不能任意出网」的现有最强防线，未来一个 XSS 即可直接外传数据。
- **建议**：新增 Rust 命令 `market_fetch_catalog` / `market_download_pack`（或统一 `market_fetch`），入参只允许「已由 UI 传入并经签名校验的 catalog 中的 URL」，并由 Rust 再校验 scheme/host/路径/大小；重定向仅允许同 host 或 catalog 签名的 mirrors；写 app data 下的临时目录；返回 sha256 + 字节或落盘路径。capability 仅授予 `pet`/`main`，并在 handler 内再次校验窗口 label。UI 只接收结果与错误码。
- **验收**：release 构建中 CSP 不变；新增命令有正/负测试（http 拒、私网 IP 拒、跨 host 重定向拒、超大小拒、超时拒、hash 不符拒）；`pet-shell.json` 只加该命令；E2E 用本地 HTTPS fixture 完成一次 catalog+zip 校验（可在 CI 用 loopback 证书或 Rust 单测）。

#### P1-3 信任根生命周期：吊销无法及时传播，且核心不校验注入的 trust root 结构/指纹

- **证据**：`content-library.ts:705-712` 的 `ContentTrustRoot` 只有 `keys` 数组，核心不做「唯一 keyId / 指纹与公钥一致 / 禁止 active+revoked 同 id」校验；`:4452-4480` 直接用调用方给的 `publicKeyPem` 验签，不比对 `fingerprintSha256`；DLC 侧信任根编译期嵌入（`native/dlc-verify/src/lib.rs:18-28,144-219`），轮换/吊销只能随新版本发布（`RESOLUTION-DLC-SIGNING-2026-11-19.md:131,346`）。
- **影响**：若未来市场安装器/宿主把配置/文件中的 trust root 传进核心（很可能），一个写错或恶意替换的 root 会被静默信任；吊销延迟受「用户是否更新 app」支配，而无 updater 时近乎无限（P0-2）。
- **建议**：core 增 `validateContentTrustRoot`（schema 1、唯一 keyId、fingerprint 必须匹配、algorithm 仅 ed25519、状态/有效期合法、禁止 dev 指纹），并在 `verifyDetachedSignature` 内比对指纹；生产 trust root 作为版本化 JSON 入库 + 测试锁死；文档明确「吊销延迟 = 版本传播延迟」，并在 SECURITY.md 写紧急响应（下线 DLC/发紧急版本）。长期随 updater 接入，可选短 TTL 签名的吊销列表（但需单独威胁建模）。
- **验收**：trust root 负向测试（重复 id/指纹不符/dev key/未知字段）；core 验签前强制 `validateContentTrustRoot`；发布文档写明吊销 SLA。

#### P1-4 云端出网（TTS/ASR/share）的隐私与失败语义未闭环，且 Rust 侧响应无上限

- **证据**：
  - `voice.rs:129-193`：TTS 只有本地日额度，无速率限制/无重试；`voice.rs:195-235`：ASR **无任何配额/速率限制**，且先 `base64::decode` 再检查 8 MiB（`:200-210`）。
  - `voice.rs:175`（TTS `response.bytes()`）、`:232`（ASR `response.json()`）、`main.rs:186-189`（share `.json()`）**均无响应体大小上限**；前端的大小检查发生在 Rust 反序列化之后（share：`chat-import/fetch.ts:63-72`）。
  - `docs/legal/PRIVACY.md:36-45,63,85-92`：ASR 供应商留存/跨境/DPA 全为 TBD；TTS/ASR 数据出境的对外披露仍标工程待办；`:94-103` 仍写「无 ASR 告知/同意」——与代码现状（`src/pet/consent/asr.ts`、`gate.ts ensureAsr`、`main.rs grant_host_voice_consent`）已不一致（文档漂移，需修）。
  - 正向：`docs/legal/PRIVACY.md:26-27` 无自由 LLM 调用、遥测默认关；`voice.rs:157,219` 有 45/60 s 超时；`service.ts:17-27` 本地 baked 优先。
- **影响**：隐私合规风险（敏感个人信息/跨境/保留期未披露）；ASR 可被同源 XSS 或本地脚本滥用烧额度（无配额/限流）；供应商侧恶意/被入侵返回超大响应可造成 Rust 进程内存压力；瞬时 429/5xx 无退避会直接失败（ASR 体验差）。
- **建议**：Rust 侧统一 `read_bounded_body`（流式 `take(limit+1)`，TTS ≤8 MiB、ASR ≤4 MiB、share ≤4 MiB，超限立即断开）；ASR 增加日配额 + 每窗口令牌桶（与 TTS 一致）；TTS/ASR 对 408/425/429/5xx 做最多 1-2 次指数退避+抖动，并 honor `Retry-After`；更新 PRIVACY/TTS-TERMS 的保留期/跨境表述，发布前若拿不到供应商书面条款则默认关闭云 ASR（保留 baked/system）。
- **验收**：Rust 单测覆盖超大响应/429/超时；ASR 配额测试；隐私文档与实际代码一致（legal-check 不再报对应 blocker）；release 默认配置下 ASR 可关闭。

#### P1-5 dsh-famling 本机 bridge 的纵深防御与限流依赖宿主，插件自身不设防

- **证据**：`plugins/dsh-famling/index.js:187-192`（method/content-length/JSON 检查后 `request.text()`；先 header 检查已存在，但无 Origin/content-type）；`:266-271` 注册 exact route；无 rate limit（全文件 grep 无令牌桶）；`client.js:809-848` 三处 fetch 无 AbortController/发送中禁用。宿主保护见 hub 审计：exact route owner-only、Host/Origin 围栏实测 401/403（`docs/audit/DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md:155-176`）；宿主在 handler 前最多缓冲 300 MiB、应用层无 rate limit（同文件 `:218-238`）。
- **影响**：同源 XSS/未来同源插件可反复调用 chat（每次 25 s LLM、消耗额度）或 task（把 ≤200 字符写进未来 DSH 会话指令，高权限 prompt sink）；双击/并发会并发烧额度；brief 读网络盘/卡住时无超时。
- **建议**：handler 层加 `content-type: application/json` 强制、Origin 与 `request.url` 同源校验、`sec-fetch-site: cross-site` 直接 403、自定义头 `x-dsh-famling-client: 1`（迫使跨站 preflight）；owner 级令牌桶（如 10 次/10 s，超 429）；brief/task 加 3-5 s 超时；client 三处 fetch 加 AbortController + in-flight 禁用；README 明确「依赖 DSH 宿主保护」。
- **验收**：新增 host 测试（text/plain → 415；evil Origin → 403；cross-site → 403；无限流下第 N 次 429；慢 brief 超时返回 5xx）。

#### P1-6 下载/解压/安装链路未实现，且「宿主解压边界」不在当前契约内

- **证据**：`content-library.ts:608-630` 注释明确「host MUST unzip and compute sha256」；`validatePackZip`（`:3905-4004`）只校验 inventory，不读 zip；`content-assets.ts:9-32` 的本地 bounded reader 可参考但未接入市场；`content-hub.ts:596,822` 远程包目前一律拒绝导入。
- **影响**：实现安装器时若用第三方 unzip 库，zip bomb、zip slip（`../`、绝对路径、盘符/UNC）、symlink、zip64、加密条目、重复条目大小写碰撞等都可能在解压阶段绕过数据层校验；解压写盘位置/原子性/磁盘配额不明确会造成覆盖或残留。
- **建议**：复用/抽出 `src/pet/content-assets.ts` 的 bounded reader 作为唯一解压入口，并加：流式解压到临时目录、拒绝 symlink/加密/zip64、总写入上限 32 MiB、单文件 8 MiB、压缩比 ≤128、路径规范化（复用 `isSafeZipEntryPath` 的规则）、解压后逐文件 sha256 与 `files[]` 比对、原子 rename 安装、失败清理、卸载只删该包目录。
- **验收**：恶意 zip fixture 全覆盖（bomb、穿越、重复、大小写碰撞、symlink、加密、zip64）；安装中断/断电模拟后无半装状态；`validatePackZip` 与磁盘结果一致。

#### P1-7 插件分发/更新通道不可信且版本漂移（npm 占位 vs 本地 0.10.0）

- **证据**：`plugins/dsh-famling/package.json:3`（version `0.10.0`）、`:66-68`（`engines.dsh >=0.2.1-rc.5 <0.3.0`）；该目录**无 .git**（hub HANDOFF 记录「靠拷贝同步」）；hub 审计记录 npm registry 上 `dsh-famling` latest=`0.0.1`（名称保留占位，描述/版本与本地不一致）：`docs/audit/DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md:298-299`；`package.json` 无 `repository` 字段。
- **影响**：用户若按公开名 `dsh plugin add dsh-famling` 安装，很可能拿到 0.0.1 占位而不是当前插件；没有更新通道/provenance，插件更新无法验证来源；本地 link 安装依赖手工操作，易出现「运行的是旧版本」的漂移（本项目已多次发生）。
- **建议**：以真实版本发布到 npm（带 `--provenance` + repository 字段 + 内容哈希），把占位版本 deprecate；DSH 侧或插件侧提供版本检查（只读、可关闭）；文档明确「当前仅本地 link 安装」与版本号；把插件 `package.json` 的版本与 `client.js` 中记录的 chunk-sha256 一并纳入测试。
- **验收**：`npm view dsh-famling version` 与本地一致；`npm provenance` 可验；插件升级演练（旧→新、回滚）通过；README 安装说明唯一且可复现。

### 4.3 P2（纵深防御/隐私/运维）

**传输与下载器**

- **P2-1 SSRF/主机允许列表**：`parseHttpsUrl`（`content-library.ts:1977-1994`）只要求 credential-free HTTPS，允许任意主机（含 `127.0.0.1`、私网域名、云 metadata IP 形式）。未来 Rust 下载器必须显式拒绝 loopback/私网/link-local、只允许 catalog 签名覆盖的 host（或市场固定 domain 列表），并限制重定向。
- **P2-2 无镜像/CDN/缓存语义**：无 `ETag`/`If-None-Match`/`Cache-Control`/immutable/镜像列表/`429 Retry-After` 约定；catalog 每次刷新都全量拉取会放大隐私与成本。建议 catalog 边缘缓存 60 s + 客户端条件请求；zip `immutable` + sha256 强校验；镜像列表写进签名 payload（`download.mirrors[]`）或至少全部 zip 由同一 sha256 约束。
- **P2-3 限流/重试参数未定义**：客户端只有 TTS/import 本地桶（`rate-limit.ts:130-160`），没有市场请求桶、没有退避/抖动/熔断/并发上限；服务端无限流设计。建议全局限「市场请求 ≤5/分钟、下载并发 1、失败指数退避 3 次（1/2/4 s + 抖动）、429 honor Retry-After」；服务端按 IP/会话限流并返回标准头。
- **P2-4 下载大小/时间/磁盘配额未定义**：catalog ≤1 MiB、zip ≤16 MiB 是数据层上限（`content-library.ts:176-194`），但没有传输层超时/最小速率/断点续传/磁盘剩余检查；无 `Range`/resume 设计。建议下载器 30 s 连接/120 s 总超时、最小速率触发重试、临时文件 + sha256 校验、安装前检查磁盘空间（≥2×zip+解压上限）。

**隐私/遥测**

- **P2-5 Sentry DSN 可通过 URL 参数注入**：`src/aquarium/main.ts:25-26` 从 `?sentry=` 读 DSN，开启后上报到任意 DSN；`observability.ts:68-88` 只做 `sendDefaultPii:false`。在 Tauri 下 `connect-src` 会拦掉 Sentry 出网（`tauri.conf.json:30`），所以当前实际不会外传；但这是「功能声明与实际不一致 + 未来放宽 CSP 即变隐私洞」。建议只允许构建期注入 DSN，移除 query 注入；记录 opt-in 同意（隐私政策 R-P2-04）。
- **P2-6 无导航白名单**：未设置 `on_navigation`/新窗口策略；当前所有 `window.open` 都是本地页面（`main.ts:3166,3227`），但未来任何用户可控链接都可能把 webview 导航到远程页面（IPC 仍受 remote-domain 限制，风险以钓鱼/展示为主）。建议显式允许 app origin，其余交给系统浏览器。
- **P2-7 隐私告知缺未来市场数据流**：`docs/legal/PRIVACY.md:20-46,124` 仍写「无远程字体/CDN」；远程市场一旦上线，catalog/zip 请求会向市场运营方暴露 IP、时间、User-Agent、已安装包 id（若下载 URL 按包名区分）。上线前必须补：数据流、日志保留期、无账号/无遥测默认、离线可用、拒绝跟踪的方法，以及「市场服务器不在境内」的跨境披露。

**供应链/CI/发布**

- **P2-8 CI Actions 未按 commit SHA 固定**：`ci.yml:26,28,73,75,106,108,110,126,128,133,135`、`release.yml:48,50`、`_windows-build.yml:57,59,71,211` 使用 `actions/checkout@v4` 等移动 tag；构建期 `npx --yes @tauri-apps/cli@2.12.6` 从 npm 拉取（`_windows-build.yml:144,158`）。保护性 environment + required reviewers 降低了风险，但 release 构建仍应 pin SHA、把 tauri CLI 固定进 devDependencies/lockfile、加 `npm audit`/`cargo audit`/SBOM（syft）与 provenance。
- **P2-9 无发布物外层签名/清单**：与 P0-2 配套，`SHA256SUMS.txt` 是最终完整性证据但没有发布者签名；`RELEASE-MANIFEST.json` 只是自述 JSON（可被一起替换）。建议 minisign/cosign 覆盖 SHA256SUMS + manifest，公钥写进 README。
- **P2-10 dirty tree/陈旧 dist 风险**：本评审快照 `git status` 有 18 项未提交（含 `content-library.ts`/`content-hub.ts`/`main.ts` 等大改，属于在途 v2 内容市场工作），而 `dist/` 是 10:43 构建、早于 12:24 的源码改动（即已过期）。`repro-check.mjs:142-148` 在 release 模式会把 dirty tree 判 fail，但本地 `node scripts/release-win.mjs` 若手工运行仍可能打包陈旧 `dist/`（Tauri 的 beforeBuildCommand 会重建，便携包打包逻辑需确认）。建议发布脚本强制「clean tree + 重新 vite build + dist 哈希进 manifest」。

**Rust 网络实现细节**

- **P2-11 出网实现细节**：`main.rs:172` 的浏览器 UA 伪装用于公开分享读取（可能违反供应商条款/被反爬识别）；`reqwest` 用 `rustls-tls`（依赖编译期根证书，根更新需重编）；无 `connect_timeout` 只有总超时；无连接复用/重试策略文档。建议显式记录 UA/条款依据、加 connect timeout、把根证书更新纳入发布节奏。
- **P2-12 TTS 缓存/额度无上限**：`voice.rs:84-107` 的 WAV 缓存按文本哈希永久增长（有 `voice_cache_clear` 清缓存，但无自动 GC/上限）；quota.json 也不清理。本地长期使用可能占满磁盘；缓存 key 用非加密哈希（本地投毒风险低但无完整性）。建议缓存 LRU（例如 256 MiB / 30 天）、缓存写前校验、`voice_status` 暴露用量。

---

## 5. 远程内容市场协议草案（建议 v0.2 + transport profile）

> 说明：以下为**评审建议**，不是现状；目标是把 §4 的 P1 变成可测试契约。所有数据仍是纯 JSON，签名覆盖 canonical JSON；网络层只在 Rust host，webview 不直接出网。

### 5.1 角色与原则

- **Root**（离线，长期）：签名/撤销信任根元数据；不会每日使用。
- **Catalog key**（在线签发，短周期）：签 `catalog.json`；可轮换；泄露影响可撤销（新 catalog serial + 客户端最短刷新）。
- **Pack key**（发布时离线/受控）：签每个 pack 的清单与 zip 哈希；可与 catalog key 分离。
- 原则：**catalog 与 pack 分开签名**（现状已如此）；**客户端不信任任何未签名元数据**；**先验签再落盘，先 hash 再解压**；**默认离线可用**；**不静默更新**。

### 5.2 catalog v0.2（在 0.1 上做 MINOR 增补）

```json
{
  "schema": "famling.market-catalog/0.2",
  "serial": 42,
  "version": "2026.11.19.1",
  "updatedAt": "2026-11-19T08:00:00Z",
  "expires": "2026-12-19T08:00:00Z",
  "keyId": "famling-market-catalog-2026-11",
  "signature": { "algorithm": "ed25519", "keyId": "famling-market-catalog-2026-11", "value": "..." },
  "packs": [
    {
      "id": "community.selkirk-theme",
      "version": "1.0.0",
      "name": "塞尔凯克角色主题",
      "description": "灰白卷毛猫角色主题（研究用途）。",
      "preview": "https://market.example/preview/selkirk.1.0.0.png",
      "usageDeclaration": { "researchOnly": true, "...": "canonical 用途声明（与 0.1 相同）" },
      "download": {
        "url": "https://cdn.market.example/packs/community.selkirk-theme/1.0.0.zip",
        "zipSha256": "64-hex",
        "bytes": 1234567
      },
      "signature": { "algorithm": "ed25519", "keyId": "famling-market-pack-2026-11", "value": "..." }
    }
  ]
}
```

规则：`serial` 单调递增；`expires` 必须晚于 `updatedAt` 且不超过 90 天；`packs[]` ≤256；`download.bytes` ≤16 MiB；`preview` 仅展示、不允许在 webview 直接加载（见 P1-2）。

### 5.3 HTTP 传输 profile（客户端必须实现的语义）

| 项 | 要求 |
|---|---|
| 源 | 仅 HTTPS（TLS ≥1.2），HSTS 语义；catalog 与 zip 的 host 必须在编译期 allowlist（`market.example`），镜像 host 必须出现在签名 payload 里 |
| catalog GET | `GET /v1/catalog.json`；请求头 `If-None-Match: <etag>`；支持 `304 Not Modified`；`ETag` 必须稳定；`Cache-Control: public, max-age=60, must-revalidate` |
| 响应上限 | catalog ≤1 MiB（硬上限，超限断开）；`Content-Length` 不可信时以流式读取为准 |
| zip GET | `GET <download.url>`；`Accept: application/zip`；`Cache-Control: public, max-age=31536000, immutable`（版本化路径）；响应 ≤ `download.bytes`（硬上限）；支持 `Range`（断点续传） |
| 重定向 | 最多 3 跳，且只允许同 host 或签名 payload 中 mirror host；拒绝 `Location` 指向私网/loopback |
| 超时 | 连接 10 s；catalog 总 15 s；zip 总 120 s（可配）；最小速率 32 KiB/s 连续 10 s 触发失败 |
| 重试 | 仅 408/425/429/500/502/503/504；最多 3 次；指数退避 1/2/4 s + 抖动；honor `Retry-After`；其余错误不重试 |
| 限流 | 客户端市场请求 ≤5/分钟、下载并发 1；服务端按 IP 返回 `429` + `Retry-After` + `X-RateLimit-*` |
| 并发/取消 | 所有请求带 AbortSignal；用户取消/离开页面即 abort；下载任务单飞 |
| 失败码 | 稳定错误码：`E_NETWORK` / `E_TIMEOUT` / `E_TOO_LARGE` / `E_HTTP_<status>` / `E_HASH` / `E_SIG` / `E_ROLLBACK` / `E_EXPIRED` / `E_UNSUPPORTED`；UI 只展示本地化短句，不展示原始 URL/内容 |
| 条件刷新 | 启动/打开市场 tab 不自动刷新；用户点刷新或距上次 >24 h 才拉 catalog；无网络时用缓存 + 明确「离线/已过期」 |

### 5.4 防回滚/防重放（必须新增）

```text
本地状态: { highestSerial, catalogSha256, acceptedKeyId, lastRefreshAt, offlineGraceUntil }
收到新 catalog:
  1) validateMarketCatalog + verifyMarketCatalogSignature (trust root)
  2) now <= expires + grace(7d) ? 否则 E_EXPIRED（已装内容仍可用，禁止新装）
  3) serial > highestSerial ? 接受并持久化 :
       serial == highestSerial && sha256 == catalogSha256 ? 幂等接受 : E_ROLLBACK
  4) 只有序列化后的纯数据进入安装器；任何 UI 状态不参与信任判断
```

- 用户可显式「仍然刷新」但**不允许**降低 serial（避免社工降级）；如需回滚内容，由发布方发布**更高 serial** 的目录并下架该包。
- 拒绝回滚的日志只记录 serial/哈希/时间，不记录用户输入。

### 5.5 下载/安装状态机（客户端不变量）

```text
IDLE -> FETCH_CATALOG -> VERIFIED_CATALOG -> USER_CONFIRM_USAGE
   -> DOWNLOAD_TO_TEMP -> HASH_OK + SIG_OK -> UNZIP_BOUNDED -> VALIDATE_PACK
   -> REMOTE_SIG_OK -> MERGE_ATOMIC -> INSTALLED (可离线使用/可卸载)
任何一步失败 -> CLEAN_TEMP, 保留旧版本, 错误码上报(仅本地)
```

- 临时文件只写 app data 下的随机目录；安装用「新目录 + rename」原子替换；断电恢复：启动扫描未完成标记并清理。
- 任何 pack 的 `pack.json` 在 zip 根；解压后逐文件 sha256 必须与 `files[]` 完全一致；`files[]` 与解压清单双向一一对应（现 `validatePackZip` 已覆盖）。
- 安装后 `source: remote` 的 pack 必须带 `verifyRemote` 验签结果才能 merge（现 `mergeCharacterThemes` 已 fail-closed）。

### 5.6 CDN / 镜像 / 缓存

- **不可变资产**：zip 路径含 id+version（`/packs/<id>/<version>.zip`），永久缓存；catalog 短缓存 + ETag。
- **Origin shield / 多镜像**：镜像列表写进签名（或至少由同一 `zipSha256` 约束），客户端按顺序回退并各自限流；镜像故障不得阻塞主源。
- **缓存投毒**：CDN 缓存 key 不包含 Cookie/Authorization/User-Agent 等可变头；catalog 请求不带用户标识；zip 的 sha256 在客户端最终校验，CDN 篡改只能造成 DoS 不能造成内容伪造。
- **下架/kill switch**：发布更高 serial 的 catalog 移除包；客户端只相信签名目录，不信任 CDN purge；对已装内容提供「标记失效 + 下次启动提示卸载」，不做静默删除。
- **成本**：catalog 1 MiB × 每日刷新可控；zip 只在用户确认后下载，避免后台预取。

### 5.7 隐私与遥测

- 市场请求**不带账号/设备标识/安装 id**；catalog 不按用户返回内容（避免个性化跟踪）；UA 用产品通用串。
- 默认无遥测；仅本地错误码/失败计数（可选，可关闭），不上传内容/URL。
- 服务端只保留聚合访问日志（建议 ≤7 天，或只保留 5xx/限流计数）；不记录 IP 全量；隐私政策明确「访问市场会向运营方暴露 IP/时间/UA/所请求包 id」。
- 离线优先：无网络时应用全部本地内容可用；市场 UI 明确「上次成功刷新时间/是否过期」。

### 5.8 密钥生命周期（与 DLC 统一口径）

- Ed25519；`keyId` 出现在每个签名；trust root 记录 `publicKeyPem + fingerprintSha256 + status(active/retired/revoked) + notBefore/notAfter`；core 必须校验 fingerprint 与公钥一致（P1-3）。
- 轮换：先发「新 active + 旧 retired」版本 → 用新 key 重签 catalog/pack → 旧 key 转 revoked/移除；旧客户端仍信任旧 key，故所有吊销必须有「客户端版本 + 时间」双条件说明。
- **canonical JSON 必须跨语言可复现**：建议发布 5-10 组测试向量（含中文、数组、数字、嵌套），并明确「UTF-8、键排序、无 HTML 转义、数字只用整数/固定格式」；当前 TS 用 `src/pack/canonical.ts`，Rust 有对应实现与测试，但未来市场服务端若用 Go/Python 极易在 `ensure_ascii`/HTML 转义/浮点上不一致。

### 5.9 更新通道（与内容市场分离，但共享密钥治理）

- **签名链**：Authenticode（PE 发布者身份）+ minisign（Tauri updater 更新包）+ HTTPS（传输）。任一缺失都不构成「可验证更新」。
- **endpoint**：固定 HTTPS 域名 + 路径；`latest.json` 内含 version/pub_date/platform signature；客户端只接受「版本高于当前且签名有效」；拒绝降级（除非显式 `--allow-downgrade` 的管理员操作）。
- **分阶段**：内部 → 5% → 25% → 100%；每阶段可 yank；保留上一版安装包与校验文件（回滚 = 手动重装 + 数据备份说明）。
- **紧急响应**：内容 key 泄露时发布新版本（新 trust root）+ 下架 DLC；更新 key 泄露时吊销证书/换 minisign key + 发安全公告；两者都需要发布者身份链（P0-2）。

### 5.10 版本与失败码

- 数据 schema：`famling.content/0.2`（已有）、`famling.content-pack/0.2`（已有）、`famling.market-catalog/0.2`（建议新增）；传输 profile 单独版本号 `famling.market-transport/1`，客户端声明支持范围。
- 兼容：v0.1 catalog 双读（现有 0.1 适配思路），但 v0.1 不允许新装（缺少 serial/expires）。
- 所有失败在 UI 只显示短句 + 「查看详情」（本地错误码/时间），不显示远程返回的 HTML/长文本。

---

## 6. 优化/重构建议（收益 / 成本 / 风险）

| # | 建议 | 收益 | 成本 | 风险/注意 | 优先级 |
|---|---|---|---|---|---|
| 1 | 生产 DLC key ceremony + 重签 packs + signed CI | 关闭 P0-1；DLC 信任链成立 | M（1-2 人日 + 密钥保管流程） | 私钥离线/双人；备份与丢失预案 | P0 |
| 2 | SHA256SUMS minisign/cosign 外层签名 | 用户可验证发布物；P0-2 止血 | S（0.5 人日） | 公钥分发/轮换；文档 | P0 |
| 3 | catalog v0.2 serial/expires + 客户端防回滚状态机 | 关闭 P1-1 的重放面 | S-M（协议 + 纯函数 + 测试） | 需要本地状态存储与迁移；不能过度打扰用户 | P1 |
| 4 | Rust 受限下载器（allowlist/redirect/size/time/atomic） | 关闭 P1-2；CSP 不放宽 | M（2-4 人日 + 测试 fixture） | 新增 IPC 面要 ACL/capability；SSRF 测试 | P1 |
| 5 | 复用 bounded zip reader 做安装器 | 关闭 P1-6；把 zip 攻击面变成已测代码 | M（1-2 人日，已有 reader 可复用） | 原子安装/断电恢复；fuzz | P1 |
| 6 | trust root 校验 + 指纹绑定 + 吊销文档 | 关闭 P1-3；避免宿主注入错误根 | S（0.5-1 人日） | 与 DLC Rust 根保持一致 | P1 |
| 7 | 接入 Tauri updater（minisign）+ 防降级 | 安全补丁/吊销传播通道 | L（3-5 人日 + 演练） | 更新 key 泄露=RCE；必须离线保管 + environment 审批 | P1（公开前） |
| 8 | Rust 响应上限 + ASR 配额 + 429 退避 | 关闭 P1-4 的资源/成本面 | S-M（1-2 人日） | 不破坏现有 TTS 缓存/动画 | P1 |
| 9 | bridge handler 纵深防御 + 限流 | 关闭 P1-5 | S（0.5 人日） | 保持 owner/宿主语义不重复实现 | P1 |
| 10 | CI Actions pin SHA + tauri CLI 入 lockfile + audit/SBOM | 降低供应链风险 | S-M（0.5-1 人日） | Dependabot 维护成本 | P2 |
| 11 | 市场隐私告知 + 数据流表 + 日志保留 | 合规；上线前置 | S（0.5 人日，需法务） | 与现有隐私政策一致 | P2 |
| 12 | 本地 TTS 缓存 LRU/用量展示 | 避免长期磁盘膨胀 | S | 不影响离线优先 | P2 |

**分阶段路线**：

- **A（立即，1-2 周）**：P0 两项 + P2-9 外层签名 + P2-10 clean-tree 发布约束。目标：能产出「信任链成立」的 signed release。
- **B（2-3 周，不联网）**：P1-1/P1-3/P1-6 的协议与纯函数测试；P1-4/P2-11/P2-12 的 Rust 资源硬化；P1-5 bridge 硬化。目标：市场「数据/校验/安装器」在无网络下可测。
- **C（3-5 周）**：P1-2 Rust 下载器 + fixture 测试 + 默认关闭；市场 UI 只读目录（不下载）。目标：端到端离线 fixture 演练。
- **D（公开前）**：P1-7 插件真实发布 + P2-7 隐私告知 + 服务端/CDN/审核/下架流程 + 小范围试点；**不做付费情感关系**（既有产品红线）。
- **E（长期）**：updater + 密钥轮换演练 + 可复现构建 + SBOM/provenance。

---

## 7. 建议先做 3 件（可执行、可验收）

### 第 1 件：闭合发布信任链（P0-1 + P0-2 的止血部分）

- **动作**：生产 Ed25519 key ceremony → 公钥写入 `native/dlc-verify/trust/production-trust-root.json`；用生产 key 重签 `packs/farm-seasons`、`packs/reef-pack`（生成 `signature.json`）；`node scripts/verify-dlc-trust.mjs --exe <release exe>` 跑绿；给 `SHA256SUMS.txt` 加 minisign/cosign 签名并在 README 写验证命令。
- **为什么先做**：远程市场/更新的一切「先验签再使用」都依赖同一套信任根与发布者身份；没有它，后面做的下载器/市场安装器都无法被用户可信地验证。
- **验收**：`verify-dlc-trust` exit 0；signed release manifest 记录 dlcTrust pass；`Get-AuthenticodeSignature`（证书到位后）Valid；`minisign -Vm SHA256SUMS.txt` 通过；README 验证步骤 ≤10 行。

### 第 2 件：定稿市场传输 + 防回滚规范（P1-1，纯文档+纯函数）

- **动作**：`famling.market-catalog/0.2`（serial/expires）+ `famling.market-transport/1`（§5.3/§5.4）；新增 `validateMarketCatalogV2` + 客户端最高 serial 状态机 + 负向测试（重放/过期/降级）；把 canonical JSON 跨语言测试向量写进 `docs/content-packs/`。
- **为什么先做**：这是**无网络即可完成、且决定后续所有实现正确性**的一步；先有它就避免下载器/安装器写完再返工。
- **验收**：新增 10+ 负向测试全绿；协议文档含失败码表与示例；不新增任何 fetch 调用（grep 可证）；task-52/54 的 v2 内容模型直接引用该版本。

### 第 3 件：实现受限 Rust 下载器 + bounded 解压/原子安装（P1-2 + P1-6，默认关闭）

- **动作**：新增 `market_fetch_catalog`/`market_download_pack`（只接受已验签 catalog 的 URL；HTTPS/主机 allowlist/禁私网/限重定向/限大小/超时/Abort）；复用 `src/pet/content-assets.ts` bounded reader 解压；临时目录 + sha256 + 原子 rename；capability 只给 `pet/main`；默认 `market.configured=false`，用本地 fixture（loopback HTTPS 或 Rust 单测）演练。
- **为什么先做**：当前「数据契约正确但传输/安装 0 行」是最大的落地风险；先把安全边界写成代码并测试，再谈市场 UI/服务端。
- **验收**：CSP 不变；新增命令 ACL 最小；恶意 zip/重定向/私网/超大小/超时用例全拒；断点续传与失败清理测试；fixture 端到端「catalog→下载→hash→解压→校验→merge」通过；全程不访问真实市场。

---

## 8. 与既有审计/任务的关系

| 既有项 | 本评审关系 |
|---|---|
| `docs/audit/FAMLING-SECURITY-AUDIT-2026-11-18.md` P2-7（更新/分发/签名） | 本评审 P0-2 与其一致；补充「无发布者外层签名」「吊销传播」与「更新通道是远程市场前置」的网络视角。 |
| 同审计 P2-6（云端 TTS/ASR 配额/key） | 本评审 P1-4 补充 Rust 响应体无上限、无 429 退避、ASR 无配额。 |
| `docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md`（task-41） | 机制已闭合；本评审 P0-1/P1-3 是「尚未完成的生产 key ceremony + 吊销传播」。 |
| `docs/audit/RESOLUTION-AUTHENTICODE-2026-11-19.md`（task-46） | 工程流水线已完成；P0-2 补充 SHA256SUMS 外层签名与 updater。 |
| `docs/audit/RESOLUTION-CONSENT-GATE-2026-11-19.md`（task-43） | 本评审 P1-4 的隐私部分以其为前提；删/改前不要重复实现。 |
| hub `docs/audit/DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md` | 本评审 P1-5/P1-7 引用其 bridge 与 npm registry 事实。 |
| task-52/53/54（内容模型 v2/插件市场 UI/famling 市场入口） | **建议先落 P1-1 协议（第 2 件）再开 UI**；task-54 必须在第 3 件下载器之后，否则会退回「webview 直连/放宽 CSP」的错误路径。 |

---

## 9. 待决策问题（给 lead）

1. **密钥 ceremony owner 是谁、何时做？** 谁持有生产 Ed25519 私钥、双人如何分工、丢失预案是否演练？（P0-1 阻塞）
2. **是否购买 Authenticode 证书？** 若不买，是否接受「仅 SHA256SUMS 外层签名 + 明确未签名警告」作为公开版？公开/收费前必须回答（P0-2）。
3. **市场首批是「只读目录 + 本地导入」还是直接在线下载？** 建议先只读目录 + fixture 演练，在线下载至少晚一个版本（P1-1/P1-2）。
4. **市场服务端/CDN 是否自建？** 若自建，日志保留/跨境/合规与 DDoS 成本谁承担；若用第三方对象存储，签名 host allowlist 如何固定？
5. **内容审核/下架/投诉流程**：谁审、多久响应、下架后已装用户如何处理（静默删除 vs 提示）？
6. **ASR 供应商条款与跨境**：拿不到书面结论时是否默认关闭云 ASR（PRIVACY §7 建议）？TTS 商业条款是否允许再分发 baked WAV？
7. **更新通道排期**：updater 是否在公开版前必须接入？若否，key 吊销的 SLA 如何写进 SECURITY.md？
8. **是否允许第三方镜像/转载**？若允许，如何把镜像纳入签名模型与投诉流程？

---

## 10. 附录 A：只读核对命令（可复跑）

```bash
# 出网/网络相关代码
cd <private-path>
grep -rn -E "fetch\(|https?://|WebSocket|XMLHttpRequest" src app/tauri/src-tauri/src | grep -v node_modules
grep -n -E "fetch|http|market|remote" src/pet/content-library.ts | head

# 信任根/发布门禁
cat native/dlc-verify/trust/production-trust-root.json
node scripts/verify-dlc-trust.mjs --report-only --json   # 预期：无 active key（fail-closed）
grep -n "skip-dlc-trust" .github/workflows/_windows-build.yml scripts/release-win.mjs

# 市场契约/校验（不联网）
grep -n -A5 "verifyMarketCatalogSignature" src/pet/content-library.ts
node --import tsx --test tests/content-pack-v2.test.ts   # 文档记录 29 项；本评审未复跑

# 插件 bridge
cd <private-path>
grep -n -E "BRIDGE_PATH|MAX_BODY|LLM_TIMEOUT|rate" index.js

# 现状快照（本评审实测）
cd <private-path> && git status --porcelain | wc -l   # 18
find public/assets/voice/pet -name "*.wav" | wc -l                        # 42
du -sh public/assets/voice/pet                                            # 4.2M
ls -la public/content/library.json                                        # 14,545 B
```

> 说明：上述命令中带「预期」的是根据代码静态推断的 fail-closed 行为，本评审未运行发布门禁/测试；`node --import tsx` 在 WSL 下可能因 esbuild 平台不匹配失败（仓库文档 `docs/design/CONTENT-MARKET-2026-11-19.md §5.6` 已记录）。

## 附录 B：限制与声明

- **只读**：本评审未修改任何代码/资产/配置，只新增本文件；未 commit/push。
- **快照**：结论基于 2026-11-19 12:50 左右 working tree；当时有 18 项未提交改动（含在途 v2 内容市场），与 git HEAD `779354b` 不完全一致；正式决策前应以提交后的代码复核。
- **未实测**：未运行 `npm test`/`tsc`/`cargo`/发布门禁/真实下载/签名 ceremony/网络抓包/压测；文中测试数字与 NotSigned 结论均引用仓库文档记录（已标出处），不是本评审复跑。
- **未联网**：未访问市场/CDN/DeepSeek；未读取或打印任何密钥/凭据文件内容（`.keys/` 仅列目录名）。
- **建议**：本文件的协议部分（§5）是建议稿，采用前需安全/法务/发布 owner 共同评审，并按「先测试后上线」推进。

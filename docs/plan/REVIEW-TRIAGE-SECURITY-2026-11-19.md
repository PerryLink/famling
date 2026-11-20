# 安全 / 网络 / 发布：七份评审的去重、分级与任务化

> 文件：`docs/plan/REVIEW-TRIAGE-SECURITY-2026-11-19.md`
> 读者：lead、release owner、安全/网络/发布执行者。
> 状态：**只读分析**。本轮未改任何代码/资产/配置/密钥；唯一写入是本文；未 commit/push；未联网；未读取或打印任何私钥/凭据内容。
> 快照：2026-11-19 14:20–15:10 +08，HEAD `7107a61`（**写本文前**工作树仅 4 个 docs 变更；本文自身为新增文件）；评审原文快照约 12:50–13:20 +08，HEAD `779354b` + 脏工作树。
> 关联评审：`docs/research/PROJECT-REVIEW-{ARCHITECT,SOFTWARE,NETWORK,GAME,QA,PSYCHOLOGY,UX}-2026-11-19.md`；索引 `docs/research/PROJECT-REVIEW-ALL-FINDINGS-2026-11-19.md`。

---

## 0. 一页结论

### 0.1 结论

1. **没有发现「远程可直接打穿当前代码」的 P0**（与历史安全审计结论一致）。真正的 P0 集中在三类：**发布信任链/发布者身份不成立**、**发布物与源码不可自证**、**远程市场在启用前缺少传输/安装边界**。
2. 七份评审中与本域相关（安全/网络/发布/供应链/市场/consent 边界）的原始条目经去重后为 **30 个独立问题**（§3.2，含 1 项已闭合）；落到可执行任务 **34 个**（P0 13 / P1 19 / P2 2，按目标发布通道；见 §4）。
3. 评审快照之后已有 3 个提交（`d5655c9` 内容 v2、`0bbbe43` 远程市场客户端、`7107a61` 菜单），其中 **`0bbbe43` 已实现目录验签、serial 防回滚、pack sha256+签名、受限 URL 策略和注入式安装回调**（29 项离线测试）。因此网络评审的「传输 0 行 / 无防回滚」**已部分失效**，不能按原文优先级直接排期；但**协议仍是 catalog 0.1、无 `expires`/离线宽限、无 Rust 下载器、无真实市场**，剩余缺口见 §2.3。
4. **当前发布严格不成立**：DLC 生产信任根仍为空（实测 gate 3 条 error）；两个 DLC 包仍是 legacy 签名；Authenticode 实测 `NotSigned` 且无证书；updater 不存在；`SHA256SUMS.txt` 无发布者外层签名；`legal-check --strict` 仍 **34 blockers**；仓库仍无 git remote，CI 从未真实运行。
5. **产品当前唯一获批路径是「邀请制、未签名私域 beta」**（`docs/plan/RELEASE-HANDLING-2026-11-17.md` 路径 A），但多数评审的 P0 是按「公开 signed 发布」评的。两者不先对齐，团队会同时出现**过度阻塞**（把公开门槛压到 beta）和**错误放行**（beta 阶段拿 signed 口径宣传）两种错误。必须先定义发布通道（C0–C3）与每档 gate（§5）。
6. **建议第一批 5 件事**：① `SEC-104`（ceremony 前把 DLC 从 release 移除）；② `SEC-202`+共享质量门（干净 checkout/HEAD 可重建）；③ `SEC-201`（发布证据包：SHA256SUMS + RELEASE-MANIFEST + BUILD-INFO + commit/tag 绑定）；④ `SEC-401`（市场出网边界 ADR，先于任何 UI 接线）；⑤ owner 立即启动 `SEC-102`（DLC 生产密钥 ceremony）与 `SEC-106`（证书采购）。

### 0.2 最重要的 3 个矛盾

| # | 矛盾 | 一句话 |
|---|---|---|
| 1 | **C-01 市场出网边界** | 网络评审要求「Rust 是唯一出网代理、CSP 不放宽」；但评审后新增的 `content-market.ts` 生产默认走 **webview 全局 `fetch`**，文档还写「宿主只需注入 client」。按现设计接线，要么在 release CSP 下直接失败，要么被迫放宽 `connect-src`，两种结果都不可接受。 |
| 2 | **C-02 P0 的前提是哪个发布通道** | 网络/架构/游戏评审按「公开 signed 发布」把 Authenticode/updater/DLC 根列为 P0；产品计划当前只批「邀请制 unsigned beta」，而 `RELEASE-CHECKLIST` 又写成「证书到位前只能发布 signed release」。P0 不先绑定通道，排期必然互相打架。 |
| 3 | **C-03 五份评审各自的第一件事不同** | 网络=先闭合发布信任链；软件/QA=先让干净 checkout/CI 变绿；架构=先冻结共享语义；游戏=先做可玩角色资产包；QA 又要求先做 GUI 数据隔离。它们不是同一目标，但都自称 P0。见 §2.1 C-03 的裁定与 §5 的执行顺序。 |

### 0.3 数量与口径

- 本域**自建任务 34 个**：P0 13、P1 19、P2 2；另有 **1 个条件任务**（updater 实现，仅在 ADR 决定做时追加）。
- 估算合计 **≈48–55 人日工程**（不含外部证书/法务/服务器等待，不含被引用的共享任务）。
- 另引用**共享任务 8 项**（QA 数据隔离、干净 checkout/CI、E2E/soak 证据、运行时 storage 隔离、legal 文档生成、插件自证等），本文件不重复建任务，只给安全验收与依赖：见 §2.4。

---

## 1. 评审范围、快照与证据

### 1.1 七份评审在安全/网络/发布面的结论（原文编号）

| 评审 | 与本域相关的结论 | 本文件处理 |
|---|---|---|
| 架构师（A） | P0-3 发布信任与版本身份未闭环；P1-2 远程市场/安装器缺系统设计；P1-6 公开镜像与私仓 CI 断链；P1-7 Tauri 同源 storage；§7.5「生产信任根/签名/更新就绪前不上线远程市场」。 | P0-3 拆成 EP-SEC-1；P1-2 拆 EP-SEC-4/5；P1-6 作为发布证据/CI 依赖；P1-7 交 triage-arch/security 共享；§7.5 并入 §5 gate 和 §7 不做。 |
| 软件工程师（S） | P0-1 无 remote、CI 从未运行、干净 checkout 必红；P2-5 CI/供应链（Actions 未 pin、无 clippy/audit）；P2-6 插件不可从自身仓重建。 | P0-1 是 C1 前置（共享 T-QA/软件）；P2-5 合并进 `SEC-203`；P2-6 交 triage-arch，仅保留插件发布信任（EP-SEC-7）。 |
| 网络工程师（N） | P0-1 生产 DLC 根为空+legacy 包；P0-2 无发布者身份/无 updater/SHA256SUMS 无签名；P1-1 传输/防回滚缺失；P1-2 CSP 冲突必须 Rust 下载器；P1-3 信任根生命周期；P1-4 云端出网无上限/ASR 无配额；P1-5 bridge 无纵深；P1-6 下载解压安装未实现；P1-7 插件分发/版本；P2×12。 | 本域主报告。P0-1/P0-2 拆 EP-SEC-1；P1-1/P1-2/P1-6 拆 EP-SEC-4/5；P1-3 拆 `SEC-405`/`SEC-302`；P1-4 拆 `SEC-601`；P1-5 拆 `SEC-602`；P1-7 拆 EP-SEC-7；P2 见 §3。 |
| 游戏工程师（G） | P0-2 发布构建 DLC 全失败；P1-6 DLC 只能加数据、Steam entitlement stub；§9 已复核 DLC dev-key override/ACL/consent/innerHTML 已闭合。 | P0-2 与 N-P0-1 合并；P1-6 的资产包能力交 triage-game/arch，本域只处理签名/信任；§9 的已闭合项不重开。 |
| 测试工程师（Q） | P0-1 GUI/E2E 直接操作真实 appdata；P0-2 质量门从未运行/干净 checkout 必红；P1-1 发布证据不可机器复核；P1-2 插件发布闭环缺失；P1-6 Rust/Tauri 验证不 gate；P1-7 同源 storage 未测。 | P0-1/P0-2/P1-1 作为共享前置（triage-quality 主责）；P1-2 与 N-P1-7 合并 EP-SEC-7；P1-6 进 `SEC-204`/`SEC-203`；P1-7 合并 C-08。 |
| 心理学家（P） | P0-2 插件自由聊天缺危机/告知地板；P1-4 语音控制/AI 标识隐藏；P1-6 法务/声明文档与实现漂移；P2-6 插件缺清除/撤回入口。 | P0-2/P1-4 交 triage-ux/legal（本域只保留 ASR 出网/配额安全）；P1-6 合并 C-10/`SEC-901`；P2-6 与 `SEC-604` 的删除残留验收对齐。 |
| 使用者/UX（UX） | P0-2 产品壳隐藏必需控件；P1-3 工具页在 Tauri 下可能静默失败/开发页随包；P2-8 单实例缺失。 | P0-2 交 triage-ux；P1-3 的「开发/QA 页随 release」并入 `SEC-603`；P2-8 列 P2/不做（安全影响=双写存档，见 §7）。 |

### 1.2 评审快照之后的变化（本域重新定级的前提）

| 时间/提交 | 变化 | 对评审结论的影响 |
|---|---|---|
| 13:35 `d5655c9` | 内容中心 v2 落地（角色即主题/资产包/市场契约/极简菜单），同时提交七份评审文档。 | 评审中「工作树脏、content 测试红、行号会漂」的前提失效；相关文件行号/规模需按新代码复核。 |
| 13:56 `0bbbe43` | 新增 `src/pet/content-market.ts`（2094 行）+ `tests/content-market.test.ts`（1157 行，29 项）：HTTPS/私网/重定向/超时/大小/串行、目录 Ed25519、serial 防回滚、pack sha256+签名、注入式 unpack/install。 | **N-P1-1（无传输/无防回滚）部分关闭**；但引入 C-01（webview fetch vs Rust 出网）；catalog 仍 0.1、无 expires、无真实服务端。 |
| 14:06–14:07 | 插件 `package.json` → `0.10.2`，`client.js`/`client.content.js` 更新（0.10.1 菜单/0.10.2 增量）。 | N-P1-7/QA 引用的「0.10.0」已过期；但 npm registry 仍 `0.0.1`（本轮实测）、仍无 `.git`/`prepack`/`repository`，实质缺口仍在。 |
| 14:09 `7107a61` | 菜单暴露 save-then-exit。 | 与安全无关；本轮不追。 |
| 当前（写本文前） | `git status` 仅 4 个 docs 变更（2 modified + 2 untracked；本文为第 5 个新增 docs）；`artifacts/` 仍是 11-14 旧产物、无 SHA256SUMS；`dist/` 是否新于源码未核验。 | N-P2-10「dirty tree」现状已变化，但「发布物必须 clean tree 重建」仍成立。 |

### 1.3 本轮实测（只读；不是全量验证）

| 命令/检查 | 结果 |
|---|---|
| `git log --oneline -15` / `git status --porcelain` | HEAD `7107a61`；写本文前 4 项 docs 变更（本文 +1）；`git remote -v` 为空。 |
| `cat native/dlc-verify/trust/production-trust-root.json` | `keys: []`（无 active 生产公钥）。 |
| `node scripts/verify-dlc-trust.mjs --report-only --json` | 3 条 error：无 active key；`farm-seasons`/`reef-pack` 仍是 legacy `signature.txt`、无 `signature.json`；warning：`packs/keys` 含 tracked dev 公钥。 |
| `node scripts/legal-check.mjs --strict` | `BLOCKED (34 blocker(s), 34 warning(s))`；与 QA 评审 §6.1 一致，README 的「16 blockers」和旧计划的「38」均已过期。 |
| `cat tauri.conf.json` / `Cargo.toml` / capabilities | CSP 仍为 `connect-src 'self' ipc: http://ipc.localhost`；productName `DesktopGames` / `0.1.0` / `com.perrylink.desktopgames`；Cargo 无 `tauri-plugin-updater`；capabilities 无市场/下载命令；resources 仍含两个 packs 目录。 |
| `src/pet/content-market.ts` | 默认传输 `defaultMarketFetch`（`:207-215`）；catalog 0.1（`content-library.ts:642`）；serial=updatedAt+version+payload sha（`:497-525`）；trust root 只做形状校验（`:1126-1143`）；`allowedCatalogHosts` 可选（`:1047`/`:1767`）。 |
| `src/pet/main.ts` | `activeMarketSource = null`（`:898`）；`contentMarketState()` 默认未配置（`:979-985`）；未 import `content-market.ts`，生产**零请求**。 |
| `voice.rs` / `main.rs` | TTS `response.bytes()`（:175）、ASR `response.json()`（:232）、share `response.json()`（main.rs:187）均无响应体上限；ASR 无配额/限流；TTS 有 45s/60s 超时。 |
| `grep DG_QA_DATA_DIR/on_navigation/single-instance` | 全仓 0 命中（测试数据隔离、导航白名单、单实例均未实现）。 |
| `.github/workflows/*` | `actions/checkout@v4` 等未 pin SHA；构建期 `npx --yes @tauri-apps/cli@2.12.6`；`rust-tauri-tests` 仍 `continue-on-error: true`。 |
| `ls artifacts` / `npm view dsh-famling version` | artifacts 仍是 11-14 旧包、无 SHA256SUMS/RELEASE-MANIFEST/build-info；npm 仍 `0.0.1`，本地插件 `0.10.2`。 |
| 未执行 | 全量 `npm test`、Windows 构建、Authenticode、真实签名、真实下载/联网、24h soak、GUI E2E。文中相应结论均标「评审记录/未复跑」。 |

### 1.4 证据等级

- **A 级（本轮实测）**：上述命令结果、`grep`、行号、文件存在性。
- **B 级（评审实测记录）**：干净 checkout 的 4 个失败测试、Windows release 141 项 ACL 断言、E2E 事故记录；本轮未复跑，但代码/测试没有反向改动证据。
- **C 级（静态推断）**：CSP 对 webview `fetch` 的拦截、release 路由行为、签名链路；只有接上真实构建才转 A。

---

## 2. ① 矛盾 / 重复 / 失效清单

### 2.1 真矛盾与冲突前提（C-01–C-12）

#### C-01 市场出网边界：webview fetch vs Rust 唯一出网代理（最高优先级）

- **A 方（网络评审 N-P1-2，`:231-236`）**：CSP 不能放宽；必须新增受限 Rust 下载命令（`market_fetch_catalog`/`market_download_pack`），URL 只来自已验签 catalog，Rust 校验 scheme/host/redirect/大小/超时；UI 只收结果与错误码。
- **B 方（评审后实现 `0bbbe43` + `docs/design/CONTENT-MARKET-2026-11-19.md` §11）**：`content-market.ts` 明确「本模块是 app 内唯一允许为内容联网的地方」，生产默认 `globalThis.fetch`；§11.10 的接线方式是「宿主注入 client 即可」，没有 Rust 命令、capability 或 CSP 变更。
- **为何冲突**：Tauri release 的 CSP 是 `connect-src 'self' ipc: http://ipc.localhost`，webview 直发 `https://market...` 会被浏览器层拦截。按现设计接 `main.ts`：要么运行时 100% 失败（功能矛盾），要么为了可用而放宽 `connect-src`（破坏现有最强防线，XSS 即可外传）。现有 29 项测试全部注入 fake fetch，**没有覆盖 release CSP**，所以测试绿不能证明可接线。
- **建议裁定**：采用 A 方。把 `content-market.ts` 降级为**纯验证/状态机核心**（保留现有测试）；出网只走新增 Rust 命令，catalog/zip 字节经 IPC 回传；CSP 一行不改；新增静态测试「生产路径不存在全局 fetch 市场调用」+「market 命令只在 pet-shell capability」。若有人主张 B，必须先出一份威胁模型 + XSS 外传评估，默认否决。
- **影响**：C-01 未裁定前，`SEC-502`（安装器 UI）与 `main.ts` 接线一律不启动；`SEC-403` 先加「无全局 fetch」静态门，防止后续 agent 按 §11.10 直接接线。

#### C-02 目标发布通道与 P0 前提不一致

- **A 方（网络/架构/游戏/QA 多数 P0）**：按「公开、可验证、signed 发布」定义 P0——Authenticode、updater、DLC 生产根、CI/证据、DLC 必须可用。
- **B 方（产品计划 `docs/plan/RELEASE-HANDLING-2026-11-17.md` 路径 A）**：当前唯一可执行路径是「邀请制私域 beta、unsigned、不公开、不收费、不商店」；公开免费（B）/收费商店（C）均 NO-GO。**unsigned 在 beta 是被允许的**，但不得作为 release 宣传。
- **C 方（发布文档自相矛盾）**：`docs/RELEASE-CHECKLIST.md:5` 写「证书到位前只能发布 signed release」（应为「只能 unsigned preview」）；`docs/RELEASE-RUNBOOK.md:194-195` 仍把「DLC 状态不是 fallback」当验收；`README.md:11` 写「私有远端已建、CI 首次运行结果见 Actions」，而 `git remote -v` 为空。
- **为何冲突**：P0 是相对目标通道的。对 C1（私域 beta），Authenticode/updater/DLC 可用不是阻断；对 C2（公开）则是。若不先声明通道，团队要么把公开门槛压到 beta（发不出去），要么拿 beta 的 unsigned 结果当「已发布」（错误宣称）。
- **建议裁定**：在 `docs/plan/RELEASE-GATES.md` 固定 C0–C3 与各档 gate（§5）；评审 P0 保留「绝对等级」，但增加一列「对 C1 是否阻断」。当前 lead 需确认下一目标通道；在确认前，默认按 **C1 的 gate + C2 的长期项并行**推进。
- **影响**：§3 的分级表用「新级别 + C1 阻断?」两列表达，不再把 C2 门槛直接压给 C1。

#### C-03 五份评审的「第一件事」互相冲突

- **A 方**：网络 §7 要求先闭合发布信任链（DLC 根 + SHA256SUMS 签名）。**B 方**：软件 §8/QA §11 要求先让干净 checkout/CI 变绿、先做 GUI 数据隔离。**C 方**：架构 §8 要求先冻结共享语义 spec、让插件可自证。**D 方**：游戏 §8 要求先做可玩角色资产包。
- **为何冲突**：它们分别优化「信任」「可验证」「契约」「产品」，但都声称 P0。实际依赖关系是：**没有可复现构建，就无法证明信任链构建自源码**；外部证书/密钥 ceremony 的等待时间最长，应最早启动；内容 spec 与安全发布无直接依赖，可后置。
- **建议裁定**：按「**可自证构建 → 发布信任链 → 市场启用**」排序；外部项（证书、ceremony）从第 0 天并行启动；架构 spec 与游戏可玩性不在安全发布关键路径，交各自 triage 独立排。见 §5。
- **影响**：§4.9 波次表；第一批见 §0.3。

#### C-04 DLC：停用、ceremony，还是继续按 runbook 验收？

- **A 方（网络 N-P0-1 / 架构 A-P0-3）**：必须完成生产 key ceremony + 重签 packs，让 `verify-dlc-trust` 绿。
- **B 方（游戏 G-P0-2 建议 3）**：短期做不了 ceremony，就把 DLC 从 release resources 移除、游戏侧不显示 DLC 入口，避免「包在但永远 skipped」。
- **C 方（`RELEASE-RUNBOOK.md:194-195`）**：安装后仍要求「启动带 DLC 的 demo，dlc 状态不是 fallback」。
- **为何冲突**：当前 release 的 DLC 是「必然 fail-closed」；继续保留是最差状态——既不能玩，又让验收项永远失败、还让对外文案容易误称「含 DLC」。
- **建议裁定**：立刻执行 B（`SEC-104`），同时启动 A（`SEC-102`/`SEC-103`，外部长周期）；DLC 只在 `SEC-105` gate 转绿且 `SEC-301` 硬化后重新启用（`SEC-303`）。C 改成「signed DLC 验收仅在 DLC 启用后适用」。

#### C-05 信任根：编译期 DLC 根 vs 运行时注入的市场根；「单源」到什么程度

- **A 方**：DLC 根编译期 `include_str!`，release 忽略 `--dlc-key`/`P0_PACKS_DIR`（正确，保留）。
- **B 方**：市场 `trustRoot` 由调用方配置传入（`content-market.ts` 配置项），核心只校验形状，不校验 fingerprint/公钥一致性；网络 N-P1-3 指出这会在宿主注入错误根时静默信任。
- **C 方**：架构 A-P0-1/网络 §5.8 要求「共享语义/密钥治理单一权威源」。
- **为何冲突**：「单一权威源」不等于「同一把钥匙」；但当前市场根是可变注入，和 DLC 的编译期根不是同一信任强度，若被理解成「统一治理」会留下运行时替换面。
- **建议裁定**：**共享治理、分离密钥**。DLC/catalog/pack/updater/Authenticode 五类 key 各有用途，统一登记（keyId/fingerprint/保管人/状态/有效期/轮换/吊销）；市场生产根必须 pinned（编译期或 release 产物），不得从用户可写配置读；核心增加 `validateContentTrustRoot` 并绑定 fingerprint；dev 指纹黑名单。见 `SEC-405`。

#### C-06 证书：OV/EV、IV，还是不买？

- **A 方（网络 N-P0-2 / 架构 A-P0-3 / 认证报告）**：采购 OV/EV 证书，`Get-AuthenticodeSignature` Valid。
- **B 方（`docs/plan/RELEASE-HANDLING` §2）**：公开免费路径建议 **IV 证书（个人名，约 ¥600–1000/年）** 降低 SmartScreen；私域 beta 允许 unsigned。
- **C 方（`docs/RELEASE-SIGNING.md` §9）**：证书是外部阻塞；无证书时 tag 构建硬阻断，unsigned 只能显式 preview。
- **为何冲突**：三处对「证书类型/成本/是否 C1 必须」给出不同答案；且中国个人开发者不能用 Azure Trusted Signing，OV/EV 审核 1–2 周。
- **建议裁定**：C1 不要求证书（但必须显式 unsigned+SUM+文案）；C2 最低 **IV 或 OV**（owner 按是否需组织身份决定），C3/商店再 EV；采购与实名审核从第 0 天启动。证书类型/预算由 lead/用户拍板（§8 Q2）。

#### C-07 防回滚契约：`serial`+`expires` vs `updatedAt/version/hash`

- **A 方（网络 N-P1-1 建议）**：catalog 升 v0.2，最小增补单调 `serial` + `expires` + 可选 `minAppVersion`；客户端持久化最高 serial，过期目录只允许已装内容、禁止新装。
- **B 方（`0bbbe43` 实现）**：在 catalog 0.1 上定义 serial = `(updatedAtMs, version, catalog sha256)`；同序不同 hash 也拒绝；无 `expires`、无离线宽限、无时钟偏移规则。
- **为何冲突**：两者都能防重放，但 B 依赖发布方时间戳单调且无过期概念；若发布方时钟回拨/重发旧时间戳，会误报 rollback；旧客户端无法判断目录是否过期；服务端无法用 `expires` 做短 TTL。
- **建议裁定**：把 B 作为**客户端实现**保留（测试已覆盖），协议层在 `SEC-404` 增补 `serial`（可由 updatedAt 派生）与 `expires`、离线宽限、时钟偏移容忍、条件请求/重试/限流；不要要求推翻现有 29 项测试，只做 MINOR 扩展 + 0.1 双读。

#### C-08 「数据隔离」被当成同一件事：测试隔离 vs 运行时同源 storage

- **A 方（QA Q-P0-1）**：测试/E2E 不得读写真实 `%APPDATA%/com.perrylink.desktopgames`；需 `DG_QA_DATA_DIR`、临时 WebView2 profile、前后哈希快照；已有 11-19 真实存档被污染事故。
- **B 方（架构 A-P1-7 / QA Q-P1-7 / 历史安全审计 P1-2）**：产品运行时 main/pet/game/bench 同源共享 localStorage/IndexedDB；ACL 只管 IPC，管不住页面间直接读写。
- **为何冲突**：两者都叫「隔离」，但修好 A 不会修 B，修好 B 也不会阻止 E2E 碰真实数据；若合并成一个任务，验收会互相冒充。
- **建议裁定**：拆成两条：`SEC-801`（测试隔离，triage-quality 主责，P0）与 `SEC-802`（运行时 storage 隔离 spike，triage-arch/security 主责，P1）；本域只给安全验收（跨页不可读 pet 同意/存档键）。

#### C-09 consent 状态：安全绕过已闭合，但评审仍在列 consent/隐私缺口

- **A 方（既有 resolution）**：`RESOLUTION-CONSENT-GATE-2026-11-19.md` 记录 TOS/DLC/TTS/ASR 门下沉 Rust、页面路由暂扣、`?character=` 过 DLC 门；`RESOLUTION-TAURI-ACL` 记录 23 命令 × 7 窗口 ACL 全 PASS；`RESOLUTION-INNERHTML` 记录 DOM 注入修复。
- **B 方（心理学 P0-2/P1-4/P1-6、UX P0-2/P1-5、网络 P1-4 文档部分）**：仍把「无 ASR 告知/同意」「TTS 控制缺失」「法务文档漂移」列为发布阻断。
- **为何冲突**：A 说的是「技术门是否可绕过」，B 说的是「用户是否看得见/读得懂/能撤回/文档是否真实」；部分评审引用的是过期文档（PRIVACY 仍写「无告知/无同意」），不是当前代码。
- **建议裁定**：**明确写死「consent 绕过/ACL/innerHTML 已闭合，不重开」**；剩下的 consent 可读性、语音控制、法务文本漂移交 triage-ux/legal；本域只保留 ASR 出网配额/隐私告知（`SEC-601`/`SEC-406`）与本地同意「非防篡改证据」的事实披露（`SEC-604`）。

#### C-10 法务/发布事实自相矛盾（34 vs 16 vs 38；PRIVACY/README/年龄口径）

- **A 方**：本轮 `legal-check --strict` = **34 blockers**（QA 评审同样记录 34）；产品计划旧快照说 38；`README.md:254` 说 16。
- **B 方**：`docs/legal/PRIVACY.md:36` 仍写 ASR「无告知/无同意/无开关/无配额」，同文件 `:52` 又写「已实现 ASR 独立声明与门禁」；`:74` 写「删除全部：无」，`:75` 写「撤回同意：已提供」；`README.md:243` 仍写「ASR 无告知/同意、无撤回/全清」。
- **C 方**：`docs/legal/RELEASE-BLOCKERS.md:4` 写「用户已拍板全年龄、不设年龄门」，与当前 TOS/README 的「roleplay 18+、首启自报出生日期」矛盾。
- **为何冲突**：发布门/法务文本不是从代码真值生成，计数和「已实现/未实现」互相打脸；任何 gate 结论都不可信。
- **建议裁定**：`SEC-901` 做单一事实源（`terms.ts`/代码 → 生成 legal 文档 + `public/legal` 同步 + README 状态段），`legal-check --strict` 的 34 作为唯一当前读数；修 PRIVACY/README/RELEASE-BLOCKERS；CI 检查副本 stale 与事实时点。安全域要求：C2 前不得出现「无 ASR 同意」这类反向陈述。

#### C-11 发布证据的「P0 阈值」不一致

- **A 方（网络 N-P0-2）**：SHA256SUMS 无外层签名就是 P0。**B 方（认证报告 §7）**：工程主体已完成，只剩 B6 外层签名/P2。**C 方（QA Q-P1-1）**：现在连机器可复核的 SHA256SUMS/MANIFEST/build-info 都没有，是 P1。
- **为何冲突**：三者描述同一条链的不同环节：**产出证据 → 绑定 commit → 发布者签名**。只做后两者、没有第一条就是空话；只做第一条、没有签名则用户无法验证发布者。
- **建议裁定**：合并为一个 Epic（EP-SEC-2），按顺序 `SEC-201`（证据+绑定）→ `SEC-108`（外层签名）→ `SEC-204`（证据归档+gate）。C1 要求 201；C2 要求 201+108。

#### C-12 产品身份（DesktopGames/0.1.0 vs Famling）的级别不一致

- **A 方**：架构 P0-3 把「产品身份」列进发布信任闭环（P0）；同一报告 P2-3 又说「0.5 人日、并入 P0-3」。**B 方**：QA/网络按元数据漂移列为 P1/P2。
- **为何冲突**：它不是可利用漏洞，但影响安装目录、AppData、升级/卸载识别、签名声誉与市场收录；改名越晚成本越高。按安全严重度只能 P1，按发布 gate 应前置。
- **建议裁定**：`SEC-101` 定为 **P1（C2 gate 前置）**：先出 ADR（名称/identifier/版本轴/AppData 迁移），在首个公开签名构建前完成；C1 beta 可在旧名下发布但必须在 README 标注「身份改名计划」。

### 2.2 重复条目（DUP-01–DUP-12）

| # | 重复内容 | 涉及评审/报告 | 合并到 |
|---|---|---|---|
| DUP-01 | 发布者身份/Authenticode/无签名 | N-P0-2、A-P0-3、Q-P1-1、认证 B1/B2 | EP-SEC-1（`SEC-106`/`SEC-107`） |
| DUP-02 | 发布证据（SHA256SUMS/RELEASE-MANIFEST/build-info/测试 provenance） | Q-P1-1、N-P0-2/P2-9、认证 B6、S-P2-5 | EP-SEC-2（`SEC-201`/`SEC-108`） |
| DUP-03 | 质量门/无 remote/干净 checkout 必红 | S-P0-1、Q-P0-2、A-P1-6、N-P2-10、Q-P2-4 | 共享 T-QA；本域 `SEC-202` 依赖 |
| DUP-04 | DLC 生产信任根/重签/legacy 包 | N-P0-1、G-P0-2、A-P0-3、DLC resolution B1/B5/R6 | EP-SEC-1/EP-SEC-3 |
| DUP-05 | GUI/E2E 碰真实 appdata | Q-P0-1、ACL R8、consent resolution §5.11 | 共享 T-QA `SEC-801` |
| DUP-06 | 同源页面共享 localStorage/storage | A-P1-7、Q-P1-7、历史安全审计 P1-2 | 共享 triage-arch `SEC-802` |
| DUP-07 | consent 可读性/语音控制/法务漂移 | N-P1-4（文档）、P-P1-6、UX P0-2/P1-5、P-P1-4 | 共享 triage-ux/legal + `SEC-901` |
| DUP-08 | 供应链（Actions pin/audit/clippy/npx CLI） | S-P2-5、N-P2-8、Q-P2-3、S-P2-6、runbook 10 | `SEC-203` |
| DUP-09 | 插件分发/版本/不可自证 | N-P1-7、A-P0-2、Q-P1-2、S-P2-6 | EP-SEC-7；自证部分交 triage-arch |
| DUP-10 | 发布页/调试页/QA 入口暴露 | A-P2-6、UX P1-3、N-P2-6、Q-P2-2、consent resolution R5 | `SEC-603` |
| DUP-11 | 文档/测试数字漂移 | A-P2-4、S-P2-2、Q-P2-1、N-P2-10、P-P1-6 | `SEC-901`/`SEC-204` |
| DUP-12 | 云端出网（响应上限/重试/配额/缓存） | N-P1-4/P2-11/P2-12、P-P1-4（TTS 标识） | `SEC-601` |

### 2.3 已被后续改动解决、部分解决或引用已过期（RES-01–RES-20）

| # | 评审原话 | 现状 | 判定 |
|---|---|---|---|
| RES-01 | N-P1-1「传输 0 行、无防回滚」 | `content-market.ts` 已实现可注入传输、serial 防回滚、pack 校验、29 项离线测试（`0bbbe43`）。 | **部分解决**：保留「Rust 出网」「协议 v0.2/expires」「真实市场未建」三个子项。 |
| RES-02 | content-library/content-hub「不联网、市场只契约」 | 纯函数层仍不 fetch；联网在 `content-market.ts`，但默认未接线。 | **引用过期**：应表述为「UI 未接线；客户端已存在」。 |
| RES-03 | N-P2-10「工作树 18 项未提交、dist 陈旧」 | 当前 HEAD `7107a61`；`git status` 仅 4 个 docs；但 `artifacts/` 仍是 11-14 旧包。 | **部分解决**：dirty tree 不再是问题；发布物证据仍未解决。 |
| RES-04 | 评审大量文件行号/规模（main.ts 3551、content-library 4568、插件 client.js 1037 等） | 评审后 3 个提交已改变行号/内容（main.ts 现 3607，插件现 0.10.2）。 | **引用过期**：以函数名/符号复核，不按旧行号排期。 |
| RES-05 | N-P1-7「插件 0.10.0、npm 0.0.1」 | 本地 `package.json` 0.10.2（README 仍写 0.10.1）；`npm view dsh-famling version` 仍 0.0.1。 | **版本引用过期，实质缺口未变**：无 git/CI/prepack/repository/provenance。 |
| RES-06 | 「release 可被 `--dlc-key`/`P0_PACKS_DIR` 覆盖信任根」 | DLC resolution B2 已关闭；release 走编译期根，exe 扫描 `found=[]`；`--dlc-key` 仅 debug。 | **已解决**，不重开。 |
| RES-07 | 「ACL 无窗口级归属 / consent 可绕过 / innerHTML 注入」 | 2026-11-19 d488112 + 四份 RESOLUTION 已闭合；game 评审 §9 复核。 | **已解决**，不重开。 |
| RES-08 | 「市场 UI 会远程拉取」 | `activeMarketSource = null`，`main.ts` 未 import `content-market.ts`；默认零请求。 | **当前不是事实**；但一旦接线即触发 C-01，须先加静态门。 |
| RES-09 | 「无 updater」 | Cargo/tauri.conf 仍无 updater；密钥文档存在但未接入。 | **仍有效**；按 C2 决策项处理。 |
| RES-10 | 「无 git remote、CI 从未运行」 | `git remote -v` 仍为空；README 仍写已建/已跑。 | **仍有效**，且是 C1 证据链的前置。 |
| RES-11 | 「工作树脏/stale dist」 | 当前树干净但 `artifacts/` 旧、无 SHA/Manifest；`release-win` 仍可能打包旧 dist（需 SEC-202 验证）。 | **风险仍在**，需 release profile 重建。 |
| RES-12 | 测试数/覆盖率（1046 tests、91.11% 等） | 评审后新增内容/市场测试；`docs/design/CONTENT-MARKET` 记录全仓 1176 tests。 | **数字过期**；以当前 HEAD 重跑为准。 |
| RES-13 | 「PRIVACY 写无 ASR 告知/同意」 | 仍存在（PRIVACY:36/96 vs :52），README:243 也仍写。 | **仍有效**，且是 C-10 的核心证据。 |
| RES-14 | 「legal-check strict 34 blockers」 | 本轮复跑仍 34/34。 | **仍有效**；README 的 16、旧计划的 38 过期。 |
| RES-15 | 「生产 DLC 根 `keys: []`」 | 本轮复跑仍空；gate 3 error。 | **仍有效**。 |
| RES-16 | 「CSP 挡远程市场」 | CSP 未改；但新增的实现默认用 webview fetch。 | **仍有效且升级为 C-01**。 |
| RES-17 | 「插件 bridge 无 Origin/限流/超时」 | `index.js` 自 11-19 00:14 未改（`0bbbe43` 后仅 client/content/package 变化）；无 rate limit。 | **仍有效**。 |
| RES-18 | 「Tauri resources 分发 packs/keys」 | `tauri.conf resources` 只含两个 pack 目录（不含 `packs/keys`）；`release-win` staging 已过滤 `keys/`；但仓库仍 tracked `packs/keys/dev-public.pem`。 | **代码侧基本已解决**；剩仓库卫生与 B3 实机复核。 |
| RES-19 | 「Release checklist/runbook 与实现一致」 | `RELEASE-CHECKLIST.md:5` 逻辑写反；`RELEASE-RUNBOOK.md:194-195` 仍要求 DLC 非 fallback；`tauri.conf` 仍含 packs。 | **新发现的文档矛盾**（C-02/C-04）。 |
| RES-20 | 「README 说私有 remote 已建/CI 已跑」 | 与 `git remote -v` 空矛盾（S-P0-1 也指出）。 | **仍有效**；`SEC-204` 修正。 |

### 2.4 与其他 triage 的边界（避免重复建任务）

| 领域 | 主责 triage | 本文件引用/保留 | 本域不重复做的事 |
|---|---|---|---|
| 测试数据隔离、干净 checkout、CI/证据归档、E2E/soak | triage-quality（task-71） | 作为 C1/C2 的前置依赖；安全验收：真实 appdata 不变、证据带 commit/exe hash | 不新建 QA 任务；只在 gate 中作为必过项 |
| 共享语义 spec、插件可独立构建、模块拆分、同源 storage 产品化 | triage-arch（task-68） | 插件自证/`spec` 交架构；本域只做发布信任（npm provenance/签名/安装态） | 不重做 spec 生成器与 `main.ts` 拆分 |
| 菜单/设置/consent 可读性/语音控制/无障碍 | triage-ux（task-69） | consent 安全门已闭合；剩余 UX/法务可读性交 UX | 不重做菜单 IA、不重做 consent 绕过测试 |
| 跨域 P0 冲突总表 | triage-p0（task-67） | 本文件 §2.1/§5 提供安全/发布切片与裁定建议 | 不替代总表 |
| 游戏可玩性/DLC 资产包/市场商品能力 | triage-game/arch | 本域只覆盖签名、信任、分发、安装 | 不做角色资产包格式/玩法 |

---

## 3. ② P0 / P1 / P2 重新分级

### 3.1 分级口径

- **C0**：本地开发构建，无分发；只要求 `typecheck`/测试可跑。
- **C1**：邀请制、unsigned 私域 beta（当前唯一获批路径）；允许 unsigned，但必须有 SHA256SUMS + 明确未签名说明；不得有 DLC 半成品、不得联网市场、不得宣称 signed/可信/已审核。
- **C2**：公开免费/公开下载（signed 或明确接受 unsign 风险由 owner 书面决定；安全建议必须 Authenticode + 外层签名）。
- **C3**：在线内容市场（联网目录/下载/安装）；必须 C2 + 市场传输/安装/信任/隐私全部就绪。
- **新级别**：`P0` = 阻断目标通道（默认 C2/C3；表中另标 C1 是否阻断）；`P1` = 下一迭代/公开前必须；`P2` = 纵深防御/卫生/可延后。
- **对 C1 列**：✔ = 阻断 C1；— = 不阻断 C1（但可能阻断 C2/C3）；`closed` = 已闭合。

### 3.2 分级总表（R-01–R-30）

| 新 ID | 原评审条目 | 问题 | 本轮复核 | 新级别 | C1 阻断？ | 任务 |
|---|---|---|---|---|---|---|
| R-01 | S-P0-1、Q-P0-2、A-P1-6、N-P2-10、Q-P2-4 | 无 remote、CI 从未运行、干净 checkout 必红；发布不可自证 | 仍无 remote；`tests/use-restrictions` 仍读兄弟仓、`tests/ui-assets` 仍读被 ignore 的 `art/_placeholder`；`git archive` 后必红（评审 B 级） | **P0** | ✔ | 共享 T-QA；本域 `SEC-202` |
| R-02 | Q-P1-1、N-P0-2、认证 B6 | 无 SHA256SUMS/RELEASE-MANIFEST/BUILD-INFO/测试 provenance；产物不能绑定 commit | `artifacts/` 仍 11-14 旧包；无证据文件 | **P0** | ✔ | `SEC-201`、`SEC-108` |
| R-03 | N-P0-2、A-P0-3、认证 B1/B2 | 发布者身份不可验证（NotSigned/无证书/签名流水线未跑） | 实测 NotSigned；证书未采购；无 tag/CI | **P0** | — | `SEC-106`、`SEC-107` |
| R-04 | N-P0-1、G-P0-2、A-P0-3 | DLC 生产信任根空 + 两个包 legacy 签名 → release DLC 必失败 | 实测 gate 3 error；`keys: []` | **P0** | ✔（若装 DLC） | `SEC-104`、`SEC-102`、`SEC-103`、`SEC-105` |
| R-05 | 同上（设计层） | 编译期内置根、release 拒绝运行时覆盖、dev 指纹黑名单 | 机制已闭合（B2/扫描） | **Closed** | — | 不重做 |
| R-06 | N-P1-2 | CSP 下 webview 不能直连市场；需 Rust 下载器 | CSP 未改；新客户端默认 webview fetch | **P0** | — | `SEC-401`、`SEC-402`、`SEC-403` |
| R-07 | N-P1-1 | 传输/防回滚/URL 边界 | 已有可注入传输+serial 防回滚+URL 策略；缺 Rust 出网、expires、prototype 服务器 | **P0（传输）** / **P1（协议）** | — | `SEC-402`、`SEC-403`、`SEC-404` |
| R-08 | N-P1-6 | 下载/解压/安装链路未实现 | 已有注入式 unpack/install 回调，未实现 bounded unzip/原子安装/卸载 | **P1** | — | `SEC-501`、`SEC-502`、`SEC-503` |
| R-09 | N-P1-3 | 信任根 core 不校验指纹/结构；吊销传播靠版本 | `content-market.ts:1126-1143` 只校验形状；无 `validateContentTrustRoot` | **P1** | — | `SEC-405`、`SEC-302` |
| R-10 | N-P1-4 | 云端出网响应无上限；ASR 无配额/限流/退避 | `voice.rs`/`main.rs` 仍 `.bytes()`/`.json()`；ASR 无 quota | **P1** | — | `SEC-601` |
| R-11 | N-P1-5 | 插件 bridge 无 Origin/content-type/限流/Abort；brief 无超时 | `index.js` 未改；无 rate limit | **P1** | — | `SEC-602` |
| R-12 | N-P1-7、A-P0-2、Q-P1-2 | 插件分发不可信/版本漂移/发布无门禁 | 本地 0.10.2；npm 0.0.1；无 git/CI/prepack/repository | **P1** | — | `SEC-701`、`SEC-702` |
| R-13 | Q-P0-1、ACL R8 | E2E/GUI 直接操作真实 appdata；`--reset-saves` 可删真实存档 | `DG_QA_DATA_DIR` 仍 0 命中；11-19 已发生污染 | **P0** | ✔ | 共享 T-QA `SEC-801` |
| R-14 | A-P1-7、Q-P1-7、安全审计 P1-2 | 同源页面共享 storage；ACL 管不住 localStorage | 无隔离/无启动断言 | **P1** | — | 共享 triage-arch `SEC-802` |
| R-15 | N-P1-4（文档）、P-P1-6、UX P0-2/P1-5 | 法务/隐私/README 与代码漂移；ASR 告知自相矛盾 | `legal-check strict` 34；PRIVACY/README 仍写无 ASR 同意/删除 | **P1** | — | `SEC-901`（共享 legal/quality） |
| R-16 | N-P0-2、认证 B6 | SHA256SUMS 无发布者外层签名 | 无 minisign/cosign；`release-win` 只写明文哈希 | **P0** | — | `SEC-108` |
| R-17 | N-P0-2、A-P0-3、认证 B5 | 无 updater（无补丁/吊销传播通道） | Cargo/tauri.conf 无 updater；密钥未接入 | **P1** | — | `SEC-110`（条件实现） |
| R-18 | N-P2-1 | 下载器 SSRF/主机允许列表 | `validateMarketRequestUrl` 默认无 host allowlist（可选配置），私网已拒 | **P1** | — | 并入 `SEC-402` |
| R-19 | N-P2-2/P2-3/P2-4 | 无 ETag/304、无退避/限流/下载配额/Range | 客户端 `cache:no-store`、无重试、无 expires；v1 明确不做自动重试 | **P1** | — | `SEC-404` |
| R-20 | N-P2-5 | Sentry DSN 可由 URL 参数注入 | 未改；aquarium demo 仍可 `?sentry=` | **P2** | — | `SEC-603` |
| R-21 | N-P2-6、Q-P2-2、UX P1-3、consent R5 | 无导航白名单；QA 别名/开发页随 release；`--page`/`--bench` 不 gate | `on_navigation` 0 命中；`main.rs:349-359` 明确 `--page` 不暂扣 | **P1** | — | `SEC-603` |
| R-22 | A-P2-6、N-P2-7 | 发布页/开发页未收口；市场数据流未进隐私告知 | `vite.config.ts` 仍多入口；PRIVACY 无市场数据流 | **P1** | — | `SEC-406`、`SEC-603` |
| R-23 | S-P2-5、N-P2-8、Q-P2-3 | Actions 未 pin、构建期 `npx --yes`、无 clippy/audit/SBOM | 全部仍在 | **P2** | — | `SEC-203` |
| R-24 | N-P2-12 | TTS 缓存/额度无上限、无 GC | 仍无 LRU/上限 | **P2** | — | `SEC-603` |
| R-25 | DLC resolution R6 | DLC loader 路径/大小/schema 硬化不完整 | 签名层已好，内容层仍有 IO/路径放大风险 | **P1（DLC 重启用前）** | — | `SEC-301` |
| R-26 | A-P0-3/P2-3、Q-P1-1、N-P2-9 | 产品身份旧元数据（DesktopGames/0.1.0/旧 identifier） | 未改；影响安装/升级/签名/市场 | **P1（C2 gate）** | — | `SEC-101` |
| R-27 | N-P0-2（建议部分） | 无发布者身份时仍可能被误当 signed | 文档仍写「signed」相关口径；checklist 写反 | **P0（文档/流程）** | ✔ | `SEC-204` |
| R-28 | A-P2-4、S-P2-2、Q-P2-1、P-P1-6 | 文档/测试数字漂移；事实时点缺失 | README 16 vs 34；多处旧数字 | **P2** | — | `SEC-901`/`SEC-204` |
| R-29 | A-P1-1/P1-3 | DSH 宿主能力协商/engines 不强制/同意语义双实现 | 不在本域；不影响当前 release 安全 | **P2/out of scope** | — | 交 triage-arch |
| R-30 | G-P0-1、A-P1-2 | 内容市场不能交付可玩新角色；安装器系统设计 | 产品/架构问题，非安全发布阻断 | **P1（产品向，out of scope）** | — | 交 triage-game/arch |

### 3.3 升降级摘要

- **升级**：R-06（CSP/webview fetch）由 P1 升 **P0**（因为评审后新增实现把风险从「未实现」变成「按文档接线必冲突」）；R-27（发布文档写反/错误 signed 口径）由散落 P2 升 **P0 流程**（会直接导致错误对外宣称）。
- **降级**：R-07 的「完全无传输/无防回滚」降为**已实现**，只保留 Rust 出网与协议 v0.2；R-18/R-19/R-20/R-23/R-24 维持 P1/P2，不再占 P0。
- **关闭**：R-05（DLC dev-key override）、consent 绕过/ACL/innerHTML（§2.3 RES-06/07）。
- **保持 P0**：R-01/R-02/R-03/R-04/R-13/R-16；其中 R-13 由 triage-quality 主责，本域给安全 veto。

---

## 4. ③ Epic → Task 树

### 4.0 统计、约定与优先级

- 任务字段：`ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险`。P0/P1/P2 按 §3.1 口径；估算为工程人日，不含外部等待。
- **总计 34**：P0 13、P1 19、P2 2；另 1 项条件任务（updater 实现）不计入。**≈48–55 人日**。
- 共享任务（不在本表计数）：`T-QA-*`（数据隔离/干净 checkout/CI/证据归档/E2E/soak）、`T-ARCH-*`（spec/插件自证/模块拆分/storage 隔离）、`T-UX-*`（菜单/consent 可读性/语音控制）、`T-LEGAL-*`（法律文本/审批）。
- 任务粒度原则：一个任务一个可独立验收的交付物；验收尽量给命令/文件/断言，不写「优化架构」。

### 4.1 EP-SEC-1 发布身份与信任链（C2 gate）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-101 | P1 | 产品身份与升级/数据迁移 ADR 并实施：`Famling` 名称、identifier、版本轴、安装目录/AppData 迁移策略 | ADR 获 lead 批准；`tauri.conf.json`/`package.json`/关于页/安装目录/市场元数据一致；升级/卸载保留存档的 E2E 通过；旧 identifier 的迁移说明在 README | lead 决策 | 1.5 | 中：改 identifier 影响已有用户数据；必须先备份/迁移测试 |
| SEC-102 | P0 | DLC 生产 Ed25519 key ceremony（Resolution §5 Runbook A）：离线生成、双人保管、公钥入 trust root、记录 fingerprint | `production-trust-root.json` 1 个 active key；`verify-dlc-trust --report-only` 报 activeKeyIds；私钥/密码不在仓库/CI/日志；双人保管记录归档 | owner 指定 | 0.5 owner + 0.5 工程 | 高（外部）：保管/丢失/权限 |
| SEC-103 | P0 | 用生产 key 重签 `packs/farm-seasons`/`packs/reef-pack` 为 `signature.json`；清理随包 dev 公钥 | 两包生成 `signature.json`（keyId）；`verify-dlc-trust --staged` exit 0；发布树无 `packs/keys`；仓库 tracked `dev-public.pem` 移出或标注 dev-only | SEC-102 | 1 | 中：重签流程必须可复跑 |
| SEC-104 | P0 | ceremony 前把 DLC 从 release 移除/禁用：resources 不打包 packs、release UI 隐藏 DLC 入口、runbook 去掉「DLC 非 fallback」硬验收 | `tauri.conf` release profile 无 packs（或显式 `--no-dlc`）；`release-win --plan` 不列 DLC；游戏页无 DLC 入口；文档改为「signed DLC 仅在 gate 绿后启用」 | 无（可立即） | 0.5 | 低：产品功能暂时缺失，但诚实 |
| SEC-105 | P0 | DLC 发布门禁端到端：staged 树/EXE 扫描/负例/CI `--require-dlc-trust` | `verify-dlc-trust --staged` exit 0；release 模式强制 require；`test-dlc-rust.sh` 负例（repo dev-signed 必须失败）+ 正例（staged 生产签名必须过）均绿 | SEC-103 | 1 | 低–中：需要 Windows 符号路径 |
| SEC-106 | P0 | Authenticode 证书决策/采购/CI 配置（B1）：IV/OV/EV 选择、PFX/HSM、secrets、protected environment | 证书到位；`Get-AuthenticodeSignature`=Valid+signtool verify；secrets 不入库/日志；签名 key 与 DLC/updater 分离；`release.yml` 签名闸门在无材料时仍阻断 | owner/采购 | 外部 1–2 周 + 0.5 | 高（外部） |
| SEC-107 | P0 | 首次真实 signed tag 构建（B2）并归档报告 | tag 构建绿；`signing-report.json`+`RELEASE-MANIFEST.json`；Valid+timestamp+pin；artifact 命名 `windows-signed`；CI run 链接入库 | SEC-105、SEC-106 | 1 | 中：证书/runner 首次路径 |
| SEC-108 | P0 | SHA256SUMS/RELEASE-MANIFEST 的 minisign/cosign 外层签名（B6），公钥分发与验证文档 | `minisign -Vm SHA256SUMS.txt -P <pubkey>` 通过；公钥在 README/RELEASE-SIGNING；签名 key 独立保管；轮换/吊销流程在册；`release-win --verify` 增验签 | SEC-201 | 1 | 中：公钥分发/轮换 |
| SEC-109 | P1 | 五类密钥治理注册表 + 轮换/吊销/应急 runbook 写入 SECURITY.md（DLC/catalog/pack/updater/Authenticode） | key registry 表（keyId/fingerprint/用途/custodian/status/有效期）；SECURITY.md 有 DLC 信任根与紧急响应段；轮换/吊销演练记录；`--skip-dlc-trust` 仅 preview 写入文档 | SEC-102/SEC-106 | 1 | 中：文档与真实密钥同步 |
| SEC-110 | P1 | updater v1 ADR：是否做、minisign endpoint、防降级、分阶段 rollout/kill switch、离线策略；若做则追加实现任务（3–5 人日） | ADR 明确 yes/no 与 owner；若 yes：`latest.json` 签名、错签名/旧版本/yank 负向测试、更新 key 与 DLC/Authenticode 分离；若 no：SECURITY.md 写吊销 SLA 与手动升级流程 | lead 决策 | 0.5（ADR） | 中：更新链=RCE 面，不能草率 |

### 4.2 EP-SEC-2 发布证据与可复现门禁（C1/C2）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-201 | P0 | 发布证据包：`release-win --all --strict` 产出 SHA256SUMS + RELEASE-MANIFEST + BUILD-INFO，绑定 commit/tag/version/时间/构建输入；测试证据归档 | `release-win --verify` 通过；BUILD-INFO 含 `git rev-parse HEAD`、tag、版本、构建时间、WebView2/Rust/Node；artifacts 归到 `artifacts/qa/<date>/<run-id>/`；旧 11-14 产物隔离并有哈希清单 | 共享 T-QA（clean checkout） | 1 | 中：需 CI/Windows 路径 |
| SEC-202 | P0 | 干净 release profile：clean tree + HEAD tag + 重建 dist + 旧产物隔离 + 安装/卸载冒烟 | `git status --porcelain` 空、`git describe --exact-match` 有 tag；`dist` mtime 新于源码；`release-win --plan` 只列本次产物；安装→启动→卸载不残留、不删存档 | 共享 T-QA/CI | 1 | 中：Windows 实机 |
| SEC-203 | P2 | 供应链硬化：Actions 按 SHA pin、`@tauri-apps/cli` 入 devDependencies/lockfile、去构建期 `npx --yes`、`cargo fmt --check`/`clippy -D warnings`、`npm audit`/OSV、SBOM | workflow 无移动 tag/无 `npx --yes`；CI job 跑 fmt/clippy/audit/SBOM；依赖审计允许列表记录；构建可复跑 | SEC-201 | 2 | 中：会暴露既有依赖告警 |
| SEC-204 | P1 | Release Gate Matrix 文档 + 外部阻塞 tracker + 修正 README/RELEASE-CHECKLIST/RELEASE-RUNBOOK 的假状态 | `docs/plan/RELEASE-GATES.md` 含 G0–G3/命令/owner/停止条件；README 不再称 remote 已建/CI 已跑；CHECKLIST 修正「signed/unsigned」；RUNBOOK DLC 验收改为条件项；外部阻塞表有 owner/日期 | 无（可立即） | 1 | 低 |

### 4.3 EP-SEC-3 DLC/内容信任治理（C2/C3）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-301 | P1 | DLC loader 硬化（Resolution R6）：签名后的内容路径/大小/schema/IO 上限 | 恶意 manifest/路径穿越/超大文件/schema 越界 fixture 全部 fail-closed；正常两包不回归；`test-dlc-rust.sh` 绿 | SEC-104 | 1–2 | 中：Rust/内容 schema 双改 |
| SEC-302 | P1 | 信任根生命周期演练：active→retired→revoked + notBefore/notAfter + 客户端旧包/新包行为；吊销传播 SLA | 负向测试：retired 只验旧包、revoked 全拒、过期拒；吊销演练记录；SECURITY.md 写「吊销延迟=版本传播延迟」与紧急发版流程 | SEC-105/SEC-109 | 1 | 中：不能热更新根，需版本策略 |
| SEC-303 | P1 | DLC 重启用 gate：仅当 SEC-105/301 绿且签名包在场，release 恢复 DLC；对外文案/商店口径同步 | 同一 release 中 signed pack 可加载且 `dlcTrust.status=pass`；未签名 build 不显示 DLC；README/下载页不再含「含 DLC」歧义 | SEC-301/SEC-302 | 0.5 | 中：市场/商业口径 |

### 4.4 EP-SEC-4 远程市场传输 / 防回滚（C3）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-401 | P0 | 市场出网边界 ADR（裁定 C-01）：Rust-only egress、CSP 不变、TS 仅验证/状态机、预览图本地、日志脱敏、DNS rebinding/代理策略 | ADR 由 lead/安全/网络签字；明确「禁止 webview 市场 fetch」「禁止放宽 CSP」；列出允许的 Rust 命令与 capability；给出回退方案（market 关闭） | 无（先做） | 0.5–1 | 低（决策），但违反将开安全口 |
| SEC-402 | P0 | 受限 Rust 下载器：`market_fetch_catalog`/`market_download_pack`，URL 只来自已验签目录；HTTPS、host allowlist、禁私网/loopback/link-local、手动重定向同 host、1MiB/16MiB 上限、超时/Abort、流式 bounded body | Rust 单测 + fixture：http/私网/跨 host redirect/超大/超时/hash 不符全拒；capability 只 `pet-shell`；CSP 不变；E2E 用本地 HTTPS fixture | SEC-401 | 3–4 | 中–高：新增 IPC/网络面；需 SSRF 测试 |
| SEC-403 | P0 | TS 验证核心去默认 `fetch`：传输改为注入（IPC/测试），生产构建无全局 fetch 市场调用；保留 29+ 测试 | `grep` 生产路径无 `globalThis.fetch` 市场调用；`createMarketplaceClient` 必须显式注入 transport；静态测试「未接线时零请求」；原 29 项 + content-hub 适配全绿 | SEC-401 | 1–2 | 中：重构可能破坏测试 |
| SEC-404 | P1 | catalog v0.2：`serial`+`expires`+`minAppVersion`（可选）、离线宽限、时钟偏移容忍、ETag/304、重试/退避/429 Retry-After、大小/时间/并发/磁盘配额、稳定失败码；0.1 双读 | 10+ 负向测试（重放/过期/降级/时钟异常/304/429/超限）；协议文档与测试向量；不新增真实网络；现有 29 项仍绿 | SEC-403 | 2–3 | 中：协议兼容/时间语义 |
| SEC-405 | P1 | 生产市场 trust root 装配 + core 校验：`validateContentTrustRoot`（唯一 keyId、fingerprint=公钥、alg=ed25519、状态/有效期、dev 指纹黑名单）；根 pinned，不得读用户可写配置 | 负向测试：重复 id/指纹不符/dev key/未知字段/过期全拒；生产根在 release 产物中固定；`verifyMarketCatalogSignature` 前强制 validate；与 DLC 根共用 registry | SEC-401/SEC-109 | 1 | 中：与 DLC schema 对齐 |
| SEC-406 | P1 | 市场隐私与数据流：catalog/zip 请求暴露 IP/时间/UA/包 id；无账号/无遥测/离线可用；保留期/跨境；UI 显示上次刷新/离线/过期 | PRIVACY.md 新增市场数据流表并经 legal-check；UI 状态文案（未配置/离线/过期/上次成功）；无 CDN/字体远程；失败码短句不泄 URL | SEC-404 + legal | 1 | 中：需法务确认 |
| SEC-407 | P0 | 市场启用总开关 + 启用前 preflight：生产默认 off；`configured=false` 零请求；启用需显式 build flag/env + 清单全绿；可一键关闭 | 生产 build 静态/运行测试：市场按钮 disabled、零 fetch；启用清单（SEC-401–406 + 501–503 + keys/server/legal）逐项签名；关闭路径演练 | SEC-402/SEC-405/SEC-406/SEC-501 | 0.5 | 低 |

### 4.5 EP-SEC-5 安装器（C3）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-501 | P1 | Bounded 解压/原子安装/卸载/回滚：复用 `content-assets` 的有界 reader；拒绝 symlink/加密/zip64/重复/大小写碰撞；临时目录+sha 校验+原子 rename；断电恢复 | 恶意 zip fixture（bomb/穿越/symlink/加密/zip64/重复/大小写）全拒；安装中断/断电模拟无半装；卸载只删包目录；`validatePackZip` 与磁盘一致 | SEC-401 | 2–3 | 中–高：新攻击面 |
| SEC-502 | P1 | 安装器 UI/宿主接线：用途声明展示+显式确认、进度、失败恢复、卸载入口；不自动安装/不后台预取 | UI 负向：未确认不下载/不安装；失败可重试/清理；卸载可逆；a11y/键盘；`main.ts` 注入 client 前先满足 SEC-403 | SEC-403/SEC-404/SEC-501 + UX | 2–3 | 中：UI 与信任边界 |
| SEC-503 | P1 | 安装/卸载/升级端到端：Windows 干净机安装→启动→读旧档→覆盖升级→卸载保留存档 | 5 条断言 + 截图/日志归档；失败不改现有状态；升级/回滚演练；无残留进程/密钥 | SEC-501/SEC-502 + T-QA | 1 | 中：需要 Windows 实机 |

### 4.6 EP-SEC-6 云端出网与宿主边界（C1/C2）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-601 | P1 | 云端出网资源硬化：TTS/ASR/share 响应 bounded body（流式 `take(limit+1)`，TTS ≤8MiB、ASR ≤4MiB、share ≤4MiB）；ASR 日配额+令牌桶+429/5xx 退避+Retry-After | Rust 单测覆盖超大响应/429/超时/配额；ASR 先限流后 decode；UI 显示配额/失败可重试；release 默认可关闭 ASR | 无 | 1–2 | 中：不破坏现有 TTS 缓存/动画 |
| SEC-602 | P1 | 插件 bridge 纵深防御：`content-type: application/json` 强制、Origin/同源、`sec-fetch-site` 拒绝、自定义头、owner 级令牌桶、brief/task 超时、client AbortController/in-flight 禁用 | 插件 fake-host 测试：text/plain→415、evil Origin→403、cross-site→403、超限→429、慢 brief 超时；README 明示「依赖 DSH 宿主围栏」 | 无（插件仓） | 1 | 低–中 |
| SEC-603 | P1 | Webview/发布面收口：`on_navigation` 白名单（外链交系统浏览器）；Sentry DSN 仅构建期注入/移除 query；QA `--page`/`--bench`/开发页在 release 剥离或 debug-gated；TTS 缓存 LRU/上限 | release 路由表无 QA/开发页（或 debug-only）；远程 URL 不在 webview 导航；`?sentry=` 不再生效；LTS 缓存上限测试 | `SEC-204` | 1 | 中：会影响 QA 脚本，需同步 |
| SEC-604 | P2 | Consent/TOS 单一源与删除残留：`terms.ts` 与 Rust `main.rs` 常量生成/漂移测试；「本机同意非防篡改证据」写入 SECURITY/PRIVACY；host-consent.json/quota/WebView2 删除核验 | 漂移测试红/绿演示；文档明确非证据级；删除全部后回读核验残留清单；`host-consent.json` 清空 | 共享 T-UX/legal | 1 | 低 |

### 4.7 EP-SEC-7 插件发布与分发（C2/C3）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-701 | P1 | 插件仓库自证 + 发布门禁：`git init`/公开分支、CI（test/check/verify/pack dry-run）、`prepack`；缺私有资产时 **fail 而非 skip**；版本/README/CHANGELOG 同步 | 无私有仓环境 clone 后 `npm test && npm run check && npm run verify && npm pack --dry-run` 全绿；改一帧未重生成→CI 红；README 版本=package；`files` 含 spec/LOCK | triage-arch `spec` | 1–2 | 中：依赖 spec 产物 |
| SEC-702 | P1 | npm 正式发布/来源可验证：`repository` 字段、`--provenance`、发布真实版本（≥0.10.2）、deprecate 0.0.1 占位；升级/回滚演练 | `npm view dsh-famling version` = 本地版本；provenance 可验；`npm pack` 内容哈希与 README 的 sourceSha 一致；旧→新→回滚演练记录 | SEC-701 + npm 账号 | 0.5–1 | 中：npm 账号/包所有权 |

> EP-SEC-8（数据边界）为**共享 Epic，不重复建任务**：`SEC-801` 测试数据隔离交 triage-quality（P0），`SEC-802` 运行时同源 storage 交 triage-arch（P1）；见 §2.4。

### 4.8 EP-SEC-9 法务/隐私真值（C2，共享 legal/quality）

| ID | P | 目标 | 验收（可执行证据） | 依赖 | 估算 | 风险 |
|---|---|---|---|---|---|---|
| SEC-901 | P1 | 法务/隐私单一事实源：`terms.ts`/代码 → 生成 legal 文档 + `public/legal` 同步；`legal-check --strict` 接入 CI；README 状态段/RELEASE-BLOCKERS/PRIVACY 修正；事实时点与版本号 | `legal-check --strict` 为唯一读数（当前 34）；`public/legal` 与 `docs/legal` 无 stale；PRIVACY 不再写「无 ASR 同意/删除全部无」；README 不写旧计数；CI 检测 stale/DRAFT 变更 | 共享 T-LEGAL | 1–2 | 中：需要律师/owner 文本 |

### 4.9 依赖图与执行波次

```text
Wave 0（0–3 天，立即；无外部等待）
  SEC-104（DLC 停用） ─┐
  SEC-202（clean release profile，依赖 T-QA） ─┤
  SEC-201（证据包） ← SEC-202 ────────────────┤
  SEC-204（gate matrix + 文档纠偏） ──────────┤
  SEC-401（市场出网 ADR） ────────────────────┤→ SEC-403（无全局 fetch 门）
  SEC-102（owner 启动 ceremony） ─ SEC-103 ─ SEC-105
  SEC-106（owner 启动证书） ───────────────→ SEC-107
  SEC-901（legal 单一源，共享）

Wave 1（3–10 天）
  SEC-101（身份 ADR）; SEC-108（外层签名）; SEC-203（供应链）
  SEC-301（DLC 硬化）; SEC-302（生命周期）; SEC-404（catalog 0.2）
  SEC-405（trust root 校验）; SEC-601（出网上限/ASR 配额）
  SEC-602（bridge 纵深）; SEC-701（插件 CI/自证）

Wave 2（10–20 天）
  SEC-402（Rust 下载器）→ SEC-403（TS 传输重构）
  SEC-404 → SEC-406（隐私/UI）
  SEC-501（bounded 安装器）→ SEC-502（安装器 UI）→ SEC-503（E2E）
  SEC-109（密钥治理/应急）; SEC-110（updater ADR）
  SEC-603（webview 收口）; SEC-604（consent 单一源/删除残留）
  SEC-702（npm 发布/回滚）

Wave 3（C3 gate）
  SEC-407（市场总开关/preflight）; SEC-303（DLC 重启用）
  外部：E-03/E-04/E-05/E-06；条件：updater 实现（若 ADR=yes）
```

### 4.10 建议第一批（5 项，含验收）

| 顺序 | 任务 | 为什么现在 | 最小验收 |
|---|---|---|---|
| 1 | `SEC-104` | 当前 release 的 DLC 必然 fail-closed，是最容易消除的「半成品」风险 | release 产物无 packs、无 DLC 入口；runbook 不再要求 DLC fallback |
| 2 | `SEC-202` + 共享 T-QA 干净 checkout/CI | 没有可重建基线，后续所有「信任链」都无法证明 | `git archive HEAD` 后 `npm ci && npm run ci` 绿（共享验收）；本域 `release-win --plan` 只列本次 HEAD 产物 |
| 3 | `SEC-201` | 发布证据是 C1 的最低要求，也是 C2 的输入 | SHA256SUMS+RELEASE-MANIFEST+BUILD-INFO 存在且 hash/commit 可复核 |
| 4 | `SEC-401` + `SEC-403` 静态门 | 评审后新增的市场客户端已经埋下 CSP 冲突；先裁定再让 UI 接线 | ADR 签字；生产路径无全局 fetch；CSP 不变 |
| 5 | `SEC-102`/`SEC-106` owner 启动 | 证书 1–2 周、密钥 ceremony 不可压缩；晚启动=晚发布 | 有 owner/日期/保管人记录；公钥进入 trust root（102）；证书采购单/受理（106） |

---

## 5. Release gating 顺序（G0–G3）

### 5.1 通道与 gate

| Gate | 目标通道 | 必须证据（全部满足才过） | 失败处理/停止条件 |
|---|---|---|---|
| **G0** | C0 本地开发 | `typecheck` + 目标测试绿；未接线市场；无分发声明 | 不对外；不产出「可发布」措辞 |
| **G1** | C1 私域 unsigned beta | ① clean HEAD + tag + `release-win --all --strict` 产物 + SHA256SUMS/BUILD-INFO；② 本地/干净 checkout `npm run preflight` 绿（共享 T-QA）；③ 测试数据隔离（SEC-801，真实 appdata 哈希不变）；④ release 无 DLC（SEC-104）；⑤ 市场默认关闭且生产零请求；⑥ 不写 signed/已审核/可信；⑦ legal strict 34 已由 owner 以 beta 例外逐条签字（或 strict 0）；⑧ 安装/卸载冒烟 | 缺任一：不发；unsigned preview 不得创建 release |
| **G2** | C2 公开免费/下载 | G1 + ① Authenticode Valid（SEC-106/107）；② SHA256SUMS 外层签名（SEC-108）；③ DLC gate 绿（若含 DLC）或 DLC 移除；④ 产品身份最终（SEC-101）；⑤ legal 审批/APPROVALS 非 DRAFT；⑥ updater/吊销 SLA 决策（SEC-110）；⑦ 安装→升级→卸载 E2E；⑧ 发布证据归档（SEC-204）；⑨ 供应链 pin（SEC-203 可延后但需记录） | 缺任一：不得声称「signed/可信发布」；不得上架/收费 |
| **G3** | C3 在线内容市场 | G2 + ① SEC-401/402/403（Rust egress/无 webview fetch）；② SEC-404（v0.2/expires/离线）；③ SEC-405（pinned trust root/validate）；④ SEC-406（隐私告知）；⑤ SEC-407（总开关/preflight）；⑥ SEC-501–503（bounded installer/UI/E2E）；⑦ 市场密钥 ceremony + 服务端/CDN/日志/下架/审核流程（外部）；⑧ 法务跨境/内容审核签字 | 缺任一：市场 UI 保持 disabled；不得下载/安装远程内容 |

### 5.2 顺序原则（对 C-03 的裁定）

1. **先可自证，再信任链**：clean build/证据（G1）是 Authenticode/外层签名（G2）的前提；否则签名只证明「某个来路不明的 exe」。
2. **外部长周期并行启动**：证书采购（1–2 周）、DLC key ceremony（owner/双人）、市场密钥/服务器/法务，从 Wave 0 启动，不等代码全绿。
3. **先移除半成品，再恢复**：DLC 先移出（SEC-104），待 gate 绿再恢复（SEC-303）；市场先关（默认 null/off），待 G3 再开（SEC-407）。
4. **内容/架构工作不占安全关键路径**：spec/可玩角色/模块拆分可并行，但不得把「市场 UI 先做出来」当成进展。

### 5.3 不可豁免（stop conditions）

- 没有 Authenticode Valid 或 owner 书面接受「无签名公开分发」风险时，**不得**写「signed/可信/官方签名」。
- 没有 `verify-dlc-trust` exit 0 时，**不得**随 release 发布 DLC；`--skip-dlc-trust` 只允许内部 preview。
- 没有 SHA256SUMS+BUILD-INFO+外层签名（C2）时，**不得**创建面向公众的 release/下载页。
- 市场 UI/下载/安装**不得**在 G3 前接线；CSP 不得为市场放宽；webview 不得直连市场。
- 任何 GUI/E2E/soak **不得**触碰真实 `%APPDATA%`；`--reset-saves` 不得在无 QA 数据目录时运行。
- 不得以「评审已审计/模拟审查/本地测试全绿」替代真实证书/签名/法务/外部条款。

---

## 6. 外部阻塞清单（owner 需拍板/等待）

| # | 外部阻塞 | 影响 | 建议 owner/动作 | 最早可解 |
|---|---|---|---|---|
| E-01 | GitHub 私有 remote / Actions runner / protected environment | CI 从未真实运行；signed tag 无法产生 | lead/用户建 remote；配 `release-signing` environment | 0.5 天 |
| E-02 | Authenticode 证书（IV/OV/EV）采购+实名审核 | C2 发布者身份 | owner 拍板类型/预算/主体；1–2 周受理 | 1–2 周 |
| E-03 | DLC 生产 Ed25519 密钥 ceremony（离线机、双人保管） | DLC/C3 信任链 | owner + custodian；按 DLC Resolution §5 | 0.5–1 天 |
| E-04 | 市场 catalog/pack 签名密钥 ceremony（可与 E-03 同一保管体系，密钥分离） | C3 内容信任 | owner/custodian | 1 天 |
| E-05 | 市场服务端/CDN/域名/日志/审核/下架运营 | C3 可用性与合规 | owner 决定自建/对象存储；预算/跨境评估 | 数周 |
| E-06 | 法务：律师审阅、APPROVALS 签字、TOS/PRIVACY/ASR/TTS 条款 DRAFT、跨境/留存 | C2/C3 | legal owner；当前 strict 34 blockers | 1–4 周 |
| E-07 | npm `dsh-famling` 包所有权/2FA/provenance | 插件分发 | 包 owner 确认；发布真实版本/deprecate 0.0.1 | 1 天 + 账号 |
| E-08 | 产品决策：C1→C2 时间、DLC/付费/Steam、市场是否交付新角色、产品名/identifier | 影响全部优先级 | lead/用户 | 立即 |
| E-09 | DSH 宿主 API/engines 兼容与版本窗口 | 插件发布 | DSH 团队/版本矩阵 | 外部 |
| E-10 | Windows 签名硬件（HSM/USB token）若选高保证方案 | signed CI | owner 采购；脚本已支持 cert-store 但未实测 | 1–2 周 |
| E-11 | TTS baked WAV 再分发权利（DeepSeek 条款） | C2 音频/资产包 | legal/owner；不确定则关闭云音频/仅内部 | 法务周期 |
| E-12 | updater 是否在 C2 做（ADR） | 补丁/吊销通道 | lead 拍板；不做则写吊销 SLA | 立即决策 |

---

## 7. ④ 明确不做的项

1. **不放宽 CSP**、不让 webview 直连远程市场/CDN/字体；不接受「先放宽再补测试」。
2. **不在 G3 前**做真实市场服务端、CDN、镜像、支付/订单/退款、审核后台、自动预取、后台刷新。
3. **不做默认开启/静默更新/自动降级回滚的 updater**；若做，只做显式确认 + minisign + 防降级 + 可关闭。
4. **不自建 HSM/KMS/密钥托管平台**；采用离线双人 + GitHub protected environment + 外部证书；私钥不进仓库/CI/日志。
5. **不把 DLC 与内容市场 pack 合并成一套 schema**；保留双 schema + 共享治理/测试向量（架构已定）。
6. **不重做已闭合项**：consent 绕过、Tauri ACL、innerHTML、DLC release dev-key override、坏档恢复/IPC 超时——除非出现回归测试失败。
7. **不宣称「本地同意记录不可篡改」或「技术不可绕过」**；它是用户自主控制+审计留痕，不是证据级。
8. **不发布 unsigned 产物作为 signed release**；不加 gate waiver；不用 `--skip-dlc-trust` 对外发布；不把 unsigned preview 上传为 GitHub Release。
9. **不做 MSI/多平台/商店签名/PE bit-for-bit 复现/完整 SBOM 作为 C2 阻断**（列 P2/后续；C2 最低要求 Authenticode + 外层校验 + 可复现输入）。
10. **不做第三方远程代码执行/远程 JS/插件动态加载**；内容包永远是纯数据、先验签再落盘。
11. **不把云端 ASR 默认开启**；拿不到供应商书面条款/跨境结论时默认关闭，保留本地/baked。
12. **不做多镜像/断点续传/Range/全量缓存/后台下载**作为 v1（C3）范围；先把单源+原子安装+可回滚做对。
13. **不以清理/迁移真实 `%APPDATA%` 或删除用户存档作为测试手段**；不跑会触碰真实 appdata 的 GUI 探针。
14. **不把评审行号/旧测试数/旧截图当作现值**；所有 gate 以当前 HEAD 可复跑命令为准。
15. **不在本期做**：Steam entitlement 真接入、内容市场新角色资产包格式、游戏基座统一、DSH 宿主能力协商——分别交 triage-game/arch/上游。

---

## 8. 需要拍板的问题（给 lead/用户）

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| Q1 | 下一目标通道是 C1 还是 C2？ | A C1 私域 beta（当前计划）；B 直接冲 C2；C 两者并行 | **A 先发，C2 并行准备**；未定前按 C1 gate 执行 |
| Q2 | Authenticode 证书类型/预算/主体？ | IV（个人名，约 ¥600–1000/年）/ OV / EV | **C1 不买；C2 最低 IV，若需组织身份/商店则 OV/EV**；越早采购越好 |
| Q3 | DLC 的短期处置？ | A 立即从 release 移除（推荐）；B 保留但标 preview；C 等 ceremony | **A**；ceremony 并行（SEC-102/103），恢复走 SEC-303 |
| Q4 | 市场出网边界？ | A Rust-only（推荐）；B 放宽 CSP 走 webview；C 先不做市场 | **A**；B 需单独威胁模型（默认否决） |
| Q5 | 市场首批范围？ | A 只读目录+本地导入；B 在线下载；C 含新角色/资产包 | **A**；B 需 G3；C 交 triage-game |
| Q6 | updater 是否在 C2 前做？ | A 做（minisign/防降级/分阶段）；B 不做，写吊销 SLA+手动升级 | **B（C1/C2 初期）**，G3 前再评估 A；若做必须独立 key/审批 |
| Q7 | 产品身份与改名时机？ | A C2 前完成 Famling/identifier/版本；B 保持 DesktopGames | **A**；C1 可先发但 README 标注迁移计划 |
| Q8 | 法务/供应商条款谁负责、何时给书面结论？ | ASR/TTS 跨境/留存、DRAFT 审批、APPROVALS | 指定 legal owner + 日期；拿不到则关闭云 ASR/音频 |
| Q9 | npm 包所有权/发布人？ | 用现有账号发布 0.10.x / 另建 scope | 确认 E-07 后可发；发布前 SEC-701 全绿 |
| Q10 | 是否接受「无 updater 时吊销传播=手动升级」的残余风险？ | 接受并写 SLA / 不接受则必须做 updater | 若接受：SECURITY.md 写清；C2 对外文案不得承诺自动修复 |

---

## 附录 A 证据索引（本轮核对的当前代码/文档）

| 主题 | 证据 |
|---|---|
| `content-market.ts` 的范围/默认 fetch | `src/pet/content-market.ts:1-55`（scope/规则）、`:207-215`（默认全局 fetch）、`:1126-1143`（trust root 仅形状）、`:1767`（可选 allowlist）、`:1854`（create client）、`:1312`（installConfigured） |
| 市场契约仍是 0.1 | `src/pet/content-library.ts:642`、`:705-712`（ContentTrustRoot）、`:4413`（validateMarketCatalog）、`:4483`（verifyMarketCatalogSignature） |
| 市场未接线 | `src/pet/main.ts:898`（activeMarketSource=null）、`:979-985`（默认 state）、`:1000`（注入 getMarketState）；无 `import './content-market'` |
| DLC 根/包 | `native/dlc-verify/trust/production-trust-root.json`（keys:[]）；`packs/*/signature.txt`；`scripts/verify-dlc-trust.mjs`；`packs/keys/dev-public.pem` tracked |
| CSP/产品身份/updater | `app/tauri/src-tauri/tauri.conf.json:3-5,30,47-49`；`Cargo.toml:12-18`；`capabilities/pet-shell.json` |
| Rust 出网 | `app/tauri/src-tauri/src/voice.rs:175,232`；`main.rs:187`（share `.json()`）；ASR 无 quota |
| 测试数据/导航/单实例 | `grep DG_QA_DATA_DIR/on_navigation/single-instance` 全仓 0 命中；`main.rs:349-359,961-965`（`--game=` 暂扣、`--page` 不暂扣） |
| CI/供应链 | `.github/workflows/{ci,release,_windows-build}.yml`（`@v4` 未 pin、`npx --yes @tauri-apps/cli@2.12.6`、`continue-on-error: true`） |
| 发布证据/旧产物 | `scripts/release-win.mjs:470-520`（SHA256SUMS 无外层签名）；`ls artifacts`（11-14 旧包、无 SHA/Manifest） |
| 法务/隐私漂移 | `docs/legal/PRIVACY.md:36,52,74-75,96`；`README.md:11,243,254`；`docs/legal/RELEASE-BLOCKERS.md:4`；`docs/RELEASE-CHECKLIST.md:5`；`docs/RELEASE-RUNBOOK.md:194-195` |
| 插件发布 | `<private-path> `repository`/`prepack`）；`npm view dsh-famling version`→0.0.1；目录无 `.git` |
| 既有 resolution | `docs/audit/RESOLUTION-{DLC-SIGNING,AUTHENTICODE,CONSENT-GATE,TAURI-ACL,INNERHTML}-2026-11-19.md`；`docs/RELEASE-SIGNING.md:256-280`；`docs/UPDATER-KEYS-2026-11-15.md` |

## 附录 B 验收命令速查（只读；带当前预期）

```bash
cd <private-path>
# 当前预期：3 error（无 active key + 两个 legacy pack）
node scripts/verify-dlc-trust.mjs --report-only --json
# 当前预期：BLOCKED 34 blockers / 34 warnings
node scripts/legal-check.mjs --strict
# 当前预期：空（无 remote）
git remote -v
# 当前预期：仅 docs 变更
git status --porcelain
# 当前预期：0.0.1（占位）
npm view dsh-famling version
# 市场零接线检查（应无 main.ts import / activeMarketSource = null）
grep -rn 'content-market' src/pet/main.ts src/pet/desktop-shell.ts || true
# 测试数据隔离/导航/单实例检查（当前应无命中）
grep -rn 'DG_QA_DATA_DIR\|on_navigation\|single-instance' src app scripts tests .github || true
```

## 附录 C 边界声明

1. 本文件是**安全/网络/发布切片的 triage**，不替代七份评审原文、既有审计/Resolution、法务意见或发布审批。
2. 所有「评审记录」数字（1046 tests、干净 checkout 4 fail、Windows 141 断言等）来自评审 B 级证据，本轮未复跑；当前状态以 §1.3 A 级实测为准。
3. 未验证项：Windows GUI/签名/真实下载/24h soak/上游 npm/GitHub Actions；均不得当作已通过。
4. 估算为量级（±50%），不是承诺；外部等待不计。
5. 本文件不构成法律意见；C2/C3 前仍需律师/owner 书面批准。


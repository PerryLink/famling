# 架构师视角全项目评审（famling / dsh-famling · 2026-11-19）

| 项 | 内容 |
|---|---|
| 评审视角 | 架构师：系统边界、模块耦合、双宿主（Tauri / DSH）、共享内容契约、远程市场与安装器、扩展点、技术债与重构路线 |
| 任务 | task-55（独立评审）；只读，不修代码/资产/配置，不 commit/push |
| 快照时间 | 2026-11-19 12:50–13:20（Asia/Shanghai）；评审期间工作树有并行改动（一度红，13:10 复查已绿），见 §1.3 |
| 评审对象 | famling 私有仓 `<private-path> `779354b`，18 个未提交改动）；dsh-famling 插件 `<private-path> `.git`）；DSH 只读 checkout `/home/yy/deepseek-harness`（0.2.2-rc.4，HEAD `ca33fd6843`） |
| 方法 | 文档与源码静态阅读 + `src/**` 导入图分析 + 可运行门禁（插件 76/76 tests、embed-anims/verify-anims 全绿；famling 内容子集 131/132、`tsc` exit 2，见 §1.3/附录 A） |
| 唯一写入 | 本文件 `desktop-games/docs/research/PROJECT-REVIEW-ARCHITECT-2026-11-19.md` |
| 未做 | 未构建/运行 Tauri 或真实 DSH 实例的 GUI；未联网核对公开仓状态；未验证 npm 发布；未跑 famling 全量测试；未读其他评审者报告 |

> 证据约定：`DG/` = `<private-path> = `<private-path> = `/home/yy/deepseek-harness`。文件行号以本快照为准。标 **unverified** 的条目只有代码/文档声明，没有本轮端到端实测。

---

## 0. 执行摘要

### 0.1 一句话判断

**产品边界与总体方向是对的，但“共享内容契约”目前只是人工约定，不是可执行工件**：两个产品各写一份角色/内容/动画/同意语义，插件构建隐式依赖私有仓，公开镜像与 CI 又各自断链；于是同一批 id 已经出现“同名不同义”，且没有任何门禁能判定哪边是权威。P0 的三件事本质上是同一件事的三面：**把约定变成版本化、可生成、可独立校验的 spec，并让发布链路只消费 spec**。

### 0.2 支撑判断的硬事实

1. **两套内容模型各自为政，已漂移**。famling 侧 `DG/src/pet/content-library.ts:1-55` 自称是“两个产品共用的唯一数据模型”，schema 为 `famling.content/0.2`、`famling.content-pack/0.2`；插件侧另写 `content-extension.mjs`（v3、7 kinds，706 行）。同一角色 id 的“角色=主题”bundle 已经不同：
   - 猫：famling `public/content/library.json:59-68` 是 `dialoguePackId=standard` + `night/dark/serif`；插件 `client.js:129-136` 是 `dialogue: brief` + `paper/paper/serif`。
   - 狗：famling `library.json:102-111` 是 `paper/paper/system`；插件是 `night/dark/mono`。
   - 对话包同 id 语义完全不同：famling `library.json:290-320` 的 standard/brief/quiet = 0.7/240、0.4/80、0.05/50；插件 `client.js:76-82` = 1/unlimited、1/90、0.35/unlimited。
   - 同 id 的 `human/cat/dog` 在两端加载的默认外观、对话节奏、origami 可用性都不一致，且没有共享测试或权威表回答“哪个值算正确”。
2. **插件构建不是自包含的**。`DF/scripts/embed-anims.mjs:82-84` 默认从 `../../desktop-games/public/assets/pet/anim` 与 `../../desktop-games/public/characters` 读源；缺源直接抛错（`:821`）。`verify-anims.mjs:564-566` 在缺私有资产时只给 warning，`test/client-static.test.js:166,213` 直接 `t.skip`。即：公开插件仓单独 checkout 时，校验链会“绿着跳过”，无法自证嵌入字节来自哪份 spec。
3. **发布/版本链路多处断链**。`DG/` 本地 `git remote -v` 为空，而 `.github/workflows/ci.yml:3-6` 明写 “This repo has no git remote yet, so this workflow only starts running once a remote is added”；`DF/` 本地目录不是 git 仓、无 `.github/workflows`。DLC 生产信任根/重签仍是发布阻断（`DG/docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md:24-26,612-620`），Authenticode 证书未到位、无 updater，而 `tauri.conf.json:3-5` 仍是 `DesktopGames` / `0.1.0` / `com.perrylink.desktopgames`。
4. **长文档里的长期方案没有落地为工件**。`DG/docs/design/FAMLING-DSH-ARCH-2026-11-18.md:17-31` 已给出正确决策：D2 唯一共享物是契约、D4 收敛单文件 host adapter、D5 版本四轴、D7 spec + LOCK、D9 优先还债。但本轮核对：`spec/` 目录不存在、无 `LOCK.json`、`HOST_BASELINE` 在插件内无任何引用（`famling.face` 只出现在设计稿正文里）。即：**方向写在纸上，执行仍停在方案 A（双线 + 手工同步）**，同一份设计稿 §1.6 所列漂移项大多仍在。
5. **代码并非没有秩序**：`src/**` 176 个 TS 文件 / 52,824 行（`src/pet` 91 文件 / 40,806 行），pet 模块导入图 253 条边、**0 个循环依赖**；插件首屏 66.1 KiB < 72 KiB 预算、动画按角色懒载（127.9 KiB 首帧 / 313.5 KiB 全量）；Tauri 侧已有 23 命令 × 7 窗口的 ACL 矩阵与 build.rs 漂移门禁、consent 门下沉到 Rust、DLC 信任根/轮换/吊销机制。**问题不在“要不要重写”，而在“把已经想清楚的约定变成可执行工件，并清理几处结构性重复”。**

### 0.3 评分表（架构维度）

| 维度 | 评级 | 一句话依据 |
|---|---|---|
| 产品边界/定位 | B+ | 双产品分离、公开/私有哪些能/不能导出都已写清（ARCH D1/D3/D8）；但公开切片靠人工白名单导出，边界事实已在公开仓出错（18-WAV 声明、DesktopGames 元数据）。 |
| 共享契约/数据模型 | **D** | 内容、动画、行为、同意、brief 五类共享面均双实现；同 id 不同值已实测；无 spec/LOCK/一致性测试。 |
| 模块内聚与分层 | C− | 无循环依赖是好底子；但 `main.ts` 3,551 行/47 个直接依赖、`content-library.ts` 4,568 行、`content-hub.ts` 2,314 行，composition root 与 UI/业务混在一起；`src/voice` 反向依赖 `src/pet/security`。 |
| DSH 宿主集成 | C+ | bridge/slot/lazy chunk 都可用且有 76 项 fake-host 测试；但硬 `inject` 三服务、无能力探测/hello、无单一 host adapter，`engines.dsh` 宿主并不强制（DSH 文档自述）。 |
| Tauri 宿主/安全边界 | B | ACL/consent/DLC/注入面在 11-19 已系统性收口（多份 RESOLUTION 有实测）；但发布信任未闭环、同源页面共享 storage 的隔离问题仍在、无 updater。 |
| 扩展点设计 | B− | anim manifest / regions / behavior / content-extension 都是纯数据 + fail-closed，方向正确；但两端扩展点不同构、无 conformance 测试、安装器未实现。 |
| 发布/可复现/CI | **D+** | 私仓无 remote（CI 不运行）、插件无 git/CI、跨仓构建隐式依赖、版本轴无矩阵；唯一可核验的是本机命令。 |
| 测试与质量门 | B− | 126 个测试条目、历史 842 项、插件 76 项且行为/静态/安全测试分层清楚；但评审期间树一度红（13:10 已绿，未提交且无 CI 记录）、跨产品无契约测试、插件测试在缺私有资产时静默 skip。 |
| 技术债/可维护性 | C− | 单体化、双动画管线、遗留 Electron 宿主、4.8 GB 本机构建产物、多份契约文档副本；改造可知、但需按阶段做。 |
| 市场/安装器就绪度 | D | famling 有本地导入与远程验签“纯函数契约”，插件只有 UI 占位；没有系统级安装器/信任根/更新/回滚设计，也没有单一 pack 格式。 |

### 0.4 问题清单与优先级

| 级别 | 数量 | 条目 |
|---|---|---|
| P0（做下一轮内容/市场/发布前必须解决，否则返工面持续扩大） | 3 | P0-1 共享内容语义无单一权威源（已漂移）；P0-2 插件构建/发布不可自证（跨私有仓隐式依赖 + 无 git/CI）；P0-3 发布信任与版本身份未闭环（DLC 生产根、Authenticode、updater、DesktopGames 元数据） |
| P1（影响长期演进，应在 1–2 个迭代内处理） | 7 | P1-1 DSH 适配层/能力协商缺失；P1-2 市场/安装器缺系统设计（两端格式与能力不对称）；P1-3 Pet Brief/bridge/同意语义双实现；P1-4 单体化与并行协作冲突；P1-5 角色/动画多管线与遗留资产/Electron；P1-6 famling 公开镜像与私仓 CI 断链；P1-7 Tauri 同源页面 storage 未隔离 |
| P2（低成本清债/体验一致性） | 10 | 见 §6 表（层反向依赖、遗留 Electron、元数据命名、文档/测试数字漂移、i18n 内联、发布页收口、插件客户端无类型检查、契约文档多副本、本地构建产物、合规元数据两端不一致） |

### 0.5 建议先做 3 件（详见 §8）

1. **冻结“共享语义清单 + 单一权威源”**：先把 15 个共享面（见 §2.3）列成一张合同表，裁定同 id 的角色/对话/语音策略哪边算权威；再生成版本化 `spec/`（JSON Schema + 角色/对话/声明/动画清单 sha）与双端 conformance 测试。0.5–1 人日写表，2–3 人日出最小 spec。
2. **让 dsh-famling 仓库/CI 可独立自证**：把 spec（或其生成物 + LOCK）vendored 进插件，`embed-anims --check`/`verify-anims`/`node --test` 在**无私有仓**环境全绿；同时把插件目录纳入 git + CI。1.5–3 人日。
3. **发布链路收口**：给 DLC 生产密钥 ceremony / 重签 / Authenticode / updater / 产品身份（DesktopGames→Famling）定 owner 与时间点；在完成前冻结“可对外称 signed/可发布”的表述。工程侧 3–5 人日，其余依赖外部证书/密钥决策。

> 评审期间工作树经历了“红→绿”的中间态：约 12:55 内容子集 132 项中有 1 项失败、`tsc` 有 8 个错误（均在 task-54 未提交改动里）；13:10 复查已变成 `tsc` exit 0、内容子集 **136/136 通过**。这既不是产品缺陷，也不代表基线稳定——它是并行协作（P1-4）的直接证据：同一批文件在评审期间被另一任务持续修改，且没有 CI 记录或拦截中间态；快照结论不能只看某一刻。

---

## 1. 评审边界、证据与方法

### 1.1 对象与路径

| 对象 | 路径 | 版本/身份 | 本轮处理 |
|---|---|---|---|
| famling（独立 Tauri 桌宠应用，私有完整仓） | `<private-path> | HEAD `779354b`；`package.json` 0.1.0；Tauri product `DesktopGames` | 只读代码 + 文档 + 导入图 + 内容子集测试/typecheck |
| dsh-famling（DSH 客户端插件） | `<private-path> | 0.10.0；本地无 `.git`；无 CI | 只读代码 + 文档 + 本机门禁（76 tests / embed / verify） |
| DSH 宿主 | `/home/yy/deepseek-harness`（只读） | 0.2.2-rc.4，HEAD `ca33fd6843` | 只读核对客户端插件协议、slot、fetch route、manifest 语义 |
| 公开仓 | `PerryLink/famling`、`PerryLink/dsh-famling` | 公开状态本轮**未联网核对**（unverified） | 只引用本地文档/审计记录 |

### 1.2 读取的关键材料

- 产品/交接：`DG/README.md`、`DF/README.md`、`DF/docs/DETAIL.md`、`00-live/FAMLING-DSH-HANDOFF-2026-11-18.md`（§1–§12）。
- 设计与契约：`DG/docs/design/FAMLING-DSH-ARCH-2026-11-18.md`（§0–§6）、`DG/docs/design/CONTENT-MARKET-2026-11-19.md`（§0–§10）、`DG/docs/integration/{ADVISERS-CONTRACT,DSH-FAMLING-BRIDGE-2026-11-17,FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18}.md`、`DG/public/content/{README.md,library.json}`。
- 审计与处置：`DG/docs/audit/FAMLING-SECURITY-AUDIT-2026-11-18.md`、`FAMLING-PUBLIC-BOUNDARY-2026-11-18.md`、`RESOLUTION-{DLC-SIGNING,TAURI-ACL,CONSENT-GATE,INNERHTML,AUTHENTICODE}-2026-11-19.md`、`00-live/docs/audit/{DSH-FAMLING-SECURITY-AUDIT,PET-PERFORMANCE-AUDIT,PET-ROBUSTNESS-AUDIT}-2026-11-18.md`、`RESOLUTION-PLUGIN-BUNDLE-2026-11-19.md`。
- 源码：`DG/src/pet/**`（含 `main.ts`、`content-library.ts`、`content-hub.ts`、`content-assets.ts`、`hero-runtime.ts`、`desktop-shell.ts`、`hit-regions.ts`、`consent/terms.ts`）、`DG/src/voice/**`、`DG/app/tauri/src-tauri/**`、`DG/public/characters/**`、`DG/public/assets/pet/anim/**`、`DG/vite.config.ts`、`DG/.github/workflows/**`；`DF/{index.js,client.js,client.content.js,content-extension.mjs,scripts/**,test/**}`。
- DSH 只读：`DSH/packages/client/ui-sidebar/src/client/contract/slots.ts`、`DSH/packages/client/modules/README.md`、`DSH/packages/util/package-manifest/README.md`、`DSH/docs/api-gateway.md`。

### 1.3 快照与状态漂移声明（重要）

本评审发生在多 agent 并行改动期间，以下状态是本轮**实测**，不是历史数字：

| 检查 | 命令（在对应目录） | 结果 |
|---|---|---|
| 插件静态语法 | `node --check index.js && node --check client.js` | OK |
| 插件 embedded 数据新鲜度 | `node scripts/embed-anims.mjs --check` | OK（208 帧；entry 66.1 KiB；3 个 chunk 未变） |
| 插件契约/资产 | `node scripts/verify-anims.mjs` | OK（first paint 127.9 KiB；all 313.5 KiB） |
| 插件测试 | `npm test` | **76/76 pass** |
| famling 内容子集 | `node --import tsx --test tests/content-library.test.ts tests/content-pack-v2.test.ts tests/content-hub.test.ts tests/content-assets.test.ts`（12:55 / 13:10 两次） | 12:55：**132 tests / 131 pass / 1 fail**（`tests/content-hub.test.ts:1118` 断言失败）；13:10：**136 tests / 136 pass**（task-54 期间新增并修复测试） |
| famling 类型 | `npm run typecheck`（12:55 / 13:05 / 13:10） | 12:55 **exit 2，8 个错误**（全在 `tests/content-hub.test.ts`：`writeContentSelection`/`isRemoteMarketConfigured`/`SelectionKey` 未导入、`restore` 可能为 null、Promise 类型不符）；13:05 exit 2，3 个错误；13:10 **exit 0**（同一批文件被 task-54 修完，未提交） |
| 工作树 | `git status --porcelain` | 12:55 为 **18 项**：M `src/pet/{main.ts,content-hub.ts,content-library.ts,desktop-shell.ts,pet.css}`、M `tests/content-hub.test.ts`、M `public/content/{README.md,library.json}`、?? `src/pet/content-assets.ts`、?? `tests/content-pack-v2.test.ts` 等；13:10 因 task-54 收尾与并行评审新增文档变为 **21 项**（仍未 commit） |
| 私仓远端 | `git remote -v` | **空**（无 remote） |
| 插件 VCS | `git status`（插件目录） | **fatal: not a git repository** |
| 长期方案工件 | `ls DG/spec`；`find … -name LOCK.json`；`grep HOST_BASELINE DF/` | `spec/` 不存在；无 LOCK；无 HOST_BASELINE |

**解读**：红的来源是 task-52/54 正在改的内容中心 v2（`public/content/library.json`、`content-library.ts`、`content-hub.ts`、对应测试都在工作树里），不是已提交基线；13:10 这些改动已把测试修绿但尚未 commit。因此本报告**不把这两项失败计为产品 P0 缺陷**；但它确实证明 P1-4 的判断——缺少按模块的写隔离与“提交前必须全绿”的门禁时，主树状态取决于并行任务进度，且没有 CI 能替人记录/拦截中间态。**评审结论引用的是当前代码结构，不依赖某一刻的红绿。**

### 1.4 证据等级

- **代码/配置事实**：给文件:行；可直接复核。
- **命令实测**：给命令和结果；见附录 A。
- **文档声明**：给文档:行，但标注“文档声明”，不当实测。
- **推断**：明确写“推断”，并给推断依据。
- **未验证**：Tauri/DSH GUI、公开仓当前 HEAD、npm 发布、远程市场服务器等，均标 unverified。

---

## 2. 系统现状（架构事实）

### 2.1 两产品、两宿主、一层共享面的总览

~~~text
                         ┌───────────────────────────── 内容生产/私有区 ─────────────────────────────┐
                         │  DG/public/assets/pet/anim/{human,cat,dog}/manifest.json + PNG (208 帧)         │
                         │  DG/public/characters/{pet-dog,pet-cat,pet-tinglan-anim}/{character,behavior,regions}.json │
                         │  DG/public/content/library.json (famling.content/0.2) + docs/content-packs/**          │
                         │  DG/src/pet/content-library.ts (4,568 行，纯函数：解析/校验/选择/市场验签契约)          │
                         └───────────────┬───────────────────────────────────────────────┬─────────────────┘
                                         │ 文件拷贝/人工同步                              │ embed-anims.mjs 读源生成 base64 chunk
                                         ▼                                               ▼
  ┌──────────────────────────────────────────────┐        ┌────────────────────────────────────────────────┐
  │ famling（Tauri 2 + WebView2，Windows）        │        │ dsh-famling（DSH 客户端插件，纯 JS）             │
  │ pet.html → src/pet/main.ts (3,551 行)         │        │ index.js (Host half, 272 行)                    │
  │  ├ hero-runtime / scene / render / anim       │        │  └ POST /api/famling/bridge（echo/chat/brief/task*）│
  │  ├ content-hub (2,314) + content-library      │        │ client.js (1,037 行手写 + 生成块)                │
  │  ├ consent/safety/security（18+ 门/TOS/TTS/ASR）│        │  ├ slot sidebar.footer.action                    │
  │  ├ voice（stella/tide baked + 云 TTS/ASR）      │        │  ├ client.content.js（内容中心 UI，懒载）        │
  │  └ 9 个 Vite 页面入口（pet/setup/chat-import…） │        │  └ client.anims.{human,cat,dog}.js（懒载 208 帧）│
  │ Tauri IPC：23 命令 × 7 窗口 ACL；DLC 验签；DPAPI │        │ 无网络、无 pack 执行、无资产解包                  │
  └──────────────────────────────────────────────┘        └────────────────────────────────────────────────┘
                 │                                                        │
                 └──────────── 名义共享：内容/动画/角色/同意语义 ──────────┘
                          实际共享：手工复制的数据 + 各写一份的校验/映射
~~~

**关键事实**：两端没有共享运行时代码（检查 `DF/**`：除生成脚本读 `DG/public/**` 与 `client.js` 生成注释外，无 `import` 指向 `DG/src`）；插件 `client.js` 在 DSH 的 `window.__ModuleLoader__.load({id,factory})` 工厂里运行（`DF/client.js:1-9`），Tauri 侧是 Vite/TS 模块；这是 D1/D2 的合理结果。真正的共享面因此只能是**数据与语义**——而它目前正是最薄的一层。

### 2.2 代码规模与形态（本轮实测）

| 区域 | 文件数 | 行数/体积 | 说明 |
|---|---:|---|---|
| `DG/src/**` | 176 TS | 52,824 行 | 17 个一级子目录 + 2 个根文件；pet 占 77% 行数 |
| `DG/src/pet/**` | 91 | 40,806 行 | 导入图 253 边、0 环 |
| 其中 `main.ts` | 1 | 3,551 行 / 直接依赖 47 模块 | composition root + DOM + voice + consent + content + hero 混装 |
| 其中 `content-library.ts` | 1 | 4,568 行 | 纯函数内容模型（v1 适配 + v2 角色主题 + pack v1/v2 + zip/市场/验签契约） |
| 其中 `content-hub.ts` | 1 | 2,314 行 | 内容中心 UI/控制器（DOM + 导入流程 + 市场状态） |
| 其中 `content-assets.ts` | 1 | 1,270 行 | IndexedDB 资产存储（未跟踪新文件） |
| 其中 `desktop-shell.ts` / `hero-runtime.ts` | 2 | 1,522 / 1,250 行 | 菜单/窗口壳；hero 装配与布局 |
| `DF/client.js` | 1 | 1,037 行 / 67.7 KB（entry 66.1 KiB） | 手写 + 生成块；含 UI、状态机、区域命中、懒载 |
| `DF/content-extension.mjs` | 1 | 706 行 / 36.6 KB | v3 纯数据 pack 契约 |
| `DF/scripts/{embed-anims,verify-anims}.mjs` | 2 | 888 / 611 行 | 生成/校验；跨仓读私有资产 |
| `DF/test/**` | 3 | 1,837 行 | fake-host/静态/行为测试；**76 项本轮全绿** |
| `DG/tests/**` | 126 个条目（含 fixtures 目录） | — | 历史 842 项（文档声明；本轮未跑全量，只重复跑内容子集） |
| `DG/app/tauri/src-tauri/**` | 16 | `main.rs` 1,201 行 + `build.rs` 432 行 + 7 capability | ACL/consent/DLC/voice IPC |

### 2.3 共享面清单（本报告的核心对象）

下面 15 个面是“两个产品必须保持一致，或必须显式声明差异”的全部对象。**没有任何一个面有单一权威源 + 双端一致性测试**：

| # | 共享面 | famling 侧权威/消费点 | dsh-famling 侧 | 当前强制机制 |
|---|---|---|---|---|
| 1 | 96×96 动画帧包（12 clip / 208 帧 / holdMs / anchor / footBox / palette） | `DG/public/assets/pet/anim/{human,cat,dog}/manifest.json` + PNG；`hero-runtime` 消费 | 由 `embed-anims.mjs` 重编码为 base64 写入 3 个 chunk | 生成时校验；`--check` 比对字节；**依赖私有源存在** |
| 2 | 点击区域/动作/台词（head/body/tail、actions、gestures、says） | `DG/public/characters/{pet-dog,pet-cat,pet-tinglan-anim}/regions.json`（version 1） | 嵌入 `ANIMS[character].regions`，按 96 逻辑画布命中 | `embed-anims` 校验；`verify-anims` 断言 |
| 3 | 事件→clip 映射 | `behavior.json` 的 `slots`（如 `pat_head/ball_throw/...`） | 手写 `EVENT_CLIPS`（`client.js:34-45`，含 `feed→stand_wag`） | 仅插件侧 `verify-anims` 检查事件存在；**与 behavior.json 无对照** |
| 4 | FCI 角色文档（apiVersion 0.1/0.3、capabilities、sockets、fallback、packBase、behaviorFile） | `DG/public/characters/*/character.json`；`src/pet/character/**` | **不消费** | 无跨端校验 |
| 5 | 内容目录（6 类 + 角色主题） | `DG/public/content/library.json`（`famling.content/0.2`）+ `content-library.ts` | **不消费**；`client.js:129-136` 手写 `ROLE_BUNDLES` | 无 |
| 6 | 内容包格式 | `famling.content-pack/0.2`（roleThemes + 6 components + files[]/sha256 + zip 校验） | `content-extension.mjs` v3（schemaVersion 3、7 kinds、assets 预留） | 各自 fail-closed；无交叉校验 |
| 7 | 远程市场目录 | `famling.market-catalog/0.1` + Ed25519 verify 契约（`content-library.ts` §市场） | v3 `remoteCatalog` 仅元数据，`allowRemote` 默认 false | 均不联网；无共享 schema |
| 8 | 统一用途声明（researchOnly + 6 prohibitedUses + canonical statement） | `content-library.ts:148-176`、`library.json` 每条 | `content-extension.mjs:59-70`、`client.content.js` `DECLARATION_TOKENS`、`client.js` `USAGE_DECLARATION`、README/DETAIL | 文本复制 5+ 处（`grep emotional-companionship`：famling src 4 文件、public 2 文件、插件 5 文件） |
| 9 | 角色 id 映射（humanoid↔human、cat/dog、origami 不导出） | `CONTENT_CHARACTER_PRODUCT_IDS`（`content-library.ts`） | `ROLE_BUNDLES`/`CHARACTER_IDS` | 无自动化对照 |
| 10 | 声音/TTS 策略（human 可 TTS、cat/dog 永不 TTS、同意独立） | `character-voice.ts` + `consent/terms.ts`（版本/hash） | `CHARACTER_POLICY` + 本地 `consent/v1` 布尔（无版本/hash） | 双端各自测试；无共享 canon |
| 11 | 同意文本/TOS 版本 | `src/pet/consent/terms.ts:80-84`（TOS 2026-11-17.6 / TTS .4 / ASR .3，hash 派生） | `client.js:358-359` 自写两段文本，`CONSENT_KEY='dsh-famling/consent/v1'` 只存 bool | 无 |
| 12 | Pet Brief 消费（Advisers 契约 v0.2 / schemaVersion 2 / TTL / displayPolicy） | `src/presence/pet-brief.ts`（严格：closed schema/TTL/claims/隐私面板） | `index.js:101-156`（简化：TTL+counts+displayPolicy none，其余字段不校验） | 已分叉（安全审计 F-01 记录） |
| 13 | 桥接 wire（v1：5 op、16 KiB、2000 字符、25s） | `docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md`（设计稿；含 TTS/ASR/audit 建议） | `index.js:187-256` 实际 5 op；无 hello/能力协商/schema 版本 | 手写测试 + 文档；无共享 schema |
| 14 | 主题/外观变量 | `--famling-content-*`（content-library `applyAppearance`） | `--dsh-famling-*`（`client.js` THEMES/BACKGROUNDS/FONTS） | 文档映射表（CONTENT-MARKET §3.6）；无生成 |
| 15 | 版本轴（见 §2.4） | 多个 schema 常量 | 多个 schema 常量 + semver 0.10.0 | 无 LOCK/兼容矩阵 |

### 2.4 版本轴现状（回答“这次改动要不要同步”目前只能靠人）

| 轴 | 当前位置 | 出处 | 兼容规则 |
|---|---|---|---|
| 独立 app 版本 | `0.1.0`（Tauri/package/Cargo 同步） | `DG/package.json`、`tauri.conf.json:4`、`scripts/check-version.mjs:1-25` | 仅仓内镜像；无跨产品含义 |
| 插件版本 | `0.10.0` | `DF/package.json:3` | 与 app 版本无映射 |
| FCI 角色接口 | apiVersion **0.1**（出厂包）与 **0.3**（tinglan 概念包）；`character-0.3.schema.json` | `public/characters/*/character.json`；`content/schema/**` | 旧包仍支持；无 sunset 计划 |
| 动画包格式 | `formatVersion: 1` | `public/assets/pet/anim/*/manifest.json` | 生成器/插件消费 |
| regions | `version: 1` | `public/characters/*/regions.json` | 插件 `loadRegionConfig` 校验 |
| 内置内容目录 | `famling.content/0.2`（v1 deprecated 适配） | `content-library.ts:72-90`；`library.json:2` | 两产品“名义共用”，实际仅 famling 解析 |
| 内容包 | `famling.content-pack/0.2`（v1 适配） / 插件 `schemaVersion 3` | `content-library.ts` / `content-extension.mjs:31-44` | **无转换器、无兼容窗口** |
| 市场目录 | `famling.market-catalog/0.1` / 插件 v3 remoteCatalog | 同上 | 无共享 schema |
| behavior profile | `famling.behavior/0.1` | `public/characters/*/behavior.json` | 仅 famling 消费 |
| bridge | `v:1` | `index.js:195` | 客户端/宿主一起改才安全 |
| DSH 兼容 | `engines.dsh: >=0.2.1-rc.5 <0.3.0` | `DF/package.json:66-67` | **DSH 不强制**（见 P1-1） |

> 结论：现在有 **11 条版本轴、4 套内容/角色相关 schema**，却没有一份 `LOCK`/兼容矩阵。ARCH 设计稿 D5（`FAMLING-DSH-ARCH-2026-11-18.md:25`）提出四轴分离，D6 提出“只同步 spec diff”，但均未落成文件；这正是 P0-1/P0-2 的根源。

### 2.5 已经正确、应保留的架构决策

1. **不合并运行时**（D1/D3）：Tauri/WebView2 与 DSH 浏览器插件在 Key、存储、更新、权限模型上不同；共享 UI 运行时代价大于收益。继续坚持“分开开发、分开发布”。
2. **DSH 侧做薄 Host adapter**（D3）：Key/模型/会话/调度/记忆交 DSH；插件只留角色/像素/气泡/桥接/同意。当前实现基本符合，方向不要动。
3. **纯数据 + fail-closed 的内容校验**：`content-library.ts` 与 `content-extension.mjs` 都不联网、不执行、不 innerHTML、限制长度/路径/CSS/原型链，这是正确且应保留的安全前庭。
4. **数据驱动动画**：96×96、12 clip、逐帧 holdMs、anchor/footBox、硬 alpha、区域/动作/台词都在数据里；这是后续第三方内容包能成立的前提。
5. **Tauri 侧 11-19 的安全收口**：23 命令 × 7 窗口 ACL + `build.rs` 命令表/Capability 漂移门禁（`build.rs:32,64,69,198,238-245`）、consent 下沉 Rust、DLC 信任根/轮换/吊销、innerHTML 注入面关闭——这些是资产，不要在重构中回退。

---

## 3. 边界与耦合评估（逐项）

### 3.1 产品边界：决策正确，执行仍停在“方案 A”

- **已决策且正确**：`FAMLING-DSH-ARCH-2026-11-18.md:21-29` 的 D1（分开开发/发布）、D2（只共享契约）、D3（插件是薄 Host adapter）、D8（产品边界：插件不宣传 roleplay/情感陪伴）与当前代码方向一致；`DF/README.md`、`DG/README.md` 首屏都有研究用途限制。
- **未落地**：D2/D4/D5/D6/D7 需要的工件一个都不存在——`spec/` 不存在、无 `LOCK.json`、无 `HOST_BASELINE`、无四轴兼容矩阵。实际形态是“两份手写实现 + 人工拷贝”（设计稿 §1.7 自己判定的方案 A），且 §1.6 列出的漂移项（桥接文档三副本、brief 校验分叉、同意文案、帧表）在当前快照仍然存在或已扩散到内容模型。
- **边界事实已开始出错**：公开切片由 `DG/scripts/export-public-pet.mjs` 的白名单人工导出（`:1-40`），导出后没有“导出树能否构建/测试”的 CI；`FAMLING-PUBLIC-BOUNDARY-2026-11-18.md:9-14,110-115` 已在公开仓发现 849,596 B 重复资产树、`packs/` 随安装包分发、23 个 scripts 目标不存在、18-WAV 过期声明等。交接 §12 记录 2026-11-18 已执行方案 A 清理并让公开仓 CI 转绿（**本轮未联网复核**，unverified），但“人工导出”这一机制没有变。
- **判断**：产品边界维持不变；需要补的是“边界的机器可读化 + 导出后验证”，不是合并产品。

### 3.2 构建期跨仓耦合：插件发布物不能自证

这是本轮最值得单列的耦合问题。`DF/scripts/embed-anims.mjs` 是插件唯一的动画/区域数据生产者，它的默认源是两个相对路径：

~~~text
DF/scripts/embed-anims.mjs:82  DEFAULT_ASSETS_ROOT = <plugin>/../.. /desktop-games/public/assets/pet/anim
DF/scripts/embed-anims.mjs:84  DEFAULT_CHARACTERS_ROOT = <plugin>/../.. /desktop-games/public/characters
DF/scripts/embed-anims.mjs:821  if (!assetsRoot) throw new Error('animation assets not found; pass --src DIR or set FAMLING_ANIM_DIR')
~~~

而验证链是“缺源即跳过”：

~~~text
DF/scripts/verify-anims.mjs:564-566  assetsRoot = resolveAssetsRoot(...); if (!assetsRoot) warnings.push('private animation assets not found; skipped byte-level source cross-check')
DF/test/client-static.test.js:166      t.skip('private character regions are not available in this checkout')
DF/test/client-static.test.js:213      t.skip('private animation assets are not available in this checkout')
~~~

后果（直接影响发布/供应链）：
1. 公开 `dsh-famling` 仓单独 checkout 时，`npm test` 可以绿、`verify:anims` 可以绿，但**并不知道** `client.anims.*.js` 对应哪一版 famling 资产；字节级一致性没有被真正验证。
2. 发布物的 `client.js`/chunk 只能由“某个开发者本机的私有仓工作树”生成；没有 `source-sha256` 对应的外部 spec 版本，也没有可复现的源。生成头虽写了 `source-sha256`（`client.js:5-9`），但该 sha 的对象是私有目录树，外部无法根据它取到同一份资产。
3. 插件目录**不是 git 仓**、没有 CI；版本 0.10.0 与生成数据的对应关系没有标签可追溯。这与“插件是 DSH 生态分发包”的定位不匹配。

**补充事实**：本机 `embed-anims --check` / `verify-anims` / 76 项测试**全部通过**（附录 A），说明当前私有工作树与插件嵌入数据是同步的；问题不是“现在不同步”，而是“同步关系不可验证、不可复现”。

### 3.3 内容契约：两套 schema 可以独立，但共享语义必须单源

`CONTENT-MARKET-2026-11-19.md:204-226` 明确决策“两套契约保持独立，统一需 MAJOR + 双读迁移”。**这个决策本身可以接受**（两端运行时/UI/存储不同，强行统一 schema 成本高）。真正的问题是：**被两套 schema 共同表达的“语义”没有单一权威定义**，于是同 id 不同值：

| 语义项 | famling（`public/content/library.json`） | dsh-famling（`client.js` ROLE_BUNDLES） | 有无一致性测试 |
|---|---|---|---|
| 猫的默认对话 | `dialoguePackId: standard`（`:62`） | `dialogue: brief`（`:131`） | 无 |
| 猫的默认外观 | `theme=night / background=dark / font=serif`（`:65-68`） | `paper / paper / serif`（`:131`） | 无 |
| 狗的默认外观 | `paper / paper / system`（`:108-111`） | `night / dark / mono`（`:133`） | 无 |
| standard 语义 | bubbleChance 0.7 / maxChars 240（`:296`） | bubbleChance 1 / maxChars 0（`:79`） | 无 |
| brief 语义 | 0.4 / 80（`:306`） | 1 / 90（`:80`） | 无 |
| quiet 语义 | 0.05 / 50（`:316`） | 0.35 / 0（`:81`） | 无 |
| origami | rolePresets 中存在，可应用（`library.json:145+`） | `available:false`，不出卡片（`client.js:135`） | 无 |
| 用途声明文本 | canonical statement + statementRef + 6 tokens（`content-library.ts:148-176`） | 只有 `researchOnly + 6 tokens`；canonical 短句在 README/DETAIL，不在代码 | 无 |
| 事件→clip | `behavior.json` 的 slots（`feed: play`） | `EVENT_CLIPS`（`feed: stand_wag`） | 无 |
| 同意文本 | 版本化 canon + hash（`terms.ts:80-84`） | 自写两段文案 + 布尔（`client.js:358-359,408`） | 无 |

补充证据：
- `DG/public/content/README.md:1-10` 明确声称“famling 与 dsh-famling **共用这一份目录与选择语义**”，但插件从未读取 `library.json`（`grep library.json` 在 `DF/` 无源消费）。
- 用途声明的 6 个 token 在代码里至少 5 处复制：`content-library.ts`、`content-hub.ts`、`content-extension.mjs`、`client.js`、`client.content.js`；`grep emotional-companionship` 命中 src 4 文件 + public 2 文件 + 插件 5 文件。
- 两个内容包 schema 的**结构不可互读**：famling v0.2 的 roleTheme 用 `characterId/voiceId/dialoguePackId/appearance{themeId,backgroundId,fontId}`；插件 v3 的 role 用 `apply{character,voicePolicy,dialogue,theme,background,font}`。所谓“角色=主题”是同一个产品概念、两套序列化。
- 两端的“内容校验器”各自 4,568 行 TS / 706 行 JS，无法互相作为对方的测试预言（oracle）。

**判断**：这不是“schema 不统一”的问题（那可以慢慢统一），而是“同一语义没有唯一事实源”的问题；只要第三方内容包/远程市场开始出现，用户会在两个产品里看到同一角色不同的默认外观/对话节奏，且作者不知道按哪套值写包。**这是 P0。** 插件侧 `DF/docs/DETAIL.md:135` 也自述“未来通过适配层把共享目录投影为插件 entry，不直接加载共享 pack”——说明方向（适配层）已有共识，缺的是 spec/生成器/一致性测试这些执行工件。

### 3.4 模块分层与单体化

**好的部分**：`src/**` 模块图的实测结果（脚本见附录 A）：176 个 TS 文件、52,824 行；`src/pet` 91 文件、40,806 行；pet 内部 253 条边、**0 环**。核心纯函数层（`content-library.ts`、`kernel/**`、`security/**`、`anim/**`）与 UI/宿主层大体可分；这是能渐进重构的前提。

**结构性问题**：

| 位置 | 事实 | 影响 |
|---|---|---|
| `src/pet/main.ts` | 3,551 行；直接 import 47 个模块（`topFanOut[0]`），覆盖 kernel/voice/consent/content/hero/advisers/DOM | composition root 承担了业务编排；任何跨 feature 改动都碰它，也是并行 agent 冲突中心 |
| `content-library.ts` + `content-hub.ts` + `content-assets.ts` | 4,568 + 2,314 + 1,270 = 8,152 行，占 pet 的 20% | 数据模型、UI 控制器、IndexedDB 存储共享一个 content 命名空间；三者边界（pure/UI/IO）在文件层清楚，在调用层靠 `main.ts` 混合 |
| `desktop-shell.ts` / `hero-runtime.ts` / `hero.ts` / `scene/**` / `render/**` | 5 套概念同时存在（FCI、anim pack、hero pack、scene behavior、render registry） | 新角色/新动作要同时改多处；插件只消费 anim+regions，进一步证明存在“不必要地多的中间层” |
| `src/voice` → `src/pet/security` | `src/voice/service.ts:11`、`src/voice/types.ts:1` 反向 import `../pet/security/rate-limit.ts` | 分层方向被破坏：安全基元住在 pet 下，voice 基础层反依赖上层；未来抽共享包时会遇到循环 |
| 动画/角色管线 | 出厂包 `apiVersion=0.1`（dog/cat/human 动画包）、`apiVersion=0.3`（tinglan 概念包）、legacy `tinglan-256`（`hero-runtime.ts:134`）、`behavior.json`（famling.behavior/0.1）、`regions.json`（v1）、anim `formatVersion=1` 同时存在 | 没有“哪个文件对哪个字段权威”的声明；市场/第三方角色会迷路；测试面铺得很大 |
| 宿主层 | `app/electron/**`（6 文件）仍保留，`package.json:27-28,55` 仍有 electron 脚本与 devDependency 45.3.0；实际发布走 Tauri | 双宿主的技术债与安装体积/CI 成本；文档已选 Tauri（P1/P2 报告测量 394MB vs ~9.4MB 安装包） |

**并行协作证据**：本轮 `git status` 的 18 项改动中，`main.ts`、`desktop-shell.ts`、`content-hub.ts`、`content-library.ts`、`pet.html`、`pet.css`、`tests/content-hub.test.ts`、`public/content/**` 同时被多任务触碰；`tsc` 红、内容测试 1 红。没有按 feature 的写隔离，也没有 pre-commit/CI 门禁。这不是“某个 agent 的失误”，是仓库结构让多任务必然互相踩。

### 3.5 DSH 宿主耦合

**可用性现状**：插件 Host half 使用 DSH 公开/一方的 `ctx.connection.fetch.register` 注册 `/api/famling/bridge`（`index.js:264-271`），浏览器侧经同源 Cookie 访问；`ctx.llm.stream`（`:165-178`）与 `ctx.schedule.create/edit`（`:227-232,213`）都是 DSH 文档化服务；client 侧通过 `window.__ModuleLoader__.load` + `require.async` + `ctx.slots.inject('sidebar.footer.action')` 接入，slot 声明在 `DSH/packages/client/ui-sidebar/src/client/contract/slots.ts:75`。这些不是野路子。

**结构性问题**：
1. **硬依赖三服务**：`export const inject = ['connection','llm','schedule']`（`index.js:12`）。任何一个服务在某个 profile/未来版本缺失，整个插件不会激活（corDIs 会 PENDING），用户看到的是“宠物消失”，而不是降级。当前 `web-app` bundle 恰好带 schedule（`DSH/packages/bundle/web-app/package.json` 含 `@deepseek-ai/dsh-schedule`），所以今天不出事；但这是部署耦合，不是契约。
2. **无能力协商/hello**：`ARCH D4` 建议的 `HOST_BASELINE`/probe 没有实现（`grep HOST_BASELINE DF/` 无命中）；bridge 只有 `v:1` 五个 op，没有 `hello`/capabilities/降级声明。新增能力（TTS/ASR/记忆/session）无法灰度。
3. **`engines.dsh` 是装饰**：`DF/package.json:66-67` 声明 `>=0.2.1-rc.5 <0.3.0`，但 DSH 自己的文档写得很清楚：“Current installers and loaders do not enforce `dsh.manifestVersion` or `engines.dsh`”（`DSH/packages/util/package-manifest/README.md:96`）。因此 DSH 0.3 的不兼容不会有安装期拦截，只会在运行时炸。
4. **没有单文件 host adapter**：Host 调用分散在 `index.js`（`readFile`、`connection.fetch`、`llm`、`schedule`、`agentDefaultModel`）与 `client.js`（module loader、localStorage、speechSynthesis、SpeechRecognition）；ARCH D4 的“所有 DSH API 收进 `DF/src/host/dsh.js`”未落地。升级时无法只改一处。
5. **手写客户端 bundle 无构建/类型检查**：`client.js` 手写 1,037 行 + 生成块，直接依赖 `__ModuleLoader__` 协议与字符串 `require.async`；`node --check` 只证明语法。DSH 侧协议虽有一方文档（`packages/client/modules/README.md` 明确 package-local chunk 与 `require.async`），但这是**宿主内部实现约定**，不是 semver 承诺的插件 API。

**判断**：当前插件能工作且有 76 项 fake-host 测试（`test/host-bridge.test.js` 覆盖 persona/model/TTL/task 等）。风险在 DSH 0.3 与不同 profile：需要适配层 + 探测 + 明确降级策略，属于 P1（不是 P0，因为当前 release 目标绑定 0.2.2-rc.4）。

### 3.6 Tauri 宿主与安全边界

**做得好的（应保留）**：
- **命令 ACL**：`build.rs:32` 的 `COMMANDS` 与 `main.rs:1065` 的 `generate_handler![...]` 双向比对（`:238-245` 漂移即构建失败）；7 个 capability 按窗口拆，`PET_ONLY_COMMANDS` 只允许 `pet-shell` 授予（`build.rs:64,69`）；`RESOLUTION-TAURI-ACL-2026-11-19.md:107-128` 记录 23 命令 × 7 窗口矩阵与运行时 141 项断言。
- **consent 下沉**：`RESOLUTION-CONSENT-GATE-2026-11-19.md:7,17` 记录 TOS/DLC/TTS/ASR 门进 Rust IPC，`voice_synthesize`/`voice_asr`/brief/DLC 均需 `pet` 窗口 + TOS；游戏/bench 窗口拒绝。
- **DLC 信任机制**：`native/dlc-verify/src/lib.rs:20-24` 编译期嵌入公钥信任根，`:305-340` 校验 + dev override 仅 debug/gated；keyId/轮换/吊销/发布门禁（`RESOLUTION-DLC-SIGNING-2026-11-19.md`）。

**仍未闭环的结构性问题**：
1. **生产信任根 ceremony**：发布门禁当前**预期 fail-closed**，剩余 B1（生产 Ed25519 密钥 ceremony）、B3（tauri.conf resources 去 packs/keys）、B5（重签 packs）（`RESOLUTION-DLC-SIGNING-2026-11-19.md:24-26,612-620`）。这不是代码 bug，是“发布架构缺 owner/时间点”。
2. **同源页面共享 storage**：Tauri 应用的 `main`/pet/games/bench 都是同一 WebView2 数据目录、同一 origin（`tauri.conf.json` 单 app、单前端 dist）。命令级 ACL 管得住 IPC，但**管不住页面里直接 `localStorage`/IndexedDB 读彼此数据**；安全审计 P1-2 已把“所有窗口/页面同源共享 localStorage”列为问题（`FAMLING-SECURITY-AUDIT-2026-11-18.md:75-96`），ACL 修复没有覆盖这一半。宠物同意/隐私数据与游戏存档/导入摘要共处一个 storage，边界只在代码约定里。
3. **无 updater / 无 Authenticode**：`RESOLUTION-AUTHENTICODE-2026-11-19.md` 结论是工程侧已落地、被证书阻塞；安全审计 P2-7 指出无 updater（无更新攻击面，也无补丁通道）。对“远程内容市场”来说，宿主签名与更新通道是前置信任。
4. **产品元数据仍是旧身份**：`tauri.conf.json:3-5` = `DesktopGames` / `0.1.0` / `com.perrylink.desktopgames`；`package.json` = `desktop-games-p0`；公开产品是 Famling。元数据不是“改个名”这么简单：安装目录、AppData 路径、升级/卸载识别、SmartScreen 声誉、市场收录都绑定它。

### 3.7 远程市场/安装器：能力已半建，系统设计未建

| 能力 | famling | dsh-famling |
|---|---|---|
| 本地包导入 | **有**：`.json/.zip/文件夹`，bounded read + CRC + `validatePackZip` + 逐文件 sha256 + 解压总量/压缩比限制（`content-hub.ts:633,779-802,943+`；`content-assets.ts` IndexedDB 存储；`main.ts:1279-1290` 提交） | **无**：内容包 tab 只展示声明检查，导入按钮文案“需 Host 支持”（`client.content.js` packs 段） |
| pack 格式 | `famling.content-pack/0.2`：roleThemes + components + files+sha256 + zip inventory + usageDeclaration + license + aiProvenance + compatibility | `content-extension.mjs` v3：7 kinds + assets 元数据（path/sha256/bytes）+ usageDeclaration；**不读取、不打开、不执行**（`content-extension.mjs:31-44`） |
| 远程目录 | `famling.market-catalog/0.1` + Ed25519 验签契约（注入 verifier + trust root，active/retired/revoked + notBefore/notAfter），fail-closed（`content-library.ts:642+`） | `remoteCatalog` 仅元数据；`allowRemote` 默认 false；市场页固定“服务器未配置”（`client.content.js` market 段） |
| 安装器 | UI 侧已能导入并写入 IndexedDB，但**无独立安装器组件/无卸载/无更新/无版本迁移执行器**；远程流程只在文档里（CONTENT-MARKET §10.3 描述 catalog→确认→下载→验签→解压→merge 的步骤，未实现） | 无 |
| 信任根/密钥管理 | 仅有验签函数注入点；生产 trust root/key ceremony 未做 | 无 |

**架构判断**：市场不是“再做两个 UI”的问题，而是需要决定**安装器住在哪一侧、以什么协议与信任根工作**。当前两条线各自有半套（famling 的纯函数+资产存储、插件的纯校验），如果继续各写一套，会得到两个互不兼容的市场。建议 P1 单独立项出“市场/安装器协议 + 信任根 + 更新/回滚 + 卸载”设计，再实现；远程联网必须排在 P0-3 之后。

### 3.8 发布、版本、CI

| 环节 | 现状 | 证据 |
|---|---|---|
| famling 私仓 | 无 git remote；CI workflow 存在但“加 remote 前不运行” | `git remote -v` 空；`.github/workflows/ci.yml:3-6` |
| 公开 famling | 由 `scripts/export-public-pet.mjs` 白名单人工导出；导出树不含 tests/scripts 的大部分 | `export-public-pet.mjs:1-40`；边界审计 §0/§5 |
| 插件仓库 | 本地目录无 `.git`；无 workflow；发版靠拷贝 | 本机 `git status` fatal；`ls DF/.github` 不存在 |
| 版本一致性 | `check-version.mjs` 只校 app 内部 5 处镜像（package/lock/tauri.conf/Cargo.toml/Cargo.lock）；不含插件/公开仓/内容 schema | `check-version.mjs:1-25` |
| 跨产品兼容 | 无矩阵、无 lock、无 “famling 0.x ↔ plugin 0.y ↔ content 0.z” 表 | §2.4 |
| 发布信任 | DLC gate fail-closed；Authenticode 缺证书；无 updater | RESOLUTION-DLC / RESOLUTION-AUTHENTICODE |

**判断**：这是 P0-2/P0-3 的根源，也是“为什么架构评审必须先做契约工件”的理由——只要发布不可复现，任何架构改进都无法被验证和交付。

### 3.9 扩展点评估

| 扩展点 | 现状 | 评价 | 建议 |
|---|---|---|---|
| 动画包（manifest + 帧） | 数据完整、逐帧时长、契约有生成器/测试 | **好**：可第三方化 | 固定 `formatVersion` + 包清单 sha；进入 spec |
| 区域/动作/台词（regions.json） | 数据驱动、含 says/actions/gestures，插件与 famling 共用文件 | **好** | 把 `event→clip` 映射也放进数据（或从 behavior.slots 生成） |
| 行为（behavior.json） | 状态机/slots/rules 在 famling 侧；插件不复用 | 中：能力最强但只有一端消费 | 至少把 `slots` 作为动画选择权威，插件生成 EVENT_CLIPS |
| 内容目录（library.json） | v2 角色主题模型完整，纯函数解析，有导入/市场契约 | **好，但只有一端消费** | 插件改读（或生成）同一目录；这就是 P0-1 |
| 内容包（v0.2 / v3） | 两端都 fail-closed、纯数据；语义/结构不同 | 中：安全设计好，互操作性差 | 双 schema + 一份共享语义 fixture/转换器 |
| 远程市场 | 只有契约与 UI 占位 | 差：未到可实现状态 | 先出协议/信任根/安装器设计，P0-3 后再做 |
| DSH 宿主能力 | 硬 inject、5 op、无 hello | 中 | 适配层 + 探测 + 版本化 wire |
| Tauri 命令面 | 23 命令、ACL 矩阵、构建期漂移门禁 | **好** | 保持；后续命令新增必须走同一门禁 |

---

## 4. P0 问题（进入下一轮内容/市场/发布前必须解决）

### P0-1 共享内容语义没有单一权威源，已经漂移

**问题陈述**：两个产品对“角色=主题”的角色 bundle、对话包语义、用途声明、动画事件映射、同意文本各自维护一份；同 id 已不同值，且没有任何测试或文档判定权威。

**证据**：§3.3 表；`DG/public/content/library.json:59-111,290-320` vs `DF/client.js:76-82,129-136`；`DG/src/pet/content-library.ts:1-55,72-90` vs `DF/content-extension.mjs:31-44,50,140-150`；`DG/public/content/README.md:1-10` 的“共用”声明；`CONTENT-MARKET-2026-11-19.md:204-226` 的“两套独立”决策。

**影响**：
- 第三方内容包/角色主题一旦出现，同一包在两产品表现不同（外观/对话频率/语音策略/事件动画），作者无法写出“两端都对”的包。
- 每次内容/主题/市场迭代都要改两套常量与两套测试，返工成本随内容数量线性增长。
- 法务声明文本的 canonical 短句只有一端在代码中强制；另一端靠 README 抄写，升版时必漂移。

**建议（分两步，先低成本后工件）**：
1. **先裁定（0.5–1 人日）**：写 `DG/docs/contracts/SHARED-SEMANTICS.md`（或并入现有 CONTENT-MARKET 附录），逐项给 15 个共享面标：权威端、当前值、允许差异、验证方式。先把两个角色 bundle 表对齐或明确“产品差异是故意的”，并给理由。
2. **再落工件（2–3 人日）**：新增版本化 `spec/`（可先放 `DG/spec/face/0.1/`）：
   - `catalog.json`：内置角色主题 + 对话语义 + 声音策略 + character id 映射 + 用途声明 canonical 文本；
   - `assets.json`：三套动画 manifest 的逐文件名/sha256/帧数清单 + regions sha；
   - `schema/*.schema.json`；`LOCK.json`（生成时间、源 commit、sha）。
   - 生成器 `scripts/gen-face-spec.mjs`：从 famling 数据生成 spec；双端 CI 用同一 spec 做 conformance（famling 读 `library.json` 与 spec 比对；插件由 spec 生成 `ROLE_BUNDLES`/`EVENT_CLIPS`/声明常量，而不是手写）。
3. **规则**：spec 的 MAJOR/MINOR 语义与“哪些变更需要两产品同步”写成文档；`CONTENT-MARKET` §3.7 的“双 schema 独立”保留，但共享语义必须来自 spec。

**收益**：消除 5 处声明文本复制、2 处 role bundle 手写、1 处 event→clip 手写；第三方包首次具备“两端一致”的可测试定义；后续内容中心/市场迭代单点改动。
**成本**：0.5–1 人日裁定 + 2–3 人日 spec/生成器/一致性测试；改动集中在 docs/spec + 生成脚本 + 双端消费点，不动运行时架构。
**风险**：中低。主要风险是把“产品有意差异”误判为漂移（先裁定可避免）；spec 与现有 schema 概念重叠需命名清晰（建议 spec 只放共享语义，不重复两端完整 schema）。
**是否值得重构**：**值得，且应最先做**。这是后续所有内容/市场工作的前置。
**验收**：① 任取一个角色 id，双端读到同一 bundle 值（或文档声明差异且有测试固定）；② 新加一个对话包/声明字段只改 spec + 生成，不改两端手写常量；③ CI/本地命令能对“spec 与实现不一致”报错。

### P0-2 dsh-famling 构建/发布不可自证（跨私有仓隐式依赖 + 无 git/CI）

**问题陈述**：插件的嵌入数据（208 帧动画、regions、声明常量）由私有 famling 工作树生成；插件仓自身没有 git、CI、LOCK，公开仓单独 checkout 无法证明发布物对应哪份资产。

**证据**：§3.2 三段代码；`DF/` 无 `.git`/无 workflow（本机实测）；`DG/` 无 remote、CI 不运行（`.github/workflows/ci.yml:3-6`）；`ARCH §1.4 G7` 已记“无 git/CI，靠拷贝同步”；本机 `embed-anims --check` 通过只能证明“当前机器上同步”。

**影响**：
- 发布不可复现/不可审计：用户或审计者无法从插件仓重建 `client.js`；供应链上“我装的这个插件里到底是什么动画/台词”没有可核对来源。
- 升级 famling 资产时，插件是否同步只能靠人跑脚本；一旦忘记，`verify-anims` 在 CI（不存在）或发布前也没有硬门禁。
- 公开仓与私有源之间没有版本映射，`source-sha256` 对第三方无意义。

**建议（推荐 B，A 为过渡）**：
- **A（过渡，1 天）**：在插件仓 vendored `spec/`（P0-1 产物）+ `LOCK.json`；`embed-anims --check` 只读 spec 与 vendored bytes，不读私有仓；缺 spec 直接 fail（不是 skip）。
- **B（目标，1.5–3 天）**：把 spec 发布为独立版本化产物（npm 包或 tarball，含 `assets.json` 清单与逐文件 sha，可选含压缩后的帧）；插件 `package.json` 依赖该 spec 版本，`embed-anims` 从 spec/依赖读源；CI 在**只有公开仓 + 依赖**的环境跑 `embed:anims --check`、`verify:anims`、`node --test`。
- 同时：插件目录 `git init` + 接入公开仓；加 `.github/workflows/ci.yml`（node 24，跑 test/check/verify + `npm pack --dry-run`）；发布用 tag + 生成 `sourceSha`/`specVersion` 写入 README/CHANGELOG。

**收益**：插件可独立构建/发布/审计；减少“人肉同步”这一最大隐性成本；CI 可挡 stale 数据。
**成本**：1–3 人日（取决于 spec 是否已存在；依赖 P0-1）。
**风险**：中。公开 spec 会暴露资产清单（帧 sha/尺寸/台词）；若授权/边界不允许公开，可只公开 sha 清单 + 内部发布 spec 到私有 registry——需要用户/法务拍板（未决问题 Q2）。
**是否值得重构**：**值得，第二优先**。
**验收**：① 在一台没有 `desktop-games` 工作树的机器/容器里，从插件仓 checkout 能跑绿 test/check/verify；② `npm pack` 产物含 LOCK/spec 版本；③ 改一帧动画但不重跑生成 → CI 红；④ 插件 git 历史与 tag 可追溯。

### P0-3 发布信任与版本身份未闭环

**问题陈述**：DLC 生产信任根/重签、Authenticode、updater、产品身份四件事没有统一的发布架构与 owner；当前发布门禁是**故意失败**的 fail-closed 状态，而对外文档/市场叙事需要“signed/可发布”之前先把这些完成。

**证据**：`RESOLUTION-DLC-SIGNING-2026-11-19.md:24-26,457,612-620`（B1/B3/B5 未完成，gate 预期 FAIL）；`RESOLUTION-AUTHENTICODE-2026-11-19.md`（工程侧完成、证书阻塞，产物 `NotSigned`）；`tauri.conf.json:3-5`（DesktopGames/0.1.0/旧 identifier）；安全审计 P2-7（无 updater）。

**影响**：
- 用户侧：SmartScreen 拦截、无补丁通道、安装包/EXE 不可信；一旦要做“内容市场”，宿主与内容都缺少可验证身份。
- 运营侧：无法对外承诺“已签名发布”；版本号/产品名在安装目录、AppData、升级识别、市场收录上不一致，后期改名成本更高。
- 研发侧：发布流程仍依赖人工 ceremony，无法在 CI 中闭环验证“发布物 = 源码”。

**建议**：单独立项“Release Architecture v1”，把五件事写进一张表并绑定 owner/日期：① 产品身份（productName/identifier/版本策略）；② DLC 生产密钥 ceremony + packs 重签；③ Authenticode 证书与签名流水线；④ updater 设计（签名 manifest、回滚、离线）；⑤ 发布门禁与“signed 版本才允许写 signed 宣称”的检查。工程侧可先做①⑤与 updater 设计（3–5 人日），②③依赖外部。

**收益**：发布可被信任/可被审计；市场与更新通道有信任根；避免改名/换 identifier 的未来迁移成本。
**成本**：工程 3–5 人日；外部证书/密钥 ceremony 由 owner 决策，时间不可控。
**风险**：高（外部依赖）；但如果推迟，内容市场/公开分发都无法启动。
**是否值得重构**：**必须做，但应先拍板外部项**；不属于“代码重构”，属于发布架构收口。
**验收**：`verify-dlc-trust` 在真实发布树 exit 0；`Get-AuthenticodeSignature` = Valid；updater 有签名/回滚测试；产品名/identifier/版本在安装包、AppData、关于页、市场元数据一致。

---

## 5. P1 问题（1–2 个迭代内处理）

### P1-1 DSH 宿主适配层/能力协商缺失，`engines.dsh` 不被宿主强制

**现状/证据**：`index.js:12` 硬 `inject=['connection','llm','schedule']`；`index.js:264-271` 只有一条 fetch route；bridge 仅 `v:1` 5 op（`:195-197`），无 `hello`/capabilities；`DF/package.json:51-67` 的 `dsh.manifestVersion`/`engines.dsh` 只声明；DSH 自述不强制（`DSH/packages/util/package-manifest/README.md:96`）；`ARCH D4` 的 `HOST_BASELINE`/probe 未实现（grep 无命中）。客户端的 `__ModuleLoader__`/`require.async` 是宿主打包格式（`DSH/packages/client/modules/README.md` §package-local chunks），不是 semver 契约。
**影响**：DSH 0.3 / 非 web-app profile / 缺 schedule 的环境下，插件可能整只不出现或运行时失败，且没有降级/自检路径；升级 DSH 后“宠物消失”会再次像安装态丢失一样难排查。
**建议**：① 建 `DF/src/host/`（或单文件 `host.js`）收拢所有 DSH/浏览器宿主调用；② 用 `ctx.inject([...], cb)` 把 `llm`/`schedule` 改可选，缺能力时插件仍加载并在 UI 明确“未连接模型/提醒不可用”；③ bridge 加 `op:'hello'` 返回 `{pluginVersion, wireVersion, capabilities, host:{dshVersion}}`；④ 加 `scripts/check-host.mjs` 在 CI 里校验声明的能力/版本（因为宿主不查）；⑤ 维护 `HOST_BASELINE` 文档 + 录音式 fixture。
**收益**：DSH 升级只改一个适配文件；缺能力可降级；安装后能自检。**成本**：2–3 人日。**风险**：低（改动局限宿主半 + 客户端调用点）。**值得**：是。**验收**：在缺 `llm` 的 fake context 下插件仍激活并有 UI 提示；`hello` 在真实 DSH 返回能力/版本；`engines.dsh` 越界时本地检查红。

### P1-2 远程市场/安装器缺系统设计，两产品能力不对称

**现状/证据**：§3.7 表。famling 已有本地导入/zip 校验/IndexedDB 存储/远程验签纯函数，但无独立安装器、无卸载/更新/迁移执行器；插件只有 v3 纯校验与 UI 占位（`client.content.js` packs/market 段），不能导入本地包。两端 pack 结构不可互读（`content-library.ts` v0.2 vs `content-extension.mjs` v3），市场目录 schema 只有 famling 一侧（`famling.market-catalog/0.1`）。
**影响**：如果分别实现，会出现两个互不兼容的“内容市场”；第三方作者要发两份包；用户无法把同一角色/主题在插件与 app 间迁移。安全上，安装器是新的攻击面（解压/路径/内存/供应链），必须一次设计对。
**建议**：① 先写设计文档 `docs/design/CONTENT-INSTALLER-PROTOCOL-*.md`：定义 pack 传输 schema（建议以 famling v0.2 为基线，插件 v3 作为 apply 子集/超集映射）、catalog/签名/信任根、下载缓存、安装/卸载/回滚、离线模式、同意门、失败原子性；② 决定安装器归属：推荐“纯校验器 + 宿主侧安装器”——famling 用 TS/Rust 宿主实现，插件用 DSH Host route 实现，共用同一份 spec/测试向量；③ 插件优先补“本地包导入（Host 解析 + 校验 + 存储）”，与 famling 对齐；④ 远程联网排 P0-3 之后。
**收益**：一份协议两端可移植；避免二次实现与安全分叉。**成本**：设计 2–3 人日；实现 5–10 人日（分两期）。**风险**：中（安全/法务/资产授权）。**值得**：是，但排在 P0-1/P0-2 后。**验收**：同一 `.zip` 包在两个产品通过同一校验向量；安装失败不改现有状态；卸载可逆；离线可用。

### P1-3 Pet Brief / bridge / 同意语义双实现

**现状/证据**：`DG/src/presence/pet-brief.ts` 是严格 consumer（closed schema/TTL/claims/displayPolicy/隐私面板），插件 `index.js:101-156` 是简化投影（TTL + counts + displayPolicy none；未知字段不拒绝、无 claims）；安全审计 `DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md` F-01 已记录并修复了部分（TTL/displayPolicy/counts），但两份实现仍会继续漂移。bridge 设计稿（`docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md`）列了 TTS/ASR/audit/session 等扩展，实际只有 5 op；同意文本一端版本化+hash（`terms.ts:80-84`），一端裸布尔（`client.js:408`）。
**影响**：隐私/合规口径不一致（同一 TTS 同意在两产品不等价）；新增字段/行为要改两处；审计与用户撤回路径无法统一。
**建议**：① 把 Pet Brief 校验 + projection 规则做成 spec 里的纯数据 fixture（输入 JSON → 允许投影字段），两端各自实现但跑同一组 conformance；② bridge wire 定 schema（JSON Schema + 错误码表）并纳入 spec；③ 同意文本由 spec 提供 canonical 文本 + 版本 + hash，插件持久化从 bool 升级为 `{version,hash,acceptedAt}`；④ 插件补 `device`/`withdraw` 路径（至少清 TTS/ASR 状态）。
**收益**：隐私/合规行为可验证；升级文本可强制重申。**成本**：2–3 人日。**风险**：低–中（旧 localStorage 迁移）。**值得**：是。**验收**：同一 fixture 两端结果一致；文本版本变更后旧同意失效并重弹；撤回后不再调用 speechSynthesis。

### P1-4 单体化与并行协作冲突

**现状/证据**：`main.ts` 3,551 行/47 直接依赖；`content-library.ts` 4,568、`content-hub.ts` 2,314、`content-assets.ts` 1,270；评审期间 21 个未提交改动跨 10+ 文件，内容子集/`tsc` 曾红、后由 task-54 修绿但仍未提交（§1.3）——中间态无门禁记录。`src/voice` 反向依赖 `src/pet/security`（`src/voice/service.ts:11`、`src/voice/types.ts:1`）。
**影响**：任何内容/主题改动都触碰 `main.ts`/`content-hub.ts`/测试三处；多 agent/多人并行时冲突概率高；重构与功能开发互相阻塞；`voice` 反依赖会让未来抽共享包出现循环。
**建议**：① 以“可独立测试的 feature 模块”拆 `main.ts`：建议 `pet/app/bootstrap.ts`（装配）、`pet/features/voice`、`pet/features/consent`、`pet/features/content`、`pet/features/hero`、`pet/features/advisers`，每块暴露窄接口，composition root 只做 wiring；② `content` 拆为 `content/model`（纯）、`content/ui`、`content/store`（IO）；③ 把 `security/*` 抽到 `src/security/`（或 `src/shared/security`）并加依赖方向测试（可用 30 行脚本断言 allowed edges）；④ 每模块有 owner/写范围，配合 git 分支而不是所有人写同树。
**收益**：并行冲突显著下降；测试面可按 feature 切分；为 spec 化/市场铺路。**成本**：5–8 人日（渐进，不一次性大爆炸）。**风险**：中（拆分期间回归）；建议“先加测试再搬代码”，每次只搬一个 feature。**值得**：是，但排在 P0-1/P0-2 之后。**验收**：`main.ts` < 800 行；每个 feature 可单测；依赖方向测试通过；连续两轮并行改动不再互相 red。

### P1-5 角色/动画多管线与遗留资产/遗留宿主

**现状/证据**：同时存在 FCI `character.json`（apiVersion 0.1 与 0.3）、anim manifest（formatVersion 1）、`behavior.json`（famling.behavior/0.1）、`regions.json`（v1）、hero pack（`hero.ts`）、legacy `tinglan-256`（`hero-runtime.ts:134`，49 PNG）与 `humanoid-default` 占位包；`public/characters` 下 6 个角色目录。Electron 宿主仍保留（`app/electron/**`、`package.json:27-28,55`）。
**影响**：新角色/第三方角色要同时满足多套未声明的格式；legacy 包（tinglan-256）与动画占位包容易混淆来源；Electron 保留增加依赖/安全/CI 面（electron 45.3.0 devDependency、镜像/证书）。游戏与 pet 共用一个构建也增加发布页收口难度。
**建议**：① 写 `CHARACTER-PIPELINE.md`：声明**已发布 hero 角色以 anim pack + regions + behavior 为权威**；FCI 0.3 作为外部/自定义角色接口；`character.json` 中 `packBase/behaviorFile` 为指针，不作为独立事实源；② 冻结 `tinglan-256`/`humanoid-default`/`pearl-placeholder` 为 legacy，移出发布构建与公开导出；③ 插件侧 `EVENT_CLIPS` 改为由 behavior.slots 生成（合并进 P0-1 生成器）；④ 决定 Electron 去留：归档 `app/electron/**` + 移除 electron devDependency，或明确标注“仅历史对照，不参与构建/发布”；⑤ 游戏页面与 pet 页面的发布构建分开（Vite multi-entry 保留开发，发布 profile 只导需要页面）。
**收益**：角色管线单源、降低发布面、减少依赖。**成本**：2–4 人日。**风险**：低–中（legacy 引用可能藏在文档/脚本）。**值得**：是。**验收**：新增一个角色只需新增一套 anim+behavior+regions 并在 spec 注册；`grep tinglan-256` 在发布构建/导出中为 0；Electron 脚本不在默认安装/发布路径。

### P1-6 famling 公开镜像与私仓 CI 断链

**现状/证据**：私仓无 remote（`git remote -v` 空），CI 不运行（`ci.yml:3-6` 自述）；公开仓由 `export-public-pet.mjs` 人工白名单导出（`:1-40`），导出树不含 `tests/`、大部分 `scripts/`，无法复现 `npm test/legal-check/build`；`FAMLING-PUBLIC-BOUNDARY` 审计记录公开仓 849,596 B 重复树、`packs/` 随包、23 个 scripts 目标缺失、18-WAV 过期声明、Tauri 元数据 `DesktopGames`。方案 A 清理（交接 §12，2026-11-18 10:45）已让公开仓 CI 转绿，但机制仍是人工。
**影响**：公开仓不可作为“可信发布源/契约源”；每次同步靠记忆与人工检查；内部与公开文档容易互相打脸（AI 声明、WAV、测试数）。
**建议**：① 把“导出公开切片”做成正式构建目标：`scripts/export-public-pet.mjs` 输出到临时目录后，**在导出树里跑** `tsc/vite build/（公开可用的测试子集）`，失败即导出失败；输出 `EXPORT-MANIFEST.json`（文件+sha+源 commit）；② CI 对每个私仓 push 跑导出 + 构建（需要先加 remote；若不能加 remote，至少本地 preflight 强制）；③ 公开仓 tag 与私仓 commit 记录映射（`RELEASE-SOURCES`）；④ 把“哪些文件/文档必须同步”写成清单，而不是 agent 记忆。
**收益**：公开仓可复现、可审计；减少文档/元数据漂移。**成本**：3–5 人日。**风险**：中（需要决定 remote 托管/凭据；导出树测试集裁剪）。**值得**：是。**验收**：导出命令在空目录产出可构建树；CI 红/绿可追溯；公开仓 release 能对应私仓 commit。

### P1-7 Tauri 同源页面 storage 未隔离

**现状/证据**：单 Tauri app、单前端 dist、多个窗口（main/pet/aquarium/town/stall/farm/bench）都指向同一前端资源与同一 WebView2 数据目录；ACL 只限制 IPC 命令（`build.rs`/capabilities），不限制页面 JS 直接读写 `localStorage`/IndexedDB；安全审计 P1-2 明确“所有窗口/页面同源共享 localStorage”，其 RESOLUTION 只覆盖了命令 ACL（`RESOLUTION-TAURI-ACL-2026-11-19.md`）。
**影响**：宠物 TOS/同意/隐私数据与游戏页/导入页/bench 页在同一 storage；任一页面 XSS/第三方 DLC 内容若有执行能力，理论上可读宠物状态。与产品对外“数据本地隔离/可删除”的表述不完全一致。
**建议**：① 评估 Tauri/WebView2 的每窗口独立 user-data-dir（Tauri 2 WebviewWindowBuilder 的 `data_directory`，需按本机版本核对；unverified）；② 若不能分目录，至少把 pet 私有数据加前缀/封装到 `safe-storage` 并加启动断言（非 pet 窗口不读/不写 pet 键），并把同意/审计放独立键空间；③ 在 `build.rs`/测试里加“页面→存储键”静态矩阵；④ DLC/第三方内容一律不执行脚本（已满足），降低攻击面。
**收益**：隐私边界与对外声明一致；为市场内容提供更安全的宿主。**成本**：2–4 人日（依赖 Tauri 能力核实）。**风险**：中（WebView2 数据目录切换影响现有用户数据迁移）。**值得**：是，但需先做技术验证。**验收**：非 pet 窗口无法读到 pet 同意/存档键（自动化测试）；升级不丢数据（或提供迁移）。

---

## 6. P2 问题（低成本清债/一致性）

| # | 问题 | 证据 | 建议 | 成本 |
|---|---|---|---|---|
| P2-1 | 分层反向依赖：`src/voice` 依赖 `src/pet/security` | `src/voice/service.ts:11`、`src/voice/types.ts:1` 反向 import `../pet/security/rate-limit.ts` | 把安全基元抽到 `src/security/`（或 `src/shared/security`），加 30 行依赖方向测试 | 0.5–1 人日 |
| P2-2 | 遗留 Electron 宿主仍随仓/依赖 | `DG/app/electron/**` 6 文件；`package.json:27-28,55`（electron 45.3.0 devDependency、`electron:*` 脚本）；文档已选 Tauri | 归档或删除；从默认依赖/发布/CI 移除；保留历史 tag 即可 | 0.5 人日 |
| P2-3 | 产品元数据仍是旧身份 | `tauri.conf.json:3-5,16`（DesktopGames / 0.1.0 / com.perrylink.desktopgames）；`package.json` name `desktop-games-p0`；`pet.html:10` 旧 title（边界审计 §5） | 归入 P0-3 的“产品身份”一次改；含 AppData/安装目录迁移方案 | 0.5 人日（含在 P0-3） |
| P2-4 | 文档/测试数字漂移 | 例：README/P1 报告 125 tests、交接 842、插件 README 0.10.0 数字；公开仓 18-WAV 声明（边界审计 §6）；`RESOLUTION-PLUGIN-BUNDLE` 与 README 的预算数字需同源 | 建立单一 `STATUS.md`（脚本生成）+ 文档引用它；发布前 `docs-check` 校验关键数字 | 1–2 人日 |
| P2-5 | 插件 i18n 文案内联 | `client.content.js` 内 `STRINGS` 约 100 行 zh/en；`locale/zh.json`/`en.json` 各 7 行 | 单一 locale 源（JSON/TS），UI 只查表；与 DSH locale 机制对齐 | 1 人日 |
| P2-6 | 发布页未收口 | `vite.config.ts:351-363` 9 个入口（index/presence/world/aquarium/stall/town/pet/chat-import/setup），私仓安装包全量 dist；安全审计 P2-9 记录开发/实验页随发布 | release profile 只构建 pet/legal 必需页；setup/chat-import 归入 pet 窗；bench/QA 页不随包 | 1–2 人日 |
| P2-7 | 插件客户端无类型检查/构建 | `client.js` 手写 1,037 行、`__ModuleLoader__` 字符串协议；`node --check` 只能查语法 | 加 JSDoc + `tsc --allowJs --checkJs` 或迁移到 DSH 推荐的 tsdown 构建；保留手写 loader 时至少类型化边界 | 2–3 人日 |
| P2-8 | 契约文档多副本 | `ARCH §1.6` 记录桥接文档三处副本两个内容（sha 前缀 `ba775a5d…` vs `f76205b4…`）；本地插件 docs 只有 DETAIL/LEGAL | 单源 `docs/contracts/` + 生成/同步脚本；公开仓副本由导出产生 | 1 人日 |
| P2-9 | 本地构建产物占用工作区 | `DG/app/tauri/target` 4.8 GB、`.electron-win`、`dist/`、`artifacts/`（本轮对 desktop-games 跑全仓 grep 曾因 4.8 GB target/ node_modules 超时一次） | 清理脚本 + 更强 `.gitignore`（已忽略 git，但影响 agent/CI 扫描）；CI 用干净 checkout | 0.5 人日 |
| P2-10 | 合规元数据强度两端不一致 | famling v0.2 pack 强制 `license` + `aiProvenance` + `compatibility`（`content-library.ts` §pack v2）；插件 v3 只强制 `usageDeclaration`（`content-extension.mjs:31-44`） | spec 统一“最小合规字段集”，插件 v3 补 license/aiProvenance/compatibility（或声明 v3 只收内置内容） | 1 人日 |

---

## 7. 重构路线（分阶段，收益/成本/风险）

### 7.0 原则

1. **先工件、后代码**：先把“共享语义/权限/版本/数据”写成可校验文件，再改实现；否则重构只是把漂移换个地方。
2. **先单源、后统一**：两套 schema/运行时保持（D1/D2 正确），只统一共享语义与校验向量；不要为了“干净”合并产品。
3. **每阶段可回滚**：拆模块用“搬代码 + 旧入口转发”过渡；spec 用版本化发布；发布链路改动先加门禁再切流程。
4. **不打断交付**：P0/P1 分阶段做，不与内容/动画/市场功能抢同一分支；每个阶段结束必须有可跑验收命令。

### Phase 0（0.5–1 周）— 契约裁定与恢复绿树

| 项 | 内容 |
|---|---|
| 目标 | 回答“哪些面必须一致、谁权威、当前差异是否故意”；恢复可发布基线 |
| 交付 | ① `docs/contracts/SHARED-SEMANTICS.md`（15 个共享面 × 权威端 × 当前值 × 允许差异 × 验证方式）；② 修回本轮 `tsc`/内容测试红（task-52/54 完成后即可）；③ `docs/contracts/VERSION-AXES.md`（§2.4 的 11 条轴 + 当前值 + 兼容规则）；④ 记录本轮快照与未验证项 |
| 验收 | 双端角色 bundle 差异有明确结论（一致或文档声明 + 测试固定）；主树 `tsc`/目标测试绿；lead 拍板 Q1–Q3（§9） |
| 成本/风险 | 1–2 人日；风险低（纯文档 + 小修） |

### Phase 1（1–2 周）— spec 工件化 + 插件可独立自证

| 项 | 内容 |
|---|---|
| 目标 | P0-1/P0-2 落地：共享语义有 spec，插件构建/测试不依赖私有工作树 |
| 交付 | ① `spec/face/0.1/`（catalog/assets/schema/LOCK）+ `scripts/gen-face-spec.mjs` + spec 版本规则；② 插件 vendored spec + 从 spec 生成 `ROLE_BUNDLES`/`EVENT_CLIPS`/声明常量；③ 插件 git + CI（`node --check`/test/check/verify/pack dry-run）；④ 双端 conformance 测试；⑤ famling `export-public-pet` 后置校验（最小版） |
| 验收 | 无私有仓环境插件 CI 全绿；改 spec 后双端任一未同步则测试红；`npm pack` 含 LOCK/version |
| 成本/风险 | 4–6 人日；风险中（涉及公开边界/资产授权，见 Q1/Q2） |

### Phase 2（1–2 周）— 宿主适配与内容安全语义单源

| 项 | 内容 |
|---|---|
| 目标 | P1-1/P1-3：DSH 升级/缺能力可降级；Pet Brief/bridge/同意有共享 fixture |
| 交付 | ① `DF/src/host/` 适配层 + `hello`/capabilities + `check-host.mjs`；② Pet Brief/bridge/同意文本进 spec 的 fixtures；③ 插件同意持久化带版本/hash + 撤回；④ 插件本地包导入设计评审（P1-2 设计稿） |
| 验收 | fake/真实 DSH 下缺 llm 仍激活；一致 fixture 两端结果相同；撤回后无 TTS |
| 成本/风险 | 4–6 人日；风险低–中（DSH API 变动） |

### Phase 3（2–3 周）— 模块化与发布面收口

| 项 | 内容 |
|---|---|
| 目标 | P1-4/P1-5/P1-7：主树可并行；角色管线单源；发布/存储边界清楚 |
| 交付 | ① `main.ts` 拆 feature 模块 + 依赖方向测试；② `content` 拆 model/ui/store；③ `security` 抽 shared；④ `CHARACTER-PIPELINE.md` + legacy 资产冻结 + Electron 归档；⑤ 发布 profile 页面白名单；⑥ pet 存储隔离技术验证/PoC；⑦ 产品身份改名（并入 P0-3） |
| 验收 | `main.ts` < 800 行；新增角色只动一套数据；发布 dist 无 dev 页；非 pet 窗口读不到 pet 键（或明确风险接受） |
| 成本/风险 | 8–12 人日；风险中（重构期回归，需分 feature 小步） |

### Phase 4（2–3 周 + 外部依赖）— 市场/安装器 + 发布信任闭环

| 项 | 内容 |
|---|---|
| 目标 | P0-3/P1-2：signed 发布、可更新、可安装/卸载/回滚内容；公开镜像自动化 |
| 交付 | ① DLC 生产密钥 ceremony + 重签 + gate 全绿；② Authenticode 证书与签名流水线；③ updater（签名 manifest/回滚/离线）；④ 市场/安装器协议实现（双端共用 spec/测试向量）；⑤ 公开导出 + CI 自动化；⑥ 法务/使用限制复核 |
| 验收 | `verify-dlc-trust` 与 Authenticode 全绿；同一 pack 两端可安装/卸载；发布物可从源码重建；远程市场有签名/撤销/失败回滚测试 |
| 成本/风险 | 工程 10–15 人日 + 外部证书/密钥/法务；风险高（安全/供应链），需 owner 拍板 |

### 7.5 架构级“不做”清单（同样重要）

1. **不合并 famling 与 dsh-famling 运行时**：Tauri/WebView2 与 DSH Web 的 Key/存储/更新/权限模型不同；合并会带来第二套 Key/记忆/调度（ARCH D1/D3 已论证）。
2. **不共享 React/UI 运行时**：两端渲染栈/生命周期不同；共享 UI 的收益远低于共享数据与语义。
3. **不为了“统一”而强行统一两套内容 schema**：保留双 schema + 共享语义 spec 是更便宜且可回滚的路线（CONTENT-MARKET §3.7 的决策可保留，但需补共享语义）。
4. **不在生产信任根/签名/更新就绪前上线远程市场**：安装器是新的远程代码/资产入口；先有签名与更新通道，再谈市场。
5. **不引入 monorepo/pnpm workspace/submodule**（当前阶段）：ARCH D7 已论证迁移成本高于收益；用 spec 产物 + vendored + LOCK 即可。
6. **不做大爆炸重写**：`src/pet` 无循环依赖、纯函数层清楚，适合渐进拆；重写会把已修的安全/consent/ACL 资产丢掉。
7. **不把 `engine.dsh`/`manifestVersion` 当兼容保证**：DSH 不强制，必须自己加检查（P1-1）。

---

## 8. 建议先做 3 件（带验收口径）

> 前置：等 task-52/54 提交并跑一次完整 `npm run preflight`（本轮结束时内容子集/typecheck 已绿，但仍未 commit）；否则任何“基线”都不可信。

### 第 1 件：冻结“共享语义清单 + 单一权威源”（P0-1 的第一步）

**为什么是它**：后续所有内容中心/角色/市场/主题工作都要消费同一批语义；这张表不定，代码写多少都会再漂。

**动作（0.5–1 人日）**：
1. 用 §2.3 的 15 个共享面做底稿，写 `docs/contracts/SHARED-SEMANTICS.md`：每面给出“权威文件/字段、当前双端值、差异是故意还是漂移、验证命令”。
2. 对 §3.3 表中 10 处已知差异逐条裁定；尤其先定：角色 bundle 默认外观/对话、对话包语义、用途声明 canonical 文本、event→clip 映射。裁定结果写进文档，能一致的就一致，故意差异必须写明理由 + 测试固定。
3. 在 `AGENTS.md`/README 中加一句“改这些语义必须先改 spec/表”，把入口显性化。

**验收**：任取角色 cat，打开两端实现能回答“为什么这个值是 night/dark 而那边是 paper/paper”（要么同一值，要么文档第 X 节 + 测试）。

### 第 2 件：让 dsh-famling 可独立构建/发布/自证（P0-2）

**为什么是它**：插件是唯一对外分发的 DSH 产物；它现在不能从自己的仓库重建/验证，也就不能被审计、不能保证升级一致。

**动作（1.5–3 人日，依赖第 1 件的 spec 雏形）**：
1. 产出 `spec/face/0.1/{catalog.json,assets.json,schema/,LOCK.json}`（或先 vendored `spec/` + LOCK）。`assets.json` 至少含三套动画的逐文件 sha256、帧数、regions sha、声明/名册版本。
2. 改 `DF/scripts/embed-anims.mjs`：默认源从 spec/LOCK（或依赖包）读，不再默认读 `../../desktop-games`；缺 spec 直接 fail，不允许 skip。
3. 插件目录 `git init` + 公开仓分支 + `.github/workflows/ci.yml`：`node --test test/*.test.js`、`embed-anims --check`、`verify-anims`、`npm pack --dry-run`，在无私有仓环境跑。
4. `package.json.files` 确认包含 spec/LOCK；README 写清 `specVersion` 与发布 tag 的对应。

**验收**：在临时目录（无 `desktop-games`）clone 插件仓 → `npm test && npm run check && npm run verify` 全绿；修改一帧资产但不重新生成 → CI 红。

### 第 3 件：发布信任与版本身份收口（P0-3）

**为什么是它**：没有 signed/可更新/身份一致的宿主，远程内容市场与公开分发都不成立；而 DLC 生产密钥/Authenticode 是外部长周期项，越早启动越好。

**动作（工程 3–5 人日 + 外部决策）**：
1. 召开一次 30 分钟决策会（owner + 用户）：定产品身份（Famling / identifier / 版本策略）、证书来源、updater 范围（是否做）、DLC 生产密钥保管人（双人）。产出 `docs/plan/RELEASE-ARCHITECTURE-2026-11-*.md`。
2. 工程侧：产品身份改名（含安装目录/AppData 迁移策略）、CI 加 Authenticode/updater 门禁（证书未到位时明确 `unsupported/preview` 标记）、DLC B3/B5 清单化。
3. DLC 生产密钥 ceremony + 重签 packs（B1/B5），让 `verify-dlc-trust` 在发布树 exit 0。

**验收**：发布门禁在真实发布树通过；`Get-AuthenticodeSignature` = Valid（证书到位后）；updater 有签名/回滚测试或明确“no updater v1”的对外口径；产品名/identifier 在安装包/AppData/关于页/市场元数据一致。

---

## 9. 需要拍板的问题（lead/用户）

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| Q1 | 共享语义 spec 放哪、对谁公开？ | A 放私有仓 `spec/`（仅内部/发布时导出）；B 放公开仓/独立 npm 包（第三方可见） | 先 A（快速、不暴露资产清单）；对外可只发 sha 清单/规范文本，资产另授权 |
| Q2 | 动画/美术资产能否公开（spec 需要列出帧 sha/尺寸/台词）？ | A 全公开；B 只公开清单 sha，不公开字节；C 不公开 | 按现有许可：代码 PolyForm NC、美术 CC BY-NC-SA；建议 B（清单可公开，字节走发布物） |
| Q3 | 两产品角色默认外观/对话节奏的差异是“故意”还是“漂移”？ | A 统一（推荐先按 famling library.json）；B 保留差异但文档化 + 测试固定 | 先 A 统一内置角色；第三方包再允许按产品覆盖；避免用户困惑 |
| Q4 | 安装器归谁？ | A famling 独立安装器；B 插件 Host 安装器；C 两者共用同一协议/校验、各自宿主实现 | C（共用协议 + 各自薄宿主）；拒绝 A/B 单独实现 |
| Q5 | Electron 宿主去留？ | A 删除/归档；B 保留为历史对照 | A（Tauri 已选型且 Electron 不在发布路径） |
| Q6 | DLC 生产密钥 ceremony / Authenticode 证书 / updater 的 owner 与时间？ | — | 由用户指定 owner + 目标日期；完成前不对外称 “signed” |
| Q7 | 是否接受 `dsh-famling` 与 famling 版本独立（0.10.x vs 0.1.x）？ | A 接受，靠 spec 版本映射；B 尝试 lockstep | A（D1 已决定分开发布）；但必须有 `specVersion ↔ pluginVersion ↔ appVersion` 矩阵 |
| Q8 | Tauri 同源 storage 是否必须隔离（涉及数据迁移）？ | A 做（每窗口 data dir 或键空间隔离）；B 接受风险 + 文档 | 先做技术验证（P1-7），再决定；若市场开放第三方内容则必须 A |

---

## 附录 A 实测记录（命令与结果，2026-11-19 12:50–13:20 +08）

### A.1 dsh-famling（`<private-path>

| 命令 | 结果 |
|---|---|
| `node --check index.js && node --check client.js` | exit 0（INDEX_OK / CLIENT_OK） |
| `node scripts/embed-anims.mjs --check` | exit 0；assets=desktop-games/public/assets/pet/anim；regions=desktop-games/public/characters；human 68 / cat 72 / dog 68 = 208 帧；entry 66.1 KiB；chunks 61.7/108.0/77.6 KiB 均 unchanged |
| `node scripts/verify-anims.mjs` | exit 0；total frames 208，base64 224.0 KiB；first-screen client.js 66.1 KiB；first paint 127.9 KiB；all 313.5 KiB；OK |
| `npm test` | **76 tests / 76 pass / 0 fail**（含 v3 pack 校验、persona、brief TTL/投影、task、host bridge 错误处理等） |
| `git status`（插件目录） | fatal: not a git repository |
| `ls .github`（插件目录） | 不存在 |

### A.2 famling（`<private-path>

| 命令 | 结果 |
|---|---|
| `npm run typecheck`（12:55） | **exit 2**；8 个错误全部在 `tests/content-hub.test.ts`：`writeContentSelection` 未导入（:702,717,728）、`isRemoteMarketConfigured` 未定义（:1235）、`SelectionKey` 未导入（:1664,1683）、`restore` 可能为 null（:1785）、`Promise<ThemePackPrepareResult>` 类型不符（:1795）；13:05 复查 3 个错误；**13:10 复查 exit 0**（task-54 已修复，未提交） |
| `node --import tsx --test tests/content-library.test.ts tests/content-pack-v2.test.ts tests/content-hub.test.ts tests/content-assets.test.ts` | 12:55：**132 / 131 pass / 1 fail**（`tests/content-hub.test.ts:1118` 对 input 为 undefined 的断言；与 typecheck 同源于未完成的 API 改动）；13:10：**136 / 136 pass** |
| `git status --porcelain` | 12:55 18 项、13:10 21 项（含并行评审新增文档）；M `src/pet/main.ts`、`content-hub.ts`、`content-library.ts`、`desktop-shell.ts`、`pet.css`、`tests/content-hub.test.ts`、`public/content/{README.md,library.json}`、`docs/**`；?? `src/pet/content-assets.ts`、`tests/content-assets.test.ts`、`tests/content-pack-v2.test.ts`、`docs/content-packs/` 等 |
| `git remote -v` | 空（无 remote）；HEAD `779354b` |
| `ls spec` / `find -name LOCK.json` / `grep HOST_BASELINE` | `spec/` 不存在；无 LOCK；插件无 HOST_BASELINE |

### A.3 静态分析（只读脚本，输出见正文）

- **导入图**（临时脚本读 `src/**/*.ts` 的静态 `import … from`，解析相对路径为文件）：176 文件 / 52,824 行；`src/pet` 91 文件 / 253 条内部边 / **0 环**；`topFanOut`: `src/pet/main.ts` 47、`src/aquarium/main.ts` 15、`src/stall/main.ts` 11、`src/pet/chat-import.ts` 10；`topFanIn`（全 src）：`src/kernel/types.ts` 18、`src/pet/security/limits.ts` 16、`src/pet/consent/terms.ts` 11、`src/pet/character/types.ts` 10。
- **跨层边**：`voice → pet` 2 条（`src/voice/service.ts:11`、`src/voice/types.ts:1`）；`pet → voice` 12 条；`pet → presence` 3 条。
- **共享声明复制**：`grep -r emotional-companionship` → `src` 4 文件、`public` 2 文件、插件 5 文件（共 11 文件）。
- **文件规模**：`main.ts` 3,551；`content-library.ts` 4,568；`content-hub.ts` 2,314；`content-assets.ts` 1,270；`desktop-shell.ts` 1,522；`hero-runtime.ts` 1,250；`DF/client.js` 1,037；`content-extension.mjs` 706；`embed-anims.mjs` 888；`verify-anims.mjs` 611。
- **仓库体积**：`app/tauri` 4.8 GB（含 `target/`，本机构建产物；**不是** git tracked 内容，但会拖慢全仓扫描/CI 准备）。

### A.4 未执行（如实声明）

未跑 famling 全量 `npm test`（126 文件；评审期间树在变动，全量结果会混入未提交改动；只重复跑了内容子集）；未构建 Tauri；未启动/重启 DSH 实例；未调用真实 LLM/Pet Brief；未联网核对公开仓 HEAD/npm 发布；未验证 Windows GUI/透明置顶/点击穿透。上述均标 unverified。

---

## 附录 B 关键证据索引（file:line）

| 主题 | 证据 |
|---|---|
| 长期方案（契约/宿主/版本四轴） | `DG/docs/design/FAMLING-DSH-ARCH-2026-11-18.md:17-31`（D1–D9）、`:128-145`（重复与漂移）、`:455-577`（同步机制/版本规则） |
| 内容模型两端声明 | `DG/src/pet/content-library.ts:1-55`（自称两产品共用）、`:72-90`（schema 常量）、`:148-176`（用途声明）、`:642+`（市场契约）；`DF/content-extension.mjs:31-44`（v3）、`:50`（7 kinds）、`:140-150`（扩展点） |
| 角色 bundle 漂移 | `DG/public/content/library.json:14`（rolePresets）、`:59-68`（cat）、`:102-111`（dog）、`:145+`（origami）、`:290-320`（dialoguePacks）；`DF/client.js:76-82`（DIALOGUE_MODES）、`:129-136`（ROLE_BUNDLES）；`DF/README.md:84`、`DF/docs/DETAIL.md:51-52` |
| 内容中心 v2/UI | `DG/docs/design/CONTENT-MARKET-2026-11-19.md:204-226`（双 schema 独立决策）、`:523-602`（v2 角色主题/包/远程市场）；`DG/src/pet/content-hub.ts:97-141`（tabs）、`:779-802`（导入选择）、`:943+`（prepare）、`:1789-1808`（导入 UI） |
| 插件跨仓构建 | `DF/scripts/embed-anims.mjs:82-84`（默认私有路径）、`:821`（缺源抛错）、`DF/scripts/verify-anims.mjs:564-566`（缺源仅 warning）、`DF/test/client-static.test.js:166,213`（skip） |
| 插件 Host 半 | `DF/index.js:12`（硬 inject）、`:14-18`（常量）、`:96-99`（advisersHome）、`:101-156`（brief 简化校验）、`:158-185`（chat/persona）、`:187-256`（bridge 5 op）、`:264-271`（route 注册） |
| 插件 Client 半 | `DF/client.js:1-9`（ModuleLoader/生成块）、`:34-45`（EVENT_CLIPS）、`:204,250`（require.async）、`:358-359,408`（同意文案/键）、`:1029-1033`（slot 注册）；`DF/client.content.js:1-10`（chunk 协议/STRINGS） |
| 插件分发包 | `DF/package.json:3`（0.10.0）、`:51-67`（dsh manifest + engines）；`DF/README.md`（0.10.0 能力/懒载/内容中心） |
| 动画/区域/行为 | `DG/public/assets/pet/anim/*/manifest.json`（formatVersion 1 / 208 帧）；`DG/public/characters/*/regions.json`（v1）；`DG/public/characters/*/behavior.json`（famling.behavior/0.1）；`DG/src/pet/anim/**`（10 文件）、`DG/src/pet/character/**`（10 文件） |
| 角色管线/遗留 | `DG/src/pet/hero-runtime.ts:104-140`（HERO_CHARACTER_SOURCES，含 `tinglan-256`）、`:117`（legacy 注释）；`DG/public/characters/{tinglan,tinglan-256,humanoid-default,...}` |
| Tauri ACL/consent/DLC | `DG/app/tauri/src-tauri/build.rs:32`（COMMANDS）、`:64`（UNGRANTED）、`:69`（PET_ONLY）、`:198`（AppManifest）、`:238-245`（漂移报错）；`DG/app/tauri/src-tauri/src/main.rs:1065`（generate_handler）；`DG/native/dlc-verify/src/lib.rs:20-24,305-340`（内嵌信任根/dev gated）；`DG/docs/audit/RESOLUTION-{TAURI-ACL,DLC-SIGNING,CONSENT-GATE}-2026-11-19.md` |
| 发布/元数据 | `DG/app/tauri/src-tauri/tauri.conf.json:3-5,16,31-39`；`DG/package.json`（desktop-games-p0 / electron 依赖）；`DG/.github/workflows/ci.yml:3-6`；`DG/scripts/check-version.mjs:1-25`；`DG/scripts/export-public-pet.mjs:1-40` |
| 边界审计（历史） | `DG/docs/audit/FAMLING-PUBLIC-BOUNDARY-2026-11-18.md:9-14,110-115`（公开仓 WAV/kernel/packs/过期声明；快照 2026-11-18，之后方案 A 清理见交接 §12） |
| DSH 宿主契约 | `DSH/packages/client/ui-sidebar/src/client/contract/slots.ts:75`（sidebar.footer.action）；`DSH/packages/client/modules/README.md`（package-local chunks/require.async）；`DSH/packages/util/package-manifest/README.md:96`（不强制 engines/manifestVersion）；`DSH/docs/api-gateway.md:96`（connection/fetch carrier） |
| 同意 canon | `DG/src/pet/consent/terms.ts:80-84`（TOS/TTS/ASR 版本 + hash 派生说明） |

---

## 附录 C 术语表

| 术语 | 含义 |
|---|---|
| FCI | famling.character interface：角色文档/行为/场景/渲染的接口集合（apiVersion 0.1/0.3） |
| 角色主题 / role bundle | “角色就是主题”：character + voicePolicy + dialogue + theme/background/font 六组件一键应用 |
| anim pack | `public/assets/pet/anim/{human,cat,dog}`：96×96、12 clip、208 帧、逐帧 holdMs |
| regions | `regions.json`：96×96 逻辑画布上的 head/body/tail 命中区 + actions/gestures/says |
| behavior | `behavior.json`：famling.behavior/0.1，状态机/slots/rules/ambient |
| spec / LOCK | 建议新增的版本化共享语义工件与锁文件（本报告建议，未实现） |
| DLC | 此处指需要签名的内容/游戏数据包（`packs/**`），与“内容市场 pack”不是同一体系，但共用信任根思路 |
| bridge | 插件 Host half 注册的 `/api/famling/bridge`（v1，5 op） |

---

## 附录 D 本报告的边界声明

1. 本报告是**架构评审**，不替代：`review-software`（代码质量/类型/测试）、`review-network`（远程协议/威胁模型）、`review-game`（动画/游戏性）、`review-qa`（测试矩阵）、`review-psych`/`review-ux`（交互与心理）、以及既有安全/性能/鲁棒性审计。相关结论若有冲突，以更专门、带实测的报告为准。
2. 本报告未改任何代码/资产/配置，未 commit/push；唯一写入是本文件。
3. 快照期间工作树有 18 项未提交改动（内容中心 v2 正在开发），`tsc`/1 个内容测试为红；这不是已提交基线状态，本报告已在 §1.3 明确区分，不据此判定产品缺陷。
4. 所有“未验证”项（Tauri/DSH GUI、公开仓当前 HEAD、npm 发布、市场服务器、真实 LLM/Pet Brief）均未在本次评审中实测，不能当作事实引用。
5. 建议中的工期为**量级估计**（基于文件规模/改动面），不是承诺；实际以 owner 排期为准。


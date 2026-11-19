# Famling / dsh-famling 长期架构与接口同步设计（2026-11-18）

| 项 | 内容 |
|---|---|
| 状态 | **设计决策稿（架构 B 类）；不是实现完成报告**。本文只做研究与决策记录，不改代码。 |
| 日期 | 2026-11-18（Asia/Shanghai）；快照时点见 §1.1。 |
| 任务 | 团队任务 task-1：famling 与 dsh-famling 是否分开开发、dsh-famling 如何最大程度依托 DSH、能否留接口锁定 DSH 特性并只同步接口后的变更。 |
| 写范围 | 仅本文件：`desktop-games/docs/design/FAMLING-DSH-ARCH-2026-11-18.md`。未改代码、未 commit、未装依赖、未改 DSH checkout。 |
| 读者 | famling / dsh-famling 维护者；负责发布、法务（task-2）、动画（task-3）的并行任务；后续接手的 Agent/人。 |
| 与既有文档关系 | 本文在 `docs/integration/FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18.md`（产品分层）之上补“契约 + 同步机制 + 改造路线”；**不替代** `docs/integration/ADVISERS-CONTRACT.md`（Pet Brief 数据契约）与 `docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md`（桥接实现细节）。冲突时：数据契约以 ADVISERS-CONTRACT 为准，DSH 事实以 DSH 源码/实测为准。 |

> **证据约定**：文中 `DG/` = `/mnt/d/Projects/dsh/desktop-games`（私有完整仓）；`PF/` = 公开仓 `PerryLink/famling` 工作克隆 `/mnt/d/Projects/dsh/_scratch/famling-cleanup-2026-11-18`；`DF/` = 本地插件 `/mnt/d/Projects/dsh/plugins/dsh-famling`（对应公开仓 `PerryLink/dsh-famling`）；`DSH/` = 只读 checkout `/home/yy/deepseek-harness`。
> 标 **unverified** 的条目只有代码/文档声明，没有端到端实测。本文不复述凭据、不写 Key/token；涉及 DSH 启动日志的“已安装/已加载”状态只写可由文件结构核对的结论。

---

## 0. 结论摘要

| # | 决定 | 一句话理由 |
|---|---|---|
| D1 | **分开开发、分开发布**：`famling`（独立桌宠应用）与 `dsh-famling`（DSH 插件）是两个产品、两个版本节奏，不合并运行时。 | 发布节奏（Tauri/安装包/法务 vs DSH 插件小步快跑）、公开导出边界（公开 famling 是 pet-only 切片，不含完整 mono-repo）、DSH 0.2.x rc 漂移都要求插件能单独发版。 |
| D2 | **唯一长期共享物是“契约”，不是“运行时”**：新增 `famling.face` spec（数据 + JSON Schema + 极小纯校验函数 + 资产清单），两个产品各做一个 adapter。 | 共享 React/UI 运行时不可行（Tauri 原生 DOM vs DSH slot/React 冻结模块表）；共享数据与语义才可行且正好覆盖重复部分。 |
| D3 | **dsh-famling 定位为薄 Host adapter**：Key/模型/会话/工具/调度/记忆/凭据/安装更新全部交给 DSH；插件只保留“角色 + 像素 + 气泡 + 桥接 + 同意”。 | DSH 已提供这些能力；复制一套就是第二套 Key/记忆/调度，且与 DSH 权限/审计冲突。 |
| D4 | **锁定 DSH 特性**：把所有 DSH API 调用收敛到单文件 `DF/src/host/dsh.js`，配 `HOST_BASELINE`、逐能力 probe、`engines.dsh`、录音式 fixtures 与 CI 校验。 | DSH 0.2.x 仍在 rc 期，插件 API 已发生多次重命名；把漂移限制在一个适配文件里，升级时只改一处。 |
| D5 | **版本四轴分离**：① 角色数据 FCI `apiVersion`；② 宿主表现 `famling.face` SemVer；③ 桥接 wire（`v:1` + spec 版本）；④ 数据契约（Pet Brief `schemaVersion`）+ DSH baseline（`engines.dsh`）。 | 现在“版本”混在角色 JSON、bridge v1、插件 0.7.x、DSH 0.2.2-rc.x 里；不分轴就无法回答“这次 famling 更新要不要改插件”。 |
| D6 | **famling 更新后只同步 spec diff**：数据类（美术/台词/帧）→ 零代码；增量类（新动作/新能力）→ 能力协商自动降级；破坏类（气泡语义/必填字段/同意门）→ spec MAJOR + 适配器版本窗口。 | 把“同步整个仓”降级为“同步一个生成物的版本差”，并用 CI 让遗漏在合并前失败。 |
| D7 | **落地形态**：私有仓 `spec/` 生成 → 公开 famling 镜像 `spec/` + 发布/归档 `famling-spec` 包（npm 不可用则 tarball）→ dsh-famling vendored `spec/` + `LOCK.json` 校验；不引入 pnpm workspace / submodule。 | 迁移成本最低、不破坏现有公开/私有边界；同时用 LOCK + CI 消除“手工拷贝靠记忆”。 |
| D8 | **产品边界不变**：dsh-famling 保持全年龄、无 roleplay/情感陪伴宣传；18+ roleplay 与年龄门只在独立 famling。插件不新增自由 LLM 角色扮演卖点。 | 现行 TOS/AI 标识口径与法务风险约束（另见 task-2 法律研究）；插件是“陪伴式工具入口”，不是 roleplay 客户端。 |
| D9 | **优先还债项**：Pet Brief 校验去重加固、consent 版本化、client.js 去 base64（改走宿主帧路由）、插件进入 git + CI。 | 这四项直接决定“同步机制”能否自动化；在契约冻结前必须先解决，否则生成器无从校验。 |

**一句话**：分开开发，但把“角色/语义/资产/同意文本”收进一个版本化的 face spec；famling 每次更新先产 spec diff，dsh-famling 只吃 spec 与 DSH host API，两个 adapter 各自薄；DSH 特性用 probe + baseline + engines + fixtures 锁在单文件里。

---

## 1. 现状盘点

### 1.1 基线与快照（2026-11-18 核验）

| 对象 | 位置 | 版本 / commit | 核验方式 | 备注 |
|---|---|---|---|---|
| 私有 famling | `DG/` | `master` @ `81932d8`（docs: 记录气泡/菜单跟随验证） | `git log/status/rev-parse` | **无 git remote**；快照开始时工作树有 3 个与本任务无关的既有改动（2 M + 1 ??），本文未触碰；写作期间 task-2/task-3 并行新增了其写范围内文件（§6.3） |
| 公开 famling | `PF/` ↔ `PerryLink/famling` | `main` @ `e7746466df4b67108e7fd54d2edf3d622c90a59f` | `git ls-remote`（直连 GitHub，绕过代理）+ 本地 clone | 553 tracked files / 4,663,328 B（4.4 MiB）；`git ls-files "*.wav"` = **0**；`package.json` = `famling-pet@0.1.0` |
| 私有完整仓体量 | `DG/` | 1180 tracked files / 19,129,296 B（18.2 MiB） | `git ls-files` + `stat` | 含 42 个私有 TTS WAV（公开仓已无） |
| dsh-famling 本地 | `DF/` | `0.7.5`；**目录无 `.git`**（靠手工拷贝同步） | `package.json` + `ls -a` | `node --check index.js && node --check client.js` OK；`npm test` = **11 tests / 11 pass / 0 fail** |
| dsh-famling 公开 | `PerryLink/dsh-famling` | `main` @ `29e3b82eb2f9af8530739446a261f42a0009daeb`（0.7.5） | `git ls-remote` + raw.githubusercontent 读 `package.json` | 公开仓 docs 有 `DETAIL.md`、`DSH-FAMLING-BRIDGE-2026-11-17.md`（20,302 B）、`FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18.md`（8,150 B）；本地 docs 有 `DETAIL.md` + task-2 新增 `LEGAL-NOTICE-2026-11-18.md`（两个桥接/架构文档只在公开仓） |
| DSH 运行实例 | `/home/yy/deepseek-harness`（源码直跑） | `0.2.2-rc.4`；HEAD `ca33fd6843`（2026-11-17） | `ps`：pid 416 `node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 3081`，Node 24.22.1；启动时间 2026-11-18 12:13 | `engines.node >=24.9.0`；GUI `http://127.0.0.1:3081` |
| DSH 已安装 CLI（Windows 侧） | `C:\Users\zzhdz\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh` | `0.2.2-rc.4` | 读 `package.json` | 与运行实例版本一致，但**不是**当前 Web 的宿主进程 |
| 运行 profile（WSL 侧） | `/home/yy/.dsh/profiles/web` | bundles = `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dsh-famling]`；deps 含 `dsh-famling: link:/mnt/d/Projects/dsh/plugins/dsh-famling` | 读 `package.json`（只读，未打印任何凭据） | 插件在 bundles 中；**unverified**：交接记录显示 13:00 前后插件刚从 profile 丢失并重新 add；12:13 启动的进程是否已加载当前 0.7.5 需刷新/重启后用 `plugin_manager list_plugins` 复核 |
| 另一套 DSH home（Windows 侧） | `C:\Users\zzhdz\.dsh\profiles\web` | bundles 无 dsh-famling | 读 `package.json` | 说明本机存在“双 DSH home”；见 §6.1 风险 R7 |
| Advisers 数据 | `/home/yy/.advisers/pet-brief.json` | 548 B，mtime 2026-11-18 10:43 (+08) | `stat`（**未读内容**） | 真实文件存在；`C:\Users\zzhdz\.advisers` 不存在 → 生产者在 WSL home，插件桥在 WSL 运行时才读得到；见 R3 |
| Advisers 契约 | `DG/docs/integration/ADVISERS-CONTRACT.md` | contract v0.2 / `schemaVersion 2` / `advisers@0.2.1` pin；TOS v2026.11.2 | 读文档（未独立跑 Advisers CLI） | 升级顺序 consumer-first；未来版本 fail-closed |
| 同意文本版本（canon） | `DG/src/pet/consent/terms.ts` | TOS `2026-11-17.6`、TTS `2026-11-17.4`、ASR `2026-11-17.3`、ROLEPLAY `2026-11-17.4`（hash 运行时由 `sha256Hex` 派生） | 读源码常量 | 交接文档里 TOS 旧值 `.5` 已被 `.6` 取代；以源码为准 |

**本次核验边界**：只读分析；未跑 `npm install`/Tauri 构建/未调真实 LLM；未改 DSH checkout/插件/profile；未读任何 token/Key/启动 URL 日志；未复核公开 dsh-famling 的 `docs/` 全文（只核了文件名/大小与 raw 内容哈希）；未重新生成 Pet Brief。**未验证 = 文中都标 unverified，不当作结论。**

### 1.2 famling 私有版能力清单（`DG/`）

| 能力域 | 已实现内容 | 关键文件 | 状态 |
|---|---|---|---|
| 角色与表现 | FCI 数据层（`famling.character` apiVersion 0.1/0.2 出厂、0.3 预览）：行为状态机、registry、scene、多对象骨架；渲染抽象、像素缩放、hero runtime、UI 91 外壳、命中区/点击穿透、气泡跟随。**并行 task-3 正在新增 `famling.pet-anim/0.1` 动画包契约与 `src/pet/anim/**`（未提交，属 task-3 写范围）** | `src/pet/character/**`（10 文件）、`src/pet/render/**`、`src/pet/scene/**`、`src/pet/hero*.ts`、`src/pet/pixel-scale.ts`、`src/pet/desktop-shell.ts`、`src/pet/hit-regions.ts`、`src/pet/shell-layout.ts`、`pet.html` | 可用；**美术仍是占位/不合格**（旧 49 PNG 去重约 19 底稿，见交接 §5） |
| 角色包 | `public/characters/{tinglan,tinglan-256,humanoid-default,pet-cat,pet-dog,pet-default}` + 4 套 `public/assets/pet/*` 帧包（tinglan-256 为 49 PNG + manifest v2，含 tags/fps/loop/anchor/bbox/palette） | `public/characters/**`、`public/assets/pet/**`、`src/pet/character/registry.ts` | 数据在；猫/狗为 placeholder |
| 语音 TTS | 前端 `VoiceService`（provider 链：system → baked → DeepSeek cloud → mock；预算/缓存/大小/限流/字幕）；Tauri `voice_synthesize` 云代理（key 只在 Rust）；baked 42 WAV（stella/tide 各 21）；clone = 明确 unsupported | `src/voice/**`（11 文件）、`app/tauri/src-tauri/src/main.rs`、`public/assets/voice/pet/**` | 私有链路完整；**公开导出不含 WAV 与云代理命令**（见 1.3） |
| ASR | 录音/采样、`src/voice/asr.ts`、Tauri 侧 ASR、独立 ASR 同意 | `src/voice/asr.ts`、`src/voice/sample-recorder.ts`、`src/pet/consent/asr.ts` | 代码在；实际质量/平台可用性未在本文验证 |
| 同意/年龄 | 首启完整 TOS；每次修改/导入/DLC 重弹；TTS/ASR 独立同意 + 版本/哈希；roleplay 18+（自报生日、fail-closed）；2h 健康提醒；审计仅本地 | `src/pet/consent/**`（16 文件）、`docs/legal/**`（34 文件） | 实现完整；法务文本仍 DRAFT、`legal-check --strict` 仍 BLOCKED |
| 安全/隐私 | 内容安全分类/消毒/门；fetch 超时、错误边界、路径安全、限流、限长、安全存储；存档整档加密（DPAPI/AES-GCM）；口令备份；观测默认关 | `src/pet/safety/**`、`src/pet/security/**`、`src/pet/crypto.ts`、`src/pet/portable.ts`、`src/pet/trust.ts`、`src/observability.ts` | 实现完整 |
| Advisers 脸 | Tauri `read_advisers_brief` 只读文件 → `presence/pet-brief.ts` 严格校验（TTL/closed schema/displayPolicy/claims）→ `pet/advisers/face.ts` 控制器（超时/去重/退避/隐私面板） | `src/presence/**`（9 文件）、`src/pet/advisers/face.ts`、`app/tauri/src-tauri/src/main.rs:85` | 只读闭环；真实账本为空（counts 0） |
| 数据/导入 | DeepSeek 分享导入、chat-import、角色校验 CLI、存档/折页簿 | `src/pet/chat-import/**`、`scripts/import-character.mjs`、`scripts/validate-character.mjs` | 可用 |
| 桌面壳 | Tauri 2 + WebView2：480×336 透明置顶、点击穿透、托盘/窗口、安装包资源、capabilities | `app/tauri/**`（16 文件）、`app/tauri/src-tauri/tauri.conf.json` | Windows 构建可跑；未签名/未上架 |
| 质量门 | 116 个测试文件、70 个脚本、typecheck/build/legal-check/FCI 校验、842 tests 历史记录 | `tests/**`、`scripts/**`、`package.json` | 私有仓强；**公开导出不带 tests/scripts**（R3） |
| 私有专有 | 完整游戏基座（kernel/game/town/stall/aquarium/world/scene/host/shell）、DLC/pack、私有 docs/art/研究、baked WAV | `src/{kernel,game,scene,shell,host,world,town,stall,aquarium}/**`、`packs/**`、`native/dlc-verify/**`、`art/**` | **不导出**；公开边界明确 |

### 1.3 famling 公开版能力清单（`PF/` ↔ PerryLink/famling）

公开仓是**pet-only 可执行切片**（不是“角色接口子集”，也不是完整 mono-repo）：

| 维度 | 私有 `DG/` | 公开 `PF/` | 差值/口径 |
|---|---:|---:|---|
| tracked files / bytes | 1180 / 18.2 MiB | 553 / 4.4 MiB | 删掉游戏基座、tests、scripts、私有 docs/art、42 WAV、packs、dlc-verify、content.schema、重复资产树 |
| `src/pet/**` | 78 文件 | 78 文件 | 整棵 pet 前端导出（含 consent/safety/security/scene/shell-layout/hit-regions/voice-prefs） |
| `src/pet/character/**` | 10 | 10 | FCI 全量导出 |
| `src/voice/**` | 11 | 10 | 缺 `baked.ts`；`deepseek.ts`/`tauri.ts`/`clone.ts` 仍在，但公开 Rust **没有 `voice_synthesize`** 命令 → 云 TTS 实际不可用，运行时只剩 system/mock provider |
| `src/presence/**`、`src/pet/advisers/**` | 9 / 1 | 9 / 1 | 只读 Pet Brief consumer 完整导出 |
| `src/kernel/**`、`src/game/**` | 10 / 14 | 2 / 1 | 只留 pet 运行必需（`pet.ts`+`memory.ts`、`checksum.ts`） |
| `app/tauri/**` | 16 | 16 | Tauri 壳完整；packs/DLC 命令已删；`productName`/identifier 已改 Famling |
| `tests/**` / `scripts/**` | 116 / 70 | 0 / 1 | 公开仓**不能**跑 `npm test`/`legal-check`；只有 `validate-character.mjs` |
| `docs/legal/**`、`public/legal/**` | 34 / 35 | 34 / 35 | 法务随包（含 DRAFT 声明与公开导出边界块） |
| 音频 | 42 WAV（4,289,208 B）+ manifest | **0 WAV** | 2026-11-18 方案 A 清理 + 历史重建；README 明示“不随包预生成音频” |
| 角色包/资产 | `public/characters/**` + `public/assets/pet/**`（303） | 260 文件 | 42 WAV + manifest 之外的资产树导出；重复 `public/pet`/`public/ui` 已删 |
| 许可 | PolyForm NC 1.0.0 + CC BY-NC-SA 4.0 | 同 | 公开 `package.json` = `famling-pet@0.1.0`；Tauri artifact unsigned |

**公开版能力结论**：独立桌宠的“完整可执行形态”在公开仓成立（Windows 安装包可启动、TOS/年龄门/输入 composer/Advisers 只读链路在 10:47 实机验证过——见交接 §12 与边界审计 §13，本文不重复实测）；但**测试/脚本/法务校验不可在公开仓复现**，且**云 TTS 能力被切断**，这两点直接影响“公开仓能否当契约源/CI 源”的决策（见 §4.6）。

### 1.4 dsh-famling 现有能力（`DF/` 0.7.5）

| 能力 | 实现 | 文件/关键行 | 状态 |
|---|---|---|---|
| 侧栏入口 | client 插件向 DSH slot `sidebar.footer.action`（kind=list, scope=root）注册；72px 汀岚 + 右侧竖排 输入/互动/设置 | `client.js:344-352`；slot 定义见 `DSH/packages/client/ui-sidebar/src/client/contract/slots.ts:75` | 已实现（当前运行进程是否加载 0.7.5 见 §1.1 unverified） |
| 本地帧动画 | 30 张 base64 PNG 内嵌 client.js（112,891 B）：idle_00..07、look、pat、paper(remind)、fold(drag)、眨眼/闭眼帧 | `client.js:7-16,245-247` | 已实现；**帧数据与私有资产重复且无生成关系** |
| 气泡 | `speech`/`thought` 两种，虚线；本地互动台词 + Host 回复；3.2s 自动消失 | `client.js:132-139,323-332` | 已实现 |
| 输入面板 | textarea + 浏览器 SpeechRecognition 回填；显式发送；无自动发送 | `client.js:224-244,254-280` | 已实现 |
| 互动面板 | 摸摸/给纸片/折一下/左右看；点人物随机 | `client.js:149-157,281-286` | 已实现 |
| 设置面板 | 语音朗读/帧动画/气泡开关（localStorage）；AI 声明；Advisers 摘要按钮 | `client.js:287-305` | 已实现 |
| 同意（本地） | TTS/ASR 各自独立确认，存 `localStorage["dsh-famling/consent/v1"]`（只有布尔，无版本/文本哈希/过期） | `client.js:65-68,159-182` | 已实现但弱（见 1.5 G4） |
| Host bridge | `POST /api/famling/bridge`，exact 路由、owner-only、同源 Cookie、JSON ≤16KiB、输入 ≤2000 字符、25s LLM 超时 | `index.js:14-17,149-229` | 已实现 |
| `echo` | 本地回显，不调模型 | `index.js:158-163` | 已实测 200（交接 §12） |
| `chat` | `ctx.llm.stream`，`maxTokens:300`，system prompt 写死在插件；provider/model = 插件 patch config → `ctx.get("agentDefaultModel").currentSelection()` → 503 `E_LLM`；`reasoningEffort` 透传 | `index.js:18,120-147,198-212` | 已实测真实回复（交接 §12）；**LLM 费用/隐私同意缺失** |
| `brief` | 读 `ADVISERS_HOME` 或 `USERPROFILE/.advisers` 或 `HOME/.advisers` 下的 `pet-brief.json`，128 KiB 上限，schemaVersion 1..2，`displayPolicy:none` 拒绝，投影 counts/today(3)/commitments(3) | `index.js:77-118,164-169` | 路由已实测 200（交接 §12）；**校验弱于独立版**（无 TTL、无 closed schema、无 consented 前置） |
| `task` / `task-delete` | `ctx.schedule.create`（`timing.kind:"at"`、`target.kind:"new_once"`）/ `ctx.schedule.edit({action:"delete"})` | `index.js:170-197` | 已实测创建/删除（交接 §12）；只有绝对时间、无自然语言/列表 UI |
| 模型选择 | 不写死；Config 半配置在加载时报错；profile 切换模型自动跟随 | `index.js:31-64,221-228`；`test/host-bridge.test.js` | 已实现；11/11 测试通过 |
| 测试 | 11 个 fake-context 测试（不调真实模型/不付费） | `DF/test/host-bridge.test.js` | 通过 |
| 文档/元数据 | `README`（含模型选择、桥接 ops）、`docs/DETAIL.md`、`docs/LEGAL-NOTICE-2026-11-18.md`（task-2）、`locale/{zh,en}.json`、`icon.png`、`NOTICE` | `DF/**` | 本地缺公开仓的 BRIDGE/NATIVE-ARCH 两篇；README 仍有“预留 `window.__DSH_FAMLING_BRIDGE__`”等过期句 |

### 1.5 dsh-famling 缺口清单（按阻断程度）

| # | 缺口 | 证据 | 影响 |
|---|---|---|---|
| G1 | **无契约层**：动作表、帧序列、气泡语义、同意文案、AI 声明、system prompt 全部硬编码在 `client.js`/`index.js` | `client.js` 30 sprite + 5 个 SEQ；AI 声明 2 处重复；`index.js:18` system prompt | famling 换一帧/改一句台词就要发插件；无法“只同步接口后的变更” |
| G2 | **帧资产重复**：插件内嵌 base64（30 张）与 `DG/public/assets/pet/tinglan-256` 49 PNG + manifest v2 无生成关系 | `client.js:7`；`DG/public/assets/pet/tinglan-256/manifest.json` | 美术/动画更新必须手工重编码；体积 110 KB；无法校验 sha256 |
| G3 | **Pet Brief 校验双实现且弱**：插件无 TTL、无 closed-schema、无 consent 前置、无超时/退避；独立版全部有 | `index.js:82-118` vs `DG/src/presence/pet-brief.ts:38-78,165+`、`DG/src/pet/advisers/face.ts` | 两份行为会漂移；过期/未知字段可能被展示 |
| G4 | **同意不可审计/不可版本化**：`consent/v1` 只存布尔；无 terms 版本/哈希；无撤回；无插件侧统一声明源 | `client.js:65-68` | TTS/ASR 同意与独立版语义不一致；升版文本后无法强制重申 |
| G5 | **没有 DSH 能力探测/协商**：`inject:["connection","llm","schedule"]` 为硬依赖；无 `hello`；无能力矩阵；无降级声明 | `index.js:12`；bridge 只有 5 个 op | 不同 profile/DSH 版本下行为不可预期；新增能力无灰度 |
| G6 | **bridge v1 字段分散**：请求/响应形状散落在 handler 里，无 schema/错误码表/限流/审计 | `index.js:149-229` | client/host 一起改才安全；测试覆盖靠手写 |
| G7 | **无 git/CI**：本地插件目录无 `.git`；公开仓无 workflow（unverified：仓库根文件未列 workflow）；靠拷贝同步 → docs 已漂移 | `ls -a DF/`；公开仓与本地 docs 差 2 篇 | 发布不可复现；交接靠人记 |
| G8 | **LLM 费用/数据告知缺失**：chat 直接发送，无费用提示/模型来源展示（只在失败时提示）；`meta` 有 provider/model 但不展示 | `client.js:193-207`；`index.js:203-209` | 用户不知道一次点击会计费/发到哪个模型 |
| G9 | **未用 DSH synced Config**：设置存 localStorage；Host 侧 `/api` 配置只有 patch 层 | `client.js:62-64`；DSH 能力见 §3.16 | 换机器/换 profile 设置不跟；配置无法被 DSH Settings 统一管理 |
| G10 | **状态可丢**：插件安装态在 DSH profile 重装/升级流程中多次消失（09:12、13:00 记录） | 交接 §12；双 home 现象 §1.1 | 用户侧“宠物突然不见”；需要 health-check/文档化恢复流程 |

### 1.6 两仓重复部分与已发生的漂移

| 重复项 | famling（独立版）位置 | dsh-famling 位置 | 漂移证据 |
|---|---|---|---|
| 帧/动作表 | `public/assets/pet/tinglan-256/manifest.json`（tags: idle 8fps10, pat 6fps10, drag 4fps8, remind 6fps10, ...） | `client.js:9-16` 手写 SEQ（idle 120ms/帧、pat 90ms、paper 100ms、fold 100ms） | 同一个动作两套 fps/duration；manifest 是权威但插件未消费 |
| 帧图片 | `public/assets/pet/tinglan-256/*.png`（49 PNG，sha256 未在插件侧固定） | `client.js:7` 30 个 base64 常量 | 插件只有 30/49 张；改图需手工重新编码 |
| 角色 JSON | `public/characters/tinglan/character.json`（FCI 0.3，含 capabilities/sockets） | 无引用；插件只认 72px 头像 | 插件不知道角色能力/画布/anchor |
| 气泡语义 | `pet.html`/`desktop-shell.ts` 的 speech/thought；猫狗思想气泡虚线 | `client.js:323-332`（thought 虚线） | 语义一致，但无共享定义；文案/时长各自硬编码 |
| 同意文本/版本 | `src/pet/consent/terms.ts`（TOS/TTS/ASR/ROLEPLAY 版本 + hash） | `client.js:25-26,41-42` 两段长同意文案（无版本） | 文本同源人工抄写；升版必然不同步 |
| AI 标识 | `docs/legal/AI-LABELING.md`、首启/About/TTS 声明 | `client.js:271,292` 两处相同 AI 声明（重复 2 次） | 口径需与 task-2 法律研究统一 |
| 人格/system prompt | `DG` 内安全/角色化边界（safety/roleplay 文案） | `index.js:18` 一段写死 prompt | 独立版的“不冒充/不诱导依赖”边界未在插件侧被测试锁定 |
| Pet Brief 消费 | `src/presence/pet-brief.ts` + `src/pet/advisers/face.ts`（严格） | `index.js:82-118`（宽松） | 已实际分叉（见 G3） |
| 桥接契约文档 | `DG/docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md`（sha256 前缀 `ba775a5d…`） | 公开 dsh-famling 同名文档哈希 `ba775a5d…`；公开 famling 同名文档哈希 `f76205b4…` | **同一契约三处存放、两个内容**；公开 famling 那份是旧版 |
| 架构文档 | `DG/docs/integration/FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18.md`（`b4b7042d…`） | 公开 famling、公开 dsh-famling 均 `b4b7042d…` | 目前一致，但靠人工拷贝保证 |

### 1.7 现状判定

当前实际形态 = **方案 A：独立双线 + 手工同步**（详见 §2.2）。三条产品事实都可运行，但同步面是“人肉复制 + 记忆”，重复项已开始漂移（桥接文档、brief 校验、同意文案、帧表）。因此问题不是“要不要分开”，而是**分开之后用什么契约把重复面锁住**。

---

## 2. 方案对比与推荐

### 2.1 决策维度

| 维度 | 含义 | 权重（本产品） |
|---|---|---|
| M1 维护成本 | 一次改动要在几处同步、是否靠人记 | 高 |
| M2 发布节奏 | 两条产品线能否各自发版、回滚 | 高 |
| M3 公开导出边界 | 公开仓只能出现 pet-only 切片；私有内容不进公开 | 高（硬约束） |
| M4 许可证兼容 | PolyForm NC 1.0.0 + CC BY-NC-SA 4.0；不引入冲突许可 | 高（硬约束） |
| M5 版本漂移 | 角色/语义/文案在两产品是否同源 | 高 |
| M6 DSH API 稳定性 | 0.2.x rc 期 API 已多次变化，插件需能快速修补 | 中高 |
| M7 产品一致性 | 用户看到的汀岚是否同一个“人” | 中 |
| M8 迁移成本 | 在现有三仓/双 home/手工同步现实上落地的代价 | 中 |

### 2.2 候选方案

- **A. 独立双线 + 手工同步（现状）**：两产品各自维护，重复内容靠人工复制。
- **B. 共享运行时 core 包**：新建 `famling-core` 包（角色状态机/动画/校验/提示词），standalone 与插件同时 import，UI 各自渲染。
- **C. 接口优先 + 双适配器 + 生成式 spec**：先把“宿主无关语义 + 资产 + 同意文本”定义成版本化 spec；standalone adapter 与 DSH adapter 各自消费 spec；生成器 + LOCK + CI 保证同步。
- **D. 单仓合并**：把 dsh-famling 放进 famling 仓（或反之），同 git 历史/同版本发布。
- **E. 插件自养副本**：dsh-famling 自己维护一套美术/语义，永不与 famling 同步。
- **F. 内嵌运行（对照）**：DSH 里 iframe 嵌公开 famling，或插件拉起 Tauri。**评审直接否决**，不进入评分。

### 2.3 对比表

| 维度 | A 手工双线 | B 共享运行时 core | **C 接口优先双适配器** | D 单仓合并 | E 插件自养 |
|---|---|---|---|---|---|
| M1 维护成本 | 高（每次手工对照） | 中（包内共享，但要维护双构建） | **低（数据类零改码；语义类走 spec diff）** | 中（同一仓但两套构建/测试） | 低但重复 |
| M2 发布节奏 | 各自独立但同步靠人 | 被 core 版本绑住 | **各自独立** | 被同一版本绑住 | 独立 |
| M3 公开导出边界 | 现有边界 | core 包放公开/私有都两难 | **spec 必须是可公开数据，天然符合边界** | 会迫使公开仓引入 DSH 依赖或私有仓公开 | 符合但双份 |
| M4 许可证 | 两仓同协议 | 取决于 core 放哪 | **spec 数据 CC BY-NC-SA、代码 PolyForm NC，与现有一致** | 复杂（两套许可混一仓） | 同现有 |
| M5 版本漂移 | 已发生（§1.6） | 低（运行时同源） | **低（语义同源；UI 允许不同）** | 低 | 高（必然双份） |
| M6 DSH API 稳定性 | 插件可快修 | core 可能拖慢插件 | **插件快修；spec 与 DSH API 无关** | 插件修补要发大版本 | 插件快修 |
| M7 产品一致性 | 中 | 高 | **高（角色/语义/文案同源）** | 高 | 低 |
| M8 迁移成本 | 0 | 高（抽包/双构建/React 化） | **低-中（先加生成器与 LOCK）** | 高（改仓结构/发布链） | 0 |
| 结论 | 仅作过渡 | 不采纳 | **推荐** | 不采纳 | 不采纳 |

### 2.4 推荐：C（接口优先 + 双适配器），A 作为过渡态

**推荐 C 的逐维度理由**：

1. **维护成本**：真正重复的只有“数据 + 语义 + 文案 + 校验规则”，不是 UI。把它们生成成 spec 后，美术/台词/帧/同意文本更新只需重跑生成器；插件侧只有 spec 版本 bump + 重新 vendored（可脚本化）。
2. **发布节奏**：spec 与两个产品解耦。famling 可以继续按 Tauri/Windows/法务节奏发；dsh-famling 可以因为 DSH API 变化单独发 0.7.6/0.8.0（交接记录：0.7.3 到 0.7.5 一天内多次），互不阻塞。
3. **公开导出边界**：spec 只包含可公开的角色/语义/资产清单/同意文本版本，没有私有路径、私有游戏、未清权音频；它本身就能放进公开 famling 仓（或公开 spec 包），符合“公开仓 pet-only”的硬约束。
4. **许可证**：spec 数据沿用 CC BY-NC-SA 4.0、生成器/校验代码沿用 PolyForm NC 1.0.0，与两仓现有许可一致；不引入 MIT/Apache 代码，不需要重写 NOTICE。
5. **版本漂移**：把“同一个汀岚”的语义（动作、气泡、台词、同意口径）锁在 spec 里；UI 外观允许不同（Tauri 480×336 桌面壳 vs DSH 72px footer），但“她说什么/怎么表现/需要什么同意”同源。
6. **DSH API 稳定性**：spec 与 DSH 无关；DSH 适配层的漂移被限制在 `src/host/dsh.js` 一个文件 + `HOST_BASELINE` 常量（§3.16、§4.8），DSH 升级时只动适配层，不动角色数据。

**C 的代价（诚实列出）**：

- 需要一个生成器 + 一个校验脚本 + 一个 vendored `spec/` 目录；短期比“直接再抄一遍”多 2-3 天工作量。
- spec 的 MAJOR 变更需要双端实现窗口（standalone runtime + 插件 adapter），不能像现在这样只改一边。
- npm 发布被 OTP 阻塞时，spec 包只能以 tarball/git vendor 分发；跨仓校验只能靠 LOCK，无法靠 registry 解析（可接受，见 §4.7）。

### 2.5 为什么不采纳 B / D / E / F

- **B 共享运行时 core 包**：两端的 UI/渲染/构建根本不同（standalone = Vite + 原生 DOM + Tauri IPC；插件 = DSH 冻结模块表里的 CJS factory + React slot + 只允许同源 `/api` 取数据）。共享 UI 不可行；共享纯逻辑（校验/状态机）虽可行，但一旦成包就要维护双构建/双依赖/双许可，且会诱导“插件依赖私有包”。**可共享的纯逻辑收敛进 spec 包的 `validate.js`，已覆盖 C 的需求，不需要一个通用 core。**
- **D 单仓合并**：公开 famling 是 pet-only 导出（无测试/脚本/游戏基座），dsh-famling 是 DSH bundle（要有 `dsh.client`、`cordis.patch.yml`、React slot、`engines.dsh`）。合并后要么公开仓引入 DSH 开发依赖，要么私有仓承担 npm 发布；两者都破坏当前边界。且两者的“版本语义”不同（桌面应用 0.1.0 对用户承诺 vs 插件 0.7.x 对 DSH 兼容），合并后版本号会被迫同时表达两件事。
- **E 插件自养副本**：短期最省事，长期必然漂移（现在已经有三处文案/两个 brief 校验）；角色是同一 IP，双份维护还会带来署名/许可/NOTICE 双份义务。
- **F 内嵌运行**：Tauri/WebView2 与 DSH Web 不同 carrier；iframe 没有 DSH theme/locale/权限模型；会重复 Key/存储/更新；插件分发/安装无法覆盖 Tauri 安装包。产品分层（native arch §6）已否决，本文维持。

### 2.6 过渡：A 到 C 的最小动作

1. 冻结“共享面清单”（§4.5）并写成 face spec 0.1 草案（私有仓 `docs/design/` 与公开仓 `spec/`）。
2. 在私有仓写生成器 + `--check`；公开仓加 `spec/` 镜像；插件加 `spec/` vendored + `LOCK.json`。
3. 插件先把“读取 spec 失败”当启动错误（fail loudly），再逐项迁移消费点（动作/帧/同意/气泡/AI 声明）。
4. 完成一轮 famling 小更新（例如加一个互动动作）作为端到端演练：生成 → diff → 插件零代码/一行配置 → 验收。

---

## 3. 能力契约清单

### 3.0 版本号图例、共享原则与支持级别

**版本轴（互不替代）**

| 轴 | 标识 | 当前值 | 谁定义 | 何时 bump |
|---|---|---|---|---|
| V-FCI | 角色契约 `famling.character.apiVersion` + pack `formatVersion` | 0.1/0.2 出厂；0.3 预览；pack v2 | 私有仓角色层 | 角色数据字段/语义 breaking |
| V-FACE | 宿主表现契约 `famling.face` SemVer | **建议从 1.0.0 起**（首次冻结；可先标 1.0.0-rc） | 私有仓 spec 源 + 生成器 | 见 §4.3 |
| V-WIRE | bridge 请求 `v` + `spec`/`specVersion` | `v:1`（现有 5 op）；目标加 `hello` | dsh-famling Host | client/host 线协议 breaking |
| V-BRIEF | Pet Brief `schemaVersion` | 2（接受 1 legacy；未来版本 fail-closed） | Advisers（外部） | 数据契约 breaking |
| V-TERMS | 同意/条款版本 + sha256 | TOS 2026-11-17.6、TTS 2026-11-17.4、ASR 2026-11-17.3、ROLEPLAY 2026-11-17.4 | 私有仓 `terms.ts` | 文本/语义变更（必须重确认） |
| V-DSH | DSH baseline + `engines.dsh` | DSH 0.2.2-rc.4；插件 `engines.dsh: >=0.2.1-rc.5 <0.3.0` | DSH 上游 + 插件 | DSH API 变化 / 插件最低基线变化 |

**支持级别**（每项能力必须落在其中之一，且必须被测试）：

| 级别 | 含义 | 行为 |
|---|---|---|
| `host` | DSH 宿主原生能力 | 直接用宿主 API，不复制 |
| `browser` | 浏览器原生能力 | 由插件前端调用；需独立同意/告知 |
| `local` | 本机文件/进程能力 | 只读文件或本机服务；需路径/大小/隐私约束 |
| `degraded` | 能力存在但弱化 | 明确告知用户“当前只能做到 X” |
| `off` | 未实现 | 按钮禁用/不显示；**诚实报错，不伪造** |
| `standalone-only` | 只有独立版有 | 插件不声明该能力；文档/UI 不暗示 |

**总原则**：

- 任何能力都必须有**降级行为**与**版本号**；没有降级路径的能力不允许默认开启。
- 插件不得把“浏览器能跑”当成“宿主能跑”；不得把“私有版能跑”当成“公开版能跑”。
- 所有跨端语义以 spec 为准；UI 文案可以各自本地化，但语义字符串（气泡类型、动作名、同意要求、AI 声明）必须来自 spec。

### 3.1 LLM 对话

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | `ctx.llm.stream(GenerateOptions)`（`DSH/packages/llm/llm/src/index.ts:206`；请求形状 `src/types.ts:564-606`：provider/model/reasoningEffort/messages/system/tools/maxTokens/stop/signal/purpose）。模型由 `ctx.get("agentDefaultModel").currentSelection()` 读 DSH 默认模型（`DSH/packages/core/agent-default-model/src/index.ts:68`）；Key 只由 adapter 在每次请求解析（credentials seam），**不进浏览器**。这是辅助调用，不自动写 Session log。 |
| 独立版实现 | **无自由 LLM chat**（TOS/代码口径：不提供自由 LLM 对话、不伪造聊天引擎）；公开版 composer 只做本地回应/本地提醒草稿（交接 §12 实测）；私有版有安全分类层，不是对话产品。 |
| dsh-famling 现状 | `op:"chat"` 调用 `ctx.llm.stream`；system prompt 写死；`maxTokens:300`；25s 超时；provider/model 不写死；无费用/数据告知。 |
| 降级行为 | 无模型/无 provider/超时/空回复 → 503 `E_LLM`，气泡显示“暂时连不上/没想好”，**不伪造回复、不换写死模型**。 |
| 版本号 | 能力 id `llm.chat`；V-FACE >=1.0；V-DSH 基线 0.2.2-rc.4（已验证）；provider/model 由 DSH 决定，插件不声明具体模型版本。 |
| 产品边界 | 桌宠短对话是**非回放的辅助输出**：不写主 Session、不可回放、无工具；在 README/DETAIL/设置中明示。需要可回放/带工具 → 走 3.2。 |

### 3.2 会话 / 工具（任务型）

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | 合法通道按风险从低到高：① `ctx.schedule.create` + target 为 `new_once`/`new`：到点由宿主创建/复用 Session 并投递 prompt，该 Session 拥有正常 DSH 工具/权限（已实现，推荐默认）；② `ctx.agents`（core，`agents.create`/`resume`）+ `agent.followup()` + `agent.whenIdle()` + `ctx.sessions.flush()`：即时任务型会话，**第一方 headless 用法**，第三方插件未文档化（unverified，需 spike + 产品拍板）；③ Session command：需活跃 session，footer slot 没有 sessionId，不适用。 |
| 独立版实现 | 无 agent；重任务交给 Advisers capture pending（用户确认，不直写账本）；本地只做草稿/确认/只读 brief。 |
| dsh-famling 现状 | 只有 ① 的一次性绝对时间提醒；无即时任务、无工具调用、无自然语言解析。 |
| 降级行为 | schedule 不可用 → 隐藏提醒入口；agents 不可用 → 不提供即时任务；**绝不静默新建 Session**；每次创建提醒必须用户显式确认（当前 UI 是表单，符合）。 |
| 版本号 | 能力 id `schedule.at`（已实现）/`llm.session.task`（可选，默认 off）；V-DSH 基线同上；写入 Session 的路径按 DSH session 语义（会出现在会话列表/日志，正常）。 |
| 日志语义 | 走 ② / schedule 投递的内容进入 **DSH Session log（model-visible，可回放）**；走 3.1 的辅助聊天不进入。两者不可混称为“桌宠聊天”。 |

### 3.3 TTS

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | **DSH 0.2.2-rc.4 没有 TTS 服务**（源码/文档核对：`DSH/packages/experimental/speech-to-text/README.md:70` 明写 “speech synthesis have no service methods”；`packages/**` 无 TTS 包）。可选替代：浏览器 `speechSynthesis`（插件当前用法）；未来若做 `tts.host`，必须是自建 Host 路由 + `ctx.credentials` 现取 key + 独立计费/同意，不是 DSH 能力。 |
| 独立版实现 | `VoiceService` provider 链：system → baked → DeepSeek cloud（Tauri Rust 代理）→ mock；预算/缓存/大小/限流/字幕；baked 42 WAV（stella/tide 各 21，私有限定）；clone = 明确 unsupported。公开导出无 baked、无 `voice_synthesize` 命令 → 实际只剩 system/mock。 |
| dsh-famling 现状 | 浏览器 `speechSynthesis`，默认关，TTS 独立同意（无版本）。 |
| 降级行为 | 无可用 provider / 用户未同意 → 静音，但**字幕/气泡照常**；错误只报分类码，不朗读错误详情。 |
| 版本号 | 能力 id `tts.system`（browser）/`tts.baked`（standalone-only 直到权利 A-04 签字）/`tts.host`（未实现）；V-FACE `tts` 块；V-TERMS TTS 2026-11-17.4；音频权利：42 WAV 服务商再分发许可仍 TBD（A-04 BLANK）。 |
| 硬约束 | 插件不随包分发 baked WAV 或 DeepSeek 输出；不伪造 stella/tide；不宣传克隆（官方无公开 clone API）。 |

### 3.4 ASR

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | `ctx.speechToText`（experimental seam；`DSH/packages/experimental/speech-to-text/src/index.ts:48`；`resolve(request)` + `transcribe(spec, signal)`，输入完整录音 WAV 16k mono PCM16，返回 `Transcript{text,audioSeconds,inferenceSeconds}`）。浏览器侧 Remote 由可选 bundle `voice-input-bundle` 提供（默认未启用；当前 profile 未装 → Host 无此服务）。第三方插件不能自建 Remote，但 Host 可在 `/api/famling/bridge` 内代理 `ctx.speechToText`（前置：用户启用 bundle + 本机 SenseVoice 模型）。 |
| 独立版实现 | `src/voice/asr.ts` + 录音/采样 + 独立 ASR 同意；实际模型/平台可用性未在本文验证。 |
| dsh-famling 现状 | 浏览器 `SpeechRecognition` / `webkitSpeechRecognition`，音频可能去浏览器厂商；独立同意；只回填可编辑文本，不自动发送。 |
| 降级行为 | 浏览器不支持 → 麦克风按钮禁用 + 文案；host ASR 不可用 → 不冒充本地识别；用户拒绝 → 保留文字输入。 |
| 版本号 | 能力 id `asr.browser`（已实现）/`asr.host`（未实现，需 bundle）；V-TERMS ASR 2026-11-17.3；V-DSH experimental，rc 期内 API 可能变（WIRE 层需隔离）。 |

### 3.5 Advisers 简报（只读）

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | DSH 不提供 Advisers 服务；契约是**固定路径本地文件**：`$ADVISERS_HOME/pet-brief.json`（未设则 `USERPROFILE/.advisers` 或 `HOME/.advisers`），由 `advisers pet-brief --out` 原子写（0600），TTL 5min，128 KiB 上限，closed schema，`schemaVersion 2`（接受 1 legacy），`displayPolicy: public/private/none`，未来版本 fail-closed。`pet-brief` 是 Advisers TOS 受门控命令（未同意 exit 3 `E_TOS_REQUIRED`）；**Host 不得代传 `--accept-tos`**。本机核对生产者文件在 `/home/yy/.advisers/pet-brief.json`（548 B，10:43）。 |
| 独立版实现 | Tauri `read_advisers_brief`（固定路径/128 KiB/只读/无写）→ `src/presence/pet-brief.ts`（TTL/closed schema/claims/displayPolicy/未知版本拒绝）→ `src/pet/advisers/face.ts`（超时/去重/退避/错误脱敏/私密面板 30s/失焦清空/consent 前置）。 |
| dsh-famling 现状 | 读同一文件，弱校验（大小/schemaVersion 1-2/none 拒绝），投影 counts/today(≤3)/commitments(≤3)，显式按钮触发；无 TTL、无 closed schema、无 consent 前置、无超时/退避、不代传 TOS。 |
| 降级行为 | 文件不存在/非法/过期/未知版本 → `E_MEMORY`（不展示）并退回普通桌宠；`displayPolicy:none` → 整块不显示且丢弃已保留投影；`private` 默认；不展示 `suggestedLines/evidence`。 |
| 版本号 | V-BRIEF schemaVersion 2（legacy 1）；契约文档 v0.2（`DG/docs/integration/ADVISERS-CONTRACT.md`）；**consumer-first**（先升消费端再让 producer 输出新 major）。 |
| 共享建议 | 校验逻辑（TTL/closed schema/displayPolicy/投影裁剪）应进 spec 包的纯函数 `validateBrief()`，两 adapter 共用（§4.2），消灭 §1.6 的漂移。 |

---

### 3.6 记忆 / 档案

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | **DSH 无 core memory 服务**（`packages/**` 无 `ctx.memory`；记忆事实源 = append-only Session log + 外部 Advisers 账本）。插件不得自建记忆 DB/向量库。Session log 是 model-visible 事实，可回放；不进入 Session 的辅助数据由各插件自担。 |
| 独立版实现 | 本地加密存档 `pet.json`（Windows DPAPI / 浏览器 AES-GCM，key 不可导出）；口令备份（PBKDF2 600k + AES-GCM）；折页簿（改/忘/忘掉全部/导出）；chat-import；无云记忆。 |
| dsh-famling 现状 | 无持久化；仅设置 localStorage；点击计数不持久。 |
| 降级行为 | 无记忆 → 明确“每次对话从头开始”，不展示“记忆”假象；brief 只是**工作摘要投影**，不是宠物记忆。 |
| 版本号 | 能力 id `memory.brief`（只读投影）/`memory.archive`（standalone-only）；禁止 `memory.write` 到 Advisers（v0 明确不做）；若未来做写入，必须另立契约 + 用户确认（ADR）。 |

### 3.7 角色 / 动画规格

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | DSH 不管角色；提供 slot/theme token/locale 与包图片资源路由（`/plugins/<pkg>/assets/*` 只服务图片；`require.asset` 需构建链）。插件可用的 UI 位置：`sidebar.footer.action`（list/root，owner props `{wide}`，replacement risk none）等。 |
| 独立版实现 | FCI（`famling.character` apiVersion 0.1/0.2 出厂、0.3 预览）+ pack manifest v2（canvas/anchor/footBox/bbox/palette/tags{frames,fps,loop,holdMs,phase}）+ render 抽象 + 128/256 画布策略 + 命中区。`public/characters/tinglan/character.json` 已是 FCI 0.3（capabilities/sockets 等）。并行 task-3 新增 `famling.pet-anim/0.1` 包契约（`src/pet/anim/manifest.ts`）：每帧 hold/layer/priority/FPS band/track/bubble policy，并保持 hero pack 兼容（同一 JSON 可被 `hero.ts loadCharacterPack()` 加载）。 |
| dsh-famling 现状 | 30 张 base64 帧 + 手写 SEQ（动作名/帧数/时长）；不读 FCI/pack manifest；尺寸固定 72px。 |
| 降级行为 | 缺帧/缺 pack → 单帧静态头像 + 关帧动画开关；动画偏好关闭 → 静态；不因美术缺失阻塞插件加载。 |
| 版本号 | V-FCI（角色数据）+ V-FACE（动作/帧清单 + action 到 clip/tag 映射）；**动画权威 = `famling.pet-anim/0.1` 包（含 hero 兼容字段 + `anim` 块）**，face spec 只引用 pack id + 资产清单 sha256 + action 到 clip 映射，不重复描述 fps/hold（避免二次真相源）。 |
| 迁移建议 | 插件 P3 改为“从 spec/宿主帧路由取图 + 从 manifest 读 fps”，不再内嵌 base64；详见 §5.4。 |

### 3.8 气泡语义

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | 无；由插件在 slot 内渲染（当前用 fixed 定位 + `pointer-events` 分层，不遮挡人物/不铺满侧栏）。 |
| 独立版实现 | `pet.html` 气泡 + `shell-layout.ts`（居中人物上方 8px/菜单贴宠物右下 +6px）；speech/thought；猫狗心理活动用 thought 虚线；固定模板优先（brief 不使用 suggestedLines）；8s/私密失败 30s（产品设计稿）。 |
| dsh-famling 现状 | `bubbleKind: speech/thought`；thought 虚线；3.2s 自动消失；Host 回复与本地互动台词共用。 |
| 语义规则（建议写进 face spec 的 `bubbles` 块） | ① humanoid = speech（可配 TTS）；cat/dog = thought（不朗读）；② 模型自由文本只进 `reply`，客户端 `textContent` 渲染（禁 HTML/链接/图片）；③ 气泡不重复人物图、不放外链、不常驻 TOS；④ 宽度自适应、不遮挡人物；⑤ 私密（brief private）与失败态延长/自动隐藏；⑥ 最大字符/行数由 spec 给上限。 |
| 降级行为 | 气泡开关关闭 → 不显示；宿主回复超长 → 截断/省略号（footer 无展开面板）；渲染失败 → 显示错误码文本。 |
| 版本号 | V-FACE `bubbles` 块；**语义变更属 MAJOR**（客户端/测试必须一起改）。 |

### 3.9 同意 / 年龄门

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | DSH 没有 age gate / 内容平台审核；插件适用人群、同意文本、费用与数据告知由插件自担（DSH 只提供安装/启停/权限）。 |
| 独立版实现 | 首启完整 TOS + 版本/哈希变更重确认；每次修改/导入/DLC 重弹；TTS/ASR 独立同意（内存 + 会话/配置签名）；roleplay 18+（自报生日，fail-closed，不收集证件/照片/地址）；2h 健康提醒；审计只写不读、不豁免。 |
| dsh-famling 现状 | 仅 TTS/ASR 两段独立同意，存 localStorage 布尔（`dsh-famling/consent/v1`），无版本/hash/撤回；无 age gate；全年龄；无 roleplay。 |
| 契约规则 | ① 插件声明 scope = all-ages，不提供 roleplay/情感陪伴；② LLM 首次使用前必须告知“会计费/内容发给模型提供方”（新增，P4）；③ TTS/ASR 同意升级为 v2：版本+hash+可撤回+文本变更强制重确认；④ 不要求年龄（因为不提供 18+ 功能）；⑤ 若未来加 18+：必须复用独立版 age gate + 隐藏入口 + 法务评审，不得自造。 |
| 降级行为 | 拒绝同意 → 该能力关闭，本地互动/气泡不受影响；文本更新 → 重新确认一次，不阻塞其他功能。 |
| 版本号 | V-TERMS：TOS 2026-11-17.6、TTS 2026-11-17.4、ASR 2026-11-17.3、ROLEPLAY 2026-11-17.4（插件只引用 TTS/ASR + AI notice，不引用 roleplay 文本）；AI 声明版本随 face spec。 |

### 3.10 调度（提醒）

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | core `ctx.schedule`（`DSH/packages/schedule/schedule/src/index.ts`）：`create({title≤120, prompt, timing, target})`，timing 支持 `at/after/every/daily/weekly/cron/rrule`，target 支持 `session/new_once/new`（`new_once` 首次投递创建 Session）；`list/view/edit/run/delete`；宿主持久化、跨会话，投递进目标 Session inbox；`new_once`/`new` 会创建正常 DSH 会话（含工具）。 |
| 独立版实现 | 无系统级调度；只在本地提醒动画/气泡；重提醒交给 Advisers；不自己实现定时器（避免第二套调度）。 |
| dsh-famling 现状 | `op:"task"` 仅绝对时间 + `new_once`；`op:"task-delete"` 可删；无 list UI、无自然语言解析、无重复提醒。 |
| 降级行为 | schedule 不可用 → 隐藏“提醒”入口/如实报错；**绝不用本地 setTimeout 假装系统提醒**；创建前必须用户显式确认时间/文本。 |
| 版本号 | 能力 id `schedule.at`（已实现）/`schedule.recurring`（未实现，P6 可选）；V-DSH baseline；提醒文本上限 200 字符（当前实现），标题 120。 |
| 隐私 | 提醒 prompt 写入 DSH 持久化（用户可在 DSH 任务列表看到/删除）；不写 Advisers；不在插件日志记录原文。 |

---

### 3.11 日志 / 隐私

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | `ctx.logger`（Cordis）写宿主日志；Session log 仅 agent/工具路径；owner-only 路由 + 同源 Cookie；插件拿不到前端 Key；HMR/插件事件可观测。 |
| 独立版实现 | 本地 ring buffer（50 条，无网络）+ 用户手动导出；Sentry 默认关、无 DSN；consent 审计仅 localStorage 100 条（只写不读、不豁免）；错误信息脱敏路径。 |
| dsh-famling 现状 | 无日志/无审计；错误码返回但不记录；浏览器 console 无业务日志。 |
| 数据分类（建议写进 face spec `privacy` 块 + README 表） | ① chat 文本：发送给模型 provider，插件不落盘、不进 Session、不写日志；② brief：本地文件读取，内存投影，不落盘/不写日志/响应后丢弃；③ 提醒 prompt：DSH 持久化（用户可见/可删）；④ TTS/ASR 文本/音频：按 provider（浏览器系统/厂商），插件不存；⑤ 同意状态：localStorage（v2 带版本/hash）；⑥ 设置：localStorage（非敏感）；⑦ 日志：仅 `op/outcome/code/chars/ms`，**无原文/无回复/无音频**。 |
| 降级行为 | 日志不可用 → 记录静默失败，不影响请求；用户清除站点数据 → 同意/设置重置（重新询问，不崩溃）。 |
| 版本号 | 能力 id `log.audit`（新增）；隐私文案版本随 V-TERMS；DSH 侧日志格式不属于稳定契约。 |

### 3.12 设置 / 配置同步

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | 插件 Config（Host 侧 Schemastery schema）+ top-level `Volatile` 字段 → 浏览器 face 的 `apply(ctx, SyncedConfig<Config>)`（`DSH/packages/client/config/README.md`；`DSH/packages/client/modules/README.md` 的 Synced plugin configuration 节）；用户 patch 层可覆盖；`ctx.config.resolveConfigByPackage()` 只读他人配置。 |
| 独立版实现 | localStorage 设置 + Tauri/存档；无云同步。 |
| dsh-famling 现状 | UI 偏好（sound/motion/bubble）存 localStorage；Host 侧只有 provider/model/reasoningEffort patch config（手写校验）；client 未接收 synced config；`client.js` 用 `navigator.language` 而非 DSH locale 服务。 |
| 建议 | 短期：UI 偏好继续 localStorage（非敏感、无需跨设备）；**策略类**（enableLlm/enableTts/enableAsr/provider/model/限流/功能开关）走 Host Config；synced config 作为 P1 spike（需要 Config schema + 可能的 `@deepseek-ai/schemastery` peer 依赖，**unverified** 在 link 插件下能否解析）。 |
| 降级行为 | 读不到配置 → 用默认；配置非法 → 加载报错（当前半配置已在加载时报错，保持）；模型缺失 → `E_LLM`。 |
| 版本号 | 能力 id `config.synced`（可选）；face spec 定义 settings key/默认值/范围；DSH 同步机制版本随 DSH。 |

### 3.13 分发 / 更新 / 插件生命周期

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | bundle package：`dsh.bundle.patch` + profile `dsh.profile.bundles` + `dsh plugin add/remove`（pnpm；link/git/npm/tarball）+ plugin market index（可选）+ `engines.dsh` 安装/启动门禁 + git 安装 prepare/allowBuilds + client HMR（客户端 bundle 变更刷新页面；Host 变更重启）+ 页面 release gating（Host 版本变化需 reload）。 |
| 独立版实现 | Tauri CI artifact（unsigned MSI/NSIS/exe）+ 用户手动安装/重装；npm 未发版；无自动更新器。 |
| dsh-famling 现状 | 0.7.5；无 npm；本地目录无 `.git`；靠拷贝同步；安装态在 profile 重装/升级流程中多次丢失（已知故障模式）。 |
| 规则 | ① dsh-famling 独立 SemVer，发布节奏跟 DSH baseline 而非 famling；② 每次发版更新 `COMPAT.md`（DSH 版本/spec 版本/已验证项）；③ 安装态丢失：文档化恢复步骤（`dsh plugin --profile web remove/add link:` 后重启），不自动修改 profile；④ 不新增自建更新器/插件商店。 |
| 降级行为 | engines 不满足 → DSH 拒绝安装/启动（插件无法自救）；未知 DSH 版本 → 允许运行但明确“未验证”，关键 op 失败返回 `E_UNAVAILABLE` 而非崩溃。 |
| 版本号 | 插件 semver + `engines.dsh`（建议收紧为 `>=0.2.2-rc.4 <0.3.0` 前先跑矩阵，地板=已验证版本）+ `HOST_BASELINE` 常量；spec 版本声明在 `package.json` 自定义字段 `famlingSpec`（或 `spec/LOCK.json`）。 |

### 3.14 内容安全 / AI 标识

| 项 | 内容 |
|---|---|
| DSH 宿主实现 | 无内容审核服务（tool 的 approval/sandbox 是执行安全，不是内容安全）；插件自担输出与披露。 |
| 独立版实现 | `src/pet/safety/**`（分类/消毒/门/本地规则）、AI 标识（首启/About/TTS/结果）、roleplay 隐藏、健康提醒；法律文档 34 篇仍 DRAFT、`legal-check` WARN-ONLY、`--strict` BLOCKED。 |
| dsh-famling 现状 | 两处 AI 声明（输入/设置）；system prompt 含“不冒充/不诱导依赖/不未成年人情感关系”句；无内容过滤、无测试锁定。 |
| 规则 | ① face spec 存 AI 声明文案 + 版本（单一来源，客户端不再写两份）；② 至少输入面板 + 设置面板展示，字数/位置按 DSH 小部件约束；③ 不宣称官方/真人/专业建议；④ roleplay 不宣传；⑤ 输出 textContent 渲染、限制长度；⑥ 法律文案与 task-2 结论对齐（task-2 产出 legal 文档后回写 spec）。 |
| 降级行为 | 文案缺失 → 不显示 AI 声明会阻塞发版（CI 检查为空即失败）；不是运行时降级项。 |
| 版本号 | V-TERMS + AI notice 版本；与 task-2 的 `docs/legal/ADVISERS-EXTERNAL-PERSONA-2026-11-18.md` 对接。 |

### 3.15 能力协商矩阵

| capability id | face 版本 | standalone | dsh-famling 现状 | dsh-famling 目标 | 降级 |
|---|---|---|---|---|---|
| `llm.chat` | 1.0 | off | host（已实现） | host + 费用/数据告知 | 503 `E_LLM` |
| `llm.session.task` | 1.0 | off | off | off（P5 期权，默认 off） | 不做 |
| `schedule.at` | 1.0 | off | host（已实现） | host + list UI | 隐藏入口 |
| `schedule.recurring` | 1.1（计划） | off | off | 可选 | 只做 at |
| `tts.system` | 1.0 | local（system provider） | browser（已实现） | browser + consent v2 | 静音保字幕 |
| `tts.baked` | 1.0 | local（私有 42 WAV） | off | **off**（不随包分发） | off |
| `tts.host` | 1.x（未定） | off | off | off（除非 DSH 出现 TTS） | off |
| `asr.browser` | 1.0 | local（录音/样本） | browser（已实现） | browser + consent v2 | 麦克风禁用 |
| `asr.host` | 1.1（计划） | off | off | 可选（需用户启 voice-input） | 不做 |
| `memory.brief` | 1.0 | local（严格） | local（弱） | local（共用 validateBrief） | `E_MEMORY`/不显示 |
| `memory.archive` | 1.0 | local | off | off | 不做 |
| `character.frames` | 1.0 | local（FCI/pack v2） | embedded（30 帧） | local（宿主帧路由 + manifest） | 静态头像 |
| `character.actions` | 1.0 | local（FCI rules） | hardcoded（4 动作） | spec actions 驱动 | 只保留 idle |
| `bubble.speech` | 1.0 | local | browser（已实现） | browser + spec 上限 | 关闭气泡 |
| `bubble.thought` | 1.0 | local（猫狗） | browser（已实现，brief 用） | browser | 关气泡 |
| `consent.tts` / `consent.asr` | 1.0 | local（版本+hash） | browser（布尔） | browser v2（版本+hash+撤回） | 关能力 |
| `consent.age` | n/a | local（roleplay 18+） | **off（全年龄）** | off | 不提供 |
| `config.synced` | 1.x | n/a | off | P1 spike | localStorage |
| `log.audit` | 1.0 | local | off | host（无原文） | 静默 |
| `ui.slot.footer` | n/a | n/a | host（已实现） | host | 不显示 |

### 3.16 “用 DSH，不要自建”清单（dsh-famling 最大程度依托 DSH）

| 需求 | 不要做 | 直接用 DSH | 省掉 | 证据/路径 |
|---|---|---|---|---|
| LLM 对话 | 自建 DeepSeek client、Key 输入页、重试/代理 | `ctx.llm.stream` + profile 默认模型 | Key、计费、模型选择、重试 | `DSH/packages/llm/llm/src/index.ts:206`；`agent-default-model/src/index.ts:68` |
| 凭据 | Key 进 localStorage/插件配置 | `ctx.credentials.resolve`（Host only） | 泄露面/轮换 | `DSH/packages/credentials/credentials/src/index.ts` |
| 会话/工具 | 自建历史/工具循环 | ① schedule `new_once` 投递；② 可选 `ctx.agents`+`followup` | 分页/恢复/权限/审计 | `DSH/packages/schedule/schedule/src/index.ts`；`DSH/packages/bundle/headless/src/index.ts:320-447` |
| 提醒/调度 | setTimeout/自建 DB | `ctx.schedule` | 持久化/跨会话/列表 | 同上 |
| ASR | 自建语音服务/模型部署 | `ctx.speechToText`（可选 bundle） | 模型/采样/隐私 | `DSH/packages/experimental/speech-to-text/src/index.ts:48` |
| UI 位置/主题/locale | 自建窗口/iframe | slot `sidebar.footer.action` + `--dsw-*` token | 主题/缩放/无障碍/布局 | `DSH/packages/client/ui-sidebar/src/client/contract/slots.ts:75` |
| 认证 | 自建 token/登录 | exact `/api` 路由 owner-only + 同源 Cookie | 鉴权/CSRF 面 | `DSH/packages/client/connection/src/rpc.ts:146-168` |
| 插件安装/启停/升级 | 自建更新器/商店 | `dsh plugin add` + plugin manager + plugin market index + `engines.dsh` | 安装/回滚/兼容门禁 | `DSH/docs/user/develop/basic/publish.md`；`docs/user/guide/plugin-market.md` |
| 配置 | 自建设置页/存储 | Cordis Config + user patch 层；可选 synced Config | 保存/校验/覆盖 | `DSH/docs/user/develop/basic/config.md`；`packages/client/config/README.md` |
| Host 热更新 | 自建 reload | client HMR（页面刷新）+ Host restart 语义 | HMR/版本门 | `DSH/docs/subsystems/client-modules.md`；`packages/client/modules/README.md` |
| 日志 | 自建文件日志 | `ctx.logger`（无原文） | 轮转/宿主采集 | Cordis logger（`ctx.logger`） |

**DSH 没有、必须自建或外部**：TTS、角色/动画/气泡、同意/年龄门、Advisers 只读 brief（外部文件契约）、内容安全/AI 标识、独立版分发/更新、桌面壳（Tauri）。这张表划定了“薄 adapter”的边界。

---

## 4. 同步机制设计

### 4.1 契约分层（谁拥有什么）

| 层 | 名称 | 内容 | 生产者/所有者 | 消费者 | 版本轴 |
|---|---|---|---|---|---|
| L0 | 角色数据 FCI | `character.json`（id/type/canvas/anchor/footBox/palette/capabilities/sockets/voice 声明）、`behavior.json`（states/rules/ambient/speech）、pack manifest v2（tags/frames/fps/loop/holdMs） | 私有仓角色层（`DG/public/characters/**`、`DG/public/assets/pet/**`） | standalone runtime；dsh-famling 通过 L1 的资产清单间接消费 | V-FCI |
| L1 | 宿主表现契约 `famling.face` | 动作词表与默认动作、气泡语义与上限、台词库引用、同意要求 + 条款版本/hash、AI 声明、设置 key/默认值、能力 id/降级级别、隐私数据分类、资产清单（sha256） | 私有仓 `spec/face/**` + 生成器 | standalone adapter；dsh-famling adapter | V-FACE |
| L2 | 宿主适配层 | standalone：Tauri/桌面壳/热键/本地存储；dsh：slot/bridge/host 服务/localStorage | 各自产品仓 | 各自产品 | 产品 semver |
| L3 | 桥接 wire | `POST /api/famling/bridge` 请求/响应/错误码/限额/`hello` 能力协商 | dsh-famling Host | dsh-famling client | V-WIRE |
| L4 | 外部数据契约 | Pet Brief（`schemaVersion`）、Advisers TOS、terms 版本/hash | 外部（Advisers / 私有仓 terms.ts） | 两个 adapter | V-BRIEF / V-TERMS |

**依赖方向**：L2 → L1 → L0；L3 是 dsh 产品内部；L4 被 L1 引用版本号。**L1 不得 import 任何产品的运行时代码**（只引用版本与资产哈希）；standalone 与 dsh-famling 之间**不得互相 import**。

### 4.2 spec 数据模型（草案，可落地为 JSON）

**文件形态**（`spec/face/`，生成物，源在私有仓）：

```text
spec/face/
  VERSION                 # 1.0.0
  face.json               # 语义主文件（actions/bubbles/consent/aiNotice/settings/capabilities/privacy）
  face.schema.json        # JSON Schema（生成，用于 CI 与 IDE）
  actions.json            # action id / tag 映射 / 默认权重 / surfaces
  bubbles.json            # speech|thought 样式规则、时长、上限
  consent.json            # 能力 -> 同意要求、terms 版本/hash 引用
  ai-notice.json          # AI 声明文案（zh/en）+ 版本
  settings.json           # UI 设置 key/默认值/范围
  assets.manifest.json    # pack id + 每个帧文件的 sha256/尺寸 + 引用 famling.pet-anim/0.1 的 clip/fps/hold
  compat.json             # min/max spec、min DSH、brief schema 范围
  validate-brief.js       # 纯函数：Pet Brief 校验/投影（无平台 API、无依赖）
  index.js / index.d.ts   # 只读加载器（可选）
  CHANGELOG.md
```

**`face.json` 关键字段（草案）**：

```json
{
  "spec": "famling.face",
  "apiVersion": "1.0",
  "character": { "id": "famling.tinglan", "pack": "pet.tinglan.256.v2.anchor-final", "canvas": [256, 256], "anchor": { "x": 128, "y": 256, "mode": "foot-center" } },
  "actions": [
    { "id": "idle", "tag": "idle", "surface": "loop", "voice": false },
    { "id": "look", "tag": "idle", "surface": "dsh", "variant": "look", "voice": false },
    { "id": "pat", "tag": "pat", "surface": "both", "voice": true },
    { "id": "paper", "tag": "remind", "surface": "both", "voice": true },
    { "id": "fold", "tag": "drag", "surface": "both", "voice": false }
  ],
  "bubbles": { "kinds": ["speech", "thought"], "maxChars": 240, "maxLines": 3, "defaultMs": 3200, "privateMs": 30000 },
  "lines": { "source": "voice-lines", "profile": "famling.tinglan", "version": "0.1.0" },
  "consent": [
    { "capability": "tts.system", "required": true, "terms": "tts", "version": "2026-11-17.4" },
    { "capability": "asr.browser", "required": true, "terms": "asr", "version": "2026-11-17.3" },
    { "capability": "llm.chat", "required": true, "terms": "cost-notice", "version": "1.0" }
  ],
  "aiNotice": { "version": "1.0", "texts": { "zh": "角色与语音为 AI 生成/合成，不是真人；不提供自由 LLM 角色扮演或情感陪伴。", "en": "The character and voice are AI-generated, not a human; no free-form roleplay." } },
  "capabilities": { "llm.chat": "host", "tts.baked": "off", "memory.brief": "local", "consent.age": "off" },
  "privacy": { "chatText": "provider-only", "brief": "memory-only", "schedulePrompt": "host-persisted", "logs": "no-payload" },
  "hosts": { "dsh": { "wire": "1", "slot": "sidebar.footer.action", "minPlugin": "0.8.0" } }
}
```

**生成规则**：

- 源数据只来自可公开内容：FCI 文档、pack manifest、`voice-lines.json`、`terms.ts` 的版本/hash、动作表、AI 声明。**禁止**私有路径、游戏/DLC、研究文档、TTS WAV、客户数据、密钥。
- 每个资产写 sha256；`assets.manifest.json` 必须与公开仓实际文件一致（`gen-face-spec --check` 校验）。
- `validate-brief.js` 从 `DG/src/presence/pet-brief.ts` 的纯函数区抽取（TTL/closed schema/displayPolicy/投影），去掉 DOM/Tauri/存储依赖；两 adapter 共用。
- 生成器在私有仓：`DG/scripts/gen-face-spec.mjs`（`--out`、`--check`、`--diff`）；输出三份：`DG/dist/face-spec/**`、`PF/spec/**`（镜像）、供插件 vendored 的 tarball/目录。

### 4.3 版本规则与兼容窗口

**`famling.face` SemVer**（`apiVersion` 为 `MAJOR.MINOR`，`VERSION` 文件为完整 `MAJOR.MINOR.PATCH`）：

| 变更 | 版本 | 例子 | adapter 义务 |
|---|---|---|---|
| 数据-only | PATCH | 换帧 PNG、改台词文本、改默认时长常量（不改变语义类别）、翻译修正 | 零代码；重新 vendor/重新生成资产即可；CI 校验资产 sha256 |
| 增量 | MINOR | 新增 action、新增可选字段、新增 capability、新增 consent 描述、新增 settings key、新增语言 | 旧 adapter 必须忽略未知项并保持工作；新 adapter 支持当前 + 上一 MINOR；新能力必须显式 supported/degraded/off |
| 破坏 | MAJOR | 删除/重命名 action、改 bubble 语义、把可选字段变必填、改某能力的同意要求、FCI apiVersion 大版本、改资产路径语义 | 双端实现窗口：spec 先发布，standalone 与插件各自实现后再切默认；adapter 对未知 MAJOR **fail-closed**（不猜测） |

**兼容窗口**：插件声明 `famlingSpec: ">=1.0 <2.0"`；同时支持上一 MINOR 的“未知项忽略”；spec 1.x 内不允许删除字段（只能标记 `deprecated`，在下一 MAJOR 删）。

**wire 版本（L3）**：`v` 保持 `1`（不因 spec 变化而变）；新增 `hello` op 返回 `{v, spec, specVersion, capabilities, limits, host:{dshVersion, pluginVersion}}`。每条请求可带 `specVersion`，Host 在响应 `meta.specVersion` 回显；spec MAJOR 不匹配时 Host 返回 `E_SPEC`（附 supported 范围），client 退到最小集（本地互动 + 气泡）。

**fail-closed 与 display 降级分开**：

- **隐私/同意类未知**（未知 consent 要求、未知 privacy 分类）→ **关闭该能力**（不做猜测）。
- **展示类未知**（未知 bubble kind、未知 action surface）→ 降级为“纯文本 speech、无语音”，记录 warning，不阻塞其余功能。

**`compat.json`（机器可读，两仓 CI 都读）**：

```json
{
  "spec": { "min": "1.0", "max": "1.x" },
  "dsh": { "min": "0.2.2-rc.4", "max": "0.2.x" },
  "brief": [1, 2],
  "terms": { "tos": "2026-11-17.6", "tts": "2026-11-17.4", "asr": "2026-11-17.3" },
  "verified": [{ "spec": "1.0.0", "dsh": "0.2.2-rc.4", "plugin": "0.8.0" }]
}
```

### 4.4 famling 更新到同步动作的映射（核心答案）

> 问题原话：**famling 更新后，能否只同步“接口后的变更”？** 答案：能，但前提是先把“接口”定义成 spec，并让每次更新显式声明变更级别。下表就是同步决策表。

| # | famling 侧变更 | spec 变化 | dsh-famling 必须做什么 | CI 门（不加就失败） | 插件发版 |
|---|---|---|---|---|---|
| 1 | 换/加美术帧（同 action/clip） | PATCH `assets.manifest`（源自 `famling.pet-anim/0.1`） | 重新 vendor 资产清单；若走宿主帧路由则零代码 | 资产 sha256 与公开仓一致 | patch（可省） |
| 2 | 新增互动动作/动画 clip（如摇尾巴） | MINOR `actions` + anim clip | 若 `surface` 含 dsh：菜单自动多一项（client 读 spec）；否则忽略 | action 覆盖测试 + UI 快照 | minor |
| 3 | 删除/重命名动作 | MAJOR | 改 client 动作表/交互面板/测试 | golden 测试失败 | major |
| 4 | 改气泡语义/上限/时长 | MAJOR | 改 client 渲染/样式/测试 | bubble golden 测试 | major |
| 5 | 新增同意要求（如 LLM 费用告知） | MINOR `consent` | 实现同意 UI 或把该能力标 off | consent 覆盖测试（每个 required 必须实现或显式 off） | minor |
| 6 | AI 声明文案/版本变更 | PATCH/MINOR | 重新 vendor；客户端不再写两份 | 文案一致性测试（spec 为唯一来源） | patch |
| 7 | terms 版本 bump（TOS/TTS/ASR） | MINOR `consent`/`terms` | consent v2 重新询问逻辑生效 | terms 版本/hash 一致性 | minor |
| 8 | 角色 FCI apiVersion bump（如 0.3 到 0.4） | MAJOR | 更新角色校验/兼容窗口；旧角色包保持可跑 | FCI 兼容测试（旧包 + 新包） | major |
| 9 | 新能力（如 tts.host/asr.host） | MINOR `capabilities` | 可选实现；不实现必须声明 off | capability 覆盖测试 | minor/patch |
| 10 | 只改私有游戏/内部行为、未进入 spec | 无 | **不改** | `gen-face-spec --check` 无 diff | 无 |

**“接口后的变更”定义**：进入 L1（face spec）的是接口；没进入 L1 的私有改动（游戏基座、私有研究、内部重构、只影响 standalone 的 UI）对 dsh-famling **不可见**，不需要同步。反之，凡是用户能感知的角色语义变化，**必须**先进入 L1，否则不算“已同步”。

**演练用例**：把“新增一个 pat 变体动作”作为第一次端到端：改 FCI/素材 → spec MINOR → 公开镜像 → 插件 `actions` 自动出现（或菜单不出现但 action 可被点击）→ CI 全绿 → 插件发 minor。用这个用例验证工具链，而不是直接上大改。

---

### 4.5 共享 vs 适配器改动边界

**进入 spec（共享、famling 更新需要同步）**：

| 类别 | 具体内容 |
|---|---|
| 角色身份 | id、display name（zh/en）、type（humanoid/pet）、species、canvas/anchor/footBox/bbox、palette 引用 |
| 动画 | pack id、tag 列表、每个 tag 的帧数/fps/loop/holdMs、帧文件 sha256/尺寸 |
| 动作 | action id、对应 tag、默认权重/冷却、可否随机、`surface: both/dsh/standalone` |
| 气泡 | kind（speech/thought）、样式语义（实线/虚线）、默认/私密/失败时长、maxChars/maxLines、是否允许 TTS |
| 台词 | 固定模板台词库引用（版本/hash）；哪些事件用固定台词、哪些可由模型自由回复 |
| 同意 | 每个能力是否需要同意、terms 种类/版本/hash、是否可撤回、文案 key |
| AI 标识 | 声明文案（zh/en）+ 版本 + 展示位置要求（输入/设置/首启） |
| 能力 | capability id、支持级别（host/browser/local/degraded/off）、依赖的宿主能力 |
| 隐私 | 数据分类（chat/brief/schedulePrompt/consent/logs）与处理承诺 |
| 设置 | UI 设置 key、默认值、范围、是否策略类（Host Config） |

**留在适配器（不共享、各自实现）**：

| 类别 | standalone adapter | dsh-famling adapter |
|---|---|---|
| 窗口/布局 | 480×336 透明置顶、Tauri 窗口、托盘、点击穿透、热键 | `sidebar.footer.action` 内 72px、fit-content、气泡 fixed 定位、面板 300px |
| 输入 | 气泡内联 composer、全局热键（v2）、文件拖放、IME | footer 面板 textarea + 麦克风按钮 |
| 语音 | VoiceService provider 链、Tauri Rust 代理、baked/缓存/预算 | `speechSynthesis` / `SpeechRecognition`；未来可选 host ASR |
| 存储 | DPAPI/AES-GCM 存档、口令备份、折页簿 | localStorage 设置/同意（非敏感） |
| 网络 | 同源/云 API（仅私有版有 Rust 代理） | 只允许同源 `/api/famling/bridge` |
| 权限 | Tauri capabilities/窗口权限 | DSH owner-only 路由 + 同源 Cookie |
| 错误呈现 | 本地弹窗/设置页 | 气泡文本 + 错误码（不显示路径/原文） |
| 生命周期 | 安装/更新（exe/MSI）/首启 | DSH 插件安装/启停/HMR/页面刷新 |
| 游戏/任务 | 完整游戏基座、任务/结果三层（standalone 产品线） | 不做（§3.2 只有提醒 + 可选会话） |
| 年龄/roleplay | 完整 age gate + roleplay 隐藏 | 不提供（all-ages） |

**判断口诀**：改“用户感知到的角色语义” → spec；改“宿主如何呈现/执行/存储” → 适配器。拿不准时先问：这个改动如果只改 standalone，插件用户会不会看到不一致？会 → spec。

### 4.6 仓库与目录布局：三种候选 + 推荐

| 方案 | 描述 | 迁移成本 | 公开/私有边界 | 版本语义 | CI 可执行性 | 结论 |
|---|---|---|---|---|---|---|
| a. 现状手工拷贝 | 每改一次人工复制 | 0 | 靠人守 | 无 | 无 | 仅过渡 |
| b. **独立 `famling-spec` 包**（推荐） | spec 作为独立版本化包（先放公开 famling 仓 `spec/`，后期可拆独立仓/npm） | 低-中 | 清晰：生成物可公开 | 独立 SemVer + compat | 高（LOCK/sha256/JSON Schema） | **推荐** |
| c. pnpm workspace 单仓 | `apps/famling` + `plugins/dsh-famling` + `packages/spec` 同仓 | 高 | 差（公私有/许可混） | 各包独立但发布链耦合 | 中 | 不采纳（现在） |
| d. git submodule | `dsh-famling/spec` 指向 famling 仓 | 中 | 中（公开/私有仓混用） | 无（指针漂移） | 低（submodule 指针常忘更新） | 不采纳 |

**推荐布局（落地版）**：

```text
# 私有仓 DG/（源，角色/美术的生产地；不公开发布）
DG/spec/face/                 # 契约源数据（人工维护的少量 JSON + 生成规则）
DG/scripts/gen-face-spec.mjs  # 生成 + 校验 + diff
DG/scripts/export-public-pet.mjs  # 重写白名单（现在白名单已过期，见 §1.3/§5.0）
DG/dist/face-spec/**          # 生成产物（不进公开仓历史，可进构建缓存）

# 公开仓 PF/（镜像/发布点，生成物只读）
PF/spec/**                    # 与 DG/dist/face-spec 逐字节一致；CI 校验 VERSION/sha256
PF/scripts/check-spec.mjs     # 公开仓侧校验（无私有依赖）
PF/docs/FACE-SPEC.md          # 人类可读契约（生成 or 手写摘要）

# 插件仓 DF/（vendored 消费；git 化后 = PerryLink/dsh-famling）
DF/spec/**                    # vendored 副本（从 PF release/tarball 或本地路径同步）
DF/spec/LOCK.json             # {source, commit, specVersion, sha256{...}}
DF/scripts/sync-spec.mjs      # 从 tarball/公开仓/本地路径同步 + 校验
DF/scripts/check-spec-lock.mjs
DF/src/spec.js                # 读取/校验 face、暴露 actions/bubbles/consent/aiNotice
DF/src/host/dsh.js            # 唯一 DSH API 适配层
DF/src/host/capabilities.js   # probe -> 能力矩阵
DF/src/bridge/**              # route/ops/errors/audit
DF/client.js                  # UI（消费 src/spec 生成的数据或 hello 下发）
```

**为什么先不要把 spec 拆成第三个公开仓**：现在多一个仓就多一套 CI/许可/NOTICE/发布；公开 famling 仓已经有 CI、法务文件和大量 `docs/`。等 spec 真的需要独立版本节奏/独立 npm 包时，用 `git subtree split` 拆出即可，路径不变。

**分发形态（按可用性降级）**：① 公开仓 release asset `famling-spec-1.0.0.tgz` + sha256（现在就能做，绕开 npm OTP）；② npm `famling-spec`（用户确认 OTP 后）；③ 本地路径 `--from ../famling/spec`（开发期）。三者内容必须逐字节一致，LOCK 记录来源与 sha256。

### 4.7 发布与兼容策略

**三条发布列车**：

| 列车 | 版本示例 | 触发 | 门禁 |
|---|---|---|---|
| famling（独立应用） | 0.1.x | Tauri/法务/美术里程碑 | Windows build + CI artifact + legal-check + 人工安装验收 |
| famling-spec（契约） | 1.x.y | 任何进入 L1 的语义/资产变更 | schema + 公开安全扫描 + 资产 sha256 + changelog + 两 adapter 兼容声明 |
| dsh-famling（DSH 插件） | 0.8.x | DSH API 变化 / spec 升级 / 自身缺陷 | node --check + npm test + spec lock + capability coverage + engines + 人工 DSH 冒烟 |

**兼容声明**：dsh-famling 仓库根放 `COMPAT.md`（人与 CI 都读）：

```text
| 插件版本 | DSH 版本 | spec 版本 | 状态 | 证据 |
| 0.8.0 | 0.2.2-rc.4 | 1.0.0 | tested | fake-context + echo/brief 实机 |
| 0.8.0 | 0.2.2-rc.3 | 1.0.0 | untested | 不承诺 |
```

**发布纪律**：

- 每个插件 release 只声明已验证的 DSH 版本；`engines.dsh` 地板 = 已验证版本（当前建议 `>=0.2.2-rc.4 <0.3.0`，先跑一遍矩阵再收紧；不要凭记忆写 rc.3）。
- spec 与插件的版本独立：spec PATCH 不一定发插件；插件 patch 不一定改 spec。
- 任何公共文案/法务文本变更必须同时更新 `V-TERMS`/AI notice 版本，并触发重确认（独立版 + 插件各自实现，行为同源）。
- 公开导出：spec 生成/镜像前必须过 `publicSafe` 扫描（无 `/mnt/d`、`D:\`、`HANDOFF`、`.keys`、`WAV`、token 模式、私有研究名）；LICENSE/NOTICE 随 spec 一起带。
- 不声称“已清权/官方/已发布 npm”，除非有证据（当前 npm 未发版、42 WAV 权利 TBD、律师未复核）。

**弃用窗口**：MAJOR 发布后，双端至少保留 1 个 MINOR 周期的双版本读取（例如 spec 1.x adapter 能读 0.9 数据直到条件满足）；删除字段必须等 TTL/发布说明满足后再做，且单独评审。

### 4.8 CI 校验点（三仓）

| 仓库 | Job | 命令（示例） | 阻断? | 抓什么 |
|---|---|---|---|---|
| DG 私有 | spec 生成一致性 | `node scripts/gen-face-spec.mjs --check` | 是 | 生成物与源不一致、schema 非法、资产哈希漂移 |
| DG 私有 | 公开导出 dry-run + 扫描 | `node scripts/export-public-pet.mjs --check`（重写后） | 是 | 白名单遗漏、私有路径/密钥/WAV 混入 |
| DG 私有 | 既有质量门 | `npm run typecheck && npm test && npm run build` | 是 | 回归 |
| DG 私有 | 法务基线 | `node scripts/legal-check.mjs` | 否（WARN-ONLY；`--strict` 仍 BLOCKED） | 法务文本一致性 |
| PF 公开 | 构建 | `npm ci && npm run typecheck && npm run build` | 是 | 公开源码可构建 |
| PF 公开 | 角色/资产 | `node scripts/validate-character.mjs ... --strict` | 是 | FCI/pack 合法性 |
| PF 公开 | spec 镜像 | `node scripts/check-spec.mjs` | 是 | `spec/VERSION` 与生成清单/hashes 一致；无人手改 |
| PF 公开 | 边界扫描 | `node scripts/check-public-boundary.mjs` | 是 | WAV/私有路径/未清权声明 |
| PF 公开 | Tauri 打包（Windows runner） | 现有 workflow | 是 | MSI/NSIS 产物（unsigned） |
| DF 插件 | 语法 + 单测 | `node --check index.js && node --check client.js && npm test` | 是 | 语法/宿主逻辑 |
| DF 插件 | spec 锁 | `node scripts/check-spec-lock.mjs` | 是 | vendored spec 与 LOCK/`famlingSpec` 范围不一致 |
| DF 插件 | 能力覆盖 | `node scripts/check-capabilities.mjs` | 是 | spec 每个能力未实现且未声明 off → 失败 |
| DF 插件 | wire golden | `node --test test/wire-*.test.js` | 是 | 请求/响应/错误码与 spec 不一致 |
| DF 插件 | DSH surface baseline | `node --test test/dsh-surface.test.js` | 是 | 适配层假设的 host API 形状（录音 fixtures）与 baseline 不符 |
| DF 插件 | 无原文日志 | `node --test test/no-payload-log.test.js` | 是 | 日志/审计包含 chat/brief 原文即失败 |
| DF 插件 | 跨仓矩阵（定时） | `sync-spec --range min,latest && npm test` | 否（定时失败提醒） | spec 新版本导致兼容断裂 |

**CI 明确不能替代的**（必须人做）：真实 DSH Web 渲染/刷新、插件安装态、真实模型调用（费用）、Tauri 安装包在 Windows 的实机体验、律师/权利人结论。

### 4.9 同步 runbook（从 famling 合入到插件发布）

1. **famling PR 声明变更级别**：commit/PR 加 trailer `Face-Spec: none|data|additive|breaking`；没有声明的变更默认 `additive` 审查（宁可多审）。
2. **生成与审阅**：私有仓跑 `node scripts/gen-face-spec.mjs --diff`，产出 `spec-diff.json`（新增/删除/变更的 action、资产、文案、consent、能力）；人工审阅 diff。
3. **定版本**：按 §4.3 bump `VERSION`/`face.json apiVersion`，更新 `CHANGELOG.md`；breaking 必须先设计双端窗口。
4. **公开镜像**：生成 `PF/spec/**`，跑公开仓 CI（schema/资产/边界）；绿了才允许发布 spec release/tarball。
5. **插件同步**：`DF/scripts/sync-spec.mjs --from <tarball|PF/spec>`；更新 `spec/LOCK.json`；`node scripts/check-spec-lock.mjs`。
6. **实现与测试**：按 §4.4 决定是否需要改代码；跑 `npm test` + 能力覆盖 + wire golden；必要时补 fake-context 用例。
7. **发布插件**：bump 插件 semver；更新 `COMPAT.md`；按 DSH 安装流程 `remove → add link:`（若 link 安装）→ 重启/刷新；`plugin_manager list_plugins` 复核。
8. **实机冒烟**：刷新页面看 72px/气泡/面板；`op:"echo"` 200；`op:"brief"` 按 `displayPolicy` 展示/隐藏；不调用真实 LLM 除非用户批准费用。
9. **记录**：在交接/`status` 文档写清楚 spec 版本、DSH 版本、插件版本、验证项。
10. **回滚**：LOCK 指回上一 spec + 安装上一插件版本；data contract 不匹配时 fail-closed 到“不显示/降级”，不崩不猜。

**紧急热修（DSH API 断裂，与 spec 无关）**：只改 `DF/src/host/dsh.js` + `test/dsh-surface.test.js` + `engines.dsh`；跳过 spec 列车，直接插件 patch 发布；在 COMPAT 里标注“为 DSH x 紧急修复”。

---

## 5. dsh-famling 具体改造路线

> 约束：只改 `DF/`（插件）与 `DG/` 的 spec/生成器/导出脚本；**不改 `DG/pet.html`、`DG/src/pet/main.ts`、`DG/src/pet/hero-runtime.ts`、`DG/src/pet/pet.css`**（这些属于其他任务/产品线）。每个阶段都可独立回滚；P0 是其他阶段的硬前置。

### 5.0 目标态与前置修正

**目标态目录（DF）**：

```text
DF/
  package.json            # + famlingSpec 字段、files 包含 src/spec、scripts（check/test/sync）
  cordis.patch.yml        # 保持；插件 id/name 不变（升级不破坏已安装 link）
  index.js                # 瘦入口：name/inject/apply；只做注册
  client.js               # 页面 UI（由 src/client/** + scripts/build-client.mjs 生成，见 P1/P4）
  src/
    host/dsh.js           # 唯一 DSH API 适配层（llm/schedule/agents/agentDefaultModel/connection/logger）
    host/capabilities.js  # probe + 能力矩阵 + 降级级别
    host/config.js        # 手工配置校验（沿用当前风格，不引 schemastery）
    host/audit.js         # 无原文审计（ring buffer/logger）
    bridge/route.js       # 解析/限额/限流/method 分支/错误映射
    bridge/ops/{hello,echo,chat,brief,task,task-delete,asr?,frames?}.js
    bridge/{contract,errors}.js
    spec/                 # vendored face spec（P0）
    client/               # client 源：consent.js/ui-*.js/bubble.js（生成 client.js）
  scripts/{build-client.mjs,sync-spec.mjs,check-spec-lock.mjs,check-capabilities.mjs}
  test/{host-bridge,hello,brief,wire-*,capabilities,dsh-surface,no-payload-log,client-consent}.test.js
  test/fixtures/dsh-0.2.2.surface.json
  docs/{DETAIL.md,HOST-CAPABILITIES.md,COMPAT.md}
  .github/workflows/ci.yml   # 公开仓侧（vendored/clone 后）
```

**前置修正（P0 内一并做）**：

1. **`export-public-pet.mjs` 白名单过期**（§1.3）：现脚本按旧“角色子集”导出（只列 `src/pet/character|render|scene|advisers`、`src/presence`、`docs/legal` 等），而公开仓实际已导出整棵 `src/pet`（78 文件）与 `src/voice`（10 文件）、`public/assets`（260 文件）。必须改为“真实公开树清单 + 允许新增 + 禁止私有模式”，否则同步机制无法复现公开仓。
2. **插件 git 化**：`DF/` 目前无 `.git`、靠拷贝；建议把它换成 `PerryLink/dsh-famling` 的 clone（本地路径不变，profile link 不变），公开仓为唯一权威；私有 `desktop-games` 不再存插件副本（或只存指针）。
3. **文档单一权威**：桥接 wire 文档归 DF `docs/`；face 契约文档归 PF `spec/docs/`；私有 `DG/docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md` 改为指针/历史，不再维护第三份（§1.6 的三处两份问题）。

### 5.1 P0 契约冻结与 spec 锁定（2-3 天，硬前置）

**改动文件**：

| 文件 | 动作 | 说明 |
|---|---|---|
| `DG/spec/face/**.json` | 新增 | 从 FCI/pack manifest、`famling.pet-anim/0.1`（task-3）、terms、动作表抽取（§4.2 草案） |
| `DG/scripts/gen-face-spec.mjs` | 新增 | 生成 + `--check` + `--diff` + 资产 sha256 |
| `DG/scripts/export-public-pet.mjs` | 重写 | 真实白名单 + `publicSafe` 扫描 + spec 镜像 |
| `DG/dist/face-spec/**` | 生成 | 不进私有 git（或单独 tag） |
| `PF/spec/**` | 新增（生成） | 公开镜像；只读 |
| `PF/scripts/check-spec.mjs` | 新增 | 校验 VERSION/哈希/无手改 |
| `DF/spec/**` + `DF/spec/LOCK.json` | 新增（vendored） | 从 PF release/tarball 或本地路径同步 |
| `DF/scripts/{sync-spec,check-spec-lock}.mjs` | 新增 | 同步 + sha256 校验 |
| `DF/package.json` | 修改 | 加 `famlingSpec: ">=1.0 <2.0"`、`files` 加 `src/spec`、scripts 加 check/test |
| `DF/docs/HOST-CAPABILITIES.md` | 新增 | DSH baseline、每个 op 依赖的 host 服务、降级表 |

**验收命令**：

```bash
cd /mnt/d/Projects/dsh/desktop-games
node scripts/gen-face-spec.mjs --check           # exit 0；--diff 输出为空
node scripts/export-public-pet.mjs --check       # exit 0；无私有路径/密钥/WAV
cd /mnt/d/Projects/dsh/_scratch/famling-cleanup-2026-11-18 && npm run typecheck && npm run build
cd /mnt/d/Projects/dsh/plugins/dsh-famling
node scripts/check-spec-lock.mjs && node --check index.js client.js && npm test
```

**验收标准**：spec 生成可复现；公开镜像与生成物逐字节一致；插件能在 spec 缺失/版本不符时**启动失败并报错**（fail loudly），而不是静默退化；现有 UI 行为不变（人工对比）。

**回滚点**：spec 与 gen 脚本都是新增文件，删除/不引用即可；插件仍可跑旧 0.7.5。

### 5.2 P1 Host 能力层拆分（2-3 天，可与 P0 并行）

**改动文件**：

| 文件 | 动作 | 说明 |
|---|---|---|
| `DF/index.js` | 重写为瘦入口 | 保留 `name/inject/apply`；`inject` 只要求必需服务，其余用 `ctx.get`/`ctx.inject` 可选；路由注册移出 |
| `DF/src/host/dsh.js` | 新增 | 全部 DSH API 调用集中：`connection.fetch.register`、`llm.stream`、`agentDefaultModel.currentSelection`、`schedule.*`、`logger`、可选 `speechToText`、可选 `agents` |
| `DF/src/host/capabilities.js` | 新增 | 启动时 probe，输出 `{llm, schedule, defaultModel, speechToText, agents, configSynced}` 的 supported/absent |
| `DF/src/host/config.js` | 新增 | 迁移当前 `configSelection`；无配置合法；半配置加载报错 |
| `DF/src/host/audit.js` | 新增 | 只记 `op/outcome/code/chars/ms`；ring buffer + logger |
| `DF/test/dsh-surface.test.js` + `fixtures/dsh-0.2.2.surface.json` | 新增 | 记录 baseline 的 API 形状/返回类型；适配层改动必须更新 fixture |
| `DF/test/capabilities.test.js` | 新增 | fake ctx 各种缺失组合：不崩、降级正确 |

**关键设计**：

- `inject` 不再硬依赖 `llm`/`schedule`：缺 llm 时插件仍显示本地互动/设置；聊天 op 返回 `E_UNAVAILABLE`。
- 所有 host 调用失败都映射为稳定错误码（`E_LLM`/`E_TASK`/`E_MEMORY`/`E_UNAVAILABLE`/`E_SPEC`/`E_INPUT`/`E_CONSENT`），不把异常字符串透给前端。
- 记录 `HOST_BASELINE = { dsh: "0.2.2-rc.4", verified: [...] }`；README/COMPAT 引用同一常量（生成或手写一致，CI 校验）。

**验收命令**：`npm test`（新增 + 既有 11 项全过）；`grep` 校验：`DF/src/host/dsh.js` 之外不得出现 `ctx.llm`/`ctx.schedule`/`ctx.connection`（CI 脚本 `check-host-boundary.mjs`）。

**回滚点**：保留旧 `index.js` 备份（或 git revert 单阶段）。

### 5.3 P2 bridge v2 与 brief 加固（3-4 天，依赖 P0/P1）

**改动文件**：

| 文件 | 动作 | 说明 |
|---|---|---|
| `DF/src/bridge/route.js` | 新增 | method/路由/16KiB/2000 字符/限流（如 20 次/分钟、单窗口）/错误映射/`meta` |
| `DF/src/bridge/contract.js` | 新增 | 请求/响应 schema（从 spec 生成或手写校验） |
| `DF/src/bridge/errors.js` | 新增 | 错误码常量 + 文案 key |
| `DF/src/bridge/ops/{hello,echo,chat,brief,task,task-delete}.js` | 新增 | 从 index.js 迁移；`brief` 用 spec 的 `validate-brief.js` |
| `DF/client.js` | 修改 | 首次挂载 `hello`；按 capabilities 显示/隐藏按钮；chat 前显示模型/费用告知；brief 按 displayPolicy/TTL 显示 |
| `DF/test/{hello,brief,wire-*,no-payload-log,rate-limit}.test.js` | 新增 | 契约/加固测试 |

**验收标准**：`hello` 返回 `{v, spec, specVersion, capabilities, limits, host}`；未知 op/非法 JSON/超大 body/超频 → 稳定错误码；brief 对 TTL/closed schema/displayPolicy/未知版本的行为与独立版一致（共用 `validateBrief` 的测试向量）；日志 spy 不含 `reply/text/brief` 原文；旧 client（只发 `v:1` op）仍可用（wire v1 向后兼容）。

**回滚点**：`hello` 与加固是增量；旧 op handler 保留到新 client 验证后再删。

### 5.4 P3 资产/动画 spec 化（3-5 天，依赖 P0）

**目标**：删掉 `client.js` 里 30 张 base64（110 KB 里的大头），改为宿主帧路由 + spec manifest；动画 fps/帧数从 pack manifest 读，不再手写 SEQ 时长。

**改动文件**：

| 文件 | 动作 | 说明 |
|---|---|---|
| `DF/src/bridge/frames.js` | 新增 | `GET /api/famling/frames?pack=...&clip=...&i=...`：allowlist 来自 `assets.manifest.json`（源自 `famling.pet-anim/0.1` 的 clip/fps/hold）；校验 clip/index/sha256；返回 `image/png` + `cache-control: public,max-age=31536000,immutable` + etag；未知/越界/路径注入 → 404/400 |
| `DF/index.js` | 修改 | 同 path 注册 GET（`methods:["GET","POST"]`，按 method 分支） |
| `DF/client.js` | 修改 | 从 `hello`/spec 读 actions + manifest；`<img src>` 取帧；预加载前 2-3 帧；404 → 回退静态占位（保留 1 张内嵌兜底） |
| `DF/spec/assets.manifest.json` | 消费 | P0 已存在；P3 只消费 |
| `DF/test/frames.test.js` | 新增 | 越界/未知 tag/etag/缓存头/401/404 |

**验收标准**：`client.js` 体积显著下降（目标 <30 KB；当前 112,891 B）；插件动画帧与公开 famling `tinglan-256` 逐字节一致（抽查 5 帧 sha256）；正常使用无 404；帧路由不可用时回退静态头像且不崩。

**备选（不推荐现在做）**：用 esbuild/tsdown 打成标准 client bundle + 包 assets + `require.asset`；等 P0/P1 稳定、且需要多文件 client 时再考虑。

### 5.5 P4 同意/合规统一（2-3 天，依赖 P0；文案依赖 task-2）

**改动文件**：

| 文件 | 动作 | 说明 |
|---|---|---|
| `DF/src/client/consent.js` | 新增（纯函数） | 同意状态机：版本/hash 校验、v2 存储结构、撤回、过期；不碰 DOM |
| `DF/scripts/build-client.mjs` | 新增 | 把 `src/client/**` + spec 注入拼成 `client.js`（无第三方依赖，纯字符串生成；CI 校验生成物 fresh） |
| `DF/client.js` | 生成 | 不再手写；AI 声明/同意文案来自 spec |
| `DF/test/client-consent.test.js` | 新增 | 版本变更重弹、拒绝、撤回、损坏存储、无 localStorage |
| `DF/docs/DETAIL.md` + README | 修改 | 同意/隐私/费用口径 |

**验收标准**：TTS/ASR 同意记录含 `{version,hash,at}`；文本/版本变化必须重新确认；拒绝只关能力；AI 声明在输入/设置两处展示且来源单一（静态扫描 `client.js` 不含重复字面量）；chat 首次使用显示“模型/费用/数据去向”告知；无 roleplay 字样（静态扫描 `roleplay|情感陪伴|恋人` 仅出现在“不提供”声明中）。

**对接**：task-2 的法律研究结论（告知文本/风险口径）以 spec `ai-notice.json`/`consent.json` 落地；task-2 未完成前用当前 `terms.ts` 版本占位，P4 不等 task-2 可先做机制。

### 5.6 P5 任务型会话（可选，3-6 天，默认 off，需产品拍板）

**改动文件**：`DF/src/host/task-session.js`（`ctx.get("agents")` → `create`/`resume` + `followup` + `whenIdle`；权限/工作目录用 Host 默认；不新增 Key）、`DF/src/bridge/ops/task-run.js`、client 面板（config 开关默认 off）、测试（fake agents；真实调用只在用户批准后手工）。

**验收标准**：默认关闭；开启前有费用/会话污染告知；创建出的 Session 出现在 DSH 会话列表且日志有 turn；失败回退到 `chat`；不静默创建。**未通过产品/费用决策前不实现本阶段。**

### 5.7 P6 git/CI/发布（1-2 天，可与 P0 并行）

**改动文件**：`DF/` 换成公开仓 clone（保留 `/mnt/d/Projects/dsh/plugins/dsh-famling` 路径）；`DF/.github/workflows/ci.yml`（Node 24：`node --check`、`npm test`、spec lock、capability coverage、engines）；`DF/docs/COMPAT.md`；`PF/.github/workflows/` 增加 spec 校验 job；README 修正（“预留 `window.__DSH_FAMLING_BRIDGE__`” 过期句、yaml 代码块未闭合、`0.2.2-rc.3` 过期表述）；`DF/package.json` `engines.dsh` 收紧（跑完矩阵后）。

**验收标准**：新 clone → `npm ci`/`npm test` 全绿；`dsh plugin --profile web remove/add link:` 后 `list_plugins` 可见、刷新后出现汀岚；CI 在 PR 上阻断 spec/边界/能力问题。

### 5.8 阶段验收总表与依赖

| 阶段 | 交付 | 验收命令 | 依赖 | 估时 | 回滚 |
|---|---|---|---|---|---|
| P0 | spec 生成器/镜像/vendored/LOCK | `gen --check`、`export --check`、`check-spec-lock`、`node --check`、`npm test` | 无 | 2-3d | 删新增文件/不引用 |
| P1 | host 能力层拆分 | `npm test`、`check-host-boundary`、capabilities 矩阵 | P0（spec 路径） | 2-3d | revert 单阶段 |
| P2 | bridge v2 + brief 加固 | `npm test`（hello/brief/wire/limit/no-payload） | P0/P1 | 3-4d | 保留旧 handler |
| P3 | 帧路由 + manifest 消费 | `npm test`（frames）、体积对比、5 帧 sha256 | P0 | 3-5d | 恢复内嵌兜底 |
| P4 | consent v2 + AI notice 单一来源 | `npm test`（client-consent）、静态扫描 | P0；文案对接 task-2（已产出） | 2-3d | 保留 v1 读取兼容 |
| P5 | 任务型会话（可选） | fake agents + 真实冒烟（需批准） | P1/P2 + 产品决策 | 3-6d | 默认 off |
| P6 | git/CI/发布 | CI 绿、fresh clone 安装、COMPAT | 全部 | 1-2d | 回退 workflow |

**并行关系**：task-3（像素动画，进行中）产出 → 直接喂 P0 的 `assets.manifest`/`actions`（P3 消费）；task-2（法律，已产出）→ P4 文案；两者都不阻塞 P0/P1 的机制建设。

---

## 6. 风险与未决问题

### 6.1 风险表

| # | 风险 | 触发/证据 | 影响 | 概率 | 缓解 | 检测 |
|---|---|---|---|---|---|---|
| R1 | DSH 0.2.x rc 期 API 漂移 | 上游在同 rc 周期内改过 `engines.dsh` 规则、`BundleInfo.updatable` 改 `update`、context-menu target、settings 插件页、client HMR 事件（`DSH/docs/upgrade-guide/**`） | 插件功能失效/加载失败 | 高 | 所有 host 调用收口 `src/host/dsh.js`；`HOST_BASELINE` + surface fixtures；`engines.dsh`；发布节奏跟 DSH；失败降级不崩 | `dsh-surface.test.js` + 真实 DSH 冒烟 + 上游 release notes 巡检 |
| R2 | 插件安装态丢失 | 交接记录 09:12、13:00 两次从 profile bundles 消失；原因未定（疑 DSH 重装/升级流程重置 profile） | 用户侧“宠物突然不见” | 高 | 文档化恢复步骤；README 写明 `remove/add → 重启`；不自动改 profile；发版后在 `plugin_manager list_plugins` 复核 | 每次升级/重装后人工检查；用户反馈 |
| R3 | 双 DSH home / 双 Advisers home | 运行实例是 WSL `/home/yy/.dsh` + `/home/yy/.advisers`；Windows 还有 `C:/Users/zzhdz/.dsh`（bundles 无插件）与不存在的 `C:/Users/zzhdz/.advisers` | brief 读不到/设置不跟/装错地方 | 高 | adapter 解析 home 时与 producer 对齐；新增 Config `advisersHome`/`dataHome` 覆盖；文档写清运行平台 | 启动日志/`hello` 返回解析出的 home（不回显敏感内容）；冒烟按平台各一次 |
| R4 | Pet Brief 契约漂移（TTL/closed schema/displayPolicy/未来版本） | 插件当前弱校验（§1.5 G3）；Advisers 契约 v0.2、未来 0.3 | 展示过期数据/未知字段/隐私违规 | 中 | spec 共用 `validateBrief`；consumer-first；未来版本 fail-closed；displayPolicy none 丢弃 | 共用测试向量 + 真实 brief 冒烟 |
| R5 | 无 Host TTS、ASR 实验性/需 bundle | DSH 无 TTS（已核）；voice-input 默认未启用 | 语音能力弱/不可用；桌面版与 DSH 版体验不一致 | 高 | 浏览器 TTS/ASR 兜底 + 独立同意；不宣称 Host TTS；可选 host ASR 仅作为增强 | 能力矩阵 + 真机测试 |
| R6 | 许可/权利 | 42 WAV 服务商再分发许可 TBD（A-04 BLANK）；PolyForm NC + CC BY-NC-SA；Advisers 许可口径历史有变化 | 公开分发/商用风险 | 中高 | spec/插件不随包音频；公开导出扫描；LICENSE/NOTICE 同步；法务/权利人外部 blocked | `publicSafe` 扫描 + legal-check + 人工复核 |
| R7 | roleplay/年龄/情感陪伴边界 | 独立版有 18+ roleplay；插件若被“顺便加聊天/陪伴”会踩监管 | 法务风险、平台审核 | 中 | 插件声明 all-ages、不宣传 roleplay、不实现情感陪伴；静态扫描禁止卖点；task-2 法律研究对齐 | 静态扫描 + README/文案评审 |
| R8 | 动画素材不合格 | 旧 49 PNG 去重约 19 底稿、刘海/眼位/bbox 漂移（交接 §5） | 两产品观感差；帧路由/同步会被坏素材放大 | 高 | task-3 新母版；spec 资产哈希让换帧零插件代码；先修 idle/look/pat/input | 美术验收 + task-3 的动画校验测试 |
| R9 | client 手写 bundle wrapper 非稳定契约 | `client.js` 手写 `window.__ModuleLoader__.load`；DSH 文档只承诺“导出 ./client bundle” | DSH 改动可能让 client 不加载 | 中 | P0/P1 引入无依赖生成器 + boot smoke；pin DSH；HMR/刷新语义写进 COMPAT | 真实 DSH 刷新冒烟 |
| R10 | spec 自身变成第二真相源/被手改 | 公开镜像是生成物；有人直接改 `PF/spec` 或 `DF/spec` | 两侧不一致/CI 假绿 | 中 | 单向生成（私有 → 公开 → vendored）；`--check` + LOCK + 公开仓只读约定；PR 模板提示 | CI `check-spec`/`check-spec-lock` |
| R11 | npm 发布 blocked（OTP）、无 registry 分发 | 交接/环境事实 | spec/插件只能 link/tarball/git 分发 | 高 | release asset tarball + sha256；git pin commit；npm 作为后续增强 | 发布 checklist |
| R12 | 调度副作用/费用 | 提醒会创建 DSH Session；任务型会话会消耗 token | 用户账单/会话污染 | 中 | 默认只做一次性提醒 + 显式确认；任务型会话默认 off；限流；费用告知 | 审计计数 + 用户反馈 |
| R13 | 隐私：chat 文本/ASR 音频出网 | 浏览器 ASR 可能把音频给厂商；LLM 文本给 provider | 隐私投诉/合规 | 中高 | 独立同意 + 明确文案（音频去向/费用）；不落原文日志；数据分类表进 README | 同意状态测试 + 日志 spy + 人工审阅 |
| R14 | 公开导出泄漏私有内容 | spec 若包含私有路径/研究/音频 | 公开仓污染/许可风险 | 中 | `publicSafe` 扫描 + 白名单 + 人工 review；CI 阻断 | `export-public-pet --check` / `check-public-boundary` |
| R15 | 并行任务未落地 | task-2 法律、task-3 动画仍在进行 | 文案/资产占位，后续 spec MINOR 变更 | 高 | 机制先落地，文案/资产后补；P4 用当前 terms 占位；P0 资产清单允许后续 PATCH | 任务板依赖跟踪 |
| R16 | 最低 DSH 版本收紧影响存量用户 | 当前 `engines.dsh` 写 `>=0.2.1-rc.5`，实际只在 0.2.2-rc.4 验证 | 旧 rc 用户装不上/未验证运行 | 中 | 先跑 min/latest 矩阵再收紧；COMPAT 标 untested；不在未验证版本上宣称支持 | 安装矩阵 + CI 定时 |
| R17 | 帧路由性能/请求量 | 8-12fps 换帧 = 每秒多次图片请求 | 卡顿/网络面板噪音 | 中 | 全部帧预加载 + immutable 缓存 + etag；仅 owner；备选 sprite atlas | 浏览器性能冒烟 |
| R18 | 团队并行写冲突 | 本文件与其他任务都在 desktop-games 写 docs/代码 | 互相覆盖/重复实现 | 中 | 本文件只写 docs/design；插件改动集中在 DF；改动前检查 git status/写范围；任务板声明 | 合并前 diff 审查 |

### 6.2 未决问题（需要拍板/验证）

| # | 问题 | 选项 | 建议 | 谁决定 |
|---|---|---|---|---|
| Q1 | spec 的 canonical 家在哪 | 私有仓生成 vs 公开仓手写 vs 独立 spec 仓 | 私有仓生成、公开仓只读镜像、插件 vendored（§4.6） | 用户/维护者 |
| Q2 | spec 发布形态与包名 | tarball vs npm `famling-spec` vs scoped | 先 tarball，npm 后补；名字用 `famling-spec`（不占用官方 scope） | 用户（npm OTP） |
| Q3 | 是否用 DSH synced Config | 加 Config schema + schemastery peer vs 手工校验 | 先手工校验（当前）；P1 spike 验证 peer 解析后再决定 | 维护者 |
| Q4 | 是否给插件加 age gate | 永远 all-ages vs 未来 18+ | 保持 all-ages；18+ 只在独立版；若改则必须先过法务 | 用户/法务 |
| Q5 | 是否做即时任务型会话 | off / 默认 off 可开 / 默认开 | 默认 off，显式开启 + 费用告知；先 P5 | 用户（费用/会话污染） |
| Q6 | 帧资产用宿主路由还是包 assets | bridge GET 帧 vs `require.asset` + 构建链 | P3 用 bridge GET（无构建依赖）；后续再评估 | 维护者 |
| Q7 | 桥接文档权威在哪 | DG/PF/DF 三处 vs 单一 | wire 在 DF docs；face 契约在 PF spec/docs；DG 只留指针 | 维护者 |
| Q8 | 插件仓如何 git 化 | 本地目录 + sync vs 直接 clone 公开仓 | 直接 clone（路径不变），公开仓唯一权威 | 维护者 |
| Q9 | 是否发布 plugin market / npm | 不发 vs 发 index/npm | 先本地 link/tarball；用户确认 OTP/账号后再发 | 用户 |
| Q10 | 最低 DSH 版本 | rc.3 / rc.4 / 双支持 | 跑矩阵后定；当前以 rc.4 为已验证基线 | 维护者 |
| Q11 | Advisers home 覆盖 | 自动解析 vs Config 显式 | 两者都要：自动解析 + `ADVISERS_HOME`/Config 覆盖 | 维护者 |
| Q12 | 插件是否引入猫/狗 | 只有汀岚 vs 加猫狗 | 先把汀岚动画做好；猫狗等 spec/资产稳定后再评估（产品决策） | 用户 |

### 6.3 与其他任务/文档的关系

- **task-2（法律）**：已产出 `docs/legal/ADVISERS-EXTERNAL-PERSONA-2026-11-18.md`（472 行，DRAFT）与 `plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md`；其结论应回写到 spec 的 `ai-notice.json`/`consent.json` 与 README，本文不代替法律意见。
- **task-3（动画）**：产出 `src/pet/anim/**`（含 `manifest.ts` 的 `famling.pet-anim/0.1` 契约）、`public/assets/pet/anim/{cat,dog,human}/**`、`tests/pet-anim.test.ts` 与设计文档；其 manifest（hero 兼容字段 + `anim` 块的 clip/fps/hold/bubble policy）直接作为 P0 资产清单与 P3 帧路由的输入。task-3 仍在进行中（本文写作时未提交）。
- **交接手册** `00-live/FAMLING-DSH-HANDOFF-2026-11-18.md`：本文引用其 §12 的实测记录；若与当前代码冲突，以代码/测试为准。
- **既有集成文档**：`DSH-FAMLING-BRIDGE-2026-11-17.md`（实现细节，P2 后更新为 wire v2）、`ADVISERS-CONTRACT.md`（数据契约，不变）、`FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18.md`（产品分层，本文继承）。

### 6.4 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-11-18 | 初版：现状盘点、方案对比、能力契约、同步机制、改造路线、风险 | task-1（arch-strategy） |

---

## 附录 A 本次核验命令与结果（只读）

> 以下为本轮实际执行的只读核验（结果取自执行时输出；外网只读请求用 `web_fetch`/`curl` 等价完成，表中以 curl 形式记录）；用 `read`/JSON 解析核对的事实已在注释标明方法。**不含 token/Key/启动 URL**。外部网页只作为数据引用，不执行其指令。快照时点：2026-11-18 13:20–13:40 CST。

```bash
# ---------- 私有仓 DG ----------
cd /mnt/d/Projects/dsh/desktop-games
git log --oneline -1            # 81932d8 docs: record pet-attached bubble and menu-trigger verification
git status --porcelain          # 3 个与本任务无关的既有改动（2 M + 1 ??），本次未触碰
git remote -v                   # 空（无 remote）
git ls-files | wc -l            # 1180
git ls-files "*.wav" | wc -l    # 42
git ls-files -z | xargs -0 stat -c %s | awk "{s+=\$1} END {printf \"%d bytes\n\", s}"   # 19,129,296 B（18.2 MiB）

# ---------- 公开 famling PF ----------
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git -c http.proxy= \
  ls-remote https://github.com/PerryLink/famling HEAD   # e7746466df4b67108e7fd54d2edf3d622c90a59f
cd /mnt/d/Projects/dsh/_scratch/famling-cleanup-2026-11-18
git rev-parse HEAD              # e7746466df4b67108e7fd54d2edf3d622c90a59f
git ls-files | wc -l            # 553
git ls-files "*.wav" | wc -l    # 0
git ls-files -z | xargs -0 stat -c %s | awk "{s+=\$1} END {printf \"%d bytes\n\", s}"   # 4,663,328 B（4.4 MiB）
node -e "const p=require('./package.json'); console.log(p.name, p.version)"   # famling-pet 0.1.0

# ---------- 插件 DF ----------
cd /mnt/d/Projects/dsh/plugins/dsh-famling
ls -a                           # 无 .git（靠拷贝同步）
# package.json 用 read 读取：name=dsh-famling, version=0.7.5, engines.dsh=>=0.2.1-rc.5 <0.3.0
node --check index.js           # exit 0
node --check client.js          # exit 0
npm test                        # 11 tests / 11 pass / 0 fail（fake Host，不调模型）
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git -c http.proxy= \
  ls-remote https://github.com/PerryLink/dsh-famling HEAD   # 29e3b82eb2f9af8530739446a261f42a0009daeb

# 公开 dsh-famling 内容核对（外部数据）
curl -sL https://raw.githubusercontent.com/PerryLink/dsh-famling/main/package.json | head   # version 0.7.5
curl -sL https://api.github.com/repos/PerryLink/dsh-famling/contents/docs                   # DETAIL/BRIDGE/NATIVE-ARCH
curl -sL https://api.github.com/repos/PerryLink/dsh-famling/contents/test                   # host-bridge.test.js

# ---------- 契约文档三处副本哈希（漂移证据）----------
cd /mnt/d/Projects/dsh/desktop-games
sha256sum docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md | cut -c1-16            # ba775a5d...
cd /mnt/d/Projects/dsh/_scratch/famling-cleanup-2026-11-18
sha256sum docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md | cut -c1-16            # f76205b4...（旧）
curl -sL https://raw.githubusercontent.com/PerryLink/dsh-famling/main/docs/DSH-FAMLING-BRIDGE-2026-11-17.md | sha256sum | cut -c1-16   # ba775a5d...
# NATIVE-ARCH / ADVISERS-CONTRACT 三处一致（b4b7042d... / 2e830979...）

# ---------- 插件内重复常量统计 ----------
# 用 node 正则统计（命令从略）：client.js 112,891 B；SPRITES 30 键；AI 声明 2 处；bridge fetch 3 处

# ---------- 独立版关键事实 ----------
cd /mnt/d/Projects/dsh/desktop-games
grep -nE "TOS_VERSION|TTS_VERSION|ASR_VERSION|ROLEPLAY_VERSION" src/pet/consent/terms.ts   # 2026-11-17.6 / .4 / .3 / .4
grep -nE "PET_BRIEF_(MAX_BYTES|TTL_MS|SUPPORTED_SCHEMA_VERSIONS|FUTURE_SCHEMA_POLICY)" src/presence/pet-brief.ts   # 128 KiB / 5min / [1,2] / refuse
ls public/assets/pet                               # cat/dog/pearl(36 PNG+manifest) + tinglan-256(49 PNG+manifest)
ls public/assets/pet/tinglan-256 | wc -l   # 50（49 PNG + manifest）

# ---------- DSH ----------
cd /home/yy/deepseek-harness
node -e "const p=require('./package.json'); console.log(p.name, p.version, p.packageManager)"   # @deepseek-ai/dsh-root 0.2.2-rc.4 pnpm@11.28.5
git log -1 --format="%h %ci %s"    # ca33fd6843 2026-11-17 22:17:01 +0800 Merge pull request #8667 from deepseek-harness/worktree-sync-release-dsh-0.2.2-0.2.2-rc.4-to-master
ps -eo pid,ppid,lstart,args | grep -E "dsh|node" | head   # pid 416: node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 3081（Node 24.22.1，12:13 启动）
# Windows 侧已安装 CLI：node 读 package.json → @deepseek-ai/dsh 0.2.2-rc.4
# 运行 profile（read 解析 /home/yy/.dsh/profiles/web/package.json）：bundles=[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dsh-famling]
# Windows profile（/mnt/c/Users/zzhdz/.dsh/profiles/web/package.json）：bundles 无 dsh-famling
# Advisers：fs.statSync(/home/yy/.advisers/pet-brief.json) → 548 B / 2026-11-18 10:43 +08
#          fs.statSync(/mnt/c/Users/zzhdz/.advisers/pet-brief.json) → ENOENT
grep -rn -iE "synthesis|text-to-speech|tts" packages/experimental/speech-to-text/README.md docs/subsystems/*.md | head   # README:70 明写 no speech synthesis service methods
ls packages/experimental | grep -iE "voice|speech"   # api-speech-to-text / client-ui-voice-input / speech-to-text / speech-to-text-sensevoice / voice-input-bundle
# 其余 DSH API 位置见附录 B（read/grep 核对）
```

**未执行（明确说明）**：`DG/npm test` 全量、`DG/npm run build`、Tauri 构建、真实 LLM 调用、`/api/famling/bridge` HTTP 冒烟（需要 DSH token/cookie，按安全规则不读取、不打印、不写入本文件）、公开 famling 重新 clone 的 diff、Advisers CLI 调用、插件真实安装/渲染验收。

## 附录 B 引用索引（关键文件/API）

| 位置 | 用途 |
|---|---|
| `DG/docs/integration/FAMLING-DSH-NATIVE-ARCHITECTURE-2026-11-18.md` | 产品分层（本文继承） |
| `DG/docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md` | 桥接实现细节（P2 后升级 wire v2） |
| `DG/docs/integration/ADVISERS-CONTRACT.md` | Pet Brief 数据契约/版本协商/升级顺序 |
| `DG/docs/audit/FAMLING-PUBLIC-BOUNDARY-2026-11-18.md` | 公开边界审计（42 WAV/kernel/packs/清理记录） |
| `DG/docs/design/PET-INPUT-OUTPUT-DESIGN-2026-11-17.md` | standalone 输入/结果三层设计（插件不照搬） |
| `DG/src/presence/pet-brief.ts` | 严格 Pet Brief 校验（TTL/closed schema/displayPolicy），抽取为 spec `validate-brief.js` 的来源 |
| `DG/src/pet/advisers/face.ts` | 只读 face 控制器（超时/去重/退避/隐私面板） |
| `DG/src/pet/consent/terms.ts` | TOS/TTS/ASR/ROLEPLAY 版本 + hash（V-TERMS 源） |
| `DG/src/pet/consent/{age,roleplay}.ts` | 18+ 自报年龄门/roleplay 设置（standalone-only） |
| `DG/src/voice/**`、`DG/app/tauri/**` | 独立版 TTS/ASR/桌面壳实现（含云 TTS 代理） |
| `DG/public/characters/**`、`DG/public/assets/pet/**` | FCI 角色/pack manifest v2/帧资产（spec L0 源） |
| `DG/scripts/export-public-pet.mjs` | 现有公开导出脚本（白名单过期，P0 重写） |
| `DG/tests/**` | 116 个测试文件（公开仓不导出） |
| `PF/src/pet/**`（78）、`PF/src/voice/**`（10）、`PF/app/tauri/**`（16） | 公开 pet-only 可执行切片 |
| `PF/docs/legal/**`、`PF/public/legal/**` | 公开法务文本（DRAFT） |
| `DF/index.js`、`DF/client.js`、`DF/package.json`、`DF/test/host-bridge.test.js` | 插件现状（0.7.5） |
| `DSH/packages/llm/llm/src/index.ts:206`、`src/types.ts:564-606` | `ctx.llm.stream` / `GenerateOptions` |
| `DSH/packages/core/agent-default-model/src/index.ts:68` | `ctx.agentDefaultModel.currentSelection()` |
| `DSH/packages/credentials/credentials/src/index.ts` | `ctx.credentials`（credentialRef/resolve/set/unset） |
| `DSH/packages/schedule/schedule/src/index.ts`、`src/types.ts:353-395,478-537` | `ctx.schedule` 方法与 target/timing |
| `DSH/packages/experimental/speech-to-text/src/index.ts:48` | `ctx.speechToText`（实验） |
| `DSH/packages/client/connection/src/rpc.ts:146-168` | exact Fetch route（owner-only） |
| `DSH/packages/client/ui-sidebar/src/client/contract/slots.ts:75` | `sidebar.footer.action` 定义 |
| `DSH/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:4842` | slot 契约（kind/scope/owner props/replacement risk） |
| `DSH/packages/client/config/README.md`、`DSH/packages/client/modules/README.md`（Synced plugin configuration 节） | synced Config 机制 |
| `DSH/docs/user/develop/basic/{index,config,publish}.md` | 插件开发/配置/bundle 打包安装 |
| `DSH/docs/user/guide/plugin-market.md` | plugin index/安装/更新格式 |
| `DSH/docs/upgrade-guide/**` | DSH 插件 API 漂移证据（engines.dsh、BundleInfo.update 等） |
| `DSH/docs/capability-seams.md:725,779,784,799` | `ctx.llm`/`ctx.agents`/`ctx.schedule`/`ctx.speechToText` 的服务分类（core/seam） |
| `DSH/docs/subsystems/slots.md` | slot 注册/inject/扩展规则 |
| 外部（按数据引用） | `https://raw.githubusercontent.com/PerryLink/dsh-famling/main/package.json`（0.7.5）、`.../README.md`；`https://api.github.com/repos/PerryLink/dsh-famling/contents/{docs,test}`（列出 DETAIL/BRIDGE/NATIVE-ARCH 与 test）；`https://github.com/PerryLink/famling`（公开仓） |

## 附录 C 术语表

| 术语 | 含义 |
|---|---|
| FCI | Famling Character Interface：角色数据契约（`famling.character`、`famling.behavior`、`famling.voice-lines`；apiVersion 0.1/0.2 出厂、0.3 预览） |
| face spec | 本文新增的宿主表现契约 `famling.face`：动作/气泡/台词/同意/AI 声明/能力/隐私/资产清单 |
| adapter | 把 face spec 映射到某宿主的产品侧实现：standalone adapter（Tauri）与 dsh adapter（插件） |
| bridge wire | 插件 client 与 Host 之间的 `/api/famling/bridge` 协议（v1，P2 加 `hello`/能力协商） |
| capability | 一个可协商的能力 id（如 `llm.chat`/`tts.system`/`memory.brief`），带支持级别 |
| 支持级别 | host/browser/local/degraded/off/standalone-only（§3.0） |
| LOCK | 插件 `spec/LOCK.json`：vendored spec 的来源 commit + 逐文件 sha256 + specVersion |
| spec diff | `gen-face-spec --diff` 产出的语义变更报告（动作/资产/文案/consent/能力） |
| DSH baseline | 插件声明/验证过的 DSH 版本（当前 0.2.2-rc.4）+ 逐能力最低版本 |
| consumer-first | 数据契约升级顺序：先升消费端，再让生产者输出新版本（Advisers Pet Brief 既有规则） |
| publicSafe | 公开导出扫描：无私有路径/密钥/WAV/未清权内容/私有研究名 |

---

*本文是工程设计与决策记录，不是法律意见，也不代表已实现。所有“已实现/已实测”均标注了来源；未验证项标 unverified。改动代码前请先按 §5 的写范围与任务板分工执行。*




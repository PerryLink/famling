# 测试工程师视角全项目评审（famling / dsh-famling · 2026-11-19）

| 项 | 内容 |
|---|---|
| 评审视角 | 测试工程师：测试金字塔、回归覆盖、真实 GUI 数据隔离、CI 门禁、发布验收、故障注入 |
| 任务 | task-59（独立评审）；只读，不修代码/资产/配置，不 commit/push |
| 快照时间 | 2026-11-19 12:50–13:15（Asia/Shanghai）。工作树在评审期间仍被并行任务修改（见 §1.4），所有数字只对应该时刻 |
| 评审对象 | famling 私有仓 `DG/`（`/mnt/d/Projects/dsh/desktop-games`，HEAD `779354b`，20 个未提交改动）；dsh-famling `DF/`（`/mnt/d/Projects/dsh/plugins/dsh-famling`，0.10.0，本地目录无 `.git`）；DSH 只读 checkout `/home/yy/deepseek-harness`（0.2.2-rc.4，HEAD `ca33fd6843`） |
| 方法 | 读 README / FAMLING-DSH-HANDOFF-2026-11-18 / CONTENT-MARKET-2026-11-19 / 既有 QA、鲁棒性、ACL、签名审计；读 main、desktop-shell、content-library/hub、hit-regions、hero-runtime、插件 client/index、tauri.conf、CI；本机实测全量单测、typecheck、覆盖率、插件测试与动画门禁、发布脚本 smoke、repro-check、legal-check |
| 唯一写入 | 本文件 `DG/docs/research/PROJECT-REVIEW-QA-2026-11-19.md` |
| 未做 | 未启动 Tauri/GUI/Windows 实机；未跑 `e2e:tauri`、24h soak、NSIS 安装包、Authenticode 签名；未联网核对公开仓与 GitHub Actions；未读其他评审者报告 |

> 证据约定：`DG/` = `/mnt/d/Projects/dsh/desktop-games`，`DF/` = `/mnt/d/Projects/dsh/plugins/dsh-famling`，`DSH/` = `/home/yy/deepseek-harness`。行号对应本快照；文档里的历史数字不当作现值。
>
> 严重度口径（本报告）：**P0** = 会让用户本机数据受损、或让“无测试证据的版本”可以通过发布/回归进入用户侧；**P1** = 关键故障类型/关键路径存在系统性测试盲区，或质量门禁不可执行；**P2** = 卫生、效率、文档真值与可维护性问题。

---

## 0. 执行摘要

### 0.1 一句话判断

**测试资产总量不少、结构偏科、门禁空转：纯函数/行为层有 1,000+ 条确定性用例（本机 29 s 全绿时），但真正跑起来的桌面运行时 `main.ts` 从未被任何测试 import、数据恢复链只有源码正则断言；CI 因仓库无 remote 从未运行过，而且在干净 checkout 上“今天启用就会红”；唯一真实 GUI E2E 直接操作并删除用户真实 `%APPDATA%` 存档（11-19 已发生一次不可还原的 pet.json 改动）。当前项目的绿灯主要来自本机手工命令，不是可复核的发布证据。**

### 0.2 支撑判断的硬事实（全部本机实测或可复核文件）

1. **测试规模够、速度好，但最关键的模块不在测试里**：当前工作树 124 个测试文件、runner 报 **1,094 tests / 1,089 pass / 5 fail**（12:52–12:53，失败全部在并行中的内容中心改动，见 §1.4）；HEAD 干净导出为 122 文件 / **1,046 tests**。插件 76/76。但 `DG/src/pet/main.ts`（当前 3,555 行 / HEAD 3,229 行）**没有被任何测试 import**：`tests/**` 里只有 14 处 `read('src/pet/main.ts')` 文本读取（`DG/tests/p1-gates.test.ts:170-195` 用 TypeScript AST 切片 + data URL 导入 3 个纯 helper 属于唯一例外），它也不出现在覆盖率表里。
2. **覆盖率的口径会误导**：在 HEAD 干净导出上跑 Node 内置覆盖率，结果为 **lines 91.11% / branches 80.74% / functions 87.26%**；但这是“被测试加载过的文件”口径，**11 个源文件、4,318 行从未被加载**，包括 `main.ts`（3,229）、`setup-page.ts`（444）、`shell-layout.ts`（99）、`voice/system.ts`（25）；`hit-regions.ts` 只有 56.77%（DOM 收集与 IPC 同步路径未被测试，`DG/tests/hit-regions.test.ts` 仅 4 例纯 tile 函数）。见 §2.2。
3. **源码文本断言占比很高**：122 个测试文件里 **19 个是纯静态断言**（只 `readFileSync` + 正则/includes，不 import `src/`），**63 个读取源码文本**（含混合型）。这些测试能防“删掉安全门禁”，但不能防“行为回归”；反过来改注释/改名就可能误报。典型：P0 坏档恢复链的回归测试是 `DG/tests/consent-static.test.ts:225` 对源码的一行正则。见 §2.3、§3。
4. **P0/P1 数据链修复基本没有行为级回归**：`invokeTimed`（`DG/src/pet/main.ts:1689-1700`）、坏档恢复（`:1728-1902`）、baked TTS manifest 8 s 超时（`DG/src/voice/baked.ts:219-240`）、插件 bridge 的三路 AbortController/防重（`DF/client.js:789-848`）都查不到对应测试；全仓 **ENOSPC 等磁盘故障注入 0 命中**。唯一做得好的是 Advisers Face 的 never-settle 超时测试（`DG/tests/advisers-harden.test.ts:31-46`），应作为模板。
5. **真实 GUI E2E 直接打真实用户数据**：`scripts/cdp-launch.ps1:20` 只隔离了 WebView2 profile，`--reset-saves` 一路传到 Rust，`app/tauri/src-tauri/src/main.rs:952-959` **删除 app_data_dir/saves 下的每一个文件**；`scripts/e2e-tauri.ps1:51` 断言真实 `%APPDATA%/com.perrylink.desktopgames/saves/p0.json`，并在 `:69,79,83,88,95` 五次传 `-ResetSaves`。代码里 **没有 `DG_QA_DATA_DIR`/`app_directories_override`**（全仓 grep 仅二进制命中）。11-19 09:55–09:58 已发生 GUI 探针写入真实 `pet.json`/`pet.json.bak` 且原内容无法还原（`DG/docs/audit/RESOLUTION-TAURI-ACL-2026-11-19.md:280`、`RESOLUTION-CONSENT-GATE-2026-11-19.md:107,153`）。见 §4。
6. **CI 是从未执行的配置**：`DG` 无 remote（`git remote -v` 空、无 tag），`.github/workflows/ci.yml:3` 自己写着 This repo has no git remote yet…，`scripts/preflight.mjs:3-8` 同样注明；`release.yml` 只在 push tag 时触发。且我在 HEAD 干净导出上实跑：**1046 tests / 4 fail / 5 skipped**；其中 2 个 fail 是 WSL/powershell+/tmp 路径环境专属，另外 2 个（`ui-assets` 依赖被 `.gitignore:25` 忽略的 contact sheet、`use-restrictions` 读取仓外 `../plugins/dsh-famling`）**在任何干净 checkout 上都会红**。另有 5 个 dist/release 产物测试在 CI 的先跑测试后 build 顺序下永远 skip。见 §5.2。
7. **发布验收没有可机器复核的产物**：`DG/artifacts/` 里没有 `SHA256SUMS.txt`、`RELEASE-MANIFEST.json`、`build-info.json`；`e2e-tauri.json` 仍是 **2026-11-14 14:44** 的旧产物、无 provenance；没有 `tauri-soak-24h.json`（只有 11-14 的 5 min soak）；最新的 Windows exe 哈希只写在 handoff 正文（`00-live/FAMLING-DSH-HANDOFF-2026-11-18.md` 的若干补充节），仓库内无对应归档。`repro-check --check-inputs` 本轮通过但报 5 个 warn：非 npmjs 镜像 112/112、工作树脏、HEAD 无 tag、runner 镜像浮动、SOURCE_DATE_EPOCH 未设。见 §6。
8. **插件发布门可以绿着发布过期数据**：`DF/test/client-static.test.js:163-168,210-215` 在缺少私有资产时 `t.skip`；我把插件目录复制到 `/tmp` 模拟公开仓视角实跑：**76 tests / 74 pass / 2 skipped / 0 fail**。也就是说公开仓 CI 绿了，也不会校验嵌入动画/区域与资产源一致。`DF/package.json` **没有 prepack**，目录内无 CI 配置。见 §5.3。
9. **本地门禁里确实有认真做的部分**：`version:check` 6 个版本镜像一致；`validate:content` 3 个文件、`verify:pack` 2 个包、`fci:validate`、`art:check-specs` 全部通过；插件 `check:anims`/`verify:anims` 全绿（首屏 66.1 KiB、首帧 127.9 KiB、全量 313.5 KiB）；`release-sign --plan` 与 `repro-check --check-inputs` smoke 退出 0；`legal-check` WARN-ONLY 34 条，但 `--strict` **BLOCKED 34 条**。这是工程习惯不差、但门禁没有接线的典型形态。
10. **E2E/测试环境卫生差**：`DG/artifacts/` 实测 **12 GB**、残留 **941 个 `cdp-wv2-*` WebView2 profile**；`cdp-launch.ps1` 每个用例新建 profile 但永不清理；20 个 `cdp-*.mjs` 全部硬编码 `D:/Projects/...` 与 `C:/Program Files/nodejs/node.exe`，固定 `Start-Sleep 6`，端口固定 9333。见 §5.4、§7。

### 0.3 评分表（QA 维度，A 最好 / F 最差）

| 维度 | 评级 | 一句话依据 |
|---|---|---|
| 单元/行为测试 | **A−** | 纯函数模块覆盖扎实、确定性好、29 s 跑完；fail-closed 语义有大量回归用例 |
| 集成/DOM/画布测试 | **C+** | 有 fake storage/DOM/canvas（8 个文件），但没有 jsdom/Playwright，真实 DOM 接线和事件路径未验证 |
| 真实 GUI/E2E | **D** | 20 个 CDP 手工脚本 + 1 个 Windows PS1；非隔离、非可移植、不进 CI、证据不落仓 |
| 故障注入 | **C−** | 存储/网络 timeout、Advisers 超时、坏档解析有覆盖；磁盘满/只读/锁文件/进程被杀/真 IPC 挂起为 0 |
| 覆盖率治理 | **C** | 有可零依赖的 Node coverage 能力但未接入；91.11% 的口径漏掉最关键运行时；无阈值/无 ratchet |
| CI 门禁 | **F（未运行）/ 设计 B** | workflow 本身写得克制（least privilege、签名门、tag 校验），但从未执行；干净 checkout 会红；关键层不在 CI |
| 发布验收 | **D+** | 签名/可复现/打包脚本工程化程度高，但没有 tag/remote/产物归档/24h 证据；legal-strict 34 blockers |
| GUI/测试数据隔离 | **F** | 测试会删除真实用户存档；无 app-data override；DSH 插件 GUI 直接跑在真实 profile |
| 测试可维护性 | **C+** | 命名/动画 golden/行为 trace 做得好；静态源码断言多、`main.ts` 用 AST 切片测试，属于高成本高脆弱模式 |

### 0.4 问题清单与数量

| 级别 | 数量 | 条目 |
|---|---|---|
| P0 | 3 | P0-1 GUI/E2E 无数据隔离；P0-2 质量门从未运行且干净 checkout 必红、本树非绿；P0-3 数据链/挂起修复无行为回归且 `main.ts` 不在测试/覆盖率内 |
| P1 | 8 | P1-1 发布证据不可复核；P1-2 插件发布闭环缺失；P1-3 真实 GUI/渲染自动化缺失且 E2E 不可移植；P1-4 故障注入面不足；P1-5 覆盖率与静态断言结构问题；P1-6 Rust/Tauri 验证不 gate；P1-7 同源 localStorage/多窗口隔离未测；P1-8 24h soak/性能/DPI 无当前 HEAD 证据 |
| P2 | 10 | 见 §9；集中在文档真值漂移、环境/产物卫生、lint/覆盖率工具、CI 顺序、测试分层命名、插件无类型检查、属性测试缺失等 |

### 0.5 建议先做 3 件

> 详见 §11。顺序按先把用户数据保护好 → 再把门禁接上 → 再补最危险链路的行为回归。

1. **GUI 测试数据隔离（P0，0.5–1.5 人日）**：实现 `DG_QA_DATA_DIR`（Tauri `AppDirectoriesOverride`，约 6–10 行）+ 禁止 `--reset-saves` 作用于真实路径 + E2E 前后 appdata 哈希快照断言；浏览器/插件 GUI 同理用临时 profile/home。
2. **把门禁真正接上并让干净 checkout 转绿（P0，2–3 人日）**：给私仓建 remote 或至少加 git hook；修 2 个必然红的测试；把插件 `test/check/verify`、Rust dlc、`tsc` 纳入 required；`rust-tauri-tests` 由 continue-on-error 转 required；夜间加无 Windows 依赖的 headless 浏览器 E2E。
3. **补数据链行为回归并抽模块（P1，3–4 人日）**：把 pet save/load/recovery 抽成可注入 IO 的纯模块（复用已有 `save-journal.ts` 能力），补 primary 坏/.bak 好、IPC never-settle、autosave suspend、baked manifest 挂起、插件 bridge timeout/防重/TTL/隐私自动隐藏等行为测试。

### 0.6 发布判断

**以当前测试证据，不支持任何已验收/可发布表述。** 不是功能不能用，而是：没有人能仅凭仓库内证据复现这个 commit 的 Windows 产物通过了哪些测试。在完成 §4（数据隔离）+ §5（门禁）+ §6（发布证据归档）之前，所有本机绿/实机通过都只能算开发自测。

### 0.7 P0/P1 问题索引（证据与落地动作）

| 级别 | 编号 | 问题 | 关键证据 | 建议动作 |
|---|---|---|---|---|
| **P0** | P0-1 | GUI/E2E 直接操作真实用户数据，`--reset-saves` 可删真实存档；无 app-data 隔离 | `DG/app/tauri/src-tauri/src/main.rs:952-959`；`DG/scripts/e2e-tauri.ps1:51,69-95`；`DG/scripts/cdp-launch.ps1:20`；无 `DG_QA_DATA_DIR`；11-19 事故记录 `RESOLUTION-TAURI-ACL-2026-11-19.md:280` | R3：Rust override + 脚本强制临时目录 + 前后快照；§4.5 |
| **P0** | P0-2 | 质量门从未运行；干净 checkout 上 CI 的 Unit tests 必红；关键层不在 CI；`rust-tauri-tests` 不阻断 | `DG/.github/workflows/ci.yml:3,117-124`；`git remote -v` 空；HEAD 导出 1046 tests/4 fail/5 skip；`ui-assets`/`use-restrictions` 仓外依赖（§5.2） | R4：修测试依赖 + remote/hook + required 化 + 分层门禁；§5.5 |
| **P0** | P0-3 | 坏档恢复/IPC 超时等数据链修复无行为级回归；`main.ts` 不被任何测试 import、不进覆盖率 | `DG/tests/consent-static.test.ts:225`（仅正则）；tests 中无 `invokeTimed`/never-settle；HEAD 覆盖率未加载 `main.ts`(3,229 行) | R1/R2 + §7 十条注入用例；§2.2/§3 |
| **P1** | P1-1 | 发布证据不可机器复核：无 SHA256SUMS/MANIFEST/build-info；E2E JSON 11-14 旧；无 24h；产物未签名；哈希只写在 handoff 正文 | `DG/artifacts/`；`RESOLUTION-AUTHENTICODE-2026-11-19.md:29-36`；handoff §12 | §6.2 八条发布门 + R7/R8 |
| **P1** | P1-2 | 插件发布闭环缺失：无 prepack/CI；缺私有资产时 2 个一致性门 `t.skip`（公开仓可绿着发布过期嵌入） | `DF/test/client-static.test.js:163-168,210-215`；`DF/package.json`；/tmp 视角 74 pass/2 skip | R6：vendored spec/LOCK + prepack |
| **P1** | P1-3 | 真实 GUI/渲染无自动化；E2E 硬编码路径/固定 sleep/固定端口/941 残留 profile，污染且不可移植 | `DG/scripts/cdp-launch.ps1:19,20,23,35,36`；`DG/scripts/e2e-tauri.ps1:1`；artifacts 12 GB | R5：Playwright/CDP headless + 参数化 + 清理 |
| **P1** | P1-4 | 故障注入面不足：磁盘满/只读/锁文件/进程中途被杀/真 IPC 挂起无覆盖 | 全仓 `ENOSPC` 0 命中；§7 表 | §7 最小 10 条 + R1/R2 |
| **P1** | P1-5 | 覆盖率口径漏掉关键模块；19 个纯静态文件 + 63 个读源码断言，伪覆盖/高维护成本 | §2.2/§2.3；`DG/tests/p1-gates.test.ts:170-195` | R7 + P2-3/P2-7：覆盖率 ratchet + 静态断言分层 |
| **P1** | P1-6 | Rust/Tauri 验证不 gate：app crate 仅 8 个测试；build.rs ACL 门只在 cargo build 时；141 断言手工证据在 `_scratch` | `DG/app/tauri/src-tauri/build.rs:1-90`；`ci.yml:117-124` | R9：Rust 命令集成测试 + ACL 矩阵脚本入库 + job required |
| **P1** | P1-7 | 同源 localStorage/多窗口数据隔离未测；游戏页与 pet 共享 `desktop-games/*` 键空间 | §4.4；11-18 handoff blocker；`DG/src/pet/security/safe-storage.ts` | 加“跨页面键空间”静态/运行时测试；产品层按窗口隔离（P1-7 in 架构报告对齐） |
| **P1** | P1-8 | 24h soak/性能/DPI/多屏没有当前 HEAD 证据；soak 脚本无增量落盘/CPU/FPS/provenance | `DG/artifacts/tauri-soak-24h.json` 缺失；`REMAINING-WINDOWS-QA.md` §3.3 | R8：加固 soak + 24h 墙钟 + 归档 |
| P2 | 见 §9 | 10 项（文档漂移/环境产物卫生/lint/CI 顺序/测试分层/插件类型/属性测试等） | §9 表 | 按 §9 优先级清债 |

---

## 1. 评审边界、实测记录与快照说明

### 1.1 对象身份

| 对象 | 身份 | 本报告使用方式 |
|---|---|---|
| famling 桌面应用（私有完整仓） | `DG/` HEAD `779354b`（2026-11-19 10:57:00 +0800），`package.json` 0.1.0，Tauri product `DesktopGames`，identifier `com.perrylink.desktopgames` | 主要评审对象：源码、测试、脚本、CI、发布链 |
| dsh-famling DSH 插件 | `DF/` 0.10.0，本地目录无 `.git`；`client.js` 66.1 KiB（入口），3 个 lazy chunk 共 313.5 KiB | 宿主桥接/客户端行为/测试门禁 |
| DSH 宿主 | `/home/yy/deepseek-harness` 0.2.2-rc.4，HEAD `ca33fd6843` | 只读核对插件依赖的宿主契约 |

### 1.2 本轮实际执行（只读；不写仓库文件）

| # | 命令 | 结果 | 用途/备注 |
|---|---|---|---|
| 1 | `cd DG && node --import tsx --test tests/*.test.ts` | **1094 tests / 1089 pass / 5 fail / 0 skipped / 28.9 s**（12:52–12:53） | 当前工作树；失败均在并行改动中（§1.4） |
| 2 | `cd DG && npm run typecheck` | **exit 2**；4 个错误全在 `tests/content-hub.test.ts`（`ContentHubOptions.select` 不存在等） | 当前工作树 WIP；HEAD 导出为 exit 0 |
| 3 | `cd /tmp/qa-head && node --import tsx --test tests/*.test.ts`（`git archive HEAD` 导出 + 链入 node_modules） | **1046 tests / 1037 pass / 4 fail / 5 skipped** | HEAD 基线；4 fail 中 2 个环境专属、2 个干净 checkout 必然红（§5.2） |
| 4 | `cd /tmp/qa-head && node --import tsx --experimental-test-coverage --test-coverage-include='src/**/*.ts' --test tests/*.test.ts` | **all files: lines 91.11 / branches 80.74 / functions 87.26**；11 个源文件未被加载 | 覆盖率真实口径（§2.2） |
| 5 | `cd DF && npm test` | **76 tests / 76 pass / 0 fail**（3.5 s） | 插件当前树 |
| 6 | `cp -r DF /tmp/qa-plugin && cd /tmp/qa-plugin && node --test test/*.test.js` | **76 tests / 74 pass / 2 skipped** | 模拟公开仓（无私有资产）视角；2 个一致性门直接 skip |
| 7 | `cd DF && npm run check:anims && npm run verify:anims` | 均 exit 0；首屏 66.1 KiB、首帧 127.9 KiB、全量 313.5 KiB | 动画嵌入门禁当前绿 |
| 8 | `cd DG && npm run version:check` | 6 个版本镜像 = 0.1.0，ok | 版本单一真源有效 |
| 9 | `cd DG && node scripts/legal-check.mjs` / `--strict` | WARN-ONLY **34** / **BLOCKED 34** | 发布法务门未过（已知外部阻塞） |
| 10 | `cd DG && npm run validate:content && verify:pack && fci:validate && art:check-specs` | 全部 exit 0（content 3 文件、pack 2 包、FCI 输出、7 个 art spec） | 内容/pack/角色契约门有效 |
| 11 | `cd DG && node scripts/release-sign.mjs --plan --json && node scripts/repro-check.mjs --check-inputs --json` | 均 exit 0；repro 有 5 个 warn（非 npmjs 镜像 112/112、脏树、无 tag、runner 浮动、SOURCE_DATE_EPOCH 未设） | CI 签名/repro smoke 本机可用 |
| 12 | 读 `git status/log/remote/tag`、artifacts 目录、E2E 脚本与文档 | 见 §4、§5、§6 | 静态与计数证据 |

> 说明：1–2 是工作树快照，3–4 是 HEAD 干净导出（`git archive` 不含未跟踪文件）。两者的差异（1,094 vs 1,046、5 fail vs 4 fail）正好量化了并行未提交改动（内容中心 task-50/54）的规模。

### 1.3 未执行（不得当作通过）

- 未启动 Tauri/WebView2/GUI，未跑 `npm run e2e:tauri`、`scripts/cdp-*.mjs`、`--reset-saves`、NSIS 构建/安装/卸载/升级。
- 未跑 24h soak、DPI/多屏、真实 TTS/ASR、真实 DSH Host 的插件联调、npm 发布、Authenticode 签名。
- 未联网核对 `PerryLink/famling`、`PerryLink/dsh-famling` 的 GitHub Actions 结果；本报告对公开仓 CI 的结论只来自本地模拟与文档。
- 未读其他评审者（架构/软件/网络/游戏/心理/UX）的报告，避免交叉污染。

### 1.4 工作树非绿说明（不能归因于产品）

评审期间（12:52–12:59）工作树正被并行任务修改：`src/pet/content-hub.ts` mtime 12:56:49、`tests/content-hub.test.ts` 与 `src/pet/main.ts` mtime 12:59:53、`src/pet/desktop-shell.ts` 与 `pet.html` mtime 12:51:40。**5 个失败与 4 个 tsc 错误全部落在这批未提交的内容中心改动内**（`tests/content-hub.test.ts:1004` 引用尚不存在的 `ContentHubOptions.select` 等）。HEAD 干净导出 typecheck 为 exit 0。因此：这是并行协作/门禁缺失的证据（见 P0-2），不是 HEAD 产品缺陷；但也说明当前任何全绿声明都没有 commit 绑定。

---
## 2. 测试金字塔现状

### 2.1 分层清点

| 层 | 数量/形态 | 代表证据 | 评价 |
|---|---|---|---|
| L0 纯函数/数据契约单测 | 约 100 文件；HEAD 1,046 用例 | `DG/tests/kernel*.test.ts`、`content-library.test.ts`、`pet-anim*.test.ts`、`security-*.test.ts` | **强**：确定性、快、fail-closed 语义覆盖好 |
| L1 行为/集成（注入 storage/DOM/canvas） | 8 个文件用 fake DOM/canvas；插件 38 个 client-behavior + 14 host-bridge | `DG/tests/render-plugin.test.ts`、`hero-runtime.test.ts`、`content-hub.test.ts`、`DF/test/client-behavior.test.js` | **中**：注入式设计好，但没有真实 DOM 事件/布局 |
| L2 静态/源码断言 | **19 个纯静态文件**；63 个文件读取源码文本 | `DG/tests/consent-static.test.ts`、`trust-wiring-static.test.ts`、`ui-assets.test.ts`、`DF/test/client-static.test.js` | **脆**：能防删门禁，不能防行为回归；误报/漏报都高 |
| L3 Rust | app crate 8 个 `#[test]`（main 5 / secret 1 / voice 2）+ `native/dlc-verify` 19 个 | `DG/app/tauri/src-tauri/src/*.rs`、`DG/native/dlc-verify/src/lib.rs` | **偏薄**：窗口/ACL/save 命令无 Rust 集成测试；build.rs 有 ACL 漂移门（见 P1-6） |
| L4 真实浏览器/GUI | **0 个自动化**；20 个 CDP 手工脚本 + 1 个 Windows PS1 编排 | `DG/scripts/cdp-*.mjs`、`DG/scripts/e2e-tauri.ps1` | **弱**：不进 CI、非隔离、不可移植 |
| L5 CI | **0 次实际运行** | `DG/.github/workflows/ci.yml`、`release.yml`、`DF` 无 CI | **空转** |
| L6 性能/稳定性 | 24h soak 脚本存在但当前 HEAD 无 24h 记录；bench/FPS 为手工 | `DG/scripts/soak*.mjs`、`DG/src/qa/soak.ts`、`DG/artifacts/tauri-soak.json`（11-14，5 min） | **未形成验收证据** |

### 2.2 覆盖率的真实口径

HEAD 干净导出的 Node 内置覆盖率为 **91.11% lines / 80.74% branches / 87.26% functions**（命令见 §1.2 #4）。但这是被测试加载过的文件口径；以下 **11 个文件（4,318 行）从未被任何测试加载**：

| 文件 | 行数（HEAD） | 为什么重要 |
|---|---:|---|
| `src/pet/main.ts` | 3,229 | 桌面应用组合根：启动/同意/读档/存档/TTS/hero/菜单全在这里 |
| `src/pet/consent/setup-page.ts` | 444 | setup 页（年龄/TOS/数据控制入口） |
| `src/pet/shell-layout.ts` | 99 | 气泡/菜单跟随宠物的布局（11-18 新功能） |
| `src/pet/tinglan-lab.ts` | 160 | 角色预览页 |
| `src/bench/run.ts` | 131 | bench 入口 |
| `src/presence/demo.ts` | 116 | presence 演示 |
| `src/stall/audio.ts` | 62 | stall 音频 |
| `src/shell/fullscreen.ts` | 28 | 全屏窗口控制 |
| `src/voice/system.ts` | 25 | 浏览器 SpeechSynthesis provider（真实 TTS 最后一跳） |
| `src/shell/window.ts` | 15 | 窗口控制 |
| `src/content/aquarium.ts` | 9 | content 数据 |

另外 `hit-regions.ts` 只有 **56.77% lines / 33.33% functions**：`DG/tests/hit-regions.test.ts:11-31` 的 4 例只覆盖 `opaqueTilesFromAlpha` 纯函数，`collectHitRegions`、`collectHeroOpaqueRegions`、`startHitRegionSync`（`DG/src/pet/hit-regions.ts:94-229`）全部无测试——而这是透明窗点击穿透这件 11-18/11-19 反复实机修的功能。`src/voice/tauri.ts` 71.25%（Rust 代理路径）。

**结论**：把未加载文件按 0 计入，项目级行覆盖大约只有八成出头（粗算，不作为精确指标）；更关键的是最大、最危险、最容易回归的文件恰好不在分母里。覆盖率应当先补分母，再谈百分比。

### 2.3 静态源码断言层：好用但有上限

19 个纯静态文件（不 import `src/`，只读文本）：`age-ui`、`ai-label`、`character-validation`、`consent-static`、`dlc-import-safety`、`input-safety-static`、`legal-package-*`（4 个）、`oc-consistency`、`release-sign`、`tauri-pet-window`、`tooling-paths`、`trust-wiring-static`、`tts-bake-script`、`ui-assets`、`use-restrictions`、`voice-switch-static`。它们适合做策略/声明/配置类不可回归断言（例如 AI 标识不能被删、Tauri capability 不能扩权、法务短句哈希稳定），但两类问题会累积：

1. **伪覆盖**：`main.ts` 的关键行为用源码字符串断言，例如 P0 恢复链：`DG/tests/consent-static.test.ts:225` 只 `assert.match(main, /setInterval\(\(\) => \{\n\s+if \(!canInteract\(\) \|\| saveRecoveryNeeded\) return/)`。若把 autosave 逻辑抽走/改写成 guard 函数，字符串变、行为对也会红；反之若保留字符串但恢复顺序写错，测试不会红。
2. **测试成本转嫁给重构**：`main.ts` 因顶层 DOM/CSS 副作用无法在 Node import，`DG/tests/p1-gates.test.ts:170-195` 用 TypeScript AST 截取声明→转译→data URL import 来测 3 个 helper；`:255+` 再用 `main.indexOf(...)` 做门禁在写入之前的顺序断言。这类测试每次重构 `main.ts` 都要跟着改，而且证明力弱。

### 2.4 值得保留并推广的部分

- **fail-closed 语义测试**：`tests/security-storage-fetch.test.ts`（缺/坏/未来版本/quota/serialize/超大都是状态而非抛异常）、`tests/consent.test.ts:355,367`（坏同意 JSON 重新弹窗）、`tests/kernel-hardening.test.ts`（不可信存档逐字段校验）、`tests/game-dom-safety.test.ts`（DLC/存档字符串只当文本）。
- **超时/中止的 never-settle 测试范式**：`DG/tests/advisers-harden.test.ts:31-46` 的 `neverSettles<T>()` + 20 ms 超时断言；这是本仓最应该复制到 IPC/baked/插件 bridge 的模式。
- **动画契约/金标准**：`tests/pet-anim*.test.ts` 锁定帧数/尺寸/alpha/轮廓/接地线/腿长等（11-18 到 11-19 的 v4→v11 迭代靠这些测试收敛）。
- **插件行为 harness**：`DF/test/client-behavior.test.js` 用 fake React + fake timers + 真实 lazy chunk 执行，能在无 DOM 下覆盖 38 个客户端行为；`DF/test/host-bridge.test.js` 用 fake context 覆盖 14 个 host 分支。这比只测纯函数前进了一大步。

---

## 3. 回归覆盖矩阵（近期 P0/P1 修复 × 测试）

| 修复/能力 | 实现位置 | 现有回归证据 | 判定 |
|---|---|---|---|
| 坏档恢复链（坏 primary 不覆盖好 .bak、autosave 暂停、浏览器保留上一版） | `DG/src/pet/main.ts:1728-1902`、`:2139-2148` | 仅源码正则 `tests/consent-static.test.ts:225`；`saveRecoveryNeeded` 无行为测试；`tests/save-journal.test.ts` 测的是另一套 journal（没接到 pet） | **✘ 行为级缺失** |
| Tauri IPC 8 s 超时 + saveInFlight 复位 | `DG/src/pet/main.ts:1689-1700,1783-1795` | 全仓 grep 无 `invokeTimed`/never-settle 测试 | **✘** |
| baked TTS manifest 8 s 超时/重置 | `DG/src/voice/baked.ts:219-240` | `tests/voice-baked.test.ts` 仅 1 个基础用例；无超时/重置测试 | **✘** |
| 插件 bridge 三路 AbortController + in-flight 防重 | `DF/client.js:789-848` | 无 timeout/abort/重复点击测试（测试名里也只有动画 timer） | **✘** |
| 插件 brief TTL / displayPolicy / counts 校验 | `DF/index.js:101-130` | host-bridge 只有 happy path + 文件缺失；过期/畸形 counts/`none` 无测试 | **✘**（审计 F-01/F-04 建议未落地） |
| 插件 private brief 30 s 自动隐藏/失焦隐藏 | `DF/client.js:605-615,797-801` | 无测试（审计 `DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md:145-146` 明确建议补） | **✘** |
| Advisers Face 读超时/中止/重试/stop | `DG/src/pet/advisers/face.ts` | `tests/advisers-harden.test.ts:31-46,251-258` never-settle + 重试 | **✓ 标杆** |
| Tauri 命令 ACL（23 命令 × 7 窗口） | `DG/app/tauri/src-tauri/build.rs:32-90`、`capabilities/pet-shell.json` | build.rs 构建期漂移门 + `tests/tauri-pet-window.test.ts:67` 静态 capability 测试 + 11-19 手工 CDP 141 断言（证据在 `_scratch`，不在仓） | **△ 运行时未 gate** |
| consent 宿主门（窗口/槽位/语音/DLC） | `DG/app/tauri/src-tauri/src/main.rs` 多个命令 | `tests/consent-host-gate.test.ts` 以静态 + 纯函数为主；Rust 命令集成无测试 | **△** |
| DLC 签名/信任根 | `native/dlc-verify` + TS pack loader | Rust 19 tests + TS pack 正反例；CI 有 `rust-dlc` job（若运行） | **△ 依赖 CI 运行** |
| DOM 注入改为安全文本节点 | `DG/src/**`（innerHTML 0 处）+ 游戏页 | `tests/game-dom-safety.test.ts`、`input-safety-static` 静态为主 | **△** |
| 使用限制免责声明（两产品/法务包） | README/setup/About/TOS/插件 README/LEGAL-NOTICE | `tests/use-restrictions.test.ts`（3 例）——但读取仓外 `../plugins/...`，干净 checkout 必红（§5.2） | **△ 门不可移植** |
| 发布签名/可复现打包 | `.github/workflows/release.yml`、`scripts/release-sign.mjs`、`release-win.mjs`、`repro-check.mjs` | `tests/release-sign.test.ts` 21 例（部分依赖 PowerShell）+ 本轮 smoke；CI 从未跑 | **△ 代码有、执行无** |

---

## 4. GUI 测试数据隔离（P0-1）

### 4.1 证据链：一条 `-ResetSaves` 如何删掉真实用户存档

~~~
e2e-tauri.ps1:15  Invoke-Cdp(..., [switch]$ResetSaves)
e2e-tauri.ps1:24    $args += '-ResetSaves'
e2e-tauri.ps1:69/79/83/88/95  -ResetSaves（stall/stallDemo/town/pet/petPortable）
        ↓
cdp-launch.ps1:9   [switch]$ResetSaves
cdp-launch.ps1:31  if ($ResetSaves) { $argList += '--reset-saves' }
        ↓
main.rs:952-959    if args 含 --reset-saves {
                     read_dir(app_data_dir()/saves) → remove_file(每一条) }
实际路径 = %APPDATA%/com.perrylink.desktopgames/saves（Tauri Known Folder）
~~~

同时 `e2e-tauri.ps1:51` 显式断言真实路径：`$saveFile = Join-Path $env:APPDATA 'com.perrylink.desktopgames\saves\p0.json'`。也就是说这个 E2E 测试的正确性依赖用户真实存档目录里有测试要的文件。

### 4.2 已经造成的事故（有文档记录，非本报告推测）

`DG/docs/audit/RESOLUTION-TAURI-ACL-2026-11-19.md:280`（R8）与 `DG/docs/audit/RESOLUTION-CONSENT-GATE-2026-11-19.md:107,153` 记录了 2026-11-19 09:55–09:58 的 GUI 探针期间：

- 真实 `%APPDATA%/com.perrylink.desktopgames/saves/pet.json`（09:56:12）与 `pet.json.bak`（09:55:42）mtime 被改；
- 同时出现测试写入的 `consent/host-consent.json`（09:56）；
- 原文结论：pet.json 原始内容**无法还原**；建议后续 GUI 测试先备份/隔离 appdata（`-BackupAppData` 只是人工可选项）。

这说明不是理论风险，而是已经发生过一次真实用户数据被测试污染。对桌宠产品，存档就是用户资产（记忆/折页/亲密度），应视为 P0。

### 4.3 为什么不能靠 `%APPDATA%` 重定向

Tauri 的 `app_data_dir()` 走 Windows Known Folder（`SHGetKnownFolderPath`），不是读 `%APPDATA%` 环境变量。因此 `$env:APPDATA = 临时目录` 对应用无效；`REMAINING-WINDOWS-QA.md` §4.5 已经给出正解（方案 B）：`tauri::generate_context!()` 后若存在 `DG_QA_DATA_DIR`，用 `context.config_mut().app.app_directories_override = Some(AppDirectoriesOverride::Root(dir))`（Tauri 2.12.5 官方模式，6–10 行，生产零影响）。本轮全仓 grep `DG_QA_DATA_DIR|app_directories_override`：**源码/脚本/测试 0 命中**（仅 build 产物二进制命中），即该修复尚未落地。

### 4.4 其他隔离面

| 面 | 现状 | 风险 |
|---|---|---|
| WebView2 profile | 每个 CDP 用例新建 `artifacts/cdp-wv2-<guid>`（`cdp-launch.ps1:20`），但**不清理** | `artifacts/` 实测 12 GB、941 个残留 profile；跨用例缓存/状态不可控 |
| 应用数据（saves/consent/voice quota/window） | 真实 `%APPDATA%/com.perrylink.desktopgames` | 测试会读写/删除真实数据（4.1/4.2） |
| 浏览器 localStorage | 所有页面同源共享 `desktop-games/*` 键（`consent/*`、`pet/*`、`content/*`；见 `src/pet/security/safe-storage.ts` 与各模块常量） | 同源游戏页/预览页可读写 pet 偏好/同意审计；测试无法保证不碰真实 profile；11-18 handoff 仍把同源 localStorage 共享列为 blocker |
| DSH 插件 GUI | 插件被安装进真实 `~/.dsh/profiles/web`，靠 `dsh plugin remove/add` + 重启验证；`DF/test` 全是 fake host | 插件 GUI 冒烟没有隔离的 DSH_HOME/profile；安装态还会被外部重置换掉（handoff §12 多次记录） |
| 测试中的 localStorage | 单测全部注入 fake storage（好），但**没有真实浏览器级测试**证明跨页面隔离 | 产品层同源共享问题不会被单测发现 |

### 4.5 目标隔离模型（建议直接写进 E2E/门禁）

1. **代码级 override**：Rust 启动时读 `DG_QA_DATA_DIR`，仅当该 env 存在时 override app data root；启动日志打印一次 QA data dir = 绝对路径（无敏感信息）；生产不设 env 即零影响。验收：单测 + 手工 `--reset-saves` 只作用于临时目录。
2. **测试侧强制**：`e2e-tauri.ps1` 在启动前创建 `%TEMP%/dg-e2e-<guid>`，设置 `DG_QA_DATA_DIR`，结束后 `try/finally` 删除；**若未设置该 env，脚本直接失败退出**（fail-closed），不再允许默认跑真实 appdata。
3. **前后快照断言**：E2E 开始前对真实 `%APPDATA%/com.perrylink.desktopgames` 做文件清单+哈希快照，结束后比对；任何变化 → 测试判 FAIL 并保留 diff 清单（防止未来再出现 4.2 的事故）。
4. **`--reset-saves` 收窄**：只删 `*.json/*.json.tmp/*.json.bak`（`main.rs:653` 已有 delete_save 的精确实现可复用），且要求同时设置 `DG_QA_DATA_DIR` 否则拒绝执行并报错；禁止整目录 read_dir 全删。
5. **浏览器/插件 GUI**：浏览器测试用独立 port + 独立 browser profile（临时 user-data-dir）；DSH 插件 GUI 冒烟用 `mkdtemp` 的 DSH_HOME/profile（符合工作区测试用临时 DSH_HOME 红线），安装/卸载只对该临时 profile 生效。
6. **CI 证明**：在 E2E 脚本里断言真实 appdata 未被触碰（4.5 第 3 条的哈希比对），作为 release 前必过步骤。

---

## 5. CI 门禁（P0-2）

### 5.1 现状

- **从未运行**：`DG` 无 remote、无 tag（`git remote -v` 空、`git tag` 空）；`ci.yml:3` 与 `preflight.mjs:3-8` 自述等 remote 才有 CI；`release.yml` 只在 push tag 时触发。
- **设计内容（纸面）**：linux job：version→typecheck→unit test→build→validate:content→verify:pack→art:check-specs→fci:validate；windows job：version→unit test→build；`rust-dlc` job：`bash scripts/test-dlc-rust.sh`；`rust-tauri-tests`（Windows，cargo test）**`continue-on-error: true`**（`ci.yml:117-124`）。
- **本地唯一门** `npm run preflight`：version→typecheck→test→validate:content→verify:pack→FCI→（非 fast）build；`--rust` 可选。**不含**：插件测试/门禁、E2E、soak、覆盖率、lint、Tauri 构建、安装包、签名。
- **当前工作树**：typecheck exit 2、5 tests fail（并行内容中心改动）；HEAD 干净导出 typecheck 0、4 fail/5 skip（见 5.2）。

### 5.2 如果今天启用 CI 会发生什么（HEAD 干净 checkout 实测）

| 结果 | 测试 | 原因 | 在 GitHub runner 上是否同样发生 |
|---|---|---|---|
| **FAIL** | `ui-assets`：contact sheets + verify report exist and reflect 91/97 | 读取 `art/_placeholder/ui-91-2026-11-17/contact-sheet.png`，但 `art/_placeholder/*` 被 `.gitignore:25` 忽略，干净 checkout 没有该文件 | **是**（任何平台） |
| **FAIL** | `use-restrictions`：both products expose the use restriction ... | entries 含 `../plugins/dsh-famling/{README.md,docs/...}`（`tests/use-restrictions.test.ts:42-44`），单独 checkout 本仓时不存在 | **是**（任何平台） |
| FAIL（环境专属） | `release-sign` 2 例（authenticode-report / reproducible-zip） | WSL 有 `powershell.exe` 但 `/tmp` 路径无法映射到 Windows 盘（`toWindowsPath` 只认 `/mnt/<drive>/`） | 否（GitHub ubuntu 无 powershell.exe 会 skip；Windows runner 用 win32 路径分支） |
| SKIP | dist 相关 3 例 + release 产物 2 例 | dist/ not built yet (CI runs unit tests before the Vite build) / release artifacts unavailable | **是**：CI 顺序就是 test→build，且 release job 不在 CI |

> 结论：**CI 配置里 Unit tests 这一步在干净 checkout 上是红的。** 这比 CI 没跑更严重——说明即使补了 remote，门禁也不会自动变绿；必须先修测试的仓库外依赖/被忽略产物依赖。

### 5.3 插件（DF）门禁缺失

- `DF` 目录无 `.github/workflows`，无 `prepack`（`package.json` scripts 只有 test/check/verify/embed/measure/qa）；npm 发布前没有任何强制测试/一致性门。
- 一致性测试在缺少私有资产时跳过：`test/client-static.test.js:163-168`（regions/actions 对比）与 `:210-215`（嵌入动画 vs 资产源 `verifyClient`）。公开仓 CI 完美绿，但**不校验嵌入数据是否过期**。
- 本地实跑：私有资产在场 76/76；复制到 /tmp 后 74 pass + 2 skip——证明上述判断。
- `host-bridge.test.js` 全部用 fake context（`mkdtemp` 只用于 brief 文件），**没有真实 DSH Host 的契约测试**；`engines.dsh >=0.2.1-rc.5 <0.3.0` 是声明，宿主不强制。

### 5.4 E2E 可移植性/卫生

| 问题 | 证据 | 后果 |
|---|---|---|
| 硬编码 Windows 路径 | `cdp-launch.ps1:20,23,35`（`D:/Projects/...`、`C:/Program Files/nodejs/node.exe`）；`e2e-tauri.ps1:1` 根目录默认 `D:/...` | 换机器/CI 直接失败；WSL 只能经 `powershell.exe` 触发 |
| 固定等待 | `cdp-launch.ps1:36` `Start-Sleep -Seconds 6`，每个用例一次 | 12 组 × 6 s 起，慢且 flaky；没有 `/json` 就绪轮询 |
| 固定端口 | `cdp-launch.ps1:19` `--remote-debugging-port=9333` | 不能并行；残留进程会串台 |
| profile 不清理 | 941 个 `artifacts/cdp-wv2-*`、`artifacts/` 12 GB | 磁盘与状态污染；无法证明每轮从干净状态开始 |
| 无 provenance | `artifacts/e2e-tauri.json` 11-14 旧文件，无 commit/version/exe hash | 结果无法绑定到产物；旧结果永久可被误读 |

### 5.5 建议的门禁分层

| 层 | 触发 | 必跑（建议） | 目标时长 | 阻断策略 |
|---|---|---|---|---|
| **Tier 0（每次提交/PR）** | pre-commit / PR | `version:check`、`typecheck`、`npm test`（修好干净 checkout）、插件 `node --check + npm test + check:anims + verify:anims`、内容/pack/FCI、覆盖率 ratchet（改动文件 ≥90%，全仓不下降）、lint（新增） | ≤5 min | required，红即禁止合并 |
| **Tier 1（夜间/每日）** | schedule | 无 Windows 依赖的 headless 浏览器 E2E（Vite preview + Playwright/CDP）：pet 首启/同意门、内容中心 4 tab、hero 四渲染器、hit-region rects、localStorage 隔离；Rust dlc + app（Linux 可跑部分）；30 min soak 模拟；插件 fake-host 全量 + 1 条真实 DSH 契约 smoke（固定 DSH checkout 版本） | 15–30 min | 红即 issue + 阻断 release 分支 |
| **Tier 2（Release，Windows runner）** | tag/手动 | Windows 构建（signed/unsigned 策略）、ACL 141 断言矩阵（脚本入库）、安装/卸载/覆盖升级保留存档、24h soak（nightly/weekly 亦可）、SHA256SUMS/RELEASE-MANIFEST/build-info、legal-check --strict、插件 `npm pack` + prepack 门 | 2–3 h + 24h | 缺任一项不得对外发布 |

补充规则：

1. `rust-tauri-tests` 的 `continue-on-error` 只允许作为临时实验；建议跑绿 3 次后转 required（ACL 是安全门，不能长期不阻断）。
2. repro-check 的 `clean-tree`/`head-tag` warn 在 release 模式应升为 error（`--release` 已有该语义，需接到 Tier 2）。
3. 所有测试证据落 `artifacts/qa/<date>/<run-id>/`（或 CI artifact），**禁止只在 `_scratch`/聊天/handoff 正文里**。
4. 禁止在 CI 上跑会触碰真实 appdata 的脚本（见 §4）。

---

## 6. 发布验收

### 6.1 当前就绪度（发布视角）

| 验收项 | 现状 | 证据 | 判定 |
|---|---|---|---|
| 版本单一真源 | 6 个镜像一致 = 0.1.0 | `npm run version:check` 本轮 ok | ✔ |
| 法务发布门 | WARN 34 / strict BLOCKED 34（DRAFT 文本、隐私政策等） | `node scripts/legal-check.mjs --strict` | ✘（外部/法务阻塞，已知） |
| 签名 | 本机产物 `NotSigned`；签名流水线有代码但从未执行 | `docs/audit/RESOLUTION-AUTHENTICODE-2026-11-19.md:29-36`；无 remote/tag | ✘（证书外部） |
| 可复现构建 | `repro-check --check-inputs` 通过但有 5 个 warn（非 npmjs 镜像 112/112、脏树、无 tag、runner 浮动、SOURCE_DATE_EPOCH 未设） | 本轮实跑 | △ |
| 产物归档/provenance | `artifacts/` 无 `SHA256SUMS.txt`/`RELEASE-MANIFEST.json`/`build-info.json`；`e2e-tauri.json` 11-14 旧文件 | `ls artifacts/`；handoff 只给文字哈希 | ✘ |
| 当前 HEAD 的 Windows 构建证据 | 最新 exe 哈希只写在 handoff 正文；构建时间/大小/哈希没有机器可读记录绑定到源码 commit | handoff §12 若干条 | ✘ |
| 安装/卸载/覆盖升级 | 无当前 HEAD 证据；`e2e-tauri` 不管安装；REMAINING-WINDOWS-QA IN1–IN7 未执行/未归档 | `DG/docs/research/REMAINING-WINDOWS-QA.md`、`RELEASE-CHECKLIST.md` | ✘ |
| 24h soak | 只有 11-14 的 5 min soak；`artifacts/tauri-soak-24h.json` 不存在；24h 模拟测试不能替代墙钟 | `DG/artifacts/`、`DG/docs/SOAK-24H*.md` | ✘ |
| E2E | 20 个手工 CDP 脚本 + Windows-only PS1；11-19 ACL 141 断言证据在 `_scratch`（不在仓、不可复核） | §4/§5.4 | ✘ |
| 插件发布 | 无 prepack/CI；公开仓视角 2 个一致性门 skip | §5.3 | ✘ |

### 6.2 建议的发布验收门（最小闭环）

1. **绑定身份**：`package.json`/Tauri/Cargo/CHANGELOG/tag 一致；`git status --porcelain` 为空；`git rev-parse HEAD` 写进 release manifest。
2. **绑定产物**：`release-win --all --strict` 产出 `SHA256SUMS.txt` + `RELEASE-MANIFEST.json` + `build-info.json`（commit/version/时间/WebView2/Rust/Node）；`release-win --verify` 通过。
3. **绑定测试**：E2E JSON 带 `{commit, exeSha256, webview2Version, osBuild, startedAt}`；ACL 141 断言脚本入库并带同样 provenance；24h soak JSON 带 provenance 且 `soak:analyze` 默认门 PASS。
4. **绑定数据安全**：E2E/soak 全部在 `DG_QA_DATA_DIR` 临时目录 + 前后真实 appdata 快照一致（§4.5）。
5. **绑定法务**：`legal-check --strict` 绿（当前 34 blockers，需 owner 决策）。
6. **签名策略**：签名的 tag 构建必须成功；unsigned 只能走显式 preview 且产物名/README/商店页标注；`get-authenticode-signature` 结果进 artifacts。
7. **安装验收**：干净机器/VM 安装→启动→读旧档→卸载保留存档 的 5 条断言（可从 REMAINING-WINDOWS-QA IN1–IN7 裁剪）+ 截图/日志归档。
8. **插件发布**：`prepack` = `npm test && npm run check:anims && npm run verify:anims`；无私有资产环境下这两个门要么有 vendored fixture 要么失败而不是 skip。

### 6.3 性能/稳定性验收缺口

- 24h 墙钟缺失；现有 `soak-simple.ps1` 只在结束时写 JSON、不采 CPU/FPS、不检测提前退出（`REMAINING-WINDOWS-QA.md` §3.3 已指出）。
- FPS/启动时间/DPI/多屏均为手工（`look-test-shots` 只跑 100/125/150 的 mock HTML、无断言）。
- 建议把 30 min 浏览器 soak + 24h Tauri soak 分成 nightly 与 release 两级；判定阈值沿用已有 `src/qa/soak.ts` + `soak-analyze.mjs`（private <350 MB、斜率 <1 MB/h、handles 漂移 ≤200、gap ≤2.5×）。

---

## 7. 故障注入矩阵

| 故障类 | 期望行为 | 现有覆盖 | 缺口/建议 | 优先级 |
|---|---|---|---|---|
| 存档 JSON 损坏/字段类型错 | 拒绝或降级、不崩、进入恢复 | `tests/kernel-hardening.test.ts`（坏数值/超长 memory/敌意字段）；`tests/pet.test.ts` 坏档回退 | 恢复链本身无行为测试（§3） | **P0** |
| primary 坏、.bak 好 | 从 .bak 恢复且不覆盖好备份 | 无（仅 journal 模块有 `tests/save-journal.test.ts:9`） | 抽 `save-journal`/新模块接 pet；补 fake invoke 测试 | **P0** |
| DPAPI 解密失败/凭据迁移 | 不覆盖、提示、可恢复 | `tests/pet-crypto.test.ts` 部分（加解密）；失败路径未接恢复链 | 同上 + 浏览器 IndexedDB key 丢失场景 | **P0** |
| 磁盘满 ENOSPC | fail-closed、不产生半份文件 | **全仓 0 命中**（grep `ENOSPC` 无） | Rust 测试用只读/小容量目录/注入错误；JS 用 fake storage 的 quota 状态（已有 `tests/security-storage-fetch.test.ts:158` 可扩展） | **P1** |
| 只读/被锁文件（杀软/OneDrive） | 有界超时、错误提示、不永久挂起 | 无 | 用 fake invoke never-settle（照 `advisers-harden` 模式）+ Windows 手工锁文件 | **P1** |
| 写档中途崩溃/断电 | .tmp + rename 原子；.bak 也原子 | `write_save` tmp+rename 有（`main.rs:601-610`）；`.bak` 用 `fs::copy` 非原子（`:597-600`） | 修 .bak 也走 tmp+rename；注入 copy 中途 kill 测试 | **P1** |
| 网络 4xx/5xx/断网（TTS/ASR/LLM/分享抓取） | 超时/重试/降级、不重复计费 | `tests/voice.test.ts`/`voice-hardening`/`fetch-timeout` 有；分享抓取有 Rust 超时 | 真实运行时的 ASR 断网/额度、插件 chat 断网 UI 态无测试 | **P1** |
| manifest/资源 fetch 挂起 | 超时后 fallback，不永久 loading | baked 有 8 s 超时但无测试；hero/character fetch **无超时**（`PET-ROBUSTNESS-AUDIT` P2-06） | 抽 `fetchWithTimeout` 并接 hero/baked；never-settle 测试 | **P1** |
| 超大输入/解压炸弹 | 有界拒绝、不 OOM | pack/zip/content 有上限（`content-library`、`dlc-import-safety`）；archive 无总解压/文件数上限（P2-05） | 在纯函数层补上限测试（低风险可先做） | **P2** |
| 坏/过期 Pet Brief | 拒绝显示、TTL、隐私折叠 | 消费端 `src/presence/pet-brief.ts` 严格 + tests；**插件 host 端 TTL 无负向测试** | 补 host 端过期/畸形 counts/displayPolicy 测试 | **P1** |
| 并发保存/重复操作 | 单飞、幂等、不重复副作用 | `saveInFlight` 有代码无测试；插件 `bridgeInFlight` 有代码无测试；task 创建无幂等 | 补并发测试 + 插件 host 端 task 去重 | **P1** |
| 双实例/多窗口同写存档 | 单实例或文件锁 | 无 single-instance 实现/测试（REMAINING-WINDOWS-QA T11 预期起 2 实例） | 加 single-instance 插件或锁文件 + 测试 | **P2** |
| 时钟回拨/跨日配额 | 不重复领奖/预算正确 | `tests/wall-clock.test.ts` 有；VoiceService 日界用 UTC（P2-19） | 产品日界与配额一致性测试 | **P2** |
| 供应链（npm 镜像/浮动 runner） | 可复现/可审计 | `repro-check` warn 非 npmjs 112/112；runner latest 浮动 | 固定 registry+镜像 URL、固定 runner 版本或记录 | **P2** |

**最小可落地 10 条注入用例**（按性价比）：

1. fake invoke `read_save`：primary 坏 JSON / .bak 好 → load 成功且 `saveRecoveryNeeded` 语义正确；
2. fake invoke `write_save`：recovering 期间 `backup:false`，断言不覆盖 .bak；
3. fake invoke `read_save/write_save` never-settle → 8 s 超时 + saveInFlight 复位 + 用户可见失败；
4. baked manifest fetch never-settle → 8 s 降级到下一 provider + 下次可重试；
5. 插件 client fetch never-settle → 8/15/45 s 三路超时 + 按钮恢复 + 不重复发请求；
6. 插件 host 过期/畸形 brief → 404/E_MEMORY，且不投影字段；
7. 插件 private brief → 30 s 自动清空 + blur/visibility 立即隐藏；
8. Rust：saves 目录只读 → write_save 返回结构化错误（不 panic）；
9. Rust：`--reset-saves` 在未设 `DG_QA_DATA_DIR` 时拒绝；
10. E2E 前后真实 appdata 哈希一致（隔离证明）。

---
## 8. 关键测试矩阵（目标状态）

图例：✔ 有且足够 · △ 部分/需补 · ✘ 缺 · — 不适用。

| 功能面 | 单元/行为 | 集成/DOM | 真实 GUI E2E | 故障注入 | CI gate | 目标/缺口 |
|---|---|---|---|---|---|---|
| kernel/存档迁移 | ✔ | △ | ✘ | △ | △ | 补跨版本/旧档迁移到真 Tauri |
| save 恢复链 | ✘ | ✘ | ✘ | △ | ✘ | **P0**，抽模块 + fake IO + Tauri E2E |
| storage 配额/损坏 | ✔ | △ | △ | △ | △ | quota/ENOSPC 场景补全 |
| pack/DLC 验签 | ✔ | △ | △ | ✔（篡改） | ✔（rust-dlc） | 生产信任根/重签 ceremony 外部 |
| FCI/角色校验 | ✔ | △ | — | ✔ | ✔ | 已较好；补 data-only 深度上限 |
| hero/动画渲染 | ✔（契约/golden） | △ | △（手工 CDP） | ✘ | ✘ | 补 headless 浏览器渲染 + 视觉快照 |
| hit-regions/点击穿透 | △（纯 tile 函数） | ✘ | △（手工 WindowFromPoint） | ✘ | ✘ | 补 DOM rect 断言 + Tauri 真机矩阵 |
| desktop shell/菜单/composer | ✔（纯函数） | △（fake DOM） | ✘ | △ | ✘ | 补真实 DOM 事件/键盘/焦点测试 |
| content library/hub（新内容中心） | ✔（34+50 例，但当前 WIP 红） | △（fake DOM） | ✘ | △（zip/path/上限） | △ | 等 task-54 收尾后重跑；补视觉/真实 DOM |
| voice TTS/ASR | ✔ | △ | ✘（真实设备/麦克风） | △（timeout/额度部分） | ✘ | 补真实浏览器 SpeechSynthesis/ASR 降级 |
| consent/age/TOS 门 | ✔ | △ | △（11-19 E2E 手工） | ✔（坏 JSON/绕过） | △（静态） | consent-host-gate 接 CI + Rust 集成 |
| Advisers brief | ✔（消费端） | △ | ✘（真实 pet-brief 仅手工一次） | ✔（TTL/超时/隐私） | ✘ | 插件 host 端负向测试 + 真数据链路 |
| 插件 host bridge | ✔（fake ctx） | — | ✘ | △ | ✘ | 真实 DSH 契约 smoke（固定 checkout） |
| 插件 client UI | ✔（fake React） | — | △（真实 DSH 手工） | △ | ✘ | 补 timeout/abort/隐私隐藏测试 |
| Tauri ACL/window/consent | △（build.rs/静态） | ✘ | △（手工 141 断言，证据在 scratch） | △ | ✘ | 脚本入库 + E2E 自动化 + required job |
| 安装/卸载/升级 | — | — | ✘ | ✘ | ✘ | IN1–IN7 自动化/归档 |
| 签名/复现/产物 | △（脚本测试） | — | ✘ | — | ✘ | Tier 2 真跑 + 产物归档 |
| soak/性能/DPI/多屏 | △（判定器） | — | ✘ | ✘ | ✘ | 24h provenance + FPS/CPU 采样 |
| i18n/a11y/法务包 | ✔（静态） | △ | ✘ | — | ✘ | dist 后法律链接测试 + 可访问性快照 |
| 文档/证据一致性 | ✘ | — | — | — | ✘ | 生成式 TEST-STATUS（commit+hash+时间） |

---

## 9. P2 清单（卫生/效率/可维护性）

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| P2-1 | 文档数字/状态漂移且没有 commit 绑定 | `DG/README.md:11` 仍称私有远端已建、CI 首次运行结果见 Actions，而 handoff §2.1 与本机都显示无 remote；README:108 说 125 项、HANDOFF 说 842/982、CONTENT-MARKET 说 1,075/1,075 pass、当前树 1,094/5 fail；`QA-RELEASE-AUDIT.md`（11-15，215 tests）仍在 research 目录且无已过期标记 | 由脚本生成 `docs/TEST-STATUS.md`（commit/hash/时间/命令/数字），历史审计文档加 superseded 头 |
| P2-2 | E2E 卫生：941 个 profile、12 GB artifacts、固定 6 s sleep、固定端口 9333 | 本轮实测 `artifacts/cdp-wv2-*` 941 个、`du -sh artifacts` 12 GB；`cdp-launch.ps1:19,20,36` | 参数化 exe/node/port；轮询就绪；try/finally 清理；artifacts 分级保留 |
| P2-3 | 无 lint/format/覆盖率脚本 | `DG/package.json` scripts 无 lint/coverage；devDeps 无 eslint/prettier；Node 24 内置 coverage 可零依赖起步 | 加 eslint（至少 no-unused-vars/no-floating-promises）+ `test:coverage` 阈值 ratchet |
| P2-4 | CI 顺序导致 dist/法律链接测试永远 skip | HEAD 干净导出 5 skipped；skip 文案明说 CI runs unit tests before the Vite build | 在 build 后加独立 `test:dist` 步骤（或把 build 提到 test 前，代价是慢） |
| P2-5 | 测试未按 fast/full/gui/perf 分层 | 单一 `node --test tests/*.test.ts`（`DG/package.json`）；无标签/目录约定 | 目录或文件名前缀 unit/ integration/ gui/ perf/；preflight 默认 fast |
| P2-6 | 插件纯 JS 无类型检查 | `DF` 只有 `node --check`（`package.json` scripts）；`client.js` 1,000+ 行 | 加 JSDoc + `tsc --checkJs --noEmit`（或迁移 TS），至少对生成块之外 |
| P2-7 | 静态源码断言维护成本高 | 19 个纯静态文件；`main.ts` 用 AST 切片（`tests/p1-gates.test.ts:170-195`） | 保留策略类静态断言；行为类改为 import 纯模块 + fake IO；给静态断言统一 helper/命名 |
| P2-8 | 无 property-based/mutation 测试 | 解析器（save/content-pack/zip/manifest）只有示例测试 | 对 3 个解析器引入 fast-check（或手写生成器）做 round-trip/invalid-input 属性测试 |
| P2-9 | 无 npm 发布/版本演练 | 无 tag、`npm pack` 未在门禁；插件无 prepack | 每轮 release 做一次 `npm pack --dry-run` + 安装到隔离 profile 的 smoke |
| P2-10 | 性能/资源无回归基线 | `bench.json`/`tauri-bench.json` 11-11 旧值；FPS 无断言 | 把启动时间/FPS/内存阈值写进 nightly 报告并归档 |

---

## 10. 优化/重构建议（收益/成本/风险）

| # | 建议 | 收益 | 成本（人日，±50%） | 风险 | 建议阶段 |
|---|---|---|---|---|---|
| R1 | **抽 `src/pet/save-runtime.ts`**：把 `saveNowInternal/loadNow/saveRecoveryNeeded/autosave 调度` 从 `main.ts` 迁出，注入 `SaveIO {read,write,clearBackup}` 与 `clock`，错误分类结构化 | 让 P0 数据链可单测/可故障注入；消除 AST 切片；`main.ts` 降 300–500 行 | 2–3 | 中（重构核心路径，需先补当前行为特征测试/手工 E2E 双跑） | 先做 |
| R2 | **统一 pet save 到 SaveJournal**：用已有 CRC 主备日志（`src/game/save-journal.ts` + 5 个测试）替换 ad-hoc recovery；browser/Tauri 同语义 | 恢复逻辑有现成测试；减少双实现；磁盘/解密失败都可恢复 | 1–2 | 中（存档格式兼容/迁移需 golden 测试） | 先做 |
| R3 | **GUI 数据隔离能力**（`DG_QA_DATA_DIR` + `--reset-saves` 收窄 + 前后快照） | 用户数据安全；测试可重复；E2E 可上 CI | 0.5–1.5 | 低 | 立刻 |
| R4 | **可执行门禁接线**（remote/git hook；修 2 个必红测试；插件 test/check/verify + rust dlc required；`rust-tauri-tests` 转 required；nightly headless E2E） | 回归可被阻断；从人肉绿灯变机器绿灯 | 2–3 | 中（需 GitHub remote/Windows runner/权限） | 立刻 |
| R5 | **引入 Playwright（或复用 CDP）做 headless 浏览器层**：Vite preview + 4 个页面 smoke + content center 4 tab + hero 4 渲染器 + hit-region rects + 视觉快照（可选） | 覆盖真实 DOM/CSS/布局；可在 Linux CI 跑；替代大量手工 CDP | 3–5（含依赖/CI 配置/首版 flaky 治理） | 中（flaky、依赖体积） | 1–2 个迭代 |
| R6 | **插件自包含门禁**：把 spec/资产清单 vendored 或生成 `LOCK.json`，让 `client-static` 两个一致性测试在无私有仓时也能校验；加 `prepack` | 公开仓 CI 不再绿着跳过；发布可自证 | 1–2 | 低–中（需生成/更新流程） | 1 个迭代 |
| R7 | **测试证据流水线**：`artifacts/qa/<date>/<run-id>/` + provenance（commit/exe/WebView2/OS）+ `TEST-STATUS.md` 生成 | 发布验收可复核；历史数字不再漂移 | 1 | 低 | 1 个迭代 |
| R8 | **24h soak 加固**（增量 JSON、CPU/FPS、provenance、失败保留） | 长稳结论可信；崩溃也有证据 | 1 + 24h 墙钟 | 低 | release 前 |
| R9 | **Rust 命令集成测试**（tempdir + temp appdata + 命令级 allow/deny） | ACL/consent/save 的 Rust 侧回归；替代手工 141 断言 | 2–3 | 低–中（需要 Windows WebView2 构建） | 1–2 个迭代 |

---

## 11. 建议先做 3 件（验收标准）

### 第 1 件：GUI 测试数据隔离（P0-1）

- **做什么**：`DG_QA_DATA_DIR` override（Rust）+ `--reset-saves` 仅 QA env/仅 json 槽位 + E2E 强制临时目录 + 真实 appdata 前后哈希断言；浏览器/插件 GUI 同样临时 profile/home；删除 941 个残留 profile（按 dry-run 打印绝对路径→确认→只删 artifacts/cdp-wv2-* 流程）。
- **验收**：连续跑 3 次 `e2e-tauri`（或等价 smoke），真实 `%APPDATA%/com.perrylink.desktopgames` 哈希不变；`--reset-saves` 无 env 时报错退出；插件 GUI smoke 用 `mkdtemp` 的 DSH_HOME，真实 `~/.dsh` 不变。
- **成本/风险**：0.5–1.5 人日；低风险（Tauri 官方 override 模式，仅 QA env 生效）。

### 第 2 件：门禁真正接上并让干净 checkout 转绿（P0-2）

- **做什么**：① 修 `ui-assets` 的 ignored 产物依赖（生成物入库或改为 build 后测试）与 `use-restrictions` 的仓外依赖（改为同仓 fixture/或插件仓独立测试）；② 给 `DG` 加 remote（或先加 pre-push hook 跑 preflight）；③ required：linux job + 插件 `npm test/check/verify` + `rust-dlc`；`rust-tauri-tests` 跑绿 3 次后 required；④ 夜间无 Windows headless 浏览器 smoke（可先用 `vite preview` + 轻量 CDP 脚本，不必一步上 Playwright）。
- **验收**：干净 clone + `npm ci` 后 `npm run preflight` 与 CI 同命令全绿；`git push` 后 GitHub Actions 首跑绿；`rust-tauri-tests` 不再是 continue-on-error。
- **成本/风险**：2–3 人日；中风险（remote/runner 权限、Windows cargo 构建时间长）。

### 第 3 件：数据链行为回归 + `main.ts` 拆模块（P0-3）

- **做什么**：按 R1/R2 抽 `save-runtime` 并接 `save-journal`；按 §7 的 10 条最小注入用例写测试（fake invoke / never-settle / ENOSPC 用 fake storage / 插件 fake fetch）；同时给插件 `client.js` 补 timeout/abort/防重/隐私自动隐藏测试。
- **验收**：`save-runtime` 覆盖率 ≥90% lines/branches；十条注入用例全绿；`main.ts` 不再被 AST 切片测试关键数据行为；插件新增 ≥6 条行为测试；`npm test` 仍 <60 s。
- **成本/风险**：3–4 人日；低–中风险（重构，需保留旧行为特征测试 + 手工 E2E 双跑）。

---

## 12. 与既有 QA 文档的关系

| 文档 | 状态 | 本报告的处理 |
|---|---|---|
| `DG/docs/research/QA-RELEASE-AUDIT.md`（2026-11-15） | 已过期（测得 215 tests、旧产物时间线） | 只引用其结构性结论；数字全部以本轮实测替换。建议加 superseded 头 |
| `DG/docs/research/REMAINING-WINDOWS-QA.md`（2026-11-15） | 部分仍有效（验收矩阵、soak 加固方案、`DG_QA_DATA_DIR` 方案 B） | 引用 §4.5/§3.3；其中旧产物早于 HEAD 等已不适用 |
| hub `docs/audit/PET-ROBUSTNESS-AUDIT-2026-11-18.md` | 11-18 快照；P0/P1 多已修 | 用其 P0/P1 清单做修复 × 回归测试对照（§3）；其中磁盘/超时测试缺口仍未补 |
| `DG/docs/audit/RESOLUTION-{TAURI-ACL,CONSENT-GATE,AUTHENTICODE,DLC-SIGNING,INNERHTML}-2026-11-19.md` | 11-19 修复记录，含实测/证据路径 | 作为已修复证据；同时指出其证据多在 `_scratch`/手工，未进仓或 CI |
| `DG/docs/HANDOFF-2026-11-14.md`、`00-live/FAMLING-DSH-HANDOFF-2026-11-18.md` | 交接文档，数字逐节漂移 | 只引结构性事实；数字以本轮实测为准 |

---

## 13. 附录：可复核命令与关键文件行号索引

### 13.1 复现本轮数字的命令

~~~bash
# 当前工作树（12:52 快照）
cd /mnt/d/Projects/dsh/desktop-games
node --import tsx --test tests/*.test.ts        # 1094 tests / 1089 pass / 5 fail
npm run typecheck                                # exit 2（并行 WIP）

# HEAD 干净导出（可复现基线）
rm -rf /tmp/qa-head && mkdir -p /tmp/qa-head
cd /mnt/d/Projects/dsh/desktop-games && git archive HEAD | tar -x -C /tmp/qa-head
ln -s /mnt/d/Projects/dsh/desktop-games/node_modules /tmp/qa-head/node_modules
cd /tmp/qa-head && node --import tsx --test tests/*.test.ts
# 1046 tests / 1037 pass / 4 fail / 5 skipped
cd /tmp/qa-head && node --import tsx --experimental-test-coverage --test-coverage-include='src/**/*.ts' --test tests/*.test.ts
# all files: 91.11 lines / 80.74 branches / 87.26 functions

# 插件
cd /mnt/d/Projects/dsh/plugins/dsh-famling
npm test && npm run check:anims && npm run verify:anims
# 76/76; check/verify exit 0
cp -r . /tmp/qa-plugin && cd /tmp/qa-plugin && node --test test/*.test.js
# 74 pass / 2 skipped（无私有资产）

# 门禁 smoke
cd /mnt/d/Projects/dsh/desktop-games
npm run version:check
node scripts/legal-check.mjs --strict
node scripts/release-sign.mjs --plan --json
node scripts/repro-check.mjs --check-inputs --json
~~~

### 13.2 行号索引（本快照）

| 主题 | 位置 |
|---|---|
| CI 从未运行 | `DG/.github/workflows/ci.yml:3`、`DG/scripts/preflight.mjs:3-8`、`git remote -v`（空） |
| `rust-tauri-tests` 不 gate | `DG/.github/workflows/ci.yml:117-124` |
| 测试命令/CI 顺序 | `DG/package.json` scripts.test；`ci.yml:50-51,91-92,53,94` |
| 干净 checkout 必红 | `DG/tests/ui-assets.test.ts`（contact-sheet 读取，HEAD 失败栈 :909）、`DG/tests/use-restrictions.test.ts:42-44`、`DG/.gitignore:25` |
| E2E 删真实存档 | `DG/scripts/e2e-tauri.ps1:15,24,51,69,79,83,88,95`；`DG/scripts/cdp-launch.ps1:9,20,23,31,35`；`DG/app/tauri/src-tauri/src/main.rs:952-959` |
| 无 QA 数据目录 override | 全仓 grep `DG_QA_DATA_DIR|app_directories_override` → src/scripts/tests 0 命中（仅二进制） |
| 数据事故记录 | `DG/docs/audit/RESOLUTION-TAURI-ACL-2026-11-19.md:280`、`DG/docs/audit/RESOLUTION-CONSENT-GATE-2026-11-19.md:107,153` |
| 恢复链实现 | `DG/src/pet/main.ts:1689-1700,1728-1902,2139-2148,2165-2179` |
| 恢复链测试缺失 | `DG/tests/consent-static.test.ts:225`（仅正则）；grep `invokeTimed|saveRecoveryNeeded` 在 tests 0 命中 |
| main.ts 不可 import | `DG/tests/p1-gates.test.ts:170-195`（AST 切片）；grep `from '.*pet/main` 在 tests 0 命中 |
| hit-regions 覆盖缺口 | `DG/src/pet/hit-regions.ts:94-229`；`DG/tests/hit-regions.test.ts:11-31` |
| baked TTS 超时 | `DG/src/voice/baked.ts:219-240`；`DG/tests/voice-baked.test.ts`（1 例，无超时） |
| Advisers 超时范式 | `DG/tests/advisers-harden.test.ts:31-46,251-258` |
| 插件 bridge 超时/防重 | `DF/client.js:789-848`；`DF/index.js:101-130,158-197` |
| 插件一致性门跳过 | `DF/test/client-static.test.js:163-168,210-215` |
| 插件无 prepack/CI | `DF/package.json` scripts；`DF` 无 `.github/workflows` |
| Tauri ACL 构建门 | `DG/app/tauri/src-tauri/build.rs:1-90`；`DG/app/tauri/src-tauri/capabilities/pet-shell.json` |
| 能力/窗口配置 | `DG/app/tauri/src-tauri/tauri.conf.json:14-41`（1 窗口 + 7 capabilities）；`capabilities/` 7 个文件 |
| 发布脚本 | `DG/scripts/release-sign.mjs`、`release-win.mjs`、`repro-check.mjs`；`DG/.github/workflows/release.yml:1-130` |
| 产物缺失 | `DG/artifacts/`（无 SHA256SUMS/RELEASE-MANIFEST/build-info；e2e-tauri.json 11-14；941 个 cdp-wv2；12 GB） |
| 24h 缺失 | `DG/artifacts/tauri-soak-24h.json` 不存在；只有 `tauri-soak.json`（11-14 5 min） |
| 文档漂移 | `DG/README.md:11,108`、`DG/docs/design/CONTENT-MARKET-2026-11-19.md:32-44`、`DG/docs/research/QA-RELEASE-AUDIT.md` |

### 13.3 一句话给对方工程师的交接

先把测试从读源码猜行为改成 import 纯模块 + 注入 IO，再把 GUI 测试从用户真实目录搬进临时目录，最后把这两件事接到 CI。否则每一次本机全绿都只是一次无法复核的人工声明。

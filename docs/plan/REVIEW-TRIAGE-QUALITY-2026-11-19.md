# QA / 性能 / 资产与内容管线 —— 七份评审任务化（REVIEW TRIAGE · QUALITY）

| 项 | 内容 |
|---|---|
| 文档 | `docs/plan/REVIEW-TRIAGE-QUALITY-2026-11-19.md`（本文件是本次 triage 唯一写入物） |
| 日期 | 2026-11-19（Asia/Shanghai；评审快照 12:50–13:15，本文件核对当前代码 14:30–14:45） |
| 输入 | `docs/research/PROJECT-REVIEW-{QA,GAME,SOFTWARE,ARCHITECT,NETWORK,UX,PSYCHOLOGY}-2026-11-19.md` + `PROJECT-REVIEW-ALL-FINDINGS-2026-11-19.md`；七份评审全文（QA/GAME/SOFTWARE 全文精读，ARCH/NETWORK 重点节精读，UX/PSYCH 摘要+问题清单精读） |
| 评审快照 | famling `HEAD 779354b` + 20 项未提交改动；插件 `0.10.0`（76 tests） |
| 当前代码 | famling `HEAD 7107a61`（d5655c9 / 0bbbe43 / 7107a61 三个提交已包含评审文档与内容中心 v2/市场客户端/零按钮菜单）；工作树仅 docs 改动；插件 `dsh-famling 0.10.2`（90 tests） |
| 范围（本文件） | QA + GAME + SOFTWARE 三份评审中属于**质量/性能/资产与内容管线**的部分：GUI 测试数据隔离、CI 必绿、行为测试与 jsdom/Playwright、覆盖率、WAV 压缩、atlas/热切换、DPI、性能基线、内容包安装器/签名/素材 |
| 边界（不越权） | 信任根 ceremony/传输协议设计（security triage）、共享语义 spec/模块拆分方案（arch triage）、菜单/设置/无障碍文案（UX triage）、法律/产品形态拍板（lead/用户）只做依赖、去重与引用，不重复任务化 |
| 方法 | 只读分析：读评审原文与当前代码/设计/审计文档；本地跑 `npm test`、`typecheck`、插件 test/check/verify、若干只读 grep；未改代码/资产/配置，未 commit/push，未联网 |
| 环境限制 | WSL2 + Node 24.22.1，但 `node_modules` 是从 Windows 侧安装的（`@esbuild/win32-x64`、rolldown win32 binding）。因此本轮 `npm test` 有 10 条子进程 CLI 用例红、`vite build` 无法运行；这是**平台/安装可移植性证据**，不是被测语义失败（详见 §1.2）。所有实机/GUI/签名/24h 结论均未在本轮复测 |

> 阅读顺序：先读 §0 决定先做什么；执行前读 §2（哪些评审结论已过期）与 §4（矛盾裁定），否则会重复已修项或按已被推翻的前提排期。

---

## 0. 一页结论

### 0.1 评审后到当前代码发生了什么（决定全部排期前提）

评审快照之后有 3 个提交，**直接改变了 6 组评审结论**，其中 2 组从必红变绿：

1. `d5655c9 feat(content)`：角色主题包 0.2、素材包导入、远程市场契约、极简右键菜单 + 内容中心 v2 UI；同时把七份评审提交入库。
2. `0bbbe43 feat(market)`：新增 `src/pet/content-market.ts`（2,094 行、29 项测试）——HTTPS/私网/重定向/超时/大小限制、目录 Ed25519 验签、`serial` 防回滚、注入式 unpack/install；NETWORK 评审的 P1-1/P2-1 与部分 P1-6 **已实现**。
3. `7107a61 feat(menu)`：根菜单“保存后退出”。

因此：**评审里的“干净 checkout 必红”“菜单 23 项平铺”“家庭内产物混编”等结论必须按 §2 重新核对**，不能直接拿评审原文排期。当前真实的技术债集中在四件事：**测试数据安全、可执行的质量门、数据链行为回归、发布证据管线**；内容/资产侧的旧账则集中在**单一事实源与资产预算门**。

### 0.2 本文件重新分级后的 P0（4 条）

| 新 P0 | 一句话 | 与评审映射 | 当前状态 |
|---|---|---|---|
| **Q-P0-1 GUI/E2E 测试数据隔离** | E2E 会删除/写入真实 `%APPDATA%/com.perrylink.desktopgames`；11-19 已有事故 | QA P0-1（原 P0） | **未修**：无 `DG_QA_DATA_DIR`；`e2e-tauri.ps1` 仍断言真实存档路径并 5 次 `-ResetSaves`；Rust 仍整目录删 saves |
| **Q-P0-2 可执行质量门（CI 必绿）** | 仓库无 remote、CI 从未运行；插件门禁在无私有资产 checkout 会 skip；Linux 平台可移植性未证明 | QA P0-2 + SOFTWARE P0-1 + ARCH P0-2（插件侧） | **部分变化**：两个“必红”测试已修（§2.1）；仍无 remote/真实 CI run；`rust-tauri-tests` 仍 `continue-on-error`；插件仍无 CI/prepack |
| **Q-P0-3 数据链行为回归 + `main.ts` 存档抽取** | 坏档恢复/IPC 超时/退出保存等修复只有源码字符串断言，`main.ts` 不被任何测试 import | QA P0-3 + SOFTWARE P1-1/P1-4 | **未修**：`main.ts` 3,607 行、0 测试 import、14 个测试读源码；退出前保存已实现但无行为测试 |
| **Q-P0-4 发布证据管线** | 无 SHA256SUMS 外层签名/RELEASE-MANIFEST/build-info；E2E JSON 是 11-14 旧产物；无 24h soak；DLC release 仍 fail-closed | QA P1-1 + NETWORK P0-2 + ARCH P0-3 + GAME P0-2 | **未修**（DLC 生产根 `keys: []`、packs 仍 legacy 签名；产物无机器可复核证据） |

> Q-P0-4 中“生产密钥 ceremony / Authenticode 证书”属外部 owner 动作，由 security/发布 triage 主导；本文件负责**证据管线与门禁**（可在无证书时先做 manifest/哈希/签名外层/验收归档）。

### 0.3 建议第一批（6 项，详见 §8）

1. **QT-201/202 GUI 数据隔离**（0.5–1.5 + 1–1.5 人日）：先做 Rust `DG_QA_DATA_DIR` override + `--reset-saves` fail-closed + E2E 前后 appdata 哈希快照；这一步不依赖任何产品决策，先把用户数据风险清零。
2. **QT-101/102 可执行质量门**（1.5–2.5 人日）：新增 `npm run ci`（与 ci.yml 同命令）+ pre-push hook；修平台可移植性（WSL/CI 路径、native binding、`@types/node`/engines）；把“本文件写的验收命令”变成一条可复跑命令。
3. **QT-301 存档运行时抽取 + 10 条故障注入**（2–3 人日）：抽出 `save-runtime.ts`（注入 IO/clock），把坏档恢复、`.bak` 保护、8 s 超时、退出保存变成行为测试；这是 Q-P0-3 的最小闭环。
4. **QT-701 发布清单与外层签名**（1.5–2 人日）：`release-win --all --strict` 产出 SHA256SUMS + RELEASE-MANIFEST + build-info，并加 minisign/cosign detached 签名与 `--verify`。
5. **QT-501/502 内容/计时单源 + 漂移门**（2–3 人日）：timing 单一 JSON、famling↔插件 parity 检查（当下就能暴露 high-contrast/映射差异），先检查后生成。
6. **QT-601/602 性能与 DPI 基线**（2–3 人日 + 实机）：先补“当前 HEAD 的可复测数字 + provenance + 阈值”，再决定是否需要继续优化；DPI/多屏按实机矩阵验收，不凭推断。

### 0.4 任务数量与优先级分布

共 **38 个任务**（8 个 Epic）：P0 = 8（含 1 个 owner 决策门），P1 = 24，P2 = 6。任务树见 §6，依赖/批次见 §7。

### 0.5 与其它 triage 文档的接口（同批并行产出）

本轮 lead 同时派出 5 份 triage；本文件是**质量/性能/资产/内容管线**这一份，ID 用 `Q-P0-*` / `QT-*`，不与其它文档的 `SAFE/GATE/REL` 等编号混用：

| 文档（同批） | 负责范围 | 与本文件的接口 |
|---|---|---|
| `REVIEW-TRIAGE-P0-2026-11-19.md`（task-67） | 七份评审 19 条 P0 的去重/冲突/依赖三角、全局最小修复 | 本文件 §5.0 的 P0 重分级应与其“归并后工作项”对齐；冲突时以 lead 合并口径为准 |
| `REVIEW-TRIAGE-ARCH-2026-11-19.md`（task-68） | 架构/重构/共享语义 spec/模块化 | 本文件 QT-301/304/502 与其 `main.ts` 拆分、spec 工件化任务互为依赖；不重复 spec 设计 |
| `REVIEW-TRIAGE-UX-2026-11-19.md`（task-69） | UX/心理/无障碍/菜单/内容中心窗口 | 本文件只做测试侧（QT-204 的菜单/内容中心 smoke、QT-602 的 reduced-motion 行为测试）；UI 修复以该文档为准 |
| `REVIEW-TRIAGE-SECURITY-2026-11-19.md`（task-70） | 安全/发布/市场/信任根/传输协议 | 本文件 QT-701/704 只做“证据与签或删门禁”；ceremony/updater/协议实现以该文档为准 |
| **本文件** | QA/质量门/测试数据隔离/行为测试/覆盖率/性能基线/资产/内容管线 | — |

> 合并建议：lead 只需保留每个根因的“唯一任务编号”，把本文件的 `QT-*` 作为质量域子任务挂到 P0 文档的 `SAFE/GATE/REL` 等工作项下；若两文档对同一项给出不同优先级，按“用户数据安全 > 发布可信 > 回归网 > 性能/资产 > 卫生”的顺序裁定（本文件 §5.1）。

---

## 1. 方法、证据与口径

### 1.1 读了什么、怎么判定

- **七份评审全文/重点节**：QA/GAME/SOFTWARE 三份全文（含 P0/P1/P2、证据索引、路线图）；ARCHITECT 读 §0/§3.3/§4–§9；NETWORK 读 §0/§4/§7；UX/PSYCH 读摘要、P0 与 P1 清单、以及与本域交叉的条目。
- **当前代码**：`src/pet/main.ts`、`content-hub.ts`、`content-library.ts`、`content-assets.ts`、`content-market.ts`、`desktop-shell.ts`、`hero*.ts`、`anim/*`、`public/content/library.json`、`docs/content-packs/README.md`、`docs/design/CONTENT-MARKET-2026-11-19.md`、`app/tauri/src-tauri/{main.rs,tauri.conf.json,build.rs,capabilities}`、`.github/workflows/ci.yml`、`scripts/{preflight,e2e-tauri,cdp-launch,release-*}.ps1/mjs`、插件 `client.js/client.content.js/index.js/content-extension.mjs/scripts/test`。
- **既有决策/审计**：`docs/plan/{DECISIONS-RECOMMENDED-2026-11-17,RELEASE-HANDLING-2026-11-17,V1-DECISIONS-REAL-MACHINE-2026-11-17}.md`、`docs/audit/RESOLUTION-{DLC-SIGNING,AUTHENTICODE,TAURI-ACL,CONSENT-GATE,INNERHTML}-2026-11-19.md`、`docs/research/REMAINING-WINDOWS-QA.md`、`docs/RELEASE-RUNBOOK.md`。
- **证据等级**：A = 本轮命令实测；B = 读当前代码/文档可复核；C = 静态推断/评审历史结论（已标注）。

### 1.2 环境限制与“绿”的定义（重要）

本轮在 WSL2（Node 24.22.1）直接跑当前工作树：

```text
npm run typecheck                     -> exit 0
npm test                              -> tests 1176 / pass 1166 / fail 10（10 条全部是 spawn 子进程的 CLI 用例）
                                         失败原因：子进程 `node --import tsx src/pet/consent/cli.ts` 命中
                                         “@esbuild/win32-x64 存在但需要 linux-x64” -> exit 1；
                                         node_modules 来自 Windows 侧安装，不是产品语义失败。
npx vite build --outDir /tmp/triage-dist -> 失败：rolldown 缺 linux-x64 native binding（同一原因）。
cd plugins/dsh-famling && npm test    -> 90/90 pass；check/verify 通过（入口 75.3 KiB / 首帧 137.1 KiB / 全量 322.7 KiB）。
```

结论：**“本地绿”必须绑定 OS + 安装方式 + commit**。本文件因此把“干净 checkout + `npm ci` + `npm run ci` 在 Linux/Windows 双平台全绿”作为 Q-P0-2 的验收口径，而不是“某人在某台机器上跑过”。这也是评审里 QA/SOFTWARE 两份报告数字（1,094/1,046/1,118）与当前 1,176 不一致的根本原因之一。

### 1.3 评审后已提交的 3 个提交（本文件的“时间轴基线”）

| commit | 内容 | 对 triage 的影响 |
|---|---|---|
| `d5655c9` | 内容模型 v2、素材包导入、市场契约、极简菜单 + 内容中心 v2 UI；七份评审入库 | GAME P0-1 部分推进；UX P0-1/P0-2 部分解决；测试数 1,118 → 1,176 |
| `0bbbe43` | 远程市场客户端 v1（2,094 行 + 29 测试） | NETWORK P1-1/P2-1 关闭；P1-6 部分推进 |
| `7107a61` | 根菜单“保存后退出” | UX P0-3 部分推进 |

---

## 2. 已被后续改动解决 / 部分解决 / 失效的条目（排期前必读）

> 判定规则：**已解决** = 当前代码/测试直接推翻评审原文；**部分解决** = 主要缺口关闭但仍有残余；**失效** = 原文依据已被重构/提交替代，不能按原行号或原结论排期；**仍成立** = 本轮复核仍与原文一致。

| # | 评审条目 | 评审原文摘要 | 当前证据（2026-11-19 14:30+，HEAD 7107a61） | 判定 |
|---|---|---|---|---|
| S-01 | QA P0-2 | 干净 checkout 上 `use-restrictions` 与 `ui-assets` 必红；CI 今天启用就会红 | `tests/use-restrictions.test.ts` 对缺失的 `../plugins/dsh-famling/*` 明确 `continue`；`public/assets/ui/manifest.json:19-21` 的 contactSheets 已改指已跟踪的 `docs/art/ui-91-qa/*.png`；本轮这两项测试均通过；测试总数 1,176 | **部分解决**：两个必红测试已修；“CI 从未运行/真实干净 clone 未验证”仍成立 |
| S-02 | QA P0-1 / ARCH P1-7 | GUI/E2E 无数据隔离；`--reset-saves` 删真实存档；同源 localStorage 未隔离 | 全仓 grep `DG_QA_DATA_DIR|app_directories_override` = 0；`e2e-tauri.ps1:51` 仍断言真实 `%APPDATA%` 路径、`:69-95` 五次 `-ResetSaves`；`main.rs:952-959` 仍 `read_dir(saves).remove_file(每一条)`；`artifacts/` 12 GB、941 个 `cdp-wv2-*` | **仍成立**（数据隔离与同源存储是两件事，见 §4 M-08） |
| S-03 | QA P0-3 / SOFTWARE P1-1 | `main.ts` 3,555 行、0 测试 import、数据链只有源码正则 | `main.ts` 现 **3,607 行**、0 测试 import、14 个测试读源码文本；`invokeTimed`/`saveRecoveryNeeded` 仍无行为测试；抽 `save-runtime` 未做 | **仍成立**（且因内容 v2 变大） |
| S-04 | GAME P0-1 | 内容市场无法交付“可玩的新角色”：运行时角色白名单 4 个、内容包无动画 schema | 内容包 0.2 已落地（roleThemes + components + zip/资产/声明/签名）；但 `HERO_CHARACTER_IDS` 仍是硬编码 4 个（含 `tinglan`）；`hero-runtime.ts` 不 import content-library；导入素材只用于预览图/字体（`hydrateInstalledAssets`）；`evaluateRoleThemeSupport` 仍提示“需远程市场安装器”；安装器不存在 | **部分解决**：角色=主题的数据层已落地；“第三方新角色/新动画可玩”仍不成立 |
| S-05 | UX P0-1 / P0-2 / PSYCH P2-1 | 右键菜单 23 项平铺；产品壳隐藏静音/音量/PTT/改名/复位，只留开发面板 | `desktop-shell.ts` 根菜单 = **5 项**（交办/互动/角色与内容中心/设置/更多 + 退出）＋分级子菜单；设置弹窗有静音、音量、reduce-motion 等；`完整面板（开发/E2E）` 仅 `debugMode` 渲染；`main.ts` 已实现退出前保存；reduce-motion 已让 JS 画布循环冻结场景时钟 | **部分解决**：菜单/安静控制/开发入口已修；内容中心仍在 480×336 不可缩放窗口（UX P1-1 仍成立） |
| S-06 | UX P0-3 | 损坏存档提示指向不存在的保存按钮；退出不保存；删除存档不清标志 | 退出前保存已实现（`main.ts:3445 onExit → exitAfterSave`）；但删除存档仍未清 `saveRecoveryNeeded`，保存失败仍直接关窗，无二次确认；无行为测试 | **部分解决**：退出保存已修；损坏恢复闭环仍缺 |
| S-07 | PSYCH P0-1 | 接受 TTS 后无法发现式关闭；画布不尊重 reduced-motion | 设置弹窗有静音/音量/reduce-motion；`main.ts:2454` 读取 `data-reduce-motion` 并冻结 scene clock/tick/locomotion；`pet.css` 有 reduce-motion 块；仍无“暂停动效/安静模式/暂时隐藏”的独立开关与测试 | **部分解决** |
| S-08 | ARCH P0-1 / SOFTWARE P1-3 | 两端角色 bundle/对话包/用途声明同 id 不同值且无一致性测试 | plugin 0.10.2 已手写对齐 DIALOGUE_MODES（240/0.7、80/0.4、50/0.05）与 cat=night/dark/serif、dog=paper/paper/system；`test/client-static.test.js:377` 新增“读 famling library.json 交叉核对”的测试；但无私有资产时该测试 `t.skip`；high-contrast 仍无（文档化映射为 night）；无 spec/LOCK/生成器；用途声明仍多份复制 | **部分解决**：已知漂移多数已对齐；“单一权威源 + 可离线验证”仍不成立 |
| S-09 | GAME P2-9 | `tinglan` 在 HERO ids 里但菜单不暴露，仅 `?character=tinglan` 可进 | 当前测试明确 `?character=tinglan is DLC`（builtin 分类 + 每次加载完整 TOS），且 `tinglan-lab` 已从产品 UI/发布构建移除 | **部分解决/失效**：实验室页已移除，tinglan 仍保留在运行时但被 DLC/consent 门控 |
| S-10 | GAME P2-4 / GAME P1-3（插件侧） | 插件懒载只有 Node vm 仿真，无真实 GUI Network 证据 | 插件仍 0.10.2；`RESOLUTION-PLUGIN-BUNDLE` 自认“没有真实浏览器/DSH GUI 首屏网络 A/B”；无 GUI 网络证据 | **仍成立** |
| S-11 | GAME P1-4 / SOFTWARE P1-6 | 角色切换 = 整页 reload | `main.ts:1167` 仍 `window.location.reload()`；`desktop-shell.applyRendererChoice` 仍是写 localStorage 后 reload | **仍成立** |
| S-12 | GAME P1-8 / QA P1-8 | DPR 启动读一次写死，无跨屏重配；DPI/多屏无当前 HEAD 证据 | `main.ts:2776` 启动时读 `devicePixelRatio`；全仓无 `devicechange`/resolution 监听；无当前 HEAD DPI 矩阵证据 | **仍成立**（推断→需实机） |
| S-13 | GAME P1-3 / GAME R4 | baked WAV 4.2 MB（60%）无压缩；WAV→Opus 估减 3.7 MB | `public/assets/voice` 仍 42 个 WAV / **4,289,208 B**，无 ogg/opus；`dist/` 8.9 MB、`public/` 7.0 MB；WAV 权利（TTS 再分发）仍未确认（DECISIONS D-11） | **仍成立**，但受法律决策阻塞（§4 M-03） |
| S-14 | GAME P1-2 | 计时表 6 处复制，无生成器/TS 等价门 | `src/pet/anim/clips.ts` + 三套 `manifest.json` + 三套 Python 生成器 + 插件 embed 仍并存；无 timing 单一 JSON/等价门 | **仍成立** |
| S-15 | GAME P1-1 | 动画运行时双轨：idle/bubbles/interactions 死代码 vs behavior | `src/pet/anim/idle.ts` 500 行、`bubbles.ts` 163、`interactions.ts` 204 仍存在；`src/pet/**` 无运行时 import（评审 grep 复核方向未变） | **仍成立** |
| S-16 | GAME P1-5 / P1-7 | 角色/动作数据 4 处复制；walk/attack 死 clip；human 眨眼收尾 286 px | `behavior.json` 有 `attack` state 但无 UI/事件入口；`walk` 无引用；human blink 未修（本轮未重测像素差，沿用评审实测） | **仍成立** |
| S-17 | QA P1-2 / ARCH P0-2 / NETWORK P1-7 | 插件发布闭环缺失；缺私有资产时一致性门 `t.skip`；版本漂移 | 插件仍无 `.github`、无 `prepack`、无 `typecheck`；版本 0.10.2（评审 0.10.0）；`test/client-static.test.js:166,213,377` 三处 skip 仍在；`embed-anims.mjs:82-84` 默认读 `../../desktop-games` | **部分解决**：测试 76→90、多一条 parity 测试、内容值对齐；**发布自证仍不成立** |
| S-18 | ARCH P0-2 / NETWORK P1-7 | 插件构建/发布不可自证；npm 占位 0.0.1 | 当前本地 0.10.2，`repository` 字段仍缺（本轮未联网核对 npm registry）；无 vendor/LOCK；无 CI | **仍成立** |
| S-19 | SOFTWARE P1-7 / ARCH P2-6 | 发布产物包含演示栈/旧 Electron/Pixi/Cordis；无 bundle 预算；9 个页面入口 | `vite.config.ts:352-362` 仍 9 个 HTML 入口；`electron/pixi/cordis/sentry` 依赖仍在；`dist` 8.9 MB；无产品 profile/size 预算门（插件侧有 78 KiB 预算） | **仍成立** |
| S-20 | QA P2-2 / SOFTWARE P2-2 | 941 个 WebView2 profile、12 GB artifacts、旧 e2e 产物 | `artifacts/` = **12 GB**、`cdp-wv2-*` = 941、`e2e-tauri.json` mtime 仍为 **11-14 14:44**；无 SHA256SUMS/RELEASE-MANIFEST/build-info/tauri-soak-24h.json | **仍成立** |
| S-21 | NETWORK P1-1 / P2-1 | 远程市场缺传输层/防回滚；SSRF/私网未限制 | `src/pet/content-market.ts` 2,094 行 + 29 测试：HTTPS/私网/重定向/超时/大小/serial 回滚/注入式 unpack/install 已实现；但 main/UI 未接线（市场默认不联网）、无 Rust 下载器/release CSP 方案、无真实 server/CDN | **主要部分已解决**；剩余 P1/P2 归 NETWORK triage（本文件只保留“安装管线测试向量”QT-507） |
| S-22 | QA P1-2/QA P1-4（bridge 超时） | 插件 bridge 无 timeout/abort/防重 | 插件 0.10.2 `client.js:940-983` 已有 AbortController + 8/45/15 s 超时；但仍无对应行为测试（测试里只有动画 timeout） | **实现部分解决**；**测试缺口仍成立**（QT-303） |
| S-23 | GAME P2-5 | 插件首屏预算回涨（50,578→67,726 B，预算 64→72 KiB） | 0.10.2：入口 **75.3 KiB**、首帧 137.1 KiB、全量 322.7 KiB；预算提升到 78 KiB（0.10.1 注释）；`verify-anims` 仍过 | **仍成立/加重**：预算已两次上调，需冻结 + 理由门（QT-508） |
| S-24 | QA P1-5 / SOFTWARE P1-4 | 覆盖率口径漏关键模块、静态断言伪覆盖 | 仍无 coverage/lint 脚本；`main.ts` 不在覆盖分母；纯静态测试约 21 个文件（评审 19/20，口径不同）；14 个测试读 `main.ts` 文本 | **仍成立** |
| S-25 | QA P1-6 / SOFTWARE P2-5 | Rust 验证不 gate、无 clippy/fmt | `ci.yml:117-124` `rust-tauri-tests` 仍 `continue-on-error: true`；app crate `#[test]` 8 个、dlc 19 个；无 clippy/fmt 门 | **仍成立** |
| S-26 | QA P1-8 / GAME P2-2 | 24h soak/性能/DPI 无当前 HEAD 证据；rAF 60 Hz 常驻 | 无 `tauri-soak-24h.json`；只有 11-14 的 5 min soak 与 11-15 模拟；`heroFrame` 仍每帧 rAF（有 renderKey 门控） | **仍成立** |

### 2.1 对排期最关键的三个“失效结论”

1. **“干净 checkout 必红”不能作为当前事实引用**：两个必红测试已修；当前真正的风险是“从未在 CI 干净环境跑过 + 平台可移植性未证明”，而不是“已知两个测试红”。
2. **“插件 76 tests / 0.10.0”已过时**：当前 90 tests / 0.10.2，且内容 bundle 值已与 famling library 对齐；但“缺私有资产时 3 个一致性门 skip、无 prepack/CI/typecheck”仍成立。
3. **“UI 菜单 23 项/隐藏必需控件”已过时**：当前根菜单 5 项 + 分级 + 设置弹窗；但“内容中心塞在 480×336、字号/可访问性问题、保存恢复闭环”仍未解决，交给 UX triage 的对应任务继续，本文件只在测试侧覆盖。

---

## 3. 去重合并表（同一问题被多份评审重复报告）

> 合并原则：**同一根因、同一验收出口 → 只保留一个 Epic/Task**；不同层（测试隔离 vs 产品存储隔离；发布信任根 vs 发布证据）不合并，但建立依赖。

| # | 重复簇 | 涉及评审条目 | 合并后的唯一问题 | 落点 |
|---|---|---|---|---|
| D-1 | CI/干净 checkout/发布门 | QA P0-2、SOFTWARE P0-1、ARCH P0-2（插件）、QA P2-4、QA P2-9、NETWORK P2-8 | “质量门可执行且能被干净 checkout 复现”（含 app + 插件 + dist 后置测试 + rust required） | EQ1（QT-101/102/103/104/105） |
| D-2 | GUI/E2E 数据安全 | QA P0-1、QA P1-7、QA P2-2、ARCH P1-7、UX P0-3（测试侧） | “测试不得触碰真实用户数据；证据必须可复现” | EQ2（QT-201/202/203/204/205） |
| D-3 | 数据链 + main.ts 单体 | QA P0-3、QA P1-4、SOFTWARE P1-1/P1-4、ARCH P1-4、GAME P0-1（接口副作用） | “存档/恢复/IPC 超时/退出保存可注入测试；main.ts 可作为模块被测试” | EQ3（QT-301/302/303/304） |
| D-4 | 覆盖率/静态断言/lint | QA P1-5、QA P2-3、QA P2-7、QA P2-8、SOFTWARE P1-4/P1-5、ARCH P2-7 | “测试形态可信：分母完整、静态断言分层、插件有类型/静态检查” | EQ4（QT-401/402/403/404） |
| D-5 | 内容单一源/动作数据 | ARCH P0-1、SOFTWARE P1-3、GAME P1-2/P1-5、GAME P0-1（角色注册表） | “共享语义/计时/交互数据有单一源与漂移门；第三方内容包有资产 schema” | EQ5（QT-501/502/503/504/506） |
| D-6 | 资产预算/WAV/atlas/首屏 | GAME P1-3、GAME P2-5、SOFTWARE P1-7、QA P2-10、QA P1-8 | “资产/首屏有预算与基线；WAV 权利先判；atlas 不先做” | EQ6（QT-601/603/604） |
| D-7 | 发布信任链/证据 | QA P1-1/P1-2、NETWORK P0-1/P0-2/P2-9、ARCH P0-3、GAME P0-2、SOFTWARE P2-5 | 分两层：**信任根/签名/updater**（security triage 主导）+ **证据管线**（本文件 QT-701/702/703/704） | EQ7 |
| D-8 | 插件构建不可自证 | ARCH P0-2、SOFTWARE P2-6、QA P1-2、NETWORK P1-7、ARCH P2-8 | “插件从自身仓库可重建、可校验、可发布，且 spec/LOCK 不依赖私有工作树” | EQ1 QT-104 + EQ5 QT-502 |
| D-9 | 性能/DPI/soak 无证据 | QA P1-8、GAME P1-8/P2-2、QA P2-10、UX P1-2（菜单命中） | “当前 HEAD 的性能/DPI/稳定性证据 + 阈值 + 归档” | EQ6（QT-601/602/605） |
| D-10 | 文档真值/数字漂移 | QA P2-1、SOFTWARE P2-2、ARCH P2-4、GAME P2-6、NETWORK P2-10、UX P2-4/P2-3 | “状态真值由脚本生成并绑定 commit；历史文档标 superseded” | EQ8 QT-803 |
| D-11 | 脚本/生成器/文档体积 sprawl | SOFTWARE P2-1/P2-2、ARCH P2-9、QA P2-2 | “工具可发现、生成器共享只读原语、本地产物不占工作区” | EQ8 QT-801/802 |
| D-12 | 安装器/解包安全向量 | QA P1-4、NETWORK P1-6、GAME P1-6、ARCH P1-2 | “解压/安装/卸载的 fail-closed 测试向量与原子性”（不重复设计信任根/下载器） | EQ5 QT-507 |

---

## 4. 矛盾 / 冲突前提清单（Adjudications）

> 这里列的是**评审之间、评审与既有决策之间、评审与当前代码之间**的真实冲突；不是简单重复。每条给出两方观点、冲突原因、建议裁定与落点。**§4.0 的三条必须由 lead/用户先裁定，否则排期会返工。**

### 4.0 最重要的三条（建议 lead 优先拍板）

| # | 矛盾 | 如果拍错的代价 |
|---|---|---|
| **M-01** | **“绿”的定义**：评审在脏工作树/Windows node_modules 上测到“全绿”，但 CI 目标环境是干净 checkout + `npm ci`，而本机 WSL 当前反而是 10 红/构建失败；SOFTWARE 称“干净 checkout 必红”，当前两个必红已修但从未在 CI 跑过 | 若继续用“某人本机绿”当发布证据 → 发布门形同虚设；若按“本地 10 红”断言产品损坏 → 修错方向 |
| **M-03** | **WAV→Opus 资产优化 vs TTS 再分发权利未确认**：GAME 把 4.2 MB WAV→0.4–0.6 MB 列为第一资产优化；既有决策 D-11/发布方案明确“未清权 WAV 不得进任何渠道” | 若先压缩再发布 → 压缩收益可能随音频整体下线归零，甚至放大侵权面；若完全不做 → 安装包预算持续被 4.2 MB 占据 |
| **M-04** | **内容 schema 方向**：GAME 要求把 DLC 与内容包收敛成“一个签名资产包格式”；ARCH/CONTENT-MARKET 决策是“保留两套 schema，只统一共享语义 spec”；SOFTWARE 又要求“library.json 单源生成插件常量” | 走错方向会重写刚验证过的 fail-closed 校验与双端 UI，产生路线级返工 |

### 4.1 逐条裁定

#### M-01 “绿”的定义：干净 checkout vs 本地工作树 vs WSL 混合依赖

- **甲方（QA P0-2、SOFTWARE P0-1）**：干净 `git archive` 的测试必红（1,046 中 4 失败，其中 2 个任何平台必红）；没有 CI 的“绿”不算证据。
- **乙方（本机/当前工作树实践、RELEASE-HANDLING 的 preflight 路径）**：只要 `npm test` 在本机全绿即可交付；CI 等有 remote 再跑。
- **为何冲突**：三方说的“绿”不是同一对象——①工作树（含未提交 WIP）；②`git archive HEAD` 干净树；③CI 的 `npm ci` 目标平台。评审当时 12:52 工作树 5 红、13:00 变绿，正说明工作树绿≠可复现。当前两个必红已修（S-01），但本机 WSL 因 Windows node_modules 反而 10 红/构建失败。
- **裁定**：**“绿”只认“干净 clone/`git archive` + 在目标 OS 上 `npm ci` + `npm run ci` 全绿 + 真实 CI run 记录”**。本地混合安装的 node_modules 结果不作为产品证据，也不作为新缺陷。当前工作树的“全绿声明”必须标注 commit + OS + 安装方式。
- **落点**：Q-P0-2；QT-101/102/103。

#### M-02 要不要 jsdom/Playwright：fake DOM 够不够

- **甲方（SOFTWARE P1-4/R5）**：不要引入 jsdom；现有 fake DOM + 自制 React 运行时已证明可测组件行为，最多用更轻的 linkedom；重点是把 `main.ts` 拆成可注入模块。
- **乙方（QA P1-3/R5）**：真实 GUI/渲染层 0 自动化，建议引入 Playwright（或复用 CDP）做 headless 浏览器层（Vite preview + 4 页面 smoke + 内容中心 4 tab + hero 4 渲染器 + hit-region rects + 视觉快照）。
- **为何冲突**：两者都在解决“真实 DOM/布局/hit-region 未被测试”，但一个主张零新依赖（fake DOM + 模块化），一个主张新浏览器层；差别在投入（0 vs 3–5 人日 + 长期 flaky/依赖维护）与覆盖深度（事件逻辑 vs CSS/布局/IPC 真实链路）。
- **裁定**：分两层，**先 1 后 2**：① 立即用 fake DOM/注入 IO 把数据链与 UI 逻辑测掉（QT-301/304，不新增 jsdom）；② Playwright 不是现在引入——等 **GUI 数据隔离（QT-201/202）完成**后，再以“6 条 headless GUI smoke + provenance”形式落地（QT-204），复用 CDP 而非全量重写 20 个手工脚本；v1 不做视觉快照门禁。
- **落点**：QT-304、QT-204。

#### M-03 WAV→Opus 资产优化 vs TTS 再分发权利

- **甲方（GAME P1-3/R4）**：`public/assets/voice` 42 WAV 4,289,208 B 占 public 60%、dist 48%；24 kHz mono 转 Opus 32–48 kbps 估算降到 0.36–0.54 MB（省约 3.7 MB），是安装包预算第一优化。
- **乙方（既有决策 D-11、RELEASE-HANDLING §0/§3）**：42 句 baked DeepSeek TTS 的再分发权利未确认；`legal-check --strict` 仍 BLOCKED 34；未清权 WAV 不得进任何渠道；公开/收费前必须移除或取得书面许可。
- **为何冲突**：技术上“压缩”与法律上“能否随包分发”是两个门；压缩不改变权利状态。GAME 把“减小 3.7 MB”当成可计收益，但若音频最终必须下线/替换，收益归零；反之若权利已清，压缩几乎稳赚。
- **裁定**：**把“技术 A/B”与“发布化”拆开**：① 允许先做 1–3 句 Opus A/B + bake/manifest/回放兼容验证（QT-603 阶段 A，内部构建/不上渠道）；② 发布收益只在“TTS 权利结论 = 可分发”后才计入；③ 若结论=不可分发，发布计划走“无音频 beta 变体”，WAV/Opus 都不进包；④ 无论哪种，`dist` 的 42 WAV guard 必须保留到决策日。
- **落点**：QT-603；决策门 D-2（§7.2）。

#### M-04 内容 schema：统一 vs 双 schema + 共享语义 spec

- **甲方（GAME P1-6/R6）**：DLC 与内容包是两套互不兼容格式（数据 pack vs zip 资产包），应收敛为“一个签名资产包格式（content kind 区分 game-content / anim-character / theme）”。
- **乙方（ARCH §3.3/§7.5、CONTENT-MARKET D5）**：保留两套 payload schema（两端运行时/UI/存储不同），只统一“共享语义”（角色 bundle、对话包、用途声明、event→clip）；强行合并字段需 MAJOR + 双读迁移并有破坏 fail-closed 的风险。
- **丙方（SOFTWARE P1-3）**：`library.json` 应作为唯一目录并生成插件常量（单源 + 生成）。
- **为何冲突**：三者对“单源”的粒度不同——GAME 要统一**文件格式**；ARCH 只统一**语义**；SOFTWARE 要统一**数据来源**。若不拆层，会把“格式/语义/生成”混成一个巨型重构。
- **裁定**：**三层分开**：① **语义层**：一份 spec/共享清单（ARCH P0-1，QT-502 只做可执行的 parity 检查，不做大 spec 工件化）；② **载荷层**：保留 `famling.content-pack/0.2` 与插件 `content-extension v3` 两套 schema（不改）；③ **信封层**：如果未来做 DLC 资产包，只统一“zip + files sha256 + Ed25519 + 上限 + usageDeclaration”这层信封，payload 仍分区；此层排在信任根/安装器设计之后，不在本轮实现。
- **落点**：QT-502、QT-503；信封收敛排 QT-506/507 之后，归 arch/security 决策。

#### M-05 第三方新角色资产包 vs 产品形态未拍板

- **甲方（GAME P0-1/R3）**：内容市场要能交付“可玩的新角色”，必须做 `famling.pet-anim/0.2` 资产包 + 数据驱动注册表 + 热切换（5–10 人日），这是 P0-1 的工程解。
- **乙方（GAME P0-3、本文件 §1 边界）**：玩法循环与产品形态（陪伴运行时 A vs 桌面游戏基座 B）未验证/未拍板；不要用内容市场掩盖它；若选 A，市场范围可能只到主题/声音/对话包。
- **现实（当前代码）**：d5655c9 已交付“角色=主题”内容中心 v2 + 素材包导入 + 市场契约/客户端；用户方向明确为角色主题，因此“内容中心”本身不再是可疑投入；但“第三方新 rig/新动画”仍未支持。
- **为何冲突**：review 写于 v2 合并前，把“市场无法交付新角色”与“产品形态未定”都归为 P0；当前 v2 已把“主题”做成可交付，但“新 rig”仍是产品决策 + 工程双门。
- **裁定**：**当前默认 A（陪伴运行时 + 角色主题）**；把 GAME P0-1 拆为：主题包数据层（已做，不重开）+ **第三方动画资产包/热切换（P1 条件任务 QT-506）**，触发条件=用户明确要“第三方新角色”或市场商业化立项；在触发前不做，且内容中心文案必须保持“本机渲染器不支持新 rig”的诚实提示。
- **落点**：QT-506（P1，conditional）；产品决策门 D-1（§7.2）。

#### M-06 `main.ts` 拆到多少行：<2000 vs <800 vs “行数不是目标”

- **甲方（SOFTWARE P1-1）**：先机械提取 save/content/hero-page 三块（约 1,500 行），目标 `main.ts` < 2,000，最终 < 1,200。
- **乙方（ARCH P1-4）**：`main.ts` < 800 行，按 feature 拆（bootstrap/voice/consent/content/hero/advisers）。
- **丙方（QA P0-3）**：先抽 `save-runtime`，验收是覆盖率 ≥90% 与 10 条注入用例，不是行数。
- **为何冲突**：行数是代理指标；ARCH 的 <800 需要更大重构与更多测试，SOFTWARE 的 <2000 是第一步；若把行数写进验收，容易先搬代码后补测试，反而扩大回归面。
- **裁定**：**验收以行为/注入为准**：里程碑 M1（本文件 QT-301）抽 save-runtime + 10 注入用例 + `main.ts` ≤ 2,500（先降 1,100 行左右）；M2（QT-304）抽 content/hero-page + fake-DOM harness；M3（arch triage）再谈 <800 / feature 目录。行数只作趋势指标。
- **落点**：QT-301/304（本文件）；M3 路由 arch triage。

#### M-07 CI required vs 没有 remote（谁负责什么）

- **甲方（QA P0-2）**：必须把 CI 接上并 required；`rust-tauri-tests` 不允许长期 `continue-on-error`。
- **乙方（RELEASE-HANDLING/RELEASE-RUNBOOK）**：私仓无 remote，CI 只是“已写好未运行”；本地 `npm run preflight` 是唯一门；remote/证书是外部条件。
- **为何冲突**：这不是技术冲突而是**责任边界**：评审要求“证据可复现”，但建 remote、配 Windows runner、证书/密钥都不在单个工程任务内；把“CI 绿”写成代码任务会永远无法关闭。
- **裁定**：拆成两件事：① **工程可做的部分**（QT-101/102：`npm run ci`、pre-push、平台可移植性、dist 后置测试、插件门禁）立即做；② **外部部分**（QT-103：建 remote + 首跑 + required 设置）由 lead/用户授权后执行，验收以“真实 run 链接”为准。在 ② 完成前，禁止在任何文档写“CI 全绿”。`rust-tauri-tests` 跑绿 3 次后再转 required（QT-105）。
- **落点**：Q-P0-2；QT-101/102/103/105。

#### M-08 测试数据隔离：`DG_QA_DATA_DIR` vs 备份恢复 appdata vs 产品级同源存储

- **甲方（QA P0-1，事故后）**：必须做 Rust `DG_QA_DATA_DIR` override（Tauri 官方 `AppDirectoriesOverride`），E2E 强制临时目录；`--reset-saves` 无 env 时拒绝。
- **乙方（REMAINING-WINDOWS-QA §4.5 A）**：零代码方案：E2E 前后备份/恢复整个 `%APPDATA%/com.perrylink.desktopgames` 并断言哈希；先止血。
- **丙方（ARCH P1-7）**：产品级问题：所有窗口同源、共享 localStorage/IndexedDB；需要每窗口 data dir 或键空间隔离 + 技术验证，涉及数据迁移。
- **为何冲突**：三者都在谈“隔离”，但对象不同——测试进程的数据目录（QA）、真实用户 appdata（运维兜底）、产品运行时多窗口共享存储（安全/架构）。把三者当一个任务会互相阻塞。
- **裁定**：**分三个任务、按序执行**：① QT-202 立即加“零代码兜底”：E2E 前备份 + 后快照断言，脚本 fail-closed；② QT-201 做代码级 override（P0，0.5–1.5 人日），`--reset-saves` 收窄为只删 `*.json/.tmp/.bak` 且必须带 QA env；③ QT-205 产品级同源存储边界：先技术验证（Tauri 2 的 `data_directory` 是否可用于多窗口），再决定是否迁移，排 P1、独立立项。
- **落点**：QT-201/202/205。

#### M-09 DLC：签名 ceremony vs 从 release 移除（unsigned beta 决策）

- **甲方（GAME P0-2、NETWORK P0-1、ARCH P0-3）**：release 信任根为空、packs 仍 legacy 签名 → release 构建 DLC 100% fail-closed；必须先 ceremony + 重签 + gate 全绿，否则“随包 DLC”是坏功能。
- **乙方（DECISIONS D-08、RELEASE-HANDLING §1）**：v1 私域 beta 免费 unsigned、签名/上架留 P2；当前唯一可执行路径是 unsigned preview。
- **为何冲突**：beta 可以不签名，但**不能一边不签名一边把“永远验不过的 DLC”打进安装包**；两个决策本身不矛盾，矛盾在“发布包里是否保留 DLC 资源”。
- **裁定**：**二选一，必须显式**：① 近期做 ceremony + 重签（QT-704 + security triage 的 runbook），release 保留 DLC；或 ② 宣布 v1 beta 不含 DLC，从 `tauri.conf.json` resources 移除 `packs/*`、UI 不显示 DLC 入口，等签名就绪再加回。**不接受第三条“包在但永远 skipped”。** 决策门 D-3（§7.2）。
- **落点**：QT-704（owner 决策 + staged pack 门禁）；签名实现路由 security triage。

#### M-10 性能修复“已关闭” vs “没有复测”

- **甲方（GAME §9、SOFTWARE 6.2）**：dirty renderKey 门控、hero resize 短路、插件 chunk 拆分等修复已在代码里，旧性能审计 P1-1/P1-2/P1-3 可视为已关闭。
- **乙方（GAME P2-2、QA P1-8）**：修复后没有任何复测数字；rAF 仍 60 Hz 常驻；24h/CPU/FPS 无当前 HEAD 证据；不能拿“代码改了”当验收。
- **裁定**：两者不冲突但**验收状态只能是“已实现、未验证”**。先做 QT-601（CDP/性能 harness + 基线 + 阈值 + 归档），再判定“已关闭”；`atlas` 不在测量前做（见 §9 N-02 条件 spike）。
- **落点**：QT-601/602/605；atlas 列入 §9 不做。

#### M-11 插件首屏预算：66.1 KiB 达标 vs 75.3 KiB 仍达标（预算被上调）

- **甲方（GAME P2-5）**：entry 从 50,578 B 涨到 67,726 B（+34%），首屏预算从 64 KiB 上调到 72 KiB，属于“预算回涨”。
- **乙方（插件 0.10.1/0.10.2 实践）**：为极简按钮 + 内容中心 v2 增加 UI，预算上调到 78 KiB 有理由；当前 75.3 KiB 仍过 `verify-anims`。
- **为何冲突**：预算的“数字”与“治理规则”冲突——只要每次上涨都调阈值，预算就失去约束力。
- **裁定**：**冻结 78 KiB**（不再上调），任何新增 UI 必须先证明“懒载/移入 chunk”；内容中心相关代码必须在 lazy chunk；QT-508 负责把“预算=冻结值 + 升级需 ADR”写进脚本/README，并给 famling 侧产品 profile 加 bundle 预算（QT-604）。
- **落点**：QT-508、QT-604。

#### M-12 严重度冲突：QA P0-1 是 P0，但 REMAINING-WINDOWS-QA 只列为 P1

- **甲方（QA P0-1）**：测试直接删真实用户存档，且 11-19 09:55–09:58 已发生不可还原污染 → 用户数据安全 = P0。
- **乙方（REMAINING-WINDOWS-QA §4.5/§6）**：`DG_QA_DATA_DIR` 方案 B 标 P1，先做备份恢复（A）。
- **为何冲突**：REMAINING 文档写于事故前（11-15），按“尚无事故”的风险分级；事故发生后 QA 评审升级为 P0 是正确的。
- **裁定**：**P0**（采纳 QA）。理由：已发生真实数据损失；修复成本仅 0.5–1.5 人日，P0 与成本可承受并不矛盾。
- **落点**：Q-P0-1；QT-201/202。

#### M-13 插件“绿着 skip” vs 当前 90 tests 全绿

- **甲方（QA P1-2/ARCH P0-2）**：缺私有资产时一致性测试 `t.skip`，公开仓 CI 可能绿着发布过期嵌入。
- **乙方（当前插件实践）**：90/90 全绿（有私有资产），新增 parity 测试，内容值已对齐；`--check` 能证明生成物与资产一致（在当前工作树）。
- **为何冲突**：两者测的不是同一对象——有资产/无资产。**“当前树绿”不能证明“独立 checkout 绿且有意义”**。
- **裁定**：保留“有资产时字节级比对”；同时把**发布所需的最小 fixture/LOCK** vendor 进插件仓，使无私有仓时 3 个 skip 变为“用 vendored fixture 真跑”；任何 skip 必须打印原因并在 CI 中显示（QT-104）。
- **落点**：QT-104（依赖 QT-502）。

---

## 5. P0 / P1 / P2 重新分级


### 5.0 原评审级别 → 本文件级别（重新分级明细）

| 原条目 | 原级别 | 新级别/归宿 | 重新分级理由 |
|---|---|---|---|
| QA P0-1 GUI 数据隔离 | P0 | **P0（Q-P0-1）** | 不变；事故已发生，成本低 |
| QA P0-2 质量门 | P0 | **P0（Q-P0-2）**，范围收窄 | 2 个必红已修；“无真实 CI run/平台可移植/插件门禁”仍是 P0 |
| QA P0-3 数据链/main.ts | P0 | **P0（Q-P0-3）** | 不变；覆盖率/行为测试为验收 |
| SOFTWARE P0-1 质量门 | P0 | 合并 **Q-P0-2** | 同一根因 |
| GAME P0-1 市场无法交付新角色 | P0 | **P1 条件（QT-506）** | 角色=主题数据层已落地；“第三方新 rig”依赖产品决策 D-1 |
| GAME P0-2 DLC release 全失败 | P0 | **P0 决策门（QT-704）+ Q-P0-4** | 工程/签名实现路由 security；本文件管“签或删”的验收 |
| GAME P0-3 玩法/产品形态 | P0 | **非工程任务（D-1）** | 产品拍板；本文件不将玩法投入任务化 |
| NETWORK P0-1 DLC 信任根 | P0 | 路由 security + **QT-704** | 外部 ceremony/私钥不在代码任务 |
| NETWORK P0-2 发布者身份/updater | P0 | 路由 security + **Q-P0-4（QT-701）** | 证据管线可先做，证书/updater 外部 |
| ARCH P0-1 共享语义 | P0 | **P1（QT-502）** + arch spec | 已部分对齐；spec 工件化路由 arch |
| ARCH P0-2 插件不可自证 | P0 | **P1（QT-104）** | 若插件随 v1 分发应升回 P0（§5.5） |
| ARCH P0-3 发布信任/身份 | P0 | 路由 security + **Q-P0-4/QT-704** | 工程证据与外部信任分离 |
| UX P0-1/P0-2 菜单/隐藏控件 | P0 | 路由 UX（已部分解决） | 当前根菜单 5 项 + 设置弹窗；测试侧由 QT-204 覆盖 |
| UX P0-3 存档恢复/退出 | P0 | 路由 UX + **QT-301**（测试） | 退出保存已实现；删除标志/失败二次确认仍缺 |
| UX P0-4 托盘/复位 | P0 | 路由 UX/arch（本文件不做） | 需要 Windows 托盘实现与产品决策 |
| PSYCH P0-1 安静控制/reduced-motion | P0 | 路由 UX/psych + **QT-602**（行为测试） | 静音/音量/reduce-motion 设置已加；隐藏/暂停仍缺 |
| PSYCH P0-2/P0-3 危机地板/年龄门 | P0 | 路由 psych/legal | 需要产品/法务裁定 |
| QA P1-1 发布证据 | P1 | **升 P0（Q-P0-4）** | 没有证据管线，unsigned beta 也无法审计 |
| QA P1-2 插件发布闭环 | P1 | P1（QT-104） | 依赖 fixture；随 v1 分发则升 P0 |
| QA P1-3 GUI/E2E | P1 | P1（QT-203/204） | 不变 |
| QA P1-4 故障注入 | P1 | P1（QT-303/507） | 不变 |
| QA P1-5 覆盖率/静态断言 | P1 | P1（QT-401/402） | 不变 |
| QA P1-6 Rust gate | P1 | P1（QT-105） | 不变 |
| QA P1-7 同源存储 | P1 | P1（QT-205） | 与测试隔离分任务（M-08） |
| QA P1-8 24h/性能/DPI | P1 | P1（QT-601/602/605） | 不变；先基线后优化 |
| GAME P1-4 角色切换 reload | P1 | P1（QT-506，条件） | 与资产包/热切换合并 |
| GAME P1-8 DPI | P1 | P1（QT-602） | 不变 |
| NETWORK P1-1 传输/防回滚 | P1 | **已解决**（content-market.ts） | 本文件不再排期；仅并入安装向量 |
| 其余 P2 条目 | P2 | P2 或积压（§5.4/§9） | 按卫生/文档/体积处理 |
### 5.1 重新分级的原则

1. **用户数据安全 > 发布声明可信 > 回归网 > 性能/资产优化 > 卫生**。
2. **同一根因只保留一个级别**：重复项按最高级处理，不因多份评审都写 P0 就重复计。
3. **外部依赖不等于降级**：DLC 信任根 ceremony 是 P0 依赖，但在本文件只保留“决策/证据”任务，实现路由 security triage。
4. **“已实现未验证”不算关闭**：性能/内容/热切换一律以“可复现证据 + 门禁”为关闭条件。

### 5.2 新 P0（4 个问题 / 8 个任务，含 1 个决策门）

| ID | 问题 | 由哪些评审升级/合并 | 为什么仍是 P0 | 关闭验收 |
|---|---|---|---|---|
| Q-P0-1 | GUI/E2E 测试数据隔离 | QA P0-1（原 P0）+ QA P1-7（测试面）+ QA P2-2 | 已发生真实 `%APPDATA%` 存档污染；测试/发布不可重复 | 连续 3 次 E2E 前后真实 appdata 哈希不变；未设 `DG_QA_DATA_DIR` 时 `--reset-saves` 拒绝执行；脚本无真实路径断言 |
| Q-P0-2 | 可执行质量门：干净 checkout + 真实 CI + 插件门禁 | QA P0-2 + SOFTWARE P0-1 + ARCH P0-2（插件）+ QA P2-4 | 没有可复现的门禁，“全绿/可发布”无法成立；当前两个必红已修只是必要条件 | 干净 clone/`git archive` + `npm ci` + `npm run ci` 在 Linux/Windows 全绿；真实 CI run 记录；插件独立 checkout 的 test/check/verify/prepack 全绿（无 skip 或 skip 有 fixture 替代） |
| Q-P0-3 | 数据链行为回归 + 存档运行时抽取 | QA P0-3 + SOFTWARE P1-1/P1-4 + ARCH P1-4 | 坏档恢复/超时/退出保存是用户数据资产；目前只有源码正则 | `save-runtime` 行/分支覆盖 ≥90%；§6 QT-301 的 10 条注入用例全绿；`main.ts` 不再被 AST/源码正则测试关键数据行为；`npm test` < 60 s |
| Q-P0-4 | 发布证据管线（含 DLC 决策门） | QA P1-1 **升级** + NETWORK P0-2 + ARCH P0-3 + GAME P0-2 + QA P1-2（插件发布） | 评审升级理由：没有机器可复核证据时，“unsigned beta/私域可发”也无法被审计；DLC 包在 release 中必坏是用户可见缺陷 | `release-win --all --strict` 产出 SHA256SUMS+RELEASE-MANIFEST+build-info；SHA256SUMS 有发布者外层签名且 `--verify` 通过；E2E/soak/安装证据落 `artifacts/qa/<date>/<run-id>/` 且带 provenance；DLC 已签名或已从 release 移除（二选一，见 QT-704） |

### 5.3 新 P1（24 个任务，按 Epic 归并）

| P1 主题 | 原评审条目 | 任务 | 关闭条件（摘要） |
|---|---|---|---|
| 插件可自证发布 | ARCH P0-2（本文件因质量门归 P1，见 §5.5 注）、QA P1-2、SOFTWARE P2-6、NETWORK P1-7、ARCH P2-8 | QT-104 | 无私有仓环境插件 CI 全绿；`npm pack` 含 LOCK/spec；改资产不重生成 → CI 红 |
| Rust/ACL gate 与 dist 测试 | QA P1-6、QA P2-4 | QT-105 | rust-tauri-tests 跑绿 3 次后 required；ACL 矩阵脚本入库；dist 后置测试不再永久 skip |
| E2E 卫生/参数化 | QA P1-3、QA P2-2 | QT-203 | 941 profile 清理；端口/路径/sleep 参数化；每轮 clean state |
| 真实 GUI headless 层 | QA P1-3/R5、SOFTWARE P2-3 | QT-204 | 6 条 headless smoke 可重复；e2e JSON 带 commit/exe hash/WebView2/OS |
| 产品级同源存储边界 | ARCH P1-7、QA P1-7 | QT-205 | 技术验证结论 + 若采用隔离则有迁移方案 + 自动化断言 |
| SaveJournal 统一 | QA R2、SOFTWARE P1-6（持久化） | QT-302 | 浏览器/Tauri 同语义；迁移 golden 测试 |
| 超时/桥接/导入故障注入 | QA P1-4、QA P0-3（插件 bridge） | QT-303 | 10 条最小注入用例（副本覆盖 ENOSPC/只读/锁/never-settle/zip bomb） |
| 行为测试替代源码断言 | QA P1-5、SOFTWARE P1-4 | QT-304 | 静态断言清单分层；main.ts 关键行为可 import 测试 |
| 覆盖率与测试分层 | QA P1-5、QA P2-3/P2-5/P2-7 | QT-401/402（分层见 P2 QT-404） | 分母含全部 src；ratchet；fast/full/gui/perf 分层 |
| lint/typecheck | QA P2-3/P2-6、SOFTWARE P1-5 | QT-403 | app lint + 插件 `tsc --checkJs` 0 错误 |
| 计时单源 | GAME P1-2 | QT-501 | timing JSON 单一源；生成器/测试等价门 |
| 内容语义 parity | ARCH P0-1 残余、SOFTWARE P1-3 | QT-502 | parity 检查常驻；改动单端即红；high-contrast/映射显式 |
| 交互数据单源 | GAME P1-5 | QT-503 | 新增动作只改一处；跨端一致性门 |
| 动画运行时收敛 | GAME P1-1 | QT-504 | behavior 为唯一运行时；死代码删除/接入；测试聚焦真实路径 |
| 角色资产包/热切换（条件） | GAME P0-1 残余、P1-4 | QT-506 | 纯数据新增角色无需改代码；热切换不刷新页面；坏包 fail-closed；触发条件见 §7.2 D-1 |
| 安装/解包测试向量 | QA P1-4、NETWORK P1-6、GAME P1-6 | QT-507 | zip bomb/穿越/symlink/重复/大小写/加密全拒；原子安装/卸载 |
| 插件 bundle/懒载预算 | GAME P2-5、SOFTWARE P1-7 | QT-508 | 78 KiB 冻结；内容中心在 chunk；famling 产品 profile 有预算 |
| 性能基线 | QA P1-8、GAME P2-2 | QT-601 | baseline JSON + 阈值 + PNG/日志；空闲 CPU/帧时间/启动时间 |
| DPI/多屏 | GAME P1-8、QA P1-8 | QT-602 | 100/125/150/175/200 + 双屏矩阵通过（实机） |
| WAV 权利/压缩 A/B（条件） | GAME P1-3/R4 | QT-603 | A/B 回放可行 + 权利结论；若不可分发 → 无音频变体 |
| 24h soak | QA P1-8 | QT-605 | `tauri-soak-24h.json` + provenance + 判定 PASS |
| 证据归档 | QA P1-1/P1-6 | QT-702 | `artifacts/qa/<date>/<run-id>/` 结构 + 校验脚本 |
| 安装/升级验收 | QA P1-1、REMAINING-WINDOWS-QA IN 系列 | QT-703 | 干净 VM 安装→启动→读旧档→卸载保留/清理 5 断言 |

### 5.4 新 P2（6 个任务 + 10 项积压）

| P2 任务 | 原条目 | 说明 |
|---|---|---|
| QT-404 | QA P2-5、QA P2-3 | fast/full/gui/perf 文件分层与时长预算；不做 mutation |
| QT-505 | GAME P1-7/P2-3 | 死 clip 产品裁定 + human blink 收尾修正（像素级，非运行时） |
| QT-604 | GAME P1-3（idle-first）、SOFTWARE P1-7（产品 profile） | hero idle-first 预载；famling 发布 profile 只构建产品页 |
| QT-801 | QA P2-2、ARCH P2-9 | 12 GB artifacts/941 profile 隔离清理；.gitignore/保留策略 |
| QT-802 | SOFTWARE P2-1/P2-2、ARCH P2-8 | scripts 索引/归档 + 生成器共享原语 + 契约文档单源 |
| QT-803 | QA P2-1、SOFTWARE P2-2、ARCH P2-4、GAME P2-6 | 脚本生成 CURRENT-STATUS/TEST-STATUS；历史文档 superseded 标记 |

积压（不单独立任务，进对应 Epic 的验收/清单）：property-based 测试（解析器 round-trip）、npm 发布演练、`content-library.ts` 按 schema 拆文件、插件 i18n 单源、Electron 依赖归档、docs 索引/体积、`scripts/` 探针清理。

### 5.5 降级 / 路由到其他 triage 文档（避免重复与越权）

| 原条目 | 新归属 | 原因 |
|---|---|---|
| ARCH P0-3 / NETWORK P0-1/P0-2（信任根 ceremony、Authenticode、updater、产品身份） | security/发布 triage（本文件只留 QT-704 决策门 + QT-701 证据） | 私钥/证书/owner 动作不在代码任务内 |
| ARCH P0-1（共享语义 spec/LOCK 工件化） | arch triage（本文件只做 QT-502 可执行 parity 检查） | 工件化设计需要跨端决策 |
| GAME P0-3（产品形态/玩法循环） / GAME R9（游戏基座） | lead/产品决策（本文件把 QT-506/QT-603/QT-604 设为条件任务） | 产品拍板，不是工程 triage |
| UX P0-1..P0-4、P1-1/P1-5/P1-7（菜单/内容中心窗口/字号/设置 IA） | UX triage | 已由 task-64/65 部分实现，需要 UX 复核；本文件只在测试侧覆盖 |
| PSYCH P0-2/P0-3、P1-1..P1-10（危机地板、年龄门、同意可读性、无障碍） | psych/UX triage | 需要法务/产品裁定与 UI 实现 |
| NETWORK P1-2（Rust 下载器/CSP）、P1-3/P1-4/P1-5/P2-2..P2-7/P2-11/P2-12 | network/security triage | 传输层/出网/隐私设计；本文件只覆盖安装测试向量 |
| ARCH P1-1（DSH 适配层）、P1-5（角色多管线文档）、P1-6（公开镜像） | arch triage | 架构/发布边界设计 |

> 注：ARCH 把“插件不可自证”列为 P0；本文件把它放在 P1 的唯一理由是——它不影响 famling 应用的 v1 beta 数据安全与 CI 首绿，且依赖 QT-502 的 fixture 生成；**若插件要随 v1 对外分发，应升回 P0 并由 arch triage 重新排。**

---

## 6. Epic → Task 树（38 个任务）

### 6.0 约定与覆盖映射

- **任务 ID**：`QT-xxx`；估算单位=人日（单工程+已有测试可跑，不含评审/等待/外部证书）；风险=改动引入回归的概率（低/中/高）。
- **闭环定义**：每个任务必须能在不读本文件的情况下，仅凭“目标 + 验收”判断是否完成；验收优先机器可复核（命令/阈值/文件）。
- **范围关键词 → 任务**：GUI 数据隔离=EQ2；CI 必绿=EQ1；行为测试/jsdom/Playwright=EQ3/EQ4；覆盖率=EQ4；WAV 压缩=QT-603；atlas=§9 N-02（条件 spike，不排期）；热切换=QT-506；DPI=QT-602；性能基线=QT-601/605；内容包安装器/签名/素材=QT-507/701/704 + QT-502/506。

### EQ1 质量门与可复现验证（5 tasks）

#### QT-101 一条命令 = CI 同款质量门（P0）
- **目标**：新增 `npm run ci`，严格复用 `.github/workflows/ci.yml` 的步骤（version:check → typecheck → release-sign/repro smoke → test → build → validate:content → verify:pack → art:check-specs → fci:validate）；加 pre-push hook 跑 fast 版；README/CONTRIBUTING 写清“唯一可复现门”。
- **验收**：① 任意目录 `git archive HEAD | tar -x` + `npm ci` + `npm run ci` 在 Linux 全绿；② Windows 同样命令全绿；③ hook 在 push 前运行 `npm run ci -- --fast`；④ 输出落 `artifacts/qa/<date>/<run-id>/ci.log`。
- **依赖**：QT-102（平台可移植性）。**估算/风险**：1.5 人日 / 低。**顺序**：Wave 0。

#### QT-102 平台可移植性收口（P0）
- **目标**：修 `tests/release-sign.test.ts` 的 WSL 路径假设（`/tmp` 不映射时 skip 并打印原因，不 fail）；解决 spawn CLI 对 `--import tsx` + 原生 binding 的强依赖（优先用 Node 24 原生 TS 或按平台 skip）；`@types/node` 升到 24；`package.json` 加 `engines.node >=24`；文档写清“混合 node_modules 不支持”。
- **验收**：① WSL 干净目录（repo 在 `/mnt/d` 或 `/tmp`）`npm test` 不再因这两类环境问题红；② CI `npm ci` 后 typecheck/test/build 全绿；③ `engines` 存在且 version:check 覆盖；④ 平台 skip 在日志中可见。
- **依赖**：无。**估算/风险**：1 人日 / 低。**顺序**：Wave 0。

#### QT-103 真实 remote + CI 首跑 + required（P0，外部授权）
- **目标**：由 lead/用户授权建私有 remote 并首次推送 master；确认 linux / windows / rust-dlc 三个 job 真实运行且绿；把 required 检查写进分支保护；更新 README/RELEASE-RUNBOOK 的 remote/CI 事实（当前两处仍自相矛盾）。
- **验收**：① `git remote -v` 非空且有 tag；② GitHub Actions 给出一次真实绿 run 链接（记录 commit）；③ 分支保护 required checks 截图/JSON；④ README 不再写“已建 remote/CI”而 runbook 写“无 remote”的矛盾。
- **依赖**：QT-101、QT-102；外部：remote 权限/runner。**估算/风险**：1–2 人日 / 中（外部）。**顺序**：Wave 1。

#### QT-104 插件自证：fixture/LOCK + prepack + 独立 checkout CI（P1；若插件随 v1 分发则 P0）
- **目标**：把插件三套一致性门依赖的“私有资产”改为 **vendored fixture/LOCK**（最小帧哈希清单/真实小样本），使 `npm test` 在只有插件仓的 checkout 中不再 skip；加 `prepack = npm test && npm run check && npm run verify && npm run typecheck`；加 `typecheck`（JSDoc + `tsc --allowJs --checkJs --noEmit` 或迁移 TS）；插件 CI 可独立或由 app CI 按路径触发。
- **验收**：① 临时目录只复制插件 + fixture，执行 `npm test && npm run check && npm run verify && npm run typecheck && npm pack --dry-run` 全绿且 **0 skip**；② 改一帧/一个角色值但不重新生成 → check 红；③ `npm pack` 自动跑 prepack；④ `npm view` 元数据与本地版本一致（可后置，NETWORK P1-7）。
- **依赖**：QT-502（fixture 生成）。**估算/风险**：2–3 人日 / 中。**顺序**：Wave 1。

#### QT-105 Rust/ACL gate 与 dist 后置测试（P1）
- **目标**：把 `rust-tauri-tests` 跑绿 3 次后转 required；新增 `cargo fmt --check` 与 `cargo clippy -- -D warnings`（app crate + `native/dlc-verify`）；把 11-19 的 141 条 ACL 断言脚本从 `_scratch` 迁入仓库并纳入 Windows CI；在 build 之后新增 `npm run test:dist`，让 5 个 dist/法律链接测试真正执行而不是永久 skip。
- **验收**：① CI required 列表含 rust job；② fmt/clippy 0 失败；③ ACL 脚本入库并可本机/CI 复跑，输出 provenance；④ `test:dist` 在 build 后运行且 5 个 skip 变为执行（或明确平台 skip 理由）。
- **依赖**：QT-101/103。**估算/风险**：2–3 人日 / 中。**顺序**：Wave 1/2。

### EQ2 GUI/E2E 测试数据隔离与真实 GUI（5 tasks）

#### QT-201 Rust `DG_QA_DATA_DIR` + `--reset-saves` 收窄（P0）
- **目标**：启动时若存在 `DG_QA_DATA_DIR`，用 `AppDirectoriesOverride::Root(dir)` 覆盖 app data（仅 QA env，生产零影响）；启动日志打印一次绝对 QA data dir；`--reset-saves` 改为只删 `*.json/.json.tmp/.json.bak` 且**未设置 QA env 时拒绝执行并报错退出**；复用 `delete_save` 的精确实现。
- **验收**：① Rust 单测（env 存在/不存在/非法路径）；② 手工 `DG_QA_DATA_DIR=$(mktemp -d)` 启动 + `--reset-saves` 只影响临时目录；③ 无 env 时 `--reset-saves` 非零退出且真实存档不动；④ 生产构建（无 env）行为不变。
- **依赖**：无。**估算/风险**：1–1.5 人日 / 低。**顺序**：Wave 0（最先做）。

#### QT-202 E2E 数据隔离 + 前后快照（P0）
- **目标**：`e2e-tauri.ps1` 启动前 `mkdtemp` 并设置 `DG_QA_DATA_DIR`，`try/finally` 删除；删除 `Join-Path $env:APPDATA ...` 真实路径断言与真实 `-ResetSaves`；E2E 前后对真实 `%APPDATA%/com.perrylink.desktopgames` 做文件+哈希快照并比对，不一致即 FAIL；在 QT-201 落地前用 `-BackupAppData` 零代码兜底。
- **验收**：① 连续 3 次 E2E 后真实 appdata 哈希不变；② 故意让一次 E2E 写真实目录 → 测试 FAIL 并输出 diff；③ 未设 QA env 时脚本 fail-closed；④ 脚本中 grep 不到真实存档断言。
- **依赖**：QT-201（或 interim 备份）。**估算/风险**：1–1.5 人日 / 低。**顺序**：Wave 0。

#### QT-203 E2E 卫生与参数化（P1）
- **目标**：exe/node/port/profile 路径参数化；把 `Start-Sleep 6` 改为 `/json` 就绪轮询（有上限）；每用例 `finally` 清理 `artifacts/cdp-wv2-*`；支持并行端口；20 个 `cdp-*.mjs` 去硬编码 `D:/Projects` 与 `C:/Program Files/nodejs`。
- **验收**：两个 E2E 用不同端口并行通过；跑完 profile 数量回到基线；grep 无硬编码路径；无固定 sleep（只允许带超时的轮询）。
- **依赖**：QT-202。**估算/风险**：1 人日 / 低。**顺序**：Wave 1。

#### QT-204 Headless 浏览器 GUI 层（P1，Playwright/CDP 二选一）
- **目标**：在数据隔离完成后新增 6 条 headless smoke（Vite preview）：① 首启同意门；② 内容中心 4 tab 渲染；③ 角色主题应用/回滚；④ hero 四渲染器首帧；⑤ hit-region rects 与菜单开关；⑥ localStorage 跨页面键空间断言。产物 JSON 带 commit/version/OS/浏览器版本。
- **验收**：① 在 Linux CI 可跑（无 Windows 依赖）；② 6 条全绿、单条 < 30 s；③ JSON 可追溯到 commit；④ 不使用真实 profile/真实 appdata；⑤ flaky 率 < 5%（连续 20 次）。
- **依赖**：QT-202/203。**估算/风险**：3–4 人日 / 中（flaky/依赖体积）。**顺序**：Wave 2。

#### QT-205 产品级同源存储边界验证（P1，技术验证 + 决策）
- **目标**：验证 Tauri 2 多窗口是否可用独立 data dir / 或至少建立“页面→localStorage/IndexedDB 键空间”矩阵；非 pet 窗口不读写 pet 同意/存档键；给出迁移方案（若切换 data dir）与风险接受文档。
- **验收**：① 技术验证报告（可行/不可行 + 证据）；② 若实施：迁移测试 + 非 pet 窗口读不到 pet 键的自动化断言；③ 若不实施：security/UX triage 签字风险接受并写入 SECURITY.md。
- **依赖**：ARCH P1-7；安全 triage 评审。**估算/风险**：1–2 人日 / 中。**顺序**：Wave 2。

### EQ3 数据链行为回归与运行时拆分（4 tasks）

#### QT-301 抽 `save-runtime` + 10 条故障注入（P0）
- **目标**：把 `invokeTimed`、`encrypt/decryptSave`、`parsePetSave`、`loadNow`、`saveNowInternal/saveNow`、`saveRecoveryNeeded`、autosave 调度、`exitAfterSave` 抽到 `src/pet/runtime/save.ts`，注入 `SaveIO {read,write,clearBackup}`、`clock`、`storage`；保留现有行为与用户提示。
- **验收**：① 模块行/分支覆盖 ≥90%；② 10 条注入用例全绿：坏 primary+好 bak 恢复且不覆盖 bak；recovering 时 `backup:false`；never-settle → 8 s 超时 + `saveInFlight` 复位 + 用户可见失败；保存限流；退出前保存成功/失败；删除存档后清 `saveRecoveryNeeded`；浏览器/Tauri 同语义；quota/加密失败返回状态不抛；旧档迁移；fake ENOSPC/只读写失败；③ `main.ts` ≤2,500 行；④ `npm test` <60 s。
- **依赖**：无。**估算/风险**：2–3 人日 / 中。**顺序**：Wave 0。

#### QT-302 统一 pet save 到 SaveJournal（P1）
- **目标**：用已有 `src/game/save-journal.ts`（CRC 主备日志 + 既有 5 测试）替代 pet ad-hoc recovery；浏览器/Tauri 同语义；保留 DPAPI/加密与 `.bak` 保护。
- **验收**：① 旧 v2 存档 golden 测试可读；② 新 journal round-trip/损坏/回滚测试；③ 模拟写中断后无半状态；④ 浏览器/Tauri 双路径共享同一组行为测试。
- **依赖**：QT-301。**估算/风险**：1–2 人日 / 中。**顺序**：Wave 1。

#### QT-303 超时/桥接/导入故障注入（P1）
- **目标**：补 baked TTS manifest 8 s 超时/重置测试；插件 bridge 8/15/45 s abort + in-flight 防重 + 隐私 30 s 自动隐藏；插件 host 过期/畸形 brief、counts、displayPolicy 负向测试；market 客户端 abort/serial 回滚/超大响应；content import ENOSPC/只读/锁/中断。
- **验收**：新增 ≥12 条行为测试，全部 ≤1 s 完成（fake clock）；每条对应一个故障类；无真实网络/磁盘依赖；覆盖评审 §7 的“最小 10 条注入用例”。
- **依赖**：QT-301 模式；插件 0.10.2 代码。**估算/风险**：2 人日 / 低-中。**顺序**：Wave 1。

#### QT-304 fake-DOM harness + 去 `main.ts` 源码断言（P1）
- **目标**：把模块级事件绑定收进 `wirePetEvents(deps)`（import 无副作用）；抽 content/hero-page 之外的接线层；用现有 `tests/fixtures/fake-dom.ts` 覆盖 boot/save/content-apply 3 条行为测试；把 14 个读 `main.ts` 文本的测试降到 ≤5（只保留法律/版本/安全策略类）。
- **验收**：① `main.ts` 可在 fake DOM 下 import 或关键行为全部经抽取模块测试；② 新增 3 条行为测试真实跑通；③ 14 → ≤5；④ `p1-gates.test.ts` 的 AST 切片至少减少一半。
- **依赖**：QT-301。**估算/风险**：2–3 人日 / 中。**顺序**：Wave 2。

### EQ4 测试形态、覆盖率与静态检查（4 tasks）

#### QT-401 覆盖率口径与 ratchet（P1）
- **目标**：加 `npm run test:coverage`（Node 内置 `--experimental-test-coverage`，零依赖）；`--test-coverage-include=src/**/*.ts`；输出“未加载文件”清单；对新增/抽取模块设 ≥90% 门，全仓不下降（ratchet）；CI 存报告 artifact。
- **验收**：① 覆盖率报告包含 `main.ts`/`consent/setup-page.ts`/`shell-layout.ts` 等旧缺口（分母完整）；② ratchet 脚本在分支下降时失败；③ CI artifact 可下载；④ 不使用 c8/nyc。
- **依赖**：QT-301/304。**估算/风险**：0.5–1 人日 / 低。**顺序**：Wave 1。

#### QT-402 静态断言分层与维护（P1）
- **目标**：给 21 个纯静态测试 + 63 个读源码测试建“策略类 vs 行为类”清单/标签；策略类（法律短句、版本镜像、capability 矩阵、生成器 sha）保留并集中 helper；行为类迁到 import/fake-DOM 测试；禁止新增“函数存在/字符串还在”类断言。
- **验收**：① `docs/qa/STATIC-ASSERTIONS.md` 清单；② 行为类数量下降目标（M2 前 ≤10 个文件读 `main.ts`）；③ 策略类有理由/owner；④ 新测试评审清单包含该分类。
- **依赖**：QT-304。**估算/风险**：0.5–1 人日 / 低。**顺序**：Wave 2。

#### QT-403 Lint / typecheck / format（P1）
- **目标**：app 加 eslint 或 biome 最小规则（未使用变量/未处理 Promise/无裸 any 可后置）；插件加 `tsc --allowJs --checkJs --noEmit`（先修 `toISOString`/`request.text` 等 try 外调用）；Rust 加 fmt/clippy（与 QT-105 联动）。
- **验收**：① `npm run lint` 0 error；② 插件 `npm run typecheck` 0 error；③ CI 执行；④ 不引入大规模格式化 churn（仅配置+必要修复）。
- **依赖**：QT-104（插件脚本）。**估算/风险**：1.5–2 人日 / 低。**顺序**：Wave 2。

#### QT-404 测试分层 fast/full/gui/perf（P2）
- **目标**：按目录/文件名前缀分 unit/integration/gui/perf；preflight 默认 fast（<60 s）；nightly 跑 full；文档写清哪层进哪个门。
- **验收**：① `npm run test:fast` <60 s；② full 与当前一致；③ CI 使用 full；④ 新增测试必须归层。
- **依赖**：QT-204。**估算/风险**：0.5–1 人日 / 低。**顺序**：Wave 3。

### EQ5 内容/资产管线单一源与门禁（8 tasks）

#### QT-501 计时单一源 + 生成器等价门（P1）
- **目标**：新增 `src/pet/anim/timing.json`（clip/frames/fps/loop/layer/category/priority/holdMs + per-character override）；TS `clips.ts` 与三套 Python 生成器都读它；CI 增加“生成器 manifest 的 clip 字段 == timing.json”门；`--check` 保留字节校验。
- **验收**：① 全量重生成后 `--check` 绿且**资产字节不变**（前后 sha 对比）；② manifest 字段与 timing 一致；③ 新增一个 clip 只改 timing + 帧生成；④ `tests/pet-anim*.test.ts` 全绿。
- **依赖**：无。**估算/风险**：1–2 人日 / 中。**顺序**：Wave 1。

#### QT-502 内容语义 parity 检查 + 生成（P1）
- **目标**：`scripts/check-content-parity.mjs` 对比 famling `public/content/library.json` 与插件 `ROLE_BUNDLES`/`DIALOGUE_MODES`/`content-extension` 枚举/角色映射；显式 allowlist（humanoid↔human、high-contrast→night、origami unavailable）；在 app 与插件门禁同时跑；阶段 2 由 library 生成插件 catalog 常量（`--check` 防漂移）。
- **验收**：① 当前树 parity 通过；② 改插件 cat theme 或删 allowlist 条目 → 失败；③ 独立 checkout 用 vendored fixture 也能跑；④ 文档记录“哪些差异是故意的”。
- **依赖**：QT-104（fixture）。**估算/风险**：1.5–2 人日 / 中。**顺序**：Wave 1。

#### QT-503 交互数据单一源（P1）
- **目标**：定义单一 `character.interactions.json`（regions + actions + behavior 触发 + 气泡 says + voice 策略），脚本生成 standalone `regions.json`/`behavior.json` 与插件 `EVENT_CLIPS`/says；CI 校验跨端一致。
- **验收**：① 新增/改一个动作只改一个源文件；② 插件嵌入数据 == 生成结果；③ `embed-anims --check` 包含；④ 无动作丢失/入口丢失。
- **依赖**：QT-501/502。**估算/风险**：2–3 人日 / 低。**顺序**：Wave 2。

#### QT-504 动画运行时收敛（P1）
- **目标**：以 `behavior/SceneRuntime` 为唯一运行时；把 `idle.ts` 的 PRNG/冷却/anti-repeat/权重折叠进 `behavior.ambientState` 或删除；`bubbles.ts` 的 speech/thought 策略上移 host/voice gate；`interactions.ts` 接入 `handleHeroAction` 或删除；测试改为运行时集成/golden trace。
- **验收**：① `grep` 无死 import；② 行为 golden trace 保持；③ 删除代码行数/测试数变化写入文档；④ 新功能只加在一处。
- **依赖**：无。**估算/风险**：1–2 人日 / 低-中。**顺序**：Wave 2。

#### QT-505 死 clip 裁定 + human 眨眼收尾（P2）
- **目标**：walk/attack 二选一：接入口（漫游/连续戳玩闹，带冷却）或冻结 spec-only 并在 manifest/文档标注；human `idle_blink_02` 对齐 `idle_00`；cat 中间帧人工目视确认；不在未裁定前调像素。
- **验收**：① 决策记录；② 死 clip 不再进入默认 payload 或标注 dead；③ human 眨眼末帧 vs idle_00 像素差 ≤ dog 量级；④ 测试/文档同步。
- **依赖**：产品/美术裁定。**估算/风险**：1–2 人日 / 低。**顺序**：Wave 3。

#### QT-506 角色/动画资产包 v0.2 + 数据驱动注册表 + 热切换（P1，条件）
- **目标**：定义 `famling.pet-anim/0.2`（frames/atlas 或散帧 + manifest canvas/anchor/footBox/palette/clips/holdMs + regions + preview + license/AI/用途声明 + files sha256 + 签名），复用内容包 0.2 的 zip/上限/声明；实现 loader + `HERO_CHARACTER_IDS` → 内置+已安装注册表；实现 `switchHeroCharacter` 热切换（dispose/load slot，不 reload；失败保留旧角色）。
- **验收**：① 纯数据包新增一个可切换角色，无需改代码；② 损坏/未签名/超限/路径穿越包全部 fail-closed；③ 切换 ≤1 s 且无页面刷新；④ 内置角色/consent/存档不受影响；⑤ 插件消费同一 manifest。
- **依赖**：QT-501/502/507；决策门 D-1（是否做第三方新角色）。**估算/风险**：5–10 人日 / 中-高。**顺序**：Wave 3（条件）。

#### QT-507 内容包安装/解包测试向量与原子安装（P1）
- **目标**：用 `content-assets.ts` 的 bounded reader 作为唯一解压入口；实现“解压到临时目录 → 逐文件 sha256 → validateContentPackV2/validatePackZip → 原子 rename → 记录安装清单 → 卸载只删包目录”；补恶意 zip fixture：bomb、穿越、绝对/盘符/UNC、反斜杠、symlink、加密、zip64、重复、大小写碰撞、超限、hash 不符；串 content-market 的 inject install hook。
- **验收**：① 全部恶意 fixture 被拒且不落盘；② 安装中断/写入失败无半装；③ 卸载可逆；④ 所有写入都在 app data 下；⑤ 测试在 Node 下可跑（不联网）。
- **依赖**：content-market 模块（已完成）；security triage 的安装器设计。**估算/风险**：2–3 人日 / 中。**顺序**：Wave 2。

#### QT-508 插件 bundle/内容懒载预算（P1）
- **目标**：`FIRST_SCREEN_BUDGET_BYTES` 冻结 78 KiB，内容中心/市场 UI 必须在 lazy chunk；新增 per-chunk + 全量预算与“上调需 ADR + 测试”的规则；famling 产品构建 profile 也加 bundle 预算（与 QT-604 联动）。
- **验收**：① 任何 entry 增长超预算 → verify 失败；② 内容中心代码不在 entry（测试/字节证明）；③ README/CHANGELOG 记录冻结策略；④ famling product profile 有预算门。
- **依赖**：QT-502。**估算/风险**：1 人日 / 低。**顺序**：Wave 2。

### EQ6 性能与资产预算基线（5 tasks）

#### QT-601 性能基线 harness（P1）
- **目标**：CDP/浏览器 benchmark：drawImage/秒、TaskDuration、空闲 CPU、启动时间、内存；hero on/off A/B；输出 `artifacts/perf/<commit>/baseline.json` + 说明；设阈值（如 hidden 空闲 CPU <5% 单核、启动 <400 ms、无泄漏斜率）；nightly 报告。
- **验收**：① 连续 3 次可复现（方差 <10%）；② 基线含 commit/exe/browser/OS/DPI provenance；③ 回归阈值超限时 CI/报告红；④ 与旧 perf 审计数字对照记录。
- **依赖**：QT-204 或独立 CDP 脚本。**估算/风险**：2 人日 / 中。**顺序**：Wave 2。

#### QT-602 DPI/多屏 + reduced-motion 行为（P1）
- **目标**：监听 Tauri ScaleFactorChanged/窗口跨屏 + WebView `matchMedia`/`visualViewport`，重建 hero canvas backing/布局；实机矩阵 100/125/150/175/200% × 双屏，验证清晰度/命中/点击穿透/窗口位置；补 reduced-motion（JS 冻结）行为测试。
- **验收**：① 实机矩阵全部通过（截图+CDP JSON）；② 无模糊/裁切/命中偏移；③ 复位窗口回当前屏；④ reduced-motion 时 rAF 不 tick/locomotion（测试）；⑤ 证据归档。
- **依赖**：Windows 实机/双屏；QT-601 harness 可复用。**估算/风险**：1–2 人日 + 实机 / 中。**顺序**：Wave 2。

#### QT-603 WAV 权利决策 + Opus A/B（P1，条件）
- **目标**：先拿 TTS 再分发权利结论（D-2）；阶段 A：3 句 WAV→Opus/OGG A/B（WebView2 播放、manifest sha、vite guard、回退）；阶段 B（仅权利通过）：全量 bake + 体积测量 + 发布化；否则走“无音频 beta 变体”。
- **验收**：① A/B 报告（可播/不可播、体积实测）；② 权利结论落文档；③ 若发布化：42 句全转、`dist` 体积下降实测、回放回归测试；④ 若不可分发：包内 0 未清权 WAV。
- **依赖**：决策门 D-2；法务。**估算/风险**：1–2 人日 + 法务 / 中。**顺序**：Wave 3（条件）。

#### QT-604 hero idle-first + famling 产品构建 profile（P2）
- **目标**：hero 先载 idle/idle_blink 再后台载其余 clip；Vite 产品 profile 只构建 pet/setup/chat-import；demo/QA 页在 demo 构建；`electron` 从默认依赖/脚本移除或标 legacy；famling 首屏 bundle 预算门。
- **验收**：① 首帧 ready 时间不劣于当前；② 产品 dist 不含 demo/QA 页；③ `dist`/安装包体积下降记录；④ 预算门失败即红；⑤ 测试/文档链接更新。
- **依赖**：QT-508。**估算/风险**：1 人日 / 低。**顺序**：Wave 3。

#### QT-605 24h soak 加固与执行（P1）
- **目标**：soak 采样加 CPU/FPS/帧时间、增量 JSON、提前退出检测、provenance（commit/exe sha/WebView2/OS/DPI/屏数）；5 min smoke 后跑 24h 墙钟 HEAD exe；`soak:analyze` PASS；失败保留现场。
- **验收**：① `artifacts/tauri-soak-24h.json` 存在且带 provenance；② analyzer PASS（内存 private <350 MB、斜率 <1 MB/h、handles 漂移 ≤200、gap ≤2.5×）；③ 24h 墙钟记录；④ 结果入发布证据。
- **依赖**：QT-701（HEAD 产物）+ Windows 机器。**估算/风险**：1 人日 + 24h / 中。**顺序**：Wave 3。

### EQ7 发布证据与供应链（4 tasks）

#### QT-701 SHA256SUMS 外层签名 + RELEASE-MANIFEST/build-info（P0）
- **目标**：`release-win --all --strict` 产出 `SHA256SUMS.txt`、`RELEASE-MANIFEST.json`、`build-info.json`（commit/tag/version/Node/Rust/WebView2/tauri CLI/时间/SOURCE_DATE_EPOCH）；对 SHA256SUMS + manifest 加 minisign/cosign detached 签名；`--verify` 验签+哈希+清单；release workflow 接线；无证书时明确 unsigned preview 标记。
- **验收**：① 对 HEAD 产物运行 --all 后 `--verify` exit 0；② 篡改任一文件 → verify 失败；③ 公钥/验证命令写入 README；④ `repro-check` 在 release 模式把 dirty tree/无 tag 升为 error；⑤ E2E/soak 引用同一 manifest。
- **依赖**：QT-103（CI/签名 secrets）；外部证书可选。**估算/风险**：1.5–2 人日 / 中。**顺序**：Wave 1。

#### QT-702 证据归档与 provenance 规范（P1）
- **目标**：统一 `artifacts/qa/<date>/<run-id>/`：run.json（commit/exe sha/WebView2/OS/DPI/屏数/page/screens/命令/耗时）+ 截图/日志；脚本校验 provenance 完整性；.gitignore/保留策略；旧 e2e/soak 证据迁入或标 legacy。
- **验收**：① E2E/ACL/soak/perf 都写该结构；② 缺 provenance 的 run 被校验脚本拒绝；③ 发布验收只需给 run-id；④ 旧 11-14 产物标记 legacy 不可作为证据。
- **依赖**：QT-202/204。**估算/风险**：1 人日 / 低。**顺序**：Wave 2。

#### QT-703 安装/卸载/覆盖升级验收（P1）
- **目标**：在干净 Windows VM/runner 自动化 REMAINING-WINDOWS-QA IN1–IN7 的 5 条核心断言：安装→启动→读旧档→覆盖升级保留存档→卸载（保留/清理按产品口径）；检查包内资源/许可页/无未列 WAV；截图+JSON。
- **验收**：① 脚本/清单可重复执行；② 5 条断言全绿；③ 证据归档；④ 资源清单不一致即 FAIL。
- **依赖**：QT-701、QT-605（HEAD 产物）；Windows。**估算/风险**：2 人日 / 中。**顺序**：Wave 3。

#### QT-704 DLC sign-or-remove 决策与 staged 门禁（P0 决策门）
- **目标**：lead/owner 在 D-3 二选一：① 按 `RESOLUTION-DLC-SIGNING` 完成生产 key ceremony + 重签两 pack + release gate（security triage 执行，本任务只做 staged 正反例门与发布接线核对）；或 ② 从 `tauri.conf.json` resources 移除 packs、UI 不显示 DLC 入口、文档明确 v1 beta 不含 DLC。
- **验收**：① 决策记录（谁/何时/选哪条）；② 选①：`verify-dlc-trust --exe` 在发布树 exit 0，dev pack 仍被拒；③ 选②：安装包内无 packs/*，DLC 入口不可见；④ 两种情况下 release notes 与 README 口径一致。
- **依赖**：security triage、外部 ceremony；工程 0.5–1 人日。**估算/风险**：0.5–1 人日 + 外部 / 高（密钥保管）。**顺序**：Wave 2。

### EQ8 文档真值与卫生（3 tasks）

#### QT-801 artifacts 隔离与清理（P2）
- **目标**：盘点 12 GB/1,000 条目/941 profile；三分式（dry-run 打印绝对路径 → 隔离到 `artifacts/_quarantine-2026-11-19/` → 确认后仅删隔离目录）；旧 exe/zip/portable 不算发布证据；`.gitignore` 与保留策略；训练/CI 产物不进工作区。
- **验收**：① 清理后 artifacts 体积/条目下降且旧包可恢复；② 0 个 `cdp-wv2-*` 残留在循环后；③ 清理脚本可重复执行且绝不 rm 源码/存档。
- **依赖**：无。**估算/风险**：0.5 人日 / 低。**顺序**：Wave 0（可并行）。

#### QT-802 scripts 索引/归档 + 契约文档单源（P2）
- **目标**：`scripts/README.md`（每个脚本用途/是否 CI/上次使用日期）；一次性 `cdp-*` 探针移到 `scripts/probes/` 或归档；三套像素生成器共享只读原语（调色板/轮廓/接触表/--check 框架，先共享不改画风）；契约文档（bridge/arch）单源 + 副本标注来源。
- **验收**：① 索引覆盖 scripts/；② CI 使用的脚本被标记；③ 无两份互相矛盾的契约文档；④ `--check` 仍绿。
- **依赖**：无。**估算/风险**：1 人日 / 低。**顺序**：Wave 3。

#### QT-803 状态真值生成与历史文档 superseded（P2）
- **目标**：`scripts/gen-status.mjs` 生成 `docs/CURRENT-STATUS.md` 与 `docs/TEST-STATUS.md`（commit/version/test 数/last CI/soak/DPI/证据路径）；README/HANDOFF 顶部只留“以 CURRENT-STATUS 为准 + 快照日期”；历史审计加 superseded 头；`npm run docs:check` 校验“remote 已建/CI 已跑/测试数”等与事实一致。
- **验收**：① 生成文件含 commit hash/时间；② README 不再与 RELEASE-RUNBOOK 矛盾；③ 历史文档有 superseded/日期；④ docs:check 能在“README 说 remote 已建但 `git remote` 为空”时失败。
- **依赖**：QT-101/103。**估算/风险**：1–2 人日 / 低。**顺序**：Wave 2/3。

---

## 7. 依赖关系、决策门与建议批次

### 7.1 依赖图（文字版）

```text
平台/门禁:   QT-102 → QT-101 → QT-103 → QT-105 / QT-701
数据安全:    QT-201 → QT-202 → QT-203 → QT-204
             QT-205（独立，需安全/架构评审）
数据链:      QT-301 → QT-302
             QT-301 → QT-303
             QT-301 → QT-304 → QT-401/402 → QT-404
内容管线:    QT-502 → QT-104 → QT-403
             QT-501 → QT-503 → QT-506
             QT-507 → QT-506
             QT-508 ← QT-502
性能:        QT-601 → QT-602（+ reduced-motion 测试）
             QT-701 → QT-605 → QT-703
发布:        QT-701 → QT-702/703；QT-704（决策门）→ release
```

### 7.2 决策门（未拍板前对应任务只能做“设计/前置”，不能做完）

| 决策门 | 内容 | 影响任务 | 建议期限 |
|---|---|---|---|
| **D-1** | 产品形态与第三方新角色范围：A 陪伴运行时（默认）/ B 游戏基座；是否允许第三方新 rig/新动画 | QT-506、QT-505；GAME P0-3 相关 | 下一阶段前（1 周内） |
| **D-2** | 42 句 TTS WAV 再分发权利：可分发 / 不可分发（无音频变体） | QT-603、QT-604 | 每次发布前必须 |
| **D-3** | DLC：签名 ceremony 或从 release 移除 | QT-704、QT-701 | 下一阶段前 |
| **D-4** | remote/CI runner/签名 secrets 的授权 | QT-103、QT-105、QT-701 | 本周内 |
| **D-5** | 共享语义 spec 的归属/公开边界（spec vs parity 检查） | QT-502 阶段 2、ARCH P0-1 | 1–2 个迭代内 |

### 7.3 波次（建议并行，按人日粗算）

| 波次 | 内容 | 任务 | 出口 |
|---|---|---|---|
| **Wave 0（≤1 周）** | 先保数据、再保门 | QT-201、QT-202、QT-102、QT-101、QT-301、QT-801 | 数据隔离 smoke 通过；`npm run ci` 可跑；save-runtime 成型 |
| **Wave 1（1–2 周）** | 门禁与证据、内容/测试单源 | QT-103（授权后）、QT-104、QT-105、QT-203、QT-302、QT-303、QT-401、QT-501、QT-502、QT-701 | 真实 CI 绿；插件独立 checkout 绿；10+ 注入用例；release manifest 可验 |
| **Wave 2（2–4 周）** | 真实 GUI/性能/内容门禁 | QT-204、QT-205、QT-304、QT-402、QT-403、QT-503、QT-504、QT-507、QT-508、QT-601、QT-602、QT-702、QT-704（决策）、QT-803 | headless GUI 6 条；性能基线/DPI；parity/交互单源；安装向量 |
| **Wave 3（发布前）** | 发布验收与条件项 | QT-506（若 D-1 触发）、QT-603（若 D-2 通过）、QT-605、QT-703、QT-404、QT-505、QT-604、QT-802 | 24h+安装验收；资产包/音频按决策落地 |

### 7.4 关键路径（最短可发布路径）

1. **数据安全**：QT-201 → QT-202（0.5–3 人日）——任何发布前必须。
2. **质量门**：QT-102 → QT-101 → QT-103（2–4 人日 + 外部）——决定“可复现”。
3. **数据链**：QT-301 → QT-302/304（4–6 人日）——决定存档可信。
4. **发布证据**：QT-701 → QT-702/703/605（4–5 人日 + 24h）——决定“可发布”。
5. **内容/性能**：QT-501/502 → QT-601/602（4–6 人日）——决定市场/资产不返工。

---

## 8. 建议第一批（6 项，按执行顺序）

| 顺序 | 任务 | 为什么是第一批 | 验收锚点 |
|---|---|---|---|
| 1 | **QT-201** Rust `DG_QA_DATA_DIR` + reset-saves 收窄 | 唯一有“已发生事故”的 P0；0.5–1.5 人日；不依赖任何决策 | 无 env 时 reset 拒绝；临时目录外零写入 |
| 2 | **QT-202** E2E 隔离 + appdata 前后快照 | 即使代码 override 未合，也必须先止血；让 E2E 可重复 | 3 次 E2E 后真实 appdata 哈希不变 |
| 3 | **QT-102 → QT-101** 平台可移植性 + `npm run ci` | 把“本文件验收命令”变成一条可复跑命令；后续所有任务都靠它 | 干净 checkout + `npm ci` + `npm run ci` 双平台绿 |
| 4 | **QT-301** save-runtime + 10 注入用例 | 数据链是用户资产；同时解锁 QT-302/303/304 | 覆盖率 ≥90%；10 条注入绿；main.ts ≤2,500 |
| 5 | **QT-701** release manifest + 外层签名 | 把“发布声明”变成可审计证据；没有它 24h/安装验收无处归档 | `--verify` 通过 + 篡改失败 |
| 6 | **QT-501 + QT-502** timing 单源 + 内容 parity | 内容/资产后续工作的低风险前置；能立刻暴露 high-contrast/映射漂移 | timing 等价门绿；parity 检查能红 |

> 若只有 1 人 1 周：QT-201 → QT-202 → QT-101（最小门）→ QT-301（先写测试骨架）；其余排期。

---

## 9. 明确不做（本轮/近期不做，避免预算错配）

| # | 不做项 | 理由 | 何时重新评估 |
|---|---|---|---|
| N-01 | **不引入 jsdom**；不把 20 个 CDP 脚本全量改写成 Playwright 套件；v1 不做视觉快照门禁 | fake DOM + 注入 IO 已能覆盖行为；Playwright 成本/收益在数据隔离后才成立；全量重写会引入 flaky | QT-204 完成 6 条 smoke 后，按 flaky/覆盖数据决定是否扩展 |
| N-02 | **不做 sprite atlas** | 三套动画源仅 351.6 KiB，插件已无损重编码；当前没有“请求数/解码”成为瓶颈的证据；atlas 改生成器/manifest/渲染器/测试全链路 | QT-601 基线显示 decode/request 是瓶颈时再做（条件 spike，不排期） |
| N-03 | **不合并两套内容 payload schema、不共享 React/UI 运行时** | 双端运行时/存储不同；合并会重写已验证的 fail-closed；收益远低于共享语义 spec | 两产品 UI 合并或第三方要求“一份包两端可跑”时，MAJOR + 双读迁移 |
| N-04 | **不实现远程市场服务器/CDN/支付/审核后台** | 当前契约/客户端已 fail-closed、默认不联网；先有信任根/更新/法务，再谈线上 | QT-704/D-3 与 security triage 完成之后 |
| N-05 | **不把 WAV→Opus 作为当前发布收益** | 权利未确认；压缩不改变分发权；先做 A/B 与决策（QT-603） | D-2 得出“可分发”结论后 |
| N-06 | **不做游戏基座/三款 demo 玩法打磨/商业内容生产** | 产品形态未验证；GAME P0-3 结论未变；内容市场只做主题/数据层 | D-1 明确选 B 且通过试玩 gate 后 |
| N-07 | **不做 main.ts 大爆炸重写 / 不引入框架/状态库** | 渐进搬运 + 注入 IO 风险最低；框架会改 CSP/依赖/测试面 | QT-301/304 完成后，若 feature 模块化证明不足再评估 |
| N-08 | **不追覆盖率百分比 / 不做 mutation testing / 不做 property-based testing（本轮）** | 先补分母与数据链行为；指标追高会诱导写“好测的测试”；mutation 成本高 | QT-401/402 稳定 2 个迭代后，对 3 个解析器评估 fast-check |
| N-09 | **不把 Electron 迁回主路径 / 不为 demo 页做 CI** | Tauri 已选型；Electron 只应归档；demo 不是发布对象 | 产品决定保留 demo 时作为独立 demo 构建 |
| N-10 | **不在每次 CI 跑 24h soak / 真机安装 / 签名** | 成本/平台限制；这些是 Release Tier，不是每次提交门 | QT-105/605/703 完成后按 Tier 2 触发 |
| N-11 | **不重复实现安全 triage 的信任根/传输协议/updater 设计** | 避免两份实现/两个信任根；本文件只做证据与门禁 | security triage 产出后按接口接线 |
| N-12 | **不在本轮做 UX/PSYCH 的 UI 修复（菜单/字号/无障碍/年龄门）** | 已路由 UX/psych triage；本文件只提供回归测试与门禁依赖 | UX triage 任务落地后补对应 E2E/行为测试 |

---

## 10. 完成定义（本 triage 的验收口径）

当且仅当以下 8 条都满足，可认为“质量/性能/资产与内容管线”在本轮评审后已任务化并达到可发布工程标准：

1. **干净可复现**：任意目录 `git archive HEAD`（或干净 clone）+ `npm ci` + `npm run ci` 在 Linux 与 Windows 全绿，并有真实 CI run 记录；插件独立 checkout 的 test/check/verify/typecheck/prepack 全绿且 0 skip。
2. **数据安全**：连续 3 次 E2E 前后真实 `%APPDATA%/com.perrylink.desktopgames` 哈希不变；未设 `DG_QA_DATA_DIR` 时 `--reset-saves` 拒绝；测试不再断言真实存档路径。
3. **数据链**：`save-runtime` 行/分支覆盖 ≥90%，10 条故障注入用例全绿；坏档/备份/超时/退出保存/删除标志均有行为测试；`main.ts` ≤2,500 行且关键行为不再靠源码正则证明。
4. **覆盖率与静态质量**：覆盖率分母包含全部 `src/**`（含 main.ts/setup-page/shell-layout）；ratchet 生效；lint/typecheck 0 error；静态断言有策略/行为分层清单。
5. **内容/资产**：timing 单一源 + CI 等价门；famling↔插件 parity 检查常驻且能因单端改动报红；插件首屏预算冻结 78 KiB 且内容中心在 lazy chunk；安装器恶意 zip 向量全拒。
6. **性能/DPI**：当前 HEAD 有可复现性能基线（provenance + 阈值）；DPI/多屏实机矩阵通过；reduced-motion 行为测试通过；24h soak JSON 存在且 analyzer PASS（或明确记录“未做”且发布说明标注）。
7. **发布证据**：`SHA256SUMS.txt` 有发布者外层签名；`RELEASE-MANIFEST.json`/`build-info.json` 齐备且 `--verify` 通过；E2E/ACL/soak/安装证据在 `artifacts/qa/<date>/<run-id>/` 且带 provenance；DLC 已签名或已从 release 移除。
8. **状态真值**：README/HANDOFF/RELEASE-RUNBOOK 对 remote/CI/测试数/soak/签名的描述一致，且由脚本生成/校验；历史报告标 superseded。

---

## 附录 A：当前证据快照（2026-11-19 14:30–14:45，HEAD 7107a61）

| 主题 | 当前值/证据 | 环境/限制 |
|---|---|---|
| git | `HEAD 7107a61`；remote 为空；无 tag；工作树仅 docs 修改 | WSL2 |
| 测试 | 126 个测试文件 / 1,176 tests；本机 1,166 pass / 10 fail（spawn CLI 的 esbuild 平台不匹配）；插件 90/90 | 本机 node_modules 为 win32 安装；评审 13:00 Windows 记录 1,176/1,176 |
| typecheck | `npm run typecheck` exit 0 | 本机 |
| 结构 | `main.ts` 3,607 行；`content-hub.ts` 2,315（`initContentHub` 起 L1289）；`content-library.ts` 4,568；`content-assets.ts` 1,270；`content-market.ts` 2,094；`desktop-shell.ts` 2,244；`hero-runtime.ts` 1,250 | 只读 wc |
| 测试形态 | 0 个测试 import `main.ts`；14 个测试读 `main.ts` 文本；纯静态测试约 21 个；无 coverage/lint/jsdom/Playwright | grep/package.json |
| GUI 隔离 | 无 `DG_QA_DATA_DIR`/`app_directories_override`；`e2e-tauri.ps1:51` 断言真实 APPDATA、`:69-95` 五次 `-ResetSaves`；`main.rs:952-959` 整目录删 saves；`artifacts/` 12 GB / 941 个 `cdp-wv2-*`；`e2e-tauri.json` mtime 11-14 14:44 | 未跑 E2E |
| 插件 | 0.10.2；90 tests；entry 75.3 KiB（预算 78，0.10.1 由 72 上调）；首帧 137.1 KiB；全量 322.7 KiB；无 `.github`/`prepack`/`typecheck`；`test/client-static.test.js:166,213,377` 三处 skip；`embed-anims.mjs:82-84` 默认读 `../../desktop-games` | 本机跑 90/90；未在独立 checkout 实跑 |
| 资产 | 42 WAV / 4,289,208 B；无 ogg/opus；`public/` 7.0 MB；`dist/` 8.9 MB；9 个 HTML 入口；`pixi/cordis/sentry/electron` 依赖仍在 | 只读 du/ls |
| 发布证据 | `artifacts/` 无 SHA256SUMS/RELEASE-MANIFEST/build-info/tauri-soak-24h.json；DLC 生产根 `keys: []`；两 pack 仅 `signature.txt`；`legal-check --strict` BLOCKED 34 | 只读 |
| 性能/DPI | 无当前 HEAD 基线/24h/DPI 证据；`devicePixelRatio` 启动读一次；无 `devicechange` 监听；rAF 每帧但 renderKey 门控 | 静态推断 + 评审历史 |
| 内容/市场 | library `famling.content/0.2`（4 角色/4 rolePresets/4 themes，含 high-contrast）；content-pack 0.2（roleThemes+components+zip+声明+sha256）；market-catalog 0.1 + Ed25519；`content-market.ts` 29 测试；main/UI 未接线市场（默认不联网）；安装器/服务器未实现 | 只读代码/文档 |
| 动画/热切换 | `HERO_CHARACTER_IDS` 仍 4 个硬编码；`hero-runtime` 不 import content-library；角色切换 `main.ts:1167 window.location.reload()`；`anim/idle.ts` 500 行等死代码仍在 | 只读 grep |
| 菜单/安静控制 | 根菜单 5 项 + 分级子菜单；设置弹窗有静音/音量/reduce-motion；开发面板仅 debug；退出前保存已实现；reduce-motion 冻结 JS 场景时钟 | 只读代码（未实机） |

## 附录 B：评审条目 → 本文件任务映射（traceability）

| 评审条目 | 判定 | 本文件落点 |
|---|---|---|
| QA P0-1 GUI 数据隔离 | 仍成立 | Q-P0-1 → QT-201/202；产品级存储 → QT-205 |
| QA P0-2 质量门 | 部分解决（2 红已修） | Q-P0-2 → QT-101/102/103/105；插件 → QT-104 |
| QA P0-3 数据链/main.ts | 仍成立 | Q-P0-3 → QT-301/302/304 |
| QA P1-1 发布证据 | 升级 P0 | Q-P0-4 → QT-701/702/703 |
| QA P1-2 插件发布闭环 | 部分解决 | QT-104 |
| QA P1-3 GUI/E2E | 仍成立 | QT-203/204 |
| QA P1-4 故障注入 | 仍成立 | QT-303/507 |
| QA P1-5 覆盖率/静态断言 | 仍成立 | QT-401/402 |
| QA P1-6 Rust gate | 仍成立 | QT-105 |
| QA P1-7 同源存储 | 仍成立 | QT-205 |
| QA P1-8 24h/性能/DPI | 仍成立 | QT-601/602/605 |
| QA P2-1..P2-10 | 多数仍成立 | QT-801/802/803、QT-403/404、附录 A |
| SOFTWARE P0-1 | = QA P0-2 | QT-101/102/103 |
| SOFTWARE P1-1 main.ts | 仍成立 | QT-301/304 |
| SOFTWARE P1-2 initContentHub | 仍成立（1,000 行级） | 路由 UX/arch；测试侧 QT-304 |
| SOFTWARE P1-3 内容三源 | 部分解决（值已对齐，无单源） | QT-502 |
| SOFTWARE P1-4 测试金字塔 | 部分解决（插件行为测试强） | QT-304/401/402 |
| SOFTWARE P1-5 插件纯 JS | 仍成立 | QT-104/403 |
| SOFTWARE P1-6 持久化/reload | 部分解决（退出保存） | QT-302（持久化）；reload 路由 GAME P1-4/QT-506 |
| SOFTWARE P1-7 产物/预算 | 仍成立 | QT-508/604 |
| SOFTWARE P2-1..P2-7 | 多数仍成立 | QT-802/803/403；`content-library` 拆分路由 arch/软件 triage |
| GAME P0-1 内容市场新角色 | 部分解决（角色=主题已落地） | QT-506（条件）；QT-502 |
| GAME P0-2 DLC release 失败 | 仍成立 | QT-704（+ security triage） |
| GAME P0-3 玩法/产品形态 | 仍成立（决策） | 决策门 D-1；§9 N-06 |
| GAME P1-1 动画双轨 | 仍成立 | QT-504 |
| GAME P1-2 计时 6 处 | 仍成立 | QT-501 |
| GAME P1-3 资产预算/WAV | 仍成立（受权利阻塞） | QT-603/604；atlas → §9 N-02（不做/条件） |
| GAME P1-4 角色切换 reload | 仍成立 | QT-506（热切换） |
| GAME P1-5 角色/动作 4 处 | 仍成立 | QT-503 |
| GAME P1-6 DLC 只能数据 | 仍成立（设计） | QT-507 + QT-506；信封收敛路由 arch/security |
| GAME P1-7 死 clip/blink | 仍成立 | QT-505 |
| GAME P1-8 DPI | 仍成立 | QT-602 |
| GAME P2-1..P2-9 | 部分/多数仍成立 | QT-601/603/604；P2-4 → QT-204；P2-9 部分解决（tinglan DLC 门控/实验页移除） |
| ARCH P0-1 共享语义 | 部分解决 | QT-502；spec 工件化路由 arch triage |
| ARCH P0-2 插件不可自证 | 仍成立（本文件 P1，见 §5.5 注） | QT-104 |
| ARCH P0-3 发布信任/身份 | 仍成立 | QT-704 + QT-701；ceremony 路由 security |
| ARCH P1-1/P1-2/P1-3 | 仍成立 | 路由 arch/security；QT-507 只做安装向量 |
| ARCH P1-4 单体化 | 部分解决 | QT-301/304 |
| ARCH P1-5 多管线/遗留 | 仍成立 | QT-502/504；Electron 归档 → QT-802 |
| ARCH P1-6 公开镜像/CI | 仍成立 | QT-103/105/803 |
| ARCH P1-7 同源 storage | 仍成立 | QT-205 |
| ARCH P2-1..P2-10 | 多数仍成立 | QT-403/508/801/802/803；分层路由 arch |
| NETWORK P0-1/P0-2 | 仍成立 | QT-704/QT-701；实现路由 security |
| NETWORK P1-1/P2-1 | **已解决**（content-market.ts + 29 测试） | 无任务；验证并入 QT-507 |
| NETWORK P1-2/P1-3/P1-4/P1-5/P1-7 | 仍成立 | 路由 network/security triage |
| NETWORK P1-6 下载/解压/安装 | 部分解决（客户端钩子） | QT-507 |
| NETWORK P2-2..P2-12 | 多数仍成立 | 路由 network；P2-8 → QT-105、P2-9 → QT-701、P2-10 → QT-803 |
| UX P0-1/P0-2 | 部分解决（菜单/设置） | 路由 UX triage；测试侧由 QT-204 覆盖 |
| UX P0-3/P1-1/P1-3/P1-5/P1-7 | 部分/仍成立 | 路由 UX triage；数据链测试 QT-301 |
| UX P0-4（托盘/复位） | 仍成立 | 路由 UX/架构；§9 N-12 |
| PSYCH P0-1 | 部分解决（静音/音量/reduce-motion） | 路由 UX/psych；QT-602 补 reduced-motion 行为测试 |
| PSYCH P0-2/P0-3/P1-*/P2-* | 多数仍成立 | 路由 psych/UX/legal triage |

## 附录 C：未验证与边界（诚实声明）

1. **未实机**：Tauri/WebView2/DPI/多屏/点击穿透/安装器/签名 exe/24h soak 均未在本轮复测；相关结论来自评审历史证据或静态代码。
2. **未联网**：未核对 GitHub remote/Actions、npm registry 的 `dsh-famling` 0.0.1 占位、外部证书/密钥状态；NETWORK/ARCH 相关外部事实沿用评审快照。
3. **未跑 CI**：本文件所有“CI 会绿/会红”的断言都是基于本地命令与配置的推论；唯一有效证据是 QT-103 的真实 run。
4. **行号会漂移**：当前行号对应 HEAD 7107a61；后续提交后请以函数名/命令输出复核。
5. **数字口径**：测试数/资产字节/文件行数只对应本轮实测时刻；任何“现值”以 `docs/CURRENT-STATUS.md`（QT-803 生成）为准。
6. **本文件不构成发布/合规声明**：不替代 legal-check、APPROVALS、签名 ceremony 与真实 CI run。

---

*本文件由 triage-quality 子代理于 2026-11-19 完成；只读分析 + 本文件唯一写入；未改代码/资产/配置，未 commit/push，未联网。*
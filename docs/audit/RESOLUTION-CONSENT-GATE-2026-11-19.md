# RESOLUTION · P1-4 Consent/TOS/DLC 门下沉到 Rust 与页面路由

> 日期：2026-11-19 · 范围：`desktop-games`（famling）私有仓；**不改** `plugins/dsh-famling`。
> 依据审计：`docs/audit/FAMLING-SECURITY-AUDIT-2026-11-18.md` §P1-4（L120-L142，验收口径 L582）。
> 相关审计（已读，结论不直接适用于本任务）：`deepseek-community-hub/docs/audit/DSH-FAMLING-SECURITY-AUDIT-2026-11-18.md`（插件 F-05，属插件侧）、`PET-ROBUSTNESS-AUDIT-2026-11-18.md`（其 P1-4 是插件嵌入数据过期，非本项）、`PET-PERFORMANCE-AUDIT-2026-11-18.md`（无 consent 项）。

## 0. 结论

**P1-4 在 desktop-games 仓内已关闭**（五条绕过逐条有门 + 回归测试），并顺带修复上一个提交引入的游戏存档窗口回归。

| 审计绕过 | 处置 | 证据 |
|---|---|---|
| 1. 随包 `tinglan-lab.html` 直读 character pack、无 consent；`setup.html` 有链接、`dist/` 随构建发布 | 移除 setup 入口；从 Vite 发布 input 移除；重建后 `dist/` 无该页 | `setup.html:150-151`、`vite.config.ts:359-360`、构建后 `ls dist/*.html` |
| 2. 游戏页挂载 DLC 无 per-load 同意 | `dlc_verify`/`dlc_list`/`read_pack_manifest` 在 Rust 侧要求已记录 TOS；游戏窗口本身只有在同意后才创建 | `main.rs:549-560,681-700,709-720` |
| 3. `--game=` 路由页面完全没有 TOS/consent | 无有效宿主同意记录时**不创建游戏窗口**，保留 pet 窗口跑年龄+TOS；同意后由 `record_host_consent` 自动打开暂扣的游戏窗口 | `main.rs:353-359,926-937,944-996,850-905` |
| 4. `?character=tinglan` 走内置分支跳过 DLC 门 | 改用 `isBuiltinCharacterId()` 分类：`tinglan` 不是内置，canvas 路径的 runtime 加载必须过 `loadCharacterPackWithConsent()`；拒绝则回退折纸 | `main.ts:2082-2101` |
| 5. 门只在 UI 调用点，`voice_*`/brief/DLC IPC 可直调 | Rust 宿主 consent 状态 + TTS/ASR 声明确认；`voice_synthesize`/`voice_asr` 改为 main.rs 包装命令，要求 pet 窗口 + TOS + 对应声明；brief/DLC/pack 命令要求 TOS；游戏/bench 窗口全部拒绝 | `main.rs:316-343,362-493,497-516,519-560,681-720` |
| 6. 同意记录是 localStorage 明文前端自证 | 未改变「本机记录不是证据级」的定性；新增宿主标记同样可被本机用户伪造。**文档不得宣称技术不可绕过**（见 §6-2） | `main.rs:20-25,220-284` |

## 1. 设计

### 1.1 宿主 consent 状态（Rust）

- 可信版本/哈希编译进二进制：`HOST_TOS_VERSION` / `HOST_TOS_HASH`（`main.rs:24-25`），与 `src/pet/consent/terms.ts` 一致由 `tests/consent-host-gate.test.ts` 钉住（漂移即测试红）。
- 进程内状态 `HostConsent { accepted, tos_*, persisted, tts_granted, asr_granted }`，`Mutex` 保护（`main.rs:20-35`）。
- 持久标记：`app_data_dir/consent/host-consent.json`，字段 `format/schema/tosVersion/tosHash/acceptedAt`（无用户文本/身份）；写入为 tmp + `MoveFileExW(MOVEFILE_REPLACE_EXISTING|WRITE_THROUGH)` 原子替换（`main.rs:262-271`）。解析 fail-closed：格式/schema/版本/哈希/时间任一不符即视为未同意（`main.rs:234-251`）。仅用于「下次 `--game=` 启动是否还需要先过 TOS」，不作为 UI 同意读取。
- 命令（全部先 `require_pet_window`，窗口 label ∈ {main, pet}）：

| 命令 | 作用 | 额外约束 |
|---|---|---|
| `record_host_consent` | 记录完整 TOS 同意（`persist=false` 时仅内存并删除旧标记） | 版本/哈希必须等于编译期常量；末尾打开暂扣的 `--game=` 路由 |
| `revoke_host_consent` | 撤回：清内存状态 + 删标记（核验返回 bool）+ 清暂扣路由 | — |
| `grant_host_voice_consent` | 镜像 TTS/ASR 声明确认（会话内布尔） | 必须先有 TOS；kind 白名单 tts/asr |
| `host_consent_status` | 只读诊断（QA/E2E） | 不授予任何权限 |

### 1.2 IPC 门（TTS/ASR/brief/DLC）

- `voice.rs` 的 `voice_synthesize`/`voice_asr` 去掉 `#[tauri::command]`，保留 `pub async fn`（`voice.rs:124,199`）；注册入口唯一改为 main.rs 包装命令（`main.rs:497-516`）。JS 调用名/参数不变，ACL 矩阵不变。
- 包装命令要求：窗口 ∈ {pet, main}、TOS 已记录、且对应声明已确认（`require_voice_consent`，`main.rs:326-343`；纯函数 `voice_consent_allowed`，`main.rs:316-324` 锁「TOS 不能替代 TTS/ASR、TTS 不能替代 ASR、撤回 TOS 即撤销语音」）。
- `read_advisers_brief` 增加 `require_host_consent`（`main.rs:519-524`）；`read_pack_manifest`/`dlc_verify`/`dlc_list` 增加 TOS 校验（`main.rs:549-560,681-720`），仍保留原窗口白名单。
- 渲染端镜像：`src/pet/consent/host.ts`（纯投影 + no-op/失败安全 Tauri 调用）。`main.ts:1509-1510` 引导时同步（若宿主已打开暂扣路由则直接 return）；`main.ts:668`（TTS 声明确认后、合成前）、`main.ts:987`（ASR 声明确认后、开录前）授权；`main.ts:2623` 在撤回/删除数据的 `stopVoiceProcessing` 中撤销；`main.ts:2682-2683` 只读屏重新同意时再次同步。

### 1.3 页面/路由门

- 启动解析：`--game=` 为产品路由且需要 TOS；`--page=` 仅作 QA/自动化别名不拦截（`main.rs:944-996`）。`pet` 是 consent gate 自身，永不暂扣。
- 无有效持久标记时：`--game=aquarium|town|stall|farm` 只保留 tauri.conf.json 的 pet 窗口（年龄 + 完整 TOS），路由 spec 存入 `PendingRoute`；`record_host_consent` 成功后由 `build_route_window` 打开目标窗口并关闭 pet 窗口（`main.rs:362-423,850-905`）。
- 路由窗口构建抽成 `build_route_window`，保留原 480x336 / transparent / always-on-top / 无边框 / skip_taskbar / demo 注入 / `--size`/`--pet-size` 行为。
- 暂扣的 `--game=` 路由在用户拒绝 TOS 时不会打开；撤回同意时清空暂扣（`main.rs:425-447`）。

### 1.4 开发页收口

- `setup.html` 删除「行为/语音实验台」链接，只留返回桌宠 + dev-only 说明（`setup.html:150-151`）。
- `vite.config.ts` 的 `rollupOptions.input` 移除 `tinglanLab: 'tinglan-lab.html'`（`vite.config.ts:351-364`）。重建后 `dist/*.html` = aquarium/chat-import/index/pet/presence/setup/stall/town/world（无 tinglan-lab）。
- `tinglan-lab.html`/`src/pet/tinglan-lab.ts`/`tinglan-lab.css` 源文件仍保留在仓内（不再构建、产品无入口）；删除/迁移 dev-only 目录建议另开任务（§6-8）。

### 1.5 `?character=tinglan`

- `startHeroPage()` 仍用 `isHeroCharacterId()` 选择 canvas/preview 路径，但真正加载前用 `isBuiltinCharacterId(HERO_CONFIG.character)` 判定：非内置（含 `tinglan`）必须 `loadCharacterPackWithConsent(gate, HERO_CONFIG.character, ...)`，捕获 `ConsentDeclinedError` 后 `fallbackHero('consent-declined: character-pack')`（`main.ts:2082-2101`）。
- 覆盖 URL `?character=tinglan` 与被篡改的 localStorage `heroCharacter=tinglan` 两条路径（都经 `HERO_CONFIG.character`）。

### 1.6 数据控制 / 撤回

- `DataControlHost` 新增可选 `clearHostConsent(): Promise<boolean>`（`data-controls.ts:58-70`）；Tauri 接入 `revoke_host_consent`（`runtime.ts:155-158`）。「删除全部本地数据」对该项调用+核验，失败记为 residual，不谎报成功（`data-controls.ts:362-385`）。
- 撤回同意/删除数据时 `stopVoiceProcessing` 先撤销宿主标记（`main.ts:2623`），再走原 gate 状态切换；重新同意会重新记录。

### 1.7 首启 TOS 弹窗的「使用限制」独立红色块（用户本轮新增需求）

- `modal.ts` 增加 `USE_RESTRICTIONS_SHORT`（`modal.ts:284-291`），在 `showTosDialog` 中渲染独立 `role=note` 红色块（`#a63d35`，`modal.ts:342-353`），位置在完整 TOS 滚动区之前、勾选同意之前；纯文本节点，不用 innerHTML。
- **未修改** `terms.ts` 的 TOS 正文/版本/哈希；`TOS_VERSION=2026-11-17.6`、`TOS_HASH=b3b8e9…befb` 由测试钉住不漂移。TTS/ASR/age/roleplay 弹窗与 about/setup 既有文案不改。

### 1.8 附带修复：游戏存档窗口回归

- af012a6 把 `write_save/read_save/delete_save` 收紧为 `require_pet_window`，但 aquarium/town/stall/farm 页面仍 invoke 这些命令 ⇒ 游戏存档必然失败。改为 `require_save_window(window, slot)`：pet/main 任意 slot；aquarium 仅 `aquarium`；town 仅 `town`；stall 仅 `stall`/`stall-*`；farm/demo/bench 仅 `p0` 或 farm 前缀；其它窗口拒绝（`main.rs:297-314`，三处调用 `main.rs:575,637,657`）。

## 2. 验证（真实执行）

环境说明：工作树 `node_modules` 当前为 Linux esbuild（并行任务重装），故 Node 测试用 WSL `node`；Rust 用 Windows toolchain（`cargo.exe`，MSVC），因 WSL 无 Linux GUI/webkit 依赖。Tauri 真实 Windows GUI 行为不在本报告验证范围（见 §6-10）。

| 命令 | 结果 |
|---|---|
| `cargo.exe check --message-format short`（`app/tauri/src-tauri`） | **exit 0**（E0255 已消除） |
| `cargo.exe test --bin desktop-games-tauri` | **8 passed, 0 failed**（含 `host_consent_tests` 5 项 + voice 2 项 + DPAPI 1 项） |
| `node node_modules/typescript/bin/tsc --noEmit` | **exit 0** |
| `node --import tsx --test tests/*.test.ts` | **961 tests / 961 pass / 0 fail**（含新增 `tests/consent-host-gate.test.ts` 12 项） |
| `node --import tsx --test <consent/legal/tauri 16 文件>`（定向） | **150 pass / 0 fail** |
| `npm run build` | **exit 0**；baked voice 42 WAV ok；legal package 37 文件 ok |
| `ls dist/*.html` | aquarium/chat-import/index/pet/presence/setup/stall/town/world —— **无 `tinglan-lab.html`** |
| `grep -n tinglan-lab setup.html vite.config.ts` | 无命中 |
| `grep generate_handler` 注册表 | `voice_synthesize`/`voice_asr` 为包装命令；无 `voice::voice_synthesize`/`voice::voice_asr` 直接注册 |
| task-42 独立复验（当前树） | `cargo check` exit 0；`cargo build --release --features custom-protocol` exit 0；`cargo test` 8 passed；`npm run typecheck` exit 0；`npm test` 982 passed；Windows CDP 7 窗口 × 121 断言 PASS（详见 `RESOLUTION-TAURI-ACL-2026-11-19.md` §4.4） |

复跑方式：

```bash
cd D:/Projects/dsh/desktop-games
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test tests/consent-host-gate.test.ts
node --import tsx --test tests/*.test.ts
npm run build && ls dist/*.html
cd app/tauri/src-tauri && cargo.exe check && cargo.exe test --bin desktop-games-tauri
```

## 3. P0/P1 状态

- **P1-4：关闭**（本报告 §0 表；验收口径 L582 的 4 条 E2E/静态项中，静态/单元/构建均绿；Windows CDP 运行时矩阵由 task-42 完成，见 §6-1 与 `RESOLUTION-TAURI-ACL-2026-11-19.md` §4.4）。
- **P1-2（命令 ACL）：已由 task-42（`tauri-acl-resolve`）关闭**（AppManifest/capability 门禁 + Windows 运行时矩阵，7 窗口 × 121 断言全 PASS），本任务新增的 4 个 consent 命令与 save 命令的窗口授权已纳入其矩阵；本任务的窗口/consent 运行时校验作为**纵深防御叠加**保留。注意：ACL 门禁**没有跳过开关**——今后任何新增/改名 `#[tauri::command]` 必须同步 `build.rs` COMMANDS 与 capability，否则构建直接失败。
- P1-1（DLC 签名信任根）/P1-3（innerHTML 注入）不在本任务范围（分别 task-41/task-44）。

## 4. 文件清单（本任务实际修改）

| 文件 | 改动 |
|---|---|
| `app/tauri/src-tauri/src/main.rs` | 宿主 consent 状态/标记/命令；路由门 + `build_route_window`；voice 包装命令；brief/DLC consent 校验；save 窗口+slot 门；Rust 单测 |
| `app/tauri/src-tauri/src/voice.rs` | 仅删除 `voice_synthesize`/`voice_asr` 的 `#[tauri::command]`（保留实现；main.rs 包装唯一注册，避免 E0255；lead 已批准） |
| `src/pet/consent/host.ts`（新增） | 渲染端宿主 consent 桥：纯投影 + no-op/失败安全 invoke |
| `src/pet/main.ts` | 引导同步/撤回；TTS/ASR 声明后授权；`?character=tinglan` DLC 门 + 回退 |
| `src/pet/consent/modal.ts` | 首启 TOS 红色使用限制块（不改 TOS 文本/版本/哈希） |
| `src/pet/consent/data-controls.ts` / `runtime.ts` | 宿主 consent 标记的删除+核验接线 |
| `setup.html` | 移除 lab 链接 + dev-only 说明 |
| `vite.config.ts` | 从发布构建 input 移除 `tinglan-lab.html`（lead 已批准） |
| `tests/consent-host-gate.test.ts`（新增） | 12 项：常量/哈希钉住、命令注册、voice 门、路由门、渲染镜像、character 分类、lab 移除、save 窗口矩阵、红色块顺序、marker 删除核验（lead 已批准新增文件） |
| `docs/audit/RESOLUTION-CONSENT-GATE-2026-11-19.md`（本文件） | — |

## 5. 剩余 blocker / 风险（如实列）

1. **Rust 命令 ACL：已由 task-42 闭环（2026-11-19 09:43 更新）**：`build.rs`/`capabilities` 已包含 4 个 consent 命令（pet-shell）与 `write_save/read_save/delete_save` 的 pet+game+bench 授权；Windows release + `--features custom-protocol` 实测矩阵（7 窗口 × 121 断言）全 PASS：aquarium/town/stall/farm/bench 调 `read_advisers_brief`/`voice_*` 等返回 `Command ... not allowed by ACL`，pet/main 正常到业务层；证据见 `RESOLUTION-TAURI-ACL-2026-11-19.md` §4.4。本任务不再有该项 blocker。**残留注意**：task-42 探针用 `--page=` QA 别名（`--game=` 无 marker 时会被本任务暂扣，属预期），因此「首启 `--game=aquarium` → pet TOS → 同意后自动切窗口」这条产品链路仍建议做一次人工冒烟（见 §5-10）；ACL 门禁无跳过开关，命令表变更必须同步 `build.rs`/capability。
2. **本机同意记录不是防篡改证据**：localStorage 同意与 `host-consent.json` 均可被本机用户/同源脚本伪造（与审计 L128 一致）。设计目标是「用户自主控制 + 纵深防御 + 审计留痕」，不得对外宣称「技术不可绕过」；若要面向监管需服务端/系统级签署。
3. **多实例并发**：标记写入是单文件 tmp+rename（原子）；但两个应用进程之间不共享内存状态，A 进程撤回不会撤销 B 进程内存中的 accepted；并发 `--game=` 启动时最后一个 writer 生效。当前产品形态为单实例桌面宠物，未做跨进程锁；如未来允许多开，需加单实例守卫或文件锁。
4. **voice 授权的粒度**：Rust 只保存会话内 `tts_granted/asr_granted` 布尔，不校验配置签名（配置签名逻辑在渲染端 `currentTtsConfig/currentAsrConfig`）。渲染端配置变更仍会重新弹声明并重新授权；但同窗口已授权后注入的 JS 可绕过 UI 声明（属 P1-2/P1-3 链），Rust 侧只能做到「未声明过就拒绝」。
5. **`--page=` QA 别名与 `--bench` 不拦**：`--page=` 用于 E2E/soak（fresh WebView2 profile、无 localStorage），`--bench` 打开 index.html；两者在 release 二进制存在。产品快捷方式/portable 用 `--game=`，因此发布路径受门；但若要把这两个 QA 入口也纳入门，需要在 debug build 才允许（建议后续任务）。
6. **TOS 常量双写**：`terms.ts` 与 `main.rs:24-25` 双份，版本升级必须同时改；`tests/consent-host-gate.test.ts` 会在漂移时红，但发布 checklist 应显式加一条。
7. **标记文件的数据清单**：新文件 `app_data_dir/consent/host-consent.json`（仅版本/哈希/时间，无身份/文本）已加入「删除全部本地数据」并核验；`public/legal/PRIVACY.md` / use-restrictions 文档未改（本任务不改 plugin/legal 文档），建议 task-47 或后续把该文件写进隐私清单与数据控制 UI 说明。
8. **dev 页源文件残留**：`tinglan-lab.html`/`src/pet/tinglan-lab.ts`/`tinglan-lab.css` 仍可被 `npm run dev` 打开（dev server 不经发布构建）。发布产物已无此页、产品无入口；是否删除源文件/迁到 `dev/` 目录需 lead 决定（lead 已允许删除但要求先报告，本任务未删）。
9. **session-only 同意**：localStorage 不可用时 `persist=false`，宿主只记录内存并从磁盘删除旧标记；下次 `--game=` 启动会重新要求 TOS（符合「会话级同意」语义，不是缺陷，但发布 QA 需知）。
10. **未验证项（已缩小）**：本机无 Windows GUI/Tauri 运行环境；`cargo check/test` + Vite build + Node 测试为本报告证据。task-42 已用 Windows release + CDP 覆盖命令/窗口拒绝矩阵（`--page=` 别名逐窗口），但**路由暂扣后的窗口创建/关闭时序**仍是静态/单测证据：需在 Windows 上做一次 `--game=aquarium` 全流程手测（未过 TOS → pet 弹窗；同意后自动切 aquarium；重启后直接 aquarium；撤回同意后重启重新弹 TOS）。

## 6. 审计原文 acceptance 对照

| 审计验收（L582） | 本任务证据 |
|---|---|
| `--game=aquarium/town/stall` 启动必须先过 TOS/DLC 门 | 未同意时不开游戏窗口、pet 窗口出 TOS；同意后 `record_host_consent` 打开暂扣路由（`main.rs:353-359,926-1000,362-423`）；Rust 单测 `product_routes_are_held_until_consent_except_the_pet_gate` |
| `tinglan-lab.html` 不在发布产物（或已过门） | 发布 input 已移除；`npm run build` 后 `dist/*.html` 无该页；setup 无链接 |
| `pet.html?hero=1&character=tinglan` 弹完整 TOS | `main.ts:2082-2101`：非 builtin 走 `loadCharacterPackWithConsent`（`dlc.pack-load` 完整 TOS），拒绝回退 |
| `invoke('voice_asr')` 无 token/非 pet 窗口被拒 | `main.rs:326-343,497-516`：非 pet/main 窗口、无 TOS、未确认 ASR 声明均拒绝；Rust 单测 `voice_consent_needs_tos_and_the_matching_declaration` |
| `tests/consent-bypass.test.ts` 扩展覆盖 | 未改现有测试文件（避免与并行任务冲突）；新增 `tests/consent-host-gate.test.ts` 12 项覆盖上述 4 入口 + `?character`/lab/save/数据控制；原 `consent-bypass`/`consent-static`/`dlc-consent` 全绿 |

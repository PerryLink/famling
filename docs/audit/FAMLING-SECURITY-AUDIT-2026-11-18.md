# famling 安全审计 — Tauri v2 / IPC / 内容包 / 隐私 / 供应链

- **日期**：2026-11-18（Asia/Shanghai；执行窗口 2026-11-18 23:58 – 2026-11-19 00:3x）
- **审计对象**：`/mnt/d/Projects/dsh/desktop-games`（famling / Pagefold 桌宠 + Tauri v2 壳 + DLC/pack 链），关联只读参考 `/mnt/d/Projects/dsh/plugins/advisers`（仅读契约，未审计其代码）
- **代码基线**：`git rev-parse HEAD` = **a3ac3c3**（`feat(pet): species interactions, random replies, white bubbles, real locomotion, alpha hit regions and slow cat stretch`）
- **工作树状态（重要）**：审计开始时工作树有 9 个已修改文件 + 1 个未跟踪文档（并行 agent 的未提交改动）；**审计期间并行 agent 继续改代码**（报告写入时已扩至 16 个文件，含 `src/pet/main.ts`、`src/pet/hero-runtime.ts`、`app/tauri/src-tauri/src/main.rs` 等），因此工作树内容/行号会持续漂移。**本文所有 `文件:行号` 一律以 HEAD a3ac3c3 为准**（用 `git show HEAD:<file>` 核对，方法见附录 A）；工作树差异是并行任务所为、非本次审计，且不改变本报告对 HEAD 的安全结论。
- **审计方式**：**只读静态审计** + 少量不修改仓库的可复现实测（见 §8 证据命令）。未启动 Tauri/WebView2 GUI，未跑浏览器 E2E，未调用任何云 API（未使用 API key），未做 fuzz/渗透。**凡未实测处均标注「静态」**。
- **写入**：仅本文件 `docs/audit/FAMLING-SECURITY-AUDIT-2026-11-18.md`；未改代码/JSON/资产；临时探针只写 `/tmp`。
- **分级口径**：**P0** = 可远程/未认证直接造成机密性/完整性/可用性破坏，或发布即违反硬红线；**P1** = 需要一条现实链（签名内容、页面注入、同用户本地进程）才能造成实质影响，或阻塞发布的安全/合规缺陷；**P2** = 纵深防御缺口/低影响/需要本地先决条件；**P3/Info** = 记录性观察。

---

## 0. 结论摘要

**P0：未发现。** 本应用没有服务端、没有网络监听、没有自动更新/远程代码加载；对外网络面只有固定的 `api.deepseek.com` TTS/ASR 与 `chat.deepseek.com` 分享读取，且均只在用户操作后由 Rust 发起。因此不存在「未认证远程直接打穿」的 P0 路径。**但若 P1-1 的 pack 签名私钥发生泄露/共享，P1-1 + P1-3 链（伪造签名内容 → 页面 HTML 注入 → 全 IPC → 本机隐私/云额度）将升级为 P0。**

| 级别 | 数量 | 条目 |
|---|---|---|
| **P0** | 0 | —（附判定理由与升级条件，见 §1） |
| **P1** | 4 | P1-1 内容签名信任根 = dev 密钥且可被启动参数覆盖；P1-2 自定义命令无窗口级 ACL + 全页面同源；P1-3 DLC 文本 `innerHTML` + Tauri 消费路径跳过校验；P1-4 consent/TOS/DLC 门存在多条绕过 |
| **P2** | 11 | CSP 缺口、IPC 无大小/速率限制、DLC 验签器路径/大小硬化不足、Advisers brief Rust 侧硬化、localStorage 明文隐私、云 key/配额、更新与产物签名、依赖+CI 供应链、随包 dev 页面、麦克风 label 不匹配、Windows 特有风险 |
| **正向核实（无问题）** | 13 项 | 见 §5 |

**最值得先修的 3 个点（给 lead 的排序）**：

1. **P1-1**：把 pack 签名信任根从 `packs/keys/dev-public.pem` 的 dev 密钥换成发布专用、离线保管、可轮换/吊销的密钥；release 构建移除 `--dlc-key`/`P0_PACKS_DIR` 覆盖。**这是整条内容信任链的根**。
2. **P1-2**：用 `tauri_build::AppManifest::commands` + `permissions/*.toml` 做**应用命令 ACL**，并按窗口拆分 capability；对 `read_advisers_brief`/`unprotect_text`/`voice_*`/`write_save` 增加窗口 label 白名单与最小暴露。
3. **P1-4**：补齐 consent 门：`tinglan-lab.html`（随包发布且 setup 有链接）、`--game=` 游戏页、`aquarium/demo` 的 DLC 挂载、`?character=tinglan` 分支，以及**IPC 级** TTS/ASR 直调（当前门只在 UI 层）。

（P1-3 应与 1/2 同批修：在 1/2 完成后 P1-3 的爆炸半径会大幅下降，但 `innerHTML` 与 Tauri 侧校验缺失本身仍是独立缺陷。）

---

## 1. P0 — 未发现（判定口径与升级条件）

审计确认以下**可能产生 P0 的路径均不存在或已被阻断**：

| 候选 P0 路径 | 静态/实测结论 |
|---|---|
| 远程加载并执行代码（auto-update / 远程 HTML / 远程 JS） | **不存在**。无 updater plugin（`app/tauri/src-tauri/Cargo.toml:9-18` 只有 tauri/serde/reqwest/base64/dlc-verify）；`tauri.conf.json` 无 `plugins.updater`；CSP `script-src 'self'`（`tauri.conf.json:30`）；所有窗口加载本地页面。 |
| 任意文件读/写/命令执行 IPC | **不存在通用能力**。未装 fs/shell/http/process 插件；自定义命令均返回固定类型，且 `read_pack_manifest` 有 canonicalize+containment（`main.rs:169-182`）、save/pack 路径用 `safe_slug`（`main.rs:75-82`）。 |
| 未签名的远程 DLC 内容 | **被阻断**。Rust 先验签字/哈希再解析内容（`native/dlc-verify/src/lib.rs:74` 验签 → `:90-101` 逐文件哈希）；实测篡改 content/manifest 均被拒（§8.3）。 |
| 云 API key 泄露到前端/包/日志 | **未发现**。key 只由 Rust `std::env::var("DEEPSEEK_API_KEY")` 读取（`voice.rs:111,126,196`），不返回前端、不写日志、不进包；前端 `src/` 无任何 key 读取/存储。 |
| 无用户交互即外传录音/对话 | **未发现**。ASR 麦克风仅在独立 ASR 声明确认后打开（`main.ts:937-984`；`setup-page.ts:362` 拒绝路径不调用 `getUserMedia`）；TTS 每次会话/配置变化重新确认（`main.ts:655`、`gate.ts:639`）。 |

**升级为 P0 的唯一现实条件**：`.keys/dev-private.pem`（当前只在本机、gitignored、未入 git 历史、当前备份 tar 已脱敏）若被共享/外传，则任何持有者可对**所有安装**签发恶意 pack；由于 P1-2/P1-3，恶意 pack 文本可进 `innerHTML` 并触达全部 IPC（读 Advisers brief、解密 DPAPI 存档、花用户云额度）。修复 P1-1 后此升级条件消失。

---

## 2. P1（发布前必须修 / 必须拍板）

### P1-1 内容包签名信任根 = 开发用 dev 密钥；无生产密钥/轮换/吊销；可被启动参数覆盖

- **位置（文件:行号）**
  - `app/tauri/src-tauri/src/main.rs:574-581`：默认校验公钥固定为 `packs_dir/keys/dev-public.pem`；`--dlc-key=` 可任意覆盖（`:574-577`）。
  - `app/tauri/src-tauri/src/main.rs:562-573`：`--packs-dir=` / 环境变量 `P0_PACKS_DIR` 可把整个 packs 目录（含 `keys/`）指向任意位置。
  - `app/tauri/src-tauri/tauri.conf.json:39`：安装包把整个 `packs/`（含 `keys/dev-public.pem`）作为资源分发。
  - `packs/keys/dev-public.pem`（**跟踪入库**）、`scripts/make-pack.ts:7`（签名使用 `.keys/dev-private.pem`）、`.gitignore:6`（`.keys/` 忽略）。
  - 文档自认：`THIRD-PARTY.md:121`（「开发用公钥；私钥不入库」）、`public/legal/RELEASE-BLOCKERS.md:46`（「dev 公钥签名的 pack 不得表述为 signed 生产包」）、`docs/UPDATER-KEYS-2026-11-15.md:3`（updater key 是另一套、且未接入）。
- **实测证据（未读取/未回显私钥内容）**
  - `.keys/dev-private.pem` 与 `packs/keys/dev-public.pem` 的公钥部分 SHA-256 **相同**（`openssl pkey -in .keys/dev-private.pem -pubout | sha256sum` 与 `openssl pkey -pubin -in packs/keys/dev-public.pem -pubout | sha256sum`）。
  - 私钥**未入库**：`git log --all -- .keys/dev-private.pem` 为空；`git ls-files '*.pem'` 只有 `packs/keys/dev-public.pem`；`git check-ignore -v .keys/dev-private.pem` 命中 `.gitignore:6`。
  - 便携包只带公钥：`artifacts/DesktopGames-0.1.0-portable.zip` 仅 14 项，无 `.keys/`（§8.6）。
- **影响**：签名是 DLC/内容唯一的完整性边界，但其信任根是**开发用**密钥；没有生产/发布密钥分离，也没有轮换、吊销、黑名单、签名索引。只要私钥经开发机、备份、共享目录、截图、聊天或未来社区签名服务泄露，攻击者即可对**所有用户**签发通过验证的恶意 pack（进而进入 P1-3）。`--dlc-key`/`P0_PACKS_DIR` 让「启动参数可控者」绕过信任根（本地先决条件，但也是社工/快捷方式投毒的落点）。当前私钥仅在本地（WSL 视图权限 777，Windows ACL 未实测），**尚无泄露证据**，故为 P1 而非 P0。
- **修复建议**
  1. 生成**发布专用** Ed25519 密钥（离线、密码保护、双人保管）；用 `include_bytes!`/编译期常量把生产公钥嵌入 release 二进制，**不再从可写 packs 目录读取信任根**。
  2. `--dlc-key` 与 `--packs-dir` 仅在 debug/QA 构建启用（`#[cfg(debug_assertions)]` 或显式 `--qa` 且 release 拒绝），release 中删除；`P0_PACKS_DIR` 同理。
  3. 建立密钥轮换/吊销：manifest 增加 `keyId`，二进制内置当前+下一把公钥；发布签名密钥的 fingerprint 与验证步骤写入 `SECURITY.md`。
  4. 对 `.keys/` 做 Windows ACL 收紧（icacls：仅当前用户+SYSTEM），并纳入发布检查（禁止任何包含 `.keys/`）。
- **验证方法**
  - 静态：`grep -n "dev-public\|--dlc-key\|P0_PACKS_DIR" app/tauri/src-tauri/src/main.rs`。
  - 动态：用 dev 私钥签一个 pack，喂给**release** 构建（无 `--dlc-key`）应被拒；release 二进制 `strings` 不含 dev 公钥 PEM 片段；`cargo build --release` 后检查 `packs/` 内不再需要 `keys/` 即可验证。
  - 回归：`packs/keys` 目录下不得出现可写的信任根；安装后 `packs/keys/dev-public.pem` 可删除而功能不降级（新方案）。

### P1-2 自定义命令没有窗口级 ACL；所有窗口/页面同源共享 localStorage；DPAPI/云能力暴露面过大

- **位置（文件:行号）**
  - `app/tauri/src-tauri/build.rs:1-3`：`tauri_build::build()` —— **未使用** `AppManifest::commands`。
  - `app/tauri/src-tauri/capabilities/default.json:5-29`：capability 的 `windows` 覆盖 `main/aquarium/town/stall/pet`，`permissions` 只有 `core:*`（窗口控制）；**没有任何应用命令的 permission 条目**。
  - `app/tauri/src-tauri/src/main.rs:591-611`：`invoke_handler` 注册了全部敏感命令：`secret::protect_text/unprotect_text`、`voice::voice_status/voice_synthesize/voice_cache_clear/voice_asr`、`fetch_deepseek_share`、`read_advisers_brief`、`read_pack_manifest`、`write_save/read_save/delete_save`、`dlc_verify/dlc_list`、`report_bench` 等。
  - Tauri v2 官方文档明确：*"By default, all commands that you registered in your app (using the tauri::Builder::invoke_handler function) are allowed to be used by all the windows and webviews of the app. To change that, consider using AppManifest::commands."*（<https://v2.tauri.app/security/capabilities/>，2026-11-18 取）。
  - `app/tauri/src-tauri/gen/schemas/acl-manifests.json` 只有 `core/*` 条目，证实应用命令未纳入 ACL。
- **影响**：这是本审计最重要的**结构性**问题。虽然当前所有页面都是第一方页面，但：
  1. 任何页面级 JS 执行（P1-3 的签名内容注入、未来第三方内容页、WebView 调试上下文、注入类漏洞）都能调用**全部**命令：读取 Advisers 私密 brief、调用 DPAPI `unprotect_text` 解密存档、`read_save` 读其他游戏存档、以用户 API 额度调用云 TTS/ASR、删改存档。
  2. 所有应用页面同源（Tauri custom protocol / devUrl），**localStorage 共享**：游戏页/XSS 可直接读 `desktop-games/consent/*`（同意记录）、`desktop-games/consent/age-verification-v1`（自报出生日期明文）、`desktop-games/pet/chat-import/v1`（导入会话摘要明文）。
  3. 命令本身没有速率/窗口约束（见 P2-2），恶意页面可批量消费。
- **修复建议**
  1. `build.rs` 改为 `tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[...])))`，并为每个命令写 `src-tauri/permissions/*.toml`（`commands.allow`）；capability 按窗口拆：`pet` 窗口拿 voice/save/brief；`aquarium/town/stall` 只拿 window 与各自 save/bench；`bench` 不拿任何敏感命令。
  2. 敏感命令内再加**运行时窗口白名单**（`webview.label()` 或 URL 判断），例如 `read_advisers_brief`/`unprotect_text`/`voice_*` 只接受 `pet`/`main`；`dlc_*` 只接受 `aquarium`/`main`。
  3. 把「同意 token」下沉到 IPC：UI gate 通过后由 Rust 侧签发一次性会话 token（或 Rust 侧维护 consent 状态），TTS/ASR/brief/写入命令校验 token，而不是只靠前端调用点自觉。
  4. 长期：把需要跨页共享的数据改由按窗口最小化的命令代理（不共享 Web Storage 域），或让游戏窗口使用独立数据目录/origin。
- **验证方法**
  - 静态：`cat app/tauri/src-tauri/build.rs`；`grep -rn 'commands.allow\|permissions' app/tauri/src-tauri/permissions 2>/dev/null`（当前目录不存在）。
  - 动态（修复后）：`--game=aquarium` 窗口执行 `__TAURI_INTERNALS__.invoke('read_advisers_brief')` 应返回权限错误；`bench` 窗口调用 `voice_asr` 应拒绝；`pet` 窗口仍正常。
  - 回归：在 `tests/` 增加「命令-窗口矩阵」静态测试（扫描 permissions/capabilities 与 invoke_handler 列表）。

### P1-3 DLC/内容文本经 `innerHTML` 进入 UI；Tauri 消费路径跳过内容 schema/ABI/授权校验

- **位置（文件:行号）**
  - `src/aquarium/main.ts:76-98`：`dlc_list` → `dlc_verify` → `contentPackFromData(...)` → `mountPack`。
  - `src/aquarium/main.ts:160`（`nameOf` 直接返回 pack 的 `name/nameKey` 文本）、`:271/:300/:332` 把 `nameOf(...)`/`fish.rarity`/`decor.price` 拼进 **`innerHTML`**。
  - 同类 `innerHTML`：`src/town/main.ts:193/227/244`、`src/stall/main.ts:180-186`、`src/world/main.ts:35-39`（这些页面当前只挂内置内容，但同一模式；一旦未来 DLC 进入即触发）。
  - `src/pack/from-data.ts:13-31`：`contentPackFromData` **不做** `validateContent`/ABI/`minBase`/entitlement 校验，直接注册字段。
  - `src/pack/loader.ts:80`（entitlement 检查）、`87-97`（签名）、`99-117`（路径+哈希+内容解析）只在 Node 工具链/`host/game-host.ts` 使用；Tauri 前端消费路径走的是 Rust `dlc_verify` + `contentPackFromData`，**没有调用 `loadPackFromDir`**。
  - `app/tauri/src-tauri/src/main.rs:289-307`：`dlc_verify` 只返回 Rust 验签结果；`native/dlc-verify/src/lib.rs:39-112` 不做 manifest schema（id slug/版本/`content` 是否在 files/entitlement）校验。
- **实测/探针证据**
  - 探针（`/tmp/famling-probe.mts`，只读 import）：`validateManifest()` **接受** `files[0].path = 'C:/Windows/win.ini'`（它只挡 `..` 与开头 `/`，`src/pack/manifest.ts:48,57`）；Node loader 会在 `resolve()` 后做 containment（`src/pack/loader.ts:101`）挡住 Windows 上越界，但 Rust verifier **没有**等价的绝对路径/UNC/ADS 拒绝（`lib.rs:83` 只挡 `..` 与 `/`）。
  - Rust 验签/哈希本身正确（§8.3 实测篡改拒绝），因此本条**只在「攻击者持有有效签名」时成立**——与 P1-1 是同一信任链。
- **影响**：持有签名私钥者可在 pack 的 `name/nameKey/endings/...` 中植入 HTML/事件处理器；在 aquarium 窗口渲染即 XSS。结合 P1-2，可读取 Advisers brief/DPAPI 存档、消费云 TTS/ASR；也可用 `write_save` 篡改存档。不是远程无认证攻击，但**内容供应链即攻击面**，且当前对「合法但恶意/被盗签名」没有任何内容层防线。
- **修复建议**
  1. 所有拼 HTML 的 sink 改用 `textContent`；必须拼 HTML 时统一用 `src/pet/security/html.ts:66` 的 `escapeHtml`/`escapeAttribute`（该模块已存在且有测试）。
  2. pack 内容在**进入渲染前**做严格类型/长度/字符校验（Rust 与 TS 双端）：`id` slug、name/文本 ≤ N 字符、禁止控制字符/`<>&`（或统一 escape）、数字范围、`contentApi`/`minBase` 精确校验。
  3. Tauri 消费路径补齐 `loadPackFromDir` 中的检查（签名→哈希→schema→ABI→`minBase`→entitlement→parse），或让 Rust 返回 `content` 的同时返回已校验的 manifest，前端统一校验。
  4. 按 P1-2 限制 aquarium 窗口能调用的命令（即使 XSS 也拿不到 brief/DPAPI/voice）。
- **验证方法**
  - 单元测试：构造 `content.fish[0].name = '<img src=x onerror=alert(1)>'` 的 PackContentData，断言 aquarium 渲染使用 `textContent`/escape（DOM 中不存在 `img` 元素）。
  - 静态：`grep -rn 'innerHTML' src/aquarium src/town src/stall src/world`；修复后应无未转义的 pack/外部文本插值。
  - 动态（有签名环境时）：用测试密钥签一个含 HTML 字段的 pack，加载 aquarium，确认 DOM 文本化而非元素注入。

### P1-4 consent/TOS/DLC 门存在多条绕过；门只在 UI 层，不在 IPC/页面路由层

- **位置（文件:行号）**
  1. **随包 dev/实验页直读 character pack、无任何 consent**：`src/pet/tinglan-lab.ts:142` 直接 `loadCharacterV03('/characters/tinglan/')`；`setup.html:144` 提供「行为/语音实验台」链接；`dist/tinglan-lab.html` 随构建发布（§8.7）。
  2. **游戏页挂载 DLC 无 per-load 同意**：`src/aquarium/main.ts:76-98`、`src/demo/main.ts:42-59`（`dlc_verify` 后直接 `mountPack`），而策略文件 `src/pet/consent/content.ts:9-20` 明确写「`?character`/pack load → `loadPackWithConsent`（action `dlc.pack-load`）」「所有 DLC 加载必须过门」。
  3. **`--game=` 路由页面完全没有 TOS/consent**：`main.rs:373-382`（路由表）与 `:476-527`（创建窗口）允许直接打开 `aquarium.html`/`town.html`/`stall.html`；实测 `grep -rn 'consent\|TOS\|gate' src/aquarium/main.ts src/town/main.ts src/stall/main.ts` 无任何 consent 引用（仅 demo 有一处无关 benchmark 注释）。
  4. **`?character=tinglan` 走内置分支、跳过 DLC 门**：`src/pet/main.ts:1944-1958` 用 `isHeroCharacterId()`（`src/pet/hero-runtime.ts:86,172-174`，其 `HERO_CHARACTER_IDS = ['humanoid','cat','dog','tinglan']`）判断是否 DLC；`tinglan` 因此不进 `loadCharacterPackWithConsent()` 分支。但 `src/pet/character/builtin.ts:12,20,39-47` 明确把 `tinglan` 排除在 builtin 之外、要求走 DLC 门 —— **两处分类不一致**。`tinglan-256/` 确有 `character.json/behavior.json`（`public/characters/tinglan-256/`），可被加载。可达性说明：需要 `?hero=1`（hero 默认关）且 URL 带 query；Tauri 安装版窗口 URL 固定为 `pet.html`（无 query），所以该入口主要在浏览器/dev 模式或页面注入/导航后成立——但策略不一致本身仍需修。
  5. **门只在 UI 调用点，不在 IPC**：`voice.rs:121-233` 的 `voice_synthesize`/`voice_asr` 没有任何 consent 校验；`main.ts:655`（TTS）、`:958-975`（ASR）只是 UI 层门。任何能执行 JS 的页面（P1-2/P1-3）可直接 `invoke('voice_asr', {...})` 上传音频/花钱，绕过 ASR/TTS 声明。`read_advisers_brief` 同理（`main.rs:144-166`）。
  6. **同意记录是 localStorage 明文 + TOS hash 公开常量的前端自证**：`src/pet/consent/core.ts:20-21`（key）、`:120`（序列化）；`src/pet/consent/terms.ts:80/580`（TOS_VERSION/TOS_HASH 均在前端包内）；`src/pet/consent/store.ts:111`（localStorage 存储）。用户本人可在 WebView 调试/本地文件层伪造 accepted 记录——对「用户自己」不构成安全边界，但意味着文档/合规口径**不能宣称技术不可绕过**；同时也意味着审计记录不是防篡改证据。
- **影响**：发布合规口径「首启必须同意完整 TOS」「每次 DLC 加载/TTS/ASR 必须单独确认」在多个入口不成立：
  - 直接跑 `--game=aquarium|town|stall` 或打开 `tinglan-lab.html` 的体验者不需要任何 TOS 同意，且 Lab 会加载 character pack；
  - 任一同源页面注入（P1-3）可绕过全部语音/简报门；
  - 用户可伪造/清除本地同意记录（不是远程攻击，但削弱审计证据）。
- **修复建议**
  1. `tinglan-lab.html`/`presence.html` 等 dev/实验页从发布构建排除（Vite `rollupOptions.input` 白名单），或页面加载首先 `bootstrapConsent()` 并拒绝时只读；同时移除 `setup.html:144` 的 Lab 链接（或标注 dev-only）。
  2. `aquarium/demo` 的 DLC 挂载统一走 `loadPackWithConsent()`（或在游戏页启动时先完成首启 TOS），并在 `dlc_verify` 返回后仍做前端 consent 校验；游戏页也纳入 consent 运行时。
  3. `?character=` 分支改用 `isBuiltinCharacterId()`（`src/pet/character/builtin.ts:44`）而不是 `isHeroCharacterId()`；`tinglan` 必须走 DLC 门。
  4. 在 Rust 侧增加 consent 会话状态/一次性 token（见 P1-2 修复 3），让 `voice_*`/`read_advisers_brief`/`write_save` 在非 pet 窗口或无 token 时拒绝。
  5. 明确文档表述：本机同意门是**用户自主控制 + 审计证据**，不是不可绕过的安全边界；若要面向监管，需服务端/系统级签署（或至少 DPAPI 封印 + 完整性校验 + 篡改告警）。
- **验证方法**
  - 静态：上面的 grep（consent 引用、`isBuiltinCharacterId` vs `isHeroCharacterId`、dist 页面清单）。
  - E2E：`--game=aquarium` 启动应出现 TOS 或拒绝使用 DLC；`pet.html?hero=1&character=tinglan` 应弹完整 TOS；在 `aquarium` 页面 console 调 `invoke('voice_asr', {...})` 修复后应被拒。
  - 回归：新增/扩展 `tests/consent-bypass.test.ts`、`tests/dlc-consent.test.ts` 覆盖上述 4 个入口。

---

## 3. P2（纵深防御/低影响/需本地先决条件）

### P2-1 CSP 指令缺口；dev/browser 构建无 CSP；无 WebView 导航守卫

- **位置**：`app/tauri/src-tauri/tauri.conf.json:30`（当前 CSP）；`:8`（`devUrl: http://localhost:5173`）；仓库内**没有任何 HTML 文件带 `<meta http-equiv="Content-Security-Policy">`**（实测 grep 0 命中）；`main.rs` 未设置 `on_navigation`/外部链接拦截（无相关代码）。`src/pet/main.ts:2392,2453` 用 `window.open(...)` 打开 setup/chat-import 且无 `noopener`。
- **现状**：
  `default-src 'self'; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost`
- **缺口**：
  - 缺 `base-uri 'none'`（HTML 注入时可插 `<base>` 改变相对 URL 目标）；缺 `form-action 'none'`（注入的 `<form>` 可把数据 POST 到任意外部地址，`connect-src` 不覆盖表单提交）；缺 `object-src`/`frame-src`/`worker-src`/`manifest-src` 显式收敛（`object-src` 回退到 `default-src 'self'`，仍允许 self 对象）。
  - `style-src 'unsafe-inline'`：CSS 注入面（信息泄露/UI 欺骗），当前应用大量内联 style，属可接受权衡但应记录。
  - 无导航守卫：CSP 不限制顶层导航；`window.open`/`location` 可把 WebView 带到非本地页面（虽然当前发布页面无外部链接，实测 grep 无 `href="http`）。
  - `devUrl` 是 http 本地 URL，仅 dev 构建；但 dev 模式下页面无 CSP 头（静态判断：Tauri 对 devUrl 无注入点），且本机 5173 端口可被本地进程抢占 —— 对开发者是本地风险。
- **影响**：当前没有可用 HTML 注入点（见 P1-3 需要签名内容），所以这是**纵深防御**缺口；一旦未来引入第三方内容/更多 `innerHTML`，缺 `base-uri`/`form-action` 会让 CSP 无法限制外带通道。
- **修复建议**：目标 CSP（按实际资源微调）：
  ```
  default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' asset: http://asset.localhost data:; media-src 'self' data: blob:;
  font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost;
  base-uri 'none'; form-action 'none'; frame-ancestors 'none';
  object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'self'
  ```
  并在所有 HTML 加 `<meta http-equiv="Content-Security-Policy">` 兜底（浏览器独立构建用）；在 `main.rs` 增加 `on_navigation` 白名单（仅 `tauri://localhost`/`http://tauri.localhost`/devUrl）与 `window.open` 统一处理（外链交系统浏览器）。
- **验证方法**：构建后在 WebView2 devtools 看文档响应头是否带 CSP；注入 `<base href="https://example.com/">` 的测试页应被 `base-uri 'none'` 阻断；`window.location='https://example.com'` 应被导航守卫拦截。

### P2-2 Rust IPC 命令缺少输入/输出大小与速率限制（DoS 面）

- **位置（文件:行号）**
  - `main.rs:103-135` `fetch_deepseek_share`：25s 超时（`:112`），但 `response.json()`（`:127-130`）**无响应体大小上限**；前端 `fetch.ts:63-72` 的 size 校验发生在完整反序列化之后。
  - `main.rs:187-214` `write_save`：`text: String` 无长度上限（可写爆磁盘）；`:265-284` `read_save` 整文件读入无上限；`:169-182` `read_pack_manifest` 读整文件无上限。
  - `main.rs:27-32` `set_pet_hit_regions(Vec<[f64;4]>)`：数组长度无上限（任意页面可传超大 Vec 触发内存/CPU）。
  - `main.rs:353-361` `report_bench`：写 `current_dir()/artifacts/tauri-bench.json`（固定文件名，内容类型安全，但 CWD 可被启动方式影响）。
  - `voice.rs:194-233` `voice_asr`：先 `base64::decode`（`:200-202`）**再**检查 8 MiB（`:206-207`），超长 base64 会先分配内存；`:121-184` TTS 有 500 字符上限（`:134-136`）与每日计数（`:150`），但没有速率限制。
  - `native/dlc-verify/src/lib.rs:40-42`：manifest **在验签之前**被整文件读入+JSON parse（无大小上限）；`:90-101` 每个文件整文件读入并哈希，无总量上限。
- **影响**：需要页面级 JS 执行（P1-2/P1-3）或本机调用作为先决条件，不能远程直接触发；但一旦成立就是内存 OOM/磁盘写满/UI 卡死（`set_pet_hit_regions`、同步命令）。签名后 pack 的超大 manifest 也可在本地 DoS。
- **修复建议**：统一在 Rust 侧做上限：manifest ≤ 1 MiB、单个 pack 文件 ≤ 64 MiB、总 pack ≤ 256 MiB、save text ≤ 1 MiB、fetch 响应 ≤ 4 MiB（与前端 `SECURITY_LIMITS.fetchResponseBytes` 一致）、hit regions ≤ 64 项、ASR 先按 base64 长度估算解码后大小再解码；读取用 `take(limit+1)` 流式并拒绝超限；对 `write_save`/`voice_*` 加每窗口令牌桶；`report_bench` 移入 `app_data_dir` 或仅 `bench` 窗口可用。
- **验证方法**：集成测试传超大参数（`text` 10 MiB、regions 10 万个、base64 20 MiB）断言返回明确错误且内存平稳；本地起 mock HTTP 返回超大 JSON 断言被截断拒绝。

### P2-3 DLC 验签器路径/大小/schema 硬化不足（signed-only 风险）

- **位置**：`native/dlc-verify/src/lib.rs:39-112`；调用方 `app/tauri/src-tauri/src/main.rs:289-307`。
  - `lib.rs:83`：文件路径只检查 `rel.contains("..") || rel.starts_with('/')` —— **未拒绝** Windows 盘符路径（`C:\...`）、UNC（`\\srv\share`）、ADS（`a.b:stream`）、保留设备名（`CON`）、尾点/尾空格。Rust `PathBuf::join` 在遇到绝对路径时会**替换**前缀（Windows），所以签名 manifest 若写 `C:\Windows\...` 会读到 pack 目录外（仍需签名+哈希匹配，故先决条件是签名私钥）。
  - `lib.rs:99`：`content` 路径在签名后直接 `dir.join(content_path)` 读取，同样没有路径约束（JS 侧 `manifest.ts:48` 只挡 `..`）。
  - `lib.rs:40-42,65-75`：manifest 在验签前整文件读取/解析；无大小上限。`:78-97` 无 pack 总大小/文件数上限。
  - `main.rs:297-300`：`dir = root.join(pack_id)` 后 `dir.starts_with(root)`，但 root 未 canonicalize（`pack_dir` 由 `--packs-dir`/资源目录提供），也没有对 pack 目录内 symlink 的处理。
  - 项目自己的 `src/pet/security/path-safety.ts:1-14` 注释已经点名这些 Rust 缺口（“lib.rs:78-95 … not a Windows drive path … ADS … content path not checked”）——只是没有回填到 Rust。
- **影响**：需有效签名才能触发读取越界（否则先被 `verify_strict` 拒绝，实测 §8.3）；但这是「内容供应链」的纵深防御缺口，且未来社区 pack 工具/多签名者会放大。
- **修复建议**：在 Rust 实现与 `path-safety.ts` 等价的 `check_relative_path()`（拒绝 `..`、绝对/UNC/盘符、ADS `:`、保留名、尾点/空格、控制字符、超长），对 `dir` 与每个 `file.abs` 做 `canonicalize()` + `starts_with(canonical_root)` + `symlink_metadata().is_file()`；对 manifest/content/files 加大小上限；补 manifest schema 校验（`id` slug ≤64、semver、`contentApi == 1`、`content` 必须列在 `files`、sha256 64hex、`entitlement` 形状）；按 P1-1 的生产密钥策略签名。
- **验证方法**：`cargo test -p dlc-verify` 增加恶意 manifest 用例（上述路径均须拒绝）；`cargo fuzz`/proptest 对 manifest 解析可选。

### P2-4 Advisers Pet Brief：Rust 侧路径/TOCTOU/错误泄露硬化不足；TTL 只在 TS 端

- **位置**
  - `app/tauri/src-tauri/src/main.rs:138-166`：base 优先级 `ADVISERS_HOME`（目录）→ `%USERPROFILE%\.advisers` → `$HOME/.advisers`（`:145-153`）；`metadata` 检查 128 KiB（`:155-162`）；`read_to_string`（`:163`）；错误串含完整绝对路径（`:163-164`）；**无 canonicalize/无 regular-file 检查/无 no-follow**；命令是同步 `fn`（无超时，慢速共享/网络路径可阻塞 IPC）；TTL 不在 Rust 校验。
  - 前端（正向）：`src/presence/pet-brief.ts:72` TTL=5 分钟；`:502-508` 过期报 `EXPIRED`；`:529-537` `isExpired`；`:1038-1042` `requireFresh` 默认 true；`src/pet/advisers/face.ts:223-232` 包装 invoke + timeout；`src/pet/main.ts:2075/1490` 仅在 consent 后初始化、`:2220/2242` 过期内容不渲染、`:2111/2152-2160` 失焦/超时清空、`:2043-2067` 外部文本先过 `reviewModelOutputForDisplay` 再 `textContent` 渲染（无 `innerHTML`）；`face.ts:756` 30 秒自动收起提示。
- **影响**：低（本机文件、严格 schema、不上传、默认关）。剩余风险：(a) 若启动器/快捷方式设置 `ADVISERS_HOME`，可让应用读取任意目录下的 `pet-brief.json`（内容仍按 schema/大小限制，危害有限）；(b) 错误串把用户目录路径回传 WebView（信息泄露/日志）；(c) metadata→read 的 TOCTOU 可在本地把文件换成 >128 KiB 或挂载慢设备（DoS/内存）；(d) 过期判定只在 TS，若未来有页面直接 invoke 并渲染 raw JSON，则 TTL 失效。
- **修复建议**：固定 base（release 不读 `ADVISERS_HOME`，或要求其为 home 下路径）；`canonicalize()` 后 `starts_with(canonical_base)`；`symlink_metadata().is_file()`；`OpenOptions` + `take(128KiB+1)` 单次读取（消除 TOCTOU）；错误改为稳定 code（不返回路径）；把 TTL 校验放进 Rust（返回 `expiresAt` 并要求 `now`）或双端；慢 IO 用 `spawn_blocking`/`async` + 超时。
- **验证方法**：Rust 单测：符号链接/junction、目录、>128 KiB 文件、损坏 JSON、`ADVISERS_HOME` 指向 home 外；断言错误不含绝对路径；前端测试已覆盖 TTL（`tests/advisers-*.test.ts`），补「Rust 返回过期 brief 时前端仍拒绝」。

### P2-5 localStorage/隐私数据：自报生日、导入摘要、同意审计为明文；DPAPI 只保护静态存档

- **位置**
  - 自报出生日期：`src/pet/consent/age.ts:29`（`desktop-games/consent/age-verification-v1`）、`:51-59`（`birthYear/Month/Day` + `verifiedAt`）——**明文 localStorage**；文档自认：`public/legal/PRIVACY.md:4,129`。
  - 导入的 DeepSeek 分享摘要：`src/pet/chat-import/store.ts:21`（key）、`:50-80`（校验）、`:86-91`（写入）——含 `title/topics/preferences/commitments`，可能含第三方个人信息；文档自认 `public/legal/PRIVACY.md:40,60,114,157`。
  - 同意/审计：`src/pet/consent/core.ts:20-21`；`public/legal/PRIVACY.md:42,61`。
  - 存档/记忆：Tauri 端 DPAPI 整档加密（`src/pet/main.ts:1008-1035`；`src-tauri/src/secret.rs:22-84`）；浏览器回退 AES-GCM + 不可导出 IndexedDB key（`src/pet/crypto.ts:1-9,45-92`）——**正向**。但 DPAPI 只防「静态文件被换个账户读」，同用户进程/页面可解；且 `unprotect_text` 本身是暴露的命令（P1-2）。
  - 删除/核验控制：`src/pet/consent/data-controls.ts:107,153,226,267` 覆盖年龄/导入摘要/同意审计等键并逐项核验；`:335` 如实列出 `voice/quota.json` 无法清除的残留——**正向**。
- **影响**：隐私数据以明文落在 WebView localStorage；所有同源页面（P1-2）或任何 XSS（P1-3）都可读；共享电脑/备份/取证工具可直接读。属于「本地优先 + 用户可控」设计的可接受权衡，但**与 SECURITY-AND-PRIVACY 的“加密”表述不完全一致**，且导入摘要可能含他人个人信息（PIPL 风险）。
- **修复建议**：把年龄记录、导入摘要、同意/审计记录改为 DPAPI/AES-GCM 加密封装（与存档同策略），密钥由 Rust/IndexedDB 托管；或在 Rust 侧存储并通过带窗口校验的命令访问；文档明确「明文/加密」清单；为导入摘要增加一键删除入口（data-controls 已有删除，但 UI 入口可再显式化）。
- **验证方法**：构建后在 WebView devtools 执行 `Object.keys(localStorage)` 与值 dump，断言生日/摘要不出现明文；数据控制 E2E 删除后复核 localStorage 键与 Rust 侧残留。

### P2-6 云端 TTS/ASR：key 仅 env（正向）但 `setx` 落注册表、与文档“系统凭据库”不符；配额是本地可改计数

- **位置**
  - key 读取：`app/tauri/src-tauri/src/voice.rs:111,126,196`（仅 `std::env::var("DEEPSEEK_API_KEY")`，不返回前端、不写日志；错误映射为 `no-key/network/http-N` 等 code）——**正向**；`src/` 无 key 读取（实测 grep）。
  - 用户指引：`setup.html:26` 让用户 `setx DEEPSEEK_API_KEY "..."`（持久写入 HKCU 环境变量，同用户进程可读）；`setup.html:134` 声明不上传 key——但 `public/legal/SECURITY-AND-PRIVACY.md:28,44` 写「只存 Rust 侧/**系统凭据库**」，实现并非凭据库，**文档-实现不一致**。
  - 配额：`voice.rs:21`（每日 2000 计费单位）、`:84-107`（`quota.json` 在 app_data，明文可改）、`:150`；ASR（`:194-233`）**无任何配额**；TTS 文本 ≤500 字符（`:134-136`）、ASR ≤8 MiB（`:202-207`）；端点硬编码 `https://api.deepseek.com/v1/tools/tts|asr`（`:158/219`，rustls TLS）。
  - 命令暴露：见 P1-2（任何页面可调）。
- **影响**：`setx` 把 key 持久化到注册表/环境，任何同用户进程可读取（恶意软件/共享账号）；本地 quota 只能防误用不能防滥用；命令无窗口 ACL 时 XSS 可消耗额度、上传任意音频。
- **修复建议**：改用 Windows Credential Manager（或 DPAPI 封装文件）存储 key，UI 内配置；文档删除「系统凭据库」或改成实际做法；env 只作 CI/开发 fallback；加 ASR 日配额与双端速率限制；命令绑定 `pet`/`main` 窗口（P1-2）；明确 TTS/ASR 数据发送与保留说明（当前 legal 文档已有部分披露，建议在启用弹窗中显示 provider）。
- **验证方法**：`grep -rn 'DEEPSEEK_API_KEY' src` 应为空；`reg query HKCU\Environment /v DEEPSEEK_API_KEY` 在 `setx` 后可见（证明暴露）；修复后用 Credential Manager 验证 env/registry 不再含 key。

### P2-7 更新/分发/签名：无 updater（无更新攻击面，也无补丁通道）；安装包/EXE 未签名；updater key 与密码明文同目录

- **位置/证据**
  - 无 updater：`app/tauri/src-tauri/Cargo.toml:9-18`（无 `tauri-plugin-updater`）；`tauri.conf.json` 无 `plugins.updater`；`docs/UPDATER-KEYS-2026-11-15.md:3,21` 自认「已生成，私钥不在仓库；updater 尚未接入」。
  - **实测未签名**（2026-11-19，`Get-AuthenticodeSignature`）：`app/tauri/src-tauri/target/release/desktop-games-tauri.exe` → **NotSigned**；`.../bundle/nsis/DesktopGames_0.1.0_x64-setup.exe` → **NotSigned**。`scripts/release-win.mjs:15`「Never signs anything」；`.github/workflows/release.yml:3,95` 明确 unsigned。
  - updater 密钥物料：`D:\backups\keys\desktop-games-updater.key`、`.key.pub`、`.password` 三个文件同目录（仅文件名/大小核对，未读取内容），WSL 视图权限 777；属宿主机保管问题（不在仓库），但未来接入 updater 时就是更新链私钥。
  - 便携包/安装包的完整性：`scripts/release-win.mjs` 提供 `--sha256`/`--verify`（自生成 SHA256SUMS，未签名）；未发现 cosign/minisign/Sigstore 签名。
  - 正向：便携包只含 14 项，无 `.keys/`、无 `.map`、无 WAV、无审计文档（§8.6）。
- **影响**：无自动更新 = 无「更新被劫持」风险，但也**没有安全补丁通道**；未签名 EXE/安装包使用户无法验证发布者（SmartScreen/MOTW 警告会训练用户忽略警告）；未来接 updater 时若沿用现有 key 保管方式（私钥+密码同目录、权限 777、未离线），更新链可被接管。
- **修复建议**：发布前对 installer/exe 做 Authenticode（EV/OV 证书或 Azure Trusted Signing）；发布 `SHA256SUMS` 的 minisign/cosign 签名；接入 updater 前完成：HTTPS endpoint（不可降级）、minisign 公钥内置、抗回滚（版本单调/允许最小版本）、私钥离线保管（密码分开），并写进 `docs/UPDATER-KEYS`。
- **验证方法**：`powershell -c "Get-AuthenticodeSignature ..."` 应返回 Valid；`signtool verify /pa`；未来 updater 用错误签名包测试必须拒绝、用旧版本包测试回滚应拒绝。

### P2-8 依赖与 CI 供应链

- **npm**：`package-lock.json` 锁 112 个包；OSV `querybatch`（2026-11-19 00:0x）返回 **0** 条已知漏洞。但 **112/112** 个 `resolved` 指向 `registry.npmmirror.com`（第三方镜像）；`npm audit` 在该镜像返回 404（实测：`/-/npm/v1/security/advisories/bulk [NOT_IMPLEMENTED]`），即**没有可用的漏洞审计通道**。锁文件带 sha512 integrity，可检测镜像篡改，但可用性/覆盖依赖镜像。
- **Rust**：两份 lockfile 共 469 个 package-version 查询 → OSV 返回 4 组告警：`chrono 0.4.45`（RUSTSEC-2026-0543，unmaintained；经 `serde_with` 传递）、`glib 0.18.5`（RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g，unsound iterator）、`proc-macro-error 1.0.4`（RUSTSEC-2024-0370，unmaintained；经 gtk3-macros/glib-macros）。后三者属 Linux/GTK 目标依赖（Windows 构建通常不编译；静态判断，建议 `cargo tree --target x86_64-pc-windows-msvc` 复核）；`chrono` 仅是 unmaintained，无已知利用。
- **CI**：`.github/workflows/{ci,release}.yml` 使用 `actions/checkout@v4`、`actions/setup-node@v4`、`dtolnay/rust-toolchain@stable`、`Swatinem/rust-cache@v2` —— **可变 tag/分支**（`@stable` 是分支），未按 commit SHA 固定；`permissions: contents: read`（正向，无 secrets）；无 `cargo-deny`/`cargo-audit`/`npm audit`/OSV-Scanner/SBOM/provenance 门禁；`npm ci` 从镜像拉取。
- **Python**：无 `requirements.txt`/`pyproject.toml` 锁；art 脚本 import `PIL`（系统 13.0.0）；这些脚本是开发工具，**不随 Tauri 安装包/便携包分发**（`tauri.conf.json:38-48` 只打包 packs/legal；便携包 14 项），故为 P3 供应链/可复现性问题。
- **Electron**：`electron ^45.3.0` 是 devDependency（不随 Tauri 产物发布）；dev host 已开 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`（`app/electron/main.ts:64-72`）——**正向**。
- **修复建议**：CI 用 SHA 固定 actions；加 OSV-Scanner（npm+cargo+Python）、`cargo deny check advisories`（按 target 过滤）、`npm ci && npm audit --registry=https://registry.npmjs.org` 或用 OSV 替代；生成 SBOM（Syft/cyclonedx）并对发布产物做 provenance；把镜像源写进 `.npmrc` 并在文档说明；给 Python 工具加锁或容器化。
- **验证方法**：见 §8.4 命令；修复后 CI 应出现 dependency-review/advisory job，且 `release.yml` 的 actions 全为 40 位 SHA。

### P2-9 随构建发布 dev/实验页面，扩大攻击面

- **位置/证据**：`dist/` 实测含 `aquarium.html、chat-import.html、index.html、pet.html、presence.html、setup.html、stall.html、tinglan-lab.html、town.html、world.html`；其中 `tinglan-lab.html` 是「行为/实验台」（`src/pet/tinglan-lab.ts:142` 直读 character pack，无同意门，见 P1-4），`presence.html`/`world.html`/`index.html` 是演示/测试页；`setup.html:144` 直接链接 lab。
- **影响**：这些页面都在同一 origin、同样能调用全部命令（P1-2）；实验页的调试控件/直读逻辑扩大了被诱导/被 XSS 利用的面；对最终用户是困惑/合规风险。
- **修复建议**：Vite 构建输入白名单只保留产品页（pet/setup/chat-import + 游戏页），dev 页只在 `vite dev` 可用；在 CI 增加「dist 文件清单必须等于 allowlist」检查；若必须发布 lab，先过 consent 并显示醒目标识。
- **验证方法**：`npm run build && ls dist/*.html` 对比 allowlist；`tinglan-lab.html` 不在发布产物中。

### P2-10 麦克风权限钩子按窗口 label 放行，与安装版默认窗口不匹配（配置一致性；运行时行为未实测）

- **位置**：`app/tauri/src-tauri/src/main.rs:444-451`：仅当 `webview.label() == "pet"` 且 `PermissionKind::Microphone` 时 `Allow`，否则 `Default`。`tauri.conf.json:15` 显式设置默认窗口 `"label": "main"`；capability `windows` 同时列了 `main`/`pet`（`capabilities/default.json:5-11`）。便携 runner 传 `--game=pet`（`scripts/release-win.mjs:232`）→ 运行时创建 label `pet` 的窗口；NSIS 安装后无参数启动 → 窗口 label 是 `main`。
- **影响**：安装版首次按住说话可能走到 `Default`（平台默认）而非 `Allow`，导致 ASR 不可用或行为与便携/QA 不一致；这不是漏洞，但会让「麦克风只在 pet 窗口可用」的控制在安装版失效或误伤，且 QA 覆盖不到。
- **修复建议**：按 URL/页面判断（`/pet.html`）而非 label；或把默认窗口 label 设为 `pet` 并同步 capability/测试；NSIS 安装版做一次 PTT 冒烟。
- **验证方法**：安装 NSIS 后按住说话 → 观察 `getUserMedia` 结果与麦克风指示灯；Tauri `PermissionRequested` 日志；对比 `--game=pet`。

### P2-11 Windows 特有风险

| 风险 | 位置/证据 | 影响 | 建议 |
|---|---|---|---|
| Windows 保留设备名可用于 save slot / pack id | `main.rs:75-82` `safe_slug` 未排除 `CON/PRN/AUX/NUL/COM1-9/LPT1-9`；`write_save` 路径 `{slot}.json`（`:187-214`） | 传入 `CON`/`NUL` 等会产生设备路径语义（写入被吞/失败/异常），可造成功能异常；需页面注入或本地调用 | 拒绝保留名（对齐 `src/pet/security/path-safety.ts:64-87`），并补单测 |
| Rust 验签器允许 Windows 盘符/UNC/ADS 路径 | `native/dlc-verify/src/lib.rs:83,90,99` | 有效签名者可越界读（P2-3） | 见 P2-3 |
| 安装包/EXE 未签名 | 实测 NotSigned（P2-7） | SmartScreen/MOTW、无法验发布者 | 见 P2-7 |
| DPAPI 同用户可解 | `secret.rs:22-84`（无 entropy、CurrentUser scope） | 静态存档保护只在「换账户/离线文件」场景有效；同用户恶意进程可解 | 文档写明 at-rest 边界；敏感字段加 entropy/额外口令可选 |
| 若 NSIS 为用户级安装，`packs/` 与信任根在用户可写目录 | `tauri.conf.json` 未配置 `installMode`（用 Tauri 默认，需打包实测确认安装路径/ACL） | 同用户进程可替换 packs 与 `packs/keys/dev-public.pem`，使 P1-1 的覆盖更易 | 见 P1-1：release 内置公钥；安装目录 ACL 收紧/或按机器级安装 |
| `--reset-saves` 无二次确认直接删全部存档 | `main.rs:461-469` | 快捷方式/脚本/误操作可清空用户存档（数据丢失） | 保留但要求 `--confirm-reset` 或仅 QA 构建；发布 runner 不带该参数 |
| `%USERPROFILE%\.advisers` 可能在 OneDrive 同步目录 | `main.rs:145-153` | brief 文件可能被云同步（本应用只读，但数据外流面） | 文档提示；或优先 `%LOCALAPPDATA%` |
| 路径 >260 字符 | `canonicalize`/`read_to_string` 会失败 | 失败即报错（fail-closed，可接受） | 如需支持长路径，用 `\\?\` 前缀 |
| `MOVEFILE_REPLACE_EXISTING|WRITE_THROUGH` 存档替换 | `main.rs:216-237` | 正向：崩溃安全较好；无目录 fsync（NTFS 日志可接受） | 保持 |

---

## 4. 已核实无问题（正向控制，供 lead 对外答复用）

1. **无远程代码执行面**：Tauri 产物只加载本地页面（`tauri.conf.json:17` url=pet.html；CSP `script-src 'self'`）；无 updater；无 fs/shell/http/process 插件（`Cargo.toml:9-18` 只依赖 tauri/serde/serde_json/reqwest/base64/windows-sys + 本地 `dlc-verify`）；`withGlobalTauri: false`（`tauri.conf.json:32`）。
2. **最小能力集**：capability 只有 `core:default` + 15 个窗口相关 allow（`capabilities/default.json:12-29`），没有 fs/shell/http 权限。
3. **命令路径限制（已实现部分）**：save slot / pack id 用 `safe_slug`（`main.rs:75-82`）；`read_pack_manifest` 做 `canonicalize()` + `starts_with(packs_root)`（`main.rs:169-182`）；`write_save` 用 tmp + `sync_all` + `MoveFileExW(REPLACE_EXISTING|WRITE_THROUGH)`（`main.rs:187-237`）；`read_save/delete_save` 复用 `safe_slug`（`main.rs:245-284`）。
4. **DLC 签名/哈希验证真实有效**：Rust **先验签**（`native/dlc-verify/src/lib.rs:64-75`）再逐文件 SHA-256（`:78-97`）再解析 content（`:99-101`）；实测有效 pack 通过、篡改 content → `hash mismatch`、篡改 manifest → `signature is invalid`（§8.3）。TS/Node 加载器同一策略（`src/pack/loader.ts:87-117`）。
5. **仓库无明文凭据**：`git ls-files '*.pem'` 仅 `packs/keys/dev-public.pem`（公钥）；`git log --all -- .keys/dev-private.pem` 为空（从未入库）；`.gitignore:6,29` 覆盖 `.keys/` 与 `*.pem`；`git grep` 敏感模式只命中测试 fixture（`tests/safety-local.test.ts`，非真实凭据）。
6. **API key 不进前端/包/日志**：`grep -rn 'DEEPSEEK_API_KEY' src` 仅 1 条注释（`src/pet/main.ts:422`），无读取/存储；Rust 只从 env 读（`voice.rs:111,126,196`），失败映射为固定 code（`:169-171,225-227`），不返回 key；文档声明不上传 key（`setup.html:134`）。
7. **TTS 独立门禁**：`gate.ts:639 ensureTts` 按 (session, config signature) 内存态确认（`consent/tts.ts:23-28`），不写持久记录；播放前必须确认（`main.ts:655`），拒绝仅字幕/mouth 动画（`main.ts:660-663`）；静音/音量/音色变化改变签名 → 重新确认（`main.ts:529-531`）。
8. **ASR 独立门禁 + 麦克风顺序**：`gate.ts:699 ensureAsr`；`main.ts:958-975 beginTalkWithAsrConsent` 顺序为「确认 ASR 声明 → 才 `talkRecorder.start()` → 才 `getUserMedia`（`main.ts:886`）」；拒绝/异常不录音不上传；setup 页自有录音同样「拒绝路径不调 getUserMedia」（`setup-page.ts:362`）。
9. **Advisers brief 前端硬化**：Rust 128 KiB 上限（`main.rs:160`）+ JSON 解析（`:164`）；TS 侧 schema fail-closed/future schema 拒绝/`expiresAt` 必须晚于 `generatedAt`/过期拒绝（`pet-brief.ts:448-537`，TTL 5 分钟 `:72`）；过期内容不再渲染（`main.ts:2242`）；仅在首启同意后初始化（`main.ts:1490,2075`）；外部文本先过安全层再 `textContent`（`main.ts:2043-2067`）；30 秒/失焦/隐藏自动清空面板（`face.ts:756`、`main.ts:2111-2160`）；brief 不喂给 projector/TTS/LLM（`pet-brief.ts:27` 注释与代码）。
10. **DeepSeek 分享导入硬化**：固定 host + shareId 白名单（`chat-import/deepseek-share.ts:40-56`）；消息数/单条/总文本/标题上限 + 控制字符清洗（`:97-157`）；Tauri 走 Rust 固定 URL + 25s 超时（`main.rs:103-135`），浏览器回退走带超时/大小上限的 fetch（`chat-import/fetch.ts:102-134`）；展示全部 `textContent`（`chat-import.ts:188-430`）；digest 字段级校验 + 32 KiB 上限（`chat-import/store.ts:50-91`；`security/limits.ts:93`）。
11. **存档静态加密 + 反序列化硬化**：Tauri 用 DPAPI 整档加密（`main.ts:1008-1035`；`secret.rs:22-84`），浏览器回退 AES-GCM + 不可导出 IndexedDB key（`crypto.ts:1-9,45-92`），加密不可用拒写；`deserializePet` 逐字段类型/长度/枚举校验、不 spread 不可信 JSON（`src/kernel/pet.ts:311-356`），明文上限 512 KiB（`limits.ts:88`）。
12. **数据控制可用（含如实残留）**：撤回同意/删除全部本地数据/查看审计均实现二次确认与逐项核验（`data-controls.ts:107,153,226,267`），并如实列出 `voice/quota.json` 等 Rust 侧无法清除的残留（`:335`）；删除覆盖年龄/导入摘要/同意审计等 key。
13. **无默认遥测；Electron dev host 加固**：Sentry 仅 aquarium demo 且 opt-in（`aquarium/main.ts:25,40`），无 DSN 不联网、`sendDefaultPii:false`、`tracesSampleRate:0`、`beforeSend` 去 user/cookies（`observability.ts:68-88`）；Electron dev host `contextIsolation:true/nodeIntegration:false/sandbox:true`（`app/electron/main.ts:64-72`，且不随 Tauri 发布）。

---

## 5. 任务要求的 12 个专项逐项结论

| # | 专项 | 结论 | 主要依据/条目 |
|---|---|---|---|
| 1 | Tauri v2 capabilities / 命令参数校验 / 路径限制 | **部分正向，结构性缺口**：capability 只有 core；应用命令无 ACL，任意窗口可调全部命令；参数/路径有局部校验但 Rust DLC 验签器路径规则不足 | P1-2、P2-2、P2-3；§4.2/4.3 |
| 2 | CSP 与 WebView 导航 | **缺口**：CSP 缺 `base-uri`/`form-action`/`object-src` 等；HTML 无 meta CSP（0/HTML）；无导航守卫；devUrl 为 http（dev-only） | P2-1 |
| 3 | XSS / HTML 注入 | **1 条现实链（需签名内容）**：20 处 `innerHTML`（`grep` 计数），DLC 文本可进入；chat-import/Advisers 已全部 `textContent`（正向） | P1-3；§4.9/4.10 |
| 4 | DLC 导入与 pack 校验 | **验签/哈希真实有效**（实测），但信任根是 dev key、无生产密钥/轮换；Tauri 消费路径跳过 schema/ABI/entitlement；验签器路径/大小硬化不足；`import-character.mjs` CLI 自带 consent+路径+大小校验（作者侧，正向） | P1-1、P1-3、P2-3；§8.3 |
| 5 | Advisers brief 文件读取 / TTL / 权限 | **前端硬化良好**（TTL/隐私 guard/textContent/同意后初始化）；Rust 侧无 canonicalize/regular-file/TOCTOU/路径错误脱敏，TTL 不在 Rust | P2-4；§4.9 |
| 6 | consent/TOS 门不可绕过 | **有多条绕过**：随包 lab 页、`--game=` 游戏页、aquarium/demo 的 DLC 直载、`?character=tinglan`、IPC 级 voice 直调；本地门本身可被用户伪造（不是不可绕过的安全边界） | P1-4、P1-2 |
| 7 | TTS/ASR/云端密钥 | **key 不进前端（正向）**；但 `setx` 落 HKCU（与“凭据库”文档不符）、命令无 ACL 可被页面调用、ASR 无配额、quota 本地可改 | P2-6、P1-2；§4.6-4.8 |
| 8 | localStorage / 隐私数据 | **明文**：自报生日、导入摘要、同意/审计；存档/记忆已加密（正向）；同源页面可互读（P1-2 放大） | P2-5、P1-2；§4.11/4.12 |
| 9 | 更新 / 下载 / 签名 | **无 updater**（无更新攻击面，也无补丁通道）；EXE/安装包实测 **NotSigned**；updater key+password 明文同目录（host）；pack 签名信任根问题同 #4 | P2-7、P1-1 |
| 10 | 依赖审计（npm/pip/Rust crates） | npm 112 包 0 已知漏洞但全走 npmmirror 且 audit 不可用；Rust 469 查询 4 条告警（3 条 Linux/GTK-only，1 条 unmaintained）；actions 未 SHA pin；Python 无锁且不随包 | P2-8；§6 |
| 11 | Windows 特有风险 | 保留设备名 slot、Rust 盘符/UNC/ADS 路径、未签名、DPAPI 同用户边界、可能的用户可写安装目录、`--reset-saves` 无确认、OneDrive 同步 profile | P2-11 |
| 12 | P0/P1/P2 分级与修复 | P0：无；P1×4、P2×11（含 Windows） | §0–§3、§10 |

---

## 6. 依赖审计明细

### 6.1 npm

- 锁文件：`package-lock.json`（lockfileVersion 3，112 个依赖包 + 根包）；`package.json:47-55` 直接依赖：`@sentry/browser ^9.47.2`、`@tauri-apps/api ^2.12.4`、`cordis 4.0.0-rc.12`、`pixi.js ^8.22.0`；dev：`electron ^45.3.0`、`vite ^8.3.8`、`typescript ^5.9.3`、`tsx ^4.23.15`、`ajv ^8.20.0`、`fake-indexeddb ^6.2.8`。
- OSV 查询（package+version，2026-11-19 00:0x）：**0 条已知漏洞命中**。
- 镜像依赖：全部 112 个 `resolved` URL 指向 `registry.npmmirror.com`；`npm audit` 实测返回 404（`/-/npm/v1/security/advisories/bulk [NOT_IMPLEMENTED]`）→ **当前无可用 npm 漏洞审计通道**（详见 P2-8）。
- 镜像源的缓解：lockfile 带 `sha512` integrity，可检测包体篡改；风险主要在可用性/审计覆盖。

### 6.2 Rust / Cargo

- 两份 lockfile：`app/tauri/src-tauri/Cargo.lock`（471 个 `[[package]]`，含 2 个工作区成员 `desktop-games-tauri`/`dlc-verify`）、`native/dlc-verify/Cargo.lock`（43 个，其 name+version 是 app lock 的子集，union=471）；排除 2 个工作区成员后 OSV 查询 **469** 个 package-version。
- 关键版本：`tauri 2.12.5`、`tauri-runtime-wry 2.12.3`、`reqwest 0.12.28`（rustls-tls，无 native-tls/openssl）、`ed25519-dalek 2.x`（pkcs8,pem）、`sha2 0.10`、`base64 0.22`、`serde/serde_json 1`、`windows-sys 0.61`。
- OSV 命中 4 组（均为传递依赖，未直接使用）：

| crate | version | advisory | 说明 |
|---|---|---|---|
| chrono | 0.4.45 | RUSTSEC-2026-0543 | unmaintained（经 serde_with 传递）；无已知利用 |
| glib | 0.18.5 | RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g | unsound iterator impl；GTK/ATK 系（Linux 目标） |
| proc-macro-error | 1.0.4 | RUSTSEC-2024-0370 | unmaintained；经 glib-macros/gtk3-macros（Linux 构建） |

- 影响判断：Windows Tauri 构建不编译 GTK 系依赖（Tauri 对 Linux 目标条件依赖；Cargo.lock 不表达 target 条件，**建议用 `cargo tree --target x86_64-pc-windows-msvc` 复核**）；`chrono` 只是 unmaintained，无已知 CVE。整体为 **P2/P3**，不阻塞发布但应纳入 CI 门禁。

### 6.3 Python / 其他

- 无 `requirements.txt`/`pyproject.toml`/锁；art 脚本 import PIL（系统 `Pillow 13.0.0`）；这些脚本是作者/美术工具，**不随 Tauri 安装包或便携包分发**（§8.6/8.7），故为可复现性/供应链 P3。
- Electron 是 devDependency，不随 Tauri 产物发布；dev host 配置已加固（§4.13）。
- `windows-sys 0.61` 直接依赖用于 DPAPI/文件替换/全屏检测（`Cargo.toml:24-25`），无第三方二进制。

---

## 7. Windows 特有风险清单（交叉引用）

| 风险 | 等级 | 位置 | 详见 |
|---|---|---|---|
| 安装包/EXE 无 Authenticode 签名（实测 NotSigned） | P2 | `target/release/*.exe`、`bundle/nsis/*-setup.exe`；`release.yml:3` | P2-7 |
| pack 签名信任根是 dev 公钥，且可被 `--dlc-key`/`P0_PACKS_DIR` 覆盖 | P1 | `main.rs:562-581` | P1-1 |
| Rust DLC 验签器不拒绝 Windows 盘符/UNC/ADS/保留名路径 | P2 | `native/dlc-verify/src/lib.rs:83,90,99` | P2-3 |
| `safe_slug` 允许 Windows 保留设备名（CON/NUL/COM1…）用于 save slot/pack id | P2 | `main.rs:75-82,187-214` | P2-11 |
| DPAPI 为 CurrentUser、无 entropy：同用户进程可解密；`unprotect_text` 命令暴露 | Info/P2 | `secret.rs:22-84`；`main.rs:591-611` | P1-2、P2-11 |
| 若 NSIS 为用户级安装，`packs/` 与信任根位于用户可写目录（需打包实测） | P2 | `tauri.conf.json` 未设 `installMode` | P1-1、P2-11 |
| `--reset-saves` 无确认删除全部存档 | P2 | `main.rs:461-469` | P2-11 |
| `%USERPROFILE%\.advisers` 可能位于 OneDrive 同步目录 | Info | `main.rs:145-153` | P2-11 |
| 无代码完整性/CFG 相关加固配置（使用 Rust/WebView2 默认） | Info | — | P2-11 |

---

## 8. 可复现证据与命令（实测记录）

> 环境：WSL2 Ubuntu on Windows，工作目录 `/mnt/d/Projects/dsh/desktop-games`；`node v24.22.1`、`npm 11.19.1`；`python3`；Rust 工具链可用（`native/dlc-verify/target/release/dlc-verify` 已存在）；`powershell.exe` 可调用（Authenticode 实测）。时间：2026-11-19 00:00–00:30（UTC+8）。

### 8.1 代码基线

```bash
$ git rev-parse HEAD
a3ac3c35936ab6bc327304b21ed0b207064b87f1
$ git status --porcelain
 M docs/art/prompt-library/PIXEL-PIPELINE-2026-11-16.md
 M docs/integration/ADVISERS-CONTRACT.md
 M docs/integration/DSH-FAMLING-BRIDGE-2026-11-17.md
 M docs/research/COMPETITORS-CHINA-DSH.md
 M public/characters/pet-cat/regions.json
 M public/characters/pet-dog/regions.json
 M public/characters/pet-tinglan-anim/regions.json
 M src/pet/main.ts
 M src/presence/pet-brief.ts
?? docs/art/CALIBRATION-SET-2026-11-16.md
```

说明：上面是审计**开始时**的 dirty 集合；审计期间并行 agent 继续改动（截至报告写入时 `git diff --stat` 已扩至 16 个文件），因此本节只作为时间点快照。**本文 `文件:行号` 全部按 HEAD a3ac3c3**，核对方法见附录 A；工作树差异非本次审计所为。

### 8.2 配置/静态检查（只读命令）

```bash
$ grep -n '"csp"' app/tauri/src-tauri/tauri.conf.json
30: "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost"
$ cat app/tauri/src-tauri/build.rs
fn main() {
    tauri_build::build()
}
$ grep -n '"label"' app/tauri/src-tauri/tauri.conf.json
15:        "label": "main",
$ grep -n 'on_navigation' app/tauri/src-tauri/src/main.rs        # 无输出（无导航守卫）
$ grep -rn 'innerHTML' src --include='*.ts' | wc -l
20
$ grep -rln 'Content-Security-Policy' --include='*.html' . --exclude-dir=node_modules --exclude-dir=target | wc -l
0
$ grep -rn 'DEEPSEEK_API_KEY' src
src/pet/main.ts:422:// If Rust has DEEPSEEK_API_KEY, prefer proxied TTS; otherwise stay on system/mock.   # 仅注释，无读取/存储
$ git ls-files '*.pem'
packs/keys/dev-public.pem
$ python3 -c "import json;print(list(json.load(open('app/tauri/src-tauri/gen/schemas/acl-manifests.json')).keys()))"
['core', 'core:app', 'core:event', 'core:image', 'core:menu', 'core:path', 'core:resources', 'core:tray', 'core:webview', 'core:window']   # 应用命令不在 ACL 内
$ cat app/tauri/src-tauri/capabilities/default.json    # windows: main/aquarium/town/stall/pet; permissions: 只有 core:*
```

有意未向仓库写入任何探针；静态探针脚本只落在 `/tmp/famling-*.py|mts`。

### 8.3 DLC 签名/哈希实测（不修改仓库；复制到 `/tmp` 后篡改）

```bash
$ native/dlc-verify/target/release/dlc-verify packs/farm-seasons packs/keys/dev-public.pem
{ "buildings": 1, "contentApi": 1, "crops": 1, "filesVerified": 1, "fish": 1, "id": "farm-seasons", "items": 3, "ok": true, "version": "1.0.0" }

$ tmp=$(mktemp -d); cp -a packs/farm-seasons "$tmp/bad-content"; printf ' ' >> "$tmp/bad-content/content.json"
$ native/dlc-verify/target/release/dlc-verify "$tmp/bad-content" packs/keys/dev-public.pem; echo exit=$?
{"error":"hash mismatch for content.json","ok":false}
exit=1

$ cp -a packs/farm-seasons "$tmp/bad-manifest"; sed -i 's/"version": "1.0.0"/"version": "9.9.9"/' "$tmp/bad-manifest/manifest.json"
$ native/dlc-verify/target/release/dlc-verify "$tmp/bad-manifest" packs/keys/dev-public.pem; echo exit=$?
{"error":"manifest signature is invalid","ok":false}
exit=1

$ node --import tsx scripts/verify-pack.ts packs/farm-seasons
{ "ok": true, "id": "farm-seasons", "version": "1.0.0", "contentApi": 1, "minBase": "0.1.0", "entitlement": { "kind": "local", "id": "farm-seasons" }, "files": 1, "items": 3, ... }
```

结论：**验签/哈希链本身工作正常**（P1-1 的问题是信任根，不是验签算法；P2-3 的问题是签名之后/签名者的输入没有路径硬化）。

### 8.4 依赖漏洞查询（OSV API，网络只读）

```text
方法：从 package-lock.json 与两份 Cargo.lock 提取 (name, version)，
POST https://api.osv.dev/v1/querybatch（ecosystem=npm / crates.io）。
结果（2026-11-19 00:0x，OSV DB 快照随时间变化，发布前请复跑）：
  npm：112 queries → 0 vulnerable pairs
  cargo：469 queries → 4 vulnerable pairs：
    chrono 0.4.45            RUSTSEC-2026-0543 (unmaintained)
    glib 0.18.5              GHSA-wrw7-89jp-8q8g / RUSTSEC-2024-0429 (unsound iterator)
    proc-macro-error 1.0.4   RUSTSEC-2024-0370 (unmaintained)
```

```bash
$ npm audit --json
npm warn audit 404 Not Found - POST https://registry.npmmirror.com/-/npm/v1/security/advisories/bulk - [NOT_IMPLEMENTED]
npm error audit endpoint returned an error
# => 当前 npm 镜像不提供 audit；CI 需换 registry 或用 OSV-Scanner
```

### 8.5 密钥与历史核对（未读取/未回显私钥内容）

```bash
$ openssl pkey -in .keys/dev-private.pem -pubout 2>/dev/null | sha256sum
$ openssl pkey -pubin -in packs/keys/dev-public.pem -pubout 2>/dev/null | sha256sum
# 两条输出相同 => 分发公钥与本地 dev 私钥是同一密钥对（仅比较 fingerprint，未打印私钥/未输出 PEM 内容）
$ git log --all --oneline -- .keys/dev-private.pem
# 空 => 从未进入 git 历史
$ git check-ignore -v .keys/dev-private.pem
.gitignore:6:.keys/	.keys/dev-private.pem
$ ls -la .keys/dev-private.pem
-rwxrwxrwx ... 119 .keys/dev-private.pem     # WSL/DrvFs 视图 777；Windows ACL 未实测（建议 icacls）
$ tar -tzf /mnt/d/backups/2026-11-15/desktop-games-worktree-2026-11-15-sanitized.tar.gz | grep -cE '(^|/)\.keys/'
0          # 当前备份 tar 已脱敏，不含 .keys/
$ ls /mnt/d/backups/keys
desktop-games-updater.key  desktop-games-updater.key.pub  desktop-games-updater.password   # 仅列名；未读取内容；WSL 视图 777
```

### 8.6 发布物/签名核对

```powershell
PS> Get-ChildItem 'D:\Projects\dsh\desktop-games\app\tauri\src-tauri\target\release\*.exe' | % { $_.Name + ' ' + (Get-AuthenticodeSignature $_.FullName).Status }
desktop-games-tauri.exe NotSigned
PS> Get-ChildItem '...\bundle\nsis\*.exe' | % { $_.Name + ' ' + (Get-AuthenticodeSignature $_.FullName).Status }
DesktopGames_0.1.0_x64-setup.exe NotSigned
```

```text
$ python3 -m zipfile 清单 artifacts/DesktopGames-0.1.0-portable.zip（14 项）:
  packs/farm-seasons/{content.json,manifest.base.json,manifest.json,signature.txt}
  packs/keys/dev-public.pem
  packs/reef-pack/{content.json,manifest.base.json,manifest.json,signature.txt}
  DesktopGames.exe / README.txt / run-aquarium.cmd / run-stall.cmd / run-town.cmd
=> 无私钥、无源码、无 .map、无 WAV、无审计/内部文档（正向）

$ dist: find dist -name '*.map' | wc -l => 0；find dist -name '*.pem' -o -name '*.key' => 0；find dist -name '*.wav' | wc -l => 42；du -sh dist => 8.7M
```

（42 个 WAV 是内置预生成语音资源，不是用户音频；其分发/许可不属于本安全审计，但建议在发布清单里与 asset license 一起过。）

### 8.7 构建页面清单 / consent 覆盖

```bash
$ ls dist/*.html
aquarium.html chat-import.html index.html pet.html presence.html setup.html stall.html tinglan-lab.html town.html world.html
$ grep -rn 'consent\|TOS\|gate' src/aquarium/main.ts src/town/main.ts src/stall/main.ts
# 仅 src/demo/main.ts:239 命中单词 'gate'（benchmark 注释，与 consent 无关）；aquarium/town/stall 无任何 consent 引用
```

### 8.8 探针（纯内存，不写仓库）

```text
$ node --import tsx /tmp/famling-probe.mts
validateManifest ACCEPTED: windows-drive file path
validateManifest rejected: unc file path - files[0].path must be a relative path
validateManifest rejected: ads content path - manifest.content must be listed in files
--- checkRelativePath ---
"../x" -> REJECT parent-traversal
"C:/Windows" -> REJECT absolute
"C:\\Windows" -> REJECT absolute
"//srv/share" -> REJECT unc
"a\u0000b" -> REJECT nul-byte
"CON" -> REJECT reserved-name
"a:b" -> REJECT drive-letter
"a " -> REJECT trailing-dot-or-space
"%2e%2e/x" -> REJECT encoded-traversal
"a/b" -> OK a/b
"cat" -> OK cat
```

说明：`validateManifest` 接受 `C:/Windows/win.ini` 是 P1-3/P2-3 的证据之一（TS 加载器会在 `resolve()` 后拦截；Rust 验签器没有等价拦截）。`checkRelativePath` 的规则完整，但仅用在了 `?character=` 一处（`main.ts:1937`），未用于 pack 加载链。

### 8.9 测试套件（背景任务，工作树状态）

```bash
$ npm test
ℹ tests 919 / pass 918 / fail 1 / duration_ms ≈ 18922
✖ tests/hero-multichar-integration.test.ts:342 — 'cat head has random replies' (5 !== 3)
```

该失败由审计期间并行 agent 未提交的 `public/characters/pet-cat/regions.json` 改动（随机回话从 3→5）引起，**与本审计的安全结论无关**；为不干扰并行工作，未对 HEAD 重跑基线。安全相关测试套件包括：`tests/pack.test.ts`、`tests/dlc-import-safety.test.ts`、`tests/discovery.test.ts`、`tests/chat-import-hardening.test.ts`、`tests/consent-bypass.test.ts`、`tests/dlc-consent.test.ts`、`tests/advisers-harden.test.ts`、`tests/advisers-ui-privacy.test.ts`、`tests/data-controls.test.ts` 等。

### 8.10 本次**未**做的实测（与 §9 对应）

- 未启动 Tauri/WebView2（无 GUI 会话），所有运行时行为（麦克风 `Default` 语义、`window.open` 行为、CSP 在 devUrl 的注入、命令 ACL 的运行时拒绝）均为**静态推断**。
- 未调用任何云 API（未使用用户 key；未产生费用）。
- 未做 fuzzing/渗透（pack JSON、IPC 参数、manifest 解析、ASR 音频格式）。
- 未实测 Windows ACL（`.keys/`、安装目录、`%USERPROFILE%\.advisers`）、未打安装包验证 `installMode`。
- 未用 `cargo tree --target` 核对 Rust 告警在 Windows 目标的实际编译情况。
- 未审计 Advisers 独立仓代码（只读契约/前端读取代码）；未审计 `plugins/dsh-famling`（另一任务 task-37）。

---

## 9. 剩余未知 / 需后续确认

1. **Tauri 运行时语义**：应用命令 ACL 默认全开依据官方文档 + 本地配置（build.rs 未用 AppManifest、capability 无应用 permission）；未在真实 WebView2 里验证「aquarium 窗口调用 brief/voice 是否确实成功」——但静态结论是默认允许，修复后需矩阵实测。
2. **麦克风 `PermissionResponse::Default` 在 WebView2 的实际结果**：可能允许、可能拒绝、可能静默；安装版（label=main）与便携版（label=pet）行为可能不同。
3. **Windows ACL**：`.keys/dev-private.pem`（WSL 视图 777）、NSIS 安装目录、`%USERPROFILE%\.advisers` 的真实 ACL/共享/OneDrive 同步状态未实测。
4. **NSIS 安装模式**：`tauri.conf.json` 未设 `installMode`，Tauri 默认值需以实际安装包验证（决定 packs/信任根是否在用户可写目录）。
5. **Rust advisory 的 Windows 影响**：glib/gtk/proc-macro-error 是否仅 Linux 目标编译，需 `cargo tree --target x86_64-pc-windows-msvc` 复核；chrono 只是 unmaintained。
6. **Advisers brief 真实数据面**：未读取本机 `%USERPROFILE%\.advisers\pet-brief.json`（避免接触用户隐私数据）；因此「实际字段含多少个人/第三方信息」只能从 schema 与文档推断。
7. **签名密钥的运维现实**：私钥是否在其它开发机/共享/备份存在、是否有第三方代签流程、轮换计划——本仓库内无记录；建议由负责人书面确认。
8. **未来 DLC/社区内容分发渠道**（Steam Workshop/下载站/zip）尚未实现；一旦实现，P2-3 的路径/大小校验与 P1-1 的密钥管理会成为**准入门槛**。
9. **未覆盖**：移动端（无配置）、Advisers 独立仓、dsh-famling 插件、网络中间人（TLS 由 rustls 提供，未做 pinning）、供应链构建机（CI 机器）安全。

---

## 10. 修复优先级与验收

### 10.1 顺序建议

1. **P1-1（签名信任根）** —— 先做，因为它是整条内容信任链的根；同时移除 release 的 `--dlc-key`/`P0_PACKS_DIR` 覆盖。
2. **P1-2（命令 ACL + 窗口隔离）** —— 与 P1-1 同批；`build.rs`/permissions/capability 改动小、收益最大。
3. **P1-4（consent 门补洞）** —— lab 页/游戏页/`?character=tinglan`/IPC 直调；与发布合规直接相关。
4. **P1-3（innerHTML + Tauri 侧内容校验）** —— 与 1/2 同批：即使签名被滥用，内容和命令双层防线可限制爆炸半径。
5. **P2-3/P2-2（Rust 验签/命令硬化）** —— 一次 Rust 改动同时解决路径、大小、DoS。
6. **P2-5/P2-6/P2-7（隐私明文/密钥/发布签名）** —— 需要产品/发布拍板（凭据库、代码签名证书、更新通道）。
7. **P2-1/P2-8/P2-9/P2-10/P2-11** —— 排期改进；P2-9/P2-10 可在下一次构建解决。

### 10.2 验收清单（建议加进发布门禁）

| 条目 | 验收方式 |
|---|---|
| P1-1 | release 构建不再从 `packs/` 读信任根；`--dlc-key`/`P0_PACKS_DIR` 在 release 无效；dev-only pack 被 release 拒绝；私钥 ACL/保管流程有书面记录 |
| P1-2 | `build.rs` 使用 `AppManifest::commands`；`src-tauri/permissions/*.toml` 存在；capability 按窗口拆；新增「命令×窗口」矩阵测试：aquarium/bench 调 `read_advisers_brief`/`voice_asr`/`unprotect_text` 全部 denied，pet/main 正常 |
| P1-3 | `grep -rn 'innerHTML' src/aquarium src/town src/stall src/world` 无 pack/外部文本插值；恶意内容单测（HTML 字段 → DOM 文本节点）；Tauri 侧 content schema 校验单测 |
| P1-4 | `--game=aquarium/town/stall` 启动必须先过 TOS/DLC 门；`tinglan-lab.html` 不在发布产物（或已过门）；`pet.html?hero=1&character=tinglan` 弹完整 TOS；`invoke('voice_asr')` 无 token/非 pet 窗口被拒；`tests/consent-bypass.test.ts` 扩展覆盖 |
| P2-2/P2-3 | Rust 集成测试超限参数/恶意 manifest 全拒；`cargo test -p dlc-verify` + `npm test` 通过 |
| P2-7 | `Get-AuthenticodeSignature` = Valid；发布物有 minisign/cosign 校验文件与文档；未来 updater 签名/回滚测试通过 |
| P2-8 | CI 增加 OSV/`cargo deny`/dependency-review；actions 全部 SHA pin；`npm audit` 使用可审计 registry；发布附带 SBOM |
| 通用 | `npm run preflight`、`npm test`、`npm run verify:dlc:rust`、`npm run legal:check -- --strict` 全绿；`git ls-files '*.pem'` 仅公钥；`dist` 无 `.map/.pem`；secret scan 通过 |

---

## 附录 A：行号基线核对方法

本文行号 = `git show HEAD:<path>` 的行号（HEAD=`a3ac3c3`）。抽查命令：

```bash
# 例：核对 main.ts 的 DPAPI/保存段与 consent 分支
git show HEAD:src/pet/main.ts | sed -n '1008,1045p'
git show HEAD:src/pet/main.ts | sed -n '1934,1960p'
# 例：核对 Rust 命令与 key 路径
git show HEAD:app/tauri/src-tauri/src/main.rs | sed -n '103,135p;144,166p;289,307p;562,581p'
# 例：核对 DLC verifier
git show HEAD:native/dlc-verify/src/lib.rs | sed -n '39,101p'
# 例：核对 CSP / capability / build.rs
git show HEAD:app/tauri/src-tauri/tauri.conf.json | sed -n '1,51p'
git show HEAD:app/tauri/src-tauri/capabilities/default.json | sed -n '1,30p'
git show HEAD:app/tauri/src-tauri/build.rs | sed -n '1,3p'
```

常用锚点（HEAD 行号，`文件:行`）：

- `main.rs`：`75` safe_slug、`103` fetch_deepseek_share、`144` read_advisers_brief、`169` read_pack_manifest、`187` write_save、`245` delete_save、`265` read_save、`289` dlc_verify、`310` dlc_list、`353` report_bench、`444` on_permission_request、`461` --reset-saves、`562` packs_dir、`574` key_path、`591` invoke_handler。
- `secret.rs`：`22` protect_text、`54` unprotect_text、`99` clear_save_backup；`voice.rs`：`21` limit、`111/126/196` env key、`121` synth、`150` quota、`158/219` endpoints、`194` asr。
- `tauri.conf.json`：`8` devUrl、`10` frontendDist、`15` label=main、`17` url=pet.html、`30` csp、`32` withGlobalTauri=false、`39` packs resource；`capabilities/default.json:5-11/12-29`；`build.rs:2`。
- `native/dlc-verify/src/lib.rs`：`39` verify、`40` manifest、`65` signature、`74` verify_strict、`83` 路径检查、`90` join、`99` content。
- `src/pet/main.ts`（HEAD）：`177` SAVE_SLOT、`612` say、`655` TTS 门、`937/958` talk/ASR 门、`1008/1016` save 加解密、`1066` write_save、`1158` read_save、`1358` save-import、`1374` importPortableWithConsent、`1452` bootPetOnce、`1490` brief 初始化调用、`1503` `__pet`、`1927` startHeroPage、`1934-1958` character 分支、`2075/2081` brief 初始化、`2111` clearPanelContent、`2220/2242` brief 面板/过期、`2392/2453` window.open。
- `src/pet/hero-runtime.ts:86/134/172`；`src/pet/character/builtin.ts:12,20,39-47`；`src/pet/consent/content.ts:9-20/60/96`；`consent/gate.ts:362/568/609/639/699`；`consent/core.ts:20/21/120`；`consent/terms.ts:80/580`；`consent/store.ts:111`；`consent/age.ts:29/51-59`；`consent/data-controls.ts:107/153/226/267/335`。
- `src/pet/chat-import.ts:92/165-196/430`；`chat-import/store.ts:21/50-91`；`chat-import/deepseek-share.ts:40-56/97-157`；`chat-import/fetch.ts:63-72/102-134`；`src/pet/tinglan-lab.ts:142`。
- `src/aquarium/main.ts:25/76-98/160/271/300/332`；`town/main.ts:193/227/244`；`stall/main.ts:180-186`；`world/main.ts:35-39`；`demo/main.ts:42-59`；`pack/from-data.ts:13-31`；`pack/loader.ts:80/87/99/101/117/121`；`pack/manifest.ts:48/57`；`pet/security/path-safety.ts:64-87/121-180`。
- `src/presence/pet-brief.ts:72/502-508/529-537/1038-1042`；`src/pet/advisers/face.ts:223-232/756`；`src/pet/desktop-shell.ts:310/373/388`；`src/observability.ts:68-88`；`src/voice/tauri.ts:10/69`；`src/voice/asr.ts:18`。
- `setup.html:26/134/144`；`public/legal/PRIVACY.md:4/25/39/40/42/60/114/129/157`；`public/legal/SECURITY-AND-PRIVACY.md:28/44/58`；`public/legal/RELEASE-BLOCKERS.md:46`；`THIRD-PARTY.md:121`；`docs/UPDATER-KEYS-2026-11-15.md:3/13/21`；`scripts/make-pack.ts:7`；`scripts/release-win.mjs:15/232`；`package.json:47-55`；`.github/workflows/release.yml:3/27/34/41/95`；`app/tauri/src-tauri/Cargo.toml:12-18`；`.gitignore:6/29`。

---

## 附录 B：本次审计的边界声明

- 本报告是**工程安全审计**，不是渗透测试报告、不是合规认证、不是法律意见。
- 所有「影响」描述均基于代码/配置的静态推理与已标注的局部实测；未实测项已在 §8.10/§9 明示。
- 未读取用户的 `~/.advisers/pet-brief.json`、存档、localStorage 实际内容或任何 API key；未向任何外部服务发送项目数据（仅有 OSV/Tauri 官方文档的只读查询）。
- 报告中的路径/命令均在本机可复现；如 HEAD 变化，行号需按附录 A 重新核对。


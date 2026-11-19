# V1 决策与实机验证 dossier（2026-11-17）

> **Status: 计划稿 · PLAN ONLY。** 本文件只做两件事：把“必须先拍板 / 必须先实机验证”的事项排成可执行清单，并登记每项现状证据、验收、阻塞与决策 owner。**未执行**任何拍板、构建/安装、实机验证、代码/资产改动、git、API/生图；文中“现状”引自已存在报告，不代表已完成。
> 基线：HEAD `d345eb6`（2026-11-17）；版本 `0.1.0`；宿主 Win11 `10.0.26200.9974` + WSL2（Windows 侧 node/cargo 可用，WebView2 `148.0.3967.83`）；**无 Win10 实机**（外部 VM/另一台机）。实机轮开始前需重跑 `typecheck/test/build/preflight/legal-check` 并记录 commit。
> 角色：**U**=用户（唯一产品/法务拍板人）·**E**=桌面工程 ·**W**=Windows 构建/实机 ·**A**=美术/资产 ·**L**=法务/合规（律师暂缓时由 U 按台账拍板）·**X**=外部（Win10、证书、npm OTP、GitHub）。
> 关联：[非美术剩余](../audit/NONART-REMAINING-AUDIT-2026-11-17.md) · [美术合并审计](../audit/CONSOLIDATED-ART-AUDIT-2026-11-17.md) · [Advisers 契约](../integration/ADVISERS-CONTRACT.md) · [chat share 研究](../research/CHAT-SHARE-x1baq-2026-11-17.md) · [Windows 验收设计](../research/REMAINING-WINDOWS-QA.md)
> 更新规则：拍板结果写入 [DECISIONS-2026-11-15](../DECISIONS-2026-11-15.md)（按日期追加）与 `docs/legal/APPROVALS.md`；只有带证据链接的项才可标“已验/已决”，本文件本身不构成任何完成声明。

## 1. 产品拍板（不拍板则工程只能做“可回滚的临时态”）

| ID | 拍板问题 | 现状（证据） | 选项 → 建议 | 阻塞 | Owner |
|---|---|---|---|---|---|
| D-01 | 汀岚 Q256 是否 **final** | 已接为 opt-in preview（`?hero=1&character=tinglan`）；`final:false/placeholder:true`，`artStatus concept`；49/49 机器 gate 但锚点层是脚本重画，非人工 2× 终审；参见 [256 接入](../art/TINGLAN-256-INTEGRATION-2026-11-17.md)、[锚点收口](../art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md) | A 维持 concept/opt-in（推荐，直到 D-03 与 RM 验收）；B 人工 2× 终审并手绘锚点后升 final；C 现在宣称 final（不建议） | 人工像素终审、palette 注册、窗口/DPI 验收 | U/A |
| D-02 | 汀岚是否 **默认角色** | 默认仍 humanoid 96；tinglan 需显式 query；hero 白名单已加 tinglan 但未设默认 | A v1 不换默认（推荐）；B beta 换默认（需 D-01 通过 + 回退开关）；C 立即换（不建议） | D-01、回退策略、视觉验收 | U/E |
| D-03 | palette `orca-pixel@0.2-draft` 注册 | `tinglan-256` 的 character/manifest 写 `orca-pixel@0.2-draft`，`tinglan`（128）写 `orca-pixel@0.2`，命名不统一；`art/specs/` 无对应 spec、`art/_style/palettes/` 无 hex，`validate_art` 门无法执行；[PACK-256 审计](../audit/PACK-256-AUDIT-2026-11-17.md) §色板 | A 建 spec+hex+gate 后升 `@0.2`（推荐）；B 保留 `-draft` 并禁 final；C 换现有板 | 32 槽定稿、逐帧入板复验 | A/E |
| D-04 | UI 91 接入范围：托盘/面板/roleplay | 91 逻辑/97 物理；仅 9 个右键菜单图标已接（[UI-91 接入](../art/UI-91-INTEGRATION-2026-11-17.md)）；无 TrayIcon，其余 82 资产无消费点 | A P1 先接 menu 定稿 + badge/indicator/placeholder；托盘与 ICO 紧随；roleplay 卡随 D-07（推荐）；B 全量一次接（不建议） | 人工 16/32 评审、托盘实现、RP 门 | U/E/A |
| D-05 | 默认 humanoid：96 还是 256 | 运行时实图 96，`canvasTarget:256` 仅为目标；测试锁 96；[非美术审计](../audit/NONART-PRODUCT-AUDIT-2026-11-17.md) D3 | A v1 保持 96（推荐，窗口/DPI/region 未验前不动）；B R1'-R9' 通过后单批 256 | RM-06/08/09、美术工期 | U/E/A |
| D-06 | 猫狗：命名/id/画布/是否替换旧占位 | OC 提案完成（白布偶猫/金毛）；现 `pet-cat`/`pet-dog` 为 96 占位且旧方向（姜黄/眼斑）与新 OC 冲突；`needs/feed` 与“不做饲养”原则冲突；明确**禁止 API 生图**；见 [OC 完成报告](../art/OC-COMPLETION-2026-11-17.md) §3/§4 | 先拍板：名字、替换 vs 新 id、96/128、去 feed、是否同住叙事；建议 v1 不替换、保持 placeholder | 命名/商标初检、行为数据 owner | U/A/E |
| D-07 | roleplay v1 与 18+/地区/年龄门 | 无 RP 引擎/入口（仅 consent 记录退出意图）；无 age gate/2h/危机卡/退出确认；文档已要求“仅 18+、默认关、可退出”；[DECLARATIONS](../../DECLARATIONS.md) §roleplay、[RP 价值](../TINGLAN-ROLEPLAY-VALUES-2026-11-16.md) | A v1 不开放、不宣称（推荐）；B 只做模型无关骨架（18+ 门/2h/危机/退出/AI banner）+ 自述年龄；地区先 CN、海外另评 | 法规复核、文案/资源、律师暂缓口径 | U/L/E |
| D-08 | 收费/上架 | 无桌宠收费/上架决定；Steam 仅 stub；C 线《深夜小馆》A/B 首发（6h $9.99 / 8–10h $12.99）仍未拍板；见 [DECISIONS](../DECISIONS-2026-11-15.md) §2 | A v1 beta 免费 unsigned（推荐）；B 定价/Steam 留 P2；C 现在定（无依据） | 发布范围、证书、商店 AI 问卷 | U/X |
| D-09 | 公开仓/改名 | [PUBLIC-REPO](../PUBLIC-REPO-2026-11-16.md) 称公开仓 `PerryLink/tinglan`，而本仓 `git remote/tag` 为空、README 称远端/CI 已建与本地事实矛盾；export 白名单不含壳；产品名未定（“Orca”不可作产品名，候选 汀岚/留屿园 均未官方检索） | A 先定“公开=素材/接口子集”并修文档；B 改名 + 公开前完成商标初检；C 公开可运行完整壳（工作量大） | 名称、白名单扩壳、脱敏/CI | U/X |
| D-10 | 法务 16 blockers / APPROVALS | `legal-check --strict` = 8 DRAFT（NOTICE/CREDITS/THIRD-PARTY/AI-PROVENANCE/legal README/DECLARATION-MATRIX/SECURITY/TAKEDOWN）+ 8 portable（7 缺件+过小）；`release.yml` 必败；安装包缺 5 份声明且无 licensePage；见 [NR-07/NR-08](../audit/NONART-REMAINING-AUDIT-2026-11-17.md) | 建 `docs/legal/APPROVALS.md`（谁/何时/范围/依据）；U 拍板“律师暂缓下什么算可发布”；重打 portable；补 resources+licensePage | U 决策、律师暂缓、portable 重建 | U/L/E |
| D-11 | CC0/许可证 | `LICENSE-ART` 仍 DRAFT（目标 CC BY-NC-SA 4.0，律师暂缓）；CC0 无逐文件清单；TTS 18 WAV 再分发未确认、旧包内嵌；UI 91 placeholder-only；代码 PolyForm NC；Advisers MIT 与用户口径 Apache 待确认；见 [法务状态](../LEGAL-STATUS-2026-11-15.md) §3 | 逐文件列 CC0/TTS 处置；未确认 WAV 不进任何渠道；UI 91 接入前重新登记；代码许可 U 定；Advisers 许可由 Advisers 维护者确认 | U/L/上游 | U/L |
| D-12 | 窗口 flags 批准记录 | 11-11 No-Go 已被实践推翻（现 `transparent/alwaysOnTop` 已改），但 `D-2026-11-16` 未写入决策台账；见 [NR-06](../audit/NONART-REMAINING-AUDIT-2026-11-17.md)、[DESKTOP-PET-UX](../DESKTOP-PET-UX-2026-11-16.md) §7.3 | A 补写 D-2026-11-16 并接受 R1'-R9'（推荐）；B 回滚 flags | U 确认；是 RM 透明/置顶/穿透的前置 | U/E |

## 2. 实机验证矩阵（Win11 本机 + 外部 Win10；Tauri/WebView2 HEAD）

**证据规范**：每条落 `artifacts/qa/<日期>/<RM-ID>/`，含 `screen-*.png`、`cdp.json`、`win32.json`、`run.log`、`provenance.json`（commit + exe SHA256 + WebView2 版本 + OS build + DPI + 屏数）；**无 provenance 的截图不算证据**（沿用 [Windows 验收设计](../research/REMAINING-WINDOWS-QA.md) §2.1）。静态已知项 ≠ 实机通过；勿用 11-14 旧产物作证据。

| ID | 场景/步骤（缩写） | 期望/通过阈值 | 证据 | Owner | 现状 |
|---|---|---|---|---|---|
| RM-01 | HEAD 重建 NSIS → 静默安装 → 首启 | TOS 全屏弹层先于一切交互；勾选+按钮才进宠；Esc/拒绝→只读阻断；菜单/QA hook 均被锁 | 截图+日志+gate 审计 | W/E | ❌ 仅静态测试；无 HEAD 包 |
| RM-02 | 干净 Win10（无 WebView2）联网/断网安装 | bootstrapper 联网装成功；断网有可读错误与重试，不静默半装；Win10 EOL 按“尽力支持”写发布说明 | 录屏+安装日志 | X/W | ❌ 外部 VM |
| RM-03 | 首次 TTS：点说话→TTS 独立声明→接受→播放；换 provider 重确认；mute/系统 TTS 回退 | 未同意只字幕/系统 TTS 无网络；拒绝不播；声明版本/哈希变更重弹 | 截图+控制台日志 | W/E | ❌ 未实机（静态已锁 TOS/TTS 版本） |
| RM-04 | 安装版裸 exe（无参数）启动 pet，查 DLC 挂载 | 从 resource_dir 找到 `packs/`，日志 `mounted` 非 `skipped`；`--packs-dir` 覆盖仍生效 | 截图+log | W/E | ⚠️ 静态 fallback 已有（`main.rs` resource_dir），未实机 |
| RM-05 | 导入：chat share 直链页 + ZIP | 直链页先 TOS、fetch/save/clear 各自同意、拒绝零读取/落盘；ZIP 当前未实现，需 D 拍板后补 | 截图+网络/存储断言 | W/E | ⚠️ 直链门禁已有测试；ZIP 0 行 |
| RM-06 | 透明/置顶/穿透 R1'-R3' | 四角透桌面无 DWM 矩形；topmost 可切；点透明角落落到下层、点宠物 bond+2、菜单整窗接收 | 截图+Win32 样式/CDP 点击 | E/W | ❌ `SetWindowRgn/setIgnoreCursorEvents` 仍 0 实现（[NR-04](../audit/NONART-REMAINING-AUDIT-2026-11-17.md)） |
| RM-07 | 拖动/缩放/位置恢复 R4'/R5' | `GetWindowRect` 位移无跳；Z1–4 物理尺寸正确；重启位置恢复、越界回收 | Win32 JSON+截图 | W/E | ❌ 未实机 |
| RM-08 | DPI 100/125/150/175/200 R6' | dpr 1/1.25/1.5/1.75/2；窗=480×336×dpr（±8）；N 整数、region 对齐、无裁切、字≥12 | cdp+win32+每 DPI 截图 | W/E | ❌ N-first 未做（NR-14） |
| RM-09 | 多屏/混合 DPI R7' | 跨屏拖动/交互不崩；reset-window 回当前屏；重启不被拉回主屏或记 WARN | 双屏截图+坐标 JSON | W | ❌ 未实机 |
| RM-10 | 全屏隐藏与恢复 R8' | 全屏应用时隐藏，退出恢复；不抢焦点 | 截图+前台标题 | W/E | ❌ `watchFullscreen` 仅 stall/town 接，pet 未接（[fullscreen.ts](../../src/shell/fullscreen.ts)） |
| RM-11 | 锁屏/休眠恢复 | 锁屏采样不断；睡眠唤醒 rAF 恢复、内存平稳、无重复窗口 | soak JSON 采样 | W | ❌ 未实机 |
| RM-12 | 录音权限/设备切换/双击 | 首次权限提示可读；拒绝只字幕；设备切换/拔出不崩；无双麦常开/轨释放 | 截图+日志 | W/E | ⚠️ 双击 guard 已有单测，未实机 |
| RM-13 | 崩溃恢复 | 启动失败屏可重试/退出；坏档回退 `.bak`；crash buffer 记录不含对话/路径 | 截图+日志+存档目录 | W/E | ⚠️ 静态已有，未实机 |
| RM-14 | Advisers 文件/权限 | 仅本用户可读（Unix 0600；Windows ACL 待核）/128KiB/TTL 5min/未知版本 idle；无权限可读；`private` 30s 收起/一键隐藏/屏幕共享隐藏 | 文件属性+截图+日志 | W/E | ❌ 面板隐藏与屏幕共享未接（[ADVISERS-020-COMPAT](../audit/ADVISERS-020-COMPAT-2026-11-17.md) §7） |
| RM-15 | UI 91 16/32 深浅底 | 菜单图标 16/32 在 `#0B0E14`/`#F0E4D4` 与 DPR 125/150 可辨、不糊；不遮挡文字/可访问名不变 | 截图矩阵 | A/W | ⚠️ 有 contact sheet，未实机 |
| RM-16 | 汀岚 256 1×/2× 布局 | 1×（256 CSS）在 480×336 完整无裁切；2×（512 CSS 或 Z2 放大窗口）须有明确定义（窗口放大/缩放上限），字幕不压角色；DPI 100/150 一致 | 截图+CDP rect | A/W/E | ❌ 未做（当前 scale=1） |
| RM-17 | HEAD 重建/覆盖升级/便携 | setup+portable+SHA256+RELEASE-MANIFEST；覆盖安装保档；声明齐全、无未清权 WAV；旧 artifacts 隔离 | 清单+升级前后快照 | W | ❌ 旧产物 11-14 不可用（NR-05） |
| RM-18 | 24h soak（P1） | HEAD exe 隐藏 aquarium 24h；内存/FPS/handles 曲线无泄漏；崩溃留证据 | `artifacts/tauri-soak-24h.json` | W | ❌ 仅 24h 模拟；脚本需先加固 |

## 3. Advisers 0.2 → 未来（P1；契约生效、0.2.0 已发布；消费运行/自动刷新侧未闭环）

- **通道**：固定路径 `$ADVISERS_HOME/pet-brief.json`（否则 `~/.advisers/pet-brief.json`）；只读、5min TTL、≤128KiB、60s 轮询；不联网/不调模型/不回写。游戏基座是**稳定版异步消费者**：只依赖“文件 + schema”，不假设 DSH/Cordis 宿主插件 API、不共享进程/对象模型/数据库（[契约](../integration/ADVISERS-CONTRACT.md) §1）。
- **pin/证据**：`advisers@0.2.0`；tag `v0.2.0`（object `5d0bdeb`→commit `7f8c6d8`）；schema `2`（`1` legacy）；快照 sha `bd2704c5…`、Advisers TOS v2026.11.2 sha `c40f869a…`；契约 §1.1 与 [兼容审计](../audit/ADVISERS-020-COMPAT-2026-11-17.md) §1/§6 可复现。
- **兼容窗口**：接受 `1|2`；缺 `displayPolicy`→`private`+warning；`none`→跳过并丢弃缓存；未来 `>=3` **refuse/idle**（不猜读、不按 public 渲染）。收紧到只收 v2 需 v1 因 TTL 不可能存在 + release notes 明示 + 单独变更。
- **升级顺序**：producer 发快照+tag+release evidence → consumer 先加白名单+fixtures+保留旧用例 → consumer 发布验证 → producer 才切新版本 → 旧 major 至少保留一个 MINOR（契约 §8）。**不得反向**。
- **回滚**：回退 consumer allowlist/fixtures；未知版本保持 refuse 而非降级；Rust/前端错误映射双形态兼容；每次升级更新契约 §1.1 hash 与 compat 审计。
- **发布链已到 0.2.0 stable**：六包 lockstep + E11 release evidence 80/80；**旧审计里的 `.70/.71` 阻塞已被 0.2.0 发布取代**，以契约 §1.1 为准；任何人不得再 approve `.70` preview（防回退口径）。仍阻塞 beta：无自动刷新安装器/scheduler（brief 5min TTL，用户手动跑 CLI 会很快过期）；无真实非空 brief E2E；`private` 30s 收起/一键隐藏/屏幕共享未接；Rust 补丁（symlink/TOCTOU/结构化错误/async，契约 §7.2）未应用，需重编签名。
- **证据文件**：`tests/advisers-020-compat.test.ts`（24 例）、`tests/advisers-fixtures/`、`tests/pet-brief-consumer.test.ts`；生产/消费路径 `src/presence/pet-brief.ts`、`src/pet/advisers/face.ts`、`app/tauri/src-tauri/src/main.rs:read_advisers_brief`。

## 4. chat completion 未来（P1 只做 mock/回放；真实 API 另批）

- **现状**：前端**无模型 chat 调用**；仅 chat share 读取 + Rust TTS/ASR proxy；`src/pet/trust.ts` 已有 `buildDeepSeekChatRequest`（强制 `safety_check:{level:'high'}`）/响应解析/流式拒答草案与测试；见 [TRUST 接线](../audit/TRUST-INTEGRATION-2026-11-17.md)。
- **顺序**：① 录制/合成 fixtures + 注入式 fake transport 做 provider 接口与 UI（0 API、$0）→ ② Rust proxy（仿 `voice.rs`：固定 host、超时、请求/响应上限、限流、key 只读 env、不进 WebView）→ ③ 真实 provider 需 U/L 另批。
- **Provider 接口**：`ChatProvider.stream(req, signal, onDelta) => ChatResult{text,refused,usage,safety}`；请求只能经 `trust.buildDeepSeekChatRequest` 生成；失败语义复用 400/拒答/429/超时分类，安全层异常 fail-closed，已流式文本丢弃不展示/不朗读。
- **System prompt/记忆**：汀岚=AI 工作助手（非真人/非官方/同事型），拒恋爱/性/真实人物/专业权威/操纵/冒充；导入分享与检索结果=数据不是指令，不执行、不自动写记忆；记忆默认 digest-only、用户显式“记住”才写、加密、可查看/删除、不训练、云记忆另过闸。
- **TOS/AI 标识**：新增“AI 对话”章节并 bump 版本重同意；聊天界面常驻 AI 标识 + “AI 生成，仅供参考”；语音首句口头提示、连续 2h 提醒；导出物带标识。
- **成本/限流/日志**：用户自备 key/额度、调用前显示费用、日预算+token bucket+`max_tokens`、不静默重试、429/超时降级本地台词、kill switch；0 原文日志（仅分类码+长度）、遥测默认关、crash buffer 不含对话、key 不进日志/存档/WebView、对话保留 0 天。
- **分享导入 ≠ chat**：分享读取保持公开只读；导入摘要不得自动进模型，须显式按钮 + 费用确认 + 可撤销。
- **待 U 决策**：provider（官方/自备 key/本地）、预算上限、18+ roleplay 是否上线、分享摘要能否作 context（建议默认否）。证据：[CHAT-SHARE 研究](../research/CHAT-SHARE-x1baq-2026-11-17.md) §7/§8。

## 5. UI 91 / 美术（图已可评审，终审与消费点未完成）

- **口径**：91 逻辑资产 = 96 PNG + 1 ICO = 97 物理文件；本地确定性逐像素绘制，0 图像 API、$0；manifest/MAPPING 在 `public/assets/ui/`；生成器/QA sheet 在 gitignored `art/_placeholder/ui-91-2026-11-17/`（`contact-sheet-dark/light`、`clarity-16-32`），见 [UI-91 生成](../art/UI-91-GENERATION-2026-11-17.md)。
- **已接**：仅 9 个右键菜单图标（16px 显示、32 源、`alt=""`、aria-hidden），静态测试锁定；其余 82 资产无消费点。
- **仍需人工**：16/32 深浅底 + DPR 125/150 截图（RM-15）；`U-ICON-01..04` 托盘/app icon 定稿 + Windows 托盘实测（当前无 TrayIcon）；`RP-002` “18+”手绘字模 + 6 张 roleplay 卡法务/内容复核（D-07）；托盘 20/24 与静音对偶 3 文件属 91 范围外。
- **256 美术**：49/49 机器 gate（含本地补珍珠）≠ final；仍缺人工 2× 终审、palette 注册、锚点手绘；`display.scale=1`，1×/2× 布局验收见 RM-16。**不把 first-pass 当 final，不把 placeholder 改 true 骗门**。
- **猫狗**：OC 与 prompts 已交付但**明确禁止 API 生图**；0 张图；命名/id/画布/旧占位去留待 D-06。
- **边界**：不要用“再生成一批图”解决窗口/法务/roleplay/托盘/命名问题；非美术项不混入美术批次。

## 6. 安全 / 鲁棒性路线（P0/P1 发布门前必须清）

| ID | 事项 | 现状（证据） | 修复/验收 | Owner |
|---|---|---|---|---|
| S-01 | Rust 大小/路径/TOCTOU | `read_advisers_brief` 先 len 后 read（TOCTOU）、跟随 symlink、错误含路径、同步阻塞；`write_save/read_save` 无上限；`dlc-verify` 路径未 canonicalize、全量 read 无上限；`import-character` 跟随 symlink。见 [契约 §7](../integration/ADVISERS-CONTRACT.md)、[加固清单](../audit/HARDENING-2026-11-17.md) P1-6/8/9 | 按契约 §7.2 应用补丁（`symlink_metadata`/`is_file`/`take(MAX+1)`/结构化错误/`spawn_blocking`）；save 512KiB/2MiB 上限；DLC/导入 path-safety+条目/大小上限；`cargo test/check` + 单测；需 HEAD 重编 | E/W |
| S-02 | 安装包声明/licensePage | `bundle.resources` 仅 4 份，缺 LICENSE-ART/CREDITS/THIRD-PARTY/AI-PROVENANCE/ASSET-LICENSES；NSIS 无 licensePage；portable 缺 7 份且过小（[NR-08](../audit/NONART-REMAINING-AUDIT-2026-11-17.md)） | 补 resources + NSIS licenseFile/licensePage；`legal-check` 增加“包内声明清单”断言；重打 portable；安装后核验 | E/W/L |
| S-03 | 旧 artifacts/未清权音频 | setup 11-14 12:25、portable 11-14 14:44、target exe 11-14 16:54 均早于 HEAD；旧包含 18 个未清权 WAV（[NR-05](../audit/NONART-REMAINING-AUDIT-2026-11-17.md)） | 隔离/移出发布目录；HEAD 重建 NSIS+portable+SHA256+RELEASE-MANIFEST；复验无未清权音频/占位 | W/E |
| S-04 | CI/门禁 | 无 remote、CI 从未运行；Windows job 不 build Tauri；`e2e:tauri` 不在 workflow；legal 只在 release；见 [NR-13](../audit/NONART-REMAINING-AUDIT-2026-11-17.md) | CI 加 typecheck/test/build/fci/legal（release strict）；Windows job 加 `cargo check`/Tauri build；e2e 进 gate；公开仓 CI（若公开） | E/W |
| S-05 | 供应链 | `npm audit`/Cargo audit 未做；caret range + electron devDep 有供应链面；依赖许可未归档；见 [加固清单](../audit/HARDENING-2026-11-17.md) P2-4 | `npm ci` 锁死、`npm audit`/`cargo audit` 进门禁、依赖许可 `licenses/` 归档、发布构建固定版本、生成期 CSP | E |
| S-06 | E2E | `artifacts/e2e-tauri.json` 为 11-14；cdp/e2e 脚本未处理 TOS（当前实际失效）；无窗口/DPI/导入/hero 断言（[TRUST-REVIEW](../audit/TRUST-REVIEW-2026-11-17.md) P1-6） | 脚本先过 TOS 再断言 shell/menu/hero/window/DPI/import；证据绑定 HEAD commit+exe sha；纳入 CI | E/W |
| S-07 | 屏幕共享检测 | Advisers `private` 面板的 30s 收起/一键隐藏/共享检测 0 实现（[ADVISERS-020-COMPAT](../audit/ADVISERS-020-COMPAT-2026-11-17.md) §7） | 先做“失焦/手动隐藏 + 文本隐藏”；共享检测方案需 U/E 定（Win32 `WDA_EXCLUDEFROMCAPTURE` 排除捕获 vs 检测启发式）；Teams/Zoom/OBS 实测 | U/E/W |
| S-08 | OOM/fuzz/zip-bomb | WebView2 OOM 压测、Tauri 命令 fuzz、zip 上限未做；仓库无 zip 解包，`checkArchiveLimits` 无真实调用点 | ZIP 落地时接 fflate+Worker+上限；24h/OOM/fuzz 列入 P2 验收 | E/W |

## 7. 优先级 / 里程碑（P0=发布前，P1=beta，P2=以后）

| 里程碑 | 工作包（含验收/阻塞/Owner） | 退出标准 |
|---|---|---|
| **P0 发布前** | **W1 拍板 D-01~D-12**（U；阻塞：律师暂缓/名称/收费口径）→ 决策台账 + APPROVALS 齐 | 每项有日期/选项/owner；D-12 有记录 |
| | **W2 Tauri Phase 1B + HEAD 重建**（E/W；阻塞：D-12、Windows）→ region 穿透 + `.visible(false)` + R1'-R9' + NSIS/portable/SHA256 | `artifacts/qa/` 全矩阵 provenance 齐；旧包隔离 |
| | **W3 法务/发布门清零**（E/W/L；阻塞：U/L）→ strict=0；resources+licensePage；portable 补件；APPROVALS | `legal-check --strict` exit 0；安装包声明清单通过 |
| | **W4 256 口径收口**（A/U/E；阻塞：D-01/D-03）→ 人工 2× + palette 注册 或明确“v1 不含 256” | 决策落地；默认角色不漂移；无 final 误标 |
| | **W5 合规/安全骨架**（E/L；阻塞：D-07/D-10）→ 18+ 门/2h/危机/退出/AI 常驻标识（模型无关）+ Rust 大小/路径补丁 | mock 演示 + 单测；RM-01/03/12/13 过 |
| | **W6 E2E/CI 绑定 HEAD**（E/W）→ TOS-aware cdp/e2e + workflow 门禁 | CI 绿且证据绑定 commit |
| **P1 beta** | W7 Advisers 0.2.x 运行闭环：自动刷新安装器/scheduler + 真实非空 brief E2E + private 隐藏（E/W，OTP 用户；阻塞：registry/OTP） | 非空 brief 冒烟过；brief 不过期；private 行为符合 displayPolicy |
| | W8 chat mock/replay + provider 抽象 + TOS AI 章节（E/L；阻塞：D-11/预算） | 0 API 回放过；同意/费用/AI 标识测试过 |
| | W9 UI 91 人工评审 + badge/indicator/placeholder 接线 + 托盘/ICO（A/E/W；阻塞：D-04） | RM-15 过；托盘 Windows 实测 |
| | W10 猫狗 D-06 落地（U/A/E） | 命名/id/画布定稿；无 API 生图 |
| | W11 安装器声明/licensePage + 签名路线 + Win10 冒烟（W/X/U） | RM-02/17 过；签名/未签名口径明确 |
| | W12 ZIP 导入决策/实现 + i18n 起步（E/U；阻塞：D-08 范围） | D 拍板；若做则 zip 上限/去重/删除测试 |
| **P2 以后** | chat 真实 provider + 成本/限流/日志；Steam/收费/商店；公开仓完整壳；屏幕共享强检测；多角色/立绘；24h soak/压测/fuzz | 各项单独 ADR + 验收，不混入 P0/P1 |

## 8. 证据与复核入口

- 决策/需求：[DECISIONS-2026-11-15](../DECISIONS-2026-11-15.md) · [DECISION-MEMO-2026-11-15](../DECISION-MEMO-2026-11-15.md) · [非美术剩余审计](../audit/NONART-REMAINING-AUDIT-2026-11-17.md)（NR-01~23） · [非美术产品审计](../audit/NONART-PRODUCT-AUDIT-2026-11-17.md)
- 美术/UI：[合并审计](../audit/CONSOLIDATED-ART-AUDIT-2026-11-17.md) · [256 接入](../art/TINGLAN-256-INTEGRATION-2026-11-17.md) · [256 锚点](../art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md) · [UI-91 生成](../art/UI-91-GENERATION-2026-11-17.md) · [OC 完成](../art/OC-COMPLETION-2026-11-17.md)
- 法务：[法务状态](../LEGAL-STATUS-2026-11-15.md) · [法务文档更新](../audit/LEGAL-DOCS-UPDATE-2026-11-17.md) · [DECLARATIONS](../../DECLARATIONS.md) · [LICENSE-ART](../../LICENSE-ART)
- 窗口/实机：[DESKTOP-PET-UX](../DESKTOP-PET-UX-2026-11-16.md) §7 · [Windows 验收设计](../research/REMAINING-WINDOWS-QA.md) · [发布 runbook](../RELEASE-RUNBOOK.md)
- Advisers：[集成契约](../integration/ADVISERS-CONTRACT.md) · [0.2 兼容审计](../audit/ADVISERS-020-COMPAT-2026-11-17.md)
- 合规/信任：[TRUST 复核](../audit/TRUST-REVIEW-2026-11-17.md) · [TRUST 接线](../audit/TRUST-INTEGRATION-2026-11-17.md) · [加固清单](../audit/HARDENING-2026-11-17.md) · [chat share 研究](../research/CHAT-SHARE-x1baq-2026-11-17.md)
- 复核命令（只读/验当前状态）：`npm run typecheck && npm test`；`node scripts/legal-check.mjs --strict`；`npm run fci:validate`；`cd app/tauri/src-tauri && cargo check --locked --offline`；`git status --porcelain`；`node scripts/export-public-pet.mjs --out /tmp/tinglan-public-dryrun`。

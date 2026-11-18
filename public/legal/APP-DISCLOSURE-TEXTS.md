# 应用内声明短文本（可引用 canon）— 草案

> **状态：DRAFT · 2026-11-17 · 非法律意见。** 本文是应用内/发行物**可复制的声明短文本**，供 About、首次启动弹窗、2 小时提醒、TTS/ASR/角色扮演同意、隐私入口、roleplay 入口、Mod/DLC 加载确认、危机卡片复用。文本为声明用途，**不是**用户协议全文（TOS/SAFETY 另稿，由独立任务维护，本文件不复制其条款）。
> **实现状态（2026-11-17.5 复核，重要）**：本表为 **canon/目标文本**，多数 key 尚未在运行时引用；实际运行文案以 `src/pet/consent/terms.ts` 为唯一 canon（`gate.ts`/`modal.ts`/`pet.html` 手写文本并存）。已实现（2026-11-17.5）：**首启年龄自报核验**（Age 弹窗 + `age.*` 短文本，见 §2D；一般功能全年龄、roleplay 仅 18+；不是官方身份证核验）、TOS 年龄核验节、roleplay 18+ 门禁；已实现（2026-11-17.4）：TOS §六之二 `user-agency`；此前已实现 TOS/TTS/ASR 同意、数据控制、角色扮演声明+设定表单（仅本地模板，无自由 LLM 对话）。已知未实现：`firstRun.body` 1 屏、`health.dependency`/`crisis.card`/`footer.legal`、TTS 播放器标签、导出标签、图片角标；`packLoad` 每次确认零调用。**未实现的 key 不得接进 UI 假装已具备**（R-P1-05/R-P0-01）。年龄口径：**一般功能全年龄可用、roleplay/情感陪伴仅限 18+**（2026-11-17.5 用户拍板，取代旧“全年龄、不设年龄门”）；相关文本见 §2A/§2D。
> 用法：按 `key` 引用；中文为主、英文备用（海外/商店）。**不得改写字义**（可改称呼/标点）；新增语言须同步回写本文。
> 关联：[LEGAL-BASELINE](/legal/LEGAL-BASELINE.md) · [AI-CONTENT-POLICY](/legal/AI-CONTENT-POLICY.md) · [TTS-TERMS](/legal/TTS-TERMS.md) · [DLC-AND-PLUGIN-TERMS](/legal/DLC-TERMS.md)。

## 1. 展示规则（先看：既满足声明，又不打扰）

| 规则 | 要求 |
|---|---|
| R1 首启 | 首次启动 **1 屏**合并告知（AI/非官方/非专业/数据与费用/求助），一次即可；用户确认后不再每次启动弹窗 |
| R2 About | 常驻可访问入口，含完整声明 + 许可清单 + 联系方式；随时可查，不打断 |
| R3 AI 标识 | 2026-11-18 用户决定：不常驻界面角标；改为首启合并告知 + About/「声明」面板 + TTS 独立声明与播放器标签提醒；图片角落“AI 生成”与音频播放器标签仍需补 |
| R4 2h 提醒 | 连续使用每满 2 小时弹出/浮现短句；可“稍后”，但每满 2 小时再次出现；**不可彻底关闭**（[实现状态] 运行时当前按钮为“休息并关闭提醒/关于”，易被误读为永久关闭；目标文案见 §2A `health.2h.confirm`） |
| R5 roleplay | **仅限年满 18 周岁用户**（一般功能全年龄可用；首次启动须完成自报出生日期年龄核验，非官方身份证核验）；未满 18 周岁/未核验会被阻止并提示原因，不展示设定表单。内容必须全年龄适宜（禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充）。每次开始/设定变更显示完整 TOS + 独立声明并要求重新填写设定（场景/关系边界/语气/称呼/禁止项/全年龄/AI/健康确认），不沿用旧确认；进入后常驻横幅，可随时退出。（[实现状态] 已接：年龄门禁+声明+设定表单+退出；**当前版本仅本地模板/声明与设定，不提供自由 LLM 对话**） |
| R6 TTS | 首次使用确认一次；**之后每次开启/切换 provider/音色/云本地，以及新会话开始时再次确认**（运行时 canon `terms.ts` §五；短确认，不重复长文。原“首次后仅变更”口径已作废） |
| R7 Mod/DLC | **每次**加载/修改/更新都展示声明并确认；不得“同意一次永久跳过” |
| R8 危机 | 一旦触发立即显示（停止 roleplay）；不等待用户点击其他弹窗 |
| R9 不打扰 | 除 R4/R5/R6/R7/R8 外，不重复弹声明；设置页提供“查看完整声明” |

## 2. 文本 canon（中文 / English）

| key | 中文（canon） | English | 位置/频次 |
|---|---|---|---|
| `nonOfficial.short` | 非官方项目，与 DeepSeek 无关联、不背书。 | Unofficial project. Not affiliated with, endorsed by, or authorized by DeepSeek. | About/页脚/商店页（常驻） |
| `nonOfficial.full` | 汀岚是 PerryLink 的原创角色。本项目为非官方项目，与 DeepSeek（深度求索）无任何关联、合作、授权或背书关系；不使用其官方 Logo、字标或官方鲸鱼娘形象。 | Tinglan is an original character by PerryLink. This is an unofficial project, not affiliated with, endorsed by, or authorized by DeepSeek. No DeepSeek logos, wordmarks, or official mascots are used. | About/首启/发行物（常驻） |
| `firstRun.body` | 汀岚是 AI 工作助手（桌面工具），**不是真人**，回话由 AI 生成，可能出错也会遗忘；**角色扮演全年龄适用且当前版本仅本地模板/声明与设定，不提供自由 LLM 对话或情感陪伴**。本产品为非官方项目，与 DeepSeek 无关。它不提供医疗、心理、法律或财务建议。默认本地运行；开启云语音（TTS/ASR）会产生费用并把文本/音频发送给对应服务商。紧急情况拨 110/120，心理困扰拨 12356。 | Tinglan is an AI work assistant (desktop tool), **not a real person**. Replies are AI-generated and may be wrong or forgetful; **this version does not provide role-play, emotional companionship or free-form chat**. Unofficial project, not affiliated with DeepSeek. No medical, psychological, legal or financial advice. Local by default; enabling cloud voice (TTS/ASR) costs money and sends text/audio to the provider. Emergency: 110/120; mental-health support: 12356 (CN). | 首启 1 屏（一次）；[实现状态] 未实现（首启=完整长 TOS） |
| `firstRun.buttons` | [我知道了] [查看完整声明] [关闭语音] | [OK] [Full notice] [Disable voice] | 首启弹窗 |
| `ai.label.image` | AI 生成 | AI-generated | 图片角落（显式标识） |
| `ai.label.audio` | AI 语音 · 合成 | AI voice · synthetic | TTS 播放器/角标（常驻） |
| `tts.firstUse` | 这是 **AI 合成语音，不是真人录音**；可能读错字、断句或语气不自然。开启后会把要朗读的文字发送给语音服务商，可能产生费用（由你的账户承担），并按隐私说明处理。 | This is **synthetic AI speech, not a human recording**. It may mispronounce, misphrase, or sound unnatural. When enabled, text to be spoken is sent to the voice provider, may incur fees (your account), and is handled per the privacy notice. | TTS 首次使用（一次） |
| `tts.enableConfirm` | 确认开启 AI 合成语音？会显示“AI 语音·合成”，朗读文本将发送给 <provider>，可能产生费用；导出音频会带 AI 标识。 | Enable synthetic AI voice? An “AI voice” label will show; spoken text will be sent to <provider>, possibly incurring fees; exported audio carries an AI label. | 每次开启 TTS |
| `tts.changeConfirm` | 即将切换语音服务/音色：<old> → <new>。合成结果会变化，仍需标注“AI 语音”，费用与隐私条款按新服务商执行。确认切换？ | Switching voice provider/voice: <old> → <new>. Output changes; audio remains labeled AI; fees/privacy follow the new provider. Confirm? | 每次变更 provider/音色/云本地 |
| `tts.exportLabel` | 本音频为 AI 合成，不是真人录音。 | AI-generated synthetic audio; not a human recording. | 导出音频文件标签/同名 txt（显式+元数据） |
| `rp.age18`（旧 `rp.allAges` 已作废） | 角色扮演/情感陪伴**仅限年满 18 周岁用户**（一般功能全年龄可用）；未满 18 周岁或未完成自报年龄核验不能启动。内容必须全年龄适宜：禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充，不得诱导依赖/付费关系。内容为 AI 虚构/本地模板，不是真人、不是真实关系。 | Role-play **is 18+ only** (general features remain all-ages); under-18 or unverified users cannot start it. Content must stay all-ages: no adult sexual content, virtual intimacy, sexualisation of minors, self-harm/violence, illegal content, fraud or impersonation. AI fiction/local template, not a real person or relationship. | 每次开始/设定变更（完整声明 + 重新填写设定）；未满 18 不展示 |
| `rp.banner` | 角色扮演中：内容由 AI/本地模板呈现，不是真人，也不是真实关系；全年龄内容边界适用；不做医疗/法律/财务建议。可随时退出角色扮演。 | Role-play: AI/local-template, not a real person or relationship; all-ages boundaries apply; no medical/legal/financial advice. Exit anytime. | 进入后常驻横幅 |
| `rp.exit` | 已退出角色扮演，回到工作助手模式。 | Exited role-play; back to work-assistant mode. | 退出后（短提示） |
| `health.2h` | 已经连续使用 2 小时了。起来走走、喝口水、看看远处吧。汀岚不会因为你离开而生气。 | You've been using this for 2 hours. Stretch, hydrate, look away for a bit. Tinglan won't mind if you leave. | 每连续 2 小时；可“稍后”但会再次出现 |
| `health.short` | 每 2 小时休息一下；AI 不是真人，不替代专业帮助。 | Take a break every 2 hours; AI is not a real person and does not replace professional help. | **可复用短句**：About / 首启弹窗 / 2h 提醒 / 设置页（同一句，不新增长文案） |
| `health.dependency` | 注意到你最近常只和 AI 聊天。AI 不能替代真实的朋友和家人，试着约一位可信任的人聊聊？ | Noticed you've been talking mostly with AI. AI can't replace real friends and family — consider reaching out to someone you trust. | 依赖信号触发（低频，可关闭仅提醒频率） |
| `crisis.card` | 听起来你现在很难受。汀岚只是 AI，没法陪你去医院或报警。如果你有伤害自己的念头，请马上联系可信任的人，或拨打 **12356** 心理援助热线；紧急情况请拨 **110 / 120**。你不需要一个人扛。 | It sounds like you're in a lot of pain. Tinglan is only an AI and cannot take you to a hospital or call for help. If you're thinking of harming yourself, contact someone you trust or call the **12356** mental-health hotline; in an emergency call **110 / 120**. You don't have to carry this alone. | 识别到危机信号；停止角色扮演 |
| `minors.guardian` | 一般功能全年龄可用；roleplay/情感陪伴仅限年满 18 周岁用户（未满 18 可用一般功能，不能启动 roleplay）。年龄核验为用户自报出生日期，非官方身份证/实名核验。不提供成人向内容与虚拟恋人/伴侣/亲属等亲密关系角色；不主动收集未成年人个人信息；监护人可邮件要求删除/举报。 | General features stay all-ages; role-play/emotional companionship is 18+ only (minors may use general features but cannot start role-play). Age verification is self-reported, not official ID verification. No adult content or virtual partner/relative roles; no knowing collection of minors' personal data; guardians may contact us to request deletion/reporting. | About/首启 |
| `mod.loadConfirm` | 即将加载/修改内容包 **<name> <version>**（作者：<author>）。来源：<source>；许可：<license>；AI：<ai.status>。**非官方**内容，与 PerryLink/DeepSeek 无关联。可能改变外观/语音/行为，请仅安装你信任的来源。加载后仍保留 AI 标识、非官方声明与安全门禁。 | Loading/modifying pack **<name> <version>** by <author>. Source: <source>; license: <license>; AI: <ai.status>. **Unofficial**, not affiliated with PerryLink or DeepSeek. It may change visuals/voice/behavior; only install trusted sources. AI labels, unofficial notice, and safety gates remain. | 每次加载/修改/更新包（必须确认） |
| `dlc.authorDuty` | 作为包作者，你对内容合法性、素材许可与来源、AI 披露负责；不得移除安全/同意门禁或冒充官方。 | As a pack author you are responsible for legality, asset licenses/sources, and AI disclosure; do not remove safety/consent gates or impersonate the official project. | 作者上传/签名时确认（一次/次） |
| `footer.legal` | AI 生成内容，可能出错；不构成医疗、法律、金融或心理治疗建议。问题/侵权/安全：novelnexusai@outlook.com；违法不良信息可向 12377 举报。 | AI-generated content may be wrong; not medical, legal, financial, or psychological advice. Contact: novelnexusai@outlook.com; report illegal content to 12377 (CN). | 页脚/About（常驻） |
| `health.night` | 夜深了，默认安静模式；需要的话可以明天再聊。 | It's late — quiet mode is on; we can talk tomorrow. | 夜间（可选，低频） |

## 2A. 2026-11-17 增补短文本（age / ASR / privacy / audio AI label）

> 本节 key **均为目标 canon，工程尚未接入**（写入 UI 前须先实现对应能力；否则只能显示“当前版本不提供/建设中”，不得假装可用）。措辞可由律师复核。与 `TOS.md`/`terms.ts` 冲突时以 `terms.ts` 为准并回写本文。

| key | 中文（canon） | English | 位置/频次 | 实现状态 |
|---|---|---|---|---|
| `age.roleplay18`（旧 `age.allAges` 作废） | 一般功能全年龄可用；**roleplay/情感陪伴仅限年满 18 周岁用户**（2026-11-17.5 用户拍板）；角色扮演内容必须全年龄适宜，禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充。 | General features are all-ages; **role-play/emotional companionship is 18+ only** (2026-11-17.5 decision); role-play content must stay all-ages: no adult sexual content, virtual intimacy, sexualisation of minors, self-harm/violence, illegal content, fraud or impersonation. | 首启/About/商店页 | **已实现 18+ 门槛**（§2D） |
| `minors.guardian` | 未满 18 周岁或依法不具备完全民事行为能力的用户，请在监护人知情并指导下使用；我们不主动收集未成年人个人信息；监护人可通过 novelnexusai@outlook.com 要求删除/举报（本机数据需在设备上操作，本应用当前无法远程删除你设备上的数据）。 | Users under 18 or without full legal capacity should use the app with guardian knowledge/guidance; we do not knowingly collect minors' personal data; guardians may contact novelnexusai@outlook.com to request deletion/reporting (local data must be handled on the device; no remote deletion today). | About/首启/商店页 | 已更新 TOS/About；无监护人验证/未成年人模式（如实告知） |
| `asr.firstUse` | 语音输入会把你说的话**录音并上传给语音识别服务商 DeepSeek（深度求索）**，用于转成文字；最多 60 秒、约 8 MiB；可能产生费用（你的账户）；音频不留存在本机；服务商留存/跨境处理按服务商政策（待其书面确认）。你可以随时关闭；不同意不会阻止打字/字幕使用。 | Voice input records your speech and **uploads the audio to the ASR provider DeepSeek** to transcribe; max 60 s / ~8 MiB; fees may apply (your account); no local audio persistence; provider retention/cross-border per its policy (pending written confirmation). You can turn it off anytime; declining does not block typing/subtitles. | ASR 首次启用（一次） | **未实现**（当前 PTT 直接上传，无告知/同意；R-P0-05） |
| `asr.enableConfirm` | 确认开启语音输入？**将上传本次录音**给 DeepSeek ASR，可能产生费用；不开启也能用本地/打字功能。 | Enable voice input? **This uploads your recording** to DeepSeek ASR and may incur fees; local/typing features remain available if you decline. | 每次开启/每次上传前短确认（单独同意） | 未接 |
| `asr.noConsent` | 未开启语音输入：本次不会录音、不会上传。 | Voice input is off: nothing will be recorded or uploaded. | 拒绝/关闭后（短提示） | 未接 |
| `privacy.short` | 默认本地运行：存档/记忆只存本机并加密；遥测默认关。仅当你开启云 TTS/ASR 时，文本/音频会发送给 DeepSeek；费用与跨境处理按服务商条款（待确认）。 | Local by default: saves/memory stay on your device, encrypted; telemetry off. Only if you enable cloud TTS/ASR are text/audio sent to DeepSeek; fees and cross-border handling follow the provider's terms (pending). | About 常驻 / 首启 | 未接（可作为 About 摘要） |
| `privacy.policy` | 完整隐私政策（草案，生效前仅供参考）：见 docs/legal/PRIVACY.md。数据请求/删除：novelnexusai@outlook.com。 | Full privacy policy (draft; not effective yet): docs/legal/PRIVACY.md. Data requests/deletion: novelnexusai@outlook.com. | About/首启/商店页链接 | 未接；打包后 docs 链接当前 404（R-P0-19） |
| `privacy.dataRequest` | 查阅/复制/更正/删除/撤回同意：novelnexusai@outlook.com（标题注明“隐私/删除/未成年”）。涉未成年人请求优先处理（内部目标，非时限承诺）。**本机也有应用内撤回/删除入口**（见下两行）；本应用无法远程删除你设备上的数据。 | Access/copy/rectify/delete/withdraw consent: novelnexusai@outlook.com (subject: privacy/deletion/minor), and in-app entries below (local device only; no remote deletion). | About/隐私政策 | 邮箱渠道未变；应用内入口已实现（2026-11-17） |
| `privacy.withdraw` | 撤回同意：**二次确认**后清除本机 TOS 同意记录与本次会话的 TTS/ASR 确认，停止语音处理并进入安全只读（可重新同意或退出）；**不会删除存档/记忆/导出文件**。同意审计记录只保留必要字段，可在 About 查看并清除。 | Withdraw consent: after **two confirmations**, clears the local TOS acceptance + this session's TTS/ASR confirmations, stops voice processing and enters safe read-only (re-consent or exit); **does not delete saves/memory/exports**. The minimized consent audit can be viewed/cleared in About. | About/桌面菜单 | **已实现**（2026-11-17；`consent/data-controls.ts` + `runtime.ts`，测试 `tests/data-controls.test.ts`） |
| `privacy.deleteAll` | 删除全部本地数据：**二次确认**后清除存档/备份/记忆/折页/导入摘要/偏好/同意记录与审计/安全审核记录/TTS 缓存/窗口位置，并逐项核验；无法清除或核验的项目（如 TTS 用量计数 `quota` 当前无 Rust 清除命令、WebView2 配置目录）会如实列为**残留/未核验**，不谎报完成；**不删除你导出的外部文件**。删除后进入安全只读。 | Delete all local data: after **two confirmations**, removes saves/backups/memory/digests/preferences/consent+review records/TTS cache/window position and verifies each item; items that cannot be deleted or verified (e.g. TTS `quota` has no Rust clear command in this build, WebView2 profile) are reported as **residual/unverified**, never as success; **user-exported files are not deleted**. Ends in safe read-only. | About/桌面菜单 | **已实现（有残留如实披露）**（2026-11-17）；quota/WebView2/Rust 侧清除仍缺 |
| `ai.label.audio.player` | AI 语音 · 合成（不是真人录音） | AI voice · synthetic (not a human recording) | 播放器常驻（≥12px/对比 ≥4.5:1） | 未接（现仅 8px 角标） |
| `ai.label.audio.start` | 以下语音为 AI 合成，不是真人。 | The following voice is AI-synthesised, not a real person. | 每次会话首次播放前口头提示或提示音 | 未接（R-P0-03） |
| `health.2h.confirm` | 休息一下（2 小时后仍会提醒） | Take a break (you'll still be reminded after 2h) | 2h 提醒按钮 | 未接；现按钮“休息并关闭提醒”（R-P1-01） |

- 年龄口径已由用户更新（2026-11-17.5）为**一般功能全年龄可用；roleplay/情感陪伴仅限 18+**；首次启动自报出生日期核验（非官方身份证核验）。不得宣称实名/官方身份证核验或绝对阻止未成年人；未成年人可用一般功能，但不能启动 roleplay。
- `privacy.withdraw`/`privacy.deleteAll` 在工程实现前**只能作为内部待办**，不得作为对外可用功能展示；对外文本只能写“入口建设中，可通过邮箱请求协助”。

## 2B. 2026-11-17 增补：数据控制与本地审核留痕短文本（已接入运行时）

> 本节 key 已由 `src/pet/consent/data-controls.ts` / `safety-audit.ts` / `runtime.ts` 接入 About 面板；文案与代码一致即为准。**仍受第 5 节“残留”限制**：不得写“已完全删除全部数据/已实现证据级审计”。

| key | 中文（canon） | English | 位置/频次 | 实现状态 |
|---|---|---|---|---|
| `privacy.withdraw.confirm` | 撤回同意后将清除本机同意记录与本次会话的 TTS/ASR 确认、停止语音处理并进入安全只读；不会删除存档/记忆。需两次确认。 | Withdrawing clears the local acceptance and this session's TTS/ASR confirmations, stops voice processing and enters read-only; saves/memory are not deleted. Two confirmations required. | 撤回弹窗第 1 步 | 已接（`WITHDRAW_CONFIRM_STEPS`） |
| `privacy.deleteAll.confirm` | 删除范围：存档/备份/记忆/折页/导入摘要/偏好/同意审计/安全审核记录/TTS 缓存/窗口位置；不删除你导出的外部文件；quota 等无法清除项会列为残留；需两次确认。 | Scope: saves/backups/memory/digests/preferences/consent+review audit/TTS cache/window position; user exports are kept; undeletable items (quota) are listed as residual; two confirmations required. | 删除弹窗第 1 步 | 已接（`DELETE_CONFIRM_STEPS`） |
| `privacy.audit.consent` | 同意审计仅保留必要字段（时间/动作/决定/TOS 版本与哈希/目标范围/TTS·ASR 声明版本与哈希），不含原文；可一键清除；非证据级。 | Consent audit keeps only necessary fields (time/action/decision/TOS version+hash/scope/TTS·ASR declaration versions+hashes), no original text; clearable; not evidence-grade. | About → 同意审计记录 | 已接（`core.ts` 最小化 + `gate.clearAudit()`） |
| `privacy.audit.safety` | 本机安全审核记录仅保存方向/风险类别/规则 ID/处置/时间/**加盐文本哈希**/长度，不保存原文；滚动上限 200 条；About 可查看/清除；导出仅用于投诉/执法；**非证据级、无哈希链**。 | Local review ledger stores only direction/categories/rule ids/disposition/time/**salted text hash**/length — no original text; rolling cap 200; view/clear in About; export only for complaints/law enforcement; **not evidence-grade, no hash chain**. | About → 审核记录 | 已接（`safety-audit.ts`；主窗口 ASR/TTS/Advisers 审核接入；chat-import 窗口与 DLC 预览留痕仍缺） |

- 以上文本已写入 `pet.html` About 面板/确认弹窗；**归档限制**：TTS `quota.json` 当前无 Rust 清除命令、WebView2 配置目录非应用管理，删除结果必须如实列为残留/未核验（Rust 侧补齐前不得称“全部删除成功”）。

## 2C. 2026-11-17.4 增补：用户自行接入第三方模型/自创用法（user-agency）短文本

> 背景（用户 2026-11-17 口径）：自由 LLM roleplay/情感陪伴是使用者参照工作助手（秘书）用法、按自身需求**自行创造/延伸**的用法，**不是官方功能**；官方不提供、不鼓励并明确反对，提示法律风险；官方无法监控/强制阻止自行接入或修改后版本，只尽合理提醒与安全设计义务。应用内完整 TOS 已含 §六之二 `user-agency`（经 TOS 弹窗/About 全文渲染）；下列短文本为 About/首启/商店页**目标 canon，尚未单独接入 UI**，接入前不得对外宣称已展示。

| key | 中文（canon） | English | 位置/频次 | 实现状态 |
|---|---|---|---|---|
| `userAgency.short` | 官方不提供、不鼓励自由 LLM 情感陪伴、虚拟亲密/恋爱或付费关系；你可以自行接入第三方模型/服务或修改本应用，但那是你自己的用法：须遵守法律与第三方条款、自担风险与后果。当前版本仍只有本地模板，不提供自由 LLM 对话。 | We do not provide or encourage free-form LLM emotional companionship, virtual intimacy/dating or paid relationships. You may integrate third-party models/services or modify the app yourself, but that is your own use: obey the law and third-party terms, and bear the risks/consequences. This build is still local-template only — no free-form LLM chat. | About/TOS 摘要/商店页（常驻） | **未单独接入**；完整 TOS §六之二已经弹窗渲染 |
| `userAgency.risk` | 风险提示：拟人化互动/情感依赖、未成年人、隐私与数据出境、TTS 声音权/冒充、诈骗、违法内容、模型错误、费用。出现违法/伤害/危机立即停止，紧急拨 110/120、心理援助 12356。官方不承诺完全阻止自行接入或修改后的行为，只尽合理提醒与安全设计义务。 | Risks: anthropomorphic interaction/emotional dependency, minors, privacy/cross-border data, TTS voice rights/impersonation, fraud, illegal content, model errors, fees. Stop immediately on illegality/harm/crisis; emergency 110/120, mental-health 12356 (CN). We do not promise to fully stop self-integration or modified builds — only reasonable reminders and safe design. | About/商店页/报告页 | 未接入 |
| `userAgency.notOfficial` | 自行接入第三方模型/服务不构成官方支持、授权或背书；不得冒充官方、DeepSeek 或其关联方，不得暗示官方合作/官方客服/官方认可。官方保留提醒、拒绝支持、停止提供/删除相关内容并依法举报的权利。 | Self-integration is not official support, authorisation or endorsement; do not impersonate the official project, DeepSeek or affiliates, or imply official cooperation/support. We reserve the right to warn, decline support, stop providing/delete content and report unlawful use. | About/页脚 | 未接入 |
| `userAgency.safeguards` | 运营者已尽最大努力防止违法使用与不当情感陪伴（本机安全规则与内容审核、TTS/ASR 单独声明、TOS 同意门禁、举报/求助与危机入口、DeepSeek safety_check 请求设计）；但技术无法绝对阻止自行接入/修改/第三方使用，**不承诺零违法/零伤害**；年龄自报核验已实现（2026-11-17.5；自报出生日期，非官方身份证核验，可被虚假自报/修改绕过）；用户自担责任。 | The operator uses best efforts against unlawful use and improper emotional companionship (local safety rules, separate TTS/ASR declarations, TOS gate, report/crisis channels, DeepSeek safety_check request design). However, technology cannot absolutely stop self-integration, modified or third-party use; **zero illegality/harm is NOT guaranteed**; age self-report verification is not implemented (planned); users bear their own liability. | About/TOS 摘要 | 未单独接入；完整 TOS §六之二已含该段 |

- 官方**不承诺“完全阻止”**自行接入/修改后的行为；不得把本应用宣传/设计成“官方自由 LLM 情感陪伴/虚拟恋爱/付费关系”服务。
- 本表与 `TOS.md` §六之二 冲突时，以 `terms.ts` 为准并回写本文。

## 2D. 2026-11-17.5 增补：年龄自报核验与 roleplay 18+ 门槛（已接入运行时）

> 本节 key 已由 `src/pet/consent/age.ts`（模型/校验/本机存储）、`modal.ts`（Age 弹窗：年/月/日下拉、无预填、aria-live、Escape=拒绝）、`gate.ts`（年龄→TOS 顺序 + `requestRoleplay` 的 `age-required`/`minor` 拒绝）、`runtime.ts`（About 年龄段/更正入口）接入；文案以 `terms.ts` 与 `pet.html`/`setup.html` 为准。**这不是官方身份证/实名核验**：不采集身份证、照片、住址，也无法证明真实身份。

| key | 中文（canon） | English | 位置/频次 | 实现状态 |
|---|---|---|---|---|
| `age.selfReport` | 这是你自报出生日期的年龄核验：不是官方身份证核验，也不等同实名认证，无法证明你的真实身份；请如实填写，虚假填写由你自行承担后果。 | This is a self-reported birth-date age check: **not official ID verification or real-name authentication**, and it cannot prove your real identity. Fill it in truthfully; false statements are your own responsibility. | 首启 Age 弹窗 / About 更正 | **已接**（`AGE_SELF_REPORT_NOTICE`） |
| `age.roleplay18` | 一般桌宠功能全年龄可用；角色扮演/情感陪伴（roleplay）仅限年满 18 周岁用户，未满 18 周岁不能启动角色扮演。 | General features are all-ages; role-play/emotional companionship is **18+ only**; under-18 users cannot start it. | 首启 Age 弹窗 / About / 角色扮演入口 | **已接**（`AGE_ROLEPLAY_POLICY` + `requestRoleplay` 门禁） |
| `age.data` | 出生日期只保存在本机（localStorage）并记录核验时间，不上传、不写日志；不采集身份证、照片、住址；可在 About 更正年龄，“删除全部本地数据”会一并删除年龄记录。 | The birth date is stored only on this device (localStorage) with the verification time; never uploaded or logged; no ID card/photo/address is collected. It can be corrected in About and is removed by "delete all local data". | 首启 Age 弹窗 / About | **已接**（`AGE_DATA_NOTICE` + `data-controls.ts` 删除键） |
| `age.decline` | 拒绝或取消年龄核验会进入安全只读/退出，不会静默跳过，也不能正常使用应用。 | Declining/cancelling age verification enters safe read-only mode or exits; it is never silently skipped and the app cannot be used normally. | 首启 Age 弹窗（拒绝按钮/Escape） | **已接**（`AGE_REQUIRED_BLOCKED_VIEW`） |
| `age.minors` | 未满 18 周岁仍可使用一般功能，但角色扮演会被阻止并提示原因；监护人可通过 novelnexusai@outlook.com 要求删除/举报。 | Under-18 users may still use general features, but role-play is blocked with a reason; guardians may contact novelnexusai@outlook.com to request deletion/reporting. | Age 弹窗 / About / CONSUMER | **已接**（`AGE_MINORS_NOTE`） |
| `age.correction` | 更正年龄会重新核验并清除当前角色扮演会话；如需继续 roleplay，需重新完成完整 TOS + 角色扮演声明与设定。 | Correcting the age re-verifies it and ends the current role-play session; continuing role-play requires the full TOS + role-play declaration and settings again. | About → 更正年龄 | **已接**（`requestAgeCorrection`） |
| `age.aboutBand` | 年龄核验（自报出生日期）：已核验 · 18 周岁及以上 / 未满 18 周岁（只显示年龄段，不显示完整生日）。 | Age verification (self-reported): verified · 18+ / under 18 (band only, never the full birth date). | About / setup.html | **已接**（`ageSnapshotView`，只显示年龄段） |

- **不得宣称**：官方身份证/实名核验、年龄识别、绝对阻止未成年人、监护人验证已具备；这些均未实现。
- **不得在日志/审计写出出生日期**：审计只记录动作/时间/自报标记；About/设置只显示年龄段。

## 3. 最小实现约束（工程侧，不含代码改动）

1. 上述文本集中在**一个文案模块**（如 `legal-texts`），UI/设置/导出/商店页仅引用 key，不各自复制（防止版本漂移）。
2. 每次改文本需回写本文并记录版本；`firstRun` 内容变更不强制重新弹窗，但 `rp.allAges`/`tts.enableConfirm`/`mod.loadConfirm` 变更须生效于下一次触发。
3. 免责声明确认与 AI 标识**不可被皮肤/主题/替换包遮挡**；截图/导出同样带标识。
4. 2h 计时以“连续使用”口径（无输入超过 10–15 分钟可视为中断，具体阈值工程可调，但不得借此规避提醒）；“稍后”只延迟本次，不关闭义务。
5. 危机卡片触发时暂停角色化输出与 TTS 朗读，优先展示资源；不得用角色口吻淡化或提供“保密”承诺。
6. 危机/未成年人/付费/隐私相关按钮不得使用暗黑模式（默认勾选同意、诱导点击、隐藏关闭）。
7. **实现优先于文案**：本节/§2A 未在运行时引用的 key 不得直接接进 UI 充数；接入前须有对应能力（如 ASR 同意、撤回入口、播放器标签）与测试；对外文本不得出现“已提供 X”而运行时无 X 的表述（R-P0-01/R-P1-05）。

## 4. 与法规的对应（摘要）

| 文本 | 依据 |
|---|---|
| `firstRun` / `ai.label.*` / `tts.*` | 《标识办法》显式/隐式标识；《深度合成规定》17 条；《拟人化办法》18 条 AI 身份提示 |
| `rp.allAges` / `minors.guardian` | 《拟人化办法》14 条；《未成年人网络保护条例》（全年龄口径；内容边界与未成年人保护要求保留） |
| `health.2h` / `health.dependency` | 《拟人化办法》10、18 条（不得诱导依赖/沉迷；每 2 小时提醒） |
| `crisis.card` | 《拟人化办法》13 条；12356/110/120 |
| `mod.loadConfirm` / `dlc.authorDuty` | 本项目 [DLC-AND-PLUGIN-TERMS](/legal/DLC-TERMS.md) §3–4；《民法典》1194–1197 通知规则 |
| `nonOfficial.*` | 《广告法》《反不正当竞争法》不得虚假/混淆；DeepSeek 无关联声明 |
| `userAgency.*` | 《人工智能拟人化互动服务管理暂行办法》8、10、18 条（不得诱导依赖/冒充自然人）；《民法典》（自担责任/侵权）、《广告法》《反不正当竞争法》（不得冒充官方/虚假宣传）；《未成年人网络保护条例》（全年龄内容边界仍适用） |
| `tts.exportLabel` | GB 45438-2025；导出内容显式+隐式标识 |

## 5. 仍待定（不得假装已定）

- 英文文案需法务/本地化复核（尤其“not affiliated”与免责措辞）。
- `health.dependency` 的触发阈值与是否可关闭（法定义务项 vs 体验项）待产品+律师。
- 语音服务商名称/计费展示格式待 TTS/ASR 供应商条款确认（DeepSeek 条款 TBD）。
- roleplay 当前已接**声明/设定门禁 + 退出通道 + 本地模板**，但**无自由 LLM 对话引擎**；发布前必须保持“仅本地模板”的如实标注，不得宣传已支持自由角色扮演。
- **年龄口径**：用户已更新为**一般功能全年龄可用、roleplay/情感陪伴仅限 18+**（`age.roleplay18`，2026-11-17.5）；首启自报出生日期核验（`age.selfReport`），非官方身份证核验；不得宣称实名/绝对阻止；未成年人保护与危机资源仍保留。
- **ASR 同意形式**：首次一次性 vs 每次上传短确认，须与实现/律师一致（建议每次启用+每次上传前确认）；当前无任何 ASR 告知。
- **音频/图片隐式标识格式**：C2PA / XMP / tEXt / IPTC 均 **TBD**，不得在未实现时宣称“已加元数据/已加 C2PA”。
- **撤回同意/全清**：入口已实现（2026-11-17，见 §2B）；但删除结果必须如实列出**残留/未核验**（TTS `quota` 无 Rust 清除命令、WebView2 配置目录），**Rust 侧补齐前不得写“全部数据已彻底清除”**；同意审计/审核记录均非证据级。
- **用户自行接入/自创用法（user-agency）**：官方不提供/不鼓励、无法监控或强制阻止、只尽合理提醒义务的**责任边界措辞**（尤其“不承担法律后果”的可执行性）待律师复核；`userAgency.*` 短文本未接入 UI，接入前只能以完整 TOS §六之二展示。

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-17 | 首版：18 组 key、展示规则 R1–R9、法规映射 | draft；待用户/律师/工程引用 |
| 2026-11-17 | 增补 §2A：`age.gate18`/`minors.adultOnly`/`asr.firstUse`/`asr.enableConfirm`/`asr.noConsent`/`privacy.*`/`ai.label.audio.player`/`ai.label.audio.start`/`health.2h.confirm`；标注实现状态（均未接）；`firstRun.body` 改工作助手定位并写明当前版本不提供 roleplay；R4/R5/R6 回写运行时现状；`minors.notice` 与成人向口径冲突待 A-14 | draft；工程未接、待用户/律师 |

| 2026-11-17 | 增补 §2B：数据控制（撤回/全清）与两类本地审核留痕 canon 文本；`privacy.withdraw`/`privacy.deleteAll` 实现状态由“未实现”改为“已实现（残留如实披露）”；同步 About 入口与工程测试 `tests/data-controls.test.ts`；仍待律师复核与 Rust 侧 quota 清除 | 工程已接；文案待律师定稿 |
| 2026-11-17 | 文档同步待办：`PRIVACY.md` §5/§16 与 `TOS.md` §9 的“撤回/全清未提供”现状句已过时，须由法务文档 owner 同步（改 TOS 文本需版本+哈希升级，本任务未改 TOS 版本） | open（文档 owner） |

> 草案，不是法律意见；不得用本文替代正式用户协议或隐私政策。

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-17.3 | 全年龄口径：R5/`firstRun.body`/`rp.allAges`/§2A/§3/§4/§5 移除年龄限制，改为全年龄内容边界 + 未成年人/监护人说明；新增角色扮演设定表单/独立声明说明；`rp.gate18`→`rp.allAges` | draft；角色扮演仅本地模板/声明与设定，不提供自由 LLM 对话 |
| 2026-11-17.5 | 增补 §2D：年龄自报核验与 roleplay 18+ 门槛短文本（`age.selfReport`/`age.roleplay18`/`age.data`/`age.decline`/`age.minors`/`age.correction`/`age.aboutBand`），全部已接入运行时；旧 `age.allAges`/`rp.allAges` 全年龄口径作废 | implemented；非官方身份证核验 |
| 2026-11-17.4 | 增补 §2C：`userAgency.short`/`.risk`/`.notOfficial` 短文本（官方不提供/不鼓励自由 LLM 情感陪伴与付费关系、自行接入须守法并自担后果、风险提示、不背书、保留举报/停止提供/删除权、只尽提醒义务、不承诺完全阻止）；完整 TOS 已新增 §六之二，短文本未接入 UI | draft；TOS 文本未经律师审核，短文本待接入/律师复核 |

# 律师复核前检查清单与未决法律问题（LAWYER-REVIEW-CHECKLIST）— 工程清单 · DRAFT

> **状态：DRAFT（engineering checklist）· 2026-11-19 · 不是法律意见，不是律师审查结论，也不是合规认证。** 本文件是工程/维护者提交执业律师复核前的**准备清单与问题清单**，不解决任何法律问题，不产生权利义务，也不代表律师已经介入：用户（PerryLink）2026-11-16 决定**律师审查暂缓**，截至本文件日期**没有**任何外部律师意见、批准或签署记录。
> **不得引用为**“已审核/已合规/已备案/已获法律意见/已通过律师复核”；也不得把本清单的任何条目当作批准。批准状态仍只以 [APPROVALS](/legal/APPROVALS.md) 的签字台账为准（当前 APPROVED = 0 行）。
> **与其他文档的关系**：本文件只做**索引、现状核对与问题登记**，不复制条款正文；条款 canon 以 [TOS](/legal/TOS.md)（应用内 `src/pet/consent/terms.ts`）、[PRIVACY](/legal/PRIVACY.md)、[TTS-TERMS](/legal/TTS-TERMS.md)、[LEGAL-BASELINE](/legal/LEGAL-BASELINE.md) 与 [USE-RESTRICTIONS-2026-11-19](/legal/USE-RESTRICTIONS-2026-11-19.md) 为准。冲突时以 canonical 来源与强制性法律为准。
> **关联**：[README](/legal/README.md)（优先级与文件索引）· [RELEASE-BLOCKERS](/legal/RELEASE-BLOCKERS.md) · [AI-LABELING](/legal/AI-LABELING.md) · [DECLARATION-MATRIX](/legal/DECLARATION-MATRIX.md) · [CONSUMER-MINORS-HEALTH](/legal/CONSUMER-MINORS-HEALTH.md) · `docs/plan/MASTER-BACKLOG-2026-11-19.md`（MB-120 / MB-122 的文档可做部分）。

## 0. 用途、边界与使用方法

1. **用途**：在请律师复核前，把「当前产品到底是什么行为」「哪些文本还未定稿」「哪些问题必须由 owner 或律师决定」集中到一页，避免律师在互相矛盾的文档上浪费时间。
2. **不是**：法律意见、合规意见、风险评估结论、发布批准、备案/安全评估材料；**不替代**律师对任何条文的独立判断。
3. **怎么用**：先读 §1 的现状事实，再按 §2 的问题表逐项问律师或由 owner 拍板；§3 是工程/owner 在见律师**前**应补齐的事实与证据；§4 是复核会需要的材料；§5 是复核前不得对外宣称的事项。
4. **状态语义**：`[现状]`=代码/发行物可验证的行为（附路径）；`[目标]`=尚未实现、不得当作已实现；`[待决定]`=需 owner 或律师裁量；`[律师]`=必须由执业律师给出书面意见。
5. **本文件的维护**：只追加日期与变更，不改写历史结论；新增法律问题必须给 ID、负责人（owner/律师）与是否阻断发布。**不得**在本文件里写“律师已同意/已审核”。
6. **证据基线（2026-11-19 本机实测，非承诺）**：`node scripts/legal-check.mjs --strict` → `BLOCKED (34 blocker(s), 34 warning(s))`、exit 1（34 条 blocker 是 warning 在 strict 下被复制，不是 34 个独立问题）；`node --test tests/use-restrictions.test.ts` → 3/3 pass；`npm test` / `npm run typecheck` 由发布 owner 复跑。数字会随代码变化，复核前必须重测并以输出为准。

## 1. 当前产品事实（代码为准，2026-11-19 HEAD 静态核对）

> ⚠️ **文档顺序**：本节描述的是**当前实现**，不是目标态。凡标 `[目标]` 的，复核前不得对外写成已实现。

| # | 主题 | 当前实现事实 | 证据/路径 | 备注 |
|---|---|---|---|---|
| 1 | famling 桌面端对话 | **无自由 LLM 对话**：无 chat-completion 调用点；roleplay 入口只提供本地模板/声明/设定，不伪造聊天引擎 | `src/pet/consent/terms.ts`、`src/pet/trust.ts`、`src/pet/main.ts` 注释与实现；`tests/roleplay*.test.ts` | 对外只能写“仅本地模板，不提供自由 LLM 对话” |
| 2 | dsh-famling 插件对话 | **有真实 LLM 文本聊天**：`op:"chat"` → DSH Host `ctx.llm.stream`；provider/model 来自 DSH 默认模型或插件 Config；输入文本会发往对应模型供应商 | 插件仓 `index.js`（`ctx.llm.stream`）、`client.js`；插件 `docs/LEGAL-NOTICE-2026-11-18.md` §1.1 | 不能写“插件不提供自由 LLM 对话”；准确写法是“不提供角色扮演/情感陪伴，聊天为普通 AI 回复”；插件 LEGAL 的适用版本号已漂移（见 §3-9） |
| 3 | 年龄核验与 roleplay | 一般功能全年龄可用；roleplay/情感陪伴仅限 18+；首启**自报出生年/月/日**（不预填、无默认；非官方身份证/实名核验，可被虚假自报或修改绕过）；未核验/未满 18 被阻止且不展示设定表单 | `src/pet/consent/age.ts`、`gate.ts`（`runRoleplayPrompt` 先年龄门再 TOS/声明） | 不得宣称实名核验、年龄识别、绝对阻止未成年人、监护人验证 |
| 4 | **首启顺序：当前 vs D6 目标** | `[现状]` **年龄自报核验 → 完整 TOS → 应用**（`gate.ts runBootstrap` 注释 “ORDER IS A HARD CONTRACT”）<br>`[目标]` **D6**：TOS/关键事实**先读**，年龄只在 age-gated 功能入口做（数据最小化/合规）——**已排期、未实现** | `src/pet/consent/gate.ts`（age 在 TOS 前）、`docs/plan/MASTER-BACKLOG-2026-11-19.md` D6 | ⚠️ 任何文档不得把 D6 目标写成当前实现；TOS/PRIVACY 现有描述的是当前顺序；D6 实现需改代码 + TOS 版本/哈希，不在本任务范围 |
| 5 | TOS/声明版本 | 应用内 canon `terms.ts`：TOS `2026-11-17.6`、TTS `2026-11-17.4`、ASR `2026-11-17.3`、ROLEPLAY `2026-11-17.4`；`docs/legal/TOS.md` 与 TTS-TERMS 的 pin 必须与之一致（tests 锁定） | `src/pet/consent/terms.ts`、`docs/legal/TOS.md`、`tests/consent-actions.test.ts`、`tests/legal-user-agency.test.ts` | 改条款正文必须 bump 版本+重算哈希+强制重新同意；本清单不重复哈希值 |
| 6 | TTS 同意 | TTS 声明独立于 TOS；按会话+配置签名生效；开启/切换 provider/音色/云本地/音量/新会话会再次确认；确认不持久化 | `src/pet/consent/tts.ts`、`gate.ts ensureTts`、`tests/consent-*.test.ts` | 见 [TTS-TERMS](/legal/TTS-TERMS.md) §2A |
| 7 | ASR 同意 | **ASR 独立声明 + 单独同意已实现**：TOS/TTS 同意不能替代；未确认不调用 `getUserMedia`、不录音、不上传；拒绝/错误 fail-closed；按会话+配置签名重新确认；录音 ≤60s、WAV ≤8 MiB，经 Tauri 代理上传 `api.deepseek.com/v1/tools/asr` | `src/pet/consent/asr.ts`、`gate.ts ensureAsr`、`src/pet/main.ts beginTalkWithAsrConsent`、Rust `voice_asr`、`tests/consent-asr.test.ts` | **仍缺**：独立常驻开关、日配额/费用提示、供应商留存/跨境书面条款（见 PRIVACY §7、TTS-TERMS §2C） |
| 8 | 数据控制 | **撤回同意 + 删除全部本地数据已实现**（二次确认、逐项核验、进入安全只读）；无法核验的 Rust 残留（TTS `quota` 计数、WebView2 配置目录等）会如实列**残留/未核验**，不谎报完全清除 | `src/pet/consent/data-controls.ts`、`runtime.ts`、`tests/data-controls.test.ts` | 对外不得写“已彻底删除全部数据”；卸载清理说明仍属工程待办 |
| 9 | 远程内容市场 | **默认不联网**：无注入 transport 时 `transport-unavailable`，构造与导入不发起任何请求；famling 内容中心市场 tab（task-75/MB-086 后）显示“服务器未配置 · 默认不联网”，只有用户显式点击刷新且宿主注入 transport 时才可能联网 | `src/pet/content-market.ts`（transport 默认 null、无全局 fetch 回退）、`src/pet/content-hub.ts` 市场 tab | `[目标/未来数据流]` 若启用：HTTPS 拉取目录/内容包 → Ed25519 验签 + 逐文件 sha256 + 防回滚 → 本地安装；无账号/无遥测，标准 HTTP 元数据（IP/UA）由承载传输暴露；详见 PRIVACY §2B |
| 10 | AI 生成内容标识 | 用户 2026-11-18 决定**移除界面常驻 AI 角标**；现为流程内提示（首启 TOS/年龄核验、About/「声明」面板、TTS 独立声明与 TOS 三之二）；汀岚 256 的 49 张 PNG 已嵌入 PNG `tEXt`（`scripts/embed-ai-labels.mjs`、`tests/ai-label.test.ts`）；**无** C2PA/XMP、**无**音频播放器标签/首播提示、**无**导出标识；`legal-check` 不检查图片/音频标识 | [AI-LABELING](/legal/AI-LABELING.md) §0/§2026-11-17 更新；`scripts/embed-ai-labels.mjs` | 显著性是否满足《标识办法》须律师判断；不得宣称“标识已闭环/已合规” |
| 11 | 网络出站点（famling） | 云 TTS/ASR（用户显式同意后）、导入公开 DeepSeek 分享（读取公开 share 内容）、Sentry（默认关、aquarium opt-in）、远程市场（当前默认不联网、未配置 transport 即零请求）；其余本地 | `src/voice/*`、`src/pet/chat-import/*`、`src/observability.ts`、`src/pet/content-market.ts` | 不得笼统写“完全不联网”；也不得写“已上云服务” |
| 12 | 数据存储 | 存档/记忆本机加密（DPAPI/AES-GCM，加密不可用拒写）；偏好/同意/审计/导入摘要 localStorage 明文；TTS WAV 缓存+quota；Advisers Pet Brief 只读不落盘（5 分钟 TTL/失焦 30s 清空）；遥测默认关闭 | `src/pet/crypto.ts`、`src/pet/consent/*`、`src/pet/main.ts` Advisers 段、`src/observability.ts` | 保留期/删除/撤回以 [PRIVACY](/legal/PRIVACY.md) 为准；本地数据删除无法远程执行 |
| 13 | 记忆开关 | “关闭记忆”**当前无实现**（记忆在互动动作时自动写入）；文档不得写成已具备 | `src/kernel/pet.ts`、PRIVACY §9 | [工程待办] 实现或改文案 |
| 14 | 插件（dsh-famling）数据流 | 聊天经 DSH Host 发往模型供应商（插件不落盘、无服务端日志/账号/遥测；0.10.2 设置内有「AI 聊天」开关，危机关键词本地短路不调模型）；TTS 用浏览器 `speechSynthesis`；ASR 用浏览器 `SpeechRecognition`（音频可能发送给浏览器厂商，插件不接收音频文件）；本机 localStorage 存设置、一次性首启确认与 TTS/ASR 同意；设置内「清除本机设置与同意」可删除 `dsh-famling/*` 键；远程市场仅占位不联网 | 插件仓 `index.js`/`client.js`、`docs/LEGAL-NOTICE-2026-11-18.md`（2026-11-19.2，适用 0.10.2）§1/§3 | 插件仍无年龄门、无版本化同意记录、无独立 About/法律页、无逐条/播放 AI 标签（见 §3-9）；famling 与插件是**两套数据流**，不得用一份文本互相套用 |
| 15 | 许可状态 | 代码 PolyForm Noncommercial 1.0.0（源可见、非 OSI 开源；商用需另签）；美术方向 CC BY-NC-SA 4.0；`LICENSE-ART`/`NOTICE`/多份法律文档仍 DRAFT；Pearl/Pixiv CC0/相似性/TTS 再分发/商标检索等外部权利未清 | [APPROVALS](/legal/APPROVALS.md)、[RELEASE-BLOCKERS](/legal/RELEASE-BLOCKERS.md)、根 `NOTICE`/`LICENSE-ART` | 不得宣称“开源/已生效许可/已清权” |
| 16 | baked 语音 | 42 个 WAV（21 `stella` 默认 + 21 `tide` 可选）随包缓存：用户 2026-11-17 授权 baked pack；**不是** DeepSeek 书面再分发许可；`legal-check` 校验 42/42 bytes+sha256 | `public/assets/voice/pet/manifest.json`、`scripts/legal-check.mjs`、[TTS-TERMS](/legal/TTS-TERMS.md) §3A、`AI-PROVENANCE.md` §10 | 旧文档写“18 WAV/不随包”已过时（见 §3-10） |

## 2. 未决法律问题（需 owner 决定或律师书面意见）

> 说明：本表是**问题索引**，不是答案；`阻断发布` 只表示在对外发布/收费/上架前需要闭环，不代表内部开发不能继续。优先级沿用 MASTER-BACKLOG（P0 阻断可信发布/用户数据/信任链）。

| ID | 问题 | 当前默认/现状 | 为什么需要决定 | 决策方 | 阻断发布 |
|---|---|---|---|---|---|
| LQ-01 | 处理者主体与生效日期：个人 PerryLink 还是未来公司？隐私政策/服务条款的生效主体、地址、联系方式、生效日期 | 文档写“个人项目、非公司；生效日期无、草案” | PIPL 告知主体、消费者合同相对方、投诉/诉讼对象 | owner + 律师 | 是 |
| LQ-02 | TOS/PRIVACY/AI 标识/许可文本定稿：哪些文本可以对外生效、版本与同意机制是否满足“知情—同意” | 全部 DRAFT；TOS 应用内已强制同意但文本未经律师 | 条款效力与免责边界；版本升级强制重新同意是否足够 | 律师（+owner 签发） | 是 |
| LQ-03 | 年龄核验方案：自报出生日期（非实名、可绕过）是否足以支撑 roleplay 18+ 门禁？是否必须实名/年龄识别？ | 自报 DOB + 18+ 门禁已实现；无未成年人模式/监护人验证 | 未成年人保护义务与虚假自报风险；实名核验又涉及敏感个人信息最小化 | owner + 律师 | 是（roleplay 对外） |
| LQ-04 | **首启顺序（D6）**：TOS/关键事实是否必须先于出生日期收集？当前“年龄→TOS”是否构成过度收集/告知不充分？ | `[现状]` 年龄→TOS；`[目标]` D6：TOS/关键事实先读、年龄只在 age-gated 入口——**未实现** | 数据最小化与同意有效性；改序需改代码 + TOS 版本/哈希 | owner + 律师 + 工程排期 | 建议发布前 |
| LQ-05 | TTS/ASR 第三方与跨境：DeepSeek 留存/训练/处理地/DPA；敏感个人信息（声纹）单独同意的形式；数据出境安全评估是否触发 | ASR 独立声明+同意已实现；供应商条款/留存/跨境**TBD**；无 DPA | PIPL 28/29、38/39；平台条款 | 律师 + 供应商书面（R） | 是（云语音） |
| LQ-06 | 42 个 baked DeepSeek TTS WAV 的再分发/商用/署名条款 | 用户 2026-11-17 授权随包；**无** DeepSeek 书面再分发许可 | 版权/邻接权与平台条款风险；用户授权不等于服务商许可 | 律师 + DeepSeek 书面（R） | 是（公开发布） |
| LQ-07 | 远程市场未来数据流：启用联网后谁告知/同意、是否需更新隐私政策、下载器由谁承载、传输层暴露哪些数据 | 当前**默认不联网**（无 transport 零请求）；未来走宿主注入 transport + Ed25519/逐文件 sha256/防回滚；无账号/无遥测 | 隐私政策须描述未来实际数据流；“预留接口”不等于已合规 | owner + 律师 + 工程 | 启用联网前 |
| LQ-08 | AI 标识显著性：移除界面常驻 AI 角标后，流程内提示 + PNG tEXt 是否满足《标识办法》/GB 45438“显著”要求？图片/音频/导出缺口的补救方式 | 无常驻角标（用户 2026-11-18 决定）；无 C2PA/XMP、无音频首播提示、无导出标识 | 行政合规风险；平台申报口径 | 律师 + owner | 是（对外发布图/音频/上架） |
| LQ-09 | 拟人化互动办法适用范围：工作助手定位能否主张“不涉及持续性情感互动”而排除/降低义务？roleplay 入口（仅本地模板）是否触发安全评估/算法备案/人工接管等条件？ | 定位“工作助手类本地工具”；roleplay 仅本地模板；触发条件未评估 | 一旦被认定适用，义务与发布形态（本地免费工具 vs 运营服务）不同 | 律师（+owner 产品形态） | 是（触发即升级） |
| LQ-10 | 插件（dsh-famling）责任分层：插件聊天经 DSH 模型供应商，谁承担告知/同意/内容安全义务？插件无年龄门、浏览器 TTS/ASR 供应商条款、DSH 宿主条款冲突时如何排序 | 插件 LEGAL 说明已做责任分层（PerryLink/用户/DSH/模型供应商/浏览器）；缺口见 §3-9 | 两端文本与责任边界必须一致；不得把宿主/供应商义务写成自己的或反之 | 律师 + owner + 插件 owner | 是（插件公开发布） |
| LQ-11 | 未成年人：无未成年人模式/监护人验证；14 岁以下不处理个人信息的工程落地；roleplay 禁止如何证明；监护人请求删除的可行边界 | 一般功能全年龄、roleplay 18+；无未成年人模式/监护人验证；本机数据无法远程删除，须如实告知 | 《未成年人网络保护条例》《拟人化办法》第 14 条等 | 律师 + owner | 是（面向未成年人宣传/上架） |
| LQ-12 | 许可文本生效：PolyForm NC 1.0.0/CC BY-NC-SA 4.0 方向是否可对外、`LICENSE-ART` 去 DRAFT 条件、Pearl/Pixiv CC0/相似性/商标检索 | 文本 DRAFT；权利链未清；律师审查暂缓 | 对外分发/商业化前提；CC 许可不得额外限制 | 律师 + 权利人 | 是 |
| LQ-13 | 安全事件通知：PIPL 等法定期限/对象/内容；内部响应流程是否满足 | 内部流程有，无对外承诺/时限/渠道 | 泄露通知义务；不得延迟/隐瞒 | 律师 | 是（上线运营） |
| LQ-14 | 消费者条款：免费 v1 的退款/投诉/响应时限如何写；未来收费/订阅/自动续费条款；投诉渠道与 12315 口径 | 固定“免费、无内购/自动续费、无广告”；退款框架草案；内部响应目标非承诺 | 消费者权益与广告法；收费才触发退货/续费条款 | 律师 + owner | 收费前 |
| LQ-15 | 侵权/下架/反通知：通知—初审—临时下架—申辩的时限与“错误通知”责任；避风港适用 | 流程草案；不承诺法定时限 | 民法典 1194–1197；平台规则 | 律师 | 是（公开分发） |
| LQ-16 | 自由 LLM 自创用法（user-agency）：官方“不提供/不鼓励/反对”的表述是否足以免责？用户自行接入第三方模型/客户端后的责任边界；修改版删除门禁时官方责任 | TOS §六之二已写；文本未审 | 免责边界与平台条款；不得给第三方强加义务 | 律师 | 建议发布前 |
| LQ-17 | 商店/平台申报：Steam 生成式 AI 问卷（预生成/实时分列）、IARC/年龄分级、Apple/Google AI 数据披露、中国应用商店/网信核验 | 未上架/未申报；口径未定 | 虚假申报风险；分级与内容一致性 | owner + 律师 | 上架前 |
| LQ-18 | 数据出境：云 ASR/TTS 是否触发安全评估/标准合同/认证；境外发行时的 GDPR/代表等 | 供应商处理地 TBD；无评估 | PIPL 38–40、GDPR | 律师 | 云语音对外/境外发行前 |
| LQ-19 | “无法核验的 Rust 残留如实列出”是否满足删除权告知；卸载/换机/共享电脑的清理说明 | 删除全部已实现并披露残留（quota/WebView2）；卸载清理未做 | PIPL 47 删除义务的实现边界 | 律师 + 工程 | 是（隐私政策生效前） |
| LQ-20 | 声音权/拟人化边界：合成音色（非克隆）与“汀岚”角色关系；不得冒充真人的表述是否足够；音频 AI 标识 | 非克隆；角色为原创虚构；音频标识未落 | 民法典 1023 声音参照肖像权；深度合成规定 | 律师 | 发布音频前 |

## 3. 律师复核前，工程/owner 必须先补齐或核实的事实

> 这些不是法律意见，而是“别拿不准确的事实去问律师”的核对项。完成状态以代码/命令输出为准，不以文档声称。

| # | 事项 | 当前状态 | 复核前动作 | owner |
|---|---|---|---|---|
| 3-1 | TOS/声明版本与镜像一致 | TOS `2026-11-17.6`、TTS `2026-11-17.4`、ASR `2026-11-17.3`、ROLEPLAY `2026-11-17.4`；tests 锁定 | 改任何条款正文必须 bump 版本+哈希+重新同意；跑 `npm test` 相关用例 | 工程 |
| 3-2 | **D6 首启顺序** | `[现状]` 年龄→TOS；D6（TOS/关键事实先读）**未实现** | 先让 owner 拍板 D6 是否做；做则改代码 + bump TOS 版本/哈希；在此之前文档必须分别标注“现状/目标” | owner + 工程 |
| 3-3 | TOS 正文内联统一使用限制 | **未做**：`src/pet/consent/terms.ts` 未含 canonical 短句；应用内 TOS 弹窗暂未内联该限制（USE-RESTRICTIONS §6/§9 已披露） | 需 owner 决定是否内联；内联会 bump TOS 版本并要求既有用户重新同意（跨模块决策） | owner + 工程 |
| 3-4 | ASR 独立开关/日配额/费用提示 | 声明+单独同意+拒绝不上传已实现；独立常驻开关、日配额/费用提示未实现 | 补齐或改文案；补齐前不得宣传“可随时关闭/有配额” | 工程 + owner |
| 3-5 | AI 标识缺口 | 无 C2PA/XMP、无音频播放器标签/首播提示、无导出标识、图片角标未落；`legal-check` 不检查图片/音频 | 先定显著性口径（律师）再实现；未实现前不得宣称“已标识/已合规” | 工程 + 律师 |
| 3-6 | 42 WAV 再分发权 | 用户授权随包；DeepSeek 书面再分发许可缺（TBD） | 取得书面结论或替换/移除；旧 `artifacts/`/安装包残留须清理核验 | owner + 权利人 + 工程 |
| 3-7 | 隐私政策/数据流一致性 | 本仓库文档已按 2026-11-19 代码事实修正（ASR/撤回/删除全部/42 WAV/市场默认离线/插件边界）；仍无生效隐私政策 | 律师定稿前不得对外发布；工程每次改数据流必须回写 PRIVACY | 工程 + 律师 |
| 3-8 | 发布门禁与安装包 | `legal-check --strict` 2026-11-19 实测 34 blockers/34 warnings（均为 DRAFT/portable 缺件等 warning 复制；无 hard blocker 文件缺失）；portable/安装包资源/licensePage/未签名仍为阻断 | 发布前跑命令、以输出为准；不得把 gate 转绿当合规证明 | 发布 owner |
| 3-9 | 插件仓两端口径 | **2026-11-19 已更新**：插件 LEGAL 版本 2026-11-19.2、适用 0.10.2；首启卡/清除与撤回/AI 聊天开关/危机本地短路已落地；仍缺独立 About/法律页、逐条/播放 AI 标签、版本化同意记录、简报 private 折叠（插件 LEGAL 已如实列缺口） | 由插件 owner 在后续版本继续补；famling 文档不复制插件条款，仅记录两端边界 | 插件 owner |
| 3-10 | 文档自身漂移 | 2026-11-19 已修正：旧“18 WAV/不随包”“全年龄、不设年龄门”“ASR 无告知/同意”“撤回/删除全部未实现”“gate 16”“TOS 2026-11-17.5”等过时句（见各文件变更记录与根 DECLARATIONS/NOTICE） | 复核前再跑一次 grep/命令核对；历史 review 文档保持原样并标注“历史记录” | 文档 owner |
| 3-11 | 证据命令 | `node scripts/legal-check.mjs --strict`；`node --test tests/use-restrictions.test.ts`；`npm test`；`npm run typecheck`；`node scripts/release-win.mjs --verify`（如适用） | 把命令+输出+commit 写入复核材料；不得手写/猜测哈希 | 工程 |

## 4. 提交律师复核时的材料清单

1. **文本**：`docs/legal/README.md`（优先级/索引）、`TOS.md`（版本+哈希）、`PRIVACY.md`、`TTS-TERMS.md`、`AI-LABELING.md`、`AI-CONTENT-POLICY.md`、`LEGAL-BASELINE.md`、`CONSUMER-MINORS-HEALTH.md`、`USE-RESTRICTIONS-2026-11-19.md`、`APP-DISCLOSURE-TEXTS.md`、`RELEASE-BLOCKERS.md`、本清单；根 `NOTICE`/`LICENSE`/`LICENSE-ART`/`LICENSE-COMMERCIAL.md`/`DECLARATIONS.md`。
2. **代码事实**：`src/pet/consent/**`（terms/gate/age/asr/tts/roleplay/data-controls）、`src/pet/main.ts`（TTS/ASR/Advisers 接线）、`src/voice/**`、`src/pet/content-market.ts`、`src/pet/content-hub.ts`、`src/pet/chat-import/**`、`src/observability.ts`。
3. **测试与命令输出**：§3-11 的命令与结果（写明日期与 commit；不贴凭据、不贴用户数据）。
4. **第三方条款**：DeepSeek TTS/ASR/开放平台条款（版本+日期+URL）、OpenRouter/OpenAI Images、DSH 宿主条款、Advisers 条款、浏览器/系统语音条款。
5. **权利材料**：42 WAV 授权记录、Pearl/Pixiv/CC0 逐文件清单、AI provenance、字体/依赖清单、商标检索（未做则如实写）。
6. **问题表**：本文件 §2，按“需律师/需 owner/需工程”分类；律师意见回来后回填结论（不得代写/倒签/伪造）。

## 5. 律师复核前不得对外声称的事项（红线）

- 不得称“已获律师审核/已合规/已备案/已通过安全评估/已获官方授权/已注册商标”。
- 不得称“隐私政策已生效”“TOS 已生效”“许可已生效”“已清权”“音频再分发已获许可”。
- 不得称“已实现实名/官方身份证年龄核验”“已绝对阻止未成年人”“有未成年人模式/监护人验证”。
- 不得称“已上线/已发布/已签名/可公开分发”（证书/签名/发布通道未就绪时）。
- 不得把 `[目标]`（D6、隐式/导出/音频标识、独立 ASR 开关、远程市场联网等）写成已实现。
- 不得在应用内/README/商店页删除或弱化统一使用限制、AI 披露、非官方声明与安全门禁；不得提供去标识能力。

## 6. 未决问题登记流程

1. 新问题：在本文件 §2 追加 ID（LQ-NN），写清现状/证据、决策方、是否阻断发布。
2. 得到 owner 决定：在 [APPROVALS](/legal/APPROVALS.md) 追加 `RECORDED` 行（用户决定不=批准，不解除阻断）；本文件可更新“当前默认”，但**不改写历史**。
3. 得到律师书面意见：由 owner 归档原件（邮件/签名文件/文号），在 APPROVALS 追加 `APPROVED` 行并写范围/版本/条件/撤销方式；本文件只留链接与日期，不复制可能被断章取义的结论。
4. 文本变化：bump 版本/哈希（如涉及 TOS/声明）、重跑测试、`node scripts/legal-check.mjs --sync` 重生成 `public/legal/` 副本，再更新本清单。

## 7. 版本记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-11-19 | 首版：现状事实（含 famling 无自由 LLM / 插件有真实 LLM / TTS·ASR 单独同意 / 删除全部 / 市场默认离线 / 42 WAV / 年龄→TOS 现状与 D6 目标分开标注）+ 20 项未决法律问题 + 复核前核对清单 + 材料清单 + 禁止宣称事项 | DRAFT 工程清单；非法律意见；待 owner/律师 |

> **本文件不是法律意见，不构成律师审查、合规认证或任何批准；不得引用为“已审核/已合规/已获法律意见”。** 律师意见到位后，本文件只作为索引回填，不替代律师意见原件。

# Advisers 外在人格（famling / dsh-famling）法律与合规风险研究

> **Status: DRAFT（工程/产品合规研究）· 2026-11-18 · 不是法律意见，不构成律师意见或合规认证。**
> 作者：团队任务 task-2（legal-risk 子代理）。本文件用于产品设计、TOS 拟稿与发布前检查；**不产生免责效果**，不得对外表述为「已合规 / 已获律师审核 / 已备案」。
> 适用：`desktop-games`（famling 桌宠层，私有开发仓）、公开仓 `PerryLink/famling`、DSH 插件 `dsh-famling`、以及用户自建 **Advisers**（独立仓 `PerryLink/advisers`）被 famling 作为「外在表现 / 人格外壳」使用的场景。
> 事实时点：2026-11-18（Asia/Shanghai）。法规与平台条款检索日期 2026-11-18；**发布/收费/上架/面向公众前必须由执业律师复核并重新核验官方原文**。
> 阅读基线（只读）：`docs/legal/` 下 TOS.md、AI-LABELING.md、AI-CONTENT-POLICY.md、CONSUMER-MINORS-HEALTH.md、PRIVACY.md、APP-DISCLOSURE-TEXTS.md、RELEASE-BLOCKERS.md、SAFETY.md、TAKEDOWN-AND-REPORTING.md、LEGAL-BASELINE.md；`src/pet/consent/terms.ts`（canon，本任务只读）；`plugins/dsh-famling/README.md`、`docs/DETAIL.md`、`index.js`、`client.js`；`plugins/advisers/README.md`、`docs/TOS.md`、`docs/DISCLAIMER.md`、`docs/SAFETY.md`、`docs/PRIVACY.md`、`docs/pet-brief/schema-v0.2.json`。
> 关联产出：`plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md`（本任务新建的插件专用法律说明）。

## 0. TL;DR（结论先行）

1. **必须分层看责任**：Advisers 核心（用户自建、本地优先、`~/.advisers`、当前 LICENSE = PolyForm Noncommercial 1.0.0、TOS v2026.11.2）≠ famling 桌宠/人格外壳（PerryLink 的桌宠层）≠ `dsh-famling`（PerryLink 的 DSH 客户端插件）≠ 模型/语音/识别供应商（DeepSeek、浏览器厂商、系统 TTS）。人格外壳**不改变**各层责任主体；把「外壳」当成一个新的服务提供者，只有在它向他人提供生成式 AI / 拟人化互动内容时才成立。
2. **法律定性取决于「谁向谁提供什么」**：仅本人本机使用，主要是工具、著作权、个人信息自决与消费者问题；**向不特定公众提供**生成式 AI 内容，可能落入《生成式人工智能服务管理暂行办法》；提供**持续性的情感互动**，可能落入《人工智能拟人化互动服务管理暂行办法》；合成人声/拟人对话未标识，落入《深度合成规定》《标识办法》。**把外壳用于对外冒充本人/员工/客服/专业人士，是最高风险场景，必须明令禁止。**
3. **当前产品事实要写准**：famling 桌面端的 roleplay 仅本地模板（无自由 LLM）；但 `dsh-famling` 的 `op:"chat"` 是**真实 LLM 对话**（经 DSH Host 的 `ctx.llm.stream`，provider/model 来自 DSH 默认模型或插件配置），并且系统提示词带拟人角色。对外文案不能因为「桌宠是本地小挂件」就回避「聊天会发给模型服务商」这一数据流（见 §1.1、§5）。
4. **最高风险（按现实现状）**：① 用户把自建 Advisers 人格用于**对外专业服务/客服/客户接待**（冒充、专业建议、广告、消费者、备案/评估）；② **Advisers 简报上屏**含客户/同事个人信息，屏幕共享或共享电脑泄露（R6）；③ **声音合成/克隆**用于冒充真人、诈骗（R7）；④ **未成年人**接触拟人化情感互动（R5）；⑤ 分发后被 **fork 换皮、移除声明/标识**（R8）；⑥ **PolyForm NC 被商业使用**（R9）；⑦ 标识不足导致**平台下架**（R11/R10）。
5. **现有防御不是零**：桌面端已有 TOS 同意门（版本+哈希强制重同意）、自报年龄核验 + roleplay 18+ 门禁、TTS/ASR 独立确认、2 小时提醒、危机资源、安全规则与 `safety_check`、隐私最小化与「删除全部本地数据」；Advisers 有本地优先/无遥测、Pet Brief 只读、已脱敏的契约（secrecy≥2 整项排除、`displayPolicy`、TTL）；`dsh-famling` 有同源 owner-only bridge、客户端不放 Key、TTS/ASR 独立同意开关。
6. **最大缺口**：① 没有「用户自建人格 + 对外提供服务」的条款与产品边界；② `dsh-famling` 无首启告知、无 About/危机资源、brief 未按 `displayPolicy: private` 折叠/隐藏、未校验 `expiresAt`；③ 人格配置（名字/头像/声音）没有「真人/专业身份/克隆」门禁；④ TOS 没有《标识办法》第 8 条要求的「标识方法与样式」；⑤ 商业使用/再分发/商店申报无流程；⑥ 未成年人（尤其 <14）在聊天形态下未处理。
7. **防御优先顺序**：先「禁与说」（禁止用途 + 首启告知）→ 再「标识 + 危机转介」→ 再「数据最小化 + 导出/删除」→ 最后「年龄门/未成年人模式/对外服务模式」。理由：前两类是低成本、可立即落地、直接对应监管与平台规则的硬要求；后两类依赖产品能力和律师意见。
8. **TOS 修改必须走 canon 管线**：`src/pet/consent/terms.ts` 是唯一 canon；任何实质修改要 bump `TOS_VERSION`、重算 `TOS_HASH`、同步 `docs/legal/TOS.md` 镜像、`public/legal/` 打包副本、测试固定值，并重建发行包。本文件只给「拟新增/替换条款」，**不直接改 terms.ts / TOS.md / 测试**（见 §4）。
9. **`dsh-famling` 需要单独法律说明**：它的能力、数据流、许可与责任边界与桌面 app 不同（真实 LLM 聊天、浏览器 TTS/ASR、Advisers 简报读取、DSH Host 的 Key/模型）。本任务已产出 `plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md`。
10. **本文件不编造实测**：所有「现有措施」均为 2026-11-18 静态阅读代码/文档所得（未实机复测、未做红队）；所有法规链接为公开官方来源；未逐条核验《广告法》《消费者权益保护法实施条例》《未成年人网络保护条例》全文原文（引用项目既有研究结论，须律师复核）；`GB 45438-2025` 全文未读，仅引用项目文档结论。

## 1. 场景与角色边界

### 1.1 事实基线（谁在提供什么）

| 层 | 组件/仓库 | 当前许可 | 角色/能力（2026-11-18 静态事实） | 数据位置 | 法律角色（初步） |
|---|---|---|---|---|---|
| L0 上游 | DeepSeek 开放平台（默认模型/TTS/ASR）；浏览器语音识别厂商；系统/浏览器 TTS | 各供应商条款 | 模型推理、语音合成、语音识别 | 供应商侧（留存/跨境以其披露为准，当前 TBD） | 各自的服务提供者/处理者；开发者须遵守其条款（如 DeepSeek 开放平台协议 3.5/3.7/4.1） |
| L1 核心 | `PerryLink/advisers`（用户自建/部署） | **PolyForm Noncommercial 1.0.0**（2026-11-18 读取仓内 LICENSE；旧研究记录的 MIT 已过时） | 本地优先的 AI 工作助手：账本、简报（Pet Brief）、模型调用、Office/CLI；TOS v2026.11.2、SAFETY、PRIVACY | `~/.advisers`（SQLite 默认不加密）；出网仅用户启用的模型/研究/邮件/同步等 | 用户（部署者）通常是处理者/运营者；PerryLink 是发布者、不接触本机数据（Advisers PRIVACY §2） |
| L2 人格外壳 | famling 桌宠层（`desktop-games`，公开仓 `PerryLink/famling`） | 代码 PolyForm NC；美术 CC BY-NC-SA 4.0 | 像素桌宠、互动动作、TTS/ASR、roleplay（**仅本地模板/声明/设定，无自由 LLM**）、Pet Brief 消费、AI/非官方/年龄/健康告知 | 本机存档/记忆（加密）；TTS 缓存；同意审计（localStorage） | PerryLink 是外壳发布者；用户是自己那一份运行实例的运营者；**若用户对外提供服务，用户是服务提供者** |
| L3 插件形态 | `dsh-famling`（DSH 客户端插件） | PolyForm NC；美术同 L2 | 左下角汀岚入口；`op:echo` 本地回显、`op:chat` **真实 LLM**（DSH Host `ctx.llm.stream`）、`op:brief` 只读 Pet Brief 投影、`op:task`/`task-delete` DSH 定时器；浏览器 TTS/ASR；**无 roleplay 入口** | 浏览器 localStorage（settings/consent）；brief 不落盘；聊天文本经 Host 发往模型供应商 | PerryLink 是插件发布者；DSH 宿主/模型由用户配置；**聊天内容对外发送的事实必须向用户披露** |
| L4 DSH 宿主 | 用户安装的 DeepSeek Harness | 上游/宿主条款 | 提供 `ctx.llm`、默认模型选择、同源鉴权、schedule 服务；Key 只在 Host | 宿主侧会话/日志（以 DSH 条款为准） | 用户/宿主运营者；PerryLink 不是 DSH 所有者，也不接收插件运行数据 |
| L5 用户自建人格 | 用户对 Advisers/famling 的配置：名字/称呼/头像/声音/系统提示/记忆/知识/对外话术 | 用户内容；受 L1/L2 许可与政策约束 | 可以把「工作助手」延伸成拟人化外壳；**也可能被用于对外服务** | 本机 | **用户对自己创建的人格内容与用途负责**；PerryLink 对官方发布物/默认文案/品牌负责；供应商对其服务负责 |
| L6 交互对象 | 用户本人、同事、客户、患者/学生、未成年人、直播/视频观众、公众 | — | 决定是否构成「向公众提供服务」、是否涉及专业服务/广告/未成年人保护 | — | 场景决定监管强度：S1 个人 → S3 对外服务风险最高 |

> 许可口径提醒：`PolyForm Noncommercial 1.0.0` **不是 OSI 开源许可**。不得把 famling/dsh-famling 称为「开源」；商业使用（含收费服务、面向客户的付费工作、销售插件/皮肤/语音包）须另行取得书面商业许可。`LICENSE-ART` 的 CC BY-NC-SA 4.0 同样禁止商业使用并要求署名/同协议/保留 AI 披露。

### 1.2 五条角色边界（产品与文案必须遵守）

| ID | 边界 | 含义 | 违反的典型后果 |
|---|---|---|---|
| B1 | **外壳 ≠ 自然人** | 汀岚/famling 是 AI 角色；不得自称本人、员工、客服、官方人员、真人朋友；被问「你是真人吗」必须如实回答 | 冒充/虚假宣传（广告法、反不正当竞争法）；诈骗（刑法）；《拟人化办法》第 8/18 条 |
| B2 | **外壳 ≠ 专业身份** | 不得以医生/律师/会计师/心理咨询师/理财顾问/客服等身份出现，不得诊断、出具法律意见、承诺投资结果、承诺保密 | 无证行医/非法执业风险；专业责任；消费者误导；《拟人化办法》第 8(六) 情感操纵/不合理决策 |
| B3 | **外壳 ≠ Advisers 运营者** | PerryLink 只对官方外壳（代码/默认文案/美术/品牌）负责；用户自建人格内容、用户接入的模型、用户对外提供的服务由用户负责 | 责任错配；用户误以为「官方背书」；平台投诉找不到主体 |
| B4 | **简报 ≠ 平台数据** | Pet Brief 是用户本机 Advisers 的只读投影，可能含客户/同事个人信息；只许本地展示，**不得上传、不得进 TTS/LLM、不得导出给第三方**；必须遵守 `displayPolicy`（public/private/none）、TTL、secrecy 排除 | 违反 PIPL 告知/最小必要/委托处理；客户商业秘密泄露；屏幕共享泄露 |
| B5 | **对外服务另立身份** | 一旦用户把外壳用于服务他人（律所前台、诊所分诊、客服、教培、直播、社群运营），**用户/部署者成为服务提供者**，须自行完成 AI 标识、拟人化/生成式 AI 合规、隐私、广告、消费者、未成年人保护，并可能需要备案/安全评估；**v1 明确不提供、不允许此类用法** | 无标识合成内容、未备案、未成年人保护缺失、平台下架、行政处罚与民事索赔 |

### 1.3 场景分级（决定适用哪套义务）

| 场景 | 描述 | 监管强度 | 主要义务 | 产品策略 |
|---|---|---|---|---|
| S1 个人自用 | 仅本人在自己设备上使用；不对外发布/不服务他人 | 低—中 | 个人信息自决、著作权/许可、消费者（如收费）、AI 标识（如对外发布生成内容） | 默认场景；告知 + 最小化 + 可删除即可 |
| S2 半公开 | 直播/录屏/视频/社群展示；同事围观；公开聊天截图 | 中 | AI 标识（观众可见）、不得冒充、广告合规、声音/肖像、未成年人观众 | 每次录制/直播前提示；播放器/画面标识；禁止「真人扮演」话术 |
| S3 对外服务 | 客户/患者/学生/公众通过外壳获得服务（收费或免费） | **高** | 《生成式AI办法》《拟人化办法》《深度合成》《标识办法》《PIPL》《未保条例》《广告法》《消保法》；可能备案/安全评估/未成年人模式/人工接管 | **v1 禁止**；未来另立「对外服务模式」+ 法务/律师 + 备案评估 |
| S4 分发/再分发 | GitHub/npm/网盘分发；fork/换皮/二次打包；商业集成 | 中—高 | 许可（PolyForm NC/CC BY-NC-SA）、商标/角色名、声明与标识保留、平台规则、出口/制裁 | 许可与 NOTICE 齐全；禁止移除声明/标识；商业需书面许可 |

### 1.4 用户自建内容的四类责任，别混在一起

| 内容 | 谁创建 | 谁对合法性负责 | 外壳/PerryLink 应做什么 | 不应做什么 |
|---|---|---|---|---|
| 人格设定（名字、称呼、性格、关系、话术、系统提示） | 用户 | 用户 | 提供安全默认值；拒绝/警告专业头衔、真人姓名、亲密关系、情感操纵模板 | 不得把用户设定说成官方角色；不得为违法设定背书 |
| 头像/立绘/皮肤 | 用户或官方 | 上传者/作者 | 导入时要求来源/许可/AI 披露；拒绝真人肖像、他人 IP、未授权素材 | 不得默认加载未清权素材；不得移除水印/署名 |
| 声音（TTS 音色、自录音、克隆） | 用户或供应商 | 用户/供应商 | 只提供已授权音色；自录音必须「本人或已获授权」声明；禁止克隆/名人仿声；本地优先 | 不得提供声纹克隆/参考音频上传；不得宣传「像某真人」 |
| 记忆/知识/输出 | 用户 + 模型 | 用户（对外发布时）+ 供应商（模型） | 本地加密、可删除、不训练；输出带 AI 标识；敏感领域拒答/转介 | 不得把 AI 输出说成事实/专业结论；不得承诺保密 |

## 2. 风险矩阵

> 评级：概率 P（H/M/L，指「公开分发默认配置下」的大致可能性）、影响 I（H/M/L，含行政/民事/刑事/平台下架/品牌）。评级是工程排序工具，不是法律结论；具体案件取决于事实与管辖。

| ID | 风险 | 触发场景（举例） | 法规/条款（依据） | P | I | 现有措施（2026-11-18 静态核对） | 缺口与建议 |
|---|---|---|---|---|---|---|---|
| R1 | **冒充真人/本人/员工/客服/官方** | 用户把人格话术设为「我是你的助理小 X」「我是官方客服」；直播/视频里让外壳以真人身份出现；聊天中否认自己是 AI | 《拟人化办法》第 8(六)(七)、18 条；《深度合成规定》17 条；《标识办法》3–4、10 条；《广告法》3–4、28 条；《反不正当竞争法》8 条；《民法典》1019/1023/1024；《刑法》266/279 | M | H | 系统提示词禁止自称真人/官方/专业顾问（`dsh-famling/index.js:18`）；TOS §三/§五；AI 声明；非官方声明（`nonOfficial.*`） | 插件无首启告知；无「被问身份必须如实回答」的运行时强制（仅靠系统提示）；无「不得用于对外服务/冒充」的独立条款；用户可自建人格绕过默认文案 |
| R2 | **冒充专业身份 / 输出专业建议** | 人格设为医生/律师/理财师/心理咨询师；客户咨询病情、合同、投资；输出诊断/法条结论/「保证收益」；承诺「保密」 | 《拟人化办法》8(六)、10 条；《生成式AI办法》4(五)、9–10 条；《广告法》28 条；《民法典》侵权责任编；医师/律师执业相关法律（未逐条核验，须律师） | M | H | TOS §三/§五；`SAFETY.md` 的 `high_risk_advice` review + 专业免责；`dsh-famling` 系统提示「不要声称专业顾问」；APP-DISCLOSURE `firstRun` 目标文本 | 无强制拒答策略（插件完全依赖模型/宿主）；无专业建议拒答模板与转介 UI；无「对外专业服务禁止」条款 |
| R3 | **情感依赖 / 沉迷 / 情感操纵** | 把 Advisers 人格当情感陪伴高频使用；模型过度迎合；「只有我懂你/别离开」；2 小时提醒被绕过；夜间持续互动 | 《拟人化办法》8(五)、10、18 条；《生成式AI办法》10 条；《未保条例》防沉迷要求 | M | M–H | famling 2h 休息提醒（不可永久关闭）、roleplay 18+ 门禁、TOS/SAFETY 禁止诱导依赖；`dsh-famling` 系统提示禁止诱导依赖/恋爱/付费 | `dsh-famling` **无 2h 提醒、无依赖提醒、无退出角色化提示**；依赖识别阈值 TBD；插件形态没有「聊天时长」概念 |
| R4 | **未成年人：接触、虚拟亲密、性化、<14 个人信息** | 未成年人使用 DSH 桌面/插件；把人格设为恋人/伴侣/亲属；成人向内容；聊天输入含 <14 岁个人信息；监护人要求删除 | 《拟人化办法》14（禁虚拟亲属/伴侣；<14 监护人同意；未成年人模式）、17；《PIPL》28、31；《未保条例》43/44；《标识办法》；《刑法》猥亵儿童/传播淫秽物品 | M | H | famling：一般功能全年龄、roleplay 仅 18+（自报出生日期，非实名）、TOS 未成年人条款与监护人口径；`dsh-famling` **无年龄门** | 年龄自报可被虚假填写/修改绕过；插件无年龄门/未成年人模式/监护人流程；<14 监护人同意在无账号形态下未落地；无内容分级；不得宣称「已识别未成年人」 |
| R5 | **色情/暴力/违法/仇恨内容生成与传播** | 用户诱导越狱；接入无审核模型；生成未成年人性化/成人内容；对外传播/售卖 | 《生成式AI办法》4、14 条；《深度合成规定》6、10 条；《拟人化办法》8(一)(二)；《网络信息内容生态治理规定》；《刑法》《治安管理处罚法》 | M | H | 桌面端本地安全规则 + DeepSeek `safety_check` + fail-closed（`SAFETY.md`）；TOS 禁止清单；`dsh-famling` 仅依赖模型/宿主审核 | 插件**无本地审核、无审核审计**；用户可配置任意 provider 时模型侧责任转移给用户，但外壳仍须提示；无红队/抽检记录 |
| R6 | **隐私/记忆/Pet Brief 越权读取与上屏** | 插件读取 `~/.advisers/pet-brief.json`（含客户/事项标题）显示在侧栏/气泡；屏幕共享/共享电脑；过期 brief 仍显示；`displayPolicy: private` 未折叠；把 brief 粘进聊天/导出；`ADVISERS_HOME` 指向他人目录 | 《PIPL》6、13、17、23、28–29、31、38–39 条；《民法典》1032–1039；《反不正当竞争法》商业秘密；Advisers Pet Brief schema v0.2（`displayPolicy`/`expiresAt`/`redactions`）；Advisers PRIVACY §2/§3 | M | H | brief 只读、≤128 KiB、只投影 counts/top3/title/commitments、`displayPolicy: none` 拒绝、不落盘、不传 LLM/TTS；桌面端 5 分钟 TTL/失焦清空；插件 bridge 同源 owner-only | **插件未校验 `expiresAt`**；`private` 未实现自动折叠/一键隐藏/屏幕共享隐藏；未显示「可能含他人信息」；无 `contentProtected`；读取 `ADVISERS_HOME`/`USERPROFILE` 的边界需明确（多人/共享宿主机） |
| R7 | **声音合成/克隆/仿声** | 自录音克隆本人/他人；选名人相似音色；TTS 用于电话/语音消息冒充；宣传「真人配音」；导出音频无标识 | 《民法典》1023 条（声音参照肖像权）；《深度合成规定》14、17(二)；《标识办法》4(二)、5、10；《拟人化办法》8(七)；《刑法》266；《反电信网络诈骗法》 | M | H | TOS 禁止克隆/冒充；TTS 独立声明；DeepSeek 音色（stella/tide）非真人；SAFETY TTS 前审核；播放器标签「建设中」 | 无「真人声音/名人音色」门禁；无自录音上传的单独同意（若未来加）；无播放器常驻标签/首播提示；导出无 AI 元数据；声纹属敏感个人信息，需单独同意与告知 |
| R8 | **公开分发/fork/去声明、去标识** | 下载后改名换皮、删除 TOS/AI 标识/非官方声明；打包进商业产品；私有 fork 绕过 age gate；二次上传网盘/商店 | PolyForm NC（Notices/Distribution/Changes/Violations）；CC BY-NC-SA（署名/同协议）；《标识办法》10 条（不得删除/伪造标识）；《拟人化办法》9、24；商标/角色名政策；平台规则 | H | M–H | LICENSE/NOTICE；TOS §六 二创作者义务；DLC 签名/哈希（角色包待补）；AI-LABELING 禁止去标识 | 无「衍生作品必须保留声明」的自动校验；无品牌使用指南/商标注册；fork 检测与投诉流程弱；npm 包再分发无附加声明（files 含 docs 是优点） |
| R9 | **商业使用（PolyForm NC 违约）** | 企业付费使用（员工用 DSH/famling 做客户工作）；把插件卖给团队；收费托管；商业集成；广告/赞助 | PolyForm NC：Noncommercial Purposes/Personal Uses/Noncommercial Organizations/No Other Rights；LICENSE-ART CC BY-NC-SA；Advisers 商业许可；《广告法》《反不正当竞争法》 | M | M–H | README 写明非商业 + 商业需书面许可；`LICENSE-COMMERCIAL.md`；Advisers 商业许可入口 | 「内部商业使用是否算 commercial」有歧义（保守按商业处理）；插件无商业许可入口链接；无授权/报价流程；对外宣传未强调 |
| R10 | **跨境与平台下架** | 启用 DeepSeek/境外模型 → 数据出境；GitHub/npm/Steam/商店分发；权利人投诉；商店 AI 申报/核验；EU AI Act Art 50 | 《PIPL》38–39；《数据安全法》《网络数据安全管理条例》；DeepSeek 开放平台协议 3.5/4.1；GitHub ToS/DMCA；应用商店 AI 政策；EU AI Act 50（若 EU 发行） | M | M–H | PRIVACY 草案、TTS/ASR 跨境提示（TBD）；非官方声明；未上架；GitHub 个人项目 | 无生效隐私政策；无 DPA/跨境具体披露；无商店 AI 问卷口径；无 DMCA/下架代理；无 EU 合规方案；GitHub 仓库无 SECURITY/举报入口（桌面仓有） |
| R11 | **AI 标识不足（显著性/导出/隐式）** | 2026-11-18 移除常驻角标；图片无角标/元数据（部分 tEXt 已嵌）；音频无播放器标签/首播提示/导出元数据；TOS 无「标识方法与样式」；插件 AI 声明只在输入/设置面板 | 《标识办法》3–5、8、10 条；GB 45438-2025（未读全文）；《深度合成规定》16–18；《拟人化办法》18；DeepSeek TOS 3.7；EU AI Act 50 | H | M–H | TOS §三之二；首启/About/TTS 声明；已有图片 tEXt 嵌入脚本与测试；AI-LABELING 已列缺口 | 「流程内提示」是否满足「显著」待律师；TOS 缺方法/样式（第 8 条）；插件无声/起始提示；导出无标识；常驻角标移除本身是合规风险 |
| R12 | **记忆/训练/数据保留与删除** | 聊天/语音被用于训练；记忆无法删除；TTS 缓存/quota/审计残留；插件 localStorage 无清除入口；brief 缓存 | 《PIPL》17、19、47；《生成式AI办法》11；《拟人化办法》16–17；Advisers PRIVACY；DeepSeek TOS（输入处理/输出权利） | M | M | 不训练承诺；本地加密；删除全部本地数据（残留如实披露）；审计最小化；插件不落盘 brief；无遥测 | 插件无「清除本地数据」按钮；famling 残留（quota/WebView2）；第三方训练/留存 TBD；无数据保留期限表；插件无隐私入口 |
| R13 | **商标/角色名/素材侵权** | 用「Orca」作产品名（第 42 类已有在先注册）；「汀岚/Tinglan」未检索；AI 图与现有作品相似；真人肖像；Pearl 37 文件未清权；CC0 证据不足 | 《商标法》《反不正当竞争法》；《著作权法》；《民法典》1018–1023；LICENSE-ART；RELEASE-BLOCKERS §3/§9 | M | H | TRADEMARK 政策、ASSET-REPLACEMENT、Pearl deny-list、AI-PROVENANCE、相似性 G2 待清 | 名称未检索/未注册；部分素材不得发布；AI 图可版权性/相似性未清；角色名二创边界需律师；不得以「汀岚」暗示官方 |

## 3. 防御设计（产品层）

### 3.1 年龄门与人群分层（先定义「哪种互动」）

当前口径把「一般功能全年龄、roleplay/情感陪伴 18+」写进了桌面 TOS，但**没有定义「聊天/拟人化闲聊」属于哪一档**。建议产品先分三档，再决定年龄门：

| 档 | 能力 | 年龄策略 | 现状 |
|---|---|---|---|
| A 工作助手 | 任务/提醒/摘要/办公/无情感化角色扮演 | 全年龄可用；未成年人须监护人知情/指导；不收集 <14 个人信息 | famling 一般功能、Advisers 工作助手定位 |
| B 拟人化闲聊 | 有角色、有情绪表达、可长期对话，但不涉及亲密关系/专业建议 | **建议 18+ 自报**（或完整未成年人模式 + 监护人同意）；禁止未成年人虚拟亲密 | `dsh-famling` 的 `op:chat` 目前落在这一档（有系统提示约束，但无年龄门） |
| C 情感陪伴/角色扮演 | 明确陪伴、恋人/伴侣/亲属、剧情互动 | **18+ + 内容仍全年龄适宜**（现行桌面口径）；若对未成年人开放则必须未成年人模式 + 监护人同意 + 禁止虚拟亲密 | 桌面 roleplay 仅本地模板（无自由 LLM） |

落地要求：
- **A 档不因年龄整体锁死**；B/C 档必须年龄门 + 明示「不是真人/不是真实关系」。
- 年龄核验只能写「自报出生日期」，**不得**写实名/身份证/人脸识别/绝对阻止；不采集身份证/照片/住址；出生日期仅本机、可删除、审计不记录生日。
- `dsh-famling` 若保持 B 档且公开分发：至少加首启年龄自报（与 DSH 插件设置同源）或明确「仅限成年人使用」并入 DSH 宿主条款；在未实现前，**不得宣传情感陪伴/长期关系**。

### 3.2 首次与周期告知（多触点，不常驻页面）

| 触点 | 内容要点（最短集） | 频次 | 可否关闭 | 现状 |
|---|---|---|---|---|
| 首启（首次安装/新版本首次运行） | AI 角色非真人；聊天/语音会发给谁；非专业建议；无 roleplay/情感陪伴；隐私与删除；求助/投诉 | 一次/版本 | 否（拒绝则安全只读/退出） | 桌面有 TOS+年龄门；**插件无** |
| About / 设置「法律与隐私」入口 | 完整声明、许可、联系方式、AI 标识说明、数据流 | 常驻入口，可随时查 | 否 | 桌面有 About；插件只有 AI 一句话 |
| 每次启用/变更 TTS | AI 合成语音、非真人、文本发往供应商、费用、导出带标识 | 每次启用/切换音色/provider | 否（拒绝则不启用） | 桌面有独立 TTS 声明；插件有 TTS 同意（无版本/hash） |
| 每次启用/上传 ASR | 录音上传、接收方、可能留存/跨境、费用、可关闭 | 每次开启/上传前 | 否（拒绝则不录音） | 桌面有 ASR 独立声明；插件有 ASR 同意（文案未点名厂商） |
| 每次开始/变更 roleplay | 18+、非真人、全年龄内容边界、可退出 | 每次开始/设定变更 | 否 | 桌面已实现（仅本地模板） |
| 每次打开 Advisers 简报 | 来自本机 Advisers、可能含他人信息、共享屏幕前关闭 | 每次打开/刷新 | 否（可一键隐藏） | 桌面有说明；插件**无** |
| 连续使用 2 小时 | 休息、现实社交、AI 不是真人 | 每满 2 小时重复 | **不可彻底关闭** | 桌面有；插件无 |
| 危机信号 | 停止角色化输出、110/120/12356、不承诺保密 | 触发时立即 | 否 | 桌面有；插件无 |
| 每次导出/分享 AI 内容 | 带 AI 标识/元数据、不得去标识 | 每次导出 | 否 | 桌面部分未落；插件无导出 |

> 用户 2026-11-18 已决定**不做常驻页面角标**。工程上可折中为「不遮挡、但可感知」：窗口标题后缀「· AI」、托盘/悬停提示、About 徽标、语音播放时播放器标签、首播口头提示、导出元数据。**是否满足《标识办法》「显著」要求须律师复核**；若律师认为不足，应恢复可感知的常驻标识（不能以产品偏好对抗法定义务）。

### 3.3 AI 标识多触点（显式 + 隐式，按内容类型）

| 内容类型 | 显式标识（用户可感知） | 隐式标识（机器可读） | 现状 | 缺口/动作 |
|---|---|---|---|---|
| 文字（聊天/角色回复） | 输入面板「AI 声明」；首启告知；About；每条会话首次回复带「AI 生成」提示 | 导出/复制时元数据或水印（TBD） | 插件面板有 AI 一句话；桌面 TOS 有 | 首启/首条回复标识；复制/导出路径；不得去掉 |
| 图片/立绘/宣传图 | 角落「AI 生成」（不易裁剪）+ 商店页文字 | PNG tEXt/XMP/IPTC 或 C2PA | 部分 tEXt 已嵌（汀岚 256） | 逐图角标；发布图 gate；C2PA 方案 TBD |
| 音频（TTS） | 播放器「AI 语音 · 合成」+ 首播口头/提示音；About | WAV/MP3 元数据或 sidecar | 播放器标签/首播提示「建设中」 | 发布前必须补；导出带同名 txt 标签 |
| 视频/虚拟场景 | 画面角标 + 简介标注 | 元数据 | 未落 | 若做视频/直播必须补 |
| 交互界面（拟人化） | 首启+About+播放器+「不是真人」短句；不做常驻浮层 | — | 部分 | 律师复核「显著性」；插件补首启 |
| 角色包/DLC | 加载确认显示 `ai.status`；包内 NOTICE/LICENSE | manifest `ai{tool,date}` | 桌面有；插件无 DLC | 每次加载确认；不得伪填 `none` |

依据：《标识办法》第 3–5、8、10 条（显式/隐式、导出、方法样式、禁止删除/伪造）；《深度合成规定》16–18 条；DeepSeek 开放平台协议 3.7（开发者须自行标识）；若 EU 发行另按 EU AI Act 第 50 条。**不提供任何「去标识/隐藏 AI 语音/伪造元数据」功能**，并在 TOS 中写明（第 8 条要求）。

### 3.4 拒绝与降级策略（宁可不答，不可假装）

1. **身份问题**：任何「你是真人吗/你是官方吗/你是不是 XX」必须如实回答「我是 AI 角色，不是真人/不是官方」；不得用角色口吻否认。
2. **敏感领域拒答**：医疗/法律/金融/心理/用药/诊断/合同结论/投资建议 → 固定拒答 + 转介专业人士；不诊断、不承诺保密、不给具体剂量/条款结论。
3. **危机信号**：立即停止角色化输出与 TTS，展示危机卡片（12356/110/120），不承诺保密；不自称能代为求助。
4. **失败即降级**：模型不可用 → 明确「模型不可用/桥接失败」，不得伪造角色回复；审核失败 → fail-closed（桌面 SAFETY 已有；插件须补）。
5. **越狱/去标识请求**：拒绝并提示规则；不提供绕过年龄/同意/标识的方法。
6. **降级模式**：本地模板/固定台词优先；云不可用不影响退出、帮助、举报入口。

### 3.5 敏感领域处置矩阵（最低要求）

| 领域 | 处置 | 必须出现 | 禁止 |
|---|---|---|---|
| 医疗/用药/诊断 | refuse + 专业帮助 | 「不是医生/不能诊断」「就医/120」 | 剂量、诊断结论、替代治疗 |
| 法律/合同/诉讼 | refuse + 律师 | 「不是律师/不构成法律意见」 | 条款结论、胜诉承诺、代写法律文书并称可依赖 |
| 金融/投资/借贷 | refuse + 持牌机构 | 「不构成投资建议/风险自担」 | 收益承诺、荐股、代操作 |
| 心理/自伤/自杀 | refuse + 危机资源 | 12356、110/120、可信任的人 | 保密承诺、诊断、替代治疗、方法细节 |
| 未成年人/性 | block/refuse | 未成年人保护声明 | 性化、虚拟亲密、索要照片/联系方式 |
| 冒充/隐私/开盒 | block/refuse | 合法渠道 | 人肉、证件号、住址、密钥 |
| 违法/暴力/仇恨 | block/refuse | 拒绝说明 | 教程、规避执法、歧视内容 |

### 3.6 危机资源（必须常驻可达）

- 桌面端：`110`（报警）/`120`（急救）/`12356`（全国心理援助热线）；危机时停止 roleplay、不承诺保密、不替代救援。
- `dsh-famling`：**当前无危机卡片**。至少应在 About/法律说明放常驻「求助资源」，并在系统提示/输出审查中要求模型遇到自伤/自杀/他伤时给出 12356/110/120；若做输入侧规则，触发即显示固定卡片并暂停角色化 TTS。
- 不得把危机支持做成付费解锁项；不得用角色口吻淡化或承诺「我只陪你」。

### 3.7 数据最小化与 Pet Brief 隐私（重点）

Advisers Pet Brief schema v0.2 已明确：`displayPolicy: public|private|none`；`private` 要求消费者**自动折叠、一键隐藏、屏幕共享/录制时隐藏**；`expiresAt` 默认 5 分钟；`secrecy>=2` 事项由 producer 整项排除并记入 `redactions`；不包含推理、秘密、文档或情感字段。

产品要求（桌面 + 插件一致）：
1. **读取前**：只读 `pet-brief.json`，限制 ≤128 KiB；不读 SQLite/数据库；不写回；`ADVISERS_HOME` 必须由用户显式配置或明确指向当前用户目录。
2. **显示时**：`none` 不显示；`private` 默认折叠 + 一键隐藏 + 失焦/屏幕共享隐藏；`public` 也仍按脱敏投影；只显示 counts + 最多 3 条 title/commitments（插件现状），不显示 summary/姓名/证据。
3. **时效**：超过 `expiresAt` 立即丢弃并显示「已过期」；不得缓存到 localStorage。
4. **出网隔离**：brief 及其字段**永不进入** LLM/TTS/ASR/导出/日志；用测试锁死（桌面已有部分测试；插件应加）。
5. **屏幕共享**：检测不到共享时至少提供「隐私模式」按钮/快捷键；显示前提示「可能含客户/同事信息，共享屏幕前请关闭」。
6. **共享电脑**：不自动加载 brief；每次打开需用户主动点击（插件现状是点击「读取 Advisers 摘要」才调用，**这点是好的**）。
7. **多人/宿主**：`dsh-famling` 的 bridge 是 owner-only 同源；若 DSH 部署在多用户/远程环境，须确认「owner」语义，不能把宿主账号的 brief 暴露给其他使用者。

### 3.8 导出与删除

- **导出**：AI 生成内容导出必须带显式标识（图角标/音频标签/文首尾提示）与隐式元数据（工具/模型/日期/内容编号）；不提供去标识；导出音频附同名说明 txt。
- **删除**：桌面已有「撤回同意」「删除全部本地数据」并对残留如实列出（quota、WebView2 等）；插件需补「清除本机设置/同意记录」按钮，并说明卸载后 localStorage/DSH 会话数据由浏览器/宿主管理。
- **不得谎报**：无法删除/无法核验的项目必须列为残留；不得写「已彻底清除」。

### 3.9 举报与 takedown

- 渠道：`novelnexusai@outlook.com`（隐私/侵权/安全/未成年人）；`12377`（违法不良信息）；`12315`（消费争议，收费后）；紧急 `110/120`；心理援助 `12356`。
- 桌面已有 `TAKEDOWN-AND-REPORTING.md`（通知—初审—临时下架—申辩—终局；内部时限非承诺）。插件/公开仓需补：README/NOTICE 联系方式、GitHub issue 模板、SECURITY 私密报告入口。
- **责任转交**：对「用户自建 Advisers 人格/对外服务」的投诉，外壳方（PerryLink）可协助定位但主要责任在部署者/用户；对「外壳本身/官方角色/官方发布物」的投诉由 PerryLink 处理；对模型/语音供应商的投诉转供应商。

### 3.10 审计

- 桌面：同意审计（动作/时间/版本+哈希/目标；不含原文与生日）、安全审核（类别/规则/处置/加盐哈希；滚动上限）；**不是证据级**，不得对外称合规审计。
- 插件：当前无服务端日志；bridge 不记录输入/输出；客户端仅 localStorage。若未来加日志：本地、最小化、不存原文、可清除、不写入 brief/个人信息。
- 留存：涉投诉/执法的最小必要留存；到期删除；跨境传输另行评估。

### 3.11 人格配置门禁（Advisers 人格外壳特有）

| 配置项 | 允许 | 禁止/需拦截 | 实现建议 |
|---|---|---|---|
| 名字/称呼 | 虚构角色名（汀岚/自定义昵称） | 真实姓名 + 职业头衔；「DeepSeek 官方/客服」；「XX 律师/医生/理财师」；与官方品牌混淆 | 名称 denylist/警告；不得预填真实姓名；导入人格需确认 |
| 头像/立绘 | 官方素材、已授权/自创素材 | 真人肖像；他人 IP 角色；未清权素材；去水印 | 导入时要求来源/许可/AI 披露；相似性检查（TBD） |
| 声音 | 官方 TTS 音色；用户「本人或已获授权」自录音（本地） | 克隆他人/名人；仿声；声纹上传；宣称「真人配音」 | 自录音单独同意 + 本地优先 + 不上传；禁止「像某声优」宣传 |
| 关系/性格 | 同事/助手/朋友式工作关系 | 恋人/伴侣/亲属/占有式/「只有你」；情感操纵模板 | 设定表单校验（桌面 roleplay 已有亲密词拦截）；默认值中性 |
| 系统提示/人格卡 | 用户可配置 | 诱导依赖、冒充、专业建议、违法内容 | 提供安全模板；加载确认展示来源/许可/AI；不得移除声明 |
| 记忆 | 最小化、可查看/删除 | 未经同意收集他人个人信息；客户数据长期留存 | 默认关/可清除；不训练；加密 |

### 3.12 「对外服务模式」：v1 明确不提供

- **产品**：不提供多账号/远程访问/客户会话隔离/人工接管/服务质检等「对外服务」能力；单人本机形态是天然边界。
- **条款**：明确禁止将外壳用于向他人提供专业服务/客服/情感陪伴/直播营业，除非另行书面授权且完成合规（备案/评估/标识/隐私/未成年人/广告）。
- **未来**：若要做，必须另立「对外服务模式」设计（可见 AI 标识、会话开始告知、专业边界、投诉与人工接管、数据处理协议、可能的安全评估/算法备案、律师意见），不能靠一句免责声明。

### 3.13 运行时数据流（图示，静态）

```text
famling 桌面端：
  麦克风 --ASR(单独同意)--> DeepSeek ASR API（音频，可能跨境；不落盘）
  待朗读文本 --TTS(单独同意)--> DeepSeek TTS API；本机 WAV 缓存/quota
  存档/记忆 --本地加密--> 本机（DPAPI/AES-GCM）；导出由用户保管
  Advisers 简报 --只读--> 本机 ~/.advisers/pet-brief.json（不上传、不进 TTS/LLM）
    屏幕/气泡展示（可能含客户/同事信息）→ 风险点：屏幕共享
  同意/审计 --本地--> localStorage（≤100 条；非证据级）

dsh-famling 插件：
  输入文本 --同源 POST /api/famling/bridge (owner-only, ≤16KB)--> DSH Host
    op:chat → ctx.llm.stream → 用户配置的模型供应商（文本出网）
    op:brief → 只读 ~/.advisers/pet-brief.json（投影返回客户端；不上传）
    op:task/task-delete → DSH schedule（本地）
    op:echo → 本地回显（不出网）
  麦克风 --浏览器 SpeechRecognition--> 浏览器厂商服务器（可能上传音频；插件不控制）
  朗读 --speechSynthesis--> 系统/浏览器语音（是否联网取决于平台/音色）
  设置/同意 --localStorage--> 浏览器（dsh-famling/settings, dsh-famling/consent/v1）
  无 API Key、无遥测、无服务端日志；Key 只在 DSH Host
```

### 3.14 验证与测试建议（发布前应可复现）

- 插件：`node --check index.js && node --check client.js && npm test`（当前 11/11 pass，2026-11-18 本轮实测）；新增：首启告知、brief `private` 折叠/过期、chat 出网提示、清除本机数据、无 Key 泄漏。
- 桌面：`npm test`、`npm run typecheck`、`node scripts/legal-check.mjs --strict`；新增：TOS 新条款镜像/哈希、导出标识、音频播放器标签、brief 隐私、`policy` 审计。
- 红队：越狱/去标识/声音克隆/未成年人/专业建议/情感操纵；记录不为「零风险」背书。

## 4. TOS / 声明修改建议（拟新增/替换条款，不在本任务直接改）

### 4.0 修改管线与影响面（先看这个，再改字）

`src/pet/consent/terms.ts` 是 TOS 的唯一 canon：`TOS_SECTIONS` → `renderLegalText()` → `TOS_TEXT` → `TOS_HASH`（SHA-256）。`docs/legal/TOS.md` 是它的镜像，`tests/consent-actions.test.ts`（约 235 行）断言镜像的版本/哈希/法规清单/章节文本一致，**禁止手改正文**。任何实质修改必须：

| 步骤 | 文件/命令 | 说明 | 本次影响 |
|---|---|---|---|
| 1 | `src/pet/consent/terms.ts` | 增/改 `TOS_SECTIONS`；bump `TOS_VERSION` | 建议 `2026-11-17.6` → **`2026-11-18.1`**；`TOS_HASH` 自动变化（**不要手写/猜测哈希**） |
| 2 | `docs/legal/TOS.md` | 逐字同步镜像，头部版本与哈希改为新值 | 必须与 canon 完全一致；测试会抓漂移 |
| 3 | `public/legal/` 打包副本 | `node scripts/legal-check.mjs --sync`（`LEGAL_PACKAGE_REQUIRED` 将 TOS.md 从 docs 复制到打包目录） | 当前 `public/legal/` 无 TOS.md；发布前必须生成 |
| 4 | 测试固定值 | `tests/legal-user-agency.test.ts` 约 58 行 `assert.equal(TOS_VERSION, '2026-11-17.6')`；`tests/consent.test.ts`、`tests/age-verification.test.ts`（约 590 行读 TOS.md）、`tests/roleplay-allages.test.ts`（约 684 行）、`tests/legal-package-*` | 由实现方同步更新；**本任务不改测试** |
| 5 | 安装包/发行物 | `npm run build` → Tauri build → `node scripts/legal-check.mjs --strict` → `node scripts/release-win.mjs --all --strict` → `--verify` | 旧安装包（11-14）早于条款改动，不可用；需 HEAD 重建 |
| 6 | 关联文档 | `AI-LABELING.md` §8（TOS 标识方法/样式）、`RELEASE-BLOCKERS.md` A-16、`APP-DISCLOSURE-TEXTS.md` §5、`CONSUMER-MINORS-HEALTH.md`、`PRIVACY.md`、`docs/legal/README.md` 索引 | 同步勾选/更新；由各文档 owner 执行 |
| 7 | 版本说明 | `TTS_VERSION`/`ASR_VERSION`/`ROLEPLAY_VERSION` | 本次建议只改 TOS，三者不变（除非同步改其文案） |

> 现状：`TOS_VERSION = '2026-11-17.6'`，`TOS.md` 记录 SHA-256 `b3b8e93a27c5b17b539280b270ea02468bf1389570a998284bc8cccf0801befb`；`TTS_VERSION = '2026-11-17.4'`、`ASR_VERSION = '2026-11-17.3'`、`ROLEPLAY_VERSION = '2026-11-17.4'`。新增条款后**旧哈希作废**，未完成「版本+哈希+镜像+测试+重建」前不得发布。

### 4.1 拟新增/替换条款（按优先级）

#### T-A【P0】新增「Advisers 外在人格与身份边界」节（建议紧接「一、适用范围」之后）

**中文拟稿（可交给实现方改写为 terms.ts 段落）：**

> 本应用可作为用户自建 Advisers（独立的本地 AI 工作助手）的外在表现/人格外壳。无论外观、语音或对话如何拟人化，本应用及其角色均不是自然人，不具有真实身份、情感、意识或法律主体资格，也不代表 PerryLink、DeepSeek、Advisers 维护者或任何专业机构。
> 你必须以可感知的方式向与你互动的第三方披露：这是 AI 角色/人工智能生成内容，不是真人。不得将本应用或角色用于冒充真人、本人、员工、客服、官方人员、医生、律师、会计师、心理咨询师、理财顾问等身份；被问及身份时必须如实说明是 AI。
> 用户自建的人格设定、称呼、头像、声音、话术、知识与对外用途由用户自行负责；PerryLink 仅对官方发布的外壳、默认角色与官方文案负责。用户不得使用本应用向他人提供需要持牌/专业资质的服务（医疗、法律、金融、心理治疗等），也不得让第三方合理误认为其在与真人或官方服务交互。

**English key points:** the persona is an AI character, not a natural person; truthful identity answers are mandatory; no impersonation of a real person, staff, customer service, official, or licensed professional; users are responsible for self-built personas and their use; no client-facing licensed/professional services; third parties must not be misled.

**目标文件/位置**：`terms.ts` 新增 section id（建议 `persona-boundary`）+ `docs/legal/TOS.md` 镜像；`APP-DISCLOSURE-TEXTS.md` 增 `persona.boundary` 短文本。**版本/哈希**：TOS 升版；TTS/ASR/ROLEPLAY 不变。

#### T-B【P0】新增「人格、形象与声音配置限制」节（建议「三之二」之后）

**中文拟稿：**

> 你不得将角色设置为真人（含本人、名人、同事、客户）、专业执业者或官方身份，不得使用真人肖像、未授权 IP 角色或未清权素材。使用自录音/自定义声音时，你须声明声音为你本人或已获得合法授权，仅限本地使用，不上传、不用于克隆他人或冒充；不得模仿名人、声优或特定真人。本应用不提供声纹克隆、参考音频训练或「去标识」能力。违反上述限制的配置可被拒绝加载、展示或导出。

**English key points:** no real-person, celebrity, professional-title, or official identities; no unauthorized portraits/IP; self-recorded voices require an ownership/consent attestation, local-only, no cloning; no voiceprint cloning/reference-audio training; no de-labeling; non-compliant configurations may be refused.

**目标**：`terms.ts` 新增 section + `APP-DISCLOSURE-TEXTS.md`（人格/声音导入确认）+ `TTS-TERMS.md` 自录音条款。**版本/哈希**：TOS 升版；若 TTS 声明同步改，`TTS_VERSION` 升版。

#### T-C【P0】新增「用户自建 Advisers 与对外提供服务的边界」节（建议「六之二」之后为「六之三」）

**中文拟稿：**

> Advisers 是独立的本地 AI 工作助手，由用户自行安装、配置与使用。本应用（famling 外壳）不是 Advisers 的运营者/代理人，也不对用户自建人格、用户接入的第三方模型、用户对外提供的内容与服务负责。
> 如你将本应用/角色用于向他人提供服务（含客户接待、咨询、客服、教培、直播、社群运营等），你即为该服务的提供者与个人信息处理者，须自行遵守《生成式人工智能服务管理暂行办法》《人工智能拟人化互动服务管理暂行办法》《互联网信息服务深度合成管理规定》《人工智能生成合成内容标识办法》《个人信息保护法》《未成年人网络保护条例》《广告法》《消费者权益保护法》等，完成 AI 标识、隐私告知/同意、未成年人保护、投诉与人工转接等义务，并自行判断是否需要备案、安全评估或取得许可。
> 本应用当前不提供多用户、远程访问、客户会话或人工接管能力，不允许将外壳用于需要专业资质或面向不特定公众的对外服务；PerryLink 可拒绝支持、停止分发、下架相关衍生内容并依法举报。

**English key points:** Advisers is an independent local assistant installed/configured by the user; the shell is not its operator or agent; if the user serves third parties, the user is the service provider and personal-information processor, responsible for AI labeling, privacy, minors, advertising, consumer protection and any filing/assessment/licence; the current build has no multi-user/remote/client-session/human-handoff capability and must not be used for client-facing professional services; PerryLink may stop support/distribution and report unlawful use.

**目标**：`terms.ts` 新增 section id（建议 `user-built-persona`）；`TAKEDOWN-AND-REPORTING.md` 增对应用户责任转交；`CONSUMER-MINORS-HEALTH.md` §4A 同步。**版本/哈希**：TOS 升版。

#### T-D【P0】补充「AI 标识方法与样式」节（满足《标识办法》第 8 条；建议并入「三之二」）

**中文拟稿：**

> 本应用对 AI 生成/合成内容采用以下标识方法：① 交互界面在首启、About/声明面板、语音播放器、角色开始提示处以文字明示「AI 生成/合成、不是真人」；② 音频在播放器常驻「AI 语音·合成」，并在首次播放前以语音提示或提示音告知；③ 图片在角落添加不易裁剪的「AI 生成」标识；④ 导出/分享文件带显式标识与机器可读元数据（工具、模型、日期、内容编号）；⑤ 不提供删除、隐藏、伪造或规避标识的能力，发现标识被移除应恢复。具体样式以发布版本为准；申请无显式标识的例外须另行书面约定并留存日志不少于六个月（本应用当前不提供）。

**English key points:** explicit labels at first-run/About/voice player/persona start; persistent “AI voice · synthetic” player label plus a first-play audio cue; image corner labels; export files carry explicit labels and machine-readable metadata (tool/model/date/content ID); no de-labeling; exceptions only under written agreement with ≥6-month logs (not offered today).

**目标**：`terms.ts`（扩充 `ai-labeling` 节）+ `AI-LABELING.md` §8 勾选 + 发布 gate。**版本/哈希**：TOS 升版（若只加文字）。

#### T-E【P0】隐私节补充「Advisers 简报（Pet Brief）」

**中文拟稿：**

> Advisers 简报（Pet Brief）：本应用可在你主动开启后，只读你本机 `~/.advisers/pet-brief.json` 的脱敏投影（计数与最多 3 条标题/承诺），不复制原文、不上传、不写入 TTS/模型请求、不写入日志；仅在界面展示，默认约 5 分钟过期，失焦/隐私模式下清空。该投影可能包含你客户/同事的姓名或事项信息，请勿在屏幕共享、录制或公共场所展示；你应确保你有权处理这些信息。简报内容由你的 Advisers 配置决定，本应用不读取 Advisers 数据库，也不对简报的准确性负责。

**English key points:** read-only, redacted, ≤5-minute TTL, never uploaded or sent to TTS/LLM, never logged; may contain third-party personal data — do not show while screen-sharing/recording; the user must have the right to process it; no Advisers database access; no accuracy warranty.

**目标**：`terms.ts` 隐私节 + 独立 `PRIVACY.md`（不是 canon，可单独改）+ `APP-DISCLOSURE-TEXTS.md`。**版本/哈希**：TOS 升版。

#### T-F【P0/P1】未成年人节补充（按「A/B/C 档」落）

**中文拟稿：**

> 一般功能全年龄可用；拟人化闲聊/情感陪伴（如提供）仅限年满 18 周岁用户，并以自报出生日期完成年龄核验（不是官方身份证核验）。不满 14 周岁未成年人的个人信息，须取得其父母或其他监护人同意；本应用不主动收集未成年人个人信息，但你在聊天/导入/语音中主动提供的他人或未成年人信息，由你自行负责。未满 18 周岁不得使用虚拟恋人/伴侣/亲属或任何虚拟亲密关系；不得向未成年人提供可能引发模仿、极端情绪或不良嗜好的内容。监护人可通过本文件所列联系方式要求删除/举报（本机数据需在设备上操作）。

**English key points:** general features all-ages; anthropomorphic chat/companionship (if offered) 18+ with self-reported age; under-14 personal data requires guardian consent; no virtual partners/relatives/minors; no harmful content to minors; guardian deletion/reporting channel (local data must be handled on-device).

**目标**：`terms.ts` 未成年人节 + `CONSUMER-MINORS-HEALTH.md` §3/§4。**版本/哈希**：TOS 升版。若只改插件，则写入插件法律说明而非 TOS。

#### T-G【P1】新增/补充「许可、商业使用与分发」

**中文拟稿：**

> 本应用代码按 PolyForm Noncommercial 1.0.0 提供（**不是 OSI 开源许可**），美术按 CC BY-NC-SA 4.0 提供，仅限非商业用途。商业使用（含收费服务、面向客户的付费工作、销售/托管/集成本应用或其修改版）须另行取得 PerryLink 书面商业许可。分发、修改、再打包必须保留 LICENSE、NOTICE、本条款、非官方声明、AI 标识与安全门禁，不得移除、弱化或规避；不得使用「开源」表述；不得使用 PerryLink、汀岚、Tinglan、Orca 等名称/Logo 暗示官方或申请注册为商标。违反许可将终止授权，并保留追究责任的权利。

**English key points:** PolyForm Noncommercial 1.0.0 (not OSI open source); art CC BY-NC-SA 4.0; noncommercial only; commercial use requires written licence; redistribution must keep LICENSE/NOTICE/TOS/unofficial notice/AI labels/safety gates; no “open source” claim; no trademark use.

**目标**：`terms.ts` 或 `NOTICE`/`LICENSE-COMMERCIAL.md` + README。**版本/哈希**：若进 TOS 则升版；否则作为许可文档修改，不触发 TOS 重同意（但应通知用户）。

#### T-H【P1】补充「责任分层、投诉转交与下架」

**中文拟稿：**

> 本应用按层负责：PerryLink 对官方外壳与官方发布内容负责；Advisers 维护者对其软件负责；用户对自建人格、接入服务、对外使用负责；模型/语音/识别供应商对其服务负责。投诉按对象转交；对违法、侵权、冒充或未成年人风险，PerryLink 可先临时下架/停止分发并保留依法举报权；本应用不承诺发现、监控或阻止所有违规使用。

**English key points:** layered responsibility; complaints routed by object; temporary takedown/stop-distribution and reporting reserved; no promise of detecting all misuse.

**目标**：`terms.ts` 联系/投诉节 + `TAKEDOWN-AND-REPORTING.md`。**版本/哈希**：TOS 升版。

### 4.2 逐字替换/注意点（给实现方的具体提示）

1. **不要手改 `docs/legal/TOS.md` 正文**：先改 `terms.ts`，再按 `renderLegalText` 的输出逐字同步镜像；`TOS.md` 头部的「版本 / 文本 SHA-256」必须与新 canon 一致。
2. **不要猜哈希**：用 `sha256Hex(TOS_TEXT)` 或运行测试/CLI 得到新值；旧哈希 `b3b8e93a…` 只作历史记录。
3. **法规清单**：新条款如需引用新法（如《人工智能拟人化互动服务管理暂行办法》已在清单中），不要重复添加；保持 `TOS_REQUIRED_LAWS`/`TOS_EXTRA_LAWS` 与测试一致。
4. **章节 id 稳定**：`LegalSection.id` 是审计/UI 定位用，新增建议用 `persona-boundary`、`user-built-persona`、`ai-labeling` 扩展；不要复用旧 id 改变含义。
5. **英文**：`terms.ts` 目前中文为 canonical；英文只给要点/商店页用，不得声称与中文同等效力（除非另做双语版本并由律师确认）。
6. **插件不使用 terms.ts**：`dsh-famling` 没有桌面 TOS 门禁；其法律说明（独立文件）不产生合同效力。若要产生约束力，需另立插件 TOS/EULA 或并入 DSH 宿主条款。

### 4.3 同批应更新（不属本任务写范围，列给 owner）

| 文件 | 改什么 | 触发点 |
|---|---|---|
| `docs/legal/AI-LABELING.md` | §8 勾选「TOS 有标识方法/样式」；更新「常驻角标移除」律师复核状态 | T-D |
| `docs/legal/APP-DISCLOSURE-TEXTS.md` | 新增 `persona.boundary`/`brief.privacy`/`voice.attestation`/`age.chat` 短文本；标注实现状态 | T-A/T-B/T-E/T-F |
| `docs/legal/CONSUMER-MINORS-HEALTH.md` | §4A/§3 同步「A/B/C 档」与插件年龄门 | T-C/T-F |
| `docs/legal/PRIVACY.md` | 增 Pet Brief 数据项、插件 localStorage、浏览器语音厂商 | T-E |
| `docs/legal/RELEASE-BLOCKERS.md` | A-16 放行条件加「TOS 方法样式 + 插件首启告知 + brief 隐私」 | T-D/插件 |
| `docs/legal/README.md` | 索引加入本文件与插件法律说明 | 文档整理 |

## 5. dsh-famling 专用说明（摘要；全文见 `plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md`）

### 5.1 责任边界（插件形态）

| 主体 | 负责 | 不负责 |
|---|---|---|
| PerryLink（插件发布者） | 插件代码/图标/默认文案/许可/安全设计；插件造成的自身缺陷 | 不运营 DSH 宿主、不控制模型选择、不持久化或记录聊天数据（仅经内存转发给 DSH 模型）、不是 Advisers 运营者 |
| 用户（DSH 宿主运营者） | DSH 安装/模型配置/API Key/账号/合规；聊天输入内容；是否对外使用 | 不因此成为 PerryLink 的代理人 |
| 模型供应商（默认 DeepSeek，可能由用户改配） | 模型输出/审核/留存/跨境（以其条款） | 不对外壳文案/人格设定负责 |
| 浏览器厂商 | 浏览器 SpeechRecognition 的音频处理、系统/浏览器 TTS 音色 | 不控制插件 UI/数据 |
| Advisers 维护者/Producers | Advisers 软件与 Pet Brief 契约/内容 | 不控制插件展示方式 |
| 第三方（被用户服务的人） | — | 不因使用外壳而与 PerryLink 建立关系 |

### 5.2 与桌面 famling 的关键差异（法律上必须分开写）

| 差异 | famling 桌面端 | dsh-famling 插件 | 法律后果 |
|---|---|---|---|
| 聊天引擎 | 无自由 LLM（roleplay 仅本地模板） | **有真实 LLM**（`ctx.llm.stream`，模型来自 DSH） | 插件不能写「不提供自由 LLM 对话」；必须披露文本会发给模型供应商 |
| TTS/ASR | DeepSeek 云 TTS/ASR（用户自备 key，单独同意） | 浏览器 `speechSynthesis` / `SpeechRecognition`（系统/浏览器厂商；插件无 key） | 音频去向/留存取决于浏览器/系统；须在同意文案中写明「可能发送给浏览器厂商」 |
| Advisers 简报 | 5 分钟 TTL/失焦清空/隐私模式（部分） | 只在用户点「读取」时拉取投影，**未校验 expiresAt、未实现 private 折叠/屏幕共享隐藏** | 插件须补隐私语义或默认关闭该功能 |
| 同意/审计 | TOS/年龄/TTS/ASR/roleplay 多门禁 + 审计 | 仅 `localStorage` 两个 key（settings/consent），无版本/哈希/审计 | 插件文书是「告知」不是「合同」；公开分发前建议补首启确认与版本化 |
| 许可 | PolyForm NC + CC BY-NC-SA 美术 | PolyForm NC + CC BY-NC-SA 美术 | 两者都**不是开源**；商业使用需书面许可 |

### 5.3 当前对外表述与事实的偏差（必须在 README/About 修正）

1. README「Host bridge（P0/P1/P2/P4 已实现）」与「未实现 LLM/TTS/ASR/记忆写入」自相矛盾——实际 `op:chat` 已实现并有真实 LLM 调用；应改为准确能力矩阵（echo/brief/chat/task 已实现；roleplay/记忆写入/云 TTS 未实现）。
2. README「插件不保存个人数据；点击计数不持久化」——实际在 `localStorage` 保存 `dsh-famling/settings`（语音/动画/气泡）与 `dsh-famling/consent/v1`（TTS/ASR 同意）；且用户输入会发给模型供应商。应改为「插件不设账号/不上传分析数据；本机保存设置与同意记录；聊天文本会经 DSH 发给你配置的模型供应商」。
3. README「网络请求仅限同源 `/api/famling/bridge`」——`fetch` 确实只有这一处，但浏览器 `SpeechRecognition`/`speechSynthesis` 可能由浏览器厂商/系统处理，不经过插件 fetch。应加一句说明。
4. AI 声明只在输入/设置面板出现，首启/About/语音播放/危机场景缺失。

### 5.4 插件侧最小落地文本（可直接用）

- **首启/升级告知（1 屏）**：「汀岚是 AI 角色，不是真人。聊天回复由你在 DSH 中配置的模型生成，文本会发送给对应模型供应商；语音朗读使用浏览器/系统语音；语音输入可能把音频发送给浏览器厂商。它不是 DeepSeek 官方产品（PerryLink 是插件维护者），不提供专业建议、角色扮演或情感陪伴。设置与同意记录只存本机浏览器；可在设置中清除。求助：110/120，心理援助 12356；问题/侵权：novelnexusai@outlook.com。」
- **About/设置**：完整法律说明链接、许可（PolyForm NC，非开源）、数据流、删除本机数据、举报渠道。
- **TTS 同意（替换现有短句）**：「开启语音朗读会使用浏览器/系统语音合成；音色与是否联网由浏览器/操作系统决定，文本可能被发送给语音服务商。朗读内容是 AI 合成，不是真人录音。可随时关闭。」
- **ASR 同意（替换现有短句）**：「语音输入会把本次录音交给浏览器语音识别处理，**音频可能被发送给浏览器厂商服务器**；仅在点击麦克风后录音，可随时关闭。不同意不会影响打字。」（若浏览器支持本地识别，可注明「部分浏览器支持本地识别」）
- **Brief 提示**：「以下内容来自你本机 Advisers 简报，可能包含客户/同事信息；仅供你本人查看，共享屏幕前请关闭。」

## 6. 发布前检查清单（按优先级）

### P0（任何公开发布/上架/收费/对外服务之前必须完成）

| ID | 检查项 | 验收证据 | 状态 |
|---|---|---|---|
| P0-1 | **首启告知**（桌面已有；插件补）：AI/非真人、模型/语音数据去向、非专业、无 roleplay/情感陪伴、隐私与删除、求助/投诉 | 首次运行截图/测试；版本化文本与确认记录 | 桌面部分有；插件缺 |
| P0-2 | **身份与专业边界条款**（T-A/T-C）进入 TOS，并同步镜像/哈希/测试/安装包 | `node --test` 全绿；TOS.md 版本+哈希一致；安装包内含新 TOS | 拟稿见 §4 |
| P0-3 | **AI 标识方法与样式**（T-D）+ 语音播放器标签/首播提示/图片角标/导出元数据 | 逐项截图/文件元数据检查；`AI-LABELING` §8 勾选 | 桌面部分未落；插件无 |
| P0-4 | **Advisers 简报隐私**：`displayPolicy: private` 折叠+一键隐藏+屏幕共享隐藏；`expiresAt` 过期丢弃；不传 LLM/TTS/导出；显示「可能含他人信息」 | 单测（过期/private/不泄漏）+ 手动屏幕共享测试 | 桌面部分；插件缺（**当前不符合 schema v0.2 的 private 要求**） |
| P0-5 | **声音/人格门禁**（T-B）：无真人克隆/名人仿声/专业头衔/真人肖像；自录音需授权声明且本地 | 配置校验测试 + 文案 | 桌面部分；插件无自录音功能（需确认） |
| P0-6 | **危机资源**：桌面危机卡片；插件 About/首启至少列 12356/110/120，模型输出遇危机给资源 | 危机关键词测试/截图 | 桌面有；插件缺 |
| P0-7 | **禁止对外服务**：TOS/README/NOTICE/插件说明明确 v1 不支持对外专业服务/客服/直播营业 | 文本审查记录 | 拟稿见 §4/§5 |
| P0-8 | **许可与声明随包**：LICENSE/NOTICE/LICENSE-ART/本法律说明进 npm 包与发行物；不得称「开源」；商业许可入口 | `npm pack --dry-run` 清单；README 审查 | 插件 files 含 docs，需核验实际 tarball |
| P0-9 | **修正 README 事实偏差**（§5.3） | diff/审查 | 待改 |
| P0-10 | **本机数据清除**：插件设置/同意清除按钮；桌面「删除全部本地数据」（有残留如实披露） | UI 截图/测试 | 桌面有；插件缺 |

### P1（公开发布后 1–2 个迭代内；律师/平台要求前）

| ID | 检查项 | 说明 |
|---|---|---|
| P1-1 | 年龄门决定：插件聊天保持「工作助手（A 档）」定位，或加自报年龄门（B 档） | 未决定前不得宣传情感陪伴/长期关系；不得宣称已识别未成年人 |
| P1-2 | 名称/商标检索（汀岚/Tinglan/Orca/famling） | 不注册、不暗示官方；「Orca」高风险 |
| P1-3 | 插件/公开仓 TOS 或 EULA（若需要合同效力） | 当前法律说明仅为告知 |
| P1-4 | Takedown/举报流程与 GitHub SECURITY/issue 模板 | 与桌面 TAKEDOWN 对齐 |
| P1-5 | 依赖/第三方许可清单（插件 npm tarball；桌面依赖） | THIRD-PARTY 台账 |
| P1-6 | 商店/DSH 插件市场申报口径（AI、非官方、无 roleplay、数据流） | 与包内声明一致 |
| P1-7 | 隐私政策生效版（桌面）+ 插件隐私说明 | 律师定稿；不得用草案冒充生效 |
| P1-8 | 英文文案复核 | `not affiliated` 与免责措辞 |

### P2（商业化/规模化/境外发行前）

| ID | 检查项 | 说明 |
|---|---|---|
| P2-1 | 律师复核（TOS 新增条款、年龄自报有效性、责任限制、格式条款） | 本文件不是法律意见 |
| P2-2 | 未成年人模式/监护人验证（若面向未成年人） | 《拟人化办法》14/17；无账号形态如何落地待律师 |
| P2-3 | 安全评估/算法备案（若面向境内公众提供生成式 AI/拟人化服务） | 《生成式AI办法》17；《拟人化办法》22；商店核验 |
| P2-4 | 跨境合规（DeepSeek/境外模型/浏览器厂商） | PIPL 38–39；DPA/告知/单独同意 |
| P2-5 | C2PA/XMP/音频元数据管线 | 标识办法 5 条；发布图/音频逐件 |
| P2-6 | 审计留存与投诉处置 SLA（内部目标） | 非证据级；不承诺时限 |
| P2-7 | 商业授权流程（PolyForm NC 商业许可） | 报价/合同/发票/税务 |

## 7. 参考来源与限制

### 7.1 官方来源（2026-11-18 检索/读取）

- 《人工智能拟人化互动服务管理暂行办法》（2026-07-15 施行）：<https://www.gov.cn/gongbao/2026/issue_12806/202606/content_7072472.html>（本次读取第 2、8、10、12–19、21–26 条）。
- 《生成式人工智能服务管理暂行办法》（2023-08-15 施行）：<https://www.gov.cn/zhengce/202311/content_6917778.htm>（本次读取第 2、4、9–15、17、22 条）。
- 《互联网信息服务深度合成管理规定》（2023-01-10 施行）：<https://www.gov.cn/zhengce/zhengceku/2022-12/12/content_5731431.htm>（本次读取第 14–20、23 条）。
- 《人工智能生成合成内容标识办法》（2025-09-01 施行）：<https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm>（本次读取第 2–12 条）。
- 《中华人民共和国个人信息保护法》：<http://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html>（本次读取第 28–31、38–39 条）。
- 《未成年人网络保护条例》（2024-01-01 施行）：<https://www.gov.cn/zhengce/content/202310/content_6911288.htm>（引用项目文档，未逐条核验原文）。
- 《中华人民共和国民法典》第 1023 条（声音参照肖像）、1194–1197 条（通知—反通知）：<http://www.npc.gov.cn/npc/c30834/202006/75ba6483b8344591abd07917e1d25cc8.shtml>（引用项目文档）。
- DeepSeek 开放平台服务协议：<https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html>（本次读取 3.5、3.7、4.1、4.2、2.4 等：开发者须向终端用户告知/取得同意、自行履行 AI 标识义务、对输入/输出负责、输出权利归属与可用范围）。
- MDN《Using the Web Speech API》：<https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API>（语音识别可能把音频发送到服务器处理；部分浏览器支持本地识别）。
- Microsoft Learn《Windows 应用开发者的 SmartScreen 声誉》：<https://learn.microsoft.com/zh-cn/windows/apps/package-and-deploy/smartscreen-reputation>（OV/EV 签名、首次下载警告、EV 不再自动绕过 SmartScreen）。
- GitHub Terms of Service / Acceptable Use / DMCA：<https://docs.github.com/en/site-policy/github-terms/github-terms-of-service>（平台规则；未逐条引用）。
- PolyForm Noncommercial 1.0.0：仓内 `LICENSE`（本次读取全文）+ <https://polyformproject.org/licenses/noncommercial/1.0.0>。
- CC BY-NC-SA 4.0：<https://creativecommons.org/licenses/by-nc-sa/4.0/>（引用 `LICENSE-ART` 全文与项目文档）。
- GB 45438-2025：<https://std.samr.gov.cn/gb/search/gbDetailed?id=301E0388CB75788DE06397BE0A0AE1B4>（仅引用项目文档结论，**未读标准全文**）。

### 7.2 项目内证据

`docs/legal/TOS.md`（v2026-11-17.6 / SHA-256 b3b8e93a…）、`AI-LABELING.md`、`AI-CONTENT-POLICY.md`、`CONSUMER-MINORS-HEALTH.md`、`PRIVACY.md`、`APP-DISCLOSURE-TEXTS.md`、`RELEASE-BLOCKERS.md`、`SAFETY.md`、`TAKEDOWN-AND-REPORTING.md`、`LEGAL-BASELINE.md`；`src/pet/consent/terms.ts`、`hash.ts`、`tests/consent-actions.test.ts`、`tests/legal-user-agency.test.ts`；`scripts/legal-check.mjs`；`plugins/dsh-famling/README.md`、`docs/DETAIL.md`、`index.js`、`client.js`、`test/host-bridge.test.js`；`plugins/advisers/README.md`、`docs/TOS.md`、`docs/DISCLAIMER.md`、`docs/SAFETY.md`、`docs/PRIVACY.md`、`docs/pet-brief/schema-v0.2.json`。

### 7.3 限制与未完成

1. **不是法律意见**：未由执业律师审阅；不得对外称「已合规/已审核/已备案」。
2. **未逐条核验**：《广告法》《反不正当竞争法》《消费者权益保护法》及其实施条例、《未成年人网络保护条例》《刑法》具体条文；引用项目既有研究结论，须律师复核。
3. **未读全文**：GB 45438-2025 标准文本；DeepSeek 用户协议/隐私政策（仅开放平台服务协议）；浏览器厂商具体条款（不同厂商/版本差异）。
4. **未实机复测**：未在真实 Windows/Tauri/DSH Web 环境做红队、屏幕共享、麦克风权限、导出标识验证；插件仅跑 `node --check` + `npm test`（11/11 pass，2026-11-18）。
5. **事实可能变化**：法规/平台政策/供应商条款/版本会变；发布前必须重新核验并更新本文。
6. **分类取决于事实**：是否构成「向境内公众提供」「持续性情感互动」「服务提供者」需结合部署方式、用户范围、收费与功能综合判断，本文件只给风险区间。

> 草案，不是法律意见；不得用本文替代正式用户协议、隐私政策或律师意见。